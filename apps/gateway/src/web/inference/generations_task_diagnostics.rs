//! Historical customer diagnostics; no inference key or Provider interaction.
use crate::{
    error::ApiError,
    state::{AdminAuthorization, AppState},
};
use axum::{
    Json,
    extract::{Path, State},
    http::HeaderMap,
};
use niu_storage::{AdminPermission, TenantScope};
use serde_json::Value;
use uuid::Uuid;

/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/projects/{project}/generations/tasks/{task}/diagnostics",
///   "method": "get",
///   "operation": {
///     "operationId": "generationsTaskDiagnostics",
///     "x-niu-implementation": "implemented",
///     "summary": "Read saved customer billing and transport diagnostics",
///     "description": "Current dashboard workspace Read authorizes persisted diagnostics independently of the original inference key expiry, revocation or model grants. Actor-private tasks belonging to another actor are 404. Billing is customer-only; owner-funded jobs retain null customer charges and never expose procurement costs. Billing and measured transport/lifecycle observations share one bounded read-only snapshot. This GET never contacts a Provider, polls, refreshes, retries, submits or settles a task. Errors are explicit; no successful empty result hides a storage failure.",
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
///         "description": "Persisted customer diagnostics",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "required": [
///                 "billing",
///                 "timings"
///               ],
///               "properties": {
///                 "billing": {
///                   "$ref": "#/components/schemas/VideoJobBilling"
///                 },
///                 "timings": {
///                   "$ref": "#/components/schemas/VideoTransportTimings"
///                 }
///               }
///             }
///           }
///         }
///       },
///       "401": {
///         "description": "Invalid dashboard session"
///       },
///       "403": {
///         "description": "Workspace Read denied"
///       },
///       "404": {
///         "description": "Saved Video task missing or actor-private"
///       },
///       "503": {
///         "description": "Saved diagnostics unavailable"
///       }
///     }
///   },
///   "schemas": {
///     "VideoTransportTimings": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "data",
///         "has_more",
///         "lifecycle"
///       ],
///       "properties": {
///         "has_more": {
///           "type": "boolean"
///         },
///         "data": {
///           "type": "array",
///           "maxItems": 100,
///           "items": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "phase",
///               "started_unix_ms",
///               "elapsed_ms",
///               "outcome",
///               "upstream_http_status",
///               "upstream_error_code",
///               "upstream_request_id"
///             ],
///             "properties": {
///               "phase": {
///                 "type": "string",
///                 "enum": [
///                   "submission",
///                   "query",
///                   "result"
///                 ]
///               },
///               "started_unix_ms": {
///                 "type": "integer",
///                 "minimum": 0
///               },
///               "elapsed_ms": {
///                 "type": "integer",
///                 "minimum": 0
///               },
///               "outcome": {
///                 "type": "string",
///                 "enum": [
///                   "received",
///                   "unavailable"
///                 ]
///               },
///               "upstream_http_status": {
///                 "type": [
///                   "integer",
///                   "null"
///                 ]
///               },
///               "upstream_error_code": {
///                 "type": [
///                   "string",
///                   "null"
///                 ]
///               },
///               "upstream_request_id": {
///                 "type": [
///                   "string",
///                   "null"
///                 ]
///               }
///             }
///           }
///         },
///         "lifecycle": {
///           "type": "object",
///           "additionalProperties": false,
///           "required": [
///             "source",
///             "submitted_unix_ms",
///             "observations",
///             "conflicting_terminal"
///           ],
///           "properties": {
///             "source": {
///               "type": "string",
///               "enum": [
///                 "gateway_observation"
///               ]
///             },
///             "submitted_unix_ms": {
///               "type": [
///                 "integer",
///                 "null"
///               ]
///             },
///             "conflicting_terminal": {
///               "type": "boolean"
///             },
///             "observations": {
///               "type": "array",
///               "items": {
///                 "type": "object",
///                 "additionalProperties": false,
///                 "required": [
///                   "status",
///                   "observed_unix_ms"
///                 ],
///                 "properties": {
///                   "status": {
///                     "type": "string",
///                     "enum": [
///                       "queued",
///                       "running",
///                       "succeeded",
///                       "failed",
///                       "unknown"
///                     ]
///                   },
///                   "observed_unix_ms": {
///                     "type": "integer"
///                   }
///                 }
///               }
///             }
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub(in crate::web) async fn retrieve(
    State(state): State<AppState>,
    Path((organization_id, project_id, task)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<([(String, String); 1], Json<Value>), ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    let authorization = state
        .authorize_admin_headers(&headers, AdminPermission::Read)
        .await?;
    if !authorization.permits_project(scope) {
        return Err(ApiError::forbidden());
    }
    let owner = match authorization {
        AdminAuthorization::Installation => "installation".to_owned(),
        AdminAuthorization::Operator(operator) => format!("operator:{}", operator.id),
    };
    let value = state
        .store
        .generation_task_diagnostics(scope, &owner, task)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok((
        [("cache-control".into(), "private, no-store".into())],
        Json(value),
    ))
}
