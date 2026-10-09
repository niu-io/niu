//! Customer retail limits; never derived from procurement prices.
use crate::{OperatorAuditActor, Store, StoreError, TenantScope};
use serde_json::Value;
use uuid::Uuid;

impl Store {
    /// Account currencies and this workspace's retail commitments only.
    /// Company funds and other workspaces' usage never enter this projection.
    pub async fn customer_workspace_spending_limits(
        &self,
        scope: TenantScope,
    ) -> Result<Vec<Value>, StoreError> {
        Ok(sqlx::query_scalar("SELECT jsonb_build_object('currency',a.currency,'limit_nanos',l.limit_nanos::text,'revision',l.revision::text,'committed_nanos',niu_customer_workspace_committed(a.organization_id,p.id,a.id)::text) FROM projects p JOIN customer_balance_accounts a ON a.organization_id=p.organization_id LEFT JOIN customer_workspace_spending_limits l ON l.organization_id=p.organization_id AND l.project_id=p.id AND l.account_id=a.id WHERE p.organization_id=$1 AND p.id=$2 ORDER BY a.currency")
            .bind(scope.organization_id).bind(scope.project_id).fetch_all(&self.pool).await?)
    }

    /// Scoped revision keyset. Baseline timestamps remain unknown on upgrade.
    pub async fn customer_workspace_spending_limit_history(
        &self,
        scope: TenantScope,
        currency: &str,
        before_revision: Option<i64>,
        limit: i64,
    ) -> Result<Vec<Value>, StoreError> {
        if !(1..=100).contains(&limit) || before_revision.is_some_and(|v| v <= 0) {
            return Err(StoreError::Conflict);
        }
        Ok(sqlx::query_scalar("SELECT jsonb_build_object('currency',currency,'revision',revision::text,'limit_nanos',limit_nanos::text,'recorded_at',recorded_at,'source',source,'actor_kind',actor_kind,'actor_name',actor_name) FROM customer_workspace_limit_history WHERE organization_id=$1 AND project_id=$2 AND currency=$3 AND ($4::bigint IS NULL OR revision<$4) ORDER BY revision DESC LIMIT $5")
            .bind(scope.organization_id).bind(scope.project_id).bind(currency).bind(before_revision).bind(limit)
            .fetch_all(&self.pool).await?)
    }

    /// Optimistic, account-serialized configuration. Existing paid liability
    /// cannot be invalidated by lowering a limit. Currency/account stay fixed.
    pub async fn set_customer_workspace_spending_limit(
        &self,
        scope: TenantScope,
        currency: &str,
        limit_nanos: i64,
        expected_revision: i64,
    ) -> Result<i64, StoreError> {
        self.set_workspace_limit(scope, currency, limit_nanos, expected_revision, None)
            .await
    }

    pub async fn set_customer_workspace_spending_limit_audited(
        &self,
        scope: TenantScope,
        currency: &str,
        limit_nanos: i64,
        expected_revision: i64,
        actor: OperatorAuditActor,
    ) -> Result<i64, StoreError> {
        self.set_workspace_limit(scope, currency, limit_nanos, expected_revision, Some(actor))
            .await
    }

    async fn set_workspace_limit(
        &self,
        scope: TenantScope,
        currency: &str,
        limit_nanos: i64,
        expected_revision: i64,
        actor: Option<OperatorAuditActor>,
    ) -> Result<i64, StoreError> {
        if limit_nanos < 0 || expected_revision < 0 || expected_revision == i64::MAX {
            return Err(StoreError::InvalidPrice);
        }
        let mut tx = self.pool.begin().await?;
        let actor_value = match actor {
            None => String::new(),
            Some(OperatorAuditActor::Installation) => "installation".into(),
            Some(OperatorAuditActor::Operator(id)) => {
                sqlx::query("SELECT id FROM admin_operators WHERE id=$1 AND role='owner' AND revoked_at IS NULL AND organization_id=$2 AND (project_id IS NULL OR project_id=$3) FOR SHARE")
                    .bind(id).bind(scope.organization_id).bind(scope.project_id).fetch_optional(&mut *tx).await?.ok_or(StoreError::Unauthorized)?;
                id.to_string()
            }
        };
        sqlx::query("SELECT set_config('niu.workspace_limit_actor',$1,true)")
            .bind(actor_value)
            .execute(&mut *tx)
            .await?;
        let account: Uuid = sqlx::query_scalar("SELECT a.id FROM customer_balance_accounts a JOIN projects p ON p.organization_id=a.organization_id WHERE a.organization_id=$1 AND a.currency=$2 AND p.id=$3 FOR UPDATE OF a")
            .bind(scope.organization_id).bind(currency).bind(scope.project_id)
            .fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        let committed: bool =
            sqlx::query_scalar("SELECT niu_customer_workspace_committed($1,$2,$3)>$4")
                .bind(scope.organization_id)
                .bind(scope.project_id)
                .bind(account)
                .bind(limit_nanos)
                .fetch_one(&mut *tx)
                .await?;
        if committed {
            return Err(StoreError::BudgetExceeded);
        }
        let changed = if expected_revision == 0 {
            sqlx::query("INSERT INTO customer_workspace_spending_limits(organization_id,project_id,account_id,currency,limit_nanos,revision) VALUES($1,$2,$3,$4,$5,1) ON CONFLICT DO NOTHING")
                .bind(scope.organization_id).bind(scope.project_id).bind(account).bind(currency).bind(limit_nanos)
                .execute(&mut *tx).await?.rows_affected()
        } else {
            sqlx::query("UPDATE customer_workspace_spending_limits SET limit_nanos=$5,revision=revision+1 WHERE organization_id=$1 AND project_id=$2 AND account_id=$3 AND currency=$4 AND revision=$6")
                .bind(scope.organization_id).bind(scope.project_id).bind(account).bind(currency).bind(limit_nanos).bind(expected_revision)
                .execute(&mut *tx).await?.rows_affected()
        };
        if changed != 1 {
            return Err(StoreError::Conflict);
        }
        tx.commit().await?;
        Ok(expected_revision + 1)
    }

    pub async fn customer_workspace_spending_limit(
        &self,
        scope: TenantScope,
        currency: &str,
    ) -> Result<Option<Value>, StoreError> {
        Ok(sqlx::query_scalar("SELECT jsonb_build_object('currency',currency,'limit_nanos',limit_nanos::text,'revision',revision::text,'committed_nanos',niu_customer_workspace_committed(organization_id,project_id,account_id)::text) FROM customer_workspace_spending_limits WHERE organization_id=$1 AND project_id=$2 AND currency=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(currency)
            .fetch_optional(&self.pool).await?)
    }
}
