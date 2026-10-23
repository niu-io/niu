//! Explicit recovery actions use the original task binding, never composer input.
use crate::web::workspace_path::WorkspacePath as Path;
use crate::{
    error::ApiError,
    state::{AdminAuthorization, AppState},
};
use axum::body::Bytes;
use axum::{
    Json,
    extract::{Query, State, rejection::QueryRejection},
    http::HeaderMap,
    response::Response,
};
use niu_storage::{AdminPermission, Principal, TenantScope};
use serde_json::Value;

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub(in crate::web) struct ActionQuery {}

fn validate(
    query: Result<Query<ActionQuery>, QueryRejection>,
    body: &Bytes,
) -> Result<(), ApiError> {
    query.map_err(|_| {
        ApiError::invalid_request("Task actions accept no replacement model, key or Provider")
    })?;
    if !body.is_empty() {
        serde_json::from_slice::<ActionQuery>(body).map_err(|_| {
            ApiError::invalid_request("Task actions accept no replacement model, key or Provider")
        })?;
    }
    Ok(())
}
use uuid::Uuid;

async fn principal(
    state: &AppState,
    headers: &HeaderMap,
    scope: TenantScope,
    task: Uuid,
) -> Result<Principal, ApiError> {
    let authorization = state
        .authorize_admin_headers(headers, AdminPermission::Write)
        .await?;
    if !authorization.permits_project(scope) {
        return Err(ApiError::forbidden());
    }
    let owner = match authorization {
        AdminAuthorization::Installation => "installation".to_owned(),
        AdminAuthorization::Operator(operator) => format!("operator:{}", operator.id),
    };
    let key = state
        .store
        .generations_task_action_key(scope, &owner, task)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    state
        .store
        .dashboard_key_with_ip(scope, key, crate::request_source::current_ip())
        .await
        .map_err(ApiError::from_store)
}

/// ```openapi
/// {
///   "path": "/api/v1/organizations/{organization}/projects/{project}/generations/tasks/{task}/refresh",
///   "method": "post",
///   "operation": {
///     "operationId": "refreshGenerationsTask",
///     "x-niu-implementation": "implemented",
///     "summary": "Explicitly refresh the original Video task",
///     "description": "Explicit workspace Write action. Derives the original inference key and immutable Provider/account/model/channel binding from the actor-visible saved task; clients cannot choose replacements. Current original key grants and source policy remain required; revoked or expired keys never regain action authority through history. No generation, automatic retry or composer configuration is used. Rechecks actor visibility and grants after upstream work. Saved GET, cached artifact content, upstream refresh and fresh delivery remain distinct. Queries saved task status through the existing guarded recovery/settlement path; query receipts can be appended, but no task is created.",
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
///         "name": "task",
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
///         "description": "Saved Video state after explicit query",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "required": [
///                 "id",
///                 "object",
///                 "model",
///                 "status"
///               ],
///               "properties": {
///                 "id": {
///                   "type": "string",
///                   "format": "uuid"
///                 },
///                 "object": {
///                   "const": "video.job"
///                 },
///                 "model": {
///                   "type": "string"
///                 },
///                 "status": {
///                   "type": "string",
///                   "enum": [
///                     "submission_unknown",
///                     "queued",
///                     "running",
///                     "succeeded",
///                     "failed",
///                     "unknown",
///                     "reconciliation_required"
///                   ]
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid kind or request"
///       },
///       "401": {
///         "description": "Sign-in required"
///       },
///       "403": {
///         "description": "Workspace Write or original-key permission denied"
///       },
///       "404": {
///         "description": "Task missing, actor-private, or original key no longer available"
///       },
///       "409": {
///         "description": "Original Provider binding changed or query already claimed"
///       },
///       "502": {
///         "description": "Upstream query or result delivery failed"
///       },
///       "503": {
///         "description": "Storage or bounded delivery unavailable"
///       },
///       "504": {
///         "description": "Upstream query or delivery timed out"
///       }
///     }
///   }
/// }
/// ```
pub(in crate::web) async fn refresh(
    State(state): State<AppState>,
    Path((organization_id, project_id, task)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
    query: Result<Query<ActionQuery>, QueryRejection>,
    body: Bytes,
) -> Result<([(String, String); 1], Json<Value>), ApiError> {
    validate(query, &body)?;
    let _in_flight = state.track_inference();
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    let authorized = principal(&state, &headers, scope, task).await?;
    let result = super::video::refresh_for_principal(&state, &authorized, task).await?;
    // Visibility or key grants can change during the bounded upstream query.
    principal(&state, &headers, scope, task).await?;
    Ok((
        [("cache-control".into(), "private, no-store".into())],
        Json(result),
    ))
}

/// ```openapi
/// {
///   "path": "/api/v1/organizations/{organization}/projects/{project}/generations/tasks/{task}/results/{kind}/refresh",
///   "method": "post",
///   "operation": {
///     "operationId": "retrieveFreshGenerationsTaskResult",
///     "x-niu-implementation": "implemented",
///     "summary": "Retrieve fresh output from the original Video task",
///     "description": "Explicit workspace Write action. Derives the original inference key and immutable Provider/account/model/channel binding from the actor-visible saved task; clients cannot choose replacements. Current original key grants and source policy remain required; revoked or expired keys never regain action authority through history. No generation, automatic retry or composer configuration is used. Rechecks actor visibility and grants after upstream work. Saved GET, cached artifact content, upstream refresh and fresh delivery remain distinct. Queries the original task once, then performs bounded authorized binary retrieval. Does not rewrite expired/deleted cached references. A fresh URL does not prove durable media availability; missing result404, Provider gone/unavailable502 and timeout504 remain explicit.",
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
///         "name": "task",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "kind",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "enum": [
///             "video",
///             "last_frame"
///           ]
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Bounded media bytes",
///         "content": {
///           "video/mp4": {
///             "schema": {
///               "type": "string",
///               "format": "binary"
///             }
///           },
///           "video/webm": {
///             "schema": {
///               "type": "string",
///               "format": "binary"
///             }
///           },
///           "image/png": {
///             "schema": {
///               "type": "string",
///               "format": "binary"
///             }
///           },
///           "image/jpeg": {
///             "schema": {
///               "type": "string",
///               "format": "binary"
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid kind or request"
///       },
///       "401": {
///         "description": "Sign-in required"
///       },
///       "403": {
///         "description": "Workspace Write or original-key permission denied"
///       },
///       "404": {
///         "description": "Task missing, actor-private, or original key no longer available"
///       },
///       "409": {
///         "description": "Original Provider binding changed or query already claimed"
///       },
///       "502": {
///         "description": "Upstream query or result delivery failed"
///       },
///       "503": {
///         "description": "Storage or bounded delivery unavailable"
///       },
///       "504": {
///         "description": "Upstream query or delivery timed out"
///       }
///     }
///   }
/// }
/// ```
pub(in crate::web) async fn fresh_result(
    State(state): State<AppState>,
    Path((organization_id, project_id, task, kind)): Path<(Uuid, Uuid, Uuid, String)>,
    headers: HeaderMap,
    query: Result<Query<ActionQuery>, QueryRejection>,
    body: Bytes,
) -> Result<Response, ApiError> {
    validate(query, &body)?;
    let _in_flight = state.track_inference();
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    let authorized = principal(&state, &headers, scope, task).await?;
    let response =
        super::video_results::retrieve_fresh_as(&state, &authorized, task, &kind).await?;
    principal(&state, &headers, scope, task).await?;
    Ok(response)
}
