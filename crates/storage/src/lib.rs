//! Durable tenant ownership and attempt intent. Credentials, prompts and outputs
//! do not belong in accounting records. Chat content has separate storage.
//! Authorization remains a caller obligation.
mod ingested_image_readiness;
pub use ingested_image_readiness::ClaimedIngestedImageReadiness;
mod agent_sessions;
mod agent_traces;
pub use agent_traces::*;
mod agent_observations;
pub use agent_observations::*;
use sqlx::{PgPool, postgres::PgPoolOptions};
use uuid::Uuid;
mod branding;
mod route_pools;
pub use route_pools::{ModelRoutePool, RoutePoolCandidate};
mod managed_routes;
pub use branding::BrandingSettings;
mod accounting;
mod background_work;
mod balance_policy_history;
mod financial_recovery;
pub use financial_recovery::FinancialRecoveryFailure;
mod gateway_retry;
mod media_submissions;
mod personal_admission;
pub use gateway_retry::GatewayRetryAdmission;
mod priced_admission;
mod request_failures;
pub use request_failures::{RequestFailure, RequestFailureKind};
mod request_finish_reasons;
pub use request_finish_reasons::{RequestChoiceFinish, RequestFinishReason};
mod request_token_categories;
pub use request_token_categories::RequestTokenCategories;
mod accounts;
mod codex_connections;
pub use codex_connections::{CodexConnectionInput, CodexConnectionSecret, CodexConnectionView};
mod chat_sessions;
mod guardrails;
mod image_processing;
mod inspected_image_sources;
pub use guardrails::GuardrailSnapshot;
pub use image_processing::{ImageApprovalRecord, ImageRequestApproval};
pub use inspected_image_sources::{
    AssetImageIngestionConsent, AssetImageIngestionOutcome, AssetImageSourceAccess,
    ClaimedAssetImageIngestion, InspectedImageSource, InspectedImageSourceInput,
    VerifiedImageSource, inspected_image_source_aad,
};
mod codex_report;
mod collectors;
mod member_preferences;
mod member_profiles;
pub use member_preferences::ColorMode;
mod observations;
mod operator_audit;
mod operators;
pub use member_profiles::MemberProfile;
mod password_logins;
pub mod passwords;
pub use password_logins::{PasswordLoginCredential, VerifiedPasswordLogin};
mod password_workers;
pub use password_workers::{PasswordWorkError, PasswordWorkers};
mod asset_authorizations;
mod asset_group_deletions;
mod asset_group_intents;
mod asset_group_reads;
mod asset_group_updates;
pub use asset_group_deletions::{
    AssetGroupDeletionConsent, AssetGroupDeletionOutcome, ClaimedAssetGroupDeletion,
};
pub use asset_group_updates::{
    AssetGroupUpdateOutcome, ClaimedAssetGroupUpdate, PreparedAssetGroupUpdate,
};
mod asset_listings;
mod asset_lookups;
pub use asset_authorizations::AssetOperationQualification;
pub use asset_group_reads::ClaimedAssetGroupRead;
pub use asset_listings::{AssetListingContinuation, AssetListingOutcome, ClaimedAssetListing};
pub use asset_lookups::{AssetLookupOutcome, ClaimedAssetLookup};
mod asset_management;
pub use asset_group_intents::{
    AssetGroupCreateIntent, AssetGroupReconciliationCandidate, ClaimedAssetGroupCreate,
};
pub use asset_management::AssetManagementCredentialRevision;
mod vendors;
pub use accounts::{
    AccountHealth, AccountInput, AccountView, AuthMode, BillingMode, QuotaInput, QuotaUnit,
    QuotaView,
};
pub use collectors::CollectorKeyView;
pub use observations::{
    AuthorityEvidenceCounts, CostEvidenceCounts, CostPerAcceptedCompletion, CurrencyAmount,
    ExecutionAccountLink, ExecutionCapacitySummary, ExecutionCharges, ExecutionCohortReport,
    ExecutionCoverageCounts, ExecutionImportSummary, ExecutionOutcomeCounts,
    ExecutionOutcomeEvidenceCounts, ExecutionTaskLink, ExecutionWorkCounts, ImportReceipt,
    NotImportedAccounting,
};
pub use operator_audit::{OperatorAuditActor, OperatorAuditEvent, OperatorAuditPage};
pub use operators::{
    AdminPermission, IssuedOperatorSession, OperatorPrincipal, OperatorRole, OperatorScope,
    OperatorSessionView, OperatorView,
};
pub use vendors::{
    VendorInput, VendorModelInput, VendorModelView, VendorRoute, VendorUpdate, VendorView,
};
mod context_pricing;
pub use context_pricing::{
    ContextPriceTier, ContextTierRates, context_token_reservation, normalize_context_tiers,
    select_context_tier,
};
mod billing;
pub use billing::CustomerCategoryRates;
mod customer_invoice_history;
mod customer_tariff_history;
mod key_concurrency;
mod key_ip;
mod key_request_rate;
mod key_spending;
mod key_token_rate;
mod ledger_history;
mod platform_pricing;
mod provider_offer_history;
mod provider_settlement_history;
pub use ledger_history::LedgerHistoryQuery;
pub use provider_settlement_history::ProviderSettlementQuery;
mod topups;
mod vendor_cooldown;
mod vendor_request_rate;
mod workspace_spending;
pub use topups::{TopupInput, TopupOrder};
mod keys;
mod media_pricing;
mod media_rates;
mod supplier_media;
mod supplier_media_offers;
pub use media_rates::{CustomerMediaRateCard, SelectedCustomerMediaRate};
pub use niu_metered_cost::Dimensions as MediaBillingDimensions;
pub use supplier_media::SupplierMediaRateCard;
pub use supplier_media_offers::SupplierMediaOfferInput;
mod media_jobs;
mod media_results;
mod video_intents;
pub use media_jobs::{
    MediaJobStatus, MediaQueryLease, MediaRecoveryCandidate, MediaRecoveryRoute,
    MediaTransportTiming,
};
pub use media_pricing::{MediaLiabilityBound, MediaUsageSource, MediaUsageState};
pub use media_results::MediaResultKind;
pub use video_intents::{VideoIntent, VideoIntentInput};
mod pricing;
mod providers;
pub use accounting::{
    BudgetSnapshot, CostEntry, GatewayActivityCostSummary, GatewayActivityEntry,
    GatewayActivityExportEntry, GatewayActivityFilter, GatewayActivityKeySummary,
    GatewayActivityModelSummary, GatewayActivitySort, GatewayActivitySummary,
    GatewayDeliveryFilter, GatewayDeliverySummary, GatewayReservation,
};
pub use codex_report::{
    CodexRateOverride, CodexRateSnapshot, CodexUsageImportFinish, CodexUsageImportStart,
    CodexUsageResponseInput, CodexUsageTokens,
};
pub use keys::{IssuedKey, KeyView, Principal};
pub use pricing::{PriceInput, TokenRates};
pub use providers::{
    ProviderMembership, ProviderOfferInput, ProviderOfferQualificationInput, ProviderOfferSchedule,
    ProviderQualificationInput, ProviderQualificationRevocationInput, SupplierProfile,
    SupplierProfileUpdate,
};

