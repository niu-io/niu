//! Inspect one inline image using every required consented detector, then seal
//! the exact approved bytes. Never accept a caller-supplied moderation verdict.
use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::sync::{Arc, LazyLock};
use uuid::Uuid;

pub(crate) static PREPARATIONS: LazyLock<Arc<tokio::sync::Semaphore>> =
    LazyLock::new(|| Arc::new(tokio::sync::Semaphore::new(4)));

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Input {
    image: String,
    valid_for_seconds: i32,
}

/// ```openapi
/// {
///   "path": "/v1/media/image-sources",
///   "method": "post",
///   "operation": {
///     "operationId": "prepareInspectedImageSource",
///     "summary": "Inspect and temporarily retain one exact inline image",
///     "description": "Active workspace inference key required. Every required image detector must have current workspace processing consent. Detector approval is obtained server-side; client verdicts, hashes and remote URLs are rejected. Saves encrypted approved bytes, never publishes a fetch token or dispatches an asset. Four preparations may run concurrently. Retention is 1 to 900 seconds, with separate workspace and installation storage ceilings. Maximum JSON body is 12 MiB plus 1024 bytes. No request-payload logging on this endpoint. The source ID is an internal API reference, not a display label. Missing inspection prerequisites fail before detector disclosure.",
///     "x-niu-implementation": "implemented",
///     "security": [
///       {
///         "bearerAuth": []
///       },
///       {
///         "niuApiKeyAuth": []
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
///               "image",
///               "valid_for_seconds"
///             ],
///             "properties": {
///               "image": {
///                 "type": "string",
///                 "maxLength": 12582912,
///                 "description": "Inline PNG, JPEG or WebP base64 data URL subject to configured detector decode limits."
///               },
///               "valid_for_seconds": {
///                 "type": "integer",
///                 "minimum": 1,
///                 "maximum": 900
///               }
///             }
///           }
///         }
///       }
///     },
///     "responses": {
///       "201": {
///         "description": "Approved encrypted source retained; no image bytes or fetch capability returned",
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
///                     "source_id",
///                     "retained",
///                     "retention_seconds"
///                   ],
///                   "properties": {
///                     "source_id": {
///                       "type": "string",
///                       "format": "uuid"
///                     },
///                     "retained": {
///                       "const": true
///                     },
///                     "retention_seconds": {
///                       "type": "integer",
///                       "minimum": 1,
///                       "maximum": 900
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid or unsupported input, including a JSON body exceeding the endpoint limit"
///       },
///       "401": {
///         "description": "Active inference key required"
///       },
///       "403": {
///         "description": "Current inspection consent or detector approval unavailable. Missing authorized inspection prerequisites use error.type image_inspection_required; other policy refusals retain their existing error type."
///       },
///       "409": {
///         "description": "Workspace policy changed during preparation"
///       },
///       "503": {
///         "description": "Encryption, preparation capacity, storage capacity or durable storage unavailable"
///       }
///     }
///   }
/// }
/// ```
pub(crate) async fn prepare(
    State(state): State<AppState>,
    headers: HeaderMap,
    input: Result<Json<Input>, axum::extract::rejection::JsonRejection>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let principal = state.authorize_api_headers(&headers).await?;
    let Json(input) = input.map_err(|_| {
        ApiError::invalid_request("Expected one inline image and retention lifetime")
    })?;
    if !(1..=900).contains(&input.valid_for_seconds)
        || input.image.len() > 12 * 1024 * 1024
        || !input.image.starts_with("data:image/")
    {
        return Err(ApiError::invalid_request(
            "Use one inline image and retention from 1 to 900 seconds",
        ));
    }
    let cipher = state
        .vendor_cipher
        .as_ref()
        .ok_or_else(ApiError::unavailable)?;
    let _permit = PREPARATIONS
        .clone()
        .try_acquire_owned()
        .map_err(|_| ApiError::asset_management_busy())?;
    let snapshot = state
        .store
        .guardrail_snapshot(principal.scope(), principal.key_id())
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::forbidden)?;
    let mut body = json!({"content":[{"type":"image_url","image_url":{"url":input.image}}]});
    let inspected =
        super::inference::video_images::inspect(&state, &principal, &snapshot, &mut body).await?;
    let proofs: Vec<_> = inspected.iter().map(|image| image.binding()).collect();
    let primary = proofs.first().ok_or_else(ApiError::forbidden)?;
    let id = Uuid::new_v4();
    state
        .store
        .save_inspected_image_source(
            &principal,
            &snapshot,
            niu_storage::InspectedImageSourceInput {
                id,
                approval_id: primary.receipt_id,
                valid_for_seconds: input.valid_for_seconds,
                runtime: primary.runtime,
                consent: primary.consent,
                approval: primary.approval,
                additional_approvals: &proofs[1..],
            },
            |bytes, aad| {
                cipher
                    .seal_bytes_with_aad(aad, bytes)
                    .map_err(|_| niu_storage::StoreError::InvalidObservation)
            },
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok((
        StatusCode::CREATED,
        Json(
            json!({"data":{"source_id":id,"retained":true,"retention_seconds":input.valid_for_seconds}}),
        ),
    ))
}

pub(crate) async fn erase(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    let principal = state.authorize_api_headers(&headers).await?;
    state
        .store
        .erase_inspected_image_source(&principal, id)
        .await
        .map_err(ApiError::from_store)?;
    // Idempotent and opaque for missing or foreign-key sources.
    Ok(StatusCode::NO_CONTENT)
}
