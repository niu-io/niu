//! Durable at-most-once creation identity; replay never inherits dispatch rights.
use crate::{Store, StoreError, TenantScope};
use uuid::Uuid;

impl Store {
    pub async fn media_submission_attempt(
        &self,
        scope: TenantScope,
        key_digest: &[u8],
        request_digest: &[u8],
    ) -> Result<Option<Uuid>, StoreError> {
        let row: Option<(Uuid, Vec<u8>)> = sqlx::query_as("SELECT attempt_id,request_digest FROM media_submission_keys WHERE organization_id=$1 AND project_id=$2 AND key_digest=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(key_digest)
            .fetch_optional(&self.pool).await?;
        match row {
            Some((attempt, saved)) if saved == request_digest => Ok(Some(attempt)),
            Some(_) => Err(StoreError::Conflict),
            None => Ok(None),
        }
    }

    /// The boolean grants submission rights only to the transaction that first
    /// inserts the identity. All later callers may read the attempt, never send.
    pub async fn prepare_media_submission(
        &self,
        scope: TenantScope,
        model: &str,
        revision: &str,
        key_digest: &[u8],
        request_digest: &[u8],
    ) -> Result<(Uuid, bool), StoreError> {
        let mut tx = self.pool.begin().await?;
        let attempt = Uuid::new_v4();
        let inserted = sqlx::query("INSERT INTO media_submission_keys(organization_id,project_id,key_digest,request_digest,attempt_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(organization_id,project_id,key_digest) DO NOTHING")
            .bind(scope.organization_id).bind(scope.project_id).bind(key_digest)
            .bind(request_digest).bind(attempt).execute(&mut *tx).await?.rows_affected();
        if inserted == 0 {
            // A fresh READ COMMITTED snapshot sees the competing committed row.
            let (original, saved): (Uuid, Vec<u8>) = sqlx::query_as("SELECT attempt_id,request_digest FROM media_submission_keys WHERE organization_id=$1 AND project_id=$2 AND key_digest=$3")
                .bind(scope.organization_id).bind(scope.project_id).bind(key_digest)
                .fetch_one(&mut *tx).await?;
            if saved != request_digest {
                return Err(StoreError::Conflict);
            }
            tx.commit().await?;
            return Ok((original, false));
        }
        let operation = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO operations(id,organization_id,project_id,model_alias) VALUES($1,$2,$3,$4)",
        )
        .bind(operation)
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(model)
        .execute(&mut *tx)
        .await?;
        sqlx::query("INSERT INTO attempts(id,organization_id,project_id,operation_id,resource_id,offer_revision) VALUES($1,$2,$3,$4,$5,$6)")
            .bind(attempt).bind(scope.organization_id).bind(scope.project_id).bind(operation)
            .bind(model).bind(revision).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok((attempt, true))
    }
}
