//! Original retained-page lookup claims. Callers enforce platform access and AES-GCM.
use crate::{AssetManagementCredentialRevision, Store, StoreError, TenantScope};
use niu_media::{
    asset_list::{AssetStatus, OrdinaryAssetList, OrdinaryAssetPage},
    asset_lookup::OrdinaryAssetRead,
};
use uuid::Uuid;

/// No diagnostic formatting: original credentials and private upstream request.
pub struct ClaimedAssetLookup {
    pub lookup_id: Uuid,
    pub authorization_id: Uuid,
    pub credential: AssetManagementCredentialRevision,
    request: OrdinaryAssetRead,
}
impl ClaimedAssetLookup {
    pub fn request(&self) -> &OrdinaryAssetRead {
        &self.request
    }
}
/// Successful transport can observe a failed or still-processing asset.
/// No variant grants readiness, reuse rights or a generation outcome.
pub enum AssetLookupOutcome<'a> {
    Observed { status: AssetStatus },
    Failed { reason: &'a str },
}
impl Store {
    /// Resolve an item only from the current encrypted listing under account lock.
    /// The decoder must authenticate the listing/workspace AAD and revalidate its
    /// original group scope. It must perform bounded local work, never network I/O.
    /// A committed claim is never replay permission, even without a later outcome.
    pub async fn claim_asset_lookup<F>(
        &self,
        scope: TenantScope,
        vendor: Uuid,
        listing_id: Uuid,
        lookup_id: Uuid,
        item_index: u8,
        decode: F,
    ) -> Result<Option<ClaimedAssetLookup>, StoreError>
    where
        F: FnOnce(&[u8], &OrdinaryAssetList) -> Result<OrdinaryAssetPage, StoreError>,
    {
        if item_index > 99 {
            return Err(StoreError::InvalidObservation);
        }
        let mut tx = self.pool.begin().await?;
        let account: Option<Uuid> =
            sqlx::query_scalar("SELECT id FROM vendors WHERE id=$1 FOR UPDATE")
                .bind(vendor)
                .fetch_optional(&mut *tx)
                .await?;
        if account.is_none() {
            return Ok(None);
        }
        // Match erasure's claim -> result lock order before the new claim's FK.
        let source: Option<Uuid> = sqlx::query_scalar("SELECT listing.id FROM asset_listing_claims listing JOIN asset_group_create_intents original ON original.id=listing.intent_id WHERE listing.id=$1 AND original.organization_id=$2 AND original.project_id=$3 AND original.vendor_id=$4 FOR UPDATE OF listing")
            .bind(listing_id).bind(scope.organization_id).bind(scope.project_id).bind(vendor).fetch_optional(&mut *tx).await?;
        if source.is_none() {
            return Ok(None);
        }
        let binding: Option<(Vec<u8>, String, String, i32, i64, Uuid)> = sqlx::query_as("SELECT result.ciphertext,i.upstream_group_id,i.upstream_project,r.maximum_items,i.credential_revision,lookup.id FROM asset_listing_results result JOIN asset_listing_claims r ON r.id=result.listing_id JOIN asset_listing_outcomes o ON o.listing_id=r.id JOIN asset_group_create_intents i ON i.id=r.intent_id JOIN vendors v ON v.id=i.vendor_id AND v.revision=i.vendor_revision JOIN vendor_asset_management_credentials c ON c.vendor_id=i.vendor_id AND c.revision=i.credential_revision AND c.upstream_project=i.upstream_project JOIN asset_operation_authorizations a ON a.id=r.authorization_id JOIN asset_operation_authorizations lookup ON lookup.organization_id=i.organization_id AND lookup.project_id=i.project_id AND lookup.vendor_id=i.vendor_id AND lookup.vendor_revision=i.vendor_revision AND lookup.credential_revision=i.credential_revision WHERE r.id=$1 AND i.organization_id=$2 AND i.project_id=$3 AND i.vendor_id=$4 AND i.state='succeeded' AND o.outcome='succeeded' AND o.item_count>$5 AND result.ciphertext IS NOT NULL AND result.expires_at>clock_timestamp() AND a.operation='ListAssets' AND a.expires_at>clock_timestamp() AND lookup.operation='GetAsset' AND lookup.expires_at>clock_timestamp() AND c.credential_ciphertext IS NOT NULL AND NOT EXISTS(SELECT 1 FROM asset_operation_authorization_revocations x WHERE x.authorization_id IN (a.id,lookup.id)) AND NOT EXISTS(SELECT 1 FROM vendor_asset_management_revocations x WHERE x.vendor_id=i.vendor_id AND x.through_revision>=i.credential_revision) AND NOT EXISTS(SELECT 1 FROM asset_listing_result_deletions x WHERE x.listing_id=r.id) ORDER BY lookup.expires_at DESC,lookup.id LIMIT 1 FOR UPDATE OF result")
            .bind(listing_id).bind(scope.organization_id).bind(scope.project_id).bind(vendor).bind(i32::from(item_index)).fetch_optional(&mut *tx).await?;
        let Some((bytes, group, project, maximum, revision, authorization_id)) = binding else {
            return Ok(None);
        };
        let original = OrdinaryAssetList::first_page(
            group,
            project.clone(),
            u8::try_from(maximum).map_err(|_| StoreError::InvalidObservation)?,
        )
        .map_err(|_| StoreError::InvalidObservation)?;
        let page = decode(&bytes, &original)?;
        // Revalidate even if a caller decoder returned a page from another scope.
        page.encode_private(&original)
            .map_err(|_| StoreError::InvalidObservation)?;
        let Some(asset) = page.items.get(usize::from(item_index)) else {
            return Ok(None);
        };
        let request = asset.read_request();
        let inserted = sqlx::query("INSERT INTO asset_lookup_claims(id,listing_id,authorization_id,item_index,listing_snapshot_sha256) SELECT $1,$2,$3,$4,sha256($5::bytea) WHERE EXISTS(SELECT 1 FROM asset_operation_authorizations a JOIN asset_operation_authorizations original ON original.id=(SELECT authorization_id FROM asset_listing_claims WHERE id=$2) JOIN asset_listing_results result ON result.listing_id=$2 WHERE a.id=$3 AND a.operation='GetAsset' AND a.expires_at>clock_timestamp() AND original.expires_at>clock_timestamp() AND result.ciphertext=$5 AND result.expires_at>clock_timestamp() AND NOT EXISTS(SELECT 1 FROM asset_operation_authorization_revocations x WHERE x.authorization_id IN (a.id,original.id))) ON CONFLICT DO NOTHING")
            .bind(lookup_id).bind(listing_id).bind(authorization_id).bind(i32::from(item_index)).bind(&bytes).execute(&mut *tx).await?.rows_affected();
        if inserted != 1 {
            return Ok(None);
        }
        let credential = sqlx::query_as::<_, AssetManagementCredentialRevision>("SELECT vendor_id,revision,upstream_project,credential_ciphertext FROM vendor_asset_management_credentials WHERE vendor_id=$1 AND revision=$2 AND upstream_project=$3 AND credential_ciphertext IS NOT NULL")
            .bind(vendor).bind(revision).bind(project).fetch_one(&mut *tx).await?;
        tx.commit().await?;
        Ok(Some(ClaimedAssetLookup {
            lookup_id,
            authorization_id,
            credential,
            request,
        }))
    }
    /// First completion wins, including after credential/grant revocation. No billing.
    /// Missing completion remains unresolved and never permits replay.
    pub async fn record_asset_lookup_outcome(
        &self,
        scope: TenantScope,
        lookup_id: Uuid,
        outcome: AssetLookupOutcome<'_>,
        duration_ms: i64,
    ) -> Result<bool, StoreError> {
        self.complete_asset_lookup(scope, lookup_id, outcome, duration_ms, None)
            .await
    }