mod request_payloads;
mod request_timings;
pub use request_timings::RequestTimingRecord;

mod migration_compatibility;

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

#[derive(sqlx::FromRow, serde::Serialize)]
pub struct WorkspaceResource {
    pub id: Uuid,
    pub is_default: bool,
    pub name: String,
    pub organization_id: Uuid,
    pub organization_name: String,
    pub created_at_ms: i64,
    pub active_key_count: i64,
    pub requests_30d: i64,
    pub requests_by_day: serde_json::Value,
    pub last_request_at_ms: Option<i64>,
}

#[derive(Debug, sqlx::FromRow)]
pub struct Attempt {
    pub id: Uuid,
    pub operation_id: Uuid,
    pub execution: String,
    pub usage_confidence: String,
    pub provider_model: Option<String>,
    pub prompt_tokens: Option<i64>,
    pub completion_tokens: Option<i64>,
    pub settlement: String,
}

/// Immutable managed-route resolution metadata; contains no credential material.
#[derive(Clone)]
pub struct ManagedRouteSnapshot {
    pub pool_alias: Option<String>,
    pub pool_revision: Option<i64>,
    pub vendor_id: Uuid,
    pub model_alias: String,
    pub vendor_revision: i64,
    pub model_revision: i64,
}

/// A validated, unpriced gateway request to admit for upstream dispatch.
/// The operation and attempt identifiers are generated by the gateway before
/// enqueueing so they remain available for response headers after admission.
#[derive(Clone)]
pub struct GatewayAdmission {
    pub managed_route: Option<ManagedRouteSnapshot>,
    pub token_bound: Option<i64>,
    pub inspected_guardrails: Option<GuardrailSnapshot>,
    pub operation_id: Uuid,
    pub attempt_id: Uuid,
    pub scope: TenantScope,
    pub key_id: Uuid,
    pub model: String,
    pub upstream_model: String,
    pub dispatch_provider: String,
    pub api_base: Option<String>,
    pub task_id: Option<String>,
    pub revision: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum GatewayAdmissionStatus {
    Admitted,
    Unauthorized,
    Conflict,
    AccountUnavailable,
}

/// Completion evidence for a previously committed gateway attempt. If this
/// buffered write is lost on process failure, the durable attempt remains
/// `may_have_executed` and therefore visibly unresolved.
#[derive(Clone)]
pub struct GatewayCompletion {
    pub token_categories: Option<RequestTokenCategories>,
    pub scope: TenantScope,
    pub attempt_id: Uuid,
    pub usage: Option<(u64, u64)>,
    pub provider_model: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("Managed route changed before dispatch")]
    ManagedRouteChanged,

