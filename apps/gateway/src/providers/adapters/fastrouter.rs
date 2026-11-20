use super::{ProviderAdapter, types::*};
use serde_json::Value;

pub struct FastRouter;
pub static ADAPTER: FastRouter = FastRouter;

impl ProviderAdapter for FastRouter {
    fn descriptor(&self) -> Descriptor {
        Descriptor {
            id: "fastrouter",
            name: "FastRouter",
            protocol: "openai",
            api_base: "https://fastrouter.wecitytech.com/v1",
            website: "https://fastrouter-docs.wecitytech.com/en/",
            price_support: PriceSupport::RequiresQualification,
            price_source: "https://fastrouter.wecitytech.com/api/pricing",
            adapter_version: ADAPTER_VERSION,
            capabilities: &[
                "anonymous_price_feed",
                "provider_pricing_version",
                "native_group_ratios",
                "documented_billing_rules",
            ],
            price_currency: None,
        }
    }
    fn pricing(&self, document: &Value) -> Pricing {
        let source = self.descriptor().price_source;
        if document["success"].as_bool() == Some(false) {
            return Pricing::unavailable_with_recovery(
                source,
                "source_reported_failure",
                recovery::RETRY_SOURCE_READ,
            );
        }
        let source_version = document["pricing_version"]
            .as_str()
            .filter(|version| {
                !version.is_empty()
                    && version.len() <= 128
                    && version
                        .chars()
                        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
            })
            .map(str::to_owned);
        let Some(models) = document["data"].as_array() else {
            return Pricing::unavailable_with_recovery(
                source,
                "invalid_pricing_document",
                recovery::REVIEW_SOURCE_CONTRACT,
            );
        };
        if models.is_empty() {
            let mut pricing = Pricing::unavailable_with_recovery(
                source,
                "anonymous_inventory_empty",
                recovery::QUALIFY_AUTHENTICATED_FEED,
            );
            pricing.source_version = source_version;
            pricing.ambiguities.push(Ambiguity {
                kind: "currency_unit_unknown",
                detail: "The anonymous pricing feed exposes no model rows, currency or per-unit monetary basis; an empty feed is not free inventory.".to_owned(),
            });
            return pricing;
        }
        // A future non-empty anonymous/qualified row set keeps native ratios,
        // never a monetary conversion that the feed did not establish.
        let mut pricing = super::babelark::native_ratios(document, source);
        pricing.source_version = source_version;
        pricing.reason = Some("authenticated_effective_price_feed_unverified");
        pricing.recovery = Some(recovery::QUALIFY_AUTHENTICATED_FEED);
        pricing
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn fixture() -> Value {
        serde_json::from_str(include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/tests/fixtures/provider-pricing/fastrouter.pricing.json"
        )))
        .unwrap()
    }

    #[test]
    fn live_anonymous_feed_is_empty_and_never_free_inventory() {
        let quote = ADAPTER.pricing(&fixture());
        assert_eq!(quote.status, "unavailable");
        assert_eq!(quote.reason, Some("anonymous_inventory_empty"));
        assert_eq!(quote.recovery, Some("qualify_authenticated_price_feed"));
        assert_eq!(
            quote.source_version.as_deref(),
            Some("a42d372ccf0b5dd13ecf71203521f9d2")
        );
        assert!(quote.prices.is_empty());
        assert!(quote.native_ratios.is_empty());
        assert_eq!(quote.ambiguities[0].kind, "currency_unit_unknown");
        assert_eq!(quote.normalization_version, 2);
    }

    #[test]
    fn empty_and_changed_envelopes_have_distinct_outcomes() {
        let empty: Value = serde_json::from_str(include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/tests/fixtures/provider-pricing/fastrouter.empty.json"
        )))
        .unwrap();
        assert_eq!(ADAPTER.pricing(&empty).status, "unavailable");
        assert_eq!(
            ADAPTER.pricing(&empty).reason,
            Some("anonymous_inventory_empty")
        );
        let malformed: Value = serde_json::from_str(include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/tests/fixtures/provider-pricing/fastrouter.malformed.json"
        )))
        .unwrap();
        let quote = ADAPTER.pricing(&malformed);
        assert_eq!(quote.status, "unavailable");
        assert_eq!(quote.reason, Some("invalid_pricing_document"));
        assert_eq!(quote.recovery, Some("review_source_contract"));
        assert_eq!(
            ADAPTER.pricing(&json!({"success":false})).reason,
            Some("source_reported_failure")
        );
    }

    #[test]
    fn a_present_feed_still_does_not_invent_a_monetary_basis() {
        let quote = ADAPTER.pricing(&json!({
            "success": true,
            "pricing_version": "v1",
            "data": [{"model_name":"model","model_ratio":1.5,"completion_ratio":5}]
        }));
        assert_eq!(quote.status, "partial");
        assert_eq!(quote.source_version.as_deref(), Some("v1"));
        assert!(quote.prices.is_empty());
        assert_eq!(quote.native_ratios[0].input_ratio.as_deref(), Some("1.5"));
        assert_eq!(quote.recovery, Some("qualify_authenticated_price_feed"));
        assert_eq!(
            quote.reason,
            Some("authenticated_effective_price_feed_unverified")
        );
    }
}
