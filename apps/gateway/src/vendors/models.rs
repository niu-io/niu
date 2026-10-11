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
    video_schema: Option<niu_media::VideoSchema>,
    supports_embeddings: bool,
    supports_embedding_dimensions: bool,
    supports_embedding_base64: bool,
    supports_tool_calls: bool,
    supports_streaming_tool_calls: bool,
    supports_structured_output: bool,
    supports_responses: bool,
    supports_messages: bool,
    supports_messages_streaming: bool,
    supports_messages_tools: bool,
    supports_messages_streaming_tools: bool,
    supports_generate_content: bool,
}

pub(crate) struct ResolvedModel {
    pub managed_route: Option<niu_storage::ManagedRouteSnapshot>,
    pub model: ModelConfig,
    pub api_key: String,
    pub personal_route: Option<niu_storage::VendorRoute>,
}

pub(crate) async fn require_selectable_credential(
    state: &AppState,
    vendor: uuid::Uuid,
) -> Result<(), ApiError> {
    if state
        .store
        .vendor_is_cooling_down(vendor)
        .await
        .map_err(ApiError::from_store)?
    {
        tracing::debug!(
            reason = "upstream_credential_cooldown",
            "Credential unavailable for new selection"
        );
        return Err(ApiError::credential_cooldown());
    }
    Ok(())
}

pub(crate) async fn resolve_scoped_model(
    state: &AppState,
    organization_id: uuid::Uuid,
    alias: &str,
    protocol: crate::guardrails::input::Protocol,
    requirements: Option<&crate::config::ModelRequirements>,
) -> Result<ResolvedModel, ApiError> {
    resolve_scoped_model_excluding(state, organization_id, alias, protocol, requirements, &[]).await
}

pub(crate) async fn resolve_scoped_model_excluding(
    state: &AppState,
    organization_id: uuid::Uuid,
    alias: &str,
    protocol: crate::guardrails::input::Protocol,
    requirements: Option<&crate::config::ModelRequirements>,
    excluded_vendors: &[uuid::Uuid],
) -> Result<ResolvedModel, ApiError> {
    if let Some(pool) = state
        .store
        .model_route_pool(alias)
        .await
        .map_err(ApiError::from_store)?
    {
        return resolve_pool(
            state,
            Some(organization_id),
            pool,
            Some(&protocol),
            requirements,
            excluded_vendors,
        )
        .await;
    }
    if !excluded_vendors.is_empty() {
        return Err(ApiError::route_pool_unavailable());
    }
    if let Some(route) = state
        .store
        .personal_vendor_route(organization_id, alias)
        .await
        .map_err(ApiError::from_store)?
    {
        require_selectable_credential(state, route.vendor.id).await?;
        reject_video_text_route(&route)?;
        let cipher = state
            .vendor_cipher
            .as_ref()
            .ok_or_else(ApiError::unavailable)?;
        let api_key = cipher
            .open(route.vendor.id, &route.credential_ciphertext)
            .map_err(|_| ApiError::unavailable())?;
        let mut model = stored_model(&route)?;
        // Personal upstream charges are not Niu customer or Supplier prices.
        model.pricing = None;
        model.public_catalog = false;
        return Ok(ResolvedModel {
            managed_route: Some(niu_storage::ManagedRouteSnapshot::from(&route)),
            model,
            api_key,
            personal_route: Some(route),
        });
    }
    resolve_model(state, alias).await
}

