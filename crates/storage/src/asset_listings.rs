//! One-shot original-group listing claims. Current platform access is caller-owned.
use crate::{AssetManagementCredentialRevision, Store, StoreError, TenantScope};
use niu_media::asset_list::OrdinaryAssetList;
use uuid::Uuid;

/// Private original credentials and scoped request; never diagnostic/display data.
pub struct ClaimedAssetListing {
    pub listing_id: Uuid,
    pub authorization_id: Uuid,
    pub credential: AssetManagementCredentialRevision,
    request: OrdinaryAssetList,
}
impl ClaimedAssetListing {
    pub fn request(&self) -> &OrdinaryAssetList {
        &self.request
    }
}
/// Caller decrypts and validates this exact parent's snapshot before obtaining
/// its next request. No external cursor or arbitrary scope is accepted here.
pub struct AssetListingContinuation {
    pub previous_listing_id: Uuid,
    pub expected_ciphertext: Vec<u8>,
    pub request: OrdinaryAssetList,
}
pub enum AssetListingOutcome<'a> {
    Succeeded { item_count: u8, has_more: bool },
    Failed { reason: &'a str },
}
impl Store {
    /// Account-locked qualification check and immutable audit commit precede
    /// credential release. A repeated listing identity never releases keys again.
    /// No transaction or account lock is held across network I/O.
    pub async fn claim_asset_listing(
        &self,
        scope: TenantScope,
        intent: Uuid,
        listing_id: Uuid,
        maximum_items: u8,
    ) -> Result<Option<ClaimedAssetListing>, StoreError> {
        self.claim_asset_listing_page(scope, intent, listing_id, maximum_items, None)
            .await
    }

    pub async fn claim_asset_listing_continuation(
        &self,
        scope: TenantScope,
        intent: Uuid,
        listing_id: Uuid,
        continuation: AssetListingContinuation,
    ) -> Result<Option<ClaimedAssetListing>, StoreError> {
        if continuation.previous_listing_id == listing_id {
            return Ok(None);
        }
        let maximum_items = continuation.request.maximum_items();
        if !continuation.request.is_continuation()
            || !(30..=131072).contains(&continuation.expected_ciphertext.len())
        {
            return Err(StoreError::InvalidObservation);
        }
        self.claim_asset_listing_page(scope, intent, listing_id, maximum_items, Some(continuation))
            .await
    }

