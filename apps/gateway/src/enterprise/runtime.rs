use std::{env, fs, path::PathBuf, sync::Arc, time::Duration};

use super::{
    context::ContextSigner,
    manifest::{
        EnterpriseError, ModuleDeclaration, ReleaseManifest, RouteDeclaration, route_matches_path,
        validate_manifest,
    },
};
use axum::http::StatusCode;

const MANIFEST_ENV: &str = "NIU_ENTERPRISE_MANIFEST_PATH";
const HEALTH_TIMEOUT: Duration = Duration::from_secs(2);

pub(super) struct ModuleRuntime {
    pub(super) declaration: ModuleDeclaration,
    pub(super) http: reqwest::Client,
}

pub(super) struct RegisteredRoute {
    pub(super) module_index: usize,
    pub(super) declaration: RouteDeclaration,
}

pub struct EnterpriseRuntime {
    pub(super) modules: Vec<ModuleRuntime>,
    routes: Vec<RegisteredRoute>,
    pub(super) signer: ContextSigner,
}

impl EnterpriseRuntime {
    pub(crate) async fn from_env() -> Result<Option<Arc<Self>>, EnterpriseError> {
        let Some(path) = env::var_os(MANIFEST_ENV) else {
            return Ok(None);
        };
        let path = PathBuf::from(path);
        let contents = fs::read(&path).map_err(|error| {
            EnterpriseError(format!(
                "could not read {MANIFEST_ENV} at {}: {error}",
                path.display()
            ))
        })?;
        let manifest: ReleaseManifest = serde_json::from_slice(&contents).map_err(|error| {
            EnterpriseError(format!(
                "{MANIFEST_ENV} is not a valid release manifest: {error}"
            ))
        })?;
        let expected_commit = option_env!("NIU_CORE_GIT_COMMIT").ok_or_else(|| {
            EnterpriseError(format!(
                "{MANIFEST_ENV} requires a Gateway binary built with NIU_CORE_GIT_COMMIT set to a full Git commit"
            ))
        })?;
        let core_version = option_env!("NIU_CORE_API_VERSION").unwrap_or(env!("CARGO_PKG_VERSION"));
        validate_manifest(&manifest, core_version, expected_commit)?;
        let signer = ContextSigner::from_env()?;
        Ok(Some(Arc::new(Self::new(manifest, signer).await?)))
    }

    async fn new(
        manifest: ReleaseManifest,
        signer: ContextSigner,
    ) -> Result<Self, EnterpriseError> {
        let mut modules = Vec::with_capacity(manifest.modules.len());
        for declaration in manifest.modules {
            let mut socket = PathBuf::from(&declaration.socket_path);
            if let Some(root) = std::env::var_os("NIU_DEV_RUNTIME_DIR") {
                if !cfg!(debug_assertions) {
                    return Err(EnterpriseError(
                        "development socket paths require a debug build".into(),
                    ));
                }
                let root = PathBuf::from(root);
                if !root.is_absolute() {
                    return Err(EnterpriseError(
                        "development runtime directory must be absolute".into(),
                    ));
                }
                socket = root.join("modules").join(
                    socket
                        .file_name()
                        .ok_or_else(|| EnterpriseError("missing module socket name".into()))?,
                );
            }
            let http = reqwest::Client::builder()
                .unix_socket(socket)
                .redirect(reqwest::redirect::Policy::none())
                .build()
                .map_err(|error| {
                    EnterpriseError(format!(
                        "could not configure module {} socket client: {error}",
                        declaration.module_id
                    ))
                })?;
            modules.push(ModuleRuntime { declaration, http });
        }
        let runtime = Self {
            routes: build_route_registry(&modules),
            modules,
            signer,
        };
        let health =
            futures_util::future::join_all(runtime.modules.iter().map(ModuleRuntime::is_healthy))
                .await;
        for (module, healthy) in runtime.modules.iter().zip(health) {
            if healthy {
                tracing::info!(module_id = %module.declaration.module_id, "Enterprise module health checks passed");
            } else if module.declaration.required {
                tracing::warn!(module_id = %module.declaration.module_id, "required Enterprise module is unhealthy; Enterprise readiness is unavailable");
            } else {
                tracing::warn!(module_id = %module.declaration.module_id, "optional Enterprise module is unhealthy; its routes currently return 503");
            }
        }
        Ok(runtime)
    }

    pub(crate) async fn ready(&self) -> bool {
        let required = self
            .modules
            .iter()
            .filter(|module| module.declaration.required);
        futures_util::future::join_all(required.map(ModuleRuntime::is_healthy))
            .await
            .into_iter()
            .all(|healthy| healthy)
    }

    pub(super) fn matching_route(&self, path: &str) -> Option<&RegisteredRoute> {
        self.routes
            .iter()
            .find(|route| route_matches_path(&route.declaration.path_prefix, path))
    }

    #[cfg(test)]
    pub(super) async fn for_test(
        manifest: ReleaseManifest,
        seed: &[u8; 32],
        kid: &str,
    ) -> Result<Self, EnterpriseError> {
        use super::context::ContextSigner;
        Self::new(manifest, ContextSigner::from_seed(seed, kid.to_owned())).await
    }
}

impl ModuleRuntime {
    pub(super) async fn is_healthy(&self) -> bool {
        let live_url = format!("http://niu-module{}", self.declaration.health.live_path);
        let ready_url = format!("http://niu-module{}", self.declaration.health.ready_path);
        let live = self.http.get(live_url).timeout(HEALTH_TIMEOUT).send();
        let ready = self.http.get(ready_url).timeout(HEALTH_TIMEOUT).send();
        let (live, ready) = tokio::join!(live, ready);
        matches!(live, Ok(response) if response.status() == StatusCode::OK)
            && matches!(ready, Ok(response) if response.status() == StatusCode::OK)
    }
}

fn build_route_registry(modules: &[ModuleRuntime]) -> Vec<RegisteredRoute> {
    modules
        .iter()
        .enumerate()
        .flat_map(|(module_index, module)| {
            module
                .declaration
                .routes
                .iter()
                .cloned()
                .map(move |declaration| RegisteredRoute {
                    module_index,
                    declaration,
                })
        })
        .collect()
}
