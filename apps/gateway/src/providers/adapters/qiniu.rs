use super::{ProviderAdapter, types::*};
use crate::catalog_metadata::CatalogMetadata;
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};

/// Descriptive metadata only. Ambiguous IDs or aliases are omitted; public
/// listings never add models to the credential-scoped API inventory.
pub(crate) fn model_square_metadata(html: &str) -> Option<BTreeMap<String, CatalogMetadata>> {
    let pattern = regex::Regex::new(
        r#"(?s)<script id="__NEXT_DATA__" type="application/json">(.*?)</script>"#,
    )
    .ok()?;
    let source: Value = serde_json::from_str(pattern.captures(html)?.get(1)?.as_str()).ok()?;
    let models = source.pointer("/props/pageProps/models")?.as_array()?;
    if models.is_empty() || models.len() > 5000 {
        return None;
    }
    let mut found = BTreeMap::new();
    let mut ambiguous = BTreeSet::new();
    for model in models {
        if model["private"].as_bool() != Some(false) {
            continue;
        }
        let Some(id) = model["id"]
            .as_str()
            .filter(|id| !id.is_empty() && id.len() <= 200)
        else {
            continue;
        };
        let mut metadata = CatalogMetadata::from_provider(model);
        metadata.context_length = metadata.context_length.or_else(|| {
            model["model_constraints"]["context_length"]
                .as_u64()
                .filter(|n| *n > 0)
        });
        metadata.max_completion_tokens = metadata.max_completion_tokens.or_else(|| {
            model["model_constraints"]["max_completion_tokens"]
                .as_u64()
                .filter(|n| *n > 0)
        });
        metadata.input_price = None;
        metadata.output_price = None;
        // The model square's protocol-specific declaration must corroborate
        // any generic parameter label before it can enable Chat tool calls.
        metadata
            .supported_parameters
            .retain(|parameter| parameter != "tools");
        if model["architecture"]["function_calling"]["supported"].as_bool() == Some(true)
            && model["support_api_protocols"]
                .as_array()
                .is_some_and(|protocols| {
                    protocols
                        .iter()
                        .any(|protocol| protocol.as_str() == Some("openai-chat"))
                })
            && !metadata
                .supported_parameters
                .iter()
                .any(|parameter| parameter == "tools")
            && metadata.supported_parameters.len() < 64
        {
            metadata.supported_parameters.push("tools".to_owned());
        }
        if !metadata.valid() {
            continue;
        }
        let aliases = model["model_alias"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .filter(|alias| !alias.is_empty() && alias.len() <= 200);
        for key in std::iter::once(id).chain(aliases).collect::<BTreeSet<_>>() {
            if ambiguous.contains(key) {
                continue;
            }
            if found.insert(key.to_owned(), metadata.clone()).is_some() {
                found.remove(key);
                ambiguous.insert(key.to_owned());
            }
        }
    }
    Some(found)
}

pub struct Qiniu;
pub static ADAPTER: Qiniu = Qiniu;

fn split_condition(key: &str) -> (&str, Option<&'static str>) {
    if let Some(base) = key.strip_suffix("_offpeak") {
        (base, Some("off_peak"))
    } else if let Some(base) = key.strip_suffix("_peak") {
        (base, Some("peak"))
    } else {
        (key, None)
    }
}

fn meter(base: &str) -> Option<&'static str> {
    match base {
        "input" | "ncache" => Some("input_tokens"),
        "cache" => Some("cached_input_tokens"),
        "output" => Some("output_tokens"),
        "c_cache" => Some("cache_write_tokens"),
        _ => None,
    }
}

