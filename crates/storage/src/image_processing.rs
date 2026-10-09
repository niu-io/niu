use crate::{GuardrailSnapshot, Principal, Store, StoreError};
use niu_media::image_detector::{Consent, ProcessingApproval, Runtime};
use uuid::Uuid;

pub struct ImageApprovalRecord<'a> {
    pub detector_name: &'a str,
    pub content_position: i32,
    pub elapsed_ms: i64,
    pub runtime: &'a Runtime,
    pub consent: &'a Consent,
    pub approval: &'a ProcessingApproval,
}
impl Store {
    /// Recheck access and consent epochs before starting each image inspection.
    /// This short transaction does not hold policy edits across network I/O;
    /// receipts and dispatch must independently recheck after inspection.
    pub async fn authorize_image_inspection(
        &self,
        principal: &Principal,
        snapshot: &GuardrailSnapshot,
    ) -> Result<(), StoreError> {
        let scope = principal.scope();
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('niu-guardrails:'||$1::text||':'||$2::text,0))")
            .bind(scope.organization_id).bind(scope.project_id).execute(&mut *tx).await?;
        let active: Option<Uuid> = sqlx::query_scalar("SELECT k.id FROM api_keys k JOIN projects p ON p.organization_id=k.organization_id AND p.id=k.project_id WHERE k.id=$1 AND k.organization_id=$2 AND k.project_id=$3 AND k.revoked_at IS NULL AND k.expires_at > clock_timestamp() FOR SHARE OF k,p")
            .bind(principal.key_id()).bind(scope.organization_id).bind(scope.project_id).fetch_optional(&mut *tx).await?;
        if active.is_none() {
            return Err(StoreError::Unauthorized);
        }
        let current = Self::guardrail_snapshot_using(&mut *tx, scope, principal.key_id())
            .await?
            .ok_or(StoreError::Unauthorized)?;
        if !same_policy(&current, snapshot) {
            return Err(StoreError::Conflict);
        }
        tx.commit().await?;
        Ok(())
    }

    /// Record an actual consented runtime approval, never a caller-supplied
    /// Clear verdict. Current key access and policy epochs are rechecked under
    /// the same workspace coordination lock used for dispatch and policy edits.
    /// This receipt does not authorize dispatch or reserve/debit any balance.
    pub async fn record_image_processing_approval(
        &self,
        principal: &Principal,
        snapshot: &GuardrailSnapshot,
        record: ImageApprovalRecord<'_>,
    ) -> Result<Uuid, StoreError> {
        let scope = principal.scope();
        if record.detector_name.is_empty()
            || record.detector_name.len() > 200
            || !record
                .detector_name
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
            || !(0..=255).contains(&record.content_position)
            || !(0..=60000).contains(&record.elapsed_ms)
        {
            return Err(StoreError::InvalidObservation);
        }
        if !record.runtime.approval_current(
            &scope.project_id.to_string(),
            record.consent,
            record.approval,
        ) {
            return Err(StoreError::Unauthorized);
        }
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('niu-guardrails:'||$1::text||':'||$2::text,0))")
            .bind(scope.organization_id).bind(scope.project_id).execute(&mut *tx).await?;
        let key:Option<Uuid>=sqlx::query_scalar("SELECT k.id FROM api_keys k JOIN projects p ON p.organization_id=k.organization_id AND p.id=k.project_id WHERE k.id=$1 AND k.organization_id=$2 AND k.project_id=$3 AND k.revoked_at IS NULL AND k.expires_at > clock_timestamp() FOR SHARE OF k,p")
            .bind(principal.key_id()).bind(scope.organization_id).bind(scope.project_id).fetch_optional(&mut *tx).await?;
        if key.is_none() {
            return Err(StoreError::Unauthorized);
        }
        let current = Self::guardrail_snapshot_using(&mut *tx, scope, principal.key_id())
            .await?
            .ok_or(StoreError::Unauthorized)?;
        if (
            current.workspace_revision,
            &current.workspace_policy,
            current.key_policy_revision,
            current.key_assignment_revision,
            &current.key_policy,
        ) != (
            snapshot.workspace_revision,
            &snapshot.workspace_policy,
            snapshot.key_policy_revision,
            snapshot.key_assignment_revision,
            &snapshot.key_policy,
        ) {
            return Err(StoreError::Conflict);
        }
        let id = Uuid::new_v4();
        sqlx::query("INSERT INTO image_processing_approvals(id,organization_id,project_id,key_id,detector_name,detector_revision,configuration_fingerprint,content_sha256,content_position,workspace_revision,key_policy_revision,key_assignment_revision,elapsed_ms) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)")
            .bind(id).bind(scope.organization_id).bind(scope.project_id).bind(principal.key_id())
            .bind(record.detector_name).bind(record.approval.detector_revision()).bind(record.approval.configuration_fingerprint())
            .bind(record.approval.content_sha256()).bind(record.content_position)
            .bind(snapshot.workspace_revision).bind(snapshot.key_policy_revision).bind(snapshot.key_assignment_revision).bind(record.elapsed_ms)
            .execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(id)
    }
}

