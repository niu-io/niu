//! Customer consent only. Preparation does not claim or dispatch an upload.
use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

fn client_status(state: &AppState, mut status: Value) -> Value {
    status["dispatch_available"] = json!(
        status["dispatch_available"] == true
            && status["status"] == "consented"
            && state.config.server.image_source_origin.is_some()
            && state.vendor_cipher.is_some()
    );
    status
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct HistoryQuery {
    before: Option<Uuid>,
}

pub(crate) async fn list(
    State(state): State<AppState>,
    headers: HeaderMap,
    query: Result<axum::extract::Query<HistoryQuery>, axum::extract::rejection::QueryRejection>,
) -> Result<Json<Value>, ApiError> {
    let principal = state.authorize_api_headers(&headers).await?;
    let axum::extract::Query(query) =
        query.map_err(|_| ApiError::invalid_request("Invalid ingestion history cursor"))?;
    let (rows, next) = state
        .store
        .asset_image_ingestion_history(&principal, query.before)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    let rows: Vec<_> = rows
        .into_iter()
        .map(|row| client_status(&state, row))
        .collect();
    Ok(Json(json!({"data":rows,"next_cursor":next})))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ConsentInput {
    source_id: Uuid,
    group_intent_id: Uuid,
    authorization_id: Uuid,
    valid_for_seconds: i32,
    confirm_ingestion: bool,
}

pub(crate) async fn prepare(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    input: Result<Json<ConsentInput>, axum::extract::rejection::JsonRejection>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let principal = state.authorize_api_headers(&headers).await?;
    let Json(input) =
        input.map_err(|_| ApiError::invalid_request("Invalid image ingestion consent"))?;
    if !input.confirm_ingestion || !(1..=900).contains(&input.valid_for_seconds) {
        return Err(ApiError::invalid_request(
            "Confirm ingestion with a consent lifetime between 1 and 900 seconds",
        ));
    }
    let snapshot = state
        .store
        .guardrail_snapshot(principal.scope(), principal.key_id())
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::forbidden)?;
    let inserted = state
        .store
        .consent_asset_image_ingestion(
            &principal,
            &snapshot,
            niu_storage::AssetImageIngestionConsent {
                id,
                source_id: input.source_id,
                group_intent_id: input.group_intent_id,
                authorization_id: input.authorization_id,
                valid_for_seconds: input.valid_for_seconds,
                confirm_ingestion: input.confirm_ingestion,
            },
        )
        .await
        .map_err(ApiError::from_store)?;
    let status = state
        .store
        .asset_image_ingestion_status(&principal, id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok((
        if inserted {
            StatusCode::CREATED
        } else {
            StatusCode::OK
        },
        Json(json!({"data":client_status(&state, status)})),
    ))
}

pub(crate) async fn read(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, ApiError> {
    let principal = state.authorize_api_headers(&headers).await?;
    let status = state
        .store
        .asset_image_ingestion_status(&principal, id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(json!({"data": client_status(&state, status)})))
}

pub(crate) async fn revoke(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    let principal = state.authorize_api_headers(&headers).await?;
    state
        .store
        .asset_image_ingestion_status(&principal, id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    state
        .store
        .revoke_asset_image_ingestion_consent(&principal, id)
        .await
        .map_err(ApiError::from_store)?;
    Ok(StatusCode::NO_CONTENT)
}

pub(crate) static UPLOADS: std::sync::LazyLock<std::sync::Arc<tokio::sync::Semaphore>> =
    std::sync::LazyLock::new(|| std::sync::Arc::new(tokio::sync::Semaphore::new(4)));

// Commands use only the saved consent/account binding. Never silently accept
// caller-supplied overrides that appear to change that binding.
pub(crate) fn validate_command_body(body: &[u8]) -> Result<(), ApiError> {
    if !body.is_empty() {
        let value: Value = serde_json::from_slice(body)
            .map_err(|_| ApiError::invalid_request("Expected an empty command object"))?;
        if !value.as_object().is_some_and(|object| object.is_empty()) {
            return Err(ApiError::invalid_request(
                "Expected an empty command object",
            ));
        }
    }
    Ok(())
}

pub(crate) async fn dispatch(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    body: axum::body::Bytes,
) -> Result<Json<Value>, ApiError> {
    state.authorize_api_headers(&headers).await?;
    validate_command_body(&body)?;
    dispatch_with_transport(state, headers, id, |signer, request| async move {
        niu_media::asset_create::create_asset_now(
            &signer,
            &request,
            1024 * 1024,
            std::time::Duration::from_secs(30),
        )
        .await
        .map(|accepted| accepted.upstream_id().to_owned())
    })
    .await
}

pub(crate) async fn dispatch_with_transport<F, Fut>(
    state: AppState,
    headers: HeaderMap,
    id: Uuid,
    send: F,
) -> Result<Json<Value>, ApiError>
where
    F: FnOnce(
            niu_media::asset_signing::AssetManagementSigner,
            niu_media::asset_create::OrdinaryAssetCreate,
        ) -> Fut
        + Send
        + 'static,
    Fut: std::future::Future<Output = Result<String, niu_media::asset_read::ReadError>>
        + Send
        + 'static,
{
    use niu_media::asset_read::ReadError;
    let principal = state.authorize_api_headers(&headers).await?;
    // Validate deployment configuration and capacity before consuming consent.
    state
        .config
        .server
        .image_source_url(&format!("nis_{}", "0".repeat(64)))
        .map_err(|_| ApiError::unavailable())?;
    let cipher = state
        .vendor_cipher
        .clone()
        .ok_or_else(ApiError::unavailable)?;
    let permit = UPLOADS
        .clone()
        .try_acquire_owned()
        .map_err(|_| ApiError::asset_management_busy())?;
    let snapshot = state
        .store
        .guardrail_snapshot(principal.scope(), principal.key_id())
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::forbidden)?;
    let detectors: Vec<_> = state
        .image_detectors
        .iter()
        .map(|(name, runtime)| (name.as_str(), runtime))
        .collect();
    let claimed = state
        .store
        .claim_asset_image_ingestion(&principal, &snapshot, id, &detectors, |aad, bytes| {
            cipher
                .open_bytes_with_aad(aad, bytes)
                .map_err(|_| niu_storage::StoreError::InvalidObservation)
        })
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(|| ApiError::from_store(niu_storage::StoreError::Conflict))?;
    let in_flight = state.track_inference();
    let worker = state.clone();
    let task = tokio::spawn(async move {
        let _permit = permit;
        let _in_flight = in_flight;
        let started = std::time::Instant::now();
        let upload = async {
            let access = worker
                .store
                .issue_asset_image_source_access(&principal, &snapshot, id)
                .await
                .map_err(|_| ReadError::Unavailable)?
                .ok_or(ReadError::Unavailable)?;
            let source = worker
                .config
                .server
                .image_source_url(access.token())
                .map_err(|_| ReadError::InvalidConfiguration)?;
            let signer = cipher
                .open_asset_management(
                    claimed.credential.vendor_id,
                    claimed.credential.revision,
                    &claimed.credential.upstream_project,
                    &claimed.credential.credential_ciphertext,
                )
                .map_err(|_| ReadError::InvalidConfiguration)?;
            let request = niu_media::asset_create::OrdinaryAssetCreate::new(
                claimed.group,
                source,
                niu_media::asset_list::AssetType::Image,
                None,
            )?;
            send(signer, request).await
        };
        let result = tokio::time::timeout(std::time::Duration::from_secs(35), upload)
            .await
            .unwrap_or(Err(ReadError::Timeout));
        let outcome = match &result {
            Ok(id) => niu_storage::AssetImageIngestionOutcome::Accepted {
                upstream_asset_id: id,
            },
            Err(error) => niu_storage::AssetImageIngestionOutcome::Uncertain {
                reason: match error {
                    ReadError::InvalidConfiguration => "invalid_configuration",
                    ReadError::EndpointRejected => "destination_rejected",
                    ReadError::Unavailable => "unavailable",
                    ReadError::Transport => "transport",
                    ReadError::Timeout => "timeout",
                    ReadError::ResponseLimit => "response_limit",
                    ReadError::InvalidResponse => "invalid_response",
                },
            },
        };
        let duration = i64::try_from(started.elapsed().as_millis()).unwrap_or(i64::MAX);
        if !worker
            .store
            .finish_asset_image_ingestion(&principal, id, outcome, duration)
            .await
            .map_err(ApiError::from_store)?
        {
            return Err(ApiError::from_store(niu_storage::StoreError::Conflict));
        }
        worker
            .store
            .asset_image_ingestion_status(&principal, id)
            .await
            .map_err(ApiError::from_store)?
            .ok_or_else(ApiError::not_found)
    });
    let status = task.await.map_err(|_| ApiError::unavailable())??;
    state.authorize_api_headers(&headers).await?;
    Ok(Json(json!({"data":client_status(&state, status)})))
}
