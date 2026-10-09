//! Platform-only targeted reads of previously saved ordinary groups.
use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    extract::{Path, Query, State},
    http::HeaderMap,
};
use niu_media::{
    asset_read::{OrdinaryGroupDetails, ReadError},
    asset_signing::AssetManagementSigner,
};
use niu_storage::{ClaimedAssetGroupRead, StoreError, TenantScope};
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
pub struct ReadInput {
    pub organization_id: Uuid,
    pub project_id: Uuid,
    pub intent_id: Uuid,
    pub read_id: Uuid,
}
pub async fn read(
    State(state): State<AppState>,
    Path(vendor): Path<Uuid>,
    headers: HeaderMap,
    Json(input): Json<ReadInput>,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    read_with_dispatch(
        state,
        vendor,
        headers,
        input,
        |signer, claimed| async move {
            niu_media::asset_read::get_group_now(
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
pub(crate) async fn read_with_dispatch<F, Fut>(
    state: AppState,
    vendor: Uuid,
    headers: HeaderMap,
    input: ReadInput,
    send: F,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError>
where
    F: FnOnce(AssetManagementSigner, ClaimedAssetGroupRead) -> Fut + Send + 'static,
    Fut: Future<Output = Result<OrdinaryGroupDetails, ReadError>> + Send + 'static,
{
    read_bound_with_dispatch(state, vendor, headers, input, None, send).await
}
pub(crate) async fn read_bound_with_dispatch<F, Fut>(
    state: AppState,
    vendor: Uuid,
    headers: HeaderMap,
    input: ReadInput,
    update: Option<Uuid>,
    send: F,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError>
where
    F: FnOnce(AssetManagementSigner, ClaimedAssetGroupRead) -> Fut + Send + 'static,
    Fut: Future<Output = Result<OrdinaryGroupDetails, ReadError>> + Send + 'static,
{
    super::asset_authorizations::platform_actor(&state, &headers).await?;
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
    let claimed = match update {
        Some(update) => {
            state
                .store
                .claim_asset_group_update_read(scope, update, input.read_id)
                .await
        }
        None => {
            state
                .store
                .claim_asset_group_read(scope, input.intent_id, input.read_id)
                .await
        }
    }
    .map_err(ApiError::from_store)?
    .ok_or_else(|| ApiError::from_store(StoreError::Conflict))?;
    // Dropping the HTTP future detaches this tracked task; it still records the
    // first outcome. A process crash leaves an unresolved claim, not replay rights.
    let worker_state = state.clone();
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
                let value = json!({"read_id":input.read_id,"name":details.name,"description":details.description,
                    "created_at":details.created_at,"updated_at":details.updated_at});
                let encrypted = cipher
                    .seal_asset_read_result(scope, input.read_id, &value.to_string())
                    .map_err(|_| ApiError::unavailable())?;
                if !worker_state
                    .store
                    .save_asset_group_read_result(scope, input.read_id, &encrypted, duration)
                    .await
                    .map_err(ApiError::from_store)?
                {
                    return Err(ApiError::from_store(StoreError::Conflict));
                }
                if let Some(update) = update {
                    let reconciled = worker_state
                        .store
                        .reconcile_asset_group_update(
                            scope,
                            update,
                            input.read_id,
                            |patch, read| {
                                let patch = cipher
                                    .open_asset_update_patch(scope, update, patch)
                                    .map_err(|_| StoreError::InvalidObservation)?
                                    .into_bytes();
                                let plaintext = cipher
                                    .open_asset_read_result(scope, input.read_id, read)
                                    .map_err(|_| StoreError::InvalidObservation)?;
                                Ok((patch, restore_saved_metadata(&plaintext, input.read_id)?))
                            },
                        )
                        .await
                        .map_err(ApiError::from_store)?;
                    if !reconciled {
                        return Err(ApiError::from_store(StoreError::Conflict));
                    }
                }
                Ok(())
            }
            Err(_) => {
                worker_state
                    .store
                    .record_asset_group_read_outcome(scope, input.read_id, reason, duration)
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
        .asset_group_read_is_qualified(
            scope,
            vendor,
            saved.vendor_revision,
            saved.credential_revision,
        )
        .await
        .map_err(ApiError::from_store)?
    {
        return Err(ApiError::forbidden());
    }
    saved_result(&state, scope, vendor, input.read_id).await
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ResultScope {
    organization_id: Uuid,
    project_id: Uuid,
}
/// Authenticated storage is necessary but not a substitute for typed content.
/// This private snapshot format is shared by retrieval and reconciliation.
pub(crate) fn restore_saved_metadata(
    plaintext: &str,
    read_id: Uuid,
) -> Result<OrdinaryGroupDetails, StoreError> {
    #[derive(Deserialize)]
    #[serde(deny_unknown_fields)]
    struct Saved {
        read_id: Uuid,
        name: String,
        description: Option<String>,
        created_at: String,
        updated_at: String,
    }
    if plaintext.is_empty() || plaintext.len() > 8000 {
        return Err(StoreError::InvalidObservation);
    }
    let saved: Saved =
        serde_json::from_str(plaintext).map_err(|_| StoreError::InvalidObservation)?;
    if saved.read_id != read_id {
        return Err(StoreError::InvalidObservation);
    }
    let details = OrdinaryGroupDetails {
        name: saved.name,
        description: saved.description,
        created_at: saved.created_at,
        updated_at: saved.updated_at,
    };
    details
        .validate_metadata()
        .map_err(|_| StoreError::InvalidObservation)?;
    Ok(details)
}
async fn saved_result(
    state: &AppState,
    scope: TenantScope,
    vendor: Uuid,
    read_id: Uuid,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    let encrypted = state
        .store
        .asset_group_read_result(scope, vendor, read_id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    let plaintext = state
        .vendor_cipher
        .as_ref()
        .ok_or_else(ApiError::unavailable)?
        .open_asset_read_result(scope, read_id, &encrypted)
        .map_err(|_| ApiError::unavailable())?;
    let details =
        restore_saved_metadata(&plaintext, read_id).map_err(|_| ApiError::unavailable())?;
    let value = json!({"read_id":read_id,"name":details.name,"description":details.description,"created_at":details.created_at,"updated_at":details.updated_at});
    Ok(([("cache-control", "no-store")], Json(json!({"data":value}))))
}
pub async fn get_result(
    State(state): State<AppState>,
    Path((vendor, read_id)): Path<(Uuid, Uuid)>,
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
        read_id,
    )
    .await
}
pub async fn delete_result(
    State(state): State<AppState>,
    Path((vendor, read_id)): Path<(Uuid, Uuid)>,
    Query(query): Query<ResultScope>,
    headers: HeaderMap,
) -> Result<axum::http::StatusCode, ApiError> {
    super::asset_authorizations::platform_actor(&state, &headers).await?;
    state
        .store
        .delete_asset_group_read_result(
            TenantScope {
                organization_id: query.organization_id,
                project_id: query.project_id,
            },
            vendor,
            read_id,
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
        .asset_group_read_history(
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
        .then(|| data.last().and_then(|row| row.get("read_id")).cloned())
        .flatten();
    Ok((
        [("cache-control", "no-store")],
        Json(json!({"data":data,"next_cursor":next_cursor})),
    ))
}

#[cfg(test)]
mod snapshot_tests {
    use super::*;
    #[test]
    fn saved_read_metadata_is_typed_bounded_and_bound_to_read_identity() {
        let read = Uuid::new_v4();
        let valid = json!({"read_id":read,"name":"Character","description":"Private description","created_at":"2026-10-08T00:00:00Z","updated_at":"2026-10-08T00:00:01Z"});
        let restored = restore_saved_metadata(&valid.to_string(), read).unwrap();
        assert_eq!(restored.name, "Character");
        assert_eq!(restored.description.as_deref(), Some("Private description"));
        assert!(restore_saved_metadata(&valid.to_string(), Uuid::new_v4()).is_err());
        for (key, value) in [
            ("name", json!("")),
            ("name", json!("元".repeat(65))),
            ("description", json!("x".repeat(301))),
            ("description", json!("bad\0description")),
            ("created_at", json!("invalid")),
            ("updated_at", json!("invalid")),
            ("credential", json!("private")),
            ("upstream_group_id", json!("group-other")),
        ] {
            let mut changed = valid.clone();
            changed[key] = value;
            assert!(
                restore_saved_metadata(&changed.to_string(), read).is_err(),
                "{key}"
            );
        }
        let duplicate = valid.to_string().replace(
            "\"name\":\"Character\"",
            "\"name\":\"Character\",\"name\":\"Character\"",
        );
        assert!(restore_saved_metadata(&duplicate, read).is_err());
        assert!(restore_saved_metadata(&" ".repeat(8001), read).is_err());
        assert!(restore_saved_metadata("{}", read).is_err());
        let mut empty = valid.clone();
        empty["description"] = json!("");
        assert_eq!(
            restore_saved_metadata(&empty.to_string(), read)
                .unwrap()
                .description
                .as_deref(),
            Some("")
        );
        empty["description"] = Value::Null;
        assert!(
            restore_saved_metadata(&empty.to_string(), read)
                .unwrap()
                .description
                .is_none()
        );
    }
}
