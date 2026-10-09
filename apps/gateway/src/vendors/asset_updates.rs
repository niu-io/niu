//! Platform-only ordinary metadata mutations. One claim, no automatic replay.
use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
};
use niu_storage::{PreparedAssetGroupUpdate, TenantScope};
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use uuid::Uuid;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PrepareInput {
    pub organization_id: Uuid,
    pub project_id: Uuid,
    pub intent_id: Uuid,
    pub update_id: Uuid,
    #[serde(default, deserialize_with = "metadata_field")]
    pub name: Option<String>,
    #[serde(default, deserialize_with = "metadata_field")]
    pub description: Option<String>,
}
fn metadata_field<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<String>, D::Error> {
    String::deserialize(deserializer).map(Some)
}
pub async fn prepare(
    State(state): State<AppState>,
    Path(vendor): Path<Uuid>,
    headers: HeaderMap,
    Json(input): Json<PrepareInput>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    super::asset_authorizations::platform_actor(&state, &headers).await?;
    let scope = TenantScope {
        organization_id: input.organization_id,
        project_id: input.project_id,
    };
    let request = state
        .store
        .asset_group_update_request(
            scope,
            vendor,
            input.intent_id,
            input.name,
            input.description,
        )
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    let plaintext = request
        .encode_private()
        .map_err(|_| ApiError::invalid_request("Invalid ordinary group metadata"))?;
    let text = std::str::from_utf8(&plaintext).map_err(|_| ApiError::unavailable())?;
    let cipher = state
        .vendor_cipher
        .as_ref()
        .ok_or_else(ApiError::unavailable)?;
    let ciphertext = cipher
        .seal_asset_update_patch(scope, input.update_id, text)
        .map_err(|_| ApiError::unavailable())?;
    let inserted = state
        .store
        .prepare_asset_group_update(
            scope,
            PreparedAssetGroupUpdate {
                intent_id: input.intent_id,
                update_id: input.update_id,
                patch_sha256: Sha256::digest(&plaintext).into(),
                ciphertext,
            },
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok((
        if inserted {
            StatusCode::CREATED
        } else {
            StatusCode::OK
        },
        Json(
            json!({"data":{"update_id":input.update_id,"prepared":true,"dispatch_available":false}}),
        ),
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DispatchInput {
    pub organization_id: Uuid,
    pub project_id: Uuid,
}
static UPDATES: std::sync::LazyLock<std::sync::Arc<tokio::sync::Semaphore>> =
    std::sync::LazyLock::new(|| std::sync::Arc::new(tokio::sync::Semaphore::new(4)));
pub async fn dispatch(
    State(state): State<AppState>,
    Path((vendor, update)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    Json(input): Json<DispatchInput>,
) -> Result<Json<Value>, ApiError> {
    dispatch_with_transport(
        state,
        vendor,
        update,
        headers,
        input,
        |signer, claimed| async move {
            niu_media::asset_group_update::update_group_now(
                &signer,
                claimed.request(),
                1024 * 1024,
                std::time::Duration::from_secs(30),
            )
            .await
        },
    )
    .await
}
/// Controlled transport substitution is internal; no client endpoint overrides.
pub(crate) async fn dispatch_with_transport<F, Fut>(
    state: AppState,
    vendor: Uuid,
    update: Uuid,
    headers: HeaderMap,
    input: DispatchInput,
    send: F,
) -> Result<Json<Value>, ApiError>
where
    F: FnOnce(
            niu_media::asset_signing::AssetManagementSigner,
            niu_storage::ClaimedAssetGroupUpdate,
        ) -> Fut
        + Send
        + 'static,
    Fut:
        std::future::Future<Output = Result<(), niu_media::asset_read::ReadError>> + Send + 'static,
{
    use niu_media::asset_read::ReadError;
    super::asset_authorizations::platform_actor(&state, &headers).await?;
    let scope = TenantScope {
        organization_id: input.organization_id,
        project_id: input.project_id,
    };
    if !state
        .store
        .asset_group_update_belongs_to(scope, vendor, update)
        .await
        .map_err(ApiError::from_store)?
    {
        return Err(ApiError::not_found());
    }
    let cipher = state
        .vendor_cipher
        .clone()
        .ok_or_else(ApiError::unavailable)?;
    let permit = UPDATES
        .clone()
        .try_acquire_owned()
        .map_err(|_| ApiError::asset_management_busy())?;
    let in_flight = state.track_inference();
    let claimed = state
        .store
        .claim_asset_group_update(scope, update, |bytes| {
            cipher
                .open_asset_update_patch(scope, update, bytes)
                .map(String::into_bytes)
                .map_err(|_| niu_storage::StoreError::InvalidObservation)
        })
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(|| ApiError::from_store(niu_storage::StoreError::Conflict))?;
    let worker = state.clone();
    let task = tokio::spawn(async move {
        let _permit = permit;
        let _in_flight = in_flight;
        let started = std::time::Instant::now();
        let result = match cipher.open_asset_management(
            vendor,
            claimed.credential.revision,
            &claimed.credential.upstream_project,
            &claimed.credential.credential_ciphertext,
        ) {
            Ok(signer) => {
                tokio::time::timeout(std::time::Duration::from_secs(35), send(signer, claimed))
                    .await
                    .unwrap_or(Err(ReadError::Timeout))
            }
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
        let outcome = match reason {
            Some(reason) => niu_storage::AssetGroupUpdateOutcome::Uncertain { reason },
            None => niu_storage::AssetGroupUpdateOutcome::Acknowledged,
        };
        let duration = i64::try_from(started.elapsed().as_millis()).unwrap_or(i64::MAX);
        if !worker
            .store
            .record_asset_group_update_outcome(scope, update, outcome, duration)
            .await
            .map_err(ApiError::from_store)?
        {
            return Err(ApiError::from_store(niu_storage::StoreError::Conflict));
        }
        Ok::<_, ApiError>(reason.is_none())
    });
    let acknowledged = task.await.map_err(|_| ApiError::unavailable())??;
    super::asset_authorizations::platform_actor(&state, &headers).await?;
    Ok(Json(
        json!({"data":{"update_id":update,"status":if acknowledged{"acknowledged"}else{"uncertain"},"reconciliation_required":true}}),
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReconcileInput {
    pub organization_id: Uuid,
    pub project_id: Uuid,
    pub read_id: Uuid,
}
pub async fn reconcile(
    State(state): State<AppState>,
    Path((vendor, update)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    Json(input): Json<ReconcileInput>,
) -> Result<Json<Value>, ApiError> {
    reconcile_with_transport(
        state,
        vendor,
        update,
        headers,
        input,
        |signer, claimed| async move {
            niu_media::asset_read::get_group_now(
                &signer,
                claimed.request(),
                1024 * 1024,
                std::time::Duration::from_secs(30),
            )
            .await
        },
    )
    .await
}
pub(crate) async fn reconcile_with_transport<F, Fut>(
    state: AppState,
    vendor: Uuid,
    update: Uuid,
    headers: HeaderMap,
    input: ReconcileInput,
    send: F,
) -> Result<Json<Value>, ApiError>
where
    F: FnOnce(
            niu_media::asset_signing::AssetManagementSigner,
            niu_storage::ClaimedAssetGroupRead,
        ) -> Fut
        + Send
        + 'static,
    Fut: std::future::Future<
            Output = Result<
                niu_media::asset_read::OrdinaryGroupDetails,
                niu_media::asset_read::ReadError,
            >,
        > + Send
        + 'static,
{
    super::asset_authorizations::platform_actor(&state, &headers).await?;
    let scope = TenantScope {
        organization_id: input.organization_id,
        project_id: input.project_id,
    };
    let intent = state
        .store
        .asset_group_update_original_intent(scope, vendor, update)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    let cipher = state
        .vendor_cipher
        .clone()
        .ok_or_else(ApiError::unavailable)?;
    // A worker may have saved the read before a process interruption. Reuse
    // that exact authorized snapshot rather than dispatching it a second time.
    let recovered = state
        .store
        .reconcile_asset_group_update(scope, update, input.read_id, |patch, read| {
            let patch = cipher
                .open_asset_update_patch(scope, update, patch)
                .map_err(|_| niu_storage::StoreError::InvalidObservation)?
                .into_bytes();
            let plaintext = cipher
                .open_asset_read_result(scope, input.read_id, read)
                .map_err(|_| niu_storage::StoreError::InvalidObservation)?;
            Ok((
                patch,
                super::asset_reads::restore_saved_metadata(&plaintext, input.read_id)?,
            ))
        })
        .await
        .map_err(ApiError::from_store)?;
    if recovered {
        return Ok(Json(
            json!({"data":{"update_id":update,"status":"reconciled","reconciliation_required":false}}),
        ));
    }
    let _ = super::asset_reads::read_bound_with_dispatch(
        state,
        vendor,
        headers,
        super::asset_reads::ReadInput {
            organization_id: input.organization_id,
            project_id: input.project_id,
            intent_id: intent,
            read_id: input.read_id,
        },
        Some(update),
        send,
    )
    .await?;
    Ok(Json(
        json!({"data":{"update_id":update,"status":"reconciled","reconciliation_required":false}}),
    ))
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
) -> Result<Json<Value>, ApiError> {
    super::asset_authorizations::platform_actor(&state, &headers).await?;
    let limit = query.limit.unwrap_or(30);
    if !(1..=100).contains(&limit) {
        return Err(ApiError::invalid_request("limit must be between 1 and 100"));
    }
    let scope = TenantScope {
        organization_id: query.organization_id,
        project_id: query.project_id,
    };
    let mut data = state
        .store
        .asset_group_update_history(scope, vendor, query.after, limit + 1)
        .await
        .map_err(ApiError::from_store)?;
    let more = data.len() > limit as usize;
    data.truncate(limit as usize);
    let next_cursor = more
        .then(|| data.last().and_then(|row| row.get("update_id")).cloned())
        .flatten();
    Ok(Json(json!({"data":data,"next_cursor":next_cursor})))
}
pub async fn delete_patch(
    State(state): State<AppState>,
    Path((vendor, update)): Path<(Uuid, Uuid)>,
    Query(input): Query<DispatchInput>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    super::asset_authorizations::platform_actor(&state, &headers).await?;
    let scope = TenantScope {
        organization_id: input.organization_id,
        project_id: input.project_id,
    };
    if !state
        .store
        .asset_group_update_belongs_to(scope, vendor, update)
        .await
        .map_err(ApiError::from_store)?
    {
        return Err(ApiError::not_found());
    }
    state
        .store
        .delete_asset_group_update_patch(scope, update)
        .await
        .map_err(ApiError::from_store)?;
    Ok(StatusCode::NO_CONTENT)
}
