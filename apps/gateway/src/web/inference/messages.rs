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
///     "x-niu-status": "Native text and client tools with separately enabled text/tool streaming. Media and extended thinking remain unsupported.",
///     "summary": "Create a native text Message, optionally streamed",
///     "description": "Requires supports_messages on an OpenRouter or Anthropic route. Uses Niu bearer or x-niu-api-key credentials, workspace grants, source policy, limits, guardrails and billing. Requests are limited to 1 MiB and conservative configured pricing bounds. No Chat translation. Media, beta headers and unsupported fields are rejected before dispatch. Buffered client tools require supports_messages_tools; route pools filter this capability. Tool definitions are limited to name, description and bounded offline object input_schema. tool_choice supports auto/any/none/tool and optional disable_parallel_tool_use. History requires uniquely identified assistant tool_use blocks followed immediately by matching user tool_result blocks with string content, before ordinary user text. Tools must remain declared for tool history. Streaming tools additionally require supports_messages_streaming_tools, supports_messages_tools and supports_messages_streaming; pools filter all required capabilities. Only sequential content blocks are supported; interleaved tool blocks fail safely. Native input_json_delta fragments are bounded to 64 KiB per tool and 256 KiB per message, parsed and schema-validated before content_block_stop is emitted. Tool IDs must be unique. Consumers must wait for message_stop before executing tool calls; error events and incomplete streams do not establish valid completion. Tool names, IDs and arguments are validated and projected; Niu does not execute tools. Required text input/output inspection rejects tool requests before dispatch rather than silently skipping tool content. A tool_use stop is a completed provider turn, not completion of a client task. Only version 2023-06-01 is supported (also used when omitted). Native input_tokens excludes cache reads/writes; total input accounting requires all three input categories plus output_tokens. Missing or null categories leave usage unresolved and reservations retained. Separate reasoning rates in the bound base price or a reachable context tier are rejected atomically before dispatch with 422 and x-niu-error-code unsupported_token_pricing; this adapter cannot report reasoning usage. Returned usage is not proof of a settled charge. Upstream commercial metadata is never forwarded. Native SDK and Claude Code compatibility are unverified. Streaming additionally requires supports_messages_streaming. Route pools filter this capability before priority/weight selection; no eligible candidate returns 503 before dispatch. Native SSE validates ordered text and opted-in tool events and projects customer-safe fields with a 64 KiB per-event limit. Completion requires message_stop; missing terminal evidence, upstream interruption and client cancellation retain uncertainty and reservations. Cumulative usage updates replace earlier counts; never sum deltas or infer missing categories. HTTP 200 alone is not completed usage. No credential switch or inference retry after headers. Required output inspection rejects streaming before dispatch. SDK messages.stream() stops at message_stop; an upstream extra [DONE] is not forwarded.",
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
///                 "default": false
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
///                             "oneOf": [
///                               {
///                                 "type": "object",
///                                 "additionalProperties": false,
///                                 "required": [
///                                   "type",
///                                   "text"
///                                 ],
///                                 "properties": {
///                                   "type": {
///                                     "type": "string",
///                                     "enum": [
///                                       "text"
///                                     ]
///                                   },
///                                   "text": {
///                                     "type": "string"
///                                   },
///                                   "cache_control": {
///                                     "type": "object",
///                                     "additionalProperties": false,
///                                     "required": [
///                                       "type"
///                                     ],
///                                     "properties": {
///                                       "type": {
///                                         "type": "string",
///                                         "enum": [
///                                           "ephemeral"
///                                         ]
///                                       },
///                                       "ttl": {
///                                         "type": "string",
///                                         "enum": [
///                                           "5m",
///                                           "1h"
///                                         ]
///                                       }
///                                     }
///                                   }
///                                 }
///                               },
///                               {
///                                 "type": "object",
///                                 "additionalProperties": false,
///                                 "required": [
///                                   "type",
///                                   "id",
///                                   "name",
///                                   "input"
///                                 ],
///                                 "properties": {
///                                   "type": {
///                                     "const": "tool_use"
///                                   },
///                                   "id": {
///                                     "type": "string",
///                                     "minLength": 1,
///                                     "maxLength": 200
///                                   },
///                                   "name": {
///                                     "type": "string",
///                                     "minLength": 1,
///                                     "maxLength": 64,
///                                     "pattern": "^[A-Za-z0-9_-]+$"
///                                   },
///                                   "input": {
///                                     "type": "object"
///                                   }
///                                 }
///                               },
///                               {
///                                 "type": "object",
///                                 "additionalProperties": false,
///                                 "required": [
///                                   "type",
///                                   "tool_use_id",
///                                   "content"
///                                 ],
///                                 "properties": {
///                                   "type": {
///                                     "const": "tool_result"
///                                   },
///                                   "tool_use_id": {
///                                     "type": "string",
///                                     "minLength": 1,
///                                     "maxLength": 200
///                                   },
///                                   "content": {
///                                     "type": "string"
///                                   },
///                                   "is_error": {
///                                     "type": "boolean"
///                                   }
///                                 }
///                               }
///                             ]
///                           }
///                         }
///                       ]
///                     }
///                   }
///                 }
///               },
///               "tools": {
///                 "type": "array",
///                 "minItems": 1,
///                 "maxItems": 64,
///                 "items": {
///                   "type": "object",
///                   "additionalProperties": false,
///                   "required": [
///                     "name",
///                     "input_schema"
///                   ],
///                   "properties": {
///                     "name": {
///                       "type": "string",
///                       "minLength": 1,
///                       "maxLength": 64,
///                       "pattern": "^[A-Za-z0-9_-]+$"
///                     },
///                     "description": {
///                       "type": "string"
///                     },
///                     "input_schema": {
///                       "type": "object",
///                       "required": [
///                         "type"
///                       ],
///                       "properties": {
///                         "type": {
///                           "const": "object"
///                         }
///                       },
///                       "additionalProperties": true
///                     }
///                   }
///                 }
///               },
///               "tool_choice": {
///                 "type": "object",
///                 "additionalProperties": false,
///                 "required": [
///                   "type"
///                 ],
///                 "properties": {
///                   "type": {
///                     "enum": [
///                       "auto",
///                       "any",
///                       "none",
///                       "tool"
///                     ]
///                   },
///                   "name": {
///                     "type": "string",
///                     "minLength": 1,
///                     "maxLength": 64,
///                     "pattern": "^[A-Za-z0-9_-]+$"
///                   },
///                   "disable_parallel_tool_use": {
///                     "type": "boolean"
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
///         "description": "Native sanitized Message or opted-in text SSE. Tool turns may require a client continuation. Inspect usage and billing diagnostics separately.",
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
///                     "oneOf": [
///                       {
///                         "type": "object",
///                         "additionalProperties": false,
///                         "required": [
///                           "type",
///                           "text"
///                         ],
///                         "properties": {
///                           "type": {
///                             "type": "string",
///                             "enum": [
///                               "text"
///                             ]
///                           },
///                           "text": {
///                             "type": "string"
///                           }
///                         }
///                       },
///                       {
///                         "type": "object",
///                         "additionalProperties": false,
///                         "required": [
///                           "type",
///                           "id",
///                           "name",
///                           "input"
///                         ],
///                         "properties": {
///                           "type": {
///                             "const": "tool_use"
///                           },
///                           "id": {
///                             "type": "string",
///                             "minLength": 1,
///                             "maxLength": 200
///                           },
///                           "name": {
///                             "type": "string",
///                             "minLength": 1,
///                             "maxLength": 64,
///                             "pattern": "^[A-Za-z0-9_-]+$"
///                           },
///                           "input": {
///                             "type": "object"
///                           }
///                         }
///                       }
///                     ]
///                   }
///                 },
///                 "stop_reason": {
///                   "type": "string",
///                   "enum": [
///                     "end_turn",
///                     "max_tokens",
///                     "stop_sequence",
///                     "tool_use"
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
///           },
///           "text/event-stream": {
///             "schema": {
///               "type": "string",
///               "description": "Native message_start, text content block events, cumulative message_delta and message_stop. Sanitized error events terminate failed streams."
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
///         "description": "Invalid or unsupported input.",
///         "headers": {
///           "x-niu-error-code": {
///             "description": "Niu-specific machine-readable reason, such as key_spending_limit_exceeded or budget_exceeded. Native error.type remains the native category. Shared middleware errors may omit this header.",
///             "schema": {
///               "type": "string"
///             }
///           },
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
///         "description": "Invalid Niu key.",
///         "headers": {
///           "x-niu-error-code": {
///             "description": "Niu-specific machine-readable reason, such as key_spending_limit_exceeded or budget_exceeded. Native error.type remains the native category. Shared middleware errors may omit this header.",
///             "schema": {
///               "type": "string"
///             }
///           },
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
///         "description": "Input or output policy denial.",
///         "headers": {
///           "x-niu-error-code": {
///             "description": "Niu-specific machine-readable reason, such as key_spending_limit_exceeded or budget_exceeded. Native error.type remains the native category. Shared middleware errors may omit this header.",
///             "schema": {
///               "type": "string"
///             }
///           },
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
///         "description": "Model unavailable or outside key grants.",
///         "headers": {
///           "x-niu-error-code": {
///             "description": "Niu-specific machine-readable reason, such as key_spending_limit_exceeded or budget_exceeded. Native error.type remains the native category. Shared middleware errors may omit this header.",
///             "schema": {
///               "type": "string"
///             }
///           },
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
///         "description": "Insufficient spending capacity.",
///         "headers": {
///           "x-niu-error-code": {
///             "description": "Niu-specific machine-readable reason, such as key_spending_limit_exceeded or budget_exceeded. Native error.type remains the native category. Shared middleware errors may omit this header.",
///             "schema": {
///               "type": "string"
///             }
///           },
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
///         "description": "Bound pricing requires unsupported token usage categories. No upstream dispatch or balance reservation is committed.",
///         "headers": {
///           "x-niu-error-code": {
///             "schema": {
///               "type": "string",
///               "enum": [
///                 "unsupported_token_pricing"
///               ]
///             }
///           },
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
///         "description": "Key rate, concurrency or token limit.",
///         "headers": {
///           "x-niu-error-code": {
///             "description": "Niu-specific machine-readable reason, such as key_spending_limit_exceeded or budget_exceeded. Native error.type remains the native category. Shared middleware errors may omit this header.",
///             "schema": {
///               "type": "string"
///             }
///           },
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
///         "description": "Unsupported streaming, version or capability.",
///         "headers": {
///           "x-niu-error-code": {
///             "description": "Niu-specific machine-readable reason, such as key_spending_limit_exceeded or budget_exceeded. Native error.type remains the native category. Shared middleware errors may omit this header.",
///             "schema": {
///               "type": "string"
///             }
///           },
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
///         "description": "Upstream failure or invalid response; execution may be uncertain.",
///         "headers": {
///           "x-niu-error-code": {
///             "description": "Niu-specific machine-readable reason, such as key_spending_limit_exceeded or budget_exceeded. Native error.type remains the native category. Shared middleware errors may omit this header.",
///             "schema": {
///               "type": "string"
///             }
///           },
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
///         "description": "Service unavailable.",
///         "headers": {
///           "x-niu-error-code": {
///             "description": "Niu-specific machine-readable reason, such as key_spending_limit_exceeded or budget_exceeded. Native error.type remains the native category. Shared middleware errors may omit this header.",
///             "schema": {
///               "type": "string"
///             }
///           },
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
        Err(rejection) if rejection.status() == axum::http::StatusCode::PAYLOAD_TOO_LARGE => {
            Err(ApiError::request_too_large())
        }
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
    let mut validated = validate(&body)?;
    let bound = validated.bound;
    let streaming = body.get("stream").and_then(Value::as_bool) == Some(true);
    let public_model = body["model"].as_str().unwrap().to_owned();
    if !principal.allows_model(&public_model) {
        return Err(ApiError::not_found());
    }
    // Native streaming is an independent capability, including on Anthropic
    // routes. Filter pool candidates before applying their priority/weight.
    let requirements = crate::config::ModelRequirements {
        messages_streaming: streaming,
        messages_tools: validated.tools_requested,
        messages_streaming_tools: streaming && validated.tools_requested,
        ..Default::default()
    };
    let resolved = crate::vendors::resolve_scoped_model(
        state,
        principal.scope().organization_id,
        &public_model,
        Protocol::Messages,
        Some(&requirements),
    )
    .await?;
    let model = &resolved.model;
    if !model.supports_messages || !matches!(model.provider.as_str(), "openrouter" | "anthropic") {
        return Err(ApiError::unsupported_message(
            "This route does not declare native Messages support",
        ));
    }
    if validated.tools_requested && !model.supports_messages_tools {
        return Err(ApiError::unsupported_message(
            "This route does not declare native Messages tools support",
        ));
    }
    if streaming && validated.tools_requested && !model.supports_messages_streaming_tools {
        return Err(ApiError::unsupported_message(
            "This route does not declare streaming Messages tools support",
        ));
    }
    if streaming && !model.supports_messages_streaming {
        return Err(ApiError::unsupported_message(
            "This route does not declare streaming Messages support",
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
    if snapshot.input_outcome.as_deref() == Some("redacted") {
        validated = validate(&body)?;
    }
    if let Some(price) = &model.pricing
        && (bound > price.max_output_tokens
            || validated.serialized_len > price.max_input_tokens as usize)
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
    let client = crate::upstream::configured_client_for_endpoint(state, &endpoint, timeout)
        .await
        .map_err(ApiError::from_endpoint)?;
    let task_id = request_task_id(headers)?;
    state.requests.fetch_add(1, Ordering::Relaxed);
    let dispatch = begin_attempt(
        state,
        &principal,
        AttemptRequest {
            route_generation: resolved.route_generation,
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
        .header("anthropic-version", "2023-06-01")
        .header(
            "accept",
            if streaming {
                "text/event-stream"
            } else {
                "application/json"
            },
        );
    let request = if model.provider == "anthropic" {
        request.header("x-api-key", &resolved.api_key)
    } else {
        request.bearer_auth(&resolved.api_key)
    };
    let tool_definitions = validated.tool_definitions;
    let usage_attempt = state.usage.begin();
    let result = async {
        let response = request
            .json(&body)
            .send()
            .await
            .map_err(|e| ApiError::upstream_transport(&e))?;
        retain_openrouter_reference(
            state,
            dispatch.scope,
            dispatch.attempt,
            model,
            resolved.managed_route.is_some(),
            response.headers(),
        )
        .await;
        if !response.status().is_success() {
            return Err(provider_rejection(response).await);
        }
        if streaming {
            if response
                .headers()
                .get("content-type")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.split(';').next())
                .is_none_or(|v| !v.trim().eq_ignore_ascii_case("text/event-stream"))
            {
                return Err(ApiError::upstream_invalid_response());
            }
            let mut response = Response::new(crate::streaming::tracked_messages_body(
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
                public_model.clone(),
                crate::native_messages_tools::StreamTools::from_definitions(
                    tool_definitions,
                    &body,
                ),
            ));
            response
                .headers_mut()
                .insert("content-type", "text/event-stream".parse().unwrap());
            response
                .headers_mut()
                .insert("cache-control", "no-store".parse().unwrap());
            return Ok(ProviderResponse {
                response,
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
        let response = normalize(value, &public_model, &body, tool_definitions.as_deref())?;
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

struct ValidatedMessagesRequest {
    bound: i64,
    serialized_len: usize,
    tools_requested: bool,
    tool_definitions: Option<std::sync::Arc<crate::native_messages_tools::ToolDefinitions>>,
}

fn validate(body: &Value) -> Result<ValidatedMessagesRequest, ApiError> {
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
            "tools",
            "tool_choice",
        ]
        .contains(&key.as_str())
    }) {
        return Err(invalid());
    }
    if body.get("stream").is_some_and(|v| !v.is_boolean()) {
        return Err(invalid());
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
    fn text_part(p: &Value) -> bool {
        p.as_object().is_some_and(|p| {
            p.keys()
                .all(|key| ["type", "text", "cache_control"].contains(&key.as_str()))
        }) && p
            .get("cache_control")
            .is_none_or(crate::guardrails::input::valid_message_cache_control)
            && p["type"] == "text"
            && p["text"].is_string()
    }
    fn text(value: &Value) -> bool {
        value.is_string()
            || value.as_array().is_some_and(|parts| {
                !parts.is_empty() && parts.len() <= 128 && parts.iter().all(text_part)
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
            && (m["content"].is_string()
                || m["content"].as_array().is_some_and(|parts| {
                    !parts.is_empty()
                        && parts.len() <= 128
                        && parts.iter().all(|p| {
                            text_part(p)
                                || matches!(p["type"].as_str(), Some("tool_use" | "tool_result"))
                        })
                }))
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
    let Ok(serialized_len) = crate::inference_schema::json_serialized_len_within(body, 1_048_576)
    else {
        return Err(invalid());
    };
    let Ok((tools_requested, tool_definitions)) =
        crate::native_messages_tools::validate_and_compile(body)
    else {
        return Err(invalid());
    };
    Ok(ValidatedMessagesRequest {
        bound,
        serialized_len,
        tools_requested,
        tool_definitions,
    })
}

fn normalize(
    value: Value,
    public_model: &str,
    request: &Value,
    tool_definitions: Option<&crate::native_messages_tools::ToolDefinitions>,
) -> Result<ProviderResponse, ApiError> {
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
        .filter(|v| ["end_turn", "max_tokens", "stop_sequence", "tool_use"].contains(v))
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
                if part["type"] == "tool_use" {
                    return crate::native_messages_tools::project(part, tool_definitions?);
                }
                let object = part.as_object()?;
                match part["type"].as_str()? {
                    "text" => {
                        if object
                            .keys()
                            .any(|key| !["type", "text", "citations"].contains(&key.as_str()))
                            || part.get("citations").is_some_and(|v| {
                                !v.is_null() && !v.as_array().is_some_and(Vec::is_empty)
                            })
                        {
                            return None;
                        }
                        Some(json!({"type":"text", "text":part["text"].as_str()?}))
                    }
                    "thinking" => {
                        if object
                            .keys()
                            .any(|key| !["type", "thinking", "signature"].contains(&key.as_str()))
                        {
                            return None;
                        }
                        let thinking = part["thinking"].as_str()?;
                        let mut out = json!({"type":"thinking", "thinking":thinking});
                        match part.get("signature") {
                            None | Some(Value::Null) => {}
                            Some(Value::String(sig)) => {
                                out["signature"] = json!(sig);
                            }
                            Some(_) => return None,
                        }
                        Some(out)
                    }
                    "redacted_thinking" => {
                        if object
                            .keys()
                            .any(|key| !["type", "data"].contains(&key.as_str()))
                        {
                            return None;
                        }
                        Some(json!({"type":"redacted_thinking", "data":part["data"].as_str()?}))
                    }
                    _ => None,
                }
            })
            .collect::<Option<Vec<_>>>()
    });
    let valid = content.as_ref().is_some_and(|parts| {
        let mut ids = std::collections::BTreeSet::new();
        let calls: Vec<_> = parts.iter().filter(|p| p["type"] == "tool_use").collect();
        let unique = calls
            .iter()
            .all(|p| ids.insert(p["id"].as_str().unwrap_or_default()));
        let names = calls
            .iter()
            .filter_map(|p| p["name"].as_str())
            .collect::<Vec<_>>();
        unique
            && crate::native_messages_tools::valid_selection(&request["tool_choice"], stop, &names)
    });
    let token = |key: &str| {
        value["usage"][key]
            .as_u64()
            .filter(|v| *v <= 9_007_199_254_740_991)
    };
    let optional_token = |key: &str| match value["usage"].get(key) {
        None | Some(Value::Null) => Some(0),
        Some(v) => v.as_u64().filter(|n| *n <= 9_007_199_254_740_991),
    };
    // Native input_tokens excludes cache reads and writes. When Anthropic omits
    // cache_creation_input_tokens or cache_read_input_tokens on non-cached responses,
    // treat omitted/null cache fields as 0 while rejecting malformed values.
    let usage = (|| {
        Some((
            token("input_tokens")?
                .checked_add(optional_token("cache_creation_input_tokens")?)?
                .checked_add(optional_token("cache_read_input_tokens")?)?,
            token("output_tokens")?,
        ))
    })();
    if !valid && usage.is_none() {
        return Err(invalid());
    }
    let token_categories = usage.and_then(|_| {
        let cache_write = token("cache_creation_input_tokens").and_then(|v| i64::try_from(v).ok());
        let cache_read = token("cache_read_input_tokens").and_then(|v| i64::try_from(v).ok());
        if cache_write.is_none() && cache_read.is_none() {
            None
        } else {
            Some(niu_storage::RequestTokenCategories {
                cache_write_input_tokens: cache_write,
                cached_input_tokens: cache_read,
                reasoning_output_tokens: None,
            })
        }
    });
    let finish = niu_storage::RequestChoiceFinish {
        index: 0,
        reason: if stop == "tool_use" {
            niu_storage::RequestFinishReason::ToolCalls
        } else if stop == "max_tokens" {
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
        buffered_json_response(
            json!({"id":id,"type":"message","role":"assistant","model":public_model,"content":content,"stop_reason":stop,"stop_sequence":stop_sequence,"usage":sanitized_usage}),
        )
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
