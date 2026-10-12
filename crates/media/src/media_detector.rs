//! Kind-aware processing consent and retained capacity on the shared inspection
//! core. Declaration is not service coverage, rights or dispatch authorization.
pub use crate::image_detector::InvalidConfiguration;
use crate::{
    image_detector::{
        CommonProcessingConfigRef, fingerprint_processing_config, processing_permitted,
        validate_common_processing_config,
    },
    media_inspection::{
        ApprovedMedia, MediaInspectionContract, MediaInspectionError, MediaKind, PreparedMedia,
    },
    media_reference_facts::MediaReferenceFacts,
};
use serde::{Deserialize, Serialize};
use std::{sync::Arc, time::Duration};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Config {
    pub kind: MediaKind,
    pub endpoint: String,
    pub api_key_env: String,
    pub detector_revision: String,
    pub recipient: String,
    pub region: String,
    pub retention: String,
    pub authorized_workspaces: Vec<String>,
    pub declared_unmetered: bool,
    pub timeout_ms: u64,
    pub maximum_encoded_bytes: usize,
    pub concurrency: usize,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Consent {
    pub kind: MediaKind,
    pub configuration_fingerprint: String,
    pub consent_to_media_processing: bool,
}
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RuntimeError {
    Unauthorized,
    CredentialUnavailable,
    Busy,
    PreparationUnavailable,
    Inspection(MediaInspectionError),
}
/// Only actual shared-core Clear responses create this type. No Debug/Serialize
/// and no caller-supplied verdict; original bytes and capacity remain owned.
pub struct ProcessingApproval {
    media: ApprovedMedia,
    configuration_fingerprint: String,
    workspace: String,
}
impl ProcessingApproval {
    pub fn kind(&self) -> MediaKind {
        self.media.kind()
    }
    pub fn content_type(&self) -> &str {
        self.media.content_type()
    }
    pub fn content_sha256(&self) -> &str {
        self.media.content_sha256()
    }
    pub fn detector_revision(&self) -> &str {
        self.media.detector_revision()
    }
    pub fn configuration_fingerprint(&self) -> &str {
        &self.configuration_fingerprint
    }
    pub fn workspace(&self) -> &str {
        &self.workspace
    }
    pub fn encoded_bytes(&self) -> &[u8] {
        self.media.encoded_bytes()
    }
    pub fn facts(&self) -> &MediaReferenceFacts {
        self.media.facts()
    }
}
pub struct Runtime {
    config: Config,
    fingerprint: String,
    capacity: Arc<Semaphore>,
}
/// Reserve every required position before disclosing any source bytes. Unused
/// slots drop with the batch; used slots remain with preparation or approval.
pub struct MediaInspectionBatch<'a> {
    runtime: &'a Runtime,
    permits: Vec<OwnedSemaphorePermit>,
}
impl Config {
    pub fn fingerprint(&self) -> String {
        fingerprint_processing_config("niu-required-media-processing-v3", self)
    }
    pub fn validate(&self) -> Result<(), InvalidConfiguration> {
        validate_common_processing_config(CommonProcessingConfigRef {
            endpoint: &self.endpoint,
            api_key_env: &self.api_key_env,
            detector_revision: &self.detector_revision,
            recipient: &self.recipient,
            region: &self.region,
            retention: &self.retention,
            authorized_workspaces: &self.authorized_workspaces,
            timeout_ms: self.timeout_ms,
        })?;
        if !(1..=crate::workspace_asset_validation::MAX_ASSET_BYTES)
            .contains(&self.maximum_encoded_bytes)
            || !(1..=4).contains(&self.concurrency)
        {
            return Err(InvalidConfiguration);
        }
        Ok(())
    }
}
impl Runtime {
    pub fn new(config: Config) -> Result<Self, InvalidConfiguration> {
        config.validate()?;
        let fingerprint = config.fingerprint();
        let capacity = Arc::new(Semaphore::new(config.concurrency));
        Ok(Self {
            config,
            fingerprint,
            capacity,
        })
    }
    pub fn kind(&self) -> MediaKind {
        self.config.kind
    }
    pub fn fingerprint(&self) -> &str {
        &self.fingerprint
    }
    pub fn maximum_encoded_bytes(&self) -> usize {
        self.config.maximum_encoded_bytes
    }
    pub fn maximum_retained_media(&self) -> usize {
        self.config.concurrency
    }
    pub fn authorized_workspace(&self, workspace: &str) -> bool {
        self.config
            .authorized_workspaces
            .iter()
            .any(|value| value == workspace)
    }
    pub fn description(&self) -> serde_json::Value {
        serde_json::json!({"schema_version":3,"kind":self.config.kind,"detector_revision":self.config.detector_revision,
            "configuration_fingerprint":self.fingerprint,"recipient":self.config.recipient,
            "region":self.config.region,"retention":self.config.retention,
            "content_sent":"exact_encoded_media_with_embedded_tracks","processing_guarantees":"declared_unverified",
            "timeout_ms":self.config.timeout_ms,"maximum_encoded_bytes":self.config.maximum_encoded_bytes,
            "concurrency":self.config.concurrency,"declared_unmetered":self.config.declared_unmetered,
            "policy_activation":false,"requires_supported_presentation_facts":true})
    }
    pub fn permits(&self, workspace: &str, consent: &Consent) -> bool {
        consent.kind == self.config.kind
            && processing_permitted(
                self.config.declared_unmetered,
                &self.config.authorized_workspaces,
                &self.fingerprint,
                workspace,
                &consent.configuration_fingerprint,
                consent.consent_to_media_processing,
            )
    }
    pub fn reserve_media(&self, count: usize) -> Result<MediaInspectionBatch<'_>, RuntimeError> {
        if count == 0 || count > self.config.concurrency {
            return Err(RuntimeError::Busy);
        }
        let mut permits = Vec::with_capacity(count);
        for _ in 0..count {
            permits.push(
                self.capacity
                    .clone()
                    .try_acquire_owned()
                    .map_err(|_| RuntimeError::Busy)?,
            );
        }
        Ok(MediaInspectionBatch {
            runtime: self,
            permits,
        })
    }
    pub async fn inspect_media(
        &self,
        workspace: &str,
        consent: &Consent,
        content_type: &str,
        bytes: Vec<u8>,
    ) -> Result<ProcessingApproval, RuntimeError> {
        if !self.permits(workspace, consent) {
            return Err(RuntimeError::Unauthorized);
        }
        self.reserve_media(1)?
            .inspect(workspace, consent, content_type, bytes)
            .await
    }
    pub fn approval_current(
        &self,
        workspace: &str,
        consent: &Consent,
        approval: &ProcessingApproval,
    ) -> bool {
        self.permits(workspace, consent)
            && approval.kind() == self.config.kind
            && approval.workspace == workspace
            && approval.configuration_fingerprint == self.fingerprint
            && approval.detector_revision() == self.config.detector_revision
    }
}
impl MediaInspectionBatch<'_> {
    pub async fn inspect(
        &mut self,
        workspace: &str,
        consent: &Consent,
        content_type: &str,
        bytes: Vec<u8>,
    ) -> Result<ProcessingApproval, RuntimeError> {
        if !self.runtime.permits(workspace, consent) {
            return Err(RuntimeError::Unauthorized);
        }
        let credential = std::env::var(&self.runtime.config.api_key_env)
            .map_err(|_| RuntimeError::CredentialUnavailable)?;
        if credential.trim().is_empty() {
            return Err(RuntimeError::CredentialUnavailable);
        }
        let timeout = Duration::from_millis(self.runtime.config.timeout_ms);
        tokio::time::timeout(timeout, async {
            let input = self
                .prepare(workspace, consent, content_type, bytes)
                .await?;
            let kind = self.runtime.config.kind;
            let contract = MediaInspectionContract {
                kind,
                detector_revision: self.runtime.config.detector_revision.clone(),
                maximum_encoded_bytes: self.runtime.config.maximum_encoded_bytes,
            };
            let media = crate::media_inspection::inspect(
                &contract,
                &self.runtime.config.endpoint,
                &credential,
                input,
                timeout,
            )
            .await
            .map_err(RuntimeError::Inspection)?;
            Ok(ProcessingApproval {
                media,
                configuration_fingerprint: self.runtime.fingerprint.clone(),
                workspace: workspace.into(),
            })
        })
        .await
        .map_err(|_| RuntimeError::Inspection(MediaInspectionError::Timeout))?
    }
    /// Current explicit configuration consent and bounded native preparation
    /// only. This performs no network operation and creates no approval.
    pub async fn prepare(
        &mut self,
        workspace: &str,
        consent: &Consent,
        content_type: &str,
        bytes: Vec<u8>,
    ) -> Result<PreparedMedia, RuntimeError> {
        if !self.runtime.permits(workspace, consent) {
            return Err(RuntimeError::Unauthorized);
        }
        if bytes.is_empty() || bytes.len() > self.runtime.config.maximum_encoded_bytes {
            return Err(RuntimeError::Inspection(MediaInspectionError::InvalidMedia));
        }
        let permit = self.permits.pop().ok_or(RuntimeError::Busy)?;
        let kind = self.runtime.config.kind;
        let content_type = content_type.to_owned();
        // The permit enters the blocking closure. Cancellation cannot preempt
        // CPU work and never releases its capacity before that work finishes.
        tokio::time::timeout(
            Duration::from_millis(self.runtime.config.timeout_ms),
            async {
                tokio::task::spawn_blocking(move || {
                    PreparedMedia::new(kind, &content_type, bytes, permit)
                })
                .await
                .map_err(|_| RuntimeError::PreparationUnavailable)?
                .map_err(RuntimeError::Inspection)
            },
        )
        .await
        .map_err(|_| RuntimeError::Inspection(MediaInspectionError::Timeout))?
    }
}
