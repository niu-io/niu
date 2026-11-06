//! One table for every error a database trigger can raise.
//!
//! Triggers communicate failures through SQLSTATE (and, for a few guards, a
//! named constraint). Before this module those strings were matched at each
//! call site, so adding a guard meant finding every ad-hoc check. The tables
//! below are the single mapping from database evidence to [`StoreError`].
//!
//! Keep this file in sync with the schema. `crates/storage/tests/trigger_guards.rs`
//! reads `pg_proc` and fails when a trigger raises a custom code or constraint
//! that is missing here. The invariant text is documentation, not runtime
//! behavior; the database remains the enforcement point.

use crate::StoreError;

/// A custom SQLSTATE raised by a schema function.
pub struct TriggerErrorCode {
    pub code: &'static str,
    /// Constructor for the store-level error. HTTP mapping lives in the gateway.
    pub error: fn() -> StoreError,
    pub meaning: &'static str,
}

/// A named constraint used to disambiguate a generic SQLSTATE (usually 23514).
pub struct TriggerConstraint {
    pub name: &'static str,
    pub error: fn() -> StoreError,
    pub meaning: &'static str,
}

/// Custom SQLSTATE values raised by migrations. `P0001` is the PL/pgSQL default
/// and is deliberately absent: it is not specific enough to classify.
pub const TRIGGER_ERROR_CODES: &[TriggerErrorCode] = &[
    TriggerErrorCode {
        code: "P0005",
        error: || StoreError::Unauthorized,
        meaning: "API key is invalid, revoked, expired or out of scope",
    },
    TriggerErrorCode {
        code: "P0006",
        error: || StoreError::Conflict,
        meaning: "attempt, route or dispatch state changed during the transaction",
    },
    TriggerErrorCode {
        code: "P0007",
        error: || StoreError::AccountUnavailable,
        meaning: "supplier account or offer qualification is unavailable",
    },
    TriggerErrorCode {
        code: "P0008",
        error: || StoreError::BudgetExceeded,
        meaning: "budget or funding is unavailable",
    },
    TriggerErrorCode {
        code: "P0009",
        error: || StoreError::InvalidPrice,
        meaning: "reservation or price does not match the pinned accounting",
    },
    TriggerErrorCode {
        code: "P0010",
        error: || StoreError::Conflict,
        meaning: "guardrail policy rejected dispatch; detail carries rejection metadata",
    },
    TriggerErrorCode {
        code: "P0011",
        error: || StoreError::Conflict,
        meaning: "personal dispatch ownership, policy or accounting changed",
    },
    TriggerErrorCode {
        code: "P0020",
        error: || StoreError::KeyRequestRateExceeded,
        meaning: "API key request rate exhausted",
    },
    TriggerErrorCode {
        code: "P0021",
        error: || StoreError::KeyConcurrencyExceeded,
        meaning: "API key concurrent request limit reached",
    },
    TriggerErrorCode {
        code: "P0022",
        error: || StoreError::KeyTokenRateExceeded,
        meaning: "API key token rate exhausted",
    },
    TriggerErrorCode {
        code: "P0023",
        error: || StoreError::KeyTokenBoundRequired,
        meaning: "token admission requires a bounded input and known prior usage",
    },
    TriggerErrorCode {
        code: "P0024",
        error: || StoreError::ManagedRouteChanged,
        meaning: "managed route, pool or credential binding changed before dispatch",
    },
    TriggerErrorCode {
        code: "P0025",
        error: || StoreError::VendorRequestRateExceeded,
        meaning: "upstream credential request rate exhausted",
    },
    TriggerErrorCode {
        code: "P0026",
        error: || StoreError::KeyRequestRateDisabled,
        meaning: "API key dispatch is disabled by its request-rate policy",
    },
    TriggerErrorCode {
        code: "P0027",
        error: || StoreError::VendorRequestRateDisabled,
        meaning: "upstream credential dispatch is disabled by its request-rate policy",
    },
    TriggerErrorCode {
        code: "P0028",
        error: || StoreError::GatewayRequestDeadlineExceeded,
        meaning: "gateway operation deadline expired before dispatch",
    },
    TriggerErrorCode {
        code: "P0029",
        error: || StoreError::Conflict,
        meaning: "routing registry publication is missing or stale",
    },
    TriggerErrorCode {
        code: "P0039",
        error: || StoreError::ProcurementUnavailable,
        meaning: "platform procurement is unavailable",
    },
    TriggerErrorCode {
        code: "P0040",
        error: || StoreError::Conflict,
        meaning: "customer balance grant correction is not exact and unused",
    },
];

