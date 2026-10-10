//! Customer billing. Text tariff and invoice writes remain installation-owned.
//! Media pricing also accepts explicitly granted platform administrators.
use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    extract::{Path, Query, State},
    http::HeaderMap,
};
use niu_storage::{AdminPermission, ProviderOfferInput, TenantScope};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;
async fn authorize(
    state: &AppState,
    headers: &HeaderMap,
    scope: TenantScope,
    write: bool,
) -> Result<(), ApiError> {
    let auth = state
        .authorize_admin_headers(headers, AdminPermission::Read)
        .await?;
    if write && !auth.is_installation() {
        return Err(ApiError::forbidden());
    }
    if !auth.permits_project(scope) {
        return Err(ApiError::not_found());
    }
    Ok(())
}
pub async fn overview(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<Value>, ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    authorize(&state, &headers, scope, false).await?;
    Ok(Json(
        json!({"data":state.store.customer_billing(scope).await.map_err(ApiError::from_store)?}),
    ))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CustomerTariffInput {
    model_alias: String,
    currency: String,
    prompt_rate: String,
    completion_rate: String,
    expected_revision: Option<Uuid>,
    #[serde(default, deserialize_with = "cache_rate_field")]
    cached_prompt_rate: Option<Option<String>>,
}
fn cache_rate_field<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<Option<String>>, D::Error> {
    Option::<String>::deserialize(deserializer).map(Some)
}

pub async fn tariff(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    Json(input): Json<CustomerTariffInput>,
) -> Result<Json<Value>, ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    authorize(&state, &headers, scope, true).await?;
    let models = crate::vendors::effective_models(&state).await?;
    if !models.contains_key(&input.model_alias) {
        return Err(ApiError::invalid_request("Choose an available model alias"));
    }
    let rates = ProviderOfferInput {
        model_alias: input.model_alias,
        currency: input.currency,
        prompt_rate: input.prompt_rate,
        completion_rate: input.completion_rate,
        expected_revision: input.expected_revision,
    };
    let cached = input
        .cached_prompt_rate
        .as_ref()
        .map(|rate| rate.as_deref());
    Ok(Json(
        json!({"data":{"revision":state.store.publish_customer_tariff_with_cache(scope,&rates,cached).await.map_err(ApiError::from_store)?}}),
    ))
}

/// Platform-owned customer selling configuration, separate from procurement.
pub async fn media_rate(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(organization): Path<Uuid>,
    Json(input): Json<niu_storage::CustomerMediaRateCard>,
) -> Result<Json<Value>, ApiError> {
    let authorization = state
        .authorize_admin_headers(&headers, AdminPermission::Write)
        .await?;
    if !authorization.can_manage_platform() {
        return Err(ApiError::forbidden());
    }
    state
        .store
        .register_customer_media_rate(organization, &input)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"revision":input.revision}})))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MediaRatePage {
    after: Option<String>,
    limit: Option<i64>,
}

pub async fn media_rate_models(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(_organization): Path<Uuid>,
    Query(page): Query<MediaRatePage>,
) -> Result<Json<Value>, ApiError> {
    let authorization = state
        .authorize_admin_headers(&headers, AdminPermission::Read)
        .await?;
    if !authorization.can_manage_platform() {
        return Err(ApiError::forbidden());
    }
    Ok(Json(
        state
            .store
            .customer_media_rate_models(page.after.as_deref(), page.limit.unwrap_or(50))
            .await
            .map_err(ApiError::from_store)?,
    ))
}

pub async fn media_rates(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(organization): Path<Uuid>,
    Query(page): Query<MediaRatePage>,
) -> Result<Json<Value>, ApiError> {
    let authorization = state
        .authorize_admin_headers(&headers, AdminPermission::Read)
        .await?;
    if !authorization.can_manage_platform() {
        return Err(ApiError::forbidden());
    }
    Ok(Json(
        state
            .store
            .customer_media_rates(
                organization,
                page.after.as_deref(),
                page.limit.unwrap_or(50),
            )
            .await
            .map_err(ApiError::from_store)?,
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MediaRateReplacementInput {
    previous_revision: String,
    rate: niu_storage::CustomerMediaRateCard,
}

pub async fn replace_media_rate(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(organization): Path<Uuid>,
    Json(input): Json<MediaRateReplacementInput>,
) -> Result<Json<Value>, ApiError> {
    let authorization = state
        .authorize_admin_headers(&headers, AdminPermission::Write)
        .await?;
    if !authorization.can_manage_platform() {
        return Err(ApiError::forbidden());
    }
    state
        .store
        .replace_customer_media_rate(organization, &input.previous_revision, &input.rate)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(
        json!({"data":{"revision":input.rate.revision,"effective_from":input.rate.tariff.effective_from.to_string()}}),
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MediaRateRetirementInput {
    effective_until: i64,
}

pub async fn retire_media_rate(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization, revision)): Path<(Uuid, String)>,
    Json(input): Json<MediaRateRetirementInput>,
) -> Result<Json<Value>, ApiError> {
    let authorization = state
        .authorize_admin_headers(&headers, AdminPermission::Write)
        .await?;
    if !authorization.can_manage_platform() {
        return Err(ApiError::forbidden());
    }
    state
        .store
        .retire_customer_media_rate(organization, &revision, input.effective_until)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(
        json!({"data":{"revision":revision,"effective_until":input.effective_until.to_string()}}),
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InvoiceInput {
    from_ms: i64,
    to_ms: i64,
    currency: String,
    idempotency_key: Uuid,
}
pub async fn issue(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    Json(input): Json<InvoiceInput>,
) -> Result<Json<Value>, ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    authorize(&state, &headers, scope, true).await?;
    let id = state
        .store
        .issue_customer_invoice(
            scope,
            input.from_ms,
            input.to_ms,
            &input.currency,
            input.idempotency_key,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"id":id}})))
}
pub async fn lines(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization_id, project_id, invoice)): Path<(Uuid, Uuid, Uuid)>,
) -> Result<Json<Value>, ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    authorize(&state, &headers, scope, false).await?;
    Ok(Json(
        json!({"data":state.store.customer_invoice_lines(scope,invoice).await.map_err(ApiError::from_store)?}),
    ))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PaymentInput {
    payment_reference: String,
}
pub async fn payment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization_id, project_id, invoice)): Path<(Uuid, Uuid, Uuid)>,
    Json(input): Json<PaymentInput>,
) -> Result<Json<Value>, ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    authorize(&state, &headers, scope, true).await?;
    state
        .store
        .record_customer_payment(scope, invoice, &input.payment_reference)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"id":invoice}})))
}

