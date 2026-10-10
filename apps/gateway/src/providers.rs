//! Supplier-only business APIs. Installation configuration is a separate authority.
use crate::{
    error::ApiError,
    state::{AdminAuthorization, AppState},
};
use axum::{
    Json,
    extract::{Path, Query, State},
    http::HeaderMap,
};
use niu_storage::{
    AdminPermission, ProviderOfferInput, ProviderOfferQualificationInput,
    ProviderQualificationInput, ProviderQualificationRevocationInput, SupplierProfileUpdate,
};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

async fn auth(state: &AppState, headers: &HeaderMap) -> Result<AdminAuthorization, ApiError> {
    state
        .authorize_admin_headers(headers, AdminPermission::Read)
        .await
}
async fn installation(state: &AppState, headers: &HeaderMap) -> Result<(), ApiError> {
    if auth(state, headers).await?.can_manage_platform() {
        Ok(())
    } else {
        Err(ApiError::forbidden())
    }
}
async fn member(
    state: &AppState,
    headers: &HeaderMap,
    provider: Uuid,
    write: bool,
) -> Result<Uuid, ApiError> {
    let AdminAuthorization::Operator(operator) = auth(state, headers).await? else {
        return Err(ApiError::forbidden());
    };
    if state
        .store
        .provider_member(provider, operator.id, write)
        .await
        .map_err(ApiError::from_store)?
    {
        Ok(operator.id)
    } else {
        Err(ApiError::not_found())
    }
}

pub async fn memberships(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let data = match auth(&state, &headers).await? {
        AdminAuthorization::Installation => vec![],
        AdminAuthorization::Operator(operator) => state
            .store
            .provider_memberships(operator.id)
            .await
            .map_err(ApiError::from_store)?,
    };
    Ok(Json(json!({"data":data})))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Period {
    #[serde(default = "default_days")]
    days: i32,
}
fn default_days() -> i32 {
    30
}
pub async fn dashboard(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(provider): Path<Uuid>,
    Query(period): Query<Period>,
) -> Result<Json<Value>, ApiError> {
    member(&state, &headers, provider, false).await?;
    let mut data = state
        .store
        .provider_dashboard(provider, period.days)
        .await
        .map_err(ApiError::from_store)?;
    // Suppliers see consumption grouped by their models and agreed rates.
    // Request-level identifiers belong exclusively to platform reconciliation.
    data.as_object_mut()
        .expect("dashboard object")
        .remove("earnings");
    Ok(Json(json!({"data":data})))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Active {
    active: bool,
}
pub async fn set_offer(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((provider, offer)): Path<(Uuid, Uuid)>,
    Json(input): Json<Active>,
) -> Result<Json<Value>, ApiError> {
    let operator = member(&state, &headers, provider, true).await?;
    state
        .store
        .set_provider_offer_active(provider, offer, operator, input.active)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"active":input.active}})))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Name {
    name: String,
}
pub async fn create(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<Name>,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    let id = state
        .store
        .create_provider_business(&input.name)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"id":id}})))
}
pub async fn profile(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(provider): Path<Uuid>,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    let data = state
        .store
        .supplier_profile(provider)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(json!({"data":data})))
}
pub async fn rename(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(provider): Path<Uuid>,
    Json(input): Json<SupplierProfileUpdate>,
) -> Result<Json<Value>, ApiError> {
    state
        .authorize_admin_headers(&headers, AdminPermission::Write)
        .await?
        .can_manage_platform()
        .then_some(())
        .ok_or_else(ApiError::forbidden)?;
    let data = state
        .store
        .update_supplier_profile(provider, &input)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":data})))
}
pub async fn delete(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(provider): Path<Uuid>,
) -> Result<Json<Value>, ApiError> {
    state
        .authorize_admin_headers(&headers, AdminPermission::Write)
        .await?
        .can_manage_platform()
        .then_some(())
        .ok_or_else(ApiError::forbidden)?;
    state
        .store
        .delete_provider_business(provider)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"deleted":true}})))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Membership {
    role: String,
    active: bool,
}
pub async fn set_member(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((provider, operator)): Path<(Uuid, Uuid)>,
    Json(input): Json<Membership>,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    state
        .store
        .set_provider_member(provider, operator, &input.role, input.active)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"active":input.active}})))
}
pub async fn publish_offer(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(provider): Path<Uuid>,
    Json(input): Json<crate::token_pricing::TokenRateInput>,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    let cached = input
        .cached_prompt_rate
        .as_ref()
        .map(|rate| rate.as_deref());
    let rates = ProviderOfferInput {
        model_alias: input.model_alias,
        currency: input.currency,
        prompt_rate: input.prompt_rate,
        completion_rate: input.completion_rate,
        expected_revision: input.expected_revision,
    };
    let revision = state
        .store
        .publish_provider_offer_with_cache(provider, &rates, cached)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"revision":revision}})))
}

