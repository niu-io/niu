//! Provider-only business APIs. Installation configuration is a separate authority.
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
    AdminPermission, OperatorAuditActor, ProviderOfferInput, ProviderOfferQualificationInput,
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
fn supplier_audit_actor(authorization: AdminAuthorization) -> OperatorAuditActor {
    match authorization {
        AdminAuthorization::Installation => OperatorAuditActor::Installation,
        AdminAuthorization::Operator(operator) => OperatorAuditActor::Operator(operator.id),
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

/// ```openapi
/// {
///   "path": "/admin/v1/provider-memberships",
///   "method": "get",
///   "operation": {
///     "operationId": "listProviderMemberships",
///     "summary": "List the signed-in operator\u2019s complete active Provider memberships",
///     "description": "Returns every active membership for the current non-revoked operator, ordered by Provider name then internal routing ID. This compatibility directory has no cursor or silent history cap. Installation sessions return an empty list. Company membership alone grants no Provider access. Deleted Providers are excluded. IDs are routing references, not display labels.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Complete current membership directory.",
///         "headers": {
///           "Cache-Control": {
///             "schema": {
///               "type": "string",
///               "const": "no-store"
///             }
///           }
///         },
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
///                       "id",
///                       "name",
///                       "role"
///                     ],
///                     "properties": {
///                       "id": {
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
///         "description": "Missing or unusable session."
///       },
///       "503": {
///         "description": "Storage unavailable."
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
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
/// ```openapi
/// {
///   "path": "/admin/v1/providers",
///   "method": "post",
///   "operation": {
///     "operationId": "createProviderBusiness",
///     "summary": "Create a Provider business identity",
///     "description": "Requires platform administration. Creation grants no membership, qualification, offer or permission to resell supply. Stores the trimmed name and an immutable creation audit.",
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
///                 "minLength": 1,
///                 "maxLength": 100,
///                 "description": "Nonblank after trimming; at most 100 UTF-8 bytes before trimming; no control characters. Saved value is trimmed."
///               }
///             }
///           }
///         }
///       }
///     },
///     "responses": {
///       "200": {
///         "description": "Created identity",
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
///         "description": "Invalid Provider name"
///       },
///       "401": {
///         "description": "Missing, expired or revoked administrative credential"
///       },
///       "403": {
///         "description": "Platform administration required"
///       },
///       "422": {
///         "description": "Malformed body or unknown field"
///       },
///       "503": {
///         "description": "Storage unavailable"
///       }
///     },
///     "tags": [
///       "Providers"
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
pub async fn create(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<Name>,
) -> Result<Json<Value>, ApiError> {
    let authorization = state.authorize_platform_headers(&headers).await?;
    let id = state
        .store
        .create_provider_business_audited(&input.name, supplier_audit_actor(authorization))
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"id":id}})))
}
/// ```openapi
/// {
///   "path": "/admin/v1/providers/{provider}",
///   "method": "get",
///   "operation": {
///     "operationId": "getProviderProfile",
///     "summary": "Read Provider business profile",
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
///         "description": "Saved Provider profile",
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
///         "description": "Provider missing or deleted"
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
///     "operationId": "renameProviderBusiness",
///     "summary": "Update Provider business profile",
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
///         "description": "Saved Provider profile",
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
///         "description": "Stale revision, missing or deleted Provider"
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
/// ```openapi
/// {
///   "path": "/admin/v1/providers/{provider}",
///   "method": "delete",
///   "operation": {
///     "operationId": "deleteProviderBusiness",
///     "summary": "Remove an unconfigured Provider from the directory",
///     "description": "Platform administration required. Soft-deletes only a live Provider with no owned API configurations, offers or memberships; disabled configurations and inactive memberships still count as dependencies. Audit history is retained. Concurrent configuration association serializes with deletion. This is not a credential revocation or financial-history deletion operation. Repeating deletion returns 409.",
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
///         "description": "Provider removed from the active directory.",
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
///                     "deleted"
///                   ],
///                   "properties": {
///                     "deleted": {
///                       "type": "boolean",
///                       "const": true
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "401": {
///         "description": "Missing or invalid administrative credential."
///       },
///       "403": {
///         "description": "Platform administration required."
///       },
///       "409": {
///         "description": "Unknown or already deleted Provider, or existing configuration, offer or membership dependency."
///       },
///       "503": {
///         "description": "Storage unavailable."
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub async fn delete(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(provider): Path<Uuid>,
) -> Result<Json<Value>, ApiError> {
    let authorization = state.authorize_platform_headers(&headers).await?;
    state
        .store
        .delete_provider_business_audited(provider, supplier_audit_actor(authorization))
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
/// ```openapi
/// {
///   "path": "/admin/v1/providers/{provider}/members/{operator}",
///   "method": "put",
///   "operation": {
///     "operationId": "setProviderMembership",
///     "summary": "Grant, change or disable a Provider membership",
///     "description": "Requires platform administration. Grants viewer or manager membership to a non-revoked operator. Provider membership grants no platform configuration authority. Membership state and immutable audit are recorded atomically. Repeated accepted writes can add audit events. Individual transaction lock waits are bounded to 250 ms and statements to 2 seconds; pool acquisition and whole HTTP duration are not bounded by these settings.",
///     "tags": [
///       "Providers"
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
///       },
///       {
///         "name": "operator",
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
///               "role",
///               "active"
///             ],
///             "properties": {
///               "role": {
///                 "type": "string",
///                 "enum": [
///                   "manager",
///                   "viewer"
///                 ]
///               },
///               "active": {
///                 "type": "boolean"
///               }
///             }
///           }
///         }
///       }
///     },
///     "responses": {
///       "200": {
///         "description": "Membership saved and audited",
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
///                     "active"
///                   ],
///                   "properties": {
///                     "active": {
///                       "type": "boolean"
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid membership role"
///       },
///       "401": {
///         "description": "Missing, expired or revoked administrative credential"
///       },
///       "403": {
///         "description": "Platform administration required"
///       },
///       "409": {
///         "description": "Missing/deleted Provider or missing/revoked operator"
///       },
///       "422": {
///         "description": "Malformed membership input"
///       },
///       "503": {
///         "description": "Storage unavailable or transaction lock/statement timeout"
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
/// Immutable Provider schedule publication.
/// ```openapi
/// {
///   "path": "/admin/v1/providers/{provider}/offers",
///   "method": "post",
///   "operation": {
///     "operationId": "publishProviderPayoutRates",
///     "x-niu-implementation": "implemented",
///     "security": [{"bearerAuth": []}],
///     "summary": "Publish an immutable agreed Provider payout schedule",
///     "description": "Installation-only publication binds an existing vendor model alias to one Provider. Decimal prices are currency nanounits per million tokens. Existing attempts retain the revision pinned before dispatch. Stale expected_revision and incompatible vendor ownership conflict. Initial creation requires null expected_revision. Optional category rates price reported subsets separately; null uses ordinary rates. Omitting an existing category rate or tier schedule conflicts. Empty context_tiers clears the schedule; null is rejected. The highest inclusive threshold on aggregate input (including cache reads/writes) selects a complete schedule; category null within a tier does not inherit its base category rate. Missing required quantities leave earnings unresolved. Every publication pauses the offer and requires renewed qualification. Procurement budgets and customer charges remain independent.",
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
///               "completion_rate",
///               "expected_revision"
///             ],
///             "properties": {
///               "model_alias": {
///                 "type": "string",
///                 "minLength": 1,
///                 "maxLength": 200
///               },
///               "currency": {
///                 "type": "string",
///                 "pattern": "^[A-Z]{3}$"
///               },
///               "prompt_rate": {
///                 "type": "string",
///                 "pattern": "^[0-9]+$",
///                 "description": "Currency nanounits per million tokens; maximum 1000000000000000."
///               },
///               "completion_rate": {
///                 "type": "string",
///                 "pattern": "^[0-9]+$",
///                 "description": "Currency nanounits per million tokens; maximum 1000000000000000."
///               },
///               "expected_revision": {
///                 "type": [
///                   "string",
///                   "null"
///                 ],
///                 "format": "uuid"
///               },
///               "context_tiers": {
///                 "type": "array",
///                 "maxItems": 32,
///                 "items": {
///                   "type": "object",
///                   "additionalProperties": false,
///                   "required": [
///                     "minimum_input_tokens",
///                     "prompt_rate",
///                     "completion_rate"
///                   ],
///                   "properties": {
///                     "minimum_input_tokens": {
///                       "type": "string",
///                       "pattern": "^[0-9]+$",
///                       "description": "Positive inclusive aggregate input threshold, at most 9223372036854775807."
///                     },
///                     "prompt_rate": {
///                       "type": "string",
///                       "pattern": "^[0-9]+$",
///                       "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
///                     },
///                     "completion_rate": {
///                       "type": "string",
///                       "pattern": "^[0-9]+$",
///                       "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
///                     },
///                     "cached_prompt_rate": {
///                       "type": [
///                         "string",
///                         "null"
///                       ],
///                       "pattern": "^[0-9]+$",
///                       "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
///                     },
///                     "cache_write_prompt_rate": {
///                       "type": [
///                         "string",
///                         "null"
///                       ],
///                       "pattern": "^[0-9]+$",
///                       "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
///                     },
///                     "reasoning_completion_rate": {
///                       "type": [
///                         "string",
///                         "null"
///                       ],
///                       "pattern": "^[0-9]+$",
///                       "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
///                     }
///                   }
///                 },
///                 "description": "Complete whole-request schedules; highest inclusive input threshold wins. Null category rates do not inherit the base schedule. Empty array clears tiers; omitting existing tiers conflicts."
///               },
///               "cached_prompt_rate": {
///                 "type": [
///                   "string",
///                   "null"
///                 ],
///                 "pattern": "^[0-9]+$",
///                 "description": "Currency nanounits per million tokens; maximum 1000000000000000."
///               },
///               "cache_write_prompt_rate": {
///                 "type": [
///                   "string",
///                   "null"
///                 ],
///                 "pattern": "^[0-9]+$",
///                 "description": "Currency nanounits per million tokens; maximum 1000000000000000."
///               },
///               "reasoning_completion_rate": {
///                 "type": [
///                   "string",
///                   "null"
///                 ],
///                 "pattern": "^[0-9]+$",
///                 "description": "Currency nanounits per million tokens; maximum 1000000000000000."
///               }
///             }
///           }
///         }
///       }
///     },
///     "responses": {
///       "200": {
///         "description": "New immutable revision",
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
///         "description": "Invalid prices or tier thresholds"
///       },
///       "403": {
///         "description": "Installation administration required"
///       },
///       "409": {
///         "description": "Ownership, expected revision, or omitted current schedule conflict"
///       },
///       "422": {
///         "description": "JSON schema mismatch; context_tiers must be an array, never null"
///       }
///     }
///   }
/// }
/// ```
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
        .publish_provider_offer_schedule(
            provider,
            &rates,
            niu_storage::ProviderOfferSchedule {
                cached_prompt_rate: cached,
                reasoning_completion_rate: input
                    .reasoning_completion_rate
                    .as_ref()
                    .map(|rate| rate.as_deref()),
                cache_write_prompt_rate: input
                    .cache_write_prompt_rate
                    .as_ref()
                    .map(|rate| rate.as_deref()),
                context_tiers: input.context_tiers.as_deref(),
            },
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"revision":revision}})))
}

