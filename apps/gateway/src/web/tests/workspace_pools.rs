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
async fn unfunded_management_connection_can_save_routing_without_expanding_scope(pool: PgPool) {
    let state = test_state(None, pool);
    let store = state.store.clone();
    let scope = store.default_workspace().await.unwrap();
    assert!(store.platform_currency().await.unwrap().is_none());
    let owner = store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: None,
            },
            "Unfunded routing owner",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let authorization = store
        .create_agent_authorization_with_capabilities(
            "Codex",
            &["pools:read".into(), "pools:write".into()],
        )
        .await
        .unwrap();
    store
        .approve_agent_authorization_with_invocation(
            &authorization.user_code,
            scope,
            owner.operator_id,
            &["fast".into()],
            3600,
            false,
        )
        .await
        .unwrap();
    let delegated = store
        .exchange_agent_authorization(&authorization.device_secret)
        .await
        .unwrap()
        .unwrap();
    let other = store
        .create_project(scope.organization_id, "Other workspace")
        .await
        .unwrap();
    let foreign = grant(&store, other, owner.operator_id).await;
    let ordinary = store
        .issue_key(scope, "Inference only", &["fast".into()], 3600)
        .await
        .unwrap();
    let foreign_organization = store
        .create_organization("Foreign directory")
        .await
        .unwrap();
    let foreign_tenant_workspace = store
        .create_project(foreign_organization, "Foreign tenant workspace")
        .await
        .unwrap();
    let foreign_owner = store
        .create_operator(
            OperatorScope {
                organization_id: foreign_organization,
                project_id: None,
            },
            "Foreign owner",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let foreign_tenant = grant(&store, foreign_tenant_workspace, foreign_owner.operator_id).await;
    let app = router(state);
    for prefix in ["/api/v1", "/admin/v1"] {
        assert_eq!(
            send(
                &app,
                "GET",
                &format!("{prefix}/organizations/{}/projects", scope.organization_id),
                &owner.token,
                Value::Null
            )
            .await
            .0,
            StatusCode::OK
        );
        assert_eq!(
            send(
                &app,
                "GET",
                &format!("{prefix}/organizations/{foreign_organization}/projects"),
                &owner.token,
                Value::Null
            )
            .await
            .0,
            StatusCode::NOT_FOUND
        );
    }
    let body = json!({"slug":"assistant","name":"Assistant","description":"Prepared without funding","enabled":true,"revision":0,"candidates":[{"alias":"fast","priority":100,"weight":1,"enabled":true}],"rules":[],"default_action":"candidates"});
    assert_eq!(
        send(
            &app,
            "PUT",
            "/v1/routing/assistant",
            &ordinary.token,
            body.clone()
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    let (status, saved) = send(
        &app,
        "PUT",
        "/v1/routing/assistant",
        &delegated.token,
        body.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{saved}");
    let (status, reopened) = send(
        &app,
        "GET",
        "/v1/routing/assistant",
        &delegated.token,
        Value::Null,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(reopened["data"]["name"], "Assistant");
    assert_eq!(
        send(
            &app,
            "GET",
            "/v1/routing/assistant",
            &foreign.token,
            Value::Null
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    // A management key from another company is a different tenant, not an
    // alternate view of this workspace.
    assert_eq!(
        send(
            &app,
            "GET",
            "/v1/routing/assistant",
            &foreign_tenant.token,
            Value::Null
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        send(&app, "PUT", "/v1/routing/assistant", &delegated.token, body)
            .await
            .0,
        StatusCode::CONFLICT
    );
    assert_eq!(send(&app, "POST", "/v1/chat/completions", &delegated.token,
        json!({"model":"pool/assistant","messages":[{"role":"user","content":"Do not execute"}]})).await.0,
        StatusCode::SERVICE_UNAVAILABLE);
    assert!(
        !store
            .authenticate(&delegated.token)
            .await
            .unwrap()
            .invocation_allowed()
    );
    assert!(store.platform_currency().await.unwrap().is_none());
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn workspace_pool_api_enforces_delegation_scope_preview_and_revisions(pool: PgPool) {
    let mut state = test_state(None, pool);
    let model = std::sync::Arc::make_mut(&mut state.config)
        .models
        .get_mut("fast")
        .unwrap();
    model.catalog.context_length = Some(1024);
    model.catalog.max_completion_tokens = Some(512);
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
            "/v1/routing/assistant",
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
        "/v1/routing/preview",
        &delegated.token,
        body.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(preview["data"]["persisted"], false);
    for (context, outcome, reason) in [
        (json!({"protocol":"chat"}), "candidates", Value::Null),
        (
            json!({"protocol":"chat","estimated_input_tokens":512,"requested_output_tokens":512}),
            "candidates",
            Value::Null,
        ),
        (
            json!({"protocol":"chat","estimated_input_tokens":513,"requested_output_tokens":512}),
            "no_eligible_candidates",
            json!("request_capability_not_supported"),
        ),
        (
            json!({"protocol":"chat","requested_output_tokens":513}),
            "no_eligible_candidates",
            json!("request_capability_not_supported"),
        ),
        (
            json!({"protocol":"chat","vision":true}),
            "no_eligible_candidates",
            json!("request_capability_not_supported"),
        ),
        (
            json!({"protocol":"chat","reasoning":true}),
            "no_eligible_candidates",
            json!("request_capability_not_supported"),
        ),
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
            "/v1/routing/preview",
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
        "/v1/routing/preview",
        &delegated.token,
        json!({"configuration":conditional,"context":{"protocol":"chat"}}),
    )
    .await;
    assert_eq!(matched["data"]["simulation"]["matched_rule"], "chat-tasks");
    let (_, rejected) = send(
        &app,
        "POST",
        "/v1/routing/preview",
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
        "/v1/routing/preview",
        &delegated.token,
        json!({"configuration":conditional,"context":{"protocol":"chat"}}),
    )
    .await;
    assert_eq!(disabled["data"]["simulation"]["outcome"], "pool_disabled");
    for context in [
        json!({"protocol":"chat","requested_output_tokens":0}),
        json!({"protocol":"video_text"}),
        json!({"protocol":"chat","extra":true}),
        // A preview cannot declare a trait the selected protocol adapter cannot
        // carry; dispatch rejects the same request shape instead of dropping it.
        json!({"protocol":"responses","tools":true}),
        json!({"protocol":"messages","vision":true}),
        json!({"protocol":"messages","structured_output":true}),
        json!({"protocol":"generate_content","streaming":true}),
        json!({"protocol":"chat","embedding_dimensions":true}),
    ] {
        assert_eq!(
            send(
                &app,
                "POST",
                "/v1/routing/preview",
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
        "/v1/routing/assistant",
        &delegated.token,
        body.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(saved["data"]["revision"], 1);
    assert!(saved["data"].get("pricing").is_none());
    assert!(saved["data"].get("organization_id").is_none());
    // Preview and dispatch must produce the same explicit rejection for a
    // protocol-native request containing a trait the adapter cannot express.
    for (path, request, context, message) in [
        (
            "/v1/responses",
            json!({"model":"pool/assistant","input":"hi","tools":[]}),
            json!({"protocol":"responses","tools":true}),
            "Responses requests do not support tool declarations",
        ),
        (
            "/v1/messages",
            json!({"model":"pool/assistant","max_tokens":16,"messages":[
                {"role":"user","content":[
                    {"type":"image","source":{"type":"base64","media_type":"image/png","data":"AAAA"}}
                ]}
            ]}),
            json!({"protocol":"messages","vision":true}),
            "Messages requests do not support image or document inputs",
        ),
        (
            "/v1beta/models/pool%2Fassistant:generateContent",
            json!({
                "contents":[{"role":"user","parts":[{"text":"hi"}]}],
                "generationConfig":{"maxOutputTokens":16},
                "tools":[{"functionDeclarations":[{"name":"lookup"}]}]
            }),
            json!({"protocol":"generate_content","tools":true}),
            "GenerateContent requests do not support tool declarations",
        ),
    ] {
        let (preview_status, preview) = send(
            &app,
            "POST",
            "/v1/routing/preview",
            &delegated.token,
            json!({"configuration":body,"context":context}),
        )
        .await;
        assert_eq!(preview_status, StatusCode::BAD_REQUEST);
        let (dispatch_status, dispatch) = send(&app, "POST", path, &ordinary.token, request).await;
        assert_eq!(
            dispatch_status,
            StatusCode::BAD_REQUEST,
            "{path}: {dispatch}"
        );
        assert_eq!(
            preview["error"]["message"], dispatch["error"]["message"],
            "{path} preview/dispatch message parity"
        );
        assert!(
            dispatch["error"]["message"]
                .as_str()
                .unwrap()
                .contains(message),
            "{path}: {dispatch}"
        );
    }
    assert_eq!(
        send(
            &app,
            "PUT",
            "/v1/routing/assistant",
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
            "/v1/routing/assistant",
            &foreign.token,
            Value::Null
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    let (status, page) = send(&app, "GET", "/v1/routing", &delegated.token, Value::Null).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(page["data"].as_array().unwrap().len(), 1);
    let (status, history) = send(
        &app,
        "GET",
        "/v1/routing/assistant/history",
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
            "/v1/routing/assistant",
            &delegated.token,
            invalid
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    store.revoke_key(scope, delegated.id).await.unwrap();
    assert_eq!(
        send(&app, "PUT", "/v1/routing/assistant", &delegated.token, body)
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
            "/v1/routing/assistant",
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
            "/v1/routing/assistant/selections",
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
            "/v1/routing/assistant",
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
            "/v1/routing/assistant",
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

async fn grant_models(
    store: &Store,
    scope: TenantScope,
    actor: Uuid,
    models: &[String],
) -> IssuedKey {
    let request = store
        .create_agent_authorization_with_capabilities(
            "Codex",
            &["pools:read".into(), "pools:write".into()],
        )
        .await
        .unwrap();
    store
        .approve_agent_authorization(&request.user_code, scope, actor, models, 3600)
        .await
        .unwrap();
    store
        .exchange_agent_authorization(&request.device_secret)
        .await
        .unwrap()
        .unwrap()
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn workspace_pool_customer_price_strategy_is_explicit_and_keeps_unknowns_unknown(
    pool: PgPool,
) {
    let captured = Captured::default();
    let upstream = Router::new()
        .route("/v1/chat/completions", post(provider))
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
    let pricing = || crate::config::RoutePricing {
        currency: "USD".into(),
        api_prompt_rate: 2_000_000,
        api_completion_rate: 2_000_000,
        cash_prompt_rate: 2_000_000,
        cash_completion_rate: 2_000_000,
        max_input_tokens: 1_000_000,
        max_output_tokens: 1_000_000,
    };
    let mut fast = state.config.models["fast"].clone();
    fast.pricing = Some(pricing());
    let mut cheap = fast.clone();
    cheap.upstream_model = "cheap-upstream".into();
    cheap.catalog.max_completion_tokens = Some(256);
    cheap.pricing = Some(pricing());
    let mut missing = fast.clone();
    missing.upstream_model = "missing-upstream".into();
    missing.pricing = Some(pricing());
    {
        let models = &mut Arc::make_mut(&mut state.config).models;
        models.insert("fast".into(), fast);
        models.insert("cheap".into(), cheap);
        models.insert("missing".into(), missing);
    }
    let store = state.store.clone();
    let scope = store.default_workspace().await.unwrap();
    store
        .publish_customer_balance_grant(
            scope.organization_id,
            niu_storage::CustomerBalanceGrantPublication {
                currency: "USD",
                amount_nanos: 1_000_000_000,
                reason: "Isolated customer-price routing fixture",
                idempotency_key: Uuid::new_v4(),
            },
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    // Legacy static commercial routes reserve against a project procurement
    // budget. This fixture budget is test-only and unrelated to customer prices.
    store
        .create_budget(scope, "USD", 1_000_000_000)
        .await
        .unwrap();
    for (alias, currency, prompt_rate, completion_rate) in [
        ("fast", "USD", "5000000", "5000000"),
        ("cheap", "USD", "1000000", "1000000"),
    ] {
        store
            .publish_customer_tariff(
                scope,
                &niu_storage::ProviderOfferInput {
                    model_alias: alias.into(),
                    currency: currency.into(),
                    prompt_rate: prompt_rate.into(),
                    completion_rate: completion_rate.into(),
                    expected_revision: None,
                },
            )
            .await
            .unwrap();
    }
    let actor = store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: None,
            },
            "Customer price owner",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let all_models = ["cheap", "fast", "missing"].map(str::to_owned).to_vec();
    let delegated = grant_models(&store, scope, actor.operator_id, &all_models).await;
    let caller = store
        .issue_key(scope, "Customer price caller", &all_models, 3600)
        .await
        .unwrap();
    let fast_only = store
        .issue_key(scope, "Fast-only caller", &["fast".into()], 3600)
        .await
        .unwrap();
    let app = router(state);
    let strategy = json!({
        "version": 1,
        "mode": "customer_price",
        "customer_price": {
            "currency": "USD",
            "unit": "nanounits_per_million_tokens",
            "input_tokens": 1000000,
            "output_tokens": 100000
        }
    });
    let candidates = json!([
        {"alias": "fast", "priority": 1000, "weight": 1000, "enabled": true},
        {"alias": "cheap", "priority": 1, "weight": 1, "enabled": true},
        {"alias": "missing", "priority": 3, "weight": 1, "enabled": true}
    ]);
    let configuration = json!({
        "slug": "assistant",
        "name": "Price aware",
        "description": "",
        "enabled": true,
        "revision": 0,
        "strategy": strategy,
        "candidates": candidates,
        "rules": [],
        "default_action": "candidates"
    });
    let (status, preview) = send(
        &app,
        "POST",
        "/v1/routing/preview",
        &delegated.token,
        json!({"configuration": configuration, "context": {"protocol": "chat"}}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{preview}");
    let simulation = &preview["data"]["simulation"];
    assert_eq!(simulation["selection_basis"], "customer_price");
    assert_eq!(simulation["selected_candidate"], "cheap");
    assert_eq!(simulation["fallback_reason"], Value::Null);
    assert_eq!(simulation["strategy"], strategy);
    let price_rows = simulation["price_evaluation"]["candidates"]
        .as_array()
        .unwrap();
    let row = |alias: &str| price_rows.iter().find(|row| row["alias"] == alias).unwrap();
    assert_eq!(
        row("missing")["price_unknown_reason"],
        "missing_customer_price"
    );
    assert_eq!(
        row("missing")["estimated_customer_charge_nanos"],
        Value::Null
    );
    let cheap_charge: i64 = row("cheap")["estimated_customer_charge_nanos"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap();
    let fast_charge: i64 = row("fast")["estimated_customer_charge_nanos"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap();
    assert!(cheap_charge < fast_charge);
    assert_eq!(simulation["live_dispatch"], false);
    assert_eq!(preview["data"]["persisted"], false);

    // A pool whose only candidate lacks a price must not invent a free
    // winner, and a strategy currency that does not match the workspace's
    // selling currency must not compare the amounts.
    for (mut unpriced, reason) in [
        (configuration.clone(), "missing_customer_price"),
        (configuration.clone(), "currency_mismatch"),
    ] {
        unpriced["candidates"] = if reason == "missing_customer_price" {
            json!([{"alias": "missing", "priority": 100, "weight": 1, "enabled": true}])
        } else {
            unpriced["strategy"]["customer_price"]["currency"] = json!("EUR");
            json!([{"alias": "cheap", "priority": 100, "weight": 1, "enabled": true}])
        };
        let (status, preview) = send(
            &app,
            "POST",
            "/v1/routing/preview",
            &delegated.token,
            json!({"configuration": unpriced, "context": {"protocol": "chat"}}),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{preview}");
        assert_eq!(
            preview["data"]["simulation"]["selection_basis"],
            "priority_weight_fallback"
        );
        assert_eq!(
            preview["data"]["simulation"]["fallback_reason"],
            "no_comparable_customer_price"
        );
        assert_eq!(
            preview["data"]["simulation"]["selected_candidate"],
            Value::Null
        );
        assert_eq!(
            preview["data"]["simulation"]["price_evaluation"]["candidates"][0]["price_unknown_reason"],
            reason
        );
    }

    // Unsupported strategy versions and mismatched mode payloads are rejected,
    // never silently downgraded to another strategy.
    for invalid in [
        json!({"version": 2, "mode": "priority_weight"}),
        json!({"version": 1, "mode": "customer_price"}),
        json!({"version": 1, "mode": "priority_weight", "customer_price": {
            "currency": "USD", "unit": "nanounits_per_million_tokens",
            "input_tokens": 1, "output_tokens": 1
        }}),
    ] {
        let mut invalid_configuration = configuration.clone();
        invalid_configuration["strategy"] = invalid;
        assert_eq!(
            send(
                &app,
                "POST",
                "/v1/routing/preview",
                &delegated.token,
                json!({"configuration": invalid_configuration, "context": {"protocol": "chat"}})
            )
            .await
            .0,
            StatusCode::BAD_REQUEST
        );
    }

    let (status, saved) = send(
        &app,
        "PUT",
        "/v1/routing/assistant",
        &delegated.token,
        configuration.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{saved}");
    assert_eq!(saved["data"]["strategy"], strategy);

    // Runtime selection uses the same evaluation as preview and the selected
    // concrete alias reaches the fixture upstream only.
    *captured.0.lock().unwrap() = None;
    let (status, selected) = send(
        &app,
        "POST",
        "/v1/chat/completions",
        &caller.token,
        json!({"model": "pool/assistant", "messages": [{"role": "user", "content": "hi"}]}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{selected}");
    assert_eq!(selected["model"], "cheap");
    assert_eq!(
        captured.0.lock().unwrap().as_ref().unwrap().1["model"],
        "cheap-upstream"
    );

    // Model grants are applied before price ranking: a caller that may only
    // invoke the more expensive model cannot be routed to the cheaper one.
    *captured.0.lock().unwrap() = None;
    let (status, selected) = send(
        &app,
        "POST",
        "/v1/chat/completions",
        &fast_only.token,
        json!({"model": "pool/assistant", "messages": [{"role": "user", "content": "hi"}]}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{selected}");
    assert_eq!(selected["model"], "fast");
    assert_eq!(
        captured.0.lock().unwrap().as_ref().unwrap().1["model"],
        "provider-secret-model"
    );

    // Declared completion caps are applied before price ranking too: the
    // cheaper model cannot serve this request, so it is not selected.
    *captured.0.lock().unwrap() = None;
    let (status, selected) = send(
        &app,
        "POST",
        "/v1/chat/completions",
        &caller.token,
        json!({
            "model": "pool/assistant",
            "max_tokens": 300,
            "messages": [{"role": "user", "content": "hi"}]
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{selected}");
    assert_eq!(selected["model"], "fast");

    // Workspace spending caps still deny dispatch after a price-aware
    // selection; no upstream request is sent for the denied attempt. The cap
    // is set to the already committed amount, so no additional spend fits.
    let spending = store
        .customer_workspace_spending_limits(scope)
        .await
        .unwrap();
    let committed: i64 = spending[0]["committed_nanos"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap();
    store
        .set_customer_workspace_spending_limit(scope, "USD", committed, 0)
        .await
        .unwrap();
    *captured.0.lock().unwrap() = None;
    let (status, denied) = send(
        &app,
        "POST",
        "/v1/chat/completions",
        &caller.token,
        json!({"model": "pool/assistant", "messages": [{"role": "user", "content": "hi"}]}),
    )
    .await;
    assert_eq!(status, StatusCode::PAYMENT_REQUIRED, "{denied}");
    assert_eq!(denied["error"]["type"], "workspace_spending_limit_exceeded");
    assert!(captured.0.lock().unwrap().is_none());
    task.abort();
}

#[derive(Clone, Default)]
struct AutoFixture {
    requests: Arc<Mutex<Vec<Value>>>,
    decision: Arc<Mutex<String>>,
    decider_status: Arc<Mutex<u16>>,
    decider_delay_ms: Arc<Mutex<u64>>,
}

impl AutoFixture {
    fn set_decision(&self, value: Value) {
        *self.decision.lock().unwrap() = value.to_string();
    }

    fn requests(&self) -> Vec<Value> {
        self.requests.lock().unwrap().clone()
    }

    fn reset(&self) {
        *self.requests.lock().unwrap() = Vec::new();
        *self.decider_status.lock().unwrap() = 200;
        *self.decider_delay_ms.lock().unwrap() = 0;
    }
}

async fn auto_provider(
    State(fixture): State<AutoFixture>,
    Json(body): Json<Value>,
) -> (StatusCode, Json<Value>) {
    fixture.requests.lock().unwrap().push(body.clone());
    if body["model"] == "decider-upstream" {
        let status = *fixture.decider_status.lock().unwrap();
        let delay = *fixture.decider_delay_ms.lock().unwrap();
        if delay > 0 {
            tokio::time::sleep(std::time::Duration::from_millis(delay)).await;
        }
        if status != 200 {
            return (
                StatusCode::from_u16(status).unwrap(),
                Json(json!({"error": {"message": "fixture decision failure"}})),
            );
        }
        let content = fixture.decision.lock().unwrap().clone();
        return (
            StatusCode::OK,
            Json(json!({
                "id": "auto-decision",
                "created": 1,
                "model": "decider-upstream",
                "choices": [{
                    "index": 0,
                    "message": {"role": "assistant", "content": content},
                    "finish_reason": "stop"
                }],
                "usage": {"prompt_tokens": 100, "completion_tokens": 10, "total_tokens": 110}
            })),
        );
    }
    (
        StatusCode::OK,
        Json(json!({
            "id": "auto-generation",
            "created": 2,
            "model": body["model"],
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": "generated"},
                "finish_reason": "stop"
            }],
            "usage": {"prompt_tokens": 2, "completion_tokens": 1, "total_tokens": 3}
        })),
    )
}

async fn send_routed(
    app: &Router,
    token: &str,
    body: Value,
    routing_context: &str,
) -> (StatusCode, axum::http::HeaderMap, Value) {
    let response = app
        .clone()
        .oneshot(
            axum::http::Request::builder()
                .method("POST")
                .uri("/v1/chat/completions")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .header("x-niu-routing-context", routing_context)
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    let headers = response.headers().clone();
    let bytes = to_bytes(response.into_body(), 65536).await.unwrap();
    let value = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).unwrap()
    };
    (status, headers, value)
}

fn header(headers: &axum::http::HeaderMap, name: &'static str) -> Option<String> {
    headers
        .get(name)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned)
}

fn auto_decider() -> Value {
    json!({
        "model": "decider",
        "currency": "USD",
        "timeout_ms": 500,
        "max_calls": 1,
        "max_input_tokens": 1024,
        "max_output_tokens": 32,
        "max_spend_nanos": 5000000,
        "min_confidence": 0.6,
        "on_abstain": "fallback",
        "on_failure": "fallback"
    })
}

fn auto_strategy(decider: Value) -> Value {
    json!({
        "version": 2,
        "mode": "auto",
        "auto": {
            "paths": [
                {
                    "id": "deep",
                    "name": "Deep reasoning",
                    "description": "Architecture and debugging work",
                    "response_type": "text",
                    "candidates": ["deep-model"],
                    "task": ["architecture"]
                },
                {
                    "id": "quick",
                    "name": "Quick answers",
                    "response_type": "text",
                    "candidates": ["fast"],
                    "task": ["chat"]
                },
                {
                    "id": "embed",
                    "name": "Embeddings",
                    "response_type": "embedding",
                    "candidates": ["fast"]
                }
            ],
            "decider": decider
        }
    })
}

fn auto_configuration(strategy: Value, revision: i64) -> Value {
    json!({
        "slug": "assistant",
        "name": "Semantic auto",
        "description": "",
        "enabled": true,
        "revision": revision,
        "strategy": strategy,
        "candidates": [
            {"alias": "deep-model", "priority": 100, "weight": 1, "enabled": true},
            {"alias": "fast", "priority": 10, "weight": 1, "enabled": true}
        ],
        "rules": [],
        "default_action": "candidates"
    })
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn workspace_pool_semantic_auto_is_explicit_bounded_and_falls_back(pool: PgPool) {
    let fixture = AutoFixture::default();
    fixture.reset();
    let upstream = Router::new()
        .route("/v1/chat/completions", post(auto_provider))
        .with_state(fixture.clone());
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
    let pricing = || crate::config::RoutePricing {
        currency: "USD".into(),
        api_prompt_rate: 1_000_000,
        api_completion_rate: 1_000_000,
        cash_prompt_rate: 1_000_000,
        cash_completion_rate: 1_000_000,
        max_input_tokens: 1_000_000,
        max_output_tokens: 1_000_000,
    };
    let mut fast = state.config.models["fast"].clone();
    fast.upstream_model = "fast-upstream".into();
    fast.pricing = Some(pricing());
    let mut deep = fast.clone();
    deep.upstream_model = "deep-upstream".into();
    let mut decider = fast.clone();
    decider.upstream_model = "decider-upstream".into();
    {
        let models = &mut Arc::make_mut(&mut state.config).models;
        models.insert("fast".into(), fast);
        models.insert("deep-model".into(), deep);
        models.insert("decider".into(), decider);
    }
    let store = state.store.clone();
    let scope = store.default_workspace().await.unwrap();
    store
        .publish_customer_balance_grant(
            scope.organization_id,
            niu_storage::CustomerBalanceGrantPublication {
                currency: "USD",
                amount_nanos: 1_000_000_000,
                reason: "Isolated semantic Auto routing fixture",
                idempotency_key: Uuid::new_v4(),
            },
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    store
        .create_budget(scope, "USD", 1_000_000_000)
        .await
        .unwrap();
    for alias in ["decider", "deep-model", "fast"] {
        store
            .publish_customer_tariff(
                scope,
                &niu_storage::ProviderOfferInput {
                    model_alias: alias.into(),
                    currency: "USD".into(),
                    prompt_rate: "1000000".into(),
                    completion_rate: "1000000".into(),
                    expected_revision: None,
                },
            )
            .await
            .unwrap();
    }
    let actor = store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: None,
            },
            "Semantic Auto owner",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let all_models = ["decider", "deep-model", "fast"]
        .map(str::to_owned)
        .to_vec();
    let delegated = grant_models(&store, scope, actor.operator_id, &all_models).await;
    let caller = store
        .issue_key(scope, "Auto caller", &all_models, 3600)
        .await
        .unwrap();
    let fast_only = store
        .issue_key(scope, "Fast-only Auto caller", &["fast".into()], 3600)
        .await
        .unwrap();
    let app = router(state);
    let strategy = auto_strategy(auto_decider());
    let mut configuration = auto_configuration(strategy.clone(), 0);

    // Preview evaluates caller context without any decider call.
    let (status, preview) = send(
        &app,
        "POST",
        "/v1/routing/preview",
        &delegated.token,
        json!({
            "configuration": configuration,
            "context": {"protocol": "chat", "task": "chat"}
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{preview}");
    let simulation = &preview["data"]["simulation"];
    assert_eq!(simulation["selection_basis"], "auto_context");
    assert_eq!(simulation["selected_path"], "quick");
    assert_eq!(simulation["decision"]["outcome"], "context_match");
    assert_eq!(simulation["decision"]["calls"], 0);
    assert_eq!(simulation["decision"]["live_dispatch"], false);
    assert!(fixture.requests().is_empty());

    // Without a context match, preview reports that runtime would require the
    // decider, lists only response-compatible paths, and still makes no call.
    let (status, preview) = send(
        &app,
        "POST",
        "/v1/routing/preview",
        &delegated.token,
        json!({
            "configuration": configuration,
            "context": {"protocol": "chat", "task": "unmatched"}
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{preview}");
    let simulation = &preview["data"]["simulation"];
    assert_eq!(simulation["selection_basis"], "auto_decider_required");
    assert_eq!(simulation["decision"]["outcome"], "decider_required");
    assert_eq!(simulation["decision"]["calls"], 0);
    assert_eq!(simulation["decision"]["live_dispatch"], false);
    assert_eq!(
        simulation["decision"]["compatible_paths"],
        json!(["deep", "quick"])
    );
    assert_eq!(simulation["decision"]["decider"]["model"], "decider");
    assert_eq!(
        simulation["decision"]["decider"]["maximum_estimated_charge_nanos"],
        "1056"
    );
    assert!(fixture.requests().is_empty());

    let (status, preview) = send(
        &app,
        "POST",
        "/v1/routing/preview",
        &delegated.token,
        json!({
            "configuration": configuration,
            "context": {"protocol": "embeddings", "task": "unmatched"}
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{preview}");
    assert_eq!(
        preview["data"]["simulation"]["selection_basis"],
        "auto_decider_required"
    );
    assert_eq!(
        preview["data"]["simulation"]["decision"]["compatible_paths"],
        json!(["embed"])
    );

    for invalid_context in [
        json!({"protocol": "chat", "task": "bad token"}),
        json!({"protocol": "chat", "stage": ""}),
        json!({"protocol": "chat", "task": "a", "extra": true}),
    ] {
        let (status, _) = send(
            &app,
            "POST",
            "/v1/routing/preview",
            &delegated.token,
            json!({"configuration": configuration, "context": invalid_context}),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
    }

    let (status, saved) = send(
        &app,
        "PUT",
        "/v1/routing/assistant",
        &delegated.token,
        configuration.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{saved}");
    assert_eq!(saved["data"]["strategy"], strategy);
    let mut revision = saved["data"]["revision"].as_i64().unwrap();

    // Context-only runtime selection makes no decider call. The conversation
    // marker proves the decider prompt never contains request content.
    fixture.reset();
    let (status, headers, selected) = send_routed(
        &app,
        &caller.token,
        json!({
            "model": "pool/assistant",
            "messages": [{"role": "user", "content": "conversation-marker-7f3c"}]
        }),
        r#"{"task":"chat"}"#,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{selected}");
    assert_eq!(selected["model"], "fast");
    assert_eq!(
        header(&headers, "x-niu-routing-decision").as_deref(),
        Some("context_match")
    );
    assert_eq!(
        header(&headers, "x-niu-routing-path").as_deref(),
        Some("quick")
    );
    assert_eq!(
        header(&headers, "x-niu-routing-decision-calls").as_deref(),
        Some("0")
    );
    assert_eq!(fixture.requests().len(), 1);
    assert_eq!(fixture.requests()[0]["model"], "fast-upstream");

    // A bounded decider call selects one declared compatible path. It runs
    // before the generation attempt and never sees conversation content.
    fixture.reset();
    fixture.set_decision(json!({"path": "deep", "confidence": 0.9}));
    let (status, headers, selected) = send_routed(
        &app,
        &caller.token,
        json!({
            "model": "pool/assistant",
            "messages": [{"role": "user", "content": "conversation-marker-7f3c"}]
        }),
        r#"{"task":"unmatched"}"#,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{selected}");
    assert_eq!(selected["model"], "deep-model");
    assert_eq!(
        header(&headers, "x-niu-routing-decision").as_deref(),
        Some("decider_selected")
    );
    assert_eq!(
        header(&headers, "x-niu-routing-path").as_deref(),
        Some("deep")
    );
    assert_eq!(
        header(&headers, "x-niu-routing-decision-calls").as_deref(),
        Some("1")
    );
    assert_eq!(
        header(&headers, "x-niu-routing-decision-input-tokens").as_deref(),
        Some("100")
    );
    assert_eq!(
        header(&headers, "x-niu-routing-decision-output-tokens").as_deref(),
        Some("10")
    );
    assert_eq!(
        header(&headers, "x-niu-routing-decision-charge-nanos").as_deref(),
        Some("110")
    );
    let requests = fixture.requests();
    assert_eq!(requests.len(), 2, "{requests:?}");
    assert_eq!(requests[0]["model"], "decider-upstream");
    assert_eq!(requests[1]["model"], "deep-upstream");
    assert_eq!(requests[0]["max_tokens"], 32);
    let prompt = requests[0]["messages"][1]["content"].as_str().unwrap();
    assert!(prompt.contains("id=deep"));
    assert!(prompt.contains("id=quick"));
    assert!(prompt.contains(r#"{"task":"unmatched"}"#));
    assert!(!prompt.contains("conversation-marker-7f3c"));
    assert!(!prompt.contains("deep-model"));
    assert!(!prompt.contains("fast-upstream"));

    // The immutable selection carries the same bounded decision evidence.
    let (status, selections) = send(
        &app,
        "GET",
        "/v1/routing/assistant/selections",
        &delegated.token,
        Value::Null,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{selections}");
    let decision = &selections["data"][0]["decision"];
    assert_eq!(decision["outcome"], "decider_selected");
    assert_eq!(decision["path"], "deep");
    assert_eq!(decision["calls"], 1);
    assert_eq!(decision["input_tokens"], 100);
    assert_eq!(decision["output_tokens"], 10);
    assert_eq!(decision["tokens_estimated"], false);
    assert_eq!(decision["estimated_customer_charge_nanos"], "110");

    // Abstention applies the configured fallback and never invents a path.
    fixture.reset();
    fixture.set_decision(json!({"path": null, "confidence": 0.99}));
    let (status, headers, selected) = send_routed(
        &app,
        &caller.token,
        json!({"model": "pool/assistant", "messages": [{"role": "user", "content": "hi"}]}),
        r#"{"task":"unmatched"}"#,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{selected}");
    assert_eq!(selected["model"], "deep-model");
    assert_eq!(
        header(&headers, "x-niu-routing-decision").as_deref(),
        Some("priority_weight_fallback")
    );
    assert_eq!(
        header(&headers, "x-niu-routing-decision-reason").as_deref(),
        Some("decider_abstained")
    );

    // An incompatible decision is a failure, never a silent response-type
    // substitution. The embedding path is not offered for a text request.
    fixture.reset();
    fixture.set_decision(json!({"path": "embed", "confidence": 0.9}));
    let (status, headers, selected) = send_routed(
        &app,
        &caller.token,
        json!({"model": "pool/assistant", "messages": [{"role": "user", "content": "hi"}]}),
        r#"{"task":"unmatched"}"#,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{selected}");
    assert_eq!(selected["model"], "deep-model");
    assert_eq!(
        header(&headers, "x-niu-routing-decision").as_deref(),
        Some("priority_weight_fallback")
    );
    assert_eq!(
        header(&headers, "x-niu-routing-decision-reason").as_deref(),
        Some("incompatible_path")
    );

    // Malformed decisions are failures rather than best-effort interpretations.
    fixture.reset();
    fixture.set_decision(json!({"path": "deep", "confidence": 2}));
    let (_, headers, selected) = send_routed(
        &app,
        &caller.token,
        json!({"model": "pool/assistant", "messages": [{"role": "user", "content": "hi"}]}),
        r#"{"task":"unmatched"}"#,
    )
    .await;
    assert_eq!(selected["model"], "deep-model");
    assert_eq!(
        header(&headers, "x-niu-routing-decision-reason").as_deref(),
        Some("invalid_decision")
    );

    // Transport failure falls back deterministically.
    fixture.reset();
    *fixture.decider_status.lock().unwrap() = 500;
    let (status, headers, selected) = send_routed(
        &app,
        &caller.token,
        json!({"model": "pool/assistant", "messages": [{"role": "user", "content": "hi"}]}),
        r#"{"task":"unmatched"}"#,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{selected}");
    assert_eq!(selected["model"], "deep-model");
    assert_eq!(
        header(&headers, "x-niu-routing-decision-reason").as_deref(),
        Some("transport")
    );

    // The configured timeout bounds the decision call; the request falls back
    // instead of waiting for the slow decider.
    fixture.reset();
    fixture.set_decision(json!({"path": "deep", "confidence": 0.9}));
    *fixture.decider_delay_ms.lock().unwrap() = 200;
    configuration["strategy"]["auto"]["decider"]["timeout_ms"] = json!(50);
    configuration["revision"] = json!(revision);
    let (status, saved) = send(
        &app,
        "PUT",
        "/v1/routing/assistant",
        &delegated.token,
        configuration.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{saved}");
    revision = saved["data"]["revision"].as_i64().unwrap();
    let (status, headers, selected) = send_routed(
        &app,
        &caller.token,
        json!({"model": "pool/assistant", "messages": [{"role": "user", "content": "hi"}]}),
        r#"{"task":"unmatched"}"#,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{selected}");
    assert_eq!(selected["model"], "deep-model");
    assert_eq!(
        header(&headers, "x-niu-routing-decision").as_deref(),
        Some("priority_weight_fallback")
    );
    assert_eq!(
        header(&headers, "x-niu-routing-decision-reason").as_deref(),
        Some("timeout")
    );
    assert_eq!(
        header(&headers, "x-niu-routing-decision-calls").as_deref(),
        Some("1")
    );

    // Input and spend bounds are checked before dispatch; no decider call is
    // made when either configured ceiling cannot be satisfied.
    fixture.reset();
    configuration["strategy"]["auto"]["decider"]["timeout_ms"] = json!(500);
    configuration["strategy"]["auto"]["decider"]["max_input_tokens"] = json!(1);
    configuration["revision"] = json!(revision);
    let (status, saved) = send(
        &app,
        "PUT",
        "/v1/routing/assistant",
        &delegated.token,
        configuration.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{saved}");
    revision = saved["data"]["revision"].as_i64().unwrap();
    let (_, headers, selected) = send_routed(
        &app,
        &caller.token,
        json!({"model": "pool/assistant", "messages": [{"role": "user", "content": "hi"}]}),
        r#"{"task":"unmatched"}"#,
    )
    .await;
    assert_eq!(selected["model"], "deep-model");
    assert_eq!(
        header(&headers, "x-niu-routing-decision-reason").as_deref(),
        Some("input_bound_exceeded")
    );
    assert_eq!(
        header(&headers, "x-niu-routing-decision-calls").as_deref(),
        Some("0")
    );
    assert_eq!(fixture.requests().len(), 1, "only generation may run");

    configuration["strategy"]["auto"]["decider"]["max_input_tokens"] = json!(1024);
    configuration["strategy"]["auto"]["decider"]["max_spend_nanos"] = json!(1);
    configuration["revision"] = json!(revision);
    let (status, saved) = send(
        &app,
        "PUT",
        "/v1/routing/assistant",
        &delegated.token,
        configuration.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{saved}");
    revision = saved["data"]["revision"].as_i64().unwrap();
    fixture.reset();
    let (_, headers, selected) = send_routed(
        &app,
        &caller.token,
        json!({"model": "pool/assistant", "messages": [{"role": "user", "content": "hi"}]}),
        r#"{"task":"unmatched"}"#,
    )
    .await;
    assert_eq!(selected["model"], "deep-model");
    assert_eq!(
        header(&headers, "x-niu-routing-decision-reason").as_deref(),
        Some("spend_bound_exceeded")
    );
    assert_eq!(
        header(&headers, "x-niu-routing-decision-calls").as_deref(),
        Some("0")
    );
    assert_eq!(fixture.requests().len(), 1, "only generation may run");

    // A decider that reports more completion tokens than the configured ceiling
    // is a failure, not an accepted decision.
    configuration["strategy"]["auto"]["decider"]["max_spend_nanos"] = json!(5000000);
    configuration["strategy"]["auto"]["decider"]["max_output_tokens"] = json!(1);
    configuration["revision"] = json!(revision);
    let (status, saved) = send(
        &app,
        "PUT",
        "/v1/routing/assistant",
        &delegated.token,
        configuration.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{saved}");
    revision = saved["data"]["revision"].as_i64().unwrap();
    fixture.reset();
    fixture.set_decision(json!({"path": "deep", "confidence": 0.9}));
    let (_, headers, selected) = send_routed(
        &app,
        &caller.token,
        json!({"model": "pool/assistant", "messages": [{"role": "user", "content": "hi"}]}),
        r#"{"task":"unmatched"}"#,
    )
    .await;
    assert_eq!(selected["model"], "deep-model");
    assert_eq!(
        header(&headers, "x-niu-routing-decision-reason").as_deref(),
        Some("output_bound_exceeded")
    );
    assert_eq!(
        header(&headers, "x-niu-routing-decision-calls").as_deref(),
        Some("1")
    );

    // A reject policy fails the request before generation; the bounded decider
    // attempt is still observed, but no incompatible or fallback model runs.
    configuration["strategy"]["auto"]["decider"] = json!({
        "model": "decider",
        "currency": "USD",
        "timeout_ms": 500,
        "max_calls": 1,
        "max_input_tokens": 1024,
        "max_output_tokens": 32,
        "max_spend_nanos": 5000000,
        "min_confidence": 0.6,
        "on_abstain": "reject",
        "on_failure": "reject"
    });
    configuration["revision"] = json!(revision);
    let (status, saved) = send(
        &app,
        "PUT",
        "/v1/routing/assistant",
        &delegated.token,
        configuration.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{saved}");
    revision = saved["data"]["revision"].as_i64().unwrap();
    fixture.reset();
    *fixture.decider_status.lock().unwrap() = 500;
    let (status, _headers, rejected) = send_routed(
        &app,
        &caller.token,
        json!({"model": "pool/assistant", "messages": [{"role": "user", "content": "hi"}]}),
        r#"{"task":"unmatched"}"#,
    )
    .await;
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE, "{rejected}");
    assert_eq!(rejected["error"]["type"], "routing_decision_rejected");
    assert_eq!(
        fixture.requests().len(),
        1,
        "only the decision attempt runs"
    );

    // Restore the full strategy and verify key grants apply before any call.
    configuration["strategy"] = strategy.clone();
    configuration["revision"] = json!(revision);
    let (status, saved) = send(
        &app,
        "PUT",
        "/v1/routing/assistant",
        &delegated.token,
        configuration.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{saved}");
    fixture.reset();
    let (status, headers, selected) = send_routed(
        &app,
        &fast_only.token,
        json!({"model": "pool/assistant", "messages": [{"role": "user", "content": "hi"}]}),
        r#"{"task":"unmatched"}"#,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{selected}");
    assert_eq!(selected["model"], "fast");
    assert_eq!(
        header(&headers, "x-niu-routing-decision-reason").as_deref(),
        Some("model_not_granted")
    );
    assert_eq!(
        header(&headers, "x-niu-routing-decision-calls").as_deref(),
        Some("0")
    );
    assert_eq!(fixture.requests().len(), 1);
    assert_eq!(fixture.requests()[0]["model"], "fast-upstream");

    // Workspace spending caps apply to the nested decision call too. No
    // upstream request is made for either the decision or the generation.
    let spending = store
        .customer_workspace_spending_limits(scope)
        .await
        .unwrap();
    let committed: i64 = spending[0]["committed_nanos"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap();
    store
        .set_customer_workspace_spending_limit(scope, "USD", committed, 0)
        .await
        .unwrap();
    fixture.reset();
    fixture.set_decision(json!({"path": "deep", "confidence": 0.9}));
    let (status, headers, denied) = send_routed(
        &app,
        &caller.token,
        json!({"model": "pool/assistant", "messages": [{"role": "user", "content": "hi"}]}),
        r#"{"task":"unmatched"}"#,
    )
    .await;
    assert_eq!(status, StatusCode::PAYMENT_REQUIRED, "{denied}");
    assert_eq!(denied["error"]["type"], "workspace_spending_limit_exceeded");
    assert_eq!(
        header(&headers, "x-niu-routing-decision-reason").as_deref(),
        Some("transport")
    );
    assert!(fixture.requests().is_empty());
    task.abort();
}
