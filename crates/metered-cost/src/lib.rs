//! Exact pricing for explicitly named media meters. No currency conversions or
//! inferred Provider defaults. Callers persist the selected tariff and receipt.

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MeterError {
    InvalidQuantity,
    InvalidSpecification,
    Overflow,
    InvalidTariff,
    NoMatchingTariff,
    AmbiguousTariff,
    MeterMismatch,
    UnresolvedUsage,
    InvalidDiscount,
    AmbiguousDiscount,
    TooManyDiscounts,
    InvalidSnapshot,
}

/// A nonnegative rational quantity. Reduced at construction; no floating point.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Quantity {
    numerator: u128,
    denominator: u128,
}

impl serde::Serialize for Quantity {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut record = serializer.serialize_struct("Quantity", 2)?;
        record.serialize_field("numerator", &self.numerator.to_string())?;
        record.serialize_field("denominator", &self.denominator.to_string())?;
        record.end()
    }
}

impl<'de> serde::Deserialize<'de> for Quantity {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        #[derive(serde::Deserialize)]
        #[serde(deny_unknown_fields)]
        struct Record {
            numerator: String,
            denominator: String,
        }
        let record = Record::deserialize(deserializer)?;
        let parse = |text: &str| -> Result<u128, D::Error> {
            if text.is_empty()
                || text.len() > 39
                || !text.bytes().all(|b| b.is_ascii_digit())
                || (text.len() > 1 && text.starts_with('0'))
            {
                return Err(serde::de::Error::custom("invalid exact quantity"));
            }
            text.parse()
                .map_err(|_| serde::de::Error::custom("quantity overflow"))
        };
        let numerator = parse(&record.numerator)?;
        let denominator = parse(&record.denominator)?;
        let quantity = Self::new(numerator, denominator)
            .map_err(|_| serde::de::Error::custom("invalid quantity denominator"))?;
        if quantity.numerator != numerator || quantity.denominator != denominator {
            return Err(serde::de::Error::custom("quantity must be reduced"));
        }
        Ok(quantity)
    }
}

fn gcd(mut a: u128, mut b: u128) -> u128 {
    while b != 0 {
        (a, b) = (b, a % b);
    }
    a
}

impl Quantity {
    pub fn new(numerator: u128, denominator: u128) -> Result<Self, MeterError> {
        if denominator == 0 {
            return Err(MeterError::InvalidQuantity);
        }
        let divisor = gcd(numerator, denominator);
        Ok(Self {
            numerator: numerator / divisor,
            denominator: denominator / divisor,
        })
    }

    pub const fn integer(value: u128) -> Self {
        Self {
            numerator: value,
            denominator: 1,
        }
    }

    pub const fn numerator(self) -> u128 {
        self.numerator
    }
    pub const fn denominator(self) -> u128 {
        self.denominator
    }

    fn multiply(self, other: Self) -> Result<Self, MeterError> {
        let left = gcd(self.numerator, other.denominator);
        let right = gcd(other.numerator, self.denominator);
        Self::new(
            (self.numerator / left)
                .checked_mul(other.numerator / right)
                .ok_or(MeterError::Overflow)?,
            (self.denominator / right)
                .checked_mul(other.denominator / left)
                .ok_or(MeterError::Overflow)?,
        )
    }

    fn add(self, other: Self) -> Result<Self, MeterError> {
        let common = gcd(self.denominator, other.denominator);
        let left = self
            .numerator
            .checked_mul(other.denominator / common)
            .ok_or(MeterError::Overflow)?;
        let right = other
            .numerator
            .checked_mul(self.denominator / common)
            .ok_or(MeterError::Overflow)?;
        Self::new(
            left.checked_add(right).ok_or(MeterError::Overflow)?,
            self.denominator
                .checked_mul(other.denominator / common)
                .ok_or(MeterError::Overflow)?,
        )
    }

    fn max(self, other: Self) -> Result<Self, MeterError> {
        let common = gcd(self.denominator, other.denominator);
        let left = self
            .numerator
            .checked_mul(other.denominator / common)
            .ok_or(MeterError::Overflow)?;
        let right = other
            .numerator
            .checked_mul(self.denominator / common)
            .ok_or(MeterError::Overflow)?;
        Ok(if left >= right { self } else { other })
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, serde::Serialize)]
pub enum Provenance {
    Estimate,
    Reported,
}

