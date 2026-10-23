//! Automated functional test suite for the Niu backend service.
//!
//! Covers three-plane authorization boundaries, multi-protocol inference
//! (`/v1/chat/completions`, `/v1/responses`, `/v1/embeddings`), SSE streaming,
//! tool calls, structured outputs, commercial metadata stripping, guardrails
//! input/output enforcement, and workspace isolation.

use super::*;
use crate::{
    customer_response::{sanitize, sanitize_retained},
    guardrails::{
        AccessRule, EffectiveAccess,
        input::{Action, CompiledInputPolicy, InspectionError, Protocol, RuleConfig},
    },
    streaming::ChatEvidence,
};

#[test]
fn functional_protocol_contracts_and_commercial_sanitization_matrix() {
    // 1. JSON commercial boundary: strip supplier cost fields while preserving
    // assistant content and tool call arguments that legitimately mention "cost".
    let mut chat_json = json!({
        "id": "chatcmpl-functional-1",
        "object": "chat.completion",
        "model": "provider-secret-model",
        "cost": 0.042,
        "cost_details": {"upstream_inference_cost": 0.031},
        "upstream_inference_cost": 0.031,
        "is_byok": false,
        "choices": [{
            "index": 0,
            "message": {
                "role": "assistant",
                "content": "{\"cost\": 125, \"upstream_inference_cost\": \"preserved_in_content\"}",
                "tool_calls": [{
                    "id": "call_cost_1",
                    "type": "function",
                    "function": {
                        "name": "estimate_budget",
                        "arguments": "{\"cost\":99,\"cost_details\":{\"tier\":\"pro\"}}"
                    }
                }]
            },
            "finish_reason": "tool_calls"
        }],
        "usage": {
            "prompt_tokens": 18,
            "completion_tokens": 12,
            "total_tokens": 30,
            "cost": 0.042,
            "cost_details": {"upstream_inference_cost": 0.031},
            "upstream_inference_cost": 0.031,
            "is_byok": true
        }
    });
    assert!(sanitize(&mut chat_json));
    assert!(chat_json.get("cost").is_none());
    assert!(chat_json.get("cost_details").is_none());
    assert!(chat_json.get("upstream_inference_cost").is_none());
    assert!(chat_json.get("is_byok").is_none());
    assert!(chat_json["usage"].get("cost").is_none());
    assert!(chat_json["usage"].get("cost_details").is_none());
    assert!(chat_json["usage"].get("upstream_inference_cost").is_none());
    assert!(chat_json["usage"].get("is_byok").is_none());
    assert_eq!(chat_json["usage"]["prompt_tokens"], 18);
    assert_eq!(chat_json["usage"]["completion_tokens"], 12);
    assert_eq!(chat_json["usage"]["total_tokens"], 30);
    // Assistant message content and tool call arguments must never be mutated.
    assert!(
        chat_json["choices"][0]["message"]["content"]
            .as_str()
            .unwrap()
            .contains("upstream_inference_cost")
    );
    assert!(
        chat_json["choices"][0]["message"]["tool_calls"][0]["function"]["arguments"]
            .as_str()
            .unwrap()
            .contains("cost_details")
    );

    // 2. Retained payload sanitization across JSON and SSE content types.
    let retained_json = sanitize_retained(
        "application/json; charset=utf-8",
        &chat_json.to_string(),
        false,
    )
    .expect("valid retained JSON");
    assert!(!retained_json.contains("\"is_byok\""));

    let raw_sse = concat!(
        "data: {\"id\":\"s1\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Hello\"},\"finish_reason\":null}]}\n\n",
        "data: {\"id\":\"s1\",\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":5,\"completion_tokens\":3,\"total_tokens\":8,\"cost\":0.01,\"cost_details\":{\"upstream_inference_cost\":0.007},\"is_byok\":false}}\n\n",
        "data: [DONE]\n\n"
    );
    let sanitized_sse =
        sanitize_retained("text/event-stream", raw_sse, false).expect("valid retained SSE");
    assert!(!sanitized_sse.contains("upstream_inference_cost"));
    assert!(!sanitized_sse.contains("cost_details"));
    assert!(!sanitized_sse.contains("is_byok"));
    assert!(sanitized_sse.contains("data: [DONE]"));

    let mut evidence = ChatEvidence::default();
    evidence
        .feed(raw_sse.as_bytes())
        .expect("valid SSE evidence");
    assert!(evidence.done);
    assert_eq!(evidence.usage(), Some((5, 3)));
    assert_eq!(
        evidence.finish_reasons(),
        Some(vec![niu_storage::RequestChoiceFinish {
            index: 0,
            reason: niu_storage::RequestFinishReason::Stop,
        }])
    );

    // 3. Responses API & Embeddings validation contracts.
    let mut config: AppConfig = toml::from_str(
        r#"
        [models.fast]
        provider = "openai"
        upstream_model = "provider-model"
        api_key_env = "PROVIDER_KEY"
        supports_tool_calls = true
        supports_streaming_tool_calls = true
        supports_structured_output = true
        supports_embeddings = true
        supports_embedding_dimensions = true
        supports_embedding_base64 = true
        "#,
    )
    .expect("valid config");
    let model = config.models.get_mut("fast").unwrap();

    let mut valid_responses_req = json!({
        "model": "fast",
        "input": "Summarize the release notes",
        "instructions": "Be concise",
        "max_output_tokens": 128
    });
    assert!(validate_responses_request(&mut valid_responses_req, model.pricing.as_ref()).is_ok());

    let mut unsupported_responses_req = json!({
        "model": "fast",
        "input": "Summarize the release notes",
        "tools": [{"type": "function", "name": "lookup_doc", "parameters": {"type": "object"}}]
    });
    assert!(
        validate_responses_request(&mut unsupported_responses_req, model.pricing.as_ref()).is_err()
    );

    let valid_embedding_req = json!({
        "model": "fast",
        "input": ["first document", "second document"],
        "dimensions": 16,
        "encoding_format": "base64"
    });
    assert!(validate_embedding_request(&valid_embedding_req).is_ok());

    // 4. Guardrail policy composition and input/output rule inspection.
    let access = EffectiveAccess::compose([
        AccessRule::AllowList(
            ["fast".to_string(), "pro".to_string()]
                .into_iter()
                .collect(),
        ),
        AccessRule::AllowList(["fast".to_string()].into_iter().collect()),
    ]);
    assert!(access.permits("fast"));
    assert!(!access.permits("pro"));

    let compiled = CompiledInputPolicy::compile(&[
        RuleConfig {
            pattern: Some("CONFIDENTIAL_TOKEN_[0-9]+".to_string()),
            preset: None,
            action: Action::Redact,
        },
        RuleConfig {
            pattern: Some("FORBIDDEN_LAUNCH_CODE".to_string()),
            preset: None,
            action: Action::Block,
        },
    ])
    .expect("compile guardrail rules");

    let redacted = compiled
        .inspect(
            Protocol::Chat,
            &json!({"messages": [{"role": "user", "content": "Token is CONFIDENTIAL_TOKEN_9876"}]}),
        )
        .expect("redaction should allow request");
    assert_eq!(redacted["messages"][0]["content"], "Token is [REDACTED]");

    let blocked = compiled.inspect(
        Protocol::Chat,
        &json!({"messages": [{"role": "user", "content": "Contains FORBIDDEN_LAUNCH_CODE here"}]}),
    );
    assert_eq!(blocked, Err(InspectionError::Blocked));
}

