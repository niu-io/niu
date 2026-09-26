use crate::{Store, StoreError, TenantScope};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

macro_rules! text_enum {
    ($name:ident { $($variant:ident => $value:literal),+ $(,)? }) => {
        #[derive(Clone, Copy, Debug, Deserialize, Serialize)]
        pub enum $name { $(#[serde(rename = $value)] $variant),+ }
        impl $name { fn as_str(self) -> &'static str { match self { $(Self::$variant => $value),+ } } }
    }
}
text_enum!(AuthMode { ApiKey => "api_key", OAuthRefresh => "oauth_refresh" });
text_enum!(BillingMode { MeteredApi => "metered_api", Subscription => "subscription" });
text_enum!(AccountHealth { Unverified => "unverified", Ready => "ready", Cooldown => "cooldown", AuthenticationExpired => "authentication_expired", Disabled => "disabled" });
text_enum!(QuotaUnit { Tokens => "tokens", Requests => "requests", MillionthsOfWindow => "millionths_of_window" });

#[derive(Deserialize)]
pub struct AccountInput {
    pub provider: String,
    pub plan: String,
    pub authentication_mode: AuthMode,
    pub billing_mode: BillingMode,
    pub credential_reference: String,
    pub concurrency_limit: i32,
}

#[derive(sqlx::FromRow, Serialize)]
pub struct AccountView {
    pub id: Uuid,
    pub provider: String,
    pub plan: String,
    pub authentication_mode: String,
    pub billing_mode: String,
    pub credential_revision: i64,
    pub health: String,
    pub concurrency_limit: i32,
    pub refreshing: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct QuotaInput {
    pub schema_version: u16,
    pub window_key: String,
    pub unit: QuotaUnit,
    pub remaining: Option<i64>,
    pub maximum: Option<i64>,
    pub observed_at_ms: i64,
    pub valid_until_ms: i64,
    pub resets_at_ms: i64,
    pub source: String,
}

#[derive(sqlx::FromRow, Serialize)]
pub struct QuotaView {
    pub window_key: String,
    pub unit: String,
    /// Decimal strings preserve exact PostgreSQL BIGINT values in JavaScript.
    pub remaining: Option<String>,
    pub maximum: Option<String>,
    pub observed_at_ms: i64,
    pub valid_until_ms: i64,
    pub resets_at_ms: i64,
    pub source: String,
    /// Previous snapshot is a capacity baseline, not a claim that executions
    /// in the interval have been attributed to the provider's quota change.
    pub previous_remaining: Option<String>,
    pub previous_observed_at_ms: Option<i64>,
    pub fresh: bool,
}

fn reference_valid(reference: &str) -> bool {
    reference
        .strip_prefix("env:")
        .or_else(|| reference.strip_prefix("secret:"))
        .is_some_and(|name| {
            !name.is_empty()
                && name.len() <= 200
                && name
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"_./-".contains(&b))
        })
}
fn label_valid(label: &str, max: usize) -> bool {
    !label.trim().is_empty() && label.len() <= max
}

impl Store {
    pub async fn create_account(
        &self,
        scope: TenantScope,
        input: &AccountInput,
    ) -> Result<Uuid, StoreError> {
        if !label_valid(&input.provider, 100)
            || !label_valid(&input.plan, 200)
            || !reference_valid(&input.credential_reference)
            || !(1..=10000).contains(&input.concurrency_limit)
        {
            return Err(StoreError::InvalidAccount);
        }
        let id = Uuid::new_v4();
        sqlx::query("INSERT INTO supplier_accounts (id,organization_id,project_id,provider,plan,authentication_mode,billing_mode,credential_reference,concurrency_limit) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)")
            .bind(id).bind(scope.organization_id).bind(scope.project_id).bind(&input.provider).bind(&input.plan).bind(input.authentication_mode.as_str()).bind(input.billing_mode.as_str()).bind(&input.credential_reference).bind(input.concurrency_limit).execute(&self.pool).await?;
        Ok(id)
    }

    pub async fn accounts(&self, scope: TenantScope) -> Result<Vec<AccountView>, StoreError> {
        Ok(sqlx::query_as("SELECT id,provider,plan,authentication_mode,billing_mode,credential_revision,health,concurrency_limit,refresh_owner IS NOT NULL AS refreshing FROM supplier_accounts WHERE organization_id=$1 AND project_id=$2 ORDER BY created_at,id LIMIT 1000")
            .bind(scope.organization_id).bind(scope.project_id).fetch_all(&self.pool).await?)
    }

    pub async fn set_account_health(
        &self,
        scope: TenantScope,
        id: Uuid,
        health: AccountHealth,
    ) -> Result<(), StoreError> {
        let changed = sqlx::query("UPDATE supplier_accounts SET health=$4 WHERE organization_id=$1 AND project_id=$2 AND id=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(id).bind(health.as_str()).execute(&self.pool).await?.rows_affected();
        if changed != 1 {
            return Err(StoreError::Conflict);
        }
        Ok(())
    }

    /// Refresh is account-scoped and requires no in-flight assignments. A lost
    /// owner is not automatically replaced: provider refresh side effects need
    /// explicit recovery before another refresh can safely start.
    pub async fn begin_account_refresh(
        &self,
        scope: TenantScope,
        id: Uuid,
    ) -> Result<Uuid, StoreError> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT id FROM supplier_accounts WHERE organization_id=$1 AND project_id=$2 AND id=$3 FOR UPDATE")
            .bind(scope.organization_id).bind(scope.project_id).bind(id).fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        let owner = Uuid::new_v4();
        let changed = sqlx::query("UPDATE supplier_accounts SET refresh_owner=$4 WHERE id=$3 AND organization_id=$1 AND project_id=$2 AND authentication_mode='oauth_refresh' AND refresh_owner IS NULL AND health <> 'disabled' AND NOT EXISTS (SELECT 1 FROM account_assignments WHERE account_id=$3 AND state='held')")
            .bind(scope.organization_id).bind(scope.project_id).bind(id).bind(owner).execute(&mut *tx).await?.rows_affected();
        if changed != 1 {
            return Err(StoreError::AccountUnavailable);
        }
        tx.commit().await?;
        Ok(owner)
    }

    pub async fn finish_account_refresh(
        &self,
        scope: TenantScope,
        id: Uuid,
        owner: Uuid,
        credential_reference: &str,
    ) -> Result<(), StoreError> {
        if !reference_valid(credential_reference) {
            return Err(StoreError::InvalidAccount);
        }
        let changed = sqlx::query("UPDATE supplier_accounts SET credential_reference=$5,credential_revision=credential_revision+1,refresh_owner=NULL WHERE organization_id=$1 AND project_id=$2 AND id=$3 AND refresh_owner=$4")
            .bind(scope.organization_id).bind(scope.project_id).bind(id).bind(owner).bind(credential_reference).execute(&self.pool).await?.rows_affected();
        if changed != 1 {
            return Err(StoreError::Conflict);
        }
        Ok(())
    }

    /// Create attempt intent and hold an account slot in one transaction. Quota
    /// demand and protocol eligibility are separate checks for the coordinator.
    pub async fn prepare_account_attempt(
        &self,
        scope: TenantScope,
        operation: Uuid,
        resource: &str,
        revision: &str,
        account: Uuid,
    ) -> Result<Uuid, StoreError> {
        let mut tx = self.pool.begin().await?;
        let row = sqlx::query("SELECT health,refresh_owner,credential_revision,concurrency_limit FROM supplier_accounts WHERE organization_id=$1 AND project_id=$2 AND id=$3 FOR UPDATE")
            .bind(scope.organization_id).bind(scope.project_id).bind(account).fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        if row.get::<String, _>("health") != "ready"
            || row.get::<Option<Uuid>, _>("refresh_owner").is_some()
        {
            return Err(StoreError::AccountUnavailable);
        }
        let active: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM account_assignments WHERE account_id=$1 AND state='held'",
        )
        .bind(account)
        .fetch_one(&mut *tx)
        .await?;
        if active >= i64::from(row.get::<i32, _>("concurrency_limit")) {
            return Err(StoreError::AccountUnavailable);
        }
        let attempt = Uuid::new_v4();
        sqlx::query("INSERT INTO attempts (id,organization_id,project_id,operation_id,resource_id,offer_revision) VALUES ($1,$2,$3,$4,$5,$6)")
            .bind(attempt).bind(scope.organization_id).bind(scope.project_id).bind(operation).bind(resource).bind(revision).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO account_assignments (attempt_id,organization_id,project_id,account_id,credential_revision) VALUES ($1,$2,$3,$4,$5)")
            .bind(attempt).bind(scope.organization_id).bind(scope.project_id).bind(account).bind(row.get::<i64,_>("credential_revision")).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(attempt)
    }

    pub async fn release_account_slot(
        &self,
        scope: TenantScope,
        attempt: Uuid,
    ) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        let account: Uuid = sqlx::query_scalar("SELECT account_id FROM account_assignments WHERE organization_id=$1 AND project_id=$2 AND attempt_id=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt).fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        sqlx::query("SELECT id FROM supplier_accounts WHERE id=$1 FOR UPDATE")
            .bind(account)
            .execute(&mut *tx)
            .await?;
        let execution: String =
            sqlx::query_scalar("SELECT execution FROM attempts WHERE id=$1 FOR UPDATE")
                .bind(attempt)
                .fetch_one(&mut *tx)
                .await?;
        if execution == "may_have_executed" {
            return Err(StoreError::Unresolved);
        }
        sqlx::query("UPDATE account_assignments SET state='released' WHERE attempt_id=$1")
            .bind(attempt)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(())
    }

    /// Store provider observations without deriving token balances from ratios.
    /// Out-of-order samples are retained; the latest observed timestamp wins.
    pub async fn observe_quota(
        &self,
        scope: TenantScope,
        account: Uuid,
        input: &QuotaInput,
    ) -> Result<Uuid, StoreError> {
        if input.schema_version != 1 {
            return Err(StoreError::InvalidAccount);
        }
        let mut connection = self.pool.acquire().await?;
        persist_quota(&mut connection, scope, account, input).await
    }

    pub async fn quota(
        &self,
        scope: TenantScope,
        account: Uuid,
    ) -> Result<Vec<QuotaView>, StoreError> {
        Ok(sqlx::query_as("WITH latest AS (SELECT DISTINCT ON (window_key) window_key,unit,remaining,maximum,observed_at_ms,valid_until_ms,resets_at_ms,source FROM quota_observations WHERE organization_id=$1 AND project_id=$2 AND account_id=$3 ORDER BY window_key,observed_at_ms DESC) SELECT latest.window_key,latest.unit,latest.remaining::text AS remaining,latest.maximum::text AS maximum,latest.observed_at_ms,latest.valid_until_ms,latest.resets_at_ms,latest.source,previous.remaining::text AS previous_remaining,previous.observed_at_ms AS previous_observed_at_ms,(latest.remaining IS NOT NULL AND latest.valid_until_ms > floor(extract(epoch FROM clock_timestamp())*1000)::bigint AND latest.resets_at_ms > floor(extract(epoch FROM clock_timestamp())*1000)::bigint) AS fresh FROM latest LEFT JOIN LATERAL (SELECT remaining,observed_at_ms FROM quota_observations WHERE organization_id=$1 AND project_id=$2 AND account_id=$3 AND window_key=latest.window_key AND observed_at_ms<latest.observed_at_ms ORDER BY observed_at_ms DESC LIMIT 1) previous ON TRUE ORDER BY latest.window_key")
            .bind(scope.organization_id).bind(scope.project_id).bind(account).fetch_all(&self.pool).await?)
    }

    /// Permanently remove every imported sample for one provider window.
    /// The account ownership check keeps a miss indistinguishable across
    /// tenants while allowing callers to purge a window's full history.
    pub async fn delete_quota_window(
        &self,
        scope: TenantScope,
        account: Uuid,
        window_key: &str,
    ) -> Result<u64, StoreError> {
        if !label_valid(window_key, 200) {
            return Err(StoreError::InvalidAccount);
        }
        let mut tx = self.pool.begin().await?;
        let owned: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM supplier_accounts WHERE organization_id=$1 AND project_id=$2 AND id=$3)",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(account)
        .fetch_one(&mut *tx)
        .await?;
        if !owned {
            return Err(StoreError::Conflict);
        }
        let deleted = sqlx::query(
            "DELETE FROM quota_observations WHERE organization_id=$1 AND project_id=$2 AND account_id=$3 AND window_key=$4",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(account)
        .bind(window_key)
        .execute(&mut *tx)
        .await?
        .rows_affected();
        tx.commit().await?;
        Ok(deleted)
    }
}

pub(crate) async fn persist_quota(
    connection: &mut sqlx::PgConnection,
    scope: TenantScope,
    account: Uuid,
    input: &QuotaInput,
) -> Result<Uuid, StoreError> {
    if input.schema_version != 1
        || !label_valid(&input.window_key, 200)
        || !label_valid(&input.source, 200)
        || input.observed_at_ms < 0
        || input.valid_until_ms <= input.observed_at_ms
        || input.resets_at_ms <= input.observed_at_ms
        || input.remaining.is_some_and(|v| v < 0)
        || input.maximum.is_some_and(|v| v < 0)
        || input
            .remaining
            .zip(input.maximum)
            .is_some_and(|(r, m)| r > m)
        || matches!(input.unit, QuotaUnit::MillionthsOfWindow)
            && (input.maximum != Some(1_000_000) || input.remaining.is_some_and(|v| v > 1_000_000))
    {
        return Err(StoreError::InvalidAccount);
    }
    let future: bool =
        sqlx::query_scalar("SELECT $1 > floor(extract(epoch FROM clock_timestamp())*1000)::bigint")
            .bind(input.observed_at_ms)
            .fetch_one(&mut *connection)
            .await?;
    if future {
        return Err(StoreError::InvalidAccount);
    }
    let id = Uuid::new_v4();
    let inserted: Option<Uuid> = sqlx::query_scalar("INSERT INTO quota_observations (id,organization_id,project_id,account_id,window_key,unit,remaining,maximum,observed_at_ms,valid_until_ms,resets_at_ms,source) SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12 WHERE $9 <= floor(extract(epoch FROM clock_timestamp())*1000)::bigint AND EXISTS(SELECT 1 FROM supplier_accounts WHERE organization_id=$2 AND project_id=$3 AND id=$4) ON CONFLICT (account_id,window_key,observed_at_ms) DO NOTHING RETURNING id")
            .bind(id).bind(scope.organization_id).bind(scope.project_id).bind(account).bind(&input.window_key).bind(input.unit.as_str()).bind(input.remaining).bind(input.maximum).bind(input.observed_at_ms).bind(input.valid_until_ms).bind(input.resets_at_ms).bind(&input.source).fetch_optional(&mut *connection).await?;
    if let Some(id) = inserted {
        return Ok(id);
    }
    let id = sqlx::query_scalar("SELECT id FROM quota_observations WHERE organization_id=$1 AND project_id=$2 AND account_id=$3 AND window_key=$4 AND observed_at_ms=$5 AND unit=$6 AND remaining IS NOT DISTINCT FROM $7 AND maximum IS NOT DISTINCT FROM $8 AND valid_until_ms=$9 AND resets_at_ms=$10 AND source=$11")
            .bind(scope.organization_id).bind(scope.project_id).bind(account).bind(&input.window_key).bind(input.observed_at_ms).bind(input.unit.as_str()).bind(input.remaining).bind(input.maximum).bind(input.valid_until_ms).bind(input.resets_at_ms).bind(&input.source).fetch_optional(&mut *connection).await?.ok_or(StoreError::Conflict)?;
    Ok(id)
}
