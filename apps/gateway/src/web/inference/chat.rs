use std::{sync::atomic::Ordering, time::Duration};

use axum::{
    Json,
    extract::State,
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use litellm_core::chat_completions::{
    chat_completions, chat_completions_decline_reason, types::ChatCompletionsRequest,
};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{error::ApiError, state::AppState};

use super::common::*;

struct ChatExecution<'a> {
    public_model: &'a str,
    model: &'a crate::config::ModelConfig,
    api_key: String,
    body: Value,
    messages: Value,
    native_optional_params: Option<serde_json::Map<String, Value>>,
    stream: bool,
    timeout: Duration,
    scope: niu_storage::TenantScope,
    attempt: Uuid,
}

struct StreamExecution<'a> {
    public_model: &'a str,
    model: &'a crate::config::ModelConfig,
    api_key: String,
    body: Value,
    timeout: Duration,
    scope: niu_storage::TenantScope,
    attempt: Uuid,
}

pub(in crate::web) async fn chat(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(mut body): Json<Value>,
) -> Result<Response, ApiError> {
    let principal = state.authorize_api(bearer(&headers)).await?;
    let public_model = body
        .get("model")
        .and_then(Value::as_str)
        .filter(|model| !model.is_empty())
        .ok_or_else(|| ApiError::invalid_request("A model name is required"))?
        .to_owned();
    if !principal.allows_model(&public_model) {
        return Err(ApiError::not_found());
    }
    let model = state
        .config
        .models
        .get(&public_model)
        .ok_or_else(ApiError::not_found)?;
    let stream = match body.get("stream") {
        None => false,
        Some(Value::Bool(value)) => *value,
        _ => return Err(ApiError::invalid_request("stream must be a boolean")),
    };
    let messages = body
        .get("messages")
        .filter(|messages| messages.is_array())
        .cloned()
        .ok_or_else(|| ApiError::invalid_request("messages must be an array"))?;
    if messages.as_array().is_none_or(Vec::is_empty) {
        return Err(ApiError::invalid_request(
            "messages must contain at least one message",
        ));
    }
    if stream && model.provider != "openai" {
        return Err(ApiError::unsupported());
    }
    if !matches!(model.provider.as_str(), "openai" | "anthropic" | "bedrock") {
        return Err(ApiError::invalid_request(
            "Provider is not supported by this gateway",
        ));
    }
    validate_chat_capabilities(&body, model, stream)?;
    if let Some(price) = &model.pricing {
        validate_priced_request(&mut body, price)?;
    }
    let native_optional_params = if model.provider == "openai" {
        None
    } else {
        let optional_params = map_native_chat_params(&body, &model.provider)?;
        if chat_completions_decline_reason(
            &model.upstream_model,
            Some(&model.provider),
            messages.clone(),
            &optional_params,
        )
        .is_some()
        {
            return Err(ApiError::unsupported());
        }
        Some(optional_params)
    };
    let api_key = state
        .provider_key(&model.api_key_env)
        .ok_or_else(ApiError::unavailable)?
        .to_owned();
    let timeout = Duration::from_secs(state.config.server.request_timeout_seconds);
    state.requests.fetch_add(1, Ordering::Relaxed);
    let dispatch = begin_attempt(&state, &principal, &public_model, model, None).await?;
    let result = execute_chat(
        &state,
        ChatExecution {
            public_model: &public_model,
            model,
            api_key,
            body,
            messages,
            native_optional_params,
            stream,
            timeout,
            scope: dispatch.scope,
            attempt: dispatch.attempt,
        },
    )
    .await;
    Ok(finalize_response(&state, dispatch, result).await)
}

