use crate::{Store, StoreError, TenantScope};
use serde_json::{Value, json};
use sqlx::Row;
use uuid::Uuid;

impl Store {
    pub async fn purge_expired_request_payloads(&self) -> Result<(), StoreError> {
        // Retention domains are independent: a failed asset cleanup must not
        // prevent expired Logs payloads from being erased in this pass.
        let asset_cleanup = self.purge_expired_asset_group_requests().await;
        let asset_read_cleanup = self.purge_expired_asset_group_read_results().await;
        let asset_listing_cleanup = self.purge_expired_asset_listing_results().await;
        let asset_update_cleanup = self.purge_expired_asset_group_update_patches().await;
        let asset_lookup_cleanup = self.purge_expired_asset_lookup_results().await;
        let payload_cleanup = self
            .run_background_work(
                crate::background_work::BackgroundWork::ContentRetention,
                |tx| {
                    Box::pin(async move {
                        sqlx::query_scalar::<_, i64>("SELECT niu_purge_request_payload_page()")
                            .fetch_one(&mut **tx)
                            .await
                            .map_err(StoreError::from)
                    })
                },
            )
            .await;
        asset_cleanup?;
        asset_read_cleanup?;
        asset_listing_cleanup?;
        asset_lookup_cleanup?;
        asset_update_cleanup?;
        payload_cleanup?;
        Ok(())
    }
    pub async fn save_request_payload(
        &self,
        attempt: Uuid,
        request: &Value,
        response: &str,
        content_type: &str,
        complete: bool,
        truncated: bool,
    ) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        // Serialize capture and explicit deletion. The following query uses a fresh
        // READ COMMITTED snapshot after acquiring the attempt lock.
        sqlx::query("SELECT id FROM attempts WHERE id=$1 FOR UPDATE")
            .bind(attempt)
            .fetch_one(&mut *tx)
            .await?;
        // Original request time fixes the retention window, including retries after purge.
        // Expired records are hidden on read and cleaned by bounded background maintenance.
        sqlx::query("WITH source AS (SELECT created_at FROM attempts WHERE id=$1) INSERT INTO request_payloads(attempt_id,request_body,response_body,response_content_type,response_complete,response_truncated,expires_at) SELECT $1,$2,$3,$4,$5,$6,COALESCE((SELECT created_at FROM source),now())+interval '24 hours' WHERE COALESCE((SELECT created_at FROM source),now())+interval '24 hours'>now() AND NOT EXISTS (SELECT 1 FROM request_payload_deletions WHERE attempt_id=$1) ON CONFLICT(attempt_id) DO NOTHING")
            .bind(attempt).bind(request).bind(response).bind(content_type).bind(complete).bind(truncated).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(())
    }
    pub async fn request_payload(
        &self,
        scope: TenantScope,
        attempt: Uuid,
    ) -> Result<Option<Value>, StoreError> {
        let row = sqlx::query("SELECT p.request_body,p.response_body,p.response_content_type,p.response_complete,p.response_truncated,p.expires_at::text FROM request_payloads p JOIN attempts a ON a.id=p.attempt_id WHERE a.organization_id=$1 AND a.project_id=$2 AND a.id=$3 AND p.expires_at>now()")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt).fetch_optional(&self.pool).await?;
        row.map(|row| Ok(json!({"request":row.try_get::<Value,_>("request_body")?,"response":row.try_get::<String,_>("response_body")?,"content_type":row.try_get::<String,_>("response_content_type")?,"complete":row.try_get::<bool,_>("response_complete")?,"truncated":row.try_get::<bool,_>("response_truncated")?,"expires_at":row.try_get::<String,_>("expires_at")?}))).transpose()
    }
    pub async fn delete_request_payload(
        &self,
        scope: TenantScope,
        attempt: Uuid,
    ) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        let owned = sqlx::query("SELECT id FROM attempts WHERE organization_id=$1 AND project_id=$2 AND id=$3 FOR UPDATE")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt)
            .fetch_optional(&mut *tx).await?;
        if owned.is_some() {
            sqlx::query("INSERT INTO request_payload_deletions(attempt_id) VALUES($1) ON CONFLICT DO NOTHING")
                .bind(attempt).execute(&mut *tx).await?;
            sqlx::query("DELETE FROM request_payloads WHERE attempt_id=$1")
                .bind(attempt)
                .execute(&mut *tx)
                .await?;
        }
        tx.commit().await?;
        Ok(())
    }
}
