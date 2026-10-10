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
use super::priced_chat::validate_priced_request;

struct ChatExecution<'a> {
    public_model: &'a str,
    model: &'a crate::config::ModelConfig,
    api_key: String,
    body: Value,
    messages: Value,
    native_optional_params: Option<serde_json::Map<String, Value>>,
    stream: bool,
    timeout: Duration,
    upstream_client: Option<reqwest::Client>,
    scope: niu_storage::TenantScope,
    attempt: Uuid,
}

struct StreamExecution<'a> {
    public_model: &'a str,
    model: &'a crate::config::ModelConfig,
    api_key: String,
    body: Value,
    timeout: Duration,
    upstream_client: reqwest::Client,
    scope: niu_storage::TenantScope,
    attempt: Uuid,
}

/// ```openapi
/// {
///   "path": "/v1/chat/completions",
///   "method": "post",
///   "operation": {
///     "operationId": "createChatCompletion",
///     "summary": "Create an OpenAI-compatible chat completion",
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
///             "$ref": "#/components/schemas/ChatCompletionRequest"
///           }
///         }
///       }
///     },
///     "responses": {
///       "200": {
///         "description": "A normalized chat completion or compatible event stream.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/ChatCompletionResponse"
///             }
///           },
///           "text/event-stream": {
///             "schema": {
///               "type": "string",
///               "description": "Chat completion SSE chunks. HTTP 200 starts the stream; preserve terminal evidence and optional usage rather than treating a disconnected stream as complete."
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid request, generation-parameter type or range, or unsupported operation; rejected before admission and Supplier dispatch."
///       },
///       "401": {
///         "description": "Missing or invalid gateway credentials."
///       },
///       "409": {
///         "description": "Admission conflict before dispatch. Type route_configuration_changed identifies a changed managed credential/model configuration; that request was not sent upstream. Other conflicts retain their own error type."
///       },
///       "501": {
///         "description": "Tool or structured-output capability is disabled, or the requested combination is unsupported. The unsupported_operation_error message identifies the feature and a supported request alternative; rejection occurs before admission or upstream dispatch."
///       },
///       "502": {
///         "description": "Provider request failed."
///       },
///       "402": {
///         "description": "Insufficient balance or spending limit exceeded."
///       },
///       "403": {
///         "description": "Source IP or enforced policy denies the request. Recorded preparation-policy refusals use error.type guardrail_denied before model dispatch; post-dispatch output withholding uses guardrail_output_withheld and generation charges may apply. Do not classify every 403 as a Guardrail refusal."
///       },
///       "422": {
///         "description": "Configured pricing requires an unavailable token category (unsupported_token_pricing), or a token admission bound is unavailable. Chat reads explicit prompt_tokens_details.cache_write_tokens as a subset of total input, alongside cache reads and reasoning output; missing categories remain unknown. Priced text content blocks accept bounded ephemeral cache_control metadata."
///       },
///       "429": {
///         "description": "API key request, concurrency or token rate limit exceeded."
///       },
///       "503": {
///         "description": "Durable storage or configured route unavailable."
///       },
///       "413": {
///         "description": "Request body exceeds 1 MiB; rejected before inference whether payload capture is enabled or disabled. Framework responses may use a plain-text body."
///       }
///     },
///     "x-niu-status": "Basic chat is implemented for configured native provider routes. Function tools, streaming tool deltas, and structured JSON are opt-in on OpenAI-compatible routes only. Niu validates tool-call shape and structured JSON against a valid self-contained schema; json_object output must be an object. Schema compilation is offline and limited to 64 KiB, 4096 JSON nodes and depth 32, with bounded regular expressions. Niu does not execute tools. Structured JSON streaming validates assembled output before releasing [DONE], with a 1 MiB total content/refusal bound and at most 128 choices. Partial deltas are provisional; invalid final output sends an upstream_invalid_response SSE error without [DONE], while reported terminal usage remains accounting evidence. Token-priced routes support function calls and text-only tool-result conversations under the same input/output rates. Serialized messages, tool definitions, tool choices and response-format instructions count toward the configured input byte guard. Hosted tools and additional billable modalities remain unsupported. Chat pools allow at most one different-credential successor after a canonical OpenRouter immediate HTTP 401 with durable nonexecution and released holds, preserving operation price and funding under one deadline. Other errors and streams already returned to the client are not retried.",
///     "x-niu-implementation": "implemented",
///     "description": "Uses the workspace API key and its model grants, source policy, rate/concurrency/token limits and configured billing. Streaming HTTP 200 starts delivery; completion and reported usage require the terminal stream evidence. Niu does not execute function tools. See the supported scope below for structured output and modality restrictions."
///   },
///   "schemas": {
///     "ChatCompletionRequest": {
///       "type": "object",
///       "required": [
///         "model",
///         "messages"
///       ],
///       "properties": {
///         "model": {
///           "type": "string"
///         },
///         "messages": {
///           "type": "array",
///           "items": {
///             "type": "object"
///           }
///         },
///         "tools": {
///           "type": "array",
///           "minItems": 1,
///           "maxItems": 128,
///           "items": {
///             "type": "object",
///             "required": [
///               "type",
///               "function"
///             ],
///             "properties": {
///               "type": {
///                 "type": "string",
///                 "const": "function"
///               },
///               "function": {
///                 "type": "object",
///                 "required": [
///                   "name"
///                 ],
///                 "properties": {
///                   "name": {
///                     "type": "string",
///                     "minLength": 1,
///                     "maxLength": 64,
///                     "pattern": "^[A-Za-z0-9_-]+$"
///                   },
///                   "description": {
///                     "type": "string"
///                   },
///                   "parameters": {
///                     "type": "object",
///                     "description": "JSON Schema object forwarded to the configured provider.",
///                     "additionalProperties": true
///                   },
///                   "strict": {
///                     "type": "boolean"
///                   }
///                 },
///                 "additionalProperties": true
///               }
///             },
///             "additionalProperties": true
///           }
///         },
///         "tool_choice": {
///           "oneOf": [
///             {
///               "type": "string",
///               "enum": [
///                 "none",
///                 "auto",
///                 "required"
///               ]
///             },
///             {
///               "type": "object",
///               "required": [
///                 "type",
///                 "function"
///               ],
///               "properties": {
///                 "type": {
///                   "type": "string",
///                   "const": "function"
///                 },
///                 "function": {
///                   "type": "object",
///                   "required": [
///                     "name"
///                   ],
///                   "properties": {
///                     "name": {
///                       "type": "string",
///                       "minLength": 1,
///                       "maxLength": 64
///                     }
///                   }
///                 }
///               },
///               "additionalProperties": true
///             }
///           ]
///         },
///         "parallel_tool_calls": {
///           "type": "boolean"
///         },
///         "response_format": {
///           "oneOf": [
///             {
///               "type": "object",
///               "required": [
///                 "type"
///               ],
///               "properties": {
///                 "type": {
///                   "type": "string",
///                   "const": "text"
///                 }
///               },
///               "additionalProperties": true
///             },
///             {
///               "type": "object",
///               "required": [
///                 "type"
///               ],
///               "properties": {
///                 "type": {
///                   "type": "string",
///                   "const": "json_object"
///                 }
///               },
///               "additionalProperties": true
///             },
///             {
///               "type": "object",
///               "required": [
///                 "type",
///                 "json_schema"
///               ],
///               "properties": {
///                 "type": {
///                   "type": "string",
///                   "const": "json_schema"
///                 },
///                 "json_schema": {
///                   "type": "object",
///                   "required": [
///                     "name",
///                     "schema"
///                   ],
///                   "properties": {
///                     "name": {
///                       "type": "string",
///                       "minLength": 1,
///                       "maxLength": 64
///                     },
///                     "description": {
///                       "type": "string"
///                     },
///                     "strict": {
///                       "type": "boolean"
///                     },
///                     "schema": {
///                       "type": "object",
///                       "additionalProperties": true
///                     }
///                   },
///                   "additionalProperties": true
///                 }
///               },
///               "additionalProperties": true
///             }
///           ],
///           "description": "Buffered and streamed structured JSON are supported on explicitly enabled priced text routes. Serialized response-format instructions count toward the route input byte guard alongside messages; this guard is not a provider tokenizer or a guarantee against reported overruns."
///         },
///         "temperature": {
///           "type": [
///             "number",
///             "null"
///           ],
///           "minimum": 0,
///           "maximum": 2
///         },
///         "top_p": {
///           "type": [
///             "number",
///             "null"
///           ],
///           "minimum": 0,
///           "maximum": 1
///         },
///         "frequency_penalty": {
///           "type": [
///             "number",
///             "null"
///           ],
///           "minimum": -2,
///           "maximum": 2
///         },
///         "presence_penalty": {
///           "type": [
///             "number",
///             "null"
///           ],
///           "minimum": -2,
///           "maximum": 2
///         },
///         "max_tokens": {
///           "type": [
///             "integer",
///             "null"
///           ],
///           "minimum": 1,
///           "maximum": 9223372036854775807
///         },
///         "max_completion_tokens": {
///           "type": [
///             "integer",
///             "null"
///           ],
///           "minimum": 1,
///           "maximum": 9223372036854775807
///         },
///         "n": {
///           "type": [
///             "integer",
///             "null"
///           ],
///           "minimum": 1,
///           "maximum": 9223372036854775807
///         },
///         "seed": {
///           "type": [
///             "integer",
///             "null"
///           ],
///           "minimum": -9223372036854775808,
///           "maximum": 9223372036854775807
///         },
///         "stream": {
///           "type": "boolean"
///         },
///         "stream_options": {
///           "type": [
///             "object",
///             "null"
///           ],
///           "properties": {
///             "include_usage": {
///               "type": "boolean"
///             }
///           },
///           "additionalProperties": true
///         }
///       },
///       "additionalProperties": true
///     },
///     "ChatCompletionResponse": {
///       "type": "object",
///       "properties": {
///         "id": {
///           "type": "string"
///         },
///         "object": {
///           "type": "string",
///           "const": "chat.completion"
///         },
///         "model": {
///           "type": "string",
///           "description": "Public model alias."
///         },
///         "created": {
///           "type": "integer"
///         },
///         "choices": {
///           "type": "array",
///           "items": {
///             "type": "object",
///             "properties": {
///               "index": {
///                 "type": "integer",
///                 "minimum": 0
///               },
///               "finish_reason": {
///                 "type": [
///                   "string",
///                   "null"
///                 ]
///               },
///               "message": {
///                 "type": "object",
///                 "properties": {
///                   "role": {
///                     "type": "string"
///                   },
///                   "content": {
///                     "description": "Usually text or null for a function call; extensions remain provider-specific."
///                   },
///                   "refusal": {
///                     "type": [
///                       "string",
///                       "null"
///                     ]
///                   },
///                   "tool_calls": {
///                     "type": [
///                       "array",
///                       "null"
///                     ],
///                     "items": {
///                       "type": "object",
///                       "properties": {
///                         "id": {
///                           "type": "string"
///                         },
///                         "type": {
///                           "type": "string",
///                           "const": "function"
///                         },
///                         "function": {
///                           "type": "object",
///                           "properties": {
///                             "name": {
///                               "type": "string"
///                             },
///                             "arguments": {
///                               "type": "string",
///                               "description": "JSON-encoded function arguments; Niu does not execute the function."
///                             }
///                           },
///                           "required": [
///                             "name",
///                             "arguments"
///                           ]
///                         }
///                       },
///                       "required": [
///                         "id",
///                         "type",
///                         "function"
///                       ]
///                     }
///                   }
///                 }
///               }
///             },
///             "required": [
///               "message"
///             ]
///           }
///         },
///         "usage": {
///           "description": "Optional provider token usage. Its presence alone does not guarantee complete valid accounting evidence. Customer charges must be read from billing APIs, never inferred from missing counters."
///         }
///       },
///       "description": "Nonstreaming completion envelope. Provider extension fields may be present. Missing usage is unknown, not zero.",
///       "required": [
///         "object",
///         "model",
///         "choices"
///       ]
///     }
///   }
/// }
/// ```
pub(in crate::web) async fn chat(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, ApiError> {
    let _in_flight = state.track_inference();
    let principal = state.authorize_api_headers(&headers).await?;
    chat_as(state, headers, body, principal).await
}

/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/chat/completions",
///   "method": "post",
///   "operation": {
///     "operationId": "createDashboardChatCompletion",
///     "summary": "Create a Chat completion with a selected workspace key",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "organization",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "project",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "key",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
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
///         "description": "Optional opaque task correlation key. Requests with the same value can be grouped in project activity. Niu stores the value as metadata and does not forward it to the provider.",
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
///             "$ref": "#/components/schemas/ChatCompletionRequest"
///           }
///         }
///       }
///     },
///     "responses": {
///       "200": {
///         "description": "A normalized chat completion or compatible event stream.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/ChatCompletionResponse"
///             }
///           },
///           "text/event-stream": {
///             "schema": {
///               "type": "string",
///               "description": "Chat completion SSE chunks. HTTP 200 starts the stream; preserve terminal evidence and optional usage rather than treating a disconnected stream as complete."
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid request, generation-parameter type or range, or unsupported operation; rejected before admission and Supplier dispatch."
///       },
///       "401": {
///         "description": "Missing or invalid gateway credentials."
///       },
///       "409": {
///         "description": "Admission conflict before dispatch. Type route_configuration_changed identifies a changed managed credential/model configuration; that request was not sent upstream. Other conflicts retain their own error type."
///       },
///       "501": {
///         "description": "Tool or structured-output capability is disabled, or the requested combination is unsupported. The unsupported_operation_error message identifies the feature and a supported request alternative; rejection occurs before admission or upstream dispatch."
///       },
///       "502": {
///         "description": "Provider request failed."
///       },
///       "402": {
///         "description": "Insufficient spending capacity or budget"
///       },
///       "403": {
///         "description": "Workspace write or source-IP permission denied"
///       },
///       "404": {
///         "description": "Requested model unavailable to the selected key"
///       },
///       "429": {
///         "description": "Rate or concurrency admission limit exceeded"
///       },
///       "503": {
///         "description": "Route or durable storage unavailable"
///       },
///       "413": {
///         "description": "Request body exceeds 1 MiB; rejected before inference whether payload capture is enabled or disabled. Framework responses may use a plain-text body."
///       }
///     },
///     "x-niu-status": "Basic chat is implemented for configured native provider routes. Function tools, streaming tool deltas, and structured JSON are opt-in on OpenAI-compatible routes only. Niu validates tool-call shape and structured JSON against a valid self-contained schema; json_object output must be an object. Schema compilation is offline and limited to 64 KiB, 4096 JSON nodes and depth 32, with bounded regular expressions. Niu does not execute tools. Structured JSON streaming validates assembled output before releasing [DONE], with a 1 MiB total content/refusal bound and at most 128 choices. Partial deltas are provisional; invalid final output sends an upstream_invalid_response SSE error without [DONE], while reported terminal usage remains accounting evidence. Token-priced routes support function calls and text-only tool-result conversations under the same input/output rates. Serialized messages, tool definitions, tool choices and response-format instructions count toward the configured input byte guard. Hosted tools and additional billable modalities remain unsupported. Chat pools allow at most one different-credential successor after a canonical OpenRouter immediate HTTP 401 with durable nonexecution and released holds, preserving operation price and funding under one deadline. Other errors and streams already returned to the client are not retried.",
///     "description": "Requires workspace write authority and an active selected key in that workspace. The key supplies model grants, IP policy, limits and billing attribution; the member token is not forwarded upstream. Uses the same Chat execution path as /v1/chat/completions, including streaming, tools and structured output. No key secret is returned. HTTP 200 starts a stream and does not alone prove completed generation or known usage.",
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub(in crate::web) async fn dashboard_chat(
    State(state): State<AppState>,
    axum::extract::Path((organization_id, project_id, key_id)): axum::extract::Path<(
        Uuid,
        Uuid,
        Uuid,
    )>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, ApiError> {
    let _in_flight = state.track_inference();
    let scope = niu_storage::TenantScope {
        organization_id,
        project_id,
    };
    let principal = state
        .authorize_dashboard_key(&headers, scope, key_id, niu_storage::AdminPermission::Write)
        .await?;
    chat_as(state, headers, body, principal).await
}

async fn chat_as(
    state: AppState,
    headers: HeaderMap,
    body: Value,
    principal: niu_storage::Principal,
) -> Result<Response, ApiError> {
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
            super::codex::Protocol::Chat,
        )
        .await;
    }
    validate_generation_parameters(&body)?;
    let messages_shape = body
        .get("messages")
        .and_then(Value::as_array)
        .ok_or_else(|| ApiError::invalid_request("messages must be an array"))?;
    if messages_shape.is_empty() {
        return Err(ApiError::invalid_request(
            "messages must contain at least one message",
        ));
    }
    let stream = match body.get("stream") {
        None => false,
        Some(Value::Bool(value)) => *value,
        _ => return Err(ApiError::invalid_request("stream must be a boolean")),
    };
    let requirements = chat_route_requirements(&body, stream)?;
    let deadline = std::time::Instant::now()
        + Duration::from_secs(state.config.server.request_timeout_seconds);
    state.requests.fetch_add(1, Ordering::Relaxed);
    let mut excluded = Vec::new();
    let mut continuation = None;
    let mut previous_response = None;
    loop {
        let resolved = match crate::vendors::resolve_scoped_model_excluding(
            &state,
            principal.scope().organization_id,
            &public_model,
            crate::guardrails::input::Protocol::Chat,
            Some(&requirements),
            &excluded,
        )
        .await
        {
            Ok(resolved) => resolved,
            Err(error) => return previous_response.map_or_else(|| Err(error), Ok),
        };
        let qualified = resolved.model.provider == "openrouter"
            && resolved
                .model
                .endpoint_base()
                .is_some_and(|base| base.trim_end_matches('/') == "https://openrouter.ai/api/v1")
            && resolved
                .managed_route
                .as_ref()
                .is_some_and(|route| route.pool_alias.is_some());
        let vendor = resolved.managed_route.as_ref().map(|route| route.vendor_id);
        let timeout = deadline.saturating_duration_since(std::time::Instant::now());
        if timeout.is_zero() {
            return previous_response.map_or_else(|| Err(ApiError::upstream()), Ok);
        }
        let retry = continuation.or_else(|| {
            qualified.then(|| {
                (
                    Uuid::new_v4(),
                    niu_storage::GatewayRetryAdmission::First {
                        remaining_ms: timeout.as_millis().min(86_400_000) as i64,
                    },
                )
            })
        });
        let (dispatch, result) = match execute_chat_attempt(
            &state,
            &principal,
            ChatAttempt {
                public_model: &public_model,
                headers: &headers,
                body: body.clone(),
                stream,
                timeout,
                deadline,
                retry,
                resolved,
            },
        )
        .await
        {
            Ok(outcome) => outcome,
            Err(error) => {
                if let Some(previous) = previous_response {
                    let mut response = error.into_response();
                    for name in ["x-niu-operation-id", "x-niu-attempt-id"] {
                        if let Some(value) = previous.headers().get(name) {
                            response.headers_mut().insert(name, value.clone());
                        }
                    }
                    return Ok(response);
                }
                return Err(error);
            }
        };
        let operation = dispatch.operation;
        let attempt = dispatch.attempt;
        let response = finalize_response(&state, dispatch, result).await;
        // Only an immediate qualified rejection is eligible. A returned stream
        // (including any later SSE/transport failure) never reaches this branch.
        let rejected = response
            .extensions()
            .get::<niu_storage::RequestFailure>()
            .is_some_and(|failure| {
                failure.kind == niu_storage::RequestFailureKind::UpstreamHttpError
                    && failure.upstream_http_status == Some(401)
            });
        if !qualified || continuation.is_some() || !rejected {
            return Ok(response);
        }
        excluded.push(vendor.ok_or_else(ApiError::unavailable)?);
        continuation = Some((
            operation,
            niu_storage::GatewayRetryAdmission::Successor {
                predecessor_id: attempt,
            },
        ));
        previous_response = Some(response);
    }
}

