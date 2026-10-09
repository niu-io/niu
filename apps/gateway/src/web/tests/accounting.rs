use super::*;

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn priced_streaming_settles_only_terminal_usage(pool: sqlx::PgPool) {
    for (payload, completed, settled, expected_model) in [
        (
            "data: {\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"stop\"}]}\n\ndata: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"POST_FINISH_OUTPUT\"},\"finish_reason\":null}]}\n\ndata: {\"choices\":[],\"usage\":{\"prompt_tokens\":2,\"completion_tokens\":1,\"prompt_tokens_details\":{\"cached_tokens\":1},\"completion_tokens_details\":{\"reasoning_tokens\":0}}}\n\ndata: [DONE]\n\n",
            true,
            true,
            None,
        ),
        (
            "data: {\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"length\"}]}\n\ndata: {\"choices\":[],\"usage\":{\"prompt_tokens\":2,\"completion_tokens\":1,\"prompt_tokens_details\":{\"cached_tokens\":1},\"completion_tokens_details\":{\"reasoning_tokens\":0}}}\n\ndata: [DONE]\n\n",
            true,
            true,
            None,
        ),
        (
            "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":2,\"completion_tokens\":1,\"prompt_tokens_details\":{\"cached_tokens\":1},\"completion_tokens_details\":{\"reasoning_tokens\":0},\"cost_details\":{\"upstream_inference_cost\":0.3}}}\n\r\ndata: [DONE]\r\r",
            true,
            true,
            None,
        ),
        (
            "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":2,\"completion_tokens\":1,\"prompt_tokens_details\":{\"cached_tokens\":1},\"completion_tokens_details\":{\"reasoning_tokens\":0}}}\n\ndata: [DONE]\n\n",
            true,
            true,
            None,
        ),
        (
            "data: {\"choices\":[]}\n\ndata: [DONE]\n\n",
            true,
            false,
            None,
        ),
        (
            "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":2,\"completion_tokens\":1,\"total_tokens\":4,\"prompt_tokens_details\":{\"cached_tokens\":1},\"completion_tokens_details\":{\"reasoning_tokens\":0}}}\n\ndata: [DONE]\n\n",
            true,
            false,
            None,
        ),
        (
            "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":2,\"completion_tokens\":1,\"prompt_tokens_details\":{\"cached_tokens\":1},\"completion_tokens_details\":{\"reasoning_tokens\":0}}}\n\n",
            false,
            false,
            None,
        ),
        (
            "data: {\"model\":\"provider-model-a\",\"choices\":[]}\n\ndata: {\"choices\":[],\"usage\":{\"prompt_tokens\":2,\"completion_tokens\":1,\"prompt_tokens_details\":{\"cached_tokens\":1},\"completion_tokens_details\":{\"reasoning_tokens\":0}}}\n\ndata: [DONE]\n\n",
            true,
            true,
            Some("provider-model-a"),
        ),
        (
            "data: {\"model\":\"provider-model-a\",\"choices\":[]}\n\ndata: {\"choices\":[],\"usage\":{\"prompt_tokens\":2,\"completion_tokens\":1,\"prompt_tokens_details\":{\"cached_tokens\":1},\"completion_tokens_details\":{\"reasoning_tokens\":0}}}\n\ndata: {\"model\":null,\"choices\":[]}\n\ndata: [DONE]\n\n",
            true,
            true,
            None,
        ),
        (
            "\u{feff}data: {\"choices\":[],\"usage\":{\"prompt_tokens\":2,\"completion_tokens\":1,\"prompt_tokens_details\":{\"cached_tokens\":1},\"completion_tokens_details\":{\"reasoning_tokens\":0},\"cost_details\":{\"upstream_inference_cost\":0.3},\"cost\":0.3}}\n\ndata: [DONE]\n\n",
            true,
            true,
            None,
        ),
        (
            "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":2,\"completion_tokens\":1,\"prompt_tokens_details\":{\"cached_tokens\":1},\"completion_tokens_details\":{\"reasoning_tokens\":0},\"cost_details\":{\"upstream_inference_cost\":0.3},\"cost\":0.3}}\n\ndata: [DONE]\n\ndata: {\"choices\":[{\"delta\":{\"content\":\"LATE_TRAILER\"}}],\"usage\":{\"prompt_tokens\":999,\"completion_tokens\":999}}\n\n",
            true,
            true,
            None,
        ),
    ] {
        let captured = Captured::default();
        let observed = captured.clone();
        let upstream = Router::new().route(
            "/v1/chat/completions",
            post(move |headers: HeaderMap, Json(body): Json<Value>| {
                let observed = observed.clone();
                async move {
                    *observed.0.lock().unwrap() = Some((headers, body));
                    ([("content-type", "text/event-stream")], payload)
                }
            }),
        );
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let task = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
        let mut state = test_state(Some(format!("http://{address}/v1")), pool.clone());
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
            max_input_tokens: 10,
            max_output_tokens: 10,
        });
        let org = state
            .store
            .create_organization("stream-costs")
            .await
            .unwrap();
        let scope = state
            .store
            .create_project(org, "stream-costs")
            .await
            .unwrap();
        state.store.create_budget(scope, "USD", 30).await.unwrap();
        let key = state
            .store
            .issue_key(scope, "client", &["fast".into()], 3600)
            .await
            .unwrap();
        let response = router(state.clone()).oneshot(Request::post("/v1/chat/completions")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(json!({"model":"fast","messages":[{"role":"user","content":"hi"}],"stream":true}).to_string())).unwrap()).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let id: uuid::Uuid = response.headers()["x-niu-attempt-id"]
            .to_str()
            .unwrap()
            .parse()
            .unwrap();
        let body = response.into_body().collect().await;
        assert_eq!(body.is_ok(), completed);
        if let Ok(body) = body {
            let delivered = String::from_utf8(body.to_bytes().to_vec()).unwrap();
            assert!(!delivered.contains("upstream_inference_cost"));
            assert!(!delivered.contains("cost_details"));
            assert!(!delivered.contains("LATE_TRAILER"));
            assert!(delivered.contains("data: [DONE]"));
        }
        assert_eq!(
            captured.0.lock().unwrap().as_ref().unwrap().1["stream_options"]["include_usage"],
            true
        );
        state.store.recover_settlements(None).await.unwrap();
        let budget = state.store.budget(scope).await.unwrap().unwrap();
        assert_eq!(
            (budget.spent_nanos, budget.reserved_nanos),
            if settled { (4, 0) } else { (0, 30) }
        );
        assert_eq!(
            state
                .store
                .cost_entries(scope, None, 100)
                .await
                .unwrap()
                .len(),
            usize::from(settled)
        );
        let attempt = state.store.attempt(scope, id).await.unwrap().unwrap();
        assert_eq!(attempt.provider_model.as_deref(), expected_model);
        assert_eq!(
            state.store.request_finish_reasons(scope, id).await.unwrap(),
            if payload.contains("finish_reason") && !payload.contains("POST_FINISH_OUTPUT") {
                Some(vec![niu_storage::RequestChoiceFinish {
                    index: 0,
                    reason: niu_storage::RequestFinishReason::Length,
                }])
            } else {
                None
            }
        );
        assert_eq!(
            attempt.execution,
            if completed {
                "confirmed_completed"
            } else {
                "may_have_executed"
            }
        );
        let categories: Option<(Option<i64>, Option<i64>)> = sqlx::query_as("SELECT cached_input_tokens,reasoning_output_tokens FROM request_token_categories WHERE attempt_id=$1")
            .bind(id).fetch_optional(&pool).await.unwrap();
        assert_eq!(
            categories,
            if settled {
                Some((Some(1), Some(0)))
            } else {
                None
            }
        );
        task.abort();
    }
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn priced_inference_reserves_settles_and_blocks_exhaustion(pool: sqlx::PgPool) {
    let captured = Captured::default();
    let upstream = Router::new()
        .route("/v1/chat/completions", post(provider))
        .with_state(captured.clone());
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let task = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
    let mut state = test_state(Some(format!("http://{address}/v1")), pool);
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
        max_input_tokens: 10,
        max_output_tokens: 10,
    });
    let org = state.store.create_organization("priced").await.unwrap();
    let scope = state.store.create_project(org, "priced").await.unwrap();
    state.store.create_budget(scope, "USD", 34).await.unwrap();
    let key = state
        .store
        .issue_key(scope, "all models client", &["*".into()], 3600)
        .await
        .unwrap();
    let access_policy = json!({"schema_version":1,"name":"Priced access fixture","models":{"mode":"allow_all"},"providers":{"mode":"inherit"}});
    state
        .store
        .activate_workspace_guardrail(scope, 0, &access_policy)
        .await
        .unwrap();
    state
        .store
        .assign_key_guardrail(scope, key.id, 1, 0)
        .await
        .unwrap();
    let app = router(state.clone());
    for (body, expected) in [
        (
            json!({"model":"fast","messages":[{"role":"user","content":"hi"}],"n":2}),
            StatusCode::BAD_REQUEST,
        ),
        (
            json!({"model":"fast","messages":[{"role":"user","content":"hi"}],"max_completion_tokens":11}),
            StatusCode::BAD_REQUEST,
        ),
        (
            json!({"model":"fast","messages":[{"role":"user","content":"hi"}]}),
            StatusCode::OK,
        ),
        (
            json!({"model":"fast","messages":[{"role":"user","content":"hi"}]}),
            StatusCode::OK,
        ),
        (
            json!({"model":"fast","messages":[{"role":"user","content":"hi"}]}),
            StatusCode::PAYMENT_REQUIRED,
        ),
    ] {
        *captured.0.lock().unwrap() = None;
        let response = app
            .clone()
            .oneshot(
                Request::post("/v1/chat/completions")
                    .header("authorization", format!("Bearer {}", key.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
        if expected == StatusCode::OK {
            let attempt: uuid::Uuid = response.headers()["x-niu-attempt-id"]
                .to_str()
                .unwrap()
                .parse()
                .unwrap();
            let attribution = state
                .store
                .dispatch_guardrail_decision(scope, attempt)
                .await
                .unwrap()
                .unwrap();
            assert_eq!(attribution["outcome"], "allowed");
            assert_eq!(attribution["coverage"], "model_provider_access");
            assert_eq!(attribution["workspace_revision"], 1);
            assert_eq!(attribution["key_policy_revision"], 1);
            assert_eq!(attribution["key_assignment_revision"], 1);
            assert_eq!(
                attribution["workspace_policy_name"],
                "Priced access fixture"
            );
            assert_eq!(
                state
                    .store
                    .attempt(scope, attempt)
                    .await
                    .unwrap()
                    .unwrap()
                    .settlement,
                "settled"
            );
            assert_eq!(
                captured.0.lock().unwrap().as_ref().unwrap().1["max_completion_tokens"],
                10
            );
        } else {
            assert!(captured.0.lock().unwrap().is_none());
        }
    }
    let budget = state.store.budget(scope).await.unwrap().unwrap();
    assert_eq!((budget.spent_nanos, budget.reserved_nanos), (8, 0));
    let entries = state.store.cost_entries(scope, None, 100).await.unwrap();
    assert_eq!(entries.len(), 2);
    assert_eq!(entries[0].price_revision_id, entries[1].price_revision_id);
    for entry in entries {
        assert_eq!((entry.cash_nanos, entry.api_equivalent_nanos), (4, 8));
    }
    task.abort();
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn missing_usage_and_provider_failures_remain_unsettled(pool: sqlx::PgPool) {
    for (status, payload, expected_status, execution, settlement) in [
        (
            StatusCode::OK,
            json!({"choices": []}),
            StatusCode::OK,
            "confirmed_completed",
            "reconciliation_required",
        ),
        (
            StatusCode::OK,
            json!({"unexpected": true}),
            StatusCode::BAD_GATEWAY,
            "may_have_executed",
            "unresolved",
        ),
        (
            StatusCode::BAD_GATEWAY,
            json!({"error": "failed"}),
            StatusCode::BAD_GATEWAY,
            "may_have_executed",
            "unresolved",
        ),
    ] {
        let upstream = Router::new().route(
            "/v1/chat/completions",
            post(move || {
                let payload = payload.clone();
                async move { (status, Json(payload)) }
            }),
        );
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let task = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
        let state = test_state(Some(format!("http://{address}/v1")), pool.clone());
        let org = state
            .store
            .create_organization("failure-test")
            .await
            .unwrap();
        let scope = state.store.create_project(org, "app").await.unwrap();
        let key = state
            .store
            .issue_key(scope, "client", &["fast".into()], 3600)
            .await
            .unwrap();
        let response = router(state.clone()).oneshot(Request::post("/v1/chat/completions")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(json!({"model": "fast", "messages": [{"role": "user", "content": "hello"}]}).to_string())).unwrap()).await.unwrap();
        assert_eq!(response.status(), expected_status);
        let id = response.headers()["x-niu-attempt-id"]
            .to_str()
            .unwrap()
            .parse()
            .unwrap();
        let evidence = state.store.attempt(scope, id).await.unwrap().unwrap();
        assert_eq!(evidence.execution, execution);
        assert_eq!(evidence.settlement, settlement);
        assert_eq!(evidence.usage_confidence, "unknown");
        assert_eq!(evidence.prompt_tokens, None);
        task.abort();
    }
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn streaming_persists_terminal_evidence_and_keeps_interruptions_unknown(pool: sqlx::PgPool) {
    for (wire, complete, usage) in [
        (
            "data: {\"choices\":[]}\r\n\r\ndata: {\"usage\":{\"prompt_tokens\":9,\"completion_tokens\":4}}\r\n\r\ndata: [DONE]\r\n\r\n",
            true,
            Some((9, 4)),
        ),
        ("data: {\"choices\":[]}\n\ndata: [DONE]\n\n", true, None),
        ("data: {\"choices\":[]}\n\n", false, None),
        (
            "data: {\"error\":{\"message\":\"failed\"}}\n\n",
            false,
            None,
        ),
    ] {
        let upstream = Router::new().route(
            "/v1/chat/completions",
            post(move || async move {
                let chunks: Vec<_> = wire
                    .as_bytes()
                    .chunks(3)
                    .map(|chunk| {
                        Ok::<_, std::convert::Infallible>(axum::body::Bytes::copy_from_slice(chunk))
                    })
                    .collect();
                (
                    [("content-type", "text/event-stream")],
                    axum::body::Body::from_stream(futures_util::stream::iter(chunks)),
                )
            }),
        );
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
        let state = test_state(Some(format!("http://{address}/v1")), pool.clone());
        let org = state.store.create_organization("streaming").await.unwrap();
        let scope = state.store.create_project(org, "project").await.unwrap();
        let key = state
            .store
            .issue_key(scope, "key", &["fast".into()], 3600)
            .await
            .unwrap();
        let app = router(state.clone());
        let request = || {
            Request::post("/v1/chat/completions").header("authorization", format!("Bearer {}", key.token)).header("content-type", "application/json")
                .body(axum::body::Body::from(json!({"model":"fast", "stream":true, "messages":[{"role":"user","content":"hello"}]}).to_string())).unwrap()
        };
        let response = app.clone().oneshot(request()).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let id = response.headers()["x-niu-attempt-id"]
            .to_str()
            .unwrap()
            .parse()
            .unwrap();
        let collected = response.into_body().collect().await;
        assert_eq!(collected.is_ok(), complete);
        if complete {
            assert_eq!(collected.unwrap().to_bytes().as_ref(), wire.as_bytes());
        }
        let attempt = state.store.attempt(scope, id).await.unwrap().unwrap();
        assert_eq!(
            attempt.execution,
            if complete {
                "confirmed_completed"
            } else {
                "may_have_executed"
            }
        );
        assert_eq!(attempt.prompt_tokens, usage.map(|(p, _)| p));
        assert_eq!(attempt.completion_tokens, usage.map(|(_, c)| c));
        assert_eq!(
            state.usage.snapshot().attempts_provider_reported,
            u64::from(usage.is_some())
        );
        // A client that drops before polling receives no completion guarantee.
        let cancelled = app.oneshot(request()).await.unwrap();
        let id = cancelled.headers()["x-niu-attempt-id"]
            .to_str()
            .unwrap()
            .parse()
            .unwrap();
        drop(cancelled);
        assert_eq!(
            state
                .store
                .attempt(scope, id)
                .await
                .unwrap()
                .unwrap()
                .execution,
            "may_have_executed"
        );
        server.abort();
    }
}

#[derive(Clone, Default)]
struct DeadlineHits(std::sync::Arc<std::sync::atomic::AtomicUsize>);

async fn delayed_json_provider(
    State(hits): State<DeadlineHits>,
    Json(_body): Json<Value>,
) -> Json<Value> {
    hits.0.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
    Json(json!({"ok":true}))
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn inference_deadline_matrix_covers_chat_responses_and_embeddings(pool: sqlx::PgPool) {
    let hits = DeadlineHits::default();
    let upstream = Router::new()
        .route("/v1/chat/completions", post(delayed_json_provider))
        .route("/v1/responses", post(delayed_json_provider))
        .route("/v1/embeddings", post(delayed_json_provider))
        .with_state(hits.clone());
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });

    let mut state = test_state(Some(format!("http://{address}/v1")), pool);
    let config = Arc::make_mut(&mut state.config);
    config.server.request_timeout_seconds = 1;
    config.models.get_mut("fast").unwrap().supports_responses = true;
    let organization = state
        .store
        .create_organization("deadline matrix")
        .await
        .unwrap();
    let scope = state
        .store
        .create_project(organization, "deadline matrix")
        .await
        .unwrap();
    let key = state
        .store
        .issue_key(scope, "deadline test", &["fast".into()], 3600)
        .await
        .unwrap();
    let app = router(state.clone());
    let request = |path: &str, body: Value| {
        Request::post(path)
            .header("authorization", format!("Bearer {}", key.token))
            .header("content-type", "application/json")
            .body(axum::body::Body::from(body.to_string()))
            .unwrap()
    };

    let (chat, responses, embeddings) = tokio::join!(
        app.clone().oneshot(request(
            "/v1/chat/completions",
            json!({"model":"fast","messages":[{"role":"user","content":"hello"}]}),
        )),
        app.clone().oneshot(request(
            "/v1/responses",
            json!({"model":"fast","input":"hello"}),
        )),
        app.oneshot(request(
            "/v1/embeddings",
            json!({"model":"fast","input":"hello"}),
        )),
    );

    for response in [chat.unwrap(), responses.unwrap(), embeddings.unwrap()] {
        assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
        let attempt_id = response.headers()["x-niu-attempt-id"]
            .to_str()
            .unwrap()
            .parse()
            .unwrap();
        let attempt = state
            .store
            .attempt(scope, attempt_id)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(attempt.execution, "may_have_executed");
        assert_eq!(attempt.usage_confidence, "unknown");
        assert_eq!(attempt.prompt_tokens, None);
        assert_eq!(attempt.completion_tokens, None);
    }
    assert_eq!(hits.0.load(std::sync::atomic::Ordering::Relaxed), 3);
    server.abort();
}

async fn delayed_sse_provider() -> axum::response::Response {
    let body = futures_util::stream::once(async {
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        Ok::<_, std::convert::Infallible>(axum::body::Bytes::from_static(
            b"data: {\"choices\":[]}\n\ndata: [DONE]\n\n",
        ))
    });
    axum::response::Response::builder()
        .header("content-type", "text/event-stream")
        .body(axum::body::Body::from_stream(body))
        .unwrap()
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn streaming_deadline_covers_the_upstream_body_after_headers(pool: sqlx::PgPool) {
    let upstream = Router::new().route("/v1/chat/completions", post(delayed_sse_provider));
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });

    let mut state = test_state(Some(format!("http://{address}/v1")), pool);
    Arc::make_mut(&mut state.config)
        .server
        .request_timeout_seconds = 1;
    let organization = state
        .store
        .create_organization("stream deadline")
        .await
        .unwrap();
    let scope = state
        .store
        .create_project(organization, "stream deadline")
        .await
        .unwrap();
    let key = state
        .store
        .issue_key(scope, "deadline test", &["fast".into()], 3600)
        .await
        .unwrap();
    let response = router(state.clone())
        .oneshot(
            Request::post("/v1/chat/completions")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({"model":"fast","stream":true,"messages":[{"role":"user","content":"hello"}]}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let attempt_id = response.headers()["x-niu-attempt-id"]
        .to_str()
        .unwrap()
        .parse()
        .unwrap();
    let body_result = tokio::time::timeout(
        std::time::Duration::from_secs(3),
        response.into_body().collect(),
    )
    .await
    .expect("the upstream stream deadline should terminate the body");
    assert!(
        body_result.is_err(),
        "a body arriving after the request deadline must not complete the stream"
    );
    let attempt = state
        .store
        .attempt(scope, attempt_id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(attempt.execution, "may_have_executed");
    assert_eq!(attempt.usage_confidence, "unknown");
    server.abort();
}

async fn endless_sse_provider(
    State(produced): State<std::sync::Arc<std::sync::atomic::AtomicUsize>>,
) -> axum::response::Response {
    let event = json!({"choices":[{"index":0,"delta":{"content":"x"},"finish_reason":null}]});
    let chunk = (0..600)
        .map(|_| format!("data: {event}\n\n"))
        .collect::<String>();
    assert!(chunk.len() < 65_536);
    let chunk = axum::body::Bytes::from(chunk);
    let stream = futures_util::stream::unfold((produced, chunk), |(produced, chunk)| async move {
        produced.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        Some((
            Ok::<_, std::convert::Infallible>(chunk.clone()),
            (produced, chunk),
        ))
    });
    axum::response::Response::builder()
        .header("content-type", "text/event-stream")
        .body(axum::body::Body::from_stream(stream))
        .unwrap()
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn streaming_body_applies_backpressure_and_keeps_dropped_attempt_unknown(pool: sqlx::PgPool) {
    let produced = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let upstream = Router::new()
        .route("/v1/chat/completions", post(endless_sse_provider))
        .with_state(produced.clone());
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });

    let state = test_state(Some(format!("http://{address}/v1")), pool);
    let organization = state
        .store
        .create_organization("stream backpressure")
        .await
        .unwrap();
    let scope = state
        .store
        .create_project(organization, "stream backpressure")
        .await
        .unwrap();
    let key = state
        .store
        .issue_key(scope, "slow client", &["fast".into()], 3600)
        .await
        .unwrap();
    let response = router(state.clone())
        .oneshot(
            Request::post("/v1/chat/completions")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({"model":"fast","stream":true,"messages":[{"role":"user","content":"hello"}]}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let attempt_id = response.headers()["x-niu-attempt-id"]
        .to_str()
        .unwrap()
        .parse()
        .unwrap();

    // Hold the downstream body unpolled. The upstream stream must not be
    // drained without downstream demand, even while the provider is ready.
    tokio::time::sleep(std::time::Duration::from_millis(150)).await;
    assert!(
        produced.load(std::sync::atomic::Ordering::Relaxed) < 256,
        "upstream read-ahead exceeded the bounded backpressure window"
    );
    let mut body = response.into_body();
    let frame = tokio::time::timeout(std::time::Duration::from_secs(3), body.frame())
        .await
        .expect("a ready provider chunk should reach the client")
        .expect("the provider stream should remain open")
        .expect("the provider chunk should be valid");
    assert!(frame.is_data());
    assert!(!frame.into_data().unwrap().is_empty());
    drop(body);

    let attempt = state
        .store
        .attempt(scope, attempt_id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(attempt.execution, "may_have_executed");
    assert_eq!(attempt.usage_confidence, "unknown");
    server.abort();
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn buffered_output_withholds_content_but_preserves_incurred_charges(pool: sqlx::PgPool) {
    let calls = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let observed = calls.clone();
    let upstream = Router::new().route("/v1/{*protocol}", post(move |axum::extract::Path(protocol): axum::extract::Path<String>, Json(body): Json<Value>| {
        let observed = observed.clone();
        async move {
            observed.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            let mode = body.pointer("/messages/0/content").and_then(Value::as_str).unwrap_or("");
            if mode == "big" || mode == "opaque" {
                let text = if mode == "big" { "private-output-fixture".repeat(60_000) } else { "ordinary".to_owned() };
                let mut response = json!({"id":"chat-fixture","object":"chat.completion","model":"provider-model","choices":[{"index":0,"message":{"role":"assistant","content":text},"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"completion_tokens":1,"total_tokens":3,"prompt_tokens_details":{"cached_tokens":1},"completion_tokens_details":{"reasoning_tokens":1}}});
                if mode == "opaque" {response["unknown_output"] = json!("private-output-fixture");}
                return Json(response);
            }
            if protocol == "responses" {
                Json(json!({"id":"response-fixture","object":"response","status":"completed","model":"provider-model","created_at":1,"completed_at":2,"error":null,"incomplete_details":null,"instructions":"private-output-fixture","metadata":{"note":"private-output-fixture"},"parallel_tool_calls":false,"tools":[],"tool_choice":"auto","reasoning":{"effort":"low","summary":null},"text":{"format":{"type":"text"}},"store":false,"output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"private-output-fixture","annotations":[]}]}],"usage":{"input_tokens":2,"output_tokens":1,"input_tokens_details":{"cached_tokens":1},"output_tokens_details":{"reasoning_tokens":1}}}))
            } else {
                Json(json!({"id":"chat-fixture","object":"chat.completion","model":"provider-model","choices":[{"index":0,"message":{"role":"assistant","content":"private-output-fixture"},"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"completion_tokens":1,"total_tokens":3,"prompt_tokens_details":{"cached_tokens":1},"completion_tokens_details":{"reasoning_tokens":1}}}))
            }
        }
    }));
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
    let mut state = test_state(Some(format!("http://{address}/v1")), pool.clone());
    let model = Arc::make_mut(&mut state.config)
        .models
        .get_mut("fast")
        .unwrap();
    model.supports_responses = true;
    model.pricing = Some(crate::config::RoutePricing {
        currency: "USD".into(),
        api_prompt_rate: 2_000_000,
        api_completion_rate: 4_000_000,
        cash_prompt_rate: 1_000_000,
        cash_completion_rate: 2_000_000,
        max_input_tokens: 10,
        max_output_tokens: 10,
    });
    let scope = state.store.default_workspace().await.unwrap();
    state.store.create_budget(scope, "USD", 100).await.unwrap();
    state
        .store
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
    let key = state
        .store
        .issue_key(
            scope,
            "Output customer",
            &["fast".into(), "unpriced".into()],
            3600,
        )
        .await
        .unwrap();
    let app = router(state.clone());
    let policy = |action: &str| json!({"schema_version":1,"name":"Output protection","models":{"mode":"inherit"},"providers":{"mode":"inherit"},"output":{"mode":"buffered_full","rules":[{"pattern":"private-output-fixture","action":action}]}});
    state
        .store
        .activate_workspace_guardrail(scope, 0, &policy("block"))
        .await
        .unwrap();
    for body in [
        json!({"model":"fast","stream":true,"messages":[{"role":"user","content":"hi"}]}),
        json!({"model":"fast","tools":[],"messages":[{"role":"user","content":"hi"}]}),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::post("/v1/chat/completions")
                    .header("authorization", format!("Bearer {}", key.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }
    let response=app.clone().oneshot(Request::post("/v1/chat/completions").header("authorization",format!("Bearer {}",key.token)).header("content-type","application/json").body(axum::body::Body::from(json!({"model":"fast","messages":[{"role":"user","content":"hi"}],"response_format":{"type":"json_object"}}).to_string())).unwrap()).await.unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 0);
    for (revision, action, status, outcome) in [
        (1, "block", StatusCode::FORBIDDEN, "blocked"),
        (2, "redact", StatusCode::OK, "redacted"),
    ] {
        if revision == 2 {
            state
                .store
                .activate_workspace_guardrail(scope, 1, &policy(action))
                .await
                .unwrap();
        }
        for (path, body) in [
            (
                "/v1/chat/completions",
                json!({"model":"fast","messages":[{"role":"user","content":"hi"}]}),
            ),
            ("/v1/responses", json!({"model":"fast","input":"hi"})),
        ] {
            let response = app
                .clone()
                .oneshot(
                    Request::post(path)
                        .header("authorization", format!("Bearer {}", key.token))
                        .header("content-type", "application/json")
                        .body(axum::body::Body::from(body.to_string()))
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), status);
            let attempt: uuid::Uuid = response.headers()["x-niu-attempt-id"]
                .to_str()
                .unwrap()
                .parse()
                .unwrap();
            let bytes = response.into_body().collect().await.unwrap().to_bytes();
            let text = String::from_utf8_lossy(&bytes);
            assert!(!text.contains("private-output-fixture"));
            if outcome == "redacted" {
                assert!(text.contains("[REDACTED]"));
            }
            let decision = state
                .store
                .dispatch_guardrail_decision(scope, attempt)
                .await
                .unwrap()
                .unwrap();
            assert_eq!(decision["output_inspection"]["outcome"], outcome);
            assert_eq!(decision["output_inspection"]["mode"], "buffered_full");
            assert!(!decision.to_string().contains("private-output-fixture"));
            assert_eq!(decision["workspace_revision"], revision);
            let stored = state.store.attempt(scope, attempt).await.unwrap().unwrap();
            assert_eq!(stored.execution, "confirmed_completed");
            assert_eq!(
                (stored.prompt_tokens, stored.completion_tokens),
                (Some(2), Some(1))
            );
        }
    }
    for (prompt, reason) in [("big", "resource_limit"), ("opaque", "unsupported_content")] {
        let response = app
            .clone()
            .oneshot(
                Request::post("/v1/chat/completions")
                    .header("authorization", format!("Bearer {}", key.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(
                        json!({"model":"fast","messages":[{"role":"user","content":prompt}]})
                            .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
        let attempt = response.headers()["x-niu-attempt-id"]
            .to_str()
            .unwrap()
            .parse()
            .unwrap();
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        assert!(!String::from_utf8_lossy(&bytes).contains("private-output-fixture"));
        let decision = state
            .store
            .dispatch_guardrail_decision(scope, attempt)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(decision["output_inspection"]["outcome"], "indeterminate");
        assert_eq!(decision["output_inspection"]["reason"], reason);
        assert!(!decision.to_string().contains("private-output-fixture"));
        let stored = state.store.attempt(scope, attempt).await.unwrap().unwrap();
        assert_eq!(stored.execution, "confirmed_completed");
        assert_eq!(
            (stored.prompt_tokens, stored.completion_tokens),
            (Some(2), Some(1))
        );
    }
    assert_eq!(
        calls.load(std::sync::atomic::Ordering::SeqCst),
        6,
        "no output-denial retry or fallback"
    );
    let entries = state.store.cost_entries(scope, None, 100).await.unwrap();
    assert_eq!(entries.len(), 6);
    assert!(
        entries
            .iter()
            .all(|entry| entry.cash_nanos == 4 && entry.api_equivalent_nanos == 8)
    );
    let charges: Vec<i64> = sqlx::query_scalar("SELECT amount_nanos FROM customer_charges")
        .fetch_all(&pool)
        .await
        .unwrap();
    assert_eq!(
        charges,
        vec![11; 6],
        "customer charges remain separate from procurement costs"
    );
    let details: Vec<(Option<i64>, Option<i64>)> = sqlx::query_as(
        "SELECT cached_input_tokens,reasoning_output_tokens FROM request_token_categories",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(
        details.len(),
        6,
        "Reported Chat and Responses categories survive withholding"
    );
    assert!(details.iter().all(|row| *row == (Some(1), Some(1))));
    let budget = state.store.budget(scope).await.unwrap().unwrap();
    assert_eq!((budget.spent_nanos, budget.reserved_nanos), (24, 0));
    tokio::time::timeout(std::time::Duration::from_secs(2), async {
        loop {
            let payloads: Vec<String> =
                sqlx::query_scalar("SELECT response_body FROM request_payloads")
                    .fetch_all(&pool)
                    .await
                    .unwrap();
            if payloads.len() == 6 {
                assert!(
                    payloads
                        .iter()
                        .all(|text| !text.contains("private-output-fixture"))
                );
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    assert!(
        sqlx::query("DELETE FROM output_guardrail_decisions")
            .execute(&pool)
            .await
            .is_err()
    );
    // Optional workspace redaction must not conceal text from the pinned key block.
    state
        .store
        .assign_key_guardrail(scope, key.id, 1, 0)
        .await
        .unwrap();
    let response = app
        .clone()
        .oneshot(
            Request::post("/v1/chat/completions")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({"model":"fast","messages":[{"role":"user","content":"hi"}]}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    let attempt = response.headers()["x-niu-attempt-id"]
        .to_str()
        .unwrap()
        .parse()
        .unwrap();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    assert!(!String::from_utf8_lossy(&bytes).contains("private-output-fixture"));
    let decision = state
        .store
        .dispatch_guardrail_decision(scope, attempt)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(decision["workspace_revision"], 2);
    assert_eq!(decision["key_policy_revision"], 1);
    assert_eq!(decision["output_inspection"]["outcome"], "blocked");
    state
        .store
        .clear_key_guardrail_as(scope, key.id, 1, "fixture")
        .await
        .unwrap();

    // The unpriced admission path retains content protection and independent retail billing.
    Arc::make_mut(&mut state.config)
        .models
        .get_mut("fast")
        .unwrap()
        .pricing = None;
    let unpriced_app = router(state.clone());
    let response = unpriced_app
        .oneshot(
            Request::post("/v1/chat/completions")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({"model":"fast","messages":[{"role":"user","content":"hi"}]}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(
        response.status(),
        StatusCode::CONFLICT,
        "a workspace with a budget cannot dispatch without a bounded reservation"
    );
    let mut unpriced_model = state.config.models["fast"].clone();
    unpriced_model.pricing = None;
    Arc::make_mut(&mut state.config)
        .models
        .insert("unpriced".into(), unpriced_model);
    let unpriced_scope = state
        .store
        .create_project(scope.organization_id, "Unpriced output fixture")
        .await
        .unwrap();
    let unpriced_key = state
        .store
        .issue_key(
            unpriced_scope,
            "Unpriced output customer",
            &["unpriced".into()],
            3600,
        )
        .await
        .unwrap();
    state
        .store
        .activate_workspace_guardrail(unpriced_scope, 0, &policy("redact"))
        .await
        .unwrap();
    state
        .store
        .publish_customer_tariff(
            unpriced_scope,
            &niu_storage::ProviderOfferInput {
                model_alias: "unpriced".into(),
                currency: "USD".into(),
                prompt_rate: "3000000".into(),
                completion_rate: "5000000".into(),
                expected_revision: None,
            },
        )
        .await
        .unwrap();
    let response = router(state.clone())
        .oneshot(
            Request::post("/v1/chat/completions")
                .header("authorization", format!("Bearer {}", unpriced_key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({"model":"unpriced","messages":[{"role":"user","content":"hi"}]})
                        .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let attempt = response.headers()["x-niu-attempt-id"]
        .to_str()
        .unwrap()
        .parse()
        .unwrap();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let text = String::from_utf8_lossy(&bytes);
    assert!(text.contains("[REDACTED]"));
    assert!(!text.contains("private-output-fixture"));
    let decision = state
        .store
        .dispatch_guardrail_decision(unpriced_scope, attempt)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(decision["output_inspection"]["outcome"], "redacted");
    assert!(decision["key_policy_revision"].is_null());
    assert_eq!(
        state
            .store
            .cost_entries(scope, None, 100)
            .await
            .unwrap()
            .len(),
        7
    );
    let charges: Vec<i64> = sqlx::query_scalar("SELECT amount_nanos FROM customer_charges")
        .fetch_all(&pool)
        .await
        .unwrap();
    assert_eq!(charges, vec![11; 8]);
    let budget = state.store.budget(scope).await.unwrap().unwrap();
    assert_eq!((budget.spent_nanos, budget.reserved_nanos), (28, 0));
    assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 8);
    let withheld_filter = niu_storage::GatewayActivityFilter {
        execution: Some("output_withheld".into()),
        ..Default::default()
    };
    let page = state
        .store
        .gateway_activity(scope, None, 1, &withheld_filter)
        .await
        .unwrap();
    assert_eq!(page.len(), 1);
    assert!(matches!(
        page[0].output_guardrail_outcome.as_deref(),
        Some("blocked" | "indeterminate")
    ));
    assert_eq!(page[0].execution, "confirmed_completed");
    assert_eq!(page[0].customer_charge_nanos.as_deref(), Some("11"));
    let older = state
        .store
        .gateway_activity(scope, Some(page[0].attempt_id), 100, &withheld_filter)
        .await
        .unwrap();
    assert_eq!(older.len(), 4);
    let totals = state
        .store
        .gateway_activity_summary(scope, &withheld_filter)
        .await
        .unwrap();
    assert_eq!((totals.request_count, totals.usage_count), (5, 5));
    assert_eq!(totals.prompt_tokens, "10");
    assert_eq!(totals.completion_tokens, "5");
    assert_eq!(totals.customer_charges[0].amount_nanos, "55");
    assert_eq!(totals.customer_charges[0].charged_requests, 5);
    assert_eq!(totals.usage_by_model[0].request_count, 5);
    assert_eq!(totals.usage_by_key[0].request_count, 5);
    let isolated = state
        .store
        .gateway_activity_summary(unpriced_scope, &withheld_filter)
        .await
        .unwrap();
    assert_eq!(
        isolated.request_count, 0,
        "another workspace's withheld output must not enter this scope"
    );
    let entries = state
        .store
        .gateway_activity(unpriced_scope, None, 100, &Default::default())
        .await
        .unwrap();
    assert_eq!(
        entries[0].output_guardrail_outcome.as_deref(),
        Some("redacted")
    );
    let response = router(state.clone())
        .oneshot(
            Request::get(format!(
                "/admin/v1/organizations/{}/projects/{}/requests?status=output_withheld&limit=1",
                scope.organization_id, scope.project_id
            ))
            .header(
                "authorization",
                "Bearer niu-test-admin-token-that-is-long-1234",
            )
            .body(axum::body::Body::empty())
            .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body: Value =
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(body["data"].as_array().unwrap().len(), 1);
    assert!(body["next_cursor"].is_string());
    assert_eq!(body["summary"]["request_count"], 5);
    assert_eq!(body["summary"]["customer_charges"][0]["amount_nanos"], "55");
    assert!(body["data"][0].get("cash_nanos").is_none());
    assert!(body["data"][0].get("api_equivalent_nanos").is_none());
    server.abort();
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn prepaid_balance_denies_before_dispatch_and_recovers_after_funding(pool: sqlx::PgPool) {
    async fn responses_provider(
        State(captured): State<Captured>,
        headers: HeaderMap,
        Json(body): Json<Value>,
    ) -> Json<Value> {
        *captured.0.lock().unwrap() = Some((headers, body));
        Json(
            json!({"id":"response-fixture","object":"response","status":"completed","model":"provider-model","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"ok","annotations":[]}]}],"usage":{"input_tokens":2,"output_tokens":1}}),
        )
    }
    let captured = Captured::default();
    let upstream = Router::new()
        .route("/v1/chat/completions", post(provider))
        .route("/v1/responses", post(responses_provider))
        .with_state(captured.clone());
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let task = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
    let mut state = test_state(Some(format!("http://{address}/v1")), pool.clone());
    Arc::make_mut(&mut state.config)
        .models
        .get_mut("fast")
        .unwrap()
        .pricing = Some(crate::config::RoutePricing {
        currency: "USD".into(),
        api_prompt_rate: 2000000,
        api_completion_rate: 4000000,
        cash_prompt_rate: 1000000,
        cash_completion_rate: 2000000,
        max_input_tokens: 10,
        max_output_tokens: 10,
    });
    Arc::make_mut(&mut state.config)
        .models
        .get_mut("fast")
        .unwrap()
        .supports_responses = true;
    let org = state
        .store
        .create_organization("prepaid customer")
        .await
        .unwrap();
    let scope = state
        .store
        .create_project(org, "prepaid workspace")
        .await
        .unwrap();
    state.store.create_budget(scope, "USD", 1000).await.unwrap();
    state
        .store
        .publish_customer_tariff(
            scope,
            &niu_storage::ProviderOfferInput {
                model_alias: "fast".into(),
                currency: "USD".into(),
                prompt_rate: "1000000".into(),
                completion_rate: "2000000".into(),
                expected_revision: None,
            },
        )
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO customer_balance_accounts(id,organization_id,currency) VALUES($1,$2,'USD')",
    )
    .bind(uuid::Uuid::new_v4())
    .bind(org)
    .execute(&pool)
    .await
    .unwrap();
    let key = state
        .store
        .issue_key(scope, "prepaid client", &["fast".into()], 3600)
        .await
        .unwrap();
    let app = router(state.clone());
    for (funding, expected) in [
        (None, StatusCode::PAYMENT_REQUIRED),
        (Some(30), StatusCode::OK),
        (None, StatusCode::PAYMENT_REQUIRED),
        (Some(30), StatusCode::OK),
    ] {
        if let Some(amount) = funding {
            state
                .store
                .record_settled_customer_funding(
                    org,
                    "USD",
                    amount,
                    "test-settlement",
                    &uuid::Uuid::new_v4().to_string(),
                )
                .await
                .unwrap();
        }
        *captured.0.lock().unwrap() = None;
        let response = app
            .clone()
            .oneshot(
                Request::post("/v1/chat/completions")
                    .header("authorization", format!("Bearer {}", key.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(
                        json!({"model":"fast","messages":[{"role":"user","content":"hi"}]})
                            .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
        if expected == StatusCode::OK {
            let _ = response.into_body().collect().await.unwrap();
            assert!(captured.0.lock().unwrap().is_some());
        } else {
            assert!(captured.0.lock().unwrap().is_none());
        }
    }
    let charged: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM customer_balance_entries WHERE organization_id=$1 AND kind='charge'",
    )
    .bind(org)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(charged, 2);
    let holds:i64=sqlx::query_scalar("SELECT COUNT(*) FROM customer_balance_reservations WHERE organization_id=$1 AND released_at IS NULL").bind(org).fetch_one(&pool).await.unwrap();
    assert_eq!(holds, 0);
    // Company funding does not override an independent retail workspace limit.
    state
        .store
        .record_settled_customer_funding(
            org,
            "USD",
            1000,
            "test-settlement",
            "workspace-limit-funding",
        )
        .await
        .unwrap();
    let spent: i64 = sqlx::query_scalar("SELECT -sum(amount_nanos)::bigint FROM customer_balance_entries WHERE organization_id=$1 AND project_id=$2 AND kind='charge'")
        .bind(org).bind(scope.project_id).fetch_one(&pool).await.unwrap();
    state
        .store
        .set_customer_workspace_spending_limit(scope, "USD", spent + 29, 0)
        .await
        .unwrap();
    for (path, body) in [
        (
            "/v1/chat/completions",
            json!({"model":"fast","messages":[{"role":"user","content":"hi"}]}),
        ),
        ("/v1/responses", json!({"model":"fast","input":"hi"})),
    ] {
        *captured.0.lock().unwrap() = None;
        let denied = app
            .clone()
            .oneshot(
                Request::post(path)
                    .header("authorization", format!("Bearer {}", key.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(denied.status(), StatusCode::PAYMENT_REQUIRED, "{path}");
        let denied_body: Value =
            serde_json::from_slice(&denied.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        assert_eq!(
            denied_body["error"]["type"], "workspace_spending_limit_exceeded",
            "{path}"
        );
        assert!(
            captured.0.lock().unwrap().is_none(),
            "{path} dispatched despite denial"
        );
    }
    let after_denial: (i64,i64) = sqlx::query_as("SELECT (SELECT count(*) FROM customer_balance_entries WHERE organization_id=$1 AND kind='charge'),(SELECT count(*) FROM customer_balance_reservations WHERE organization_id=$1 AND released_at IS NULL)")
        .bind(org).fetch_one(&pool).await.unwrap();
    assert_eq!(after_denial, (2, 0));
    state
        .store
        .set_customer_workspace_spending_limit(scope, "USD", spent + 30, 1)
        .await
        .unwrap();
    let admitted = app
        .clone()
        .oneshot(
            Request::post("/v1/chat/completions")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({"model":"fast","messages":[{"role":"user","content":"hi"}]}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(admitted.status(), StatusCode::OK);
    let _ = admitted.into_body().collect().await.unwrap();
    assert!(captured.0.lock().unwrap().is_some());
    let total: i64 = sqlx::query_scalar("SELECT -sum(amount_nanos)::bigint FROM customer_balance_entries WHERE organization_id=$1 AND project_id=$2 AND kind='charge'")
        .bind(org).bind(scope.project_id).fetch_one(&pool).await.unwrap();
    assert!(total > spent);
    assert_eq!(
        state
            .store
            .customer_workspace_spending_limit(scope, "USD")
            .await
            .unwrap()
            .unwrap()["committed_nanos"],
        total.to_string()
    );
    state
        .store
        .set_customer_workspace_spending_limit(scope, "USD", total + 30, 2)
        .await
        .unwrap();
    *captured.0.lock().unwrap() = None;
    let response = app
        .clone()
        .oneshot(
            Request::post("/v1/responses")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({"model":"fast","input":"hi"}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let output: Value =
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(output["output"][0]["content"][0]["text"], "ok");
    assert!(captured.0.lock().unwrap().is_some());
    let final_total:i64=sqlx::query_scalar("SELECT -sum(amount_nanos)::bigint FROM customer_balance_entries WHERE organization_id=$1 AND project_id=$2 AND kind='charge'")
        .bind(org).bind(scope.project_id).fetch_one(&pool).await.unwrap();
    assert_eq!(final_total, total + 4);
    assert_eq!(
        state
            .store
            .customer_workspace_spending_limit(scope, "USD")
            .await
            .unwrap()
            .unwrap()["committed_nanos"],
        final_total.to_string()
    );
    let remaining:i64=sqlx::query_scalar("SELECT COUNT(*) FROM customer_balance_reservations WHERE organization_id=$1 AND released_at IS NULL").bind(org).fetch_one(&pool).await.unwrap();
    assert_eq!(remaining, 0);
    Arc::make_mut(&mut state.config)
        .models
        .get_mut("fast")
        .unwrap()
        .pricing = None;
    *captured.0.lock().unwrap() = None;
    let response = router(state)
        .oneshot(
            Request::post("/v1/chat/completions")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({"model":"fast","messages":[{"role":"user","content":"hi"}]}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert!(captured.0.lock().unwrap().is_none());
    task.abort();
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn shared_balance_api_requires_company_access_and_trusted_funding(pool: sqlx::PgPool) {
    use niu_storage::{OperatorAuditActor, OperatorRole, OperatorScope};
    let state = test_state(None, pool);
    let org = state
        .store
        .create_organization("balance access test")
        .await
        .unwrap();
    let scope = state
        .store
        .create_project(org, "one workspace")
        .await
        .unwrap();
    let mut identities = Vec::new();
    for (project_id, role, expected) in [
        (None, OperatorRole::Owner, StatusCode::OK),
        (None, OperatorRole::Admin, StatusCode::OK),
        (None, OperatorRole::Viewer, StatusCode::NOT_FOUND),
        (
            Some(scope.project_id),
            OperatorRole::Owner,
            StatusCode::NOT_FOUND,
        ),
    ] {
        let actor = state
            .store
            .create_operator(
                OperatorScope {
                    organization_id: org,
                    project_id,
                },
                "Balance access fixture",
                role,
                3600,
                OperatorAuditActor::Installation,
            )
            .await
            .unwrap();
        identities.push((actor.token, expected));
    }
    let app = router(state.clone());
    let funding_path = format!("/admin/v1/organizations/{org}/billing/funding/settled");
    let balance_path = format!("/admin/v1/organizations/{org}/billing/balance");
    let policy_path = format!("/admin/v1/organizations/{org}/billing/accounts/CNY/policy");
    let policy = json!({"credit_limit_nanos":"0","warning_threshold_nanos":"2000000000","expected_revision":"0"});
    let funding = json!({"currency":"CNY","amount_nanos":"1000000000","channel":"test-bank-settlement","payment_reference":"verified-fixture"});
    for (token, expected) in &identities {
        let response = app
            .clone()
            .oneshot(
                Request::get(&balance_path)
                    .header("authorization", format!("Bearer {token}"))
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), *expected);
        let response = app
            .clone()
            .oneshot(
                Request::get(format!(
                    "/admin/v1/organizations/{org}/billing/transactions"
                ))
                .header("authorization", format!("Bearer {token}"))
                .body(axum::body::Body::empty())
                .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), *expected);

        let response = app
            .clone()
            .oneshot(
                Request::post(&funding_path)
                    .header("authorization", format!("Bearer {token}"))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(funding.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
        let response = app
            .clone()
            .oneshot(
                Request::post(format!(
                    "/admin/v1/organizations/{org}/billing/entries/{}/reversal",
                    uuid::Uuid::new_v4()
                ))
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({"amount_nanos":"1","idempotency_key":uuid::Uuid::new_v4()}).to_string(),
                ))
                .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);

        let response = app
            .clone()
            .oneshot(
                Request::put(&policy_path)
                    .header("authorization", format!("Bearer {token}"))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(policy.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }
    for _ in 0..2 {
        let response = app
            .clone()
            .oneshot(
                Request::post(&funding_path)
                    .header(
                        "authorization",
                        "Bearer niu-test-admin-token-that-is-long-1234",
                    )
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(funding.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    for expected in [StatusCode::OK, StatusCode::CONFLICT] {
        let response = app
            .clone()
            .oneshot(
                Request::put(&policy_path)
                    .header(
                        "authorization",
                        "Bearer niu-test-admin-token-that-is-long-1234",
                    )
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(policy.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
    }
    let response = app
        .clone()
        .oneshot(
            Request::get(&balance_path)
                .header("authorization", format!("Bearer {}", identities[0].0))
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let body: Value =
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(body["data"][0]["balance_nanos"], "1000000000");
    assert_eq!(body["data"][0]["available_nanos"], "1000000000");
    assert_eq!(body["data"][0]["reserved_nanos"], "0");
    assert_eq!(body["data"][0]["policy_revision"], "1");
    assert_eq!(body["data"][0]["low_balance"], true);

    assert!(body["data"][0].get("id").is_none());

    let foreign_org = state
        .store
        .create_organization("Foreign history fixture")
        .await
        .unwrap();
    let foreign_cursor = state
        .store
        .record_settled_customer_funding(foreign_org, "CNY", 1, "fixture", "foreign-cursor")
        .await
        .unwrap();
    for (token, expected) in [
        (&identities[0].0, StatusCode::CONFLICT),
        (&identities[3].0, StatusCode::NOT_FOUND),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::get(format!(
                    "/admin/v1/organizations/{org}/billing/transactions?before={foreign_cursor}"
                ))
                .header("authorization", format!("Bearer {token}"))
                .body(axum::body::Body::empty())
                .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
    }
    for query in ["before=not-a-uuid", "unknown=ignored"] {
        let response = app
            .clone()
            .oneshot(
                Request::get(format!(
                    "/admin/v1/organizations/{org}/billing/transactions?{query}"
                ))
                .header("authorization", format!("Bearer {}", identities[0].0))
                .body(axum::body::Body::empty())
                .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }
    let response = app
        .clone()
        .oneshot(
            Request::get(format!(
                "/admin/v1/organizations/{org}/billing/transactions"
            ))
            .header("authorization", format!("Bearer {}", identities[0].0))
            .body(axum::body::Body::empty())
            .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let history: Value =
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(history["data"].as_array().unwrap().len(), 1);
    assert!(history["next_cursor"].is_null());
    assert!(
        history
            .to_string()
            .find(&foreign_cursor.to_string())
            .is_none()
    );

    let entries = state
        .store
        .customer_balance_transactions(org)
        .await
        .unwrap();
    let reversal_path = format!(
        "/admin/v1/organizations/{org}/billing/entries/{}/reversal",
        entries[0]["id"].as_str().unwrap()
    );
    let reversal = json!({"amount_nanos":"100000000","idempotency_key":uuid::Uuid::new_v4()});
    for _ in 0..2 {
        let response = app
            .clone()
            .oneshot(
                Request::post(&reversal_path)
                    .header(
                        "authorization",
                        "Bearer niu-test-admin-token-that-is-long-1234",
                    )
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(reversal.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }
    assert_eq!(
        state.store.customer_balance_summary(org).await.unwrap()[0]["balance_nanos"],
        "900000000"
    );
    let warning_path =
        format!("/admin/v1/organizations/{org}/billing/accounts/CNY/warning-threshold");
    for (index, (token, _)) in identities.iter().enumerate() {
        let expected = match index {
            0 | 1 => StatusCode::OK,
            2 => StatusCode::FORBIDDEN,
            _ => StatusCode::NOT_FOUND,
        };
        let revision = if index == 0 { "1" } else { "2" };
        let response = app
            .clone()
            .oneshot(
                Request::put(&warning_path)
                    .header("authorization", format!("Bearer {token}"))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(
                        json!({"warning_threshold_nanos":"100000000","expected_revision":revision})
                            .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
    }
    let response = app
        .clone()
        .oneshot(
            Request::put(&warning_path)
                .header("authorization", format!("Bearer {}", identities[0].0))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({"warning_threshold_nanos":null,"expected_revision":"1"}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::CONFLICT);
    let response=app.clone().oneshot(Request::put(&warning_path).header("authorization",format!("Bearer {}",identities[0].0)).header("content-type","application/json").body(axum::body::Body::from(json!({"warning_threshold_nanos":null,"expected_revision":"3","credit_limit_nanos":"999999999"}).to_string())).unwrap()).await.unwrap();
    assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(
        state.store.customer_balance_summary(org).await.unwrap()[0]["credit_limit_nanos"],
        "0"
    );

    let foreign = format!(
        "/admin/v1/organizations/{}/billing/balance",
        uuid::Uuid::new_v4()
    );
    let response = app
        .oneshot(
            Request::get(foreign)
                .header("authorization", format!("Bearer {}", identities[0].0))
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn output_observation_preserves_original_and_cannot_weaken_enforcement(pool: sqlx::PgPool) {
    let calls = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let seen = calls.clone();
    let upstream = Router::new().route("/v1/{*protocol}", post(move |axum::extract::Path(protocol): axum::extract::Path<String>, Json(body): Json<Value>| {
        let seen = seen.clone();
        async move {
            seen.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            let mode = body.pointer("/messages/0/content").and_then(Value::as_str).unwrap_or("normal");
            let text = if mode == "large" { "sensitive-observation-fixture".repeat(45_000) } else { "sensitive-observation-fixture".to_owned() };
            let mut value = if protocol == "responses" {
                json!({"id":"response-fixture","object":"response","status":"completed","model":"provider-model","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":text,"annotations":[]}]}],"usage":{"input_tokens":2,"output_tokens":1}})
            } else {
                json!({"id":"chat-fixture","object":"chat.completion","model":"provider-model","choices":[{"index":0,"message":{"role":"assistant","content":text},"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"completion_tokens":1,"total_tokens":3}})
            };
            if mode == "opaque" { value["unknown_output"] = json!("sensitive-observation-fixture"); }
            Json(value)
        }
    }));
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
    let mut state = test_state(Some(format!("http://{address}/v1")), pool.clone());
    Arc::make_mut(&mut state.config)
        .models
        .get_mut("fast")
        .unwrap()
        .supports_responses = true;
    let scope = state.store.default_workspace().await.unwrap();
    let key = state
        .store
        .issue_key(scope, "Observation customer", &["fast".into()], 3600)
        .await
        .unwrap();
    let app = router(state.clone());
    let policy = |mode: &str, action: &str| json!({"schema_version":1,"name":"Output observation fixture","models":{"mode":"inherit"},"providers":{"mode":"inherit"},"output":{"mode":mode,"rules":[{"pattern":"sensitive-observation-fixture","action":action}]}});
    state
        .store
        .activate_workspace_guardrail(scope, 0, &policy("observe_only", "redact"))
        .await
        .unwrap();
    for (path, body, expected) in [
        (
            "/v1/chat/completions",
            json!({"model":"fast","messages":[{"role":"user","content":"normal"}]}),
            "matched",
        ),
        (
            "/v1/responses",
            json!({"model":"fast","input":"normal"}),
            "matched",
        ),
        (
            "/v1/chat/completions",
            json!({"model":"fast","messages":[{"role":"user","content":"opaque"}]}),
            "indeterminate",
        ),
        (
            "/v1/chat/completions",
            json!({"model":"fast","messages":[{"role":"user","content":"large"}]}),
            "indeterminate",
        ),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::post(path)
                    .header("authorization", format!("Bearer {}", key.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let attempt: uuid::Uuid = response.headers()["x-niu-attempt-id"]
            .to_str()
            .unwrap()
            .parse()
            .unwrap();
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        let text = std::str::from_utf8(&bytes).unwrap();
        assert!(text.contains("sensitive-observation-fixture"));
        assert!(!text.contains("[REDACTED]"));
        let decision = state
            .store
            .dispatch_guardrail_decision(scope, attempt)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(decision["output_observation"]["outcome"], expected);
        assert_eq!(decision["output_observation"]["enforcement"], false);
        assert!(decision["output_inspection"].is_null());
        assert!(
            !decision
                .to_string()
                .contains("sensitive-observation-fixture")
        );
        assert!(
            sqlx::query(
                "UPDATE output_guardrail_observations SET elapsed_ms=0 WHERE attempt_id=$1"
            )
            .bind(attempt)
            .execute(&pool)
            .await
            .is_err()
        );
    }
    let before = calls.load(std::sync::atomic::Ordering::SeqCst);
    let streaming = app.clone().oneshot(Request::post("/v1/chat/completions").header("authorization", format!("Bearer {}",key.token)).header("content-type","application/json").body(axum::body::Body::from(json!({"model":"fast","stream":true,"messages":[{"role":"user","content":"normal"}]}).to_string())).unwrap()).await.unwrap();
    assert_eq!(streaming.status(), StatusCode::FORBIDDEN);
    assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), before);
    // A mandatory workspace rule still wins over an observe-only key rule.
    state
        .store
        .assign_key_guardrail(scope, key.id, 1, 0)
        .await
        .unwrap();
    state
        .store
        .activate_workspace_guardrail(scope, 1, &policy("buffered_full", "block"))
        .await
        .unwrap();
    let response = app
        .oneshot(
            Request::post("/v1/chat/completions")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({"model":"fast","messages":[{"role":"user","content":"normal"}]})
                        .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    let attempt: uuid::Uuid = response.headers()["x-niu-attempt-id"]
        .to_str()
        .unwrap()
        .parse()
        .unwrap();
    let decision = state
        .store
        .dispatch_guardrail_decision(scope, attempt)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(decision["output_inspection"]["outcome"], "blocked");
    assert_eq!(decision["output_observation"]["outcome"], "matched");
    assert!(
        !String::from_utf8(
            response
                .into_body()
                .collect()
                .await
                .unwrap()
                .to_bytes()
                .to_vec()
        )
        .unwrap()
        .contains("sensitive-observation-fixture")
    );
    server.abort();
}
