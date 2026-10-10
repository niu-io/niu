//! Whole-request context schedules. Quantities and prices remain exact integers.
use crate::{StoreError, TokenRates};
use serde::{Deserialize, Serialize};

/// A complete token schedule above an inclusive aggregate-input threshold.
/// Null category rates mean flat pricing, never inheritance from the base tier.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ContextPriceTier {
    pub minimum_input_tokens: String,
    pub prompt_rate: String,
    pub completion_rate: String,
    pub cached_prompt_rate: Option<String>,
    pub cache_write_prompt_rate: Option<String>,
    pub reasoning_completion_rate: Option<String>,
}

#[derive(Clone, Copy, Debug)]
pub struct ContextTierRates {
    pub minimum_input_tokens: i64,
    pub ordinary: TokenRates,
    pub cached_prompt: Option<i64>,
    pub cache_write_prompt: Option<i64>,
    pub reasoning_completion: Option<i64>,
}

impl ContextPriceTier {
    pub fn rates(&self) -> Result<ContextTierRates, StoreError> {
        let threshold = &self.minimum_input_tokens;
        if threshold.is_empty() || !threshold.bytes().all(|b| b.is_ascii_digit()) {
            return Err(StoreError::InvalidPrice);
        }
        let minimum_input_tokens = threshold
            .parse::<i64>()
            .ok()
            .filter(|value| *value > 0)
            .ok_or(StoreError::InvalidPrice)?;
        let optional = |value: &Option<String>| {
            value
                .as_deref()
                .map(crate::pricing::parse_token_rate)
                .transpose()
        };
        Ok(ContextTierRates {
            minimum_input_tokens,
            ordinary: TokenRates {
                prompt: crate::pricing::parse_token_rate(&self.prompt_rate)?,
                completion: crate::pricing::parse_token_rate(&self.completion_rate)?,
            },
            cached_prompt: optional(&self.cached_prompt_rate)?,
            cache_write_prompt: optional(&self.cache_write_prompt_rate)?,
            reasoning_completion: optional(&self.reasoning_completion_rate)?,
        })
    }
}

/// Canonical ascending thresholds; validate the entire schedule before publication.
pub fn normalize_context_tiers(tiers: &mut [ContextPriceTier]) -> Result<(), StoreError> {
    if tiers.len() > 32 {
        return Err(StoreError::InvalidPrice);
    }
    let mut thresholds = std::collections::BTreeSet::new();
    for tier in tiers.iter_mut() {
        let threshold = tier.rates()?.minimum_input_tokens;
        if !thresholds.insert(threshold) {
            return Err(StoreError::InvalidPrice);
        }
        tier.minimum_input_tokens = threshold.to_string();
    }
    // Every threshold was parsed above; compare numerically, not lexicographically.
    tiers.sort_by_key(|tier| tier.minimum_input_tokens.parse::<i64>().unwrap());
    Ok(())
}

/// Select from authoritative aggregate input, never request bytes or estimates.
pub fn select_context_tier(
    tiers: &[ContextPriceTier],
    input: i64,
) -> Result<Option<ContextTierRates>, StoreError> {
    if input < 0 || tiers.len() > 32 {
        return Err(StoreError::InvalidUsage);
    }
    let mut selected: Option<ContextTierRates> = None;
    for tier in tiers {
        let rates = tier.rates()?;
        if rates.minimum_input_tokens <= input
            && selected.is_none_or(|old| old.minimum_input_tokens < rates.minimum_input_tokens)
        {
            selected = Some(rates);
        }
    }
    Ok(selected)
}

/// Bound every reachable schedule, including a lower-priced higher tier.
/// Base token liability is supplied by the same ordinary/category rate logic.
pub fn context_token_reservation(
    base: i64,
    tiers: &[ContextPriceTier],
    input_bound: i64,
    output_bound: i64,
) -> Result<i64, StoreError> {
    if base < 0 || input_bound < 0 || output_bound < 0 || tiers.len() > 32 {
        return Err(StoreError::InvalidPrice);
    }
    let mut maximum = base;
    for tier in tiers {
        let tier = tier.rates()?;
        if tier.minimum_input_tokens > input_bound {
            continue;
        }
        let rates = TokenRates {
            prompt: tier
                .ordinary
                .prompt
                .max(tier.cached_prompt.unwrap_or(tier.ordinary.prompt))
                .max(tier.cache_write_prompt.unwrap_or(tier.ordinary.prompt)),
            completion: tier.ordinary.completion.max(
                tier.reasoning_completion
                    .unwrap_or(tier.ordinary.completion),
            ),
        };
        maximum = maximum.max(rates.charge(input_bound, output_bound)?);
    }
    Ok(maximum)
}
