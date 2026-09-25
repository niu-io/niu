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
        Ok(Self::new(config, store, admin_tokens, http, provider_keys))
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
            provider_keys: Arc::new(provider_keys),
            store,
            admin_tokens: Arc::new(admin_tokens),
            http,
            requests: Arc::new(AtomicU64::new(0)),
            failures: Arc::new(AtomicU64::new(0)),
            usage: Arc::new(crate::usage::UsageMetrics::default()),
        }
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

    pub fn authorize_admin(&self, header: Option<&str>) -> Result<(), ApiError> {
        if self.admin_tokens.matches(header) {
            Ok(())
        } else {
            Err(ApiError::unauthorized())
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
    use super::TokenSet;

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
}
