//! Versioned workspace routing strategy and deterministic customer-price ranking.
//!
//! Prices in this module are customer selling prices. Provider procurement
//! rates, offers and margins never participate in ranking. A missing or
//! incomparable price stays explicitly unknown; it is never treated as zero or
//! as the cheapest candidate.
//!
//! Version 2 adds the explicitly selected semantic Auto strategy. Legacy
//! version 1 priority/weight and customer-price configurations keep their
//! existing behavior and payload rules.

use crate::routing_auto::{AUTO_STRATEGY_VERSION, AutoStrategy};
use crate::{ContextPriceTier, RoutePoolCandidate, StoreError, TokenRates};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

/// Legacy strategy schema version. Omitted policies resolve to this version.
pub const WORKSPACE_ROUTING_STRATEGY_VERSION: u8 = 1;
/// Customer selling price unit used by this version.
pub const CUSTOMER_PRICE_UNIT: &str = "nanounits_per_million_tokens";
/// Bound for explicit request-size assumptions.
pub const MAX_PRICE_ASSUMPTION_TOKENS: u64 = 10_000_000;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceRoutingMode {
    #[default]
    PriorityWeight,
    CustomerPrice,
    Auto,
}

impl WorkspaceRoutingMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::PriorityWeight => "priority_weight",
            Self::CustomerPrice => "customer_price",
            Self::Auto => "auto",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CustomerPriceUnit {
    NanounitsPerMillionTokens,
}

impl CustomerPriceUnit {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::NanounitsPerMillionTokens => CUSTOMER_PRICE_UNIT,
        }
    }
}

/// Explicit price comparison assumptions for one workspace policy.
///
/// `input_tokens` and `output_tokens` are configured estimates, not measured
/// request usage. The ranking prices the aggregate input at the ordinary
/// prompt rate and the completion at the ordinary completion rate, selects one
/// whole-request context tier from `input_tokens`, and then adds the request
/// fee and applies the minimum charge. Cached and reasoning categories are not
/// assumed, so their discounts never improve a candidate's rank.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CustomerPriceStrategy {
    pub currency: String,
    pub unit: CustomerPriceUnit,
    pub input_tokens: u64,
    pub output_tokens: u64,
}

impl CustomerPriceStrategy {
    fn validate(&self) -> Result<(), StoreError> {
        if self.currency.len() != 3
            || !self.currency.bytes().all(|byte| byte.is_ascii_uppercase())
            || !(1..=MAX_PRICE_ASSUMPTION_TOKENS).contains(&self.input_tokens)
            || self.output_tokens > MAX_PRICE_ASSUMPTION_TOKENS
        {
            return Err(StoreError::InvalidVendor);
        }
        Ok(())
    }
}

/// Persisted, versioned selection strategy for a workspace model policy.
///
/// Version 1 supports `priority_weight` and `customer_price`. Version 2
/// requires `auto` and carries the optional bounded decider. The schema is
/// closed: an unsupported version, an unrecognized mode or a payload that does
/// not match the declared mode is rejected rather than ignored.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct WorkspaceRoutingStrategy {
    pub version: u8,
    pub mode: WorkspaceRoutingMode,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub customer_price: Option<CustomerPriceStrategy>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auto: Option<AutoStrategy>,
}

impl Default for WorkspaceRoutingStrategy {
    fn default() -> Self {
        Self {
            version: WORKSPACE_ROUTING_STRATEGY_VERSION,
            mode: WorkspaceRoutingMode::PriorityWeight,
            customer_price: None,
            auto: None,
        }
    }
}

impl WorkspaceRoutingStrategy {
    /// Reject unsupported versions and mismatched mode payloads instead of
    /// silently ignoring a configuration the evaluator cannot honor.
    pub fn validate(&self) -> Result<(), StoreError> {
        match self.version {
            WORKSPACE_ROUTING_STRATEGY_VERSION => {
                if self.auto.is_some() {
                    return Err(StoreError::InvalidVendor);
                }
                match (self.mode, &self.customer_price) {
                    (WorkspaceRoutingMode::PriorityWeight, None) => Ok(()),
                    (WorkspaceRoutingMode::PriorityWeight, Some(_)) => {
                        Err(StoreError::InvalidVendor)
                    }
                    (WorkspaceRoutingMode::CustomerPrice, None) => Err(StoreError::InvalidVendor),
                    (WorkspaceRoutingMode::CustomerPrice, Some(price)) => price.validate(),
                    (WorkspaceRoutingMode::Auto, _) => Err(StoreError::InvalidVendor),
                }
            }
            AUTO_STRATEGY_VERSION => {
                if self.mode != WorkspaceRoutingMode::Auto || self.customer_price.is_some() {
                    return Err(StoreError::InvalidVendor);
                }
                self.auto
                    .as_ref()
                    .ok_or(StoreError::InvalidVendor)?
                    .validate()
            }
            _ => Err(StoreError::InvalidVendor),
        }
    }

