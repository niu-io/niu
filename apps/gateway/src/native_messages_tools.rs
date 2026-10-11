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
pub(crate) fn definitions(body: &Value) -> Option<BTreeMap<String, jsonschema::Validator>> {
    let tools = body["tools"]
        .as_array()
        .filter(|t| !t.is_empty() && t.len() <= 64)?;
    let mut result = BTreeMap::new();
    for tool in tools {
        if !fields(tool, &["name", "description", "input_schema"])
            || tool.get("description").is_some_and(|v| !v.is_string())
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
pub(crate) fn valid(body: &Value) -> bool {
    if !requested(body) {
        return true;
    }
    let Some(defs) = definitions(body) else {
        return false;
    };
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
            let mut text_seen = false;
            for part in parts {
                match part["type"].as_str() {
                    Some("tool_use") => {
                        if message["role"] != "assistant"
                            || !fields(part, &["type", "id", "name", "input"])
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
                        if text_seen
                            || message["role"] != "user"
                            || !fields(part, &["type", "tool_use_id", "content", "is_error"])
                            || !part["content"].is_string()
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
                    Some("text") => text_seen = true,
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
pub(crate) fn project(
    part: &Value,
    defs: &BTreeMap<String, jsonschema::Validator>,
) -> Option<Value> {
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
    definitions: BTreeMap<String, jsonschema::Validator>,
    choice: Value,
}
impl StreamTools {
    pub(crate) fn new(body: &Value) -> Option<Self> {
        Some(Self {
            definitions: definitions(body)?,
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