pub struct ImageRequestApproval<'a> {
    pub receipt_id: Uuid,
    pub runtime: &'a Runtime,
    pub consent: &'a Consent,
    pub approval: &'a ProcessingApproval,
}
impl Store {
    /// Bind immutable validated wire content and every inline image to actual
    /// scoped receipts. This never marks dispatch, reserves funds or approves a
    /// channel. Final gateway authorization and exact-request recheck remain required.
    pub async fn bind_image_request(
        &self,
        principal: &Principal,
        attempt: Uuid,
        snapshot: &GuardrailSnapshot,
        request: &niu_media::ValidatedVideoRequest,
        approvals: &[ImageRequestApproval<'_>],
    ) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        Self::bind_image_request_using(
            &mut tx, principal, attempt, snapshot, request, approvals, true,
        )
        .await?;
        tx.commit().await?;
        Ok(())
    }

    /// Recheck immutable image evidence and commit intent under one set of
    /// workspace/key/attempt locks. Existing channel qualification guards remain
    /// authoritative; this API does not enable an unqualified image policy.
    pub async fn mark_image_dispatched(
        &self,
        principal: &Principal,
        attempt: Uuid,
        snapshot: &GuardrailSnapshot,
        request: &niu_media::ValidatedVideoRequest,
        approvals: &[ImageRequestApproval<'_>],
    ) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        Self::bind_image_request_using(
            &mut tx, principal, attempt, snapshot, request, approvals, false,
        )
        .await?;
        let allowed = Self::mark_dispatched_using(&mut tx, principal, attempt).await?;
        tx.commit().await?;
        if allowed {
            Ok(())
        } else {
            Err(StoreError::Conflict)
        }
    }

