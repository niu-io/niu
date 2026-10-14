//! Platform-only commercial comparison; no customer or Supplier-member entry.
use super::{ApiError, AppState, HeaderMap, Json, Query, State, Value};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PositionQuery {
    currency: String,
    days: Option<i32>,
}

/// ```openapi
/// {
///   "path": "/admin/v1/commercial-position",
///   "method": "get",
///   "operation": {
///     "operationId": "getCommercialPosition",
///     "summary": "Compare installation commercial Supplier positions",
///     "description": "Explicit platform administrator only. One current database snapshot for a UTC rolling dispatch interval [from, until), 7/30/90 days and a configured currency. Personal owner-funded supply is excluded. Each row is a Supplier, customer-facing model alias and currency; route-pool candidates appear as distinct offers. Customer charges are confirmed retail charges, not external cash receipts. Supplier settlement links record confirmed external payments, not automatic transfers. Null monetary values mean unavailable, never zero. Margin is customer charge minus Supplier earning over matched attempts only, withheld when any potentially executed attempt is unresolved. Cost is separately reported over matched attempts and withheld if any matching cost entry is missing; cost coverage counts are explicit. Empty offers means no quote in the selected currency. No customer identity, request identity, body or credential is returned. Read-only; never changes routing or model. Identifiers are API references and must not become product labels. Cache-Control: no-store.",
///     "x-niu-implementation": "implemented",
///     "security": [
///       {
///         "bearerAuth": []
///       },
///       {
///         "niuApiKeyAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "currency",
///         "in": "query",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "pattern": "^[A-Z]{3}$"
///         }
///       },
///       {
///         "name": "days",
///         "in": "query",
///         "schema": {
///           "type": "integer",
///           "enum": [
///             7,
///             30,
///             90
///           ],
///           "default": 30
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Commercial positions",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "currency",
///                 "days",
///                 "from",
///                 "until",
///                 "data"
///               ],
///               "properties": {
///                 "currency": {
///                   "type": "string"
///                 },
///                 "days": {
///                   "type": "integer",
///                   "enum": [
///                     7,
///                     30,
///                     90
///                   ]
///                 },
///                 "from": {
///                   "type": "string",
///                   "format": "date-time"
///                 },
///                 "until": {
///                   "type": "string",
///                   "format": "date-time"
///                 },
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "type": "object",
///                     "properties": {
///                       "supplier_id": {
///                         "type": "string",
///                         "format": "uuid"
///                       },
///                       "supplier_name": {
///                         "type": "string"
///                       },
///                       "model_alias": {
///                         "type": "string"
///                       },
///                       "currency": {
///                         "type": "string"
///                       },
///                       "offers": {
///                         "type": "array",
///                         "items": {
///                           "type": "object",
///                           "properties": {
///                             "offer_id": {
///                               "type": "string",
///                               "format": "uuid"
///                             },
///                             "route_alias": {
///                               "type": "string"
///                             },
///                             "revision": {
///                               "type": "string",
///                               "format": "uuid"
///                             },
///                             "rate_kind": {
///                               "type": "string",
///                               "enum": [
///                                 "text",
///                                 "media"
///                               ]
///                             },
///                             "prompt_rate": {
///                               "type": [
///                                 "string",
///                                 "null"
///                               ]
///                             },
///                             "completion_rate": {
///                               "type": [
///                                 "string",
///                                 "null"
///                               ]
///                             },
///                             "state": {
///                               "type": "string",
///                               "enum": [
///                                 "paused",
///                                 "unqualified",
///                                 "qualified"
///                               ]
///                             },
///                             "media_rates": {
///                               "type": "array",
///                               "items": {
///                                 "type": "object"
///                               }
///                             }
///                           }
///                         }
///                       },
///                       "customer_charge_nanos": {
///                         "type": [
///                           "string",
///                           "null"
///                         ]
///                       },
///                       "earning_nanos": {
///                         "type": [
///                           "string",
///                           "null"
///                         ]
///                       },
///                       "settled_earning_nanos": {
///                         "type": [
///                           "string",
///                           "null"
///                         ]
///                       },
///                       "unsettled_earning_nanos": {
///                         "type": [
///                           "string",
///                           "null"
///                         ]
///                       },
///                       "cost_nanos": {
///                         "type": [
///                           "string",
///                           "null"
///                         ]
///                       },
///                       "margin_nanos": {
///                         "type": [
///                           "string",
///                           "null"
///                         ]
///                       },
///                       "unresolved_attempts": {
///                         "type": "string",
///                         "pattern": "^[0-9]+$"
///                       },
///                       "matched_attempts": {
///                         "type": "string",
///                         "pattern": "^[0-9]+$"
///                       },
///                       "cost_known_attempts": {
///                         "type": "string",
///                         "pattern": "^[0-9]+$"
///                       }
///                     },
///                     "required": [
///                       "supplier_id",
///                       "supplier_name",
///                       "model_alias",
///                       "currency",
///                       "offers",
///                       "customer_charge_nanos",
///                       "earning_nanos",
///                       "settled_earning_nanos",
///                       "unsettled_earning_nanos",
///                       "cost_nanos",
///                       "margin_nanos",
///                       "unresolved_attempts",
///                       "matched_attempts",
///                       "cost_known_attempts"
///                     ]
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid period or unknown currency"
///       },
///       "403": {
///         "description": "Platform administration required"
///       },
///       "401": {
///         "description": "Invalid credentials"
///       }
///     }
///   }
/// }
/// ```
pub async fn read(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<PositionQuery>,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    state.authorize_platform_headers(&headers).await?;
    let position = state
        .store
        .commercial_position(&query.currency, query.days.unwrap_or(30))
        .await
        .map_err(ApiError::from_store)?;
    Ok(([("cache-control", "no-store")], Json(position)))
}