    /// Validated AES-GCM ciphertext and success audit commit together.
    pub async fn save_asset_lookup_result(
        &self,
        scope: TenantScope,
        lookup_id: Uuid,
        status: AssetStatus,
        duration_ms: i64,
        ciphertext: &[u8],
    ) -> Result<bool, StoreError> {
        if !(30..=131072).contains(&ciphertext.len()) || ciphertext.first() != Some(&1) {
            return Err(StoreError::InvalidObservation);
        }
        self.complete_asset_lookup(
            scope,
            lookup_id,
            AssetLookupOutcome::Observed { status },
            duration_ms,
            Some(ciphertext),
        )
        .await
    }
    async fn complete_asset_lookup(
        &self,
        scope: TenantScope,
        lookup_id: Uuid,
        outcome: AssetLookupOutcome<'_>,
        duration_ms: i64,
        ciphertext: Option<&[u8]>,
    ) -> Result<bool, StoreError> {
        let (status, reason) = match outcome {
            AssetLookupOutcome::Observed { status } => (Some(status.as_str()), None),
            AssetLookupOutcome::Failed { reason } => (None, Some(reason)),
        };
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
        sqlx::query("SELECT id FROM asset_lookup_claims WHERE id=$1 FOR UPDATE")
            .bind(lookup_id)
            .fetch_optional(&mut *tx)
            .await?;
        let inserted=sqlx::query("INSERT INTO asset_lookup_outcomes(lookup_id,outcome,asset_status,reason,duration_ms) SELECT claim.id,$4,$5,$6,$7 FROM asset_lookup_claims claim JOIN asset_listing_claims listing ON listing.id=claim.listing_id JOIN asset_group_create_intents original ON original.id=listing.intent_id WHERE claim.id=$1 AND original.organization_id=$2 AND original.project_id=$3 ON CONFLICT(lookup_id) DO NOTHING")
            .bind(lookup_id).bind(scope.organization_id).bind(scope.project_id)
            .bind(if status.is_some() { "succeeded" } else { "failed" }).bind(status).bind(reason).bind(duration_ms)
            .execute(&mut *tx).await?.rows_affected()==1;
        if !inserted {
            return Ok(false);
        }
        if let Some(bytes) = ciphertext {
            sqlx::query("INSERT INTO asset_lookup_results(lookup_id,ciphertext) SELECT $1,$2 WHERE NOT EXISTS(SELECT 1 FROM asset_lookup_result_deletions WHERE lookup_id=$1)")
                .bind(lookup_id).bind(bytes).execute(&mut *tx).await?;
        }
        tx.commit().await?;
        Ok(true)
    }

