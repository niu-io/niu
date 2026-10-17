//! Platform-only, advisory price comparisons. Never used to authorize dispatch.
use crate::{Store, StoreError};
use serde_json::{Value, json};
use std::collections::BTreeSet;

impl Store {
    /// Call only after platform authorization. Do not attach this projection to
    /// customer billing, catalog, history or inference responses.
    pub async fn annotate_platform_pricing(&self, rows: &mut [Value]) -> Result<(), StoreError> {
        let aliases: Vec<&str> = rows
            .iter()
            .filter_map(|r| r["model_alias"].as_str())
            .collect();
        let costs: Vec<Value> = sqlx::query_scalar(include_str!("pricing_health.sql"))
            .bind(&aliases)
            .fetch_all(&self.pool)
            .await?;
        for row in rows {
            let schedule = row.get("schedule").unwrap_or(row).clone();
            let matching: Vec<&Value> = costs
                .iter()
                .filter(|c| c["model_alias"] == row["model_alias"])
                .collect();
            let mut checks = Vec::new();
            for cost in matching {
                checks.push(compare(
                    &schedule,
                    row["currency"].as_str().unwrap_or(""),
                    cost,
                ));
            }
            if checks.is_empty() {
                checks.push(json!({"status":"comparison_unavailable","message":"No managed Provider price is available for comparison.","dimensions":[]}));
            }
            row["pricing_health"] = json!({"checks":checks,"advisory":true});
        }
        Ok(())
    }
}

fn rate(value: &Value, field: &str, fallback: &str) -> Option<i128> {
    let value = if value[field].is_null() {
        &value[fallback]
    } else {
        &value[field]
    };
    value.as_str()?.parse::<i128>().ok().filter(|n| *n >= 0)
}
fn threshold(tier: &Value) -> Option<i64> {
    tier["minimum_input_tokens"].as_str()?.parse().ok()
}
fn at(schedule: &Value, input: i64) -> &Value {
    schedule["context_tiers"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|t| threshold(t).is_some_and(|n| n <= input))
        .max_by_key(|t| threshold(t))
        .unwrap_or(schedule)
}
fn compare(sell: &Value, currency: &str, cost: &Value) -> Value {
    let mut result = json!({"route":cost["route"],"provider":cost["provider"],"status":"comparison_unavailable","dimensions":[]});
    if cost["configured"] != true {
        result["message"] =
            json!("No managed Provider price is available for this route comparison.");
        return result;
    }
    if cost["schedule"].is_null() {
        result["status"] = json!("missing_provider_price");
        result["message"] = json!("Configure a Provider price before dispatch.");
        return result;
    }
    if cost["currency"].as_str() != Some(currency) {
        result["message"] = json!("Currencies differ; no exchange rate is assumed.");
        return result;
    }
    if sell["kind"] == "media" || cost["rate_kind"] == "media" {
        return compare_media(sell, currency, cost, result);
    }
    let buy = &cost["schedule"];
    let mut boundaries = BTreeSet::from([0]);
    for schedule in [sell, buy] {
        for tier in schedule["context_tiers"].as_array().into_iter().flatten() {
            let Some(n) = threshold(tier) else {
                return result;
            };
            boundaries.insert(n);
        }
    }
    let mut dimensions = Vec::new();
    for input in boundaries {
        let selling = at(sell, input);
        let purchase = at(buy, input);
        for (field, fallback, label) in [
            ("prompt_rate", "prompt_rate", "Input"),
            ("completion_rate", "completion_rate", "Output"),
            ("cached_prompt_rate", "prompt_rate", "Cache read"),
            ("cache_write_prompt_rate", "prompt_rate", "Cache write"),
            (
                "reasoning_completion_rate",
                "completion_rate",
                "Reasoning output",
            ),
        ] {
            let (Some(s), Some(c)) = (
                rate(selling, field, fallback),
                rate(purchase, field, fallback),
            ) else {
                result["message"] = json!("A required price dimension is missing.");
                return result;
            };
            if s < c {
                dimensions
                    .push(json!({"dimension":label,"minimum_input_tokens":input.to_string()}));
            }
        }
    }
    result["status"] = json!(if dimensions.is_empty() {
        "no_lower_unit_rates"
    } else {
        "below_cost"
    });
    result["dimensions"] = json!(dimensions);
    result["message"] = json!(
        "Unit-rate comparison only. Fixed fees, minimum charges, usage mix and promotions affect the final request margin. Supply eligibility is checked separately."
    );
    result
}

