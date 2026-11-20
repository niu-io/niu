//! Platform financial account discovery; never reused by customer routes.
use super::{ApiError, AppState, HeaderMap, Json, Query, State, Uuid, Value};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AccountPage {
    after: Option<Uuid>,
    limit: Option<i64>,
}

/// ```openapi
/// {
///   "path": "/api/v1/platform/customer-accounts",
///   "method": "get",
///   "operation": {
///     "operationId": "listPlatformCustomerAccounts",
///     "summary": "Discover named customer accounts and Credits summaries for platform financial administration",
///     "description": "Explicit platform administration only, independent of ordinary company membership. Named companies, their current currency balance summaries, and a standard-unit Credits summary when issued lots exist; companies without accounts have an empty accounts array. The Credits summary exposes no atoms, lots or provenance. It is a display summary, not a spendable-capacity guarantee; the organization unit-balance endpoint remains authoritative for exact lot and expiry detail. No payment references, transactions, customer request content, Provider costs or credentials. Shares customer balance arithmetic: available equals posted balance plus approved credit minus outstanding request liability. Approval is not a cash receipt. UUID references are routing-only, never display labels. Company UUID keyset order; limit defaults to 50, maximum 100 companies. Pass next_after unchanged as after; missing cursor returns 409. Each page has one bounded read snapshot, separate pages do not share it; concurrent inserts before the cursor require refreshing. No funds, accounts or policies are created. Cache-Control no-store.",
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
///         "description": "Named company account page",
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
///                       "accounts",
///                       "credits"
///                     ],
///                     "properties": {
///                       "organization_id": {
///                         "type": "string",
///                         "format": "uuid"
///                       },
///                       "organization_name": {
///                         "type": "string"
///                       },
///                       "accounts": {
///                         "type": "array",
///                         "items": {
///                           "type": "object",
///                           "required": [
///                             "currency",
///                             "balance_nanos",
///                             "reserved_nanos",
///                             "outstanding_nanos",
///                             "available_nanos",
///                             "credit_limit_nanos",
///                             "policy_revision",
///                             "warning_threshold_nanos",
///                             "low_balance",
///                             "posted_credit_exhausted"
///                           ],
///                           "properties": {
///                             "currency": {
///                               "type": "string"
///                             },
///                             "balance_nanos": {
///                               "type": "string"
///                             },
///                             "reserved_nanos": {
///                               "type": "string"
///                             },
///                             "outstanding_nanos": {
///                               "type": "string"
///                             },
///                             "available_nanos": {
///                               "type": "string"
///                             },
///                             "credit_limit_nanos": {
///                               "type": "string"
///                             },
///                             "policy_revision": {
///                               "type": "string"
///                             },
///                             "warning_threshold_nanos": {
///                               "type": [
///                                 "string",
///                                 "null"
///                               ]
///                             },
///                             "low_balance": {
///                               "type": "boolean"
///                             },
///                             "posted_credit_exhausted": {
///                               "type": "boolean"
///                             }
///                           }
///                         }
///                       },
///                       "credits": {
///                         "type": [
///                           "object",
///                           "null"
///                         ],
///                         "description": "Largest positive standard-unit Credits balance summary; the current definition breaks equal-amount ties. Null when the company has no issued Credits lots. Exact decimal string in standard units; no atoms, lots or provenance. additional_units counts other unit definitions with a positive balance.",
///                         "additionalProperties": false,
///                         "required": [
///                           "name",
///                           "display_precision",
///                           "available",
///                           "additional_units"
///                         ],
///                         "properties": {
///                           "name": {
///                             "type": "string"
///                           },
///                           "display_precision": {
///                             "type": "integer",
///                             "minimum": 0,
///                             "maximum": 9
///                           },
///                           "available": {
///                             "type": "string",
///                             "pattern": "^-?[0-9]+(?:\\.[0-9]+)?$"
///                           },
///                           "additional_units": {
///                             "type": "integer",
///                             "minimum": 0
///                           }
///                         }
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
pub async fn list(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(page): Query<AccountPage>,
) -> Result<Json<Value>, ApiError> {
    state.authorize_platform_headers(&headers).await?;
    let result = state
        .store
        .platform_customer_accounts(page.after, page.limit.unwrap_or(50))
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(result))
}