async fn execute_chat(
    state: &AppState,
    execution: ChatExecution<'_>,
) -> Result<ProviderResponse, ApiError> {
    let ChatExecution {
        public_model,
        model,
        api_key,
        body,
        messages,
        native_optional_params,
        stream,
        timeout,
        scope,
        attempt,
    } = execution;
    if stream {
        if model.provider != "openai" {
            state.failures.fetch_add(1, Ordering::Relaxed);
            return Err(ApiError::unsupported());
        }
        return stream_openai(
            state,
            StreamExecution {
                public_model,
                model,
                api_key,
                body,
                timeout,
                scope,
                attempt,
            },
        )
        .await;
    }

    if model.provider == "openai" {
        return complete_openai(state, public_model, model, api_key, body, timeout).await;
    }

    let optional_params = native_optional_params.ok_or_else(ApiError::unsupported)?;

    // The native adapter normalizes absent usage fields to zero. Treat only
    // complete, positive token counts as evidence until the adapter exposes
    // raw-field provenance; a missing counter must never become billable zero.
    let usage_attempt = state.usage.begin();
    let result = chat_completions(ChatCompletionsRequest {
        model: &model.upstream_model,
        messages,
        optional_params,
        api_key: Some(&api_key),
        api_base: model.api_base.as_deref(),
        custom_llm_provider: Some(&model.provider),
        extra_headers: None,
        timeout: Some(timeout),
    })
    .await;
    let response = match result {
        Ok(response) => response,
        Err(_error) => {
            state.failures.fetch_add(1, Ordering::Relaxed);
            return Err(ApiError::upstream());
        }
    };
    let mut value = serde_json::to_value(response).map_err(|_| ApiError::upstream())?;
    let usage = validated_native_chat_usage(&value["usage"]);
    if let Some((prompt, completion)) = usage {
        usage_attempt.report(&json!({
            "prompt_tokens": prompt,
            "completion_tokens": completion
        }));
    }
    if let Some(object) = value.as_object_mut() {
        object.insert(
            "id".to_owned(),
            json!(format!("chatcmpl-{}", Uuid::new_v4())),
        );
        object.insert("object".to_owned(), json!("chat.completion"));
        object.insert("model".to_owned(), json!(public_model));
    }
    Ok(ProviderResponse {
        response: Json(value).into_response(),
        completed: true,
        usage,
    })
}

fn validated_native_chat_usage(usage: &Value) -> Option<(u64, u64)> {
    let prompt = usage.get("prompt_tokens")?.as_u64()?;
    let completion = usage.get("completion_tokens")?.as_u64()?;
    let total = usage.get("total_tokens")?.as_u64()?;
    let input_text = usage
        .pointer("/prompt_tokens_details/text_tokens")?
        .as_u64()?;
    if prompt == 0
        || completion == 0
        || input_text == 0
        || prompt.checked_add(completion)? != total
        || prompt > i64::MAX as u64
        || completion > i64::MAX as u64
    {
        return None;
    }
    Some((prompt, completion))
}

async fn complete_openai(
    state: &AppState,
    public_model: &str,
    model: &crate::config::ModelConfig,
    api_key: String,
    mut body: Value,
    timeout: Duration,
) -> Result<ProviderResponse, ApiError> {
    let base = model
        .api_base
        .as_deref()
        .unwrap_or("https://api.openai.com/v1");
    let endpoint = format!("{}/chat/completions", base.trim_end_matches('/'));
    let Some(object) = body.as_object_mut() else {
        return Err(ApiError::invalid_request(
            "The request body must be a JSON object",
        ));
    };
    object.insert("model".to_owned(), json!(model.upstream_model));
    strip_server_control_fields(object);

    let usage_attempt = state.usage.begin();
    let upstream = state
        .http
        .post(endpoint)
        .bearer_auth(api_key)
        .timeout(timeout)
        .json(&body)
        .send()
        .await
        .map_err(|_| {
            state.failures.fetch_add(1, Ordering::Relaxed);
            ApiError::upstream()
        })?;
    if !upstream.status().is_success() {
        state.failures.fetch_add(1, Ordering::Relaxed);
        return Err(ApiError::upstream());
    }
    let mut value: Value = upstream.json().await.map_err(|_| {
        state.failures.fetch_add(1, Ordering::Relaxed);
        ApiError::upstream()
    })?;
    if !value.get("choices").is_some_and(Value::is_array)
        || !valid_chat_completion_features(&value, &body)
    {
        state.failures.fetch_add(1, Ordering::Relaxed);
        return Err(ApiError::upstream());
    }
    if let Some(object) = value.as_object_mut() {
        object
            .entry("id")
            .or_insert_with(|| json!(format!("chatcmpl-{}", Uuid::new_v4())));
        object.insert("object".to_owned(), json!("chat.completion"));
        object.insert("model".to_owned(), json!(public_model));
    }
    let usage = value["usage"]["prompt_tokens"]
        .as_u64()
        .zip(value["usage"]["completion_tokens"].as_u64());
    usage_attempt.report(&value["usage"]);
    Ok(ProviderResponse {
        response: Json(value).into_response(),
        completed: true,
        usage,
    })
}

