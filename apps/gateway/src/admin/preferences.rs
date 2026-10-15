use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    extract::{State, rejection::JsonRejection},
    http::HeaderMap,
};
use niu_storage::ColorMode;
use serde::Deserialize;
use serde_json::{Value, json};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PreferencesInput {
    color_mode: ColorMode,
}

/// ```openapi
/// {
///   "path": "/api/v1/auth/preferences",
///   "method": "get",
///   "operation": {
///     "operationId": "getMemberPreferences",
///     "summary": "Read current member appearance preference",
///     "description": "Current authenticated member only; the target member is derived from authentication, never supplied by the caller. Requires an operator/member session with Read permission; installation bearer credentials are rejected. Browser member-cookie sessions are also supported by the existing authentication middleware. All responses carry Cache-Control: no-store. Returns the saved color mode; when no member preference exists, returns the installation branding default appearance. No revision field is exposed.",
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
///                     "color_mode"
///                   ],
///                   "properties": {
///                     "color_mode": {
///                       "type": "string",
///                       "enum": [
///                         "system",
///                         "light",
///                         "dark"
///                       ]
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
pub async fn preferences(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let member = super::profile::current_member(&state, &headers).await?;
    let mode = state
        .store
        .member_color_mode(member)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"color_mode":mode}})))
}

/// ```openapi
/// {
///   "path": "/api/v1/auth/preferences",
///   "method": "put",
///   "operation": {
///     "operationId": "updateMemberPreferences",
///     "summary": "Save current member appearance preference",
///     "description": "Current authenticated member only; the target member is derived from authentication, never supplied by the caller. Requires an operator/member session with Read permission; installation bearer credentials are rejected. Browser member-cookie sessions are also supported by the existing authentication middleware. All responses carry Cache-Control: no-store. When password authentication is configured, cookie/browser writes require a valid Origin and cookie-request checks; bearer writes validate Origin when supplied. Saves one of system, light or dark. This endpoint has no revision precondition; subsequent accepted writes replace the saved mode. Route body limit is 1024 bytes; rejected bodies are mapped to JSON invalid-request errors.",
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
///                     "color_mode"
///                   ],
///                   "properties": {
///                     "color_mode": {
///                       "type": "string",
///                       "enum": [
///                         "system",
///                         "light",
///                         "dark"
///                       ]
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
///               "color_mode"
///             ],
///             "properties": {
///               "color_mode": {
///                 "type": "string",
///                 "enum": [
///                   "system",
///                   "light",
///                   "dark"
///                 ]
///               }
///             }
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub async fn update_preferences(
    State(state): State<AppState>,
    headers: HeaderMap,
    input: Result<Json<PreferencesInput>, JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    let member = super::profile::current_member(&state, &headers).await?;
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
    let Json(input) =
        input.map_err(|_| ApiError::invalid_request("Choose System, Light, or Dark"))?;
    state
        .store
        .set_member_color_mode(member, input.color_mode)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"color_mode":input.color_mode}})))
}
