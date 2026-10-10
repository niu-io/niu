//! Customer billing. Text tariff and invoice writes remain installation-owned.
//! Media pricing also accepts explicitly granted platform administrators.
use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    extract::{Path, Query, State},
    http::HeaderMap,
};
use niu_storage::{AdminPermission, ProviderOfferInput, TenantScope};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;
async fn authorize(
    state: &AppState,
    headers: &HeaderMap,
    scope: TenantScope,
    write: bool,
) -> Result<(), ApiError> {
    let auth = state
        .authorize_admin_headers(headers, AdminPermission::Read)
        .await?;
    if write && !auth.is_installation() {
        return Err(ApiError::forbidden());
    }
    if !auth.permits_project(scope) {
        return Err(ApiError::not_found());
    }
    Ok(())
}
/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/projects/{project}/billing",
///   "method": "get",
///   "operation": {
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "operationId": "getCustomerBilling",
///     "summary": "Read workspace customer charges, tariffs and latest 100 invoices",
///     "description": "Requires workspace read access. Balances cover the full ledger per currency. All monetary amounts and aggregate counts are decimal integer strings. Upstream costs are separate. Cache-Control is no-store.",
///     "responses": {
///       "200": {
///         "description": "Billing overview",
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
///                     "balances",
///                     "unresolved",
///                     "unpriced",
///                     "tariffs",
///                     "invoices"
///                   ],
///                   "properties": {
///                     "balances": {
///                       "type": "array",
///                       "items": {
///                         "type": "object",
///                         "required": [
///                           "currency",
///                           "charged_nanos",
///                           "unbilled_nanos",
///                           "due_nanos",
///                           "paid_nanos"
///                         ],
///                         "properties": {
///                           "currency": {
///                             "type": "string"
///                           },
///                           "charged_nanos": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$"
///                           },
///                           "unbilled_nanos": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$"
///                           },
///                           "due_nanos": {
///                             "allOf": [
///                               {
///                                 "type": "string",
///                                 "pattern": "^[0-9]+$"
///                               }
///                             ],
///                             "description": "Invoiced charges without an invoice receipt or matching balance debit."
///                           },
///                           "paid_nanos": {
///                             "allOf": [
///                               {
///                                 "type": "string",
///                                 "pattern": "^[0-9]+$"
///                               }
///                             ],
///                             "description": "Charges settled by a balance debit or invoice receipt, counted once, including balance debits before invoicing."
///                           }
///                         }
///                       }
///                     },
///                     "unresolved": {
///                       "allOf": [
///                         {
///                           "type": "string",
///                           "pattern": "^[0-9]+$"
///                         }
///                       ],
///                       "description": "Dispatched non-personal requests with a text or media price binding but no corresponding charge; excludes confirmed nonexecution."
///                     },
///                     "unpriced": {
///                       "allOf": [
///                         {
///                           "type": "string",
///                           "pattern": "^[0-9]+$"
///                         }
///                       ],
///                       "description": "Dispatched non-personal requests without either a text or media price binding; excludes confirmed nonexecution."
///                     },
///                     "tariffs": {
///                       "type": "array",
///                       "items": {
///                         "type": "object",
///                         "required": [
///                           "model_alias",
///                           "revision",
///                           "currency",
///                           "prompt_rate",
///                           "completion_rate"
///                         ],
///                         "properties": {
///                           "model_alias": {
///                             "type": "string"
///                           },
///                           "revision": {
///                             "type": "string",
///                             "format": "uuid"
///                           },
///                           "currency": {
///                             "type": "string"
///                           },
///                           "prompt_rate": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$"
///                           },
///                           "completion_rate": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$"
///                           },
///                           "minimum_charge_nanos": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$",
///                             "description": "Minimum customer charge in currency nanounits (0 to 9223372036854775807), not a token rate. Defaults to zero for new tariffs. Replacing a nonzero minimum requires an explicit value; zero disables it. Known completed usage is charged the greater of the rounded token amount plus request_fee_nanos and this minimum. Unknown usage remains unresolved."
///                           },
///                           "cached_prompt_rate": {
///                             "type": [
///                               "string",
///                               "null"
///                             ],
///                             "pattern": "^[0-9]+$"
///                           },
///                           "request_fee_nanos": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$",
///                             "description": "Customer-only fixed fee in currency nanounits (0 to 9223372036854775807). Charge = max(rounded token charge + request fee, minimum charge) for known completed usage. Unknown execution/usage and confirmed rejection do not create a fee. Defaults to zero on new tariffs; replacement of a nonzero fee requires an explicit value; zero disables it."
///                           }
///                         }
///                       }
///                     },
///                     "invoices": {
///                       "type": "array",
///                       "items": {
///                         "type": "object",
///                         "required": [
///                           "id",
///                           "from_ms",
///                           "to_ms",
///                           "currency",
///                           "amount_nanos",
///                           "created_at",
///                           "status",
///                           "payment_reference"
///                         ],
///                         "properties": {
///                           "id": {
///                             "type": "string",
///                             "format": "uuid"
///                           },
///                           "from_ms": {
///                             "type": "integer",
///                             "format": "int64"
///                           },
///                           "to_ms": {
///                             "type": "integer",
///                             "format": "int64"
///                           },
///                           "currency": {
///                             "type": "string"
///                           },
///                           "amount_nanos": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$"
///                           },
///                           "created_at": {
///                             "type": "string",
///                             "format": "date-time"
///                           },
///                           "status": {
///                             "type": "string",
///                             "enum": [
///                               "issued",
///                               "paid"
///                             ],
///                             "description": "Paid when an invoice receipt exists or every included charge is settled by a matching balance debit or has zero value. Credit-backed account debt remains separate."
///                           },
///                           "payment_reference": {
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
///       "401": {
///         "description": "Invalid or expired credential"
///       },
///       "404": {
///         "description": "Workspace outside authorized scope"
///       }
///     },
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
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub async fn overview(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<Value>, ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    authorize(&state, &headers, scope, false).await?;
    Ok(Json(
        json!({"data":state.store.customer_billing(scope).await.map_err(ApiError::from_store)?}),
    ))
}