/// Historical rates are procurement data, even after an offer is paused.
/// ```openapi
/// {
///   "path": "/admin/v1/providers/{provider}/offers/{offer}/revisions/{revision}",
///   "method": "get",
///   "operation": {
///     "operationId": "getProviderOfferRevision",
///     "summary": "Read an immutable Provider procurement quote",
///     "description": "Installation administrators or active members of this Provider may read a quote. Ordinary company/workspace ownership grants no procurement access. Provider, offer and revision must all match; inaccessible or missing records return 404. Text prices are exact currency nanounits per million tokens. Media revisions have null text prices; use the separate media rate-card contract. This read does not activate, qualify or reprice an offer. Procurement data must never be exposed in customer workspace billing. Internal identifiers are API references, not display labels.",
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
///       },
///       {
///         "name": "offer",
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
///           "format": "uuid"
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Immutable procurement quote; no upstream credentials or endpoint.",
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
///                   "$ref": "#/components/schemas/ProviderOfferRevision"
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Malformed path identifier."
///       },
///       "401": {
///         "description": "Management authentication required."
///       },
///       "404": {
///         "description": "Provider membership denied or quote identity not found."
///       },
///       "503": {
///         "description": "Storage unavailable."
///       }
///     },
///     "x-niu-implementation": "implemented"
///   },
///   "schemas": {
///     "ProviderOfferRevision": {
///       "oneOf": [
///         {
///           "type": "object",
///           "additionalProperties": false,
///           "required": [
///             "revision",
///             "model_alias",
///             "created_at",
///             "rate_kind",
///             "currency",
///             "prompt_rate",
///             "completion_rate",
///             "cached_prompt_rate",
///             "reasoning_completion_rate",
///             "cache_write_prompt_rate"
///           ],
///           "properties": {
///             "revision": {
///               "type": "string",
///               "format": "uuid"
///             },
///             "model_alias": {
///               "type": "string"
///             },
///             "created_at": {
///               "type": "string",
///               "format": "date-time"
///             },
///             "rate_kind": {
///               "const": "text"
///             },
///             "currency": {
///               "type": "string",
///               "pattern": "^[A-Z]{3}$"
///             },
///             "prompt_rate": {
///               "type": "string",
///               "pattern": "^[0-9]+$"
///             },
///             "completion_rate": {
///               "type": "string",
///               "pattern": "^[0-9]+$"
///             },
///             "cached_prompt_rate": {
///               "type": [
///                 "string",
///                 "null"
///               ],
///               "pattern": "^[0-9]+$"
///             },
///             "reasoning_completion_rate": {
///               "type": [
///                 "string",
///                 "null"
///               ],
///               "pattern": "^[0-9]+$",
///               "description": "Reported reasoning output is a subset of total completion tokens. A configured rate prices that subset separately; missing quantity remains unresolved."
///             },
///             "cache_write_prompt_rate": {
///               "type": [
///                 "string",
///                 "null"
///               ],
///               "pattern": "^[0-9]+$",
///               "description": "Reported cache-write input is a disjoint subset of aggregate input. A configured Provider rate prices it separately; missing quantity remains unresolved."
///             },
///             "context_tiers": {
///               "type": "array",
///               "maxItems": 32,
///               "items": {
///                 "type": "object",
///                 "additionalProperties": false,
///                 "required": [
///                   "minimum_input_tokens",
///                   "prompt_rate",
///                   "completion_rate"
///                 ],
///                 "properties": {
///                   "minimum_input_tokens": {
///                     "type": "string",
///                     "pattern": "^[0-9]+$",
///                     "description": "Positive inclusive aggregate input threshold, at most 9223372036854775807."
///                   },
///                   "prompt_rate": {
///                     "type": "string",
///                     "pattern": "^[0-9]+$",
///                     "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
///                   },
///                   "completion_rate": {
///                     "type": "string",
///                     "pattern": "^[0-9]+$",
///                     "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
///                   },
///                   "cached_prompt_rate": {
///                     "type": [
///                       "string",
///                       "null"
///                     ],
///                     "pattern": "^[0-9]+$",
///                     "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
///                   },
///                   "cache_write_prompt_rate": {
///                     "type": [
///                       "string",
///                       "null"
///                     ],
///                     "pattern": "^[0-9]+$",
///                     "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
///                   },
///                   "reasoning_completion_rate": {
///                     "type": [
///                       "string",
///                       "null"
///                     ],
///                     "pattern": "^[0-9]+$",
///                     "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
///                   }
///                 }
///               },
///               "description": "Complete whole-request schedules; highest inclusive input threshold wins. Null category rates do not inherit the base schedule. Empty array clears tiers; omitting existing tiers conflicts."
///             }
///           }
///         },
///         {
///           "type": "object",
///           "additionalProperties": false,
///           "required": [
///             "revision",
///             "model_alias",
///             "created_at",
///             "rate_kind",
///             "currency",
///             "prompt_rate",
///             "completion_rate",
///             "cached_prompt_rate",
///             "reasoning_completion_rate",
///             "cache_write_prompt_rate"
///           ],
///           "properties": {
///             "revision": {
///               "type": "string",
///               "format": "uuid"
///             },
///             "model_alias": {
///               "type": "string"
///             },
///             "created_at": {
///               "type": "string",
///               "format": "date-time"
///             },
///             "rate_kind": {
///               "const": "media"
///             },
///             "currency": {
///               "type": "null"
///             },
///             "prompt_rate": {
///               "type": "null"
///             },
///             "completion_rate": {
///               "type": "null"
///             },
///             "cached_prompt_rate": {
///               "type": "null"
///             },
///             "reasoning_completion_rate": {
///               "type": "null",
///               "description": "Reported reasoning output is a subset of total completion tokens. A configured rate prices that subset separately; missing quantity remains unresolved."
///             },
///             "cache_write_prompt_rate": {
///               "type": "null",
///               "description": "Reported cache-write input is a disjoint subset of aggregate input. A configured Provider rate prices it separately; missing quantity remains unresolved."
///             }
///           }
///         }
///       ]
///     }
///   }
/// }
/// ```
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

