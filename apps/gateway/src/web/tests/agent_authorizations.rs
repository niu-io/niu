use super::*;
use axum::body::{Body, to_bytes};
use niu_storage::{OperatorAuditActor, OperatorRole, OperatorScope};

async fn request(
    app: &Router,
    path: &str,
    token: Option<&str>,
    origin: Option<&str>,
    body: Value,
) -> (StatusCode, HeaderMap, Value) {
    let mut builder = Request::builder()
        .method("POST")
        .uri(path)
        .header("content-type", "application/json");
    if let Some(token) = token {
        builder = builder.header("authorization", format!("Bearer {token}"));
    }
    if let Some(origin) = origin {
        builder = builder.header("origin", origin);
    }
    let response = app
        .clone()
        .oneshot(builder.body(Body::from(body.to_string())).unwrap())
        .await
        .unwrap();
    let status = response.status();
    let headers = response.headers().clone();
    let bytes = to_bytes(response.into_body(), 16384).await.unwrap();
    (
        status,
        headers,
        if bytes.is_empty() {
            Value::Null
        } else {
            serde_json::from_slice(&bytes).unwrap()
        },
    )
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn agent_connection_requires_scoped_explicit_browser_approval(pool: PgPool) {
    let store_pool = pool.clone();
    let mut state = test_state(None, pool);
    state.password_auth = Some(Arc::new(
        crate::admin::passwords::Runtime::new("https://niu.example.test")
            .await
            .unwrap(),
    ));
    let store = state.store.clone();
    let scope = store.default_workspace().await.unwrap();
    let owner = store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(scope.project_id),
            },
            "Connect owner",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let viewer = store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(scope.project_id),
            },
            "Connect viewer",
            OperatorRole::Viewer,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let app = router(state);
    let (status, headers, created) = request(
        &app,
        "/api/v1/auth/agents",
        None,
        None,
        json!({"client_name":"DeepSeek Harness"}),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(headers["cache-control"], "no-store");
    assert!(created.get("token").is_none());
    let code = created["user_code"].as_str().unwrap();
    let path = format!("/api/v1/auth/agents/{code}");
    let decision = json!({"approve":true,"organization_id":scope.organization_id,"workspace_id":scope.project_id,"allowed_models":["*"],"ttl_seconds":3600});
    assert_eq!(
        request(
            &app,
            &path,
            None,
            Some("https://niu.example.test"),
            decision.clone()
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        request(
            &app,
            &path,
            Some(&viewer.token),
            Some("https://niu.example.test"),
            decision.clone()
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        request(
            &app,
            &path,
            Some(&owner.token),
            Some("https://evil.example"),
            decision.clone()
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        request(&app, &path, Some(&owner.token), None, decision.clone())
            .await
            .0,
        StatusCode::FORBIDDEN
    );
    let exchange = json!({"device_secret":created["device_secret"]});
    assert_eq!(
        request(
            &app,
            "/api/v1/auth/agents/token",
            None,
            None,
            exchange.clone()
        )
        .await
        .0,
        StatusCode::ACCEPTED
    );
    assert_eq!(
        request(
            &app,
            &path,
            Some(&owner.token),
            Some("https://niu.example.test"),
            decision
        )
        .await
        .0,
        StatusCode::NO_CONTENT
    );
    sqlx::query("UPDATE agent_authorizations SET next_poll_at=clock_timestamp()-interval '1 second' WHERE user_code=$1").bind(code).execute(&store_pool).await.unwrap();
    let (status, headers, result) = request(
        &app,
        "/api/v1/auth/agents/token",
        None,
        None,
        exchange.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(headers["cache-control"], "no-store");
    let principal = store
        .authenticate(result["token"].as_str().unwrap())
        .await
        .unwrap();
    assert_eq!(principal.scope().project_id, scope.project_id);
    assert_eq!(
        request(&app, "/api/v1/auth/agents/token", None, None, exchange)
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn named_agent_grant_does_not_expand_when_workspace_models_are_added(pool: PgPool) {
    let mut state = test_state(None, pool);
    state.password_auth = Some(Arc::new(
        crate::admin::passwords::Runtime::new("https://niu.example.test")
            .await
            .unwrap(),
    ));
    state
        .store
        .configure_platform_currency("USD")
        .await
        .unwrap();
    crate::payments::readiness::configure_test_gateway(&mut state).await;
    let store = state.store.clone();
    let scope = store.default_workspace().await.unwrap();
    let owner = store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(scope.project_id),
            },
            "Named grant owner",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let app = router(state.clone());
    let (status, _, created) = request(
        &app,
        "/api/v1/auth/agents",
        None,
        None,
        json!({"client_name":"Codex"}),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let code = created["user_code"].as_str().unwrap();
    let (status, _, _) = request(&app, &format!("/api/v1/auth/agents/{code}"), Some(&owner.token),
        Some("https://niu.example.test"), json!({"approve":true,"organization_id":scope.organization_id,
            "workspace_id":scope.project_id,"allowed_models":["fast"],"ttl_seconds":3600,"invocation_allowed":true})).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (status, _, exchanged) = request(
        &app,
        "/api/v1/auth/agents/token",
        None,
        None,
        json!({"device_secret":created["device_secret"]}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let token = exchanged["token"].as_str().unwrap();
    let existing = state.config.models["fast"].clone();
    Arc::make_mut(&mut state.config)
        .models
        .insert("later-model".into(), existing);
    let app = router(state);
    let principal = store.authenticate(token).await.unwrap();
    assert!(principal.invocation_allowed());
    assert!(principal.allows_model("fast"));
    assert!(!principal.allows_model("later-model"));
    let catalog = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/api/v1/models?organization_id={}&project_id={}",
                    scope.organization_id, scope.project_id
                ))
                .header("authorization", format!("Bearer {}", owner.token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(catalog.status(), StatusCode::OK);
    let catalog: Value =
        serde_json::from_slice(&to_bytes(catalog.into_body(), 65536).await.unwrap()).unwrap();
    assert!(
        catalog["data"]
            .as_array()
            .unwrap()
            .iter()
            .any(|model| model["id"] == "later-model")
    );
    for path in ["/v1/key", "/v1/models"] {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(path)
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let data: Value =
            serde_json::from_slice(&to_bytes(response.into_body(), 65536).await.unwrap()).unwrap();
        if path == "/v1/models" {
            assert!(
                data["data"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .all(|model| model["id"] != "later-model")
            );
        } else {
            assert!(data.to_string().contains("fast"));
            assert!(!data.to_string().contains("later-model"));
        }
    }
    let (status, _, denied) = request(
        &app,
        "/v1/chat/completions",
        Some(token),
        None,
        json!({"model":"later-model","messages":[{"role":"user","content":"Must not execute"}]}),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{denied}");
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn management_connection_denies_all_inference_protocols_before_execution(pool: PgPool) {
    let mut state = test_state(None, pool);
    state.password_auth = Some(Arc::new(
        crate::admin::passwords::Runtime::new("https://niu.example.test")
            .await
            .unwrap(),
    ));
    let store = state.store.clone();
    let scope = store.default_workspace().await.unwrap();
    let owner = store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(scope.project_id),
            },
            "Management owner",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let app = router(state.clone());
    let (status, _, created) = request(
        &app,
        "/api/v1/auth/agents",
        None,
        None,
        json!({"client_name":"Codex","capabilities":["pools:read","pools:write","evaluations:read","events:read"]}),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let code = created["user_code"].as_str().unwrap();
    let (status, _, _) = request(&app, &format!("/api/v1/auth/agents/{code}"), Some(&owner.token),
        Some("https://niu.example.test"), json!({"approve":true,"organization_id":scope.organization_id,
            "workspace_id":scope.project_id,"allowed_models":["*"],"ttl_seconds":3600,"invocation_allowed":false})).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (status, _, exchanged) = request(
        &app,
        "/api/v1/auth/agents/token",
        None,
        None,
        json!({"device_secret":created["device_secret"]}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let initial_token = exchanged["token"].as_str().unwrap();
    let principal = store.authenticate(initial_token).await.unwrap();
    assert!(!principal.invocation_allowed());
    assert!(
        store
            .agent_key_has_capability(scope, principal.key_id(), "pools:read")
            .await
            .unwrap()
    );
    let (status, _, rotated) = request(
        &app,
        &format!(
            "/api/v1/workspaces/{}/keys/{}/rotate",
            scope.project_id,
            principal.key_id()
        ),
        Some(&owner.token),
        Some("https://niu.example.test"),
        json!({}),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::CREATED,
        "key rotation failed: {rotated}"
    );
    let token = rotated["token"].as_str().unwrap();
    let old_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/v1/key")
                .header("authorization", format!("Bearer {initial_token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(old_response.status(), StatusCode::UNAUTHORIZED);
    assert!(store.platform_currency().await.unwrap().is_none());
    for path in [
        "/v1/key",
        "/v1/models",
        "/v1/routing",
        "/v1/evaluations",
        "/v1/events",
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(path)
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(
            response.status(),
            StatusCode::OK,
            "unfunded discovery {path}"
        );
        if path == "/v1/key" {
            let inspected: Value =
                serde_json::from_slice(&to_bytes(response.into_body(), 16384).await.unwrap())
                    .unwrap();
            assert_eq!(inspected["data"]["invocation_allowed"], json!(false));
            assert_eq!(
                inspected["data"]["management_capabilities"],
                json!([
                    "evaluations:read",
                    "events:read",
                    "pools:read",
                    "pools:write"
                ])
            );
        }
    }
    let put_routing = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri("/v1/routing/assistant")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "slug": "assistant",
                        "name": "Assistant",
                        "description": "Managed after key rotation",
                        "enabled": true,
                        "revision": 0,
                        "candidates": [{"alias": "fast", "priority": 100, "weight": 1, "enabled": true}],
                        "rules": [],
                        "default_action": "candidates"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(put_routing.status(), StatusCode::OK);
    let unapproved = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri("/v1/evaluations/unapproved")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "slug": "unapproved", "name": "Unapproved write",
                        "task": "Assess an answer", "rubric": "The answer is relevant",
                        "protocol": "chat", "revision": 0,
                        "samples": [{"reference": "sample-one", "request_sha256": "a".repeat(64)}]
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(unapproved.status(), StatusCode::FORBIDDEN);
    let ordinary = store
        .issue_key(scope, "Inference only", &["*".into()], 3600)
        .await
        .unwrap();
    for path in ["/v1/routing", "/v1/evaluations", "/v1/events"] {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(path)
                    .header("authorization", format!("Bearer {}", ordinary.token))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(
            response.status(),
            StatusCode::FORBIDDEN,
            "ordinary key {path}"
        );
    }
    state
        .store
        .configure_platform_currency("USD")
        .await
        .unwrap();
    crate::payments::readiness::configure_test_gateway(&mut state).await;
    let app = router(state);
    for path in [
        "/v1/chat/completions",
        "/v1/responses",
        "/v1/messages",
        "/v1/embeddings",
        "/v1beta/models/test:generateContent",
        "/v1/video/jobs",
    ] {
        let (status, _, body) =
            request(&app, path, Some(token), None, json!({"model":"test"})).await;
        assert_eq!(status, StatusCode::FORBIDDEN, "{path}: {body}");
        assert!(body.to_string().contains("invocation"), "{path}: {body}");
    }
}