/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/projects/{project}/billing/tariffs",
///   "method": "post",
///   "operation": {
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "operationId": "publishCustomerSellingRate",
///     "summary": "Publish an immutable customer selling rate revision",
///     "description": "Installation only. Rates are currency nanounits per million text tokens, bounded at 1000000000000000. Optional cached_prompt_rate independently prices reported cached input. Null selects flat input pricing. When replacing an existing cached tariff this field must be explicit; omission conflicts. Missing cached usage keeps charges unresolved. No retroactive billing. Cache-Control is no-store.",
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "model_alias",
///               "currency",
///               "prompt_rate",
///               "completion_rate"
///             ],
///             "properties": {
///               "model_alias": {
///                 "type": "string",
///                 "maxLength": 200
///               },
///               "currency": {
///                 "type": "string",
///                 "pattern": "^[A-Z]{3}$"
///               },
///               "prompt_rate": {
///                 "type": "string",
///                 "pattern": "^[0-9]+$"
///               },
///               "completion_rate": {
///                 "type": "string",
///                 "pattern": "^[0-9]+$"
///               },
///               "minimum_charge_nanos": {
///                 "type": "string",
///                 "pattern": "^[0-9]+$",
///                 "description": "Minimum customer charge in currency nanounits (0 to 9223372036854775807), not a token rate. Defaults to zero for new tariffs. Replacing a nonzero minimum requires an explicit value; zero disables it. Known completed usage is charged the greater of the rounded token amount plus request_fee_nanos and this minimum. Unknown usage remains unresolved."
///               },
///               "cached_prompt_rate": {
///                 "type": [
///                   "string",
///                   "null"
///                 ],
///                 "pattern": "^[0-9]+$",
///                 "description": "Optional cache-read rate with the same unit and maximum as prompt_rate."
///               },
///               "expected_revision": {
///                 "type": [
///                   "string",
///                   "null"
///                 ],
///                 "format": "uuid"
///               },
///               "request_fee_nanos": {
///                 "type": "string",
///                 "pattern": "^[0-9]+$",
///                 "description": "Customer-only fixed fee in currency nanounits (0 to 9223372036854775807). Charge = max(rounded token charge + request fee, minimum charge) for known completed usage. Unknown execution/usage and confirmed rejection do not create a fee. Defaults to zero on new tariffs; replacement of a nonzero fee requires an explicit value; zero disables it."
///               }
///             }
///           }
///         }
///       }
///     },
///     "responses": {
///       "200": {
///         "description": "Published immutable customer tariff revision",
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
///         "description": "Invalid rates, currency or unavailable model alias"
///       },
///       "403": {
///         "description": "Installation authority required"
///       },
///       "409": {
///         "description": "Stale expected revision"
///       },
///       "401": {
///         "description": "Invalid or expired administrative credential."
///       },
///       "404": {
///         "description": "Workspace outside authorized scope."
///       }
///     },
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
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub async fn tariff(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    Json(input): Json<crate::token_pricing::CustomerTariffInput>,
) -> Result<Json<Value>, ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    authorize(&state, &headers, scope, true).await?;
    let models = crate::vendors::effective_models(&state).await?;
    if !models.contains_key(&input.model_alias) {
        return Err(ApiError::invalid_request("Choose an available model alias"));
    }
    let rates = ProviderOfferInput {
        model_alias: input.model_alias,
        currency: input.currency,
        prompt_rate: input.prompt_rate,
        completion_rate: input.completion_rate,
        expected_revision: input.expected_revision,
    };
    let cached = input
        .cached_prompt_rate
        .as_ref()
        .map(|rate| rate.as_deref());
    Ok(Json(
        json!({"data":{"revision":state.store.publish_customer_tariff_with_fixed(scope,&rates,cached,input.minimum_charge_nanos.as_deref(),input.request_fee_nanos.as_deref()).await.map_err(ApiError::from_store)?}}),
    ))
}

/// Platform-owned customer selling configuration, separate from procurement.
/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/billing/media-rates",
///   "method": "post",
///   "operation": {
///     "operationId": "publishCustomerMediaRate",
///     "summary": "Publish an immutable customer video selling schedule",
///     "description": "Platform administrator with write access required. Ordinary company members and inference keys cannot publish prices or liability limits. Pins exact credential/model/schema revisions and a configured qualification reference; registration does not qualify commercial supply or enable video dispatch. Rejects personal credentials and stale routes. Replaying identical current configuration is idempotent; changed content under the same revision conflicts. Procurement terms never belong in this body. Maximum JSON body is 128 KiB.",
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "$ref": "#/components/schemas/MediaBillingCustomerMediaRateCard"
///           }
///         }
///       }
///     },
///     "responses": {
///       "200": {
///         "description": "Customer selling revision published or identical replay accepted",
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
///                     "revision"
///                   ],
///                   "properties": {
///                     "revision": {
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
///         "description": "Invalid tariff, dimensions, discount or liability configuration"
///       },
///       "401": {
///         "description": "Administrator authentication required"
///       },
///       "403": {
///         "description": "Platform-administrator write permission required"
///       },
///       "409": {
///         "description": "Changed revision, stale route or personal credential"
///       },
///       "413": {
///         "description": "Body exceeds 128 KiB"
///       },
///       "422": {
///         "description": "Malformed typed JSON body"
///       },
///       "503": {
///         "description": "Durable storage unavailable"
///       }
///     },
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
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "x-niu-implementation": "implemented"
///   },
///   "schemas": {
///     "MediaBillingCustomerMediaRateCard": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "revision",
///         "vendor_id",
///         "vendor_revision",
///         "model_revision",
///         "schema_revision",
///         "offer_revision",
///         "tariff",
///         "discounts",
///         "maximum_quantity",
///         "liability_qualification_revision"
///       ],
///       "properties": {
///         "revision": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 256
///         },
///         "vendor_id": {
///           "type": "string",
///           "format": "uuid",
///           "description": "Internal route reference; never a display label."
///         },
///         "vendor_revision": {
///           "type": "integer",
///           "minimum": 1,
///           "format": "int64"
///         },
///         "model_revision": {
///           "type": "integer",
///           "minimum": 1,
///           "format": "int64"
///         },
///         "schema_revision": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 256
///         },
///         "offer_revision": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 256
///         },
///         "tariff": {
///           "$ref": "#/components/schemas/MediaBillingMediaSellingTariff"
///         },
///         "discounts": {
///           "type": "array",
///           "maxItems": 64,
///           "items": {
///             "$ref": "#/components/schemas/MediaBillingMediaSellingDiscount"
///           }
///         },
///         "maximum_quantity": {
///           "$ref": "#/components/schemas/MediaBillingExactMediaQuantity"
///         },
///         "liability_qualification_revision": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 256,
///           "description": "Reference to independently qualified upper-bound evidence; a point estimate is insufficient."
///         }
///       }
///     },
///     "MediaBillingMediaSellingTariff": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "revision",
///         "dimensions",
///         "meter",
///         "currency",
///         "decimal_places",
///         "amount_units",
///         "per_quantity",
///         "minimum_quantity",
///         "rounding",
///         "effective_from"
///       ],
///       "properties": {
///         "revision": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 256
///         },
///         "dimensions": {
///           "$ref": "#/components/schemas/MediaBillingMediaBillingDimensions"
///         },
///         "meter": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 256
///         },
///         "currency": {
///           "type": "string",
///           "pattern": "^[A-Z]{3}$"
///         },
///         "decimal_places": {
///           "type": "integer",
///           "minimum": 0,
///           "maximum": 9
///         },
///         "amount_units": {
///           "type": "integer",
///           "minimum": 0,
///           "description": "Exact u64 smallest accounting units at the declared decimal precision. JavaScript SDK requires a safe integer."
///         },
///         "per_quantity": {
///           "$ref": "#/components/schemas/MediaBillingExactMediaQuantity"
///         },
///         "minimum_quantity": {
///           "$ref": "#/components/schemas/MediaBillingExactMediaQuantity"
///         },
///         "rounding": {
///           "type": "string",
///           "enum": [
///             "Down",
///             "Up",
///             "HalfEven"
///           ]
///         },
///         "effective_from": {
///           "type": "integer",
///           "format": "int64",
///           "description": "Unix seconds, inclusive."
///         },
///         "effective_until": {
///           "type": [
///             "integer",
///             "null"
///           ],
///           "format": "int64",
///           "description": "Unix seconds, exclusive; must exceed effective_from."
///         }
///       }
///     },
///     "MediaBillingMediaBillingDimensions": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "model",
///         "channel",
///         "resolution",
///         "reference_video"
///       ],
///       "properties": {
///         "model": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 256
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
///       }
///     },
///     "MediaBillingExactMediaQuantity": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "numerator",
///         "denominator"
///       ],
///       "description": "Reduced nonnegative rational quantity; canonical decimal strings bounded to u128. Denominator must be positive. Maximum liability quantity must be positive.",
///       "properties": {
///         "numerator": {
///           "type": "string",
///           "maxLength": 39,
///           "pattern": "^(0|[1-9][0-9]*)$"
///         },
///         "denominator": {
///           "type": "string",
///           "maxLength": 39,
///           "pattern": "^[1-9][0-9]*$"
///         }
///       }
///     },
///     "MediaBillingMediaSellingDiscount": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "revision",
///         "effective_from",
///         "priority",
///         "stacking",
///         "multiplier"
///       ],
///       "properties": {
///         "revision": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 256
///         },
///         "dimensions": {
///           "anyOf": [
///             {
///               "$ref": "#/components/schemas/MediaBillingMediaBillingDimensions"
///             },
///             {
///               "type": "null"
///             }
///           ]
///         },
///         "offer": {
///           "type": [
///             "string",
///             "null"
///           ]
///         },
///         "customer": {
///           "type": [
///             "string",
///             "null"
///           ]
///         },
///         "effective_from": {
///           "type": "integer",
///           "format": "int64"
///         },
///         "effective_until": {
///           "type": [
///             "integer",
///             "null"
///           ],
///           "format": "int64"
///         },
///         "priority": {
///           "type": "integer",
///           "format": "int32"
///         },
///         "stacking": {
///           "type": "string",
///           "enum": [
///             "Exclusive",
///             "Multiply"
///           ]
///         },
///         "multiplier": {
///           "$ref": "#/components/schemas/MediaBillingExactMediaQuantity"
///         }
///       }
///     }
///   }
/// }
/// ```
pub async fn media_rate(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(organization): Path<Uuid>,
    Json(input): Json<niu_storage::CustomerMediaRateCard>,
) -> Result<Json<Value>, ApiError> {
    state.authorize_platform_headers(&headers).await?;
    state
        .store
        .register_customer_media_rate(organization, &input)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"revision":input.revision}})))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MediaRatePage {
    after: Option<String>,
    limit: Option<i64>,
}