async fn resolve_pool(
    state: &AppState,
    organization: Option<uuid::Uuid>,
    pool: niu_storage::ModelRoutePool,
    protocol: Option<&crate::guardrails::input::Protocol>,
    requirements: Option<&crate::config::ModelRequirements>,
    excluded_vendors: &[uuid::Uuid],
) -> Result<ResolvedModel, ApiError> {
    if !pool.enabled
        || pool
            .organization_id
            .is_some_and(|owner| Some(owner) != organization)
    {
        return Err(ApiError::not_found());
    }
    let mut eligible = Vec::new();
    for route in state
        .store
        .eligible_pool_routes(&pool)
        .await
        .map_err(ApiError::from_store)?
    {
        if excluded_vendors.contains(&route.vendor.id) {
            continue;
        }
        let candidate = pool
            .candidates
            .iter()
            .find(|candidate| candidate.alias == route.model.alias)
            .ok_or_else(ApiError::unavailable)?;
        if let Some(protocol) = protocol {
            use crate::guardrails::input::Protocol;
            let model = stored_model(&route)?;
            let supported = match protocol {
                Protocol::Chat => model.protocol().supports_chat_completions(),
                Protocol::Responses => {
                    model.protocol().is_openai_compatible() && model.supports_responses
                }
                Protocol::Embeddings => {
                    model.protocol().is_openai_compatible() && model.supports_embeddings
                }
                Protocol::Messages => {
                    model.supports_messages
                        && matches!(model.provider.as_str(), "openrouter" | "anthropic")
                }
                Protocol::GenerateContent => {
                    model.supports_generate_content && model.provider == "gemini"
                }
                Protocol::VideoText => false,
            };
            if !supported || requirements.is_some_and(|required| !required.allows(&model)) {
                continue;
            }
        }
        eligible.push((candidate, route));
    }
    let route = select_candidate(eligible).ok_or_else(ApiError::route_pool_unavailable)?;
    let cipher = state
        .vendor_cipher
        .as_ref()
        .ok_or_else(ApiError::unavailable)?;
    let api_key = cipher
        .open(route.vendor.id, &route.credential_ciphertext)
        .map_err(|_| ApiError::unavailable())?;
    let mut model = stored_model(&route)?;
    model.public_catalog = false;
    let personal = pool.organization_id.is_some();
    if personal {
        model.pricing = None;
    }
    let mut snapshot = niu_storage::ManagedRouteSnapshot::from(&route);
    snapshot.pool_alias = Some(pool.alias);
    snapshot.pool_revision = Some(pool.revision);
    Ok(ResolvedModel {
        model,
        api_key,
        managed_route: Some(snapshot),
        personal_route: personal.then_some(route),
    })
}

/// Weighted selection among the highest-priority eligible inference routes.
pub(super) fn select_candidate<T>(
    eligible: Vec<(&niu_storage::RoutePoolCandidate, T)>,
) -> Option<T> {
    let priority = eligible
        .iter()
        .map(|(candidate, _)| candidate.priority)
        .max()?;
    let total: u64 = eligible
        .iter()
        .filter(|(candidate, _)| candidate.priority == priority)
        .map(|(candidate, _)| u64::from(candidate.weight))
        .sum();
    if total == 0 {
        return None;
    }
    // Routing randomness is not a secret or authorization decision.
    let mut ticket = (uuid::Uuid::new_v4().as_u128() as u64 & 0x3fff_ffff_ffff_ffff) % total;
    for (candidate, route) in eligible {
        if candidate.priority != priority {
            continue;
        }
        if ticket < u64::from(candidate.weight) {
            return Some(route);
        }
        ticket -= u64::from(candidate.weight);
    }
    None
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
    if let Some(schema) = &caps.video_schema {
        schema
            .validate()
            .map_err(|_| ApiError::invalid_request("Invalid video capability schema"))?;
        if schema.upstream_model != upstream_model {
            return Err(ApiError::invalid_request(
                "Video schema model mapping does not match",
            ));
        }
    }
    let pricing: Option<RoutePricing> = pricing
        .map(serde_json::from_value)
        .transpose()
        .map_err(|_| ApiError::invalid_request("Invalid model pricing"))?;
    Ok(ModelConfig {
        catalog: caps.catalog,
        provider: adapter.to_owned(),
        upstream_model: upstream_model.to_owned(),
        api_key_env: "NIU_MANAGED_CREDENTIAL".into(),
        api_base: Some(api_base.to_owned()),
        public_catalog: false,
        pricing,
        supports_embeddings: caps.supports_embeddings,
        supports_embedding_dimensions: caps.supports_embedding_dimensions,
        supports_embedding_base64: caps.supports_embedding_base64,
        supports_tool_calls: caps.supports_tool_calls,
        supports_streaming_tool_calls: caps.supports_streaming_tool_calls,
        supports_structured_output: caps.supports_structured_output,
        supports_responses: caps.supports_responses,
        supports_messages: caps.supports_messages,
        supports_messages_streaming: caps.supports_messages_streaming,
        supports_messages_tools: caps.supports_messages_tools,
        supports_messages_streaming_tools: caps.supports_messages_streaming_tools,
        supports_generate_content: caps.supports_generate_content,
    })
}

