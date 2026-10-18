//! Rust SDK for building Niu plugins (in-process hooks and Unix-socket HTTP/outbox services).

use std::{
    collections::{HashSet, VecDeque},
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
        let (header_b64, payload_b64, header_json, payload_json, signature) =
            parse_jws_parts(headers)?;

        if header_json.get("alg").and_then(Value::as_str) != Some("EdDSA") {
            return Err(SdkError::InvalidClaims("alg must be EdDSA"));
        }
        if header_json.get("kid").and_then(Value::as_str) != Some(self.kid.as_str()) {
            return Err(SdkError::UnknownKeyId);
        }

        let signing_input = format!("{header_b64}.{payload_b64}");
        let public_key = UnparsedPublicKey::new(&ED25519, &self.public_key_bytes);
        public_key
            .verify(signing_input.as_bytes(), &signature)
            .map_err(|_| SdkError::InvalidSignature)?;

        verify_jws_claims(
            &payload_json,
            &self.expected_audience,
            method,
            path_and_query,
            body,
        )
    }
}

fn parse_jws_parts(headers: &HeaderMap) -> Result<(&str, &str, Value, Value, Vec<u8>), SdkError> {
    let mut auth_headers = headers.get_all(header::AUTHORIZATION).iter();
    let Some(first_auth) = auth_headers.next() else {
        return Err(SdkError::MissingBearer);
    };
    if auth_headers.next().is_some() {
        return Err(SdkError::MissingBearer);
    }
    let token = first_auth
        .to_str()
        .ok()
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

    let signature = URL_SAFE_NO_PAD
        .decode(sig_b64.as_bytes())
        .map_err(|_| SdkError::MalformedJws)?;
    if signature.len() != 64 {
        return Err(SdkError::MalformedJws);
    }

    let payload_json: Value = serde_json::from_slice(
        &URL_SAFE_NO_PAD
            .decode(payload_b64.as_bytes())
            .map_err(|_| SdkError::MalformedJws)?,
    )
    .map_err(|_| SdkError::MalformedJws)?;

    Ok((
        header_b64,
        payload_b64,
        header_json,
        payload_json,
        signature,
    ))
}

