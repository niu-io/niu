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
}
fn cache_rate_field<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<Option<String>>, D::Error> {
    Option::<String>::deserialize(deserializer).map(Some)
}
