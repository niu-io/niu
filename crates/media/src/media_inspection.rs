//! One exact-content inspection transport shared by legacy images and media.
//! Callers establish current access, explicit recipient consent and detector
//! qualification. A configuration or locally built request is not an approval.
use crate::media_reference_facts::{
    MediaReferenceFacts, MediaReferenceFactsError, inspect_reference_facts,
};
use base64::{Engine, engine::general_purpose::STANDARD};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::time::Duration;
use tokio::sync::OwnedSemaphorePermit;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MediaKind {
    Audio,
    Video,
}
pub struct MediaInspectionContract {
    pub kind: MediaKind,
    pub detector_revision: String,
    pub maximum_encoded_bytes: usize,
}
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MediaInspectionError {
    InvalidConfiguration,
    InvalidMedia,
    UnsupportedFacts,
    IncompleteFacts,
    Transport,
    Timeout,
    ServiceFailure,
    InvalidResponse,
    ResponseLimit,
    Matched,
}
/// Immutable input and its caller-reserved capacity. Never a Clear verdict.
/// Raw bytes and transport references deliberately have no Debug/Serialize.
pub struct PreparedMedia {
    kind: MediaKind,
    content_type: String,
    bytes: Vec<u8>,
    facts: MediaReferenceFacts,
    content_sha256: String,
    _permit: OwnedSemaphorePermit,
}
impl PreparedMedia {
    /// Parse complete bounded bytes; playback-unknown audio cannot be promoted
    /// into a duration-qualified reference by its encoded frame duration.
    pub fn new(
        kind: MediaKind,
        content_type: &str,
        bytes: Vec<u8>,
        permit: OwnedSemaphorePermit,
    ) -> Result<Self, MediaInspectionError> {
        if bytes.is_empty() || bytes.len() > crate::workspace_asset_validation::MAX_ASSET_BYTES {
            return Err(MediaInspectionError::InvalidMedia);
        }
        let facts = inspect_reference_facts(content_type, &bytes).map_err(|e| match e {
            MediaReferenceFactsError::InvalidMedia => MediaInspectionError::InvalidMedia,
            MediaReferenceFactsError::Unsupported => MediaInspectionError::UnsupportedFacts,
            MediaReferenceFactsError::Incomplete => MediaInspectionError::IncompleteFacts,
        })?;
        if (kind == MediaKind::Audio && (facts.video.is_some() || facts.audio.len() != 1))
            || (kind == MediaKind::Video && facts.video.is_none())
        {
            return Err(MediaInspectionError::InvalidMedia);
        }
        if kind == MediaKind::Audio && facts.audio[0].presentation_duration.is_none() {
            return Err(MediaInspectionError::IncompleteFacts);
        }
        let content_sha256 = format!("{:x}", Sha256::digest(&bytes));
        Ok(Self {
            kind,
            content_type: content_type.into(),
            bytes,
            facts,
            content_sha256,
            _permit: permit,
        })
    }
    pub fn kind(&self) -> MediaKind {
        self.kind
    }
    pub fn content_type(&self) -> &str {
        &self.content_type
    }
    pub fn content_sha256(&self) -> &str {
        &self.content_sha256
    }
    pub fn facts(&self) -> &MediaReferenceFacts {
        &self.facts
    }
    /// Niu's version-3 inspection adapter request, not an Ark input payload.
    /// Producing this request does not attest that a detector processed it.
    pub fn inspection_request(
        &self,
        contract: &MediaInspectionContract,
    ) -> Result<serde_json::Value, MediaInspectionError> {
        self.validate_contract(contract)?;
        Ok(
            self.build_inspection_request(
                &contract.detector_revision,
                STANDARD.encode(&self.bytes),
            ),
        )
    }
    fn validate_contract(
        &self,
        contract: &MediaInspectionContract,
    ) -> Result<(), MediaInspectionError> {
        if self.kind != contract.kind
            || !(1..=crate::workspace_asset_validation::MAX_ASSET_BYTES)
                .contains(&contract.maximum_encoded_bytes)
            || self.bytes.len() > contract.maximum_encoded_bytes
            || !valid_revision(&contract.detector_revision)
        {
            return Err(MediaInspectionError::InvalidConfiguration);
        }
        Ok(())
    }
    fn build_inspection_request(
        &self,
        detector_revision: &str,
        encoded_data: String,
    ) -> serde_json::Value {
        serde_json::json!({
            "schema_version": 3,
            "detector_revision": detector_revision,
            "kind": self.kind,
            "content_type": self.content_type,
            "byte_length": self.bytes.len(),
            "content_sha256": self.content_sha256,
            "media": { "encoding": "base64", "data": encoded_data }
        })
    }
}
/// Only a genuine exact version-3 Clear response can construct this type.
/// It retains all original bytes, facts and capacity until dropped.
pub struct ApprovedMedia {
    input: PreparedMedia,
    detector_revision: String,
}
impl ApprovedMedia {
    pub fn kind(&self) -> MediaKind {
        self.input.kind
    }
    pub fn content_type(&self) -> &str {
        &self.input.content_type
    }
    pub fn content_sha256(&self) -> &str {
        &self.input.content_sha256
    }
    pub fn detector_revision(&self) -> &str {
        &self.detector_revision
    }
    pub fn encoded_bytes(&self) -> &[u8] {
        &self.input.bytes
    }
    pub fn facts(&self) -> &MediaReferenceFacts {
        &self.input.facts
    }
}
/// No retries, redirects or remotely fetched source content. Missing service,
/// credentials or a verifiable response never constructs an approval. Runtime
/// authorization and durable receipts are separate mandatory caller obligations.
pub async fn inspect(
    contract: &MediaInspectionContract,
    endpoint: &str,
    credential: &str,
    input: PreparedMedia,
    timeout: Duration,
) -> Result<ApprovedMedia, MediaInspectionError> {
    validate_transport(&contract.detector_revision, credential, timeout).map_err(media_error)?;
    input.validate_contract(contract)?;
    let (input, request) = if input.bytes.len() >= 32 * 1024 {
        let revision = contract.detector_revision.clone();
        tokio::task::spawn_blocking(move || {
            let encoded = STANDARD.encode(&input.bytes);
            let req = input.build_inspection_request(&revision, encoded);
            (input, req)
        })
        .await
        .map_err(|_| MediaInspectionError::ServiceFailure)?
    } else {
        let req = input
            .build_inspection_request(&contract.detector_revision, STANDARD.encode(&input.bytes));
        (input, req)
    };
    inspect_exact(
        endpoint,
        credential,
        request,
        ExpectedEcho::MediaV3 {
            revision: &contract.detector_revision,
            kind: input.kind,
            content_type: &input.content_type,
            byte_length: input.bytes.len(),
            sha256: &input.content_sha256,
        },
        timeout,
    )
    .await
    .map_err(media_error)?;
    Ok(ApprovedMedia {
        input,
        detector_revision: contract.detector_revision.clone(),
    })
}
#[derive(Clone, Copy)]
pub(crate) enum TransportError {
    InvalidConfiguration,
    Transport,
    Timeout,
    ServiceFailure,
    InvalidResponse,
    ResponseLimit,
    Matched,
}
fn media_error(error: TransportError) -> MediaInspectionError {
    match error {
        TransportError::InvalidConfiguration => MediaInspectionError::InvalidConfiguration,
        TransportError::Transport => MediaInspectionError::Transport,
        TransportError::Timeout => MediaInspectionError::Timeout,
        TransportError::ServiceFailure => MediaInspectionError::ServiceFailure,
        TransportError::InvalidResponse => MediaInspectionError::InvalidResponse,
        TransportError::ResponseLimit => MediaInspectionError::ResponseLimit,
        TransportError::Matched => MediaInspectionError::Matched,
    }
}
pub(crate) enum ExpectedEcho<'a> {
    ImageV2 {
        revision: &'a str,
        sha256: &'a str,
    },
    MediaV3 {
        revision: &'a str,
        kind: MediaKind,
        content_type: &'a str,
        byte_length: usize,
        sha256: &'a str,
    },
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ImageResponse {
    schema_version: u32,
    detector_revision: String,
    content_sha256: String,
    verdict: Verdict,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct MediaResponse {
    schema_version: u32,
    detector_revision: String,
    kind: MediaKind,
    content_type: String,
    byte_length: usize,
    content_sha256: String,
    verdict: Verdict,
}
#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
enum Verdict {
    Clear,
    Matched,
}
fn valid_revision(revision: &str) -> bool {
    !revision.trim().is_empty() && revision.len() <= 256 && !revision.chars().any(char::is_control)
}
pub(crate) fn validate_transport(
    revision: &str,
    credential: &str,
    timeout: Duration,
) -> Result<(), TransportError> {
    if !valid_revision(revision)
        || credential.trim().is_empty()
        || credential.len() > 8192
        || credential.chars().any(char::is_control)
        || timeout.is_zero()
        || timeout > Duration::from_secs(30)
    {
        return Err(TransportError::InvalidConfiguration);
    }
    Ok(())
}
fn transport_error(error: reqwest::Error) -> TransportError {
    if error.is_timeout() {
        TransportError::Timeout
    } else {
        TransportError::Transport
    }
}
/// Private shared operation: clients cannot pass a verdict or obtain an approval
/// by deserializing this function's unit result.
pub(crate) async fn inspect_exact(
    endpoint: &str,
    credential: &str,
    request: serde_json::Value,
    expected: ExpectedEcho<'_>,
    timeout: Duration,
) -> Result<(), TransportError> {
    let revision = match &expected {
        ExpectedEcho::ImageV2 { revision, .. } | ExpectedEcho::MediaV3 { revision, .. } => {
            *revision
        }
    };
    validate_transport(revision, credential, timeout)?;
    let operation = async {
        let client = niu_upstream::client_for_endpoint(endpoint, timeout)
            .await
            .map_err(|_| TransportError::Transport)?;
        let mut response = client
            .post(endpoint)
            .bearer_auth(credential)
            .json(&request)
            .send()
            .await
            .map_err(transport_error)?;
        if !response.status().is_success() {
            return Err(TransportError::ServiceFailure);
        }
        if response.content_length().is_some_and(|size| size > 4096) {
            return Err(TransportError::ResponseLimit);
        }
        let mut body = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(transport_error)? {
            if chunk.len() > 4096usize.saturating_sub(body.len()) {
                return Err(TransportError::ResponseLimit);
            }
            body.extend_from_slice(&chunk);
        }
        let verdict = match expected {
            ExpectedEcho::ImageV2 { revision, sha256 } => {
                let r: ImageResponse =
                    serde_json::from_slice(&body).map_err(|_| TransportError::InvalidResponse)?;
                if r.schema_version != 2
                    || r.detector_revision != revision
                    || r.content_sha256 != sha256
                {
                    return Err(TransportError::InvalidResponse);
                }
                r.verdict
            }
            ExpectedEcho::MediaV3 {
                revision,
                kind,
                content_type,
                byte_length,
                sha256,
            } => {
                let r: MediaResponse =
                    serde_json::from_slice(&body).map_err(|_| TransportError::InvalidResponse)?;
                if r.schema_version != 3
                    || r.detector_revision != revision
                    || r.kind != kind
                    || r.content_type != content_type
                    || r.byte_length != byte_length
                    || r.content_sha256 != sha256
                {
                    return Err(TransportError::InvalidResponse);
                }
                r.verdict
            }
        };
        match verdict {
            Verdict::Clear => Ok(()),
            Verdict::Matched => Err(TransportError::Matched),
        }
    };
    tokio::time::timeout(timeout, operation)
        .await
        .map_err(|_| TransportError::Timeout)?
}
