//! Full Supplier payment history without customer or request-level information.
use crate::{Store, StoreError};
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProviderSettlementQuery {
    pub before: Option<Uuid>,
    pub currency: Option<String>,
    pub from_ms: Option<i64>,
    pub to_ms: Option<i64>,
    pub limit: Option<i64>,
}

impl Store {
    pub async fn provider_settlement_history(
        &self,
        provider: Uuid,
        query: &ProviderSettlementQuery,
    ) -> Result<Option<Value>, StoreError> {
        let limit = query.limit.unwrap_or(50);
        if !(1..=100).contains(&limit)
            || query.currency.as_ref().is_some_and(|value| {
                value.len() != 3 || !value.bytes().all(|c| c.is_ascii_uppercase())
            })
            || matches!((query.from_ms, query.to_ms), (Some(from), Some(to)) if from >= to)
            || [query.from_ms, query.to_ms]
                .into_iter()
                .flatten()
                .any(|value| !(0..=253402300799999).contains(&value))
        {
            return Err(StoreError::InvalidSupplierHistoryQuery);
        }
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