/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/billing/media-rate-models",
///   "method": "get",
///   "operation": {
///     "operationId": "listCustomerMediaRateModels",
///     "summary": "Read named qualified commercial video configuration choices",
///     "description": "Platform-administrator read permission required. Installation credentials and explicitly granted member administrators are supported. Lists currently active, qualified, nonpersonal routes with exact credential/model/offer/schema bindings. No credentials, endpoints, purchase prices or customer charges. Cursor advances over raw model aliases even when invalid schemas are omitted; empty pages can therefore have a continuation. Choices do not authorize dispatch or guarantee later availability.",
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
///         "name": "after",
///         "in": "query",
///         "schema": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 256
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
///         "description": "Bounded current choices",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data",
///                 "has_more",
///                 "next_after"
///               ],
///               "properties": {
///                 "has_more": {
///                   "type": "boolean"
///                 },
///                 "next_after": {
///                   "type": [
///                     "string",
///                     "null"
///                   ]
///                 },
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "type": "object",
///                     "required": [
///                       "model_alias",
///                       "api_key_name",
///                       "vendor_id",
///                       "offer_revision",
///                       "vendor_revision",
///                       "model_revision",
///                       "schema_revision",
///                       "channel",
///                       "resolutions",
///                       "reference_video"
///                     ],
///                     "properties": {
///                       "model_alias": {
///                         "type": "string"
///                       },
///                       "api_key_name": {
///                         "type": "string"
///                       },
///                       "vendor_id": {
///                         "type": "string",
///                         "format": "uuid",
///                         "description": "Internal configuration binding; never a display label."
///                       },
///                       "offer_revision": {
///                         "type": "string",
///                         "format": "uuid"
///                       },
///                       "vendor_revision": {
///                         "type": "string",
///                         "pattern": "^[0-9]+$"
///                       },
///                       "model_revision": {
///                         "type": "string",
///                         "pattern": "^[0-9]+$"
///                       },
///                       "schema_revision": {
///                         "type": "string"
///                       },
///                       "channel": {
///                         "type": "string"
///                       },
///                       "resolutions": {
///                         "type": "array",
///                         "items": {
///                           "type": "string"
///                         }
///                       },
///                       "reference_video": {
///                         "type": "boolean"
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
///         "description": "Invalid cursor or page size"
///       },
///       "401": {
///         "description": "Administrator authentication required"
///       },
///       "403": {
///         "description": "Platform-administrator read permission required"
///       },
///       "503": {
///         "description": "Durable storage unavailable"
///       }
///     },
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub async fn media_rate_models(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(_organization): Path<Uuid>,
    Query(page): Query<MediaRatePage>,
) -> Result<Json<Value>, ApiError> {
    state.authorize_platform_headers(&headers).await?;
    Ok(Json(
        state
            .store
            .customer_media_rate_models(page.after.as_deref(), page.limit.unwrap_or(50))
            .await
            .map_err(ApiError::from_store)?,
    ))
}

