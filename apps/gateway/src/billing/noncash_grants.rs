//! Administrator noncash gifts; never merchant receipts or immediate revenue.
use super::{ApiError, AppState, HeaderMap, Json, Path, Query, State, Uuid, Value};
use niu_storage::{
    CustomerBalanceGrantPolicy, CustomerBalanceGrantPublication, OperatorAuditActor,
};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GrantInput {
    amount_nanos: String,
    reason: String,
    idempotency_key: Uuid,
    #[serde(default)]
    application_policy: CustomerBalanceGrantPolicy,
}

/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/billing/accounts/{currency}/grants",
///   "method": "post",
///   "operation": {
///     "operationId": "grantCustomerBalance",
///     "summary": "Issue administrator noncash customer credit",
///     "description": "Explicit platform administration required. Atomically records a positive gift and its immutable noncash memorandum, reason and authenticated actor. Issuance is not a payment receipt or revenue. application_policy defaults to future_only for compatibility. Explicit unpaid_credit_first applies the new gift against exact known unpaid credit charges as sales allowance, reducing revenue and receivable without repricing the charge or changing Supplier payable. Remaining gift funds future consumption. Unknown debt provenance rejects the complete publication. Refunds restore the corresponding gift before credit or cash, without evidence of an external cash transfer. Credit policy is unchanged. Exact retries using the same company-scoped idempotency key, currency, amount, reason and application policy return the original grant; differing reuse conflicts. Historical financial entries are never reclassified. No automatic retry.",
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
///         "name": "currency",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "pattern": "^[A-Z]{3}$"
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
///             "required": [
///               "amount_nanos",
///               "reason",
///               "idempotency_key"
///             ],
///             "properties": {
///               "application_policy": {
///                 "type": "string",
///                 "enum": ["future_only", "unpaid_credit_first"],
///                 "default": "future_only"
///               },
///               "amount_nanos": {
///                 "type": "string",
///                 "pattern": "^[1-9][0-9]{0,18}$",
///                 "description": "Positive exact currency nanounits, maximum 9223372036854775807."
///               },
///               "reason": {
///                 "type": "string",
///                 "minLength": 1,
///                 "maxLength": 500,
///                 "description": "Trimmed justification without control characters."
///               },
///               "idempotency_key": {
///                 "type": "string",
///                 "format": "uuid"
///               }
///             }
///           }
///         }
///       }
///     },
///     "responses": {
///       "200": {
///         "description": "Gift issued, or identical previously committed gift returned",
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
///                     "id",
///                     "application_policy",
///                     "applied_to_credit_nanos",
///                     "retained_for_future_consumption_nanos"
///                   ],
///                   "properties": {
///                     "application_policy": { "type": "string", "enum": ["future_only", "unpaid_credit_first"] },
///                     "applied_to_credit_nanos": { "type": "string", "pattern": "^[0-9]+$" },
///                     "retained_for_future_consumption_nanos": {
///                       "type": "string", "pattern": "^[0-9]+$",
///                       "description": "Original grant amount retained for future consumption at issuance, not current spendable balance."
///                     },
///                     "id": {
///                       "type": "string",
///                       "format": "uuid"
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid exact amount, currency or reason"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Explicit platform administration required"
///       },
///       "422": {
///         "description": "Malformed request body or unsupported application policy"
///       },
///       "409": {
///         "description": "Unknown company, conflicting idempotency intent or uncovered debt sources for unpaid_credit_first"
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub async fn issue(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization, currency)): Path<(Uuid, String)>,
    Json(input): Json<GrantInput>,
) -> Result<Json<Value>, ApiError> {
    let auth = state.authorize_platform_headers(&headers).await?;
    let actor = match auth {
        crate::state::AdminAuthorization::Installation => OperatorAuditActor::Installation,
        crate::state::AdminAuthorization::Operator(operator) => {
            OperatorAuditActor::Operator(operator.id)
        }
    };
    let amount = super::exact_nonnegative_integer(&input.amount_nanos)?;
    if amount == 0 || input.amount_nanos.starts_with('0') {
        return Err(ApiError::invalid_request(
            "Use a positive exact amount without leading zeroes",
        ));
    }
    let id = state
        .store
        .publish_customer_balance_grant_with_policy(
            organization,
            CustomerBalanceGrantPublication {
                currency: &currency,
                amount_nanos: amount,
                reason: &input.reason,
                idempotency_key: input.idempotency_key,
            },
            actor,
            input.application_policy,
        )
        .await
        .map_err(ApiError::from_store)?;
    let result = state
        .store
        .customer_balance_grant_result(organization, id)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(serde_json::json!({"data": result})))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PreparedPage {
    before: Option<Uuid>,
    limit: Option<i64>,
}