fn verify_jws_claims(
    payload_json: &Value,
    expected_audience: &str,
    method: &Method,
    path_and_query: &str,
    body: &[u8],
) -> Result<VerifiedRequestContext, SdkError> {
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
    if aud != expected_audience {
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
        .map(|s| Uuid::parse_str(s).map_err(|_| SdkError::InvalidClaims("invalid organization_id")))
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

const MAX_RECORDED_OUTBOX_EVENTS: usize = 1024;
const MAX_SEEN_OUTBOX_EVENT_IDS: usize = 16_384;

#[derive(Default)]
struct BoundedOutboxEvents {
    seen: HashSet<Uuid>,
    seen_order: VecDeque<Uuid>,
    events: VecDeque<OutboxEvent>,
}

#[derive(Clone)]
pub struct PluginRuntimeState {
    pub plugin_id: String,
    ready: Arc<AtomicBool>,
    outbox: Arc<Mutex<BoundedOutboxEvents>>,
    outbox_verifier: Option<Arc<JwsVerifier>>,
}

impl PluginRuntimeState {
    pub fn new(plugin_id: impl Into<String>) -> Self {
        Self {
            plugin_id: plugin_id.into(),
            ready: Arc::new(AtomicBool::new(true)),
            outbox: Arc::new(Mutex::new(BoundedOutboxEvents::default())),
            outbox_verifier: None,
        }
    }

    pub fn with_outbox_verifier(mut self, verifier: JwsVerifier) -> Self {
        self.outbox_verifier = Some(Arc::new(verifier));
        self
    }

    pub fn with_shared_outbox_verifier(mut self, verifier: Option<Arc<JwsVerifier>>) -> Self {
        self.outbox_verifier = verifier;
        self
    }

    pub fn set_ready(&self, is_ready: bool) {
        self.ready.store(is_ready, Ordering::Release);
    }

    pub fn is_ready(&self) -> bool {
        self.ready.load(Ordering::Acquire)
    }

    pub fn record_outbox_event(&self, event: OutboxEvent) -> OutboxDeliveryReceipt {
        let mut outbox = self
            .outbox
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let event_id = event.event_id;
        let status = if outbox.seen.insert(event_id) {
            if outbox.seen_order.len() >= MAX_SEEN_OUTBOX_EVENT_IDS
                && let Some(evicted_id) = outbox.seen_order.pop_front()
            {
                outbox.seen.remove(&evicted_id);
            }
            outbox.seen_order.push_back(event_id);

            if outbox.events.len() >= MAX_RECORDED_OUTBOX_EVENTS {
                outbox.events.pop_front();
            }
            outbox.events.push_back(event);
            MeteringAckStatus::Accepted
        } else {
            MeteringAckStatus::Duplicate
        };
        OutboxDeliveryReceipt {
            plugin_id: self.plugin_id.clone(),
            event_id,
            status,
        }
    }

    pub fn recorded_events(&self) -> Vec<OutboxEvent> {
        self.outbox
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .events
            .iter()
            .cloned()
            .collect()
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

    pub fn with_outbox_verifier(mut self, verifier: JwsVerifier) -> Self {
        self.state = self.state.with_outbox_verifier(verifier);
        self
    }

    pub fn with_shared_outbox_verifier(mut self, verifier: Option<Arc<JwsVerifier>>) -> Self {
        self.state = self.state.with_shared_outbox_verifier(verifier);
        self
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
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))?;
        }
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
    let (parts, body) = request.into_parts();
    let Ok(bytes) = to_bytes(body, 1_048_576).await else {
        return StatusCode::PAYLOAD_TOO_LARGE.into_response();
    };
    let path_and_query = parts
        .uri
        .path_and_query()
        .map(|pq| pq.as_str())
        .unwrap_or_else(|| parts.uri.path());

    let verified_context = if let Some(verifier) = &state.outbox_verifier {
        match verifier.verify(&parts.headers, &parts.method, path_and_query, &bytes) {
            Ok(ctx) => ctx,
            Err(err) => {
                return (
                    StatusCode::UNAUTHORIZED,
                    Json(json!({ "error": err.to_string() })),
                )
                    .into_response();
            }
        }
    } else {
        let Ok((_h_b64, _p_b64, header_json, payload_json, _sig)) = parse_jws_parts(&parts.headers)
        else {
            return StatusCode::UNAUTHORIZED.into_response();
        };
        if header_json.get("alg").and_then(Value::as_str) != Some("EdDSA")
            || header_json
                .get("kid")
                .and_then(Value::as_str)
                .is_none_or(str::is_empty)
        {
            return StatusCode::UNAUTHORIZED.into_response();
        }
        let Ok(ctx) = verify_jws_claims(
            &payload_json,
            &state.plugin_id,
            &parts.method,
            path_and_query,
            &bytes,
        ) else {
            return StatusCode::UNAUTHORIZED.into_response();
        };
        ctx
    };

    let Ok(event) = serde_json::from_slice::<OutboxEvent>(&bytes) else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    if verified_context.organization_id != Some(event.organization_id)
        || verified_context.project_id != event.project_id
    {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let receipt = state.record_outbox_event(event);
    (StatusCode::OK, Json(receipt)).into_response()
}

pub fn hex_sha256(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let digest = Sha256::digest(bytes);
    let mut encoded = String::with_capacity(digest.len() * 2);
    for byte in digest {
        encoded.push(HEX[(byte >> 4) as usize] as char);
        encoded.push(HEX[(byte & 0x0f) as usize] as char);
    }
    encoded
}

#[cfg(test)]
mod tests {
    use super::*;
    use niu_plugin_api::OutboxEventKind;

    fn sign_outbox_jws(
        seed: &[u8; 32],
        kid: &str,
        audience: &str,
        organization_id: Uuid,
        project_id: Option<Uuid>,
        body: &[u8],
    ) -> String {
        let key = Ed25519KeyPair::from_seed_unchecked(seed).unwrap();
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let header = json!({"alg": "EdDSA", "kid": kid, "typ": "JWT"});
        let mut payload = json!({
            "iss": "https://niu.io",
            "aud": audience,
            "sub": "niu-outbox",
            "iat": now,
            "exp": now + 60,
            "niu": {
                "role": "system",
                "permission": "write",
                "auth_mode": "operator",
                "method": "POST",
                "path": PLUGIN_OUTBOX_EVENTS_PATH,
                "request_id": Uuid::new_v4().to_string(),
                "body_sha256": hex_sha256(body),
                "organization_id": organization_id.to_string(),
            }
        });
        if let Some(project_id) = project_id {
            payload["niu"]["project_id"] = json!(project_id.to_string());
        }
        let header_b64 = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&header).unwrap());
        let payload_b64 = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&payload).unwrap());
        let signing_input = format!("{header_b64}.{payload_b64}");
        let sig = key.sign(signing_input.as_bytes());
        format!("{signing_input}.{}", URL_SAFE_NO_PAD.encode(sig.as_ref()))
    }

    #[test]
    fn outbox_deduplication_window_survives_payload_buffer_eviction() {
        let state = PluginRuntimeState::new("audit-test");
        let org_id = Uuid::new_v4();
        let first_event = OutboxEvent {
            event_id: Uuid::new_v4(),
            kind: OutboxEventKind::BillingSettlement,
            organization_id: org_id,
            project_id: None,
            occurred_at_unix_ms: 1_760_000_000_000,
            payload: json!({"seq": 0}),
        };
        let first_receipt = state.record_outbox_event(first_event.clone());
        assert_eq!(first_receipt.status, MeteringAckStatus::Accepted);

        for i in 1..=MAX_RECORDED_OUTBOX_EVENTS {
            let ev = OutboxEvent {
                event_id: Uuid::new_v4(),
                kind: OutboxEventKind::BillingSettlement,
                organization_id: org_id,
                project_id: None,
                occurred_at_unix_ms: 1_760_000_000_000 + i as u64,
                payload: json!({"seq": i}),
            };
            assert_eq!(
                state.record_outbox_event(ev).status,
                MeteringAckStatus::Accepted
            );
        }

        // The full-payload queue is bounded to MAX_RECORDED_OUTBOX_EVENTS (1024),
        // so first_event's payload has been evicted, but its event_id remains in `seen`.
        let recorded = state.recorded_events();
        assert_eq!(recorded.len(), MAX_RECORDED_OUTBOX_EVENTS);
        assert!(recorded.iter().all(|e| e.event_id != first_event.event_id));

        let duplicate_receipt = state.record_outbox_event(first_event);
        assert_eq!(duplicate_receipt.status, MeteringAckStatus::Duplicate);
    }

    #[tokio::test]
    async fn outbox_handler_verifies_jws_and_rejects_unauthenticated_or_forged_requests() {
        let seed = [21_u8; 32];
        let wrong_seed = [22_u8; 32];
        let kid = "outbox-key-1";
        let verifier = JwsVerifier::from_seed("audit-plugin", kid, &seed);
        let builder = PluginServiceBuilder::new("audit-plugin").with_outbox_verifier(verifier);
        let state = builder.state();

        let org_id = Uuid::new_v4();
        let proj_id = Uuid::new_v4();
        let event = OutboxEvent {
            event_id: Uuid::new_v4(),
            kind: OutboxEventKind::AdminAudit,
            organization_id: org_id,
            project_id: Some(proj_id),
            occurred_at_unix_ms: 1_760_000_000_000,
            payload: json!({"action": "rotate_key"}),
        };
        let body = serde_json::to_vec(&event).unwrap();

        // 1. Missing Authorization header -> 401
        let unauth_req = Request::builder()
            .method(Method::POST)
            .uri(PLUGIN_OUTBOX_EVENTS_PATH)
            .body(Body::from(body.clone()))
            .unwrap();
        let resp = handle_outbox_event(State(state.clone()), unauth_req).await;
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);

        // 2. Wrong signature -> 401
        let bad_token = sign_outbox_jws(
            &wrong_seed,
            kid,
            "audit-plugin",
            org_id,
            Some(proj_id),
            &body,
        );
        let forged_req = Request::builder()
            .method(Method::POST)
            .uri(PLUGIN_OUTBOX_EVENTS_PATH)
            .header(header::AUTHORIZATION, format!("Bearer {bad_token}"))
            .body(Body::from(body.clone()))
            .unwrap();
        let resp = handle_outbox_event(State(state.clone()), forged_req).await;
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);

        // 3. Mismatched tenant organization_id -> 401
        let wrong_org_token = sign_outbox_jws(
            &seed,
            kid,
            "audit-plugin",
            Uuid::new_v4(),
            Some(proj_id),
            &body,
        );
        let wrong_org_req = Request::builder()
            .method(Method::POST)
            .uri(PLUGIN_OUTBOX_EVENTS_PATH)
            .header(header::AUTHORIZATION, format!("Bearer {wrong_org_token}"))
            .body(Body::from(body.clone()))
            .unwrap();
        let resp = handle_outbox_event(State(state.clone()), wrong_org_req).await;
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);

        // 4. Valid signed token -> 200 Accepted, then 200 Duplicate
        let valid_token = sign_outbox_jws(&seed, kid, "audit-plugin", org_id, Some(proj_id), &body);
        let valid_req = Request::builder()
            .method(Method::POST)
            .uri(PLUGIN_OUTBOX_EVENTS_PATH)
            .header(header::AUTHORIZATION, format!("Bearer {valid_token}"))
            .body(Body::from(body.clone()))
            .unwrap();
        let resp = handle_outbox_event(State(state.clone()), valid_req).await;
        assert_eq!(resp.status(), StatusCode::OK);
        let receipt: OutboxDeliveryReceipt =
            serde_json::from_slice(&to_bytes(resp.into_body(), 4096).await.unwrap()).unwrap();
        assert_eq!(receipt.status, MeteringAckStatus::Accepted);

        // 5. Multiple Authorization headers -> 401
        let multi_auth_req = Request::builder()
            .method(Method::POST)
            .uri(PLUGIN_OUTBOX_EVENTS_PATH)
            .header(header::AUTHORIZATION, format!("Bearer {valid_token}"))
            .header(header::AUTHORIZATION, format!("Bearer {valid_token}"))
            .body(Body::from(body))
            .unwrap();
        let resp = handle_outbox_event(State(state), multi_auth_req).await;
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn serve_unix_socket_sets_0600_permissions() {
        use std::os::unix::fs::PermissionsExt;
        let sock_path = std::env::temp_dir().join(format!("niu-sdk-perm-{}.sock", Uuid::new_v4()));
        let builder = PluginServiceBuilder::new("perm-test");
        let task = tokio::spawn({
            let sock_path = sock_path.clone();
            async move {
                let _ = builder.serve_unix_socket(sock_path).await;
            }
        });
        for _ in 0..30 {
            if sock_path.exists() {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
        let metadata = std::fs::metadata(&sock_path).unwrap();
        assert_eq!(metadata.permissions().mode() & 0o777, 0o600);
        task.abort();
        let _ = std::fs::remove_file(sock_path);
    }
}
