//! Specific cascading-deletion consent; no dispatch or credential release.
//! Callers must authorize the workspace and obtain explicit destructive consent.
use crate::{OperatorAuditActor, Store, StoreError, TenantScope};
use uuid::Uuid;

pub struct AssetGroupDeletionConsent {
    pub id: Uuid,
    pub intent_id: Uuid,
    pub authorization_id: Uuid,
    pub valid_for_seconds: i32,
    pub confirm_cascade: bool,
}
#[derive(sqlx::FromRow)]
struct DeletionBinding {
    intent_id: Uuid,
    authorization_id: Uuid,
    revision: i64,
    project: String,
    group_id: String,
    ciphertext: Vec<u8>,
}
/// Private request and credentials deliberately cannot be formatted/serialized.
pub struct ClaimedAssetGroupDeletion {
    pub consent_id: Uuid,
    pub intent_id: Uuid,
    pub authorization_id: Uuid,
    pub credential: crate::AssetManagementCredentialRevision,
    request: niu_media::asset_group_delete::OrdinaryGroupDelete,
}
impl ClaimedAssetGroupDeletion {
    pub fn request(&self) -> &niu_media::asset_group_delete::OrdinaryGroupDelete {
        &self.request
    }
}
pub enum AssetGroupDeletionOutcome<'a> {
    Acknowledged,
    Uncertain { reason: &'a str },
}
impl Store {
    /// Safe scoped status only; qualification and credentials are never projected.
    /// Claim/outcome takes precedence over later revocation or consent expiry.
    pub async fn asset_group_deletion_consent_status(
        &self,
        scope: TenantScope,
        vendor: Uuid,
        consent: Uuid,
    ) -> Result<Option<serde_json::Value>, StoreError> {
        Ok(sqlx::query_scalar("SELECT jsonb_build_object('status',CASE WHEN o.outcome IS NOT NULL THEN o.outcome WHEN c.consent_id IS NOT NULL THEN 'unresolved' WHEN EXISTS(SELECT 1 FROM asset_group_deletion_consent_revocations r WHERE r.consent_id=d.id) THEN 'revoked' WHEN d.expires_at<=clock_timestamp() THEN 'expired' ELSE 'consented' END,'created_at',d.created_at,'expires_at',d.expires_at,'reason',o.reason,'duration_ms',o.duration_ms,'dispatch_available',false) FROM asset_group_deletion_consents d JOIN asset_group_create_intents i ON i.id=d.intent_id LEFT JOIN asset_group_deletion_claims c ON c.consent_id=d.id LEFT JOIN asset_group_deletion_outcomes o ON o.consent_id=d.id WHERE d.id=$1 AND i.organization_id=$2 AND i.project_id=$3 AND i.vendor_id=$4")
            .bind(consent).bind(scope.organization_id).bind(scope.project_id).bind(vendor).fetch_optional(&self.pool).await?)
    }
    /// Claims once before releasing original credentials. The vendor lock
    /// serializes against qualification, credential and consent revocation and
    /// metadata-update claims. No network work is performed in this transaction.
    pub async fn claim_asset_group_deletion(
        &self,
        scope: TenantScope,
        consent: Uuid,
    ) -> Result<Option<ClaimedAssetGroupDeletion>, StoreError> {
        let mut tx = self.pool.begin().await?;
        let vendor: Option<Uuid> = sqlx::query_scalar("SELECT i.vendor_id FROM asset_group_deletion_consents d JOIN asset_group_create_intents i ON i.id=d.intent_id WHERE d.id=$1 AND i.organization_id=$2 AND i.project_id=$3")
            .bind(consent).bind(scope.organization_id).bind(scope.project_id).fetch_optional(&mut *tx).await?;
        let Some(vendor) = vendor else {
            return Ok(None);
        };
        sqlx::query_scalar::<_, Uuid>("SELECT id FROM vendors WHERE id=$1 FOR UPDATE")
            .bind(vendor)
            .fetch_one(&mut *tx)
            .await?;
        let binding: Option<DeletionBinding> = sqlx::query_as("SELECT i.id AS intent_id,a.id AS authorization_id,i.credential_revision AS revision,i.upstream_project AS project,i.upstream_group_id AS group_id,c.credential_ciphertext AS ciphertext FROM asset_group_deletion_consents d JOIN asset_group_create_intents i ON i.id=d.intent_id JOIN asset_operation_authorizations a ON a.id=d.authorization_id AND a.organization_id=i.organization_id AND a.project_id=i.project_id AND a.vendor_id=i.vendor_id AND a.vendor_revision=i.vendor_revision AND a.credential_revision=i.credential_revision JOIN vendors v ON v.id=i.vendor_id AND v.revision=i.vendor_revision JOIN vendor_asset_management_credentials c ON c.vendor_id=i.vendor_id AND c.revision=i.credential_revision AND c.upstream_project=i.upstream_project WHERE d.id=$1 AND d.confirm_cascade AND d.expires_at>clock_timestamp() AND i.state='succeeded' AND i.upstream_group_id IS NOT NULL AND a.operation='DeleteAssetGroup' AND a.expires_at>clock_timestamp() AND c.credential_ciphertext IS NOT NULL AND NOT EXISTS(SELECT 1 FROM asset_group_deletion_consent_revocations r WHERE r.consent_id=d.id) AND NOT EXISTS(SELECT 1 FROM asset_operation_authorization_revocations r WHERE r.authorization_id=a.id) AND NOT EXISTS(SELECT 1 FROM vendor_asset_management_revocations r WHERE r.vendor_id=i.vendor_id AND r.through_revision>=i.credential_revision) AND NOT EXISTS(SELECT 1 FROM asset_image_ingestion_claims upload JOIN asset_image_ingestion_consents consent ON consent.id=upload.consent_id JOIN asset_group_create_intents original ON original.id=consent.group_intent_id LEFT JOIN asset_image_ingestion_outcomes outcome ON outcome.consent_id=upload.consent_id WHERE original.vendor_id=i.vendor_id AND original.credential_revision=i.credential_revision AND original.upstream_project=i.upstream_project AND original.upstream_group_id=i.upstream_group_id AND (outcome.outcome IS NULL OR outcome.outcome='uncertain')) AND NOT EXISTS(SELECT 1 FROM asset_group_update_holds h JOIN asset_group_create_intents original ON original.id=h.intent_id WHERE original.vendor_id=i.vendor_id AND original.credential_revision=i.credential_revision AND original.upstream_project=i.upstream_project AND original.upstream_group_id=i.upstream_group_id) AND NOT EXISTS(SELECT 1 FROM asset_group_deletion_claims h JOIN asset_group_create_intents original ON original.id=h.intent_id WHERE original.vendor_id=i.vendor_id AND original.credential_revision=i.credential_revision AND original.upstream_project=i.upstream_project AND original.upstream_group_id=i.upstream_group_id) FOR UPDATE OF d,a,i")
            .bind(consent).fetch_optional(&mut *tx).await?;
        let Some(binding) = binding else {
            return Ok(None);
        };
        let original = niu_media::asset_read::OrdinaryGroupRead::new(
            binding.group_id,
            binding.project.clone(),
        )
        .map_err(|_| StoreError::InvalidObservation)?;
        let inserted = sqlx::query("INSERT INTO asset_group_deletion_claims(consent_id,intent_id) SELECT d.id,d.intent_id FROM asset_group_deletion_consents d JOIN asset_operation_authorizations a ON a.id=d.authorization_id WHERE d.id=$1 AND d.expires_at>clock_timestamp() AND a.expires_at>clock_timestamp() AND NOT EXISTS(SELECT 1 FROM asset_group_deletion_consent_revocations r WHERE r.consent_id=d.id) ON CONFLICT DO NOTHING")
            .bind(consent).execute(&mut *tx).await?.rows_affected()==1;
        if !inserted {
            return Ok(None);
        }
        tx.commit().await?;
        Ok(Some(ClaimedAssetGroupDeletion {
            consent_id: consent,
            authorization_id: binding.authorization_id,
            intent_id: binding.intent_id,
            credential: crate::AssetManagementCredentialRevision {
                vendor_id: vendor,
                revision: binding.revision,
                upstream_project: binding.project,
                credential_ciphertext: binding.ciphertext,
            },
            request: niu_media::asset_group_delete::OrdinaryGroupDelete::new(original),
        }))
    }