/// Named constraints raised by guard functions. These are the trigger-raised
/// errors that use the generic `23514` SQLSTATE and need their name to classify.
pub const TRIGGER_CONSTRAINTS: &[TriggerConstraint] = &[
    TriggerConstraint {
        name: "customer_account_posted_balance_guard",
        error: || StoreError::Conflict,
        meaning: "posted balance may only be changed by the ledger",
    },
    TriggerConstraint {
        name: "customer_key_spending_limit_exceeded",
        error: || StoreError::KeySpendingLimitExceeded,
        meaning: "API key customer spending limit exceeded",
    },
    TriggerConstraint {
        name: "customer_payment_reference_target",
        error: || StoreError::Conflict,
        meaning: "payment reference already belongs to a different funding target",
    },
    TriggerConstraint {
        name: "customer_unit_key_limit_below_committed",
        error: || StoreError::Conflict,
        meaning: "Credits key limit is below committed liability",
    },
    TriggerConstraint {
        name: "customer_unit_key_limit_migration_required",
        error: || StoreError::Conflict,
        meaning: "monetary key limit requires an explicit Credits limit",
    },
    TriggerConstraint {
        name: "customer_unit_mode_guard",
        error: || StoreError::Conflict,
        meaning: "issuance or mode change does not match the configured billing mode",
    },
    TriggerConstraint {
        name: "customer_unit_workspace_limit_below_committed",
        error: || StoreError::Conflict,
        meaning: "Credits workspace limit is below committed liability",
    },
    TriggerConstraint {
        name: "customer_unit_workspace_limit_migration_required",
        error: || StoreError::Conflict,
        meaning: "monetary workspace limit requires an explicit Credits limit",
    },
    TriggerConstraint {
        name: "customer_workspace_spending_limit_exceeded",
        error: || StoreError::WorkspaceSpendingLimitExceeded,
        meaning: "customer workspace spending limit exceeded",
    },
    TriggerConstraint {
        name: "key_attribution_required_for_bounded_spending",
        error: || StoreError::Conflict,
        meaning: "bounded spending requires key attribution",
    },
    TriggerConstraint {
        name: "media_debit_exceeds_approved_capacity",
        error: || StoreError::BudgetExceeded,
        meaning: "media debit exceeds available approved capacity",
    },
    TriggerConstraint {
        name: "platform_currency_guard",
        error: || StoreError::PlatformCurrencyMismatch,
        meaning: "money row does not use the configured platform currency",
    },
];

pub fn from_code(code: &str) -> Option<StoreError> {
    TRIGGER_ERROR_CODES
        .iter()
        .find(|mapping| mapping.code == code)
        .map(|mapping| (mapping.error)())
}

pub fn from_constraint(name: &str) -> Option<StoreError> {
    TRIGGER_CONSTRAINTS
        .iter()
        .find(|mapping| mapping.name == name)
        .map(|mapping| (mapping.error)())
}

/// Meaning for diagnostics and review tooling. Never includes row data.
pub fn meaning(code: &str) -> Option<&'static str> {
    TRIGGER_ERROR_CODES
        .iter()
        .find(|mapping| mapping.code == code)
        .map(|mapping| mapping.meaning)
}

/// Classify a database error by its named constraint first, then by SQLSTATE.
/// Unknown errors return `None` so the caller decides whether to wrap them.
pub fn classify(error: &sqlx::Error) -> Option<StoreError> {
    let database = error.as_database_error()?;
    if let Some(constraint) = database.constraint()
        && let Some(error) = from_constraint(constraint)
    {
        return Some(error);
    }
    database.code().and_then(|code| from_code(code.as_ref()))
}

/// Map a database error to its store-level meaning, preserving the original
/// error when no trigger mapping applies.
pub fn map(error: sqlx::Error) -> StoreError {
    match classify(&error) {
        Some(error) => error,
        None => StoreError::Database(error),
    }
}
