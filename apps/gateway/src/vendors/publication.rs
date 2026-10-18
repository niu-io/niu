//! Pure server-side registry compilation. Secrets and live availability are excluded.
use super::models::{compile_model, validate_model};
use crate::config::ModelConfig;
use niu_storage::{
    ModelRoutePool, RouteRegistryCompiler, RouteRegistryInputs, RouteRegistryOffer, StoreError,
    VendorCatalogRoute,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

#[derive(Deserialize, Serialize)]
pub(crate) struct CompiledRoute {
    pub metadata: VendorCatalogRoute,
    pub model: ModelConfig,
}

/// Complete configured definitions. Consumers apply live exclusion, never fallback
/// to a second source after a disabled managed alias has shadowed a static one.
#[derive(Deserialize, Serialize)]
pub(crate) struct Registry {
    pub version: u32,
    pub static_models: BTreeMap<String, ModelConfig>,
    pub routes: BTreeMap<String, CompiledRoute>,
    pub pools: BTreeMap<String, ModelRoutePool>,
    pub offers: BTreeMap<String, RouteRegistryOffer>,
}

pub(crate) struct Compiler {
    available_static_keys: std::collections::BTreeSet<String>,
    static_models: BTreeMap<String, ModelConfig>,
    identity: String,
}

impl Compiler {
    pub(crate) fn new(
        models: BTreeMap<String, ModelConfig>,
        available_static_keys: std::collections::BTreeSet<String>,
    ) -> Result<Self, StoreError> {
        for (alias, model) in &models {
            validate_model(alias, model.clone()).map_err(|_| StoreError::InvalidVendor)?;
        }
        let bytes = serde_json::to_vec(&models).map_err(|_| StoreError::InvalidVendor)?;
        let identity = format!("{:x}", Sha256::digest(bytes));
        Ok(Self {
            available_static_keys,
            static_models: models,
            identity,
        })
    }
}

static LOCAL_COMPILE_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

impl RouteRegistryCompiler for Compiler {
    fn static_identity(&self) -> &str {
        &self.identity
    }

    fn compile(&self, inputs: RouteRegistryInputs) -> Result<serde_json::Value, StoreError> {
        LOCAL_COMPILE_SEQ.fetch_add(1, std::sync::atomic::Ordering::Release);
        let mut static_models = self.static_models.clone();
        let mut routes = BTreeMap::new();
        for metadata in inputs.routes {
            let alias = metadata.model.alias.clone();
            let model = compile_model(&metadata.vendor, &metadata.model)
                .map_err(|_| StoreError::InvalidVendor)?;
            validate_model(&alias, model.clone()).map_err(|_| StoreError::InvalidVendor)?;
            static_models.remove(&alias);
            if routes
                .insert(alias, CompiledRoute { metadata, model })
                .is_some()
            {
                return Err(StoreError::Conflict);
            }
        }
        let mut pools = BTreeMap::new();
        for pool in inputs.pools {
            static_models.remove(&pool.alias);
            if pool.candidates.is_empty() || pool.candidates.len() > 64 {
                return Err(StoreError::InvalidVendor);
            }
            let mut seen = std::collections::BTreeSet::new();
            for candidate in &pool.candidates {
                let route = routes
                    .get(&candidate.alias)
                    .ok_or(StoreError::InvalidVendor)?;
                if !seen.insert(&candidate.alias)
                    || !(-1000..=1000).contains(&candidate.priority)
                    || !(1..=10000).contains(&candidate.weight)
                    || route.metadata.personal_organization_id != pool.organization_id
                {
                    return Err(StoreError::InvalidVendor);
                }
            }
            if pools.insert(pool.alias.clone(), pool).is_some() {
                return Err(StoreError::Conflict);
            }
        }
        let mut offers = BTreeMap::new();
        for offer in inputs.offers {
            // The existence of an offer is itself a static-shadowing constraint.
            static_models.remove(&offer.model_alias);
            if offers.insert(offer.model_alias.clone(), offer).is_some() {
                return Err(StoreError::Conflict);
            }
        }
        if static_models
            .values()
            .any(|model| !self.available_static_keys.contains(&model.api_key_env))
        {
            return Err(StoreError::InvalidVendor);
        }
        serde_json::to_value(Registry {
            version: 1,
            static_models,
            routes,
            pools,
            offers,
        })
        .map_err(|_| StoreError::InvalidVendor)
    }
}

/// Immutable request-held handle; a reload never mutates an existing handle.
pub(crate) struct Published {
    pub generation: i64,
    pub registry: Registry,
    checked: std::sync::Mutex<(u64, std::time::Instant)>,
}

pub(crate) async fn snapshot(
    state: &crate::state::AppState,
) -> Result<Option<std::sync::Arc<Published>>, crate::error::ApiError> {
    use crate::error::ApiError;
    let compile_seq = LOCAL_COMPILE_SEQ.load(std::sync::atomic::Ordering::Acquire);
    if let Some(cached) = state.route_registry.read().await.as_ref()
        && let Ok(checked) = cached.checked.lock()
        && checked.0 == compile_seq
        && checked.1.elapsed() < std::time::Duration::from_millis(100)
    {
        return Ok(Some(cached.clone()));
    }
    let Some(generation) = state
        .store
        .route_registry_generation()
        .await
        .map_err(ApiError::from_store)?
    else {
        // Inactive library stores retain compatibility; initialized runtimes fail closed.
        return if state.store.route_registry_static_identity().is_some() {
            Err(ApiError::unavailable())
        } else {
            Ok(None)
        };
    };
    if let Some(cached) = state.route_registry.read().await.as_ref()
        && cached.generation >= generation
    {
        if let Ok(mut checked) = cached.checked.lock() {
            *checked = (compile_seq, std::time::Instant::now());
        }
        return Ok(Some(cached.clone()));
    }
    let _reload_guard = state.route_registry_reload.lock().await;
    if let Some(cached) = state.route_registry.read().await.as_ref()
        && cached.generation >= generation
    {
        if let Ok(mut checked) = cached.checked.lock() {
            *checked = (compile_seq, std::time::Instant::now());
        }
        return Ok(Some(cached.clone()));
    }
    let publication = state
        .store
        .route_registry_publication(generation)
        .await
        .map_err(ApiError::from_store)?;
    if state
        .store
        .route_registry_static_identity()
        .is_some_and(|identity| identity != publication.static_identity)
    {
        return Err(ApiError::from_store(
            niu_storage::StoreError::ManagedRouteChanged,
        ));
    }
    let registry: Registry =
        serde_json::from_value(publication.compiled).map_err(|_| ApiError::unavailable())?;
    if registry.version != 1 {
        return Err(ApiError::unavailable());
    }
    let published = std::sync::Arc::new(Published {
        generation,
        registry,
        checked: std::sync::Mutex::new((compile_seq, std::time::Instant::now())),
    });
    let mut cached = state.route_registry.write().await;
    // An older concurrent loader must not replace a newer complete generation.
    if let Some(current) = cached.as_ref()
        && current.generation >= generation
    {
        return Ok(Some(current.clone()));
    }
    *cached = Some(published.clone());
    Ok(Some(published))
}

pub(crate) async fn catalog_inputs(
    state: &crate::state::AppState,
) -> Result<
    (
        BTreeMap<String, ModelConfig>,
        niu_storage::VendorCatalogInputs,
    ),
    crate::error::ApiError,
> {
    use crate::error::ApiError;
    let Some(published) = snapshot(state).await? else {
        return Ok((
            state.config.models.clone(),
            state
                .store
                .vendor_catalog_inputs()
                .await
                .map_err(ApiError::from_store)?,
        ));
    };
    let (unavailable, cooling_down) = state
        .store
        .route_registry_live_eligibility()
        .await
        .map_err(ApiError::from_store)?;
    Ok((
        published.registry.static_models.clone(),
        niu_storage::VendorCatalogInputs {
            routes: published
                .registry
                .routes
                .values()
                .map(|route| route.metadata.clone())
                .collect(),
            pools: published.registry.pools.values().cloned().collect(),
            unavailable,
            cooling_down,
        },
    ))
}

/// ```openapi
/// {
///   "path": "/api/v1/routing-registry",
///   "method": "get",
///   "operation": {
///     "operationId": "getRoutingRegistryStatus",
///     "summary": "Read the active routing generation",
///     "description": "Platform administrators can read the active immutable routing generation for diagnostics and an explicit static-configuration replacement. No definitions, endpoints, credential references, secrets or purchase prices are returned. local_static_configuration_matches is false on a Gateway whose local static configuration has been superseded; new inference on that instance fails closed until it restarts with matching configuration. The response is not cached.",
///     "tags": ["Admin"],
///     "security": [{"bearerAuth": []}],
///     "responses": {
///       "200": {"description": "Active publication status", "content": {"application/json": {"schema": {
///         "type": "object", "required": ["data"], "properties": {"data": {
///           "type": "object", "required": ["generation", "format_version", "local_static_configuration_matches"],
///           "properties": {
///             "generation": {"type": "string", "pattern": "^[1-9][0-9]*$"},
///             "format_version": {"type": "integer", "enum": [1]},
///             "local_static_configuration_matches": {"type": "boolean"}
///           }
///         }}
///       }}}},
///       "401": {"description": "Missing or invalid authorization"},
///       "403": {"description": "Platform administration is required"},
///       "503": {"description": "Publication is unavailable or its format is unsupported"}
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub(crate) async fn status(
    axum::extract::State(state): axum::extract::State<crate::state::AppState>,
    headers: axum::http::HeaderMap,
) -> Result<impl axum::response::IntoResponse, crate::error::ApiError> {
    use crate::error::ApiError;
    super::api::installation(&state, &headers).await?;
    let generation = state
        .store
        .route_registry_generation()
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::unavailable)?;
    let publication = state
        .store
        .route_registry_publication(generation)
        .await
        .map_err(ApiError::from_store)?;
    if publication
        .compiled
        .get("version")
        .and_then(serde_json::Value::as_u64)
        != Some(1)
    {
        return Err(ApiError::unavailable());
    }
    Ok((
        [(axum::http::header::CACHE_CONTROL, "no-store")],
        axum::Json(serde_json::json!({"data": {
            "generation": generation.to_string(), "format_version": 1,
            "local_static_configuration_matches": state.store.route_registry_static_identity() == Some(publication.static_identity.as_str())
        }})),
    ))
}
