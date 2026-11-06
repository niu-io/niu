//! Provider evidence is neither a customer tariff nor proof of a final upstream charge.
use serde::Serialize;
use serde_json::Value;

/// Bumped whenever normalized evidence meaning changes. Captured versions keep
/// the value they were written with.
pub const NORMALIZATION_VERSION: u32 = 2;

pub const ADAPTER_VERSION: &str = "2026-11-06.1";

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
    /// Version of this adapter's parsing/capability contract, not the source feed.
    pub adapter_version: &'static str,
    /// Capabilities the adapter can observe, never an entitlement of a saved connection.
    pub capabilities: &'static [&'static str],
    /// Currency explicitly established by the source contract, or null when unknown.
    pub price_currency: Option<&'static str>,
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
    /// Published volume tiers keep their native thresholds and ratios.
    pub tiered_ratios: Option<Value>,
}
#[derive(Serialize)]
pub struct PriceCondition {
    pub id: &'static str,
    pub description: String,
}
/// A published discount, multiplier or variant. Evidence only: nothing here is
/// selected or applied to a base rate automatically.
#[derive(Serialize)]
pub struct Discount {
    pub model: Option<String>,
    pub kind: &'static str,
    pub description: String,
    pub source_rules: Option<Value>,
}
/// An unresolved currency, unit, effective-group or coverage question.
#[derive(Serialize)]
pub struct Ambiguity {
    pub kind: &'static str,
    pub detail: String,
}
/// Supported next action after a partial/unavailable result. Codes are stable
/// for clients; they never assert that the gap has been repaired.
pub mod recovery {
    pub const RETRY_SOURCE_READ: &str = "retry_source_read";
    pub const QUALIFY_AUTHENTICATED_FEED: &str = "qualify_authenticated_price_feed";
    pub const QUALIFY_MONETARY_BASIS: &str = "qualify_monetary_basis";
    pub const PRESERVE_NATIVE_RULES: &str = "preserve_native_rules";
    pub const SELECT_CONDITION: &str = "select_condition_explicitly";
    pub const REVIEW_UNSUPPORTED: &str = "review_unsupported_dimensions";
    pub const REVIEW_SOURCE_CONTRACT: &str = "review_source_contract";
}
#[derive(Serialize)]
pub struct Pricing {
    pub normalization_version: u32,
    pub source_digest: Option<String>,
    /// Provider-published feed version when the document carries one.
    pub source_version: Option<String>,
    pub conditions: Vec<PriceCondition>,
    pub observed_at_ms: Option<u64>,
    /// available/partial/unavailable; absence is never an implicit zero price.
    pub status: &'static str,
    pub source: &'static str,
    pub basis: &'static str,
    pub prices: Vec<ModelPrice>,
    pub native_ratios: Vec<NativeRatio>,
    pub group_multipliers: std::collections::BTreeMap<String, String>,
    pub discounts: Vec<Discount>,
    pub ambiguities: Vec<Ambiguity>,
    pub recovery: Option<&'static str>,
    pub reason: Option<&'static str>,
}
impl Pricing {
    pub fn unavailable(source: &'static str, reason: &'static str) -> Self {
        Self {
            normalization_version: NORMALIZATION_VERSION,
            source_digest: None,
            source_version: None,
            conditions: vec![],
            observed_at_ms: None,
            status: "unavailable",
            source,
            basis: "advertised",
            prices: vec![],
            native_ratios: vec![],
            group_multipliers: Default::default(),
            discounts: vec![],
            ambiguities: vec![],
            recovery: None,
            reason: Some(reason),
        }
    }
    pub fn unavailable_with_recovery(
        source: &'static str,
        reason: &'static str,
        recovery: &'static str,
    ) -> Self {
        let mut pricing = Self::unavailable(source, reason);
        pricing.recovery = Some(recovery);
        pricing
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
    if raw.contains(['e', 'E']) {
        scientific_decimal(&raw)
    } else {
        plain_decimal(&raw)
    }
}

fn plain_decimal(raw: &str) -> Option<String> {
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
    Some(raw.to_owned())
}

/// Official JSON sometimes encodes a plain price as `4e-05`. Convert that exact
/// value to a plain decimal string; never round through floating point.
fn scientific_decimal(raw: &str) -> Option<String> {
    let mut parts = raw.split(['e', 'E']);
    let mantissa = parts.next()?;
    let exponent = parts.next()?;
    if parts.next().is_some() {
        return None;
    }
    let mantissa = plain_decimal(mantissa)?;
    let exponent: i32 = exponent.parse().ok()?;
    if !(-100..=100).contains(&exponent) {
        return None;
    }
    let scale = mantissa.split('.').nth(1).map_or(0, str::len) as i32;
    let digits: String = mantissa.chars().filter(|c| *c != '.').collect();
    let target = scale - exponent;
    let mut output = if target <= 0 {
        format!("{}{}", digits, "0".repeat(usize::try_from(-target).ok()?))
    } else {
        let target = usize::try_from(target).ok()?;
        if digits.len() <= target {
            format!("0.{}{}", "0".repeat(target - digits.len()), digits)
        } else {
            let split = digits.len() - target;
            format!("{}.{}", &digits[..split], &digits[split..])
        }
    };
    if let Some((integer, fraction)) = output.split_once('.') {
        let integer = integer.trim_start_matches('0');
        let integer = if integer.is_empty() { "0" } else { integer };
        let fraction = fraction.trim_end_matches('0');
        output = if fraction.is_empty() {
            integer.to_owned()
        } else {
            format!("{integer}.{fraction}")
        };
    }
    (output.len() <= 64).then_some(output)
}

pub fn now_ms() -> Option<u64> {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .ok()
        .and_then(|duration| u64::try_from(duration.as_millis()).ok())
}
