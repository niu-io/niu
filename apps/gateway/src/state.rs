use std::{
    collections::HashMap,
    env,
    sync::{
        Arc,
        atomic::{AtomicU64, AtomicUsize},
    },
};

use axum::http::HeaderMap;
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

use crate::{config::AppConfig, error::ApiError};

#[derive(Clone)]
pub struct AppState {
    pub(crate) trusted_proxies: Arc<Vec<ipnet::IpNet>>,
    pub(crate) password_auth: Option<Arc<crate::admin::passwords::Runtime>>,
    pub(crate) payments: Option<Arc<crate::payments::Runtime>>,
    pub(crate) epay_payments: Option<Arc<crate::payments::EPayRuntime>>,
    pub(crate) payment_configuration_guard: Arc<tokio::sync::RwLock<()>>,
    pub(crate) stripe_payments: Option<Arc<crate::payments::StripeRuntime>>,
    pub(crate) codex: Arc<crate::codex::Runtime>,
    pub config: Arc<AppConfig>,
    pub(crate) detectors: Arc<HashMap<String, crate::guardrails::detector::Runtime>>,
    pub(crate) image_detectors: Arc<HashMap<String, niu_media::image_detector::Runtime>>,
    pub(crate) vendor_cipher: Option<Arc<crate::vendors::crypto::CredentialCipher>>,
    pub enterprise: Option<Arc<crate::enterprise::EnterpriseRuntime>>,
    provider_keys: Arc<HashMap<String, String>>,
    pub store: niu_storage::Store,
    pub(crate) gateway_writes: crate::admission::GatewayWrites,
    price_revisions: Arc<tokio::sync::RwLock<HashMap<PriceRevisionKey, uuid::Uuid>>>,
    pub admin_tokens: Arc<TokenSet>,
    pub requests: Arc<AtomicU64>,
    pub failures: Arc<AtomicU64>,
    pub(crate) inference_in_flight: Arc<AtomicUsize>,
    pub usage: Arc<crate::usage::UsageMetrics>,
}

#[derive(Clone, Debug, Hash, PartialEq, Eq)]
struct PriceRevisionKey {
    organization_id: uuid::Uuid,
    project_id: uuid::Uuid,
    resource_id: String,
    offer_revision: String,
}