#[tokio::test]
async fn functional_router_control_and_inference_auth_boundaries() {
    let pool = sqlx::postgres::PgPoolOptions::new()
        .connect_lazy("postgres://unused:unused@127.0.0.1:1/unused")
        .unwrap();
    let app = router(test_state(None, pool));

    // Health endpoint must respond 200 OK without touching PostgreSQL.
    let health = app
        .clone()
        .oneshot(
            Request::get("/healthz")
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(health.status(), StatusCode::OK);
    let health_json: Value =
        serde_json::from_slice(&health.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(health_json["status"], "ok");

    // Inference, workspace, and admin endpoints must reject unauthenticated or invalid tokens.
    for (method, uri, body) in [
        (
            "POST",
            "/v1/chat/completions",
            "{\"model\":\"fast\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}]}",
        ),
        (
            "POST",
            "/v1/responses",
            "{\"model\":\"fast\",\"input\":\"hi\"}",
        ),
        (
            "POST",
            "/v1/embeddings",
            "{\"model\":\"fast\",\"input\":\"hi\"}",
        ),
        (
            "POST",
            "/v1/messages",
            "{\"model\":\"fast\",\"max_tokens\":16,\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}]}",
        ),
        ("GET", "/v1/key", ""),
        ("GET", "/api/v1/workspaces", ""),
        ("GET", "/admin/v1/organizations", ""),
        ("GET", "/admin/v1/vendors", ""),
        ("GET", "/admin/v1/providers", ""),
    ] {
        let resp = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(method)
                    .uri(uri)
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(body))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(
            resp.status(),
            StatusCode::UNAUTHORIZED,
            "{method} {uri} must reject unauthenticated access"
        );
    }
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn functional_end_to_end_multi_protocol_gateway_and_commercial_boundaries(
    pool: sqlx::PgPool,
) {
    use axum::response::{IntoResponse, Response};
    use std::sync::atomic::{AtomicUsize, Ordering};

    let upstream_calls = Arc::new(AtomicUsize::new(0));
    let calls_ref = upstream_calls.clone();

    let upstream = Router::new()
        .route(
            "/v1/chat/completions",
            post(move |headers: HeaderMap, Json(body): Json<Value>| {
                let calls = calls_ref.clone();
                async move {
                    calls.fetch_add(1, Ordering::SeqCst);
                    assert_eq!(headers["authorization"], "Bearer provider-secret-token");
                    assert_eq!(body["model"], "provider-secret-model");
                    if body.get("stream") == Some(&json!(true)) {
                        let stream_body = concat!(
                            "data: {\"id\":\"chat-stream-1\",\"model\":\"provider-secret-model\",\"choices\":[{\"index\":0,\"delta\":{\"role\":\"assistant\",\"content\":\"Hello \"},\"finish_reason\":null}]}\n\n",
                            "data: {\"id\":\"chat-stream-1\",\"model\":\"provider-secret-model\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Niu\"},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":6,\"completion_tokens\":4,\"total_tokens\":10,\"cost\":0.025,\"cost_details\":{\"upstream_inference_cost\":0.019},\"is_byok\":false}}\n\n",
                            "data: [DONE]\n\n"
                        );
                        return Response::builder()
                            .header("content-type", "text/event-stream")
                            .body(axum::body::Body::from(stream_body))
                            .unwrap();
                    }
                    Json(json!({
                        "id": "chat-sync-1",
                        "object": "chat.completion",
                        "created": 1750000000,
                        "model": "provider-secret-model",
                        "cost": 0.015,
                        "cost_details": {"upstream_inference_cost": 0.011},
                        "is_byok": false,
                        "choices": [{
                            "index": 0,
                            "message": {"role": "assistant", "content": "Verified functional response"},
                            "finish_reason": "stop"
                        }],
                        "usage": {
                            "prompt_tokens": 9,
                            "completion_tokens": 5,
                            "total_tokens": 14,
                            "cost": 0.015,
                            "cost_details": {"upstream_inference_cost": 0.011},
                            "upstream_inference_cost": 0.011,
                            "is_byok": false
                        }
                    }))
                    .into_response()
                }
            }),
        )
        .route("/v1/responses", post(responses_provider))
        .route("/v1/embeddings", post(embedding_provider))
        .with_state(Captured::default());

    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });

    let mut state = test_state(Some(format!("http://{address}/v1")), pool.clone());
    {
        let config = Arc::make_mut(&mut state.config);
        let fast = config.models.get_mut("fast").unwrap();
        fast.supports_responses = true;
        fast.supports_tool_calls = true;
        fast.supports_streaming_tool_calls = true;
        fast.supports_structured_output = true;
    }

    let org = state
        .store
        .create_organization("Functional E2E Org")
        .await
        .unwrap();
    let workspace_a = state
        .store
        .create_project(org, "Workspace Alpha")
        .await
        .unwrap();
    let workspace_b = state
        .store
        .create_project(org, "Workspace Beta")
        .await
        .unwrap();

    let key_a = state
        .store
        .issue_key(workspace_a, "Alpha Key", &["fast".into()], 3600)
        .await
        .unwrap();
    let key_b = state
        .store
        .issue_key(workspace_b, "Beta Key", &["fast".into()], 3600)
        .await
        .unwrap();

    personal_test_route(&mut state, org).await;
    let app = router(state.clone());

    // 1. Key introspection (/v1/key)
    let key_info_resp = app
        .clone()
        .oneshot(
            Request::get("/v1/key")
                .header("authorization", format!("Bearer {}", key_a.token))
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(key_info_resp.status(), StatusCode::OK);
    let key_info: Value = serde_json::from_slice(
        &key_info_resp
            .into_body()
            .collect()
            .await
            .unwrap()
            .to_bytes(),
    )
    .unwrap();
    assert_eq!(key_info["data"]["label"], "Alpha Key");
    assert_eq!(key_info["data"]["allowed_models"], json!(["fast"]));

    // 2. Synchronous Chat Completion + Commercial Boundary Verification
    let chat_resp = app
        .clone()
        .oneshot(
            Request::post("/v1/chat/completions")
                .header("authorization", format!("Bearer {}", key_a.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({
                        "model": "fast",
                        "messages": [{"role": "user", "content": "Hello gateway"}]
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(
        chat_resp.status(),
        StatusCode::OK,
        "error code: {:?}",
        chat_resp.headers().get("x-niu-error-code")
    );
    assert!(
        chat_resp.headers()["x-niu-operation-id"]
            .to_str()
            .unwrap()
            .parse::<Uuid>()
            .is_ok()
    );
    let attempt_id: Uuid = chat_resp.headers()["x-niu-attempt-id"]
        .to_str()
        .unwrap()
        .parse()
        .unwrap();
    let chat_body_bytes = chat_resp.into_body().collect().await.unwrap().to_bytes();
    let chat_body_str = String::from_utf8(chat_body_bytes.to_vec()).unwrap();
    assert!(!chat_body_str.contains("upstream_inference_cost"));
    assert!(!chat_body_str.contains("cost_details"));
    assert!(!chat_body_str.contains("is_byok"));
    let chat_body: Value = serde_json::from_slice(&chat_body_bytes).unwrap();
    assert_eq!(chat_body["model"], "fast");
    assert_eq!(chat_body["usage"]["prompt_tokens"], 9);
    assert_eq!(chat_body["usage"]["completion_tokens"], 5);

    // 3. Streaming SSE Chat Completion + Commercial Boundary Verification
    let stream_resp = app
        .clone()
        .oneshot(
            Request::post("/v1/chat/completions")
                .header("authorization", format!("Bearer {}", key_a.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({
                        "model": "fast",
                        "stream": true,
                        "messages": [{"role": "user", "content": "Stream hello"}]
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(stream_resp.status(), StatusCode::OK);
    for header in ["x-niu-operation-id", "x-niu-attempt-id"] {
        assert!(
            stream_resp.headers()[header]
                .to_str()
                .unwrap()
                .parse::<Uuid>()
                .is_ok()
        );
    }
    let stream_text = String::from_utf8(
        stream_resp
            .into_body()
            .collect()
            .await
            .unwrap()
            .to_bytes()
            .to_vec(),
    )
    .unwrap();
    assert!(stream_text.contains("data: [DONE]"));
    assert!(!stream_text.contains("upstream_inference_cost"));
    assert!(!stream_text.contains("cost_details"));
    assert!(!stream_text.contains("is_byok"));

    // 4. Responses API & Embeddings API End-to-End
    let responses_resp = app
        .clone()
        .oneshot(
            Request::post("/v1/responses")
                .header("authorization", format!("Bearer {}", key_a.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({"model": "fast", "input": "ping"}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(responses_resp.status(), StatusCode::OK);
    for header in ["x-niu-operation-id", "x-niu-attempt-id"] {
        assert!(
            responses_resp.headers()[header]
                .to_str()
                .unwrap()
                .parse::<Uuid>()
                .is_ok()
        );
    }
    let responses_json: Value = serde_json::from_slice(
        &responses_resp
            .into_body()
            .collect()
            .await
            .unwrap()
            .to_bytes(),
    )
    .unwrap();
    assert_eq!(responses_json["model"], "fast");
    assert_eq!(responses_json["status"], "completed");

    let embed_resp = app
        .clone()
        .oneshot(
            Request::post("/v1/embeddings")
                .header("authorization", format!("Bearer {}", key_a.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({"model": "fast", "input": ["alpha", "beta"], "dimensions": 4})
                        .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(embed_resp.status(), StatusCode::OK);
    let embed_json: Value =
        serde_json::from_slice(&embed_resp.into_body().collect().await.unwrap().to_bytes())
            .unwrap();
    assert_eq!(embed_json["model"], "fast");
    assert_eq!(embed_json["data"].as_array().unwrap().len(), 2);

    // 5. Cross-Workspace Isolation on /v1/generations/{id}
    state.gateway_writes.shutdown().await;
    let own_gen = app
        .clone()
        .oneshot(
            Request::get(format!("/v1/generations/{attempt_id}"))
                .header("authorization", format!("Bearer {}", key_a.token))
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(own_gen.status(), StatusCode::OK);
    let generation: Value =
        serde_json::from_slice(&own_gen.into_body().collect().await.unwrap().to_bytes()).unwrap();
    super::api_migrations::validate_response("/v1/generations/{id}", "get", "200", &generation);
    assert_eq!(generation["data"]["id"], attempt_id.to_string());
    assert_eq!(generation["data"]["usage"]["prompt_tokens"], "9");
    assert_eq!(generation["data"]["usage"]["completion_tokens"], "5");
    // This fixture has no customer tariff: an absent retail charge must stay
    // absent, even when the Provider supplied procurement cost in its response.
    assert!(generation["data"]["customer_charge"]["amount_nanos"].is_null());
    for confidential in [
        "cost_details",
        "upstream_inference_cost",
        "supplier_cost",
        "margin",
    ] {
        assert!(!generation.to_string().contains(confidential));
    }

    let foreign_gen = app
        .clone()
        .oneshot(
            Request::get(format!("/v1/generations/{attempt_id}"))
                .header("authorization", format!("Bearer {}", key_b.token))
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(foreign_gen.status(), StatusCode::NOT_FOUND);

    // 6. Guardrail Policy Activation & Live Input Blocking Before Egress
    let guardrail_path = format!(
        "/admin/v1/organizations/{org}/projects/{}/guardrails",
        workspace_a.project_id
    );
    let activate_resp = app
        .clone()
        .oneshot(
            Request::put(&guardrail_path)
                .header(
                    "authorization",
                    "Bearer niu-test-admin-token-that-is-long-1234",
                )
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({
                        "expected_revision": 0,
                        "policy": {
                            "schema_version": 1,
                            "name": "Block secret marker",
                            "models": {"mode": "allow_all"},
                            "providers": {"mode": "allow_all"},
                            "input_rules": [{
                                "pattern": "BLOCK_THIS_PROMPT",
                                "action": "block"
                            }]
                        }
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(activate_resp.status(), StatusCode::OK);

    let calls_before_blocked = upstream_calls.load(Ordering::SeqCst);
    let blocked_resp = app
        .clone()
        .oneshot(
            Request::post("/v1/chat/completions")
                .header("authorization", format!("Bearer {}", key_a.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({
                        "model": "fast",
                        "messages": [{"role": "user", "content": "Please process BLOCK_THIS_PROMPT now"}]
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(blocked_resp.status(), StatusCode::FORBIDDEN);
    assert_eq!(
        upstream_calls.load(Ordering::SeqCst),
        calls_before_blocked,
        "blocked guardrail input must never reach upstream provider"
    );

    server.abort();
}