/// Historical rates are procurement data, even after an offer is paused.
pub async fn offer_revision(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((provider, offer, revision)): Path<(Uuid, Uuid, Uuid)>,
) -> Result<Json<Value>, ApiError> {
    let authorization = auth(&state, &headers).await?;
    if !authorization.can_manage_platform() {
        member(&state, &headers, provider, false).await?;
    }
    let data = state
        .store
        .provider_offer_revision(provider, offer, revision)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(json!({"data":data})))
}

pub async fn qualify_business(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(provider): Path<Uuid>,
    Json(input): Json<ProviderQualificationInput>,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    state
        .store
        .qualify_provider_business(provider, &input)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"qualification_status":"qualified"}})))
}

pub async fn qualify_offer(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((provider, offer)): Path<(Uuid, Uuid)>,
    Json(input): Json<ProviderOfferQualificationInput>,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    state
        .store
        .qualify_provider_offer(provider, offer, &input)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"qualification_status":"qualified"}})))
}

pub async fn revoke_business_qualification(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(provider): Path<Uuid>,
    Json(input): Json<ProviderQualificationRevocationInput>,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    state
        .store
        .revoke_provider_qualification(provider, &input.reason_sha256)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"qualification_status":"revoked"}})))
}

pub async fn revoke_offer_qualification(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((provider, offer)): Path<(Uuid, Uuid)>,
    Json(input): Json<ProviderQualificationRevocationInput>,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    state
        .store
        .revoke_provider_offer_qualification(provider, offer, &input.reason_sha256)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"qualification_status":"revoked"}})))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Settlement {
    idempotency_key: Uuid,
    payment_reference: String,
    attempt_ids: Vec<Uuid>,
}
pub async fn record_settlement(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(provider): Path<Uuid>,
    Json(input): Json<Settlement>,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    let id = state
        .store
        .record_provider_settlement(
            provider,
            input.idempotency_key,
            &input.payment_reference,
            &input.attempt_ids,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"id":id}})))
}

pub async fn list(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    Ok(Json(
        json!({"data":state.store.provider_businesses().await.map_err(ApiError::from_store)?}),
    ))
}
pub async fn members(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(provider): Path<Uuid>,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    Ok(Json(
        json!({"data":state.store.provider_members(provider).await.map_err(ApiError::from_store)?}),
    ))
}

pub async fn administration_dashboard(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(provider): Path<Uuid>,
    Query(period): Query<Period>,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    Ok(Json(
        json!({"data":state.store.provider_dashboard(provider,period.days).await.map_err(ApiError::from_store)?}),
    ))
}

