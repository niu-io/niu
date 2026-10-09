use crate::{admin::authorize_project, error::ApiError, state::AppState};
use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
};
use niu_storage::{AdminPermission, TenantScope};
use serde_json::{Value, json};
use uuid::Uuid;

pub async fn get(
    State(state): State<AppState>,
    Path((organization_id, project_id, attempt)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    authorize_project(
        &state,
        &headers,
        AdminPermission::Read,
        organization_id,
        project_id,
    )
    .await?;
    let mut data = state
        .store
        .request_payload(
            TenantScope {
                organization_id,
                project_id,
            },
            attempt,
        )
        .await
        .map_err(ApiError::from_store)?;
    if let Some(payload) = data.as_mut() {
        crate::request_payloads::remove_credentials(&mut payload["request"]);
        let response = crate::customer_response::sanitize_retained(
            payload["content_type"]
                .as_str()
                .ok_or_else(ApiError::unavailable)?,
            payload["response"]
                .as_str()
                .ok_or_else(ApiError::unavailable)?,
        )
        .ok_or_else(ApiError::unavailable)?;
        payload["response"] = json!(response);
    }
    Ok(([("cache-control", "no-store")], Json(json!({"data":data}))))
}
pub async fn delete(
    State(state): State<AppState>,
    Path((organization_id, project_id, attempt)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    authorize_project(
        &state,
        &headers,
        AdminPermission::Write,
        organization_id,
        project_id,
    )
    .await?;
    state
        .store
        .delete_request_payload(
            TenantScope {
                organization_id,
                project_id,
            },
            attempt,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(StatusCode::NO_CONTENT)
}
