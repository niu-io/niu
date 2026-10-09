//! Exact-content image detector transport. Caller must establish current access,
//! explicit processing consent and a qualified unmetered detector before use.
//! No configuration declaration establishes these permissions or live coverage.
use crate::image_input::{DecodeError, DecodedImage};
use serde::Deserialize;
use sha2::{Digest, Sha256};
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
    pub fn content_sha256(&self) -> &str {
        &self.content_sha256
    }
    pub fn detector_revision(&self) -> &str {
        &self.detector_revision
    }
    pub fn inline_reference(&self, maximum_bytes: usize) -> Result<String, DecodeError> {
        self.image.inline_reference(maximum_bytes)
    }
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Response {
    schema_version: u32,
    detector_revision: String,
    content_sha256: String,
    verdict: Verdict,
}
#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
enum Verdict {
    Clear,
    Matched,
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
        .inline_reference(contract.maximum_inline_bytes)
        .map_err(InspectionError::Image)?;
    let content_sha256 = format!("{:x}", Sha256::digest(image.encoded_bytes()));
    let operation = async {
        let client = niu_upstream::client_for_endpoint(endpoint, timeout)
            .await
            .map_err(|_| InspectionError::Transport)?;
        let mut response = client
            .post(endpoint)
            .bearer_auth(credential)
            .json(&serde_json::json!({
                "schema_version":2, "detector_revision":contract.detector_revision,
                "content_sha256":content_sha256, "image":reference
            }))
            .send()
            .await
            .map_err(transport_error)?;
        if !response.status().is_success() {
            return Err(InspectionError::ServiceFailure);
        }
        if response.content_length().is_some_and(|size| size > 4096) {
            return Err(InspectionError::ResponseLimit);
        }
        let mut body = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(transport_error)? {
            if chunk.len() > 4096usize.saturating_sub(body.len()) {
                return Err(InspectionError::ResponseLimit);
            }
            body.extend_from_slice(&chunk);
        }
        let response: Response =
            serde_json::from_slice(&body).map_err(|_| InspectionError::InvalidResponse)?;
        if response.schema_version != 2
            || response.detector_revision != contract.detector_revision
            || response.content_sha256 != content_sha256
        {
            return Err(InspectionError::InvalidResponse);
        }
        match response.verdict {
            Verdict::Matched => Err(InspectionError::Matched),
            Verdict::Clear => Ok(ApprovedImage {
                image,
                content_sha256,
                detector_revision: contract.detector_revision.clone(),
            }),
        }
    };
    tokio::time::timeout(timeout, operation)
        .await
        .map_err(|_| InspectionError::Timeout)?
}
fn transport_error(error: reqwest::Error) -> InspectionError {
    if error.is_timeout() {
        InspectionError::Timeout
    } else {
        InspectionError::Transport
    }
}
