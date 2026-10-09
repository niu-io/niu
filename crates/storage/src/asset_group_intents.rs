//! Internal asset intent persistence. Caller must authorize the workspace and
//! qualify upstream rights. A claimed intent must never be automatically replayed.
use crate::{AssetManagementCredentialRevision, Store, StoreError, TenantScope};
use niu_media::asset_group::OrdinaryAssetGroupCreate;
use serde_json::Value;
use uuid::Uuid;

/// Internal request data; deliberately neither Debug nor Serialize.
#[derive(sqlx::FromRow)]
pub struct AssetGroupCreateIntent {
    pub id: Uuid,
    pub vendor_id: Uuid,
    pub vendor_revision: i64,
    pub credential_revision: i64,
    pub upstream_project: String,
    pub request_body: Option<Value>,
    pub request_fingerprint: Vec<u8>,
    pub state: String,
    pub upstream_group_id: Option<String>,
}
/// Recovery discovery omits request contents and credential ciphertext.
#[derive(sqlx::FromRow)]
pub struct AssetGroupReconciliationCandidate {
    pub id: Uuid,
    pub vendor_id: Uuid,
    pub vendor_revision: i64,
    pub credential_revision: i64,
    pub state: String,
}
/// One-shot dispatch handoff. Neither request data nor key material can be
/// serialized or formatted through this type.
pub struct ClaimedAssetGroupCreate {
    pub intent: AssetGroupCreateIntent,
    pub credential: AssetManagementCredentialRevision,
    request: OrdinaryAssetGroupCreate,
    /// Internal reference to the reviewed qualification consumed by this claim.
    pub authorization_id: Uuid,
}
impl ClaimedAssetGroupCreate {
    /// The validated ordinary request for the original upstream project.
    pub fn request(&self) -> &OrdinaryAssetGroupCreate {
        &self.request
    }
}
impl Store {
    /// Customer-safe local discovery. IDs are routing references, never labels.
    pub async fn asset_group_request_summaries(
        &self,
        scope: TenantScope,
        after: Option<Uuid>,
        limit: i64,
    ) -> Result<Vec<Value>, StoreError> {
        if !(1..=101).contains(&limit) {
            return Err(StoreError::InvalidObservation);
        }
        Ok(sqlx::query_scalar("SELECT jsonb_build_object('id',i.id,'name',CASE WHEN i.request_expires_at>clock_timestamp() THEN i.request_body->'Name' ELSE NULL END,'status',i.state,'created_at',i.created_at,'request_content_status',CASE WHEN EXISTS (SELECT 1 FROM asset_group_request_deletions d WHERE d.intent_id=i.id) THEN 'deleted' WHEN i.request_expires_at<=clock_timestamp() THEN 'expired' ELSE 'retained' END) FROM asset_group_create_intents i WHERE organization_id=$1 AND project_id=$2 AND ($3::uuid IS NULL OR id>$3) ORDER BY id LIMIT $4")
            .bind(scope.organization_id).bind(scope.project_id).bind(after).bind(limit)
            .fetch_all(&self.pool).await?)
    }

