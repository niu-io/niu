use std::{sync::atomic::Ordering, time::Duration};

use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    extract::State,
    http::HeaderMap,
    response::{IntoResponse, Response},
};
use serde_json::{Value, json};

use super::common::*;

pub(in crate::web) async fn embeddings(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<Value>,
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
    // Only OpenAI-compatible embedding routes are implemented. Reject before
    // creating an operation or dispatch attempt for other providers.
    if !model.protocol().is_openai_compatible() {
        return Err(ApiError::unsupported());
    }
    let input_bounds = validate_embedding_request(&body)?;
    if !model.supports_embeddings
        || (input_bounds.dimensions.is_some() && !model.supports_embedding_dimensions)
        || (input_bounds.encoding_format == "base64" && !model.supports_embedding_base64)
    {
        return Err(ApiError::unsupported());
    }
    if let Some(price) = &model.pricing
        && input_bounds.utf8_bytes > price.max_input_tokens as usize
    {
        return Err(ApiError::invalid_request(
            "Embedding input exceeds the priced route's conservative UTF-8 byte bound",
        ));
    }
    let api_key = resolved.api_key;
    let timeout = Duration::from_secs(state.config.server.request_timeout_seconds);
    state.requests.fetch_add(1, Ordering::Relaxed);

    let task_id = request_task_id(&headers)?;
    let dispatch = begin_attempt(&state, &principal, &public_model, model, Some(0), task_id.as_deref()).await?;
    let result = execute_embeddings(
        &state,
        EmbeddingExecution {
            public_model: &public_model,
            model,
            api_key,
            body,
            input_bounds,
            timeout,
        },
    )
    .await;
    Ok(finalize_response(&state, dispatch, result).await)
}

pub(in crate::web) fn validate_embedding_request(
    body: &Value,
) -> Result<EmbeddingInputBounds, ApiError> {
    let object = body
        .as_object()
        .ok_or_else(|| ApiError::invalid_request("The request body must be a JSON object"))?;
    const ALLOWED: &[&str] = &["model", "input", "encoding_format", "dimensions", "user"];
    if object.keys().any(|key| !ALLOWED.contains(&key.as_str())) {
        return Err(ApiError::invalid_request(
            "Unsupported field in embeddings request",
        ));
    }
    let input = object
        .get("input")
        .ok_or_else(|| ApiError::invalid_request("input is required"))?;
    let (item_count, utf8_bytes) = match input {
        Value::String(text) if !text.is_empty() => (1, text.len()),
        Value::Array(items) if !items.is_empty() && items.len() <= 2048 => {
            let mut total_bytes = 0_usize;
            for item in items {
                let Some(text) = item.as_str().filter(|text| !text.is_empty()) else {
                    return Err(ApiError::invalid_request(
                        "input arrays must contain non-empty strings",
                    ));
                };
                total_bytes = total_bytes
                    .checked_add(text.len())
                    .ok_or_else(|| ApiError::invalid_request("input is too large"))?;
            }
            (items.len(), total_bytes)
        }
        Value::Array(_) => {
            return Err(ApiError::invalid_request(
                "input must contain between 1 and 2048 strings",
            ));
        }
        _ => {
            return Err(ApiError::invalid_request(
                "input must be a non-empty string or array of strings",
            ));
        }
    };
    let dimensions = match object.get("dimensions") {
        None => None,
        Some(value) => Some(
            value
                .as_u64()
                .filter(|value| (1..=65_536).contains(value))
                .ok_or_else(|| {
                    ApiError::invalid_request("dimensions must be an integer from 1 to 65536")
                })? as usize,
        ),
    };
    let encoding_format = match object.get("encoding_format") {
        None => "float",
        Some(Value::String(value)) if value == "float" => "float",
        Some(Value::String(value)) if value == "base64" => "base64",
        _ => {
            return Err(ApiError::invalid_request(
                "encoding_format must be float or base64",
            ));
        }
    };
    if let Some(user) = object.get("user")
        && !user.as_str().is_some_and(|value| value.len() <= 512)
    {
        return Err(ApiError::invalid_request(
            "user must be a string up to 512 bytes",
        ));
    }
    Ok(EmbeddingInputBounds {
        item_count,
        utf8_bytes,
        dimensions,
        encoding_format,
    })
}

#[derive(Clone, Copy)]
pub(in crate::web) struct EmbeddingInputBounds {
    pub(in crate::web) item_count: usize,
    pub(in crate::web) utf8_bytes: usize,
    pub(in crate::web) dimensions: Option<usize>,
    pub(in crate::web) encoding_format: &'static str,
}

struct EmbeddingExecution<'a> {
    public_model: &'a str,
    model: &'a crate::config::ModelConfig,
    api_key: String,
    body: Value,
    input_bounds: EmbeddingInputBounds,
    timeout: Duration,
}

async fn execute_embeddings(
    state: &AppState,
    execution: EmbeddingExecution<'_>,
) -> Result<ProviderResponse, ApiError> {
    let EmbeddingExecution {
        public_model,
        model,
        api_key,
        mut body,
        input_bounds,
        timeout,
    } = execution;
    let base = model.endpoint_base().ok_or_else(ApiError::unavailable)?;
    let endpoint = format!("{}/embeddings", base.trim_end_matches('/'));
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
    let valid_data = value
        .get("data")
        .and_then(Value::as_array)
        .is_some_and(|data| {
            data.len() == input_bounds.item_count
                && data.iter().enumerate().all(|(index, item)| {
                    let object_is_valid = item
                        .get("object")
                        .is_none_or(|object| object.as_str() == Some("embedding"));
                    let index_is_valid = item
                        .get("index")
                        .is_none_or(|value| value.as_u64() == Some(index as u64));
                    object_is_valid && index_is_valid && {
                        let Some(embedding) = item.get("embedding") else {
                            return false;
                        };
                        match input_bounds.encoding_format {
                            "float" => embedding.as_array().is_some_and(|values| {
                                input_bounds
                                    .dimensions
                                    .is_none_or(|dimensions| values.len() == dimensions)
                                    && values.iter().all(Value::is_number)
                            }),
                            "base64" => embedding.as_str().is_some(),
                            _ => false,
                        }
                    }
                })
        });
    if !valid_data {
        state.failures.fetch_add(1, Ordering::Relaxed);
        return Err(ApiError::upstream());
    }
    let usage = value["usage"]["prompt_tokens"]
        .as_u64()
        .map(|prompt_tokens| {
            // Embedding requests produce no completion tokens; that zero follows
            // from the operation contract rather than missing provider evidence.
            usage_attempt.report(&json!({
                "prompt_tokens": prompt_tokens,
                "completion_tokens": 0
            }));
            (prompt_tokens, 0)
        });
    if let Some(object) = value.as_object_mut() {
        object.insert("object".to_owned(), json!("list"));
        object.insert("model".to_owned(), json!(public_model));
    }
    Ok(ProviderResponse {
        response: Json(value).into_response(),
        completed: true,
        usage,
    })
}