impl AppState {
    pub async fn load_from_env() -> Result<Self, Box<dyn std::error::Error>> {
        let config = AppConfig::load()?;
        let enterprise = crate::enterprise::EnterpriseRuntime::from_env().await?;
        let database_url =
            env::var("NIU_DATABASE_URL").map_err(|_| "NIU_DATABASE_URL is required")?;
        let max_connections = match env::var("NIU_DATABASE_MAX_CONNECTIONS") {
            Ok(value) => value
                .parse::<u32>()
                .map_err(|_| "NIU_DATABASE_MAX_CONNECTIONS must be an integer from 1 to 256")?,
            Err(env::VarError::NotPresent) => 10,
            Err(_) => {
                return Err("NIU_DATABASE_MAX_CONNECTIONS must be an integer from 1 to 256".into());
            }
        };
        if !(1..=256).contains(&max_connections) {
            return Err("NIU_DATABASE_MAX_CONNECTIONS must be an integer from 1 to 256".into());
        }
        let store =
            niu_storage::Store::connect_with_max_connections(&database_url, max_connections)
                .await
                .map_err(|_| "Cannot initialize gateway database")?;
        let vendor_cipher = env::var("NIU_VENDOR_ENCRYPTION_KEY")
            .ok()
            .map(|key| crate::vendors::crypto::CredentialCipher::new(&key))
            .transpose()?
            .map(Arc::new);
        let codex_connections = store
            .codex_connection_secrets()
            .await
            .map_err(|_| "Cannot read private Codex connections")?;
        if !codex_connections.is_empty() && vendor_cipher.is_none() {
            return Err("NIU_VENDOR_ENCRYPTION_KEY is required for saved Codex connections".into());
        }
        if let Some(cipher) = &vendor_cipher {
            for connection in codex_connections {
                cipher.open(connection.account_id,&connection.credential_ciphertext)
                    .map_err(|_| "Cannot decrypt saved Codex credentials with the configured encryption key")?;
            }
        }
        crate::vendors::seed_from_env(&store, vendor_cipher.as_deref()).await?;
        crate::vendors::validate_saved_credentials(&store, vendor_cipher.as_deref()).await?;
        let admin_tokens = TokenSet::parse(
            "NIU_ADMIN_TOKENS",
            env::var("NIU_ADMIN_TOKENS").unwrap_or_default(),
        )?;
        let mut provider_keys = HashMap::new();
        for (alias, model) in &config.models {
            if store
                .vendor_route(alias)
                .await
                .map_err(|_| "Cannot read vendor registry")?
                .is_some()
            {
                continue;
            }
            if !provider_keys.contains_key(&model.api_key_env) {
                let secret = env::var(&model.api_key_env).map_err(|_| {
                    format!(
                        "provider credential environment variable {} is not set",
                        model.api_key_env
                    )
                })?;
                if secret.is_empty() || secret.starts_with("replace-") {
                    return Err(format!(
                        "provider credential {} is empty or still a placeholder",
                        model.api_key_env
                    )
                    .into());
                }
                provider_keys.insert(model.api_key_env.clone(), secret);
            }
        }
        let mut state =
            Self::new(config, store, admin_tokens, provider_keys).with_enterprise(enterprise);
        state.vendor_cipher = vendor_cipher;
        state.payments = crate::payments::Runtime::from_env().await?.map(Arc::new);
        state.epay_payments = crate::payments::EPayRuntime::from_env()?.map(Arc::new);
        state.stripe_payments = crate::payments::StripeRuntime::from_env()?.map(Arc::new);
        state.password_auth = crate::admin::passwords::Runtime::from_env()
            .await?
            .map(Arc::new);
        if let Ok(origin) = env::var("NIU_DEV_MEMBER_ORIGIN") {
            if state.password_auth.is_some() {
                return Err(
                    "Development member origin cannot override production authentication".into(),
                );
            }
            let email = env::var("NIU_DEV_USERNAME")?;
            let password = env::var("NIU_DEV_PASSWORD")?;
            let bind: std::net::SocketAddr = env::var("NIU_BIND")?.parse()?;
            if !bind.ip().is_loopback() {
                return Err("Development member login requires a loopback bind".into());
            }
            let runtime = crate::admin::passwords::Runtime::local(&origin).await?;
            runtime
                .provision_local_account(&state.store, &email, &password)
                .await?;
            state.password_auth = Some(Arc::new(runtime));
        }
        state.trusted_proxies = Arc::new(crate::request_source::trusted_proxies()?);
        Ok(state)
    }

    pub(crate) fn new(
        config: AppConfig,
        store: niu_storage::Store,
        admin_tokens: TokenSet,
        provider_keys: HashMap<String, String>,
    ) -> Self {
        let inference_in_flight = Arc::new(AtomicUsize::new(0));
        let gateway_writes =
            crate::admission::GatewayWrites::new(store.clone(), inference_in_flight.clone());
        let detectors = config
            .detectors
            .iter()
            .map(|(name, config)| {
                (
                    name.clone(),
                    crate::guardrails::detector::Runtime::new(config.clone()),
                )
            })
            .collect();
        let image_detectors = config
            .image_detectors
            .iter()
            .filter_map(|(name, config)| {
                niu_media::image_detector::Runtime::new(config.clone())
                    .ok()
                    .map(|runtime| (name.clone(), runtime))
            })
            .collect();
        Self {
            trusted_proxies: Arc::new(Vec::new()),
            image_detectors: Arc::new(image_detectors),
            password_auth: None,
            detectors: Arc::new(detectors),
            payments: None,
            stripe_payments: None,
            epay_payments: None,
            payment_configuration_guard: Arc::new(tokio::sync::RwLock::new(())),
            codex: Arc::new(crate::codex::Runtime::default()),
            config: Arc::new(config),
            enterprise: None,
            vendor_cipher: None,
            provider_keys: Arc::new(provider_keys),
            store,
            gateway_writes,
            price_revisions: Arc::new(tokio::sync::RwLock::new(HashMap::new())),
            admin_tokens: Arc::new(admin_tokens),
            requests: Arc::new(AtomicU64::new(0)),
            failures: Arc::new(AtomicU64::new(0)),
            inference_in_flight,
            usage: Arc::new(crate::usage::UsageMetrics::default()),
        }
    }

