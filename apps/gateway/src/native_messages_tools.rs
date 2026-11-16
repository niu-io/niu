//! Bounded native client tools. The gateway transports calls; clients execute them.
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};

fn label(value: &Value) -> Option<&str> {
    value.as_str().filter(|s| {
        !s.is_empty()
            && s.len() <= 64
            && s.bytes()
                .all(|c| c.is_ascii_alphanumeric() || b"_-".contains(&c))
    })
}
fn id(value: &Value) -> Option<&str> {
    value
        .as_str()
        .filter(|s| !s.is_empty() && s.len() <= 200 && !s.chars().any(char::is_control))
}
fn fields(value: &Value, allowed: &[&str]) -> bool {
    value
        .as_object()
        .is_some_and(|v| v.keys().all(|k| allowed.contains(&k.as_str())))
}
pub(crate) fn requested(body: &Value) -> bool {
    body.get("tools").is_some()
        || body.get("tool_choice").is_some()
        || body["messages"].as_array().is_some_and(|messages| {
            messages.iter().any(|m| {
                m["content"].as_array().is_some_and(|parts| {
                    parts
                        .iter()
                        .any(|p| matches!(p["type"].as_str(), Some("tool_use" | "tool_result")))
                })
            })
        })
}
pub(crate) type ToolDefinitions = BTreeMap<String, std::sync::Arc<jsonschema::Validator>>;

pub(crate) fn definitions(body: &Value) -> Option<ToolDefinitions> {
    let tools = body["tools"]
        .as_array()
        .filter(|t| !t.is_empty() && t.len() <= 64)?;
    let mut result = BTreeMap::new();
    for tool in tools {
        if !fields(
            tool,
            &["name", "description", "input_schema", "cache_control"],
        ) || tool.get("description").is_some_and(|v| !v.is_string())
            || tool
                .get("cache_control")
                .is_some_and(|v| !crate::guardrails::input::valid_message_cache_control(v))
            || tool["input_schema"]["type"] != "object"
        {
            return None;
        }
        let name = label(&tool["name"])?;
        let schema = crate::inference_schema::validator(&tool["input_schema"]).ok()?;
        if result.insert(name.to_owned(), schema).is_some() {
            return None;
        }
    }
    Some(result)
}

pub(crate) fn valid_https_url(url: &str) -> bool {
    url.starts_with("https://")
        && url.len() > "https://".len()
        && url.len() <= 4096
        && !url
            .bytes()
            .any(|b| b.is_ascii_whitespace() || b.is_ascii_control())
}

pub(crate) fn valid_base64_payload(data: &str, max_bytes: usize) -> bool {
    !data.is_empty()
        && data.len() <= max_bytes
        && data
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'+' | b'/' | b'=' | b'\n' | b'\r'))
}

pub(crate) fn valid_image_block(part: &Value) -> bool {
    let Some(object) = part.as_object() else {
        return false;
    };
    if !object
        .keys()
        .all(|key| ["type", "source", "cache_control"].contains(&key.as_str()))
        || part.get("type").and_then(Value::as_str) != Some("image")
        || part
            .get("cache_control")
            .is_some_and(|v| !crate::guardrails::input::valid_message_cache_control(v))
    {
        return false;
    }
    let Some(source) = part.get("source").and_then(Value::as_object) else {
        return false;
    };
    match source.get("type").and_then(Value::as_str) {
        Some("base64") => {
            source
                .keys()
                .all(|key| ["type", "media_type", "data"].contains(&key.as_str()))
                && matches!(
                    source.get("media_type").and_then(Value::as_str),
                    Some("image/jpeg" | "image/png" | "image/gif" | "image/webp")
                )
                && source
                    .get("data")
                    .and_then(Value::as_str)
                    .is_some_and(|data| valid_base64_payload(data, 8 * 1024 * 1024))
        }
        Some("url") => {
            source
                .keys()
                .all(|key| ["type", "url"].contains(&key.as_str()))
                && source
                    .get("url")
                    .and_then(Value::as_str)
                    .is_some_and(valid_https_url)
        }
        _ => false,
    }
}

