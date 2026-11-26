//! Platform financial account discovery; never reused by customer routes.
use super::{ApiError, AppState, HeaderMap, Json, Path, Query, State, Uuid, Value};
use niu_storage::{CustomerPricingItemInput, OperatorAuditActor};
use serde::Deserialize;
use serde_json::json;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AccountPage {
    after: Option<Uuid>,
    limit: Option<i64>,
    q: Option<String>,
    kind: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SetCustomerPricingRequest {
    items: Vec<CustomerPricingItemInput>,
}

async fn actor(state: &AppState, headers: &HeaderMap) -> Result<OperatorAuditActor, ApiError> {
    Ok(match state.authorize_platform_headers(headers).await? {
        crate::state::AdminAuthorization::Installation => OperatorAuditActor::Installation,
        crate::state::AdminAuthorization::Operator(member) => {
            OperatorAuditActor::Operator(member.id)
        }
    })
}

/// ```openapi
/// {
///   "path": "/api/v1/admin/customers",
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
///       },
///       {
///         "name": "q",
///         "in": "query",
///         "description": "Optional case-insensitive substring filter matching customer name, slug, or active member name/email (up to 120 characters).",
///         "schema": {
///           "type": "string",
///           "maxLength": 120
///         }
///       },
///       {
///         "name": "kind",
///         "in": "query",
///         "description": "Optional customer account kind filter: personal or organization.",
///         "schema": {
///           "type": "string",
///           "enum": ["personal", "organization"]
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
///                       "slug": { "type": "string", "description": "Stable customer URL slug." },
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
///                             "unlimited_credit",
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
///                             "unlimited_credit": {
///                               "type": "boolean"
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
    let query = page
        .q
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    if query.is_some_and(|value| value.chars().count() > 120) {
        return Err(ApiError::invalid_request(
            "Search query must be at most 120 characters",
        ));
    }
    let kind = page
        .kind
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    if let Some(value) = kind
        && !matches!(value, "personal" | "organization")
    {
        return Err(ApiError::invalid_request(
            "kind must be personal or organization",
        ));
    }
    let result = state
        .store
        .platform_customer_accounts(page.after, page.limit.unwrap_or(50), query, kind)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(result))
}

/// ```openapi
/// {
///   "path": "/api/v1/admin/customers/{customer}",
///   "method": "get",
///   "operation": {
///     "operationId": "getPlatformCustomer",
///     "summary": "Read one customer company's overview, balances, workspaces, members, and recent billing activity",
///     "description": "Explicit platform administration required. Returns one named customer company with its currency accounts, Credits summary, owner/members, workspaces, active custom price count, and recent customer-facing balance entries in a single bounded read snapshot. Returns 404 when the organization does not exist.",
///     "x-niu-implementation": "implemented",
///     "security": [{ "bearerAuth": [] }],
///     "parameters": [
///       {
///         "name": "customer",
///         "in": "path",
///         "required": true,
///         "description": "Stable customer slug or legacy organization UUID.",
///         "schema": { "type": "string" }
///       }
///     ],
///     "responses": {
///       "200": { "description": "Customer company summary" },
///       "401": { "description": "Authentication required" },
///       "403": { "description": "Platform administration required" },
///       "404": { "description": "Customer not found" }
///     }
///   }
/// }
/// ```
pub async fn get_customer(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(customer): Path<String>,
) -> Result<Json<Value>, ApiError> {
    state.authorize_platform_headers(&headers).await?;
    let data = state
        .store
        .platform_customer_account(customer)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(json!({ "data": data })))
}