pub(super) fn validate_model(alias: &str, model: ModelConfig) -> Result<(), ApiError> {
    let config = AppConfig {
        server: ServerConfig::default(),
        detectors: BTreeMap::new(),
        image_detectors: BTreeMap::new(),
        models: BTreeMap::from([(alias.to_owned(), model)]),
    };
    config.validate().map_err(|_| {
        ApiError::invalid_request("Invalid vendor endpoint, model alias or capabilities")
    })
}

pub(super) fn stored_model(route: &niu_storage::VendorRoute) -> Result<ModelConfig, ApiError> {
    compile_model(&route.vendor, &route.model)
}

pub(super) fn compile_model(
    vendor: &niu_storage::VendorView,
    mapping: &niu_storage::VendorModelView,
) -> Result<ModelConfig, ApiError> {
    let mut model = make_model(
        &vendor.adapter,
        &vendor.api_base,
        &mapping.upstream_model,
        mapping.capabilities.clone(),
        mapping.pricing.clone(),
    )?;
    model.public_catalog = mapping.public_catalog;
    Ok(model)
}

pub(crate) async fn effective_models(
    state: &AppState,
) -> Result<BTreeMap<String, ModelConfig>, ApiError> {
    catalog_models(state, None).await
}

/// Pricing eligibility and its owner-funded diagnostic must observe the same
/// registry state. Publication never changes routing eligibility or funding.
pub(crate) async fn require_customer_tariff_model(
    state: &AppState,
    organization_id: uuid::Uuid,
    alias: &str,
) -> Result<(), ApiError> {
    let inputs = state
        .store
        .vendor_catalog_inputs()
        .await
        .map_err(ApiError::from_store)?;
    let shared = super::catalog_compiler::compile_catalog(&state.config.models, &inputs, None)?;
    if shared.contains_key(alias) {
        return Ok(());
    }
    let scoped = super::catalog_compiler::compile_catalog(
        &state.config.models,
        &inputs,
        Some(organization_id),
    )?;
    if scoped.contains_key(alias) {
        return Err(ApiError::invalid_request(
            "Personal owner-funded models do not accept customer tariffs; choose an available shared billing model",
        ));
    }
    Err(ApiError::invalid_request("Choose an available model alias"))
}

pub(crate) async fn scoped_models(
    state: &AppState,
    organization_id: uuid::Uuid,
) -> Result<BTreeMap<String, ModelConfig>, ApiError> {
    catalog_models(state, Some(organization_id)).await
}

/// Return scoped managed metadata from the same snapshot used for visibility.
/// Consumers must not re-read ownership after computing the visible aliases.
pub(crate) async fn scoped_managed_catalog(
    state: &AppState,
    organization_id: uuid::Uuid,
) -> Result<Vec<niu_storage::VendorCatalogRoute>, ApiError> {
    let inputs = state
        .store
        .vendor_catalog_inputs()
        .await
        .map_err(ApiError::from_store)?;
    let visible = super::catalog_compiler::compile_catalog(
        &state.config.models,
        &inputs,
        Some(organization_id),
    )?;
    Ok(inputs
        .routes
        .into_iter()
        .filter(|route| {
            visible.contains_key(&route.model.alias)
                && route
                    .personal_organization_id
                    .is_none_or(|owner| owner == organization_id)
        })
        .collect())
}