/// ```openapi
/// {
///   "path": "/admin/v1/providers/{provider}/qualification",
///   "method": "put",
///   "operation": {
///     "operationId": "qualifyProviderBusiness",
///     "x-niu-implementation": "implemented",
///     "summary": "Record a Provider business qualification review",
///     "description": "Platform administration required; Provider membership does not grant this write. Records a new immutable review and audit with caller-supplied evidence digests, then selects that review. The server validates digest syntax and expiry, not the truth of supply rights, capability or data-handling evidence. No upstream check, commercial agreement, funds transfer or offer activation is performed. Missing or deleted Provider conflicts.",
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
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "supply_rights_sha256",
///               "supply_capability_sha256",
///               "data_handling_sha256",
///               "valid_until_ms"
///             ],
///             "properties": {
///               "supply_rights_sha256": {
///                 "type": "string",
///                 "pattern": "^[0-9a-f]{64}$",
///                 "description": "SHA-256 digest of independently reviewed evidence; lowercase hexadecimal. Evidence content is not uploaded by this operation."
///               },
///               "supply_capability_sha256": {
///                 "type": "string",
///                 "pattern": "^[0-9a-f]{64}$",
///                 "description": "SHA-256 digest of independently reviewed evidence; lowercase hexadecimal. Evidence content is not uploaded by this operation."
///               },
///               "data_handling_sha256": {
///                 "type": "string",
///                 "pattern": "^[0-9a-f]{64}$",
///                 "description": "SHA-256 digest of independently reviewed evidence; lowercase hexadecimal. Evidence content is not uploaded by this operation."
///               },
///               "valid_until_ms": {
///                 "type": "integer",
///                 "format": "int64",
///                 "maximum": 253402300799999,
///                 "description": "Unix epoch milliseconds; must be strictly later than server time."
///               }
///             }
///           }
///         }
///       }
///     },
///     "responses": {
///       "400": {
///         "description": "Invalid path UUID, malformed JSON, evidence digest, expiry or review metadata."
///       },
///       "401": {
///         "description": "Missing or invalid administrator authentication."
///       },
///       "403": {
///         "description": "Authenticated principal lacks platform management permission."
///       },
///       "409": {
///         "description": "Missing resource or qualification/revision prerequisites no longer hold."
///       },
///       "415": {
///         "description": "Request is not JSON."
///       },
///       "422": {
///         "description": "JSON has missing, unknown or incorrectly typed fields."
///       },
///       "500": {
///         "description": "Unexpected internal persistence failure."
///       },
///       "503": {
///         "description": "Persistence temporarily unavailable; no successful qualification is confirmed."
///       },
///       "200": {
///         "description": "Qualification transaction committed.",
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
///                     "qualification_status"
///                   ],
///                   "properties": {
///                     "qualification_status": {
///                       "type": "string",
///                       "enum": [
///                         "qualified"
///                       ]
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

