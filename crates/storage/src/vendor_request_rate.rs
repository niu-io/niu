//! Credential-level request admission policy, separate from customer key allowances.
use crate::{OperatorAuditActor, Store, StoreError};
use serde_json::Value;
use uuid::Uuid;

impl Store {
    pub async fn vendor_request_rate_policy(
        &self,
        vendor: Uuid,
    ) -> Result<Option<Value>, StoreError> {
        Ok(sqlx::query_scalar("SELECT jsonb_build_object('requests_per_minute',requests_per_minute,'revision',revision::text) FROM vendor_request_rate_limits WHERE vendor_id=$1")
            .bind(vendor).fetch_optional(&self.pool).await?)
    }

    pub async fn vendor_request_rate_history(
        &self,
        vendor: Uuid,
        before: Option<i64>,
        limit: i64,
    ) -> Result<Vec<Value>, StoreError> {
        if !(1..=100).contains(&limit) || before.is_some_and(|n| n <= 0) {
            return Err(StoreError::InvalidKey);
        }
        Ok(sqlx::query_scalar("SELECT jsonb_build_object('requests_per_minute',requests_per_minute,'revision',revision::text,'recorded_at',recorded_at,'actor_kind',CASE WHEN actor_operator_id IS NULL THEN 'installation' ELSE 'member' END,'actor_name',actor_name) FROM vendor_request_rate_history WHERE vendor_id=$1 AND ($2::bigint IS NULL OR revision<$2) ORDER BY revision DESC LIMIT $3")
            .bind(vendor).bind(before).bind(limit).fetch_all(&self.pool).await?)
    }

    pub async fn set_vendor_request_rate_policy(
        &self,
        vendor: Uuid,
        rpm: Option<i64>,
        expected: i64,
        actor: OperatorAuditActor,
    ) -> Result<Option<i64>, StoreError> {
        if expected < 0
            || expected == i64::MAX
            || rpm.is_some_and(|n| !(0..=1_000_000).contains(&n))
        {
            return Err(StoreError::InvalidKey);
        }
        let mut tx = self.pool.begin().await?;
        let (actor_id, name) = match actor {
            OperatorAuditActor::Installation => (None, "Installation administrator".to_owned()),
            OperatorAuditActor::Operator(id) => {
                let name: String = sqlx::query_scalar("SELECT name FROM admin_operators WHERE id=$1 AND platform_admin AND revoked_at IS NULL FOR SHARE")
                    .bind(id).fetch_optional(&mut *tx).await?.ok_or(StoreError::Unauthorized)?;
                (Some(id), name)
            }
        };
        let current: Option<i64> = sqlx::query_scalar(
            "SELECT revision FROM vendor_request_rate_limits WHERE vendor_id=$1 FOR UPDATE",
        )
        .bind(vendor)
        .fetch_optional(&mut *tx)
        .await?;
        let Some(current) = current else {
            return Ok(None);
        };
        if current != expected {
            return Err(StoreError::Conflict);
        }
        let next = expected + 1;
        sqlx::query("UPDATE vendor_request_rate_limits SET requests_per_minute=$2,revision=$3 WHERE vendor_id=$1")
            .bind(vendor).bind(rpm).bind(next).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO vendor_request_rate_history(vendor_id,revision,requests_per_minute,actor_operator_id,actor_name) VALUES($1,$2,$3,$4,$5)")
            .bind(vendor).bind(next).bind(rpm).bind(actor_id).bind(name).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(Some(next))
    }
}
