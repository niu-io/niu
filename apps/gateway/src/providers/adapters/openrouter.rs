use super::{ProviderAdapter, types::*};
use crate::catalog_metadata::CatalogMetadata;
use serde_json::Value;
use std::collections::BTreeSet;

pub struct OpenRouter;
pub static ADAPTER: OpenRouter = OpenRouter;

const KNOWN: &[(&str, &str, &str, Option<&str>)] = &[
    ("prompt", "input_tokens", "token", None),
    ("completion", "output_tokens", "token", None),
    ("input_cache_read", "cached_input_tokens", "token", None),
    ("input_cache_write", "cache_write_tokens", "token", None),
    (
        "input_cache_write_1h",
        "cache_write_tokens",
        "token",
        Some("1h"),
    ),
    ("request", "requests", "request", None),
];
/// Observed pricing fields whose unit is not unambiguously normalized here.
const UNIT_AMBIGUOUS: &[&str] = &[
    "image",
    "image_output",
    "audio",
    "audio_output",
    "input_audio_cache",
    "internal_reasoning",
    "web_search",
];
const OVERRIDE_CONDITIONS: &[&str] = &[
    "min_prompt_tokens",
    "utc_start",
    "utc_end",
    "utc_days",
    "prompt",
    "completion",
    "input_cache_read",
    "input_cache_write",
    "input_cache_write_1h",
    "request",
    "image",
    "image_output",
    "audio",
    "audio_output",
    "input_audio_cache",
    "internal_reasoning",
    "web_search",
];

fn valid_override(overrides: &[Value]) -> bool {
    overrides.iter().all(|entry| {
        let Some(fields) = entry.as_object() else {
            return false;
        };
        !fields.is_empty()
            && fields
                .keys()
                .all(|key| OVERRIDE_CONDITIONS.contains(&key.as_str()))
            && fields.get("min_prompt_tokens").is_none_or(|value| {
                value
                    .as_u64()
                    .is_some_and(|tokens| tokens > 0 && tokens <= 100_000_000)
            })
            && fields
                .get("utc_start")
                .is_none_or(|value| value.as_u64().is_some_and(|minute| minute <= 2400))
            && fields
                .get("utc_end")
                .is_none_or(|value| value.as_u64().is_some_and(|minute| minute <= 2400))
            && fields.get("utc_days").is_none_or(|value| {
                value.as_array().is_some_and(|days| {
                    !days.is_empty()
                        && days.len() <= 7
                        && days.iter().all(|day| {
                            day.as_str().is_some_and(|day| {
                                !day.is_empty()
                                    && day.len() <= 12
                                    && day.chars().all(|c| c.is_ascii_lowercase())
                            })
                        })
                })
            })
            && KNOWN.iter().all(|(key, _, _, _)| {
                fields
                    .get(*key)
                    .is_none_or(|value| decimal(value).is_some())
            })
    })
}

fn override_kind(entry: &Value) -> &'static str {
    if entry.get("min_prompt_tokens").is_some() {
        "volume_tier"
    } else if entry.get("utc_start").is_some()
        || entry.get("utc_end").is_some()
        || entry.get("utc_days").is_some()
    {
        "time_window"
    } else {
        "conditional_override"
    }
}

