//! Encrypted exact approved bytes; no public URL or Supplier dispatch authority.
use crate::{GuardrailSnapshot, Principal, Store, StoreError};
use base64::Engine;
use niu_media::image_detector::{Consent, ProcessingApproval, Runtime};
use sha2::{Digest, Sha256};
use sqlx::{Postgres, Row, Transaction};
use uuid::Uuid;

// Initial private staging ceilings. Retained expired bytes still consume capacity
// until maintenance erases them; no customer charge or Supplier cost is involved.
fn source_capacity_exceeded(
    workspace_count: i64,
    workspace_bytes: i64,
    total_count: i64,
    total_bytes: i64,
    new_bytes: usize,
) -> bool {
    let reserved_bytes = new_bytes as i64 + 128;
    workspace_count >= 256
        || total_count >= 4096
        || workspace_bytes > 128 * 1024 * 1024 - reserved_bytes
        || total_bytes > 1024 * 1024 * 1024 - reserved_bytes
}

pub struct InspectedImageSourceInput<'a> {
    pub id: Uuid,
    pub approval_id: Uuid,
    pub valid_for_seconds: i32,
    pub runtime: &'a Runtime,
    pub consent: &'a Consent,
    pub approval: &'a ProcessingApproval,
    pub additional_approvals: &'a [crate::ImageRequestApproval<'a>],
}
/// Specific customer consent to sending this source to this saved destination.
/// Validation alone does not publish bytes, release credentials or claim dispatch.
pub struct AssetImageIngestionConsent {
    pub id: Uuid,
    pub source_id: Uuid,
    pub group_intent_id: Uuid,
    pub authorization_id: Uuid,
    pub valid_for_seconds: i32,
    pub confirm_ingestion: bool,
}
/// Committed private handoff; no diagnostic formatting or serialization.
pub struct ClaimedAssetImageIngestion {
    pub consent_id: Uuid,
    pub credential: crate::AssetManagementCredentialRevision,
    pub group: niu_media::asset_read::OrdinaryGroupRead,
    pub source: VerifiedImageSource,
}
pub enum AssetImageIngestionOutcome<'a> {
    Accepted { upstream_asset_id: &'a str },
    Uncertain { reason: &'a str },
}
/// Bearer token returned once to the trusted uploader, never formatted or logged.
pub struct AssetImageSourceAccess {
    token: String,
}
impl AssetImageSourceAccess {
    pub fn token(&self) -> &str {
        &self.token
    }
}
/// Private encrypted payload; decrypt only for an authorized exact-byte handoff.
/// Deliberately no Debug/Serialize; identifiers are not product display labels.
#[derive(sqlx::FromRow)]
pub struct InspectedImageSource {
    pub ciphertext: Vec<u8>,
    pub content_type: String,
    pub content_sha256: String,
    pub byte_length: i64,
}
/// Fixed encoding shared by sealing and opening; no caller-selected domain.
pub fn inspected_image_source_aad(scope: crate::TenantScope, key: Uuid, source: Uuid) -> Vec<u8> {
    let mut aad = b"niu.inspected-image-source.v1".to_vec();
    for id in [scope.organization_id, scope.project_id, key, source] {
        aad.extend_from_slice(id.as_bytes());
    }
    aad
}
/// Verified exact approved bytes, deliberately without Debug/Serialize.
pub struct VerifiedImageSource {
    bytes: Vec<u8>,
    content_type: String,
}
impl VerifiedImageSource {
    pub fn bytes(&self) -> &[u8] {
        &self.bytes
    }
    pub fn content_type(&self) -> &str {
        &self.content_type
    }
}
impl InspectedImageSource {
    fn open_verified<F>(self, aad: &[u8], open: F) -> Result<VerifiedImageSource, StoreError>
    where
        F: FnOnce(&[u8], &[u8]) -> Result<Vec<u8>, StoreError>,
    {
        if !(1..=8388608).contains(&self.byte_length)
            || !(29..=8388736).contains(&self.ciphertext.len())
            || !matches!(
                self.content_type.as_str(),
                "image/png" | "image/jpeg" | "image/webp"
            )
        {
            return Err(StoreError::InvalidObservation);
        }
        let bytes = open(aad, &self.ciphertext)?;
        if bytes.len() as i64 != self.byte_length
            || format!("{:x}", Sha256::digest(&bytes)) != self.content_sha256
        {
            return Err(StoreError::InvalidObservation);
        }
        Ok(VerifiedImageSource {
            bytes,
            content_type: self.content_type,
        })
    }
}
const INGESTION_STATUS: &str = "SELECT jsonb_build_object('consent_id',d.id,'expires_at',d.expires_at,'status',CASE WHEN outcome.outcome IS NOT NULL THEN outcome.outcome WHEN claim.consent_id IS NOT NULL THEN 'pending' WHEN revoked.consent_id IS NOT NULL THEN 'revoked' WHEN d.expires_at<=clock_timestamp() OR s.expires_at<=clock_timestamp() THEN 'expired' ELSE 'consented' END,'reason',outcome.reason,'duration_ms',outcome.duration_ms,'observed_at',outcome.created_at,'consent_revoked',revoked.consent_id IS NOT NULL,'dispatch_available',claim.consent_id IS NULL AND revoked.consent_id IS NULL AND d.expires_at>clock_timestamp() AND s.expires_at>clock_timestamp() AND EXISTS(SELECT 1 FROM inspected_image_source_content content WHERE content.source_id=s.id) AND NOT EXISTS(SELECT 1 FROM inspected_image_source_erasures erased WHERE erased.source_id=s.id)) FROM asset_image_ingestion_consents d JOIN inspected_image_sources s ON s.id=d.source_id JOIN api_keys k ON k.id=s.key_id LEFT JOIN asset_image_ingestion_claims claim ON claim.consent_id=d.id LEFT JOIN asset_image_ingestion_outcomes outcome ON outcome.consent_id=d.id LEFT JOIN asset_image_ingestion_consent_revocations revoked ON revoked.consent_id=d.id";

impl Store {
    pub(crate) async fn authorize_image_source_using(
        &self,
        tx: &mut Transaction<'_, Postgres>,
        principal: &Principal,
        snapshot: &GuardrailSnapshot,
    ) -> Result<(), StoreError> {
        let scope = principal.scope();
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('niu-guardrails:'||$1::text||':'||$2::text,0))").bind(scope.organization_id).bind(scope.project_id).execute(&mut **tx).await?;
        let active: Option<Uuid> = sqlx::query_scalar("SELECT id FROM api_keys WHERE id=$1 AND organization_id=$2 AND project_id=$3 AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR SHARE").bind(principal.key_id()).bind(scope.organization_id).bind(scope.project_id).fetch_optional(&mut **tx).await?;
        if active.is_none() {
            return Err(StoreError::Unauthorized);
        }
        let current = Self::guardrail_snapshot_using(&mut **tx, scope, principal.key_id())
            .await?
            .ok_or(StoreError::Unauthorized)?;
        if !crate::image_processing::same_policy(&current, snapshot) {
            return Err(StoreError::Conflict);
        }
        Ok(())
    }
    /// Save actual runtime-approved bytes under an exact current receipt. The
    /// seal callback must use authenticated encryption bound to scope and id.
    /// No caller-provided Clear verdict, plaintext hash or source URL is accepted.
    pub async fn save_inspected_image_source<F>(
        &self,
        principal: &Principal,
        snapshot: &GuardrailSnapshot,
        input: InspectedImageSourceInput<'_>,
        seal: F,
    ) -> Result<(), StoreError>
    where
        F: FnOnce(&[u8], &[u8]) -> Result<Vec<u8>, StoreError>,
    {
        let scope = principal.scope();
        if !(1..=900).contains(&input.valid_for_seconds) {
            return Err(StoreError::InvalidObservation);
        }
        if !input.runtime.approval_current(
            &scope.project_id.to_string(),
            input.consent,
            input.approval,
        ) {
            return Err(StoreError::Unauthorized);
        }
        let mut tx = self.pool.begin().await?;
        self.authorize_image_source_using(&mut tx, principal, snapshot)
            .await?;
        if input.additional_approvals.len() > 7 {
            return Err(StoreError::InvalidObservation);
        }
        let required = crate::image_processing::required_image_detectors(snapshot)?;
        let primary = crate::ImageRequestApproval {
            receipt_id: input.approval_id,
            runtime: input.runtime,
            consent: input.consent,
            approval: input.approval,
        };
        let mut proof_ids = std::collections::BTreeSet::new();
        let mut detectors = std::collections::BTreeSet::new();
        for entry in std::iter::once(&primary).chain(input.additional_approvals.iter()) {
            if !proof_ids.insert(entry.receipt_id)
                || entry.approval.content_sha256() != input.approval.content_sha256()
                || !entry.runtime.approval_current(
                    &scope.project_id.to_string(),
                    entry.consent,
                    entry.approval,
                )
            {
                return Err(StoreError::Conflict);
            }
            let row = sqlx::query("SELECT detector_name FROM image_processing_approvals WHERE id=$1 AND organization_id=$2 AND project_id=$3 AND key_id=$4 AND content_sha256=$5 AND configuration_fingerprint=$6 AND detector_revision=$7 AND workspace_revision IS NOT DISTINCT FROM $8 AND key_policy_revision IS NOT DISTINCT FROM $9 AND key_assignment_revision IS NOT DISTINCT FROM $10")
                .bind(entry.receipt_id).bind(scope.organization_id).bind(scope.project_id).bind(principal.key_id()).bind(entry.approval.content_sha256()).bind(entry.approval.configuration_fingerprint()).bind(entry.approval.detector_revision()).bind(snapshot.workspace_revision).bind(snapshot.key_policy_revision).bind(snapshot.key_assignment_revision).fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
            let detector: String = row.get("detector_name");
            if !detectors.insert(detector.clone())
                || required.get(&detector).is_some_and(|fingerprint| {
                    fingerprint != entry.approval.configuration_fingerprint()
                })
            {
                return Err(StoreError::Conflict);
            }
        }
        if required
            .keys()
            .any(|detector| !detectors.contains(detector))
        {
            return Err(StoreError::Conflict);
        }
        let reference = input
            .approval
            .inline_reference(12 * 1024 * 1024)
            .map_err(|_| StoreError::InvalidObservation)?;
        let (header, encoded) = reference
            .split_once(',')
            .ok_or(StoreError::InvalidObservation)?;
        let mime = header
            .strip_prefix("data:")
            .and_then(|v| v.strip_suffix(";base64"))
            .ok_or(StoreError::InvalidObservation)?;
        if !matches!(mime, "image/png" | "image/jpeg" | "image/webp") {
            return Err(StoreError::InvalidObservation);
        }
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .map_err(|_| StoreError::InvalidObservation)?;
        if bytes.is_empty()
            || bytes.len() > 8 * 1024 * 1024
            || format!("{:x}", Sha256::digest(&bytes)) != input.approval.content_sha256()
        {
            return Err(StoreError::InvalidObservation);
        }
        // Serialize admissions across workspaces in the database, not per process.
        // Cleanup/erasure can only reduce the usage measured under this lock.
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('niu-inspected-image-source-capacity',0))")
            .execute(&mut *tx).await?;
        let usage = sqlx::query("SELECT count(*) AS total_count,COALESCE(sum(octet_length(c.ciphertext)),0)::bigint AS total_bytes,count(*) FILTER(WHERE s.organization_id=$1 AND s.project_id=$2) AS workspace_count,COALESCE(sum(octet_length(c.ciphertext)) FILTER(WHERE s.organization_id=$1 AND s.project_id=$2),0)::bigint AS workspace_bytes FROM inspected_image_source_content c JOIN inspected_image_sources s ON s.id=c.source_id")
            .bind(scope.organization_id).bind(scope.project_id).fetch_one(&mut *tx).await?;
        if source_capacity_exceeded(
            usage.get("workspace_count"),
            usage.get("workspace_bytes"),
            usage.get("total_count"),
            usage.get("total_bytes"),
            bytes.len(),
        ) {
            return Err(StoreError::ImageSourceCapacityExceeded);
        }
        let ciphertext = seal(
            &bytes,
            &inspected_image_source_aad(scope, principal.key_id(), input.id),
        )?;
        if !(28..=bytes.len() + 128).contains(&ciphertext.len()) {
            return Err(StoreError::InvalidObservation);
        }
        let inserted = sqlx::query("INSERT INTO inspected_image_sources(id,approval_id,organization_id,project_id,key_id,content_sha256,content_type,byte_length,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,statement_timestamp()+make_interval(secs=>$9)) ON CONFLICT DO NOTHING")
            .bind(input.id).bind(input.approval_id).bind(scope.organization_id).bind(scope.project_id).bind(principal.key_id()).bind(input.approval.content_sha256()).bind(mime).bind(bytes.len() as i64).bind(input.valid_for_seconds as f64).execute(&mut *tx).await?.rows_affected();
        if inserted != 1 {
            return Err(StoreError::Conflict);
        }
        sqlx::query(
            "INSERT INTO inspected_image_source_content(source_id,ciphertext) VALUES($1,$2)",
        )
        .bind(input.id)
        .bind(ciphertext)
        .execute(&mut *tx)
        .await?;
        for approval_id in proof_ids {
            sqlx::query(
                "INSERT INTO inspected_image_source_approvals(source_id,approval_id) VALUES($1,$2)",
            )
            .bind(input.id)
            .bind(approval_id)
            .execute(&mut *tx)
            .await?;
        }
        tx.commit().await?;
        Ok(())
    }
    /// Current scope/key/policy are required even for previously approved bytes.
    /// Expired or erased content is unavailable. No original URL is retained.
    pub async fn inspected_image_source(
        &self,
        principal: &Principal,
        snapshot: &GuardrailSnapshot,
        id: Uuid,
    ) -> Result<Option<InspectedImageSource>, StoreError> {
        let mut tx = self.pool.begin().await?;
        self.authorize_image_source_using(&mut tx, principal, snapshot)
            .await?;
        let scope = principal.scope();
        let result=sqlx::query_as("SELECT c.ciphertext,s.content_type,s.content_sha256,s.byte_length FROM inspected_image_sources s JOIN inspected_image_source_content c ON c.source_id=s.id JOIN image_processing_approvals a ON a.id=s.approval_id WHERE s.id=$1 AND s.organization_id=$2 AND s.project_id=$3 AND s.key_id=$4 AND s.expires_at>clock_timestamp() AND EXISTS(SELECT 1 FROM inspected_image_source_approvals p WHERE p.source_id=s.id AND p.approval_id=s.approval_id) AND a.workspace_revision IS NOT DISTINCT FROM $5 AND a.key_policy_revision IS NOT DISTINCT FROM $6 AND a.key_assignment_revision IS NOT DISTINCT FROM $7 AND NOT EXISTS(SELECT 1 FROM inspected_image_source_erasures e WHERE e.source_id=s.id)")
            .bind(id).bind(scope.organization_id).bind(scope.project_id).bind(principal.key_id()).bind(snapshot.workspace_revision).bind(snapshot.key_policy_revision).bind(snapshot.key_assignment_revision).fetch_optional(&mut *tx).await?;
        tx.commit().await?;
        Ok(result)
    }
    /// Read current scoped content, authenticate it and verify the immutable
    /// approved length/hash before returning bytes. Publication and dispatch
    /// must separately recheck current recipient/consent and ingestion rights.
    pub async fn verified_inspected_image_source<F>(
        &self,
        principal: &Principal,
        snapshot: &GuardrailSnapshot,
        id: Uuid,
        open: F,
    ) -> Result<Option<VerifiedImageSource>, StoreError>
    where
        F: FnOnce(&[u8], &[u8]) -> Result<Vec<u8>, StoreError>,
    {
        let saved = self.inspected_image_source(principal, snapshot, id).await?;
        saved
            .map(|saved| {
                saved.open_verified(
                    &inspected_image_source_aad(principal.scope(), principal.key_id(), id),
                    open,
                )
            })
            .transpose()
    }

    /// Persist source-specific ingestion consent under current workspace/key
    /// policy and an exact reviewed CreateAsset grant for the original group.
    /// Expiry is capped by both source retention and authorization. Repeating an
    /// identity cannot renew it, retarget it or resurrect revoked consent.
    pub async fn consent_asset_image_ingestion(
        &self,
        principal: &Principal,
        snapshot: &GuardrailSnapshot,
        input: AssetImageIngestionConsent,
    ) -> Result<bool, StoreError> {
        if !input.confirm_ingestion || !(1..=900).contains(&input.valid_for_seconds) {
            return Err(StoreError::InvalidObservation);
        }
        let scope = principal.scope();
        let mut tx = self.pool.begin().await?;
        self.authorize_image_source_using(&mut tx, principal, snapshot)
            .await?;
        let vendor: Option<Uuid> = sqlx::query_scalar("SELECT vendor_id FROM asset_group_create_intents WHERE id=$1 AND organization_id=$2 AND project_id=$3 AND state='succeeded' AND upstream_group_id IS NOT NULL")
            .bind(input.group_intent_id).bind(scope.organization_id).bind(scope.project_id).fetch_optional(&mut *tx).await?;
        let vendor = vendor.ok_or(StoreError::Conflict)?;
        sqlx::query("SELECT id FROM vendors WHERE id=$1 FOR UPDATE")
            .bind(vendor)
            .execute(&mut *tx)
            .await?;
        let admission = sqlx::query("WITH eligible AS (SELECT $1::uuid,s.id,i.id,a.id,$5::integer,true,LEAST(s.expires_at,a.expires_at,statement_timestamp()+make_interval(secs=>$5::double precision)) FROM inspected_image_sources s JOIN inspected_image_source_content c ON c.source_id=s.id JOIN image_processing_approvals p ON p.id=s.approval_id JOIN asset_group_create_intents i ON i.id=$3 AND i.organization_id=s.organization_id AND i.project_id=s.project_id JOIN asset_operation_authorizations a ON a.id=$4 AND a.organization_id=i.organization_id AND a.project_id=i.project_id AND a.vendor_id=i.vendor_id AND a.vendor_revision=i.vendor_revision AND a.credential_revision=i.credential_revision JOIN vendors v ON v.id=i.vendor_id AND v.revision=i.vendor_revision JOIN vendor_asset_management_credentials k ON k.vendor_id=i.vendor_id AND k.revision=i.credential_revision AND k.upstream_project=i.upstream_project WHERE s.id=$2 AND s.organization_id=$6 AND s.project_id=$7 AND s.key_id=$8 AND s.expires_at>clock_timestamp() AND a.operation='CreateAsset' AND a.expires_at>clock_timestamp() AND i.state='succeeded' AND i.upstream_group_id IS NOT NULL AND k.credential_ciphertext IS NOT NULL AND p.workspace_revision IS NOT DISTINCT FROM $9 AND p.key_policy_revision IS NOT DISTINCT FROM $10 AND p.key_assignment_revision IS NOT DISTINCT FROM $11 AND EXISTS(SELECT 1 FROM inspected_image_source_approvals proof WHERE proof.source_id=s.id AND proof.approval_id=s.approval_id) AND NOT EXISTS(SELECT 1 FROM inspected_image_source_erasures e WHERE e.source_id=s.id) AND NOT EXISTS(SELECT 1 FROM asset_operation_authorization_revocations r WHERE r.authorization_id=a.id) AND NOT EXISTS(SELECT 1 FROM vendor_asset_management_revocations r WHERE r.vendor_id=i.vendor_id AND r.through_revision>=i.credential_revision) AND NOT EXISTS(SELECT 1 FROM asset_group_deletion_claims d JOIN asset_group_create_intents original ON original.id=d.intent_id WHERE original.vendor_id=i.vendor_id AND original.credential_revision=i.credential_revision AND original.upstream_project=i.upstream_project AND original.upstream_group_id=i.upstream_group_id) AND NOT EXISTS(SELECT 1 FROM asset_image_ingestion_consent_revocations r WHERE r.consent_id=$1) ), inserted AS (INSERT INTO asset_image_ingestion_consents(id,source_id,group_intent_id,authorization_id,valid_for_seconds,confirm_ingestion,expires_at) SELECT * FROM eligible ON CONFLICT(id) DO NOTHING RETURNING id) SELECT EXISTS(SELECT 1 FROM eligible) AS eligible,EXISTS(SELECT 1 FROM inserted) AS inserted")
            .bind(input.id).bind(input.source_id).bind(input.group_intent_id).bind(input.authorization_id).bind(input.valid_for_seconds).bind(scope.organization_id).bind(scope.project_id).bind(principal.key_id()).bind(snapshot.workspace_revision).bind(snapshot.key_policy_revision).bind(snapshot.key_assignment_revision).fetch_one(&mut *tx).await?;
        if !admission.get::<bool, _>("eligible") {
            return Err(StoreError::Conflict);
        }
        let inserted: bool = admission.get("inserted");
        if !inserted {
            let identical: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM asset_image_ingestion_consents d JOIN inspected_image_sources s ON s.id=d.source_id WHERE d.id=$1 AND d.source_id=$2 AND d.group_intent_id=$3 AND d.authorization_id=$4 AND d.valid_for_seconds=$5 AND d.expires_at>clock_timestamp() AND s.organization_id=$6 AND s.project_id=$7 AND s.key_id=$8 AND NOT EXISTS(SELECT 1 FROM asset_image_ingestion_consent_revocations r WHERE r.consent_id=d.id))")
                .bind(input.id).bind(input.source_id).bind(input.group_intent_id).bind(input.authorization_id).bind(input.valid_for_seconds).bind(scope.organization_id).bind(scope.project_id).bind(principal.key_id()).fetch_one(&mut *tx).await?;
            if !identical {
                return Err(StoreError::Conflict);
            }
        }
        tx.commit().await?;
        Ok(inserted)
    }

    /// Customer-safe status for the original active key; no credentials, source
    /// capabilities, upstream identifiers or procurement data are serialized.
    pub async fn asset_image_ingestion_status(
        &self,
        principal: &Principal,
        id: Uuid,
    ) -> Result<Option<serde_json::Value>, StoreError> {
        let scope = principal.scope();
        Ok(sqlx::query_scalar(&format!("{INGESTION_STATUS} WHERE d.id=$1 AND s.organization_id=$2 AND s.project_id=$3 AND s.key_id=$4 AND k.revoked_at IS NULL AND k.expires_at>clock_timestamp()"))
            .bind(id).bind(scope.organization_id).bind(scope.project_id).bind(principal.key_id()).fetch_optional(&self.pool).await?)
    }

    /// Newest-first saved history scoped to the original active API key.
    /// A foreign cursor is unavailable, never a way to cross the key boundary.
    pub async fn asset_image_ingestion_history(
        &self,
        principal: &Principal,
        before: Option<Uuid>,
    ) -> Result<Option<(Vec<serde_json::Value>, Option<Uuid>)>, StoreError> {
        if let Some(cursor) = before
            && self
                .asset_image_ingestion_status(principal, cursor)
                .await?
                .is_none()
        {
            return Ok(None);
        }
        let scope = principal.scope();
        let query = format!(
            "{INGESTION_STATUS} WHERE s.organization_id=$1 AND s.project_id=$2 AND s.key_id=$3 AND k.revoked_at IS NULL AND k.expires_at>clock_timestamp() AND ($4::uuid IS NULL OR (d.created_at,d.id)<(SELECT created_at,id FROM asset_image_ingestion_consents WHERE id=$4)) ORDER BY d.created_at DESC,d.id DESC LIMIT 51"
        );
        let mut rows: Vec<serde_json::Value> = sqlx::query_scalar(&query)
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .bind(principal.key_id())
            .bind(before)
            .fetch_all(&self.pool)
            .await?;
        let next = if rows.len() > 50 {
            rows.truncate(50);
            Some(
                rows.last()
                    .and_then(|row| row["consent_id"].as_str())
                    .and_then(|id| Uuid::parse_str(id).ok())
                    .ok_or(StoreError::InvalidObservation)?,
            )
        } else {
            None
        };
        Ok(Some((rows, next)))
    }

    /// Explicit revocation remains possible after a workspace policy changes.
    /// Scope and original API key are required; revocation never erases provenance.
    pub async fn revoke_asset_image_ingestion_consent(
        &self,
        principal: &Principal,
        id: Uuid,
    ) -> Result<bool, StoreError> {
        let scope = principal.scope();
        let changed=sqlx::query("INSERT INTO asset_image_ingestion_consent_revocations(consent_id) SELECT d.id FROM asset_image_ingestion_consents d JOIN inspected_image_sources s ON s.id=d.source_id JOIN api_keys k ON k.id=s.key_id WHERE d.id=$1 AND s.organization_id=$2 AND s.project_id=$3 AND s.key_id=$4 AND k.revoked_at IS NULL AND k.expires_at>clock_timestamp() ON CONFLICT DO NOTHING")
            .bind(id).bind(scope.organization_id).bind(scope.project_id).bind(principal.key_id()).execute(&self.pool).await?.rows_affected()==1;
        Ok(changed)
    }

    /// Issue once for a committed ingestion claim, never renew on repetition.
    /// Store only its hash; access ends within sixty seconds or earlier when
    /// source retention, consent, API key or reviewed authorization expires.
    pub async fn issue_asset_image_source_access(
        &self,
        principal: &Principal,
        snapshot: &GuardrailSnapshot,
        consent: Uuid,
    ) -> Result<Option<AssetImageSourceAccess>, StoreError> {
        let scope = principal.scope();
        let token = format!("nis_{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
        let digest = Sha256::digest(token.as_bytes());
        let mut tx = self.pool.begin().await?;
        self.authorize_image_source_using(&mut tx, principal, snapshot)
            .await?;
        let changed=sqlx::query("INSERT INTO asset_image_source_access(token_sha256,consent_id,expires_at) SELECT $1,d.id,LEAST(statement_timestamp()+interval '60 seconds',d.expires_at,s.expires_at,a.expires_at,key.expires_at) FROM asset_image_ingestion_consents d JOIN asset_image_ingestion_claims claim ON claim.consent_id=d.id JOIN inspected_image_sources s ON s.id=d.source_id JOIN inspected_image_source_content content ON content.source_id=s.id JOIN api_keys key ON key.id=s.key_id JOIN asset_group_create_intents i ON i.id=d.group_intent_id JOIN asset_operation_authorizations a ON a.id=d.authorization_id JOIN vendors v ON v.id=i.vendor_id AND v.revision=i.vendor_revision JOIN vendor_asset_management_credentials c ON c.vendor_id=i.vendor_id AND c.revision=i.credential_revision WHERE d.id=$2 AND s.organization_id=$3 AND s.project_id=$4 AND s.key_id=$5 AND d.expires_at>clock_timestamp() AND s.expires_at>clock_timestamp() AND a.expires_at>clock_timestamp() AND a.operation='CreateAsset' AND c.credential_ciphertext IS NOT NULL AND NOT EXISTS(SELECT 1 FROM asset_image_ingestion_consent_revocations r WHERE r.consent_id=d.id) AND NOT EXISTS(SELECT 1 FROM inspected_image_source_erasures e WHERE e.source_id=s.id) AND NOT EXISTS(SELECT 1 FROM asset_operation_authorization_revocations r WHERE r.authorization_id=a.id) AND NOT EXISTS(SELECT 1 FROM vendor_asset_management_revocations r WHERE r.vendor_id=i.vendor_id AND r.through_revision>=i.credential_revision) ON CONFLICT DO NOTHING")
            .bind(digest.as_slice()).bind(consent).bind(scope.organization_id).bind(scope.project_id).bind(principal.key_id()).execute(&mut *tx).await?.rows_affected()==1;
        tx.commit().await?;
        Ok(changed.then_some(AssetImageSourceAccess { token }))
    }

    /// Fetch exact immutable approved bytes at most four times. Each delivery
    /// repeats current policy, grant, consent, key and detector runtime checks.
    /// A bearer token conveys only this source; it never exposes credentials.
    pub async fn deliver_asset_image_source<F>(
        &self,
        token: &str,
        detectors: &[(&str, &Runtime)],
        open: F,
    ) -> Result<Option<VerifiedImageSource>, StoreError>
    where
        F: FnOnce(&[u8], &[u8]) -> Result<Vec<u8>, StoreError>,
    {
        if token.len() != 68
            || !token.starts_with("nis_")
            || !token[4..].bytes().all(|b| b.is_ascii_hexdigit())
        {
            return Ok(None);
        }
        let digest: [u8; 32] = Sha256::digest(token.as_bytes()).into();
        let context:Option<(Uuid,Uuid,Uuid,Uuid)>=sqlx::query_as("SELECT d.id,s.organization_id,s.project_id,s.key_id FROM asset_image_source_access access JOIN asset_image_ingestion_consents d ON d.id=access.consent_id JOIN inspected_image_sources s ON s.id=d.source_id WHERE access.token_sha256=$1 AND access.expires_at>clock_timestamp()")
            .bind(digest.as_slice()).fetch_optional(&self.pool).await?;
        let Some((consent, organization_id, project_id, key)) = context else {
            return Ok(None);
        };
        let scope = crate::TenantScope {
            organization_id,
            project_id,
        };
        let principal = match self.dashboard_key(scope, key).await {
            Ok(principal) => principal,
            Err(StoreError::Unauthorized) => return Ok(None),
            Err(error) => return Err(error),
        };
        let Some(snapshot) = self.guardrail_snapshot(scope, key).await? else {
            return Ok(None);
        };
        match self
            .asset_image_ingestion_handoff(
                &principal,
                &snapshot,
                consent,
                detectors,
                (open, Some(&digest)),
            )
            .await
        {
            Ok(Some(handoff)) => Ok(Some(handoff.source)),
            Ok(None) | Err(StoreError::Unauthorized) | Err(StoreError::Conflict) => Ok(None),
            Err(error) => Err(error),
        }
    }

    pub async fn claim_asset_image_ingestion<F>(
        &self,
        principal: &Principal,
        snapshot: &GuardrailSnapshot,
        consent: Uuid,
        detectors: &[(&str, &Runtime)],
        open: F,
    ) -> Result<Option<ClaimedAssetImageIngestion>, StoreError>
    where
        F: FnOnce(&[u8], &[u8]) -> Result<Vec<u8>, StoreError>,
    {
        self.asset_image_ingestion_handoff(principal, snapshot, consent, detectors, (open, None))
            .await
    }

    /// Authenticate exact source bytes under a current one-shot consent before
    /// releasing original destination credentials. The callback is bounded local
    /// decryption only. Every saved detector must still permit this workspace
    /// and consent fingerprint under its current runtime configuration. Caller
    /// establishes immutable publication before dispatch; no URL is generated.
    async fn asset_image_ingestion_handoff<F>(
        &self,
        principal: &Principal,
        snapshot: &GuardrailSnapshot,
        consent: Uuid,
        detectors: &[(&str, &Runtime)],
        (open, delivery): (F, Option<&[u8; 32]>),
    ) -> Result<Option<ClaimedAssetImageIngestion>, StoreError>
    where
        F: FnOnce(&[u8], &[u8]) -> Result<Vec<u8>, StoreError>,
    {
        let scope = principal.scope();
        let mut tx = self.pool.begin().await?;
        self.authorize_image_source_using(&mut tx, principal, snapshot)
            .await?;
        if let Some(digest) = delivery {
            let usable:Option<Uuid>=sqlx::query_scalar("SELECT access.consent_id FROM asset_image_source_access access WHERE access.token_sha256=$1 AND access.consent_id=$2 AND access.expires_at>clock_timestamp() AND (SELECT count(*) FROM asset_image_source_deliveries event WHERE event.token_sha256=access.token_sha256)<4 FOR UPDATE")
                .bind(digest.as_slice()).bind(consent).fetch_optional(&mut *tx).await?;
            if usable.is_none() {
                return Ok(None);
            }
        }
        let vendor:Option<Uuid>=sqlx::query_scalar("SELECT i.vendor_id FROM asset_image_ingestion_consents d JOIN inspected_image_sources s ON s.id=d.source_id JOIN asset_group_create_intents i ON i.id=d.group_intent_id WHERE d.id=$1 AND s.organization_id=$2 AND s.project_id=$3 AND s.key_id=$4")
            .bind(consent).bind(scope.organization_id).bind(scope.project_id).bind(principal.key_id()).fetch_optional(&mut *tx).await?;
        let Some(vendor) = vendor else {
            return Ok(None);
        };
        sqlx::query("SELECT id FROM vendors WHERE id=$1 FOR UPDATE")
            .bind(vendor)
            .execute(&mut *tx)
            .await?;
        let row=sqlx::query("SELECT s.id AS source_id,c.ciphertext,s.content_type,s.content_sha256,s.byte_length,i.upstream_group_id,i.upstream_project,i.credential_revision,k.credential_ciphertext FROM asset_image_ingestion_consents d JOIN inspected_image_sources s ON s.id=d.source_id JOIN inspected_image_source_content c ON c.source_id=s.id JOIN image_processing_approvals p ON p.id=s.approval_id JOIN asset_group_create_intents i ON i.id=d.group_intent_id AND i.organization_id=s.organization_id AND i.project_id=s.project_id JOIN asset_operation_authorizations a ON a.id=d.authorization_id AND a.organization_id=i.organization_id AND a.project_id=i.project_id AND a.vendor_id=i.vendor_id AND a.vendor_revision=i.vendor_revision AND a.credential_revision=i.credential_revision JOIN vendors v ON v.id=i.vendor_id AND v.revision=i.vendor_revision JOIN vendor_asset_management_credentials k ON k.vendor_id=i.vendor_id AND k.revision=i.credential_revision AND k.upstream_project=i.upstream_project WHERE d.id=$1 AND d.confirm_ingestion AND d.expires_at>clock_timestamp() AND s.expires_at>clock_timestamp() AND a.operation='CreateAsset' AND a.expires_at>clock_timestamp() AND i.state='succeeded' AND i.upstream_group_id IS NOT NULL AND k.credential_ciphertext IS NOT NULL AND p.workspace_revision IS NOT DISTINCT FROM $2 AND p.key_policy_revision IS NOT DISTINCT FROM $3 AND p.key_assignment_revision IS NOT DISTINCT FROM $4 AND EXISTS(SELECT 1 FROM inspected_image_source_approvals proof WHERE proof.source_id=s.id AND proof.approval_id=s.approval_id) AND NOT EXISTS(SELECT 1 FROM inspected_image_source_erasures e WHERE e.source_id=s.id) AND NOT EXISTS(SELECT 1 FROM asset_image_ingestion_consent_revocations r WHERE r.consent_id=d.id) AND NOT EXISTS(SELECT 1 FROM asset_operation_authorization_revocations r WHERE r.authorization_id=a.id) AND NOT EXISTS(SELECT 1 FROM vendor_asset_management_revocations r WHERE r.vendor_id=i.vendor_id AND r.through_revision>=i.credential_revision) AND (EXISTS(SELECT 1 FROM asset_image_ingestion_claims claim WHERE claim.consent_id=d.id)=$5::boolean) AND NOT EXISTS(SELECT 1 FROM asset_group_deletion_claims deletion JOIN asset_group_create_intents original ON original.id=deletion.intent_id WHERE original.vendor_id=i.vendor_id AND original.credential_revision=i.credential_revision AND original.upstream_project=i.upstream_project AND original.upstream_group_id=i.upstream_group_id) FOR UPDATE OF d,s")
            .bind(consent).bind(snapshot.workspace_revision).bind(snapshot.key_policy_revision).bind(snapshot.key_assignment_revision).bind(delivery.is_some()).fetch_optional(&mut *tx).await?;
        let Some(row) = row else {
            return Ok(None);
        };
        let source_id: Uuid = row.get("source_id");
        let proofs:Vec<(String,String)>=sqlx::query_as("SELECT a.detector_name,a.configuration_fingerprint FROM inspected_image_source_approvals proof JOIN image_processing_approvals a ON a.id=proof.approval_id WHERE proof.source_id=$1")
            .bind(source_id).fetch_all(&mut *tx).await?;
        if proofs.is_empty() || proofs.len() > 8 {
            return Err(StoreError::Conflict);
        }
        for (name, fingerprint) in proofs {
            let Some((_, runtime)) = detectors.iter().find(|(configured, _)| *configured == name)
            else {
                return Ok(None);
            };
            let consent = Consent {
                configuration_fingerprint: fingerprint,
                consent_to_image_processing: true,
            };
            if !runtime.permits(&scope.project_id.to_string(), &consent) {
                return Ok(None);
            }
        }
        let source = InspectedImageSource {
            ciphertext: row.get("ciphertext"),
            content_type: row.get("content_type"),
            content_sha256: row.get("content_sha256"),
            byte_length: row.get("byte_length"),
        }
        .open_verified(
            &inspected_image_source_aad(scope, principal.key_id(), source_id),
            open,
        )?;
        let project: String = row.get("upstream_project");
        let group = niu_media::asset_read::OrdinaryGroupRead::new(
            row.get("upstream_group_id"),
            project.clone(),
        )
        .map_err(|_| StoreError::InvalidObservation)?;
        let changed = if let Some(digest) = delivery {
            sqlx::query("INSERT INTO asset_image_source_deliveries(token_sha256,ordinal) SELECT access.token_sha256,((SELECT count(*) FROM asset_image_source_deliveries event WHERE event.token_sha256=access.token_sha256)+1)::smallint FROM asset_image_source_access access JOIN asset_image_ingestion_consents d ON d.id=access.consent_id JOIN inspected_image_sources s ON s.id=d.source_id JOIN asset_operation_authorizations a ON a.id=d.authorization_id WHERE access.token_sha256=$1 AND access.expires_at>clock_timestamp() AND d.expires_at>clock_timestamp() AND s.expires_at>clock_timestamp() AND a.expires_at>clock_timestamp() AND NOT EXISTS(SELECT 1 FROM asset_image_ingestion_consent_revocations r WHERE r.consent_id=d.id) AND (SELECT count(*) FROM asset_image_source_deliveries event WHERE event.token_sha256=access.token_sha256)<4")
                .bind(digest.as_slice()).execute(&mut *tx).await?.rows_affected()==1
        } else {
            sqlx::query("INSERT INTO asset_image_ingestion_claims(consent_id) SELECT d.id FROM asset_image_ingestion_consents d JOIN inspected_image_sources s ON s.id=d.source_id JOIN asset_operation_authorizations a ON a.id=d.authorization_id WHERE d.id=$1 AND d.expires_at>clock_timestamp() AND s.expires_at>clock_timestamp() AND a.expires_at>clock_timestamp() AND NOT EXISTS(SELECT 1 FROM asset_image_ingestion_consent_revocations r WHERE r.consent_id=d.id) ON CONFLICT DO NOTHING")
            .bind(consent).execute(&mut *tx).await?.rows_affected()==1
        };
        if !changed {
            return Ok(None);
        }
        let credential = crate::AssetManagementCredentialRevision {
            vendor_id: vendor,
            revision: row.get("credential_revision"),
            upstream_project: project,
            credential_ciphertext: row.get("credential_ciphertext"),
        };
        tx.commit().await?;
        Ok(Some(ClaimedAssetImageIngestion {
            consent_id: consent,
            credential,
            group,
            source,
        }))
    }

    /// First immutable outcome wins. Accepted creation is never asset readiness.
    pub async fn finish_asset_image_ingestion(
        &self,
        principal: &Principal,
        consent: Uuid,
        outcome: AssetImageIngestionOutcome<'_>,
        duration_ms: i64,
    ) -> Result<bool, StoreError> {
        let (state, asset, reason) = match outcome {
            AssetImageIngestionOutcome::Accepted {
                upstream_asset_id: id,
            } => {
                if !id.starts_with("asset-")
                    || !(7..=128).contains(&id.len())
                    || !id
                        .bytes()
                        .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_'))
                {
                    return Err(StoreError::InvalidObservation);
                }
                ("accepted", Some(id), None)
            }
            AssetImageIngestionOutcome::Uncertain { reason } => {
                if !matches!(
                    reason,
                    "invalid_configuration"
                        | "destination_rejected"
                        | "unavailable"
                        | "transport"
                        | "timeout"
                        | "response_limit"
                        | "invalid_response"
                ) {
                    return Err(StoreError::InvalidObservation);
                }
                ("uncertain", None, Some(reason))
            }
        };
        if duration_ms < 0 {
            return Err(StoreError::InvalidObservation);
        }
        let scope = principal.scope();
        Ok(sqlx::query("INSERT INTO asset_image_ingestion_outcomes(consent_id,outcome,upstream_asset_id,reason,duration_ms) SELECT claim.consent_id,$5,$6,$7,$8 FROM asset_image_ingestion_claims claim JOIN asset_image_ingestion_consents d ON d.id=claim.consent_id JOIN inspected_image_sources s ON s.id=d.source_id WHERE claim.consent_id=$1 AND s.organization_id=$2 AND s.project_id=$3 AND s.key_id=$4 ON CONFLICT DO NOTHING")
            .bind(consent).bind(scope.organization_id).bind(scope.project_id).bind(principal.key_id()).bind(state).bind(asset).bind(reason).bind(duration_ms).execute(&self.pool).await?.rows_affected()==1)
    }

    /// A lost worker cannot prove whether the upstream accepted its request.
    /// Preserve its one-shot claim and deletion fence; never redispatch it.
    /// The fixed minute exceeds the bounded 30-second upload transport.
    pub async fn recover_interrupted_asset_image_ingestions(&self) -> Result<u64, StoreError> {
        Ok(sqlx::query("WITH stale AS (SELECT claim.consent_id,(EXTRACT(EPOCH FROM statement_timestamp()-claim.created_at)*1000)::bigint AS duration_ms FROM asset_image_ingestion_claims claim WHERE claim.created_at<=statement_timestamp()-interval '60 seconds' AND NOT EXISTS(SELECT 1 FROM asset_image_ingestion_outcomes outcome WHERE outcome.consent_id=claim.consent_id) ORDER BY claim.created_at,claim.consent_id LIMIT 16 FOR UPDATE OF claim SKIP LOCKED) INSERT INTO asset_image_ingestion_outcomes(consent_id,outcome,reason,duration_ms) SELECT consent_id,'uncertain','timeout',duration_ms FROM stale ON CONFLICT DO NOTHING")
            .execute(&self.pool).await?.rows_affected())
    }

    /// Remove at most sixteen expired encrypted payloads per maintenance tick.
    /// Immutable source metadata and approval provenance remain. Locked sources
    /// are skipped so explicit erasure and concurrent workers cannot stall a batch.
    pub async fn purge_expired_inspected_image_sources(&self) -> Result<u64, StoreError> {
        let mut tx = self.pool.begin().await?;
        let ids: Vec<Uuid> = sqlx::query_scalar(
            "SELECT s.id FROM inspected_image_sources s JOIN inspected_image_source_content c ON c.source_id=s.id WHERE s.expires_at<=clock_timestamp() ORDER BY s.expires_at,s.id LIMIT 16 FOR UPDATE OF s SKIP LOCKED"
        ).fetch_all(&mut *tx).await?;
        if ids.is_empty() {
            tx.commit().await?;
            return Ok(0);
        }
        sqlx::query("INSERT INTO inspected_image_source_erasures(source_id) SELECT unnest($1::uuid[]) ON CONFLICT DO NOTHING")
            .bind(&ids).execute(&mut *tx).await?;
        let removed =
            sqlx::query("DELETE FROM inspected_image_source_content WHERE source_id=ANY($1)")
                .bind(&ids)
                .execute(&mut *tx)
                .await?
                .rows_affected();
        tx.commit().await?;
        Ok(removed)
    }

    /// Erase only this key's scoped ciphertext. Immutable provenance remains.
    /// Policy changes must not prevent erasure of previously saved content.
    pub async fn erase_inspected_image_source(
        &self,
        principal: &Principal,
        id: Uuid,
    ) -> Result<bool, StoreError> {
        let scope = principal.scope();
        let mut tx = self.pool.begin().await?;
        let found: Option<Uuid> = sqlx::query_scalar("SELECT s.id FROM inspected_image_sources s JOIN api_keys k ON k.id=s.key_id WHERE s.id=$1 AND s.organization_id=$2 AND s.project_id=$3 AND s.key_id=$4 AND k.revoked_at IS NULL AND k.expires_at>clock_timestamp() FOR UPDATE OF s")
            .bind(id).bind(scope.organization_id).bind(scope.project_id).bind(principal.key_id()).fetch_optional(&mut *tx).await?;
        if found.is_none() {
            return Ok(false);
        }
        let inserted=sqlx::query("INSERT INTO inspected_image_source_erasures(source_id) VALUES($1) ON CONFLICT DO NOTHING").bind(id).execute(&mut *tx).await?.rows_affected()==1;
        sqlx::query("DELETE FROM inspected_image_source_content WHERE source_id=$1")
            .bind(id)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(inserted)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn capacity_bounds_include_cipher_overhead_and_both_scopes() {
        assert!(!source_capacity_exceeded(255, 0, 4095, 0, 1));
        assert!(source_capacity_exceeded(256, 0, 0, 0, 1));
        assert!(source_capacity_exceeded(0, 0, 4096, 0, 1));
        assert!(!source_capacity_exceeded(
            0,
            128 * 1024 * 1024 - 129,
            0,
            0,
            1
        ));
        assert!(source_capacity_exceeded(
            0,
            128 * 1024 * 1024 - 128,
            0,
            0,
            1
        ));
        assert!(!source_capacity_exceeded(
            0,
            0,
            0,
            1024 * 1024 * 1024 - 129,
            1
        ));
        assert!(source_capacity_exceeded(
            0,
            0,
            0,
            1024 * 1024 * 1024 - 128,
            1
        ));
    }
    #[test]
    fn verified_plaintext_must_match_saved_bounds_and_approval_hash() {
        let record = || InspectedImageSource {
            ciphertext: vec![1; 32],
            content_type: "image/png".into(),
            content_sha256: format!("{:x}", Sha256::digest([0, 255, 128])),
            byte_length: 3,
        };
        assert_eq!(
            record()
                .open_verified(b"binding", |_, _| Ok(vec![0, 255, 128]))
                .unwrap()
                .bytes(),
            &[0, 255, 128]
        );
        for bytes in [vec![0, 255], vec![0, 255, 127], vec![0, 255, 128, 0]] {
            assert!(
                record()
                    .open_verified(b"binding", |_, _| Ok(bytes))
                    .is_err()
            );
        }
        let mut invalid = record();
        invalid.byte_length = 8388609;
        assert!(
            invalid
                .open_verified(b"binding", |_, _| panic!("invalid bound must not decrypt"))
                .is_err()
        );
        let mut invalid = record();
        invalid.content_type = "text/html".into();
        assert!(
            invalid
                .open_verified(b"binding", |_, _| panic!("invalid MIME must not decrypt"))
                .is_err()
        );
        assert!(
            record()
                .open_verified(b"binding", |_, _| Err(StoreError::InvalidObservation))
                .is_err()
        );
    }
}
