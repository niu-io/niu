use std::{
    collections::HashMap,
    env,
    sync::{Arc, atomic::AtomicU64},
    time::Duration,
};

use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

use crate::{config::AppConfig, error::ApiError};

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<AppConfig>,
    pub enterprise: Option<Arc<crate::enterprise::EnterpriseRuntime>>,
    provider_keys: Arc<HashMap<String, String>>,
    pub store: niu_storage::Store,
    pub admin_tokens: Arc<TokenSet>,
    pub http: reqwest::Client,
    pub requests: Arc<AtomicU64>,
    pub failures: Arc<AtomicU64>,
    pub usage: Arc<crate::usage::UsageMetrics>,
}

impl AppState {
    pub async fn load_from_env() -> Result<Self, Box<dyn std::error::Error>> {
        let config = AppConfig::load()?;
        let enterprise = crate::enterprise::EnterpriseRuntime::from_env().await?;
        let database_url =
            env::var("NIU_DATABASE_URL").map_err(|_| "NIU_DATABASE_URL is required")?;
        let store = niu_storage::Store::connect(&database_url).await?;
        let admin_tokens = TokenSet::parse(
            "NIU_ADMIN_TOKENS",
            env::var("NIU_ADMIN_TOKENS").unwrap_or_default(),
        )?;
        let mut provider_keys = HashMap::new();
        for model in config.models.values() {
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
        let http = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::none())
            .build()?;
        Ok(Self::new(config, store, admin_tokens, http, provider_keys).with_enterprise(enterprise))
    }

    pub(crate) fn new(
        config: AppConfig,
        store: niu_storage::Store,
        admin_tokens: TokenSet,
        http: reqwest::Client,
        provider_keys: HashMap<String, String>,
    ) -> Self {
        Self {
            config: Arc::new(config),
            enterprise: None,
            provider_keys: Arc::new(provider_keys),
            store,
            admin_tokens: Arc::new(admin_tokens),
            http,
            requests: Arc::new(AtomicU64::new(0)),
            failures: Arc::new(AtomicU64::new(0)),
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

    pub async fn authorize_api(
        &self,
        header: Option<&str>,
    ) -> Result<niu_storage::Principal, ApiError> {
        let token = header
            .and_then(|h| h.strip_prefix("Bearer "))
            .ok_or_else(ApiError::unauthorized)?;
        self.store
            .authenticate(token)
            .await
            .map_err(ApiError::from_store)
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

    pub fn permits_organization(self, organization_id: uuid::Uuid) -> bool {
        match self {
            Self::Installation => true,
            Self::Operator(operator) => operator.scope.organization_id == organization_id,
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

    fn operator_authorization(
        organization_id: Uuid,
        project_id: Option<Uuid>,
        role: OperatorRole,
    ) -> AdminAuthorization {
        AdminAuthorization::Operator(OperatorPrincipal {
            id: Uuid::new_v4(),
            role,
            scope: OperatorScope {
                organization_id,
                project_id,
            },
        })
    }
}
