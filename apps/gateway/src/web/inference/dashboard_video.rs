//! Dashboard session bridge; reuse selected-key inference and saved evidence.
use super::video;
use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
};
use niu_storage::{AdminPermission, Principal, TenantScope};
use serde_json::Value;
use uuid::Uuid;

type KeyPath = (Uuid, Uuid, Uuid);
type JobPath = (Uuid, Uuid, Uuid, Uuid);

async fn principal(
    state: &AppState,
    headers: &HeaderMap,
    (organization_id, project_id, key): KeyPath,
    permission: AdminPermission,
) -> Result<Principal, ApiError> {
    state
        .authorize_dashboard_key(
            headers,
            TenantScope {
                organization_id,
                project_id,
            },
            key,
            permission,
        )
        .await
}
fn saved(value: Option<Value>) -> Result<Json<Value>, ApiError> {
    value.map(Json).ok_or_else(ApiError::not_found)
}

pub(in crate::web) async fn history(
    State(state): State<AppState>,
    Path(path): Path<KeyPath>,
    headers: HeaderMap,
    query: Result<
        axum::extract::Query<video::HistoryQuery>,
        axum::extract::rejection::QueryRejection,
    >,
) -> Result<Json<Value>, ApiError> {
    let principal = principal(&state, &headers, path, AdminPermission::Read).await?;
    let axum::extract::Query(query) = query
        .map_err(|_| ApiError::invalid_request("Invalid video history cursor or page size"))?;
    state
        .store
        .media_jobs_for_key(&principal, query.before, query.limit.unwrap_or(25))
        .await
        .map(Json)
        .map_err(ApiError::from_store)
}

pub(in crate::web) async fn estimate(
    State(state): State<AppState>,
    Path(path): Path<KeyPath>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let principal = principal(&state, &headers, path, AdminPermission::Read).await?;
    video::estimate_as(state, body, principal).await
}

pub(in crate::web) async fn create(
    State(state): State<AppState>,
    Path(path): Path<KeyPath>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let _in_flight = state.track_inference();
    let principal = principal(&state, &headers, path, AdminPermission::Write).await?;
    video::validate_create_headers(&headers)?;
    video::create_as(state, body, principal).await
}

pub(in crate::web) async fn status(
    State(state): State<AppState>,
    Path((organization, workspace, key, job)): Path<JobPath>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let principal = principal(
        &state,
        &headers,
        (organization, workspace, key),
        AdminPermission::Read,
    )
    .await?;
    saved(
        state
            .store
            .media_job_state_for_key(&principal, job)
            .await
            .map_err(ApiError::from_store)?,
    )
}

pub(in crate::web) async fn billing(
    State(state): State<AppState>,
    Path((organization, workspace, key, job)): Path<JobPath>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let principal = principal(
        &state,
        &headers,
        (organization, workspace, key),
        AdminPermission::Read,
    )
    .await?;
    saved(
        state
            .store
            .media_billing_for_key(&principal, job)
            .await
            .map_err(ApiError::from_store)?,
    )
}

pub(in crate::web) async fn timings(
    State(state): State<AppState>,
    Path((organization, workspace, key, job)): Path<JobPath>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let principal = principal(
        &state,
        &headers,
        (organization, workspace, key),
        AdminPermission::Read,
    )
    .await?;
    saved(
        state
            .store
            .media_transport_timings_for_key(&principal, job)
            .await
            .map_err(ApiError::from_store)?,
    )
}

pub(in crate::web) async fn refresh(
    State(state): State<AppState>,
    Path((organization, workspace, key, job)): Path<JobPath>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let _in_flight = state.track_inference();
    let principal = principal(
        &state,
        &headers,
        (organization, workspace, key),
        AdminPermission::Write,
    )
    .await?;
    video::refresh_for_principal(&state, &principal, job)
        .await
        .map(Json)
}

pub(in crate::web) async fn models(
    State(state): State<AppState>,
    Path(path): Path<KeyPath>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let principal = principal(&state, &headers, path, AdminPermission::Read).await?;
    super::video_models::models_as(&state, &principal).await
}

pub(in crate::web) async fn result(
    State(state): State<AppState>,
    Path((organization, workspace, key, job, kind)): Path<(Uuid, Uuid, Uuid, Uuid, String)>,
    headers: HeaderMap,
) -> Result<axum::response::Response, ApiError> {
    let principal = principal(
        &state,
        &headers,
        (organization, workspace, key),
        AdminPermission::Read,
    )
    .await?;
    super::video_results::retrieve_as(&state, &principal, job, &kind).await
}
pub(in crate::web) async fn delete_results(
    State(state): State<AppState>,
    Path((organization, workspace, key, job)): Path<JobPath>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let principal = principal(
        &state,
        &headers,
        (organization, workspace, key),
        AdminPermission::Write,
    )
    .await?;
    super::video_results::delete_as(&state, &principal, job).await
}

pub(in crate::web) async fn results_status(
    State(state): State<AppState>,
    Path((organization, workspace, key, job)): Path<JobPath>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let principal = principal(
        &state,
        &headers,
        (organization, workspace, key),
        AdminPermission::Read,
    )
    .await?;
    super::video_results::availability_as(&state, &principal, job).await
}