/// An absent/conflicting upstream quantity is not a free operation.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Usage {
    Known {
        meter: String,
        quantity: Quantity,
        provenance: Provenance,
    },
    Unresolved,
}

/// Seedance's documented token estimate, not a qualified request schema.
/// Reference duration is included once; actual usage comes from the task query.
pub fn seedance_estimate(
    output_seconds: Quantity,
    reference_video_seconds: Quantity,
    width: u32,
    height: u32,
    frames_per_second: Quantity,
) -> Result<Usage, MeterError> {
    if output_seconds.numerator == 0
        || width == 0
        || height == 0
        || frames_per_second.numerator == 0
    {
        return Err(MeterError::InvalidSpecification);
    }
    let quantity = output_seconds
        .add(reference_video_seconds)?
        .multiply(Quantity::integer(u128::from(width)))?
        .multiply(Quantity::integer(u128::from(height)))?
        .multiply(frames_per_second)?
        .multiply(Quantity::new(1, 1024)?)?;
    Ok(Usage::Known {
        meter: "video_tokens".into(),
        quantity,
        provenance: Provenance::Estimate,
    })
}

#[derive(Clone, Debug, Eq, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Dimensions {
    pub model: String,
    pub channel: String,
    pub resolution: String,
    pub reference_video: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, serde::Serialize, serde::Deserialize)]
pub enum Rounding {
    Down,
    Up,
    HalfEven,
}

/// Amount is in the currency's declared smallest accounting units, not dollars.
/// Minimum is a floor on total quantity, not an additive surcharge. An adapter
/// must explicitly supply a zero minimum when upstream usage already includes it.
#[derive(Clone, Debug, Eq, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Tariff {
    pub revision: String,
    pub dimensions: Dimensions,
    pub meter: String,
    pub currency: String,
    pub decimal_places: u8,
    pub amount_units: u64,
    pub per_quantity: Quantity,
    pub minimum_quantity: Quantity,
    pub rounding: Rounding,
    pub effective_from: i64,
    pub effective_until: Option<i64>,
}

impl Tariff {
    pub fn validate(&self) -> Result<(), MeterError> {
        let names = [
            &self.revision,
            &self.dimensions.model,
            &self.dimensions.channel,
            &self.dimensions.resolution,
            &self.meter,
        ];
        if names.iter().any(|name| {
            name.is_empty()
                || name.len() > 256
                || name.trim() != name.as_str()
                || name.chars().any(char::is_control)
        }) || self.currency.len() != 3
            || !self.currency.bytes().all(|b| b.is_ascii_uppercase())
            || self.decimal_places > 18
            || self.per_quantity.numerator == 0
            || self
                .effective_until
                .is_some_and(|end| end <= self.effective_from)
        {
            return Err(MeterError::InvalidTariff);
        }
        Ok(())
    }
}

/// Exact matching only. Overlapping cards fail rather than guessing precedence.
pub fn select_tariff<'a>(
    tariffs: &'a [Tariff],
    dimensions: &Dimensions,
    at: i64,
) -> Result<&'a Tariff, MeterError> {
    let mut selected = None;
    for tariff in tariffs {
        tariff.validate()?;
        if tariff.dimensions == *dimensions
            && at >= tariff.effective_from
            && tariff.effective_until.is_none_or(|end| at < end)
        {
            if selected.is_some() {
                return Err(MeterError::AmbiguousTariff);
            }
            selected = Some(tariff);
        }
    }
    selected.ok_or(MeterError::NoMatchingTariff)
}

/// Pure calculation receipt; it neither debits nor reserves an account. Clone
/// the full tariff alongside this receipt to reproduce historical calculations.
#[derive(Clone, Debug, Eq, PartialEq, serde::Serialize)]
pub struct Receipt {
    pub tariff_revision: String,
    pub meter: String,
    pub measured_quantity: Quantity,
    pub billable_quantity: Quantity,
    pub provenance: Provenance,
    pub currency: String,
    pub decimal_places: u8,
    pub amount_units: u64,
    pub discount_revisions: Vec<String>,
}

pub fn calculate(tariff: &Tariff, usage: &Usage) -> Result<Receipt, MeterError> {
    calculate_adjusted(tariff, usage, Quantity::integer(1), Vec::new())
}

