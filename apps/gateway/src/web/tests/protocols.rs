use super::*;
use axum::response::{IntoResponse, Response};

async fn register_personal_route(state: &mut AppState, organization: Uuid, alias: &str) {
    state
        .store
        .configure_platform_currency("USD")
        .await
        .unwrap();
    crate::payments::readiness::configure_test_gateway(state).await;
    let model = state.config.models[alias].clone();
    let cipher = Arc::new(
        crate::vendors::crypto::CredentialCipher::new(
            "personal-protocol-fixture-secret-at-least-32-characters",
        )
        .unwrap(),
    );
    let id = Uuid::new_v4();
    let vendor = state
        .store
        .create_vendor(niu_storage::VendorInput {
            id,
            name: format!("Protocol fixture {alias}"),
            adapter: model.provider.clone(),
            api_base: model.api_base.clone().unwrap(),
            enabled: true,
            credential_ciphertext: cipher.seal(id, "provider-secret-token").unwrap(),
        })
        .await
        .unwrap();
    state
        .store
        .assign_personal_vendor_owner(id, organization, vendor.revision)
        .await
        .unwrap();
    let capabilities = serde_json::to_value(&model)
        .unwrap()
        .as_object()
        .unwrap()
        .iter()
        .filter(|(name, _)| name.starts_with("supports_") || *name == "catalog")
        .map(|(name, value)| (name.clone(), value.clone()))
        .collect::<serde_json::Map<_, _>>();
    state
        .store
        .upsert_vendor_model(
            id,
            niu_storage::VendorModelInput {
                alias: alias.into(),
                upstream_model: model.upstream_model,
                public_catalog: false,
                enabled: true,
                capabilities: Value::Object(capabilities),
                pricing: None,
                expected_revision: None,
            },
        )
        .await
        .unwrap();
    state.vendor_cipher = Some(cipher);
}

