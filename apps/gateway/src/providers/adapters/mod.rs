//! Service-specific discovery, independent of inference wire-protocol adapters.
mod babelark;
mod deepseek;
mod estimate;
mod fastrouter;
mod openrouter;
mod qiniu;
mod types;
use crate::catalog_metadata::CatalogMetadata;
pub(crate) use estimate::{Quantity, estimate};
pub(crate) use qiniu::model_square_metadata as qiniu_model_square_metadata;
use serde_json::Value;
pub(crate) use types::{Descriptor, Pricing, now_ms};

const MAX_SOURCE_BYTES: usize = 2 * 1024 * 1024;
const PRICE_SOURCE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(5);

pub(crate) trait ProviderAdapter: Sync {
    fn descriptor(&self) -> Descriptor;
    fn metadata(&self, model: &Value) -> CatalogMetadata {
        let mut metadata = CatalogMetadata::from_provider(model);
        // A pricing-shaped object on an API-compatible service does not prove USD/token units.
        metadata.input_price = None;
        metadata.output_price = None;
        metadata
    }
    fn pricing(&self, document: &Value) -> Pricing;
}
pub(crate) fn registry() -> [&'static dyn ProviderAdapter; 5] {
    [
        &openrouter::ADAPTER,
        &fastrouter::ADAPTER,
        &babelark::ADAPTER,
        &qiniu::ADAPTER,
        &deepseek::ADAPTER,
    ]
}
pub(crate) fn find(id: &str) -> Option<&'static dyn ProviderAdapter> {
    registry()
        .into_iter()
        .find(|adapter| adapter.descriptor().id == id)
}
pub(crate) fn metadata(integration: &str, model: &Value) -> CatalogMetadata {
    match find(integration) {
        Some(adapter) => adapter.metadata(model),
        None => {
            let mut metadata = CatalogMetadata::from_provider(model);
            metadata.input_price = None;
            metadata.output_price = None;
            metadata
        }
    }
}

/// Observable source-read outcome. These are transport/schema states, not a
/// claim that a Provider balance or tariff is unavailable.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum SourceFailure {
    Timeout,
    Unreachable,
    Transport,
    BlockedDestination,
    Configuration,
    Authentication,
    RateLimited,
    ServerError,
    Rejected,
    Redirect,
    ResponseTooLarge,
    InvalidDocument,
}
impl SourceFailure {
    pub(crate) fn code(self) -> &'static str {
        match self {
            Self::Timeout => "provider_price_source_timeout",
            Self::Unreachable => "provider_price_source_unreachable",
            Self::Transport => "provider_price_source_transport",
            Self::BlockedDestination => "provider_price_source_blocked_destination",
            Self::Configuration => "provider_price_source_configuration",
            Self::Authentication => "provider_price_source_auth",
            Self::RateLimited => "provider_price_source_rate_limited",
            Self::ServerError => "provider_price_source_server_error",
            Self::Rejected => "provider_price_source_rejected",
            Self::Redirect => "provider_price_source_redirect",
            Self::ResponseTooLarge => "provider_price_source_too_large",
            Self::InvalidDocument => "provider_price_source_invalid_document",
        }
    }
    pub(crate) fn message(self) -> &'static str {
        match self {
            Self::Timeout => "The Provider price source timed out; retry the read.",
            Self::Unreachable => {
                "The Provider price source could not be reached; check deployment DNS/proxy routing and retry."
            }
            Self::Transport => "The Provider price response could not be read; retry the read.",
            Self::BlockedDestination => {
                "The Provider price source resolved to a non-public destination. Niu keeps endpoint safety enabled; correct DNS/proxy routing before retrying."
            }
            Self::Configuration => {
                "The Provider price source client could not be configured; check upstream timeout settings."
            }
            Self::Authentication => {
                "The Provider price source rejected anonymous access; qualify the documented authorized feed instead of substituting prices."
            }
            Self::RateLimited => "The Provider price source rate-limited this read; retry later.",
            Self::ServerError => "The Provider price source returned a server error; retry later.",
            Self::Rejected => {
                "The Provider price source rejected the read; verify the documented public source."
            }
            Self::Redirect => {
                "The Provider price source redirected; Niu does not follow untrusted redirects. Verify the canonical documented URL."
            }
            Self::ResponseTooLarge => "The Provider price source exceeds the 2 MiB safety limit.",
            Self::InvalidDocument => "The Provider price source returned an invalid document.",
        }
    }
    #[allow(dead_code)]
    pub(crate) fn retryable(self) -> bool {
        matches!(
            self,
            Self::Timeout
                | Self::Unreachable
                | Self::Transport
                | Self::RateLimited
                | Self::ServerError
        )
    }
    fn from_status(status: reqwest::StatusCode) -> Option<Self> {
        if status.is_success() {
            return None;
        }
        Some(match status.as_u16() {
            401 | 403 => Self::Authentication,
            429 => Self::RateLimited,
            300..=399 => Self::Redirect,
            500..=599 => Self::ServerError,
            _ => Self::Rejected,
        })
    }
    fn from_transport(error: &reqwest::Error) -> Self {
        if error.is_timeout() {
            Self::Timeout
        } else if error.is_connect() {
            Self::Unreachable
        } else {
            Self::Transport
        }
    }
    fn from_endpoint(error: niu_upstream::EndpointError) -> Self {
        match error {
            niu_upstream::EndpointError::PrivateAddress => Self::BlockedDestination,
            niu_upstream::EndpointError::ResolutionFailed => Self::Unreachable,
            niu_upstream::EndpointError::InvalidUrl
            | niu_upstream::EndpointError::InvalidTimeout
            | niu_upstream::EndpointError::ClientConfiguration => Self::Configuration,
        }
    }
}