    #[error("workspace contains dependent records or is the installation default")]
    WorkspaceNotEmpty,
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
    #[error("invalid Supplier history filters or page size")]
    InvalidSupplierHistoryQuery,
    #[error("invalid ledger history filters or page size")]
    InvalidLedgerHistoryQuery,
    #[error("budget has insufficient available funds")]
    BudgetExceeded,
    #[error("customer workspace spending limit exceeded")]
    WorkspaceSpendingLimitExceeded,
    #[error("key customer spending limit exceeded")]
    KeySpendingLimitExceeded,
    #[error("request source is not allowed by API key policy")]
    KeyIpDenied,
    #[error("API key request rate exhausted")]
    KeyRequestRateExceeded,
    #[error("upstream credential request rate exhausted")]
    VendorRequestRateExceeded,
    #[error("API key concurrent request limit reached")]
    KeyConcurrencyExceeded,
    #[error("API key token rate exhausted")]
    KeyTokenRateExceeded,
    #[error("Token admission requires bounded supported input and resolved prior usage")]
    KeyTokenBoundRequired,
    #[error("usage or execution remains unresolved")]
    Unresolved,
    #[error("invalid account or quota observation")]
    InvalidAccount,
    #[error("account is unavailable or at its concurrency limit")]
    AccountUnavailable,
    #[error("encrypted image source storage is at capacity")]
    ImageSourceCapacityExceeded,
    #[error("aggregate exceeds the supported numeric range")]
    AggregateOverflow,
    #[error("invalid operator name, role, or session lifetime")]
    InvalidOperator,
    #[error("invalid operator audit cursor or page size")]
    InvalidOperatorAuditQuery,
    #[error("invalid video history cursor or page size")]
    InvalidMediaQuery,
    #[error("invalid vendor or model configuration")]
    InvalidVendor,
    #[error("database pool size must be positive")]
    InvalidPoolSize,
    #[error("invalid gateway admission batch")]
    InvalidGatewayAdmissionBatch,
}

impl Store {
    pub async fn connect(url: &str) -> Result<Self, StoreError> {
        Self::connect_with_max_connections(url, 10).await
    }

    pub async fn connect_with_max_connections(
        url: &str,
        max_connections: u32,
    ) -> Result<Self, StoreError> {
        if max_connections == 0 {
            return Err(StoreError::InvalidPoolSize);
        }
        let pool = PgPoolOptions::new()
            .max_connections(max_connections)
            .connect(url)
            .await?;
        migration_compatibility::run(&pool).await?;
        Ok(Self { pool })
    }

