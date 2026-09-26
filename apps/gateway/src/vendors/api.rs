use super::models::{make_model, validate_model};
use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

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
