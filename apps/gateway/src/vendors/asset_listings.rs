//! Platform-only targeted reads of assets in previously saved ordinary groups.
use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    extract::{Path, Query, State},
    http::HeaderMap,
};
use niu_media::{
    asset_list::OrdinaryAssetPage, asset_read::ReadError, asset_signing::AssetManagementSigner,
};
use niu_storage::{ClaimedAssetListing, StoreError, TenantScope};
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
pub struct ListingInput {
    pub organization_id: Uuid,
    pub project_id: Uuid,
    pub intent_id: Uuid,
    pub listing_id: Uuid,
    pub maximum_items: u8,
    pub previous_listing_id: Option<Uuid>,
}
pub async fn list(
    State(state): State<AppState>,
    Path(vendor): Path<Uuid>,
    headers: HeaderMap,
    Json(input): Json<ListingInput>,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    list_with_dispatch(
        state,
        vendor,
        headers,
        input,
        |signer, claimed| async move {
            niu_media::asset_list::list_assets_now(
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
pub(crate) async fn list_with_dispatch<F, Fut>(
    state: AppState,
    vendor: Uuid,
    headers: HeaderMap,
    input: ListingInput,
    send: F,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError>
where
    F: FnOnce(AssetManagementSigner, ClaimedAssetListing) -> Fut + Send + 'static,
    Fut: Future<Output = Result<OrdinaryAssetPage, ReadError>> + Send + 'static,
{
    super::asset_authorizations::platform_actor(&state, &headers).await?;
    if !(1..=100).contains(&input.maximum_items) {
        return Err(ApiError::invalid_request(
            "maximum_items must be between 1 and 100",
        ));
    }
    let scope = TenantScope {
        organization_id: input.organization_id,
        project_id: input.project_id,
    };
    let saved = state
        .store
        .asset_group_create_intent(scope, input.intent_id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    if saved.vendor_id != vendor {
        return Err(ApiError::not_found());
    }
    let cipher = state
        .vendor_cipher
        .clone()
        .ok_or_else(ApiError::unavailable)?;
    let permit = READS
        .clone()
        .try_acquire_owned()
        .map_err(|_| ApiError::asset_management_busy())?;
    let in_flight = state.track_inference();
    let claimed = if let Some(previous) = input.previous_listing_id {
        let (expected_ciphertext, page) = retained_page(&state, scope, vendor, previous).await?;
        let request = page
            .next_request
            .ok_or_else(|| ApiError::from_store(StoreError::Conflict))?;
        if request.maximum_items() != input.maximum_items {
            return Err(ApiError::invalid_request(
                "Continuation must preserve the original page size",
            ));
        }
        state
            .store
            .claim_asset_listing_continuation(
                scope,
                input.intent_id,
                input.listing_id,
                niu_storage::AssetListingContinuation {
                    previous_listing_id: previous,
                    expected_ciphertext,
                    request,
                },
            )
            .await
            .map_err(ApiError::from_store)?
    } else {
        state
            .store
            .claim_asset_listing(
                scope,
                input.intent_id,
                input.listing_id,
                input.maximum_items,
            )
            .await
            .map_err(ApiError::from_store)?
    }
    .ok_or_else(|| ApiError::from_store(StoreError::Conflict))?;
    // Dropping the HTTP future detaches this tracked task; it still records the
    // first outcome. A process crash leaves an unresolved claim, not replay rights.
    let vendor_revision = saved.vendor_revision;
    let credential_revision = saved.credential_revision;
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
        let reason = result.as_ref().err().map(|error| match error {
            ReadError::InvalidConfiguration => "invalid_configuration",
            ReadError::EndpointRejected => "destination_rejected",
            ReadError::Unavailable => "unavailable",
            ReadError::Transport => "transport",
            ReadError::Timeout => "timeout",
            ReadError::ResponseLimit => "response_limit",
            ReadError::InvalidResponse => "invalid_response",
        });
        let duration = i64::try_from(started.elapsed().as_millis()).unwrap_or(i64::MAX);
        match result {
            Ok(details) => {
                let count =
                    u8::try_from(details.items.len()).map_err(|_| ApiError::unavailable())?;
                let has_more = details.next_request.is_some();
                let encoded = details
                    .encode_private(&original_request)
                    .map_err(|_| ApiError::unavailable())?;
                let plaintext =
                    std::str::from_utf8(&encoded).map_err(|_| ApiError::unavailable())?;
                let encrypted = cipher
                    .seal_asset_listing_result(scope, input.listing_id, plaintext)
                    .map_err(|_| ApiError::unavailable())?;
                if !worker_state
                    .store
                    .save_asset_listing_result(
                        scope,
                        input.listing_id,
                        niu_storage::AssetListingOutcome::Succeeded {
                            item_count: count,
                            has_more,
                        },
                        duration,
                        &encrypted,
                    )
                    .await
                    .map_err(ApiError::from_store)?
                {
                    return Err(ApiError::from_store(StoreError::Conflict));
                }
                Ok(())
            }
            Err(_) => {
                worker_state
                    .store
                    .record_asset_listing_outcome(
                        scope,
                        input.listing_id,
                        niu_storage::AssetListingOutcome::Failed {
                            reason: reason.unwrap_or("invalid_response"),
                        },
                        duration,
                    )
                    .await
                    .map_err(ApiError::from_store)?;
                Err(ApiError::unavailable())
            }
        }
    });
    task.await.map_err(|_| ApiError::unavailable())??;
    super::asset_authorizations::platform_actor(&state, &headers).await?;
    if !state
        .store
        .asset_listing_is_qualified(scope, vendor, vendor_revision, credential_revision)
        .await
        .map_err(ApiError::from_store)?
    {
        return Err(ApiError::forbidden());
    }
    saved_result(&state, scope, vendor, input.listing_id).await
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ResultScope {
    organization_id: Uuid,
    project_id: Uuid,
}
async fn saved_result(
    state: &AppState,
    scope: TenantScope,
    vendor: Uuid,
    listing_id: Uuid,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    let (_, page) = retained_page(state, scope, vendor, listing_id).await?;
    let items:Vec<_>=page.items.iter().map(|item|json!({"name":item.name,"status":item.status.as_str(),
        "asset_type":item.asset_type.as_str(),"created_at":item.created_at,"updated_at":item.updated_at,
        "last_inference_at":item.last_inference_at})).collect();
    Ok((
        [("cache-control", "no-store")],
        Json(json!({"data":{"listing_id":listing_id,"items":items,
        "has_more":page.next_request.is_some()}})),
    ))
}

async fn retained_page(
    state: &AppState,
    scope: TenantScope,
    vendor: Uuid,
    listing_id: Uuid,
) -> Result<(Vec<u8>, OrdinaryAssetPage), ApiError> {
    let (encrypted, request) = state
        .store
        .asset_listing_result_context(scope, vendor, listing_id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    let plaintext = state
        .vendor_cipher
        .as_ref()
        .ok_or_else(ApiError::unavailable)?
        .open_asset_listing_result(scope, listing_id, &encrypted)
        .map_err(|_| ApiError::unavailable())?;
    let page = OrdinaryAssetPage::restore_private(plaintext.as_bytes(), &request)
        .map_err(|_| ApiError::unavailable())?;
    Ok((encrypted, page))
}

pub async fn get_result(
    State(state): State<AppState>,
    Path((vendor, listing_id)): Path<(Uuid, Uuid)>,
    Query(query): Query<ResultScope>,
    headers: HeaderMap,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    super::asset_authorizations::platform_actor(&state, &headers).await?;
    saved_result(
        &state,
        TenantScope {
            organization_id: query.organization_id,
            project_id: query.project_id,
        },
        vendor,
        listing_id,
    )
    .await
}
pub async fn delete_result(
    State(state): State<AppState>,
    Path((vendor, listing_id)): Path<(Uuid, Uuid)>,
    Query(query): Query<ResultScope>,
    headers: HeaderMap,
) -> Result<axum::http::StatusCode, ApiError> {
    super::asset_authorizations::platform_actor(&state, &headers).await?;
    state
        .store
        .delete_asset_listing_result(
            TenantScope {
                organization_id: query.organization_id,
                project_id: query.project_id,
            },
            vendor,
            listing_id,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(axum::http::StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HistoryQuery {
    organization_id: Uuid,
    project_id: Uuid,
    after: Option<Uuid>,
    limit: Option<i64>,
}
pub async fn history(
    State(state): State<AppState>,
    Path(vendor): Path<Uuid>,
    Query(query): Query<HistoryQuery>,
    headers: HeaderMap,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    super::asset_authorizations::platform_actor(&state, &headers).await?;
    let limit = query.limit.unwrap_or(30);
    if !(1..=100).contains(&limit) {
        return Err(ApiError::invalid_request("limit must be between 1 and 100"));
    }
    let mut data = state
        .store
        .asset_listing_history(
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
        .then(|| data.last().and_then(|row| row.get("listing_id")).cloned())
        .flatten();
    Ok((
        [("cache-control", "no-store")],
        Json(json!({"data":data,"next_cursor":next_cursor})),
    ))
}
