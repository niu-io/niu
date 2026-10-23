//! Durable tenant ownership and attempt intent. Credentials, prompts and outputs
//! do not belong in accounting records. Chat content has separate storage.
//! Authorization remains a caller obligation.
mod payment_verification;
mod platform_currency;
mod workspace_asset_video_dispatch;
pub use workspace_asset_video_dispatch::{
    WorkspaceAssetVideoDispatch, WorkspaceAssetVideoReference,
};
mod workspace_provider_verification;
pub use workspace_provider_verification::{
    WorkspaceProviderVerificationContent, WorkspaceProviderVerificationSession,
    workspace_provider_verification_aad,
};
mod workspace_provider_asset_dispatch;
pub use workspace_provider_asset_dispatch::{
    WorkspaceProviderAssetReference, WorkspaceProviderAssetVideoDispatch,
    WorkspaceProviderAssetVideoReference,
};
mod workspace_provider_assets;
pub use workspace_provider_assets::{
    WorkspaceProviderAsset, WorkspaceProviderAssetDiagnostic,
    WorkspaceProviderAssetFailureCategory, WorkspaceProviderAssetFailurePhase,
    WorkspaceProviderAssetGroup, WorkspaceProviderAssetMutation, WorkspaceProviderAssetOperation,
    WorkspaceProviderAssetOutcome, WorkspaceProviderAssetPage, WorkspaceProviderAssetPrepared,
    WorkspaceProviderAssetRoute,
};
mod workspace_asset_library;
pub use workspace_asset_library::{
    AssetLibraryAsset, AssetLibraryContent, AssetLibraryCreate, AssetLibraryKind,
    AssetLibraryLimits, AssetLibraryPage, workspace_asset_content_aad,
};
mod ingested_video_dispatch;
pub use ingested_video_dispatch::{IngestedVideoDispatch, IngestedVideoImage};
mod ingested_image_references;
pub use ingested_image_references::{
    IngestedImageReference, IngestedImageReferenceResolution, IngestedImageReferenceUnavailable,
    IngestedImageReuse, IngestedImageRoute,
};
mod ingested_image_readiness;
pub use ingested_image_readiness::ClaimedIngestedImageReadiness;
mod agent_sessions;
mod agent_traces;
pub use agent_traces::*;
mod agent_observations;
pub use agent_observations::*;
use sqlx::{PgPool, postgres::PgPoolOptions};
use uuid::Uuid;
mod encrypted_content;
mod encryption_rotation;
pub use encrypted_content::{EncryptedContent, EncryptedContentDomain};
pub use encryption_rotation::{
    EncryptionRewrapTarget, EncryptionRotation, EncryptionRotationLease,
};
mod branding;
mod route_publication;
pub use route_publication::{RouteRegistryCompiler, RouteRegistryPublication};
mod route_pools;
pub use route_pools::{ModelRoutePool, RoutePoolCandidate};
mod managed_routes;
pub use branding::BrandingSettings;
mod accounting;
mod background_work;
mod balance_policy_history;
mod balance_reservations;
mod financial_recovery;
mod financial_transactions;
mod supplier_configuration_usage;
pub use financial_recovery::FinancialRecoveryFailure;
mod gateway_retry;
mod media_submissions;
mod personal_admission;
pub use gateway_retry::{GatewayRetryAdmission, GatewayRetryProtocol};
mod gateway_admission_denials;
mod priced_admission;
pub use gateway_admission_denials::{GatewayAdmissionDenial, GatewayAdmissionDenialKind};
mod request_failures;
pub use request_failures::{RequestFailure, RequestFailureKind, RequestTransportPhase};
mod request_finish_reasons;
mod upstream_references;
mod usage_reconciliation;
pub use request_finish_reasons::{RequestChoiceFinish, RequestFinishReason};
pub use usage_reconciliation::{OpenRouterReconciliationContext, OpenRouterUsageObservation};
mod request_token_categories;
pub use request_token_categories::RequestTokenCategories;
mod accounts;
mod codex_connections;
pub use codex_connections::{CodexConnectionInput, CodexConnectionSecret, CodexConnectionView};
mod chat_sessions;
pub use chat_sessions::ChatWriteCondition;
mod guardrails;
mod image_processing;
mod media_processing;
pub use media_processing::MediaApprovalRecord;
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
mod platform_audit;
pub use platform_audit::{PlatformAuditEvent, PlatformAuditPage};
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
    RouteRegistryInputs, RouteRegistryOffer, SharedVendorRoute, VendorCatalogInputs,
    VendorCatalogRoute, VendorInput, VendorModelInput, VendorModelView, VendorRoute, VendorUpdate,
    VendorView,
};
mod context_pricing;
pub use context_pricing::{
    ContextPriceTier, ContextTierRates, context_token_reservation, normalize_context_tiers,
    select_context_tier,
};
mod company_creation;
mod company_directory;
mod company_write_authorization;
mod workspace_creation;
pub use workspace_creation::{WorkspaceCreationKey, WorkspaceCreationLimit};
mod billing;
pub use billing::{CustomerCategoryRates, CustomerTariffPublication};
mod customer_balance_grants;
mod prepared_customer_balance_grants;
pub use customer_balance_grants::{CustomerBalanceGrantPolicy, CustomerBalanceGrantPublication};
mod commercial_position;
mod customer_financial_summary;
mod retail_schedule;
pub use retail_schedule::{
    MediaRetailSchedule, NormalizedTextRetailRates, RetailSchedule, TextRetailSchedule,
};
mod retail_media_admission;
mod retail_media_enrollment;
mod retail_publication;
mod retail_selection;
mod retail_text_bindings;
pub use retail_media_enrollment::RetailMediaEnrollmentPublication;
pub use retail_publication::{
    RetailPromotionPublication, RetailPromotionRetirement, RetailStandardPublication,
};
pub use retail_selection::RetailSelection;
pub use retail_text_bindings::RetailTextEnrollmentPublication;
mod customer_invoice_history;
mod customer_tariff_history;
mod key_capacity;
mod key_concurrency;
mod key_ip;
mod key_request_rate;
mod key_spending;
mod key_token_rate;
mod ledger_history;
mod platform_pricing;
mod pricing_health;
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
pub use keys::{KeyMetadataUpdate, KeySpendingLimitUpdate, UnifiedKeyPoliciesInput};
mod media_liability_qualifications;
mod media_pricing;
pub use media_liability_qualifications::{
    MediaLiabilityIdentity, MediaLiabilityPublication, MediaLiabilityRevocation,
    SelectedMediaLiabilityQualification,
};
mod media_rates;
mod supplier_media;
mod supplier_media_offers;
pub use media_rates::{CustomerMediaRateCard, SelectedCustomerMediaRate};
pub use niu_metered_cost::Dimensions as MediaBillingDimensions;
pub use supplier_media::SupplierMediaRateCard;
pub use supplier_media_offers::SupplierMediaOfferInput;
mod generations_artifact_captures;
mod generations_inventory;
mod generations_task_actions;
pub use generations_artifact_captures::{
    GenerationArtifactCapture, GenerationArtifactCaptureClaim, GenerationArtifactCaptureLease,
    GenerationArtifactCaptureRequest,
};
mod media_jobs;
pub use generations_inventory::GenerationsInventoryQuery;
mod generations_chat_sessions;
mod generations_sessions;
mod media_query_reports;
mod media_results;
mod video_composer_drafts;
mod video_intents;
pub use media_jobs::{
    MediaJobStatus, MediaQueryLease, MediaRecoveryCandidate, MediaRecoveryRoute,
    MediaTransportDiagnostic, MediaTransportTiming,
};
pub use media_pricing::{MediaLiabilityBound, MediaUsageSource, MediaUsageState};
pub use media_results::MediaResultKind;
pub use video_composer_drafts::VideoComposerDraft;
pub use video_intents::{VideoIntent, VideoIntentInput};
mod pricing;
mod providers;
pub use accounting::{
    BudgetSnapshot, CostEntry, GatewayActivityCostSummary, GatewayActivityEntry,
    GatewayActivityExportEntry, GatewayActivityFilter, GatewayActivityKeySummary,
    GatewayActivityModelSummary, GatewayActivitySort, GatewayActivitySummary,
    GatewayDeliveryFilter, GatewayDeliverySummary, GatewayReservation,
    GatewayTokenUsageCapabilities,
};
pub use codex_report::{
    CodexRateOverride, CodexRateSnapshot, CodexUsageImportFinish, CodexUsageImportStart,
    CodexUsageResponseInput, CodexUsageTokens,
};
pub use keys::{IssuedKey, KeyMutationResult, KeyMutationStatus, KeyView, Principal};
pub use pricing::{PriceInput, TokenRates};
pub use providers::{
    ProviderBusinessCreate, ProviderMembership, ProviderOfferInput,
    ProviderOfferQualificationInput, ProviderOfferSchedule, ProviderQualificationInput,
    ProviderQualificationRevocationInput, SupplierProfile, SupplierProfileUpdate,
};