/// ```openapi
/// {
///   "path": "/admin/v1/providers/{provider}/offers/{offer}/qualification",
///   "method": "put",
///   "operation": {
///     "operationId": "qualifyProviderOffer",
///     "x-niu-implementation": "implemented",
///     "summary": "Record a Provider offer qualification review",
///     "description": "Platform administration required. Requires current Provider business qualification, matching current rate_revision and a current media offer binding where applicable; otherwise 409. Records a new immutable review and audit, then selects that review. Evidence digests must represent independently reviewed facts; this operation does not validate their content, negotiate rates, call upstream or activate the offer.",
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
///       },
///       {
///         "name": "offer",
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
///               "rate_revision",
///               "model_identity_sha256",
///               "protocol_matrix_sha256",
///               "data_handling_sha256",
///               "availability_sha256",
///               "agreed_rates_sha256",
///               "protocol_matrix_version",
///               "valid_until_ms"
///             ],
///             "properties": {
///               "rate_revision": {
///                 "type": "string",
///                 "format": "uuid",
///                 "description": "Must equal the current immutable offer rate revision."
///               },
///               "model_identity_sha256": {
///                 "type": "string",
///                 "pattern": "^[0-9a-f]{64}$",
///                 "description": "SHA-256 digest of independently reviewed evidence; lowercase hexadecimal. Evidence content is not uploaded by this operation."
///               },
///               "protocol_matrix_sha256": {
///                 "type": "string",
///                 "pattern": "^[0-9a-f]{64}$",
///                 "description": "SHA-256 digest of independently reviewed evidence; lowercase hexadecimal. Evidence content is not uploaded by this operation."
///               },
///               "data_handling_sha256": {
///                 "type": "string",
///                 "pattern": "^[0-9a-f]{64}$",
///                 "description": "SHA-256 digest of independently reviewed evidence; lowercase hexadecimal. Evidence content is not uploaded by this operation."
///               },
///               "availability_sha256": {
///                 "type": "string",
///                 "pattern": "^[0-9a-f]{64}$",
///                 "description": "SHA-256 digest of independently reviewed evidence; lowercase hexadecimal. Evidence content is not uploaded by this operation."
///               },
///               "agreed_rates_sha256": {
///                 "type": "string",
///                 "pattern": "^[0-9a-f]{64}$",
///                 "description": "SHA-256 digest of independently reviewed evidence; lowercase hexadecimal. Evidence content is not uploaded by this operation."
///               },
///               "protocol_matrix_version": {
///                 "type": "string",
///                 "minLength": 1,
///                 "maxLength": 100,
///                 "description": "Nonblank after trimming; at most 100 UTF-8 bytes before trimming; no control characters. Saved trimmed."
///               },
///               "valid_until_ms": {
///                 "type": "integer",
///                 "format": "int64",
///                 "maximum": 253402300799999,
///                 "description": "Unix epoch milliseconds; must be strictly later than server time."
///               }
///             }
///           }
///         }
///       }
///     },
///     "responses": {
///       "400": {
///         "description": "Invalid path UUID, malformed JSON, evidence digest, expiry or review metadata."
///       },
///       "401": {
///         "description": "Missing or invalid administrator authentication."
///       },
///       "403": {
///         "description": "Authenticated principal lacks platform management permission."
///       },
///       "409": {
///         "description": "Missing resource or qualification/revision prerequisites no longer hold."
///       },
///       "415": {
///         "description": "Request is not JSON."
///       },
///       "422": {
///         "description": "JSON has missing, unknown or incorrectly typed fields."
///       },
///       "500": {
///         "description": "Unexpected internal persistence failure."
///       },
///       "503": {
///         "description": "Persistence temporarily unavailable; no successful qualification is confirmed."
///       },
///       "200": {
///         "description": "Qualification transaction committed.",
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
///                     "qualification_status"
///                   ],
///                   "properties": {
///                     "qualification_status": {
///                       "type": "string",
///                       "enum": [
///                         "qualified"
///                       ]
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

/// ```openapi
/// {
///   "path": "/admin/v1/providers/{provider}/qualification/revoke",
///   "method": "post",
///   "operation": {
///     "operationId": "revokeProviderBusinessQualification",
///     "x-niu-implementation": "implemented",
///     "summary": "Revoke the current Provider business qualification",
///     "description": "Platform administration required. Appends an immutable reason digest and audit, clears the current business review, and pauses all Provider offers while clearing their current reviews atomically. Missing/deleted Provider or absence of a current review conflicts, including repeated revocation. Does not erase historical reviews or change existing request charges or earnings.",
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
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "reason_sha256"
///             ],
///             "properties": {
///               "reason_sha256": {
///                 "type": "string",
///                 "pattern": "^[0-9a-f]{64}$",
///                 "description": "SHA-256 digest of independently reviewed evidence; lowercase hexadecimal. Evidence content is not uploaded by this operation."
///               }
///             }
///           }
///         }
///       }
///     },
///     "responses": {
///       "400": {
///         "description": "Invalid path UUID, malformed JSON, evidence digest, expiry or review metadata."
///       },
///       "401": {
///         "description": "Missing or invalid administrator authentication."
///       },
///       "403": {
///         "description": "Authenticated principal lacks platform management permission."
///       },
///       "409": {
///         "description": "Missing resource or qualification/revision prerequisites no longer hold."
///       },
///       "415": {
///         "description": "Request is not JSON."
///       },
///       "422": {
///         "description": "JSON has missing, unknown or incorrectly typed fields."
///       },
///       "500": {
///         "description": "Unexpected internal persistence failure."
///       },
///       "503": {
///         "description": "Persistence temporarily unavailable; no successful qualification is confirmed."
///       },
///       "200": {
///         "description": "Qualification transaction committed.",
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
///                     "qualification_status"
///                   ],
///                   "properties": {
///                     "qualification_status": {
///                       "type": "string",
///                       "enum": [
///                         "revoked"
///                       ]
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