async fn poll_generation(
    app: &Router,
    token: &str,
    attempt_id: Uuid,
    predicate: impl Fn(&Value) -> bool,
) -> Value {
    tokio::time::timeout(std::time::Duration::from_secs(5), async {
        loop {
            let res = app
                .clone()
                .oneshot(
                    Request::get(format!("/v1/generations/{attempt_id}"))
                        .header("authorization", format!("Bearer {token}"))
                        .body(axum::body::Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(res.status(), StatusCode::OK);
            let body: Value =
                serde_json::from_slice(&res.into_body().collect().await.unwrap().to_bytes())
                    .unwrap();
            if predicate(&body["data"]) {
                return body["data"].clone();
            }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("timed out waiting for generation state")
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn responses_protocol_tools_streaming_structured_reasoning_and_vision(pool: PgPool) {
    let calls: Arc<Mutex<Vec<(HeaderMap, Value)>>> = Arc::new(Mutex::new(Vec::new()));
    let calls_ref = calls.clone();
    let upstream = Router::new()
        .route(
            "/v1/responses",
            post(move |headers: HeaderMap, Json(body): Json<Value>| {
                let calls = calls_ref.clone();
                async move {
                    calls.lock().unwrap().push((headers, body.clone()));
                    let stream = body.get("stream") == Some(&json!(true));
                    let schema_name = body.pointer("/text/format/name").and_then(Value::as_str);
                    if stream && schema_name == Some("bad_schema") {
                        let sse = concat!(
                            "data: {\"type\":\"response.created\",\"response\":{\"id\":\"resp_bad_s\",\"object\":\"response\",\"status\":\"in_progress\",\"output\":[]}}\n\n",
                            "data: {\"type\":\"response.output_text.delta\",\"output_index\":0,\"content_index\":0,\"delta\":\"{\\\"wrong\\\":1}\"}\n\n",
                            "data: {\"type\":\"response.completed\",\"response\":{\"id\":\"resp_bad_s\",\"object\":\"response\",\"status\":\"completed\",\"model\":\"upstream-resp\",\"output\":[{\"type\":\"message\",\"role\":\"assistant\",\"content\":[{\"type\":\"output_text\",\"text\":\"{\\\"wrong\\\":1}\"}]}],\"usage\":{\"input_tokens\":8,\"output_tokens\":3,\"total_tokens\":11}}}\n\n"
                        );
                        return Response::builder()
                            .header("content-type", "text/event-stream")
                            .body(axum::body::Body::from(sse))
                            .unwrap();
                    }
                    if schema_name == Some("bad_schema") {
                        return Json(json!({
                            "id": "resp_bad_b",
                            "object": "response",
                            "status": "completed",
                            "model": "upstream-resp",
                            "output": [{"type":"message","role":"assistant","content":[{"type":"output_text","text":"{\"wrong\":1}"}]}],
                            "usage": {"input_tokens": 8, "output_tokens": 3, "total_tokens": 11}
                        }))
                        .into_response();
                    }
                    if schema_name == Some("answer_schema") {
                        return Json(json!({
                            "id": "resp_ok_schema",
                            "object": "response",
                            "status": "completed",
                            "model": "upstream-resp",
                            "output": [{"type":"message","role":"assistant","content":[{"type":"output_text","text":"{\"answer\":\"ok\"}"}]}],
                            "usage": {"input_tokens": 7, "output_tokens": 2, "total_tokens": 9}
                        }))
                        .into_response();
                    }
                    if stream {
                        let sse = concat!(
                            "data: {\"type\":\"response.created\",\"response\":{\"id\":\"resp_st\",\"object\":\"response\",\"status\":\"in_progress\",\"output\":[]}}\n\n",
                            "data: {\"type\":\"response.output_item.added\",\"output_index\":0,\"item\":{\"type\":\"function_call\",\"id\":\"fc_1\",\"call_id\":\"call_s1\",\"name\":\"lookup\",\"arguments\":\"\"}}\n\n",
                            "data: {\"type\":\"response.function_call_arguments.delta\",\"output_index\":0,\"delta\":\"{\\\"q\\\":\\\"niu\\\"}\"}\n\n",
                            "data: {\"type\":\"response.function_call_arguments.done\",\"output_index\":0,\"arguments\":\"{\\\"q\\\":\\\"niu\\\"}\"}\n\n",
                            "data: {\"type\":\"response.completed\",\"response\":{\"id\":\"resp_st\",\"object\":\"response\",\"status\":\"completed\",\"model\":\"upstream-resp\",\"output\":[{\"type\":\"function_call\",\"call_id\":\"call_s1\",\"name\":\"lookup\",\"arguments\":\"{\\\"q\\\":\\\"niu\\\"}\"}],\"usage\":{\"input_tokens\":9,\"output_tokens\":4,\"total_tokens\":13}}}\n\n"
                        );
                        return Response::builder()
                            .header("content-type", "text/event-stream")
                            .body(axum::body::Body::from(sse))
                            .unwrap();
                    }
                    Json(json!({
                        "id": "resp_tool_b",
                        "object": "response",
                        "status": "completed",
                        "model": "upstream-resp",
                        "output": [
                            {"type": "reasoning", "summary": [{"type": "summary_text", "text": "thought"}]},
                            {"type": "function_call", "call_id": "call_2", "name": "lookup", "arguments": "{\"q\":\"next\"}"}
                        ],
                        "usage": {"input_tokens": 12, "output_tokens": 5, "total_tokens": 17}
                    }))
                    .into_response()
                }
            }),
        )
        .into_make_service();

    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let task = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });

    let mut state = test_state(Some(format!("http://{address}/v1")), pool);
    {
        let config = Arc::make_mut(&mut state.config);
        let fast = config.models.get_mut("fast").unwrap();
        fast.upstream_model = "upstream-resp".into();
        fast.supports_responses = true;
        fast.supports_tool_calls = true;
        fast.supports_streaming_tool_calls = true;
        fast.supports_structured_output = true;
        fast.catalog.input_modalities = vec!["text".into(), "image".into()];
        fast.catalog.supported_parameters = vec!["reasoning".into()];

        let mut priced = fast.clone();
        priced.pricing = Some(crate::config::RoutePricing {
            currency: "USD".into(),
            api_prompt_rate: 1_000_000,
            api_completion_rate: 1_000_000,
            cash_prompt_rate: 1_000_000,
            cash_completion_rate: 1_000_000,
            max_input_tokens: 10_000,
            max_output_tokens: 512,
        });
        config.models.insert("priced-resp".into(), priced);
    }
    let organization = state.store.create_organization("responses").await.unwrap();
    let scope = state
        .store
        .create_project(organization, "project")
        .await
        .unwrap();
    state.store.create_budget(scope, "USD", 100).await.unwrap();
    register_personal_route(&mut state, organization, "fast").await;
    let key = state
        .store
        .issue_key(
            scope,
            "Responses protocol key",
            &["fast".into(), "priced-resp".into()],
            3600,
        )
        .await
        .unwrap();
    let app = router(state.clone());

    // 1. Multi-turn input + tools + reasoning + store:false -> buffered function_call + ToolCalls reason.
    let res = app
        .clone()
        .oneshot(
            Request::post("/v1/responses")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({
                        "model": "fast",
                        "input": [
                            {"type": "message", "role": "user", "content": [{"type": "input_text", "text": "search"}]},
                            {"type": "reasoning", "summary": [{"type": "summary_text", "text": "prior"}]},
                            {"type": "function_call", "call_id": "call_1", "name": "lookup", "arguments": "{\"q\":\"a\"}"},
                            {"type": "function_call_output", "call_id": "call_1", "output": "{\"ok\":true}"}
                        ],
                        "tools": [{"type": "function", "name": "lookup", "parameters": {"type": "object", "required": ["q"], "properties": {"q": {"type": "string"}}}}],
                        "tool_choice": "auto",
                        "parallel_tool_calls": false,
                        "reasoning": {"effort": "low", "summary": "concise"},
                        "truncation": "disabled",
                        "store": false
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let attempt_b: Uuid = res.headers()["x-niu-attempt-id"]
        .to_str()
        .unwrap()
        .parse()
        .unwrap();
    let body_b: Value =
        serde_json::from_slice(&res.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(body_b["output"][1]["name"], "lookup");
    let gen_b = poll_generation(&app, &key.token, attempt_b, |g| {
        g["execution"] == "confirmed_completed"
    })
    .await;
    assert_eq!(gen_b["finish_reasons"][0]["reason"], "tool_calls");
    assert_eq!(gen_b["usage"]["prompt_tokens"], "12");
    assert_eq!(gen_b["usage"]["completion_tokens"], "5");

    // 2. Streaming SSE function_call arguments delta + terminal ToolCalls.
    let res = app
        .clone()
        .oneshot(
            Request::post("/v1/responses")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({
                        "model": "fast",
                        "stream": true,
                        "input": "search streaming",
                        "tools": [{"type": "function", "name": "lookup", "parameters": {"type": "object", "required": ["q"], "properties": {"q": {"type": "string"}}}}]
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let attempt_s: Uuid = res.headers()["x-niu-attempt-id"]
        .to_str()
        .unwrap()
        .parse()
        .unwrap();
    let sse_text =
        String::from_utf8(res.into_body().collect().await.unwrap().to_bytes().to_vec()).unwrap();
    assert!(sse_text.contains("response.function_call_arguments.delta"));
    assert!(sse_text.contains("response.completed"));
    let gen_s = poll_generation(&app, &key.token, attempt_s, |g| {
        g["execution"] == "confirmed_completed"
    })
    .await;
    assert_eq!(gen_s["finish_reasons"][0]["reason"], "tool_calls");
    assert_eq!(gen_s["usage"]["prompt_tokens"], "9");

    // 3. Structured output valid (200) vs invalid buffered (502 + retained usage) vs invalid streamed (error event without response.completed + retained usage).
    let ok_schema = app
        .clone()
        .oneshot(
            Request::post("/v1/responses")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({
                        "model": "fast",
                        "input": "ok json",
                        "text": {"format": {"type": "json_schema", "name": "answer_schema", "schema": {"type": "object", "required": ["answer"], "properties": {"answer": {"type": "string"}}}}}
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(ok_schema.status(), StatusCode::OK);

    let bad_stream = app
        .clone()
        .oneshot(
            Request::post("/v1/responses")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({
                        "model": "fast",
                        "stream": true,
                        "input": "bad json stream",
                        "text": {"format": {"type": "json_schema", "name": "bad_schema", "schema": {"type": "object", "required": ["answer"], "properties": {"answer": {"type": "string"}}}}}
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(bad_stream.status(), StatusCode::OK);
    let attempt_bad: Uuid = bad_stream.headers()["x-niu-attempt-id"]
        .to_str()
        .unwrap()
        .parse()
        .unwrap();
    let bad_sse = String::from_utf8(
        bad_stream
            .into_body()
            .collect()
            .await
            .unwrap()
            .to_bytes()
            .to_vec(),
    )
    .unwrap();
    assert!(!bad_sse.contains("response.completed"));
    assert!(bad_sse.contains("upstream_invalid_response"));
    let gen_bad = poll_generation(&app, &key.token, attempt_bad, |g| {
        g["execution"] == "confirmed_completed"
    })
    .await;
    assert_eq!(gen_bad["usage"]["prompt_tokens"], "8");

    // 4. Unpriced input_image succeeds; priced input_image & hosted/stateful fields fail 400 before upstream.
    let before = calls.lock().unwrap().len();
    let vision_unpriced = app
        .clone()
        .oneshot(
            Request::post("/v1/responses")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({
                        "model": "fast",
                        "input": [{"role": "user", "content": [{"type": "input_text", "text": "describe"}, {"type": "input_image", "image_url": "https://example.com/a.png"}]}],
                        "text": {"format": {"type": "json_schema", "name": "answer_schema", "schema": {"type": "object", "required": ["answer"]}}}
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(vision_unpriced.status(), StatusCode::OK);
    assert_eq!(calls.lock().unwrap().len(), before + 1);

    let after_before_rejections = calls.lock().unwrap().len();
    for rejected in [
        json!({"model": "priced-resp", "input": [{"role": "user", "content": [{"type": "input_image", "image_url": "https://example.com/a.png"}]}]}),
        json!({"model": "fast", "input": "hi", "store": true}),
        json!({"model": "fast", "input": "hi", "previous_response_id": "resp_0"}),
        json!({"model": "fast", "input": "hi", "tools": [{"type": "web_search_preview"}]}),
    ] {
        let res = app
            .clone()
            .oneshot(
                Request::post("/v1/responses")
                    .header("authorization", format!("Bearer {}", key.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(rejected.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::BAD_REQUEST, "{rejected}");
    }
    assert_eq!(calls.lock().unwrap().len(), after_before_rejections);

    task.abort();
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn messages_protocol_betas_thinking_tool_result_array_and_media_bounds(pool: PgPool) {
    type RecordedMessageCalls = Arc<Mutex<Vec<(Option<String>, Value)>>>;
    let calls: RecordedMessageCalls = Arc::new(Mutex::new(Vec::new()));
    let calls_ref = calls.clone();
    let upstream = Router::new()
        .route(
            "/v1/messages",
            post(move |headers: HeaderMap, Json(body): Json<Value>| {
                let calls = calls_ref.clone();
                async move {
                    let beta = headers
                        .get("anthropic-beta")
                        .and_then(|v| v.to_str().ok())
                        .map(str::to_owned);
                    calls.lock().unwrap().push((beta, body.clone()));
                    if body.get("stream") == Some(&json!(true)) {
                        let sse = concat!(
                            "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_s1\",\"type\":\"message\",\"role\":\"assistant\",\"model\":\"claude-sonnet-4\",\"content\":[],\"stop_reason\":null,\"stop_sequence\":null,\"usage\":{\"input_tokens\":20,\"output_tokens\":1}}}\n\n",
                            "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"thinking\",\"thinking\":\"\",\"signature\":null}}\n\n",
                            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"thinking_delta\",\"thinking\":\"step 1\"}}\n\n",
                            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"signature_delta\",\"signature\":\"sig_s1\"}}\n\n",
                            "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n",
                            "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":1,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n",
                            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":1,\"delta\":{\"type\":\"text_delta\",\"text\":\"done\"}}\n\n",
                            "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":1}\n\n",
                            "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\",\"stop_sequence\":null},\"usage\":{\"output_tokens\":10}}\n\n",
                            "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n"
                        );
                        return Response::builder()
                            .header("content-type", "text/event-stream")
                            .body(axum::body::Body::from(sse))
                            .unwrap();
                    }
                    Json(json!({
                        "id": "msg_b1",
                        "type": "message",
                        "role": "assistant",
                        "model": "claude-sonnet-4",
                        "content": [
                            {"type": "thinking", "thinking": "ponder", "signature": "sig_b1"},
                            {"type": "redacted_thinking", "data": "enc_1"},
                            {"type": "text", "text": "Answer"}
                        ],
                        "stop_reason": "end_turn",
                        "stop_sequence": null,
                        "usage": {"input_tokens": 15, "output_tokens": 9}
                    }))
                    .into_response()
                }
            }),
        )
        .into_make_service();

    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let task = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });

    let mut state = test_state(Some(format!("http://{address}/v1")), pool);
    {
        let config = Arc::make_mut(&mut state.config);
        let base = config.models["fast"].clone();
        let mut claude = base;
        claude.provider = "anthropic".into();
        claude.upstream_model = "claude-sonnet-4".into();
        claude.supports_messages = true;
        claude.supports_messages_streaming = true;
        claude.supports_messages_tools = true;
        claude.supports_messages_streaming_tools = true;
        claude.catalog.input_modalities = vec!["text".into(), "image".into()];
        claude.catalog.supported_parameters = vec!["reasoning".into()];

        let mut priced = claude.clone();
        priced.pricing = Some(crate::config::RoutePricing {
            currency: "USD".into(),
            api_prompt_rate: 1_000_000,
            api_completion_rate: 1_000_000,
            cash_prompt_rate: 1_000_000,
            cash_completion_rate: 1_000_000,
            max_input_tokens: 100_000,
            max_output_tokens: 4096,
        });
        config.models.insert("claude".into(), claude);
        config.models.insert("claude-priced".into(), priced);
    }
    let organization = state.store.create_organization("messages").await.unwrap();
    let scope = state
        .store
        .create_project(organization, "project")
        .await
        .unwrap();
    state.store.create_budget(scope, "USD", 100).await.unwrap();
    register_personal_route(&mut state, organization, "claude").await;
    let key = state
        .store
        .issue_key(
            scope,
            "Messages protocol key",
            &["claude".into(), "claude-priced".into()],
            3600,
        )
        .await
        .unwrap();
    let app = router(state);

    // 1. claude-code-20250219 is stripped; safe capability beta is forwarded & enables interleaved budget.
    let res1 = app
        .clone()
        .oneshot(
            Request::post("/v1/messages")
                .header("authorization", format!("Bearer {}", key.token))
                .header("anthropic-version", "2023-06-01")
                .header("anthropic-beta", "claude-code-20250219")
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({
                        "model": "claude",
                        "max_tokens": 512,
                        "messages": [{"role": "user", "content": "hi"}]
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res1.status(), StatusCode::OK);
    assert_eq!(calls.lock().unwrap()[0].0, None);

    let res2 = app
        .clone()
        .oneshot(
            Request::post("/v1/messages")
                .header("authorization", format!("Bearer {}", key.token))
                .header("anthropic-version", "2023-06-01")
                .header(
                    "anthropic-beta",
                    "claude-code-20250219, interleaved-thinking-2025-05-14",
                )
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({
                        "model": "claude",
                        "max_tokens": 512,
                        "thinking": {"type": "enabled", "budget_tokens": 2048},
                        "output_config": {"effort": "high"},
                        "top_k": 40,
                        "metadata": {"user_id": "agent-1"},
                        "tools": [{
                            "name": "read_file",
                            "input_schema": {"type": "object", "properties": {"path": {"type": "string"}}},
                            "cache_control": {"type": "ephemeral", "ttl": "5m"}
                        }],
                        "messages": [
                            {"role": "user", "content": [{"type": "text", "text": "inspect"}, {"type": "document", "source": {"type": "text", "media_type": "text/plain", "data": "notes"}}]},
                            {"role": "assistant", "content": [
                                {"type": "thinking", "thinking": "check", "signature": "sig_prev"},
                                {"type": "redacted_thinking", "data": "blob"},
                                {"type": "tool_use", "id": "tu_1", "name": "read_file", "input": {"path": "a.rs"}, "cache_control": {"type": "ephemeral"}}
                            ]},
                            {"role": "user", "content": [
                                {"type": "text", "text": "preamble before result"},
                                {"type": "tool_result", "tool_use_id": "tu_1", "cache_control": {"type": "ephemeral"}, "content": [
                                    {"type": "text", "text": "ok"},
                                    {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": "AAAA"}}
                                ]},
                                {"type": "text", "text": "follow-up after result"}
                            ]}
                        ]
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res2.status(), StatusCode::OK);
    assert_eq!(
        calls.lock().unwrap()[1].0.as_deref(),
        Some("interleaved-thinking-2025-05-14")
    );
    let body2: Value =
        serde_json::from_slice(&res2.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(body2["content"][0]["type"], "thinking");
    assert_eq!(body2["content"][1]["type"], "redacted_thinking");

    // 2. Streaming Extended Thinking with signature_delta.
    let res_stream = app
        .clone()
        .oneshot(
            Request::post("/v1/messages")
                .header("authorization", format!("Bearer {}", key.token))
                .header("anthropic-version", "2023-06-01")
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({
                        "model": "claude",
                        "max_tokens": 2048,
                        "stream": true,
                        "thinking": {"type": "adaptive"},
                        "messages": [{"role": "user", "content": "think"}]
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res_stream.status(), StatusCode::OK);
    let stream_text = String::from_utf8(
        res_stream
            .into_body()
            .collect()
            .await
            .unwrap()
            .to_bytes()
            .to_vec(),
    )
    .unwrap();
    assert!(stream_text.contains("thinking_delta"));
    assert!(stream_text.contains("signature_delta"));
    assert!(stream_text.contains("message_stop"));

    // 3. Unknown beta returns 501; priced image/document returns 400 (neither hits upstream).
    let before = calls.lock().unwrap().len();
    let bad_beta = app
        .clone()
        .oneshot(
            Request::post("/v1/messages")
                .header("authorization", format!("Bearer {}", key.token))
                .header("anthropic-version", "2023-06-01")
                .header("anthropic-beta", "computer-use-2025-01-24")
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({"model": "claude", "max_tokens": 64, "messages": [{"role": "user", "content": "hi"}]})
                        .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(bad_beta.status(), StatusCode::NOT_IMPLEMENTED);

    let priced_media = app
        .clone()
        .oneshot(
            Request::post("/v1/messages")
                .header("authorization", format!("Bearer {}", key.token))
                .header("anthropic-version", "2023-06-01")
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({
                        "model": "claude-priced",
                        "max_tokens": 64,
                        "messages": [{"role": "user", "content": [{"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": "AAAA"}}]}]
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(priced_media.status(), StatusCode::BAD_REQUEST);
    assert_eq!(calls.lock().unwrap().len(), before);

    task.abort();
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn generate_content_streaming_tools_schema_thinking_and_uncertainty(pool: PgPool) {
    let upstream = Router::new()
        .route(
            "/v1/models/gemini-2.5-flash:generateContent",
            post(|Json(_body): Json<Value>| async move {
                Json(json!({
                    "candidates": [{
                        "index": 0,
                        "content": {
                            "role": "model",
                            "parts": [
                                {"text": "plan", "thought": true, "thoughtSignature": "sig-thought"},
                                {"functionCall": {"name": "lookup", "args": {"q": "niu"}}, "thoughtSignature": "sig-call"}
                            ]
                        },
                        "finishReason": "STOP"
                    }],
                    "usageMetadata": {
                        "promptTokenCount": 10,
                        "toolUsePromptTokenCount": 6,
                        "candidatesTokenCount": 4,
                        "thoughtsTokenCount": 2,
                        "totalTokenCount": 22
                    },
                    "modelVersion": "gemini-2.5-flash-001"
                }))
            }),
        )
        .route(
            "/v1/models/gemini-2.5-flash:streamGenerateContent",
            post(|uri: axum::http::Uri, Json(body): Json<Value>| async move {
                if uri.query() == Some("alt=sse") {
                    let sse = concat!(
                        "data: {\"candidates\":[{\"index\":0,\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\"ponder\",\"thought\":true,\"thoughtSignature\":\"sig-1\"}]}}],\"modelVersion\":\"gemini-2.5-flash-001\"}\n\n",
                        "data: {\"candidates\":[{\"index\":0,\"content\":{\"role\":\"model\",\"parts\":[{\"functionCall\":{\"name\":\"lookup\",\"args\":{\"q\":\"sse\"}},\"thoughtSignature\":\"sig-2\"}]},\"finishReason\":\"STOP\"}],\"usageMetadata\":{\"promptTokenCount\":10,\"toolUsePromptTokenCount\":6,\"candidatesTokenCount\":4,\"thoughtsTokenCount\":2,\"totalTokenCount\":22},\"modelVersion\":\"gemini-2.5-flash-001\"}\n\n"
                    );
                    return Response::builder()
                        .header("content-type", "text/event-stream")
                        .body(axum::body::Body::from(sse))
                        .unwrap();
                }
                if body.pointer("/contents/0/parts/0/text").and_then(Value::as_str) == Some("drop-midstream") {
                    return Response::builder()
                        .header("content-type", "application/json")
                        .body(axum::body::Body::from("[{\"candidates\":[{\"index\":0,\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\"half\"}]}}]}"))
                        .unwrap();
                }
                if body.pointer("/contents/0/parts/0/text").and_then(Value::as_str) == Some("invalid-schema") {
                    return Response::builder()
                        .header("content-type", "application/json")
                        .body(axum::body::Body::from(
                            json!([{
                                "candidates": [{"index": 0, "content": {"role": "model", "parts": [{"text": "{\"wrong\":1}"}]}, "finishReason": "STOP"}],
                                "usageMetadata": {"promptTokenCount": 5, "candidatesTokenCount": 3, "totalTokenCount": 8},
                                "modelVersion": "gemini-2.5-flash-001"
                            }])
                            .to_string(),
                        ))
                        .unwrap();
                }
                Response::builder()
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(
                        json!([{
                            "candidates": [{"index": 0, "content": {"role": "model", "parts": [{"text": "{\"answer\":\"ok\"}"}]}, "finishReason": "STOP"}],
                            "usageMetadata": {"promptTokenCount": 6, "candidatesTokenCount": 3, "totalTokenCount": 9},
                            "modelVersion": "gemini-2.5-flash-001"
                        }])
                        .to_string(),
                    ))
                    .unwrap()
            }),
        )
        .into_make_service();

    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let task = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });

    let mut state = test_state(Some(format!("http://{address}/v1")), pool);
    {
        let config = Arc::make_mut(&mut state.config);
        let base = config.models["fast"].clone();
        let mut gemini = base;
        gemini.provider = "gemini".into();
        gemini.upstream_model = "gemini-2.5-flash".into();
        gemini.supports_generate_content = true;
        gemini.supports_generate_content_streaming = true;
        gemini.supports_tool_calls = true;
        gemini.supports_streaming_tool_calls = true;
        gemini.supports_structured_output = true;
        gemini.catalog.input_modalities = vec!["text".into(), "image".into()];
        gemini.catalog.supported_parameters = vec!["reasoning".into()];

        let mut priced = gemini.clone();
        priced.pricing = Some(crate::config::RoutePricing {
            currency: "USD".into(),
            api_prompt_rate: 1_000_000,
            api_completion_rate: 1_000_000,
            cash_prompt_rate: 1_000_000,
            cash_completion_rate: 1_000_000,
            max_input_tokens: 100_000,
            max_output_tokens: 1024,
        });
        config.models.insert("gemini".into(), gemini);
        config.models.insert("gemini-priced".into(), priced);
    }
    let organization = state.store.create_organization("gemini").await.unwrap();
    let scope = state
        .store
        .create_project(organization, "project")
        .await
        .unwrap();
    state.store.create_budget(scope, "USD", 100).await.unwrap();
    register_personal_route(&mut state, organization, "gemini").await;
    let key = state
        .store
        .issue_key(
            scope,
            "Gemini protocol key",
            &["gemini".into(), "gemini-priced".into()],
            3600,
        )
        .await
        .unwrap();
    let app = router(state);

    let rejected_goog = app
        .clone()
        .oneshot(
            Request::post("/v1beta/models/gemini:generateContent")
                .header("x-goog-api-key", &key.token)
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({"contents": [{"role": "user", "parts": [{"text": "hi"}]}]}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(rejected_goog.status(), StatusCode::UNAUTHORIZED);

    // 1. Buffered :generateContent with tools, toolConfig, thoughtSignature, thinkingConfig, unpriced inlineData, toolUsePromptTokenCount.
    let buf = app
        .clone()
        .oneshot(
            Request::post("/v1beta/models/gemini:generateContent")
                .header("x-niu-api-key", &key.token)
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({
                        "contents": [
                            {"role": "user", "parts": [{"text": "call lookup"}, {"inlineData": {"mimeType": "image/png", "data": "AAAA"}}]},
                            {"role": "model", "parts": [{"functionCall": {"name": "lookup", "args": {"q": "old"}}, "thoughtSignature": "sig-0"}]},
                            {"role": "user", "parts": [{"functionResponse": {"name": "lookup", "response": {"ok": true}}}]}
                        ],
                        "tools": [{"functionDeclarations": [{"name": "lookup", "parameters": {"type": "OBJECT", "properties": {"q": {"type": "STRING"}}}}]}],
                        "toolConfig": {"functionCallingConfig": {"mode": "ANY", "allowedFunctionNames": ["lookup"]}},
                        "generationConfig": {"thinkingConfig": {"includeThoughts": true, "thinkingBudget": 128}}
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(buf.status(), StatusCode::OK);
    let attempt_buf: Uuid = buf.headers()["x-niu-attempt-id"]
        .to_str()
        .unwrap()
        .parse()
        .unwrap();
    let buf_json: Value =
        serde_json::from_slice(&buf.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(buf_json["modelVersion"], "gemini");
    assert_eq!(
        buf_json["candidates"][0]["content"]["parts"][1]["thoughtSignature"],
        "sig-call"
    );
    let gen_buf = poll_generation(&app, &key.token, attempt_buf, |g| {
        g["execution"] == "confirmed_completed"
    })
    .await;
    assert_eq!(gen_buf["usage"]["prompt_tokens"], "16");
    assert_eq!(gen_buf["usage"]["completion_tokens"], "6");
    assert_eq!(gen_buf["usage"]["reasoning_output_tokens"], "2");
    assert_eq!(gen_buf["finish_reasons"][0]["reason"], "tool_calls");

    // 2. Streaming SSE (?alt=sse) preserves thoughtSignature and toolUsePromptTokenCount.
    let sse_res = app
        .clone()
        .oneshot(
            Request::post("/v1beta/models/gemini:streamGenerateContent?alt=sse")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({
                        "contents": [{"role": "user", "parts": [{"text": "sse call"}]}],
                        "tools": [{"functionDeclarations": [{"name": "lookup", "parametersJsonSchema": {"type": "object"}}]}]
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    let sse_status = sse_res.status();
    let sse_attempt_hdr = sse_res.headers().get("x-niu-attempt-id").cloned();
    let sse_bytes = sse_res.into_body().collect().await.unwrap().to_bytes();
    assert_eq!(
        sse_status,
        StatusCode::OK,
        "sse_res body: {}",
        String::from_utf8_lossy(&sse_bytes)
    );
    let attempt_sse: Uuid = sse_attempt_hdr
        .expect("x-niu-attempt-id")
        .to_str()
        .unwrap()
        .parse()
        .unwrap();
    let sse_text = String::from_utf8(sse_bytes.to_vec()).unwrap();
    assert!(sse_text.contains("sig-2"));
    assert!(sse_text.contains("\"modelVersion\":\"gemini\""));
    let gen_sse = poll_generation(&app, &key.token, attempt_sse, |g| {
        g["execution"] == "confirmed_completed"
    })
    .await;
    assert_eq!(gen_sse["usage"]["prompt_tokens"], "16");

    // 3. Default JSON array stream validates responseSchema & preserves failure uncertainty on drop.
    let json_ok = app
        .clone()
        .oneshot(
            Request::post("/v1beta/models/gemini:streamGenerateContent")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({
                        "contents": [{"role": "user", "parts": [{"text": "ok"}]}],
                        "generationConfig": {
                            "responseMimeType": "application/json",
                            "responseSchema": {"type": "OBJECT", "required": ["answer"], "properties": {"answer": {"type": "STRING"}}}
                        }
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(json_ok.status(), StatusCode::OK);
    let json_arr: Value =
        serde_json::from_slice(&json_ok.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(json_arr[0]["modelVersion"], "gemini");

    let json_invalid = app
        .clone()
        .oneshot(
            Request::post("/v1beta/models/gemini:streamGenerateContent")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({
                        "contents": [{"role": "user", "parts": [{"text": "invalid-schema"}]}],
                        "generationConfig": {
                            "responseMimeType": "application/json",
                            "responseSchema": {"type": "OBJECT", "required": ["answer"], "properties": {"answer": {"type": "STRING"}}}
                        }
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    let attempt_invalid: Uuid = json_invalid.headers()["x-niu-attempt-id"]
        .to_str()
        .unwrap()
        .parse()
        .unwrap();
    let collected_invalid = json_invalid.into_body().collect().await;
    assert!(collected_invalid.is_err());
    let gen_invalid = poll_generation(&app, &key.token, attempt_invalid, |g| {
        g["execution"] == "confirmed_completed"
    })
    .await;
    assert_eq!(gen_invalid["usage"]["prompt_tokens"], "5");

    let dropped = app
        .clone()
        .oneshot(
            Request::post("/v1beta/models/gemini:streamGenerateContent")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({"contents": [{"role": "user", "parts": [{"text": "drop-midstream"}]}]})
                        .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    let attempt_drop: Uuid = dropped.headers()["x-niu-attempt-id"]
        .to_str()
        .unwrap()
        .parse()
        .unwrap();
    assert!(dropped.into_body().collect().await.is_err());
    let gen_drop =
        poll_generation(&app, &key.token, attempt_drop, |g| !g["failure"].is_null()).await;
    assert_ne!(gen_drop["execution"], "confirmed_completed");
    assert_eq!(gen_drop["failure"]["kind"], "upstream_invalid_response");

    // 4. Reject ?key= and reject priced inlineData cleanly with 400.
    let q_key = app
        .clone()
        .oneshot(
            Request::post("/v1beta/models/gemini:generateContent?key=secret")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({"contents": [{"role": "user", "parts": [{"text": "hi"}]}]}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(q_key.status(), StatusCode::BAD_REQUEST);

    let priced_media = app
        .clone()
        .oneshot(
            Request::post("/v1beta/models/gemini-priced:generateContent")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({"contents": [{"role": "user", "parts": [{"inlineData": {"mimeType": "application/pdf", "data": "AAAA"}}]}]}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(priced_media.status(), StatusCode::BAD_REQUEST);

    task.abort();
}
