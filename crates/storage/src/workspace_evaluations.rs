//! Task-specific attributed quality evidence, separate from execution success.
use crate::{Principal, Store, StoreError, TenantScope};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use uuid::Uuid;

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EvaluationSample {
    pub reference: String,
    pub request_sha256: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EvaluationDefinition {
    pub slug: String,
    pub name: String,
    pub task: String,
    pub rubric: String,
    pub protocol: String,
    pub revision: i64,
    pub samples: Vec<EvaluationSample>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EvaluationBinding {
    pub evaluation_slug: String,
    pub evaluation_revision: i64,
    pub sample: String,
    pub protocol: String,
    pub request_sha256: String,
}
fn protocol(value: &str) -> bool {
    [
        "chat",
        "responses",
        "messages",
        "embeddings",
        "generate_content",
    ]
    .contains(&value)
}
fn reference(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 100
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"-_.".contains(&byte))
}
fn digest(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}
impl EvaluationDefinition {
    pub fn validate(&self) -> Result<(), StoreError> {
        if !crate::is_valid_pool_slug(&self.slug)
            || matches!(self.slug.as_str(), "runs" | "compare")
            || self.name.trim().is_empty()
            || self.name.trim() != self.name
            || self.name.len() > 200
            || self.task.trim().is_empty()
            || self.task.len() > 4000
            || self.rubric.trim().is_empty()
            || self.rubric.len() > 8000
            || !protocol(&self.protocol)
            || !(0..9_007_199_254_740_991).contains(&self.revision)
            || self.samples.is_empty()
            || self.samples.len() > 64
        {
            return Err(StoreError::InvalidObservation);
        }
        let mut references = std::collections::BTreeSet::new();
        if self.samples.iter().any(|sample| {
            !reference(&sample.reference)
                || !digest(&sample.request_sha256)
                || !references.insert(&sample.reference)
        }) {
            return Err(StoreError::InvalidObservation);
        }
        Ok(())
    }
}
/// Versioned opt-in fingerprint, no raw text retained. Transport/correlation
/// fields cannot make the same effective task appear to be a different sample.
pub fn evaluation_request_fingerprint(
    protocol_name: &str,
    body: &Value,
) -> Result<String, StoreError> {
    if !protocol(protocol_name) {
        return Err(StoreError::InvalidObservation);
    }
    let mut object = body
        .as_object()
        .cloned()
        .ok_or(StoreError::InvalidObservation)?;
    for field in ["model", "stream", "stream_options", "metadata", "user"] {
        object.remove(field);
    }
    let mut hasher = Sha256::new();
    hasher.update(b"niu.evaluation.request.v1\0");
    hasher.update(protocol_name.as_bytes());
    hasher.update(b"\0");
    hasher.update(
        serde_json::to_vec(&canonical(Value::Object(object)))
            .map_err(|_| StoreError::InvalidObservation)?,
    );
    Ok(format!("{:x}", hasher.finalize()))
}
pub(super) fn canonical(value: Value) -> Value {
    match value {
        Value::Object(object) => {
            let mut pairs: Vec<_> = object.into_iter().collect();
            pairs.sort_by(|left, right| left.0.cmp(&right.0));
            Value::Object(
                pairs
                    .into_iter()
                    .map(|(key, value)| (key, canonical(value)))
                    .collect(),
            )
        }
        Value::Array(values) => Value::Array(values.into_iter().map(canonical).collect()),
        other => other,
    }
}
impl Store {
    pub async fn evaluation_definition(
        &self,
        scope: TenantScope,
        slug: &str,
        revision: Option<i64>,
    ) -> Result<Option<EvaluationDefinition>, StoreError> {
        let value: Option<Value> = if let Some(revision) = revision {
            sqlx::query_scalar("SELECT configuration FROM workspace_evaluation_history WHERE organization_id=$1 AND project_id=$2 AND slug=$3 AND revision=$4").bind(scope.organization_id).bind(scope.project_id).bind(slug).bind(revision).fetch_optional(&self.pool).await?
        } else {
            sqlx::query_scalar("SELECT configuration FROM workspace_evaluations WHERE organization_id=$1 AND project_id=$2 AND slug=$3").bind(scope.organization_id).bind(scope.project_id).bind(slug).fetch_optional(&self.pool).await?
        };
        value
            .map(|value| serde_json::from_value(value).map_err(|_| StoreError::InvalidObservation))
            .transpose()
    }
    pub async fn evaluation_definitions(
        &self,
        scope: TenantScope,
        after: Option<&str>,
    ) -> Result<Vec<EvaluationDefinition>, StoreError> {
        let values:Vec<Value>=sqlx::query_scalar("SELECT configuration FROM workspace_evaluations WHERE organization_id=$1 AND project_id=$2 AND ($3::text IS NULL OR slug>$3) ORDER BY slug LIMIT 101").bind(scope.organization_id).bind(scope.project_id).bind(after).fetch_all(&self.pool).await?;
        values
            .into_iter()
            .map(|value| serde_json::from_value(value).map_err(|_| StoreError::InvalidObservation))
            .collect()
    }
    pub async fn set_evaluation_definition(
        &self,
        principal: &Principal,
        input: &EvaluationDefinition,
    ) -> Result<EvaluationDefinition, StoreError> {
        input.validate()?;
        let scope = principal.scope();
        let mut tx = self.begin_bounded_recording().await?;
        Self::require_agent_capability_in_tx(&mut tx, principal, "evaluations:write", &[]).await?;
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))")
            .bind(format!(
                "evaluation:{}:{}:{}",
                scope.organization_id, scope.project_id, input.slug
            ))
            .execute(&mut *tx)
            .await?;
        let revision:Option<i64>=sqlx::query_scalar("SELECT revision FROM workspace_evaluations WHERE organization_id=$1 AND project_id=$2 AND slug=$3 FOR UPDATE").bind(scope.organization_id).bind(scope.project_id).bind(&input.slug).fetch_optional(&mut *tx).await?;
        if revision.unwrap_or(0) != input.revision {
            return Err(StoreError::Conflict);
        }
        let mut saved = input.clone();
        saved.revision += 1;
        let value = serde_json::to_value(&saved).map_err(|_| StoreError::InvalidObservation)?;
        sqlx::query("INSERT INTO workspace_evaluations(organization_id,project_id,slug,revision,configuration) VALUES($1,$2,$3,$4,$5) ON CONFLICT(organization_id,project_id,slug) DO UPDATE SET revision=EXCLUDED.revision,configuration=EXCLUDED.configuration").bind(scope.organization_id).bind(scope.project_id).bind(&saved.slug).bind(saved.revision).bind(&value).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO workspace_evaluation_history(organization_id,project_id,slug,revision,configuration,actor_key_id) VALUES($1,$2,$3,$4,$5,$6)").bind(scope.organization_id).bind(scope.project_id).bind(&saved.slug).bind(saved.revision).bind(value).bind(principal.key_id()).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(saved)
    }
    pub async fn set_evaluation_definition_for_scope(
        &self,
        scope: TenantScope,
        input: &EvaluationDefinition,
    ) -> Result<EvaluationDefinition, StoreError> {
        input.validate()?;
        let mut tx = self.begin_bounded_recording().await?;
        sqlx::query(
            "ALTER TABLE workspace_evaluation_history ALTER COLUMN actor_key_id DROP NOT NULL",
        )
        .execute(&mut *tx)
        .await?;
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))")
            .bind(format!(
                "evaluation:{}:{}:{}",
                scope.organization_id, scope.project_id, input.slug
            ))
            .execute(&mut *tx)
            .await?;
        let revision: Option<i64> = sqlx::query_scalar(
            "SELECT revision FROM workspace_evaluations WHERE organization_id=$1 AND project_id=$2 AND slug=$3 FOR UPDATE",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(&input.slug)
        .fetch_optional(&mut *tx)
        .await?;
        if revision.unwrap_or(0) != input.revision {
            return Err(StoreError::Conflict);
        }
        let mut saved = input.clone();
        saved.revision += 1;
        let value = serde_json::to_value(&saved).map_err(|_| StoreError::InvalidObservation)?;
        sqlx::query("INSERT INTO workspace_evaluations(organization_id,project_id,slug,revision,configuration) VALUES($1,$2,$3,$4,$5) ON CONFLICT(organization_id,project_id,slug) DO UPDATE SET revision=EXCLUDED.revision,configuration=EXCLUDED.configuration")
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .bind(&saved.slug)
            .bind(saved.revision)
            .bind(&value)
            .execute(&mut *tx)
            .await?;
        sqlx::query("INSERT INTO workspace_evaluation_history(organization_id,project_id,slug,revision,configuration,actor_key_id) VALUES($1,$2,$3,$4,$5,$6)")
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .bind(&saved.slug)
            .bind(saved.revision)
            .bind(value)
            .bind(None::<Uuid>)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(saved)
    }
    /// Lexical attempt cursor pages the current set. Restart from the first page
    /// when checking for newly admitted work; this is not an incremental feed.
    pub async fn evaluation_attempts(
        &self,
        scope: TenantScope,
        evaluation: &str,
        revision: i64,
        sample: &str,
        after: Option<Uuid>,
    ) -> Result<Vec<Value>, StoreError> {
        Ok(sqlx::query_scalar("SELECT jsonb_build_object('attempt_id',b.attempt_id,'operation_id',a.operation_id,'bound_at',b.created_at,'request_sha256',b.request_sha256,'execution',a.execution,'completed_at',a.completed_at) FROM evaluation_attempt_bindings b JOIN attempts a ON a.id=b.attempt_id AND a.organization_id=b.organization_id AND a.project_id=b.project_id WHERE b.organization_id=$1 AND b.project_id=$2 AND b.evaluation_slug=$3 AND b.evaluation_revision=$4 AND b.sample=$5 AND ($6::uuid IS NULL OR b.attempt_id>$6) ORDER BY b.attempt_id LIMIT 101").bind(scope.organization_id).bind(scope.project_id).bind(evaluation).bind(revision).bind(sample).bind(after).fetch_all(&self.pool).await?)
    }
    pub async fn evaluation_attempt_binding(
        &self,
        scope: TenantScope,
        attempt: Uuid,
    ) -> Result<Option<Value>, StoreError> {
        Ok(sqlx::query_scalar("SELECT jsonb_build_object('evaluation_slug',evaluation_slug,'evaluation_revision',evaluation_revision,'sample',sample,'protocol',protocol,'request_sha256',request_sha256,'fingerprint_version',fingerprint_version,'bound_at',created_at) FROM evaluation_attempt_bindings WHERE organization_id=$1 AND project_id=$2 AND attempt_id=$3").bind(scope.organization_id).bind(scope.project_id).bind(attempt).fetch_optional(&self.pool).await?)
    }
    pub(crate) async fn insert_evaluation_binding_in_tx(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        scope: TenantScope,
        key: Uuid,
        attempt: Uuid,
        binding: &EvaluationBinding,
    ) -> Result<(), StoreError> {
        Self::require_agent_key_capability_in_tx(tx, scope, key, "evaluations:read", &[])
            .await
            .map_err(|error| match error {
                StoreError::Unauthorized => StoreError::EvaluationGrantRequired,
                other => other,
            })?;
        let value:Option<Value>=sqlx::query_scalar("SELECT configuration FROM workspace_evaluation_history WHERE organization_id=$1 AND project_id=$2 AND slug=$3 AND revision=$4").bind(scope.organization_id).bind(scope.project_id).bind(&binding.evaluation_slug).bind(binding.evaluation_revision).fetch_optional(&mut **tx).await?;
        let definition: EvaluationDefinition =
            serde_json::from_value(value.ok_or(StoreError::EvaluationBindingMismatch)?)
                .map_err(|_| StoreError::InvalidObservation)?;
        if definition.protocol != binding.protocol
            || !definition.samples.iter().any(|sample| {
                sample.reference == binding.sample
                    && sample.request_sha256 == binding.request_sha256
            })
        {
            return Err(StoreError::EvaluationBindingMismatch);
        }
        sqlx::query("INSERT INTO evaluation_attempt_bindings(organization_id,project_id,attempt_id,evaluation_slug,evaluation_revision,sample,protocol,request_sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8)").bind(scope.organization_id).bind(scope.project_id).bind(attempt).bind(&binding.evaluation_slug).bind(binding.evaluation_revision).bind(&binding.sample).bind(&binding.protocol).bind(&binding.request_sha256).execute(&mut **tx).await?;
        Ok(())
    }
}