/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/billing/accounts/{currency}/grants/prepare",
///   "method": "post",
///   "operation": {
///     "operationId": "prepareCustomerBalanceGrant",
///     "summary": "Prepare a durable noncash gift intent",
///     "description": "Explicit platform administration only. Saves immutable amount, reason, currency, policy, authenticated actor and company-scoped idempotency key. Preparation posts no funds, revenue, receipt, debt application or reservation. Exact retries return the same intent; changed reuse conflicts. Existing matching grants can be recovered as issued. Publish through grantCustomerBalance with this saved input and original key. Prepared is not proof that an in-flight publication failed. Never invent another key because a response was lost. No automatic issuance. Internal references are not product labels.",
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
///         "name": "currency",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "pattern": "^[A-Z]{3}$"
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Durable intent state",
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
///                     "id",
///                     "idempotency_key",
///                     "currency",
///                     "amount_nanos",
///                     "reason",
///                     "created_at",
///                     "application_policy",
///                     "status",
///                     "result"
///                   ],
///                   "properties": {
///                     "id": {
///                       "type": "string",
///                       "format": "uuid"
///                     },
///                     "idempotency_key": {
///                       "type": "string",
///                       "format": "uuid"
///                     },
///                     "currency": {
///                       "type": "string"
///                     },
///                     "amount_nanos": {
///                       "type": "string"
///                     },
///                     "reason": {
///                       "type": "string"
///                     },
///                     "created_at": {
///                       "type": "string",
///                       "format": "date-time"
///                     },
///                     "application_policy": {
///                       "type": "string",
///                       "enum": [
///                         "future_only",
///                         "unpaid_credit_first"
///                       ]
///                     },
///                     "status": {
///                       "type": "string",
///                       "enum": [
///                         "prepared",
///                         "issued"
///                       ]
///                     },
///                     "result": {
///                       "type": [
///                         "object",
///                         "null"
///                       ],
///                       "required": [
///                         "id",
///                         "application_policy",
///                         "applied_to_credit_nanos",
///                         "retained_for_future_consumption_nanos"
///                       ],
///                       "properties": {
///                         "application_policy": {
///                           "type": "string",
///                           "enum": [
///                             "future_only",
///                             "unpaid_credit_first"
///                           ]
///                         },
///                         "applied_to_credit_nanos": {
///                           "type": "string",
///                           "pattern": "^[0-9]+$"
///                         },
///                         "retained_for_future_consumption_nanos": {
///                           "type": "string",
///                           "pattern": "^[0-9]+$",
///                           "description": "Original grant amount retained for future consumption at issuance, not current spendable balance."
///                         },
///                         "id": {
///                           "type": "string",
///                           "format": "uuid"
///                         }
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
///         "description": "Invalid amount, currency or page"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Platform administration required"
///       },
///       "422": {
///         "description": "Malformed body or unsupported application policy"
///       },
///       "409": {
///         "description": "Intent conflict, unknown company or invalid cursor"
///       }
///     },
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "amount_nanos",
///               "reason",
///               "idempotency_key"
///             ],
///             "properties": {
///               "application_policy": {
///                 "type": "string",
///                 "enum": [
///                   "future_only",
///                   "unpaid_credit_first"
///                 ],
///                 "default": "future_only"
///               },
///               "amount_nanos": {
///                 "type": "string",
///                 "pattern": "^[1-9][0-9]{0,18}$",
///                 "description": "Positive exact currency nanounits, maximum 9223372036854775807."
///               },
///               "reason": {
///                 "type": "string",
///                 "minLength": 1,
///                 "maxLength": 500,
///                 "description": "Trimmed justification without control characters."
///               },
///               "idempotency_key": {
///                 "type": "string",
///                 "format": "uuid"
///               }
///             }
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub async fn prepare(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization, currency)): Path<(Uuid, String)>,
    Json(input): Json<GrantInput>,
) -> Result<Json<Value>, ApiError> {
    let actor = match state.authorize_platform_headers(&headers).await? {
        crate::state::AdminAuthorization::Installation => OperatorAuditActor::Installation,
        crate::state::AdminAuthorization::Operator(operator) => {
            OperatorAuditActor::Operator(operator.id)
        }
    };
    let amount = super::exact_nonnegative_integer(&input.amount_nanos)?;
    if amount == 0 || input.amount_nanos.starts_with('0') {
        return Err(ApiError::invalid_request(
            "Use a positive exact amount without leading zeroes",
        ));
    }
    state
        .store
        .prepare_customer_balance_grant(
            organization,
            CustomerBalanceGrantPublication {
                currency: &currency,
                amount_nanos: amount,
                reason: &input.reason,
                idempotency_key: input.idempotency_key,
            },
            actor,
            input.application_policy,
        )
        .await
        .map_err(ApiError::from_store)?;
    let page = state
        .store
        .prepared_customer_balance_grants(
            organization,
            &currency,
            None,
            1,
            Some(input.idempotency_key),
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(serde_json::json!({"data":page["data"][0]})))
}

