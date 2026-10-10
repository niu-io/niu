//! Private Codex/ChatGPT plan connections using the documented public OAuth flow.
//! No credential extraction from Codex, browser storage, or backend-api endpoints.
use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    extract::{Path, Query, State},
    http::HeaderMap,
    response::Redirect,
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use niu_storage::{AdminPermission, CodexConnectionInput, TenantScope};
use ring::rand::{SecureRandom, SystemRandom};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, HashMap},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tokio::sync::Mutex;
use uuid::Uuid;

pub(crate) const RESOURCE: &str = "https://api.openai.com/v1";
const ISSUER: &str = "https://auth.openai.com";
const TOKEN_ENDPOINT: &str = "https://auth.openai.com/api/accounts/oauth/token";

#[derive(Default)]
pub(crate) struct Runtime {
    pending: Mutex<HashMap<String, PendingLogin>>,
    #[cfg(test)]
    pub(crate) inference_base: Option<String>,
    #[cfg(test)]
    auth_base: Option<String>,
}
struct PendingLogin {
    scope: TenantScope,
    id: Uuid,
    name: String,
    client_id: Option<String>,
    subject: Option<String>,
    verifier: String,
    nonce: String,
    callback: String,
    created: Instant,
}

// Tokens must never be logged or returned to the dashboard.
#[derive(Deserialize, Serialize)]
pub(crate) struct Credentials {
    pub(crate) access_token: String,
    pub(crate) refresh_token: String,
    pub(crate) id_token: String,
    pub(crate) scope: String,
    pub(crate) expires_at: u64,
    pub(crate) earliest_refresh_at: Option<u64>,
}
#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    id_token: Option<String>,
    token_type: String,
    expires_in: u64,
    scope: String,
    earliest_refresh_at: Option<u64>,
}
impl TokenResponse {
    fn into_credentials(self, previous: Option<&Credentials>) -> Result<Credentials, ApiError> {
        if !self.token_type.eq_ignore_ascii_case("bearer")
            || self.access_token.is_empty()
            || self.expires_in == 0
            || self.expires_in > 86400
            || ![
                "chatgpt.tokens.use.direct",
                "resource.invoke",
                "offline_access",
            ]
            .iter()
            .all(|required| {
                self.scope
                    .split_whitespace()
                    .any(|scope| scope == *required)
            })
        {
            return Err(ApiError::invalid_request(
                "ChatGPT plan usage was not authorized. Enable plan usage when signing in.",
            ));
        }
        let refresh_token = self
            .refresh_token
            .filter(|s| !s.is_empty())
            .ok_or_else(|| ApiError::invalid_request("A renewable ChatGPT session is required"))?;
        let id_token = self
            .id_token
            .or_else(|| previous.map(|p| p.id_token.clone()))
            .filter(|s| !s.is_empty())
            .ok_or_else(ApiError::upstream)?;
        Ok(Credentials {
            access_token: self.access_token,
            refresh_token,
            id_token,
            scope: self.scope,
            expires_at: now() + self.expires_in,
            earliest_refresh_at: self.earliest_refresh_at,
        })
    }
}

pub(crate) fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
fn random() -> Result<String, ApiError> {
    let mut bytes = [0u8; 32];
    SystemRandom::new()
        .fill(&mut bytes)
        .map_err(|_| ApiError::unavailable())?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}
