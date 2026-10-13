//! Original-key resolution for explicit actions, separate from saved-history reads.
use crate::{Store, StoreError, TenantScope};
use uuid::Uuid;

impl Store {
    /// Resolve only a dispatched workspace task visible to this actor. Never
    /// choose a replacement key or reinterpret the saved route from live settings.
    /// The gateway must independently authorize the returned key's current grants.
    pub async fn generations_task_action_key(
        &self,
        scope: TenantScope,
        owner: &str,
        task: Uuid,
    ) -> Result<Option<Uuid>, StoreError> {
        let mut tx = self.begin_bounded_read_snapshot().await?;
        let key = sqlx::query_scalar(
            "SELECT a.api_key_id FROM attempts a JOIN media_recovery_routes r ON r.attempt_id=a.id \
             WHERE a.organization_id=$1 AND a.project_id=$2 AND a.id=$3 AND a.dispatched_at IS NOT NULL AND a.api_key_id IS NOT NULL \
             AND NOT EXISTS(SELECT 1 FROM generations_turn_tasks t WHERE t.task_id=a.id AND t.owner<>$4) \
             AND NOT EXISTS(SELECT 1 FROM video_submission_intents vi JOIN media_submission_keys sk \
             ON sk.organization_id=vi.organization_id AND sk.project_id=vi.project_id \
             AND sk.key_digest=sha256(convert_to(vi.submission_key::text,'UTF8')) \
             WHERE sk.attempt_id=a.id AND vi.organization_id=a.organization_id \
             AND vi.project_id=a.project_id AND vi.owner<>$4)",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(task)
        .bind(owner)
        .fetch_optional(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(key)
    }
}
