use super::models::{make_model, validate_model};
use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use uuid::Uuid;

const MAX_MODEL_CATALOG_BYTES: usize = 2 * 1024 * 1024;
const MAX_DISCOVERED_MODELS: usize = 2_000;

async fn installation(state: &AppState, headers: &HeaderMap) -> Result<(), ApiError> {
    let token = headers
        .get("authorization")
        .and_then(|value| value.to_str().ok());
    let authorization = state
        .authorize_admin(token, niu_storage::AdminPermission::ManageOperators)
        .await?;
    if !authorization.is_installation() {
        return Err(ApiError::forbidden());
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CreateVendor {
    name: String,
    adapter: String,
    api_base: String,
    api_key: String,
    #[serde(default = "enabled")]
    enabled: bool,
}
fn enabled() -> bool {
    true
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdateVendor {
    name: String,
    api_base: String,
    enabled: bool,
    expected_revision: i64,
    api_key: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ModelInput {
    pub alias: String,
    pub upstream_model: String,
    #[serde(default)]
    pub public_catalog: bool,
    #[serde(default = "enabled")]
    pub enabled: bool,
    #[serde(default = "empty_capabilities")]
    pub capabilities: Value,
    #[serde(default, deserialize_with = "pricing_input")]
    pub pricing: Option<Option<Value>>,
    pub expected_revision: Option<i64>,
}
fn pricing_input<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<Option<Value>>, D::Error> {
    // Missing preserves stored pricing; explicit null clears it.
    Option::<Value>::deserialize(deserializer).map(Some)
}

fn empty_capabilities() -> Value {
    json!({})
}

impl ModelInput {
    pub(super) fn storage(self) -> niu_storage::VendorModelInput {
        niu_storage::VendorModelInput {
            alias: self.alias,
            upstream_model: self.upstream_model,
            public_catalog: self.public_catalog,
            enabled: self.enabled,
            capabilities: self.capabilities,
            pricing: self.pricing.flatten(),
            expected_revision: self.expected_revision,
        }
    }
}

pub async fn list(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    Ok(Json(
        json!({"data":state.store.vendors().await.map_err(ApiError::from_store)?}),
    ))
}

pub async fn create(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateVendor>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    installation(&state, &headers).await?;
    validate_model(
        "validation",
        make_model(
            &input.adapter,
            &input.api_base,
            "validation",
            json!({}),
            None,
        )?,
    )?;
    let id = Uuid::new_v4();
    let cipher = state
        .vendor_cipher
        .as_ref()
        .ok_or_else(ApiError::unavailable)?;
    let ciphertext = cipher
        .seal(id, &input.api_key)
        .map_err(ApiError::invalid_request)?;
    let vendor = state
        .store
        .create_vendor(niu_storage::VendorInput {
            id,
            name: input.name,
            adapter: input.adapter,
            api_base: input.api_base,
            enabled: input.enabled,
            credential_ciphertext: ciphertext,
        })
        .await
        .map_err(ApiError::from_store)?;
    Ok((StatusCode::CREATED, Json(json!({"data":vendor}))))
}

pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
    Json(input): Json<UpdateVendor>,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    let current = state
        .store
        .vendor(id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    validate_model(
        "validation",
        make_model(
            &current.adapter,
            &input.api_base,
            "validation",
            json!({}),
            None,
        )?,
    )?;
    let ciphertext = if let Some(key) = input.api_key {
        Some(
            state
                .vendor_cipher
                .as_ref()
                .ok_or_else(ApiError::unavailable)?
                .seal(id, &key)
                .map_err(ApiError::invalid_request)?,
        )
    } else {
        None
    };
    let vendor = state
        .store
        .update_vendor(
            id,
            niu_storage::VendorUpdate {
                name: input.name,
                api_base: input.api_base,
                enabled: input.enabled,
                expected_revision: input.expected_revision,
                credential_ciphertext: ciphertext,
            },
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":vendor})))
}

pub async fn list_models(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    state
        .store
        .vendor(id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(
        json!({"data":state.store.vendor_models(id).await.map_err(ApiError::from_store)?}),
    ))
}

/// Read the provider's model catalog using its encrypted server-side
/// credential. Only a small allowlist of model metadata reaches the console.
pub async fn catalog(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    let vendor = state
        .store
        .vendor(id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    let ciphertext = state
        .store
        .vendor_credential_ciphertext(id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::unavailable)?;
    let api_key = state
        .vendor_cipher
        .as_ref()
        .ok_or_else(ApiError::unavailable)?
        .open(id, &ciphertext)
        .map_err(|_| ApiError::unavailable())?;
    let endpoint = format!("{}/models", vendor.api_base.trim_end_matches('/'));
    let timeout = Duration::from_secs(state.config.server.request_timeout_seconds.clamp(1, 5));
    let client = match crate::upstream::client_for_endpoint(&endpoint, timeout).await {
        Ok(client) => client,
        Err(crate::upstream::EndpointError::PrivateAddress) => {
            return Err(ApiError::upstream_message(
                "The provider endpoint resolves to a private address and was blocked.",
            ));
        }
        Err(crate::upstream::EndpointError::InvalidUrl) => {
            return Err(ApiError::upstream_message(
                "The provider endpoint URL is invalid.",
            ));
        }
        Err(crate::upstream::EndpointError::ResolutionFailed)
        | Err(crate::upstream::EndpointError::ClientConfiguration) => {
            return Err(ApiError::upstream_message(
                "The provider model catalog could not be reached.",
            ));
        }
    };
    let mut response = client
        .get(endpoint)
        .bearer_auth(api_key)
        .header(axum::http::header::ACCEPT, "application/json")
        .send()
        .await
        .map_err(|_| {
            ApiError::upstream_message("The provider model catalog could not be reached.")
        })?;
    let status = response.status();
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        return Err(ApiError::upstream_message(
            "The provider rejected the saved API key. Check the key and provider account access.",
        ));
    }
    if status.is_redirection() {
        return Err(ApiError::upstream_message(
            "The provider redirected the catalog request; Niu stopped it for safety.",
        ));
    }
    if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Err(ApiError::upstream_message(
            "The provider rate limited model discovery. Try again shortly.",
        ));
    }
    if !status.is_success() {
        return Err(ApiError::upstream_message(
            "The provider returned an error while listing models.",
        ));
    }

    let mut body = Vec::new();
    loop {
        match response.chunk().await {
            Ok(Some(chunk)) => {
                if body.len().saturating_add(chunk.len()) > MAX_MODEL_CATALOG_BYTES {
                    return Err(ApiError::upstream_message(
                        "The provider model catalog exceeds Niu's 2 MiB safety limit.",
                    ));
                }
                body.extend_from_slice(&chunk);
            }
            Ok(None) => break,
            Err(_) => {
                return Err(ApiError::upstream_message(
                    "The provider model catalog could not be read.",
                ));
            }
        }
    }
    let catalog: Value = serde_json::from_slice(&body).map_err(|_| {
        ApiError::upstream_message("The provider returned an invalid model catalog.")
    })?;
    let models = catalog
        .get("data")
        .and_then(Value::as_array)
        .ok_or_else(|| {
            ApiError::upstream_message("The provider returned an invalid model catalog.")
        })?;
    let data = models
        .iter()
        .take(MAX_DISCOVERED_MODELS)
        .filter_map(|model| {
            let id = model.get("id")?.as_str()?;
            if id.is_empty() || id.len() > 200 {
                return None;
            }
            let name = model
                .get("name")
                .and_then(Value::as_str)
                .filter(|name| !name.is_empty() && name.len() <= 300)
                .unwrap_or(id);
            Some(json!({
                "id": id,
                "name": name,
                "context_length": model.get("context_length").and_then(Value::as_u64),
                "catalog": crate::catalog_metadata::CatalogMetadata::from_provider(model),
            }))
        })
        .collect::<Vec<_>>();
    Ok(Json(json!({ "data": data })))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CheckModelInput {
    alias: String,
}

/// Check provider reachability and whether the configured upstream model is
/// listed. This is a bounded catalog read, not a billable inference request.
pub async fn check_model(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
    Json(input): Json<CheckModelInput>,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    if input.alias.trim().is_empty() || input.alias.len() > 200 {
        return Err(ApiError::invalid_request("Invalid model alias"));
    }
    let route = state
        .store
        .vendor_route(&input.alias)
        .await
        .map_err(ApiError::from_store)?
        .filter(|route| route.vendor.id == id)
        .ok_or_else(ApiError::not_found)?;
    let api_key = state
        .vendor_cipher
        .as_ref()
        .ok_or_else(ApiError::unavailable)?
        .open(id, &route.credential_ciphertext)
        .map_err(|_| ApiError::unavailable())?;
    let endpoint = format!("{}/models", route.vendor.api_base.trim_end_matches('/'));
    let timeout = Duration::from_secs(state.config.server.request_timeout_seconds.clamp(1, 5));
    let started = Instant::now();

    let client = match crate::upstream::client_for_endpoint(&endpoint, timeout).await {
        Ok(client) => client,
        Err(crate::upstream::EndpointError::PrivateAddress) => {
            return Ok(check_response(
                "private_endpoint_blocked",
                "unknown",
                None,
                started,
            ));
        }
        Err(crate::upstream::EndpointError::InvalidUrl) => {
            return Ok(check_response("invalid_endpoint", "unknown", None, started));
        }
        Err(crate::upstream::EndpointError::ResolutionFailed)
        | Err(crate::upstream::EndpointError::ClientConfiguration) => {
            return Ok(check_response(
                "endpoint_unavailable",
                "unknown",
                None,
                started,
            ));
        }
    };
    let mut response = match client
        .get(endpoint)
        .bearer_auth(api_key)
        .header(axum::http::header::ACCEPT, "application/json")
        .send()
        .await
    {
        Ok(response) => response,
        Err(_) => {
            return Ok(check_response(
                "endpoint_unavailable",
                "unknown",
                None,
                started,
            ));
        }
    };
    let status = response.status();
    let status_code = status.as_u16();
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        return Ok(check_response(
            "credentials_rejected",
            "unknown",
            Some(status_code),
            started,
        ));
    }
    if status.is_redirection() {
        return Ok(check_response(
            "redirect_blocked",
            "unknown",
            Some(status_code),
            started,
        ));
    }
    if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Ok(check_response(
            "provider_rate_limited",
            "unknown",
            Some(status_code),
            started,
        ));
    }
    if !status.is_success() {
        let result = if status == reqwest::StatusCode::NOT_FOUND
            || status == reqwest::StatusCode::METHOD_NOT_ALLOWED
        {
            "model_catalog_unavailable"
        } else {
            "provider_error"
        };
        return Ok(check_response(
            result,
            "unknown",
            Some(status_code),
            started,
        ));
    }

    let mut body = Vec::new();
    loop {
        match response.chunk().await {
            Ok(Some(chunk)) => {
                if body.len().saturating_add(chunk.len()) > MAX_MODEL_CATALOG_BYTES {
                    return Ok(check_response(
                        "model_catalog_too_large",
                        "unknown",
                        Some(status_code),
                        started,
                    ));
                }
                body.extend_from_slice(&chunk);
            }
            Ok(None) => break,
            Err(_) => {
                return Ok(check_response(
                    "provider_error",
                    "unknown",
                    Some(status_code),
                    started,
                ));
            }
        }
    }
    let Ok(catalog) = serde_json::from_slice::<Value>(&body) else {
        return Ok(check_response(
            "invalid_model_catalog",
            "unknown",
            Some(status_code),
            started,
        ));
    };
    let Some(models) = catalog.get("data").and_then(Value::as_array) else {
        return Ok(check_response(
            "invalid_model_catalog",
            "unknown",
            Some(status_code),
            started,
        ));
    };
    let listed = models.iter().any(|model| {
        model.get("id").and_then(Value::as_str) == Some(route.model.upstream_model.as_str())
    });
    Ok(check_response(
        "connected",
        if listed { "listed" } else { "not_listed" },
        Some(status_code),
        started,
    ))
}

fn check_response(
    status: &str,
    model: &str,
    http_status: Option<u16>,
    started: Instant,
) -> Json<Value> {
    let checked_at_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(u64::MAX as u128) as u64;
    Json(json!({
        "data": {
            "status": status,
            "model": model,
            "http_status": http_status,
            "duration_ms": started.elapsed().as_millis().min(u64::MAX as u128) as u64,
            "checked_at_ms": checked_at_ms
        }
    }))
}

pub async fn upsert_model(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
    Json(mut input): Json<ModelInput>,
) -> Result<Json<Value>, ApiError> {
    installation(&state, &headers).await?;
    let vendor = state
        .store
        .vendor(id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    if input.expected_revision.is_some() && input.pricing.is_none() {
        let previous = state
            .store
            .vendor_route(&input.alias)
            .await
            .map_err(ApiError::from_store)?;
        if let Some(previous) = previous {
            if previous.vendor.id != id {
                return Err(ApiError::from_store(niu_storage::StoreError::Conflict));
            }
            input.pricing = Some(previous.model.pricing);
        }
    }
    validate_model(
        &input.alias,
        make_model(
            &vendor.adapter,
            &vendor.api_base,
            &input.upstream_model,
            input.capabilities.clone(),
            input.pricing.clone().flatten(),
        )?,
    )?;
    let model = state
        .store
        .upsert_vendor_model(id, input.storage())
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":model})))
}

/// Explicit metadata refresh; discovery GET stays read-only.
pub async fn refresh_catalog(State(state): State<AppState>, Path(id): Path<Uuid>, headers: HeaderMap) -> Result<Json<Value>, ApiError> {
    let Json(result) = catalog(State(state.clone()), Path(id), headers).await?;
    let entries = result["data"].as_array().into_iter().flatten().filter_map(|entry| Some((entry["id"].as_str()?.to_owned(), entry["catalog"].clone()))).collect();
    let updated = state.store.refresh_vendor_catalog(id, entries).await.map_err(ApiError::from_store)?;
    Ok(Json(json!({"updated": updated})))
}