pub(crate) fn client() -> Result<reqwest::Client, ApiError> {
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|_| ApiError::unavailable())
}
pub(crate) async fn bounded_json(mut response: reqwest::Response) -> Result<Value, ApiError> {
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| ApiError::upstream())? {
        if bytes.len() + chunk.len() > 1024 * 1024 {
            return Err(ApiError::upstream());
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes).map_err(|_| ApiError::upstream())
}
async fn authorize(
    state: &AppState,
    headers: &HeaderMap,
    scope: TenantScope,
    permission: AdminPermission,
) -> Result<(), ApiError> {
    let auth = state.authorize_admin_headers(headers, permission).await?;
    if !auth.permits_project(scope) {
        return Err(ApiError::not_found());
    }
    Ok(())
}
pub(crate) async fn list(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<Value>, ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    authorize(&state, &headers, scope, AdminPermission::Read).await?;
    Ok(Json(
        json!({"data":state.store.codex_connections(scope).await.map_err(ApiError::from_store)?}),
    ))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct StartLogin {
    name: String,
    callback_origin: String,
    account_id: Option<Uuid>,
}

fn callback_uri(origin: &str) -> Result<String, ApiError> {
    let url = url::Url::parse(origin).map_err(|_| {
        ApiError::invalid_request("Open this dashboard on http://127.0.0.1 to connect Codex.")
    })?;
    if url.scheme() != "http"
        || url.host_str() != Some("127.0.0.1")
        || url.path() != "/"
        || url.query().is_some()
        || url.fragment().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(ApiError::invalid_request(
            "Codex sign-in requires this dashboard on http://127.0.0.1.",
        ));
    }
    Ok(format!(
        "{}/auth/callback",
        url.origin().ascii_serialization()
    ))
}

pub(crate) async fn start(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    Json(input): Json<StartLogin>,
) -> Result<Json<Value>, ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    authorize(&state, &headers, scope, AdminPermission::Write).await?;
    if state.vendor_cipher.is_none() {
        return Err(ApiError::unavailable());
    }
    if input.name.trim().is_empty()
        || input.name.len() > 100
        || input.name.chars().any(char::is_control)
    {
        return Err(ApiError::invalid_request(
            "An account name is required (up to 100 characters).",
        ));
    }
    let callback = callback_uri(&input.callback_origin)?;
    if let Some(origin) = headers.get("origin")
        && origin.to_str().ok() != Some(input.callback_origin.trim_end_matches('/'))
    {
        return Err(ApiError::forbidden());
    }
    let host = state
        .store
        .codex_host_id()
        .await
        .map_err(ApiError::from_store)?;
    let (id, client_id, subject, id_hint) = if let Some(id) = input.account_id {
        let secret = state
            .store
            .codex_connection_secret(scope, id)
            .await
            .map_err(ApiError::from_store)?;
        let credentials = decrypt(&state, &secret)?;
        (
            id,
            Some(secret.client_id),
            Some(secret.subject),
            Some(credentials.id_token),
        )
    } else {
        (Uuid::new_v4(), None, None, None)
    };
    let state_value = random()?;
    let verifier = random()?;
    let nonce = random()?;
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let mut url = url::Url::parse("https://auth.openai.com/api/accounts/authorize").unwrap();
    {
        let mut query = url.query_pairs_mut();
        query.append_pair(
            "client_id",
            client_id.as_deref().unwrap_or("dynamic_agent_client"),
        );
        if client_id.is_none() {
            query.append_pair("agent_name_hint", "Niu");
        }
        if let Some(hint) = id_hint {
            query.append_pair("id_token_hint", &hint);
        }
        query
            .append_pair("ext_agent_host_id", &format!("urn:uuid:{host}"))
            .append_pair("response_type", "code")
            .append_pair("redirect_uri", &callback)
            .append_pair(
                "scope",
                "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
            )
            .append_pair("resource", RESOURCE)
            .append_pair("state", &state_value)
            .append_pair("nonce", &nonce)
            .append_pair("code_challenge_method", "S256")
            .append_pair("code_challenge", &challenge);
    }
    let mut pending = state.codex.pending.lock().await;
    pending.retain(|_, p| p.created.elapsed() < Duration::from_secs(600));
    if pending.len() >= 64 {
        return Err(ApiError::unavailable());
    }
    pending.insert(
        state_value,
        PendingLogin {
            scope,
            id,
            name: input.name.trim().into(),
            client_id,
            subject,
            verifier,
            nonce,
            callback,
            created: Instant::now(),
        },
    );
    Ok(Json(json!({"data":{"authorization_url":url.as_str()}})))
}

