//! Private provider correlation, never a source of inferred billing quantities.
use crate::{Store, StoreError, TenantScope};
use uuid::Uuid;

impl Store {
    /// Caller must obtain this header from the canonical OpenRouter response.
    /// Pin only a dispatched managed attempt. Identical retries are accepted;
    /// neither a conflicting reference nor another attempt can take ownership.
    pub async fn save_openrouter_generation_reference(
        &self,
        scope: TenantScope,
        attempt: Uuid,
        generation: &str,
    ) -> Result<(), StoreError> {
        if !(5..=200).contains(&generation.len())
            || !generation.starts_with("gen-")
            || !generation
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
        {
            return Err(StoreError::InvalidUsage);
        }
        let mut tx = self.pool.begin().await?;
        let eligible: Option<Uuid> = sqlx::query_scalar(
            "SELECT a.id FROM attempts a JOIN managed_attempt_routes r ON r.attempt_id=a.id \
             WHERE a.id=$1 AND a.organization_id=$2 AND a.project_id=$3 AND a.dispatched_at IS NOT NULL FOR UPDATE OF a",
        ).bind(attempt).bind(scope.organization_id).bind(scope.project_id)
            .fetch_optional(&mut *tx).await?;
        if eligible.is_none() {
            return Err(StoreError::Conflict);
        }
        sqlx::query("INSERT INTO openrouter_generation_references(attempt_id,generation_id) VALUES($1,$2) ON CONFLICT DO NOTHING")
            .bind(attempt).bind(generation).execute(&mut *tx).await?;
        let matches: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM openrouter_generation_references WHERE attempt_id=$1 AND generation_id=$2)")
            .bind(attempt).bind(generation).fetch_one(&mut *tx).await?;
        if !matches {
            return Err(StoreError::Conflict);
        }
        tx.commit().await?;
        Ok(())
    }
}