    /// Current exact original grants/account/key only; no upstream read.
    /// Source-page erasure does not erase this independently retained result.
    pub async fn asset_lookup_result_context(
        &self,
        scope: TenantScope,
        vendor: Uuid,
        lookup_id: Uuid,
    ) -> Result<Option<(Vec<u8>, OrdinaryAssetList)>, StoreError> {
        let saved:Option<(Vec<u8>,String,String)>=sqlx::query_as("SELECT result.ciphertext,i.upstream_group_id,i.upstream_project FROM asset_lookup_results result JOIN asset_lookup_claims claim ON claim.id=result.lookup_id JOIN asset_listing_claims listing ON listing.id=claim.listing_id JOIN asset_group_create_intents i ON i.id=listing.intent_id JOIN asset_operation_authorizations a ON a.id=claim.authorization_id JOIN asset_operation_authorizations original ON original.id=listing.authorization_id JOIN vendors v ON v.id=i.vendor_id AND v.revision=i.vendor_revision JOIN vendor_asset_management_credentials c ON c.vendor_id=i.vendor_id AND c.revision=i.credential_revision AND c.upstream_project=i.upstream_project WHERE claim.id=$1 AND i.organization_id=$2 AND i.project_id=$3 AND i.vendor_id=$4 AND result.ciphertext IS NOT NULL AND result.expires_at>clock_timestamp() AND a.operation='GetAsset' AND a.expires_at>clock_timestamp() AND original.operation='ListAssets' AND original.expires_at>clock_timestamp() AND c.credential_ciphertext IS NOT NULL AND NOT EXISTS(SELECT 1 FROM asset_operation_authorization_revocations r WHERE r.authorization_id IN (a.id,original.id)) AND NOT EXISTS(SELECT 1 FROM vendor_asset_management_revocations r WHERE r.vendor_id=i.vendor_id AND r.through_revision>=i.credential_revision)")
            .bind(lookup_id).bind(scope.organization_id).bind(scope.project_id).bind(vendor).fetch_optional(&self.pool).await?;
        saved
            .map(|(bytes, group, project)| {
                Ok((
                    bytes,
                    OrdinaryAssetList::first_page(group, project, 1)
                        .map_err(|_| StoreError::InvalidObservation)?,
                ))
            })
            .transpose()
    }
    /// Tombstone before completion also prevents later content resurrection.
    pub async fn delete_asset_lookup_result(
        &self,
        scope: TenantScope,
        vendor: Uuid,
        lookup_id: Uuid,
    ) -> Result<bool, StoreError> {
        let mut tx = self.pool.begin().await?;
        let found:Option<Uuid>=sqlx::query_scalar("SELECT claim.id FROM asset_lookup_claims claim JOIN asset_listing_claims listing ON listing.id=claim.listing_id JOIN asset_group_create_intents i ON i.id=listing.intent_id WHERE claim.id=$1 AND i.organization_id=$2 AND i.project_id=$3 AND i.vendor_id=$4 FOR UPDATE OF claim")
            .bind(lookup_id).bind(scope.organization_id).bind(scope.project_id).bind(vendor).fetch_optional(&mut *tx).await?;
        if found.is_none() {
            return Ok(false);
        }
        let changed=sqlx::query("INSERT INTO asset_lookup_result_deletions(lookup_id) VALUES($1) ON CONFLICT DO NOTHING").bind(lookup_id).execute(&mut *tx).await?.rows_affected()==1;
        sqlx::query("UPDATE asset_lookup_results SET ciphertext=NULL,deleted_at=clock_timestamp() WHERE lookup_id=$1 AND ciphertext IS NOT NULL").bind(lookup_id).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(changed)
    }
    pub async fn purge_expired_asset_lookup_results(&self) -> Result<(), StoreError> {
        self.execute_content_retention("SELECT niu_purge_asset_content_page('lookup')")
            .await?;
        Ok(())
    }

