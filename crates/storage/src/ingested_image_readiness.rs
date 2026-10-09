//! Original-account readiness observations for accepted image ingestion only.
use crate::{AssetManagementCredentialRevision, GuardrailSnapshot, Principal, Store, StoreError};
use niu_media::{
    asset_list::AssetStatus, asset_lookup::OrdinaryAssetRead, asset_read::OrdinaryGroupRead,
};
use uuid::Uuid;

/// Private identity and credential handoff, never diagnostic or serialized.
pub struct ClaimedIngestedImageReadiness {
    pub credential: AssetManagementCredentialRevision,
    pub request: OrdinaryAssetRead,
}
impl Store {
    /// Historical scoped observation only, never an upstream fetch or reuse grant.
    pub async fn ingested_image_readiness_status(
        &self,
        principal: &Principal,
        consent: Uuid,
        read_id: Uuid,
    ) -> Result<Option<serde_json::Value>, StoreError> {
        let scope = principal.scope();
        Ok(sqlx::query_scalar("SELECT jsonb_build_object('read_id',claim.id,'status',CASE WHEN outcome.asset_status IS NOT NULL THEN 'succeeded' WHEN outcome.reason IS NOT NULL THEN 'failed' ELSE 'pending' END,'asset_status',outcome.asset_status,'reason',outcome.reason,'duration_ms',outcome.duration_ms,'observed_at',outcome.created_at,'reuse_available',false) FROM ingested_image_readiness_claims claim JOIN asset_image_ingestion_consents d ON d.id=claim.consent_id JOIN inspected_image_sources s ON s.id=d.source_id JOIN api_keys k ON k.id=s.key_id LEFT JOIN ingested_image_readiness_outcomes outcome ON outcome.read_id=claim.id WHERE claim.id=$1 AND d.id=$2 AND s.organization_id=$3 AND s.project_id=$4 AND s.key_id=$5 AND k.revoked_at IS NULL AND k.expires_at>clock_timestamp()")
            .bind(read_id).bind(consent).bind(scope.organization_id).bind(scope.project_id).bind(principal.key_id()).fetch_optional(&self.pool).await?)
    }

    /// Release only the outstanding-read admission lock after process loss.
    /// This records failure, never an asset status or reusable-reference grant.
    pub async fn recover_interrupted_ingested_image_reads(&self) -> Result<u64, StoreError> {
        Ok(sqlx::query("WITH stale AS (SELECT claim.id,(EXTRACT(EPOCH FROM statement_timestamp()-claim.created_at)*1000)::bigint AS duration_ms FROM ingested_image_readiness_claims claim WHERE claim.created_at<=statement_timestamp()-interval '60 seconds' AND NOT EXISTS(SELECT 1 FROM ingested_image_readiness_outcomes outcome WHERE outcome.read_id=claim.id) ORDER BY claim.created_at,claim.id LIMIT 16 FOR UPDATE OF claim SKIP LOCKED) INSERT INTO ingested_image_readiness_outcomes(read_id,reason,duration_ms) SELECT id,'timeout',duration_ms FROM stale ON CONFLICT DO NOTHING")
            .execute(&self.pool).await?.rows_affected())
    }

