//! Immutable exact-content approval metadata. A receipt is not dispatch authority.
use crate::{GuardrailSnapshot, Principal, Store, StoreError};
use niu_media::{
    media_detector::{Consent, ProcessingApproval, Runtime},
    media_inspection::MediaKind,
};
use uuid::Uuid;

/// Only the runtime's opaque actual approval can supply evidence. No raw media,
/// service response, endpoint, credential or inferred billable quantity is stored.
pub struct MediaApprovalRecord<'a> {
    pub detector_name: &'a str,
    pub content_position: i32,
    pub elapsed_ms: i64,
    pub runtime: &'a Runtime,
    pub consent: &'a Consent,
    pub approval: &'a ProcessingApproval,
}

impl Store {
    /// Recheck live key and pinned workspace/key policy epochs before disclosing
    /// media to a detector. No lock survives the network operation; approval
    /// recording and dispatch must repeat their own current checks afterward.
    pub async fn authorize_media_processing(
        &self,
        principal: &Principal,
        snapshot: &GuardrailSnapshot,
    ) -> Result<(), StoreError> {
        let mut tx = self.begin_bounded_recording().await?;
        Self::authorize_media_processing_using(&mut tx, principal, snapshot).await?;
        tx.commit().await?;
        Ok(())
    }

    /// Recheck current runtime consent and scoped key/policy epochs, then record
    /// actual MediaV3 approval metadata in one bounded transaction. No financial
    /// posting, Provider handoff or dispatch state transition occurs here.
    pub async fn record_media_processing_approval(
        &self,
        principal: &Principal,
        snapshot: &GuardrailSnapshot,
        record: MediaApprovalRecord<'_>,
    ) -> Result<Uuid, StoreError> {
        if !(1..=200).contains(&record.detector_name.len())
            || !record
                .detector_name
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
            || !(0..=255).contains(&record.content_position)
            || !(0..=60000).contains(&record.elapsed_ms)
        {
            return Err(StoreError::InvalidObservation);
        }
        let scope = principal.scope();
        if !record.runtime.approval_current(
            &scope.project_id.to_string(),
            record.consent,
            record.approval,
        ) {
            return Err(StoreError::Unauthorized);
        }
        // A valid runtime approval must also satisfy the recorded mandatory
        // parent/key policy. Conflicting bindings cannot authorize either version.
        let mut required = false;
        for policy in [&snapshot.workspace_policy, &snapshot.key_policy]
            .into_iter()
            .flatten()
        {
            let Some(bindings) = policy.get("media_detectors") else {
                continue;
            };
            for binding in bindings.as_array().ok_or(StoreError::InvalidObservation)? {
                if binding["detector"].as_str() != Some(record.detector_name) {
                    continue;
                }
                let kind: MediaKind = serde_json::from_value(binding["kind"].clone())
                    .map_err(|_| StoreError::InvalidObservation)?;
                if kind != record.approval.kind()
                    || binding["configuration_fingerprint"].as_str()
                        != Some(record.approval.configuration_fingerprint())
                    || binding["consent_to_media_processing"].as_bool() != Some(true)
                {
                    return Err(StoreError::Unauthorized);
                }
                required = true;
            }
        }
        if !required {
            return Err(StoreError::Unauthorized);
        }
        let kind = match record.approval.kind() {
            MediaKind::Audio => "audio",
            MediaKind::Video => "video",
        };
        let byte_length = i64::try_from(record.approval.encoded_bytes().len())
            .map_err(|_| StoreError::InvalidObservation)?;
        let mut tx = self.begin_bounded_recording().await?;
        Self::authorize_media_processing_using(&mut tx, principal, snapshot).await?;
        let id = Uuid::new_v4();
        sqlx::query("INSERT INTO media_processing_approvals(id,organization_id,project_id,key_id,detector_name,detector_revision,configuration_fingerprint,kind,content_type,byte_length,content_sha256,content_position,workspace_revision,key_policy_revision,key_assignment_revision,elapsed_ms) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)")
            .bind(id).bind(scope.organization_id).bind(scope.project_id).bind(principal.key_id())
            .bind(record.detector_name).bind(record.approval.detector_revision())
            .bind(record.approval.configuration_fingerprint()).bind(kind)
            .bind(record.approval.content_type()).bind(byte_length)
            .bind(record.approval.content_sha256()).bind(record.content_position)
            .bind(snapshot.workspace_revision).bind(snapshot.key_policy_revision)
            .bind(snapshot.key_assignment_revision).bind(record.elapsed_ms)
            .execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(id)
    }
}
