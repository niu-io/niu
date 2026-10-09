//! Current-access result retrieval. Never return a private signed URL.
use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
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
    LazyLock::new(|| Arc::new(tokio::sync::Semaphore::new(4)));
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
    let kind = kind(result_kind)?;
    authorize(state, principal, id).await?;
    let scope = principal.scope();
    let encrypted = state
        .store
        .media_result_reference(scope, id, kind)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    let cipher = state
        .vendor_cipher
        .as_ref()
        .ok_or_else(ApiError::unavailable)?;
    let url = cipher
        .open_media_result(scope, id, kind, &encrypted)
        .map_err(|_| ApiError::unavailable())?;
    let _permit = DOWNLOADS
        .clone()
        .try_acquire_owned()
        .map_err(|_| ApiError::media_result_busy())?;
    let (transport_kind, maximum_bytes) = match kind {
        MediaResultKind::Video => (niu_media::result::ResultKind::Video, 64 * 1024 * 1024),
        MediaResultKind::LastFrame => (niu_media::result::ResultKind::LastFrame, 10 * 1024 * 1024),
    };
    let route = state
        .store
        .media_recovery_route(scope, id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
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
    }
    .map_err(ApiError::from_media_result)?;
    // Recheck after network work: expiry, deletion and current grants can change
    // while a large result is downloading. Do not deliver that stale access.
    authorize(state, principal, id).await?;
    if state
        .store
        .media_result_reference(scope, id, kind)
        .await
        .map_err(ApiError::from_store)?
        .as_deref()
        != Some(encrypted.as_slice())
    {
        return Err(ApiError::not_found());
    }
    let filename = match media.content_type {
        "video/mp4" => "attachment; filename=video.mp4",
        "video/webm" => "attachment; filename=video.webm",
        "image/png" => "attachment; filename=last-frame.png",
        _ => "attachment; filename=last-frame.jpg",
    };
    Ok((
        [
            (header::CONTENT_TYPE, media.content_type),
            (header::CONTENT_DISPOSITION, filename),
            (header::CACHE_CONTROL, "private, no-store"),
            (header::X_CONTENT_TYPE_OPTIONS, "nosniff"),
        ],
        media.bytes,
    )
        .into_response())
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
    let principal = state.authorize_api_headers(&headers).await?;
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
    let principal = state.authorize_api_headers(&headers).await?;
    availability_as(&state, &principal, id).await
}
