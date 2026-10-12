//! Dashboard session bridge; reuse selected-key inference and saved evidence.
use super::video;
use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    extract::{Path, State},
    http::HeaderMap,
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
) -> Result<axum::response::Response, ApiError> {
    let _in_flight = state.track_inference();
    let principal = principal(&state, &headers, path, AdminPermission::Write).await?;
    let identity = video::submission_identity(&headers, &body)?;
    video::create_as(state, body, principal, identity, None).await
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

/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/video/jobs/{job}/billing",
///   "method": "get",
///   "operation": {
///     "operationId": "retrieveDashboardVideoBilling",
///     "summary": "Read saved customer video billing through a workspace session",
///     "description": "Workspace session and current selected-key/model authorization required; no API key secret is needed. Performs no upstream query or settlement. Exact amounts are decimal nanounit strings. Only a posted customer debit is a charge; unresolved liability remains explicit. Owner-funded jobs have no Niu customer price or charge. Procurement terms and internal price revision identifiers are excluded.",
///     "x-niu-implementation": "implemented",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "organization",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "project",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "key",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "job",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Saved customer accounting snapshot",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/VideoJobBilling"
///             }
///           }
///         }
///       },
///       "401": {
///         "description": "Invalid session or selected key"
///       },
///       "403": {
///         "description": "Workspace or selected-model access denied"
///       },
///       "404": {
///         "description": "Job missing or inaccessible to the selected key"
///       }
///     }
///   }
/// }
/// ```
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

/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/video/jobs/{job}/observations",
///   "method": "get",
///   "operation": {
///     "summary": "Read saved video query observations",
///     "description": "Workspace read access through the selected key; no key secret is returned. Reads immutable, content-free saved query receipts in descending observation-time/receipt order. Reported quantity is not a customer charge or settled usage. Missing/invalid quantities remain explicit; provider timestamps are epoch seconds, not measured transport spans. Does not poll upstream, submit work, reserve funds or mutate financial state. No upstream identity, URL, credential, raw error, cost, procurement price or protocol configuration is returned. Cursor and receipt page share a bounded read-only snapshot (250 ms lock / 2 s statement limits); authorization and whole-request deadlines are separate. Separate pages are live views. Cache-Control no-store.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "in": "path",
///         "name": "organization",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "in": "path",
///         "name": "project",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "in": "path",
///         "name": "key",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "in": "path",
///         "name": "job",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "in": "query",
///         "name": "after",
///         "schema": {
///           "type": "string",
///           "pattern": "^[a-fA-F0-9]{64}$"
///         }
///       },
///       {
///         "in": "query",
///         "name": "limit",
///         "schema": {
///           "type": "integer",
///           "minimum": 1,
///           "maximum": 100,
///           "default": 50
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Saved observations only; empty data means no saved query receipt in this range.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/VideoQueryObservationPage"
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Malformed cursor or page size."
///       },
///       "401": {
///         "description": "Invalid, expired or revoked credential."
///       },
///       "403": {
///         "description": "Source or workspace permission denied."
///       },
///       "404": {
///         "description": "Unknown job or outside authorized workspace/model scope."
///       },
///       "409": {
///         "description": "Cursor absent from this job scope."
///       },
///       "503": {
///         "description": "Storage read unavailable; never empty successful history."
///       }
///     },
///     "x-niu-implementation": "implemented",
///     "operationId": "dashboardVideoQueryObservations"
///   }
/// }
/// ```
pub(in crate::web) async fn observations(
    State(state): State<AppState>,
    Path((organization, workspace, key, job)): Path<JobPath>,
    headers: HeaderMap,
    query: Result<
        axum::extract::Query<super::video_observations::ObservationQuery>,
        axum::extract::rejection::QueryRejection,
    >,
) -> Result<([(String, String); 1], Json<Value>), ApiError> {
    let principal = principal(
        &state,
        &headers,
        (organization, workspace, key),
        AdminPermission::Read,
    )
    .await?;
    let query = super::video_observations::ObservationQuery::parse(query)?;
    let limit = query.limit.unwrap_or(50);
    let result = state
        .store
        .media_query_observations_for_key(&principal, job, query.after.as_deref(), limit)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(([("cache-control".into(), "no-store".into())], Json(result)))
}