    async fn claim_asset_listing_page(
        &self,
        scope: TenantScope,
        intent: Uuid,
        listing_id: Uuid,
        maximum_items: u8,
        continuation: Option<AssetListingContinuation>,
    ) -> Result<Option<ClaimedAssetListing>, StoreError> {
        let parent = continuation.as_ref().map(|c| c.previous_listing_id);
        if !(1..=100).contains(&maximum_items) {
            return Err(StoreError::InvalidObservation);
        }
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
        let binding: Option<(Uuid, i64, String, String)> = sqlx::query_as("SELECT a.id,i.credential_revision,i.upstream_project,i.upstream_group_id FROM asset_group_create_intents i JOIN vendors v ON v.id=i.vendor_id AND v.revision=i.vendor_revision JOIN asset_operation_authorizations a ON a.organization_id=i.organization_id AND a.project_id=i.project_id AND a.vendor_id=i.vendor_id AND a.vendor_revision=i.vendor_revision AND a.credential_revision=i.credential_revision JOIN vendor_asset_management_credentials c ON c.vendor_id=i.vendor_id AND c.revision=i.credential_revision AND c.upstream_project=i.upstream_project WHERE i.organization_id=$1 AND i.project_id=$2 AND i.id=$3 AND i.state='succeeded' AND i.upstream_group_id IS NOT NULL AND ($4::uuid IS NULL OR a.id=(SELECT authorization_id FROM asset_listing_claims WHERE id=$4 AND intent_id=i.id)) AND a.operation='ListAssets' AND a.expires_at>clock_timestamp() AND c.credential_ciphertext IS NOT NULL AND NOT EXISTS(SELECT 1 FROM asset_operation_authorization_revocations r WHERE r.authorization_id=a.id) AND NOT EXISTS(SELECT 1 FROM vendor_asset_management_revocations r WHERE r.vendor_id=i.vendor_id AND r.through_revision>=i.credential_revision) ORDER BY a.expires_at DESC,a.id LIMIT 1")
            .bind(scope.organization_id).bind(scope.project_id).bind(intent).bind(parent).fetch_optional(&mut *tx).await?;
        let Some((authorization_id, revision, project, group)) = binding else {
            return Ok(None);
        };
        let original = OrdinaryAssetList::first_page(group, project.clone(), maximum_items)
            .map_err(|_| StoreError::InvalidVendor)?;
        let (request, page_number, parent_snapshot) = if let Some(continuation) = continuation {
            if !continuation.request.same_scope(&original) {
                return Err(StoreError::InvalidObservation);
            }
            let previous:Option<i32>=sqlx::query_scalar("SELECT r.page_number FROM asset_listing_claims r JOIN asset_listing_results result ON result.listing_id=r.id JOIN asset_listing_outcomes o ON o.listing_id=r.id WHERE r.id=$1 AND r.intent_id=$2 AND r.authorization_id=$3 AND r.maximum_items=$4 AND result.ciphertext=$5 AND result.expires_at>clock_timestamp() AND o.outcome='succeeded' AND o.has_more=true AND r.page_number<100 AND NOT EXISTS(SELECT 1 FROM asset_listing_result_deletions d WHERE d.listing_id=r.id) FOR UPDATE OF r")
                .bind(continuation.previous_listing_id).bind(intent).bind(authorization_id).bind(i32::from(maximum_items))
                .bind(&continuation.expected_ciphertext).fetch_optional(&mut *tx).await?;
            let Some(previous) = previous else {
                return Ok(None);
            };
            (
                continuation.request,
                previous + 1,
                Some(continuation.expected_ciphertext),
            )
        } else {
            (original, 1, None)
        };
        let credential: AssetManagementCredentialRevision = sqlx::query_as("SELECT vendor_id,revision,upstream_project,credential_ciphertext FROM vendor_asset_management_credentials WHERE vendor_id=$1 AND revision=$2 AND upstream_project=$3 AND credential_ciphertext IS NOT NULL")
            .bind(vendor).bind(revision).bind(project).fetch_one(&mut *tx).await?;
        let inserted = sqlx::query("INSERT INTO asset_listing_claims(id,intent_id,authorization_id,maximum_items,parent_listing_id,page_number,parent_snapshot_sha256) SELECT $1,$2,a.id,$4,$5,$6,sha256($7::bytea) FROM asset_operation_authorizations a WHERE a.id=$3 AND a.operation='ListAssets' AND a.expires_at>clock_timestamp() AND ($5::uuid IS NULL OR EXISTS(SELECT 1 FROM asset_listing_results parent_result WHERE parent_result.listing_id=$5 AND parent_result.ciphertext=$7::bytea AND parent_result.expires_at>clock_timestamp())) AND NOT EXISTS(SELECT 1 FROM asset_operation_authorization_revocations r WHERE r.authorization_id=a.id) ON CONFLICT DO NOTHING")
            .bind(listing_id).bind(intent).bind(authorization_id).bind(i32::from(maximum_items)).bind(parent).bind(page_number)
            .bind(parent_snapshot).execute(&mut *tx).await?.rows_affected();
        if inserted != 1 {
            return Ok(None);
        }
        tx.commit().await?;
        Ok(Some(ClaimedAssetListing {
            listing_id,
            authorization_id,
            credential,
            request,
        }))
    }

    /// Immutable first completion, with safe categories and bounded page counts.
    /// Does not store page content, authorize reuse, or change customer charges.
    pub async fn record_asset_listing_outcome(
        &self,
        scope: TenantScope,
        listing_id: Uuid,
        outcome: AssetListingOutcome<'_>,
        duration_ms: i64,
    ) -> Result<bool, StoreError> {
        self.complete_asset_listing(scope, listing_id, outcome, duration_ms, None)
            .await
    }

