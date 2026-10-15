//! Bounded validation of streamed structured Chat and function output. Partial deltas are
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

/// The same choice constraints apply to buffered and streamed tool turns.
pub(crate) struct ToolSelection {
    forced: Option<String>,
    required: bool,
    forbidden: bool,
    single: bool,
}
impl ToolSelection {
    pub(crate) fn from_request(request: &Value) -> Self {
        let choice = &request["tool_choice"];
        let forced = choice
            .pointer("/function/name")
            .and_then(Value::as_str)
            .map(str::to_owned);
        Self {
            required: choice == "required" || forced.is_some(),
            forbidden: choice == "none",
            single: request["parallel_tool_calls"] == false,
            forced,
        }
    }
    pub(crate) fn valid(&self, names: &[&str]) -> bool {
        (!self.required || !names.is_empty())
            && (!self.forbidden || names.is_empty())
            && (!self.single || names.len() <= 1)
            && self
                .forced
                .as_ref()
                .is_none_or(|name| names.iter().all(|actual| *actual == name))
    }
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
    schema: Option<std::sync::Arc<jsonschema::Validator>>,
    json_required: bool,
    choices: BTreeMap<u64, Choice>,
    bytes: usize,
    invalid: bool,
    tool_names: BTreeSet<String>,
    tool_count: usize,
    selection: ToolSelection,
}

impl StructuredStream {
    pub fn new(schema: Option<std::sync::Arc<jsonschema::Validator>>) -> Self {
        Self {
            schema,
            json_required: true,
            choices: BTreeMap::new(),
            bytes: 0,
            invalid: false,
            tool_names: BTreeSet::new(),
            tool_count: 0,
            selection: ToolSelection::from_request(&Value::Null),
        }
    }

    /// Text-mode tool conversations share call/selection validation, without
    /// imposing a JSON format on the assistant's final answer.
    pub fn text() -> Self {
        let mut output = Self::new(None);
        output.json_required = false;
        output
    }

    pub fn with_tools(mut self, request: &Value) -> Self {
        self.tool_names.extend(
            request
                .get("tools")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .filter_map(|tool| tool.pointer("/function/name").and_then(Value::as_str))
                .map(str::to_owned),
        );
        self.selection = ToolSelection::from_request(request);
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
                        && self.selection.valid(
                            &choice
                                .tools
                                .values()
                                .map(|call| call.name.as_str())
                                .collect::<Vec<_>>(),
                        )
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
                if !self.selection.valid(&[]) {
                    return false;
                }
                if !self.json_required {
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