/// Compose all catalog layers from one database snapshot. Discovery does not
/// decrypt credentials or select routes through the live inference resolver.
/// Actual admission must still recheck current ownership and revocation.
async fn catalog_models(
    state: &AppState,
    organization_id: Option<uuid::Uuid>,
) -> Result<BTreeMap<String, ModelConfig>, ApiError> {
    let inputs = state
        .store
        .vendor_catalog_inputs()
        .await
        .map_err(ApiError::from_store)?;
    super::catalog_compiler::compile_catalog(&state.config.models, &inputs, organization_id)
}

pub(crate) async fn resolve_model(
    state: &AppState,
    alias: &str,
) -> Result<ResolvedModel, ApiError> {
    if let Some(selection) = state
        .store
        .shared_vendor_route(alias)
        .await
        .map_err(ApiError::from_store)?
    {
        if selection.uses_media_offer {
            return Err(ApiError::unsupported_message(
                "This model uses a media offer. Use the qualified video job API.",
            ));
        }
        if !selection.supplier_available {
            return Err(ApiError::unavailable());
        }
        let route = selection.route;
        // Ownership is part of the selected row, not a later registry read.
        if route.personal_organization_id.is_some() {
            return Err(ApiError::not_found());
        }
        if !route.vendor.enabled || !route.model.enabled {
            return Err(ApiError::not_found());
        }
        require_selectable_credential(state, route.vendor.id).await?;
        reject_video_text_route(&route)?;
        let cipher = state
            .vendor_cipher
            .as_ref()
            .ok_or_else(ApiError::unavailable)?;
        let api_key = cipher
            .open(route.vendor.id, &route.credential_ciphertext)
            .map_err(|_| ApiError::unavailable())?;
        return Ok(ResolvedModel {
            managed_route: Some(niu_storage::ManagedRouteSnapshot::from(&route)),
            model: stored_model(&route)?,
            api_key,
            personal_route: None,
        });
    }
    let model = state
        .config
        .models
        .get(alias)
        .cloned()
        .ok_or_else(ApiError::not_found)?;
    let api_key = state
        .provider_key(&model.api_key_env)
        .ok_or_else(ApiError::unavailable)?
        .to_owned();
    Ok(ResolvedModel {
        managed_route: None,
        model,
        api_key,
        personal_route: None,
    })
}

// Catalog composition accepts video schemas, but generic text protocols must
// never forward a video-only model to a Chat/Responses/Embeddings endpoint.
fn reject_video_text_route(route: &niu_storage::VendorRoute) -> Result<(), ApiError> {
    if route.model.capabilities.get("video_schema").is_some() {
        return Err(ApiError::unsupported_message(
            "This model requires the dedicated video API. Video generation is not available on this endpoint.",
        ));
    }
    Ok(())
}

#[cfg(test)]
mod video_capability_tests {
    use super::*;
    #[test]
    fn catalog_parser_accepts_valid_video_schema_and_rejects_invalid_mapping() {
        let schema = serde_json::json!({"version":1,"revision":"fixture","model_alias":"video","upstream_model":"upstream-video","channel":"fixture","maximum_body_bytes":1024,"maximum_content_items":1,"inputs":{"text":{"maximum_items":1,"maximum_bytes":256,"https":false,"data_mime_types":[],"roles":[],"role_required":false}},"controls":{},"required_controls":[],"exclusive_controls":[],"callbacks_qualified":false});
        let caps = serde_json::json!({"video_schema":schema});
        assert!(
            make_model(
                "openai",
                "https://fixture.example/v1",
                "upstream-video",
                caps.clone(),
                None
            )
            .is_ok()
        );
        assert!(
            make_model(
                "openai",
                "https://fixture.example/v1",
                "different",
                caps.clone(),
                None
            )
            .is_err()
        );
        let mut invalid = caps;
        invalid["video_schema"]["maximum_content_items"] = serde_json::json!(0);
        assert!(
            make_model(
                "openai",
                "https://fixture.example/v1",
                "upstream-video",
                invalid,
                None
            )
            .is_err()
        );
    }
}
