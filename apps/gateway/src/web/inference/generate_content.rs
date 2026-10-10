//! Native buffered GenerateContent. Transport, admission and accounting stay shared.
use super::common::*;
use crate::{error::ApiError, guardrails::input::Protocol, state::AppState};
use axum::{
    Json,
    extract::{Path, State},
    http::HeaderMap,
    response::{IntoResponse, Response},
};
use serde_json::{Value, json};
use std::{sync::atomic::Ordering, time::Duration};

/// ```openapi
/// {
///   "path": "/v1beta/models/{model_action}",
///   "method": "post",
///   "operation": {
///     "operationId": "generateContent",
///     "summary": "Generate native buffered Gemini text",
///     "x-niu-implementation": "implemented",
///     "x-niu-status": "Static or managed gemini routes only; successful native upstream completion remains unverified.",
///     "description": "Set provider gemini and supports_generate_content true on a static route, or create a managed gemini credential and opt its model mapping into supports_generate_content. model_action is the URL-encoded public alias followed by :generateContent; encode slashes inside aliases. Niu bearer or x-niu-api-key authentication is required. Only bounded nonstreaming text with generationConfig.maxOutputTokens is supported; tools, media, cachedContent, thinking configuration and other actions are rejected before dispatch. Uses shared grants, key limits, prepaid reservations, guardrails, diagnostics and settlement; no Chat translation or automatic retry. Total output is totalTokenCount minus promptTokenCount, which includes reported thoughts under the native contract. Missing category counts remain unknown; cache-write rates are unsupported and rejected before dispatch. Unknown aggregate usage retains priced liabilities. Client response fields are projected; modelVersion uses the public alias and thought signatures are not exposed. Native SDK compatibility and successful end-to-end billing remain unverified as documented.",
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
///         "name": "model_action",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "example": "fast:generateContent"
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
///               "contents",
///               "generationConfig"
///             ],
///             "properties": {
///               "contents": {
///                 "type": "array",
///                 "minItems": 1,
///                 "maxItems": 128,
///                 "items": {
///                   "type": "object",
///                   "additionalProperties": false,
///                   "required": [
///                     "parts"
///                   ],
///                   "properties": {
///                     "role": {
///                       "type": "string",
///                       "enum": [
///                         "user",
///                         "model"
///                       ]
///                     },
///                     "parts": {
///                       "type": "array",
///                       "minItems": 1,
///                       "maxItems": 128,
///                       "items": {
///                         "type": "object",
///                         "additionalProperties": false,
///                         "required": [
///                           "text"
///                         ],
///                         "properties": {
///                           "text": {
///                             "type": "string"
///                           }
///                         }
///                       }
///                     }
///                   }
///                 }
///               },
///               "systemInstruction": {
///                 "type": "object",
///                 "additionalProperties": false,
///                 "required": [
///                   "parts"
///                 ],
///                 "properties": {
///                   "role": {
///                     "type": "string",
///                     "enum": [
///                       "user",
///                       "model",
///                       "system"
///                     ]
///                   },
///                   "parts": {
///                     "type": "array",
///                     "minItems": 1,
///                     "maxItems": 128,
///                     "items": {
///                       "type": "object",
///                       "additionalProperties": false,
///                       "required": [
///                         "text"
///                       ],
///                       "properties": {
///                         "text": {
///                           "type": "string"
///                         }
///                       }
///                     }
///                   }
///                 }
///               },
///               "generationConfig": {
///                 "type": "object",
///                 "additionalProperties": false,
///                 "required": [
///                   "maxOutputTokens"
///                 ],
///                 "properties": {
///                   "maxOutputTokens": {
///                     "type": "integer",
///                     "minimum": 1,
///                     "maximum": 1000000
///                   },
///                   "candidateCount": {
///                     "type": "integer",
///                     "enum": [
///                       1
///                     ]
///                   },
///                   "temperature": {
///                     "type": "number",
///                     "minimum": 0,
///                     "maximum": 2
///                   },
///                   "topP": {
///                     "type": "number",
///                     "minimum": 0,
///                     "maximum": 1
///                   },
///                   "topK": {
///                     "type": "integer",
///                     "minimum": 1,
///                     "maximum": 10000
///                   },
///                   "stopSequences": {
///                     "type": "array",
///                     "maxItems": 5,
///                     "items": {
///                       "type": "string",
///                       "minLength": 1,
///                       "maxLength": 512
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
///         "description": "Projected native text result. Reported usage does not prove a settled charge.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "candidates",
///                 "usageMetadata",
///                 "modelVersion"
///               ],
///               "properties": {
///                 "modelVersion": {
///                   "type": "string",
///                   "description": "Niu public model alias, not an upstream version guarantee."
///                 },
///                 "responseId": {
///                   "type": "string"
///                 },
///                 "candidates": {
///                   "type": "array",
///                   "minItems": 1,
///                   "maxItems": 1,
///                   "items": {
///                     "type": "object",
///                     "required": [
///                       "index",
///                       "content",
///                       "finishReason"
///                     ],
///                     "properties": {
///                       "index": {
///                         "type": "integer",
///                         "enum": [
///                           0
///                         ]
///                       },
///                       "content": {
///                         "type": "object",
///                         "required": [
///                           "role",
///                           "parts"
///                         ],
///                         "properties": {
///                           "role": {
///                             "type": "string",
///                             "enum": [
///                               "model"
///                             ]
///                           },
///                           "parts": {
///                             "type": "array",
///                             "items": {
///                               "type": "object",
///                               "additionalProperties": false,
///                               "required": [
///                                 "text"
///                               ],
///                               "properties": {
///                                 "text": {
///                                   "type": "string"
///                                 }
///                               }
///                             }
///                           }
///                         }
///                       },
///                       "finishReason": {
///                         "type": "string",
///                         "enum": [
///                           "STOP",
///                           "MAX_TOKENS"
///                         ]
///                       }
///                     }
///                   }
///                 },
///                 "usageMetadata": {
///                   "type": "object",
///                   "properties": {
///                     "promptTokenCount": {
///                       "type": [
///                         "integer",
///                         "null"
///                       ],
///                       "minimum": 0
///                     },
///                     "candidatesTokenCount": {
///                       "type": [
///                         "integer",
///                         "null"
///                       ],
///                       "minimum": 0
///                     },
///                     "totalTokenCount": {
///                       "type": [
///                         "integer",
///                         "null"
///                       ],
///                       "minimum": 0
///                     },
///                     "cachedContentTokenCount": {
///                       "type": [
///                         "integer",
///                         "null"
///                       ],
///                       "minimum": 0
///                     },
///                     "thoughtsTokenCount": {
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
///         "description": "Invalid or unsupported text document",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "error"
///               ],
///               "properties": {
///                 "error": {
///                   "type": "object",
///                   "required": [
///                     "code",
///                     "status",
///                     "message"
///                   ],
///                   "properties": {
///                     "code": {
///                       "type": "integer"
///                     },
///                     "status": {
///                       "type": "string"
///                     },
///                     "message": {
///                       "type": "string"
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "401": {
///         "description": "Niu authentication required",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "error"
///               ],
///               "properties": {
///                 "error": {
///                   "type": "object",
///                   "required": [
///                     "code",
///                     "status",
///                     "message"
///                   ],
///                   "properties": {
///                     "code": {
///                       "type": "integer"
///                     },
///                     "status": {
///                       "type": "string"
///                     },
///                     "message": {
///                       "type": "string"
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "402": {
///         "description": "Insufficient capacity",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "error"
///               ],
///               "properties": {
///                 "error": {
///                   "type": "object",
///                   "required": [
///                     "code",
///                     "status",
///                     "message"
///                   ],
///                   "properties": {
///                     "code": {
///                       "type": "integer"
///                     },
///                     "status": {
///                       "type": "string"
///                     },
///                     "message": {
///                       "type": "string"
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "403": {
///         "description": "Scope or policy denial",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "error"
///               ],
///               "properties": {
///                 "error": {
///                   "type": "object",
///                   "required": [
///                     "code",
///                     "status",
///                     "message"
///                   ],
///                   "properties": {
///                     "code": {
///                       "type": "integer"
///                     },
///                     "status": {
///                       "type": "string"
///                     },
///                     "message": {
///                       "type": "string"
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "404": {
///         "description": "Unavailable model",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "error"
///               ],
///               "properties": {
///                 "error": {
///                   "type": "object",
///                   "required": [
///                     "code",
///                     "status",
///                     "message"
///                   ],
///                   "properties": {
///                     "code": {
///                       "type": "integer"
///                     },
///                     "status": {
///                       "type": "string"
///                     },
///                     "message": {
///                       "type": "string"
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "413": {
///         "description": "Body exceeds 64 KiB",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "error"
///               ],
///               "properties": {
///                 "error": {
///                   "type": "object",
///                   "required": [
///                     "code",
///                     "status",
///                     "message"
///                   ],
///                   "properties": {
///                     "code": {
///                       "type": "integer"
///                     },
///                     "status": {
///                       "type": "string"
///                     },
///                     "message": {
///                       "type": "string"
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "422": {
///         "description": "Unsupported configured token category pricing",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "error"
///               ],
///               "properties": {
///                 "error": {
///                   "type": "object",
///                   "required": [
///                     "code",
///                     "status",
///                     "message"
///                   ],
///                   "properties": {
///                     "code": {
///                       "type": "integer"
///                     },
///                     "status": {
///                       "type": "string"
///                     },
///                     "message": {
///                       "type": "string"
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "429": {
///         "description": "Key or workspace limit",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "error"
///               ],
///               "properties": {
///                 "error": {
///                   "type": "object",
///                   "required": [
///                     "code",
///                     "status",
///                     "message"
///                   ],
///                   "properties": {
///                     "code": {
///                       "type": "integer"
///                     },
///                     "status": {
///                       "type": "string"
///                     },
///                     "message": {
///                       "type": "string"
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "501": {
///         "description": "Unsupported action or undeclared native route",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "error"
///               ],
///               "properties": {
///                 "error": {
///                   "type": "object",
///                   "required": [
///                     "code",
///                     "status",
///                     "message"
///                   ],
///                   "properties": {
///                     "code": {
///                       "type": "integer"
///                     },
///                     "status": {
///                       "type": "string"
///                     },
///                     "message": {
///                       "type": "string"
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "502": {
///         "description": "Sanitized upstream or output failure",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "error"
///               ],
///               "properties": {
///                 "error": {
///                   "type": "object",
///                   "required": [
///                     "code",
///                     "status",
///                     "message"
///                   ],
///                   "properties": {
///                     "code": {
///                       "type": "integer"
///                     },
///                     "status": {
///                       "type": "string"
///                     },
///                     "message": {
///                       "type": "string"
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "503": {
///         "description": "Unavailable service",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "error"
///               ],
///               "properties": {
///                 "error": {
///                   "type": "object",
///                   "required": [
///                     "code",
///                     "status",
///                     "message"
///                   ],
///                   "properties": {
///                     "code": {
///                       "type": "integer"
///                     },
///                     "status": {
///                       "type": "string"
///                     },
///                     "message": {
///                       "type": "string"
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub(in crate::web) async fn generate_content(
    State(state): State<AppState>,
    Path(action): Path<String>,
    headers: HeaderMap,
    input: Result<Json<Value>, axum::extract::rejection::JsonRejection>,
) -> Response {
    let result = match input {
        Ok(Json(body)) => execute(&state, &headers, &action, body).await,
        Err(_) => Err(ApiError::invalid_request(
            "Expected a bounded GenerateContent JSON request",
        )),
    };
    let response = result.unwrap_or_else(IntoResponse::into_response);
    if response.status().is_success() {
        return response;
    }
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
        .unwrap_or("GenerateContent request failed");
    let status = match parts.status.as_u16() {
        400 | 413 | 422 => "INVALID_ARGUMENT",
        401 => "UNAUTHENTICATED",
        403 => "PERMISSION_DENIED",
        404 => "NOT_FOUND",
        402 | 429 => "RESOURCE_EXHAUSTED",
        501 => "UNIMPLEMENTED",
        503 => "UNAVAILABLE",
        _ => "INTERNAL",
    };
    let body = json!({"error":{"code":parts.status.as_u16(),"status":status,"message":message}});
    Response::from_parts(parts, axum::body::Body::from(body.to_string()))
}

async fn execute(
    state: &AppState,
    headers: &HeaderMap,
    action: &str,
    mut body: Value,
) -> Result<Response, ApiError> {
    let _in_flight = state.track_inference();
    let principal = state.authorize_api_headers(headers).await?;
    let public_model = action
        .strip_suffix(":generateContent")
        .filter(|v| {
            !v.is_empty() && v.len() <= 200 && !v.contains(':') && !v.chars().any(char::is_control)
        })
        .ok_or_else(|| {
            ApiError::unsupported_message("Only buffered generateContent is supported")
        })?;
    let bound = validate(&body)?;
    if !principal.allows_model(public_model) {
        return Err(ApiError::not_found());
    }
    let resolved = crate::vendors::resolve_scoped_model(
        state,
        principal.scope().organization_id,
        public_model,
        Protocol::GenerateContent,
        None,
    )
    .await?;
    let model = &resolved.model;
    if model.provider != "gemini" || !model.supports_generate_content {
        return Err(ApiError::unsupported_message(
            "This route does not declare native GenerateContent support",
        ));
    }
    // A native model ID is one path segment, never an endpoint supplied by a client.
    if model.upstream_model.is_empty()
        || !model
            .upstream_model
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"._-".contains(&c))
    {
        return Err(ApiError::unsupported_message(
            "This route has an unsupported native Gemini model ID",
        ));
    }
    let snapshot = inspect_request_input(
        state,
        &principal,
        public_model,
        model,
        Protocol::GenerateContent,
        &mut body,
    )
    .await?;
    validate(&body)?;
    if let Some(price) = &model.pricing
        && (bound > price.max_output_tokens
            || serde_json::to_vec(&body)
                .map_err(|_| ApiError::invalid_request("Invalid GenerateContent request"))?
                .len()
                > price.max_input_tokens as usize)
    {
        return Err(ApiError::invalid_request(
            "GenerateContent exceeds the priced route's conservative input or output bound",
        ));
    }
    let timeout = Duration::from_secs(state.config.server.request_timeout_seconds);
    let endpoint = format!(
        "{}/models/{}:generateContent",
        model
            .endpoint_base()
            .ok_or_else(ApiError::unavailable)?
            .trim_end_matches('/'),
        model.upstream_model
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
            public_model,
            model,
            completion_bound: Some(bound),
            task_id: task_id.as_deref(),
            snapshot,
            request_body: &body,
            protocol: Protocol::GenerateContent,
        },
    )
    .await?;
    let usage_attempt = state.usage.begin();
    let result = async {
        let response = client
            .post(endpoint)
            .timeout(timeout)
            .header("x-goog-api-key", &resolved.api_key)
            .json(&body)
            .send()
            .await
            .map_err(|error| ApiError::upstream_transport(&error))?;
        if !response.status().is_success() {
            return Err(provider_rejection(response).await);
        }
        let value = provider_json(response)
            .await
            .map_err(|_| ApiError::upstream_invalid_response())?;
        let response = normalize(value, public_model)?;
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
    let invalid =
        || ApiError::invalid_request("Unsupported or invalid GenerateContent text request");
    crate::guardrails::input::CompiledInputPolicy::compile(&[])
        .map_err(|_| invalid())?
        .inspect(Protocol::GenerateContent, body)
        .map_err(|_| invalid())?;
    let config = body
        .get("generationConfig")
        .and_then(Value::as_object)
        .ok_or_else(invalid)?;
    if config.keys().any(|key| {
        ![
            "maxOutputTokens",
            "candidateCount",
            "temperature",
            "topP",
            "topK",
            "stopSequences",
        ]
        .contains(&key.as_str())
    }) || config
        .get("candidateCount")
        .is_some_and(|v| v.as_u64() != Some(1))
    {
        return Err(invalid());
    }
    let bound = config
        .get("maxOutputTokens")
        .and_then(Value::as_i64)
        .filter(|v| (1..=1_000_000).contains(v))
        .ok_or_else(invalid)?;
    for (field, maximum) in [("temperature", 2.0), ("topP", 1.0)] {
        if config.get(field).is_some_and(|v| {
            !v.as_f64()
                .is_some_and(|n| n.is_finite() && (0.0..=maximum).contains(&n))
        }) {
            return Err(invalid());
        }
    }
    if config
        .get("topK")
        .is_some_and(|v| !v.as_u64().is_some_and(|n| (1..=10000).contains(&n)))
        || config.get("stopSequences").is_some_and(|v| {
            !v.as_array().is_some_and(|items| {
                items.len() <= 5
                    && items
                        .iter()
                        .all(|s| s.as_str().is_some_and(|s| !s.is_empty() && s.len() <= 512))
            })
        })
    {
        return Err(invalid());
    }
    Ok(bound)
}

fn normalize(value: Value, public_model: &str) -> Result<ProviderResponse, ApiError> {
    let invalid = ApiError::upstream_invalid_response;
    let token = |key: &str| {
        value["usageMetadata"][key]
            .as_u64()
            .filter(|n| *n <= 9_007_199_254_740_991)
    };
    // Google's documented total includes prompt, thoughts and response candidates.
    // Aggregate output can therefore be known without inventing a missing category.
    let usage = (|| {
        let prompt = token("promptTokenCount")?;
        let candidates = token("candidatesTokenCount")?;
        let total = token("totalTokenCount")?;
        let output = total.checked_sub(prompt).filter(|n| *n >= candidates)?;
        if value["usageMetadata"].get("thoughtsTokenCount").is_some()
            && candidates.checked_add(token("thoughtsTokenCount")?)? != output
        {
            return None;
        }
        if value["usageMetadata"]
            .get("toolUsePromptTokenCount")
            .is_some()
            && token("toolUsePromptTokenCount")? != 0
        {
            return None;
        }
        Some((prompt, output))
    })();
    let token_categories = usage.and_then(|(prompt, output)| {
        let cached = token("cachedContentTokenCount")
            .filter(|n| *n <= prompt)
            .map(|n| n as i64);
        let reasoning = token("thoughtsTokenCount")
            .filter(|n| *n <= output)
            .map(|n| n as i64);
        (cached.is_some() || reasoning.is_some()).then_some(niu_storage::RequestTokenCategories {
            cached_input_tokens: cached,
            cache_write_input_tokens: None,
            reasoning_output_tokens: reasoning,
        })
    });
    let candidate = value["candidates"]
        .as_array()
        .filter(|v| v.len() == 1)
        .and_then(|v| v.first());
    let stop = candidate
        .and_then(|c| c["finishReason"].as_str())
        .filter(|s| matches!(*s, "STOP" | "MAX_TOKENS"));
    let parts = candidate.and_then(|c| {
        if c["content"]["role"] != "model" {
            return None;
        }
        c["content"]["parts"]
            .as_array()
            .filter(|v| !v.is_empty() && v.len() <= 128)?
            .iter()
            .map(|part| {
                let object = part.as_object()?;
                if object
                    .keys()
                    .any(|key| !["text", "thoughtSignature"].contains(&key.as_str()))
                {
                    return None;
                }
                Some(json!({"text":part["text"].as_str()?}))
            })
            .collect::<Option<Vec<_>>>()
    });
    let valid = stop.is_some() && parts.is_some();
    if !valid && usage.is_none() {
        return Err(invalid());
    }
    let finish_reasons = stop.map(|stop| {
        vec![niu_storage::RequestChoiceFinish {
            index: 0,
            reason: if stop == "MAX_TOKENS" {
                niu_storage::RequestFinishReason::Length
            } else {
                niu_storage::RequestFinishReason::Stop
            },
        }]
    });
    let mut sanitized = json!({"candidates":[{"index":0,"content":{"role":"model","parts":parts},"finishReason":stop}],"modelVersion":public_model});
    let mut metadata = serde_json::Map::new();
    for key in [
        "promptTokenCount",
        "candidatesTokenCount",
        "totalTokenCount",
        "cachedContentTokenCount",
        "thoughtsTokenCount",
    ] {
        metadata.insert(key.into(), json!(token(key)));
    }
    sanitized["usageMetadata"] = Value::Object(metadata);
    if let Some(id) = value["responseId"]
        .as_str()
        .filter(|s| !s.is_empty() && s.len() <= 200 && !s.chars().any(char::is_control))
    {
        sanitized["responseId"] = json!(id);
    }
    let provider_model = value["modelVersion"]
        .as_str()
        .filter(|s| !s.is_empty() && s.len() <= 200 && !s.chars().any(char::is_control))
        .map(str::to_owned);
    Ok(ProviderResponse {
        response: if valid {
            Json(sanitized).into_response()
        } else {
            invalid().into_response()
        },
        completed: true,
        usage,
        token_categories,
        provider_model,
        finish_reasons,
    })
}
