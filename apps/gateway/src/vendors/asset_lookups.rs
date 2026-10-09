//! Platform-only original-page lookups. No reusable-reference or readiness grant.
use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    extract::{Path, Query, State},
    http::HeaderMap,
};
use niu_media::{
    asset_list::{OrdinaryAsset, OrdinaryAssetPage},
    asset_read::ReadError,
    asset_signing::AssetManagementSigner,
};
use niu_storage::{AssetLookupOutcome, ClaimedAssetLookup, StoreError, TenantScope};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    future::Future,
    sync::{Arc, LazyLock},
    time::Duration,
};
use tokio::sync::Semaphore;
use uuid::Uuid;
static READS: LazyLock<Arc<Semaphore>> = LazyLock::new(|| Arc::new(Semaphore::new(4)));
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LookupInput {
    pub organization_id: Uuid,
    pub project_id: Uuid,
    pub listing_id: Uuid,
    pub lookup_id: Uuid,
    pub item_index: u8,
}
pub async fn lookup(
    State(state): State<AppState>,
    Path(vendor): Path<Uuid>,
    headers: HeaderMap,
    Json(input): Json<LookupInput>,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    lookup_with_dispatch(
        state,
        vendor,
        headers,
        input,
        |signer, claimed| async move {
            niu_media::asset_lookup::get_asset_now(
                &signer,
                claimed.request(),
                1024 * 1024,
                Duration::from_secs(30),
            )
            .await
        },
    )
    .await
}
pub(crate) async fn lookup_with_dispatch<F, Fut>(
    state: AppState,
    vendor: Uuid,
    headers: HeaderMap,
    input: LookupInput,
    send: F,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError>
where
    F: FnOnce(AssetManagementSigner, ClaimedAssetLookup) -> Fut + Send + 'static,
    Fut: Future<Output = Result<OrdinaryAsset, ReadError>> + Send + 'static,
{
    super::asset_authorizations::platform_actor(&state, &headers).await?;
    if input.item_index > 99 {
        return Err(ApiError::invalid_request(
            "item_index must be between 0 and 99",
        ));
    }
    let scope = TenantScope {
        organization_id: input.organization_id,
        project_id: input.project_id,
    };
    let cipher = state
        .vendor_cipher
        .clone()
        .ok_or_else(ApiError::unavailable)?;
    let permit = READS
        .clone()
        .try_acquire_owned()
        .map_err(|_| ApiError::asset_management_busy())?;
    let in_flight = state.track_inference();
    let claimed = state
        .store
        .claim_asset_lookup(
            scope,
            vendor,
            input.listing_id,
            input.lookup_id,
            input.item_index,
            |bytes, request| {
                let plaintext = cipher
                    .open_asset_listing_result(scope, input.listing_id, bytes)
                    .map_err(|_| StoreError::InvalidObservation)?;
                OrdinaryAssetPage::restore_private(plaintext.as_bytes(), request)
                    .map_err(|_| StoreError::InvalidObservation)
            },
        )
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(|| ApiError::from_store(StoreError::Conflict))?;
    let worker_state = state.clone();
    let task = tokio::spawn(async move {
        let _permit = permit;
        let _in_flight = in_flight;
        let started = std::time::Instant::now();
        let original_request = claimed.request().clone();
        let result = match cipher.open_asset_management(
            vendor,
            claimed.credential.revision,
            &claimed.credential.upstream_project,
            &claimed.credential.credential_ciphertext,
        ) {
            Ok(signer) => tokio::time::timeout(Duration::from_secs(35), send(signer, claimed))
                .await
                .unwrap_or(Err(ReadError::Timeout)),
            Err(_) => Err(ReadError::InvalidConfiguration),
        };
        let result = result.and_then(|asset| {
            let status = asset.status;
            let encoded = original_request.encode_private_result(asset)?;
            let plaintext =
                std::str::from_utf8(&encoded).map_err(|_| ReadError::InvalidResponse)?;
            let encrypted = cipher
                .seal_asset_lookup_result(scope, input.lookup_id, plaintext)
                .map_err(|_| ReadError::InvalidConfiguration)?;
            Ok((status, encrypted))
        });
        let duration = i64::try_from(started.elapsed().as_millis()).unwrap_or(i64::MAX);
        match result {
            Ok((status, encrypted)) => {
                if !worker_state
                    .store
                    .save_asset_lookup_result(scope, input.lookup_id, status, duration, &encrypted)
                    .await
                    .map_err(ApiError::from_store)?
                {
                    return Err(ApiError::from_store(StoreError::Conflict));
                }
                Ok(status.as_str())
            }
            Err(error) => {
                let reason = match error {
                    ReadError::InvalidConfiguration => "invalid_configuration",
                    ReadError::EndpointRejected => "destination_rejected",
                    ReadError::Unavailable => "unavailable",
                    ReadError::Transport => "transport",
                    ReadError::Timeout => "timeout",
                    ReadError::ResponseLimit => "response_limit",
                    ReadError::InvalidResponse => "invalid_response",
                };
                worker_state
                    .store
                    .record_asset_lookup_outcome(
                        scope,
                        input.lookup_id,
                        AssetLookupOutcome::Failed { reason },
                        duration,
                    )
                    .await
                    .map_err(ApiError::from_store)?;
                Err(ApiError::unavailable())
            }
        }
    });
    let observed = task.await.map_err(|_| ApiError::unavailable())??;
    super::asset_authorizations::platform_actor(&state, &headers).await?;
    Ok((
        [("cache-control", "no-store")],
        Json(
            json!({"data":{"lookup_id":input.lookup_id,"status":"succeeded","asset_status":observed}}),
        ),
    ))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HistoryScope {
    organization_id: Uuid,
    project_id: Uuid,
    after: Option<Uuid>,
    limit: Option<i64>,
}
pub async fn history(
    State(state): State<AppState>,
    Path(vendor): Path<Uuid>,
    Query(query): Query<HistoryScope>,
    headers: HeaderMap,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    super::asset_authorizations::platform_actor(&state, &headers).await?;
    let limit = query.limit.unwrap_or(30);
    if !(1..=100).contains(&limit) {
        return Err(ApiError::invalid_request("limit must be between 1 and 100"));
    }
    let mut data = state
        .store
        .asset_lookup_history(
            TenantScope {
                organization_id: query.organization_id,
                project_id: query.project_id,
            },
            vendor,
            query.after,
            limit + 1,
        )
        .await
        .map_err(ApiError::from_store)?;
    let has_more = data.len() > limit as usize;
    data.truncate(limit as usize);
    let next_cursor = has_more
        .then(|| data.last().and_then(|row| row.get("lookup_id")).cloned())
        .flatten();
    Ok((
        [("cache-control", "no-store")],
        Json(json!({"data":data,"next_cursor":next_cursor})),
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ResultScope {
    organization_id: Uuid,
    project_id: Uuid,
}
pub async fn get_result(
    State(state): State<AppState>,
    Path((vendor, lookup)): Path<(Uuid, Uuid)>,
    Query(query): Query<ResultScope>,
    headers: HeaderMap,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    super::asset_authorizations::platform_actor(&state, &headers).await?;
    let scope = TenantScope {
        organization_id: query.organization_id,
        project_id: query.project_id,
    };
    let (encrypted, request) = state
        .store
        .asset_lookup_result_context(scope, vendor, lookup)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    let plaintext = state
        .vendor_cipher
        .as_ref()
        .ok_or_else(ApiError::unavailable)?
        .open_asset_lookup_result(scope, lookup, &encrypted)
        .map_err(|_| ApiError::unavailable())?;
    let mut page = OrdinaryAssetPage::restore_private(plaintext.as_bytes(), &request)
        .map_err(|_| ApiError::unavailable())?;
    if page.items.len() != 1 || page.next_request.is_some() {
        return Err(ApiError::unavailable());
    }
    let item = page.items.remove(0);
    Ok((
        [("cache-control", "no-store")],
        Json(json!({"data":{"lookup_id":lookup,"asset":{
            "name":item.name,"status":item.status.as_str(),"asset_type":item.asset_type.as_str(),
            "created_at":item.created_at,"updated_at":item.updated_at,"last_inference_at":item.last_inference_at
        }}})),
    ))
}
pub async fn delete_result(
    State(state): State<AppState>,
    Path((vendor, lookup)): Path<(Uuid, Uuid)>,
    Query(query): Query<ResultScope>,
    headers: HeaderMap,
) -> Result<axum::http::StatusCode, ApiError> {
    super::asset_authorizations::platform_actor(&state, &headers).await?;
    state
        .store
        .delete_asset_lookup_result(
            TenantScope {
                organization_id: query.organization_id,
                project_id: query.project_id,
            },
            vendor,
            lookup,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(axum::http::StatusCode::NO_CONTENT)
}
