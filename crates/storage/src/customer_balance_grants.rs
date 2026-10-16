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
    async fn customer_balance_grant_result_in_tx(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        organization: Uuid,
        grant: Uuid,
    ) -> Result<serde_json::Value, StoreError> {
        sqlx::query_scalar(
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
        .fetch_optional(&mut **tx)
        .await?
        .ok_or(StoreError::Conflict)
    }

    /// Return immutable issuance intent and its original allocation, not current
    /// spendable capacity. Scoped read; callers retain platform authorization.
    pub async fn customer_balance_grant_result(
        &self,
        organization: Uuid,
        grant: Uuid,
    ) -> Result<serde_json::Value, StoreError> {
        let mut tx = self.begin_bounded_financial_snapshot().await?;
        let result =
            Self::customer_balance_grant_result_in_tx(&mut tx, organization, grant).await?;
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
        let (id, _) = self
            .publish_customer_balance_grant_inner(organization, publication, actor, policy, false)
            .await?;
        Ok(id)
    }

    pub async fn publish_customer_balance_grant_result_with_policy(
        &self,
        organization: Uuid,
        publication: CustomerBalanceGrantPublication<'_>,
        actor: OperatorAuditActor,
        policy: CustomerBalanceGrantPolicy,
    ) -> Result<serde_json::Value, StoreError> {
        let (_, result) = self
            .publish_customer_balance_grant_inner(organization, publication, actor, policy, true)
            .await?;
        result.ok_or(StoreError::Conflict)
    }

    async fn publish_customer_balance_grant_inner(
        &self,
        organization: Uuid,
        publication: CustomerBalanceGrantPublication<'_>,
        actor: OperatorAuditActor,
        policy: CustomerBalanceGrantPolicy,
        include_result: bool,
    ) -> Result<(Uuid, Option<serde_json::Value>), StoreError> {
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
                let result = if include_result {
                    Some(
                        Self::customer_balance_grant_result_in_tx(&mut tx, organization, id)
                            .await?,
                    )
                } else {
                    None
                };
                tx.commit().await?;
                Ok((id, result))
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
        let result = if include_result {
            Some(Self::customer_balance_grant_result_in_tx(&mut tx, organization, id).await?)
        } else {
            None
        };
        tx.commit().await?;
        Ok((id, result))
    }
}