impl ProviderAdapter for OpenRouter {
    fn descriptor(&self) -> Descriptor {
        Descriptor {
            id: "openrouter",
            name: "OpenRouter",
            protocol: "openrouter",
            api_base: "https://openrouter.ai/api/v1",
            website: "https://openrouter.ai/settings/keys",
            price_support: PriceSupport::ModelCatalog,
            price_source: "https://openrouter.ai/api/v1/models",
            adapter_version: ADAPTER_VERSION,
            capabilities: &[
                "model_catalog",
                "advertised_prices",
                "cache_meters",
                "conditional_overrides",
                "batch_variants",
            ],
            price_currency: Some("USD"),
        }
    }
    fn metadata(&self, model: &Value) -> CatalogMetadata {
        CatalogMetadata::from_provider(model)
    }
    fn pricing(&self, document: &Value) -> Pricing {
        let source = self.descriptor().price_source;
        let Some(models) = document["data"].as_array() else {
            return Pricing::unavailable_with_recovery(
                source,
                "invalid_model_catalog",
                recovery::REVIEW_SOURCE_CONTRACT,
            );
        };
        if models.is_empty() {
            return Pricing::unavailable_with_recovery(
                source,
                "empty_model_catalog",
                recovery::RETRY_SOURCE_READ,
            );
        }
        let mut prices = Vec::new();
        let mut discounts = Vec::new();
        let mut ambiguities: Vec<Ambiguity> = Vec::new();
        let mut partial = false;
        let mut conditional = false;
        let mut saw_rates = false;
        for model in models {
            let Some(id) = model["id"]
                .as_str()
                .filter(|id| !id.is_empty() && id.len() <= 200)
            else {
                partial = true;
                continue;
            };
            let Some(fields) = model["pricing"].as_object() else {
                partial = true;
                continue;
            };
            let mut rates = Vec::new();
            let mut unsupported = Vec::new();
            for (key, meter, unit, condition) in KNOWN {
                if let Some(value) = fields.get(*key) {
                    if let Some(amount) = decimal(value) {
                        rates.push(Rate {
                            condition: *condition,
                            meter,
                            amount,
                            currency: "USD",
                            per_units: 1,
                            unit,
                        });
                        saw_rates = true;
                    } else {
                        unsupported.push((*key).to_owned());
                    }
                }
            }
            for key in UNIT_AMBIGUOUS {
                if fields.contains_key(*key) {
                    unsupported.push((*key).to_owned());
                }
            }
            let mut source_rules = None;
            if let Some(overrides) = fields.get("overrides") {
                let valid = overrides
                    .as_array()
                    .filter(|overrides| overrides.len() <= 64)
                    .is_some_and(|overrides| valid_override(overrides));
                if valid {
                    let overrides = overrides.as_array().cloned().unwrap_or_default();
                    for entry in &overrides {
                        if discounts.len() < 256 {
                            discounts.push(Discount {
                                model: Some(id.to_owned()),
                                kind: override_kind(entry),
                                description:
                                    "Published conditional override is preserved exactly; it is not selected for a base quote."
                                        .to_owned(),
                                source_rules: Some(entry.clone()),
                            });
                        }
                    }
                    unsupported.push("conditional_overrides_require_explicit_selection".to_owned());
                    conditional = true;
                    source_rules = Some(Value::Array(overrides));
                } else {
                    unsupported.push("invalid_pricing_override".to_owned());
                }
            }
            if id.ends_with(":batch") && discounts.len() < 256 {
                discounts.push(Discount {
                    model: Some(id.to_owned()),
                    kind: "batch_variant",
                    description:
                        "The Provider publishes this batch variant as a distinct model ID with its own advertised rates; no batch discount is applied to the base model."
                            .to_owned(),
                    source_rules: None,
                });
            }
            let known: Vec<&str> = KNOWN
                .iter()
                .map(|(key, _, _, _)| *key)
                .chain(UNIT_AMBIGUOUS.iter().copied())
                .chain(std::iter::once("overrides"))
                .collect();
            let mut seen = BTreeSet::new();
            for key in fields.keys() {
                if !known.contains(&key.as_str()) {
                    let key = key.chars().take(80).collect::<String>();
                    if seen.insert(key.clone()) {
                        unsupported.push(key);
                    }
                }
            }
            unsupported.sort();
            unsupported.dedup();
            partial |= !unsupported.is_empty() || rates.is_empty();
            prices.push(ModelPrice {
                source_rules,
                model: id.to_owned(),
                rates,
                unsupported_dimensions: unsupported,
            });
        }
        if saw_rates && !ambiguities.iter().any(|a| a.kind == "currency_basis") {
            ambiguities.push(Ambiguity {
                kind: "currency_basis",
                detail: "The model document has no currency field. USD is established by OpenRouter's documented per-unit pricing contract, not by this response.".to_owned(),
            });
        }
        if conditional && !ambiguities.iter().any(|a| a.kind == "conditional_override") {
            ambiguities.push(Ambiguity {
                kind: "conditional_override",
                detail:
                    "Volume, weekday, time-of-day and batch overrides are published conditions, not a universal base price."
                        .to_owned(),
            });
        }
        if prices.iter().any(|model| {
            model
                .unsupported_dimensions
                .iter()
                .any(|dimension| UNIT_AMBIGUOUS.contains(&dimension.as_str()))
        }) && !ambiguities.iter().any(|a| a.kind == "non_token_units")
        {
            ambiguities.push(Ambiguity {
                kind: "non_token_units",
                detail:
                    "Image, audio, web-search and internal-reasoning pricing fields are not normalized because their units are not unambiguously established by this document."
                        .to_owned(),
            });
        }
        Pricing {
            normalization_version: NORMALIZATION_VERSION,
            source_digest: None,
            source_version: None,
            conditions: vec![],
            observed_at_ms: None,
            status: if prices.is_empty() {
                "unavailable"
            } else if partial {
                "partial"
            } else {
                "available"
            },
            source,
            basis: "advertised",
            prices,
            native_ratios: vec![],
            group_multipliers: Default::default(),
            discounts,
            ambiguities,
            recovery: if conditional {
                Some(recovery::SELECT_CONDITION)
            } else if partial {
                Some(recovery::REVIEW_UNSUPPORTED)
            } else {
                None
            },
            reason: partial.then_some("some_price_dimensions_or_conditions_are_unavailable"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn fixture() -> Value {
        serde_json::from_str(include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/tests/fixtures/provider-pricing/openrouter.models.json"
        )))
        .unwrap()
    }

    #[test]
    fn documented_catalog_preserves_rates_overrides_and_batch_variants() {
        let quote = ADAPTER.pricing(&fixture());
        assert_eq!(quote.status, "partial");
        assert_eq!(quote.normalization_version, 2);
        assert_eq!(quote.prices.len(), 6);
        let standard = quote
            .prices
            .iter()
            .find(|price| price.model == "openai/gpt-6.1-terra")
            .unwrap();
        assert_eq!(standard.rates[0].amount, "0.000001");
        assert_eq!(standard.rates[0].currency, "USD");
        assert_eq!(
            standard.unsupported_dimensions,
            vec![
                "conditional_overrides_require_explicit_selection",
                "web_search"
            ]
        );
        assert!(standard.source_rules.as_ref().unwrap()[0]["min_prompt_tokens"].is_number());
        let zero = quote
            .prices
            .iter()
            .find(|price| price.model == "stealth/crouton-alpha")
            .unwrap();
        assert_eq!(zero.rates[0].amount, "0");
        assert!(
            quote
                .discounts
                .iter()
                .any(|discount| discount.kind == "batch_variant")
        );
        assert!(
            quote
                .discounts
                .iter()
                .any(|discount| discount.kind == "volume_tier")
        );
        assert!(
            quote
                .discounts
                .iter()
                .any(|discount| discount.kind == "time_window")
        );
        assert!(
            quote
                .ambiguities
                .iter()
                .any(|item| item.kind == "currency_basis")
        );
        assert_eq!(quote.recovery, Some("select_condition_explicitly"));
    }

    #[test]
    fn ambiguous_units_are_unsupported_not_guessed() {
        let quote = ADAPTER.pricing(&fixture());
        let gemini = quote
            .prices
            .iter()
            .find(|price| price.model == "google/gemini-4-argon")
            .unwrap();
        for dimension in [
            "image",
            "audio",
            "input_audio_cache",
            "internal_reasoning",
            "web_search",
        ] {
            assert!(
                gemini
                    .unsupported_dimensions
                    .iter()
                    .any(|item| item == dimension)
            );
        }
        assert!(
            gemini
                .rates
                .iter()
                .all(|rate| rate.unit == "token" || rate.unit == "request")
        );
        assert!(
            quote
                .ambiguities
                .iter()
                .any(|item| item.kind == "non_token_units")
        );
    }

    #[test]
    fn empty_and_malformed_catalogs_are_observable() {
        let empty: Value = serde_json::from_str(include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/tests/fixtures/provider-pricing/openrouter.empty.json"
        )))
        .unwrap();
        let quote = ADAPTER.pricing(&empty);
        assert_eq!(quote.status, "unavailable");
        assert_eq!(quote.reason, Some("empty_model_catalog"));
        assert_eq!(quote.recovery, Some("retry_source_read"));
        let malformed: Value = serde_json::from_str(include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/tests/fixtures/provider-pricing/openrouter.malformed.json"
        )))
        .unwrap();
        let quote = ADAPTER.pricing(&malformed);
        assert_eq!(quote.status, "unavailable");
        assert_eq!(quote.reason, Some("invalid_model_catalog"));
        assert_eq!(quote.recovery, Some("review_source_contract"));
    }

    #[test]
    fn malformed_decimal_or_model_is_never_converted_to_a_price() {
        let quote = ADAPTER.pricing(&json!({"data":[
            {"id":"maker/bad","pricing":{"prompt":"-1","completion":"0.5","future_meter":"1"}},
            {"id":"","pricing":{"prompt":"1"}}
        ]}));
        assert_eq!(quote.status, "partial");
        let bad = quote
            .prices
            .iter()
            .find(|price| price.model == "maker/bad")
            .unwrap();
        assert_eq!(bad.rates[0].meter, "output_tokens");
        assert!(bad.unsupported_dimensions.contains(&"prompt".to_owned()));
        assert!(
            bad.unsupported_dimensions
                .contains(&"future_meter".to_owned())
        );
    }
}
