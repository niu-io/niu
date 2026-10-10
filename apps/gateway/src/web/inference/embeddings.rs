use std::{sync::atomic::Ordering, time::Duration};

use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    extract::State,
    http::HeaderMap,
    response::{IntoResponse, Response},
};
use base64::Engine;
use serde_json::{Value, json};

use super::common::*;

/// ```openapi
/// {
///   "path": "/v1/embeddings",
///   "method": "post",
///   "operation": {
///     "operationId": "createEmbedding",
///     "summary": "Create OpenAI-compatible text embeddings",
///     "description": "The configured route must use an OpenAI-compatible protocol and explicitly declare embedding support. Optional dimensions and base64 output require separate route capabilities. These declarations are operator assertions, not provider conformance evidence. Unsupported providers or capabilities are rejected before durable operation and attempt creation. Workspace model grants, IP policy, rate/concurrency/token limits and configured customer billing apply before dispatch.",
///     "security": [
///       {
///         "bearerAuth": []
///       },
///       {
///         "niuApiKeyAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "x-niu-log-payloads",
///         "in": "header",
///         "required": false,
///         "description": "Request and sanitized customer response content is retained until 24 hours after the original request creation time by default. Send false (case-insensitive) to disable capture for this request; true or an omitted header retains content. Invalid values or repeated headers are rejected before inference. Requests exceeding the 1 MB capture limit are rejected; response capture is truncated at 1 MB. Does not backfill earlier requests.",
///         "schema": {
///           "type": "string",
///           "enum": [
///             "true",
///             "false"
///           ],
///           "default": "true"
///         }
///       },
///       {
///         "name": "X-Niu-Task-ID",
///         "in": "header",
///         "required": false,
///         "description": "Optional opaque task correlation key. Requests with the same value can be grouped in workspace activity. Niu stores the value as metadata and does not forward it to the provider.",
///         "schema": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 200,
///           "pattern": "^[!-~]{1,200}$"
///         }
///       }
///     ],
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "model",
///               "input"
///             ],
///             "properties": {
///               "model": {
///                 "type": "string",
///                 "minLength": 1
///               },
///               "input": {
///                 "oneOf": [
///                   {
///                     "type": "string",
///                     "minLength": 1
///                   },
///                   {
///                     "type": "array",
///                     "minItems": 1,
///                     "maxItems": 2048,
///                     "items": {
///                       "type": "string",
///                       "minLength": 1
///                     }
///                   }
///                 ]
///               },
///               "encoding_format": {
///                 "type": "string",
///                 "enum": [
///                   "float",
///                   "base64"
///                 ],
///                 "default": "float"
///               },
///               "dimensions": {
///                 "type": "integer",
///                 "minimum": 1,
///                 "maximum": 65536
///               },
///               "user": {
///                 "type": "string",
///                 "maxLength": 512
///               }
///             }
///           }
///         }
///       }
///     },
///     "responses": {
///       "200": {
///         "description": "One validated embedding per input item; the configured upstream model is replaced with the public model alias.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "object",
///                 "data",
///                 "model"
///               ],
///               "properties": {
///                 "object": {
///                   "type": "string",
///                   "const": "list"
///                 },
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "type": "object",
///                     "required": [
///                       "embedding"
///                     ],
///                     "properties": {
///                       "object": {
///                         "type": "string",
///                         "const": "embedding"
///                       },
///                       "index": {
///                         "type": "integer",
///                         "minimum": 0
///                       },
///                       "embedding": {
///                         "oneOf": [
///                           {
///                             "type": "array",
///                             "items": {
///                               "type": "number"
///                             }
///                           },
///                           {
///                             "type": "string"
///                           }
///                         ]
///                       }
///                     },
///                     "additionalProperties": true
///                   }
///                 },
///                 "model": {
///                   "type": "string"
///                 },
///                 "usage": {
///                   "type": "object",
///                   "properties": {
///                     "prompt_tokens": {
///                       "type": "integer",
///                       "minimum": 0
///                     },
///                     "total_tokens": {
///                       "type": "integer",
///                       "minimum": 0
///                     }
///                   },
///                   "additionalProperties": true
///                 }
///               },
///               "additionalProperties": true
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid body, unsupported field, or invalid input shape."
///       },
///       "413": {
///         "description": "Request body exceeds 1 MiB; rejected before inference whether payload capture is enabled or disabled. Framework responses may use a plain-text body."
///       },
///       "401": {
///         "description": "Missing or invalid gateway credentials."
///       },
///       "404": {
///         "description": "Model alias does not exist or is unavailable to this key."
///       },
///       "409": {
///         "description": "Admission conflict before dispatch. Type route_configuration_changed identifies a changed managed credential/model configuration; that request was not sent upstream. Other conflicts retain their own error type."
///       },
///       "501": {
///         "description": "The model route lacks the required embedding, configurable-dimension or base64 capability, or uses an unsupported protocol. The unsupported_operation_error message identifies the limitation and request alternative before admission."
///       },
///       "502": {
///         "description": "Provider request failed or returned an invalid embedding response."
///       },
///       "422": {
///         "description": "Request body is not valid JSON."
///       },
///       "402": {
///         "description": "Insufficient balance or configured spending limit exceeded."
///       },
///       "403": {
///         "description": "Source IP or enforced policy denies the request. Recorded preparation-policy refusals use error.type guardrail_denied before model dispatch; do not classify every 403 as a Guardrail refusal."
///       },
///       "429": {
///         "description": "API key request, concurrency or token rate limit exceeded."
///       },
///       "503": {
///         "description": "Durable storage or configured route unavailable."
///       }
///     },
///     "x-niu-status": "OpenAI-compatible text inputs and float/base64 response vectors; no token-ID arrays, multimodal inputs, or streaming.",
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub(in crate::web) async fn embeddings(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(mut body): Json<Value>,
) -> Result<Response, ApiError> {
    let _in_flight = state.track_inference();
    let principal = state.authorize_api_headers(&headers).await?;
    let public_model = body
        .get("model")
        .and_then(Value::as_str)
        .filter(|model| !model.is_empty())
        .ok_or_else(|| ApiError::invalid_request("A model name is required"))?
        .to_owned();
    if !principal.allows_model(&public_model) {
        return Err(ApiError::not_found());
    }
    let bounds = validate_embedding_request(&body)?;
    let requirements = crate::config::ModelRequirements {
        embedding_dimensions: bounds.dimensions.is_some(),
        embedding_base64: bounds.encoding_format == "base64",
        ..Default::default()
    };
    let resolved = crate::vendors::resolve_scoped_model(
        &state,
        principal.scope().organization_id,
        &public_model,
        crate::guardrails::input::Protocol::Embeddings,
        Some(&requirements),
    )
    .await?;
    let model = &resolved.model;
    let inspected_snapshot = inspect_request_input(
        &state,
        &principal,
        &public_model,
        model,
        crate::guardrails::input::Protocol::Embeddings,
        &mut body,
    )
    .await?;
    // Only OpenAI-compatible embedding routes are implemented. Reject before
    // creating an operation or dispatch attempt for other providers.
    if !model.protocol().is_openai_compatible() {
        return Err(ApiError::unsupported_message(
            "Embeddings require an OpenAI-compatible model route.",
        ));
    }
    let input_bounds = validate_embedding_request(&body)?;
    if !model.supports_embeddings {
        return Err(ApiError::unsupported_message(
            "Embeddings are not enabled for this model. Choose an embedding model.",
        ));
    }
    if input_bounds.dimensions.is_some() && !model.supports_embedding_dimensions {
        return Err(ApiError::unsupported_message(
            "Configurable embedding dimensions are not enabled for this model. Omit dimensions or choose a model supporting custom dimensions.",
        ));
    }
    if input_bounds.encoding_format == "base64" && !model.supports_embedding_base64 {
        return Err(ApiError::unsupported_message(
            "Base64 embeddings are not enabled for this model. Use float encoding or choose a model with base64 support.",
        ));
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
    let task_id = request_task_id(&headers)?;
    let base = model.endpoint_base().ok_or_else(ApiError::unavailable)?;
    let endpoint = format!("{}/embeddings", base.trim_end_matches('/'));
    let client = crate::upstream::client_for_endpoint(&endpoint, timeout)
        .await
        .map_err(ApiError::from_endpoint)?;
    state.requests.fetch_add(1, Ordering::Relaxed);
    let dispatch = begin_attempt(
        &state,
        &principal,
        AttemptRequest {
            managed_route: resolved.managed_route.as_ref(),
            personal_route: resolved.personal_route.as_ref(),
            public_model: &public_model,
            model,
            completion_bound: Some(0),
            task_id: task_id.as_deref(),
            snapshot: inspected_snapshot,
            request_body: &body,
            protocol: crate::guardrails::input::Protocol::Embeddings,
        },
    )
    .await?;
    let result = execute_embeddings(
        &state,
        EmbeddingExecution {
            public_model: &public_model,
            model,
            api_key,
            body,
            input_bounds,
            timeout,
            client,
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
    client: reqwest::Client,
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
        client,
    } = execution;
    let base = model.endpoint_base().ok_or_else(ApiError::unavailable)?;
    let endpoint = format!("{}/embeddings", base.trim_end_matches('/'));
    let object = body
        .as_object_mut()
        .ok_or_else(|| ApiError::invalid_request("The request body must be a JSON object"))?;
    object.insert("model".to_owned(), json!(model.upstream_model));
    strip_server_control_fields(object);

    let usage_attempt = state.usage.begin();
    let upstream = client
        .post(endpoint)
        .bearer_auth(api_key)
        .timeout(timeout)
        .json(&body)
        .send()
        .await
        .map_err(|error| {
            state.failures.fetch_add(1, Ordering::Relaxed);
            ApiError::upstream_transport(&error)
        })?;
    if !upstream.status().is_success() {
        state.failures.fetch_add(1, Ordering::Relaxed);
        return Err(provider_rejection(upstream).await);
    }
    let mut value: Value = provider_json(upstream).await.map_err(|_| {
        state.failures.fetch_add(1, Ordering::Relaxed);
        ApiError::upstream_invalid_response()
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
                                !values.is_empty()
                                    && input_bounds
                                        .dimensions
                                        .is_none_or(|dimensions| values.len() == dimensions)
                                    && values.iter().all(Value::is_number)
                            }),
                            "base64" => embedding.as_str().is_some_and(|encoded| {
                                let Ok(bytes) =
                                    base64::engine::general_purpose::STANDARD.decode(encoded)
                                else {
                                    return false;
                                };
                                !bytes.is_empty()
                                    && bytes.len().is_multiple_of(4)
                                    && input_bounds
                                        .dimensions
                                        .is_none_or(|dimensions| bytes.len() / 4 == dimensions)
                                    && bytes
                                        .as_chunks::<4>()
                                        .0
                                        .iter()
                                        .all(|chunk| f32::from_le_bytes(*chunk).is_finite())
                            }),
                            _ => false,
                        }
                    }
                })
        });
    let provider_model = provider_reported_model(&value);
    let usage = embedding_usage(&value);
    if !valid_data {
        state.failures.fetch_add(1, Ordering::Relaxed);
        // A synchronous terminal envelope can establish incurred usage even
        // when the returned vector violates the client's output contract.
        let terminal = value.get("object").and_then(Value::as_str) == Some("list")
            && value
                .get("data")
                .and_then(Value::as_array)
                .is_some_and(|data| {
                    data.len() == input_bounds.item_count
                        && data.iter().enumerate().all(|(index, item)| {
                            item.get("object").and_then(Value::as_str) == Some("embedding")
                                && item.get("index").and_then(Value::as_u64) == Some(index as u64)
                                && item.get("embedding").is_some()
                        })
                });
        if !terminal || usage.is_none() {
            return Err(ApiError::upstream_invalid_response());
        }
    }
    if let Some((prompt_tokens, _)) = usage {
        // Embeddings have zero completion tokens by their operation contract.
        usage_attempt.report(&json!({"prompt_tokens": prompt_tokens, "completion_tokens": 0}));
    }
    if let Some(object) = value.as_object_mut() {
        object.insert("object".to_owned(), json!("list"));
        object.insert("model".to_owned(), json!(public_model));
    }
    crate::customer_response::sanitize(&mut value);
    Ok(ProviderResponse {
        finish_reasons: None,
        token_categories: None,
        response: if valid_data {
            Json(value).into_response()
        } else {
            ApiError::upstream_invalid_response().into_response()
        },
        completed: true,
        usage,
        provider_model,
    })
}