    /// Content maintenance has one dedicated connection per process so a sweep
    /// cannot consume the admission pool. Migration ownership stays with startup.
    pub async fn content_maintenance_store(&self) -> Result<Self, StoreError> {
        let options = (*self.pool.connect_options())
            .clone()
            .application_name("niu-content-retention");
        let pool = PgPoolOptions::new()
            .max_connections(1)
            .min_connections(0)
            .connect_with(options)
            .await?;
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

    pub async fn organization_name(
        &self,
        organization_id: Uuid,
    ) -> Result<Option<String>, StoreError> {
        Ok(
            sqlx::query_scalar("SELECT name FROM organizations WHERE id=$1")
                .bind(organization_id)
                .fetch_optional(&self.pool)
                .await?,
        )
    }

    pub async fn workspaces(
        &self,
        organization_id: Option<Uuid>,
        project_id: Option<Uuid>,
    ) -> Result<Vec<WorkspaceResource>, StoreError> {
        Ok(sqlx::query_as(
            "SELECT p.id,p.name,o.id AS organization_id,o.name AS organization_name,(EXTRACT(EPOCH FROM p.created_at)*1000)::bigint AS created_at_ms,(SELECT COUNT(*) FROM api_keys k WHERE k.organization_id=p.organization_id AND k.project_id=p.id AND k.revoked_at IS NULL AND k.expires_at>now()) AS active_key_count,(SELECT COUNT(*) FROM operations r WHERE r.organization_id=p.organization_id AND r.project_id=p.id AND r.created_at>=now()-interval '30 days') AS requests_30d,(SELECT (EXTRACT(EPOCH FROM MAX(r.created_at))*1000)::bigint FROM operations r WHERE r.organization_id=p.organization_id AND r.project_id=p.id) AS last_request_at_ms,(SELECT jsonb_agg(jsonb_build_object('start_ms',(EXTRACT(EPOCH FROM d.day)*1000)::bigint,'request_count',(SELECT COUNT(*) FROM operations r WHERE r.organization_id=p.organization_id AND r.project_id=p.id AND r.created_at>=d.day AND r.created_at<d.day+interval '1 day')) ORDER BY d.day) FROM generate_series(date_trunc('day',now(), 'UTC')-interval '29 days',date_trunc('day',now(), 'UTC'),interval '1 day') d(day)) AS requests_by_day,EXISTS(SELECT 1 FROM default_workspace d WHERE d.organization_id=p.organization_id AND d.project_id=p.id AND d.singleton) AS is_default FROM projects p JOIN organizations o ON o.id=p.organization_id WHERE ($1::uuid IS NULL OR o.id=$1) AND ($2::uuid IS NULL OR p.id=$2) ORDER BY o.created_at,o.id,p.created_at,p.id LIMIT 1000",
        )
        .bind(organization_id)
        .bind(project_id)
        .fetch_all(&self.pool)
        .await?)
    }

    /// Explicit installation-admin quick setup. Creates both ownership records
    /// atomically and reuses only the designated default, never a name match.
    pub async fn default_workspace(&self) -> Result<TenantScope, StoreError> {
        self.default_workspace_with_prepaid(false).await
    }

    /// First-use customer setup provisions zero-funded shared company funds.
    /// Reusing an existing default never changes its commercial configuration.
    pub async fn default_prepaid_workspace(&self) -> Result<TenantScope, StoreError> {
        self.default_workspace_with_prepaid(true).await
    }

    async fn default_workspace_with_prepaid(
        &self,
        prepaid: bool,
    ) -> Result<TenantScope, StoreError> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("LOCK TABLE default_workspace IN EXCLUSIVE MODE")
            .execute(&mut *tx)
            .await?;
        let existing: Option<(Uuid, Uuid)> = sqlx::query_as(
            "SELECT organization_id, project_id FROM default_workspace WHERE singleton",
        )
        .fetch_optional(&mut *tx)
        .await?;
        let (organization_id, project_id) = match existing {
            Some(scope) => scope,
            None => {
                let organization_id = Uuid::new_v4();
                let project_id = Uuid::new_v4();
                sqlx::query("INSERT INTO organizations (id,name) VALUES ($1,'Personal workspace')")
                    .bind(organization_id)
                    .execute(&mut *tx)
                    .await?;
                if prepaid {
                    sqlx::query("INSERT INTO customer_balance_accounts(id,organization_id,currency) VALUES($1,$2,'USD')")
                        .bind(Uuid::new_v4()).bind(organization_id).execute(&mut *tx).await?;
                }
                sqlx::query("INSERT INTO projects (id,organization_id,name) VALUES ($1,$2,'Default project')")
                    .bind(project_id).bind(organization_id).execute(&mut *tx).await?;
                sqlx::query(
                    "INSERT INTO default_workspace (organization_id,project_id) VALUES ($1,$2)",
                )
                .bind(organization_id)
                .bind(project_id)
                .execute(&mut *tx)
                .await?;
                (organization_id, project_id)
            }
        };
        tx.commit().await?;
        Ok(TenantScope {
            organization_id,
            project_id,
        })
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

    /// Rename in tenant scope; identifiers and historical references stay stable.
    pub async fn rename_workspace(
        &self,
        scope: TenantScope,
        name: &str,
    ) -> Result<bool, StoreError> {
        Ok(
            sqlx::query("UPDATE projects SET name=$3 WHERE organization_id=$1 AND id=$2")
                .bind(scope.organization_id)
                .bind(scope.project_id)
                .bind(name.trim())
                .execute(&self.pool)
                .await?
                .rows_affected()
                == 1,
        )
    }

    /// Foreign keys prohibit deleting credentials, billing, or request history.
    pub async fn delete_empty_workspace(&self, scope: TenantScope) -> Result<bool, StoreError> {
        match sqlx::query("DELETE FROM projects WHERE organization_id=$1 AND id=$2")
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .execute(&self.pool)
            .await
        {
            Ok(result) => Ok(result.rows_affected() == 1),
            Err(sqlx::Error::Database(error)) if error.code().as_deref() == Some("23503") => {
                Err(StoreError::WorkspaceNotEmpty)
            }
            Err(error) => Err(error.into()),
        }
    }

    pub async fn create_operation(
        &self,
        scope: TenantScope,
        model: &str,
    ) -> Result<Uuid, StoreError> {
        self.create_operation_for_task(scope, model, None).await
    }

    pub async fn create_operation_for_task(
        &self,
        scope: TenantScope,
        model: &str,
        task_id: Option<&str>,
    ) -> Result<Uuid, StoreError> {
        let id = Uuid::new_v4();
        sqlx::query("INSERT INTO operations (id, organization_id, project_id, model_alias, task_id) VALUES ($1, $2, $3, $4, $5)")
            .bind(id).bind(scope.organization_id).bind(scope.project_id).bind(model).bind(task_id).execute(&self.pool).await?;
        Ok(id)
    }

    /// Persist a gateway request and its first attempt atomically in one
    /// statement. This keeps the pre-dispatch durability boundary while
    /// avoiding a separate database round trip for each row.
    pub async fn prepare_gateway_attempt(
        &self,
        scope: TenantScope,
        model: &str,
        task_id: Option<&str>,
        revision: &str,
    ) -> Result<(Uuid, Uuid), StoreError> {
        let operation_id = Uuid::new_v4();
        let attempt_id = Uuid::new_v4();
        Self::insert_gateway_attempt(
            &self.pool,
            scope,
            operation_id,
            attempt_id,
            model,
            task_id,
            revision,
        )
        .await?;
        Ok((operation_id, attempt_id))
    }

    async fn insert_gateway_attempt<'e>(
        executor: impl sqlx::Executor<'e, Database = sqlx::Postgres>,
        scope: TenantScope,
        operation_id: Uuid,
        attempt_id: Uuid,
        model: &str,
        task_id: Option<&str>,
        revision: &str,
    ) -> Result<(), StoreError> {
        let _: (Uuid, Uuid) = sqlx::query_as(
            "WITH new_operation AS (\
                INSERT INTO operations (id, organization_id, project_id, model_alias, task_id) \
                VALUES ($1, $2, $3, $4, $5) RETURNING id\
             ), new_attempt AS (\
                INSERT INTO attempts (id, organization_id, project_id, operation_id, resource_id, offer_revision) \
                SELECT $6, $2, $3, new_operation.id, $4, $7 FROM new_operation RETURNING id\
             ) \
             SELECT (SELECT id FROM new_operation), (SELECT id FROM new_attempt)",
        )
        .bind(operation_id)
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(model)
        .bind(task_id)
        .bind(attempt_id)
        .bind(revision)
        .fetch_one(executor)
        .await?;
        Ok(())
    }

