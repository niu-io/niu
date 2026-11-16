#![cfg_attr(not(test), deny(clippy::unwrap_used, clippy::expect_used))]

use crate::error::ApiError;
use crate::inference_schema::{json_serialized_len_within, validator};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

const MAX_TOOL_COUNT: usize = 128;
const MAX_INPUT_ITEMS: usize = 256;
const MAX_PARTS_PER_ITEM: usize = 64;
const MAX_TEXT_ONLY_BYTES: usize = 1_048_576;
const MAX_MEDIA_BODY_BYTES: usize = 8 * 1024 * 1024;
const MAX_TOOL_ARG_BYTES: usize = 262_144;
const MAX_TOOL_OUTPUT_BYTES: usize = 524_288;
const MAX_ENCRYPTED_REASONING_BYTES: usize = 524_288;
const MAX_URL_BYTES: usize = 4096;

#[derive(Clone, Default)]
pub enum ResponsesTextFormat {
    #[default]
    Text,
    JsonObject,
    JsonSchema(Arc<jsonschema::Validator>),
}

#[derive(Clone, Default)]
pub struct ResponsesOutputValidator {
    tools: HashMap<String, Option<Arc<jsonschema::Validator>>>,
    required_tool_name: Option<String>,
    require_tool_call: bool,
    forbid_tool_call: bool,
    allow_parallel_tool_calls: Option<bool>,
    text_format: ResponsesTextFormat,
}

impl ResponsesOutputValidator {
    pub fn valid(&self, response: &Value) -> bool {
        if !terminal_responses_response(response) {
            return false;
        }
        let Some(output) = response.get("output").and_then(Value::as_array) else {
            return false;
        };
        if output.is_empty() {
            return false;
        }
        let mut has_message_content = false;
        let mut has_refusal = false;
        let mut function_call_count = 0usize;
        let mut assembled_text = String::new();
        for item in output {
            match item.get("type").and_then(Value::as_str) {
                Some("reasoning") => {
                    if item
                        .get("summary")
                        .is_some_and(|summary| !summary.is_array())
                    {
                        return false;
                    }
                }
                Some("message")
                    if item.get("role").and_then(Value::as_str) == Some("assistant") =>
                {
                    let Some(content) = item.get("content").and_then(Value::as_array) else {
                        return false;
                    };
                    if content.is_empty() {
                        return false;
                    }
                    for part in content {
                        match part.get("type").and_then(Value::as_str) {
                            Some("output_text") => {
                                let Some(text) = part.get("text").and_then(Value::as_str) else {
                                    return false;
                                };
                                has_message_content = true;
                                if !matches!(self.text_format, ResponsesTextFormat::Text) {
                                    if assembled_text
                                        .len()
                                        .checked_add(text.len())
                                        .is_none_or(|n| {
                                            n > crate::customer_response::MAX_STRUCTURED_RESPONSE_BYTES
                                        })
                                    {
                                        return false;
                                    }
                                    assembled_text.push_str(text);
                                }
                            }
                            Some("refusal")
                                if part.get("refusal").and_then(Value::as_str).is_some() =>
                            {
                                has_message_content = true;
                                has_refusal = true;
                            }
                            _ => return false,
                        }
                    }
                }
                Some("function_call") => {
                    let Some(call_id) = item
                        .get("call_id")
                        .and_then(Value::as_str)
                        .filter(|id| !id.trim().is_empty())
                    else {
                        return false;
                    };
                    if call_id.len() > 256 {
                        return false;
                    }
                    let Some(name) = item
                        .get("name")
                        .and_then(Value::as_str)
                        .filter(|name| validate_identifier(name))
                    else {
                        return false;
                    };
                    let Some(schema) = self.tools.get(name) else {
                        return false;
                    };
                    if self.forbid_tool_call {
                        return false;
                    }
                    if let Some(required) = &self.required_tool_name
                        && name != required
                    {
                        return false;
                    }
                    let Some(arguments) = item
                        .get("arguments")
                        .and_then(Value::as_str)
                        .filter(|args| args.len() <= MAX_TOOL_ARG_BYTES)
                    else {
                        return false;
                    };
                    let Ok(parsed_args) = serde_json::from_str::<Value>(arguments) else {
                        return false;
                    };
                    if !parsed_args.is_object() {
                        return false;
                    }
                    if let Some(compiled) = schema
                        && !compiled.is_valid(&parsed_args)
                    {
                        return false;
                    }
                    function_call_count += 1;
                }
                _ => return false,
            }
        }
        if !has_message_content && function_call_count == 0 {
            return false;
        }
        if self.allow_parallel_tool_calls == Some(false) && function_call_count > 1 {
            return false;
        }
        if response.get("status").and_then(Value::as_str) == Some("completed") {
            if self.require_tool_call && function_call_count == 0 && !has_refusal {
                return false;
            }
            if !has_refusal && function_call_count == 0 {
                match &self.text_format {
                    ResponsesTextFormat::Text => {}
                    ResponsesTextFormat::JsonObject => {
                        let Ok(parsed) = serde_json::from_str::<Value>(&assembled_text) else {
                            return false;
                        };
                        if !parsed.is_object() {
                            return false;
                        }
                    }
                    ResponsesTextFormat::JsonSchema(compiled) => {
                        let Ok(parsed) = serde_json::from_str::<Value>(&assembled_text) else {
                            return false;
                        };
                        if !compiled.is_valid(&parsed) {
                            return false;
                        }
                    }
                }
            }
        }
        true
    }
}

