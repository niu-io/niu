//! Browser transport for an existing Operator credential, never session issuance.
use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    extract::{State, rejection::JsonRejection},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
};
use serde::Deserialize;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TokenInput {
    token: String,
}

/// ```openapi
/// {
///   "path": "/api/v1/auth/browser/token",
///   "method": "post",
///   "operation": {
///     "operationId": "exchangeOperatorTokenForBrowserSession",
///     "summary": "Use an existing user access token in the browser",
///     "description": "Requires an explicit trusted same-origin Origin and a valid durable Operator session token. Installation credentials, inference keys, revoked sessions and expired sessions are refused. Sets the existing HttpOnly SameSite cookie to the original token without creating an identity or session, extending expiry, changing role/scope, or returning the token in JSON. Cookie lifetime is capped at the original remaining lifetime and eight hours; every subsequent request rechecks the original durable session. Requires configured browser authentication origin. Responses are not cached.",
///     "security": [],
///     "x-niu-implementation": "implemented",
///     "parameters": [{
///       "name": "Origin", "in": "header", "required": true,
///       "description": "Exact configured browser origin, matching the trusted same-origin UI. A missing, mismatched or cross-site origin is refused.",
///       "schema": {"type": "string", "format": "uri"}
///     }],
///     "requestBody": {
///       "required": true,
///       "content": {"application/json": {"schema": {
///         "type": "object", "additionalProperties": false,
///         "required": ["token"],
///         "properties": {"token": {
///           "type": "string", "minLength": 74, "maxLength": 74,
///           "pattern": "^niu_admin_[0-9a-f]{64}$", "writeOnly": true,
///           "description": "Original user access token; never place it in a URL or browser storage."
///         }}
///       }}}
///     },
///     "responses": {
///       "204": {"description": "Original session established as an HttpOnly browser cookie; no response body.",
///         "headers": {
///           "Cache-Control": {"schema": {"type": "string", "const": "no-store"}},
///           "Set-Cookie": {"description": "Existing original Operator session transported in the protected HttpOnly SameSite browser cookie, with lifetime bounded by its original expiry. No cookie value example is provided."}
///         }},
///       "400": {"description": "Malformed JSON or unknown request fields."},
///       "401": {"description": "Invalid, expired, revoked or non-Operator credential."},
///       "403": {"description": "Missing, untrusted or cross-site Origin."},
///       "501": {"description": "Browser authentication origin is not configured."},
///       "503": {"description": "Durable authentication storage is unavailable."}
///     }
///   }
/// }
/// ```
pub async fn exchange(
    State(state): State<AppState>,
    headers: HeaderMap,
    input: Result<Json<TokenInput>, JsonRejection>,
) -> Result<Response, ApiError> {
    let runtime = super::passwords::runtime(&state)?;
    runtime.require_origin(&headers)?;
    let Json(input) =
        input.map_err(|_| ApiError::invalid_request("Provide a user access token"))?;
    // Exact server-issued shape prevents malformed values entering cookie headers.
    let suffix = input
        .token
        .strip_prefix("niu_admin_")
        .ok_or_else(ApiError::unauthorized)?;
    if suffix.len() != 64
        || !suffix
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(ApiError::unauthorized());
    }
    let (_, expires_at) = state
        .store
        .authenticate_operator_with_expiry(&input.token)
        .await
        .map_err(ApiError::from_store)?;
    let elapsed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| ApiError::storage_unavailable())?;
    // Round down the remaining lifetime, never beyond the original expiry.
    let now = elapsed
        .as_secs()
        .saturating_add(u64::from(elapsed.subsec_nanos() != 0));
    let remaining = u64::try_from(expires_at)
        .ok()
        .and_then(|expiry| expiry.checked_sub(now))
        .filter(|remaining| *remaining > 0)
        .ok_or_else(ApiError::unauthorized)?;
    let mut response = StatusCode::NO_CONTENT.into_response();
    response.headers_mut().insert(
        header::SET_COOKIE,
        runtime.cookie_header(&input.token, remaining.min(28_800) as u32),
    );
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        axum::http::HeaderValue::from_static("no-store"),
    );
    Ok(response)
}
