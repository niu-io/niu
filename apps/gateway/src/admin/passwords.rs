//! Password exchange for existing scoped member sessions. No installation
//! identity is created or granted through this public authentication route.
use super::{audit_actor, authorize_operator_management};
use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    extract::{Path, State, rejection::JsonRejection},
    http::{HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
};
use niu_storage::{PasswordWorkError, PasswordWorkers};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

pub(crate) struct Runtime {
    origin: String,
    workers: PasswordWorkers,
    dummy_hash: String,
    local_development: bool,
}

impl Runtime {
    pub(crate) async fn from_env() -> Result<Option<Self>, Box<dyn std::error::Error>> {
        match std::env::var("NIU_AUTH_PUBLIC_ORIGIN") {
            Ok(origin) => Self::from_setting(&origin).await,
            Err(std::env::VarError::NotPresent) => Ok(None),
            Err(_) => Err("NIU_AUTH_PUBLIC_ORIGIN is invalid".into()),
        }
    }

    pub(crate) async fn from_setting(
        origin: &str,
    ) -> Result<Option<Self>, Box<dyn std::error::Error>> {
        if origin.is_empty() {
            return Ok(None);
        }
        Ok(Some(Self::new(origin).await?))
    }

    pub(crate) async fn new(origin: &str) -> Result<Self, Box<dyn std::error::Error>> {
        let url = url::Url::parse(origin)
            .map_err(|_| "NIU_AUTH_PUBLIC_ORIGIN must be an HTTPS origin")?;
        if url.scheme() != "https"
            || url.host_str().is_none()
            || !url.username().is_empty()
            || url.password().is_some()
            || url.path() != "/"
            || url.query().is_some()
            || url.fragment().is_some()
        {
            return Err("NIU_AUTH_PUBLIC_ORIGIN must be an HTTPS origin without credentials, path, query or fragment".into());
        }
        let workers = PasswordWorkers::new(4)?;
        let dummy_hash = workers.hash(Uuid::new_v4().to_string()).await?;
        Ok(Self {
            origin: url.origin().ascii_serialization(),
            workers,
            dummy_hash,
            local_development: false,
        })
    }

    /// Explicit loopback development only; production still requires HTTPS.
    pub(crate) async fn local(origin: &str) -> Result<Self, Box<dyn std::error::Error>> {
        let url = url::Url::parse(origin)?;
        if url.scheme() != "http"
            || !matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"))
            || !url.username().is_empty()
            || url.password().is_some()
            || url.path() != "/"
            || url.query().is_some()
            || url.fragment().is_some()
        {
            return Err("Development member origin must be a loopback HTTP origin".into());
        }
        let workers = PasswordWorkers::new(4)?;
        let dummy_hash = workers.hash(Uuid::new_v4().to_string()).await?;
        Ok(Self {
            origin: url.origin().ascii_serialization(),
            workers,
            dummy_hash,
            local_development: true,
        })
    }

    pub(crate) fn is_local(&self) -> bool {
        self.local_development
    }

    pub(crate) async fn provision_local_account(
        &self,
        store: &niu_storage::Store,
        email: &str,
        password: &str,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let hash = self
            .workers
            .hash_development_seed(password.to_owned())
            .await?;
        store.provision_development_member(email, &hash).await?;
        Ok(())
    }

