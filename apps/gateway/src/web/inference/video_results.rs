//! Current-access result retrieval. Never return a private signed URL.
use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    body::{Body, Bytes},
    extract::{Path, State},
    http::{HeaderMap, header},
    response::{IntoResponse, Response},
};
use niu_storage::{MediaResultKind, Principal};
use std::{
    sync::{Arc, LazyLock},
    time::Duration,
};
use uuid::Uuid;
static DOWNLOADS: LazyLock<Arc<tokio::sync::Semaphore>> =
    LazyLock::new(|| Arc::new(tokio::sync::Semaphore::new(32)));
/// Bound total buffered downstream delivery memory (4096 * 64 KiB = 256 MiB)
/// independently of upstream fetch concurrency so slow client reads cannot
/// starve upstream downloads.
static DELIVERY_CHUNKS: LazyLock<Arc<tokio::sync::Semaphore>> =
    LazyLock::new(|| Arc::new(tokio::sync::Semaphore::new(4096)));
fn kind(value: &str) -> Result<MediaResultKind, ApiError> {
    match value {
        "video" => Ok(MediaResultKind::Video),
        "last_frame" => Ok(MediaResultKind::LastFrame),
        _ => Err(ApiError::invalid_request("Unknown video result kind")),
    }
}
async fn authorize(state: &AppState, principal: &Principal, id: Uuid) -> Result<(), ApiError> {
    let current = state
        .store
        .dashboard_key(principal.scope(), principal.key_id())
        .await
        .map_err(ApiError::from_store)?;
    let current = state.authorize_key_source(current).await?;
    let principal = &current;
    let saved = state
        .store
        .media_job_state_for_key(principal, id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    let snapshot = state
        .store
        .guardrail_snapshot(principal.scope(), principal.key_id())
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::forbidden)?;
    let route = state
        .store
        .media_recovery_route(principal.scope(), id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    if !super::video::policy_permits_video(
        &snapshot,
        saved["model"].as_str().ok_or_else(ApiError::not_found)?,
        &route.adapter,
    ) {
        return Err(ApiError::forbidden());
    }
    Ok(())
}
pub(super) async fn retrieve_as(
    state: &AppState,
    principal: &Principal,
    id: Uuid,
    result_kind: &str,
) -> Result<Response, ApiError> {
    retrieve_authorized(
        state,
        principal.scope(),
        Some(principal),
        None,
        id,
        result_kind,
        DeliveryOptions::default(),
    )
    .await
}
pub(super) async fn retrieve_verified_history(
    state: &AppState,
    scope: niu_storage::TenantScope,
    owner: &str,
    id: Uuid,
    result_kind: &str,
) -> Result<Response, ApiError> {
    retrieve_authorized(
        state,
        scope,
        None,
        Some(owner),
        id,
        result_kind,
        DeliveryOptions {
            pre_verified_owner: true,
            ..DeliveryOptions::default()
        },
    )
    .await
}
pub(super) async fn authorize_delivery(
    state: &AppState,
    scope: niu_storage::TenantScope,
    principal: Option<&Principal>,
    owner: Option<&str>,
    id: Uuid,
) -> Result<(), ApiError> {
    if let Some(principal) = principal {
        authorize(state, principal, id).await?;
    }
    if owner.is_none() && principal.is_some() {
        return Ok(());
    }
    state
        .store
        .generation_task(scope, owner.ok_or_else(ApiError::forbidden)?, id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(())
}
#[derive(Default)]
struct DeliveryOptions {
    fresh: Option<Vec<u8>>,
    maximum_bytes: Option<usize>,
    pre_verified_owner: bool,
}

async fn retrieve_authorized_media(
    state: &AppState,
    scope: niu_storage::TenantScope,
    principal: Option<&Principal>,
    owner: Option<&str>,
    id: Uuid,
    result_kind: &str,
    options: DeliveryOptions,
) -> Result<
    (
        niu_media::result::ResultMedia,
        tokio::sync::OwnedSemaphorePermit,
    ),
    ApiError,
> {
    let DeliveryOptions {
        fresh,
        maximum_bytes: capture_limit,
        pre_verified_owner,
    } = options;
    let kind = kind(result_kind)?;
    if !pre_verified_owner || principal.is_some() {
        authorize_delivery(state, scope, principal, owner, id).await?;
    }
    let is_fresh = fresh.is_some();
    let encrypted = if let Some(value) = fresh {
        value
    } else {
        state
            .store
            .media_result_reference(scope, id, kind)
            .await
            .map_err(ApiError::from_store)?
            .ok_or_else(ApiError::not_found)?
    };
    let cipher = state
        .vendor_cipher
        .as_ref()
        .ok_or_else(ApiError::unavailable)?;
    let url = cipher
        .open_media_result(scope, id, kind, &encrypted)
        .map_err(|_| ApiError::unavailable())?;
    let permit = match DOWNLOADS.clone().try_acquire_owned() {
        Ok(permit) => permit,
        Err(_) => tokio::time::timeout(
            Duration::from_millis(250),
            DOWNLOADS.clone().acquire_owned(),
        )
        .await
        .ok()
        .and_then(Result::ok)
        .ok_or_else(ApiError::media_result_busy)?,
    };
    let (transport_kind, maximum_bytes) = match kind {
        MediaResultKind::Video => (niu_media::result::ResultKind::Video, 64 * 1024 * 1024),
        MediaResultKind::LastFrame => (niu_media::result::ResultKind::LastFrame, 10 * 1024 * 1024),
    };
    let maximum_bytes = capture_limit.map_or(maximum_bytes, |limit| limit.min(maximum_bytes));
    let route = state
        .store
        .media_recovery_route(scope, id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    let clock = super::video::TransportClock::start();
    let media = if route.channel == niu_media::openrouter::REVISION {
        if kind != MediaResultKind::Video || route.adapter != "openrouter" {
            return Err(ApiError::not_found());
        }
        let token = cipher
            .open(route.vendor_id, &route.credential_ciphertext)
            .map_err(|_| ApiError::unavailable())?;
        niu_media::openrouter::fetch_result(
            &route.api_base,
            &token,
            &route.upstream_job_id,
            &url,
            maximum_bytes,
            Duration::from_secs(60),
        )
        .await
    } else {
        niu_media::result::fetch_result(
            &url,
            transport_kind,
            maximum_bytes,
            Duration::from_secs(60),
        )
        .await
    };
    let upstream_http_status = match &media {
        Err(niu_media::result::ResultError::HttpStatus(status)) => Some(i32::from(*status)),
        _ => None,
    };
    clock
        .save(
            state,
            scope,
            id,
            "result",
            media.is_ok(),
            upstream_http_status,
        )
        .await;
    // Upstream fetch is complete; release the upstream download slot so slow
    // client reads cannot block other upstream fetches.
    drop(permit);
    let media = media.map_err(ApiError::from_media_result)?;
    let needed_chunks =
        u32::try_from(media.bytes.len().div_ceil(64 * 1024).max(1)).unwrap_or(u32::MAX);
    let delivery_permit = DELIVERY_CHUNKS
        .clone()
        .try_acquire_many_owned(needed_chunks)
        .map_err(|_| ApiError::media_result_busy())?;
    // Recheck after network work: expiry, deletion and current grants can change
    // while a large result is downloading. Do not deliver that stale access.
    authorize_delivery(state, scope, principal, owner, id).await?;
    if !is_fresh
        && state
            .store
            .media_result_reference(scope, id, kind)
            .await
            .map_err(ApiError::from_store)?
            .as_deref()
            != Some(encrypted.as_slice())
    {
        return Err(ApiError::not_found());
    }
    Ok((media, delivery_permit))
}

async fn retrieve_authorized(
    state: &AppState,
    scope: niu_storage::TenantScope,
    principal: Option<&Principal>,
    owner: Option<&str>,
    id: Uuid,
    result_kind: &str,
    options: DeliveryOptions,
) -> Result<Response, ApiError> {
    let (media, delivery_permit) =
        retrieve_authorized_media(state, scope, principal, owner, id, result_kind, options).await?;
    let filename = match media.content_type {
        "video/mp4" => "attachment; filename=video.mp4",
        "video/webm" => "attachment; filename=video.webm",
        "image/png" => "attachment; filename=last-frame.png",
        _ => "attachment; filename=last-frame.jpg",
    };
    let length = media.bytes.len();
    let shared_bytes = Bytes::from(media.bytes);
    let chunks = futures_util::stream::unfold(
        (shared_bytes, 0, delivery_permit),
        |(bytes, offset, permit)| async move {
            if offset == bytes.len() {
                return None;
            }
            let end = (offset + 64 * 1024).min(bytes.len());
            let chunk = bytes.slice(offset..end);
            Some((
                Ok::<_, std::convert::Infallible>(chunk),
                (bytes, end, permit),
            ))
        },
    );
    let mut response = (
        [
            (header::CONTENT_TYPE, media.content_type),
            (header::CONTENT_DISPOSITION, filename),
            (header::CACHE_CONTROL, "private, no-store"),
            (header::X_CONTENT_TYPE_OPTIONS, "nosniff"),
        ],
        Body::from_stream(chunks),
    )
        .into_response();
    response
        .headers_mut()
        .insert(header::CONTENT_LENGTH, length.into());
    Ok(response)
}
pub(super) async fn delete_as(
    state: &AppState,
    principal: &Principal,
    id: Uuid,
) -> Result<Json<serde_json::Value>, ApiError> {
    // Deletion needs current job access, but must remain available even when a
    // newly mandatory inspection policy prevents delivering saved media.
    state
        .store
        .media_job_state_for_key(principal, id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    state
        .store
        .delete_media_result_references(principal.scope(), id)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(serde_json::json!({"deleted":true})))
}
pub(in crate::web) async fn retrieve(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((id, kind)): Path<(Uuid, String)>,
) -> Result<Response, ApiError> {
    let principal = state
        .authorize_api_headers_with_permission(&headers, niu_storage::AdminPermission::Read)
        .await?;
    retrieve_as(&state, &principal, id, &kind).await
}
pub(in crate::web) async fn delete(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let principal = state.authorize_api_headers(&headers).await?;
    delete_as(&state, &principal, id).await
}

pub(super) async fn availability_as(
    state: &AppState,
    principal: &Principal,
    id: Uuid,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorize(state, principal, id).await?;
    state
        .store
        .media_result_availability(principal.scope(), id)
        .await
        .map_err(ApiError::from_store)?
        .map(Json)
        .ok_or_else(ApiError::not_found)
}
pub(in crate::web) async fn availability(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let principal = state
        .authorize_api_headers_with_permission(&headers, niu_storage::AdminPermission::Read)
        .await?;
    availability_as(&state, &principal, id).await
}

/// ```openapi
/// {
///   "path": "/v1/video/jobs/{id}/results/{kind}/refresh",
///   "method": "post",
///   "operation": {
///     "operationId": "retrieveFreshVideoResult",
///     "x-niu-implementation": "implemented",
///     "summary": "Retrieve fresh output from the original Video task",
///     "description": "Explicitly queries the original upstream video task once using the immutable original Provider/account/model/channel binding and delivers bounded media bytes without rewriting cached references. Requires a current workspace API key or a workspace session with X-Niu-Key-Id and Write permission.",
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
///         "name": "id",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "kind",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "enum": [
///             "video",
///             "last_frame"
///           ]
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Bounded media bytes",
///         "content": {
///           "video/mp4": {
///             "schema": {
///               "type": "string",
///               "format": "binary"
///             }
///           },
///           "video/webm": {
///             "schema": {
///               "type": "string",
///               "format": "binary"
///             }
///           },
///           "image/png": {
///             "schema": {
///               "type": "string",
///               "format": "binary"
///             }
///           },
///           "image/jpeg": {
///             "schema": {
///               "type": "string",
///               "format": "binary"
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid kind or request"
///       },
///       "401": {
///         "description": "Invalid, expired or revoked credential"
///       },
///       "403": {
///         "description": "Permission or guardrail policy denied"
///       },
///       "404": {
///         "description": "Task or requested result missing"
///       },
///       "409": {
///         "description": "Original Provider binding changed or query already claimed"
///       },
///       "502": {
///         "description": "Upstream query or result delivery failed"
///       },
///       "503": {
///         "description": "Storage or bounded delivery unavailable"
///       },
///       "504": {
///         "description": "Upstream query or delivery timed out"
///       }
///     }
///   }
/// }
/// ```
pub(in crate::web) async fn retrieve_fresh(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((id, kind)): Path<(Uuid, String)>,
) -> Result<Response, ApiError> {
    let principal = state.authorize_api_headers(&headers).await?;
    retrieve_fresh_as(&state, &principal, id, &kind).await
}

/// Deliberate retrieval from the original task, not a generation or automatic retry.
/// Expired/deleted cached references remain untouched; this is a new bounded delivery.
pub(super) async fn retrieve_fresh_as(
    state: &AppState,
    principal: &Principal,
    id: Uuid,
    result_kind: &str,
) -> Result<Response, ApiError> {
    let requested = kind(result_kind)?;
    authorize(state, principal, id).await?;
    let (_, results) = super::video::refresh_with_results(state, principal, id).await?;
    let encrypted = results
        .into_iter()
        .find(|(k, _)| *k == requested)
        .map(|(_, value)| value)
        .ok_or_else(ApiError::not_found)?;
    retrieve_authorized(
        state,
        principal.scope(),
        Some(principal),
        None,
        id,
        result_kind,
        DeliveryOptions {
            fresh: Some(encrypted),
            maximum_bytes: None,
            pre_verified_owner: false,
        },
    )
    .await
}

/// Bounded byte capture shares original result transport and enforces actor
/// privacy both before querying and after download. A selected current key
/// authorizes fresh recovery only; Provider/model/channel always remain pinned.
pub(super) async fn retrieve_capture(
    state: &AppState,
    scope: niu_storage::TenantScope,
    owner: &str,
    principal: Option<&Principal>,
    id: Uuid,
    result_kind: &str,
) -> Result<niu_media::result::ResultMedia, ApiError> {
    let requested = kind(result_kind)?;
    authorize_delivery(state, scope, principal, Some(owner), id).await?;
    let fresh = if let Some(principal) = principal {
        let (_, results) = super::video::refresh_with_results(state, principal, id).await?;
        Some(
            results
                .into_iter()
                .find(|(kind, _)| *kind == requested)
                .map(|(_, bytes)| bytes)
                .ok_or_else(ApiError::not_found)?,
        )
    } else {
        None
    };
    let (media, _delivery_permit) = retrieve_authorized_media(
        state,
        scope,
        principal,
        Some(owner),
        id,
        result_kind,
        DeliveryOptions {
            fresh,
            maximum_bytes: Some(niu_media::workspace_asset_validation::MAX_ASSET_BYTES),
            pre_verified_owner: true,
        },
    )
    .await?;
    Ok(media)
}
