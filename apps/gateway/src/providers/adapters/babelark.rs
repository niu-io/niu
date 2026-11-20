use super::{ProviderAdapter, types::*};
use serde_json::{Value, json};

pub struct BabelArk;
pub static ADAPTER: BabelArk = BabelArk;

impl ProviderAdapter for BabelArk {
    fn descriptor(&self) -> Descriptor {
        Descriptor {
            id: "babelark",
            name: "BabelArk",
            protocol: "openai",
            api_base: "https://api.babelark.ai/v1",
            website: "https://api.babelark.ai",
            price_support: PriceSupport::NativeRatios,
            price_source: "https://api.babelark.ai/api/pricing",
            adapter_version: ADAPTER_VERSION,
            capabilities: &[
                "native_ratios",
                "group_multipliers",
                "group_eligibility",
                "volume_tiers",
                "per_request_price",
            ],
            price_currency: None,
        }
    }
    fn pricing(&self, document: &Value) -> Pricing {
        native_ratios(document, self.descriptor().price_source)
    }
}

pub(super) fn native_ratios(document: &Value, source: &'static str) -> Pricing {
    if document["success"].as_bool() == Some(false) {
        return Pricing::unavailable_with_recovery(
            source,
            "source_reported_failure",
            recovery::RETRY_SOURCE_READ,
        );
    }
    let Some(models) = document["data"].as_array() else {
        return Pricing::unavailable_with_recovery(
            source,
            "invalid_pricing_document",
            recovery::REVIEW_SOURCE_CONTRACT,
        );
    };
    if models.is_empty() {
        return Pricing::unavailable_with_recovery(
            source,
            "pricing_inventory_unavailable",
            recovery::RETRY_SOURCE_READ,
        );
    }
    let mut native_ratios = Vec::new();
    let mut discounts = Vec::new();
    let mut ambiguities: Vec<Ambiguity> = Vec::new();
    let mut has_tiers = false;
    let mut has_request_price = false;
    for model in models.iter().take(5000) {
        let Some(id) = model["model_name"]
            .as_str()
            .filter(|id| !id.is_empty() && id.len() <= 200)
        else {
            continue;
        };
        let eligible_groups = model["enable_groups"]
            .as_array()
            .map(|groups| {
                groups
                    .iter()
                    .filter_map(|g| g.as_str().filter(|g| g.len() <= 200).map(str::to_owned))
                    .take(100)
                    .collect()
            })
            .unwrap_or_default();
        let tiered_ratios = model.get("tiered_ratios").and_then(|tiers| {
            let tiers = tiers.as_array()?;
            if tiers.is_empty() || tiers.len() > 32 {
                return None;
            }
            let valid = tiers.iter().all(|tier| {
                tier.as_object().is_some_and(|fields| {
                    !fields.is_empty()
                        && fields.get("threshold").is_none_or(|value| {
                            value
                                .as_u64()
                                .is_some_and(|threshold| threshold <= 100_000_000)
                        })
                        && fields
                            .get("input_ratio")
                            .is_none_or(|value| decimal(value).is_some())
                        && fields
                            .get("output_ratio")
                            .is_none_or(|value| decimal(value).is_some())
                })
            });
            if !valid {
                return None;
            }
            has_tiers = true;
            for tier in tiers {
                if discounts.len() < 256 {
                    discounts.push(Discount {
                        model: Some(id.to_owned()),
                        kind: "volume_tier",
                        description:
                            "Published prompt-token volume tier; the tier is preserved but never selected automatically."
                                .to_owned(),
                        source_rules: Some(tier.clone()),
                    });
                }
            }
            Some(Value::Array(tiers.clone()))
        });
        let request_price = decimal(&model["model_price"]);
        if request_price.is_some() {
            has_request_price = true;
        }
        native_ratios.push(NativeRatio {
            model: id.to_owned(),
            eligible_groups,
            input_ratio: decimal(&model["model_ratio"]),
            output_ratio: decimal(&model["completion_ratio"]),
            cached_input_ratio: decimal(&model["cache_ratio"]),
            request_price,
            quota_type: model["quota_type"].as_u64(),
            tiered_ratios,
        });
    }
    let mut group_multipliers = std::collections::BTreeMap::new();
    if let Some(groups) = document["group_ratio"].as_object() {
        for (group, ratio) in groups.iter().take(100) {
            let Some(ratio) = decimal(ratio) else {
                ambiguities.push(Ambiguity {
                    kind: "invalid_group_multiplier",
                    detail: format!("Published group multiplier for '{group}' is not an exact decimal and was ignored."),
                });
                continue;
            };
            if group.is_empty() || group.len() > 200 {
                continue;
            }
            group_multipliers.insert(group.clone(), ratio.clone());
            if discounts.len() < 256 {
                discounts.push(Discount {
                    model: None,
                    kind: "group_multiplier",
                    description: format!(
                        "Published group multiplier for group '{group}'; the effective group of a saved inference key is not established."
                    ),
                    source_rules: Some(json!({"group":group,"multiplier":ratio})),
                });
            }
        }
    } else if !document["group_ratio"].is_null() {
        ambiguities.push(Ambiguity {
            kind: "group_multiplier_invalid",
            detail: "The published group_ratio field changed shape and was not normalized."
                .to_owned(),
        });
    }
    if !native_ratios.is_empty() {
        ambiguities.push(Ambiguity {
            kind: "native_ratio_unit",
            detail: "Ratios are Provider quota units without a verified currency or published per-token conversion; they are not money.".to_owned(),
        });
    }
    if !group_multipliers.is_empty() {
        ambiguities.push(Ambiguity {
            kind: "effective_group",
            detail: "Group eligibility and multipliers are published, but a saved inference key's effective group is unverified.".to_owned(),
        });
    }
    if has_tiers {
        ambiguities.push(Ambiguity {
            kind: "volume_tier",
            detail: "Volume tiers change the native ratio above the published threshold; no tier is selected automatically.".to_owned(),
        });
    }
    if has_request_price {
        ambiguities.push(Ambiguity {
            kind: "per_request_unit",
            detail: "A per-request native price is preserved separately from token ratios and its currency is not established by this feed.".to_owned(),
        });
    }
    Pricing {
        normalization_version: NORMALIZATION_VERSION,
        source_digest: None,
        source_version: None,
        conditions: vec![],
        observed_at_ms: None,
        status: if native_ratios.is_empty() {
            "unavailable"
        } else {
            "partial"
        },
        source,
        basis: "native_ratios_not_money",
        prices: vec![],
        native_ratios,
        group_multipliers,
        discounts,
        ambiguities,
        recovery: Some(recovery::QUALIFY_MONETARY_BASIS),
        reason: Some("currency_unit_and_effective_group_require_qualification"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> Value {
        serde_json::from_str(include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/tests/fixtures/provider-pricing/babelark.pricing.json"
        )))
        .unwrap()
    }

    #[test]
    fn native_ratios_groups_and_tiers_are_preserved_without_money() {
        let quote = ADAPTER.pricing(&fixture());
        assert_eq!(quote.status, "partial");
        assert_eq!(quote.basis, "native_ratios_not_money");
        assert_eq!(quote.normalization_version, 2);
        assert!(quote.prices.is_empty());
        assert_eq!(quote.native_ratios.len(), 5);
        assert_eq!(
            quote.group_multipliers.get("svip").map(String::as_str),
            Some("0.8")
        );
        assert!(
            quote
                .discounts
                .iter()
                .any(|item| item.kind == "group_multiplier")
        );
        assert!(
            quote
                .discounts
                .iter()
                .any(|item| item.kind == "volume_tier")
        );
        let tiers = quote
            .native_ratios
            .iter()
            .find(|item| item.model == "gpt-5.5")
            .unwrap()
            .tiered_ratios
            .as_ref()
            .unwrap();
        assert_eq!(tiers[1]["threshold"], 272000);
        let per_request = quote
            .native_ratios
            .iter()
            .find(|item| item.model == "wan2.7-i2v")
            .unwrap();
        assert_eq!(per_request.request_price.as_deref(), Some("0.08572"));
        assert_eq!(per_request.quota_type, Some(1));
        assert!(
            quote
                .ambiguities
                .iter()
                .any(|item| item.kind == "native_ratio_unit")
        );
        assert_eq!(quote.recovery, Some("qualify_monetary_basis"));
    }

    #[test]
    fn empty_and_changed_inventory_is_explicit() {
        let empty: Value = serde_json::from_str(include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/tests/fixtures/provider-pricing/babelark.empty.json"
        )))
        .unwrap();
        let quote = ADAPTER.pricing(&empty);
        assert_eq!(quote.status, "unavailable");
        assert_eq!(quote.reason, Some("pricing_inventory_unavailable"));
        let malformed: Value = serde_json::from_str(include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/tests/fixtures/provider-pricing/babelark.malformed.json"
        )))
        .unwrap();
        assert_eq!(
            ADAPTER.pricing(&malformed).reason,
            Some("invalid_pricing_document")
        );
        assert_eq!(
            ADAPTER
                .pricing(&serde_json::json!({"success":false}))
                .reason,
            Some("source_reported_failure")
        );
    }

    #[test]
    fn invalid_ratios_do_not_become_zero_or_money() {
        let quote = ADAPTER.pricing(&serde_json::json!({"data":[
            {"model_name":"m","model_ratio":"-1","completion_ratio":"x","model_price":"-0.001"},
            {"model_name":"","model_ratio":1}
        ]}));
        assert_eq!(quote.native_ratios.len(), 1);
        assert_eq!(quote.native_ratios[0].input_ratio, None);
        assert_eq!(quote.native_ratios[0].output_ratio, None);
        assert_eq!(quote.native_ratios[0].request_price, None);
    }
}