    /// Insert operation and attempt rows, recheck admission policy, and commit
    /// dispatch intent for a bounded batch in one database call. The batch
    /// function returns denials as statuses so their durable `not_sent` rows
    /// are retained, matching the single-request admission path.
    pub async fn admit_unpriced_gateway_batch(
        &self,
        admissions: Vec<GatewayAdmission>,
    ) -> Result<Vec<GatewayAdmissionStatus>, StoreError> {
        const MAX_BATCH_SIZE: usize = 64;
        if admissions.is_empty() || admissions.len() > MAX_BATCH_SIZE {
            return Err(StoreError::InvalidGatewayAdmissionBatch);
        }

        let admission_count = admissions.len();
        let rejection_scopes: Vec<_> = admissions.iter().map(|a| (a.scope, a.key_id)).collect();
        let mut operation_ids = Vec::with_capacity(admission_count);
        let mut attempt_ids = Vec::with_capacity(admission_count);
        let mut organization_ids = Vec::with_capacity(admission_count);
        let mut project_ids = Vec::with_capacity(admission_count);
        let mut key_ids = Vec::with_capacity(admission_count);
        let mut models = Vec::with_capacity(admission_count);
        let mut task_ids = Vec::with_capacity(admission_count);
        let mut revisions = Vec::with_capacity(admission_count);
        let mut upstream_models = Vec::with_capacity(admission_count);
        let mut dispatch_providers = Vec::with_capacity(admission_count);
        let mut api_bases = Vec::with_capacity(admission_count);
        let mut tx = self.pool.begin().await?;
        for admission in admissions {
            if let Some(route) = &admission.managed_route {
                Self::insert_managed_route(&mut *tx, admission.attempt_id, route).await?;
            }
            if let Some(bound) = admission.token_bound {
                sqlx::query("INSERT INTO key_attempt_token_bounds(attempt_id,token_bound,estimator) VALUES($1,$2,'serialized-utf8-plus-output-v1')")
                    .bind(admission.attempt_id).bind(bound).execute(&mut *tx).await?;
            }

            if let Some(snapshot) = &admission.inspected_guardrails {
                Self::insert_inspected_guardrails(
                    &mut *tx,
                    admission.scope,
                    admission.attempt_id,
                    admission.key_id,
                    snapshot,
                )
                .await?;
            }
            operation_ids.push(admission.operation_id);
            attempt_ids.push(admission.attempt_id);
            organization_ids.push(admission.scope.organization_id);
            project_ids.push(admission.scope.project_id);
            key_ids.push(admission.key_id);
            models.push(admission.model);
            upstream_models.push(admission.upstream_model);
            api_bases.push(admission.api_base);
            dispatch_providers.push(admission.dispatch_provider);
            task_ids.push(admission.task_id);
            revisions.push(admission.revision);
        }

        let result = sqlx::query_as::<_, (Uuid, String)>(
            "SELECT attempt_id, status FROM niu_admit_unpriced_gateway_batch_with_route(\
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11\
            )",
        )
        .bind(operation_ids)
        .bind(&attempt_ids)
        .bind(organization_ids)
        .bind(project_ids)
        .bind(key_ids)
        .bind(models)
        .bind(task_ids)
        .bind(revisions)
        .bind(upstream_models)
        .bind(api_bases)
        .bind(dispatch_providers)
        .fetch_all(&mut *tx)
        .await;
        let rows = match result {
            Ok(rows) => rows,
            Err(error) => {
                let database = error.as_database_error();
                let code = database
                    .and_then(|d| d.code())
                    .map(|code| code.into_owned());
                if code.as_deref() == Some("P0010") {
                    let metadata = database
                        .and_then(|d| d.try_downcast_ref::<sqlx::postgres::PgDatabaseError>())
                        .and_then(|d| d.detail())
                        .and_then(|detail| serde_json::from_str::<serde_json::Value>(detail).ok());
                    tx.rollback().await?;
                    if let Some(metadata) = metadata {
                        for (scope, key) in rejection_scopes {
                            if metadata["organization_id"] == scope.organization_id.to_string()
                                && metadata["project_id"] == scope.project_id.to_string()
                                && metadata["key_id"] == key.to_string()
                            {
                                sqlx::query("INSERT INTO batch_guardrail_rejections(organization_id,project_id,key_id,reason,workspace_revision,key_policy_revision,key_assignment_revision) VALUES($1,$2,$3,$4,$5,$6,$7)")
                                    .bind(scope.organization_id).bind(scope.project_id).bind(key)
                                    .bind(metadata["reason"].as_str())
                                    .bind(metadata["workspace_revision"].as_i64())
                                    .bind(metadata["key_policy_revision"].as_i64())
                                    .bind(metadata["key_assignment_revision"].as_i64())
                                    .execute(&self.pool).await?;
                                return Err(StoreError::Conflict);
                            }
                        }
                    }
                    return Err(StoreError::Database(error));
                }
                return Err(match code.as_deref() {
                    Some("P0024") => StoreError::ManagedRouteChanged,
                    Some("P0020") => StoreError::KeyRequestRateExceeded,
                    Some("P0025") => StoreError::VendorRequestRateExceeded,
                    Some("P0021") => StoreError::KeyConcurrencyExceeded,
                    Some("P0022") => StoreError::KeyTokenRateExceeded,
                    Some("P0023") => StoreError::KeyTokenBoundRequired,
                    Some("P0007") => StoreError::AccountUnavailable,
                    Some("P0006") => StoreError::Conflict,
                    _ => StoreError::Database(error),
                });
            }
        };

        tx.commit().await?;

        if rows.len() != admission_count {
            return Err(StoreError::InvalidGatewayAdmissionBatch);
        }
        let mut statuses = std::collections::HashMap::with_capacity(rows.len());
        for (attempt_id, status) in rows {
            let status = match status.as_str() {
                "admitted" => GatewayAdmissionStatus::Admitted,
                "unauthorized" => GatewayAdmissionStatus::Unauthorized,
                "conflict" => GatewayAdmissionStatus::Conflict,
                "account_unavailable" => GatewayAdmissionStatus::AccountUnavailable,
                _ => return Err(StoreError::InvalidGatewayAdmissionBatch),
            };
            if statuses.insert(attempt_id, status).is_some() {
                return Err(StoreError::InvalidGatewayAdmissionBatch);
            }
        }
        attempt_ids
            .iter()
            .map(|admission| {
                statuses
                    .remove(admission)
                    .ok_or(StoreError::InvalidGatewayAdmissionBatch)
            })
            .collect()
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
        self.complete_with_provider_model(scope, id, usage, None)
            .await
    }