/// ```openapi
/// {
///   "path": "/api/v1/admin/customers/{customer}/pricing",
///   "method": "get",
///   "operation": {
///     "operationId": "listPlatformCustomerPricing",
///     "summary": "List platform standard prices paired with one customer's active customer-specific prices",
///     "description": "Explicit platform administration required. Returns every published platform standard price along with this customer's active or scheduled customer-specific selling schedule in one bounded read snapshot. Never exposes supplier procurement prices or other customers' schedules.",
///     "x-niu-implementation": "implemented",
///     "security": [{ "bearerAuth": [] }],
///     "parameters": [
///       {
///         "name": "customer",
///         "in": "path",
///         "required": true,
///         "schema": { "type": "string", "format": "uuid" }
///       }
///     ],
///     "responses": {
///       "200": { "description": "Customer pricing overview" },
///       "401": { "description": "Authentication required" },
///       "403": { "description": "Platform administration required" },
///       "404": { "description": "Customer not found" }
///     }
///   }
/// }
/// ```
pub async fn get_customer_pricing(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(customer): Path<Uuid>,
) -> Result<Json<Value>, ApiError> {
    state.authorize_platform_headers(&headers).await?;
    let data = state
        .store
        .platform_customer_pricing(customer)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(json!({ "data": data })))
}

/// ```openapi
/// {
///   "path": "/api/v1/admin/customers/{customer}/pricing",
///   "method": "put",
///   "operation": {
///     "operationId": "setPlatformCustomerPricing",
///     "summary": "Atomically set or reset customer-specific model prices",
///     "description": "Explicit platform administration required. Atomically retires prior active/scheduled customer-specific rules on each targeted standard price and publishes the explicit replacement selling schedule (never exceeding platform standard price). Passing schedule as null resets the model to platform standard pricing.",
///     "x-niu-implementation": "implemented",
///     "security": [{ "bearerAuth": [] }],
///     "parameters": [
///       {
///         "name": "customer",
///         "in": "path",
///         "required": true,
///         "schema": { "type": "string", "format": "uuid" }
///       }
///     ],
///     "responses": {
///       "200": { "description": "Updated customer pricing summary" },
///       "400": { "description": "Invalid selling schedule" },
///       "401": { "description": "Authentication required" },
///       "403": { "description": "Platform administration required" },
///       "404": { "description": "Customer or standard price not found" }
///     }
///   }
/// }
/// ```
pub async fn set_customer_pricing(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(customer): Path<Uuid>,
    Json(body): Json<SetCustomerPricingRequest>,
) -> Result<Json<Value>, ApiError> {
    let actor = actor(&state, &headers).await?;
    let data = state
        .store
        .set_platform_customer_pricing(customer, body.items, actor)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(json!({ "data": data })))
}

/// ```openapi
/// {
///   "path": "/api/v1/admin/customers/{customer}/pricing/{price}",
///   "method": "delete",
///   "operation": {
///     "operationId": "resetPlatformCustomerModelPricing",
///     "summary": "Reset one model's customer-specific price back to platform standard pricing",
///     "description": "Explicit platform administration required. Retires active or scheduled customer-specific selling schedules for the specified customer and standard price, returning future requests to platform standard pricing without altering historical request charges.",
///     "x-niu-implementation": "implemented",
///     "security": [{ "bearerAuth": [] }],
///     "parameters": [
///       {
///         "name": "customer",
///         "in": "path",
///         "required": true,
///         "schema": { "type": "string", "format": "uuid" }
///       },
///       {
///         "name": "price",
///         "in": "path",
///         "required": true,
///         "schema": { "type": "string", "format": "uuid" }
///       }
///     ],
///     "responses": {
///       "200": { "description": "Customer model pricing reset" },
///       "401": { "description": "Authentication required" },
///       "403": { "description": "Platform administration required" },
///       "404": { "description": "Customer or standard price not found" }
///     }
///   }
/// }
/// ```
pub async fn reset_customer_model_pricing(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((customer, price)): Path<(Uuid, Uuid)>,
) -> Result<Json<Value>, ApiError> {
    let actor = actor(&state, &headers).await?;
    let data = state
        .store
        .reset_platform_customer_model_pricing(customer, price, actor)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(json!({ "data": data })))
}
