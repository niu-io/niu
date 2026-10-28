use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    extract::{Path, Query, State},
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
    #[serde(default)]
    project_id: Option<uuid::Uuid>,
    #[serde(default)]
    display_name: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    slug: Option<String>,
    #[serde(default)]
    public_catalog: bool,
    #[serde(default)]
    billing_mode: niu_storage::RoutePoolBillingMode,
    enabled: bool,
    expected_revision: i64,
    candidates: Vec<niu_storage::RoutePoolCandidate>,
    #[serde(default)]
    rules: Vec<niu_storage::RoutePoolRule>,
    #[serde(default)]
    default_action: niu_storage::RoutePoolDefaultAction,
}

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
///   "path": "/api/v1/pools",
///   "method": "put",
///   "operation": {
///     "operationId": "setModelRoutePool",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "summary": "Create or revise a model candidate pool",
///     "description": "Platform administration required: installation credentials or an explicitly authorized platform administrator. Ordinary company/workspace ownership does not grant this access. Revisions start at zero for creation. Ownership is immutable. Candidate aliases identify existing credential/model mappings, not nested pools. Personal pools require all candidates owned by that organization; shared pools require nonpersonal priced mappings. Video mappings are rejected. Ordered routing rules evaluate first-match AND conditions before falling back to default_action. Highest eligible priority wins, with weighted selection within that tier. Billing mode selects either unified pool pricing (pool_tariff) or pass-through candidate pricing (candidate_tariff). Chat pools permit at most one successor after a qualified OpenRouter authentication rejection; other failures and uncertain or streamed outcomes do not trigger automatic failover. See the Chat completion contract for exact eligibility and deadline constraints.",
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
///               "project_id": {
///                 "type": [
///                   "string",
///                   "null"
///                 ],
///                 "format": "uuid"
///               },
///               "display_name": {
///                 "type": [
///                   "string",
///                   "null"
///                 ],
///                 "maxLength": 200
///               },
///               "description": {
///                 "type": [
///                   "string",
///                   "null"
///                 ],
///                 "maxLength": 4000
///               },
///               "slug": {
///                 "type": [
///                   "string",
///                   "null"
///                 ],
///                 "maxLength": 80
///               },
///               "public_catalog": {
///                 "type": "boolean"
///               },
///               "billing_mode": {
///                 "type": "string",
///                 "enum": [
///                   "pool_tariff",
///                   "candidate_tariff"
///                 ]
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
///               },
///               "rules": {
///                 "type": "array",
///                 "maxItems": 32,
///                 "items": {
///                   "type": "object"
///                 }
///               },
///               "default_action": {
///                 "type": "string",
///                 "enum": [
///                   "candidates",
///                   "reject"
///                 ]
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
            project_id: input.project_id,
            display_name: input.display_name,
            description: input.description,
            slug: input.slug,
            public_catalog: input.public_catalog,
            billing_mode: input.billing_mode,
            enabled: input.enabled,
            revision: input.expected_revision,
            candidates: input.candidates,
            rules: input.rules,
            default_action: input.default_action,
        })
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"revision":revision}})))
}
/// ```openapi
/// {
///   "path": "/api/v1/pools/history",
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
///     "description": "Platform administration required: installation credentials or an explicitly authorized platform administrator. Ordinary company/workspace ownership does not grant this access."
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
///   "path": "/api/v1/pools/index",
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

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CollectionQuery {
    alias: Option<String>,
    after: Option<String>,
    limit: Option<i64>,
    // The legacy member parser accepted this field (GET ignored it).
    before_revision: Option<i64>,
}

