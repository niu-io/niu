use std::{env, fs, path::PathBuf, sync::Arc, time::Duration};

use axum::http::{Method, StatusCode, header};
use niu_plugin_api::{OutboxDeliveryReceipt, OutboxEvent, PluginHookRegistry, RouteAuthMode};
use uuid::Uuid;

use super::{
    context::{ContextPrincipal, ContextSigner, SignedPluginRequestContext},
    manifest::{
        EnterpriseError, ModuleDeclaration, ReleaseManifest, RouteDeclaration, RoutePermission,
        route_matches_path, validate_manifest,
    },
};

const PLUGIN_MANIFEST_ENV: &str = "NIU_PLUGIN_MANIFEST_PATH";
const MANIFEST_ENV: &str = "NIU_ENTERPRISE_MANIFEST_PATH";
const OUTBOX_DELIVERY_PATH: &str = "/_niu/plugins/v1/outbox/events";
const HEALTH_TIMEOUT: Duration = Duration::from_secs(2);
const HEALTH_CACHE_TTL: Duration = Duration::from_secs(2);

pub(super) struct ModuleRuntime {
    pub(super) declaration: ModuleDeclaration,
    pub(super) http: reqwest::Client,
    healthy_until: std::sync::Mutex<Option<std::time::Instant>>,
    probe_lock: tokio::sync::Mutex<()>,
}

pub(super) struct RegisteredRoute {
    pub(super) module_index: usize,
    pub(super) declaration: RouteDeclaration,
}

pub struct EnterpriseRuntime {
    pub(super) modules: Vec<ModuleRuntime>,
    routes: Vec<RegisteredRoute>,
    pub(super) signer: ContextSigner,
    pub hooks: Arc<PluginHookRegistry>,
}