fn compare_media(sell: &Value, currency: &str, cost: &Value, mut result: Value) -> Value {
    let cards: Vec<&Value> = cost["media_cards"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|card| {
            let tariff = &card["tariff"];
            tariff["dimensions"]["channel"] == sell["dimensions"]["channel"]
                && tariff["dimensions"]["resolution"] == sell["dimensions"]["resolution"]
                && tariff["dimensions"]["reference_video"] == sell["dimensions"]["reference_video"]
                && tariff["meter"] == sell["meter"]
        })
        .collect();
    if cards.len() != 1 {
        result["message"] =
            json!("No unique effective Provider media rate matches these billing dimensions.");
        return result;
    }
    let card = cards[0];
    let buy = &card["tariff"];
    if buy["currency"].as_str() != Some(currency)
        || card["discounts"].as_array().is_none_or(|v| !v.is_empty())
        || sell["minimum_quantity"] != buy["minimum_quantity"]
        || sell["rounding"] != buy["rounding"]
    {
        result["message"] = json!(
            "Currency, Provider discounts, minimum quantity or rounding require a request-specific comparison."
        );
        return result;
    }
    let ratio = |value: &Value| -> Option<(u128, u128)> {
        let integer = |v: &Value| {
            v.as_str()
                .and_then(|v| v.parse::<u128>().ok())
                .or_else(|| v.as_u64().map(u128::from))
        };
        let amount = integer(&value["amount_units"])?;
        let numerator = integer(&value["per_quantity"]["numerator"])?;
        let denominator = integer(&value["per_quantity"]["denominator"])?;
        let scale = u32::try_from(value["decimal_places"].as_u64()?).ok()?;
        if numerator == 0 || denominator == 0 {
            return None;
        }
        Some((
            amount.checked_mul(denominator)?,
            numerator.checked_mul(10u128.checked_pow(scale)?)?,
        ))
    };
    let compare = || -> Option<bool> {
        let (s, sd) = ratio(sell)?;
        let (c, cd) = ratio(buy)?;
        Some(s.checked_mul(cd)? < c.checked_mul(sd)?)
    };
    let Some(below) = compare() else {
        result["message"] =
            json!("Exact media comparison exceeds supported arithmetic or has missing dimensions.");
        return result;
    };
    result["status"] = json!(if below {
        "below_cost"
    } else {
        "no_lower_unit_rates"
    });
    result["message"] = json!(
        "Matching effective media unit rates. Supply eligibility and actual request charges are checked separately."
    );
    if below {
        result["dimensions"] = json!([{ "dimension":sell["meter"], "minimum_input_tokens":"0" }]);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::compare;
    use serde_json::json;

    #[test]
    fn compares_text_rates_across_union_of_context_tiers() {
        let sell = json!({
            "kind": "text",
            "prompt_rate": "1000",
            "completion_rate": "2000",
            "cached_prompt_rate": null,
            "cache_write_prompt_rate": null,
            "reasoning_completion_rate": null,
            "context_tiers": [{
                "minimum_input_tokens": "128000",
                "prompt_rate": "1500",
                "completion_rate": "2500",
                "cached_prompt_rate": null,
                "cache_write_prompt_rate": null,
                "reasoning_completion_rate": null
            }]
        });
        let cost = json!({
            "route": "gpt-4o",
            "provider": "Acme Provider",
            "configured": true,
            "currency": "USD",
            "rate_kind": "text",
            "schedule": {
                "prompt_rate": "900",
                "completion_rate": "1800",
                "cached_prompt_rate": null,
                "cache_write_prompt_rate": null,
                "reasoning_completion_rate": null,
                "context_tiers": [{
                    "minimum_input_tokens": "128000",
                    "prompt_rate": "1600",
                    "completion_rate": "2400",
                    "cached_prompt_rate": null,
                    "cache_write_prompt_rate": null,
                    "reasoning_completion_rate": null
                }]
            }
        });
        let check = compare(&sell, "USD", &cost);
        assert_eq!(check["status"], "below_cost");
        let dims = check["dimensions"].as_array().expect("dimensions array");
        assert!(
            dims.iter()
                .any(|d| d["dimension"] == "Input" && d["minimum_input_tokens"] == "128000")
        );
    }

    #[test]
    fn compares_matching_media_unit_rates_and_rejects_discounted_cards() {
        let sell = json!({
            "kind": "media",
            "dimensions": {
                "model": "sora-v1",
                "channel": "default",
                "resolution": "1080p",
                "reference_video": false
            },
            "meter": "output_seconds",
            "amount_units": "50",
            "decimal_places": 2,
            "per_quantity": { "numerator": "1", "denominator": "1" },
            "minimum_quantity": { "numerator": "5", "denominator": "1" },
            "rounding": "ceil_whole"
        });
        let cost = json!({
            "route": "sora-v1",
            "provider": "Video Provider",
            "configured": true,
            "currency": "USD",
            "rate_kind": "media",
            "schedule": {},
            "media_cards": [{
                "tariff": {
                    "currency": "USD",
                    "dimensions": {
                        "model": "sora-v1",
                        "channel": "default",
                        "resolution": "1080p",
                        "reference_video": false
                    },
                    "meter": "output_seconds",
                    "amount_units": "75",
                    "decimal_places": 2,
                    "per_quantity": { "numerator": "1", "denominator": "1" },
                    "minimum_quantity": { "numerator": "5", "denominator": "1" },
                    "rounding": "ceil_whole"
                },
                "discounts": []
            }]
        });
        let below = compare(&sell, "USD", &cost);
        assert_eq!(below["status"], "below_cost");
        assert_eq!(below["dimensions"][0]["dimension"], "output_seconds");

        let mut discounted = cost.clone();
        discounted["media_cards"][0]["discounts"] = json!([{"percent": 10}]);
        let incomparable = compare(&sell, "USD", &discounted);
        assert_eq!(incomparable["status"], "comparison_unavailable");
    }
}
