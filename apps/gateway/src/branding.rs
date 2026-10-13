use crate::{
    error::ApiError,
    state::{AdminAuthorization, AppState},
};
use axum::{Json, extract::State, http::HeaderMap};
use niu_storage::{AdminPermission, BrandingSettings};
use serde::Deserialize;
use serde_json::{Value, json};

/// ```openapi
/// {
///   "path": "/v1/branding",
///   "method": "get",
///   "operation": {
///     "operationId": "getPublicBranding",
///     "summary": "Read public branding and theme defaults",
///     "description": "Public safe projection only; no authentication required. Returns display name, normalized logo/favicon PNG data URLs, default appearance and light/dark token maps; excludes actors, credentials and commercial settings. When no saved configuration exists, returns revision string 0 and Niu defaults. Theme fields are part of settings; there is no separate theme endpoint.",
///     "security": [],
///     "x-niu-implementation": "implemented",
///     "responses": {
///       "200": {
///         "description": "Branding revision and settings in data.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/BrandingConfiguration"
///             }
///           }
///         }
///       },
///       "503": {
///         "description": "Durable storage unavailable."
///       }
///     }
///   },
///   "schemas": {
///     "BrandingConfiguration": {
///       "type": "object",
///       "required": [
///         "data"
///       ],
///       "properties": {
///         "data": {
///           "type": "object",
///           "required": [
///             "revision",
///             "settings"
///           ],
///           "properties": {
///             "revision": {
///               "type": "string",
///               "pattern": "^(0|[1-9][0-9]*)$"
///             },
///             "settings": {
///               "$ref": "#/components/schemas/BrandingSettings"
///             }
///           }
///         }
///       }
///     },
///     "BrandingSettings": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "display_name",
///         "default_appearance",
///         "light",
///         "dark"
///       ],
///       "properties": {
///         "display_name": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 80,
///           "description": "Trimmed nonempty text without control characters"
///         },
///         "default_appearance": {
///           "type": "string",
///           "enum": [
///             "system",
///             "light",
///             "dark"
///           ]
///         },
///         "logo_data_url": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "maxLength": 349550,
///           "pattern": "^data:image/png;base64,[A-Za-z0-9+/=]+$",
///           "description": "Static PNG up to 256 KiB, at most 1024 by 512 pixels. Re-encoded from decoded pixels before saving. Missing or null resets to default."
///         },
///         "favicon_data_url": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "maxLength": 43714,
///           "pattern": "^data:image/png;base64,[A-Za-z0-9+/=]+$",
///           "description": "Square static PNG up to 32 KiB, at most 256 by 256 pixels. Missing or null resets to default."
///         },
///         "light": {
///           "$ref": "#/components/schemas/BrandingPalette"
///         },
///         "dark": {
///           "$ref": "#/components/schemas/BrandingPalette"
///         }
///       }
///     },
///     "BrandingPalette": {
///       "type": "object",
///       "maxProperties": 8,
///       "propertyNames": {
///         "enum": [
///           "background",
///           "foreground",
///           "primary",
///           "primary-foreground",
///           "sidebar",
///           "sidebar-foreground",
///           "accent",
///           "accent-foreground"
///         ]
///       },
///       "additionalProperties": {
///         "type": "string",
///         "pattern": "^#[0-9a-fA-F]{6}$"
///       }
///     }
///   }
/// }
/// ```
pub(crate) async fn public(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    let (revision, settings) = state
        .store
        .branding_configuration()
        .await
        .map_err(ApiError::from_store)?;
    // Explicit projection: never include audit actors, credentials or commercial settings.
    Ok(Json(
        json!({"data":{"revision":revision.to_string(),"settings":settings}}),
    ))
}
/// ```openapi
/// {
///   "path": "/admin/v1/platform/branding",
///   "method": "get",
///   "operation": {
///     "operationId": "getBranding",
///     "summary": "Read platform branding and theme configuration",
///     "description": "Installation credentials or an explicit platform-administrator grant required; company owner/admin role alone does not grant platform administration. Returns the same public-safe branding/theme shape. When no saved configuration exists, returns revision string 0 and Niu defaults. Theme fields are part of settings; there is no separate theme endpoint.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "x-niu-implementation": "implemented",
///     "responses": {
///       "200": {
///         "description": "Branding revision and settings in data.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/BrandingConfiguration"
///             }
///           }
///         }
///       },
///       "503": {
///         "description": "Durable storage unavailable."
///       },
///       "401": {
///         "description": "Authentication required."
///       },
///       "403": {
///         "description": "Platform administration required."
///       }
///     }
///   }
/// }
/// ```
pub(crate) async fn read(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    if !state
        .authorize_admin_headers(&headers, AdminPermission::Read)
        .await?
        .can_manage_platform()
    {
        return Err(ApiError::forbidden());
    }
    public(State(state)).await
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Write {
    expected_revision: String,
    settings: BrandingSettings,
}
/// ```openapi
/// {
///   "path": "/admin/v1/platform/branding",
///   "method": "put",
///   "operation": {
///     "operationId": "saveBranding",
///     "summary": "Save platform branding and theme configuration",
///     "description": "Installation credentials or an explicit platform-administrator grant required; company owner/admin role alone does not grant platform administration. Returns the same public-safe branding/theme shape. Canonical nonnegative decimal expected_revision string controls atomic snapshot and audit save. Valid display name is nonempty, already trimmed and at most 80 Unicode characters without controls. Palette maps only accept eight supported tokens with six-digit hex colors and readable contrast; empty maps inherit Niu defaults. No arbitrary CSS or executable branding is accepted. Optional null/omitted images reset to defaults. PNG images are decoded and re-encoded before persistence. Route JSON body limit is 450000 bytes. Successful save returns the exact committed snapshot and incremented string revision.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "x-niu-implementation": "implemented",
///     "responses": {
///       "200": {
///         "description": "Branding revision and settings in data.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/BrandingConfiguration"
///             }
///           }
///         }
///       },
///       "503": {
///         "description": "Durable storage unavailable."
///       },
///       "401": {
///         "description": "Authentication required."
///       },
///       "403": {
///         "description": "Platform administration required."
///       },
///       "400": {
///         "description": "Invalid revision, name, palette, contrast or image."
///       },
///       "409": {
///         "description": "Stale revision, exhausted revision or image normalization capacity exceeded; no accepted overwrite."
///       },
///       "413": {
///         "description": "JSON body exceeds route size limit."
///       },
///       "415": {
///         "description": "JSON content type required."
///       },
///       "422": {
///         "description": "Invalid JSON body shape."
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
///               "expected_revision",
///               "settings"
///             ],
///             "properties": {
///               "expected_revision": {
///                 "type": "string",
///                 "pattern": "^(0|[1-9][0-9]*)$"
///               },
///               "settings": {
///                 "$ref": "#/components/schemas/BrandingSettings"
///               }
///             }
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub(crate) async fn save(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<Write>,
) -> Result<Json<Value>, ApiError> {
    let auth = state.authorize_platform_headers(&headers).await?;
    let expected = input
        .expected_revision
        .parse::<i64>()
        .ok()
        .filter(|v| *v >= 0 && v.to_string() == input.expected_revision)
        .ok_or_else(|| ApiError::invalid_request("Provide the current branding revision"))?;
    input.settings.validate().map_err(|_| {
        ApiError::invalid_request(
            "Provide a bounded display name and supported hex colors with readable text contrast",
        )
    })?;
    let actor = match auth {
        AdminAuthorization::Operator(operator) => {
            niu_storage::OperatorAuditActor::Operator(operator.id)
        }
        AdminAuthorization::Installation => niu_storage::OperatorAuditActor::Installation,
    };
    let (revision, settings) = state
        .store
        .save_branding_configuration_snapshot_as(expected, &input.settings, Some(actor))
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(
        json!({"data":{"revision":revision.to_string(),"settings":settings}}),
    ))
}
