//! Durable one-shot read authorization. Caller enforces current platform access.
use crate::{AssetManagementCredentialRevision, Store, StoreError, TenantScope};
use niu_media::asset_read::OrdinaryGroupRead;
use uuid::Uuid;

/// Original account credentials and upstream identity are private, not display data.
pub struct ClaimedAssetGroupRead {
    pub read_id: Uuid,
    pub authorization_id: Uuid,
    pub credential: AssetManagementCredentialRevision,
    request: OrdinaryGroupRead,
}
impl ClaimedAssetGroupRead {
    pub fn request(&self) -> &OrdinaryGroupRead {
        &self.request
    }
}
impl Store {
    /// Account-locked qualification check and immutable audit commit precede
    /// credential release. A repeated read identity never releases keys again.
    /// No transaction or account lock is held across network I/O.
    pub async fn claim_asset_group_read(
        &self,
        scope: TenantScope,
        intent: Uuid,
        read_id: Uuid,
    ) -> Result<Option<ClaimedAssetGroupRead>, StoreError> {
        self.claim_asset_group_read_bound(scope, intent, read_id, None)
            .await
    }

    /// Admit a fresh original-group read after acknowledgement. An uncertain
    /// mutation is not eligible; this never releases the mutation hold.
    pub async fn claim_asset_group_update_read(
        &self,
        scope: TenantScope,
        update_id: Uuid,
        read_id: Uuid,
    ) -> Result<Option<ClaimedAssetGroupRead>, StoreError> {
        let intent: Option<Uuid> = sqlx::query_scalar("SELECT u.intent_id FROM asset_group_update_intents u JOIN asset_group_create_intents i ON i.id=u.intent_id WHERE u.id=$1 AND i.organization_id=$2 AND i.project_id=$3")
            .bind(update_id).bind(scope.organization_id).bind(scope.project_id).fetch_optional(&self.pool).await?;
        let Some(intent) = intent else {
            return Ok(None);
        };
        self.claim_asset_group_read_bound(scope, intent, read_id, Some(update_id))
            .await
    }

    async fn claim_asset_group_read_bound(
        &self,
        scope: TenantScope,
        intent: Uuid,
        read_id: Uuid,
        update_id: Option<Uuid>,
    ) -> Result<Option<ClaimedAssetGroupRead>, StoreError> {
        let mut tx = self.pool.begin().await?;
        let vendor: Option<Uuid> = sqlx::query_scalar("SELECT vendor_id FROM asset_group_create_intents WHERE organization_id=$1 AND project_id=$2 AND id=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(intent).fetch_optional(&mut *tx).await?;
        let Some(vendor) = vendor else {
            return Ok(None);
        };
        sqlx::query_scalar::<_, Uuid>("SELECT id FROM vendors WHERE id=$1 FOR UPDATE")
            .bind(vendor)
            .fetch_one(&mut *tx)
            .await?;
        if let Some(update) = update_id {
            let eligible: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM asset_group_update_intents u JOIN asset_group_update_outcomes o ON o.update_id=u.id JOIN asset_group_update_holds h ON h.update_id=u.id AND h.intent_id=u.intent_id WHERE u.id=$1 AND u.intent_id=$2 AND o.outcome='acknowledged')")
                .bind(update).bind(intent).fetch_one(&mut *tx).await?;
            if !eligible {
                return Ok(None);
            }
        }
        let binding: Option<(Uuid, i64, String, String)> = sqlx::query_as("SELECT a.id,i.credential_revision,i.upstream_project,i.upstream_group_id FROM asset_group_create_intents i JOIN vendors v ON v.id=i.vendor_id AND v.revision=i.vendor_revision JOIN asset_operation_authorizations a ON a.organization_id=i.organization_id AND a.project_id=i.project_id AND a.vendor_id=i.vendor_id AND a.vendor_revision=i.vendor_revision AND a.credential_revision=i.credential_revision JOIN vendor_asset_management_credentials c ON c.vendor_id=i.vendor_id AND c.revision=i.credential_revision AND c.upstream_project=i.upstream_project WHERE i.organization_id=$1 AND i.project_id=$2 AND i.id=$3 AND i.state='succeeded' AND i.upstream_group_id IS NOT NULL AND a.operation='GetAssetGroup' AND a.expires_at>clock_timestamp() AND c.credential_ciphertext IS NOT NULL AND NOT EXISTS(SELECT 1 FROM asset_operation_authorization_revocations r WHERE r.authorization_id=a.id) AND NOT EXISTS(SELECT 1 FROM vendor_asset_management_revocations r WHERE r.vendor_id=i.vendor_id AND r.through_revision>=i.credential_revision) ORDER BY a.expires_at DESC,a.id LIMIT 1")
            .bind(scope.organization_id).bind(scope.project_id).bind(intent).fetch_optional(&mut *tx).await?;
        let Some((authorization_id, revision, project, group)) = binding else {
            return Ok(None);
        };
        let request = OrdinaryGroupRead::new(group, project.clone())
            .map_err(|_| StoreError::InvalidVendor)?;
        let credential: AssetManagementCredentialRevision = sqlx::query_as("SELECT vendor_id,revision,upstream_project,credential_ciphertext FROM vendor_asset_management_credentials WHERE vendor_id=$1 AND revision=$2 AND upstream_project=$3 AND credential_ciphertext IS NOT NULL")
            .bind(vendor).bind(revision).bind(project).fetch_one(&mut *tx).await?;
        let inserted = sqlx::query("INSERT INTO asset_group_read_claims(id,intent_id,authorization_id) SELECT $1,$2,a.id FROM asset_operation_authorizations a WHERE a.id=$3 AND a.operation='GetAssetGroup' AND a.expires_at>clock_timestamp() AND NOT EXISTS(SELECT 1 FROM asset_operation_authorization_revocations r WHERE r.authorization_id=a.id) ON CONFLICT(id) DO NOTHING")
            .bind(read_id).bind(intent).bind(authorization_id).execute(&mut *tx).await?.rows_affected();
        if inserted != 1 {
            return Ok(None);
        }
        if let Some(update) = update_id {
            sqlx::query("INSERT INTO asset_group_update_reads(read_id,update_id) VALUES($1,$2)")
                .bind(read_id)
                .bind(update)
                .execute(&mut *tx)
                .await?;
        }
        tx.commit().await?;
        Ok(Some(ClaimedAssetGroupRead {
            read_id,
            authorization_id,
            credential,
            request,
        }))
    }