    pub async fn claim_ingested_image_readiness(
        &self,
        principal: &Principal,
        snapshot: &GuardrailSnapshot,
        consent: Uuid,
        read_id: Uuid,
    ) -> Result<Option<ClaimedIngestedImageReadiness>, StoreError> {
        let scope = principal.scope();
        let mut tx = self.pool.begin().await?;
        self.authorize_image_source_using(&mut tx, principal, snapshot)
            .await?;
        let vendor: Option<Uuid> = sqlx::query_scalar("SELECT i.vendor_id FROM asset_image_ingestion_consents d JOIN inspected_image_sources s ON s.id=d.source_id JOIN asset_group_create_intents i ON i.id=d.group_intent_id WHERE d.id=$1 AND s.organization_id=$2 AND s.project_id=$3 AND s.key_id=$4")
            .bind(consent).bind(scope.organization_id).bind(scope.project_id).bind(principal.key_id()).fetch_optional(&mut *tx).await?;
        let Some(vendor) = vendor else {
            return Ok(None);
        };
        sqlx::query("SELECT id FROM vendors WHERE id=$1 FOR UPDATE")
            .bind(vendor)
            .execute(&mut *tx)
            .await?;
        sqlx::query("SELECT id FROM asset_image_ingestion_consents WHERE id=$1 FOR UPDATE")
            .bind(consent)
            .execute(&mut *tx)
            .await?;
        let binding: Option<(String,String,String,i64,Uuid)> = sqlx::query_as("SELECT o.upstream_asset_id,i.upstream_group_id,i.upstream_project,i.credential_revision,a.id FROM asset_image_ingestion_outcomes o JOIN asset_image_ingestion_consents d ON d.id=o.consent_id JOIN asset_group_create_intents i ON i.id=d.group_intent_id JOIN vendors v ON v.id=i.vendor_id AND v.revision=i.vendor_revision JOIN vendor_asset_management_credentials c ON c.vendor_id=i.vendor_id AND c.revision=i.credential_revision AND c.upstream_project=i.upstream_project JOIN asset_operation_authorizations a ON a.organization_id=i.organization_id AND a.project_id=i.project_id AND a.vendor_id=i.vendor_id AND a.vendor_revision=i.vendor_revision AND a.credential_revision=i.credential_revision WHERE o.consent_id=$1 AND o.outcome='accepted' AND i.state='succeeded' AND a.operation='GetAsset' AND a.expires_at>clock_timestamp() AND c.credential_ciphertext IS NOT NULL AND NOT EXISTS(SELECT 1 FROM asset_operation_authorization_revocations r WHERE r.authorization_id=a.id) AND NOT EXISTS(SELECT 1 FROM vendor_asset_management_revocations r WHERE r.vendor_id=i.vendor_id AND r.through_revision>=i.credential_revision) AND NOT EXISTS(SELECT 1 FROM asset_group_deletion_claims deletion JOIN asset_group_create_intents original ON original.id=deletion.intent_id WHERE original.vendor_id=i.vendor_id AND original.credential_revision=i.credential_revision AND original.upstream_project=i.upstream_project AND original.upstream_group_id=i.upstream_group_id) AND NOT EXISTS(SELECT 1 FROM ingested_image_readiness_claims pending WHERE pending.consent_id=d.id AND NOT EXISTS(SELECT 1 FROM ingested_image_readiness_outcomes finished WHERE finished.read_id=pending.id)) AND (SELECT count(*) FROM ingested_image_readiness_claims recent WHERE recent.consent_id=d.id AND recent.created_at>statement_timestamp()-interval '1 hour')<60 ORDER BY a.expires_at DESC,a.id LIMIT 1")
            .bind(consent).fetch_optional(&mut *tx).await?;
        let Some((asset, group, project, revision, authorization)) = binding else {
            return Ok(None);
        };
        let request = OrdinaryAssetRead::created_image(
            asset,
            OrdinaryGroupRead::new(group, project.clone())
                .map_err(|_| StoreError::InvalidObservation)?,
        )
        .map_err(|_| StoreError::InvalidObservation)?;
        let inserted = sqlx::query("INSERT INTO ingested_image_readiness_claims(id,consent_id,authorization_id) SELECT $1,$2,$3 WHERE EXISTS(SELECT 1 FROM asset_operation_authorizations WHERE id=$3 AND expires_at>clock_timestamp() AND NOT EXISTS(SELECT 1 FROM asset_operation_authorization_revocations r WHERE r.authorization_id=$3)) ON CONFLICT DO NOTHING")
            .bind(read_id).bind(consent).bind(authorization).execute(&mut *tx).await?.rows_affected();
        if inserted != 1 {
            return Ok(None);
        }
        let credential = sqlx::query_as::<_,AssetManagementCredentialRevision>("SELECT vendor_id,revision,upstream_project,credential_ciphertext FROM vendor_asset_management_credentials WHERE vendor_id=$1 AND revision=$2 AND upstream_project=$3 AND credential_ciphertext IS NOT NULL")
            .bind(vendor).bind(revision).bind(project).fetch_one(&mut *tx).await?;
        tx.commit().await?;
        Ok(Some(ClaimedIngestedImageReadiness {
            credential,
            request,
        }))
    }

    pub async fn finish_ingested_image_readiness(
        &self,
        principal: &Principal,
        read_id: Uuid,
        result: Result<AssetStatus, &str>,
        duration_ms: i64,
    ) -> Result<bool, StoreError> {
        let (status, reason) = match result {
            Ok(status) => (Some(status.as_str()), None),
            Err(reason)
                if matches!(
                    reason,
                    "invalid_configuration"
                        | "destination_rejected"
                        | "unavailable"
                        | "transport"
                        | "timeout"
                        | "response_limit"
                        | "invalid_response"
                ) =>
            {
                (None, Some(reason))
            }
            Err(_) => return Err(StoreError::InvalidObservation),
        };
        if duration_ms < 0 {
            return Err(StoreError::InvalidObservation);
        }
        let scope = principal.scope();
        Ok(sqlx::query("INSERT INTO ingested_image_readiness_outcomes(read_id,asset_status,reason,duration_ms) SELECT claim.id,$5,$6,$7 FROM ingested_image_readiness_claims claim JOIN asset_image_ingestion_consents d ON d.id=claim.consent_id JOIN inspected_image_sources s ON s.id=d.source_id WHERE claim.id=$1 AND s.organization_id=$2 AND s.project_id=$3 AND s.key_id=$4 ON CONFLICT DO NOTHING")
            .bind(read_id).bind(scope.organization_id).bind(scope.project_id).bind(principal.key_id()).bind(status).bind(reason).bind(duration_ms).execute(&self.pool).await?.rows_affected()==1)
    }
}