fn source_api_error(failure: SourceFailure) -> crate::error::ApiError {
    crate::error::ApiError::price_source(failure.code(), failure.message())
}

async fn read_source_with_limit(
    client: &reqwest::Client,
    source: &str,
    support: types::PriceSupport,
    limit: usize,
) -> Result<Vec<u8>, SourceFailure> {
    let accept = match support {
        types::PriceSupport::OfficialMarkdown => "text/markdown",
        types::PriceSupport::OfficialPageJson => "text/html",
        _ => "application/json",
    };
    let mut response = client
        .get(source)
        .header(reqwest::header::ACCEPT, accept)
        .send()
        .await
        .map_err(|error| SourceFailure::from_transport(&error))?;
    if let Some(failure) = SourceFailure::from_status(response.status()) {
        return Err(failure);
    }
    let mut body = Vec::new();
    loop {
        match response.chunk().await {
            Ok(Some(chunk)) => {
                if body.len().saturating_add(chunk.len()) > limit {
                    return Err(SourceFailure::ResponseTooLarge);
                }
                body.extend_from_slice(&chunk);
            }
            Ok(None) => break,
            Err(error) => return Err(SourceFailure::from_transport(&error)),
        }
    }
    Ok(body)
}

async fn read_source(
    client: &reqwest::Client,
    source: &str,
    support: types::PriceSupport,
) -> Result<Vec<u8>, SourceFailure> {
    read_source_with_limit(client, source, support, MAX_SOURCE_BYTES).await
}

/// Text sources stay text; machine catalogs must be JSON. Empty bodies never
/// become an empty price catalog by accident.
fn decode_document(body: &[u8], support: types::PriceSupport) -> Result<Value, SourceFailure> {
    if body.is_empty() {
        return Err(SourceFailure::InvalidDocument);
    }
    match support {
        types::PriceSupport::OfficialMarkdown | types::PriceSupport::OfficialPageJson => {
            let text = std::str::from_utf8(body).map_err(|_| SourceFailure::InvalidDocument)?;
            if text.trim().is_empty() {
                return Err(SourceFailure::InvalidDocument);
            }
            Ok(Value::String(text.to_owned()))
        }
        _ => serde_json::from_slice(body).map_err(|_| SourceFailure::InvalidDocument),
    }
}