    /// First durable outcome wins. Acknowledgement is not independent absence
    /// verification; uncertainty and both outcomes retain the mutation fence.
    pub async fn record_asset_group_deletion_outcome(
        &self,
        scope: TenantScope,
        consent: Uuid,
        outcome: AssetGroupDeletionOutcome<'_>,
        duration_ms: i64,
    ) -> Result<bool, StoreError> {
        let reason = match outcome {
            AssetGroupDeletionOutcome::Acknowledged => None,
            AssetGroupDeletionOutcome::Uncertain { reason } => Some(reason),
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
        Ok(sqlx::query("INSERT INTO asset_group_deletion_outcomes(consent_id,outcome,reason,duration_ms) SELECT c.consent_id,$4,$5,$6 FROM asset_group_deletion_claims c JOIN asset_group_create_intents i ON i.id=c.intent_id WHERE c.consent_id=$1 AND i.organization_id=$2 AND i.project_id=$3 ON CONFLICT DO NOTHING")
            .bind(consent).bind(scope.organization_id).bind(scope.project_id).bind(if reason.is_some(){"uncertain"}else{"acknowledged"}).bind(reason).bind(duration_ms).execute(&self.pool).await?.rows_affected()==1)
    }

    /// Immutable original group/grant/actor binding, capped at fifteen minutes
    /// and the qualification expiry. Repetition cannot renew consent or change
    /// its target. Expired, revoked or stale bindings cannot be resurrected.
    pub async fn consent_asset_group_deletion(
        &self,
        scope: TenantScope,
        input: AssetGroupDeletionConsent,
        actor: OperatorAuditActor,
    ) -> Result<bool, StoreError> {
        if !input.confirm_cascade || !(1..=900).contains(&input.valid_for_seconds) {
            return Err(StoreError::InvalidObservation);
        }
        let mut tx = self.pool.begin().await?;
        let vendor: Option<Uuid> = sqlx::query_scalar("SELECT vendor_id FROM asset_group_create_intents WHERE id=$1 AND organization_id=$2 AND project_id=$3 AND state='succeeded' AND upstream_group_id IS NOT NULL")
            .bind(input.intent_id).bind(scope.organization_id).bind(scope.project_id).fetch_optional(&mut *tx).await?;
        let Some(vendor) = vendor else {
            return Err(StoreError::Conflict);
        };
        sqlx::query_scalar::<_, Uuid>("SELECT id FROM vendors WHERE id=$1 FOR UPDATE")
            .bind(vendor)
            .fetch_one(&mut *tx)
            .await?;
        let usable: Option<Uuid> = sqlx::query_scalar("SELECT a.id FROM asset_operation_authorizations a JOIN asset_group_create_intents i ON i.id=$1 AND i.organization_id=a.organization_id AND i.project_id=a.project_id AND i.vendor_id=a.vendor_id AND i.vendor_revision=a.vendor_revision AND i.credential_revision=a.credential_revision JOIN vendors v ON v.id=i.vendor_id AND v.revision=i.vendor_revision JOIN vendor_asset_management_credentials c ON c.vendor_id=i.vendor_id AND c.revision=i.credential_revision AND c.upstream_project=i.upstream_project WHERE a.id=$2 AND a.operation='DeleteAssetGroup' AND a.expires_at>clock_timestamp() AND c.credential_ciphertext IS NOT NULL AND NOT EXISTS(SELECT 1 FROM asset_operation_authorization_revocations r WHERE r.authorization_id=a.id) AND NOT EXISTS(SELECT 1 FROM vendor_asset_management_revocations r WHERE r.vendor_id=i.vendor_id AND r.through_revision>=i.credential_revision) FOR UPDATE OF a,i")
            .bind(input.intent_id).bind(input.authorization_id).fetch_optional(&mut *tx).await?;
        if usable.is_none() {
            return Err(StoreError::Conflict);
        }
        let (kind, actor_id) = actor.kind_and_id();
        let inserted = sqlx::query("INSERT INTO asset_group_deletion_consents(id,intent_id,authorization_id,valid_for_seconds,confirm_cascade,actor_kind,actor_id,expires_at) SELECT $1,$2,a.id,$4,true,$5,$6,least(a.expires_at,statement_timestamp()+make_interval(secs=>$4::double precision)) FROM asset_operation_authorizations a WHERE a.id=$3 AND a.expires_at>clock_timestamp() ON CONFLICT(id) DO NOTHING")
            .bind(input.id).bind(input.intent_id).bind(input.authorization_id).bind(input.valid_for_seconds).bind(kind).bind(actor_id).execute(&mut *tx).await?.rows_affected()==1;
        if !inserted {
            let identical: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM asset_group_deletion_consents c WHERE c.id=$1 AND c.intent_id=$2 AND c.authorization_id=$3 AND c.valid_for_seconds=$4 AND c.actor_kind=$5 AND c.actor_id IS NOT DISTINCT FROM $6 AND c.expires_at>clock_timestamp() AND NOT EXISTS(SELECT 1 FROM asset_group_deletion_consent_revocations r WHERE r.consent_id=c.id))")
                .bind(input.id).bind(input.intent_id).bind(input.authorization_id).bind(input.valid_for_seconds).bind(kind).bind(actor_id).fetch_one(&mut *tx).await?;
            if !identical {
                return Err(StoreError::Conflict);
            }
        }
        tx.commit().await?;
        Ok(inserted)
    }

