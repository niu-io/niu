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

impl Store {
    pub async fn provider_offer_page(
        &self,
        provider: Uuid,
        after: Option<&str>,
        limit: i64,
    ) -> Result<Option<Value>, StoreError> {
        if !(1..=100).contains(&limit)
            || after.is_some_and(|s| {
                s.trim().is_empty()
                    || s.trim() != s
                    || s.chars().count() > 200
                    || s.chars().any(char::is_control)
            })
        {
            return Err(StoreError::InvalidSupplierHistoryQuery);
        }
        read_offer_page(&mut *self.pool.acquire().await?, provider, after, limit).await
    }
}

// The dashboard and the public page use the same projection and snapshot rules.
// The dashboard calls this on its existing repeatable-read transaction.
pub(crate) async fn read_offer_page(
    connection: &mut sqlx::PgConnection,
    provider: Uuid,
    after: Option<&str>,
    limit: i64,
) -> Result<Option<Value>, StoreError> {
    let result: Option<(bool, Value)> = sqlx::query_as(include_str!("provider_offer_page.sql"))
        .bind(provider)
        .bind(after)
        .bind(limit)
        .fetch_optional(connection)
        .await?;
    match result {
        Some((false, _)) => Err(StoreError::Conflict),
        Some((true, page)) => Ok(Some(page)),
        None => Ok(None),
    }
}
