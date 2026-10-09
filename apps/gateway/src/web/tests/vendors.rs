use super::*;
use axum::http::Method;
use niu_storage::{OperatorAuditActor, OperatorRole, OperatorScope};

const ADMIN: &str = "niu-test-admin-token-that-is-long-1234";
const MASTER: &str = "vendor-test-master-secret-at-least-32-characters";

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn supplier_keys_dispatch_independent_model_subsets_after_rotation_and_reload(pool: PgPool) {
    let mut endpoints = Vec::new();
    let mut captures = Vec::new();
    let mut servers = Vec::new();
    for _ in 0..2 {
        let captured = Captured::default();
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        endpoints.push(format!("http://{}/v1", listener.local_addr().unwrap()));
        let upstream = Router::new()
            .route("/v1/chat/completions", post(provider))
            .with_state(captured.clone());
        captures.push(captured);
        servers.push(tokio::spawn(async move {
            axum::serve(listener, upstream).await.unwrap();
        }));
    }
    let make_state = || {
        let mut state = test_state(None, pool.clone());
        state.vendor_cipher = Some(Arc::new(
            crate::vendors::crypto::CredentialCipher::new(MASTER).unwrap(),
        ));
        state
    };
    let state = make_state();
    let store = state.store.clone();
    let app = router(state);
    let (status, first) = call(&app, Method::POST, "/admin/v1/vendors", ADMIN,
        json!({"name":"Independent Supplier", "adapter":"openai", "api_base":endpoints[0], "api_key":"fixture-primary-key", "create_supplier":true})).await;
    assert_eq!(status, StatusCode::CREATED);
    let first_id: Uuid = first["data"]["id"].as_str().unwrap().parse().unwrap();
    let supplier = store.vendor_supplier(first_id).await.unwrap().unwrap();
    let supplier_id = supplier["id"].as_str().unwrap();
    let (status, second) = call(&app, Method::POST, "/admin/v1/vendors", ADMIN,
        json!({"name":"Restricted key", "adapter":"openai", "api_base":endpoints[1], "api_key":"fixture-restricted-key", "supplier_id":supplier_id})).await;
    assert_eq!(status, StatusCode::CREATED);
    let second_id: Uuid = second["data"]["id"].as_str().unwrap().parse().unwrap();
    let routes = [
        (first_id, "independent-a", "maker/a", 0),
        (first_id, "independent-b", "maker/b", 0),
        (second_id, "restricted-c", "maker/c", 1),
    ];
    for (id, alias, upstream_model, _) in routes {
        let (status, _) = call(&app, Method::POST,
            &format!("/admin/v1/vendors/{id}/models"), ADMIN,
            json!({"alias":alias,"upstream_model":upstream_model,"enabled":true,"public_catalog":true,"capabilities":{}})).await;
        assert_eq!(status, StatusCode::OK);
    }
    let first_mappings =
        serde_json::to_value(store.vendor_models(first_id).await.unwrap()).unwrap();
    let second_mappings =
        serde_json::to_value(store.vendor_models(second_id).await.unwrap()).unwrap();
    let second_metadata = serde_json::to_value(store.vendor(second_id).await.unwrap()).unwrap();
    let second_ciphertext = store.vendor_credential_ciphertext(second_id).await.unwrap();
    let scope = store.default_workspace().await.unwrap();
    let mut key = store
        .issue_key(
            scope,
            "Independent Supplier client",
            &routes
                .iter()
                .map(|(_, alias, _, _)| (*alias).to_owned())
                .collect::<Vec<_>>(),
            3600,
        )
        .await
        .unwrap();
    for (phase, secret) in [(0, "fixture-primary-key"), (1, "fixture-rotated-key")] {
        if phase == 1 {
            let (status, _) = call(&app, Method::PUT,
                &format!("/admin/v1/vendors/{first_id}"), ADMIN,
                json!({"name":"Independent Supplier","api_base":endpoints[0],"api_key":secret,"enabled":true,"expected_revision":first["data"]["revision"]})).await;
            assert_eq!(status, StatusCode::OK);
            // A stale editor cannot replace the rotated credential or disable
            // this key; neither action may affect the other Supplier key.
            let (status, _) = call(&app, Method::PUT,
                &format!("/admin/v1/vendors/{first_id}"), ADMIN,
                json!({"name":"Stale update","api_base":endpoints[0],"api_key":"fixture-stale-key","enabled":false,"expected_revision":first["data"]["revision"]})).await;
            assert_eq!(status, StatusCode::CONFLICT);
            assert_eq!(
                serde_json::to_value(store.vendor_models(first_id).await.unwrap()).unwrap(),
                first_mappings
            );
            assert_eq!(
                serde_json::to_value(store.vendor_models(second_id).await.unwrap()).unwrap(),
                second_mappings
            );
            assert_eq!(
                serde_json::to_value(store.vendor(second_id).await.unwrap()).unwrap(),
                second_metadata
            );
            assert_eq!(
                store.vendor_credential_ciphertext(second_id).await.unwrap(),
                second_ciphertext
            );
        }
        // Rebuild process-local state: stored ownership, mappings and encrypted keys survive.
        let reloaded = router(make_state());
        for (_, alias, upstream_model, index) in routes {
            for capture in &captures {
                *capture.0.lock().unwrap() = None;
            }
            let (status, body) = call(
                &reloaded,
                Method::POST,
                "/v1/chat/completions",
                &key.token,
                json!({"model":alias,"messages":[{"role":"user","content":"hello"}]}),
            )
            .await;
            assert_eq!(status, StatusCode::OK);
            assert_eq!(body["model"], alias);
            let captured = captures[index].0.lock().unwrap();
            let (headers, request) = captured.as_ref().unwrap();
            assert_eq!(
                headers["authorization"],
                format!(
                    "Bearer {}",
                    if index == 0 {
                        secret
                    } else {
                        "fixture-restricted-key"
                    }
                )
            );
            assert_eq!(request["model"], upstream_model);
            assert!(captures[1 - index].0.lock().unwrap().is_none());
        }
    }
    let original_key_id = key.id;
    let original_token = key.token.clone();
    let before = store.list_keys(scope).await.unwrap();
    let (status, replacement) = call(
        &app,
        Method::POST,
        &format!(
            "/admin/v1/organizations/{}/projects/{}/keys/{}/rotate",
            scope.organization_id, scope.project_id, key.id
        ),
        ADMIN,
        json!({}),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    key = niu_storage::IssuedKey {
        id: replacement["id"].as_str().unwrap().parse().unwrap(),
        token: replacement["token"].as_str().unwrap().to_owned(),
    };
    let after = store.list_keys(scope).await.unwrap();
    let inherited = after.iter().find(|entry| entry.id == key.id).unwrap();
    let previous = before
        .iter()
        .find(|entry| entry.id == original_key_id)
        .unwrap();
    assert_eq!(inherited.name, previous.name);
    assert_eq!(inherited.allowed_models, previous.allowed_models);
    assert_eq!(inherited.expires_at_ms, previous.expires_at_ms);
    assert!(
        after
            .iter()
            .find(|entry| entry.id == original_key_id)
            .unwrap()
            .revoked
    );
    let reloaded = router(make_state());
    let attempts_before: i64 = sqlx::query_scalar("SELECT count(*) FROM attempts")
        .fetch_one(&pool)
        .await
        .unwrap();
    for capture in &captures {
        *capture.0.lock().unwrap() = None;
    }
    assert_eq!(
        call(
            &reloaded,
            Method::GET,
            "/v1/models",
            &original_token,
            Value::Null
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        call(
            &reloaded,
            Method::POST,
            "/v1/chat/completions",
            &original_token,
            json!({"model":"independent-a","messages":[{"role":"user","content":"hello"}]})
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    assert!(
        captures
            .iter()
            .all(|capture| capture.0.lock().unwrap().is_none())
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM attempts")
            .fetch_one(&pool)
            .await
            .unwrap(),
        attempts_before
    );
    let (_, granted) = call(
        &reloaded,
        Method::GET,
        "/v1/models",
        &key.token,
        Value::Null,
    )
    .await;
    assert_eq!(granted["data"].as_array().unwrap().len(), 3);
    assert_eq!(
        call(
            &reloaded,
            Method::POST,
            "/v1/chat/completions",
            &key.token,
            json!({"model":"fast","messages":[{"role":"user","content":"hello"}]})
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    assert!(
        captures
            .iter()
            .all(|capture| capture.0.lock().unwrap().is_none())
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM attempts")
            .fetch_one(&pool)
            .await
            .unwrap(),
        attempts_before
    );

    let current = store.vendor(first_id).await.unwrap().unwrap();
    assert_eq!(call(&app, Method::PUT, &format!("/admin/v1/vendors/{first_id}"), ADMIN,
        json!({"name":current.name,"api_base":current.api_base,"enabled":false,"expected_revision":current.revision})).await.0, StatusCode::OK);
    let reloaded = router(make_state());
    for capture in &captures {
        *capture.0.lock().unwrap() = None;
    }
    for alias in ["independent-a", "independent-b"] {
        assert_eq!(
            call(
                &reloaded,
                Method::POST,
                "/v1/chat/completions",
                &key.token,
                json!({"model":alias,"messages":[{"role":"user","content":"hello"}]})
            )
            .await
            .0,
            StatusCode::NOT_FOUND
        );
    }
    assert!(
        captures
            .iter()
            .all(|capture| capture.0.lock().unwrap().is_none())
    );
    assert_eq!(
        call(
            &reloaded,
            Method::POST,
            "/v1/chat/completions",
            &key.token,
            json!({"model":"restricted-c","messages":[{"role":"user","content":"hello"}]})
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_eq!(
        captures[1].0.lock().unwrap().as_ref().unwrap().0["authorization"],
        "Bearer fixture-restricted-key"
    );
    assert_eq!(store.vendor_models(first_id).await.unwrap().len(), 2);
    assert_eq!(store.vendor_models(second_id).await.unwrap().len(), 1);
    assert_eq!(
        store.vendor_supplier(second_id).await.unwrap().unwrap(),
        supplier
    );
    let (_, models) = call(
        &reloaded,
        Method::GET,
        "/v1/models",
        &key.token,
        Value::Null,
    )
    .await;
    assert_eq!(models["data"].as_array().unwrap().len(), 1);
    assert_eq!(models["data"][0]["id"], "restricted-c");
    // Re-enabling without supplying a secret retains the rotated credential
    // and restores only this key's routes after process-local state is rebuilt.
    let disabled = store.vendor(first_id).await.unwrap().unwrap();
    assert_eq!(call(&app, Method::PUT, &format!("/admin/v1/vendors/{first_id}"), ADMIN,
        json!({"name":disabled.name,"api_base":disabled.api_base,"enabled":true,"expected_revision":disabled.revision})).await.0, StatusCode::OK);
    let reloaded = router(make_state());
    for (_, alias, upstream_model, index) in routes {
        for capture in &captures {
            *capture.0.lock().unwrap() = None;
        }
        assert_eq!(
            call(
                &reloaded,
                Method::POST,
                "/v1/chat/completions",
                &key.token,
                json!({"model":alias,"messages":[{"role":"user","content":"hello"}]})
            )
            .await
            .0,
            StatusCode::OK
        );
        let captured = captures[index].0.lock().unwrap();
        let (headers, request) = captured.as_ref().unwrap();
        assert_eq!(
            headers["authorization"],
            if index == 0 {
                "Bearer fixture-rotated-key"
            } else {
                "Bearer fixture-restricted-key"
            }
        );
        assert_eq!(request["model"], upstream_model);
        assert!(captures[1 - index].0.lock().unwrap().is_none());
    }
    let (_, models) = call(
        &reloaded,
        Method::GET,
        "/v1/models",
        &key.token,
        Value::Null,
    )
    .await;
    assert_eq!(models["data"].as_array().unwrap().len(), 3);
    assert_eq!(
        store.vendor_supplier(first_id).await.unwrap().unwrap(),
        supplier
    );
    let revoke_path = format!(
        "/admin/v1/organizations/{}/projects/{}/keys/{}",
        scope.organization_id, scope.project_id, key.id
    );
    assert_eq!(
        call(&app, Method::DELETE, &revoke_path, ADMIN, Value::Null)
            .await
            .0,
        StatusCode::NO_CONTENT
    );
    let reloaded = router(make_state());
    for capture in &captures {
        *capture.0.lock().unwrap() = None;
    }
    let attempts_before: i64 = sqlx::query_scalar("SELECT count(*) FROM attempts")
        .fetch_one(&pool)
        .await
        .unwrap();
    for token in [&original_token, &key.token] {
        assert_eq!(
            call(&reloaded, Method::GET, "/v1/models", token, Value::Null)
                .await
                .0,
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            call(
                &reloaded,
                Method::POST,
                "/v1/chat/completions",
                token,
                json!({"model":"restricted-c","messages":[{"role":"user","content":"hello"}]})
            )
            .await
            .0,
            StatusCode::UNAUTHORIZED
        );
    }
    assert!(
        captures
            .iter()
            .all(|capture| capture.0.lock().unwrap().is_none())
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM attempts")
            .fetch_one(&pool)
            .await
            .unwrap(),
        attempts_before
    );
    for server in servers {
        server.abort();
    }
}

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
    let (status, workspace_key) = call(
        &app,
        Method::POST,
        &key_path,
        ADMIN,
        json!({"name":"all workspace models", "ttl_seconds":3600}),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let (status, all_models) = call(
        &app,
        Method::GET,
        "/v1/models",
        workspace_key["token"].as_str().unwrap(),
        Value::Null,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(all_models["data"][0]["id"], "managed-only");
    assert_eq!(all_models["data"].as_array().unwrap().len(), 1);
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
    (
        status,
        if bytes.is_empty() {
            Value::Null
        } else {
            serde_json::from_slice(&bytes).unwrap()
        },
    )
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
    let mapping = json!({"alias":"fast","upstream_model":"maker/first","public_catalog":true,"enabled":true,"capabilities":{"catalog":{"name":"Friendly model", "description":"Descriptive metadata", "input_price":"0.12345", "output_price":"0.54321"}}});
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
    for (path, auth) in [
        ("/catalog/v1/models", ""),
        ("/admin/v1/models", ADMIN),
        ("/admin/v1/models", operator.token.as_str()),
    ] {
        let (status, catalog) = call(&app, Method::GET, path, auth, Value::Null).await;
        assert_eq!(status, StatusCode::OK);
        let model = catalog["data"]
            .as_array()
            .unwrap()
            .iter()
            .find(|model| model["id"] == "fast")
            .unwrap();
        assert_eq!(model["catalog"]["name"], "Friendly model");
        assert!(model["catalog"].get("input_price").is_none());
        assert!(model["catalog"].get("output_price").is_none());
        assert!(!model.to_string().contains("0.12345"));
    }
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

type CatalogFixtureResponse = Option<(StatusCode, Value, Option<String>)>;

#[derive(Clone, Default)]
struct CatalogFixture {
    response: Arc<Mutex<CatalogFixtureResponse>>,
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

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn supplier_configuration_association_requires_installation_access(pool: PgPool) {
    let state = test_state(None, pool);
    let vendor = state
        .store
        .create_vendor(niu_storage::VendorInput {
            id: Uuid::new_v4(),
            name: "Configured API".into(),
            adapter: "openrouter".into(),
            api_base: "https://openrouter.ai/api/v1".into(),
            enabled: true,
            credential_ciphertext: vec![0xa5; 48],
        })
        .await
        .unwrap();
    let supplier = state
        .store
        .create_provider_business("Agreed business")
        .await
        .unwrap();
    let scope = state.store.default_workspace().await.unwrap();
    let key = state
        .store
        .issue_key(scope, "Customer", &["fast".into()], 3600)
        .await
        .unwrap();
    state
        .store
        .create_vendor(niu_storage::VendorInput {
            id: Uuid::new_v4(),
            name: "Unassociated API".into(),
            adapter: "openrouter".into(),
            api_base: "https://openrouter.ai/api/v1".into(),
            enabled: true,
            credential_ciphertext: vec![0xa5; 48],
        })
        .await
        .unwrap();
    let member = state
        .store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: None,
            },
            "Supplier manager",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    state
        .store
        .set_provider_member(supplier, member.operator_id, "manager", true)
        .await
        .unwrap();
    let app = router(state.clone());
    let path = format!("/admin/v1/vendors/{}/supplier", vendor.id);
    let body = json!({"supplier_id":supplier,"expected_revision":vendor.revision});
    for token in ["invalid", key.token.as_str()] {
        assert_eq!(
            call(&app, Method::PUT, &path, token, body.clone()).await.0,
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            call(&app, Method::GET, &path, token, json!({})).await.0,
            StatusCode::UNAUTHORIZED
        );
    }
    for method in [Method::GET, Method::PUT] {
        assert_eq!(
            call(&app, method, &path, &member.token, body.clone())
                .await
                .0,
            StatusCode::FORBIDDEN
        );
    }
    let dashboard = format!("/admin/v1/providers/{supplier}/dashboard");
    assert_eq!(
        call(&app, Method::GET, &dashboard, &member.token, json!({}))
            .await
            .0,
        StatusCode::OK
    );
    let foreign_supplier = state
        .store
        .create_provider_business("Foreign business")
        .await
        .unwrap();
    let foreign_dashboard = format!("/admin/v1/providers/{foreign_supplier}/dashboard");
    assert_eq!(
        call(
            &app,
            Method::GET,
            &foreign_dashboard,
            &member.token,
            json!({})
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    let filtered_member = format!("/admin/v1/vendors?supplier={supplier}");
    assert_eq!(
        call(
            &app,
            Method::GET,
            &filtered_member,
            &member.token,
            json!({})
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    assert!(
        state
            .store
            .vendor_supplier(vendor.id)
            .await
            .unwrap()
            .is_none()
    );
    assert_eq!(
        call(&app, Method::PUT, &path, ADMIN, body).await.0,
        StatusCode::NO_CONTENT
    );
    let (status, result) = call(&app, Method::GET, &path, ADMIN, json!({})).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(result["data"]["name"], "Agreed business");
    assert_eq!(result["data"].as_object().unwrap().len(), 2);
    let filtered = format!("/admin/v1/vendors?supplier={supplier}");
    let (status, own) = call(&app, Method::GET, &filtered, ADMIN, json!({})).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(own["data"].as_array().unwrap().len(), 1);
    assert_eq!(own["data"][0]["id"], vendor.id.to_string());
    assert!(own["data"][0].get("credential_ciphertext").is_none());
    let unknown = format!("/admin/v1/vendors?supplier={}", Uuid::new_v4());
    assert_eq!(
        call(&app, Method::GET, &unknown, ADMIN, json!({})).await.1["data"],
        json!([])
    );
    assert_eq!(
        call(&app, Method::GET, &filtered, &key.token, json!({}))
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn supplier_creation_http_is_atomic_and_legacy_compatible(pool: PgPool) {
    let mut state = test_state(None, pool);
    state.vendor_cipher = Some(Arc::new(
        crate::vendors::crypto::CredentialCipher::new(MASTER).unwrap(),
    ));
    let store = state.store.clone();
    let app = router(state);
    let input = json!({"name":"Supplier setup", "adapter":"openrouter", "api_base":"https://openrouter.ai/api/v1", "api_key":"fixture-key", "create_supplier":true});
    assert_eq!(
        call(
            &app,
            Method::POST,
            "/admin/v1/vendors",
            "invalid",
            input.clone()
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    let (status, response) = call(
        &app,
        Method::POST,
        "/admin/v1/vendors",
        ADMIN,
        input.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    assert!(response["data"].get("api_key").is_none());
    assert!(response["data"].get("credential_ciphertext").is_none());
    let id: Uuid = response["data"]["id"].as_str().unwrap().parse().unwrap();
    assert_eq!(
        store.vendor_supplier(id).await.unwrap().unwrap()["name"],
        "Supplier setup"
    );
    let owner = store.vendor_supplier(id).await.unwrap().unwrap();
    let supplier: Uuid = owner["id"].as_str().unwrap().parse().unwrap();
    let (second_status, second) = call(&app, Method::POST, "/admin/v1/vendors", ADMIN,
        json!({"name":"Supplier second key", "adapter":"openai", "api_base":"https://api.openai.com/v1", "api_key":"second-fixture-key", "supplier_id":supplier})).await;
    assert_eq!(second_status, StatusCode::CREATED);
    assert!(second["data"].get("api_key").is_none());
    let second_id: Uuid = second["data"]["id"].as_str().unwrap().parse().unwrap();
    assert_eq!(
        store.vendor_supplier(second_id).await.unwrap().unwrap()["id"],
        owner["id"]
    );
    assert_eq!(store.supplier_vendors(supplier).await.unwrap().len(), 2);
    let (list_status, listed) = call(
        &app,
        Method::GET,
        &format!("/admin/v1/vendors?supplier={supplier}"),
        ADMIN,
        Value::Null,
    )
    .await;
    assert_eq!(list_status, StatusCode::OK);
    assert_eq!(listed["data"].as_array().unwrap().len(), 2);
    for configuration in listed["data"].as_array().unwrap() {
        assert_eq!(configuration["supplier"], owner);
        assert!(configuration.get("api_key").is_none());
        assert!(configuration.get("credential_ciphertext").is_none());
    }
    let mut contradictory = input.clone();
    contradictory["supplier_id"] = json!(supplier);
    assert_eq!(
        call(
            &app,
            Method::POST,
            "/admin/v1/vendors",
            ADMIN,
            contradictory
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        call(&app, Method::POST, "/admin/v1/vendors", ADMIN, input)
            .await
            .0,
        StatusCode::CONFLICT
    );
    let (status, legacy) = call(&app, Method::POST, "/admin/v1/vendors", ADMIN,
        json!({"name":"Legacy setup", "adapter":"openrouter", "api_base":"https://openrouter.ai/api/v1", "api_key":"fixture-key"})).await;
    assert_eq!(status, StatusCode::CREATED);
    let id: Uuid = legacy["data"]["id"].as_str().unwrap().parse().unwrap();
    assert!(store.vendor_supplier(id).await.unwrap().is_none());
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn personal_gateway_inference_is_owner_scoped_and_never_debits_prepaid(pool: PgPool) {
    let captured = Captured::default();
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let api_base = format!("http://{}/v1", listener.local_addr().unwrap());
    let upstream = Router::new()
        .route("/v1/chat/completions", post(provider))
        .with_state(captured.clone());
    let server = tokio::spawn(async move {
        axum::serve(listener, upstream).await.unwrap();
    });
    let mut state = test_state(None, pool.clone());
    state.vendor_cipher = Some(Arc::new(
        crate::vendors::crypto::CredentialCipher::new(MASTER).unwrap(),
    ));
    let store = state.store.clone();
    let scope = store.default_prepaid_workspace().await.unwrap();
    let app = router(state.clone());
    let (status, vendor) = call(&app, Method::POST, "/admin/v1/vendors", ADMIN,
        json!({"name":"Personal test key","adapter":"openai","api_base":api_base,"api_key":"personal-fixture-secret","enabled":true})).await;
    assert_eq!(status, StatusCode::CREATED);
    let vendor_id: Uuid = vendor["data"]["id"].as_str().unwrap().parse().unwrap();
    let (status, _) = call(&app, Method::POST, &format!("/admin/v1/vendors/{vendor_id}/models"), ADMIN,
        json!({"alias":"fast","upstream_model":"personal-upstream","enabled":true,"public_catalog":true,"capabilities":{}})).await;
    assert_eq!(status, StatusCode::OK);
    let revision: i64 = sqlx::query_scalar("SELECT revision FROM vendors WHERE id=$1")
        .bind(vendor_id)
        .fetch_one(&pool)
        .await
        .unwrap();
    let owner_path = format!("/admin/v1/vendors/{vendor_id}/personal-owner");
    let owner_input = json!({"organization_id":scope.organization_id,"expected_revision":revision});
    let operator = store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: None,
            },
            "Account owner",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    assert_eq!(
        call(
            &app,
            Method::PUT,
            &owner_path,
            "invalid",
            owner_input.clone()
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        call(
            &app,
            Method::PUT,
            &owner_path,
            &operator.token,
            owner_input.clone()
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        call(
            &app,
            Method::PUT,
            &owner_path,
            ADMIN,
            json!({"organization_id":scope.organization_id,"expected_revision":revision+1})
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    for _ in 0..2 {
        let (status, assigned) =
            call(&app, Method::PUT, &owner_path, ADMIN, owner_input.clone()).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(assigned, json!({"assigned":true}));
    }
    assert_eq!(
        call(
            &app,
            Method::PUT,
            &owner_path,
            ADMIN,
            json!({"organization_id":Uuid::new_v4(),"expected_revision":revision})
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    for (token, path, visible) in [
        (ADMIN, "/admin/v1/models".to_owned(), false),
        (
            ADMIN,
            format!("/admin/v1/models?organization_id={}", scope.organization_id),
            true,
        ),
        (operator.token.as_str(), "/admin/v1/models".to_owned(), true),
    ] {
        let (status, listed) = call(&app, Method::GET, &path, token, Value::Null).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(
            listed["data"]
                .as_array()
                .unwrap()
                .iter()
                .any(|model| model["id"] == "fast"),
            visible
        );
        if token != ADMIN {
            assert!(!listed.to_string().contains("personal-upstream"));
            assert!(!listed.to_string().contains("personal-fixture-secret"));
        }
    }
    assert_eq!(
        call(
            &app,
            Method::GET,
            &format!("/admin/v1/models?organization_id={}", Uuid::new_v4()),
            &operator.token,
            Value::Null
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    // A preexisting retail tariff must not label personally funded models.
    store
        .publish_customer_tariff(
            scope,
            &niu_storage::ProviderOfferInput {
                model_alias: "fast".into(),
                currency: "USD".into(),
                prompt_rate: "100000000".into(),
                completion_rate: "200000000".into(),
                expected_revision: None,
            },
        )
        .await
        .unwrap();
    let key = store
        .issue_key(scope, "Personal client", &["fast".into()], 3600)
        .await
        .unwrap();
    let (status, models) = call(&app, Method::GET, "/v1/models", &key.token, Value::Null).await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        models["data"]
            .as_array()
            .unwrap()
            .iter()
            .any(|model| model["id"] == "fast")
    );
    assert!(
        models["data"]
            .as_array()
            .unwrap()
            .iter()
            .find(|model| model["id"] == "fast")
            .unwrap()["customer_pricing"]
            .is_null()
    );
    let request =
        json!({"model":"fast","messages":[{"role":"user","content":"hello"}],"max_tokens":8});
    let (status, response) = call(
        &app,
        Method::POST,
        "/v1/chat/completions",
        &key.token,
        request.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{response}");
    assert_eq!(response["choices"][0]["message"]["content"], "ok");
    let (headers, body) = captured.0.lock().unwrap().take().unwrap();
    assert_eq!(headers["authorization"], "Bearer personal-fixture-secret");
    assert_eq!(body["model"], "personal-upstream");
    for (path, body) in [
        (
            "/v1/responses",
            json!({"model":"fast","input":"hello","max_output_tokens":8}),
        ),
        ("/v1/embeddings", json!({"model":"fast","input":"hello"})),
    ] {
        let (status, error) = call(&app, Method::POST, path, &key.token, body).await;
        assert_eq!(status, StatusCode::NOT_IMPLEMENTED, "{path}: {error}");
        assert!(captured.0.lock().unwrap().is_none());
    }
    let prepared: i64 =
        sqlx::query_scalar("SELECT count(*) FROM attempts WHERE organization_id=$1")
            .bind(scope.organization_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        prepared, 1,
        "unsupported protocols must not prepare personal attempts"
    );

    let organization = store
        .create_prepaid_organization("Foreign account", "USD")
        .await
        .unwrap();
    let foreign = store
        .create_project(organization, "Foreign workspace")
        .await
        .unwrap();
    let foreign_key = store
        .issue_key(foreign, "Foreign client", &["fast".into()], 3600)
        .await
        .unwrap();
    let (status, models) = call(
        &app,
        Method::GET,
        "/v1/models",
        &foreign_key.token,
        Value::Null,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        !models["data"]
            .as_array()
            .unwrap()
            .iter()
            .any(|model| model["id"] == "fast")
    );
    assert_ne!(
        call(
            &app,
            Method::POST,
            "/v1/chat/completions",
            &foreign_key.token,
            request
        )
        .await
        .0,
        StatusCode::OK
    );
    assert!(captured.0.lock().unwrap().is_none());
    state.gateway_writes.shutdown().await;
    let usage: (String, i64, i64) = sqlx::query_as(
        "SELECT execution,prompt_tokens,completion_tokens FROM attempts WHERE organization_id=$1",
    )
    .bind(scope.organization_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(usage, ("confirmed_completed".into(), 2, 1));
    let activity = store
        .gateway_activity(scope, None, 100, &Default::default())
        .await
        .unwrap();
    assert_eq!(activity.len(), 1);
    assert_eq!(activity[0].customer_charge_status, "owner_funded");
    assert!(activity[0].customer_charge_nanos.is_none());
    let summary = store
        .gateway_activity_summary(scope, &Default::default())
        .await
        .unwrap();
    assert_eq!(summary.unpriced_request_count, 0);
    assert_eq!(summary.owner_funded_request_count, 1);
    assert_eq!(summary.charges_by_model[0]["owner_funded_requests"], 1);
    assert_eq!(summary.charges_by_key[0]["owner_funded_requests"], 1);
    assert_eq!(summary.unresolved_customer_charge_count, 0);
    let exported = store
        .gateway_activity_export(scope, &Default::default())
        .await
        .unwrap();
    assert_eq!(exported[0].customer_charge_status, "owner_funded");
    let session_id = Uuid::new_v4();
    let personal_result = json!({"model":"fast","attemptId":activity[0].attempt_id,"content":"Fixture","phase":"complete","elapsedMs":1,"customerChargeStatus":"charged","customerChargeNanos":"999999999999","customerChargeCurrency":"EUR"});
    store.save_chat_session(scope, "personal-owner", session_id, &json!({"id":session_id,"prompt":"Personal fixture","createdAt":1,"results":[personal_result.clone()],"turns":[{"prompt":"Follow-up fixture","results":[personal_result]}]})).await.unwrap();
    let restored = store.chat_sessions(scope, "personal-owner").await.unwrap();
    for result in [
        &restored[0]["results"][0],
        &restored[0]["turns"][0]["results"][0],
    ] {
        assert_eq!(result["customerChargeStatus"], "owner_funded");
        assert!(result["customerChargeNanos"].is_null());
        assert!(result["customerChargeCurrency"].is_null());
    }

    for table in [
        "customer_balance_entries",
        "customer_balance_reservations",
        "customer_attempt_tariffs",
        "provider_attempt_offers",
    ] {
        let count: i64 = sqlx::query_scalar(&format!("SELECT count(*) FROM {table}"))
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 0, "{table}");
    }
    let current = store.vendor(vendor_id).await.unwrap().unwrap();
    let (status, updated) = call(&app, Method::PUT, &format!("/admin/v1/vendors/{vendor_id}"), ADMIN,
        json!({"name":current.name,"api_base":current.api_base,"enabled":current.enabled,"expected_revision":current.revision})).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(updated["data"]["owner_funded"], true);
    server.abort();
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn personal_gateway_inference_supports_opt_in_responses_and_embeddings(pool: PgPool) {
    let captured = Captured::default();
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let api_base = format!("http://{}/v1", listener.local_addr().unwrap());
    let upstream = Router::new()
        .route("/v1/responses", post(responses_provider))
        .route("/v1/embeddings", post(embedding_provider))
        .with_state(captured.clone());
    let server = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
    let mut state = test_state(None, pool.clone());
    state.vendor_cipher = Some(Arc::new(
        crate::vendors::crypto::CredentialCipher::new(MASTER).unwrap(),
    ));
    let store = state.store.clone();
    let scope = store.default_prepaid_workspace().await.unwrap();
    let app = router(state.clone());
    let (status, vendor) = call(&app, Method::POST, "/admin/v1/vendors", ADMIN,
        json!({"name":"Personal protocol fixture","adapter":"openai","api_base":api_base,"api_key":"personal-protocol-secret","enabled":true})).await;
    assert_eq!(status, StatusCode::CREATED);
    let vendor_id: Uuid = vendor["data"]["id"].as_str().unwrap().parse().unwrap();
    for (alias, capabilities) in [
        ("personal-responses", json!({"supports_responses":true})),
        ("personal-embeddings", json!({"supports_embeddings":true})),
    ] {
        let (status, _) = call(&app, Method::POST, &format!("/admin/v1/vendors/{vendor_id}/models"), ADMIN,
            json!({"alias":alias,"upstream_model":"provider-secret-model","enabled":true,"capabilities":capabilities})).await;
        assert_eq!(status, StatusCode::OK);
    }
    let revision: i64 = sqlx::query_scalar("SELECT revision FROM vendors WHERE id=$1")
        .bind(vendor_id)
        .fetch_one(&pool)
        .await
        .unwrap();
    store
        .assign_personal_vendor_owner(vendor_id, scope.organization_id, revision)
        .await
        .unwrap();
    let key = store
        .issue_key(
            scope,
            "Protocol client",
            &["personal-responses".into(), "personal-embeddings".into()],
            3600,
        )
        .await
        .unwrap();
    for (path, alias, body) in [
        (
            "/v1/responses",
            "personal-responses",
            json!({"model":"personal-responses","input":"hello","max_output_tokens":8}),
        ),
        (
            "/v1/embeddings",
            "personal-embeddings",
            json!({"model":"personal-embeddings","input":"hello"}),
        ),
    ] {
        let (status, response) = call(&app, Method::POST, path, &key.token, body).await;
        assert_eq!(status, StatusCode::OK, "{path}: {response}");
        assert_eq!(response["model"], alias);
        let (headers, forwarded) = captured.0.lock().unwrap().take().unwrap();
        assert_eq!(headers["authorization"], "Bearer personal-protocol-secret");
        assert_eq!(forwarded["model"], "provider-secret-model");
    }
    let foreign_org = store
        .create_prepaid_organization("Foreign protocol account", "USD")
        .await
        .unwrap();
    let foreign_scope = store
        .create_project(foreign_org, "Foreign protocol workspace")
        .await
        .unwrap();
    let foreign_key = store
        .issue_key(
            foreign_scope,
            "Foreign client",
            &["personal-responses".into(), "personal-embeddings".into()],
            3600,
        )
        .await
        .unwrap();
    for (path, body) in [
        (
            "/v1/responses",
            json!({"model":"personal-responses","input":"hello","max_output_tokens":8}),
        ),
        (
            "/v1/embeddings",
            json!({"model":"personal-embeddings","input":"hello"}),
        ),
    ] {
        let (status, _) = call(&app, Method::POST, path, &foreign_key.token, body).await;
        assert!(!status.is_success(), "foreign personal access: {path}");
        assert!(captured.0.lock().unwrap().is_none());
    }
    store.activate_workspace_guardrail(scope, 0, &json!({"schema_version":1,"name":"Mandatory personal input protection","models":{"mode":"inherit"},"providers":{"mode":"inherit"},"input_rules":[{"pattern":"sensitive-fixture","action":"block"}]})).await.unwrap();
    for (path, body) in [
        (
            "/v1/responses",
            json!({"model":"personal-responses","input":"sensitive-fixture","max_output_tokens":8}),
        ),
        (
            "/v1/embeddings",
            json!({"model":"personal-embeddings","input":"sensitive-fixture"}),
        ),
    ] {
        let (status, _) = call(&app, Method::POST, path, &key.token, body).await;
        assert_eq!(
            status,
            StatusCode::FORBIDDEN,
            "mandatory personal guardrail: {path}"
        );
        assert!(captured.0.lock().unwrap().is_none());
    }
    store.revoke_key(scope, key.id).await.unwrap();
    for (path, body) in [
        (
            "/v1/responses",
            json!({"model":"personal-responses","input":"hello","max_output_tokens":8}),
        ),
        (
            "/v1/embeddings",
            json!({"model":"personal-embeddings","input":"hello"}),
        ),
    ] {
        let (status, _) = call(&app, Method::POST, path, &key.token, body).await;
        assert_eq!(
            status,
            StatusCode::UNAUTHORIZED,
            "revoked personal key: {path}"
        );
        assert!(captured.0.lock().unwrap().is_none());
    }
    let all_attempts: i64 = sqlx::query_scalar("SELECT count(*) FROM attempts")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(
        all_attempts, 2,
        "denied protocol calls must not create attempts"
    );
    state.gateway_writes.shutdown().await;
    let activity = store
        .gateway_activity(scope, None, 100, &Default::default())
        .await
        .unwrap();
    assert_eq!(activity.len(), 2);
    for row in &activity {
        assert_eq!(row.execution, "confirmed_completed");
        assert_eq!(row.usage_confidence, "provider_reported");
        let expected = if row.model == "personal-responses" {
            ("4", "2")
        } else {
            ("5", "0")
        };
        assert_eq!(row.prompt_tokens.as_deref(), Some(expected.0));
        assert_eq!(row.completion_tokens.as_deref(), Some(expected.1));
        assert_eq!(row.customer_charge_status, "owner_funded");
        assert!(row.customer_charge_nanos.is_none());
    }
    let bindings: i64 = sqlx::query_scalar("SELECT count(*) FROM personal_attempt_routes")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(bindings, 2);
    for table in [
        "customer_balance_entries",
        "customer_balance_reservations",
        "customer_attempt_tariffs",
        "provider_attempt_offers",
    ] {
        let count: i64 = sqlx::query_scalar(&format!("SELECT count(*) FROM {table}"))
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 0, "{table}");
    }
    server.abort();
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn asset_management_admin_configuration_is_encrypted_scoped_and_durable(pool: PgPool) {
    let make_state = || {
        let mut state = test_state(None, pool.clone());
        state.vendor_cipher = Some(Arc::new(
            crate::vendors::crypto::CredentialCipher::new(MASTER).unwrap(),
        ));
        state
    };
    let state = make_state();
    let scope = state.store.default_workspace().await.unwrap();
    let owner = state
        .store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: None,
            },
            "Asset owner fixture",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let key = state
        .store
        .issue_key(scope, "Asset client fixture", &["fast".into()], 3600)
        .await
        .unwrap();
    let vendor = state
        .store
        .create_vendor(niu_storage::VendorInput {
            id: Uuid::new_v4(),
            name: "Ark asset fixture".into(),
            adapter: "openai".into(),
            api_base: "https://ark.cn-beijing.volcengineapi.com/api/v3".into(),
            enabled: false,
            credential_ciphertext: vec![0x44; 48],
        })
        .await
        .unwrap();
    let path = format!("/admin/v1/vendors/{}/asset-management", vendor.id);
    let app = router(state.clone());
    let input = json!({"expected_revision":0,"upstream_project":"original-project","access_key":"AKEXAMPLE","secret_key":"fixture-management-secret"});
    for token in [&owner.token, &key.token, "invalid"] {
        for method in [Method::GET, Method::PUT] {
            let (status, body) = call(&app, method, &path, token, input.clone()).await;
            assert!(matches!(
                status,
                StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN
            ));
            assert!(!body.to_string().contains("fixture-management-secret"));
        }
    }
    let (status, body) = call(&app, Method::PUT, &path, ADMIN, input.clone()).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"]["revision"], 1);
    assert_eq!(body["data"]["dispatch_available"], false);
    assert!(!body.to_string().contains("AKEXAMPLE"));
    assert!(!body.to_string().contains("fixture-management-secret"));
    let original = state
        .store
        .asset_management_credential_revision(vendor.id, 1)
        .await
        .unwrap()
        .unwrap();
    let cipher = state.vendor_cipher.as_ref().unwrap();
    let decoded = cipher
        .open_asset_management_fixture(
            vendor.id,
            1,
            "original-project",
            &original.credential_ciphertext,
        )
        .unwrap();
    assert_eq!(decoded["secret_key"], "fixture-management-secret");
    assert!(
        cipher
            .open(vendor.id, &original.credential_ciphertext)
            .is_err()
    );
    for (id, revision, project) in [
        (Uuid::new_v4(), 1, "original-project"),
        (vendor.id, 2, "original-project"),
        (vendor.id, 1, "wrong-project"),
    ] {
        assert!(
            cipher
                .open_asset_management_fixture(
                    id,
                    revision,
                    project,
                    &original.credential_ciphertext
                )
                .is_err()
        );
    }
    let mut next = input.clone();
    next["expected_revision"] = json!(1);
    next["secret_key"] = json!("fixture-rotated-management-secret");
    assert_eq!(
        call(&app, Method::PUT, &path, ADMIN, next).await.0,
        StatusCode::OK
    );
    assert_eq!(
        call(&app, Method::PUT, &path, ADMIN, input).await.0,
        StatusCode::CONFLICT
    );
    let reopened = router(make_state());
    let (status, body) = call(&reopened, Method::GET, &path, ADMIN, json!({})).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"]["revision"], 2);
    assert_eq!(body["data"]["dispatch_available"], false);
    assert!(body["data"].get("credential_ciphertext").is_none());
    assert_eq!(
        state
            .store
            .vendor_credential_ciphertext(vendor.id)
            .await
            .unwrap()
            .unwrap(),
        vec![0x44; 48]
    );
    let actors: Vec<String> = sqlx::query_scalar("SELECT actor_kind FROM vendor_asset_management_credentials WHERE vendor_id=$1 ORDER BY revision").bind(vendor.id).fetch_all(&pool).await.unwrap();
    assert_eq!(actors, vec!["installation", "installation"]);
    let (status, body) = call(
        &app,
        Method::PUT,
        &path,
        ADMIN,
        json!({"expected_revision":"fixture-secret-in-invalid-field"}),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(!body.to_string().contains("fixture-secret-in-invalid-field"));
    let (status, body) = call(
        &app,
        Method::PUT,
        &path,
        ADMIN,
        json!({"secret_key":"fixture-large-secret".repeat(2000)}),
    )
    .await;
    assert_eq!(status, StatusCode::PAYLOAD_TOO_LARGE);
    assert!(!body.to_string().contains("fixture-large-secret"));
    state
        .store
        .update_vendor(
            vendor.id,
            niu_storage::VendorUpdate {
                name: "Changed Ark endpoint".into(),
                api_base: "https://openrouter.ai/api/v1".into(),
                enabled: false,
                credential_ciphertext: None,
                expected_revision: vendor.revision,
            },
        )
        .await
        .unwrap();
    let (status,_) = call(&app,Method::PUT,&path,ADMIN,json!({"expected_revision":2,"upstream_project":"original-project","access_key":"AKEXAMPLE","secret_key":"fixture-management-secret"})).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(
        state
            .store
            .asset_management_credential_revision(vendor.id, 3)
            .await
            .unwrap()
            .is_none()
    );
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn asset_management_admin_revocation_requires_confirmation_and_denies_customer_access(
    pool: PgPool,
) {
    let mut state = test_state(None, pool.clone());
    state.vendor_cipher = Some(Arc::new(
        crate::vendors::crypto::CredentialCipher::new(MASTER).unwrap(),
    ));
    let scope = state.store.default_workspace().await.unwrap();
    let owner = state
        .store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: None,
            },
            "Asset revoke owner",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let vendor = state
        .store
        .create_vendor(niu_storage::VendorInput {
            id: Uuid::new_v4(),
            name: "Asset revoke fixture".into(),
            adapter: "openai".into(),
            api_base: "https://ark.cn-beijing.volcengineapi.com/api/v3".into(),
            enabled: false,
            credential_ciphertext: vec![0x44; 48],
        })
        .await
        .unwrap();
    let path = format!("/admin/v1/vendors/{}/asset-management", vendor.id);
    let app = router(state.clone());
    let setup = json!({"expected_revision":0,"upstream_project":"bound-project","access_key":"AKEXAMPLE","secret_key":"fixture-management-secret"});
    assert_eq!(
        call(&app, Method::PUT, &path, ADMIN, setup).await.0,
        StatusCode::OK
    );
    let erase = json!({"expected_revision":1,"erase_history":true,"confirm_erase":true});
    assert_eq!(
        call(&app, Method::DELETE, &path, &owner.token, erase.clone())
            .await
            .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        call(
            &app,
            Method::DELETE,
            &path,
            ADMIN,
            json!({"expected_revision":1,"erase_history":true})
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    assert!(
        state
            .store
            .asset_management_credential_revision(vendor.id, 1)
            .await
            .unwrap()
            .is_some()
    );
    let (status, body) = call(&app, Method::DELETE, &path, ADMIN, erase.clone()).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"]["configured"], false);
    assert_eq!(body["data"]["erased_revisions"], 1);
    let (status, body) = call(&app, Method::DELETE, &path, ADMIN, erase).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"]["erased_revisions"], 0);
    let (status, body) = call(&app, Method::GET, &path, ADMIN, json!({})).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"]["configured"], false);
    assert_eq!(body["data"]["revision"], 1);
    assert!(
        state
            .store
            .asset_management_credential_revision(vendor.id, 1)
            .await
            .unwrap()
            .is_none()
    );
    let retained:i64=sqlx::query_scalar("SELECT COUNT(*) FROM vendor_asset_management_credentials WHERE vendor_id=$1 AND credential_ciphertext IS NOT NULL").bind(vendor.id).fetch_one(&pool).await.unwrap();
    assert_eq!(retained, 0);
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn asset_management_request_delete_api_requires_workspace_write_access(pool: PgPool) {
    let state = test_state(None, pool.clone());
    let scope = state.store.default_workspace().await.unwrap();
    let other = state
        .store
        .create_project(scope.organization_id, "Other asset workspace")
        .await
        .unwrap();
    let operator_scope = OperatorScope {
        organization_id: scope.organization_id,
        project_id: Some(scope.project_id),
    };
    let viewer = state
        .store
        .create_operator(
            operator_scope,
            "Asset reader",
            OperatorRole::Viewer,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let writer = state
        .store
        .create_operator(
            operator_scope,
            "Asset manager",
            OperatorRole::Admin,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let key = state
        .store
        .issue_key(scope, "Inference only", &["*".into()], 3600)
        .await
        .unwrap();
    let vendor = state
        .store
        .create_vendor(niu_storage::VendorInput {
            id: Uuid::new_v4(),
            name: "Asset deletion fixture".into(),
            adapter: "openai".into(),
            api_base: "https://ark.cn-beijing.volcengineapi.com/api/v3".into(),
            enabled: false,
            credential_ciphertext: vec![0x44; 48],
        })
        .await
        .unwrap();
    let mut encrypted = vec![0x22; 48];
    encrypted[0] = 1;
    state
        .store
        .save_asset_management_credential(vendor.id, 0, "original", &encrypted)
        .await
        .unwrap();
    let request =
        niu_media::asset_group::OrdinaryAssetGroupCreate::new("Private character".into(), None)
            .unwrap();
    let intent = state
        .store
        .prepare_asset_group_create(scope, Uuid::new_v4(), vendor.id, 1, &request)
        .await
        .unwrap();
    state
        .store
        .prepare_asset_group_create(scope, Uuid::new_v4(), vendor.id, 1, &request)
        .await
        .unwrap();
    let app = router(state.clone());
    let detail_path = format!(
        "/admin/v1/organizations/{}/projects/{}/asset-group-intents/{}/request",
        scope.organization_id, scope.project_id, intent.id
    );
    let list_path = format!(
        "/admin/v1/organizations/{}/projects/{}/asset-group-intents",
        scope.organization_id, scope.project_id
    );
    for path in [&list_path, &detail_path] {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri(path)
                    .header("authorization", format!("Bearer {}", viewer.token))
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers().get("cache-control").unwrap(), "no-store");
    }
    let (status, page) = call(&app, Method::GET, &list_path, &viewer.token, json!(null)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(page["data"].as_array().unwrap().len(), 2);
    assert_eq!(page["data"][0]["name"], "Private character");
    assert_eq!(page["data"][0].as_object().unwrap().len(), 5);
    assert!(page["next_cursor"].is_null());
    let (_, first) = call(
        &app,
        Method::GET,
        &format!("{list_path}?limit=1"),
        &viewer.token,
        json!(null),
    )
    .await;
    assert_eq!(first["data"].as_array().unwrap().len(), 1);
    let cursor = first["next_cursor"].as_str().unwrap();
    let (_, second) = call(
        &app,
        Method::GET,
        &format!("{list_path}?after={cursor}&limit=1"),
        &viewer.token,
        json!(null),
    )
    .await;
    assert_eq!(second["data"].as_array().unwrap().len(), 1);
    assert!(second["next_cursor"].is_null());
    assert_ne!(first["data"][0]["id"], second["data"][0]["id"]);
    let after = format!(
        "{list_path}?after={}&limit=1",
        second["data"][0]["id"].as_str().unwrap()
    );
    assert!(
        call(&app, Method::GET, &after, &viewer.token, json!(null))
            .await
            .1["data"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        call(
            &app,
            Method::GET,
            &format!("{list_path}?limit=101"),
            &viewer.token,
            json!(null)
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        call(&app, Method::GET, &list_path, &key.token, json!(null))
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
    let (status, detail) = call(&app, Method::GET, &detail_path, &viewer.token, json!(null)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(detail["data"]["request_content_status"], "retained");
    assert_eq!(detail["data"]["request"]["name"], "Private character");
    for private in [
        "vendor_id",
        "credential_revision",
        "upstream_project",
        "request_fingerprint",
        "original",
    ] {
        assert!(!detail.to_string().contains(private));
    }
    assert_eq!(
        call(&app, Method::GET, &detail_path, &key.token, json!(null))
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );

    for (token, target, expected) in [
        ("invalid", scope, StatusCode::UNAUTHORIZED),
        (key.token.as_str(), scope, StatusCode::UNAUTHORIZED),
        (viewer.token.as_str(), scope, StatusCode::FORBIDDEN),
        (writer.token.as_str(), other, StatusCode::NOT_FOUND),
        (writer.token.as_str(), scope, StatusCode::NO_CONTENT),
        (writer.token.as_str(), scope, StatusCode::NO_CONTENT),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::DELETE)
                    .uri(format!(
                        "/admin/v1/organizations/{}/projects/{}/asset-group-intents/{}/request",
                        target.organization_id, target.project_id, intent.id
                    ))
                    .header("authorization", format!("Bearer {token}"))
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
        let body = response.into_body().collect().await.unwrap().to_bytes();
        assert!(!String::from_utf8_lossy(&body).contains("Private character"));
        if expected == StatusCode::NO_CONTENT {
            assert!(body.is_empty());
        } else {
            assert!(
                state
                    .store
                    .asset_group_create_intent(scope, intent.id)
                    .await
                    .unwrap()
                    .unwrap()
                    .request_body
                    .is_some()
            );
        }
    }
    assert!(
        state
            .store
            .asset_group_create_intent(scope, intent.id)
            .await
            .unwrap()
            .unwrap()
            .request_body
            .is_none()
    );
    let (status, detail) = call(&app, Method::GET, &detail_path, &viewer.token, json!(null)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(detail["data"]["request_content_status"], "deleted");
    assert!(detail["data"]["request"].is_null());
    let (_, page) = call(&app, Method::GET, &list_path, &viewer.token, json!(null)).await;
    let deleted = page["data"]
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["id"] == intent.id.to_string())
        .unwrap();
    assert!(deleted["name"].is_null());
    assert_eq!(deleted["request_content_status"], "deleted");
    let foreign_list = format!(
        "/admin/v1/organizations/{}/projects/{}/asset-group-intents",
        other.organization_id, other.project_id
    );
    assert_eq!(
        call(&app, Method::GET, &foreign_list, &viewer.token, json!(null))
            .await
            .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>(
            "SELECT count(*) FROM asset_group_request_deletions WHERE intent_id=$1"
        )
        .bind(intent.id)
        .fetch_one(&pool)
        .await
        .unwrap(),
        1
    );
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn asset_operation_authorization_admin_controls_are_scoped_and_durable(pool: PgPool) {
    let state = test_state(None, pool.clone());
    let scope = state.store.default_workspace().await.unwrap();
    let owner = state
        .store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: None,
            },
            "Qualification owner fixture",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let key = state
        .store
        .issue_key(
            scope,
            "Qualification client fixture",
            &["fast".into()],
            3600,
        )
        .await
        .unwrap();
    let vendor = state
        .store
        .create_vendor(niu_storage::VendorInput {
            id: Uuid::new_v4(),
            name: "Qualified Ark fixture".into(),
            adapter: "openai".into(),
            api_base: "https://ark.cn-beijing.volcengineapi.com/api/v3".into(),
            enabled: false,
            credential_ciphertext: vec![1; 48],
        })
        .await
        .unwrap();
    state
        .store
        .save_asset_management_credential(vendor.id, 0, "original-project", &[1; 48])
        .await
        .unwrap();
    let path = format!(
        "/admin/v1/vendors/{}/asset-management/authorizations",
        vendor.id
    );
    let input = json!({"organization_id":scope.organization_id,"project_id":scope.project_id,"vendor_revision":1,"credential_revision":1,"rights_sha256":"11".repeat(32),"protocol_sha256":"22".repeat(32),"data_handling_sha256":"33".repeat(32),"free_operation_sha256":"44".repeat(32),"valid_for_seconds":3600});
    let app = router(state.clone());
    for token in [&owner.token, &key.token, "invalid"] {
        for method in [Method::GET, Method::POST, Method::DELETE] {
            let endpoint = if method == Method::DELETE {
                format!("{path}/{}", Uuid::new_v4())
            } else {
                path.clone()
            };
            let (status, _) = call(&app, method, &endpoint, token, input.clone()).await;
            assert!(matches!(
                status,
                StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN
            ));
        }
    }
    for (field, value) in [
        ("free_operation_sha256", json!("00".repeat(32))),
        ("rights_sha256", json!("invalid")),
        ("valid_for_seconds", json!(7_776_001)),
        ("credential_revision", json!(0)),
    ] {
        let mut invalid = input.clone();
        invalid[field] = value;
        assert_eq!(
            call(&app, Method::POST, &path, ADMIN, invalid).await.0,
            StatusCode::BAD_REQUEST
        );
    }
    let mut unknown = input.clone();
    unknown["operation"] = json!("CreateUnreviewedAsset");
    let rejected = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri(&path)
                .header("authorization", format!("Bearer {ADMIN}"))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(unknown.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(rejected.status(), StatusCode::UNPROCESSABLE_ENTITY);
    let mut foreign = input.clone();
    foreign["organization_id"] = json!(Uuid::new_v4());
    assert_eq!(
        call(&app, Method::POST, &path, ADMIN, foreign).await.0,
        StatusCode::NOT_FOUND
    );
    let mut stale = input.clone();
    stale["vendor_revision"] = json!(2);
    assert_eq!(
        call(&app, Method::POST, &path, ADMIN, stale).await.0,
        StatusCode::CONFLICT
    );
    let (status, created) = call(&app, Method::POST, &path, ADMIN, input.clone()).await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(created["data"]["dispatch_available"], false);
    assert_eq!(created["data"]["operation"], "CreateAssetGroup");
    let id = created["data"]["id"].as_str().unwrap();
    let reopened = router(test_state(None, pool.clone()));
    let (status, listed) = call(&reopened, Method::GET, &path, ADMIN, json!({})).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(listed["data"].as_array().unwrap().len(), 1);
    assert_eq!(listed["data"][0]["id"], id);
    assert_eq!(listed["data"][0]["revoked"], false);
    assert!(!listed.to_string().contains("ciphertext"));
    let wrong = format!(
        "/admin/v1/vendors/{}/asset-management/authorizations/{id}",
        Uuid::new_v4()
    );
    assert_eq!(
        call(&app, Method::DELETE, &wrong, ADMIN, json!({})).await.0,
        StatusCode::NO_CONTENT
    );
    assert!(
        state
            .store
            .asset_group_creation_is_qualified(scope, vendor.id, 1, 1)
            .await
            .unwrap()
    );
    for _ in 0..2 {
        assert_eq!(
            call(
                &app,
                Method::DELETE,
                &format!("{path}/{id}"),
                ADMIN,
                json!({})
            )
            .await
            .0,
            StatusCode::NO_CONTENT
        );
    }
    assert!(
        !state
            .store
            .asset_group_creation_is_qualified(scope, vendor.id, 1, 1)
            .await
            .unwrap()
    );
    let (_, listed) = call(&reopened, Method::GET, &path, ADMIN, json!({})).await;
    assert_eq!(listed["data"][0]["revoked"], true);
    let mut read_input = input.clone();
    read_input["operation"] = json!("GetAssetGroup");
    for token in [&owner.token, &key.token, "invalid"] {
        assert!(matches!(
            call(&app, Method::POST, &path, token, read_input.clone())
                .await
                .0,
            StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN
        ));
    }
    let (status, read_created) = call(&app, Method::POST, &path, ADMIN, read_input).await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(read_created["data"]["operation"], "GetAssetGroup");
    assert_eq!(read_created["data"]["dispatch_available"], false);
    assert!(
        state
            .store
            .asset_group_read_is_qualified(scope, vendor.id, 1, 1)
            .await
            .unwrap()
    );
    assert!(
        !state
            .store
            .asset_group_creation_is_qualified(scope, vendor.id, 1, 1)
            .await
            .unwrap()
    );
    let (_, reads) = call(&reopened, Method::GET, &path, ADMIN, json!({})).await;
    assert!(
        reads["data"]
            .as_array()
            .unwrap()
            .iter()
            .any(|row| row["operation"] == "GetAssetGroup" && row["revoked"] == false)
    );
    let read_id = read_created["data"]["id"].as_str().unwrap();
    assert_eq!(
        call(
            &app,
            Method::DELETE,
            &format!("{path}/{read_id}"),
            ADMIN,
            json!({})
        )
        .await
        .0,
        StatusCode::NO_CONTENT
    );
    assert!(
        !state
            .store
            .asset_group_read_is_qualified(scope, vendor.id, 1, 1)
            .await
            .unwrap()
    );
    let mut listing_input = input.clone();
    listing_input["operation"] = json!("ListAssets");
    for token in [&owner.token, &key.token, "invalid"] {
        assert!(matches!(
            call(&app, Method::POST, &path, token, listing_input.clone())
                .await
                .0,
            StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN
        ));
    }
    let (status, listing_created) = call(&app, Method::POST, &path, ADMIN, listing_input).await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(listing_created["data"]["operation"], "ListAssets");
    assert_eq!(listing_created["data"]["dispatch_available"], false);
    assert!(
        state
            .store
            .asset_listing_is_qualified(scope, vendor.id, 1, 1)
            .await
            .unwrap()
    );
    assert!(
        !state
            .store
            .asset_group_read_is_qualified(scope, vendor.id, 1, 1)
            .await
            .unwrap()
    );
    assert!(
        !state
            .store
            .asset_group_creation_is_qualified(scope, vendor.id, 1, 1)
            .await
            .unwrap()
    );
    let mut lookup_input = input.clone();
    lookup_input["operation"] = json!("GetAsset");
    for token in [&owner.token, &key.token, "invalid"] {
        assert!(matches!(
            call(&app, Method::POST, &path, token, lookup_input.clone())
                .await
                .0,
            StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN
        ));
    }
    let (status, lookup_created) = call(&app, Method::POST, &path, ADMIN, lookup_input).await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(lookup_created["data"]["operation"], "GetAsset");
    assert_eq!(lookup_created["data"]["dispatch_available"], false);
    assert!(
        state
            .store
            .asset_lookup_is_qualified(scope, vendor.id, 1, 1)
            .await
            .unwrap()
    );
    assert!(
        !state
            .store
            .asset_group_read_is_qualified(scope, vendor.id, 1, 1)
            .await
            .unwrap()
    );
    assert!(
        !state
            .store
            .asset_group_creation_is_qualified(scope, vendor.id, 1, 1)
            .await
            .unwrap()
    );
    assert!(
        !state
            .store
            .asset_group_deletion_is_qualified(scope, vendor.id, 1, 1)
            .await
            .unwrap()
    );
    let mut deletion_input = input.clone();
    deletion_input["operation"] = json!("DeleteAssetGroup");
    for token in [&owner.token, &key.token, "invalid"] {
        assert!(matches!(
            call(&app, Method::POST, &path, token, deletion_input.clone())
                .await
                .0,
            StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN
        ));
    }
    let (status, deletion_created) = call(&app, Method::POST, &path, ADMIN, deletion_input).await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(deletion_created["data"]["operation"], "DeleteAssetGroup");
    assert_eq!(deletion_created["data"]["dispatch_available"], false);
    assert!(
        state
            .store
            .asset_group_deletion_is_qualified(scope, vendor.id, 1, 1)
            .await
            .unwrap()
    );
    let (_, deletion_reviewed) = call(&reopened, Method::GET, &path, ADMIN, json!({})).await;
    assert!(
        deletion_reviewed["data"]
            .as_array()
            .unwrap()
            .iter()
            .any(|row| row["operation"] == "DeleteAssetGroup" && row["revoked"] == false)
    );
    assert!(
        !state
            .store
            .asset_creation_is_qualified(scope, vendor.id, 1, 1)
            .await
            .unwrap()
    );
    let mut ingestion_input = input.clone();
    ingestion_input["operation"] = json!("CreateAsset");
    for token in [&owner.token, &key.token, "invalid"] {
        assert!(matches!(
            call(&app, Method::POST, &path, token, ingestion_input.clone())
                .await
                .0,
            StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN
        ));
    }
    let (status, ingestion_created) = call(&app, Method::POST, &path, ADMIN, ingestion_input).await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(ingestion_created["data"]["operation"], "CreateAsset");
    assert_eq!(ingestion_created["data"]["dispatch_available"], false);
    assert!(
        state
            .store
            .asset_creation_is_qualified(scope, vendor.id, 1, 1)
            .await
            .unwrap()
    );
    let (_, ingestion_reviewed) = call(&reopened, Method::GET, &path, ADMIN, json!({})).await;
    assert!(
        ingestion_reviewed["data"]
            .as_array()
            .unwrap()
            .iter()
            .any(|row| row["operation"] == "CreateAsset" && row["revoked"] == false)
    );
    let deletion_id = deletion_created["data"]["id"].as_str().unwrap();
    assert_eq!(
        call(
            &app,
            Method::DELETE,
            &format!("{path}/{deletion_id}"),
            ADMIN,
            json!({})
        )
        .await
        .0,
        StatusCode::NO_CONTENT
    );
    assert!(
        !state
            .store
            .asset_group_deletion_is_qualified(scope, vendor.id, 1, 1)
            .await
            .unwrap()
    );
    assert!(
        state
            .store
            .asset_lookup_is_qualified(scope, vendor.id, 1, 1)
            .await
            .unwrap()
    );
    let mut update_input = input.clone();
    update_input["operation"] = json!("UpdateAssetGroup");
    for token in [&owner.token, &key.token, "invalid"] {
        assert!(matches!(
            call(&app, Method::POST, &path, token, update_input.clone())
                .await
                .0,
            StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN
        ));
    }
    let (status, update_created) = call(&app, Method::POST, &path, ADMIN, update_input).await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(update_created["data"]["operation"], "UpdateAssetGroup");
    assert_eq!(update_created["data"]["dispatch_available"], false);
    assert!(
        state
            .store
            .asset_group_update_is_qualified(scope, vendor.id, 1, 1)
            .await
            .unwrap()
    );
    let (_, reviewed) = call(&reopened, Method::GET, &path, ADMIN, json!({})).await;
    assert!(
        reviewed["data"]
            .as_array()
            .unwrap()
            .iter()
            .any(|row| row["operation"] == "UpdateAssetGroup" && row["revoked"] == false)
    );
    let update_id = update_created["data"]["id"].as_str().unwrap();
    assert_eq!(
        call(
            &app,
            Method::DELETE,
            &format!("{path}/{update_id}"),
            ADMIN,
            json!({})
        )
        .await
        .0,
        StatusCode::NO_CONTENT
    );
    assert!(
        !state
            .store
            .asset_group_update_is_qualified(scope, vendor.id, 1, 1)
            .await
            .unwrap()
    );
    assert!(
        state
            .store
            .asset_lookup_is_qualified(scope, vendor.id, 1, 1)
            .await
            .unwrap()
    );
    let lookup_id = lookup_created["data"]["id"].as_str().unwrap();
    assert_eq!(
        call(
            &app,
            Method::DELETE,
            &format!("{path}/{lookup_id}"),
            ADMIN,
            json!({})
        )
        .await
        .0,
        StatusCode::NO_CONTENT
    );
    assert!(
        !state
            .store
            .asset_lookup_is_qualified(scope, vendor.id, 1, 1)
            .await
            .unwrap()
    );
    assert!(
        state
            .store
            .asset_listing_is_qualified(scope, vendor.id, 1, 1)
            .await
            .unwrap()
    );
    let (_, listed) = call(&reopened, Method::GET, &path, ADMIN, json!({})).await;
    assert!(
        listed["data"]
            .as_array()
            .unwrap()
            .iter()
            .any(|row| row["operation"] == "ListAssets" && row["revoked"] == false)
    );
    let listing_id = listing_created["data"]["id"].as_str().unwrap();
    assert_eq!(
        call(
            &app,
            Method::DELETE,
            &format!("{path}/{listing_id}"),
            ADMIN,
            json!({})
        )
        .await
        .0,
        StatusCode::NO_CONTENT
    );
    assert!(
        !state
            .store
            .asset_listing_is_qualified(scope, vendor.id, 1, 1)
            .await
            .unwrap()
    );
    // Real platform administrators use the same endpoints; ordinary owners do not.
    sqlx::query("UPDATE admin_operators SET platform_admin=true WHERE id=$1")
        .bind(owner.operator_id)
        .execute(&pool)
        .await
        .unwrap();
    let (status, member_created) =
        call(&app, Method::POST, &path, &owner.token, input.clone()).await;
    assert_eq!(status, StatusCode::CREATED);
    let member_id: Uuid = member_created["data"]["id"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap();
    let actor: (String, Option<Uuid>) = sqlx::query_as(
        "SELECT actor_kind,actor_id FROM asset_operation_authorizations WHERE id=$1",
    )
    .bind(member_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(actor, ("operator".into(), Some(owner.operator_id)));
    assert_eq!(
        call(
            &app,
            Method::DELETE,
            &format!("{path}/{member_id}"),
            &owner.token,
            json!({})
        )
        .await
        .0,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        call(
            &app,
            Method::GET,
            &format!("{path}?limit=101"),
            ADMIN,
            json!({})
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn asset_group_runtime_dispatch_is_durable_bounded_and_never_replays(pool: PgPool) {
    use crate::vendors::asset_groups::{CreateInput, create_with_dispatch};
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::Duration;
    let mut state = test_state(None, pool.clone());
    let cipher = Arc::new(crate::vendors::crypto::CredentialCipher::new(MASTER).unwrap());
    state.vendor_cipher = Some(cipher.clone());
    let scope = state.store.default_workspace().await.unwrap();
    let vendor = state
        .store
        .create_vendor(niu_storage::VendorInput {
            id: Uuid::new_v4(),
            name: "Runtime asset fixture".into(),
            adapter: "openai".into(),
            api_base: "https://ark.cn-beijing.volcengineapi.com/api/v3".into(),
            enabled: false,
            credential_ciphertext: vec![1; 48],
        })
        .await
        .unwrap();
    let encrypted = cipher
        .seal_asset_management(
            vendor.id,
            1,
            "bound-project",
            "AKEXAMPLE",
            "fixture-asset-secret",
        )
        .unwrap();
    state
        .store
        .save_asset_management_credential(vendor.id, 0, "bound-project", &encrypted)
        .await
        .unwrap();
    let key = Uuid::new_v4();
    let make_input = |idempotency_key| CreateInput {
        organization_id: scope.organization_id,
        project_id: scope.project_id,
        idempotency_key,
        vendor_revision: 1,
        credential_revision: 1,
        name: "Character".into(),
        description: Some("Ordinary AIGC".into()),
    };
    let mut headers = HeaderMap::new();
    headers.insert("authorization", format!("Bearer {ADMIN}").parse().unwrap());
    let sent = Arc::new(AtomicUsize::new(0));
    let count = sent.clone();
    let unqualified = create_with_dispatch(
        state.clone(),
        vendor.id,
        headers.clone(),
        make_input(key),
        move |_, _| async move {
            count.fetch_add(1, Ordering::SeqCst);
            Ok("group-unqualified".into())
        },
    )
    .await;
    assert!(unqualified.is_err());
    assert_eq!(sent.load(Ordering::SeqCst), 0);
    let grant = state
        .store
        .qualify_asset_group_creation(
            scope,
            niu_storage::AssetOperationQualification {
                vendor_id: vendor.id,
                vendor_revision: 1,
                credential_revision: 1,
                rights_sha256: [1; 32],
                protocol_sha256: [2; 32],
                data_handling_sha256: [3; 32],
                free_operation_sha256: [4; 32],
                valid_for_seconds: 3600,
            },
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let release = Arc::new(tokio::sync::Notify::new());
    let wait = release.clone();
    let count = sent.clone();
    let (status, Json(created)) = create_with_dispatch(
        state.clone(),
        vendor.id,
        headers.clone(),
        make_input(key),
        move |signer, claimed| async move {
            count.fetch_add(1, Ordering::SeqCst);
            assert_eq!(claimed.authorization_id, grant);
            assert_eq!(
                claimed.request().body("bound-project").unwrap()["Name"],
                "Character"
            );
            assert!(
                signer
                    .sign_create_group(
                        "20261008T010203Z",
                        claimed.request(),
                        &claimed.credential.upstream_project
                    )
                    .is_ok()
            );
            wait.notified().await;
            Ok("group-runtime-fixture".into())
        },
    )
    .await
    .unwrap();
    assert_eq!(status, StatusCode::ACCEPTED);
    assert_eq!(created["data"]["status"], "dispatching");
    let id: Uuid = created["data"]["id"].as_str().unwrap().parse().unwrap();
    let (_, Json(repeated)) = create_with_dispatch(
        state.clone(),
        vendor.id,
        headers.clone(),
        make_input(key),
        |_, _| async { panic!("A repeated create must not call transport") },
    )
    .await
    .unwrap();
    assert_eq!(repeated["data"]["id"], id.to_string());
    assert_eq!(repeated["data"]["status"], "dispatching");
    state
        .store
        .revoke_asset_operation_authorization(grant, OperatorAuditActor::Installation)
        .await
        .unwrap();
    release.notify_one();
    tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            let saved = state
                .store
                .asset_group_create_intent(scope, id)
                .await
                .unwrap()
                .unwrap();
            if saved.state == "succeeded" {
                assert_eq!(
                    saved.upstream_group_id.as_deref(),
                    Some("group-runtime-fixture")
                );
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    assert_eq!(sent.load(Ordering::SeqCst), 1);
    let (_, Json(repeated)) = create_with_dispatch(
        state.clone(),
        vendor.id,
        headers.clone(),
        make_input(key),
        |_, _| async { panic!("A completed create must never replay") },
    )
    .await
    .unwrap();
    assert_eq!(repeated["data"]["status"], "succeeded");
    let new_key = Uuid::new_v4();
    state
        .store
        .qualify_asset_group_creation(
            scope,
            niu_storage::AssetOperationQualification {
                vendor_id: vendor.id,
                vendor_revision: 1,
                credential_revision: 1,
                rights_sha256: [1; 32],
                protocol_sha256: [2; 32],
                data_handling_sha256: [3; 32],
                free_operation_sha256: [4; 32],
                valid_for_seconds: 3600,
            },
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let count = sent.clone();
    let (_, Json(uncertain)) = create_with_dispatch(
        state.clone(),
        vendor.id,
        headers.clone(),
        make_input(new_key),
        move |_, _| async move {
            count.fetch_add(1, Ordering::SeqCst);
            Err(niu_media::asset_transport::AssetCreateError::Uncertain)
        },
    )
    .await
    .unwrap();
    let uncertain_id: Uuid = uncertain["data"]["id"].as_str().unwrap().parse().unwrap();
    tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            if state
                .store
                .asset_group_create_intent(scope, uncertain_id)
                .await
                .unwrap()
                .unwrap()
                .state
                == "uncertain"
            {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    let (_, Json(repeated)) = create_with_dispatch(
        state.clone(),
        vendor.id,
        headers.clone(),
        make_input(new_key),
        |_, _| async { panic!("An uncertain create must never replay") },
    )
    .await
    .unwrap();
    assert_eq!(repeated["data"]["status"], "uncertain");
    assert_eq!(sent.load(Ordering::SeqCst), 2);
    let principal = state
        .store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: None,
            },
            "Asset runtime owner",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let app = router(state.clone());
    let path = format!("/admin/v1/vendors/{}/asset-management/groups", vendor.id);
    let input = json!({"organization_id":scope.organization_id,"project_id":scope.project_id,"idempotency_key":Uuid::new_v4(),"vendor_revision":1,"credential_revision":1,"name":"Character"});
    assert_eq!(
        call(&app, Method::POST, &path, &principal.token, input.clone())
            .await
            .0,
        StatusCode::FORBIDDEN
    );
    let mut missing = input;
    missing["credential_revision"] = json!(999);
    assert_eq!(
        call(&app, Method::POST, &path, ADMIN, missing).await.0,
        StatusCode::CONFLICT
    );
    assert_eq!(sent.load(Ordering::SeqCst), 2);
    // Four detached sends may run; excess admission fails before saving a request.
    let barrier = Arc::new(tokio::sync::Semaphore::new(0));
    let mut occupied = Vec::new();
    for _ in 0..4 {
        let wait = barrier.clone();
        let count = sent.clone();
        let (_, Json(created)) = create_with_dispatch(
            state.clone(),
            vendor.id,
            headers.clone(),
            make_input(Uuid::new_v4()),
            move |_, _| async move {
                count.fetch_add(1, Ordering::SeqCst);
                let permit = wait.acquire().await.unwrap();
                permit.forget();
                Err(niu_media::asset_transport::AssetCreateError::Uncertain)
            },
        )
        .await
        .unwrap();
        occupied.push(
            created["data"]["id"]
                .as_str()
                .unwrap()
                .parse::<Uuid>()
                .unwrap(),
        );
    }
    let excess = create_with_dispatch(
        state.clone(),
        vendor.id,
        headers.clone(),
        make_input(Uuid::new_v4()),
        |_, _| async { panic!("Excess capacity must not dispatch") },
    )
    .await;
    assert!(excess.is_err());
    let (_, Json(saved)) = create_with_dispatch(
        state.clone(),
        vendor.id,
        headers.clone(),
        make_input(key),
        |_, _| async { panic!("Saved status cannot consume dispatch capacity") },
    )
    .await
    .unwrap();
    assert_eq!(saved["data"]["status"], "succeeded");
    // Reading an accepted request also survives revoked/erased keys and restart.
    state
        .store
        .revoke_asset_management_credentials(vendor.id, 1, true)
        .await
        .unwrap();
    let mut restarted = test_state(None, pool.clone());
    restarted.vendor_cipher = None;
    let (_, Json(saved)) = create_with_dispatch(
        restarted.clone(),
        vendor.id,
        headers.clone(),
        make_input(key),
        |_, _| async { panic!("Erased keys cannot permit replay") },
    )
    .await
    .unwrap();
    assert_eq!(saved["data"]["id"], id.to_string());
    let mut conflict = make_input(key);
    conflict.name = "Changed request".into();
    assert!(
        create_with_dispatch(
            restarted,
            vendor.id,
            headers.clone(),
            conflict,
            |_, _| async { panic!("Changed requests cannot replay") }
        )
        .await
        .is_err()
    );
    barrier.add_permits(4);
    tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            let mut done = true;
            for id in &occupied {
                done &= state
                    .store
                    .asset_group_create_intent(scope, *id)
                    .await
                    .unwrap()
                    .unwrap()
                    .state
                    == "uncertain";
            }
            if done && state.inference_in_flight.load(Ordering::SeqCst) == 0 {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    let outcome: (String, Option<String>, i64) = sqlx::query_as(
        "SELECT outcome,reason,duration_ms FROM asset_group_dispatch_outcomes WHERE intent_id=$1",
    )
    .bind(id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(outcome.0, "succeeded");
    assert!(outcome.1.is_none());
    assert!(outcome.2 >= 0);
    let uncertain_reason: String =
        sqlx::query_scalar("SELECT reason FROM asset_group_dispatch_outcomes WHERE intent_id=$1")
            .bind(uncertain_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(uncertain_reason, "upstream_uncertain");
    assert!(
        sqlx::query("DELETE FROM asset_group_dispatch_outcomes WHERE intent_id=$1")
            .bind(id)
            .execute(&pool)
            .await
            .is_err()
    );
    assert_eq!(sent.load(Ordering::SeqCst), 6);
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn asset_group_reads_dispatch_original_account_and_finish_after_disconnect(pool: PgPool) {
    use crate::vendors::asset_reads::{ReadInput, read_with_dispatch};
    use niu_media::asset_read::OrdinaryGroupDetails;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::Duration;
    let mut state = test_state(None, pool.clone());
    let cipher = Arc::new(crate::vendors::crypto::CredentialCipher::new(MASTER).unwrap());
    state.vendor_cipher = Some(cipher.clone());
    let scope = state.store.default_workspace().await.unwrap();
    let vendor = state
        .store
        .create_vendor(niu_storage::VendorInput {
            id: Uuid::new_v4(),
            name: "Read runtime fixture".into(),
            adapter: "openai".into(),
            api_base: "https://ark.cn-beijing.volcengineapi.com/api/v3".into(),
            enabled: false,
            credential_ciphertext: vec![1; 48],
        })
        .await
        .unwrap();
    let encrypted = cipher
        .seal_asset_management(
            vendor.id,
            1,
            "original-project",
            "AKEXAMPLE",
            "fixture-secret",
        )
        .unwrap();
    state
        .store
        .save_asset_management_credential(vendor.id, 0, "original-project", &encrypted)
        .await
        .unwrap();
    let qualification = || niu_storage::AssetOperationQualification {
        vendor_id: vendor.id,
        vendor_revision: 1,
        credential_revision: 1,
        rights_sha256: [1; 32],
        protocol_sha256: [2; 32],
        data_handling_sha256: [3; 32],
        free_operation_sha256: [4; 32],
        valid_for_seconds: 3600,
    };
    state
        .store
        .qualify_asset_group_creation(scope, qualification(), OperatorAuditActor::Installation)
        .await
        .unwrap();
    let request =
        niu_media::asset_group::OrdinaryAssetGroupCreate::new("Character".into(), None).unwrap();
    let intent = state
        .store
        .prepare_asset_group_create(scope, Uuid::new_v4(), vendor.id, 1, &request)
        .await
        .unwrap();
    assert!(
        state
            .store
            .claim_asset_group_create(scope, intent.id)
            .await
            .unwrap()
    );
    assert!(
        state
            .store
            .record_asset_group_dispatch_outcome(scope, intent.id, Some("group-original"), None, 1)
            .await
            .unwrap()
    );
    let preparation_app = router(state.clone());
    let update = Uuid::new_v4();
    let update_path = format!(
        "/admin/v1/vendors/{}/asset-management/group-updates",
        vendor.id
    );
    let patch_input = json!({"organization_id":scope.organization_id,"project_id":scope.project_id,"intent_id":intent.id,"update_id":update,"name":"Encrypted rename"});
    assert_eq!(
        call(
            &preparation_app,
            Method::POST,
            &update_path,
            "invalid",
            patch_input.clone()
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        call(
            &preparation_app,
            Method::POST,
            &update_path,
            ADMIN,
            patch_input.clone()
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    state
        .store
        .qualify_asset_group_update(scope, qualification(), OperatorAuditActor::Installation)
        .await
        .unwrap();
    let (status, prepared) = call(
        &preparation_app,
        Method::POST,
        &update_path,
        ADMIN,
        patch_input.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(prepared["data"]["dispatch_available"], false);
    assert_eq!(
        call(
            &preparation_app,
            Method::POST,
            &update_path,
            ADMIN,
            patch_input.clone()
        )
        .await
        .0,
        StatusCode::OK
    );
    let mut changed = patch_input.clone();
    changed["name"] = json!("Different rename");
    assert_eq!(
        call(&preparation_app, Method::POST, &update_path, ADMIN, changed)
            .await
            .0,
        StatusCode::CONFLICT
    );
    for (field, value) in [
        ("upstream_group_id", json!("group-other")),
        ("description", Value::Null),
    ] {
        let mut injected = patch_input.clone();
        injected[field] = value;
        let response = preparation_app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri(&update_path)
                    .header("authorization", format!("Bearer {ADMIN}"))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(injected.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
    }
    let saved: Vec<u8> =
        sqlx::query_scalar("SELECT ciphertext FROM asset_group_update_patches WHERE update_id=$1")
            .bind(update)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(
        !saved
            .windows(b"Encrypted rename".len())
            .any(|bytes| bytes == b"Encrypted rename")
    );
    let reconstructed = crate::vendors::crypto::CredentialCipher::new(MASTER).unwrap();
    let plaintext = reconstructed
        .open_asset_update_patch(scope, update, &saved)
        .unwrap();
    assert_eq!(
        serde_json::from_str::<Value>(&plaintext).unwrap(),
        json!({"Id":"group-original","ProjectName":"original-project","Name":"Encrypted rename"})
    );
    assert!(
        reconstructed
            .open_asset_update_patch(scope, Uuid::new_v4(), &saved)
            .is_err()
    );
    assert!(
        reconstructed
            .open_asset_update_patch(
                niu_storage::TenantScope {
                    project_id: Uuid::new_v4(),
                    ..scope
                },
                update,
                &saved
            )
            .is_err()
    );
    assert!(
        reconstructed
            .open_asset_update_patch(
                niu_storage::TenantScope {
                    organization_id: Uuid::new_v4(),
                    ..scope
                },
                update,
                &saved
            )
            .is_err()
    );
    assert!(
        reconstructed
            .open_asset_read_result(scope, update, &saved)
            .is_err()
    );
    assert!(
        reconstructed
            .open_asset_lookup_result(scope, update, &saved)
            .is_err()
    );
    assert!(
        reconstructed
            .open_asset_listing_result(scope, update, &saved)
            .is_err()
    );
    let mut tampered = saved.clone();
    *tampered.last_mut().unwrap() ^= 1;
    assert!(
        reconstructed
            .open_asset_update_patch(scope, update, &tampered)
            .is_err()
    );
    use crate::vendors::asset_updates::{DispatchInput, dispatch_with_transport};
    let dispatch_input = || DispatchInput {
        organization_id: scope.organization_id,
        project_id: scope.project_id,
    };
    let mut update_headers = HeaderMap::new();
    update_headers.insert("authorization", format!("Bearer {ADMIN}").parse().unwrap());
    assert!(
        dispatch_with_transport(
            state.clone(),
            Uuid::new_v4(),
            update,
            update_headers.clone(),
            dispatch_input(),
            |_, _| async { panic!("wrong account must not dispatch") }
        )
        .await
        .is_err()
    );
    let expected = serde_json::from_str::<Value>(&plaintext).unwrap();
    let Json(acknowledged) = dispatch_with_transport(
        state.clone(),
        vendor.id,
        update,
        update_headers.clone(),
        dispatch_input(),
        move |signer, claimed| async move {
            let signed = signer
                .sign_update_group("20261008T000000Z", claimed.request())
                .unwrap();
            assert_eq!(
                serde_json::from_slice::<Value>(&signed.body).unwrap(),
                expected
            );
            Ok(())
        },
    )
    .await
    .unwrap();
    assert_eq!(acknowledged["data"]["status"], "acknowledged");
    assert_eq!(acknowledged["data"]["reconciliation_required"], true);
    assert!(
        dispatch_with_transport(
            state.clone(),
            vendor.id,
            update,
            update_headers.clone(),
            dispatch_input(),
            |_, _| async { panic!("must not replay") }
        )
        .await
        .is_err()
    );
    let outcome: String =
        sqlx::query_scalar("SELECT outcome FROM asset_group_update_outcomes WHERE update_id=$1")
            .bind(update)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(outcome, "acknowledged");
    let second_intent = state
        .store
        .prepare_asset_group_create(scope, Uuid::new_v4(), vendor.id, 1, &request)
        .await
        .unwrap();
    assert!(
        state
            .store
            .claim_asset_group_create(scope, second_intent.id)
            .await
            .unwrap()
    );
    state
        .store
        .record_asset_group_dispatch_outcome(scope, second_intent.id, Some("group-second"), None, 1)
        .await
        .unwrap();
    let second_update = Uuid::new_v4();
    let mut second_patch = patch_input.clone();
    second_patch["intent_id"] = json!(second_intent.id);
    second_patch["update_id"] = json!(second_update);
    assert_eq!(
        call(
            &preparation_app,
            Method::POST,
            &update_path,
            ADMIN,
            second_patch
        )
        .await
        .0,
        StatusCode::CREATED
    );
    let Json(uncertain) = dispatch_with_transport(
        state.clone(),
        vendor.id,
        second_update,
        update_headers.clone(),
        dispatch_input(),
        |_, _| async { Err(niu_media::asset_read::ReadError::Transport) },
    )
    .await
    .unwrap();
    assert_eq!(uncertain["data"]["status"], "uncertain");
    let outcome: (String, Option<String>) =
        sqlx::query_as("SELECT outcome,reason FROM asset_group_update_outcomes WHERE update_id=$1")
            .bind(second_update)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(outcome, ("uncertain".into(), Some("transport".into())));
    assert!(
        dispatch_with_transport(
            state.clone(),
            vendor.id,
            second_update,
            update_headers.clone(),
            dispatch_input(),
            |_, _| async { panic!("uncertain must not replay") }
        )
        .await
        .is_err()
    );
    // Saturated execution rejects before claiming; disconnect cannot release a slot.
    let mut capacity_updates = Vec::new();
    for index in 0..5 {
        let saved_group = state
            .store
            .prepare_asset_group_create(scope, Uuid::new_v4(), vendor.id, 1, &request)
            .await
            .unwrap();
        assert!(
            state
                .store
                .claim_asset_group_create(scope, saved_group.id)
                .await
                .unwrap()
        );
        state
            .store
            .record_asset_group_dispatch_outcome(
                scope,
                saved_group.id,
                Some(&format!("group-capacity-{index}")),
                None,
                1,
            )
            .await
            .unwrap();
        let update = Uuid::new_v4();
        let mut patch = patch_input.clone();
        patch["intent_id"] = json!(saved_group.id);
        patch["update_id"] = json!(update);
        assert_eq!(
            call(&preparation_app, Method::POST, &update_path, ADMIN, patch)
                .await
                .0,
            StatusCode::CREATED
        );
        capacity_updates.push(update);
    }
    let release = Arc::new(tokio::sync::Semaphore::new(0));
    let (entered_tx, mut entered_rx) = tokio::sync::mpsc::channel(4);
    let mut callers = Vec::new();
    for update in capacity_updates.iter().take(4).copied() {
        let worker_state = state.clone();
        let worker_headers = update_headers.clone();
        let release = release.clone();
        let entered = entered_tx.clone();
        let vendor_id = vendor.id;
        callers.push(tokio::spawn(async move {
            dispatch_with_transport(
                worker_state,
                vendor_id,
                update,
                worker_headers,
                DispatchInput {
                    organization_id: scope.organization_id,
                    project_id: scope.project_id,
                },
                move |_, _| async move {
                    entered.send(update).await.unwrap();
                    release.acquire().await.unwrap().forget();
                    Ok(())
                },
            )
            .await
        }));
    }
    for _ in 0..4 {
        tokio::time::timeout(Duration::from_secs(5), entered_rx.recv())
            .await
            .unwrap()
            .unwrap();
    }
    let disconnected = callers.remove(0);
    disconnected.abort();
    assert!(disconnected.await.unwrap_err().is_cancelled());
    let rejected = dispatch_with_transport(
        state.clone(),
        vendor.id,
        capacity_updates[4],
        update_headers.clone(),
        dispatch_input(),
        |_, _| async { panic!("capacity rejection must not dispatch") },
    )
    .await;
    let error = match rejected {
        Err(error) => error,
        Ok(_) => panic!("fifth update must be rejected"),
    };
    assert_eq!(
        axum::response::IntoResponse::into_response(error).status(),
        StatusCode::SERVICE_UNAVAILABLE
    );
    let claimed: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM asset_group_update_claims WHERE update_id=$1)",
    )
    .bind(capacity_updates[4])
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(!claimed);
    release.add_permits(4);
    for caller in callers {
        assert_eq!(
            caller.await.unwrap().unwrap().0["data"]["status"],
            "acknowledged"
        );
    }
    tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            let count: i64 = sqlx::query_scalar(
                "SELECT count(*) FROM asset_group_update_outcomes WHERE update_id=ANY($1)",
            )
            .bind(&capacity_updates[..4])
            .fetch_one(&pool)
            .await
            .unwrap();
            if count == 4 && state.inference_in_flight.load(Ordering::SeqCst) == 0 {
                break;
            }
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .unwrap();
    let Json(accepted) = dispatch_with_transport(
        state.clone(),
        vendor.id,
        capacity_updates[4],
        update_headers.clone(),
        dispatch_input(),
        |_, _| async { Ok(()) },
    )
    .await
    .unwrap();
    assert_eq!(accepted["data"]["status"], "acknowledged");
    let input = |read_id| ReadInput {
        organization_id: scope.organization_id,
        project_id: scope.project_id,
        intent_id: intent.id,
        read_id,
    };
    let mut headers = HeaderMap::new();
    headers.insert("authorization", format!("Bearer {ADMIN}").parse().unwrap());
    let sent = Arc::new(AtomicUsize::new(0));
    let count = sent.clone();
    assert!(
        read_with_dispatch(
            state.clone(),
            vendor.id,
            headers.clone(),
            input(Uuid::new_v4()),
            move |_, _| async move {
                count.fetch_add(1, Ordering::SeqCst);
                Err(niu_media::asset_read::ReadError::Transport)
            }
        )
        .await
        .is_err()
    );
    assert_eq!(sent.load(Ordering::SeqCst), 0);
    let grant = state
        .store
        .qualify_asset_group_read(scope, qualification(), OperatorAuditActor::Installation)
        .await
        .unwrap();
    use crate::vendors::asset_updates::{ReconcileInput, reconcile_with_transport};
    let reconcile_input = |read_id| ReconcileInput {
        organization_id: scope.organization_id,
        project_id: scope.project_id,
        read_id,
    };
    assert!(
        reconcile_with_transport(
            state.clone(),
            vendor.id,
            second_update,
            update_headers.clone(),
            reconcile_input(Uuid::new_v4()),
            |_, _| async { panic!("uncertain mutation must not read back automatically") }
        )
        .await
        .is_err()
    );
    let mismatch_read = Uuid::new_v4();
    assert!(
        reconcile_with_transport(
            state.clone(),
            vendor.id,
            update,
            update_headers.clone(),
            reconcile_input(mismatch_read),
            |_, _| async {
                Ok(OrdinaryGroupDetails {
                    name: "Wrong name".into(),
                    description: None,
                    created_at: "2026-10-08T00:00:00Z".into(),
                    updated_at: "2026-10-08T00:00:01Z".into(),
                })
            }
        )
        .await
        .is_err()
    );
    let held: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM asset_group_update_holds WHERE update_id=$1)",
    )
    .bind(update)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(held);
    let reconciliation_read = Uuid::new_v4();
    state
        .store
        .claim_asset_group_update_read(scope, update, reconciliation_read)
        .await
        .unwrap()
        .expect("acknowledged update read claim");
    let saved = cipher
        .seal_asset_read_result(
            scope,
            reconciliation_read,
            &json!({
                "read_id": reconciliation_read, "name": "Encrypted rename", "description": null,
                "created_at": "2026-10-08T00:00:00Z", "updated_at": "2026-10-08T00:00:01Z"
            })
            .to_string(),
        )
        .unwrap();
    assert!(
        state
            .store
            .save_asset_group_read_result(scope, reconciliation_read, &saved, 1)
            .await
            .unwrap()
    );
    let Json(reconciled) = reconcile_with_transport(
        state.clone(),
        vendor.id,
        update,
        update_headers.clone(),
        reconcile_input(reconciliation_read),
        |_, _| async move { panic!("saved authorized read must not dispatch again") },
    )
    .await
    .unwrap();
    assert_eq!(reconciled["data"]["status"], "reconciled");
    assert_eq!(reconciled["data"]["reconciliation_required"], false);
    let encrypted_read: Vec<u8> =
        sqlx::query_scalar("SELECT ciphertext FROM asset_group_read_results WHERE read_id=$1")
            .bind(reconciliation_read)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(
        !encrypted_read
            .windows(b"Encrypted rename".len())
            .any(|bytes| bytes == b"Encrypted rename")
    );
    let read_plaintext = reconstructed
        .open_asset_read_result(scope, reconciliation_read, &encrypted_read)
        .unwrap();
    assert_eq!(
        crate::vendors::asset_reads::restore_saved_metadata(&read_plaintext, reconciliation_read)
            .unwrap()
            .name,
        "Encrypted rename"
    );
    assert!(
        reconstructed
            .open_asset_update_patch(scope, update, &encrypted_read)
            .is_err()
    );
    let held: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM asset_group_update_holds WHERE update_id=$1)",
    )
    .bind(update)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(!held);
    assert!(
        reconcile_with_transport(
            state.clone(),
            vendor.id,
            update,
            update_headers.clone(),
            reconcile_input(Uuid::new_v4()),
            |_, _| async { panic!("reconciled update must not send another read") }
        )
        .await
        .is_err()
    );
    let history = niu_storage::Store::from_pool(pool.clone())
        .asset_group_update_history(scope, vendor.id, None, 100)
        .await
        .unwrap();
    let recovered = history
        .iter()
        .find(|row| row["update_id"] == update.to_string())
        .unwrap();
    assert_eq!(recovered["status"], "reconciled");
    let history_path = format!(
        "{update_path}?organization_id={}&project_id={}&limit=1",
        scope.organization_id, scope.project_id
    );
    let (status, page) = call(
        &preparation_app,
        Method::GET,
        &history_path,
        ADMIN,
        json!({}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(page["data"].as_array().unwrap().len(), 1);
    let cursor = page["next_cursor"].as_str().unwrap();
    let (_, next_page) = call(
        &preparation_app,
        Method::GET,
        &format!("{history_path}&after={cursor}"),
        ADMIN,
        json!({}),
    )
    .await;
    assert_eq!(next_page["data"].as_array().unwrap().len(), 1);
    assert_ne!(
        page["data"][0]["update_id"],
        next_page["data"][0]["update_id"]
    );
    let (_, empty) = call(
        &preparation_app,
        Method::GET,
        &format!(
            "{update_path}?organization_id={}&project_id={}",
            scope.organization_id,
            Uuid::new_v4()
        ),
        ADMIN,
        json!({}),
    )
    .await;
    assert!(empty["data"].as_array().unwrap().is_empty());
    for limit in [0, 101] {
        assert_eq!(
            call(
                &preparation_app,
                Method::GET,
                &format!(
                    "{update_path}?organization_id={}&project_id={}&limit={limit}",
                    scope.organization_id, scope.project_id
                ),
                ADMIN,
                json!({})
            )
            .await
            .0,
            StatusCode::BAD_REQUEST
        );
    }
    let delete_path = format!(
        "{update_path}/{update}?organization_id={}&project_id={}",
        scope.organization_id, scope.project_id
    );
    assert_eq!(
        call(
            &preparation_app,
            Method::GET,
            &history_path,
            "invalid",
            json!({})
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    for role in [
        OperatorRole::Owner,
        OperatorRole::Admin,
        OperatorRole::Viewer,
    ] {
        let member = state
            .store
            .create_operator(
                OperatorScope {
                    organization_id: scope.organization_id,
                    project_id: Some(scope.project_id),
                },
                "Workspace update reader",
                role,
                3600,
                OperatorAuditActor::Installation,
            )
            .await
            .unwrap();
        assert_eq!(
            call(
                &preparation_app,
                Method::GET,
                &history_path,
                &member.token,
                json!({})
            )
            .await
            .0,
            StatusCode::FORBIDDEN
        );
        assert_eq!(
            call(
                &preparation_app,
                Method::DELETE,
                &delete_path,
                &member.token,
                json!({})
            )
            .await
            .0,
            StatusCode::FORBIDDEN
        );
    }
    for _ in 0..2 {
        assert_eq!(
            call(
                &preparation_app,
                Method::DELETE,
                &delete_path,
                ADMIN,
                json!({})
            )
            .await
            .0,
            StatusCode::NO_CONTENT
        );
    }
    let retained: Option<Vec<u8>> =
        sqlx::query_scalar("SELECT ciphertext FROM asset_group_update_patches WHERE update_id=$1")
            .bind(update)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(retained.is_none());
    let (_, audit) = call(
        &preparation_app,
        Method::GET,
        &format!(
            "{update_path}?organization_id={}&project_id={}",
            scope.organization_id, scope.project_id
        ),
        ADMIN,
        json!({}),
    )
    .await;
    let row = audit["data"]
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["update_id"] == update.to_string())
        .unwrap();
    assert_eq!(row["status"], "reconciled");
    assert_eq!(row["patch_status"], "erased");
    assert_eq!(row.as_object().unwrap().len(), 9);
    for private in [
        "Encrypted rename",
        "group-original",
        "original-project",
        "ciphertext",
        "credential",
        "patch_sha256",
        "amount",
    ] {
        assert!(!audit.to_string().contains(private));
    }
    let financial_rows:i64=sqlx::query_scalar("SELECT (SELECT count(*) FROM customer_balance_entries WHERE organization_id=$1)+(SELECT count(*) FROM customer_balance_reservations WHERE organization_id=$1)+(SELECT count(*) FROM customer_charges WHERE organization_id=$1)").bind(scope.organization_id).fetch_one(&pool).await.unwrap();
    assert_eq!(financial_rows, 0);

    let read_id = Uuid::new_v4();
    let count = sent.clone();
    let (response_headers, Json(result)) = read_with_dispatch(
        state.clone(),
        vendor.id,
        headers.clone(),
        input(read_id),
        move |signer, claimed| async move {
            count.fetch_add(1, Ordering::SeqCst);
            let signed = signer
                .sign_get_group("20261008T000000Z", claimed.request())
                .unwrap();
            assert_eq!(
                serde_json::from_slice::<serde_json::Value>(&signed.body).unwrap(),
                json!({"Id":"group-original","ProjectName":"original-project"})
            );
            Ok(OrdinaryGroupDetails {
                name: "Character".into(),
                description: None,
                created_at: "2026-10-08T00:00:00Z".into(),
                updated_at: "2026-10-08T00:00:01Z".into(),
            })
        },
    )
    .await
    .unwrap();
    assert_eq!(response_headers, [("cache-control", "no-store")]);
    assert_eq!(result["data"]["name"], "Character");
    assert!(!result.to_string().contains("group-original"));
    assert!(!result.to_string().contains("original-project"));
    let recovered_path = format!(
        "/admin/v1/vendors/{}/asset-management/group-reads/{read_id}?organization_id={}&project_id={}",
        vendor.id, scope.organization_id, scope.project_id
    );
    let mut fresh = test_state(None, pool.clone());
    fresh.vendor_cipher = Some(cipher.clone());
    let reopened = router(fresh);
    let (status, recovered) = call(&reopened, Method::GET, &recovered_path, ADMIN, json!({})).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(recovered, result);
    let encrypted: Vec<u8> =
        sqlx::query_scalar("SELECT ciphertext FROM asset_group_read_results WHERE read_id=$1")
            .bind(read_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(!String::from_utf8_lossy(&encrypted).contains("Character"));
    assert!(
        cipher
            .open_asset_read_result(scope, Uuid::new_v4(), &encrypted)
            .is_err()
    );
    let wrong_scope = niu_storage::TenantScope {
        organization_id: scope.organization_id,
        project_id: Uuid::new_v4(),
    };
    assert!(
        cipher
            .open_asset_read_result(wrong_scope, read_id, &encrypted)
            .is_err()
    );
    assert!(
        state
            .store
            .asset_group_read_result(wrong_scope, vendor.id, read_id)
            .await
            .unwrap()
            .is_none()
    );
    assert_eq!(
        call(&reopened, Method::DELETE, &recovered_path, ADMIN, json!({}))
            .await
            .0,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        call(&reopened, Method::GET, &recovered_path, ADMIN, json!({}))
            .await
            .0,
        StatusCode::NOT_FOUND
    );
    assert!(
        sqlx::query(
            "UPDATE asset_group_read_results SET ciphertext=$2,deleted_at=NULL WHERE read_id=$1"
        )
        .bind(read_id)
        .bind(&encrypted)
        .execute(&pool)
        .await
        .is_err()
    );
    assert!(
        !state
            .store
            .save_asset_group_read_result(scope, read_id, &encrypted, 1)
            .await
            .unwrap()
    );
    let expired_id = Uuid::new_v4();
    state
        .store
        .claim_asset_group_read(scope, intent.id, expired_id)
        .await
        .unwrap()
        .unwrap();
    state
        .store
        .record_asset_group_read_outcome(scope, expired_id, None, 1)
        .await
        .unwrap();
    sqlx::query("INSERT INTO asset_group_read_results(read_id,ciphertext,expires_at) VALUES($1,$2,clock_timestamp()-interval '1 second')").bind(expired_id).bind(&encrypted).execute(&pool).await.unwrap();
    assert!(
        state
            .store
            .asset_group_read_result(scope, vendor.id, expired_id)
            .await
            .unwrap()
            .is_none()
    );
    state.store.purge_expired_request_payloads().await.unwrap();
    let erased:bool=sqlx::query_scalar("SELECT ciphertext IS NULL AND deleted_at IS NOT NULL FROM asset_group_read_results WHERE read_id=$1").bind(expired_id).fetch_one(&pool).await.unwrap();
    assert!(erased);

    assert!(
        read_with_dispatch(
            state.clone(),
            vendor.id,
            headers.clone(),
            input(read_id),
            |_, _| async { panic!("duplicate cannot send") }
        )
        .await
        .is_err()
    );
    assert!(
        read_with_dispatch(
            state.clone(),
            Uuid::new_v4(),
            headers.clone(),
            input(Uuid::new_v4()),
            |_, _| async { panic!("foreign account cannot send") }
        )
        .await
        .is_err()
    );
    let path = format!(
        "/admin/v1/vendors/{}/asset-management/group-reads",
        vendor.id
    );
    assert_eq!(call(&router(state.clone()),Method::POST,&path,"invalid",json!({"organization_id":scope.organization_id,"project_id":scope.project_id,"intent_id":intent.id,"read_id":Uuid::new_v4()})).await.0,StatusCode::UNAUTHORIZED);
    // Capacity is held across dispatch, including after the HTTP caller leaves.
    // An overloaded read must not consume its one-shot durable identity.
    let (entered_tx, mut entered_rx) = tokio::sync::mpsc::channel(4);
    let capacity_release = Arc::new(tokio::sync::Semaphore::new(0));
    let mut capacity_tasks = Vec::new();
    let mut capacity_ids = Vec::new();
    for _ in 0..4 {
        let task_state = state.clone();
        let task_headers = headers.clone();
        let capacity_id = Uuid::new_v4();
        capacity_ids.push(capacity_id);
        let task_input = input(capacity_id);
        let entered = entered_tx.clone();
        let release = capacity_release.clone();
        capacity_tasks.push(tokio::spawn(async move {
            read_with_dispatch(
                task_state,
                vendor.id,
                task_headers,
                task_input,
                move |_, _| async move {
                    entered.send(()).await.unwrap();
                    release.acquire().await.unwrap().forget();
                    Err(niu_media::asset_read::ReadError::Unavailable)
                },
            )
            .await
        }));
    }
    tokio::time::timeout(std::time::Duration::from_secs(5), async {
        for _ in 0..4 {
            entered_rx.recv().await.unwrap();
        }
    })
    .await
    .unwrap();
    let disconnected = capacity_tasks.remove(0);
    disconnected.abort();
    assert!(disconnected.await.unwrap_err().is_cancelled());
    let overloaded_id = Uuid::new_v4();
    let overloaded = read_with_dispatch(
        state.clone(),
        vendor.id,
        headers.clone(),
        input(overloaded_id),
        |_, _| async { panic!("overloaded reads cannot dispatch") },
    )
    .await
    .unwrap_err();
    use axum::response::IntoResponse;
    assert_eq!(
        overloaded.into_response().status(),
        StatusCode::SERVICE_UNAVAILABLE
    );
    let claims: i64 =
        sqlx::query_scalar("SELECT count(*) FROM asset_group_read_claims WHERE id=$1")
            .bind(overloaded_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(claims, 0);
    capacity_release.add_permits(4);
    for task in capacity_tasks {
        assert!(task.await.unwrap().is_err());
    }
    tokio::time::timeout(std::time::Duration::from_secs(5), async {
        loop {
            let completed: i64 = sqlx::query_scalar(
                "SELECT count(*) FROM asset_group_read_outcomes WHERE read_id=ANY($1)",
            )
            .bind(&capacity_ids)
            .fetch_one(&pool)
            .await
            .unwrap();
            if completed == 4 {
                break;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    let admitted = Arc::new(AtomicUsize::new(0));
    let admitted_count = admitted.clone();
    assert!(
        read_with_dispatch(
            state.clone(),
            vendor.id,
            headers.clone(),
            input(overloaded_id),
            move |_, _| async move {
                admitted_count.fetch_add(1, Ordering::SeqCst);
                Err(niu_media::asset_read::ReadError::Unavailable)
            }
        )
        .await
        .is_err()
    );
    assert_eq!(admitted.load(Ordering::SeqCst), 1);
    let claims: i64 =
        sqlx::query_scalar("SELECT count(*) FROM asset_group_read_claims WHERE id=$1")
            .bind(overloaded_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(claims, 1);

    let entered = Arc::new(tokio::sync::Notify::new());
    let release = Arc::new(tokio::sync::Notify::new());
    let signal = entered.clone();
    let wait = release.clone();
    let detached_id = Uuid::new_v4();
    let detached_input = input(detached_id);
    let task_state = state.clone();
    let task = tokio::spawn(async move {
        read_with_dispatch(
            task_state,
            vendor.id,
            headers,
            detached_input,
            move |_, _| async move {
                signal.notify_one();
                wait.notified().await;
                Err(niu_media::asset_read::ReadError::Unavailable)
            },
        )
        .await
    });
    tokio::time::timeout(std::time::Duration::from_secs(5), entered.notified())
        .await
        .unwrap();
    task.abort();
    release.notify_one();
    tokio::time::timeout(std::time::Duration::from_secs(5), async {
        loop {
            let reason: Option<String> =
                sqlx::query_scalar("SELECT reason FROM asset_group_read_outcomes WHERE read_id=$1")
                    .bind(detached_id)
                    .fetch_optional(&pool)
                    .await
                    .unwrap();
            if reason.as_deref() == Some("unavailable") {
                break;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    assert_eq!(sent.load(Ordering::SeqCst), 1);
    let charges: i64 = sqlx::query_scalar("SELECT count(*) FROM customer_charges")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(charges, 0);

    let delete_id = Uuid::new_v4();
    let delete_state = state.clone();
    let mut delete_headers = HeaderMap::new();
    delete_headers.insert("authorization", format!("Bearer {ADMIN}").parse().unwrap());
    let erased_in_flight = read_with_dispatch(
        state.clone(),
        vendor.id,
        delete_headers,
        input(delete_id),
        move |_, _| async move {
            assert!(
                delete_state
                    .store
                    .delete_asset_group_read_result(scope, vendor.id, delete_id)
                    .await
                    .unwrap()
            );
            Ok(OrdinaryGroupDetails {
                name: "Deleted while running".into(),
                description: None,
                created_at: "2026-10-08T00:00:00Z".into(),
                updated_at: "2026-10-08T00:00:01Z".into(),
            })
        },
    )
    .await;
    assert!(erased_in_flight.is_err());
    let restored: i64 =
        sqlx::query_scalar("SELECT count(*) FROM asset_group_read_results WHERE read_id=$1")
            .bind(delete_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(restored, 0);
    let rollback_id = Uuid::new_v4();
    state
        .store
        .claim_asset_group_read(scope, intent.id, rollback_id)
        .await
        .unwrap()
        .unwrap();
    sqlx::query("CREATE FUNCTION reject_read_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture'; END; $$").execute(&pool).await.unwrap();
    sqlx::query("CREATE TRIGGER reject_read_fixture BEFORE INSERT ON asset_group_read_results FOR EACH ROW EXECUTE FUNCTION reject_read_fixture()").execute(&pool).await.unwrap();
    assert!(
        state
            .store
            .save_asset_group_read_result(scope, rollback_id, &encrypted, 1)
            .await
            .is_err()
    );
    let partial: i64 =
        sqlx::query_scalar("SELECT count(*) FROM asset_group_read_outcomes WHERE read_id=$1")
            .bind(rollback_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(partial, 0);
    sqlx::query("DROP TRIGGER reject_read_fixture ON asset_group_read_results")
        .execute(&pool)
        .await
        .unwrap();
    let revoked_id = Uuid::new_v4();
    let revoke_state = state.clone();
    let mut current_headers = HeaderMap::new();
    current_headers.insert("authorization", format!("Bearer {ADMIN}").parse().unwrap());
    let denied = read_with_dispatch(
        state.clone(),
        vendor.id,
        current_headers,
        input(revoked_id),
        move |_, _| async move {
            revoke_state
                .store
                .revoke_asset_operation_authorization(grant, OperatorAuditActor::Installation)
                .await
                .unwrap();
            Ok(OrdinaryGroupDetails {
                name: "Must not be delivered".into(),
                description: None,
                created_at: "2026-10-08T00:00:00Z".into(),
                updated_at: "2026-10-08T00:00:01Z".into(),
            })
        },
    )
    .await;
    assert!(denied.is_err());
    let recorded: String =
        sqlx::query_scalar("SELECT outcome FROM asset_group_read_outcomes WHERE read_id=$1")
            .bind(revoked_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(recorded, "succeeded");
    let history_path = format!(
        "/admin/v1/vendors/{}/asset-management/group-reads?organization_id={}&project_id={}",
        vendor.id, scope.organization_id, scope.project_id
    );
    let (status, history) = call(&reopened, Method::GET, &history_path, ADMIN, json!({})).await;
    assert_eq!(status, StatusCode::OK);
    let rows = history["data"].as_array().unwrap();
    assert!(rows.iter().any(|row| row["status"] == "unresolved"
        && row["duration_ms"].is_null()
        && row["completed_at"].is_null()));
    assert!(
        rows.iter()
            .any(|row| row["status"] == "failed" && row["reason"] == "unavailable")
    );
    assert!(rows.iter().any(|row| {
        row["status"] == "succeeded"
            && row["duration_ms"]
                .as_i64()
                .is_some_and(|duration| duration >= 0)
    }));
    for private in [
        "Character",
        "Deleted while running",
        "original-project",
        "group-original",
        "ciphertext",
        "rights_sha256",
    ] {
        assert!(!history.to_string().contains(private));
    }
    let mut cursor = None;
    let mut seen = std::collections::HashSet::new();
    loop {
        let page_path = match &cursor {
            Some(value) => format!("{history_path}&limit=1&after={value}"),
            None => format!("{history_path}&limit=1"),
        };
        let (_, page) = call(&reopened, Method::GET, &page_path, ADMIN, json!({})).await;
        for row in page["data"].as_array().unwrap() {
            assert!(seen.insert(row["read_id"].as_str().unwrap().to_owned()));
        }
        cursor = page["next_cursor"].as_str().map(str::to_owned);
        if cursor.is_none() {
            break;
        }
    }
    assert_eq!(seen.len(), rows.len());
    assert_eq!(
        call(
            &reopened,
            Method::GET,
            &format!("{history_path}&limit=101"),
            ADMIN,
            json!({})
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        call(&reopened, Method::GET, &history_path, "invalid", json!({}))
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
    let foreign_path =
        history_path.replace(&scope.project_id.to_string(), &Uuid::new_v4().to_string());
    assert!(
        call(&reopened, Method::GET, &foreign_path, ADMIN, json!({}))
            .await
            .1["data"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    assert!(
        state
            .store
            .asset_group_read_history(scope, Uuid::new_v4(), None, 30)
            .await
            .unwrap()
            .is_empty()
    );
    let response = reopened
        .clone()
        .oneshot(
            Request::builder()
                .uri(&history_path)
                .header("authorization", format!("Bearer {ADMIN}"))
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.headers().get("cache-control").unwrap(), "no-store");
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn asset_listing_runtime_encrypts_recovers_erases_and_withholds_revoked_pages(pool: PgPool) {
    use crate::vendors::asset_listings::{ListingInput, list_with_dispatch};
    use niu_media::asset_list::{OrdinaryAssetList, OrdinaryAssetPage};
    use std::sync::atomic::{AtomicUsize, Ordering};
    fn page(request: &OrdinaryAssetList) -> OrdinaryAssetPage {
        OrdinaryAssetPage::restore_private(&serde_json::to_vec(&json!({
            "ResponseMetadata":{"Action":"ListAssets","Version":"2024-01-01","Service":"ark","Region":"cn-beijing"},
            "Result":{"Items":[{"Id":"asset-private","GroupId":"group-original","ProjectName":"original-project","Name":"Private character",
                "AssetType":"Image","Status":"Processing","CreateTime":"2026-10-08T00:00:00Z","UpdateTime":"2026-10-08T00:00:01Z",
                "URL":"https://private.invalid/signed?secret=discard","Error":{"Message":"Raw secret error"}}],"NextToken":if request.is_continuation() {None} else {Some("private-cursor")}}
        })).unwrap(),request).unwrap()
    }
    let mut state = test_state(None, pool.clone());
    let cipher = Arc::new(crate::vendors::crypto::CredentialCipher::new(MASTER).unwrap());
    state.vendor_cipher = Some(cipher.clone());
    let scope = state.store.default_workspace().await.unwrap();
    let vendor = state
        .store
        .create_vendor(niu_storage::VendorInput {
            id: Uuid::new_v4(),
            name: "Read runtime fixture".into(),
            adapter: "openai".into(),
            api_base: "https://ark.cn-beijing.volcengineapi.com/api/v3".into(),
            enabled: false,
            credential_ciphertext: vec![1; 48],
        })
        .await
        .unwrap();
    let encrypted = cipher
        .seal_asset_management(
            vendor.id,
            1,
            "original-project",
            "AKEXAMPLE",
            "fixture-secret",
        )
        .unwrap();
    state
        .store
        .save_asset_management_credential(vendor.id, 0, "original-project", &encrypted)
        .await
        .unwrap();
    let qualification = || niu_storage::AssetOperationQualification {
        vendor_id: vendor.id,
        vendor_revision: 1,
        credential_revision: 1,
        rights_sha256: [1; 32],
        protocol_sha256: [2; 32],
        data_handling_sha256: [3; 32],
        free_operation_sha256: [4; 32],
        valid_for_seconds: 3600,
    };
    state
        .store
        .qualify_asset_group_creation(scope, qualification(), OperatorAuditActor::Installation)
        .await
        .unwrap();
    let request =
        niu_media::asset_group::OrdinaryAssetGroupCreate::new("Character".into(), None).unwrap();
    let intent = state
        .store
        .prepare_asset_group_create(scope, Uuid::new_v4(), vendor.id, 1, &request)
        .await
        .unwrap();
    assert!(
        state
            .store
            .claim_asset_group_create(scope, intent.id)
            .await
            .unwrap()
    );
    assert!(
        state
            .store
            .record_asset_group_dispatch_outcome(scope, intent.id, Some("group-original"), None, 1)
            .await
            .unwrap()
    );

    state
        .store
        .qualify_asset_group_read(scope, qualification(), OperatorAuditActor::Installation)
        .await
        .unwrap();
    let input = |listing_id| ListingInput {
        organization_id: scope.organization_id,
        project_id: scope.project_id,
        intent_id: intent.id,
        listing_id,
        maximum_items: 2,
        previous_listing_id: None,
    };
    let mut headers = HeaderMap::new();
    headers.insert("authorization", format!("Bearer {ADMIN}").parse().unwrap());
    assert!(
        list_with_dispatch(
            state.clone(),
            vendor.id,
            headers.clone(),
            input(Uuid::new_v4()),
            |_, _| async { panic!("no listing grant") }
        )
        .await
        .is_err()
    );
    let grant = state
        .store
        .qualify_asset_listing(scope, qualification(), OperatorAuditActor::Installation)
        .await
        .unwrap();
    let listing = Uuid::new_v4();
    let sent = Arc::new(AtomicUsize::new(0));
    let count = sent.clone();
    let (response_headers, Json(result)) = list_with_dispatch(
        state.clone(),
        vendor.id,
        headers.clone(),
        input(listing),
        move |signer, claimed| async move {
            count.fetch_add(1, Ordering::SeqCst);
            let signed = signer
                .sign_list_assets("20261008T000000Z", claimed.request())
                .unwrap();
            let body: Value = serde_json::from_slice(&signed.body).unwrap();
            assert_eq!(body["ProjectName"], "original-project");
            Ok(page(claimed.request()))
        },
    )
    .await
    .unwrap();
    assert_eq!(response_headers, [("cache-control", "no-store")]);
    assert_eq!(result["data"]["items"][0]["name"], "Private character");
    assert_eq!(result["data"]["items"][0]["status"], "Processing");
    assert_eq!(result["data"]["has_more"], true);
    for private in [
        "asset-private",
        "group-original",
        "original-project",
        "private-cursor",
        "https://",
        "Raw secret error",
    ] {
        assert!(!result.to_string().contains(private));
    }
    use crate::vendors::asset_lookups::{LookupInput, lookup_with_dispatch};
    let lookup_input = |lookup_id| LookupInput {
        organization_id: scope.organization_id,
        project_id: scope.project_id,
        listing_id: listing,
        lookup_id,
        item_index: 0,
    };
    let lookup_id = Uuid::new_v4();
    assert!(
        lookup_with_dispatch(
            state.clone(),
            vendor.id,
            headers.clone(),
            lookup_input(lookup_id),
            |_, _| async { panic!("listing permission must not dispatch lookup") }
        )
        .await
        .is_err()
    );
    let lookup_grant = state
        .store
        .qualify_asset_lookup(scope, qualification(), OperatorAuditActor::Installation)
        .await
        .unwrap();
    let (lookup_headers, Json(lookup_result)) = lookup_with_dispatch(
        state.clone(),
        vendor.id,
        headers.clone(),
        lookup_input(lookup_id),
        |signer, claimed| async move {
            let signed = signer
                .sign_get_asset("20261008T000000Z", claimed.request())
                .unwrap();
            assert_eq!(
                serde_json::from_slice::<Value>(&signed.body).unwrap(),
                json!({"Id":"asset-private","ProjectName":"original-project"})
            );
            let request = OrdinaryAssetList::first_page(
                "group-original".into(),
                "original-project".into(),
                2,
            )
            .unwrap();
            let mut asset = page(&request).items.remove(0);
            asset.status = niu_media::asset_list::AssetStatus::Failed;
            Ok(asset)
        },
    )
    .await
    .unwrap();
    assert_eq!(lookup_headers, [("cache-control", "no-store")]);
    assert_eq!(
        lookup_result["data"],
        json!({"lookup_id":lookup_id,"status":"succeeded","asset_status":"Failed"})
    );
    assert!(
        lookup_with_dispatch(
            state.clone(),
            vendor.id,
            headers.clone(),
            lookup_input(lookup_id),
            |_, _| async { panic!("duplicate lookup must not replay") }
        )
        .await
        .is_err()
    );
    let lookup_result_path = format!(
        "/admin/v1/vendors/{}/asset-management/lookups/{}?organization_id={}&project_id={}",
        vendor.id, lookup_id, scope.organization_id, scope.project_id
    );
    let lookup_app = router(state.clone());
    let (status, saved_lookup) = call(
        &lookup_app,
        Method::GET,
        &lookup_result_path,
        ADMIN,
        json!({}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(saved_lookup["data"]["asset"]["name"], "Private character");
    assert_eq!(saved_lookup["data"]["asset"]["status"], "Failed");
    assert_eq!(saved_lookup["data"]["asset"].as_object().unwrap().len(), 6);
    for private in [
        "asset-private",
        "group-original",
        "original-project",
        "https://",
        "Raw secret error",
    ] {
        assert!(!saved_lookup.to_string().contains(private));
    }
    let (lookup_ciphertext, _) = state
        .store
        .asset_lookup_result_context(scope, vendor.id, lookup_id)
        .await
        .unwrap()
        .unwrap();
    assert!(
        !lookup_ciphertext
            .windows(b"Private character".len())
            .any(|v| v == b"Private character")
    );
    assert!(
        cipher
            .open_asset_lookup_result(scope, Uuid::new_v4(), &lookup_ciphertext)
            .is_err()
    );
    assert!(
        cipher
            .open_asset_lookup_result(
                niu_storage::TenantScope {
                    organization_id: scope.organization_id,
                    project_id: Uuid::new_v4()
                },
                lookup_id,
                &lookup_ciphertext
            )
            .is_err()
    );
    assert!(
        cipher
            .open_asset_listing_result(scope, lookup_id, &lookup_ciphertext)
            .is_err()
    );
    assert!(
        cipher
            .open_asset_read_result(scope, lookup_id, &lookup_ciphertext)
            .is_err()
    );
    let mut reconstructed = test_state(None, pool.clone());
    reconstructed.vendor_cipher = Some(Arc::new(
        crate::vendors::crypto::CredentialCipher::new(MASTER).unwrap(),
    ));
    assert_eq!(
        call(
            &router(reconstructed),
            Method::GET,
            &lookup_result_path,
            ADMIN,
            json!({})
        )
        .await
        .1,
        saved_lookup
    );
    let wrong_lookup_scope = format!(
        "/admin/v1/vendors/{}/asset-management/lookups/{}?organization_id={}&project_id={}",
        vendor.id,
        lookup_id,
        scope.organization_id,
        Uuid::new_v4()
    );
    assert_eq!(
        call(
            &lookup_app,
            Method::GET,
            &wrong_lookup_scope,
            ADMIN,
            json!({})
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    let no_store = lookup_app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri(&lookup_result_path)
                .header("authorization", format!("Bearer {ADMIN}"))
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(no_store.headers().get("cache-control").unwrap(), "no-store");
    let erase_in_flight = Uuid::new_v4();
    let (erase_entered_tx, erase_entered_rx) = tokio::sync::oneshot::channel();
    let (erase_release_tx, erase_release_rx) = tokio::sync::oneshot::channel();
    let erase_state = state.clone();
    let erase_headers = headers.clone();
    let erase_input = lookup_input(erase_in_flight);
    let erase_task = tokio::spawn(async move {
        lookup_with_dispatch(
            erase_state,
            vendor.id,
            erase_headers,
            erase_input,
            move |_, _| async move {
                erase_entered_tx.send(()).unwrap();
                erase_release_rx.await.unwrap();
                let request = OrdinaryAssetList::first_page(
                    "group-original".into(),
                    "original-project".into(),
                    2,
                )
                .unwrap();
                Ok(page(&request).items.remove(0))
            },
        )
        .await
    });
    erase_entered_rx.await.unwrap();
    let erased_path = format!(
        "/admin/v1/vendors/{}/asset-management/lookups/{}?organization_id={}&project_id={}",
        vendor.id, erase_in_flight, scope.organization_id, scope.project_id
    );
    assert_eq!(
        call(&lookup_app, Method::DELETE, &erased_path, ADMIN, json!({}))
            .await
            .0,
        StatusCode::NO_CONTENT
    );
    erase_release_tx.send(()).unwrap();
    let (_, Json(erasure_ack)) = erase_task.await.unwrap().unwrap();
    assert_eq!(erasure_ack["data"]["status"], "succeeded");
    assert_eq!(
        call(&lookup_app, Method::GET, &erased_path, ADMIN, json!({}))
            .await
            .0,
        StatusCode::NOT_FOUND
    );
    let resurrected: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM asset_lookup_results WHERE lookup_id=$1)")
            .bind(erase_in_flight)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(!resurrected);
    let audit: String =
        sqlx::query_scalar("SELECT outcome FROM asset_lookup_outcomes WHERE lookup_id=$1")
            .bind(erase_in_flight)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(audit, "succeeded");
    let (lookup_entered_tx, mut lookup_entered_rx) = tokio::sync::mpsc::channel(4);
    let lookup_release = Arc::new(tokio::sync::Semaphore::new(0));
    let mut lookup_tasks = Vec::new();
    let mut capacity_lookup_ids = Vec::new();
    for _ in 0..4 {
        let id = Uuid::new_v4();
        capacity_lookup_ids.push(id);
        let state = state.clone();
        let headers = headers.clone();
        let input = lookup_input(id);
        let entered = lookup_entered_tx.clone();
        let release = lookup_release.clone();
        lookup_tasks.push(tokio::spawn(async move {
            lookup_with_dispatch(state, vendor.id, headers, input, move |_, _| async move {
                entered.send(()).await.unwrap();
                release.acquire().await.unwrap().forget();
                Err(niu_media::asset_read::ReadError::Unavailable)
            })
            .await
        }));
    }
    tokio::time::timeout(std::time::Duration::from_secs(5), async {
        for _ in 0..4 {
            lookup_entered_rx.recv().await.unwrap();
        }
    })
    .await
    .unwrap();
    let disconnected_lookup = lookup_tasks.remove(0);
    disconnected_lookup.abort();
    assert!(disconnected_lookup.await.unwrap_err().is_cancelled());
    let overloaded_lookup = Uuid::new_v4();
    let overload = lookup_with_dispatch(
        state.clone(),
        vendor.id,
        headers.clone(),
        lookup_input(overloaded_lookup),
        |_, _| async { panic!("overloaded lookup cannot dispatch") },
    )
    .await
    .unwrap_err();
    assert_eq!(
        overload.into_response().status(),
        StatusCode::SERVICE_UNAVAILABLE
    );
    let consumed: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM asset_lookup_claims WHERE id=$1)")
            .bind(overloaded_lookup)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(!consumed);
    lookup_release.add_permits(4);
    for task in lookup_tasks {
        assert!(task.await.unwrap().is_err());
    }
    tokio::time::timeout(std::time::Duration::from_secs(5), async {
        loop {
            let done: i64 = sqlx::query_scalar(
                "SELECT count(*) FROM asset_lookup_outcomes WHERE lookup_id=ANY($1)",
            )
            .bind(&capacity_lookup_ids)
            .fetch_one(&pool)
            .await
            .unwrap();
            if done == 4 {
                break;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    assert!(
        lookup_with_dispatch(
            state.clone(),
            vendor.id,
            headers.clone(),
            lookup_input(overloaded_lookup),
            |_, _| async { Err(niu_media::asset_read::ReadError::Unavailable) }
        )
        .await
        .is_err()
    );
    assert!(
        sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM asset_lookup_claims WHERE id=$1)"
        )
        .bind(overloaded_lookup)
        .fetch_one(&pool)
        .await
        .unwrap()
    );
    let failure_id = Uuid::new_v4();
    assert!(
        lookup_with_dispatch(
            state.clone(),
            vendor.id,
            headers.clone(),
            lookup_input(failure_id),
            |_, _| async { Err(niu_media::asset_read::ReadError::Timeout) }
        )
        .await
        .is_err()
    );
    let detached_id = Uuid::new_v4();
    let (entered_tx, entered_rx) = tokio::sync::oneshot::channel();
    let (release_tx, release_rx) = tokio::sync::oneshot::channel();
    let detached_state = state.clone();
    let detached_headers = headers.clone();
    let detached_input = lookup_input(detached_id);
    let caller = tokio::spawn(async move {
        lookup_with_dispatch(
            detached_state,
            vendor.id,
            detached_headers,
            detached_input,
            move |_, _| async move {
                entered_tx.send(()).unwrap();
                release_rx.await.unwrap();
                Err(niu_media::asset_read::ReadError::Transport)
            },
        )
        .await
    });
    entered_rx.await.unwrap();
    caller.abort();
    let _ = caller.await;
    release_tx.send(()).unwrap();
    tokio::time::timeout(std::time::Duration::from_secs(5), async {
        loop {
            let complete: bool = sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM asset_lookup_outcomes WHERE lookup_id=$1)",
            )
            .bind(detached_id)
            .fetch_one(&pool)
            .await
            .unwrap();
            if complete {
                break;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    state
        .store
        .revoke_asset_operation_authorization(lookup_grant, OperatorAuditActor::Installation)
        .await
        .unwrap();
    assert!(
        lookup_with_dispatch(
            state.clone(),
            vendor.id,
            headers.clone(),
            lookup_input(Uuid::new_v4()),
            |_, _| async { panic!("revoked lookup must not dispatch") }
        )
        .await
        .is_err()
    );
    assert_eq!(
        call(
            &router(state.clone()),
            Method::GET,
            &lookup_result_path,
            ADMIN,
            json!({})
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        call(
            &router(state.clone()),
            Method::DELETE,
            &lookup_result_path,
            ADMIN,
            json!({})
        )
        .await
        .0,
        StatusCode::NO_CONTENT
    );
    let erased: Option<Vec<u8>> =
        sqlx::query_scalar("SELECT ciphertext FROM asset_lookup_results WHERE lookup_id=$1")
            .bind(lookup_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(erased.is_none());
    let lookup_app = router(state.clone());
    let lookup_base = format!("/admin/v1/vendors/{}/asset-management/lookups", vendor.id);
    let lookup_history = format!(
        "{lookup_base}?organization_id={}&project_id={}&limit=1",
        scope.organization_id, scope.project_id
    );
    let cache_response = lookup_app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri(&lookup_history)
                .header("authorization", format!("Bearer {ADMIN}"))
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(
        cache_response.headers().get("cache-control").unwrap(),
        "no-store"
    );
    let (status, history) = call(&lookup_app, Method::GET, &lookup_history, ADMIN, json!({})).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(history["data"].as_array().unwrap().len(), 1);
    assert!(history["next_cursor"].is_string());
    for private in [
        "asset-private",
        "group-original",
        "Private character",
        "fixture-secret",
        "https://",
        "rights_sha256",
    ] {
        assert!(!history.to_string().contains(private));
    }
    assert_eq!(
        call(
            &lookup_app,
            Method::GET,
            &lookup_history,
            "invalid",
            json!({})
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    let ciphertext = state
        .store
        .asset_listing_result(scope, vendor.id, listing)
        .await
        .unwrap()
        .unwrap();
    assert!(
        !ciphertext
            .windows(b"Private character".len())
            .any(|v| v == b"Private character")
    );
    assert!(
        cipher
            .open_asset_listing_result(scope, Uuid::new_v4(), &ciphertext)
            .is_err()
    );
    assert!(
        cipher
            .open_asset_read_result(scope, listing, &ciphertext)
            .is_err()
    );
    let foreign = niu_storage::TenantScope {
        organization_id: scope.organization_id,
        project_id: Uuid::new_v4(),
    };
    assert!(
        cipher
            .open_asset_listing_result(foreign, listing, &ciphertext)
            .is_err()
    );
    assert!(
        list_with_dispatch(
            state.clone(),
            vendor.id,
            headers.clone(),
            input(listing),
            |_, _| async { panic!("duplicate cannot send") }
        )
        .await
        .is_err()
    );
    assert_eq!(sent.load(Ordering::SeqCst), 1);
    let child = Uuid::new_v4();
    let child_input = ListingInput {
        previous_listing_id: Some(listing),
        ..input(child)
    };
    let (_, Json(child_result)) = list_with_dispatch(
        state.clone(),
        vendor.id,
        headers.clone(),
        child_input,
        |signer, claimed| async move {
            let signed = signer
                .sign_list_assets("20261008T000000Z", claimed.request())
                .unwrap();
            let body: Value = serde_json::from_slice(&signed.body).unwrap();
            assert_eq!(body["NextToken"], "private-cursor");
            Ok(page(claimed.request()))
        },
    )
    .await
    .unwrap();
    assert_eq!(child_result["data"]["has_more"], false);
    assert!(
        list_with_dispatch(
            state.clone(),
            vendor.id,
            headers.clone(),
            ListingInput {
                previous_listing_id: Some(listing),
                ..input(Uuid::new_v4())
            },
            |_, _| async { panic!("parent already consumed") }
        )
        .await
        .is_err()
    );
    assert!(
        list_with_dispatch(
            state.clone(),
            vendor.id,
            headers.clone(),
            ListingInput {
                previous_listing_id: Some(child),
                ..input(Uuid::new_v4())
            },
            |_, _| async { panic!("terminal page cannot continue") }
        )
        .await
        .is_err()
    );
    let mut recovered_state = test_state(None, pool.clone());
    recovered_state.vendor_cipher = Some(cipher.clone());
    let app = router(recovered_state);
    let path = format!(
        "/admin/v1/vendors/{}/asset-management/listings/{}?organization_id={}&project_id={}",
        vendor.id, listing, scope.organization_id, scope.project_id
    );
    let (status, recovered) = call(&app, Method::GET, &path, ADMIN, json!({})).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(recovered, result);
    let child_path = format!(
        "/admin/v1/vendors/{}/asset-management/listings/{}?organization_id={}&project_id={}",
        vendor.id, child, scope.organization_id, scope.project_id
    );
    let (status, recovered_child) = call(&app, Method::GET, &child_path, ADMIN, json!({})).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(recovered_child, child_result);

    assert_eq!(
        call(&app, Method::GET, &path, "invalid", json!({})).await.0,
        StatusCode::UNAUTHORIZED
    );
    let base = format!("/admin/v1/vendors/{}/asset-management/listings", vendor.id);
    assert_eq!(call(&app,Method::POST,&base,"invalid",json!({"organization_id":scope.organization_id,"project_id":scope.project_id,"intent_id":intent.id,"listing_id":Uuid::new_v4(),"maximum_items":2})).await.0,StatusCode::UNAUTHORIZED);
    // Workspace authority is deliberately insufficient for platform asset management.
    for role in [
        OperatorRole::Owner,
        OperatorRole::Admin,
        OperatorRole::Viewer,
    ] {
        let member = state
            .store
            .create_operator(
                OperatorScope {
                    organization_id: scope.organization_id,
                    project_id: Some(scope.project_id),
                },
                "Workspace asset reader",
                role,
                3600,
                OperatorAuditActor::Installation,
            )
            .await
            .unwrap();
        assert_eq!(
            call(&app, Method::GET, &lookup_history, &member.token, json!({}))
                .await
                .0,
            StatusCode::FORBIDDEN
        );
        assert_eq!(call(&app,Method::POST,&lookup_base,&member.token,json!({"organization_id":scope.organization_id,"project_id":scope.project_id,"listing_id":listing,"lookup_id":Uuid::new_v4(),"item_index":0})).await.0,StatusCode::FORBIDDEN);
        for method in [Method::GET, Method::DELETE] {
            assert_eq!(
                call(&app, method, &lookup_result_path, &member.token, json!({}))
                    .await
                    .0,
                StatusCode::FORBIDDEN
            );
        }
        let audit_path = format!(
            "{base}?organization_id={}&project_id={}",
            scope.organization_id, scope.project_id
        );
        assert_eq!(
            call(&app, Method::GET, &audit_path, &member.token, json!({}))
                .await
                .0,
            StatusCode::FORBIDDEN
        );
        let denied_id = Uuid::new_v4();
        let payload = json!({"organization_id":scope.organization_id,"project_id":scope.project_id,
            "intent_id":intent.id,"listing_id":denied_id,"maximum_items":2});
        assert_eq!(
            call(&app, Method::POST, &base, &member.token, payload)
                .await
                .0,
            StatusCode::FORBIDDEN
        );
        for method in [Method::GET, Method::DELETE] {
            assert_eq!(
                call(&app, method, &path, &member.token, json!({})).await.0,
                StatusCode::FORBIDDEN
            );
        }
        let claims: i64 =
            sqlx::query_scalar("SELECT count(*) FROM asset_listing_claims WHERE id=$1")
                .bind(denied_id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(claims, 0);
    }
    let key = state
        .store
        .issue_key(scope, "Inference only", &["*".into()], 3600)
        .await
        .unwrap();
    assert_eq!(
        call(&app, Method::GET, &lookup_history, &key.token, json!({}))
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(call(&app,Method::POST,&lookup_base,&key.token,json!({"organization_id":scope.organization_id,"project_id":scope.project_id,"listing_id":listing,"lookup_id":Uuid::new_v4(),"item_index":0})).await.0,StatusCode::UNAUTHORIZED);
    for method in [Method::GET, Method::DELETE] {
        assert_eq!(
            call(&app, method, &lookup_result_path, &key.token, json!({}))
                .await
                .0,
            StatusCode::UNAUTHORIZED
        );
    }
    let denied_id = Uuid::new_v4();
    assert_eq!(call(&app,Method::POST,&base,&key.token,json!({"organization_id":scope.organization_id,
        "project_id":scope.project_id,"intent_id":intent.id,"listing_id":denied_id,"maximum_items":2})).await.0,StatusCode::UNAUTHORIZED);
    for method in [Method::GET, Method::DELETE] {
        assert_eq!(
            call(&app, method, &path, &key.token, json!({})).await.0,
            StatusCode::UNAUTHORIZED
        );
    }
    let administrator = state
        .store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: None,
            },
            "Platform asset administrator",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    sqlx::query("UPDATE admin_operators SET platform_admin=true WHERE id=$1")
        .bind(administrator.operator_id)
        .execute(&pool)
        .await
        .unwrap();
    let (status, admin_page) = call(
        &app,
        Method::GET,
        &child_path,
        &administrator.token,
        json!({}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(admin_page, child_result);

    assert_eq!(
        call(&app, Method::DELETE, &path, ADMIN, json!({})).await.0,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        call(&app, Method::GET, &path, ADMIN, json!({})).await.0,
        StatusCode::NOT_FOUND
    );
    // Capacity is held across dispatch, including after the HTTP caller leaves.
    // An overloaded listing must not consume its one-shot durable identity.
    let (entered_tx, mut entered_rx) = tokio::sync::mpsc::channel(4);
    let capacity_release = Arc::new(tokio::sync::Semaphore::new(0));
    let mut capacity_tasks = Vec::new();
    let mut capacity_ids = Vec::new();
    for _ in 0..4 {
        let task_state = state.clone();
        let task_headers = headers.clone();
        let capacity_id = Uuid::new_v4();
        capacity_ids.push(capacity_id);
        let task_input = input(capacity_id);
        let entered = entered_tx.clone();
        let release = capacity_release.clone();
        capacity_tasks.push(tokio::spawn(async move {
            list_with_dispatch(
                task_state,
                vendor.id,
                task_headers,
                task_input,
                move |_, _| async move {
                    entered.send(()).await.unwrap();
                    release.acquire().await.unwrap().forget();
                    Err(niu_media::asset_read::ReadError::Unavailable)
                },
            )
            .await
        }));
    }
    tokio::time::timeout(std::time::Duration::from_secs(5), async {
        for _ in 0..4 {
            entered_rx.recv().await.unwrap();
        }
    })
    .await
    .unwrap();
    let disconnected = capacity_tasks.remove(0);
    disconnected.abort();
    assert!(disconnected.await.unwrap_err().is_cancelled());
    let overloaded_id = Uuid::new_v4();
    let overloaded = list_with_dispatch(
        state.clone(),
        vendor.id,
        headers.clone(),
        input(overloaded_id),
        |_, _| async { panic!("overloaded listings cannot dispatch") },
    )
    .await
    .unwrap_err();
    use axum::response::IntoResponse;
    assert_eq!(
        overloaded.into_response().status(),
        StatusCode::SERVICE_UNAVAILABLE
    );
    let claims: i64 = sqlx::query_scalar("SELECT count(*) FROM asset_listing_claims WHERE id=$1")
        .bind(overloaded_id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(claims, 0);
    capacity_release.add_permits(4);
    for task in capacity_tasks {
        assert!(task.await.unwrap().is_err());
    }
    tokio::time::timeout(std::time::Duration::from_secs(5), async {
        loop {
            let completed: i64 = sqlx::query_scalar(
                "SELECT count(*) FROM asset_listing_outcomes WHERE listing_id=ANY($1)",
            )
            .bind(&capacity_ids)
            .fetch_one(&pool)
            .await
            .unwrap();
            if completed == 4 {
                break;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    let admitted = Arc::new(AtomicUsize::new(0));
    let admitted_count = admitted.clone();
    assert!(
        list_with_dispatch(
            state.clone(),
            vendor.id,
            headers.clone(),
            input(overloaded_id),
            move |_, _| async move {
                admitted_count.fetch_add(1, Ordering::SeqCst);
                Err(niu_media::asset_read::ReadError::Unavailable)
            }
        )
        .await
        .is_err()
    );
    assert_eq!(admitted.load(Ordering::SeqCst), 1);
    let claims: i64 = sqlx::query_scalar("SELECT count(*) FROM asset_listing_claims WHERE id=$1")
        .bind(overloaded_id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(claims, 1);
    // Erasing the root does not erase the separately retained child.
    let (status, recovered_child) = call(&app, Method::GET, &child_path, ADMIN, json!({})).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(recovered_child, child_result);
    let entered = Arc::new(tokio::sync::Notify::new());
    let released = Arc::new(tokio::sync::Notify::new());
    let signal = entered.clone();
    let release = released.clone();
    let detached = Uuid::new_v4();
    let detached_input = input(detached);
    let detached_state = state.clone();
    let detached_headers = headers.clone();
    let task = tokio::spawn(async move {
        list_with_dispatch(
            detached_state,
            vendor.id,
            detached_headers,
            detached_input,
            move |_, _| async move {
                signal.notify_one();
                release.notified().await;
                Err(niu_media::asset_read::ReadError::Unavailable)
            },
        )
        .await
    });
    tokio::time::timeout(std::time::Duration::from_secs(5), entered.notified())
        .await
        .unwrap();
    task.abort();
    released.notify_one();
    tokio::time::timeout(std::time::Duration::from_secs(5), async {
        loop {
            let outcome: Option<String> =
                sqlx::query_scalar("SELECT reason FROM asset_listing_outcomes WHERE listing_id=$1")
                    .bind(detached)
                    .fetch_optional(&pool)
                    .await
                    .unwrap();
            if outcome.as_deref() == Some("unavailable") {
                break;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    let unresolved = Uuid::new_v4();
    state
        .store
        .claim_asset_listing(scope, intent.id, unresolved, 2)
        .await
        .unwrap()
        .unwrap();
    let revoked = Uuid::new_v4();
    let revoke_state = state.clone();
    assert!(
        list_with_dispatch(
            state.clone(),
            vendor.id,
            headers.clone(),
            input(revoked),
            move |_, claimed| async move {
                revoke_state
                    .store
                    .revoke_asset_operation_authorization(grant, OperatorAuditActor::Installation)
                    .await
                    .unwrap();
                Ok(page(claimed.request()))
            }
        )
        .await
        .is_err()
    );
    let completed: String =
        sqlx::query_scalar("SELECT outcome FROM asset_listing_outcomes WHERE listing_id=$1")
            .bind(revoked)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(completed, "succeeded");
    assert!(
        state
            .store
            .asset_listing_result(scope, vendor.id, revoked)
            .await
            .unwrap()
            .is_none()
    );
    let history_path = format!(
        "{base}?organization_id={}&project_id={}",
        scope.organization_id, scope.project_id
    );
    let (status, history) = call(&app, Method::GET, &history_path, ADMIN, json!({})).await;
    assert_eq!(status, StatusCode::OK);
    let rows = history["data"].as_array().unwrap();
    assert!(
        rows.iter()
            .any(|row| row["listing_id"] == unresolved.to_string()
                && row["status"] == "unresolved"
                && row["completed_at"].is_null()
                && row["duration_ms"].is_null()
                && row["item_count"].is_null()
                && row["has_more"].is_null())
    );
    assert!(rows.iter().any(|row| row["listing_id"] == child.to_string()
        && row["previous_listing_id"] == listing.to_string()
        && row["page_number"] == 2
        && row["status"] == "succeeded"
        && row["has_more"] == false));
    assert!(
        rows.iter()
            .any(|row| row["status"] == "failed" && row["reason"] == "unavailable")
    );
    for row in rows {
        assert_eq!(row.as_object().unwrap().len(), 10);
    }
    for private in [
        "Private character",
        "original-project",
        "group-original",
        "asset-private",
        "private-cursor",
        "ciphertext",
        "rights_sha256",
    ] {
        assert!(!history.to_string().contains(private));
    }
    let mut cursor = None;
    let mut seen = std::collections::HashSet::new();
    loop {
        let page_path = match &cursor {
            Some(value) => format!("{history_path}&limit=1&after={value}"),
            None => format!("{history_path}&limit=1"),
        };
        let (status, page) = call(&app, Method::GET, &page_path, ADMIN, json!({})).await;
        assert_eq!(status, StatusCode::OK);
        for row in page["data"].as_array().unwrap() {
            assert!(seen.insert(row["listing_id"].as_str().unwrap().to_owned()));
        }
        cursor = page["next_cursor"].as_str().map(str::to_owned);
        if cursor.is_none() {
            break;
        }
    }
    assert_eq!(seen.len(), rows.len());
    assert_eq!(
        call(
            &app,
            Method::GET,
            &format!("{history_path}&limit=101"),
            ADMIN,
            json!({})
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        call(&app, Method::GET, &history_path, "invalid", json!({}))
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        call(&app, Method::GET, &history_path, &key.token, json!({}))
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
    let foreign_path =
        history_path.replace(&scope.project_id.to_string(), &Uuid::new_v4().to_string());
    assert!(
        call(&app, Method::GET, &foreign_path, ADMIN, json!({}))
            .await
            .1["data"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    let missing_cursor = format!("{history_path}&after={}", Uuid::new_v4());
    assert!(
        call(&app, Method::GET, &missing_cursor, ADMIN, json!({}))
            .await
            .1["data"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(&history_path)
                .header("authorization", format!("Bearer {ADMIN}"))
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.headers().get("cache-control").unwrap(), "no-store");
    let charges: i64 = sqlx::query_scalar("SELECT count(*) FROM customer_charges")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(charges, 0);
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn deletion_consent_api_is_platform_scoped_revocable_and_never_dispatches(pool: PgPool) {
    let state = test_state(None, pool.clone());
    let scope = state.store.default_workspace().await.unwrap();
    let owner = state
        .store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(scope.project_id),
            },
            "Consent owner",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let vendor = Uuid::new_v4();
    state
        .store
        .create_vendor(niu_storage::VendorInput {
            id: vendor,
            name: "Consent Ark fixture".into(),
            adapter: "openai".into(),
            api_base: "https://ark.cn-beijing.volcengineapi.com/api/v3".into(),
            enabled: false,
            credential_ciphertext: vec![1; 48],
        })
        .await
        .unwrap();
    state
        .store
        .save_asset_management_credential(vendor, 0, "original-project", &[1; 48])
        .await
        .unwrap();
    let qualification = || niu_storage::AssetOperationQualification {
        vendor_id: vendor,
        vendor_revision: 1,
        credential_revision: 1,
        rights_sha256: [1; 32],
        protocol_sha256: [2; 32],
        data_handling_sha256: [3; 32],
        free_operation_sha256: [4; 32],
        valid_for_seconds: 60,
    };
    state
        .store
        .qualify_asset_group_creation(scope, qualification(), OperatorAuditActor::Installation)
        .await
        .unwrap();
    let body =
        niu_media::asset_group::OrdinaryAssetGroupCreate::new("Character".into(), None).unwrap();
    let intent = state
        .store
        .prepare_asset_group_create(scope, Uuid::new_v4(), vendor, 1, &body)
        .await
        .unwrap();
    state
        .store
        .claim_asset_group_create(scope, intent.id)
        .await
        .unwrap();
    state
        .store
        .record_asset_group_dispatch_outcome(
            scope,
            intent.id,
            Some("group-private-original"),
            None,
            1,
        )
        .await
        .unwrap();
    let grant = state
        .store
        .qualify_asset_group_deletion(scope, qualification(), OperatorAuditActor::Installation)
        .await
        .unwrap();
    let id = Uuid::new_v4();
    let input = json!({"organization_id":scope.organization_id,"project_id":scope.project_id,"intent_id":intent.id,"consent_id":id,"authorization_id":grant,"valid_for_seconds":900,"confirm_cascade":true});
    let base = format!("/admin/v1/vendors/{vendor}/asset-management/group-deletion-consents");
    let detail = format!(
        "{base}/{id}?organization_id={}&project_id={}",
        scope.organization_id, scope.project_id
    );
    let app = router(state.clone());
    for token in [&owner.token, "invalid"] {
        for (method, path) in [
            (Method::POST, base.as_str()),
            (Method::GET, detail.as_str()),
            (Method::DELETE, detail.as_str()),
        ] {
            assert!(matches!(
                call(&app, method, path, token, input.clone()).await.0,
                StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN
            ));
        }
    }
    let mut invalid = input.clone();
    invalid["confirm_cascade"] = json!(false);
    assert_eq!(
        call(&app, Method::POST, &base, ADMIN, invalid).await.0,
        StatusCode::BAD_REQUEST
    );
    let wrong = format!(
        "/admin/v1/vendors/{}/asset-management/group-deletion-consents",
        Uuid::new_v4()
    );
    assert_eq!(
        call(&app, Method::POST, &wrong, ADMIN, input.clone())
            .await
            .0,
        StatusCode::NOT_FOUND
    );
    let (status, created) = call(&app, Method::POST, &base, ADMIN, input.clone()).await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(created["data"]["dispatch_available"], false);
    let (status, original) = call(&app, Method::GET, &detail, ADMIN, json!({})).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(original["data"]["status"], "consented");
    assert_eq!(
        call(&app, Method::POST, &base, ADMIN, input.clone())
            .await
            .0,
        StatusCode::OK
    );
    assert_eq!(
        call(
            &router(test_state(None, pool.clone())),
            Method::GET,
            &detail,
            ADMIN,
            json!({})
        )
        .await
        .1,
        original
    );
    for private in [
        "group-private-original",
        "original-project",
        "credential",
        "authorization_id",
        "vendor_id",
        "ciphertext",
        "amount",
    ] {
        assert!(!original.to_string().contains(private));
    }
    let other = state
        .store
        .create_project(scope.organization_id, "Other consent workspace")
        .await
        .unwrap();
    let mismatched = format!(
        "{base}/{id}?organization_id={}&project_id={}",
        other.organization_id, other.project_id
    );
    assert_eq!(
        call(&app, Method::GET, &mismatched, ADMIN, json!({}))
            .await
            .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        call(&app, Method::DELETE, &mismatched, ADMIN, json!({}))
            .await
            .0,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        call(&app, Method::GET, &detail, ADMIN, json!({})).await.1,
        original
    );
    for _ in 0..2 {
        assert_eq!(
            call(&app, Method::DELETE, &detail, ADMIN, json!({}))
                .await
                .0,
            StatusCode::NO_CONTENT
        );
    }
    assert_eq!(
        call(&app, Method::GET, &detail, ADMIN, json!({})).await.1["data"]["status"],
        "revoked"
    );
    assert_eq!(
        call(&app, Method::POST, &base, ADMIN, input).await.0,
        StatusCode::CONFLICT
    );
    let claims: i64 = sqlx::query_scalar("SELECT count(*) FROM asset_group_deletion_claims")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(claims, 0);
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn deletion_dispatch_is_one_shot_and_finishes_after_disconnect(pool: PgPool) {
    let mut state = test_state(None, pool.clone());
    let cipher = Arc::new(crate::vendors::crypto::CredentialCipher::new(MASTER).unwrap());
    state.vendor_cipher = Some(cipher.clone());
    let scope = state.store.default_workspace().await.unwrap();
    let owner = state
        .store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(scope.project_id),
            },
            "Consent owner",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let vendor = Uuid::new_v4();
    state
        .store
        .create_vendor(niu_storage::VendorInput {
            id: vendor,
            name: "Consent Ark fixture".into(),
            adapter: "openai".into(),
            api_base: "https://ark.cn-beijing.volcengineapi.com/api/v3".into(),
            enabled: false,
            credential_ciphertext: vec![1; 48],
        })
        .await
        .unwrap();
    state
        .store
        .save_asset_management_credential(
            vendor,
            0,
            "original-project",
            &cipher
                .seal_asset_management(vendor, 1, "original-project", "AKEXAMPLE", "fixture-secret")
                .unwrap(),
        )
        .await
        .unwrap();
    let qualification = || niu_storage::AssetOperationQualification {
        vendor_id: vendor,
        vendor_revision: 1,
        credential_revision: 1,
        rights_sha256: [1; 32],
        protocol_sha256: [2; 32],
        data_handling_sha256: [3; 32],
        free_operation_sha256: [4; 32],
        valid_for_seconds: 60,
    };
    state
        .store
        .qualify_asset_group_creation(scope, qualification(), OperatorAuditActor::Installation)
        .await
        .unwrap();
    let body =
        niu_media::asset_group::OrdinaryAssetGroupCreate::new("Character".into(), None).unwrap();
    let intent = state
        .store
        .prepare_asset_group_create(scope, Uuid::new_v4(), vendor, 1, &body)
        .await
        .unwrap();
    state
        .store
        .claim_asset_group_create(scope, intent.id)
        .await
        .unwrap();
    state
        .store
        .record_asset_group_dispatch_outcome(
            scope,
            intent.id,
            Some("group-private-original"),
            None,
            1,
        )
        .await
        .unwrap();
    let grant = state
        .store
        .qualify_asset_group_deletion(scope, qualification(), OperatorAuditActor::Installation)
        .await
        .unwrap();
    let id = Uuid::new_v4();
    let input = json!({"organization_id":scope.organization_id,"project_id":scope.project_id,"intent_id":intent.id,"consent_id":id,"authorization_id":grant,"valid_for_seconds":900,"confirm_cascade":true});
    let base = format!("/admin/v1/vendors/{vendor}/asset-management/group-deletion-consents");
    let detail = format!(
        "{base}/{id}?organization_id={}&project_id={}",
        scope.organization_id, scope.project_id
    );
    use crate::vendors::asset_deletions::{DispatchInput, dispatch_with_transport};
    let app = router(state.clone());
    assert_eq!(
        call(&app, Method::POST, &base, ADMIN, input).await.0,
        StatusCode::CREATED
    );
    let dispatch_input = || DispatchInput {
        organization_id: scope.organization_id,
        project_id: scope.project_id,
    };
    let mut headers = HeaderMap::new();
    headers.insert("authorization", format!("Bearer {ADMIN}").parse().unwrap());
    let path = format!("{base}/{id}/dispatch");
    let body = json!({"organization_id":scope.organization_id,"project_id":scope.project_id});
    for token in [&owner.token, "invalid"] {
        assert!(matches!(
            call(&app, Method::POST, &path, token, body.clone()).await.0,
            StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN
        ));
    }
    assert!(
        dispatch_with_transport(
            state.clone(),
            Uuid::new_v4(),
            id,
            headers.clone(),
            dispatch_input(),
            |_, _| async { panic!("wrong Supplier must not dispatch") }
        )
        .await
        .is_err()
    );
    // Reject saturation before claiming: the same saved consent remains usable
    // after capacity returns, rather than becoming an unresolved mutation.
    let capacity = crate::vendors::asset_deletions::DELETIONS
        .clone()
        .acquire_many_owned(4)
        .await
        .unwrap();
    assert_eq!(
        call(&app, Method::POST, &path, ADMIN, body.clone()).await.0,
        StatusCode::SERVICE_UNAVAILABLE
    );
    let unchanged = state
        .store
        .asset_group_deletion_consent_status(scope, vendor, id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(unchanged["status"], "consented");
    let before: i64 = sqlx::query_scalar("SELECT count(*) FROM asset_group_deletion_claims")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(before, 0);
    drop(capacity);
    let (started_tx, started_rx) = tokio::sync::oneshot::channel();
    let (finish_tx, finish_rx) = tokio::sync::oneshot::channel();
    let worker_state = state.clone();
    let worker_headers = headers.clone();
    let args = dispatch_input();
    let request = tokio::spawn(async move {
        dispatch_with_transport(
            worker_state,
            vendor,
            id,
            worker_headers,
            args,
            move |signer, claimed| async move {
                let signed = signer
                    .sign_delete_group("20261009T000000Z", claimed.request())
                    .unwrap();
                let body: Value = serde_json::from_slice(&signed.body).unwrap();
                assert_eq!(body["Id"], "group-private-original");
                assert_eq!(body["ProjectName"], "original-project");
                started_tx.send(()).unwrap();
                finish_rx.await.unwrap();
                Err(niu_media::asset_read::ReadError::Transport)
            },
        )
        .await
    });
    tokio::time::timeout(std::time::Duration::from_secs(5), started_rx)
        .await
        .unwrap()
        .unwrap();
    assert!(
        dispatch_with_transport(
            state.clone(),
            vendor,
            id,
            headers.clone(),
            dispatch_input(),
            |_, _| async { panic!("concurrent dispatch must not send") }
        )
        .await
        .is_err()
    );
    request.abort();
    finish_tx.send(()).unwrap();
    for _ in 0..100 {
        let status = state
            .store
            .asset_group_deletion_consent_status(scope, vendor, id)
            .await
            .unwrap()
            .unwrap();
        if status["status"] == "uncertain" {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
    }
    let saved = call(&app, Method::GET, &detail, ADMIN, json!({})).await.1;
    assert_eq!(saved["data"]["status"], "uncertain");
    assert_eq!(saved["data"]["reason"], "transport");
    assert!(saved["data"]["duration_ms"].as_i64().unwrap() >= 0);
    assert!(
        dispatch_with_transport(
            state.clone(),
            vendor,
            id,
            headers.clone(),
            dispatch_input(),
            |_, _| async { panic!("uncertain mutation must never replay") }
        )
        .await
        .is_err()
    );
    assert_eq!(
        call(
            &router(test_state(None, pool.clone())),
            Method::GET,
            &detail,
            ADMIN,
            json!({})
        )
        .await
        .1,
        saved
    );
    // A different original group gets independent consent, but revoked and
    // expired records must not consume a mutation claim or reach the transport.
    let group_body =
        niu_media::asset_group::OrdinaryAssetGroupCreate::new("Second character".into(), None)
            .unwrap();
    let second = state
        .store
        .prepare_asset_group_create(scope, Uuid::new_v4(), vendor, 1, &group_body)
        .await
        .unwrap();
    state
        .store
        .claim_asset_group_create(scope, second.id)
        .await
        .unwrap();
    state
        .store
        .record_asset_group_dispatch_outcome(
            scope,
            second.id,
            Some("group-second-original"),
            None,
            1,
        )
        .await
        .unwrap();
    let revoked = Uuid::new_v4();
    state
        .store
        .consent_asset_group_deletion(
            scope,
            niu_storage::AssetGroupDeletionConsent {
                id: revoked,
                intent_id: second.id,
                authorization_id: grant,
                valid_for_seconds: 30,
                confirm_cascade: true,
            },
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    state
        .store
        .revoke_asset_group_deletion_consent(scope, revoked, OperatorAuditActor::Installation)
        .await
        .unwrap();
    assert!(
        dispatch_with_transport(
            state.clone(),
            vendor,
            revoked,
            headers.clone(),
            dispatch_input(),
            |_, _| async { panic!("revoked consent must not send") }
        )
        .await
        .is_err()
    );
    let expired = Uuid::new_v4();
    state
        .store
        .consent_asset_group_deletion(
            scope,
            niu_storage::AssetGroupDeletionConsent {
                id: expired,
                intent_id: second.id,
                authorization_id: grant,
                valid_for_seconds: 1,
                confirm_cascade: true,
            },
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    tokio::time::sleep(std::time::Duration::from_millis(1100)).await;
    assert!(
        dispatch_with_transport(
            state.clone(),
            vendor,
            expired,
            headers.clone(),
            dispatch_input(),
            |_, _| async { panic!("expired consent must not send") }
        )
        .await
        .is_err()
    );
    let acknowledged_id = Uuid::new_v4();
    state
        .store
        .consent_asset_group_deletion(
            scope,
            niu_storage::AssetGroupDeletionConsent {
                id: acknowledged_id,
                intent_id: second.id,
                authorization_id: grant,
                valid_for_seconds: 30,
                confirm_cascade: true,
            },
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let Json(acknowledged) = dispatch_with_transport(
        state.clone(),
        vendor,
        acknowledged_id,
        headers.clone(),
        dispatch_input(),
        |_, _| async { Ok(()) },
    )
    .await
    .unwrap();
    assert_eq!(acknowledged["data"]["status"], "acknowledged");
    assert_eq!(acknowledged["data"]["reconciliation_required"], true);
    let status = state
        .store
        .asset_group_deletion_consent_status(scope, vendor, acknowledged_id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(status["status"], "acknowledged");
    assert!(status["reason"].is_null());
    assert!(
        dispatch_with_transport(
            state.clone(),
            vendor,
            acknowledged_id,
            headers,
            dispatch_input(),
            |_, _| async { panic!("acknowledged deletion must never replay") }
        )
        .await
        .is_err()
    );
    let claims: i64 = sqlx::query_scalar("SELECT count(*) FROM asset_group_deletion_claims")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(claims, 2);
    let charges: i64 = sqlx::query_scalar("SELECT count(*) FROM customer_charges")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(charges, 0);
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL and isolated detector credential"]
async fn inspected_source_real_cipher_survives_reopen_and_verifies_approved_bytes(pool: PgPool) {
    use axum::{Json, Router, http::HeaderMap, routing::post};
    use image::{DynamicImage, ImageFormat};
    use niu_media::image_detector::{Config, Consent, Runtime};
    use niu_storage::ImageApprovalRecord;
    use std::io::Cursor;
    let store = niu_storage::Store::from_pool(pool.clone());
    let root = store.default_workspace().await.unwrap();
    let scope = store
        .create_project(root.organization_id, "Image receipt customer")
        .await
        .unwrap();
    let foreign = store
        .create_project(root.organization_id, "Other image workspace")
        .await
        .unwrap();
    let key = store
        .issue_key(scope, "Image receipt key", &["*".into()], 3600)
        .await
        .unwrap();
    let other_key = store
        .issue_key(foreign, "Other image key", &["*".into()], 3600)
        .await
        .unwrap();
    let principal = store.authenticate(&key.token).await.unwrap();
    let other = store.authenticate(&other_key.token).await.unwrap();
    let snapshot = store
        .guardrail_snapshot(scope, key.id)
        .await
        .unwrap()
        .unwrap();
    store
        .authorize_image_inspection(&principal, &snapshot)
        .await
        .unwrap();
    let secret =
        std::env::var("NIU_IMAGE_STORAGE_TEST_KEY").expect("isolated fixture credential required");
    let secret_check = secret.clone();
    let server=Router::new().route("/inspect",post(move |headers:HeaderMap,Json(body):Json<serde_json::Value>| {
        let secret=secret_check.clone();async move {
            assert!(headers["authorization"]==format!("Bearer {secret}"),"unexpected detector authorization");
            Json(serde_json::json!({"schema_version":2,"detector_revision":body["detector_revision"],"content_sha256":body["content_sha256"],"verdict":"clear"}))
        }
    }));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let task = tokio::spawn(async move { axum::serve(listener, server).await.unwrap() });
    let config = Config {
        endpoint: format!("http://{address}/inspect"),
        api_key_env: "NIU_IMAGE_STORAGE_TEST_KEY".into(),
        detector_revision: "fixture-v2".into(),
        recipient: "Fixture recipient".into(),
        region: "Fixture".into(),
        retention: "None declared".into(),
        authorized_workspaces: vec![scope.project_id.to_string(), foreign.project_id.to_string()],
        declared_unmetered: true,
        timeout_ms: 1000,
        maximum_encoded_bytes: 4096,
        maximum_width: 32,
        maximum_height: 32,
        maximum_decoded_bytes: 4096,
        concurrency: 1,
    };
    let runtime = Runtime::new(config.clone()).unwrap();
    let consent = Consent {
        configuration_fingerprint: runtime.fingerprint().into(),
        consent_to_image_processing: true,
    };
    let mut bytes = Cursor::new(Vec::new());
    DynamicImage::new_rgb8(2, 2)
        .write_to(&mut bytes, ImageFormat::Png)
        .unwrap();
    let reference = niu_media::image_input::decode(
        &bytes.into_inner(),
        "image/png",
        niu_media::image_input::DecodeLimits {
            maximum_encoded_bytes: 4096,
            maximum_width: 32,
            maximum_height: 32,
            maximum_decoded_bytes: 4096,
        },
    )
    .unwrap()
    .inline_reference(4096)
    .unwrap();
    let approval = runtime
        .inspect_inline(&scope.project_id.to_string(), &consent, &reference)
        .await
        .unwrap();
    let record = || ImageApprovalRecord {
        detector_name: "fixture-image",
        content_position: 1,
        elapsed_ms: 10,
        runtime: &runtime,
        consent: &consent,
        approval: &approval,
    };
    let id = store
        .record_image_processing_approval(&principal, &snapshot, record())
        .await
        .unwrap();
    let cipher = crate::vendors::crypto::CredentialCipher::new(MASTER).unwrap();
    let source = Uuid::new_v4();
    store
        .save_inspected_image_source(
            &principal,
            &snapshot,
            niu_storage::InspectedImageSourceInput {
                id: source,
                approval_id: id,
                valid_for_seconds: 60,
                runtime: &runtime,
                consent: &consent,
                approval: &approval,
                additional_approvals: &[],
            },
            |bytes, aad| {
                cipher
                    .seal_bytes_with_aad(aad, bytes)
                    .map_err(|_| niu_storage::StoreError::InvalidObservation)
            },
        )
        .await
        .unwrap();
    let reopened = niu_storage::Store::from_pool(pool.clone());
    let open = |aad: &[u8], bytes: &[u8]| {
        cipher
            .open_bytes_with_aad(aad, bytes)
            .map_err(|_| niu_storage::StoreError::InvalidObservation)
    };
    let restored = reopened
        .verified_inspected_image_source(&principal, &snapshot, source, open)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(restored.content_type(), "image/png");
    use base64::Engine;
    let expected = base64::engine::general_purpose::STANDARD
        .decode(reference.split_once(',').unwrap().1)
        .unwrap();
    assert_eq!(restored.bytes(), expected);
    let foreign_snapshot = store
        .guardrail_snapshot(foreign, other_key.id)
        .await
        .unwrap()
        .unwrap();
    assert!(
        reopened
            .verified_inspected_image_source(&other, &foreign_snapshot, source, |_, _| panic!(
                "foreign scope must not decrypt"
            ))
            .await
            .unwrap()
            .is_none()
    );
    let encrypted = reopened
        .inspected_image_source(&principal, &snapshot, source)
        .await
        .unwrap()
        .unwrap();
    assert!(
        !encrypted
            .ciphertext
            .windows(expected.len())
            .any(|part| part == expected)
    );
    assert!(
        cipher
            .open_bytes_with_aad(
                &niu_storage::inspected_image_source_aad(scope, key.id, Uuid::new_v4()),
                &encrypted.ciphertext
            )
            .is_err()
    );
    let vendor = Uuid::new_v4();
    store
        .create_vendor(niu_storage::VendorInput {
            id: vendor,
            name: "Encrypted ingestion fixture".into(),
            adapter: "openai".into(),
            api_base: "https://ark.cn-beijing.volcengineapi.com/api/v3".into(),
            enabled: false,
            credential_ciphertext: vec![1; 48],
        })
        .await
        .unwrap();
    let credential_bytes = cipher
        .seal_asset_management(vendor, 1, "original-project", "AKEXAMPLE", "fixture-secret")
        .unwrap();
    store
        .save_asset_management_credential(vendor, 0, "original-project", &credential_bytes)
        .await
        .unwrap();
    let qualification = || niu_storage::AssetOperationQualification {
        vendor_id: vendor,
        vendor_revision: 1,
        credential_revision: 1,
        rights_sha256: [1; 32],
        protocol_sha256: [2; 32],
        data_handling_sha256: [3; 32],
        free_operation_sha256: [4; 32],
        valid_for_seconds: 60,
    };
    store
        .qualify_asset_group_creation(
            scope,
            qualification(),
            niu_storage::OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let grant = store
        .qualify_asset_creation(
            scope,
            qualification(),
            niu_storage::OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let group_body =
        niu_media::asset_group::OrdinaryAssetGroupCreate::new("Encrypted destination".into(), None)
            .unwrap();
    let group = store
        .prepare_asset_group_create(scope, Uuid::new_v4(), vendor, 1, &group_body)
        .await
        .unwrap();
    assert!(
        store
            .claim_asset_group_create(scope, group.id)
            .await
            .unwrap()
    );
    assert!(
        store
            .record_asset_group_dispatch_outcome(scope, group.id, Some("group-encrypted"), None, 1)
            .await
            .unwrap()
    );
    let ingestion = Uuid::new_v4();
    store
        .consent_asset_image_ingestion(
            &principal,
            &snapshot,
            niu_storage::AssetImageIngestionConsent {
                id: ingestion,
                source_id: source,
                group_intent_id: group.id,
                authorization_id: grant,
                valid_for_seconds: 60,
                confirm_ingestion: true,
            },
        )
        .await
        .unwrap();
    let detectors = [("fixture-image", &runtime)];
    let wrong_cipher = crate::vendors::crypto::CredentialCipher::new(
        "different-fixture-master-for-negative-tests",
    )
    .unwrap();
    assert!(
        reopened
            .claim_asset_image_ingestion(
                &principal,
                &snapshot,
                ingestion,
                &detectors,
                |aad, bytes| {
                    wrong_cipher
                        .open_bytes_with_aad(aad, bytes)
                        .map_err(|_| niu_storage::StoreError::InvalidObservation)
                }
            )
            .await
            .is_err()
    );
    let claims: i64 =
        sqlx::query_scalar("SELECT count(*) FROM asset_image_ingestion_claims WHERE consent_id=$1")
            .bind(ingestion)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(claims, 0);
    let mut changed_config = config.clone();
    changed_config.retention = "Changed recipient data handling".into();
    let changed_runtime = Runtime::new(changed_config).unwrap();
    assert!(
        reopened
            .claim_asset_image_ingestion(
                &principal,
                &snapshot,
                ingestion,
                &[("fixture-image", &changed_runtime)],
                |_, _| panic!("changed data handling must not decrypt")
            )
            .await
            .unwrap()
            .is_none()
    );
    let handoff = reopened
        .claim_asset_image_ingestion(&principal, &snapshot, ingestion, &detectors, open)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(handoff.source.bytes(), expected);
    assert_eq!(handoff.source.content_type(), "image/png");
    assert_eq!(handoff.credential.vendor_id, vendor);
    assert_eq!(handoff.credential.credential_ciphertext, credential_bytes);
    let signer = cipher
        .open_asset_management(
            handoff.credential.vendor_id,
            handoff.credential.revision,
            &handoff.credential.upstream_project,
            &handoff.credential.credential_ciphertext,
        )
        .unwrap();
    let request = niu_media::asset_create::OrdinaryAssetCreate::new(
        handoff.group,
        "https://source.example.test/immutable-fixture".into(),
        niu_media::asset_list::AssetType::Image,
        None,
    )
    .unwrap();
    let signed = signer
        .sign_create_asset("20261009T000000Z", &request)
        .unwrap();
    let body: serde_json::Value = serde_json::from_slice(&signed.body).unwrap();
    assert_eq!(body["GroupId"], "group-encrypted");
    assert_eq!(body["ProjectName"], "original-project");
    assert_eq!(body["AssetType"], "Image");
    // This is a controlled acceptance record; no network upload is performed.
    assert!(
        store
            .finish_asset_image_ingestion(
                &principal,
                ingestion,
                niu_storage::AssetImageIngestionOutcome::Accepted {
                    upstream_asset_id: "asset-fixture-accepted"
                },
                1
            )
            .await
            .unwrap()
    );
    let restarted = niu_storage::Store::from_pool(pool.clone());
    assert!(
        restarted
            .claim_asset_image_ingestion(
                &principal,
                &snapshot,
                ingestion,
                &detectors,
                |_, _| panic!("committed real-cipher handoff must not replay")
            )
            .await
            .unwrap()
            .is_none()
    );
    let accepted: String = sqlx::query_scalar(
        "SELECT outcome FROM asset_image_ingestion_outcomes WHERE consent_id=$1",
    )
    .bind(ingestion)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(accepted, "accepted");
    let charges: i64 = sqlx::query_scalar("SELECT count(*) FROM customer_charges")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(charges, 0);
    let access = store
        .issue_asset_image_source_access(&principal, &snapshot, ingestion)
        .await
        .unwrap()
        .unwrap();
    assert!(
        store
            .issue_asset_image_source_access(&principal, &snapshot, ingestion)
            .await
            .unwrap()
            .is_none(),
        "repetition must not renew or add a token"
    );
    assert!(
        store
            .deliver_asset_image_source("invalid", &detectors, |_, _| panic!(
                "invalid token must not decrypt"
            ))
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        store
            .deliver_asset_image_source(
                access.token(),
                &[("fixture-image", &changed_runtime)],
                |_, _| panic!("changed processing terms must deny delivery")
            )
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        store
            .deliver_asset_image_source(access.token(), &detectors, |aad, bytes| {
                wrong_cipher
                    .open_bytes_with_aad(aad, bytes)
                    .map_err(|_| niu_storage::StoreError::InvalidObservation)
            })
            .await
            .is_err()
    );
    let delivered = restarted
        .deliver_asset_image_source(access.token(), &detectors, open)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(delivered.bytes(), expected);
    let (one, two) = tokio::join!(
        store.deliver_asset_image_source(access.token(), &detectors, open),
        restarted.deliver_asset_image_source(access.token(), &detectors, open),
    );
    assert_eq!(one.unwrap().unwrap().bytes(), expected);
    assert_eq!(two.unwrap().unwrap().bytes(), expected);
    assert_eq!(
        store
            .deliver_asset_image_source(access.token(), &detectors, open)
            .await
            .unwrap()
            .unwrap()
            .bytes(),
        expected
    );
    assert!(
        store
            .deliver_asset_image_source(access.token(), &detectors, |_, _| panic!(
                "exhausted capability must not decrypt"
            ))
            .await
            .unwrap()
            .is_none()
    );
    let deliveries: i64 = sqlx::query_scalar("SELECT count(*) FROM asset_image_source_deliveries")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(deliveries, 4);
    let retained_hash: Vec<u8> = sqlx::query_scalar(
        "SELECT token_sha256 FROM asset_image_source_access WHERE consent_id=$1",
    )
    .bind(ingestion)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(retained_hash.len(), 32);
    use sha2::Digest;
    assert_eq!(
        retained_hash,
        sha2::Sha256::digest(access.token().as_bytes()).to_vec()
    );
    let capped:bool=sqlx::query_scalar("SELECT access.expires_at<=access.created_at+interval '60 seconds' AND access.expires_at<=d.expires_at AND access.expires_at<=s.expires_at FROM asset_image_source_access access JOIN asset_image_ingestion_consents d ON d.id=access.consent_id JOIN inspected_image_sources s ON s.id=d.source_id WHERE access.consent_id=$1").bind(ingestion).fetch_one(&pool).await.unwrap();
    assert!(capped);
    let revoked_ingestion = Uuid::new_v4();
    store
        .consent_asset_image_ingestion(
            &principal,
            &snapshot,
            niu_storage::AssetImageIngestionConsent {
                id: revoked_ingestion,
                source_id: source,
                group_intent_id: group.id,
                authorization_id: grant,
                valid_for_seconds: 60,
                confirm_ingestion: true,
            },
        )
        .await
        .unwrap();
    store
        .claim_asset_image_ingestion(&principal, &snapshot, revoked_ingestion, &detectors, open)
        .await
        .unwrap()
        .unwrap();
    let revoked_access = store
        .issue_asset_image_source_access(&principal, &snapshot, revoked_ingestion)
        .await
        .unwrap()
        .unwrap();
    let mut delivery_state = test_state(None, pool.clone());
    delivery_state.vendor_cipher = Some(Arc::new(
        crate::vendors::crypto::CredentialCipher::new(MASTER).unwrap(),
    ));
    delivery_state.image_detectors = Arc::new(HashMap::from([(
        "fixture-image".into(),
        Runtime::new(config.clone()).unwrap(),
    )]));
    let mut upload_state = delivery_state.clone();
    let delivery_app = router(delivery_state);
    let api_consent = Uuid::new_v4();
    let consent_path = format!("/v1/media/image-ingestions/{api_consent}");
    let consent_body = json!({"source_id":source,"group_intent_id":group.id,"authorization_id":grant,"valid_for_seconds":60,"confirm_ingestion":true});
    assert_eq!(
        call(
            &delivery_app,
            Method::PUT,
            &consent_path,
            "invalid",
            consent_body.clone()
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        call(
            &delivery_app,
            Method::PUT,
            &consent_path,
            &other_key.token,
            consent_body.clone()
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    let (created, consent_status) = call(
        &delivery_app,
        Method::PUT,
        &consent_path,
        &key.token,
        consent_body.clone(),
    )
    .await;
    assert_eq!(created, StatusCode::CREATED);
    assert_eq!(consent_status["data"]["status"], "consented");
    for field in ["reason", "duration_ms", "observed_at"] {
        assert!(consent_status["data"][field].is_null());
    }
    assert_eq!(consent_status["data"]["dispatch_available"], false);
    let (history_status, history) = call(
        &delivery_app,
        Method::GET,
        "/v1/media/image-ingestions",
        &key.token,
        json!({}),
    )
    .await;
    assert_eq!(history_status, StatusCode::OK);
    assert!(
        history["data"]
            .as_array()
            .unwrap()
            .iter()
            .any(|row| row["consent_id"] == api_consent.to_string())
    );
    let (_, foreign_history) = call(
        &delivery_app,
        Method::GET,
        "/v1/media/image-ingestions",
        &other_key.token,
        json!({}),
    )
    .await;
    assert_eq!(foreign_history["data"], json!([]));
    assert_eq!(
        call(
            &delivery_app,
            Method::GET,
            &format!("/v1/media/image-ingestions?before={api_consent}"),
            &other_key.token,
            json!({})
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        call(
            &delivery_app,
            Method::GET,
            "/v1/media/image-ingestions?before=invalid",
            &key.token,
            json!({})
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );

    // Same-statement creation times exercise the UUID tie-breaker and ensure
    // continuation returns every scoped record once across the fifty-row cap.
    let copies: Vec<Uuid> = (0..52).map(|_| Uuid::new_v4()).collect();
    sqlx::query("INSERT INTO asset_image_ingestion_consents(id,source_id,group_intent_id,authorization_id,valid_for_seconds,confirm_ingestion,expires_at) SELECT copy,d.source_id,d.group_intent_id,d.authorization_id,d.valid_for_seconds,d.confirm_ingestion,d.expires_at FROM asset_image_ingestion_consents d CROSS JOIN unnest($1::uuid[]) copy WHERE d.id=$2")
        .bind(&copies).bind(api_consent).execute(&pool).await.unwrap();
    let expected_history: Vec<Uuid> = sqlx::query_scalar("SELECT d.id FROM asset_image_ingestion_consents d JOIN inspected_image_sources s ON s.id=d.source_id WHERE s.key_id=$1 ORDER BY d.created_at DESC,d.id DESC")
        .bind(key.id).fetch_all(&pool).await.unwrap();
    let (_, first) = call(
        &delivery_app,
        Method::GET,
        "/v1/media/image-ingestions",
        &key.token,
        json!({}),
    )
    .await;
    assert_eq!(first["data"].as_array().unwrap().len(), 50);
    let cursor = first["next_cursor"].as_str().unwrap();
    let (_, second) = call(
        &delivery_app,
        Method::GET,
        &format!("/v1/media/image-ingestions?before={cursor}"),
        &key.token,
        json!({}),
    )
    .await;
    assert!(second["next_cursor"].is_null());
    let actual_history: Vec<Uuid> = first["data"]
        .as_array()
        .unwrap()
        .iter()
        .chain(second["data"].as_array().unwrap())
        .map(|row| Uuid::parse_str(row["consent_id"].as_str().unwrap()).unwrap())
        .collect();
    assert_eq!(actual_history, expected_history);
    for field in [
        "upstream_asset_id",
        "credential",
        "source",
        "token",
        "supplier_cost",
    ] {
        assert!(consent_status["data"].get(field).is_none());
    }
    assert_eq!(
        call(
            &delivery_app,
            Method::PUT,
            &consent_path,
            &key.token,
            consent_body.clone()
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_eq!(
        call(
            &delivery_app,
            Method::GET,
            &consent_path,
            &other_key.token,
            Value::Null
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        call(
            &delivery_app,
            Method::DELETE,
            &consent_path,
            &other_key.token,
            Value::Null
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    for _ in 0..2 {
        assert_eq!(
            call(
                &delivery_app,
                Method::DELETE,
                &consent_path,
                &key.token,
                Value::Null
            )
            .await
            .0,
            StatusCode::NO_CONTENT
        );
    }
    let (_, status) = call(
        &delivery_app,
        Method::GET,
        &consent_path,
        &key.token,
        Value::Null,
    )
    .await;
    assert_eq!(status["data"]["status"], "revoked");
    assert_eq!(
        call(
            &delivery_app,
            Method::PUT,
            &consent_path,
            &key.token,
            consent_body.clone()
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    let upload_id = Uuid::new_v4();
    let upload_path = format!("/v1/media/image-ingestions/{upload_id}");
    assert_eq!(
        call(
            &delivery_app,
            Method::PUT,
            &upload_path,
            &key.token,
            consent_body.clone()
        )
        .await
        .0,
        StatusCode::CREATED
    );
    for command_path in [
        format!("{upload_path}/dispatch"),
        format!("{upload_path}/readiness/{}", Uuid::new_v4()),
    ] {
        for override_body in [
            json!({"asset_id":"asset-other"}),
            json!({"account":"other"}),
            json!([]),
            json!(null),
        ] {
            assert_eq!(
                call(
                    &delivery_app,
                    Method::POST,
                    &command_path,
                    &key.token,
                    override_body
                )
                .await
                .0,
                StatusCode::BAD_REQUEST
            );
        }
    }
    let claims: i64 =
        sqlx::query_scalar("SELECT count(*) FROM asset_image_ingestion_claims WHERE consent_id=$1")
            .bind(upload_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(claims, 0);
    let mut upload_headers = HeaderMap::new();
    upload_headers.insert(
        "authorization",
        format!("Bearer {}", key.token).parse().unwrap(),
    );
    use super::super::image_ingestions::dispatch_with_transport as upload;
    assert!(
        upload(
            upload_state.clone(),
            upload_headers.clone(),
            upload_id,
            |_, _| async { panic!("unconfigured origin must not upload") }
        )
        .await
        .is_err()
    );
    assert_eq!(
        store
            .asset_image_ingestion_status(&principal, upload_id)
            .await
            .unwrap()
            .unwrap()["status"],
        "consented"
    );
    let mut upload_config = (*upload_state.config).clone();
    upload_config.server.image_source_origin = Some("https://niu.example".into());
    upload_state.config = Arc::new(upload_config);
    let capacity = super::super::image_ingestions::UPLOADS
        .clone()
        .acquire_many_owned(4)
        .await
        .unwrap();
    assert!(
        upload(
            upload_state.clone(),
            upload_headers.clone(),
            upload_id,
            |_, _| async { panic!("saturation must not claim") }
        )
        .await
        .is_err()
    );
    drop(capacity);
    let (started_tx, started_rx) = tokio::sync::oneshot::channel();
    let (finish_tx, finish_rx) = tokio::sync::oneshot::channel();
    let request_state = upload_state.clone();
    let request_headers = upload_headers.clone();
    let requester = tokio::spawn(async move {
        upload(
            request_state,
            request_headers,
            upload_id,
            move |signer, request| async move {
                let signed = signer
                    .sign_create_asset("20261009T000000Z", &request)
                    .unwrap();
                assert!(!signed.body.is_empty());
                let private: Value =
                    serde_json::from_slice(&request.encode_private().unwrap()).unwrap();
                assert!(
                    private["URL"]
                        .as_str()
                        .unwrap()
                        .starts_with("https://niu.example/v1/media/sources/nis_")
                );
                assert_eq!(private["GroupId"], "group-encrypted");
                started_tx.send(()).unwrap();
                finish_rx.await.unwrap();
                Ok("asset-upload-accepted".into())
            },
        )
        .await
    });
    started_rx.await.unwrap();
    requester.abort();
    assert!(
        upload(
            upload_state.clone(),
            upload_headers.clone(),
            upload_id,
            |_, _| async { panic!("disconnect must not authorize replay") }
        )
        .await
        .is_err()
    );
    finish_tx.send(()).unwrap();
    for _ in 0..100 {
        if store
            .asset_image_ingestion_status(&principal, upload_id)
            .await
            .unwrap()
            .unwrap()["status"]
            == "accepted"
        {
            break;
        }
        tokio::task::yield_now().await;
        tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    }
    assert_eq!(
        niu_storage::Store::from_pool(pool.clone())
            .asset_image_ingestion_status(&principal, upload_id)
            .await
            .unwrap()
            .unwrap()["status"],
        "accepted"
    );
    assert!(
        store
            .claim_ingested_image_readiness(&principal, &snapshot, upload_id, Uuid::new_v4())
            .await
            .unwrap()
            .is_none()
    );
    let saved_upload = call(
        &delivery_app,
        Method::GET,
        &upload_path,
        &key.token,
        json!({}),
    )
    .await
    .1;
    assert_eq!(saved_upload["data"]["status"], "accepted");
    assert!(saved_upload["data"]["reason"].is_null());
    assert!(saved_upload["data"]["duration_ms"].as_i64().unwrap() >= 0);
    assert!(saved_upload["data"]["observed_at"].is_string());
    let read_grant = store
        .qualify_asset_lookup(
            scope,
            qualification(),
            niu_storage::OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    assert!(
        store
            .claim_ingested_image_readiness(
                &other,
                &store
                    .guardrail_snapshot(foreign, other_key.id)
                    .await
                    .unwrap()
                    .unwrap(),
                upload_id,
                Uuid::new_v4()
            )
            .await
            .unwrap()
            .is_none()
    );
    let first_read = Uuid::new_v4();
    let second_read = Uuid::new_v4();
    let (first, second) = tokio::join!(
        store.claim_ingested_image_readiness(&principal, &snapshot, upload_id, first_read),
        store.claim_ingested_image_readiness(&principal, &snapshot, upload_id, second_read)
    );
    let (read_id, claimed_read) = match (first.unwrap(), second.unwrap()) {
        (Some(claim), None) => (first_read, claim),
        (None, Some(claim)) => (second_read, claim),
        _ => panic!("one outstanding readiness read must win"),
    };
    assert_eq!(claimed_read.credential.vendor_id, vendor);
    assert_eq!(claimed_read.credential.upstream_project, "original-project");
    let signer = cipher
        .open_asset_management(
            vendor,
            claimed_read.credential.revision,
            &claimed_read.credential.upstream_project,
            &claimed_read.credential.credential_ciphertext,
        )
        .unwrap();
    let signed = signer
        .sign_get_asset("20261009T000000Z", &claimed_read.request)
        .unwrap();
    let private: Value = serde_json::from_slice(&signed.body).unwrap();
    assert_eq!(private["Id"], "asset-upload-accepted");
    assert_eq!(private["ProjectName"], "original-project");
    use niu_media::asset_list::AssetStatus;
    assert!(
        !store
            .finish_ingested_image_readiness(&other, read_id, Ok(AssetStatus::Active), 1)
            .await
            .unwrap()
    );
    assert!(
        store
            .finish_ingested_image_readiness(&principal, read_id, Ok(AssetStatus::Processing), 1)
            .await
            .unwrap()
    );
    assert!(
        !store
            .finish_ingested_image_readiness(&principal, read_id, Ok(AssetStatus::Active), 2)
            .await
            .unwrap()
    );
    let next_read = Uuid::new_v4();
    assert!(
        niu_storage::Store::from_pool(pool.clone())
            .claim_ingested_image_readiness(&principal, &snapshot, upload_id, next_read)
            .await
            .unwrap()
            .is_some()
    );
    assert!(
        store
            .finish_ingested_image_readiness(&principal, next_read, Ok(AssetStatus::Active), 2)
            .await
            .unwrap()
    );
    let interrupted = Uuid::new_v4();
    sqlx::query("INSERT INTO ingested_image_readiness_claims(id,consent_id,authorization_id,created_at) VALUES($1,$2,$3,clock_timestamp()-interval '61 seconds')").bind(interrupted).bind(upload_id).bind(read_grant).execute(&pool).await.unwrap();
    assert_eq!(
        store
            .recover_interrupted_ingested_image_reads()
            .await
            .unwrap(),
        1
    );
    assert_eq!(
        store
            .recover_interrupted_ingested_image_reads()
            .await
            .unwrap(),
        0
    );
    let failure:(Option<String>,String,i64)=sqlx::query_as("SELECT asset_status,reason,duration_ms FROM ingested_image_readiness_outcomes WHERE read_id=$1").bind(interrupted).fetch_one(&pool).await.unwrap();
    assert!(failure.0.is_none());
    assert_eq!(failure.1, "timeout");
    assert!(failure.2 >= 61000);
    assert!(sqlx::query("UPDATE ingested_image_readiness_outcomes SET asset_status='Active',reason=NULL WHERE read_id=$1").bind(interrupted).execute(&pool).await.is_err());
    let observed_asset = |id: &str, status: &str| {
        let scope = niu_media::asset_list::OrdinaryAssetList::first_page(
            "group-encrypted".into(),
            "original-project".into(),
            1,
        )
        .unwrap();
        let body = json!({"ResponseMetadata":{"Action":"ListAssets","Version":"2024-01-01","Service":"ark","Region":"cn-beijing"},"Result":{"Items":[{"Id":id,"GroupId":"group-encrypted","ProjectName":"original-project","Name":"Image","AssetType":"Image","Status":status,"CreateTime":"2026-10-09T00:00:00Z","UpdateTime":"2026-10-09T00:00:00Z","LastInferenceTime":null}],"NextToken":null}});
        niu_media::asset_list::OrdinaryAssetPage::restore_private(
            &serde_json::to_vec(&body).unwrap(),
            &scope,
        )
        .unwrap()
        .items
        .remove(0)
    };
    use super::super::image_readiness::refresh_with_transport as readiness;
    let status_read = Uuid::new_v4();
    let observed = observed_asset("asset-upload-accepted", "Processing");
    let axum::Json(response) = readiness(
        upload_state.clone(),
        upload_headers.clone(),
        upload_id,
        status_read,
        |_, _| async move { Ok(observed) },
    )
    .await
    .unwrap();
    assert_eq!(response["data"]["status"], "succeeded");
    assert_eq!(response["data"]["asset_status"], "Processing");
    assert_eq!(response["data"]["reuse_available"], false);
    let read_path = format!("/v1/media/image-ingestions/{upload_id}/readiness/{status_read}");
    assert_eq!(
        call(
            &delivery_app,
            Method::GET,
            &read_path,
            &other_key.token,
            Value::Null
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        call(
            &delivery_app,
            Method::GET,
            &read_path,
            &key.token,
            Value::Null
        )
        .await
        .1["data"]["asset_status"],
        "Processing"
    );
    let mismatched = observed_asset("asset-other", "Active");
    let wrong_id = Uuid::new_v4();
    let axum::Json(response) = readiness(
        upload_state.clone(),
        upload_headers.clone(),
        upload_id,
        wrong_id,
        |_, _| async move { Ok(mismatched) },
    )
    .await
    .unwrap();
    assert_eq!(response["data"]["status"], "failed");
    assert_eq!(response["data"]["reason"], "invalid_response");
    assert!(response["data"]["asset_status"].is_null());
    assert!(
        readiness(
            upload_state.clone(),
            upload_headers.clone(),
            upload_id,
            wrong_id,
            |_, _| async { panic!("same readiness claim cannot replay") }
        )
        .await
        .is_err()
    );
    let held = super::super::image_readiness::READS
        .clone()
        .acquire_many_owned(4)
        .await
        .unwrap();
    let overloaded_id = Uuid::new_v4();
    assert!(
        readiness(
            upload_state.clone(),
            upload_headers.clone(),
            upload_id,
            overloaded_id,
            |_, _| async { panic!("saturated readiness must not claim") }
        )
        .await
        .is_err()
    );
    drop(held);
    assert!(
        store
            .ingested_image_readiness_status(&principal, upload_id, overloaded_id)
            .await
            .unwrap()
            .is_none()
    );
    let detached_read = Uuid::new_v4();
    let active = observed_asset("asset-upload-accepted", "Active");
    let (read_started_tx, read_started_rx) = tokio::sync::oneshot::channel();
    let (read_finish_tx, read_finish_rx) = tokio::sync::oneshot::channel();
    let detached_state = upload_state.clone();
    let detached_headers = upload_headers.clone();
    let reader = tokio::spawn(async move {
        readiness(
            detached_state,
            detached_headers,
            upload_id,
            detached_read,
            move |_, _| async move {
                read_started_tx.send(()).unwrap();
                read_finish_rx.await.unwrap();
                Ok(active)
            },
        )
        .await
    });
    read_started_rx.await.unwrap();
    assert_eq!(
        store
            .ingested_image_readiness_status(&principal, upload_id, detached_read)
            .await
            .unwrap()
            .unwrap()["status"],
        "pending"
    );
    reader.abort();
    read_finish_tx.send(()).unwrap();
    for _ in 0..100 {
        if store
            .ingested_image_readiness_status(&principal, upload_id, detached_read)
            .await
            .unwrap()
            .unwrap()["status"]
            == "succeeded"
        {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    }
    let detached_status = niu_storage::Store::from_pool(pool.clone())
        .ingested_image_readiness_status(&principal, upload_id, detached_read)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(detached_status["asset_status"], "Active");
    assert_eq!(detached_status["reuse_available"], false);
    for field in ["upstream_asset_id", "credential", "source", "supplier_cost"] {
        assert!(detached_status.get(field).is_none());
    }
    store
        .revoke_asset_operation_authorization(
            read_grant,
            niu_storage::OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    assert!(
        store
            .claim_ingested_image_readiness(&principal, &snapshot, upload_id, Uuid::new_v4())
            .await
            .unwrap()
            .is_none()
    );
    let delivery_path = format!("/v1/media/sources/{}", revoked_access.token());
    // Exercise HTTP framing and complete-body delivery through a real socket.
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let network_app = delivery_app.clone();
    let server = tokio::spawn(async move {
        axum::serve(listener, network_app).await.unwrap();
    });
    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .unwrap();
    let fetched = client
        .get(format!("http://{address}{delivery_path}"))
        .send()
        .await
        .unwrap();
    assert_eq!(fetched.status(), StatusCode::OK);
    assert_eq!(fetched.headers()["content-type"], "image/png");
    assert_eq!(fetched.content_length(), Some(expected.len() as u64));
    assert_eq!(fetched.headers()["referrer-policy"], "no-referrer");
    assert_eq!(fetched.bytes().await.unwrap().as_ref(), expected);
    server.abort();
    assert_eq!(
        super::super::image_sources::TRANSFERS.available_permits(),
        4
    );
    let response = delivery_app
        .clone()
        .oneshot(
            Request::builder()
                .uri(&delivery_path)
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()["content-type"], "image/png");
    assert!(
        response.headers()["cache-control"]
            .to_str()
            .unwrap()
            .contains("no-store")
    );
    assert_eq!(response.headers()["referrer-policy"], "no-referrer");
    assert_eq!(response.headers()["x-content-type-options"], "nosniff");
    assert_eq!(
        response
            .into_body()
            .collect()
            .await
            .unwrap()
            .to_bytes()
            .as_ref(),
        expected
    );
    for (method, path, range, status) in [
        (
            Method::HEAD,
            delivery_path.clone(),
            false,
            StatusCode::METHOD_NOT_ALLOWED,
        ),
        (
            Method::POST,
            delivery_path.clone(),
            false,
            StatusCode::METHOD_NOT_ALLOWED,
        ),
        (
            Method::GET,
            format!("{delivery_path}?download=1"),
            false,
            StatusCode::BAD_REQUEST,
        ),
        (
            Method::GET,
            delivery_path.clone(),
            true,
            StatusCode::RANGE_NOT_SATISFIABLE,
        ),
    ] {
        let mut request = Request::builder().method(method).uri(path);
        if range {
            request = request.header("range", "bytes=0-1");
        }
        let response = delivery_app
            .clone()
            .oneshot(request.body(axum::body::Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), status);
        assert!(
            response.headers()["cache-control"]
                .to_str()
                .unwrap()
                .contains("no-store")
        );
    }
    let held = super::super::image_sources::TRANSFERS
        .clone()
        .acquire_many_owned(4)
        .await
        .unwrap();
    let overloaded = delivery_app
        .clone()
        .oneshot(
            Request::builder()
                .uri(&delivery_path)
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(overloaded.status(), StatusCode::SERVICE_UNAVAILABLE);
    drop(held);
    let unread = delivery_app
        .clone()
        .oneshot(
            Request::builder()
                .uri(&delivery_path)
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(unread.status(), StatusCode::OK);
    assert_eq!(
        super::super::image_sources::TRANSFERS.available_permits(),
        3
    );
    drop(unread);
    assert_eq!(
        super::super::image_sources::TRANSFERS.available_permits(),
        4
    );
    store
        .revoke_asset_image_ingestion_consent(&principal, revoked_ingestion)
        .await
        .unwrap();
    assert!(
        restarted
            .deliver_asset_image_source(revoked_access.token(), &detectors, |_, _| panic!(
                "revoked consent must deny delivery"
            ))
            .await
            .unwrap()
            .is_none()
    );
    let denied = delivery_app
        .clone()
        .oneshot(
            Request::builder()
                .uri(&delivery_path)
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(denied.status(), StatusCode::NOT_FOUND);
    assert!(
        denied.headers()["cache-control"]
            .to_str()
            .unwrap()
            .contains("no-store")
    );
    let expiring_ingestion = Uuid::new_v4();
    store
        .consent_asset_image_ingestion(
            &principal,
            &snapshot,
            niu_storage::AssetImageIngestionConsent {
                id: expiring_ingestion,
                source_id: source,
                group_intent_id: group.id,
                authorization_id: grant,
                valid_for_seconds: 1,
                confirm_ingestion: true,
            },
        )
        .await
        .unwrap();
    store
        .claim_asset_image_ingestion(&principal, &snapshot, expiring_ingestion, &detectors, open)
        .await
        .unwrap()
        .unwrap();
    let expiring_access = store
        .issue_asset_image_source_access(&principal, &snapshot, expiring_ingestion)
        .await
        .unwrap()
        .unwrap();
    tokio::time::sleep(std::time::Duration::from_millis(1100)).await;
    assert!(
        store
            .deliver_asset_image_source(expiring_access.token(), &detectors, |_, _| panic!(
                "expired token must not decrypt"
            ))
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        store
            .deliver_asset_image_source(
                &format!("nis_{}", "0".repeat(64)),
                &detectors,
                |_, _| panic!("unknown token must not decrypt")
            )
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        sqlx::query(
            "UPDATE asset_image_source_access SET expires_at=clock_timestamp()+interval '1 minute'"
        )
        .execute(&pool)
        .await
        .is_err()
    );
    let retained_consent = Uuid::new_v4();
    assert!(
        store
            .consent_asset_image_ingestion(
                &principal,
                &snapshot,
                niu_storage::AssetImageIngestionConsent {
                    id: retained_consent,
                    source_id: source,
                    group_intent_id: group.id,
                    authorization_id: grant,
                    valid_for_seconds: 60,
                    confirm_ingestion: true,
                }
            )
            .await
            .unwrap()
    );
    let mut availability_config = (*upload_state.config).clone();
    availability_config.server.image_source_origin = Some("https://niu.example".into());
    let mut availability_state = upload_state.clone();
    availability_state.config = Arc::new(availability_config);
    let availability_app = router(availability_state);
    let availability_path = format!("/v1/media/image-ingestions/{retained_consent}");
    assert_eq!(
        call(
            &availability_app,
            Method::GET,
            &availability_path,
            &key.token,
            json!({})
        )
        .await
        .1["data"]["dispatch_available"],
        true
    );
    assert!(
        store
            .erase_inspected_image_source(&principal, source)
            .await
            .unwrap()
    );
    assert!(
        reopened
            .verified_inspected_image_source(&principal, &snapshot, source, |_, _| panic!(
                "erased bytes must not decrypt"
            ))
            .await
            .unwrap()
            .is_none()
    );
    let unavailable = call(
        &availability_app,
        Method::GET,
        &availability_path,
        &key.token,
        json!({}),
    )
    .await
    .1;
    assert_eq!(unavailable["data"]["status"], "consented");
    assert_eq!(unavailable["data"]["dispatch_available"], false);
    let preparation_body = json!({"image":reference,"valid_for_seconds":60});
    assert_eq!(
        call(
            &delivery_app,
            Method::POST,
            "/v1/media/image-sources",
            &key.token,
            preparation_body.clone()
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    store.activate_workspace_guardrail(scope,0,&json!({"schema_version":1,"name":"Source inspection","models":{"mode":"inherit"},"providers":{"mode":"inherit"},"image_detectors":[{"detector":"fixture-image","configuration_fingerprint":runtime.fingerprint(),"consent_to_image_processing":true}]})).await.unwrap();
    assert_eq!(
        call(
            &delivery_app,
            Method::POST,
            "/v1/media/image-sources",
            "invalid",
            preparation_body.clone()
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    let saturated = super::super::image_source_uploads::PREPARATIONS
        .clone()
        .acquire_many_owned(4)
        .await
        .unwrap();
    assert_eq!(
        call(
            &delivery_app,
            Method::POST,
            "/v1/media/image-sources",
            &key.token,
            preparation_body.clone()
        )
        .await
        .0,
        StatusCode::SERVICE_UNAVAILABLE
    );
    drop(saturated);
    let (prepared, source_body) = call(
        &delivery_app,
        Method::POST,
        "/v1/media/image-sources",
        &key.token,
        preparation_body,
    )
    .await;
    assert_eq!(prepared, StatusCode::CREATED);
    let uploaded_id = Uuid::parse_str(source_body["data"]["source_id"].as_str().unwrap()).unwrap();
    let current = store
        .guardrail_snapshot(scope, key.id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        store
            .verified_inspected_image_source(&principal, &current, uploaded_id, open)
            .await
            .unwrap()
            .unwrap()
            .bytes(),
        expected
    );
    let erase_path = format!("/v1/media/image-sources/{uploaded_id}");
    assert_eq!(
        call(
            &delivery_app,
            Method::DELETE,
            &erase_path,
            &other_key.token,
            Value::Null
        )
        .await
        .0,
        StatusCode::NO_CONTENT
    );
    assert!(
        store
            .verified_inspected_image_source(&principal, &current, uploaded_id, open)
            .await
            .unwrap()
            .is_some()
    );
    for _ in 0..2 {
        assert_eq!(
            call(
                &delivery_app,
                Method::DELETE,
                &erase_path,
                &key.token,
                Value::Null
            )
            .await
            .0,
            StatusCode::NO_CONTENT
        );
    }
    assert!(
        store
            .verified_inspected_image_source(&principal, &current, uploaded_id, |_, _| panic!(
                "erased upload must not decrypt"
            ))
            .await
            .unwrap()
            .is_none()
    );
    task.abort();
}
