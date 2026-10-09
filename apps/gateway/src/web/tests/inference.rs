use super::*;
use axum::response::{IntoResponse, Response};

#[derive(Clone, Default)]
struct OpenRouterCaptured(Arc<Mutex<Vec<OpenRouterRequest>>>);

struct OpenRouterRequest {
    path: String,
    headers: HeaderMap,
    body: Value,
}

async fn openrouter_provider(
    State(captured): State<OpenRouterCaptured>,
    uri: axum::http::Uri,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Response {
    captured.0.lock().unwrap().push(OpenRouterRequest {
        path: uri.path().to_owned(),
        headers,
        body: body.clone(),
    });

    if body.pointer("/messages/0/content").and_then(Value::as_str) == Some("cancel-before-headers")
    {
        tokio::time::sleep(std::time::Duration::from_secs(10)).await;
    }

    if body.pointer("/messages/0/content").and_then(Value::as_str) == Some("trigger-upstream-error")
    {
        return (
            StatusCode::TOO_MANY_REQUESTS,
            Json(json!({"error":{"message":"private upstream failure detail"}})),
        )
            .into_response();
    }

    if body.get("stream") == Some(&json!(true)) {
        // OpenRouter can put usage on a final chunk that still has a choice.
        let events = [
            json!({
                "id":"openrouter-stream",
                "choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":null}]
            }),
            json!({
                "id":"openrouter-stream",
                "choices":[{"index":0,"delta":{},"finish_reason":"stop"}],
                "usage":{"prompt_tokens":7,"completion_tokens":2,"total_tokens":9,"cost":0.01,"cost_details":{"upstream_inference_cost":0.008},"is_byok":false}
            }),
        ];
        let mut payload = events
            .iter()
            .map(|event| format!("data: {event}\n\n"))
            .collect::<String>();
        payload.push_str("data: [DONE]\n\n");
        return Response::builder()
            .header("content-type", "text/event-stream")
            .body(axum::body::Body::from(payload))
            .unwrap();
    }

    let (message, finish_reason) = if body.get("response_format").is_some() {
        (
            json!({"role":"assistant","content":"{\"answer\":42}"}),
            "stop",
        )
    } else if let Some(name) = body
        .pointer("/tools/0/function/name")
        .and_then(Value::as_str)
    {
        (
            json!({
                "role":"assistant","content":null,"tool_calls":[{
                    "id":"call_openrouter_1","type":"function",
                    "function":{"name":name,"arguments":"{}"}
                }]
            }),
            "tool_calls",
        )
    } else {
        (json!({"role":"assistant","content":"ok"}), "stop")
    };
    Json(json!({
        "id":"openrouter-chat",
        "model":"openai/gpt-4.1-mini",
        "choices":[{"index":0,"message":message,"finish_reason":finish_reason}],
        "usage":{"prompt_tokens":5,"completion_tokens":2,"total_tokens":7,"cost":0.01,"cost_details":{"upstream_inference_cost":0.008},"is_byok":false}
    }))
    .into_response()
}

#[test]
fn chat_feature_contracts_validate_input_and_provider_output() {
    let mut config: crate::config::AppConfig = toml::from_str(
        r#"
                [models.fast]
                provider = "openai"
                upstream_model = "provider-model"
                api_key_env = "PROVIDER_KEY"
                supports_tool_calls = true
                supports_streaming_tool_calls = true
                supports_structured_output = true
            "#,
    )
    .unwrap();
    let model = config.models.get_mut("fast").unwrap();
    let tools = json!({
        "model": "fast",
        "messages": [{"role":"user","content":"Weather in Paris?"}],
        "tools": [{
            "type": "function",
            "function": {"name":"lookup_weather","parameters":{"type":"object"}}
        }],
        "tool_choice": {"type":"function","function":{"name":"lookup_weather"}}
    });
    assert!(validate_chat_capabilities(&tools, model, false).is_ok());
    assert!(validate_chat_capabilities(&tools, model, true).is_ok());

    let tool_response = json!({"choices":[{
        "message":{"role":"assistant","content":null,"tool_calls":[{
            "id":"call_weather_1","type":"function","function":{
                "name":"lookup_weather","arguments":"{\"city\":\"Paris\"}"
            }
        }]},"finish_reason":"tool_calls"
    }]});
    assert!(valid_chat_completion_features(&tool_response, &tools));

    let mut unknown_tool = tool_response.clone();
    unknown_tool["choices"][0]["message"]["tool_calls"][0]["function"]["name"] =
        json!("send_secret");
    assert!(!valid_chat_completion_features(&unknown_tool, &tools));
    let mut invalid_arguments = tool_response.clone();
    invalid_arguments["choices"][0]["message"]["tool_calls"][0]["function"]["arguments"] =
        json!("not-json");
    assert!(!valid_chat_completion_features(&invalid_arguments, &tools));

    let structured = json!({
        "model":"fast",
        "messages":[{"role":"user","content":"Return a JSON object"}],
        "response_format":{"type":"json_schema","json_schema":{
            "name":"answer","schema":{"type":"object","required":["answer"]},"strict":true
        }}
    });
    assert!(validate_chat_capabilities(&structured, model, false).is_ok());
    assert!(validate_chat_capabilities(&structured, model, true).is_err());
    assert!(valid_chat_completion_features(
        &json!({"choices":[{"message":{"content":"{\"answer\":42}"}}]}),
        &structured
    ));
    assert!(!valid_chat_completion_features(
        &json!({"choices":[{"message":{"content":"not-json"}}]}),
        &structured
    ));

    let duplicate_tools = json!({
        "model":"fast","messages":[{"role":"user","content":"hi"}],
        "tools":[
            {"type":"function","function":{"name":"same"}},
            {"type":"function","function":{"name":"same"}}
        ]
    });
    assert!(validate_chat_capabilities(&duplicate_tools, model, false).is_err());
    let unknown_choice = json!({
        "model":"fast","messages":[{"role":"user","content":"hi"}],
        "tools":[{"type":"function","function":{"name":"known"}}],
        "tool_choice":{"type":"function","function":{"name":"unknown"}}
    });
    assert!(validate_chat_capabilities(&unknown_choice, model, false).is_err());

    model.supports_tool_calls = false;
    assert!(validate_chat_capabilities(&tools, model, false).is_err());
    model.supports_tool_calls = true;
    model.supports_streaming_tool_calls = false;
    assert!(validate_chat_capabilities(&tools, model, true).is_err());
}