    /// Opaque encrypted page and success audit commit together. Caller owns
    /// authenticated encryption, page validation and platform authorization.
    pub async fn save_asset_listing_result(
        &self,
        scope: TenantScope,
        listing_id: Uuid,
        outcome: AssetListingOutcome<'_>,
        duration_ms: i64,
        ciphertext: &[u8],
    ) -> Result<bool, StoreError> {
        if !matches!(outcome, AssetListingOutcome::Succeeded { .. })
            || !(30..=131072).contains(&ciphertext.len())
            || ciphertext.first() != Some(&1)
        {
            return Err(StoreError::InvalidObservation);
        }
        self.complete_asset_listing(scope, listing_id, outcome, duration_ms, Some(ciphertext))
            .await
    }

    async fn complete_asset_listing(
        &self,
        scope: TenantScope,
        listing_id: Uuid,
        outcome: AssetListingOutcome<'_>,
        duration_ms: i64,
        ciphertext: Option<&[u8]>,
    ) -> Result<bool, StoreError> {
        let (reason, item_count, has_more) = match outcome {
            AssetListingOutcome::Succeeded {
                item_count,
                has_more,
            } => (None, Some(i32::from(item_count)), Some(has_more)),
            AssetListingOutcome::Failed { reason } => (Some(reason), None, None),
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
            || reason.is_none() != item_count.is_some()
            || reason.is_none() != has_more.is_some()
            || item_count.is_some_and(|n| !(0..=100).contains(&n))
        {
            return Err(StoreError::InvalidObservation);
        }
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT id FROM asset_listing_claims WHERE id=$1 FOR UPDATE")
            .bind(listing_id)
            .fetch_optional(&mut *tx)
            .await?;
        let inserted = sqlx::query("INSERT INTO asset_listing_outcomes(listing_id,outcome,reason,duration_ms,item_count,has_more) SELECT r.id,$4,$5,$6,$7,$8 FROM asset_listing_claims r JOIN asset_group_create_intents i ON i.id=r.intent_id WHERE r.id=$1 AND i.organization_id=$2 AND i.project_id=$3 AND ($7::integer IS NULL OR $7<=r.maximum_items) ON CONFLICT(listing_id) DO NOTHING")
            .bind(listing_id).bind(scope.organization_id).bind(scope.project_id)
            .bind(if reason.is_none() {"succeeded"} else {"failed"}).bind(reason).bind(duration_ms)
            .bind(item_count).bind(has_more).execute(&mut *tx).await?.rows_affected()==1;
        if !inserted {
            return Ok(false);
        }
        if let Some(ciphertext) = ciphertext {
            sqlx::query("INSERT INTO asset_listing_results(listing_id,ciphertext) SELECT $1,$2 WHERE NOT EXISTS(SELECT 1 FROM asset_listing_result_deletions WHERE listing_id=$1)")
                .bind(listing_id).bind(ciphertext).execute(&mut *tx).await?;
        }
        tx.commit().await?;
        Ok(true)
    }
    /// Original grant/account/key must still be current. No new upstream read.
    pub async fn asset_listing_result(
        &self,
        scope: TenantScope,
        vendor: Uuid,
        listing_id: Uuid,
    ) -> Result<Option<Vec<u8>>, StoreError> {
        Ok(self
            .asset_listing_result_context(scope, vendor, listing_id)
            .await?
            .map(|(bytes, _)| bytes))
    }

    /// Private retained bytes plus the immutable original decoding context.
    pub async fn asset_listing_result_context(
        &self,
        scope: TenantScope,
        vendor: Uuid,
        listing_id: Uuid,
    ) -> Result<Option<(Vec<u8>, OrdinaryAssetList)>, StoreError> {
        let saved:Option<(Vec<u8>,String,String,i32)> = sqlx::query_as("SELECT result.ciphertext,i.upstream_group_id,i.upstream_project,r.maximum_items FROM asset_listing_results result JOIN asset_listing_claims r ON r.id=result.listing_id JOIN asset_group_create_intents i ON i.id=r.intent_id JOIN asset_operation_authorizations a ON a.id=r.authorization_id JOIN vendors v ON v.id=i.vendor_id AND v.revision=i.vendor_revision JOIN vendor_asset_management_credentials c ON c.vendor_id=i.vendor_id AND c.revision=i.credential_revision AND c.upstream_project=i.upstream_project WHERE r.id=$1 AND i.organization_id=$2 AND i.project_id=$3 AND i.vendor_id=$4 AND result.ciphertext IS NOT NULL AND result.expires_at>clock_timestamp() AND a.operation='ListAssets' AND a.expires_at>clock_timestamp() AND NOT EXISTS(SELECT 1 FROM asset_operation_authorization_revocations revoked WHERE revoked.authorization_id=a.id) AND c.credential_ciphertext IS NOT NULL AND NOT EXISTS(SELECT 1 FROM vendor_asset_management_revocations revoked WHERE revoked.vendor_id=i.vendor_id AND revoked.through_revision>=i.credential_revision)")
            .bind(listing_id).bind(scope.organization_id).bind(scope.project_id).bind(vendor).fetch_optional(&self.pool).await?;
        saved
            .map(|(bytes, group, project, maximum)| {
                let maximum = u8::try_from(maximum).map_err(|_| StoreError::InvalidObservation)?;
                let request = OrdinaryAssetList::first_page(group, project, maximum)
                    .map_err(|_| StoreError::InvalidObservation)?;
                Ok((bytes, request))
            })
            .transpose()
    }

    /// Caller authorizes platform content deletion. Audit survives erasure.
    pub async fn delete_asset_listing_result(
        &self,
        scope: TenantScope,
        vendor: Uuid,
        listing_id: Uuid,
    ) -> Result<bool, StoreError> {
        let mut tx = self.pool.begin().await?;
        let id: Option<Uuid> = sqlx::query_scalar("SELECT r.id FROM asset_listing_claims r JOIN asset_group_create_intents i ON i.id=r.intent_id WHERE r.id=$1 AND i.organization_id=$2 AND i.project_id=$3 AND i.vendor_id=$4 FOR UPDATE OF r")
            .bind(listing_id).bind(scope.organization_id).bind(scope.project_id).bind(vendor).fetch_optional(&mut *tx).await?;
        if id.is_none() {
            return Ok(false);
        }
        let changed=sqlx::query("INSERT INTO asset_listing_result_deletions(listing_id) VALUES($1) ON CONFLICT DO NOTHING")
            .bind(listing_id).execute(&mut *tx).await?.rows_affected()==1;
        sqlx::query("UPDATE asset_listing_results SET ciphertext=NULL,deleted_at=clock_timestamp() WHERE listing_id=$1 AND ciphertext IS NOT NULL")
            .bind(listing_id).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(changed)
    }

    pub async fn purge_expired_asset_listing_results(&self) -> Result<(), StoreError> {
        self.execute_content_retention("SELECT niu_purge_asset_content_page('listing')")
            .await?;
        Ok(())
    }
    /// Durable operational metadata only; no retained content or procurement data.
    /// Missing completion is unresolved, not proof that upstream work is running.
    pub async fn asset_listing_history(
        &self,
        scope: TenantScope,
        vendor: Uuid,
        after: Option<Uuid>,
        limit: i64,
    ) -> Result<Vec<serde_json::Value>, StoreError> {
        if !(1..=101).contains(&limit) {
            return Err(StoreError::InvalidObservation);
        }
        Ok(sqlx::query_scalar("SELECT jsonb_build_object('listing_id',r.id,'previous_listing_id',r.parent_listing_id,'page_number',r.page_number,'status',COALESCE(o.outcome,'unresolved'),'started_at',r.created_at,'completed_at',o.created_at,'duration_ms',o.duration_ms,'reason',o.reason,'item_count',o.item_count,'has_more',o.has_more) FROM asset_listing_claims r JOIN asset_group_create_intents i ON i.id=r.intent_id LEFT JOIN asset_listing_outcomes o ON o.listing_id=r.id WHERE i.organization_id=$1 AND i.project_id=$2 AND i.vendor_id=$3 AND ($4::uuid IS NULL OR (r.created_at,r.id)<(SELECT cursor.created_at,cursor.id FROM asset_listing_claims cursor JOIN asset_group_create_intents original ON original.id=cursor.intent_id WHERE cursor.id=$4 AND original.organization_id=$1 AND original.project_id=$2 AND original.vendor_id=$3)) ORDER BY r.created_at DESC,r.id DESC LIMIT $5")
            .bind(scope.organization_id).bind(scope.project_id).bind(vendor).bind(after).bind(limit)
            .fetch_all(&self.pool).await?)
    }
}
