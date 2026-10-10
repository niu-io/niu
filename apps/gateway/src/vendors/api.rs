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
const MAX_DISCOVERED_MODELS: usize = 2_000;

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
///   "path": "/admin/v1/vendors",
///   "method": "get",
///   "operation": {
///     "operationId": "listVendors",
///     "parameters": [
///       {
///         "name": "supplier",
///         "in": "query",
///         "required": false,
///         "description": "Filter by explicit Supplier business ownership; no name matching or unassociated fallback. Platform administration is required. A missing or deleted Supplier returns 404; an active Supplier without configurations returns an empty data array.",
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       }
///     ],
///     "summary": "List Supplier API-key configurations without credentials",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "responses": {
///       "404": { "description": "Selected Supplier does not exist or has been deleted." },
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
///     "description": "Returns every matching configuration, including disabled configurations, in one data array. Optional supplier filtering uses explicit business ownership. No pagination or silent row cap; response memory grows with list size. Requires installation administration or an explicitly granted platform administrator. Each configuration has independent credentials and model bindings. Credentials are write-only and never returned."
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
///             "openai"
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
///           "description": "Configuration-list metadata identifying a private credential owned by one account. Not accepted in configuration writes."
///         },
///         "supplier": {
///           "type": [
///             "object",
///             "null"
///           ],
///           "description": "Supplier ownership on configuration-list reads; credentials and commercial data are excluded.",
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
///             "openai"
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
///           "description": "Existing Supplier business to own this API-key configuration. Mutually exclusive with create_supplier=true; ownership and creation commit atomically."
///         },
///         "create_supplier": {
///           "type": "boolean",
///           "default": false,
///           "description": "Atomically create a Supplier business with this name and its explicit configuration ownership link. Omission preserves legacy configuration-only creation."
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
///   "path": "/admin/v1/vendors",
///   "method": "post",
///   "operation": {
///     "operationId": "createVendor",
///     "summary": "Create an encrypted Supplier API-key configuration",
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
    installation(&state, &headers).await?;
    if input.create_supplier && input.supplier_id.is_some() {
        return Err(ApiError::invalid_request(
            "Choose a new or existing Supplier, not both",
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
        .create_vendor_for_supplier(
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
        )
        .await
        .map_err(ApiError::from_store)?;
    let mut vendor = serde_json::to_value(vendor).map_err(|_| ApiError::unavailable())?;
    vendor["owner_funded"] = json!(false);
    Ok((StatusCode::CREATED, Json(json!({"data":vendor}))))
}

/// ```openapi
/// {
///   "path": "/admin/v1/vendors/{id}",
///   "method": "put",
///   "operation": {
///     "operationId": "updateVendor",
///     "summary": "Update one Supplier API-key configuration or rotate its credential",
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
    let mut vendor = serde_json::to_value(vendor).map_err(|_| ApiError::unavailable())?;
    vendor["owner_funded"] = json!(owner_funded);
    Ok(Json(json!({"data":vendor})))
}

/// ```openapi
/// {
///   "path": "/admin/v1/vendors/{id}/models",
///   "method": "get",
///   "operation": {
///     "operationId": "listVendorModels",
///     "summary": "List model bindings for one Supplier API-key configuration",
///     "description": "Management reads include route eligibility in available and an owner_funded flag. Owner-funded routes are private to their recorded account and excluded from shared supply and the public catalog, regardless of their legacy configured public_catalog flag. Available does not establish upstream entitlement, service quality or commercial qualification. Requires installation administration or an explicitly granted platform administrator. These platform-only route prices are procurement configuration, not customer selling tariffs.",
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
///           "description": "Management-list metadata identifying private owner-funded routes. Omitted from configuration writes."
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
///   "path": "/admin/v1/vendors/{id}/catalog",
///   "method": "get",
///   "operation": {
///     "operationId": "listProviderModelCatalog",
///     "summary": "Discover upstream models for a Supplier API-key configuration",
///     "description": "Makes a bounded GET to the configured provider /models endpoint using the encrypted server-side credential. No inference request is sent. Redirects are blocked, the response body is capped at 2 MiB, and only allowlisted model IDs and catalog metadata (display name, description, context and output limits, modalities, and advertised USD token prices) are returned. Provider credentials and raw response data are never returned. Requires installation administration or an explicitly granted platform administrator.",
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
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "maxItems": 2000,
///                   "items": {
///                     "$ref": "#/components/schemas/ProviderCatalogModel"
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
    installation(&state, &headers).await?;
    let vendor = state
        .store
        .vendor(id)
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
    let endpoint = format!("{}/models", vendor.api_base.trim_end_matches('/'));
    let timeout = Duration::from_secs(state.config.server.request_timeout_seconds.clamp(1, 5));
    let client = match crate::upstream::client_for_endpoint(&endpoint, timeout).await {
        Ok(client) => client,
        Err(crate::upstream::EndpointError::PrivateAddress) => {
            return Err(ApiError::upstream_message(
                "The provider endpoint resolves to a private address and was blocked.",
            ));
        }
        Err(crate::upstream::EndpointError::InvalidUrl) => {
            return Err(ApiError::upstream_message(
                "The provider endpoint URL is invalid.",
            ));
        }
        Err(crate::upstream::EndpointError::ResolutionFailed)
        | Err(crate::upstream::EndpointError::ClientConfiguration) => {
            return Err(ApiError::upstream_message(
                "The provider model catalog could not be reached.",
            ));
        }
    };
    let mut response = client
        .get(endpoint)
        .bearer_auth(api_key)
        .header(axum::http::header::ACCEPT, "application/json")
        .send()
        .await
        .map_err(|_| {
            ApiError::upstream_message("The provider model catalog could not be reached.")
        })?;
    let status = response.status();
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
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
    let models = catalog
        .get("data")
        .and_then(Value::as_array)
        .ok_or_else(|| {
            ApiError::upstream_message("The provider returned an invalid model catalog.")
        })?;
    let data = models
        .iter()
        .take(MAX_DISCOVERED_MODELS)
        .filter_map(|model| {
            let id = model.get("id")?.as_str()?;
            if id.is_empty() || id.len() > 200 {
                return None;
            }
            let name = model
                .get("name")
                .and_then(Value::as_str)
                .filter(|name| !name.is_empty() && name.len() <= 300)
                .unwrap_or(id);
            Some(json!({
                "id": id,
                "name": name,
                "context_length": model.get("context_length").and_then(Value::as_u64),
                "catalog": crate::catalog_metadata::CatalogMetadata::from_provider(model),
            }))
        })
        .collect::<Vec<_>>();
    Ok(Json(json!({ "data": data })))
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
///   "path": "/admin/v1/vendors/{id}/check",
///   "method": "post",
///   "operation": {
///     "operationId": "checkVendorModel",
///     "summary": "Check provider reachability and whether a mapped model is listed",
///     "description": "Performs a bounded GET to the provider's /models endpoint. It does not send an inference request. Redirects are blocked, response bodies are capped at 2 MiB, and provider response content and credentials are never returned. A listed model does not prove inference entitlement or quota. Requires installation administration or an explicitly granted platform administrator.",
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

    let client = match crate::upstream::client_for_endpoint(&endpoint, timeout).await {
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
        | Err(crate::upstream::EndpointError::ClientConfiguration) => {
            return Ok(check_response(
                "endpoint_unavailable",
                "unknown",
                None,
                started,
            ));
        }
    };
    let mut response = match client
        .get(endpoint)
        .bearer_auth(api_key)
        .header(axum::http::header::ACCEPT, "application/json")
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
    let Some(models) = catalog.get("data").and_then(Value::as_array) else {
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
        if listed { "listed" } else { "not_listed" },
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
///   "path": "/admin/v1/vendors/{id}/models",
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
///   "path": "/admin/v1/vendors/{id}/catalog",
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
    let Json(result) = catalog(State(state.clone()), Path(id), headers).await?;
    let entries = result["data"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|entry| Some((entry["id"].as_str()?.to_owned(), entry["catalog"].clone())))
        .collect();
    let updated = state
        .store
        .refresh_vendor_catalog(id, entries)
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
    if origin.scheme() != "https"
        || origin.host_str() != Some("ark.cn-beijing.volcengineapi.com")
        || origin.port_or_known_default() != Some(443)
    {
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