mod request_payloads;
mod request_timings;
pub use request_timings::RequestTimingRecord;

mod migration_compatibility;

pub static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!();

type BrandingCache =
    std::sync::Arc<std::sync::RwLock<Option<(i64, std::sync::Arc<BrandingSettings>)>>>;

#[derive(Clone)]
pub struct Store {
    pool: PgPool,
    route_compiler: Option<std::sync::Arc<dyn RouteRegistryCompiler>>,
    branding_cache: BrandingCache,
    platform_currency_cache: std::sync::Arc<std::sync::OnceLock<String>>,
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

/// Minimal authorized workspace identity for restoring a canonical route.
#[derive(sqlx::FromRow, serde::Serialize)]
pub struct WorkspaceRoute {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub name: String,
    pub route_slug: String,
    pub slug: String,
    pub slug_aliases: Vec<String>,
}

#[derive(sqlx::FromRow, serde::Serialize)]
pub struct WorkspaceResource {
    pub id: Uuid,
    /// Stable routing reference. Never use as a display name or authorization.
    pub route_slug: String,
    pub slug: String,
    pub slug_aliases: Vec<String>,
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
    pub route_generation: Option<i64>,
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
    pub finish_reasons: Option<Vec<RequestChoiceFinish>>,
    pub token_categories: Option<RequestTokenCategories>,
    pub scope: TenantScope,
    pub attempt_id: Uuid,
    pub usage: Option<(u64, u64)>,
    pub provider_model: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("company balance account is not configured for the spending-limit currency")]
    KeySpendingCurrencyUnavailable,

