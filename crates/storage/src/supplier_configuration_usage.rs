//! Operational traffic for currently owned configurations, independent of offers.
use crate::{Store, StoreError};
use serde_json::Value;
use uuid::Uuid;

impl Store {
    /// A single statement snapshot; model pagination does not truncate totals.
    /// Historical traffic without a persisted managed/media route is not inferred.
    pub async fn supplier_configuration_usage(
        &self,
        supplier: Uuid,
        from_ms: i64,
        to_ms: i64,
        after: Option<&str>,
        limit: u32,
    ) -> Result<Option<Value>, StoreError> {
        if from_ms < 0
            || to_ms > 253_402_300_799_999
            || to_ms
                .checked_sub(from_ms)
                .is_none_or(|span| !(1..=90 * 86_400_000).contains(&span))
            || !(1..=100).contains(&limit)
            || after.is_some_and(|value| value.is_empty() || value.len() > 256)
        {
            return Err(StoreError::InvalidObservation);
        }
        // Bound diagnostic work on a borrowed connection. Transaction-local
        // settings cannot leak into subsequent inference/accounting operations.
        // Pool acquisition and network deadlines remain separate bounds.
        let mut tx = self.pool.begin().await?;
        sqlx::query(
            "SELECT set_config('lock_timeout','250ms',true), set_config('statement_timeout','2s',true)",
        )
        .execute(&mut *tx)
        .await?;
        let (exists, mut result): (bool, Value) =
            sqlx::query_as(include_str!("supplier_configuration_usage.sql"))
                .bind(supplier)
                .bind(from_ms)
                .bind(to_ms)
                .bind(after)
                .bind(i64::from(limit) + 1)
                .fetch_one(&mut *tx)
                .await?;
        tx.commit().await?;
        if !exists {
            return Ok(None);
        }
        let models = result["models"]
            .as_array_mut()
            .ok_or(StoreError::Conflict)?;
        let next = if models.len() > limit as usize {
            models.truncate(limit as usize);
            models.last().ok_or(StoreError::Conflict)?["model"].clone()
        } else {
            Value::Null
        };
        result["next_after"] = next;
        Ok(Some(result))
    }
}