    async fn bind_image_request_using(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        principal: &Principal,
        attempt: Uuid,
        snapshot: &GuardrailSnapshot,
        request: &niu_media::ValidatedVideoRequest,
        approvals: &[ImageRequestApproval<'_>],
        allow_insert: bool,
    ) -> Result<(), StoreError> {
        use sha2::{Digest, Sha256};
        use sqlx::Row;
        let scope = principal.scope();
        let content = request.body()["content"]
            .as_array()
            .ok_or(StoreError::InvalidObservation)?;
        if approvals.is_empty() || approvals.len() > 1024 || content.len() > 256 {
            return Err(StoreError::InvalidObservation);
        }
        let mut positions = Vec::new();
        for (position, item) in content.iter().enumerate() {
            match item["type"].as_str() {
                Some("text") => {}
                Some("image_url") => {
                    let url = item["image_url"]["url"]
                        .as_str()
                        .ok_or(StoreError::InvalidObservation)?;
                    if !url.starts_with("data:image/") {
                        return Err(StoreError::InvalidObservation);
                    }
                    positions.push(position as i32);
                }
                _ => return Err(StoreError::InvalidObservation),
            }
        }
        if positions.is_empty() {
            return Err(StoreError::InvalidObservation);
        }
        let mut ids = std::collections::BTreeSet::new();
        for entry in approvals {
            if !ids.insert(entry.receipt_id)
                || !entry.runtime.approval_current(
                    &scope.project_id.to_string(),
                    entry.consent,
                    entry.approval,
                )
            {
                return Err(StoreError::Unauthorized);
            }
        }
        let body_hash = format!(
            "{:x}",
            Sha256::digest(
                serde_json::to_vec(request.body()).map_err(|_| StoreError::InvalidObservation)?
            )
        );
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('niu-guardrails:'||$1::text||':'||$2::text,0))").bind(scope.organization_id).bind(scope.project_id).execute(&mut **tx).await?;
        let active:Option<Uuid>=sqlx::query_scalar("SELECT k.id FROM api_keys k JOIN projects p ON p.organization_id=k.organization_id AND p.id=k.project_id WHERE k.id=$1 AND k.organization_id=$2 AND k.project_id=$3 AND k.revoked_at IS NULL AND k.expires_at > clock_timestamp() FOR SHARE OF k,p").bind(principal.key_id()).bind(scope.organization_id).bind(scope.project_id).fetch_optional(&mut **tx).await?;
        if active.is_none() {
            return Err(StoreError::Unauthorized);
        }
        let current = Self::guardrail_snapshot_using(&mut **tx, scope, principal.key_id())
            .await?
            .ok_or(StoreError::Unauthorized)?;
        if !same_policy(&current, snapshot) {
            return Err(StoreError::Conflict);
        }
        let pinned:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM attempts a JOIN media_recovery_routes r ON r.attempt_id=a.id JOIN inspected_guardrail_bindings b ON b.attempt_id=a.id WHERE a.organization_id=$1 AND a.project_id=$2 AND a.id=$3 AND a.execution='not_sent' AND a.dispatched_at IS NULL AND a.resource_id=$4 AND r.upstream_model=$5 AND r.schema_revision=$6 AND b.key_id=$7)")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt).bind(request.model_alias()).bind(request.body()["model"].as_str()).bind(request.schema_revision()).bind(principal.key_id()).fetch_one(&mut **tx).await?;
        if !pinned {
            return Err(StoreError::Conflict);
        }
        let required = required_image_detectors(&current)?;
        let mut satisfied = std::collections::BTreeSet::new();
        let mut covered = std::collections::BTreeSet::new();
        let mut detector_positions = std::collections::BTreeSet::new();
        for entry in approvals {
            let row=sqlx::query("SELECT detector_name,content_position,content_sha256,configuration_fingerprint,detector_revision,workspace_revision,key_policy_revision,key_assignment_revision FROM image_processing_approvals WHERE id=$1 AND organization_id=$2 AND project_id=$3 AND key_id=$4")
                .bind(entry.receipt_id).bind(scope.organization_id).bind(scope.project_id).bind(principal.key_id()).fetch_optional(&mut **tx).await?.ok_or(StoreError::Conflict)?;
            let position: i32 = row.get("content_position");
            let detector: String = row.get("detector_name");
            if let Some(fingerprint) = required.get(&detector) {
                if row.get::<String, _>("configuration_fingerprint") != *fingerprint {
                    return Err(StoreError::Conflict);
                }
                satisfied.insert((position, detector.clone()));
            }
            if !positions.contains(&position)
                || !detector_positions.insert((position, row.get::<String, _>("detector_name")))
            {
                return Err(StoreError::Conflict);
            }
            let url = content[position as usize]["image_url"]["url"]
                .as_str()
                .ok_or(StoreError::Conflict)?;
            if entry
                .approval
                .inline_reference(url.len())
                .map_err(|_| StoreError::Conflict)?
                != url
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
            covered.insert(position);
        }
        if covered.len() != positions.len()
            || positions.iter().any(|position| {
                required
                    .keys()
                    .any(|detector| !satisfied.contains(&(*position, detector.clone())))
            })
        {
            return Err(StoreError::Conflict);
        }
        type SavedBinding = (
            String,
            String,
            Vec<i32>,
            Option<i64>,
            Option<i64>,
            Option<i64>,
        );
        let existing: Option<SavedBinding> =sqlx::query_as("SELECT body_sha256,schema_revision,image_positions,workspace_revision,key_policy_revision,key_assignment_revision FROM image_request_bindings WHERE attempt_id=$1 AND organization_id=$2 AND project_id=$3 AND key_id=$4")
            .bind(attempt).bind(scope.organization_id).bind(scope.project_id).bind(principal.key_id()).fetch_optional(&mut **tx).await?;
        if let Some(existing) = existing {
            let saved:Vec<Uuid>=sqlx::query_scalar("SELECT approval_id FROM image_request_approval_bindings WHERE attempt_id=$1 ORDER BY approval_id").bind(attempt).fetch_all(&mut **tx).await?;
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
        sqlx::query("INSERT INTO image_request_bindings(organization_id,project_id,key_id,attempt_id,body_sha256,schema_revision,image_positions,workspace_revision,key_policy_revision,key_assignment_revision) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)")
            .bind(scope.organization_id).bind(scope.project_id).bind(principal.key_id()).bind(attempt).bind(body_hash).bind(request.schema_revision()).bind(positions).bind(snapshot.workspace_revision).bind(snapshot.key_policy_revision).bind(snapshot.key_assignment_revision).execute(&mut **tx).await?;
        for id in ids {
            let bound:Option<Uuid>=sqlx::query_scalar("INSERT INTO image_request_approval_bindings(organization_id,project_id,key_id,attempt_id,approval_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(approval_id) DO NOTHING RETURNING approval_id")
                .bind(scope.organization_id).bind(scope.project_id).bind(principal.key_id()).bind(attempt).bind(id).fetch_optional(&mut **tx).await?;
            if bound.is_none() {
                return Err(StoreError::Conflict);
            }
        }
        Ok(())
    }
}
pub(super) fn same_policy(a: &GuardrailSnapshot, b: &GuardrailSnapshot) -> bool {
    (
        a.workspace_revision,
        &a.workspace_policy,
        a.key_policy_revision,
        a.key_assignment_revision,
        &a.key_policy,
    ) == (
        b.workspace_revision,
        &b.workspace_policy,
        b.key_policy_revision,
        b.key_assignment_revision,
        &b.key_policy,
    )
}