    #[error("saved Chat history exceeds the materialization limit")]
    ChatHistoryCapacityExceeded,

    #[error("gateway request deadline expired before dispatch")]
    GatewayRequestDeadlineExceeded,

    #[error("Managed route changed before dispatch")]
    ManagedRouteChanged,

    #[error("workspace contains dependent records or is the installation default")]
    WorkspaceNotEmpty,
    #[error("invalid execution observation")]
    InvalidObservation,
    #[error("database operation failed")]
    Database(#[from] sqlx::Error),
    #[error("workspace slug is already in use")]
    WorkspaceSlugTaken,
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
    #[error("configured token pricing requires unsupported usage categories")]
    UnsupportedTokenPricing,
    #[error("invalid Supplier history filters or page size")]
    InvalidSupplierHistoryQuery,
    #[error("invalid ledger history filters or page size")]
    InvalidLedgerHistoryQuery,
    #[error("budget has insufficient available funds")]
    BudgetExceeded,
    #[error("platform procurement is unavailable")]
    ProcurementUnavailable,
    #[error("customer workspace spending limit exceeded")]
    WorkspaceSpendingLimitExceeded,
    #[error("key customer spending limit exceeded")]
    KeySpendingLimitExceeded,
    #[error("request source is not allowed by API key policy")]
    KeyIpDenied,
    #[error("guardrail dispatch admission rejected and rolled back")]
    GuardrailAdmissionConflict,
    #[error("API key request rate exhausted")]
    KeyRequestRateExceeded,
    #[error("API key request dispatch is disabled by its rate policy")]
    KeyRequestRateDisabled,
    #[error("Upstream credential dispatch is disabled by its rate policy")]
    VendorRequestRateDisabled,
    #[error("upstream credential request rate exhausted")]
    VendorRequestRateExceeded,
    #[error("API key concurrent request limit reached")]
    KeyConcurrencyExceeded,
    #[error("API key token rate exhausted")]
    KeyTokenRateExceeded,
    #[error("Token admission requires bounded supported input and resolved prior usage")]
    KeyTokenBoundRequired,
    #[error("provider metadata does not confirm completed generation")]
    UnconfirmedGeneration,
    #[error("provider usage evidence does not match captured request identity")]
    UsageReconciliationIdentityMismatch,
    #[error("usage or execution remains unresolved")]
    Unresolved,
    #[error("invalid account or quota observation")]
    InvalidAccount,
    #[error("account is unavailable or at its concurrency limit")]
    AccountUnavailable,
    #[error("encrypted image source storage is at capacity")]
    ImageSourceCapacityExceeded,
    #[error("workspace material storage is at capacity")]
    AssetLibraryCapacityExceeded,
    #[error("aggregate exceeds the supported numeric range")]
    AggregateOverflow,
    #[error("invalid operator name, role, or session lifetime")]
    InvalidOperator,
    #[error("invalid operator audit cursor or page size")]
    InvalidOperatorAuditQuery,
    #[error("invalid platform audit category, cursor, or page size")]
    InvalidPlatformAuditQuery,
    #[error("invalid video history cursor or page size")]
    InvalidMediaQuery,
    #[error("invalid generations session input or page cursor")]
    InvalidGenerationsInput,
    #[error("invalid vendor or model configuration")]
    InvalidVendor,
    #[error("database pool size must be positive")]
    InvalidPoolSize,
    #[error("invalid gateway admission batch")]
    InvalidGatewayAdmissionBatch,
}

/// Safe operational metadata. Never includes SQL, bound values, server messages,
/// connection strings or row contents.
pub struct DatabaseDiagnostic {
    pub category: &'static str,
    pub sqlstate: Option<String>,
}

impl StoreError {
    pub fn database_diagnostic(&self) -> Option<DatabaseDiagnostic> {
        let Self::Database(error) = self else {
            return None;
        };
        let category = match error {
            sqlx::Error::Database(_) => "database",
            sqlx::Error::PoolTimedOut => "pool_timeout",
            sqlx::Error::PoolClosed => "pool_closed",
            sqlx::Error::Io(_) => "io",
            sqlx::Error::Tls(_) => "tls",
            sqlx::Error::Protocol(_) => "protocol",
            sqlx::Error::RowNotFound => "row_not_found",
            sqlx::Error::ColumnNotFound(_) | sqlx::Error::ColumnIndexOutOfBounds { .. } => "column",
            sqlx::Error::ColumnDecode { .. } | sqlx::Error::Decode(_) => "decode",
            sqlx::Error::Configuration(_) => "configuration",
            _ => "driver",
        };
        let sqlstate = error
            .as_database_error()
            .and_then(|error| error.code())
            .filter(|code| {
                code.len() == 5
                    && code
                        .bytes()
                        .all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit())
            })
            .map(|code| code.into_owned());
        Some(DatabaseDiagnostic { category, sqlstate })
    }
}