    pub async fn complete_with_provider_model(
        &self,
        scope: TenantScope,
        id: Uuid,
        usage: Option<(u64, u64)>,
        provider_model: Option<&str>,
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
        let provider_model = provider_model.map(str::trim).filter(|model| {
            !model.is_empty()
                && model.len() <= 200
                && model.chars().all(|character| !character.is_control())
        });
        let changed = sqlx::query("UPDATE attempts SET execution = 'confirmed_completed', completed_at = now(), usage_confidence = $4, prompt_tokens = $5, completion_tokens = $6, provider_model = $7, settlement = CASE WHEN $4 = 'unknown' THEN 'reconciliation_required' ELSE settlement END WHERE organization_id = $1 AND project_id = $2 AND id = $3 AND execution = 'may_have_executed'")
            .bind(scope.organization_id).bind(scope.project_id).bind(id).bind(confidence).bind(prompt).bind(completion).bind(provider_model)
            .execute(&self.pool).await?.rows_affected();
        if changed != 1 {
            return Err(StoreError::Conflict);
        }
        Ok(())
    }

    /// Persist completion evidence for a bounded set of gateway attempts in
    /// one update. The gateway may enqueue this after returning a provider
    /// response because the earlier durable dispatch intent remains unresolved
    /// if this observation cannot be committed.
    pub async fn complete_gateway_batch(
        &self,
        completions: Vec<GatewayCompletion>,
    ) -> Result<(), StoreError> {
        const MAX_BATCH_SIZE: usize = 64;
        if completions.is_empty() || completions.len() > MAX_BATCH_SIZE {
            return Err(StoreError::InvalidGatewayAdmissionBatch);
        }
        let completion_count = completions.len();
        let mut seen = std::collections::HashSet::with_capacity(completion_count);
        let mut organization_ids = Vec::with_capacity(completion_count);
        let mut project_ids = Vec::with_capacity(completion_count);
        let mut attempt_ids = Vec::with_capacity(completion_count);
        let mut has_usage = Vec::with_capacity(completion_count);
        let mut prompt_tokens = Vec::with_capacity(completion_count);
        let mut completion_tokens = Vec::with_capacity(completion_count);
        let mut provider_models = Vec::with_capacity(completion_count);
        let mut categories = Vec::new();
        for completion in completions {
            if !seen.insert(completion.attempt_id) {
                return Err(StoreError::InvalidGatewayAdmissionBatch);
            }
            let usage = completion
                .usage
                .map(|(prompt, output)| {
                    Ok::<_, StoreError>((
                        i64::try_from(prompt).map_err(|_| StoreError::InvalidUsage)?,
                        i64::try_from(output).map_err(|_| StoreError::InvalidUsage)?,
                    ))
                })
                .transpose()?;
            if let Some(details) = completion.token_categories {
                let Some((prompt, output)) = usage else {
                    return Err(StoreError::InvalidUsage);
                };
                if details.cache_write_input_tokens.is_some_and(|value| {
                    value < 0
                        || i128::from(value) + i128::from(details.cached_input_tokens.unwrap_or(0))
                            > i128::from(prompt)
                }) || details.cached_input_tokens.is_none()
                    && details.reasoning_output_tokens.is_none()
                    && details.cache_write_input_tokens.is_none()
                    || details
                        .cached_input_tokens
                        .is_some_and(|value| value < 0 || value > prompt)
                    || details
                        .reasoning_output_tokens
                        .is_some_and(|value| value < 0 || value > output)
                {
                    return Err(StoreError::InvalidUsage);
                }
                categories.push((completion.attempt_id, details));
            }
            organization_ids.push(completion.scope.organization_id);
            project_ids.push(completion.scope.project_id);
            attempt_ids.push(completion.attempt_id);
            has_usage.push(usage.is_some());
            prompt_tokens.push(usage.map(|(prompt, _)| prompt));
            completion_tokens.push(usage.map(|(_, output)| output));
            provider_models.push(completion.provider_model.as_deref().and_then(|model| {
                let model = model.trim();
                (!model.is_empty()
                    && model.len() <= 200
                    && model.chars().all(|character| !character.is_control()))
                .then(|| model.to_owned())
            }));
        }

        let mut tx = self.pool.begin().await?;
        let updated: Vec<Uuid> = sqlx::query_scalar(
            r#"
                WITH input AS MATERIALIZED (
                    SELECT * FROM unnest(
                        $1::uuid[], $2::uuid[], $3::uuid[], $4::boolean[],
                        $5::bigint[], $6::bigint[], $7::text[]
                    ) AS row(organization_id, project_id, attempt_id, has_usage,
                             prompt_tokens, completion_tokens, provider_model)
                )
                UPDATE attempts a
                   SET execution = 'confirmed_completed',
                       completed_at = clock_timestamp(),
                       usage_confidence = CASE WHEN input.has_usage THEN 'provider_reported' ELSE 'unknown' END,
                       prompt_tokens = input.prompt_tokens,
                       completion_tokens = input.completion_tokens,
                       provider_model = input.provider_model,
                       settlement = CASE WHEN input.has_usage THEN a.settlement ELSE 'reconciliation_required' END
                  FROM input
                 WHERE a.organization_id = input.organization_id
                   AND a.project_id = input.project_id
                   AND a.id = input.attempt_id
                   AND a.execution = 'may_have_executed'
                RETURNING a.id
            "#,
        )
        .bind(&organization_ids)
        .bind(&project_ids)
        .bind(&attempt_ids)
        .bind(&has_usage)
        .bind(&prompt_tokens)
        .bind(&completion_tokens)
        .bind(&provider_models)
        .fetch_all(&mut *tx)
        .await?;
        if updated.len() != completion_count {
            // A retried completion may already be durable. Accept only the
            // same scoped evidence; never overwrite a terminal observation.
            let matching: i64 = sqlx::query_scalar(r#"
                WITH input AS (
                    SELECT * FROM unnest(
                        $1::uuid[], $2::uuid[], $3::uuid[], $4::boolean[],
                        $5::bigint[], $6::bigint[], $7::text[]
                    ) AS row(organization_id, project_id, attempt_id, has_usage,
                             prompt_tokens, completion_tokens, provider_model)
                )
                SELECT COUNT(*) FROM attempts a JOIN input
                    ON a.organization_id=input.organization_id
                    AND a.project_id=input.project_id AND a.id=input.attempt_id
                WHERE a.execution='confirmed_completed'
                    AND a.usage_confidence=CASE WHEN input.has_usage THEN 'provider_reported' ELSE 'unknown' END
                    AND a.prompt_tokens IS NOT DISTINCT FROM input.prompt_tokens
                    AND a.completion_tokens IS NOT DISTINCT FROM input.completion_tokens
                    AND a.provider_model IS NOT DISTINCT FROM input.provider_model
            "#)
            .bind(&organization_ids).bind(&project_ids).bind(&attempt_ids)
            .bind(&has_usage).bind(&prompt_tokens).bind(&completion_tokens)
            .bind(&provider_models).fetch_one(&mut *tx).await?;
            if matching != completion_count as i64 {
                return Err(StoreError::Conflict);
            }
        }
        for (attempt, details) in categories {
            let saved = sqlx::query("INSERT INTO request_token_categories (attempt_id,cached_input_tokens,reasoning_output_tokens,cache_write_input_tokens) VALUES ($1,$2,$3,$4) ON CONFLICT(attempt_id) DO UPDATE SET attempt_id=EXCLUDED.attempt_id WHERE request_token_categories.cached_input_tokens IS NOT DISTINCT FROM EXCLUDED.cached_input_tokens AND request_token_categories.reasoning_output_tokens IS NOT DISTINCT FROM EXCLUDED.reasoning_output_tokens AND request_token_categories.cache_write_input_tokens IS NOT DISTINCT FROM EXCLUDED.cache_write_input_tokens")
                .bind(attempt).bind(details.cached_input_tokens).bind(details.reasoning_output_tokens).bind(details.cache_write_input_tokens)
                .execute(&mut *tx).await?;
            if saved.rows_affected() != 1 {
                return Err(StoreError::Conflict);
            }
        }
        tx.commit().await?;
        Ok(())
    }

    pub async fn attempt(
        &self,
        scope: TenantScope,
        id: Uuid,
    ) -> Result<Option<Attempt>, StoreError> {
        Ok(sqlx::query_as("SELECT id, operation_id, execution, usage_confidence, provider_model, prompt_tokens, completion_tokens, settlement FROM attempts WHERE organization_id = $1 AND project_id = $2 AND id = $3")
            .bind(scope.organization_id).bind(scope.project_id).bind(id).fetch_optional(&self.pool).await?)
    }
}
