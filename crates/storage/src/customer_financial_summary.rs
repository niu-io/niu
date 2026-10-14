//! Platform financial reporting; never expose this aggregate to customer scopes.
use crate::{Store, StoreError};
use serde_json::Value;

impl Store {
    /// One posting-interval snapshot. Non-gift consumption is income, not proof
    /// of cash collection: credit-backed consumption and later repayment differ.
    /// Missing funding allocation leaves total revenue unknown. Known subtotals
    /// remain explicitly partial; gift issuance never creates income.
    pub async fn customer_financial_summary(
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
        // Provenance helpers used by insert triggers are VOLATILE. Keep their
        // reads and the posting aggregates on the same bounded snapshot.
        let mut tx = self.begin_bounded_financial_snapshot().await?;
        let (known, summary): (bool, Value) =
            sqlx::query_as(include_str!("customer_financial_summary.sql"))
                .bind(currency)
                .bind(days)
                .fetch_one(&mut *tx)
                .await?;
        if !known {
            return Err(StoreError::InvalidPrice);
        }
        tx.commit().await?;
        Ok(summary)
    }
}
