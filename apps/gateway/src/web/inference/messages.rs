//! Native Messages text operation. No conversion to an upstream Chat request.
use super::common::*;
use crate::guardrails::input::Protocol;
use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    extract::State,
    http::HeaderMap,
    response::{IntoResponse, Response},
};
use serde_json::{Value, json};
use std::{sync::atomic::Ordering, time::Duration};

/// ```openapi
/// {
///   "path": "/v1/messages",
///   "method": "post",
///   "operation": {
///     "operationId": "createMessage",
///     "x-niu-implementation": "implemented",
///     "x-niu-status": "Native nonstreaming Messages text only; streaming, tools and media remain unsupported. GenerateContent is a separate operation.",
///     "summary": "Create a native nonstreaming text Message",
///     "description": "Requires supports_messages on an OpenRouter or Anthropic route. Uses Niu bearer or x-niu-api-key credentials, workspace grants, source policy, limits, guardrails and billing. Requests are limited to 64 KiB and conservative configured pricing bounds. No Chat translation. Tools, media, beta headers, unsupported fields and streaming are rejected before dispatch. Only version 2023-06-01 is supported (also used when omitted). Native input_tokens excludes cache reads/writes; total input accounting requires all three input categories plus output_tokens. Missing or null categories leave usage unresolved and reservations retained. Separate reasoning rates in the bound base price or a reachable context tier are rejected atomically before dispatch with 422 and x-niu-error-code unsupported_token_pricing; this adapter cannot report reasoning usage. Returned usage is not proof of a settled charge. Upstream commercial metadata is never forwarded. Native SDK and Claude Code compatibility are unverified.",
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
///         "name": "anthropic-version",
///         "in": "header",
///         "schema": {
///           "type": "string",
///           "enum": [
///             "2023-06-01"
///           ]
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
///               "max_tokens",
///               "messages"
///             ],
///             "properties": {
///               "model": {
///                 "type": "string",
///                 "minLength": 1,
///                 "maxLength": 200
///               },
///               "max_tokens": {
///                 "type": "integer",
///                 "minimum": 1,
///                 "maximum": 1000000
///               },
///               "system": {
///                 "oneOf": [
///                   {
///                     "type": "string"
///                   },
///                   {
///                     "type": "array",
///                     "minItems": 1,
///                     "maxItems": 128,
///                     "items": {
///                       "type": "object",
///                       "additionalProperties": false,
///                       "required": [
///                         "type",
///                         "text"
///                       ],
///                       "properties": {
///                         "type": {
///                           "type": "string",
///                           "enum": [
///                             "text"
///                           ]
///                         },
///                         "text": {
///                           "type": "string"
///                         },
///                         "cache_control": {
///                           "type": "object",
///                           "additionalProperties": false,
///                           "required": [
///                             "type"
///                           ],
///                           "properties": {
///                             "type": {
///                               "type": "string",
///                               "enum": [
///                                 "ephemeral"
///                               ]
///                             },
///                             "ttl": {
///                               "type": "string",
///                               "enum": [
///                                 "5m",
///                                 "1h"
///                               ]
///                             }
///                           }
///                         }
///                       }
///                     }
///                   }
///                 ]
///               },
///               "stream": {
///                 "type": "boolean",
///                 "enum": [
///                   false
///                 ]
///               },
///               "temperature": {
///                 "type": "number",
///                 "minimum": 0,
///                 "maximum": 1
///               },
///               "top_p": {
///                 "type": "number",
///                 "minimum": 0,
///                 "maximum": 1
///               },
///               "stop_sequences": {
///                 "type": "array",
///                 "maxItems": 4,
///                 "items": {
///                   "type": "string",
///                   "minLength": 1,
///                   "maxLength": 512
///                 }
///               },
///               "messages": {
///                 "type": "array",
///                 "minItems": 1,
///                 "maxItems": 1024,
///                 "items": {
///                   "type": "object",
///                   "additionalProperties": false,
///                   "required": [
///                     "role",
///                     "content"
///                   ],
///                   "properties": {
///                     "role": {
///                       "type": "string",
///                       "enum": [
///                         "user",
///                         "assistant"
///                       ]
///                     },
///                     "content": {
///                       "oneOf": [
///                         {
///                           "type": "string"
///                         },
///                         {
///                           "type": "array",
///                           "minItems": 1,
///                           "maxItems": 128,
///                           "items": {
///                             "type": "object",
///                             "additionalProperties": false,
///                             "required": [
///                               "type",
///                               "text"
///                             ],
///                             "properties": {
///                               "type": {
///                                 "type": "string",
///                                 "enum": [
///                                   "text"
///                                 ]
///                               },
///                               "text": {
///                                 "type": "string"
///                               },
///                               "cache_control": {
///                                 "type": "object",
///                                 "additionalProperties": false,
///                                 "required": [
///                                   "type"
///                                 ],
///                                 "properties": {
///                                   "type": {
///                                     "type": "string",
///                                     "enum": [
///                                       "ephemeral"
///                                     ]
///                                   },
///                                   "ttl": {
///                                     "type": "string",
///                                     "enum": [
///                                       "5m",
///                                       "1h"
///                                     ]
///                                   }
///                                 }
///                               }
///                             }
///                           }
///                         }
///                       ]
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       }
///     },
///     "responses": {
///       "200": {
///         "description": "Native sanitized text Message. Inspect usage and billing diagnostics separately.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "required": [
///                 "id",
///                 "type",
///                 "role",
///                 "model",
///                 "content",
///                 "stop_reason",
///                 "stop_sequence",
///                 "usage"
///               ],
///               "properties": {
///                 "id": {
///                   "type": "string"
///                 },
///                 "type": {
///                   "type": "string",
///                   "enum": [
///                     "message"
///                   ]
///                 },
///                 "role": {
///                   "type": "string",
///                   "enum": [
///                     "assistant"
///                   ]
///                 },
///                 "model": {
///                   "type": "string"
///                 },
///                 "content": {
///                   "type": "array",
///                   "minItems": 1,
///                   "maxItems": 128,
///                   "items": {
///                     "type": "object",
///                     "additionalProperties": false,
///                     "required": [
///                       "type",
///                       "text"
///                     ],
///                     "properties": {
///                       "type": {
///                         "type": "string",
///                         "enum": [
///                           "text"
///                         ]
///                       },
///                       "text": {
///                         "type": "string"
///                       }
///                     }
///                   }
///                 },
///                 "stop_reason": {
///                   "type": "string",
///                   "enum": [
///                     "end_turn",
///                     "max_tokens",
///                     "stop_sequence"
///                   ]
///                 },
///                 "stop_sequence": {
///                   "type": [
///                     "string",
///                     "null"
///                   ]
///                 },
///                 "usage": {
///                   "type": "object",
///                   "additionalProperties": false,
///                   "required": [
///                     "input_tokens",
///                     "output_tokens",
///                     "cache_creation_input_tokens",
///                     "cache_read_input_tokens"
///                   ],
///                   "properties": {
///                     "input_tokens": {
///                       "type": [
///                         "integer",
///                         "null"
///                       ],
///                       "minimum": 0
///                     },
///                     "output_tokens": {
///                       "type": [
///                         "integer",
///                         "null"
///                       ],
///                       "minimum": 0
///                     },
///                     "cache_creation_input_tokens": {
///                       "type": [
///                         "integer",
///                         "null"
///                       ],
///                       "minimum": 0
///                     },
///                     "cache_read_input_tokens": {
///                       "type": [
///                         "integer",
///                         "null"
///                       ],
///                       "minimum": 0
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid or unsupported input.",
///         "headers": {
///           "x-niu-error-code": {
///             "description": "Niu-specific machine-readable reason, such as key_spending_limit_exceeded or budget_exceeded. Native error.type remains the native category. Shared middleware errors may omit this header.",
///             "schema": {
///               "type": "string"
///             }
///           }
///         }
///       },
///       "401": {
///         "description": "Invalid Niu key.",
///         "headers": {
///           "x-niu-error-code": {
///             "description": "Niu-specific machine-readable reason, such as key_spending_limit_exceeded or budget_exceeded. Native error.type remains the native category. Shared middleware errors may omit this header.",
///             "schema": {
///               "type": "string"
///             }
///           }
///         }
///       },
///       "403": {
///         "description": "Input or output policy denial.",
///         "headers": {
///           "x-niu-error-code": {
///             "description": "Niu-specific machine-readable reason, such as key_spending_limit_exceeded or budget_exceeded. Native error.type remains the native category. Shared middleware errors may omit this header.",
///             "schema": {
///               "type": "string"
///             }
///           }
///         }
///       },
///       "404": {
///         "description": "Model unavailable or outside key grants.",
///         "headers": {
///           "x-niu-error-code": {
///             "description": "Niu-specific machine-readable reason, such as key_spending_limit_exceeded or budget_exceeded. Native error.type remains the native category. Shared middleware errors may omit this header.",
///             "schema": {
///               "type": "string"
///             }
///           }
///         }
///       },
///       "402": {
///         "description": "Insufficient spending capacity.",
///         "headers": {
///           "x-niu-error-code": {
///             "description": "Niu-specific machine-readable reason, such as key_spending_limit_exceeded or budget_exceeded. Native error.type remains the native category. Shared middleware errors may omit this header.",
///             "schema": {
///               "type": "string"
///             }
///           }
///         }
///       },
///       "422": {
///         "description": "Bound pricing requires unsupported token usage categories. No upstream dispatch or balance reservation is committed.",
///         "headers": {
///           "x-niu-error-code": {
///             "schema": { "type": "string", "enum": ["unsupported_token_pricing"] }
///           }
///         }
///       },
///       "429": {
///         "description": "Key rate, concurrency or token limit.",
///         "headers": {
///           "x-niu-error-code": {
///             "description": "Niu-specific machine-readable reason, such as key_spending_limit_exceeded or budget_exceeded. Native error.type remains the native category. Shared middleware errors may omit this header.",
///             "schema": {
///               "type": "string"
///             }
///           }
///         }
///       },
///       "501": {
///         "description": "Unsupported streaming, version or capability.",
///         "headers": {
///           "x-niu-error-code": {
///             "description": "Niu-specific machine-readable reason, such as key_spending_limit_exceeded or budget_exceeded. Native error.type remains the native category. Shared middleware errors may omit this header.",
///             "schema": {
///               "type": "string"
///             }
///           }
///         }
///       },
///       "502": {
///         "description": "Upstream failure or invalid response; execution may be uncertain.",
///         "headers": {
///           "x-niu-error-code": {
///             "description": "Niu-specific machine-readable reason, such as key_spending_limit_exceeded or budget_exceeded. Native error.type remains the native category. Shared middleware errors may omit this header.",
///             "schema": {
///               "type": "string"
///             }
///           }
///         }
///       },
///       "503": {
///         "description": "Service unavailable.",
///         "headers": {
///           "x-niu-error-code": {
///             "description": "Niu-specific machine-readable reason, such as key_spending_limit_exceeded or budget_exceeded. Native error.type remains the native category. Shared middleware errors may omit this header.",
///             "schema": {
///               "type": "string"
///             }
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub(in crate::web) async fn messages(
    State(state): State<AppState>,
    headers: HeaderMap,
    input: Result<Json<Value>, axum::extract::rejection::JsonRejection>,
) -> Response {
    let result = match input {
        Ok(Json(body)) => execute(&state, &headers, body).await,
        Err(_) => Err(ApiError::invalid_request(
            "Expected a bounded Messages JSON request",
        )),
    };
    let response = result.unwrap_or_else(IntoResponse::into_response);
    if response.status().is_success() {
        return response;
    }
    // Use the native error envelope without forwarding arbitrary upstream errors.
    let (mut parts, body) = response.into_parts();
    parts.headers.remove(axum::http::header::CONTENT_LENGTH);
    parts.headers.insert(
        axum::http::header::CONTENT_TYPE,
        axum::http::HeaderValue::from_static("application/json"),
    );
    let bytes = axum::body::to_bytes(body, 16 * 1024)
        .await
        .unwrap_or_default();
    let value: Value = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
    let message = value
        .pointer("/error/message")
        .and_then(Value::as_str)
        .unwrap_or("Messages request failed");
    let kind = match parts.status.as_u16() {
        400 | 402 | 413 | 422 | 501 => "invalid_request_error",
        401 => "authentication_error",
        403 => "permission_error",
        404 => "not_found_error",
        429 => "rate_limit_error",
        503 => "overloaded_error",
        _ => "api_error",
    };
    Response::from_parts(
        parts,
        axum::body::Body::from(
            json!({"type":"error","error":{"type":kind,"message":message}}).to_string(),
        ),
    )
}