/// Bounded public quote retrieval. It never sends a saved inference credential
/// to a public/console price endpoint, and never follows redirects.
pub(crate) async fn pricing(
    state: &crate::state::AppState,
    id: &str,
) -> Result<Pricing, crate::error::ApiError> {
    use crate::error::ApiError;
    let adapter = find(id)
        .ok_or_else(|| ApiError::invalid_request("Choose a supported Provider service adapter"))?;
    let descriptor = adapter.descriptor();
    if descriptor.price_support == types::PriceSupport::OfficialCatalog {
        return Ok(adapter.pricing(&serde_json::Value::Null));
    }
    let client = crate::upstream::configured_client_for_endpoint(
        state,
        descriptor.price_source,
        PRICE_SOURCE_TIMEOUT,
    )
    .await
    .map_err(|error| source_api_error(SourceFailure::from_endpoint(error)))?;
    let body = read_source(&client, descriptor.price_source, descriptor.price_support)
        .await
        .map_err(source_api_error)?;
    let document = decode_document(&body, descriptor.price_support).map_err(source_api_error)?;
    let mut pricing = adapter.pricing(&document);
    pricing.source_digest = Some(
        ring::digest::digest(&ring::digest::SHA256, &body)
            .as_ref()
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect(),
    );
    pricing.observed_at_ms = now_ms();
    Ok(pricing)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn every_adapter_declares_version_capabilities_currency_and_failure_recovery() {
        for adapter in registry() {
            let descriptor = adapter.descriptor();
            assert_eq!(descriptor.adapter_version, types::ADAPTER_VERSION);
            assert!(!descriptor.capabilities.is_empty(), "{}", descriptor.id);
            assert!(descriptor.capabilities.len() <= 8, "{}", descriptor.id);
            match descriptor.id {
                "openrouter" | "deepseek" => {
                    assert_eq!(descriptor.price_currency, Some("USD"), "{}", descriptor.id)
                }
                "qiniu" => assert_eq!(descriptor.price_currency, Some("CNY"), "{}", descriptor.id),
                _ => assert_eq!(descriptor.price_currency, None, "{}", descriptor.id),
            }
            let unavailable = adapter.pricing(&Value::Null);
            assert_eq!(unavailable.status, "unavailable", "{}", descriptor.id);
            assert!(unavailable.reason.is_some(), "{}", descriptor.id);
            assert!(unavailable.recovery.is_some(), "{}", descriptor.id);
        }
    }

    #[test]
    fn protocol_compatibility_does_not_imply_price_compatibility() {
        let model =
            json!({"name":"Model", "pricing":{"prompt":"0.000003","completion":"0.000015"}});
        assert_eq!(
            metadata("openrouter", &model).input_price.as_deref(),
            Some("0.000003")
        );
        for id in [
            "fastrouter",
            "babelark",
            "qiniu",
            "deepseek",
            "custom",
            "newapi",
        ] {
            assert!(metadata(id, &model).input_price.is_none());
        }
        assert!(find("unknown").is_none());
    }
    #[test]
    fn exact_quotes_and_unknown_dimensions_survive_without_becoming_tariffs() {
        let prices=find("openrouter").unwrap().pricing(&json!({"data":[{"id":"maker/model","pricing":{"prompt":"0.0000003","completion":"0","request":"0.001","future_meter":"0.5"}}]}));
        assert_eq!(prices.status, "partial");
        assert_eq!(prices.prices.len(), 1);
        assert_eq!(prices.prices[0].rates[0].amount, "0.0000003");
        assert_eq!(prices.prices[0].rates[1].amount, "0");
        assert_eq!(
            prices.prices[0].unsupported_dimensions,
            vec!["future_meter"]
        );
        assert!(prices.prices[0].rates.iter().all(|r| r.currency == "USD"));
    }
    #[test]
    fn numeric_native_prices_preserve_decimal_source_precision() {
        let document: Value =
            serde_json::from_str(r#"{"amount":1.123456789012345678901234567890}"#).unwrap();
        assert_eq!(
            types::decimal(&document["amount"]).as_deref(),
            Some("1.123456789012345678901234567890")
        );
        // Official SSR JSON sometimes emits exact exponent notation.
        let document: Value = serde_json::from_str(r#"{"a":4e-05,"b":1.230e2,"c":1e-7}"#).unwrap();
        assert_eq!(types::decimal(&document["a"]).as_deref(), Some("0.00004"));
        assert_eq!(types::decimal(&document["b"]).as_deref(), Some("123"));
        assert_eq!(types::decimal(&document["c"]).as_deref(), Some("0.0000001"));
        assert_eq!(
            types::decimal(&json!("1e-1000")),
            None,
            "unbounded exponents must stay unknown"
        );
    }
    #[test]
    fn ratios_without_a_verified_monetary_basis_do_not_become_money() {
        let quote=find("babelark").unwrap().pricing(&json!({"data":[{"model_name":"model","model_ratio":1.5,"completion_ratio":5,"cache_ratio":0.1,"quota_type":0}]}));
        assert_eq!(quote.status, "partial");
        assert!(quote.prices.is_empty());
        assert_eq!(quote.native_ratios[0].input_ratio.as_deref(), Some("1.5"));
        assert!(
            find("fastrouter")
                .unwrap()
                .pricing(&json!({"data":[]}))
                .prices
                .is_empty()
        );
    }
}

#[cfg(test)]
mod transport_tests {
    use super::*;
    use std::time::Duration;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    fn fixture(name: &str) -> &'static str {
        match name {
            "openrouter.models.json" => include_str!(concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/tests/fixtures/provider-pricing/openrouter.models.json"
            )),
            "fastrouter.pricing.json" => include_str!(concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/tests/fixtures/provider-pricing/fastrouter.pricing.json"
            )),
            "babelark.pricing.json" => include_str!(concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/tests/fixtures/provider-pricing/babelark.pricing.json"
            )),
            "qiniu.models.html" => include_str!(concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/tests/fixtures/provider-pricing/qiniu.models.html"
            )),
            "deepseek.pricing.md" => include_str!(concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/tests/fixtures/provider-pricing/deepseek.pricing.md"
            )),
            other => panic!("unknown fixture {other}"),
        }
    }

    async fn serve(response: &'static str, delay: Duration) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = [0_u8; 1024];
            let _ = socket.read(&mut request).await;
            if !delay.is_zero() {
                tokio::time::sleep(delay).await;
            }
            let _ = socket.write_all(response.as_bytes()).await;
            let _ = socket.shutdown().await;
        });
        format!("http://{address}/pricing")
    }

    fn client(timeout: Duration) -> reqwest::Client {
        reqwest::Client::builder()
            .timeout(timeout)
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap()
    }

    #[tokio::test]
    async fn source_read_classifies_auth_server_redirect_and_oversize() {
        let cases = [
            (
                "HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n",
                SourceFailure::Authentication,
            ),
            (
                "HTTP/1.1 429 Too Many Requests\r\nContent-Length: 0\r\n\r\n",
                SourceFailure::RateLimited,
            ),
            (
                "HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\n\r\n",
                SourceFailure::ServerError,
            ),
            (
                "HTTP/1.1 302 Found\r\nLocation: https://elsewhere.invalid/\r\nContent-Length: 0\r\n\r\n",
                SourceFailure::Redirect,
            ),
            (
                "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n",
                SourceFailure::Rejected,
            ),
        ];
        for (response, expected) in cases {
            let url = serve(response, Duration::ZERO).await;
            let failure = read_source(
                &client(Duration::from_secs(2)),
                &url,
                types::PriceSupport::ModelCatalog,
            )
            .await
            .unwrap_err();
            assert_eq!(failure, expected);
            assert_eq!(
                failure.retryable(),
                matches!(
                    expected,
                    SourceFailure::RateLimited | SourceFailure::ServerError
                )
            );
        }
        let url = serve(
            "HTTP/1.1 200 OK\r\nContent-Length: 64\r\n\r\n0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            Duration::ZERO,
        )
        .await;
        let failure = read_source_with_limit(
            &client(Duration::from_secs(2)),
            &url,
            types::PriceSupport::ModelCatalog,
            16,
        )
        .await
        .unwrap_err();
        assert_eq!(failure, SourceFailure::ResponseTooLarge);
    }

    #[tokio::test]
    async fn source_timeout_is_explicit_and_retryable() {
        let url = serve(
            "HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n{}",
            Duration::from_secs(2),
        )
        .await;
        let failure = read_source(
            &client(Duration::from_millis(80)),
            &url,
            types::PriceSupport::ModelCatalog,
        )
        .await
        .unwrap_err();
        assert_eq!(failure, SourceFailure::Timeout);
        assert!(failure.retryable());
        assert_eq!(failure.code(), "provider_price_source_timeout");
    }

    #[test]
    fn empty_and_malformed_bodies_are_invalid_documents() {
        for support in [
            types::PriceSupport::ModelCatalog,
            types::PriceSupport::OfficialMarkdown,
            types::PriceSupport::OfficialPageJson,
        ] {
            assert_eq!(
                decode_document(b"", support).unwrap_err(),
                SourceFailure::InvalidDocument
            );
        }
        assert_eq!(
            decode_document(b"{not json", types::PriceSupport::ModelCatalog).unwrap_err(),
            SourceFailure::InvalidDocument
        );
        assert_eq!(
            decode_document(b"   \n", types::PriceSupport::OfficialMarkdown).unwrap_err(),
            SourceFailure::InvalidDocument
        );
        assert_eq!(
            decode_document(b"# pricing", types::PriceSupport::OfficialMarkdown)
                .unwrap()
                .as_str(),
            Some("# pricing")
        );
    }

    #[test]
    fn private_destination_is_reported_without_retry() {
        let failure = SourceFailure::from_endpoint(niu_upstream::EndpointError::PrivateAddress);
        assert_eq!(failure, SourceFailure::BlockedDestination);
        assert!(!failure.retryable());
        assert_eq!(failure.code(), "provider_price_source_blocked_destination");
    }

    #[test]
    fn fixture_manifest_files_are_present_and_nonempty() {
        for name in [
            "openrouter.models.json",
            "fastrouter.pricing.json",
            "babelark.pricing.json",
            "qiniu.models.html",
            "deepseek.pricing.md",
        ] {
            assert!(!fixture(name).is_empty(), "{name}");
        }
    }
}