impl Qiniu {
    fn parse(&self, document: &Value) -> Result<Pricing, &'static str> {
        // This is inert SSR JSON from the official model square, never executable page code.
        let html = document
            .as_str()
            .ok_or("official_model_square_schema_changed")?;
        let pattern = regex::Regex::new(
            r#"(?s)<script id="__NEXT_DATA__" type="application/json">(.*?)</script>"#,
        )
        .map_err(|_| "official_model_square_schema_changed")?;
        let captures = pattern
            .captures(html)
            .ok_or("official_model_square_schema_changed")?;
        let source: Value = serde_json::from_str(
            captures
                .get(1)
                .ok_or("official_model_square_schema_changed")?
                .as_str(),
        )
        .map_err(|_| "official_model_square_schema_changed")?;
        let models = source
            .pointer("/props/pageProps/models")
            .and_then(Value::as_array)
            .ok_or("official_model_square_schema_changed")?;
        if models.is_empty() {
            return Err("empty_public_model_square");
        }
        if models.len() > 5000 {
            return Err("official_model_square_too_large");
        }
        let mut prices = Vec::new();
        let mut ids = BTreeSet::new();
        let mut discounts = Vec::new();
        let mut ambiguities: Vec<Ambiguity> = Vec::new();
        let mut partial = false;
        let mut has_conditional = false;
        let mut has_media = false;
        let mut has_tiers = false;
        let mut saw_usd = false;
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
            if !ids.insert(id.to_owned()) {
                return Err("official_model_square_schema_changed");
            }
            let Some(rules) = model["pricing_rules_v2"].as_array() else {
                partial = true;
                prices.push(ModelPrice {
                    source_rules: None,
                    model: id.to_owned(),
                    rates: vec![],
                    unsupported_dimensions: vec!["missing_pricing_rules".into()],
                });
                continue;
            };
            let mut rates = Vec::new();
            let mut unsupported = Vec::new();
            if rules.is_empty() {
                unsupported.push("no_public_pricing_rule".to_owned());
            } else if rules.len() > 1 {
                has_tiers = true;
                unsupported.push("tiered_input_range_requires_qualification".to_owned());
                for rule in rules.iter().take(32) {
                    if discounts.len() < 256 {
                        discounts.push(Discount {
                            model: Some(id.to_owned()),
                            kind: "volume_tier",
                            description:
                                "Official rule selects by prompt-token range; tiers are preserved but never selected automatically."
                                    .to_owned(),
                            source_rules: Some(json!({
                                "input_range": rule.get("input_range").cloned().unwrap_or(Value::Null),
                                "output_range": rule.get("output_range").cloned().unwrap_or(Value::Null)
                            })),
                        });
                    }
                }
            } else if let Some(details) = rules[0]["details_v2"].as_object() {
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
                let clears = unknown_rule
                    || !covers_context("input_range")
                    || !covers_context("output_range")
                    || rules[0]["input_item_type"]
                        .as_str()
                        .is_none_or(|s| !s.is_empty())
                    || rules[0]["output_item_type"]
                        .as_str()
                        .is_none_or(|s| !s.is_empty());
                if clears {
                    unsupported.push("conditional_rule_requires_qualification".to_owned());
                }
                for (key, quote) in details {
                    let Some(quote) = quote.as_object() else {
                        unsupported.push(key.chars().take(80).collect());
                        continue;
                    };
                    if let Some(quota) = quote
                        .get("free_quota")
                        .and_then(Value::as_u64)
                        .filter(|quota| *quota > 0)
                        && discounts.len() < 256
                    {
                        discounts.push(Discount {
                            model: Some(id.to_owned()),
                            kind: "free_quota",
                            description: format!(
                                "Official detail '{key}' includes {quota} free {}. The free allowance is evidence, not a selected price.",
                                quote.get("unit_name").and_then(Value::as_str).unwrap_or("unit")
                            ),
                            source_rules: Some(Value::Object(quote.clone())),
                        });
                    }
                    if quote.contains_key("unit_price_usd") {
                        saw_usd = true;
                    }
                    let unit_name = quote["unit_name"].as_str().unwrap_or("");
                    if unit_name != "token" {
                        if matches!(unit_name, "second" | "pic" | "time") {
                            has_media = true;
                        }
                        unsupported.push(key.chars().take(80).collect());
                        continue;
                    }
                    let (base, condition) = split_condition(key);
                    let Some(meter) = meter(base) else {
                        unsupported.push(key.chars().take(80).collect());
                        continue;
                    };
                    let amount = decimal(&quote["unit_price"]);
                    let unit_size = quote["unit_size"]
                        .as_u64()
                        .filter(|n| *n > 0 && *n <= 1_000_000);
                    let (Some(amount), Some(unit_size)) = (amount, unit_size) else {
                        unsupported.push(key.chars().take(80).collect());
                        continue;
                    };
                    if !clears {
                        rates.push(Rate {
                            condition,
                            meter,
                            amount,
                            currency: "CNY",
                            per_units: unit_size,
                            unit: "token",
                        });
                        has_conditional |= condition.is_some();
                    }
                }
            } else {
                unsupported.push("missing_price_details".to_owned());
            }
            unsupported.sort();
            unsupported.dedup();
            partial |= rates.is_empty() || !unsupported.is_empty();
            prices.push(ModelPrice {
                source_rules: Some(Value::Array(rules.clone())),
                model: id.to_owned(),
                rates,
                unsupported_dimensions: unsupported,
            });
        }
        if saw_usd {
            ambiguities.push(Ambiguity {
                kind: "approximate_alternate_currency",
                detail: "The official page also carries unit_price_usd. Niu retains the advertised CNY unit_price and does not infer an exchange rate or select the approximate USD value.".to_owned(),
            });
        }
        if has_conditional {
            ambiguities.push(Ambiguity {
                kind: "time_condition",
                detail: "Peak and off-peak rates are separately published. No time window is selected automatically; estimates require an explicit condition.".to_owned(),
            });
        }
        if has_tiers {
            ambiguities.push(Ambiguity {
                kind: "volume_tier",
                detail: "Multiple official rules apply at different prompt-token ranges; no tier is selected automatically.".to_owned(),
            });
        }
        if has_media {
            ambiguities.push(Ambiguity {
                kind: "non_token_units",
                detail: "Video/image/second-based details are preserved as unsupported dimensions and are never flattened into a token rate.".to_owned(),
            });
        }
        let mut conditions = Vec::new();
        if has_conditional {
            conditions.push(PriceCondition {
                id: "peak",
                description:
                    "Official peak rate. The applicable time window is not selected by this read."
                        .to_owned(),
            });
            conditions.push(PriceCondition {
                id: "off_peak",
                description:
                    "Official off-peak rate. The applicable time window is not selected by this read."
                        .to_owned(),
            });
        }
        Ok(Pricing {
            normalization_version: NORMALIZATION_VERSION,
            source_digest: None,
            source_version: None,
            conditions,
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
            discounts,
            ambiguities,
            recovery: if has_tiers || has_media {
                Some(recovery::PRESERVE_NATIVE_RULES)
            } else if has_conditional {
                Some(recovery::SELECT_CONDITION)
            } else if partial {
                Some(recovery::REVIEW_UNSUPPORTED)
            } else {
                None
            },
            reason: partial
                .then_some("advertised_cny_only_conditional_or_complex_rules_not_selected"),
        })
    }
}

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
            adapter_version: ADAPTER_VERSION,
            capabilities: &[
                "public_model_square",
                "model_metadata",
                "advertised_cny_prices",
                "peak_off_peak",
                "volume_tiers",
                "free_quota",
                "non_token_units",
            ],
            price_currency: Some("CNY"),
        }
    }
    fn pricing(&self, document: &Value) -> Pricing {
        let source = self.descriptor().price_source;
        self.parse(document).unwrap_or_else(|reason| {
            if reason == "empty_public_model_square" {
                Pricing::unavailable_with_recovery(source, reason, recovery::RETRY_SOURCE_READ)
            } else {
                Pricing::unavailable_with_recovery(source, reason, recovery::REVIEW_SOURCE_CONTRACT)
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::adapters::{Quantity, estimate};
    use serde_json::json;

    fn fixture() -> Value {
        Value::String(
            include_str!(concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/tests/fixtures/provider-pricing/qiniu.models.html"
            ))
            .to_owned(),
        )
    }

    #[test]
    fn model_square_metadata_matches_unique_public_ids_and_never_imports_prices() {
        let data = json!({"props":{"pageProps":{"models":[
            {"id":"maker/example","name":"Example","private":false,"model_alias":["example","shared"],"model_constraints":{"context_length":8192,"max_completion_tokens":1024},"support_api_protocols":["openai-chat"],"architecture":{"input_modalities":["text","image"],"output_modalities":["text"],"function_calling":{"supported":true}},"pricing":{"prompt":"1"}},
            {"id":"maker/other","private":false,"model_alias":["shared"],"supported_parameters":["tools"],"architecture":{"function_calling":{"supported":true}},"support_api_protocols":["anthropic-messages"]},
            {"id":"private/model","private":true,"model_alias":["secret"]}
        ]}}});
        let html = format!(r#"<script id="__NEXT_DATA__" type="application/json">{data}</script>"#);
        let metadata = model_square_metadata(&html).unwrap();
        assert_eq!(metadata["example"].name.as_deref(), Some("Example"));
        assert_eq!(
            metadata["maker/example"].input_modalities,
            vec!["text", "image"]
        );
        assert_eq!(metadata["example"].context_length, Some(8192));
        assert_eq!(metadata["example"].max_completion_tokens, Some(1024));
        assert_eq!(metadata["example"].supported_parameters, vec!["tools"]);
        assert!(metadata["maker/other"].supported_parameters.is_empty());
        assert!(metadata["example"].input_price.is_none());
        assert!(!metadata.contains_key("shared"));
        assert!(!metadata.contains_key("secret"));
        assert!(model_square_metadata("changed page").is_none());
    }

    #[test]
    fn official_square_preserves_cny_conditions_tiers_and_non_token_units() {
        let quote = ADAPTER.pricing(&fixture());
        assert_eq!(quote.status, "partial");
        assert_eq!(quote.normalization_version, 2);
        assert_eq!(quote.prices.len(), 4);
        let standard = quote
            .prices
            .iter()
            .find(|price| price.model == "z-ai/glm-5.2")
            .unwrap();
        assert_eq!(standard.rates.len(), 3);
        let input = standard
            .rates
            .iter()
            .find(|rate| rate.meter == "input_tokens")
            .unwrap();
        assert_eq!(input.currency, "CNY");
        assert_eq!(input.per_units, 1000);
        let conditional = quote
            .prices
            .iter()
            .find(|price| price.model == "deepseek/deepseek-v4.1-flash")
            .unwrap();
        assert_eq!(conditional.rates.len(), 6);
        assert!(
            conditional
                .rates
                .iter()
                .any(|rate| rate.condition == Some("peak"))
        );
        assert!(
            conditional
                .rates
                .iter()
                .any(|rate| rate.condition == Some("off_peak"))
        );
        let tiered = quote
            .prices
            .iter()
            .find(|price| price.model == "minimax/minimax-m3")
            .unwrap();
        assert!(tiered.rates.is_empty());
        assert!(
            tiered
                .unsupported_dimensions
                .contains(&"tiered_input_range_requires_qualification".to_owned())
        );
        assert_eq!(
            tiered
                .source_rules
                .as_ref()
                .unwrap()
                .as_array()
                .unwrap()
                .len(),
            2
        );
        let media = quote
            .prices
            .iter()
            .find(|price| price.model == "minimax/minimax-h3")
            .unwrap();
        assert!(media.rates.is_empty());
        assert!(
            media
                .unsupported_dimensions
                .contains(&"i_input_quantity".to_owned())
        );
        assert!(quote.discounts.iter().any(|item| item.kind == "free_quota"));
        assert!(
            quote
                .discounts
                .iter()
                .any(|item| item.kind == "volume_tier")
        );
        assert!(
            quote
                .ambiguities
                .iter()
                .any(|item| item.kind == "approximate_alternate_currency")
        );
        assert!(
            quote
                .ambiguities
                .iter()
                .any(|item| item.kind == "non_token_units")
        );
        assert_eq!(quote.recovery, Some("preserve_native_rules"));
        let evidence = serde_json::to_value(quote).unwrap();
        let estimate = estimate(
            &evidence,
            "deepseek/deepseek-v4.1-flash",
            &[Quantity {
                meter: "output_tokens".into(),
                condition: Some("off_peak".into()),
                units: "1000".into(),
            }],
        )
        .unwrap();
        assert_eq!(estimate["totals"][0]["amount"], "0.004");
        assert_eq!(estimate["status"], "available");
    }

    #[test]
    fn empty_and_changed_pages_are_observable() {
        let empty = Value::String(
            include_str!(concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/tests/fixtures/provider-pricing/qiniu.empty.html"
            ))
            .to_owned(),
        );
        let quote = ADAPTER.pricing(&empty);
        assert_eq!(quote.status, "unavailable");
        assert_eq!(quote.reason, Some("empty_public_model_square"));
        assert_eq!(quote.recovery, Some("retry_source_read"));
        let malformed = Value::String(
            include_str!(concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/tests/fixtures/provider-pricing/qiniu.malformed.html"
            ))
            .to_owned(),
        );
        let quote = ADAPTER.pricing(&malformed);
        assert_eq!(quote.status, "unavailable");
        assert_eq!(quote.reason, Some("official_model_square_schema_changed"));
        assert_eq!(quote.recovery, Some("review_source_contract"));
        assert_eq!(ADAPTER.pricing(&Value::Null).status, "unavailable");
    }

    #[test]
    fn unit_price_usd_is_not_substituted_for_cny() {
        let quote = ADAPTER.pricing(&fixture());
        assert!(
            quote
                .prices
                .iter()
                .flat_map(|price| &price.rates)
                .all(|rate| rate.currency == "CNY")
        );
        assert!(
            quote
                .prices
                .iter()
                .flat_map(|price| &price.rates)
                .all(|rate| rate.amount != "0.00121739")
        );
    }
}