#[derive(Deserialize)]
pub(crate) struct Callback {
    state: String,
    code: Option<String>,
    client_id: Option<String>,
    error: Option<String>,
}
pub(crate) async fn callback(
    State(state): State<AppState>,
    Query(input): Query<Callback>,
) -> Result<Redirect, ApiError> {
    let pending = state
        .codex
        .pending
        .lock()
        .await
        .remove(&input.state)
        .ok_or_else(|| {
            ApiError::invalid_request("This sign-in attempt has expired. Start again in Suppliers.")
        })?;
    if pending.created.elapsed() > Duration::from_secs(600) {
        return Err(ApiError::invalid_request(
            "This sign-in attempt has expired.",
        ));
    }
    // Never return codes, provider errors, identities, or tokens in a redirect.
    let project = pending.scope.project_id;
    let outcome = if input.error.is_some() {
        "cancelled"
    } else {
        match finish_login(&state, pending, &input).await {
            Ok(()) => "connected",
            Err(_) => "failed",
        }
    };
    let suffix = if outcome == "connected" {
        format!("&workspace={project}")
    } else {
        String::new()
    };
    Ok(Redirect::to(&format!("/suppliers?codex={outcome}{suffix}")))
}
async fn finish_login(
    state: &AppState,
    pending: PendingLogin,
    callback: &Callback,
) -> Result<(), ApiError> {
    let client_id = match (&pending.client_id, &callback.client_id) {
        (Some(saved), None) => saved.clone(),
        (Some(saved), Some(returned)) if saved == returned => saved.clone(),
        (None, Some(issued)) if issued.starts_with("oaiapp_") && issued.len() <= 200 => {
            issued.clone()
        }
        _ => {
            return Err(ApiError::invalid_request(
                "ChatGPT registration was incomplete.",
            ));
        }
    };
    let code = callback
        .code
        .as_deref()
        .filter(|v| !v.is_empty() && v.len() <= 8192)
        .ok_or_else(ApiError::unauthorized)?;
    let client = client()?;
    let response = client
        .post(token_endpoint(state))
        .form(&[
            ("grant_type", "authorization_code"),
            ("client_id", &client_id),
            ("code", code),
            ("code_verifier", &pending.verifier),
            ("redirect_uri", &pending.callback),
            ("resource", RESOURCE),
        ])
        .send()
        .await
        .map_err(|_| ApiError::upstream())?;
    if !response.status().is_success() {
        return Err(ApiError::upstream());
    }
    let token: TokenResponse =
        serde_json::from_value(bounded_json(response).await?).map_err(|_| ApiError::upstream())?;
    let credentials = token.into_credentials(None)?;
    let claims = validate_identity(
        state,
        &client,
        &credentials.id_token,
        &client_id,
        &pending.nonce,
    )
    .await?;
    let subject = claims
        .get("sub")
        .and_then(Value::as_str)
        .filter(|v| !v.is_empty() && v.len() <= 200)
        .ok_or_else(ApiError::unauthorized)?;
    if pending
        .subject
        .as_deref()
        .is_some_and(|expected| expected != subject)
    {
        return Err(ApiError::unauthorized());
    }
    let response = client
        .get(format!("{}/models", inference_base(state)))
        .bearer_auth(&credentials.access_token)
        .send()
        .await
        .map_err(|_| ApiError::upstream())?;
    if !response.status().is_success() {
        return Err(ApiError::upstream());
    }
    let models = available_models(&bounded_json(response).await?)?;
    let ciphertext = encrypt(state, pending.id, &credentials)?;
    state
        .store
        .save_codex_connection(
            pending.scope,
            CodexConnectionInput {
                id: pending.id,
                name: &pending.name,
                subject,
                client_id: &client_id,
                credential_ciphertext: &ciphertext,
                models: &models,
            },
            pending.client_id.is_some(),
        )
        .await
        .map_err(ApiError::from_store)
}

