use super::{
    AdminPermission, ApiError, AppState, HeaderMap, Json, Query, State, TenantScope, Uuid, Value,
    authorize_project, json,
};
use crate::web::workspace_path::WorkspacePath as Path;
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PolicyInput {
    #[serde(deserialize_with = "required_nullable_limit")]
    max_concurrent_requests: Option<i64>,
    expected_revision: String,
}
fn required_nullable_limit<'de, D: serde::Deserializer<'de>>(
    d: D,
) -> Result<Option<i64>, D::Error> {
    Option::<i64>::deserialize(d)
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct History {
    before_revision: Option<i64>,
    limit: Option<i64>,
}
/// ```openapi
/// {
///   "path": "/api/v1/organizations/{organization}/projects/{project}/keys/{key}/concurrency-limit",
///   "method": "get",
///   "operation": {
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "operationId": "getKeyConcurrencyLimit",
///     "description": "Scoped readers may inspect the policy shared across secret rotations.",
///     "responses": {
///       "200": {
///         "description": "Null revision means never configured. Null removes the limit; zero denies dispatch.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "$ref": "#/components/schemas/KeyConcurrencyPolicy"
///                 }
///               }
///             }
///           }
///         }
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Insufficient management permission"
///       },
///       "404": {
///         "description": "Workspace is outside operator scope, or key is absent from authorized workspace"
///       }
///     },
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
///       }
///     ],
///     "summary": "Read API key concurrency policy",
///     "x-niu-implementation": "implemented"
///   },
///   "schemas": {
///     "KeyConcurrencyConcurrencyLimit": {
///       "type": [
///         "integer",
///         "null"
///       ],
///       "minimum": 0,
///       "maximum": 10000,
///       "description": "Maximum unresolved dispatched requests; null is unlimited and zero denies dispatch."
///     },
///     "KeyConcurrencyPolicy": {
///       "type": "object",
///       "required": [
///         "max_concurrent_requests",
///         "revision",
///         "active_requests"
///       ],
///       "properties": {
///         "max_concurrent_requests": {
///           "$ref": "#/components/schemas/KeyConcurrencyConcurrencyLimit"
///         },
///         "revision": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "pattern": "^[1-9][0-9]*$"
///         },
///         "active_requests": {
///           "type": "integer",
///           "minimum": 0,
///           "description": "Current unresolved dispatch count shared across rotations; includes work admitted before configuration."
///         }
///       }
///     }
///   }
/// }
/// ```
pub async fn read(
    State(state): State<AppState>,
    Path((organization, workspace, key)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    authorize_project(
        &state,
        &headers,
        AdminPermission::Read,
        organization,
        workspace,
    )
    .await?;
    let scope = TenantScope {
        organization_id: organization,
        project_id: workspace,
    };
    Ok(Json(
        json!({"data":state.store.key_concurrency_policy(scope,key).await.map_err(ApiError::from_store)?.ok_or_else(ApiError::not_found)?}),
    ))
}
/// ```openapi
/// {
///   "path": "/api/v1/organizations/{organization}/projects/{project}/keys/{key}/concurrency-limit",
///   "method": "put",
///   "operation": {
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "operationId": "setKeyConcurrencyLimit",
///     "description": "Owner or installation administrator only. Rotation preserves this policy. Does not cancel already admitted requests.",
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "max_concurrent_requests",
///               "expected_revision"
///             ],
///             "properties": {
///               "max_concurrent_requests": {
///                 "$ref": "#/components/schemas/KeyConcurrencyConcurrencyLimit"
///               },
///               "expected_revision": {
///                 "type": "string",
///                 "pattern": "^[0-9]+$",
///                 "description": "Zero for initial configuration; maximum 9223372036854775806."
///               }
///             }
///           }
///         }
///       }
///     },
///     "responses": {
///       "200": {
///         "description": "New policy and immutable history committed atomically. Existing unresolved work remains counted across revisions.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "object",
///                   "required": [
///                     "revision"
///                   ],
///                   "properties": {
///                     "revision": {
///                       "type": "string",
///                       "pattern": "^[1-9][0-9]*$"
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid limit or revision"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Owner permission required"
///       },
///       "404": {
///         "description": "Workspace is outside operator scope, or key is absent from authorized workspace"
///       },
///       "409": {
///         "description": "Stale policy revision"
///       },
///       "422": {
///         "description": "Missing or invalid JSON fields"
///       }
///     },
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
///       }
///     ],
///     "summary": "Set API key concurrency policy",
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub async fn write(
    State(state): State<AppState>,
    Path((organization, workspace, key)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
    Json(input): Json<PolicyInput>,
) -> Result<Json<Value>, ApiError> {
    let auth = authorize_project(
        &state,
        &headers,
        AdminPermission::Write,
        organization,
        workspace,
    )
    .await?;
    if matches!(auth,crate::state::AdminAuthorization::Operator(ref op) if op.role!=niu_storage::OperatorRole::Owner)
    {
        return Err(ApiError::forbidden());
    }
    let scope = TenantScope {
        organization_id: organization,
        project_id: workspace,
    };
    let ensure_key_exists = || async {
        if !state
            .store
            .key_spending_scope_exists(scope, key)
            .await
            .map_err(ApiError::from_store)?
        {
            Err(ApiError::not_found())
        } else {
            Ok(())
        }
    };
    if input.expected_revision.is_empty()
        || !input.expected_revision.bytes().all(|b| b.is_ascii_digit())
    {
        ensure_key_exists().await?;
        return Err(ApiError::invalid_request(
            "Use a nonnegative revision string",
        ));
    }
    let expected = match input.expected_revision.parse() {
        Ok(expected) => expected,
        Err(_) => {
            ensure_key_exists().await?;
            return Err(ApiError::invalid_request(
                "Revision exceeds the supported range",
            ));
        }
    };
    let revision = match state
        .store
        .set_key_concurrency_policy(
            scope,
            key,
            input.max_concurrent_requests,
            expected,
            super::audit_actor(auth),
        )
        .await
    {
        Ok(revision) => revision,
        Err(err) => {
            ensure_key_exists().await?;
            return Err(ApiError::from_store(err));
        }
    };
    Ok(Json(json!({"data":{"revision":revision.to_string()}})))
}
/// ```openapi
/// {
///   "path": "/api/v1/organizations/{organization}/projects/{project}/keys/{key}/concurrency-limit/history",
///   "method": "get",
///   "operation": {
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "operationId": "listKeyConcurrencyLimitHistory",
///     "description": "Scoped readers receive descending revisions shared across rotations. Use the last revision as the next page cursor.",
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
///         "name": "before_revision",
///         "in": "query",
///         "schema": {
///           "type": "integer",
///           "minimum": 1
///         }
///       },
///       {
///         "name": "limit",
///         "in": "query",
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
///         "description": "Immutable policy history; no internal actor identifiers.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "type": "object",
///                     "required": [
///                       "max_concurrent_requests",
///                       "revision",
///                       "recorded_at",
///                       "actor_kind",
///                       "actor_name"
///                     ],
///                     "properties": {
///                       "max_concurrent_requests": {
///                         "$ref": "#/components/schemas/KeyConcurrencyConcurrencyLimit"
///                       },
///                       "revision": {
///                         "type": "string",
///                         "pattern": "^[1-9][0-9]*$"
///                       },
///                       "recorded_at": {
///                         "type": "string",
///                         "format": "date-time"
///                       },
///                       "actor_kind": {
///                         "type": "string",
///                         "enum": [
///                           "installation",
///                           "member"
///                         ]
///                       },
///                       "actor_name": {
///                         "type": "string"
///                       }
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid pagination"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Insufficient management permission"
///       },
///       "404": {
///         "description": "Workspace is outside operator scope, or key is absent from authorized workspace"
///       }
///     },
///     "summary": "List API key concurrency policy history",
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub async fn history(
    State(state): State<AppState>,
    Path((organization, workspace, key)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
    query: Result<Query<History>, axum::extract::rejection::QueryRejection>,
) -> Result<Json<Value>, ApiError> {
    authorize_project(
        &state,
        &headers,
        AdminPermission::Read,
        organization,
        workspace,
    )
    .await?;
    let scope = TenantScope {
        organization_id: organization,
        project_id: workspace,
    };
    let ensure_key_exists = || async {
        if !state
            .store
            .key_spending_scope_exists(scope, key)
            .await
            .map_err(ApiError::from_store)?
        {
            Err(ApiError::not_found())
        } else {
            Ok(())
        }
    };
    let Query(query) = match query {
        Ok(q) => q,
        Err(_) => {
            ensure_key_exists().await?;
            return Err(ApiError::invalid_request(
                "Invalid concurrency history query",
            ));
        }
    };
    let limit = query.limit.unwrap_or(50);
    if !(1..=100).contains(&limit) || query.before_revision.is_some_and(|v| v <= 0) {
        ensure_key_exists().await?;
        return Err(ApiError::invalid_request(
            "Invalid history cursor or page size",
        ));
    }
    let data = state
        .store
        .key_concurrency_history(scope, key, query.before_revision, limit)
        .await
        .map_err(ApiError::from_store)?;
    if data.is_empty() {
        ensure_key_exists().await?;
    }
    Ok(Json(json!({"data":data})))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CapacityPage {
    kind: Option<String>,
    after: Option<Uuid>,
    limit: Option<i64>,
}
/// ```openapi
/// {
///   "path": "/api/v1/organizations/{organization}/projects/{project}/keys/{key}/capacity",
///   "method": "get",
///   "operation": {
///     "operationId": "listKeyCapacityRequests",
///     "summary": "Inspect requests contributing unresolved key capacity",
///     "description": "Workspace read authority required. Includes the full secret-rotation lineage. Concurrency uses unresolved dispatched requests. Tokens uses reservations and unbounded usage from unresolved dispatches plus completed unknown-usage requests in the rolling 60-second window, matching the token-budget calculation; known recent usage is not returned here. Each page has a fresh statement snapshot. UUID keyset cursor is internal; rows may resolve between pages. Refresh to restart investigation. This read does not contact Providers, reconcile usage, release reservations or retry requests. No credentials, prompt content or procurement data. Cache-Control no-store.",
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
///         "name": "kind",
///         "in": "query",
///         "schema": {
///           "type": "string",
///           "enum": [
///             "concurrency",
///             "tokens"
///           ],
///           "default": "concurrency"
///         }
///       },
///       {
///         "name": "after",
///         "in": "query",
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "limit",
///         "in": "query",
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
///         "description": "Matching current contributors and snapshot count",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "required": [
///                 "data",
///                 "total",
///                 "snapshot_at",
///                 "next_after"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "type": "object",
///                     "additionalProperties": false,
///                     "required": [
///                       "attempt_id",
///                       "model_alias",
///                       "key_name",
///                       "created_at",
///                       "dispatched_at",
///                       "completed_at",
///                       "execution",
///                       "reserved_tokens"
///                     ],
///                     "properties": {
///                       "attempt_id": {
///                         "type": "string",
///                         "format": "uuid"
///                       },
///                       "model_alias": {
///                         "type": "string"
///                       },
///                       "key_name": {
///                         "type": "string"
///                       },
///                       "created_at": {
///                         "type": "string",
///                         "format": "date-time"
///                       },
///                       "dispatched_at": {
///                         "type": "string",
///                         "format": "date-time"
///                       },
///                       "completed_at": {
///                         "type": [
///                           "string",
///                           "null"
///                         ],
///                         "format": "date-time"
///                       },
///                       "execution": {
///                         "type": "string",
///                         "enum": [
///                           "may_have_executed",
///                           "confirmed_completed"
///                         ]
///                       },
///                       "reserved_tokens": {
///                         "type": [
///                           "string",
///                           "null"
///                         ],
///                         "pattern": "^[0-9]+$"
///                       }
///                     }
///                   }
///                 },
///                 "total": {
///                   "type": "integer",
///                   "minimum": 0
///                 },
///                 "snapshot_at": {
///                   "type": "string",
///                   "format": "date-time"
///                 },
///                 "next_after": {
///                   "type": [
///                     "string",
///                     "null"
///                   ],
///                   "format": "uuid"
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid query"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Insufficient management permission"
///       },
///       "404": {
///         "description": "Key or workspace outside the authorized scope"
///       },
///       "409": {
///         "description": "Cursor unavailable; restart pagination"
///       }
///     }
///   }
/// }
/// ```
pub async fn capacity(
    State(state): State<AppState>,
    Path((organization, workspace, key)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
    Query(query): Query<CapacityPage>,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    authorize_project(
        &state,
        &headers,
        AdminPermission::Read,
        organization,
        workspace,
    )
    .await?;
    let kind = query.kind.as_deref().unwrap_or("concurrency");
    let limit = query.limit.unwrap_or(50);
    if !matches!(kind, "concurrency" | "tokens") || !(1..=100).contains(&limit) {
        return Err(ApiError::invalid_request(
            "Use concurrency or tokens and a page size from 1 to 100.",
        ));
    }
    let scope = TenantScope {
        organization_id: organization,
        project_id: workspace,
    };
    let result = state
        .store
        .key_capacity_requests(scope, key, kind, query.after, limit)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(([("cache-control", "no-store")], Json(result)))
}
