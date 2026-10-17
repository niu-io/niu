//! Platform retail management. These handlers expose configuration, never credentials or procurement.
use super::{ApiError, AppState, HeaderMap, Json, Path, Query, State, Uuid, Value};
use niu_storage::{
    OperatorAuditActor, RetailPromotionPublication, RetailPromotionRetirement,
    RetailStandardPublication,
};
use serde::Deserialize;
use serde_json::json;

async fn actor(state: &AppState, headers: &HeaderMap) -> Result<OperatorAuditActor, ApiError> {
    Ok(match state.authorize_platform_headers(headers).await? {
        crate::state::AdminAuthorization::Installation => OperatorAuditActor::Installation,
        crate::state::AdminAuthorization::Operator(member) => {
            OperatorAuditActor::Operator(member.id)
        }
    })
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PricePage {
    after: Option<Uuid>,
    limit: Option<i64>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HistoryPage {
    before: Option<String>,
    limit: Option<i64>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PreviewQuery {
    customer_organization_id: Uuid,
}

/// ```openapi
/// {
///   "path": "/api/v1/pricing/standard-prices",
///   "method": "post",
///   "operation": {
///     "operationId": "publishRetailStandard",
///     "summary": "Publish a platform standard selling-price revision",
///     "description": "Explicit platform administration required; ordinary customer/Provider membership does not grant access. Independent model/currency/text-or-media identity; standard prices are independent of Provider purchase offers. expected_version is zero for a new identity and the last management version for replacement. All changes are versioned and attributed. Global UUID idempotency keys preserve canonical intent; exact retries return the original publication version, which may be older than current configuration. New standards take effect at commit and do not revoke still-eligible finite promotions. No request price, balance, supply qualification or route is changed. Rates are decimal integer strings; token rates are nanounits per million tokens, fixed charges are nanounits, media quantities are exact rationals. Publication alone is not customer enrollment or dispatch qualification.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "x-niu-implementation": "implemented",
///     "responses": {
///       "200": {
///         "description": "Current configuration or exact prior committed publication",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "properties": {
///                 "data": {
///                   "$ref": "#/components/schemas/RetailPublicationResult"
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
///         "description": "Invalid exact amount, schedule, period or pagination"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Explicit platform administration required"
///       },
///       "409": {
///         "description": "Stale version, conflicting key/period, unknown identity/customer or unsupported publication"
///       },
///       "422": {
///         "description": "Malformed JSON or unsupported schedule shape"
///       }
///     },
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "$ref": "#/components/schemas/RetailStandardPublication"
///           }
///         }
///       }
///     }
///   },
///   "schemas": {
///     "RetailQuantity": {
///       "type": "object",
///       "additionalProperties": false,
///       "properties": {
///         "numerator": {
///           "type": "string",
///           "pattern": "^[0-9]+$"
///         },
///         "denominator": {
///           "type": "string",
///           "pattern": "^[0-9]+$"
///         }
///       },
///       "required": [
///         "numerator",
///         "denominator"
///       ]
///     },
///     "RetailDimensions": {
///       "type": "object",
///       "additionalProperties": false,
///       "properties": {
///         "model": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 200
///         },
///         "channel": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 256
///         },
///         "resolution": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 256
///         },
///         "reference_video": {
///           "type": "boolean"
///         }
///       },
///       "required": [
///         "model",
///         "channel",
///         "resolution",
///         "reference_video"
///       ]
///     },
///     "RetailContextTier": {
///       "type": "object",
///       "additionalProperties": false,
///       "properties": {
///         "minimum_input_tokens": {
///           "type": "string",
///           "pattern": "^[0-9]+$"
///         },
///         "prompt_rate": {
///           "type": "string",
///           "pattern": "^[0-9]+$"
///         },
///         "completion_rate": {
///           "type": "string",
///           "pattern": "^[0-9]+$"
///         },
///         "cached_prompt_rate": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "pattern": "^[0-9]+$"
///         },
///         "cache_write_prompt_rate": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "pattern": "^[0-9]+$"
///         },
///         "reasoning_completion_rate": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "pattern": "^[0-9]+$"
///         }
///       },
///       "required": [
///         "minimum_input_tokens",
///         "prompt_rate",
///         "completion_rate",
///         "cached_prompt_rate",
///         "cache_write_prompt_rate",
///         "reasoning_completion_rate"
///       ]
///     },
///     "RetailTextSchedule": {
///       "type": "object",
///       "additionalProperties": false,
///       "properties": {
///         "kind": {
///           "type": "string",
///           "const": "text"
///         },
///         "prompt_rate": {
///           "type": "string",
///           "pattern": "^[0-9]+$"
///         },
///         "completion_rate": {
///           "type": "string",
///           "pattern": "^[0-9]+$"
///         },
///         "cached_prompt_rate": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "pattern": "^[0-9]+$"
///         },
///         "cache_write_prompt_rate": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "pattern": "^[0-9]+$"
///         },
///         "reasoning_completion_rate": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "pattern": "^[0-9]+$"
///         },
///         "minimum_charge_nanos": {
///           "type": "string",
///           "pattern": "^[0-9]+$"
///         },
///         "request_fee_nanos": {
///           "type": "string",
///           "pattern": "^[0-9]+$"
///         },
///         "context_tiers": {
///           "type": "array",
///           "maxItems": 32,
///           "items": {
///             "$ref": "#/components/schemas/RetailContextTier"
///           }
///         }
///       },
///       "required": [
///         "kind",
///         "prompt_rate",
///         "completion_rate",
///         "cached_prompt_rate",
///         "cache_write_prompt_rate",
///         "reasoning_completion_rate",
///         "minimum_charge_nanos",
///         "request_fee_nanos",
///         "context_tiers"
///       ]
///     },
///     "RetailMediaSchedule": {
///       "type": "object",
///       "additionalProperties": false,
///       "properties": {
///         "kind": {
///           "type": "string",
///           "const": "media"
///         },
///         "dimensions": {
///           "$ref": "#/components/schemas/RetailDimensions"
///         },
///         "meter": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 256
///         },
///         "decimal_places": {
///           "type": "integer",
///           "minimum": 0,
///           "maximum": 9
///         },
///         "amount_units": {
///           "type": "string",
///           "pattern": "^[0-9]+$"
///         },
///         "per_quantity": {
///           "$ref": "#/components/schemas/RetailQuantity"
///         },
///         "minimum_quantity": {
///           "$ref": "#/components/schemas/RetailQuantity"
///         },
///         "rounding": {
///           "type": "string",
///           "enum": [
///             "Down",
///             "Up",
///             "HalfEven"
///           ]
///         }
///       },
///       "required": [
///         "kind",
///         "dimensions",
///         "meter",
///         "decimal_places",
///         "amount_units",
///         "per_quantity",
///         "minimum_quantity",
///         "rounding"
///       ]
///     },
///     "RetailSchedule": {
///       "oneOf": [
///         {
///           "$ref": "#/components/schemas/RetailTextSchedule"
///         },
///         {
///           "$ref": "#/components/schemas/RetailMediaSchedule"
///         }
///       ],
///       "description": "Concrete resulting selling price; exact decimal strings, no multipliers or Provider purchase terms."
///     },
///     "RetailStandardPublication": {
///       "type": "object",
///       "additionalProperties": false,
///       "properties": {
///         "model_alias": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 200
///         },
///         "currency": {
///           "type": "string",
///           "pattern": "^[A-Z]{3}$"
///         },
///         "schedule": {
///           "$ref": "#/components/schemas/RetailSchedule"
///         },
///         "expected_version": {
///           "type": "string",
///           "pattern": "^[0-9]+$"
///         },
///         "idempotency_key": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "reason": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 500
///         }
///       },
///       "required": [
///         "model_alias",
///         "currency",
///         "schedule",
///         "expected_version",
///         "idempotency_key",
///         "reason"
///       ]
///     },
///     "RetailPromotionPublication": {
///       "type": "object",
///       "additionalProperties": false,
///       "properties": {
///         "baseline_revision": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "customer_organization_id": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "format": "uuid"
///         },
///         "schedule": {
///           "$ref": "#/components/schemas/RetailSchedule"
///         },
///         "effective_from": {
///           "type": "string",
///           "pattern": "^[0-9]+$"
///         },
///         "effective_until": {
///           "type": "string",
///           "pattern": "^[0-9]+$"
///         },
///         "expected_version": {
///           "type": "string",
///           "pattern": "^[0-9]+$"
///         },
///         "idempotency_key": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "reason": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 500
///         }
///       },
///       "required": [
///         "baseline_revision",
///         "customer_organization_id",
///         "schedule",
///         "effective_from",
///         "effective_until",
///         "expected_version",
///         "idempotency_key",
///         "reason"
///       ]
///     },
///     "RetailPromotionRetirement": {
///       "type": "object",
///       "additionalProperties": false,
///       "properties": {
///         "effective_until": {
///           "type": "string",
///           "pattern": "^[0-9]+$"
///         },
///         "expected_version": {
///           "type": "string",
///           "pattern": "^[0-9]+$"
///         },
///         "idempotency_key": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "reason": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 500
///         }
///       },
///       "required": [
///         "effective_until",
///         "expected_version",
///         "idempotency_key",
///         "reason"
///       ]
///     },
///     "RetailPublicationResult": {
///       "type": "object",
///       "additionalProperties": false,
///       "properties": {
///         "price_id": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "revision": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "version": {
///           "type": "string",
///           "pattern": "^[0-9]+$"
///         }
///       },
///       "required": [
///         "price_id",
///         "revision",
///         "version"
///       ]
///     },
///     "RetailSelection": {
///       "type": "object",
///       "additionalProperties": false,
///       "properties": {
///         "price_id": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "model_alias": {
///           "type": "string"
///         },
///         "currency": {
///           "type": "string"
///         },
///         "version": {
///           "type": "string",
///           "pattern": "^[0-9]+$"
///         },
///         "current_standard_revision": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "baseline_revision": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "promotion_revision": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "format": "uuid"
///         },
///         "promotion_scope": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "enum": [
///             "global",
///             "customer",
///             null
///           ]
///         },
///         "selected_at": {
///           "type": "string",
///           "pattern": "^[0-9]+$"
///         },
///         "schedule": {
///           "$ref": "#/components/schemas/RetailSchedule"
///         }
///       },
///       "required": [
///         "price_id",
///         "model_alias",
///         "currency",
///         "version",
///         "current_standard_revision",
///         "baseline_revision",
///         "promotion_revision",
///         "promotion_scope",
///         "selected_at",
///         "schedule"
///       ]
///     },
///     "RetailPriceRecord": {
///       "type": "object",
///       "additionalProperties": false,
///       "properties": {
///         "price_id": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "model_alias": {
///           "type": "string"
///         },
///         "currency": {
///           "type": "string"
///         },
///         "version": {
///           "type": "string",
///           "pattern": "^[0-9]+$"
///         },
///         "revision": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "schedule": {
///           "$ref": "#/components/schemas/RetailSchedule"
///         },
///         "published_at": {
///           "type": "string",
///           "format": "date-time"
///         }
///       },
///       "required": [
///         "price_id",
///         "model_alias",
///         "currency",
///         "version",
///         "revision",
///         "schedule",
///         "published_at"
///       ]
///     },
///     "RetailHistoryEntry": {
///       "type": "object",
///       "additionalProperties": false,
///       "properties": {
///         "revision": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "version": {
///           "type": "string",
///           "pattern": "^[0-9]+$"
///         },
///         "action": {
///           "type": "string",
///           "enum": [
///             "standard_published",
///             "promotion_published",
///             "promotion_retired"
///           ]
///         },
///         "reason": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 500
///         },
///         "created_at": {
///           "type": "string",
///           "format": "date-time"
///         },
///         "standard_schedule": {
///           "anyOf": [
///             {
///               "$ref": "#/components/schemas/RetailSchedule"
///             },
///             {
///               "type": "null"
///             }
///           ]
///         },
///         "promotion": {
///           "anyOf": [
///             {
///               "$ref": "#/components/schemas/RetailHistoryPromotion"
///             },
///             {
///               "type": "null"
///             }
///           ]
///         },
///         "retirement": {
///           "anyOf": [
///             {
///               "$ref": "#/components/schemas/RetailHistoryRetirement"
///             },
///             {
///               "type": "null"
///             }
///           ]
///         }
///       },
///       "required": [
///         "revision",
///         "version",
///         "action",
///         "reason",
///         "created_at",
///         "standard_schedule",
///         "promotion",
///         "retirement"
///       ]
///     },
///     "RetailHistoryPromotion": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "baseline_revision",
///         "scope",
///         "customer_organization_id",
///         "customer_name",
///         "effective_from",
///         "effective_until",
///         "schedule"
///       ],
///       "properties": {
///         "baseline_revision": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "scope": {
///           "type": "string",
///           "enum": [
///             "global",
///             "customer"
///           ]
///         },
///         "customer_organization_id": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "format": "uuid"
///         },
///         "customer_name": {
///           "type": [
///             "string",
///             "null"
///           ]
///         },
///         "effective_from": {
///           "type": "string",
///           "pattern": "^[0-9]+$"
///         },
///         "effective_until": {
///           "type": "string",
///           "pattern": "^[0-9]+$"
///         },
///         "schedule": {
///           "$ref": "#/components/schemas/RetailSchedule"
///         }
///       }
///     },
///     "RetailHistoryRetirement": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "promotion_revision",
///         "effective_until"
///       ],
///       "properties": {
///         "promotion_revision": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "effective_until": {
///           "type": "string",
///           "pattern": "^[0-9]+$"
///         }
///       }
///     }
///   }
/// }
/// ```
pub async fn publish_standard(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<RetailStandardPublication>,
) -> Result<Json<Value>, ApiError> {
    let actor = actor(&state, &headers).await?;
    let result = state
        .store
        .publish_retail_standard(input, actor)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":result})))
}

/// ```openapi
/// {
///   "path": "/api/v1/pricing/standard-prices",
///   "method": "get",
///   "operation": {
///     "operationId": "listRetailStandards",
///     "summary": "List current platform standard prices",
///     "description": "Explicit platform administration required; ordinary customer/Provider membership does not grant access. Current revision only, one database snapshot, UUID keyset order. Pass next_after unchanged; null means complete. Prices do not establish qualified inventory. No customer usage, credentials or Provider costs. Internal references are API identifiers, never display names. Cache-Control: no-store.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "x-niu-implementation": "implemented",
///     "responses": {
///       "200": {
///         "description": "Current configuration or exact prior committed publication",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "$ref": "#/components/schemas/RetailPriceRecord"
///                   }
///                 },
///                 "next_after": {
///                   "type": [
///                     "string",
///                     "null"
///                   ],
///                   "format": "uuid"
///                 }
///               },
///               "required": [
///                 "data",
///                 "next_after"
///               ]
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid exact amount, schedule, period or pagination"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Explicit platform administration required"
///       },
///       "409": {
///         "description": "Stale version, conflicting key/period, unknown identity/customer or unsupported publication"
///       }
///     },
///     "parameters": [
///       {
///         "name": "after",
///         "in": "query",
///         "required": false,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "limit",
///         "in": "query",
///         "required": false,
///         "schema": {
///           "type": "integer",
///           "minimum": 1,
///           "maximum": 100,
///           "default": 50
///         }
///       }
///     ]
///   }
/// }
/// ```
pub async fn list(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<PricePage>,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    actor(&state, &headers).await?;
    let result = state
        .store
        .platform_retail_prices(query.after, query.limit.unwrap_or(50))
        .await
        .map_err(ApiError::from_store)?;
    Ok(([("cache-control", "no-store")], Json(result)))
}

/// ```openapi
/// {
///   "path": "/api/v1/pricing/standard-prices/{price}/promotions",
///   "method": "post",
///   "operation": {
///     "operationId": "publishRetailPromotion",
///     "summary": "Publish one finite global or customer price",
///     "description": "Explicit platform administration required; ordinary customer/Provider membership does not grant access. The explicit result references an exact immutable undiscounted standard revision of this price identity. Null customer_organization_id means global; a company reference means customer-specific. Inclusive start/exclusive end are exact UTC epoch-second strings, with finite end greater than start. Same-scope overlap is rejected; at selection an eligible customer rule overrides the global rule, never stacks. Every text category/fixed charge/context tier must preserve meaning and not increase; media retains dimensions, meter, unit, decimal scale, rounding and minimum and only discounts amount_units. Retained original baselines survive later standard updates. No existing request or job is repriced.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "x-niu-implementation": "implemented",
///     "responses": {
///       "200": {
///         "description": "Current configuration or exact prior committed publication",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "properties": {
///                 "data": {
///                   "$ref": "#/components/schemas/RetailPublicationResult"
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
///         "description": "Invalid exact amount, schedule, period or pagination"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Explicit platform administration required"
///       },
///       "409": {
///         "description": "Stale version, conflicting key/period, unknown identity/customer or unsupported publication"
///       },
///       "422": {
///         "description": "Malformed JSON or unsupported schedule shape"
///       }
///     },
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "$ref": "#/components/schemas/RetailPromotionPublication"
///           }
///         }
///       }
///     },
///     "parameters": [
///       {
///         "name": "price",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       }
///     ]
///   }
/// }
/// ```
pub async fn publish_promotion(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(price): Path<Uuid>,
    Json(input): Json<RetailPromotionPublication>,
) -> Result<Json<Value>, ApiError> {
    let actor = actor(&state, &headers).await?;
    let result = state
        .store
        .publish_retail_promotion(price, input, actor)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":result})))
}

/// ```openapi
/// {
///   "path": "/api/v1/pricing/standard-prices/{price}/promotions/{promotion}/retire",
///   "method": "post",
///   "operation": {
///     "operationId": "retireRetailPromotion",
///     "summary": "Append a promotion eligibility cutoff",
///     "description": "Explicit platform administration required; ordinary customer/Provider membership does not grant access. Append-only explicit retirement, at most one cutoff for this promotion. Cutoff cannot extend its published end; a cutoff before its start cancels a future rule. Exact epoch-second strings and configuration version are required. Published schedules and already pinned operations/jobs stay immutable. This does not trigger a customer refund or change routing.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "x-niu-implementation": "implemented",
///     "responses": {
///       "200": {
///         "description": "Current configuration or exact prior committed publication",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "properties": {
///                 "data": {
///                   "$ref": "#/components/schemas/RetailPublicationResult"
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
///         "description": "Invalid exact amount, schedule, period or pagination"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Explicit platform administration required"
///       },
///       "409": {
///         "description": "Stale version, conflicting key/period, unknown identity/customer or unsupported publication"
///       },
///       "422": {
///         "description": "Malformed JSON or unsupported schedule shape"
///       }
///     },
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "$ref": "#/components/schemas/RetailPromotionRetirement"
///           }
///         }
///       }
///     },
///     "parameters": [
///       {
///         "name": "price",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "promotion",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       }
///     ]
///   }
/// }
/// ```
pub async fn retire_promotion(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((price, promotion)): Path<(Uuid, Uuid)>,
    Json(input): Json<RetailPromotionRetirement>,
) -> Result<Json<Value>, ApiError> {
    let actor = actor(&state, &headers).await?;
    let result = state
        .store
        .retire_retail_promotion(price, promotion, input, actor)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":result})))
}

/// ```openapi
/// {
///   "path": "/api/v1/pricing/standard-prices/{price}/history",
///   "method": "get",
///   "operation": {
///     "operationId": "getRetailPriceHistory",
///     "summary": "Read immutable standard and promotion history",
///     "description": "Explicit platform administration required; ordinary customer/Provider membership does not grant access. Platform configuration history can include different customer-specific rules; never expose this projection to customers. Version keyset descending, pass next_before unchanged. Each page is one snapshot. Names are customer-company display values; UUIDs are routing references. No procurement or customer usage. Cache-Control: no-store.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "x-niu-implementation": "implemented",
///     "responses": {
///       "200": {
///         "description": "Current configuration or exact prior committed publication",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "properties": {
///                 "price_id": {
///                   "type": "string",
///                   "format": "uuid"
///                 },
///                 "model_alias": {
///                   "type": "string"
///                 },
///                 "currency": {
///                   "type": "string"
///                 },
///                 "current_version": {
///                   "type": "string",
///                   "pattern": "^[0-9]+$"
///                 },
///                 "current_revision": {
///                   "type": [
///                     "string",
///                     "null"
///                   ],
///                   "format": "uuid"
///                 },
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "$ref": "#/components/schemas/RetailHistoryEntry"
///                   }
///                 },
///                 "next_before": {
///                   "type": [
///                     "string",
///                     "null"
///                   ],
///                   "pattern": "^[1-9][0-9]*$"
///                 }
///               },
///               "required": [
///                 "price_id",
///                 "model_alias",
///                 "currency",
///                 "current_version",
///                 "current_revision",
///                 "data",
///                 "next_before"
///               ]
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid exact amount, schedule, period or pagination"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Explicit platform administration required"
///       },
///       "409": {
///         "description": "Stale version, conflicting key/period, unknown identity/customer or unsupported publication"
///       }
///     },
///     "parameters": [
///       {
///         "name": "price",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "before",
///         "in": "query",
///         "required": false,
///         "schema": {
///           "type": "string",
///           "pattern": "^[0-9]+$"
///         }
///       },
///       {
///         "name": "limit",
///         "in": "query",
///         "required": false,
///         "schema": {
///           "type": "integer",
///           "minimum": 1,
///           "maximum": 100,
///           "default": 50
///         }
///       }
///     ]
///   }
/// }
/// ```
pub async fn history(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(price): Path<Uuid>,
    Query(query): Query<HistoryPage>,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    actor(&state, &headers).await?;
    let before = query
        .before
        .as_deref()
        .map(super::exact_nonnegative_integer)
        .transpose()?;
    let result = state
        .store
        .platform_retail_price_history(price, before, query.limit.unwrap_or(50))
        .await
        .map_err(ApiError::from_store)?;
    Ok(([("cache-control", "no-store")], Json(result)))
}

/// ```openapi
/// {
///   "path": "/api/v1/pricing/standard-prices/{price}/preview",
///   "method": "get",
///   "operation": {
///     "operationId": "previewRetailPrice",
///     "summary": "Preview a customer applicable price",
///     "description": "Explicit platform administration required; ordinary customer/Provider membership does not grant access. Advice only: does not enroll a workspace, reserve, dispatch or bind a request. Resolve at server time after the price identity lock, customer promotion then global then current standard. Exposes only this customer selection, not other customer rules. current_standard_revision may differ from the retained promotion baseline. Actual admission must select and pin in its transaction; never use preview as settlement evidence. Exact selected_at is UTC epoch seconds. Cache-Control: no-store.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "x-niu-implementation": "implemented",
///     "responses": {
///       "200": {
///         "description": "Current configuration or exact prior committed publication",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/RetailSelection"
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid exact amount, schedule, period or pagination"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Explicit platform administration required"
///       },
///       "409": {
///         "description": "Stale version, conflicting key/period, unknown identity/customer or unsupported publication"
///       }
///     },
///     "parameters": [
///       {
///         "name": "price",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "customer_organization_id",
///         "in": "query",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       }
///     ]
///   }
/// }
/// ```
pub async fn preview(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(price): Path<Uuid>,
    Query(query): Query<PreviewQuery>,
) -> Result<
    (
        [(&'static str, &'static str); 1],
        Json<niu_storage::RetailSelection>,
    ),
    ApiError,
> {
    actor(&state, &headers).await?;
    let result = state
        .store
        .preview_retail_price(price, query.customer_organization_id)
        .await
        .map_err(ApiError::from_store)?;
    Ok(([("cache-control", "no-store")], Json(result)))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EnrollmentQuery {
    model_alias: String,
}

/// ```openapi
/// {
///   "path": "/api/v1/organizations/{organization}/projects/{project}/billing/retail-price-enrollment",
///   "method": "post",
///   "operation": {
///     "operationId": "setRetailTextEnrollment",
///     "summary": "Enroll a workspace model in a platform selling price",
///     "description": "Explicit platform administration required. price_id chooses a published text identity with the same model and an existing company/currency balance account; no account, credit, funds, Provider qualification or selling permission is created. Explicit null restores legacy workspace tariff selection for future operations. expected_version zero creates the configuration; updates use immutable version history and an exact company/workspace-scoped idempotency key. Existing operation prices, charges and legacy current tariff pointers are unchanged. Missing price_id is rejected rather than silently disabling enrollment. No automatic retry.",
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
///       }
///     ],
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "required": [
///               "model_alias",
///               "price_id",
///               "expected_version",
///               "idempotency_key",
///               "reason"
///             ],
///             "properties": {
///               "model_alias": {
///                 "type": "string",
///                 "minLength": 1,
///                 "maxLength": 200
///               },
///               "price_id": {
///                 "type": [
///                   "string",
///                   "null"
///                 ],
///                 "format": "uuid"
///               },
///               "expected_version": {
///                 "type": "string",
///                 "pattern": "^[0-9]+$"
///               },
///               "idempotency_key": {
///                 "type": "string",
///                 "format": "uuid"
///               },
///               "reason": {
///                 "type": "string",
///                 "minLength": 1,
///                 "maxLength": 500
///               }
///             },
///             "additionalProperties": false
///           }
///         }
///       }
///     },
///     "responses": {
///       "200": {
///         "description": "Current configuration or exact committed outcome",
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
///                     "revision",
///                     "version",
///                     "model_alias",
///                     "price_id"
///                   ],
///                   "properties": {
///                     "revision": {
///                       "type": "string",
///                       "format": "uuid"
///                     },
///                     "version": {
///                       "type": "string",
///                       "pattern": "^[0-9]+$"
///                     },
///                     "model_alias": {
///                       "type": "string",
///                       "minLength": 1,
///                       "maxLength": 200
///                     },
///                     "price_id": {
///                       "type": [
///                         "string",
///                         "null"
///                       ],
///                       "format": "uuid"
///                     }
///                   },
///                   "additionalProperties": false
///                 }
///               },
///               "additionalProperties": false
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid model, reason or exact version"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Explicit platform administration required"
///       },
///       "409": {
///         "description": "Stale version, conflicting key, unknown workspace, missing balance account or incompatible price identity"
///       },
///       "422": {
///         "description": "Malformed body or missing explicit price_id"
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub async fn enroll_text(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization, project)): Path<(Uuid, Uuid)>,
    Json(input): Json<niu_storage::RetailTextEnrollmentPublication>,
) -> Result<Json<Value>, ApiError> {
    let actor = actor(&state, &headers).await?;
    let result = state
        .store
        .publish_retail_text_enrollment(
            niu_storage::TenantScope {
                organization_id: organization,
                project_id: project,
            },
            &input,
            actor,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":result})))
}

/// ```openapi
/// {
///   "path": "/api/v1/organizations/{organization}/projects/{project}/billing/retail-price-enrollment",
///   "method": "get",
///   "operation": {
///     "operationId": "getRetailTextEnrollment",
///     "summary": "Read own workspace retail pricing mode",
///     "description": "Requires workspace read authority or platform administration. Current configuration only, no other-customer rules, procurement or usage. Absent saved enrollment means workspace pricing, version zero and null price_id. This does not establish an available route or spending permission. Internal references are API values, never display names. Cache-Control: no-store. Effective price is an advisory own-customer selection at server time under the workspace and price locks; null in workspace pricing mode. No other-customer rules are returned.",
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
///         "name": "model_alias",
///         "in": "query",
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
///         "description": "Current configuration or exact committed outcome",
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
///                     "model_alias",
///                     "price_id",
///                     "version",
///                     "pricing_source",
///                     "effective_price"
///                   ],
///                   "properties": {
///                     "model_alias": {
///                       "type": "string",
///                       "minLength": 1,
///                       "maxLength": 200
///                     },
///                     "price_id": {
///                       "type": [
///                         "string",
///                         "null"
///                       ],
///                       "format": "uuid"
///                     },
///                     "version": {
///                       "type": "string",
///                       "pattern": "^[0-9]+$"
///                     },
///                     "pricing_source": {
///                       "type": "string",
///                       "enum": [
///                         "platform",
///                         "workspace"
///                       ]
///                     },
///                     "effective_price": {
///                       "anyOf": [
///                         {
///                           "$ref": "#/components/schemas/RetailSelection"
///                         },
///                         {
///                           "type": "null"
///                         }
///                       ]
///                     }
///                   },
///                   "additionalProperties": false
///                 }
///               },
///               "additionalProperties": false
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid model alias"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "404": {
///         "description": "Workspace outside authority"
///       },
///       "409": {
///         "description": "Unknown authorized workspace"
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub async fn enrollment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization, project)): Path<(Uuid, Uuid)>,
    Query(query): Query<EnrollmentQuery>,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    let auth = state
        .authorize_admin_headers(&headers, niu_storage::AdminPermission::Read)
        .await?;
    let scope = niu_storage::TenantScope {
        organization_id: organization,
        project_id: project,
    };
    if !auth.can_manage_platform() && !auth.permits_project(scope) {
        return Err(ApiError::not_found());
    }
    let result = state
        .store
        .retail_text_enrollment(scope, &query.model_alias)
        .await
        .map_err(ApiError::from_store)?;
    Ok((
        [("cache-control", "no-store")],
        Json(json!({"data":result})),
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RegisteredModelPage {
    after: Option<String>,
    limit: Option<i64>,
}

/// ```openapi
/// {
///   "path": "/api/v1/pricing/standard-prices/models",
///   "method": "get",
///   "operation": {
///     "operationId": "listRegisteredRetailModels",
///     "summary": "List registered shared models for standard-price preparation",
///     "description": "Explicit platform administration required. Includes registered nonpersonal vendor aliases and route-pool aliases even when disabled. Matches standard-price registration eligibility, not legacy workspace tariff availability. Personal vendor aliases are excluded. Registration is not qualified supply, customer selling eligibility or dispatch readiness. No credentials, upstream mappings or procurement prices. Sorted alias keyset; default 50, maximum 100. Pass next_after unchanged; unavailable cursor returns 409. Cursor and page share one database snapshot. Cache-Control no-store.",
///     "x-niu-implementation": "implemented",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "after",
///         "in": "query",
///         "schema": {
///           "type": "string",
///           "maxLength": 200
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
///         "description": "Registered alias page, including disabled configuration",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "required": [
///                 "data",
///                 "next_after"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "maxItems": 100,
///                   "items": {
///                     "type": "object",
///                     "additionalProperties": false,
///                     "required": [
///                       "model_alias"
///                     ],
///                     "properties": {
///                       "model_alias": {
///                         "type": "string"
///                       }
///                     }
///                   }
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
///         "description": "Invalid page size or alias cursor"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Platform administration required"
///       },
///       "409": {
///         "description": "Cursor no longer registered; restart pagination"
///       }
///     }
///   }
/// }
/// ```
pub async fn registered_models(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<RegisteredModelPage>,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    actor(&state, &headers).await?;
    let limit = query.limit.unwrap_or(50);
    if !(1..=100).contains(&limit)
        || query
            .after
            .as_ref()
            .is_some_and(|v| v.is_empty() || v.len() > 200)
    {
        return Err(ApiError::invalid_request(
            "Choose a page size from 1 to 100 and a valid model cursor",
        ));
    }
    let result = state
        .store
        .registered_retail_models(query.after.as_deref(), limit)
        .await
        .map_err(ApiError::from_store)?;
    Ok(([("cache-control", "no-store")], Json(result)))
}

/// ```openapi
/// {
///   "path": "/api/v1/pricing/customers",
///   "method": "get",
///   "operation": {
///     "operationId": "listRetailCustomerTargets",
///     "summary": "List named companies for customer-specific promotions",
///     "description": "Explicit platform administration only, independent of ordinary company membership. Includes companies without workspaces or currency accounts. Names, company creation timestamps for distinguishing repeated names, and routing-only company references; no balances, payment details, request content, Provider costs or credentials. UUID keyset order; default 50, maximum 100 companies. Pass next_after unchanged; missing cursor returns 409. Each page shares one bounded read snapshot; separate pages do not, so refresh for concurrent inserts before the cursor. No organization, workspace, account or policy is created. Discovery is not selling or spending authorization. Cache-Control no-store.",
///     "x-niu-implementation": "implemented",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
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
///         "description": "Named company page without financial data",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data",
///                 "next_after"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "type": "object",
///                     "required": [
///                       "organization_id",
///                       "organization_name",
///                       "created_at"
///                     ],
///                     "properties": {
///                       "organization_id": {
///                         "type": "string",
///                         "format": "uuid"
///                       },
///                       "organization_name": {
///                         "type": "string"
///                       },
///                       "created_at": {
///                         "type": "string",
///                         "format": "date-time",
///                         "description": "Company creation time; not a billing or eligibility event."
///                       }
///                     }
///                   }
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
///         "description": "Invalid query or page size"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Platform administration required"
///       },
///       "409": {
///         "description": "Missing company cursor"
///       }
///     }
///   }
/// }
/// ```
pub async fn customers(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<PricePage>,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    actor(&state, &headers).await?;
    let limit = query.limit.unwrap_or(50);
    if !(1..=100).contains(&limit) {
        return Err(ApiError::invalid_request(
            "Choose a page size from 1 to 100",
        ));
    }
    let result = state
        .store
        .retail_customer_targets(query.after, limit)
        .await
        .map_err(ApiError::from_store)?;
    Ok(([("cache-control", "no-store")], Json(result)))
}

/// ```openapi
/// {
///   "path": "/api/v1/pricing/standard-prices/{price}/promotions",
///   "method": "get",
///   "operation": {
///     "operationId": "listRetailPromotions",
///     "summary": "Read promotion periods with complete retirement coverage",
///     "description": "Explicit platform administration only. Each bounded page joins every returned promotion to its committed cutoff and original standard, regardless of history pagination. as_of is database UTC epoch seconds; state is scheduled, within_period or ended based on original start and the lesser of original end/cutoff. Within-period is temporal eligibility only: a global rule can be overridden by a customer rule, and this is not supply, enrollment, spending permission or a request snapshot. Current head version, original/results and names are from one statement snapshot. Other pages have separate snapshots/times. Newest publication version first; pass next_before unchanged. A cursor must name a promotion of this price; unavailable price/cursor returns 409. No procurement, credentials or financial mutations. Cache-Control no-store. The current standard and management version share this page snapshot; use them together for a new publication, then rely on server version comparison.",
///     "x-niu-implementation": "implemented",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "price",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "before",
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
///           "default": 50
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Promotion state at the returned observation time",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "price_id",
///                 "model_alias",
///                 "currency",
///                 "current_version",
///                 "as_of",
///                 "next_before",
///                 "data",
///                 "standard"
///               ],
///               "properties": {
///                 "price_id": {
///                   "type": "string",
///                   "format": "uuid"
///                 },
///                 "model_alias": {
///                   "type": "string"
///                 },
///                 "currency": {
///                   "type": "string"
///                 },
///                 "current_version": {
///                   "type": "string"
///                 },
///                 "as_of": {
///                   "type": "string"
///                 },
///                 "next_before": {
///                   "type": [
///                     "string",
///                     "null"
///                   ]
///                 },
///                 "data": {
///                   "type": "array",
///                   "maxItems": 100,
///                   "items": {
///                     "type": "object",
///                     "required": [
///                       "version",
///                       "baseline_version",
///                       "reason",
///                       "effective_from",
///                       "effective_until",
///                       "eligibility_until",
///                       "revision",
///                       "baseline_revision",
///                       "created_at",
///                       "baseline_published_at",
///                       "original_schedule",
///                       "schedule",
///                       "scope",
///                       "customer_organization_id",
///                       "customer_name",
///                       "customer_created_at",
///                       "retirement_effective_until",
///                       "state"
///                     ],
///                     "properties": {
///                       "version": {
///                         "type": "string"
///                       },
///                       "baseline_version": {
///                         "type": "string"
///                       },
///                       "reason": {
///                         "type": "string"
///                       },
///                       "effective_from": {
///                         "type": "string"
///                       },
///                       "effective_until": {
///                         "type": "string"
///                       },
///                       "eligibility_until": {
///                         "type": "string"
///                       },
///                       "revision": {
///                         "type": "string",
///                         "format": "uuid"
///                       },
///                       "baseline_revision": {
///                         "type": "string",
///                         "format": "uuid"
///                       },
///                       "created_at": {
///                         "type": "string",
///                         "format": "date-time"
///                       },
///                       "baseline_published_at": {
///                         "type": "string",
///                         "format": "date-time"
///                       },
///                       "original_schedule": {
///                         "$ref": "#/components/schemas/RetailSchedule"
///                       },
///                       "schedule": {
///                         "$ref": "#/components/schemas/RetailSchedule"
///                       },
///                       "scope": {
///                         "type": "string",
///                         "enum": [
///                           "global",
///                           "customer"
///                         ]
///                       },
///                       "customer_organization_id": {
///                         "type": [
///                           "string",
///                           "null"
///                         ],
///                         "format": "uuid"
///                       },
///                       "customer_name": {
///                         "type": [
///                           "string",
///                           "null"
///                         ]
///                       },
///                       "customer_created_at": {
///                         "type": [
///                           "string",
///                           "null"
///                         ],
///                         "format": "date-time"
///                       },
///                       "retirement_effective_until": {
///                         "type": [
///                           "string",
///                           "null"
///                         ]
///                       },
///                       "state": {
///                         "type": "string",
///                         "enum": [
///                           "scheduled",
///                           "within_period",
///                           "ended"
///                         ]
///                       }
///                     }
///                   }
///                 },
///                 "standard": {
///                   "$ref": "#/components/schemas/RetailPriceRecord"
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid limit or positive version cursor"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Platform administration required"
///       },
///       "409": {
///         "description": "Price or promotion cursor unavailable; restart pagination"
///       }
///     }
///   }
/// }
/// ```
pub async fn promotions(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(price): Path<Uuid>,
    Query(query): Query<HistoryPage>,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    actor(&state, &headers).await?;
    let before = query
        .before
        .as_deref()
        .map(|value| {
            value
                .parse::<i64>()
                .map_err(|_| ApiError::invalid_request("Use a positive promotion version cursor"))
        })
        .transpose()?;
    let limit = query.limit.unwrap_or(50);
    if !(1..=100).contains(&limit) || before.is_some_and(|v| v <= 0) {
        return Err(ApiError::invalid_request(
            "Choose a positive cursor and a page size from 1 to 100",
        ));
    }
    let result = state
        .store
        .platform_retail_promotions(price, before, limit)
        .await
        .map_err(ApiError::from_store)?;
    Ok(([("cache-control", "no-store")], Json(result)))
}