    /// Customer projection excludes account bindings, fingerprints and key data.
    pub async fn asset_group_request_detail(
        &self,
        scope: TenantScope,
        intent: Uuid,
    ) -> Result<Option<Value>, StoreError> {
        Ok(sqlx::query_scalar("SELECT jsonb_build_object('status',i.state,'created_at',i.created_at,'dispatch',(SELECT jsonb_build_object('outcome',o.outcome,'reason',o.reason,'duration_ms',o.duration_ms) FROM asset_group_dispatch_outcomes o WHERE o.intent_id=i.id),'request_content_status',CASE WHEN EXISTS (SELECT 1 FROM asset_group_request_deletions d WHERE d.intent_id=i.id) THEN 'deleted' WHEN i.request_expires_at<=clock_timestamp() THEN 'expired' ELSE 'retained' END,'request',CASE WHEN i.request_body IS NOT NULL AND i.request_expires_at>clock_timestamp() THEN jsonb_build_object('name',i.request_body->'Name','description',i.request_body->'Description') ELSE NULL END) FROM asset_group_create_intents i WHERE organization_id=$1 AND project_id=$2 AND id=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(intent).fetch_optional(&self.pool).await?)
    }

    /// Caller must authorize content deletion for this workspace. The immutable
    /// event prevents restoration; already dispatched operations remain subject
    /// to local reconciliation rather than upstream replay.
    pub async fn delete_asset_group_request(
        &self,
        scope: TenantScope,
        intent: Uuid,
    ) -> Result<bool, StoreError> {
        let mut tx = self.pool.begin().await?;
        let found = sqlx::query_scalar::<_,Uuid>("SELECT id FROM asset_group_create_intents WHERE organization_id=$1 AND project_id=$2 AND id=$3 FOR UPDATE")
            .bind(scope.organization_id).bind(scope.project_id).bind(intent).fetch_optional(&mut *tx).await?;
        if found.is_none() {
            return Ok(false);
        }
        sqlx::query("INSERT INTO asset_group_request_deletions(intent_id) VALUES($1) ON CONFLICT DO NOTHING").bind(intent).execute(&mut *tx).await?;
        let changed=sqlx::query("UPDATE asset_group_create_intents SET request_body=NULL WHERE id=$1 AND request_body IS NOT NULL").bind(intent).execute(&mut *tx).await?.rows_affected();
        tx.commit().await?;
        Ok(changed == 1)
    }

    /// Remove expired request content in bounded batches while preserving the
    /// original intent, fingerprint and reconciliation state.
    pub async fn purge_expired_asset_group_requests(&self) -> Result<u64, StoreError> {
        Ok(sqlx::query("UPDATE asset_group_create_intents SET request_body=NULL WHERE id IN (SELECT id FROM asset_group_create_intents WHERE request_body IS NOT NULL AND request_expires_at<=clock_timestamp() ORDER BY request_expires_at,id LIMIT 500 FOR UPDATE SKIP LOCKED)").execute(&self.pool).await?.rows_affected())
    }

    /// Bounded local discovery only. A candidate is never permission to create
    /// again. Start a new scan without a cursor to revisit unresolved records.
    pub async fn asset_group_reconciliation_candidates(
        &self,
        scope: TenantScope,
        after: Option<Uuid>,
        limit: i64,
        minimum_age_seconds: i32,
    ) -> Result<Vec<AssetGroupReconciliationCandidate>, StoreError> {
        if !(1..=100).contains(&limit) || !(0..=86400 * 30).contains(&minimum_age_seconds) {
            return Err(StoreError::InvalidVendor);
        }
        Ok(sqlx::query_as("SELECT id,vendor_id,vendor_revision,credential_revision,state FROM asset_group_create_intents WHERE organization_id=$1 AND project_id=$2 AND state IN ('dispatching','uncertain') AND ($3::uuid IS NULL OR id>$3) AND updated_at<=clock_timestamp()-make_interval(secs=>$5::double precision) ORDER BY id LIMIT $4")
            .bind(scope.organization_id).bind(scope.project_id).bind(after).bind(limit).bind(minimum_age_seconds).fetch_all(&self.pool).await?)
    }

    /// Local recovery reads remain available after credential revocation. No
    /// upstream call or retry permission is implied by this record.
    pub async fn asset_group_create_intent(
        &self,
        scope: TenantScope,
        intent: Uuid,
    ) -> Result<Option<AssetGroupCreateIntent>, StoreError> {
        Ok(sqlx::query_as("SELECT id,vendor_id,vendor_revision,credential_revision,upstream_project,CASE WHEN request_expires_at>clock_timestamp() THEN request_body ELSE NULL END AS request_body,request_fingerprint,state,upstream_group_id FROM asset_group_create_intents WHERE organization_id=$1 AND project_id=$2 AND id=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(intent).fetch_optional(&self.pool).await?)
    }

    /// Match saved identity before capacity/key checks. This never reconstructs
    /// erased contents or grants dispatch rights; prepared records still need claim.
    pub async fn asset_group_create_replay(
        &self,
        scope: TenantScope,
        idempotency_key: Uuid,
        vendor: Uuid,
        credential_revision: i64,
        request: &OrdinaryAssetGroupCreate,
    ) -> Result<Option<AssetGroupCreateIntent>, StoreError> {
        let saved:Option<AssetGroupCreateIntent>=sqlx::query_as("SELECT id,vendor_id,vendor_revision,credential_revision,upstream_project,NULL::jsonb AS request_body,request_fingerprint,state,upstream_group_id FROM asset_group_create_intents WHERE organization_id=$1 AND project_id=$2 AND idempotency_key=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(idempotency_key).fetch_optional(&self.pool).await?;
        let Some(saved) = saved else {
            return Ok(None);
        };
        let body = request
            .body(&saved.upstream_project)
            .map_err(|_| StoreError::InvalidVendor)?;
        let fingerprint: Vec<u8> =
            sqlx::query_scalar("SELECT sha256(convert_to($1::jsonb::text,'UTF8'))")
                .bind(&body)
                .fetch_one(&self.pool)
                .await?;
        if saved.vendor_id != vendor
            || saved.credential_revision != credential_revision
            || saved.request_fingerprint != fingerprint
        {
            return Err(StoreError::Conflict);
        }
        Ok(Some(saved))
    }

    pub async fn prepare_asset_group_create(
        &self,
        scope: TenantScope,
        idempotency_key: Uuid,
        vendor: Uuid,
        credential_revision: i64,
        request: &OrdinaryAssetGroupCreate,
    ) -> Result<AssetGroupCreateIntent, StoreError> {
        let mut tx = self.pool.begin().await?;
        let vendor_revision =
            sqlx::query_scalar::<_, i64>("SELECT revision FROM vendors WHERE id=$1 FOR UPDATE")
                .bind(vendor)
                .fetch_optional(&mut *tx)
                .await?
                .ok_or(StoreError::Conflict)?;
        let project: String = sqlx::query_scalar("SELECT c.upstream_project FROM vendor_asset_management_credentials c WHERE c.vendor_id=$1 AND c.revision=$2 AND c.credential_ciphertext IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vendor_asset_management_revocations r WHERE r.vendor_id=c.vendor_id AND r.through_revision>=c.revision)")
            .bind(vendor).bind(credential_revision).fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        let body = request
            .body(&project)
            .map_err(|_| StoreError::InvalidVendor)?;
        sqlx::query("INSERT INTO asset_group_create_intents(id,organization_id,project_id,idempotency_key,vendor_id,credential_revision,upstream_project,request_body,vendor_revision,request_fingerprint,request_expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,sha256(convert_to($8::jsonb::text,'UTF8')),clock_timestamp()+interval '24 hours') ON CONFLICT (organization_id,project_id,idempotency_key) DO NOTHING")
            .bind(Uuid::new_v4()).bind(scope.organization_id).bind(scope.project_id).bind(idempotency_key).bind(vendor).bind(credential_revision).bind(&project).bind(&body).bind(vendor_revision).execute(&mut *tx).await?;
        let saved: AssetGroupCreateIntent = sqlx::query_as("SELECT id,vendor_id,vendor_revision,credential_revision,upstream_project,CASE WHEN request_expires_at>clock_timestamp() THEN request_body ELSE NULL END AS request_body,request_fingerprint,state,upstream_group_id FROM asset_group_create_intents WHERE organization_id=$1 AND project_id=$2 AND idempotency_key=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(idempotency_key).fetch_one(&mut *tx).await?;
        let fingerprint: Vec<u8> =
            sqlx::query_scalar("SELECT sha256(convert_to($1::jsonb::text,'UTF8'))")
                .bind(&body)
                .fetch_one(&mut *tx)
                .await?;
        if saved.vendor_revision != vendor_revision
            || saved.vendor_id != vendor
            || saved.credential_revision != credential_revision
            || saved.upstream_project != project
            || saved.request_fingerprint != fingerprint
        {
            return Err(StoreError::Conflict);
        }
        tx.commit().await?;
        Ok(saved)
    }

    /// Exactly one dispatcher can claim. Dispatching survives crashes and is
    /// reconciliation work, never evidence that an upstream create did not occur.
    pub async fn claim_asset_group_create(
        &self,
        scope: TenantScope,
        intent: Uuid,
    ) -> Result<bool, StoreError> {
        Ok(self
            .claim_asset_group_create_credentials(scope, intent)
            .await?
            .is_some())
    }

    pub async fn claim_asset_group_create_credentials(
        &self,
        scope: TenantScope,
        intent: Uuid,
    ) -> Result<Option<ClaimedAssetGroupCreate>, StoreError> {
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
        // Revocation uses the same vendor lock; expiry is rechecked at transition.
        let authorization: Option<Uuid> = sqlx::query_scalar("SELECT a.id FROM asset_operation_authorizations a JOIN asset_group_create_intents i ON i.organization_id=a.organization_id AND i.project_id=a.project_id AND i.vendor_id=a.vendor_id AND i.vendor_revision=a.vendor_revision AND i.credential_revision=a.credential_revision WHERE i.id=$1 AND a.operation='CreateAssetGroup' AND a.expires_at>clock_timestamp() AND NOT EXISTS(SELECT 1 FROM asset_operation_authorization_revocations r WHERE r.authorization_id=a.id) ORDER BY a.expires_at DESC,a.id LIMIT 1")
            .bind(intent).fetch_optional(&mut *tx).await?;
        let Some(authorization_id) = authorization else {
            return Ok(None);
        };
        let changed = sqlx::query("UPDATE asset_group_create_intents i SET state='dispatching',updated_at=clock_timestamp() WHERE organization_id=$1 AND project_id=$2 AND id=$3 AND state='prepared' AND request_body IS NOT NULL AND request_expires_at>clock_timestamp() AND vendor_revision>0 AND EXISTS(SELECT 1 FROM asset_operation_authorizations a WHERE a.id=$4 AND a.expires_at>clock_timestamp() AND NOT EXISTS(SELECT 1 FROM asset_operation_authorization_revocations r WHERE r.authorization_id=a.id)) AND EXISTS (SELECT 1 FROM vendors v WHERE v.id=i.vendor_id AND v.revision=i.vendor_revision) AND EXISTS (SELECT 1 FROM vendor_asset_management_credentials c WHERE c.vendor_id=i.vendor_id AND c.revision=i.credential_revision AND c.upstream_project=i.upstream_project AND c.credential_ciphertext IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vendor_asset_management_revocations r WHERE r.vendor_id=c.vendor_id AND r.through_revision>=c.revision))")
            .bind(scope.organization_id).bind(scope.project_id).bind(intent).bind(authorization_id).execute(&mut *tx).await?.rows_affected();
        if changed != 1 {
            return Ok(None);
        }
        let saved: AssetGroupCreateIntent = sqlx::query_as("SELECT id,vendor_id,vendor_revision,credential_revision,upstream_project,request_body,request_fingerprint,state,upstream_group_id FROM asset_group_create_intents WHERE organization_id=$1 AND project_id=$2 AND id=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(intent).fetch_one(&mut *tx).await?;
        let request = OrdinaryAssetGroupCreate::from_saved_body(
            saved
                .request_body
                .as_ref()
                .ok_or(StoreError::InvalidVendor)?,
            &saved.upstream_project,
        )
        .map_err(|_| StoreError::InvalidVendor)?;
        let credential: AssetManagementCredentialRevision = sqlx::query_as("SELECT vendor_id,revision,upstream_project,credential_ciphertext FROM vendor_asset_management_credentials WHERE vendor_id=$1 AND revision=$2 AND upstream_project=$3 AND credential_ciphertext IS NOT NULL")
            .bind(saved.vendor_id).bind(saved.credential_revision).bind(&saved.upstream_project).fetch_one(&mut *tx).await?;
        sqlx::query("INSERT INTO asset_group_dispatch_authorizations(intent_id,authorization_id) VALUES($1,$2)")
            .bind(intent).bind(authorization_id).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(Some(ClaimedAssetGroupCreate {
            intent: saved,
            credential,
            request,
            authorization_id,
        }))
    }
    /// Finalize the first dispatch outcome and measured duration atomically.
    /// This audit never debits an account or turns uncertainty into replay rights.
    pub async fn record_asset_group_dispatch_outcome(
        &self,
        scope: TenantScope,
        intent: Uuid,
        upstream_group: Option<&str>,
        reason: Option<&str>,
        duration_ms: i64,
    ) -> Result<bool, StoreError> {
        if duration_ms < 0
            || upstream_group.is_some() == reason.is_some()
            || reason.is_some_and(|value| {
                !matches!(
                    value,
                    "invalid_configuration"
                        | "destination_rejected"
                        | "upstream_uncertain"
                        | "timeout"
                )
            })
        {
            return Err(StoreError::InvalidObservation);
        }
        if upstream_group.is_some_and(|group| {
            !group.starts_with("group-")
                || !(7..=128).contains(&group.len())
                || !group
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_'))
        }) {
            return Err(StoreError::InvalidVendor);
        }
        let outcome = if upstream_group.is_some() {
            "succeeded"
        } else {
            "uncertain"
        };
        let mut tx = self.pool.begin().await?;
        let changed=sqlx::query("UPDATE asset_group_create_intents SET state=$4,upstream_group_id=$5,updated_at=clock_timestamp() WHERE organization_id=$1 AND project_id=$2 AND id=$3 AND state='dispatching'")
            .bind(scope.organization_id).bind(scope.project_id).bind(intent).bind(outcome).bind(upstream_group)
            .execute(&mut *tx).await?.rows_affected();
        if changed != 1 {
            return Ok(false);
        }
        sqlx::query("INSERT INTO asset_group_dispatch_outcomes(intent_id,outcome,reason,duration_ms) VALUES($1,$2,$3,$4)")
            .bind(intent).bind(outcome).bind(reason).bind(duration_ms).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(true)
    }

    /// Record uncertainty without making the intent eligible for another claim.
    pub async fn mark_asset_group_create_uncertain(
        &self,
        scope: TenantScope,
        intent: Uuid,
    ) -> Result<bool, StoreError> {
        Ok(sqlx::query("UPDATE asset_group_create_intents SET state='uncertain',updated_at=clock_timestamp() WHERE organization_id=$1 AND project_id=$2 AND id=$3 AND state='dispatching'")
            .bind(scope.organization_id).bind(scope.project_id).bind(intent).execute(&self.pool).await?.rows_affected()==1)
    }

    /// Caller must supply an independently verified upstream receipt. Local
    /// reconciliation does not require the original key to remain unrevoked.
    pub async fn complete_asset_group_create(
        &self,
        scope: TenantScope,
        intent: Uuid,
        group: &str,
    ) -> Result<bool, StoreError> {
        if !group.starts_with("group-")
            || !(7..=128).contains(&group.len())
            || !group
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_'))
        {
            return Err(StoreError::InvalidVendor);
        }
        Ok(sqlx::query("UPDATE asset_group_create_intents SET state='succeeded',upstream_group_id=$4,updated_at=clock_timestamp() WHERE organization_id=$1 AND project_id=$2 AND id=$3 AND state IN ('dispatching','uncertain')")
            .bind(scope.organization_id).bind(scope.project_id).bind(intent).bind(group).execute(&self.pool).await?.rows_affected()==1)
    }
}
