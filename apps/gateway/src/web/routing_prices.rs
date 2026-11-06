//! Customer selling prices for explicit price-aware workspace routing.
//!
//! This module reads only customer-facing tariffs: the same data returned by
//! customer model discovery. It never joins Provider offers, procurement rates,
//! margins or credentials, so price-aware ranking cannot leak or depend on
//! confidential supply economics. Ranking is advisory: admission still pins the
//! concrete tariff revision before dispatch.

use crate::{error::ApiError, state::AppState};
use niu_storage::{
    CustomerPriceEvaluation, CustomerPriceStrategy, CustomerTextSellingPrice, RoutePoolCandidate,
    TenantScope, evaluate_customer_price_selection,
};
use std::collections::BTreeMap;

/// One workspace's comparable customer price surface for routing.
pub(super) struct WorkspaceCustomerPrices {
    pub billing_mode: String,
    pub prices: BTreeMap<String, CustomerTextSellingPrice>,
}

/// Load current customer selling prices for one workspace.
///
/// Credits-denominated plans expose unit prices rather than currency prices.
/// This strategy version supports only `nanounits_per_million_tokens` selling
/// prices, so a credits installation yields no comparable prices and routing
/// explicitly falls back instead of comparing atoms as currency.
pub(super) async fn load_workspace_customer_prices(
    state: &AppState,
    scope: TenantScope,
) -> Result<WorkspaceCustomerPrices, ApiError> {
    let (billing_mode, _unit_prices) = state
        .store
        .customer_unit_model_prices()
        .await
        .map_err(ApiError::from_store)?;
    let mut prices = BTreeMap::new();
    if billing_mode == "currency" {
        let raw = state
            .store
            .customer_model_prices(scope)
            .await
            .map_err(ApiError::from_store)?;
        for (alias, value) in raw {
            // A malformed or unsupported price remains unknown; it is never
            // converted into a zero or a synthetic cheapest price.
            if let Ok(price) = CustomerTextSellingPrice::from_value(&value) {
                prices.insert(alias, price);
            }
        }
        // Owner-funded personal routes have no Niu customer selling price even
        // when an older workspace tariff row still exists.
        let allow_internal = state.operating_mode == crate::state::OperatingMode::Internal;
        for route in state
            .store
            .accessible_vendor_routes(scope.organization_id, allow_internal)
            .await
            .map_err(ApiError::from_store)?
        {
            prices.remove(&route.model.alias);
        }
    }
    Ok(WorkspaceCustomerPrices {
        billing_mode,
        prices,
    })
}