#[cfg(test)]
#[test]
#[ignore = "requires independently downloaded official source evidence"]
fn downloaded_official_sources_match_qualified_normalizers() {
    let dir =
        std::env::var("NIU_PROVIDER_EVIDENCE_DIR").expect("Set an external evidence directory");
    let read = |name: &str| {
        std::fs::read_to_string(std::path::Path::new(&dir).join(name))
            .unwrap_or_else(|_| panic!("missing evidence file {name}"))
    };
    let deepseek = read("deepseek.md");
    let deepseek = find("deepseek").unwrap().pricing(&Value::String(deepseek));
    assert_eq!(deepseek.prices.len(), 2);
    assert!(deepseek.prices.iter().all(|model| model.rates.len() == 6));
    assert!(
        deepseek
            .discounts
            .iter()
            .any(|item| item.kind == "off_peak_discount")
    );
    let qiniu = read("qiniu.html");
    let qiniu = find("qiniu").unwrap().pricing(&Value::String(qiniu));
    assert!(qiniu.prices.len() > 50);
    assert!(qiniu.prices.iter().any(|model| !model.rates.is_empty()));
    assert!(
        qiniu
            .prices
            .iter()
            .flat_map(|model| &model.rates)
            .all(|rate| rate.currency == "CNY")
    );
    assert!(
        qiniu
            .prices
            .iter()
            .all(|model| model.source_rules.is_some())
    );
    let openrouter: Value = serde_json::from_str(&read("openrouter.json")).unwrap();
    let openrouter = find("openrouter").unwrap().pricing(&openrouter);
    assert_ne!(openrouter.status, "unavailable");
    assert!(
        openrouter
            .prices
            .iter()
            .flat_map(|model| &model.rates)
            .all(|rate| rate.currency == "USD")
    );
    let fastrouter: Value = serde_json::from_str(&read("fastrouter.json")).unwrap();
    let fastrouter = find("fastrouter").unwrap().pricing(&fastrouter);
    assert_eq!(fastrouter.status, "unavailable");
    assert!(fastrouter.prices.is_empty());
    assert!(fastrouter.source_version.is_some());
    let babelark: Value = serde_json::from_str(&read("babelark.json")).unwrap();
    let babelark = find("babelark").unwrap().pricing(&babelark);
    assert_eq!(babelark.basis, "native_ratios_not_money");
    assert!(babelark.prices.is_empty());
    assert!(!babelark.native_ratios.is_empty());
    println!(
        "Official evidence qualified: DeepSeek {} models with explicit time/cache conditions; Qiniu {} public models, {} normalized rates; OpenRouter {} model quotes; FastRouter empty feed version {:?}; BabelArk {} native ratio records.",
        deepseek.prices.len(),
        qiniu.prices.len(),
        qiniu
            .prices
            .iter()
            .map(|model| model.rates.len())
            .sum::<usize>(),
        openrouter.prices.len(),
        fastrouter.source_version,
        babelark.native_ratios.len()
    );
}