    /// Validate Auto path references against the policy's top-level candidates.
    /// The decision engine never accepts a path that could expand the model
    /// inventory or the caller's grants.
    pub fn validate_against_candidates(
        &self,
        candidate_aliases: &[String],
    ) -> Result<(), StoreError> {
        self.validate()?;
        if let Some(auto) = &self.auto {
            auto.validate_against_candidates(&candidate_aliases.iter().cloned().collect())?;
        }
        Ok(())
    }

    pub fn customer_price(&self) -> Option<&CustomerPriceStrategy> {
        self.customer_price.as_ref()
    }

    pub fn auto(&self) -> Option<&AutoStrategy> {
        self.auto.as_ref()
    }
}

/// Why a candidate has no comparable customer selling price.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CustomerPriceUnknown {
    Missing,
    CurrencyMismatch,
    UnitMismatch,
    Invalid,
    BillingModeNotComparable,
}

impl CustomerPriceUnknown {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Missing => "missing_customer_price",
            Self::CurrencyMismatch => "currency_mismatch",
            Self::UnitMismatch => "unit_mismatch",
            Self::Invalid => "invalid_customer_price",
            Self::BillingModeNotComparable => "billing_mode_not_comparable",
        }
    }
}

/// Parsed customer selling schedule for one model. The JSON comes from
/// `Store::customer_model_prices`, which never joins Provider offers.
#[derive(Clone, Debug)]
pub struct CustomerTextSellingPrice {
    pub currency: String,
    pub unit: String,
    pub prompt_rate: i64,
    pub completion_rate: i64,
    pub minimum_charge_nanos: i64,
    pub request_fee_nanos: i64,
    pub context_tiers: Vec<ContextPriceTier>,
}

fn json_integer(value: Option<&Value>) -> Result<i64, StoreError> {
    match value {
        Some(Value::String(text)) => text
            .parse::<i64>()
            .ok()
            .filter(|amount| *amount >= 0)
            .ok_or(StoreError::InvalidPrice),
        Some(Value::Number(number)) => number
            .as_i64()
            .filter(|amount| *amount >= 0)
            .ok_or(StoreError::InvalidPrice),
        _ => Err(StoreError::InvalidPrice),
    }
}

fn json_rate(value: Option<&Value>) -> Result<i64, StoreError> {
    let text = match value {
        Some(Value::String(text)) => text.clone(),
        Some(Value::Number(number)) => number.to_string(),
        _ => return Err(StoreError::InvalidPrice),
    };
    crate::pricing::parse_token_rate(&text)
}

impl CustomerTextSellingPrice {
    /// Parse one customer-price document. Unknown provenance fields are
    /// intentionally ignored; only amounts, currency, unit and schedule matter.
    pub fn from_value(value: &Value) -> Result<Self, StoreError> {
        let object = value.as_object().ok_or(StoreError::InvalidPrice)?;
        let string = |name: &str| {
            object
                .get(name)
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .ok_or(StoreError::InvalidPrice)
        };
        let tiers = object
            .get("context_tiers")
            .cloned()
            .unwrap_or_else(|| Value::Array(Vec::new()));
        let context_tiers: Vec<ContextPriceTier> =
            serde_json::from_value(tiers).map_err(|_| StoreError::InvalidPrice)?;
        let price = Self {
            currency: string("currency")?,
            unit: string("unit")?,
            prompt_rate: json_rate(object.get("prompt_rate"))?,
            completion_rate: json_rate(object.get("completion_rate"))?,
            minimum_charge_nanos: json_integer(object.get("minimum_charge_nanos"))?,
            request_fee_nanos: json_integer(object.get("request_fee_nanos"))?,
            context_tiers,
        };
        price.estimate_nanos(1, 0)?;
        Ok(price)
    }

