use std::time::Duration;

use axum::{
    body::{Body, to_bytes},
    extract::State,
    http::{
        HeaderMap, HeaderName, HeaderValue, Method, Request, Response, StatusCode, Uri, header,
    },
    response::IntoResponse,
};
use futures_util::StreamExt;
use serde_json::json;
use tokio::time::Instant;
use uuid::Uuid;

use super::{
    context::SignedRequestContext,
    manifest::route_allows_method,
    runtime::{EnterpriseRuntime, RegisteredRoute},
};
use crate::{error::ApiError, state::AppState};

pub async fn handle(State(state): State<AppState>, request: Request<Body>) -> Response<Body> {
    let mut response = handle_request(state, request).await;
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response
}

async fn handle_request(state: AppState, request: Request<Body>) -> Response<Body> {
    let Some(runtime) = state.enterprise.as_deref() else {
        return ApiError::not_found().into_response();
    };
    let uri = request.uri().clone();
    let Some(route) = runtime.matching_route(uri.path()) else {
        return ApiError::not_found().into_response();
    };
    if !route_allows_method(&route.declaration.methods, request.method()) {
        let allow = route
            .declaration
            .methods
            .iter()
            .map(|method| method.as_str())
            .collect::<Vec<_>>()
            .join(", ");
        let mut response = StatusCode::METHOD_NOT_ALLOWED.into_response();
        if let Ok(value) = HeaderValue::from_str(&allow) {
            response.headers_mut().insert(header::ALLOW, value);
        }
        return response;
    }
    let target = request_target(&uri);
    if target.len() > 2048 {
        return gateway_error(StatusCode::URI_TOO_LONG, "request_target_too_long");
    }

    let Some(token) = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .filter(|value| !value.is_empty())
    else {
        return ApiError::unauthorized().into_response();
    };
    let operator = match state.store.authenticate_operator(token).await {
        Ok(operator) => operator,
        Err(error) => return ApiError::from_store(error).into_response(),
    };
    if !route.declaration.permission.permits(operator.role) {
        return ApiError::forbidden().into_response();
    }

    let limit = route.declaration.max_request_bytes;
    if request
        .headers()
        .get(header::CONTENT_LENGTH)
        .and_then(|length| length.to_str().ok())
        .and_then(|length| length.parse::<usize>().ok())
        .is_some_and(|length| length > limit)
    {
        return gateway_error(StatusCode::PAYLOAD_TOO_LARGE, "request_too_large");
    }
    let (parts, body) = request.into_parts();
    let body = match to_bytes(body, limit).await {
        Ok(body) => body.to_vec(),
        Err(_) => return gateway_error(StatusCode::PAYLOAD_TOO_LARGE, "request_too_large"),
    };
    forward(
        runtime,
        route,
        operator,
        parts.method,
        uri,
        &parts.headers,
        body,
    )
    .await
}

