//! One-shot ordinary asset-group creation; does not establish authorization.
use crate::asset_group::OrdinaryAssetGroupCreate;
use crate::asset_signing::{AssetManagementSigner, CREATE_GROUP_URL, SignedGroupCreate};
use std::time::Duration;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AssetCreateError {
    InvalidConfiguration,
    EndpointRejected,
    /// The operation may exist. Never replay automatically after dispatch.
    Uncertain,
}

/// Internal upstream identity. No Debug/Serialize to avoid accidental display.
pub struct AssetGroupReceipt {
    upstream_id: String,
}
impl AssetGroupReceipt {
    pub fn upstream_id(&self) -> &str {
        &self.upstream_id
    }
}

/// Production entry point uses a fresh UTC signing timestamp immediately before
/// the bounded one-shot transport. Test vectors can use `create_group` directly.
pub async fn create_group_now(
    signer: &AssetManagementSigner,
    request: &OrdinaryAssetGroupCreate,
    upstream_project: &str,
    maximum_response_bytes: usize,
    timeout: Duration,
) -> Result<AssetGroupReceipt, AssetCreateError> {
    let timestamp = chrono::DateTime::<chrono::Utc>::from(std::time::SystemTime::now())
        .format("%Y%m%dT%H%M%SZ")
        .to_string();
    create_group(
        signer,
        &timestamp,
        request,
        upstream_project,
        maximum_response_bytes,
        timeout,
    )
    .await
}

/// Caller must bind the original Supplier account/project, authorize the
/// workspace and durably record its create intent before calling this function.
/// No retries, entitlement discovery, persistence or price assumption is provided.
pub async fn create_group(
    signer: &AssetManagementSigner,
    timestamp: &str,
    request: &OrdinaryAssetGroupCreate,
    upstream_project: &str,
    maximum_response_bytes: usize,
    timeout: Duration,
) -> Result<AssetGroupReceipt, AssetCreateError> {
    if !(1..=1024 * 1024).contains(&maximum_response_bytes)
        || timeout.is_zero()
        || timeout > Duration::from_secs(60)
    {
        return Err(AssetCreateError::InvalidConfiguration);
    }
    let signed = signer
        .sign_create_group(timestamp, request, upstream_project)
        .map_err(|_| AssetCreateError::InvalidConfiguration)?;
    let deadline = tokio::time::Instant::now() + timeout;
    let client = tokio::time::timeout_at(
        deadline,
        niu_upstream::client_for_endpoint(CREATE_GROUP_URL, timeout),
    )
    .await
    .map_err(|_| AssetCreateError::EndpointRejected)?
    .map_err(|_| AssetCreateError::EndpointRejected)?;
    send_once(
        &client,
        CREATE_GROUP_URL,
        signed,
        maximum_response_bytes,
        deadline,
    )
    .await
}

async fn send_once(
    client: &reqwest::Client,
    endpoint: &str,
    signed: SignedGroupCreate,
    maximum_response_bytes: usize,
    deadline: tokio::time::Instant,
) -> Result<AssetGroupReceipt, AssetCreateError> {
    let work = async {
        let mut response = client
            .post(endpoint)
            .headers(signed.headers)
            .body(signed.body)
            .send()
            .await
            .map_err(|_| AssetCreateError::Uncertain)?;
        if !response.status().is_success()
            || response
                .content_length()
                .is_some_and(|size| size > maximum_response_bytes as u64)
        {
            return Err(AssetCreateError::Uncertain);
        }
        let mut body = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| AssetCreateError::Uncertain)?
        {
            if chunk.len() > maximum_response_bytes.saturating_sub(body.len()) {
                return Err(AssetCreateError::Uncertain);
            }
            body.extend_from_slice(&chunk);
        }
        decode_receipt(&body)
    };
    tokio::time::timeout_at(deadline, work)
        .await
        .map_err(|_| AssetCreateError::Uncertain)?
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "PascalCase")]
struct CreateEnvelope {
    response_metadata: CreateMetadata,
    result: CreateResult,
    error: Option<serde_json::Value>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "PascalCase")]
struct CreateMetadata {
    action: String,
    version: String,
    service: String,
    region: String,
    error: Option<serde_json::Value>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "PascalCase")]
struct CreateResult {
    id: String,
}

