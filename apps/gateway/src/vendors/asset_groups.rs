//! Platform administration creation path. Customer asset routing remains separate.
//! Only the fixed direct Ark action is sent, once, after a durable authorized claim.
use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
};
use niu_media::{
    asset_group::OrdinaryAssetGroupCreate, asset_signing::AssetManagementSigner,
    asset_transport::AssetCreateError,
};
use niu_storage::{ClaimedAssetGroupCreate, StoreError, TenantScope};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    future::Future,
    sync::{Arc, LazyLock},
    time::Duration,
};
use tokio::sync::Semaphore;
use uuid::Uuid;

static CREATES: LazyLock<Arc<Semaphore>> = LazyLock::new(|| Arc::new(Semaphore::new(4)));
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CreateInput {
    pub organization_id: Uuid,
    pub project_id: Uuid,
    pub idempotency_key: Uuid,
    pub vendor_revision: i64,
    pub credential_revision: i64,
    pub name: String,
    pub description: Option<String>,
}
pub async fn create(
    State(state): State<AppState>,
    Path(vendor): Path<Uuid>,
    headers: HeaderMap,
    Json(input): Json<CreateInput>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    create_with_dispatch(
        state,
        vendor,
        headers,
        input,
        |signer, claimed| async move {
            niu_media::asset_transport::create_group_now(
                &signer,
                claimed.request(),
                &claimed.credential.upstream_project,
                1024 * 1024,
                Duration::from_secs(30),
            )
            .await
            .map(|receipt| receipt.upstream_id().to_owned())
        },
    )
    .await
}

/// Transport substitution is internal for controlled verification. Public
/// requests cannot set an endpoint, signing date, retries or alternate action.
pub(crate) async fn create_with_dispatch<F, Fut>(
    state: AppState,
    vendor: Uuid,
    headers: HeaderMap,
    input: CreateInput,
    send: F,
) -> Result<(StatusCode, Json<Value>), ApiError>
where
    F: FnOnce(AssetManagementSigner, ClaimedAssetGroupCreate) -> Fut + Send + 'static,
    Fut: Future<Output = Result<String, AssetCreateError>> + Send + 'static,
{
    super::asset_authorizations::platform_actor(&state, &headers).await?;
    if input.vendor_revision < 1 || input.credential_revision < 1 {
        return Err(ApiError::invalid_request(
            "Positive account and asset credential revisions are required",
        ));
    }
    let scope = TenantScope {
        organization_id: input.organization_id,
        project_id: input.project_id,
    };
    if !state
        .store
        .projects(scope.organization_id)
        .await
        .map_err(ApiError::from_store)?
        .iter()
        .any(|p| p.id == scope.project_id)
    {
        return Err(ApiError::not_found());
    }
    let request = OrdinaryAssetGroupCreate::new(input.name, input.description).map_err(|_| {
        ApiError::invalid_request("Invalid ordinary asset group name or description")
    })?;
    if let Some(saved) = state
        .store
        .asset_group_create_replay(
            scope,
            input.idempotency_key,
            vendor,
            input.credential_revision,
            &request,
        )
        .await
        .map_err(ApiError::from_store)?
    {
        if saved.vendor_revision != input.vendor_revision {
            return Err(ApiError::from_store(StoreError::Conflict));
        }
        if saved.state != "prepared" {
            return Ok((
                StatusCode::ACCEPTED,
                Json(json!({"data":{"id":saved.id,"status":saved.state}})),
            ));
        }
    }
    let permit = CREATES
        .clone()
        .try_acquire_owned()
        .map_err(|_| ApiError::asset_management_busy())?;
    let cipher = state
        .vendor_cipher
        .as_ref()
        .ok_or_else(ApiError::unavailable)?;
    let credential = state
        .store
        .asset_management_credential_revision(vendor, input.credential_revision)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(|| ApiError::from_store(StoreError::Conflict))?;
    let signer = cipher
        .open_asset_management(
            vendor,
            input.credential_revision,
            &credential.upstream_project,
            &credential.credential_ciphertext,
        )
        .map_err(|_| ApiError::unavailable())?;
    // Persistent body equality makes a repeated idempotency key a read, never a
    // second upstream create. An expired body cannot be reconstructed for replay.
    let intent = state
        .store
        .prepare_asset_group_create(
            scope,
            input.idempotency_key,
            vendor,
            input.credential_revision,
            &request,
        )
        .await
        .map_err(ApiError::from_store)?;
    if intent.vendor_revision != input.vendor_revision {
        return Err(ApiError::from_store(StoreError::Conflict));
    }
    if intent.state != "prepared" {
        return Ok((
            StatusCode::ACCEPTED,
            Json(json!({"data":{"id":intent.id,"status":intent.state}})),
        ));
    }
    let in_flight = state.track_inference();
    let claimed = state
        .store
        .claim_asset_group_create_credentials(scope, intent.id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(|| ApiError::from_store(StoreError::Conflict))?;
    let id = intent.id;
    // Detached from the HTTP future, but bounded and included in graceful drain.
    // A process crash leaves dispatching persisted for reconciliation, not replay.
    tokio::spawn(async move {
        let _permit = permit;
        let _in_flight = in_flight;
        let started = std::time::Instant::now();
        let outcome = tokio::time::timeout(Duration::from_secs(35), send(signer, claimed)).await;
        let (upstream, reason) = match outcome {
            Ok(Ok(id)) => (Some(id), None),
            Ok(Err(AssetCreateError::InvalidConfiguration)) => {
                (None, Some("invalid_configuration"))
            }
            Ok(Err(AssetCreateError::EndpointRejected)) => (None, Some("destination_rejected")),
            Ok(Err(AssetCreateError::Uncertain)) => (None, Some("upstream_uncertain")),
            Err(_) => (None, Some("timeout")),
        };
        let duration_ms = i64::try_from(started.elapsed().as_millis()).unwrap_or(i64::MAX);
        let completed = state
            .store
            .record_asset_group_dispatch_outcome(
                scope,
                id,
                upstream.as_deref(),
                reason,
                duration_ms,
            )
            .await;
        if !matches!(completed, Ok(true)) {
            // Never log key data, request content or upstream group identifiers.
            tracing::warn!("Asset group outcome needs reconciliation; no automatic replay");
        }
    });
    Ok((
        StatusCode::ACCEPTED,
        Json(json!({"data":{"id":id,"status":"dispatching"}})),
    ))
}
