//! Image processing authorization, separate from text detector consent.
use crate::{
    image_input::{DecodeLimits, DecodeService},
    image_inspection::{ApprovedImage, ImageInspectionContract, InspectionError},
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::time::Duration;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Config {
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
    pub maximum_width: u32,
    pub maximum_height: u32,
    pub maximum_decoded_bytes: u64,
    pub concurrency: usize,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Consent {
    pub configuration_fingerprint: String,
    pub consent_to_image_processing: bool,
}
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RuntimeError {
    Unauthorized,
    CredentialUnavailable,
    Decode(crate::image_input::DecodeError),
    Inspection(InspectionError),
}
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct InvalidConfiguration;

/// Approval for a specific consented configuration and workspace. Raw detector
/// verdicts cannot construct this type. Content remains private and immutable.
pub struct ProcessingApproval {
    image: ApprovedImage,
    configuration_fingerprint: String,
    workspace: String,
}
impl ProcessingApproval {
    pub fn content_sha256(&self) -> &str {
        self.image.content_sha256()
    }
    pub fn detector_revision(&self) -> &str {
        self.image.detector_revision()
    }
    pub fn configuration_fingerprint(&self) -> &str {
        &self.configuration_fingerprint
    }
    pub fn workspace(&self) -> &str {
        &self.workspace
    }
    pub fn inline_reference(
        &self,
        maximum_bytes: usize,
    ) -> Result<String, crate::image_input::DecodeError> {
        self.image.inline_reference(maximum_bytes)
    }
}

pub struct Runtime {
    config: Config,
    decoder: DecodeService,
    fingerprint: String,
}

/// Capacity for all images inspected by one detector in a request. Unused slots
/// are released on drop; used slots remain owned by the immutable approvals.
pub struct InlineInspectionBatch<'a> {
    runtime: &'a Runtime,
    permits: Vec<tokio::sync::OwnedSemaphorePermit>,
}
impl InlineInspectionBatch<'_> {
    pub async fn inspect(
        &mut self,
        workspace: &str,
        consent: &Consent,
        reference: &str,
    ) -> Result<ProcessingApproval, RuntimeError> {
        if !self.runtime.permits(workspace, consent) {
            return Err(RuntimeError::Unauthorized);
        }
        let credential = std::env::var(&self.runtime.config.api_key_env)
            .map_err(|_| RuntimeError::CredentialUnavailable)?;
        if credential.trim().is_empty() {
            return Err(RuntimeError::CredentialUnavailable);
        }
        let permit = self
            .permits
            .pop()
            .ok_or(RuntimeError::Decode(crate::image_input::DecodeError::Busy))?;
        self.runtime
            .inspect_inline_with_permit(workspace, consent, reference, &credential, permit)
            .await
    }
}
impl Config {
    pub fn fingerprint(&self) -> String {
        let bytes = serde_json::to_vec(&("niu-required-image-processing-v2", self))
            .expect("serializable image detector settings");
        format!("{:x}", Sha256::digest(bytes))
    }
    pub fn validate(&self) -> Result<(), InvalidConfiguration> {
        let url = url::Url::parse(&self.endpoint).map_err(|_| InvalidConfiguration)?;
        let host = url.host_str().ok_or(InvalidConfiguration)?;
        let loopback = host.eq_ignore_ascii_case("localhost")
            || host
                .trim_matches(['[', ']'])
                .parse::<std::net::IpAddr>()
                .is_ok_and(|ip| ip.is_loopback());
        if (url.scheme() != "https" && !(url.scheme() == "http" && loopback))
            || !url.username().is_empty()
            || url.password().is_some()
            || url.query().is_some()
            || url.fragment().is_some()
            || [
                &self.detector_revision,
                &self.recipient,
                &self.region,
                &self.retention,
            ]
            .iter()
            .any(|v| v.trim().is_empty() || v.len() > 256 || v.chars().any(char::is_control))
            || self.api_key_env.is_empty()
            || self.api_key_env.len() > 256
            || !self
                .api_key_env
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'_')
            || self.authorized_workspaces.len() > 1000
            || self.authorized_workspaces.iter().any(|v| {
                !uuid::Uuid::parse_str(v).is_ok_and(|id| !id.is_nil() && id.to_string() == *v)
            })
            || !(1..=30_000).contains(&self.timeout_ms)
        {
            return Err(InvalidConfiguration);
        }
        DecodeService::new(self.limits(), self.concurrency)
            .map(|_| ())
            .map_err(|_| InvalidConfiguration)
    }
    fn limits(&self) -> DecodeLimits {
        DecodeLimits {
            maximum_encoded_bytes: self.maximum_encoded_bytes,
            maximum_width: self.maximum_width,
            maximum_height: self.maximum_height,
            maximum_decoded_bytes: self.maximum_decoded_bytes,
        }
    }
}
impl Runtime {
    pub fn inline_limits(&self) -> DecodeLimits {
        self.config.limits()
    }
    pub fn maximum_retained_images(&self) -> usize {
        self.config.concurrency
    }
    pub fn reserve_inline(&self, count: usize) -> Result<InlineInspectionBatch<'_>, RuntimeError> {
        Ok(InlineInspectionBatch {
            runtime: self,
            permits: self
                .decoder
                .reserve_inline(count)
                .map_err(RuntimeError::Decode)?,
        })
    }
    pub fn new(config: Config) -> Result<Self, InvalidConfiguration> {
        config.validate()?;
        let decoder = DecodeService::new(config.limits(), config.concurrency)
            .map_err(|_| InvalidConfiguration)?;
        let fingerprint = config.fingerprint();
        Ok(Self {
            config,
            decoder,
            fingerprint,
        })
    }
    pub fn fingerprint(&self) -> &str {
        &self.fingerprint
    }
    pub fn authorized_workspace(&self, workspace: &str) -> bool {
        self.config
            .authorized_workspaces
            .iter()
            .any(|value| value == workspace)
    }
    pub fn description(&self) -> serde_json::Value {
        serde_json::json!({"schema_version":2,"detector_revision":self.config.detector_revision,
            "configuration_fingerprint":self.fingerprint,"recipient":self.config.recipient,
            "region":self.config.region,"retention":self.config.retention,
            "content_sent":"exact_encoded_image","processing_guarantees":"declared_unverified",
            "timeout_ms":self.config.timeout_ms,"maximum_encoded_bytes":self.config.maximum_encoded_bytes,
            "maximum_width":self.config.maximum_width,"maximum_height":self.config.maximum_height,
            "maximum_decoded_bytes":self.config.maximum_decoded_bytes,"concurrency":self.config.concurrency,
            "declared_unmetered":self.config.declared_unmetered,"policy_activation":false})
    }
    pub fn permits(&self, workspace: &str, consent: &Consent) -> bool {
        self.config.declared_unmetered
            && consent.consent_to_image_processing
            && consent.configuration_fingerprint == self.fingerprint
            && self
                .config
                .authorized_workspaces
                .iter()
                .any(|v| v == workspace)
    }
    /// Called only after the gateway establishes current workspace/key access.
    /// This extra processing grant cannot substitute for that access check.
    pub async fn inspect_inline(
        &self,
        workspace: &str,
        consent: &Consent,
        reference: &str,
    ) -> Result<ProcessingApproval, RuntimeError> {
        if !self.permits(workspace, consent) {
            return Err(RuntimeError::Unauthorized);
        }
        let credential = std::env::var(&self.config.api_key_env)
            .map_err(|_| RuntimeError::CredentialUnavailable)?;
        if credential.trim().is_empty() {
            return Err(RuntimeError::CredentialUnavailable);
        }
        self.inspect_inline_resolved(workspace, consent, reference, &credential)
            .await
    }
    pub fn approval_current(
        &self,
        workspace: &str,
        consent: &Consent,
        approval: &ProcessingApproval,
    ) -> bool {
        self.permits(workspace, consent)
            && approval.workspace == workspace
            && approval.configuration_fingerprint == self.fingerprint
            && approval.detector_revision() == self.config.detector_revision
    }
    async fn inspect_inline_resolved(
        &self,
        workspace: &str,
        consent: &Consent,
        reference: &str,
        credential: &str,
    ) -> Result<ProcessingApproval, RuntimeError> {
        let permit = self
            .decoder
            .reserve_inline(1)
            .map_err(RuntimeError::Decode)?
            .pop()
            .ok_or(RuntimeError::Decode(crate::image_input::DecodeError::Busy))?;
        self.inspect_inline_with_permit(workspace, consent, reference, credential, permit)
            .await
    }

    async fn inspect_inline_with_permit(
        &self,
        workspace: &str,
        consent: &Consent,
        reference: &str,
        credential: &str,
        permit: tokio::sync::OwnedSemaphorePermit,
    ) -> Result<ProcessingApproval, RuntimeError> {
        if !self.permits(workspace, consent) {
            return Err(RuntimeError::Unauthorized);
        }
        // One caller deadline covers decoder admission/work and transport.
        // Cancelled blocking decoding retains its capacity until it finishes;
        // this timer does not claim to preempt native decoder CPU execution.
        tokio::time::timeout(Duration::from_millis(self.config.timeout_ms), async {
            let image = self
                .decoder
                .decode_inline_reserved(reference, permit)
                .await
                .map_err(RuntimeError::Decode)?;
            let contract = ImageInspectionContract {
                detector_revision: self.config.detector_revision.clone(),
                maximum_inline_bytes: self.config.maximum_encoded_bytes.div_ceil(3) * 4 + 23,
            };
            let image = crate::image_inspection::inspect(
                &contract,
                &self.config.endpoint,
                credential,
                image,
                Duration::from_millis(self.config.timeout_ms),
            )
            .await
            .map_err(RuntimeError::Inspection)?;
            Ok(ProcessingApproval {
                image,
                configuration_fingerprint: self.fingerprint.clone(),
                workspace: workspace.into(),
            })
        })
        .await
        .map_err(|_| RuntimeError::Inspection(InspectionError::Timeout))?
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{Json, Router, http::HeaderMap, routing::post};
    use image::{DynamicImage, ImageFormat};
    use std::{
        io::Cursor,
        sync::{
            Arc,
            atomic::{AtomicUsize, Ordering},
        },
    };

    #[test]
    fn inspection_deadline_includes_queued_decoding_without_releasing_capacity_early() {
        let executor = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(1)
            .max_blocking_threads(1)
            .enable_all()
            .build()
            .unwrap();
        executor.block_on(async {
            let workspace = "00000000-0000-4000-8000-000000000001";
            let runtime = Runtime::new(Config {
                endpoint: "https://unused.example/inspect".into(),
                api_key_env: "NIU_IMAGE_DEADLINE_TEST_KEY".into(),
                detector_revision: "fixture-v2".into(),
                recipient: "Fixture".into(),
                region: "Fixture".into(),
                retention: "None".into(),
                authorized_workspaces: vec![workspace.into()],
                declared_unmetered: true,
                timeout_ms: 50,
                maximum_encoded_bytes: 4096,
                maximum_width: 32,
                maximum_height: 32,
                maximum_decoded_bytes: 4096,
                concurrency: 1,
            })
            .unwrap();
            let consent = Consent {
                configuration_fingerprint: runtime.fingerprint().into(),
                consent_to_image_processing: true,
            };
            let mut bytes = Cursor::new(Vec::new());
            DynamicImage::new_rgb8(2, 2)
                .write_to(&mut bytes, ImageFormat::Png)
                .unwrap();
            let reference = crate::image_input::decode(
                &bytes.into_inner(),
                "image/png",
                runtime.config.limits(),
            )
            .unwrap()
            .inline_reference(4096)
            .unwrap();
            let (started, ready) = tokio::sync::oneshot::channel();
            let (release, blocked) = std::sync::mpsc::channel();
            let blocker = tokio::task::spawn_blocking(move || {
                started.send(()).unwrap();
                blocked.recv().unwrap();
            });
            ready.await.unwrap();
            let result = runtime
                .inspect_inline_resolved(workspace, &consent, &reference, "synthetic-key")
                .await;
            // Release the thread before asserting so a failed test cannot hang
            // runtime shutdown. Decoding has not started and cannot send data.
            release.send(()).unwrap();
            blocker.await.unwrap();
            assert_eq!(
                result.err(),
                Some(RuntimeError::Inspection(InspectionError::Timeout))
            );
            // Drain queued decoding; its retained permit is released only when
            // the blocking operation finishes, even after caller cancellation.
            tokio::task::spawn_blocking(|| ()).await.unwrap();
            assert!(runtime.decoder.decode_inline(&reference).await.is_ok());
        });
    }

    #[tokio::test]
    async fn processing_approval_binds_scope_configuration_and_exact_content() {
        let calls = Arc::new(AtomicUsize::new(0));
        let seen = calls.clone();
        let server=Router::new().route("/inspect",post(move |headers:HeaderMap,Json(body):Json<serde_json::Value>| {
            let seen=seen.clone();async move {
                seen.fetch_add(1,Ordering::SeqCst);
                assert_eq!(headers["authorization"],"Bearer synthetic-image-key");
                Json(serde_json::json!({"schema_version":2,"detector_revision":body["detector_revision"],"content_sha256":body["content_sha256"],"verdict":"clear"}))
            }
        }));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let task = tokio::spawn(async move { axum::serve(listener, server).await.unwrap() });
        let first = "00000000-0000-4000-8000-000000000001";
        let second = "00000000-0000-4000-8000-000000000002";
        let config = Config {
            endpoint: format!("http://{address}/inspect"),
            api_key_env: "NIU_IMAGE_TEST_SERVER_KEY".into(),
            detector_revision: "fixture-v2".into(),
            recipient: "Fixture recipient".into(),
            region: "Fixture".into(),
            retention: "None declared".into(),
            authorized_workspaces: vec![first.into(), second.into()],
            declared_unmetered: true,
            timeout_ms: 1000,
            maximum_encoded_bytes: 4096,
            maximum_width: 32,
            maximum_height: 32,
            maximum_decoded_bytes: 4096,
            concurrency: 1,
        };
        let runtime = Runtime::new(config.clone()).unwrap();
        let consent = Consent {
            configuration_fingerprint: runtime.fingerprint().into(),
            consent_to_image_processing: true,
        };
        let mut bytes = Cursor::new(Vec::new());
        DynamicImage::new_rgb8(2, 2)
            .write_to(&mut bytes, ImageFormat::Png)
            .unwrap();
        let bytes = bytes.into_inner();
        let reference = crate::image_input::decode(&bytes, "image/png", config.limits())
            .unwrap()
            .inline_reference(4096)
            .unwrap();
        assert!(matches!(
            runtime.reserve_inline(2),
            Err(RuntimeError::Decode(crate::image_input::DecodeError::Busy))
        ));
        assert_eq!(calls.load(Ordering::SeqCst), 0);
        let approval = runtime
            .inspect_inline_resolved(first, &consent, &reference, "synthetic-image-key")
            .await
            .unwrap();
        assert_eq!(approval.inline_reference(4096).unwrap(), reference);
        assert_eq!(
            approval.content_sha256(),
            format!("{:x}", Sha256::digest(&bytes))
        );
        assert_eq!(approval.configuration_fingerprint(), runtime.fingerprint());
        assert_eq!(approval.workspace(), first);
        assert!(runtime.approval_current(first, &consent, &approval));
        assert!(runtime.permits(second, &consent));
        assert!(!runtime.approval_current(second, &consent, &approval));
        let changed = Runtime::new(Config {
            recipient: "Changed recipient".into(),
            ..config.clone()
        })
        .unwrap();
        let renewed = Consent {
            configuration_fingerprint: changed.fingerprint().into(),
            consent_to_image_processing: true,
        };
        assert!(changed.permits(first, &renewed));
        assert!(!changed.approval_current(first, &renewed, &approval));
        assert!(!runtime.approval_current(
            first,
            &Consent {
                consent_to_image_processing: false,
                ..consent.clone()
            },
            &approval
        ));
        assert_eq!(
            runtime
                .inspect_inline_resolved(first, &consent, &reference, "synthetic-image-key")
                .await
                .err(),
            Some(RuntimeError::Decode(crate::image_input::DecodeError::Busy))
        );
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        drop(approval);
        assert!(
            runtime
                .inspect_inline_resolved(first, &consent, &reference, "synthetic-image-key")
                .await
                .is_ok()
        );
        assert_eq!(calls.load(Ordering::SeqCst), 2);
        let larger = Runtime::new(Config {
            concurrency: 2,
            ..config
        })
        .unwrap();
        let consent = Consent {
            configuration_fingerprint: larger.fingerprint().into(),
            consent_to_image_processing: true,
        };
        let mut batch = larger.reserve_inline(2).unwrap();
        assert!(larger.reserve_inline(1).is_err());
        let first_approval = larger
            .inspect_inline_with_permit(
                first,
                &consent,
                &reference,
                "synthetic-image-key",
                batch.permits.pop().unwrap(),
            )
            .await
            .unwrap();
        let second_approval = larger
            .inspect_inline_with_permit(
                first,
                &consent,
                &reference,
                "synthetic-image-key",
                batch.permits.pop().unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(first_approval.inline_reference(4096).unwrap(), reference);
        assert_eq!(second_approval.inline_reference(4096).unwrap(), reference);
        assert!(larger.reserve_inline(1).is_err());
        drop((first_approval, second_approval, batch));
        assert!(larger.reserve_inline(2).is_ok());
        assert_eq!(calls.load(Ordering::SeqCst), 4);
        task.abort();
    }
}
