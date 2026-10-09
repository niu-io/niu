use super::*;
use axum::response::{IntoResponse, Response};
use niu_storage::{CodexConnectionInput, StoreError};
const ALIAS: &str = "codex/test-codex-model";

async fn seed(state: &AppState, scope: niu_storage::TenantScope, name: &str) -> Uuid {
    let id = Uuid::new_v4();
    let credentials = crate::codex::Credentials {
        access_token: format!("fixture-{name}"),
        refresh_token: "fixture-refresh".into(),
        id_token: "fixture-id-token".into(),
        scope: "offline_access resource.invoke chatgpt.tokens.use.direct".into(),
        expires_at: crate::codex::now() + 3600,
        earliest_refresh_at: None,
    };
    let ciphertext = crate::codex::encrypt(state, id, &credentials).unwrap();
    state
        .store
        .save_codex_connection(
            scope,
            CodexConnectionInput {
                id,
                name,
                subject: name,
                client_id: &format!("oaiapp_fixture_{name}"),
                credential_ciphertext: &ciphertext,
                models: &json!([{ "slug":"test-codex-model","display_name":"Codex test model" }]),
            },
            false,
        )
        .await
        .unwrap();
    id
}
async fn fixture_provider(
    State(capture): State<Captured>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Response {
    let input = body
        .pointer("/input/0/content")
        .and_then(Value::as_str)
        .unwrap_or("");
    let event = match input {
        "interrupt" => json!({"type":"response.output_text.delta","delta":"unfinished"}),
        "limit" => {
            json!({"type":"response.failed","response":{"object":"response","status":"failed","error":{"code":"subscription_sharing_usage_limit_exceeded"}}})
        }
        _ => json!({"type":"response.completed","response":{
            "id":"resp_fixture","object":"response","status":"completed","model":"test-codex-model",
            "output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"Hello from the subscription fixture"}]}],
            "usage":{"input_tokens":4,"output_tokens":2,"total_tokens":6},
            "cost_details":{"upstream_inference_cost":0.5}
        }}),
    };
    *capture.0.lock().unwrap() = Some((headers, body));
    (
        [("content-type", "text/event-stream")],
        format!("event: message\r\ndata: {event}\r\n\r\n"),
    )
        .into_response()
}
async fn call(
    app: &Router,
    token: &str,
    method: &str,
    path: &str,
    body: Value,
) -> (StatusCode, Value) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(method)
                .uri(path)
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}
async fn state(pool: PgPool) -> (AppState, Captured, tokio::task::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}/v1", listener.local_addr().unwrap());
    let capture = Captured::default();
    let upstream = Router::new()
        .route("/v1/responses", post(fixture_provider))
        .with_state(capture.clone());
    let server = tokio::spawn(async move {
        axum::serve(listener, upstream).await.unwrap();
    });
    let mut state = test_state(None, pool);
    state.vendor_cipher = Some(Arc::new(
        crate::vendors::crypto::CredentialCipher::new(
            "codex-fixture-master-key-at-least-32-characters",
        )
        .unwrap(),
    ));
    let mut runtime = crate::codex::Runtime::default();
    runtime.inference_base = Some(base);
    state.codex = Arc::new(runtime);
    (state, capture, server)
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn private_codex_dispatch_is_scoped_encrypted_and_buffers_terminal_usage(pool: PgPool) {
    let (state, capture, server) = state(pool.clone()).await;
    let org = state.store.create_organization("Codex test").await.unwrap();
    let scope = state
        .store
        .create_project(org, "Private workspace")
        .await
        .unwrap();
    let other = state
        .store
        .create_project(org, "Other workspace")
        .await
        .unwrap();
    let id = seed(&state, scope, "first").await;
    let key = state
        .store
        .issue_key(scope, "Private key", &[ALIAS.into()], 3600)
        .await
        .unwrap();
    let foreign = state
        .store
        .issue_key(other, "Other key", &[ALIAS.into()], 3600)
        .await
        .unwrap();
    let app = router(state.clone());
    let (status, models) = call(&app, &key.token, "GET", "/v1/models", Value::Null).await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        models["data"]
            .as_array()
            .unwrap()
            .iter()
            .any(|m| m["id"] == ALIAS)
    );
    let (_, models) = call(&app, &foreign.token, "GET", "/v1/models", Value::Null).await;
    assert!(!models.to_string().contains(ALIAS));
    let (status, response) = call(
        &app,
        &foreign.token,
        "POST",
        "/v1/responses",
        json!({"model":ALIAS,"input":"hello"}),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert!(!response.to_string().contains("fixture-"));
    assert!(capture.0.lock().unwrap().is_none());
    let (status, response) = call(
        &app,
        &key.token,
        "POST",
        "/v1/responses",
        json!({"model":ALIAS,"input":"hello"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(response["model"], ALIAS);
    assert_eq!(response["usage"]["total_tokens"], 6);
    assert!(response.get("cost_details").is_none());
    let (headers, request) = capture.0.lock().unwrap().clone().unwrap();
    assert_eq!(headers["authorization"], "Bearer fixture-first");
    assert_eq!(request["model"], "test-codex-model");
    assert_eq!(request["stream"], true);
    assert_eq!(request["store"], false);
    assert!(request["input"].is_array());
    let view = state.store.codex_connections(scope).await.unwrap();
    assert!(!view[0].busy);
    assert!(
        !serde_json::to_string(&view)
            .unwrap()
            .contains("fixture-first")
    );
    let secret = state
        .store
        .codex_connection_secret(scope, id)
        .await
        .unwrap();
    assert!(
        !secret
            .credential_ciphertext
            .windows(13)
            .any(|window| window == b"fixture-first")
    );
    let (status, chat) = call(
        &app,
        &key.token,
        "POST",
        "/v1/chat/completions",
        json!({"model":ALIAS,"messages":[{"role":"user","content":"hello"}],"stream":false}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        chat["choices"][0]["message"]["content"],
        "Hello from the subscription fixture"
    );
    let (status, _) = call(
        &app,
        &key.token,
        "POST",
        "/v1/chat/completions",
        json!({"model":ALIAS,"messages":[{"role":"user","content":"hello"}],"temperature":0.5}),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_IMPLEMENTED);
    let path = format!(
        "/admin/v1/organizations/{org}/projects/{}/codex-connections",
        scope.project_id
    );
    let (status, view) = call(&app, &key.token, "GET", &path, Value::Null).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert!(view["data"].is_null());
    let (status, view) = call(
        &app,
        "niu-test-admin-token-that-is-long-1234",
        "GET",
        &path,
        Value::Null,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(!view.to_string().contains("credential"));
    assert!(!view.to_string().contains("oaiapp_"));
    let (status, start) = call(
        &app,
        "niu-test-admin-token-that-is-long-1234",
        "POST",
        &format!("{path}/sign-in"),
        json!({"name":"Second account","callback_origin":"http://127.0.0.1:2566"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let auth = url::Url::parse(start["data"]["authorization_url"].as_str().unwrap()).unwrap();
    let query: HashMap<_, _> = auth.query_pairs().into_owned().collect();
    assert_eq!(query["client_id"], "dynamic_agent_client");
    assert_eq!(query["redirect_uri"], "http://127.0.0.1:2566/auth/callback");
    assert_eq!(query["code_challenge_method"], "S256");
    assert!(query["scope"].contains("chatgpt.tokens.use.direct"));
    let host = state.store.codex_host_id().await.unwrap();
    assert_eq!(query["ext_agent_host_id"], format!("urn:uuid:{host}"));
    assert_eq!(state.store.codex_host_id().await.unwrap(), host);
    let response = app
        .clone()
        .oneshot(
            Request::get(format!(
                "/auth/callback?state={}&error=access_denied",
                query["state"]
            ))
            .body(axum::body::Body::empty())
            .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(response.headers()["location"], "/suppliers?codex=cancelled");
    assert_eq!(response.headers()["cache-control"], "no-store");
    assert_eq!(response.headers()["referrer-policy"], "no-referrer");
    let replay = app
        .clone()
        .oneshot(
            Request::get(format!(
                "/auth/callback?state={}&error=access_denied",
                query["state"]
            ))
            .body(axum::body::Body::empty())
            .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(replay.status(), StatusCode::BAD_REQUEST);
    server.abort();
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn private_codex_pool_preserves_uncertainty_and_selects_other_accounts(pool: PgPool) {
    let (state, _, server) = state(pool.clone()).await;
    let org = state
        .store
        .create_organization("Codex pool test")
        .await
        .unwrap();
    let scope = state
        .store
        .create_project(org, "Private pool")
        .await
        .unwrap();
    seed(&state, scope, "first").await;
    seed(&state, scope, "second").await;
    let key = state
        .store
        .issue_key(scope, "Pool key", &[ALIAS.into()], 3600)
        .await
        .unwrap();
    let app = router(state.clone());
    let (status, _) = call(
        &app,
        &key.token,
        "POST",
        "/v1/responses",
        json!({"model":ALIAS,"input":"interrupt"}),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_GATEWAY);
    let view = state.store.codex_connections(scope).await.unwrap();
    assert_eq!(view.iter().filter(|a| a.busy).count(), 1);
    let reopened = niu_storage::Store::from_pool(pool.clone());
    assert_eq!(
        reopened
            .codex_connections(scope)
            .await
            .unwrap()
            .iter()
            .filter(|a| a.busy)
            .count(),
        1
    );
    let (status, _) = call(
        &app,
        &key.token,
        "POST",
        "/v1/responses",
        json!({"model":ALIAS,"input":"hello"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let (status, _) = call(
        &app,
        &key.token,
        "POST",
        "/v1/responses",
        json!({"model":ALIAS,"input":"limit"}),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_GATEWAY);
    let view = reopened.codex_connections(scope).await.unwrap();
    assert_eq!(view.iter().filter(|a| a.busy).count(), 1);
    assert_eq!(view.iter().filter(|a| a.health == "cooldown").count(), 1);
    let (status, _) = call(
        &app,
        &key.token,
        "POST",
        "/v1/responses",
        json!({"model":ALIAS,"input":"hello"}),
    )
    .await;
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
    server.abort();
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn private_codex_leases_are_atomic_and_pause_does_not_clear_them(pool: PgPool) {
    let (state, _, server) = state(pool).await;
    let org = state
        .store
        .create_organization("Codex lease test")
        .await
        .unwrap();
    let scope = state
        .store
        .create_project(org, "Private pool")
        .await
        .unwrap();
    let foreign = state.store.create_project(org, "Foreign").await.unwrap();
    let id = seed(&state, scope, "only").await;
    let (left, right) = tokio::join!(
        state
            .store
            .claim_codex_connection(scope, "test-codex-model", Uuid::new_v4()),
        state
            .store
            .claim_codex_connection(scope, "test-codex-model", Uuid::new_v4())
    );
    assert_ne!(left.is_ok(), right.is_ok());
    assert!(matches!(
        left.err().or_else(|| right.err()),
        Some(StoreError::AccountUnavailable)
    ));
    assert!(
        state
            .store
            .codex_connection_secret(foreign, id)
            .await
            .is_err()
    );
    assert!(
        state
            .store
            .set_codex_connection_enabled(foreign, id, false)
            .await
            .is_err()
    );
    assert!(
        state
            .store
            .finish_codex_lease(scope, id, Uuid::new_v4(), "ready", 0)
            .await
            .is_err()
    );
    state
        .store
        .set_codex_connection_enabled(scope, id, false)
        .await
        .unwrap();
    state
        .store
        .set_codex_connection_enabled(scope, id, true)
        .await
        .unwrap();
    assert!(state.store.codex_connections(scope).await.unwrap()[0].busy);
    assert!(
        state
            .store
            .claim_codex_connection(scope, "test-codex-model", Uuid::new_v4())
            .await
            .is_err()
    );
    server.abort();
}
