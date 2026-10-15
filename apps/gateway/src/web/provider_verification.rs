//! Thin scoped wrappers around upstream H5 verification. No local liveness,
//! consent registry, invented approval or anonymous verification capabilities.
use super::media_authorization::{MediaId, MediaPrincipal};
use super::provider_assets::{admit, client, idempotency, limits};
use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    body::Bytes,
    extract::{
        Query, State,
        rejection::{JsonRejection, QueryRejection},
    },
    http::{
        HeaderMap, HeaderValue, StatusCode,
        header::{CACHE_CONTROL, REFERRER_POLICY},
    },
};
use niu_media::{
    fastrouter_actions::{FastRouterAction, FastRouterActionError},
    fastrouter_domain::{
        FastRouterVerificationCreate, decode_verification_result, decode_verification_session,
    },
};
use niu_storage::{Principal, WorkspaceProviderAssetRoute, WorkspaceProviderVerificationSession};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Create {
    model: String,
    subject_name: Option<String>,
    return_url: Option<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Model {
    model: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Page {
    model: String,
    after: Option<Uuid>,
    limit: Option<i64>,
}
/// Only serialized into the authenticated envelope, never logs or metadata.
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Secrets {
    schema_version: u8,
    byted_token: String,
    verification_url: String,
}
fn query<T>(input: Result<Query<T>, QueryRejection>) -> Result<T, ApiError> {
    input
        .map(|Query(value)| value)
        .map_err(|_| ApiError::invalid_request("Invalid verification query"))
}
async fn saved(
    state: &AppState,
    p: &Principal,
    id: Uuid,
    route: &WorkspaceProviderAssetRoute,
) -> Result<WorkspaceProviderVerificationSession, ApiError> {
    let value = state
        .store
        .workspace_provider_verification(p, id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    if value.model != route.model_alias()
        || value.vendor_id() != route.vendor_id()
        || value.vendor_revision() != route.vendor_revision()
        || value.model_revision() != route.model_revision()
    {
        return Err(ApiError::not_found());
    }
    Ok(value)
}
async fn secrets(
    state: &AppState,
    p: &Principal,
    id: Uuid,
    route: &WorkspaceProviderAssetRoute,
) -> Result<Secrets, ApiError> {
    let retained = state
        .store
        .workspace_provider_verification_content(p, id, route)
        .await
        .map_err(ApiError::from_store)?;
    let expected = niu_storage::workspace_provider_verification_aad(
        p.scope(),
        retained.session.original_key_id(),
        id,
    );
    if retained.aad != expected || retained.ciphertext.len() > 32800 {
        return Err(ApiError::unavailable());
    }
    let bytes = state
        .vendor_cipher
        .as_ref()
        .ok_or_else(ApiError::unavailable)?
        .open_bytes_with_aad(&expected, &retained.ciphertext)
        .map_err(|_| ApiError::unavailable())?;
    if bytes.len() > 32768 {
        return Err(ApiError::unavailable());
    }
    let value: Secrets = serde_json::from_slice(&bytes).map_err(|_| ApiError::unavailable())?;
    if value.schema_version != 1
        || value.byted_token.is_empty()
        || value.byted_token.len() > 8192
        || value.byted_token.trim() != value.byted_token
        || value.byted_token.chars().any(char::is_control)
        || value.verification_url.len() > 8192
        || !url::Url::parse(&value.verification_url).is_ok_and(|url| {
            url.scheme() == "https"
                && url.host_str().is_some()
                && url.username().is_empty()
                && url.password().is_none()
                && url.fragment().is_none()
        })
    {
        return Err(ApiError::unavailable());
    }
    Ok(value)
}
fn failure(error: FastRouterActionError) -> (Option<u16>, Option<String>, bool) {
    match error {
        FastRouterActionError::InvalidConfiguration
        | FastRouterActionError::InvalidRequest
        | FastRouterActionError::EndpointUnavailable => (None, None, true),
        FastRouterActionError::Transport(value)
        | FastRouterActionError::ResponseTooLarge(value)
        | FastRouterActionError::InvalidResponse(value)
        | FastRouterActionError::UpstreamRejected(value) => {
            (value.http_status, value.request_id, false)
        }
    }
}
/// ```openapi
/// {
///   "path": "/v1/media/verification-sessions",
///   "method": "post",
///   "operation": {
///     "operationId": "createMediaVerificationSession",
///     "summary": "Create upstream human verification session",
///     "description": "Current workspace API key, model grant, composed workspace/key model and Provider policy, eligible published route and selectable credential required. Original immutable account/model binding is revalidated; original key identity binds encryption only, not workspace access control. Only configured fastrouter-actions-v1 channels are supported. Forwards only caller-supplied optional subject_name and return_url to the upstream H5 service. Exactly one creation follows a durable claim. All after-send failures remain unknown without automatic retry. A created session is not human completion or a local liveness approval. Token and H5 URL are encrypted and absent from ordinary metadata and logs.",
///     "x-niu-implementation": "implemented",
///     "tags": [
///       "Media"
///     ],
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "Idempotency-Key",
///         "in": "header",
///         "required": false,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "description": "Canonical nonnil UUID; unchanged replay reads saved session without repeating creation."
///       }
///     ],
///     "responses": {
///       "202": {
///         "description": "Saved session accepted",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "$ref": "#/components/schemas/MediaVerificationSession"
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid fields or query"
///       },
///       "401": {
///         "description": "Missing, revoked or expired API key"
///       },
///       "403": {
///         "description": "Workspace/key policy refusal"
///       },
///       "404": {
///         "description": "Owned session or model not found"
///       },
///       "409": {
///         "description": "Changed input, stale route, expiry, unavailable token or capacity conflict"
///       },
///       "413": {
///         "description": "Body exceeds bounded size"
///       },
///       "501": {
///         "description": "Selected channel does not configure verification management"
///       },
///       "503": {
///         "description": "Credential, encrypted content or bounded storage unavailable"
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
///               "model"
///             ],
///             "properties": {
///               "model": {
///                 "type": "string"
///               },
///               "subject_name": {
///                 "type": "string",
///                 "minLength": 1,
///                 "maxLength": 32
///               },
///               "return_url": {
///                 "type": "string",
///                 "format": "uri",
///                 "maxLength": 8192
///               }
///             }
///           }
///         }
///       }
///     }
///   },
///   "schemas": {
///     "MediaVerificationSession": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "id",
///         "model",
///         "subject_name",
///         "status",
///         "group_id",
///         "expires_at",
///         "created_at_ms",
///         "updated_at_ms"
///       ],
///       "properties": {
///         "id": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "model": {
///           "type": "string"
///         },
///         "subject_name": {
///           "type": [
///             "string",
///             "null"
///           ]
///         },
///         "status": {
///           "type": "string",
///           "enum": [
///             "prepared",
///             "unknown",
///             "not_sent",
///             "waiting_user",
///             "processing",
///             "verified",
///             "failed",
///             "expired"
///           ]
///         },
///         "group_id": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "format": "uuid"
///         },
///         "expires_at": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "format": "date-time"
///         },
///         "created_at_ms": {
///           "type": "integer",
///           "format": "int64"
///         },
///         "updated_at_ms": {
///           "type": "integer",
///           "format": "int64"
///         }
///       }
///     }
///   }
/// }
/// ```
pub(super) async fn create(
    State(state): State<AppState>,
    MediaPrincipal(principal): MediaPrincipal,
    headers: HeaderMap,
    input: Result<Json<Create>, JsonRejection>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let Json(input) = input.map_err(|error| {
        if error.status() == StatusCode::PAYLOAD_TOO_LARGE {
            ApiError::request_too_large()
        } else {
            ApiError::invalid_request("Invalid verification request")
        }
    })?;
    let route = admit(&state, &principal, &input.model).await?;
    let client = client(&state, &route)?;
    let request = FastRouterVerificationCreate {
        subject_name: input.subject_name,
        return_url: input.return_url,
    };
    let body = request
        .body()
        .map_err(|_| ApiError::invalid_request("Invalid verification parameters"))?;
    let prepared = state
        .store
        .prepare_workspace_provider_verification(
            &principal,
            &route,
            &request,
            idempotency(&headers)?,
        )
        .await
        .map_err(ApiError::from_store)?;
    if state
        .store
        .claim_workspace_provider_verification(&principal, prepared.id, &route)
        .await
        .map_err(ApiError::from_store)?
    {
        match client
            .execute(
                FastRouterAction::CreateVisualValidateSession,
                &body,
                limits(&state),
            )
            .await
        {
            Ok(response) => match decode_verification_session(&response) {
                Ok(session) => {
                    let value = Secrets {
                        schema_version: 1,
                        byted_token: session.private_session_token().to_owned(),
                        verification_url: session.private_h5_url().to_owned(),
                    };
                    let bytes = serde_json::to_vec(&value).map_err(|_| ApiError::unavailable())?;
                    if bytes.len() > 32768 {
                        return Err(ApiError::unavailable());
                    }
                    let aad = niu_storage::workspace_provider_verification_aad(
                        principal.scope(),
                        prepared.original_key_id(),
                        prepared.id,
                    );
                    let encrypted = state
                        .vendor_cipher
                        .as_ref()
                        .ok_or_else(ApiError::unavailable)?
                        .seal_bytes_with_aad(&aad, &bytes)
                        .map_err(|_| ApiError::unavailable())?;
                    state
                        .store
                        .record_workspace_provider_verification_created(
                            principal.scope(),
                            prepared.id,
                            &encrypted,
                            &session,
                        )
                        .await
                        .map_err(ApiError::from_store)?;
                }
                Err(_) => state
                    .store
                    .record_workspace_provider_verification_failure(
                        principal.scope(),
                        prepared.id,
                        None,
                        response.request_id(),
                        false,
                    )
                    .await
                    .map_err(ApiError::from_store)?,
            },
            Err(error) => {
                let (status, request_id, not_sent) = failure(error);
                state
                    .store
                    .record_workspace_provider_verification_failure(
                        principal.scope(),
                        prepared.id,
                        status,
                        request_id.as_deref(),
                        not_sent,
                    )
                    .await
                    .map_err(ApiError::from_store)?;
            }
        }
    }
    Ok((
        StatusCode::ACCEPTED,
        Json(json!({"data":saved(&state,&principal,prepared.id,&route).await?})),
    ))
}
/// ```openapi
/// {
///   "path": "/v1/media/verification-sessions",
///   "method": "get",
///   "operation": {
///     "operationId": "listMediaVerificationSessions",
///     "summary": "List saved verification sessions",
///     "description": "Current workspace API key, model grant, composed workspace/key model and Provider policy, eligible published route and selectable credential required. Original immutable account/model binding is revalidated; original key identity binds encryption only, not workspace access control. Only configured fastrouter-actions-v1 channels are supported. Local owned metadata only; no global upstream discovery, H5 URL, token or raw response.",
///     "x-niu-implementation": "implemented",
///     "tags": [
///       "Media"
///     ],
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "model",
///         "in": "query",
///         "required": true,
///         "schema": {
///           "type": "string"
///         }
///       },
///       {
///         "name": "after",
///         "in": "query",
///         "required": false,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
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
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Owned verification metadata",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data",
///                 "next_cursor"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "$ref": "#/components/schemas/MediaVerificationSession"
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
///         "description": "Invalid fields or query"
///       },
///       "401": {
///         "description": "Missing, revoked or expired API key"
///       },
///       "403": {
///         "description": "Workspace/key policy refusal"
///       },
///       "404": {
///         "description": "Owned session or model not found"
///       },
///       "409": {
///         "description": "Changed input, stale route, expiry, unavailable token or capacity conflict"
///       },
///       "413": {
///         "description": "Body exceeds bounded size"
///       },
///       "501": {
///         "description": "Selected channel does not configure verification management"
///       },
///       "503": {
///         "description": "Credential, encrypted content or bounded storage unavailable"
///       }
///     }
///   }
/// }
/// ```
pub(super) async fn list(
    State(state): State<AppState>,
    MediaPrincipal(principal): MediaPrincipal,
    input: Result<Query<Page>, QueryRejection>,
) -> Result<Json<Value>, ApiError> {
    let input = query(input)?;
    admit(&state, &principal, &input.model).await?;
    let data = state
        .store
        .workspace_provider_verifications(
            &principal,
            &input.model,
            input.after,
            input.limit.unwrap_or(50),
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(
        json!({"data":data.data,"next_cursor":data.next_cursor}),
    ))
}
/// ```openapi
/// {
///   "path": "/v1/media/verification-sessions/{id}",
///   "method": "get",
///   "operation": {
///     "operationId": "getMediaVerificationSession",
///     "summary": "Read saved verification session",
///     "description": "Current workspace API key, model grant, composed workspace/key model and Provider policy, eligible published route and selectable credential required. Original immutable account/model binding is revalidated; original key identity binds encryption only, not workspace access control. Only configured fastrouter-actions-v1 channels are supported. Local saved status only, with known expiry reflected; no token, H5 URL or upstream request.",
///     "x-niu-implementation": "implemented",
///     "tags": [
///       "Media"
///     ],
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
///       },
///       {
///         "name": "model",
///         "in": "query",
///         "required": true,
///         "schema": {
///           "type": "string"
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Owned verification metadata",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "$ref": "#/components/schemas/MediaVerificationSession"
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid fields or query"
///       },
///       "401": {
///         "description": "Missing, revoked or expired API key"
///       },
///       "403": {
///         "description": "Workspace/key policy refusal"
///       },
///       "404": {
///         "description": "Owned session or model not found"
///       },
///       "409": {
///         "description": "Changed input, stale route, expiry, unavailable token or capacity conflict"
///       },
///       "413": {
///         "description": "Body exceeds bounded size"
///       },
///       "501": {
///         "description": "Selected channel does not configure verification management"
///       },
///       "503": {
///         "description": "Credential, encrypted content or bounded storage unavailable"
///       }
///     }
///   }
/// }
/// ```
pub(super) async fn get(
    State(state): State<AppState>,
    MediaPrincipal(principal): MediaPrincipal,
    MediaId(id): MediaId,
    input: Result<Query<Model>, QueryRejection>,
) -> Result<Json<Value>, ApiError> {
    let input = query(input)?;
    let route = admit(&state, &principal, &input.model).await?;
    Ok(Json(
        json!({"data":saved(&state,&principal,id,&route).await?}),
    ))
}
/// ```openapi
/// {
///   "path": "/v1/media/verification-sessions/{id}/link",
///   "method": "get",
///   "operation": {
///     "operationId": "getMediaVerificationLink",
///     "summary": "Get authenticated upstream verification link",
///     "description": "Current workspace API key, model grant, composed workspace/key model and Provider policy, eligible published route and selectable credential required. Original immutable account/model binding is revalidated; original key identity binds encryption only, not workspace access control. Only configured fastrouter-actions-v1 channels are supported. Explicit authenticated disclosure of the genuine external H5 URL to the current authorized workspace. Known expiry is checked before disclosure; absent upstream expiry is not replaced with invented entitlement. Only waiting/processing sessions expose a link. No raw BytedToken field, anonymous NIU link or local biometric processing. Cache-Control no-store and Referrer-Policy no-referrer.",
///     "x-niu-implementation": "implemented",
///     "tags": [
///       "Media"
///     ],
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
///       },
///       {
///         "name": "model",
///         "in": "query",
///         "required": true,
///         "schema": {
///           "type": "string"
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Authorized upstream H5 handoff",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "verification_url",
///                 "expires_at"
///               ],
///               "properties": {
///                 "verification_url": {
///                   "type": "string",
///                   "format": "uri"
///                 },
///                 "expires_at": {
///                   "type": [
///                     "string",
///                     "null"
///                   ],
///                   "format": "date-time"
///                 }
///               }
///             }
///           }
///         },
///         "headers": {
///           "Cache-Control": {
///             "schema": {
///               "type": "string",
///               "const": "no-store"
///             }
///           },
///           "Referrer-Policy": {
///             "schema": {
///               "type": "string",
///               "const": "no-referrer"
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid fields or query"
///       },
///       "401": {
///         "description": "Missing, revoked or expired API key"
///       },
///       "403": {
///         "description": "Workspace/key policy refusal"
///       },
///       "404": {
///         "description": "Owned session or model not found"
///       },
///       "409": {
///         "description": "Changed input, stale route, expiry, unavailable token or capacity conflict"
///       },
///       "413": {
///         "description": "Body exceeds bounded size"
///       },
///       "501": {
///         "description": "Selected channel does not configure verification management"
///       },
///       "503": {
///         "description": "Credential, encrypted content or bounded storage unavailable"
///       }
///     }
///   }
/// }
/// ```
pub(super) async fn link(
    State(state): State<AppState>,
    MediaPrincipal(principal): MediaPrincipal,
    MediaId(id): MediaId,
    input: Result<Query<Model>, QueryRejection>,
) -> Result<(HeaderMap, Json<Value>), ApiError> {
    let input = query(input)?;
    let route = admit(&state, &principal, &input.model).await?;
    let current = saved(&state, &principal, id, &route).await?;
    let private = secrets(&state, &principal, id, &route).await?;
    let mut headers = HeaderMap::new();
    headers.insert(CACHE_CONTROL, HeaderValue::from_static("no-store"));
    headers.insert(REFERRER_POLICY, HeaderValue::from_static("no-referrer"));
    Ok((
        headers,
        Json(json!({"verification_url":private.verification_url,"expires_at":current.expires_at})),
    ))
}
/// ```openapi
/// {
///   "path": "/v1/media/verification-sessions/{id}/refresh",
///   "method": "post",
///   "operation": {
///     "operationId": "refreshMediaVerificationSession",
///     "summary": "Refresh upstream verification session",
///     "description": "Current workspace API key, model grant, composed workspace/key model and Provider policy, eligible published route and selectable credential required. Original immutable account/model binding is revalidated; original key identity binds encryption only, not workspace access control. Only configured fastrouter-actions-v1 channels are supported. Empty body only. One explicit bounded query for an active genuine saved token. Upstream resolution can create a group, so a durable query claim prevents concurrent or uncertain replay. In-flight or after-send uncertain queries are exposed as unknown. Genuine waiting/processing results permit a later explicit query. Other states return unchanged without an upstream call. Only actual decoded verified GroupId binds a person group; no fake completion or local detector.",
///     "x-niu-implementation": "implemented",
///     "tags": [
///       "Media"
///     ],
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
///       },
///       {
///         "name": "model",
///         "in": "query",
///         "required": true,
///         "schema": {
///           "type": "string"
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Owned verification metadata",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "$ref": "#/components/schemas/MediaVerificationSession"
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid fields or query"
///       },
///       "401": {
///         "description": "Missing, revoked or expired API key"
///       },
///       "403": {
///         "description": "Workspace/key policy refusal"
///       },
///       "404": {
///         "description": "Owned session or model not found"
///       },
///       "409": {
///         "description": "Changed input, stale route, expiry, unavailable token or capacity conflict"
///       },
///       "413": {
///         "description": "Body exceeds bounded size"
///       },
///       "501": {
///         "description": "Selected channel does not configure verification management"
///       },
///       "503": {
///         "description": "Credential, encrypted content or bounded storage unavailable"
///       }
///     }
///   }
/// }
/// ```
pub(super) async fn refresh(
    State(state): State<AppState>,
    MediaPrincipal(principal): MediaPrincipal,
    MediaId(id): MediaId,
    input: Result<Query<Model>, QueryRejection>,
    body: Bytes,
) -> Result<Json<Value>, ApiError> {
    if !body.is_empty() {
        return Err(ApiError::invalid_request(
            "Refresh accepts an empty body only",
        ));
    }
    let input = query(input)?;
    let route = admit(&state, &principal, &input.model).await?;
    let current = saved(&state, &principal, id, &route).await?;
    if !matches!(current.status.as_str(), "waiting_user" | "processing") {
        return Ok(Json(json!({"data":current})));
    }
    let private = secrets(&state, &principal, id, &route).await?;
    let client = client(&state, &route)?;
    if state
        .store
        .claim_workspace_provider_verification_query(&principal, id, &route)
        .await
        .map_err(ApiError::from_store)?
    {
        let body = json!({"BytedToken":private.byted_token});
        match client
            .execute(
                FastRouterAction::GetVisualValidateResult,
                &body,
                limits(&state),
            )
            .await
        {
            Ok(response) => match decode_verification_result(&response) {
                Ok(result) => {
                    let updated = state
                        .store
                        .observe_workspace_provider_verification(&principal, id, &route, &result)
                        .await
                        .map_err(ApiError::from_store)?;
                    return Ok(Json(json!({"data":updated})));
                }
                Err(_) => state
                    .store
                    .record_workspace_provider_verification_query_failure(
                        principal.scope(),
                        id,
                        None,
                        response.request_id(),
                        false,
                    )
                    .await
                    .map_err(ApiError::from_store)?,
            },
            Err(error) => {
                let (status, request_id, not_sent) = failure(error);
                state
                    .store
                    .record_workspace_provider_verification_query_failure(
                        principal.scope(),
                        id,
                        status,
                        request_id.as_deref(),
                        not_sent,
                    )
                    .await
                    .map_err(ApiError::from_store)?;
            }
        }
    }
    Ok(Json(
        json!({"data":saved(&state,&principal,id,&route).await?}),
    ))
}
