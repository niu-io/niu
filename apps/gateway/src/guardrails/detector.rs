//! Versioned external detector transport with opt-in required input policy bindings.
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{sync::Arc, time::Duration};
use tokio::sync::Semaphore;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Config {
    #[serde(default)]
    pub authorized_workspaces: Vec<uuid::Uuid>,
    #[serde(default)]
    pub cost_mode: CostMode,
    pub endpoint: String,
    pub api_key_env: String,
    pub revision: String,
    pub recipient: String,
    pub region: String,
    pub retention: String,
    pub timeout_ms: u64,
    pub concurrency: usize,
    pub max_text_bytes: usize,
}
#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CostMode {
    #[default]
    Unknown,
    DeclaredUnmetered,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Binding {
    pub detector: String,
    pub configuration_fingerprint: String,
    pub consent_to_external_processing: bool,
}
impl Binding {
    pub fn valid(&self) -> bool {
        self.consent_to_external_processing
            && !self.detector.is_empty()
            && self.detector.len() <= 200
            && self
                .detector
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
            && self.configuration_fingerprint.len() == 64
            && self
                .configuration_fingerprint
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    }
}

// Increment when extraction, payload shape, or transport processing semantics change.
// Existing bindings must then require renewed consent, even with unchanged service settings.
const PROCESSING_REVISION: &str = "niu-required-input-text-v1";

impl Config {
    pub fn fingerprint(&self) -> String {
        self.processing_fingerprint(PROCESSING_REVISION)
    }

    fn processing_fingerprint(&self, revision: &str) -> String {
        let bytes = serde_json::to_vec(&(revision, self))
            .expect("detector processing configuration is serializable");
        format!("{:x}", Sha256::digest(bytes))
    }

    pub fn validate(&self) -> Result<(), ()> {
        let url = url::Url::parse(&self.endpoint).map_err(|_| ())?;
        let host = url.host_str().ok_or(())?;
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
                &self.api_key_env,
                &self.revision,
                &self.recipient,
                &self.region,
                &self.retention,
            ]
            .iter()
            .any(|v| v.trim().is_empty() || v.len() > 256 || v.chars().any(char::is_control))
            || !(1..=30_000).contains(&self.timeout_ms)
            || !(1..=16).contains(&self.concurrency)
            || !(1..=65_536).contains(&self.max_text_bytes)
        {
            return Err(());
        }
        Ok(())
    }
}

pub struct Runtime {
    config: Config,
    slots: Arc<Semaphore>,
}
#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Outcome {
    Clear,
    Matched,
    Indeterminate,
}
#[derive(Debug, Serialize)]
pub struct InspectionResult {
    pub outcome: Outcome,
    pub reason: &'static str,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Response {
    schema_version: u32,
    detector_revision: String,
    verdict: Verdict,
}
#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
enum Verdict {
    Clear,
    Matched,
}
impl Runtime {
    pub fn fingerprint(&self) -> String {
        self.config.fingerprint()
    }

    pub fn authorized_workspace(&self, workspace: uuid::Uuid) -> bool {
        self.config.authorized_workspaces.contains(&workspace)
    }

    pub fn permits_live(&self, workspace: uuid::Uuid, binding: &Binding) -> bool {
        binding.valid()
            && binding.configuration_fingerprint == self.fingerprint()
            && self.authorized_workspace(workspace)
            && self.config.cost_mode == CostMode::DeclaredUnmetered
    }

    pub fn description(&self) -> serde_json::Value {
        serde_json::json!({
            "schema_version":1, "detector_revision":self.config.revision,
            "configuration_fingerprint":self.fingerprint(),
            "recipient":self.config.recipient, "region":self.config.region,
            "retention":self.config.retention, "processing_guarantees":"declared_unverified",
            "content_sent":"synthetic_text", "credential_source":"server_environment",
            "timeout_ms":self.config.timeout_ms, "concurrency":self.config.concurrency,
            "max_text_bytes":self.config.max_text_bytes, "max_response_bytes":4096,
            "external_charge":self.config.cost_mode, "customer_billing":"not_integrated",
            "policy_activation":self.config.cost_mode == CostMode::DeclaredUnmetered && !self.config.authorized_workspaces.is_empty()
        })
    }