/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/billing/media-rates",
///   "method": "get",
///   "operation": {
///     "operationId": "listCustomerMediaRates",
///     "summary": "Read bounded immutable customer selling history",
///     "description": "Platform-administrator read permission required. Installation credentials and explicitly granted member administrators are supported. Ordinary company members and inference keys cannot read platform pricing configuration. Returns original cards, immutable retirement and creation time; never reads Supplier purchase terms. Card vendor/model revisions, tariff amount/time values and discount times are exact decimal strings, while quantities retain numerator/denominator strings. Ordering and cursors use the immutable card revision.",
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
///         "name": "after",
///         "in": "query",
///         "schema": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 256
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
///         "description": "Scoped history page, including an empty page",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data",
///                 "has_more",
///                 "next_after"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "type": "object",
///                     "required": [
///                       "card",
///                       "retirement_effective_until",
///                       "created_at"
///                     ],
///                     "properties": {
///                       "card": {
///                         "$ref": "#/components/schemas/MediaBillingCustomerMediaRateRecordCard"
///                       },
///                       "retirement_effective_until": {
///                         "type": [
///                           "string",
///                           "null"
///                         ],
///                         "pattern": "^-?[0-9]+$"
///                       },
///                       "created_at": {
///                         "type": [
///                           "string",
///                           "null"
///                         ],
///                         "format": "date-time"
///                       }
///                     }
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
///         "description": "Invalid page size or cursor"
///       },
///       "401": {
///         "description": "Administrator authentication required"
///       },
///       "403": {
///         "description": "Platform-administrator read permission required"
///       },
///       "503": {
///         "description": "Durable storage unavailable"
///       }
///     },
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "x-niu-implementation": "implemented"
///   },
///   "schemas": {
///     "MediaBillingCustomerMediaRateRecordCard": {
///       "type": "object",
///       "required": [
///         "revision",
///         "vendor_id",
///         "vendor_revision",
///         "model_revision",
///         "schema_revision",
///         "offer_revision",
///         "tariff",
///         "discounts",
///         "maximum_quantity",
///         "liability_qualification_revision"
///       ],
///       "properties": {
///         "revision": {
///           "type": "string"
///         },
///         "vendor_id": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "vendor_revision": {
///           "type": "string",
///           "pattern": "^[0-9]+$"
///         },
///         "model_revision": {
///           "type": "string",
///           "pattern": "^[0-9]+$"
///         },
///         "schema_revision": {
///           "type": "string"
///         },
///         "offer_revision": {
///           "type": "string"
///         },
///         "maximum_quantity": {
///           "$ref": "#/components/schemas/MediaBillingExactMediaQuantity"
///         },
///         "liability_qualification_revision": {
///           "type": "string"
///         },
///         "tariff": {
///           "$ref": "#/components/schemas/MediaBillingMediaSellingTariffRecord"
///         },
///         "discounts": {
///           "type": "array",
///           "items": {
///             "$ref": "#/components/schemas/MediaBillingMediaSellingDiscountRecord"
///           }
///         }
///       }
///     },
///     "MediaBillingMediaSellingTariffRecord": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "revision",
///         "dimensions",
///         "meter",
///         "currency",
///         "decimal_places",
///         "amount_units",
///         "per_quantity",
///         "minimum_quantity",
///         "rounding",
///         "effective_from"
///       ],
///       "properties": {
///         "revision": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 256
///         },
///         "dimensions": {
///           "$ref": "#/components/schemas/MediaBillingMediaBillingDimensions"
///         },
///         "meter": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 256
///         },
///         "currency": {
///           "type": "string",
///           "pattern": "^[A-Z]{3}$"
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
///           "$ref": "#/components/schemas/MediaBillingExactMediaQuantity"
///         },
///         "minimum_quantity": {
///           "$ref": "#/components/schemas/MediaBillingExactMediaQuantity"
///         },
///         "rounding": {
///           "type": "string",
///           "enum": [
///             "Down",
///             "Up",
///             "HalfEven"
///           ]
///         },
///         "effective_from": {
///           "type": "string",
///           "pattern": "^-?[0-9]+$"
///         },
///         "effective_until": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "pattern": "^-?[0-9]+$"
///         }
///       }
///     },
///     "MediaBillingMediaSellingDiscountRecord": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "revision",
///         "effective_from",
///         "priority",
///         "stacking",
///         "multiplier"
///       ],
///       "properties": {
///         "revision": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 256
///         },
///         "dimensions": {
///           "anyOf": [
///             {
///               "$ref": "#/components/schemas/MediaBillingMediaBillingDimensions"
///             },
///             {
///               "type": "null"
///             }
///           ]
///         },
///         "offer": {
///           "type": [
///             "string",
///             "null"
///           ]
///         },
///         "customer": {
///           "type": [
///             "string",
///             "null"
///           ]
///         },
///         "effective_from": {
///           "type": "string",
///           "pattern": "^-?[0-9]+$"
///         },
///         "effective_until": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "pattern": "^-?[0-9]+$"
///         },
///         "priority": {
///           "type": "integer",
///           "format": "int32"
///         },
///         "stacking": {
///           "type": "string",
///           "enum": [
///             "Exclusive",
///             "Multiply"
///           ]
///         },
///         "multiplier": {
///           "$ref": "#/components/schemas/MediaBillingExactMediaQuantity"
///         }
///       }
///     }
///   }
/// }
/// ```
pub async fn media_rates(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(organization): Path<Uuid>,
    Query(page): Query<MediaRatePage>,
) -> Result<Json<Value>, ApiError> {
    state.authorize_platform_headers(&headers).await?;
    Ok(Json(
        state
            .store
            .customer_media_rates(
                organization,
                page.after.as_deref(),
                page.limit.unwrap_or(50),
            )
            .await
            .map_err(ApiError::from_store)?,
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MediaRateReplacementInput {
    previous_revision: String,
    rate: niu_storage::CustomerMediaRateCard,
}

/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/billing/media-rates/replace",
///   "method": "post",
///   "operation": {
///     "operationId": "replaceCustomerMediaRate",
///     "summary": "Atomically replace a customer media selling schedule",
///     "description": "Platform-administrator write permission required. Installation credentials and explicitly granted member administrators are supported. Publishes the immutable replacement and retires the previous scoped schedule at the new effective start in one transaction. Dimensions and meter must match; competing effective schedules conflict. Identical replay is accepted while route bindings remain current. Any publication or retirement failure rolls back both changes. Historical cards and pinned jobs are unchanged. No procurement fallback or automatic submission retry.",
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "previous_revision",
///               "rate"
///             ],
///             "properties": {
///               "previous_revision": {
///                 "type": "string",
///                 "minLength": 1,
///                 "maxLength": 256
///               },
///               "rate": {
///                 "$ref": "#/components/schemas/MediaBillingCustomerMediaRateCard"
///               }
///             }
///           }
///         }
///       }
///     },
///     "responses": {
///       "200": {
///         "description": "Replacement committed or identical replay accepted",
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
///                     "effective_from"
///                   ],
///                   "properties": {
///                     "revision": {
///                       "type": "string"
///                     },
///                     "effective_from": {
///                       "type": "string",
///                       "pattern": "^-?[0-9]+$"
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid card, changed dimensions or cutoff outside original interval"
///       },
///       "401": {
///         "description": "Administrator authentication required"
///       },
///       "403": {
///         "description": "Platform-administrator write permission required"
///       },
///       "409": {
///         "description": "Missing scoped revision, competing schedule, stale route or conflicting receipt"
///       },
///       "413": {
///         "description": "Body exceeds 128 KiB"
///       },
///       "422": {
///         "description": "Malformed typed JSON body"
///       },
///       "503": {
///         "description": "Durable storage unavailable"
///       }
///     },
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
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub async fn replace_media_rate(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(organization): Path<Uuid>,
    Json(input): Json<MediaRateReplacementInput>,
) -> Result<Json<Value>, ApiError> {
    state.authorize_platform_headers(&headers).await?;
    state
        .store
        .replace_customer_media_rate(organization, &input.previous_revision, &input.rate)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(
        json!({"data":{"revision":input.rate.revision,"effective_from":input.rate.tariff.effective_from.to_string()}}),
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MediaRateRetirementInput {
    effective_until: i64,
}

/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/billing/media-rates/{revision}/retire",
///   "method": "post",
///   "operation": {
///     "operationId": "retireCustomerMediaRate",
///     "summary": "End a published customer media rate's eligibility",
///     "description": "Platform-administrator write permission required. Installation credentials and explicitly granted member administrators are supported. Appends an immutable cutoff without modifying the original card or historical job snapshots. Cutoff is inclusive for retirement and must be within the original effective interval, including its start/end boundaries. Exact replay is idempotent; changed cutoff or unknown customer/revision conflicts. Publish the replacement with an effective start matching the cutoff. No rate or procurement fallback occurs if no eligible replacement exists; remaining overlaps are rejected as ambiguous.",
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "effective_until"
///             ],
///             "properties": {
///               "effective_until": {
///                 "type": "integer",
///                 "description": "Unix seconds"
///               }
///             }
///           }
///         }
///       }
///     },
///     "responses": {
///       "200": {
///         "description": "Retirement saved or identical replay accepted",
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
///                     "effective_until"
///                   ],
///                   "properties": {
///                     "revision": {
///                       "type": "string"
///                     },
///                     "effective_until": {
///                       "type": "string",
///                       "pattern": "^-?[0-9]+$"
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid revision or cutoff outside original interval"
///       },
///       "401": {
///         "description": "Administrator authentication required"
///       },
///       "403": {
///         "description": "Platform-administrator write permission required"
///       },
///       "409": {
///         "description": "Missing scoped revision or conflicting previous cutoff"
///       },
///       "413": {
///         "description": "Body exceeds 1 KiB"
///       },
///       "422": {
///         "description": "Malformed typed JSON body"
///       },
///       "503": {
///         "description": "Durable storage unavailable"
///       }
///     },
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
///         "name": "revision",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 256
///         }
///       }
///     ],
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub async fn retire_media_rate(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization, revision)): Path<(Uuid, String)>,
    Json(input): Json<MediaRateRetirementInput>,
) -> Result<Json<Value>, ApiError> {
    state.authorize_platform_headers(&headers).await?;
    state
        .store
        .retire_customer_media_rate(organization, &revision, input.effective_until)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(
        json!({"data":{"revision":revision,"effective_until":input.effective_until.to_string()}}),
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InvoiceInput {
    from_ms: i64,
    to_ms: i64,
    currency: String,
    idempotency_key: Uuid,
}
/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/projects/{project}/billing/invoices",
///   "method": "post",
///   "operation": {
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "operationId": "issueCustomerUsageInvoice",
///     "summary": "Issue an immutable itemized usage statement",
///     "description": "Installation only. Half-open UTC dispatch interval [from_ms, to_ms), maximum 366 days, one currency. Includes text and media charges. Rejects unresolved priced usage, unsettled media balance debits, overlapping periods and empty periods. Exact idempotent retries return the same invoice. Does not collect money or calculate tax. Cache-Control is no-store.",
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "from_ms",
///               "to_ms",
///               "currency",
///               "idempotency_key"
///             ],
///             "properties": {
///               "from_ms": {
///                 "type": "integer",
///                 "format": "int64",
///                 "minimum": 0
///               },
///               "to_ms": {
///                 "type": "integer",
///                 "format": "int64"
///               },
///               "currency": {
///                 "type": "string",
///                 "pattern": "^[A-Z]{3}$"
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
///         "description": "Invoice identity, including an exact idempotent replay",
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
///                     "id"
///                   ],
///                   "properties": {
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
///         "description": "Invalid period or currency"
///       },
///       "403": {
///         "description": "Installation authority required"
///       },
///       "409": {
///         "description": "Unresolved usage, overlapping or empty period, or changed idempotency payload"
///       },
///       "401": {
///         "description": "Invalid or expired administrative credential."
///       },
///       "404": {
///         "description": "Workspace outside authorized scope."
///       }
///     },
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
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub async fn issue(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    Json(input): Json<InvoiceInput>,
) -> Result<Json<Value>, ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    authorize(&state, &headers, scope, true).await?;
    let id = state
        .store
        .issue_customer_invoice(
            scope,
            input.from_ms,
            input.to_ms,
            &input.currency,
            input.idempotency_key,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"id":id}})))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InvoiceLinesQuery {
    media_after: Option<Uuid>,
}
/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/projects/{project}/billing/invoices/{invoice}",
///   "method": "get",
///   "operation": {
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "operationId": "getCustomerInvoiceLines",
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
///         "name": "invoice",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "media_after",
///         "in": "query",
///         "description": "Opaque media_next_cursor from the preceding page. Text groups repeat on each page.",
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       }
///     ],
///     "summary": "Read invoice lines grouped by model and pinned rate revision",
///     "description": "Requires workspace read access. Returns no entries for an invoice outside that workspace. Cache-Control is no-store. Text quantities and rates are pinned to the charge revision; publishing a new tariff does not reprice historical invoice lines. Supplier expenses are never included.",
///     "responses": {
///       "200": {
///         "description": "Grouped immutable charge entries",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data",
///                 "media_lines",
///                 "media_next_cursor"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "allOf": [
///                       {
///                         "type": "object",
///                         "required": [
///                           "model_alias",
///                           "revision",
///                           "currency",
///                           "prompt_rate",
///                           "completion_rate"
///                         ],
///                         "properties": {
///                           "model_alias": {
///                             "type": "string"
///                           },
///                           "revision": {
///                             "type": "string",
///                             "format": "uuid"
///                           },
///                           "currency": {
///                             "type": "string"
///                           },
///                           "prompt_rate": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$"
///                           },
///                           "completion_rate": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$"
///                           },
///                           "minimum_charge_nanos": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$",
///                             "description": "Minimum customer charge in currency nanounits (0 to 9223372036854775807), not a token rate. Defaults to zero for new tariffs. Replacing a nonzero minimum requires an explicit value; zero disables it. Known completed usage is charged the greater of the rounded token amount plus request_fee_nanos and this minimum. Unknown usage remains unresolved."
///                           },
///                           "cached_prompt_rate": {
///                             "type": [
///                               "string",
///                               "null"
///                             ],
///                             "pattern": "^[0-9]+$"
///                           },
///                           "request_fee_nanos": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$",
///                             "description": "Customer-only fixed fee in currency nanounits (0 to 9223372036854775807). Charge = max(rounded token charge + request fee, minimum charge) for known completed usage. Unknown execution/usage and confirmed rejection do not create a fee. Defaults to zero on new tariffs; replacement of a nonzero fee requires an explicit value; zero disables it."
///                           }
///                         }
///                       },
///                       {
///                         "type": "object",
///                         "required": [
///                           "requests",
///                           "prompt_tokens",
///                           "completion_tokens",
///                           "amount_nanos"
///                         ],
///                         "properties": {
///                           "requests": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$"
///                           },
///                           "prompt_tokens": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$"
///                           },
///                           "completion_tokens": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$"
///                           },
///                           "cached_prompt_tokens": {
///                             "type": [
///                               "string",
///                               "null"
///                             ],
///                             "pattern": "^[0-9]+$"
///                           },
///                           "minimum_charge_nanos": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$",
///                             "description": "Minimum customer charge in currency nanounits (0 to 9223372036854775807), not a token rate. Defaults to zero for new tariffs. Replacing a nonzero minimum requires an explicit value; zero disables it. Known completed usage is charged the greater of the rounded token amount plus request_fee_nanos and this minimum. Unknown usage remains unresolved."
///                           },
///                           "cached_prompt_rate": {
///                             "type": [
///                               "string",
///                               "null"
///                             ],
///                             "pattern": "^[0-9]+$"
///                           },
///                           "amount_nanos": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$"
///                           },
///                           "request_fee_nanos": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$",
///                             "description": "Customer-only fixed fee in currency nanounits (0 to 9223372036854775807). Charge = max(rounded token charge + request fee, minimum charge) for known completed usage. Unknown execution/usage and confirmed rejection do not create a fee. Defaults to zero on new tariffs; replacement of a nonzero fee requires an explicit value; zero disables it."
///                           }
///                         }
///                       }
///                     ]
///                   }
///                 },
///                 "media_next_cursor": {
///                   "type": [
///                     "string",
///                     "null"
///                   ],
///                   "format": "uuid",
///                   "description": "Pass as media_after for the next page; null when exhausted."
///                 },
///                 "media_lines": {
///                   "type": "array",
///                   "maxItems": 100,
///                   "description": "Per-request customer media receipts. Text groups remain in data; both arrays contribute to the invoice total.",
///                   "items": {
///                     "type": "object",
///                     "required": [
///                       "model_alias",
///                       "currency",
///                       "amount_nanos",
///                       "tariff_revision",
///                       "meter",
///                       "measured_quantity",
///                       "billable_quantity",
///                       "discount_revisions",
///                       "bound_exceeded"
///                     ],
///                     "properties": {
///                       "model_alias": {
///                         "type": "string"
///                       },
///                       "currency": {
///                         "type": "string"
///                       },
///                       "amount_nanos": {
///                         "type": "string",
///                         "pattern": "^[0-9]+$"
///                       },
///                       "tariff_revision": {
///                         "type": "string"
///                       },
///                       "meter": {
///                         "type": "string"
///                       },
///                       "measured_quantity": {
///                         "type": "object",
///                         "required": [
///                           "numerator",
///                           "denominator"
///                         ],
///                         "properties": {
///                           "numerator": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$"
///                           },
///                           "denominator": {
///                             "type": "string",
///                             "pattern": "^[1-9][0-9]*$"
///                           }
///                         }
///                       },
///                       "billable_quantity": {
///                         "type": "object",
///                         "required": [
///                           "numerator",
///                           "denominator"
///                         ],
///                         "properties": {
///                           "numerator": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$"
///                           },
///                           "denominator": {
///                             "type": "string",
///                             "pattern": "^[1-9][0-9]*$"
///                           }
///                         }
///                       },
///                       "discount_revisions": {
///                         "type": "array",
///                         "items": {
///                           "type": "string"
///                         }
///                       },
///                       "bound_exceeded": {
///                         "type": "boolean"
///                       }
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "404": {
///         "description": "Workspace outside authorized scope"
///       },
///       "401": {
///         "description": "Invalid or expired administrative credential."
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub async fn lines(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<InvoiceLinesQuery>,
    Path((organization_id, project_id, invoice)): Path<(Uuid, Uuid, Uuid)>,
) -> Result<Json<Value>, ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    authorize(&state, &headers, scope, false).await?;
    let (media_lines, media_next_cursor) = state
        .store
        .customer_invoice_media_lines(scope, invoice, query.media_after)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(
        json!({"data":state.store.customer_invoice_lines(scope,invoice).await.map_err(ApiError::from_store)?, "media_lines":media_lines, "media_next_cursor":media_next_cursor}),
    ))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PaymentInput {
    payment_reference: String,
}
pub async fn payment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization_id, project_id, invoice)): Path<(Uuid, Uuid, Uuid)>,
    Json(input): Json<PaymentInput>,
) -> Result<Json<Value>, ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    authorize(&state, &headers, scope, true).await?;
    state
        .store
        .record_customer_payment(scope, invoice, &input.payment_reference)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"id":invoice}})))
}