impl Store {
    pub async fn connect(url: &str) -> Result<Self, StoreError> {
        Self::connect_with_max_connections(url, 32).await
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
            .acquire_timeout(std::time::Duration::from_secs(5))
            .after_connect(|connection, _| {
                Box::pin(async move {
                    sqlx::query("SET idle_in_transaction_session_timeout = '15s'")
                        .execute(connection)
                        .await?;
                    Ok(())
                })
            })
            .connect(url)
            .await?;
        let skip_migrations = std::env::var("NIU_SKIP_STARTUP_MIGRATIONS")
            .ok()
            .is_some_and(|v| matches!(v.trim(), "1" | "true" | "TRUE" | "yes" | "YES"));
        if skip_migrations {
            let store = Self::from_pool(pool);
            store.require_current_inspection_schema().await?;
            Ok(store)
        } else {
            migration_compatibility::run(&pool).await?;
            Ok(Self::from_pool(pool))
        }
    }

    /// Explicit migration job entrypoint for rolling deployments. Applies all
    /// embedded migrations and verifies schema currency without starting listeners.
    pub async fn migrate_only(url: &str) -> Result<Self, StoreError> {
        let pool = PgPoolOptions::new()
            .max_connections(1)
            .acquire_timeout(std::time::Duration::from_secs(30))
            .connect(url)
            .await?;
        migration_compatibility::run(&pool).await?;
        let store = Self::from_pool(pool);
        store.require_current_inspection_schema().await?;
        Ok(store)
    }

