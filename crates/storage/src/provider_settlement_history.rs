//! Supplier payment history and platform-only earning navigation.
//! The HTTP layer keeps request-level earning selection outside Supplier membership.
use crate::{Store, StoreError};
use serde_json::Value;
use uuid::Uuid;

pub type ProviderSettlementQuery = crate::LedgerHistoryQuery;

impl Store {
    pub async fn provider_settlement_history(
        &self,
        provider: Uuid,
        query: &ProviderSettlementQuery,
    ) -> Result<Option<Value>, StoreError> {
        let limit = query.validated_limit()?;
        let result: Option<(bool, Value)> =
            sqlx::query_as(include_str!("provider_settlement_history.sql"))
                .bind(provider)
                .bind(query.before)
                .bind(&query.currency)
                .bind(query.from_ms)
                .bind(query.to_ms)
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
    pub async fn provider_earning_history(
        &self,
        provider: Uuid,
        query: &crate::LedgerHistoryQuery,
    ) -> Result<Option<Value>, StoreError> {
        let limit = query.validated_limit()?;
        let result: Option<(bool, Value)> =
            sqlx::query_as(include_str!("provider_earning_history.sql"))
                .bind(provider)
                .bind(query.before)
                .bind(&query.currency)
                .bind(query.from_ms)
                .bind(query.to_ms)
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
