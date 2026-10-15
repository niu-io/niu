//! Rust SDK for building Niu plugins (in-process hooks and Unix-socket HTTP/outbox services).

use std::{
    collections::HashSet,
    path::Path,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::{SystemTime, UNIX_EPOCH},
};

use axum::{
    Json, Router,
    body::{Body, to_bytes},
    extract::State,
    http::{HeaderMap, Method, Request, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use niu_plugin_api::{MeteringAckStatus, OutboxDeliveryReceipt, OutboxEvent, RouteAuthMode};
use ring::signature::{ED25519, Ed25519KeyPair, KeyPair, UnparsedPublicKey};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use uuid::Uuid;

pub const PLUGIN_HEALTH_LIVE_PATH: &str = "/_niu/plugins/v1/health/live";
pub const PLUGIN_HEALTH_READY_PATH: &str = "/_niu/plugins/v1/health/ready";
pub const LEGACY_HEALTH_LIVE_PATH: &str = "/_niu/enterprise/v1/health/live";
pub const LEGACY_HEALTH_READY_PATH: &str = "/_niu/enterprise/v1/health/ready";
pub const PLUGIN_OUTBOX_EVENTS_PATH: &str = "/_niu/plugins/v1/outbox/events";

#[derive(Debug, thiserror::Error)]
pub enum SdkError {
    #[error("missing or malformed Authorization bearer token")]
    MissingBearer,
    #[error("invalid JWS structure")]
    MalformedJws,
    #[error("unsupported or unknown signing key id")]
    UnknownKeyId,
    #[error("signature verification failed")]
    InvalidSignature,
    #[error("token expired or invalid claims: {0}")]
    InvalidClaims(&'static str),
}

/// Verified caller and tenant context extracted from the Gateway's Ed25519 JWS header.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct VerifiedRequestContext {
    pub subject: String,
    pub audience: String,
    pub organization_id: Option<Uuid>,
    pub project_id: Option<Uuid>,
    pub role: String,
    pub permission: String,
    pub auth_mode: RouteAuthMode,
    pub method: String,
    pub path: String,
    pub request_id: String,
    pub body_sha256: String,
}

#[derive(Clone)]
pub struct JwsVerifier {
    expected_audience: String,
    kid: String,
    public_key_bytes: Vec<u8>,
}

impl JwsVerifier {
    /// Construct a verifier from a 32-byte Ed25519 public key.
    pub fn from_public_key(
        expected_audience: impl Into<String>,
        kid: impl Into<String>,
        public_key_bytes: Vec<u8>,
    ) -> Self {
        Self {
            expected_audience: expected_audience.into(),
            kid: kid.into(),
            public_key_bytes,
        }
    }

    /// Construct a verifier directly from the 32-byte Ed25519 seed (convenient for tests and dev).
    pub fn from_seed(
        expected_audience: impl Into<String>,
        kid: impl Into<String>,
        seed: &[u8; 32],
    ) -> Self {
        let pair = Ed25519KeyPair::from_seed_unchecked(seed).expect("valid 32-byte Ed25519 seed");
        Self {
            expected_audience: expected_audience.into(),
            kid: kid.into(),
            public_key_bytes: pair.public_key().as_ref().to_vec(),
        }
    }

    /// Verify a Gateway-signed JWS against the incoming HTTP method, target path+query, and body.
    pub fn verify(
        &self,
        headers: &HeaderMap,
        method: &Method,
        path_and_query: &str,
        body: &[u8],
    ) -> Result<VerifiedRequestContext, SdkError> {
        let token = headers
            .get(header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .filter(|v| !v.is_empty())
            .ok_or(SdkError::MissingBearer)?;

        let mut parts = token.split('.');
        let (Some(header_b64), Some(payload_b64), Some(sig_b64), None) =
            (parts.next(), parts.next(), parts.next(), parts.next())
        else {
            return Err(SdkError::MalformedJws);
        };

        let header_json: Value = serde_json::from_slice(
            &URL_SAFE_NO_PAD
                .decode(header_b64.as_bytes())
                .map_err(|_| SdkError::MalformedJws)?,
        )
        .map_err(|_| SdkError::MalformedJws)?;

        if header_json.get("alg").and_then(Value::as_str) != Some("EdDSA") {
            return Err(SdkError::InvalidClaims("alg must be EdDSA"));
        }
        if header_json.get("kid").and_then(Value::as_str) != Some(self.kid.as_str()) {
            return Err(SdkError::UnknownKeyId);
        }

        let signing_input = format!("{header_b64}.{payload_b64}");
        let signature = URL_SAFE_NO_PAD
            .decode(sig_b64.as_bytes())
            .map_err(|_| SdkError::MalformedJws)?;

        let public_key = UnparsedPublicKey::new(&ED25519, &self.public_key_bytes);
        public_key
            .verify(signing_input.as_bytes(), &signature)
            .map_err(|_| SdkError::InvalidSignature)?;

        let payload_json: Value = serde_json::from_slice(
            &URL_SAFE_NO_PAD
                .decode(payload_b64.as_bytes())
                .map_err(|_| SdkError::MalformedJws)?,
        )
        .map_err(|_| SdkError::MalformedJws)?;

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| SdkError::InvalidClaims("system clock error"))?
            .as_secs();

        if payload_json.get("iss").and_then(Value::as_str) != Some("https://niu.io") {
            return Err(SdkError::InvalidClaims("invalid issuer"));
        }
        let aud = payload_json
            .get("aud")
            .and_then(Value::as_str)
            .ok_or(SdkError::InvalidClaims("missing aud"))?;
        if aud != self.expected_audience {
            return Err(SdkError::InvalidClaims("audience mismatch"));
        }
        let exp = payload_json
            .get("exp")
            .and_then(Value::as_u64)
            .ok_or(SdkError::InvalidClaims("missing exp"))?;
        if now > exp {
            return Err(SdkError::InvalidClaims("token expired"));
        }

        let niu = payload_json
            .get("niu")
            .ok_or(SdkError::InvalidClaims("missing niu claims"))?;
        let claim_method = niu
            .get("method")
            .and_then(Value::as_str)
            .ok_or(SdkError::InvalidClaims("missing niu.method"))?;
        if claim_method != method.as_str() {
            return Err(SdkError::InvalidClaims("method mismatch"));
        }
        let claim_path = niu
            .get("path")
            .and_then(Value::as_str)
            .ok_or(SdkError::InvalidClaims("missing niu.path"))?;
        if claim_path != path_and_query {
            return Err(SdkError::InvalidClaims("path mismatch"));
        }
        let claim_sha = niu
            .get("body_sha256")
            .and_then(Value::as_str)
            .ok_or(SdkError::InvalidClaims("missing niu.body_sha256"))?;
        if claim_sha != hex_sha256(body) {
            return Err(SdkError::InvalidClaims("body_sha256 mismatch"));
        }

        let organization_id = niu
            .get("organization_id")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .map(|s| {
                Uuid::parse_str(s).map_err(|_| SdkError::InvalidClaims("invalid organization_id"))
            })
            .transpose()?;
        let project_id = niu
            .get("project_id")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .map(|s| Uuid::parse_str(s).map_err(|_| SdkError::InvalidClaims("invalid project_id")))
            .transpose()?;
        let auth_mode = match niu.get("auth_mode").and_then(Value::as_str) {
            Some("installation_admin") => RouteAuthMode::InstallationAdmin,
            Some("workspace_key") => RouteAuthMode::WorkspaceKey,
            Some("public_callback") => RouteAuthMode::PublicCallback,
            _ => RouteAuthMode::Operator,
        };

        Ok(VerifiedRequestContext {
            subject: payload_json
                .get("sub")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_owned(),
            audience: aud.to_owned(),
            organization_id,
            project_id,
            role: niu
                .get("role")
                .and_then(Value::as_str)
                .unwrap_or("owner")
                .to_owned(),
            permission: niu
                .get("permission")
                .and_then(Value::as_str)
                .unwrap_or("read")
                .to_owned(),
            auth_mode,
            method: claim_method.to_owned(),
            path: claim_path.to_owned(),
            request_id: niu
                .get("request_id")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_owned(),
            body_sha256: claim_sha.to_owned(),
        })
    }
}

#[derive(Clone)]
pub struct PluginRuntimeState {
    pub plugin_id: String,
    ready: Arc<AtomicBool>,
    seen_outbox_events: Arc<Mutex<HashSet<Uuid>>>,
    recorded_events: Arc<Mutex<Vec<OutboxEvent>>>,
}

impl PluginRuntimeState {
    pub fn new(plugin_id: impl Into<String>) -> Self {
        Self {
            plugin_id: plugin_id.into(),
            ready: Arc::new(AtomicBool::new(true)),
            seen_outbox_events: Arc::new(Mutex::new(HashSet::new())),
            recorded_events: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn set_ready(&self, is_ready: bool) {
        self.ready.store(is_ready, Ordering::Release);
    }

    pub fn is_ready(&self) -> bool {
        self.ready.load(Ordering::Acquire)
    }

    pub fn record_outbox_event(&self, event: OutboxEvent) -> OutboxDeliveryReceipt {
        let mut seen = self.seen_outbox_events.lock().unwrap();
        let status = if seen.insert(event.event_id) {
            self.recorded_events.lock().unwrap().push(event.clone());
            MeteringAckStatus::Accepted
        } else {
            MeteringAckStatus::Duplicate
        };
        OutboxDeliveryReceipt {
            plugin_id: self.plugin_id.clone(),
            event_id: event.event_id,
            status,
        }
    }

    pub fn recorded_events(&self) -> Vec<OutboxEvent> {
        self.recorded_events.lock().unwrap().clone()
    }
}

/// Builder for a standard Niu out-of-process or in-process plugin HTTP service.
pub struct PluginServiceBuilder {
    state: PluginRuntimeState,
    router: Router<PluginRuntimeState>,
}

impl PluginServiceBuilder {
    pub fn new(plugin_id: impl Into<String>) -> Self {
        let state = PluginRuntimeState::new(plugin_id);
        let router = Router::new()
            .route(PLUGIN_HEALTH_LIVE_PATH, get(handle_live))
            .route(LEGACY_HEALTH_LIVE_PATH, get(handle_live))
            .route(PLUGIN_HEALTH_READY_PATH, get(handle_ready))
            .route(LEGACY_HEALTH_READY_PATH, get(handle_ready))
            .route(PLUGIN_OUTBOX_EVENTS_PATH, post(handle_outbox_event));
        Self { state, router }
    }

    pub fn state(&self) -> PluginRuntimeState {
        self.state.clone()
    }

    pub fn merge_routes(mut self, routes: Router<PluginRuntimeState>) -> Self {
        self.router = self.router.merge(routes);
        self
    }

    pub fn into_router(self) -> Router {
        self.router.with_state(self.state)
    }

    /// Bind and serve the plugin router over a Unix domain socket.
    pub async fn serve_unix_socket(self, socket_path: impl AsRef<Path>) -> std::io::Result<()> {
        let path = socket_path.as_ref();
        if path.exists() {
            let _ = std::fs::remove_file(path);
        }
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let listener = tokio::net::UnixListener::bind(path)?;
        axum::serve(listener, self.into_router()).await
    }
}

async fn handle_live(State(state): State<PluginRuntimeState>) -> impl IntoResponse {
    (
        StatusCode::OK,
        Json(json!({
            "status": "ok",
            "plugin_id": state.plugin_id,
        })),
    )
}

async fn handle_ready(State(state): State<PluginRuntimeState>) -> Response {
    if state.is_ready() {
        (
            StatusCode::OK,
            Json(json!({
                "status": "ok",
                "plugin_id": state.plugin_id,
            })),
        )
            .into_response()
    } else {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({
                "status": "unavailable",
                "plugin_id": state.plugin_id,
            })),
        )
            .into_response()
    }
}

async fn handle_outbox_event(
    State(state): State<PluginRuntimeState>,
    request: Request<Body>,
) -> Response {
    let Ok(bytes) = to_bytes(request.into_body(), 1_048_576).await else {
        return StatusCode::PAYLOAD_TOO_LARGE.into_response();
    };
    let Ok(event) = serde_json::from_slice::<OutboxEvent>(&bytes) else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    let receipt = state.record_outbox_event(event);
    (StatusCode::OK, Json(receipt)).into_response()
}

pub fn hex_sha256(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|b| format!("{b:02x}")).collect()
}