fn decode_receipt(body: &[u8]) -> Result<AssetGroupReceipt, AssetCreateError> {
    // Typed fields reject duplicate identity/error/scope fields instead of
    // silently accepting the last occurrence in a generic JSON object.
    let value: CreateEnvelope =
        serde_json::from_slice(body).map_err(|_| AssetCreateError::Uncertain)?;
    let metadata = value.response_metadata;
    if value.error.is_some()
        || metadata.error.is_some()
        || metadata.action != "CreateAssetGroup"
        || metadata.version != "2024-01-01"
        || metadata.service != "ark"
        || metadata.region != "cn-beijing"
    {
        return Err(AssetCreateError::Uncertain);
    }
    let id = value.result.id;
    if !id.starts_with("group-")
        || id.len() <= 6
        || id.len() > 128
        || !id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err(AssetCreateError::Uncertain);
    }
    Ok(AssetGroupReceipt { upstream_id: id })
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        Json, Router,
        extract::Path,
        http::{HeaderMap, StatusCode},
        routing::post,
    };
    use serde_json::json;
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };

    fn response() -> serde_json::Value {
        json!({"ResponseMetadata":{"Action":"CreateAssetGroup","Version":"2024-01-01","Service":"ark","Region":"cn-beijing"},"Result":{"Id":"group-fixture"}})
    }

    #[test]
    fn receipt_requires_correct_action_scope_and_safe_identity() {
        assert_eq!(
            decode_receipt(&serde_json::to_vec(&response()).unwrap())
                .unwrap()
                .upstream_id(),
            "group-fixture"
        );
        for field in ["Action", "Version", "Service", "Region"] {
            let mut value = response();
            value["ResponseMetadata"][field] = json!("wrong");
            assert!(decode_receipt(&serde_json::to_vec(&value).unwrap()).is_err());
        }
        for id in ["", "asset-fixture", "group-", "group-private\nsecret"] {
            let mut value = response();
            value["Result"]["Id"] = json!(id);
            assert!(decode_receipt(&serde_json::to_vec(&value).unwrap()).is_err());
        }
        let mut value = response();
        value["ResponseMetadata"]["Error"] = json!({"Message":"private upstream details"});
        assert_eq!(
            decode_receipt(&serde_json::to_vec(&value).unwrap()).err(),
            Some(AssetCreateError::Uncertain)
        );
    }

    #[test]
    fn duplicate_or_conflicting_fields_cannot_produce_a_receipt() {
        let fixtures = [
            r#"{"ResponseMetadata":{"Action":"Wrong","Action":"CreateAssetGroup","Version":"2024-01-01","Service":"ark","Region":"cn-beijing"},"Result":{"Id":"group-fixture"}}"#,
            r#"{"ResponseMetadata":{"Action":"CreateAssetGroup","Version":"2024-01-01","Service":"ark","Region":"cn-beijing","Error":{"Message":"private"},"Error":null},"Result":{"Id":"group-fixture"}}"#,
            r#"{"ResponseMetadata":{"Action":"CreateAssetGroup","Version":"2024-01-01","Service":"ark","Region":"cn-beijing"},"Result":{"Id":"group-first","Id":"group-second"}}"#,
            r#"{"ResponseMetadata":{"Action":"CreateAssetGroup","Version":"2024-01-01","Service":"ark","Region":"cn-beijing"},"Result":{"Id":"group-fixture"},"Error":{"Message":"private"}}"#,
        ];
        for fixture in fixtures {
            assert_eq!(
                decode_receipt(fixture.as_bytes()).err(),
                Some(AssetCreateError::Uncertain)
            );
        }
    }

    #[tokio::test]
    async fn creation_errors_do_not_replay_or_expose_upstream_details() {
        let calls = Arc::new(AtomicUsize::new(0));
        let observed = calls.clone();
        let app = Router::new().route(
            "/{mode}",
            post(
                move |Path(mode): Path<String>,
                      headers: HeaderMap,
                      Json(body): Json<serde_json::Value>| {
                    let observed = observed.clone();
                    async move {
                        observed.fetch_add(1, Ordering::SeqCst);
                        assert!(
                            headers["authorization"]
                                .to_str()
                                .unwrap()
                                .starts_with("HMAC-SHA256 Credential=AKEXAMPLE/")
                        );
                        assert_eq!(body["GroupType"], "AIGC");
                        assert_eq!(body["ProjectName"], "bound-project");
                        match mode.as_str() {
                            "slow" => {
                                tokio::time::sleep(Duration::from_millis(100)).await;
                                (StatusCode::OK, Json(response()))
                            }
                            "error" => (StatusCode::BAD_GATEWAY, Json(json!({"private":"secret"}))),
                            "malformed" => (StatusCode::OK, Json(json!({"Id":"group-fixture"}))),
                            "large" => (StatusCode::OK, Json(json!({"private":"x".repeat(1024)}))),
                            _ => (StatusCode::OK, Json(response())),
                        }
                    }
                },
            ),
        );
        let redirected = calls.clone();
        let app = app.route(
            "/redirect",
            post(move || {
                let redirected = redirected.clone();
                async move {
                    redirected.fetch_add(1, Ordering::SeqCst);
                    (
                        StatusCode::TEMPORARY_REDIRECT,
                        [("location", "/ok")],
                        "private redirect",
                    )
                }
            }),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        let client = niu_upstream::client_for_endpoint(
            &format!("http://{address}/ok"),
            Duration::from_secs(1),
        )
        .await
        .unwrap();
        let signer = AssetManagementSigner::new(
            "AKEXAMPLE".into(),
            "fixture-secret-not-a-credential".into(),
        )
        .unwrap();
        let request = OrdinaryAssetGroupCreate::new("fixture".into(), None).unwrap();
        for mode in ["ok", "error", "malformed", "large", "slow", "redirect"] {
            let before = calls.load(Ordering::SeqCst);
            let signed = signer
                .sign_create_group("20261007T120000Z", &request, "bound-project")
                .unwrap();
            let result = send_once(
                &client,
                &format!("http://{address}/{mode}"),
                signed,
                512,
                tokio::time::Instant::now() + Duration::from_millis(50),
            )
            .await;
            if mode == "ok" {
                assert_eq!(result.unwrap().upstream_id(), "group-fixture");
            } else {
                assert_eq!(result.err(), Some(AssetCreateError::Uncertain));
            }
            assert_eq!(calls.load(Ordering::SeqCst), before + 1);
        }
        assert_eq!(
            create_group(
                &signer,
                "20261007T120000Z",
                &request,
                "bound-project",
                0,
                Duration::from_secs(1)
            )
            .await
            .err(),
            Some(AssetCreateError::InvalidConfiguration)
        );
        assert_eq!(calls.load(Ordering::SeqCst), 6);
        server.abort();
    }
}