    fn cookie_name(&self) -> &'static str {
        if self.local_development {
            "niu_dev_member_session"
        } else {
            MEMBER_COOKIE
        }
    }
    fn cookie_header(&self, token: &str, max_age: u32) -> HeaderValue {
        let secure = if self.local_development {
            ""
        } else {
            "; Secure"
        };
        HeaderValue::from_str(&format!(
            "{}={token}; Path=/{secure}; HttpOnly; SameSite=Lax; Max-Age={max_age}",
            self.cookie_name()
        ))
        .expect("validated member token")
    }

    pub(crate) fn check_origin(&self, headers: &HeaderMap) -> Result<(), ApiError> {
        let mut origins = headers.get_all("origin").iter();
        if let Some(origin) = origins.next() {
            if origins.next().is_some() {
                return Err(ApiError::forbidden());
            }
            let origin = origin.to_str().map_err(|_| ApiError::forbidden())?;
            if origin != self.origin {
                // Support localhost and 127.0.0.1 on the same development port,
                // while still requiring the browser's exact request host.
                let candidate = url::Url::parse(origin).map_err(|_| ApiError::forbidden())?;
                let configured =
                    url::Url::parse(&self.origin).map_err(|_| ApiError::forbidden())?;
                let host = headers.get("host").and_then(|value| value.to_str().ok());
                if !self.local_development
                    || candidate.scheme() != "http"
                    || !matches!(
                        candidate.host_str(),
                        Some("localhost" | "127.0.0.1" | "[::1]")
                    )
                    || candidate.port_or_known_default() != configured.port_or_known_default()
                    || candidate.origin().ascii_serialization() != origin
                    || host.map(|host| format!("http://{host}")).as_deref() != Some(origin)
                {
                    return Err(ApiError::forbidden());
                }
            }
        }
        Ok(())
    }
}

pub(crate) const MEMBER_COOKIE: &str = "__Host-niu_member_session";

pub(crate) fn member_cookie(
    headers: &HeaderMap,
    runtime: &Runtime,
) -> Result<Option<String>, ApiError> {
    let mut found = None;
    for header in headers.get_all("cookie") {
        let value = header.to_str().map_err(|_| ApiError::unauthorized())?;
        for item in value.split(';') {
            let Some((name, value)) = item.trim().split_once('=') else {
                continue;
            };
            if name != runtime.cookie_name() {
                continue;
            }
            if found.is_some()
                || value.is_empty()
                || value.len() > 256
                || !value
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'_')
            {
                return Err(ApiError::unauthorized());
            }
            found = Some(value.to_owned());
        }
    }
    Ok(found)
}

impl Runtime {
    /// Browser cookies are accepted only with a matching Origin or browser-owned
    /// same-origin Fetch Metadata. A cross-site header never overrides Origin.
    pub(crate) fn check_cookie_request(&self, headers: &HeaderMap) -> Result<(), ApiError> {
        self.check_origin(headers)?;
        let mut sites = headers.get_all("sec-fetch-site").iter();
        let site = sites.next();
        if sites.next().is_some()
            || site.is_some_and(|value| value.to_str().ok() != Some("same-origin"))
            || (site.is_none() && !headers.contains_key("origin"))
        {
            return Err(ApiError::forbidden());
        }
        Ok(())
    }
    pub(crate) fn require_origin(&self, headers: &HeaderMap) -> Result<(), ApiError> {
        if !headers.contains_key("origin") {
            return Err(ApiError::forbidden());
        }
        self.check_cookie_request(headers)
    }
}

pub async fn browser_login(
    State(state): State<AppState>,
    headers: HeaderMap,
    input: Result<Json<LoginInput>, JsonRejection>,
) -> Result<Response, ApiError> {
    runtime(&state)?.require_origin(&headers)?;
    let Json(value) = login(State(state.clone()), headers, input).await?;
    let token = value["token"]
        .as_str()
        .ok_or_else(ApiError::storage_unavailable)?;
    let cookie = runtime(&state)?.cookie_header(token, 28800);
    let mut response = Json(json!({"session":value["session"]})).into_response();
    response.headers_mut().insert("set-cookie", cookie);
    Ok(response)
}

