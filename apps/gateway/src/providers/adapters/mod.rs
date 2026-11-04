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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
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
        std::time::Duration::from_secs(5),
    )
    .await
    .map_err(|_| ApiError::upstream_message("Provider price source could not be reached"))?;
    let mut response = client
        .get(descriptor.price_source)
        .header(
            reqwest::header::ACCEPT,
            match descriptor.price_support {
                types::PriceSupport::OfficialMarkdown => "text/markdown",
                types::PriceSupport::OfficialPageJson => "text/html",
                _ => "application/json",
            },
        )
        .send()
        .await
        .map_err(|_| ApiError::upstream_message("Provider price source could not be reached"))?;
    if !response.status().is_success() {
        return Err(ApiError::upstream_message(
            "Provider price source did not return a successful response",
        ));
    }
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| ApiError::upstream_message("Provider price response could not be read"))?
    {
        if body.len().saturating_add(chunk.len()) > 2 * 1024 * 1024 {
            return Err(ApiError::upstream_message(
                "Provider price response exceeds the 2 MiB safety limit",
            ));
        }
        body.extend_from_slice(&chunk);
    }
    let document = if matches!(
        descriptor.price_support,
        types::PriceSupport::OfficialMarkdown | types::PriceSupport::OfficialPageJson
    ) {
        serde_json::Value::String(String::from_utf8(body.clone()).map_err(|_| {
            ApiError::upstream_message("Provider price source returned invalid text")
        })?)
    } else {
        serde_json::from_slice(&body).map_err(|_| {
            ApiError::upstream_message("Provider price source returned an invalid document")
        })?
    };
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
#[test]
#[ignore = "requires independently downloaded official source evidence"]
fn downloaded_official_sources_match_qualified_normalizers() {
    let dir =
        std::env::var("NIU_PROVIDER_EVIDENCE_DIR").expect("Set an external evidence directory");
    let deepseek = std::fs::read_to_string(std::path::Path::new(&dir).join("deepseek.md")).unwrap();
    let deepseek = find("deepseek").unwrap().pricing(&Value::String(deepseek));
    assert_eq!(deepseek.prices.len(), 2);
    assert!(deepseek.prices.iter().all(|model| model.rates.len() == 6));
    let qiniu = std::fs::read_to_string(std::path::Path::new(&dir).join("qiniu.html")).unwrap();
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
    println!(
        "Official evidence qualified: DeepSeek {} models with explicit time/cache conditions; Qiniu {} public models, {} normalized rates, complex rules retained.",
        deepseek.prices.len(),
        qiniu.prices.len(),
        qiniu
            .prices
            .iter()
            .map(|model| model.rates.len())
            .sum::<usize>()
    );
}
