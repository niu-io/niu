//! Customer-owned model policies contain no Provider configuration or prices.
use crate::{
    Principal, RoutePoolCandidate, RoutePoolDefaultAction, RoutePoolRule, Store, StoreError,
    TenantScope, WorkspaceRoutingStrategy,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WorkspaceModelPool {
    pub slug: String,
    pub name: String,
    pub description: String,
    pub enabled: bool,
    /// Current revision for reads, expected revision for writes; zero creates.
    pub revision: i64,
    pub candidates: Vec<RoutePoolCandidate>,
    #[serde(default)]
    pub rules: Vec<RoutePoolRule>,
    #[serde(default)]
    pub default_action: RoutePoolDefaultAction,
    /// Omitted legacy configurations resolve to version 1 priority/weight.
    #[serde(default)]
    pub strategy: WorkspaceRoutingStrategy,
}
impl WorkspaceModelPool {
    pub fn validate(&self) -> Result<std::collections::BTreeSet<String>, StoreError> {
        if !crate::is_valid_pool_slug(&self.slug)
            || self.name.trim().is_empty()
            || self.name.trim() != self.name
            || self.name.len() > 200
            || self.description.len() > 4000
            || !(0..9_007_199_254_740_991).contains(&self.revision)
        {
            return Err(StoreError::InvalidVendor);
        }
        let aliases = crate::validate_pool_candidates_and_rules(&self.candidates, &self.rules)?;
        self.strategy
            .validate_against_candidates(&aliases.iter().cloned().collect::<Vec<_>>())?;
        if aliases.iter().any(|alias| alias.starts_with("pool/")) {
            return Err(StoreError::InvalidVendor);
        }
        Ok(aliases)
    }
}
impl Store {
    /// Revalidate and lock delegated authority in the same transaction as a write.
    pub(crate) async fn require_agent_capability_in_tx(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        principal: &Principal,
        capability: &str,
        required_models: &[String],
    ) -> Result<(), StoreError> {
        Self::require_agent_key_capability_in_tx(
            tx,
            principal.scope(),
            principal.key_id(),
            capability,
            required_models,
        )
        .await
    }
    pub(crate) async fn require_agent_key_capability_in_tx(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        scope: TenantScope,
        key: Uuid,
        capability: &str,
        required_models: &[String],
    ) -> Result<(), StoreError> {
        let allowed:Option<Uuid>=sqlx::query_scalar("SELECT k.id FROM agent_key_capabilities c JOIN api_keys k ON k.id=c.key_id JOIN agent_authorizations a ON a.id=c.authorization_id JOIN admin_operators o ON o.id=a.approved_by WHERE c.key_id=$1 AND k.organization_id=$2 AND k.project_id=$3 AND c.capability=$4 AND k.revoked_at IS NULL AND k.expires_at>clock_timestamp() AND o.revoked_at IS NULL AND o.role IN ('owner','admin') AND o.organization_id=k.organization_id AND (o.project_id IS NULL OR o.project_id=k.project_id) AND (k.allowed_models=ARRAY['*']::text[] OR k.allowed_models @> $5::text[]) FOR SHARE OF k,o")
            .bind(key).bind(scope.organization_id).bind(scope.project_id).bind(capability).bind(required_models).fetch_optional(&mut **tx).await?;
        allowed.ok_or(StoreError::Unauthorized)?;
        Ok(())
    }
    pub async fn workspace_model_pool(
        &self,
        scope: TenantScope,
        slug: &str,
    ) -> Result<Option<WorkspaceModelPool>, StoreError> {
        let value:Option<serde_json::Value>=sqlx::query_scalar("SELECT configuration FROM workspace_model_pools WHERE organization_id=$1 AND project_id=$2 AND slug=$3 AND deleted_at IS NULL")
            .bind(scope.organization_id).bind(scope.project_id).bind(slug).fetch_optional(&self.pool).await?;
        value
            .map(serde_json::from_value)
            .transpose()
            .map_err(|_| StoreError::InvalidVendor)
    }
    pub async fn workspace_model_pools(
        &self,
        scope: TenantScope,
        after: Option<&str>,
    ) -> Result<Vec<WorkspaceModelPool>, StoreError> {
        let values:Vec<serde_json::Value>=sqlx::query_scalar("SELECT configuration FROM workspace_model_pools WHERE organization_id=$1 AND project_id=$2 AND deleted_at IS NULL AND ($3::text IS NULL OR slug>$3) ORDER BY slug LIMIT 101")
            .bind(scope.organization_id).bind(scope.project_id).bind(after).fetch_all(&self.pool).await?;
        values
            .into_iter()
            .map(|value| serde_json::from_value(value).map_err(|_| StoreError::InvalidVendor))
            .collect()
    }
    pub async fn set_workspace_model_pool(
        &self,
        principal: &Principal,
        input: &WorkspaceModelPool,
    ) -> Result<WorkspaceModelPool, StoreError> {
        let aliases = input.validate()?;
        if aliases.iter().any(|alias| !principal.allows_model(alias)) {
            return Err(StoreError::Unauthorized);
        }
        let scope = principal.scope();
        let mut tx = self.begin_bounded_recording().await?;
        Self::require_agent_capability_in_tx(
            &mut tx,
            principal,
            "pools:write",
            &aliases.into_iter().collect::<Vec<_>>(),
        )
        .await?;
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))")
            .bind(format!(
                "workspace-pool:{}:{}:{}",
                scope.organization_id, scope.project_id, input.slug
            ))
            .execute(&mut *tx)
            .await?;
        let existing:Option<(i64,bool)>=sqlx::query_as("SELECT revision, deleted_at IS NOT NULL FROM workspace_model_pools WHERE organization_id=$1 AND project_id=$2 AND slug=$3 FOR UPDATE").bind(scope.organization_id).bind(scope.project_id).bind(&input.slug).fetch_optional(&mut *tx).await?;
        let revision = match existing {
            Some((_, true)) => return Err(StoreError::Conflict),
            Some((revision, false)) => revision,
            None => 0,
        };
        if revision != input.revision {
            return Err(StoreError::Conflict);
        }
        let mut saved = input.clone();
        saved.revision += 1;
        let config = serde_json::to_value(&saved).map_err(|_| StoreError::InvalidVendor)?;
        sqlx::query("INSERT INTO workspace_model_pools(organization_id,project_id,slug,revision,configuration) VALUES($1,$2,$3,$4,$5) ON CONFLICT(organization_id,project_id,slug) DO UPDATE SET revision=EXCLUDED.revision,configuration=EXCLUDED.configuration,updated_at=clock_timestamp()")
            .bind(scope.organization_id).bind(scope.project_id).bind(&saved.slug).bind(saved.revision).bind(&config).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO workspace_model_pool_history(organization_id,project_id,slug,revision,configuration,actor_key_id) VALUES($1,$2,$3,$4,$5,$6)")
            .bind(scope.organization_id).bind(scope.project_id).bind(&saved.slug).bind(saved.revision).bind(config).bind(principal.key_id()).execute(&mut *tx).await?;
        Self::emit_pool_event_in_tx(&mut tx, scope, &saved.slug, saved.revision).await?;
        tx.commit().await?;
        Ok(saved)
    }
    /// Soft-delete a customer pool. The immutable history and named slug stay
    /// reserved so historical selections and audit references remain valid.
    pub async fn delete_workspace_model_pool(
        &self,
        principal: &Principal,
        slug: &str,
        expected_revision: i64,
    ) -> Result<(), StoreError> {
        if !crate::is_valid_pool_slug(slug) || expected_revision < 1 {
            return Err(StoreError::InvalidVendor);
        }
        let scope = principal.scope();
        let mut tx = self.begin_bounded_recording().await?;
        Self::require_agent_capability_in_tx(&mut tx, principal, "pools:write", &[]).await?;
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))")
            .bind(format!(
                "workspace-pool:{}:{}:{}",
                scope.organization_id, scope.project_id, slug
            ))
            .execute(&mut *tx)
            .await?;
        let revision: Option<i64> = sqlx::query_scalar(
            "SELECT revision FROM workspace_model_pools WHERE organization_id=$1 AND project_id=$2 AND slug=$3 AND deleted_at IS NULL FOR UPDATE",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(slug)
        .fetch_optional(&mut *tx)
        .await?;
        if revision != Some(expected_revision) {
            return Err(StoreError::Conflict);
        }
        sqlx::query(
            "UPDATE workspace_model_pools SET deleted_at=clock_timestamp() WHERE organization_id=$1 AND project_id=$2 AND slug=$3",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(slug)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn delete_workspace_model_pool_for_scope(
        &self,
        scope: TenantScope,
        slug: &str,
        expected_revision: i64,
    ) -> Result<(), StoreError> {
        if !crate::is_valid_pool_slug(slug) || expected_revision < 1 {
            return Err(StoreError::InvalidVendor);
        }
        let mut tx = self.begin_bounded_recording().await?;
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))")
            .bind(format!(
                "workspace-pool:{}:{}:{}",
                scope.organization_id, scope.project_id, slug
            ))
            .execute(&mut *tx)
            .await?;
        let revision: Option<i64> = sqlx::query_scalar(
            "SELECT revision FROM workspace_model_pools WHERE organization_id=$1 AND project_id=$2 AND slug=$3 AND deleted_at IS NULL FOR UPDATE",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(slug)
        .fetch_optional(&mut *tx)
        .await?;
        if revision != Some(expected_revision) {
            return Err(StoreError::Conflict);
        }
        sqlx::query(
            "UPDATE workspace_model_pools SET deleted_at=clock_timestamp() WHERE organization_id=$1 AND project_id=$2 AND slug=$3",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(slug)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn set_workspace_model_pool_for_scope(
        &self,
        scope: TenantScope,
        input: &WorkspaceModelPool,
    ) -> Result<WorkspaceModelPool, StoreError> {
        input.validate()?;
        let mut tx = self.begin_bounded_recording().await?;
        sqlx::query(
            "ALTER TABLE workspace_model_pool_history ALTER COLUMN actor_key_id DROP NOT NULL",
        )
        .execute(&mut *tx)
        .await?;
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))")
            .bind(format!(
                "workspace-pool:{}:{}:{}",
                scope.organization_id, scope.project_id, input.slug
            ))
            .execute(&mut *tx)
            .await?;
        let revision: Option<i64> = sqlx::query_scalar(
            "SELECT revision FROM workspace_model_pools WHERE organization_id=$1 AND project_id=$2 AND slug=$3 FOR UPDATE",
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
        let config = serde_json::to_value(&saved).map_err(|_| StoreError::InvalidVendor)?;
        sqlx::query("INSERT INTO workspace_model_pools(organization_id,project_id,slug,revision,configuration) VALUES($1,$2,$3,$4,$5) ON CONFLICT(organization_id,project_id,slug) DO UPDATE SET revision=EXCLUDED.revision,configuration=EXCLUDED.configuration,updated_at=clock_timestamp()")
            .bind(scope.organization_id).bind(scope.project_id).bind(&saved.slug).bind(saved.revision).bind(&config).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO workspace_model_pool_history(organization_id,project_id,slug,revision,configuration,actor_key_id) VALUES($1,$2,$3,$4,$5,$6)")
            .bind(scope.organization_id).bind(scope.project_id).bind(&saved.slug).bind(saved.revision).bind(config).bind(Option::<Uuid>::None).execute(&mut *tx).await?;
        Self::emit_pool_event_in_tx(&mut tx, scope, &saved.slug, saved.revision).await?;
        tx.commit().await?;
        Ok(saved)
    }
    pub async fn workspace_model_pool_history(
        &self,
        scope: TenantScope,
        slug: &str,
        before: Option<i64>,
    ) -> Result<Vec<WorkspaceModelPool>, StoreError> {
        let values:Vec<serde_json::Value>=sqlx::query_scalar("SELECT configuration FROM workspace_model_pool_history WHERE organization_id=$1 AND project_id=$2 AND slug=$3 AND ($4::bigint IS NULL OR revision<$4) ORDER BY revision DESC LIMIT 100")
            .bind(scope.organization_id).bind(scope.project_id).bind(slug).bind(before).fetch_all(&self.pool).await?;
        values
            .into_iter()
            .map(|value| serde_json::from_value(value).map_err(|_| StoreError::InvalidVendor))
            .collect()
    }
    pub async fn record_workspace_pool_selection(
        &self,
        principal: &Principal,
        pool: &WorkspaceModelPool,
        selected_model: &str,
        decision: Option<&serde_json::Value>,
    ) -> Result<Uuid, StoreError> {
        if !principal.allows_model(selected_model) {
            return Err(StoreError::Unauthorized);
        }
        let scope = principal.scope();
        let id = Uuid::new_v4();
        sqlx::query("INSERT INTO workspace_pool_selections(id,organization_id,project_id,pool_slug,pool_revision,key_id,selected_model,decision) VALUES($1,$2,$3,$4,$5,$6,$7,$8)")
            .bind(id).bind(scope.organization_id).bind(scope.project_id).bind(&pool.slug).bind(pool.revision).bind(principal.key_id()).bind(selected_model).bind(decision).execute(&self.pool).await?;
        Ok(id)
    }
    pub async fn finish_workspace_pool_selection(
        &self,
        scope: TenantScope,
        id: Uuid,
        operation: Option<Uuid>,
        attempt: Option<Uuid>,
        status: u16,
    ) -> Result<(), StoreError> {
        if (attempt.is_some() && operation.is_none()) || !(100..=599).contains(&status) {
            return Err(StoreError::InvalidObservation);
        }
        let updated=sqlx::query("UPDATE workspace_pool_selections s SET operation_id=$4,attempt_id=$5,response_status=$6 WHERE s.organization_id=$1 AND s.project_id=$2 AND s.id=$3 AND s.response_status IS NULL AND ($4::uuid IS NULL OR EXISTS(SELECT 1 FROM operations o WHERE o.organization_id=$1 AND o.project_id=$2 AND o.id=$4)) AND ($5::uuid IS NULL OR EXISTS(SELECT 1 FROM attempts a WHERE a.organization_id=$1 AND a.project_id=$2 AND a.operation_id=$4 AND a.id=$5))")
            .bind(scope.organization_id).bind(scope.project_id).bind(id).bind(operation).bind(attempt).bind(status as i16).execute(&self.pool).await?;
        if updated.rows_affected() != 1 {
            return Err(StoreError::Conflict);
        }
        Ok(())
    }
    pub async fn workspace_pool_selections(
        &self,
        scope: TenantScope,
        slug: &str,
    ) -> Result<Vec<serde_json::Value>, StoreError> {
        Ok(sqlx::query_scalar("SELECT jsonb_build_object('pool_revision',s.pool_revision,'selected_model',s.selected_model,'created_at',s.created_at,'operation_id',s.operation_id,'attempt_id',s.attempt_id,'response_status',s.response_status,'reference',a.public_reference,'decision',s.decision) FROM workspace_pool_selections s LEFT JOIN attempts a ON a.organization_id=s.organization_id AND a.project_id=s.project_id AND a.id=s.attempt_id WHERE s.organization_id=$1 AND s.project_id=$2 AND s.pool_slug=$3 ORDER BY s.created_at DESC,s.id DESC LIMIT 100")
            .bind(scope.organization_id).bind(scope.project_id).bind(slug).fetch_all(&self.pool).await?)
    }
}
