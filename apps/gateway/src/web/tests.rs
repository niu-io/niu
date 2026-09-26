use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, Request, StatusCode},
    routing::post,
};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use sqlx::PgPool;
use tokio::net::TcpListener;
use tower::ServiceExt;
use uuid::Uuid;

use crate::{
    config::AppConfig,
    state::{AppState, TokenSet},
};

use super::{
    inference::{
        responses_usage, valid_chat_completion_features, valid_responses_response,
        validate_chat_capabilities, validate_embedding_request, validate_responses_request,
    },
    router,
};

#[derive(Clone, Default)]
struct Captured(Arc<Mutex<Option<(HeaderMap, Value)>>>);

async fn provider(
    State(captured): State<Captured>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Json<Value> {
    *captured.0.lock().expect("capture mutex") = Some((headers, body));
    Json(json!({
        "id": "upstream-id",
        "created": 123,
        "model": "provider-model",
        "choices": [{
            "index": 0,
            "message": {"role": "assistant", "content": "ok"},
            "finish_reason": "stop"
        }],
        "usage": {"prompt_tokens": 2, "completion_tokens": 1, "total_tokens": 3}
    }))
}

async fn tool_provider(
    State(captured): State<Captured>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Json<Value> {
    let response = if body.get("response_format").is_some() {
        let content =
            if body.pointer("/response_format/json_schema/name") == Some(&json!("invalid")) {
                "not-json"
            } else {
                "{\"answer\":42}"
            };
        json!({
            "id": "upstream-structured-response",
            "model": "provider-secret-model",
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": content},
                "finish_reason": "stop"
            }],
            "usage": {"prompt_tokens": 11, "completion_tokens": 3, "total_tokens": 14}
        })
    } else {
        json!({
            "id": "upstream-tool-response",
            "model": "provider-secret-model",
            "choices": [{
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": null,
                    "tool_calls": [{
                        "id": "call_weather_1",
                        "type": "function",
                        "function": {
                            "name": "lookup_weather",
                            "arguments": "{\"city\":\"Paris\"}"
                        }
                    }]
                },
                "finish_reason": "tool_calls"
            }],
            "usage": {"prompt_tokens": 19, "completion_tokens": 8, "total_tokens": 27}
        })
    };
    *captured.0.lock().expect("capture mutex") = Some((headers, body));
    Json(response)
}

fn tool_stream_payload() -> Vec<u8> {
    let events = [
        json!({"choices":[{"index":0,"delta":{"role":"assistant","tool_calls":[{"index":0,"id":"call_weather_1","type":"function","function":{"name":"lookup_weather","arguments":"{\"city\":"}}]}}]}),
        json!({"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\"Paris\"}"}}]},"finish_reason":null}]}),
        json!({"choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}),
        json!({"choices":[],"usage":{"prompt_tokens":19,"completion_tokens":8,"total_tokens":27}}),
    ];
    let mut payload = events
        .iter()
        .map(|event| format!("data: {event}\n\n"))
        .collect::<String>();
    payload.push_str("data: [DONE]\n\n");
    payload.into_bytes()
}

async fn streaming_tool_provider(
    State(captured): State<Captured>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> (
    [(axum::http::header::HeaderName, &'static str); 1],
    axum::body::Body,
) {
    *captured.0.lock().expect("capture mutex") = Some((headers, body));
    let payload = tool_stream_payload();
    let chunks = payload
        .chunks(17)
        .map(|chunk| Ok::<_, std::io::Error>(axum::body::Bytes::copy_from_slice(chunk)))
        .collect::<Vec<_>>();
    (
        [(axum::http::header::CONTENT_TYPE, "text/event-stream")],
        axum::body::Body::from_stream(futures_util::stream::iter(chunks)),
    )
}

async fn responses_provider(
    State(captured): State<Captured>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Json<Value> {
    let output = if body.get("input").and_then(Value::as_str) == Some("broken") {
        json!([{
            "id":"call_1","type":"function_call","call_id":"call_1",
            "name":"unconfigured_tool","arguments":"{}"
        }])
    } else {
        json!([{
            "id":"msg_1","type":"message","status":"completed","role":"assistant",
            "content":[{"type":"output_text","text":"Hello from Responses","annotations":[]}]
        }])
    };
    *captured.0.lock().expect("capture mutex") = Some((headers, body));
    Json(json!({
        "id":"resp_test_1","object":"response","status":"completed",
        "created_at":1750000000,"model":"provider-secret-model","output":output,
        "usage":{"input_tokens":4,"output_tokens":2,"total_tokens":6}
    }))
}

async fn embedding_provider(
    State(captured): State<Captured>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Json<Value> {
    let item_count = match body.get("input") {
        Some(Value::Array(items)) => items.len(),
        Some(Value::String(_)) => 1,
        _ => 0,
    };
    let dimensions = body.get("dimensions").and_then(Value::as_u64).unwrap_or(2) as usize;
    let base64 = body.get("encoding_format").and_then(Value::as_str) == Some("base64");
    let data = (0..item_count)
        .map(|index| {
            json!({
                "object": "embedding",
                "index": index,
                "embedding": if base64 { json!("AA==") } else { json!(vec![0.1; dimensions]) }
            })
        })
        .collect::<Vec<_>>();
    *captured.0.lock().expect("capture mutex") = Some((headers, body));
    Json(json!({
        "object": "list",
        "data": data,
        "model": "provider-secret-model",
        "usage": {"prompt_tokens": 5, "total_tokens": 5}
    }))
}

fn test_state(api_base: Option<String>, pool: sqlx::PgPool) -> AppState {
    let mut config: AppConfig = toml::from_str(
        r#"
                [models.fast]
                provider = "openai"
                upstream_model = "provider-secret-model"
                api_key_env = "PROVIDER_KEY"
                supports_embeddings = true
                supports_embedding_dimensions = true
                supports_embedding_base64 = true
            "#,
    )
    .expect("valid test config");
    config.models.get_mut("fast").expect("model route").api_base = api_base;
    let admin_tokens = TokenSet::parse(
        "NIU_ADMIN_TOKENS",
        "niu-test-admin-token-that-is-long-1234".into(),
    )
    .expect("valid test admin token");
    AppState::new(
        config,
        niu_storage::Store::from_pool(pool),
        admin_tokens,
        reqwest::Client::new(),
        HashMap::from([("PROVIDER_KEY".into(), "provider-secret-token".into())]),
    )
}

async fn admin_call(app: &Router, path: &str, body: Value) -> Value {
    let response = app
        .clone()
        .oneshot(
            Request::post(path)
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
    assert_eq!(response.status(), StatusCode::CREATED);
    serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap()
}

mod accounting;
mod admin;
mod executions;
mod inference;
mod quota;
