//! Provider evidence is neither a customer tariff nor proof of a final upstream charge.
use serde::Serialize;
use serde_json::Value;

#[derive(Clone, Copy, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum PriceSupport {
    ModelCatalog,
    OfficialMarkdown,
    OfficialPageJson,
    NativeRatios,
    RequiresQualification,
    #[serde(rename = "official_catalog_unqualified")]
    OfficialCatalog,
}
#[derive(Serialize)]
pub struct Descriptor {
    pub id: &'static str,
    pub name: &'static str,
    pub protocol: &'static str,
    pub api_base: &'static str,
    pub website: &'static str,
    pub price_support: PriceSupport,
    pub price_source: &'static str,
}
#[derive(Serialize)]
pub struct Rate {
    pub condition: Option<&'static str>,
    pub meter: &'static str,
    pub amount: String,
    pub currency: &'static str,
    pub per_units: u64,
    pub unit: &'static str,
}
#[derive(Serialize)]
pub struct ModelPrice {
    pub source_rules: Option<Value>,
    pub model: String,
    pub rates: Vec<Rate>,
    pub unsupported_dimensions: Vec<String>,
}
#[derive(Serialize)]
pub struct NativeRatio {
    pub model: String,
    pub eligible_groups: Vec<String>,
    pub input_ratio: Option<String>,
    pub output_ratio: Option<String>,
    pub cached_input_ratio: Option<String>,
    pub request_price: Option<String>,
    pub quota_type: Option<u64>,
}
#[derive(Serialize)]
pub struct PriceCondition {
    pub id: &'static str,
    pub description: String,
}
#[derive(Serialize)]
pub struct Pricing {
    pub normalization_version: u32,
    pub source_digest: Option<String>,
    pub conditions: Vec<PriceCondition>,
    pub observed_at_ms: Option<u64>,
    /// available/partial/unavailable; absence is never an implicit zero price.
    pub status: &'static str,
    pub source: &'static str,
    pub basis: &'static str,
    pub prices: Vec<ModelPrice>,
    pub native_ratios: Vec<NativeRatio>,
    pub group_multipliers: std::collections::BTreeMap<String, String>,
    pub reason: Option<&'static str>,
}
impl Pricing {
    pub fn unavailable(source: &'static str, reason: &'static str) -> Self {
        Self {
            normalization_version: 1,
            source_digest: None,
            conditions: vec![],
            observed_at_ms: None,
            status: "unavailable",
            source,
            basis: "advertised",
            prices: vec![],
            native_ratios: vec![],
            group_multipliers: Default::default(),
            reason: Some(reason),
        }
    }
}

/// Preserve decimal evidence exactly; unsupported encodings remain unknown.
/// Monetary arithmetic belongs to the versioned quote/estimate layer.
pub fn decimal(value: &Value) -> Option<String> {
    let raw = match value {
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        _ => return None,
    };
    if raw.len() > 64
        || raw.is_empty()
        || raw.chars().filter(|c| *c == '.').count() > 1
        || !raw.chars().all(|c| c.is_ascii_digit() || c == '.')
        || !raw.chars().any(|c| c.is_ascii_digit())
        || raw.starts_with('.')
        || raw.ends_with('.')
    {
        return None;
    }
    Some(raw)
}

pub fn now_ms() -> Option<u64> {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .ok()
        .and_then(|duration| u64::try_from(duration.as_millis()).ok())
}
