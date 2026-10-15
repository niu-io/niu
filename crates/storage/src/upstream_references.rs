//! Private provider correlation, never a source of inferred billing quantities.
use crate::{Store, StoreError, TenantScope};
use uuid::Uuid;

impl Store {
    /// Caller must obtain this header from the canonical OpenRouter response
    /// and the model from the resolved route actually dispatched, never a later
    /// registry read or an untrusted response body.
    /// Pin only a dispatched managed attempt. Identical retries are accepted;
    /// neither a conflicting reference nor another attempt can take ownership.
    pub async fn save_openrouter_generation_reference(
        &self,
        scope: TenantScope,
        attempt: Uuid,
        generation: &str,
        upstream_model: &str,
    ) -> Result<(), StoreError> {
        if !(1..=200).contains(&upstream_model.chars().count())
            || !(5..=200).contains(&generation.len())
            || !generation.starts_with("gen-")
            || !generation
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
        {
            return Err(StoreError::InvalidUsage);
        }
        let saved: bool = sqlx::query_scalar(
            r#"
                WITH eligible AS (
                    SELECT a.id
                    FROM attempts a
                    JOIN managed_attempt_routes r ON r.attempt_id = a.id
                    WHERE a.id = $1
                      AND a.organization_id = $2
                      AND a.project_id = $3
                      AND a.dispatched_at IS NOT NULL
                    FOR UPDATE OF a
                ),
                inserted AS (
                    INSERT INTO openrouter_generation_references (
                        attempt_id,
                        generation_id,
                        upstream_model
                    )
                    SELECT id, $4, $5
                    FROM eligible
                    ON CONFLICT DO NOTHING
                    RETURNING attempt_id
                )
                SELECT EXISTS(SELECT 1 FROM inserted)
                    OR (
                        EXISTS(SELECT 1 FROM eligible)
                        AND EXISTS(
                            SELECT 1
                            FROM openrouter_generation_references
                            WHERE attempt_id = $1
                              AND generation_id = $4
                              AND upstream_model = $5
                        )
                    )
            "#,
        )
        .bind(attempt)
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(generation)
        .bind(upstream_model)
        .fetch_one(&self.pool)
        .await?;
        if !saved {
            return Err(StoreError::Conflict);
        }
        Ok(())
    }
}
