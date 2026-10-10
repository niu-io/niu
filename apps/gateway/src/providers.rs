//! Supplier-only business APIs. Installation configuration is a separate authority.
use crate::{
    error::ApiError,
    state::{AdminAuthorization, AppState},
};
use axum::{
    Json,
    extract::{Path, Query, State},
    http::HeaderMap,
};
use niu_storage::{
    AdminPermission, ProviderOfferInput, ProviderOfferQualificationInput,
    ProviderQualificationInput, ProviderQualificationRevocationInput, SupplierProfileUpdate,
};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

async fn auth(state: &AppState, headers: &HeaderMap) -> Result<AdminAuthorization, ApiError> {
    state
        .authorize_admin_headers(headers, AdminPermission::Read)
        .await
}
async fn installation(state: &AppState, headers: &HeaderMap) -> Result<(), ApiError> {
    if auth(state, headers).await?.can_manage_platform() {
        Ok(())
    } else {
        Err(ApiError::forbidden())
    }
}
async fn member(
    state: &AppState,
    headers: &HeaderMap,
    provider: Uuid,
    write: bool,
) -> Result<Uuid, ApiError> {
    let AdminAuthorization::Operator(operator) = auth(state, headers).await? else {
        return Err(ApiError::forbidden());
    };
    if state
        .store
        .provider_member(provider, operator.id, write)
        .await
        .map_err(ApiError::from_store)?
    {
        Ok(operator.id)
    } else {
        Err(ApiError::not_found())
    }
}

