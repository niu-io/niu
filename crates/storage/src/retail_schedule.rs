//! Concrete customer selling schedules. Registry identity, effective periods
//! and publication provenance are external; Supplier qualification is separate.
//! Discounts are explicit resulting prices, never runtime multipliers.
use crate::{ContextPriceTier, ContextTierRates, StoreError, TokenRates};
use niu_metered_cost::{Dimensions, Quantity, Rounding, Tariff};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum RetailSchedule {
    Text(TextRetailSchedule),
    Media(MediaRetailSchedule),
}

/// Nanounits per million tokens, plus explicit nanounit fixed charges. A null
/// category means flat ordinary pricing; tiers never inherit category rates.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct TextRetailSchedule {
    pub prompt_rate: String,
    pub completion_rate: String,
    pub cached_prompt_rate: Option<String>,
    pub cache_write_prompt_rate: Option<String>,
    pub reasoning_completion_rate: Option<String>,
    pub minimum_charge_nanos: String,
    pub request_fee_nanos: String,
    pub context_tiers: Vec<ContextPriceTier>,
}

/// Validated integers for inserting existing immutable text price revisions.
#[derive(Clone, Debug)]
pub struct NormalizedTextRetailRates {
    pub ordinary: TokenRates,
    pub cached_prompt: Option<i64>,
    pub cache_write_prompt: Option<i64>,
    pub reasoning_completion: Option<i64>,
    pub minimum_charge_nanos: i64,
    pub request_fee_nanos: i64,
    pub context_tiers: Vec<ContextTierRates>,
}

/// Tariff-compatible media selling terms, without route or offer qualification.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct MediaRetailSchedule {
    pub dimensions: Dimensions,
    pub meter: String,
    pub decimal_places: u8,
    pub amount_units: String,
    pub per_quantity: Quantity,
    pub minimum_quantity: Quantity,
    pub rounding: Rounding,
}

fn parse_fixed(value: &str) -> Result<i64, StoreError> {
    if value.is_empty() || !value.bytes().all(|b| b.is_ascii_digit()) {
        return Err(StoreError::InvalidPrice);
    }
    value.parse().map_err(|_| StoreError::InvalidPrice)
}

fn canonical_rate(value: &mut String) -> Result<(), StoreError> {
    *value = crate::pricing::parse_token_rate(value)?.to_string();
    Ok(())
}

fn canonical_optional(value: &mut Option<String>) -> Result<(), StoreError> {
    if let Some(value) = value {
        canonical_rate(value)?;
    }
    Ok(())
}

fn optional_discount(result: Option<i64>, original: Option<i64>) -> bool {
    match (result, original) {
        (None, None) => true,
        (Some(result), Some(original)) => result <= original,
        _ => false,
    }
}

impl TextRetailSchedule {
    pub fn canonicalize(&mut self) -> Result<(), StoreError> {
        canonical_rate(&mut self.prompt_rate)?;
        canonical_rate(&mut self.completion_rate)?;
        canonical_optional(&mut self.cached_prompt_rate)?;
        canonical_optional(&mut self.cache_write_prompt_rate)?;
        canonical_optional(&mut self.reasoning_completion_rate)?;
        self.minimum_charge_nanos = parse_fixed(&self.minimum_charge_nanos)?.to_string();
        self.request_fee_nanos = parse_fixed(&self.request_fee_nanos)?.to_string();
        crate::normalize_context_tiers(&mut self.context_tiers)?;
        for tier in &mut self.context_tiers {
            canonical_rate(&mut tier.prompt_rate)?;
            canonical_rate(&mut tier.completion_rate)?;
            canonical_optional(&mut tier.cached_prompt_rate)?;
            canonical_optional(&mut tier.cache_write_prompt_rate)?;
            canonical_optional(&mut tier.reasoning_completion_rate)?;
        }
        Ok(())
    }

    pub fn normalized_rates(&self) -> Result<NormalizedTextRetailRates, StoreError> {
        let mut canonical = self.clone();
        canonical.canonicalize()?;
        let optional = |value: &Option<String>| {
            value
                .as_deref()
                .map(crate::pricing::parse_token_rate)
                .transpose()
        };
        Ok(NormalizedTextRetailRates {
            ordinary: TokenRates {
                prompt: crate::pricing::parse_token_rate(&canonical.prompt_rate)?,
                completion: crate::pricing::parse_token_rate(&canonical.completion_rate)?,
            },
            cached_prompt: optional(&canonical.cached_prompt_rate)?,
            cache_write_prompt: optional(&canonical.cache_write_prompt_rate)?,
            reasoning_completion: optional(&canonical.reasoning_completion_rate)?,
            minimum_charge_nanos: parse_fixed(&canonical.minimum_charge_nanos)?,
            request_fee_nanos: parse_fixed(&canonical.request_fee_nanos)?,
            context_tiers: canonical
                .context_tiers
                .iter()
                .map(ContextPriceTier::rates)
                .collect::<Result<_, _>>()?,
        })
    }