/// ```openapi
/// {
///   "path": "/admin/v1/providers/{provider}/offers/{offer}/qualification/revoke",
///   "method": "post",
///   "operation": {
///     "operationId": "revokeProviderOfferQualification",
///     "x-niu-implementation": "implemented",
///     "summary": "Revoke the current Provider offer qualification",
///     "description": "Platform administration required. Appends an immutable reason digest and audit, clears the current offer review and pauses that offer atomically. Missing/deleted Provider, missing offer or absence of a current review conflicts, including repeated revocation. Other offers and historical request charges or earnings are unchanged.",
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
///       },
///       {
///         "name": "offer",
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
///               "reason_sha256"
///             ],
///             "properties": {
///               "reason_sha256": {
///                 "type": "string",
///                 "pattern": "^[0-9a-f]{64}$",
///                 "description": "SHA-256 digest of independently reviewed evidence; lowercase hexadecimal. Evidence content is not uploaded by this operation."
///               }
///             }
///           }
///         }
///       }
///     },
///     "responses": {
///       "400": {
///         "description": "Invalid path UUID, malformed JSON, evidence digest, expiry or review metadata."
///       },
///       "401": {
///         "description": "Missing or invalid administrator authentication."
///       },
///       "403": {
///         "description": "Authenticated principal lacks platform management permission."
///       },
///       "409": {
///         "description": "Missing resource or qualification/revision prerequisites no longer hold."
///       },
///       "415": {
///         "description": "Request is not JSON."
///       },
///       "422": {
///         "description": "JSON has missing, unknown or incorrectly typed fields."
///       },
///       "500": {
///         "description": "Unexpected internal persistence failure."
///       },
///       "503": {
///         "description": "Persistence temporarily unavailable; no successful qualification is confirmed."
///       },
///       "200": {
///         "description": "Qualification transaction committed.",
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
///                     "qualification_status"
///                   ],
///                   "properties": {
///                     "qualification_status": {
///                       "type": "string",
///                       "enum": [
///                         "revoked"
///                       ]
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
/// ```openapi
/// {
///   "path": "/admin/v1/providers/{provider}/settlements",
///   "method": "post",
///   "operation": {
///     "operationId": "recordExternalProviderPayment",
///     "summary": "Record an already completed external Provider payment",
///     "description": "Platform administration required; Provider membership does not grant this write. Does not transfer funds. Selected earnings must belong to this Provider, share one currency, remain unpaid and have a positive exact total. The server computes the amount. Reuse the supplied idempotency key with the identical reference and entry set for retries; entry order is irrelevant. Changed replay, duplicate payment reference or unavailable selections return 409. No customer balance credit or Provider qualification is created.",
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
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "idempotency_key",
///               "payment_reference",
///               "attempt_ids"
///             ],
///             "properties": {
///               "idempotency_key": {
///                 "type": "string",
///                 "format": "uuid"
///               },
///               "payment_reference": {
///                 "type": "string",
///                 "minLength": 1,
///                 "maxLength": 200,
///                 "description": "Nonblank reference, at most 200 UTF-8 bytes, no control characters. Preserve the exact value on retry."
///               },
///               "attempt_ids": {
///                 "type": "array",
///                 "minItems": 1,
///                 "maxItems": 1000,
///                 "uniqueItems": true,
///                 "items": {
///                   "type": "string",
///                   "format": "uuid"
///                 },
///                 "description": "Internal selection IDs from the platform earning history; never display IDs or require users to paste them."
///               }
///             }
///           }
///         }
///       }
///     },
///     "responses": {
///       "200": {
///         "description": "Recorded or replayed settlement identity.",
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
///         "description": "Invalid reference, entry set, or currency mix."
///       },
///       "401": {
///         "description": "Invalid administrative credential."
///       },
///       "403": {
///         "description": "Platform administration required."
///       },
///       "409": {
///         "description": "Provider or earnings unavailable, changed replay, or duplicate payment reference."
///       },
///       "503": {
///         "description": "Storage unavailable."
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
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

/// ```openapi
/// {
///   "path": "/admin/v1/providers",
///   "method": "get",
///   "operation": {
///     "operationId": "listProviderBusinesses",
///     "summary": "List active Provider business identities",
///     "description": "Requires platform administration. Complete compatibility directory with no pagination or silent truncation, ordered by name and internal ID. Total counts retain disabled credential configurations and models. enabled_api_keys counts enabled saved configurations; enabled_model_routes counts enabled model mappings on enabled configurations. These counts do not verify credentials, upstream availability, customer pricing or request authorization. Member counts include active memberships for non-revoked operators. Deleted Providers are excluded. Qualification is explicit and never inferred from configuration counts.",
///     "responses": {
///       "200": {
///         "description": "Active directory",
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
///                       "id",
///                       "name",
///                       "logo_url",
///                       "api_keys",
///                       "models",
///                       "members",
///                       "qualification_status"
///                     ],
///                     "properties": {
///                       "id": {
///                         "type": "string",
///                         "format": "uuid"
///                       },
///                       "name": {
///                         "type": "string"
///                       },
///                       "logo_url": { "type": "string", "description": "Saved Provider logo URL; empty uses the default logo." },
///                       "api_keys": {
///                         "type": "integer",
///                         "minimum": 0
///                       },
///                       "models": {
///                         "type": "integer",
///                         "minimum": 0
///                       },
///                       "members": {
///                         "type": "integer",
///                         "minimum": 0
///                       },
///                       "offers": {"type":"integer","minimum":0,"description":"Saved model offers with agreed Provider rates."},
///                       "ready_offers": {"type":"integer","minimum":0,"description":"Active offers with current Provider and exact offer/rate qualification, enabled matching routes and saved credentials. Customer selling prices and authorization remain workspace-specific; this is not a live health check."},
///                       "enabled_api_keys": {"type":"integer","minimum":0},
///                       "enabled_model_routes": {"type":"integer","minimum":0},
///                       "qualification_status": {
///                         "type": "string",
///                         "enum": [
///                           "qualified",
///                           "unqualified"
///                         ]
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
///         "description": "Missing, expired or revoked administrative credential"
///       },
///       "403": {
///         "description": "Platform administration required"
///       },
///       "503": {
///         "description": "Storage unavailable"
///       }
///     },
///     "tags": [
///       "Providers"
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
///     "operationId": "listProviderMembers",
///     "summary": "List Provider business members",
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
///         "description": "Provider missing or deleted"
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

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OfferHistoryQuery {
    before: Option<Uuid>,
    limit: Option<i64>,
}