    fn with_enterprise(
        mut self,
        enterprise: Option<Arc<crate::enterprise::EnterpriseRuntime>>,
    ) -> Self {
        self.enterprise = enterprise;
        self
    }

    pub fn provider_key(&self, name: &str) -> Option<&str> {
        self.provider_keys.get(name).map(String::as_str)
    }

    pub(crate) async fn publish_price_revision(
        &self,
        scope: niu_storage::TenantScope,
        resource_id: &str,
        offer_revision: &str,
        input: niu_storage::PriceInput<'_>,
    ) -> Result<uuid::Uuid, niu_storage::StoreError> {
        let key = PriceRevisionKey {
            organization_id: scope.organization_id,
            project_id: scope.project_id,
            resource_id: resource_id.to_owned(),
            offer_revision: offer_revision.to_owned(),
        };
        if let Some(id) = self.price_revisions.read().await.get(&key).copied() {
            return Ok(id);
        }

        // Price revisions are immutable. Publish once per workspace and route
        // revision, then avoid a serialized project-row lookup on every call.
        let id = self.store.publish_price(scope, input).await?;
        let mut revisions = self.price_revisions.write().await;
        if let Some(id) = revisions.get(&key).copied() {
            return Ok(id);
        }
        if revisions.len() >= 4096 {
            revisions.clear();
        }
        revisions.insert(key, id);
        Ok(id)
    }

    pub(crate) fn track_inference(&self) -> InferenceRequestGuard {
        self.inference_in_flight
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        InferenceRequestGuard(self.inference_in_flight.clone())
    }

    pub async fn authorize_api(
        &self,
        header: Option<&str>,
    ) -> Result<niu_storage::Principal, ApiError> {
        let token = header
            .and_then(|h| h.strip_prefix("Bearer "))
            .ok_or_else(ApiError::unauthorized)?;
        let principal = self
            .store
            .authenticate(token)
            .await
            .map_err(ApiError::from_store)?;
        self.authorize_key_source(principal).await
    }

    /// Authorize an inference request using Niu's separate credential header
    /// when present. This lets clients retain a provider Authorization header
    /// without making it the Niu project credential.
    pub async fn authorize_api_headers(
        &self,
        headers: &HeaderMap,
    ) -> Result<niu_storage::Principal, ApiError> {
        let niu_keys = headers.get_all("x-niu-api-key").iter().collect::<Vec<_>>();
        if niu_keys.len() > 1 {
            return Err(ApiError::unauthorized());
        }
        if let Some(value) = niu_keys.first() {
            let token = value.to_str().map_err(|_| ApiError::unauthorized())?;
            if token.is_empty() || token.trim() != token {
                return Err(ApiError::unauthorized());
            }
            let principal = self
                .store
                .authenticate(token)
                .await
                .map_err(ApiError::from_store)?;
            return self.authorize_key_source(principal).await;
        }
        self.authorize_api(
            headers
                .get(axum::http::header::AUTHORIZATION)
                .and_then(|h| h.to_str().ok()),
        )
        .await
    }

    /// Resolve a selected workspace key through existing session/role checks.
    /// Dashboard callers never receive the key secret. Dispatch still revalidates
    /// the selected key and policy in its transaction.
    pub(crate) async fn authorize_dashboard_key(
        &self,
        headers: &HeaderMap,
        scope: niu_storage::TenantScope,
        key: uuid::Uuid,
        permission: niu_storage::AdminPermission,
    ) -> Result<niu_storage::Principal, ApiError> {
        let authorization = self.authorize_admin_headers(headers, permission).await?;
        if !authorization.permits_project(scope) {
            return Err(ApiError::forbidden());
        }
        let principal = self
            .store
            .dashboard_key(scope, key)
            .await
            .map_err(ApiError::from_store)?;
        self.authorize_key_source(principal).await
    }