/// Shared-account read, deliberately separate from workspace billing readers.
/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/billing/balance",
///   "method": "get",
///   "operation": {
///     "operationId": "getCustomerBalance",
///     "summary": "Read shared company account balances",
///     "description": "Requires organization-wide owner/admin access or installation administration. Workspace-only sessions and organization viewers cannot read shared funds. Exact nanounit amounts are decimal strings. Available funds equal posted balance plus approved credit minus outstanding liabilities (including known media charges above their original holds); each request must still atomically reserve its full liability. No account identifiers, Supplier prices or payment references are exposed.",
///     "responses": {
///       "200": {
///         "description": "Customer balance summaries by currency",
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
///                   "items": {
///                     "type": "object",
///                     "required": [
///                       "currency",
///                       "balance_nanos",
///                       "reserved_nanos",
///                       "outstanding_nanos",
///                       "available_nanos",
///                       "credit_limit_nanos",
///                       "warning_threshold_nanos",
///                       "policy_revision",
///                       "low_balance",
///                       "posted_credit_exhausted"
///                     ],
///                     "properties": {
///                       "currency": {
///                         "type": "string",
///                         "pattern": "^[A-Z]{3}$"
///                       },
///                       "balance_nanos": {
///                         "type": "string",
///                         "pattern": "^-?[0-9]+$"
///                       },
///                       "reserved_nanos": {
///                         "type": "string",
///                         "pattern": "^[0-9]+$"
///                       },
///                       "outstanding_nanos": {
///                         "type": "string",
///                         "pattern": "^[0-9]+$",
///                         "description": "Open customer liabilities, including known media charges above their original holds, excluding already posted debits."
///                       },
///                       "available_nanos": {
///                         "type": "string",
///                         "pattern": "^-?[0-9]+$",
///                         "description": "Posted balance plus approved credit minus outstanding_nanos; may be negative."
///                       },
///                       "credit_limit_nanos": {
///                         "type": "string",
///                         "pattern": "^[0-9]+$"
///                       },
///                       "policy_revision": {
///                         "type": "string",
///                         "pattern": "^[0-9]+$"
///                       },
///                       "warning_threshold_nanos": {
///                         "type": [
///                           "string",
///                           "null"
///                         ],
///                         "pattern": "^[0-9]+$"
///                       },
///                       "low_balance": {
///                         "type": "boolean"
///                       },
///                       "posted_credit_exhausted": {
///                         "type": "boolean"
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
///         "description": "Authentication required"
///       },
///       "404": {
///         "description": "Company account access not granted"
///       }
///     },
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
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub async fn account_balance(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(organization): Path<Uuid>,
) -> Result<Json<Value>, ApiError> {
    let auth = state
        .authorize_admin_headers(&headers, AdminPermission::Read)
        .await?;
    if !auth.permits_billing_account(organization) {
        return Err(ApiError::not_found());
    }
    Ok(Json(
        json!({"data":state.store.customer_balance_summary(organization).await.map_err(ApiError::from_store)?}),
    ))
}

