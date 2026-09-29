//! Public, descriptive model metadata. Advertised prices never configure billing.
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(default, deny_unknown_fields)]
pub struct CatalogMetadata {
    pub name: Option<String>,
    pub description: Option<String>,
    pub context_length: Option<u64>,
    pub max_completion_tokens: Option<u64>,
    pub input_modalities: Vec<String>,
    pub output_modalities: Vec<String>,
    /// Provider-advertised USD per token, preserved separately from settlement rates.
    pub input_price: Option<String>,
    pub output_price: Option<String>,
}

impl CatalogMetadata {
    pub fn valid(&self) -> bool {
        self.name.as_ref().is_none_or(|s| s.len() <= 300)
            && self.description.as_ref().is_none_or(|s| s.len() <= 12000)
            && self.context_length.is_none_or(|v| v > 0)
            && self.max_completion_tokens.is_none_or(|v| v > 0)
            && [&self.input_modalities, &self.output_modalities]
                .iter()
                .all(|items| {
                    items.len() <= 16 && items.iter().all(|s| !s.is_empty() && s.len() <= 40)
                })
            && [&self.input_price, &self.output_price].iter().all(|price| {
                price.as_ref().is_none_or(|s| {
                    s.len() <= 64 && s.parse::<f64>().is_ok_and(|v| v.is_finite() && v >= 0.0)
                })
            })
    }

    pub fn from_provider(model: &Value) -> Self {
        fn text(value: &Value, max: usize) -> Option<String> {
            value
                .as_str()
                .filter(|s| !s.is_empty() && s.len() <= max)
                .map(str::to_owned)
        }
        fn modalities(value: &Value) -> Vec<String> {
            value
                .as_array()
                .into_iter()
                .flatten()
                .take(16)
                .filter_map(|v| text(v, 40))
                .collect()
        }
        fn price(value: &Value) -> Option<String> {
            let raw = value
                .as_str()
                .map(str::to_owned)
                .or_else(|| value.as_f64().map(|v| v.to_string()))?;
            let number = raw.parse::<f64>().ok()?;
            (raw.len() <= 64 && number.is_finite() && number >= 0.0).then_some(raw)
        }
        Self {
            name: text(&model["name"], 300),
            description: text(&model["description"], 12000),
            context_length: model["context_length"].as_u64().filter(|n| *n > 0),
            max_completion_tokens: model["top_provider"]["max_completion_tokens"]
                .as_u64()
                .filter(|n| *n > 0),
            input_modalities: modalities(&model["architecture"]["input_modalities"]),
            output_modalities: modalities(&model["architecture"]["output_modalities"]),
            input_price: price(&model["pricing"]["prompt"]),
            output_price: price(&model["pricing"]["completion"]),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn preserves_zero_prices_and_real_metadata_without_guessing_missing_fields() {
        let metadata = CatalogMetadata::from_provider(
            &json!({"name":"Example", "description":"A model", "context_length":128000,"architecture":{"input_modalities":["text","image"],"output_modalities":["text"]},"pricing":{"prompt":"0","completion":"0.000002"}}),
        );
        assert_eq!(metadata.input_price.as_deref(), Some("0"));
        assert_eq!(metadata.output_price.as_deref(), Some("0.000002"));
        assert_eq!(metadata.input_modalities, ["text", "image"]);
        assert_eq!(metadata.max_completion_tokens, None);
        let invalid = CatalogMetadata::from_provider(
            &json!({"pricing":{"prompt":"NaN","completion":"-1"},"context_length":-1}),
        );
        assert!(
            invalid.input_price.is_none()
                && invalid.output_price.is_none()
                && invalid.context_length.is_none()
        );
    }
}
