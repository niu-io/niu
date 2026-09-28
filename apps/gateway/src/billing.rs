//! Open-source customer billing. Retail rates and invoice writes are installation-owned.
use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    extract::{Path, State},
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
        .authorize_admin(
            headers.get("authorization").and_then(|h| h.to_str().ok()),
            AdminPermission::Read,
        )
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
pub async fn tariff(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    Json(input): Json<ProviderOfferInput>,
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
    Ok(Json(
        json!({"data":{"revision":state.store.publish_customer_tariff(scope,&input).await.map_err(ApiError::from_store)?}}),
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
