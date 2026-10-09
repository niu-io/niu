//! Targeted ordinary-group reads. No workspace authorization or entitlement is
//! established here; callers must bind the saved original account and identity.
use crate::asset_signing::AssetManagementSigner;
use serde::Deserialize;
use serde_json::{Value, json};
use std::time::Duration;

const ENDPOINT: &str =
    "https://ark.cn-beijing.volcengineapi.com/?Action=GetAssetGroup&Version=2024-01-01";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ReadError {
    InvalidConfiguration,
    EndpointRejected,
    Unavailable,
    Transport,
    Timeout,
    ResponseLimit,
    InvalidResponse,
}

/// Private upstream identity and scope must not enter diagnostic output.
#[derive(Clone)]
pub struct OrdinaryGroupRead {
    pub(crate) id: String,
    pub(crate) project: String,
}
impl OrdinaryGroupRead {
    pub fn new(id: String, project: String) -> Result<Self, ReadError> {
        if !id.starts_with("group-")
            || id.len() <= 6
            || id.len() > 128
            || !id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_'))
            || project.trim().is_empty()
            || project.len() > 256
            || project.chars().any(char::is_control)
        {
            return Err(ReadError::InvalidConfiguration);
        }
        Ok(Self { id, project })
    }
    pub(crate) fn body(&self) -> Value {
        json!({"Id":self.id,"ProjectName":self.project})
    }
}

