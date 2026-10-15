//! Mutable actor-owned composition, separate from immutable submission evidence.
use crate::{Store, StoreError, TenantScope};
use serde::Serialize;
use serde_json::Value;

#[derive(Serialize, sqlx::FromRow)]
pub struct VideoComposerDraft {
    pub payload: Option<Value>,
    pub revision: i64,
    pub expires_at_ms: Option<String>,
    pub content_state: String,
}

impl Store {
    /// Expiry is unreadable immediately. The logical revision already reflects
    /// the tombstone that save/maintenance will materialize, without mutating reads.
    pub async fn video_composer_draft(
        &self,
        scope: TenantScope,
        owner: &str,
    ) -> Result<VideoComposerDraft, StoreError> {
        Ok(sqlx::query_as("SELECT CASE WHEN expires_at<=statement_timestamp() THEN NULL ELSE payload END AS payload,revision+CASE WHEN payload IS NOT NULL AND expires_at<=statement_timestamp() THEN 1 ELSE 0 END AS revision,(floor(extract(epoch FROM expires_at)*1000)::bigint)::text AS expires_at_ms,CASE WHEN expires_at<=statement_timestamp() THEN 'expired' WHEN payload IS NULL THEN 'empty' ELSE 'retained' END AS content_state FROM video_composer_drafts WHERE organization_id=$1 AND project_id=$2 AND owner=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(owner)
            .fetch_optional(&self.pool).await?.unwrap_or(VideoComposerDraft {
                payload: None, revision: 0, expires_at_ms: None, content_state: "empty".into(),
            }))
    }

    /// No key authorization, model admission, media inspection or upstream calls.
    /// Scoped IDs are saved context only; unavailable keys/assets confer no action grant.
    pub async fn save_video_composer_draft(
        &self,
        scope: TenantScope,
        owner: &str,
        payload: Option<&Value>,
        expected_revision: i64,
    ) -> Result<VideoComposerDraft, StoreError> {
        if !(0..9_007_199_254_740_990).contains(&expected_revision) {
            return Err(StoreError::Conflict);
        }
        if let Some(payload) = payload
            && !crate::agent_traces::serialized_within_limit(payload, 1_048_576)?
        {
            return Err(StoreError::InvalidObservation);
        }
        let mut tx = self.begin_bounded_recording().await?;
        // Synchronize even updates of an existing row with empty-workspace deletion.
        let project: Option<uuid::Uuid> = sqlx::query_scalar(
            "SELECT id FROM projects WHERE organization_id=$1 AND id=$2 FOR KEY SHARE",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .fetch_optional(&mut *tx)
        .await?;
        if project.is_none() {
            return Err(StoreError::Unauthorized);
        }
        if let Some(payload) = payload {
            let scoped: bool = sqlx::query_scalar("SELECT ($4->>'keyId' IS NULL OR EXISTS(SELECT 1 FROM api_keys WHERE organization_id=$1 AND project_id=$2 AND id=($4->>'keyId')::uuid)) AND ($4->>'sessionId' IS NULL OR EXISTS(SELECT 1 FROM generations_sessions WHERE organization_id=$1 AND project_id=$2 AND owner=$3 AND id=($4->>'sessionId')::uuid)) AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements($4->'references') ref WHERE CASE ref->>'type' WHEN 'provider_asset' THEN NOT EXISTS(SELECT 1 FROM workspace_provider_assets WHERE organization_id=$1 AND project_id=$2 AND id=(ref->'provider_asset'->>'id')::uuid) WHEN 'workspace_asset' THEN NOT EXISTS(SELECT 1 FROM workspace_asset_library WHERE organization_id=$1 AND project_id=$2 AND id=(ref->'workspace_asset'->>'asset_id')::uuid AND media_kind='image') ELSE true END)")
                .bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(payload).fetch_one(&mut *tx).await?;
            if !scoped {
                return Err(StoreError::Unauthorized);
            }
        }
        sqlx::query("UPDATE video_composer_drafts SET payload=NULL,revision=revision+1 WHERE organization_id=$1 AND project_id=$2 AND owner=$3 AND payload IS NOT NULL AND expires_at<=clock_timestamp()")
            .bind(scope.organization_id).bind(scope.project_id).bind(owner).execute(&mut *tx).await?;
        let saved: Option<VideoComposerDraft> = sqlx::query_as("INSERT INTO video_composer_drafts(organization_id,project_id,owner,payload,expires_at) SELECT $1,$2,$3,$4,CASE WHEN $4::jsonb IS NULL THEN NULL ELSE clock_timestamp()+interval '30 days' END WHERE $5=0 OR EXISTS(SELECT 1 FROM video_composer_drafts WHERE organization_id=$1 AND project_id=$2 AND owner=$3) ON CONFLICT(organization_id,project_id,owner) DO UPDATE SET payload=EXCLUDED.payload,expires_at=EXCLUDED.expires_at,revision=video_composer_drafts.revision+1,updated_at=clock_timestamp() WHERE video_composer_drafts.revision=$5 RETURNING payload,revision,(floor(extract(epoch FROM expires_at)*1000)::bigint)::text AS expires_at_ms,CASE WHEN payload IS NULL THEN 'empty' ELSE 'retained' END AS content_state")
            .bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(payload).bind(expected_revision).fetch_optional(&mut *tx).await?;
        let saved = saved.ok_or(StoreError::Conflict)?;
        tx.commit().await?;
        Ok(saved)
    }

    /// Bounded private-content maintenance; tombstones prevent stale recreation.
    pub async fn purge_expired_video_composer_drafts(&self) -> Result<u64, StoreError> {
        self.execute_content_retention("UPDATE video_composer_drafts SET payload=NULL,revision=revision+1 WHERE (organization_id,project_id,owner) IN (SELECT organization_id,project_id,owner FROM video_composer_drafts WHERE payload IS NOT NULL AND expires_at<=clock_timestamp() ORDER BY expires_at,organization_id,project_id,owner LIMIT 500 FOR UPDATE SKIP LOCKED)").await
    }
}