/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/billing/charge-reconciliation",
///   "method": "get",
///   "operation": {
///     "operationId": "getCustomerChargeReconciliation",
///     "summary": "Compare customer charge records with prepaid ledger debits",
///     "description": "Organization-wide owner/admin or installation read access required. One database snapshot compares prepaid-bound text and media charges against original charge entries per currency. Refunds do not reduce original charge matching. Reports counts and exact decimal amounts only, with no internal identifiers or Supplier prices. Zero counts on an empty account do not establish financial readiness. This is read-only and does not verify external payment settlement, recalculate prices, reconcile legacy invoices or repair discrepancies. Pending settlement can appear as a discrepancy; use a later observation to distinguish an in-flight write from a persistent mismatch.",
///     "responses": {
///       "200": {
///         "description": "Per-currency observations",
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
///                   "items": {
///                     "type": "object",
///                     "required": [
///                       "currency",
///                       "observed_at",
///                       "charge_records",
///                       "expected_charge_nanos",
///                       "posted_charge_nanos",
///                       "missing_charge_entries",
///                       "mismatched_charge_entries",
///                       "unexpected_charge_entries",
///                       "duplicate_charge_sources",
///                       "settled_open_reservations"
///                     ],
///                     "properties": {
///                       "currency": {
///                         "type": "string",
///                         "pattern": "^[A-Z]{3}$"
///                       },
///                       "observed_at": {
///                         "type": "string",
///                         "format": "date-time"
///                       },
///                       "charge_records": {
///                         "type": "string",
///                         "pattern": "^[0-9]+$"
///                       },
///                       "expected_charge_nanos": {
///                         "type": "string",
///                         "pattern": "^[0-9]+$"
///                       },
///                       "posted_charge_nanos": {
///                         "type": "string",
///                         "pattern": "^[0-9]+$"
///                       },
///                       "missing_charge_entries": {
///                         "type": "string",
///                         "pattern": "^[0-9]+$"
///                       },
///                       "mismatched_charge_entries": {
///                         "type": "string",
///                         "pattern": "^[0-9]+$"
///                       },
///                       "unexpected_charge_entries": {
///                         "type": "string",
///                         "pattern": "^[0-9]+$"
///                       },
///                       "duplicate_charge_sources": {
///                         "type": "string",
///                         "pattern": "^[0-9]+$"
///                       },
///                       "settled_open_reservations": {
///                         "type": "string",
///                         "pattern": "^[0-9]+$"
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
///         "description": "Missing or invalid administration credentials"
///       },
///       "404": {
///         "description": "Company billing scope unavailable to this principal"
///       },
///       "503": {
///         "description": "Storage unavailable"
///       }
///     },
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
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub async fn charge_reconciliation(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(organization): Path<Uuid>,
) -> Result<Json<Value>, ApiError> {
    let auth = state
        .authorize_admin_headers(&headers, AdminPermission::Read)
        .await?;
    if !auth.permits_billing_account(organization) {
        return Err(ApiError::not_found());
    }
    Ok(Json(
        json!({"data":state.store.customer_charge_reconciliation(organization).await.map_err(ApiError::from_store)?}),
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SettledFundingInput {
    currency: String,
    amount_nanos: String,
    channel: String,
    payment_reference: String,
}

fn exact_nonnegative_integer(value: &str) -> Result<i64, ApiError> {
    if value.is_empty() || !value.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(ApiError::invalid_request(
            "Use an exact nonnegative decimal integer string.",
        ));
    }
    value
        .parse()
        .map_err(|_| ApiError::invalid_request("Decimal integer exceeds the supported range."))
}

/// Trusted administration records an externally verified settled payment.
/// This is not a customer payment callback or self-service funding endpoint.
pub async fn settled_funding(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(organization): Path<Uuid>,
    Json(input): Json<SettledFundingInput>,
) -> Result<Json<Value>, ApiError> {
    let auth = state
        .authorize_admin_headers(&headers, AdminPermission::Write)
        .await?;
    if !auth.is_installation() {
        return Err(ApiError::forbidden());
    }
    let amount = exact_nonnegative_integer(&input.amount_nanos)?;
    state
        .store
        .record_settled_customer_funding(
            organization,
            &input.currency,
            amount,
            &input.channel,
            &input.payment_reference,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"recorded":true}})))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BalancePolicyInput {
    credit_limit_nanos: String,
    warning_threshold_nanos: Option<String>,
    expected_revision: String,
}

