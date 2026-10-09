//! Platform-only specific deletion consent and bounded one-shot mutation.
use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
};
use niu_storage::{AssetGroupDeletionConsent, TenantScope};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ConsentInput {
    organization_id: Uuid,
    project_id: Uuid,
    intent_id: Uuid,
    consent_id: Uuid,
    authorization_id: Uuid,
    valid_for_seconds: i32,
    confirm_cascade: bool,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ScopeInput {
    organization_id: Uuid,
    project_id: Uuid,
}
pub async fn prepare(
    State(state): State<AppState>,
    Path(vendor): Path<Uuid>,
    headers: HeaderMap,
    Json(input): Json<ConsentInput>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let actor = super::asset_authorizations::platform_actor(&state, &headers).await?;
    if !input.confirm_cascade {
        return Err(ApiError::invalid_request(
            "Explicit cascading deletion confirmation is required",
        ));
    }
    if !(1..=900).contains(&input.valid_for_seconds) {
        return Err(ApiError::invalid_request(
            "Deletion consent lifetime must be between 1 and 900 seconds",
        ));
    }
    let scope = TenantScope {
        organization_id: input.organization_id,
        project_id: input.project_id,
    };
    let intent = state
        .store
        .asset_group_create_intent(scope, input.intent_id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    if intent.vendor_id != vendor {
        return Err(ApiError::not_found());
    }
    let inserted = state
        .store
        .consent_asset_group_deletion(
            scope,
            AssetGroupDeletionConsent {
                id: input.consent_id,
                intent_id: input.intent_id,
                authorization_id: input.authorization_id,
                valid_for_seconds: input.valid_for_seconds,
                confirm_cascade: input.confirm_cascade,
            },
            actor,
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
            json!({"data":{"consent_id":input.consent_id,"prepared":true,"dispatch_available":false}}),
        ),
    ))
}
pub async fn read(
    State(state): State<AppState>,
    Path((vendor, consent)): Path<(Uuid, Uuid)>,
    Query(input): Query<ScopeInput>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    super::asset_authorizations::platform_actor(&state, &headers).await?;
    let scope = TenantScope {
        organization_id: input.organization_id,
        project_id: input.project_id,
    };
    let data = state
        .store
        .asset_group_deletion_consent_status(scope, vendor, consent)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(json!({"data":data})))
}
pub async fn revoke(
    State(state): State<AppState>,
    Path((vendor, consent)): Path<(Uuid, Uuid)>,
    Query(input): Query<ScopeInput>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    let actor = super::asset_authorizations::platform_actor(&state, &headers).await?;
    let scope = TenantScope {
        organization_id: input.organization_id,
        project_id: input.project_id,
    };
    if state
        .store
        .asset_group_deletion_consent_status(scope, vendor, consent)
        .await
        .map_err(ApiError::from_store)?
        .is_some()
    {
        state
            .store
            .revoke_asset_group_deletion_consent(scope, consent, actor)
            .await
            .map_err(ApiError::from_store)?;
    }
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DispatchInput {
    pub organization_id: Uuid,
    pub project_id: Uuid,
}
pub(crate) static DELETIONS: std::sync::LazyLock<std::sync::Arc<tokio::sync::Semaphore>> =
    std::sync::LazyLock::new(|| std::sync::Arc::new(tokio::sync::Semaphore::new(4)));
pub async fn dispatch(
    State(state): State<AppState>,
    Path((vendor, consent)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    Json(input): Json<DispatchInput>,
) -> Result<Json<Value>, ApiError> {
    dispatch_with_transport(
        state,
        vendor,
        consent,
        headers,
        input,
        |signer, claimed| async move {
            niu_media::asset_group_delete::delete_group_now(
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
    consent: Uuid,
    headers: HeaderMap,
    input: DispatchInput,
    send: F,
) -> Result<Json<Value>, ApiError>
where
    F: FnOnce(
            niu_media::asset_signing::AssetManagementSigner,
            niu_storage::ClaimedAssetGroupDeletion,
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
    if state
        .store
        .asset_group_deletion_consent_status(scope, vendor, consent)
        .await
        .map_err(ApiError::from_store)?
        .is_none()
    {
        return Err(ApiError::not_found());
    }
    let cipher = state
        .vendor_cipher
        .clone()
        .ok_or_else(ApiError::unavailable)?;
    let permit = DELETIONS
        .clone()
        .try_acquire_owned()
        .map_err(|_| ApiError::asset_management_busy())?;
    let in_flight = state.track_inference();
    let claimed = state
        .store
        .claim_asset_group_deletion(scope, consent)
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
            Some(reason) => niu_storage::AssetGroupDeletionOutcome::Uncertain { reason },
            None => niu_storage::AssetGroupDeletionOutcome::Acknowledged,
        };
        let duration = i64::try_from(started.elapsed().as_millis()).unwrap_or(i64::MAX);
        if !worker
            .store
            .record_asset_group_deletion_outcome(scope, consent, outcome, duration)
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
        json!({"data":{"consent_id":consent,"status":if acknowledged{"acknowledged"}else{"uncertain"},"reconciliation_required":true}}),
    ))
}