/// Shared-account read, deliberately separate from workspace billing readers.
pub async fn account_balance(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(organization): Path<Uuid>,
) -> Result<Json<Value>, ApiError> {
    let auth = state
        .authorize_admin_headers(&headers, AdminPermission::Read)
        .await?;
    if !auth.permits_billing_account(organization) {
        return Err(ApiError::not_found());
    }
    Ok(Json(
        json!({"data":state.store.customer_balance_summary(organization).await.map_err(ApiError::from_store)?}),
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SettledFundingInput {
    currency: String,
    amount_nanos: String,
    channel: String,
    payment_reference: String,
}

fn exact_nonnegative_integer(value: &str) -> Result<i64, ApiError> {
    if value.is_empty() || !value.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(ApiError::invalid_request(
            "Use an exact nonnegative decimal integer string.",
        ));
    }
    value
        .parse()
        .map_err(|_| ApiError::invalid_request("Decimal integer exceeds the supported range."))
}

/// Trusted administration records an externally verified settled payment.
/// This is not a customer payment callback or self-service funding endpoint.
pub async fn settled_funding(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(organization): Path<Uuid>,
    Json(input): Json<SettledFundingInput>,
) -> Result<Json<Value>, ApiError> {
    let auth = state
        .authorize_admin_headers(&headers, AdminPermission::Write)
        .await?;
    if !auth.is_installation() {
        return Err(ApiError::forbidden());
    }
    let amount = exact_nonnegative_integer(&input.amount_nanos)?;
    state
        .store
        .record_settled_customer_funding(
            organization,
            &input.currency,
            amount,
            &input.channel,
            &input.payment_reference,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"recorded":true}})))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BalancePolicyInput {
    credit_limit_nanos: String,
    warning_threshold_nanos: Option<String>,
    expected_revision: String,
}

pub async fn balance_policy(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization, currency)): Path<(Uuid, String)>,
    Json(input): Json<BalancePolicyInput>,
) -> Result<Json<Value>, ApiError> {
    let auth = state
        .authorize_admin_headers(&headers, AdminPermission::Write)
        .await?;
    if !auth.is_installation() {
        return Err(ApiError::forbidden());
    }
    let parse = exact_nonnegative_integer;
    let credit = parse(&input.credit_limit_nanos)?;
    let warning = input
        .warning_threshold_nanos
        .as_deref()
        .map(parse)
        .transpose()?;
    let revision = parse(&input.expected_revision)?;
    let next = state
        .store
        .configure_customer_balance_policy(organization, &currency, credit, warning, revision)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"revision":next.to_string()}})))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BalanceWarningInput {
    warning_threshold_nanos: Option<String>,
    expected_revision: String,
}

pub async fn balance_warning(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization, currency)): Path<(Uuid, String)>,
    Json(input): Json<BalanceWarningInput>,
) -> Result<Json<Value>, ApiError> {
    let auth = state
        .authorize_admin_headers(&headers, AdminPermission::Write)
        .await?;
    if !auth.permits_billing_account(organization) {
        return Err(ApiError::not_found());
    }
    let parse = exact_nonnegative_integer;
    let threshold = input
        .warning_threshold_nanos
        .as_deref()
        .map(parse)
        .transpose()?;
    let revision = parse(&input.expected_revision)?;
    let next = state
        .store
        .configure_customer_balance_warning(organization, &currency, threshold, revision)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"revision":next.to_string()}})))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BalanceReversalInput {
    amount_nanos: String,
    idempotency_key: Uuid,
}

pub async fn balance_reversal(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization, entry)): Path<(Uuid, Uuid)>,
    Json(input): Json<BalanceReversalInput>,
) -> Result<Json<Value>, ApiError> {
    let auth = state
        .authorize_admin_headers(&headers, AdminPermission::Write)
        .await?;
    if !auth.is_installation() {
        return Err(ApiError::forbidden());
    }
    let amount = exact_nonnegative_integer(&input.amount_nanos)?;
    state
        .store
        .reverse_customer_balance_entry(organization, entry, amount, input.idempotency_key)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"recorded":true}})))
}

#[derive(Deserialize, Default)]
#[serde(deny_unknown_fields)]
pub struct BalanceTransactionsQuery {
    before: Option<Uuid>,
}

pub async fn balance_transactions(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(organization): Path<Uuid>,
    Query(query): Query<BalanceTransactionsQuery>,
) -> Result<Json<Value>, ApiError> {
    let auth = state
        .authorize_admin_headers(&headers, AdminPermission::Read)
        .await?;
    if !auth.permits_billing_account(organization) {
        return Err(ApiError::not_found());
    }
    let (data, next_cursor) = state
        .store
        .customer_balance_transaction_page(organization, query.before)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":data,"next_cursor":next_cursor})))
}