fn valid_tool_result_content(part: &Value) -> bool {
    match part.get("content") {
        None => true,
        Some(Value::String(_)) => true,
        Some(Value::Array(items)) if items.len() <= 64 => items.iter().all(|item| {
            let Some(kind) = item.get("type").and_then(Value::as_str) else {
                return false;
            };
            match kind {
                "text" => {
                    fields(item, &["type", "text", "cache_control"])
                        && item.get("text").is_some_and(Value::is_string)
                        && item
                            .get("cache_control")
                            .is_none_or(crate::guardrails::input::valid_message_cache_control)
                }
                "image" => valid_image_block(item),
                _ => false,
            }
        }),
        _ => false,
    }
}
pub(crate) fn validate_and_compile(
    body: &Value,
) -> Result<(bool, Option<std::sync::Arc<ToolDefinitions>>), ()> {
    if !requested(body) {
        return Ok((false, None));
    }
    let defs = std::sync::Arc::new(definitions(body).ok_or(())?);
    if !valid_with_definitions(body, &defs) {
        return Err(());
    }
    Ok((true, Some(defs)))
}
fn valid_with_definitions(body: &Value, defs: &ToolDefinitions) -> bool {
    if let Some(choice) = body.get("tool_choice") {
        if !fields(choice, &["type", "name", "disable_parallel_tool_use"])
            || choice
                .get("disable_parallel_tool_use")
                .is_some_and(|v| !v.is_boolean())
        {
            return false;
        }
        match choice["type"].as_str() {
            Some("auto" | "any" | "none") if choice.get("name").is_none() => (),
            Some("tool") if label(&choice["name"]).is_some_and(|n| defs.contains_key(n)) => (),
            _ => return false,
        }
    }
    let Some(messages) = body["messages"].as_array() else {
        return false;
    };
    let mut used = BTreeSet::new();
    let mut pending = BTreeSet::new();
    for message in messages {
        let expected = std::mem::take(&mut pending);
        let mut results = BTreeSet::new();
        if let Some(parts) = message["content"].as_array() {
            for part in parts {
                match part["type"].as_str() {
                    Some("tool_use") => {
                        if message["role"] != "assistant"
                            || !fields(part, &["type", "id", "name", "input", "cache_control"])
                            || part.get("cache_control").is_some_and(|v| {
                                !crate::guardrails::input::valid_message_cache_control(v)
                            })
                            || !part["input"].is_object()
                        {
                            return false;
                        }
                        let (Some(call), Some(name)) = (id(&part["id"]), label(&part["name"]))
                        else {
                            return false;
                        };
                        if !used.insert(call)
                            || !defs.get(name).is_some_and(|v| v.is_valid(&part["input"]))
                        {
                            return false;
                        }
                        pending.insert(call);
                    }
                    Some("tool_result") => {
                        if message["role"] != "user"
                            || !fields(
                                part,
                                &[
                                    "type",
                                    "tool_use_id",
                                    "content",
                                    "is_error",
                                    "cache_control",
                                ],
                            )
                            || part.get("cache_control").is_some_and(|v| {
                                !crate::guardrails::input::valid_message_cache_control(v)
                            })
                            || !valid_tool_result_content(part)
                            || part.get("is_error").is_some_and(|v| !v.is_boolean())
                        {
                            return false;
                        }
                        let Some(call) = id(&part["tool_use_id"]) else {
                            return false;
                        };
                        if !expected.contains(call) || !results.insert(call) {
                            return false;
                        }
                    }
                    Some("text") => {}
                    Some("image" | "document") if message["role"] == "user" => {}
                    Some("thinking" | "redacted_thinking") if message["role"] == "assistant" => {}
                    _ => return false,
                }
            }
        }
        if expected != results {
            return false;
        }
    }
    pending.is_empty()
}
/// Only called after the complete request has passed `valid`.
pub(crate) fn project(part: &Value, defs: &ToolDefinitions) -> Option<Value> {
    if !fields(part, &["type", "id", "name", "input", "caller"])
        || part["type"] != "tool_use"
        || !part["input"].is_object()
    {
        return None;
    }
    // Native direct client-tool provenance is safe to recognize, not forward.
    if part
        .get("caller")
        .is_some_and(|v| *v != json!({"type":"direct"}))
    {
        return None;
    }
    let call = id(&part["id"])?;
    let name = label(&part["name"])?;
    if !defs.get(name)?.is_valid(&part["input"]) {
        return None;
    }
    Some(json!({"type":"tool_use","id":call,"name":name,"input":part["input"]}))
}

/// Owned compiled schemas and selection constraints for one dispatched stream.
pub(crate) struct StreamTools {
    definitions: std::sync::Arc<ToolDefinitions>,
    choice: Value,
}
impl StreamTools {
    pub(crate) fn from_definitions(
        definitions: Option<std::sync::Arc<ToolDefinitions>>,
        body: &Value,
    ) -> Option<Self> {
        Some(Self {
            definitions: definitions?,
            choice: body["tool_choice"].clone(),
        })
    }
    pub(crate) fn start(&self, part: &Value) -> Option<Value> {
        if !fields(part, &["type", "id", "name", "input", "caller"])
            || part["type"] != "tool_use"
            || part["input"] != json!({})
            || part
                .get("caller")
                .is_some_and(|v| *v != json!({"type":"direct"}))
        {
            return None;
        }
        let call = id(&part["id"])?;
        let name = label(&part["name"])?;
        if !self.definitions.contains_key(name) {
            return None;
        }
        Some(json!({"type":"tool_use","id":call,"name":name,"input":{}}))
    }
    pub(crate) fn complete(&self, start: &Value, input: Value) -> bool {
        let mut part = start.clone();
        part["input"] = input;
        project(&part, &self.definitions).is_some()
    }
    pub(crate) fn finish(&self, stop: &str, names: &[String]) -> bool {
        valid_selection(
            &self.choice,
            stop,
            &names.iter().map(String::as_str).collect::<Vec<_>>(),
        )
    }
}

pub(crate) fn valid_selection(choice: &Value, stop: &str, names: &[&str]) -> bool {
    ((stop == "tool_use") == !names.is_empty())
        && !(choice["disable_parallel_tool_use"] == true && names.len() > 1)
        && !(choice["type"] == "none" && !names.is_empty())
        && !(matches!(choice["type"].as_str(), Some("any" | "tool")) && names.is_empty())
        && !(choice["type"] == "tool"
            && names
                .iter()
                .any(|name| Some(*name) != choice["name"].as_str()))
}
