//! Shared bounded filters for customer and Supplier ledger history reads.
use crate::StoreError;
use serde::Deserialize;
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LedgerHistoryQuery {
    pub before: Option<Uuid>,
    pub currency: Option<String>,
    pub from_ms: Option<i64>,
    pub to_ms: Option<i64>,
    pub limit: Option<i64>,
}

impl LedgerHistoryQuery {
    pub(crate) fn validated_limit(&self) -> Result<i64, StoreError> {
        let limit = self.limit.unwrap_or(50);
        if !(1..=100).contains(&limit)
            || self.currency.as_ref().is_some_and(|value| {
                value.len() != 3 || !value.bytes().all(|c| c.is_ascii_uppercase())
            })
            || matches!((self.from_ms, self.to_ms), (Some(from), Some(to)) if from >= to)
            || [self.from_ms, self.to_ms]
                .into_iter()
                .flatten()
                .any(|value| !(0..=253402300799999).contains(&value))
        {
            return Err(StoreError::InvalidLedgerHistoryQuery);
        }
        Ok(limit)
    }
}
