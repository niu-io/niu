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

struct ResponsesExecution<'a> {
    public_model: &'a str,
    model: &'a crate::config::ModelConfig,
    api_key: String,
    body: Value,
    timeout: Duration,
    client: reqwest::Client,
    dispatch: &'a DispatchContext,
    managed: bool,
    output_validator: crate::native_responses::ResponsesOutputValidator,
}

#[derive(Clone)]
pub(in crate::web) struct ResponsesRequestBounds {
    pub(in crate::web) input_bytes: usize,
    pub(in crate::web) max_output_tokens: Option<i64>,
    has_vision: bool,
    has_tools: bool,
    has_tool_history: bool,
    has_structured_output: bool,
    has_reasoning: bool,
    output_validator: crate::native_responses::ResponsesOutputValidator,
}

/// ```openapi
/// {
///   "path": "/v1/responses",
///   "method": "post",
///   "operation": {
///     "operationId": "createResponse",
///     "summary": "Create a native OpenAI Response",
///     "description": "Requires an OpenAI-compatible route with supports_responses enabled. Supports single-turn string input and stateless multi-turn input arrays containing user/system/developer/assistant messages, function_call and matched function_call_output history items, reasoning items, and unpriced input_image parts (max 8 MiB request body; priced routes reject vision inputs and remain bounded to 1 MiB text/tool requests). Client function tools require supports_tool_calls (plus supports_streaming_tool_calls when streaming); structured output (text.format json_object or json_schema) requires supports_structured_output; reasoning effort/summary checks catalog capability when declared. Niu validates declared schemas offline and never executes tools or stores prior responses on the server: store must be absent or false, and previous_response_id, conversation, background, and hosted server tools are rejected explicitly. Streaming emits Responses SSE events and validates terminal output before settlement; disconnects retain holds and uncertainty.",
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
///                     "maxItems": 256,
///                     "items": {
///                       "type": "object"
///                     }
///                   }
///                 ]
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
///               "tools": {
///                 "type": "array",
///                 "minItems": 1,
///                 "maxItems": 128,
///                 "items": {
///                   "type": "object",
///                   "required": [
///                     "type",
///                     "name"
///                   ],
///                   "properties": {
///                     "type": {
///                       "type": "string",
///                       "const": "function"
///                     },
///                     "name": {
///                       "type": "string",
///                       "minLength": 1,
///                       "maxLength": 64
///                     },
///                     "description": {
///                       "type": "string",
///                       "maxLength": 4096
///                     },
///                     "parameters": {
///                       "type": "object"
///                     },
///                     "strict": {
///                       "type": "boolean"
///                     }
///                   }
///                 }
///               },
///               "tool_choice": {
///                 "oneOf": [
///                   {
///                     "type": "string",
///                     "enum": [
///                       "none",
///                       "auto",
///                       "required"
///                     ]
///                   },
///                   {
///                     "type": "object",
///                     "required": [
///                       "type",
///                       "name"
///                     ],
///                     "properties": {
///                       "type": {
///                         "type": "string",
///                         "const": "function"
///                       },
///                       "name": {
///                         "type": "string"
///                       }
///                     }
///                   }
///                 ]
///               },
///               "parallel_tool_calls": {
///                 "type": "boolean"
///               },
///               "text": {
///                 "type": "object",
///                 "properties": {
///                   "verbosity": {
///                     "type": "string",
///                     "enum": [
///                       "low",
///                       "medium",
///                       "high"
///                     ]
///                   },
///                   "format": {
///                     "type": "object"
///                   }
///                 }
///               },
///               "reasoning": {
///                 "type": "object",
///                 "properties": {
///                   "effort": {
///                     "type": "string",
///                     "enum": [
///                       "minimal",
///                       "low",
///                       "medium",
///                       "high"
///                     ]
///                   },
///                   "summary": {
///                     "type": "string",
///                     "enum": [
///                       "auto",
///                       "concise",
///                       "detailed"
///                     ]
///                   }
///                 }
///               },
///               "truncation": {
///                 "type": "string",
///                 "enum": [
///                   "disabled",
///                   "auto"
///                 ]
///               },
///               "store": {
///                 "type": "boolean",
///                 "enum": [
///                   false
///                 ]
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
///                       },
///                       {
///                         "type": "object",
///                         "required": [
///                           "type",
///                           "call_id",
///                           "name",
///                           "arguments"
///                         ],
///                         "properties": {
///                           "id": {
///                             "type": "string"
///                           },
///                           "type": {
///                             "type": "string",
///                             "const": "function_call"
///                           },
///                           "call_id": {
///                             "type": "string"
///                           },
///                           "name": {
///                             "type": "string"
///                           },
///                           "arguments": {
///                             "type": "string"
///                           },
///                           "status": {
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
///         },
///         "headers": {
///           "x-niu-attempt-id": {
///             "description": "Niu attempt UUID, available once an attempt has been dispatched. Use this reference with GET /v1/generations/{id}; it is distinct from an upstream response ID. May be absent on early rejection.",
///             "schema": {
///               "type": "string",
///               "format": "uuid"
///             }
///           },
///           "x-niu-operation-id": {
///             "description": "Niu operation UUID grouping the request execution. Distinct from the attempt UUID; may be absent before dispatch.",
///             "schema": {
///               "type": "string",
///               "format": "uuid"
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid body, unsupported field or invalid request shape.",
///         "headers": {
///           "x-niu-attempt-id": {
///             "description": "Niu attempt UUID, available once an attempt has been dispatched. Use this reference with GET /v1/generations/{id}; it is distinct from an upstream response ID. May be absent on early rejection.",
///             "schema": {
///               "type": "string",
///               "format": "uuid"
///             }
///           },
///           "x-niu-operation-id": {
///             "description": "Niu operation UUID grouping the request execution. Distinct from the attempt UUID; may be absent before dispatch.",
///             "schema": {
///               "type": "string",
///               "format": "uuid"
///             }
///           }
///         }
///       },
///       "401": {
///         "description": "Missing or invalid gateway credentials.",
///         "headers": {
///           "x-niu-attempt-id": {
///             "description": "Niu attempt UUID, available once an attempt has been dispatched. Use this reference with GET /v1/generations/{id}; it is distinct from an upstream response ID. May be absent on early rejection.",
///             "schema": {
///               "type": "string",
///               "format": "uuid"
///             }
///           },
///           "x-niu-operation-id": {
///             "description": "Niu operation UUID grouping the request execution. Distinct from the attempt UUID; may be absent before dispatch.",
///             "schema": {
///               "type": "string",
///               "format": "uuid"
///             }
///           }
///         }
///       },
///       "404": {
///         "description": "Model alias does not exist or is unavailable to this key.",
///         "headers": {
///           "x-niu-attempt-id": {
///             "description": "Niu attempt UUID, available once an attempt has been dispatched. Use this reference with GET /v1/generations/{id}; it is distinct from an upstream response ID. May be absent on early rejection.",
///             "schema": {
///               "type": "string",
///               "format": "uuid"
///             }
///           },
///           "x-niu-operation-id": {
///             "description": "Niu operation UUID grouping the request execution. Distinct from the attempt UUID; may be absent before dispatch.",
///             "schema": {
///               "type": "string",
///               "format": "uuid"
///             }
///           }
///         }
///       },
///       "409": {
///         "description": "Admission conflict before dispatch. Type route_configuration_changed identifies a changed managed credential/model configuration; that request was not sent upstream. Other conflicts retain their own error type.",
///         "headers": {
///           "x-niu-attempt-id": {
///             "description": "Niu attempt UUID, available once an attempt has been dispatched. Use this reference with GET /v1/generations/{id}; it is distinct from an upstream response ID. May be absent on early rejection.",
///             "schema": {
///               "type": "string",
///               "format": "uuid"
///             }
///           },
///           "x-niu-operation-id": {
///             "description": "Niu operation UUID grouping the request execution. Distinct from the attempt UUID; may be absent before dispatch.",
///             "schema": {
///               "type": "string",
///               "format": "uuid"
///             }
///           }
///         }
///       },
///       "501": {
///         "description": "Responses support is disabled, the route protocol is unsupported, or the requested feature is unsupported. The unsupported_operation_error message identifies the limitation and supported alternative before admission.",
///         "headers": {
///           "x-niu-attempt-id": {
///             "description": "Niu attempt UUID, available once an attempt has been dispatched. Use this reference with GET /v1/generations/{id}; it is distinct from an upstream response ID. May be absent on early rejection.",
///             "schema": {
///               "type": "string",
///               "format": "uuid"
///             }
///           },
///           "x-niu-operation-id": {
///             "description": "Niu operation UUID grouping the request execution. Distinct from the attempt UUID; may be absent before dispatch.",
///             "schema": {
///               "type": "string",
///               "format": "uuid"
///             }
///           }
///         }
///       },
///       "502": {
///         "description": "Provider request failed or returned an invalid text response. Valid terminal usage is retained for accounting even when output delivery is rejected; an HTTP error alone does not prove nonexecution or authorize a safe retry.",
///         "headers": {
///           "x-niu-attempt-id": {
///             "description": "Niu attempt UUID, available once an attempt has been dispatched. Use this reference with GET /v1/generations/{id}; it is distinct from an upstream response ID. May be absent on early rejection.",
///             "schema": {
///               "type": "string",
///               "format": "uuid"
///             }
///           },
///           "x-niu-operation-id": {
///             "description": "Niu operation UUID grouping the request execution. Distinct from the attempt UUID; may be absent before dispatch.",
///             "schema": {
///               "type": "string",
///               "format": "uuid"
///             }
///           }
///         }
///       },
///       "402": {
///         "description": "Insufficient balance or spending limit exceeded.",
///         "headers": {
///           "x-niu-attempt-id": {
///             "description": "Niu attempt UUID, available once an attempt has been dispatched. Use this reference with GET /v1/generations/{id}; it is distinct from an upstream response ID. May be absent on early rejection.",
///             "schema": {
///               "type": "string",
///               "format": "uuid"
///             }
///           },
///           "x-niu-operation-id": {
///             "description": "Niu operation UUID grouping the request execution. Distinct from the attempt UUID; may be absent before dispatch.",
///             "schema": {
///               "type": "string",
///               "format": "uuid"
///             }
///           }
///         }
///       },
///       "403": {
///         "description": "Source IP or enforced policy denies the request. Recorded preparation-policy refusals use error.type guardrail_denied before model dispatch; post-dispatch output withholding uses guardrail_output_withheld and generation charges may apply. Do not classify every 403 as a Guardrail refusal.",
///         "headers": {
///           "x-niu-attempt-id": {
///             "description": "Niu attempt UUID, available once an attempt has been dispatched. Use this reference with GET /v1/generations/{id}; it is distinct from an upstream response ID. May be absent on early rejection.",
///             "schema": {
///               "type": "string",
///               "format": "uuid"
///             }
///           },
///           "x-niu-operation-id": {
///             "description": "Niu operation UUID grouping the request execution. Distinct from the attempt UUID; may be absent before dispatch.",
///             "schema": {
///               "type": "string",
///               "format": "uuid"
///             }
///           }
///         }
///       },
///       "413": {
///         "description": "Request body exceeds 1 MiB; rejected before inference whether payload capture is enabled or disabled. Framework responses may use a plain-text body.",
///         "headers": {
///           "x-niu-attempt-id": {
///             "description": "Niu attempt UUID, available once an attempt has been dispatched. Use this reference with GET /v1/generations/{id}; it is distinct from an upstream response ID. May be absent on early rejection.",
///             "schema": {
///               "type": "string",
///               "format": "uuid"
///             }
///           },
///           "x-niu-operation-id": {
///             "description": "Niu operation UUID grouping the request execution. Distinct from the attempt UUID; may be absent before dispatch.",
///             "schema": {
///               "type": "string",
///               "format": "uuid"
///             }
///           }
///         }
///       },
///       "422": {
///         "description": "Invalid JSON or unsupported token admission/pricing requirements. Responses reads explicit input_tokens_details.cache_write_tokens alongside cache reads and reasoning output; missing categories remain unknown. Separate rates for unavailable categories in a bound base or reachable tier schedule return unsupported_token_pricing before dispatch or reservation commits.",
///         "headers": {
///           "x-niu-attempt-id": {
///             "description": "Niu attempt UUID, available once an attempt has been dispatched. Use this reference with GET /v1/generations/{id}; it is distinct from an upstream response ID. May be absent on early rejection.",
///             "schema": {
///               "type": "string",
///               "format": "uuid"
///             }
///           },
///           "x-niu-operation-id": {
///             "description": "Niu operation UUID grouping the request execution. Distinct from the attempt UUID; may be absent before dispatch.",
///             "schema": {
///               "type": "string",
///               "format": "uuid"
///             }
///           }
///         }
///       },
///       "429": {
///         "description": "API key request, concurrency or token rate limit exceeded.",
///         "headers": {
///           "x-niu-attempt-id": {
///             "description": "Niu attempt UUID, available once an attempt has been dispatched. Use this reference with GET /v1/generations/{id}; it is distinct from an upstream response ID. May be absent on early rejection.",
///             "schema": {
///               "type": "string",
///               "format": "uuid"
///             }
///           },
///           "x-niu-operation-id": {
///             "description": "Niu operation UUID grouping the request execution. Distinct from the attempt UUID; may be absent before dispatch.",
///             "schema": {
///               "type": "string",
///               "format": "uuid"
///             }
///           }
///         }
///       },
///       "503": {
///         "description": "Durable storage or configured route unavailable.",
///         "headers": {
///           "x-niu-attempt-id": {
///             "description": "Niu attempt UUID, available once an attempt has been dispatched. Use this reference with GET /v1/generations/{id}; it is distinct from an upstream response ID. May be absent on early rejection.",
///             "schema": {
///               "type": "string",
///               "format": "uuid"
///             }
///           },
///           "x-niu-operation-id": {
///             "description": "Niu operation UUID grouping the request execution. Distinct from the attempt UUID; may be absent before dispatch.",
///             "schema": {
///               "type": "string",
///               "format": "uuid"
///             }
///           }
///         }
///       }
///     },
///     "x-niu-status": "Stateless OpenAI Responses API supporting multi-turn item arrays, client function tools and tool loops, structured JSON Schema output, reasoning effort/summary, truncation, and unpriced input_image inputs (8 MiB body limit; priced routes remain text/tool-only within 1 MiB). Hosted server tools and server-stored state (previous_response_id, store: true) remain unsupported.",
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
    let principal = state
        .authorize_invocation_headers(&headers, "responses")
        .await?;
    let mut public_model = body
        .get("model")
        .and_then(Value::as_str)
        .filter(|model| !model.is_empty())
        .ok_or_else(|| ApiError::invalid_request("A model name is required"))?
        .to_owned();
    if !public_model.starts_with("pool/") && !principal.allows_model(&public_model) {
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
    let traits =
        crate::routing_traits::extract(crate::guardrails::input::Protocol::Responses, &body);
    crate::routing_traits::require_supported(
        crate::guardrails::input::Protocol::Responses,
        &traits,
    )?;
    // Reject malformed pool inputs before candidate filtering. Non-pool routes
    // run validation inside execute_responses_attempt right after input guardrails
    // so fail-closed policies deny prohibited payloads directly.
    if public_model.starts_with("pool/") {
        validate_responses_request(&mut body, None)?;
    }
    let requirements = traits.requirements(
        Some(principal.scope().project_id),
        crate::guardrails::input::Protocol::Responses,
    );
    let selection = crate::web::workspace_pools::select_for_request(
        &state,
        &principal,
        &mut public_model,
        &mut body,
        crate::guardrails::input::Protocol::Responses,
        &requirements,
        &headers,
    )
    .await?;
    let result = super::retry::execute(
        state.clone(),
        principal,
        headers,
        body,
        public_model,
        crate::guardrails::input::Protocol::Responses,
        Some(requirements),
        true,
    )
    .await;
    if let Some(selection) = selection {
        crate::web::workspace_pools::finish_selection(&state, selection, result).await
    } else {
        result
    }
}

