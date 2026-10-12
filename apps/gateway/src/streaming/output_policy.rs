//! Complete bounded customer-stream assembly. Framing stays in CustomerSse;
//! policy compilation, inspection and durable decisions stay in its caller.
use futures_util::future::BoxFuture;
use serde_json::{Value, json};
use std::io::{self, Write};
use std::{collections::BTreeMap, sync::Arc};
use tokio::sync::OwnedSemaphorePermit;

struct LimitedWriter<'a> {
    output: &'a mut Vec<u8>,
    limit: usize,
}
impl Write for LimitedWriter<'_> {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        if bytes.len() > self.limit.saturating_sub(self.output.len()) {
            return Err(io::Error::other("filtered output limit exceeded"));
        }
        self.output.extend_from_slice(bytes);
        Ok(bytes.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

const TEXT_LIMIT: usize = 1_048_576;
const EVENT_LIMIT: usize = 2_097_152;
type Inspection = dyn Fn(
        Result<Value, crate::guardrails::input::InspectionError>,
    ) -> BoxFuture<'static, Result<Value, ()>>
    + Send
    + Sync;

#[derive(Clone)]
pub struct BufferedOutputPolicy {
    pub inspect: Arc<Inspection>,
    /// Acquired before dispatch; clones share one permit until collection ends.
    pub slot: Arc<OwnedSemaphorePermit>,
}

pub(super) struct Collector {
    responses: bool,
    wire_bytes: usize,
    text_bytes: usize,
    metadata: Value,
    text: BTreeMap<String, String>,
    response_text: BTreeMap<(usize, usize, String), String>,
    terminal: Option<Value>,
    finish: Option<Value>,
    usage: Option<Value>,
}
impl Collector {
    pub(super) fn new(responses: bool) -> Self {
        Self {
            responses,
            wire_bytes: 0,
            text_bytes: 0,
            metadata: json!({}),
            text: BTreeMap::new(),
            response_text: BTreeMap::new(),
            terminal: None,
            finish: None,
            usage: None,
        }
    }
    pub(super) fn account(&mut self, bytes: usize) -> Result<(), &'static str> {
        self.wire_bytes = self
            .wire_bytes
            .checked_add(bytes)
            .ok_or("output buffer limit exceeded")?;
        if self.wire_bytes > EVENT_LIMIT {
            return Err("output buffer limit exceeded");
        }
        Ok(())
    }
    fn text_budget(&mut self, bytes: usize) -> Result<(), &'static str> {
        self.text_bytes = self
            .text_bytes
            .checked_add(bytes)
            .ok_or("output text limit exceeded")?;
        if self.text_bytes > TEXT_LIMIT {
            return Err("output text limit exceeded");
        }
        Ok(())
    }
    pub(super) fn observe(&mut self, v: &Value) -> Result<(), &'static str> {
        if self.responses {
            return self.observe_responses(v);
        }
        let obj = v.as_object().ok_or("unsupported output event")?;
        if obj.keys().any(|k| {
            ![
                "id",
                "object",
                "created",
                "model",
                "provider",
                "choices",
                "usage",
                "system_fingerprint",
                "service_tier",
            ]
            .contains(&k.as_str())
        }) {
            return Err("unsupported output event");
        }
        for field in [
            "id",
            "created",
            "model",
            "provider",
            "system_fingerprint",
            "service_tier",
        ] {
            if let Some(value) = v.get(field) {
                if self.metadata.get(field).is_some_and(|saved| saved != value) {
                    return Err("conflicting output identity");
                }
                self.metadata[field] = value.clone();
            }
        }
        if let Some(usage) = v.get("usage").filter(|u| !u.is_null()) {
            self.usage = Some(usage.clone());
        }
        let choices = v["choices"].as_array().ok_or("invalid stream choices")?;
        if choices.len() > 1 {
            return Err("multiple output choices unsupported");
        }
        for c in choices {
            if c["index"].as_u64() != Some(0)
                || !c.as_object().is_some_and(|o| {
                    o.keys().all(|k| {
                        [
                            "index",
                            "delta",
                            "finish_reason",
                            "logprobs",
                            "native_finish_reason",
                        ]
                        .contains(&k.as_str())
                    })
                })
                || c.get("logprobs").is_some_and(|x| !x.is_null())
            {
                return Err("unsupported stream choice");
            }
            let delta = c["delta"].as_object().ok_or("invalid output delta")?;
            if delta.keys().any(|k| {
                ![
                    "role",
                    "content",
                    "refusal",
                    "reasoning",
                    "reasoning_content",
                ]
                .contains(&k.as_str())
            }) || delta.get("role").is_some_and(|r| r != "assistant")
            {
                return Err("unsupported output delta");
            }
            for field in ["content", "refusal", "reasoning", "reasoning_content"] {
                match delta.get(field) {
                    Some(Value::String(s)) => {
                        self.text_budget(s.len())?;
                        self.text.entry(field.into()).or_default().push_str(s);
                    }
                    None | Some(Value::Null) => {}
                    _ => return Err("unsupported output text"),
                }
            }
            if let Some(reason) = c.get("finish_reason").filter(|x| !x.is_null()) {
                if !["stop", "length", "content_filter"].contains(&reason.as_str().unwrap_or("")) {
                    return Err("unsupported output finish reason");
                }
                if self.finish.as_ref().is_some_and(|saved| saved != reason) {
                    return Err("conflicting output finish reason");
                }
                self.finish = Some(reason.clone());
            }
        }
        Ok(())
    }
    fn observe_responses(&mut self, v: &Value) -> Result<(), &'static str> {
        let kind = v["type"].as_str().ok_or("invalid Responses event")?;
        match kind {
            "response.output_text.delta" | "response.refusal.delta" => {
                let text = v["delta"].as_str().ok_or("invalid Responses text delta")?;
                let output = index(v, "output_index")?;
                let content = index(v, "content_index")?;
                self.text_budget(text.len())?;
                let field = if kind == "response.output_text.delta" {
                    "text"
                } else {
                    "refusal"
                };
                self.response_text
                    .entry((output, content, field.into()))
                    .or_default()
                    .push_str(text);
            }
            "response.completed" | "response.incomplete" => {
                if self.terminal.is_some() {
                    return Err("duplicate Responses terminal");
                }
                self.terminal = Some(v["response"].clone());
            }
            "response.created" | "response.in_progress" => {
                if !v["response"].as_object().is_some_and(|r| {
                    r.get("output")
                        .and_then(Value::as_array)
                        .is_some_and(Vec::is_empty)
                }) {
                    return Err("unsupported initial Responses content");
                }
            }
            "response.output_item.added" | "response.output_item.done" => {
                let item = &v["item"];
                if item["type"] != "message" || item["role"] != "assistant" {
                    return Err("unsupported Responses output item");
                }
                index(v, "output_index")?;
            }
            "response.content_part.added" | "response.content_part.done" => {
                if !matches!(v["part"]["type"].as_str(), Some("output_text" | "refusal")) {
                    return Err("unsupported Responses content part");
                }
                let oi = index(v, "output_index")?;
                let ci = index(v, "content_index")?;
                let field = if v["part"]["type"] == "output_text" {
                    "text"
                } else {
                    "refusal"
                };
                self.response_text
                    .entry((oi, ci, field.into()))
                    .or_default();
            }
            "response.output_text.done" | "response.refusal.done" => {
                index(v, "output_index")?;
                index(v, "content_index")?;
            }
            _ => return Err("unsupported Responses content event"),
        }
        Ok(())
    }
    pub(super) fn complete(&self) -> Result<Value, &'static str> {
        if !self.responses {
            let finish = self
                .finish
                .clone()
                .ok_or("missing stream choice completion")?;
            if self.text.is_empty() {
                return Err("missing inspectable output text");
            }
            let mut message = json!({"role":"assistant"});
            for (field, text) in &self.text {
                message[field] = json!(text);
            }
            let mut result = self.metadata.clone();
            result["object"] = json!("chat.completion");
            result["choices"] = json!([{"index":0,"message":message,"finish_reason":finish}]);
            if let Some(usage) = &self.usage {
                result["usage"] = usage.clone();
            }
            return Ok(result);
        }
        let result = self.terminal.clone().ok_or("missing Responses terminal")?;
        let output = result["output"]
            .as_array()
            .ok_or("invalid Responses output")?;
        let mut expected = BTreeMap::new();
        for (oi, item) in output.iter().enumerate() {
            if item["type"] != "message"
                || item["role"] != "assistant"
                || item["id"]
                    .as_str()
                    .is_none_or(|id| id.trim().is_empty() || id.len() > 200)
            {
                return Err("unsupported Responses output item");
            }
            for (ci, part) in item["content"]
                .as_array()
                .ok_or("invalid Responses terminal content")?
                .iter()
                .enumerate()
            {
                let field = match part["type"].as_str() {
                    Some("output_text") => "text",
                    Some("refusal") => "refusal",
                    _ => return Err("unsupported Responses terminal content"),
                };
                let text = part[field]
                    .as_str()
                    .ok_or("invalid Responses terminal text")?;
                expected.insert((oi, ci, field.to_owned()), text.to_owned());
            }
        }
        if expected != self.response_text {
            return Err("Responses terminal differs from streamed content");
        }
        if serde_json::to_vec(&result)
            .map_err(|_| "invalid output")?
            .len()
            > TEXT_LIMIT
        {
            return Err("complete output limit exceeded");
        }
        Ok(result)
    }
}
fn index(v: &Value, field: &str) -> Result<usize, &'static str> {
    v[field]
        .as_u64()
        .filter(|x| *x < 128)
        .map(|x| x as usize)
        .ok_or("unsupported output index")
}
fn event(out: &mut Vec<u8>, value: Value, responses: bool) -> Result<(), &'static str> {
    let mut writer = LimitedWriter {
        output: out,
        limit: EVENT_LIMIT,
    };
    if responses {
        writer
            .write_all(b"event: ")
            .map_err(|_| "filtered output limit exceeded")?;
        writer
            .write_all(value["type"].as_str().unwrap_or("error").as_bytes())
            .map_err(|_| "filtered output limit exceeded")?;
        writer
            .write_all(b"\n")
            .map_err(|_| "filtered output limit exceeded")?;
    }
    writer
        .write_all(b"data: ")
        .map_err(|_| "filtered output limit exceeded")?;
    serde_json::to_writer(&mut writer, &value).map_err(|_| "filtered output limit exceeded")?;
    writer
        .write_all(b"\n\n")
        .map_err(|_| "filtered output limit exceeded")?;
    Ok(())
}
pub(super) fn withheld() -> Vec<u8> {
    b"data: {\"error\":{\"message\":\"Output withheld by the required output policy\",\"type\":\"guardrail_output_withheld\",\"code\":403}}\n\n".to_vec()
}
/// Validate delivery limits before its immutable output decision is recorded.
/// Reuse the same checked event builder used by actual delivery, so redaction
/// expansion cannot be recorded as deliverable when its replay would overflow.
pub(crate) fn validate_filtered_replay(
    value: &Value,
    responses: bool,
) -> Result<(), crate::guardrails::input::InspectionError> {
    replay(value.clone(), responses)
        .map(|_| ())
        .map_err(|reason| {
            if reason.contains("limit exceeded") {
                crate::guardrails::input::InspectionError::ResourceLimit
            } else {
                crate::guardrails::input::InspectionError::UnsupportedContent
            }
        })
}

