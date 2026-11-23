//! Catalog composition from an already acquired registry input snapshot.
//! No database reads, credential decryption, or upstream calls occur here.
//! This projection is not a published inference generation.
use super::models::compile_model;
use crate::{config::ModelConfig, error::ApiError};
use std::collections::{BTreeMap, BTreeSet};

pub(super) fn route_has_enabled_vendor(
    route: &niu_storage::VendorCatalogRoute,
    pooled_vendors: &[niu_storage::VendorPoolMember],
) -> bool {
    if route.vendor.enabled && route.vendor.has_credential {
        return true;
    }
    pooled_vendors
        .iter()
        .any(|member| member.enabled && member.has_credential && member.matches_route(route))
}

pub(super) fn route_has_active_vendor(
    route: &niu_storage::VendorCatalogRoute,
    pooled_vendors: &[niu_storage::VendorPoolMember],
    cooling_down: &BTreeSet<uuid::Uuid>,
    excluded_vendors: &[uuid::Uuid],
) -> bool {
    if route.vendor.enabled
        && route.vendor.has_credential
        && !cooling_down.contains(&route.vendor.id)
        && !excluded_vendors.contains(&route.vendor.id)
    {
        return true;
    }
    pooled_vendors.iter().any(|member| {
        member.enabled
            && member.has_credential
            && !cooling_down.contains(&member.id)
            && !excluded_vendors.contains(&member.id)
            && member.matches_route(route)
    })
}

pub(super) fn compile_catalog(
    static_models: &BTreeMap<String, ModelConfig>,
    inputs: &niu_storage::VendorCatalogInputs,
    organization_id: Option<uuid::Uuid>,
    allow_internal_scope: bool,
) -> Result<BTreeMap<String, ModelConfig>, ApiError> {
    let mut models = static_models.clone();
    let mut routes = BTreeMap::new();
    for route in &inputs.routes {
        routes.insert(route.model.alias.as_str(), route);
        // Every database alias shadows static configuration, even when disabled
        // or owned by a different account.
        models.remove(&route.model.alias);
        if !route.model.enabled || !route_has_enabled_vendor(route, &inputs.pooled_vendors) {
            continue;
        }
        let access_scope = route.access_scope();
        let internal_visible = allow_internal_scope
            && access_scope == niu_storage::VendorAccessScope::Internal
            && route.visible_to(organization_id, true);
        if internal_visible {
            let mut model = compile_model(&route.vendor, &route.model)?;
            // Internal owner-funded routes never carry customer or procurement
            // tariff data. Their configured public-catalog flag is honored so a
            // checked toggle has a truthful visible result.
            model.pricing = None;
            models.insert(route.model.alias.clone(), model);
        } else if access_scope == niu_storage::VendorAccessScope::Commercial {
            if !inputs.unavailable.contains(&route.model.alias) {
                models.insert(
                    route.model.alias.clone(),
                    compile_model(&route.vendor, &route.model)?,
                );
            }
        } else if route.personal_organization_id == organization_id {
            // Personal (and internal scope while Resale is active) remains
            // private to the recorded funding account.
            let mut model = compile_model(&route.vendor, &route.model)?;
            model.pricing = None;
            model.public_catalog = false;
            models.insert(route.model.alias.clone(), model);
        }
    }
    // An unavailable offer may shadow a static-only alias as well.
    for alias in &inputs.unavailable {
        if !routes.contains_key(alias.as_str()) {
            models.remove(alias);
        }
    }
    for pool in &inputs.pools {
        models.remove(&pool.alias);
        if !pool.enabled
            || pool
                .organization_id
                .is_some_and(|owner| Some(owner) != organization_id)
        {
            continue;
        }
        if pool.candidates.len() > 64 {
            return Err(ApiError::unavailable());
        }
        let representative = pool
            .candidates
            .iter()
            .filter_map(|candidate| {
                let route = *routes.get(candidate.alias.as_str())?;
                (candidate.enabled
                    && route.model.enabled
                    && route_has_active_vendor(route, &inputs.pooled_vendors, &inputs.cooling_down, &[])
                    && route.model.capabilities.get("video_schema").is_none()
                    && (route.personal_organization_id == pool.organization_id
                        || (allow_internal_scope
                            && pool.organization_id.is_some()
                            && route.is_internal_shared()))
                    && (pool.organization_id.is_some()
                        || ((route.model.pricing.is_some()
                            || inputs.text_offer_aliases.contains(&route.model.alias))
                            && !inputs.unavailable.contains(&route.model.alias))))
                .then_some((candidate, route))
            })
            // A directory read must not perform request load balancing. Choose
            // the highest-priority candidate, then the smallest alias so neither
            // randomness nor candidate insertion order changes its metadata.
            .max_by(|(a, _), (b, _)| {
                a.priority
                    .cmp(&b.priority)
                    .then_with(|| b.alias.cmp(&a.alias))
            });
        if let Some((_, route)) = representative {
            let mut model = compile_model(&route.vendor, &route.model)?;
            model.public_catalog = pool.organization_id.is_none() && pool.public_catalog;
            if pool.organization_id.is_some() {
                model.pricing = None;
            }
            if let Some(display_name) = &pool.display_name {
                model.catalog.name = Some(display_name.clone());
            }
            if let Some(description) = &pool.description {
                model.catalog.description = Some(description.clone());
            }
            models.insert(pool.alias.clone(), model);
        }
    }
    Ok(models)
}