pub(crate) fn available_models(value: &Value) -> Result<Value, ApiError> {
    let models = value
        .get("models")
        .and_then(Value::as_array)
        .ok_or_else(ApiError::upstream)?;
    let mut result = Vec::new();
    for model in models
        .iter()
        .filter(|m| m.get("visibility").and_then(Value::as_str) == Some("list"))
    {
        let Some(slug) = model
            .get("slug")
            .and_then(Value::as_str)
            .filter(|s| valid_slug(s))
        else {
            continue;
        };
        let name = model
            .get("display_name")
            .and_then(Value::as_str)
            .filter(|s| !s.trim().is_empty() && s.len() <= 200 && !s.chars().any(char::is_control))
            .unwrap_or(slug);
        if !result.iter().any(|m: &Value| m["slug"] == slug) {
            result.push(json!({"slug":slug,"display_name":name}));
        }
        if result.len() > 1000 {
            return Err(ApiError::upstream());
        }
    }
    if result.is_empty() {
        return Err(ApiError::invalid_request(
            "No eligible models are available to this ChatGPT account.",
        ));
    }
    Ok(Value::Array(result))
}
pub(crate) fn valid_slug(slug: &str) -> bool {
    !slug.is_empty()
        && slug.len() <= 180
        && slug
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
}

async fn validate_identity(
    state: &AppState,
    client: &reqwest::Client,
    token: &str,
    audience: &str,
    nonce: &str,
) -> Result<Value, ApiError> {
    let discovery = client
        .get(format!(
            "{}/.well-known/openid-configuration",
            auth_base(state)
        ))
        .send()
        .await
        .map_err(|_| ApiError::upstream())?;
    if !discovery.status().is_success() {
        return Err(ApiError::upstream());
    }
    let discovery = bounded_json(discovery).await?;
    let jwks_uri = discovery
        .get("jwks_uri")
        .and_then(Value::as_str)
        .ok_or_else(ApiError::upstream)?;
    let url = url::Url::parse(jwks_uri).map_err(|_| ApiError::upstream())?;
    if url.origin().ascii_serialization() != auth_base(state)
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(ApiError::upstream());
    }
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|_| ApiError::upstream())?;
    if !response.status().is_success() {
        return Err(ApiError::upstream());
    }
    verify_identity(token, &bounded_json(response).await?, audience, nonce)
}
fn verify_identity(
    token: &str,
    jwks: &Value,
    audience: &str,
    nonce: &str,
) -> Result<Value, ApiError> {
    let parts: Vec<_> = token.split('.').collect();
    if parts.len() != 3 || token.len() > 32 * 1024 {
        return Err(ApiError::unauthorized());
    }
    let decode = |part: &str| {
        URL_SAFE_NO_PAD
            .decode(part)
            .map_err(|_| ApiError::unauthorized())
    };
    let header: Value =
        serde_json::from_slice(&decode(parts[0])?).map_err(|_| ApiError::unauthorized())?;
    if header["alg"] != "RS256" {
        return Err(ApiError::unauthorized());
    }
    let kid = header
        .get("kid")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .ok_or_else(ApiError::unauthorized)?;
    let key = jwks
        .get("keys")
        .and_then(Value::as_array)
        .and_then(|keys| {
            keys.iter().find(|k| {
                k["kid"] == kid
                    && k["kty"] == "RSA"
                    && k.get("use").is_none_or(|v| v == "sig")
                    && k.get("alg").is_none_or(|v| v == "RS256")
            })
        })
        .ok_or_else(ApiError::unauthorized)?;
    let n = decode(
        key.get("n")
            .and_then(Value::as_str)
            .ok_or_else(ApiError::unauthorized)?,
    )?;
    let e = decode(
        key.get("e")
            .and_then(Value::as_str)
            .ok_or_else(ApiError::unauthorized)?,
    )?;
    ring::signature::RsaPublicKeyComponents { n: &n, e: &e }
        .verify(
            &ring::signature::RSA_PKCS1_2048_8192_SHA256,
            format!("{}.{}", parts[0], parts[1]).as_bytes(),
            &decode(parts[2])?,
        )
        .map_err(|_| ApiError::unauthorized())?;
    let claims: Value =
        serde_json::from_slice(&decode(parts[1])?).map_err(|_| ApiError::unauthorized())?;
    let aud_ok = claims["aud"].as_str() == Some(audience)
        || claims["aud"].as_array().is_some_and(|a| {
            a.iter().any(|v| v.as_str() == Some(audience))
                && (a.len() == 1 || claims["azp"].as_str() == Some(audience))
        });
    if claims["iss"] != ISSUER
        || !aud_ok
        || claims
            .get("azp")
            .is_some_and(|v| v.as_str() != Some(audience))
        || claims["nonce"] != nonce
        || claims["exp"].as_u64().is_none_or(|t| t <= now())
        || claims
            .get("nbf")
            .is_some_and(|v| v.as_u64().is_none_or(|t| t > now()))
    {
        return Err(ApiError::unauthorized());
    }
    Ok(claims)
}

