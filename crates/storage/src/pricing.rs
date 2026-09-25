use crate::StoreError;

/// Integer currency nanounits per million tokens. This initial schedule covers
/// uncached text tokens only; providers with additional charges need richer rates.
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
