//! Retail billing: independent from upstream costs and supplier earnings.
use crate::{ProviderOfferInput, Store, StoreError, TenantScope, TokenRates};
use serde_json::{Value, json};
use sqlx::Row;
use uuid::Uuid;

impl Store {
    /// Same-snapshot retail charge-to-ledger reconciliation; never mutates money.
    /// Only prepaid-bound attempts participate; legacy invoices are independent.
    pub async fn customer_charge_reconciliation(
        &self,
        organization: Uuid,
    ) -> Result<Vec<Value>, StoreError> {
        Ok(sqlx::query_scalar(r#"
WITH accounts AS MATERIALIZED (
    SELECT id,currency FROM customer_balance_accounts WHERE organization_id=$1
), charges AS MATERIALIZED (
    SELECT attempt_id,currency,amount_nanos FROM customer_charges WHERE organization_id=$1
    UNION ALL
    SELECT attempt_id,currency,amount_nanos FROM customer_media_charges WHERE organization_id=$1
), expected AS MATERIALIZED (
    SELECT b.account_id,c.attempt_id,SUM(c.amount_nanos::numeric) AS amount,COUNT(*) AS sources
    FROM charges c JOIN customer_attempt_balance_accounts b
      ON b.attempt_id=c.attempt_id AND b.currency=c.currency AND b.organization_id=$1
    JOIN accounts a ON a.id=b.account_id
    GROUP BY b.account_id,c.attempt_id
), posted AS MATERIALIZED (
    SELECT account_id,attempt_id,-amount_nanos::numeric AS amount
    FROM customer_balance_entries WHERE organization_id=$1 AND kind='charge'
), compared AS MATERIALIZED (
    SELECT COALESCE(e.account_id,p.account_id) AS account_id,
      e.attempt_id AS expected_attempt,p.attempt_id AS posted_attempt,
      e.amount AS expected_amount,p.amount AS posted_amount,e.sources
    FROM expected e FULL JOIN posted p USING(account_id,attempt_id)
)
SELECT jsonb_build_object(
    'currency',a.currency,'observed_at',statement_timestamp(),
    'charge_records',(SELECT COUNT(*)::text FROM expected e WHERE e.account_id=a.id),
    'expected_charge_nanos',COALESCE((SELECT SUM(e.amount) FROM expected e WHERE e.account_id=a.id),0)::text,
    'posted_charge_nanos',COALESCE((SELECT SUM(p.amount) FROM posted p WHERE p.account_id=a.id),0)::text,
    'missing_charge_entries',(SELECT COUNT(*)::text FROM compared c WHERE c.account_id=a.id AND c.expected_amount>0 AND c.posted_attempt IS NULL),
    'mismatched_charge_entries',(SELECT COUNT(*)::text FROM compared c WHERE c.account_id=a.id AND c.expected_attempt IS NOT NULL AND c.posted_attempt IS NOT NULL AND c.expected_amount<>c.posted_amount),
    'unexpected_charge_entries',(SELECT COUNT(*)::text FROM compared c WHERE c.account_id=a.id AND c.expected_attempt IS NULL),
    'duplicate_charge_sources',(SELECT COUNT(*)::text FROM expected e WHERE e.account_id=a.id AND e.sources>1),
    'settled_open_reservations',(SELECT COUNT(*)::text FROM customer_balance_reservations h
      JOIN expected e ON e.account_id=h.account_id AND e.attempt_id=h.attempt_id
      LEFT JOIN posted p ON p.account_id=e.account_id AND p.attempt_id=e.attempt_id
      WHERE h.account_id=a.id AND h.released_at IS NULL AND (e.amount=0 OR e.amount=p.amount))
) FROM accounts a ORDER BY a.currency
"#).bind(organization).fetch_all(&self.pool).await?)
    }

    /// Customer onboarding creates company ownership and its zero-funded account
    /// atomically. Existing legacy organizations are never silently converted.
    pub async fn create_prepaid_organization(
        &self,
        name: &str,
        currency: &str,
    ) -> Result<Uuid, StoreError> {
        if currency.len() != 3 || !currency.bytes().all(|b| b.is_ascii_uppercase()) {
            return Err(StoreError::InvalidPrice);
        }
        let mut tx = self.pool.begin().await?;
        let organization = Uuid::new_v4();
        sqlx::query("INSERT INTO organizations(id,name) VALUES($1,$2)")
            .bind(organization)
            .bind(name)
            .execute(&mut *tx)
            .await?;
        sqlx::query(
            "INSERT INTO customer_balance_accounts(id,organization_id,currency) VALUES($1,$2,$3)",
        )
        .bind(Uuid::new_v4())
        .bind(organization)
        .bind(currency)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(organization)
    }

    /// Latest 100 customer ledger entries. UUIDs are API routing references;
    /// product surfaces must render meaningful type/date/amount instead.
    pub async fn customer_balance_transactions(
        &self,
        organization: Uuid,
    ) -> Result<Vec<Value>, StoreError> {
        Ok(self
            .customer_balance_transaction_page(organization, None)
            .await?
            .0)
    }

    /// Immutable ledger keyset, validated against the requested company.
    pub async fn customer_balance_transaction_page(
        &self,
        organization: Uuid,
        before: Option<Uuid>,
    ) -> Result<(Vec<Value>, Option<Uuid>), StoreError> {
        self.customer_balance_transaction_page_filtered(organization, before, None, None)
            .await
    }

    /// Cursor and rows share one snapshot and the same company/filter scope.
    pub async fn customer_balance_transaction_page_filtered(
        &self,
        organization: Uuid,
        before: Option<Uuid>,
        currency: Option<&str>,
        kind: Option<&str>,
    ) -> Result<(Vec<Value>, Option<Uuid>), StoreError> {
        if currency.is_some_and(|v| v.len() != 3 || !v.bytes().all(|b| b.is_ascii_uppercase()))
            || kind.is_some_and(|v| {
                !matches!(
                    v,
                    "funding" | "charge" | "refund" | "funding_reversal" | "adjustment"
                )
            })
        {
            return Err(StoreError::InvalidPrice);
        }
        let (valid_cursor, rows): (bool, Value) =
            sqlx::query_as(include_str!("balance_transactions.sql"))
                .bind(organization)
                .bind(before)
                .bind(currency)
                .bind(kind)
                .fetch_one(&self.pool)
                .await?;
        if !valid_cursor {
            return Err(StoreError::Conflict);
        }
        let mut entries = rows.as_array().ok_or(StoreError::Conflict)?.clone();
        let next = if entries.len() > 100 {
            entries.truncate(100);
            Some(
                Uuid::parse_str(entries[99]["id"].as_str().ok_or(StoreError::Conflict)?)
                    .map_err(|_| StoreError::Conflict)?,
            )
        } else {
            None
        };
        Ok((entries, next))
    }

    /// Trusted administration records a balance refund or settled-funding
    /// reversal. This never executes an external payment or changes charges.
    pub async fn reverse_customer_balance_entry(
        &self,
        organization: Uuid,
        original: Uuid,
        amount_nanos: i64,
        idempotency_key: Uuid,
    ) -> Result<Uuid, StoreError> {
        if amount_nanos <= 0 {
            return Err(StoreError::InvalidPrice);
        }
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT id FROM organizations WHERE id=$1 FOR SHARE")
            .bind(organization)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        let row=sqlx::query("SELECT e.account_id,e.currency,e.kind,e.amount_nanos FROM customer_balance_entries e JOIN customer_balance_accounts a ON a.id=e.account_id AND a.organization_id=e.organization_id WHERE e.id=$1 AND e.organization_id=$2 FOR UPDATE OF a")
            .bind(original).bind(organization).fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        let account: Uuid = row.get("account_id");
        let currency: String = row.get("currency");
        let original_kind: String = row.get("kind");
        let kind = match original_kind.as_str() {
            "funding" => "funding_reversal",
            "charge" => "refund",
            _ => return Err(StoreError::Conflict),
        };
        let signed = if kind == "refund" {
            amount_nanos
        } else {
            -amount_nanos
        };
        let prior:Option<(Uuid,String,i64,Option<Uuid>)>=sqlx::query_as("SELECT id,kind,amount_nanos,reverses_entry_id FROM customer_balance_entries WHERE account_id=$1 AND idempotency_key=$2")
            .bind(account).bind(idempotency_key).fetch_optional(&mut *tx).await?;
        if let Some((id, saved_kind, saved_amount, saved_original)) = prior {
            return if saved_kind == kind
                && saved_amount == signed
                && saved_original == Some(original)
            {
                Ok(id)
            } else {
                Err(StoreError::Conflict)
            };
        }
        let limit = row
            .get::<i64, _>("amount_nanos")
            .checked_abs()
            .ok_or(StoreError::InvalidPrice)?;
        let within_limit:bool=sqlx::query_scalar("SELECT COALESCE(SUM(ABS(amount_nanos::numeric)),0)+$2<=$3 FROM customer_balance_entries WHERE reverses_entry_id=$1")
            .bind(original).bind(amount_nanos).bind(limit).fetch_one(&mut *tx).await?;
        if !within_limit {
            return Err(StoreError::Conflict);
        }
        let id = Uuid::new_v4();
        sqlx::query("INSERT INTO customer_balance_entries(id,organization_id,account_id,currency,kind,amount_nanos,idempotency_key,reverses_entry_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)")
            .bind(id).bind(organization).bind(account).bind(currency).bind(kind).bind(signed).bind(idempotency_key).bind(original).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(id)
    }

    /// Bounded restart recovery; elapsed time never makes uncertain work free.
    pub async fn recover_customer_balance_releases(
        &self,
        after: Option<Uuid>,
    ) -> Result<(Option<Uuid>, usize), StoreError> {
        Ok(self
            .recover_financial_stage(
                crate::financial_recovery::FinancialStage::BalanceRelease,
                Some(after),
            )
            .await?
            .unwrap_or((after, 0)))
    }

    /// Trusted financial administration only; changing credit is not funding.
    pub async fn configure_customer_balance_policy(
        &self,
        organization: Uuid,
        currency: &str,
        credit_limit_nanos: i64,
        warning_threshold_nanos: Option<i64>,
        expected_revision: i64,
    ) -> Result<i64, StoreError> {
        if currency.len() != 3
            || !currency.bytes().all(|b| b.is_ascii_uppercase())
            || credit_limit_nanos < 0
            || warning_threshold_nanos.is_some_and(|v| v < 0)
            || expected_revision < 0
            || expected_revision == i64::MAX
        {
            return Err(StoreError::InvalidPrice);
        }
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE")
            .bind(organization)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        sqlx::query("INSERT INTO customer_balance_accounts(id,organization_id,currency) VALUES($1,$2,$3) ON CONFLICT(organization_id,currency) DO NOTHING")
            .bind(Uuid::new_v4()).bind(organization).bind(currency).execute(&mut *tx).await?;
        let (account, revision): (Uuid,i64)=sqlx::query_as("SELECT id,policy_revision FROM customer_balance_accounts WHERE organization_id=$1 AND currency=$2 FOR UPDATE")
            .bind(organization).bind(currency).fetch_one(&mut *tx).await?;
        if revision != expected_revision {
            return Err(StoreError::Conflict);
        }
        let safe:bool=sqlx::query_scalar("SELECT NOT EXISTS(SELECT 1 FROM customer_balance_reservations WHERE account_id=$1 AND released_at IS NULL) OR COALESCE((SELECT SUM(amount_nanos) FROM customer_balance_entries WHERE account_id=$1),0)+$2-niu_customer_account_outstanding($1)>=0")
            .bind(account).bind(credit_limit_nanos).fetch_one(&mut *tx).await?;
        if !safe {
            return Err(StoreError::Unresolved);
        }
        let next = revision + 1;
        sqlx::query("INSERT INTO customer_balance_policy_revisions(organization_id,account_id,currency,revision,credit_limit_nanos,warning_threshold_nanos) VALUES($1,$2,$3,$4,$5,$6)")
            .bind(organization).bind(account).bind(currency).bind(next).bind(credit_limit_nanos).bind(warning_threshold_nanos).execute(&mut *tx).await?;
        sqlx::query("UPDATE customer_balance_accounts SET credit_limit_nanos=$2,warning_threshold_nanos=$3,policy_revision=$4 WHERE id=$1")
            .bind(account).bind(credit_limit_nanos).bind(warning_threshold_nanos).bind(next).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(next)
    }

    /// Company preference write; never changes approved credit or ledger funds.
    pub async fn configure_customer_balance_warning(
        &self,
        organization: Uuid,
        currency: &str,
        threshold: Option<i64>,
        expected_revision: i64,
    ) -> Result<i64, StoreError> {
        if currency.len() != 3
            || !currency.bytes().all(|b| b.is_ascii_uppercase())
            || threshold.is_some_and(|v| v < 0)
            || !(0..i64::MAX).contains(&expected_revision)
        {
            return Err(StoreError::InvalidPrice);
        }
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE")
            .bind(organization)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        let (account,credit,revision):(Uuid,i64,i64)=sqlx::query_as("SELECT id,credit_limit_nanos,policy_revision FROM customer_balance_accounts WHERE organization_id=$1 AND currency=$2 FOR UPDATE").bind(organization).bind(currency).fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        if revision != expected_revision {
            return Err(StoreError::Conflict);
        }
        let next = revision + 1;
        sqlx::query("INSERT INTO customer_balance_policy_revisions(organization_id,account_id,currency,revision,credit_limit_nanos,warning_threshold_nanos) VALUES($1,$2,$3,$4,$5,$6)").bind(organization).bind(account).bind(currency).bind(next).bind(credit).bind(threshold).execute(&mut *tx).await?;
        sqlx::query("UPDATE customer_balance_accounts SET warning_threshold_nanos=$2,policy_revision=$3 WHERE id=$1").bind(account).bind(threshold).bind(next).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(next)
    }

    pub async fn customer_balance_enabled(&self, organization: Uuid) -> Result<bool, StoreError> {
        Ok(sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM customer_balance_accounts WHERE organization_id=$1)",
        )
        .bind(organization)
        .fetch_one(&self.pool)
        .await?)
    }