async fn forward(
    runtime: &EnterpriseRuntime,
    route: &RegisteredRoute,
    operator: niu_storage::OperatorPrincipal,
    method: Method,
    uri: Uri,
    client_headers: &HeaderMap,
    body: Vec<u8>,
) -> Response<Body> {
    let module = &runtime.modules[route.module_index];
    if !module.is_healthy().await {
        return gateway_error(StatusCode::SERVICE_UNAVAILABLE, "module_unavailable");
    }
    let request_path = request_target(&uri);
    let request_id = Uuid::new_v4().to_string();
    let context = match runtime.signer.sign(SignedRequestContext {
        audience: &module.declaration.module_id,
        operator,
        permission: route.declaration.permission,
        method: &method,
        path: request_path,
        request_id: &request_id,
        body: &body,
    }) {
        Ok(context) => context,
        Err(()) => {
            return gateway_error(StatusCode::INTERNAL_SERVER_ERROR, "context_signing_failed");
        }
    };

    let upstream_uri = format!("http://niu-module{request_path}");
    let timeout = Duration::from_millis(route.declaration.timeout_ms);
    let deadline = Instant::now() + timeout;
    let mut upstream = module
        .http
        .request(method, upstream_uri)
        .timeout(timeout)
        .header(
            header::AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {context}"))
                .expect("generated JWS is a valid header value"),
        )
        .header("x-request-id", &request_id)
        .body(body);
    for (name, value) in client_headers {
        if should_forward_request_header(name) {
            upstream = upstream.header(name, value);
        }
    }

    let response = match tokio::time::timeout_at(deadline, upstream.send()).await {
        Ok(Ok(response)) => response,
        Ok(Err(error)) => {
            tracing::warn!(module_id = %module.declaration.module_id, error = %error, "Enterprise module request failed");
            if error.is_timeout() {
                return gateway_error(StatusCode::GATEWAY_TIMEOUT, "module_timeout");
            }
            return gateway_error(StatusCode::SERVICE_UNAVAILABLE, "module_unavailable");
        }
        Err(_) => return gateway_error(StatusCode::GATEWAY_TIMEOUT, "module_timeout"),
    };
    let status = response.status();
    let response_headers = response.headers().clone();
    if response
        .content_length()
        .is_some_and(|length| length > route.declaration.max_response_bytes as u64)
    {
        return gateway_error(StatusCode::BAD_GATEWAY, "module_response_too_large");
    }
    let connection_headers = connection_nominated_headers(&response_headers);
    let mut stream = response.bytes_stream();
    let mut response_body = Vec::new();
    loop {
        let chunk = match tokio::time::timeout_at(deadline, stream.next()).await {
            Ok(Some(Ok(chunk))) => chunk,
            Ok(Some(Err(error))) => {
                tracing::warn!(module_id = %module.declaration.module_id, error = %error, "Enterprise module response failed");
                return gateway_error(StatusCode::BAD_GATEWAY, "invalid_module_response");
            }
            Ok(None) => break,
            Err(_) => return gateway_error(StatusCode::GATEWAY_TIMEOUT, "module_timeout"),
        };
        if response_body.len().saturating_add(chunk.len()) > route.declaration.max_response_bytes {
            return gateway_error(StatusCode::BAD_GATEWAY, "module_response_too_large");
        }
        response_body.extend_from_slice(&chunk);
    }
    let mut gateway_response = Response::builder().status(status);
    for (name, value) in &response_headers {
        if should_forward_response_header(name)
            && !connection_headers
                .iter()
                .any(|token| token == name.as_str())
            && name != header::CACHE_CONTROL
        {
            gateway_response = gateway_response.header(name, value);
        }
    }
    gateway_response
        .header("x-request-id", request_id)
        .header(header::CACHE_CONTROL, "no-store")
        .body(Body::from(response_body))
        .unwrap_or_else(|_| gateway_error(StatusCode::BAD_GATEWAY, "invalid_module_response"))
}

fn request_target(uri: &Uri) -> &str {
    uri.path_and_query()
        .map(|value| value.as_str())
        .unwrap_or(uri.path())
}

fn should_forward_request_header(name: &HeaderName) -> bool {
    matches!(
        name.as_str(),
        "accept"
            | "accept-encoding"
            | "accept-language"
            | "content-type"
            | "content-encoding"
            | "idempotency-key"
    )
}

fn should_forward_response_header(name: &HeaderName) -> bool {
    !name.as_str().starts_with("x-niu-")
        && !name.as_str().starts_with("x-forwarded-")
        && !matches!(
            name.as_str(),
            "connection"
                | "keep-alive"
                | "proxy-connection"
                | "proxy-authenticate"
                | "proxy-authorization"
                | "te"
                | "trailer"
                | "transfer-encoding"
                | "upgrade"
                | "content-length"
                | "x-request-id"
        )
}

fn gateway_error(status: StatusCode, code: &'static str) -> Response<Body> {
    let body = serde_json::to_vec(&json!({"error":{"type":"gateway_error","code":code}}))
        .unwrap_or_default();
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::CACHE_CONTROL, "no-store")
        .body(Body::from(body))
        .expect("static gateway error response is valid")
}