    /// Caller enforces platform access. Projection survives revocation and erasure.
    /// IDs are routing references only and must not become displayed product labels.
    pub async fn asset_lookup_history(
        &self,
        scope: TenantScope,
        vendor: Uuid,
        after: Option<Uuid>,
        limit: i64,
    ) -> Result<Vec<serde_json::Value>, StoreError> {
        if !(1..=101).contains(&limit) {
            return Err(StoreError::InvalidObservation);
        }
        Ok(sqlx::query_scalar("SELECT jsonb_build_object('lookup_id',claim.id,'listing_id',claim.listing_id,'status',COALESCE(o.outcome,'unresolved'),'asset_status',o.asset_status,'started_at',claim.created_at,'completed_at',o.created_at,'duration_ms',o.duration_ms,'reason',o.reason) FROM asset_lookup_claims claim JOIN asset_listing_claims listing ON listing.id=claim.listing_id JOIN asset_group_create_intents original ON original.id=listing.intent_id LEFT JOIN asset_lookup_outcomes o ON o.lookup_id=claim.id WHERE original.organization_id=$1 AND original.project_id=$2 AND original.vendor_id=$3 AND ($4::uuid IS NULL OR (claim.created_at,claim.id)<(SELECT cursor.created_at,cursor.id FROM asset_lookup_claims cursor JOIN asset_listing_claims page ON page.id=cursor.listing_id JOIN asset_group_create_intents binding ON binding.id=page.intent_id WHERE cursor.id=$4 AND binding.organization_id=$1 AND binding.project_id=$2 AND binding.vendor_id=$3)) ORDER BY claim.created_at DESC,claim.id DESC LIMIT $5")
            .bind(scope.organization_id).bind(scope.project_id).bind(vendor).bind(after).bind(limit).fetch_all(&self.pool).await?)
    }
}
