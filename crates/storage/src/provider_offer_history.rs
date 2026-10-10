//! Supplier-scoped immutable procurement history; never used by customer APIs.
use crate::{Store, StoreError};
use serde_json::Value;
use uuid::Uuid;

impl Store {
    /// One statement snapshot keeps the current pointer, cursor and page coherent.
    pub async fn provider_offer_history(
        &self,
        provider: Uuid,
        offer: Uuid,
        before: Option<Uuid>,
        limit: i64,
    ) -> Result<Option<Value>, StoreError> {
        if !(1..=100).contains(&limit) {
            return Err(StoreError::InvalidPrice);
        }
        let result: Option<(bool, Value)> =
            sqlx::query_as(include_str!("provider_offer_history.sql"))
                .bind(provider)
                .bind(offer)
                .bind(before)
                .bind(limit)
                .fetch_optional(&self.pool)
                .await?;
        match result {
            Some((false, _)) => Err(StoreError::Conflict),
            Some((true, page)) => Ok(Some(page)),
            None => Ok(None),
        }
    }
}