/// Procurement configuration belongs to platform administration, never company members.
pub async fn media_rate(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(provider): Path<Uuid>,
    Json(input): Json<niu_storage::SupplierMediaRateCard>,
) -> Result<Json<Value>, ApiError> {
    let authorization = state
        .authorize_admin_headers(&headers, AdminPermission::Write)
        .await?;
    if !authorization.can_manage_platform() {
        return Err(ApiError::forbidden());
    }
    state
        .store
        .register_supplier_media_rate(provider, &input)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"revision":input.revision}})))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MediaRatePage {
    after: Option<String>,
    #[serde(default = "media_rate_page_size")]
    limit: i64,
}
fn media_rate_page_size() -> i64 {
    50
}
pub async fn media_rate_models(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(provider): Path<Uuid>,
    Query(page): Query<MediaRatePage>,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    Ok(Json(
        state
            .store
            .supplier_media_rate_models(provider, page.after.as_deref(), page.limit)
            .await
            .map_err(ApiError::from_store)?,
    ))
}
pub async fn media_rates(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(provider): Path<Uuid>,
    Query(page): Query<MediaRatePage>,
) -> Result<Json<Value>, ApiError> {
    let authorization = auth(&state, &headers).await?;
    if !authorization.can_manage_platform() {
        member(&state, &headers, provider, false).await?;
    }
    Ok(Json(
        state
            .store
            .supplier_media_rates(provider, page.after.as_deref(), page.limit)
            .await
            .map_err(ApiError::from_store)?,
    ))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MediaRateRetirement {
    effective_until: i64,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MediaRateReplacement {
    previous_revision: String,
    rate: niu_storage::SupplierMediaRateCard,
}
pub async fn replace_media_rate(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(provider): Path<Uuid>,
    Json(input): Json<MediaRateReplacement>,
) -> Result<Json<Value>, ApiError> {
    let authorization = state
        .authorize_admin_headers(&headers, AdminPermission::Write)
        .await?;
    if !authorization.can_manage_platform() {
        return Err(ApiError::forbidden());
    }
    state
        .store
        .replace_supplier_media_rate(provider, &input.previous_revision, &input.rate)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(
        json!({"data":{"revision":input.rate.revision,"effective_from":input.rate.tariff.effective_from.to_string()}}),
    ))
}
pub async fn retire_media_rate(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((provider, revision)): Path<(Uuid, String)>,
    Json(input): Json<MediaRateRetirement>,
) -> Result<Json<Value>, ApiError> {
    let authorization = state
        .authorize_admin_headers(&headers, AdminPermission::Write)
        .await?;
    if !authorization.can_manage_platform() {
        return Err(ApiError::forbidden());
    }
    state
        .store
        .retire_supplier_media_rate(provider, &revision, input.effective_until)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(
        json!({"data":{"revision":revision,"effective_until":input.effective_until.to_string()}}),
    ))
}

pub async fn media_offer_models(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(provider): Path<Uuid>,
    Query(page): Query<MediaRatePage>,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    Ok(Json(
        state
            .store
            .supplier_media_offer_models(provider, page.after.as_deref(), page.limit)
            .await
            .map_err(ApiError::from_store)?,
    ))
}
pub async fn publish_media_offer(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(provider): Path<Uuid>,
    Json(input): Json<niu_storage::SupplierMediaOfferInput>,
) -> Result<Json<Value>, ApiError> {
    if !state
        .authorize_admin_headers(&headers, AdminPermission::Write)
        .await?
        .can_manage_platform()
    {
        return Err(ApiError::forbidden());
    }
    let revision = state
        .store
        .publish_supplier_media_offer(provider, &input)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"revision":revision}})))
}

/// Sanitized platform capabilities; credentials and deployment paths stay private.
pub async fn platform_configuration(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    Ok(Json(json!({"data":{
        "payment_gateways": [{"name":"Zhifux","configured":state.payments.is_some()},{"name":"EPay","configured":state.store.payment_gateway_configuration().await.map_err(ApiError::from_store)?.is_some() || state.epay_payments.is_some()},{"name":"Stripe","configured":state.stripe_payments.is_some()}]
    }})))
}
