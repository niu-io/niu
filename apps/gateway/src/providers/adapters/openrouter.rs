use super::{ProviderAdapter, types::*};
use crate::catalog_metadata::CatalogMetadata;
use serde_json::Value;
pub struct OpenRouter;
pub static ADAPTER: OpenRouter = OpenRouter;
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
        }
    }
    fn metadata(&self, model: &Value) -> CatalogMetadata {
        CatalogMetadata::from_provider(model)
    }
    fn pricing(&self, document: &Value) -> Pricing {
        let Some(models) = document["data"].as_array() else {
            return Pricing::unavailable(self.descriptor().price_source, "invalid_model_catalog");
        };
        let known = [
            ("prompt", "input_tokens", "token"),
            ("completion", "output_tokens", "token"),
            ("input_cache_read", "cached_input_tokens", "token"),
            ("input_cache_write", "cache_write_tokens", "token"),
            ("request", "requests", "request"),
        ];
        let mut prices = Vec::new();
        let mut partial = false;
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
            for (key, meter, unit) in known {
                if let Some(value) = fields.get(key) {
                    if let Some(amount) = decimal(value) {
                        rates.push(Rate {
                            condition: None,
                            meter,
                            amount,
                            currency: "USD",
                            per_units: 1,
                            unit,
                        });
                    } else {
                        unsupported.push(key.to_owned());
                    }
                }
            }
            unsupported.extend(
                fields
                    .keys()
                    .filter(|key| !known.iter().any(|(name, _, _)| name == key))
                    .take(64)
                    .map(|key| key.chars().take(80).collect()),
            );
            partial |= !unsupported.is_empty() || rates.is_empty();
            prices.push(ModelPrice {
                source_rules: None,
                model: id.to_owned(),
                rates,
                unsupported_dimensions: unsupported,
            });
        }
        Pricing {
            normalization_version: 1,
            source_digest: None,
            conditions: vec![],
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
            reason: partial.then_some("some_price_dimensions_are_unavailable"),
        }
    }
}