async fn execute(
    state: &AppState,
    headers: &HeaderMap,
    mut body: Value,
) -> Result<Response, ApiError> {
    let _in_flight = state.track_inference();
    let principal = state.authorize_api_headers(headers).await?;
    if headers.contains_key("anthropic-beta")
        || headers.get_all("anthropic-version").iter().count() > 1
        || headers
            .get("anthropic-version")
            .is_some_and(|v| v != "2023-06-01")
    {
        return Err(ApiError::unsupported_message(
            "Only Messages version 2023-06-01 without beta features is supported",
        ));
    }
    let bound = validate(&body)?;
    let public_model = body["model"].as_str().unwrap().to_owned();
    if !principal.allows_model(&public_model) {
        return Err(ApiError::not_found());
    }
    let resolved = crate::vendors::resolve_scoped_model(
        state,
        principal.scope().organization_id,
        &public_model,
        Protocol::Messages,
        None,
    )
    .await?;
    let model = &resolved.model;
    if !model.supports_messages || !matches!(model.provider.as_str(), "openrouter" | "anthropic") {
        return Err(ApiError::unsupported_message(
            "This route does not declare native Messages support",
        ));
    }
    let snapshot = inspect_request_input(
        state,
        &principal,
        &public_model,
        model,
        Protocol::Messages,
        &mut body,
    )
    .await?;
    validate(&body)?;
    if let Some(price) = &model.pricing
        && (bound > price.max_output_tokens
            || serde_json::to_vec(&body)
                .map_err(|_| ApiError::invalid_request("Invalid Messages request"))?
                .len()
                > price.max_input_tokens as usize)
    {
        return Err(ApiError::invalid_request(
            "Messages request exceeds the priced route's conservative input or output bound",
        ));
    }
    let timeout = Duration::from_secs(state.config.server.request_timeout_seconds);
    let endpoint = format!(
        "{}/messages",
        model
            .endpoint_base()
            .ok_or_else(ApiError::unavailable)?
            .trim_end_matches('/')
    );
    let client = crate::upstream::client_for_endpoint(&endpoint, timeout)
        .await
        .map_err(ApiError::from_endpoint)?;
    let task_id = request_task_id(headers)?;
    state.requests.fetch_add(1, Ordering::Relaxed);
    let dispatch = begin_attempt(
        state,
        &principal,
        AttemptRequest {
            managed_route: resolved.managed_route.as_ref(),
            personal_route: resolved.personal_route.as_ref(),
            public_model: &public_model,
            model,
            completion_bound: Some(bound),
            task_id: task_id.as_deref(),
            snapshot,
            request_body: &body,
            protocol: Protocol::Messages,
        },
    )
    .await?;
    body["model"] = json!(model.upstream_model);
    let request = client
        .post(endpoint)
        .timeout(timeout)
        .header("anthropic-version", "2023-06-01");
    let request = if model.provider == "anthropic" {
        request.header("x-api-key", &resolved.api_key)
    } else {
        request.bearer_auth(&resolved.api_key)
    };
    let usage_attempt = state.usage.begin();
    let result = async {
        let response = request
            .json(&body)
            .send()
            .await
            .map_err(|e| ApiError::upstream_transport(&e))?;
        if !response.status().is_success() {
            return Err(provider_rejection(response).await);
        }
        let value = provider_json(response)
            .await
            .map_err(|_| ApiError::upstream_invalid_response())?;
        let response = normalize(value, &public_model)?;
        if let Some((prompt, completion)) = response.usage {
            usage_attempt.report(&json!({"prompt_tokens":prompt,"completion_tokens":completion}));
        }
        Ok(response)
    }
    .await;
    if result.is_err() {
        state.failures.fetch_add(1, Ordering::Relaxed);
    }
    Ok(finalize_response(state, dispatch, result).await)
}

