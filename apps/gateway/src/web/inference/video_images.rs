//! Inline reference preparation. Approvals retain exact bytes until dispatch.
use crate::{error::ApiError, state::AppState};
use niu_media::image_detector::{Consent, ProcessingApproval, Runtime};
use niu_storage::{GuardrailSnapshot, Principal};
use serde_json::Value;
use std::collections::BTreeMap;
use uuid::Uuid;

fn requirements(snapshot: &GuardrailSnapshot) -> Result<BTreeMap<String, Consent>, ApiError> {
    let mut bindings = BTreeMap::<String, Consent>::new();
    for stored in [&snapshot.workspace_policy, &snapshot.key_policy]
        .into_iter()
        .flatten()
    {
        let policy = serde_json::from_value::<crate::guardrails::PolicyDraft>(stored.clone())
            .map_err(|_| ApiError::forbidden())?;
        policy.validate_shape().map_err(|_| ApiError::forbidden())?;
        for binding in policy.image_detectors {
            let consent = binding.consent();
            if bindings.get(&binding.detector).is_some_and(|previous| {
                previous.configuration_fingerprint != consent.configuration_fingerprint
            }) {
                return Err(ApiError::forbidden());
            }
            bindings.insert(binding.detector, consent);
        }
    }
    Ok(bindings)
}

pub(super) fn permitted(
    state: &AppState,
    snapshot: &GuardrailSnapshot,
    principal: &Principal,
) -> bool {
    let Ok(bindings) = requirements(snapshot) else {
        return false;
    };
    !bindings.is_empty()
        && bindings.iter().all(|(name, consent)| {
            state.image_detectors.get(name).is_some_and(|runtime| {
                runtime.permits(&principal.scope().project_id.to_string(), consent)
            })
        })
}

pub(super) fn discovery_limits(
    state: &AppState,
    snapshot: &GuardrailSnapshot,
    principal: &Principal,
) -> Option<(usize, usize, u32, u32, u64)> {
    if !permitted(state, snapshot, principal) {
        return None;
    }
    let mut limits = (usize::MAX, usize::MAX, u32::MAX, u32::MAX, u64::MAX);
    for name in requirements(snapshot).ok()?.keys() {
        let runtime = state.image_detectors.get(name)?;
        let decode = runtime.inline_limits();
        limits.0 = limits.0.min(runtime.maximum_retained_images());
        limits.1 = limits
            .1
            .min(decode.maximum_encoded_bytes.div_ceil(3) * 4 + 23);
        limits.2 = limits.2.min(decode.maximum_width);
        limits.3 = limits.3.min(decode.maximum_height);
        limits.4 = limits.4.min(decode.maximum_decoded_bytes);
    }
    Some(limits)
}

pub(in crate::web) struct InspectedImage<'a> {
    receipt: Uuid,
    runtime: &'a Runtime,
    consent: Consent,
    approval: ProcessingApproval,
}
impl InspectedImage<'_> {
    pub(in crate::web) fn binding(&self) -> niu_storage::ImageRequestApproval<'_> {
        niu_storage::ImageRequestApproval {
            receipt_id: self.receipt,
            runtime: self.runtime,
            consent: &self.consent,
            approval: &self.approval,
        }
    }
}

pub(in crate::web) async fn inspect<'a>(
    state: &'a AppState,
    principal: &Principal,
    snapshot: &GuardrailSnapshot,
    body: &mut Value,
) -> Result<Vec<InspectedImage<'a>>, ApiError> {
    let references: Vec<(usize, String)> = body["content"]
        .as_array()
        .ok_or_else(ApiError::forbidden)?
        .iter()
        .enumerate()
        .filter(|(_, item)| item["type"] == "image_url")
        .map(|(position, item)| {
            item["image_url"]["url"]
                .as_str()
                .filter(|url| url.starts_with("data:image/"))
                .map(|url| (position, url.to_owned()))
                .ok_or_else(ApiError::unsupported)
        })
        .collect::<Result<_, _>>()?;
    if references.is_empty() {
        return Ok(Vec::new());
    }
    let bindings = requirements(snapshot)?;
    if !permitted(state, snapshot, principal) {
        return Err(ApiError::forbidden());
    }
    // Validate every binding before disclosing any image to any detector.
    let workspace = principal.scope().project_id.to_string();
    let mut batches = BTreeMap::new();
    for name in bindings.keys() {
        let runtime = state
            .image_detectors
            .get(name)
            .ok_or_else(ApiError::forbidden)?;
        let batch = runtime
            .reserve_inline(references.len())
            .map_err(|_| ApiError::forbidden())?;
        batches.insert(name, batch);
    }
    let mut images = Vec::new();
    for (position, reference) in references {
        for (name, consent) in &bindings {
            state
                .store
                .authorize_image_inspection(principal, snapshot)
                .await
                .map_err(ApiError::from_store)?;
            let runtime = state
                .image_detectors
                .get(name)
                .ok_or_else(ApiError::forbidden)?;
            let started = std::time::Instant::now();
            let approval = match batches
                .get_mut(name)
                .ok_or_else(ApiError::forbidden)?
                .inspect(&workspace, consent, &reference)
                .await
            {
                Ok(approval) => approval,
                Err(error) => {
                    let reason = if matches!(
                        error,
                        niu_media::image_detector::RuntimeError::Inspection(
                            niu_media::image_inspection::InspectionError::Matched
                        )
                    ) {
                        "detector_blocked"
                    } else {
                        "detector_unavailable"
                    };
                    state
                        .store
                        .record_guardrail_preparation_denial(
                            principal.scope(),
                            principal.key_id(),
                            snapshot,
                            reason,
                        )
                        .await
                        .map_err(ApiError::from_store)?;
                    return Err(ApiError::forbidden());
                }
            };
            let exact = approval
                .inline_reference(reference.len())
                .map_err(|_| ApiError::forbidden())?;
            if exact != reference {
                return Err(ApiError::forbidden());
            }
            let receipt = state
                .store
                .record_image_processing_approval(
                    principal,
                    snapshot,
                    niu_storage::ImageApprovalRecord {
                        detector_name: name,
                        content_position: position as i32,
                        elapsed_ms: started.elapsed().as_millis().min(60000) as i64,
                        runtime,
                        consent,
                        approval: &approval,
                    },
                )
                .await
                .map_err(ApiError::from_store)?;
            images.push(InspectedImage {
                receipt,
                runtime,
                consent: consent.clone(),
                approval,
            });
        }
    }
    Ok(images)
}