pub(crate) fn terminal_responses_response(response: &Value) -> bool {
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

pub struct ValidatedResponsesRequest {
    pub input_bytes: usize,
    pub max_output_tokens: Option<i64>,
    pub has_vision: bool,
    pub has_tools: bool,
    pub has_tool_history: bool,
    pub has_structured_output: bool,
    pub has_reasoning: bool,
    pub output_validator: ResponsesOutputValidator,
}

pub(crate) fn validate(
    body: &mut Value,
    price: Option<&crate::config::RoutePricing>,
) -> Result<ValidatedResponsesRequest, ApiError> {
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
        "tools",
        "tool_choice",
        "parallel_tool_calls",
        "text",
        "reasoning",
        "truncation",
        "store",
    ];
    for key in object.keys() {
        if !ALLOWED.contains(&key.as_str()) {
            if matches!(
                key.as_str(),
                "previous_response_id" | "conversation" | "background" | "prompt"
            ) {
                return Err(ApiError::invalid_request(
                    "Stateful or server-stored Responses fields are not supported; pass self-contained input items instead",
                ));
            }
            return Err(ApiError::invalid_request(
                "Unsupported field in Responses request",
            ));
        }
    }
    if object
        .get("store")
        .is_some_and(|value| value != &Value::Bool(false))
    {
        return Err(ApiError::invalid_request(
            "store must be false; stored Responses are not supported",
        ));
    }
    if object.get("stream").is_some_and(|v| !v.is_boolean()) {
        return Err(ApiError::invalid_request("stream must be a boolean"));
    }
    if let Some(truncation) = object.get("truncation")
        && !matches!(truncation.as_str(), Some("disabled" | "auto"))
    {
        return Err(ApiError::invalid_request(
            "truncation must be 'disabled' or 'auto'",
        ));
    }

    let instructions_bytes = match object.get("instructions") {
        None => 0,
        Some(Value::String(instructions)) => instructions.len(),
        _ => return Err(ApiError::invalid_request("instructions must be a string")),
    };
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

    let mut output_validator = ResponsesOutputValidator::default();
    let has_tools = if let Some(tools_value) = object.get("tools") {
        let tools = tools_value
            .as_array()
            .filter(|tools| !tools.is_empty() && tools.len() <= MAX_TOOL_COUNT)
            .ok_or_else(|| {
                ApiError::invalid_request(
                    "tools must be a non-empty array of at most 128 function tools",
                )
            })?;
        for tool in tools {
            let tool_obj = tool
                .as_object()
                .ok_or_else(|| ApiError::invalid_request("Each tool must be a JSON object"))?;
            if tool_obj.get("type").and_then(Value::as_str) != Some("function") {
                return Err(ApiError::invalid_request(
                    "Only client function tools (type: \"function\") are supported in Responses",
                ));
            }
            if tool_obj.keys().any(|key| {
                !["type", "name", "description", "parameters", "strict"].contains(&key.as_str())
            }) {
                return Err(ApiError::invalid_request(
                    "Unsupported field in function tool declaration",
                ));
            }
            let name = tool_obj
                .get("name")
                .and_then(Value::as_str)
                .filter(|name| validate_identifier(name))
                .ok_or_else(|| {
                    ApiError::invalid_request(
                        "Tool name must be 1 to 64 ASCII alphanumeric, '_' or '-' characters",
                    )
                })?;
            if output_validator.tools.contains_key(name) {
                return Err(ApiError::invalid_request(
                    "Duplicate tool names are not supported in Responses",
                ));
            }
            if tool_obj
                .get("description")
                .is_some_and(|desc| desc.as_str().is_none_or(|s| s.len() > 4096))
            {
                return Err(ApiError::invalid_request(
                    "Tool description must be a string of at most 4096 bytes",
                ));
            }
            if tool_obj.get("strict").is_some_and(|v| !v.is_boolean()) {
                return Err(ApiError::invalid_request(
                    "Tool strict flag must be a boolean",
                ));
            }
            let compiled = match tool_obj.get("parameters") {
                None => None,
                Some(schema) => {
                    if !schema.is_object() {
                        return Err(ApiError::invalid_request(
                            "Tool parameters must be a JSON Schema object",
                        ));
                    }
                    Some(validator(schema).map_err(|()| {
                        ApiError::invalid_request(
                            "Tool parameters must be a valid bounded JSON Schema",
                        )
                    })?)
                }
            };
            output_validator.tools.insert(name.to_owned(), compiled);
        }
        true
    } else {
        false
    };

    if let Some(parallel) = object.get("parallel_tool_calls") {
        let Some(allow) = parallel.as_bool() else {
            return Err(ApiError::invalid_request(
                "parallel_tool_calls must be a boolean",
            ));
        };
        if !has_tools {
            return Err(ApiError::invalid_request(
                "parallel_tool_calls requires tools to be declared",
            ));
        }
        output_validator.allow_parallel_tool_calls = Some(allow);
    }

    if let Some(choice) = object.get("tool_choice") {
        if !has_tools {
            return Err(ApiError::invalid_request(
                "tool_choice requires tools to be declared",
            ));
        }
        match choice {
            Value::String(mode) => match mode.as_str() {
                "none" => output_validator.forbid_tool_call = true,
                "auto" => {}
                "required" => output_validator.require_tool_call = true,
                _ => {
                    return Err(ApiError::invalid_request(
                        "tool_choice string must be 'none', 'auto', or 'required'",
                    ));
                }
            },
            Value::Object(choice_obj) => {
                if !choice_obj
                    .keys()
                    .all(|key| ["type", "name"].contains(&key.as_str()))
                    || choice_obj.get("type").and_then(Value::as_str) != Some("function")
                {
                    return Err(ApiError::invalid_request(
                        "tool_choice object must specify type: \"function\" and name",
                    ));
                }
                let name = choice_obj
                    .get("name")
                    .and_then(Value::as_str)
                    .filter(|name| output_validator.tools.contains_key(*name))
                    .ok_or_else(|| {
                        ApiError::invalid_request(
                            "tool_choice name must match a declared function tool",
                        )
                    })?;
                output_validator.require_tool_call = true;
                output_validator.required_tool_name = Some(name.to_owned());
            }
            _ => {
                return Err(ApiError::invalid_request(
                    "tool_choice must be a mode string or function selector",
                ));
            }
        }
    }

    let has_structured_output = if let Some(text) = object.get("text") {
        let text_obj = text
            .as_object()
            .ok_or_else(|| ApiError::invalid_request("text must be a JSON object"))?;
        if text_obj
            .keys()
            .any(|key| !["format", "verbosity"].contains(&key.as_str()))
        {
            return Err(ApiError::invalid_request(
                "Unsupported field in text configuration",
            ));
        }
        if let Some(verbosity) = text_obj.get("verbosity")
            && !matches!(verbosity.as_str(), Some("low" | "medium" | "high"))
        {
            return Err(ApiError::invalid_request(
                "text.verbosity must be 'low', 'medium', or 'high'",
            ));
        }
        if let Some(format) = text_obj.get("format") {
            let format_obj = format
                .as_object()
                .ok_or_else(|| ApiError::invalid_request("text.format must be a JSON object"))?;
            match format_obj.get("type").and_then(Value::as_str) {
                Some("text") => {
                    if format_obj.len() != 1 {
                        return Err(ApiError::invalid_request(
                            "text.format type 'text' does not accept extra fields",
                        ));
                    }
                    false
                }
                Some("json_object") => {
                    if format_obj.len() != 1 {
                        return Err(ApiError::invalid_request(
                            "text.format type 'json_object' does not accept extra fields",
                        ));
                    }
                    output_validator.text_format = ResponsesTextFormat::JsonObject;
                    true
                }
                Some("json_schema") => {
                    if format_obj.keys().any(|key| {
                        !["type", "name", "description", "schema", "strict"].contains(&key.as_str())
                    }) {
                        return Err(ApiError::invalid_request(
                            "Unsupported field in text.format json_schema",
                        ));
                    }
                    if format_obj
                        .get("name")
                        .and_then(Value::as_str)
                        .is_none_or(|name| !validate_identifier(name))
                    {
                        return Err(ApiError::invalid_request(
                            "text.format.name must be 1 to 64 ASCII identifier characters",
                        ));
                    }
                    if format_obj
                        .get("description")
                        .is_some_and(|desc| desc.as_str().is_none_or(|s| s.len() > 4096))
                    {
                        return Err(ApiError::invalid_request(
                            "text.format.description must be a string of at most 4096 bytes",
                        ));
                    }
                    if format_obj.get("strict").is_some_and(|v| !v.is_boolean()) {
                        return Err(ApiError::invalid_request(
                            "text.format.strict must be a boolean",
                        ));
                    }
                    let schema = format_obj
                        .get("schema")
                        .filter(|s| s.is_object())
                        .ok_or_else(|| {
                            ApiError::invalid_request(
                                "text.format.schema must be a JSON Schema object",
                            )
                        })?;
                    let compiled = validator(schema).map_err(|()| {
                        ApiError::invalid_request(
                            "text.format.schema must be a valid bounded JSON Schema",
                        )
                    })?;
                    output_validator.text_format = ResponsesTextFormat::JsonSchema(compiled);
                    true
                }
                _ => {
                    return Err(ApiError::invalid_request(
                        "text.format.type must be 'text', 'json_object', or 'json_schema'",
                    ));
                }
            }
        } else {
            false
        }
    } else {
        false
    };

    let has_reasoning = if let Some(reasoning) = object.get("reasoning") {
        let reasoning_obj = reasoning
            .as_object()
            .ok_or_else(|| ApiError::invalid_request("reasoning must be a JSON object"))?;
        if reasoning_obj
            .keys()
            .any(|key| !["effort", "summary"].contains(&key.as_str()))
        {
            return Err(ApiError::invalid_request(
                "Unsupported field in reasoning configuration",
            ));
        }
        if let Some(effort) = reasoning_obj.get("effort")
            && !matches!(effort.as_str(), Some("minimal" | "low" | "medium" | "high"))
        {
            return Err(ApiError::invalid_request(
                "reasoning.effort must be 'minimal', 'low', 'medium', or 'high'",
            ));
        }
        if let Some(summary) = reasoning_obj.get("summary")
            && !matches!(summary.as_str(), Some("auto" | "concise" | "detailed"))
        {
            return Err(ApiError::invalid_request(
                "reasoning.summary must be 'auto', 'concise', or 'detailed'",
            ));
        }
        true
    } else {
        false
    };

    let input = object
        .get("input")
        .ok_or_else(|| ApiError::invalid_request("input is required"))?;
    let mut has_vision = false;
    let mut has_tool_history = false;
    let mut string_input_bytes = None;
    match input {
        Value::String(text) if !text.is_empty() => {
            string_input_bytes = Some(text.len());
        }
        Value::Array(items) if !items.is_empty() && items.len() <= MAX_INPUT_ITEMS => {
            let mut seen_call_ids = HashSet::new();
            for item in items {
                let item_obj = item.as_object().ok_or_else(|| {
                    ApiError::invalid_request("Each input item must be a JSON object")
                })?;
                match item_obj.get("type").and_then(Value::as_str) {
                    None | Some("message") => {
                        if item_obj.keys().any(|key| {
                            !["type", "role", "content", "status", "id"].contains(&key.as_str())
                        }) {
                            return Err(ApiError::invalid_request(
                                "Unsupported field in Responses message item",
                            ));
                        }
                        if item_obj.get("id").is_some_and(|id| {
                            id.as_str()
                                .is_none_or(|s| s.trim().is_empty() || s.len() > 256)
                        }) {
                            return Err(ApiError::invalid_request(
                                "Message item id must be a bounded non-empty string",
                            ));
                        }
                        if let Some(status) = item_obj.get("status")
                            && !matches!(
                                status.as_str(),
                                Some("in_progress" | "completed" | "incomplete")
                            )
                        {
                            return Err(ApiError::invalid_request(
                                "Message item status must be 'in_progress', 'completed', or 'incomplete'",
                            ));
                        }
                        let role =
                            item_obj
                                .get("role")
                                .and_then(Value::as_str)
                                .ok_or_else(|| {
                                    ApiError::invalid_request("Message item role is required")
                                })?;
                        if !matches!(role, "user" | "system" | "developer" | "assistant") {
                            return Err(ApiError::invalid_request(
                                "Message item role must be 'user', 'system', 'developer', or 'assistant'",
                            ));
                        }
                        let content = item_obj.get("content").ok_or_else(|| {
                            ApiError::invalid_request("Message item content is required")
                        })?;
                        match content {
                            Value::String(text) if !text.is_empty() => {}
                            Value::Array(parts)
                                if !parts.is_empty() && parts.len() <= MAX_PARTS_PER_ITEM =>
                            {
                                for part in parts {
                                    validate_message_part(role, part, &mut has_vision)?;
                                }
                            }
                            _ => {
                                return Err(ApiError::invalid_request(
                                    "Message item content must be a non-empty string or bounded array of parts",
                                ));
                            }
                        }
                    }
                    Some("function_call") => {
                        has_tool_history = true;
                        if item_obj.keys().any(|key| {
                            !["type", "id", "call_id", "name", "arguments", "status"]
                                .contains(&key.as_str())
                        }) {
                            return Err(ApiError::invalid_request(
                                "Unsupported field in function_call input item",
                            ));
                        }
                        let call_id = item_obj
                            .get("call_id")
                            .and_then(Value::as_str)
                            .filter(|id| !id.trim().is_empty() && id.len() <= 256)
                            .ok_or_else(|| {
                                ApiError::invalid_request(
                                    "function_call input item requires a non-empty call_id",
                                )
                            })?;
                        let name = item_obj
                            .get("name")
                            .and_then(Value::as_str)
                            .filter(|name| validate_identifier(name))
                            .ok_or_else(|| {
                                ApiError::invalid_request(
                                    "function_call input item requires a valid function name",
                                )
                            })?;
                        let _ = name;
                        let args = item_obj
                            .get("arguments")
                            .and_then(Value::as_str)
                            .filter(|args| args.len() <= MAX_TOOL_ARG_BYTES)
                            .ok_or_else(|| {
                                ApiError::invalid_request(
                                    "function_call input item requires bounded string arguments",
                                )
                            })?;
                        let parsed = serde_json::from_str::<Value>(args).map_err(|_| {
                            ApiError::invalid_request("function_call arguments must be valid JSON")
                        })?;
                        if !parsed.is_object() {
                            return Err(ApiError::invalid_request(
                                "function_call arguments must be a JSON object",
                            ));
                        }
                        seen_call_ids.insert(call_id.to_owned());
                    }
                    Some("function_call_output") => {
                        has_tool_history = true;
                        if item_obj.keys().any(|key| {
                            !["type", "id", "call_id", "output", "status"].contains(&key.as_str())
                        }) {
                            return Err(ApiError::invalid_request(
                                "Unsupported field in function_call_output input item",
                            ));
                        }
                        let call_id = item_obj
                            .get("call_id")
                            .and_then(Value::as_str)
                            .filter(|id| !id.trim().is_empty() && id.len() <= 256)
                            .ok_or_else(|| {
                                ApiError::invalid_request(
                                    "function_call_output requires a non-empty call_id",
                                )
                            })?;
                        if !seen_call_ids.contains(call_id) {
                            return Err(ApiError::invalid_request(
                                "function_call_output call_id must match a prior function_call in input",
                            ));
                        }
                        let Some(output) = item_obj.get("output").and_then(Value::as_str) else {
                            return Err(ApiError::invalid_request(
                                "function_call_output.output must be a string",
                            ));
                        };
                        if output.len() > MAX_TOOL_OUTPUT_BYTES {
                            return Err(ApiError::invalid_request(
                                "function_call_output.output exceeds size limit",
                            ));
                        }
                    }
                    Some("reasoning") => {
                        if item_obj.keys().any(|key| {
                            ![
                                "type",
                                "id",
                                "summary",
                                "content",
                                "encrypted_content",
                                "status",
                            ]
                            .contains(&key.as_str())
                        }) {
                            return Err(ApiError::invalid_request(
                                "Unsupported field in reasoning input item",
                            ));
                        }
                        if item_obj.get("summary").is_some_and(|summary| {
                            !summary.as_array().is_some_and(|s| s.len() <= 64)
                        }) {
                            return Err(ApiError::invalid_request(
                                "reasoning.summary must be a bounded array",
                            ));
                        }
                        if item_obj.get("content").is_some_and(|content| {
                            !content.as_array().is_some_and(|s| s.len() <= 64)
                        }) {
                            return Err(ApiError::invalid_request(
                                "reasoning.content must be a bounded array",
                            ));
                        }
                        if item_obj.get("encrypted_content").is_some_and(|enc| {
                            enc.as_str()
                                .is_none_or(|s| s.len() > MAX_ENCRYPTED_REASONING_BYTES)
                        }) {
                            return Err(ApiError::invalid_request(
                                "reasoning.encrypted_content must be a bounded string",
                            ));
                        }
                    }
                    _ => {
                        return Err(ApiError::invalid_request(
                            "Unsupported input item type in Responses request",
                        ));
                    }
                }
            }
        }
        _ => {
            return Err(ApiError::invalid_request(
                "input must be a non-empty text string or bounded item array",
            ));
        }
    }

    if price.is_some() && has_vision {
        return Err(ApiError::invalid_request(
            "Image inputs are not supported on priced Responses routes; choose an unpriced route or send text only",
        ));
    }

    let size_limit = if has_vision {
        MAX_MEDIA_BODY_BYTES
    } else {
        MAX_TEXT_ONLY_BYTES
    };
    let serialized_len = json_serialized_len_within(object, size_limit)
        .map_err(|()| ApiError::invalid_request("Responses request body exceeds size limit"))?;

    let input_bytes = match string_input_bytes {
        Some(text_bytes) if !has_tools && !has_structured_output && !has_reasoning => text_bytes
            .checked_add(instructions_bytes)
            .ok_or_else(|| ApiError::invalid_request("Responses input is too large"))?,
        _ => serialized_len,
    };

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
            object.insert(
                "max_output_tokens".into(),
                serde_json::json!(price.max_output_tokens),
            );
        }
    }

    Ok(ValidatedResponsesRequest {
        input_bytes,
        max_output_tokens,
        has_vision,
        has_tools,
        has_tool_history,
        has_structured_output,
        has_reasoning,
        output_validator,
    })
}

