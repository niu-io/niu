//! Bounded token-priced Chat shapes; shared capability validation runs first.
use crate::error::ApiError;
use serde_json::{Value, json};

pub(super) fn validate_priced_request(
    body: &mut Value,
    price: &crate::config::RoutePricing,
) -> Result<(), ApiError> {
    let object = body
        .as_object_mut()
        .ok_or_else(|| ApiError::invalid_request("Expected a JSON object"))?;
    // Function calls and their text results use the same token accounting as
    // text completion. Niu does not execute tools or enable hosted tool charges.
    const ALLOWED: &[&str] = &[
        "model",
        "messages",
        "stream",
        "stream_options",
        "temperature",
        "top_p",
        "stop",
        "max_tokens",
        "max_completion_tokens",
        "n",
        "seed",
        "presence_penalty",
        "frequency_penalty",
        "user",
        "response_format",
        "tools",
        "tool_choice",
        "parallel_tool_calls",
        "reasoning",
    ];
    if object.keys().any(|k| !ALLOWED.contains(&k.as_str()))
        || object.get("n").is_some_and(|v| v.as_u64() != Some(1))
        || object
            .get("parallel_tool_calls")
            .is_some_and(|value| !value.is_boolean())
        || object
            .get("messages")
            .and_then(Value::as_array)
            .is_none_or(|messages| messages.is_empty() || !messages.iter().all(text_message))
    {
        return Err(ApiError::invalid_request(
            "This priced route supports one text or function-tool completion with text-only message content",
        ));
    }
    // Match the existing priced input-size admission policy. Include serialized
    // roles and message framing, not just content characters. This is a byte
    // guard, not a provider tokenizer or a guarantee against reported overruns.
    let mut input_bytes = 0usize;
    for field in [
        "messages",
        "response_format",
        "tools",
        "tool_choice",
        "parallel_tool_calls",
    ] {
        if let Some(value) = object.get(field) {
            let length = serde_json::to_vec(value)
                .map_err(|_| ApiError::invalid_request("Invalid priced Chat input"))?
                .len();
            input_bytes = input_bytes.checked_add(length).ok_or_else(|| {
                ApiError::invalid_request("Chat input exceeds the priced route bound")
            })?;
        }
    }
    if price.max_input_tokens <= 0 || input_bytes as u128 > price.max_input_tokens as u128 {
        return Err(ApiError::invalid_request(
            "Chat input exceeds the priced route's serialized UTF-8 byte bound",
        ));
    }
    if object.contains_key("max_tokens") && object.contains_key("max_completion_tokens") {
        return Err(ApiError::invalid_request(
            "Specify only one output token limit",
        ));
    }
    if object.get("stream") == Some(&Value::Bool(true)) {
        if object.get("stream_options").is_some_and(|value| {
            value
                .as_object()
                .is_none_or(|options| options.keys().any(|key| key != "include_usage"))
        }) {
            return Err(ApiError::invalid_request(
                "Unsupported stream options on this priced route",
            ));
        }
        // Financial settlement requires final usage even when the caller did not
        // request it. Absence in the response still remains unknown.
        object.insert("stream_options".into(), json!({"include_usage": true}));
    }
    let output = object
        .get("max_completion_tokens")
        .or_else(|| object.get("max_tokens"));
    if let Some(value) = output {
        if value
            .as_i64()
            .is_none_or(|v| v <= 0 || v > price.max_output_tokens)
        {
            return Err(ApiError::invalid_request(
                "Output limit exceeds the priced route bound",
            ));
        }
    } else {
        object.insert(
            "max_completion_tokens".into(),
            json!(price.max_output_tokens),
        );
    }
    if let Some(reasoning) = object.get("reasoning") {
        let valid = reasoning.as_object().is_some_and(|options| {
            options
                .keys()
                .all(|key| ["max_tokens", "exclude"].contains(&key.as_str()))
                && options.get("exclude").is_none_or(Value::is_boolean)
                && options
                    .get("max_tokens")
                    .and_then(Value::as_i64)
                    .is_some_and(|budget| {
                        budget > 0
                            && budget
                                < object
                                    .get("max_completion_tokens")
                                    .or_else(|| object.get("max_tokens"))
                                    .and_then(Value::as_i64)
                                    .unwrap_or(0)
                    })
        });
        if !valid {
            return Err(ApiError::invalid_request(
                "Priced reasoning requires a positive max_tokens budget below the total output limit and an optional boolean exclude",
            ));
        }
    }
    Ok(())
}

fn text_message(message: &Value) -> bool {
    let Some(message) = message.as_object() else {
        return false;
    };
    let role = message.get("role").and_then(Value::as_str);
    let fields: &[&str] = match role {
        Some("system" | "developer" | "user") => &["role", "content"],
        Some("assistant") => &["role", "content", "tool_calls"],
        Some("tool") => &["role", "content", "tool_call_id"],
        _ => return false,
    };
    if message.keys().any(|key| !fields.contains(&key.as_str())) {
        return false;
    }
    if role == Some("tool") && !nonempty_string(message.get("tool_call_id")) {
        return false;
    }
    let has_calls = match message.get("tool_calls") {
        None | Some(Value::Null) => false,
        Some(Value::Array(calls)) if !calls.is_empty() && calls.len() <= 128 => {
            if !calls.iter().all(function_call) {
                return false;
            }
            true
        }
        _ => return false,
    };
    message.get("content").is_some_and(text_content)
        || (has_calls && message.get("content").is_none_or(Value::is_null))
}

/// The same bounded text shape is used for price and key-token admission.
/// Cache controls are metadata; the caller counts their serialized bytes too.
pub(super) fn text_content(content: &Value) -> bool {
    content.is_string()
        || content.as_array().is_some_and(|parts| {
            !parts.is_empty()
                && parts.iter().all(|part| {
                    part.as_object().is_some_and(|object| {
                        object
                            .keys()
                            .all(|key| ["type", "text", "cache_control"].contains(&key.as_str()))
                    }) && part.get("type").and_then(Value::as_str) == Some("text")
                        && part.get("text").is_some_and(Value::is_string)
                        && part
                            .get("cache_control")
                            .is_none_or(crate::guardrails::input::valid_message_cache_control)
                })
        })
}

fn nonempty_string(value: Option<&Value>) -> bool {
    value
        .and_then(Value::as_str)
        .is_some_and(|value| !value.is_empty())
}

fn function_call(call: &Value) -> bool {
    let Some(call) = call.as_object() else {
        return false;
    };
    let Some(function) = call.get("function").and_then(Value::as_object) else {
        return false;
    };
    call.keys()
        .all(|key| ["id", "type", "index", "function"].contains(&key.as_str()))
        && call.get("type").and_then(Value::as_str) == Some("function")
        && call
            .get("index")
            .is_none_or(|index| index.as_u64().is_some())
        && nonempty_string(call.get("id"))
        && function
            .keys()
            .all(|key| ["name", "arguments"].contains(&key.as_str()))
        && nonempty_string(function.get("name"))
        && function
            .get("arguments")
            .and_then(Value::as_str)
            .and_then(|arguments| serde_json::from_str::<Value>(arguments).ok())
            .is_some_and(|arguments| arguments.is_object())
}
