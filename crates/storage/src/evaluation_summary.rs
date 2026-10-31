//! Evidence summaries never substitute upstream procurement costs for customer charges.
use serde_json::{Value, json};
use std::collections::BTreeMap;

pub(crate) fn summarize(results: &[Value]) -> Value {
    let mut verdicts = BTreeMap::<String, usize>::new();
    let mut totals = BTreeMap::<String, i128>::new();
    let mut unknown = 0usize;
    let mut attempts = 0usize;
    let mut verified = 0usize;
    for result in results {
        *verdicts
            .entry(
                result["judgment"]["verdict"]
                    .as_str()
                    .unwrap_or("unknown")
                    .into(),
            )
            .or_default() += 1;
        verified += usize::from(result["input_match"] == "verified");
        for attempt in result["attempts"].as_array().into_iter().flatten() {
            attempts += 1;
            let charge = &attempt["customer_charge"];
            match charge["status"].as_str() {
                Some("not_charged") => {}
                Some("charged") => {
                    let money = charge["currency"]
                        .as_str()
                        .zip(charge["amount_nanos"].as_str())
                        .and_then(|(currency, amount)| {
                            amount
                                .parse::<i128>()
                                .ok()
                                .map(|amount| (format!("money:{currency}:nanos"), amount))
                        });
                    let unit = &charge["unit"];
                    let units = unit["definition_revision"]
                        .as_str()
                        .zip(unit["name"].as_str())
                        .zip(unit["net_atoms"].as_str())
                        .and_then(|((revision, name), amount)| {
                            amount
                                .parse::<i128>()
                                .ok()
                                .map(|amount| (format!("unit:{revision}:{name}:atoms"), amount))
                        });
                    if money.is_none() && units.is_none() {
                        unknown += 1;
                    }
                    for (dimension, amount) in money.into_iter().chain(units) {
                        // Stored per-attempt amounts are BIGINT; bounded run sizes fit i128.
                        *totals.entry(dimension).or_default() += amount;
                    }
                }
                _ => unknown += 1,
            }
        }
    }
    let accepted = verdicts.get("accepted").copied().unwrap_or(0);
    let per_accepted = if unknown == 0 && accepted > 0 && totals.len() == 1 {
        let (dimension, amount) = totals.iter().next().unwrap();
        json!({"dimension":dimension,"numerator":amount.to_string(),"denominator":accepted})
    } else {
        Value::Null
    };
    json!({"samples":results.len(),"verified_inputs":verified,"unverified_inputs":results.len()-verified,
        "verdicts":verdicts,"attempts":attempts,"unknown_charge_attempts":unknown,
        "customer_charge_totals":totals.into_iter().map(|(dimension, amount)|json!({"dimension":dimension,"amount":amount.to_string()})).collect::<Vec<_>>(),
        "cost_per_accepted":per_accepted,"cost_per_accepted_basis":"all_attempts_in_submitted_operations",
        "duration_basis":"evaluated_attempt_only"})
}

#[cfg(test)]
mod tests {
    use super::*;
    fn result(verdict: &str, charges: Vec<Value>) -> Value {
        json!({"input_match":"verified","judgment":{"verdict":verdict},"attempts":charges.into_iter().map(|charge|json!({"customer_charge":charge})).collect::<Vec<_>>()})
    }
    #[test]
    fn counts_failed_and_retry_charges_in_cost_per_acceptance() {
        let charge = |amount| json!({"status":"charged","currency":"USD","amount_nanos":amount});
        let summary = summarize(&[
            result("accepted", vec![charge("3"), charge("7")]),
            result("rejected", vec![charge("5")]),
        ]);
        assert_eq!(summary["attempts"], 3);
        assert_eq!(summary["cost_per_accepted"]["numerator"], "15");
        assert_eq!(summary["cost_per_accepted"]["denominator"], 1);
    }
    #[test]
    fn unknown_owner_funded_and_mixed_dimensions_do_not_make_value_claims() {
        let summary = summarize(&[result("accepted", vec![json!({"status":"owner_funded"})])]);
        assert_eq!(summary["unknown_charge_attempts"], 1);
        assert!(summary["cost_per_accepted"].is_null());
        let summary = summarize(&[result(
            "accepted",
            vec![
                json!({"status":"charged","currency":"USD","amount_nanos":"2","unit":{"definition_revision":"1","name":"credits","net_atoms":"8"}}),
            ],
        )]);
        assert_eq!(
            summary["customer_charge_totals"].as_array().unwrap().len(),
            2
        );
        assert!(summary["cost_per_accepted"].is_null());
    }
}

pub(crate) fn compare(left: &Value, right: &Value) -> Value {
    let same_contract = left["definition"]["protocol"] == right["definition"]["protocol"]
        && left["definition"]["rubric"] == right["definition"]["rubric"]
        && left["definition"]["task"] == right["definition"]["task"];
    let mut matched_left = Vec::new();
    let mut matched_right = Vec::new();
    let mut shared_operations = 0;
    if same_contract {
        for row in left["results"].as_array().into_iter().flatten() {
            if row["input_match"] != "verified" {
                continue;
            }
            if let Some(other) = right["results"]
                .as_array()
                .into_iter()
                .flatten()
                .find(|other| {
                    other["input_match"] == "verified"
                        && other["sample"] == row["sample"]
                        && other["request_sha256"] == row["request_sha256"]
                })
            {
                shared_operations += usize::from(row["operation_id"] == other["operation_id"]);
                matched_left.push(row.clone());
                matched_right.push(other.clone());
            }
        }
    }
    json!({"left":left["slug"],"right":right["slug"],"same_task_protocol_and_rubric":same_contract,
        "same_evaluator":left["evaluator"] == right["evaluator"],
        "quality_comparable":same_contract && left["evaluator"] == right["evaluator"] && !matched_left.is_empty(),
        "matched_verified_samples":matched_left.len(),"shared_operations":shared_operations,
        "left_unmatched_samples":left["results"].as_array().map_or(0,Vec::len)-matched_left.len(),
        "right_unmatched_samples":right["results"].as_array().map_or(0,Vec::len)-matched_right.len(),
        "left_summary":summarize(&matched_left),"right_summary":summarize(&matched_right)})
}

#[cfg(test)]
mod comparison_tests {
    use super::*;
    #[test]
    fn compares_only_verified_matching_inputs_and_reports_evaluator_changes() {
        let left = json!({"slug":"a","definition":{"task":"t","protocol":"chat","rubric":"r"},"evaluator":{"name":"e","version":"1"},"results":[{"sample":"s","request_sha256":"hash","input_match":"verified","operation_id":"op","judgment":{"verdict":"accepted"},"attempts":[]}]});
        let mut right = left.clone();
        right["slug"] = json!("b");
        assert_eq!(compare(&left, &right)["matched_verified_samples"], 1);
        assert_eq!(compare(&left, &right)["shared_operations"], 1);
        right["evaluator"]["version"] = json!("2");
        assert_eq!(compare(&left, &right)["quality_comparable"], false);
        right["results"][0]["input_match"] = json!("unverified");
        assert_eq!(compare(&left, &right)["matched_verified_samples"], 0);
    }
}
