//! Customer-facing hold inspection, independent from procurement accounting.
use crate::{Store, StoreError};
use serde_json::Value;
use uuid::Uuid;

impl Store {
    /// One statement snapshot per page. A released cursor remains usable because
    /// settlement between reads must not invalidate traversal of older holds.
    pub async fn customer_balance_reservation_page(
        &self,
        organization: Uuid,
        before: Option<Uuid>,
        currency: Option<&str>,
        limit: u32,
    ) -> Result<(Vec<Value>, Option<Uuid>), StoreError> {
        if !(1..=100).contains(&limit)
            || currency.is_some_and(|v| v.len() != 3 || !v.bytes().all(|b| b.is_ascii_uppercase()))
        {
            return Err(StoreError::InvalidPrice);
        }
        let (valid_cursor, rows): (bool, Value) =
            sqlx::query_as(include_str!("balance_reservations.sql"))
                .bind(organization)
                .bind(before)
                .bind(currency)
                .bind(i64::from(limit) + 1)
                .fetch_one(&self.pool)
                .await?;
        if !valid_cursor {
            return Err(StoreError::Conflict);
        }
        let mut entries = rows.as_array().ok_or(StoreError::Conflict)?.clone();
        let next = if entries.len() > limit as usize {
            entries.truncate(limit as usize);
            Some(
                Uuid::parse_str(
                    entries.last().ok_or(StoreError::Conflict)?["attempt_id"]
                        .as_str()
                        .ok_or(StoreError::Conflict)?,
                )
                .map_err(|_| StoreError::Conflict)?,
            )
        } else {
            None
        };
        Ok((entries, next))
    }
}
