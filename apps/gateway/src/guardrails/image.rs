//! Durable image-processing consent. Does not authorize unqualified dispatch.
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Binding {
    pub detector: String,
    pub configuration_fingerprint: String,
    pub consent_to_image_processing: bool,
}
impl Binding {
    pub fn valid(&self) -> bool {
        self.consent_to_image_processing
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
    pub fn consent(&self) -> niu_media::image_detector::Consent {
        niu_media::image_detector::Consent {
            configuration_fingerprint: self.configuration_fingerprint.clone(),
            consent_to_image_processing: self.consent_to_image_processing,
        }
    }
}