    /// Scoped, idempotent revocation. Dispatch must take the same vendor lock
    /// and recheck revocation in its claim transaction before releasing secrets.
    pub async fn revoke_asset_group_deletion_consent(
        &self,
        scope: TenantScope,
        consent: Uuid,
        actor: OperatorAuditActor,
    ) -> Result<bool, StoreError> {
        let mut tx = self.pool.begin().await?;
        let vendor: Option<Uuid> = sqlx::query_scalar("SELECT i.vendor_id FROM asset_group_deletion_consents c JOIN asset_group_create_intents i ON i.id=c.intent_id WHERE c.id=$1 AND i.organization_id=$2 AND i.project_id=$3")
            .bind(consent).bind(scope.organization_id).bind(scope.project_id).fetch_optional(&mut *tx).await?;
        let Some(vendor) = vendor else {
            return Ok(false);
        };
        sqlx::query_scalar::<_, Uuid>("SELECT id FROM vendors WHERE id=$1 FOR UPDATE")
            .bind(vendor)
            .fetch_one(&mut *tx)
            .await?;
        let (kind, actor_id) = actor.kind_and_id();
        let inserted = sqlx::query("INSERT INTO asset_group_deletion_consent_revocations(consent_id,actor_kind,actor_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING")
            .bind(consent).bind(kind).bind(actor_id).execute(&mut *tx).await?.rows_affected()==1;
        tx.commit().await?;
        Ok(inserted)
    }
}
