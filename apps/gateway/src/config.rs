use std::net::IpAddr;
use std::{collections::BTreeMap, env, fs};

use serde::Deserialize;

#[derive(Clone, Debug, Deserialize)]
pub struct AppConfig {
    #[serde(default)]
    pub server: ServerConfig,
    #[serde(default)]
    pub models: BTreeMap<String, ModelConfig>,
    #[serde(default)]
    pub detectors: BTreeMap<String, crate::guardrails::detector::Config>,
    #[serde(default)]
    pub image_detectors: BTreeMap<String, niu_media::image_detector::Config>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct ServerConfig {
    /// Trusted deployment origin for short-lived Supplier image fetches.
    #[serde(default)]
    pub image_source_origin: Option<String>,
    #[serde(default = "default_timeout")]
    pub request_timeout_seconds: u64,
}

impl ServerConfig {
    pub(crate) fn image_source_url(&self, token: &str) -> Result<String, ConfigError> {
        let origin = self
            .image_source_origin
            .as_deref()
            .ok_or_else(|| ConfigError::Invalid("Image source origin is not configured".into()))?;
        let parsed = url::Url::parse(origin)
            .map_err(|_| ConfigError::Invalid("Invalid image source origin".into()))?;
        let host = parsed.host_str().unwrap_or_default();
        if origin.len() > 2048
            || origin
                .bytes()
                .any(|b| b.is_ascii_whitespace() || b.is_ascii_control())
            || parsed.scheme() != "https"
            || parsed.port_or_known_default() != Some(443)
            || !parsed.username().is_empty()
            || parsed.password().is_some()
            || parsed.path() != "/"
            || parsed.query().is_some()
            || parsed.fragment().is_some()
            || !host.contains('.')
            || host.ends_with('.')
            || host.ends_with(".localhost")
            || host.ends_with(".local")
            || host.ends_with(".internal")
            || host.trim_matches(['[', ']']).parse::<IpAddr>().is_ok()
            || token.len() != 68
            || !token.starts_with("nis_")
            || !token[4..].bytes().all(|b| b.is_ascii_hexdigit())
        {
            return Err(ConfigError::Invalid(
                "Invalid image source origin or capability".into(),
            ));
        }
        Ok(format!(
            "{}/v1/media/sources/{token}",
            parsed.as_str().trim_end_matches('/')
        ))
    }
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            image_source_origin: None,
            request_timeout_seconds: default_timeout(),
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
pub struct ModelConfig {
    #[serde(default)]
    pub catalog: crate::catalog_metadata::CatalogMetadata,
    pub provider: String,
    pub upstream_model: String,
    pub api_key_env: String,
    #[serde(default)]
    pub public_catalog: bool,
    #[serde(default)]
    pub supports_embeddings: bool,
    #[serde(default)]
    pub supports_embedding_dimensions: bool,
    #[serde(default)]
    pub supports_embedding_base64: bool,
    #[serde(default)]
    pub supports_tool_calls: bool,
    #[serde(default)]
    pub supports_streaming_tool_calls: bool,
    #[serde(default)]
    pub supports_structured_output: bool,
    #[serde(default)]
    pub supports_responses: bool,
    #[serde(default)]
    pub supports_messages: bool,
    #[serde(default)]
    pub supports_generate_content: bool,
    #[serde(default)]
    pub api_base: Option<String>,
    #[serde(default)]
    pub pricing: Option<RoutePricing>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ModelProtocol {
    OpenAiCompatible,
    Anthropic,
    Bedrock,
    Unsupported,
}

impl ModelProtocol {
    pub fn supports_chat_completions(self) -> bool {
        self != Self::Unsupported
    }

    pub fn supports_streaming(self) -> bool {
        self == Self::OpenAiCompatible
    }