pub(super) async fn execute_responses_attempt(
    state: &AppState,
    principal: &niu_storage::Principal,
    request: super::retry::ProtocolAttempt<'_>,
) -> Result<(DispatchContext, Result<ProviderResponse, ApiError>), ApiError> {
    let super::retry::ProtocolAttempt {
        public_model,
        headers,
        mut body,
        timeout,
        deadline,
        retry,
        resolved,
        ..
    } = request;
    let model = &resolved.model;
    let inspected_snapshot = inspect_request_input(
        state,
        principal,
        public_model,
        model,
        crate::guardrails::input::Protocol::Responses,
        &mut body,
    )
    .await?;
    let bounds = validate_responses_request(&mut body, model.pricing.as_ref())?;
    let streaming = body["stream"] == true;
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
    if (bounds.has_tools || bounds.has_tool_history) && !model.supports_tool_calls {
        return Err(ApiError::unsupported_message(
            "Function tools are not enabled for this model. Choose a model with tool support or remove tool declarations and tool items.",
        ));
    }
    if streaming && bounds.has_tools && !model.supports_streaming_tool_calls {
        return Err(ApiError::unsupported_message(
            "Streaming tool calls are not enabled for this model. Choose a model with streaming tool support or disable streaming.",
        ));
    }
    if bounds.has_structured_output && !model.supports_structured_output {
        return Err(ApiError::unsupported_message(
            "Structured JSON output is not enabled for this model. Choose a model with structured output support or use text output.",
        ));
    }
    if bounds.has_vision
        && !model.catalog.input_modalities.is_empty()
        && !model
            .catalog
            .input_modalities
            .iter()
            .any(|mode| mode == "image")
    {
        return Err(ApiError::unsupported_message(
            "Image input is not supported by this model.",
        ));
    }
    if bounds.has_reasoning
        && !model.catalog.supported_parameters.is_empty()
        && !model
            .catalog
            .supported_parameters
            .iter()
            .any(|parameter| parameter == "reasoning" || parameter == "include_reasoning")
    {
        return Err(ApiError::unsupported_message(
            "Reasoning configuration is not supported by this model.",
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
    let task_id = request_task_id(headers)?;
    let base = model.endpoint_base().ok_or_else(ApiError::unavailable)?;
    let endpoint = format!("{}/responses", base.trim_end_matches('/'));
    let client_timeout = Duration::from_secs(state.config.server.request_timeout_seconds);
    let client = tokio::time::timeout(
        timeout,
        crate::upstream::configured_client_for_endpoint(state, &endpoint, client_timeout),
    )
    .await
    .map_err(|_| ApiError::upstream())?
    .map_err(ApiError::from_endpoint)?;
    let dispatch = begin_retry_attempt(
        state,
        principal,
        AttemptRequest {
            headers,
            route_generation: resolved.route_generation,
            managed_route: resolved.managed_route.as_ref(),
            personal_route: resolved.personal_route.as_ref(),
            public_model,
            model,
            completion_bound: bounds.max_output_tokens,
            task_id: task_id.as_deref(),
            snapshot: inspected_snapshot,
            request_body: &body,
            protocol: crate::guardrails::input::Protocol::Responses,
        },
        retry,
    )
    .await?;
    let timeout = deadline.saturating_duration_since(std::time::Instant::now());
    let result = execute_responses(
        state,
        ResponsesExecution {
            public_model,
            model,
            api_key,
            body,
            timeout,
            client,
            dispatch: &dispatch,
            managed: resolved.managed_route.is_some(),
            output_validator: bounds.output_validator,
        },
    )
    .await;
    Ok((dispatch, result))
}

pub(in crate::web) fn validate_responses_request(
    body: &mut Value,
    price: Option<&crate::config::RoutePricing>,
) -> Result<ResponsesRequestBounds, ApiError> {
    let validated = crate::native_responses::validate(body, price)?;
    Ok(ResponsesRequestBounds {
        input_bytes: validated.input_bytes,
        max_output_tokens: validated.max_output_tokens,
        has_vision: validated.has_vision,
        has_tools: validated.has_tools,
        has_tool_history: validated.has_tool_history,
        has_structured_output: validated.has_structured_output,
        has_reasoning: validated.has_reasoning,
        output_validator: validated.output_validator,
    })
}

async fn execute_responses(
    state: &AppState,
    execution: ResponsesExecution<'_>,
) -> Result<ProviderResponse, ApiError> {
    let ResponsesExecution {
        public_model,
        model,
        api_key,
        mut body,
        timeout,
        client,
        dispatch,
        managed,
        output_validator,
    } = execution;
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
    retain_openrouter_reference(
        state,
        dispatch.scope,
        dispatch.attempt,
        model,
        managed,
        upstream.headers(),
    )
    .await;
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
            Some(output_validator),
            dispatch.buffered_stream_output.clone(),
            dispatch.stream_output_observation.clone(),
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
    if !output_validator.valid(&value) {
        state.failures.fetch_add(1, Ordering::Relaxed);
        // Invalid customer output does not erase independently reported execution.
        if crate::native_responses::terminal_responses_response(&value)
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
        response: buffered_json_response(value),
        completed: true,
        usage,
        provider_model,
    })
}

pub(in crate::web) fn valid_responses_response(response: &Value) -> bool {
    crate::native_responses::ResponsesOutputValidator::default().valid(response)
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
