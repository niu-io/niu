use super::*;
use axum::http::Method;
use niu_storage::{OperatorAuditActor, OperatorRole, OperatorScope};

const ADMIN: &str = "niu-test-admin-token-that-is-long-1234";
const MASTER: &str = "vendor-test-master-secret-at-least-32-characters";

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn key_creation_uses_active_database_and_static_models(pool: PgPool) {
    let mut state = test_state(None, pool);
    state.vendor_cipher = Some(Arc::new(
        crate::vendors::crypto::CredentialCipher::new(MASTER).unwrap(),
    ));
    let scope = state.store.default_workspace().await.unwrap();
    let app = router(state);
    let key_path = format!(
        "/admin/v1/organizations/{}/projects/{}/keys",
        scope.organization_id, scope.project_id
    );
    let key_input =
        |alias: &str| json!({"name":"client", "allowed_models":[alias], "ttl_seconds":3600});
    assert_eq!(
        call(&app, Method::POST, &key_path, ADMIN, key_input("fast"))
            .await
            .0,
        StatusCode::CREATED
    );
    let (status, vendor) = call(&app, Method::POST, "/admin/v1/vendors", ADMIN,
        json!({"name":"Managed", "adapter":"openrouter", "api_base":"https://openrouter.ai/api/v1", "api_key":"test-vendor-credential"})).await;
    assert_eq!(status, StatusCode::CREATED);
    let id = vendor["data"]["id"].as_str().unwrap();
    let model_path = format!("/admin/v1/vendors/{id}/models");
    for (alias, enabled) in [("managed-only", true), ("disabled", false), ("fast", false)] {
        assert_eq!(
            call(
                &app,
                Method::POST,
                &model_path,
                ADMIN,
                json!({"alias":alias, "upstream_model":"maker/model", "enabled":enabled})
            )
            .await
            .0,
            StatusCode::OK
        );
    }
    let (status, key) = call(
        &app,
        Method::POST,
        &key_path,
        ADMIN,
        key_input("managed-only"),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let (status, models) = call(
        &app,
        Method::GET,
        "/v1/models",
        key["token"].as_str().unwrap(),
        Value::Null,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(models["data"][0]["id"], "managed-only");
    // Disabled database aliases shadow static routes for new grants too.
    for alias in ["disabled", "fast", "missing"] {
        assert_eq!(
            call(&app, Method::POST, &key_path, ADMIN, key_input(alias))
                .await
                .0,
            StatusCode::BAD_REQUEST
        );
    }
    assert_eq!(call(&app, Method::PUT, &format!("/admin/v1/vendors/{id}"), ADMIN,
        json!({"name":"Managed", "api_base":"https://openrouter.ai/api/v1", "enabled":false, "expected_revision":vendor["data"]["revision"]})).await.0, StatusCode::OK);
    assert_eq!(
        call(
            &app,
            Method::POST,
            &key_path,
            ADMIN,
            key_input("managed-only")
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
}

async fn call(
    app: &Router,
    method: Method,
    path: &str,
    token: &str,
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
    if path.starts_with("/admin/") || path.starts_with("/v1/") {
        assert_eq!(response.headers()["cache-control"], "no-store");
    }
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (status, serde_json::from_slice(&bytes).unwrap())
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn vendor_management_persists_and_controls_new_inference_requests(pool: PgPool) {
    let captured = Captured::default();
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let api_base = format!("http://{}/api/v1", listener.local_addr().unwrap());
    let upstream = Router::new()
        .route("/api/v1/chat/completions", post(provider))
        .with_state(captured.clone());
    let server = tokio::spawn(async move {
        axum::serve(listener, upstream).await.unwrap();
    });
    let mut state = test_state(None, pool.clone());
    state.vendor_cipher = Some(Arc::new(
        crate::vendors::crypto::CredentialCipher::new(MASTER).unwrap(),
    ));
    let scope = state.store.default_workspace().await.unwrap();
    let key = state
        .store
        .issue_key(scope, "vendor-client", &["fast".into()], 3600)
        .await
        .unwrap();
    let operator = state
        .store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: None,
            },
            "owner",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let app = router(state.clone());
    let create = json!({"name":"OpenRouter","adapter":"openrouter","api_base":api_base,"api_key":"vendor-test-first-secret","enabled":true});
    for token in ["invalid", &operator.token] {
        let (status, _) = call(
            &app,
            Method::POST,
            "/admin/v1/vendors",
            token,
            create.clone(),
        )
        .await;
        assert!(matches!(
            status,
            StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN
        ));
    }
    let (status, vendor) = call(&app, Method::POST, "/admin/v1/vendors", ADMIN, create).await;
    assert_eq!(status, StatusCode::CREATED);
    assert!(!vendor.to_string().contains("secret"));
    assert_eq!(vendor["data"]["has_credential"], true);
    let id = vendor["data"]["id"].as_str().unwrap();
    let model_path = format!("/admin/v1/vendors/{id}/models");
    let mapping = json!({"alias":"fast","upstream_model":"maker/first","public_catalog":true,"enabled":true,"capabilities":{}});
    assert_eq!(
        call(&app, Method::POST, &model_path, ADMIN, mapping.clone())
            .await
            .0,
        StatusCode::OK
    );
    assert_eq!(
        call(&app, Method::POST, &model_path, ADMIN, mapping)
            .await
            .0,
        StatusCode::CONFLICT
    );
    let chat = json!({"model":"fast","messages":[{"role":"user","content":"hello"}]});
    assert_eq!(
        call(
            &app,
            Method::POST,
            "/v1/chat/completions",
            &key.token,
            chat.clone()
        )
        .await
        .0,
        StatusCode::OK
    );
    {
        let capture = captured.0.lock().unwrap();
        let (headers, body) = capture.as_ref().unwrap();
        assert_eq!(headers["authorization"], "Bearer vendor-test-first-secret");
        assert_eq!(body["model"], "maker/first");
    }
    let route = state.store.vendor_route("fast").await.unwrap().unwrap();
    assert!(
        !route
            .credential_ciphertext
            .windows(b"vendor-test-first-secret".len())
            .any(|v| v == b"vendor-test-first-secret")
    );
    let vendor_path = format!("/admin/v1/vendors/{id}");
    let revision = vendor["data"]["revision"].as_i64().unwrap();
    let update = json!({"name":"OpenRouter","api_base":api_base,"enabled":true,"expected_revision":revision,"api_key":"vendor-test-rotated-secret"});
    let (status, updated) = call(&app, Method::PUT, &vendor_path, ADMIN, update.clone()).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        call(&app, Method::PUT, &vendor_path, ADMIN, update).await.0,
        StatusCode::CONFLICT
    );
    // Reconstruct all process-local state; the route and rotated credential survive.
    let mut restarted = test_state(None, pool.clone());
    restarted.vendor_cipher = Some(Arc::new(
        crate::vendors::crypto::CredentialCipher::new(MASTER).unwrap(),
    ));
    let app = router(restarted);
    assert_eq!(
        call(
            &app,
            Method::POST,
            "/v1/chat/completions",
            &key.token,
            chat.clone()
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_eq!(
        captured.0.lock().unwrap().as_ref().unwrap().0["authorization"],
        "Bearer vendor-test-rotated-secret"
    );
    let (_, mappings) = call(&app, Method::GET, &model_path, ADMIN, Value::Null).await;
    let changed_model = json!({"alias":"fast","upstream_model":"maker/second","public_catalog":true,"enabled":true,"capabilities":{},"expected_revision":mappings["data"][0]["revision"]});
    assert_eq!(
        call(
            &app,
            Method::POST,
            &model_path,
            ADMIN,
            changed_model.clone()
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_eq!(
        call(&app, Method::POST, &model_path, ADMIN, changed_model)
            .await
            .0,
        StatusCode::CONFLICT
    );
    assert_eq!(
        call(
            &app,
            Method::POST,
            "/v1/chat/completions",
            &key.token,
            chat.clone()
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_eq!(
        captured.0.lock().unwrap().as_ref().unwrap().1["model"],
        "maker/second"
    );
    let disabled = json!({"name":"OpenRouter","api_base":api_base,"enabled":false,"expected_revision":updated["data"]["revision"]});
    assert_eq!(
        call(&app, Method::PUT, &vendor_path, ADMIN, disabled)
            .await
            .0,
        StatusCode::OK
    );
    // The disabled DB alias must not revive the static `fast` route.
    assert_eq!(
        call(&app, Method::POST, "/v1/chat/completions", &key.token, chat)
            .await
            .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        call(&app, Method::GET, "/v1/models", &key.token, Value::Null)
            .await
            .1["data"],
        json!([])
    );
    assert_eq!(
        call(&app, Method::GET, "/catalog/v1/models", "", Value::Null)
            .await
            .1["data"],
        json!([])
    );
    assert_eq!(
        call(
            &app,
            Method::GET,
            "/admin/v1/vendors",
            &operator.token,
            Value::Null
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        call(&app, Method::GET, &model_path, &operator.token, Value::Null)
            .await
            .0,
        StatusCode::FORBIDDEN
    );
    server.abort();
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn metadata_updates_preserve_exact_prices_without_browser_roundtripping(pool: PgPool) {
    let mut state = test_state(None, pool);
    state.vendor_cipher = Some(Arc::new(
        crate::vendors::crypto::CredentialCipher::new(MASTER).unwrap(),
    ));
    let app = router(state);
    let (status, vendor) = call(&app, Method::POST, "/admin/v1/vendors", ADMIN,
        json!({"name":"Priced","adapter":"openrouter","api_base":"https://openrouter.ai/api/v1","api_key":"test-price-key"})).await;
    assert_eq!(status, StatusCode::CREATED);
    let path = format!(
        "/admin/v1/vendors/{}/models",
        vendor["data"]["id"].as_str().unwrap()
    );
    let pricing = json!({"currency":"USD","api_prompt_rate":9_007_199_254_740_993_i64,"api_completion_rate":0,"cash_prompt_rate":0,"cash_completion_rate":0,"max_input_tokens":1,"max_output_tokens":1});
    let (status, created) = call(
        &app,
        Method::POST,
        &path,
        ADMIN,
        json!({"alias":"priced","upstream_model":"maker/model","pricing":pricing}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let (status, updated) = call(&app, Method::POST, &path, ADMIN, json!({"alias":"priced","upstream_model":"maker/updated","expected_revision":created["data"]["revision"]})).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(updated["data"]["pricing"], pricing);
    let (status, cleared) = call(&app, Method::POST, &path, ADMIN, json!({"alias":"priced","upstream_model":"maker/updated","expected_revision":updated["data"]["revision"],"pricing":null})).await;
    assert_eq!(status, StatusCode::OK);
    assert!(cleared["data"]["pricing"].is_null());
}

#[derive(Clone, Default)]
struct CatalogFixture {
    response: Arc<Mutex<Option<(StatusCode, Value, Option<String>)>>>,
    authorization: Arc<Mutex<Option<String>>>,
    redirect_hits: Arc<std::sync::atomic::AtomicUsize>,
}

async fn fixture_model_catalog(
    State(fixture): State<CatalogFixture>,
    headers: HeaderMap,
) -> axum::response::Response {
    *fixture.authorization.lock().unwrap() = headers
        .get("authorization")
        .and_then(|header| header.to_str().ok())
        .map(str::to_owned);
    let (status, body, location) = fixture.response.lock().unwrap().clone().unwrap_or((
        StatusCode::OK,
        json!({"data":[]}),
        None,
    ));
    let mut response = axum::response::Response::builder()
        .status(status)
        .header("content-type", "application/json");
    if let Some(location) = location {
        response = response.header("location", location);
    }
    response
        .body(axum::body::Body::from(body.to_string()))
        .unwrap()
}

async fn fixture_redirect_target(State(fixture): State<CatalogFixture>) -> Json<Value> {
    fixture
        .redirect_hits
        .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    Json(json!({"data":[]}))
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn provider_model_check_is_bounded_sanitized_and_does_not_follow_redirects(pool: PgPool) {
    let fixture = CatalogFixture::default();
    *fixture.response.lock().unwrap() = Some((
        StatusCode::OK,
        json!({"data":[{"id":"maker/model","name":"Fixture model","context_length":8192,"api_key":"private-provider-data"}],"extra":"not returned"}),
        None,
    ));
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let upstream = Router::new()
        .route("/api/v1/models", axum::routing::get(fixture_model_catalog))
        .route(
            "/redirect-target",
            axum::routing::get(fixture_redirect_target),
        )
        .with_state(fixture.clone());
    let server = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });

    let mut state = test_state(None, pool);
    state.vendor_cipher = Some(Arc::new(
        crate::vendors::crypto::CredentialCipher::new(MASTER).unwrap(),
    ));
    let app = router(state);
    let (status, vendor) = call(
        &app,
        Method::POST,
        "/admin/v1/vendors",
        ADMIN,
        json!({
            "name":"Fixture",
            "adapter":"openrouter",
            "api_base":format!("http://{address}/api/v1"),
            "api_key":"vendor-check-secret"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let vendor_id = vendor["data"]["id"].as_str().unwrap();
    let catalog_path = format!("/admin/v1/vendors/{vendor_id}/catalog");
    assert_eq!(
        call(&app, Method::GET, &catalog_path, "invalid", Value::Null)
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
    let (status, catalog) = call(&app, Method::GET, &catalog_path, ADMIN, Value::Null).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(catalog["data"][0]["id"], "maker/model");
    assert_eq!(catalog["data"][0]["name"], "Fixture model");
    assert_eq!(catalog["data"][0]["context_length"], 8192);
    assert!(!catalog.to_string().contains("private-provider-data"));
    assert!(!catalog.to_string().contains("not returned"));
    assert_eq!(
        fixture.authorization.lock().unwrap().as_deref(),
        Some("Bearer vendor-check-secret")
    );
    let models_path = format!("/admin/v1/vendors/{vendor_id}/models");
    assert_eq!(
        call(
            &app,
            Method::POST,
            &models_path,
            ADMIN,
            json!({"alias":"fast","upstream_model":"maker/model","capabilities":{}}),
        )
        .await
        .0,
        StatusCode::OK
    );
    let check_path = format!("/admin/v1/vendors/{vendor_id}/check");
    let (status, result) = call(
        &app,
        Method::POST,
        &check_path,
        ADMIN,
        json!({"alias":"fast"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(result["data"]["status"], "connected");
    assert_eq!(result["data"]["model"], "listed");
    assert_eq!(
        fixture.authorization.lock().unwrap().as_deref(),
        Some("Bearer vendor-check-secret")
    );
    assert!(!result.to_string().contains("vendor-check-secret"));

    *fixture.response.lock().unwrap() = Some((
        StatusCode::OK,
        json!({"data":[],"extra":"x".repeat(3 * 1024 * 1024)}),
        None,
    ));
    let (status, oversized) = call(
        &app,
        Method::POST,
        &check_path,
        ADMIN,
        json!({"alias":"fast"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(oversized["data"]["status"], "model_catalog_too_large");
    assert!(!oversized.to_string().contains('x'));

    *fixture.response.lock().unwrap() = Some((
        StatusCode::UNAUTHORIZED,
        json!({"error":{"message":"private provider response body"}}),
        None,
    ));
    let (status, rejected) = call(
        &app,
        Method::POST,
        &check_path,
        ADMIN,
        json!({"alias":"fast"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(rejected["data"]["status"], "credentials_rejected");
    assert!(
        !rejected
            .to_string()
            .contains("private provider response body")
    );

    *fixture.response.lock().unwrap() = Some((
        StatusCode::FOUND,
        json!({"error":"redirect"}),
        Some(format!("http://{address}/redirect-target")),
    ));
    let (status, redirected) = call(
        &app,
        Method::POST,
        &check_path,
        ADMIN,
        json!({"alias":"fast"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(redirected["data"]["status"], "redirect_blocked");
    assert_eq!(
        fixture
            .redirect_hits
            .load(std::sync::atomic::Ordering::Relaxed),
        0
    );
    server.abort();
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn private_provider_destination_is_rejected_before_creating_an_operation(pool: PgPool) {
    let state = test_state(Some("https://10.0.0.1/v1".into()), pool.clone());
    let organization = state
        .store
        .create_organization("private endpoint")
        .await
        .unwrap();
    let scope = state
        .store
        .create_project(organization, "private endpoint")
        .await
        .unwrap();
    let key = state
        .store
        .issue_key(scope, "client", &["fast".into()], 3600)
        .await
        .unwrap();
    let response = router(state.clone())
        .oneshot(
            Request::post("/v1/chat/completions")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({"model":"fast","messages":[{"role":"user","content":"hello"}]})
                        .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    assert!(!response.headers().contains_key("x-niu-attempt-id"));
    assert_eq!(state.requests.load(std::sync::atomic::Ordering::Relaxed), 0);
    let operations: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM operations WHERE organization_id=$1 AND project_id=$2",
    )
    .bind(scope.organization_id)
    .bind(scope.project_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(operations, 0);
}
