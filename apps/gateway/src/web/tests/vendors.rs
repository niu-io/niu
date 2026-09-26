use super::*;
use axum::http::Method;
use niu_storage::{OperatorAuditActor, OperatorRole, OperatorScope};

const ADMIN: &str = "niu-test-admin-token-that-is-long-1234";
const MASTER: &str = "vendor-test-master-secret-at-least-32-characters";

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
