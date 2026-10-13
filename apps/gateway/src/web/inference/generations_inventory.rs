//! Session-authenticated saved inventory; never dispatches or refreshes a task.
use crate::{
    error::ApiError,
    state::{AdminAuthorization, AppState},
};
use axum::{
    Json,
    extract::{Path, Query, State},
    http::HeaderMap,
    response::Response,
};
use niu_storage::{AdminPermission, GenerationsInventoryQuery, TenantScope};
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct InventoryQuery {
    state: Option<String>,
    kind: Option<String>,
    session_id: Option<Uuid>,
    cursor: Option<String>,
    limit: Option<i64>,
}
async fn owner(
    state: &AppState,
    headers: &HeaderMap,
    scope: TenantScope,
) -> Result<String, ApiError> {
    let auth = state
        .authorize_admin_headers(headers, AdminPermission::Read)
        .await?;
    if !auth.permits_project(scope) {
        return Err(ApiError::forbidden());
    }
    Ok(match auth {
        AdminAuthorization::Installation => "installation".into(),
        AdminAuthorization::Operator(o) => format!("operator:{}", o.id),
    })
}
async fn list(
    state: AppState,
    headers: HeaderMap,
    org: Uuid,
    workspace: Uuid,
    q: InventoryQuery,
    outputs: bool,
) -> Result<([(String, String); 1], Json<Value>), ApiError> {
    let scope = TenantScope {
        organization_id: org,
        project_id: workspace,
    };
    let actor = owner(&state, &headers, scope).await?;
    if q.kind.as_deref().is_some_and(|kind| kind != "video") {
        return Err(ApiError::invalid_request(
            "Only video execution inventory is supported; Chat remains in saved sessions",
        ));
    }
    let value = state
        .store
        .generations_inventory(
            scope,
            &actor,
            GenerationsInventoryQuery {
                state: q.state.as_deref(),
                session_id: q.session_id,
                cursor: q.cursor.as_deref(),
                limit: q.limit.unwrap_or(25),
            },
            outputs,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok((
        [("cache-control".into(), "private, no-store".into())],
        Json(value),
    ))
}
/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/projects/{project}/generations/tasks",
///   "method": "get",
///   "operation": {
///     "operationId": "generationsInventoryTasks",
///     "summary": "List saved Video tasks across workspace keys",
///     "description": "Current dashboard workspace Read authorizes saved history even when its inference key is revoked, expired, or its model grants changed. No active key secret is needed. Actor-private session/intent tasks belonging to another actor are excluded. API-created tasks without a private association are workspace-readable. No prompt, upstream URL, asset URI, credential or procurement field is returned. This GET never dispatches, refreshes, retries or settles inference. Task pages use immutable created_at/id DESC; artifacts use immutable output created_at/task_id/kind DESC. A cursor resolves in current authorized workspace independently of mutable state filters; malformed, missing or out-of-scope cursor is 400. Changing filters starts a new live view. No partial successful empty result: storage errors return 503. Artifact reference availability is retention evidence, not a guarantee the upstream bytes still exist. Content delivery performs only bounded result retrieval, rechecking dashboard access and retention after download. Content remains explicitly refused with 409 if its original Provider account/model binding is no longer current; historical read access never restores routing or credential authority. Existing key-scoped APIs and explicit refresh authorization remain unchanged. Chat stays in typed saved sessions; only Video execution inventory is supported.",
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
///         "name": "kind",
///         "in": "query",
///         "schema": {
///           "enum": [
///             "video"
///           ]
///         }
///       },
///       {
///         "name": "state",
///         "in": "query",
///         "schema": {
///           "enum": [
///             "queued",
///             "running",
///             "succeeded",
///             "failed",
///             "unknown",
///             "submission_unknown",
///             "reconciliation_required"
///           ]
///         }
///       },
///       {
///         "name": "session_id",
///         "in": "query",
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "cursor",
///         "in": "query",
///         "schema": {
///           "type": "string"
///         }
///       },
///       {
///         "name": "limit",
///         "in": "query",
///         "schema": {
///           "type": "integer",
///           "minimum": 1,
///           "maximum": 100,
///           "default": 25
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Saved projection; complete true means this supported Video inventory read completed, not all task kinds.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "type": "object",
///                     "properties": {
///                       "id": {
///                         "type": "string",
///                         "format": "uuid"
///                       },
///                       "kind": {
///                         "const": "video"
///                       },
///                       "model": {
///                         "type": "string"
///                       },
///                       "model_display_name": {
///                         "type": [
///                           "string",
///                           "null"
///                         ]
///                       },
///                       "created_at": {
///                         "type": "string",
///                         "format": "date-time"
///                       },
///                       "updated_at": {
///                         "type": "string",
///                         "format": "date-time"
///                       },
///                       "state": {
///                         "enum": [
///                           "queued",
///                           "running",
///                           "succeeded",
///                           "failed",
///                           "unknown",
///                           "submission_unknown",
///                           "reconciliation_required"
///                         ]
///                       },
///                       "source": {
///                         "enum": [
///                           "api",
///                           "generations",
///                           "unknown"
///                         ]
///                       },
///                       "session_id": {
///                         "type": [
///                           "string",
///                           "null"
///                         ],
///                         "format": "uuid"
///                       },
///                       "turn_id": {
///                         "type": [
///                           "string",
///                           "null"
///                         ],
///                         "format": "uuid"
///                       },
///                       "artifacts": {
///                         "type": "array",
///                         "items": {
///                           "type": "object",
///                           "properties": {
///                             "kind": {
///                               "enum": [
///                                 "video",
///                                 "last_frame"
///                               ]
///                             },
///                             "availability": {
///                               "enum": [
///                                 "available",
///                                 "deleted",
///                                 "expired",
///                                 "unavailable"
///                               ]
///                             },
///                             "capture": {
///                               "oneOf": [
///                                 {
///                                   "$ref": "#/components/schemas/GenerationArtifactCapture"
///                                 },
///                                 {
///                                   "type": "null"
///                                 }
///                               ]
///                             }
///                           },
///                           "required": [
///                             "kind",
///                             "availability",
///                             "capture"
///                           ]
///                         }
///                       },
///                       "execution_context": {
///                         "type": "object",
///                         "additionalProperties": false,
///                         "required": [
///                           "submitted_model",
///                           "dispatched_model",
///                           "provider",
///                           "channel",
///                           "dispatched_at",
///                           "source",
///                           "parameters_source",
///                           "references_state",
///                           "parameters"
///                         ],
///                         "properties": {
///                           "submitted_model": {
///                             "type": "string"
///                           },
///                           "dispatched_model": {
///                             "type": [
///                               "string",
///                               "null"
///                             ]
///                           },
///                           "provider": {
///                             "type": [
///                               "string",
///                               "null"
///                             ],
///                             "description": "Adapter recorded at dispatch; not a Supplier account name."
///                           },
///                           "channel": {
///                             "type": [
///                               "string",
///                               "null"
///                             ]
///                           },
///                           "dispatched_at": {
///                             "type": "string",
///                             "format": "date-time"
///                           },
///                           "source": {
///                             "const": "saved_execution"
///                           },
///                           "parameters_source": {
///                             "enum": [
///                               "saved_validated_snapshot",
///                               "unknown"
///                             ]
///                           },
///                           "references_state": {
///                             "const": "not_in_execution_snapshot"
///                           },
///                           "parameters": {
///                             "type": [
///                               "object",
///                               "null"
///                             ],
///                             "additionalProperties": false,
///                             "properties": {
///                               "duration": {
///                                 "type": "number"
///                               },
///                               "seed": {
///                                 "type": "number"
///                               },
///                               "frames_per_second": {
///                                 "type": "number"
///                               },
///                               "watermark": {
///                                 "type": "boolean"
///                               },
///                               "camera_fixed": {
///                                 "type": "boolean"
///                               },
///                               "return_last_frame": {
///                                 "type": "boolean"
///                               },
///                               "resolution": {
///                                 "type": "string"
///                               },
///                               "ratio": {
///                                 "type": "string"
///                               },
///                               "omni_reference_task_type": {
///                                 "type": "string"
///                               }
///                             }
///                           }
///                         }
///                       },
///                       "model_display_name_source": {
///                         "enum": [
///                           "current_catalog",
///                           "unknown"
///                         ]
///                       }
///                     },
///                     "required": [
///                       "id",
///                       "kind",
///                       "model",
///                       "model_display_name",
///                       "created_at",
///                       "updated_at",
///                       "state",
///                       "source",
///                       "session_id",
///                       "turn_id",
///                       "artifacts",
///                       "execution_context",
///                       "model_display_name_source"
///                     ]
///                   }
///                 },
///                 "has_more": {
///                   "type": "boolean"
///                 },
///                 "next_cursor": {
///                   "type": [
///                     "string",
///                     "null"
///                   ]
///                 },
///                 "supported_kinds": {
///                   "type": "array",
///                   "items": {
///                     "const": "video"
///                   }
///                 },
///                 "complete": {
///                   "const": true
///                 }
///               },
///               "required": [
///                 "data",
///                 "has_more",
///                 "next_cursor",
///                 "supported_kinds",
///                 "complete"
///               ]
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid query, unsupported kind or inaccessible cursor"
///       },
///       "401": {
///         "description": "Session invalid or expired"
///       },
///       "403": {
///         "description": "Current workspace permission denied"
///       },
///       "404": {
///         "description": "Record missing or actor-inaccessible"
///       },
///       "409": {
///         "description": "Original Provider delivery binding is no longer current; metadata history remains readable."
///       },
///       "503": {
///         "description": "Saved read unavailable; never presented as empty inventory"
///       }
///     },
///     "x-niu-implementation": "implemented"
///   },
///   "schemas": {
///     "GenerationArtifactCapture": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "id",
///         "task_id",
///         "kind",
///         "status",
///         "asset_id",
///         "availability",
///         "failure_code",
///         "created_at",
///         "updated_at"
///       ],
///       "properties": {
///         "id": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "task_id": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "kind": {
///           "enum": [
///             "video",
///             "last_frame"
///           ]
///         },
///         "status": {
///           "enum": [
///             "preparing",
///             "stored",
///             "failed"
///           ]
///         },
///         "asset_id": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "format": "uuid"
///         },
///         "availability": {
///           "enum": [
///             "retained",
///             "deleted",
///             "not_stored"
///           ]
///         },
///         "failure_code": {
///           "enum": [
///             null,
///             "delivery_failed",
///             "authorization_changed",
///             "invalid_media",
///             "capacity_exceeded",
///             "storage_unavailable",
///             "encryption_unavailable"
///           ]
///         },
///         "created_at": {
///           "type": "string",
///           "format": "date-time"
///         },
///         "updated_at": {
///           "type": "string",
///           "format": "date-time"
///         }
///       }
///     }
///   }
/// }
/// ```
pub(in crate::web) async fn tasks(
    State(state): State<AppState>,
    Path((org, workspace)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    query: Result<Query<InventoryQuery>, axum::extract::rejection::QueryRejection>,
) -> Result<([(String, String); 1], Json<Value>), ApiError> {
    let Query(q) = query.map_err(|_| ApiError::invalid_request("Invalid inventory query"))?;
    list(state, headers, org, workspace, q, false).await
}
/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/projects/{project}/generations/artifacts",
///   "method": "get",
///   "operation": {
///     "operationId": "generationsInventoryArtifacts",
///     "summary": "List actual saved output references",
///     "description": "Current dashboard workspace Read authorizes saved history even when its inference key is revoked, expired, or its model grants changed. No active key secret is needed. Actor-private session/intent tasks belonging to another actor are excluded. API-created tasks without a private association are workspace-readable. No prompt, upstream URL, asset URI, credential or procurement field is returned. This GET never dispatches, refreshes, retries or settles inference. Task pages use immutable created_at/id DESC; artifacts use immutable output created_at/task_id/kind DESC. A cursor resolves in current authorized workspace independently of mutable state filters; malformed, missing or out-of-scope cursor is 400. Changing filters starts a new live view. No partial successful empty result: storage errors return 503. Artifact reference availability is retention evidence, not a guarantee the upstream bytes still exist. Content delivery performs only bounded result retrieval, rechecking dashboard access and retention after download. Content remains explicitly refused with 409 if its original Provider account/model binding is no longer current; historical read access never restores routing or credential authority. Existing key-scoped APIs and explicit refresh authorization remain unchanged. Chat stays in typed saved sessions; only Video execution inventory is supported.",
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
///         "name": "kind",
///         "in": "query",
///         "schema": {
///           "enum": [
///             "video"
///           ]
///         }
///       },
///       {
///         "name": "state",
///         "in": "query",
///         "schema": {
///           "enum": [
///             "queued",
///             "running",
///             "succeeded",
///             "failed",
///             "unknown",
///             "submission_unknown",
///             "reconciliation_required"
///           ]
///         }
///       },
///       {
///         "name": "session_id",
///         "in": "query",
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "cursor",
///         "in": "query",
///         "schema": {
///           "type": "string"
///         }
///       },
///       {
///         "name": "limit",
///         "in": "query",
///         "schema": {
///           "type": "integer",
///           "minimum": 1,
///           "maximum": 100,
///           "default": 25
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Saved projection; complete true means this supported Video inventory read completed, not all task kinds.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "type": "object",
///                     "properties": {
///                       "task_id": {
///                         "type": "string",
///                         "format": "uuid"
///                       },
///                       "kind": {
///                         "enum": [
///                           "video",
///                           "last_frame"
///                         ]
///                       },
///                       "name": {
///                         "type": "string"
///                       },
///                       "created_at": {
///                         "type": "string",
///                         "format": "date-time"
///                       },
///                       "content_type": {
///                         "type": [
///                           "string",
///                           "null"
///                         ],
///                         "description": "Inspected captured-library content type when known; otherwise null."
///                       },
///                       "availability": {
///                         "enum": [
///                           "available",
///                           "deleted",
///                           "expired",
///                           "unavailable"
///                         ]
///                       },
///                       "session_id": {
///                         "type": [
///                           "string",
///                           "null"
///                         ],
///                         "format": "uuid"
///                       },
///                       "turn_id": {
///                         "type": [
///                           "string",
///                           "null"
///                         ],
///                         "format": "uuid"
///                       },
///                       "workspace_id": {
///                         "type": "string",
///                         "format": "uuid"
///                       },
///                       "capture": {
///                         "oneOf": [
///                           {
///                             "$ref": "#/components/schemas/GenerationArtifactCapture"
///                           },
///                           {
///                             "type": "null"
///                           }
///                         ]
///                       }
///                     },
///                     "required": [
///                       "task_id",
///                       "kind",
///                       "name",
///                       "created_at",
///                       "content_type",
///                       "availability",
///                       "session_id",
///                       "turn_id",
///                       "workspace_id",
///                       "capture"
///                     ]
///                   }
///                 },
///                 "has_more": {
///                   "type": "boolean"
///                 },
///                 "next_cursor": {
///                   "type": [
///                     "string",
///                     "null"
///                   ]
///                 },
///                 "supported_kinds": {
///                   "type": "array",
///                   "items": {
///                     "const": "video"
///                   }
///                 },
///                 "complete": {
///                   "const": true
///                 }
///               },
///               "required": [
///                 "data",
///                 "has_more",
///                 "next_cursor",
///                 "supported_kinds",
///                 "complete"
///               ]
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid query, unsupported kind or inaccessible cursor"
///       },
///       "401": {
///         "description": "Session invalid or expired"
///       },
///       "403": {
///         "description": "Current workspace permission denied"
///       },
///       "404": {
///         "description": "Record missing or actor-inaccessible"
///       },
///       "409": {
///         "description": "Original Provider delivery binding is no longer current; metadata history remains readable."
///       },
///       "503": {
///         "description": "Saved read unavailable; never presented as empty inventory"
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub(in crate::web) async fn artifacts(
    State(state): State<AppState>,
    Path((org, workspace)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    query: Result<Query<InventoryQuery>, axum::extract::rejection::QueryRejection>,
) -> Result<([(String, String); 1], Json<Value>), ApiError> {
    let Query(q) = query.map_err(|_| ApiError::invalid_request("Invalid inventory query"))?;
    list(state, headers, org, workspace, q, true).await
}
/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/projects/{project}/generations/tasks/{task}",
///   "method": "get",
///   "operation": {
///     "operationId": "generationsInventoryTask",
///     "summary": "Read a saved Video task",
///     "description": "Current dashboard workspace Read authorizes saved history even when its inference key is revoked, expired, or its model grants changed. No active key secret is needed. Actor-private session/intent tasks belonging to another actor are excluded. API-created tasks without a private association are workspace-readable. No prompt, upstream URL, asset URI, credential or procurement field is returned. This GET never dispatches, refreshes, retries or settles inference. Task pages use immutable created_at/id DESC; artifacts use immutable output created_at/task_id/kind DESC. A cursor resolves in current authorized workspace independently of mutable state filters; malformed, missing or out-of-scope cursor is 400. Changing filters starts a new live view. No partial successful empty result: storage errors return 503. Artifact reference availability is retention evidence, not a guarantee the upstream bytes still exist. Content delivery performs only bounded result retrieval, rechecking dashboard access and retention after download. Content remains explicitly refused with 409 if its original Provider account/model binding is no longer current; historical read access never restores routing or credential authority. Existing key-scoped APIs and explicit refresh authorization remain unchanged. Chat stays in typed saved sessions; only Video execution inventory is supported.",
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
///         "description": "Saved projection; complete true means this supported Video inventory read completed, not all task kinds.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "properties": {
///                 "data": {
///                   "type": "object",
///                   "properties": {
///                     "id": {
///                       "type": "string",
///                       "format": "uuid"
///                     },
///                     "kind": {
///                       "const": "video"
///                     },
///                     "model": {
///                       "type": "string"
///                     },
///                     "model_display_name": {
///                       "type": [
///                         "string",
///                         "null"
///                       ]
///                     },
///                     "created_at": {
///                       "type": "string",
///                       "format": "date-time"
///                     },
///                     "updated_at": {
///                       "type": "string",
///                       "format": "date-time"
///                     },
///                     "state": {
///                       "enum": [
///                         "queued",
///                         "running",
///                         "succeeded",
///                         "failed",
///                         "unknown",
///                         "submission_unknown",
///                         "reconciliation_required"
///                       ]
///                     },
///                     "source": {
///                       "enum": [
///                         "api",
///                         "generations",
///                         "unknown"
///                       ]
///                     },
///                     "session_id": {
///                       "type": [
///                         "string",
///                         "null"
///                       ],
///                       "format": "uuid"
///                     },
///                     "turn_id": {
///                       "type": [
///                         "string",
///                         "null"
///                       ],
///                       "format": "uuid"
///                     },
///                     "artifacts": {
///                       "type": "array",
///                       "items": {
///                         "type": "object",
///                         "properties": {
///                           "kind": {
///                             "enum": [
///                               "video",
///                               "last_frame"
///                             ]
///                           },
///                           "availability": {
///                             "enum": [
///                               "available",
///                               "deleted",
///                               "expired",
///                               "unavailable"
///                             ]
///                           },
///                           "capture": {
///                             "oneOf": [
///                               {
///                                 "$ref": "#/components/schemas/GenerationArtifactCapture"
///                               },
///                               {
///                                 "type": "null"
///                               }
///                             ]
///                           }
///                         },
///                         "required": [
///                           "kind",
///                           "availability",
///                           "capture"
///                         ]
///                       }
///                     },
///                     "execution_context": {
///                       "type": "object",
///                       "additionalProperties": false,
///                       "required": [
///                         "submitted_model",
///                         "dispatched_model",
///                         "provider",
///                         "channel",
///                         "dispatched_at",
///                         "source",
///                         "parameters_source",
///                         "references_state",
///                         "parameters"
///                       ],
///                       "properties": {
///                         "submitted_model": {
///                           "type": "string"
///                         },
///                         "dispatched_model": {
///                           "type": [
///                             "string",
///                             "null"
///                           ]
///                         },
///                         "provider": {
///                           "type": [
///                             "string",
///                             "null"
///                           ],
///                           "description": "Adapter recorded at dispatch; not a Supplier account name."
///                         },
///                         "channel": {
///                           "type": [
///                             "string",
///                             "null"
///                           ]
///                         },
///                         "dispatched_at": {
///                           "type": "string",
///                           "format": "date-time"
///                         },
///                         "source": {
///                           "const": "saved_execution"
///                         },
///                         "parameters_source": {
///                           "enum": [
///                             "saved_validated_snapshot",
///                             "unknown"
///                           ]
///                         },
///                         "references_state": {
///                           "const": "not_in_execution_snapshot"
///                         },
///                         "parameters": {
///                           "type": [
///                             "object",
///                             "null"
///                           ],
///                           "additionalProperties": false,
///                           "properties": {
///                             "duration": {
///                               "type": "number"
///                             },
///                             "seed": {
///                               "type": "number"
///                             },
///                             "frames_per_second": {
///                               "type": "number"
///                             },
///                             "watermark": {
///                               "type": "boolean"
///                             },
///                             "camera_fixed": {
///                               "type": "boolean"
///                             },
///                             "return_last_frame": {
///                               "type": "boolean"
///                             },
///                             "resolution": {
///                               "type": "string"
///                             },
///                             "ratio": {
///                               "type": "string"
///                             },
///                             "omni_reference_task_type": {
///                               "type": "string"
///                             }
///                           }
///                         }
///                       }
///                     },
///                     "model_display_name_source": {
///                       "enum": [
///                         "current_catalog",
///                         "unknown"
///                       ]
///                     }
///                   },
///                   "required": [
///                     "id",
///                     "kind",
///                     "model",
///                     "model_display_name",
///                     "created_at",
///                     "updated_at",
///                     "state",
///                     "source",
///                     "session_id",
///                     "turn_id",
///                     "artifacts",
///                     "execution_context",
///                     "model_display_name_source"
///                   ]
///                 }
///               },
///               "required": [
///                 "data"
///               ]
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid query, unsupported kind or inaccessible cursor"
///       },
///       "401": {
///         "description": "Session invalid or expired"
///       },
///       "403": {
///         "description": "Current workspace permission denied"
///       },
///       "404": {
///         "description": "Record missing or actor-inaccessible"
///       },
///       "409": {
///         "description": "Original Provider delivery binding is no longer current; metadata history remains readable."
///       },
///       "503": {
///         "description": "Saved read unavailable; never presented as empty inventory"
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub(in crate::web) async fn task(
    State(state): State<AppState>,
    Path((org, workspace, id)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<([(String, String); 1], Json<Value>), ApiError> {
    let scope = TenantScope {
        organization_id: org,
        project_id: workspace,
    };
    let actor = owner(&state, &headers, scope).await?;
    let data = state
        .store
        .generation_task(scope, &actor, id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok((
        [("cache-control".into(), "private, no-store".into())],
        Json(serde_json::json!({"data":data})),
    ))
}
/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/projects/{project}/generations/artifacts/{task}/{kind}",
///   "method": "get",
///   "operation": {
///     "operationId": "generationsInventoryArtifact",
///     "summary": "Read an output availability record",
///     "description": "Current dashboard workspace Read authorizes saved history even when its inference key is revoked, expired, or its model grants changed. No active key secret is needed. Actor-private session/intent tasks belonging to another actor are excluded. API-created tasks without a private association are workspace-readable. No prompt, upstream URL, asset URI, credential or procurement field is returned. This GET never dispatches, refreshes, retries or settles inference. Task pages use immutable created_at/id DESC; artifacts use immutable output created_at/task_id/kind DESC. A cursor resolves in current authorized workspace independently of mutable state filters; malformed, missing or out-of-scope cursor is 400. Changing filters starts a new live view. No partial successful empty result: storage errors return 503. Artifact reference availability is retention evidence, not a guarantee the upstream bytes still exist. Content delivery performs only bounded result retrieval, rechecking dashboard access and retention after download. Content remains explicitly refused with 409 if its original Provider account/model binding is no longer current; historical read access never restores routing or credential authority. Existing key-scoped APIs and explicit refresh authorization remain unchanged. Chat stays in typed saved sessions; only Video execution inventory is supported.",
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
///         "description": "Saved projection; complete true means this supported Video inventory read completed, not all task kinds.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "properties": {
///                 "data": {
///                   "type": "object",
///                   "properties": {
///                     "task_id": {
///                       "type": "string",
///                       "format": "uuid"
///                     },
///                     "kind": {
///                       "enum": [
///                         "video",
///                         "last_frame"
///                       ]
///                     },
///                     "name": {
///                       "type": "string"
///                     },
///                     "created_at": {
///                       "type": "string",
///                       "format": "date-time"
///                     },
///                     "content_type": {
///                       "type": [
///                         "string",
///                         "null"
///                       ],
///                       "description": "Inspected captured-library content type when known; otherwise null."
///                     },
///                     "availability": {
///                       "enum": [
///                         "available",
///                         "deleted",
///                         "expired",
///                         "unavailable"
///                       ]
///                     },
///                     "session_id": {
///                       "type": [
///                         "string",
///                         "null"
///                       ],
///                       "format": "uuid"
///                     },
///                     "turn_id": {
///                       "type": [
///                         "string",
///                         "null"
///                       ],
///                       "format": "uuid"
///                     },
///                     "workspace_id": {
///                       "type": "string",
///                       "format": "uuid"
///                     },
///                     "capture": {
///                       "oneOf": [
///                         {
///                           "$ref": "#/components/schemas/GenerationArtifactCapture"
///                         },
///                         {
///                           "type": "null"
///                         }
///                       ]
///                     }
///                   },
///                   "required": [
///                     "task_id",
///                     "kind",
///                     "name",
///                     "created_at",
///                     "content_type",
///                     "availability",
///                     "session_id",
///                     "turn_id",
///                     "workspace_id",
///                     "capture"
///                   ]
///                 }
///               },
///               "required": [
///                 "data"
///               ]
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid query, unsupported kind or inaccessible cursor"
///       },
///       "401": {
///         "description": "Session invalid or expired"
///       },
///       "403": {
///         "description": "Current workspace permission denied"
///       },
///       "404": {
///         "description": "Record missing or actor-inaccessible"
///       },
///       "409": {
///         "description": "Original Provider delivery binding is no longer current; metadata history remains readable."
///       },
///       "503": {
///         "description": "Saved read unavailable; never presented as empty inventory"
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub(in crate::web) async fn artifact(
    State(state): State<AppState>,
    Path((org, workspace, id, kind)): Path<(Uuid, Uuid, Uuid, String)>,
    headers: HeaderMap,
) -> Result<([(String, String); 1], Json<Value>), ApiError> {
    let scope = TenantScope {
        organization_id: org,
        project_id: workspace,
    };
    let actor = owner(&state, &headers, scope).await?;
    let data = state
        .store
        .generation_artifact(scope, &actor, id, &kind)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok((
        [("cache-control".into(), "private, no-store".into())],
        Json(serde_json::json!({"data":data})),
    ))
}
/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/projects/{project}/generations/artifacts/{task}/{kind}/content",
///   "method": "get",
///   "operation": {
///     "operationId": "generationsInventoryContent",
///     "summary": "Download an authorized retained output",
///     "description": "Current dashboard workspace Read authorizes saved history even when its inference key is revoked, expired, or its model grants changed. No active key secret is needed. Actor-private session/intent tasks belonging to another actor are excluded. API-created tasks without a private association are workspace-readable. No prompt, upstream URL, asset URI, credential or procurement field is returned. This GET never dispatches, refreshes, retries or settles inference. Task pages use immutable created_at/id DESC; artifacts use immutable output created_at/task_id/kind DESC. A cursor resolves in current authorized workspace independently of mutable state filters; malformed, missing or out-of-scope cursor is 400. Changing filters starts a new live view. No partial successful empty result: storage errors return 503. Artifact reference availability is retention evidence, not a guarantee the upstream bytes still exist. Content delivery performs only bounded result retrieval, rechecking dashboard access and retention after download. Content remains explicitly refused with 409 if its original Provider account/model binding is no longer current; historical read access never restores routing or credential authority. Existing key-scoped APIs and explicit refresh authorization remain unchanged. Chat stays in typed saved sessions; only Video execution inventory is supported.",
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
///         "description": "Saved projection; complete true means this supported Video inventory read completed, not all task kinds.",
///         "content": {
///           "application/octet-stream": {
///             "schema": {
///               "type": "string",
///               "format": "binary"
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid query, unsupported kind or inaccessible cursor"
///       },
///       "401": {
///         "description": "Session invalid or expired"
///       },
///       "403": {
///         "description": "Current workspace permission denied"
///       },
///       "404": {
///         "description": "Record missing or actor-inaccessible"
///       },
///       "409": {
///         "description": "Original Provider delivery binding is no longer current; metadata history remains readable."
///       },
///       "503": {
///         "description": "Saved read unavailable; never presented as empty inventory"
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub(in crate::web) async fn content(
    State(state): State<AppState>,
    Path((org, workspace, id, kind)): Path<(Uuid, Uuid, Uuid, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let scope = TenantScope {
        organization_id: org,
        project_id: workspace,
    };
    let actor = owner(&state, &headers, scope).await?;
    state
        .store
        .generation_artifact(scope, &actor, id, &kind)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    let response = super::video_results::retrieve_history(&state, scope, &actor, id, &kind).await?;
    if owner(&state, &headers, scope).await? != actor {
        return Err(ApiError::forbidden());
    }
    Ok(response)
}