    pub(crate) async fn authorize_key_source(
        &self,
        principal: niu_storage::Principal,
    ) -> Result<niu_storage::Principal, ApiError> {
        self.store
            .check_key_ip(
                principal.scope(),
                principal.key_id(),
                crate::request_source::current_ip(),
            )
            .await
            .map_err(ApiError::from_store)?;
        Ok(principal)
    }

    pub async fn authorize_admin(
        &self,
        header: Option<&str>,
        permission: niu_storage::AdminPermission,
    ) -> Result<AdminAuthorization, ApiError> {
        if self.admin_tokens.matches(header) {
            return Ok(AdminAuthorization::Installation);
        }
        let token = header
            .and_then(|value| value.strip_prefix("Bearer "))
            .ok_or_else(ApiError::unauthorized)?;
        let operator = self
            .store
            .authenticate_operator(token)
            .await
            .map_err(ApiError::from_store)?;
        if operator.role.permits(permission) {
            Ok(AdminAuthorization::Operator(operator))
        } else {
            Err(ApiError::forbidden())
        }
    }

    /// Platform grants are independent of the member's customer role. This
    /// authenticates a session without granting any additional tenant access.
    pub(crate) async fn authorize_platform_headers(
        &self,
        headers: &HeaderMap,
    ) -> Result<AdminAuthorization, ApiError> {
        let authorization = self
            .authorize_admin_headers(headers, niu_storage::AdminPermission::Read)
            .await?;
        if authorization.can_manage_platform() {
            Ok(authorization)
        } else {
            Err(ApiError::forbidden())
        }
    }

    pub(crate) async fn authorize_admin_headers(
        &self,
        headers: &HeaderMap,
        permission: niu_storage::AdminPermission,
    ) -> Result<AdminAuthorization, ApiError> {
        if headers.get_all("authorization").iter().count() > 1 {
            return Err(ApiError::unauthorized());
        }
        let browser_marker = headers.get("authorization").and_then(|v| v.to_str().ok())
            == Some("Bearer niu-browser-member-session");
        if (!headers.contains_key("authorization") || browser_marker)
            && let Some(runtime) = self.password_auth.as_deref()
            && let Some(token) = crate::admin::passwords::member_cookie(headers, runtime)?
        {
            let runtime = self
                .password_auth
                .as_deref()
                .ok_or_else(ApiError::unauthorized)?;
            runtime.check_cookie_request(headers)?;
            // Never compare a browser cookie against installation credentials.
            let member = self
                .store
                .authenticate_operator(&token)
                .await
                .map_err(ApiError::from_store)?;
            return if member.role.permits(permission) {
                Ok(AdminAuthorization::Operator(member))
            } else {
                Err(ApiError::forbidden())
            };
        }
        if browser_marker {
            return Err(ApiError::unauthorized());
        }
        self.authorize_admin(
            headers.get("authorization").and_then(|h| h.to_str().ok()),
            permission,
        )
        .await
    }

    pub(crate) fn development_member_enabled(&self) -> bool {
        self.password_auth
            .as_deref()
            .is_some_and(|runtime| runtime.is_local())
    }
}

pub(crate) struct InferenceRequestGuard(Arc<AtomicUsize>);

impl Drop for InferenceRequestGuard {
    fn drop(&mut self) {
        self.0.fetch_sub(1, std::sync::atomic::Ordering::Relaxed);
    }
}

#[derive(Clone, Copy, Debug)]
pub enum AdminAuthorization {
    /// Installation credentials may administer all tenants and provision the
    /// first workspace-scoped operators.
    Installation,
    /// Durable operator sessions are limited to their configured tenant scope.
    Operator(niu_storage::OperatorPrincipal),
}

impl AdminAuthorization {
    pub fn is_installation(self) -> bool {
        matches!(self, Self::Installation)
    }

    pub fn can_manage_platform(self) -> bool {
        match self {
            Self::Installation => true,
            Self::Operator(member) => member.platform_admin,
        }
    }

    pub fn permits_organization(self, organization_id: uuid::Uuid) -> bool {
        match self {
            Self::Installation => true,
            Self::Operator(operator) => operator.scope.organization_id == organization_id,
        }
    }

