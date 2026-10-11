//! Bounded validation of streamed structured Chat output. Partial deltas are
//! provisional; a terminal marker is released only after validation. Accounting
//! evidence is handled independently by the stream completion writer.
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

const MAX_CONTENT_BYTES: usize = 1024 * 1024;
const MAX_CHOICES: usize = 128;
const MAX_TOOL_CALLS: usize = 128;

/// Shared buffered/streamed call shape; tool execution remains the client's job.
pub(crate) fn valid_tool_call(
    id: &str,
    name: &str,
    arguments: &str,
    names: &BTreeSet<String>,
) -> bool {
    !id.is_empty()
        && id.len() <= 200
        && !id.chars().any(char::is_control)
        && names.contains(name)
        && arguments.len() <= MAX_CONTENT_BYTES
        && serde_json::from_str::<Value>(arguments).is_ok_and(|v| v.is_object())
}

#[derive(Default)]
struct ToolCall {
    id: String,
    name: String,
    arguments: String,
    function: bool,
}
impl ToolCall {
    fn observe(&mut self, delta: &Value, bytes: &mut usize) -> bool {
        if let Some(value) = delta.get("type").filter(|v| !v.is_null()) {
            if value != "function" {
                return false;
            }
            self.function = true;
        }
        if let Some(value) = delta.get("id").filter(|v| !v.is_null()) {
            let Some(id) = value.as_str() else {
                return false;
            };
            if id.len() > 200 || id.chars().any(char::is_control) {
                return false;
            }
            if self.id.is_empty() {
                self.id.push_str(id);
                *bytes = bytes.saturating_add(id.len());
            } else if self.id != id {
                return false;
            }
        }
        if let Some(function) = delta.get("function").filter(|v| !v.is_null()) {
            if !function.is_object() {
                return false;
            }
            for field in ["name", "arguments"] {
                let Some(value) = function.get(field).filter(|v| !v.is_null()) else {
                    continue;
                };
                let Some(text) = value.as_str() else {
                    return false;
                };
                if bytes.saturating_add(text.len()) > MAX_CONTENT_BYTES {
                    return false;
                }
                if field == "name" {
                    if self.name == text {
                        continue;
                    }
                    if self.name.len().saturating_add(text.len()) > 64 {
                        return false;
                    }
                    self.name.push_str(text);
                } else {
                    self.arguments.push_str(text);
                }
                *bytes += text.len();
            }
        }
        *bytes <= MAX_CONTENT_BYTES
    }
}

#[derive(Default)]
struct Choice {
    content: String,
    refused: bool,
    finished: bool,
    tool_turn: bool,
    tools: BTreeMap<u64, ToolCall>,
}

pub struct StructuredStream {
    schema: Option<jsonschema::Validator>,
    choices: BTreeMap<u64, Choice>,
    bytes: usize,
    invalid: bool,
    tool_names: BTreeSet<String>,
    tool_count: usize,
}

impl StructuredStream {
    pub fn new(schema: Option<jsonschema::Validator>) -> Self {
        Self {
            schema,
            choices: BTreeMap::new(),
            bytes: 0,
            invalid: false,
            tool_names: BTreeSet::new(),
            tool_count: 0,
        }
    }

    pub fn with_tool_names(mut self, names: impl IntoIterator<Item = String>) -> Self {
        self.tool_names.extend(names);
        self
    }

    /// Keep observing terminal usage after invalid content, without retaining
    /// additional content. This prevents delivery failure from erasing liability.
    pub fn observe(&mut self, event: &Value) {
        if self.invalid {
            return;
        }
        let Some(choices) = event.get("choices").and_then(Value::as_array) else {
            return;
        };
        for item in choices {
            let Some(index) = item.get("index").and_then(Value::as_u64) else {
                self.invalid = true;
                return;
            };
            if !self.choices.contains_key(&index) && self.choices.len() >= MAX_CHOICES {
                self.invalid = true;
                return;
            }
            let choice = self.choices.entry(index).or_default();
            let delta = &item["delta"];
            for field in ["content", "refusal"] {
                let Some(value) = delta.get(field).filter(|v| !v.is_null()) else {
                    continue;
                };
                let Some(text) = value.as_str() else {
                    self.invalid = true;
                    return;
                };
                if text.is_empty() {
                    continue;
                }
                if choice.finished || self.bytes.saturating_add(text.len()) > MAX_CONTENT_BYTES {
                    self.invalid = true;
                    return;
                }
                self.bytes += text.len();
                if field == "refusal" {
                    choice.refused = true;
                } else {
                    choice.content.push_str(text);
                }
            }
            if let Some(value) = delta.get("tool_calls").filter(|v| !v.is_null()) {
                let Some(calls) = value.as_array() else {
                    self.invalid = true;
                    return;
                };
                if !calls.is_empty() && (choice.finished || self.tool_names.is_empty()) {
                    self.invalid = true;
                    return;
                }
                for call in calls {
                    let Some(index) = call.get("index").and_then(Value::as_u64) else {
                        self.invalid = true;
                        return;
                    };
                    if !choice.tools.contains_key(&index) {
                        if self.tool_count >= MAX_TOOL_CALLS {
                            self.invalid = true;
                            return;
                        }
                        self.tool_count += 1;
                    }
                    if !choice
                        .tools
                        .entry(index)
                        .or_default()
                        .observe(call, &mut self.bytes)
                    {
                        self.invalid = true;
                        return;
                    }
                }
            }
            if let Some(reason) = item.get("finish_reason").filter(|v| !v.is_null()) {
                if !matches!(
                    reason.as_str(),
                    Some("stop" | "length" | "content_filter" | "tool_calls")
                ) {
                    self.invalid = true;
                    return;
                }
                let tool_turn = reason.as_str() == Some("tool_calls");
                if choice.finished && choice.tool_turn != tool_turn {
                    self.invalid = true;
                    return;
                }
                choice.finished = true;
                choice.tool_turn = tool_turn;
            }
        }
    }

    pub fn valid(&self) -> bool {
        !self.invalid
            && !self.choices.is_empty()
            && self.choices.values().all(|choice| {
                if !choice.finished {
                    return false;
                }
                if choice.tool_turn || !choice.tools.is_empty() {
                    let mut ids = BTreeSet::new();
                    return choice.tool_turn
                        && !choice.refused
                        && !choice.tools.is_empty()
                        && choice.tools.values().all(|call| {
                            call.function
                                && ids.insert(&call.id)
                                && valid_tool_call(
                                    &call.id,
                                    &call.name,
                                    &call.arguments,
                                    &self.tool_names,
                                )
                        });
                }
                // Refusals are explicit model output, not malformed JSON.
                if choice.refused {
                    return true;
                }
                let Ok(value) = serde_json::from_str::<Value>(&choice.content) else {
                    return false;
                };
                self.schema
                    .as_ref()
                    .map_or_else(|| value.is_object(), |schema| schema.is_valid(&value))
            })
    }
}
