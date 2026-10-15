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
    provider_assets: Option<ProviderAssetCapabilities>,
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

/// Explicit protocol capability, not asset readiness or Provider qualification.
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct ProviderAssetCapabilities {
    channel: ProviderAssetChannel,
}

#[derive(Clone, Deserialize, Serialize)]
enum ProviderAssetChannel {
    #[serde(rename = "fastrouter-actions-v1")]
    FastRouterActionsV1,
}

pub(crate) struct ResolvedModel {
    pub route_generation: Option<i64>,
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
    if let Some(published) = super::publication::snapshot(state).await? {
        return resolve_published(
            state,
            &published,
            Some(organization_id),
            alias,
            Some(&protocol),
            requirements,
            excluded_vendors,
        )
        .await;
    }
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
            route_generation: None,
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
            let model = stored_model(&route)?;
            let supported = supports_protocol(&model, protocol);
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
        route_generation: None,
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
    if caps.provider_assets.is_some() && adapter != "ark" {
        return Err(ApiError::invalid_request(
            "FastRouter asset capabilities require an Ark adapter",
        ));
    }
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
        media_detectors: BTreeMap::new(),
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

/// Price preparation requires a registered shared billing identity, not a live
/// eligible inference route. Use one registry snapshot and preserve alias
/// shadowing so disabled/draft routes cannot fall back to static configuration.
/// Publishing a price never qualifies supply, grants a key or enables dispatch.
pub(crate) async fn require_customer_tariff_model(
    state: &AppState,
    organization_id: uuid::Uuid,
    alias: &str,
) -> Result<(), ApiError> {
    let (static_models, inputs) = super::publication::catalog_inputs(state).await?;
    // Pools shadow managed and static aliases even while disabled or empty.
    let ownership = if let Some(pool) = inputs.pools.iter().find(|pool| pool.alias == alias) {
        Some(pool.organization_id)
    } else if let Some(route) = inputs
        .routes
        .iter()
        .find(|route| route.model.alias == alias)
    {
        Some(route.personal_organization_id)
    } else if static_models.contains_key(alias) {
        Some(None)
    } else {
        None
    };
    match ownership {
        Some(None) => Ok(()),
        Some(Some(owner)) if owner == organization_id => Err(ApiError::invalid_request(
            "Personal owner-funded models do not accept customer tariffs; choose a registered shared billing model",
        )),
        _ => Err(ApiError::invalid_request(
            "Choose a registered shared model alias",
        )),
    }
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
    let (static_models, inputs) = super::publication::catalog_inputs(state).await?;
    let visible =
        super::catalog_compiler::compile_catalog(&static_models, &inputs, Some(organization_id))?;
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
    let (static_models, inputs) = super::publication::catalog_inputs(state).await?;
    super::catalog_compiler::compile_catalog(&static_models, &inputs, organization_id)
}

pub(crate) async fn resolve_model(
    state: &AppState,
    alias: &str,
) -> Result<ResolvedModel, ApiError> {
    if let Some(published) = super::publication::snapshot(state).await? {
        return resolve_published(state, &published, None, alias, None, None, &[]).await;
    }
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
        if selection.cooling_down {
            tracing::debug!(
                reason = "upstream_credential_cooldown",
                "Credential unavailable for new selection"
            );
            return Err(ApiError::credential_cooldown());
        }
        reject_video_text_route(&route)?;
        let cipher = state
            .vendor_cipher
            .as_ref()
            .ok_or_else(ApiError::unavailable)?;
        let api_key = cipher
            .open(route.vendor.id, &route.credential_ciphertext)
            .map_err(|_| ApiError::unavailable())?;
        return Ok(ResolvedModel {
            route_generation: None,
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
        route_generation: None,
        managed_route: None,
        model,
        api_key,
        personal_route: None,
    })
}

fn supports_protocol(model: &ModelConfig, protocol: &crate::guardrails::input::Protocol) -> bool {
    use crate::guardrails::input::Protocol;
    match protocol {
        Protocol::Chat => model.protocol().supports_chat_completions(),
        Protocol::Responses => model.protocol().is_openai_compatible() && model.supports_responses,
        Protocol::Embeddings => {
            model.protocol().is_openai_compatible() && model.supports_embeddings
        }
        Protocol::Messages => {
            model.supports_messages && matches!(model.provider.as_str(), "openrouter" | "anthropic")
        }
        Protocol::GenerateContent => model.supports_generate_content && model.provider == "gemini",
        Protocol::VideoText => false,
    }
}

async fn resolve_published(
    state: &AppState,
    published: &super::publication::Published,
    organization: Option<uuid::Uuid>,
    alias: &str,
    protocol: Option<&crate::guardrails::input::Protocol>,
    requirements: Option<&crate::config::ModelRequirements>,
    excluded_vendors: &[uuid::Uuid],
) -> Result<ResolvedModel, ApiError> {
    let registry = &published.registry;
    let pool = registry.pools.get(alias);
    let selected = if let Some(pool) = pool {
        if !pool.enabled
            || pool
                .organization_id
                .is_some_and(|owner| Some(owner) != organization)
        {
            return Err(ApiError::not_found());
        }
        let (unavailable, cooling_down) = state
            .store
            .route_registry_live_eligibility()
            .await
            .map_err(ApiError::from_store)?;
        let eligible = pool
            .candidates
            .iter()
            .filter_map(|candidate| {
                let route = registry.routes.get(&candidate.alias)?;
                let metadata = &route.metadata;
                (candidate.enabled
                    && metadata.vendor.enabled
                    && metadata.model.enabled
                    && metadata.vendor.has_credential
                    && !excluded_vendors.contains(&metadata.vendor.id)
                    && !cooling_down.contains(&metadata.vendor.id)
                    && metadata.model.capabilities.get("video_schema").is_none()
                    && metadata.personal_organization_id == pool.organization_id
                    && (pool.organization_id.is_some()
                        || (route.model.pricing.is_some()
                            && !unavailable.contains(&candidate.alias)))
                    && protocol.is_none_or(|protocol| supports_protocol(&route.model, protocol))
                    && requirements.is_none_or(|required| required.allows(&route.model)))
                .then_some((candidate, route))
            })
            .collect();
        Some(select_candidate(eligible).ok_or_else(ApiError::route_pool_unavailable)?)
    } else {
        if !excluded_vendors.is_empty() {
            return Err(ApiError::route_pool_unavailable());
        }
        registry.routes.get(alias)
    };
    let Some(selected) = selected else {
        let model = registry
            .static_models
            .get(alias)
            .cloned()
            .ok_or_else(ApiError::not_found)?;
        let api_key = state
            .provider_key(&model.api_key_env)
            .ok_or_else(ApiError::unavailable)?
            .to_owned();
        return Ok(ResolvedModel {
            route_generation: Some(published.generation),
            managed_route: None,
            model,
            api_key,
            personal_route: None,
        });
    };
    let metadata = &selected.metadata;
    if !metadata.vendor.enabled
        || !metadata.model.enabled
        || metadata
            .personal_organization_id
            .is_some_and(|owner| Some(owner) != organization)
    {
        return Err(ApiError::not_found());
    }
    // This is an exclusion/secret read, never a source of replacement definitions.
    let live = state
        .store
        .shared_vendor_route(&metadata.model.alias)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(|| ApiError::from_store(niu_storage::StoreError::ManagedRouteChanged))?;
    let route = live.route;
    if route.vendor.id != metadata.vendor.id
        || route.vendor.revision != metadata.vendor.revision
        || route.model.revision != metadata.model.revision
        || route.personal_organization_id != metadata.personal_organization_id
    {
        return Err(ApiError::from_store(
            niu_storage::StoreError::ManagedRouteChanged,
        ));
    }
    let personal = metadata.personal_organization_id.is_some();
    if !personal && !live.supplier_available {
        return Err(ApiError::unavailable());
    }
    if !personal && live.uses_media_offer {
        return Err(ApiError::unsupported_message(
            "This model uses a media offer. Use the qualified video job API.",
        ));
    }
    if live.cooling_down {
        tracing::debug!(
            reason = "upstream_credential_cooldown",
            "Credential unavailable for new selection"
        );
        return Err(ApiError::credential_cooldown());
    }
    reject_video_text_route(&route)?;
    let api_key = state
        .vendor_cipher
        .as_ref()
        .ok_or_else(ApiError::unavailable)?
        .open(metadata.vendor.id, &route.credential_ciphertext)
        .map_err(|_| ApiError::unavailable())?;
    let mut model = selected.model.clone();
    if personal {
        model.pricing = None;
    }
    if personal || pool.is_some() {
        model.public_catalog = false;
    }
    let mut managed = niu_storage::ManagedRouteSnapshot::from(&route);
    if let Some(pool) = pool {
        managed.pool_alias = Some(pool.alias.clone());
        managed.pool_revision = Some(pool.revision);
    }
    Ok(ResolvedModel {
        route_generation: Some(published.generation),
        managed_route: Some(managed),
        model,
        api_key,
        personal_route: personal.then_some(route),
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
