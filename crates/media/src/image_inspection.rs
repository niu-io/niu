//! Exact-content image detector transport. Caller must establish current access,
//! explicit processing consent and a qualified unmetered detector before use.
//! No configuration declaration establishes these permissions or live coverage.
use crate::image_input::{DecodeError, DecodedImage};
use std::time::Duration;

pub struct ImageInspectionContract {
    pub detector_revision: String,
    pub maximum_inline_bytes: usize,
}
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum InspectionError {
    InvalidConfiguration,
    Image(DecodeError),
    Transport,
    Timeout,
    ServiceFailure,
    InvalidResponse,
    ResponseLimit,
    Matched,
}
/// Approval owns the immutable image and its shared decoder capacity. It has no
/// Debug/Serialize implementation; neither source bytes nor URLs enter logs.
pub struct ApprovedImage {
    image: DecodedImage,
    content_sha256: String,
    detector_revision: String,
}
impl ApprovedImage {
    pub fn content_type(&self) -> &'static str {
        self.image.content_type()
    }
    pub fn content_sha256(&self) -> &str {
        &self.content_sha256
    }
    pub fn detector_revision(&self) -> &str {
        &self.detector_revision
    }
    pub fn encoded_bytes(&self) -> &[u8] {
        self.image.encoded_bytes()
    }
    pub fn inline_reference_str(&self, maximum_bytes: usize) -> Result<&str, DecodeError> {
        self.image.inline_reference_str(maximum_bytes)
    }
    pub fn inline_reference(&self, maximum_bytes: usize) -> Result<String, DecodeError> {
        self.image.inline_reference(maximum_bytes)
    }
}
/// One POST, bounded total deadline and response, no retries or redirects. Only
/// an exact revision/content echo with Clear produces an approval. The contract
/// is Niu's versioned adapter interface, not a claim of existing vendor support.
pub async fn inspect(
    contract: &ImageInspectionContract,
    endpoint: &str,
    credential: &str,
    image: DecodedImage,
    timeout: Duration,
) -> Result<ApprovedImage, InspectionError> {
    if contract.detector_revision.trim().is_empty()
        || contract.detector_revision.len() > 256
        || contract.detector_revision.chars().any(char::is_control)
        || !(1..=24 * 1024 * 1024).contains(&contract.maximum_inline_bytes)
        || credential.trim().is_empty()
        || credential.len() > 8192
        || credential.chars().any(char::is_control)
        || timeout.is_zero()
        || timeout > Duration::from_secs(30)
    {
        return Err(InspectionError::InvalidConfiguration);
    }
    let reference = image
        .inline_reference_str(contract.maximum_inline_bytes)
        .map_err(InspectionError::Image)?;
    let content_sha256 = image.content_sha256().to_owned();
    crate::media_inspection::inspect_exact(
        endpoint, credential,
        serde_json::json!({"schema_version":2,"detector_revision":contract.detector_revision,"content_sha256":content_sha256,"image":reference}),
        crate::media_inspection::ExpectedEcho::ImageV2{revision:&contract.detector_revision,sha256:&content_sha256},
        timeout,
    ).await.map_err(inspection_error)?;
    Ok(ApprovedImage {
        image,
        content_sha256,
        detector_revision: contract.detector_revision.clone(),
    })
}
fn inspection_error(error: crate::media_inspection::TransportError) -> InspectionError {
    use crate::media_inspection::TransportError;
    match error {
        TransportError::InvalidConfiguration => InspectionError::InvalidConfiguration,
        TransportError::Transport => InspectionError::Transport,
        TransportError::Timeout => InspectionError::Timeout,
        TransportError::ServiceFailure => InspectionError::ServiceFailure,
        TransportError::InvalidResponse => InspectionError::InvalidResponse,
        TransportError::ResponseLimit => InspectionError::ResponseLimit,
        TransportError::Matched => InspectionError::Matched,
    }
}
