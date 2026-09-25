//! Durable tenant ownership and attempt intent. Credentials, prompts and outputs
//! do not belong in these records. Authorization remains a caller obligation.
use sqlx::{PgPool, postgres::PgPoolOptions};
use uuid::Uuid;
mod accounting;
mod accounts;
mod observations;
pub use accounts::{
    AccountHealth, AccountInput, AccountView, AuthMode, BillingMode, QuotaInput, QuotaUnit,
    QuotaView,
};
pub use observations::ExecutionImportSummary;
mod keys;
mod pricing;
pub use accounting::{BudgetSnapshot, CostEntry};
pub use keys::{IssuedKey, KeyView, Principal};
pub use pricing::{PriceInput, TokenRates};

pub static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!();

#[derive(Clone)]
pub struct Store {
    pool: PgPool,
}

#[derive(Clone, Copy)]
pub struct TenantScope {
    pub organization_id: Uuid,
    pub project_id: Uuid,
}

#[derive(sqlx::FromRow, serde::Serialize)]
pub struct NamedResource {
    pub id: Uuid,
    pub name: String,
}

#[derive(Debug, sqlx::FromRow)]
pub struct Attempt {
    pub id: Uuid,
    pub operation_id: Uuid,
    pub execution: String,
    pub usage_confidence: String,
    pub prompt_tokens: Option<i64>,
    pub completion_tokens: Option<i64>,
    pub settlement: String,
}

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("invalid execution observation")]
    InvalidObservation,
    #[error("database operation failed")]
    Database(#[from] sqlx::Error),
    #[error("database migration failed")]
    Migration(#[from] sqlx::migrate::MigrateError),
    #[error("record not found in tenant scope or transition already applied")]
    Conflict,
    #[error("token usage exceeds storage range")]
    InvalidUsage,
    #[error("invalid API key configuration")]
    InvalidKey,
    #[error("API key is invalid, expired, revoked, or lacks permission")]
    Unauthorized,
    #[error("invalid price, currency or monetary amount")]
    InvalidPrice,
    #[error("budget has insufficient available funds")]
    BudgetExceeded,
    #[error("usage or execution remains unresolved")]
    Unresolved,
    #[error("invalid account or quota observation")]
    InvalidAccount,
    #[error("account is unavailable or at its concurrency limit")]
    AccountUnavailable,
}

impl Store {
    pub async fn connect(url: &str) -> Result<Self, StoreError> {
        let pool = PgPoolOptions::new()
            .max_connections(10)
            .connect(url)
            .await?;
        MIGRATOR.run(&pool).await?;
        Ok(Self { pool })
    }

    pub fn from_pool(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn ready(&self) -> Result<(), StoreError> {
        sqlx::query("SELECT 1").execute(&self.pool).await?;
        Ok(())
    }

    pub async fn organizations(&self) -> Result<Vec<NamedResource>, StoreError> {
        Ok(
            sqlx::query_as("SELECT id,name FROM organizations ORDER BY created_at,id LIMIT 1000")
                .fetch_all(&self.pool)
                .await?,
        )
    }
    pub async fn projects(&self, organization_id: Uuid) -> Result<Vec<NamedResource>, StoreError> {
        Ok(sqlx::query_as("SELECT id,name FROM projects WHERE organization_id=$1 ORDER BY created_at,id LIMIT 1000").bind(organization_id).fetch_all(&self.pool).await?)
    }

    pub async fn create_organization(&self, name: &str) -> Result<Uuid, StoreError> {
        let id = Uuid::new_v4();
        sqlx::query("INSERT INTO organizations (id, name) VALUES ($1, $2)")
            .bind(id)
            .bind(name)
            .execute(&self.pool)
            .await?;
        Ok(id)
    }

    pub async fn create_project(
        &self,
        organization_id: Uuid,
        name: &str,
    ) -> Result<TenantScope, StoreError> {
        let project_id = Uuid::new_v4();
        sqlx::query("INSERT INTO projects (id, organization_id, name) VALUES ($1, $2, $3)")
            .bind(project_id)
            .bind(organization_id)
            .bind(name)
            .execute(&self.pool)
            .await?;
        Ok(TenantScope {
            organization_id,
            project_id,
        })
    }

    pub async fn create_operation(
        &self,
        scope: TenantScope,
        model: &str,
    ) -> Result<Uuid, StoreError> {
        let id = Uuid::new_v4();
        sqlx::query("INSERT INTO operations (id, organization_id, project_id, model_alias) VALUES ($1, $2, $3, $4)")
            .bind(id).bind(scope.organization_id).bind(scope.project_id).bind(model).execute(&self.pool).await?;
        Ok(id)
    }

    pub async fn prepare_attempt(
        &self,
        scope: TenantScope,
        operation_id: Uuid,
        resource: &str,
        revision: &str,
    ) -> Result<Uuid, StoreError> {
        let id = Uuid::new_v4();
        sqlx::query("INSERT INTO attempts (id, organization_id, project_id, operation_id, resource_id, offer_revision) VALUES ($1, $2, $3, $4, $5, $6)")
            .bind(id).bind(scope.organization_id).bind(scope.project_id).bind(operation_id).bind(resource).bind(revision)
            .execute(&self.pool).await?;
        Ok(id)
    }

    /// Record execution separately from financial settlement. Missing evidence
    /// remains NULL/unknown and explicitly requires reconciliation.
    pub async fn complete(
        &self,
        scope: TenantScope,
        id: Uuid,
        usage: Option<(u64, u64)>,
    ) -> Result<(), StoreError> {
        let usage = usage
            .map(|(a, b)| {
                Ok::<_, StoreError>((
                    i64::try_from(a).map_err(|_| StoreError::InvalidUsage)?,
                    i64::try_from(b).map_err(|_| StoreError::InvalidUsage)?,
                ))
            })
            .transpose()?;
        let (prompt, completion) = usage.map_or((None, None), |(a, b)| (Some(a), Some(b)));
        let confidence = if usage.is_some() {
            "provider_reported"
        } else {
            "unknown"
        };
        let changed = sqlx::query("UPDATE attempts SET execution = 'confirmed_completed', completed_at = now(), usage_confidence = $4, prompt_tokens = $5, completion_tokens = $6, settlement = CASE WHEN $4 = 'unknown' THEN 'reconciliation_required' ELSE settlement END WHERE organization_id = $1 AND project_id = $2 AND id = $3 AND execution = 'may_have_executed'")
            .bind(scope.organization_id).bind(scope.project_id).bind(id).bind(confidence).bind(prompt).bind(completion)
            .execute(&self.pool).await?.rows_affected();
        if changed != 1 {
            return Err(StoreError::Conflict);
        }
        Ok(())
    }

    pub async fn attempt(
        &self,
        scope: TenantScope,
        id: Uuid,
    ) -> Result<Option<Attempt>, StoreError> {
        Ok(sqlx::query_as("SELECT id, operation_id, execution, usage_confidence, prompt_tokens, completion_tokens, settlement FROM attempts WHERE organization_id = $1 AND project_id = $2 AND id = $3")
            .bind(scope.organization_id).bind(scope.project_id).bind(id).fetch_optional(&self.pool).await?)
    }
}