    /// Reserve a trusted, conservative customer-liability bound before dispatch.
    /// The gateway must derive this bound; client-submitted prices are invalid.
    pub async fn reserve_customer_balance(
        &self,
        scope: TenantScope,
        attempt: Uuid,
        maximum_nanos: i64,
    ) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        reserve_customer_balance_in_tx(&mut tx, scope, attempt, maximum_nanos).await?;
        tx.commit().await?;
        Ok(())
    }

    /// Uncertain/disconnected requests retain their liability reservation.
    pub async fn release_nonexecuted_customer_balance(
        &self,
        scope: TenantScope,
        attempt: Uuid,
    ) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        Self::release_nonexecuted_customer_balance_in_tx(&mut tx, scope, attempt).await?;
        tx.commit().await?;
        Ok(())
    }

    pub(crate) async fn release_nonexecuted_customer_balance_in_tx(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        scope: TenantScope,
        attempt: Uuid,
    ) -> Result<(), StoreError> {
        sqlx::query("SELECT id FROM organizations WHERE id=$1 FOR SHARE")
            .bind(scope.organization_id)
            .fetch_optional(&mut **tx)
            .await?
            .ok_or(StoreError::Conflict)?;

        sqlx::query("SELECT c.id FROM customer_balance_accounts c JOIN customer_attempt_balance_accounts b ON b.account_id=c.id WHERE b.attempt_id=$1 AND b.organization_id=$2 AND b.project_id=$3 FOR UPDATE OF c")
            .bind(attempt).bind(scope.organization_id).bind(scope.project_id).fetch_optional(&mut **tx).await?.ok_or(StoreError::Conflict)?;
        let state: String = sqlx::query_scalar("SELECT execution FROM attempts WHERE id=$1 AND organization_id=$2 AND project_id=$3 FOR UPDATE")
            .bind(attempt).bind(scope.organization_id).bind(scope.project_id).fetch_one(&mut **tx).await?;
        if !matches!(state.as_str(), "not_sent" | "confirmed_not_executed") {
            return Err(StoreError::Unresolved);
        }
        sqlx::query("UPDATE customer_balance_reservations SET released_at=now() WHERE attempt_id=$1 AND released_at IS NULL")
            .bind(attempt).execute(&mut **tx).await?;
        Ok(())
    }

    /// Internal settlement boundary: caller must authenticate the funding source
    /// and verify settlement. Never expose this as an unverified customer top-up.
    pub async fn record_settled_customer_funding(
        &self,
        organization: Uuid,
        currency: &str,
        amount_nanos: i64,
        channel: &str,
        payment_reference: &str,
    ) -> Result<Uuid, StoreError> {
        if amount_nanos <= 0
            || currency.len() != 3
            || !currency.bytes().all(|b| b.is_ascii_uppercase())
            || channel.trim().is_empty()
            || channel.len() > 100
            || payment_reference.trim().is_empty()
            || payment_reference.len() > 200
            || channel
                .chars()
                .chain(payment_reference.chars())
                .any(char::is_control)
            || channel != channel.trim()
            || payment_reference != payment_reference.trim()
        {
            return Err(StoreError::InvalidPrice);
        }
        let mut tx = self.pool.begin().await?;
        // Serialize account creation and same-company callback retries.
        sqlx::query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE")
            .bind(organization)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        let prior: Option<(Uuid, Uuid, String, i64)> = sqlx::query_as("SELECT entry_id,organization_id,currency,amount_nanos FROM customer_funding_receipts WHERE channel=$1 AND payment_reference=$2")
            .bind(channel).bind(payment_reference).fetch_optional(&mut *tx).await?;
        if let Some((entry, owner, saved_currency, saved_amount)) = prior {
            return if owner == organization
                && saved_currency == currency
                && saved_amount == amount_nanos
            {
                Ok(entry)
            } else {
                Err(StoreError::Conflict)
            };
        }
        sqlx::query("INSERT INTO customer_balance_accounts(id,organization_id,currency) VALUES($1,$2,$3) ON CONFLICT(organization_id,currency) DO NOTHING")
            .bind(Uuid::new_v4()).bind(organization).bind(currency).execute(&mut *tx).await?;
        let account: Uuid = sqlx::query_scalar("SELECT id FROM customer_balance_accounts WHERE organization_id=$1 AND currency=$2 FOR UPDATE")
            .bind(organization).bind(currency).fetch_one(&mut *tx).await?;
        let entry = Uuid::new_v4();
        sqlx::query("INSERT INTO customer_balance_entries(id,organization_id,account_id,currency,kind,amount_nanos,idempotency_key) VALUES($1,$2,$3,$4,'funding',$5,$1)")
            .bind(entry).bind(organization).bind(account).bind(currency).bind(amount_nanos).execute(&mut *tx).await?;
        let inserted = sqlx::query("INSERT INTO customer_funding_receipts(channel,payment_reference,organization_id,account_id,currency,entry_id,amount_nanos) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING")
            .bind(channel).bind(payment_reference).bind(organization).bind(account).bind(currency).bind(entry).bind(amount_nanos).execute(&mut *tx).await?;
        if inserted.rows_affected() != 1 {
            return Err(StoreError::Conflict);
        }
        tx.commit().await?;
        Ok(entry)
    }

    /// Organization-level account data. Callers must authorize account access;
    /// workspace-only read permission is insufficient for a shared balance.
    /// Posted headroom excludes reservations and is not an admission guarantee.
    pub async fn customer_balance_summary(
        &self,
        organization: Uuid,
    ) -> Result<Vec<Value>, StoreError> {
        // One statement snapshot for every displayed amount. Calling a volatile
        // admission function twice could observe different concurrent commits.
        Ok(sqlx::query_scalar(
            r#"WITH accounts AS MATERIALIZED (
                SELECT a.*,
                    COALESCE((SELECT SUM(e.amount_nanos) FROM customer_balance_entries e
                        WHERE e.account_id=a.id),0) AS balance,
                    COALESCE((SELECT SUM(r.amount_nanos) FROM customer_balance_reservations r
                        WHERE r.account_id=a.id AND r.released_at IS NULL),0) AS reserved,
                    COALESCE((SELECT SUM(GREATEST(r.amount_nanos, COALESCE(m.amount_nanos,0)))
                        FROM customer_balance_reservations r
                        LEFT JOIN customer_media_charges m ON m.attempt_id=r.attempt_id
                        WHERE r.account_id=a.id AND r.released_at IS NULL
                          AND NOT EXISTS (SELECT 1 FROM customer_balance_entries e
                              WHERE e.attempt_id=r.attempt_id AND e.kind='charge')),0) AS outstanding
                FROM customer_balance_accounts a WHERE a.organization_id=$1
            )
            SELECT jsonb_build_object(
                'currency',currency,'balance_nanos',balance::text,
                'credit_limit_nanos',credit_limit_nanos::text,
                'policy_revision',policy_revision::text,
                'warning_threshold_nanos',warning_threshold_nanos::text,
                'low_balance',CASE WHEN warning_threshold_nanos IS NULL THEN false
                    ELSE balance<warning_threshold_nanos END,
                'posted_credit_exhausted',balance+credit_limit_nanos<=0,
                'reserved_nanos',reserved::text,'outstanding_nanos',outstanding::text,
                'available_nanos',(balance+credit_limit_nanos-outstanding)::text
            ) FROM accounts ORDER BY currency"#,
        ).bind(organization).fetch_all(&self.pool).await?)
    }

    /// Complete customer catalog prices; this compatibility map has no cursor.
    /// Never joins Supplier offers or upstream costs.
    pub async fn customer_model_prices(
        &self,
        scope: TenantScope,
    ) -> Result<std::collections::BTreeMap<String, Value>, StoreError> {
        let rows: Vec<(String, Value)> = sqlx::query_as("SELECT t.model_alias,jsonb_build_object('revision',r.id,'currency',r.currency,'unit','nanounits_per_million_tokens','prompt_rate',r.prompt_rate::text,'completion_rate',r.completion_rate::text,'cached_prompt_rate',r.cached_prompt_rate::text,'minimum_charge_nanos',r.minimum_charge_nanos::text,'request_fee_nanos',r.request_fee_nanos::text) FROM customer_tariffs t JOIN customer_tariff_revisions r ON r.id=t.current_revision WHERE t.organization_id=$1 AND t.project_id=$2 ORDER BY t.model_alias")
            .bind(scope.organization_id).bind(scope.project_id).fetch_all(&self.pool).await?;
        Ok(rows.into_iter().collect())
    }

    pub async fn publish_customer_tariff(
        &self,
        scope: TenantScope,
        input: &ProviderOfferInput,
    ) -> Result<Uuid, StoreError> {
        self.publish_customer_tariff_with_cache(scope, input, None)
            .await
    }

    /// Missing cache-rate input cannot silently reset an existing cached tariff.
    pub async fn publish_customer_tariff_with_cache(
        &self,
        scope: TenantScope,
        input: &ProviderOfferInput,
        cached_prompt_rate: Option<Option<&str>>,
    ) -> Result<Uuid, StoreError> {
        self.publish_customer_tariff_with_minimum(scope, input, cached_prompt_rate, None)
            .await
    }

    /// The minimum is a retail currency amount, not a per-million-token rate.
    pub async fn publish_customer_tariff_with_minimum(
        &self,
        scope: TenantScope,
        input: &ProviderOfferInput,
        cached_prompt_rate: Option<Option<&str>>,
        minimum_charge_nanos: Option<&str>,
    ) -> Result<Uuid, StoreError> {
        self.publish_customer_tariff_with_fixed(
            scope,
            input,
            cached_prompt_rate,
            minimum_charge_nanos,
            None,
        )
        .await
    }

    /// Fixed fees and floors are pinned retail amounts, independent of Supplier rates.
    pub async fn publish_customer_tariff_with_fixed(
        &self,
        scope: TenantScope,
        input: &ProviderOfferInput,
        cached_prompt_rate: Option<Option<&str>>,
        minimum_charge_nanos: Option<&str>,
        request_fee_nanos: Option<&str>,
    ) -> Result<Uuid, StoreError> {
        let request_fee = match request_fee_nanos {
            Some(value) if !value.is_empty() && value.bytes().all(|b| b.is_ascii_digit()) => {
                value.parse::<i64>().map_err(|_| StoreError::InvalidPrice)?
            }
            Some(_) => return Err(StoreError::InvalidPrice),
            None => 0,
        };
        let minimum = match minimum_charge_nanos {
            Some(value) if !value.is_empty() && value.bytes().all(|b| b.is_ascii_digit()) => {
                value.parse::<i64>().map_err(|_| StoreError::InvalidPrice)?
            }
            Some(_) => return Err(StoreError::InvalidPrice),
            None => 0,
        };
        let cached = cached_prompt_rate
            .flatten()
            .map(crate::pricing::parse_token_rate)
            .transpose()?;
        let prompt = crate::pricing::parse_token_rate(&input.prompt_rate)?;
        let completion = crate::pricing::parse_token_rate(&input.completion_rate)?;
        if input.currency.len() != 3
            || !input.currency.bytes().all(|b| b.is_ascii_uppercase())
            || input.model_alias.trim().is_empty()
            || input.model_alias.len() > 200
        {
            return Err(StoreError::InvalidPrice);
        }
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT id FROM projects WHERE organization_id=$1 AND id=$2 FOR UPDATE")
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        let existing:Option<(Uuid,Uuid,Option<i64>,i64,i64)>=sqlx::query_as("SELECT t.id,t.current_revision,r.cached_prompt_rate,r.minimum_charge_nanos,r.request_fee_nanos FROM customer_tariffs t JOIN customer_tariff_revisions r ON r.id=t.current_revision WHERE t.organization_id=$1 AND t.project_id=$2 AND t.model_alias=$3 FOR UPDATE OF t").bind(scope.organization_id).bind(scope.project_id).bind(&input.model_alias).fetch_optional(&mut *tx).await?;
        let tariff = match existing {
            Some((id, revision, prior_cached, prior_minimum, prior_fee)) => {
                if (prior_cached.is_some() && cached_prompt_rate.is_none())
                    || (prior_minimum != 0 && minimum_charge_nanos.is_none())
                    || (prior_fee != 0 && request_fee_nanos.is_none())
                    || input.expected_revision != Some(revision)
                {
                    return Err(StoreError::Conflict);
                }
                id
            }
            None => {
                if input.expected_revision.is_some() {
                    return Err(StoreError::Conflict);
                }
                let id = Uuid::new_v4();
                sqlx::query("INSERT INTO customer_tariffs(id,organization_id,project_id,model_alias) VALUES($1,$2,$3,$4)").bind(id).bind(scope.organization_id).bind(scope.project_id).bind(&input.model_alias).execute(&mut *tx).await?;
                id
            }
        };
        let revision = Uuid::new_v4();
        sqlx::query("INSERT INTO customer_tariff_revisions(id,tariff_id,currency,prompt_rate,completion_rate,cached_prompt_rate,minimum_charge_nanos,request_fee_nanos) VALUES($1,$2,$3,$4,$5,$6,$7,$8)").bind(revision).bind(tariff).bind(&input.currency).bind(prompt).bind(completion).bind(cached).bind(minimum).bind(request_fee).execute(&mut *tx).await?;
        sqlx::query("UPDATE customer_tariffs SET current_revision=$2 WHERE id=$1")
            .bind(tariff)
            .bind(revision)
            .execute(&mut *tx)
            .await?;
        sqlx::query("INSERT INTO customer_billing_audit(organization_id,project_id,action,resource_id) VALUES($1,$2,'tariff_published',$3)").bind(scope.organization_id).bind(scope.project_id).bind(revision).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(revision)
    }
    pub async fn bind_customer_tariff(
        &self,
        scope: TenantScope,
        attempt: Uuid,
        alias: &str,
    ) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        Self::bind_customer_tariff_in_tx(&mut tx, scope, attempt, alias).await?;
        tx.commit().await?;
        Ok(())
    }

    pub(crate) async fn bind_customer_tariff_in_tx(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        scope: TenantScope,
        attempt: Uuid,
        alias: &str,
    ) -> Result<(), StoreError> {
        sqlx::query("SELECT id FROM projects WHERE organization_id=$1 AND id=$2 FOR SHARE")
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .fetch_optional(&mut **tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        sqlx::query("INSERT INTO customer_attempt_tariffs(attempt_id,revision_id) SELECT a.id,COALESCE(pinned.revision_id,t.current_revision) FROM attempts a JOIN customer_tariffs t ON t.organization_id=a.organization_id AND t.project_id=a.project_id AND t.model_alias=a.resource_id LEFT JOIN customer_operation_tariffs pinned ON pinned.operation_id=a.operation_id WHERE a.id=$1 AND a.organization_id=$2 AND a.project_id=$3 AND a.resource_id=$4 AND a.execution='not_sent'").bind(attempt).bind(scope.organization_id).bind(scope.project_id).bind(alias).execute(&mut **tx).await?;
        sqlx::query("INSERT INTO customer_attempt_balance_accounts(attempt_id,organization_id,project_id,account_id,currency) SELECT a.id,a.organization_id,a.project_id,c.id,c.currency FROM attempts a JOIN customer_attempt_tariffs b ON b.attempt_id=a.id JOIN customer_tariff_revisions r ON r.id=b.revision_id JOIN customer_balance_accounts c ON c.organization_id=a.organization_id AND c.currency=r.currency WHERE a.id=$1 AND a.organization_id=$2 AND a.project_id=$3 AND a.execution='not_sent' ON CONFLICT(attempt_id) DO NOTHING")
            .bind(attempt).bind(scope.organization_id).bind(scope.project_id).execute(&mut **tx).await?;
        Ok(())
    }
    pub async fn accrue_customer_charge(&self, attempt: Uuid) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        Self::accrue_customer_charge_in_tx(&mut tx, attempt).await?;
        tx.commit().await?;
        Ok(())
    }

    pub(crate) async fn accrue_customer_charge_in_tx(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        attempt: Uuid,
    ) -> Result<(), StoreError> {
        let row=sqlx::query("SELECT a.organization_id,a.project_id,b.revision_id,r.currency,r.prompt_rate,r.completion_rate,r.cached_prompt_rate,r.minimum_charge_nanos,r.request_fee_nanos,a.prompt_tokens,a.completion_tokens,d.cached_input_tokens FROM attempts a LEFT JOIN request_token_categories d ON d.attempt_id=a.id JOIN customer_attempt_tariffs b ON b.attempt_id=a.id JOIN customer_tariff_revisions r ON r.id=b.revision_id WHERE a.id=$1 AND a.execution='confirmed_completed' AND a.usage_confidence='provider_reported'").bind(attempt).fetch_optional(&mut **tx).await?;
        if let Some(row) = row {
            let prompt: i64 = row.get("prompt_tokens");
            let completion: i64 = row.get("completion_tokens");
            let rates = TokenRates {
                prompt: row.get("prompt_rate"),
                completion: row.get("completion_rate"),
            };
            let (amount, cached_tokens) = match row.get::<Option<i64>, _>("cached_prompt_rate") {
                Some(rate) => {
                    let cached = row
                        .get::<Option<i64>, _>("cached_input_tokens")
                        .ok_or(StoreError::Unresolved)?;
                    (
                        rates.charge_with_cached_prompt(prompt, completion, cached, rate)?,
                        Some(cached),
                    )
                }
                None => (rates.charge(prompt, completion)?, None),
            };
            let amount = crate::pricing::customer_charge_with_fixed(
                amount,
                row.get("request_fee_nanos"),
                row.get("minimum_charge_nanos"),
            )?;
            sqlx::query("INSERT INTO customer_charges(attempt_id,organization_id,project_id,revision_id,currency,amount_nanos,prompt_tokens,completion_tokens,cached_prompt_tokens) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(attempt_id) DO NOTHING").bind(attempt).bind(row.get::<Uuid,_>("organization_id")).bind(row.get::<Uuid,_>("project_id")).bind(row.get::<Uuid,_>("revision_id")).bind(row.get::<String,_>("currency")).bind(amount).bind(prompt).bind(completion).bind(cached_tokens).execute(&mut **tx).await?;
        }
        // Serialize with future admission/funding changes on this account. Read
        // the immutable charge, never a client price or Supplier expense.
        let account: Option<Uuid> = sqlx::query_scalar("SELECT c.id FROM customer_balance_accounts c JOIN customer_attempt_balance_accounts b ON b.account_id=c.id AND b.organization_id=c.organization_id AND b.currency=c.currency WHERE b.attempt_id=$1 FOR UPDATE OF c")
            .bind(attempt).fetch_optional(&mut **tx).await?;
        if let Some(account) = account {
            sqlx::query("INSERT INTO customer_balance_entries(id,organization_id,account_id,currency,kind,amount_nanos,idempotency_key,project_id,attempt_id) SELECT $1,c.organization_id,b.account_id,c.currency,'charge',-c.amount_nanos,c.attempt_id,c.project_id,c.attempt_id FROM customer_charges c JOIN customer_attempt_balance_accounts b ON b.attempt_id=c.attempt_id AND b.organization_id=c.organization_id AND b.project_id=c.project_id AND b.currency=c.currency WHERE c.attempt_id=$2 AND b.account_id=$3 AND c.amount_nanos>0 ON CONFLICT DO NOTHING")
                .bind(Uuid::new_v4()).bind(attempt).bind(account).execute(&mut **tx).await?;
            sqlx::query("UPDATE customer_balance_reservations SET released_at=now() WHERE attempt_id=$1 AND released_at IS NULL AND EXISTS(SELECT 1 FROM customer_charges WHERE attempt_id=$1)")
                .bind(attempt).execute(&mut **tx).await?;
        }
        Ok(())
    }
    pub async fn recover_customer_charges(
        &self,
        after: Option<Uuid>,
    ) -> Result<(Option<Uuid>, usize), StoreError> {
        Ok(self
            .recover_financial_stage(
                crate::financial_recovery::FinancialStage::CustomerCharge,
                Some(after),
            )
            .await?
            .unwrap_or((after, 0)))
    }
    /// Closed UTC dispatch interval, one currency, no overlaps or unresolved priced usage.
    pub async fn issue_customer_invoice(
        &self,
        scope: TenantScope,
        from: i64,
        to: i64,
        currency: &str,
        key: Uuid,
    ) -> Result<Uuid, StoreError> {
        if from < 0
            || to <= from
            || to - from > 366 * 86_400_000
            || currency.len() != 3
            || !currency.bytes().all(|b| b.is_ascii_uppercase())
        {
            return Err(StoreError::InvalidPrice);
        }
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT id FROM projects WHERE organization_id=$1 AND id=$2 FOR UPDATE")
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        if let Some((id,old_from,old_to,old_currency))=sqlx::query_as::<_,(Uuid,i64,i64,String)>("SELECT id,from_ms,to_ms,currency FROM customer_invoices WHERE organization_id=$1 AND project_id=$2 AND idempotency_key=$3").bind(scope.organization_id).bind(scope.project_id).bind(key).fetch_optional(&mut *tx).await?{if old_from!=from || old_to!=to || old_currency!=currency{return Err(StoreError::Conflict);}return Ok(id);}
        let future: bool = sqlx::query_scalar(
            "SELECT $1>floor(extract(epoch FROM clock_timestamp())*1000)::bigint",
        )
        .bind(to)
        .fetch_one(&mut *tx)
        .await?;
        if future {
            return Err(StoreError::InvalidPrice);
        }
        let overlaps:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM customer_invoices WHERE organization_id=$1 AND project_id=$2 AND currency=$3 AND from_ms<$5 AND to_ms>$4)").bind(scope.organization_id).bind(scope.project_id).bind(currency).bind(from).bind(to).fetch_one(&mut *tx).await?;
        if overlaps {
            return Err(StoreError::Conflict);
        }
        let unresolved: bool = sqlx::query_scalar(include_str!("customer_invoice_unresolved.sql"))
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .bind(currency)
            .bind(from)
            .bind(to)
            .fetch_one(&mut *tx)
            .await?;
        if unresolved {
            return Err(StoreError::Unresolved);
        }
        let (amount,total):(String,i64)=sqlx::query_as("SELECT COALESCE(SUM(c.amount_nanos),0)::text,COUNT(*) FROM customer_invoice_charge_sources c JOIN attempts a ON a.id=c.attempt_id WHERE c.organization_id=$1 AND c.project_id=$2 AND c.currency=$3 AND a.dispatched_at>=to_timestamp($4::double precision/1000) AND a.dispatched_at<to_timestamp($5::double precision/1000)").bind(scope.organization_id).bind(scope.project_id).bind(currency).bind(from).bind(to).fetch_one(&mut *tx).await?;
        if total == 0 {
            return Err(StoreError::Conflict);
        }
        let amount = amount
            .parse::<i64>()
            .map_err(|_| StoreError::AggregateOverflow)?;
        let id = Uuid::new_v4();
        sqlx::query("INSERT INTO customer_invoices(id,organization_id,project_id,from_ms,to_ms,currency,amount_nanos,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8)").bind(id).bind(scope.organization_id).bind(scope.project_id).bind(from).bind(to).bind(currency).bind(amount).bind(key).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO customer_invoice_entries(invoice_id,organization_id,project_id,attempt_id) SELECT $1,c.organization_id,c.project_id,c.attempt_id FROM customer_invoice_charge_sources c JOIN attempts a ON a.id=c.attempt_id WHERE c.organization_id=$2 AND c.project_id=$3 AND c.currency=$4 AND a.dispatched_at>=to_timestamp($5::double precision/1000) AND a.dispatched_at<to_timestamp($6::double precision/1000)").bind(id).bind(scope.organization_id).bind(scope.project_id).bind(currency).bind(from).bind(to).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO customer_billing_audit(organization_id,project_id,action,resource_id) VALUES($1,$2,'invoice_issued',$3)").bind(scope.organization_id).bind(scope.project_id).bind(id).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(id)
    }
    pub async fn record_customer_payment(
        &self,
        scope: TenantScope,
        invoice: Uuid,
        reference: &str,
    ) -> Result<(), StoreError> {
        let reference = reference.trim();
        if reference.trim().is_empty()
            || reference.len() > 200
            || reference.chars().any(char::is_control)
        {
            return Err(StoreError::InvalidPrice);
        }
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT id FROM customer_invoices WHERE id=$1 AND organization_id=$2 AND project_id=$3 FOR UPDATE").bind(invoice).bind(scope.organization_id).bind(scope.project_id).fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        if let Some(prior) = sqlx::query_scalar::<_, String>(
            "SELECT payment_reference FROM customer_invoice_payments WHERE invoice_id=$1",
        )
        .bind(invoice)
        .fetch_optional(&mut *tx)
        .await?
        {
            return if prior == reference {
                Ok(())
            } else {
                Err(StoreError::Conflict)
            };
        }
        // This API records a full external invoice payment, not a top-up or a
        // partial payment. Balance-bound charges must settle through their
        // pinned account, even if recovery has not posted the debit yet.
        // Inspect the immutable binding rather than racing the debit worker.
        let receivable: bool = sqlx::query_scalar(
            "SELECT i.amount_nanos>0 AND EXISTS(SELECT 1 FROM customer_invoice_entries e WHERE e.invoice_id=i.id) AND NOT EXISTS(SELECT 1 FROM customer_invoice_entries e JOIN customer_attempt_balance_accounts b ON b.attempt_id=e.attempt_id WHERE e.invoice_id=i.id) FROM customer_invoices i WHERE i.id=$1 AND i.organization_id=$2 AND i.project_id=$3",
        )
        .bind(invoice)
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .fetch_one(&mut *tx)
        .await?;
        if !receivable {
            return Err(StoreError::Conflict);
        }
        let duplicate: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM customer_invoice_payments WHERE payment_reference=$1)",
        )
        .bind(reference)
        .fetch_one(&mut *tx)
        .await?;
        if duplicate {
            return Err(StoreError::Conflict);
        }
        let inserted = sqlx::query(
            "INSERT INTO customer_invoice_payments(invoice_id,payment_reference) VALUES($1,$2) ON CONFLICT DO NOTHING",
        )
        .bind(invoice)
        .bind(reference)
        .execute(&mut *tx)
        .await?;
        if inserted.rows_affected() != 1 {
            return Err(StoreError::Conflict);
        }
        sqlx::query("INSERT INTO customer_billing_audit(organization_id,project_id,action,resource_id) VALUES($1,$2,'external_payment_recorded',$3)").bind(scope.organization_id).bind(scope.project_id).bind(invoice).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(())
    }
    pub async fn customer_billing(&self, scope: TenantScope) -> Result<Value, StoreError> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
            .execute(&mut *tx)
            .await?;
        let (balances, invoices): (Value, Value) =
            sqlx::query_as(include_str!("customer_billing_summary.sql"))
                .bind(scope.organization_id)
                .bind(scope.project_id)
                .fetch_one(&mut *tx)
                .await?;
        let (unresolved, unpriced): (String, String) =
            sqlx::query_as(include_str!("customer_billing_pending.sql"))
                .bind(scope.organization_id)
                .bind(scope.project_id)
                .fetch_one(&mut *tx)
                .await?;
        let tariffs:Vec<Value>=sqlx::query_scalar("SELECT jsonb_build_object('model_alias',t.model_alias,'revision',r.id,'currency',r.currency,'prompt_rate',r.prompt_rate::text,'completion_rate',r.completion_rate::text,'cached_prompt_rate',r.cached_prompt_rate::text,'minimum_charge_nanos',r.minimum_charge_nanos::text,'request_fee_nanos',r.request_fee_nanos::text) FROM customer_tariffs t JOIN customer_tariff_revisions r ON r.id=t.current_revision WHERE t.organization_id=$1 AND t.project_id=$2 ORDER BY t.model_alias").bind(scope.organization_id).bind(scope.project_id).fetch_all(&mut *tx).await?;

        tx.commit().await?;
        Ok(
            json!({"balances":balances,"unresolved":unresolved,"unpriced":unpriced,"tariffs":tariffs,"invoices":invoices}),
        )
    }
    pub async fn customer_invoice_media_lines(
        &self,
        scope: TenantScope,
        invoice: Uuid,
        after: Option<Uuid>,
    ) -> Result<(Vec<Value>, Option<Uuid>), StoreError> {
        let mut rows: Vec<(Uuid, Value)> =
            sqlx::query_as(include_str!("customer_invoice_media_lines.sql"))
                .bind(scope.organization_id)
                .bind(scope.project_id)
                .bind(invoice)
                .bind(after)
                .fetch_all(&self.pool)
                .await?;
        let next = if rows.len() > 100 {
            rows.truncate(100);
            rows.last().map(|(id, _)| *id)
        } else {
            None
        };
        Ok((rows.into_iter().map(|(_, line)| line).collect(), next))
    }
    pub async fn customer_invoice_lines(
        &self,
        scope: TenantScope,
        invoice: Uuid,
    ) -> Result<Vec<Value>, StoreError> {
        Ok(sqlx::query_scalar("SELECT jsonb_build_object('model_alias',t.model_alias,'revision',r.id,'prompt_rate',r.prompt_rate::text,'completion_rate',r.completion_rate::text,'cached_prompt_rate',r.cached_prompt_rate::text,'minimum_charge_nanos',r.minimum_charge_nanos::text,'request_fee_nanos',r.request_fee_nanos::text,'currency',c.currency,'requests',COUNT(*)::text,'prompt_tokens',SUM(c.prompt_tokens)::text,'completion_tokens',SUM(c.completion_tokens)::text,'cached_prompt_tokens',SUM(c.cached_prompt_tokens)::text,'amount_nanos',SUM(c.amount_nanos)::text) FROM customer_invoice_entries e JOIN customer_charges c ON c.attempt_id=e.attempt_id JOIN customer_tariff_revisions r ON r.id=c.revision_id JOIN customer_tariffs t ON t.id=r.tariff_id WHERE e.organization_id=$1 AND e.project_id=$2 AND e.invoice_id=$3 GROUP BY t.model_alias,r.id,r.prompt_rate,r.completion_rate,c.currency ORDER BY t.model_alias,r.id").bind(scope.organization_id).bind(scope.project_id).bind(invoice).fetch_all(&self.pool).await?)
    }
}