pub(crate) fn decrypt(
    state: &AppState,
    secret: &niu_storage::CodexConnectionSecret,
) -> Result<Credentials, ApiError> {
    let value = state
        .vendor_cipher
        .as_ref()
        .ok_or_else(ApiError::unavailable)?
        .open(secret.account_id, &secret.credential_ciphertext)
        .map_err(|_| ApiError::unavailable())?;
    serde_json::from_str(&value).map_err(|_| ApiError::unavailable())
}
pub(crate) fn encrypt(
    state: &AppState,
    id: Uuid,
    credentials: &Credentials,
) -> Result<Vec<u8>, ApiError> {
    state
        .vendor_cipher
        .as_ref()
        .ok_or_else(ApiError::unavailable)?
        .seal_oauth(
            id,
            &serde_json::to_string(credentials).map_err(|_| ApiError::unavailable())?,
        )
        .map_err(|_| ApiError::unavailable())
}
pub(crate) async fn refresh(
    state: &AppState,
    scope: TenantScope,
    secret: &niu_storage::CodexConnectionSecret,
    owner: Uuid,
    credentials: Credentials,
) -> Result<Credentials, ApiError> {
    if credentials.expires_at > now() + 60 {
        return Ok(credentials);
    }
    if credentials
        .earliest_refresh_at
        .is_some_and(|earliest| earliest > now())
    {
        state
            .store
            .finish_codex_lease(scope, secret.account_id, owner, "ready", 0)
            .await
            .map_err(ApiError::from_store)?;
        return Err(ApiError::unavailable());
    }
    // An ambiguous token exchange retains the lease: rotating tokens cannot be retried blindly.
    let response = client()?
        .post(token_endpoint(state))
        .form(&[
            ("grant_type", "refresh_token"),
            ("client_id", secret.client_id.as_str()),
            ("refresh_token", credentials.refresh_token.as_str()),
            ("resource", RESOURCE),
        ])
        .send()
        .await
        .map_err(|_| ApiError::upstream())?;
    if response.status().is_client_error() {
        state
            .store
            .finish_codex_lease(scope, secret.account_id, owner, "authentication_expired", 0)
            .await
            .map_err(ApiError::from_store)?;
        return Err(ApiError::unauthorized());
    }
    if !response.status().is_success() {
        return Err(ApiError::upstream());
    }
    let token: TokenResponse =
        serde_json::from_value(bounded_json(response).await?).map_err(|_| ApiError::upstream())?;
    let renewed = token.into_credentials(Some(&credentials))?;
    state
        .store
        .replace_codex_tokens(
            scope,
            secret.account_id,
            owner,
            &encrypt(state, secret.account_id, &renewed)?,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(renewed)
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Enabled {
    enabled: bool,
}
pub(crate) async fn set_enabled(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization_id, project_id, id)): Path<(Uuid, Uuid, Uuid)>,
    Json(input): Json<Enabled>,
) -> Result<Json<Value>, ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    authorize(&state, &headers, scope, AdminPermission::Write).await?;
    state
        .store
        .set_codex_connection_enabled(scope, id, input.enabled)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"enabled":input.enabled}})))
}

