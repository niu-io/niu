//! Platform configuration projections; deliberately exclude all customer financial activity.
use crate::{Store, StoreError, TenantScope};
use serde_json::Value;
use uuid::Uuid;

impl Store {
    pub async fn pricing_targets(
        &self,
        after: Option<Uuid>,
        limit: i64,
    ) -> Result<Value, StoreError> {
        if !(1..=100).contains(&limit) {
            return Err(StoreError::InvalidPrice);
        }
        let (valid, page): (bool, Value) = sqlx::query_as(include_str!("pricing_targets.sql"))
            .bind(after)
            .bind(limit)
            .fetch_one(&self.pool)
            .await?;
        if !valid {
            return Err(StoreError::Conflict);
        }
        Ok(page)
    }

    pub async fn platform_customer_tariffs(
        &self,
        scope: TenantScope,
        after: Option<&str>,
        limit: i64,
    ) -> Result<Option<Value>, StoreError> {
        if !(1..=100).contains(&limit) || after.is_some_and(|v| v.is_empty() || v.len() > 200) {
            return Err(StoreError::InvalidPrice);
        }
        let result: Option<(bool, Value)> =
            sqlx::query_as(include_str!("platform_customer_tariffs.sql"))
                .bind(scope.organization_id)
                .bind(scope.project_id)
                .bind(after)
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
