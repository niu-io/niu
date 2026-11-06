use super::models::{make_model, validate_model};
use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use uuid::Uuid;

const MAX_MODEL_CATALOG_BYTES: usize = 2 * 1024 * 1024;

async fn qiniu_public_metadata(
    state: &AppState,
    timeout: Duration,
) -> Option<std::collections::BTreeMap<String, crate::catalog_metadata::CatalogMetadata>> {
    const URL: &str = "https://www.qiniu.com/ai/models";
    let client = crate::upstream::configured_client_for_endpoint(state, URL, timeout)
        .await
        .ok()?;
    // This public request must never receive the saved Provider credential.
    let mut response = client.get(URL).send().await.ok()?;
    if !response.status().is_success() {
        return None;
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.ok()? {
        if bytes.len().saturating_add(chunk.len()) > MAX_MODEL_CATALOG_BYTES {
            return None;
        }
        bytes.extend_from_slice(&chunk);
    }
    crate::providers::adapters::qiniu_model_square_metadata(std::str::from_utf8(&bytes).ok()?)
}

/// Diagnostics use only server-owned authentication, never client headers.
/// Anthropic catalogs are bounded to one maximal page; incomplete catalogs
/// must not be mistaken for a complete inventory or a missing model.
fn model_catalog_request(
    client: &reqwest::Client,
    endpoint: &str,
    adapter: &str,
    api_key: &str,
) -> reqwest::RequestBuilder {
    let request = client
        .get(endpoint)
        .header(axum::http::header::ACCEPT, "application/json");
    if adapter == "anthropic" {
        request
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .query(&[("limit", "1000")])
    } else if adapter == "gemini" {
        request
            .header("x-goog-api-key", api_key)
            .query(&[("pageSize", "1000")])
    } else {
        request.bearer_auth(api_key)
    }
}

/// Normalize only the documented catalog envelope and descriptive fields.
/// Native resource names become model IDs accepted by GenerateContent; no
/// upstream price automatically enables a billing capability.
fn catalog_models(catalog: &Value, adapter: &str) -> Option<Vec<Value>> {
    let field = if adapter == "gemini" {
        "models"
    } else {
        "data"
    };
    let models = catalog.get(field)?.as_array()?;
    Some(models.iter().map(|model| {
        if adapter != "gemini" { return model.clone(); }
        json!({
            "id": model.get("name").and_then(Value::as_str).and_then(|name| name.strip_prefix("models/")),
            "name": model.get("displayName"),
            "description": model.get("description"),
            "context_length": model.get("inputTokenLimit"),
            "top_provider": { "max_completion_tokens": model.get("outputTokenLimit") }
        })
    }).collect())
}

fn catalog_complete(catalog: &Value, adapter: &str) -> bool {
    match adapter {
        "anthropic" => catalog.get("has_more").and_then(Value::as_bool) == Some(false),
        "gemini" => catalog
            .get("nextPageToken")
            .is_none_or(|token| token.as_str() == Some("")),
        _ => true,
    }
}

pub(super) async fn installation(state: &AppState, headers: &HeaderMap) -> Result<(), ApiError> {
    state.authorize_platform_headers(headers).await?;
    Ok(())
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CreateVendor {
    name: String,
    adapter: String,
    api_base: String,
    api_key: String,
    #[serde(default = "enabled")]
    enabled: bool,
    #[serde(default)]
    create_supplier: bool,
    supplier_id: Option<Uuid>,
    /// Funding/ownership account. Access scope is independent.
    personal_organization_id: Option<Uuid>,
    /// `personal` restricts access to the funding account. `internal` shares the
    /// owner-funded credential with every organization on an Internal-use
    /// installation. Omission preserves the pre-scope API behavior: an explicit
    /// funding account creates a personal credential; Resale without one creates
    /// commercial shared supply; Internal use requires an explicit choice.
    #[serde(default)]
    access_scope: Option<niu_storage::VendorAccessScope>,
}
fn enabled() -> bool {
    true
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PersonalOwnerInput {
    organization_id: Uuid,
    expected_revision: i64,
}

/// Installation-owned credentials require explicit administrative assignment.
/// Account ownership is immutable and does not activate any commercial offer.
pub async fn assign_personal_owner(
    State(state): State<AppState>,
    Path(vendor_id): Path<Uuid>,
    headers: HeaderMap,
    Json(input): Json<PersonalOwnerInput>,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    if input.expected_revision < 1 {
        return Err(ApiError::invalid_request(
            "A positive credential revision is required",
        ));
    }
    state
        .store
        .assign_personal_vendor_owner(vendor_id, input.organization_id, input.expected_revision)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"assigned": true})))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdateVendor {
    name: String,
    api_base: String,
    enabled: bool,
    expected_revision: i64,
    api_key: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ModelInput {
    pub alias: String,
    pub upstream_model: String,
    #[serde(default)]
    pub public_catalog: bool,
    #[serde(default = "enabled")]
    pub enabled: bool,
    #[serde(default = "empty_capabilities")]
    pub capabilities: Value,
    #[serde(default, deserialize_with = "pricing_input")]
    pub pricing: Option<Option<Value>>,
    pub expected_revision: Option<i64>,
}
fn pricing_input<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<Option<Value>>, D::Error> {
    // Missing preserves stored pricing; explicit null clears it.
    Option::<Value>::deserialize(deserializer).map(Some)
}

fn empty_capabilities() -> Value {
    json!({})
}

impl ModelInput {
    pub(super) fn storage(self) -> niu_storage::VendorModelInput {
        niu_storage::VendorModelInput {
            alias: self.alias,
            upstream_model: self.upstream_model,
            public_catalog: self.public_catalog,
            enabled: self.enabled,
            capabilities: self.capabilities,
            pricing: self.pricing.flatten(),
            expected_revision: self.expected_revision,
        }
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VendorFilter {
    supplier: Option<Uuid>,
}

/// ```openapi
/// {
///   "path": "/api/v1/vendors",
///   "method": "get",
///   "operation": {
///     "operationId": "listVendors",
///     "parameters": [
///       {
///         "name": "supplier",
///         "in": "query",
///         "required": false,
///         "description": "Filter by explicit Provider business ownership; no name matching or unassociated fallback. Platform administration is required. A missing or deleted Provider returns 404; an active Provider without configurations returns an empty data array.",
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       }
///     ],
///     "summary": "List Provider API-key configurations without credentials",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "responses": {
///       "404": { "description": "Selected Provider does not exist or has been deleted." },
///       "200": {
///         "description": "Vendor metadata. All management responses use Cache-Control no-store.",
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
///                     "$ref": "#/components/schemas/Vendor"
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "403": {
///         "description": "Platform administration permission required."
///       },
///       "401": {
///         "description": "Invalid or expired administrative credential."
///       }
///     },
///     "x-niu-implementation": "implemented",
///     "description": "Returns every matching configuration, including disabled configurations, in one data array. Optional Provider filtering uses explicit business ownership. No pagination or silent row cap; response memory grows with list size. Requires installation administration or an explicitly granted platform administrator. Each configuration has independent credentials and model bindings. Credentials are write-only and never returned."
///   },
///   "schemas": {
///     "Vendor": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "id",
///         "name",
///         "adapter",
///         "api_base",
///         "enabled",
///         "revision",
///         "has_credential"
///       ],
///       "properties": {
///         "id": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "name": {
///           "type": "string"
///         },
///         "adapter": {
///           "type": "string",
///           "enum": [
///             "openrouter",
///             "openai",
///             "anthropic",
///             "gemini",
///             "ark"
///           ]
///         },
///         "api_base": {
///           "type": "string",
///           "format": "uri"
///         },
///         "enabled": {
///           "type": "boolean"
///         },
///         "revision": {
///           "type": "integer",
///           "minimum": 1
///         },
///         "has_credential": {
///           "type": "boolean"
///         },
///         "owner_funded": {
///           "type": "boolean",
///           "readOnly": true,
///           "description": "Configuration-list metadata identifying a credential paid directly by one account. Not accepted in configuration writes."
///         },
///         "access_scope": {
///           "type": "string",
///           "enum": ["commercial", "personal", "internal"],
///           "readOnly": true,
///           "description": "Effective credential access scope. commercial is shared commercial supply; personal is restricted to its funding account; internal is an owner-funded credential shared with every organization while Internal use is active and restricted to its funding account in Resale."
///         },
///         "supplier": {
///           "type": [
///             "object",
///             "null"
///           ],
///           "description": "Provider ownership on configuration-list reads; credentials and commercial data are excluded.",
///           "required": [
///             "id",
///             "name"
///           ],
///           "additionalProperties": false,
///           "properties": {
///             "id": {
///               "type": "string",
///               "format": "uuid"
///             },
///             "name": {
///               "type": "string"
///             }
///           }
///         }
///       }
///     },
///     "VendorCreate": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "name",
///         "adapter",
///         "api_base",
///         "api_key"
///       ],
///       "properties": {
///         "name": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 100
///         },
///         "adapter": {
///           "type": "string",
///           "enum": [
///             "openrouter",
///             "openai",
///             "anthropic",
///             "gemini",
///             "ark"
///           ]
///         },
///         "api_base": {
///           "type": "string",
///           "format": "uri",
///           "maxLength": 2048,
///           "description": "HTTPS endpoint or HTTP loopback endpoint without URL credentials or query parameters."
///         },
///         "api_key": {
///           "type": "string",
///           "writeOnly": true,
///           "minLength": 1,
///           "maxLength": 8192
///         },
///         "enabled": {
///           "type": "boolean",
///           "default": true
///         },
///         "supplier_id": {
///           "type": "string",
///           "format": "uuid",
///           "description": "Existing Provider business to own this API-key configuration. Mutually exclusive with create_supplier=true; ownership and creation commit atomically."
///         },
///         "personal_organization_id": {
///           "type": "string", "format": "uuid",
///           "description": "Platform-administrator-selected account paying the Provider directly. Access scope is independent. Ownership is created atomically; routes remain owner-funded and do not require resale tariffs. Omission preserves shared creation in Resale; Internal use requires an explicit access choice."
///         },
///         "access_scope": {
///           "type": "string",
///           "enum": ["personal", "internal"],
///           "description": "Explicit credential access. personal restricts use to the funding account. internal shares the owner-funded credential with every organization while Internal use is active; it is rejected in Resale. Omit only for compatibility: an explicit funding account creates personal access, Resale without one creates shared commercial supply, and Internal use without either is rejected instead of silently binding to the current account."
///         },
///         "create_supplier": {
///           "type": "boolean",
///           "default": false,
///           "description": "Atomically create a Provider business with this name and its explicit configuration ownership link. Omission preserves legacy configuration-only creation."
///         }
///       }
///     },
///     "VendorUpdate": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "name",
///         "api_base",
///         "enabled",
///         "expected_revision"
///       ],
///       "properties": {
///         "name": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 100
///         },
///         "api_base": {
///           "type": "string",
///           "format": "uri",
///           "maxLength": 2048
///         },
///         "api_key": {
///           "type": "string",
///           "writeOnly": true,
///           "minLength": 1,
///           "maxLength": 8192,
///           "description": "Omit to retain the current credential."
///         },
///         "enabled": {
///           "type": "boolean"
///         },
///         "expected_revision": {
///           "type": "integer",
///           "minimum": 1
///         }
///       }
///     }
///   }
/// }
/// ```
pub async fn list(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(filter): Query<VendorFilter>,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    if let Some(supplier) = filter.supplier {
        state
            .store
            .supplier_profile(supplier)
            .await
            .map_err(ApiError::from_store)?
            .ok_or_else(ApiError::not_found)?;
    }
    let data = state
        .store
        .vendors_with_supplier(filter.supplier)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":data})))
}

/// ```openapi
/// {
///   "path": "/api/v1/vendors",
///   "method": "post",
///   "operation": {
///     "operationId": "createVendor",
///     "summary": "Create an encrypted Provider API-key configuration",
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
///             "$ref": "#/components/schemas/VendorCreate"
///           }
///         }
///       }
///     },
///     "responses": {
///       "201": {
///         "description": "Created vendor metadata wrapped in data. The credential is never returned.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "$ref": "#/components/schemas/Vendor"
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid vendor configuration."
///       },
///       "403": {
///         "description": "Platform administration permission required."
///       },
///       "409": {
///         "description": "Vendor name already exists."
///       },
///       "503": {
///         "description": "Storage or credential encryption unavailable."
///       },
///       "401": {
///         "description": "Invalid or expired administrative credential."
///       }
///     },
///     "parameters": [],
///     "x-niu-implementation": "implemented",
///     "description": " Requires installation administration or an explicitly granted platform administrator. Each configuration has independent credentials and model bindings. Credentials are write-only and never returned."
///   }
/// }
/// ```
pub async fn create(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateVendor>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let authorization = state.authorize_platform_headers(&headers).await?;
    let internal_mode = state.operating_mode == crate::state::OperatingMode::Internal;
    let access_scope = match input.access_scope {
        Some(niu_storage::VendorAccessScope::Internal) if !internal_mode => {
            return Err(ApiError::invalid_request(
                "Internal access scope is available only in Internal use",
            ));
        }
        Some(niu_storage::VendorAccessScope::Commercial) => {
            return Err(ApiError::invalid_request(
                "Commercial supply is selected by omitting a funding account, not by access scope",
            ));
        }
        Some(scope) => scope,
        // Preserve pre-scope behavior only when the caller named a funding
        // account. Do not silently bind Internal use to the current account.
        None if input.personal_organization_id.is_some() => {
            niu_storage::VendorAccessScope::Personal
        }
        None if internal_mode => {
            return Err(ApiError::invalid_request(
                "Choose personal or internal access scope for this Provider connection",
            ));
        }
        None => niu_storage::VendorAccessScope::Commercial,
    };
    let personal_owner = match access_scope {
        niu_storage::VendorAccessScope::Commercial => None,
        niu_storage::VendorAccessScope::Personal | niu_storage::VendorAccessScope::Internal => {
            Some(match input.personal_organization_id {
                Some(owner) => owner,
                None if internal_mode => match authorization {
                    crate::state::AdminAuthorization::Operator(operator) => {
                        operator.scope.organization_id
                    }
                    crate::state::AdminAuthorization::Installation => {
                        state
                            .store
                            .default_workspace()
                            .await
                            .map_err(ApiError::from_store)?
                            .organization_id
                    }
                },
                None => {
                    return Err(ApiError::invalid_request(
                        "Personal access scope requires a funding account",
                    ));
                }
            })
        }
    };

    if input.create_supplier && input.supplier_id.is_some() {
        return Err(ApiError::invalid_request(
            "Choose a new or existing Provider, not both",
        ));
    }
    validate_model(
        "validation",
        make_model(
            &input.adapter,
            &input.api_base,
            "validation",
            json!({}),
            None,
        )?,
    )?;
    let id = Uuid::new_v4();
    let cipher = state
        .vendor_cipher
        .as_ref()
        .ok_or_else(ApiError::unavailable)?;
    let ciphertext = cipher
        .seal(id, &input.api_key)
        .map_err(ApiError::invalid_request)?;
    let vendor = state
        .store
        .create_vendor_with_access_scope(
            niu_storage::VendorInput {
                id,
                name: input.name,
                adapter: input.adapter,
                api_base: input.api_base,
                enabled: input.enabled,
                credential_ciphertext: ciphertext,
            },
            input.create_supplier,
            input.supplier_id,
            personal_owner,
            access_scope,
        )
        .await
        .map_err(ApiError::from_store)?;
    let mut vendor = serde_json::to_value(vendor).map_err(|_| ApiError::unavailable())?;
    vendor["owner_funded"] = json!(personal_owner.is_some());
    vendor["access_scope"] = json!(access_scope.as_str());
    Ok((StatusCode::CREATED, Json(json!({"data":vendor}))))
}

/// ```openapi
/// {
///   "path": "/api/v1/vendors/{id}",
///   "method": "put",
///   "operation": {
///     "operationId": "updateVendor",
///     "summary": "Update one Provider API-key configuration or rotate its credential",
///     "description": "Adapter is immutable. Changes affect new requests; already dispatched work can finish using its original configuration. Requires installation administration or an explicitly granted platform administrator. Each configuration has independent credentials and model bindings. Credentials are write-only and never returned.",
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
///             "$ref": "#/components/schemas/VendorUpdate"
///           }
///         }
///       }
///     },
///     "responses": {
///       "200": {
///         "description": "Updated vendor metadata wrapped in data.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "$ref": "#/components/schemas/Vendor"
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid configuration or credential."
///       },
///       "403": {
///         "description": "Platform administration permission required."
///       },
///       "404": {
///         "description": "Vendor does not exist."
///       },
///       "409": {
///         "description": "Stale revision or conflicting name."
///       },
///       "401": {
///         "description": "Invalid or expired administrative credential."
///       }
///     },
///     "parameters": [
///       {
///         "name": "id",
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
pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
    Json(input): Json<UpdateVendor>,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    if input.enabled
        && state.operating_mode == crate::state::OperatingMode::Internal
        && state
            .store
            .personal_vendor_organization(id)
            .await
            .map_err(ApiError::from_store)?
            .is_none()
    {
        return Err(ApiError::invalid_request(
            "Internal use cannot enable shared commercial credentials",
        ));
    }

    let current = state
        .store
        .vendor(id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    validate_model(
        "validation",
        make_model(
            &current.adapter,
            &input.api_base,
            "validation",
            json!({}),
            None,
        )?,
    )?;
    let ciphertext = if let Some(key) = input.api_key {
        Some(
            state
                .vendor_cipher
                .as_ref()
                .ok_or_else(ApiError::unavailable)?
                .seal(id, &key)
                .map_err(ApiError::invalid_request)?,
        )
    } else {
        None
    };
    let vendor = state
        .store
        .update_vendor(
            id,
            niu_storage::VendorUpdate {
                name: input.name,
                api_base: input.api_base,
                enabled: input.enabled,
                expected_revision: input.expected_revision,
                credential_ciphertext: ciphertext,
            },
        )
        .await
        .map_err(ApiError::from_store)?;
    let owner_funded = state
        .store
        .personal_vendor_organization(id)
        .await
        .map_err(ApiError::from_store)?
        .is_some();
    let access_scope = state
        .store
        .vendor_access_scope(id)
        .await
        .map_err(ApiError::from_store)?;
    let mut vendor = serde_json::to_value(vendor).map_err(|_| ApiError::unavailable())?;
    vendor["owner_funded"] = json!(owner_funded);
    vendor["access_scope"] = json!(
        access_scope
            .unwrap_or(niu_storage::VendorAccessScope::Commercial)
            .as_str()
    );
    Ok(Json(json!({"data":vendor})))
}

/// ```openapi
/// {
///   "path": "/api/v1/vendors/{id}/models",
///   "method": "get",
///   "operation": {
///     "operationId": "listVendorModels",
///     "summary": "List model bindings for one Provider API-key configuration",
///     "description": "Management reads include route eligibility in available, an owner_funded flag and the effective access_scope. Owner-funded routes use their funding account and are excluded from shared commercial supply and customer tariffs; personal scope restricts them to that account, while internal scope shares them with every organization on an Internal-use installation. Only internal-scope routes honor their explicit public_catalog publication flag. Available does not establish upstream entitlement, service quality or commercial qualification. Requires installation administration or an explicitly granted platform administrator. These platform-only route prices are procurement configuration, not customer selling tariffs.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Model mappings wrapped in data.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "$ref": "#/components/schemas/VendorModel"
///                   }
///                 }
///               },
///               "required": [
///                 "data"
///               ]
///             }
///           }
///         }
///       },
///       "403": {
///         "description": "Platform administration permission required."
///       },
///       "404": {
///         "description": "Vendor does not exist."
///       },
///       "401": {
///         "description": "Invalid or expired administrative credential."
///       }
///     },
///     "parameters": [
///       {
///         "name": "id",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       }
///     ],
///     "x-niu-implementation": "implemented"
///   },
///   "schemas": {
///     "VendorModel": {
///       "type": "object",
///       "required": [
///         "alias",
///         "vendor_id",
///         "upstream_model",
///         "enabled",
///         "public_catalog",
///         "capabilities",
///         "pricing",
///         "revision"
///       ],
///       "properties": {
///         "alias": {
///           "type": "string"
///         },
///         "vendor_id": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "upstream_model": {
///           "type": "string"
///         },
///         "enabled": {
///           "type": "boolean"
///         },
///         "public_catalog": {
///           "type": "boolean"
///         },
///         "available": {
///           "type": "boolean",
///           "readOnly": true,
///           "description": "Configuration eligibility in the management list; not an upstream health or entitlement check."
///         },
///         "owner_funded": {
///           "type": "boolean",
///           "readOnly": true,
///           "description": "Management-list metadata identifying owner-funded routes. Omitted from configuration writes."
///         },
///         "capabilities": {
///           "$ref": "#/components/schemas/VendorCapabilities"
///         },
///         "pricing": {
///           "$ref": "#/components/schemas/VendorRoutePricing"
///         },
///         "revision": {
///           "type": "integer",
///           "minimum": 1
///         }
///       }
///     },
///     "VendorCapabilities": {
///       "type": "object",
///       "additionalProperties": false,
///       "properties": {
///         "catalog": {
///           "$ref": "#/components/schemas/CatalogMetadata"
///         },
///         "video_schema": {
///           "$ref": "#/components/schemas/VideoSchema"
///         },
///         "provider_assets": {
///           "description": "Explicit FastRouter asset protocol on an Ark adapter; not processing readiness or commercial qualification.",
///           "oneOf": [
///             { "type": "null" },
///             {
///               "type": "object",
///               "additionalProperties": false,
///               "required": ["channel"],
///               "properties": {
///                 "channel": { "type": "string", "const": "fastrouter-actions-v1" }
///               }
///             }
///           ]
///         },
///         "supports_tool_calls": {
///           "type": "boolean",
///           "default": false
///         },
///         "supports_streaming_tool_calls": {
///           "type": "boolean",
///           "default": false
///         },
///         "supports_structured_output": {
///           "type": "boolean",
///           "default": false
///         },
///         "supports_embeddings": {
///           "type": "boolean",
///           "default": false
///         },
///         "supports_embedding_dimensions": {
///           "type": "boolean",
///           "default": false
///         },
///         "supports_embedding_base64": {
///           "type": "boolean",
///           "default": false
///         },
///         "supports_generate_content": {
///           "type": "boolean",
///           "default": false,
///           "description": "Native GenerateContent opt-in for static or managed gemini routes; does not imply streaming, tools or media support."
///         },
///         "supports_messages_streaming_tools": {
///           "type": "boolean",
///           "default": false,
///           "description": "Explicit native client-tool SSE capability; requires supports_messages_tools and supports_messages_streaming. JSON arguments are bounded and validated at block completion."
///         },
///         "supports_messages_tools": {
///           "type": "boolean",
///           "default": false,
///           "description": "Explicit buffered native client-tool capability; requires supports_messages. Streaming tools require the separate supports_messages_streaming_tools capability."
///         },
///         "supports_messages_streaming": {
///           "type": "boolean",
///           "default": false,
///           "description": "Explicit native text SSE opt-in; requires supports_messages."
///         },
///         "supports_messages": {
///           "type": "boolean",
///           "default": false,
///           "description": "Explicit native Messages nonstreaming text capability for OpenRouter or Anthropic routes. Does not imply streaming, tools or media support."
///         },
///         "supports_responses": {
///           "type": "boolean",
///           "default": false
///         }
///       }
///     },
///     "CatalogMetadata": {
///       "type": "object",
///       "additionalProperties": false,
///       "description": "Descriptive provider metadata, stored under capabilities.catalog on vendor mappings and exposed as catalog on model listings. Advertised USD per-token prices are separate from billing rates. Missing values mean unknown, never zero.",
///       "properties": {
///         "name": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "maxLength": 300
///         },
///         "description": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "maxLength": 12000
///         },
///         "context_length": {
///           "type": [
///             "integer",
///             "null"
///           ],
///           "minimum": 1
///         },
///         "max_completion_tokens": {
///           "type": [
///             "integer",
///             "null"
///           ],
///           "minimum": 1
///         },
///         "input_modalities": {
///           "type": "array",
///           "maxItems": 16,
///           "items": {
///             "type": "string",
///             "maxLength": 40
///           }
///         },
///         "output_modalities": {
///           "type": "array",
///           "maxItems": 16,
///           "items": {
///             "type": "string",
///             "maxLength": 40
///           }
///         },
///         "supported_parameters": {
///           "type": "array",
///           "maxItems": 64,
///           "items": { "type": "string", "minLength": 1, "maxLength": 80 }
///         },
///         "input_price": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "maxLength": 64,
///           "description": "Advertised USD per input token."
///         },
///         "output_price": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "maxLength": 64,
///           "description": "Advertised USD per output token."
///         }
///       }
///     },
///     "VideoSchema": {
///       "type": "object",
///       "additionalProperties": false,
///       "description": "Versioned constraints for the exact alias/upstream model/channel. The enclosing capabilities document is limited to 16 KiB. Backend validation enforces relative bounds, defaults, input transport, roles and incompatible controls. Configuration does not qualify a route or enable unsupported media/callback transport.",
///       "required": [
///         "version",
///         "revision",
///         "model_alias",
///         "upstream_model",
///         "channel",
///         "maximum_body_bytes",
///         "maximum_content_items",
///         "inputs",
///         "controls",
///         "required_controls",
///         "exclusive_controls",
///         "callbacks_qualified"
///       ],
///       "properties": {
///         "version": {
///           "type": "integer",
///           "const": 1
///         },
///         "revision": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 256,
///           "description": "Trimmed canonical revision with no control characters; at most 256 UTF-8 bytes."
///         },
///         "model_alias": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 200,
///           "description": "Must match the enclosing model alias."
///         },
///         "upstream_model": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 200,
///           "description": "Must match the enclosing upstream mapping."
///         },
///         "channel": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 256,
///           "description": "Exact canonical channel contract; at most 256 UTF-8 bytes."
///         },
///         "maximum_body_bytes": {
///           "type": "integer",
///           "minimum": 1,
///           "maximum": 16777216
///         },
///         "maximum_content_items": {
///           "type": "integer",
///           "minimum": 1,
///           "maximum": 32
///         },
///         "inputs": {
///           "type": "object",
///           "additionalProperties": false,
///           "minProperties": 1,
///           "properties": {
///             "text": {
///               "$ref": "#/components/schemas/VideoInputRule"
///             },
///             "image_url": {
///               "$ref": "#/components/schemas/VideoInputRule"
///             },
///             "video_url": {
///               "$ref": "#/components/schemas/VideoInputRule"
///             },
///             "audio_url": {
///               "$ref": "#/components/schemas/VideoInputRule"
///             }
///           }
///         },
///         "controls": {
///           "type": "object",
///           "additionalProperties": false,
///           "properties": {
///             "duration": {
///               "$ref": "#/components/schemas/VideoIntegerControl"
///             },
///             "seed": {
///               "$ref": "#/components/schemas/VideoIntegerControl"
///             },
///             "frames_per_second": {
///               "$ref": "#/components/schemas/VideoIntegerControl"
///             },
///             "resolution": {
///               "$ref": "#/components/schemas/VideoChoiceControl"
///             },
///             "ratio": {
///               "$ref": "#/components/schemas/VideoChoiceControl"
///             },
///             "watermark": {
///               "$ref": "#/components/schemas/VideoBooleanControl"
///             },
///             "camera_fixed": {
///               "$ref": "#/components/schemas/VideoBooleanControl"
///             },
///             "return_last_frame": {
///               "$ref": "#/components/schemas/VideoBooleanControl"
///             },
///             "callback_url": {
///               "$ref": "#/components/schemas/VideoHttpsControl"
///             }
///           }
///         },
///         "required_controls": {
///           "type": "array",
///           "maxItems": 9,
///           "uniqueItems": true,
///           "description": "Every named control must be configured.",
///           "items": {
///             "type": "string",
///             "enum": [
///               "duration",
///               "resolution",
///               "ratio",
///               "seed",
///               "watermark",
///               "camera_fixed",
///               "return_last_frame",
///               "frames_per_second",
///               "callback_url"
///             ]
///           }
///         },
///         "exclusive_controls": {
///           "type": "array",
///           "maxItems": 32,
///           "description": "Each pair names distinct configured controls; both cannot have defaults.",
///           "items": {
///             "type": "array",
///             "minItems": 2,
///             "maxItems": 2,
///             "uniqueItems": true,
///             "items": {
///               "type": "string",
///               "enum": [
///                 "duration",
///                 "resolution",
///                 "ratio",
///                 "seed",
///                 "watermark",
///                 "camera_fixed",
///                 "return_last_frame",
///                 "frames_per_second",
///                 "callback_url"
///               ]
///             }
///           }
///         },
///         "output": {
///           "$ref": "#/components/schemas/VideoOutputSchema"
///         },
///         "callbacks_qualified": {
///           "type": "boolean",
///           "description": "Required for a callback_url declaration; separate adapter/offer qualification and callback authentication still apply."
///         }
///       }
///     },
///     "VideoInputRule": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "maximum_items",
///         "maximum_bytes",
///         "https",
///         "data_mime_types",
///         "roles",
///         "role_required"
///       ],
///       "description": "Item/count bounds cannot exceed the enclosing request limits. Non-text inputs require HTTPS or at least one allowed Base64 MIME type; required roles need at least one allowed role. Names are trimmed, control-free and limited to 256 UTF-8 bytes.",
///       "properties": {
///         "maximum_items": {
///           "type": "integer",
///           "minimum": 1,
///           "maximum": 32
///         },
///         "maximum_bytes": {
///           "type": "integer",
///           "minimum": 1,
///           "maximum": 16777216
///         },
///         "https": {
///           "type": "boolean"
///         },
///         "data_mime_types": {
///           "type": "array",
///           "maxItems": 16,
///           "uniqueItems": true,
///           "items": {
///             "type": "string",
///             "minLength": 1,
///             "maxLength": 256,
///             "pattern": "/"
///           }
///         },
///         "roles": {
///           "type": "array",
///           "maxItems": 16,
///           "uniqueItems": true,
///           "items": {
///             "type": "string",
///             "minLength": 1,
///             "maxLength": 256
///           }
///         },
///         "role_required": {
///           "type": "boolean"
///         }
///       }
///     },
///     "VideoIntegerControl": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "kind",
///         "minimum",
///         "maximum"
///       ],
///       "description": "Signed 64-bit integer bounds; maximum must be at least minimum and any default must lie within them. The dashboard edits exact JavaScript-safe integers only.",
///       "properties": {
///         "kind": {
///           "type": "string",
///           "const": "integer"
///         },
///         "minimum": {
///           "type": "integer",
///           "format": "int64"
///         },
///         "maximum": {
///           "type": "integer",
///           "format": "int64"
///         },
///         "default": {
///           "type": [
///             "integer",
///             "null"
///           ],
///           "format": "int64"
///         }
///       }
///     },
///     "VideoChoiceControl": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "kind",
///         "values"
///       ],
///       "description": "Values are canonical names of at most 256 UTF-8 bytes; any default must be one of them.",
///       "properties": {
///         "kind": {
///           "type": "string",
///           "const": "choice"
///         },
///         "values": {
///           "type": "array",
///           "minItems": 1,
///           "maxItems": 64,
///           "uniqueItems": true,
///           "items": {
///             "type": "string",
///             "minLength": 1,
///             "maxLength": 256
///           }
///         },
///         "default": {
///           "type": [
///             "string",
///             "null"
///           ]
///         }
///       }
///     },
///     "VideoBooleanControl": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "kind"
///       ],
///       "properties": {
///         "kind": {
///           "type": "string",
///           "const": "boolean"
///         },
///         "default": {
///           "type": [
///             "boolean",
///             "null"
///           ]
///         }
///       }
///     },
///     "VideoHttpsControl": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "kind",
///         "maximum_bytes"
///       ],
///       "properties": {
///         "kind": {
///           "type": "string",
///           "const": "https_url"
///         },
///         "maximum_bytes": {
///           "type": "integer",
///           "minimum": 1,
///           "maximum": 8192
///         }
///       }
///     },
///     "VideoOutputSchema": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "specifications",
///         "estimator",
///         "estimator_revision"
///       ],
///       "description": "Optional effective output mapping for this schema revision. Requires resolution, ratio and positive duration controls, each with a default or required input. Pixel estimation additionally requires a positive frames_per_second control; seconds estimation may omit it. Missing resolution/ratio combinations reject requests before dispatch. Estimates never establish reported usage or maximum liability. The ark-direct-v1 adapter qualifies video_tokens only; openrouter-video-v1 supports owner-funded text generation with seconds estimates and unknown reported quantity.",
///       "properties": {
///         "estimator": {
///           "type": "string",
///           "enum": [
///             "SeedancePixelsV1",
///             "OutputSecondsV1"
///           ]
///         },
///         "estimator_revision": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 256,
///           "description": "Reviewed configuration reference; at most 256 UTF-8 bytes."
///         },
///         "specifications": {
///           "type": "array",
///           "minItems": 1,
///           "maxItems": 256,
///           "items": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "resolution",
///               "ratio",
///               "width",
///               "height"
///             ],
///             "properties": {
///               "resolution": {
///                 "type": "string",
///                 "description": "Must be accepted by the configured resolution control."
///               },
///               "ratio": {
///                 "type": "string",
///                 "description": "Must be accepted by the configured ratio control; each resolution/ratio pair is unique."
///               },
///               "width": {
///                 "type": "integer",
///                 "minimum": 1,
///                 "maximum": 4294967295
///               },
///               "height": {
///                 "type": "integer",
///                 "minimum": 1,
///                 "maximum": 4294967295
///               }
///             }
///           }
///         }
///       }
///     },
///     "VendorModelInput": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "alias",
///         "upstream_model"
///       ],
///       "properties": {
///         "alias": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 200,
///           "pattern": "^[A-Za-z0-9._/-]+$"
///         },
///         "upstream_model": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 200
///         },
///         "enabled": {
///           "type": "boolean",
///           "default": true
///         },
///         "public_catalog": {
///           "type": "boolean",
///           "default": false
///         },
///         "capabilities": {
///           "$ref": "#/components/schemas/VendorCapabilities"
///         },
///         "pricing": {
///           "$ref": "#/components/schemas/VendorRoutePricing",
///           "description": "Optional validated route pricing. Personal-owned credentials require null pricing; non-null pricing is rejected at save. Null clears pricing; omission preserves existing pricing on updates and leaves cost unknown on creates."
///         },
///         "expected_revision": {
///           "type": [
///             "integer",
///             "null"
///           ],
///           "minimum": 1
///         }
///       }
///     },
///     "VendorRoutePricing": {
///       "type": [
///         "object",
///         "null"
///       ],
///       "additionalProperties": false,
///       "required": [
///         "currency",
///         "api_prompt_rate",
///         "api_completion_rate",
///         "cash_prompt_rate",
///         "cash_completion_rate",
///         "max_input_tokens",
///         "max_output_tokens"
///       ],
///       "properties": {
///         "currency": {
///           "type": "string",
///           "pattern": "^[A-Z]{3}$"
///         },
///         "api_prompt_rate": {
///           "type": "integer",
///           "format": "int64",
///           "minimum": 0,
///           "description": "Currency nanounits per million tokens. JSON integer, not a decimal string. Platform procurement metadata only."
///         },
///         "api_completion_rate": {
///           "type": "integer",
///           "format": "int64",
///           "minimum": 0,
///           "description": "Currency nanounits per million tokens. JSON integer, not a decimal string. Platform procurement metadata only."
///         },
///         "cash_prompt_rate": {
///           "type": "integer",
///           "format": "int64",
///           "minimum": 0,
///           "description": "Currency nanounits per million tokens. JSON integer, not a decimal string. Platform procurement metadata only."
///         },
///         "cash_completion_rate": {
///           "type": "integer",
///           "format": "int64",
///           "minimum": 0,
///           "description": "Currency nanounits per million tokens. JSON integer, not a decimal string. Platform procurement metadata only."
///         },
///         "max_input_tokens": {
///           "type": "integer",
///           "format": "int64",
///           "minimum": 1,
///           "description": "Operator-attested provider token bound used for pre-dispatch liability admission; not an estimated token count."
///         },
///         "max_output_tokens": {
///           "type": "integer",
///           "format": "int64",
///           "minimum": 1,
///           "description": "Operator-attested provider token bound used for pre-dispatch liability admission; not an estimated token count."
///         }
///       },
///       "description": "Confidential route procurement configuration, separate from customer selling tariffs. All fields are required when non-null. Combined charges at the configured bounds must fit a signed 64-bit nanounit amount; invalid or overflowing configurations are rejected. Personal-owned credentials require null pricing."
///     }
///   }
/// }
/// ```
pub async fn list_models(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    state
        .store
        .vendor(id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(
        json!({"data":state.store.vendor_models_with_availability(id).await.map_err(ApiError::from_store)?}),
    ))
}

/// Read the provider's model catalog using its encrypted server-side
/// credential. Only a small allowlist of model metadata reaches the dashboard.
/// ```openapi
/// {
///   "path": "/api/v1/vendors/{id}/catalog",
///   "method": "get",
///   "operation": {
///     "operationId": "listProviderModelCatalog",
///     "summary": "Discover upstream models for a Provider API-key configuration",
///     "description": "Makes a bounded GET to the configured provider /models endpoint using the encrypted server-side credential. Anthropic uses x-api-key and anthropic-version 2023-06-01; Gemini uses x-goog-api-key and normalizes native model resource names. Both request at most 1000 models and reject an incomplete catalog rather than returning a truncated inventory. No inference request is sent. Redirects are blocked, the response body is capped at 2 MiB, and only allowlisted model IDs and catalog metadata (display name, description, context and output limits, modalities, and advertised USD token prices) are returned. Provider credentials and raw response data are never returned. Requires installation administration or an explicitly granted platform administrator. Explicit OpenRouter integrations first verify the saved credential with /key (64 KiB response bound, no identity or budget fields returned), then use /models/user?output_modalities=all; other integrations use /models. Discovery reports the effective integration and inventory scope. Catalog-read success does not verify inference, management authority, or prices. No fallback from denied credential-filtered discovery to public inventory is performed.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Provider model metadata wrapped in data.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data",
///                 "discovery"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "maxItems": 2000,
///                   "items": {
///                     "$ref": "#/components/schemas/ProviderCatalogModel"
///                   }
///                 },
///                 "discovery": {
///                   "type": "object",
///                   "required": [
///                     "integration",
///                     "inventory_scope",
///                     "credential_access",
///                     "inference_verified",
///                     "management_access",
///                     "prices"
///                   ],
///                   "properties": {
///                     "integration": {
///                       "type": "object",
///                       "description": "Effective integration identity, saved selection, source and revision."
///                     },
///                     "inventory_scope": {
///                       "type": "string",
///                       "enum": [
///                         "credential_filtered",
///                         "instance_reported"
///                       ]
///                     },
///                     "credential_access": {
///                       "type": "string",
///                       "const": "catalog_read_succeeded"
///                     },
///                     "inference_verified": {
///                       "type": "boolean",
///                       "const": false
///                     },
///                     "management_access": {
///                       "type": "string",
///                       "const": "not_checked"
///                     },
///                     "prices": {
///                       "type": "string",
///                       "const": "advertised_only"
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "403": {
///         "description": "Platform administration permission required."
///       },
///       "404": {
///         "description": "Vendor does not exist."
///       },
///       "502": {
///         "description": "Provider rejected the credential or returned an invalid catalog or request error."
///       },
///       "401": {
///         "description": "Invalid or expired administrative credential."
///       }
///     },
///     "parameters": [
///       {
///         "name": "id",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       }
///     ],
///     "x-niu-implementation": "implemented"
///   },
///   "schemas": {
///     "ProviderCatalogModel": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "id",
///         "name",
///         "context_length",
///         "catalog"
///       ],
///       "properties": {
///         "catalog": {
///           "$ref": "#/components/schemas/CatalogMetadata"
///         },
///         "id": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 200,
///           "description": "Provider model ID used for inference routing."
///         },
///         "name": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 300,
///           "description": "Display name supplied by the provider."
///         },
///         "context_length": {
///           "type": [
///             "integer",
///             "null"
///           ],
///           "minimum": 1
///         }
///       }
///     }
///   }
/// }
/// ```
pub async fn catalog(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let (_, result) = read_catalog(&state, id, &headers).await?;
    Ok(Json(result))
}

// Carry the configuration version privately so refresh cannot apply an old
// upstream response after a concurrent endpoint or credential edit.
async fn read_catalog(
    state: &AppState,
    id: Uuid,
    headers: &HeaderMap,
) -> Result<(i64, Value), ApiError> {
    installation(state, headers).await?;
    let vendor = state
        .store
        .vendor(id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    let integration = state
        .store
        .vendor_integration(id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    let ciphertext = state
        .store
        .vendor_credential_ciphertext(id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::unavailable)?;
    let api_key = state
        .vendor_cipher
        .as_ref()
        .ok_or_else(ApiError::unavailable)?
        .open(id, &ciphertext)
        .map_err(|_| ApiError::unavailable())?;
    // Explicit integration identity determines discovery, not the adapter or
    // hostname. A filtered listing does not establish successful inference.
    let credential_filtered = integration.effective_type == "openrouter";
    let catalog_path = if credential_filtered {
        "models/user"
    } else {
        "models"
    };
    let endpoint = format!("{}/{catalog_path}", vendor.api_base.trim_end_matches('/'));
    let timeout = Duration::from_secs(state.config.server.request_timeout_seconds.clamp(1, 5));
    let client = match crate::upstream::configured_client_for_endpoint(state, &endpoint, timeout)
        .await
    {
        Ok(client) => client,
        Err(crate::upstream::EndpointError::PrivateAddress) => {
            return Err(ApiError::upstream_message(
                "The provider endpoint resolves to a private or reserved address and was blocked. If this machine uses fake-IP DNS (198.18.0.0/15, common with Clash, Surge or Mihomo), configure real DNS resolution for the provider hostname or disable fake-IP for it.",
            ));
        }
        Err(crate::upstream::EndpointError::InvalidUrl) => {
            return Err(ApiError::upstream_message(
                "The provider endpoint URL is invalid.",
            ));
        }
        Err(crate::upstream::EndpointError::ResolutionFailed)
        | Err(crate::upstream::EndpointError::ClientConfiguration)
        | Err(crate::upstream::EndpointError::InvalidTimeout) => {
            return Err(ApiError::upstream_message(
                "The provider model catalog could not be reached.",
            ));
        }
    };
    if credential_filtered {
        // OpenRouter can return public inventory for an invalid bearer on
        // /models/user. Verify current-key identity without management APIs.
        let key_endpoint = format!("{}/key", vendor.api_base.trim_end_matches('/'));
        let mut identity = client.get(&key_endpoint).bearer_auth(&api_key)
            .header(reqwest::header::ACCEPT, "application/json").send().await
            .map_err(|_| ApiError::upstream_message("The provider credential could not be verified. Retry or use manual model setup."))?;
        if matches!(
            identity.status(),
            reqwest::StatusCode::UNAUTHORIZED | reqwest::StatusCode::FORBIDDEN
        ) {
            return Err(ApiError::upstream_message(
                "The provider rejected the saved API key. Check the key and provider account access.",
            ));
        }
        if !identity.status().is_success() {
            return Err(ApiError::upstream_message(
                "The provider current-key endpoint could not verify this credential. Retry or use manual model setup.",
            ));
        }
        let mut identity_body = Vec::new();
        while let Some(chunk) = identity.chunk().await.map_err(|_| {
            ApiError::upstream_message("The provider credential response could not be read.")
        })? {
            if identity_body.len().saturating_add(chunk.len()) > 65_536 {
                return Err(ApiError::upstream_message(
                    "The provider credential response exceeds the safety limit.",
                ));
            }
            identity_body.extend_from_slice(&chunk);
        }
        let identity: Value = serde_json::from_slice(&identity_body).map_err(|_| {
            ApiError::upstream_message("The provider returned an invalid credential response.")
        })?;
        if identity["data"]["label"].as_str().is_none()
            || identity["data"]["is_free_tier"].as_bool().is_none()
        {
            return Err(ApiError::upstream_message(
                "The provider did not return a recognized current-key identity. Use manual model setup for unsupported deployments.",
            ));
        }
        // Identity may include confidential usage/budget fields. Never return it.
    }
    let catalog_adapter = if credential_filtered {
        "openrouter"
    } else {
        vendor.adapter.as_str()
    };
    let request = model_catalog_request(&client, &endpoint, catalog_adapter, &api_key);
    let request = if credential_filtered {
        request.query(&[("output_modalities", "all")])
    } else {
        request
    };
    let mut response = request.send().await.map_err(|_| {
        ApiError::upstream_message("The provider model catalog could not be reached.")
    })?;
    let status = response.status();
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        if status == reqwest::StatusCode::FORBIDDEN
            && vendor.api_base.trim_end_matches('/') == "https://api.qnaigc.com/v1"
        {
            let body = crate::provider_rejections::bounded_body(response).await;
            if crate::provider_rejections::qiniu_chat_banned(Some(&vendor.api_base), status, &body)
            {
                return Err(ApiError::upstream_message(
                    crate::provider_rejections::QINIU_CHAT_BANNED,
                ));
            }
        }
        return Err(ApiError::upstream_message(
            "The provider rejected the saved API key. Check the key and provider account access.",
        ));
    }
    if status.is_redirection() {
        return Err(ApiError::upstream_message(
            "The provider redirected the catalog request; Niu stopped it for safety.",
        ));
    }
    if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Err(ApiError::upstream_message(
            "The provider rate limited model discovery. Try again shortly.",
        ));
    }
    if !status.is_success() {
        return Err(ApiError::upstream_message(
            "The provider returned an error while listing models.",
        ));
    }

    let mut body = Vec::new();
    loop {
        match response.chunk().await {
            Ok(Some(chunk)) => {
                if body.len().saturating_add(chunk.len()) > MAX_MODEL_CATALOG_BYTES {
                    return Err(ApiError::upstream_message(
                        "The provider model catalog exceeds Niu's 2 MiB safety limit.",
                    ));
                }
                body.extend_from_slice(&chunk);
            }
            Ok(None) => break,
            Err(_) => {
                return Err(ApiError::upstream_message(
                    "The provider model catalog could not be read.",
                ));
            }
        }
    }
    let catalog: Value = serde_json::from_slice(&body).map_err(|_| {
        ApiError::upstream_message("The provider returned an invalid model catalog.")
    })?;
    if !catalog_complete(&catalog, catalog_adapter) {
        return Err(ApiError::upstream_message(
            "The provider catalog is incomplete or invalid; Niu cannot report it as a complete inventory.",
        ));
    }
    let models = catalog_models(&catalog, catalog_adapter).ok_or_else(|| {
        ApiError::upstream_message("The provider returned an invalid model catalog.")
    })?;
    let pricing = crate::providers::adapters::find(&integration.effective_type).map(|adapter| {
        if integration.effective_type == "openrouter" {
            let mut pricing = adapter.pricing(&catalog);
            pricing.observed_at_ms = crate::providers::adapters::now_ms();
            pricing
        } else {
            adapter.pricing(&serde_json::Value::Null)
        }
    });
    let qiniu_metadata = if integration.effective_type == "qiniu"
        && vendor.api_base.trim_end_matches('/') == "https://api.qnaigc.com/v1"
    {
        qiniu_public_metadata(state, timeout).await
    } else {
        None
    };
    let data = models
        .iter()
        .filter_map(|model| {
            let id = model.get("id")?.as_str()?;
            if id.is_empty() || id.len() > 200 {
                return None;
            }
            let mut metadata =
                crate::providers::adapters::metadata(&integration.effective_type, model);
            if let Some(extra) = qiniu_metadata.as_ref().and_then(|items| items.get(id)) {
                if metadata.name.is_none() {
                    metadata.name = extra.name.clone();
                }
                if metadata.description.is_none() {
                    metadata.description = extra.description.clone();
                }
                if metadata.context_length.is_none() {
                    metadata.context_length = extra.context_length;
                }
                if metadata.max_completion_tokens.is_none() {
                    metadata.max_completion_tokens = extra.max_completion_tokens;
                }
                if metadata.input_modalities.is_empty() {
                    metadata.input_modalities = extra.input_modalities.clone();
                }
                if metadata.output_modalities.is_empty() {
                    metadata.output_modalities = extra.output_modalities.clone();
                }
                if metadata.supported_parameters.is_empty() {
                    metadata.supported_parameters = extra.supported_parameters.clone();
                }
            }
            let name = model
                .get("name")
                .or_else(|| model.get("display_name"))
                .and_then(Value::as_str)
                .filter(|name| !name.is_empty() && name.len() <= 300)
                .or(metadata.name.as_deref())
                .unwrap_or(id);
            Some(json!({
                "id": id,
                "name": name,
                "context_length": model.get("context_length").and_then(Value::as_u64),
                "catalog": metadata,
            }))
        })
        .collect::<Vec<_>>();
    Ok((
        vendor.revision,
        json!({
            "data": data,
            "pricing": pricing,
            "discovery": {
                "integration": integration,
                "inventory_scope": if credential_filtered { "credential_filtered" } else { "instance_reported" },
                "credential_access": "catalog_read_succeeded",
                "inference_verified": false,
                "management_access": "not_checked",
                "prices": "advertised_only",
            }
        }),
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CheckModelInput {
    alias: String,
}

/// Check provider reachability and whether the configured upstream model is
/// listed. This is a bounded catalog read, not a billable inference request.
/// ```openapi
/// {
///   "path": "/api/v1/vendors/{id}/check",
///   "method": "post",
///   "operation": {
///     "operationId": "checkVendorModel",
///     "summary": "Check provider reachability and whether a mapped model is listed",
///     "description": "Performs a bounded GET to the provider's /models endpoint. Anthropic and Gemini use native authentication headers and a 1000-model page; absence from an incomplete page remains unknown. It does not send an inference request. Redirects are blocked, response bodies are capped at 2 MiB, and provider response content and credentials are never returned. A listed model does not prove inference entitlement or quota. Requires installation administration or an explicitly granted platform administrator.",
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
///             "required": [
///               "alias"
///             ],
///             "properties": {
///               "alias": {
///                 "type": "string",
///                 "minLength": 1,
///                 "maxLength": 200
///               }
///             }
///           }
///         }
///       }
///     },
///     "responses": {
///       "200": {
///         "description": "Sanitized provider check result wrapped in data.",
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
///                     "status",
///                     "model",
///                     "http_status",
///                     "duration_ms",
///                     "checked_at_ms"
///                   ],
///                   "properties": {
///                     "status": {
///                       "type": "string",
///                       "enum": [
///                         "connected",
///                         "credentials_rejected",
///                         "account_chat_banned",
///                         "endpoint_unavailable",
///                         "private_endpoint_blocked",
///                         "invalid_endpoint",
///                         "redirect_blocked",
///                         "provider_rate_limited",
///                         "provider_error",
///                         "model_catalog_unavailable",
///                         "model_catalog_too_large",
///                         "invalid_model_catalog"
///                       ]
///                     },
///                     "model": {
///                       "type": "string",
///                       "enum": [
///                         "listed",
///                         "not_listed",
///                         "unknown"
///                       ]
///                     },
///                     "http_status": {
///                       "type": [
///                         "integer",
///                         "null"
///                       ]
///                     },
///                     "duration_ms": {
///                       "type": "integer",
///                       "minimum": 0
///                     },
///                     "checked_at_ms": {
///                       "type": "integer",
///                       "minimum": 0
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid model alias."
///       },
///       "403": {
///         "description": "Platform administration permission required."
///       },
///       "404": {
///         "description": "Model alias is not mapped to this vendor."
///       },
///       "503": {
///         "description": "Credential decryption or storage unavailable."
///       },
///       "401": {
///         "description": "Invalid or expired administrative credential."
///       }
///     },
///     "parameters": [
///       {
///         "name": "id",
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
pub async fn check_model(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
    Json(input): Json<CheckModelInput>,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    if input.alias.trim().is_empty() || input.alias.len() > 200 {
        return Err(ApiError::invalid_request("Invalid model alias"));
    }
    let route = state
        .store
        .vendor_route(&input.alias)
        .await
        .map_err(ApiError::from_store)?
        .filter(|route| route.vendor.id == id)
        .ok_or_else(ApiError::not_found)?;
    let api_key = state
        .vendor_cipher
        .as_ref()
        .ok_or_else(ApiError::unavailable)?
        .open(id, &route.credential_ciphertext)
        .map_err(|_| ApiError::unavailable())?;
    let endpoint = format!("{}/models", route.vendor.api_base.trim_end_matches('/'));
    let timeout = Duration::from_secs(state.config.server.request_timeout_seconds.clamp(1, 5));
    let started = Instant::now();

    let client =
        match crate::upstream::configured_client_for_endpoint(&state, &endpoint, timeout).await {
            Ok(client) => client,
            Err(crate::upstream::EndpointError::PrivateAddress) => {
                return Ok(check_response(
                    "private_endpoint_blocked",
                    "unknown",
                    None,
                    started,
                ));
            }
            Err(crate::upstream::EndpointError::InvalidUrl) => {
                return Ok(check_response("invalid_endpoint", "unknown", None, started));
            }
            Err(crate::upstream::EndpointError::ResolutionFailed)
            | Err(crate::upstream::EndpointError::ClientConfiguration)
            | Err(crate::upstream::EndpointError::InvalidTimeout) => {
                return Ok(check_response(
                    "endpoint_unavailable",
                    "unknown",
                    None,
                    started,
                ));
            }
        };
    let mut response =
        match model_catalog_request(&client, &endpoint, &route.vendor.adapter, &api_key)
            .send()
            .await
        {
            Ok(response) => response,
            Err(_) => {
                return Ok(check_response(
                    "endpoint_unavailable",
                    "unknown",
                    None,
                    started,
                ));
            }
        };
    let status = response.status();
    let status_code = status.as_u16();
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        if status == reqwest::StatusCode::FORBIDDEN
            && route.vendor.api_base.trim_end_matches('/') == "https://api.qnaigc.com/v1"
        {
            let body = crate::provider_rejections::bounded_body(response).await;
            if crate::provider_rejections::qiniu_chat_banned(
                Some(&route.vendor.api_base),
                status,
                &body,
            ) {
                return Ok(check_response(
                    "account_chat_banned",
                    "unknown",
                    Some(status_code),
                    started,
                ));
            }
        }
        return Ok(check_response(
            "credentials_rejected",
            "unknown",
            Some(status_code),
            started,
        ));
    }
    if status.is_redirection() {
        return Ok(check_response(
            "redirect_blocked",
            "unknown",
            Some(status_code),
            started,
        ));
    }
    if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Ok(check_response(
            "provider_rate_limited",
            "unknown",
            Some(status_code),
            started,
        ));
    }
    if !status.is_success() {
        let result = if status == reqwest::StatusCode::NOT_FOUND
            || status == reqwest::StatusCode::METHOD_NOT_ALLOWED
        {
            "model_catalog_unavailable"
        } else {
            "provider_error"
        };
        return Ok(check_response(
            result,
            "unknown",
            Some(status_code),
            started,
        ));
    }

    let mut body = Vec::new();
    loop {
        match response.chunk().await {
            Ok(Some(chunk)) => {
                if body.len().saturating_add(chunk.len()) > MAX_MODEL_CATALOG_BYTES {
                    return Ok(check_response(
                        "model_catalog_too_large",
                        "unknown",
                        Some(status_code),
                        started,
                    ));
                }
                body.extend_from_slice(&chunk);
            }
            Ok(None) => break,
            Err(_) => {
                return Ok(check_response(
                    "provider_error",
                    "unknown",
                    Some(status_code),
                    started,
                ));
            }
        }
    }
    let Ok(catalog) = serde_json::from_slice::<Value>(&body) else {
        return Ok(check_response(
            "invalid_model_catalog",
            "unknown",
            Some(status_code),
            started,
        ));
    };
    let Some(models) = catalog_models(&catalog, &route.vendor.adapter) else {
        return Ok(check_response(
            "invalid_model_catalog",
            "unknown",
            Some(status_code),
            started,
        ));
    };
    let listed = models.iter().any(|model| {
        model.get("id").and_then(Value::as_str) == Some(route.model.upstream_model.as_str())
    });
    Ok(check_response(
        "connected",
        if listed {
            "listed"
        } else if !catalog_complete(&catalog, &route.vendor.adapter) {
            "unknown"
        } else {
            "not_listed"
        },
        Some(status_code),
        started,
    ))
}

fn check_response(
    status: &str,
    model: &str,
    http_status: Option<u16>,
    started: Instant,
) -> Json<Value> {
    let checked_at_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(u64::MAX as u128) as u64;
    Json(json!({
        "data": {
            "status": status,
            "model": model,
            "http_status": http_status,
            "duration_ms": started.elapsed().as_millis().min(u64::MAX as u128) as u64,
            "checked_at_ms": checked_at_ms
        }
    }))
}

/// ```openapi
/// {
///   "path": "/api/v1/vendors/{id}/models",
///   "method": "post",
///   "operation": {
///     "operationId": "upsertVendorModel",
///     "summary": "Create or update a model mapping with optimistic revision checks",
///     "description": "Omit expected_revision to create; provide the current revision to update. Aliases cannot be reassigned to another vendor. Disabled mappings still override static file aliases. Requires installation administration or an explicitly granted platform administrator. These platform-only route prices are procurement configuration, not customer selling tariffs. Omit pricing to preserve it on update; explicit null clears it. Changes do not rewrite previously pinned request prices.",
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
///             "$ref": "#/components/schemas/VendorModelInput"
///           }
///         }
///       }
///     },
///     "responses": {
///       "200": {
///         "description": "Persisted model mapping wrapped in data.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "$ref": "#/components/schemas/VendorModel"
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid alias, capabilities or pricing."
///       },
///       "403": {
///         "description": "Platform administration permission required."
///       },
///       "404": {
///         "description": "Vendor does not exist."
///       },
///       "409": {
///         "description": "Stale revision, existing alias or different vendor ownership."
///       },
///       "401": {
///         "description": "Invalid or expired administrative credential."
///       }
///     },
///     "parameters": [
///       {
///         "name": "id",
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
pub async fn upsert_model(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
    Json(mut input): Json<ModelInput>,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    let vendor = state
        .store
        .vendor(id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    if input.expected_revision.is_some() && input.pricing.is_none() {
        let previous = state
            .store
            .vendor_route(&input.alias)
            .await
            .map_err(ApiError::from_store)?;
        if let Some(previous) = previous {
            if previous.vendor.id != id {
                return Err(ApiError::from_store(niu_storage::StoreError::Conflict));
            }
            input.pricing = Some(previous.model.pricing);
        }
    }
    validate_model(
        &input.alias,
        make_model(
            &vendor.adapter,
            &vendor.api_base,
            &input.upstream_model,
            input.capabilities.clone(),
            input.pricing.clone().flatten(),
        )?,
    )?;
    let model = state
        .store
        .upsert_vendor_model(id, input.storage())
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":model})))
}

/// Explicit metadata refresh; discovery GET stays read-only.
/// ```openapi
/// {
///   "path": "/api/v1/vendors/{id}/catalog",
///   "method": "post",
///   "operation": {
///     "operationId": "refreshProviderCatalogMetadata",
///     "summary": "Refresh descriptive metadata for existing vendor model mappings",
///     "description": "Fetches the bounded provider catalog and updates matching upstream IDs only. Preserves aliases, routing, capability declarations and billing prices. Increments revisions when metadata changes. Missing provider models are retained. Requires installation administration or an explicitly granted platform administrator.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Number of updated mappings.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "properties": {
///                 "updated": {
///                   "type": "integer",
///                   "minimum": 0
///                 }
///               },
///               "required": [
///                 "updated"
///               ]
///             }
///           }
///         }
///       },
///       "403": {
///         "description": "Platform administration permission required."
///       },
///       "404": {
///         "description": "Vendor does not exist."
///       },
///       "409": {
///         "description": "Configuration changed during catalog retrieval; no metadata was updated. Retry against the current configuration."
///       },
///       "502": {
///         "description": "Provider catalog unavailable or invalid."
///       },
///       "401": {
///         "description": "Invalid or expired administrative credential."
///       }
///     },
///     "parameters": [
///       {
///         "name": "id",
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
pub async fn refresh_catalog(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let (revision, result) = read_catalog(&state, id, &headers).await?;
    let entries = result["data"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|entry| Some((entry["id"].as_str()?.to_owned(), entry["catalog"].clone())))
        .collect();
    let updated = state
        .store
        .refresh_vendor_catalog(id, revision, entries)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"updated": updated})))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SupplierAssociation {
    supplier_id: Uuid,
    expected_revision: i64,
}

/// ```openapi
/// {
///   "path": "/api/v1/vendors/{id}/supplier",
///   "method": "get",
///   "operation": {
///     "operationId": "getConfigurationProvider",
///     "summary": "Read the Provider owning an API configuration",
///     "description": "Installation credential or explicitly granted platform administrator required. Provider membership and customer ownership alone do not grant access. Returns the Provider identity and name, or null when no association exists, including an unknown configuration. Never returns credentials or procurement values.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "id",
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
///         "description": "Provider association or null.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "oneOf": [
///                     {
///                       "type": "null"
///                     },
///                     {
///                       "type": "object",
///                       "required": [
///                         "id",
///                         "name"
///                       ],
///                       "properties": {
///                         "id": {
///                           "type": "string",
///                           "format": "uuid"
///                         },
///                         "name": {
///                           "type": "string"
///                         }
///                       }
///                     }
///                   ]
///                 }
///               }
///             }
///           }
///         }
///       },
///       "401": {
///         "description": "Invalid or missing administrative credential."
///       },
///       "403": {
///         "description": "Installation administration required."
///       },
///       "503": {
///         "description": "Storage unavailable."
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub async fn supplier(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    let data = state
        .store
        .vendor_supplier(id)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":data})))
}

/// ```openapi
/// {
///   "path": "/api/v1/vendors/{id}/supplier",
///   "method": "put",
///   "operation": {
///     "operationId": "associateConfigurationProvider",
///     "summary": "Associate an API configuration with a Provider",
///     "description": "Installation credential or explicitly granted platform administrator required. Provider membership and customer ownership alone do not grant access. Atomic and audited. The first association requires the current configuration revision. Repeating the same Provider association is idempotent even with the original revision and does not increment it again. A different Provider cannot take over an existing association. Deleted Providers cannot receive configurations. Association and deletion serialize: once ownership commits, deletion returns 409. Does not activate, qualify or price an offer.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "id",
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
///               "supplier_id",
///               "expected_revision"
///             ],
///             "properties": {
///               "supplier_id": {
///                 "type": "string",
///                 "format": "uuid"
///               },
///               "expected_revision": {
///                 "type": "integer",
///                 "format": "int64",
///                 "description": "Current configuration revision for a first association; ignored on an identical existing association."
///               }
///             }
///           }
///         }
///       }
///     },
///     "responses": {
///       "204": {
///         "description": "Association established or already present; no response body."
///       },
///       "409": {
///         "description": "Unknown or deleted Provider, unknown configuration, stale first-association revision, conflicting offer ownership or attempted reassignment."
///       },
///       "422": {
///         "description": "Malformed request fields or unknown properties."
///       },
///       "401": {
///         "description": "Invalid or missing administrative credential."
///       },
///       "403": {
///         "description": "Installation administration required."
///       },
///       "503": {
///         "description": "Storage unavailable."
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub async fn associate_supplier(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
    Json(input): Json<SupplierAssociation>,
) -> Result<StatusCode, ApiError> {
    installation(&state, &headers).await?;
    state
        .store
        .associate_vendor_supplier(id, input.supplier_id, input.expected_revision)
        .await
        .map_err(ApiError::from_store)?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AssetManagementInput {
    expected_revision: i64,
    upstream_project: String,
    access_key: String,
    secret_key: String,
}

pub async fn asset_management_configuration(
    State(state): State<AppState>,
    Path(vendor): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    state
        .store
        .vendor(vendor)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    let configured = state
        .store
        .asset_management_configuration(vendor)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(
        json!({"data":configured.map(|(revision,upstream_project,configured)| json!({"revision":revision,"upstream_project":upstream_project,"configured":configured,"dispatch_available":false}))}),
    ))
}

pub async fn configure_asset_management(
    State(state): State<AppState>,
    Path(vendor): Path<Uuid>,
    headers: HeaderMap,
    input: Result<Json<AssetManagementInput>, axum::extract::rejection::JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    let Json(input) = input.map_err(|error| {
        if error.status() == StatusCode::PAYLOAD_TOO_LARGE {
            ApiError::request_too_large()
        } else {
            ApiError::invalid_request("Invalid asset management configuration")
        }
    })?;
    let revision = input
        .expected_revision
        .checked_add(1)
        .filter(|revision| *revision > 0)
        .ok_or_else(|| ApiError::invalid_request("Invalid asset management revision"))?;
    let configuration = state
        .store
        .vendor(vendor)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    let origin = url::Url::parse(&configuration.api_base)
        .map_err(|_| ApiError::invalid_request("A direct Ark account is required"))?;
    if !niu_media::providers::volcengine::is_direct_ark_https_origin(&origin) {
        return Err(ApiError::invalid_request(
            "A direct Ark account is required",
        ));
    }
    let cipher = state
        .vendor_cipher
        .as_ref()
        .ok_or_else(|| ApiError::invalid_request("Credential encryption is unavailable"))?;
    let encrypted = cipher
        .seal_asset_management(
            vendor,
            revision,
            &input.upstream_project,
            &input.access_key,
            &input.secret_key,
        )
        .map_err(|_| {
            ApiError::invalid_request("Invalid asset management credentials or binding")
        })?;
    let revision = state
        .store
        .save_asset_management_credential_bound(
            vendor,
            configuration.revision,
            input.expected_revision,
            &input.upstream_project,
            &encrypted,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(
        json!({"data":{"revision":revision,"upstream_project":input.upstream_project,"configured":true,"dispatch_available":false}}),
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RevokeAssetManagementInput {
    expected_revision: i64,
    #[serde(default)]
    erase_history: bool,
    #[serde(default)]
    confirm_erase: bool,
}

pub async fn revoke_asset_management(
    State(state): State<AppState>,
    Path(vendor): Path<Uuid>,
    headers: HeaderMap,
    input: Result<Json<RevokeAssetManagementInput>, axum::extract::rejection::JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    let Json(input) = input.map_err(|error| {
        if error.status() == StatusCode::PAYLOAD_TOO_LARGE {
            ApiError::request_too_large()
        } else {
            ApiError::invalid_request("Invalid asset management revocation")
        }
    })?;
    if input.erase_history && !input.confirm_erase {
        return Err(ApiError::invalid_request(
            "Explicit confirmation is required to erase stored asset credentials",
        ));
    }
    let erased = state
        .store
        .revoke_asset_management_credentials(vendor, input.expected_revision, input.erase_history)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(
        json!({"data":{"revision":input.expected_revision,"configured":false,"dispatch_available":false,"erased_revisions":erased}}),
    ))
}

/// Explicit discovery and atomic import for an already saved Provider connection.
/// ```openapi
/// {"path":"/api/v1/vendors/{id}/import","method":"post","operation":{"operationId":"importPersonalProviderModels","security":[{"bearerAuth":[]}],"summary":"Discover and import Provider models","description":"Platform administration required. Reads the bounded upstream catalog, then atomically creates missing model mappings. Owner-funded mappings are enabled; shared commercial mappings start disabled and unpriced. Existing mappings, disabled choices, prices and grants are preserved. No inference or payment is performed. Catalog access is not inference verification or selling eligibility. Credential revision conflicts abort the import; retry is safe and adds only missing upstream IDs.","parameters":[{"name":"id","in":"path","required":true,"schema":{"type":"string","format":"uuid"}}],"responses":{"200":{"description":"Import counts and discovery evidence."},"400":{"description":"Unsupported catalog identifiers."},"409":{"description":"Connection changed or an alias conflicts; no models imported."},"502":{"description":"Upstream catalog read failed; saved connection is retained."}},"x-niu-implementation":"implemented"}}
/// ```
pub async fn import_models(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    let vendor = state
        .store
        .vendor(id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    let (revision, result) = read_catalog(&state, id, &headers).await?;
    let prefix = vendor_alias_prefix(&vendor.name);
    let data = result["data"]
        .as_array()
        .ok_or_else(ApiError::unavailable)?;
    // Discovery order is upstream-defined. Alias planning is sorted so the same
    // catalog yields the same aliases regardless of listing order, and a
    // basename collision is resolved within the batch instead of aborting the
    // whole import with an alias conflict.
    let mut catalogs = std::collections::BTreeMap::new();
    for model in data {
        let upstream = model["id"].as_str().ok_or_else(ApiError::unavailable)?;
        catalogs.entry(upstream).or_insert(&model["catalog"]);
    }
    let upstreams = catalogs.keys().copied().collect::<Vec<_>>();
    let aliases = plan_imported_model_aliases(&prefix, &upstreams);
    let mut entries = Vec::with_capacity(aliases.len());
    for (upstream, alias) in aliases {
        let capabilities =
            imported_model_capabilities(&vendor.adapter, catalogs[upstream.as_str()]);
        validate_model(
            &alias,
            make_model(
                &vendor.adapter,
                &vendor.api_base,
                &upstream,
                capabilities.clone(),
                None,
            )?,
        )?;
        entries.push(niu_storage::VendorModelInput {
            alias,
            upstream_model: upstream,
            public_catalog: false,
            enabled: true,
            capabilities,
            pricing: None,
            expected_revision: None,
        });
    }
    let imported = state
        .store
        .import_discovered_vendor_models(id, revision, entries)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(
        json!({"data":{"imported":imported,"discovered":data.len()},"discovery":result["discovery"]}),
    ))
}

const MAX_MODEL_ALIAS_BYTES: usize = 200;
const MAX_ALIAS_PREFIX_BYTES: usize = 48;

/// Provider names are display labels, not identifiers. Derive a readable,
/// ASCII-safe namespace without depending on the caller's punctuation.
fn vendor_alias_prefix(name: &str) -> String {
    let mut prefix = String::new();
    for character in name.chars() {
        if character.is_ascii_alphanumeric() {
            prefix.push(character.to_ascii_lowercase());
        } else if !prefix.is_empty() && !prefix.ends_with('-') {
            prefix.push('-');
        }
    }
    while prefix.ends_with('-') {
        prefix.pop();
    }
    if prefix.is_empty() {
        prefix.push_str("provider");
    }
    prefix.truncate(MAX_ALIAS_PREFIX_BYTES);
    while prefix.ends_with('-') {
        prefix.pop();
    }
    prefix
}

fn normalize_alias_segment(segment: &str) -> String {
    let mut normalized = String::new();
    for character in segment.chars() {
        if character.is_ascii_alphanumeric() || matches!(character, '.' | '_') {
            normalized.push(character.to_ascii_lowercase());
        } else if !normalized.is_empty() && !normalized.ends_with('-') {
            normalized.push('-');
        }
    }
    while normalized.ends_with('-') {
        normalized.pop();
    }
    normalized
}

/// The upstream path is metadata only; it is never rewritten for dispatch.
/// Slash-separated maker namespaces become alias components so a repeated maker
/// prefix can be recognized instead of copied into the public alias.
fn alias_path(upstream: &str) -> Vec<String> {
    let mut path = upstream
        .split('/')
        .map(normalize_alias_segment)
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>();
    if path.is_empty() {
        path.push(format!("model-{}", short_alias_hash(upstream)));
    }
    path
}

fn short_alias_hash(value: &str) -> String {
    use sha2::{Digest, Sha256};
    Sha256::digest(value.as_bytes())
        .iter()
        .take(4)
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn model_alias_with_suffix(base: &str, suffix: usize, upstream: &str) -> String {
    let numeric = if suffix == 0 {
        String::new()
    } else {
        format!("-{suffix}")
    };
    let candidate = format!("{base}{numeric}");
    if candidate.len() <= MAX_MODEL_ALIAS_BYTES {
        return candidate;
    }
    // Keep collision suffixes and a stable upstream digest when a long ID must
    // be shortened; truncating alone could make distinct models indistinguishable.
    let tail = format!("{numeric}-{}", short_alias_hash(upstream));
    let mut head = base
        .chars()
        .take(MAX_MODEL_ALIAS_BYTES.saturating_sub(tail.len()))
        .collect::<String>();
    while head.ends_with(['-', '.', '_']) {
        head.pop();
    }
    if head.is_empty() {
        head.push_str("model");
    }
    format!("{head}{tail}")
}

/// Plan one alias per unique upstream ID. The preferred alias is
/// `provider/model-basename`; if that basename is shared, a compact full upstream
/// path is used, then a numeric suffix. Sorting by path complexity and upstream
/// ID makes the assignment independent of catalog order.
fn plan_imported_model_aliases(prefix: &str, upstreams: &[&str]) -> Vec<(String, String)> {
    let prefix = vendor_alias_prefix(prefix);
    let mut unique = upstreams.to_vec();
    unique.sort_unstable();
    unique.dedup();
    let mut ordered = unique
        .into_iter()
        .map(|upstream| (alias_path(upstream).len(), upstream))
        .collect::<Vec<_>>();
    ordered.sort_unstable_by(|left, right| left.0.cmp(&right.0).then_with(|| left.1.cmp(right.1)));
    let mut used = std::collections::BTreeSet::new();
    let mut planned = Vec::with_capacity(ordered.len());
    let candidate_count = ordered.len();
    for (_, upstream) in ordered {
        let mut path = alias_path(upstream);
        if path.first().is_some_and(|segment| segment == &prefix) {
            path.remove(0);
        }
        if path.is_empty() {
            path.push("model".to_owned());
        }
        let preferred = format!("{prefix}/{}", path[path.len() - 1]);
        let compact = format!("{prefix}/{}", path.join("-"));
        let mut candidates = vec![preferred];
        if candidates[0] != compact {
            candidates.push(compact);
        }
        let mut chosen = None;
        'candidate: for candidate in candidates {
            for suffix in 0..=candidate_count {
                let alias = model_alias_with_suffix(&candidate, suffix, upstream);
                if used.insert(alias.clone()) {
                    chosen = Some(alias);
                    break 'candidate;
                }
            }
        }
        // The bounded suffix search always finds a free candidate; the fallback
        // only keeps the function panic-free if that invariant ever changes.
        let alias = match chosen {
            Some(alias) => alias,
            None => {
                let mut fallback = format!("{prefix}/model-{}", short_alias_hash(upstream));
                while !used.insert(fallback.clone()) {
                    fallback.push_str("-x");
                }
                fallback
            }
        };
        planned.push((upstream.to_owned(), alias));
    }
    planned
}

/// Imported capabilities use explicit upstream declarations plus the
/// OpenAI-compatible Chat Completions adapter family. Familiar model names are
/// deliberately not used as evidence: a name does not establish the account,
/// endpoint or model version's current support. Missing metadata means unknown,
/// represented by the conservative false default.
fn imported_model_capabilities(adapter: &str, catalog: &Value) -> Value {
    let openai_compatible_chat = matches!(adapter, "openai" | "openrouter");
    let advertised = |parameter: &str| {
        catalog["supported_parameters"]
            .as_array()
            .is_some_and(|parameters| {
                parameters.iter().any(|value| {
                    value
                        .as_str()
                        .is_some_and(|value| value.eq_ignore_ascii_case(parameter))
                })
            })
    };
    let tool_calls = openai_compatible_chat && advertised("tools");
    // Streaming tool deltas are part of the OpenAI-compatible Chat Completions
    // wire contract. The explicit tools declaration gates this adapter-family
    // inference; native Messages/Bedrock routes never receive these Chat flags.
    let streaming_tool_calls = tool_calls;
    // `structured_outputs` is the explicit JSON Schema declaration.
    // `response_format` alone can mean json_object support, so it is not enough.
    let structured_output = openai_compatible_chat && advertised("structured_outputs");
    // `/responses` is a distinct endpoint and is not established by Chat
    // metadata. Only an explicit upstream declaration enables it; none of the
    // current catalog adapters make that declaration.
    let responses = openai_compatible_chat && advertised("responses");
    json!({"catalog":catalog,"supports_tool_calls":tool_calls,"supports_streaming_tool_calls":streaming_tool_calls,"supports_structured_output":structured_output,"supports_embeddings":false,"supports_embedding_dimensions":false,"supports_embedding_base64":false,"supports_responses":responses})
}

#[cfg(test)]
mod import_model_tests {
    use super::*;

    #[test]
    fn imported_capabilities_follow_explicit_openai_chat_evidence() {
        let advertised = json!({"supported_parameters":["tools", "structured_outputs"]});
        for adapter in ["openai", "openrouter"] {
            let supported = imported_model_capabilities(adapter, &advertised);
            assert_eq!(supported["supports_tool_calls"], true);
            assert_eq!(supported["supports_streaming_tool_calls"], true);
            assert_eq!(supported["supports_structured_output"], true);
            assert_eq!(supported["supports_responses"], false);
            assert_eq!(supported["catalog"], advertised);
        }
    }

    #[test]
    fn imported_capabilities_do_not_guess_from_adapter_or_model_name() {
        let named = json!({"name":"gpt-4o", "supported_parameters":[]});
        for adapter in ["openai", "openrouter"] {
            let unknown = imported_model_capabilities(adapter, &named);
            for flag in [
                "supports_tool_calls",
                "supports_streaming_tool_calls",
                "supports_structured_output",
                "supports_responses",
            ] {
                assert_eq!(unknown[flag], false, "{adapter} {flag}");
            }
        }
        // Native adapters cannot carry Chat capability flags through validation.
        let native = imported_model_capabilities(
            "anthropic",
            &json!({"supported_parameters":["tools", "structured_outputs", "responses"]}),
        );
        for flag in [
            "supports_tool_calls",
            "supports_streaming_tool_calls",
            "supports_structured_output",
            "supports_responses",
        ] {
            assert_eq!(native[flag], false, "{flag}");
        }
        // JSON object mode alone does not establish JSON Schema support.
        let object_only = imported_model_capabilities(
            "openai",
            &json!({"supported_parameters":["response_format"]}),
        );
        assert_eq!(object_only["supports_structured_output"], false);
        // A Responses declaration is separate from Chat tools.
        let responses =
            imported_model_capabilities("openai", &json!({"supported_parameters":["responses"]}));
        assert_eq!(responses["supports_responses"], true);
        assert_eq!(responses["supports_tool_calls"], false);
    }

    #[test]
    fn aliases_do_not_repeat_vendor_or_maker_prefixes() {
        for upstream in ["deepseek/deepseek-v3", "qiniu/deepseek-v3", "deepseek-v3"] {
            let planned = plan_imported_model_aliases("qiniu", &[upstream]);
            assert_eq!(
                planned,
                vec![(upstream.to_owned(), "qiniu/deepseek-v3".to_owned())]
            );
        }
        let planned =
            plan_imported_model_aliases("qiniu", &["meituan/longcat-flash-lite", "LongCat-Flash"]);
        assert_eq!(planned[0].1, "qiniu/longcat-flash");
        assert_eq!(planned[1].1, "qiniu/longcat-flash-lite");
    }

    #[test]
    fn alias_planning_resolves_collisions_deterministically() {
        let upstreams = ["openai/gpt-4o", "azure/gpt-4o", "gpt-4o"];
        let forward = plan_imported_model_aliases("openrouter", &upstreams);
        let reverse = plan_imported_model_aliases(
            "openrouter",
            &upstreams.into_iter().rev().collect::<Vec<_>>(),
        );
        assert_eq!(forward, reverse);
        let aliases = forward
            .iter()
            .map(|(_, alias)| alias.as_str())
            .collect::<std::collections::BTreeSet<_>>();
        assert_eq!(aliases.len(), upstreams.len());
        assert!(aliases.contains("openrouter/gpt-4o"));
        assert!(
            aliases
                .iter()
                .all(|alias| alias.starts_with("openrouter/") && alias.len() <= 200)
        );
    }

    #[test]
    fn alias_normalization_is_safe_bounded_and_unique_for_long_ids() {
        let long_a = format!("{}/{}", "a".repeat(10), "b".repeat(189));
        let long_b = format!("{}/{}", "c".repeat(10), "b".repeat(189));
        let planned = plan_imported_model_aliases(
            "My Provider!",
            &["Meta/Llama 3: 8B", long_a.as_str(), long_b.as_str()],
        );
        assert!(
            planned
                .iter()
                .any(|(_, alias)| alias == "my-provider/llama-3-8b"),
            "{planned:?}"
        );
        let aliases = planned
            .iter()
            .map(|(_, alias)| alias.as_str())
            .collect::<std::collections::BTreeSet<_>>();
        assert_eq!(aliases.len(), 3, "{planned:?}");
        for alias in aliases {
            assert!(alias.len() <= MAX_MODEL_ALIAS_BYTES, "{alias}");
            assert!(alias.is_ascii());
            assert!(alias.chars().all(|character| {
                character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-' | '/')
            }));
        }
        let long_aliases = planned
            .iter()
            .filter(|(upstream, _)| upstream == &long_a || upstream == &long_b)
            .map(|(_, alias)| alias)
            .collect::<std::collections::BTreeSet<_>>();
        assert_eq!(long_aliases.len(), 2);
        // Truncation keeps a stable upstream digest instead of collapsing the
        // two long IDs to the same alias.
        for alias in long_aliases {
            assert_eq!(alias.len(), MAX_MODEL_ALIAS_BYTES, "{alias}");
        }
        assert_eq!(
            plan_imported_model_aliases("!!!", &["/"]),
            vec![(
                "/".to_owned(),
                format!("provider/model-{}", short_alias_hash("/"))
            )]
        );
    }
}
