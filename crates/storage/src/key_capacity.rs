//! Read-only capacity diagnostics across a key's secret-rotation lineage.
use crate::{Store, StoreError, TenantScope};
use serde_json::Value;
use uuid::Uuid;
impl Store {
    /// Includes unresolved concurrency or token reservations, never a release action.
    pub async fn key_capacity_requests(
        &self,
        scope: TenantScope,
        key: Uuid,
        kind: &str,
        after: Option<Uuid>,
        limit: i64,
    ) -> Result<Option<Value>, StoreError> {
        if !matches!(kind, "concurrency" | "tokens") || !(1..=100).contains(&limit) {
            return Err(StoreError::Conflict);
        }
        let mut snapshot = self.begin_bounded_read_snapshot().await?;
        let mut value: Option<Value> = sqlx::query_scalar(include_str!("key_capacity.sql"))
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .bind(key)
            .bind(kind)
            .bind(after)
            .bind(limit)
            .fetch_optional(&mut *snapshot)
            .await?;
        snapshot.commit().await?;
        if let Some(row) = value.as_mut() {
            if row["cursor_valid"] != true {
                return Err(StoreError::Conflict);
            }
            row.as_object_mut()
                .ok_or(StoreError::Conflict)?
                .remove("cursor_valid");
        }
        Ok(value)
    }
}
