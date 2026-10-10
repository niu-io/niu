//! Internal customer-only media tariff binding; no Supplier-cost fallback.
use crate::{Store, StoreError, TenantScope};
use niu_metered_cost::{PricingSnapshot, Provenance, Quantity, Receipt, Usage};
use sha2::{Digest, Sha256};
use sqlx::Row;
use uuid::Uuid;

/// A trusted adapter supplies an independently qualified upper bound. A point
/// estimate is not a bound. Qualification verification remains a caller duty.
pub struct MediaLiabilityBound {
    pub meter: String,
    pub maximum_quantity: Quantity,
    pub qualification_revision: String,
}

#[derive(Clone, Copy, Debug)]
pub enum MediaUsageSource {
    Query,
    Callback,
}

impl MediaUsageSource {
    fn name(self) -> &'static str {
        match self {
            Self::Query => "query",
            Self::Callback => "callback",
        }
    }
}

/// A priced observation is not a settled debit. Conflicting or unpriceable
/// reported usage remains durable and must not silently become a free job.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MediaUsageState {
    Unknown,
    Agreed(Receipt),
    Conflicting,
    Unpriceable,
}

pub(crate) fn receipt_nanos(receipt: &Receipt) -> Result<i64, StoreError> {
    if receipt.decimal_places > 9 {
        return Err(StoreError::InvalidPrice);
    }
    let amount = u128::from(receipt.amount_units)
        .checked_mul(10_u128.pow(u32::from(9 - receipt.decimal_places)))
        .ok_or(StoreError::InvalidPrice)?;
    i64::try_from(amount).map_err(|_| StoreError::InvalidPrice)
}

impl Store {
    /// Only explicit success with agreed reported usage can settle. Late
    /// discrepancies remain visible; retries never reprice the original debit.
    pub async fn settle_customer_media_charge(
        &self,
        scope: TenantScope,
        attempt: Uuid,
    ) -> Result<i64, StoreError> {
        let mut tx = self.pool.begin().await?;
        let result = Self::settle_customer_media_charge_in_tx(&mut tx, scope, attempt).await;
        // Insufficient funding still commits the immutable liability and keeps
        // the hold. All other failures roll back the attempted settlement.
        if result.is_ok() || matches!(result, Err(StoreError::BudgetExceeded)) {
            tx.commit().await?;
        }
        result
    }

