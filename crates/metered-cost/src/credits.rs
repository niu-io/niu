//! Exact arithmetic for branded consumption units. These quantities are not
//! currencies and must not be written into a monetary balance as a substitute.

/// Storage uses signed 64-bit nonnegative atom quantities, never floating point.
pub const ATOMS_PER_CREDIT: i64 = 1_000_000_000;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CreditArithmeticError {
    InvalidRatio,
    InvalidAmount,
    InexactPurchase,
    InvalidRange,
    Overflow,
}

/// Credits per payment-currency unit. Both use a base of one billion atoms.
/// Constructing the ratio reduces it; callers persist the reduced components
/// with the currency and immutable rule revision, not a floating-point rate.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct CreditConversion {
    numerator: i64,
    denominator: i64,
}

impl CreditConversion {
    pub fn new(numerator: i64, denominator: i64) -> Result<Self, CreditArithmeticError> {
        if numerator <= 0 || denominator <= 0 {
            return Err(CreditArithmeticError::InvalidRatio);
        }
        let (mut a, mut b) = (numerator, denominator);
        while b != 0 {
            (a, b) = (b, a % b);
        }
        Ok(Self {
            numerator: numerator / a,
            denominator: denominator / a,
        })
    }

    pub const fn numerator(self) -> i64 {
        self.numerator
    }

    pub const fn denominator(self) -> i64 {
        self.denominator
    }

    /// Purchases must be exact. Processor minor-unit precision is a separate
    /// validation: an integral result here does not qualify a payment amount.
    pub fn purchase_atoms(self, payment_nanos: i64) -> Result<i64, CreditArithmeticError> {
        if payment_nanos <= 0 {
            return Err(CreditArithmeticError::InvalidAmount);
        }
        let product = i128::from(payment_nanos) * i128::from(self.numerator);
        let denominator = i128::from(self.denominator);
        if product % denominator != 0 {
            return Err(CreditArithmeticError::InexactPurchase);
        }
        i64::try_from(product / denominator).map_err(|_| CreditArithmeticError::Overflow)
    }

    /// Explicit tariff-conversion preview only. Publish and pin the returned
    /// rate before use. Do not apply this to a completed monetary charge or
    /// recompute a pinned Credits tariff using a newer purchase rule.
    pub fn tariff_atoms(self, monetary_rate_nanos: i64) -> Result<i64, CreditArithmeticError> {
        if monetary_rate_nanos < 0 {
            return Err(CreditArithmeticError::InvalidAmount);
        }
        let product = i128::from(monetary_rate_nanos) * i128::from(self.numerator);
        let denominator = i128::from(self.denominator);
        let rounded = product / denominator + i128::from(product % denominator != 0);
        i64::try_from(rounded).map_err(|_| CreditArithmeticError::Overflow)
    }
}

/// Monetary backing of an original lot's half-open atom range. Callers must
/// additionally enforce ownership, disjoint allocation and restoration of the
/// original range; this arithmetic function grants no spending authority.
///
/// Telescoping endpoint differences conserve the original backing exactly,
/// including non-divisible lots and partial refunds. Multiplication of two
/// nonnegative i64 values fits in i128 without rounding or saturation.
pub fn credit_range_backing(
    lot_atoms: i64,
    backing_nanos: i64,
    start_atom: i64,
    end_atom: i64,
) -> Result<i64, CreditArithmeticError> {
    if lot_atoms <= 0 || backing_nanos < 0 {
        return Err(CreditArithmeticError::InvalidAmount);
    }
    if start_atom < 0 || end_atom < start_atom || end_atom > lot_atoms {
        return Err(CreditArithmeticError::InvalidRange);
    }
    let backing = i128::from(backing_nanos);
    let atoms = i128::from(lot_atoms);
    let start = backing * i128::from(start_atom) / atoms;
    let end = backing * i128::from(end_atom) / atoms;
    i64::try_from(end - start).map_err(|_| CreditArithmeticError::Overflow)
}
