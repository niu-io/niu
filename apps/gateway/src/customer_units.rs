//! Platform publications for branded consumption units. These operations do
//! not activate billing mode, issue Credits, or convert existing money records.
use crate::{
    error::ApiError,
    state::{AdminAuthorization, AppState},
};
use axum::{Json, extract::State, http::HeaderMap};
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