    /// Shared company funds require organization-wide financial access.
    pub fn permits_billing_account(self, organization_id: uuid::Uuid) -> bool {
        match self {
            Self::Installation => true,
            Self::Operator(operator) => {
                operator.scope.organization_id == organization_id
                    && operator.scope.project_id.is_none()
                    && matches!(
                        operator.role,
                        niu_storage::OperatorRole::Owner | niu_storage::OperatorRole::Admin
                    )
            }
        }
    }

    pub fn permits_project(self, scope: niu_storage::TenantScope) -> bool {
        match self {
            Self::Installation => true,
            Self::Operator(operator) => operator.scope.permits_project(scope),
        }
    }

    pub fn permits_project_creation(self, organization_id: uuid::Uuid) -> bool {
        match self {
            Self::Installation => true,
            Self::Operator(operator) => {
                operator.scope.organization_id == organization_id
                    && operator.scope.project_id.is_none()
            }
        }
    }

    pub fn permits_operator_scope(self, scope: niu_storage::OperatorScope) -> bool {
        match self {
            Self::Installation => true,
            Self::Operator(operator) => {
                operator.role == niu_storage::OperatorRole::Owner
                    && operator.scope.organization_id == scope.organization_id
                    && operator
                        .scope
                        .project_id
                        .is_none_or(|project_id| scope.project_id == Some(project_id))
            }
        }
    }
}

pub struct TokenSet(Vec<[u8; 32]>);

impl TokenSet {
    pub(crate) fn parse(name: &str, tokens: String) -> Result<Self, Box<dyn std::error::Error>> {
        let tokens: Vec<_> = tokens
            .split(',')
            .map(str::trim)
            .filter(|token| !token.is_empty())
            .collect();
        if tokens.is_empty() {
            return Err(format!("{name} must contain at least one high-entropy token").into());
        }
        if tokens.iter().any(|token| token.starts_with("replace-")) {
            return Err(format!("replace placeholder values in {name} before startup").into());
        }
        if tokens.iter().any(|token| token.len() < 32) {
            return Err(format!("each token in {name} must be at least 32 bytes").into());
        }
        Ok(Self(tokens.iter().map(|token| hash(token)).collect()))
    }

    pub fn matches(&self, header: Option<&str>) -> bool {
        let Some(token) = header
            .and_then(|value| value.strip_prefix("Bearer "))
            .filter(|token| !token.is_empty())
        else {
            return false;
        };
        let candidate = hash(token);
        self.0.iter().fold(0_u8, |matched, expected| {
            matched | expected.ct_eq(&candidate).unwrap_u8()
        }) != 0
    }
}

fn hash(token: &str) -> [u8; 32] {
    Sha256::digest(token.as_bytes()).into()
}

#[cfg(test)]
mod tests {
    use super::{AdminAuthorization, TokenSet};
    use niu_storage::{
        AdminPermission, OperatorPrincipal, OperatorRole, OperatorScope, TenantScope,
    };
    use uuid::Uuid;

    #[test]
    fn bearer_auth_requires_a_configured_full_token() {
        let tokens = TokenSet(vec![super::hash("niu-test-key-with-enough-entropy-0001")]);

        assert!(tokens.matches(Some("Bearer niu-test-key-with-enough-entropy-0001")));
        assert!(!tokens.matches(Some("Bearer niu-test-key-with-enough-entropy-0002")));
        assert!(!tokens.matches(Some("niu-test-key-with-enough-entropy-0001")));
        assert!(!tokens.matches(None));
    }

    #[test]
    fn placeholder_tokens_cannot_be_used_at_startup() {
        assert!(
            TokenSet::parse(
                "NIU_API_KEYS",
                "replace-with-a-random-32-byte-or-longer-client-token".into()
            )
            .is_err()
        );
    }

    #[test]
    fn operator_roles_grant_only_their_declared_admin_permissions() {
        for role in [
            OperatorRole::Owner,
            OperatorRole::Admin,
            OperatorRole::Viewer,
        ] {
            assert!(role.permits(AdminPermission::Read));
        }
        for role in [OperatorRole::Owner, OperatorRole::Admin] {
            assert!(role.permits(AdminPermission::Write));
        }
        assert!(!OperatorRole::Viewer.permits(AdminPermission::Write));
        assert!(OperatorRole::Owner.permits(AdminPermission::ManageOperators));
        assert!(!OperatorRole::Admin.permits(AdminPermission::ManageOperators));
        assert!(!OperatorRole::Viewer.permits(AdminPermission::ManageOperators));
    }

