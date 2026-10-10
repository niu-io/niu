//! Customer-only immutable tariff history; no procurement joins or writes.
use crate::{Store, StoreError, TenantScope};
use serde_json::Value;
use uuid::Uuid;

impl Store {
    /// One statement snapshot keeps the current pointer, cursor and page coherent.
    pub async fn customer_tariff_history(
        &self,
        scope: TenantScope,
        model: &str,
        before: Option<Uuid>,
        limit: i64,
    ) -> Result<Option<Value>, StoreError> {
        if model.is_empty() || model.len() > 200 || !(1..=100).contains(&limit) {
            return Err(StoreError::InvalidPrice);
        }
        let result: Option<(bool, Value)> =
            sqlx::query_as(include_str!("customer_tariff_history.sql"))
                .bind(scope.organization_id)
                .bind(scope.project_id)
                .bind(model)
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