/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/billing/accounts/{currency}/policy",
///   "method": "put",
///   "operation": {
///     "operationId": "configureCustomerBalancePolicy",
///     "summary": "Configure approved credit and low-balance threshold",
///     "description": "Installation write access only. Creates a zero-balance account if absent, with expected revision zero. Updates are revision checked and recorded in immutable history. Credit changes do not credit funds. Reductions that would invalidate held reservations are rejected. With no holds, reduced credit can exhaust capacity while preserving the actual debt. A null warning threshold disables low-balance warnings. This configures warning state, not notification-channel delivery.",
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "credit_limit_nanos",
///               "expected_revision"
///             ],
///             "properties": {
///               "credit_limit_nanos": {
///                 "type": "string",
///                 "pattern": "^[0-9]+$"
///               },
///               "warning_threshold_nanos": {
///                 "type": [
///                   "string",
///                   "null"
///                 ],
///                 "pattern": "^[0-9]+$"
///               },
///               "expected_revision": {
///                 "type": "string",
///                 "pattern": "^[0-9]+$"
///               }
///             }
///           }
///         }
///       }
///     },
///     "responses": {
///       "200": {
///         "description": "Policy saved",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "properties": {
///                 "data": {
///                   "type": "object",
///                   "properties": {
///                     "revision": {
///                       "type": "string",
///                       "pattern": "^[0-9]+$"
///                     }
///                   },
///                   "required": [
///                     "revision"
///                   ]
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
///         "description": "Invalid currency, amount or revision"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Installation write access required"
///       },
///       "409": {
///         "description": "Stale revision, unknown company or outstanding reservations prevent credit reduction"
///       }
///     },
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
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub async fn balance_policy(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization, currency)): Path<(Uuid, String)>,
    Json(input): Json<BalancePolicyInput>,
) -> Result<Json<Value>, ApiError> {
    let auth = state
        .authorize_admin_headers(&headers, AdminPermission::Write)
        .await?;
    if !auth.is_installation() {
        return Err(ApiError::forbidden());
    }
    let parse = exact_nonnegative_integer;
    let credit = parse(&input.credit_limit_nanos)?;
    let warning = input
        .warning_threshold_nanos
        .as_deref()
        .map(parse)
        .transpose()?;
    let revision = parse(&input.expected_revision)?;
    let next = state
        .store
        .configure_customer_balance_policy(organization, &currency, credit, warning, revision)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"revision":next.to_string()}})))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BalanceWarningInput {
    warning_threshold_nanos: Option<String>,
    expected_revision: String,
}

/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/billing/accounts/{currency}/warning-threshold",
///   "method": "put",
///   "operation": {
///     "operationId": "setCustomerBalanceWarning",
///     "summary": "Set company low-balance warning threshold",
///     "description": "Organization-wide owner/admin with write access or installation administrator only. Updates an existing account warning preference with revision checking; never changes funds or approved credit. Null or omitted threshold disables the warning. This does not configure external notifications.",
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "expected_revision"
///             ],
///             "properties": {
///               "warning_threshold_nanos": {
///                 "type": [
///                   "string",
///                   "null"
///                 ],
///                 "pattern": "^[0-9]+$",
///                 "description": "Exact nonnegative nanounits up to 9223372036854775807; null disables the warning."
///               },
///               "expected_revision": {
///                 "type": "string",
///                 "pattern": "^[0-9]+$",
///                 "description": "Exact current policy revision from zero through 9223372036854775806."
///               }
///             }
///           }
///         }
///       }
///     },
///     "responses": {
///       "200": {
///         "description": "Updated preference revision",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "properties": {
///                 "data": {
///                   "type": "object",
///                   "properties": {
///                     "revision": {
///                       "type": "string",
///                       "pattern": "^[0-9]+$"
///                     }
///                   },
///                   "required": [
///                     "revision"
///                   ]
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
///         "description": "Invalid amount or revision"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Write permission required"
///       },
///       "404": {
///         "description": "Company billing access not granted"
///       },
///       "409": {
///         "description": "Missing account or stale revision"
///       },
///       "422": {
///         "description": "Invalid body schema or unexpected field"
///       }
///     },
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
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub async fn balance_warning(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization, currency)): Path<(Uuid, String)>,
    Json(input): Json<BalanceWarningInput>,
) -> Result<Json<Value>, ApiError> {
    let auth = state
        .authorize_admin_headers(&headers, AdminPermission::Write)
        .await?;
    if !auth.permits_billing_account(organization) {
        return Err(ApiError::not_found());
    }
    let parse = exact_nonnegative_integer;
    let threshold = input
        .warning_threshold_nanos
        .as_deref()
        .map(parse)
        .transpose()?;
    let revision = parse(&input.expected_revision)?;
    let next = state
        .store
        .configure_customer_balance_warning(organization, &currency, threshold, revision)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"revision":next.to_string()}})))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BalanceReversalInput {
    amount_nanos: String,
    idempotency_key: Uuid,
}