pub(crate) fn inference_base(state: &AppState) -> &str {
    #[cfg(test)]
    if let Some(base) = &state.codex.inference_base {
        return base;
    }
    let _ = state;
    RESOURCE
}

fn auth_base(state: &AppState) -> &str {
    #[cfg(test)]
    if let Some(base) = &state.codex.auth_base {
        return base;
    }
    let _ = state;
    ISSUER
}
fn token_endpoint(state: &AppState) -> String {
    #[cfg(test)]
    if state.codex.auth_base.is_some() {
        return format!("{}/api/accounts/oauth/token", auth_base(state));
    }
    let _ = state;
    TOKEN_ENDPOINT.into()
}

pub(crate) fn model(slug: &str) -> crate::config::ModelConfig {
    crate::config::ModelConfig {
        catalog: Default::default(),
        provider: "codex".into(),
        upstream_model: slug.into(),
        api_key_env: "NIU_PRIVATE_CODEX".into(),
        api_base: Some(RESOURCE.into()),
        public_catalog: false,
        supports_embeddings: false,
        supports_embedding_dimensions: false,
        supports_embedding_base64: false,
        supports_tool_calls: false,
        supports_streaming_tool_calls: false,
        supports_structured_output: false,
        supports_responses: true,
        supports_messages: false,
        pricing: None,
    }
}

