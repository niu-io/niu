//! Bounded original-account GetAsset observations, never reusable-reference grants.
use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    extract::{Path, State},
    http::HeaderMap,
};
use niu_media::{
    asset_list::OrdinaryAsset, asset_lookup::OrdinaryAssetRead, asset_read::ReadError,
    asset_signing::AssetManagementSigner,
};
use serde_json::{Value, json};
use std::sync::{Arc, LazyLock};
use uuid::Uuid;
pub(crate) static READS: LazyLock<Arc<tokio::sync::Semaphore>> =
    LazyLock::new(|| Arc::new(tokio::sync::Semaphore::new(4)));

pub(crate) async fn status(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((consent, read_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<Value>, ApiError> {
    let principal = state.authorize_api_headers(&headers).await?;
    let status = state
        .store
        .ingested_image_readiness_status(&principal, consent, read_id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(json!({"data":status})))
}
pub(crate) async fn refresh(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((consent, read_id)): Path<(Uuid, Uuid)>,
    body: axum::body::Bytes,
) -> Result<Json<Value>, ApiError> {
    state.authorize_api_headers(&headers).await?;
    super::image_ingestions::validate_command_body(&body)?;
    refresh_with_transport(
        state,
        headers,
        consent,
        read_id,
        |signer, request| async move {
            niu_media::asset_lookup::get_asset_now(
                &signer,
                &request,
                1024 * 1024,
                std::time::Duration::from_secs(30),
            )
            .await
        },
    )
    .await
}
pub(crate) async fn refresh_with_transport<F, Fut>(
    state: AppState,
    headers: HeaderMap,
    consent: Uuid,
    read_id: Uuid,
    send: F,
) -> Result<Json<Value>, ApiError>
where
    F: FnOnce(AssetManagementSigner, OrdinaryAssetRead) -> Fut + Send + 'static,
    Fut: std::future::Future<Output = Result<OrdinaryAsset, ReadError>> + Send + 'static,
{
    let principal = state.authorize_api_headers(&headers).await?;
    let cipher = state
        .vendor_cipher
        .clone()
        .ok_or_else(ApiError::unavailable)?;
    let permit = READS
        .clone()
        .try_acquire_owned()
        .map_err(|_| ApiError::asset_management_busy())?;
    let snapshot = state
        .store
        .guardrail_snapshot(principal.scope(), principal.key_id())
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::forbidden)?;
    let claimed = state
        .store
        .claim_ingested_image_readiness(&principal, &snapshot, consent, read_id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(|| ApiError::from_store(niu_storage::StoreError::Conflict))?;
    let in_flight = state.track_inference();
    let worker = state.clone();
    let task = tokio::spawn(async move {
        let _permit = permit;
        let _in_flight = in_flight;
        let started = std::time::Instant::now();
        let original = claimed.request.clone();
        let result = match cipher.open_asset_management(
            claimed.credential.vendor_id,
            claimed.credential.revision,
            &claimed.credential.upstream_project,
            &claimed.credential.credential_ciphertext,
        ) {
            Ok(signer) => tokio::time::timeout(
                std::time::Duration::from_secs(35),
                send(signer, claimed.request),
            )
            .await
            .unwrap_or(Err(ReadError::Timeout)),
            Err(_) => Err(ReadError::InvalidConfiguration),
        }
        .and_then(|asset| {
            let status = asset.status;
            // Revalidate identity, group, project and media type even for an
            // internally substituted transport. No raw result is persisted.
            original.encode_private_result(asset)?;
            Ok(status)
        });
        let observation = match &result {
            Ok(status) => Ok(*status),
            Err(error) => Err(match error {
                ReadError::InvalidConfiguration => "invalid_configuration",
                ReadError::EndpointRejected => "destination_rejected",
                ReadError::Unavailable => "unavailable",
                ReadError::Transport => "transport",
                ReadError::Timeout => "timeout",
                ReadError::ResponseLimit => "response_limit",
                ReadError::InvalidResponse => "invalid_response",
            }),
        };
        let duration = i64::try_from(started.elapsed().as_millis()).unwrap_or(i64::MAX);
        if !worker
            .store
            .finish_ingested_image_readiness(&principal, read_id, observation, duration)
            .await
            .map_err(ApiError::from_store)?
        {
            return Err(ApiError::from_store(niu_storage::StoreError::Conflict));
        }
        worker
            .store
            .ingested_image_readiness_status(&principal, consent, read_id)
            .await
            .map_err(ApiError::from_store)?
            .ok_or_else(ApiError::not_found)
    });
    let observed = task.await.map_err(|_| ApiError::unavailable())??;
    state.authorize_api_headers(&headers).await?;
    Ok(Json(json!({"data":observed})))
}