    pub fn is_openai_compatible(self) -> bool {
        self == Self::OpenAiCompatible
    }
}

/// Validated request capabilities used only to filter route-pool candidates.
#[derive(Default)]
pub(crate) struct ModelRequirements {
    pub streaming: bool,
    pub tools: bool,
    pub streaming_tools: bool,
    pub structured_output: bool,
    pub embedding_dimensions: bool,
    pub embedding_base64: bool,
}

impl ModelRequirements {
    pub fn allows(&self, model: &ModelConfig) -> bool {
        (!self.streaming || model.protocol().supports_streaming())
            && (!self.tools || model.supports_tool_calls)
            && (!self.streaming_tools || model.supports_streaming_tool_calls)
            && (!self.structured_output || model.supports_structured_output)
            && (!self.embedding_dimensions || model.supports_embedding_dimensions)
            && (!self.embedding_base64 || model.supports_embedding_base64)
    }
}

impl ModelConfig {
    pub fn protocol(&self) -> ModelProtocol {
        match self.provider.as_str() {
            "openai" | "openrouter" => ModelProtocol::OpenAiCompatible,
            "anthropic" => ModelProtocol::Anthropic,
            "bedrock" => ModelProtocol::Bedrock,
            _ => ModelProtocol::Unsupported,
        }
    }

    pub fn endpoint_base(&self) -> Option<&str> {
        self.api_base.as_deref().or(match self.provider.as_str() {
            "openai" => Some("https://api.openai.com/v1"),
            "openrouter" => Some("https://openrouter.ai/api/v1"),
            "gemini" => Some("https://generativelanguage.googleapis.com/v1beta"),
            _ => None,
        })
    }
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