fn validate_message_part(role: &str, part: &Value, has_vision: &mut bool) -> Result<(), ApiError> {
    let part_obj = part
        .as_object()
        .ok_or_else(|| ApiError::invalid_request("Each content part must be a JSON object"))?;
    match part_obj.get("type").and_then(Value::as_str) {
        Some("input_text") => {
            if role == "assistant" {
                return Err(ApiError::invalid_request(
                    "Assistant history messages must use output_text or refusal parts",
                ));
            }
            if part_obj
                .keys()
                .any(|k| !["type", "text"].contains(&k.as_str()))
                || part_obj.get("text").and_then(Value::as_str).is_none()
            {
                return Err(ApiError::invalid_request(
                    "input_text part requires a text string",
                ));
            }
        }
        Some("input_image") => {
            if role != "user" {
                return Err(ApiError::invalid_request(
                    "input_image is supported only in user messages",
                ));
            }
            if part_obj
                .keys()
                .any(|k| !["type", "image_url", "detail"].contains(&k.as_str()))
            {
                return Err(ApiError::invalid_request(
                    "Unsupported field in input_image part; pass image_url directly",
                ));
            }
            if let Some(detail) = part_obj.get("detail")
                && !matches!(detail.as_str(), Some("low" | "high" | "auto"))
            {
                return Err(ApiError::invalid_request(
                    "input_image detail must be 'low', 'high', or 'auto'",
                ));
            }
            let url = part_obj
                .get("image_url")
                .and_then(Value::as_str)
                .filter(|url| valid_image_url(url))
                .ok_or_else(|| {
                    ApiError::invalid_request(
                        "input_image requires an https:// or base64 data:image/... image_url within 8 MiB",
                    )
                })?;
            let _ = url;
            *has_vision = true;
        }
        Some("output_text") => {
            if role != "assistant" {
                return Err(ApiError::invalid_request(
                    "output_text is supported only in assistant history messages",
                ));
            }
            if part_obj
                .keys()
                .any(|k| !["type", "text", "annotations"].contains(&k.as_str()))
                || part_obj.get("text").and_then(Value::as_str).is_none()
                || part_obj
                    .get("annotations")
                    .is_some_and(|ann| !ann.is_array())
            {
                return Err(ApiError::invalid_request(
                    "output_text part requires a text string and optional annotations array",
                ));
            }
        }
        Some("refusal") => {
            if role != "assistant" {
                return Err(ApiError::invalid_request(
                    "refusal is supported only in assistant history messages",
                ));
            }
            if part_obj
                .keys()
                .any(|k| !["type", "refusal"].contains(&k.as_str()))
                || part_obj.get("refusal").and_then(Value::as_str).is_none()
            {
                return Err(ApiError::invalid_request(
                    "refusal part requires a refusal string",
                ));
            }
        }
        _ => {
            return Err(ApiError::invalid_request(
                "Unsupported content part type in Responses message",
            ));
        }
    }
    Ok(())
}

