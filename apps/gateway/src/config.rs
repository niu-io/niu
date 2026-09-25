use std::net::IpAddr;
use std::{collections::BTreeMap, env, fs};

use serde::Deserialize;

#[derive(Clone, Debug, Deserialize)]
pub struct AppConfig {
    #[serde(default)]
    pub server: ServerConfig,
    pub models: BTreeMap<String, ModelConfig>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct ServerConfig {
    #[serde(default = "default_timeout")]
    pub request_timeout_seconds: u64,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            request_timeout_seconds: default_timeout(),
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
pub struct ModelConfig {
    pub provider: String,
    pub upstream_model: String,
    pub api_key_env: String,
    #[serde(default)]
    pub api_base: Option<String>,
    #[serde(default)]
    pub pricing: Option<RoutePricing>,
}

/// Operator-attested provider bounds; these are not token estimates.
#[derive(Clone, Debug, Deserialize, serde::Serialize)]
#[serde(deny_unknown_fields)]
pub struct RoutePricing {
    pub currency: String,
    pub api_prompt_rate: i64,
    pub api_completion_rate: i64,
    pub cash_prompt_rate: i64,
    pub cash_completion_rate: i64,
    pub max_input_tokens: i64,
    pub max_output_tokens: i64,
}

impl RoutePricing {
    pub fn validate(&self) -> Result<(), ConfigError> {
        if self.currency.len() != 3
            || !self.currency.bytes().all(|b| b.is_ascii_uppercase())
            || self.max_input_tokens <= 0
            || self.max_output_tokens <= 0
        {
            return Err(ConfigError::Invalid(
                "invalid pricing currency or token bounds".into(),
            ));
        }
        for rates in [
            niu_storage::TokenRates {
                prompt: self.api_prompt_rate,
                completion: self.api_completion_rate,
            },
            niu_storage::TokenRates {
                prompt: self.cash_prompt_rate,
                completion: self.cash_completion_rate,
            },
        ] {
            rates
                .charge(self.max_input_tokens, self.max_output_tokens)
                .map_err(|_| ConfigError::Invalid("invalid or overflowing route price".into()))?;
        }
        Ok(())
    }
}

impl AppConfig {
    pub fn load() -> Result<Self, ConfigError> {
        let path = env::var("NIU_CONFIG_FILE").unwrap_or_else(|_| "config/niu.toml".to_owned());
        let source = fs::read_to_string(&path).or_else(|_| {
            if env::var_os("NIU_CONFIG_FILE").is_some() {
                return Err(std::io::Error::other(format!("unable to read {path}")));
            }
            Ok(include_str!("../../../config/niu.example.toml").to_owned())
        })?;
        let config: Self = toml::from_str(&source)?;
        config.validate()?;
        Ok(config)
    }

    fn validate(&self) -> Result<(), ConfigError> {
        if self.models.is_empty() {
            return Err(ConfigError::Invalid(
                "at least one model route is required".into(),
            ));
        }
        if self.server.request_timeout_seconds == 0 || self.server.request_timeout_seconds > 3600 {
            return Err(ConfigError::Invalid(
                "request_timeout_seconds must be between 1 and 3600".into(),
            ));
        }
        for (name, model) in &self.models {
            if name.is_empty()
                || !name
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || b"._/-".contains(&byte))
            {
                return Err(ConfigError::Invalid(format!(
                    "invalid public model name: {name}"
                )));
            }
            if model.provider.trim().is_empty()
                || model.upstream_model.trim().is_empty()
                || model.api_key_env.trim().is_empty()
            {
                return Err(ConfigError::Invalid(format!(
                    "model route {name} must set provider, upstream_model, and api_key_env"
                )));
            }
            if let Some(price) = &model.pricing {
                price.validate()?;
                if model.provider != "openai" {
                    return Err(ConfigError::Invalid(
                        "priced routes currently require OpenAI-compatible text usage".into(),
                    ));
                }
            }
            if let Some(api_base) = &model.api_base {
                let parsed = url::Url::parse(api_base)
                    .map_err(|_| ConfigError::Invalid(format!("invalid api_base for {name}")))?;
                let host = parsed.host_str().unwrap_or_default();
                let local_http = parsed.scheme() == "http" && is_loopback_host(host);
                if (parsed.scheme() != "https" && !local_http)
                    || host.is_empty()
                    || !parsed.username().is_empty()
                    || parsed.password().is_some()
                    || parsed.query().is_some()
                    || parsed.fragment().is_some()
                {
                    return Err(ConfigError::Invalid(format!("invalid api_base for {name}")));
                }
            }
        }
        Ok(())
    }
}

fn is_loopback_host(host: &str) -> bool {
    host.eq_ignore_ascii_case("localhost")
        || host
            .trim_matches(['[', ']'])
            .parse::<IpAddr>()
            .is_ok_and(|address| address.is_loopback())
}

fn default_timeout() -> u64 {
    300
}

#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("configuration file error: {0}")]
    Io(#[from] std::io::Error),
    #[error("invalid TOML configuration: {0}")]
    Toml(#[from] toml::de::Error),
    #[error("invalid configuration: {0}")]
    Invalid(String),
}

#[cfg(test)]
mod tests {
    use super::AppConfig;

    #[test]
    fn rejects_provider_endpoints_with_non_http_schemes() {
        let config: AppConfig = toml::from_str(
            r#"
                [models.fast]
                provider = "openai"
                upstream_model = "model-a"
                api_key_env = "PROVIDER_KEY"
                api_base = "file:///etc/passwd"
            "#,
        )
        .expect("configuration shape should parse");

        assert!(config.validate().is_err());
    }

    #[test]
    fn accepts_https_provider_endpoint_and_public_alias() {
        let config: AppConfig = toml::from_str(
            r#"
                [models.fast]
                provider = "openai"
                upstream_model = "model-a"
                api_key_env = "PROVIDER_KEY"
                api_base = "https://api.example.test/v1"
            "#,
        )
        .expect("configuration shape should parse");

        assert!(config.validate().is_ok());
    }

    #[test]
    fn rejects_insecure_remote_and_credential_bearing_provider_urls() {
        for api_base in [
            "http://provider.example.test/v1",
            "https://user:pass@api.example.test/v1",
        ] {
            let config: AppConfig = toml::from_str(&format!(
                "[models.fast]\nprovider = \"openai\"\nupstream_model = \"model-a\"\napi_key_env = \"PROVIDER_KEY\"\napi_base = \"{api_base}\""
            ))
            .expect("configuration shape should parse");
            assert!(config.validate().is_err(), "accepted unsafe URL {api_base}");
        }
    }
}