    /// Offline inspection of an existing schema. Never runs migrations; every
    /// connection is read-only before being made available to inspection code.
    pub async fn connect_read_only(url: &str) -> Result<Self, StoreError> {
        let pool = PgPoolOptions::new()
            .max_connections(1)
            .after_connect(|connection, _| {
                Box::pin(async move {
                    sqlx::query("SET default_transaction_read_only = on")
                        .execute(connection)
                        .await?;
                    Ok(())
                })
            })
            .connect(url)
            .await?;
        Ok(Self::from_pool(pool))
    }

    /// A maintenance inspector must not silently skip domains introduced by a
    /// newer schema or report completeness against an incomplete migration set.
    /// This checks metadata only and never repairs or migrates the database.
    pub async fn require_current_inspection_schema(&self) -> Result<(), StoreError> {
        let applied: Vec<(i64, bool, Vec<u8>)> = sqlx::query_as(
            "SELECT version,success,checksum FROM _sqlx_migrations ORDER BY version",
        )
        .fetch_all(&self.pool)
        .await?;
        let expected: Vec<_> = MIGRATOR
            .iter()
            .filter(|migration| migration.migration_type.is_up_migration())
            .collect();
        if applied.len() != expected.len()
            || applied
                .iter()
                .zip(expected)
                .any(|((version, success, checksum), migration)| {
                    !success
                        || *version != migration.version
                        || checksum.as_slice() != migration.checksum.as_ref()
                })
        {
            return Err(StoreError::Conflict);
        }
        Ok(())
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
        Ok(Self::from_pool(pool))
    }

