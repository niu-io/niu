//! Required kind-aware inspection of complete scoped saved media. This records
//! actual receipts only; Provider handoff and atomic dispatch remain separate.
use crate::{error::ApiError, state::AppState};
use niu_media::{
    media_detector::{Consent, ProcessingApproval, Runtime},
    media_inspection::MediaKind,
};
use niu_storage::{AssetLibraryKind, GuardrailSnapshot, Principal};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use uuid::Uuid;

/// Construct only from the current scoped library resolver. Never a public
/// approval input; identity and complete original bytes are checked again here.
pub(super) struct MediaInput {
    pub(super) position: usize,
    pub(super) asset_id: Uuid,
    pub(super) kind: MediaKind,
    pub(super) content_type: String,
    pub(super) content_sha256: String,
    pub(super) observed_revision: i64,
    pub(super) bytes: Vec<u8>,
}
/// No Debug/Serialize: the actual approval retains private original bytes and
/// permits, while receipt_id identifies only saved content-free metadata.
pub(super) struct InspectedMedia<'a> {
    detector_name: String,
    position: usize,
    receipt_id: Uuid,
    elapsed_ms: i64,
    runtime: &'a Runtime,
    consent: Consent,
    approval: ProcessingApproval,
}
impl InspectedMedia<'_> {
    pub(super) fn detector_name(&self) -> &str {
        &self.detector_name
    }
    pub(super) fn runtime(&self) -> &Runtime {
        self.runtime
    }
    pub(super) fn consent(&self) -> &Consent {
        &self.consent
    }
    pub(super) fn approval(&self) -> &ProcessingApproval {
        &self.approval
    }
    pub(super) fn elapsed_ms(&self) -> i64 {
        self.elapsed_ms
    }

    pub(super) fn position(&self) -> usize {
        self.position
    }
    pub(super) fn receipt_id(&self) -> Uuid {
        self.receipt_id
    }
    pub(super) fn record(&self) -> niu_storage::MediaApprovalRecord<'_> {
        niu_storage::MediaApprovalRecord {
            detector_name: &self.detector_name,
            content_position: self.position as i32,
            elapsed_ms: self.elapsed_ms,
            runtime: self.runtime,
            consent: &self.consent,
            approval: &self.approval,
        }
    }
}
pub(super) struct MediaSelection<'a> {
    pub(super) model_alias: &'a str,
    pub(super) provider: &'a str,
}
async fn current_access(
    state: &AppState,
    principal: &Principal,
    snapshot: &GuardrailSnapshot,
    selection: &MediaSelection<'_>,
) -> Result<(), ApiError> {
    state
        .store
        .authorize_media_processing(principal, snapshot)
        .await
        .map_err(ApiError::from_store)?;
    let current = state
        .store
        .dashboard_key(principal.scope(), principal.key_id())
        .await
        .map_err(ApiError::from_store)?;
    let current = state.authorize_key_source(current).await?;
    if !current.allows_model(selection.model_alias) {
        return Err(ApiError::not_found());
    }
    for stored in [&snapshot.workspace_policy, &snapshot.key_policy]
        .into_iter()
        .flatten()
    {
        let draft: crate::guardrails::PolicyDraft =
            serde_json::from_value(stored.clone()).map_err(|_| ApiError::forbidden())?;
        draft.validate_shape().map_err(|_| ApiError::forbidden())?;
        if !crate::guardrails::EffectiveAccess::compose([draft.models])
            .permits(selection.model_alias)
            || !crate::guardrails::EffectiveAccess::compose([draft.providers])
                .permits(selection.provider)
        {
            return Err(ApiError::forbidden());
        }
    }
    Ok(())
}
fn requirements(snapshot: &GuardrailSnapshot) -> Result<BTreeMap<String, Consent>, ApiError> {
    let parse=|policy:&Option<serde_json::Value>|->Result<Option<crate::guardrails::PolicyDraft>,ApiError>{
        policy.as_ref().map(|value| {
            let draft:crate::guardrails::PolicyDraft=serde_json::from_value(value.clone()).map_err(|_|ApiError::forbidden())?;
            draft.validate_shape().map_err(|_|ApiError::forbidden())?;Ok(draft)
        }).transpose()
    };
    let workspace = parse(&snapshot.workspace_policy)?;
    let key = parse(&snapshot.key_policy)?;
    crate::guardrails::media::compose_required(
        workspace
            .as_ref()
            .map(|p| p.media_detectors.as_slice())
            .unwrap_or_default(),
        key.as_ref()
            .map(|p| p.media_detectors.as_slice())
            .unwrap_or_default(),
    )
    .map_err(|_| ApiError::forbidden())
}
async fn current_source(
    state: &AppState,
    principal: &Principal,
    input: &MediaInput,
) -> Result<(), ApiError> {
    let asset = state
        .store
        .workspace_asset(principal.scope(), input.asset_id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    let kind = match asset.media_kind {
        AssetLibraryKind::Audio => MediaKind::Audio,
        AssetLibraryKind::Video => MediaKind::Video,
        AssetLibraryKind::Image => {
            return Err(ApiError::unsupported_message(
                "Image materials use the existing image inspection contract",
            ));
        }
    };
    let revision = asset
        .revision
        .parse::<i64>()
        .map_err(|_| ApiError::unavailable())?;
    if kind != input.kind
        || asset.content_type != input.content_type
        || asset.content_sha256 != input.content_sha256
        || asset.byte_length != input.bytes.len() as i64
        || revision < input.observed_revision
    {
        return Err(ApiError::unavailable());
    }
    Ok(())
}
/// Existing scope/key/policy-epoch authorization is reused before each disclosure;
/// it does not hold SQL locks across transport. Deletion or policy changes after
/// a sent inspection cannot retract bytes already disclosed. Dispatch must again
/// atomically check live sources, current receipts and all authorization epochs.
pub(super) async fn inspect<'a>(
    state: &'a AppState,
    principal: &Principal,
    snapshot: &GuardrailSnapshot,
    selection: &MediaSelection<'_>,
    inputs: &[MediaInput],
) -> Result<Vec<InspectedMedia<'a>>, ApiError> {
    if inputs.is_empty() {
        return Ok(Vec::new());
    }
    tokio::time::timeout(
        std::time::Duration::from_secs(state.config.server.request_timeout_seconds.min(60)),
        inspect_inner(state, principal, snapshot, selection, inputs),
    )
    .await
    .map_err(|_| ApiError::unavailable())?
}
async fn inspect_inner<'a>(
    state: &'a AppState,
    principal: &Principal,
    snapshot: &GuardrailSnapshot,
    selection: &MediaSelection<'_>,
    inputs: &[MediaInput],
) -> Result<Vec<InspectedMedia<'a>>, ApiError> {
    if inputs.len() > 8
        || inputs.iter().filter(|i| i.kind == MediaKind::Audio).count() > 4
        || inputs.iter().filter(|i| i.kind == MediaKind::Video).count() > 4
    {
        return Err(ApiError::unsupported_message(
            "Too many media reference inputs",
        ));
    }
    current_access(state, principal, snapshot, selection).await?;
    let mut positions = BTreeSet::new();
    for input in inputs {
        if input.position > 31
            || !positions.insert(input.position)
            || input.observed_revision < 1
            || input.bytes.is_empty()
            || input.bytes.len() > niu_media::workspace_asset_validation::MAX_ASSET_BYTES
            || format!("{:x}", Sha256::digest(&input.bytes)) != input.content_sha256
        {
            return Err(ApiError::invalid_request("Invalid saved media identity"));
        }
        current_source(state, principal, input).await?;
    }
    let required = requirements(snapshot)?;
    let workspace = principal.scope().project_id.to_string();
    let mut batches = BTreeMap::new();
    // Every input kind requires nonempty coverage. Parent requirements are never
    // replaced by a child policy, or by an image-only detector grant.
    for kind in [MediaKind::Audio, MediaKind::Video] {
        if inputs.iter().any(|input| input.kind == kind)
            && !required.values().any(|consent| consent.kind == kind)
        {
            return Err(ApiError::unsupported_message(
                "Configured media inspection is required for these inputs",
            ));
        }
    }
    for (name, consent) in &required {
        let count = inputs
            .iter()
            .filter(|input| input.kind == consent.kind)
            .count();
        if count == 0 {
            continue;
        }
        let runtime = state
            .media_detectors
            .get(name)
            .ok_or_else(ApiError::unavailable)?;
        if !runtime.permits(&workspace, consent) {
            return Err(ApiError::forbidden());
        }
        if inputs
            .iter()
            .filter(|input| input.kind == consent.kind)
            .any(|input| input.bytes.len() > runtime.maximum_encoded_bytes())
        {
            return Err(ApiError::unsupported_message(
                "Saved media exceeds required inspection limits",
            ));
        }
        let config = state
            .config
            .media_detectors
            .get(name)
            .ok_or_else(ApiError::unavailable)?;
        let credential = std::env::var(&config.api_key_env).map_err(|_| ApiError::unavailable())?;
        if credential.trim().is_empty()
            || credential.len() > 8192
            || credential.chars().any(char::is_control)
        {
            return Err(ApiError::unavailable());
        }
        batches.insert(
            name.clone(),
            runtime
                .reserve_media(count)
                .map_err(|_| ApiError::unavailable())?,
        );
    }
    // Check every original source's native facts before the first service call.
    // Use one reserved required runtime per kind, so cancelled native work owns
    // its permit. Inspection later performs its ordinary exact-byte recheck;
    // the immutable source bytes cannot change between these phases.
    let mut consumed = BTreeSet::new();
    for input in inputs {
        let (name, consent) = required
            .iter()
            .find(|(_, consent)| consent.kind == input.kind)
            .ok_or_else(ApiError::unavailable)?;
        let prepared = batches
            .get_mut(name)
            .ok_or_else(ApiError::unavailable)?
            .prepare(
                &workspace,
                consent,
                &input.content_type,
                input.bytes.clone(),
            )
            .await
            .map_err(|error| match error {
                niu_media::media_detector::RuntimeError::Inspection(
                    niu_media::media_inspection::MediaInspectionError::UnsupportedFacts
                    | niu_media::media_inspection::MediaInspectionError::IncompleteFacts,
                ) => {
                    ApiError::unsupported_message("Saved media lacks supported presentation facts")
                }
                _ => ApiError::unavailable(),
            })?;
        if prepared.kind() != input.kind
            || prepared.content_type() != input.content_type
            || prepared.content_sha256() != input.content_sha256
        {
            return Err(ApiError::unavailable());
        }
        drop(prepared);
        consumed.insert(name.clone());
    }
    // Replenish only the slots consumed by local preflight. All other required
    // runtimes retain their original reservations; any contention still refuses
    // the entire request before disclosing bytes or obtaining any approval.
    for name in consumed {
        batches.remove(&name);
        let consent = required.get(&name).ok_or_else(ApiError::unavailable)?;
        let runtime = state
            .media_detectors
            .get(&name)
            .ok_or_else(ApiError::unavailable)?;
        let count = inputs
            .iter()
            .filter(|input| input.kind == consent.kind)
            .count();
        batches.insert(
            name,
            runtime
                .reserve_media(count)
                .map_err(|_| ApiError::unavailable())?,
        );
    }
    let mut inspected = Vec::new();
    for input in inputs {
        for (name, consent) in required
            .iter()
            .filter(|(_, consent)| consent.kind == input.kind)
        {
            current_access(state, principal, snapshot, selection).await?;
            current_source(state, principal, input).await?;
            let runtime = state
                .media_detectors
                .get(name)
                .ok_or_else(ApiError::unavailable)?;
            let started = std::time::Instant::now();
            let approval = match batches
                .get_mut(name)
                .ok_or_else(ApiError::unavailable)?
                .inspect(
                    &workspace,
                    consent,
                    &input.content_type,
                    input.bytes.clone(),
                )
                .await
            {
                Ok(approval) => approval,
                Err(error) => {
                    let blocked = matches!(
                        error,
                        niu_media::media_detector::RuntimeError::Inspection(
                            niu_media::media_inspection::MediaInspectionError::Matched
                        )
                    );
                    state
                        .store
                        .record_guardrail_preparation_denial(
                            principal.scope(),
                            principal.key_id(),
                            snapshot,
                            if blocked {
                                "detector_blocked"
                            } else {
                                "detector_unavailable"
                            },
                        )
                        .await
                        .map_err(ApiError::from_store)?;
                    return Err(if blocked {
                        ApiError::forbidden()
                    } else {
                        ApiError::unavailable()
                    });
                }
            };
            if !runtime.approval_current(&workspace, consent, &approval)
                || approval.kind() != input.kind
                || approval.content_type() != input.content_type
                || approval.content_sha256() != input.content_sha256
                || approval.encoded_bytes() != input.bytes
            {
                return Err(ApiError::unavailable());
            }
            let elapsed_ms = started.elapsed().as_millis().min(60000) as i64;
            let receipt_id = state
                .store
                .record_media_processing_approval(
                    principal,
                    snapshot,
                    niu_storage::MediaApprovalRecord {
                        detector_name: name,
                        content_position: input.position as i32,
                        elapsed_ms,
                        runtime,
                        consent,
                        approval: &approval,
                    },
                )
                .await
                .map_err(ApiError::from_store)?;
            inspected.push(InspectedMedia {
                detector_name: name.clone(),
                position: input.position,
                receipt_id,
                elapsed_ms,
                runtime,
                consent: consent.clone(),
                approval,
            });
        }
    }
    Ok(inspected)
}
