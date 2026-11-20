//! Native buffered GenerateContent. Transport, admission and accounting stay shared.
use super::common::*;
use crate::{error::ApiError, guardrails::input::Protocol, state::AppState};
use axum::{
    Json,
    extract::{Path, RawQuery, State},
    http::{HeaderMap, HeaderValue, header},
    response::{IntoResponse, Response},
};
use serde_json::{Value, json};
use std::{collections::BTreeSet, sync::atomic::Ordering, time::Duration};

/// ```openapi
/// {
///   "path": "/v1beta/models/{model_action}",
///   "method": "post",
///   "operation": {
///     "operationId": "generateContent",
///     "summary": "Generate native Gemini content or streamGenerateContent",
///     "x-niu-implementation": "implemented",
///     "x-niu-status": "Static or managed gemini routes supporting buffered :generateContent and streaming :streamGenerateContent (?alt=sse SSE or JSON array stream), client functionDeclarations/toolConfig, thinkingConfig, responseMimeType/responseSchema, and unpriced inlineData.",
///     "description": "Requires provider gemini with supports_generate_content enabled; streaming additionally requires supports_generate_content_streaming. model_action accepts {model}:generateContent or {model}:streamGenerateContent (URL-encode slashes inside aliases). Streaming returns JSON array chunks by default or SSE when ?alt=sse is supplied; query ?key= is rejected (use Authorization: Bearer or x-niu-api-key). Supports client functionDeclarations (normalized offline schema checks) and toolConfig.functionCallingConfig (AUTO/ANY/NONE), thought and thoughtSignature pass-through, generationConfig.thinkingConfig, responseMimeType (application/json) with responseSchema/responseJsonSchema, and unpriced user inlineData (image/* or application/pdf within 8 MiB; rejected with 400 on priced routes). Total input accounting combines promptTokenCount and toolUsePromptTokenCount; total output equals totalTokenCount minus total input. Missing terminal evidence or mid-stream interruptions retain holds and uncertainty.",
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
///       },
///       {
///         "name": "alt",
///         "in": "query",
///         "required": false,
///         "description": "Use alt=sse with :streamGenerateContent to receive text/event-stream instead of a JSON array stream. Unsupported on :generateContent.",
///         "schema": {
///           "type": "string",
///           "enum": [
///             "sse"
///           ]
///         }
///       },
///       {
///         "name": "x-niu-evaluation",
///         "in": "header",
///         "required": false,
///         "description": "Opt-in evaluation-slug@revision/sample binding. Requires current evaluations:read delegation and the pinned protocol-bound effective request hash. A mismatch is rejected before dispatch. Not forwarded upstream. This is not idempotency or authority for a paid evaluation budget; discover admitted attempts after an uncertain response before considering replay. Untagged requests do not establish verified sample equivalence.",
///         "schema": {
///           "type": "string",
///           "maxLength": 200,
///           "pattern": "^[a-z0-9]+(-[a-z0-9]+)*@[1-9][0-9]*/[A-Za-z0-9_.-]+$"
///         }
///       },
///       {
///         "name": "x-niu-routing-context",
///         "in": "header",
///         "required": false,
///         "description": "Optional bounded JSON task context for an explicitly selected semantic Auto policy, for example {\"task\":\"coding\",\"stage\":\"implementation\"}. task and stage are lowercase tokens of at most 64 characters. Unknown fields, repeated headers and malformed values are rejected before selection. The value is not forwarded upstream; a configured decider receives only the validated context and declared path metadata, never conversation content. Present but invalid context is rejected even when the selected policy is not Auto.",
///         "schema": {
///           "type": "string",
///           "maxLength": 512
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
///               "contents"
///             ],
///             "properties": {
///               "contents": {
///                 "type": "array",
///                 "minItems": 1,
///                 "maxItems": 256,
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
///                         "type": "object"
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
///               "tools": {
///                 "type": "array",
///                 "minItems": 1,
///                 "maxItems": 16,
///                 "items": {
///                   "type": "object"
///                 }
///               },
///               "toolConfig": {
///                 "type": "object"
///               },
///               "generationConfig": {
///                 "type": "object",
///                 "additionalProperties": false,
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
///                   "seed": {
///                     "type": "integer"
///                   },
///                   "presencePenalty": {
///                     "type": "number",
///                     "minimum": -2,
///                     "maximum": 2
///                   },
///                   "frequencyPenalty": {
///                     "type": "number",
///                     "minimum": -2,
///                     "maximum": 2
///                   },
///                   "stopSequences": {
///                     "type": "array",
///                     "maxItems": 5,
///                     "items": {
///                       "type": "string",
///                       "minLength": 1,
///                       "maxLength": 512
///                     }
///                   },
///                   "thinkingConfig": {
///                     "type": "object"
///                   },
///                   "responseMimeType": {
///                     "type": "string",
///                     "enum": [
///                       "text/plain",
///                       "application/json"
///                     ]
///                   },
///                   "responseSchema": {
///                     "type": "object"
///                   },
///                   "responseJsonSchema": {
///                     "type": "object"
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
///                               "additionalProperties": true
///                             }
///                           }
///                         }
///                       },
///                       "finishReason": {
///                         "type": "string",
///                         "enum": [
///                           "STOP",
///                           "MAX_TOKENS",
///                           "SAFETY",
///                           "RECITATION",
///                           "BLOCKLIST",
///                           "PROHIBITED_CONTENT",
///                           "SPII"
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
///                     "toolUsePromptTokenCount": {
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
///           },
///           "text/event-stream": {
///             "schema": {
///               "type": "string"
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
///         "description": "Body exceeds 1 MiB",
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
    RawQuery(raw_query): RawQuery,
    headers: HeaderMap,
    input: Result<Json<Value>, axum::extract::rejection::JsonRejection>,
) -> Response {
    let result = match input {
        Ok(Json(body)) => execute(&state, &headers, &action, raw_query.as_deref(), body).await,
        Err(rejection) if rejection.status() == axum::http::StatusCode::PAYLOAD_TOO_LARGE => {
            Err(ApiError::request_too_large())
        }
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

struct ValidatedGenerateContentRequest {
    bound: Option<i64>,
    has_tools: bool,
    has_tool_history: bool,
    has_structured_output: bool,
    has_reasoning: bool,
    has_media: bool,
    has_image: bool,
    validator: crate::streaming::GenerateContentOutputValidator,
}

async fn execute(
    state: &AppState,
    headers: &HeaderMap,
    action: &str,
    raw_query: Option<&str>,
    mut body: Value,
) -> Result<Response, ApiError> {
    let _in_flight = state.track_inference();
    let principal = state
        .authorize_invocation_headers(headers, "content")
        .await?;
    let (selected_raw, streaming) = if let Some(model) = action.strip_suffix(":generateContent") {
        (model, false)
    } else if let Some(model) = action.strip_suffix(":streamGenerateContent") {
        (model, true)
    } else {
        return Err(ApiError::unsupported_message(
            "Only generateContent and streamGenerateContent actions are supported",
        ));
    };
    if selected_raw.is_empty()
        || selected_raw.len() > 200
        || selected_raw.contains(':')
        || selected_raw.chars().any(char::is_control)
    {
        return Err(ApiError::invalid_request(
            "Invalid GenerateContent model name",
        ));
    }
    let sse = match raw_query {
        None | Some("") => false,
        Some("alt=sse") if streaming => true,
        _ => {
            return Err(ApiError::invalid_request(
                "Unsupported query parameter; pass API keys in headers and use ?alt=sse only with :streamGenerateContent",
            ));
        }
    };
    let mut selected_model = selected_raw.to_owned();
    let mut traits = crate::routing_traits::extract(Protocol::GenerateContent, &body);
    traits.streaming = streaming;
    crate::routing_traits::require_supported(Protocol::GenerateContent, &traits)?;
    let mut validated = validate(&body)?;
    if !selected_model.starts_with("pool/") && !principal.allows_model(&selected_model) {
        return Err(ApiError::not_found());
    }
    let requirements = traits.requirements(
        Some(principal.scope().project_id),
        Protocol::GenerateContent,
    );
    let selection = crate::web::workspace_pools::select_for_request(
        state,
        &principal,
        &mut selected_model,
        &mut body,
        Protocol::GenerateContent,
        &requirements,
        headers,
    )
    .await?;
    let public_model = selected_model.as_str();
    let result = async {
        let resolved = crate::vendors::resolve_scoped_model(
            state,
            principal.scope().organization_id,
            public_model,
            Protocol::GenerateContent,
            Some(&requirements),
        )
        .await?;
        let model = &resolved.model;
        if model.provider != "gemini" || !model.supports_generate_content {
            return Err(ApiError::unsupported_message(
                "This route does not declare native GenerateContent support",
            ));
        }
        if streaming && !model.supports_generate_content_streaming {
            return Err(ApiError::unsupported_message(
                "This route does not declare streaming GenerateContent support",
            ));
        }
        if (validated.has_tools || validated.has_tool_history) && !model.supports_tool_calls {
            return Err(ApiError::unsupported_message(
                "This route does not declare function tool support",
            ));
        }
        if streaming && validated.has_tools && !model.supports_streaming_tool_calls {
            return Err(ApiError::unsupported_message(
                "This route does not declare streaming tool support",
            ));
        }
        if validated.has_structured_output && !model.supports_structured_output {
            return Err(ApiError::unsupported_message(
                "This route does not declare structured JSON output support",
            ));
        }
        if validated.has_image
            && !model.catalog.input_modalities.is_empty()
            && !model
                .catalog
                .input_modalities
                .iter()
                .any(|mode| mode == "image")
        {
            return Err(ApiError::unsupported_message(
                "This route does not declare image input support",
            ));
        }
        if validated.has_reasoning
            && !model.catalog.supported_parameters.is_empty()
            && !model
                .catalog
                .supported_parameters
                .iter()
                .any(|parameter| parameter == "reasoning" || parameter == "include_reasoning")
        {
            return Err(ApiError::unsupported_message(
                "This route does not declare reasoning support",
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
        if snapshot.input_outcome.as_deref() == Some("redacted") {
            validated = validate(&body)?;
        }
        if let Some(price) = &model.pricing {
            if validated.has_media {
                return Err(ApiError::invalid_request(
                    "Image and document inlineData inputs are not supported on priced GenerateContent routes; choose an unpriced route or send text only",
                ));
            }
            if validated.bound.is_none() {
                if let Some(object) = body.as_object_mut() {
                    let config = object
                        .entry("generationConfig")
                        .or_insert_with(|| json!({}));
                    if let Some(cfg_obj) = config.as_object_mut() {
                        cfg_obj.insert("maxOutputTokens".into(), json!(price.max_output_tokens));
                    }
                }
                validated.bound = Some(price.max_output_tokens);
            }
            let bound = validated.bound.unwrap_or(price.max_output_tokens);
            if bound > price.max_output_tokens
                || price.max_input_tokens <= 0
                || crate::inference_schema::json_serialized_len_within(
                    &body,
                    price.max_input_tokens as usize,
                )
                .is_err()
            {
                return Err(ApiError::invalid_request(
                    "GenerateContent exceeds the priced route's conservative input or output bound",
                ));
            }
        }
        let timeout = Duration::from_secs(state.config.server.request_timeout_seconds);
        let base = model
            .endpoint_base()
            .ok_or_else(ApiError::unavailable)?
            .trim_end_matches('/');
        let endpoint = if !streaming {
            format!("{base}/models/{}:generateContent", model.upstream_model)
        } else {
            format!("{base}/models/{}:streamGenerateContent", model.upstream_model)
        };
        let client = crate::upstream::configured_client_for_endpoint(state, &endpoint, timeout)
            .await
            .map_err(ApiError::from_endpoint)?;
        let task_id = request_task_id(headers)?;
        state.requests.fetch_add(1, Ordering::Relaxed);
        let dispatch = begin_attempt(
            state,
            &principal,
            AttemptRequest {
                headers,
                route_generation: resolved.route_generation,
                managed_route: resolved.managed_route.as_ref(),
                personal_route: resolved.personal_route.as_ref(),
                public_model,
                model,
                completion_bound: validated.bound,
                task_id: task_id.as_deref(),
                snapshot,
                request_body: &body,
                protocol: Protocol::GenerateContent,
            },
        )
        .await?;
        let validator = validated.validator;
        let usage_attempt = state.usage.begin();
        let result = async {
            let mut request = client
                .post(endpoint)
                .timeout(timeout)
                .header("x-goog-api-key", &resolved.api_key)
                .header(
                    header::ACCEPT,
                    if sse {
                        "text/event-stream"
                    } else {
                        "application/json"
                    },
                );
            if sse {
                request = request.query(&[("alt", "sse")]);
            }
            let response = request
                .json(&body)
                .send()
                .await
                .map_err(|error| ApiError::upstream_transport(&error))?;
            if !response.status().is_success() {
                return Err(provider_rejection(response).await);
            }
            if streaming {
                let ct_ok = response
                    .headers()
                    .get(header::CONTENT_TYPE)
                    .and_then(|v| v.to_str().ok())
                    .and_then(|v| v.split(';').next())
                    .is_some_and(|v| {
                        let mime = v.trim();
                        if sse {
                            mime.eq_ignore_ascii_case("text/event-stream")
                        } else {
                            mime.eq_ignore_ascii_case("application/json")
                        }
                    });
                if !ct_ok {
                    return Err(ApiError::upstream_invalid_response());
                }
                let mut stream_response =
                    Response::new(crate::streaming::tracked_generate_content_body(
                        response.bytes_stream(),
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
                        validator,
                        sse,
                    ));
                stream_response.headers_mut().insert(
                    header::CONTENT_TYPE,
                    HeaderValue::from_static(if sse {
                        "text/event-stream"
                    } else {
                        "application/json; charset=utf-8"
                    }),
                );
                stream_response
                    .headers_mut()
                    .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
                stream_response.headers_mut().insert(
                    "x-niu-model",
                    HeaderValue::from_str(public_model)
                        .map_err(|_| ApiError::invalid_request("Invalid model alias"))?,
                );
                return Ok(ProviderResponse {
                    response: stream_response,
                    completed: false,
                    usage: None,
                    token_categories: None,
                    provider_model: None,
                    finish_reasons: None,
                });
            }
            let value = provider_json(response)
                .await
                .map_err(|_| ApiError::upstream_invalid_response())?;
            let response = normalize(value, public_model, &validator)?;
            if let Some((prompt, completion)) = response.usage {
                usage_attempt
                    .report(&json!({"prompt_tokens":prompt,"completion_tokens":completion}));
            }
            Ok(response)
        }
        .await;
        if result.is_err() {
            state.failures.fetch_add(1, Ordering::Relaxed);
        }
        Ok(finalize_response(state, dispatch, result).await)
    }
    .await;
    if let Some(selection) = selection {
        crate::web::workspace_pools::finish_selection(state, selection, result).await
    } else {
        result
    }
}

fn normalize_gemini_schema(value: &Value) -> Value {
    match value {
        Value::Array(items) => Value::Array(items.iter().map(normalize_gemini_schema).collect()),
        Value::Object(map) => {
            let mut out = serde_json::Map::new();
            let nullable = map.get("nullable").and_then(Value::as_bool) == Some(true);
            for (k, v) in map {
                if k == "nullable" {
                    continue;
                }
                if k == "type"
                    && let Some(raw_type) = v.as_str()
                {
                    let lower = match raw_type {
                        "OBJECT" => "object",
                        "STRING" => "string",
                        "NUMBER" => "number",
                        "INTEGER" => "integer",
                        "BOOLEAN" => "boolean",
                        "ARRAY" => "array",
                        "NULL" => "null",
                        other => other,
                    };
                    if nullable {
                        out.insert(k.clone(), json!([lower, "null"]));
                    } else {
                        out.insert(k.clone(), json!(lower));
                    }
                    continue;
                }
                out.insert(k.clone(), normalize_gemini_schema(v));
            }
            Value::Object(out)
        }
        _ => value.clone(),
    }
}

fn valid_gemini_identifier(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 64
        && name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-' | b'.'))
}

fn validate(body: &Value) -> Result<ValidatedGenerateContentRequest, ApiError> {
    let invalid = || ApiError::invalid_request("Unsupported or invalid GenerateContent request");
    let object = body.as_object().ok_or_else(invalid)?;
    if object.keys().any(|key| {
        ![
            "contents",
            "systemInstruction",
            "generationConfig",
            "tools",
            "toolConfig",
        ]
        .contains(&key.as_str())
    }) {
        return Err(invalid());
    }

    let mut validator = crate::streaming::GenerateContentOutputValidator::default();
    let has_tools = if let Some(tools_val) = object.get("tools") {
        let groups = tools_val
            .as_array()
            .filter(|g| !g.is_empty() && g.len() <= 16)
            .ok_or_else(invalid)?;
        let mut total_decls = 0usize;
        for group in groups {
            let group_obj = group.as_object().ok_or_else(invalid)?;
            if group_obj.keys().any(|k| k != "functionDeclarations") {
                return Err(ApiError::invalid_request(
                    "Only client functionDeclarations are supported in GenerateContent tools",
                ));
            }
            let decls = group_obj
                .get("functionDeclarations")
                .and_then(Value::as_array)
                .filter(|d| !d.is_empty())
                .ok_or_else(invalid)?;
            total_decls = total_decls.saturating_add(decls.len());
            if total_decls > 128 {
                return Err(invalid());
            }
            for decl in decls {
                let decl_obj = decl.as_object().ok_or_else(invalid)?;
                if decl_obj.keys().any(|k| {
                    !["name", "description", "parameters", "parametersJsonSchema"]
                        .contains(&k.as_str())
                }) {
                    return Err(invalid());
                }
                let name = decl_obj
                    .get("name")
                    .and_then(Value::as_str)
                    .filter(|n| valid_gemini_identifier(n))
                    .ok_or_else(invalid)?;
                if validator.tools.contains_key(name) {
                    return Err(invalid());
                }
                if decl_obj
                    .get("description")
                    .is_some_and(|v| v.as_str().is_none_or(|s| s.len() > 4096))
                {
                    return Err(invalid());
                }
                let compiled = match (
                    decl_obj.get("parameters"),
                    decl_obj.get("parametersJsonSchema"),
                ) {
                    (Some(_), Some(_)) => return Err(invalid()),
                    (Some(schema), None) => {
                        if !schema.is_object() {
                            return Err(invalid());
                        }
                        let norm = normalize_gemini_schema(schema);
                        Some(crate::inference_schema::validator(&norm).map_err(|()| invalid())?)
                    }
                    (None, Some(schema)) => {
                        if !schema.is_object() {
                            return Err(invalid());
                        }
                        Some(crate::inference_schema::validator(schema).map_err(|()| invalid())?)
                    }
                    (None, None) => None,
                };
                validator.tools.insert(name.to_owned(), compiled);
            }
        }
        true
    } else {
        false
    };

    if let Some(tool_config) = object.get("toolConfig") {
        if !has_tools {
            return Err(invalid());
        }
        let tc_obj = tool_config.as_object().ok_or_else(invalid)?;
        if tc_obj.keys().any(|k| k != "functionCallingConfig") {
            return Err(invalid());
        }
        let fc_obj = tc_obj
            .get("functionCallingConfig")
            .and_then(Value::as_object)
            .ok_or_else(invalid)?;
        if fc_obj
            .keys()
            .any(|k| !["mode", "allowedFunctionNames"].contains(&k.as_str()))
        {
            return Err(invalid());
        }
        let mode = fc_obj.get("mode").and_then(Value::as_str);
        match mode {
            None | Some("AUTO") => {}
            Some("ANY") => validator.require_tool_call = true,
            Some("NONE") => validator.forbid_tool_call = true,
            _ => return Err(invalid()),
        }
        if let Some(allowed) = fc_obj.get("allowedFunctionNames") {
            if mode != Some("ANY") {
                return Err(invalid());
            }
            let names = allowed
                .as_array()
                .filter(|v| !v.is_empty() && v.len() <= 128)
                .ok_or_else(invalid)?;
            let mut set = BTreeSet::new();
            for item in names {
                let n = item
                    .as_str()
                    .filter(|n| validator.tools.contains_key(*n))
                    .ok_or_else(invalid)?;
                set.insert(n.to_owned());
            }
            validator.allowed_tools = Some(set);
        }
    }

    if let Some(sys) = object.get("systemInstruction") {
        let sys_obj = sys.as_object().ok_or_else(invalid)?;
        if sys_obj
            .keys()
            .any(|k| !["role", "parts"].contains(&k.as_str()))
            || sys_obj
                .get("role")
                .is_some_and(|r| !matches!(r.as_str(), Some("system" | "user")))
        {
            return Err(invalid());
        }
        let parts = sys_obj
            .get("parts")
            .and_then(Value::as_array)
            .filter(|v| !v.is_empty() && v.len() <= 128)
            .ok_or_else(invalid)?;
        for part in parts {
            let pobj = part.as_object().ok_or_else(invalid)?;
            if pobj.len() != 1 || pobj.get("text").and_then(Value::as_str).is_none() {
                return Err(invalid());
            }
        }
    }

    let contents = object
        .get("contents")
        .and_then(Value::as_array)
        .filter(|v| !v.is_empty() && v.len() <= 256)
        .ok_or_else(invalid)?;
    let mut has_media = false;
    let mut has_image = false;
    let mut has_tool_history = false;
    let mut seen_function_calls = BTreeSet::new();
    for content in contents {
        let cobj = content.as_object().ok_or_else(invalid)?;
        if cobj
            .keys()
            .any(|k| !["role", "parts"].contains(&k.as_str()))
        {
            return Err(invalid());
        }
        let role = match cobj.get("role") {
            None => "user",
            Some(v) => match v.as_str() {
                Some(r @ ("user" | "model")) => r,
                _ => return Err(invalid()),
            },
        };
        let parts = cobj
            .get("parts")
            .and_then(Value::as_array)
            .filter(|v| !v.is_empty() && v.len() <= 128)
            .ok_or_else(invalid)?;
        for part in parts {
            let pobj = part.as_object().ok_or_else(invalid)?;
            if let Some(call) = pobj.get("functionCall") {
                if role != "model"
                    || pobj
                        .keys()
                        .any(|k| !["functionCall", "thoughtSignature"].contains(&k.as_str()))
                    || pobj
                        .get("thoughtSignature")
                        .is_some_and(|v| v.as_str().is_none_or(|s| s.len() > 262_144))
                {
                    return Err(invalid());
                }
                let call_obj = call.as_object().ok_or_else(invalid)?;
                if call_obj
                    .keys()
                    .any(|k| !["name", "args", "id"].contains(&k.as_str()))
                    || !call_obj.get("args").is_some_and(Value::is_object)
                {
                    return Err(invalid());
                }
                let name = call_obj
                    .get("name")
                    .and_then(Value::as_str)
                    .filter(|n| valid_gemini_identifier(n))
                    .ok_or_else(invalid)?;
                if has_tools && !validator.tools.contains_key(name) {
                    return Err(invalid());
                }
                seen_function_calls.insert(name.to_owned());
                has_tool_history = true;
            } else if let Some(resp) = pobj.get("functionResponse") {
                if role != "user" || pobj.len() != 1 {
                    return Err(invalid());
                }
                let resp_obj = resp.as_object().ok_or_else(invalid)?;
                if resp_obj
                    .keys()
                    .any(|k| !["name", "response", "id"].contains(&k.as_str()))
                    || !resp_obj.get("response").is_some_and(Value::is_object)
                {
                    return Err(invalid());
                }
                let name = resp_obj
                    .get("name")
                    .and_then(Value::as_str)
                    .filter(|n| seen_function_calls.contains(*n))
                    .ok_or_else(invalid)?;
                let _ = name;
                has_tool_history = true;
            } else if let Some(inline) = pobj.get("inlineData") {
                if role != "user" || pobj.len() != 1 {
                    return Err(invalid());
                }
                let inline_obj = inline.as_object().ok_or_else(invalid)?;
                if inline_obj
                    .keys()
                    .any(|k| !["mimeType", "data"].contains(&k.as_str()))
                {
                    return Err(invalid());
                }
                let mime = inline_obj
                    .get("mimeType")
                    .and_then(Value::as_str)
                    .ok_or_else(invalid)?;
                if !matches!(
                    mime,
                    "image/png" | "image/jpeg" | "image/webp" | "image/gif" | "application/pdf"
                ) {
                    return Err(invalid());
                }
                if !inline_obj
                    .get("data")
                    .and_then(Value::as_str)
                    .is_some_and(|d| {
                        crate::native_messages_tools::valid_base64_payload(d, 8 * 1024 * 1024)
                    })
                {
                    return Err(invalid());
                }
                has_media = true;
                if mime.starts_with("image/") {
                    has_image = true;
                }
            } else {
                if pobj
                    .keys()
                    .any(|k| !["text", "thought", "thoughtSignature"].contains(&k.as_str()))
                    || pobj.get("text").and_then(Value::as_str).is_none()
                    || pobj
                        .get("thought")
                        .is_some_and(|v| role != "model" || !v.is_boolean())
                    || pobj.get("thoughtSignature").is_some_and(|v| {
                        role != "model" || v.as_str().is_none_or(|s| s.len() > 262_144)
                    })
                {
                    return Err(invalid());
                }
            }
        }
    }

    let mut bound = None;
    let mut has_structured_output = false;
    let mut has_reasoning = false;
    if let Some(config_val) = object.get("generationConfig") {
        let config = config_val.as_object().ok_or_else(invalid)?;
        if config.keys().any(|key| {
            ![
                "maxOutputTokens",
                "candidateCount",
                "temperature",
                "topP",
                "topK",
                "stopSequences",
                "seed",
                "presencePenalty",
                "frequencyPenalty",
                "thinkingConfig",
                "responseMimeType",
                "responseSchema",
                "responseJsonSchema",
            ]
            .contains(&key.as_str())
        }) || config
            .get("candidateCount")
            .is_some_and(|v| v.as_u64() != Some(1))
        {
            return Err(invalid());
        }
        if let Some(max_out) = config.get("maxOutputTokens") {
            let b = max_out
                .as_i64()
                .filter(|v| (1..=1_000_000).contains(v))
                .ok_or_else(invalid)?;
            bound = Some(b);
        }
        for (field, maximum) in [("temperature", 2.0), ("topP", 1.0)] {
            if config.get(field).is_some_and(|v| {
                !v.as_f64()
                    .is_some_and(|n| n.is_finite() && (0.0..=maximum).contains(&n))
            }) {
                return Err(invalid());
            }
        }
        for penalty in ["presencePenalty", "frequencyPenalty"] {
            if config.get(penalty).is_some_and(|v| {
                !v.as_f64()
                    .is_some_and(|n| n.is_finite() && (-2.0..=2.0).contains(&n))
            }) {
                return Err(invalid());
            }
        }
        if config.get("seed").is_some_and(|v| v.as_i64().is_none())
            || config
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
        if let Some(thinking) = config.get("thinkingConfig") {
            let tc = thinking.as_object().ok_or_else(invalid)?;
            if tc.keys().any(|k| {
                !["includeThoughts", "thinkingBudget", "thinkingLevel"].contains(&k.as_str())
            }) {
                return Err(invalid());
            }
            if tc.get("includeThoughts").is_some_and(|v| !v.is_boolean())
                || tc
                    .get("thinkingBudget")
                    .is_some_and(|v| v.as_i64().is_none_or(|b| !(0..=32_768).contains(&b)))
                || tc.get("thinkingLevel").is_some_and(|v| {
                    !matches!(v.as_str(), Some("MINIMAL" | "LOW" | "MEDIUM" | "HIGH"))
                })
            {
                return Err(invalid());
            }
            has_reasoning = true;
        }
        let response_mime = match config.get("responseMimeType") {
            None => None,
            Some(v) => match v.as_str() {
                Some("text/plain") => Some("text/plain"),
                Some("application/json") => {
                    validator.json_mode = true;
                    has_structured_output = true;
                    Some("application/json")
                }
                _ => return Err(invalid()),
            },
        };
        match (
            config.get("responseSchema"),
            config.get("responseJsonSchema"),
        ) {
            (Some(_), Some(_)) => return Err(invalid()),
            (Some(schema), None) => {
                if response_mime != Some("application/json") || !schema.is_object() {
                    return Err(invalid());
                }
                let norm = normalize_gemini_schema(schema);
                let compiled = crate::inference_schema::validator(&norm).map_err(|()| invalid())?;
                validator.json_schema = Some(compiled);
                has_structured_output = true;
            }
            (None, Some(schema)) => {
                if response_mime != Some("application/json") || !schema.is_object() {
                    return Err(invalid());
                }
                let compiled =
                    crate::inference_schema::validator(schema).map_err(|()| invalid())?;
                validator.json_schema = Some(compiled);
                has_structured_output = true;
            }
            (None, None) => {}
        }
    }

    let size_limit = if has_media {
        8 * 1024 * 1024
    } else {
        1_048_576
    };
    if crate::inference_schema::json_serialized_len_within(body, size_limit).is_err() {
        return Err(ApiError::request_too_large());
    }

    Ok(ValidatedGenerateContentRequest {
        bound,
        has_tools,
        has_tool_history,
        has_structured_output,
        has_reasoning,
        has_media,
        has_image,
        validator,
    })
}

fn normalize(
    value: Value,
    public_model: &str,
    validator: &crate::streaming::GenerateContentOutputValidator,
) -> Result<ProviderResponse, ApiError> {
    let invalid = ApiError::upstream_invalid_response;
    let projected = crate::streaming::sanitize_buffered_response(&value, public_model, validator);
    if !projected.valid && projected.usage.is_none() {
        return Err(invalid());
    }
    Ok(ProviderResponse {
        response: if projected.valid {
            buffered_json_response(projected.sanitized)
        } else {
            invalid().into_response()
        },
        completed: true,
        usage: projected.usage,
        token_categories: projected.token_categories,
        provider_model: projected.provider_model,
        finish_reasons: projected.finish_reasons,
    })
}