    pub fn new(config: Config) -> Self {
        Self {
            slots: Arc::new(Semaphore::new(config.concurrency)),
            config,
        }
    }
    pub async fn inspect(&self, text: &str) -> InspectionResult {
        let indeterminate = |reason| InspectionResult {
            outcome: Outcome::Indeterminate,
            reason,
        };
        if text.len() > self.config.max_text_bytes {
            return indeterminate("resource_limit");
        }
        let Ok(_permit) = self.slots.try_acquire() else {
            return indeterminate("capacity_exhausted");
        };
        let Ok(key) = std::env::var(&self.config.api_key_env) else {
            return indeterminate("credential_unavailable");
        };
        if key.trim().is_empty() {
            return indeterminate("credential_unavailable");
        }
        let timeout = Duration::from_millis(self.config.timeout_ms);
        let operation = async {
            let client = crate::upstream::client_for_endpoint(&self.config.endpoint, timeout)
                .await
                .map_err(|_| "endpoint_unavailable")?;
            let mut response = client
                .post(&self.config.endpoint)
                .bearer_auth(key)
                .json(&serde_json::json!({
                    "schema_version":1, "detector_revision":self.config.revision, "text":text
                }))
                .send()
                .await
                .map_err(|error| {
                    if error.is_timeout() {
                        "timeout"
                    } else {
                        "transport_failure"
                    }
                })?;
            if !response.status().is_success() {
                return Err("service_failure");
            }
            let mut body = Vec::new();
            while let Some(chunk) = response.chunk().await.map_err(|error| {
                if error.is_timeout() {
                    "timeout"
                } else {
                    "transport_failure"
                }
            })? {
                if body.len().saturating_add(chunk.len()) > 4096 {
                    return Err("response_limit");
                }
                body.extend_from_slice(&chunk);
            }
            let response: Response =
                serde_json::from_slice(&body).map_err(|_| "invalid_response")?;
            if response.schema_version != 1 || response.detector_revision != self.config.revision {
                return Err("invalid_response");
            }
            Ok(match response.verdict {
                Verdict::Clear => Outcome::Clear,
                Verdict::Matched => Outcome::Matched,
            })
        };
        match tokio::time::timeout(timeout, operation).await {
            Ok(Ok(outcome)) => InspectionResult {
                outcome,
                reason: "detector_verdict",
            },
            Ok(Err(reason)) => indeterminate(reason),
            Err(_) => indeterminate("timeout"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn config(endpoint: String) -> Config {
        Config {
            authorized_workspaces: Vec::new(),
            cost_mode: CostMode::Unknown,
            endpoint,
            api_key_env: "PATH".into(),
            revision: "test-v1".into(),
            recipient: "Local fixture".into(),
            region: "Local".into(),
            retention: "None".into(),
            timeout_ms: 200,
            concurrency: 1,
            max_text_bytes: 32,
        }
    }
    async fn fixture(
        body: String,
        status: axum::http::StatusCode,
        delay: u64,
    ) -> (String, tokio::task::JoinHandle<()>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let app = axum::Router::new().route("/detect", axum::routing::post(move |headers: axum::http::HeaderMap, axum::Json(input): axum::Json<serde_json::Value>| async move {
            assert!(headers.get("authorization").is_some());
            assert_eq!(input, serde_json::json!({"schema_version":1,"detector_revision":"test-v1","text":"synthetic"}));
            tokio::time::sleep(Duration::from_millis(delay)).await;
            (status, body)
        }));
        let handle = tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        (format!("http://{address}/detect"), handle)
    }
    #[tokio::test]
    async fn versioned_authenticated_verdicts_and_strict_response_bounds() {
        for (body, expected) in [
            (r#"{"schema_version":1,"detector_revision":"test-v1","verdict":"clear"}"#.to_owned(), "detector_verdict"),
            (r#"{"schema_version":1,"detector_revision":"test-v1","verdict":"matched"}"#.to_owned(), "detector_verdict"),
            (r#"{"schema_version":2,"detector_revision":"test-v1","verdict":"clear"}"#.to_owned(), "invalid_response"),
            (r#"{"schema_version":1,"detector_revision":"wrong","verdict":"clear"}"#.to_owned(), "invalid_response"),
            (r#"{"schema_version":1,"detector_revision":"test-v1","verdict":"clear","text":"private"}"#.to_owned(), "invalid_response"),
            ("x".repeat(4097), "response_limit"),
        ] {
            let (endpoint, handle) = fixture(body, axum::http::StatusCode::OK, 0).await;
            let result = Runtime::new(config(endpoint)).inspect("synthetic").await;
            handle.abort();
            assert_eq!(result.reason, expected);
            assert_eq!(result.outcome == Outcome::Indeterminate, expected != "detector_verdict");
        }
    }
    #[tokio::test]
    async fn timeout_service_failure_and_overload_are_indeterminate() {
        for (status, delay, reason) in [
            (axum::http::StatusCode::OK, 500, "timeout"),
            (axum::http::StatusCode::UNAUTHORIZED, 0, "service_failure"),
        ] {
            let (endpoint, handle) = fixture("secret upstream error".into(), status, delay).await;
            let result = Runtime::new(config(endpoint)).inspect("synthetic").await;
            handle.abort();
            assert_eq!(result.outcome, Outcome::Indeterminate);
            assert_eq!(result.reason, reason);
        }
        let runtime = Runtime::new(config("http://127.0.0.1:1/detect".into()));
        let permit = runtime.slots.acquire().await.unwrap();
        assert_eq!(
            runtime.inspect("synthetic").await.reason,
            "capacity_exhausted"
        );
        drop(permit);
        assert_eq!(
            runtime.inspect(&"x".repeat(33)).await.reason,
            "resource_limit"
        );
    }
    #[tokio::test]
    async fn redirects_cannot_forward_text_or_credentials_to_another_handler() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        let calls = Arc::new(AtomicUsize::new(0));
        let received = calls.clone();
        let app = axum::Router::new()
            .route("/detect", axum::routing::post(|| async {
                (axum::http::StatusCode::TEMPORARY_REDIRECT,
                 [(axum::http::header::LOCATION, "/sink")], "private redirect diagnostics")
            }))
            .route("/sink", axum::routing::post(move || {
                let calls = received.clone();
                async move {
                    calls.fetch_add(1, Ordering::SeqCst);
                    axum::Json(serde_json::json!({"schema_version":1,"detector_revision":"test-v1","verdict":"clear"}))
                }
            }));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let endpoint = format!("http://{}/detect", listener.local_addr().unwrap());
        let server = tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        let result = Runtime::new(config(endpoint)).inspect("synthetic").await;
        assert_eq!(result.outcome, Outcome::Indeterminate);
        assert_eq!(result.reason, "service_failure");
        assert_eq!(calls.load(Ordering::SeqCst), 0);
        server.abort();
    }

    #[tokio::test]
    async fn live_capacity_rejects_extra_work_and_cancellation_releases_slot() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        let calls = Arc::new(AtomicUsize::new(0));
        let started = Arc::new(tokio::sync::Notify::new());
        let release = Arc::new(tokio::sync::Notify::new());
        let handler_calls = calls.clone();
        let handler_started = started.clone();
        let handler_release = release.clone();
        let app = axum::Router::new().route("/detect", axum::routing::post(move || {
            let calls = handler_calls.clone();
            let started = handler_started.clone();
            let release = handler_release.clone();
            async move {
                if calls.fetch_add(1, Ordering::SeqCst) == 0 {
                    started.notify_one();
                    release.notified().await;
                }
                axum::Json(serde_json::json!({"schema_version":1,"detector_revision":"test-v1","verdict":"clear"}))
            }
        }));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let mut value = config(format!("http://{}/detect", listener.local_addr().unwrap()));
        value.timeout_ms = 2_000;
        let server = tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        let runtime = Arc::new(Runtime::new(value));
        let first_runtime = runtime.clone();
        let first = tokio::spawn(async move { first_runtime.inspect("synthetic").await });
        tokio::time::timeout(Duration::from_secs(1), started.notified())
            .await
            .unwrap();
        let rejected =
            tokio::time::timeout(Duration::from_millis(200), runtime.inspect("synthetic"))
                .await
                .expect("capacity exhaustion must not queue");
        assert_eq!(rejected.outcome, Outcome::Indeterminate);
        assert_eq!(rejected.reason, "capacity_exhausted");
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        first.abort();
        assert!(first.await.unwrap_err().is_cancelled());
        let recovered = runtime.inspect("synthetic").await;
        assert_eq!(recovered.outcome, Outcome::Clear);
        assert_eq!(calls.load(Ordering::SeqCst), 2);
        release.notify_one();
        server.abort();
    }

    #[test]
    fn processing_fingerprint_is_stable_and_binds_every_declared_setting() {
        let original = config("https://example.com/detect".into());
        let fingerprint = original.fingerprint();
        assert_eq!(original.clone().fingerprint(), fingerprint);
        assert_ne!(
            original.processing_fingerprint("niu-required-input-text-v2"),
            fingerprint
        );
        let legacy = format!(
            "{:x}",
            Sha256::digest(serde_json::to_vec(&original).unwrap())
        );
        assert_ne!(legacy, fingerprint);
        for field in [
            "endpoint",
            "api_key_env",
            "revision",
            "recipient",
            "region",
            "retention",
        ] {
            let mut changed = original.clone();
            match field {
                "endpoint" => changed.endpoint.push_str("/changed"),
                "api_key_env" => changed.api_key_env.push_str("_CHANGED"),
                "revision" => changed.revision.push_str("-changed"),
                "recipient" => changed.recipient.push_str(" changed"),
                "region" => changed.region.push_str(" changed"),
                "retention" => changed.retention.push_str(" changed"),
                _ => unreachable!(),
            }
            assert_ne!(changed.fingerprint(), fingerprint);
        }
        for setting in 0..3 {
            let mut changed = original.clone();
            match setting {
                0 => changed.timeout_ms += 1,
                1 => changed.concurrency += 1,
                _ => changed.max_text_bytes += 1,
            }
            assert_ne!(changed.fingerprint(), fingerprint);
        }
        let description = Runtime::new(original).description();
        assert!(description.get("endpoint").is_none());
        assert!(description.get("api_key_env").is_none());
        assert_eq!(description["content_sent"], "synthetic_text");
    }

    #[test]
    fn live_binding_requires_workspace_current_consent_and_unmetered_declaration() {
        let workspace = uuid::Uuid::new_v4();
        let mut value = config("https://example.com/detect".into());
        value.authorized_workspaces = vec![workspace];
        let mut binding = Binding {
            detector: "fixture".into(),
            configuration_fingerprint: value.fingerprint(),
            consent_to_external_processing: true,
        };
        assert!(!Runtime::new(value.clone()).permits_live(workspace, &binding));
        value.cost_mode = CostMode::DeclaredUnmetered;
        binding.configuration_fingerprint = value.fingerprint();
        let runtime = Runtime::new(value.clone());
        assert!(runtime.permits_live(workspace, &binding));
        let mut stale_processing = binding.clone();
        stale_processing.configuration_fingerprint =
            value.processing_fingerprint("retired-processing");
        assert!(!runtime.permits_live(workspace, &stale_processing));
        assert!(!runtime.permits_live(uuid::Uuid::new_v4(), &binding));
        binding.consent_to_external_processing = false;
        assert!(!runtime.permits_live(workspace, &binding));
        binding.consent_to_external_processing = true;
        value.region = "Different region".into();
        assert!(!Runtime::new(value).permits_live(workspace, &binding));
    }

    #[test]
    fn invalid_configuration_rejected() {
        let mut value = config("http://127.0.0.1:1/detect".into());
        assert!(value.validate().is_ok());
        for endpoint in [
            "http://example.com/detect",
            "https://user:password@example.com/detect",
            "https://example.com/detect?secret=x",
        ] {
            value.endpoint = endpoint.into();
            assert!(value.validate().is_err());
        }
        value.endpoint = "https://example.com/detect".into();
        value.concurrency = 0;
        assert!(value.validate().is_err());
    }
}
