use super::{
    AdminPermission, ApiError, AppState, HeaderMap, Json, Path, Query, State, TenantScope, Uuid,
    Value, authorize_project, json,
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PolicyInput {
    #[serde(deserialize_with = "required_nullable_limit")]
    tokens_per_minute: Option<i64>,
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
///   "path": "/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/token-rate-limit",
///   "method": "get",
///   "operation": {
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "operationId": "getKeyTokenRateLimit",
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
///                   "$ref": "#/components/schemas/KeyTokenRatePolicy"
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
///         "description": "Workspace access denied"
///       },
///       "404": {
///         "description": "Workspace is outside operator scope",
///         "or key is absent from authorized workspace": null
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
///     "summary": "Read API key token rate policy",
///     "x-niu-implementation": "implemented"
///   },
///   "schemas": {
///     "KeyTokenRateTokenRateLimit": {
///       "type": [
///         "integer",
///         "null"
///       ],
///       "minimum": 0,
///       "maximum": 1000000000000,
///       "description": "Token budget includes unresolved reservations plus provider-reported usage completed in the last 60 seconds. Null is unlimited; zero denies dispatch."
///     },
///     "KeyTokenRatePolicy": {
///       "type": "object",
///       "required": [
///         "tokens_per_minute",
///         "revision",
///         "snapshot_at",
///         "known_tokens",
///         "reserved_tokens",
///         "unbounded_requests",
///         "committed_tokens"
///       ],
///       "properties": {
///         "tokens_per_minute": {
///           "$ref": "#/components/schemas/KeyTokenRateTokenRateLimit"
///         },
///         "revision": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "pattern": "^[1-9][0-9]*$"
///         },
///         "snapshot_at": {
///           "type": "string",
///           "format": "date-time"
///         },
///         "known_tokens": {
///           "type": "string",
///           "pattern": "^[0-9]+$",
///           "description": "Known provider usage completed within 60 seconds."
///         },
///         "reserved_tokens": {
///           "type": "string",
///           "pattern": "^[0-9]+$",
///           "description": "Estimates retained for unresolved usage",
///           "without time-based expiry.": null
///         },
///         "unbounded_requests": {
///           "type": "integer",
///           "minimum": 0,
///           "description": "Unknown dispatched requests without a saved bound."
///         },
///         "committed_tokens": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "pattern": "^[0-9]+$",
///           "description": "Known plus reserved tokens",
///           "or null when unbounded requests prevent a complete total.": null
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
        json!({"data":state.store.key_token_rate_policy(scope,key).await.map_err(ApiError::from_store)?.ok_or_else(ApiError::not_found)?}),
    ))
}
/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/token-rate-limit",
///   "method": "put",
///   "operation": {
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "operationId": "setKeyTokenRateLimit",
///     "description": "Owner or installation administrator only. Rotation preserves this policy. Does not cancel already admitted requests.",
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "tokens_per_minute",
///               "expected_revision"
///             ],
///             "properties": {
///               "tokens_per_minute": {
///                 "$ref": "#/components/schemas/KeyTokenRateTokenRateLimit"
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
///         "description": "Workspace is outside operator scope",
///         "or key is absent from authorized workspace": null
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
///     "summary": "Set API key token rate policy",
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
    if !state
        .store
        .key_spending_scope_exists(scope, key)
        .await
        .map_err(ApiError::from_store)?
    {
        return Err(ApiError::not_found());
    }
    if input.expected_revision.is_empty()
        || !input.expected_revision.bytes().all(|b| b.is_ascii_digit())
    {
        return Err(ApiError::invalid_request(
            "Use a nonnegative revision string",
        ));
    }
    let expected = input
        .expected_revision
        .parse()
        .map_err(|_| ApiError::invalid_request("Revision exceeds the supported range"))?;
    let revision = state
        .store
        .set_key_token_rate_policy(
            scope,
            key,
            input.tokens_per_minute,
            expected,
            super::audit_actor(auth),
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"revision":revision.to_string()}})))
}
/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/token-rate-limit/history",
///   "method": "get",
///   "operation": {
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "operationId": "listKeyTokenRateLimitHistory",
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
///                       "tokens_per_minute",
///                       "revision",
///                       "recorded_at",
///                       "actor_kind",
///                       "actor_name"
///                     ],
///                     "properties": {
///                       "tokens_per_minute": {
///                         "$ref": "#/components/schemas/KeyTokenRateTokenRateLimit"
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
///         "description": "Workspace access denied"
///       },
///       "404": {
///         "description": "Workspace is outside operator scope",
///         "or key is absent from authorized workspace": null
///       }
///     },
///     "summary": "List API key token rate policy history",
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
    if !state
        .store
        .key_spending_scope_exists(scope, key)
        .await
        .map_err(ApiError::from_store)?
    {
        return Err(ApiError::not_found());
    }
    let Query(query) =
        query.map_err(|_| ApiError::invalid_request("Invalid token-rate history query"))?;
    let limit = query.limit.unwrap_or(50);
    if !(1..=100).contains(&limit) || query.before_revision.is_some_and(|v| v <= 0) {
        return Err(ApiError::invalid_request(
            "Invalid history cursor or page size",
        ));
    }
    Ok(Json(
        json!({"data":state.store.key_token_rate_history(scope,key,query.before_revision,limit).await.map_err(ApiError::from_store)?}),
    ))
}