/// Provider history requires the same procurement authority as an individual quote.
/// ```openapi
/// {
///   "path": "/admin/v1/providers/{provider}/offers/{offer}/revisions",
///   "method": "get",
///   "operation": {
///     "operationId": "listProviderOfferHistory",
///     "summary": "List immutable Provider quote history",
///     "description": "Installation administration or active membership in this Provider is required. Company ownership does not grant procurement access. Newest first by created_at and revision UUID with exclusive keyset pagination, not commit order. One statement snapshot keeps each page and current pointer coherent; separate pages do not share a snapshot. New publications appear on a fresh first page. A foreign or missing cursor returns 409; a missing or inaccessible Provider/offer returns 404. Text prices are exact nanounits per million tokens; media text prices are null and use separate media rate cards. No credentials, endpoints or customer prices. Reading does not qualify, activate or reprice offers. Internal identifiers are API references, not UI labels.",
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
///       },
///       {
///         "name": "offer",
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
///         "description": "Bounded historical procurement page.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
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
///                   "items": {
///                     "$ref": "#/components/schemas/ProviderOfferHistoryEntry"
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
///         "description": "Invalid query, limit or path."
///       },
///       "401": {
///         "description": "Management authentication required."
///       },
///       "404": {
///         "description": "Provider membership denied or offer not found."
///       },
///       "409": {
///         "description": "Cursor does not belong to this offer."
///       },
///       "503": {
///         "description": "Storage unavailable."
///       }
///     },
///     "x-niu-implementation": "implemented"
///   },
///   "schemas": {
///     "ProviderOfferHistoryEntry": {
///       "oneOf": [
///         {
///           "type": "object",
///           "additionalProperties": false,
///           "required": [
///             "revision",
///             "model_alias",
///             "created_at",
///             "rate_kind",
///             "currency",
///             "prompt_rate",
///             "completion_rate",
///             "cached_prompt_rate",
///             "is_current",
///             "reasoning_completion_rate",
///             "cache_write_prompt_rate"
///           ],
///           "properties": {
///             "revision": {
///               "type": "string",
///               "format": "uuid"
///             },
///             "model_alias": {
///               "type": "string"
///             },
///             "created_at": {
///               "type": "string",
///               "format": "date-time"
///             },
///             "rate_kind": {
///               "const": "text"
///             },
///             "currency": {
///               "type": "string",
///               "pattern": "^[A-Z]{3}$"
///             },
///             "prompt_rate": {
///               "type": "string",
///               "pattern": "^[0-9]+$"
///             },
///             "completion_rate": {
///               "type": "string",
///               "pattern": "^[0-9]+$"
///             },
///             "cached_prompt_rate": {
///               "type": [
///                 "string",
///                 "null"
///               ],
///               "pattern": "^[0-9]+$"
///             },
///             "is_current": {
///               "type": "boolean"
///             },
///             "reasoning_completion_rate": {
///               "type": [
///                 "string",
///                 "null"
///               ],
///               "pattern": "^[0-9]+$",
///               "description": "Reported reasoning output is a subset of total completion tokens. A configured rate prices that subset separately; missing quantity remains unresolved."
///             },
///             "cache_write_prompt_rate": {
///               "type": [
///                 "string",
///                 "null"
///               ],
///               "pattern": "^[0-9]+$",
///               "description": "Reported cache-write input is a disjoint subset of aggregate input. A configured Provider rate prices it separately; missing quantity remains unresolved."
///             },
///             "context_tiers": {
///               "type": "array",
///               "maxItems": 32,
///               "items": {
///                 "type": "object",
///                 "additionalProperties": false,
///                 "required": [
///                   "minimum_input_tokens",
///                   "prompt_rate",
///                   "completion_rate"
///                 ],
///                 "properties": {
///                   "minimum_input_tokens": {
///                     "type": "string",
///                     "pattern": "^[0-9]+$",
///                     "description": "Positive inclusive aggregate input threshold, at most 9223372036854775807."
///                   },
///                   "prompt_rate": {
///                     "type": "string",
///                     "pattern": "^[0-9]+$",
///                     "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
///                   },
///                   "completion_rate": {
///                     "type": "string",
///                     "pattern": "^[0-9]+$",
///                     "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
///                   },
///                   "cached_prompt_rate": {
///                     "type": [
///                       "string",
///                       "null"
///                     ],
///                     "pattern": "^[0-9]+$",
///                     "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
///                   },
///                   "cache_write_prompt_rate": {
///                     "type": [
///                       "string",
///                       "null"
///                     ],
///                     "pattern": "^[0-9]+$",
///                     "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
///                   },
///                   "reasoning_completion_rate": {
///                     "type": [
///                       "string",
///                       "null"
///                     ],
///                     "pattern": "^[0-9]+$",
///                     "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
///                   }
///                 }
///               },
///               "description": "Complete whole-request schedules; highest inclusive input threshold wins. Null category rates do not inherit the base schedule. Empty array clears tiers; omitting existing tiers conflicts."
///             }
///           }
///         },
///         {
///           "type": "object",
///           "additionalProperties": false,
///           "required": [
///             "revision",
///             "model_alias",
///             "created_at",
///             "rate_kind",
///             "currency",
///             "prompt_rate",
///             "completion_rate",
///             "cached_prompt_rate",
///             "is_current",
///             "reasoning_completion_rate",
///             "cache_write_prompt_rate"
///           ],
///           "properties": {
///             "revision": {
///               "type": "string",
///               "format": "uuid"
///             },
///             "model_alias": {
///               "type": "string"
///             },
///             "created_at": {
///               "type": "string",
///               "format": "date-time"
///             },
///             "rate_kind": {
///               "const": "media"
///             },
///             "currency": {
///               "type": "null"
///             },
///             "prompt_rate": {
///               "type": "null"
///             },
///             "completion_rate": {
///               "type": "null"
///             },
///             "cached_prompt_rate": {
///               "type": "null"
///             },
///             "is_current": {
///               "type": "boolean"
///             },
///             "reasoning_completion_rate": {
///               "type": "null",
///               "description": "Reported reasoning output is a subset of total completion tokens. A configured rate prices that subset separately; missing quantity remains unresolved."
///             },
///             "cache_write_prompt_rate": {
///               "type": "null",
///               "description": "Reported cache-write input is a disjoint subset of aggregate input. A configured Provider rate prices it separately; missing quantity remains unresolved."
///             }
///           }
///         }
///       ]
///     }
///   }
/// }
/// ```
pub async fn offer_history(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((provider, offer)): Path<(Uuid, Uuid)>,
    Query(page): Query<OfferHistoryQuery>,
) -> Result<Json<Value>, ApiError> {
    let authorization = auth(&state, &headers).await?;
    if !authorization.can_manage_platform() {
        member(&state, &headers, provider, false).await?;
    }
    state
        .store
        .provider_offer_history(provider, offer, page.before, page.limit.unwrap_or(50))
        .await
        .map_err(ApiError::from_store)?
        .map(Json)
        .ok_or_else(ApiError::not_found)
}

