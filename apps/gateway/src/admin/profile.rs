use crate::{
    error::ApiError,
    state::{AdminAuthorization, AppState},
};
use axum::{
    Json,
    extract::{State, rejection::JsonRejection},
    http::HeaderMap,
};
use base64::{Engine, engine::general_purpose::STANDARD};
use image::{ImageFormat, ImageReader, Limits};
use niu_storage::{AdminPermission, MemberProfile};
use serde::Deserialize;
use serde_json::{Value, json};
use std::io::Cursor;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProfileInput {
    name: String,
    avatar_data_url: Option<String>,
    expected_revision: i64,
}

pub(super) async fn current_member(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<uuid::Uuid, ApiError> {
    match super::authorize(state, headers, AdminPermission::Read).await? {
        AdminAuthorization::Operator(member) => Ok(member.id),
        AdminAuthorization::Installation => Err(ApiError::forbidden()),
    }
}

/// ```openapi
/// {
///   "path": "/admin/v1/auth/profile",
///   "method": "get",
///   "operation": {
///     "operationId": "getMemberProfile",
///     "summary": "Read current member profile",
///     "description": "Current authenticated member only; the target member is derived from authentication, never supplied by the caller. Requires an operator/member session with Read permission; installation bearer credentials are rejected. Browser member-cookie sessions are also supported by the existing authentication middleware. All responses carry Cache-Control: no-store. Returns the saved name, nullable password-login email, nullable avatar and numeric profile revision.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "x-niu-implementation": "implemented",
///     "responses": {
///       "200": {
///         "description": "Current saved member data.",
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
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "object",
///                   "required": [
///                     "name",
///                     "email",
///                     "avatar_data_url",
///                     "revision"
///                   ],
///                   "properties": {
///                     "name": {
///                       "type": "string"
///                     },
///                     "email": {
///                       "type": [
///                         "string",
///                         "null"
///                       ]
///                     },
///                     "avatar_data_url": {
///                       "type": [
///                         "string",
///                         "null"
///                       ],
///                       "description": "Normalized PNG data URL, or null when no avatar is saved."
///                     },
///                     "revision": {
///                       "type": "integer",
///                       "format": "int64",
///                       "minimum": 0
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "401": {
///         "description": "Missing, invalid or revoked member authentication."
///       },
///       "403": {
///         "description": "Read permission required; installation credentials cannot access member data, or a write failed origin/cookie checks."
///       },
///       "503": {
///         "description": "Durable storage unavailable."
///       }
///     }
///   }
/// }
/// ```
pub async fn profile(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let member = current_member(&state, &headers).await?;
    let profile = state
        .store
        .member_profile(member)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data": profile})))
}

fn normalize_avatar(value: &str) -> Result<String, ApiError> {
    let invalid = || {
        ApiError::invalid_request("Choose a PNG avatar no larger than 256 × 256 pixels and 128 KB")
    };
    if value.len() > 175000 {
        return Err(invalid());
    }
    let encoded = value
        .strip_prefix("data:image/png;base64,")
        .ok_or_else(invalid)?;
    let bytes = STANDARD.decode(encoded).map_err(|_| invalid())?;
    if bytes.len() > 131072 {
        return Err(invalid());
    }
    let mut reader = ImageReader::with_format(Cursor::new(bytes), ImageFormat::Png);
    let mut limits = Limits::default();
    limits.max_image_width = Some(256);
    limits.max_image_height = Some(256);
    limits.max_alloc = Some(4 * 1024 * 1024);
    reader.limits(limits);
    let image = reader.decode().map_err(|_| invalid())?;
    let mut output = Cursor::new(Vec::new());
    image
        .write_to(&mut output, ImageFormat::Png)
        .map_err(|_| invalid())?;
    if output.get_ref().len() > 131072 {
        return Err(invalid());
    }
    Ok(format!(
        "data:image/png;base64,{}",
        STANDARD.encode(output.into_inner())
    ))
}

/// ```openapi
/// {
///   "path": "/admin/v1/auth/profile",
///   "method": "put",
///   "operation": {
///     "operationId": "updateMemberProfile",
///     "summary": "Update current member profile",
///     "description": "Current authenticated member only; the target member is derived from authentication, never supplied by the caller. Requires an operator/member session with Read permission; installation bearer credentials are rejected. Browser member-cookie sessions are also supported by the existing authentication middleware. All responses carry Cache-Control: no-store. When password authentication is configured, cookie/browser writes require a valid Origin and cookie-request checks; bearer writes validate Origin when supplied. Atomically updates name and avatar with optimistic revision checking. Email is read-only. Null or omitted avatar_data_url clears the avatar. Route body limit is 180000 bytes; rejected bodies are mapped to JSON invalid-request errors.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "x-niu-implementation": "implemented",
///     "responses": {
///       "200": {
///         "description": "Current saved member data.",
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
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "object",
///                   "required": [
///                     "name",
///                     "email",
///                     "avatar_data_url",
///                     "revision"
///                   ],
///                   "properties": {
///                     "name": {
///                       "type": "string"
///                     },
///                     "email": {
///                       "type": [
///                         "string",
///                         "null"
///                       ]
///                     },
///                     "avatar_data_url": {
///                       "type": [
///                         "string",
///                         "null"
///                       ],
///                       "description": "Normalized PNG data URL, or null when no avatar is saved."
///                     },
///                     "revision": {
///                       "type": "integer",
///                       "format": "int64",
///                       "minimum": 0
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "401": {
///         "description": "Missing, invalid or revoked member authentication."
///       },
///       "403": {
///         "description": "Read permission required; installation credentials cannot access member data, or a write failed origin/cookie checks."
///       },
///       "503": {
///         "description": "Durable storage unavailable."
///       },
///       "400": {
///         "description": "Invalid JSON, unknown fields or invalid input."
///       },
///       "409": {
///         "description": "expected_revision does not match the saved profile; reload before retrying."
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
///               "name",
///               "expected_revision"
///             ],
///             "properties": {
///               "name": {
///                 "type": "string",
///                 "maxLength": 100,
///                 "description": "Trimmed before saving; must contain 1 to 100 Unicode characters and no control characters."
///               },
///               "avatar_data_url": {
///                 "type": [
///                   "string",
///                   "null"
///                 ],
///                 "maxLength": 175000,
///                 "description": "Optional PNG data URL. Null or omission removes the existing avatar. Decoded and normalized PNG must each be at most 131072 bytes and dimensions at most 256 by 256 pixels."
///               },
///               "expected_revision": {
///                 "type": "integer",
///                 "format": "int64",
///                 "minimum": 0,
///                 "description": "Numeric revision returned by GET; a profile with no saved customization starts at zero. Successful update increments it."
///               }
///             }
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub async fn update_profile(
    State(state): State<AppState>,
    headers: HeaderMap,
    input: Result<Json<ProfileInput>, JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    let member = current_member(&state, &headers).await?;
    if let Some(runtime) = state.password_auth.as_ref() {
        let browser = !headers.contains_key("authorization")
            || headers
                .get("authorization")
                .and_then(|value| value.to_str().ok())
                == Some("Bearer niu-browser-member-session");
        if browser {
            runtime.require_origin(&headers)?;
        } else {
            runtime.check_origin(&headers)?;
        }
    }
    let Json(input) = input.map_err(|_| ApiError::invalid_request("Invalid profile update"))?;
    let avatar = match input.avatar_data_url {
        Some(value) => Some(
            tokio::task::spawn_blocking(move || normalize_avatar(&value))
                .await
                .map_err(|_| ApiError::invalid_request("Could not process the avatar"))??,
        ),
        None => None,
    };
    let profile: MemberProfile = state
        .store
        .update_member_profile(
            member,
            &input.name,
            avatar.as_deref(),
            input.expected_revision,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data": profile})))
}
