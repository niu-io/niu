//! Shared wire format for immutable text rates; authorization and ledgers remain separate.
use serde::Deserialize;
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TokenRateInput {
    pub model_alias: String,
    pub currency: String,
    pub prompt_rate: String,
    pub completion_rate: String,
    pub expected_revision: Option<Uuid>,
    #[serde(default, deserialize_with = "cache_rate_field")]
    pub cached_prompt_rate: Option<Option<String>>,
    #[serde(default, deserialize_with = "cache_rate_field")]
    pub reasoning_completion_rate: Option<Option<String>>,
    #[serde(default, deserialize_with = "cache_rate_field")]
    pub cache_write_prompt_rate: Option<Option<String>>,
}
fn cache_rate_field<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<Option<String>>, D::Error> {
    Option::<String>::deserialize(deserializer).map(Some)
}

/// Customer-only extensions must not be accepted by Supplier rate publication.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CustomerTariffInput {
    pub model_alias: String,
    pub currency: String,
    pub prompt_rate: String,
    pub completion_rate: String,
    pub expected_revision: Option<Uuid>,
    #[serde(default, deserialize_with = "cache_rate_field")]
    pub cached_prompt_rate: Option<Option<String>>,
    #[serde(default, deserialize_with = "cache_rate_field")]
    pub reasoning_completion_rate: Option<Option<String>>,
    #[serde(default, deserialize_with = "cache_rate_field")]
    pub cache_write_prompt_rate: Option<Option<String>>,
    #[serde(default, deserialize_with = "minimum_field")]
    pub minimum_charge_nanos: Option<String>,
    #[serde(default, deserialize_with = "minimum_field")]
    pub request_fee_nanos: Option<String>,
}

fn minimum_field<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<String>, D::Error> {
    String::deserialize(deserializer).map(Some)
}