pub async fn memberships(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let data = match auth(&state, &headers).await? {
        AdminAuthorization::Installation => vec![],
        AdminAuthorization::Operator(operator) => state
            .store
            .provider_memberships(operator.id)
            .await
            .map_err(ApiError::from_store)?,
    };
    Ok(Json(json!({"data":data})))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Period {
    #[serde(default = "default_days")]
    days: i32,
}
fn default_days() -> i32 {
    30
}
pub async fn dashboard(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(provider): Path<Uuid>,
    Query(period): Query<Period>,
) -> Result<Json<Value>, ApiError> {
    member(&state, &headers, provider, false).await?;
    let mut data = state
        .store
        .provider_dashboard(provider, period.days)
        .await
        .map_err(ApiError::from_store)?;
    // Suppliers see consumption grouped by their models and agreed rates.
    // Request-level identifiers belong exclusively to platform reconciliation.
    data.as_object_mut()
        .expect("dashboard object")
        .remove("earnings");
    Ok(Json(json!({"data":data})))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Active {
    active: bool,
}
pub async fn set_offer(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((provider, offer)): Path<(Uuid, Uuid)>,
    Json(input): Json<Active>,
) -> Result<Json<Value>, ApiError> {
    let operator = member(&state, &headers, provider, true).await?;
    state
        .store
        .set_provider_offer_active(provider, offer, operator, input.active)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"active":input.active}})))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Name {
    name: String,
}
pub async fn create(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<Name>,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    let id = state
        .store
        .create_provider_business(&input.name)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"id":id}})))
}
/// ```openapi
/// {
///   "path": "/admin/v1/providers/{provider}",
///   "method": "get",
///   "operation": {
///     "operationId": "getSupplierProfile",
///     "summary": "Read Supplier business profile",
///     "description": "Requires platform management permission. Returns business display metadata and an integer profile revision. Optional descriptive text and URLs are represented as empty strings when unset. Does not return credentials, procurement prices or qualification evidence. Internal identity is for routing, not display.",
///     "x-niu-implementation": "implemented",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "provider",
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
///         "description": "Saved Supplier profile",
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
///                     "name",
///                     "description",
///                     "website_url",
///                     "logo_url",
///                     "id",
///                     "revision"
///                   ],
///                   "properties": {
///                     "name": {
///                       "type": "string"
///                     },
///                     "description": {
///                       "type": "string"
///                     },
///                     "website_url": {
///                       "type": "string"
///                     },
///                     "logo_url": {
///                       "type": "string"
///                     },
///                     "id": {
///                       "type": "string",
///                       "format": "uuid"
///                     },
///                     "revision": {
///                       "type": "integer",
///                       "format": "int64"
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid identifier"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Platform management permission required"
///       },
///       "404": {
///         "description": "Supplier missing or deleted"
///       },
///       "503": {
///         "description": "Storage unavailable"
///       }
///     }
///   }
/// }
/// ```
pub async fn profile(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(provider): Path<Uuid>,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    let data = state
        .store
        .supplier_profile(provider)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(json!({"data":data})))
}
/// ```openapi
/// {
///   "path": "/admin/v1/providers/{provider}",
///   "method": "patch",
///   "operation": {
///     "operationId": "renameSupplierBusiness",
///     "summary": "Update Supplier business profile",
///     "description": "Requires platform write authority. Name is required. Omitted or null description/URL fields retain saved values; an empty string clears them. All text is trimmed. Supply the integer expected_revision to reject stale edits; omission or null preserves legacy unconditional updates. Every accepted update increments the profile revision and records an audit event, even if values are unchanged. URLs are stored metadata and are not fetched by this operation.",
///     "x-niu-implementation": "implemented",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "provider",
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
///         "description": "Saved Supplier profile",
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
///                     "name",
///                     "description",
///                     "website_url",
///                     "logo_url",
///                     "id",
///                     "revision"
///                   ],
///                   "properties": {
///                     "name": {
///                       "type": "string"
///                     },
///                     "description": {
///                       "type": "string"
///                     },
///                     "website_url": {
///                       "type": "string"
///                     },
///                     "logo_url": {
///                       "type": "string"
///                     },
///                     "id": {
///                       "type": "string",
///                       "format": "uuid"
///                     },
///                     "revision": {
///                       "type": "integer",
///                       "format": "int64"
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid profile fields or identifier"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Platform write authority required"
///       },
///       "503": {
///         "description": "Storage unavailable"
///       },
///       "409": {
///         "description": "Stale revision, missing or deleted Supplier"
///       },
///       "422": {
///         "description": "Invalid body shape or unknown field"
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
///               "name"
///             ],
///             "properties": {
///               "name": {
///                 "type": "string",
///                 "description": "Nonblank, at most 100 UTF-8 bytes, with no control characters."
///               },
///               "description": {
///                 "type": [
///                   "string",
///                   "null"
///                 ],
///                 "description": "Up to 2,000 characters after trimming; newline, carriage return and tab are permitted."
///               },
///               "expected_revision": {
///                 "type": [
///                   "integer",
///                   "null"
///                 ],
///                 "format": "int64",
///                 "minimum": 1,
///                 "description": "Send the last read integer revision for conflict protection."
///               },
///               "website_url": {
///                 "type": [
///                   "string",
///                   "null"
///                 ],
///                 "description": "Empty to clear, null/omitted to preserve. Nonempty values must be HTTP(S) URLs with a host, no credentials or control characters and at most 2,048 UTF-8 bytes after trimming."
///               },
///               "logo_url": {
///                 "type": [
///                   "string",
///                   "null"
///                 ],
///                 "description": "Empty to clear, null/omitted to preserve. Nonempty values must be HTTP(S) URLs with a host, no credentials or control characters and at most 2,048 UTF-8 bytes after trimming."
///               }
///             }
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub async fn rename(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(provider): Path<Uuid>,
    Json(input): Json<SupplierProfileUpdate>,
) -> Result<Json<Value>, ApiError> {
    state.authorize_platform_headers(&headers).await?;
    let data = state
        .store
        .update_supplier_profile(provider, &input)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":data})))
}
pub async fn delete(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(provider): Path<Uuid>,
) -> Result<Json<Value>, ApiError> {
    state.authorize_platform_headers(&headers).await?;
    state
        .store
        .delete_provider_business(provider)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"deleted":true}})))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Membership {
    role: String,
    active: bool,
}
pub async fn set_member(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((provider, operator)): Path<(Uuid, Uuid)>,
    Json(input): Json<Membership>,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    state
        .store
        .set_provider_member(provider, operator, &input.role, input.active)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"active":input.active}})))
}
pub async fn publish_offer(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(provider): Path<Uuid>,
    Json(input): Json<crate::token_pricing::TokenRateInput>,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    let cached = input
        .cached_prompt_rate
        .as_ref()
        .map(|rate| rate.as_deref());
    let rates = ProviderOfferInput {
        model_alias: input.model_alias,
        currency: input.currency,
        prompt_rate: input.prompt_rate,
        completion_rate: input.completion_rate,
        expected_revision: input.expected_revision,
    };
    let revision = state
        .store
        .publish_provider_offer_with_cache(provider, &rates, cached)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"revision":revision}})))
}

