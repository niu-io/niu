use std::{
    collections::HashMap,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
};

use axum::{
    body::{Body, to_bytes},
    http::{Request, StatusCode, header},
};
use serde_json::json;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{UnixListener, UnixStream},
    sync::oneshot,
    task::JoinHandle,
};
use tower::ServiceExt;
use uuid::Uuid;

use super::{EnterpriseRuntime, manifest::ReleaseManifest, proxy::handle};
use crate::{
    config::AppConfig,
    state::{AppState, TokenSet},
};

const COMMIT: &str = "0123456789abcdef0123456789abcdef01234567";
const INSTALLATION_TOKEN: &str = "niu-installation-bootstrap-token-with-entropy-0001";

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn module_route_requires_scoped_operator_session_and_permission(pool: sqlx::PgPool) {
    let socket_path = std::env::temp_dir().join(format!("niu-e-{}.sock", Uuid::new_v4()));
    let (reached, stop, module_task) = start_fake_module(&socket_path).await;
    let manifest: ReleaseManifest = serde_json::from_value(json!({
        "contract":"niu.enterprise.release-manifest.v1",
        "niu_core":{"git_commit":COMMIT,"api_version":"0.1.0"},
        "modules":[{
            "module_id":"experiments",
            "module_version":"1.2.3",
            "module_api_version":"niu.enterprise.service.v1",
            "core_api":{"minimum":"0.1.0","maximum_exclusive":"0.2.0"},
            "required":true,
            "socket_path":socket_path.to_string_lossy(),
            "health":{"live_path":"/_niu/enterprise/v1/health/live","ready_path":"/_niu/enterprise/v1/health/ready"},
            "routes":[{"path_prefix":"/enterprise/api/v1/experiments/items","methods":["POST"],"permission":"write","timeout_ms":1000,"max_request_bytes":1024,"max_response_bytes":512}]
        }]
    }))
    .unwrap();
    let runtime = Arc::new(
        EnterpriseRuntime::for_test(manifest, &[21; 32], "postgres-test")
            .await
            .unwrap(),
    );

    let config: AppConfig = toml::from_str(
        r#"
            [models.test]
            provider = "openai"
            upstream_model = "test-model"
            api_key_env = "TEST_KEY"
        "#,
    )
    .unwrap();
    let installation_tokens =
        TokenSet::parse("NIU_ADMIN_TOKENS", INSTALLATION_TOKEN.into()).unwrap();
    let store = niu_storage::Store::from_pool(pool.clone());
    let mut state = AppState::new(
        config,
        store,
        installation_tokens,
        reqwest::Client::new(),
        HashMap::new(),
    );
    state.enterprise = Some(runtime);

    let organization_id = state
        .store
        .create_organization("enterprise gateway test")
        .await
        .unwrap();
    let scope = state
        .store
        .create_project(organization_id, "scoped project")
        .await
        .unwrap();
    let operator_scope = niu_storage::OperatorScope {
        organization_id: scope.organization_id,
        project_id: Some(scope.project_id),
    };
    let owner = state
        .store
        .create_operator(
            operator_scope,
            "project owner",
            niu_storage::OperatorRole::Owner,
            3600,
            niu_storage::OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let viewer = state
        .store
        .create_operator(
            operator_scope,
            "project viewer",
            niu_storage::OperatorRole::Viewer,
            3600,
            niu_storage::OperatorAuditActor::Installation,
        )
        .await
        .unwrap();

    let route = "/enterprise/api/v1/experiments/items?source=project%2Fscope";
    let invalid = send_request(
        &state,
        route,
        "invalid-operator-session-token",
        b"{}".to_vec(),
    )
    .await;
    assert_eq!(invalid.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(invalid.headers()[header::CACHE_CONTROL], "no-store");

    let bootstrap = send_request(&state, route, INSTALLATION_TOKEN, b"{}".to_vec()).await;
    assert_eq!(bootstrap.status(), StatusCode::UNAUTHORIZED);

    let denied = send_request(&state, route, &viewer.token, b"{}".to_vec()).await;
    assert_eq!(denied.status(), StatusCode::FORBIDDEN);
    assert_eq!(denied.headers()[header::CACHE_CONTROL], "no-store");
    assert_eq!(reached.load(Ordering::SeqCst), 0);

    let accepted = send_request(&state, route, &owner.token, br#"{"ok":true}"#.to_vec()).await;
    assert_eq!(accepted.status(), StatusCode::OK);
    assert_eq!(accepted.headers()[header::CACHE_CONTROL], "no-store");
    assert_eq!(
        to_bytes(accepted.into_body(), 4096).await.unwrap().as_ref(),
        b"module-ok"
    );
    assert_eq!(
        reached.load(Ordering::SeqCst),
        1,
        "valid project-scoped operator session reaches the module"
    );

    let app = crate::web::router(state.clone());
    let response = app
        .clone()
        .oneshot(
            Request::get("/enterprise/readyz")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    pool.close().await;
    let response = app
        .clone()
        .oneshot(
            Request::get("/enterprise/readyz")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(
        response.status(),
        StatusCode::SERVICE_UNAVAILABLE,
        "healthy modules cannot mask a failed core database"
    );
    assert_eq!(response.headers()[header::CACHE_CONTROL], "no-store");
    let response = app
        .oneshot(Request::get("/healthz").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let _ = stop.send(());
    module_task.await.unwrap();
    let _ = std::fs::remove_file(socket_path);
}

async fn send_request(
    state: &AppState,
    target: &str,
    token: &str,
    body: Vec<u8>,
) -> axum::response::Response<Body> {
    let request = Request::post(target)
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(body))
        .unwrap();
    handle(axum::extract::State(state.clone()), request).await
}

async fn start_fake_module(
    path: &std::path::Path,
) -> (Arc<AtomicUsize>, oneshot::Sender<()>, JoinHandle<()>) {
    let _ = std::fs::remove_file(path);
    let listener = UnixListener::bind(path).unwrap();
    let reached = Arc::new(AtomicUsize::new(0));
    let task_reached = reached.clone();
    let (stop, mut stopped) = oneshot::channel();
    let task = tokio::spawn(async move {
        loop {
            tokio::select! {
                _ = &mut stopped => break,
                accepted = listener.accept() => {
                    let Ok((stream, _)) = accepted else { continue; };
                    let reached = task_reached.clone();
                    tokio::spawn(async move { serve_fake_request(stream, reached).await; });
                }
            }
        }
    });
    (reached, stop, task)
}

async fn serve_fake_request(mut stream: UnixStream, reached: Arc<AtomicUsize>) {
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
    let request_line = lines.next().unwrap_or_default();
    let method = request_line
        .split_whitespace()
        .next()
        .unwrap_or_default()
        .to_owned();
    let path = request_line
        .split_whitespace()
        .nth(1)
        .unwrap_or_default()
        .to_owned();
    let mut content_length = 0_usize;
    for line in lines {
        if let Some((name, value)) = line.split_once(':')
            && name.trim().eq_ignore_ascii_case("content-length")
        {
            content_length = value.trim().parse().unwrap_or_default();
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
    let is_health = path.starts_with("/_niu/enterprise/v1/health/");
    let (status, reason, response_body) = if is_health {
        (200, "OK", Vec::new())
    } else if method == "POST" && path.starts_with("/enterprise/api/v1/experiments/items") {
        reached.fetch_add(1, Ordering::SeqCst);
        (200, "OK", b"module-ok".to_vec())
    } else {
        (404, "Not Found", Vec::new())
    };
    let response = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Length: {}\r\nConnection: close\r\nContent-Type: application/octet-stream\r\n\r\n",
        response_body.len()
    );
    if stream.write_all(response.as_bytes()).await.is_ok() {
        let _ = stream.write_all(&response_body).await;
    }
}