    /// Validate that this price is denominated in the strategy's currency and
    /// unit before it participates in any comparison.
    pub fn comparable_with(
        &self,
        strategy: &CustomerPriceStrategy,
    ) -> Result<(), CustomerPriceUnknown> {
        if self.currency != strategy.currency {
            return Err(CustomerPriceUnknown::CurrencyMismatch);
        }
        if self.unit != strategy.unit.as_str() {
            return Err(CustomerPriceUnknown::UnitMismatch);
        }
        Ok(())
    }

    /// Estimated customer charge in currency nanounits for the configured
    /// assumptions. Callers must compare only estimates from the same currency,
    /// unit and assumption set.
    pub fn estimate_nanos(&self, input_tokens: u64, output_tokens: u64) -> Result<i64, StoreError> {
        let input = i64::try_from(input_tokens).map_err(|_| StoreError::InvalidPrice)?;
        let output = i64::try_from(output_tokens).map_err(|_| StoreError::InvalidPrice)?;
        let rates = match crate::select_context_tier(&self.context_tiers, input)? {
            Some(tier) => tier.ordinary,
            None => TokenRates {
                prompt: self.prompt_rate,
                completion: self.completion_rate,
            },
        };
        let token_charge = rates.charge(input, output)?;
        crate::pricing::customer_charge_with_fixed(
            token_charge,
            self.request_fee_nanos,
            self.minimum_charge_nanos,
        )
    }
}

/// One eligible candidate's price evaluation. `estimated_charge_nanos` is
/// `None` exactly when the candidate is not comparable and `unknown_reason`
/// explains why.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CustomerPriceCandidate {
    pub alias: String,
    pub estimated_charge_nanos: Option<i64>,
    pub unknown_reason: Option<CustomerPriceUnknown>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CustomerPriceFallbackReason {
    NoComparableCustomerPrice,
    BillingModeNotComparable,
}

