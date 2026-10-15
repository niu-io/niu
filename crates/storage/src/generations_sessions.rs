//! Actor-private video timelines. No method dispatches or refreshes inference.
use crate::{Store, StoreError, TenantScope};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use uuid::Uuid;

impl Store {
    /// Retention maintenance, separate from side-effect-free saved-state reads.
    pub async fn purge_expired_generations_instructions(&self) -> Result<u64, StoreError> {
        self.execute_content_retention("UPDATE generations_turns SET instruction=NULL WHERE (organization_id,project_id,owner,session_id,id) IN (SELECT organization_id,project_id,owner,session_id,id FROM generations_turns WHERE instruction IS NOT NULL AND content_expires_at<=clock_timestamp() ORDER BY content_expires_at,id LIMIT 500 FOR UPDATE SKIP LOCKED)").await
    }
    pub async fn create_generations_session(
        &self,
        scope: TenantScope,
        owner: &str,
        id: Uuid,
        title: &str,
    ) -> Result<(), StoreError> {
        if title.trim().is_empty() || title.len() > 800 {
            return Err(StoreError::InvalidGenerationsInput);
        }
        let mut tx = self.begin_bounded_recording().await?;
        sqlx::query("INSERT INTO generations_sessions(organization_id,project_id,owner,id,title) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING")
            .bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(id).bind(title).execute(&mut *tx).await?;
        let same:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM generations_sessions WHERE organization_id=$1 AND project_id=$2 AND owner=$3 AND id=$4 AND title=$5 AND revision=1 AND NOT archived)")
            .bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(id).bind(title).fetch_one(&mut *tx).await?;
        if !same {
            return Err(StoreError::Conflict);
        }
        tx.commit().await?;
        Ok(())
    }
    pub async fn generations_session(
        &self,
        scope: TenantScope,
        owner: &str,
        id: Uuid,
    ) -> Result<Option<Value>, StoreError> {
        let mut tx = self.begin_bounded_read_snapshot().await?;
        let session:Option<Value>=sqlx::query_scalar("SELECT jsonb_build_object('id',id,'workspace_id',project_id,'owner',owner,'category','video','title',title,'revision',revision::text,'archived',archived,'created_at',created_at,'updated_at',updated_at) FROM generations_sessions WHERE organization_id=$1 AND project_id=$2 AND owner=$3 AND id=$4")
            .bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(id).fetch_optional(&mut *tx).await?;
        let Some(mut session) = session else {
            return Ok(None);
        };
        let turns: Vec<Value> = sqlx::query_scalar(include_str!("generations_session_turns.sql"))
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .bind(owner)
            .bind(id)
            .fetch_all(&mut *tx)
            .await?;
        session["turns"] = json!(turns);
        tx.commit().await?;
        Ok(Some(session))
    }
    pub async fn generations_session_page(
        &self,
        scope: TenantScope,
        owner: &str,
        before: Option<Uuid>,
        limit: i64,
        archived: bool,
    ) -> Result<Vec<Value>, StoreError> {
        if !(1..=100).contains(&limit) {
            return Err(StoreError::InvalidGenerationsInput);
        }
        let mut tx = self.begin_bounded_read_snapshot().await?;
        if let Some(id) = before {
            let exists:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM generations_sessions WHERE organization_id=$1 AND project_id=$2 AND owner=$3 AND id=$4)").bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(id).fetch_one(&mut *tx).await?;
            if !exists {
                return Err(StoreError::InvalidGenerationsInput);
            }
        }
        let data = sqlx::query_scalar("SELECT jsonb_build_object('id',id,'workspace_id',project_id,'owner',owner,'category','video','title',title,'revision',revision::text,'archived',archived,'created_at',created_at,'updated_at',updated_at) FROM generations_sessions s WHERE organization_id=$1 AND project_id=$2 AND owner=$3 AND archived=$4 AND ($5::uuid IS NULL OR (created_at,id)<(SELECT created_at,id FROM generations_sessions WHERE organization_id=$1 AND project_id=$2 AND owner=$3 AND id=$5)) ORDER BY created_at DESC,id DESC LIMIT $6").bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(archived).bind(before).bind(limit+1).fetch_all(&mut *tx).await?;
        tx.commit().await?;
        Ok(data)
    }
    pub async fn update_generations_session(
        &self,
        scope: TenantScope,
        owner: &str,
        id: Uuid,
        revision: i64,
        title: &str,
        archived: bool,
    ) -> Result<(), StoreError> {
        if title.trim().is_empty() || title.len() > 800 || revision < 1 {
            return Err(StoreError::InvalidGenerationsInput);
        }
        let mut tx = self.begin_bounded_recording().await?;
        let n=sqlx::query("UPDATE generations_sessions SET title=$6,archived=$7,revision=revision+1,updated_at=clock_timestamp() WHERE organization_id=$1 AND project_id=$2 AND owner=$3 AND id=$4 AND revision=$5").bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(id).bind(revision).bind(title).bind(archived).execute(&mut *tx).await?.rows_affected();
        if n != 1 {
            return Err(StoreError::Conflict);
        }
        tx.commit().await?;
        Ok(())
    }
    pub async fn append_generations_turn(
        &self,
        scope: TenantScope,
        owner: &str,
        session: Uuid,
        turn: Uuid,
        revision: i64,
        instruction: &Value,
    ) -> Result<(), StoreError> {
        let instruction_bytes =
            serde_json::to_vec(instruction).map_err(|_| StoreError::InvalidGenerationsInput)?;
        if revision < 1 || instruction_bytes.len() > 60 * 1024 {
            return Err(StoreError::InvalidGenerationsInput);
        }
        let digest = Sha256::digest(instruction_bytes).to_vec();
        let mut tx = self.begin_bounded_recording().await?;
        let current:Option<(i64,bool)>=sqlx::query_as("SELECT revision,archived FROM generations_sessions WHERE organization_id=$1 AND project_id=$2 AND owner=$3 AND id=$4 FOR UPDATE").bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(session).fetch_optional(&mut *tx).await?;
        let Some((current, archived)) = current else {
            return Err(StoreError::Conflict);
        };
        let existing:Option<Vec<u8>>=sqlx::query_scalar("SELECT instruction_digest FROM generations_turns WHERE organization_id=$1 AND project_id=$2 AND owner=$3 AND session_id=$4 AND id=$5").bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(session).bind(turn).fetch_optional(&mut *tx).await?;
        if let Some(existing) = existing {
            if existing != digest {
                return Err(StoreError::Conflict);
            }
            tx.commit().await?;
            return Ok(());
        }
        if archived || current != revision {
            return Err(StoreError::Conflict);
        }
        let count:i64=sqlx::query_scalar("SELECT count(*) FROM generations_turns WHERE organization_id=$1 AND project_id=$2 AND owner=$3 AND session_id=$4").bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(session).fetch_one(&mut *tx).await?;
        if count >= 100 {
            return Err(StoreError::InvalidGenerationsInput);
        }
        sqlx::query("INSERT INTO generations_turns(organization_id,project_id,owner,session_id,id,sequence,instruction,instruction_digest) VALUES($1,$2,$3,$4,$5,$6,$7,$8)").bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(session).bind(turn).bind(count+1).bind(instruction).bind(digest).execute(&mut *tx).await?;
        sqlx::query("UPDATE generations_sessions SET revision=revision+1,updated_at=clock_timestamp() WHERE organization_id=$1 AND project_id=$2 AND owner=$3 AND id=$4").bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(session).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(())
    }
    pub async fn attach_generations_task(
        &self,
        scope: TenantScope,
        owner: &str,
        session: Uuid,
        turn: Uuid,
        revision: i64,
        task: Uuid,
    ) -> Result<(), StoreError> {
        if revision < 1 {
            return Err(StoreError::InvalidGenerationsInput);
        }
        let mut tx = self.begin_bounded_recording().await?;
        let current:Option<(i64,bool)>=sqlx::query_as("SELECT revision,archived FROM generations_sessions WHERE organization_id=$1 AND project_id=$2 AND owner=$3 AND id=$4 FOR UPDATE").bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(session).fetch_optional(&mut *tx).await?;
        let Some((current, archived)) = current else {
            return Err(StoreError::Conflict);
        };
        let bound:Option<Uuid>=sqlx::query_scalar("SELECT intent_id FROM generations_turn_intents WHERE organization_id=$1 AND project_id=$2 AND owner=$3 AND session_id=$4 AND turn_id=$5").bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(session).bind(turn).fetch_optional(&mut *tx).await?;
        if let Some(intent) = bound {
            sqlx::query("SELECT id FROM video_submission_intents WHERE organization_id=$1 AND project_id=$2 AND owner=$3 AND id=$4 FOR UPDATE").bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(intent).fetch_one(&mut *tx).await?;
            let actual:Option<Uuid>=sqlx::query_scalar("SELECT sk.attempt_id FROM video_submission_intents vi JOIN media_submission_keys sk ON sk.organization_id=vi.organization_id AND sk.project_id=vi.project_id AND sk.key_digest=niu_submission_key_digest(vi.submission_key) WHERE vi.organization_id=$1 AND vi.project_id=$2 AND vi.owner=$3 AND vi.id=$4").bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(intent).fetch_optional(&mut *tx).await?;
            if actual != Some(task) {
                return Err(StoreError::Conflict);
            }
        }
        // Serialize a newly private association with artifact capture's final
        // visibility check and byte commit on the same source attempt.
        let locked: Option<Uuid> = sqlx::query_scalar("SELECT id FROM attempts WHERE organization_id=$1 AND project_id=$2 AND id=$3 FOR UPDATE")
            .bind(scope.organization_id).bind(scope.project_id).bind(task)
            .fetch_optional(&mut *tx).await?;
        if locked.is_none() {
            return Err(StoreError::Unauthorized);
        }
        let bound_elsewhere:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM generations_turn_intents binding JOIN video_submission_intents vi ON vi.organization_id=binding.organization_id AND vi.project_id=binding.project_id AND vi.owner=binding.owner AND vi.id=binding.intent_id JOIN media_submission_keys sk ON sk.organization_id=vi.organization_id AND sk.project_id=vi.project_id AND sk.key_digest=niu_submission_key_digest(vi.submission_key) WHERE sk.attempt_id=$1 AND (binding.organization_id<>$2 OR binding.project_id<>$3 OR binding.owner<>$4 OR binding.session_id<>$5 OR binding.turn_id<>$6))").bind(task).bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(session).bind(turn).fetch_one(&mut *tx).await?;
        if bound_elsewhere {
            return Err(StoreError::Conflict);
        }
        let existing: Option<(Uuid, Uuid, String, Uuid, Uuid)> = sqlx::query_as(
            "SELECT organization_id,project_id,owner,session_id,turn_id FROM generations_turn_tasks WHERE task_id=$1",
        )
        .bind(task)
        .fetch_optional(&mut *tx)
        .await?;
        if let Some((existing_org, existing_project, existing_owner, s, t)) = existing {
            if existing_org != scope.organization_id
                || existing_project != scope.project_id
                || existing_owner != owner
                || s != session
                || t != turn
            {
                return Err(StoreError::Conflict);
            }
            tx.commit().await?;
            return Ok(());
        }
        if archived || current != revision {
            return Err(StoreError::Conflict);
        }
        let allowed:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM attempts a WHERE a.organization_id=$1 AND a.project_id=$2 AND a.id=$4 AND a.dispatched_at IS NOT NULL AND EXISTS(SELECT 1 FROM media_recovery_routes r WHERE r.attempt_id=a.id) AND NOT EXISTS(SELECT 1 FROM video_submission_intents vi JOIN media_submission_keys sk ON sk.organization_id=vi.organization_id AND sk.project_id=vi.project_id AND sk.key_digest=niu_submission_key_digest(vi.submission_key) WHERE sk.attempt_id=a.id AND vi.owner<>$3))").bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(task).fetch_one(&mut *tx).await?;
        if !allowed {
            return Err(StoreError::Unauthorized);
        }
        let present:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM generations_turns WHERE organization_id=$1 AND project_id=$2 AND owner=$3 AND session_id=$4 AND id=$5)").bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(session).bind(turn).fetch_one(&mut *tx).await?;
        if !present {
            return Err(StoreError::Conflict);
        }
        let inserted=sqlx::query("INSERT INTO generations_turn_tasks(organization_id,project_id,owner,session_id,turn_id,task_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING").bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(session).bind(turn).bind(task).execute(&mut *tx).await?.rows_affected();
        if inserted != 1 {
            return Err(StoreError::Conflict);
        }
        sqlx::query("UPDATE generations_sessions SET revision=revision+1,updated_at=clock_timestamp() WHERE organization_id=$1 AND project_id=$2 AND owner=$3 AND id=$4").bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(session).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(())
    }
    /// Bind canonical restoration identity without initiating inference.
    pub async fn bind_generations_intent(
        &self,
        scope: TenantScope,
        owner: &str,
        session: Uuid,
        turn: Uuid,
        revision: i64,
        intent: Uuid,
    ) -> Result<(), StoreError> {
        if revision < 1 || intent.is_nil() {
            return Err(StoreError::InvalidGenerationsInput);
        }
        let mut tx = self.begin_bounded_recording().await?;
        let current:Option<(i64,bool)>=sqlx::query_as("SELECT revision,archived FROM generations_sessions WHERE organization_id=$1 AND project_id=$2 AND owner=$3 AND id=$4 FOR UPDATE").bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(session).fetch_optional(&mut *tx).await?;
        let Some((current, archived)) = current else {
            return Err(StoreError::Conflict);
        };
        let retained:Option<bool>=sqlx::query_scalar("SELECT instruction IS NOT NULL AND content_deleted_at IS NULL AND content_expires_at>clock_timestamp() FROM generations_turns WHERE organization_id=$1 AND project_id=$2 AND owner=$3 AND session_id=$4 AND id=$5 FOR UPDATE").bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(session).bind(turn).fetch_optional(&mut *tx).await?;
        let Some(retained) = retained else {
            return Err(StoreError::Conflict);
        };
        let existing:Option<Uuid>=sqlx::query_scalar("SELECT intent_id FROM generations_turn_intents WHERE organization_id=$1 AND project_id=$2 AND owner=$3 AND session_id=$4 AND turn_id=$5").bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(session).bind(turn).fetch_optional(&mut *tx).await?;
        if let Some(existing) = existing {
            if existing != intent {
                return Err(StoreError::Conflict);
            }
            tx.commit().await?;
            return Ok(());
        }
        if archived || current != revision || !retained {
            return Err(StoreError::Conflict);
        }
        let allowed:Option<bool>=sqlx::query_scalar("SELECT request IS NOT NULL AND deleted_at IS NULL AND expires_at>clock_timestamp() FROM video_submission_intents WHERE organization_id=$1 AND project_id=$2 AND owner=$3 AND id=$4 FOR UPDATE").bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(intent).fetch_optional(&mut *tx).await?;
        if allowed != Some(true) {
            return Err(StoreError::Unauthorized);
        }
        let actual:Option<Uuid>=sqlx::query_scalar("SELECT sk.attempt_id FROM video_submission_intents vi JOIN media_submission_keys sk ON sk.organization_id=vi.organization_id AND sk.project_id=vi.project_id AND sk.key_digest=niu_submission_key_digest(vi.submission_key) WHERE vi.organization_id=$1 AND vi.project_id=$2 AND vi.owner=$3 AND vi.id=$4").bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(intent).fetch_optional(&mut *tx).await?;
        let attached:Option<Uuid>=sqlx::query_scalar("SELECT task_id FROM generations_turn_tasks WHERE organization_id=$1 AND project_id=$2 AND owner=$3 AND session_id=$4 AND turn_id=$5").bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(session).bind(turn).fetch_optional(&mut *tx).await?;
        if attached.is_some() && actual != attached {
            return Err(StoreError::Conflict);
        }
        if let Some(attempt) = actual {
            sqlx::query("SELECT id FROM attempts WHERE organization_id=$1 AND project_id=$2 AND id=$3 FOR UPDATE").bind(scope.organization_id).bind(scope.project_id).bind(attempt).fetch_one(&mut *tx).await?;
            let elsewhere:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM generations_turn_tasks WHERE task_id=$1 AND (organization_id<>$2 OR project_id<>$3 OR owner<>$4 OR session_id<>$5 OR turn_id<>$6))").bind(attempt).bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(session).bind(turn).fetch_one(&mut *tx).await?;
            if elsewhere {
                return Err(StoreError::Conflict);
            }
        }
        let inserted=sqlx::query("INSERT INTO generations_turn_intents(organization_id,project_id,owner,session_id,turn_id,intent_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING").bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(session).bind(turn).bind(intent).execute(&mut *tx).await?.rows_affected();
        if inserted != 1 {
            return Err(StoreError::Conflict);
        }
        sqlx::query("UPDATE generations_sessions SET revision=revision+1,updated_at=clock_timestamp() WHERE organization_id=$1 AND project_id=$2 AND owner=$3 AND id=$4").bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(session).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(())
    }
    pub async fn delete_generations_instruction(
        &self,
        scope: TenantScope,
        owner: &str,
        session: Uuid,
        turn: Uuid,
        revision: i64,
    ) -> Result<(), StoreError> {
        let mut tx = self.begin_bounded_recording().await?;
        let n=sqlx::query("UPDATE generations_sessions SET revision=revision+1,updated_at=clock_timestamp() WHERE organization_id=$1 AND project_id=$2 AND owner=$3 AND id=$4 AND revision=$5").bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(session).bind(revision).execute(&mut *tx).await?.rows_affected();
        if n != 1 {
            return Err(StoreError::Conflict);
        }
        let n=sqlx::query("UPDATE generations_turns SET instruction=NULL,content_deleted_at=COALESCE(content_deleted_at,clock_timestamp()) WHERE organization_id=$1 AND project_id=$2 AND owner=$3 AND session_id=$4 AND id=$5").bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(session).bind(turn).execute(&mut *tx).await?.rows_affected();
        if n != 1 {
            return Err(StoreError::Conflict);
        }
        tx.commit().await?;
        Ok(())
    }
}
