//! Customer invoice history; never reads Supplier purchase prices.
use crate::{LedgerHistoryQuery, Store, StoreError, TenantScope};
use serde_json::Value;

impl Store {
    pub async fn customer_invoice_history(
        &self,
        scope: TenantScope,
        query: &LedgerHistoryQuery,
    ) -> Result<Option<Value>, StoreError> {
        let limit = query.validated_limit()?;
        let result: Option<(bool, Value)> =
            sqlx::query_as(include_str!("customer_invoice_history.sql"))
                .bind(scope.organization_id)
                .bind(scope.project_id)
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
