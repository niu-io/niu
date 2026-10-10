use crate::StoreError;

/// Integer currency nanounits per million aggregate input/output tokens.
/// `charge` uses a flat schedule. Cache pricing requires an explicit separate
/// rate and quantity; category pricing splits reported subsets without double counting.
#[derive(Clone, Copy, Debug)]
pub struct TokenRates {
    pub prompt: i64,
    pub completion: i64,
}

impl TokenRates {
    /// Round the combined exact charge upward once, preserving sub-unit costs.
    pub fn charge(self, prompt: i64, completion: i64) -> Result<i64, StoreError> {
        self.charge_with_categories(prompt, completion, None, None)
    }

    pub fn charge_with_cached_prompt(
        self,
        prompt: i64,
        completion: i64,
        cached: i64,
        cached_rate: i64,
    ) -> Result<i64, StoreError> {
        self.charge_with_categories(prompt, completion, Some((cached, cached_rate)), None)
    }

    /// Each optional pair is (reported subset quantity, pinned category rate).
    /// Split both totals before pricing; round the combined exact numerator once.
    pub fn charge_with_categories(
        self,
        prompt: i64,
        completion: i64,
        cached: Option<(i64, i64)>,
        reasoning: Option<(i64, i64)>,
    ) -> Result<i64, StoreError> {
        let (cached, cached_rate) = cached.unwrap_or((0, self.prompt));
        let (reasoning, reasoning_rate) = reasoning.unwrap_or((0, self.completion));
        if [
            self.prompt,
            self.completion,
            prompt,
            completion,
            cached,
            cached_rate,
            reasoning,
            reasoning_rate,
        ]
        .iter()
        .any(|v| *v < 0)
            || cached > prompt
            || reasoning > completion
        {
            return Err(StoreError::InvalidPrice);
        }
        let exact = i128::from(prompt - cached) * i128::from(self.prompt)
            + i128::from(cached) * i128::from(cached_rate)
            + i128::from(completion - reasoning) * i128::from(self.completion)
            + i128::from(reasoning) * i128::from(reasoning_rate);
        i64::try_from((exact + 999_999) / 1_000_000).map_err(|_| StoreError::InvalidPrice)
    }
}

/// Exact public rate syntax shared by Supplier offers and customer tariffs.
pub(crate) fn parse_token_rate(value: &str) -> Result<i64, StoreError> {
    if value.is_empty() || !value.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(StoreError::InvalidPrice);
    }
    value
        .parse::<i64>()
        .ok()
        .filter(|rate| (0..=1_000_000_000_000_000).contains(rate))
        .ok_or(StoreError::InvalidPrice)
}

pub struct PriceInput<'a> {
    pub resource_id: &'a str,
    pub offer_revision: &'a str,
    pub currency: &'a str,
    pub api_equivalent: TokenRates,
    pub cash: TokenRates,
}

/// Apply customer-only fixed pricing after exact token rounding. Admission and
/// final accrual share this rule; neither an unknown result nor a rejection is
/// a billable completion. Overflow must never wrap or silently cap liability.
pub(crate) fn customer_charge_with_fixed(
    token_charge: i64,
    request_fee: i64,
    minimum: i64,
) -> Result<i64, StoreError> {
    if token_charge < 0 || request_fee < 0 || minimum < 0 {
        return Err(StoreError::InvalidPrice);
    }
    token_charge
        .checked_add(request_fee)
        .map(|amount| amount.max(minimum))
        .ok_or(StoreError::InvalidPrice)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn exact_rounding_and_overflow() {
        let rates = TokenRates {
            prompt: 1,
            completion: 1,
        };
        assert_eq!(rates.charge(1, 1).unwrap(), 1);
        assert_eq!(rates.charge(500_000, 500_000).unwrap(), 1);
        assert_eq!(rates.charge(500_000, 500_001).unwrap(), 2);
        assert_eq!(rates.charge(0, 0).unwrap(), 0);
        assert!(rates.charge(-1, 0).is_err());
        assert!(
            TokenRates {
                prompt: i64::MAX,
                completion: i64::MAX
            }
            .charge(i64::MAX, i64::MAX)
            .is_err()
        );
    }
}