fn calculate_adjusted(
    tariff: &Tariff,
    usage: &Usage,
    multiplier: Quantity,
    discount_revisions: Vec<String>,
) -> Result<Receipt, MeterError> {
    tariff.validate()?;
    let Usage::Known {
        meter,
        quantity,
        provenance,
    } = usage
    else {
        return Err(MeterError::UnresolvedUsage);
    };
    if *meter != tariff.meter {
        return Err(MeterError::MeterMismatch);
    }
    let billable = quantity.max(tariff.minimum_quantity)?;
    let exact = billable
        .multiply(Quantity::new(
            tariff.per_quantity.denominator,
            tariff.per_quantity.numerator,
        )?)?
        .multiply(Quantity::integer(u128::from(tariff.amount_units)))?
        .multiply(multiplier)?;
    let quotient = exact.numerator / exact.denominator;
    let remainder = exact.numerator % exact.denominator;
    // Compare remainder to its complement, avoiding an overflowing doubled remainder.
    let increment = match tariff.rounding {
        Rounding::Down => false,
        Rounding::Up => remainder != 0,
        Rounding::HalfEven => {
            remainder > exact.denominator - remainder
                || (remainder == exact.denominator - remainder && quotient % 2 == 1)
        }
    };
    let amount = quotient
        .checked_add(u128::from(increment))
        .ok_or(MeterError::Overflow)?;
    Ok(Receipt {
        tariff_revision: tariff.revision.clone(),
        meter: meter.clone(),
        measured_quantity: *quantity,
        billable_quantity: billable,
        provenance: *provenance,
        currency: tariff.currency.clone(),
        decimal_places: tariff.decimal_places,
        amount_units: u64::try_from(amount).map_err(|_| MeterError::Overflow)?,
        discount_revisions,
    })
}

/// Higher priority wins. An exclusive highest-priority rule applies alone.
/// Otherwise eligible stackable rules multiply in descending priority; lower
/// exclusive rules are ignored. Equal eligible priorities are rejected.
#[derive(Clone, Copy, Debug, Eq, PartialEq, serde::Serialize, serde::Deserialize)]
pub enum Stacking {
    Exclusive,
    Multiply,
}

#[derive(Clone, Debug, Eq, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Discount {
    pub revision: String,
    /// None explicitly means all configured tariff dimensions.
    pub dimensions: Option<Dimensions>,
    pub offer: Option<String>,
    pub customer: Option<String>,
    pub effective_from: i64,
    pub effective_until: Option<i64>,
    pub priority: i32,
    pub stacking: Stacking,
    /// Remaining price fraction: 4/5 means 20% off. Zero is an explicit free rule.
    pub multiplier: Quantity,
}

pub struct PricingContext<'a> {
    pub dimensions: &'a Dimensions,
    pub offer: &'a str,
    pub customer: &'a str,
    pub at: i64,
}

fn valid_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 256
        && name.trim() == name
        && !name.chars().any(char::is_control)
}

impl Discount {
    pub fn validate(&self) -> Result<(), MeterError> {
        if !valid_name(&self.revision)
            || self.offer.as_deref().is_some_and(|name| !valid_name(name))
            || self
                .customer
                .as_deref()
                .is_some_and(|name| !valid_name(name))
            || self.dimensions.as_ref().is_some_and(|d| {
                [&d.model, &d.channel, &d.resolution]
                    .iter()
                    .any(|name| !valid_name(name))
            })
            || self
                .effective_until
                .is_some_and(|end| end <= self.effective_from)
            || self.multiplier.numerator > self.multiplier.denominator
        {
            return Err(MeterError::InvalidDiscount);
        }
        Ok(())
    }

    fn matches(&self, context: &PricingContext<'_>) -> bool {
        self.dimensions
            .as_ref()
            .is_none_or(|d| d == context.dimensions)
            && self
                .offer
                .as_deref()
                .is_none_or(|offer| offer == context.offer)
            && self
                .customer
                .as_deref()
                .is_none_or(|customer| customer == context.customer)
            && context.at >= self.effective_from
            && self.effective_until.is_none_or(|end| context.at < end)
    }
}