pub async fn browser_logout(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    runtime(&state)?.require_origin(&headers)?;
    let token = member_cookie(&headers, runtime(&state)?)?.ok_or_else(ApiError::unauthorized)?;
    match state.store.revoke_current_member_session(&token).await {
        Ok(()) | Err(niu_storage::StoreError::Unauthorized) => {}
        Err(error) => return Err(ApiError::from_store(error)),
    }
    let mut response = StatusCode::NO_CONTENT.into_response();
    response
        .headers_mut()
        .insert("set-cookie", runtime(&state)?.cookie_header("", 0));
    Ok(response)
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LoginInput {
    email: String,
    password: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PasswordInput {
    email: String,
    password: String,
    expected_revision: Option<i64>,
}

fn worker_error(error: PasswordWorkError) -> ApiError {
    match error {
        PasswordWorkError::Capacity => ApiError::sign_in_limited(),
        PasswordWorkError::Credential(niu_storage::passwords::PasswordError::InvalidPassword) => {
            ApiError::invalid_request(
                "Password must contain at least 15 characters and at most 1024 bytes",
            )
        }
        _ => ApiError::storage_unavailable(),
    }
}

fn runtime(state: &AppState) -> Result<&Runtime, ApiError> {
    state.password_auth.as_deref().ok_or_else(|| {
        ApiError::unsupported_message("Production password sign-in is not configured")
    })
}

pub async fn login(
    State(state): State<AppState>,
    headers: HeaderMap,
    input: Result<Json<LoginInput>, JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    let runtime = runtime(&state)?;
    runtime.check_origin(&headers)?;
    let Json(input) = input.map_err(|_| ApiError::invalid_request("Invalid sign-in request"))?;
    if input.email.len() > 254 || input.password.len() > 1024 {
        return Err(ApiError::invalid_request("Invalid sign-in request"));
    }
    if !state
        .store
        .admit_member_password_login(&input.email)
        .await
        .map_err(ApiError::from_store)?
    {
        return Err(ApiError::sign_in_limited());
    }
    let credential = state
        .store
        .member_password_credential(&input.email)
        .await
        .map_err(ApiError::from_store)?;
    let verified = if let Some(credential) = credential {
        runtime
            .workers
            .verify(credential, input.password)
            .await
            .map_err(worker_error)?
    } else {
        runtime
            .workers
            .verify_encoded(runtime.dummy_hash.clone(), input.password)
            .await
            .map_err(worker_error)?;
        None
    };
    let verified = verified.ok_or_else(ApiError::sign_in_failed)?;
    let issued = state
        .store
        .issue_password_login_session(verified)
        .await
        .map_err(|error| {
            if matches!(error, niu_storage::StoreError::Unauthorized) {
                ApiError::sign_in_failed()
            } else {
                ApiError::from_store(error)
            }
        })?;
    Ok(Json(json!({"token":issued.token,"session":issued.session})))
}

pub async fn set_password(
    State(state): State<AppState>,
    Path(operator): Path<Uuid>,
    headers: HeaderMap,
    input: Result<Json<PasswordInput>, JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    let authorization = authorize_operator_management(&state, &headers, operator).await?;
    let runtime = runtime(&state)?;
    runtime.check_origin(&headers)?;
    let Json(input) =
        input.map_err(|_| ApiError::invalid_request("Invalid password configuration"))?;
    if input.email.len() > 254 {
        return Err(ApiError::invalid_request("Invalid password configuration"));
    }
    let hash = runtime
        .workers
        .hash(input.password)
        .await
        .map_err(worker_error)?;
    let revision = state
        .store
        .set_member_password(
            operator,
            &input.email,
            &hash,
            input.expected_revision,
            audit_actor(authorization),
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"revision":revision})))
}

/// Member sign-out does not grant installation or member-management privileges.
pub async fn logout(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    if let Some(runtime) = state.password_auth.as_deref() {
        runtime.check_origin(&headers)?;
    }
    let mut values = headers.get_all("authorization").iter();
    let token = values
        .next()
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .filter(|token| {
            !token.is_empty()
                && token.len() <= 256
                && !token.bytes().any(|b| b.is_ascii_whitespace())
        });
    if values.next().is_some() {
        return Err(ApiError::unauthorized());
    }
    state
        .store
        .revoke_current_member_session(token.ok_or_else(ApiError::unauthorized)?)
        .await
        .map_err(ApiError::from_store)?;
    Ok(StatusCode::NO_CONTENT)
}

