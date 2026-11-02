use super::{ProviderAdapter, types::*};
use serde_json::Value;
pub struct DeepSeek;
pub static ADAPTER: DeepSeek = DeepSeek;
impl ProviderAdapter for DeepSeek {
    fn descriptor(&self) -> Descriptor {
        Descriptor {
            id: "deepseek",
            name: "DeepSeek",
            protocol: "openai",
            api_base: "https://api.deepseek.com",
            website: "https://platform.deepseek.com/api_keys",
            price_support: PriceSupport::OfficialMarkdown,
            price_source: "https://api-docs.deepseek.com/quick_start/pricing.md",
        }
    }
    fn pricing(&self, document: &Value) -> Pricing {
        self.parse(document).unwrap_or_else(|| {
            Pricing::unavailable(
                self.descriptor().price_source,
                "official_price_schema_changed",
            )
        })
    }
}
impl DeepSeek {
    /// Fail closed on changed units, conditions, columns, missing/duplicate rows or non-USD amounts.
    /// No rates or calendar dates are hardcoded; the official machine-readable page is the source.
    fn parse(&self, document: &Value) -> Option<Pricing> {
        let text = document.as_str()?;
        if !text.contains("per 1M tokens") {
            return None;
        }
        let rule = text.lines().find(|line| {
            line.contains("Peak hours are")
                && line.contains("UTC")
                && line.contains("Chinese public holidays")
        })?;
        if rule.len() > 2000 {
            return None;
        }
        let rows: Vec<Vec<&str>> = text
            .lines()
            .filter(|line| line.starts_with('|'))
            .map(|line| {
                line.trim()
                    .trim_matches('|')
                    .split('|')
                    .map(str::trim)
                    .collect()
            })
            .collect();
        let headers: Vec<_> = rows
            .iter()
            .filter(|row| row.first() == Some(&"MODEL"))
            .collect();
        if headers.len() != 1 || headers[0].len() != 5 {
            return None;
        }
        let mut prices = Vec::new();
        for label in &headers[0][3..] {
            let id = label.split('(').next()?.trim();
            if !id.starts_with("deepseek-")
                || id.len() > 200
                || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
                || prices.iter().any(|p: &ModelPrice| p.model == id)
            {
                return None;
            }
            prices.push(ModelPrice {
                source_rules: None,
                model: id.to_owned(),
                rates: vec![],
                unsupported_dimensions: vec!["server_side_search_and_fetch_not_included".into()],
            });
        }
        let mut seen = std::collections::BTreeSet::new();
        for row in rows
            .iter()
            .filter(|row| row.first().is_some_and(|v| v.starts_with("PRICING")))
        {
            if row.len() != 5 {
                return None;
            }
            let meter = match row[1] {
                "1M INPUT TOKENS / (CACHE HIT)" => "cached_input_tokens",
                "1M INPUT TOKENS / (CACHE MISS)" => "input_tokens",
                "1M OUTPUT TOKENS" => "output_tokens",
                _ => return None,
            };
            let condition = match row[2] {
                "OFF-PEAK" => "off_peak",
                "PEAK" => "peak",
                _ => return None,
            };
            if !seen.insert((meter, condition)) {
                return None;
            }
            for (price, raw) in prices.iter_mut().zip(&row[3..]) {
                price.rates.push(Rate {
                    meter,
                    condition: Some(condition),
                    amount: decimal(&Value::String(raw.strip_prefix('$')?.to_owned()))?,
                    currency: "USD",
                    per_units: 1_000_000,
                    unit: "token",
                });
            }
        }
        if seen.len() != 6 {
            return None;
        }
        Some(Pricing {
            normalization_version: 1,
            source_digest: None,
            observed_at_ms: None,
            status: "partial",
            source: self.descriptor().price_source,
            basis: "advertised",
            prices,
            native_ratios: vec![],
            group_multipliers: Default::default(),
            conditions: vec![
                PriceCondition {
                    id: "peak",
                    description: rule.to_owned(),
                },
                PriceCondition {
                    id: "off_peak",
                    description: rule.to_owned(),
                },
            ],
            reason: Some("explicit_time_condition_required_search_and_fetch_excluded"),
        })
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::adapters::{Quantity, estimate};
    fn document() -> String {
        let mut text="per 1M tokens\nPeak hours are source-defined UTC hours, excluding Chinese public holidays.\n| MODEL | MODEL | MODEL | deepseek-example(1) | deepseek-test |\n".to_owned();
        for meter in [
            "1M INPUT TOKENS / (CACHE HIT)",
            "1M INPUT TOKENS / (CACHE MISS)",
            "1M OUTPUT TOKENS",
        ] {
            for condition in ["OFF-PEAK", "PEAK"] {
                text += &format!("| PRICING(2) | {meter} | {condition} | $0.1 | $0.2 |\n");
            }
        }
        text
    }
    #[test]
    fn official_markdown_keeps_time_conditions_and_fails_closed_on_drift() {
        let raw = document();
        let quote = ADAPTER.pricing(&Value::String(raw.clone()));
        assert_eq!(quote.prices.len(), 2);
        assert_eq!(quote.prices[0].rates.len(), 6);
        assert_eq!(quote.prices[0].rates[0].per_units, 1_000_000);
        let evidence = serde_json::to_value(quote).unwrap();
        let unknown = estimate(
            &evidence,
            "deepseek-example",
            &[Quantity {
                meter: "input_tokens".into(),
                units: "1000000".into(),
                condition: None,
            }],
        )
        .unwrap();
        assert_eq!(unknown["totals"], serde_json::json!([]));
        let selected = estimate(
            &evidence,
            "deepseek-example",
            &[Quantity {
                meter: "input_tokens".into(),
                units: "1000000".into(),
                condition: Some("peak".into()),
            }],
        )
        .unwrap();
        assert_eq!(selected["totals"][0]["amount"], "0.1");
        assert_eq!(selected["status"], "partial");
        for changed in [
            raw.replace("1M OUTPUT TOKENS", "1K OUTPUT TOKENS"),
            raw.replace("$0.1", "€0.1"),
            raw.replace("PEAK", "BUSY"),
            raw.replace("Chinese public holidays", "unknown holidays"),
        ] {
            assert_eq!(
                ADAPTER.pricing(&Value::String(changed)).status,
                "unavailable"
            );
        }
    }
}
