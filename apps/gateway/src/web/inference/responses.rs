use std::{sync::atomic::Ordering, time::Duration};

use axum::{
    Json,
    extract::State,
    http::HeaderMap,
    response::{IntoResponse, Response},
};
use serde_json::{Value, json};

use crate::{error::ApiError, state::AppState};

use super::common::*;

#[derive(Clone, Copy)]
pub(in crate::web) struct ResponsesRequestBounds {
    pub(in crate::web) input_bytes: usize,
    pub(in crate::web) max_output_tokens: Option<i64>,
}

pub(in crate::web) async fn responses(
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
    let resolved = crate::vendors::resolve_model(&state, &public_model).await?;
    let model = &resolved.model;
    let bounds = validate_responses_request(&mut body, model.pricing.as_ref())?;
    if !model.protocol().is_openai_compatible() || !model.supports_responses {
        return Err(ApiError::unsupported());
    }
    if let Some(price) = &model.pricing
        && bounds.input_bytes > price.max_input_tokens as usize
    {
        return Err(ApiError::invalid_request(
            "Responses input exceeds the priced route's conservative UTF-8 byte bound",
        ));
    }
    let api_key = resolved.api_key;
    let timeout = Duration::from_secs(state.config.server.request_timeout_seconds);
    state.requests.fetch_add(1, Ordering::Relaxed);
    let dispatch = begin_attempt(
        &state,
        &principal,
        &public_model,
        model,
        bounds.max_output_tokens,
    )
    .await?;
    let result = execute_responses(&state, &public_model, model, api_key, body, timeout).await;
    Ok(finalize_response(&state, dispatch, result).await)
}

pub(in crate::web) fn validate_responses_request(
    body: &mut Value,
    price: Option<&crate::config::RoutePricing>,
) -> Result<ResponsesRequestBounds, ApiError> {
    let object = body
        .as_object_mut()
        .ok_or_else(|| ApiError::invalid_request("The request body must be a JSON object"))?;
    const ALLOWED: &[&str] = &[
        "model",
        "input",
        "instructions",
        "max_output_tokens",
        "temperature",
        "top_p",
        "metadata",
        "user",
        "stream",
    ];
    if object.keys().any(|key| !ALLOWED.contains(&key.as_str())) {
        return Err(ApiError::invalid_request(
            "Unsupported field in Responses request",
        ));
    }
    match object.get("stream") {
        None | Some(Value::Bool(false)) => {}
        Some(Value::Bool(true)) => return Err(ApiError::unsupported()),
        _ => return Err(ApiError::invalid_request("stream must be a boolean")),
    }
    let input_bytes = object
        .get("input")
        .and_then(Value::as_str)
        .filter(|input| !input.is_empty())
        .map(str::len)
        .ok_or_else(|| ApiError::invalid_request("input must be a non-empty text string"))?;
    let instructions_bytes = match object.get("instructions") {
        None => 0,
        Some(Value::String(instructions)) => instructions.len(),
        _ => return Err(ApiError::invalid_request("instructions must be a string")),
    };
    let input_bytes = input_bytes
        .checked_add(instructions_bytes)
        .ok_or_else(|| ApiError::invalid_request("Responses input is too large"))?;
    if object
        .get("user")
        .is_some_and(|user| user.as_str().is_none_or(|user| user.len() > 512))
    {
        return Err(ApiError::invalid_request(
            "user must be a string of at most 512 bytes",
        ));
    }
    if object.get("metadata").is_some_and(|metadata| {
        metadata.as_object().is_none_or(|metadata| {
            metadata.len() > 16
                || metadata.iter().any(|(key, value)| {
                    key.len() > 64 || value.as_str().is_none_or(|value| value.len() > 512)
                })
        })
    }) {
        return Err(ApiError::invalid_request(
            "metadata must contain at most 16 string values with bounded keys and values",
        ));
    }
    for (name, minimum, maximum) in [("temperature", 0.0, 2.0), ("top_p", 0.0, 1.0)] {
        if object.get(name).is_some_and(|value| {
            value
                .as_f64()
                .is_none_or(|value| !(minimum..=maximum).contains(&value))
        }) {
            return Err(ApiError::invalid_request(
                "temperature or top_p is outside its supported range",
            ));
        }
    }

    let mut max_output_tokens = match object.get("max_output_tokens") {
        None => None,
        Some(value) => Some(
            value
                .as_i64()
                .filter(|value| (1..=1_000_000).contains(value))
                .ok_or_else(|| {
                    ApiError::invalid_request(
                        "max_output_tokens must be an integer from 1 to 1000000",
                    )
                })?,
        ),
    };
    if let Some(price) = price {
        if let Some(output) = max_output_tokens {
            if output > price.max_output_tokens {
                return Err(ApiError::invalid_request(
                    "Output limit exceeds the priced route bound",
                ));
            }
        } else {
            max_output_tokens = Some(price.max_output_tokens);
            object.insert("max_output_tokens".into(), json!(price.max_output_tokens));
        }
    }
    Ok(ResponsesRequestBounds {
        input_bytes,
        max_output_tokens,
    })
}