    /// First outcome wins. Safe fixed categories only; does not persist content
    /// or change group identity/readiness, charges, balances or creation state.
    pub async fn record_asset_group_read_outcome(
        &self,
        scope: TenantScope,
        read_id: Uuid,
        reason: Option<&str>,
        duration_ms: i64,
    ) -> Result<bool, StoreError> {
        self.record_asset_group_read_completion(scope, read_id, reason, duration_ms, None)
            .await
    }

    /// Success audit and encrypted descriptive snapshot commit atomically.
    pub async fn save_asset_group_read_result(
        &self,
        scope: TenantScope,
        read_id: Uuid,
        ciphertext: &[u8],
        duration_ms: i64,
    ) -> Result<bool, StoreError> {
        if !(30..=8192).contains(&ciphertext.len()) || ciphertext.first() != Some(&1) {
            return Err(StoreError::InvalidObservation);
        }
        self.record_asset_group_read_completion(scope, read_id, None, duration_ms, Some(ciphertext))
            .await
    }

    async fn record_asset_group_read_completion(
        &self,
        scope: TenantScope,
        read_id: Uuid,
        reason: Option<&str>,
        duration_ms: i64,
        ciphertext: Option<&[u8]>,
    ) -> Result<bool, StoreError> {
        if duration_ms < 0
            || reason.is_some_and(|value| {
                !matches!(
                    value,
                    "invalid_configuration"
                        | "destination_rejected"
                        | "unavailable"
                        | "transport"
                        | "timeout"
                        | "response_limit"
                        | "invalid_response"
                )
            })
        {
            return Err(StoreError::InvalidObservation);
        }
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT id FROM asset_group_read_claims WHERE id=$1 FOR UPDATE")
            .bind(read_id)
            .fetch_optional(&mut *tx)
            .await?;

        let inserted = sqlx::query("INSERT INTO asset_group_read_outcomes(read_id,outcome,reason,duration_ms) SELECT r.id,$4,$5,$6 FROM asset_group_read_claims r JOIN asset_group_create_intents i ON i.id=r.intent_id WHERE r.id=$1 AND i.organization_id=$2 AND i.project_id=$3 ON CONFLICT(read_id) DO NOTHING")
            .bind(read_id).bind(scope.organization_id).bind(scope.project_id)
            .bind(if reason.is_none() { "succeeded" } else { "failed" }).bind(reason).bind(duration_ms)
            .execute(&mut *tx).await?.rows_affected()==1;
        if !inserted {
            return Ok(false);
        }
        if let Some(ciphertext) = ciphertext {
            sqlx::query("INSERT INTO asset_group_read_results(read_id,ciphertext) SELECT $1,$2 WHERE NOT EXISTS(SELECT 1 FROM asset_group_read_result_deletions WHERE read_id=$1)")
                .bind(read_id).bind(ciphertext).execute(&mut *tx).await?;
        }
        tx.commit().await?;
        Ok(true)
    }
    /// Original grant/account/key must still be current. No new upstream read.
    pub async fn asset_group_read_result(
        &self,
        scope: TenantScope,
        vendor: Uuid,
        read_id: Uuid,
    ) -> Result<Option<Vec<u8>>, StoreError> {
        Ok(sqlx::query_scalar("SELECT result.ciphertext FROM asset_group_read_results result JOIN asset_group_read_claims r ON r.id=result.read_id JOIN asset_group_create_intents i ON i.id=r.intent_id JOIN asset_operation_authorizations a ON a.id=r.authorization_id JOIN vendors v ON v.id=i.vendor_id AND v.revision=i.vendor_revision JOIN vendor_asset_management_credentials c ON c.vendor_id=i.vendor_id AND c.revision=i.credential_revision AND c.upstream_project=i.upstream_project WHERE r.id=$1 AND i.organization_id=$2 AND i.project_id=$3 AND i.vendor_id=$4 AND result.ciphertext IS NOT NULL AND result.expires_at>clock_timestamp() AND a.expires_at>clock_timestamp() AND NOT EXISTS(SELECT 1 FROM asset_operation_authorization_revocations revoked WHERE revoked.authorization_id=a.id) AND c.credential_ciphertext IS NOT NULL AND NOT EXISTS(SELECT 1 FROM vendor_asset_management_revocations revoked WHERE revoked.vendor_id=i.vendor_id AND revoked.through_revision>=i.credential_revision)")
            .bind(read_id).bind(scope.organization_id).bind(scope.project_id).bind(vendor).fetch_optional(&self.pool).await?)
    }

