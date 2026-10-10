use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    extract::{Query, State},
    http::HeaderMap,
};
use serde::Deserialize;
use serde_json::{Value, json};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PoolQuery {
    alias: String,
    before_revision: Option<i64>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PoolInput {
    alias: String,
    organization_id: Option<uuid::Uuid>,
    enabled: bool,
    expected_revision: i64,
    candidates: Vec<niu_storage::RoutePoolCandidate>,
}

/// ```openapi
/// {
///   "path": "/admin/v1/model-route-pools",
///   "method": "get",
///   "operation": {
///     "operationId": "getModelRoutePool",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "summary": "Read an installation-managed model candidate pool",
///     "parameters": [
///       {
///         "in": "query",
///         "name": "alias",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 200
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Current pool configuration",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "$ref": "#/components/schemas/ModelRoutePool"
///                 }
///               }
///             }
///           }
///         }
///       },
///       "403": {
///         "description": "Platform administration required"
///       },
///       "404": {
///         "description": "Pool not found"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "400": {
///         "description": "Invalid query or revision cursor; framework query errors may use plain text."
///       }
///     },
///     "x-niu-implementation": "implemented",
///     "description": "Platform administration required: installation credentials or an explicitly authorized platform administrator. Ordinary company/workspace ownership does not grant this access. "
///   },
///   "schemas": {
///     "ModelRoutePool": {
///       "type": "object",
///       "required": [
///         "alias",
///         "organization_id",
///         "enabled",
///         "revision",
///         "candidates"
///       ],
///       "properties": {
///         "alias": {
///           "type": "string"
///         },
///         "organization_id": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "format": "uuid"
///         },
///         "enabled": {
///           "type": "boolean"
///         },
///         "revision": {
///           "type": "integer",
///           "minimum": 1,
///           "maximum": 9007199254740991
///         },
///         "candidates": {
///           "type": "array",
///           "minItems": 1,
///           "maxItems": 64,
///           "items": {
///             "type": "object",
///             "required": [
///               "alias",
///               "priority",
///               "weight",
///               "enabled"
///             ],
///             "properties": {
///               "alias": {
///                 "type": "string"
///               },
///               "priority": {
///                 "type": "integer",
///                 "minimum": -1000,
///                 "maximum": 1000
///               },
///               "weight": {
///                 "type": "integer",
///                 "minimum": 1,
///                 "maximum": 10000
///               },
///               "enabled": {
///                 "type": "boolean"
///               }
///             }
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub async fn get(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<PoolQuery>,
) -> Result<Json<Value>, ApiError> {
    super::api::installation(&state, &headers).await?;
    let pool = state
        .store
        .model_route_pool(&query.alias)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(json!({"data":pool})))
}
/// ```openapi
/// {
///   "path": "/admin/v1/model-route-pools",
///   "method": "put",
///   "operation": {
///     "operationId": "setModelRoutePool",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "summary": "Create or revise a model candidate pool",
///     "description": "Platform administration required: installation credentials or an explicitly authorized platform administrator. Ordinary company/workspace ownership does not grant this access. Revisions start at zero for creation. Ownership is immutable. Candidate aliases identify existing credential/model mappings, not nested pools. Personal pools require all candidates owned by that organization; shared pools require nonpersonal priced mappings. Video mappings are rejected. Highest eligible priority wins, with weighted selection within that tier. No post-dispatch retries are performed.",
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "alias",
///               "organization_id",
///               "enabled",
///               "expected_revision",
///               "candidates"
///             ],
///             "properties": {
///               "alias": {
///                 "type": "string",
///                 "minLength": 1,
///                 "maxLength": 200,
///                 "pattern": "^[!-~]+$"
///               },
///               "organization_id": {
///                 "type": [
///                   "string",
///                   "null"
///                 ],
///                 "format": "uuid"
///               },
///               "enabled": {
///                 "type": "boolean"
///               },
///               "expected_revision": {
///                 "type": "integer",
///                 "minimum": 0,
///                 "maximum": 9007199254740990
///               },
///               "candidates": {
///                 "type": "array",
///                 "minItems": 1,
///                 "maxItems": 64,
///                 "items": {
///                   "type": "object",
///                   "additionalProperties": false,
///                   "required": [
///                     "alias",
///                     "priority",
///                     "weight",
///                     "enabled"
///                   ],
///                   "properties": {
///                     "alias": {
///                       "type": "string",
///                       "minLength": 1,
///                       "maxLength": 200
///                     },
///                     "priority": {
///                       "type": "integer",
///                       "minimum": -1000,
///                       "maximum": 1000
///                     },
///                     "weight": {
///                       "type": "integer",
///                       "minimum": 1,
///                       "maximum": 10000
///                     },
///                     "enabled": {
///                       "type": "boolean"
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       }
///     },
///     "responses": {
///       "200": {
///         "description": "Saved revision; changes apply to later admission and stale snapshots reject before dispatch",
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
///                       "type": "integer",
///                       "minimum": 1,
///                       "maximum": 9007199254740991
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid candidates, bounds, ownership, reserved alias or unsupported mapping"
///       },
///       "403": {
///         "description": "Platform administration required"
///       },
///       "409": {
///         "description": "Stale revision or attempted ownership change"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "422": {
///         "description": "Malformed body schema or unknown fields; framework rejection may use plain text."
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub async fn put(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<PoolInput>,
) -> Result<Json<Value>, ApiError> {
    super::api::installation(&state, &headers).await?;
    let revision = state
        .store
        .set_model_route_pool(&niu_storage::ModelRoutePool {
            alias: input.alias,
            organization_id: input.organization_id,
            enabled: input.enabled,
            revision: input.expected_revision,
            candidates: input.candidates,
        })
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"revision":revision}})))
}
/// ```openapi
/// {
///   "path": "/admin/v1/model-route-pools/history",
///   "method": "get",
///   "operation": {
///     "operationId": "listModelRoutePoolHistory",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "in": "query",
///         "name": "alias",
///         "required": true,
///         "schema": {
///           "type": "string"
///         }
///       },
///       {
///         "in": "query",
///         "name": "before_revision",
///         "schema": {
///           "type": "integer",
///           "minimum": 1
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "At most 100 immutable revisions in descending order",
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
///                   "maxItems": 100,
///                   "items": {
///                     "allOf": [
///                       {
///                         "$ref": "#/components/schemas/ModelRoutePool"
///                       },
///                       {
///                         "type": "object",
///                         "required": [
///                           "recorded_at"
///                         ],
///                         "properties": {
///                           "recorded_at": {
///                             "type": "string",
///                             "format": "date-time"
///                           }
///                         }
///                       }
///                     ]
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "403": {
///         "description": "Platform administration required"
///       },
///       "404": {
///         "description": "Pool not found"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "400": {
///         "description": "Invalid query or revision cursor; framework query errors may use plain text."
///       }
///     },
///     "x-niu-implementation": "implemented",
///     "summary": "Read immutable model candidate pool revisions",
///     "description": "Platform administration required: installation credentials or an explicitly authorized platform administrator. Ordinary company/workspace ownership does not grant this access. "
///   }
/// }
/// ```
pub async fn history(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<PoolQuery>,
) -> Result<Json<Value>, ApiError> {
    super::api::installation(&state, &headers).await?;
    if state
        .store
        .model_route_pool(&query.alias)
        .await
        .map_err(ApiError::from_store)?
        .is_none()
    {
        return Err(ApiError::not_found());
    }
    Ok(Json(
        json!({"data":state.store.model_route_pool_history(&query.alias,query.before_revision).await.map_err(ApiError::from_store)?}),
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct IndexQuery {
    after: Option<String>,
    limit: Option<i64>,
}

/// ```openapi
/// {
///   "path": "/admin/v1/model-route-pools/index",
///   "method": "get",
///   "operation": {
///     "operationId": "listModelRoutePools",
///     "summary": "List platform-managed model route pools",
///     "description": "Installation credential or explicit platform-administrator grant required. Lists enabled and disabled shared and personal pools with their current configuration. Ordered by alias using database ordering. after is the exclusive alias cursor returned as next_after; it need not identify a currently existing pool. This is a live view, not a cross-page snapshot: new aliases before the cursor require a fresh traversal. No upstream requests, credentials, endpoints or prices are returned. Pool organization identifiers are API references, not display labels.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "x-niu-implementation": "implemented",
///     "parameters": [
///       {
///         "name": "after",
///         "in": "query",
///         "schema": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 200,
///           "pattern": "^[!-~]+$"
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
///         "description": "Bounded current configurations and continuation cursor.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data",
///                 "has_more",
///                 "next_after"
///               ],
///               "additionalProperties": false,
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "maxItems": 100,
///                   "items": {
///                     "$ref": "#/components/schemas/ModelRoutePool"
///                   }
///                 },
///                 "has_more": {
///                   "type": "boolean"
///                 },
///                 "next_after": {
///                   "type": [
///                     "string",
///                     "null"
///                   ]
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid query, alias cursor or page size; framework query errors may use plain text."
///       },
///       "401": {
///         "description": "Authentication required."
///       },
///       "403": {
///         "description": "Platform administration required."
///       }
///     }
///   }
/// }
/// ```
pub async fn index(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<IndexQuery>,
) -> Result<Json<Value>, ApiError> {
    state.authorize_platform_headers(&headers).await?;
    let limit = query.limit.unwrap_or(50);
    if !(1..=100).contains(&limit)
        || query.after.as_ref().is_some_and(|alias| {
            alias.is_empty()
                || alias.len() > 200
                || !alias.bytes().all(|byte| byte.is_ascii_graphic())
        })
    {
        return Err(ApiError::invalid_request(
            "Use an ASCII alias cursor and a page size from 1 to 100",
        ));
    }
    let mut data = state
        .store
        .model_route_pool_page(query.after.as_deref(), limit)
        .await
        .map_err(ApiError::from_store)?;
    let has_more = data.len() > limit as usize;
    data.truncate(limit as usize);
    let next_after = if has_more {
        data.last().map(|pool| pool.alias.clone())
    } else {
        None
    };
    Ok(Json(
        json!({"data": data, "has_more": has_more, "next_after": next_after}),
    ))
}