async fn execute_responses(
    state: &AppState,
    public_model: &str,
    model: &crate::config::ModelConfig,
    api_key: String,
    mut body: Value,
    timeout: Duration,
) -> Result<ProviderResponse, ApiError> {
    let base = model.endpoint_base().ok_or_else(ApiError::unavailable)?;
    let endpoint = format!("{}/responses", base.trim_end_matches('/'));
    let object = body
        .as_object_mut()
        .ok_or_else(|| ApiError::invalid_request("The request body must be a JSON object"))?;
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
    if !valid_responses_response(&value) {
        state.failures.fetch_add(1, Ordering::Relaxed);
        return Err(ApiError::upstream());
    }
    let usage = responses_usage(&value);
    if let Some((input_tokens, output_tokens)) = usage {
        usage_attempt.report(&json!({
            "prompt_tokens": input_tokens,
            "completion_tokens": output_tokens
        }));
    }
    if let Some(object) = value.as_object_mut() {
        object.insert("model".to_owned(), json!(public_model));
    }
    Ok(ProviderResponse {
        response: Json(value).into_response(),
        completed: true,
        usage,
    })
}

pub(in crate::web) fn valid_responses_response(response: &Value) -> bool {
    if response
        .get("id")
        .and_then(Value::as_str)
        .is_none_or(str::is_empty)
        || response.get("object").and_then(Value::as_str) != Some("response")
        || !matches!(
            response.get("status").and_then(Value::as_str),
            Some("completed" | "incomplete")
        )
    {
        return false;
    }
    let Some(output) = response.get("output").and_then(Value::as_array) else {
        return false;
    };
    if output.is_empty() {
        return false;
    }
    let mut has_text_message = false;
    for item in output {
        match item.get("type").and_then(Value::as_str) {
            Some("reasoning") => {}
            Some("message") if item.get("role").and_then(Value::as_str) == Some("assistant") => {
                let Some(content) = item.get("content").and_then(Value::as_array) else {
                    return false;
                };
                if content.is_empty() {
                    return false;
                }
                for part in content {
                    match part.get("type").and_then(Value::as_str) {
                        Some("output_text")
                            if part.get("text").and_then(Value::as_str).is_some() =>
                        {
                            has_text_message = true;
                        }
                        Some("refusal")
                            if part.get("refusal").and_then(Value::as_str).is_some() =>
                        {
                            has_text_message = true;
                        }
                        _ => return false,
                    }
                }
            }
            _ => return false,
        }
    }
    has_text_message
}

pub(in crate::web) fn responses_usage(response: &Value) -> Option<(u64, u64)> {
    response
        .get("usage")
        .and_then(|usage| {
            usage
                .get("input_tokens")
                .and_then(Value::as_u64)
                .zip(usage.get("output_tokens").and_then(Value::as_u64))
        })
        .filter(|(input, output)| *input <= i64::MAX as u64 && *output <= i64::MAX as u64)
}
