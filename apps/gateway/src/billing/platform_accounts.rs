//! Platform financial account discovery; never reused by customer routes.
use super::{ApiError, AppState, HeaderMap, Json, Path, Query, State, Uuid, Value};
use axum::http::StatusCode;
use niu_storage::{CustomerOwnerOnboarding, CustomerPricingItemInput, OperatorAuditActor};
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

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OnboardCustomerOwnerInput {
    #[serde(default)]
    name: Option<String>,
    email: String,
    password: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OnboardCustomerInput {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    account_kind: Option<String>,
    #[serde(default = "default_true")]
    create_default_workspace: bool,
    #[serde(default)]
    owner: Option<OnboardCustomerOwnerInput>,
    #[serde(default)]
    trial_credit_nanos: Option<String>,
}

fn default_true() -> bool {
    true
}

/// ```openapi
/// {
///   "path": "/api/v1/admin/customers",
///   "method": "post",
///   "operation": {
///     "operationId": "onboardPlatformCustomer",
///     "summary": "Atomically onboard a customer account, Default workspace, optional owner sign-in, and optional trial credit",
///     "description": "Explicit platform administration required. Commits the customer organization (or personal customer account), its currency balance account, optional Default workspace, optional owner sign-in credential (8 to 1024 bytes), and optional noncash trial credit grant in a single PostgreSQL transaction. Any validation or duplicate-email error rolls back completely without leaving partial organizations, workspaces, or operators. Supports Idempotency-Key for safe network retries.",
///     "x-niu-implementation": "implemented",
///     "security": [{ "bearerAuth": [] }],
///     "parameters": [
///       {
///         "in": "header",
///         "name": "Idempotency-Key",
///         "required": false,
///         "schema": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 128,
///           "pattern": "^[!-~]+$"
///         }
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
///               "name": { "type": "string", "minLength": 1, "maxLength": 200 },
///               "account_kind": { "type": "string", "enum": ["personal", "organization"], "default": "organization" },
///               "create_default_workspace": { "type": "boolean", "default": true },
///               "owner": {
///                 "type": ["object", "null"],
///                 "additionalProperties": false,
///                 "required": ["email", "password"],
///                 "properties": {
///                   "name": { "type": ["string", "null"], "maxLength": 200 },
///                   "email": { "type": "string", "maxLength": 254 },
///                   "password": { "type": "string", "minLength": 8, "maxLength": 1024, "writeOnly": true }
///                 }
///               },
///               "trial_credit_nanos": {
///                 "type": ["string", "null"],
///                 "pattern": "^[1-9][0-9]{0,18}$"
///               }
///             }
///           }
///         }
///       }
///     },
///     "responses": {
///       "201": {
///         "description": "Customer onboarded atomically (or identical idempotent replay returned)"
///       },
///       "400": { "description": "Invalid customer name, email, password, or trial credit amount" },
///       "401": { "description": "Authentication required" },
///       "403": { "description": "Platform administration required" },
///       "409": { "description": "Owner email is already registered or Idempotency-Key reused with different input" }
///     }
///   }
/// }
/// ```
pub async fn onboard_customer(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<OnboardCustomerInput>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let actor = actor(&state, &headers).await?;
    let creation_key = crate::admin::creation_idempotency_key(&headers)?;
    let account_kind = match input.account_kind.as_deref() {
        None | Some("organization") => "organization",
        Some("personal") => "personal",
        Some(_) => {
            return Err(ApiError::invalid_request(
                "account_kind must be personal or organization",
            ));
        }
    };
    let currency = state
        .store
        .platform_currency()
        .await
        .map_err(ApiError::from_store)?
        .unwrap_or_else(|| "USD".to_owned());

    let trial_credit_nanos = match input.trial_credit_nanos.as_deref() {
        None | Some("") => None,
        Some(raw) => {
            if raw.starts_with('0') {
                return Err(ApiError::invalid_request(
                    "trial_credit_nanos must be a positive exact integer without leading zeroes",
                ));
            }
            let nanos = super::exact_nonnegative_integer(raw)?;
            if nanos <= 0 {
                return Err(ApiError::invalid_request(
                    "trial_credit_nanos must be positive",
                ));
            }
            Some(nanos)
        }
    };

    let explicit_name = input
        .name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());

    let prepared_owner = match input.owner {
        Some(owner_in) => {
            let trimmed_email = owner_in.email.trim();
            if !niu_storage::is_valid_email_address(trimmed_email) {
                return Err(ApiError::invalid_request("Enter a valid email address"));
            }
            let email_prefix = trimmed_email
                .split('@')
                .next()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .unwrap_or(trimmed_email);
            let owner_name = owner_in
                .name
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .or(explicit_name)
                .unwrap_or(email_prefix)
                .to_owned();
            let password_hash = crate::admin::passwords::hash_member_password_for_admin(
                &state,
                &headers,
                owner_in.password,
            )
            .await?;
            Some((owner_name, trimmed_email.to_owned(), password_hash))
        }
        None => None,
    };

    let customer_name = explicit_name
        .map(str::to_owned)
        .or_else(|| {
            prepared_owner
                .as_ref()
                .map(|(owner_name, _, _)| owner_name.clone())
        })
        .ok_or_else(|| ApiError::invalid_request("Customer name is required"))?;

    let created = state
        .store
        .onboard_platform_customer(
            &customer_name,
            account_kind,
            &currency,
            input.create_default_workspace,
            prepared_owner
                .as_ref()
                .map(|(name, email, password_hash)| CustomerOwnerOnboarding {
                    name,
                    email,
                    password_hash,
                }),
            trial_credit_nanos,
            creation_key.as_deref(),
            actor,
        )
        .await
        .map_err(ApiError::from_store)?;

    Ok((StatusCode::CREATED, Json(json!({ "data": created }))))
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
