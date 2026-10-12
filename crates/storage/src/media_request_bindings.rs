//! Exact inline-audio request preparation. Receipts alone never grant egress.
use crate::{GuardrailSnapshot, Principal, Store, StoreError};
use base64::{Engine, engine::general_purpose::STANDARD};
use niu_media::{
    ValidatedVideoRequest,
    media_detector::{Consent, ProcessingApproval, Runtime},
    media_inspection::MediaKind,
};
use sha2::{Digest, Sha256};
use sqlx::Row;
use std::collections::{BTreeMap, BTreeSet};
use uuid::Uuid;

/// Actual opaque runtime approval plus its scoped immutable receipt. A caller
/// cannot substitute a declared verdict, hash or remote URL for this evidence.
pub struct MediaRequestApproval<'a> {
    pub receipt_id: Uuid,
    pub runtime: &'a Runtime,
    pub consent: &'a Consent,
    pub approval: &'a ProcessingApproval,
}
impl Store {
    /// Bind supported text/inline-audio wire content without dispatching. Mixed
    /// image/video paths require the later composite coordinator; remote video
    /// needs trusted exact-delivery evidence and is deliberately not admitted here.
    pub async fn bind_media_request(
        &self,
        principal: &Principal,
        attempt: Uuid,
        snapshot: &GuardrailSnapshot,
        request: &ValidatedVideoRequest,
        approvals: &[MediaRequestApproval<'_>],
    ) -> Result<(), StoreError> {
        let mut tx = self.begin_bounded_recording().await?;
        Self::bind_media_request_using(
            &mut tx, principal, attempt, snapshot, request, approvals, true,
        )
        .await?;
        tx.commit().await?;
        Ok(())
    }

    /// Internal only: retain existing qualified-route, key/model, funding and
    /// intent-transition guards. This does not make a Provider reference-capable.
    #[expect(dead_code, reason = "Awaiting combined media dispatch integration")]
    pub(crate) async fn mark_media_dispatched(
        &self,
        principal: &Principal,
        attempt: Uuid,
        snapshot: &GuardrailSnapshot,
        request: &ValidatedVideoRequest,
        approvals: &[MediaRequestApproval<'_>],
    ) -> Result<(), StoreError> {
        let mut tx = self.begin_bounded_recording().await?;
        Self::bind_media_request_using(
            &mut tx, principal, attempt, snapshot, request, approvals, false,
        )
        .await?;
        if !Self::mark_dispatched_using(&mut tx, principal, attempt).await? {
            return Err(StoreError::Conflict);
        }
        tx.commit().await?;
        Ok(())
    }

    /// Composite coordinators must use this helper in the same transaction as
    /// all other content proofs and the existing final dispatch transition.
    #[allow(clippy::too_many_arguments)]
    pub(crate) async fn bind_media_request_using(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        principal: &Principal,
        attempt: Uuid,
        snapshot: &GuardrailSnapshot,
        request: &ValidatedVideoRequest,
        approvals: &[MediaRequestApproval<'_>],
        allow_insert: bool,
    ) -> Result<(), StoreError> {
        let content = request.body()["content"]
            .as_array()
            .ok_or(StoreError::InvalidObservation)?;
        if content.is_empty() || content.len() > 32 || approvals.is_empty() || approvals.len() > 512
        {
            return Err(StoreError::InvalidObservation);
        }
        let mut media = BTreeMap::new();
        for (position, item) in content.iter().enumerate() {
            match item["type"].as_str() {
                Some("text") => {}
                Some("audio_url") => {
                    let url = item["audio_url"]["url"]
                        .as_str()
                        .ok_or(StoreError::InvalidObservation)?;
                    let (header, encoded) =
                        url.split_once(',').ok_or(StoreError::InvalidObservation)?;
                    let mime = header
                        .strip_prefix("data:")
                        .and_then(|v| v.strip_suffix(";base64"))
                        .filter(|v| matches!(*v, "audio/wav" | "audio/mpeg"))
                        .ok_or(StoreError::InvalidObservation)?;
                    if encoded.len() > 11_184_812 {
                        return Err(StoreError::InvalidObservation);
                    }
                    let bytes = STANDARD
                        .decode(encoded)
                        .map_err(|_| StoreError::InvalidObservation)?;
                    if bytes.is_empty() || bytes.len() > 8_388_608 {
                        return Err(StoreError::InvalidObservation);
                    }
                    let digest = format!("{:x}", Sha256::digest(&bytes));
                    media.insert(position as i32, (mime, bytes.len() as i64, digest, encoded));
                }
                // Neither arbitrary video URLs nor image approval bypasses are
                // supported by this incremental standalone entry point.
                _ => return Err(StoreError::InvalidObservation),
            }
        }
        if media.is_empty() {
            return Err(StoreError::InvalidObservation);
        }
        let scope = principal.scope();
        let mut ids = BTreeSet::new();
        for entry in approvals {
            if !ids.insert(entry.receipt_id)
                || entry.approval.kind() != MediaKind::Audio
                || !entry.runtime.approval_current(
                    &scope.project_id.to_string(),
                    entry.consent,
                    entry.approval,
                )
            {
                return Err(StoreError::Unauthorized);
            }
        }
        Self::authorize_media_processing_using(tx, principal, snapshot).await?;
        // Inspect current model grants under the key lock, not a Principal's
        // earlier dashboard snapshot. The final dispatch procedure repeats this.
        let allowed: bool = sqlx::query_scalar("SELECT ('*'=ANY(allowed_models) OR $4=ANY(allowed_models)) FROM api_keys WHERE organization_id=$1 AND project_id=$2 AND id=$3 AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR SHARE")
            .bind(scope.organization_id).bind(scope.project_id).bind(principal.key_id()).bind(request.model_alias())
            .fetch_optional(&mut **tx).await?.ok_or(StoreError::Unauthorized)?;
        if !allowed {
            return Err(StoreError::Unauthorized);
        }
        sqlx::query("SELECT id FROM attempts WHERE organization_id=$1 AND project_id=$2 AND id=$3 AND api_key_id=$4 AND execution='not_sent' AND dispatched_at IS NULL AND resource_id=$5 FOR UPDATE")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt).bind(principal.key_id()).bind(request.model_alias())
            .fetch_optional(&mut **tx).await?.ok_or(StoreError::Conflict)?;
        let route = sqlx::query("SELECT r.upstream_model,r.schema_revision,r.adapter,p.channel,m.capabilities FROM media_recovery_routes r JOIN media_recovery_protocols p ON p.attempt_id=r.attempt_id JOIN vendors v ON v.id=r.vendor_id JOIN vendor_models m ON m.vendor_id=v.id AND m.alias=$4 WHERE r.organization_id=$1 AND r.project_id=$2 AND r.attempt_id=$3 AND v.enabled AND m.enabled AND v.revision=r.vendor_revision AND m.revision=r.model_revision AND v.adapter=r.adapter AND v.api_base=r.api_base AND m.upstream_model=r.upstream_model AND NOT EXISTS(SELECT 1 FROM personal_vendor_ownership o WHERE o.vendor_id=v.id AND o.organization_id<>r.organization_id) FOR SHARE OF v,m")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt).bind(request.model_alias())
            .fetch_optional(&mut **tx).await?.ok_or(StoreError::Conflict)?;
        let capabilities: serde_json::Value = route.get("capabilities");
        let schema: niu_media::VideoSchema =
            serde_json::from_value(capabilities["video_schema"].clone())
                .map_err(|_| StoreError::Conflict)?;
        if route.get::<String, _>("adapter") != "ark"
            || route.get::<String, _>("channel") != "ark-direct-v1"
            || schema.channel != "ark-direct-v1"
            || schema.revision != request.schema_revision()
            || route.get::<String, _>("schema_revision") != request.schema_revision()
            || schema.model_alias != request.model_alias()
            || schema.upstream_model != route.get::<String, _>("upstream_model")
            || request.body()["model"].as_str() != Some(schema.upstream_model.as_str())
        {
            return Err(StoreError::Conflict);
        }
        let mut public_body = request.body().clone();
        public_body["model"] = serde_json::json!(request.model_alias());
        let revalidated = schema
            .validate_request(
                &serde_json::to_vec(&public_body).map_err(|_| StoreError::InvalidObservation)?,
            )
            .map_err(|_| StoreError::Conflict)?;
        if revalidated.body() != request.body() {
            return Err(StoreError::Conflict);
        }
        let required = required_audio_detectors(snapshot)?;
        if required.is_empty() {
            return Err(StoreError::Unauthorized);
        }
        let mut satisfied = BTreeSet::new();
        for entry in approvals {
            let row = sqlx::query("SELECT detector_name,content_position,kind,content_type,byte_length,content_sha256,configuration_fingerprint,detector_revision,workspace_revision,key_policy_revision,key_assignment_revision FROM media_processing_approvals WHERE id=$1 AND organization_id=$2 AND project_id=$3 AND key_id=$4")
                .bind(entry.receipt_id).bind(scope.organization_id).bind(scope.project_id).bind(principal.key_id())
                .fetch_optional(&mut **tx).await?.ok_or(StoreError::Conflict)?;
            let position: i32 = row.get("content_position");
            let detector: String = row.get("detector_name");
            let (mime, byte_length, content_hash, encoded) =
                media.get(&position).ok_or(StoreError::Conflict)?;
            if !satisfied.insert((position, detector.clone()))
                || required.get(&detector).map(String::as_str)
                    != Some(entry.approval.configuration_fingerprint())
                || row.get::<String, _>("kind") != "audio"
                || row.get::<String, _>("content_type") != *mime
                || entry.approval.content_type() != *mime
                || STANDARD.encode(entry.approval.encoded_bytes()) != *encoded
                || row.get::<i64, _>("byte_length") != *byte_length
                || entry.approval.encoded_bytes().len() as i64 != *byte_length
                || row.get::<String, _>("content_sha256") != *content_hash
                || row.get::<String, _>("content_sha256") != entry.approval.content_sha256()
                || row.get::<String, _>("configuration_fingerprint")
                    != entry.approval.configuration_fingerprint()
                || row.get::<String, _>("detector_revision") != entry.approval.detector_revision()
                || row.get::<Option<i64>, _>("workspace_revision") != snapshot.workspace_revision
                || row.get::<Option<i64>, _>("key_policy_revision") != snapshot.key_policy_revision
                || row.get::<Option<i64>, _>("key_assignment_revision")
                    != snapshot.key_assignment_revision
            {
                return Err(StoreError::Conflict);
            }
        }
        if media.keys().any(|position| {
            required
                .keys()
                .any(|detector| !satisfied.contains(&(*position, detector.clone())))
        }) {
            return Err(StoreError::Conflict);
        }
        let body_hash = format!(
            "{:x}",
            Sha256::digest(
                serde_json::to_vec(request.body()).map_err(|_| StoreError::InvalidObservation)?
            )
        );
        let positions: Vec<i32> = media.keys().copied().collect();
        type Saved = (
            String,
            String,
            Vec<i32>,
            Option<i64>,
            Option<i64>,
            Option<i64>,
        );
        let existing: Option<Saved> = sqlx::query_as("SELECT body_sha256,schema_revision,media_positions,workspace_revision,key_policy_revision,key_assignment_revision FROM media_request_bindings WHERE organization_id=$1 AND project_id=$2 AND key_id=$3 AND attempt_id=$4")
            .bind(scope.organization_id).bind(scope.project_id).bind(principal.key_id()).bind(attempt).fetch_optional(&mut **tx).await?;
        if let Some(existing) = existing {
            let saved: Vec<Uuid> = sqlx::query_scalar("SELECT approval_id FROM media_request_approval_bindings WHERE attempt_id=$1 ORDER BY approval_id").bind(attempt).fetch_all(&mut **tx).await?;
            if existing
                != (
                    body_hash,
                    request.schema_revision().into(),
                    positions,
                    snapshot.workspace_revision,
                    snapshot.key_policy_revision,
                    snapshot.key_assignment_revision,
                )
                || saved != ids.into_iter().collect::<Vec<_>>()
            {
                return Err(StoreError::Conflict);
            }
            return Ok(());
        }
        if !allow_insert {
            return Err(StoreError::Conflict);
        }
        sqlx::query("INSERT INTO media_request_bindings(organization_id,project_id,key_id,attempt_id,body_sha256,schema_revision,media_positions,workspace_revision,key_policy_revision,key_assignment_revision) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)")
            .bind(scope.organization_id).bind(scope.project_id).bind(principal.key_id()).bind(attempt).bind(body_hash).bind(request.schema_revision()).bind(positions)
            .bind(snapshot.workspace_revision).bind(snapshot.key_policy_revision).bind(snapshot.key_assignment_revision).execute(&mut **tx).await?;
        for id in ids {
            let inserted: Option<Uuid> = sqlx::query_scalar("INSERT INTO media_request_approval_bindings(organization_id,project_id,key_id,attempt_id,approval_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(approval_id) DO NOTHING RETURNING approval_id")
                .bind(scope.organization_id).bind(scope.project_id).bind(principal.key_id()).bind(attempt).bind(id).fetch_optional(&mut **tx).await?;
            if inserted.is_none() {
                return Err(StoreError::Conflict);
            }
        }
        Ok(())
    }
}
fn required_audio_detectors(
    snapshot: &GuardrailSnapshot,
) -> Result<BTreeMap<String, String>, StoreError> {
    let mut required = BTreeMap::new();
    for policy in [&snapshot.workspace_policy, &snapshot.key_policy]
        .into_iter()
        .flatten()
    {
        let Some(bindings) = policy.get("media_detectors") else {
            continue;
        };
        for binding in bindings.as_array().ok_or(StoreError::InvalidObservation)? {
            let kind: MediaKind = serde_json::from_value(binding["kind"].clone())
                .map_err(|_| StoreError::InvalidObservation)?;
            if kind != MediaKind::Audio {
                continue;
            }
            let detector = binding["detector"]
                .as_str()
                .ok_or(StoreError::InvalidObservation)?;
            let fingerprint = binding["configuration_fingerprint"]
                .as_str()
                .ok_or(StoreError::InvalidObservation)?;
            if binding["consent_to_media_processing"].as_bool() != Some(true) {
                return Err(StoreError::Unauthorized);
            }
            if let Some(previous) = required.insert(detector.into(), fingerprint.into())
                && previous != fingerprint
            {
                return Err(StoreError::Unauthorized);
            }
        }
    }
    Ok(required)
}
