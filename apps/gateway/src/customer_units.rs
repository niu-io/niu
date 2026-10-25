//! Branded-unit configuration, exact balance reads and explicit noncash grants.
//! Configuration publication never activates billing mode or converts money.
use crate::{
    error::ApiError,
    state::{AdminAuthorization, AppState},
};
use axum::{
    Json,
    extract::{Path, State},
    http::HeaderMap,
};
use niu_metered_cost::CreditConversion;
use niu_storage::{CustomerUnitDefinitionInput, CustomerUnitPurchaseRuleInput, OperatorAuditActor};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DefinitionInput {
    name: String,
    display_precision: i16,
    expected_revision: String,
    idempotency_key: Uuid,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PurchaseRuleInput {
    definition_revision: String,
    payment_currency: String,
    numerator: String,
    denominator: String,
    expected_revision: String,
    idempotency_key: Uuid,
}

fn exact_integer(value: &str) -> Result<i64, ApiError> {
    if value.is_empty()
        || value.len() > 19
        || !value.bytes().all(|b| b.is_ascii_digit())
        || (value.len() > 1 && value.starts_with('0'))
    {
        return Err(ApiError::invalid_request(
            "Use a canonical nonnegative decimal integer string",
        ));
    }
    value
        .parse()
        .map_err(|_| ApiError::invalid_request("Integer exceeds the supported range"))
}

fn actor(auth: AdminAuthorization) -> OperatorAuditActor {
    match auth {
        AdminAuthorization::Installation => OperatorAuditActor::Installation,
        AdminAuthorization::Operator(operator) => OperatorAuditActor::Operator(operator.id),
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RefundInput {
    credit_atoms: String,
    reason: String,
    idempotency_key: Uuid,
}

/// ```openapi
/// {
///   "path": "/api/v1/organizations/{organization}/billing/units/charges/{attempt}/refunds",
///   "method": "post",
///   "operation": {
///     "operationId": "refundCustomerUnitCharge",
///     "summary": "Restore original consumed Credits ranges",
///     "description": "Platform administration required. Restores the next unrefunded prefix of an original resolved charge. Original source, definition and expiry remain unchanged; expired restored units stay expired. Purchase conversion and current tariffs are never used. Identical idempotent replay returns the original immutable receipt; conflicting replay and cumulative over-refund are rejected. Concurrent refunds serialize on the unit account. This does not execute an external payment refund, reverse a purchase, or release an unresolved inference hold. No monetary backing or procurement information is returned. Quantities are exact decimal strings.",
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
///         "name": "attempt",
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
///             "additionalProperties": false,
///             "required": [
///               "credit_atoms",
///               "reason",
///               "idempotency_key"
///             ],
///             "properties": {
///               "credit_atoms": {
///                 "type": "string",
///                 "pattern": "^[1-9][0-9]*$"
///               },
///               "reason": {
///                 "type": "string",
///                 "minLength": 1,
///                 "maxLength": 500
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
///         "description": "Original immutable refund receipt",
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
///                   "additionalProperties": false,
///                   "required": [
///                     "id",
///                     "credit_atoms",
///                     "reason",
///                     "atoms_per_unit",
///                     "created_at",
///                     "sources"
///                   ],
///                   "properties": {
///                     "id": {
///                       "type": "string",
///                       "format": "uuid"
///                     },
///                     "credit_atoms": {
///                       "type": "string"
///                     },
///                     "reason": {
///                       "type": "string"
///                     },
///                     "atoms_per_unit": {
///                       "type": "string",
///                       "const": "1000000000"
///                     },
///                     "created_at": {
///                       "type": "string",
///                       "format": "date-time"
///                     },
///                     "sources": {
///                       "type": "array",
///                       "items": {
///                         "type": "object",
///                         "additionalProperties": false,
///                         "required": [
///                           "credit_atoms",
///                           "definition_revision",
///                           "name",
///                           "display_precision",
///                           "provenance",
///                           "expires_at_ms"
///                         ],
///                         "properties": {
///                           "credit_atoms": {
///                             "type": "string"
///                           },
///                           "definition_revision": {
///                             "type": "string"
///                           },
///                           "name": {
///                             "type": "string"
///                           },
///                           "display_precision": {
///                             "type": "integer"
///                           },
///                           "provenance": {
///                             "type": "string",
///                             "enum": [
///                               "purchased",
///                               "promotional",
///                               "simulated"
///                             ]
///                           },
///                           "expires_at_ms": {
///                             "type": [
///                               "string",
///                               "null"
///                             ]
///                           }
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
///         "description": "Invalid exact quantity or reason"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Platform administration required"
///       },
///       "404": {
///         "description": "No Credits reservation in the specified organization"
///       },
///       "409": {
///         "description": "Unresolved or released charge, over-refund or conflicting retry"
///       },
///       "422": {
///         "description": "Malformed request"
///       },
///       "503": {
///         "description": "Storage unavailable"
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub async fn refund_charge(
    State(state): State<AppState>,
    Path((organization, attempt)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    Json(input): Json<RefundInput>,
) -> Result<Json<Value>, ApiError> {
    let auth = state.authorize_platform_headers(&headers).await?;
    let data = state
        .store
        .refund_customer_unit_charge(
            organization,
            attempt,
            exact_integer(&input.credit_atoms)?,
            &input.reason,
            input.idempotency_key,
            actor(auth),
        )
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(json!({"data": data})))
}

/// ```openapi
/// {
///   "path": "/api/v1/organizations/{organization}/billing/units",
///   "method": "get",
///   "operation": {
///     "operationId": "getCustomerUnitBalance",
///     "summary": "Read exact Credits quantities by original definition and provenance",
///     "description": "Organization-wide billing owner/admin or installation read access required. One database statement reports original issuance, unresolved held ranges, gross charged ranges, original-range restorations, expired unheld remainder and available unexpired remainder. Expiry never releases an unresolved request hold or renews a restored lot. For each group, issued + restored = held + charged + expired + available. A balance is not proof that inference routes, tariffs or admission are configured. Historical unit definitions remain separate. No payment backing, procurement rates or financial margin enters this response. Quantities are exact decimal strings; an empty array means no issuance. Reads do not activate Credits or convert monetary balances.",
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
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Current unit balance snapshot",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "object",
///                   "additionalProperties": false,
///                   "required": [
///                     "billing_mode",
///                     "atoms_per_unit",
///                     "balances"
///                   ],
///                   "properties": {
///                     "billing_mode": {
///                       "type": "string",
///                       "enum": [
///                         "currency",
///                         "credits"
///                       ]
///                     },
///                     "atoms_per_unit": {
///                       "type": "string",
///                       "const": "1000000000"
///                     },
///                     "balances": {
///                       "type": "array",
///                       "items": {
///                         "type": "object",
///                         "additionalProperties": false,
///                         "required": [
///                           "definition_revision",
///                           "name",
///                           "display_precision",
///                           "provenance",
///                           "issued_atoms",
///                           "held_atoms",
///                           "charged_atoms",
///                           "restored_atoms",
///                           "expired_atoms",
///                           "available_atoms"
///                         ],
///                         "properties": {
///                           "definition_revision": {
///                             "type": "string",
///                             "pattern": "^[1-9][0-9]*$"
///                           },
///                           "name": {
///                             "type": "string"
///                           },
///                           "display_precision": {
///                             "type": "integer",
///                             "minimum": 0,
///                             "maximum": 9
///                           },
///                           "provenance": {
///                             "type": "string",
///                             "enum": [
///                               "purchased",
///                               "promotional",
///                               "simulated"
///                             ]
///                           },
///                           "issued_atoms": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$",
///                             "description": "Exact nonnegative integer atoms. May exceed signed 64-bit range when aggregated across lots."
///                           },
///                           "held_atoms": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$",
///                             "description": "Exact nonnegative integer atoms. May exceed signed 64-bit range when aggregated across lots."
///                           },
///                           "charged_atoms": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$",
///                             "description": "Exact nonnegative integer atoms. May exceed signed 64-bit range when aggregated across lots."
///                           },
///                           "restored_atoms": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$",
///                             "description": "Exact nonnegative integer atoms. May exceed signed 64-bit range when aggregated across lots."
///                           },
///                           "expired_atoms": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$",
///                             "description": "Exact nonnegative integer atoms. May exceed signed 64-bit range when aggregated across lots."
///                           },
///                           "available_atoms": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$",
///                             "description": "Exact nonnegative integer atoms. May exceed signed 64-bit range when aggregated across lots."
///                           }
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
///       "401": {
///         "description": "Authentication unavailable or revoked"
///       },
///       "403": {
///         "description": "Management read access required"
///       },
///       "404": {
///         "description": "Company absent or outside permitted billing scope"
///       },
///       "503": {
///         "description": "Storage unavailable"
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub async fn balance(
    State(state): State<AppState>,
    Path(organization): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let auth = state
        .authorize_admin_headers(&headers, niu_storage::AdminPermission::Read)
        .await?;
    if !auth.permits_billing_account(organization) {
        return Err(ApiError::not_found());
    }
    let data = state
        .store
        .customer_unit_balance(organization)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(json!({"data":data})))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GrantInput {
    definition_revision: String,
    credit_atoms: String,
    provenance: String,
    reason: String,
    expires_at_ms: Option<String>,
    idempotency_key: Uuid,
}

/// ```openapi
/// {
///   "path": "/api/v1/organizations/{organization}/billing/units/grants",
///   "method": "post",
///   "operation": {
///     "operationId": "issueCustomerUnitGrant",
///     "summary": "Issue noncash Credits with an immutable provenance and expiry",
///     "description": "Platform administration required. New issuance requires active Credits mode and the current unit definition. Promotional and simulated grants have zero monetary backing and create neither a payment receipt nor a monetary balance entry. Provide a customer-appropriate reason. Expiry is optional and must be in the future when new issuance commits. Reusing an idempotency key with the same semantic input returns the original grant without extending expiry, even after expiry or later unit publications. Different input conflicts. The returned amount is original issuance, not current spendable capacity. Purchased provenance is reserved for independently verified payments. Operator authority is rechecked under a transaction lock.",
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
///               "definition_revision",
///               "credit_atoms",
///               "provenance",
///               "reason",
///               "idempotency_key"
///             ],
///             "properties": {
///               "definition_revision": {
///                 "type": "string",
///                 "pattern": "^[1-9][0-9]{0,18}$",
///                 "description": "Exact positive decimal integer, at most 9223372036854775807."
///               },
///               "credit_atoms": {
///                 "type": "string",
///                 "pattern": "^[1-9][0-9]{0,18}$",
///                 "description": "Exact positive decimal integer, at most 9223372036854775807."
///               },
///               "provenance": {
///                 "type": "string",
///                 "enum": [
///                   "promotional",
///                   "simulated"
///                 ]
///               },
///               "reason": {
///                 "type": "string",
///                 "minLength": 1,
///                 "maxLength": 500
///               },
///               "expires_at_ms": {
///                 "type": [
///                   "string",
///                   "null"
///                 ],
///                 "pattern": "^[1-9][0-9]{0,14}$",
///                 "description": "Optional future Unix milliseconds, at most 253402300799000. Null means no expiry."
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
///         "description": "Original immutable grant",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "object",
///                   "additionalProperties": false,
///                   "required": [
///                     "definition_revision",
///                     "credit_atoms",
///                     "provenance",
///                     "reason",
///                     "expires_at_ms",
///                     "id",
///                     "name",
///                     "display_precision",
///                     "atoms_per_unit",
///                     "created_at"
///                   ],
///                   "properties": {
///                     "definition_revision": {
///                       "type": "string",
///                       "pattern": "^[1-9][0-9]{0,18}$",
///                       "description": "Exact positive decimal integer, at most 9223372036854775807."
///                     },
///                     "credit_atoms": {
///                       "type": "string",
///                       "pattern": "^[1-9][0-9]{0,18}$",
///                       "description": "Exact positive decimal integer, at most 9223372036854775807."
///                     },
///                     "provenance": {
///                       "type": "string",
///                       "enum": [
///                         "promotional",
///                         "simulated"
///                       ]
///                     },
///                     "reason": {
///                       "type": "string",
///                       "minLength": 1,
///                       "maxLength": 500
///                     },
///                     "expires_at_ms": {
///                       "type": [
///                         "string",
///                         "null"
///                       ],
///                       "pattern": "^[1-9][0-9]{0,14}$",
///                       "description": "Optional future Unix milliseconds, at most 253402300799000. Null means no expiry."
///                     },
///                     "id": {
///                       "type": "string",
///                       "format": "uuid"
///                     },
///                     "name": {
///                       "type": "string"
///                     },
///                     "display_precision": {
///                       "type": "integer",
///                       "minimum": 0,
///                       "maximum": 9
///                     },
///                     "atoms_per_unit": {
///                       "type": "string",
///                       "const": "1000000000"
///                     },
///                     "created_at": {
///                       "type": "string",
///                       "format": "date-time"
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid unit, quantity, provenance, reason or expiry"
///       },
///       "401": {
///         "description": "Authentication unavailable or revoked"
///       },
///       "403": {
///         "description": "Platform administration required"
///       },
///       "409": {
///         "description": "Credits mode inactive, stale definition, missing company or conflicting idempotency input"
///       },
///       "422": {
///         "description": "Malformed request"
///       },
///       "503": {
///         "description": "Storage unavailable"
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub async fn issue_grant(
    State(state): State<AppState>,
    Path(organization): Path<Uuid>,
    headers: HeaderMap,
    Json(input): Json<GrantInput>,
) -> Result<Json<Value>, ApiError> {
    let auth = state.authorize_platform_headers(&headers).await?;
    let data = state
        .store
        .issue_customer_unit_grant(
            organization,
            niu_storage::CustomerUnitGrantInput {
                definition_revision: exact_integer(&input.definition_revision)?,
                credit_atoms: exact_integer(&input.credit_atoms)?,
                provenance: &input.provenance,
                reason: &input.reason,
                expires_at_ms: input
                    .expires_at_ms
                    .as_deref()
                    .map(exact_integer)
                    .transpose()?,
                idempotency_key: input.idempotency_key,
            },
            actor(auth),
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data": data})))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct QuoteInput {
    rule_revision: String,
    payment_nanos: String,
    idempotency_key: Uuid,
}

/// ```openapi
/// {
///   "path": "/api/v1/organizations/{organization}/billing/quotes",
///   "method": "post",
///   "operation": {
///     "operationId": "prepareCustomerUnitQuote",
///     "summary": "Prepare an exact versioned Credits purchase quote",
///     "description": "Platform administration required. A saved preview does not activate Credits, issue units, create a payment or prove processor amount eligibility. New quotes require the latest rule for its payment currency and latest definition. Inexact conversions and overflow are rejected. The quote pins amount, rule and unit definition for fifteen minutes. Identical idempotent retries retain the original quote and expiry even after rule changes or expiry; checkout must separately enforce validity. Reading historical quotes does not revalue them. No procurement data is returned.",
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
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Original immutable quote",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "object",
///                   "additionalProperties": false,
///                   "required": [
///                     "rule_revision",
///                     "definition_revision",
///                     "payment_nanos",
///                     "credit_atoms",
///                     "numerator",
///                     "denominator",
///                     "id",
///                     "payment_currency",
///                     "name",
///                     "display_precision",
///                     "atoms_per_unit",
///                     "created_at",
///                     "expires_at"
///                   ],
///                   "properties": {
///                     "rule_revision": {
///                       "type": "string",
///                       "pattern": "^[1-9][0-9]{0,18}$",
///                       "description": "Exact positive integer at most 9223372036854775807."
///                     },
///                     "definition_revision": {
///                       "type": "string",
///                       "pattern": "^[1-9][0-9]{0,18}$",
///                       "description": "Exact positive integer at most 9223372036854775807."
///                     },
///                     "payment_nanos": {
///                       "type": "string",
///                       "pattern": "^[1-9][0-9]{0,18}$",
///                       "description": "Exact positive integer at most 9223372036854775807."
///                     },
///                     "credit_atoms": {
///                       "type": "string",
///                       "pattern": "^[1-9][0-9]{0,18}$",
///                       "description": "Exact positive integer at most 9223372036854775807."
///                     },
///                     "numerator": {
///                       "type": "string",
///                       "pattern": "^[1-9][0-9]{0,18}$",
///                       "description": "Exact positive integer at most 9223372036854775807."
///                     },
///                     "denominator": {
///                       "type": "string",
///                       "pattern": "^[1-9][0-9]{0,18}$",
///                       "description": "Exact positive integer at most 9223372036854775807."
///                     },
///                     "id": {
///                       "type": "string",
///                       "format": "uuid"
///                     },
///                     "payment_currency": {
///                       "type": "string",
///                       "pattern": "^[A-Z]{3}$"
///                     },
///                     "name": {
///                       "type": "string"
///                     },
///                     "display_precision": {
///                       "type": "integer",
///                       "minimum": 0,
///                       "maximum": 9
///                     },
///                     "atoms_per_unit": {
///                       "type": "string",
///                       "const": "1000000000"
///                     },
///                     "created_at": {
///                       "type": "string",
///                       "format": "date-time"
///                     },
///                     "expires_at": {
///                       "type": "string",
///                       "format": "date-time"
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid amount, inexact conversion or overflow"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Platform administration required"
///       },
///       "404": {
///         "description": "Quote not found in the requested organization"
///       },
///       "409": {
///         "description": "Stale rule, missing organization or conflicting idempotency input"
///       },
///       "422": {
///         "description": "Malformed request body"
///       },
///       "503": {
///         "description": "Storage unavailable"
///       }
///     },
///     "x-niu-implementation": "implemented",
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "rule_revision",
///               "payment_nanos",
///               "idempotency_key"
///             ],
///             "properties": {
///               "rule_revision": {
///                 "type": "string",
///                 "pattern": "^[1-9][0-9]{0,18}$",
///                 "description": "Exact positive integer at most 9223372036854775807."
///               },
///               "payment_nanos": {
///                 "type": "string",
///                 "pattern": "^[1-9][0-9]{0,18}$",
///                 "description": "Exact positive integer at most 9223372036854775807."
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
pub async fn prepare_quote(
    State(state): State<AppState>,
    Path(organization): Path<Uuid>,
    headers: HeaderMap,
    Json(input): Json<QuoteInput>,
) -> Result<Json<Value>, ApiError> {
    let auth = state.authorize_platform_headers(&headers).await?;
    let data = state
        .store
        .prepare_customer_unit_quote(
            organization,
            niu_storage::CustomerUnitQuoteInput {
                rule_revision: exact_integer(&input.rule_revision)?,
                payment_nanos: exact_integer(&input.payment_nanos)?,
                idempotency_key: input.idempotency_key,
            },
            actor(auth),
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data": data})))
}

/// ```openapi
/// {
///   "path": "/api/v1/organizations/{organization}/billing/quotes/{quote}",
///   "method": "get",
///   "operation": {
///     "operationId": "getCustomerUnitQuote",
///     "summary": "Read a saved Credits purchase quote",
///     "description": "Platform administration required. A saved preview does not activate Credits, issue units, create a payment or prove processor amount eligibility. New quotes require the latest rule for its payment currency and latest definition. Inexact conversions and overflow are rejected. The quote pins amount, rule and unit definition for fifteen minutes. Identical idempotent retries retain the original quote and expiry even after rule changes or expiry; checkout must separately enforce validity. Reading historical quotes does not revalue them. No procurement data is returned.",
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
///         "name": "quote",
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
///         "description": "Original immutable quote",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "object",
///                   "additionalProperties": false,
///                   "required": [
///                     "rule_revision",
///                     "definition_revision",
///                     "payment_nanos",
///                     "credit_atoms",
///                     "numerator",
///                     "denominator",
///                     "id",
///                     "payment_currency",
///                     "name",
///                     "display_precision",
///                     "atoms_per_unit",
///                     "created_at",
///                     "expires_at"
///                   ],
///                   "properties": {
///                     "rule_revision": {
///                       "type": "string",
///                       "pattern": "^[1-9][0-9]{0,18}$",
///                       "description": "Exact positive integer at most 9223372036854775807."
///                     },
///                     "definition_revision": {
///                       "type": "string",
///                       "pattern": "^[1-9][0-9]{0,18}$",
///                       "description": "Exact positive integer at most 9223372036854775807."
///                     },
///                     "payment_nanos": {
///                       "type": "string",
///                       "pattern": "^[1-9][0-9]{0,18}$",
///                       "description": "Exact positive integer at most 9223372036854775807."
///                     },
///                     "credit_atoms": {
///                       "type": "string",
///                       "pattern": "^[1-9][0-9]{0,18}$",
///                       "description": "Exact positive integer at most 9223372036854775807."
///                     },
///                     "numerator": {
///                       "type": "string",
///                       "pattern": "^[1-9][0-9]{0,18}$",
///                       "description": "Exact positive integer at most 9223372036854775807."
///                     },
///                     "denominator": {
///                       "type": "string",
///                       "pattern": "^[1-9][0-9]{0,18}$",
///                       "description": "Exact positive integer at most 9223372036854775807."
///                     },
///                     "id": {
///                       "type": "string",
///                       "format": "uuid"
///                     },
///                     "payment_currency": {
///                       "type": "string",
///                       "pattern": "^[A-Z]{3}$"
///                     },
///                     "name": {
///                       "type": "string"
///                     },
///                     "display_precision": {
///                       "type": "integer",
///                       "minimum": 0,
///                       "maximum": 9
///                     },
///                     "atoms_per_unit": {
///                       "type": "string",
///                       "const": "1000000000"
///                     },
///                     "created_at": {
///                       "type": "string",
///                       "format": "date-time"
///                     },
///                     "expires_at": {
///                       "type": "string",
///                       "format": "date-time"
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid amount, inexact conversion or overflow"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Platform administration required"
///       },
///       "404": {
///         "description": "Quote not found in the requested organization"
///       },
///       "409": {
///         "description": "Stale rule, missing organization or conflicting idempotency input"
///       },
///       "422": {
///         "description": "Malformed request body"
///       },
///       "503": {
///         "description": "Storage unavailable"
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub async fn read_quote(
    State(state): State<AppState>,
    Path((organization, quote)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    state.authorize_platform_headers(&headers).await?;
    let data = state
        .store
        .customer_unit_quote(organization, quote)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(json!({"data": data})))
}

/// ```openapi
/// {
///   "path": "/api/v1/platform/units",
///   "method": "get",
///   "operation": {
///     "operationId": "getCustomerUnitConfiguration",
///     "summary": "Read branded-unit configuration",
///     "description": "Requires platform administration. Configuration publication alone does not activate Credits billing, convert monetary balances, issue units or change consumption tariffs. Revisions and conversion components use exact decimal strings. Writes serialize on the installation configuration revision. Identical idempotent retries return the original publication even after later changes; different input with the same key conflicts. Purchase rules are reduced exact positive ratios and must reference the latest unit definition. Publishing a new definition requires explicit purchase-rule publication for new purchases; historical rules are retained. No procurement data is returned.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Saved configuration or original idempotent publication",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "object",
///                   "additionalProperties": false,
///                   "required": [
///                     "revision",
///                     "definition",
///                     "purchase_rules"
///                   ],
///                   "properties": {
///                     "revision": {
///                       "type": "string",
///                       "pattern": "^(0|[1-9][0-9]{0,18})$",
///                       "description": "Canonical nonnegative decimal integer, at most 9223372036854775807."
///                     },
///                     "definition": {
///                       "oneOf": [
///                         {
///                           "type": "object",
///                           "additionalProperties": false,
///                           "required": [
///                             "revision",
///                             "name",
///                             "display_precision",
///                             "atoms_per_unit"
///                           ],
///                           "properties": {
///                             "revision": {
///                               "type": "string",
///                               "pattern": "^[1-9][0-9]{0,18}$",
///                               "description": "Canonical nonnegative decimal integer, at most 9223372036854775807."
///                             },
///                             "name": {
///                               "type": "string",
///                               "minLength": 1,
///                               "maxLength": 80
///                             },
///                             "display_precision": {
///                               "type": "integer",
///                               "minimum": 0,
///                               "maximum": 9
///                             },
///                             "atoms_per_unit": {
///                               "type": "string",
///                               "const": "1000000000"
///                             }
///                           }
///                         },
///                         {
///                           "type": "null"
///                         }
///                       ]
///                     },
///                     "purchase_rules": {
///                       "type": "array",
///                       "items": {
///                         "type": "object",
///                         "additionalProperties": false,
///                         "required": [
///                           "revision",
///                           "definition_revision",
///                           "payment_currency",
///                           "numerator",
///                           "denominator"
///                         ],
///                         "properties": {
///                           "revision": {
///                             "type": "string",
///                             "pattern": "^[1-9][0-9]{0,18}$",
///                             "description": "Canonical nonnegative decimal integer, at most 9223372036854775807."
///                           },
///                           "definition_revision": {
///                             "type": "string",
///                             "pattern": "^[1-9][0-9]{0,18}$",
///                             "description": "Canonical nonnegative decimal integer, at most 9223372036854775807."
///                           },
///                           "payment_currency": {
///                             "type": "string",
///                             "pattern": "^[A-Z]{3}$"
///                           },
///                           "numerator": {
///                             "type": "string",
///                             "pattern": "^[1-9][0-9]{0,18}$",
///                             "description": "Canonical nonnegative decimal integer, at most 9223372036854775807."
///                           },
///                           "denominator": {
///                             "type": "string",
///                             "pattern": "^[1-9][0-9]{0,18}$",
///                             "description": "Canonical nonnegative decimal integer, at most 9223372036854775807."
///                           }
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
///         "description": "Invalid exact integer or configuration"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Platform administration required"
///       },
///       "409": {
///         "description": "Stale revision or conflicting idempotency input"
///       },
///       "422": {
///         "description": "Malformed request body"
///       },
///       "503": {
///         "description": "Storage unavailable"
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub async fn read(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    state.authorize_platform_headers(&headers).await?;
    let data = state
        .store
        .customer_unit_configuration()
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data": data})))
}

/// ```openapi
/// {
///   "path": "/api/v1/platform/units/definitions",
///   "method": "post",
///   "operation": {
///     "operationId": "publishCustomerUnitDefinition",
///     "summary": "Publish an immutable consumption-unit definition",
///     "description": "Requires platform administration. Configuration publication alone does not activate Credits billing, convert monetary balances, issue units or change consumption tariffs. Revisions and conversion components use exact decimal strings. Writes serialize on the installation configuration revision. Identical idempotent retries return the original publication even after later changes; different input with the same key conflicts. Purchase rules are reduced exact positive ratios and must reference the latest unit definition. Publishing a new definition requires explicit purchase-rule publication for new purchases; historical rules are retained. No procurement data is returned.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Saved configuration or original idempotent publication",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "object",
///                   "additionalProperties": false,
///                   "required": [
///                     "revision",
///                     "name",
///                     "display_precision",
///                     "atoms_per_unit"
///                   ],
///                   "properties": {
///                     "revision": {
///                       "type": "string",
///                       "pattern": "^[1-9][0-9]{0,18}$",
///                       "description": "Canonical nonnegative decimal integer, at most 9223372036854775807."
///                     },
///                     "name": {
///                       "type": "string",
///                       "minLength": 1,
///                       "maxLength": 80
///                     },
///                     "display_precision": {
///                       "type": "integer",
///                       "minimum": 0,
///                       "maximum": 9
///                     },
///                     "atoms_per_unit": {
///                       "type": "string",
///                       "const": "1000000000"
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid exact integer or configuration"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Platform administration required"
///       },
///       "409": {
///         "description": "Stale revision or conflicting idempotency input"
///       },
///       "422": {
///         "description": "Malformed request body"
///       },
///       "503": {
///         "description": "Storage unavailable"
///       }
///     },
///     "x-niu-implementation": "implemented",
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "name",
///               "display_precision",
///               "expected_revision",
///               "idempotency_key"
///             ],
///             "properties": {
///               "name": {
///                 "type": "string",
///                 "minLength": 1,
///                 "maxLength": 80
///               },
///               "display_precision": {
///                 "type": "integer",
///                 "minimum": 0,
///                 "maximum": 9
///               },
///               "expected_revision": {
///                 "type": "string",
///                 "pattern": "^(0|[1-9][0-9]{0,18})$",
///                 "description": "Canonical nonnegative decimal integer, at most 9223372036854775807."
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
pub async fn publish_definition(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<DefinitionInput>,
) -> Result<Json<Value>, ApiError> {
    let auth = state.authorize_platform_headers(&headers).await?;
    let data = state
        .store
        .publish_customer_unit_definition(
            CustomerUnitDefinitionInput {
                name: &input.name,
                display_precision: input.display_precision,
                expected_revision: exact_integer(&input.expected_revision)?,
                idempotency_key: input.idempotency_key,
            },
            actor(auth),
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data": data})))
}

/// ```openapi
/// {
///   "path": "/api/v1/platform/units/rules",
///   "method": "post",
///   "operation": {
///     "operationId": "publishCustomerUnitPurchaseRule",
///     "summary": "Publish an immutable Credits purchase rule",
///     "description": "Requires platform administration. Configuration publication alone does not activate Credits billing, convert monetary balances, issue units or change consumption tariffs. Revisions and conversion components use exact decimal strings. Writes serialize on the installation configuration revision. Identical idempotent retries return the original publication even after later changes; different input with the same key conflicts. Purchase rules are reduced exact positive ratios and must reference the latest unit definition. Publishing a new definition requires explicit purchase-rule publication for new purchases; historical rules are retained. No procurement data is returned.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Saved configuration or original idempotent publication",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "object",
///                   "additionalProperties": false,
///                   "required": [
///                     "revision",
///                     "definition_revision",
///                     "payment_currency",
///                     "numerator",
///                     "denominator"
///                   ],
///                   "properties": {
///                     "revision": {
///                       "type": "string",
///                       "pattern": "^[1-9][0-9]{0,18}$",
///                       "description": "Canonical nonnegative decimal integer, at most 9223372036854775807."
///                     },
///                     "definition_revision": {
///                       "type": "string",
///                       "pattern": "^[1-9][0-9]{0,18}$",
///                       "description": "Canonical nonnegative decimal integer, at most 9223372036854775807."
///                     },
///                     "payment_currency": {
///                       "type": "string",
///                       "pattern": "^[A-Z]{3}$"
///                     },
///                     "numerator": {
///                       "type": "string",
///                       "pattern": "^[1-9][0-9]{0,18}$",
///                       "description": "Canonical nonnegative decimal integer, at most 9223372036854775807."
///                     },
///                     "denominator": {
///                       "type": "string",
///                       "pattern": "^[1-9][0-9]{0,18}$",
///                       "description": "Canonical nonnegative decimal integer, at most 9223372036854775807."
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid exact integer or configuration"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Platform administration required"
///       },
///       "409": {
///         "description": "Stale revision or conflicting idempotency input"
///       },
///       "422": {
///         "description": "Malformed request body"
///       },
///       "503": {
///         "description": "Storage unavailable"
///       }
///     },
///     "x-niu-implementation": "implemented",
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "definition_revision",
///               "payment_currency",
///               "numerator",
///               "denominator",
///               "expected_revision",
///               "idempotency_key"
///             ],
///             "properties": {
///               "definition_revision": {
///                 "type": "string",
///                 "pattern": "^[1-9][0-9]{0,18}$",
///                 "description": "Canonical nonnegative decimal integer, at most 9223372036854775807."
///               },
///               "payment_currency": {
///                 "type": "string",
///                 "pattern": "^[A-Z]{3}$"
///               },
///               "numerator": {
///                 "type": "string",
///                 "pattern": "^[1-9][0-9]{0,18}$",
///                 "description": "Canonical nonnegative decimal integer, at most 9223372036854775807."
///               },
///               "denominator": {
///                 "type": "string",
///                 "pattern": "^[1-9][0-9]{0,18}$",
///                 "description": "Canonical nonnegative decimal integer, at most 9223372036854775807."
///               },
///               "expected_revision": {
///                 "type": "string",
///                 "pattern": "^(0|[1-9][0-9]{0,18})$",
///                 "description": "Canonical nonnegative decimal integer, at most 9223372036854775807."
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
pub async fn publish_rule(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<PurchaseRuleInput>,
) -> Result<Json<Value>, ApiError> {
    let auth = state.authorize_platform_headers(&headers).await?;
    let conversion = CreditConversion::new(
        exact_integer(&input.numerator)?,
        exact_integer(&input.denominator)?,
    )
    .map_err(|_| {
        ApiError::invalid_request(
            "The Credits conversion must have a positive numerator and denominator",
        )
    })?;
    let data = state
        .store
        .publish_customer_unit_purchase_rule(
            CustomerUnitPurchaseRuleInput {
                definition_revision: exact_integer(&input.definition_revision)?,
                payment_currency: &input.payment_currency,
                conversion,
                expected_revision: exact_integer(&input.expected_revision)?,
                idempotency_key: input.idempotency_key,
            },
            actor(auth),
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data": data})))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TextTariffInput {
    model_alias: String,
    definition_revision: String,
    expected_revision: String,
    idempotency_key: Uuid,
    price: niu_storage::CustomerUnitTextPrice,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TextTariffQuery {
    model: String,
}

/// ```openapi
/// {
///   "path": "/api/v1/platform/units/tariffs",
///   "method": "get",
///   "operation": {
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Original immutable Credits text tariff",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data"
///               ],
///               "additionalProperties": false,
///               "properties": {
///                 "data": {
///                   "type": "object",
///                   "additionalProperties": false,
///                   "required": [
///                     "revision",
///                     "definition_revision",
///                     "model_alias",
///                     "price"
///                   ],
///                   "properties": {
///                     "revision": {
///                       "type": "string",
///                       "pattern": "^[1-9][0-9]{0,18}$"
///                     },
///                     "definition_revision": {
///                       "type": "string",
///                       "pattern": "^[1-9][0-9]{0,18}$"
///                     },
///                     "model_alias": {
///                       "type": "string",
///                       "minLength": 1,
///                       "maxLength": 200
///                     },
///                     "price": {
///                       "type": "object",
///                       "additionalProperties": false,
///                       "required": [
///                         "prompt_rate",
///                         "completion_rate",
///                         "request_fee_atoms",
///                         "minimum_charge_atoms",
///                         "context_tiers"
///                       ],
///                       "properties": {
///                         "prompt_rate": {
///                           "type": "string",
///                           "pattern": "^[0-9]{1,16}$",
///                           "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
///                         },
///                         "completion_rate": {
///                           "type": "string",
///                           "pattern": "^[0-9]{1,16}$",
///                           "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
///                         },
///                         "cached_prompt_rate": {
///                           "type": [
///                             "string",
///                             "null"
///                           ],
///                           "pattern": "^[0-9]{1,16}$",
///                           "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
///                         },
///                         "cache_write_prompt_rate": {
///                           "type": [
///                             "string",
///                             "null"
///                           ],
///                           "pattern": "^[0-9]{1,16}$",
///                           "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
///                         },
///                         "reasoning_completion_rate": {
///                           "type": [
///                             "string",
///                             "null"
///                           ],
///                           "pattern": "^[0-9]{1,16}$",
///                           "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
///                         },
///                         "request_fee_atoms": {
///                           "type": "string",
///                           "pattern": "^[0-9]{1,16}$",
///                           "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
///                         },
///                         "minimum_charge_atoms": {
///                           "type": "string",
///                           "pattern": "^[0-9]{1,16}$",
///                           "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
///                         },
///                         "context_tiers": {
///                           "type": "array",
///                           "maxItems": 32,
///                           "items": {
///                             "type": "object",
///                             "additionalProperties": false,
///                             "required": [
///                               "minimum_input_tokens",
///                               "prompt_rate",
///                               "completion_rate"
///                             ],
///                             "properties": {
///                               "minimum_input_tokens": {
///                                 "type": "string",
///                                 "pattern": "^[1-9][0-9]{0,18}$"
///                               },
///                               "prompt_rate": {
///                                 "type": "string",
///                                 "pattern": "^[0-9]{1,16}$",
///                                 "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
///                               },
///                               "completion_rate": {
///                                 "type": "string",
///                                 "pattern": "^[0-9]{1,16}$",
///                                 "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
///                               },
///                               "cached_prompt_rate": {
///                                 "type": [
///                                   "string",
///                                   "null"
///                                 ],
///                                 "pattern": "^[0-9]{1,16}$",
///                                 "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
///                               },
///                               "cache_write_prompt_rate": {
///                                 "type": [
///                                   "string",
///                                   "null"
///                                 ],
///                                 "pattern": "^[0-9]{1,16}$",
///                                 "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
///                               },
///                               "reasoning_completion_rate": {
///                                 "type": [
///                                   "string",
///                                   "null"
///                                 ],
///                                 "pattern": "^[0-9]{1,16}$",
///                                 "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
///                               }
///                             }
///                           }
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
///         "description": "Invalid model, exact quantity or context schedule"
///       },
///       "401": {
///         "description": "Authentication unavailable or revoked"
///       },
///       "403": {
///         "description": "Platform administration required"
///       },
///       "503": {
///         "description": "Storage unavailable"
///       },
///       "404": {
///         "description": "No explicitly published Credits text tariff"
///       }
///     },
///     "x-niu-implementation": "implemented",
///     "operationId": "getCustomerUnitTextTariff",
///     "summary": "Read the latest explicit Credits text tariff for a model",
///     "description": "Platform administration required. Reads the latest saved Credits consumption tariff, not a conversion from payment currency. It does not establish route readiness, enable billing mode or reserve capacity. Historical requests must retain their bound revision. Category null means ordinary pricing, not zero; each context tier is a complete schedule. No Provider procurement price is exposed.",
///     "parameters": [
///       {
///         "name": "model",
///         "in": "query",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 200
///         }
///       }
///     ]
///   }
/// }
/// ```
pub async fn read_text_tariff(
    State(state): State<AppState>,
    axum::extract::Query(query): axum::extract::Query<TextTariffQuery>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    state.authorize_platform_headers(&headers).await?;
    if query.model.is_empty()
        || query.model.trim() != query.model
        || query.model.chars().count() > 200
        || query.model.chars().any(char::is_control)
    {
        return Err(ApiError::invalid_request("Use a nonempty model alias"));
    }
    let data = state
        .store
        .customer_unit_text_tariff(&query.model)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(json!({"data":data})))
}

/// ```openapi
/// {
///   "path": "/api/v1/platform/units/tariffs",
///   "method": "post",
///   "operation": {
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Original immutable Credits text tariff",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data"
///               ],
///               "additionalProperties": false,
///               "properties": {
///                 "data": {
///                   "type": "object",
///                   "additionalProperties": false,
///                   "required": [
///                     "revision",
///                     "definition_revision",
///                     "model_alias",
///                     "price"
///                   ],
///                   "properties": {
///                     "revision": {
///                       "type": "string",
///                       "pattern": "^[1-9][0-9]{0,18}$"
///                     },
///                     "definition_revision": {
///                       "type": "string",
///                       "pattern": "^[1-9][0-9]{0,18}$"
///                     },
///                     "model_alias": {
///                       "type": "string",
///                       "minLength": 1,
///                       "maxLength": 200
///                     },
///                     "price": {
///                       "type": "object",
///                       "additionalProperties": false,
///                       "required": [
///                         "prompt_rate",
///                         "completion_rate",
///                         "request_fee_atoms",
///                         "minimum_charge_atoms",
///                         "context_tiers"
///                       ],
///                       "properties": {
///                         "prompt_rate": {
///                           "type": "string",
///                           "pattern": "^[0-9]{1,16}$",
///                           "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
///                         },
///                         "completion_rate": {
///                           "type": "string",
///                           "pattern": "^[0-9]{1,16}$",
///                           "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
///                         },
///                         "cached_prompt_rate": {
///                           "type": [
///                             "string",
///                             "null"
///                           ],
///                           "pattern": "^[0-9]{1,16}$",
///                           "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
///                         },
///                         "cache_write_prompt_rate": {
///                           "type": [
///                             "string",
///                             "null"
///                           ],
///                           "pattern": "^[0-9]{1,16}$",
///                           "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
///                         },
///                         "reasoning_completion_rate": {
///                           "type": [
///                             "string",
///                             "null"
///                           ],
///                           "pattern": "^[0-9]{1,16}$",
///                           "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
///                         },
///                         "request_fee_atoms": {
///                           "type": "string",
///                           "pattern": "^[0-9]{1,16}$",
///                           "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
///                         },
///                         "minimum_charge_atoms": {
///                           "type": "string",
///                           "pattern": "^[0-9]{1,16}$",
///                           "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
///                         },
///                         "context_tiers": {
///                           "type": "array",
///                           "maxItems": 32,
///                           "items": {
///                             "type": "object",
///                             "additionalProperties": false,
///                             "required": [
///                               "minimum_input_tokens",
///                               "prompt_rate",
///                               "completion_rate"
///                             ],
///                             "properties": {
///                               "minimum_input_tokens": {
///                                 "type": "string",
///                                 "pattern": "^[1-9][0-9]{0,18}$"
///                               },
///                               "prompt_rate": {
///                                 "type": "string",
///                                 "pattern": "^[0-9]{1,16}$",
///                                 "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
///                               },
///                               "completion_rate": {
///                                 "type": "string",
///                                 "pattern": "^[0-9]{1,16}$",
///                                 "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
///                               },
///                               "cached_prompt_rate": {
///                                 "type": [
///                                   "string",
///                                   "null"
///                                 ],
///                                 "pattern": "^[0-9]{1,16}$",
///                                 "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
///                               },
///                               "cache_write_prompt_rate": {
///                                 "type": [
///                                   "string",
///                                   "null"
///                                 ],
///                                 "pattern": "^[0-9]{1,16}$",
///                                 "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
///                               },
///                               "reasoning_completion_rate": {
///                                 "type": [
///                                   "string",
///                                   "null"
///                                 ],
///                                 "pattern": "^[0-9]{1,16}$",
///                                 "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
///                               }
///                             }
///                           }
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
///         "description": "Invalid model, exact quantity or context schedule"
///       },
///       "401": {
///         "description": "Authentication unavailable or revoked"
///       },
///       "403": {
///         "description": "Platform administration required"
///       },
///       "503": {
///         "description": "Storage unavailable"
///       },
///       "409": {
///         "description": "Stale installation/unit revision or conflicting idempotency input"
///       },
///       "422": {
///         "description": "Malformed request"
///       }
///     },
///     "x-niu-implementation": "implemented",
///     "operationId": "publishCustomerUnitTextTariff",
///     "summary": "Publish a versioned Credits text consumption tariff",
///     "description": "Platform administration required and rechecked transactionally for operators. Publish atom-denominated rates independently of purchase conversion and monetary tariffs. New publication requires the current unit definition and installation revision. Concurrent stale writes conflict. Equal idempotent retries return their original normalized publication, even after later price or unit changes; changed input conflicts. Rates and quantity thresholds use exact decimal strings; context thresholds are unique and normalized in ascending order. Nullable category rates use ordinary rates, never inherit another tier. Rates are per million tokens, rounded upward once after adding applicable exact token products. Add the fixed request fee, then apply the minimum charge. Explicit zero is valid; absence of a publication is unavailable. Publishing a tariff does not activate billing mode, issue Credits, convert money balances, admit requests or change prior request bindings.",
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "model_alias",
///               "definition_revision",
///               "expected_revision",
///               "idempotency_key",
///               "price"
///             ],
///             "properties": {
///               "model_alias": {
///                 "type": "string",
///                 "minLength": 1,
///                 "maxLength": 200
///               },
///               "definition_revision": {
///                 "type": "string",
///                 "pattern": "^[1-9][0-9]{0,18}$"
///               },
///               "expected_revision": {
///                 "type": "string",
///                 "pattern": "^(0|[1-9][0-9]{0,18})$"
///               },
///               "idempotency_key": {
///                 "type": "string",
///                 "format": "uuid"
///               },
///               "price": {
///                 "type": "object",
///                 "additionalProperties": false,
///                 "required": [
///                   "prompt_rate",
///                   "completion_rate",
///                   "request_fee_atoms",
///                   "minimum_charge_atoms",
///                   "context_tiers"
///                 ],
///                 "properties": {
///                   "prompt_rate": {
///                     "type": "string",
///                     "pattern": "^[0-9]{1,16}$",
///                     "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
///                   },
///                   "completion_rate": {
///                     "type": "string",
///                     "pattern": "^[0-9]{1,16}$",
///                     "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
///                   },
///                   "cached_prompt_rate": {
///                     "type": [
///                       "string",
///                       "null"
///                     ],
///                     "pattern": "^[0-9]{1,16}$",
///                     "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
///                   },
///                   "cache_write_prompt_rate": {
///                     "type": [
///                       "string",
///                       "null"
///                     ],
///                     "pattern": "^[0-9]{1,16}$",
///                     "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
///                   },
///                   "reasoning_completion_rate": {
///                     "type": [
///                       "string",
///                       "null"
///                     ],
///                     "pattern": "^[0-9]{1,16}$",
///                     "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
///                   },
///                   "request_fee_atoms": {
///                     "type": "string",
///                     "pattern": "^[0-9]{1,16}$",
///                     "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
///                   },
///                   "minimum_charge_atoms": {
///                     "type": "string",
///                     "pattern": "^[0-9]{1,16}$",
///                     "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
///                   },
///                   "context_tiers": {
///                     "type": "array",
///                     "maxItems": 32,
///                     "items": {
///                       "type": "object",
///                       "additionalProperties": false,
///                       "required": [
///                         "minimum_input_tokens",
///                         "prompt_rate",
///                         "completion_rate"
///                       ],
///                       "properties": {
///                         "minimum_input_tokens": {
///                           "type": "string",
///                           "pattern": "^[1-9][0-9]{0,18}$"
///                         },
///                         "prompt_rate": {
///                           "type": "string",
///                           "pattern": "^[0-9]{1,16}$",
///                           "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
///                         },
///                         "completion_rate": {
///                           "type": "string",
///                           "pattern": "^[0-9]{1,16}$",
///                           "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
///                         },
///                         "cached_prompt_rate": {
///                           "type": [
///                             "string",
///                             "null"
///                           ],
///                           "pattern": "^[0-9]{1,16}$",
///                           "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
///                         },
///                         "cache_write_prompt_rate": {
///                           "type": [
///                             "string",
///                             "null"
///                           ],
///                           "pattern": "^[0-9]{1,16}$",
///                           "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
///                         },
///                         "reasoning_completion_rate": {
///                           "type": [
///                             "string",
///                             "null"
///                           ],
///                           "pattern": "^[0-9]{1,16}$",
///                           "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
///                         }
///                       }
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub async fn publish_text_tariff(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<TextTariffInput>,
) -> Result<Json<Value>, ApiError> {
    let auth = state.authorize_platform_headers(&headers).await?;
    let data = state
        .store
        .publish_customer_unit_text_tariff(
            niu_storage::CustomerUnitTextTariffInput {
                model_alias: &input.model_alias,
                definition_revision: exact_integer(&input.definition_revision)?,
                expected_revision: exact_integer(&input.expected_revision)?,
                idempotency_key: input.idempotency_key,
                price: input.price,
            },
            actor(auth),
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":data})))
}