/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/billing/entries/{entry}/reversal",
///   "method": "post",
///   "operation": {
///     "operationId": "reverseCustomerBalanceEntry",
///     "summary": "Record a balance refund or settled-funding reversal",
///     "description": "Installation write access only. Funding entries can be reversed; charge entries can be refunded to account balance. Original records remain immutable. Cumulative reversals cannot exceed the original amount. Identical idempotency-key replay applies once; conflicting reuse is rejected. A verified funding reversal may create debt and reduce available funds without releasing in-flight liabilities. This records a ledger adjustment and does not execute external refunds or payments.",
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "amount_nanos",
///               "idempotency_key"
///             ],
///             "properties": {
///               "amount_nanos": {
///                 "type": "string",
///                 "pattern": "^[0-9]+$",
///                 "description": "Positive signed-64-bit nanounit amount"
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
///         "description": "Recorded or identical replay",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "properties": {
///                 "data": {
///                   "type": "object",
///                   "properties": {
///                     "recorded": {
///                       "type": "boolean",
///                       "const": true
///                     }
///                   },
///                   "required": [
///                     "recorded"
///                   ]
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
///         "description": "Invalid amount"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Installation write access required"
///       },
///       "409": {
///         "description": "Unknown or unsupported original entry, over-refund or conflicting replay"
///       }
///     },
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
///         "name": "entry",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       }
///     ],
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub async fn balance_reversal(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization, entry)): Path<(Uuid, Uuid)>,
    Json(input): Json<BalanceReversalInput>,
) -> Result<Json<Value>, ApiError> {
    let auth = state
        .authorize_admin_headers(&headers, AdminPermission::Write)
        .await?;
    if !auth.is_installation() {
        return Err(ApiError::forbidden());
    }
    let amount = exact_nonnegative_integer(&input.amount_nanos)?;
    state
        .store
        .reverse_customer_balance_entry(organization, entry, amount, input.idempotency_key)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"recorded":true}})))
}

#[derive(Deserialize, Default)]
#[serde(deny_unknown_fields)]
pub struct BalanceTransactionsQuery {
    before: Option<Uuid>,
}

/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/billing/transactions",
///   "method": "get",
///   "operation": {
///     "operationId": "getCustomerBalanceTransactions",
///     "summary": "Read a company balance transaction page",
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
///         "name": "before",
///         "in": "query",
///         "required": false,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "description": "next_cursor returned by the previous page. Must belong to this company."
///       }
///     ],
///     "description": "Organization-wide owner/admin or installation access required. Customer ledger only; no Supplier costs or margins. Ordered by descending recorded time and internal reference. UUIDs are API routing references and must not be displayed as product labels. Each page contains up to 100 entries; next_cursor is null at the end. Pass the cursor as before to read older entries. Unknown or foreign cursors return a conflict. Traversal is a live view, not a fixed export snapshot; newly inserted later entries appear on refresh.",
///     "responses": {
///       "200": {
///         "description": "Customer balance entries",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data",
///                 "next_cursor"
///               ],
///               "properties": {
///                 "next_cursor": {
///                   "type": [
///                     "string",
///                     "null"
///                   ],
///                   "format": "uuid"
///                 },
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "type": "object",
///                     "properties": {
///                       "id": {
///                         "type": "string",
///                         "format": "uuid"
///                       },
///                       "kind": {
///                         "type": "string",
///                         "enum": [
///                           "funding",
///                           "charge",
///                           "refund",
///                           "funding_reversal",
///                           "adjustment"
///                         ]
///                       },
///                       "currency": {
///                         "type": "string",
///                         "pattern": "^[A-Z]{3}$"
///                       },
///                       "amount_nanos": {
///                         "type": "string",
///                         "pattern": "^-?[0-9]+$"
///                       },
///                       "created_at": {
///                         "type": "string",
///                         "format": "date-time"
///                       },
///                       "reverses_entry_id": {
///                         "type": [
///                           "string",
///                           "null"
///                         ],
///                         "format": "uuid"
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
///         "description": "Invalid query or cursor syntax"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "409": {
///         "description": "Cursor does not belong to this company ledger"
///       },
///       "404": {
///         "description": "Company account access not granted"
///       }
///     },
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub async fn balance_transactions(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(organization): Path<Uuid>,
    Query(query): Query<BalanceTransactionsQuery>,
) -> Result<Json<Value>, ApiError> {
    let auth = state
        .authorize_admin_headers(&headers, AdminPermission::Read)
        .await?;
    if !auth.permits_billing_account(organization) {
        return Err(ApiError::not_found());
    }
    let (data, next_cursor) = state
        .store
        .customer_balance_transaction_page(organization, query.before)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":data,"next_cursor":next_cursor})))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CustomerTariffHistoryQuery {
    before: Option<Uuid>,
    limit: Option<i64>,
}

/// Read immutable customer prices with the same workspace permission as billing.
/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/projects/{project}/billing/tariffs/{model}/history",
///   "method": "get",
///   "operation": {
///     "operationId": "listCustomerTariffHistory",
///     "summary": "Read immutable customer text price history",
///     "description": "Same scoped management read permission as workspace billing. Newest first by created_at and revision UUID, with exclusive keyset pagination. A single database statement observes the current revision and page coherently. All prices are exact decimal strings: token rates are nanounits per million tokens, minimum and fixed fees are currency nanounits per known completed request. Includes no Supplier procurement prices or upstream credentials. Unknown model returns 404; an unknown or foreign cursor returns 409. A newer publication can appear on a fresh first page but does not duplicate earlier entries when following an existing cursor. This read does not publish or reprice anything. Revision identifiers are API references, not display labels.",
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
///         "name": "model",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 200
///         }
///       },
///       {
///         "name": "before",
///         "in": "query",
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "description": "Exclusive revision cursor belonging to this workspace and model."
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
///         "description": "Current pointer and immutable bounded history page.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "current_revision",
///                 "data",
///                 "has_more",
///                 "next_before"
///               ],
///               "properties": {
///                 "current_revision": {
///                   "type": [
///                     "string",
///                     "null"
///                   ],
///                   "format": "uuid"
///                 },
///                 "data": {
///                   "type": "array",
///                   "maxItems": 100,
///                   "items": {
///                     "$ref": "#/components/schemas/CustomerTextTariffHistoryEntry"
///                   }
///                 },
///                 "has_more": {
///                   "type": "boolean"
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
///         "description": "Invalid path, query, model or page limit."
///       },
///       "401": {
///         "description": "Management authentication required."
///       },
///       "404": {
///         "description": "Workspace access denied or no tariff for this model."
///       },
///       "409": {
///         "description": "Cursor does not belong to this workspace/model history."
///       },
///       "503": {
///         "description": "Storage unavailable."
///       }
///     },
///     "x-niu-implementation": "implemented"
///   },
///   "schemas": {
///     "CustomerTextTariffHistoryEntry": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "model_alias",
///         "revision",
///         "currency",
///         "created_at",
///         "is_current",
///         "prompt_rate",
///         "completion_rate",
///         "minimum_charge_nanos",
///         "request_fee_nanos",
///         "cached_prompt_rate"
///       ],
///       "properties": {
///         "model_alias": {
///           "type": "string"
///         },
///         "revision": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "currency": {
///           "type": "string",
///           "pattern": "^[A-Z]{3}$"
///         },
///         "created_at": {
///           "type": "string",
///           "format": "date-time"
///         },
///         "is_current": {
///           "type": "boolean"
///         },
///         "prompt_rate": {
///           "type": "string",
///           "pattern": "^[0-9]+$"
///         },
///         "completion_rate": {
///           "type": "string",
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
///         "cached_prompt_rate": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "pattern": "^[0-9]+$"
///         }
///       }
///     }
///   }
/// }
/// ```
pub async fn tariff_history(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization_id, project_id, model)): Path<(Uuid, Uuid, String)>,
    Query(page): Query<CustomerTariffHistoryQuery>,
) -> Result<Json<Value>, ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    authorize(&state, &headers, scope, false).await?;
    state
        .store
        .customer_tariff_history(scope, &model, page.before, page.limit.unwrap_or(50))
        .await
        .map_err(ApiError::from_store)?
        .map(Json)
        .ok_or_else(ApiError::not_found)
}
