//! Installation-only commercial projection. Authorization is enforced by the
//! HTTP boundary; no customer or Provider-member handler may reuse this read.
use crate::{Store, StoreError};
use serde_json::Value;

impl Store {
    /// Compare pinned commercial ledgers in one statement snapshot. Known zero
    /// amounts remain zero; absent amounts remain null. Never initiates payment
    /// or changes routing. Customer charges are not external cash receipts.
    pub async fn commercial_position(
        &self,
        currency: &str,
        days: i32,
    ) -> Result<Value, StoreError> {
        if !matches!(days, 7 | 30 | 90)
            || currency.len() != 3
            || !currency.bytes().all(|b| b.is_ascii_uppercase())
        {
            return Err(StoreError::InvalidPrice);
        }
        // Trigger provenance helpers are VOLATILE; a repeatable read keeps
        // their account/source reads consistent with all cohort aggregates.
        let mut tx = self.begin_bounded_financial_snapshot().await?;
        let (known_currency, position): (bool, Value) =
            sqlx::query_as(include_str!("commercial_position.sql"))
                .bind(currency)
                .bind(days)
                .fetch_one(&mut *tx)
                .await?;
        if !known_currency {
            return Err(StoreError::InvalidPrice);
        }
        tx.commit().await?;
        Ok(position)
    }
}