pub(crate) async fn reserve_customer_balance_in_tx(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    scope: TenantScope,
    attempt: Uuid,
    maximum_nanos: i64,
) -> Result<(), StoreError> {
    if maximum_nanos <= 0 {
        return Err(StoreError::InvalidPrice);
    }
    sqlx::query("SELECT id FROM organizations WHERE id=$1 FOR SHARE")
        .bind(scope.organization_id)
        .fetch_optional(&mut **tx)
        .await?
        .ok_or(StoreError::Conflict)?;
    // Pinning the attempt's account has already acquired a foreign-key KEY
    // SHARE lock in this transaction. Concurrent admissions must not upgrade
    // those compatible locks to FOR UPDATE and deadlock each other. We never
    // change account keys here; NO KEY UPDATE still serializes all reservations
    // and conflicts with policy/funding writers while allowing foreign-key pins.
    let account: Uuid = sqlx::query_scalar("SELECT c.id FROM customer_balance_accounts c JOIN customer_attempt_balance_accounts b ON b.account_id=c.id AND b.organization_id=c.organization_id AND b.currency=c.currency WHERE b.attempt_id=$1 AND b.organization_id=$2 AND b.project_id=$3 FOR NO KEY UPDATE OF c")
            .bind(attempt).bind(scope.organization_id).bind(scope.project_id).fetch_optional(&mut **tx).await?.ok_or(StoreError::Conflict)?;
    let state: String = sqlx::query_scalar("SELECT execution FROM attempts WHERE id=$1 AND organization_id=$2 AND project_id=$3 FOR UPDATE")
            .bind(attempt).bind(scope.organization_id).bind(scope.project_id).fetch_one(&mut **tx).await?;
    if state != "not_sent" {
        return Err(StoreError::Conflict);
    }
    let prior: Option<(i64, bool)> = sqlx::query_as("SELECT amount_nanos,released_at IS NULL FROM customer_balance_reservations WHERE attempt_id=$1")
            .bind(attempt).fetch_optional(&mut **tx).await?;
    if let Some((amount, held)) = prior {
        return if amount == maximum_nanos && held {
            Ok(())
        } else {
            Err(StoreError::Conflict)
        };
    }
    let funded: bool = sqlx::query_scalar("SELECT COALESCE((SELECT SUM(e.amount_nanos) FROM customer_balance_entries e WHERE e.account_id=a.id),0)+a.credit_limit_nanos-niu_customer_account_outstanding(a.id)>=$2 FROM customer_balance_accounts a WHERE a.id=$1")
            .bind(account).bind(maximum_nanos).fetch_one(&mut **tx).await?;
    if !funded {
        return Err(StoreError::BudgetExceeded);
    }
    let within_workspace: bool = sqlx::query_scalar("SELECT NOT EXISTS(SELECT 1 FROM customer_workspace_spending_limits l WHERE l.organization_id=$1 AND l.project_id=$2 AND l.account_id=$3 AND niu_customer_workspace_committed(l.organization_id,l.project_id,l.account_id)+$4>l.limit_nanos)")
        .bind(scope.organization_id).bind(scope.project_id).bind(account).bind(maximum_nanos)
        .fetch_one(&mut **tx).await?;
    if !within_workspace {
        return Err(StoreError::WorkspaceSpendingLimitExceeded);
    }
    let within_key: bool = sqlx::query_scalar("SELECT NOT EXISTS(SELECT 1 FROM customer_key_spending_limits l WHERE l.account_id=$1 AND l.spending_root_id=niu_customer_attempt_spending_root($2) AND l.limit_nanos IS NOT NULL AND niu_customer_key_committed(l.spending_root_id,l.account_id)+$3>l.limit_nanos)")
        .bind(account).bind(attempt).bind(maximum_nanos).fetch_one(&mut **tx).await?;
    if !within_key {
        return Err(StoreError::KeySpendingLimitExceeded);
    }
    sqlx::query("INSERT INTO customer_balance_reservations(attempt_id,organization_id,account_id,currency,amount_nanos) SELECT attempt_id,organization_id,account_id,currency,$2 FROM customer_attempt_balance_accounts WHERE attempt_id=$1")
            .bind(attempt).bind(maximum_nanos).execute(&mut **tx).await?;
    Ok(())
}