/// Validated descriptive fields only. No raw response, account identity, URLs,
/// or credentials are exposed. A group read does not establish asset readiness.
pub struct OrdinaryGroupDetails {
    pub name: String,
    pub description: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl OrdinaryGroupDetails {
    /// Validate a retained metadata projection. Identity and provenance remain
    /// the caller's responsibility; this is not upstream readiness evidence.
    pub fn validate_metadata(&self) -> Result<(), ReadError> {
        if crate::asset_group::OrdinaryAssetGroupCreate::new(
            self.name.clone(),
            self.description.clone(),
        )
        .is_err()
            || chrono::DateTime::parse_from_rfc3339(&self.created_at).is_err()
            || chrono::DateTime::parse_from_rfc3339(&self.updated_at).is_err()
        {
            return Err(ReadError::InvalidResponse);
        }
        Ok(())
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct Envelope {
    response_metadata: Metadata,
    result: Group,
    error: Option<Value>,
}
#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct Metadata {
    action: String,
    version: String,
    service: String,
    region: String,
    error: Option<Value>,
}
#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct Group {
    id: String,
    project_name: String,
    group_type: String,
    name: String,
    description: Option<String>,
    create_time: String,
    update_time: String,
}
pub(crate) fn decode(
    body: &[u8],
    request: &OrdinaryGroupRead,
) -> Result<OrdinaryGroupDetails, ReadError> {
    let value: Envelope = serde_json::from_slice(body).map_err(|_| ReadError::InvalidResponse)?;
    let meta = value.response_metadata;
    let group = value.result;
    if value.error.is_some()
        || meta.error.is_some()
        || meta.action != "GetAssetGroup"
        || meta.version != "2024-01-01"
        || meta.service != "ark"
        || meta.region != "cn-beijing"
        || group.id != request.id
        || group.project_name != request.project
        || group.group_type != "AIGC"
        || crate::asset_group::OrdinaryAssetGroupCreate::new(
            group.name.clone(),
            group.description.clone(),
        )
        .is_err()
        || chrono::DateTime::parse_from_rfc3339(&group.create_time).is_err()
        || chrono::DateTime::parse_from_rfc3339(&group.update_time).is_err()
    {
        return Err(ReadError::InvalidResponse);
    }
    Ok(OrdinaryGroupDetails {
        name: group.name,
        description: group.description,
        created_at: group.create_time,
        updated_at: group.update_time,
    })
}

/// One fixed signed POST, no retry/redirect/proxy. DNS and reads share a deadline.
/// Call only after current access and operation-specific qualification checks.
pub async fn get_group_now(
    signer: &AssetManagementSigner,
    request: &OrdinaryGroupRead,
    maximum_bytes: usize,
    timeout: Duration,
) -> Result<OrdinaryGroupDetails, ReadError> {
    if !(1..=1024 * 1024).contains(&maximum_bytes)
        || timeout.is_zero()
        || timeout > Duration::from_secs(30)
    {
        return Err(ReadError::InvalidConfiguration);
    }
    let timestamp = chrono::DateTime::<chrono::Utc>::from(std::time::SystemTime::now())
        .format("%Y%m%dT%H%M%SZ")
        .to_string();
    let signed = signer
        .sign_get_group(&timestamp, request)
        .map_err(|_| ReadError::InvalidConfiguration)?;
    decode(
        &signed_read(ENDPOINT, signed, maximum_bytes, timeout).await?,
        request,
    )
}

pub(crate) async fn signed_read(
    endpoint: &str,
    signed: crate::asset_signing::SignedGroupCreate,
    maximum_bytes: usize,
    timeout: Duration,
) -> Result<Vec<u8>, ReadError> {
    if !(1..=1024 * 1024).contains(&maximum_bytes)
        || timeout.is_zero()
        || timeout > Duration::from_secs(30)
    {
        return Err(ReadError::InvalidConfiguration);
    }
    tokio::time::timeout(timeout, async {
        let client = niu_upstream::client_for_endpoint(endpoint, timeout)
            .await
            .map_err(|_| ReadError::EndpointRejected)?;
        let response = client
            .post(endpoint)
            .headers(signed.headers)
            .body(signed.body)
            .send()
            .await
            .map_err(|_| ReadError::Transport)?;
        read_body(response, maximum_bytes).await
    })
    .await
    .map_err(|_| ReadError::Timeout)?
}

#[cfg(test)]
async fn read_response(
    response: reqwest::Response,
    request: &OrdinaryGroupRead,
    maximum_bytes: usize,
) -> Result<OrdinaryGroupDetails, ReadError> {
    decode(&read_body(response, maximum_bytes).await?, request)
}

pub(crate) async fn read_body(
    mut response: reqwest::Response,
    maximum_bytes: usize,
) -> Result<Vec<u8>, ReadError> {
    if matches!(response.status().as_u16(), 403 | 404 | 410) {
        return Err(ReadError::Unavailable);
    }
    if !response.status().is_success()
        || response
            .headers()
            .contains_key(reqwest::header::CONTENT_ENCODING)
    {
        return Err(ReadError::InvalidResponse);
    }
    if response
        .content_length()
        .is_some_and(|n| n > maximum_bytes as u64)
    {
        return Err(ReadError::ResponseLimit);
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| ReadError::Transport)? {
        if chunk.len() > maximum_bytes.saturating_sub(body.len()) {
            return Err(ReadError::ResponseLimit);
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> Value {
        json!({"ResponseMetadata":{"Action":"GetAssetGroup","Version":"2024-01-01","Service":"ark","Region":"cn-beijing"},
        "Result":{"Id":"group-fixture","ProjectName":"original","GroupType":"AIGC","Name":"Character","Description":"Private description","CreateTime":"2026-10-08T00:00:00Z","UpdateTime":"2026-10-08T00:00:01Z"}})
    }
    #[test]
    fn response_requires_exact_identity_scope_type_and_valid_fields() {
        let request = OrdinaryGroupRead::new("group-fixture".into(), "original".into()).unwrap();
        assert_eq!(
            decode(&serde_json::to_vec(&fixture()).unwrap(), &request)
                .unwrap()
                .name,
            "Character"
        );
        for (field, invalid) in [
            ("Id", "group-other"),
            ("ProjectName", "other"),
            ("GroupType", "LivenessFace"),
            ("Name", ""),
            ("CreateTime", "invalid"),
        ] {
            let mut value = fixture();
            value["Result"][field] = json!(invalid);
            assert_eq!(
                decode(&serde_json::to_vec(&value).unwrap(), &request).err(),
                Some(ReadError::InvalidResponse)
            );
        }
        for field in ["Action", "Version", "Service", "Region"] {
            let mut value = fixture();
            value["ResponseMetadata"][field] = json!("other");
            assert_eq!(
                decode(&serde_json::to_vec(&value).unwrap(), &request).err(),
                Some(ReadError::InvalidResponse)
            );
        }
        let duplicate = serde_json::to_string(&fixture())
            .unwrap()
            .replace("\"Id\":", "\"Id\":\"group-other\",\"Id\":");
        assert_eq!(
            decode(duplicate.as_bytes(), &request).err(),
            Some(ReadError::InvalidResponse)
        );
    }
    #[test]
    fn signing_binds_read_action_identity_and_original_project() {
        let signer =
            AssetManagementSigner::new("AKEXAMPLE".into(), "fixture-secret".into()).unwrap();
        let one = OrdinaryGroupRead::new("group-fixture".into(), "original".into()).unwrap();
        let two = OrdinaryGroupRead::new("group-fixture".into(), "other".into()).unwrap();
        let first = signer.sign_get_group("20261008T000000Z", &one).unwrap();
        let second = signer.sign_get_group("20261008T000000Z", &two).unwrap();
        assert_eq!(
            first.body,
            br#"{"Id":"group-fixture","ProjectName":"original"}"#
        );
        assert_ne!(
            first.headers["authorization"],
            second.headers["authorization"]
        );
        assert!(first.headers["authorization"].is_sensitive());
        assert!(OrdinaryGroupRead::new("not-a-group".into(), "original".into()).is_err());
        assert!(OrdinaryGroupRead::new("group-fixture".into(), "".into()).is_err());
    }
    #[tokio::test]
    async fn response_reads_are_bounded_and_never_accept_redirects() {
        use axum::{Router, http::StatusCode, routing::post};
        let app = Router::new()
            .route("/ok", post(|| async { axum::Json(fixture()) }))
            .route(
                "/redirect",
                post(|| async { (StatusCode::FOUND, [("location", "/ok")]) }),
            )
            .route("/missing", post(|| async { StatusCode::NOT_FOUND }));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        let client = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap();
        let request = OrdinaryGroupRead::new("group-fixture".into(), "original".into()).unwrap();
        for (path, maximum, expected) in [
            ("ok", 8, ReadError::ResponseLimit),
            ("redirect", 4096, ReadError::InvalidResponse),
            ("missing", 4096, ReadError::Unavailable),
        ] {
            let response = client
                .post(format!("http://{address}/{path}"))
                .send()
                .await
                .unwrap();
            assert_eq!(
                read_response(response, &request, maximum).await.err(),
                Some(expected)
            );
        }
        let response = client
            .post(format!("http://{address}/ok"))
            .send()
            .await
            .unwrap();
        assert_eq!(
            read_response(response, &request, 4096).await.unwrap().name,
            "Character"
        );
        server.abort();
    }
}