impl Store {
    /// Correct the entire original gift only on an account with no consumption,
    /// refunds, open reservations or unknown financial sources. Never a cash refund.
    pub async fn correct_unused_customer_balance_grant(
        &self,
        organization: Uuid,
        grant: Uuid,
        publication: CustomerBalanceGrantPublication<'_>,
        actor: OperatorAuditActor,
    ) -> Result<Uuid, StoreError> {
        publication.validate()?;
        let mut tx = self.begin_bounded_recording().await?;
        sqlx::query("SELECT id FROM organizations WHERE id=$1 FOR NO KEY UPDATE")
            .bind(organization)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        let original: Option<(Uuid, i64)> = sqlx::query_as("SELECT g.account_id,g.amount_nanos FROM customer_balance_grants g JOIN customer_balance_accounts a ON a.id=g.account_id WHERE g.id=$1 AND g.organization_id=$2 AND g.currency=$3 FOR NO KEY UPDATE OF a")
            .bind(grant).bind(organization).bind(publication.currency).fetch_optional(&mut *tx).await?;
        let (account, original_amount) = original.ok_or(StoreError::Conflict)?;
        let prior: Option<(Uuid, Uuid, i64, String, String)> = sqlx::query_as("SELECT id,grant_id,amount_nanos,currency,reason FROM customer_balance_grant_corrections WHERE organization_id=$1 AND idempotency_key=$2")
            .bind(organization).bind(publication.idempotency_key).fetch_optional(&mut *tx).await?;
        if let Some((id, saved_grant, amount, currency, reason)) = prior {
            return if saved_grant == grant
                && amount == publication.amount_nanos
                && currency == publication.currency
                && reason == publication.reason
            {
                Ok(id)
            } else {
                Err(StoreError::Conflict)
            };
        }
        if original_amount != publication.amount_nanos {
            return Err(StoreError::Conflict);
        }
        let occupied: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM customer_balance_entries WHERE account_id=$1 AND idempotency_key=$2 AND kind<>'charge') OR EXISTS(SELECT 1 FROM customer_balance_grant_corrections WHERE grant_id=$3)")
            .bind(account).bind(publication.idempotency_key).bind(grant).fetch_one(&mut *tx).await?;
        if occupied {
            return Err(StoreError::Conflict);
        }
        let entry = Uuid::new_v4();
        sqlx::query("INSERT INTO customer_balance_entries(id,organization_id,account_id,currency,kind,amount_nanos,idempotency_key) VALUES($1,$2,$3,$4,'adjustment',$5,$6)")
            .bind(entry).bind(organization).bind(account).bind(publication.currency).bind(-publication.amount_nanos).bind(publication.idempotency_key).execute(&mut *tx).await?;
        let id = Uuid::new_v4();
        let (kind, operator) = actor.kind_and_id();
        sqlx::query("INSERT INTO customer_balance_grant_corrections(id,organization_id,account_id,currency,grant_id,entry_id,amount_nanos,noncash_offset_nanos,idempotency_key,reason,actor_kind,actor_operator_id) VALUES($1,$2,$3,$4,$5,$6,$7,$7,$8,$9,$10,$11)")
            .bind(id).bind(organization).bind(account).bind(publication.currency).bind(grant).bind(entry).bind(publication.amount_nanos).bind(publication.idempotency_key).bind(publication.reason).bind(kind).bind(operator).execute(&mut *tx).await.map_err(|error| {
                if error.as_database_error().is_some_and(|e| e.code().is_some_and(|c| c=="P0040" || c=="23505")) { StoreError::Conflict } else { StoreError::Database(error) }
            })?;
        tx.commit().await?;
        Ok(id)
    }

    /// Platform-only issued gifts with their immutable correction, including
    /// gifts issued before durable preparation was introduced.
    pub async fn issued_customer_balance_grants(
        &self,
        organization: Uuid,
        currency: &str,
        before: Option<Uuid>,
        limit: i64,
        grant: Option<Uuid>,
    ) -> Result<serde_json::Value, StoreError> {
        if currency.len() != 3
            || !currency.bytes().all(|b| b.is_ascii_uppercase())
            || !(1..=100).contains(&limit)
        {
            return Err(StoreError::InvalidPrice);
        }
        let mut tx = self.begin_bounded_financial_snapshot().await?;
        if let Some(cursor) = before {
            let found:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM customer_balance_grants WHERE id=$1 AND organization_id=$2 AND currency=$3)").bind(cursor).bind(organization).bind(currency).fetch_one(&mut *tx).await?;
            if !found {
                return Err(StoreError::Conflict);
            }
        }
        let mut rows:Vec<serde_json::Value>=sqlx::query_scalar(r#"SELECT jsonb_build_object(
            'id',g.id,'amount_nanos',g.amount_nanos::text,'reason',g.reason,'created_at',g.created_at,
            'currency',g.currency,'correction',CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object(
                'id',c.id,'amount_nanos',c.amount_nanos::text,'reason',c.reason,'created_at',c.created_at,
                'actor_kind',c.actor_kind,'actor_label',CASE WHEN c.actor_kind='installation' THEN 'Installation administrator' ELSE COALESCE(NULLIF(a.name,''),'Member') END) END)
            FROM customer_balance_grants g LEFT JOIN customer_balance_grant_corrections c ON c.grant_id=g.id
            LEFT JOIN admin_operators a ON a.id=c.actor_operator_id
            WHERE g.organization_id=$1 AND g.currency=$2 AND ($5::uuid IS NULL OR g.id=$5) AND ($3::uuid IS NULL OR (g.created_at,g.id)<(SELECT created_at,id FROM customer_balance_grants WHERE id=$3))
            ORDER BY g.created_at DESC,g.id DESC LIMIT $4"#)
            .bind(organization).bind(currency).bind(before).bind(limit+1).bind(grant).fetch_all(&mut *tx).await?;
        let next = if rows.len() > limit as usize {
            rows.truncate(limit as usize);
            rows.last()
                .and_then(|v| v["id"].as_str())
                .map(str::to_owned)
        } else {
            None
        };
        tx.commit().await?;
        Ok(serde_json::json!({"data":rows,"next_before":next}))
    }
}
