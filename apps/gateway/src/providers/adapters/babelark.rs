use super::{ProviderAdapter, types::*};
use serde_json::Value;
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
        }
    }
    fn pricing(&self, document: &Value) -> Pricing {
        native_ratios(document, self.descriptor().price_source)
    }
}
pub(super) fn native_ratios(document: &Value, source: &'static str) -> Pricing {
    let Some(models) = document["data"]
        .as_array()
        .filter(|models| !models.is_empty())
    else {
        return Pricing::unavailable(source, "pricing_inventory_unavailable");
    };
    let native_ratios = models
        .iter()
        .filter_map(|model| {
            let id = model["model_name"]
                .as_str()
                .filter(|id| !id.is_empty() && id.len() <= 200)?;
            Some(NativeRatio {
                model: id.to_owned(),
                eligible_groups: model["enable_groups"]
                    .as_array()
                    .map(|groups| {
                        groups
                            .iter()
                            .filter_map(|g| {
                                g.as_str().filter(|g| g.len() <= 200).map(str::to_owned)
                            })
                            .take(100)
                            .collect()
                    })
                    .unwrap_or_default(),
                input_ratio: decimal(&model["model_ratio"]),
                output_ratio: decimal(&model["completion_ratio"]),
                cached_input_ratio: decimal(&model["cache_ratio"]),
                request_price: decimal(&model["model_price"]),
                quota_type: model["quota_type"].as_u64(),
            })
        })
        .collect();
    Pricing {
        normalization_version: 1,
        source_digest: None,
        conditions: vec![],
        observed_at_ms: None,
        status: "partial",
        source,
        basis: "native_ratios_not_money",
        prices: vec![],
        native_ratios,
        group_multipliers: document["group_ratio"]
            .as_object()
            .map(|groups| {
                groups
                    .iter()
                    .filter_map(|(group, ratio)| {
                        decimal(ratio)
                            .filter(|_| group.len() <= 200)
                            .map(|value| (group.clone(), value))
                    })
                    .take(100)
                    .collect()
            })
            .unwrap_or_default(),
        reason: Some("currency_unit_and_effective_group_require_qualification"),
    }
}