/// Owned, immutable calculation inputs, separate from mutable active cards.
/// Persistence and customer/Supplier authorization are integration obligations.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PricingSnapshot {
    tariff: Tariff,
    discounts: Vec<Discount>,
    multiplier: Quantity,
    selected_at: i64,
    offer: String,
    customer: String,
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct SnapshotRecord {
    version: u8,
    tariff: Tariff,
    discounts: Vec<Discount>,
    selected_at: i64,
    offer: String,
    customer: String,
}

impl PricingSnapshot {
    pub fn offer(&self) -> &str {
        &self.offer
    }
    pub fn customer(&self) -> &str {
        &self.customer
    }

    /// Versioned internal persistence document; not a customer API response.
    pub fn encode(&self) -> Result<String, MeterError> {
        let record = SnapshotRecord {
            version: 1,
            tariff: self.tariff.clone(),
            discounts: self.discounts.clone(),
            selected_at: self.selected_at,
            offer: self.offer.clone(),
            customer: self.customer.clone(),
        };
        let encoded = serde_json::to_string(&record).map_err(|_| MeterError::InvalidSnapshot)?;
        if encoded.len() > 131072 {
            return Err(MeterError::InvalidSnapshot);
        }
        Ok(encoded)
    }

    /// Revalidates cards/rules and recomputes the multiplier; persisted data
    /// cannot inject an unchecked effective multiplier or silently lose fields.
    pub fn decode(encoded: &str) -> Result<Self, MeterError> {
        if encoded.len() > 131072 {
            return Err(MeterError::InvalidSnapshot);
        }
        let record: SnapshotRecord =
            serde_json::from_str(encoded).map_err(|_| MeterError::InvalidSnapshot)?;
        if record.version != 1 {
            return Err(MeterError::InvalidSnapshot);
        }
        let snapshot = pin_pricing(
            std::slice::from_ref(&record.tariff),
            &record.discounts,
            &PricingContext {
                dimensions: &record.tariff.dimensions,
                offer: &record.offer,
                customer: &record.customer,
                at: record.selected_at,
            },
        )
        .map_err(|_| MeterError::InvalidSnapshot)?;
        if snapshot.discounts != record.discounts {
            return Err(MeterError::InvalidSnapshot);
        }
        Ok(snapshot)
    }
    pub fn tariff(&self) -> &Tariff {
        &self.tariff
    }
    pub fn discounts(&self) -> &[Discount] {
        &self.discounts
    }
    pub fn selected_at(&self) -> i64 {
        self.selected_at
    }

    pub fn calculate(&self, usage: &Usage) -> Result<Receipt, MeterError> {
        calculate_adjusted(
            &self.tariff,
            usage,
            self.multiplier,
            self.discounts.iter().map(|d| d.revision.clone()).collect(),
        )
    }
}

pub fn pin_pricing(
    tariffs: &[Tariff],
    discounts: &[Discount],
    context: &PricingContext<'_>,
) -> Result<PricingSnapshot, MeterError> {
    if discounts.len() > 64 {
        return Err(MeterError::TooManyDiscounts);
    }
    if !valid_name(context.offer) || !valid_name(context.customer) {
        return Err(MeterError::InvalidDiscount);
    }
    let tariff = select_tariff(tariffs, context.dimensions, context.at)?.clone();
    let mut eligible = Vec::new();
    for (index, discount) in discounts.iter().enumerate() {
        discount.validate()?;
        if discounts[..index]
            .iter()
            .any(|d| d.revision == discount.revision)
        {
            return Err(MeterError::InvalidDiscount);
        }
        if discount.matches(context) {
            eligible.push(discount.clone());
        }
    }
    eligible.sort_by_key(|rule| std::cmp::Reverse(rule.priority));
    if eligible
        .windows(2)
        .any(|pair| pair[0].priority == pair[1].priority)
    {
        return Err(MeterError::AmbiguousDiscount);
    }
    if eligible
        .first()
        .is_some_and(|d| d.stacking == Stacking::Exclusive)
    {
        eligible.truncate(1);
    } else {
        eligible.retain(|d| d.stacking == Stacking::Multiply);
    }
    let mut multiplier = Quantity::integer(1);
    for discount in &eligible {
        multiplier = multiplier.multiply(discount.multiplier)?;
    }
    Ok(PricingSnapshot {
        tariff,
        discounts: eligible,
        multiplier,
        selected_at: context.at,
        offer: context.offer.into(),
        customer: context.customer.into(),
    })
}
