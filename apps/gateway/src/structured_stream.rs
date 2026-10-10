//! Bounded validation of streamed structured Chat output. Partial deltas are
//! provisional; a terminal marker is released only after validation. Accounting
//! evidence is handled independently by the stream completion writer.
use serde_json::Value;
use std::collections::BTreeMap;

const MAX_CONTENT_BYTES: usize = 1024 * 1024;
const MAX_CHOICES: usize = 128;

#[derive(Default)]
struct Choice {
    content: String,
    refused: bool,
    finished: bool,
}

pub struct StructuredStream {
    schema: Option<jsonschema::Validator>,
    choices: BTreeMap<u64, Choice>,
    bytes: usize,
    invalid: bool,
}

impl StructuredStream {
    pub fn new(schema: Option<jsonschema::Validator>) -> Self {
        Self {
            schema,
            choices: BTreeMap::new(),
            bytes: 0,
            invalid: false,
        }
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
            if delta.get("tool_calls").is_some_and(|v| !v.is_null()) {
                self.invalid = true;
                return;
            }
            if let Some(reason) = item.get("finish_reason").filter(|v| !v.is_null()) {
                if !matches!(reason.as_str(), Some("stop" | "length" | "content_filter")) {
                    self.invalid = true;
                    return;
                }
                choice.finished = true;
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