/// Historical rates are procurement data, even after an offer is paused.
pub async fn offer_revision(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((provider, offer, revision)): Path<(Uuid, Uuid, Uuid)>,
) -> Result<Json<Value>, ApiError> {
    let authorization = auth(&state, &headers).await?;
    if !authorization.can_manage_platform() {
        member(&state, &headers, provider, false).await?;
    }
    let data = state
        .store
        .provider_offer_revision(provider, offer, revision)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(json!({"data":data})))
}

pub async fn qualify_business(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(provider): Path<Uuid>,
    Json(input): Json<ProviderQualificationInput>,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    state
        .store
        .qualify_provider_business(provider, &input)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"qualification_status":"qualified"}})))
}

pub async fn qualify_offer(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((provider, offer)): Path<(Uuid, Uuid)>,
    Json(input): Json<ProviderOfferQualificationInput>,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    state
        .store
        .qualify_provider_offer(provider, offer, &input)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"qualification_status":"qualified"}})))
}

pub async fn revoke_business_qualification(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(provider): Path<Uuid>,
    Json(input): Json<ProviderQualificationRevocationInput>,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    state
        .store
        .revoke_provider_qualification(provider, &input.reason_sha256)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"qualification_status":"revoked"}})))
}

pub async fn revoke_offer_qualification(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((provider, offer)): Path<(Uuid, Uuid)>,
    Json(input): Json<ProviderQualificationRevocationInput>,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    state
        .store
        .revoke_provider_offer_qualification(provider, offer, &input.reason_sha256)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"qualification_status":"revoked"}})))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Settlement {
    idempotency_key: Uuid,
    payment_reference: String,
    attempt_ids: Vec<Uuid>,
}
pub async fn record_settlement(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(provider): Path<Uuid>,
    Json(input): Json<Settlement>,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    let id = state
        .store
        .record_provider_settlement(
            provider,
            input.idempotency_key,
            &input.payment_reference,
            &input.attempt_ids,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"id":id}})))
}

pub async fn list(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    Ok(Json(
        json!({"data":state.store.provider_businesses().await.map_err(ApiError::from_store)?}),
    ))
}
/// ```openapi
/// {
///   "path": "/admin/v1/providers/{provider}/members",
///   "method": "get",
///   "operation": {
///     "operationId": "listSupplierMembers",
///     "summary": "List Supplier business members",
///     "description": "Requires platform management permission. Lists saved memberships ordered by member name and internal identity. active is false when membership is disabled or the member account is revoked; revoked reports account revocation separately. No tokens, merchant secrets or procurement amounts are returned. Internal operator identities are for routing, not product labels.",
///     "x-niu-implementation": "implemented",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "provider",
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
///         "description": "Saved membership list, including inactive or revoked members",
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
///                       "operator_id",
///                       "name",
///                       "role",
///                       "active",
///                       "revoked"
///                     ],
///                     "properties": {
///                       "operator_id": {
///                         "type": "string",
///                         "format": "uuid"
///                       },
///                       "name": {
///                         "type": "string"
///                       },
///                       "role": {
///                         "type": "string",
///                         "enum": [
///                           "manager",
///                           "viewer"
///                         ]
///                       },
///                       "active": {
///                         "type": "boolean"
///                       },
///                       "revoked": {
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
///         "description": "Invalid identifier"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Platform management permission required"
///       },
///       "409": {
///         "description": "Supplier missing or deleted"
///       },
///       "503": {
///         "description": "Storage unavailable"
///       }
///     }
///   }
/// }
/// ```
pub async fn members(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(provider): Path<Uuid>,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    Ok(Json(
        json!({"data":state.store.provider_members(provider).await.map_err(ApiError::from_store)?}),
    ))
}

pub async fn administration_dashboard(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(provider): Path<Uuid>,
    Query(period): Query<Period>,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    Ok(Json(
        json!({"data":state.store.provider_dashboard(provider,period.days).await.map_err(ApiError::from_store)?}),
    ))
}