/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/billing/accounts/{currency}/grants/prepared",
///   "method": "get",
///   "operation": {
///     "operationId": "listPreparedCustomerBalanceGrants",
///     "summary": "Recover saved noncash grant publication intents",
///     "description": "Explicit platform administration only. Currency-scoped immutable intents newest first by creation time and UUID. Follow next_before as before; limit defaults to 50, maximum 100. A cursor outside this company/currency conflicts. Each page uses a bounded read snapshot; pages are live, not a cross-page snapshot. Issued derives from the committed matching grant; result is original issuance allocation, not current spendable balance. Prepared never proves an in-flight publication failed and never adds capacity. Reasons are platform-only. No cash references, customer content or credentials. Cache-Control no-store. Saved intent survives browser changes.",
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
///         "name": "currency",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "pattern": "^[A-Z]{3}$"
///         }
///       },
///       {
///         "name": "before",
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
///         "description": "Durable intent state",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data",
///                 "next_before"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "type": "object",
///                     "required": [
///                       "id",
///                       "idempotency_key",
///                       "currency",
///                       "amount_nanos",
///                       "reason",
///                       "created_at",
///                       "application_policy",
///                       "status",
///                       "result"
///                     ],
///                     "properties": {
///                       "id": {
///                         "type": "string",
///                         "format": "uuid"
///                       },
///                       "idempotency_key": {
///                         "type": "string",
///                         "format": "uuid"
///                       },
///                       "currency": {
///                         "type": "string"
///                       },
///                       "amount_nanos": {
///                         "type": "string"
///                       },
///                       "reason": {
///                         "type": "string"
///                       },
///                       "created_at": {
///                         "type": "string",
///                         "format": "date-time"
///                       },
///                       "application_policy": {
///                         "type": "string",
///                         "enum": [
///                           "future_only",
///                           "unpaid_credit_first"
///                         ]
///                       },
///                       "status": {
///                         "type": "string",
///                         "enum": [
///                           "prepared",
///                           "issued"
///                         ]
///                       },
///                       "result": {
///                         "type": [
///                           "object",
///                           "null"
///                         ],
///                         "required": [
///                           "id",
///                           "application_policy",
///                           "applied_to_credit_nanos",
///                           "retained_for_future_consumption_nanos"
///                         ],
///                         "properties": {
///                           "application_policy": {
///                             "type": "string",
///                             "enum": [
///                               "future_only",
///                               "unpaid_credit_first"
///                             ]
///                           },
///                           "applied_to_credit_nanos": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$"
///                           },
///                           "retained_for_future_consumption_nanos": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$",
///                             "description": "Original grant amount retained for future consumption at issuance, not current spendable balance."
///                           },
///                           "id": {
///                             "type": "string",
///                             "format": "uuid"
///                           }
///                         }
///                       }
///                     }
///                   }
///                 },
///                 "next_before": {
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
///         "description": "Invalid amount, currency or page"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Platform administration required"
///       },
///       "409": {
///         "description": "Intent conflict, unknown company or invalid cursor"
///       }
///     }
///   }
/// }
/// ```
pub async fn prepared(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization, currency)): Path<(Uuid, String)>,
    Query(page): Query<PreparedPage>,
) -> Result<Json<Value>, ApiError> {
    state.authorize_platform_headers(&headers).await?;
    let result = state
        .store
        .prepared_customer_balance_grants(
            organization,
            &currency,
            page.before,
            page.limit.unwrap_or(50),
            None,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(result))
}