    pub(crate) fn validate(&self) -> Result<(), ConfigError> {
        if self.server.request_timeout_seconds == 0 || self.server.request_timeout_seconds > 3600 {
            return Err(ConfigError::Invalid(
                "request_timeout_seconds must be between 1 and 3600".into(),
            ));
        }
        if self.server.image_source_origin.is_some() {
            self.server
                .image_source_url(&format!("nis_{}", "0".repeat(64)))?;
        }
        for (name, detector) in &self.image_detectors {
            if name.is_empty()
                || name.len() > 200
                || !name
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
            {
                return Err(ConfigError::Invalid("Invalid image detector name".into()));
            }
            detector
                .validate()
                .map_err(|_| ConfigError::Invalid("Invalid image detector configuration".into()))?;
        }
        for detector in self.detectors.values() {
            detector.validate().map_err(|_| {
                ConfigError::Invalid("Invalid external detector configuration".into())
            })?;
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
            if !model.catalog.valid()
                || model.provider.trim().is_empty()
                || model.upstream_model.trim().is_empty()
                || model.api_key_env.trim().is_empty()
            {
                return Err(ConfigError::Invalid(format!(
                    "model route {name} must set provider, upstream_model, and api_key_env"
                )));
            }
            if model.supports_generate_content && model.provider != "gemini" {
                return Err(ConfigError::Invalid(format!(
                    "GenerateContent capability on route {name} requires a gemini adapter"
                )));
            }
            if model.supports_messages
                && !matches!(model.provider.as_str(), "openrouter" | "anthropic")
            {
                return Err(ConfigError::Invalid(format!(
                    "Messages capability on route {name} requires an openrouter or anthropic adapter"
                )));
            }
            if model.supports_embeddings && !model.protocol().is_openai_compatible() {
                return Err(ConfigError::Invalid(format!(
                    "embedding route {name} currently requires the openai-compatible provider"
                )));
            }
            if (model.supports_embedding_dimensions || model.supports_embedding_base64)
                && !model.supports_embeddings
            {
                return Err(ConfigError::Invalid(format!(
                    "embedding option capabilities on route {name} require supports_embeddings"
                )));
            }
            if (model.supports_tool_calls
                || model.supports_streaming_tool_calls
                || model.supports_structured_output
                || model.supports_responses)
                && !model.protocol().is_openai_compatible()
            {
                return Err(ConfigError::Invalid(format!(
                    "tool-call and structured-output capabilities on route {name} currently require an OpenAI-compatible provider"
                )));
            }
            if model.supports_streaming_tool_calls && !model.supports_tool_calls {
                return Err(ConfigError::Invalid(format!(
                    "streaming tool-call capability on route {name} requires supports_tool_calls"
                )));
            }
            if let Some(price) = &model.pricing {
                price.validate()?;
                let native_token_usage = match model.provider.as_str() {
                    "anthropic" => model.supports_messages,
                    "gemini" => model.supports_generate_content,
                    _ => false,
                };
                if !model.protocol().is_openai_compatible() && !native_token_usage {
                    return Err(ConfigError::Invalid(
                        "priced routes require supported native or OpenAI-compatible token usage"
                            .into(),
                    ));
                }
            }
            if let Some(api_base) = &model.api_base {
                let parsed = url::Url::parse(api_base)
                    .map_err(|_| ConfigError::Invalid(format!("invalid api_base for {name}")))?;
                let host = parsed.host_str().unwrap_or_default();
                let local_http = parsed.scheme() == "http" && is_loopback_host(host);
                let private_literal =
                    host.trim_matches(['[', ']'])
                        .parse::<IpAddr>()
                        .is_ok_and(|address| {
                            !address.is_loopback() && !crate::upstream::is_public_address(address)
                        });
                if (parsed.scheme() != "https" && !local_http)
                    || host.is_empty()
                    || private_literal
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
    #[test]
    fn empty_file_routes_allow_database_vendor_configuration() {
        let config: super::AppConfig = toml::from_str("[models]").unwrap();
        assert!(config.models.is_empty());
        config.validate().unwrap();
    }

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
    fn openrouter_uses_openai_compatible_chat_with_conservative_optional_capabilities() {
        let config: AppConfig = toml::from_str(
            r#"
                [models.fast]
                provider = "openrouter"
                upstream_model = "openai/gpt-4.1-mini"
                api_key_env = "OPENROUTER_API_KEY"
            "#,
        )
        .expect("configuration shape should parse");
        let model = &config.models["fast"];

        assert!(config.validate().is_ok());
        assert_eq!(model.protocol(), super::ModelProtocol::OpenAiCompatible);
        assert_eq!(model.endpoint_base(), Some("https://openrouter.ai/api/v1"));
        assert!(!model.supports_embeddings);
        assert!(!model.supports_responses);
        assert!(!model.supports_tool_calls);
        assert!(!model.supports_streaming_tool_calls);
        assert!(!model.supports_structured_output);
    }

    #[test]
    fn openrouter_optional_features_require_explicit_route_qualification() {
        let config: AppConfig = toml::from_str(
            r#"
                [models.fast]
                provider = "openrouter"
                upstream_model = "openai/gpt-4.1-mini"
                api_key_env = "OPENROUTER_API_KEY"
                supports_embeddings = true
                supports_tool_calls = true
                supports_streaming_tool_calls = true
                supports_structured_output = true
                supports_responses = true
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
            "https://10.0.0.10/v1",
            "https://169.254.169.254/latest/meta-data",
            "https://[fd00::1]/v1",
        ] {
            let config: AppConfig = toml::from_str(&format!(
                "[models.fast]\nprovider = \"openai\"\nupstream_model = \"model-a\"\napi_key_env = \"PROVIDER_KEY\"\napi_base = \"{api_base}\""
            ))
            .expect("configuration shape should parse");
            assert!(config.validate().is_err(), "accepted unsafe URL {api_base}");
        }
    }

    #[test]
    fn embedding_capabilities_require_an_openai_compatible_embedding_route() {
        for route in [
            "provider = \"anthropic\"\nsupports_embeddings = true",
            "provider = \"openai\"\nsupports_embedding_dimensions = true",
            "provider = \"openai\"\nsupports_embedding_base64 = true",
        ] {
            let config: AppConfig = toml::from_str(&format!(
                "[models.fast]\n{route}\nupstream_model = \"model-a\"\napi_key_env = \"PROVIDER_KEY\""
            ))
            .expect("configuration shape should parse");
            assert!(config.validate().is_err(), "accepted {route}");
        }

        let config: AppConfig = toml::from_str(
            r#"
                [models.embedding]
                provider = "openai"
                upstream_model = "embedding-model"
                api_key_env = "PROVIDER_KEY"
                supports_embeddings = true
                supports_embedding_dimensions = true
                supports_embedding_base64 = true
            "#,
        )
        .expect("configuration shape should parse");
        assert!(config.validate().is_ok());
    }

    #[test]
    fn tool_and_structured_output_capabilities_require_an_openai_compatible_route() {
        for route in [
            "provider = \"anthropic\"\nsupports_tool_calls = true",
            "provider = \"bedrock\"\nsupports_structured_output = true",
            "provider = \"openai\"\nsupports_streaming_tool_calls = true",
            "provider = \"anthropic\"\nsupports_responses = true",
        ] {
            let config: AppConfig = toml::from_str(&format!(
                "[models.fast]\n{route}\nupstream_model = \"model-a\"\napi_key_env = \"PROVIDER_KEY\""
            ))
            .expect("configuration shape should parse");
            assert!(config.validate().is_err(), "accepted {route}");
        }

        let config: AppConfig = toml::from_str(
            r#"
                [models.fast]
                provider = "openai"
                upstream_model = "model-a"
                api_key_env = "PROVIDER_KEY"
                supports_tool_calls = true
                supports_streaming_tool_calls = true
                supports_structured_output = true
                supports_responses = true
            "#,
        )
        .expect("configuration shape should parse");
        assert!(config.validate().is_ok());
    }
    #[test]
    fn image_detector_configuration_is_separate_and_validated() {
        let source = r#"
            [image_detectors.image_fixture]
            endpoint = "https://detector.example/inspect"
            api_key_env = "IMAGE_DETECTOR_KEY"
            detector_revision = "fixture-v2"
            recipient = "Fixture"
            region = "Fixture"
            retention = "None declared"
            authorized_workspaces = ["00000000-0000-4000-8000-000000000001"]
            declared_unmetered = true
            timeout_ms = 1000
            maximum_encoded_bytes = 4096
            maximum_width = 32
            maximum_height = 32
            maximum_decoded_bytes = 4096
            concurrency = 1
        "#;
        let config: AppConfig = toml::from_str(source).unwrap();
        assert!(config.detectors.is_empty());
        assert_eq!(config.image_detectors.len(), 1);
        assert!(config.validate().is_ok());
        for invalid in [
            source.replace(
                "https://detector.example/inspect",
                "http://public.example/inspect",
            ),
            source.replace("concurrency = 1", "concurrency = 5"),
            source.replace("image_fixture", "bad.name"),
        ] {
            let parsed = toml::from_str::<AppConfig>(&invalid);
            assert!(parsed.is_err() || parsed.unwrap().validate().is_err());
        }
        let legacy: AppConfig = toml::from_str("").unwrap();
        assert!(legacy.image_detectors.is_empty());
    }
}

#[test]
fn image_source_origin_is_fixed_public_https_without_request_overrides() {
    let token = format!("nis_{}", "a".repeat(64));
    let configured = |origin: &str| ServerConfig {
        image_source_origin: Some(origin.into()),
        ..ServerConfig::default()
    };
    assert_eq!(
        configured("https://niu.example")
            .image_source_url(&token)
            .unwrap(),
        format!("https://niu.example/v1/media/sources/{token}")
    );
    for origin in [
        "http://niu.example",
        "https://localhost",
        "https://127.0.0.1",
        "https://[::1]",
        "https://niu.example:8443",
        "https://user@niu.example",
        "https://niu.example/path",
        "https://niu.example?token=x",
        "https://niu.example#fragment",
        "https://x.local",
        "https://x.internal",
    ] {
        assert!(configured(origin).image_source_url(&token).is_err());
    }
    assert!(ServerConfig::default().image_source_url(&token).is_err());
    assert!(
        configured("https://niu.example")
            .image_source_url("../secret")
            .is_err()
    );
}