fn validate(body: &Value) -> Result<i64, ApiError> {
    let invalid = || ApiError::invalid_request("Unsupported or invalid Messages text request");
    let object = body.as_object().ok_or_else(invalid)?;
    if object.keys().any(|key| {
        ![
            "model",
            "max_tokens",
            "messages",
            "system",
            "stream",
            "temperature",
            "top_p",
            "stop_sequences",
        ]
        .contains(&key.as_str())
    }) {
        return Err(invalid());
    }
    if body.get("stream").is_some_and(|v| v != false) {
        return Err(ApiError::unsupported_message(
            "Streaming Messages are not supported",
        ));
    }
    let model = body
        .get("model")
        .and_then(Value::as_str)
        .filter(|v| !v.is_empty() && v.len() <= 200)
        .ok_or_else(invalid)?;
    if model.chars().any(char::is_control) {
        return Err(invalid());
    }
    let bound = body
        .get("max_tokens")
        .and_then(Value::as_i64)
        .filter(|v| (1..=1_000_000).contains(v))
        .ok_or_else(invalid)?;
    fn text(value: &Value) -> bool {
        value.is_string()
            || value.as_array().is_some_and(|parts| {
                !parts.is_empty()
                    && parts.len() <= 128
                    && parts.iter().all(|p| {
                        p.as_object().is_some_and(|p| {
                            p.keys().all(|key| {
                                ["type", "text", "cache_control"].contains(&key.as_str())
                            })
                        }) && p
                            .get("cache_control")
                            .is_none_or(crate::guardrails::input::valid_message_cache_control)
                            && p["type"] == "text"
                            && p["text"].is_string()
                    })
            })
    }
    let messages = body
        .get("messages")
        .and_then(Value::as_array)
        .filter(|m| !m.is_empty() && m.len() <= 1024)
        .ok_or_else(invalid)?;
    if !messages.iter().all(|m| {
        m.as_object().is_some_and(|m| m.len() == 2)
            && matches!(m["role"].as_str(), Some("user" | "assistant"))
            && text(&m["content"])
    }) || body.get("system").is_some_and(|v| !text(v))
    {
        return Err(invalid());
    }
    for key in ["temperature", "top_p"] {
        if body
            .get(key)
            .is_some_and(|v| v.as_f64().is_none_or(|v| !(0.0..=1.0).contains(&v)))
        {
            return Err(invalid());
        }
    }
    if body.get("stop_sequences").is_some_and(|v| {
        v.as_array().is_none_or(|v| {
            v.len() > 4
                || v.iter()
                    .any(|v| v.as_str().is_none_or(|v| v.is_empty() || v.len() > 512))
        })
    }) {
        return Err(invalid());
    }
    if serde_json::to_vec(body).map_err(|_| invalid())?.len() > 64 * 1024 {
        return Err(invalid());
    }
    Ok(bound)
}

