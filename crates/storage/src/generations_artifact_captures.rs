//! Explicit retained-byte promotion, using the existing quota and encrypted library.
//! Claims survive response loss; leases never cause autonomous retrieval or inference.
use crate::{
    AssetLibraryCreate, AssetLibraryKind, AssetLibraryLimits, Store, StoreError, TenantScope,
};
use serde::Serialize;
use sqlx::{PgConnection, Row};
use uuid::Uuid;

pub struct GenerationArtifactCaptureRequest<'a> {
    pub id: Uuid,
    pub name: &'a str,
    pub mode: &'a str,
    pub key_id: Option<Uuid>,
}
#[derive(Serialize)]
pub struct GenerationArtifactCapture {
    pub id: Uuid,
    pub task_id: Uuid,
    pub kind: String,
    pub status: String,
    pub asset_id: Option<Uuid>,
    pub availability: String,
    pub failure_code: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}
/// A private transport claim. Never serialize its lease token to customer responses.
pub struct GenerationArtifactCaptureClaim {
    pub capture: GenerationArtifactCapture,
    pub lease_token: Option<Uuid>,
}
/// Server-only identity for completing the currently leased capture attempt.
pub struct GenerationArtifactCaptureLease {
    pub id: Uuid,
    pub token: Uuid,
}
const FIELDS: &str = "c.id,c.task_id,c.kind,c.state,c.asset_id,c.failure_category,to_jsonb(c.created_at)#>>'{}' AS created_at,to_jsonb(c.updated_at)#>>'{}' AS updated_at,CASE WHEN c.state<>'stored' THEN 'not_stored' WHEN a.deleted_at IS NOT NULL THEN 'deleted' ELSE 'retained' END AS availability";
async fn capture_on(
    conn: &mut PgConnection,
    scope: TenantScope,
    id: Uuid,
) -> Result<GenerationArtifactCapture, StoreError> {
    let row=sqlx::query(&format!("SELECT {FIELDS} FROM generations_artifact_captures c LEFT JOIN workspace_asset_library a ON a.id=c.asset_id WHERE c.organization_id=$1 AND c.project_id=$2 AND c.id=$3"))
 .bind(scope.organization_id).bind(scope.project_id).bind(id).fetch_optional(conn).await?.ok_or(StoreError::Conflict)?;
    Ok(GenerationArtifactCapture {
        id: row.try_get("id")?,
        task_id: row.try_get("task_id")?,
        kind: row.try_get("kind")?,
        status: row.try_get("state")?,
        asset_id: row.try_get("asset_id")?,
        availability: row.try_get("availability")?,
        failure_code: row.try_get("failure_category")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}
async fn visible_locked(
    conn: &mut PgConnection,
    scope: TenantScope,
    actor: &str,
    task: Uuid,
) -> Result<(), StoreError> {
    if actor.is_empty() || actor.len() > 200 || actor.chars().any(char::is_control) {
        return Err(StoreError::InvalidObservation);
    }
    // Association writers take this same row lock: no ownership check/commit race.
    let exists:Option<Uuid>=sqlx::query_scalar("SELECT id FROM attempts WHERE organization_id=$1 AND project_id=$2 AND id=$3 AND dispatched_at IS NOT NULL AND EXISTS(SELECT 1 FROM media_recovery_routes WHERE attempt_id=$3) FOR UPDATE")
 .bind(scope.organization_id).bind(scope.project_id).bind(task).fetch_optional(&mut *conn).await?;
    if exists.is_none() {
        return Err(StoreError::Conflict);
    }
    let visible:bool=sqlx::query_scalar("SELECT NOT EXISTS(SELECT 1 FROM generations_turn_tasks WHERE task_id=$3 AND owner<>$4) AND NOT EXISTS(SELECT 1 FROM video_submission_intents vi JOIN media_submission_keys sk ON sk.organization_id=vi.organization_id AND sk.project_id=vi.project_id AND sk.key_digest=niu_submission_key_digest(vi.submission_key) WHERE sk.attempt_id=$3 AND vi.organization_id=$1 AND vi.project_id=$2 AND vi.owner<>$4)")
 .bind(scope.organization_id).bind(scope.project_id).bind(task).bind(actor).fetch_one(&mut *conn).await?;
    if !visible {
        return Err(StoreError::Conflict);
    }
    Ok(())
}
impl Store {
    /// Saved claim reads are actor-visible metadata only, with no retrieval or retry.
    pub async fn generation_artifact_capture(
        &self,
        scope: TenantScope,
        actor: &str,
        task: Uuid,
        kind: &str,
    ) -> Result<Option<GenerationArtifactCapture>, StoreError> {
        if !["video", "last_frame"].contains(&kind) {
            return Err(StoreError::InvalidObservation);
        }
        let mut tx = self.begin_bounded_read_snapshot().await?;
        let visible: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM attempts a WHERE a.organization_id=$1 AND a.project_id=$2 AND a.id=$3 AND a.dispatched_at IS NOT NULL AND EXISTS(SELECT 1 FROM media_recovery_routes WHERE attempt_id=$3) AND NOT EXISTS(SELECT 1 FROM generations_turn_tasks WHERE task_id=$3 AND owner<>$4) AND NOT EXISTS(SELECT 1 FROM video_submission_intents vi JOIN media_submission_keys sk ON sk.organization_id=vi.organization_id AND sk.project_id=vi.project_id AND sk.key_digest=niu_submission_key_digest(vi.submission_key) WHERE sk.attempt_id=$3 AND vi.organization_id=$1 AND vi.project_id=$2 AND vi.owner<>$4))")
            .bind(scope.organization_id).bind(scope.project_id).bind(task).bind(actor).fetch_one(&mut *tx).await?;
        if !visible {
            tx.commit().await?;
            return Ok(None);
        }
        let id: Option<Uuid> = sqlx::query_scalar("SELECT id FROM generations_artifact_captures WHERE organization_id=$1 AND project_id=$2 AND task_id=$3 AND kind=$4 ORDER BY CASE WHEN state IN ('stored','preparing') THEN 0 ELSE 1 END,created_at DESC,id DESC LIMIT 1")
            .bind(scope.organization_id).bind(scope.project_id).bind(task).bind(kind).fetch_optional(&mut *tx).await?;
        let result = match id {
            Some(id) => Some(capture_on(&mut tx, scope, id).await?),
            None => None,
        };
        tx.commit().await?;
        Ok(result)
    }

    pub async fn prepare_generation_artifact_capture(
        &self,
        scope: TenantScope,
        actor: &str,
        task: Uuid,
        kind: &str,
        request: GenerationArtifactCaptureRequest<'_>,
    ) -> Result<GenerationArtifactCaptureClaim, StoreError> {
        let name = request.name.trim();
        if request.id.is_nil()
            || !["video", "last_frame"].contains(&kind)
            || name != request.name
            || name.is_empty()
            || name.len() > 200
            || name.chars().any(char::is_control)
            || !["cached", "fresh"].contains(&request.mode)
            || (request.mode == "cached" && request.key_id.is_some())
        {
            return Err(StoreError::InvalidObservation);
        }
        let mut tx = self.begin_bounded_recording().await?;
        visible_locked(&mut tx, scope, actor, task).await?;
        // Validate an existing request identity before source deduplication.
        // A failed immutable request can be retried, or a new explicit request
        // can choose another delivery mode/key without erasing the failed record.
        let previous = sqlx::query("SELECT organization_id,project_id,task_id,kind,owner,name,mode,key_id,state FROM generations_artifact_captures WHERE id=$1 FOR UPDATE")
            .bind(request.id).fetch_optional(&mut *tx).await?;
        if let Some(row) = &previous
            && (row.try_get::<Uuid, _>("organization_id")? != scope.organization_id
                || row.try_get::<Uuid, _>("project_id")? != scope.project_id
                || row.try_get::<Uuid, _>("task_id")? != task
                || row.try_get::<String, _>("kind")? != kind
                || row.try_get::<String, _>("owner")? != actor
                || row.try_get::<String, _>("name")? != name
                || row.try_get::<String, _>("mode")? != request.mode
                || row.try_get::<Option<Uuid>, _>("key_id")? != request.key_id)
        {
            return Err(StoreError::Conflict);
        }
        let active = sqlx::query("SELECT id,state,lease_expires_at>clock_timestamp() AS leased FROM generations_artifact_captures WHERE organization_id=$1 AND project_id=$2 AND task_id=$3 AND kind=$4 AND state IN ('preparing','stored') FOR UPDATE")
            .bind(scope.organization_id).bind(scope.project_id).bind(task).bind(kind).fetch_optional(&mut *tx).await?;
        if let Some(row) = active {
            let active_id: Uuid = row.try_get("id")?;
            if row.try_get::<String, _>("state")? == "stored" {
                let capture = capture_on(&mut tx, scope, active_id).await?;
                tx.commit().await?;
                return Ok(GenerationArtifactCaptureClaim {
                    capture,
                    lease_token: None,
                });
            }
            if row.try_get::<Option<bool>, _>("leased")? == Some(true) {
                return Err(StoreError::Conflict);
            }
            if active_id != request.id {
                // Explicit takeover of an interrupted lease invalidates its token;
                // no background worker and no Provider operation is started here.
                sqlx::query("UPDATE generations_artifact_captures SET state='failed',failure_category='delivery_failed',lease_token=NULL,lease_expires_at=NULL,updated_at=clock_timestamp() WHERE id=$1")
                    .bind(active_id).execute(&mut *tx).await?;
            }
        }
        let id = request.id;
        let token = Uuid::new_v4();
        let changed = sqlx::query("INSERT INTO generations_artifact_captures(id,organization_id,project_id,task_id,kind,owner,name,mode,key_id,state,lease_token,lease_expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'preparing',$10,clock_timestamp()+interval '2 minutes') ON CONFLICT(id) DO UPDATE SET state='preparing',lease_token=EXCLUDED.lease_token,lease_expires_at=EXCLUDED.lease_expires_at,failure_category=NULL,updated_at=clock_timestamp() WHERE generations_artifact_captures.organization_id=EXCLUDED.organization_id AND generations_artifact_captures.project_id=EXCLUDED.project_id AND generations_artifact_captures.task_id=EXCLUDED.task_id AND generations_artifact_captures.kind=EXCLUDED.kind AND generations_artifact_captures.owner=EXCLUDED.owner AND generations_artifact_captures.name=EXCLUDED.name AND generations_artifact_captures.mode=EXCLUDED.mode AND generations_artifact_captures.key_id IS NOT DISTINCT FROM EXCLUDED.key_id AND (generations_artifact_captures.state='failed' OR (generations_artifact_captures.state='preparing' AND generations_artifact_captures.lease_expires_at<=clock_timestamp()))")
 .bind(id).bind(scope.organization_id).bind(scope.project_id).bind(task).bind(kind).bind(actor).bind(name).bind(request.mode).bind(request.key_id).bind(token).execute(&mut *tx).await?.rows_affected();
        if changed != 1 {
            return Err(StoreError::Conflict);
        }
        let capture = capture_on(&mut tx, scope, id).await?;
        tx.commit().await?;
        Ok(GenerationArtifactCaptureClaim {
            capture,
            lease_token: Some(token),
        })
    }
    pub async fn complete_generation_artifact_capture<F>(
        &self,
        scope: TenantScope,
        actor: &str,
        lease: GenerationArtifactCaptureLease,
        input: AssetLibraryCreate<'_>,
        limits: AssetLibraryLimits,
        seal: F,
    ) -> Result<GenerationArtifactCapture, StoreError>
    where
        F: FnOnce(&[u8], &[u8]) -> Result<Vec<u8>, StoreError>,
    {
        let GenerationArtifactCaptureLease { id, token } = lease;
        if input.id != id || input.actor != actor {
            return Err(StoreError::InvalidObservation);
        }
        let prepared = Self::prepare_workspace_asset_create(scope, &input, limits, seal)?;
        let mut tx = self.begin_bounded_recording().await?;
        // Resolve immutable source before taking locks; source identity cannot change.
        let task:Uuid=sqlx::query_scalar("SELECT task_id FROM generations_artifact_captures WHERE organization_id=$1 AND project_id=$2 AND id=$3").bind(scope.organization_id).bind(scope.project_id).bind(id).fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        visible_locked(&mut tx, scope, actor, task).await?;
        let row=sqlx::query("SELECT name,kind,owner,mode,key_id FROM generations_artifact_captures WHERE organization_id=$1 AND project_id=$2 AND id=$3 AND state='preparing' AND lease_token=$4 AND lease_expires_at>clock_timestamp() FOR UPDATE").bind(scope.organization_id).bind(scope.project_id).bind(id).bind(token).fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        if row.try_get::<String, _>("owner")? != actor
            || row.try_get::<String, _>("name")? != input.name.trim()
            || (row.try_get::<String, _>("kind")? == "video"
                && input.kind != AssetLibraryKind::Video)
            || (row.try_get::<String, _>("kind")? == "last_frame"
                && input.kind != AssetLibraryKind::Image)
        {
            return Err(StoreError::InvalidObservation);
        }
        let mode: String = row.try_get("mode")?;
        let result_kind: String = row.try_get("kind")?;
        if mode == "cached" {
            // Decode/format validation can outlive the saved reference. Hold its
            // row against deletion while inserting bytes, then check wall-clock
            // expiry again at the final atomic state transition.
            let retained: Option<Uuid> = sqlx::query_scalar("SELECT attempt_id FROM media_result_references WHERE organization_id=$1 AND project_id=$2 AND attempt_id=$3 AND kind=$4 AND ciphertext IS NOT NULL AND deleted_at IS NULL AND expires_at>clock_timestamp() FOR SHARE")
                .bind(scope.organization_id).bind(scope.project_id).bind(task).bind(&result_kind)
                .fetch_optional(&mut *tx).await?;
            if retained.is_none() {
                return Err(StoreError::Conflict);
            }
        }
        if mode == "fresh" {
            // The Gateway has already checked policy and the original binding.
            // Lock the selected saved-scope key against revocation/grant changes
            // during the byte insertion; never select a replacement Provider.
            let requested_key: Option<Uuid> = row.try_get("key_id")?;
            let authorized_key: Option<Uuid> = sqlx::query_scalar("SELECT k.id FROM attempts a JOIN api_keys k ON k.organization_id=a.organization_id AND k.project_id=a.project_id AND k.id=COALESCE($4::uuid,a.api_key_id) WHERE a.organization_id=$1 AND a.project_id=$2 AND a.id=$3 AND k.revoked_at IS NULL AND k.expires_at>clock_timestamp() AND ('*'=ANY(k.allowed_models) OR a.resource_id=ANY(k.allowed_models)) FOR SHARE OF k")
                .bind(scope.organization_id).bind(scope.project_id).bind(task).bind(requested_key)
                .fetch_optional(&mut *tx).await?;
            if authorized_key.is_none() {
                return Err(StoreError::Conflict);
            }
        }
        Self::insert_prepared_workspace_asset_in_tx(&mut tx, scope, &input, limits, prepared)
            .await?;
        let changed = sqlx::query("UPDATE generations_artifact_captures c SET state='stored',asset_id=id,lease_token=NULL,lease_expires_at=NULL,updated_at=clock_timestamp() WHERE c.id=$1 AND c.lease_token=$2 AND c.state='preparing' AND c.lease_expires_at>clock_timestamp() AND ((c.mode='fresh' AND EXISTS(SELECT 1 FROM attempts a JOIN api_keys k ON k.organization_id=a.organization_id AND k.project_id=a.project_id AND k.id=COALESCE(c.key_id,a.api_key_id) WHERE a.organization_id=c.organization_id AND a.project_id=c.project_id AND a.id=c.task_id AND k.revoked_at IS NULL AND k.expires_at>clock_timestamp() AND ('*'=ANY(k.allowed_models) OR a.resource_id=ANY(k.allowed_models)))) OR (c.mode='cached' AND EXISTS(SELECT 1 FROM media_result_references r WHERE r.organization_id=c.organization_id AND r.project_id=c.project_id AND r.attempt_id=c.task_id AND r.kind=c.kind AND r.ciphertext IS NOT NULL AND r.deleted_at IS NULL AND r.expires_at>clock_timestamp())))")
            .bind(id).bind(token).execute(&mut *tx).await?.rows_affected();
        if changed != 1 {
            return Err(StoreError::Conflict);
        }
        let capture = capture_on(&mut tx, scope, id).await?;
        tx.commit().await?;
        Ok(capture)
    }
    pub async fn fail_generation_artifact_capture(
        &self,
        scope: TenantScope,
        actor: &str,
        id: Uuid,
        token: Uuid,
        category: &str,
    ) -> Result<GenerationArtifactCapture, StoreError> {
        if ![
            "delivery_failed",
            "authorization_changed",
            "invalid_media",
            "capacity_exceeded",
            "storage_unavailable",
            "encryption_unavailable",
        ]
        .contains(&category)
        {
            return Err(StoreError::InvalidObservation);
        }
        let mut tx = self.begin_bounded_recording().await?;
        let task:Uuid=sqlx::query_scalar("SELECT task_id FROM generations_artifact_captures WHERE organization_id=$1 AND project_id=$2 AND id=$3").bind(scope.organization_id).bind(scope.project_id).bind(id).fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        visible_locked(&mut tx, scope, actor, task).await?;
        let count=sqlx::query("UPDATE generations_artifact_captures SET state='failed',failure_category=$5,lease_token=NULL,lease_expires_at=NULL,updated_at=clock_timestamp() WHERE organization_id=$1 AND project_id=$2 AND id=$3 AND lease_token=$4 AND state='preparing' AND owner=$6").bind(scope.organization_id).bind(scope.project_id).bind(id).bind(token).bind(category).bind(actor).execute(&mut *tx).await?.rows_affected();
        if count != 1 {
            return Err(StoreError::Conflict);
        }
        let capture = capture_on(&mut tx, scope, id).await?;
        tx.commit().await?;
        Ok(capture)
    }
}