#[test]
fn responses_contract_bounds_text_inputs_and_validates_output_items() {
    let price = crate::config::RoutePricing {
        currency: "USD".into(),
        api_prompt_rate: 1_000_000,
        api_completion_rate: 1_000_000,
        cash_prompt_rate: 1_000_000,
        cash_completion_rate: 1_000_000,
        max_input_tokens: 20,
        max_output_tokens: 10,
    };
    let mut body = json!({
        "model":"fast","input":"hi","instructions":"Be terse",
        "temperature":0.5,"top_p":0.9,
        "metadata":{"source":"test"},"user":"account-1"
    });
    let bounds = validate_responses_request(&mut body, Some(&price)).unwrap();
    assert_eq!(bounds.input_bytes, 10);
    assert_eq!(bounds.max_output_tokens, Some(10));
    assert_eq!(body["max_output_tokens"], 10);

    let response = json!({
        "id":"resp_1","object":"response","status":"completed",
        "output":[
            {"id":"reasoning_1","type":"reasoning","summary":[]},
            {"id":"msg_1","type":"message","role":"assistant","content":[
                {"type":"output_text","text":"hello","annotations":[]}
            ]}
        ],
        "usage":{"input_tokens":3,"output_tokens":2,"total_tokens":5}
    });
    assert!(valid_responses_response(&response));
    assert_eq!(responses_usage(&response), Some((3, 2)));
    for invalid in [json!(6), json!(null), json!("5"), json!(-1), json!(5.5)] {
        let mut inconsistent = response.clone();
        inconsistent["usage"]["total_tokens"] = invalid;
        assert_eq!(responses_usage(&inconsistent), None);
    }
    let mut without_total = response.clone();
    without_total["usage"]
        .as_object_mut()
        .unwrap()
        .remove("total_tokens");
    assert_eq!(responses_usage(&without_total), Some((3, 2)));
    let mut invalid_output = response.clone();
    invalid_output["output"][0]["type"] = json!("function_call");
    assert!(!valid_responses_response(&invalid_output));
    let mut invalid_text = response.clone();
    invalid_text["output"][1]["content"][0]["text"] = json!(false);
    assert!(!valid_responses_response(&invalid_text));

    for invalid in [
        json!({"model":"fast","input":[{"role":"user","content":"hi"}]}),
        json!({"model":"fast","input":"hi","stream":true}),
        json!({"model":"fast","input":"hi","max_output_tokens":11}),
        json!({"model":"fast","input":"hi","tools":[]}),
        json!({"model":"fast","input":"hi","temperature":3}),
        json!({"model":"fast","input":"hi","metadata":{"bad":["value"]}}),
    ] {
        let mut invalid = invalid;
        assert!(
            validate_responses_request(&mut invalid, Some(&price)).is_err(),
            "accepted {invalid}"
        );
    }
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn tool_calls_require_route_opt_in_and_persist_provider_usage(pool: PgPool) {
    let captured = Captured::default();
    let upstream = Router::new()
        .route("/v1/chat/completions", post(tool_provider))
        .with_state(captured.clone());
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let task = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
    let mut state = test_state(Some(format!("http://{address}/v1")), pool.clone());
    let route = Arc::make_mut(&mut state.config)
        .models
        .get_mut("fast")
        .unwrap();
    route.supports_tool_calls = true;
    route.supports_structured_output = true;
    let organization = state.store.create_organization("tool calls").await.unwrap();
    let scope = state
        .store
        .create_project(organization, "project")
        .await
        .unwrap();
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
    let key = state
        .store
        .issue_key(scope, "client", &["fast".into()], 3600)
        .await
        .unwrap();
    let request = json!({
        "model":"fast",
        "messages":[{"role":"user","content":"What is the weather in Paris?"}],
        "tools":[{"type":"function","function":{
            "name":"lookup_weather","description":"Look up current weather",
            "parameters":{"type":"object","properties":{"city":{"type":"string"}},"required":["city"]}
        }}],
        "tool_choice":"required"
    });
    let invalid_niu_key = router(state.clone())
        .oneshot(
            Request::post("/v1/chat/completions")
                .header("x-niu-api-key", "niu-invalid-project-key")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(request.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(invalid_niu_key.status(), StatusCode::UNAUTHORIZED);

    let response = router(state.clone())
        .oneshot(
            Request::post("/v1/chat/completions")
                .header("x-niu-api-key", &key.token)
                // Provider auth remains a separate client credential. This
                // OpenAI-compatible route uses its configured upstream key.
                .header("authorization", "Bearer client-provider-session")
                .header("x-forwarded-for", "127.0.0.1")
                .header("x-client-secret", "must-not-reach-provider")
                .header("x-niu-log-payloads", "false")
                .header("content-type", "application/json")
                .body(axum::body::Body::from(request.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let attempt_id: Uuid = response.headers()["x-niu-attempt-id"]
        .to_str()
        .unwrap()
        .parse()
        .unwrap();
    let body: Value =
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(body["model"], "fast");
    assert_eq!(body["choices"][0]["finish_reason"], "tool_calls");
    assert_eq!(
        body["choices"][0]["message"]["tool_calls"][0]["function"]["name"],
        "lookup_weather"
    );

    let (headers, forwarded) = captured.0.lock().unwrap().take().unwrap();
    assert_eq!(headers["authorization"], "Bearer provider-secret-token");
    assert!(!headers.contains_key("x-niu-api-key"));
    assert!(!headers.contains_key("x-forwarded-for"));
    assert!(!headers.contains_key("x-client-secret"));
    assert_eq!(forwarded["model"], "provider-secret-model");
    assert_eq!(forwarded["tools"], request["tools"]);
    assert_eq!(forwarded["tool_choice"], "required");
    let attempt = state
        .store
        .attempt(scope, attempt_id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(attempt.execution, "confirmed_completed");
    assert_eq!(attempt.usage_confidence, "provider_reported");
    assert_eq!(
        state
            .store
            .request_finish_reasons(scope, attempt_id)
            .await
            .unwrap(),
        Some(vec![niu_storage::RequestChoiceFinish {
            index: 0,
            reason: niu_storage::RequestFinishReason::ToolCalls,
        }])
    );
    let payload_count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM request_payloads WHERE attempt_id=$1")
            .bind(attempt_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(payload_count, 0);

    assert_eq!(
        (attempt.prompt_tokens, attempt.completion_tokens),
        (Some(19), Some(8))
    );

    let structured_request = json!({
        "model":"fast",
        "messages":[{"role":"user","content":"Return the answer as JSON"}],
        "response_format":{"type":"json_schema","json_schema":{
            "name":"answer","schema":{"type":"object","required":["answer"]},"strict":true
        }}
    });
    let structured = router(state.clone())
        .oneshot(
            Request::post("/v1/chat/completions")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(structured_request.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(structured.status(), StatusCode::OK);
    let structured_attempt: Uuid = structured.headers()["x-niu-attempt-id"]
        .to_str()
        .unwrap()
        .parse()
        .unwrap();
    let structured_body: Value =
        serde_json::from_slice(&structured.into_body().collect().await.unwrap().to_bytes())
            .unwrap();
    assert_eq!(
        structured_body["choices"][0]["message"]["content"],
        "{\"answer\":42}"
    );
    let (_, forwarded_schema) = captured.0.lock().unwrap().take().unwrap();
    assert_eq!(forwarded_schema["model"], "provider-secret-model");
    assert_eq!(
        forwarded_schema["response_format"],
        structured_request["response_format"]
    );
    let structured_persisted = state
        .store
        .attempt(scope, structured_attempt)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(structured_persisted.execution, "confirmed_completed");
    assert_eq!(structured_persisted.prompt_tokens, Some(11));

    let mut malformed_schema_request = structured_request;
    malformed_schema_request["response_format"]["json_schema"]["name"] = json!("invalid");
    let malformed = router(state.clone())
        .oneshot(
            Request::post("/v1/chat/completions")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(malformed_schema_request.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(malformed.status(), StatusCode::BAD_GATEWAY);
    let unknown_attempts: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM attempts WHERE execution = 'may_have_executed' AND usage_confidence = 'unknown'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(unknown_attempts, 0);
    let (_, malformed_forwarded) = captured.0.lock().unwrap().take().unwrap();
    assert_eq!(
        malformed_forwarded["response_format"]["json_schema"]["name"],
        "invalid"
    );

    // Failed client delivery must not discard a terminal upstream completion
    // with valid usage. Execution evidence and delivery status are separate.
    let schema_mismatch = json!({
        "model":"fast","messages":[{"role":"user","content":"Return JSON"}],
        "response_format":{"type":"json_schema","json_schema":{
            "name":"typed_answer","schema":{"type":"object",
                "properties":{"answer":{"type":"string"}},"required":["answer"]},
            "strict":true
        }}
    });
    let mismatch = router(state.clone())
        .oneshot(
            Request::post("/v1/chat/completions")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(schema_mismatch.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(mismatch.status(), StatusCode::BAD_GATEWAY);
    let mismatch_attempt: Uuid = mismatch.headers()["x-niu-attempt-id"]
        .to_str()
        .unwrap()
        .parse()
        .unwrap();
    let persisted = state
        .store
        .attempt(scope, mismatch_attempt)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(persisted.execution, "confirmed_completed");
    assert_eq!(persisted.usage_confidence, "provider_reported");
    assert_eq!(
        (persisted.prompt_tokens, persisted.completion_tokens),
        (Some(11), Some(3))
    );
    let charged: i64 =
        sqlx::query_scalar("SELECT amount_nanos FROM customer_charges WHERE attempt_id=$1")
            .bind(mismatch_attempt)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(charged, 17);
    state
        .store
        .accrue_customer_charge(mismatch_attempt)
        .await
        .unwrap();
    let charges: i64 =
        sqlx::query_scalar("SELECT count(*) FROM customer_charges WHERE attempt_id=$1")
            .bind(mismatch_attempt)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(charges, 1);
    assert!(captured.0.lock().unwrap().take().is_some());

    for name in ["usage_missing", "usage_inconsistent", "usage_overflow"] {
        let mut incomplete = schema_mismatch.clone();
        incomplete["response_format"]["json_schema"]["name"] = json!(name);
        let rejected = router(state.clone())
            .oneshot(
                Request::post("/v1/chat/completions")
                    .header("authorization", format!("Bearer {}", key.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(incomplete.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(rejected.status(), StatusCode::BAD_GATEWAY);
        let attempt: Uuid = rejected.headers()["x-niu-attempt-id"]
            .to_str()
            .unwrap()
            .parse()
            .unwrap();
        let saved = state.store.attempt(scope, attempt).await.unwrap().unwrap();
        assert_eq!(saved.execution, "may_have_executed");
        assert_eq!(saved.usage_confidence, "unknown");
        assert_eq!((saved.prompt_tokens, saved.completion_tokens), (None, None));
        let charges: i64 =
            sqlx::query_scalar("SELECT count(*) FROM customer_charges WHERE attempt_id=$1")
                .bind(attempt)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(charges, 0);
        assert!(captured.0.lock().unwrap().take().is_some());
    }

    for invalid_schema in [
        json!({"type":"invalid"}),
        json!({"$ref":"http://127.0.0.1:9/private"}),
        json!({"$ref":"file:///private/schema.json"}),
    ] {
        let mut invalid = schema_mismatch.clone();
        invalid["response_format"]["json_schema"]["schema"] = invalid_schema;
        let rejected = router(state.clone())
            .oneshot(
                Request::post("/v1/chat/completions")
                    .header("authorization", format!("Bearer {}", key.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(invalid.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(rejected.status(), StatusCode::BAD_REQUEST);
        assert!(rejected.headers().get("x-niu-attempt-id").is_none());
        assert!(captured.0.lock().unwrap().is_none());
    }

    Arc::make_mut(&mut state.config)
        .models
        .get_mut("fast")
        .unwrap()
        .supports_tool_calls = false;
    let gated = router(state.clone())
        .oneshot(
            Request::post("/v1/chat/completions")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(request.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(gated.status(), StatusCode::NOT_IMPLEMENTED);
    let attempts: i64 = sqlx::query_scalar("SELECT count(*) FROM attempts")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(attempts, 7);
    assert!(captured.0.lock().unwrap().is_none());
    task.abort();
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn streaming_tool_deltas_preserve_wire_bytes_and_terminal_usage(pool: PgPool) {
    let captured = Captured::default();
    let upstream = Router::new()
        .route("/v1/chat/completions", post(streaming_tool_provider))
        .with_state(captured.clone());
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let task = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
    let mut state = test_state(Some(format!("http://{address}/v1")), pool.clone());
    let route = Arc::make_mut(&mut state.config)
        .models
        .get_mut("fast")
        .unwrap();
    route.supports_tool_calls = true;
    route.supports_streaming_tool_calls = true;
    let organization = state
        .store
        .create_organization("streaming tools")
        .await
        .unwrap();
    let scope = state
        .store
        .create_project(organization, "project")
        .await
        .unwrap();
    let key = state
        .store
        .issue_key(scope, "client", &["fast".into()], 3600)
        .await
        .unwrap();
    let request = json!({
        "model":"fast","stream":true,"stream_options":{"include_usage":true},
        "messages":[{"role":"user","content":"What is the weather in Paris?"}],
        "tools":[{"type":"function","function":{
            "name":"lookup_weather","parameters":{"type":"object"}
        }}],
        "tool_choice":"required",
        "reasoning":{"effort":"high","exclude":true}
    });
    let response = router(state.clone())
        .oneshot(
            Request::post("/v1/chat/completions")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .header("x-niu-log-payloads", "false")
                .body(axum::body::Body::from(request.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()["content-type"], "text/event-stream");
    let attempt_id: Uuid = response.headers()["x-niu-attempt-id"]
        .to_str()
        .unwrap()
        .parse()
        .unwrap();
    let output = response.into_body().collect().await.unwrap().to_bytes();
    assert_eq!(output.as_ref(), tool_stream_payload().as_slice());

    let (headers, forwarded) = captured.0.lock().unwrap().take().unwrap();
    assert_eq!(headers["authorization"], "Bearer provider-secret-token");
    assert_eq!(forwarded["model"], "provider-secret-model");
    assert_eq!(forwarded["tools"], request["tools"]);
    assert_eq!(forwarded["reasoning"], request["reasoning"]);
    assert_eq!(forwarded["stream_options"]["include_usage"], true);
    let attempt = state
        .store
        .attempt(scope, attempt_id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(attempt.execution, "confirmed_completed");
    assert_eq!(attempt.usage_confidence, "provider_reported");
    assert_eq!(
        (attempt.prompt_tokens, attempt.completion_tokens),
        (Some(19), Some(8))
    );
    assert_eq!(
        state
            .store
            .request_finish_reasons(scope, attempt_id)
            .await
            .unwrap(),
        Some(vec![niu_storage::RequestChoiceFinish {
            index: 0,
            reason: niu_storage::RequestFinishReason::ToolCalls
        }])
    );
    let payload_count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM request_payloads WHERE attempt_id=$1")
            .bind(attempt_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(payload_count, 0);
    task.abort();
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn openrouter_uses_compatible_chat_route_and_preserves_openrouter_usage_streams(
    pool: PgPool,
) {
    let captured = OpenRouterCaptured::default();
    let upstream = Router::new()
        .route("/api/v1/chat/completions", post(openrouter_provider))
        .with_state(captured.clone());
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let task = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });

    let mut state = test_state(None, pool.clone());
    let model = Arc::make_mut(&mut state.config)
        .models
        .get_mut("fast")
        .unwrap();
    model.provider = "openrouter".into();
    model.upstream_model = "openai/gpt-4.1-mini".into();
    model.api_key_env = "OPENROUTER_API_KEY".into();
    model.api_base = Some(format!("http://{address}/api/v1"));
    model.supports_tool_calls = true;
    model.supports_streaming_tool_calls = true;
    model.supports_structured_output = true;

    let organization = state.store.create_organization("openrouter").await.unwrap();
    let scope = state
        .store
        .create_project(organization, "project")
        .await
        .unwrap();
    let key = state
        .store
        .issue_key(scope, "client", &["fast".into()], 3600)
        .await
        .unwrap();

    let tools_request = json!({
        "model":"fast",
        "messages":[{"role":"user","content":"Look up the weather"}],
        "tools":[{"type":"function","function":{
            "name":"lookup_weather","parameters":{"type":"object","properties":{}}
        }}],
        "tool_choice":"required"
    });
    let tool_response = router(state.clone())
        .oneshot(
            Request::post("/v1/chat/completions")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(tools_request.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(tool_response.status(), StatusCode::OK);
    let tool_body: Value = serde_json::from_slice(
        &tool_response
            .into_body()
            .collect()
            .await
            .unwrap()
            .to_bytes(),
    )
    .unwrap();
    assert_eq!(tool_body["model"], "fast");
    assert!(tool_body["usage"].get("cost").is_none());
    assert!(tool_body["usage"].get("cost_details").is_none());
    assert!(tool_body["usage"].get("is_byok").is_none());
    assert_eq!(tool_body["choices"][0]["finish_reason"], "tool_calls");
    {
        let requests = captured.0.lock().unwrap();
        assert_eq!(requests[0].path, "/api/v1/chat/completions");
        assert_eq!(
            requests[0].headers["authorization"],
            "Bearer openrouter-test-key-only"
        );
        assert_eq!(requests[0].body["model"], "openai/gpt-4.1-mini");
        assert_eq!(requests[0].body["tools"], tools_request["tools"]);
        assert_eq!(requests[0].body["tool_choice"], "required");
    }

    let structured_request = json!({
        "model":"fast",
        "messages":[{"role":"user","content":"Return JSON"}],
        "response_format":{"type":"json_schema","json_schema":{
            "name":"answer","schema":{"type":"object","required":["answer"]},"strict":true
        }}
    });
    let structured_response = router(state.clone())
        .oneshot(
            Request::post("/v1/chat/completions")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(structured_request.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(structured_response.status(), StatusCode::OK);
    let structured_body: Value = serde_json::from_slice(
        &structured_response
            .into_body()
            .collect()
            .await
            .unwrap()
            .to_bytes(),
    )
    .unwrap();
    assert_eq!(
        structured_body["choices"][0]["message"]["content"],
        "{\"answer\":42}"
    );
    assert_eq!(
        captured.0.lock().unwrap()[1].body["response_format"],
        structured_request["response_format"]
    );

    let stream_request = json!({
        "model":"fast","stream":true,
        "messages":[{"role":"user","content":"Stream a short answer"}]
    });
    let stream_response = router(state.clone())
        .oneshot(
            Request::post("/v1/chat/completions")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(stream_request.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(stream_response.status(), StatusCode::OK);
    let stream_attempt: Uuid = stream_response.headers()["x-niu-attempt-id"]
        .to_str()
        .unwrap()
        .parse()
        .unwrap();
    let stream_body = stream_response
        .into_body()
        .collect()
        .await
        .unwrap()
        .to_bytes();
    let stream_body = String::from_utf8(stream_body.to_vec()).unwrap();
    assert!(stream_body.contains("\"finish_reason\":\"stop\""));
    assert!(stream_body.contains("\"prompt_tokens\":7"));
    assert!(!stream_body.contains("cost_details"));
    assert!(!stream_body.contains("is_byok"));
    assert!(!stream_body.contains("\"cost\""));
    assert!(
        stream_body.contains("\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"stop\"}]")
    );
    let stream_attempt = state
        .store
        .attempt(scope, stream_attempt)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(stream_attempt.execution, "confirmed_completed");
    assert_eq!(stream_attempt.usage_confidence, "provider_reported");
    assert_eq!(
        (
            stream_attempt.prompt_tokens,
            stream_attempt.completion_tokens
        ),
        (Some(7), Some(2))
    );
    assert_eq!(
        captured.0.lock().unwrap()[2].path,
        "/api/v1/chat/completions"
    );

    let error_response = router(state.clone())
        .oneshot(
            Request::post("/v1/chat/completions")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({
                        "model":"fast",
                        "messages":[{"role":"user","content":"trigger-upstream-error"}]
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(error_response.status(), StatusCode::BAD_GATEWAY);
    let error_body = error_response
        .into_body()
        .collect()
        .await
        .unwrap()
        .to_bytes();
    let error_body = String::from_utf8(error_body.to_vec()).unwrap();
    assert!(!error_body.contains("private upstream failure detail"));
    assert!(!error_body.contains("openrouter-test-key-only"));
    assert_eq!(captured.0.lock().unwrap().len(), 4);
    task.abort();
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn responses_interruptions_persist_without_payloads(pool: PgPool) {
    let upstream = Router::new()
        .route("/v1/responses", post(responses_provider))
        .with_state(Captured::default());
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let task = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
    let mut state = test_state(Some(format!("http://{address}/v1")), pool.clone());
    Arc::make_mut(&mut state.config)
        .models
        .get_mut("fast")
        .unwrap()
        .supports_responses = true;
    let organization = state
        .store
        .create_organization("Responses interruptions")
        .await
        .unwrap();
    let scope = state
        .store
        .create_project(organization, "Diagnosis")
        .await
        .unwrap();
    let key = state
        .store
        .issue_key(scope, "Client", &["fast".into()], 3600)
        .await
        .unwrap();
    for (input, reason) in [
        ("limited", niu_storage::RequestFinishReason::Length),
        ("filtered", niu_storage::RequestFinishReason::ContentFilter),
    ] {
        let response = router(state.clone())
            .oneshot(
                Request::post("/v1/responses")
                    .header("authorization", format!("Bearer {}", key.token))
                    .header("content-type", "application/json")
                    .header("x-niu-log-payloads", "false")
                    .body(axum::body::Body::from(
                        json!({"model":"fast","input":input}).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let attempt: Uuid = response.headers()["x-niu-attempt-id"]
            .to_str()
            .unwrap()
            .parse()
            .unwrap();
        let body: Value =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        assert_eq!(body["status"], "incomplete");
        let reopened = niu_storage::Store::from_pool(pool.clone());
        assert_eq!(
            reopened
                .request_finish_reasons(scope, attempt)
                .await
                .unwrap(),
            Some(vec![niu_storage::RequestChoiceFinish { index: 0, reason }])
        );
        let payloads: i64 =
            sqlx::query_scalar("SELECT count(*) FROM request_payloads WHERE attempt_id=$1")
                .bind(attempt)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(payloads, 0);
    }
    task.abort();
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn responses_are_opt_in_text_only_and_persist_reported_usage(pool: PgPool) {
    let captured = Captured::default();
    let upstream = Router::new()
        .route("/v1/responses", post(responses_provider))
        .with_state(captured.clone());
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let task = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
    let mut state = test_state(Some(format!("http://{address}/v1")), pool.clone());
    let route = Arc::make_mut(&mut state.config)
        .models
        .get_mut("fast")
        .unwrap();
    route.supports_responses = true;
    route.pricing = Some(crate::config::RoutePricing {
        currency: "USD".into(),
        api_prompt_rate: 1_000_000,
        api_completion_rate: 1_000_000,
        cash_prompt_rate: 1_000_000,
        cash_completion_rate: 1_000_000,
        max_input_tokens: 32,
        max_output_tokens: 10,
    });
    let organization = state.store.create_organization("responses").await.unwrap();
    let scope = state
        .store
        .create_project(organization, "project")
        .await
        .unwrap();
    state.store.create_budget(scope, "USD", 100).await.unwrap();
    let key = state
        .store
        .issue_key(scope, "client", &["fast".into()], 3600)
        .await
        .unwrap();
    let request = json!({
        "model":"fast","input":"hi","instructions":"Be helpful",
        "metadata":{"source":"integration-test"}
    });
    let response = router(state.clone())
        .oneshot(
            Request::post("/v1/responses")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(request.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let attempt_id: Uuid = response.headers()["x-niu-attempt-id"]
        .to_str()
        .unwrap()
        .parse()
        .unwrap();
    let body: Value =
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(body["model"], "fast");
    assert_eq!(
        body["output"][0]["content"][0]["text"],
        "Hello from Responses"
    );
    assert_eq!(body["usage"]["input_tokens"], 4);
    let (headers, forwarded) = captured.0.lock().unwrap().take().unwrap();
    assert_eq!(headers["authorization"], "Bearer provider-secret-token");
    assert_eq!(forwarded["model"], "provider-secret-model");
    assert_eq!(forwarded["input"], "hi");
    assert_eq!(forwarded["max_output_tokens"], 10);
    let attempt = state
        .store
        .attempt(scope, attempt_id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(attempt.execution, "confirmed_completed");
    assert_eq!(attempt.usage_confidence, "provider_reported");
    assert_eq!(
        (attempt.prompt_tokens, attempt.completion_tokens),
        (Some(4), Some(2))
    );
    let categories: (Option<i64>, Option<i64>) = sqlx::query_as(
        "SELECT cached_input_tokens,reasoning_output_tokens FROM request_token_categories WHERE attempt_id=$1",
    ).bind(attempt_id).fetch_one(&pool).await.unwrap();
    assert_eq!(categories, (Some(3), Some(0)));
    let budget = state.store.budget(scope).await.unwrap().unwrap();
    assert_eq!((budget.spent_nanos, budget.reserved_nanos), (6, 0));

    let inconsistent = router(state.clone())
        .oneshot(
            Request::post("/v1/responses")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({"model":"fast","input":"bad-usage"}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(inconsistent.status(), StatusCode::OK);
    let inconsistent_id: Uuid = inconsistent.headers()["x-niu-attempt-id"]
        .to_str()
        .unwrap()
        .parse()
        .unwrap();
    let _ = inconsistent.into_body().collect().await.unwrap();
    let unknown = state
        .store
        .attempt(scope, inconsistent_id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(unknown.execution, "confirmed_completed");
    assert_eq!(unknown.usage_confidence, "unknown");
    assert_eq!(
        (unknown.prompt_tokens, unknown.completion_tokens),
        (None, None)
    );
    assert_eq!(
        state
            .store
            .cost_entries(scope, None, 100)
            .await
            .unwrap()
            .len(),
        1
    );
    captured.0.lock().unwrap().take().unwrap();

    let invalid_output = router(state.clone())
        .oneshot(
            Request::post("/v1/responses")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({"model":"fast","input":"broken"}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(invalid_output.status(), StatusCode::BAD_GATEWAY);
    let malformed_attempt: Uuid = invalid_output.headers()["x-niu-attempt-id"]
        .to_str()
        .unwrap()
        .parse()
        .unwrap();
    let unresolved = state
        .store
        .attempt(scope, malformed_attempt)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(unresolved.execution, "may_have_executed");
    assert_eq!(unresolved.usage_confidence, "unknown");
    let (_, malformed_forwarded) = captured.0.lock().unwrap().take().unwrap();
    assert_eq!(malformed_forwarded["input"], "broken");

    let streaming = router(state.clone())
        .oneshot(
            Request::post("/v1/responses")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({"model":"fast","input":"hi","stream":true}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(streaming.status(), StatusCode::NOT_IMPLEMENTED);
    assert!(streaming.headers().get("x-niu-attempt-id").is_none());
    let rejection: Value =
        serde_json::from_slice(&streaming.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(rejection["error"]["type"], "unsupported_operation_error");
    assert!(
        rejection["error"]["message"]
            .as_str()
            .unwrap()
            .contains("Chat streaming")
    );
    assert!(
        captured.0.lock().unwrap().is_none(),
        "rejected streaming must not dispatch"
    );
    let category_count: i64 = sqlx::query_scalar("SELECT count(*) FROM request_token_categories")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(
        category_count, 1,
        "malformed and rejected requests must not create categories"
    );
    Arc::make_mut(&mut state.config)
        .models
        .get_mut("fast")
        .unwrap()
        .supports_responses = false;
    let disabled = router(state.clone())
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
    assert_eq!(disabled.status(), StatusCode::NOT_IMPLEMENTED);
    let attempts: i64 = sqlx::query_scalar("SELECT count(*) FROM attempts")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(attempts, 3);
    task.abort();
}

#[test]
fn embedding_request_validation_rejects_unsupported_shapes() {
    for body in [
        json!({"model":"fast"}),
        json!({"model":"fast","input":[]}),
        json!({"model":"fast","input":["hello",[1,2,3]]}),
        json!({"model":"fast","input":"hello","encoding_format":"binary"}),
        json!({"model":"fast","input":"hello","dimensions":0}),
        json!({"model":"fast","input":"hello","stream":true}),
    ] {
        assert!(
            validate_embedding_request(&body).is_err(),
            "accepted {body}"
        );
    }
    let bounds = validate_embedding_request(&json!({
        "model":"fast","input":["hello","你好"],"dimensions":3,"encoding_format":"float"
    }))
    .unwrap();
    assert_eq!(bounds.item_count, 2);
    assert_eq!(bounds.utf8_bytes, 11);
    assert_eq!(bounds.dimensions, Some(3));
    assert_eq!(bounds.encoding_format, "float");
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn embeddings_use_scoped_admission_and_settle_input_usage(pool: PgPool) {
    let captured = Captured::default();
    let upstream = Router::new()
        .route("/v1/embeddings", post(embedding_provider))
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
        api_prompt_rate: 3_000_000,
        api_completion_rate: 4_000_000,
        cash_prompt_rate: 1_000_000,
        cash_completion_rate: 2_000_000,
        max_input_tokens: 10,
        max_output_tokens: 8,
    });
    let org = state.store.create_organization("embeddings").await.unwrap();
    let scope = state.store.create_project(org, "embeddings").await.unwrap();
    state.store.create_budget(scope, "USD", 20).await.unwrap();
    let key = state
        .store
        .issue_key(scope, "client", &["fast".into()], 3600)
        .await
        .unwrap();
    let app = router(state.clone());
    let response = app
        .clone()
        .clone()
        .oneshot(
            Request::post("/v1/embeddings")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({"model":"fast","input":"hello","dimensions":2}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let attempt_id: Uuid = response.headers()["x-niu-attempt-id"]
        .to_str()
        .unwrap()
        .parse()
        .unwrap();
    let output: Value =
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(output["model"], "fast");
    assert_eq!(output["data"][0]["embedding"], json!([0.1, 0.1]));
    assert_eq!(output["usage"]["prompt_tokens"], 5);

    let (headers, upstream_body) = captured.0.lock().unwrap().take().unwrap();
    assert_eq!(headers["authorization"], "Bearer provider-secret-token");
    assert_eq!(upstream_body["model"], "provider-secret-model");
    assert_eq!(upstream_body["input"], "hello");
    assert_eq!(upstream_body["dimensions"], 2);

    let batch = app
        .oneshot(
            Request::post("/v1/embeddings")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({
                        "model":"fast",
                        "input":["hi", "there"],
                        "encoding_format":"base64"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(batch.status(), StatusCode::OK);
    let batch_output: Value =
        serde_json::from_slice(&batch.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(batch_output["data"].as_array().unwrap().len(), 2);
    assert_eq!(batch_output["data"][1]["index"], 1);
    assert_eq!(batch_output["data"][1]["embedding"], "AA==");
    let (_, batch_body) = captured.0.lock().unwrap().take().unwrap();
    assert_eq!(batch_body["input"], json!(["hi", "there"]));
    assert_eq!(batch_body["encoding_format"], "base64");

    let attempt = state
        .store
        .attempt(scope, attempt_id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(attempt.execution, "confirmed_completed");
    assert_eq!(attempt.usage_confidence, "provider_reported");
    assert_eq!(
        (attempt.prompt_tokens, attempt.completion_tokens),
        (Some(5), Some(0))
    );
    let budget = state.store.budget(scope).await.unwrap().unwrap();
    assert_eq!((budget.spent_nanos, budget.reserved_nanos), (10, 0));
    let entries = state.store.cost_entries(scope, None, 10).await.unwrap();
    assert_eq!(entries.len(), 2);
    assert!(entries.iter().all(|entry| {
        (entry.cash_nanos, entry.api_equivalent_nanos) == (5, 15)
            && (entry.usage_prompt_tokens, entry.usage_completion_tokens) == (5, 0)
    }));
    let inconsistent = router(state.clone())
        .oneshot(
            Request::post("/v1/embeddings")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({"model":"fast","input":"bad"}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(inconsistent.status(), StatusCode::OK);
    let inconsistent_id: Uuid = inconsistent.headers()["x-niu-attempt-id"]
        .to_str()
        .unwrap()
        .parse()
        .unwrap();
    let _ = inconsistent.into_body().collect().await.unwrap();
    let unknown = state
        .store
        .attempt(scope, inconsistent_id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(unknown.execution, "confirmed_completed");
    assert_eq!(unknown.usage_confidence, "unknown");
    assert_eq!(
        (unknown.prompt_tokens, unknown.completion_tokens),
        (None, None)
    );
    let budget = state.store.budget(scope).await.unwrap().unwrap();
    assert_eq!((budget.spent_nanos, budget.reserved_nanos), (10, 10));
    assert_eq!(
        state
            .store
            .cost_entries(scope, None, 100)
            .await
            .unwrap()
            .len(),
        2
    );
    task.abort();
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn embeddings_require_declared_openai_capability_before_creating_attempt(pool: PgPool) {
    let mut state = test_state(None, pool.clone());
    Arc::make_mut(&mut state.config)
        .models
        .get_mut("fast")
        .unwrap()
        .supports_embeddings = false;
    let org = state
        .store
        .create_organization("unsupported embeddings")
        .await
        .unwrap();
    let scope = state
        .store
        .create_project(org, "unsupported")
        .await
        .unwrap();
    let key = state
        .store
        .issue_key(scope, "client", &["fast".into()], 3600)
        .await
        .unwrap();
    let response = router(state.clone())
        .oneshot(
            Request::post("/v1/embeddings")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({"model":"fast","input":"hello"}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::NOT_IMPLEMENTED);
    {
        let route = Arc::make_mut(&mut state.config)
            .models
            .get_mut("fast")
            .unwrap();
        route.supports_embeddings = true;
        route.supports_embedding_dimensions = false;
    }
    let unsupported_dimensions = router(state.clone())
        .oneshot(
            Request::post("/v1/embeddings")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({"model":"fast","input":"hello","dimensions":2}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(unsupported_dimensions.status(), StatusCode::NOT_IMPLEMENTED);
    {
        let route = Arc::make_mut(&mut state.config)
            .models
            .get_mut("fast")
            .unwrap();
        route.supports_embedding_dimensions = true;
        route.supports_embedding_base64 = false;
    }
    let unsupported_encoding = router(state.clone())
        .oneshot(
            Request::post("/v1/embeddings")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({"model":"fast","input":"hello","encoding_format":"base64"}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(unsupported_encoding.status(), StatusCode::NOT_IMPLEMENTED);
    {
        let route = Arc::make_mut(&mut state.config)
            .models
            .get_mut("fast")
            .unwrap();
        route.supports_embedding_base64 = true;
        route.provider = "anthropic".into();
    }
    let unsupported_provider = router(state.clone())
        .oneshot(
            Request::post("/v1/embeddings")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({"model":"fast","input":"hello"}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(unsupported_provider.status(), StatusCode::NOT_IMPLEMENTED);
    assert_eq!(state.requests.load(std::sync::atomic::Ordering::Relaxed), 0);
    let operations: i64 = sqlx::query_scalar("SELECT count(*) FROM operations")
        .fetch_one(&pool)
        .await
        .unwrap();
    let attempts: i64 = sqlx::query_scalar("SELECT count(*) FROM attempts")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!((operations, attempts), (0, 0));
}

#[tokio::test]
async fn model_routes_require_a_valid_client_token() {
    let response = router(test_state(
        None,
        sqlx::postgres::PgPoolOptions::new()
            .connect_lazy("postgres://localhost/unused")
            .unwrap(),
    ))
    .oneshot(
        Request::get("/v1/models")
            .body(axum::body::Body::empty())
            .unwrap(),
    )
    .await
    .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn chat_uses_server_routing_and_credentials_not_client_control_fields(pool: sqlx::PgPool) {
    let captured = Captured::default();
    let upstream = Router::new()
        .route("/v1/chat/completions", post(provider))
        .with_state(captured.clone());
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });

    let state = test_state(Some(format!("http://{address}/v1")), pool.clone());
    let org = state.store.create_organization("test").await.unwrap();
    let scope = state.store.create_project(org, "test").await.unwrap();
    let key = state
        .store
        .issue_key(scope, "client", &["fast".into()], 3600)
        .await
        .unwrap();
    let app = router(state.clone());
    let body = json!({
        "model": "fast",
        "messages": [{"role": "user", "content": "hello"}],
        "api_key": "attacker-key",
        "API_BASE": "https://attacker.example/",
        "extra_headers": {"Authorization": "Bearer attacker-key"},
        "temperature": 0.2,
        "reasoning_effort": "low"
    });
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

    let attempt_id: uuid::Uuid = response.headers()["x-niu-attempt-id"]
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
    assert_eq!(attempt.execution, "confirmed_completed");
    assert_eq!(attempt.prompt_tokens, Some(2));
    assert_eq!(attempt.completion_tokens, Some(1));
    assert_eq!(attempt.provider_model.as_deref(), Some("provider-model"));
    assert_eq!(attempt.settlement, "unresolved");
    // Simple inference must not require observability imports, subscriptions,
    // or an opt-in budget/pricing setup.
    let imports: i64 = sqlx::query_scalar("SELECT count(*) FROM execution_imports")
        .fetch_one(&pool)
        .await
        .unwrap();
    let accounts: i64 = sqlx::query_scalar("SELECT count(*) FROM supplier_accounts")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!((imports, accounts), (0, 0));
    assert!(state.store.budget(scope).await.unwrap().is_none());

    let status = response.status();
    let payload = response.into_body().collect().await.unwrap().to_bytes();
    let payload_text = String::from_utf8_lossy(&payload);
    let captured_request = captured.0.lock().unwrap().clone();
    assert_eq!(
        status,
        StatusCode::OK,
        "response={payload_text}; upstream={captured_request:?}"
    );
    let payload: Value = serde_json::from_slice(&payload).unwrap();
    assert_eq!(payload["model"], "fast");
    assert_eq!(payload["id"], "upstream-id");
    let usage = state.usage.snapshot();
    assert_eq!(usage.attempts_provider_reported, 1);
    assert_eq!(usage.attempts_unknown, 0);
    assert_eq!((usage.prompt_tokens, usage.completion_tokens), (2, 1));

    let (headers, sent_body) = captured_request.expect("provider called");
    assert_eq!(
        headers.get("authorization").unwrap(),
        "Bearer provider-secret-token"
    );
    assert_eq!(sent_body["model"], "provider-secret-model");
    assert_eq!(sent_body["temperature"], 0.2);
    assert_eq!(sent_body["reasoning_effort"], "low");
    assert!(sent_body.get("api_key").is_none());
    assert!(sent_body.get("API_BASE").is_none());
    assert!(sent_body.get("extra_headers").is_none());
    state.store.revoke_key(scope, key.id).await.unwrap();
    *captured.0.lock().unwrap() = None;
    let revoked = app
        .oneshot(
            Request::post("/v1/chat/completions")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(revoked.status(), StatusCode::UNAUTHORIZED);
    assert!(captured.0.lock().unwrap().is_none());
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn dashboard_chat_requires_authorization_and_active_scoped_key(pool: PgPool) {
    let state = test_state(None, pool);
    let scope = state.store.default_workspace().await.unwrap();
    let key = state
        .store
        .issue_key(scope, "Chat", &["fast".into()], 3600)
        .await
        .unwrap();
    let other = state
        .store
        .create_project(scope.organization_id, "Other")
        .await
        .unwrap();
    let app = router(state.clone());
    let path = format!(
        "/admin/v1/organizations/{}/projects/{}/keys/{}/chat/completions",
        scope.organization_id, scope.project_id, key.id
    );
    for (auth, route, model, expected) in [
        (
            "Bearer invalid",
            path.clone(),
            "fast",
            StatusCode::UNAUTHORIZED,
        ),
        (
            "Bearer niu-test-admin-token-that-is-long-1234",
            path.clone(),
            "not-allowed",
            StatusCode::NOT_FOUND,
        ),
        (
            "Bearer niu-test-admin-token-that-is-long-1234",
            format!(
                "/admin/v1/organizations/{}/projects/{}/keys/{}/chat/completions",
                scope.organization_id, other.project_id, key.id
            ),
            "fast",
            StatusCode::UNAUTHORIZED,
        ),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(route)
                    .header("authorization", auth)
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(
                        json!({"model":model,"messages":[{"role":"user","content":"test"}]})
                            .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
    }
    state.store.revoke_key(scope, key.id).await.unwrap();
    assert!(state.store.dashboard_key(scope, key.id).await.is_err());
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn chat_session_api_persists_content_and_requires_authentication(pool: PgPool) {
    let state = test_state(None, pool);
    let scope = state.store.default_workspace().await.unwrap();
    let app = router(state.clone());
    let base = format!(
        "/admin/v1/organizations/{}/projects/{}/chat-sessions",
        scope.organization_id, scope.project_id
    );
    let id = Uuid::new_v4();
    let payload = json!({"id":id,"prompt":"Hello","results":[{"model":"fast","content":"Hi","elapsedMs":10,"phase":"complete","apiKey":"must-not-store"}],"createdAt":1,"token":"must-not-store","settings":{"temperature":0.7,"logPayloads":false,"authorization":"must-not-store"},"attachments":[{"name":"note.txt","type":"text","content":"Example","token":"must-not-store"}]});
    let mut payload = payload;
    for field in [
        "cashNanos",
        "apiEquivalentNanos",
        "currency",
        "customerChargeNanos",
        "customerChargeCurrency",
        "customerChargeStatus",
    ] {
        payload["results"][0][field] = json!("must-not-store");
    }
    payload["turns"] = json!([
        {"prompt":"First turn","token":"must-not-store","attachments":[{"name":"first.txt","type":"text","content":"First context","token":"must-not-store"}],"results":[{"model":"fast","content":"First reply","elapsedMs":10,"phase":"complete","apiKey":"must-not-store"}]},
        {"prompt":"Follow-up","results":[{"model":"fast","content":"Second reply","elapsedMs":20,"phase":"complete"},{"model":"other","content":"Another branch","elapsedMs":30,"phase":"complete"}]}
    ]);
    payload["turns"][0]["results"][0]["cashNanos"] = json!("must-not-store");
    payload["turns"][1]["results"][0]["customerChargeNanos"] = json!("must-not-store");
    for (auth, expected) in [
        ("Bearer invalid", StatusCode::UNAUTHORIZED),
        (
            "Bearer niu-test-admin-token-that-is-long-1234",
            StatusCode::OK,
        ),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("PUT")
                    .uri(format!("{base}/{id}"))
                    .header("authorization", auth)
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(payload.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
    }
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(&base)
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
    assert_eq!(body["data"][0]["prompt"], "Hello");
    assert!(body["data"][0].get("token").is_none());
    assert!(!body.to_string().contains("must-not-store"));
    for (token, expected) in [
        ("invalid", StatusCode::UNAUTHORIZED),
        (
            "niu-test-admin-token-that-is-long-1234",
            StatusCode::NO_CONTENT,
        ),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("PUT")
                    .uri(format!("{base}/{id}/archive"))
                    .header("authorization", format!("Bearer {token}"))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(r#"{"archived":true}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
    }
    for (suffix, count) in [("", 0), ("?archived=true", 1)] {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("{base}{suffix}"))
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
        let archived: Value =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        assert_eq!(archived["data"].as_array().unwrap().len(), count);
        assert!(!archived.to_string().contains("must-not-store"));
    }
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri(format!("{base}/{id}/archive"))
                .header(
                    "authorization",
                    "Bearer niu-test-admin-token-that-is-long-1234",
                )
                .header("content-type", "application/json")
                .body(axum::body::Body::from(r#"{"archived":false}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::NO_CONTENT);

    assert_eq!(body["data"][0]["settings"]["logPayloads"], false);
    assert_eq!(body["data"][0]["turns"].as_array().unwrap().len(), 2);
    assert_eq!(
        body["data"][0]["turns"][0]["attachments"][0]["content"],
        "First context"
    );
    assert_eq!(
        body["data"][0]["turns"][1]["results"][1]["content"],
        "Another branch"
    );

    assert_eq!(body["data"][0]["attachments"][0]["content"], "Example");
    assert!(
        state
            .store
            .chat_session(scope, "operator:another-owner", id)
            .await
            .unwrap()
            .is_none()
    );
    let other = state
        .store
        .create_project(scope.organization_id, "Other export workspace")
        .await
        .unwrap();
    for (auth, path, expected) in [
        (
            "Bearer invalid",
            format!("{base}/{id}/export"),
            StatusCode::UNAUTHORIZED,
        ),
        (
            "Bearer niu-test-admin-token-that-is-long-1234",
            format!("{base}/{}/export", Uuid::new_v4()),
            StatusCode::NOT_FOUND,
        ),
        (
            "Bearer niu-test-admin-token-that-is-long-1234",
            format!(
                "/admin/v1/organizations/{}/projects/{}/chat-sessions/{id}/export",
                scope.organization_id, other.project_id
            ),
            StatusCode::NOT_FOUND,
        ),
        (
            "Bearer niu-test-admin-token-that-is-long-1234",
            format!("{base}/{id}/export"),
            StatusCode::OK,
        ),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::get(path)
                    .header("authorization", auth)
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
        if expected == StatusCode::OK {
            let exported: Value =
                serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                    .unwrap();
            assert_eq!(exported["format"], "niu-chat");
            assert_eq!(
                exported["turns"][0]["attachments"][0]["content"],
                "First context"
            );
            assert_eq!(
                exported["turns"][1]["results"][1]["content"],
                "Another branch"
            );
            assert!(!exported.to_string().contains(&id.to_string()));
            assert!(!exported.to_string().contains("must-not-store"));
        }
    }
    for (field, value) in [
        ("elapsedMs", json!(-1)),
        ("elapsedMs", json!(1.5)),
        ("promptTokens", json!(-1)),
        ("totalTokens", json!(9007199254740992u64)),
    ] {
        let mut invalid = payload.clone();
        invalid["results"][0][field] = value;
        let response = app
            .clone()
            .oneshot(
                Request::put(format!("{base}/{id}"))
                    .header(
                        "authorization",
                        "Bearer niu-test-admin-token-that-is-long-1234",
                    )
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(invalid.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    for turns in [
        json!({}),
        json!([{"prompt":"Missing results"}]),
        json!([{"prompt":"Invalid phase","results":[{"model":"fast","content":"x","elapsedMs":1,"phase":"invented"}]}]),
        json!([{"prompt":"Ambiguous branch","results":[{"model":"fast","content":"a","elapsedMs":1,"phase":"complete"},{"model":"fast","content":"b","elapsedMs":1,"phase":"complete"}]}]),
    ] {
        let mut invalid = payload.clone();
        invalid["turns"] = turns;
        let response = app
            .clone()
            .oneshot(
                Request::put(format!("{base}/{id}"))
                    .header(
                        "authorization",
                        "Bearer niu-test-admin-token-that-is-long-1234",
                    )
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(invalid.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }
    let response = app
        .clone()
        .oneshot(
            Request::get(&base)
                .header(
                    "authorization",
                    "Bearer niu-test-admin-token-that-is-long-1234",
                )
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let saved: Value =
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(saved["data"][0]["turns"], body["data"][0]["turns"]);
    for (auth, expected) in [
        ("Bearer invalid", StatusCode::UNAUTHORIZED),
        (
            "Bearer niu-test-admin-token-that-is-long-1234",
            StatusCode::NO_CONTENT,
        ),
        (
            "Bearer niu-test-admin-token-that-is-long-1234",
            StatusCode::NO_CONTENT,
        ),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::delete(format!("{base}/{id}"))
                    .header("authorization", auth)
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
    }
    let response = app
        .oneshot(
            Request::get(&base)
                .header(
                    "authorization",
                    "Bearer niu-test-admin-token-that-is-long-1234",
                )
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let body: Value =
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(body["data"], json!([]));
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn payload_capture_defaults_on_with_explicit_opt_out_scoped_durable_and_customer_safe(
    pool: PgPool,
) {
    let captured = OpenRouterCaptured::default();
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let upstream = Router::new()
        .route("/v1/chat/completions", post(openrouter_provider))
        .with_state(captured);
    let server = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
    let state = test_state(Some(format!("http://{address}/v1")), pool.clone());
    let scope = {
        let workspace = state.store.default_workspace().await.unwrap();
        niu_storage::TenantScope {
            organization_id: workspace.organization_id,
            project_id: workspace.project_id,
        }
    };
    let other_org = state.store.create_organization("Other").await.unwrap();
    let other = state
        .store
        .create_project(other_org, "Other workspace")
        .await
        .unwrap();
    let key = state
        .store
        .issue_key(scope, "Payload test", &["fast".into()], 3600)
        .await
        .unwrap();
    let app = router(state.clone());
    for values in [
        vec!["invalid"],
        vec![""],
        vec!["false,true"],
        vec!["false", "true"],
    ] {
        let mut request = Request::post("/v1/chat/completions")
            .header("authorization", format!("Bearer {}", key.token))
            .header("content-type", "application/json");
        for value in values {
            request = request.header("x-niu-log-payloads", value);
        }
        let response = app.clone().oneshot(request.body(axum::body::Body::from(
            json!({"model":"fast","messages":[{"role":"user","content":"must not execute"}]}).to_string()
        )).unwrap()).await.unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        assert!(!response.headers().contains_key("x-niu-attempt-id"));
    }
    assert!(
        state
            .store
            .gateway_activity(scope, None, 100, &Default::default())
            .await
            .unwrap()
            .is_empty()
    );
    for (header, streaming) in [
        (Some("false"), false),
        (Some("false"), true),
        (None, false),
        (None, true),
        (Some("true"), false),
    ] {
        let enabled = header != Some("false");
        let mut request = Request::post("/v1/chat/completions")
            .header("authorization", format!("Bearer {}", key.token))
            .header("content-type", "application/json");
        if let Some(value) = header {
            request = request.header("x-niu-log-payloads", value);
        }
        let response=app.clone().oneshot(request.body(axum::body::Body::from(json!({"model":"fast","messages":[{"role":"user","content":"Diagnostic prompt"}],"stream":streaming}).to_string())).unwrap()).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let attempt =
            Uuid::parse_str(response.headers()["x-niu-attempt-id"].to_str().unwrap()).unwrap();
        response.into_body().collect().await.unwrap();
        let timing = tokio::time::timeout(std::time::Duration::from_secs(2), async {
            loop {
                let rows = state
                    .store
                    .gateway_activity(scope, None, 100, &Default::default())
                    .await
                    .unwrap();
                if let Some(timing) = rows
                    .into_iter()
                    .find(|row| row.attempt_id == attempt)
                    .and_then(|row| row.timing)
                {
                    break timing;
                }
                tokio::time::sleep(std::time::Duration::from_millis(10)).await;
            }
        })
        .await
        .unwrap();
        assert_eq!(timing["complete"], true);
        assert_eq!(timing["http_status"], 200);
        assert!(timing["dispatch_ms"].as_i64().unwrap() <= timing["headers_ms"].as_i64().unwrap());
        assert!(timing["headers_ms"].as_i64().unwrap() <= timing["total_ms"].as_i64().unwrap());
        if !streaming {
            assert!(timing["first_output_ms"].is_null());
        } else {
            let first = timing["first_output_ms"].as_i64().unwrap();
            assert!(first >= timing["headers_ms"].as_i64().unwrap());
            assert!(first <= timing["total_ms"].as_i64().unwrap());
        }
        assert!(
            state
                .store
                .gateway_activity(other, None, 100, &Default::default())
                .await
                .unwrap()
                .is_empty()
        );
        let data = tokio::time::timeout(std::time::Duration::from_secs(2), async {
            loop {
                let data = state.store.request_payload(scope, attempt).await.unwrap();
                if data.is_some() || !enabled {
                    break data;
                }
                tokio::time::sleep(std::time::Duration::from_millis(10)).await;
            }
        })
        .await
        .unwrap();
        if !enabled {
            assert!(data.is_none());
            continue;
        }
        let data = data.unwrap();
        assert_eq!(
            data["request"]["messages"][0]["content"],
            "Diagnostic prompt"
        );
        assert_eq!(data["complete"], true);
        assert!(!data.to_string().contains("upstream_inference_cost"));
        assert!(!data.to_string().contains("provider-secret-token"));
        assert!(
            state
                .store
                .request_payload(other, attempt)
                .await
                .unwrap()
                .is_none()
        );
        assert!(
            niu_storage::Store::from_pool(pool.clone())
                .request_payload(scope, attempt)
                .await
                .unwrap()
                .is_some()
        );
        state
            .store
            .delete_request_payload(other, attempt)
            .await
            .unwrap();
        assert!(
            state
                .store
                .request_payload(scope, attempt)
                .await
                .unwrap()
                .is_some()
        );
        sqlx::query(
            "UPDATE request_payloads SET expires_at=now()-interval '1 second' WHERE attempt_id=$1",
        )
        .bind(attempt)
        .execute(&pool)
        .await
        .unwrap();
        assert!(
            state
                .store
                .request_payload(scope, attempt)
                .await
                .unwrap()
                .is_none()
        );
        state.store.purge_expired_request_payloads().await.unwrap();
    }
    let response = app.clone().oneshot(Request::post("/v1/chat/completions")
        .header("authorization", format!("Bearer {}", key.token))
        .header("content-type", "application/json")
        .body(axum::body::Body::from(json!({"model":"fast","messages":[{"role":"user","content":"Interrupted response"}],"stream":true}).to_string())).unwrap()).await.unwrap();
    let attempt =
        Uuid::parse_str(response.headers()["x-niu-attempt-id"].to_str().unwrap()).unwrap();
    drop(response);
    let timing = tokio::time::timeout(std::time::Duration::from_secs(2), async {
        loop {
            let rows = niu_storage::Store::from_pool(pool.clone())
                .gateway_activity(scope, None, 100, &Default::default())
                .await
                .unwrap();
            if let Some(timing) = rows
                .into_iter()
                .find(|row| row.attempt_id == attempt)
                .and_then(|row| row.timing)
            {
                break timing;
            }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    assert_eq!(timing["complete"], false);
    assert!(timing["first_output_ms"].is_null());
    let pending = tokio::spawn(app.oneshot(Request::post("/v1/chat/completions")
        .header("authorization", format!("Bearer {}",key.token))
        .header("content-type","application/json")
        .header("x-niu-task-id","timing-preheader-cancellation")
        .body(axum::body::Body::from(json!({"model":"fast","messages":[{"role":"user","content":"cancel-before-headers"}],"stream":true}).to_string())).unwrap()));
    let attempt = tokio::time::timeout(std::time::Duration::from_secs(2), async {
        loop {
            let rows = state
                .store
                .gateway_activity(scope, None, 100, &Default::default())
                .await
                .unwrap();
            if let Some(row) = rows.into_iter().find(|row| {
                row.task_id.as_deref() == Some("timing-preheader-cancellation")
                    && row.dispatched_at.is_some()
            }) {
                break row.attempt_id;
            }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    // Admission commit acknowledgement must complete before cancelling upstream wait.
    tokio::time::sleep(std::time::Duration::from_millis(20)).await;
    pending.abort();
    assert!(pending.await.unwrap_err().is_cancelled());
    let timing = tokio::time::timeout(std::time::Duration::from_secs(2), async {
        loop {
            let rows = state
                .store
                .gateway_activity(scope, None, 100, &Default::default())
                .await
                .unwrap();
            if let Some(timing) = rows
                .into_iter()
                .find(|row| row.attempt_id == attempt)
                .and_then(|row| row.timing)
            {
                break timing;
            }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    assert_eq!(timing["complete"], false);
    assert!(timing["headers_ms"].is_null());
    assert!(timing["http_status"].is_null());
    assert!(timing["first_output_ms"].is_null());
    server.abort();
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn failed_chat_dispatch_is_not_silently_retried(pool: PgPool) {
    use std::sync::atomic::{AtomicUsize, Ordering};
    let calls = Arc::new(AtomicUsize::new(0));
    let observed = calls.clone();
    let upstream = Router::new().route(
        "/v1/chat/completions",
        post(move || {
            let observed = observed.clone();
            async move {
                observed.fetch_add(1, Ordering::SeqCst);
                (
                    StatusCode::SERVICE_UNAVAILABLE,
                    Json(json!({"error":"unavailable"})),
                )
            }
        }),
    );
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
    let state = test_state(Some(format!("http://{address}/v1")), pool);
    let scope = state.store.default_workspace().await.unwrap();
    let key = state
        .store
        .issue_key(scope, "Failure check", &["fast".into()], 3600)
        .await
        .unwrap();
    let response = router(state.clone())
        .oneshot(
            Request::post("/v1/chat/completions")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({"model":"fast","messages":[{
                "role":"user","content":"test"}],"reasoning_effort":"low"})
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
    let attempt_id: Uuid = response.headers()["x-niu-attempt-id"]
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
    assert_ne!(attempt.execution, "confirmed_completed");
    assert_eq!(
        (attempt.prompt_tokens, attempt.completion_tokens),
        (None, None)
    );
    assert_eq!(calls.load(Ordering::SeqCst), 1);
    let page = state
        .store
        .gateway_activity(scope, None, 100, &Default::default())
        .await
        .unwrap();
    assert_eq!(page.len(), 1);
    server.abort();
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn workspace_access_guardrail_blocks_all_protocols_before_upstream_dispatch(pool: PgPool) {
    let captured = OpenRouterCaptured::default();
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let upstream = Router::new()
        .route("/v1/chat/completions", post(openrouter_provider))
        .route("/v1/responses", post(openrouter_provider))
        .route("/v1/embeddings", post(openrouter_provider))
        .with_state(captured.clone());
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
        .issue_key(scope, "Guardrail fixture", &["fast".into()], 3600)
        .await
        .unwrap();
    let reader = state
        .store
        .create_operator(
            niu_storage::OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(scope.project_id),
            },
            "Guardrail assignment reader",
            niu_storage::OperatorRole::Viewer,
            3600,
            niu_storage::OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let app = router(state.clone());
    for (revision, models, providers) in [
        (0, json!({"mode":"deny_all"}), json!({"mode":"inherit"})),
        (1, json!({"mode":"allow_all"}), json!({"mode":"deny_all"})),
        (2, json!({"mode":"allow_all"}), json!({"mode":"allow_all"})),
    ] {
        if revision == 2 {
            let path = format!(
                "/admin/v1/organizations/{}/projects/{}/keys/{}/guardrail",
                scope.organization_id, scope.project_id, key.id
            );
            for (credential, expected_revision, expected_status) in [
                (key.token.as_str(), 0, StatusCode::UNAUTHORIZED),
                (reader.token.as_str(), 0, StatusCode::FORBIDDEN),
                ("niu-test-admin-token-that-is-long-1234", 0, StatusCode::OK),
                (
                    "niu-test-admin-token-that-is-long-1234",
                    0,
                    StatusCode::CONFLICT,
                ),
            ] {
                let response = app.clone().oneshot(Request::put(&path)
                    .header("authorization", format!("Bearer {credential}"))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(json!({"policy_revision":1,"expected_assignment_revision":expected_revision}).to_string())).unwrap()).await.unwrap();
                assert_eq!(response.status(), expected_status);
            }
            let audits: Vec<(i64, i64, String)> = sqlx::query_as("SELECT assignment_revision,policy_revision,actor FROM key_guardrail_assignment_events WHERE key_id=$1 ORDER BY assignment_revision")
                .bind(key.id).fetch_all(&pool).await.unwrap();
            assert_eq!(audits, vec![(1, 1, "installation".to_string())]);
            let response = app
                .clone()
                .oneshot(
                    Request::get(&path)
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
                serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                    .unwrap();
            assert_eq!(body["data"]["assignment_revision"], 1);
            assert_eq!(body["data"]["policy_revision"], 1);
            let response = app
                .clone()
                .oneshot(
                    Request::get(&path)
                        .header("authorization", format!("Bearer {}", reader.token))
                        .body(axum::body::Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::OK);
            let foreign_scope = state
                .store
                .create_project(scope.organization_id, "Foreign assignment scope")
                .await
                .unwrap();
            let foreign_path = format!(
                "/admin/v1/organizations/{}/projects/{}/keys/{}/guardrail",
                scope.organization_id, foreign_scope.project_id, key.id
            );
            let response = app
                .clone()
                .oneshot(
                    Request::get(foreign_path)
                        .header("authorization", format!("Bearer {}", reader.token))
                        .body(axum::body::Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::FORBIDDEN);
        }
        let policy =
            json!({"schema_version":1,"name":"Protected","models":models,"providers":providers});
        let base = format!(
            "/admin/v1/organizations/{}/projects/{}/guardrails",
            scope.organization_id, scope.project_id
        );
        let response = app
            .clone()
            .oneshot(
                Request::post(format!("{base}/preview"))
                    .header(
                        "authorization",
                        "Bearer niu-test-admin-token-that-is-long-1234",
                    )
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(
                        json!({"policy":policy,"model":"fast","provider":"openai"}).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let preview: Value =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        assert_eq!(preview["allowed"], revision == 2);
        assert_eq!(preview["route_availability_checked"], false);
        for (auth, expected) in [
            (format!("Bearer {}", key.token), StatusCode::UNAUTHORIZED),
            (
                "Bearer niu-test-admin-token-that-is-long-1234".to_string(),
                StatusCode::OK,
            ),
            (
                "Bearer niu-test-admin-token-that-is-long-1234".to_string(),
                StatusCode::CONFLICT,
            ),
        ] {
            let response = app
                .clone()
                .oneshot(
                    Request::put(&base)
                        .header("authorization", auth)
                        .header("content-type", "application/json")
                        .body(axum::body::Body::from(
                            json!({"expected_revision":revision,"policy":policy}).to_string(),
                        ))
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), expected);
        }

        for (path, body) in [
            (
                "/v1/chat/completions",
                json!({"model":"fast","messages":[{"role":"user","content":"test"}]}),
            ),
            ("/v1/responses", json!({"model":"fast","input":"test"})),
            ("/v1/embeddings", json!({"model":"fast","input":"test"})),
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
            assert_eq!(response.status(), StatusCode::FORBIDDEN, "{path}");
        }
    }
    assert!(captured.0.lock().unwrap().is_empty());
    let assignment_path = format!(
        "/admin/v1/organizations/{}/projects/{}/keys/{}/guardrail",
        scope.organization_id, scope.project_id, key.id
    );
    for (body, status) in [
        (
            json!({"expected_assignment_revision":1}),
            StatusCode::BAD_REQUEST,
        ),
        (
            json!({"policy_revision":null,"expected_assignment_revision":1}),
            StatusCode::OK,
        ),
        (
            json!({"policy_revision":1,"expected_assignment_revision":1}),
            StatusCode::CONFLICT,
        ),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::put(&assignment_path)
                    .header(
                        "authorization",
                        "Bearer niu-test-admin-token-that-is-long-1234",
                    )
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), status);
    }
    assert!(
        state
            .store
            .key_guardrail(scope, key.id)
            .await
            .unwrap()
            .is_none()
    );
    state.store.activate_workspace_guardrail(scope, 3, &json!({"schema_version":1,"name":"Mandatory","models":{"mode":"deny_all"},"providers":{"mode":"inherit"}})).await.unwrap();
    let response = app
        .clone()
        .oneshot(
            Request::post("/v1/chat/completions")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({"model":"fast","messages":[{"role":"user","content":"test"}]})
                        .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    assert!(captured.0.lock().unwrap().is_empty());
    let denial_path = format!(
        "/admin/v1/organizations/{}/projects/{}/guardrails/denials",
        scope.organization_id, scope.project_id
    );
    let denials = app
        .clone()
        .oneshot(
            Request::get(&denial_path)
                .header("authorization", format!("Bearer {}", reader.token))
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(denials.status(), StatusCode::OK);
    assert_eq!(denials.headers()["cache-control"], "no-store");
    let denials: Value =
        serde_json::from_slice(&denials.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(denials["coverage"], "latest_100_preparation_denials");
    assert_eq!(denials["data"].as_array().unwrap().len(), 10);
    assert_eq!(denials["data"][0]["key_name"], "Guardrail fixture");
    let other_audit_workspace = state
        .store
        .create_project(scope.organization_id, "Other audit workspace")
        .await
        .unwrap();
    let other_denial_path = format!(
        "/admin/v1/organizations/{}/projects/{}/guardrails/denials",
        scope.organization_id, other_audit_workspace.project_id
    );
    for (auth, path, status) in [
        (&key.token, &denial_path, StatusCode::UNAUTHORIZED),
        (&reader.token, &other_denial_path, StatusCode::FORBIDDEN),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::get(path)
                    .header("authorization", format!("Bearer {auth}"))
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), status);
    }
    assert!(
        denials["data"]
            .as_array()
            .unwrap()
            .iter()
            .all(|event| event["outcome"] == "blocked" && event["stage"] == "preparation")
    );
    assert!(
        denials["data"]
            .as_array()
            .unwrap()
            .iter()
            .any(|event| event["reason"] == "provider_denied")
    );
    assert!(
        denials["data"]
            .as_array()
            .unwrap()
            .iter()
            .all(|event| event.get("request").is_none()
                && event.get("key_id").is_none()
                && event.get("id").is_none())
    );
    assert!(
        sqlx::query("DELETE FROM guardrail_preparation_denials")
            .execute(&pool)
            .await
            .is_err()
    );
    assert!(
        sqlx::query("UPDATE guardrail_preparation_denials SET reason='unsupported_policy'")
            .execute(&pool)
            .await
            .is_err()
    );
    for (suffix, expected_count) in [("", 2), ("?before_assignment_revision=2", 1)] {
        let response = app
            .clone()
            .oneshot(
                Request::get(format!("{assignment_path}/history{suffix}"))
                    .header("authorization", format!("Bearer {}", reader.token))
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()["cache-control"], "no-store");
        let body: Value =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        assert_eq!(body["data"].as_array().unwrap().len(), expected_count);
        assert_eq!(body["data"][0]["actor_name"], "Installation administrator");
        assert!(body["next_cursor"].is_null());
        assert!(!body.to_string().contains(&key.id.to_string()));
        assert!(!body.to_string().contains("operator:"));
    }
    let foreign = state
        .store
        .create_project(scope.organization_id, "Foreign audit scope")
        .await
        .unwrap();
    let response = app
        .clone()
        .oneshot(
            Request::get(format!(
                "/admin/v1/organizations/{}/projects/{}/keys/{}/guardrail/history",
                scope.organization_id, foreign.project_id, key.id
            ))
            .header("authorization", format!("Bearer {}", reader.token))
            .body(axum::body::Body::empty())
            .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    for assignment in 2..104 {
        state
            .store
            .assign_key_guardrail_as(scope, key.id, 1, assignment, "installation")
            .await
            .unwrap();
    }
    for (suffix, count, first_revision, cursor) in [
        ("", 100, 104, json!(5)),
        ("?before_assignment_revision=5", 4, 4, Value::Null),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::get(format!("{assignment_path}/history{suffix}"))
                    .header("authorization", format!("Bearer {}", reader.token))
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()["cache-control"], "no-store");
        let body: Value =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        assert_eq!(body["data"].as_array().unwrap().len(), count);
        assert_eq!(body["data"][0]["assignment_revision"], first_revision);
        assert_eq!(body["next_cursor"], cursor);
    }
    let owner = state
        .store
        .create_operator(
            niu_storage::OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(scope.project_id),
            },
            "Workspace policy administrator",
            niu_storage::OperatorRole::Owner,
            3600,
            niu_storage::OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let response = app
        .clone()
        .oneshot(
            Request::put(&assignment_path)
                .header("authorization", format!("Bearer {}", owner.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({"policy_revision":1,"expected_assignment_revision":104}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let history = state
        .store
        .key_guardrail_history(scope, key.id, None)
        .await
        .unwrap();
    assert_eq!(history[0]["actor_name"], "Workspace policy administrator");
    assert!(
        !history[0]
            .to_string()
            .contains(&owner.operator_id.to_string())
    );
    assert!(!history[0].to_string().contains(&owner.token));
    server.abort();
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn payload_api_requires_workspace_read_or_write_access(pool: PgPool) {
    use axum::http::Method;
    use niu_storage::{OperatorAuditActor, OperatorRole, OperatorScope};
    let state = test_state(None, pool.clone());
    let scope = state.store.default_workspace().await.unwrap();
    let other = state
        .store
        .create_project(scope.organization_id, "Separate workspace")
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
            "Log reader",
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
            "Log manager",
            OperatorRole::Admin,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let key = state
        .store
        .issue_key(scope, "Inference client", &["*".into()], 3600)
        .await
        .unwrap();
    let operation = state.store.create_operation(scope, "fast").await.unwrap();
    let attempt = state
        .store
        .prepare_attempt(scope, operation, "fast", "fixture")
        .await
        .unwrap();
    state
        .store
        .save_request_payload(
            attempt,
            &json!({"content":"diagnostic fixture","Authorization":"historical-private-fixture","metadata":{"api_key":"historical-private-fixture","safe":"retained"},"extra_headers":{"Cookie":"historical-private-fixture","Proxy-Authorization":"historical-private-fixture","X-API-Key":"historical-private-fixture","Set-Cookie":"historical-private-fixture","API-Key":"historical-private-fixture","Accept":"application/json"}}),
            r#"{"choices":[{"message":{"content":"result"}}],"usage":{"prompt_tokens":2,"details":{"cost":999,"cached_tokens":1}}}"#,
            "application/json",
            true,
            false,
        )
        .await
        .unwrap();
    let app = router(state.clone());
    for (token, target, method, expected) in [
        (&key.token, scope, Method::GET, StatusCode::UNAUTHORIZED),
        (&viewer.token, other, Method::GET, StatusCode::NOT_FOUND),
        (&writer.token, other, Method::DELETE, StatusCode::NOT_FOUND),
        (&viewer.token, scope, Method::DELETE, StatusCode::FORBIDDEN),
        (&viewer.token, scope, Method::GET, StatusCode::OK),
        (
            &viewer.token,
            scope,
            Method::GET,
            StatusCode::SERVICE_UNAVAILABLE,
        ),
        (&writer.token, scope, Method::DELETE, StatusCode::NO_CONTENT),
    ] {
        if expected == StatusCode::SERVICE_UNAVAILABLE {
            sqlx::query("UPDATE request_payloads SET response_body=$2 WHERE attempt_id=$1")
                .bind(attempt)
                .bind("{historical-private-fixture")
                .execute(&pool)
                .await
                .unwrap();
        }
        let path = format!(
            "/admin/v1/organizations/{}/projects/{}/requests/{attempt}/payloads",
            target.organization_id, target.project_id
        );
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(method.clone())
                    .uri(path)
                    .header("authorization", format!("Bearer {token}"))
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
        if method == Method::GET && expected == StatusCode::OK {
            assert_eq!(response.headers()["cache-control"], "no-store");
            let body: Value =
                serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                    .unwrap();
            assert_eq!(body["data"]["request"]["content"], "diagnostic fixture");
            assert!(body["data"]["request"].get("Authorization").is_none());
            assert_eq!(
                body["data"]["request"]["extra_headers"],
                json!({"Accept":"application/json"})
            );
            assert_eq!(
                body["data"]["request"]["metadata"],
                json!({"safe":"retained"})
            );
            let retained: Value =
                serde_json::from_str(body["data"]["response"].as_str().unwrap()).unwrap();
            assert_eq!(retained["usage"]["details"], json!({"cached_tokens":1}));
            assert_eq!(retained["choices"][0]["message"]["content"], "result");
        } else if expected == StatusCode::SERVICE_UNAVAILABLE {
            let body = response.into_body().collect().await.unwrap().to_bytes();
            let text = String::from_utf8_lossy(&body);
            assert!(!text.contains("historical-private-fixture"));
            assert!(!text.contains("diagnostic fixture"));
        }
        if expected != StatusCode::NO_CONTENT {
            let markers: i64 = sqlx::query_scalar(
                "SELECT count(*) FROM request_payload_deletions WHERE attempt_id=$1",
            )
            .bind(attempt)
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(
                markers, 0,
                "denied reads or writes must not suppress capture"
            );
            assert!(
                state
                    .store
                    .request_payload(scope, attempt)
                    .await
                    .unwrap()
                    .is_some()
            );
        }
    }
    assert!(
        state
            .store
            .request_payload(scope, attempt)
            .await
            .unwrap()
            .is_none()
    );
    assert!(state.store.attempt(scope, attempt).await.unwrap().is_some());
    state
        .store
        .save_request_payload(
            attempt,
            &json!({"content":"late capture"}),
            "late result",
            "text/plain",
            true,
            false,
        )
        .await
        .unwrap();
    let path = format!(
        "/admin/v1/organizations/{}/projects/{}/requests/{attempt}/payloads",
        scope.organization_id, scope.project_id
    );
    let response = app
        .clone()
        .oneshot(
            Request::get(&path)
                .header("authorization", format!("Bearer {}", viewer.token))
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()["cache-control"], "no-store");
    let body: Value =
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert!(
        body["data"].is_null(),
        "late content must remain unavailable through the API"
    );
    let repeated = app
        .oneshot(
            Request::delete(&path)
                .header("authorization", format!("Bearer {}", writer.token))
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(repeated.status(), StatusCode::NO_CONTENT);
    let markers: i64 =
        sqlx::query_scalar("SELECT count(*) FROM request_payload_deletions WHERE attempt_id=$1")
            .bind(attempt)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(markers, 1);
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn live_input_guardrails_block_and_redact_all_protocols(pool: PgPool) {
    let captured = OpenRouterCaptured::default();
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let upstream = Router::new()
        .route("/v1/chat/completions", post(openrouter_provider))
        .route("/v1/responses", post(openrouter_provider))
        .route("/v1/embeddings", post(openrouter_provider))
        .with_state(captured.clone());
    let server = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
    let mut state = test_state(Some(format!("http://{address}/v1")), pool.clone());
    let model = Arc::make_mut(&mut state.config)
        .models
        .get_mut("fast")
        .unwrap();
    model.supports_responses = true;
    model.supports_embeddings = true;
    let scope = state.store.default_workspace().await.unwrap();
    let key = state
        .store
        .issue_key(scope, "Input fixture", &["fast".into()], 3600)
        .await
        .unwrap();
    let app = router(state.clone());
    let policy = |action: &str| json!({"schema_version":1,"name":"Input protection","models":{"mode":"inherit"},"providers":{"mode":"inherit"},"input_rules":[{"pattern":"sensitive-fixture","action":action}]});
    state
        .store
        .activate_workspace_guardrail(scope, 0, &policy("block"))
        .await
        .unwrap();
    let bodies = [
        (
            "/v1/chat/completions",
            json!({"model":"fast","messages":[{"role":"user","content":"sensitive-fixture"}]}),
        ),
        (
            "/v1/responses",
            json!({"model":"fast","input":"sensitive-fixture"}),
        ),
        (
            "/v1/embeddings",
            json!({"model":"fast","input":["sensitive-fixture"]}),
        ),
    ];
    for (path, body) in &bodies {
        let response = app
            .clone()
            .oneshot(
                Request::post(*path)
                    .header("authorization", format!("Bearer {}", key.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }
    assert!(captured.0.lock().unwrap().is_empty());
    let dashboard_path = format!(
        "/admin/v1/organizations/{}/projects/{}/keys/{}/chat/completions",
        scope.organization_id, scope.project_id, key.id
    );
    let response = app.clone().oneshot(Request::post(dashboard_path).header("authorization","Bearer niu-test-admin-token-that-is-long-1234").header("content-type","application/json").body(axum::body::Body::from(json!({"model":"fast","stream":true,"messages":[{"role":"user","content":"sensitive-fixture"}]}).to_string())).unwrap()).await.unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    assert!(captured.0.lock().unwrap().is_empty());
    let audit = state
        .store
        .guardrail_preparation_denials(scope)
        .await
        .unwrap();
    assert_eq!(audit.len(), 4);
    assert!(
        audit
            .iter()
            .all(|item| item["reason"] == "input_blocked" && item["coverage"] == "local_input")
    );
    assert!(
        !serde_json::to_string(&audit)
            .unwrap()
            .contains("sensitive-fixture")
    );
    state
        .store
        .activate_workspace_guardrail(scope, 1, &policy("redact"))
        .await
        .unwrap();
    // The pinned mandatory key block must still see original text before workspace redaction.
    state
        .store
        .assign_key_guardrail(scope, key.id, 1, 0)
        .await
        .unwrap();
    for (path, body) in &bodies {
        let response = app
            .clone()
            .oneshot(
                Request::post(*path)
                    .header("authorization", format!("Bearer {}", key.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }
    assert!(captured.0.lock().unwrap().is_empty());
    state
        .store
        .clear_key_guardrail_as(scope, key.id, 1, "fixture")
        .await
        .unwrap();
    let response = app.clone().oneshot(Request::post("/v1/chat/completions").header("authorization",format!("Bearer {}",key.token)).header("content-type","application/json").body(axum::body::Body::from(json!({"model":"fast","messages":[{"role":"user","content":[{"type":"image_url","image_url":{"url":"https://example.com/image.png"}}]}]}).to_string())).unwrap()).await.unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    assert!(captured.0.lock().unwrap().is_empty());
    for (path, body) in &bodies {
        let response = app
            .clone()
            .oneshot(
                Request::post(*path)
                    .header("authorization", format!("Bearer {}", key.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_ne!(response.status(), StatusCode::FORBIDDEN);
        response.into_body().collect().await.unwrap();
    }
    {
        let forwarded = captured.0.lock().unwrap();
        assert_eq!(forwarded.len(), 3);
        for request in forwarded.iter() {
            let text = request.body.to_string();
            assert!(!text.contains("sensitive-fixture"));
            assert!(text.contains("[REDACTED]"));
        }
    }
    let retained = tokio::time::timeout(std::time::Duration::from_secs(2), async {
        loop {
            let retained: Vec<Value> =
                sqlx::query_scalar("SELECT request_body FROM request_payloads")
                    .fetch_all(&pool)
                    .await
                    .unwrap();
            if retained.len() == 3 {
                break retained;
            }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("all three transformed requests must be retained");
    assert!(
        !retained.is_empty(),
        "verify persisted content, not only forwarded requests"
    );
    assert!(
        retained
            .iter()
            .all(|body| !body.to_string().contains("sensitive-fixture"))
    );
    let attempts: Vec<uuid::Uuid> = sqlx::query_scalar("SELECT attempt_id FROM request_payloads")
        .fetch_all(&pool)
        .await
        .unwrap();
    for attempt in attempts {
        let decision = state
            .store
            .dispatch_guardrail_decision(scope, attempt)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(decision["input_inspection"]["outcome"], "redacted");
        assert_eq!(decision["input_inspection"]["coverage"], "local_text");
        assert!(decision["input_inspection"]["elapsed_ms"].as_i64().unwrap() >= 0);
        assert!(!decision.to_string().contains("sensitive-fixture"));
    }
    let response = app.clone().oneshot(Request::post("/v1/chat/completions")
        .header("authorization",format!("Bearer {}",key.token))
        .header("content-type","application/json")
        .body(axum::body::Body::from(json!({"model":"fast","messages":[{"role":"user","content":"ordinary fixture"}]}).to_string())).unwrap()).await.unwrap();
    let attempt = response
        .headers()
        .get("x-niu-attempt-id")
        .unwrap()
        .to_str()
        .unwrap()
        .parse()
        .unwrap();
    response.into_body().collect().await.unwrap();
    let decision = state
        .store
        .dispatch_guardrail_decision(scope, attempt)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(decision["input_inspection"]["outcome"], "allowed");
    server.abort();
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn unsupported_capabilities_are_actionable_without_admission_or_egress(pool: PgPool) {
    let captured = OpenRouterCaptured::default();
    let upstream = Router::new()
        .route("/v1/chat/completions", post(openrouter_provider))
        .route("/v1/embeddings", post(openrouter_provider))
        .route("/v1/responses", post(openrouter_provider))
        .with_state(captured.clone());
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let task = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
    let mut state = test_state(Some(format!("http://{address}/v1")), pool.clone());
    let org = state
        .store
        .create_organization("Capability diagnosis")
        .await
        .unwrap();
    let scope = state
        .store
        .create_project(org, "API validation")
        .await
        .unwrap();
    let key = state
        .store
        .issue_key(scope, "Client", &["fast".into()], 3600)
        .await
        .unwrap();
    let tools = json!([{"type":"function","function":{"name":"lookup","parameters":{"type":"object","properties":{}}}}]);
    let text = json!([{"role":"user","content":"hello"}]);
    let cases = [
        (
            "/v1/chat/completions",
            json!({"model":"fast","messages":text,"tools":tools}),
            0,
            "Function tools are not enabled",
        ),
        (
            "/v1/chat/completions",
            json!({"model":"fast","messages":text,"tools":tools,"stream":true}),
            1,
            "Streaming function tools are not enabled",
        ),
        (
            "/v1/chat/completions",
            json!({"model":"fast","messages":text,"response_format":{"type":"json_object"}}),
            0,
            "Structured JSON output is not enabled",
        ),
        (
            "/v1/chat/completions",
            json!({"model":"fast","messages":text,"response_format":{"type":"json_object"},"stream":true}),
            2,
            "Set stream to false",
        ),
        (
            "/v1/chat/completions",
            json!({"model":"fast","messages":text,"response_format":{"type":"json_object"},"tools":tools}),
            3,
            "Send separate requests",
        ),
        (
            "/v1/embeddings",
            json!({"model":"fast","input":"hello"}),
            0,
            "Choose an embedding model",
        ),
        (
            "/v1/embeddings",
            json!({"model":"fast","input":"hello","dimensions":2}),
            4,
            "Omit dimensions",
        ),
        (
            "/v1/embeddings",
            json!({"model":"fast","input":"hello","encoding_format":"base64"}),
            4,
            "Use float encoding",
        ),
        (
            "/v1/embeddings",
            json!({"model":"fast","input":"hello"}),
            20,
            "OpenAI-compatible model route",
        ),
        (
            "/v1/responses",
            json!({"model":"fast","input":"hello"}),
            0,
            "Choose a model with Responses support",
        ),
        (
            "/v1/responses",
            json!({"model":"fast","input":"hello","stream":true}),
            8,
            "Set stream to false or use Chat streaming",
        ),
        (
            "/v1/responses",
            json!({"model":"fast","input":"hello"}),
            24,
            "OpenAI-compatible model route",
        ),
    ];
    for (endpoint, body, flags, message) in cases {
        let model = Arc::make_mut(&mut state.config)
            .models
            .get_mut("fast")
            .unwrap();
        model.supports_tool_calls = flags & 1 != 0;
        model.supports_streaming_tool_calls = false;
        model.supports_structured_output = flags & 2 != 0;
        model.supports_embeddings = flags & 4 != 0;
        model.supports_embedding_dimensions = false;
        model.supports_embedding_base64 = false;
        model.supports_responses = flags & 8 != 0;
        model.provider = if flags & 16 != 0 {
            "anthropic"
        } else {
            "openai"
        }
        .into();
        let response = router(state.clone())
            .oneshot(
                Request::post(endpoint)
                    .header("authorization", format!("Bearer {}", key.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(
            response.status(),
            StatusCode::NOT_IMPLEMENTED,
            "{endpoint}: {message}"
        );
        let error: Value =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        assert_eq!(error["error"]["type"], "unsupported_operation_error");
        assert!(
            error["error"]["message"]
                .as_str()
                .unwrap()
                .contains(message),
            "{error}"
        );
        assert!(captured.0.lock().unwrap().is_empty());
    }
    let operations: i64 = sqlx::query_scalar("SELECT count(*) FROM operations")
        .fetch_one(&pool)
        .await
        .unwrap();
    let attempts: i64 = sqlx::query_scalar("SELECT count(*) FROM attempts")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!((operations, attempts), (0, 0));
    assert_eq!(state.requests.load(std::sync::atomic::Ordering::Relaxed), 0);
    task.abort();
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn generation_parameters_are_validated_before_admission_and_preserved_on_dispatch(
    pool: PgPool,
) {
    let captured = OpenRouterCaptured::default();
    let upstream = Router::new()
        .route("/v1/chat/completions", post(openrouter_provider))
        .with_state(captured.clone());
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let task = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
    let state = test_state(Some(format!("http://{address}/v1")), pool.clone());
    let org = state
        .store
        .create_organization("Parameter validation")
        .await
        .unwrap();
    let scope = state
        .store
        .create_project(org, "Validation workspace")
        .await
        .unwrap();
    let key = state
        .store
        .issue_key(scope, "Client", &["fast".into()], 3600)
        .await
        .unwrap();
    for (field, value) in [
        ("temperature", json!(-1)),
        ("temperature", json!(2.01)),
        ("temperature", json!("1")),
        ("top_p", json!(-0.1)),
        ("top_p", json!(1.1)),
        ("top_p", json!(true)),
        ("frequency_penalty", json!(-3)),
        ("presence_penalty", json!(3)),
        ("max_tokens", json!(0)),
        ("max_tokens", json!(1.5)),
        ("max_completion_tokens", json!(-1)),
        ("max_tokens", json!(u64::MAX)),
        ("n", json!(0)),
        ("seed", json!(0.5)),
        ("stream", json!("true")),
        ("stream_options", json!(true)),
        ("stream_options", json!({"include_usage":"true"})),
    ] {
        let mut request = json!({"model":"fast","messages":[{"role":"user","content":"test"}]});
        request[field] = value;
        let response = router(state.clone())
            .oneshot(
                Request::post("/v1/chat/completions")
                    .header("authorization", format!("Bearer {}", key.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(request.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST, "{field}");
        assert!(!response.headers().contains_key("x-niu-attempt-id"));
        let body: Value =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        assert!(body["error"]["message"].as_str().unwrap().contains(field));
    }
    assert!(captured.0.lock().unwrap().is_empty());
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM attempts")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 0);
    assert_eq!(state.requests.load(std::sync::atomic::Ordering::Relaxed), 0);
    let valid = json!({"model":"fast","messages":[{"role":"user","content":"test"}],
        "temperature":2,"top_p":0,"frequency_penalty":-2,"presence_penalty":2,"max_tokens":1,"n":1,"seed":-1});
    let response = router(state.clone())
        .oneshot(
            Request::post("/v1/chat/completions")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(valid.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let calls = captured.0.lock().unwrap();
    assert_eq!(calls.len(), 1);
    for field in [
        "temperature",
        "top_p",
        "frequency_penalty",
        "presence_penalty",
        "max_tokens",
        "n",
        "seed",
    ] {
        assert_eq!(calls[0].body[field], valid[field]);
    }
    task.abort();
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn niu_key_preset_blocks_issued_credentials_before_all_protocol_dispatch(pool: PgPool) {
    let captured = Captured::default();
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let upstream = Router::new()
        .route("/v1/{*protocol}", post(provider))
        .with_state(captured.clone());
    let server = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
    let mut state = test_state(Some(format!("http://{address}/v1")), pool.clone());
    Arc::make_mut(&mut state.config)
        .models
        .get_mut("fast")
        .unwrap()
        .supports_responses = true;
    let org = state
        .store
        .create_organization("Niu secret preset")
        .await
        .unwrap();
    let scope = state
        .store
        .create_project(org, "Niu secret preset")
        .await
        .unwrap();
    let key = state
        .store
        .issue_key(scope, "preset fixture", &["fast".into()], 600)
        .await
        .unwrap();
    state.store.activate_workspace_guardrail(scope, 0, &json!({"schema_version":1,"name":"Niu key protection","models":{"mode":"allow_all"},"providers":{"mode":"inherit"},"input_rules":[{"preset":"niu_api_key_v1","action":"block"}]})).await.unwrap();
    for (endpoint, body) in [
        (
            "/v1/chat/completions",
            json!({"model":"fast","messages":[{"role":"user","content":key.token}]}),
        ),
        ("/v1/responses", json!({"model":"fast","input":key.token})),
        ("/v1/embeddings", json!({"model":"fast","input":key.token})),
    ] {
        let response = router(state.clone())
            .oneshot(
                Request::post(endpoint)
                    .header("authorization", format!("Bearer {}", key.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        assert!(!String::from_utf8_lossy(&bytes).contains(&key.token));
        assert!(captured.0.lock().unwrap().is_none());
    }
    let attempts: i64 = sqlx::query_scalar("SELECT count(*) FROM attempts")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(attempts, 0);
    let denials = state
        .store
        .guardrail_preparation_denials(scope)
        .await
        .unwrap();
    assert_eq!(denials.len(), 3);
    assert!(
        !serde_json::to_string(&denials)
            .unwrap()
            .contains(&key.token)
    );
    server.abort();
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn chat_session_archive_rejects_readers_inference_keys_and_other_owners(pool: PgPool) {
    use niu_storage::{OperatorAuditActor, OperatorRole, OperatorScope};
    let state = test_state(None, pool);
    let scope = state.store.default_workspace().await.unwrap();
    let access = OperatorScope {
        organization_id: scope.organization_id,
        project_id: Some(scope.project_id),
    };
    let viewer = state
        .store
        .create_operator(
            access,
            "Archive reader",
            OperatorRole::Viewer,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let writer = state
        .store
        .create_operator(
            access,
            "Archive manager",
            OperatorRole::Admin,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let key = state
        .store
        .issue_key(scope, "Inference client", &["fast".into()], 3600)
        .await
        .unwrap();
    let id = Uuid::new_v4();
    let payload = json!({"id":id,"prompt":"Private conversation","results":[],"createdAt":1});
    state
        .store
        .save_chat_session(scope, "installation", id, &payload)
        .await
        .unwrap();
    let app = router(state.clone());
    let base = format!(
        "/admin/v1/organizations/{}/projects/{}/chat-sessions",
        scope.organization_id, scope.project_id
    );
    for (token, expected) in [
        (&viewer.token, StatusCode::FORBIDDEN),
        (&writer.token, StatusCode::NOT_FOUND),
        (&key.token, StatusCode::UNAUTHORIZED),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("PUT")
                    .uri(format!("{base}/{id}/archive"))
                    .header("authorization", format!("Bearer {token}"))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(r#"{"archived":true}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
    }
    assert_eq!(
        state
            .store
            .chat_sessions(scope, "installation")
            .await
            .unwrap(),
        vec![payload]
    );
    assert!(
        state
            .store
            .chat_sessions_by_archive(scope, "installation", true)
            .await
            .unwrap()
            .is_empty()
    );
    for invalid in [
        json!({"archived":"true"}),
        json!({"archived":true,"owner":"installation"}),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("PUT")
                    .uri(format!("{base}/{id}/archive"))
                    .header(
                        "authorization",
                        "Bearer niu-test-admin-token-that-is-long-1234",
                    )
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(invalid.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert!(!response.status().is_success());
    }
    let response = app
        .oneshot(
            Request::builder()
                .uri(format!("{base}?archived=true&owner=installation"))
                .header("authorization", format!("Bearer {}", writer.token))
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}