/// Parent and key requirements compose without dropping a detector. Conflicting
/// consent fingerprints cannot be satisfied by a receipt for either version.
pub(super) fn required_image_detectors(
    snapshot: &GuardrailSnapshot,
) -> Result<std::collections::BTreeMap<String, String>, StoreError> {
    let mut required = std::collections::BTreeMap::new();
    for policy in [&snapshot.workspace_policy, &snapshot.key_policy]
        .into_iter()
        .flatten()
    {
        let Some(bindings) = policy.get("image_detectors") else {
            continue;
        };
        let bindings = bindings
            .as_array()
            .filter(|bindings| bindings.len() <= 4)
            .ok_or(StoreError::Conflict)?;
        let mut names = std::collections::BTreeSet::new();
        for binding in bindings {
            let detector = binding["detector"].as_str().ok_or(StoreError::Conflict)?;
            let fingerprint = binding["configuration_fingerprint"]
                .as_str()
                .ok_or(StoreError::Conflict)?;
            if binding["consent_to_image_processing"].as_bool() != Some(true)
                || !(1..=200).contains(&detector.len())
                || !detector
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || b"_-".contains(&byte))
                || fingerprint.len() != 64
                || !fingerprint
                    .bytes()
                    .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
                || !names.insert(detector)
            {
                return Err(StoreError::Conflict);
            }
            if let Some(previous) = required.insert(detector.into(), fingerprint.into())
                && previous != fingerprint
            {
                return Err(StoreError::Conflict);
            }
        }
    }
    Ok(required)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn snapshot(workspace: serde_json::Value, key: serde_json::Value) -> GuardrailSnapshot {
        GuardrailSnapshot {
            input_detector_decision_ids: Vec::new(),
            input_outcome: None,
            input_elapsed_ms: None,
            workspace_revision: Some(1),
            workspace_policy: Some(workspace),
            key_assignment_revision: Some(1),
            key_policy_revision: Some(2),
            key_policy: Some(key),
        }
    }
    fn policy(detector: &str, fingerprint: &str) -> serde_json::Value {
        serde_json::json!({"image_detectors":[{"detector":detector,"configuration_fingerprint":fingerprint,"consent_to_image_processing":true}]})
    }
    #[test]
    fn image_requirements_compose_and_conflicting_processing_consent_fails_closed() {
        let a = "a".repeat(64);
        let b = "b".repeat(64);
        let combined =
            required_image_detectors(&snapshot(policy("parent", &a), policy("child", &b))).unwrap();
        assert_eq!(combined.len(), 2);
        assert_eq!(combined.get("parent"), Some(&a));
        assert_eq!(combined.get("child"), Some(&b));
        assert!(
            required_image_detectors(&snapshot(policy("same", &a), policy("same", &b))).is_err()
        );
        assert_eq!(
            required_image_detectors(&snapshot(policy("same", &a), policy("same", &a)))
                .unwrap()
                .len(),
            1
        );
        for invalid in [
            serde_json::json!({"image_detectors":null}),
            serde_json::json!({"image_detectors":{}}),
            serde_json::json!({"image_detectors":[{"detector":"image","configuration_fingerprint":a,"consent_to_external_processing":true}]}),
        ] {
            assert!(required_image_detectors(&snapshot(invalid, serde_json::json!({}))).is_err());
        }
    }
}