fn validate_identifier(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 64
        && name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
}

fn valid_image_url(url: &str) -> bool {
    if let Some(rest) = url.strip_prefix("data:") {
        let Some((header, data)) = rest.split_once(";base64,") else {
            return false;
        };
        if !matches!(
            header,
            "image/png" | "image/jpeg" | "image/jpg" | "image/webp" | "image/gif"
        ) {
            return false;
        }
        return !data.is_empty()
            && url.len() <= MAX_MEDIA_BODY_BYTES
            && data.bytes().all(|b| {
                b.is_ascii_alphanumeric() || matches!(b, b'+' | b'/' | b'=' | b'\n' | b'\r')
            });
    }
    url.starts_with("https://")
        && url.len() > "https://".len()
        && url.len() <= MAX_URL_BYTES
        && !url
            .bytes()
            .any(|b| b.is_ascii_whitespace() || b.is_ascii_control())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn validates_tools_structured_output_reasoning_and_tool_loop_history() {
        let mut req = json!({
            "model": "gpt-5",
            "input": [
                {"type": "message", "role": "user", "content": [{"type": "input_text", "text": "weather?"}]},
                {"type": "reasoning", "summary": [{"type": "summary_text", "text": "need lookup"}]},
                {"type": "function_call", "call_id": "call_1", "name": "get_weather", "arguments": "{\"city\":\"Shanghai\"}"},
                {"type": "function_call_output", "call_id": "call_1", "output": "{\"temp\":22}"}
            ],
            "tools": [{
                "type": "function",
                "name": "get_weather",
                "parameters": {
                    "type": "object",
                    "required": ["city"],
                    "properties": {"city": {"type": "string"}}
                },
                "strict": true
            }],
            "tool_choice": "auto",
            "parallel_tool_calls": false,
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "weather_answer",
                    "schema": {
                        "type": "object",
                        "required": ["summary"],
                        "properties": {"summary": {"type": "string"}}
                    },
                    "strict": true
                }
            },
            "reasoning": {"effort": "medium", "summary": "concise"},
            "truncation": "disabled",
            "store": false
        });
        let validated = validate(&mut req, None).unwrap();
        assert!(validated.has_tools);
        assert!(validated.has_tool_history);
        assert!(validated.has_structured_output);
        assert!(validated.has_reasoning);
        assert!(!validated.has_vision);

        assert!(validated.output_validator.valid(&json!({
            "id": "resp_1",
            "object": "response",
            "status": "completed",
            "output": [{
                "type": "message",
                "role": "assistant",
                "content": [{"type": "output_text", "text": "{\"summary\":\"Sunny\"}"}]
            }]
        })));
        assert!(!validated.output_validator.valid(&json!({
            "id": "resp_2",
            "object": "response",
            "status": "completed",
            "output": [{
                "type": "message",
                "role": "assistant",
                "content": [{"type": "output_text", "text": "{\"wrong\":1}"}]
            }]
        })));
        assert!(validated.output_validator.valid(&json!({
            "id": "resp_3",
            "object": "response",
            "status": "completed",
            "output": [{
                "type": "function_call",
                "call_id": "call_2",
                "name": "get_weather",
                "arguments": "{\"city\":\"Beijing\"}"
            }]
        })));
        assert!(!validated.output_validator.valid(&json!({
            "id": "resp_4",
            "object": "response",
            "status": "completed",
            "output": [{
                "type": "function_call",
                "call_id": "call_2",
                "name": "get_weather",
                "arguments": "{}"
            }]
        })));
    }

    #[test]
    fn rejects_hosted_tools_stateful_fields_and_priced_vision() {
        let price = crate::config::RoutePricing {
            currency: "USD".into(),
            api_prompt_rate: 1_000_000,
            api_completion_rate: 1_000_000,
            cash_prompt_rate: 1_000_000,
            cash_completion_rate: 1_000_000,
            max_input_tokens: 4096,
            max_output_tokens: 256,
        };
        for mut invalid in [
            json!({"model":"fast","input":"hi","previous_response_id":"resp_0"}),
            json!({"model":"fast","input":"hi","store":true}),
            json!({"model":"fast","input":"hi","tools":[{"type":"web_search_preview"}]}),
            json!({"model":"fast","input":[{"type":"function_call_output","call_id":"missing","output":"ok"}]}),
            json!({"model":"fast","input":"hi","tool_choice":{"type":"function","name":"undeclared"}}),
        ] {
            assert!(validate(&mut invalid, None).is_err(), "{invalid}");
        }
        let mut vision = json!({
            "model": "fast",
            "input": [{"role": "user", "content": [{"type": "input_image", "image_url": "https://example.com/a.png"}]}]
        });
        assert!(validate(&mut vision, None).unwrap().has_vision);
        assert!(validate(&mut vision, Some(&price)).is_err());
    }
}