fn normalize(value: Value, public_model: &str) -> Result<ProviderResponse, ApiError> {
    let invalid = ApiError::upstream_invalid_response;
    if value["type"] != "message"
        || value["role"] != "assistant"
        || value.get("error").is_some_and(|e| !e.is_null())
    {
        return Err(invalid());
    }
    let id = value["id"]
        .as_str()
        .filter(|v| !v.is_empty() && v.len() <= 200 && !v.chars().any(char::is_control))
        .ok_or_else(invalid)?;
    let stop = value["stop_reason"]
        .as_str()
        .filter(|v| ["end_turn", "max_tokens", "stop_sequence"].contains(v))
        .ok_or_else(invalid)?;
    // OpenRouter emits citations: null on ordinary native text blocks. Accept
    // only absent/empty citations; project text explicitly so no nested metadata
    // can cross the customer boundary or bypass output inspection.
    let content = value["content"].as_array().and_then(|parts| {
        if parts.is_empty() || parts.len() > 128 {
            return None;
        }
        parts
            .iter()
            .map(|part| {
                let object = part.as_object()?;
                if object
                    .keys()
                    .any(|key| !["type", "text", "citations"].contains(&key.as_str()))
                    || part["type"] != "text"
                    || part
                        .get("citations")
                        .is_some_and(|v| !v.is_null() && !v.as_array().is_some_and(Vec::is_empty))
                {
                    return None;
                }
                Some(json!({"type":"text", "text":part["text"].as_str()?}))
            })
            .collect::<Option<Vec<_>>>()
    });
    let valid = content.is_some();
    let token = |key: &str| {
        value["usage"][key]
            .as_u64()
            .filter(|v| *v <= 9_007_199_254_740_991)
    };
    // Native input_tokens excludes cache reads and writes. Missing/null cache
    // categories cannot be treated as zero when computing total customer input.
    let usage = (|| {
        Some((
            token("input_tokens")?
                .checked_add(token("cache_creation_input_tokens")?)?
                .checked_add(token("cache_read_input_tokens")?)?,
            token("output_tokens")?,
        ))
    })();
    if !valid && usage.is_none() {
        return Err(invalid());
    }
    let token_categories = usage
        .and_then(|_| token("cache_read_input_tokens"))
        .and_then(|n| i64::try_from(n).ok())
        .map(|n| niu_storage::RequestTokenCategories {
            cache_write_input_tokens: token("cache_creation_input_tokens")
                .and_then(|value| i64::try_from(value).ok()),
            cached_input_tokens: Some(n),
            reasoning_output_tokens: None,
        });
    let finish = niu_storage::RequestChoiceFinish {
        index: 0,
        reason: if stop == "max_tokens" {
            niu_storage::RequestFinishReason::Length
        } else {
            niu_storage::RequestFinishReason::Stop
        },
    };
    let mut sanitized_usage = serde_json::Map::new();
    for key in [
        "input_tokens",
        "output_tokens",
        "cache_creation_input_tokens",
        "cache_read_input_tokens",
    ] {
        sanitized_usage.insert(key.into(), json!(token(key)));
    }
    let stop_sequence = value
        .get("stop_sequence")
        .and_then(Value::as_str)
        .filter(|s| s.len() <= 512);
    let response = if valid {
        Json(json!({"id":id,"type":"message","role":"assistant","model":public_model,"content":content,"stop_reason":stop,"stop_sequence":stop_sequence,"usage":sanitized_usage})).into_response()
    } else {
        invalid().into_response()
    };
    Ok(ProviderResponse {
        finish_reasons: Some(vec![finish]),
        token_categories,
        provider_model: provider_reported_model(&value),
        response,
        completed: true,
        usage,
    })
}