async fn stream_openai(
    state: &AppState,
    execution: StreamExecution<'_>,
) -> Result<ProviderResponse, ApiError> {
    let StreamExecution {
        public_model,
        model,
        api_key,
        mut body,
        timeout,
        scope,
        attempt,
    } = execution;
    let base = model
        .api_base
        .as_deref()
        .unwrap_or("https://api.openai.com/v1");
    let endpoint = format!("{}/chat/completions", base.trim_end_matches('/'));
    if let Some(object) = body.as_object_mut() {
        object.insert("model".to_owned(), json!(model.upstream_model));
        strip_server_control_fields(object);
    }
    let usage_attempt = state.usage.begin();
    let upstream = state
        .http
        .post(endpoint)
        .bearer_auth(api_key)
        .header(header::ACCEPT, "text/event-stream")
        .timeout(timeout)
        .json(&body)
        .send()
        .await
        .map_err(|_| {
            state.failures.fetch_add(1, Ordering::Relaxed);
            ApiError::upstream()
        })?;
    let status =
        StatusCode::from_u16(upstream.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    if !status.is_success() {
        state.failures.fetch_add(1, Ordering::Relaxed);
        return Err(ApiError::upstream());
    }
    let content_type = upstream
        .headers()
        .get(header::CONTENT_TYPE)
        .cloned()
        .ok_or_else(|| {
            state.failures.fetch_add(1, Ordering::Relaxed);
            ApiError::upstream()
        })?;
    if content_type
        .to_str()
        .ok()
        .and_then(|v| v.split(';').next())
        .is_none_or(|v| !v.trim().eq_ignore_ascii_case("text/event-stream"))
    {
        state.failures.fetch_add(1, Ordering::Relaxed);
        return Err(ApiError::upstream());
    }
    let mut response = Response::new(crate::streaming::tracked_body(
        upstream.bytes_stream(),
        crate::streaming::StreamAttempt {
            store: state.store.clone(),
            scope,
            id: attempt,
            usage: usage_attempt,
            failures: state.failures.clone(),
        },
    ));
    *response.status_mut() = status;
    response
        .headers_mut()
        .insert(header::CONTENT_TYPE, content_type);
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
    response.headers_mut().insert(
        "x-niu-model",
        HeaderValue::from_str(public_model).unwrap_or(HeaderValue::from_static("unknown")),
    );
    Ok(ProviderResponse {
        response,
        completed: false,
        usage: None,
    })
}

fn map_native_chat_params(
    body: &Value,
    provider: &str,
) -> Result<serde_json::Map<String, Value>, ApiError> {
    let mappings: &[(&str, &str)] = match provider {
        "anthropic" => &[
            ("max_tokens", "max_tokens"),
            ("temperature", "temperature"),
            ("top_p", "top_p"),
            ("stop", "stop_sequences"),
        ],
        "bedrock" => &[
            ("max_tokens", "maxTokens"),
            ("temperature", "temperature"),
            ("top_p", "topP"),
            ("stop", "stopSequences"),
        ],
        _ => return Err(ApiError::unsupported()),
    };
    let mut params = body
        .as_object()
        .cloned()
        .ok_or_else(|| ApiError::invalid_request("The request body must be a JSON object"))?;
    for field in ["model", "messages", "stream", "stream_options"] {
        params.remove(field);
    }
    strip_server_control_fields(&mut params);

    let mut mapped = serde_json::Map::new();
    for (name, value) in params {
        let target = mappings
            .iter()
            .find_map(|(source, target)| (*source == name).then_some(*target))
            .ok_or_else(ApiError::unsupported)?;
        let value = match name.as_str() {
            "max_tokens"
                if value
                    .as_u64()
                    .is_some_and(|tokens| (1..=1_000_000).contains(&tokens)) =>
            {
                value
            }
            "temperature"
                if value
                    .as_f64()
                    .is_some_and(|temperature| (0.0..=1.0).contains(&temperature)) =>
            {
                value
            }
            "top_p"
                if value
                    .as_f64()
                    .is_some_and(|top_p| (0.0..=1.0).contains(&top_p)) =>
            {
                value
            }
            "stop" => {
                let stops = match value {
                    Value::String(stop) if !stop.is_empty() && stop.len() <= 1000 => {
                        vec![Value::String(stop)]
                    }
                    Value::Array(stops)
                        if !stops.is_empty()
                            && stops.len() <= 4
                            && stops.iter().all(|stop| {
                                stop.as_str()
                                    .is_some_and(|stop| !stop.is_empty() && stop.len() <= 1000)
                            }) =>
                    {
                        stops
                    }
                    _ => return Err(ApiError::invalid_request("stop is invalid for this route")),
                };
                Value::Array(stops)
            }
            _ => {
                return Err(ApiError::invalid_request(
                    "A native chat parameter is invalid",
                ));
            }
        };
        mapped.insert(target.to_owned(), value);
    }
    Ok(mapped)
}

pub(in crate::web) fn validate_chat_capabilities(
    body: &Value,
    model: &crate::config::ModelConfig,
    stream: bool,
) -> Result<(), ApiError> {
    let object = body
        .as_object()
        .ok_or_else(|| ApiError::invalid_request("The request body must be a JSON object"))?;

    let tool_names = if let Some(tools) = object.get("tools") {
        let Some(tools) = tools
            .as_array()
            .filter(|tools| !tools.is_empty() && tools.len() <= 128)
        else {
            return Err(ApiError::invalid_request(
                "tools must contain between 1 and 128 function definitions",
            ));
        };
        let mut names = std::collections::HashSet::with_capacity(tools.len());
        for tool in tools {
            let function = tool
                .get("function")
                .filter(|_| tool.get("type").and_then(Value::as_str) == Some("function"))
                .ok_or_else(|| ApiError::invalid_request("Each tool must be a function tool"))?;
            let name = function
                .get("name")
                .and_then(Value::as_str)
                .filter(|name| {
                    !name.is_empty()
                        && name.len() <= 64
                        && name
                            .bytes()
                            .all(|byte| byte.is_ascii_alphanumeric() || b"_-".contains(&byte))
                })
                .ok_or_else(|| {
                    ApiError::invalid_request("Each function tool needs a valid name")
                })?;
            if !names.insert(name) {
                return Err(ApiError::invalid_request(
                    "Function tool names must be unique",
                ));
            }
            if let Some(parameters) = function.get("parameters")
                && !parameters.is_object()
            {
                return Err(ApiError::invalid_request(
                    "Function tool parameters must be a JSON Schema object",
                ));
            }
            if function
                .get("strict")
                .is_some_and(|strict| !strict.is_boolean())
            {
                return Err(ApiError::invalid_request("Tool strict must be a boolean"));
            }
        }
        Some(names)
    } else {
        None
    };

    if let Some(choice) = object.get("tool_choice") {
        match choice {
            Value::String(choice) if matches!(choice.as_str(), "none" | "auto" | "required") => {
                if choice != "none" && tool_names.is_none() {
                    return Err(ApiError::invalid_request(
                        "tool_choice requires a tools array",
                    ));
                }
            }
            Value::Object(choice)
                if choice.get("type").and_then(Value::as_str) == Some("function") =>
            {
                let name = choice
                    .get("function")
                    .and_then(|function| function.get("name"))
                    .and_then(Value::as_str)
                    .ok_or_else(|| {
                        ApiError::invalid_request("tool_choice needs a function name")
                    })?;
                if !tool_names
                    .as_ref()
                    .is_some_and(|names| names.contains(name))
                {
                    return Err(ApiError::invalid_request(
                        "tool_choice must name one of the declared tools",
                    ));
                }
            }
            _ => return Err(ApiError::invalid_request("Invalid tool_choice")),
        }
    }

    let has_tool_semantics = tool_names.is_some()
        || object
            .get("messages")
            .and_then(Value::as_array)
            .is_some_and(|messages| {
                messages.iter().any(|message| {
                    message.get("role").and_then(Value::as_str) == Some("tool")
                        || message.get("tool_calls").is_some()
                })
            });
    if has_tool_semantics {
        if !model.supports_tool_calls {
            return Err(ApiError::unsupported());
        }
        if stream && !model.supports_streaming_tool_calls {
            return Err(ApiError::unsupported());
        }
    }

    if let Some(format) = object.get("response_format") {
        let format = format
            .as_object()
            .ok_or_else(|| ApiError::invalid_request("response_format must be an object"))?;
        match format.get("type").and_then(Value::as_str) {
            Some("text") => {}
            Some("json_object") => {
                if !model.supports_structured_output || stream {
                    return Err(ApiError::unsupported());
                }
            }
            Some("json_schema") => {
                let schema = format
                    .get("json_schema")
                    .and_then(Value::as_object)
                    .ok_or_else(|| {
                        ApiError::invalid_request("json_schema response format is required")
                    })?;
                if schema
                    .get("name")
                    .and_then(Value::as_str)
                    .is_none_or(|name| name.is_empty() || name.len() > 64)
                    || !schema.get("schema").is_some_and(Value::is_object)
                    || schema
                        .get("strict")
                        .is_some_and(|strict| !strict.is_boolean())
                {
                    return Err(ApiError::invalid_request(
                        "json_schema requires a name and JSON Schema object",
                    ));
                }
                if !model.supports_structured_output || stream {
                    return Err(ApiError::unsupported());
                }
            }
            _ => {
                return Err(ApiError::invalid_request(
                    "Unsupported response_format type",
                ));
            }
        }
    }

    if has_tool_semantics
        && matches!(
            body.pointer("/response_format/type")
                .and_then(Value::as_str),
            Some("json_object" | "json_schema")
        )
    {
        return Err(ApiError::unsupported());
    }

    Ok(())
}

pub(in crate::web) fn valid_chat_completion_features(response: &Value, request: &Value) -> bool {
    let Some(choices) = response.get("choices").and_then(Value::as_array) else {
        return false;
    };
    let tool_names: std::collections::HashSet<&str> = request
        .get("tools")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|tool| tool.pointer("/function/name").and_then(Value::as_str))
        .collect();
    let json_mode = matches!(
        request
            .pointer("/response_format/type")
            .and_then(Value::as_str),
        Some("json_object" | "json_schema")
    );

    choices.iter().all(|choice| {
        let Some(message) = choice.get("message").filter(|value| value.is_object()) else {
            return false;
        };
        let calls = match message.get("tool_calls") {
            None | Some(Value::Null) => None,
            Some(Value::Array(calls)) if !calls.is_empty() => Some(calls),
            _ => return false,
        };
        if choice.get("finish_reason").and_then(Value::as_str) == Some("tool_calls")
            && calls.is_none()
        {
            return false;
        }
        if let Some(calls) = calls {
            if tool_names.is_empty()
                || choice.get("finish_reason").and_then(Value::as_str) != Some("tool_calls")
            {
                return false;
            }
            for call in calls {
                let Some(name) = call.pointer("/function/name").and_then(Value::as_str) else {
                    return false;
                };
                if call.get("type").and_then(Value::as_str) != Some("function")
                    || call
                        .get("id")
                        .and_then(Value::as_str)
                        .is_none_or(str::is_empty)
                    || !tool_names.contains(name)
                    || call
                        .pointer("/function/arguments")
                        .and_then(Value::as_str)
                        .and_then(|arguments| serde_json::from_str::<Value>(arguments).ok())
                        .is_none_or(|arguments| !arguments.is_object())
                {
                    return false;
                }
            }
        }
        if json_mode && message.get("refusal").and_then(Value::as_str).is_none() {
            let Some(content) = message.get("content").and_then(Value::as_str) else {
                return false;
            };
            if serde_json::from_str::<Value>(content).is_err() {
                return false;
            }
        }
        true
    })
}