/// Procurement configuration belongs to platform administration, never company members.
pub async fn media_rate(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(provider): Path<Uuid>,
    Json(input): Json<niu_storage::SupplierMediaRateCard>,
) -> Result<Json<Value>, ApiError> {
    state.authorize_platform_headers(&headers).await?;
    state
        .store
        .register_supplier_media_rate(provider, &input)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"revision":input.revision}})))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MediaRatePage {
    after: Option<String>,
    #[serde(default = "media_rate_page_size")]
    limit: i64,
}
fn media_rate_page_size() -> i64 {
    50
}
pub async fn media_rate_models(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(provider): Path<Uuid>,
    Query(page): Query<MediaRatePage>,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    Ok(Json(
        state
            .store
            .supplier_media_rate_models(provider, page.after.as_deref(), page.limit)
            .await
            .map_err(ApiError::from_store)?,
    ))
}
pub async fn media_rates(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(provider): Path<Uuid>,
    Query(page): Query<MediaRatePage>,
) -> Result<Json<Value>, ApiError> {
    let authorization = auth(&state, &headers).await?;
    if !authorization.can_manage_platform() {
        member(&state, &headers, provider, false).await?;
    }
    Ok(Json(
        state
            .store
            .supplier_media_rates(provider, page.after.as_deref(), page.limit)
            .await
            .map_err(ApiError::from_store)?,
    ))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MediaRateRetirement {
    effective_until: i64,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MediaRateReplacement {
    previous_revision: String,
    rate: niu_storage::SupplierMediaRateCard,
}
pub async fn replace_media_rate(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(provider): Path<Uuid>,
    Json(input): Json<MediaRateReplacement>,
) -> Result<Json<Value>, ApiError> {
    state.authorize_platform_headers(&headers).await?;
    state
        .store
        .replace_supplier_media_rate(provider, &input.previous_revision, &input.rate)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(
        json!({"data":{"revision":input.rate.revision,"effective_from":input.rate.tariff.effective_from.to_string()}}),
    ))
}
pub async fn retire_media_rate(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((provider, revision)): Path<(Uuid, String)>,
    Json(input): Json<MediaRateRetirement>,
) -> Result<Json<Value>, ApiError> {
    state.authorize_platform_headers(&headers).await?;
    state
        .store
        .retire_supplier_media_rate(provider, &revision, input.effective_until)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(
        json!({"data":{"revision":revision,"effective_until":input.effective_until.to_string()}}),
    ))
}

pub async fn media_offer_models(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(provider): Path<Uuid>,
    Query(page): Query<MediaRatePage>,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    Ok(Json(
        state
            .store
            .supplier_media_offer_models(provider, page.after.as_deref(), page.limit)
            .await
            .map_err(ApiError::from_store)?,
    ))
}
pub async fn publish_media_offer(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(provider): Path<Uuid>,
    Json(input): Json<niu_storage::SupplierMediaOfferInput>,
) -> Result<Json<Value>, ApiError> {
    state.authorize_platform_headers(&headers).await?;
    let revision = state
        .store
        .publish_supplier_media_offer(provider, &input)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"revision":revision}})))
}

/// Sanitized platform capabilities; credentials and deployment paths stay private.
/// ```openapi
/// {
///   "path": "/admin/v1/platform/configuration",
///   "method": "get",
///   "operation": {
///     "operationId": "getPlatformConfiguration",
///     "summary": "Read platform payment configuration presence",
///     "description": "Requires platform management permission. Returns configuration-presence flags without merchant credentials. EPay is configured when a saved configuration exists (including disabled configurations) or deployment configuration is present; Zhifux and Stripe reflect loaded runtime adapters. Use customer payment-method discovery for checkout availability and the integration inventory for supported capabilities. This response does not prove successful external payments.",
///     "x-niu-implementation": "implemented",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Sanitized configuration presence",
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
///                     "payment_gateways"
///                   ],
///                   "properties": {
///                     "payment_gateways": {
///                       "type": "array",
///                       "items": {
///                         "type": "object",
///                         "required": [
///                           "name",
///                           "configured"
///                         ],
///                         "properties": {
///                           "name": {
///                             "type": "string",
///                             "enum": [
///                               "Zhifux",
///                               "EPay",
///                               "Stripe"
///                             ]
///                           },
///                           "configured": {
///                             "type": "boolean",
///                             "description": "Configuration presence only; not enabled checkout, merchant eligibility, or payment qualification."
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
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Platform management permission required"
///       },
///       "503": {
///         "description": "Configuration storage unavailable"
///       }
///     }
///   }
/// }
/// ```
pub async fn platform_configuration(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    Ok(Json(json!({"data":{
        "payment_gateways": [{"name":"Zhifux","configured":state.payments.is_some()},{"name":"EPay","configured":state.store.payment_gateway_configuration().await.map_err(ApiError::from_store)?.is_some() || state.epay_payments.is_some()},{"name":"Stripe","configured":state.stripe_payments.is_some()}]
    }})))
}