fn embedding_usage(response: &Value) -> Option<(u64, u64)> {
    let usage = response.get("usage")?;
    let input = usage.get("prompt_tokens")?.as_u64()?;
    if input > i64::MAX as u64
        || usage
            .get("total_tokens")
            .is_some_and(|reported| reported.as_u64() != Some(input))
    {
        return None;
    }
    Some((input, 0))
}

#[cfg(test)]
mod usage_tests {
    use super::*;

    #[test]
    fn embedding_usage_requires_exact_bounded_consistent_input_evidence() {
        for usage in [
            json!({"prompt_tokens": 5}),
            json!({"prompt_tokens": 5, "total_tokens": 5}),
            json!({"prompt_tokens": 0, "total_tokens": 0}),
        ] {
            assert_eq!(
                embedding_usage(&json!({"usage": usage})),
                Some((usage["prompt_tokens"].as_u64().unwrap(), 0))
            );
        }
        for usage in [
            json!({}),
            json!({"prompt_tokens": -1}),
            json!({"prompt_tokens": "5"}),
            json!({"prompt_tokens": u64::MAX}),
            json!({"prompt_tokens": 5, "total_tokens": 6}),
            json!({"prompt_tokens": 5, "total_tokens": null}),
            json!({"prompt_tokens": 5, "total_tokens": "5"}),
            json!({"prompt_tokens": 5, "total_tokens": 5.5}),
        ] {
            assert_eq!(embedding_usage(&json!({"usage": usage})), None);
        }
    }
}
