//! Customer key caps share a durable identity across secret rotations.
use crate::{OperatorAuditActor, Store, StoreError, TenantScope};
use serde_json::Value;
use uuid::Uuid;

impl Store {
    pub async fn customer_key_spending_limits(
        &self,
        scope: TenantScope,
        key: Uuid,
    ) -> Result<Vec<Value>, StoreError> {
        Ok(sqlx::query_scalar("SELECT jsonb_build_object('currency',a.currency,'limit_nanos',l.limit_nanos::text,'revision',l.revision::text,'committed_nanos',niu_customer_key_committed(k.spending_root_id,a.id)::text) FROM api_keys k JOIN customer_balance_accounts a ON a.organization_id=k.organization_id LEFT JOIN customer_key_spending_limits l ON l.spending_root_id=k.spending_root_id AND l.account_id=a.id WHERE k.organization_id=$1 AND k.project_id=$2 AND k.id=$3 ORDER BY a.currency")
            .bind(scope.organization_id).bind(scope.project_id).bind(key).fetch_all(&self.pool).await?)
    }

    pub async fn customer_key_limit_history(
        &self,
        scope: TenantScope,
        key: Uuid,
        currency: &str,
        before: Option<i64>,
        limit: i64,
    ) -> Result<Vec<Value>, StoreError> {
        if !(1..=100).contains(&limit) || before.is_some_and(|r| r <= 0) {
            return Err(StoreError::Conflict);
        }
        Ok(sqlx::query_scalar("SELECT jsonb_build_object('currency',h.currency,'revision',h.revision::text,'limit_nanos',h.limit_nanos::text,'recorded_at',h.recorded_at,'actor_kind',h.actor_kind,'actor_name',h.actor_name) FROM customer_key_limit_history h JOIN api_keys k ON k.spending_root_id=h.spending_root_id WHERE k.organization_id=$1 AND k.project_id=$2 AND k.id=$3 AND h.currency=$4 AND ($5::bigint IS NULL OR h.revision<$5) ORDER BY h.revision DESC LIMIT $6")
            .bind(scope.organization_id).bind(scope.project_id).bind(key).bind(currency).bind(before).bind(limit).fetch_all(&self.pool).await?)
    }

    pub async fn set_customer_key_spending_limit(
        &self,
        scope: TenantScope,
        key: Uuid,
        currency: &str,
        amount: Option<i64>,
        expected: i64,
        actor: OperatorAuditActor,
    ) -> Result<i64, StoreError> {
        if amount.is_some_and(|v| v < 0) || expected < 0 || expected == i64::MAX {
            return Err(StoreError::InvalidPrice);
        }
        let mut tx = self.pool.begin().await?;
        let (actor_kind, actor_name, actor_id) = match actor {
            OperatorAuditActor::Installation => (
                "installation",
                "Installation administrator".to_owned(),
                None,
            ),
            OperatorAuditActor::Operator(id) => {
                let name: String=sqlx::query_scalar("SELECT name FROM admin_operators WHERE id=$1 AND role='owner' AND revoked_at IS NULL AND organization_id=$2 AND (project_id IS NULL OR project_id=$3) FOR SHARE")
                    .bind(id).bind(scope.organization_id).bind(scope.project_id).fetch_optional(&mut *tx).await?.ok_or(StoreError::Unauthorized)?;
                ("member", name, Some(id))
            }
        };
        let account: Uuid=sqlx::query_scalar("SELECT a.id FROM customer_balance_accounts a JOIN projects p ON p.organization_id=a.organization_id WHERE a.organization_id=$1 AND a.currency=$2 AND p.id=$3 FOR UPDATE OF a")
            .bind(scope.organization_id).bind(currency).bind(scope.project_id).fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        let root: Uuid=sqlx::query_scalar("SELECT spending_root_id FROM api_keys WHERE organization_id=$1 AND project_id=$2 AND id=$3 FOR SHARE")
            .bind(scope.organization_id).bind(scope.project_id).bind(key).fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        let current: Option<i64>=sqlx::query_scalar("SELECT revision FROM customer_key_spending_limits WHERE spending_root_id=$1 AND account_id=$2")
            .bind(root).bind(account).fetch_optional(&mut *tx).await?;
        if current.unwrap_or(0) != expected {
            return Err(StoreError::Conflict);
        }
        if let Some(amount) = amount {
            let unattributed: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM customer_balance_reservations r JOIN attempts a ON a.id=r.attempt_id WHERE r.account_id=$1 AND a.project_id=$2 AND r.released_at IS NULL AND niu_customer_attempt_spending_root(r.attempt_id) IS NULL)")
                .bind(account).bind(scope.project_id).fetch_one(&mut *tx).await?;
            if unattributed {
                return Err(StoreError::Unresolved);
            }
            let exceeds: bool = sqlx::query_scalar("SELECT niu_customer_key_committed($1,$2)>$3")
                .bind(root)
                .bind(account)
                .bind(amount)
                .fetch_one(&mut *tx)
                .await?;
            if exceeds {
                return Err(StoreError::KeySpendingLimitExceeded);
            }
        }
        let next = expected + 1;
        if current.is_none() {
            sqlx::query("INSERT INTO customer_key_spending_limits(organization_id,project_id,spending_root_id,account_id,currency,limit_nanos,revision) VALUES($1,$2,$3,$4,$5,$6,$7)")
                .bind(scope.organization_id).bind(scope.project_id).bind(root).bind(account).bind(currency).bind(amount).bind(next).execute(&mut *tx).await?;
        } else {
            sqlx::query("UPDATE customer_key_spending_limits SET limit_nanos=$3,revision=$4 WHERE spending_root_id=$1 AND account_id=$2")
                .bind(root).bind(account).bind(amount).bind(next).execute(&mut *tx).await?;
        }
        sqlx::query("INSERT INTO customer_key_limit_history(organization_id,project_id,spending_root_id,currency,revision,limit_nanos,actor_kind,actor_name,actor_operator_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)")
            .bind(scope.organization_id).bind(scope.project_id).bind(root).bind(currency).bind(next).bind(amount).bind(actor_kind).bind(actor_name).bind(actor_id).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(next)
    }
}