    /// Caller authorizes platform content deletion. Audit survives erasure.
    pub async fn delete_asset_group_read_result(
        &self,
        scope: TenantScope,
        vendor: Uuid,
        read_id: Uuid,
    ) -> Result<bool, StoreError> {
        let mut tx = self.pool.begin().await?;
        let id: Option<Uuid> = sqlx::query_scalar("SELECT r.id FROM asset_group_read_claims r JOIN asset_group_create_intents i ON i.id=r.intent_id WHERE r.id=$1 AND i.organization_id=$2 AND i.project_id=$3 AND i.vendor_id=$4 FOR UPDATE OF r")
            .bind(read_id).bind(scope.organization_id).bind(scope.project_id).bind(vendor).fetch_optional(&mut *tx).await?;
        if id.is_none() {
            return Ok(false);
        }
        let changed=sqlx::query("INSERT INTO asset_group_read_result_deletions(read_id) VALUES($1) ON CONFLICT DO NOTHING")
            .bind(read_id).execute(&mut *tx).await?.rows_affected()==1;
        sqlx::query("UPDATE asset_group_read_results SET ciphertext=NULL,deleted_at=clock_timestamp() WHERE read_id=$1 AND ciphertext IS NOT NULL")
            .bind(read_id).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(changed)
    }

    pub async fn purge_expired_asset_group_read_results(&self) -> Result<(), StoreError> {
        self.execute_content_retention("SELECT niu_purge_asset_content_page('group_read')")
            .await?;
        Ok(())
    }
    /// Private content and upstream account/identity are excluded. A missing
    /// outcome is unresolved, never proof that upstream work is still running.
    pub async fn asset_group_read_history(
        &self,
        scope: TenantScope,
        vendor: Uuid,
        after: Option<Uuid>,
        limit: i64,
    ) -> Result<Vec<serde_json::Value>, StoreError> {
        if !(1..=101).contains(&limit) {
            return Err(StoreError::InvalidObservation);
        }
        Ok(sqlx::query_scalar("SELECT jsonb_build_object('read_id',r.id,'status',COALESCE(o.outcome,'unresolved'),'started_at',r.created_at,'completed_at',o.created_at,'duration_ms',o.duration_ms,'reason',o.reason) FROM asset_group_read_claims r JOIN asset_group_create_intents i ON i.id=r.intent_id LEFT JOIN asset_group_read_outcomes o ON o.read_id=r.id WHERE i.organization_id=$1 AND i.project_id=$2 AND i.vendor_id=$3 AND ($4::uuid IS NULL OR (r.created_at,r.id)<(SELECT cursor.created_at,cursor.id FROM asset_group_read_claims cursor JOIN asset_group_create_intents original ON original.id=cursor.intent_id WHERE cursor.id=$4 AND original.organization_id=$1 AND original.project_id=$2 AND original.vendor_id=$3)) ORDER BY r.created_at DESC,r.id DESC LIMIT $5")
            .bind(scope.organization_id).bind(scope.project_id).bind(vendor).bind(after).bind(limit).fetch_all(&self.pool).await?)
    }
}