/// ```openapi
/// {
///   "path": "/admin/v1/providers/{provider}/settlements",
///   "method": "get",
///   "operation": {
///     "operationId": "listProviderSettlements",
///     "summary": "Page Provider settlement history",
///     "description": "Platform administration or active membership of this Provider required. Lists immutable records of externally confirmed payments; does not initiate payment or claim a bank balance. Ordered by created_at then id descending, with 1–100 rows per page. All amounts are exact currency nanounit strings. No customer, workspace, request, attempt, credential, or procurement detail is included. Time range is from_ms-inclusive and to_ms-exclusive (Unix milliseconds). Keep filters fixed while following next_cursor; a cursor outside this Provider or the filters returns 409. Inserts newer than the cursor do not shift later pages; pages do not constitute a frozen multi-request snapshot. All responses are no-store. Existing POST recording semantics are unchanged.",
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
///         "name": "provider",
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
///         "description": "Prior next_cursor; omit for the first page."
///       },
///       {
///         "name": "currency",
///         "in": "query",
///         "required": false,
///         "schema": {
///           "type": "string",
///           "pattern": "^[A-Z]{3}$"
///         },
///         "description": "Filter one currency without conversion."
///       },
///       {
///         "name": "from_ms",
///         "in": "query",
///         "required": false,
///         "schema": {
///           "type": "integer",
///           "format": "int64",
///           "minimum": 0,
///           "maximum": 253402300799999
///         },
///         "description": "Inclusive payment-record creation time. Unix milliseconds."
///       },
///       {
///         "name": "to_ms",
///         "in": "query",
///         "required": false,
///         "schema": {
///           "type": "integer",
///           "format": "int64",
///           "minimum": 0,
///           "maximum": 253402300799999
///         },
///         "description": "Exclusive payment-record creation time; must follow from. Unix milliseconds."
///       },
///       {
///         "name": "limit",
///         "in": "query",
///         "required": false,
///         "schema": {
///           "type": "integer",
///           "minimum": 1,
///           "maximum": 100,
///           "default": 50
///         },
///         "description": "Maximum page size."
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Settlement page; null next_cursor means the end.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data",
///                 "next_cursor"
///               ],
///               "additionalProperties": false,
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "type": "object",
///                     "required": [
///                       "id",
///                       "currency",
///                       "amount_nanos",
///                       "payment_reference",
///                       "created_at"
///                     ],
///                     "additionalProperties": false,
///                     "properties": {
///                       "id": {
///                         "type": "string",
///                         "format": "uuid"
///                       },
///                       "currency": {
///                         "type": "string",
///                         "pattern": "^[A-Z]{3}$"
///                       },
///                       "amount_nanos": {
///                         "type": "string",
///                         "pattern": "^[0-9]+$"
///                       },
///                       "payment_reference": {
///                         "type": "string"
///                       },
///                       "created_at": {
///                         "type": "string",
///                         "format": "date-time"
///                       }
///                     }
///                   }
///                 },
///                 "next_cursor": {
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
///         "description": "Invalid filters, range or page size."
///       },
///       "401": {
///         "description": "Invalid credential."
///       },
///       "403": {
///         "description": "Unsupported administrative authority."
///       },
///       "404": {
///         "description": "Provider not found or membership unavailable."
///       },
///       "409": {
///         "description": "Cursor not in this Provider and filter scope."
///       },
///       "503": {
///         "description": "Storage unavailable."
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub async fn settlement_history(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(provider): Path<Uuid>,
    Query(query): Query<niu_storage::ProviderSettlementQuery>,
) -> Result<Json<Value>, ApiError> {
    let authorization = auth(&state, &headers).await?;
    if !authorization.can_manage_platform() {
        member(&state, &headers, provider, false).await?;
    }
    state
        .store
        .provider_settlement_history(provider, &query)
        .await
        .map_err(ApiError::from_store)?
        .map(Json)
        .ok_or_else(ApiError::not_found)
}

