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
            row["pricing_health"] =
                build_pricing_health(&schedule, row["currency"].as_str().unwrap_or(""), &matching);
        }
        Ok(())
    }
}

fn build_pricing_health(schedule: &Value, currency: &str, matching: &[&Value]) -> Value {
    let configured_routes = matching.iter().filter(|c| c["configured"] == true).count();
    let ready: Vec<&&Value> = matching
        .iter()
        .filter(|c| c["supply_ready"] == true)
        .collect();
    let active_supply_routes = ready.len();
    let active_providers: Vec<String> = ready
        .iter()
        .filter_map(|c| {
            c["provider"]
                .as_str()
                .map(str::trim)
                .filter(|s| !s.is_empty())
        })
        .map(ToOwned::to_owned)
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    let supply_status = if active_supply_routes > 0 {
        "active"
    } else if configured_routes > 0 {
        "inactive"
    } else {
        "unconfigured"
    };

    let targets: Vec<&Value> = ready.into_iter().copied().collect();

    let mut checks = Vec::new();
    for cost in targets {
        checks.push(compare(schedule, currency, cost));
    }
    if checks.is_empty() {
        checks.push(json!({"status":"comparison_unavailable","message":"No active Provider supply route is available for comparison.","dimensions":[]}));
    }
    json!({
        "checks": checks,
        "advisory": true,
        "supply_status": supply_status,
        "active_supply_routes": active_supply_routes,
        "active_providers": active_providers,
    })
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
    let mut rates = Vec::new();
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
            rates.push(json!({
                "dimension": label, "minimum_input_tokens": input.to_string(),
                "selling": s.to_string(), "purchase": c.to_string()
            }));
            // Ignore a single-nanounit sentinel rate (1 nanounit / 1M, i.e. $0.000000001 / 1M)
            // often used as a minimal positive placeholder on zero-priced routes.
            if s < c && c > 1 {
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
    result["rates"] = json!(rates);
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
    // Stored media cards may encode integer amounts as JSON numbers. Preserve their
    // precision across the JavaScript boundary, including in older revisions.
    let integer_string = |value: &Value| {
        value
            .as_str()
            .map(str::to_owned)
            .unwrap_or_else(|| value.to_string())
    };
    let unit_price = |tariff: &Value| {
        json!({
            "amount_units": integer_string(&tariff["amount_units"]),
            "decimal_places": tariff["decimal_places"],
            "per_quantity": {
                "numerator": integer_string(&tariff["per_quantity"]["numerator"]),
                "denominator": integer_string(&tariff["per_quantity"]["denominator"])
            }
        })
    };
    result["media_rates"] =
        json!({"meter":sell["meter"],"selling":unit_price(sell),"purchase":unit_price(buy)});
    if below {
        result["dimensions"] = json!([{ "dimension":sell["meter"], "minimum_input_tokens":"0" }]);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::{build_pricing_health, compare};
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

    #[test]
    fn ignores_single_nanounit_placeholder_provider_quote_on_free_model() {
        let sell = json!({
            "kind": "text",
            "prompt_rate": "0",
            "completion_rate": "0",
            "cached_prompt_rate": null,
            "cache_write_prompt_rate": null,
            "reasoning_completion_rate": null,
            "context_tiers": []
        });
        let placeholder_cost = json!({
            "route": "qiniu/conatus-free",
            "provider": "Qiniu",
            "configured": true,
            "currency": "USD",
            "rate_kind": "text",
            "schedule": {
                "prompt_rate": "1",
                "completion_rate": "1",
                "cached_prompt_rate": null,
                "cache_write_prompt_rate": null,
                "reasoning_completion_rate": null,
                "context_tiers": []
            }
        });
        assert_eq!(
            compare(&sell, "USD", &placeholder_cost)["status"],
            "no_lower_unit_rates"
        );

        let mut real_cost = placeholder_cost;
        real_cost["schedule"]["prompt_rate"] = json!("1000");
        assert_eq!(compare(&sell, "USD", &real_cost)["status"], "below_cost");
    }

    #[test]
    fn summarizes_active_inactive_and_unconfigured_supply_readiness() {
        let sell = json!({
            "kind": "text",
            "prompt_rate": "1000",
            "completion_rate": "2000",
            "cached_prompt_rate": null,
            "cache_write_prompt_rate": null,
            "reasoning_completion_rate": null,
            "context_tiers": []
        });
        let active = json!({
            "route": "qiniu/conatus-free",
            "provider": "Qiniu",
            "configured": true,
            "supply_ready": true,
            "currency": "USD",
            "rate_kind": "text",
            "schedule": {
                "prompt_rate": "0",
                "completion_rate": "0",
                "cached_prompt_rate": null,
                "cache_write_prompt_rate": null,
                "reasoning_completion_rate": null,
                "context_tiers": []
            }
        });
        let disabled = json!({
            "route": "qiniu/deepseek-v4.1-flash",
            "provider": "FastRouter",
            "configured": true,
            "supply_ready": false,
            "currency": "USD",
            "rate_kind": "text",
            "schedule": null
        });
        let unconfigured = json!({
            "route": "legacy/removed",
            "provider": null,
            "configured": false,
            "supply_ready": false,
            "currency": null,
            "rate_kind": null,
            "schedule": null
        });

        let active_health = build_pricing_health(&sell, "USD", &[&active, &disabled]);
        assert_eq!(active_health["supply_status"], "active");
        assert_eq!(active_health["active_supply_routes"], 1);
        assert_eq!(active_health["active_providers"], json!(["Qiniu"]));
        // Active supply routes take precedence over disabled routes for unit-rate checks.
        assert_eq!(active_health["checks"].as_array().unwrap().len(), 1);
        assert_eq!(active_health["checks"][0]["status"], "no_lower_unit_rates");

        let inactive_health = build_pricing_health(&sell, "USD", &[&disabled]);
        assert_eq!(inactive_health["supply_status"], "inactive");
        assert_eq!(inactive_health["active_supply_routes"], 0);
        assert_eq!(inactive_health["active_providers"], json!([]));
        assert_eq!(
            inactive_health["checks"][0]["status"],
            "comparison_unavailable"
        );

        let disabled_expensive = json!({
            "route": "qiniu/deepseek-v4.1-flash",
            "provider": "FastRouter",
            "configured": true,
            "supply_ready": false,
            "currency": "USD",
            "rate_kind": "text",
            "schedule": {
                "prompt_rate": "9000",
                "completion_rate": "18000",
                "cached_prompt_rate": null,
                "cache_write_prompt_rate": null,
                "reasoning_completion_rate": null,
                "context_tiers": []
            }
        });
        let inactive_expensive_health = build_pricing_health(&sell, "USD", &[&disabled_expensive]);
        assert_eq!(inactive_expensive_health["supply_status"], "inactive");
        assert_ne!(
            inactive_expensive_health["checks"][0]["status"],
            "below_cost"
        );

        // Equal 100% Provider unit rates (no discount) across all dimensions never report below_cost.
        let equal_sell = json!({
            "kind": "text",
            "prompt_rate": "3000000000",
            "completion_rate": "15000000000",
            "cached_prompt_rate": "300000000",
            "cache_write_prompt_rate": "3750000000",
            "reasoning_completion_rate": null,
            "context_tiers": [{
                "minimum_input_tokens": "200000",
                "prompt_rate": "6000000000",
                "completion_rate": "22500000000",
                "cached_prompt_rate": "600000000",
                "cache_write_prompt_rate": "7500000000",
                "reasoning_completion_rate": null
            }]
        });
        let equal_cost = json!({
            "route": "openrouter/claude-sonnet-4",
            "provider": "OpenRouter",
            "configured": true,
            "supply_ready": true,
            "currency": "USD",
            "rate_kind": "text",
            "schedule": {
                "prompt_rate": "3000000000",
                "completion_rate": "15000000000",
                "cached_prompt_rate": "300000000",
                "cache_write_prompt_rate": "3750000000",
                "reasoning_completion_rate": null,
                "context_tiers": [{
                    "minimum_input_tokens": "200000",
                    "prompt_rate": "6000000000",
                    "completion_rate": "22500000000",
                    "cached_prompt_rate": "600000000",
                    "cache_write_prompt_rate": "7500000000",
                    "reasoning_completion_rate": null
                }]
            }
        });
        assert_eq!(
            compare(&equal_sell, "USD", &equal_cost)["status"],
            "no_lower_unit_rates"
        );

        let unconfigured_health = build_pricing_health(&sell, "USD", &[&unconfigured]);
        assert_eq!(unconfigured_health["supply_status"], "unconfigured");
        assert_eq!(unconfigured_health["active_supply_routes"], 0);
    }
}
