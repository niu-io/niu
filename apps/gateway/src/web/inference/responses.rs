use std::{sync::atomic::Ordering, time::Duration};

use axum::{
    Json,
    extract::State,
    http::{HeaderMap, HeaderValue, header},
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

/// ```openapi
/// {
///   "path": "/v1/responses",
///   "method": "post",
///   "operation": {
///     "operationId": "createResponse",
///     "summary": "Create a text response",
///     "description": "The route must be an OpenAI-compatible provider route with supports_responses enabled. This public subset accepts a single text input and optional text instructions, output limit, sampling values, metadata and user identifier. Text streaming returns Responses SSE events and preserves terminal reported usage. Each Responses event is bounded to 16 MiB of UTF-8 bytes because terminal events repeat the full output; Chat events retain their separate 64 KiB bound. Oversized or malformed events fail the stream without inventing usage. Multimodal input, tools, prior-response state and other fields are rejected. HTTP 200 at stream start does not establish completion; inspect the terminal response event. Workspace model grants, source policy, rate/concurrency/token limits and configured billing apply.",
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
///                 "type": "string",
///                 "minLength": 1
///               },
///               "instructions": {
///                 "type": "string"
///               },
///               "max_output_tokens": {
///                 "type": "integer",
///                 "minimum": 1,
///                 "maximum": 1000000
///               },
///               "temperature": {
///                 "type": "number",
///                 "minimum": 0,
///                 "maximum": 2
///               },
///               "top_p": {
///                 "type": "number",
///                 "minimum": 0,
///                 "maximum": 1
///               },
///               "metadata": {
///                 "type": "object",
///                 "maxProperties": 16,
///                 "additionalProperties": {
///                   "type": "string",
///                   "maxLength": 512
///                 }
///               },
///               "user": {
///                 "type": "string",
///                 "maxLength": 512
///               },
///               "stream": {
///                 "type": "boolean",
///                 "default": false
///               }
///             }
///           }
///         }
///       }
///     },
///     "responses": {
///       "200": {
///         "description": "A validated Responses API text response with the public model alias.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "id",
///                 "object",
///                 "status",
///                 "model",
///                 "output"
///               ],
///               "properties": {
///                 "id": {
///                   "type": "string",
///                   "minLength": 1
///                 },
///                 "object": {
///                   "type": "string",
///                   "const": "response"
///                 },
///                 "status": {
///                   "type": "string",
///                   "enum": [
///                     "completed",
///                     "incomplete"
///                   ]
///                 },
///                 "model": {
///                   "type": "string"
///                 },
///                 "output": {
///                   "type": "array",
///                   "minItems": 1,
///                   "items": {
///                     "oneOf": [
///                       {
///                         "type": "object",
///                         "required": [
///                           "type",
///                           "role",
///                           "content"
///                         ],
///                         "properties": {
///                           "id": {
///                             "type": "string"
///                           },
///                           "type": {
///                             "type": "string",
///                             "const": "message"
///                           },
///                           "role": {
///                             "type": "string",
///                             "const": "assistant"
///                           },
///                           "status": {
///                             "type": "string"
///                           },
///                           "content": {
///                             "type": "array",
///                             "minItems": 1,
///                             "items": {
///                               "oneOf": [
///                                 {
///                                   "type": "object",
///                                   "required": [
///                                     "type",
///                                     "text"
///                                   ],
///                                   "properties": {
///                                     "type": {
///                                       "type": "string",
///                                       "const": "output_text"
///                                     },
///                                     "text": {
///                                       "type": "string"
///                                     },
///                                     "annotations": {
///                                       "type": "array",
///                                       "items": {
///                                         "type": "object"
///                                       }
///                                     }
///                                   },
///                                   "additionalProperties": true
///                                 },
///                                 {
///                                   "type": "object",
///                                   "required": [
///                                     "type",
///                                     "refusal"
///                                   ],
///                                   "properties": {
///                                     "type": {
///                                       "type": "string",
///                                       "const": "refusal"
///                                     },
///                                     "refusal": {
///                                       "type": "string"
///                                     }
///                                   },
///                                   "additionalProperties": true
///                                 }
///                               ]
///                             }
///                           }
///                         },
///                         "additionalProperties": true
///                       },
///                       {
///                         "type": "object",
///                         "required": [
///                           "type"
///                         ],
///                         "properties": {
///                           "id": {
///                             "type": "string"
///                           },
///                           "type": {
///                             "type": "string",
///                             "const": "reasoning"
///                           },
///                           "summary": {
///                             "type": "array"
///                           },
///                           "encrypted_content": {
///                             "type": "string"
///                           }
///                         },
///                         "additionalProperties": true
///                       }
///                     ]
///                   }
///                 },
///                 "usage": {
///                   "type": "object",
///                   "required": [
///                     "input_tokens",
///                     "output_tokens"
///                   ],
///                   "properties": {
///                     "input_tokens": {
///                       "type": "integer",
///                       "minimum": 0
///                     },
///                     "output_tokens": {
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
///           },
///           "text/event-stream": {
///             "schema": {
///               "type": "string"
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid body, unsupported field or invalid request shape."
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
///         "description": "Responses support is disabled, the route protocol is unsupported, or the requested feature is unsupported. The unsupported_operation_error message identifies the limitation and supported alternative before admission."
///       },
///       "502": {
///         "description": "Provider request failed or returned an invalid text response. Valid terminal usage is retained for accounting even when output delivery is rejected; an HTTP error alone does not prove nonexecution or authorize a safe retry."
///       },
///       "402": {
///         "description": "Insufficient balance or spending limit exceeded."
///       },
///       "403": {
///         "description": "Source IP or enforced policy denies the request. Recorded preparation-policy refusals use error.type guardrail_denied before model dispatch; post-dispatch output withholding uses guardrail_output_withheld and generation charges may apply. Do not classify every 403 as a Guardrail refusal."
///       },
///       "413": {
///         "description": "Request body exceeds 1 MiB; rejected before inference whether payload capture is enabled or disabled. Framework responses may use a plain-text body."
///       },
///       "422": {
///         "description": "Request body is not valid JSON."
///       },
///       "429": {
///         "description": "API key request, concurrency or token rate limit exceeded."
///       },
///       "503": {
///         "description": "Durable storage or configured route unavailable."
///       }
///     },
///     "x-niu-status": "Text-only subset on explicitly configured OpenAI-compatible routes. Streaming requires a completed or incomplete response terminal event; disconnects retain uncertainty. Tool, multimodal and stateful conversation semantics are not implemented.",
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub(in crate::web) async fn responses(
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
    if public_model.starts_with("codex/") {
        return super::codex::infer(
            state,
            headers,
            body,
            principal,
            super::codex::Protocol::Responses,
        )
        .await;
    }
    let resolved = crate::vendors::resolve_scoped_model(
        &state,
        principal.scope().organization_id,
        &public_model,
        crate::guardrails::input::Protocol::Responses,
        None,
    )
    .await?;
    let model = &resolved.model;
    let inspected_snapshot = inspect_request_input(
        &state,
        &principal,
        &public_model,
        model,
        crate::guardrails::input::Protocol::Responses,
        &mut body,
    )
    .await?;
    let bounds = validate_responses_request(&mut body, model.pricing.as_ref())?;
    if !model.protocol().is_openai_compatible() {
        return Err(ApiError::unsupported_message(
            "Responses require an OpenAI-compatible model route.",
        ));
    }
    if !model.supports_responses {
        return Err(ApiError::unsupported_message(
            "Responses are not enabled for this model. Choose a model with Responses support.",
        ));
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
    let task_id = request_task_id(&headers)?;
    let base = model.endpoint_base().ok_or_else(ApiError::unavailable)?;
    let endpoint = format!("{}/responses", base.trim_end_matches('/'));
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
            completion_bound: bounds.max_output_tokens,
            task_id: task_id.as_deref(),
            snapshot: inspected_snapshot,
            request_body: &body,
            protocol: crate::guardrails::input::Protocol::Responses,
        },
    )
    .await?;
    let result = execute_responses(
        &state,
        &public_model,
        model,
        api_key,
        body,
        (timeout, client),
        &dispatch,
    )
    .await;
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
    if object.get("stream").is_some_and(|v| !v.is_boolean()) {
        return Err(ApiError::invalid_request("stream must be a boolean"));
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
    transport: (Duration, reqwest::Client),
    dispatch: &DispatchContext,
) -> Result<ProviderResponse, ApiError> {
    let (timeout, client) = transport;
    let streaming = body["stream"] == true;
    let base = model.endpoint_base().ok_or_else(ApiError::unavailable)?;
    let endpoint = format!("{}/responses", base.trim_end_matches('/'));
    let object = body
        .as_object_mut()
        .ok_or_else(|| ApiError::invalid_request("The request body must be a JSON object"))?;
    object.insert("model".to_owned(), json!(model.upstream_model));
    strip_server_control_fields(object);

    let usage_attempt = state.usage.begin();
    let upstream = client
        .post(endpoint)
        .bearer_auth(api_key)
        .header(
            header::ACCEPT,
            if streaming {
                "text/event-stream"
            } else {
                "application/json"
            },
        )
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
    if streaming {
        if upstream
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.split(';').next())
            .is_none_or(|v| !v.trim().eq_ignore_ascii_case("text/event-stream"))
        {
            state.failures.fetch_add(1, Ordering::Relaxed);
            return Err(ApiError::upstream_invalid_response());
        }
        let mut response = Response::new(crate::streaming::tracked_responses_body(
            upstream.bytes_stream(),
            crate::streaming::StreamAttempt {
                store: state.store.clone(),
                gateway_writes: state.gateway_writes.clone(),
                diagnostic_writes: state.diagnostic_writes.clone(),
                scope: dispatch.scope,
                id: dispatch.attempt,
                priced: dispatch.priced,
                usage: usage_attempt,
                failures: state.failures.clone(),
            },
            public_model.to_owned(),
        ));
        response.headers_mut().insert(
            header::CONTENT_TYPE,
            HeaderValue::from_static("text/event-stream"),
        );
        response
            .headers_mut()
            .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
        response.headers_mut().insert(
            "x-niu-model",
            HeaderValue::from_str(public_model)
                .map_err(|_| ApiError::invalid_request("Invalid model alias"))?,
        );
        return Ok(ProviderResponse {
            response,
            completed: false,
            usage: None,
            provider_model: None,
            token_categories: None,
            finish_reasons: None,
        });
    }
    let mut value: Value = provider_json(upstream).await.map_err(|_| {
        state.failures.fetch_add(1, Ordering::Relaxed);
        ApiError::upstream_invalid_response()
    })?;
    if !valid_responses_response(&value) {
        state.failures.fetch_add(1, Ordering::Relaxed);
        // Invalid customer output does not erase independently reported execution.
        if terminal_responses_response(&value)
            && let Some(usage) = responses_usage(&value)
        {
            usage_attempt.report(&json!({"prompt_tokens":usage.0,"completion_tokens":usage.1}));
            return Ok(ProviderResponse {
                response: ApiError::upstream_invalid_response().into_response(),
                completed: true,
                usage: Some(usage),
                provider_model: provider_reported_model(&value),
                token_categories: niu_storage::RequestTokenCategories::from_responses_usage(
                    &value["usage"],
                    usage,
                ),
                finish_reasons: niu_storage::RequestChoiceFinish::from_responses_response(&value),
            });
        }
        return Err(ApiError::upstream_invalid_response());
    }
    let provider_model = provider_reported_model(&value);
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
    crate::customer_response::sanitize(&mut value);
    Ok(ProviderResponse {
        finish_reasons: niu_storage::RequestChoiceFinish::from_responses_response(&value),
        token_categories: usage.and_then(|totals| {
            niu_storage::RequestTokenCategories::from_responses_usage(&value["usage"], totals)
        }),
        response: Json(value).into_response(),
        completed: true,
        usage,
        provider_model,
    })
}

fn terminal_responses_response(response: &Value) -> bool {
    response
        .get("id")
        .and_then(Value::as_str)
        .is_some_and(|id| !id.trim().is_empty())
        && response.get("object").and_then(Value::as_str) == Some("response")
        && matches!(
            response.get("status").and_then(Value::as_str),
            Some("completed" | "incomplete")
        )
        && response.get("error").is_none_or(Value::is_null)
        && response.get("output").is_some_and(Value::is_array)
}

pub(in crate::web) fn valid_responses_response(response: &Value) -> bool {
    if !terminal_responses_response(response) {
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
    let usage = response.get("usage")?;
    let input = usage.get("input_tokens")?.as_u64()?;
    let output = usage.get("output_tokens")?.as_u64()?;
    let total = input.checked_add(output)?;
    if input > i64::MAX as u64
        || output > i64::MAX as u64
        || usage
            .get("total_tokens")
            .is_some_and(|reported| reported.as_u64() != Some(total))
    {
        return None;
    }
    Some((input, output))
}