impl CustomerPriceFallbackReason {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::NoComparableCustomerPrice => "no_comparable_customer_price",
            Self::BillingModeNotComparable => "billing_mode_not_comparable",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CustomerPriceEvaluation {
    pub candidates: Vec<CustomerPriceCandidate>,
    pub selected_alias: Option<String>,
    pub fallback_reason: Option<CustomerPriceFallbackReason>,
}

/// Rank already-eligible candidates deterministically by customer selling price.
///
/// The caller must pass only candidates that already passed rule matching,
/// authorization grants, protocol support, capability/token bounds and supply
/// eligibility. This function never reads Provider procurement prices.
///
/// Selection order: lowest estimated customer charge, then higher priority,
/// then higher weight, then byte-wise alias order. Candidates without a
/// comparable price are reported as unknown and are never ranked. When no
/// candidate has a comparable price, `selected_alias` is `None` so the caller
/// can fall back to the existing priority/weight selection.
pub fn evaluate_customer_price_selection(
    strategy: &CustomerPriceStrategy,
    billing_mode: &str,
    prices: &BTreeMap<String, CustomerTextSellingPrice>,
    candidates: &[RoutePoolCandidate],
) -> CustomerPriceEvaluation {
    if billing_mode != "currency" {
        return CustomerPriceEvaluation {
            candidates: candidates
                .iter()
                .map(|candidate| CustomerPriceCandidate {
                    alias: candidate.alias.clone(),
                    estimated_charge_nanos: None,
                    unknown_reason: Some(CustomerPriceUnknown::BillingModeNotComparable),
                })
                .collect(),
            selected_alias: None,
            fallback_reason: Some(CustomerPriceFallbackReason::BillingModeNotComparable),
        };
    }
    let mut evaluated = Vec::with_capacity(candidates.len());
    let mut best: Option<(i64, &RoutePoolCandidate)> = None;
    for candidate in candidates {
        let (estimate, unknown) = match prices.get(&candidate.alias) {
            None => (None, Some(CustomerPriceUnknown::Missing)),
            Some(price) => match price.comparable_with(strategy) {
                Err(reason) => (None, Some(reason)),
                Ok(()) => match price.estimate_nanos(strategy.input_tokens, strategy.output_tokens)
                {
                    Ok(estimate) => (Some(estimate), None),
                    Err(_) => (None, Some(CustomerPriceUnknown::Invalid)),
                },
            },
        };
        if let Some(estimate) = estimate {
            let wins = best.is_none_or(|(current, current_candidate)| {
                estimate < current
                    || (estimate == current
                        && (candidate.priority > current_candidate.priority
                            || (candidate.priority == current_candidate.priority
                                && (candidate.weight > current_candidate.weight
                                    || (candidate.weight == current_candidate.weight
                                        && candidate.alias < current_candidate.alias)))))
            });
            if wins {
                best = Some((estimate, candidate));
            }
        }
        evaluated.push(CustomerPriceCandidate {
            alias: candidate.alias.clone(),
            estimated_charge_nanos: estimate,
            unknown_reason: unknown,
        });
    }
    let selected_alias = best.map(|(_, candidate)| candidate.alias.clone());
    CustomerPriceEvaluation {
        fallback_reason: selected_alias
            .is_none()
            .then_some(CustomerPriceFallbackReason::NoComparableCustomerPrice),
        candidates: evaluated,
        selected_alias,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::WorkspaceModelPool;
    use serde_json::json;

    fn candidate(alias: &str, priority: i32, weight: u32) -> RoutePoolCandidate {
        RoutePoolCandidate {
            alias: alias.into(),
            priority,
            weight,
            enabled: true,
        }
    }

    fn price(currency: &str, prompt: i64, completion: i64) -> CustomerTextSellingPrice {
        CustomerTextSellingPrice {
            currency: currency.into(),
            unit: CUSTOMER_PRICE_UNIT.into(),
            prompt_rate: prompt,
            completion_rate: completion,
            minimum_charge_nanos: 0,
            request_fee_nanos: 0,
            context_tiers: Vec::new(),
        }
    }

    fn strategy(currency: &str) -> CustomerPriceStrategy {
        CustomerPriceStrategy {
            currency: currency.into(),
            unit: CustomerPriceUnit::NanounitsPerMillionTokens,
            input_tokens: 1_000_000,
            output_tokens: 100_000,
        }
    }

    #[test]
    fn strategy_defaults_and_validation_are_explicit() {
        let default = WorkspaceRoutingStrategy::default();
        assert_eq!(default.version, 1);
        assert_eq!(default.mode, WorkspaceRoutingMode::PriorityWeight);
        assert!(default.validate().is_ok());
        let value = serde_json::to_value(&default).unwrap();
        assert_eq!(value, json!({"version": 1, "mode": "priority_weight"}));

        let parsed: WorkspaceRoutingStrategy =
            serde_json::from_value(json!({"version": 1, "mode": "priority_weight"})).unwrap();
        assert_eq!(parsed, default);
        let explicit: WorkspaceRoutingStrategy = serde_json::from_value(json!({
            "version": 1,
            "mode": "customer_price",
            "customer_price": {
                "currency": "USD",
                "unit": "nanounits_per_million_tokens",
                "input_tokens": 1_000_000,
                "output_tokens": 100_000
            }
        }))
        .unwrap();
        assert!(explicit.validate().is_ok());
        for invalid in [
            json!({"version": 2, "mode": "priority_weight"}),
            json!({"version": 0, "mode": "priority_weight"}),
            json!({"version": 1, "mode": "customer_price"}),
            json!({"version": 1, "mode": "priority_weight", "customer_price": {
                "currency": "USD", "unit": "nanounits_per_million_tokens",
                "input_tokens": 1, "output_tokens": 1,
            }}),
            json!({"version": 1, "mode": "customer_price", "customer_price": {
                "currency": "usd", "unit": "nanounits_per_million_tokens",
                "input_tokens": 1, "output_tokens": 1,
            }}),
            json!({"version": 1, "mode": "customer_price", "customer_price": {
                "currency": "USD", "unit": "nanounits_per_million_tokens",
                "input_tokens": 0, "output_tokens": 1,
            }}),
            json!({"version": 1, "mode": "customer_price", "customer_price": {
                "currency": "USD", "unit": "nanounits_per_million_tokens",
                "input_tokens": 1, "output_tokens": 10_000_001,
            }}),
        ] {
            let value: WorkspaceRoutingStrategy = serde_json::from_value(invalid).unwrap();
            assert!(value.validate().is_err());
        }
    }

    #[test]
    fn workspace_pool_without_strategy_defaults_to_version_one_priority_weight() {
        let pool: WorkspaceModelPool = serde_json::from_value(json!({
            "slug": "assistant",
            "name": "Assistant",
            "description": "",
            "enabled": true,
            "revision": 1,
            "candidates": [{
                "alias": "fast", "priority": 100, "weight": 1, "enabled": true
            }]
        }))
        .expect("legacy workspace policy");
        assert_eq!(pool.strategy, WorkspaceRoutingStrategy::default());
        let saved = serde_json::to_value(&pool).expect("serialize policy");
        assert_eq!(
            saved["strategy"],
            json!({"version": 1, "mode": "priority_weight"})
        );
    }

    #[test]
    fn customer_price_document_parsing_ignores_provenance_only() {
        let parsed = CustomerTextSellingPrice::from_value(&json!({
            "revision": "internal",
            "currency": "USD",
            "unit": "nanounits_per_million_tokens",
            "prompt_rate": "2000000",
            "completion_rate": "4000000",
            "minimum_charge_nanos": "10",
            "request_fee_nanos": "5",
            "context_tiers": [],
            "pricing_source": "platform",
            "promotion_scope": null
        }))
        .unwrap();
        assert_eq!(parsed.currency, "USD");
        assert_eq!(parsed.prompt_rate, 2_000_000);
        assert_eq!(
            parsed.estimate_nanos(1_000_000, 100_000).unwrap(),
            2_400_005
        );
        for invalid in [
            json!({"currency":"USD","unit":"nanounits_per_million_tokens","prompt_rate":"-1","completion_rate":"1"}),
            json!({"currency":"USD","unit":"nanounits_per_million_tokens","prompt_rate":"1","completion_rate":"1","minimum_charge_nanos":"-1"}),
            json!({"currency":"USD","unit":"nanounits_per_million_tokens","prompt_rate":"1","completion_rate":"1","context_tiers":[{"minimum_input_tokens":"x","prompt_rate":"1","completion_rate":"1"}]}),
        ] {
            assert!(CustomerTextSellingPrice::from_value(&invalid).is_err());
        }
    }

    #[test]
    fn estimate_includes_context_tier_fee_and_minimum() {
        let mut tiered = price("USD", 2_000_000, 4_000_000);
        tiered.request_fee_nanos = 7;
        tiered.minimum_charge_nanos = 100;
        tiered.context_tiers = vec![ContextPriceTier {
            minimum_input_tokens: "1000000".into(),
            prompt_rate: "1000000".into(),
            completion_rate: "2000000".into(),
            cached_prompt_rate: None,
            cache_write_prompt_rate: None,
            reasoning_completion_rate: None,
        }];
        assert_eq!(
            tiered
                .estimate_nanos(1_000_000, 100_000)
                .expect("tier estimate"),
            1_200_007
        );
        // Small requests still pay the explicit minimum charge.
        assert_eq!(tiered.estimate_nanos(1, 1).expect("minimum"), 100);
    }

    #[test]
    fn missing_prices_remain_unknown_and_fall_back() {
        let evaluation = evaluate_customer_price_selection(
            &strategy("USD"),
            "currency",
            &BTreeMap::new(),
            &[candidate("fast", 100, 1), candidate("cheap", 1, 1)],
        );
        assert_eq!(evaluation.selected_alias, None);
        assert_eq!(
            evaluation.fallback_reason,
            Some(CustomerPriceFallbackReason::NoComparableCustomerPrice)
        );
        for candidate in &evaluation.candidates {
            assert_eq!(candidate.estimated_charge_nanos, None);
            assert_eq!(
                candidate.unknown_reason,
                Some(CustomerPriceUnknown::Missing)
            );
        }
    }

    #[test]
    fn currency_and_unit_mismatch_never_become_cheapest() {
        let mut usd = BTreeMap::new();
        usd.insert("usd".into(), price("USD", 1_000_000, 0));
        usd.insert("eur".into(), price("EUR", 0, 0));
        usd.insert(
            "credits".into(),
            CustomerTextSellingPrice {
                unit: "atoms_per_million_tokens".into(),
                ..price("USD", 0, 0)
            },
        );
        let evaluation = evaluate_customer_price_selection(
            &strategy("USD"),
            "currency",
            &usd,
            &[
                candidate("eur", 900, 1),
                candidate("credits", 800, 1),
                candidate("usd", 1, 1),
            ],
        );
        assert_eq!(evaluation.selected_alias.as_deref(), Some("usd"));
        assert_eq!(
            evaluation.candidates[0].unknown_reason,
            Some(CustomerPriceUnknown::CurrencyMismatch)
        );
        assert_eq!(
            evaluation.candidates[1].unknown_reason,
            Some(CustomerPriceUnknown::UnitMismatch)
        );
        assert!(evaluation.candidates[2].estimated_charge_nanos.is_some());
    }

    #[test]
    fn only_comparable_customer_prices_are_ranked() {
        let mut prices = BTreeMap::new();
        prices.insert("priced".into(), price("USD", 1_000_000, 0));
        let evaluation = evaluate_customer_price_selection(
            &strategy("USD"),
            "currency",
            &prices,
            &[candidate("unpriced", 1000, 1), candidate("priced", 1, 1)],
        );
        assert_eq!(evaluation.selected_alias.as_deref(), Some("priced"));
        assert_eq!(
            evaluation.candidates[0].unknown_reason,
            Some(CustomerPriceUnknown::Missing)
        );
        assert!(evaluation.candidates[1].estimated_charge_nanos.is_some());
    }

    #[test]
    fn credits_billing_never_compares_fiat_prices() {
        let mut prices = BTreeMap::new();
        prices.insert("fast".into(), price("USD", 0, 0));
        let evaluation = evaluate_customer_price_selection(
            &strategy("USD"),
            "credits",
            &prices,
            &[candidate("fast", 1, 1)],
        );
        assert_eq!(evaluation.selected_alias, None);
        assert_eq!(
            evaluation.fallback_reason,
            Some(CustomerPriceFallbackReason::BillingModeNotComparable)
        );
        assert_eq!(
            evaluation.candidates[0].unknown_reason,
            Some(CustomerPriceUnknown::BillingModeNotComparable)
        );
    }

    #[test]
    fn ties_use_priority_weight_and_alias_deterministically() {
        let mut prices = BTreeMap::new();
        for alias in ["zeta", "beta", "alpha"] {
            prices.insert(alias.into(), price("USD", 1_000_000, 0));
        }
        let evaluation = evaluate_customer_price_selection(
            &strategy("USD"),
            "currency",
            &prices,
            &[
                candidate("zeta", 10, 1),
                candidate("beta", 10, 2),
                candidate("alpha", 10, 2),
            ],
        );
        assert_eq!(evaluation.selected_alias.as_deref(), Some("alpha"));
        let repeated = evaluate_customer_price_selection(
            &strategy("USD"),
            "currency",
            &prices,
            &[
                candidate("zeta", 10, 1),
                candidate("beta", 10, 2),
                candidate("alpha", 10, 2),
            ],
        );
        assert_eq!(repeated.selected_alias, evaluation.selected_alias);
    }

    #[test]
    fn lower_estimate_beats_a_higher_priority_candidate() {
        let mut prices = BTreeMap::new();
        prices.insert("expensive".into(), price("USD", 5_000_000, 5_000_000));
        prices.insert("cheap".into(), price("USD", 1_000_000, 1_000_000));
        let evaluation = evaluate_customer_price_selection(
            &strategy("USD"),
            "currency",
            &prices,
            &[
                candidate("expensive", 1000, 1),
                candidate("cheap", -1000, 1),
            ],
        );
        assert_eq!(evaluation.selected_alias.as_deref(), Some("cheap"));
    }

    #[test]
    fn estimates_are_not_currency_converted() {
        let mut prices = BTreeMap::new();
        prices.insert("eur".into(), price("EUR", 0, 0));
        let evaluation = evaluate_customer_price_selection(
            &strategy("USD"),
            "currency",
            &prices,
            &[candidate("eur", 1, 1)],
        );
        assert_eq!(evaluation.selected_alias, None);
        assert_eq!(
            evaluation.candidates[0].unknown_reason,
            Some(CustomerPriceUnknown::CurrencyMismatch)
        );
    }
}
