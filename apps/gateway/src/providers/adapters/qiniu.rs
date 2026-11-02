use super::{ProviderAdapter, types::*};
use serde_json::Value;
pub struct Qiniu;
pub static ADAPTER: Qiniu = Qiniu;
impl ProviderAdapter for Qiniu {
    fn descriptor(&self) -> Descriptor {
        Descriptor {
            id: "qiniu",
            name: "Qiniu",
            protocol: "openai",
            api_base: "https://api.qnaigc.com/v1",
            website: "https://developer.qiniu.com/aitokenapi/13379/real-time-ai-interface-api",
            price_support: PriceSupport::OfficialPageJson,
            price_source: "https://www.qiniu.com/ai/models",
        }
    }
    fn pricing(&self, document: &Value) -> Pricing {
        self.parse(document).unwrap_or_else(|| {
            Pricing::unavailable(
                self.descriptor().price_source,
                "official_model_square_schema_changed",
            )
        })
    }
}
impl Qiniu {
    fn parse(&self, document: &Value) -> Option<Pricing> {
        // This is inert SSR JSON from the official model square, never executable page code.
        let html = document.as_str()?;
        let pattern = regex::Regex::new(
            r#"(?s)<script id="__NEXT_DATA__" type="application/json">(.*?)</script>"#,
        )
        .ok()?;
        let captures = pattern.captures(html)?;
        let source: Value = serde_json::from_str(captures.get(1)?.as_str()).ok()?;
        let models = source.pointer("/props/pageProps/models")?.as_array()?;
        if models.is_empty() || models.len() > 5000 {
            return None;
        }
        let mut prices = Vec::new();
        let mut ids = std::collections::BTreeSet::new();
        let mut partial = false;
        for model in models {
            if model["private"].as_bool() != Some(false) {
                continue;
            }
            let Some(id) = model["id"]
                .as_str()
                .filter(|id| !id.is_empty() && id.len() <= 200)
            else {
                partial = true;
                continue;
            };
            if !ids.insert(id) {
                return None;
            }
            let Some(rules) = model["pricing_rules_v2"].as_array() else {
                partial = true;
                continue;
            };
            let mut rates = Vec::new();
            let mut unsupported = Vec::new();
            // Preserve tiers, time windows and media variants for agents without choosing a rate.
            if rules.len() != 1 {
                unsupported.push("tiered_or_missing_rules_require_qualification".into());
            } else if let Some(details) = rules[0]["details_v2"].as_object() {
                for (key, quote) in details {
                    let meter = match key.as_str() {
                        "input" | "ncache" => "input_tokens",
                        "cache" => "cached_input_tokens",
                        "output" => "output_tokens",
                        "c_cache" => "cache_write_tokens",
                        _ => {
                            unsupported.push(key.clone());
                            continue;
                        }
                    };
                    let amount = decimal(&quote["unit_price"]);
                    let unit_size = quote["unit_size"]
                        .as_u64()
                        .filter(|n| *n > 0 && *n <= 1_000_000);
                    if quote["unit_name"] != "token" || amount.is_none() || unit_size.is_none() {
                        unsupported.push(key.clone());
                        continue;
                    }
                    rates.push(Rate {
                        condition: None,
                        meter,
                        amount: amount?,
                        currency: "CNY",
                        per_units: unit_size?,
                        unit: "token",
                    });
                }
                let context = model["model_constraints"]["context_length"]
                    .as_u64()
                    .filter(|n| *n > 0);
                let covers_context = |key: &str| {
                    rules[0][key].as_array().is_some_and(|range| {
                        range.len() == 2
                            && range[0].as_u64() == Some(0)
                            && context.is_some_and(|limit| {
                                range[1].as_u64().is_some_and(|max| max >= limit)
                            })
                    })
                };
                let known = [
                    "input_range",
                    "output_range",
                    "input_item_type",
                    "output_item_type",
                    "details",
                    "details_v2",
                    "item_order",
                ];
                let unknown_rule = rules[0]
                    .as_object()
                    .is_none_or(|fields| fields.keys().any(|key| !known.contains(&key.as_str())));
                if !covers_context("input_range") || !covers_context("output_range") || unknown_rule
                {
                    rates.clear();
                    unsupported.push("conditional_rule_requires_qualification".into());
                }
                // Item-specific rules need a qualified selection; a generic token price is insufficient.
                if rules[0]["input_item_type"]
                    .as_str()
                    .is_none_or(|s| !s.is_empty())
                    || rules[0]["output_item_type"]
                        .as_str()
                        .is_none_or(|s| !s.is_empty())
                {
                    rates.clear();
                    unsupported.push("item_specific_rule_requires_qualification".into());
                }
            } else {
                unsupported.push("missing_price_details".into());
            }
            partial |= rates.is_empty() || !unsupported.is_empty();
            prices.push(ModelPrice {
                model: id.to_owned(),
                rates,
                unsupported_dimensions: unsupported,
                source_rules: Some(Value::Array(rules.clone())),
            });
        }
        Some(Pricing {
            normalization_version: 1,
            source_digest: None,
            observed_at_ms: None,
            status: if prices.is_empty() {
                "unavailable"
            } else if partial {
                "partial"
            } else {
                "available"
            },
            source: self.descriptor().price_source,
            basis: "advertised",
            prices,
            native_ratios: vec![],
            group_multipliers: Default::default(),
            conditions: vec![],
            reason: partial.then_some(
                "advertised_cny_only_complex_rules_preserved_not_automatically_selected",
            ),
        })
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn official_model_square_preserves_cny_tiers_and_unsupported_dimensions() {
        let rate = json!({"input_range":[0,99999999],"output_range":[0,99999999],"input_item_type":"","output_item_type":"","details_v2":{"input":{"unit_name":"token","unit_size":1000,"unit_price":"0.001","unit_price_usd":"9"},"output_peak":{"unit_name":"token","unit_size":1000,"unit_price":"0.2"}}});
        let data = json!({"props":{"pageProps":{"models":[{"id":"example/model","private":false,"model_constraints":{"context_length":8192},"pricing_rules_v2":[rate.clone()]},{"id":"example/tiered","private":false,"model_constraints":{"context_length":8192},"pricing_rules_v2":[rate.clone(),rate]},{"id":"private/model","private":true,"pricing_rules_v2":[]}]}}});
        let html = format!(r#"<script id="__NEXT_DATA__" type="application/json">{data}</script>"#);
        let result = ADAPTER.pricing(&Value::String(html));
        assert_eq!(result.prices.len(), 2);
        assert_eq!(result.status, "partial");
        assert_eq!(result.prices[0].rates[0].currency, "CNY");
        assert_eq!(result.prices[0].rates[0].amount, "0.001");
        assert_eq!(result.prices[0].rates[0].per_units, 1000);
        assert_eq!(result.prices[0].unsupported_dimensions, vec!["output_peak"]);
        assert!(result.prices[1].rates.is_empty());
        assert_eq!(
            result.prices[1]
                .source_rules
                .as_ref()
                .unwrap()
                .as_array()
                .unwrap()
                .len(),
            2
        );
        assert_eq!(
            ADAPTER
                .pricing(&Value::String("changed page".into()))
                .status,
            "unavailable"
        );
    }
}
