//! Request-rate policy shared across secret rotations.
use crate::{OperatorAuditActor, Store, StoreError, TenantScope};
use serde_json::Value;
use uuid::Uuid;
impl Store {
    pub async fn key_request_rate_policy(
        &self,
        scope: TenantScope,
        key: Uuid,
    ) -> Result<Option<Value>, StoreError> {
        Ok(sqlx::query_scalar("SELECT jsonb_build_object('requests_per_minute',p.requests_per_minute,'revision',p.revision::text) FROM api_keys k LEFT JOIN key_request_rate_limits p ON p.spending_root_id=k.spending_root_id WHERE k.organization_id=$1 AND k.project_id=$2 AND k.id=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(key).fetch_optional(&self.pool).await?)
    }
    pub async fn key_request_rate_history(
        &self,
        scope: TenantScope,
        key: Uuid,
        before: Option<i64>,
        limit: i64,
    ) -> Result<Vec<Value>, StoreError> {
        if !(1..=100).contains(&limit) || before.is_some_and(|v| v <= 0) {
            return Err(StoreError::Conflict);
        }
        Ok(sqlx::query_scalar("SELECT jsonb_build_object('requests_per_minute',h.requests_per_minute,'revision',h.revision::text,'recorded_at',h.recorded_at,'actor_kind',h.actor_kind,'actor_name',h.actor_name) FROM key_request_rate_history h JOIN api_keys k ON k.spending_root_id=h.spending_root_id WHERE k.organization_id=$1 AND k.project_id=$2 AND k.id=$3 AND ($4::bigint IS NULL OR h.revision<$4) ORDER BY h.revision DESC LIMIT $5")
            .bind(scope.organization_id).bind(scope.project_id).bind(key).bind(before).bind(limit).fetch_all(&self.pool).await?)
    }
    pub async fn set_key_request_rate_policy(
        &self,
        scope: TenantScope,
        key: Uuid,
        rpm: Option<i64>,
        expected: i64,
        actor: OperatorAuditActor,
    ) -> Result<i64, StoreError> {
        if expected < 0
            || expected == i64::MAX
            || rpm.is_some_and(|v| !(0..=1_000_000).contains(&v))
        {
            return Err(StoreError::InvalidKey);
        }
        let mut tx = self.pool.begin().await?;
        let (kind, name, actor_id) = match actor {
            OperatorAuditActor::Installation => (
                "installation",
                "Installation administrator".to_owned(),
                None,
            ),
            OperatorAuditActor::Operator(id) => {
                let name:String=sqlx::query_scalar("SELECT name FROM admin_operators WHERE id=$1 AND organization_id=$2 AND (project_id IS NULL OR project_id=$3) AND role='owner' AND revoked_at IS NULL FOR SHARE")
                    .bind(id).bind(scope.organization_id).bind(scope.project_id).fetch_optional(&mut *tx).await?.ok_or(StoreError::Unauthorized)?;
                ("member", name, Some(id))
            }
        };
        let root:Uuid=sqlx::query_scalar("SELECT root.id FROM api_keys k JOIN api_keys root ON root.id=k.spending_root_id WHERE k.organization_id=$1 AND k.project_id=$2 AND k.id=$3 FOR UPDATE OF root")
            .bind(scope.organization_id).bind(scope.project_id).bind(key).fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        let current: Option<i64> = sqlx::query_scalar(
            "SELECT revision FROM key_request_rate_limits WHERE spending_root_id=$1",
        )
        .bind(root)
        .fetch_optional(&mut *tx)
        .await?;
        if current.unwrap_or(0) != expected {
            return Err(StoreError::Conflict);
        }
        let next = expected + 1;
        sqlx::query("INSERT INTO key_request_rate_limits(organization_id,project_id,spending_root_id,requests_per_minute,revision) VALUES($1,$2,$3,$4,$5) ON CONFLICT(organization_id,project_id,spending_root_id) DO UPDATE SET requests_per_minute=EXCLUDED.requests_per_minute,revision=EXCLUDED.revision")
            .bind(scope.organization_id).bind(scope.project_id).bind(root).bind(rpm).bind(next).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO key_request_rate_history(organization_id,project_id,spending_root_id,revision,requests_per_minute,actor_kind,actor_name,actor_operator_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)")
            .bind(scope.organization_id).bind(scope.project_id).bind(root).bind(next).bind(rpm).bind(kind).bind(name).bind(actor_id).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(next)
    }
}
