//! Kind-specific required processing consent. ImageV2 grants are independent;
//! these declarations never establish detector coverage or dispatch readiness.
use niu_media::{media_detector::Consent, media_inspection::MediaKind};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Binding {
    pub detector: String,
    pub kind: MediaKind,
    pub configuration_fingerprint: String,
    pub consent_to_media_processing: bool,
}
impl Binding {
    pub fn valid(&self) -> bool {
        self.consent_to_media_processing
            && (1..=200).contains(&self.detector.len())
            && self
                .detector
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || b"_-".contains(&byte))
            && self.configuration_fingerprint.len() == 64
            && self
                .configuration_fingerprint
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    }
    pub fn consent(&self) -> Consent {
        Consent {
            kind: self.kind,
            configuration_fingerprint: self.configuration_fingerprint.clone(),
            consent_to_media_processing: self.consent_to_media_processing,
        }
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CompositionError {
    InvalidBindings,
    ConflictingDetector,
}
/// One configured detector name identifies one fixed-kind Runtime. A policy
/// cannot assign that name to multiple kinds or silently duplicate a requirement.
pub fn valid_bindings(bindings: &[Binding]) -> bool {
    bindings.len() <= 8
        && bindings.iter().all(Binding::valid)
        && bindings
            .iter()
            .map(|binding| &binding.detector)
            .collect::<BTreeSet<_>>()
            .len()
            == bindings.len()
        && bindings
            .iter()
            .filter(|binding| binding.kind == MediaKind::Audio)
            .count()
            <= 4
        && bindings
            .iter()
            .filter(|binding| binding.kind == MediaKind::Video)
            .count()
            <= 4
}
/// Compose mandatory workspace and additional key requirements. The union
/// preserves every parent detector; differing kind/fingerprint rejects the
/// entire composition rather than choosing an override or weakening consent.
/// A bounded union can contain sixteen detectors across the two policy scopes.
pub fn compose_required(
    workspace: &[Binding],
    key: &[Binding],
) -> Result<BTreeMap<String, Consent>, CompositionError> {
    if !valid_bindings(workspace) || !valid_bindings(key) {
        return Err(CompositionError::InvalidBindings);
    }
    let mut required = BTreeMap::<String, Consent>::new();
    for binding in workspace.iter().chain(key) {
        let consent = binding.consent();
        if required.get(&binding.detector).is_some_and(|previous| {
            previous.kind != consent.kind
                || previous.configuration_fingerprint != consent.configuration_fingerprint
        }) {
            return Err(CompositionError::ConflictingDetector);
        }
        required.insert(binding.detector.clone(), consent);
    }
    Ok(required)
}
