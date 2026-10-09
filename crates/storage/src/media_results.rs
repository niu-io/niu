//! Private encrypted result references. No URL, body, Debug or serialization.
use crate::{MediaJobStatus, Store, StoreError, TenantScope};
use uuid::Uuid;

#[derive(Clone, Copy, Eq, PartialEq)]
pub enum MediaResultKind {
    Video,
    LastFrame,
}
impl MediaResultKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Video => "video",
            Self::LastFrame => "last_frame",
        }
    }
}
impl Store {
    /// Updating a signed URL cannot extend retention or resurrect deleted data.
    pub async fn save_media_result_reference(
        &self,
        scope: TenantScope,
        attempt: Uuid,
        kind: MediaResultKind,
        ciphertext: &[u8],
    ) -> Result<bool, StoreError> {
        if !(30..=16413).contains(&ciphertext.len()) {
            return Err(StoreError::InvalidUsage);
        }
        if self.media_job_status(scope, attempt).await? != Some(MediaJobStatus::Succeeded) {
            return Err(StoreError::Conflict);
        }
        let result=sqlx::query("INSERT INTO media_result_references(organization_id,project_id,attempt_id,kind,ciphertext) SELECT organization_id,project_id,attempt_id,$4,$5 FROM media_jobs WHERE organization_id=$1 AND project_id=$2 AND attempt_id=$3 ON CONFLICT(attempt_id,kind) DO UPDATE SET ciphertext=EXCLUDED.ciphertext WHERE media_result_references.organization_id=EXCLUDED.organization_id AND media_result_references.project_id=EXCLUDED.project_id AND media_result_references.deleted_at IS NULL AND media_result_references.expires_at>clock_timestamp()")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt).bind(kind.as_str()).bind(ciphertext).execute(&self.pool).await?;
        Ok(result.rows_affected() == 1)
    }
    /// Access callers must additionally authorize current key/model grants.
    pub async fn media_result_reference(
        &self,
        scope: TenantScope,
        attempt: Uuid,
        kind: MediaResultKind,
    ) -> Result<Option<Vec<u8>>, StoreError> {
        if self.media_job_status(scope, attempt).await? != Some(MediaJobStatus::Succeeded) {
            return Ok(None);
        }
        sqlx::query_scalar("SELECT ciphertext FROM media_result_references WHERE organization_id=$1 AND project_id=$2 AND attempt_id=$3 AND kind=$4 AND deleted_at IS NULL AND expires_at>clock_timestamp()")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt).bind(kind.as_str()).fetch_optional(&self.pool).await.map_err(Into::into)
    }
    pub async fn delete_media_result_references(
        &self,
        scope: TenantScope,
        attempt: Uuid,
    ) -> Result<(), StoreError> {
        sqlx::query("INSERT INTO media_result_references(organization_id,project_id,attempt_id,kind,ciphertext,deleted_at) SELECT r.organization_id,r.project_id,r.attempt_id,k.kind,NULL,clock_timestamp() FROM media_recovery_routes r CROSS JOIN (VALUES ('video'),('last_frame')) k(kind) WHERE r.organization_id=$1 AND r.project_id=$2 AND r.attempt_id=$3 ON CONFLICT(attempt_id,kind) DO UPDATE SET ciphertext=NULL,deleted_at=clock_timestamp() WHERE media_result_references.deleted_at IS NULL")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt).execute(&self.pool).await?;
        Ok(())
    }
    pub async fn purge_expired_media_result_references(&self) -> Result<u64, StoreError> {
        let result=sqlx::query("UPDATE media_result_references SET ciphertext=NULL,deleted_at=clock_timestamp() WHERE deleted_at IS NULL AND expires_at<=clock_timestamp()").execute(&self.pool).await?;
        Ok(result.rows_affected())
    }
}

impl Store {
    /// Customer-safe availability, including durable deletion/expiry after reload.
    pub async fn media_result_availability(
        &self,
        scope: TenantScope,
        attempt: Uuid,
    ) -> Result<Option<serde_json::Value>, StoreError> {
        let Some(status) = self.media_job_status(scope, attempt).await? else {
            return Ok(None);
        };
        let rows:Vec<(String,String)>=sqlx::query_as("SELECT kind,CASE WHEN deleted_at IS NOT NULL OR expires_at<=clock_timestamp() THEN 'unavailable' ELSE 'available' END FROM media_result_references WHERE organization_id=$1 AND project_id=$2 AND attempt_id=$3").bind(scope.organization_id).bind(scope.project_id).bind(attempt).fetch_all(&self.pool).await?;
        let mut data = serde_json::json!({"video":"missing","last_frame":"missing"});
        for (kind, state) in rows {
            data[&kind] = serde_json::Value::String(
                if state == "available" && status != MediaJobStatus::Succeeded {
                    "unavailable".into()
                } else {
                    state
                },
            );
        }
        Ok(Some(data))
    }
}