    pub(crate) async fn settle_customer_media_charge_in_tx(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        scope: TenantScope,
        attempt: Uuid,
    ) -> Result<i64, StoreError> {
        sqlx::query("SELECT id FROM organizations WHERE id=$1 FOR SHARE")
            .bind(scope.organization_id)
            .fetch_optional(&mut **tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        let account: (Uuid,String) = sqlx::query_as("SELECT c.id,c.currency FROM customer_balance_accounts c JOIN customer_attempt_balance_accounts b ON b.account_id=c.id AND b.organization_id=c.organization_id AND b.currency=c.currency WHERE b.organization_id=$1 AND b.project_id=$2 AND b.attempt_id=$3 FOR UPDATE OF c")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt)
            .fetch_optional(&mut **tx).await?.ok_or(StoreError::Conflict)?;
        let execution: String = sqlx::query_scalar("SELECT execution FROM attempts WHERE organization_id=$1 AND project_id=$2 AND id=$3 FOR UPDATE")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt)
            .fetch_optional(&mut **tx).await?.ok_or(StoreError::Conflict)?;
        let prior: Option<i64> = sqlx::query_scalar("SELECT amount_nanos FROM customer_media_charges WHERE organization_id=$1 AND project_id=$2 AND attempt_id=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt)
            .fetch_optional(&mut **tx).await?;
        if let Some(amount) = prior {
            let settled: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM customer_activity_charges WHERE attempt_id=$1 AND amount_nanos=$2 AND organization_id=$3 AND project_id=$4 AND currency=$5)")
                .bind(attempt).bind(amount).bind(scope.organization_id).bind(scope.project_id).bind(&account.1).fetch_one(&mut **tx).await?;
            if settled {
                return Ok(amount);
            }
        }
        if execution != "confirmed_completed" {
            return Err(StoreError::Unresolved);
        }
        let job_unresolved: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM media_jobs j WHERE j.attempt_id=$1 AND (NOT EXISTS(SELECT 1 FROM media_job_observations WHERE attempt_id=j.attempt_id AND status='succeeded') OR EXISTS(SELECT 1 FROM media_job_observations WHERE attempt_id=j.attempt_id AND status='failed')))")
            .bind(attempt).fetch_one(&mut **tx).await?;
        if job_unresolved {
            return Err(StoreError::Unresolved);
        }
        let maximum: i64 = sqlx::query_scalar("SELECT r.amount_nanos FROM customer_balance_reservations r JOIN customer_media_liability_bounds b ON b.attempt_id=r.attempt_id AND b.maximum_nanos=r.amount_nanos WHERE r.attempt_id=$1 AND r.organization_id=$2 AND r.account_id=$3 AND r.released_at IS NULL")
            .bind(attempt).bind(scope.organization_id).bind(account.0)
            .fetch_optional(&mut **tx).await?.ok_or(StoreError::Conflict)?;
        let snapshot: serde_json::Value = sqlx::query_scalar("SELECT snapshot FROM customer_media_attempt_pricing WHERE attempt_id=$1 AND organization_id=$2 AND project_id=$3")
            .bind(attempt).bind(scope.organization_id).bind(scope.project_id)
            .fetch_one(&mut **tx).await?;
        let snapshot =
            PricingSnapshot::decode(&snapshot.to_string()).map_err(|_| StoreError::InvalidPrice)?;
        let rows: Vec<(String,serde_json::Value)> = sqlx::query_as("SELECT DISTINCT meter,quantity FROM customer_media_usage_observations WHERE attempt_id=$1 AND organization_id=$2 AND project_id=$3 LIMIT 2")
            .bind(attempt).bind(scope.organization_id).bind(scope.project_id).fetch_all(&mut **tx).await?;
        if rows.len() != 1 {
            return Err(StoreError::Unresolved);
        }
        let (meter, quantity) = rows.into_iter().next().ok_or(StoreError::Unresolved)?;
        let quantity: Quantity =
            serde_json::from_value(quantity).map_err(|_| StoreError::InvalidUsage)?;
        let receipt = snapshot
            .calculate(&Usage::Known {
                meter,
                quantity,
                provenance: Provenance::Reported,
            })
            .map_err(|_| StoreError::InvalidPrice)?;
        if receipt.currency != account.1 {
            return Err(StoreError::Conflict);
        }
        let amount = receipt_nanos(&receipt)?;
        let explanation = serde_json::to_value(&receipt).map_err(|_| StoreError::InvalidPrice)?;
        if let Some(prior) = prior {
            if prior != amount {
                return Err(StoreError::Conflict);
            }
        } else {
            sqlx::query("INSERT INTO customer_media_charges(organization_id,project_id,attempt_id,currency,amount_nanos,bound_exceeded,explanation) VALUES($1,$2,$3,$4,$5,$6,$7)")
                .bind(scope.organization_id).bind(scope.project_id).bind(attempt).bind(&receipt.currency)
                .bind(amount).bind(amount>maximum).bind(explanation).execute(&mut **tx).await?;
        }
        if amount > 0 {
            let funded: bool = sqlx::query_scalar("SELECT COALESCE((SELECT SUM(amount_nanos) FROM customer_balance_entries WHERE account_id=a.id),0)+a.credit_limit_nanos-niu_customer_account_outstanding(a.id, $2)>=$3 FROM customer_balance_accounts a WHERE a.id=$1")
                .bind(account.0).bind(attempt).bind(amount).fetch_one(&mut **tx).await?;
            if !funded {
                // Retain the full immutable liability and its hold for funding/
                // approved-credit reconciliation; do not create an overdraft.
                return Err(StoreError::BudgetExceeded);
            }
            sqlx::query("INSERT INTO customer_balance_entries(id,organization_id,account_id,currency,kind,amount_nanos,idempotency_key,project_id,attempt_id) VALUES($1,$2,$3,$4,'charge',$5,$6,$7,$6)")
                .bind(Uuid::new_v4()).bind(scope.organization_id).bind(account.0).bind(&receipt.currency)
                .bind(-amount).bind(attempt).bind(scope.project_id).execute(&mut **tx).await?;
        }
        sqlx::query("UPDATE customer_balance_reservations SET released_at=now() WHERE attempt_id=$1 AND released_at IS NULL")
            .bind(attempt).execute(&mut **tx).await?;
        Ok(amount)
    }

    pub async fn reserve_customer_media_balance(
        &self,
        scope: TenantScope,
        attempt: Uuid,
        bound: &MediaLiabilityBound,
    ) -> Result<i64, StoreError> {
        if bound.qualification_revision.is_empty()
            || bound.qualification_revision.len() > 256
            || bound.qualification_revision.trim() != bound.qualification_revision
            || bound.qualification_revision.chars().any(char::is_control)
        {
            return Err(StoreError::InvalidPrice);
        }
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT id FROM organizations WHERE id=$1 FOR SHARE")
            .bind(scope.organization_id)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        let value: serde_json::Value = sqlx::query_scalar("SELECT snapshot FROM customer_media_attempt_pricing WHERE organization_id=$1 AND project_id=$2 AND attempt_id=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt)
            .fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        let snapshot =
            PricingSnapshot::decode(&value.to_string()).map_err(|_| StoreError::InvalidPrice)?;
        let receipt = snapshot
            .calculate(&Usage::Known {
                meter: bound.meter.clone(),
                quantity: bound.maximum_quantity,
                provenance: Provenance::Estimate,
            })
            .map_err(|_| StoreError::InvalidPrice)?;
        // The existing ledger uses nanos. Do not round away finer tariff units.
        let maximum_nanos = receipt_nanos(&receipt)?;
        if maximum_nanos <= 0 {
            return Err(StoreError::InvalidPrice);
        }
        let account: Uuid = sqlx::query_scalar("SELECT id FROM customer_balance_accounts WHERE organization_id=$1 AND currency=$2 FOR UPDATE")
            .bind(scope.organization_id).bind(&receipt.currency)
            .fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        sqlx::query("SELECT id FROM attempts WHERE organization_id=$1 AND project_id=$2 AND id=$3 FOR UPDATE")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt)
            .fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        sqlx::query("INSERT INTO customer_attempt_balance_accounts(attempt_id,organization_id,project_id,account_id,currency) VALUES($1,$2,$3,$4,$5) ON CONFLICT(attempt_id) DO NOTHING")
            .bind(attempt).bind(scope.organization_id).bind(scope.project_id).bind(account)
            .bind(&receipt.currency).execute(&mut *tx).await?;
        let matching: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM customer_attempt_balance_accounts WHERE attempt_id=$1 AND organization_id=$2 AND project_id=$3 AND account_id=$4 AND currency=$5)")
            .bind(attempt).bind(scope.organization_id).bind(scope.project_id).bind(account)
            .bind(&receipt.currency).fetch_one(&mut *tx).await?;
        if !matching {
            return Err(StoreError::Conflict);
        }
        let record = serde_json::json!({"meter": bound.meter, "maximum_quantity": bound.maximum_quantity,
            "qualification_revision": bound.qualification_revision});
        let previous: Option<(serde_json::Value, i64)> = sqlx::query_as(
            "SELECT bound,maximum_nanos FROM customer_media_liability_bounds WHERE attempt_id=$1",
        )
        .bind(attempt)
        .fetch_optional(&mut *tx)
        .await?;
        if let Some((prior, amount)) = &previous
            && (*prior != record || *amount != maximum_nanos)
        {
            return Err(StoreError::Conflict);
        }
        crate::billing::reserve_customer_balance_in_tx(&mut tx, scope, attempt, maximum_nanos)
            .await?;
        if previous.is_none() {
            sqlx::query("INSERT INTO customer_media_liability_bounds(organization_id,project_id,attempt_id,bound,maximum_nanos) VALUES($1,$2,$3,$4,$5)")
                .bind(scope.organization_id).bind(scope.project_id).bind(attempt).bind(record)
                .bind(maximum_nanos).execute(&mut *tx).await?;
        }
        tx.commit().await?;
        Ok(maximum_nanos)
    }

    /// Caller must verify the Provider's query/callback provenance first. This
    /// method does not trust a client estimate, authenticate a callback or debit.
    pub async fn record_customer_media_usage(
        &self,
        scope: TenantScope,
        attempt: Uuid,
        source: MediaUsageSource,
        usage: &Usage,
    ) -> Result<(), StoreError> {
        let Usage::Known {
            meter,
            quantity,
            provenance: Provenance::Reported,
        } = usage
        else {
            return Err(StoreError::InvalidUsage);
        };
        let quantity = serde_json::to_value(quantity).map_err(|_| StoreError::InvalidUsage)?;
        let receipt = serde_json::to_vec(&(source.name(), meter, &quantity))
            .map_err(|_| StoreError::InvalidUsage)?;
        let digest = Sha256::digest(receipt).to_vec();
        let mut tx = self.pool.begin().await?;
        let execution: String = sqlx::query_scalar("SELECT execution FROM attempts WHERE organization_id=$1 AND project_id=$2 AND id=$3 FOR UPDATE")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt)
            .fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        if execution == "not_sent" {
            return Err(StoreError::Conflict);
        }
        let snapshot: serde_json::Value = sqlx::query_scalar("SELECT snapshot FROM customer_media_attempt_pricing WHERE organization_id=$1 AND project_id=$2 AND attempt_id=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt)
            .fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        let snapshot =
            PricingSnapshot::decode(&snapshot.to_string()).map_err(|_| StoreError::InvalidPrice)?;
        if snapshot.tariff().meter != *meter {
            return Err(StoreError::InvalidUsage);
        }
        let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM customer_media_usage_observations WHERE attempt_id=$1 AND receipt_sha256=$2)")
            .bind(attempt).bind(&digest).fetch_one(&mut *tx).await?;
        if !exists {
            let count: i64 = sqlx::query_scalar(
                "SELECT count(*) FROM customer_media_usage_observations WHERE attempt_id=$1",
            )
            .bind(attempt)
            .fetch_one(&mut *tx)
            .await?;
            if count >= 16 {
                return Err(StoreError::Conflict);
            }
            sqlx::query("INSERT INTO customer_media_usage_observations(organization_id,project_id,attempt_id,receipt_sha256,source,meter,quantity) VALUES($1,$2,$3,$4,$5,$6,$7)")
                .bind(scope.organization_id).bind(scope.project_id).bind(attempt).bind(digest)
                .bind(source.name()).bind(meter).bind(quantity).execute(&mut *tx).await?;
        }
        tx.commit().await?;
        Ok(())
    }

    pub async fn customer_media_usage_state(
        &self,
        scope: TenantScope,
        attempt: Uuid,
    ) -> Result<MediaUsageState, StoreError> {
        let Some(snapshot) = self.customer_media_pricing(scope, attempt).await? else {
            return Ok(MediaUsageState::Unknown);
        };
        let rows: Vec<(String, serde_json::Value)> = sqlx::query_as("SELECT DISTINCT meter,quantity FROM customer_media_usage_observations WHERE organization_id=$1 AND project_id=$2 AND attempt_id=$3 LIMIT 2")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt)
            .fetch_all(&self.pool).await?;
        if rows.len() > 1 {
            return Ok(MediaUsageState::Conflicting);
        }
        let Some((meter, quantity)) = rows.into_iter().next() else {
            return Ok(MediaUsageState::Unknown);
        };
        let quantity: Quantity =
            serde_json::from_value(quantity).map_err(|_| StoreError::InvalidUsage)?;
        let usage = Usage::Known {
            meter,
            quantity,
            provenance: Provenance::Reported,
        };
        Ok(match snapshot.calculate(&usage) {
            Ok(receipt) => MediaUsageState::Agreed(receipt),
            Err(_) => MediaUsageState::Unpriceable,
        })
    }

    /// Bind before egress. Repeated identical bindings are idempotent, while a
    /// changed tariff cannot overwrite history. Caller supplies customer pricing
    /// from an authorized selling schedule, never a procurement schedule.
    pub async fn bind_customer_media_pricing(
        &self,
        scope: TenantScope,
        attempt: Uuid,
        snapshot: &PricingSnapshot,
    ) -> Result<(), StoreError> {
        if snapshot.customer() != scope.organization_id.to_string() {
            return Err(StoreError::Conflict);
        }
        let encoded = snapshot.encode().map_err(|_| StoreError::InvalidPrice)?;
        let value: serde_json::Value =
            serde_json::from_str(&encoded).map_err(|_| StoreError::InvalidPrice)?;
        let mut tx = self.pool.begin().await?;
        let row = sqlx::query("SELECT resource_id,offer_revision,execution FROM attempts WHERE organization_id=$1 AND project_id=$2 AND id=$3 FOR UPDATE")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt)
            .fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        if row.get::<String, _>("resource_id") != snapshot.tariff().dimensions.model
            || row.get::<String, _>("offer_revision") != snapshot.offer()
        {
            return Err(StoreError::Conflict);
        }
        let existing: Option<serde_json::Value> = sqlx::query_scalar("SELECT snapshot FROM customer_media_attempt_pricing WHERE organization_id=$1 AND project_id=$2 AND attempt_id=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt)
            .fetch_optional(&mut *tx).await?;
        if let Some(existing) = existing {
            if existing != value {
                return Err(StoreError::Conflict);
            }
        } else {
            if row.get::<String, _>("execution") != "not_sent" {
                return Err(StoreError::Conflict);
            }
            let text_bound: bool = sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM customer_attempt_tariffs WHERE attempt_id=$1)",
            )
            .bind(attempt)
            .fetch_one(&mut *tx)
            .await?;
            if text_bound {
                return Err(StoreError::Conflict);
            }
            sqlx::query("INSERT INTO customer_media_attempt_pricing(organization_id,project_id,attempt_id,snapshot) VALUES($1,$2,$3,$4)")
                .bind(scope.organization_id).bind(scope.project_id).bind(attempt).bind(value)
                .execute(&mut *tx).await?;
        }
        tx.commit().await?;
        Ok(())
    }

    /// Scoped internal retrieval revalidates the versioned calculation inputs.
    /// Do not return this internal document through ordinary request APIs.
    pub async fn customer_media_pricing(
        &self,
        scope: TenantScope,
        attempt: Uuid,
    ) -> Result<Option<PricingSnapshot>, StoreError> {
        let value: Option<serde_json::Value> = sqlx::query_scalar("SELECT snapshot FROM customer_media_attempt_pricing WHERE organization_id=$1 AND project_id=$2 AND attempt_id=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt)
            .fetch_optional(&self.pool).await?;
        value
            .map(|value| {
                PricingSnapshot::decode(&value.to_string()).map_err(|_| StoreError::InvalidPrice)
            })
            .transpose()
    }
}
