//! Exact decimal quote estimates. Unknown or unsupported inputs never imply zero.
use serde::Deserialize;
use serde_json::{Value, json};
use std::collections::BTreeMap;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Quantity {
    pub meter: String,
    pub condition: Option<String>,
    pub units: String,
}
fn rate_amount(raw: &str, units: u128, per_units: u64) -> Option<(u128, usize)> {
    let decimal = super::types::decimal(&json!(raw))?;
    let scale = decimal.split('.').nth(1).map_or(0, str::len);
    let digits = decimal
        .chars()
        .filter(|c| *c != '.')
        .collect::<String>()
        .parse::<u128>()
        .ok()?;
    let numerator = digits.checked_mul(units)?;
    let mut divisor = per_units;
    let mut shift = 0;
    while divisor > 1 && divisor.is_multiple_of(10) {
        divisor /= 10;
        shift += 1;
    }
    (divisor == 1).then_some((numerator, scale + shift))
}
fn add(left: (u128, usize), right: (u128, usize)) -> Option<(u128, usize)> {
    let scale = left.1.max(right.1);
    let a = left
        .0
        .checked_mul(10_u128.checked_pow((scale - left.1).try_into().ok()?)?)?;
    let b = right
        .0
        .checked_mul(10_u128.checked_pow((scale - right.1).try_into().ok()?)?)?;
    Some((a.checked_add(b)?, scale))
}
fn display(value: (u128, usize)) -> String {
    if value.1 == 0 {
        return value.0.to_string();
    }
    let digits = value.0.to_string();
    let digits = if digits.len() <= value.1 {
        format!("{}{}", "0".repeat(value.1 + 1 - digits.len()), digits)
    } else {
        digits
    };
    let split = digits.len() - value.1;
    let text = format!("{}.{}", &digits[..split], &digits[split..]);
    let text = text.trim_end_matches('0').trim_end_matches('.');
    if text.is_empty() {
        "0".into()
    } else {
        text.into()
    }
}
pub(crate) fn estimate(
    evidence: &Value,
    model: &str,
    quantities: &[Quantity],
) -> Result<Value, &'static str> {
    if quantities.is_empty() || quantities.len() > 32 {
        return Err("Supply between one and 32 disjoint billable meter quantities");
    }
    let price = evidence["prices"]
        .as_array()
        .and_then(|prices| prices.iter().find(|p| p["model"] == model));
    let rates = price.and_then(|p| p["rates"].as_array());
    let mut sums: BTreeMap<String, (u128, usize)> = BTreeMap::new();
    let mut unknown = Vec::new();
    let mut seen = std::collections::BTreeSet::new();
    for quantity in quantities {
        if quantity.meter.trim().is_empty()
            || quantity.meter.len() > 80
            || quantity
                .condition
                .as_ref()
                .is_some_and(|value| value.is_empty() || value.len() > 80)
            || !seen.insert((&quantity.meter, &quantity.condition))
        {
            return Err("Meter names must be unique and bounded");
        }
        if quantity.units.is_empty()
            || quantity.units.len() > 20
            || !quantity.units.chars().all(|c| c.is_ascii_digit())
        {
            return Err("Meter units must be exact nonnegative integers");
        }
        let units = quantity
            .units
            .parse::<u64>()
            .map_err(|_| "Meter units must be exact nonnegative integers")?;
        let rate = rates.and_then(|rates| {
            let mut matches = rates.iter().filter(|r| {
                r["meter"] == quantity.meter
                    && r["condition"].as_str() == quantity.condition.as_deref()
            });
            let first = matches.next();
            if matches.next().is_some() {
                None
            } else {
                first
            }
        });
        let value = rate.and_then(|r| {
            Some((
                r["currency"].as_str()?.to_owned(),
                rate_amount(
                    r["amount"].as_str()?,
                    u128::from(units),
                    r["per_units"].as_u64()?,
                )?,
            ))
        });
        if let Some((currency, amount)) = value {
            if let Some(total) = add(*sums.get(&currency).unwrap_or(&(0, 0)), amount) {
                sums.insert(currency, total);
            } else {
                unknown.push(quantity.meter.clone());
            }
        } else {
            unknown.push(quantity.meter.clone());
        }
    }
    let unsupported = price
        .and_then(|p| p["unsupported_dimensions"].as_array())
        .cloned()
        .unwrap_or_default();
    let complete = unknown.is_empty() && unsupported.is_empty() && price.is_some();
    Ok(
        json!({"basis":"advertised_quote_estimate","status":if sums.is_empty(){"unavailable"}else if complete{"available"}else{"partial"},"totals":sums.into_iter().map(|(currency,amount)|json!({"currency":currency,"amount":display(amount)})).collect::<Vec<_>>(),"unknown_meters":unknown,"unsupported_price_dimensions":unsupported,"complete_for_supplied_meters":complete,"is_actual_provider_charge":false}),
    )
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn estimates_exact_decimals_without_repricing_or_unknown_zero() {
        let evidence = json!({"prices":[{"model":"model","rates":[{"meter":"input_tokens","amount":"0.0000003","currency":"USD","per_units":1},{"meter":"output_tokens","amount":"0.0000012","currency":"USD","per_units":1}],"unsupported_dimensions":[]}]});
        let result = estimate(
            &evidence,
            "model",
            &[
                Quantity {
                    meter: "input_tokens".into(),
                    condition: None,
                    units: "1000".into(),
                },
                Quantity {
                    meter: "output_tokens".into(),
                    condition: None,
                    units: "800".into(),
                },
            ],
        )
        .unwrap();
        assert_eq!(result["totals"][0]["amount"], "0.00126");
        assert_eq!(result["complete_for_supplied_meters"], true);
        let missing = estimate(
            &evidence,
            "missing",
            &[Quantity {
                meter: "input_tokens".into(),
                condition: None,
                units: "1000".into(),
            }],
        )
        .unwrap();
        assert_eq!(missing["status"], "unavailable");
        assert_eq!(missing["totals"], json!([]));
    }
}
