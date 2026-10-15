//! Catalog composition from an already acquired registry input snapshot.
//! No database reads, credential decryption, or upstream calls occur here.
//! This projection is not a published inference generation.
use super::models::compile_model;
use crate::{config::ModelConfig, error::ApiError};
use std::collections::BTreeMap;

pub(super) fn compile_catalog(
    static_models: &BTreeMap<String, ModelConfig>,
    inputs: &niu_storage::VendorCatalogInputs,
    organization_id: Option<uuid::Uuid>,
) -> Result<BTreeMap<String, ModelConfig>, ApiError> {
    let mut models = static_models.clone();
    let mut routes = BTreeMap::new();
    for route in &inputs.routes {
        routes.insert(route.model.alias.as_str(), route);
        // Every database alias shadows static configuration, even when disabled
        // or owned by a different account.
        models.remove(&route.model.alias);
        if !route.vendor.enabled || !route.model.enabled {
            continue;
        }
        match route.personal_organization_id {
            Some(owner) if Some(owner) == organization_id => {
                let mut model = compile_model(&route.vendor, &route.model)?;
                model.pricing = None;
                model.public_catalog = false;
                models.insert(route.model.alias.clone(), model);
            }
            None if !inputs.unavailable.contains(&route.model.alias) => {
                models.insert(
                    route.model.alias.clone(),
                    compile_model(&route.vendor, &route.model)?,
                );
            }
            _ => {}
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
                    && route.vendor.enabled
                    && route.model.enabled
                    && !inputs.cooling_down.contains(&route.vendor.id)
                    && route.model.capabilities.get("video_schema").is_none()
                    && route.personal_organization_id == pool.organization_id
                    && (pool.organization_id.is_some()
                        || (route.model.pricing.is_some()
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
            model.public_catalog = false;
            if pool.organization_id.is_some() {
                model.pricing = None;
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
) -> Result<BTreeMap<String, ModelConfig>, ApiError> {
    let mut models = registry.static_models.clone();
    for (alias, compiled) in &registry.routes {
        let route = &compiled.metadata;
        models.remove(alias);
        if !route.vendor.enabled || !route.model.enabled {
            continue;
        }
        match route.personal_organization_id {
            Some(owner) if Some(owner) == organization_id => {
                let mut model = compiled.model.clone();
                model.pricing = None;
                model.public_catalog = false;
                models.insert(alias.clone(), model);
            }
            None if !unavailable.contains(alias) => {
                models.insert(alias.clone(), compiled.model.clone());
            }
            _ => {}
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
                    && route.vendor.enabled
                    && route.model.enabled
                    && !cooling_down.contains(&route.vendor.id)
                    && route.model.capabilities.get("video_schema").is_none()
                    && route.personal_organization_id == pool.organization_id
                    && (pool.organization_id.is_some()
                        || (route.model.pricing.is_some()
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
            model.public_catalog = false;
            if pool.organization_id.is_some() {
                model.pricing = None;
            }
            models.insert(pool.alias.clone(), model);
        }
    }
    Ok(models)
}