struct ChatAttempt<'a> {
    public_model: &'a str,
    headers: &'a HeaderMap,
    body: Value,
    stream: bool,
    timeout: Duration,
    deadline: std::time::Instant,
    retry: Option<(Uuid, niu_storage::GatewayRetryAdmission)>,
    resolved: crate::vendors::ResolvedModel,
}

async fn execute_chat_attempt(
    state: &AppState,
    principal: &niu_storage::Principal,
    request: ChatAttempt<'_>,
) -> Result<(DispatchContext, Result<ProviderResponse, ApiError>), ApiError> {
    let ChatAttempt {
        public_model,
        headers,
        mut body,
        stream,
        timeout,
        deadline,
        retry,
        resolved,
    } = request;
    let model = &resolved.model;

    let inspected_snapshot = inspect_request_input(
        state,
        principal,
        public_model,
        model,
        crate::guardrails::input::Protocol::Chat,
        &mut body,
    )
    .await?;
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
    let protocol = model.protocol();
    if stream && !protocol.supports_streaming() {
        return Err(ApiError::unsupported());
    }
    if !protocol.supports_chat_completions() {
        return Err(ApiError::invalid_request(
            "Provider is not supported by this gateway",
        ));
    }
    validate_chat_capabilities(&body, model, stream)?;
    if let Some(price) = &model.pricing {
        validate_priced_request(&mut body, price)?;
    }
    let native_optional_params = if protocol.is_openai_compatible() {
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
    let api_key = resolved.api_key;
    let task_id = request_task_id(headers)?;
    let upstream_client = if protocol.is_openai_compatible() {
        let base = model.endpoint_base().ok_or_else(ApiError::unavailable)?;
        let endpoint = format!("{}/chat/completions", base.trim_end_matches('/'));
        Some(
            crate::upstream::client_for_endpoint(&endpoint, timeout)
                .await
                .map_err(ApiError::from_endpoint)?,
        )
    } else {
        None
    };
    let dispatch = begin_retry_attempt(
        state,
        principal,
        AttemptRequest {
            managed_route: resolved.managed_route.as_ref(),
            personal_route: resolved.personal_route.as_ref(),
            public_model,
            model,
            // Priced validation has already checked or inserted this limit.
            // Reserve the forwarded bound, not the route's larger default.
            completion_bound: body
                .get("max_completion_tokens")
                .or_else(|| body.get("max_tokens"))
                .and_then(Value::as_i64),
            task_id: task_id.as_deref(),
            snapshot: inspected_snapshot,
            request_body: &body,
            protocol: crate::guardrails::input::Protocol::Chat,
        },
        retry,
    )
    .await?;
    let timeout = deadline.saturating_duration_since(std::time::Instant::now());
    if timeout.is_zero() {
        return Ok((dispatch, Err(ApiError::upstream())));
    }
    let result = execute_chat(
        state,
        ChatExecution {
            public_model,
            model,
            api_key,
            body,
            messages,
            native_optional_params,
            stream,
            timeout,
            upstream_client,
            scope: dispatch.scope,
            attempt: dispatch.attempt,
        },
    )
    .await;
    Ok((dispatch, result))
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
        upstream_client,
        scope,
        attempt,
    } = execution;
    if stream {
        return stream_openai_compatible(
            state,
            StreamExecution {
                public_model,
                model,
                api_key,
                body,
                timeout,
                upstream_client: upstream_client.ok_or_else(ApiError::unavailable)?,
                scope,
                attempt,
            },
        )
        .await;
    }

    if model.protocol().is_openai_compatible() {
        return complete_openai_compatible(
            state,
            public_model,
            model,
            api_key,
            body,
            timeout,
            upstream_client.ok_or_else(ApiError::unavailable)?,
        )
        .await;
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
        api_base: model.endpoint_base(),
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
    let provider_model = provider_reported_model(&value);
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
    crate::customer_response::sanitize(&mut value);
    Ok(ProviderResponse {
        finish_reasons: niu_storage::RequestChoiceFinish::from_chat_response(&value),
        token_categories: usage.and_then(|totals| {
            niu_storage::RequestTokenCategories::from_openai_usage(&value["usage"], totals)
        }),
        response: Json(value).into_response(),
        completed: true,
        usage,
        provider_model,
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

async fn complete_openai_compatible(
    state: &AppState,
    public_model: &str,
    model: &crate::config::ModelConfig,
    api_key: String,
    mut body: Value,
    timeout: Duration,
    client: reqwest::Client,
) -> Result<ProviderResponse, ApiError> {
    let base = model.endpoint_base().ok_or_else(ApiError::unavailable)?;
    let endpoint = format!("{}/chat/completions", base.trim_end_matches('/'));
    let Some(object) = body.as_object_mut() else {
        return Err(ApiError::invalid_request(
            "The request body must be a JSON object",
        ));
    };
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
            tracing::warn!(
                model = public_model,
                timeout = error.is_timeout(),
                connect = error.is_connect(),
                "OpenAI-compatible provider request failed"
            );
            state.failures.fetch_add(1, Ordering::Relaxed);
            ApiError::upstream_transport(&error)
        })?;
    if !upstream.status().is_success() {
        tracing::warn!(
            model = public_model,
            status = %upstream.status(),
            "OpenAI-compatible provider returned a non-success response"
        );
        state.failures.fetch_add(1, Ordering::Relaxed);
        return Err(provider_rejection(upstream).await);
    }
    let mut value: Value = provider_json(upstream).await.map_err(|_| {
        state.failures.fetch_add(1, Ordering::Relaxed);
        ApiError::upstream_invalid_response()
    })?;
    if !value.get("choices").is_some_and(Value::is_array)
        || !valid_chat_completion_features(&value, &body)
    {
        state.failures.fetch_add(1, Ordering::Relaxed);
        // Delivery validation and upstream execution are separate facts. A
        // terminal completion with valid usage remains accounting evidence
        // even when its content cannot satisfy the client's output contract.
        if terminal_chat_envelope(&value)
            && let Some(usage) = reported_chat_usage(&value)
        {
            usage_attempt.report(&value["usage"]);
            return Ok(ProviderResponse {
                finish_reasons: niu_storage::RequestChoiceFinish::from_chat_response(&value),
                token_categories: niu_storage::RequestTokenCategories::from_openai_usage(
                    &value["usage"],
                    usage,
                ),
                response: ApiError::upstream_invalid_response().into_response(),
                completed: true,
                usage: Some(usage),
                provider_model: provider_reported_model(&value),
            });
        }
        return Err(ApiError::upstream_invalid_response());
    }
    let provider_model = provider_reported_model(&value);
    if let Some(object) = value.as_object_mut() {
        object
            .entry("id")
            .or_insert_with(|| json!(format!("chatcmpl-{}", Uuid::new_v4())));
        object.insert("object".to_owned(), json!("chat.completion"));
        object.insert("model".to_owned(), json!(public_model));
    }
    let usage = reported_chat_usage(&value);
    if usage.is_some() {
        usage_attempt.report(&value["usage"]);
    }
    crate::customer_response::sanitize(&mut value);
    Ok(ProviderResponse {
        finish_reasons: niu_storage::RequestChoiceFinish::from_chat_response(&value),
        token_categories: usage.and_then(|totals| {
            niu_storage::RequestTokenCategories::from_openai_usage(&value["usage"], totals)
        }),
        response: Json(value).into_response(),
        completed: true,
        usage,
        provider_model,
    })
}

fn reported_chat_usage(value: &Value) -> Option<(u64, u64)> {
    let prompt = value.pointer("/usage/prompt_tokens")?.as_u64()?;
    let completion = value.pointer("/usage/completion_tokens")?.as_u64()?;
    let total = prompt.checked_add(completion)?;
    if prompt > i64::MAX as u64 || completion > i64::MAX as u64 {
        return None;
    }
    if value
        .pointer("/usage/total_tokens")
        .is_some_and(|reported| reported.as_u64() != Some(total))
    {
        return None;
    }
    Some((prompt, completion))
}

fn validate_generation_parameters(body: &Value) -> Result<(), ApiError> {
    if body.get("max_tokens").is_some_and(|value| !value.is_null())
        && body
            .get("max_completion_tokens")
            .is_some_and(|value| !value.is_null())
    {
        return Err(ApiError::invalid_request(
            "Specify only one output token limit",
        ));
    }
    if body.get("stream").is_some_and(|value| !value.is_boolean()) {
        return Err(ApiError::invalid_request("stream must be a boolean"));
    }
    if let Some(options) = body.get("stream_options").filter(|value| !value.is_null()) {
        let options = options
            .as_object()
            .ok_or_else(|| ApiError::invalid_request("stream_options must be an object"))?;
        if options
            .get("include_usage")
            .is_some_and(|value| !value.is_boolean())
        {
            return Err(ApiError::invalid_request(
                "stream_options.include_usage must be a boolean",
            ));
        }
    }
    for (field, minimum, maximum, message) in [
        (
            "temperature",
            0.0,
            2.0,
            "temperature must be a number between 0 and 2",
        ),
        ("top_p", 0.0, 1.0, "top_p must be a number between 0 and 1"),
        (
            "frequency_penalty",
            -2.0,
            2.0,
            "frequency_penalty must be a number between -2 and 2",
        ),
        (
            "presence_penalty",
            -2.0,
            2.0,
            "presence_penalty must be a number between -2 and 2",
        ),
    ] {
        if let Some(value) = body.get(field).filter(|value| !value.is_null())
            && value
                .as_f64()
                .is_none_or(|value| !value.is_finite() || !(minimum..=maximum).contains(&value))
        {
            return Err(ApiError::invalid_request(message));
        }
    }
    for (field, message) in [
        ("max_tokens", "max_tokens must be a positive integer"),
        (
            "max_completion_tokens",
            "max_completion_tokens must be a positive integer",
        ),
        ("n", "n must be a positive integer"),
    ] {
        if let Some(value) = body.get(field).filter(|value| !value.is_null())
            && value.as_i64().is_none_or(|value| value <= 0)
        {
            return Err(ApiError::invalid_request(message));
        }
    }
    if let Some(value) = body.get("seed").filter(|value| !value.is_null())
        && value.as_i64().is_none()
    {
        return Err(ApiError::invalid_request("seed must be an integer"));
    }
    Ok(())
}

fn terminal_chat_envelope(value: &Value) -> bool {
    value.get("error").is_none()
        && value
            .get("choices")
            .and_then(Value::as_array)
            .is_some_and(|choices| {
                !choices.is_empty()
                    && choices.iter().all(|choice| {
                        choice.get("message").is_some_and(Value::is_object)
                            && matches!(
                                choice.get("finish_reason").and_then(Value::as_str),
                                Some("stop" | "length" | "tool_calls" | "content_filter")
                            )
                    })
            })
}

async fn stream_openai_compatible(
    state: &AppState,
    execution: StreamExecution<'_>,
) -> Result<ProviderResponse, ApiError> {
    let StreamExecution {
        public_model,
        model,
        api_key,
        mut body,
        timeout,
        upstream_client,
        scope,
        attempt,
    } = execution;
    let base = model.endpoint_base().ok_or_else(ApiError::unavailable)?;
    let endpoint = format!("{}/chat/completions", base.trim_end_matches('/'));
    if let Some(object) = body.as_object_mut() {
        object.insert("model".to_owned(), json!(model.upstream_model));
        strip_server_control_fields(object);
    }
    let usage_attempt = state.usage.begin();
    let structured = match body
        .pointer("/response_format/type")
        .and_then(Value::as_str)
    {
        Some("json_object") => Some(crate::structured_stream::StructuredStream::new(None)),
        Some("json_schema") => Some(crate::structured_stream::StructuredStream::new(Some(
            structured_schema_validator(&body["response_format"]["json_schema"]["schema"])
                .map_err(|_| ApiError::invalid_request("Invalid structured output schema"))?,
        ))),
        _ => None,
    };
    let upstream = upstream_client
        .post(endpoint)
        .bearer_auth(api_key)
        .header(header::ACCEPT, "text/event-stream")
        .timeout(timeout)
        .json(&body)
        .send()
        .await
        .map_err(|error| {
            tracing::warn!(
                model = public_model,
                timeout = error.is_timeout(),
                connect = error.is_connect(),
                "OpenAI-compatible provider stream connection failed"
            );
            state.failures.fetch_add(1, Ordering::Relaxed);
            ApiError::upstream_transport(&error)
        })?;
    let status =
        StatusCode::from_u16(upstream.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    if !status.is_success() {
        state.failures.fetch_add(1, Ordering::Relaxed);
        return Err(provider_rejection(upstream).await);
    }
    let content_type = upstream
        .headers()
        .get(header::CONTENT_TYPE)
        .cloned()
        .ok_or_else(|| {
            state.failures.fetch_add(1, Ordering::Relaxed);
            ApiError::upstream_invalid_response()
        })?;
    if content_type
        .to_str()
        .ok()
        .and_then(|v| v.split(';').next())
        .is_none_or(|v| !v.trim().eq_ignore_ascii_case("text/event-stream"))
    {
        state.failures.fetch_add(1, Ordering::Relaxed);
        return Err(ApiError::upstream_invalid_response());
    }
    let mut response = Response::new(crate::streaming::tracked_body(
        upstream.bytes_stream(),
        crate::streaming::StreamAttempt {
            store: state.store.clone(),
            gateway_writes: state.gateway_writes.clone(),
            diagnostic_writes: state.diagnostic_writes.clone(),
            scope,
            id: attempt,
            priced: model.pricing.is_some(),
            usage: usage_attempt,
            failures: state.failures.clone(),
        },
        structured,
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
        finish_reasons: None,
        token_categories: None,
        response,
        completed: false,
        usage: None,
        provider_model: None,
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
    let requirements = chat_route_requirements(body, stream)?;
    let has_tool_semantics = requirements.tools;
    if has_tool_semantics {
        if !model.supports_tool_calls {
            return Err(ApiError::unsupported_message(
                "Function tools are not enabled for this model. Choose a model with tool support or remove tool declarations and tool messages.",
            ));
        }
        if stream && !model.supports_streaming_tool_calls {
            return Err(ApiError::unsupported_message(
                "Streaming function tools are not enabled for this model. Use nonstreaming tool calls or choose a model with streaming tool support.",
            ));
        }
    }

    if requirements.structured_output && !model.supports_structured_output {
        return Err(ApiError::unsupported_message(
            "Structured JSON output is not enabled for this model. Choose a model with structured output support or use text output.",
        ));
    }
    Ok(())
}

fn chat_route_requirements(
    body: &Value,
    stream: bool,
) -> Result<crate::config::ModelRequirements, ApiError> {
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
    if let Some(format) = object.get("response_format") {
        let format = format
            .as_object()
            .ok_or_else(|| ApiError::invalid_request("response_format must be an object"))?;
        match format.get("type").and_then(Value::as_str) {
            Some("text") => {}
            Some("json_object") => {}
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
                structured_schema_validator(&schema["schema"]).map_err(|_| {
                    ApiError::invalid_request(
                        "JSON Schema must be valid, self-contained, at most 64 KiB, and within the supported complexity limits. External references cannot be retrieved.",
                    )
                })?;
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
        return Err(ApiError::unsupported_message(
            "Combining function tools and structured JSON output is not supported. Send separate requests.",
        ));
    }

    Ok(crate::config::ModelRequirements {
        streaming: stream,
        tools: has_tool_semantics,
        streaming_tools: stream && has_tool_semantics,
        structured_output: matches!(
            body.pointer("/response_format/type")
                .and_then(Value::as_str),
            Some("json_object" | "json_schema")
        ),
        ..Default::default()
    })
}

fn structured_schema_validator(schema: &Value) -> Result<jsonschema::Validator, ()> {
    // Bound compilation independently of the overall request size. Offline mode
    // also prevents caller-controlled references from reading files or making requests.
    if serde_json::to_vec(schema).map_err(|_| ())?.len() > 65_536 {
        return Err(());
    }
    let mut pending = vec![(schema, 0usize)];
    let mut nodes = 0usize;
    while let Some((value, depth)) = pending.pop() {
        nodes += 1;
        if nodes > 4096 || depth > 32 {
            return Err(());
        }
        match value {
            Value::Object(object) => pending.extend(object.values().map(|v| (v, depth + 1))),
            Value::Array(array) => pending.extend(array.iter().map(|v| (v, depth + 1))),
            _ => {}
        }
    }
    jsonschema::options()
        .offline()
        .with_pattern_options(
            jsonschema::PatternOptions::fancy_regex()
                .backtrack_limit(10_000)
                .size_limit(1_048_576)
                .dfa_size_limit(1_048_576),
        )
        .build(schema)
        .map_err(|_| ())
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
    let schema_validator = if request
        .pointer("/response_format/type")
        .and_then(Value::as_str)
        == Some("json_schema")
    {
        let Some(schema) = request.pointer("/response_format/json_schema/schema") else {
            return false;
        };
        let Ok(validator) = structured_schema_validator(schema) else {
            return false;
        };
        Some(validator)
    } else {
        None
    };

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
        if json_mode
            && message
                .get("refusal")
                .and_then(Value::as_str)
                .is_none_or(str::is_empty)
        {
            let Some(content) = message.get("content").and_then(Value::as_str) else {
                return false;
            };
            let Ok(value) = serde_json::from_str::<Value>(content) else {
                return false;
            };
            if schema_validator
                .as_ref()
                .is_some_and(|schema| !schema.is_valid(&value))
                || (schema_validator.is_none() && !value.is_object())
            {
                return false;
            }
        }
        true
    })
}

#[cfg(test)]
mod native_effort_tests {
    use super::*;

    #[test]
    fn generation_parameters_reject_invalid_values_without_changing_defaults() {
        for invalid in [
            json!({"temperature":-1}),
            json!({"temperature":2.1}),
            json!({"temperature":"1"}),
            json!({"top_p":1.01}),
            json!({"top_p":false}),
            json!({"frequency_penalty":-2.01}),
            json!({"presence_penalty":2.01}),
            json!({"max_tokens":0}),
            json!({"max_completion_tokens":-1}),
            json!({"max_tokens":1.5}),
            json!({"n":0}),
            json!({"seed":0.5}),
            json!({"max_tokens":u64::MAX}),
            json!({"max_tokens":1,"max_completion_tokens":2}),
            json!({"stream":"true"}),
            json!({"stream_options":true}),
            json!({"stream_options":{"include_usage":"true"}}),
        ] {
            assert!(validate_generation_parameters(&invalid).is_err());
        }
        for valid in [
            json!({}),
            json!({"temperature":0,"top_p":0,"frequency_penalty":-2}),
            json!({"temperature":2,"top_p":1,"presence_penalty":2}),
            json!({"max_tokens":1,"n":1,"seed":-1}),
            json!({"temperature":null,"max_tokens":null}),
            json!({"max_tokens":null,"max_completion_tokens":1}),
            json!({"stream":true,"stream_options":{"include_usage":true}}),
            json!({"stream_options":null}),
        ] {
            let original = valid.clone();
            assert!(validate_generation_parameters(&valid).is_ok());
            assert_eq!(valid, original);
        }
    }

    #[test]
    fn rejected_completion_usage_requires_complete_consistent_terminal_evidence() {
        let mut response = json!({"choices":[{"message":{"content":"invalid JSON"},"finish_reason":"stop"}],
            "usage":{"prompt_tokens":11,"completion_tokens":3,"total_tokens":14}});
        assert!(terminal_chat_envelope(&response));
        assert_eq!(reported_chat_usage(&response), Some((11, 3)));
        for invalid in [
            json!({"prompt_tokens":11}),
            json!({"prompt_tokens":-1,"completion_tokens":3}),
            json!({"prompt_tokens":11,"completion_tokens":1.5}),
            json!({"prompt_tokens":11,"completion_tokens":3,"total_tokens":99}),
            json!({"prompt_tokens":u64::MAX,"completion_tokens":1}),
        ] {
            response["usage"] = invalid;
            assert!(reported_chat_usage(&response).is_none());
        }
        response["choices"][0]["finish_reason"] = Value::Null;
        assert!(!terminal_chat_envelope(&response));
        response["choices"] = json!([]);
        assert!(!terminal_chat_envelope(&response));
        response["choices"] = json!([{"message":{},"finish_reason":"stop"}]);
        response["error"] = json!({"message":"upstream failure"});
        assert!(!terminal_chat_envelope(&response));
    }

    #[test]
    fn structured_output_enforces_schema_and_object_semantics() {
        let request = json!({"response_format":{"type":"json_schema","json_schema":{
            "name":"status","strict":true,"schema":{
                "$defs":{"status":{"type":"string","enum":["ok"]}},
                "type":"object","properties":{"status":{"$ref":"#/$defs/status"}},
                "required":["status"],"additionalProperties":false
            }
        }}});
        let response = |content: &str| json!({"choices":[{"message":{"content":content}}]});
        assert!(valid_chat_completion_features(
            &response(r#"{"status":"ok"}"#),
            &request
        ));
        for invalid in [
            r#"{}"#,
            r#"{"status":"bad"}"#,
            r#"{"status":1}"#,
            r#"{"status":"ok","extra":true}"#,
            "null",
            "[]",
            "not JSON",
        ] {
            assert!(!valid_chat_completion_features(
                &response(invalid),
                &request
            ));
        }
        let object_request = json!({"response_format":{"type":"json_object"}});
        assert!(valid_chat_completion_features(
            &response("{}"),
            &object_request
        ));
        for invalid in ["[]", "null", "42", "true", r#""text""#] {
            assert!(!valid_chat_completion_features(
                &response(invalid),
                &object_request
            ));
        }
        let mut refusal = response("not JSON");
        refusal["choices"][0]["message"]["refusal"] = json!("Unable to comply");
        assert!(valid_chat_completion_features(&refusal, &request));
        refusal["choices"][0]["message"]["refusal"] = json!("");
        assert!(!valid_chat_completion_features(&refusal, &request));
    }

    #[test]
    fn schema_compilation_is_offline_and_bounded() {
        for schema in [
            json!({"type":"not-a-type"}),
            json!({"$ref":"http://127.0.0.1:9/private"}),
            json!({"$ref":"file:///private/schema.json"}),
            json!({"$ref":"missing.json"}),
            json!({"description":"x".repeat(65_536)}),
            json!({"enum":vec!["x"; 4096]}),
        ] {
            assert!(structured_schema_validator(&schema).is_err());
        }
        let mut deep = json!({"type":"string"});
        for _ in 0..33 {
            deep = json!({"properties":{"nested":deep}});
        }
        assert!(structured_schema_validator(&deep).is_err());
        let pattern =
            structured_schema_validator(&json!({"type":"string","pattern":"^ok$"})).unwrap();
        assert!(pattern.is_valid(&json!("ok")));
        assert!(!pattern.is_valid(&json!("wrong")));
    }

    #[test]
    fn native_routes_reject_effort_parameters_instead_of_dropping_them() {
        for provider in ["anthropic", "bedrock"] {
            for parameter in [
                json!({"reasoning_effort":"low"}),
                json!({"reasoning":{"effort":"high"}}),
                json!({"thinking":{"type":"enabled","budget_tokens":1024}}),
            ] {
                let mut body = json!({"model":"explicit-model","messages":[{
                    "role":"user","content":"test"}],"max_tokens":32});
                body.as_object_mut()
                    .unwrap()
                    .extend(parameter.as_object().unwrap().clone());
                assert!(
                    map_native_chat_params(&body, provider).is_err(),
                    "unsupported effort must not be silently removed for {provider}"
                );
            }
            assert!(
                map_native_chat_params(
                    &json!({"model":"explicit-model",
                "messages":[{"role":"user","content":"test"}],"max_tokens":32}),
                    provider
                )
                .is_ok()
            );
        }
    }
}