pub(crate) async fn private_models(
    state: &AppState,
    scope: TenantScope,
) -> Result<BTreeMap<String, crate::config::ModelConfig>, ApiError> {
    let mut models = BTreeMap::new();
    for connection in state
        .store
        .codex_connections(scope)
        .await
        .map_err(ApiError::from_store)?
    {
        if !matches!(connection.health.as_str(), "ready" | "cooldown") {
            continue;
        }
        for item in connection.models.as_array().into_iter().flatten() {
            if let Some(slug) = item
                .get("slug")
                .and_then(Value::as_str)
                .filter(|s| valid_slug(s))
            {
                let mut route = model(slug);
                route.catalog.name = item
                    .get("display_name")
                    .and_then(Value::as_str)
                    .map(str::to_owned);
                models.insert(format!("codex/{slug}"), route);
            }
        }
    }
    Ok(models)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        Form, Router,
        response::IntoResponse,
        routing::{get, post},
    };
    #[derive(Clone)]
    struct OAuthFixture {
        base: String,
        signed: Value,
    }
    async fn fixture_tokens(
        State(fixture): State<OAuthFixture>,
        Form(form): Form<HashMap<String, String>>,
    ) -> axum::response::Response {
        assert_eq!(form["client_id"], "oaiapp_fixture");
        assert_eq!(form["resource"], RESOURCE);
        if form
            .get("refresh_token")
            .is_some_and(|token| token == "invalid")
        {
            return (
                axum::http::StatusCode::BAD_REQUEST,
                Json(json!({"error":"invalid_grant"})),
            )
                .into_response();
        }
        if form
            .get("refresh_token")
            .is_some_and(|token| token == "ambiguous")
        {
            return "invalid JSON after a simulated rotation".into_response();
        }
        let refreshing = form["grant_type"] == "refresh_token";
        if !refreshing {
            assert_eq!(form["code_verifier"], "test-verifier");
            assert_eq!(form["redirect_uri"], "http://127.0.0.1:2566/auth/callback");
        }
        Json(json!({"access_token":if refreshing {"fixture-renewed-access"} else {"fixture-access"},"refresh_token":if refreshing {"fixture-replacement-refresh"} else {"fixture-refresh"},"id_token":fixture.signed["valid_token"],"scope":"openid offline_access resource.invoke chatgpt.tokens.use.direct","expires_in":3600,"token_type":"Bearer"})).into_response()
    }
    async fn fixture_discovery(State(fixture): State<OAuthFixture>) -> Json<Value> {
        Json(json!({"jwks_uri":format!("{}/jwks",fixture.base)}))
    }
    async fn fixture_jwks(State(fixture): State<OAuthFixture>) -> Json<Value> {
        Json(fixture.signed["jwks"].clone())
    }
    async fn fixture_models() -> Json<Value> {
        Json(
            json!({"models":[{"slug":"test-model","display_name":"Test model","visibility":"list"}]}),
        )
    }

    #[sqlx::test(migrations = "../../crates/storage/migrations")]
    #[ignore = "requires PostgreSQL"]
    async fn private_codex_oauth_exchanges_validates_and_rotates_as_one_session(
        pool: sqlx::PgPool,
    ) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let fixture = OAuthFixture {
            base: base.clone(),
            signed: serde_json::from_str(include_str!("../tests/fixtures/codex-oidc.json"))
                .unwrap(),
        };
        let app = Router::new()
            .route("/api/accounts/oauth/token", post(fixture_tokens))
            .route("/.well-known/openid-configuration", get(fixture_discovery))
            .route("/jwks", get(fixture_jwks))
            .route("/v1/models", get(fixture_models))
            .with_state(fixture);
        let server = tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        let mut state = AppState::new(
            toml::from_str("[models]").unwrap(),
            niu_storage::Store::from_pool(pool),
            crate::state::TokenSet::parse(
                "NIU_ADMIN_TOKENS",
                "niu-codex-test-admin-token-long-1234".into(),
            )
            .unwrap(),
            HashMap::new(),
        );
        state.vendor_cipher = Some(std::sync::Arc::new(
            crate::vendors::crypto::CredentialCipher::new(
                "codex-test-only-encryption-master-key-long",
            )
            .unwrap(),
        ));
        let runtime = Runtime {
            pending: Mutex::new(HashMap::new()),
            inference_base: Some(format!("{base}/v1")),
            auth_base: Some(base),
        };
        state.codex = std::sync::Arc::new(runtime);
        let org = state
            .store
            .create_organization("OAuth fixture")
            .await
            .unwrap();
        let scope = state
            .store
            .create_project(org, "Private OAuth workspace")
            .await
            .unwrap();
        let id = Uuid::new_v4();
        let pending = PendingLogin {
            scope,
            id,
            name: "My fixture account".into(),
            client_id: None,
            subject: None,
            verifier: "test-verifier".into(),
            nonce: "codex-test-nonce".into(),
            callback: "http://127.0.0.1:2566/auth/callback".into(),
            created: Instant::now(),
        };
        let callback = Callback {
            state: "fixture-state".into(),
            code: Some("fixture-code".into()),
            client_id: Some("oaiapp_fixture".into()),
            error: None,
        };
        finish_login(&state, pending, &callback).await.unwrap();
        let connections = state.store.codex_connections(scope).await.unwrap();
        assert_eq!(connections.len(), 1);
        assert_eq!(connections[0].health, "ready");
        assert_eq!(connections[0].models[0]["slug"], "test-model");
        let owner = Uuid::new_v4();
        let secret = state
            .store
            .claim_codex_connection(scope, "test-model", owner)
            .await
            .unwrap();
        let mut credentials = decrypt(&state, &secret).unwrap();
        credentials.expires_at = 0;
        let credentials = refresh(&state, scope, &secret, owner, credentials)
            .await
            .unwrap();
        assert_eq!(credentials.access_token, "fixture-renewed-access");
        assert_eq!(credentials.refresh_token, "fixture-replacement-refresh");
        let saved = decrypt(
            &state,
            &state
                .store
                .codex_connection_secret(scope, id)
                .await
                .unwrap(),
        )
        .unwrap();
        assert_eq!(saved.refresh_token, credentials.refresh_token);
        assert_eq!(
            state.store.accounts(scope).await.unwrap()[0].credential_revision,
            2
        );
        assert!(state.store.begin_account_refresh(scope, id).await.is_err());
        state
            .store
            .finish_codex_lease(scope, id, owner, "ready", 0)
            .await
            .unwrap();
        let owner = Uuid::new_v4();
        let secret = state
            .store
            .claim_codex_connection(scope, "test-model", owner)
            .await
            .unwrap();
        let mut credentials = decrypt(&state, &secret).unwrap();
        credentials.expires_at = 0;
        credentials.refresh_token = "invalid".into();
        assert!(
            refresh(&state, scope, &secret, owner, credentials)
                .await
                .is_err()
        );
        assert_eq!(
            state.store.codex_connections(scope).await.unwrap()[0].health,
            "authentication_expired"
        );
        assert!(!state.store.codex_connections(scope).await.unwrap()[0].busy);
        state
            .store
            .set_codex_connection_enabled(scope, id, true)
            .await
            .unwrap();
        let owner = Uuid::new_v4();
        let secret = state
            .store
            .claim_codex_connection(scope, "test-model", owner)
            .await
            .unwrap();
        let mut credentials = decrypt(&state, &secret).unwrap();
        credentials.expires_at = 0;
        credentials.refresh_token = "ambiguous".into();
        assert!(
            refresh(&state, scope, &secret, owner, credentials)
                .await
                .is_err()
        );
        assert!(state.store.codex_connections(scope).await.unwrap()[0].busy);
        server.abort();
    }
    #[test]
    fn callback_is_strictly_loopback() {
        assert_eq!(
            callback_uri("http://127.0.0.1:2566").unwrap(),
            "http://127.0.0.1:2566/auth/callback"
        );
        for url in [
            "https://niu.io",
            "http://localhost:2566",
            "http://127.0.0.1:2566/evil",
            "http://user@127.0.0.1:2566",
            "http://127.0.0.1:2566?x=1",
        ] {
            assert!(callback_uri(url).is_err());
        }
    }
    #[test]
    fn catalog_uses_only_account_entitlements() {
        let catalog=available_models(&json!({"models":[{"slug":"test-model","display_name":"Test model","visibility":"list"},{"slug":"hidden","visibility":"hidden"},{"slug":"bad/model","visibility":"list"}]})).unwrap();
        assert_eq!(
            catalog,
            json!([{ "slug":"test-model","display_name":"Test model" }])
        );
        assert!(available_models(&json!({"models":[]})).is_err());
    }
    #[test]
    fn unsigned_identity_cannot_authorize_a_connection() {
        let header = URL_SAFE_NO_PAD.encode(br#"{"alg":"none","kid":"fake"}"#);
        assert!(
            verify_identity(
                &format!("{header}.e30."),
                &json!({"keys":[]}),
                "client",
                "nonce"
            )
            .is_err()
        );
    }
    #[test]
    fn signed_identity_requires_signature_nonce_expiry_and_issued_client() {
        let fixture: Value =
            serde_json::from_str(include_str!("../tests/fixtures/codex-oidc.json")).unwrap();
        let token = fixture["valid_token"].as_str().unwrap();
        let jwks = &fixture["jwks"];
        assert_eq!(
            verify_identity(token, jwks, "oaiapp_fixture", "codex-test-nonce").unwrap()["sub"],
            "codex-test-subject"
        );
        assert!(verify_identity(token, jwks, "wrong-client", "codex-test-nonce").is_err());
        assert!(verify_identity(token, jwks, "oaiapp_fixture", "wrong-nonce").is_err());
        assert!(
            verify_identity(
                fixture["expired_token"].as_str().unwrap(),
                jwks,
                "oaiapp_fixture",
                "codex-test-nonce"
            )
            .is_err()
        );
        let mut signature = token.as_bytes().to_vec();
        let last = signature.len() - 8;
        signature[last] = if signature[last] == b'A' { b'B' } else { b'A' };
        assert!(
            verify_identity(
                std::str::from_utf8(&signature).unwrap(),
                jwks,
                "oaiapp_fixture",
                "codex-test-nonce"
            )
            .is_err()
        );
    }
}