/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/billing/accounts/{currency}/grants/prepared/{key}",
///   "method": "get",
///   "operation": {
///     "operationId": "getPreparedCustomerBalanceGrant",
///     "summary": "Read original noncash gift intent by idempotency key",
///     "description": "Explicit platform administration only. Exact company/currency/key read of saved intent and committed grant. Missing intent returns 404. Issued result contains original allocation; prepared means no matching grant in this snapshot, not proof an in-flight publication failed. Retry saved exact input with original key. Read creates no funds. Cache-Control no-store.",
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
///         "name": "currency",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "pattern": "^[A-Z]{3}$"
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
///     "responses": {
///       "200": {
///         "description": "Durable intent state",
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
///                     "id",
///                     "idempotency_key",
///                     "currency",
///                     "amount_nanos",
///                     "reason",
///                     "created_at",
///                     "application_policy",
///                     "status",
///                     "result"
///                   ],
///                   "properties": {
///                     "id": {
///                       "type": "string",
///                       "format": "uuid"
///                     },
///                     "idempotency_key": {
///                       "type": "string",
///                       "format": "uuid"
///                     },
///                     "currency": {
///                       "type": "string"
///                     },
///                     "amount_nanos": {
///                       "type": "string"
///                     },
///                     "reason": {
///                       "type": "string"
///                     },
///                     "created_at": {
///                       "type": "string",
///                       "format": "date-time"
///                     },
///                     "application_policy": {
///                       "type": "string",
///                       "enum": [
///                         "future_only",
///                         "unpaid_credit_first"
///                       ]
///                     },
///                     "status": {
///                       "type": "string",
///                       "enum": [
///                         "prepared",
///                         "issued"
///                       ]
///                     },
///                     "result": {
///                       "type": [
///                         "object",
///                         "null"
///                       ],
///                       "required": [
///                         "id",
///                         "application_policy",
///                         "applied_to_credit_nanos",
///                         "retained_for_future_consumption_nanos"
///                       ],
///                       "properties": {
///                         "application_policy": {
///                           "type": "string",
///                           "enum": [
///                             "future_only",
///                             "unpaid_credit_first"
///                           ]
///                         },
///                         "applied_to_credit_nanos": {
///                           "type": "string",
///                           "pattern": "^[0-9]+$"
///                         },
///                         "retained_for_future_consumption_nanos": {
///                           "type": "string",
///                           "pattern": "^[0-9]+$",
///                           "description": "Original grant amount retained for future consumption at issuance, not current spendable balance."
///                         },
///                         "id": {
///                           "type": "string",
///                           "format": "uuid"
///                         }
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
///         "description": "Invalid amount, currency or page"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Platform administration required"
///       },
///       "409": {
///         "description": "Intent conflict, unknown company or invalid cursor"
///       },
///       "404": {
///         "description": "No saved intent for this company/currency/key"
///       }
///     }
///   }
/// }
/// ```
pub async fn prepared_by_key(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization, currency, key)): Path<(Uuid, String, Uuid)>,
) -> Result<Json<Value>, ApiError> {
    state.authorize_platform_headers(&headers).await?;
    let page = state
        .store
        .prepared_customer_balance_grants(organization, &currency, None, 1, Some(key))
        .await
        .map_err(ApiError::from_store)?;
    let result = page["data"]
        .as_array()
        .and_then(|rows| rows.first())
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(serde_json::json!({"data":result})))
}
