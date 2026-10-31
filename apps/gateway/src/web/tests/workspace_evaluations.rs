use super::*;
use axum::body::{Body, to_bytes};
use niu_storage::{
    EvaluationDefinition, EvaluationSample, OperatorAuditActor, OperatorRole, OperatorScope,
    evaluation_request_fingerprint,
};
#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn tagged_inference_binds_effective_input_before_dispatch_and_rejects_mismatch(pool: PgPool) {
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
    let owner = store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: None,
            },
            "Evaluation owner",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let auth = store
        .create_agent_authorization_with_capabilities(
            "Codex",
            &[
                "evaluations:read".into(),
                "evaluations:write".into(),
                "events:write".into(),
            ],
        )
        .await
        .unwrap();
    store
        .approve_agent_authorization(
            &auth.user_code,
            scope,
            owner.operator_id,
            &["fast".into()],
            3600,
        )
        .await
        .unwrap();
    let key = store
        .exchange_agent_authorization(&auth.device_secret)
        .await
        .unwrap()
        .unwrap();
    let principal = store.authenticate(&key.token).await.unwrap();
    let ordinary = store
        .issue_key(scope, "Ordinary", &["fast".into()], 3600)
        .await
        .unwrap();
    let cipher = Arc::new(
        crate::vendors::crypto::CredentialCipher::new(
            "evaluation-event-fixture-encryption-at-least-32-characters",
        )
        .unwrap(),
    );
    let subscription = Uuid::new_v4();
    let secret = "niu_whsec_".to_string() + &"a".repeat(43);
    let encrypted = cipher
        .seal_event_subscription(scope, subscription, &secret)
        .unwrap();
    store
        .set_event_subscription(
            &principal,
            subscription,
            &niu_storage::EventSubscription {
                slug: "evaluation-events".into(),
                name: "Evaluation events".into(),
                endpoint: "https://receiver.example/events".into(),
                event_types: vec!["evaluation.recorded".into()],
                enabled: true,
                revision: 0,
            },
            Some(&encrypted),
        )
        .await
        .unwrap();
    let received = Arc::new(Mutex::new(Vec::<Value>::new()));
    let received_handler = received.clone();
    let event_router = Router::new().route(
        "/events",
        post(move |headers: HeaderMap, body: axum::body::Bytes| {
            let received = received_handler.clone();
            let secret = secret.clone();
            async move {
                use hmac::{Hmac, Mac};
                let (timestamp, digest) = headers["x-niu-signature"]
                    .to_str()
                    .unwrap()
                    .split_once(",v1=")
                    .unwrap();
                let timestamp = timestamp.strip_prefix("t=").unwrap();
                let signature = (0..digest.len())
                    .step_by(2)
                    .map(|index| u8::from_str_radix(&digest[index..index + 2], 16).unwrap())
                    .collect::<Vec<_>>();
                let mut mac = Hmac::<sha2::Sha256>::new_from_slice(secret.as_bytes()).unwrap();
                mac.update(format!("{timestamp}.").as_bytes());
                mac.update(&body);
                mac.verify_slice(&signature).unwrap();
                let event: Value = serde_json::from_slice(&body).unwrap();
                assert_eq!(event["type"], "evaluation.recorded");
                assert_eq!(event["id"], headers["x-niu-event-id"].to_str().unwrap());
                received.lock().unwrap().push(event);
                StatusCode::NO_CONTENT
            }
        }),
    );
    let event_listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let event_address = event_listener.local_addr().unwrap();
    let receiver =
        tokio::spawn(async move { axum::serve(event_listener, event_router).await.unwrap() });
    let viewer = store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(scope.project_id),
            },
            "Evaluation reviewer",
            OperatorRole::Viewer,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let other_workspace = store
        .create_project(scope.organization_id, "Other review workspace")
        .await
        .unwrap();
    let app = router(state);
    for (protocol, path, body) in [
        (
            "chat",
            "/v1/chat/completions",
            json!({"model":"fast","messages":[{"role":"user","content":"sample"}],"max_tokens":16}),
        ),
        (
            "responses",
            "/v1/responses",
            json!({"model":"fast","input":"sample","max_output_tokens":16}),
        ),
        (
            "embeddings",
            "/v1/embeddings",
            json!({"model":"fast","input":"sample","encoding_format":"float"}),
        ),
    ] {
        let digest = evaluation_request_fingerprint(protocol, &body).unwrap();
        let definition = EvaluationDefinition {
            slug: format!("sample-{protocol}"),
            name: format!("Sample {protocol}"),
            task: "Check fixture output".into(),
            rubric: "Output must match the sample requirement".into(),
            protocol: protocol.into(),
            revision: 0,
            samples: vec![EvaluationSample {
                reference: "sample-one".into(),
                request_sha256: digest.clone(),
            }],
        };
        store
            .set_evaluation_definition(&principal, &definition)
            .await
            .unwrap();
        let mut update = serde_json::to_value(&definition).unwrap();
        update["revision"] = json!(1);
        let (status, saved) = api(
            &app,
            "PUT",
            &format!("/v1/evaluations/{}", definition.slug),
            &key.token,
            update.clone(),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{saved}");
        assert_eq!(saved["revision"], 2);
        let (status, _) = api(
            &app,
            "PUT",
            &format!("/v1/evaluations/{}", definition.slug),
            &key.token,
            update,
        )
        .await;
        assert_eq!(status, StatusCode::CONFLICT);
        let (status, discovered) = api(
            &app,
            "GET",
            &format!("/v1/evaluations/{}", definition.slug),
            &ordinary.token,
            Value::Null,
        )
        .await;
        assert_eq!(status, StatusCode::FORBIDDEN, "{discovered}");
        let (status, fingerprint) = api(
            &app,
            "POST",
            "/v1/evaluations/fingerprint",
            &key.token,
            json!({"protocol":protocol,"request":body}),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{fingerprint}");
        assert_eq!(fingerprint["request_sha256"], digest);
        let header = format!("{}@1/sample-one", definition.slug);
        let request = |token: &str, value: Value| {
            Request::post(path)
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .header("x-niu-evaluation", &header)
                .body(Body::from(value.to_string()))
                .unwrap()
        };
        *captured.0.lock().unwrap() = None;
        let denied = app
            .clone()
            .oneshot(request(&ordinary.token, body.clone()))
            .await
            .unwrap();
        assert_eq!(denied.status(), StatusCode::FORBIDDEN);
        assert!(captured.0.lock().unwrap().is_none());
        let mut changed = body.clone();
        if protocol == "chat" {
            changed["messages"][0]["content"] = json!("different sample");
        } else {
            changed["input"] = json!("different sample");
        }
        let denied = app
            .clone()
            .oneshot(request(&key.token, changed))
            .await
            .unwrap();
        assert_eq!(denied.status(), StatusCode::BAD_REQUEST);
        assert!(captured.0.lock().unwrap().is_none());
        let response = app
            .clone()
            .oneshot(request(&key.token, body))
            .await
            .unwrap();
        let status = response.status();
        let headers = response.headers().clone();
        let bytes = to_bytes(response.into_body(), 65536).await.unwrap();
        assert_eq!(
            status,
            StatusCode::OK,
            "{protocol}: {}",
            String::from_utf8_lossy(&bytes)
        );
        let attempt = Uuid::parse_str(headers["x-niu-attempt-id"].to_str().unwrap()).unwrap();
        let evidence = store
            .evaluation_attempt_binding(scope, attempt)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(evidence["request_sha256"], digest);
        assert_eq!(evidence["evaluation_revision"], 1);
        let (status, discovered) = api(
            &app,
            "GET",
            &format!(
                "/v1/evaluations/{}/attempts?revision=1&sample=sample-one",
                definition.slug
            ),
            &key.token,
            Value::Null,
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{discovered}");
        assert_eq!(discovered["data"][0]["attempt_id"], attempt.to_string());
        let run = json!({"slug":"baseline","name":"Baseline","evaluation_revision":1,"evaluator":{"kind":"check","name":"Fixture","version":"1"},"results":[{"sample":"sample-one","attempt_id":attempt,"verdict":"accepted"}]});
        let run_path = format!("/v1/evaluations/{}/runs", definition.slug);
        let (status, receipt) = api(&app, "POST", &run_path, &key.token, run.clone()).await;
        assert_eq!(status, StatusCode::OK, "{receipt}");
        assert_eq!(receipt["summary"]["unknown_charge_attempts"], 1);
        let (status, replay) = api(&app, "POST", &run_path, &key.token, run.clone()).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(replay, receipt);
        let (status, comparison) = api(
            &app,
            "GET",
            &format!(
                "/v1/evaluations/{}/compare?left=baseline&right=baseline",
                definition.slug
            ),
            &key.token,
            Value::Null,
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{comparison}");
        assert_eq!(comparison["shared_operations"], 1);
        let member_path = format!(
            "/api/v1/workspaces/{}/evaluations/{}/runs/baseline",
            scope.project_id, definition.slug
        );
        let (status, reviewed) = api(&app, "GET", &member_path, &viewer.token, Value::Null).await;
        assert_eq!(status, StatusCode::OK, "{reviewed}");
        assert_eq!(reviewed, receipt);
        let (status, _) = api(&app, "GET", &member_path, &key.token, Value::Null).await;
        assert!(matches!(
            status,
            StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN
        ));
        for kind in ["pools", "events", "evaluations"] {
            let (status, rows) = api(
                &app,
                "GET",
                &format!("/api/v1/workspaces/{}/{kind}", scope.project_id),
                &viewer.token,
                Value::Null,
            )
            .await;
            assert_eq!(status, StatusCode::OK, "{rows}");
            let (status, _) = api(
                &app,
                "GET",
                &format!("/api/v1/workspaces/{}/{kind}", other_workspace.project_id),
                &viewer.token,
                Value::Null,
            )
            .await;
            assert_eq!(status, StatusCode::NOT_FOUND);
        }

        crate::resource_events::run_fixture_batch(
            &store,
            &cipher,
            &format!("http://{event_address}/events"),
        )
        .await
        .unwrap();
        let notifications = received.lock().unwrap();
        let event = notifications.last().unwrap();
        assert_eq!(
            event["resource"],
            json!({"kind":"evaluation","slug":definition.slug,"revision":1,"run":"baseline"})
        );
        assert!(event.get("results").is_none());
        drop(notifications);

        assert!(
            !captured
                .0
                .lock()
                .unwrap()
                .as_ref()
                .unwrap()
                .0
                .contains_key("x-niu-evaluation")
        );
    }
    assert_eq!(
        received.lock().unwrap().len(),
        3,
        "identical receipt replay must not create extra deliveries"
    );
    receiver.abort();
    task.abort();
}

async fn api(
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
    assert_eq!(response.headers()["cache-control"], "no-store");
    let status = response.status();
    let bytes = to_bytes(response.into_body(), 65536).await.unwrap();
    (status, serde_json::from_slice(&bytes).unwrap())
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn priced_evaluation_receipt_uses_customer_tariff_and_preserves_settled_snapshot(
    pool: PgPool,
) {
    let captured = Captured::default();
    let upstream = Router::new()
        .route("/v1/chat/completions", post(provider))
        .with_state(captured.clone());
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
    Arc::make_mut(&mut state.config)
        .models
        .get_mut("fast")
        .unwrap()
        .pricing = Some(crate::config::RoutePricing {
        currency: "USD".into(),
        api_prompt_rate: 2_000_000,
        api_completion_rate: 4_000_000,
        cash_prompt_rate: 1_000_000,
        cash_completion_rate: 2_000_000,
        max_input_tokens: 64,
        max_output_tokens: 10,
    });
    let store = state.store.clone();
    let organization = store
        .create_organization("Priced evaluation fixture")
        .await
        .unwrap();
    let scope = store
        .create_project(organization, "Evaluation workspace")
        .await
        .unwrap();
    store.create_budget(scope, "USD", 1000).await.unwrap();
    store
        .publish_customer_tariff(
            scope,
            &niu_storage::ProviderOfferInput {
                model_alias: "fast".into(),
                currency: "USD".into(),
                prompt_rate: "3000000".into(),
                completion_rate: "5000000".into(),
                expected_revision: None,
            },
        )
        .await
        .unwrap();
    let owner = store
        .create_operator(
            OperatorScope {
                organization_id: organization,
                project_id: None,
            },
            "Evaluation owner",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let authorization = store
        .create_agent_authorization_with_capabilities(
            "Codex",
            &["evaluations:read".into(), "evaluations:write".into()],
        )
        .await
        .unwrap();
    store
        .approve_agent_authorization(
            &authorization.user_code,
            scope,
            owner.operator_id,
            &["fast".into()],
            3600,
        )
        .await
        .unwrap();
    let key = store
        .exchange_agent_authorization(&authorization.device_secret)
        .await
        .unwrap()
        .unwrap();
    let principal = store.authenticate(&key.token).await.unwrap();
    let body =
        json!({"model":"fast","messages":[{"role":"user","content":"sample"}],"max_tokens":10});
    let digest = evaluation_request_fingerprint("chat", &body).unwrap();
    store
        .set_evaluation_definition(
            &principal,
            &EvaluationDefinition {
                slug: "priced-task".into(),
                name: "Priced task".into(),
                task: "Return ok".into(),
                rubric: "Output is ok".into(),
                protocol: "chat".into(),
                revision: 0,
                samples: vec![EvaluationSample {
                    reference: "sample-one".into(),
                    request_sha256: digest,
                }],
            },
        )
        .await
        .unwrap();
    let app = router(state);
    let response = app
        .clone()
        .oneshot(
            Request::post("/v1/chat/completions")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .header("x-niu-evaluation", "priced-task@1/sample-one")
                .body(Body::from(body.to_string()))
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
    let attempt = Uuid::parse_str(headers["x-niu-attempt-id"].to_str().unwrap()).unwrap();
    assert!(
        !captured
            .0
            .lock()
            .unwrap()
            .as_ref()
            .unwrap()
            .0
            .contains_key("x-niu-evaluation")
    );
    let input = json!({"slug":"baseline","name":"Baseline","evaluation_revision":1,"evaluator":{"kind":"check","name":"Fixture","version":"1"},"results":[{"sample":"sample-one","attempt_id":attempt,"verdict":"accepted"}]});
    let (status, receipt) = api(
        &app,
        "POST",
        "/v1/evaluations/priced-task/runs",
        &key.token,
        input.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{receipt}");
    assert_eq!(
        receipt["results"][0]["attempts"][0]["customer_charge"]["amount_nanos"],
        "11"
    );
    assert_eq!(receipt["summary"]["unknown_charge_attempts"], 0);
    assert_eq!(
        receipt["summary"]["customer_charge_totals"],
        json!([{"dimension":"money:USD:nanos","amount":"11"}])
    );
    assert_eq!(
        receipt["summary"]["cost_per_accepted"],
        json!({"dimension":"money:USD:nanos","numerator":"11","denominator":1})
    );
    // The procurement amount differs. Never substitute it in customer evidence.
    let procurement: i64 =
        sqlx::query_scalar("SELECT cash_nanos FROM cost_entries WHERE attempt_id=$1")
            .bind(attempt)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(procurement, 4);
    let serialized = receipt.to_string();
    for confidential in [
        "cash_cost_nanos",
        "api_cost_nanos",
        "procurement",
        "platform_margin",
    ] {
        assert!(!serialized.contains(confidential));
    }
    let (status, replay) = api(
        &app,
        "POST",
        "/v1/evaluations/priced-task/runs",
        &key.token,
        input,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(receipt, replay);
    task.abort();
}
