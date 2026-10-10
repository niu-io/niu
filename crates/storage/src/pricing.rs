use crate::StoreError;

/// Integer currency nanounits per million aggregate input/output tokens.
/// This flat schedule does not independently price cache or reasoning categories;
/// providers with category-specific or additional charges need richer rates.
#[derive(Clone, Copy, Debug)]
pub struct TokenRates {
    pub prompt: i64,
    pub completion: i64,
}

impl TokenRates {
    /// Round the combined exact charge upward once, preserving sub-unit costs.
    pub fn charge(self, prompt: i64, completion: i64) -> Result<i64, StoreError> {
        if [self.prompt, self.completion, prompt, completion]
            .iter()
            .any(|v| *v < 0)
        {
            return Err(StoreError::InvalidPrice);
        }
        let exact = i128::from(prompt) * i128::from(self.prompt)
            + i128::from(completion) * i128::from(self.completion);
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
