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
                "usage":{"prompt_tokens":7,"completion_tokens":2,"total_tokens":9}
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
        "usage":{"prompt_tokens":5,"completion_tokens":2,"total_tokens":7}
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
    assert_eq!(unknown_attempts, 1);
    let (_, malformed_forwarded) = captured.0.lock().unwrap().take().unwrap();
    assert_eq!(
        malformed_forwarded["response_format"]["json_schema"]["name"],
        "invalid"
    );

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
    assert_eq!(attempts, 3);
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
    let mut state = test_state(Some(format!("http://{address}/v1")), pool);
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
        "tool_choice":"required"
    });
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
    let budget = state.store.budget(scope).await.unwrap().unwrap();
    assert_eq!((budget.spent_nanos, budget.reserved_nanos), (6, 0));

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
    assert_eq!(attempts, 2);
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
        "temperature": 0.2
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