impl EnterpriseRuntime {
    pub(crate) async fn from_env() -> Result<Option<Arc<Self>>, EnterpriseError> {
        let (env_var_name, path) = if let Some(path) = env::var_os(PLUGIN_MANIFEST_ENV) {
            (PLUGIN_MANIFEST_ENV, PathBuf::from(path))
        } else if let Some(path) = env::var_os(MANIFEST_ENV) {
            (MANIFEST_ENV, PathBuf::from(path))
        } else {
            return Ok(None);
        };
        let contents = fs::read(&path).map_err(|error| {
            EnterpriseError(format!(
                "could not read {env_var_name} at {}: {error}",
                path.display()
            ))
        })?;
        let manifest: ReleaseManifest = serde_json::from_slice(&contents).map_err(|error| {
            EnterpriseError(format!(
                "{env_var_name} is not a valid release manifest: {error}"
            ))
        })?;
        let expected_commit = option_env!("NIU_CORE_GIT_COMMIT").ok_or_else(|| {
            EnterpriseError(format!(
                "{env_var_name} requires a Gateway binary built with NIU_CORE_GIT_COMMIT set to a full Git commit"
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
        let mut hooks = PluginHookRegistry::new();
        let mut modules = Vec::with_capacity(manifest.modules.len());
        for declaration in manifest.modules {
            match declaration.module_id.as_str() {
                niu_plugin_request_tagger::PLUGIN_ID => {
                    let plugin =
                        Arc::new(niu_plugin_request_tagger::RequestTaggerPlugin::default());
                    hooks.register_policy_hook(plugin.clone());
                    hooks.register_route_selector(plugin);
                }
                niu_plugin_webhook_audit::PLUGIN_ID => {
                    let plugin = Arc::new(niu_plugin_webhook_audit::WebhookAuditPlugin::new());
                    hooks.register_metering_observer(plugin);
                }
                _ => {}
            }

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
                let subdir = if declaration.socket_path.starts_with("/run/niu/plugins/") {
                    "plugins"
                } else {
                    "modules"
                };
                socket = root.join(subdir).join(
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
            modules.push(ModuleRuntime {
                declaration,
                http,
                healthy_until: std::sync::Mutex::new(None),
                probe_lock: tokio::sync::Mutex::new(()),
            });
        }
        let runtime = Self {
            routes: build_route_registry(&modules),
            modules,
            signer,
            hooks: Arc::new(hooks),
        };
        let health = futures_util::future::join_all(
            runtime.modules.iter().map(ModuleRuntime::probe_healthy),
        )
        .await;
        for (module, healthy) in runtime.modules.iter().zip(health) {
            if healthy {
                tracing::info!(module_id = %module.declaration.module_id, "Plugin/Enterprise module health checks passed");
            } else if module.declaration.required {
                tracing::warn!(module_id = %module.declaration.module_id, "required Plugin/Enterprise module is unhealthy; readiness is unavailable");
            } else {
                tracing::warn!(module_id = %module.declaration.module_id, "optional Plugin/Enterprise module is unhealthy; its routes currently return 503");
            }
        }
        Ok(runtime)
    }

    pub(crate) async fn ready(&self) -> bool {
        let required = self
            .modules
            .iter()
            .filter(|module| module.declaration.required);
        futures_util::future::join_all(required.map(ModuleRuntime::probe_healthy))
            .await
            .into_iter()
            .all(|healthy| healthy)
    }

    pub(super) fn matching_route(&self, path: &str) -> Option<&RegisteredRoute> {
        self.routes
            .iter()
            .find(|route| route_matches_path(&route.declaration.path_prefix, path))
    }

    /// Deliver an immutable outbox event to all healthy supervised plugins over their Unix sockets.
    pub async fn deliver_outbox_event(
        &self,
        event: &OutboxEvent,
    ) -> Vec<Result<OutboxDeliveryReceipt, EnterpriseError>> {
        let body = match serde_json::to_vec(event) {
            Ok(bytes) => bytes,
            Err(err) => {
                return vec![Err(EnterpriseError(format!(
                    "failed to serialize outbox event: {err}"
                )))];
            }
        };
        let body = Arc::new(body);
        futures_util::future::join_all(self.modules.iter().map(|module| {
            let body = body.clone();
            async move {
                if !module.is_healthy().await {
                    return Err(EnterpriseError(format!(
                        "plugin {} is unavailable for outbox delivery",
                        module.declaration.module_id
                    )));
                }
                let request_id = Uuid::new_v4().to_string();
                let Ok(token) = self.signer.sign_plugin(SignedPluginRequestContext {
                    audience: &module.declaration.module_id,
                    principal: ContextPrincipal::OutboxSystem {
                        organization_id: event.organization_id,
                        project_id: event.project_id,
                    },
                    permission: RoutePermission::Write,
                    auth_mode: RouteAuthMode::Operator,
                    method: &Method::POST,
                    path: OUTBOX_DELIVERY_PATH,
                    request_id: &request_id,
                    body: &body,
                }) else {
                    return Err(EnterpriseError("outbox context signing failed".into()));
                };
                let url = format!("http://niu-module{OUTBOX_DELIVERY_PATH}");
                let res = module
                    .http
                    .post(url)
                    .timeout(HEALTH_TIMEOUT)
                    .header(header::AUTHORIZATION, format!("Bearer {token}"))
                    .header(header::CONTENT_TYPE, "application/json")
                    .header("x-request-id", &request_id)
                    .body((*body).clone())
                    .send()
                    .await;
                match res {
                    Ok(resp) if resp.status() == StatusCode::OK => {
                        match resp.json::<OutboxDeliveryReceipt>().await {
                            Ok(receipt) => Ok(receipt),
                            Err(err) => Err(EnterpriseError(format!(
                                "invalid outbox receipt from {}: {err}",
                                module.declaration.module_id
                            ))),
                        }
                    }
                    Ok(resp) => {
                        if resp.status().is_server_error() {
                            module.invalidate_health_cache();
                        }
                        Err(EnterpriseError(format!(
                            "plugin {} rejected outbox event with status {}",
                            module.declaration.module_id,
                            resp.status()
                        )))
                    }
                    Err(err) => {
                        module.invalidate_health_cache();
                        Err(EnterpriseError(format!(
                            "outbox delivery to {} failed: {err}",
                            module.declaration.module_id
                        )))
                    }
                }
            }
        }))
        .await
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
        if let Some(until) = *self
            .healthy_until
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            && std::time::Instant::now() < until
        {
            return true;
        }
        let _guard = self.probe_lock.lock().await;
        if let Some(until) = *self
            .healthy_until
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            && std::time::Instant::now() < until
        {
            return true;
        }
        self.probe_healthy().await
    }

    pub(super) async fn probe_healthy(&self) -> bool {
        let live_url = format!("http://niu-module{}", self.declaration.health.live_path);
        let ready_url = format!("http://niu-module{}", self.declaration.health.ready_path);
        let live = self.http.get(live_url).timeout(HEALTH_TIMEOUT).send();
        let ready = self.http.get(ready_url).timeout(HEALTH_TIMEOUT).send();
        let (live, ready) = tokio::join!(live, ready);
        let healthy = matches!(live, Ok(response) if response.status() == StatusCode::OK)
            && matches!(ready, Ok(response) if response.status() == StatusCode::OK);
        *self
            .healthy_until
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) =
            healthy.then(|| std::time::Instant::now() + HEALTH_CACHE_TTL);
        healthy
    }

    pub(super) fn invalidate_health_cache(&self) {
        *self
            .healthy_until
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = None;
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
