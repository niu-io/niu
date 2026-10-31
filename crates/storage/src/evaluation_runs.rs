//! Immutable attributed judgments and customer-safe execution snapshots.
use crate::{
    EvaluationDefinition, GatewayActivityFilter, Principal, Store, StoreError, TenantScope,
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::Row;
use std::collections::BTreeSet;
use uuid::Uuid;

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EvaluationEvaluator {
    pub kind: String,
    pub name: String,
    pub version: String,
}
#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EvaluationVerdict {
    Accepted,
    Rejected,
    Unknown,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EvaluationResult {
    pub sample: String,
    pub attempt_id: Uuid,
    pub verdict: EvaluationVerdict,
    pub reason: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EvaluationRunSubmission {
    pub slug: String,
    pub name: String,
    pub evaluation_revision: i64,
    pub evaluator: EvaluationEvaluator,
    pub results: Vec<EvaluationResult>,
}
impl EvaluationRunSubmission {
    pub fn validate(&self) -> Result<(), StoreError> {
        if !crate::is_valid_pool_slug(&self.slug)
            || self.name.trim().is_empty()
            || self.name.trim() != self.name
            || self.name.len() > 200
            || !(1..=9_007_199_254_740_991).contains(&self.evaluation_revision)
            || !["agent", "check"].contains(&self.evaluator.kind.as_str())
            || [&self.evaluator.name, &self.evaluator.version]
                .iter()
                .any(|value| {
                    value.trim().is_empty() || value.trim() != value.as_str() || value.len() > 200
                })
            || self.results.is_empty()
            || self.results.len() > 64
        {
            return Err(StoreError::InvalidObservation);
        }
        let mut samples = BTreeSet::new();
        let mut attempts = BTreeSet::new();
        if self.results.iter().any(|row| {
            !samples.insert(&row.sample)
                || !attempts.insert(row.attempt_id)
                || row.reason.as_ref().is_some_and(|value| value.len() > 2000)
        }) {
            return Err(StoreError::InvalidObservation);
        }
        Ok(())
    }
}
impl Store {
    pub async fn compare_evaluation_runs(
        &self,
        scope: TenantScope,
        evaluation: &str,
        left: &str,
        right: &str,
    ) -> Result<Option<Value>, StoreError> {
        let Some(left) = self.evaluation_run(scope, evaluation, left).await? else {
            return Ok(None);
        };
        let Some(right) = self.evaluation_run(scope, evaluation, right).await? else {
            return Ok(None);
        };
        Ok(Some(crate::evaluation_summary::compare(&left, &right)))
    }

    pub async fn evaluation_run(
        &self,
        scope: TenantScope,
        evaluation: &str,
        run: &str,
    ) -> Result<Option<Value>, StoreError> {
        Ok(sqlx::query_scalar("SELECT evidence FROM workspace_evaluation_runs WHERE organization_id=$1 AND project_id=$2 AND evaluation_slug=$3 AND slug=$4").bind(scope.organization_id).bind(scope.project_id).bind(evaluation).bind(run).fetch_optional(&self.pool).await?)
    }
    pub async fn evaluation_runs(
        &self,
        scope: TenantScope,
        evaluation: &str,
        after: Option<&str>,
    ) -> Result<Vec<Value>, StoreError> {
        Ok(sqlx::query_scalar("SELECT jsonb_build_object('slug',slug,'name',evidence->>'name','evaluation_revision',evaluation_revision,'created_at',created_at,'evaluator',evidence->'evaluator','summary',evidence->'summary') FROM workspace_evaluation_runs WHERE organization_id=$1 AND project_id=$2 AND evaluation_slug=$3 AND ($4::text IS NULL OR slug>$4) ORDER BY slug LIMIT 101").bind(scope.organization_id).bind(scope.project_id).bind(evaluation).bind(after).fetch_all(&self.pool).await?)
    }
    /// No inference/HTTP occurs in this transaction. Retry once only when SQL
    /// proves a concurrent snapshot/uniqueness conflict rolled back; never retry
    /// an uncertain commit or refresh an existing immutable receipt implicitly.
    pub async fn record_evaluation_run(
        &self,
        principal: &Principal,
        evaluation: &str,
        input: &EvaluationRunSubmission,
    ) -> Result<Value, StoreError> {
        input.validate()?;
        for retry in 0..2 {
            let result = self
                .record_evaluation_run_once(principal, evaluation, input)
                .await;
            let concurrency=result.as_ref().err().is_some_and(|error|matches!(error,StoreError::Database(sqlx::Error::Database(error)) if matches!(error.code().as_deref(),Some("40001"|"23505"))));
            if retry == 0 && concurrency {
                continue;
            }
            return result;
        }
        Err(StoreError::Conflict)
    }
    async fn record_evaluation_run_once(
        &self,
        principal: &Principal,
        evaluation: &str,
        input: &EvaluationRunSubmission,
    ) -> Result<Value, StoreError> {
        let scope = principal.scope();
        let submission = serde_json::to_value(input).map_err(|_| StoreError::InvalidObservation)?;
        let digest = format!(
            "{:x}",
            Sha256::digest(
                serde_json::to_vec(&crate::workspace_evaluations::canonical(submission.clone()))
                    .map_err(|_| StoreError::InvalidObservation)?
            )
        );
        let mut tx=self.pool.begin_with("BEGIN ISOLATION LEVEL REPEATABLE READ; SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='5s'; SET LOCAL jit=off").await?;
        Self::require_agent_capability_in_tx(&mut tx, principal, "evaluations:write", &[]).await?;
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))")
            .bind(format!(
                "evaluation-run:{}:{}:{}:{}",
                scope.organization_id, scope.project_id, evaluation, input.slug
            ))
            .execute(&mut *tx)
            .await?;
        if let Some(existing)=sqlx::query("SELECT request_sha256,evidence FROM workspace_evaluation_runs WHERE organization_id=$1 AND project_id=$2 AND evaluation_slug=$3 AND slug=$4").bind(scope.organization_id).bind(scope.project_id).bind(evaluation).bind(&input.slug).fetch_optional(&mut *tx).await? {
            if existing.try_get::<String,_>("request_sha256")?!=digest {return Err(StoreError::Conflict);}
            let evidence=existing.try_get("evidence")?;tx.commit().await?;return Ok(evidence);
        }
        let definition:Option<Value>=sqlx::query_scalar("SELECT configuration FROM workspace_evaluation_history WHERE organization_id=$1 AND project_id=$2 AND slug=$3 AND revision=$4").bind(scope.organization_id).bind(scope.project_id).bind(evaluation).bind(input.evaluation_revision).fetch_optional(&mut *tx).await?;
        let definition: EvaluationDefinition =
            serde_json::from_value(definition.ok_or(StoreError::EvaluationBindingMismatch)?)
                .map_err(|_| StoreError::InvalidObservation)?;
        let submitter: String = sqlx::query_scalar("SELECT name FROM api_keys WHERE id=$1")
            .bind(principal.key_id())
            .fetch_one(&mut *tx)
            .await?;
        let mut results = Vec::new();
        let mut operations = BTreeSet::new();
        for result in &input.results {
            let sample = definition
                .samples
                .iter()
                .find(|sample| sample.reference == result.sample)
                .ok_or(StoreError::EvaluationBindingMismatch)?;
            let operation:Option<Uuid>=sqlx::query_scalar("SELECT operation_id FROM attempts WHERE organization_id=$1 AND project_id=$2 AND id=$3").bind(scope.organization_id).bind(scope.project_id).bind(result.attempt_id).fetch_optional(&mut *tx).await?;
            let operation = operation.ok_or(StoreError::EvaluationBindingMismatch)?;
            if !operations.insert(operation) {
                return Err(StoreError::InvalidObservation);
            }
            let binding:Option<Value>=sqlx::query_scalar("SELECT jsonb_build_object('evaluation_slug',evaluation_slug,'evaluation_revision',evaluation_revision,'sample',sample,'protocol',protocol,'request_sha256',request_sha256,'fingerprint_version',fingerprint_version) FROM evaluation_attempt_bindings WHERE organization_id=$1 AND project_id=$2 AND attempt_id=$3").bind(scope.organization_id).bind(scope.project_id).bind(result.attempt_id).fetch_optional(&mut *tx).await?;
            if binding.as_ref().is_some_and(|binding| {
                binding["request_sha256"] != sample.request_sha256
                    || binding["protocol"] != definition.protocol
            }) {
                return Err(StoreError::EvaluationBindingMismatch);
            }
            let input_match = if binding.is_some() {
                "verified"
            } else {
                "unverified"
            };
            let attempts = Self::gateway_activity_selection_on(
                &mut tx,
                scope,
                None,
                33,
                &GatewayActivityFilter {
                    operation_id: Some(operation),
                    ..Default::default()
                },
                None,
            )
            .await?;
            if attempts.is_empty() || attempts.len() > 32 {
                return Err(StoreError::InvalidObservation);
            }
            let mut snapshots = Vec::new();
            let mut evaluated_duration = None;
            for attempt in attempts {
                if attempt.attempt_id == result.attempt_id {
                    evaluated_duration = attempt.duration_ms;
                }
                let route:Value=sqlx::query_scalar("SELECT jsonb_build_object('route_revision',a.offer_revision,'routing_generation',g.generation,'model_mapping_revision',COALESCE(m.model_revision,p.model_revision)) FROM attempts a LEFT JOIN attempt_route_generations g ON g.attempt_id=a.id LEFT JOIN managed_attempt_routes m ON m.attempt_id=a.id LEFT JOIN personal_attempt_routes p ON p.attempt_id=a.id WHERE a.id=$1").bind(attempt.attempt_id).fetch_one(&mut *tx).await?;
                snapshots.push(json!({"attempt_id":attempt.attempt_id,"model":attempt.model,"provider_model":attempt.provider_model,"execution":attempt.execution,"usage_confidence":attempt.usage_confidence,
                    "created_at":attempt.created_at,"dispatched_at":attempt.dispatched_at,"completed_at":attempt.completed_at,"duration_ms":attempt.duration_ms,"timing":attempt.timing,"configuration":route,
                    "usage":{"prompt_tokens":attempt.prompt_tokens,"completion_tokens":attempt.completion_tokens,"cached_input_tokens":attempt.cached_input_tokens,"cache_write_input_tokens":attempt.cache_write_input_tokens,"reasoning_output_tokens":attempt.reasoning_output_tokens},
                    "customer_charge":{"status":attempt.customer_charge_status,"currency":attempt.customer_charge_currency,"amount_nanos":attempt.customer_charge_nanos,"unit":attempt.customer_unit_charge},
                    "finish_reasons":attempt.finish_reasons,"failure":attempt.failure,"output_guardrail_outcome":attempt.output_guardrail_outcome}));
            }
            let pool:Vec<Value>=sqlx::query_scalar("SELECT jsonb_build_object('slug',pool_slug,'revision',pool_revision,'selected_model',selected_model) FROM workspace_pool_selections WHERE organization_id=$1 AND project_id=$2 AND operation_id=$3 ORDER BY created_at,id").bind(scope.organization_id).bind(scope.project_id).bind(operation).fetch_all(&mut *tx).await?;
            results.push(json!({"sample":result.sample,"request_sha256":sample.request_sha256,"input_match":input_match,"source_binding":binding,"evaluated_attempt_id":result.attempt_id,"operation_id":operation,"judgment":{"verdict":result.verdict,"reason":result.reason,"source":"submitter_reported"},"duration_ms":evaluated_duration,"attempts":snapshots,"pool_selections":pool}));
        }
        let started:String=sqlx::query_scalar("SELECT to_char(transaction_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"')").fetch_one(&mut *tx).await?;
        let finished:String=sqlx::query_scalar("SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"')").fetch_one(&mut *tx).await?;
        let summary = crate::evaluation_summary::summarize(&results);
        let evidence = json!({"slug":input.slug,"name":input.name,"evaluation":evaluation,"evaluation_revision":input.evaluation_revision,"definition":definition,"evaluator":input.evaluator,"submitter":{"kind":"delegated_agent_key","label":submitter,"key_id":principal.key_id()},"capture":{"consistency":"repeatable_read","started_at":started,"finished_at":finished},"results":results,"summary":summary});
        sqlx::query("INSERT INTO workspace_evaluation_runs(organization_id,project_id,evaluation_slug,evaluation_revision,slug,request_sha256,submission,evidence,actor_key_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)").bind(scope.organization_id).bind(scope.project_id).bind(evaluation).bind(input.evaluation_revision).bind(&input.slug).bind(digest).bind(submission).bind(&evidence).bind(principal.key_id()).execute(&mut *tx).await?;
        Self::emit_evaluation_event_in_tx(
            &mut tx,
            scope,
            evaluation,
            input.evaluation_revision,
            &input.slug,
        )
        .await?;
        tx.commit().await?;
        Ok(evidence)
    }
}
