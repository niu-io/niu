use crate::{
    config::{AppConfig, ModelConfig, RoutePricing, ServerConfig},
    error::ApiError,
    state::AppState,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(default, deny_unknown_fields)]
pub(super) struct Capabilities {
    catalog: crate::catalog_metadata::CatalogMetadata,
    supports_embeddings: bool,
    supports_embedding_dimensions: bool,
    supports_embedding_base64: bool,
    supports_tool_calls: bool,
    supports_streaming_tool_calls: bool,
    supports_structured_output: bool,
    supports_responses: bool,
}

pub(crate) struct ResolvedModel {
    pub model: ModelConfig,
    pub api_key: Option<String>,
}

pub(super) fn make_model(
    adapter: &str,
    api_base: &str,
    upstream_model: &str,
    capabilities: Value,
    pricing: Option<Value>,
) -> Result<ModelConfig, ApiError> {
    let caps: Capabilities = serde_json::from_value(capabilities)
        .map_err(|_| ApiError::invalid_request("Invalid model capabilities"))?;
    let pricing: Option<RoutePricing> = pricing
        .map(serde_json::from_value)
        .transpose()
        .map_err(|_| ApiError::invalid_request("Invalid model pricing"))?;
    let codex_chatgpt = adapter == "codex-chatgpt";
    if codex_chatgpt && pricing.is_some() {
        return Err(ApiError::invalid_request(
            "Per-token provider pricing is not available for Codex subscription routes",
        ));
    }
    Ok(ModelConfig {
        catalog: caps.catalog,
        provider: adapter.to_owned(),
        upstream_model: upstream_model.to_owned(),
        api_key_env: if codex_chatgpt {
            String::new()
        } else {
            "NIU_MANAGED_CREDENTIAL".into()
        },
        api_base: Some(api_base.to_owned()),
        public_catalog: false,
        pricing,
        supports_embeddings: caps.supports_embeddings,
        supports_embedding_dimensions: caps.supports_embedding_dimensions,
        supports_embedding_base64: caps.supports_embedding_base64,
        supports_tool_calls: codex_chatgpt || caps.supports_tool_calls,
        supports_streaming_tool_calls: codex_chatgpt || caps.supports_streaming_tool_calls,
        supports_structured_output: codex_chatgpt || caps.supports_structured_output,
        supports_responses: codex_chatgpt || caps.supports_responses,
    })
}

pub(super) fn validate_model(alias: &str, model: ModelConfig) -> Result<(), ApiError> {
    let config = AppConfig {
        server: ServerConfig::default(),
        models: BTreeMap::from([(alias.to_owned(), model)]),
    };
    config.validate().map_err(|_| {
        ApiError::invalid_request("Invalid vendor endpoint, model alias or capabilities")
    })
}

fn stored_model(route: &niu_storage::VendorRoute) -> Result<ModelConfig, ApiError> {
    let mut model = make_model(
        &route.vendor.adapter,
        &route.vendor.api_base,
        &route.model.upstream_model,
        route.model.capabilities.clone(),
        route.model.pricing.clone(),
    )?;
    model.public_catalog = route.model.public_catalog;
    Ok(model)
}

pub(crate) async fn effective_models(
    state: &AppState,
) -> Result<BTreeMap<String, ModelConfig>, ApiError> {
    let mut models = state.config.models.clone();
    for route in state
        .store
        .all_vendor_routes()
        .await
        .map_err(ApiError::from_store)?
    {
        // A disabled database route still shadows its static predecessor.
        models.remove(&route.model.alias);
        if route.vendor.enabled && route.model.enabled {
            models.insert(route.model.alias.clone(), stored_model(&route)?);
        }
    }
    Ok(models)
}

pub(crate) async fn resolve_model(
    state: &AppState,
    alias: &str,
) -> Result<ResolvedModel, ApiError> {
    if let Some(route) = state
        .store
        .vendor_route(alias)
        .await
        .map_err(ApiError::from_store)?
    {
        if !route.vendor.enabled || !route.model.enabled {
            return Err(ApiError::not_found());
        }
        let api_key = match route.credential_ciphertext.as_deref() {
            Some(ciphertext) => Some(
                state
                    .vendor_cipher
                    .as_ref()
                    .ok_or_else(ApiError::unavailable)?
                    .open(route.vendor.id, ciphertext)
                    .map_err(|_| ApiError::unavailable())?,
            ),
            None if route.vendor.adapter == "codex-chatgpt" => None,
            None => return Err(ApiError::unavailable()),
        };
        return Ok(ResolvedModel {
            model: stored_model(&route)?,
            api_key,
        });
    }
    let model = state
        .config
        .models
        .get(alias)
        .cloned()
        .ok_or_else(ApiError::not_found)?;
    let api_key = if model.uses_codex_chatgpt_auth() {
        None
    } else {
        Some(
            state
                .provider_key(&model.api_key_env)
                .ok_or_else(ApiError::unavailable)?
                .to_owned(),
        )
    };
    Ok(ResolvedModel { model, api_key })
}