/// ```openapi
/// {
///   "path": "/admin/v1/providers/{provider}/earnings",
///   "method": "get",
///   "operation": {
///     "operationId": "listProviderEarnings",
///     "summary": "Page platform Provider accrued and paid obligations",
///     "description": "Platform administration required; Provider membership and company ownership do not grant access. Full retained earning history, creation time descending then attempt ID ascending, using the existing ledger index. Exact amount strings; no customer identity, workspace, credential or customer selling price. The id is an internal selection value for the existing settlement POST, never a display label. A page is one database snapshot; settlement status may change between requests and settlement writes revalidate unpaid selections. Reads do not create earnings or payments. Missing or out-of-filter cursors return 409. Cache-Control no-store.",
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
///         "name": "provider",
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
///         "description": "Prior next_cursor; omit for the first page."
///       },
///       {
///         "name": "currency",
///         "in": "query",
///         "required": false,
///         "schema": {
///           "type": "string",
///           "pattern": "^[A-Z]{3}$"
///         },
///         "description": "Filter one currency without conversion."
///       },
///       {
///         "name": "from_ms",
///         "in": "query",
///         "required": false,
///         "schema": {
///           "type": "integer",
///           "format": "int64",
///           "minimum": 0,
///           "maximum": 253402300799999
///         },
///         "description": "Inclusive payment-record creation time. Unix milliseconds."
///       },
///       {
///         "name": "to_ms",
///         "in": "query",
///         "required": false,
///         "schema": {
///           "type": "integer",
///           "format": "int64",
///           "minimum": 0,
///           "maximum": 253402300799999
///         },
///         "description": "Exclusive payment-record creation time; must follow from. Unix milliseconds."
///       },
///       {
///         "name": "limit",
///         "in": "query",
///         "required": false,
///         "schema": {
///           "type": "integer",
///           "minimum": 1,
///           "maximum": 100,
///           "default": 50
///         },
///         "description": "Maximum page size."
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Provider earning page; next_cursor null ends traversal.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data",
///                 "next_cursor"
///               ],
///               "additionalProperties": false,
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "type": "object",
///                     "required": [
///                       "id",
///                       "model_alias",
///                       "currency",
///                       "amount_nanos",
///                       "billing_meter",
///                       "created_at",
///                       "status",
///                       "revision",
///                       "offer_id",
///                       "context_minimum_input_tokens",
///                       "prompt_tokens",
///                       "completion_tokens",
///                       "cached_prompt_tokens",
///                       "cache_write_prompt_tokens",
///                       "reasoning_completion_tokens"
///                     ],
///                     "additionalProperties": false,
///                     "properties": {
///                       "id": {
///                         "type": "string",
///                         "format": "uuid"
///                       },
///                       "currency": {
///                         "type": "string",
///                         "pattern": "^[A-Z]{3}$"
///                       },
///                       "amount_nanos": {
///                         "type": "string",
///                         "pattern": "^[0-9]+$"
///                       },
///                       "created_at": {
///                         "type": "string",
///                         "format": "date-time"
///                       },
///                       "model_alias": {
///                         "type": "string"
///                       },
///                       "billing_meter": {
///                         "type": "string"
///                       },
///                       "status": {
///                         "type": "string",
///                         "enum": [
///                           "accrued",
///                           "paid"
///                         ]
///                       },
///                       "revision": {
///                         "type": "string",
///                         "format": "uuid"
///                       },
///                       "offer_id": {
///                         "type": "string",
///                         "format": "uuid"
///                       },
///                       "context_minimum_input_tokens": {
///                         "type": [
///                           "string",
///                           "null"
///                         ],
///                         "pattern": "^[0-9]+$"
///                       },
///                       "prompt_tokens": {
///                         "type": [
///                           "string",
///                           "null"
///                         ],
///                         "pattern": "^[0-9]+$"
///                       },
///                       "completion_tokens": {
///                         "type": [
///                           "string",
///                           "null"
///                         ],
///                         "pattern": "^[0-9]+$"
///                       },
///                       "cached_prompt_tokens": {
///                         "type": [
///                           "string",
///                           "null"
///                         ],
///                         "pattern": "^[0-9]+$"
///                       },
///                       "cache_write_prompt_tokens": {
///                         "type": [
///                           "string",
///                           "null"
///                         ],
///                         "pattern": "^[0-9]+$"
///                       },
///                       "reasoning_completion_tokens": {
///                         "type": [
///                           "string",
///                           "null"
///                         ],
///                         "pattern": "^[0-9]+$"
///                       }
///                     }
///                   }
///                 },
///                 "next_cursor": {
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
///         "description": "Invalid filters, range or page size."
///       },
///       "401": {
///         "description": "Invalid credential."
///       },
///       "403": {
///         "description": "Platform administration required, including for Provider members."
///       },
///       "404": {
///         "description": "Provider does not exist or is deleted."
///       },
///       "409": {
///         "description": "Cursor not in this Provider and filter scope."
///       },
///       "503": {
///         "description": "Storage unavailable."
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub async fn earning_history(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(provider): Path<Uuid>,
    Query(query): Query<niu_storage::LedgerHistoryQuery>,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    state
        .store
        .provider_earning_history(provider, &query)
        .await
        .map_err(ApiError::from_store)?
        .map(Json)
        .ok_or_else(ApiError::not_found)
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CurrentOfferPage {
    after: Option<String>,
    limit: Option<i64>,
}

/// ```openapi
/// {
///   "path": "/admin/v1/providers/{provider}/offers",
///   "method": "get",
///   "operation": {
///     "operationId": "listProviderOffersPage",
///     "summary": "Page current Provider offers and rate revisions",
///     "description": "Platform administration or active membership of this Provider required. Canonical model-alias keyset order, 1–100 entries per page. Includes paused and unqualified drafts; does not activate an offer or establish commercial qualification. after must identify an existing offer of this Provider or returns 409. Follow next_after until null. Each page has one statement snapshot; multiple pages are not a frozen snapshot. No customer identities, requests, credentials or endpoint data. Dashboard offers remain a 1000-row preview with offers_has_more.",
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
///         "name": "provider",
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
///           "maxLength": 200
///         }
///       },
///       {
///         "name": "limit",
///         "in": "query",
///         "schema": {
///           "type": "integer",
///           "minimum": 1,
///           "maximum": 100,
///           "default": 100
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Current scoped offers and continuation.",
///         "headers": {
///           "Cache-Control": {
///             "schema": {
///               "type": "string",
///               "const": "no-store"
///             }
///           }
///         },
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "required": [
///                 "data",
///                 "next_after"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "maxItems": 100,
///                   "items": {
///                     "type": "object",
///                     "additionalProperties": false,
///                     "required": [
///                       "id",
///                       "model_alias",
///                       "active",
///                       "qualified",
///                       "revision",
///                       "rate_kind",
///                       "currency",
///                       "prompt_rate",
///                       "completion_rate",
///                       "cached_prompt_rate",
///                       "route_ready",
///                       "reasoning_completion_rate",
///                       "cache_write_prompt_rate"
///                     ],
///                     "properties": {
///                       "id": {
///                         "type": "string",
///                         "format": "uuid"
///                       },
///                       "model_alias": {
///                         "type": "string"
///                       },
///                       "active": {
///                         "type": "boolean"
///                       },
///                       "qualified": {
///                         "type": "boolean"
///                       },
///                       "revision": {
///                         "type": "string",
///                         "format": "uuid"
///                       },
///                       "rate_kind": {
///                         "type": "string",
///                         "enum": [
///                           "text",
///                           "media"
///                         ]
///                       },
///                       "currency": {
///                         "type": [
///                           "string",
///                           "null"
///                         ]
///                       },
///                       "prompt_rate": {
///                         "type": [
///                           "string",
///                           "null"
///                         ]
///                       },
///                       "completion_rate": {
///                         "type": [
///                           "string",
///                           "null"
///                         ]
///                       },
///                       "cached_prompt_rate": {
///                         "type": [
///                           "string",
///                           "null"
///                         ]
///                       },
///                       "route_ready": {
///                         "type": "boolean"
///                       },
///                       "reasoning_completion_rate": {
///                         "type": [
///                           "string",
///                           "null"
///                         ],
///                         "description": "Reported reasoning output is a subset of total completion tokens. A configured rate prices that subset separately; missing quantity remains unresolved."
///                       },
///                       "cache_write_prompt_rate": {
///                         "type": [
///                           "string",
///                           "null"
///                         ],
///                         "description": "Reported cache-write input is a disjoint subset of aggregate input. A configured Provider rate prices it separately; missing quantity remains unresolved."
///                       },
///                       "context_tiers": {
///                         "type": "array",
///                         "maxItems": 32,
///                         "items": {
///                           "type": "object",
///                           "additionalProperties": false,
///                           "required": [
///                             "minimum_input_tokens",
///                             "prompt_rate",
///                             "completion_rate"
///                           ],
///                           "properties": {
///                             "minimum_input_tokens": {
///                               "type": "string",
///                               "pattern": "^[0-9]+$",
///                               "description": "Positive inclusive aggregate input threshold, at most 9223372036854775807."
///                             },
///                             "prompt_rate": {
///                               "type": "string",
///                               "pattern": "^[0-9]+$",
///                               "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
///                             },
///                             "completion_rate": {
///                               "type": "string",
///                               "pattern": "^[0-9]+$",
///                               "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
///                             },
///                             "cached_prompt_rate": {
///                               "type": [
///                                 "string",
///                                 "null"
///                               ],
///                               "pattern": "^[0-9]+$",
///                               "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
///                             },
///                             "cache_write_prompt_rate": {
///                               "type": [
///                                 "string",
///                                 "null"
///                               ],
///                               "pattern": "^[0-9]+$",
///                               "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
///                             },
///                             "reasoning_completion_rate": {
///                               "type": [
///                                 "string",
///                                 "null"
///                               ],
///                               "pattern": "^[0-9]+$",
///                               "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
///                             }
///                           }
///                         },
///                         "description": "Complete whole-request schedules; highest inclusive input threshold wins. Null category rates do not inherit the base schedule. Empty array clears tiers; omitting existing tiers conflicts."
///                       }
///                     }
///                   }
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
///         "description": "Invalid pagination query."
///       },
///       "401": {
///         "description": "Invalid session."
///       },
///       "404": {
///         "description": "Provider missing or unauthorized."
///       },
///       "409": {
///         "description": "Missing or foreign continuation alias."
///       },
///       "503": {
///         "description": "Storage unavailable."
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub async fn offers(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(provider): Path<Uuid>,
    Query(page): Query<CurrentOfferPage>,
) -> Result<Json<Value>, ApiError> {
    let authorization = auth(&state, &headers).await?;
    if !authorization.can_manage_platform() {
        member(&state, &headers, provider, false).await?;
    }
    state
        .store
        .provider_offer_page(provider, page.after.as_deref(), page.limit.unwrap_or(100))
        .await
        .map_err(ApiError::from_store)?
        .map(Json)
        .ok_or_else(ApiError::not_found)
}