pub(super) fn replay(v: Value, responses: bool) -> Result<Vec<u8>, &'static str> {
    // Bound transformed JSON before creating repeated lifecycle frames. The
    // writer stops at the cap, including any regex replacement expansion.
    let mut transformed = Vec::new();
    serde_json::to_writer(
        &mut LimitedWriter {
            output: &mut transformed,
            limit: TEXT_LIMIT,
        },
        &v,
    )
    .map_err(|_| "filtered output limit exceeded")?;
    drop(transformed);
    let mut out = Vec::new();
    if !responses {
        let choice = &v["choices"][0];
        let mut base = v.clone();
        base.as_object_mut()
            .ok_or("invalid inspected output")?
            .remove("usage");
        base["object"] = json!("chat.completion.chunk");
        base["choices"] = json!([{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]);
        event(&mut out, base.clone(), false)?;
        // Keep emitted Chat events within the existing 64 KiB event contract.
        // Chunking occurs after full-context inspection, never before it.
        for field in ["content", "refusal", "reasoning", "reasoning_content"] {
            if let Some(text) = choice["message"][field].as_str() {
                let mut remaining = text;
                while !remaining.is_empty() {
                    let mut end = remaining.len().min(8192);
                    while !remaining.is_char_boundary(end) {
                        end -= 1;
                    }
                    let mut delta = json!({});
                    delta[field] = json!(&remaining[..end]);
                    base["choices"] = json!([{"index":0,"delta":delta,"finish_reason":null}]);
                    event(&mut out, base.clone(), false)?;
                    remaining = &remaining[end..];
                }
            }
        }
        base["choices"] = json!([{"index":0,"delta":{},"finish_reason":choice["finish_reason"]}]);
        event(&mut out, base.clone(), false)?;
        if let Some(usage) = v.get("usage") {
            base["choices"] = json!([]);
            base["usage"] = usage.clone();
            event(&mut out, base, false)?;
        }
        LimitedWriter {
            output: &mut out,
            limit: EVENT_LIMIT,
        }
        .write_all(b"data: [DONE]\n\n")
        .map_err(|_| "filtered output limit exceeded")?;
        return Ok(out);
    }
    let mut sequence = 0u64;
    let mut emit = |mut value: Value| {
        value["sequence_number"] = json!(sequence);
        sequence += 1;
        event(&mut out, value, true)
    };
    let mut initial = v.clone();
    initial["status"] = json!("in_progress");
    initial["output"] = json!([]);
    initial["usage"] = Value::Null;
    initial
        .as_object_mut()
        .ok_or("invalid inspected response")?
        .remove("output_text");
    emit(json!({"type":"response.created","response":initial.clone()}))?;
    emit(json!({"type":"response.in_progress","response":initial}))?;
    for (oi, item) in v["output"]
        .as_array()
        .ok_or("invalid inspected output")?
        .iter()
        .enumerate()
    {
        let id = item["id"].as_str().ok_or("missing output item identity")?;
        let mut added = item.clone();
        added["status"] = json!("in_progress");
        added["content"] = json!([]);
        emit(json!({"type":"response.output_item.added","output_index":oi,"item":added}))?;
        for (ci, part) in item["content"]
            .as_array()
            .ok_or("invalid inspected content")?
            .iter()
            .enumerate()
        {
            let (field, kind) = match part["type"].as_str() {
                Some("output_text") => ("text", "output_text"),
                Some("refusal") => ("refusal", "refusal"),
                _ => return Err("unsupported inspected content"),
            };
            let text = part[field].as_str().ok_or("invalid inspected text")?;
            let mut added = part.clone();
            added[field] = json!("");
            emit(
                json!({"type":"response.content_part.added","item_id":id,"output_index":oi,"content_index":ci,"part":added}),
            )?;
            emit(
                json!({"type":format!("response.{kind}.delta"),"item_id":id,"output_index":oi,"content_index":ci,"delta":text}),
            )?;
            let mut done = json!({"type":format!("response.{kind}.done"),"item_id":id,"output_index":oi,"content_index":ci});
            done[field] = json!(text);
            emit(done)?;
            emit(
                json!({"type":"response.content_part.done","item_id":id,"output_index":oi,"content_index":ci,"part":part}),
            )?;
        }
        emit(json!({"type":"response.output_item.done","output_index":oi,"item":item}))?;
    }
    let terminal = if v["status"] == "completed" {
        "response.completed"
    } else {
        "response.incomplete"
    };
    emit(json!({"type":terminal,"response":v}))?;
    Ok(out)
}