    /// Validate the resulting discount against an immutable original schedule.
    /// Optional categories and context thresholds must retain their meaning.
    pub fn validate_discount_from(&self, original: &Self) -> Result<(), StoreError> {
        let result = self.normalized_rates()?;
        let baseline = original.normalized_rates()?;
        let valid_base = result.ordinary.prompt <= baseline.ordinary.prompt
            && result.ordinary.completion <= baseline.ordinary.completion
            && optional_discount(result.cached_prompt, baseline.cached_prompt)
            && optional_discount(result.cache_write_prompt, baseline.cache_write_prompt)
            && optional_discount(result.reasoning_completion, baseline.reasoning_completion)
            && result.minimum_charge_nanos <= baseline.minimum_charge_nanos
            && result.request_fee_nanos <= baseline.request_fee_nanos;
        let valid_tiers = result.context_tiers.len() == baseline.context_tiers.len()
            && result
                .context_tiers
                .iter()
                .zip(&baseline.context_tiers)
                .all(|(result, baseline)| {
                    result.minimum_input_tokens == baseline.minimum_input_tokens
                        && result.ordinary.prompt <= baseline.ordinary.prompt
                        && result.ordinary.completion <= baseline.ordinary.completion
                        && optional_discount(result.cached_prompt, baseline.cached_prompt)
                        && optional_discount(result.cache_write_prompt, baseline.cache_write_prompt)
                        && optional_discount(
                            result.reasoning_completion,
                            baseline.reasoning_completion,
                        )
                });
        if !valid_base || !valid_tiers {
            return Err(StoreError::InvalidPrice);
        }
        Ok(())
    }
}

impl MediaRetailSchedule {
    fn parsed_amount(&self) -> Result<u64, StoreError> {
        if self.amount_units.is_empty()
            || !self.amount_units.bytes().all(|b| b.is_ascii_digit())
            || self.decimal_places > 9
        {
            return Err(StoreError::InvalidPrice);
        }
        self.amount_units
            .parse()
            .map_err(|_| StoreError::InvalidPrice)
    }

    pub fn to_tariff(
        &self,
        revision: &str,
        currency: &str,
        effective_from: i64,
        effective_until: Option<i64>,
    ) -> Result<Tariff, StoreError> {
        let tariff = Tariff {
            revision: revision.into(),
            dimensions: self.dimensions.clone(),
            meter: self.meter.clone(),
            currency: currency.into(),
            decimal_places: self.decimal_places,
            amount_units: self.parsed_amount()?,
            per_quantity: self.per_quantity,
            minimum_quantity: self.minimum_quantity,
            rounding: self.rounding,
            effective_from,
            effective_until,
        };
        tariff.validate().map_err(|_| StoreError::InvalidPrice)?;
        Ok(tariff)
    }

    pub fn canonicalize(&mut self) -> Result<(), StoreError> {
        // Validate payload shape through the same tariff contract; these
        // placeholders are local validation context, never publication identity.
        self.to_tariff("validation", "USD", 0, None)?;
        self.amount_units = self.parsed_amount()?.to_string();
        Ok(())
    }

    pub fn validate_discount_from(&self, original: &Self) -> Result<(), StoreError> {
        self.to_tariff("validation", "USD", 0, None)?;
        original.to_tariff("validation", "USD", 0, None)?;
        if self.dimensions != original.dimensions
            || self.meter != original.meter
            || self.decimal_places != original.decimal_places
            || self.per_quantity != original.per_quantity
            || self.minimum_quantity != original.minimum_quantity
            || self.rounding != original.rounding
            || self.parsed_amount()? > original.parsed_amount()?
        {
            return Err(StoreError::InvalidPrice);
        }
        Ok(())
    }
}

impl RetailSchedule {
    pub fn kind(&self) -> &'static str {
        match self {
            Self::Text(_) => "text",
            Self::Media(_) => "media",
        }
    }

    pub fn dimensions(&self) -> Option<&Dimensions> {
        match self {
            Self::Text(_) => None,
            Self::Media(schedule) => Some(&schedule.dimensions),
        }
    }

    /// Text uses its existing token-category contract rather than a media meter.
    pub fn meter(&self) -> Option<&str> {
        match self {
            Self::Text(_) => None,
            Self::Media(schedule) => Some(&schedule.meter),
        }
    }

    pub fn validate_meter(&self, meter: Option<&str>) -> Result<(), StoreError> {
        self.validate()?;
        if meter != self.meter() {
            return Err(StoreError::InvalidPrice);
        }
        Ok(())
    }

    pub fn canonicalize(&mut self) -> Result<(), StoreError> {
        match self {
            Self::Text(schedule) => schedule.canonicalize(),
            Self::Media(schedule) => schedule.canonicalize(),
        }
    }

    pub fn canonicalized(&self) -> Result<Self, StoreError> {
        let mut schedule = self.clone();
        schedule.canonicalize()?;
        Ok(schedule)
    }

    pub fn validate(&self) -> Result<(), StoreError> {
        self.canonicalized().map(|_| ())
    }

    /// Ensure outer registry identity agrees with the selling schedule. Text
    /// carries no media dimensions; media requires their exact complete match.
    pub fn validate_identity(
        &self,
        model_alias: &str,
        kind: &str,
        dimensions: Option<&Dimensions>,
    ) -> Result<(), StoreError> {
        self.validate()?;
        if model_alias.is_empty()
            || model_alias.len() > 200
            || model_alias != model_alias.trim()
            || model_alias.chars().any(char::is_control)
            || kind != self.kind()
        {
            return Err(StoreError::InvalidPrice);
        }
        match self {
            Self::Text(_) if dimensions.is_none() => Ok(()),
            Self::Media(schedule)
                if schedule.dimensions.model == model_alias
                    && dimensions == Some(&schedule.dimensions) =>
            {
                Ok(())
            }
            _ => Err(StoreError::InvalidPrice),
        }
    }

    pub fn validate_discount_from(&self, original: &Self) -> Result<(), StoreError> {
        match (self, original) {
            (Self::Text(result), Self::Text(original)) => result.validate_discount_from(original),
            (Self::Media(result), Self::Media(original)) => result.validate_discount_from(original),
            _ => Err(StoreError::InvalidPrice),
        }
    }
}