/// Shared evaluation used by both workspace preview and runtime selection.
pub(super) fn evaluate(
    strategy: &CustomerPriceStrategy,
    prices: &WorkspaceCustomerPrices,
    candidates: &[RoutePoolCandidate],
) -> CustomerPriceEvaluation {
    evaluate_customer_price_selection(strategy, &prices.billing_mode, &prices.prices, candidates)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn candidate(alias: &str, priority: i32, weight: u32) -> RoutePoolCandidate {
        RoutePoolCandidate {
            alias: alias.into(),
            priority,
            weight,
            enabled: true,
        }
    }

    fn price(document: serde_json::Value) -> CustomerTextSellingPrice {
        CustomerTextSellingPrice::from_value(&document).expect("customer price fixture")
    }

    fn strategy() -> CustomerPriceStrategy {
        CustomerPriceStrategy {
            currency: "USD".into(),
            unit: niu_storage::CustomerPriceUnit::NanounitsPerMillionTokens,
            input_tokens: 1_000_000,
            output_tokens: 100_000,
        }
    }

    fn prices(
        entries: impl IntoIterator<Item = (&'static str, CustomerTextSellingPrice)>,
    ) -> WorkspaceCustomerPrices {
        WorkspaceCustomerPrices {
            billing_mode: "currency".into(),
            prices: entries
                .into_iter()
                .map(|(alias, price)| (alias.into(), price))
                .collect(),
        }
    }

    #[test]
    fn customer_price_document_shape_matches_model_discovery() {
        let parsed = price(json!({
            "revision": "internal-revision",
            "discount_baseline_revision": null,
            "currency": "USD",
            "unit": "nanounits_per_million_tokens",
            "prompt_rate": "1000000",
            "completion_rate": "2000000",
            "cached_prompt_rate": null,
            "reasoning_completion_rate": null,
            "cache_write_prompt_rate": null,
            "context_tiers": [{
                "minimum_input_tokens": "1000000",
                "prompt_rate": "500000",
                "completion_rate": "1000000",
                "cached_prompt_rate": null,
                "cache_write_prompt_rate": null,
                "reasoning_completion_rate": null
            }],
            "minimum_charge_nanos": "10",
            "request_fee_nanos": "2",
            "pricing_source": "platform",
            "price_id": "internal-price",
            "promotion_revision": null,
            "promotion_scope": null,
            "selected_at": "1",
            "price_version": "1"
        }));
        assert_eq!(parsed.currency, "USD");
        assert_eq!(
            parsed.estimate_nanos(1_000_000, 100_000).expect("estimate"),
            600_002
        );
    }

    #[test]
    fn only_candidates_that_already_passed_grants_and_caps_are_ranked() {
        // `cheapest` is cheaper but the caller excluded it before evaluation:
        // no model grant or an unmet request token cap must never be bypassed
        // by a lower customer price.
        let prices = prices([
            (
                "cheapest",
                price(json!({
                    "currency": "USD", "unit": "nanounits_per_million_tokens",
                    "prompt_rate": "0", "completion_rate": "0",
                    "minimum_charge_nanos": "0", "request_fee_nanos": "0",
                    "context_tiers": []
                })),
            ),
            (
                "available",
                price(json!({
                    "currency": "USD", "unit": "nanounits_per_million_tokens",
                    "prompt_rate": "1000000", "completion_rate": "0",
                    "minimum_charge_nanos": "0", "request_fee_nanos": "0",
                    "context_tiers": []
                })),
            ),
        ]);
        let evaluation = evaluate(&strategy(), &prices, &[candidate("available", 1, 1)]);
        assert_eq!(evaluation.selected_alias.as_deref(), Some("available"));
    }

    #[test]
    fn missing_and_incomparable_prices_fall_back_without_ranking() {
        let prices = prices([(
            "eur",
            price(json!({
                "currency": "EUR", "unit": "nanounits_per_million_tokens",
                "prompt_rate": "0", "completion_rate": "0",
                "minimum_charge_nanos": "0", "request_fee_nanos": "0",
                "context_tiers": []
            })),
        )]);
        let evaluation = evaluate(
            &strategy(),
            &prices,
            &[candidate("missing", 1000, 1), candidate("eur", 900, 1)],
        );
        assert_eq!(evaluation.selected_alias, None);
        assert_eq!(
            evaluation
                .candidates
                .iter()
                .map(|candidate| candidate.unknown_reason.map(|reason| reason.as_str()))
                .collect::<Vec<_>>(),
            vec![Some("missing_customer_price"), Some("currency_mismatch")]
        );
    }

    #[test]
    fn preview_and_runtime_share_the_same_winner() {
        let prices = prices([
            (
                "fast",
                price(json!({
                    "currency": "USD", "unit": "nanounits_per_million_tokens",
                    "prompt_rate": "3000000", "completion_rate": "3000000",
                    "minimum_charge_nanos": "0", "request_fee_nanos": "0",
                    "context_tiers": []
                })),
            ),
            (
                "cheap",
                price(json!({
                    "currency": "USD", "unit": "nanounits_per_million_tokens",
                    "prompt_rate": "1000000", "completion_rate": "1000000",
                    "minimum_charge_nanos": "0", "request_fee_nanos": "0",
                    "context_tiers": []
                })),
            ),
        ]);
        let candidates = [candidate("fast", 1000, 1), candidate("cheap", -1000, 1)];
        let preview = evaluate(&strategy(), &prices, &candidates);
        let runtime = evaluate(&strategy(), &prices, &candidates);
        assert_eq!(preview.selected_alias.as_deref(), Some("cheap"));
        assert_eq!(runtime, preview);
    }
}
