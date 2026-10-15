//! Administrator noncash gifts, separate from verified cash funding and debt
//! capacity. Consumption allocation and reversal of gifts are separate contracts.
use crate::{OperatorAuditActor, Store, StoreError};
use uuid::Uuid;

/// Explicit application intent; omission at existing callers preserves future gifts.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CustomerBalanceGrantPolicy {
    #[default]
    FutureOnly,
    UnpaidCreditFirst,
}
impl CustomerBalanceGrantPolicy {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::FutureOnly => "future_only",
            Self::UnpaidCreditFirst => "unpaid_credit_first",
        }
    }
}

/// Positive noncash grant publication; all amounts are integer nanounits.
pub struct CustomerBalanceGrantPublication<'a> {
    pub currency: &'a str,
    pub amount_nanos: i64,
    pub reason: &'a str,
    pub idempotency_key: Uuid,
}

impl CustomerBalanceGrantPublication<'_> {
    pub(crate) fn validate(&self) -> Result<(), StoreError> {
        if self.amount_nanos <= 0
            || self.currency.len() != 3
            || !self.currency.bytes().all(|b| b.is_ascii_uppercase())
            || self.reason.is_empty()
            || self.reason != self.reason.trim()
            || self.reason.chars().count() > 500
            || self.reason.chars().any(char::is_control)
        {
            return Err(StoreError::InvalidPrice);
        }
        Ok(())
    }
}

