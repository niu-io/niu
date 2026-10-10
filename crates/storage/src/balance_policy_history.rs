//! Customer-safe, same-snapshot history of approved credit and warning policy.
use crate::{Store, StoreError};
use serde_json::Value;
use uuid::Uuid;

impl Store {
    pub async fn customer_balance_policy_history(
        &self,
        organization: Uuid,
        currency: &str,
        before: Option<i64>,
        limit: i64,
    ) -> Result<Option<Value>, StoreError> {
        if currency.len() != 3
            || !currency.bytes().all(|b| b.is_ascii_uppercase())
            || before.is_some_and(|v| v < 1)
            || !(1..=100).contains(&limit)
        {
            return Err(StoreError::InvalidPrice);
        }
        let row: Option<(bool, Value)> = sqlx::query_as(include_str!("balance_policy_history.sql"))
            .bind(organization)
            .bind(currency)
            .bind(before)
            .bind(limit)
            .fetch_optional(&self.pool)
            .await?;
        match row {
            Some((false, _)) => Err(StoreError::Conflict),
            Some((true, value)) => Ok(Some(value)),
            None => Ok(None),
        }
    }
}