/// ```openapi
/// {
///   "path": "/api/v1/pools",
///   "method": "get",
///   "operation": {
///     "operationId": "listPools",
///     "summary": "List platform-managed model route pools",
///     "description": "Installation credential or explicit platform-administrator grant required. Lists enabled and disabled shared and personal pools with their current configuration. Ordered by alias using database ordering. after is the exclusive alias cursor returned as next_after; it need not identify a currently existing pool. This is a live view, not a cross-page snapshot: new aliases before the cursor require a fresh traversal. No upstream requests, credentials, endpoints or prices are returned. Pool organization identifiers are API references, not display labels. Without alias this is the paginated collection. For compatibility, ?alias= returns the original single-pool envelope; alias cannot be combined with paging parameters. New member reads use /pools/{reference}. The /pools/index route retains its existing collection contract.",
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
///       },
///       {
///         "in": "query",
///         "name": "alias",
///         "required": false,
///         "schema": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 200
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Bounded current configurations and continuation cursor.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "oneOf": [
///                 {
///                   "type": "object",
///                   "required": [
///                     "data",
///                     "has_more",
///                     "next_after"
///                   ],
///                   "additionalProperties": false,
///                   "properties": {
///                     "data": {
///                       "type": "array",
///                       "maxItems": 100,
///                       "items": {
///                         "$ref": "#/components/schemas/ModelRoutePool"
///                       }
///                     },
///                     "has_more": {
///                       "type": "boolean"
///                     },
///                     "next_after": {
///                       "type": [
///                         "string",
///                         "null"
///                       ]
///                     }
///                   }
///                 },
///                 {
///                   "type": "object",
///                   "required": [
///                     "data"
///                   ],
///                   "properties": {
///                     "data": {
///                       "$ref": "#/components/schemas/ModelRoutePool"
///                     }
///                   }
///                 }
///               ]
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
///         "project_id": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "format": "uuid"
///         },
///         "display_name": {
///           "type": [
///             "string",
///             "null"
///           ]
///         },
///         "description": {
///           "type": [
///             "string",
///             "null"
///           ]
///         },
///         "slug": {
///           "type": [
///             "string",
///             "null"
///           ]
///         },
///         "public_catalog": {
///           "type": "boolean"
///         },
///         "billing_mode": {
///           "type": "string",
///           "enum": [
///             "pool_tariff",
///             "candidate_tariff"
///           ]
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
///         },
///         "rules": {
///           "type": "array",
///           "maxItems": 32,
///           "items": {
///             "type": "object"
///           }
///         },
///         "default_action": {
///           "type": "string",
///           "enum": [
///             "candidates",
///             "reject"
///           ]
///         }
///       }
///     }
///   }
/// }
/// ```
pub async fn collection(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<CollectionQuery>,
) -> Result<Json<Value>, ApiError> {
    if let Some(alias) = query.alias {
        if query.after.is_some() || query.limit.is_some() {
            return Err(ApiError::invalid_request(
                "alias cannot be combined with collection pagination",
            ));
        }
        get(
            State(state),
            headers,
            Query(PoolQuery {
                alias,
                before_revision: query.before_revision,
            }),
        )
        .await
    } else {
        if query.before_revision.is_some() {
            return Err(ApiError::invalid_request(
                "before_revision is only accepted on a pool member lookup",
            ));
        }
        index(
            State(state),
            headers,
            Query(IndexQuery {
                after: query.after,
                limit: query.limit,
            }),
        )
        .await
    }
}

fn decode_reference(reference: &str) -> Result<String, ApiError> {
    use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
    let invalid =
        || ApiError::invalid_request("Use the canonical unpadded base64url pool alias reference");
    if reference.len() > 267 {
        return Err(invalid());
    }
    let bytes = URL_SAFE_NO_PAD.decode(reference).map_err(|_| invalid())?;
    if bytes.is_empty()
        || bytes.len() > 200
        || !bytes.iter().all(u8::is_ascii_graphic)
        || URL_SAFE_NO_PAD.encode(&bytes) != reference
    {
        return Err(invalid());
    }
    String::from_utf8(bytes).map_err(|_| invalid())
}
/// ```openapi
/// {
///   "path": "/api/v1/pools/{reference}",
///   "method": "get",
///   "operation": {
///     "operationId": "getPool",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "summary": "Read an installation-managed model candidate pool",
///     "parameters": [
///       {
///         "in": "path",
///         "name": "reference",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "minLength": 2,
///           "maxLength": 267,
///           "pattern": "^[A-Za-z0-9_-]+$"
///         },
///         "description": "Unpadded base64url encoding of the exact ASCII pool alias. This avoids encoded slashes and double decoding by proxies. The decoded alias must be 1\u2013200 visible ASCII bytes."
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
///     "description": "Platform administration required: installation credentials or an explicitly authorized platform administrator. Ordinary company/workspace ownership does not grant this access. Reference is the canonical unpadded base64url encoding of the exact alias, not a percent-encoded alias; noncanonical or invalid references return 400."
///   }
/// }
/// ```
pub async fn member(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(reference): Path<String>,
) -> Result<Json<Value>, ApiError> {
    get(
        State(state),
        headers,
        Query(PoolQuery {
            alias: decode_reference(&reference)?,
            before_revision: None,
        }),
    )
    .await
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HistoryQuery {
    before_revision: Option<i64>,
}
/// ```openapi
/// {
///   "path": "/api/v1/pools/{reference}/history",
///   "method": "get",
///   "operation": {
///     "operationId": "listPoolHistory",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "in": "path",
///         "name": "reference",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "minLength": 2,
///           "maxLength": 267,
///           "pattern": "^[A-Za-z0-9_-]+$"
///         },
///         "description": "Unpadded base64url encoding of the exact ASCII pool alias. This avoids encoded slashes and double decoding by proxies. The decoded alias must be 1\u2013200 visible ASCII bytes."
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
///     "description": "Platform administration required: installation credentials or an explicitly authorized platform administrator. Ordinary company/workspace ownership does not grant this access. Reference is the canonical unpadded base64url encoding of the exact alias, not a percent-encoded alias; noncanonical or invalid references return 400."
///   }
/// }
/// ```
pub async fn member_history(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(reference): Path<String>,
    Query(query): Query<HistoryQuery>,
) -> Result<Json<Value>, ApiError> {
    history(
        State(state),
        headers,
        Query(PoolQuery {
            alias: decode_reference(&reference)?,
            before_revision: query.before_revision,
        }),
    )
    .await
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PreviewRequest {
    #[serde(default)]
    protocol: Option<String>,
    #[serde(default)]
    streaming: bool,
    #[serde(default, alias = "has_vision")]
    vision: bool,
    #[serde(default)]
    tools: bool,
    #[serde(default)]
    structured_output: bool,
    #[serde(default)]
    reasoning: bool,
    #[serde(default, alias = "estimated_input_tokens", alias = "prompt_tokens")]
    input_tokens: Option<u64>,
    #[serde(default, alias = "requested_output_tokens")]
    output_tokens: Option<u64>,
    #[serde(default)]
    candidates: Option<Vec<niu_storage::RoutePoolCandidate>>,
    #[serde(default)]
    rules: Option<Vec<niu_storage::RoutePoolRule>>,
    #[serde(default)]
    default_action: Option<niu_storage::RoutePoolDefaultAction>,
}

/// ```openapi
/// {
///   "path": "/api/v1/pools/{reference}/preview",
///   "method": "post",
///   "operation": {
///     "operationId": "previewPool",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "summary": "Dry-run routing preview for a model route pool",
///     "description": "Evaluates a pool's ordered routing rules, candidate eligibility, priority tiers, and normalized traffic weights for a simulated request without dispatching upstream traffic.",
///     "parameters": [
///       {
///         "in": "path",
///         "name": "reference",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "minLength": 2,
///           "maxLength": 267,
///           "pattern": "^[A-Za-z0-9_-]+$"
///         },
///         "description": "Unpadded base64url encoding of the exact ASCII pool alias."
///       }
///     ],
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "properties": {
///               "protocol": {
///                 "type": "string",
///                 "enum": [
///                   "chat",
///                   "responses",
///                   "messages"
///                 ]
///               },
///               "streaming": {
///                 "type": "boolean"
///               },
///               "vision": {
///                 "type": "boolean"
///               },
///               "tools": {
///                 "type": "boolean"
///               },
///               "structured_output": {
///                 "type": "boolean"
///               },
///               "reasoning": {
///                 "type": "boolean"
///               },
///               "input_tokens": {
///                 "type": [
///                   "integer",
///                   "null"
///                 ],
///                 "minimum": 1
///               },
///               "output_tokens": {
///                 "type": [
///                   "integer",
///                   "null"
///                 ],
///                 "minimum": 1
///               },
///               "candidates": {
///                 "type": "array",
///                 "items": {
///                   "type": "object"
///                 }
///               },
///               "rules": {
///                 "type": "array",
///                 "items": {
///                   "type": "object"
///                 }
///               },
///               "default_action": {
///                 "type": "string",
///                 "enum": [
///                   "candidates",
///                   "reject"
///                 ]
///               }
///             }
///           }
///         }
///       }
///     },
///     "responses": {
///       "200": {
///         "description": "Dry-run routing preview result",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "object"
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid reference or preview parameters"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Platform administration required"
///       },
///       "404": {
///         "description": "Pool not found"
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub async fn member_preview(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(reference): Path<String>,
    Json(req): Json<PreviewRequest>,
) -> Result<Json<Value>, ApiError> {
    super::api::installation(&state, &headers).await?;
    let alias = decode_reference(&reference)?;
    let mut pool = state
        .store
        .model_route_pool(&alias)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    if let Some(candidates) = req.candidates {
        pool.candidates = candidates;
    }
    if let Some(rules) = req.rules {
        pool.rules = rules;
    }
    if let Some(default_action) = req.default_action {
        pool.default_action = default_action;
    }
    niu_storage::validate_pool_candidates_and_rules(&pool.candidates, &pool.rules)
        .map_err(ApiError::from_store)?;

    let protocol_str = req.protocol.as_deref().unwrap_or("chat");
    let protocol = match protocol_str {
        "chat" | "generate_content" => crate::guardrails::input::Protocol::Chat,
        "responses" => crate::guardrails::input::Protocol::Responses,
        "messages" => crate::guardrails::input::Protocol::Messages,
        "embeddings" => crate::guardrails::input::Protocol::Embeddings,
        _ => {
            return Err(ApiError::invalid_request(
                "protocol must be chat, responses, messages, embeddings, or generate_content",
            ));
        }
    };
    let requirements = crate::config::ModelRequirements {
        project_id: pool.project_id,
        streaming: protocol_str != "messages" && req.streaming,
        messages_streaming: protocol_str == "messages" && req.streaming,
        messages_tools: protocol_str == "messages" && req.tools,
        messages_streaming_tools: protocol_str == "messages" && req.streaming && req.tools,
        tools: protocol_str != "messages" && req.tools,
        streaming_tools: protocol_str != "messages" && req.streaming && req.tools,
        structured_output: req.structured_output,
        vision: req.vision,
        reasoning: req.reasoning,
        estimated_input_tokens: req.input_tokens,
        requested_output_tokens: req.output_tokens,
        ..Default::default()
    };

    let (_, inputs) = super::publication::catalog_inputs(&state).await?;
    let mut routes_by_alias = std::collections::BTreeMap::new();
    for route in &inputs.routes {
        routes_by_alias.insert(route.model.alias.as_str(), route);
    }

    let pool_slug = pool
        .slug
        .clone()
        .unwrap_or_else(|| pool.alias.replace('/', "-"));
    let matched =
        super::models::select_pool_rule_candidates(&pool, Some(&protocol), Some(&requirements));
    let (active_candidates, matched_rule) = match matched {
        Ok((candidates, rule)) => (candidates, rule),
        Err(_) => {
            return Ok(Json(json!({
                "data": {
                    "alias": pool.alias,
                    "pool_alias": pool.alias,
                    "pool_slug": pool_slug,
                    "revision": pool.revision,
                    "billing_mode": pool.billing_mode,
                    "public_catalog": pool.public_catalog,
                    "matched_rule": null,
                    "matched_rule_id": null,
                    "matched_rule_name": null,
                    "default_action": pool.default_action,
                    "used_default_action": pool.default_action,
                    "rejected": true,
                    "routable": false,
                    "winning_priority": null,
                    "selected_candidates": [],
                    "eligible_candidates": [],
                    "ineligible_candidates": [],
                    "candidates": [],
                }
            })));
        }
    };

    let mut evaluated = Vec::with_capacity(active_candidates.len());
    for candidate in active_candidates {
        let mut reason: Option<&'static str> = None;
        if !candidate.enabled {
            reason = Some("candidate_disabled");
        } else if let Some(route) = routes_by_alias.get(candidate.alias.as_str()) {
            if !route.vendor.enabled {
                reason = Some("vendor_disabled");
            } else if !route.model.enabled {
                reason = Some("model_disabled");
            } else if !route.vendor.has_credential {
                reason = Some("missing_credential");
            } else if inputs.cooling_down.contains(&route.vendor.id) {
                reason = Some("vendor_cooling_down");
            } else if route.personal_organization_id != pool.organization_id {
                reason = Some("ownership_mismatch");
            } else if pool.organization_id.is_none()
                && (route.model.pricing.is_none()
                    || inputs.unavailable.contains(&route.model.alias))
            {
                reason = Some("supplier_unavailable");
            } else if let Ok(model) = super::models::compile_model(&route.vendor, &route.model) {
                if !requirements.allows(&model) {
                    reason = Some("unsupported_capability");
                } else if req
                    .input_tokens
                    .is_some_and(|t| !model.allows_input_tokens(t))
                {
                    reason = Some("exceeds_context_length");
                } else if req
                    .output_tokens
                    .is_some_and(|t| !model.allows_output_tokens(t))
                {
                    reason = Some("exceeds_max_completion_tokens");
                }
            } else {
                reason = Some("invalid_route");
            }
        } else {
            reason = Some("route_not_found");
        }
        evaluated.push((candidate, reason));
    }

    let winning_priority = evaluated
        .iter()
        .filter(|(_, reason)| reason.is_none())
        .map(|(c, _)| c.priority)
        .max();
    let total_winning_weight: u64 = winning_priority.map_or(0, |prio| {
        evaluated
            .iter()
            .filter(|(c, reason)| reason.is_none() && c.priority == prio)
            .map(|(c, _)| u64::from(c.weight))
            .sum()
    });

    let mut candidates_json = Vec::with_capacity(evaluated.len());
    let mut eligible_candidates = Vec::new();
    let mut ineligible_candidates = Vec::new();
    let mut selected_candidates = Vec::new();
    for (c, reason) in evaluated {
        let eligible = reason.is_none();
        let standby = eligible && winning_priority.is_some_and(|prio| c.priority < prio);
        let winning_tier = eligible && !standby;
        let effective_weight_percent = if winning_tier && total_winning_weight > 0 {
            ((f64::from(c.weight) * 10000.0) / (total_winning_weight as f64)).round() / 100.0
        } else {
            0.0
        };
        if c.enabled {
            selected_candidates.push(c.alias.clone());
        }
        if eligible {
            eligible_candidates.push(json!({
                "alias": c.alias,
                "priority": c.priority,
                "weight": c.weight,
                "winning_tier": winning_tier,
                "traffic_share_percent": effective_weight_percent,
            }));
        } else if let Some(r) = reason {
            let normalized_reason = match r {
                "candidate_disabled" => "disabled_in_pool",
                "unsupported_capability"
                | "exceeds_context_length"
                | "exceeds_max_completion_tokens" => "capability_or_token_mismatch",
                _ => "route_unavailable",
            };
            ineligible_candidates.push(json!({
                "alias": c.alias,
                "reason": normalized_reason,
                "detail": r,
            }));
        }
        candidates_json.push(json!({
            "alias": c.alias,
            "priority": c.priority,
            "weight": c.weight,
            "enabled": c.enabled,
            "eligible": eligible,
            "standby": standby,
            "effective_weight_percent": effective_weight_percent,
            "reason": reason,
        }));
    }

    let matched_rule_id = matched_rule.map(|r| r.id.clone());
    let matched_rule_name = matched_rule.map(|r| r.name.clone());
    let used_default_action = if matched_rule.is_none() {
        Some(pool.default_action)
    } else {
        None
    };

    Ok(Json(json!({
        "data": {
            "alias": pool.alias,
            "pool_alias": pool.alias,
            "pool_slug": pool_slug,
            "revision": pool.revision,
            "billing_mode": pool.billing_mode,
            "public_catalog": pool.public_catalog,
            "matched_rule": matched_rule.map(|r| json!({
                "id": r.id,
                "name": r.name,
                "conditions": r.conditions,
            })),
            "matched_rule_id": matched_rule_id,
            "matched_rule_name": matched_rule_name,
            "default_action": pool.default_action,
            "used_default_action": used_default_action,
            "rejected": false,
            "routable": winning_priority.is_some(),
            "winning_priority": winning_priority,
            "selected_candidates": selected_candidates,
            "eligible_candidates": eligible_candidates,
            "ineligible_candidates": ineligible_candidates,
            "candidates": candidates_json,
        }
    })))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AuditQuery {
    days: Option<i32>,
}

/// ```openapi
/// {
///   "path": "/api/v1/pools/{reference}/audit",
///   "method": "get",
///   "operation": {
///     "operationId": "auditPool",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "summary": "Audit routing and billing strategy for a model route pool",
///     "description": "Returns pricing readiness, margin safety, configured weight shares vs. observed traffic shares, completion rate, latency, customer revenue, upstream cost, and strategy findings for a model route pool.",
///     "parameters": [
///       {
///         "in": "path",
///         "name": "reference",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "minLength": 2,
///           "maxLength": 267,
///           "pattern": "^[A-Za-z0-9_-]+$"
///         },
///         "description": "Unpadded base64url encoding of the exact ASCII pool alias."
///       },
///       {
///         "in": "query",
///         "name": "days",
///         "required": false,
///         "schema": {
///           "type": "integer",
///           "minimum": 1,
///           "maximum": 365,
///           "default": 30
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Pool routing and billing audit report",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "object"
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid reference or window days"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Platform administration required"
///       },
///       "404": {
///         "description": "Pool not found"
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub async fn member_audit(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(reference): Path<String>,
    Query(query): Query<AuditQuery>,
) -> Result<Json<Value>, ApiError> {
    super::api::installation(&state, &headers).await?;
    let alias = decode_reference(&reference)?;
    let days = query.days.unwrap_or(30);
    if !(1..=365).contains(&days) {
        return Err(ApiError::invalid_request("days must be between 1 and 365"));
    }
    let report = state
        .store
        .model_route_pool_audit(&alias, days)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data": report})))
}