fn connection_nominated_headers(headers: &HeaderMap) -> Vec<String> {
    headers
        .get_all(header::CONNECTION)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .flat_map(|value| value.split(','))
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(str::to_ascii_lowercase)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::enterprise::{manifest::ReleaseManifest, runtime::EnterpriseRuntime};
    use axum::body::to_bytes;
    use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
    use ring::signature::{ED25519, Ed25519KeyPair, KeyPair, UnparsedPublicKey};
    use serde_json::json;
    use std::{
        collections::HashMap,
        path::{Path, PathBuf},
        sync::{
            Arc, Mutex,
            atomic::{AtomicU16, Ordering},
        },
    };
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::{UnixListener, UnixStream},
        sync::oneshot,
        task::JoinHandle,
    };
    use uuid::Uuid;

    const COMMIT: &str = "0123456789abcdef0123456789abcdef01234567";

    #[tokio::test]
    async fn unix_socket_forwarding_signs_context_filters_headers_and_caps_response() {
        let socket_path = std::env::temp_dir().join(format!("niu-e-{}.sock", Uuid::new_v4()));
        let (captured, health, stop, server_task) = start_fake_module(&socket_path, 200).await;
        let signing_key = Ed25519KeyPair::from_seed_unchecked(&[7; 32]).unwrap();
        let public_key = signing_key.public_key().as_ref().to_vec();
        let manifest = manifest_for_socket(&socket_path, true);
        let runtime = EnterpriseRuntime::for_test(manifest, &[7; 32], "rotation-2026")
            .await
            .unwrap();
        assert!(runtime.ready().await);

        let operator = niu_storage::OperatorPrincipal {
            id: Uuid::new_v4(),
            role: niu_storage::OperatorRole::Admin,
            scope: niu_storage::OperatorScope {
                organization_id: Uuid::new_v4(),
                project_id: Some(Uuid::new_v4()),
            },
        };
        let uri = Uri::from_static("/enterprise/api/v1/experiments/items?filter=a%2Fb&limit=3");
        let route = runtime.matching_route(uri.path()).unwrap();
        let body = br#"{"payload":"fixture"}"#.to_vec();
        let mut headers = HeaderMap::new();
        headers.insert(
            "authorization",
            HeaderValue::from_static("Bearer client-token"),
        );
        headers.insert("cookie", HeaderValue::from_static("session=private"));
        headers.insert("x-niu-actor", HeaderValue::from_static("attacker"));
        headers.insert("x-forwarded-for", HeaderValue::from_static("203.0.113.7"));
        headers.insert("x-custom", HeaderValue::from_static("not-forwarded"));
        headers.insert("content-type", HeaderValue::from_static("application/json"));
        headers.insert("accept", HeaderValue::from_static("application/json"));
        headers.insert("idempotency-key", HeaderValue::from_static("request-key-1"));

        let response = forward(
            &runtime,
            route,
            operator,
            Method::POST,
            uri,
            &headers,
            body.clone(),
        )
        .await;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()[header::CACHE_CONTROL], "no-store");
        assert_eq!(
            to_bytes(response.into_body(), 4096).await.unwrap().as_ref(),
            b"ok"
        );

        let requests = captured.lock().unwrap().clone();
        let forwarded = requests
            .iter()
            .find(|request| {
                request
                    .path
                    .starts_with("/enterprise/api/v1/experiments/items")
            })
            .unwrap();
        assert_eq!(forwarded.body, body);
        assert_eq!(
            forwarded.path,
            "/enterprise/api/v1/experiments/items?filter=a%2Fb&limit=3"
        );
        assert_eq!(
            forwarded.headers.get("content-type").map(String::as_str),
            Some("application/json")
        );
        assert_eq!(
            forwarded.headers.get("accept").map(String::as_str),
            Some("application/json")
        );
        assert_eq!(
            forwarded.headers.get("idempotency-key").map(String::as_str),
            Some("request-key-1")
        );
        assert!(!forwarded.headers.contains_key("cookie"));
        assert!(!forwarded.headers.contains_key("x-niu-actor"));
        assert!(!forwarded.headers.contains_key("x-forwarded-for"));
        assert!(!forwarded.headers.contains_key("x-custom"));
        let compact = forwarded.headers["authorization"]
            .strip_prefix("Bearer ")
            .unwrap();
        let segments = compact.split('.').collect::<Vec<_>>();
        assert_eq!(segments.len(), 3);
        let jwt_header: serde_json::Value =
            serde_json::from_slice(&URL_SAFE_NO_PAD.decode(segments[0]).unwrap()).unwrap();
        assert_eq!(
            jwt_header,
            json!({"alg":"EdDSA","kid":"rotation-2026","typ":"JWT"})
        );
        let claims: serde_json::Value =
            serde_json::from_slice(&URL_SAFE_NO_PAD.decode(segments[1]).unwrap()).unwrap();
        UnparsedPublicKey::new(&ED25519, &public_key)
            .verify(
                &format!("{}.{}", segments[0], segments[1]).into_bytes(),
                &URL_SAFE_NO_PAD.decode(segments[2]).unwrap(),
            )
            .unwrap();
        assert_eq!(claims["iss"], "https://niu.io");
        assert_eq!(claims["aud"], "experiments");
        assert_eq!(claims["sub"], operator.id.to_string());
        assert_eq!(
            claims["exp"].as_u64().unwrap() - claims["iat"].as_u64().unwrap(),
            60
        );
        assert_eq!(
            claims["niu"]["organization_id"],
            operator.scope.organization_id.to_string()
        );
        assert_eq!(
            claims["niu"]["project_id"],
            operator.scope.project_id.unwrap().to_string()
        );
        assert_eq!(claims["niu"]["role"], "admin");
        assert_eq!(claims["niu"]["permission"], "write");
        assert_eq!(claims["niu"]["method"], "POST");
        assert_eq!(claims["niu"]["path"], forwarded.path);
        assert_eq!(claims["niu"]["body_sha256"], hex_digest(&body));
        assert_eq!(
            claims["niu"]["request_id"],
            forwarded.headers["x-request-id"]
        );

        let oversize_uri = Uri::from_static("/enterprise/api/v1/experiments/reports");
        let oversized = forward(
            &runtime,
            runtime.matching_route(oversize_uri.path()).unwrap(),
            operator,
            Method::GET,
            oversize_uri,
            &HeaderMap::new(),
            Vec::new(),
        )
        .await;
        assert_eq!(oversized.status(), StatusCode::BAD_GATEWAY);
        assert_eq!(oversized.headers()[header::CACHE_CONTROL], "no-store");
        let _ = health;
        let _ = stop.send(());
        server_task.await.unwrap();
        let _ = std::fs::remove_file(socket_path);
    }

    #[tokio::test]
    async fn required_module_recovers_and_routes_resume_after_health_returns() {
        let socket_path = std::env::temp_dir().join(format!("niu-e-{}.sock", Uuid::new_v4()));
        let (captured, health, stop, server_task) = start_fake_module(&socket_path, 503).await;
        let runtime = EnterpriseRuntime::for_test(
            manifest_for_socket(&socket_path, true),
            &[9; 32],
            "test-key",
        )
        .await
        .unwrap();
        assert!(!runtime.ready().await, "required module starts unhealthy");
        let operator = niu_storage::OperatorPrincipal {
            id: Uuid::new_v4(),
            role: niu_storage::OperatorRole::Owner,
            scope: niu_storage::OperatorScope {
                organization_id: Uuid::new_v4(),
                project_id: None,
            },
        };
        let uri = Uri::from_static("/enterprise/api/v1/experiments/runs/1");
        let unavailable = forward(
            &runtime,
            runtime.matching_route(uri.path()).unwrap(),
            operator,
            Method::GET,
            uri.clone(),
            &HeaderMap::new(),
            Vec::new(),
        )
        .await;
        assert_eq!(unavailable.status(), StatusCode::SERVICE_UNAVAILABLE);
        assert!(captured.lock().unwrap().is_empty());

        health.store(200, Ordering::SeqCst);
        assert!(
            runtime.ready().await,
            "readiness follows current service health"
        );
        let recovered = forward(
            &runtime,
            runtime.matching_route(uri.path()).unwrap(),
            operator,
            Method::GET,
            uri,
            &HeaderMap::new(),
            Vec::new(),
        )
        .await;
        assert_eq!(recovered.status(), StatusCode::OK);
        assert_eq!(
            captured.lock().unwrap().len(),
            1,
            "recovered route reaches module"
        );

        let _ = stop.send(());
        server_task.await.unwrap();
        let _ = std::fs::remove_file(socket_path);
    }

    fn manifest_for_socket(path: &Path, required: bool) -> ReleaseManifest {
        serde_json::from_value(json!({
            "contract":"niu.enterprise.release-manifest.v1",
            "niu_core":{"git_commit":COMMIT,"api_version":"0.1.0"},
            "modules":[{
                "module_id":"experiments",
                "module_version":"1.2.3",
                "module_api_version":"niu.enterprise.service.v1",
                "core_api":{"minimum":"0.1.0","maximum_exclusive":"0.2.0"},
                "required":required,
                "socket_path":path.to_string_lossy(),
                "health":{"live_path":"/_niu/enterprise/v1/health/live","ready_path":"/_niu/enterprise/v1/health/ready"},
                "routes":[
                    {"path_prefix":"/enterprise/api/v1/experiments/items","methods":["POST"],"permission":"write","timeout_ms":1000,"max_request_bytes":1024,"max_response_bytes":512},
                    {"path_prefix":"/enterprise/api/v1/experiments/reports","methods":["GET"],"permission":"read","timeout_ms":1000,"max_request_bytes":0,"max_response_bytes":512},
                    {"path_prefix":"/enterprise/api/v1/experiments/runs/{run_id}","methods":["GET"],"permission":"read","timeout_ms":1000,"max_request_bytes":0,"max_response_bytes":1048576}
                ]
            }]
        })).unwrap()
    }

    #[derive(Clone)]
    struct CapturedRequest {
        path: String,
        headers: HashMap<String, String>,
        body: Vec<u8>,
    }

    async fn start_fake_module(
        path: &PathBuf,
        initial_health: u16,
    ) -> (
        Arc<Mutex<Vec<CapturedRequest>>>,
        Arc<AtomicU16>,
        oneshot::Sender<()>,
        JoinHandle<()>,
    ) {
        let _ = std::fs::remove_file(path);
        let listener = UnixListener::bind(path).unwrap();
        let captured = Arc::new(Mutex::new(Vec::new()));
        let task_capture = captured.clone();
        let health = Arc::new(AtomicU16::new(initial_health));
        let task_health = health.clone();
        let (stop, mut stopped) = oneshot::channel();
        let task = tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = &mut stopped => break,
                    accepted = listener.accept() => {
                        let Ok((stream, _)) = accepted else { continue; };
                        let captured = task_capture.clone();
                        let health = task_health.clone();
                        tokio::spawn(async move { serve_fake_request(stream, captured, health).await; });
                    }
                }
            }
        });
        (captured, health, stop, task)
    }

    async fn serve_fake_request(
        mut stream: UnixStream,
        captured: Arc<Mutex<Vec<CapturedRequest>>>,
        health: Arc<AtomicU16>,
    ) {
        let mut bytes = Vec::new();
        let mut scratch = [0_u8; 4096];
        let header_end = loop {
            if let Some(index) = bytes.windows(4).position(|window| window == b"\r\n\r\n") {
                break index;
            }
            let Ok(count) = stream.read(&mut scratch).await else {
                return;
            };
            if count == 0 {
                return;
            }
            bytes.extend_from_slice(&scratch[..count]);
        };
        let header_text = String::from_utf8_lossy(&bytes[..header_end]);
        let mut lines = header_text.split("\r\n");
        let path = lines
            .next()
            .unwrap_or_default()
            .split_whitespace()
            .nth(1)
            .unwrap_or_default()
            .to_owned();
        let mut headers = HashMap::new();
        let mut content_length = 0_usize;
        for line in lines {
            if let Some((name, value)) = line.split_once(':') {
                let name = name.trim().to_ascii_lowercase();
                let value = value.trim().to_owned();
                if name == "content-length" {
                    content_length = value.parse().unwrap_or_default();
                }
                headers.insert(name, value);
            }
        }
        let body_start = header_end + 4;
        while bytes.len() < body_start + content_length {
            let Ok(count) = stream.read(&mut scratch).await else {
                return;
            };
            if count == 0 {
                return;
            }
            bytes.extend_from_slice(&scratch[..count]);
        }
        let body = bytes[body_start..body_start + content_length].to_vec();
        if !path.starts_with("/_niu/enterprise/v1/health/") {
            captured.lock().unwrap().push(CapturedRequest {
                path: path.clone(),
                headers,
                body,
            });
        }
        let overflow = path == "/enterprise/api/v1/experiments/reports";
        let response_body = if overflow {
            vec![b'x'; 2048]
        } else {
            b"ok".to_vec()
        };
        let status = if path.starts_with("/_niu/enterprise/v1/health/") {
            health.load(Ordering::SeqCst)
        } else {
            200
        };
        let reason = match status {
            200 => "OK",
            503 => "Service Unavailable",
            _ => "Error",
        };
        let response = format!(
            "HTTP/1.1 {status} {reason}\r\nContent-Length: {}\r\nConnection: close\r\nContent-Type: application/json\r\n\r\n",
            response_body.len()
        );
        if stream.write_all(response.as_bytes()).await.is_ok() {
            let _ = stream.write_all(&response_body).await;
        }
    }

    fn hex_digest(body: &[u8]) -> String {
        use sha2::{Digest, Sha256};
        Sha256::digest(body)
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect()
    }
}
