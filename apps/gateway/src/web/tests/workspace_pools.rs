use super::*;
use axum::body::{Body, to_bytes};
use niu_storage::{IssuedKey, OperatorAuditActor, OperatorRole, OperatorScope, Store, TenantScope};

async fn grant(store: &Store, scope: TenantScope, actor: Uuid) -> IssuedKey {
    grant_capabilities(
        store,
        scope,
        actor,
        &["pools:read".into(), "pools:write".into()],
    )
    .await
}
async fn grant_capabilities(
    store: &Store,
    scope: TenantScope,
    actor: Uuid,
    capabilities: &[String],
) -> IssuedKey {
    let request = store
        .create_agent_authorization_with_capabilities("Codex", capabilities)
        .await
        .unwrap();
    store
        .approve_agent_authorization(&request.user_code, scope, actor, &["fast".into()], 3600)
        .await
        .unwrap();
    store
        .exchange_agent_authorization(&request.device_secret)
        .await
        .unwrap()
        .unwrap()
}
async fn send(
    app: &Router,
    method: &str,
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
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    let bytes = to_bytes(response.into_body(), 65536).await.unwrap();
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
async fn workspace_pool_api_enforces_delegation_scope_preview_and_revisions(pool: PgPool) {
    let mut state = test_state(None, pool);
    state
        .store
        .configure_platform_currency("USD")
        .await
        .unwrap();
    crate::payments::readiness::configure_test_gateway(&mut state).await;
    let store = state.store.clone();
    let scope = store.default_workspace().await.unwrap();
    let actor = store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: None,
            },
            "Pool API owner",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let delegated = grant(&store, scope, actor.operator_id).await;
    let ordinary = store
        .issue_key(scope, "Ordinary", &["fast".into()], 3600)
        .await
        .unwrap();
    let other = store
        .create_project(scope.organization_id, "Other pool workspace")
        .await
        .unwrap();
    let foreign = grant(&store, other, actor.operator_id).await;
    let app = router(state);
    let body = json!({"slug":"assistant","name":"Assistant","description":"Task model policy","enabled":true,"revision":0,"candidates":[{"alias":"fast","priority":100,"weight":1000,"enabled":true}],"rules":[],"default_action":"candidates"});
    assert_eq!(
        send(
            &app,
            "PUT",
            "/v1/pools/assistant",
            &ordinary.token,
            body.clone()
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    let (status, preview) = send(
        &app,
        "POST",
        "/v1/pools/preview",
        &delegated.token,
        body.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(preview["data"]["persisted"], false);
    for (context, outcome, reason) in [
        (json!({"protocol":"chat"}), "candidates", Value::Null),
        (
            json!({"protocol":"chat","tools":true}),
            "no_eligible_candidates",
            json!("request_capability_not_supported"),
        ),
        (
            json!({"protocol":"messages"}),
            "no_eligible_candidates",
            json!("protocol_not_supported"),
        ),
    ] {
        let (status, preview) = send(
            &app,
            "POST",
            "/v1/pools/preview",
            &delegated.token,
            json!({"configuration":body,"context":context}),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(preview["data"]["simulation"]["outcome"], outcome);
        assert_eq!(
            preview["data"]["simulation"]["candidates"][0]["exclusion_reason"],
            reason
        );
        assert_eq!(preview["data"]["simulation"]["live_dispatch"], false);
        if outcome == "candidates" {
            assert_eq!(
                preview["data"]["simulation"]["candidates"][0]["selection_weight"],
                json!({"numerator":1000,"denominator":1000})
            );
        }
    }
    let mut conditional = body.clone();
    conditional["default_action"] = json!("reject");
    conditional["rules"] = json!([{"id":"chat-tasks","name":"Chat tasks","conditions":{"protocol":"chat"},"candidates":[{"alias":"fast","enabled":true,"priority":500,"weight":1000}]}]);
    let (_, matched) = send(
        &app,
        "POST",
        "/v1/pools/preview",
        &delegated.token,
        json!({"configuration":conditional,"context":{"protocol":"chat"}}),
    )
    .await;
    assert_eq!(matched["data"]["simulation"]["matched_rule"], "chat-tasks");
    let (_, rejected) = send(
        &app,
        "POST",
        "/v1/pools/preview",
        &delegated.token,
        json!({"configuration":conditional,"context":{"protocol":"embeddings"}}),
    )
    .await;
    assert_eq!(rejected["data"]["simulation"]["outcome"], "default_reject");
    assert_eq!(rejected["data"]["simulation"]["candidates"], json!([]));
    conditional["enabled"] = json!(false);
    let (_, disabled) = send(
        &app,
        "POST",
        "/v1/pools/preview",
        &delegated.token,
        json!({"configuration":conditional,"context":{"protocol":"chat"}}),
    )
    .await;
    assert_eq!(disabled["data"]["simulation"]["outcome"], "pool_disabled");
    for context in [
        json!({"protocol":"chat","requested_output_tokens":0}),
        json!({"protocol":"video_text"}),
        json!({"protocol":"chat","extra":true}),
    ] {
        assert_eq!(
            send(
                &app,
                "POST",
                "/v1/pools/preview",
                &delegated.token,
                json!({"configuration":body,"context":context})
            )
            .await
            .0,
            StatusCode::BAD_REQUEST
        );
    }

    assert!(
        store
            .workspace_model_pool(scope, "assistant")
            .await
            .unwrap()
            .is_none()
    );
    let (status, saved) = send(
        &app,
        "PUT",
        "/v1/pools/assistant",
        &delegated.token,
        body.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(saved["data"]["revision"], 1);
    assert!(saved["data"].get("pricing").is_none());
    assert!(saved["data"].get("organization_id").is_none());
    assert_eq!(
        send(
            &app,
            "PUT",
            "/v1/pools/assistant",
            &delegated.token,
            body.clone()
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    assert_eq!(
        send(
            &app,
            "GET",
            "/v1/pools/assistant",
            &foreign.token,
            Value::Null
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    let (status, page) = send(&app, "GET", "/v1/pools", &delegated.token, Value::Null).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(page["data"].as_array().unwrap().len(), 1);
    let (status, history) = send(
        &app,
        "GET",
        "/v1/pools/assistant/history",
        &delegated.token,
        Value::Null,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(history["data"][0]["revision"], 1);
    let mut invalid = body.clone();
    invalid["vendor_cost"] = json!("confidential");
    assert_eq!(
        send(
            &app,
            "PUT",
            "/v1/pools/assistant",
            &delegated.token,
            invalid
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    store.revoke_key(scope, delegated.id).await.unwrap();
    assert_eq!(
        send(&app, "PUT", "/v1/pools/assistant", &delegated.token, body)
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn workspace_pool_protocols_route_and_link_execution_evidence(pool: PgPool) {
    let captured = Captured::default();
    let upstream = Router::new()
        .route("/v1/chat/completions", post(provider))
        .route("/v1/responses", post(responses_provider))
        .route("/v1/embeddings", post(embedding_provider))
        .with_state(captured.clone());
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let task = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
    let mut state = test_state(Some(format!("http://{address}/v1")), pool);
    state
        .store
        .configure_platform_currency("USD")
        .await
        .unwrap();
    crate::payments::readiness::configure_test_gateway(&mut state).await;
    Arc::make_mut(&mut state.config)
        .models
        .get_mut("fast")
        .unwrap()
        .supports_responses = true;
    let store = state.store.clone();
    let scope = store.default_workspace().await.unwrap();
    personal_test_route(&mut state, scope.organization_id).await;
    let actor = store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: None,
            },
            "Pool routing owner",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let delegated = grant(&store, scope, actor.operator_id).await;
    // Invoking an approved concrete candidate does not require management grants.
    let caller = store
        .issue_key(scope, "Inference caller", &["fast".into()], 3600)
        .await
        .unwrap();
    let app = router(state);
    let policy = json!({"slug":"assistant","name":"Assistant","description":"","enabled":true,"revision":0,"candidates":[{"alias":"fast","priority":100,"weight":1000,"enabled":true}],"rules":[],"default_action":"candidates"});
    assert_eq!(
        send(
            &app,
            "PUT",
            "/v1/pools/assistant",
            &delegated.token,
            policy.clone()
        )
        .await
        .0,
        StatusCode::OK
    );
    for (path, request) in [
        (
            "/v1/chat/completions",
            json!({"model":"pool/assistant","messages":[{"role":"user","content":"hi"}]}),
        ),
        (
            "/v1/responses",
            json!({"model":"pool/assistant","input":"hi"}),
        ),
        (
            "/v1/embeddings",
            json!({"model":"pool/assistant","input":"hi"}),
        ),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::post(path)
                    .header("authorization", format!("Bearer {}", caller.token))
                    .header("content-type", "application/json")
                    .body(Body::from(request.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        let status = response.status();
        let headers = response.headers().clone();
        let bytes = to_bytes(response.into_body(), 65536).await.unwrap();
        assert_eq!(
            status,
            StatusCode::OK,
            "{}",
            String::from_utf8_lossy(&bytes)
        );
        assert_eq!(headers["x-niu-pool"], "assistant");
        assert_eq!(headers["x-niu-pool-revision"], "1");
        assert_eq!(headers["x-niu-selected-model"], "fast");
        assert!(headers.get("x-niu-pool-evidence").is_none());
        let result: Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(result["model"], "fast");
        assert_eq!(
            captured.0.lock().unwrap().as_ref().unwrap().1["model"],
            "provider-secret-model"
        );
        let (status, evidence) = send(
            &app,
            "GET",
            "/v1/pools/assistant/selections",
            &delegated.token,
            Value::Null,
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        let selection = &evidence["data"][0];
        assert_eq!(selection["pool_revision"], 1);
        assert_eq!(selection["selected_model"], "fast");
        assert_eq!(selection["response_status"], 200);
        assert_eq!(
            selection["operation_id"],
            headers["x-niu-operation-id"].to_str().unwrap()
        );
        assert_eq!(
            selection["attempt_id"],
            headers["x-niu-attempt-id"].to_str().unwrap()
        );
    }
    // Disabling a policy blocks dispatch and does not invent an execution record.
    let mut disabled = policy;
    disabled["revision"] = json!(1);
    disabled["enabled"] = json!(false);
    assert_eq!(
        send(
            &app,
            "PUT",
            "/v1/pools/assistant",
            &delegated.token,
            disabled
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_ne!(
        send(
            &app,
            "POST",
            "/v1/chat/completions",
            &caller.token,
            json!({"model":"pool/assistant","messages":[{"role":"user","content":"hi"}]})
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_eq!(
        store
            .workspace_pool_selections(scope, "assistant")
            .await
            .unwrap()
            .len(),
        3
    );
    task.abort();
}

async fn native_pool_case(pool: PgPool, adapter: &str, path: &str, request: Value) {
    async fn native_messages(Json(body): Json<Value>) -> Json<Value> {
        assert_eq!(body["model"], "provider-secret-model");
        Json(
            json!({"id":"msg_fixture","type":"message","role":"assistant","model":"provider-secret-model","content":[{"type":"text","text":"ok"}],"stop_reason":"end_turn","stop_sequence":null,"usage":{"input_tokens":2,"output_tokens":1}}),
        )
    }
    async fn native_generate(Json(body): Json<Value>) -> Json<Value> {
        assert!(
            body.get("model").is_none(),
            "path-based native requests must not acquire a body model field"
        );
        Json(
            json!({"candidates":[{"content":{"role":"model","parts":[{"text":"ok"}]},"finishReason":"STOP","index":0}],"usageMetadata":{"promptTokenCount":2,"candidatesTokenCount":1,"totalTokenCount":3}}),
        )
    }
    let upstream = Router::new()
        .route("/v1/messages", post(native_messages))
        .route(
            "/v1/models/provider-secret-model:generateContent",
            post(native_generate),
        );
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let task = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
    let mut state = test_state(Some(format!("http://{address}/v1")), pool.clone());
    state
        .store
        .configure_platform_currency("USD")
        .await
        .unwrap();
    crate::payments::readiness::configure_test_gateway(&mut state).await;
    let route = Arc::make_mut(&mut state.config)
        .models
        .get_mut("fast")
        .unwrap();
    route.provider = adapter.into();
    route.supports_messages = adapter == "anthropic";
    route.supports_generate_content = adapter == "gemini";
    let store = state.store.clone();
    let organization = store.create_organization(adapter).await.unwrap();
    let scope = store
        .create_project(organization, "Native pool fixture")
        .await
        .unwrap();
    personal_test_route(&mut state, organization).await;
    let actor = store
        .create_operator(
            OperatorScope {
                organization_id: organization,
                project_id: None,
            },
            "Native pool owner",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let key = grant_capabilities(
        &store,
        scope,
        actor.operator_id,
        &[
            "pools:read".into(),
            "pools:write".into(),
            "evaluations:read".into(),
            "evaluations:write".into(),
        ],
    )
    .await;
    let protocol = if adapter == "anthropic" {
        "messages"
    } else {
        "generate_content"
    };
    let digest = niu_storage::evaluation_request_fingerprint(protocol, &request).unwrap();
    let principal = store.authenticate(&key.token).await.unwrap();
    store
        .set_evaluation_definition(
            &principal,
            &niu_storage::EvaluationDefinition {
                slug: "native-output".into(),
                name: "Native output".into(),
                task: "Check native fixture output".into(),
                rubric: "Output is ok".into(),
                protocol: protocol.into(),
                revision: 0,
                samples: vec![niu_storage::EvaluationSample {
                    reference: "sample-one".into(),
                    request_sha256: digest.clone(),
                }],
            },
        )
        .await
        .unwrap();
    let app = router(state);
    let configuration = json!({"slug":"assistant","name":"Assistant","description":"","enabled":true,"revision":0,"candidates":[{"alias":"fast","priority":100,"weight":1000,"enabled":true}]});
    assert_eq!(
        send(
            &app,
            "PUT",
            "/v1/pools/assistant",
            &key.token,
            configuration
        )
        .await
        .0,
        StatusCode::OK
    );
    let response = app
        .clone()
        .oneshot(
            Request::post(path)
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .header("x-niu-evaluation", "native-output@1/sample-one")
                .body(Body::from(request.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    let headers = response.headers().clone();
    let bytes = to_bytes(response.into_body(), 65536).await.unwrap();
    assert_eq!(
        status,
        StatusCode::OK,
        "{adapter}: {}",
        String::from_utf8_lossy(&bytes)
    );
    assert_eq!(headers["x-niu-pool"], "assistant");
    assert!(headers.get("x-niu-pool-evidence").is_none());
    let evidence = store
        .workspace_pool_selections(scope, "assistant")
        .await
        .unwrap();
    assert_eq!(evidence[0]["response_status"], 200);
    assert_eq!(
        evidence[0]["attempt_id"],
        headers["x-niu-attempt-id"].to_str().unwrap()
    );
    let attempt = Uuid::parse_str(headers["x-niu-attempt-id"].to_str().unwrap()).unwrap();
    let binding = store
        .evaluation_attempt_binding(scope, attempt)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(binding["request_sha256"], digest);
    assert_eq!(binding["evaluation_revision"], 1);
    let (status, receipt) = send(&app, "POST", "/v1/evaluations/native-output/runs", &key.token,
        json!({"slug":"native-baseline","name":"Native baseline","evaluation_revision":1,"evaluator":{"kind":"check","name":"Native fixture","version":"1"},"results":[{"sample":"sample-one","attempt_id":attempt,"verdict":"accepted"}]})).await;
    assert_eq!(status, StatusCode::OK, "{receipt}");
    assert_eq!(receipt["summary"]["unknown_charge_attempts"], 1);
    task.abort();
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn workspace_pools_preserve_native_messages(pool: PgPool) {
    native_pool_case(pool, "anthropic", "/v1/messages", json!({"model":"pool/assistant","max_tokens":16,"messages":[{"role":"user","content":"hi"}]})).await;
}
#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn workspace_pools_preserve_native_generate_content(pool: PgPool) {
    native_pool_case(pool, "gemini", "/v1beta/models/pool%2Fassistant:generateContent", json!({"contents":[{"role":"user","parts":[{"text":"hi"}]}],"generationConfig":{"maxOutputTokens":16}})).await;
}
