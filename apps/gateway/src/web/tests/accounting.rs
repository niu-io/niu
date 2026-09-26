use super::*;

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn priced_streaming_settles_only_terminal_usage(pool: sqlx::PgPool) {
    for (payload, completed, settled) in [
        (
            "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":2,\"completion_tokens\":1}}\n\ndata: [DONE]\n\n",
            true,
            true,
        ),
        ("data: {\"choices\":[]}\n\ndata: [DONE]\n\n", true, false),
        (
            "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":2,\"completion_tokens\":1}}\n\n",
            false,
            false,
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
        assert_eq!(
            attempt.execution,
            if completed {
                "confirmed_completed"
            } else {
                "may_have_executed"
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
        .issue_key(scope, "client", &["fast".into()], 3600)
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