pub(super) fn compile_published_catalog(
    registry: &super::publication::Registry,
    unavailable: &std::collections::BTreeSet<String>,
    cooling_down: &std::collections::BTreeSet<uuid::Uuid>,
    organization_id: Option<uuid::Uuid>,
    allow_internal_scope: bool,
) -> Result<BTreeMap<String, ModelConfig>, ApiError> {
    let mut models = registry.static_models.clone();
    for (alias, compiled) in &registry.routes {
        let route = &compiled.metadata;
        models.remove(alias);
        if !route.model.enabled || !route_has_enabled_vendor(route, &registry.pooled_vendors) {
            continue;
        }
        let access_scope = route.access_scope();
        let internal_visible = allow_internal_scope
            && access_scope == niu_storage::VendorAccessScope::Internal
            && route.visible_to(organization_id, true);
        if internal_visible {
            let mut model = compiled.model.clone();
            model.pricing = None;
            models.insert(alias.clone(), model);
        } else if access_scope == niu_storage::VendorAccessScope::Commercial {
            if !unavailable.contains(alias) {
                models.insert(alias.clone(), compiled.model.clone());
            }
        } else if route.personal_organization_id == organization_id {
            let mut model = compiled.model.clone();
            model.pricing = None;
            model.public_catalog = false;
            models.insert(alias.clone(), model);
        }
    }
    for alias in unavailable {
        if !registry.routes.contains_key(alias.as_str()) {
            models.remove(alias);
        }
    }
    for pool in registry.pools.values() {
        models.remove(&pool.alias);
        if !pool.enabled
            || pool
                .organization_id
                .is_some_and(|owner| Some(owner) != organization_id)
        {
            continue;
        }
        if pool.candidates.len() > 64 {
            return Err(ApiError::unavailable());
        }
        let representative = pool
            .candidates
            .iter()
            .filter_map(|candidate| {
                let compiled = registry.routes.get(candidate.alias.as_str())?;
                let route = &compiled.metadata;
                (candidate.enabled
                    && route.model.enabled
                    && route_has_active_vendor(route, &registry.pooled_vendors, cooling_down, &[])
                    && route.model.capabilities.get("video_schema").is_none()
                    && (route.personal_organization_id == pool.organization_id
                        || (allow_internal_scope
                            && pool.organization_id.is_some()
                            && route.is_internal_shared()))
                    && (pool.organization_id.is_some()
                        || ((route.model.pricing.is_some()
                            || registry.offers.get(&route.model.alias).is_some_and(|offer| {
                                offer.active && offer.rate_kind.as_deref() != Some("media")
                            }))
                            && !unavailable.contains(&route.model.alias))))
                .then_some((candidate, compiled))
            })
            .max_by(|(a, _), (b, _)| {
                a.priority
                    .cmp(&b.priority)
                    .then_with(|| b.alias.cmp(&a.alias))
            });
        if let Some((_, compiled)) = representative {
            let mut model = compiled.model.clone();
            model.public_catalog = pool.organization_id.is_none() && pool.public_catalog;
            if pool.organization_id.is_some() {
                model.pricing = None;
            }
            if let Some(display_name) = &pool.display_name {
                model.catalog.name = Some(display_name.clone());
            }
            if let Some(description) = &pool.description {
                model.catalog.description = Some(description.clone());
            }
            models.insert(pool.alias.clone(), model);
        }
    }
    Ok(models)
}
