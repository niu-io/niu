//! Immutable, actor-owned video intent; saving never creates a dispatch attempt.
use crate::{Store, StoreError, TenantScope};
use serde_json::Value;
use sqlx::Row;
use uuid::Uuid;

pub struct VideoIntentInput<'a> {
    pub id: Uuid,
    pub key_id: Uuid,
    pub model: &'a str,
    pub owner_funded: bool,
    pub request: &'a Value,
    pub request_digest: &'a [u8],
}

pub struct VideoIntent {
    pub id: Uuid,
    pub key_id: Uuid,
    pub model: String,
    pub owner_funded: bool,
    pub submission_key: Uuid,
    pub request_digest: Vec<u8>,
    pub request: Option<Value>,
    pub revision: i64,
    pub expires_at_ms: String,
    pub deleted: bool,
    pub expired: bool,
}

impl Store {
    pub async fn save_video_intent(
        &self,
        scope: TenantScope,
        owner: &str,
        input: VideoIntentInput<'_>,
    ) -> Result<(), StoreError> {
        if serde_json::to_vec(input.request)
            .map_err(|_| StoreError::InvalidUsage)?
            .len()
            > 60 * 1024
            || input.request_digest.len() != 32
        {
            return Err(StoreError::InvalidUsage);
        }
        let inserted=sqlx::query("INSERT INTO video_submission_intents(organization_id,project_id,owner,id,key_id,model,owner_funded,submission_key,request_digest,request) SELECT $1,$2,$3,$4,k.id,$6,$7,$8,$9,$10 FROM api_keys k WHERE k.organization_id=$1 AND k.project_id=$2 AND k.id=$5 AND k.revoked_at IS NULL AND k.expires_at>clock_timestamp() AND ('*'=ANY(k.allowed_models) OR $6=ANY(k.allowed_models)) ON CONFLICT(organization_id,project_id,owner,id) DO NOTHING")
            .bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(input.id).bind(input.key_id).bind(input.model).bind(input.owner_funded).bind(Uuid::new_v4()).bind(input.request_digest).bind(input.request).execute(&self.pool).await?.rows_affected();
        if inserted == 0 {
            let same:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM video_submission_intents WHERE organization_id=$1 AND project_id=$2 AND owner=$3 AND id=$4 AND key_id=$5 AND request_digest=$6 AND request=$7 AND owner_funded=$8 AND deleted_at IS NULL AND expires_at>clock_timestamp())")
                .bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(input.id).bind(input.key_id).bind(input.request_digest).bind(input.request).bind(input.owner_funded).fetch_one(&self.pool).await?;
            if !same {
                return Err(StoreError::Conflict);
            }
        }
        Ok(())
    }

    pub async fn video_intent(
        &self,
        scope: TenantScope,
        owner: &str,
        id: Uuid,
    ) -> Result<Option<VideoIntent>, StoreError> {
        let row=sqlx::query("SELECT id,key_id,model,owner_funded,submission_key,request_digest,CASE WHEN expires_at>clock_timestamp() AND deleted_at IS NULL THEN request ELSE NULL END AS request,revision,(floor(extract(epoch FROM expires_at)*1000)::bigint)::text AS expires_at_ms,deleted_at IS NOT NULL AS deleted,expires_at<=clock_timestamp() AS expired FROM video_submission_intents WHERE organization_id=$1 AND project_id=$2 AND owner=$3 AND id=$4")
            .bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(id).fetch_optional(&self.pool).await?;
        row.map(|r| {
            Ok(VideoIntent {
                id: r.try_get("id")?,
                key_id: r.try_get("key_id")?,
                model: r.try_get("model")?,
                owner_funded: r.try_get("owner_funded")?,
                submission_key: r.try_get("submission_key")?,
                request_digest: r.try_get("request_digest")?,
                request: r.try_get("request")?,
                revision: r.try_get("revision")?,
                expires_at_ms: r.try_get("expires_at_ms")?,
                deleted: r.try_get("deleted")?,
                expired: r.try_get("expired")?,
            })
        })
        .transpose()
    }

    /// Rotation preserves spending_root_id; unrelated keys never replace it.
    pub async fn video_intent_key(
        &self,
        scope: TenantScope,
        original: Uuid,
        model: &str,
    ) -> Result<Uuid, StoreError> {
        sqlx::query_scalar("SELECT current.id FROM api_keys original JOIN api_keys current ON current.spending_root_id=original.spending_root_id AND current.organization_id=original.organization_id AND current.project_id=original.project_id WHERE original.organization_id=$1 AND original.project_id=$2 AND original.id=$3 AND current.revoked_at IS NULL AND current.expires_at>clock_timestamp() AND ('*'=ANY(current.allowed_models) OR $4=ANY(current.allowed_models)) ORDER BY current.created_at DESC,current.id LIMIT 1")
            .bind(scope.organization_id).bind(scope.project_id).bind(original).bind(model).fetch_optional(&self.pool).await?.ok_or(StoreError::Unauthorized)
    }

    pub async fn video_intent_index(
        &self,
        scope: TenantScope,
        owner: &str,
        before: Option<Uuid>,
        limit: i64,
    ) -> Result<Vec<Value>, StoreError> {
        if !(1..=100).contains(&limit) {
            return Err(StoreError::InvalidUsage);
        }
        if let Some(id) = before {
            let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM video_submission_intents WHERE organization_id=$1 AND project_id=$2 AND owner=$3 AND id=$4)")
                .bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(id).fetch_one(&self.pool).await?;
            if !exists {
                return Err(StoreError::Conflict);
            }
        }
        Ok(sqlx::query_scalar("SELECT jsonb_build_object('id',id,'revision',revision,'expires_at_ms',(floor(extract(epoch FROM expires_at)*1000)::bigint)::text,'content_state',CASE WHEN expires_at<=clock_timestamp() THEN 'expired' WHEN deleted_at IS NOT NULL THEN 'deleted' ELSE 'retained' END) FROM video_submission_intents i WHERE organization_id=$1 AND project_id=$2 AND owner=$3 AND ($4::uuid IS NULL OR (created_at,id)<(SELECT created_at,id FROM video_submission_intents WHERE organization_id=$1 AND project_id=$2 AND owner=$3 AND id=$4)) ORDER BY created_at DESC,id DESC LIMIT $5")
            .bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(before).bind(limit+1).fetch_all(&self.pool).await?)
    }

    pub async fn delete_video_intent(
        &self,
        scope: TenantScope,
        owner: &str,
        id: Uuid,
        revision: i64,
    ) -> Result<i64, StoreError> {
        if revision <= 0 || revision == i64::MAX {
            return Err(StoreError::InvalidUsage);
        }
        let updated:Option<i64>=sqlx::query_scalar("UPDATE video_submission_intents SET request=NULL,deleted_at=clock_timestamp(),revision=revision+1 WHERE organization_id=$1 AND project_id=$2 AND owner=$3 AND id=$4 AND revision=$5 AND request IS NOT NULL RETURNING revision")
            .bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(id).bind(revision).fetch_optional(&self.pool).await?;
        if let Some(revision) = updated {
            return Ok(revision);
        }
        let replay: Option<i64> = sqlx::query_scalar("SELECT revision FROM video_submission_intents WHERE organization_id=$1 AND project_id=$2 AND owner=$3 AND id=$4 AND revision=$5+1 AND deleted_at IS NOT NULL AND request IS NULL")
            .bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(id).bind(revision).fetch_optional(&self.pool).await?;
        replay.ok_or(StoreError::Conflict)
    }

    pub async fn purge_expired_video_intents(&self) -> Result<u64, StoreError> {
        self.execute_content_retention("UPDATE video_submission_intents SET request=NULL,deleted_at=clock_timestamp(),revision=revision+1 WHERE (organization_id,project_id,owner,id) IN (SELECT organization_id,project_id,owner,id FROM video_submission_intents WHERE request IS NOT NULL AND expires_at<=clock_timestamp() ORDER BY expires_at,id LIMIT 500 FOR UPDATE SKIP LOCKED)").await
    }

    pub async fn video_intent_dispatched(
        &self,
        scope: TenantScope,
        attempt: Uuid,
    ) -> Result<bool, StoreError> {
        Ok(sqlx::query_scalar("SELECT dispatched_at IS NOT NULL FROM attempts WHERE organization_id=$1 AND project_id=$2 AND id=$3").bind(scope.organization_id).bind(scope.project_id).bind(attempt).fetch_optional(&self.pool).await?.unwrap_or(false))
    }
}