    pub fn from_pool(pool: PgPool) -> Self {
        Self {
            pool,
            route_compiler: None,
            branding_cache: std::sync::Arc::new(std::sync::RwLock::new(None)),
            platform_currency_cache: std::sync::Arc::new(std::sync::OnceLock::new()),
        }
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

    /// Resolve in the database with scope predicates, independent of list limits.
    pub async fn workspace_route(
        &self,
        route_slug: &str,
        organization_id: Option<Uuid>,
        project_id: Option<Uuid>,
    ) -> Result<Option<WorkspaceRoute>, StoreError> {
        Ok(sqlx::query_as("SELECT p.id,p.organization_id,p.name,p.route_slug,p.route_slug AS slug,ARRAY(SELECT a.slug FROM workspace_slug_aliases a WHERE a.project_id=p.id) AS slug_aliases FROM projects p WHERE (p.route_slug=$1 OR EXISTS(SELECT 1 FROM workspace_slug_aliases a WHERE a.project_id=p.id AND a.slug=$1)) AND ($2::uuid IS NULL OR p.organization_id=$2) AND ($3::uuid IS NULL OR p.id=$3)")
            .bind(route_slug)
            .bind(organization_id)
            .bind(project_id)
            .fetch_optional(&self.pool)
            .await?)
    }

    /// Resolve the owning organization of a workspace by ID with optional member scope.
    pub async fn workspace_organization_id(
        &self,
        organization_id: Option<Uuid>,
        project_id: Uuid,
    ) -> Result<Option<Uuid>, StoreError> {
        Ok(sqlx::query_scalar(
            "SELECT organization_id FROM projects WHERE id=$1 AND ($2::uuid IS NULL OR organization_id=$2)",
        )
        .bind(project_id)
        .bind(organization_id)
        .fetch_optional(&self.pool)
        .await?)
    }

    pub async fn workspaces(
        &self,
        organization_id: Option<Uuid>,
        project_id: Option<Uuid>,
    ) -> Result<Vec<WorkspaceResource>, StoreError> {
        self.workspace_page(organization_id, project_id, None, 1000)
            .await
    }

    /// Cursor lookup is scoped before revealing or using its ordering fields.
    /// Names do not participate in ordering, so renames cannot move page entries.
    pub async fn workspace_page(
        &self,
        organization_id: Option<Uuid>,
        project_id: Option<Uuid>,
        after: Option<Uuid>,
        limit: i64,
    ) -> Result<Vec<WorkspaceResource>, StoreError> {
        if !(1..=1001).contains(&limit) {
            return Err(StoreError::Conflict);
        }
        let mut tx = self.begin_bounded_read_snapshot().await?;
        let cursor: Option<(String, Uuid, String, Uuid)> = if let Some(after) = after {
            Some(sqlx::query_as("SELECT o.created_at::text,o.id,p.created_at::text,p.id FROM projects p JOIN organizations o ON o.id=p.organization_id WHERE p.id=$1 AND ($2::uuid IS NULL OR o.id=$2) AND ($3::uuid IS NULL OR p.id=$3)")
                .bind(after).bind(organization_id).bind(project_id)
                .fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?)
        } else {
            None
        };
        let rows = sqlx::query_as(include_str!("workspace_directory.sql"))
            .bind(organization_id)
            .bind(project_id)
            .bind(cursor.as_ref().map(|v| &v.0))
            .bind(cursor.as_ref().map(|v| v.1))
            .bind(cursor.as_ref().map(|v| &v.2))
            .bind(cursor.as_ref().map(|v| v.3))
            .bind(limit)
            .fetch_all(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(rows)
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
                sqlx::query("INSERT INTO projects (id,organization_id,name) VALUES ($1,$2,'Default workspace')")
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
        let mut tx = self.begin_bounded_recording().await?;
        let project: Option<Uuid> = sqlx::query_scalar(
            "SELECT id FROM projects WHERE organization_id=$1 AND id=$2 FOR UPDATE",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .fetch_optional(&mut *tx)
        .await?;
        if project.is_none() {
            return Ok(false);
        }
        let retained: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM video_composer_drafts WHERE organization_id=$1 AND project_id=$2 AND payload IS NOT NULL AND expires_at>clock_timestamp())")
            .bind(scope.organization_id).bind(scope.project_id).fetch_one(&mut *tx).await?;
        if retained {
            return Err(StoreError::WorkspaceNotEmpty);
        }
        // Only disposable cleared/expired draft tombstones cascade; existing
        // business-history foreign keys continue to protect nonempty workspaces.
        match sqlx::query("DELETE FROM projects WHERE organization_id=$1 AND id=$2")
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .execute(&mut *tx)
            .await
        {
            Ok(result) => {
                tx.commit().await?;
                Ok(result.rows_affected() == 1)
            }
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
        mut admissions: Vec<GatewayAdmission>,
    ) -> Result<Vec<GatewayAdmissionStatus>, StoreError> {
        const MAX_BATCH_SIZE: usize = 64;
        if admissions.is_empty() || admissions.len() > MAX_BATCH_SIZE {
            return Err(StoreError::InvalidGatewayAdmissionBatch);
        }

        let admission_count = admissions.len();
        let original_attempt_ids: Vec<_> = admissions.iter().map(|a| a.attempt_id).collect();
        admissions.sort_unstable_by_key(|a| {
            (
                a.scope.organization_id,
                a.scope.project_id,
                a.key_id,
                a.managed_route.as_ref().map(|r| r.vendor_id),
                a.attempt_id,
            )
        });
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
        let mut route_gen_attempts = Vec::new();
        let mut route_generations = Vec::new();
        let mut managed_attempt_ids = Vec::new();
        let mut managed_vendor_ids = Vec::new();
        let mut managed_model_aliases = Vec::new();
        let mut managed_vendor_revisions = Vec::new();
        let mut managed_model_revisions = Vec::new();
        let mut managed_pool_aliases = Vec::new();
        let mut managed_pool_revisions = Vec::new();
        let mut token_bound_attempts = Vec::new();
        let mut token_bounds = Vec::new();
        let mut guardrail_rows = Vec::new();

        for admission in admissions {
            if let Some(generation) = admission.route_generation {
                route_gen_attempts.push(admission.attempt_id);
                route_generations.push(generation);
            }
            if let Some(route) = admission.managed_route {
                managed_attempt_ids.push(admission.attempt_id);
                managed_vendor_ids.push(route.vendor_id);
                managed_model_aliases.push(route.model_alias);
                managed_vendor_revisions.push(route.vendor_revision);
                managed_model_revisions.push(route.model_revision);
                managed_pool_aliases.push(route.pool_alias);
                managed_pool_revisions.push(route.pool_revision);
            }
            if let Some(bound) = admission.token_bound {
                token_bound_attempts.push(admission.attempt_id);
                token_bounds.push(bound);
            }
            if let Some(snapshot) = admission.inspected_guardrails {
                guardrail_rows.push((
                    admission.scope,
                    admission.attempt_id,
                    admission.key_id,
                    snapshot,
                ));
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

        let mut tx = self.begin_bounded_recording().await?;
        if !route_gen_attempts.is_empty() {
            sqlx::query(
                "INSERT INTO attempt_route_generations(attempt_id, generation) \
                 SELECT * FROM unnest($1::uuid[], $2::bigint[])",
            )
            .bind(&route_gen_attempts)
            .bind(&route_generations)
            .execute(&mut *tx)
            .await?;
        }
        if !managed_attempt_ids.is_empty() {
            let expected_managed = managed_attempt_ids.len() as u64;
            let inserted = sqlx::query(
                "INSERT INTO managed_attempt_routes(\
                    attempt_id,vendor_id,model_alias,vendor_revision,model_revision,\
                    pool_alias,pool_revision,nonexecution_policy\
                 ) \
                 SELECT r.attempt_id,r.vendor_id,r.model_alias,r.vendor_revision,r.model_revision,\
                        r.pool_alias,r.pool_revision,\
                        CASE WHEN v.adapter='openrouter' AND rtrim(v.api_base,'/')='https://openrouter.ai/api/v1' \
                             THEN 'openrouter-text-auth-rejection-v1' END \
                 FROM unnest($1::uuid[],$2::uuid[],$3::text[],$4::bigint[],$5::bigint[],$6::text[],$7::bigint[]) \
                      AS r(attempt_id,vendor_id,model_alias,vendor_revision,model_revision,pool_alias,pool_revision) \
                 JOIN vendors v ON v.id=r.vendor_id AND v.revision=r.vendor_revision",
            )
            .bind(&managed_attempt_ids)
            .bind(&managed_vendor_ids)
            .bind(&managed_model_aliases)
            .bind(&managed_vendor_revisions)
            .bind(&managed_model_revisions)
            .bind(&managed_pool_aliases)
            .bind(&managed_pool_revisions)
            .execute(&mut *tx)
            .await
            .map_err(crate::accounting::map_gateway_admission_error)?;
            if inserted.rows_affected() != expected_managed {
                return Err(StoreError::ManagedRouteChanged);
            }
        }
        if !token_bound_attempts.is_empty() {
            sqlx::query(
                "INSERT INTO key_attempt_token_bounds(attempt_id,token_bound,estimator) \
                 SELECT attempt_id, token_bound, 'serialized-utf8-plus-output-v1' \
                 FROM unnest($1::uuid[], $2::bigint[]) AS row(attempt_id, token_bound)",
            )
            .bind(&token_bound_attempts)
            .bind(&token_bounds)
            .execute(&mut *tx)
            .await?;
        }
        if !guardrail_rows.is_empty() {
            let mut builder = sqlx::QueryBuilder::<sqlx::Postgres>::new(
                "INSERT INTO inspected_guardrail_bindings(\
                    organization_id,project_id,attempt_id,key_id,workspace_revision,\
                    key_policy_revision,key_assignment_revision,input_outcome,\
                    input_elapsed_ms,input_detector_decision_ids\
                 ) ",
            );
            builder.push_values(
                &guardrail_rows,
                |mut b, (scope, attempt_id, key_id, snapshot)| {
                    b.push_bind(scope.organization_id)
                        .push_bind(scope.project_id)
                        .push_bind(*attempt_id)
                        .push_bind(*key_id)
                        .push_bind(snapshot.workspace_revision)
                        .push_bind(snapshot.key_policy_revision)
                        .push_bind(snapshot.key_assignment_revision)
                        .push_bind(&snapshot.input_outcome)
                        .push_bind(snapshot.input_elapsed_ms)
                        .push_bind(&snapshot.input_detector_decision_ids);
                },
            );
            builder.build().execute(&mut *tx).await?;
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
                                return Err(StoreError::GuardrailAdmissionConflict);
                            }
                        }
                    }
                    return Err(StoreError::Database(error));
                }
                return Err(crate::accounting::map_gateway_admission_error(error));
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
        original_attempt_ids
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
        let mut finish_reasons = Vec::new();
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
                details.validate_totals(prompt, output)?;
                categories.push((completion.attempt_id, completion.scope, details));
            }
            if let Some(choices) = completion.finish_reasons {
                let serialized = Self::validate_and_serialize_finish_reasons(choices)?;
                finish_reasons.push((completion.attempt_id, completion.scope, serialized));
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

        let mut tx = self.begin_bounded_recording().await?;
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
        // Concurrent retries may carry the same completed attempts in different
        // batch orders. Acquire category-row locks in one stable order.
        categories.sort_unstable_by_key(|(attempt, _, _)| *attempt);
        for (attempt, scope, details) in categories {
            Self::save_request_token_categories_in_tx(&mut tx, scope, attempt, details).await?;
        }
        if !finish_reasons.is_empty() {
            finish_reasons.sort_unstable_by_key(|(attempt, _, _)| *attempt);
            let mut finish_attempt_ids = Vec::with_capacity(finish_reasons.len());
            let mut finish_org_ids = Vec::with_capacity(finish_reasons.len());
            let mut finish_project_ids = Vec::with_capacity(finish_reasons.len());
            let mut finish_choices = Vec::with_capacity(finish_reasons.len());
            for (attempt, scope, choices) in finish_reasons {
                finish_attempt_ids.push(attempt);
                finish_org_ids.push(scope.organization_id);
                finish_project_ids.push(scope.project_id);
                finish_choices.push(choices);
            }
            let saved = sqlx::query(
                r#"
                    WITH input AS (
                        SELECT * FROM unnest(
                            $1::uuid[], $2::uuid[], $3::uuid[], $4::jsonb[]
                        ) AS row(attempt_id, organization_id, project_id, choices)
                    )
                    INSERT INTO request_finish_reasons (attempt_id, choices)
                    SELECT a.id, input.choices
                    FROM input
                    JOIN attempts a ON a.id = input.attempt_id
                    JOIN operations o ON o.id = a.operation_id
                    WHERE o.organization_id = input.organization_id
                      AND o.project_id = input.project_id
                      AND a.execution = 'confirmed_completed'
                    ON CONFLICT (attempt_id) DO UPDATE
                       SET attempt_id = EXCLUDED.attempt_id
                     WHERE request_finish_reasons.choices = EXCLUDED.choices
                "#,
            )
            .bind(&finish_attempt_ids)
            .bind(&finish_org_ids)
            .bind(&finish_project_ids)
            .bind(&finish_choices)
            .execute(&mut *tx)
            .await?
            .rows_affected();
            if saved != finish_attempt_ids.len() as u64 {
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