/// Public capability discovery; never disclose configured identities or credentials.
pub async fn configuration(State(state): State<AppState>) -> Json<Value> {
    Json(json!({"password_login":state.password_auth.is_some()}))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ChangePasswordInput {
    current_password: String,
    password: String,
}

pub async fn change_password(
    State(state): State<AppState>,
    headers: HeaderMap,
    input: Result<Json<ChangePasswordInput>, JsonRejection>,
) -> Result<Response, ApiError> {
    let runtime = runtime(&state)?;
    let authorization = state
        .authorize_admin_headers(&headers, niu_storage::AdminPermission::Read)
        .await?;
    let crate::state::AdminAuthorization::Operator(member) = authorization else {
        return Err(ApiError::forbidden());
    };
    let browser = !headers.contains_key("authorization")
        || headers.get("authorization").and_then(|v| v.to_str().ok())
            == Some("Bearer niu-browser-member-session");
    if browser {
        runtime.require_origin(&headers)?;
    } else {
        runtime.check_origin(&headers)?;
    }
    let Json(input) = input.map_err(|_| ApiError::invalid_request("Invalid password change"))?;
    if input.current_password.len() > 1024 || input.password.len() > 1024 {
        return Err(ApiError::invalid_request("Invalid password change"));
    }
    let (email, credential) = state
        .store
        .member_password_change_credential(member.id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::sign_in_failed)?;
    if !state
        .store
        .admit_member_password_login(&email)
        .await
        .map_err(ApiError::from_store)?
    {
        return Err(ApiError::sign_in_limited());
    }
    let verified = runtime
        .workers
        .verify(credential, input.current_password)
        .await
        .map_err(worker_error)?
        .ok_or_else(ApiError::sign_in_failed)?;
    let hash = runtime
        .workers
        .hash(input.password)
        .await
        .map_err(worker_error)?;
    let revision = state
        .store
        .change_verified_member_password(verified, &hash)
        .await
        .map_err(ApiError::from_store)?;
    let mut response = Json(json!({"revision":revision,"sign_in_required":true})).into_response();
    if browser {
        response
            .headers_mut()
            .insert("set-cookie", runtime.cookie_header("", 0));
    }
    Ok(response)
}

#[cfg(test)]
mod development_tests {
    use super::*;
    #[tokio::test]
    async fn development_transport_does_not_relax_production_authentication() {
        assert!(Runtime::new("http://localhost:2566").await.is_err());
        for origin in [
            "http://example.com",
            "http://localhost:2566/path",
            "http://user@localhost:2566",
            "http://localhost:2566?query=yes",
        ] {
            assert!(Runtime::local(origin).await.is_err());
        }
        let local = Runtime::local("http://localhost:2566").await.unwrap();
        let mut headers = HeaderMap::new();
        headers.insert("origin", HeaderValue::from_static("http://localhost:2566"));
        assert!(local.require_origin(&headers).is_ok());
        headers.insert("origin", HeaderValue::from_static("http://evil.example"));
        assert!(local.require_origin(&headers).is_err());
        headers.insert(
            "cookie",
            HeaderValue::from_static("__Host-niu_member_session=production_token"),
        );
        assert!(member_cookie(&headers, &local).unwrap().is_none());
        headers.insert(
            "cookie",
            HeaderValue::from_static("niu_dev_member_session=development_token"),
        );
        assert_eq!(
            member_cookie(&headers, &local).unwrap().as_deref(),
            Some("development_token")
        );
        assert!(
            !local
                .cookie_header("token", 28800)
                .to_str()
                .unwrap()
                .contains("Secure")
        );
        let production = Runtime::new("https://niu.example").await.unwrap();
        assert!(member_cookie(&headers, &production).unwrap().is_none());
        assert!(
            production
                .cookie_header("token", 28800)
                .to_str()
                .unwrap()
                .contains("Secure")
        );
    }
}
