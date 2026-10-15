//! Platform financial reporting; never expose this aggregate to customer scopes.
use crate::commercial_position::parse_rfc3339_ms;
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
        self.customer_financial_summary_interval(currency, Some(days), None, None)
            .await
    }

    pub async fn customer_financial_summary_interval(
        &self,
        currency: &str,
        days: Option<i32>,
        from: Option<&str>,
        until: Option<&str>,
    ) -> Result<Value, StoreError> {
        if currency.len() != 3 || !currency.bytes().all(|b| b.is_ascii_uppercase()) {
            return Err(StoreError::InvalidPrice);
        }
        let (days_param, from_ms, until_ms) = match (days, from, until) {
            (_, Some(since_str), Some(end_str)) => {
                let Some(since_ms) = parse_rfc3339_ms(since_str) else {
                    return Err(StoreError::InvalidPrice);
                };
                let Some(end_ms) = parse_rfc3339_ms(end_str) else {
                    return Err(StoreError::InvalidPrice);
                };
                if since_ms < 0 || since_ms >= end_ms || end_ms - since_ms > 370 * 86_400_000 {
                    return Err(StoreError::InvalidPrice);
                }
                (None, Some(since_ms), Some(end_ms))
            }
            (Some(d), None, None) if matches!(d, 7 | 30 | 90) => (Some(d), None, None),
            (None, None, None) => (Some(30), None, None),
            _ => return Err(StoreError::InvalidPrice),
        };
        // Provenance helpers used by insert triggers are VOLATILE. Keep their
        // reads and the posting aggregates on the same bounded snapshot.
        let mut tx = self.begin_bounded_financial_snapshot().await?;
        let (known, summary): (bool, Value) =
            sqlx::query_as(include_str!("customer_financial_summary.sql"))
                .bind(currency)
                .bind(days_param)
                .bind(from_ms)
                .bind(until_ms)
                .fetch_one(&mut *tx)
                .await?;
        if !known {
            return Err(StoreError::InvalidPrice);
        }
        tx.commit().await?;
        Ok(summary)
    }
}
