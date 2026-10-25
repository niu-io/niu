//! Branded-unit configuration, exact balance reads and explicit noncash grants.
//! Configuration publication never activates billing mode or converts money.
use crate::{
    error::ApiError,
    state::{AdminAuthorization, AppState},
};
use axum::{
    Json,
    extract::{Path, Query, State},
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

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ModePreviewQuery {
    target: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ModePrepareInput {
    target_mode: String,
    expected_revision: String,
    idempotency_key: Uuid,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ModePublishInput {
    preview_id: Uuid,
    expected_revision: String,
    idempotency_key: Uuid,
}

/// ```openapi
/// {
///   "path": "/api/v1/platform/units/mode/previews",
///   "method": "post",
///   "operation": {
///     "operationId": "prepareCustomerUnitMode",
///     "summary": "Save a billing-mode change preview",
///     "description": "Platform administration required. Saves an immutable fifteen-minute compatibility snapshot without changing mode, balances or prices. Requires the current installation revision. A blocked or same-mode snapshot may be saved for review but cannot authorize publication. Identical idempotent replay returns the original snapshot and expiry even after later configuration changes; conflicting reuse is rejected. The actual mode publication must recheck current financial state. Quantities and revisions are exact strings.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Original durable result",
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
///                     "id",
///                     "expected_revision",
///                     "source_mode",
///                     "target_mode",
///                     "snapshot",
///                     "created_at",
///                     "expires_at"
///                   ],
///                   "properties": {
///                     "id": {
///                       "type": "string",
///                       "format": "uuid"
///                     },
///                     "expected_revision": {
///                       "type": "string",
///                       "pattern": "^(0|[1-9][0-9]*)$"
///                     },
///                     "source_mode": {
///                       "type": "string",
///                       "enum": [
///                         "currency",
///                         "credits"
///                       ]
///                     },
///                     "target_mode": {
///                       "type": "string",
///                       "enum": [
///                         "currency",
///                         "credits"
///                       ]
///                     },
///                     "snapshot": {
///                       "type": "object",
///                       "additionalProperties": false,
///                       "required": [
///                         "revision",
///                         "billing_mode",
///                         "target_mode",
///                         "change_required",
///                         "blockers_empty",
///                         "observed_at",
///                         "blockers",
///                         "preserved_configuration"
///                       ],
///                       "properties": {
///                         "revision": {
///                           "type": "string",
///                           "pattern": "^(0|[1-9][0-9]*)$"
///                         },
///                         "billing_mode": {
///                           "type": "string",
///                           "enum": [
///                             "currency",
///                             "credits"
///                           ]
///                         },
///                         "target_mode": {
///                           "type": "string",
///                           "enum": [
///                             "currency",
///                             "credits"
///                           ]
///                         },
///                         "change_required": {
///                           "type": "boolean"
///                         },
///                         "blockers_empty": {
///                           "type": "boolean"
///                         },
///                         "observed_at": {
///                           "type": "string",
///                           "format": "date-time"
///                         },
///                         "blockers": {
///                           "type": "array",
///                           "items": {
///                             "type": "object",
///                             "additionalProperties": false,
///                             "required": [
///                               "category",
///                               "record_count",
///                               "organization_count",
///                               "accounts_truncated",
///                               "accounts"
///                             ],
///                             "properties": {
///                               "category": {
///                                 "type": "string"
///                               },
///                               "record_count": {
///                                 "type": "string",
///                                 "pattern": "^(0|[1-9][0-9]*)$"
///                               },
///                               "organization_count": {
///                                 "type": "string",
///                                 "pattern": "^(0|[1-9][0-9]*)$"
///                               },
///                               "accounts_truncated": {
///                                 "type": "boolean"
///                               },
///                               "accounts": {
///                                 "type": "array",
///                                 "maxItems": 100,
///                                 "items": {
///                                   "type": "object",
///                                   "additionalProperties": false,
///                                   "required": [
///                                     "organization_id",
///                                     "name",
///                                     "record_count"
///                                   ],
///                                   "properties": {
///                                     "organization_id": {
///                                       "type": "string",
///                                       "format": "uuid"
///                                     },
///                                     "name": {
///                                       "type": "string"
///                                     },
///                                     "record_count": {
///                                       "type": "string",
///                                       "pattern": "^(0|[1-9][0-9]*)$"
///                                     }
///                                   }
///                                 }
///                               }
///                             }
///                           }
///                         },
///                         "preserved_configuration": {
///                           "type": "object",
///                           "additionalProperties": false,
///                           "required": [
///                             "monetary_workspace_limits",
///                             "monetary_key_limits",
///                             "monetary_text_tariffs",
///                             "credits_text_tariffs",
///                             "monetary_retail_prices",
///                             "monetary_media_rate_history"
///                           ],
///                           "properties": {
///                             "monetary_workspace_limits": {
///                               "type": "string",
///                               "pattern": "^(0|[1-9][0-9]*)$"
///                             },
///                             "monetary_key_limits": {
///                               "type": "string",
///                               "pattern": "^(0|[1-9][0-9]*)$"
///                             },
///                             "monetary_text_tariffs": {
///                               "type": "string",
///                               "pattern": "^(0|[1-9][0-9]*)$"
///                             },
///                             "credits_text_tariffs": {
///                               "type": "string",
///                               "pattern": "^(0|[1-9][0-9]*)$"
///                             },
///                             "monetary_retail_prices": {
///                               "type": "string",
///                               "pattern": "^(0|[1-9][0-9]*)$"
///                             },
///                             "monetary_media_rate_history": {
///                               "type": "string",
///                               "pattern": "^(0|[1-9][0-9]*)$"
///                             }
///                           }
///                         }
///                       }
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
///         "description": "Invalid input"
///       },
///       "401": {
///         "description": "Authentication required or revoked"
///       },
///       "403": {
///         "description": "Platform administration required"
///       },
///       "409": {
///         "description": "Stale, incompatible, expired or conflicting intent; concurrent financial activity"
///       },
///       "422": {
///         "description": "Malformed request"
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
///               "target_mode",
///               "expected_revision",
///               "idempotency_key"
///             ],
///             "properties": {
///               "target_mode": {
///                 "type": "string",
///                 "enum": [
///                   "currency",
///                   "credits"
///                 ]
///               },
///               "expected_revision": {
///                 "type": "string",
///                 "pattern": "^(0|[1-9][0-9]*)$"
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
pub async fn prepare_mode(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<ModePrepareInput>,
) -> Result<Json<Value>, ApiError> {
    let auth = state.authorize_platform_headers(&headers).await?;
    let data = state
        .store
        .prepare_customer_unit_mode(
            &input.target_mode,
            exact_integer(&input.expected_revision)?,
            input.idempotency_key,
            actor(auth),
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":data})))
}

/// ```openapi
/// {
///   "path": "/api/v1/platform/units/mode/previews/{preview}",
///   "method": "get",
///   "operation": {
///     "operationId": "getSavedCustomerUnitModePreview",
///     "summary": "Read an original saved billing-mode preview",
///     "description": "Platform administration required. Returns the immutable original snapshot, including expired or subsequently incompatible previews. Reading does not renew expiry or authorize a switch. Current compatibility can differ; publication always rechecks it.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Original durable result",
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
///                     "id",
///                     "expected_revision",
///                     "source_mode",
///                     "target_mode",
///                     "snapshot",
///                     "created_at",
///                     "expires_at"
///                   ],
///                   "properties": {
///                     "id": {
///                       "type": "string",
///                       "format": "uuid"
///                     },
///                     "expected_revision": {
///                       "type": "string",
///                       "pattern": "^(0|[1-9][0-9]*)$"
///                     },
///                     "source_mode": {
///                       "type": "string",
///                       "enum": [
///                         "currency",
///                         "credits"
///                       ]
///                     },
///                     "target_mode": {
///                       "type": "string",
///                       "enum": [
///                         "currency",
///                         "credits"
///                       ]
///                     },
///                     "snapshot": {
///                       "type": "object",
///                       "additionalProperties": false,
///                       "required": [
///                         "revision",
///                         "billing_mode",
///                         "target_mode",
///                         "change_required",
///                         "blockers_empty",
///                         "observed_at",
///                         "blockers",
///                         "preserved_configuration"
///                       ],
///                       "properties": {
///                         "revision": {
///                           "type": "string",
///                           "pattern": "^(0|[1-9][0-9]*)$"
///                         },
///                         "billing_mode": {
///                           "type": "string",
///                           "enum": [
///                             "currency",
///                             "credits"
///                           ]
///                         },
///                         "target_mode": {
///                           "type": "string",
///                           "enum": [
///                             "currency",
///                             "credits"
///                           ]
///                         },
///                         "change_required": {
///                           "type": "boolean"
///                         },
///                         "blockers_empty": {
///                           "type": "boolean"
///                         },
///                         "observed_at": {
///                           "type": "string",
///                           "format": "date-time"
///                         },
///                         "blockers": {
///                           "type": "array",
///                           "items": {
///                             "type": "object",
///                             "additionalProperties": false,
///                             "required": [
///                               "category",
///                               "record_count",
///                               "organization_count",
///                               "accounts_truncated",
///                               "accounts"
///                             ],
///                             "properties": {
///                               "category": {
///                                 "type": "string"
///                               },
///                               "record_count": {
///                                 "type": "string",
///                                 "pattern": "^(0|[1-9][0-9]*)$"
///                               },
///                               "organization_count": {
///                                 "type": "string",
///                                 "pattern": "^(0|[1-9][0-9]*)$"
///                               },
///                               "accounts_truncated": {
///                                 "type": "boolean"
///                               },
///                               "accounts": {
///                                 "type": "array",
///                                 "maxItems": 100,
///                                 "items": {
///                                   "type": "object",
///                                   "additionalProperties": false,
///                                   "required": [
///                                     "organization_id",
///                                     "name",
///                                     "record_count"
///                                   ],
///                                   "properties": {
///                                     "organization_id": {
///                                       "type": "string",
///                                       "format": "uuid"
///                                     },
///                                     "name": {
///                                       "type": "string"
///                                     },
///                                     "record_count": {
///                                       "type": "string",
///                                       "pattern": "^(0|[1-9][0-9]*)$"
///                                     }
///                                   }
///                                 }
///                               }
///                             }
///                           }
///                         },
///                         "preserved_configuration": {
///                           "type": "object",
///                           "additionalProperties": false,
///                           "required": [
///                             "monetary_workspace_limits",
///                             "monetary_key_limits",
///                             "monetary_text_tariffs",
///                             "credits_text_tariffs",
///                             "monetary_retail_prices",
///                             "monetary_media_rate_history"
///                           ],
///                           "properties": {
///                             "monetary_workspace_limits": {
///                               "type": "string",
///                               "pattern": "^(0|[1-9][0-9]*)$"
///                             },
///                             "monetary_key_limits": {
///                               "type": "string",
///                               "pattern": "^(0|[1-9][0-9]*)$"
///                             },
///                             "monetary_text_tariffs": {
///                               "type": "string",
///                               "pattern": "^(0|[1-9][0-9]*)$"
///                             },
///                             "credits_text_tariffs": {
///                               "type": "string",
///                               "pattern": "^(0|[1-9][0-9]*)$"
///                             },
///                             "monetary_retail_prices": {
///                               "type": "string",
///                               "pattern": "^(0|[1-9][0-9]*)$"
///                             },
///                             "monetary_media_rate_history": {
///                               "type": "string",
///                               "pattern": "^(0|[1-9][0-9]*)$"
///                             }
///                           }
///                         }
///                       }
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
///         "description": "Invalid input"
///       },
///       "401": {
///         "description": "Authentication required or revoked"
///       },
///       "403": {
///         "description": "Platform administration required"
///       },
///       "409": {
///         "description": "Stale, incompatible, expired or conflicting intent; concurrent financial activity"
///       },
///       "422": {
///         "description": "Malformed request"
///       },
///       "503": {
///         "description": "Storage unavailable"
///       },
///       "404": {
///         "description": "Saved preview not found"
///       }
///     },
///     "x-niu-implementation": "implemented",
///     "parameters": [
///       {
///         "name": "preview",
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
pub async fn read_mode_preview(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(preview): Path<Uuid>,
) -> Result<Json<Value>, ApiError> {
    state.authorize_platform_headers(&headers).await?;
    let data = state
        .store
        .read_customer_unit_mode_preview(preview)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(json!({"data":data})))
}

/// ```openapi
/// {
///   "path": "/api/v1/platform/units/mode",
///   "method": "put",
///   "operation": {
///     "operationId": "publishCustomerUnitMode",
///     "summary": "Publish a preview-confirmed installation billing mode",
///     "description": "Platform administration required and rechecked under lock. Requires an unexpired originally compatible saved preview, its matching current revision and a distinct target mode. Rechecks customer obligations atomically while holding financial-table locks. Concurrent financial activity returns a retryable 409; re-read compatibility if state changed. Balances, prices, monetary limits and historical records are never converted. A successful publication creates an immutable change receipt and advances the installation revision once. Identical idempotent retry returns the original receipt even after subsequent mode changes; it does not reapply the old mode. Mode activation alone does not establish configured unit prices, compatible spending limits, model availability or media readiness. Existing monetary limits require explicit compatible configuration before affected Credits admission. New monetary grants/funding require currency mode and new unit issuance requires Credits mode.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Original durable result",
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
///                     "previous_mode",
///                     "billing_mode",
///                     "preview_id",
///                     "created_at"
///                   ],
///                   "properties": {
///                     "revision": {
///                       "type": "string",
///                       "pattern": "^(0|[1-9][0-9]*)$"
///                     },
///                     "previous_mode": {
///                       "type": "string",
///                       "enum": [
///                         "currency",
///                         "credits"
///                       ]
///                     },
///                     "billing_mode": {
///                       "type": "string",
///                       "enum": [
///                         "currency",
///                         "credits"
///                       ]
///                     },
///                     "preview_id": {
///                       "type": "string",
///                       "format": "uuid"
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
///         "description": "Invalid input"
///       },
///       "401": {
///         "description": "Authentication required or revoked"
///       },
///       "403": {
///         "description": "Platform administration required"
///       },
///       "409": {
///         "description": "Stale, incompatible, expired or conflicting intent; concurrent financial activity"
///       },
///       "422": {
///         "description": "Malformed request"
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
///               "preview_id",
///               "expected_revision",
///               "idempotency_key"
///             ],
///             "properties": {
///               "preview_id": {
///                 "type": "string",
///                 "format": "uuid"
///               },
///               "expected_revision": {
///                 "type": "string",
///                 "pattern": "^(0|[1-9][0-9]*)$"
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
pub async fn publish_mode(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<ModePublishInput>,
) -> Result<Json<Value>, ApiError> {
    let auth = state.authorize_platform_headers(&headers).await?;
    let data = state
        .store
        .publish_customer_unit_mode(
            input.preview_id,
            exact_integer(&input.expected_revision)?,
            input.idempotency_key,
            actor(auth),
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":data})))
}

/// ```openapi
/// {
///   "path": "/api/v1/platform/units/mode",
///   "method": "get",
///   "operation": {
///     "operationId": "getCustomerUnitModePreview",
///     "summary": "Preview installation billing-mode incompatibilities",
///     "description": "Platform administration required. One current database statement reports incompatible customer balances, credit facilities, pending checkouts, unposted charges, unresolved customer requests and reservations, unapplied monetary grant intents and remaining unexpired Credits. Enabling Credits additionally requires a unit definition and matching platform-currency purchase rule. Each category includes complete counts and at most 100 affected company accounts, with explicit truncation. Original tariffs and monetary limits are retained and summarized, never converted. Existing monetary limits still require explicit compatible Credits configuration before those workspaces or keys can spend Credits. This is advisory only: blockers_empty does not activate billing mode, prove route readiness or authorize a later switch. Any mode publication must revalidate current state atomically. Reads never modify accounts or history. Same-mode previews still report current incompatibilities. No procurement amounts or credentials are included. Internal account identifiers are routing references, not display labels.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "target",
///         "in": "query",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "enum": [
///             "currency",
///             "credits"
///           ]
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Current advisory compatibility snapshot",
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
///                     "billing_mode",
///                     "target_mode",
///                     "change_required",
///                     "blockers_empty",
///                     "observed_at",
///                     "blockers",
///                     "preserved_configuration"
///                   ],
///                   "properties": {
///                     "revision": {
///                       "type": "string",
///                       "pattern": "^(0|[1-9][0-9]*)$"
///                     },
///                     "billing_mode": {
///                       "type": "string",
///                       "enum": [
///                         "currency",
///                         "credits"
///                       ]
///                     },
///                     "target_mode": {
///                       "type": "string",
///                       "enum": [
///                         "currency",
///                         "credits"
///                       ]
///                     },
///                     "change_required": {
///                       "type": "boolean"
///                     },
///                     "blockers_empty": {
///                       "type": "boolean"
///                     },
///                     "observed_at": {
///                       "type": "string",
///                       "format": "date-time"
///                     },
///                     "blockers": {
///                       "type": "array",
///                       "items": {
///                         "type": "object",
///                         "additionalProperties": false,
///                         "required": [
///                           "category",
///                           "record_count",
///                           "organization_count",
///                           "accounts_truncated",
///                           "accounts"
///                         ],
///                         "properties": {
///                           "category": {
///                             "type": "string"
///                           },
///                           "record_count": {
///                             "type": "string",
///                             "pattern": "^(0|[1-9][0-9]*)$"
///                           },
///                           "organization_count": {
///                             "type": "string",
///                             "pattern": "^(0|[1-9][0-9]*)$"
///                           },
///                           "accounts_truncated": {
///                             "type": "boolean"
///                           },
///                           "accounts": {
///                             "type": "array",
///                             "maxItems": 100,
///                             "items": {
///                               "type": "object",
///                               "additionalProperties": false,
///                               "required": [
///                                 "organization_id",
///                                 "name",
///                                 "record_count"
///                               ],
///                               "properties": {
///                                 "organization_id": {
///                                   "type": "string",
///                                   "format": "uuid"
///                                 },
///                                 "name": {
///                                   "type": "string"
///                                 },
///                                 "record_count": {
///                                   "type": "string",
///                                   "pattern": "^(0|[1-9][0-9]*)$"
///                                 }
///                               }
///                             }
///                           }
///                         }
///                       }
///                     },
///                     "preserved_configuration": {
///                       "type": "object",
///                       "additionalProperties": false,
///                       "required": [
///                         "monetary_workspace_limits",
///                         "monetary_key_limits",
///                         "monetary_text_tariffs",
///                         "credits_text_tariffs",
///                         "monetary_retail_prices",
///                         "monetary_media_rate_history"
///                       ],
///                       "properties": {
///                         "monetary_workspace_limits": {
///                           "type": "string",
///                           "pattern": "^(0|[1-9][0-9]*)$"
///                         },
///                         "monetary_key_limits": {
///                           "type": "string",
///                           "pattern": "^(0|[1-9][0-9]*)$"
///                         },
///                         "monetary_text_tariffs": {
///                           "type": "string",
///                           "pattern": "^(0|[1-9][0-9]*)$"
///                         },
///                         "credits_text_tariffs": {
///                           "type": "string",
///                           "pattern": "^(0|[1-9][0-9]*)$"
///                         },
///                         "monetary_retail_prices": {
///                           "type": "string",
///                           "pattern": "^(0|[1-9][0-9]*)$"
///                         },
///                         "monetary_media_rate_history": {
///                           "type": "string",
///                           "pattern": "^(0|[1-9][0-9]*)$"
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
///         "description": "Invalid target or query"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Platform administration required"
///       },
///       "503": {
///         "description": "Storage unavailable"
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub async fn mode_preview(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<ModePreviewQuery>,
) -> Result<Json<Value>, ApiError> {
    state.authorize_platform_headers(&headers).await?;
    let data = state
        .store
        .customer_unit_mode_preview(&query.target)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data": data})))
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
///                     "purchase_rules",
///                     "billing_mode"
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
///                     },
///                     "billing_mode": {
///                       "type": "string",
///                       "enum": [
///                         "currency",
///                         "credits"
///                       ]
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

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UnitLimitInput {
    #[serde(deserialize_with = "nullable_exact_string")]
    limit_atoms: Option<String>,
    expected_revision: String,
    idempotency_key: Uuid,
}

fn nullable_exact_string<'de, D: serde::Deserializer<'de>>(
    d: D,
) -> Result<Option<String>, D::Error> {
    Option::<String>::deserialize(d)
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UnitLimitHistoryQuery {
    before_revision: Option<i64>,
    limit: Option<i64>,
}

/// ```openapi
/// {
///   "path": "/api/v1/organizations/{organization}/projects/{project}/units/limit",
///   "method": "get",
///   "operation": {
///     "operationId": "getWorkspaceCustomerUnitSpendingLimit",
///     "summary": "Read the workspace Credits spending limit and commitment",
///     "description": "Workspace read permission required. Returns the workspace's explicit Credits atom limit, policy revision, committed atoms (settled charges minus original-range restorations plus unresolved holds and known overrun liabilities), remaining allowance, and whether an existing monetary workspace limit is preserved. A preserved monetary limit blocks Credits admission until an explicit Credits workspace limit revision (integer atoms or null for unlimited) is published. Never exposes company balance or procurement costs.",
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
///     "responses": {
///       "200": {
///         "description": "Current workspace Credits spending limit state",
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
///                     "unit",
///                     "limit_atoms",
///                     "revision",
///                     "definition_revision",
///                     "committed_atoms",
///                     "remaining_atoms",
///                     "monetary_limit_preserved",
///                     "credits_admission_blocked_by_monetary_limit"
///                   ],
///                   "properties": {
///                     "unit": {
///                       "type": [
///                         "object",
///                         "null"
///                       ],
///                       "additionalProperties": false,
///                       "required": [
///                         "definition_revision",
///                         "name",
///                         "display_precision",
///                         "atoms_per_unit"
///                       ],
///                       "properties": {
///                         "definition_revision": {
///                           "type": "string",
///                           "pattern": "^[1-9][0-9]*$"
///                         },
///                         "name": {
///                           "type": "string"
///                         },
///                         "display_precision": {
///                           "type": "integer",
///                           "minimum": 0,
///                           "maximum": 9
///                         },
///                         "atoms_per_unit": {
///                           "type": "string",
///                           "const": "1000000000"
///                         }
///                       }
///                     },
///                     "limit_atoms": {
///                       "type": [
///                         "string",
///                         "null"
///                       ],
///                       "pattern": "^(0|[1-9][0-9]*)$"
///                     },
///                     "revision": {
///                       "type": [
///                         "string",
///                         "null"
///                       ],
///                       "pattern": "^[1-9][0-9]*$"
///                     },
///                     "definition_revision": {
///                       "type": [
///                         "string",
///                         "null"
///                       ],
///                       "pattern": "^[1-9][0-9]*$"
///                     },
///                     "committed_atoms": {
///                       "type": "string",
///                       "pattern": "^(0|[1-9][0-9]*)$"
///                     },
///                     "remaining_atoms": {
///                       "type": [
///                         "string",
///                         "null"
///                       ],
///                       "pattern": "^(0|[1-9][0-9]*)$"
///                     },
///                     "monetary_limit_preserved": {
///                       "type": "boolean"
///                     },
///                     "credits_admission_blocked_by_monetary_limit": {
///                       "type": "boolean"
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "401": {
///         "description": "Authentication required or revoked"
///       },
///       "403": {
///         "description": "Workspace access denied"
///       },
///       "404": {
///         "description": "Workspace not found in the authorized scope"
///       },
///       "503": {
///         "description": "Storage unavailable"
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub async fn read_workspace_limit(
    State(state): State<AppState>,
    crate::web::workspace_path::WorkspacePath((organization, workspace)): crate::web::workspace_path::WorkspacePath<(Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    crate::admin::authorize_project(
        &state,
        &headers,
        niu_storage::AdminPermission::Read,
        organization,
        workspace,
    )
    .await?;
    let scope = niu_storage::TenantScope {
        organization_id: organization,
        project_id: workspace,
    };
    let data = state
        .store
        .customer_unit_workspace_spending_limit(scope)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(json!({"data": data})))
}

/// ```openapi
/// {
///   "path": "/api/v1/organizations/{organization}/projects/{project}/units/limit",
///   "method": "put",
///   "operation": {
///     "operationId": "setWorkspaceCustomerUnitSpendingLimit",
///     "summary": "Set the workspace Credits spending limit",
///     "description": "Workspace/company owner or installation administrator required and rechecked under lock. Sets an exact Credits atom cap or explicit null for unlimited, using optimistic revision checking and durable idempotency. Lowering below committed workspace liability (charges minus restorations plus unresolved holds and known overrun liabilities) returns 402. Preserves existing monetary workspace limits for currency mode while replacing their blocking effect in Credits admission.",
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
///             "additionalProperties": false,
///             "required": [
///               "limit_atoms",
///               "expected_revision",
///               "idempotency_key"
///             ],
///             "properties": {
///               "limit_atoms": {
///                 "type": [
///                   "string",
///                   "null"
///                 ],
///                 "pattern": "^(0|[1-9][0-9]*)$",
///                 "description": "Canonical nonnegative signed-64-bit integer string or explicit null for unlimited."
///               },
///               "expected_revision": {
///                 "type": "string",
///                 "pattern": "^(0|[1-9][0-9]*)$",
///                 "description": "Zero for initial configuration; maximum 9223372036854775806."
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
///         "description": "Immutable policy revision receipt",
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
///                     "expected_revision",
///                     "definition_revision",
///                     "limit_atoms",
///                     "recorded_at",
///                     "actor_kind",
///                     "actor_name"
///                   ],
///                   "properties": {
///                     "revision": {
///                       "type": "string",
///                       "pattern": "^[1-9][0-9]*$"
///                     },
///                     "expected_revision": {
///                       "type": "string",
///                       "pattern": "^(0|[1-9][0-9]*)$"
///                     },
///                     "definition_revision": {
///                       "type": "string",
///                       "pattern": "^[1-9][0-9]*$"
///                     },
///                     "limit_atoms": {
///                       "type": [
///                         "string",
///                         "null"
///                       ],
///                       "pattern": "^(0|[1-9][0-9]*)$"
///                     },
///                     "recorded_at": {
///                       "type": "string",
///                       "format": "date-time"
///                     },
///                     "actor_kind": {
///                       "type": "string",
///                       "enum": [
///                         "installation",
///                         "member"
///                       ]
///                     },
///                     "actor_name": {
///                       "type": "string"
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid integer string"
///       },
///       "401": {
///         "description": "Authentication required or revoked"
///       },
///       "402": {
///         "description": "Proposed limit is below committed workspace liability"
///       },
///       "403": {
///         "description": "Owner permission required"
///       },
///       "404": {
///         "description": "Workspace not found in the authorized scope"
///       },
///       "409": {
///         "description": "Stale revision, conflicting idempotency key or missing published unit definition"
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
pub async fn write_workspace_limit(
    State(state): State<AppState>,
    crate::web::workspace_path::WorkspacePath((organization, workspace)): crate::web::workspace_path::WorkspacePath<(Uuid, Uuid)>,
    headers: HeaderMap,
    Json(input): Json<UnitLimitInput>,
) -> Result<Json<Value>, ApiError> {
    let auth = crate::admin::authorize_project(
        &state,
        &headers,
        niu_storage::AdminPermission::Write,
        organization,
        workspace,
    )
    .await?;
    if matches!(
        auth,
        AdminAuthorization::Operator(ref operator)
            if operator.role != niu_storage::OperatorRole::Owner
    ) {
        return Err(ApiError::forbidden());
    }
    let limit_atoms = input
        .limit_atoms
        .as_deref()
        .map(exact_integer)
        .transpose()?;
    let expected = exact_integer(&input.expected_revision)?;
    let scope = niu_storage::TenantScope {
        organization_id: organization,
        project_id: workspace,
    };
    let data = state
        .store
        .set_customer_unit_workspace_spending_limit(
            scope,
            limit_atoms,
            expected,
            input.idempotency_key,
            actor(auth),
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data": data})))
}

/// ```openapi
/// {
///   "path": "/api/v1/organizations/{organization}/projects/{project}/units/limit/history",
///   "method": "get",
///   "operation": {
///     "operationId": "listWorkspaceCustomerUnitSpendingLimitHistory",
///     "summary": "List workspace Credits spending limit history",
///     "description": "Workspace read permission required. Returns descending immutable revisions with exclusive before_revision pagination. Never exposes internal actor identifiers.",
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
///         "name": "before_revision",
///         "in": "query",
///         "schema": {
///           "type": "integer",
///           "format": "int64",
///           "minimum": 1
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
///         "description": "Descending immutable policy revisions",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "required": [
///                 "data",
///                 "next_before_revision"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "type": "object",
///                     "additionalProperties": false,
///                     "required": [
///                       "revision",
///                       "expected_revision",
///                       "definition_revision",
///                       "limit_atoms",
///                       "recorded_at",
///                       "actor_kind",
///                       "actor_name"
///                     ],
///                     "properties": {
///                       "revision": {
///                         "type": "string",
///                         "pattern": "^[1-9][0-9]*$"
///                       },
///                       "expected_revision": {
///                         "type": "string",
///                         "pattern": "^(0|[1-9][0-9]*)$"
///                       },
///                       "definition_revision": {
///                         "type": "string",
///                         "pattern": "^[1-9][0-9]*$"
///                       },
///                       "limit_atoms": {
///                         "type": [
///                           "string",
///                           "null"
///                         ],
///                         "pattern": "^(0|[1-9][0-9]*)$"
///                       },
///                       "recorded_at": {
///                         "type": "string",
///                         "format": "date-time"
///                       },
///                       "actor_kind": {
///                         "type": "string",
///                         "enum": [
///                           "installation",
///                           "member"
///                         ]
///                       },
///                       "actor_name": {
///                         "type": "string"
///                       }
///                     }
///                   }
///                 },
///                 "next_before_revision": {
///                   "type": [
///                     "string",
///                     "null"
///                   ],
///                   "pattern": "^[1-9][0-9]*$"
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid history cursor or page size"
///       },
///       "401": {
///         "description": "Authentication required or revoked"
///       },
///       "403": {
///         "description": "Workspace access denied"
///       },
///       "404": {
///         "description": "Workspace not found in the authorized scope"
///       },
///       "503": {
///         "description": "Storage unavailable"
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub async fn workspace_limit_history(
    State(state): State<AppState>,
    crate::web::workspace_path::WorkspacePath((organization, workspace)): crate::web::workspace_path::WorkspacePath<(Uuid, Uuid)>,
    headers: HeaderMap,
    query: Result<Query<UnitLimitHistoryQuery>, axum::extract::rejection::QueryRejection>,
) -> Result<Json<Value>, ApiError> {
    crate::admin::authorize_project(
        &state,
        &headers,
        niu_storage::AdminPermission::Read,
        organization,
        workspace,
    )
    .await?;
    let Query(query) =
        query.map_err(|_| ApiError::invalid_request("Invalid spending-limit history query"))?;
    let limit = query.limit.unwrap_or(50);
    if !(1..=100).contains(&limit) || query.before_revision.is_some_and(|r| r <= 0) {
        return Err(ApiError::invalid_request(
            "Invalid spending-limit history cursor or page size",
        ));
    }
    let scope = niu_storage::TenantScope {
        organization_id: organization,
        project_id: workspace,
    };
    let rows = state
        .store
        .customer_unit_workspace_limit_history(scope, query.before_revision, limit)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    let next = if rows.len() == limit as usize {
        rows.last().and_then(|row| row.get("revision")).cloned()
    } else {
        None
    };
    Ok(Json(json!({"data": rows, "next_before_revision": next})))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MediaTariffQuery {
    model: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MediaTariffInput {
    model_alias: String,
    definition_revision: String,
    expected_revision: String,
    idempotency_key: Uuid,
    price: niu_storage::CustomerUnitMediaPrice,
}

/// ```openapi
/// {
///   "path": "/api/v1/platform/units/media/tariffs",
///   "method": "get",
///   "operation": {
///     "operationId": "listCustomerUnitMediaTariffs",
///     "summary": "List latest explicit Credits media tariffs",
///     "description": "Platform administration required. Reads the latest saved Credits media consumption tariff per dimension tuple (model_alias, channel, resolution, reference_video), not a conversion from payment currency. Optional model filter scopes to one model alias. No Provider procurement price is exposed.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "model",
///         "in": "query",
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
///         "description": "Latest explicit Credits media tariffs by dimension tuple",
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
///                   "type": "array",
///                   "items": {
///                     "type": "object",
///                     "additionalProperties": false,
///                     "required": [
///                       "revision",
///                       "definition_revision",
///                       "model_alias",
///                       "channel",
///                       "resolution",
///                       "reference_video",
///                       "meter",
///                       "price"
///                     ],
///                     "properties": {
///                       "revision": {
///                         "type": "string",
///                         "pattern": "^[1-9][0-9]{0,18}$"
///                       },
///                       "definition_revision": {
///                         "type": "string",
///                         "pattern": "^[1-9][0-9]{0,18}$"
///                       },
///                       "model_alias": {
///                         "type": "string",
///                         "minLength": 1,
///                         "maxLength": 200
///                       },
///                       "channel": {
///                         "type": "string",
///                         "minLength": 1,
///                         "maxLength": 200
///                       },
///                       "resolution": {
///                         "type": "string",
///                         "minLength": 1,
///                         "maxLength": 200
///                       },
///                       "reference_video": {
///                         "type": "boolean"
///                       },
///                       "meter": {
///                         "type": "string",
///                         "enum": [
///                           "video_tokens"
///                         ]
///                       },
///                       "price": {
///                         "type": "object",
///                         "additionalProperties": false,
///                         "required": [
///                           "dimensions",
///                           "meter",
///                           "amount_atoms",
///                           "per_quantity",
///                           "minimum_quantity",
///                           "rounding"
///                         ],
///                         "properties": {
///                           "dimensions": {
///                             "type": "object",
///                             "additionalProperties": false,
///                             "required": [
///                               "model",
///                               "channel",
///                               "resolution",
///                               "reference_video"
///                             ],
///                             "properties": {
///                               "model": {
///                                 "type": "string",
///                                 "minLength": 1,
///                                 "maxLength": 200
///                               },
///                               "channel": {
///                                 "type": "string",
///                                 "minLength": 1,
///                                 "maxLength": 200
///                               },
///                               "resolution": {
///                                 "type": "string",
///                                 "minLength": 1,
///                                 "maxLength": 200
///                               },
///                               "reference_video": {
///                                 "type": "boolean"
///                               }
///                             }
///                           },
///                           "meter": {
///                             "type": "string",
///                             "enum": [
///                               "video_tokens"
///                             ]
///                           },
///                           "amount_atoms": {
///                             "type": "string",
///                             "pattern": "^[0-9]{1,16}$"
///                           },
///                           "per_quantity": {
///                             "$ref": "#/components/schemas/VideoBillingQuantity"
///                           },
///                           "minimum_quantity": {
///                             "$ref": "#/components/schemas/VideoBillingQuantity"
///                           },
///                           "rounding": {
///                             "type": "string",
///                             "enum": [
///                               "Down",
///                               "Up",
///                               "HalfEven"
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
///         "description": "Invalid model query"
///       },
///       "401": {
///         "description": "Authentication unavailable or revoked"
///       },
///       "403": {
///         "description": "Platform administration required"
///       },
///       "503": {
///         "description": "Storage unavailable"
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub async fn list_media_tariffs(
    State(state): State<AppState>,
    query: Result<Query<MediaTariffQuery>, axum::extract::rejection::QueryRejection>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    state.authorize_platform_headers(&headers).await?;
    let Query(query) =
        query.map_err(|_| ApiError::invalid_request("Invalid media tariff query"))?;
    if let Some(ref model) = query.model
        && (model.is_empty()
            || model.trim() != model
            || model.chars().count() > 200
            || model.chars().any(char::is_control))
    {
        return Err(ApiError::invalid_request("Use a nonempty model alias"));
    }
    let data = state
        .store
        .customer_unit_media_tariffs(query.model.as_deref())
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(data))
}

/// ```openapi
/// {
///   "path": "/api/v1/platform/units/media/tariffs",
///   "method": "post",
///   "operation": {
///     "operationId": "publishCustomerUnitMediaTariff",
///     "summary": "Publish a versioned Credits media consumption tariff",
///     "description": "Platform administration required and rechecked transactionally for operators. Publish atom-denominated media consumption rates independently of purchase conversion and monetary media rate cards. New publication requires the current unit definition and installation revision. Concurrent stale writes conflict. Equal idempotent retries return their original normalized publication; changed input conflicts. Explicit zero is valid; absence of a publication is unavailable. Publishing a tariff does not activate billing mode, issue Credits, convert money balances, admit requests or change prior request bindings.",
///     "security": [
///       {
///         "bearerAuth": []
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
///                   "dimensions",
///                   "meter",
///                   "amount_atoms",
///                   "per_quantity",
///                   "minimum_quantity",
///                   "rounding"
///                 ],
///                 "properties": {
///                   "dimensions": {
///                     "type": "object",
///                     "additionalProperties": false,
///                     "required": [
///                       "model",
///                       "channel",
///                       "resolution",
///                       "reference_video"
///                     ],
///                     "properties": {
///                       "model": {
///                         "type": "string",
///                         "minLength": 1,
///                         "maxLength": 200
///                       },
///                       "channel": {
///                         "type": "string",
///                         "minLength": 1,
///                         "maxLength": 200
///                       },
///                       "resolution": {
///                         "type": "string",
///                         "minLength": 1,
///                         "maxLength": 200
///                       },
///                       "reference_video": {
///                         "type": "boolean"
///                       }
///                     }
///                   },
///                   "meter": {
///                     "type": "string",
///                     "enum": [
///                       "video_tokens"
///                     ]
///                   },
///                   "amount_atoms": {
///                     "type": "string",
///                     "pattern": "^[0-9]{1,16}$"
///                   },
///                   "per_quantity": {
///                     "$ref": "#/components/schemas/VideoBillingQuantity"
///                   },
///                   "minimum_quantity": {
///                     "$ref": "#/components/schemas/VideoBillingQuantity"
///                   },
///                   "rounding": {
///                     "type": "string",
///                     "enum": [
///                       "Down",
///                       "Up",
///                       "HalfEven"
///                     ]
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
///         "description": "Original immutable Credits media tariff",
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
///                     "model_alias",
///                     "channel",
///                     "resolution",
///                     "reference_video",
///                     "meter",
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
///                     "channel": {
///                       "type": "string",
///                       "minLength": 1,
///                       "maxLength": 200
///                     },
///                     "resolution": {
///                       "type": "string",
///                       "minLength": 1,
///                       "maxLength": 200
///                     },
///                     "reference_video": {
///                       "type": "boolean"
///                     },
///                     "meter": {
///                       "type": "string",
///                       "enum": [
///                         "video_tokens"
///                       ]
///                     },
///                     "price": {
///                       "type": "object",
///                       "additionalProperties": false,
///                       "required": [
///                         "dimensions",
///                         "meter",
///                         "amount_atoms",
///                         "per_quantity",
///                         "minimum_quantity",
///                         "rounding"
///                       ],
///                       "properties": {
///                         "dimensions": {
///                           "type": "object",
///                           "additionalProperties": false,
///                           "required": [
///                             "model",
///                             "channel",
///                             "resolution",
///                             "reference_video"
///                           ],
///                           "properties": {
///                             "model": {
///                               "type": "string",
///                               "minLength": 1,
///                               "maxLength": 200
///                             },
///                             "channel": {
///                               "type": "string",
///                               "minLength": 1,
///                               "maxLength": 200
///                             },
///                             "resolution": {
///                               "type": "string",
///                               "minLength": 1,
///                               "maxLength": 200
///                             },
///                             "reference_video": {
///                               "type": "boolean"
///                             }
///                           }
///                         },
///                         "meter": {
///                           "type": "string",
///                           "enum": [
///                             "video_tokens"
///                           ]
///                         },
///                         "amount_atoms": {
///                           "type": "string",
///                           "pattern": "^[0-9]{1,16}$"
///                         },
///                         "per_quantity": {
///                           "$ref": "#/components/schemas/VideoBillingQuantity"
///                         },
///                         "minimum_quantity": {
///                           "$ref": "#/components/schemas/VideoBillingQuantity"
///                         },
///                         "rounding": {
///                           "type": "string",
///                           "enum": [
///                             "Down",
///                             "Up",
///                             "HalfEven"
///                           ]
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
///         "description": "Invalid model, dimensions, exact quantity or rounding mode"
///       },
///       "401": {
///         "description": "Authentication unavailable or revoked"
///       },
///       "403": {
///         "description": "Platform administration required"
///       },
///       "409": {
///         "description": "Stale installation/unit revision or conflicting idempotency input"
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
pub async fn publish_media_tariff(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<MediaTariffInput>,
) -> Result<Json<Value>, ApiError> {
    let auth = state.authorize_platform_headers(&headers).await?;
    let data = state
        .store
        .publish_customer_unit_media_tariff(
            niu_storage::CustomerUnitMediaTariffInput {
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
    Ok(Json(json!({"data": data})))
}

#[derive(Deserialize, Default)]
#[serde(deny_unknown_fields)]
pub struct PurchaseReversalPreviewQuery {
    credit_atoms: Option<String>,
}

/// ```openapi
/// {
///   "path": "/api/v1/organizations/{organization}/billing/units/purchases/{order}/reversals",
///   "method": "get",
///   "operation": {
///     "operationId": "previewCustomerUnitPurchaseReversal",
///     "summary": "Preview a Credits purchase reversal and read committed reversal receipts",
///     "description": "Platform administration required. Evaluates the unoccupied (unconsumed, unreserved and unreversed) ranges of an original Credits purchase lot and computes the exact processor-representable refund amount (whole minor units of 10000000 nanounits), the reversible atom prefix and any residual atoms or monetary backing that cannot be represented at processor precision without discarding value. Also returns all previously committed reversal receipts on the order. Consumed ranges require an explicit charge refund before they become reversible. Does not mutate state or execute an external payment refund.",
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
///         "name": "order",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "credit_atoms",
///         "in": "query",
///         "required": false,
///         "schema": {
///           "type": "string",
///           "pattern": "^[1-9][0-9]*$"
///         },
///         "description": "Optional target unoccupied atom prefix to evaluate; defaults to all currently available unoccupied atoms on the purchase lot."
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Purchase reversal preview and committed reversal history",
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
///                     "order_id",
///                     "lot_id",
///                     "definition_revision",
///                     "name",
///                     "display_precision",
///                     "atoms_per_unit",
///                     "provenance",
///                     "payment_currency",
///                     "processor_minor_unit_nanos",
///                     "payment_nanos",
///                     "backing_nanos",
///                     "issued_atoms",
///                     "held_atoms",
///                     "charged_atoms",
///                     "restored_atoms",
///                     "reversed_atoms",
///                     "available_atoms",
///                     "available_payment_nanos",
///                     "available_backing_nanos",
///                     "requested_atoms",
///                     "reversible_atoms",
///                     "refund_payment_nanos",
///                     "refund_backing_nanos",
///                     "residual_credit_atoms",
///                     "residual_payment_nanos",
///                     "residual_backing_nanos",
///                     "ranges",
///                     "reversals"
///                   ],
///                   "properties": {
///                     "order_id": {
///                       "type": "string",
///                       "format": "uuid"
///                     },
///                     "lot_id": {
///                       "type": "string",
///                       "format": "uuid"
///                     },
///                     "definition_revision": {
///                       "type": "string",
///                       "pattern": "^[1-9][0-9]*$"
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
///                     "provenance": {
///                       "type": "string",
///                       "enum": [
///                         "purchased",
///                         "simulated"
///                       ]
///                     },
///                     "payment_currency": {
///                       "type": "string",
///                       "pattern": "^[A-Z]{3}$"
///                     },
///                     "processor_minor_unit_nanos": {
///                       "type": "string",
///                       "const": "10000000"
///                     },
///                     "payment_nanos": {
///                       "type": "string",
///                       "pattern": "^[1-9][0-9]*$"
///                     },
///                     "backing_nanos": {
///                       "type": "string",
///                       "pattern": "^(0|[1-9][0-9]*)$"
///                     },
///                     "issued_atoms": {
///                       "type": "string",
///                       "pattern": "^[1-9][0-9]*$"
///                     },
///                     "held_atoms": {
///                       "type": "string",
///                       "pattern": "^(0|[1-9][0-9]*)$"
///                     },
///                     "charged_atoms": {
///                       "type": "string",
///                       "pattern": "^(0|[1-9][0-9]*)$"
///                     },
///                     "restored_atoms": {
///                       "type": "string",
///                       "pattern": "^(0|[1-9][0-9]*)$"
///                     },
///                     "reversed_atoms": {
///                       "type": "string",
///                       "pattern": "^(0|[1-9][0-9]*)$"
///                     },
///                     "available_atoms": {
///                       "type": "string",
///                       "pattern": "^(0|[1-9][0-9]*)$"
///                     },
///                     "available_payment_nanos": {
///                       "type": "string",
///                       "pattern": "^(0|[1-9][0-9]*)$"
///                     },
///                     "available_backing_nanos": {
///                       "type": "string",
///                       "pattern": "^(0|[1-9][0-9]*)$"
///                     },
///                     "requested_atoms": {
///                       "type": "string",
///                       "pattern": "^(0|[1-9][0-9]*)$"
///                     },
///                     "reversible_atoms": {
///                       "type": "string",
///                       "pattern": "^(0|[1-9][0-9]*)$"
///                     },
///                     "refund_payment_nanos": {
///                       "type": "string",
///                       "pattern": "^(0|[1-9][0-9]*)$"
///                     },
///                     "refund_backing_nanos": {
///                       "type": "string",
///                       "pattern": "^(0|[1-9][0-9]*)$"
///                     },
///                     "residual_credit_atoms": {
///                       "type": "string",
///                       "pattern": "^(0|[1-9][0-9]*)$"
///                     },
///                     "residual_payment_nanos": {
///                       "type": "string",
///                       "pattern": "^(0|[1-9][0-9]*)$"
///                     },
///                     "residual_backing_nanos": {
///                       "type": "string",
///                       "pattern": "^(0|[1-9][0-9]*)$"
///                     },
///                     "ranges": {
///                       "type": "array",
///                       "items": {
///                         "type": "object",
///                         "additionalProperties": false,
///                         "required": [
///                           "first_atom",
///                           "end_atom",
///                           "credit_atoms",
///                           "payment_nanos",
///                           "backing_nanos"
///                         ],
///                         "properties": {
///                           "first_atom": {
///                             "type": "string",
///                             "pattern": "^(0|[1-9][0-9]*)$"
///                           },
///                           "end_atom": {
///                             "type": "string",
///                             "pattern": "^[1-9][0-9]*$"
///                           },
///                           "credit_atoms": {
///                             "type": "string",
///                             "pattern": "^[1-9][0-9]*$"
///                           },
///                           "payment_nanos": {
///                             "type": "string",
///                             "pattern": "^(0|[1-9][0-9]*)$"
///                           },
///                           "backing_nanos": {
///                             "type": "string",
///                             "pattern": "^(0|[1-9][0-9]*)$"
///                           }
///                         }
///                       }
///                     },
///                     "reversals": {
///                       "type": "array",
///                       "items": {
///                         "type": "object",
///                         "additionalProperties": false,
///                         "required": [
///                           "id",
///                           "order_id",
///                           "lot_id",
///                           "definition_revision",
///                           "name",
///                           "display_precision",
///                           "atoms_per_unit",
///                           "provenance",
///                           "payment_currency",
///                           "processor_minor_unit_nanos",
///                           "credit_atoms",
///                           "refund_payment_nanos",
///                           "refund_backing_nanos",
///                           "reason",
///                           "created_at",
///                           "ranges"
///                         ],
///                         "properties": {
///                           "id": {
///                             "type": "string",
///                             "format": "uuid"
///                           },
///                           "order_id": {
///                             "type": "string",
///                             "format": "uuid"
///                           },
///                           "lot_id": {
///                             "type": "string",
///                             "format": "uuid"
///                           },
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
///                           "atoms_per_unit": {
///                             "type": "string",
///                             "const": "1000000000"
///                           },
///                           "provenance": {
///                             "type": "string",
///                             "enum": [
///                               "purchased",
///                               "simulated"
///                             ]
///                           },
///                           "payment_currency": {
///                             "type": "string",
///                             "pattern": "^[A-Z]{3}$"
///                           },
///                           "processor_minor_unit_nanos": {
///                             "type": "string",
///                             "const": "10000000"
///                           },
///                           "credit_atoms": {
///                             "type": "string",
///                             "pattern": "^[1-9][0-9]*$"
///                           },
///                           "refund_payment_nanos": {
///                             "type": "string",
///                             "pattern": "^[1-9][0-9]*$"
///                           },
///                           "refund_backing_nanos": {
///                             "type": "string",
///                             "pattern": "^(0|[1-9][0-9]*)$"
///                           },
///                           "reason": {
///                             "type": "string"
///                           },
///                           "created_at": {
///                             "type": "string",
///                             "format": "date-time"
///                           },
///                           "ranges": {
///                             "type": "array",
///                             "items": {
///                               "type": "object",
///                               "additionalProperties": false,
///                               "required": [
///                                 "first_atom",
///                                 "end_atom",
///                                 "credit_atoms",
///                                 "payment_nanos",
///                                 "backing_nanos"
///                               ],
///                               "properties": {
///                                 "first_atom": {
///                                   "type": "string",
///                                   "pattern": "^(0|[1-9][0-9]*)$"
///                                 },
///                                 "end_atom": {
///                                   "type": "string",
///                                   "pattern": "^[1-9][0-9]*$"
///                                 },
///                                 "credit_atoms": {
///                                   "type": "string",
///                                   "pattern": "^[1-9][0-9]*$"
///                                 },
///                                 "payment_nanos": {
///                                   "type": "string",
///                                   "pattern": "^(0|[1-9][0-9]*)$"
///                                 },
///                                 "backing_nanos": {
///                                   "type": "string",
///                                   "pattern": "^(0|[1-9][0-9]*)$"
///                                 }
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
///         "description": "Invalid query parameter"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Platform administration required"
///       },
///       "404": {
///         "description": "No settled Credits purchase lot for the specified organization and order"
///       },
///       "409": {
///         "description": "Requested atoms exceed currently available unoccupied purchase capacity"
///       },
///       "503": {
///         "description": "Storage unavailable"
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub async fn preview_purchase_reversal(
    State(state): State<AppState>,
    Path((organization, order)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    query: Result<Query<PurchaseReversalPreviewQuery>, axum::extract::rejection::QueryRejection>,
) -> Result<Json<Value>, ApiError> {
    state.authorize_platform_headers(&headers).await?;
    let Query(query) =
        query.map_err(|_| ApiError::invalid_request("Invalid purchase-reversal preview query"))?;
    let credit_atoms = match query.credit_atoms.as_deref() {
        Some(raw) => {
            let parsed = exact_integer(raw)?;
            if parsed <= 0 {
                return Err(ApiError::invalid_request(
                    "Use a positive integer atom quantity",
                ));
            }
            Some(parsed)
        }
        None => None,
    };
    let data = state
        .store
        .preview_customer_unit_purchase_reversal(organization, order, credit_atoms)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(json!({"data": data})))
}

/// ```openapi
/// {
///   "path": "/api/v1/organizations/{organization}/billing/units/purchases/{order}/reversals",
///   "method": "post",
///   "operation": {
///     "operationId": "reverseCustomerUnitPurchase",
///     "summary": "Reverse unoccupied Credits purchase ranges at processor minor-unit precision",
///     "description": "Platform administration required. Records an immutable reversal of unoccupied ranges belonging to an original Credits purchase lot. The requested atom quantity must map to a positive whole minor-unit payment refund (divisible by 10000000 nanounits) with zero discarded residual atoms or backing. Simulated purchases preserve zero cash backing and never enter verified cash funding reversals. Identical idempotent replay returns the original receipt even after later charges, reversals or rule changes; conflicting reuse returns 409. Recording a reversal does not execute an external payment-processor transfer.",
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
///         "name": "order",
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
///         "description": "Immutable purchase reversal receipt",
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
///                     "id",
///                     "order_id",
///                     "lot_id",
///                     "definition_revision",
///                     "name",
///                     "display_precision",
///                     "atoms_per_unit",
///                     "provenance",
///                     "payment_currency",
///                     "processor_minor_unit_nanos",
///                     "credit_atoms",
///                     "refund_payment_nanos",
///                     "refund_backing_nanos",
///                     "reason",
///                     "created_at",
///                     "ranges"
///                   ],
///                   "properties": {
///                     "id": {
///                       "type": "string",
///                       "format": "uuid"
///                     },
///                     "order_id": {
///                       "type": "string",
///                       "format": "uuid"
///                     },
///                     "lot_id": {
///                       "type": "string",
///                       "format": "uuid"
///                     },
///                     "definition_revision": {
///                       "type": "string",
///                       "pattern": "^[1-9][0-9]*$"
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
///                     "provenance": {
///                       "type": "string",
///                       "enum": [
///                         "purchased",
///                         "simulated"
///                       ]
///                     },
///                     "payment_currency": {
///                       "type": "string",
///                       "pattern": "^[A-Z]{3}$"
///                     },
///                     "processor_minor_unit_nanos": {
///                       "type": "string",
///                       "const": "10000000"
///                     },
///                     "credit_atoms": {
///                       "type": "string",
///                       "pattern": "^[1-9][0-9]*$"
///                     },
///                     "refund_payment_nanos": {
///                       "type": "string",
///                       "pattern": "^[1-9][0-9]*$"
///                     },
///                     "refund_backing_nanos": {
///                       "type": "string",
///                       "pattern": "^(0|[1-9][0-9]*)$"
///                     },
///                     "reason": {
///                       "type": "string"
///                     },
///                     "created_at": {
///                       "type": "string",
///                       "format": "date-time"
///                     },
///                     "ranges": {
///                       "type": "array",
///                       "items": {
///                         "type": "object",
///                         "additionalProperties": false,
///                         "required": [
///                           "first_atom",
///                           "end_atom",
///                           "credit_atoms",
///                           "payment_nanos",
///                           "backing_nanos"
///                         ],
///                         "properties": {
///                           "first_atom": {
///                             "type": "string",
///                             "pattern": "^(0|[1-9][0-9]*)$"
///                           },
///                           "end_atom": {
///                             "type": "string",
///                             "pattern": "^[1-9][0-9]*$"
///                           },
///                           "credit_atoms": {
///                             "type": "string",
///                             "pattern": "^[1-9][0-9]*$"
///                           },
///                           "payment_nanos": {
///                             "type": "string",
///                             "pattern": "^(0|[1-9][0-9]*)$"
///                           },
///                           "backing_nanos": {
///                             "type": "string",
///                             "pattern": "^(0|[1-9][0-9]*)$"
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
///         "description": "Invalid atom quantity, inexact processor minor-unit refund, residual atoms or invalid reason"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Platform administration required"
///       },
///       "404": {
///         "description": "No settled Credits purchase lot for the specified organization and order"
///       },
///       "409": {
///         "description": "Requested atoms exceed unoccupied capacity or idempotency key reused with different input"
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
pub async fn reverse_purchase(
    State(state): State<AppState>,
    Path((organization, order)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    Json(input): Json<RefundInput>,
) -> Result<Json<Value>, ApiError> {
    let auth = state.authorize_platform_headers(&headers).await?;
    let data = state
        .store
        .reverse_customer_unit_purchase(
            organization,
            order,
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
///   "path": "/api/v1/organizations/{organization}/projects/{project}/keys/{key}/units/limit",
///   "method": "get",
///   "operation": {
///     "operationId": "getKeyCustomerUnitSpendingLimit",
///     "summary": "Read an API key's Credits spending limit and commitment",
///     "description": "Workspace read permission required. Rotated keys share their original spending root identity. Returns the key lineage's explicit Credits atom limit, policy revision, committed atoms (settled charges minus restorations plus unresolved holds and known overrun liabilities), remaining allowance, and whether an existing monetary key limit is preserved. A preserved monetary key limit blocks Credits admission until an explicit Credits key limit revision is published.",
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
///         "description": "Current API key Credits spending limit state",
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
///                     "unit",
///                     "limit_atoms",
///                     "revision",
///                     "definition_revision",
///                     "committed_atoms",
///                     "remaining_atoms",
///                     "monetary_limit_preserved",
///                     "credits_admission_blocked_by_monetary_limit"
///                   ],
///                   "properties": {
///                     "unit": {
///                       "type": [
///                         "object",
///                         "null"
///                       ],
///                       "additionalProperties": false,
///                       "required": [
///                         "definition_revision",
///                         "name",
///                         "display_precision",
///                         "atoms_per_unit"
///                       ],
///                       "properties": {
///                         "definition_revision": {
///                           "type": "string",
///                           "pattern": "^[1-9][0-9]*$"
///                         },
///                         "name": {
///                           "type": "string"
///                         },
///                         "display_precision": {
///                           "type": "integer",
///                           "minimum": 0,
///                           "maximum": 9
///                         },
///                         "atoms_per_unit": {
///                           "type": "string",
///                           "const": "1000000000"
///                         }
///                       }
///                     },
///                     "limit_atoms": {
///                       "type": [
///                         "string",
///                         "null"
///                       ],
///                       "pattern": "^(0|[1-9][0-9]*)$"
///                     },
///                     "revision": {
///                       "type": [
///                         "string",
///                         "null"
///                       ],
///                       "pattern": "^[1-9][0-9]*$"
///                     },
///                     "definition_revision": {
///                       "type": [
///                         "string",
///                         "null"
///                       ],
///                       "pattern": "^[1-9][0-9]*$"
///                     },
///                     "committed_atoms": {
///                       "type": "string",
///                       "pattern": "^(0|[1-9][0-9]*)$"
///                     },
///                     "remaining_atoms": {
///                       "type": [
///                         "string",
///                         "null"
///                       ],
///                       "pattern": "^(0|[1-9][0-9]*)$"
///                     },
///                     "monetary_limit_preserved": {
///                       "type": "boolean"
///                     },
///                     "credits_admission_blocked_by_monetary_limit": {
///                       "type": "boolean"
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "401": {
///         "description": "Authentication required or revoked"
///       },
///       "403": {
///         "description": "Workspace access denied"
///       },
///       "404": {
///         "description": "Key does not exist in the authorized workspace"
///       },
///       "503": {
///         "description": "Storage unavailable"
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub async fn read_key_limit(
    State(state): State<AppState>,
    crate::web::workspace_path::WorkspacePath((organization, workspace, key)): crate::web::workspace_path::WorkspacePath<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    crate::admin::authorize_project(
        &state,
        &headers,
        niu_storage::AdminPermission::Read,
        organization,
        workspace,
    )
    .await?;
    let scope = niu_storage::TenantScope {
        organization_id: organization,
        project_id: workspace,
    };
    let data = state
        .store
        .customer_unit_key_spending_limit(scope, key)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(json!({"data": data})))
}

/// ```openapi
/// {
///   "path": "/api/v1/organizations/{organization}/projects/{project}/keys/{key}/units/limit",
///   "method": "put",
///   "operation": {
///     "operationId": "setKeyCustomerUnitSpendingLimit",
///     "summary": "Set an API key's Credits spending limit",
///     "description": "Workspace/company owner or installation administrator required and rechecked under lock. Updates the shared spending root identity across secret rotations using optimistic revision checking and durable idempotency. Lowering below committed key liability returns 402. Preserves existing monetary key limits for currency mode while replacing their blocking effect in Credits admission.",
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
///         "name": "key",
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
///               "limit_atoms",
///               "expected_revision",
///               "idempotency_key"
///             ],
///             "properties": {
///               "limit_atoms": {
///                 "type": [
///                   "string",
///                   "null"
///                 ],
///                 "pattern": "^(0|[1-9][0-9]*)$",
///                 "description": "Canonical nonnegative signed-64-bit integer string or explicit null for unlimited."
///               },
///               "expected_revision": {
///                 "type": "string",
///                 "pattern": "^(0|[1-9][0-9]*)$",
///                 "description": "Zero for initial configuration; maximum 9223372036854775806."
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
///         "description": "Immutable policy revision receipt",
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
///                     "expected_revision",
///                     "definition_revision",
///                     "limit_atoms",
///                     "recorded_at",
///                     "actor_kind",
///                     "actor_name"
///                   ],
///                   "properties": {
///                     "revision": {
///                       "type": "string",
///                       "pattern": "^[1-9][0-9]*$"
///                     },
///                     "expected_revision": {
///                       "type": "string",
///                       "pattern": "^(0|[1-9][0-9]*)$"
///                     },
///                     "definition_revision": {
///                       "type": "string",
///                       "pattern": "^[1-9][0-9]*$"
///                     },
///                     "limit_atoms": {
///                       "type": [
///                         "string",
///                         "null"
///                       ],
///                       "pattern": "^(0|[1-9][0-9]*)$"
///                     },
///                     "recorded_at": {
///                       "type": "string",
///                       "format": "date-time"
///                     },
///                     "actor_kind": {
///                       "type": "string",
///                       "enum": [
///                         "installation",
///                         "member"
///                       ]
///                     },
///                     "actor_name": {
///                       "type": "string"
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid integer string"
///       },
///       "401": {
///         "description": "Authentication required or revoked"
///       },
///       "402": {
///         "description": "Proposed limit is below committed key liability"
///       },
///       "403": {
///         "description": "Owner permission required"
///       },
///       "404": {
///         "description": "Key does not exist in the authorized workspace"
///       },
///       "409": {
///         "description": "Stale revision, conflicting idempotency key, unattributed active liability or missing unit definition"
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
pub async fn write_key_limit(
    State(state): State<AppState>,
    crate::web::workspace_path::WorkspacePath((organization, workspace, key)): crate::web::workspace_path::WorkspacePath<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
    Json(input): Json<UnitLimitInput>,
) -> Result<Json<Value>, ApiError> {
    let auth = crate::admin::authorize_project(
        &state,
        &headers,
        niu_storage::AdminPermission::Write,
        organization,
        workspace,
    )
    .await?;
    if matches!(
        auth,
        AdminAuthorization::Operator(ref operator)
            if operator.role != niu_storage::OperatorRole::Owner
    ) {
        return Err(ApiError::forbidden());
    }
    let scope = niu_storage::TenantScope {
        organization_id: organization,
        project_id: workspace,
    };
    let ensure_key_exists = || async {
        if !state
            .store
            .key_spending_scope_exists(scope, key)
            .await
            .map_err(ApiError::from_store)?
        {
            Err(ApiError::not_found())
        } else {
            Ok(())
        }
    };
    let limit_atoms = match input.limit_atoms.as_deref().map(exact_integer).transpose() {
        Ok(limit_atoms) => limit_atoms,
        Err(err) => {
            ensure_key_exists().await?;
            return Err(err);
        }
    };
    let expected = match exact_integer(&input.expected_revision) {
        Ok(expected) => expected,
        Err(err) => {
            ensure_key_exists().await?;
            return Err(err);
        }
    };
    let data = state
        .store
        .set_customer_unit_key_spending_limit(
            scope,
            key,
            limit_atoms,
            expected,
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
///   "path": "/api/v1/organizations/{organization}/projects/{project}/keys/{key}/units/limit/history",
///   "method": "get",
///   "operation": {
///     "operationId": "listKeyCustomerUnitSpendingLimitHistory",
///     "summary": "List API key Credits spending limit history",
///     "description": "Workspace read permission required. Returns descending immutable revisions shared across key rotations, with exclusive before_revision pagination. Never exposes internal actor identifiers.",
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
///         "name": "key",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "before_revision",
///         "in": "query",
///         "schema": {
///           "type": "integer",
///           "format": "int64",
///           "minimum": 1
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
///         "description": "Descending immutable policy revisions",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "required": [
///                 "data",
///                 "next_before_revision"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "type": "object",
///                     "additionalProperties": false,
///                     "required": [
///                       "revision",
///                       "expected_revision",
///                       "definition_revision",
///                       "limit_atoms",
///                       "recorded_at",
///                       "actor_kind",
///                       "actor_name"
///                     ],
///                     "properties": {
///                       "revision": {
///                         "type": "string",
///                         "pattern": "^[1-9][0-9]*$"
///                       },
///                       "expected_revision": {
///                         "type": "string",
///                         "pattern": "^(0|[1-9][0-9]*)$"
///                       },
///                       "definition_revision": {
///                         "type": "string",
///                         "pattern": "^[1-9][0-9]*$"
///                       },
///                       "limit_atoms": {
///                         "type": [
///                           "string",
///                           "null"
///                         ],
///                         "pattern": "^(0|[1-9][0-9]*)$"
///                       },
///                       "recorded_at": {
///                         "type": "string",
///                         "format": "date-time"
///                       },
///                       "actor_kind": {
///                         "type": "string",
///                         "enum": [
///                           "installation",
///                           "member"
///                         ]
///                       },
///                       "actor_name": {
///                         "type": "string"
///                       }
///                     }
///                   }
///                 },
///                 "next_before_revision": {
///                   "type": [
///                     "string",
///                     "null"
///                   ],
///                   "pattern": "^[1-9][0-9]*$"
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid history cursor or page size"
///       },
///       "401": {
///         "description": "Authentication required or revoked"
///       },
///       "403": {
///         "description": "Workspace access denied"
///       },
///       "404": {
///         "description": "Key does not exist in the authorized workspace"
///       },
///       "503": {
///         "description": "Storage unavailable"
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub async fn key_limit_history(
    State(state): State<AppState>,
    crate::web::workspace_path::WorkspacePath((organization, workspace, key)): crate::web::workspace_path::WorkspacePath<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
    query: Result<Query<UnitLimitHistoryQuery>, axum::extract::rejection::QueryRejection>,
) -> Result<Json<Value>, ApiError> {
    crate::admin::authorize_project(
        &state,
        &headers,
        niu_storage::AdminPermission::Read,
        organization,
        workspace,
    )
    .await?;
    let Query(query) =
        query.map_err(|_| ApiError::invalid_request("Invalid key-limit history query"))?;
    let limit = query.limit.unwrap_or(50);
    if !(1..=100).contains(&limit) || query.before_revision.is_some_and(|r| r <= 0) {
        return Err(ApiError::invalid_request(
            "Invalid history cursor or page size",
        ));
    }
    let scope = niu_storage::TenantScope {
        organization_id: organization,
        project_id: workspace,
    };
    let rows = state
        .store
        .customer_unit_key_limit_history(scope, key, query.before_revision, limit)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    let next = if rows.len() == limit as usize {
        rows.last().and_then(|row| row.get("revision")).cloned()
    } else {
        None
    };
    Ok(Json(json!({"data": rows, "next_before_revision": next})))
}