    #[test]
    fn installation_authorization_covers_any_tenant_and_bootstrap_action() {
        let authorization = AdminAuthorization::Installation;
        let organization_id = Uuid::new_v4();
        let project_id = Uuid::new_v4();

        assert!(authorization.permits_organization(organization_id));
        assert!(authorization.permits_project(TenantScope {
            organization_id,
            project_id,
        }));
        assert!(authorization.permits_project_creation(organization_id));
        assert!(authorization.permits_operator_scope(OperatorScope {
            organization_id,
            project_id: Some(project_id),
        }));
    }

    #[test]
    fn organization_owner_is_limited_to_its_organization() {
        let organization_id = Uuid::new_v4();
        let other_organization_id = Uuid::new_v4();
        let authorization = operator_authorization(organization_id, None, OperatorRole::Owner);

        assert!(authorization.permits_organization(organization_id));
        assert!(!authorization.permits_organization(other_organization_id));
        assert!(authorization.permits_project(TenantScope {
            organization_id,
            project_id: Uuid::new_v4(),
        }));
        assert!(authorization.permits_project_creation(organization_id));
        assert!(!authorization.permits_project_creation(other_organization_id));
        assert!(authorization.permits_operator_scope(OperatorScope {
            organization_id,
            project_id: Some(Uuid::new_v4()),
        }));
        assert!(!authorization.permits_operator_scope(OperatorScope {
            organization_id: other_organization_id,
            project_id: None,
        }));
    }

    #[test]
    fn project_owner_cannot_expand_operator_or_project_scope() {
        let organization_id = Uuid::new_v4();
        let project_id = Uuid::new_v4();
        let authorization =
            operator_authorization(organization_id, Some(project_id), OperatorRole::Owner);

        assert!(authorization.permits_organization(organization_id));
        assert!(!authorization.permits_project_creation(organization_id));
        assert!(authorization.permits_project(TenantScope {
            organization_id,
            project_id,
        }));
        assert!(!authorization.permits_project(TenantScope {
            organization_id,
            project_id: Uuid::new_v4(),
        }));
        assert!(authorization.permits_operator_scope(OperatorScope {
            organization_id,
            project_id: Some(project_id),
        }));
        assert!(!authorization.permits_operator_scope(OperatorScope {
            organization_id,
            project_id: None,
        }));
    }

    #[test]
    fn non_owner_roles_cannot_manage_operator_credentials() {
        let organization_id = Uuid::new_v4();
        for role in [OperatorRole::Admin, OperatorRole::Viewer] {
            let authorization = operator_authorization(organization_id, None, role);
            assert!(!authorization.permits_operator_scope(OperatorScope {
                organization_id,
                project_id: None,
            }));
        }
    }

    #[test]
    fn platform_administration_does_not_expand_customer_scope() {
        let organization_id = Uuid::new_v4();
        let project_id = Uuid::new_v4();
        let mut authorization =
            operator_authorization(organization_id, Some(project_id), OperatorRole::Owner);
        assert!(!authorization.can_manage_platform());
        let AdminAuthorization::Operator(ref mut member) = authorization else {
            unreachable!();
        };
        member.platform_admin = true;
        assert!(authorization.can_manage_platform());
        assert!(!authorization.is_installation());
        assert!(authorization.permits_project(TenantScope {
            organization_id,
            project_id
        }));
        assert!(!authorization.permits_organization(Uuid::new_v4()));
        assert!(!authorization.permits_project(TenantScope {
            organization_id,
            project_id: Uuid::new_v4(),
        }));
        assert!(!authorization.permits_project_creation(organization_id));
        assert!(AdminAuthorization::Installation.can_manage_platform());
    }

    fn operator_authorization(
        organization_id: Uuid,
        project_id: Option<Uuid>,
        role: OperatorRole,
    ) -> AdminAuthorization {
        AdminAuthorization::Operator(OperatorPrincipal {
            id: Uuid::new_v4(),
            platform_admin: false,
            role,
            scope: OperatorScope {
                organization_id,
                project_id,
            },
        })
    }
}