impl Store {
    /// Return immutable issuance intent and its original allocation, not current
    /// spendable capacity. Scoped read; callers retain platform authorization.
    pub async fn customer_balance_grant_result(
        &self,
        organization: Uuid,
        grant: Uuid,
    ) -> Result<serde_json::Value, StoreError> {
        let mut tx = self.begin_bounded_financial_snapshot().await?;
        let result = sqlx::query_scalar(
            r#"SELECT jsonb_build_object(
                'id',g.id,'application_policy',COALESCE(p.policy,'future_only'),
                'applied_to_credit_nanos',allocation.amount::text,
                'retained_for_future_consumption_nanos',
                    (g.amount_nanos::numeric-allocation.amount)::text)
            FROM customer_balance_grants g
            LEFT JOIN customer_grant_policies p ON p.grant_id=g.id
            CROSS JOIN LATERAL (
                SELECT COALESCE(sum(a.amount_nanos::numeric),0) AS amount
                FROM customer_grant_credit_applications a WHERE a.grant_id=g.id
            ) allocation
            WHERE g.organization_id=$1 AND g.id=$2"#,
        )
        .bind(organization)
        .bind(grant)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(StoreError::Conflict)?;
        tx.commit().await?;
        Ok(result)
    }

    /// Publish one positive company/currency gift and its opposite signed
    /// noncash memorandum record atomically. Callers must authorize installation financial
    /// administration and supply the authenticated actor; this storage method
    /// does not grant authority. Never call the verified funding receipt path.
    ///
    /// Exact retries return the original grant even after an uncertain commit.
    /// Reusing a company idempotency key with another currency, amount, or reason
    /// conflicts. The first authenticated actor is retained on exact retries.
    /// Credit limits are intentionally unchanged.
    pub async fn publish_customer_balance_grant(
        &self,
        organization: Uuid,
        publication: CustomerBalanceGrantPublication<'_>,
        actor: OperatorAuditActor,
    ) -> Result<Uuid, StoreError> {
        self.publish_customer_balance_grant_with_policy(
            organization,
            publication,
            actor,
            CustomerBalanceGrantPolicy::FutureOnly,
        )
        .await
    }

    /// Explicit late grants may reduce exact known unpaid credit as sales allowance.
    /// Unknown debt sources reject the entire publication; no extra balance credit.
    pub async fn publish_customer_balance_grant_with_policy(
        &self,
        organization: Uuid,
        publication: CustomerBalanceGrantPublication<'_>,
        actor: OperatorAuditActor,
        policy: CustomerBalanceGrantPolicy,
    ) -> Result<Uuid, StoreError> {
        publication.validate()?;
        let CustomerBalanceGrantPublication {
            currency,
            amount_nanos,
            reason,
            idempotency_key,
        } = publication;
        let mut tx = self.begin_bounded_recording().await?;
        // Follow existing funding/account-creation lock order. Serialize both
        // exact retries and first publication without competing account inserts.
        sqlx::query("SELECT id FROM organizations WHERE id=$1 FOR NO KEY UPDATE")
            .bind(organization)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        let prepared: Option<(String,i64,String,String)> = sqlx::query_as("SELECT currency,amount_nanos,reason,application_policy FROM prepared_customer_balance_grants WHERE organization_id=$1 AND idempotency_key=$2")
            .bind(organization).bind(idempotency_key).fetch_optional(&mut *tx).await?;
        if prepared.is_some_and(
            |(saved_currency, saved_amount, saved_reason, saved_policy)| {
                saved_currency != currency
                    || saved_amount != amount_nanos
                    || saved_reason != reason
                    || saved_policy != policy.as_str()
            },
        ) {
            return Err(StoreError::Conflict);
        }
        let prior: Option<(Uuid, String, i64, String, String)> = sqlx::query_as(
            "SELECT g.id,g.currency,g.amount_nanos,g.reason,COALESCE(p.policy,'future_only') FROM customer_balance_grants g \
             LEFT JOIN customer_grant_policies p ON p.grant_id=g.id WHERE g.organization_id=$1 AND g.idempotency_key=$2",
        )
        .bind(organization)
        .bind(idempotency_key)
        .fetch_optional(&mut *tx)
        .await?;
        if let Some((id, saved_currency, saved_amount, saved_reason, saved_policy)) = prior {
            return if saved_currency == currency
                && saved_amount == amount_nanos
                && saved_reason == reason
                && saved_policy == policy.as_str()
            {
                tx.commit().await?;
                Ok(id)
            } else {
                Err(StoreError::Conflict)
            };
        }
        sqlx::query(
            "INSERT INTO customer_balance_accounts(id,organization_id,currency) \
             VALUES($1,$2,$3) ON CONFLICT(organization_id,currency) DO NOTHING",
        )
        .bind(Uuid::new_v4())
        .bind(organization)
        .bind(currency)
        .execute(&mut *tx)
        .await?;
        let account: Uuid = sqlx::query_scalar(
            "SELECT id FROM customer_balance_accounts \
             WHERE organization_id=$1 AND currency=$2 FOR NO KEY UPDATE",
        )
        .bind(organization)
        .bind(currency)
        .fetch_one(&mut *tx)
        .await?;
        // A reused reversal/funding key must fail with the public conflict
        // contract rather than surface a database unique-constraint failure.
        let occupied: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM customer_balance_entries \
             WHERE account_id=$1 AND idempotency_key=$2 AND kind<>'charge')",
        )
        .bind(account)
        .bind(idempotency_key)
        .fetch_one(&mut *tx)
        .await?;
        if occupied {
            return Err(StoreError::Conflict);
        }
        if policy == CustomerBalanceGrantPolicy::UnpaidCreditFirst {
            let covered: bool =
                sqlx::query_scalar("SELECT niu_customer_credit_account_covered($1)")
                    .bind(account)
                    .fetch_one(&mut *tx)
                    .await?;
            if !covered {
                return Err(StoreError::Conflict);
            }
        }
        let entry = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO customer_balance_entries \
             (id,organization_id,account_id,currency,kind,amount_nanos,idempotency_key) \
             VALUES($1,$2,$3,$4,'adjustment',$5,$6)",
        )
        .bind(entry)
        .bind(organization)
        .bind(account)
        .bind(currency)
        .bind(amount_nanos)
        .bind(idempotency_key)
        .execute(&mut *tx)
        .await?;
        let id = Uuid::new_v4();
        let (actor_kind, actor_id) = actor.kind_and_id();
        sqlx::query(
            "INSERT INTO customer_balance_grants \
             (id,organization_id,account_id,currency,entry_id,amount_nanos,noncash_offset_nanos,\
              idempotency_key,reason,actor_kind,actor_operator_id) \
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
        )
        .bind(id)
        .bind(organization)
        .bind(account)
        .bind(currency)
        .bind(entry)
        .bind(amount_nanos)
        .bind(-amount_nanos)
        .bind(idempotency_key)
        .bind(reason)
        .bind(actor_kind)
        .bind(actor_id)
        .execute(&mut *tx)
        .await?;
        sqlx::query("INSERT INTO customer_grant_policies(grant_id,policy) VALUES($1,$2)")
            .bind(id)
            .bind(policy.as_str())
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(id)
    }
}
