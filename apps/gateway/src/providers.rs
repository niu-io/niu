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
use niu_storage::{AdminPermission, ProviderOfferInput};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

async fn auth(state: &AppState, headers: &HeaderMap) -> Result<AdminAuthorization, ApiError> {
    state
        .authorize_admin(
            headers.get("authorization").and_then(|h| h.to_str().ok()),
            AdminPermission::Read,
        )
        .await
}
async fn installation(state: &AppState, headers: &HeaderMap) -> Result<(), ApiError> {
    if auth(state, headers).await?.is_installation() {
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
    Json(input): Json<ProviderOfferInput>,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    let revision = state
        .store
        .publish_provider_offer(provider, &input)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"revision":revision}})))
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
