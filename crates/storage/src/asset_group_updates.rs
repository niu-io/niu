//! Prepared metadata mutations. Caller enforces platform access and authenticated encryption.
use crate::{AssetManagementCredentialRevision, Store, StoreError, TenantScope};
use niu_media::{asset_group_update::OrdinaryGroupUpdate, asset_read::OrdinaryGroupRead};
use sha2::{Digest, Sha256};
use uuid::Uuid;
#[derive(sqlx::FromRow)]
struct UpdateBinding {
    intent_id: Uuid,
    authorization_id: Uuid,
    patch_sha256: Vec<u8>,
    ciphertext: Vec<u8>,
    revision: i64,
    project: String,
    group_id: String,
}
#[derive(sqlx::FromRow)]
struct ReconciliationBinding {
    patch_sha256: Vec<u8>,
    patch_ciphertext: Vec<u8>,
    read_ciphertext: Vec<u8>,
    group_id: String,
    project: String,
}
pub struct PreparedAssetGroupUpdate {
    pub intent_id: Uuid,
    pub update_id: Uuid,
    pub patch_sha256: [u8; 32],
    pub ciphertext: Vec<u8>,
}
/// No diagnostic formatting: original credentials and descriptive mutation.
pub struct ClaimedAssetGroupUpdate {
    pub update_id: Uuid,
    pub authorization_id: Uuid,
    pub credential: AssetManagementCredentialRevision,
    request: OrdinaryGroupUpdate,
}
impl ClaimedAssetGroupUpdate {
    pub fn request(&self) -> &OrdinaryGroupUpdate {
        &self.request
    }
}
/// Neither outcome releases a mutation hold or grants replay permission.
pub enum AssetGroupUpdateOutcome<'a> {
    Acknowledged,
    Uncertain { reason: &'a str },
}
impl Store {
    pub async fn asset_group_update_original_intent(
        &self,
        scope: TenantScope,
        vendor: Uuid,
        update: Uuid,
    ) -> Result<Option<Uuid>, StoreError> {
        sqlx::query_scalar("SELECT u.intent_id FROM asset_group_update_intents u JOIN asset_group_create_intents i ON i.id=u.intent_id WHERE u.id=$1 AND i.organization_id=$2 AND i.project_id=$3 AND i.vendor_id=$4").bind(update).bind(scope.organization_id).bind(scope.project_id).bind(vendor).fetch_optional(&self.pool).await.map_err(Into::into)
    }
    pub async fn asset_group_update_belongs_to(
        &self,
        scope: TenantScope,
        vendor: Uuid,
        update: Uuid,
    ) -> Result<bool, StoreError> {
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM asset_group_update_intents u JOIN asset_group_create_intents i ON i.id=u.intent_id WHERE u.id=$1 AND i.organization_id=$2 AND i.project_id=$3 AND i.vendor_id=$4)").bind(update).bind(scope.organization_id).bind(scope.project_id).bind(vendor).fetch_one(&self.pool).await.map_err(Into::into)
    }
    /// Private original binding only, never a customer response. Preparation
    /// independently checks current mutation qualification before retaining data.
    pub async fn asset_group_update_request(
        &self,
        scope: TenantScope,
        vendor: Uuid,
        intent: Uuid,
        name: Option<String>,
        description: Option<String>,
    ) -> Result<Option<OrdinaryGroupUpdate>, StoreError> {
        let binding: Option<(String,String)> = sqlx::query_as("SELECT upstream_group_id,upstream_project FROM asset_group_create_intents WHERE id=$1 AND organization_id=$2 AND project_id=$3 AND vendor_id=$4 AND state='succeeded' AND upstream_group_id IS NOT NULL")
            .bind(intent).bind(scope.organization_id).bind(scope.project_id).bind(vendor).fetch_optional(&self.pool).await?;
        let Some((group, project)) = binding else {
            return Ok(None);
        };
        let original =
            OrdinaryGroupRead::new(group, project).map_err(|_| StoreError::InvalidObservation)?;
        OrdinaryGroupUpdate::new(original, name, description)
            .map(Some)
            .map_err(|_| StoreError::InvalidObservation)
    }
    /// Save once against a successful original ordinary group and exact current grant.
    /// Same identity+digest returns false; a different patch never overwrites it.
    pub async fn prepare_asset_group_update(
        &self,
        scope: TenantScope,
        input: PreparedAssetGroupUpdate,
    ) -> Result<bool, StoreError> {
        if input.patch_sha256 == [0; 32]
            || !(30..=8192).contains(&input.ciphertext.len())
            || input.ciphertext.first() != Some(&1)
        {
            return Err(StoreError::InvalidObservation);
        }
        let mut tx = self.pool.begin().await?;
        let vendor:Option<Uuid>=sqlx::query_scalar("SELECT vendor_id FROM asset_group_create_intents WHERE id=$1 AND organization_id=$2 AND project_id=$3").bind(input.intent_id).bind(scope.organization_id).bind(scope.project_id).fetch_optional(&mut *tx).await?;
        let Some(vendor) = vendor else {
            return Err(StoreError::Conflict);
        };
        sqlx::query_scalar::<_, Uuid>("SELECT id FROM vendors WHERE id=$1 FOR UPDATE")
            .bind(vendor)
            .fetch_one(&mut *tx)
            .await?;
        let grant:Option<Uuid>=sqlx::query_scalar("SELECT a.id FROM asset_group_create_intents i JOIN vendors v ON v.id=i.vendor_id AND v.revision=i.vendor_revision JOIN asset_operation_authorizations a ON a.organization_id=i.organization_id AND a.project_id=i.project_id AND a.vendor_id=i.vendor_id AND a.vendor_revision=i.vendor_revision AND a.credential_revision=i.credential_revision JOIN vendor_asset_management_credentials c ON c.vendor_id=i.vendor_id AND c.revision=i.credential_revision AND c.upstream_project=i.upstream_project WHERE i.id=$1 AND i.state='succeeded' AND i.upstream_group_id IS NOT NULL AND a.operation='UpdateAssetGroup' AND a.expires_at>clock_timestamp() AND c.credential_ciphertext IS NOT NULL AND NOT EXISTS(SELECT 1 FROM asset_operation_authorization_revocations r WHERE r.authorization_id=a.id) AND NOT EXISTS(SELECT 1 FROM vendor_asset_management_revocations r WHERE r.vendor_id=i.vendor_id AND r.through_revision>=i.credential_revision) ORDER BY a.expires_at DESC,a.id LIMIT 1")
            .bind(input.intent_id).fetch_optional(&mut *tx).await?;
        let Some(grant) = grant else {
            return Err(StoreError::Conflict);
        };
        let inserted=sqlx::query("INSERT INTO asset_group_update_intents(id,intent_id,authorization_id,patch_sha256) SELECT $1,$2,a.id,$4 FROM asset_operation_authorizations a WHERE a.id=$3 AND a.expires_at>clock_timestamp() ON CONFLICT(id) DO NOTHING")
            .bind(input.update_id).bind(input.intent_id).bind(grant).bind(input.patch_sha256.as_slice()).execute(&mut *tx).await?.rows_affected()==1;
        if !inserted {
            let identical:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM asset_group_update_intents WHERE id=$1 AND intent_id=$2 AND patch_sha256=$3)").bind(input.update_id).bind(input.intent_id).bind(input.patch_sha256.as_slice()).fetch_one(&mut *tx).await?;
            if !identical {
                return Err(StoreError::Conflict);
            }
            return Ok(false);
        }
        sqlx::query("INSERT INTO asset_group_update_patches(update_id,ciphertext) VALUES($1,$2)")
            .bind(input.update_id)
            .bind(&input.ciphertext)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(true)
    }
    /// Decoder authenticates workspace/update AAD, performs bounded local work,
    /// and returns plaintext. No I/O or network work may run inside this closure.
    /// Claim and per-group hold commit before original credentials are released.
    pub async fn claim_asset_group_update<F>(
        &self,
        scope: TenantScope,
        update: Uuid,
        decode: F,
    ) -> Result<Option<ClaimedAssetGroupUpdate>, StoreError>
    where
        F: FnOnce(&[u8]) -> Result<Vec<u8>, StoreError>,
    {
        let mut tx = self.pool.begin().await?;
        let vendor:Option<Uuid>=sqlx::query_scalar("SELECT i.vendor_id FROM asset_group_update_intents u JOIN asset_group_create_intents i ON i.id=u.intent_id WHERE u.id=$1 AND i.organization_id=$2 AND i.project_id=$3").bind(update).bind(scope.organization_id).bind(scope.project_id).fetch_optional(&mut *tx).await?;
        let Some(vendor) = vendor else {
            return Ok(None);
        };
        sqlx::query_scalar::<_, Uuid>("SELECT id FROM vendors WHERE id=$1 FOR UPDATE")
            .bind(vendor)
            .fetch_one(&mut *tx)
            .await?;
        sqlx::query("SELECT id FROM asset_group_update_intents WHERE id=$1 FOR UPDATE")
            .bind(update)
            .fetch_one(&mut *tx)
            .await?;
        let binding:Option<UpdateBinding>=sqlx::query_as("SELECT u.intent_id,a.id AS authorization_id,u.patch_sha256,p.ciphertext,i.credential_revision AS revision,i.upstream_project AS project,i.upstream_group_id AS group_id FROM asset_group_update_intents u JOIN asset_group_update_patches p ON p.update_id=u.id JOIN asset_group_create_intents i ON i.id=u.intent_id JOIN asset_operation_authorizations a ON a.id=u.authorization_id JOIN vendors v ON v.id=i.vendor_id AND v.revision=i.vendor_revision JOIN vendor_asset_management_credentials c ON c.vendor_id=i.vendor_id AND c.revision=i.credential_revision AND c.upstream_project=i.upstream_project WHERE u.id=$1 AND i.state='succeeded' AND a.operation='UpdateAssetGroup' AND a.expires_at>clock_timestamp() AND c.credential_ciphertext IS NOT NULL AND p.ciphertext IS NOT NULL AND p.expires_at>clock_timestamp() AND NOT EXISTS(SELECT 1 FROM asset_operation_authorization_revocations r WHERE r.authorization_id=a.id) AND NOT EXISTS(SELECT 1 FROM vendor_asset_management_revocations r WHERE r.vendor_id=i.vendor_id AND r.through_revision>=i.credential_revision) AND NOT EXISTS(SELECT 1 FROM asset_group_update_claims claim WHERE claim.update_id=u.id) AND NOT EXISTS(SELECT 1 FROM asset_group_update_holds hold WHERE hold.intent_id=i.id) AND NOT EXISTS(SELECT 1 FROM asset_group_deletion_claims deletion JOIN asset_group_create_intents original ON original.id=deletion.intent_id WHERE original.vendor_id=i.vendor_id AND original.credential_revision=i.credential_revision AND original.upstream_project=i.upstream_project AND original.upstream_group_id=i.upstream_group_id) FOR UPDATE OF p")
            .bind(update).fetch_optional(&mut *tx).await?;
        let Some(UpdateBinding {
            intent_id: intent,
            authorization_id,
            patch_sha256: digest,
            ciphertext,
            revision,
            project,
            group_id: group,
        }) = binding
        else {
            return Ok(None);
        };
        let plaintext = decode(&ciphertext)?;
        if plaintext.len() > 8192 || Sha256::digest(&plaintext).as_slice() != digest.as_slice() {
            return Err(StoreError::InvalidObservation);
        }
        let original = OrdinaryGroupRead::new(group, project.clone())
            .map_err(|_| StoreError::InvalidObservation)?;
        let request = OrdinaryGroupUpdate::restore_private(&plaintext, original)
            .map_err(|_| StoreError::InvalidObservation)?;
        let inserted=sqlx::query("INSERT INTO asset_group_update_claims(update_id) SELECT u.id FROM asset_group_update_intents u JOIN asset_operation_authorizations a ON a.id=u.authorization_id JOIN asset_group_update_patches p ON p.update_id=u.id WHERE u.id=$1 AND a.expires_at>clock_timestamp() AND p.expires_at>clock_timestamp() AND p.ciphertext IS NOT NULL AND NOT EXISTS(SELECT 1 FROM asset_operation_authorization_revocations r WHERE r.authorization_id=a.id) ON CONFLICT DO NOTHING").bind(update).execute(&mut *tx).await?.rows_affected()==1;
        if !inserted {
            return Ok(None);
        }
        sqlx::query("INSERT INTO asset_group_update_holds(intent_id,update_id) VALUES($1,$2)")
            .bind(intent)
            .bind(update)
            .execute(&mut *tx)
            .await?;
        let credential=sqlx::query_as::<_,AssetManagementCredentialRevision>("SELECT vendor_id,revision,upstream_project,credential_ciphertext FROM vendor_asset_management_credentials WHERE vendor_id=$1 AND revision=$2 AND upstream_project=$3 AND credential_ciphertext IS NOT NULL").bind(vendor).bind(revision).bind(project).fetch_one(&mut *tx).await?;
        tx.commit().await?;
        Ok(Some(ClaimedAssetGroupUpdate {
            update_id: update,
            authorization_id,
            credential,
            request,
        }))
    }
    /// Erase patch content; a committed claim/hold and its uncertainty survive.
    pub async fn delete_asset_group_update_patch(
        &self,
        scope: TenantScope,
        update: Uuid,
    ) -> Result<bool, StoreError> {
        let mut tx = self.pool.begin().await?;
        let found:Option<Uuid>=sqlx::query_scalar("SELECT u.id FROM asset_group_update_intents u JOIN asset_group_create_intents i ON i.id=u.intent_id WHERE u.id=$1 AND i.organization_id=$2 AND i.project_id=$3 FOR UPDATE OF u").bind(update).bind(scope.organization_id).bind(scope.project_id).fetch_optional(&mut *tx).await?;
        if found.is_none() {
            return Ok(false);
        }
        let changed=sqlx::query("UPDATE asset_group_update_patches SET ciphertext=NULL,deleted_at=clock_timestamp() WHERE update_id=$1 AND ciphertext IS NOT NULL").bind(update).execute(&mut *tx).await?.rows_affected()==1;
        tx.commit().await?;
        Ok(changed)
    }
    pub async fn purge_expired_asset_group_update_patches(&self) -> Result<(), StoreError> {
        self.execute_content_retention("SELECT niu_purge_asset_content_page('group_update')")
            .await?;
        Ok(())
    }
    /// Reconcile an acknowledged mutation using its retained patch and a fresh
    /// successful bound read. Decoder authenticates both distinct AAD domains
    /// and returns plaintext patch plus read metadata; bounded local work only.
    /// No mutation is replayed. Uncertain outcomes cannot release their hold.
    pub async fn reconcile_asset_group_update<F>(
        &self,
        scope: TenantScope,
        update: Uuid,
        read: Uuid,
        decode: F,
    ) -> Result<bool, StoreError>
    where
        F: FnOnce(
            &[u8],
            &[u8],
        )
            -> Result<(Vec<u8>, niu_media::asset_read::OrdinaryGroupDetails), StoreError>,
    {
        let mut tx = self.pool.begin().await?;
        let vendor: Option<Uuid> = sqlx::query_scalar("SELECT i.vendor_id FROM asset_group_update_intents u JOIN asset_group_create_intents i ON i.id=u.intent_id WHERE u.id=$1 AND i.organization_id=$2 AND i.project_id=$3")
            .bind(update).bind(scope.organization_id).bind(scope.project_id).fetch_optional(&mut *tx).await?;
        let Some(vendor) = vendor else {
            return Ok(false);
        };
        sqlx::query_scalar::<_, Uuid>("SELECT id FROM vendors WHERE id=$1 FOR UPDATE")
            .bind(vendor)
            .fetch_one(&mut *tx)
            .await?;
        sqlx::query("SELECT id FROM asset_group_update_intents WHERE id=$1 FOR UPDATE")
            .bind(update)
            .fetch_one(&mut *tx)
            .await?;
        sqlx::query("SELECT id FROM asset_group_read_claims WHERE id=$1 FOR UPDATE")
            .bind(read)
            .fetch_optional(&mut *tx)
            .await?;
        let binding: Option<ReconciliationBinding> = sqlx::query_as("SELECT u.patch_sha256,p.ciphertext AS patch_ciphertext,result.ciphertext AS read_ciphertext,i.upstream_group_id AS group_id,i.upstream_project AS project FROM asset_group_update_intents u JOIN asset_group_create_intents i ON i.id=u.intent_id JOIN asset_group_update_outcomes o ON o.update_id=u.id AND o.outcome='acknowledged' JOIN asset_group_update_holds h ON h.update_id=u.id AND h.intent_id=i.id JOIN asset_group_update_patches p ON p.update_id=u.id JOIN asset_group_update_reads b ON b.update_id=u.id AND b.read_id=$2 JOIN asset_group_read_claims r ON r.id=b.read_id AND r.intent_id=i.id AND r.created_at>=o.created_at JOIN asset_group_read_outcomes ro ON ro.read_id=r.id AND ro.outcome='succeeded' JOIN asset_group_read_results result ON result.read_id=r.id JOIN asset_operation_authorizations a ON a.id=r.authorization_id AND a.operation='GetAssetGroup' JOIN vendors v ON v.id=i.vendor_id AND v.revision=i.vendor_revision JOIN vendor_asset_management_credentials c ON c.vendor_id=i.vendor_id AND c.revision=i.credential_revision AND c.upstream_project=i.upstream_project WHERE u.id=$1 AND i.state='succeeded' AND p.ciphertext IS NOT NULL AND p.expires_at>clock_timestamp() AND result.ciphertext IS NOT NULL AND result.expires_at>clock_timestamp() AND a.expires_at>clock_timestamp() AND c.credential_ciphertext IS NOT NULL AND NOT EXISTS(SELECT 1 FROM asset_operation_authorization_revocations revoked WHERE revoked.authorization_id=a.id) AND NOT EXISTS(SELECT 1 FROM vendor_asset_management_revocations revoked WHERE revoked.vendor_id=i.vendor_id AND revoked.through_revision>=i.credential_revision) AND NOT EXISTS(SELECT 1 FROM asset_group_update_reconciliations existing WHERE existing.update_id=u.id) FOR UPDATE OF p,result")
            .bind(update).bind(read).fetch_optional(&mut *tx).await?;
        let Some(binding) = binding else {
            return Ok(false);
        };
        let (patch, observed) = decode(&binding.patch_ciphertext, &binding.read_ciphertext)?;
        if patch.len() > 8192
            || Sha256::digest(&patch).as_slice() != binding.patch_sha256.as_slice()
        {
            return Err(StoreError::InvalidObservation);
        }
        let original = OrdinaryGroupRead::new(binding.group_id, binding.project)
            .map_err(|_| StoreError::InvalidObservation)?;
        let request = OrdinaryGroupUpdate::restore_private(&patch, original)
            .map_err(|_| StoreError::InvalidObservation)?;
        request
            .verify_metadata(&observed)
            .map_err(|_| StoreError::InvalidObservation)?;
        sqlx::query(
            "INSERT INTO asset_group_update_reconciliations(update_id,read_id) VALUES($1,$2)",
        )
        .bind(update)
        .bind(read)
        .execute(&mut *tx)
        .await?;
        sqlx::query("DELETE FROM asset_group_update_holds WHERE update_id=$1")
            .bind(update)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(true)
    }
    /// Immutable first completion, including after revocation or patch erasure.
    /// Only claimed work can complete; uncertainty never becomes a false failure.
    pub async fn record_asset_group_update_outcome(
        &self,
        scope: TenantScope,
        update: Uuid,
        outcome: AssetGroupUpdateOutcome<'_>,
        duration_ms: i64,
    ) -> Result<bool, StoreError> {
        let reason = match outcome {
            AssetGroupUpdateOutcome::Acknowledged => None,
            AssetGroupUpdateOutcome::Uncertain { reason } => Some(reason),
        };
        if duration_ms < 0
            || reason.is_some_and(|v| {
                !matches!(
                    v,
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
        Ok(sqlx::query("INSERT INTO asset_group_update_outcomes(update_id,outcome,reason,duration_ms) SELECT c.update_id,$4,$5,$6 FROM asset_group_update_claims c JOIN asset_group_update_intents u ON u.id=c.update_id JOIN asset_group_create_intents i ON i.id=u.intent_id WHERE c.update_id=$1 AND i.organization_id=$2 AND i.project_id=$3 ON CONFLICT(update_id) DO NOTHING")
            .bind(update).bind(scope.organization_id).bind(scope.project_id).bind(if reason.is_none(){"acknowledged"}else{"uncertain"}).bind(reason).bind(duration_ms).execute(&self.pool).await?.rows_affected()==1)
    }
    /// Scoped administrative audit only. No patch content, upstream ID or costs.
    /// Acknowledged remains unverified until a separate read-back reconciliation.
    pub async fn asset_group_update_history(
        &self,
        scope: TenantScope,
        vendor: Uuid,
        after: Option<Uuid>,
        limit: i64,
    ) -> Result<Vec<serde_json::Value>, StoreError> {
        if !(1..=101).contains(&limit) {
            return Err(StoreError::InvalidObservation);
        }
        Ok(sqlx::query_scalar("SELECT jsonb_build_object('update_id',u.id,'intent_id',u.intent_id,'status',CASE WHEN EXISTS(SELECT 1 FROM asset_group_update_reconciliations reconciled WHERE reconciled.update_id=u.id) THEN 'reconciled' WHEN o.outcome IS NOT NULL THEN o.outcome WHEN c.update_id IS NOT NULL THEN 'unresolved' ELSE 'prepared' END,'created_at',u.created_at,'completed_at',o.created_at,'duration_ms',o.duration_ms,'reason',o.reason,'patch_status',CASE WHEN p.expires_at<=clock_timestamp() THEN 'expired' WHEN p.ciphertext IS NULL THEN 'erased' ELSE 'retained' END,'reconciliation_required',EXISTS(SELECT 1 FROM asset_group_update_holds hold WHERE hold.update_id=u.id)) FROM asset_group_update_intents u JOIN asset_group_create_intents i ON i.id=u.intent_id JOIN asset_group_update_patches p ON p.update_id=u.id LEFT JOIN asset_group_update_claims c ON c.update_id=u.id LEFT JOIN asset_group_update_outcomes o ON o.update_id=u.id WHERE i.organization_id=$1 AND i.project_id=$2 AND i.vendor_id=$3 AND ($4::uuid IS NULL OR (u.created_at,u.id)<(SELECT cursor.created_at,cursor.id FROM asset_group_update_intents cursor JOIN asset_group_create_intents original ON original.id=cursor.intent_id WHERE cursor.id=$4 AND original.organization_id=$1 AND original.project_id=$2 AND original.vendor_id=$3)) ORDER BY u.created_at DESC,u.id DESC LIMIT $5")
            .bind(scope.organization_id).bind(scope.project_id).bind(vendor).bind(after).bind(limit).fetch_all(&self.pool).await?)
    }
}
