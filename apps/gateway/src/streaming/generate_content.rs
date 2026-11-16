#![cfg_attr(not(test), deny(clippy::unwrap_used, clippy::expect_used))]

//! Native Google Gemini GenerateContent & StreamGenerateContent projection,
//! schema/tool validation, and bounded accounting.
use super::{PendingStreamAttempt, StreamAttempt, StreamCompletion, persist_stream_failure};
use axum::body::{Body, Bytes};
use futures_util::{Stream, StreamExt};
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;

const MAX_CHUNK_BYTES: usize = 262_144;
const MAX_ASSEMBLED_JSON_BYTES: usize = 1_048_576;
const MAX_TOKEN_VALUE: u64 = 9_007_199_254_740_991;

#[derive(Clone, Default)]
pub struct GenerateContentOutputValidator {
    pub tools: BTreeMap<String, Option<Arc<jsonschema::Validator>>>,
    pub allowed_tools: Option<BTreeSet<String>>,
    pub require_tool_call: bool,
    pub forbid_tool_call: bool,
    pub json_mode: bool,
    pub json_schema: Option<Arc<jsonschema::Validator>>,
}

pub(crate) struct UsageSnapshot {
    pub usage: Option<(u64, u64)>,
    pub token_categories: Option<niu_storage::RequestTokenCategories>,
    pub sanitized_metadata: Value,
}

fn token_u64(usage: &Value, key: &str) -> Option<u64> {
    usage
        .get(key)?
        .as_u64()
        .filter(|value| *value <= MAX_TOKEN_VALUE)
}

fn optional_token_u64(usage: &Value, key: &str) -> Option<u64> {
    match usage.get(key) {
        None | Some(Value::Null) => Some(0),
        Some(value) => value.as_u64().filter(|n| *n <= MAX_TOKEN_VALUE),
    }
}

pub(crate) fn parse_usage_metadata(usage_meta: &Value, streaming: bool) -> UsageSnapshot {
    let usage = (|| {
        let prompt = token_u64(usage_meta, "promptTokenCount")?;
        let tool_use = optional_token_u64(usage_meta, "toolUsePromptTokenCount")?;
        let input = prompt.checked_add(tool_use)?;
        let candidates = if streaming {
            optional_token_u64(usage_meta, "candidatesTokenCount")?
        } else {
            token_u64(usage_meta, "candidatesTokenCount")?
        };
        let total = token_u64(usage_meta, "totalTokenCount")?;
        let output = total.checked_sub(input).filter(|n| *n >= candidates)?;
        if let Some(thoughts_val) = usage_meta.get("thoughtsTokenCount")
            && !thoughts_val.is_null()
        {
            let thoughts = token_u64(usage_meta, "thoughtsTokenCount")?;
            if candidates.checked_add(thoughts)? != output {
                return None;
            }
        }
        Some((input, output))
    })();

    let token_categories = usage.and_then(|(input, output)| {
        let cached = token_u64(usage_meta, "cachedContentTokenCount")
            .filter(|n| *n <= input)
            .map(|n| n as i64);
        let reasoning = token_u64(usage_meta, "thoughtsTokenCount")
            .filter(|n| *n <= output)
            .map(|n| n as i64);
        (cached.is_some() || reasoning.is_some()).then_some(niu_storage::RequestTokenCategories {
            cached_input_tokens: cached,
            cache_write_input_tokens: None,
            reasoning_output_tokens: reasoning,
        })
    });

    let mut sanitized = serde_json::Map::new();
    for key in [
        "promptTokenCount",
        "candidatesTokenCount",
        "totalTokenCount",
        "cachedContentTokenCount",
        "thoughtsTokenCount",
    ] {
        sanitized.insert(key.into(), json!(token_u64(usage_meta, key)));
    }
    if let Some(tool_use) = token_u64(usage_meta, "toolUsePromptTokenCount") {
        sanitized.insert("toolUsePromptTokenCount".into(), json!(tool_use));
    }

    UsageSnapshot {
        usage,
        token_categories,
        sanitized_metadata: Value::Object(sanitized),
    }
}

fn valid_part_text_signature(object: &serde_json::Map<String, Value>) -> Option<Value> {
    if object
        .keys()
        .any(|key| !["text", "thought", "thoughtSignature"].contains(&key.as_str()))
    {
        return None;
    }
    let text = object.get("text").and_then(Value::as_str)?;
    let thought = match object.get("thought") {
        None | Some(Value::Null) => None,
        Some(Value::Bool(flag)) => Some(*flag),
        Some(_) => return None,
    };
    let signature = match object.get("thoughtSignature") {
        None | Some(Value::Null) => None,
        Some(Value::String(sig)) if sig.len() <= 262_144 => Some(sig.as_str()),
        Some(_) => return None,
    };
    let mut out = json!({ "text": text });
    if let Some(flag) = thought {
        out["thought"] = json!(flag);
    }
    if let Some(sig) = signature {
        out["thoughtSignature"] = json!(sig);
    }
    Some(out)
}

fn project_parts(
    parts: &[Value],
    validator: &GenerateContentOutputValidator,
    assembled_text: &mut String,
    collect_text: bool,
    saw_function_call: &mut bool,
) -> Option<Vec<Value>> {
    if parts.len() > 128 {
        return None;
    }
    let mut projected = Vec::with_capacity(parts.len());
    for part in parts {
        let object = part.as_object()?;
        if let Some(call) = object.get("functionCall") {
            if object
                .keys()
                .any(|key| !["functionCall", "thoughtSignature"].contains(&key.as_str()))
            {
                return None;
            }
            if validator.forbid_tool_call {
                return None;
            }
            let call_obj = call.as_object()?;
            if call_obj
                .keys()
                .any(|key| !["name", "args", "id"].contains(&key.as_str()))
            {
                return None;
            }
            let name = call_obj.get("name").and_then(Value::as_str)?;
            let schema = validator.tools.get(name)?;
            if let Some(allowed) = &validator.allowed_tools
                && !allowed.contains(name)
            {
                return None;
            }
            let args = call_obj.get("args").filter(|v| v.is_object())?;
            if let Some(compiled) = schema
                && !compiled.is_valid(args)
            {
                return None;
            }
            let mut safe_call = json!({ "name": name, "args": args });
            if let Some(id) = call_obj
                .get("id")
                .and_then(Value::as_str)
                .filter(|id| !id.is_empty() && id.len() <= 200 && !id.chars().any(char::is_control))
            {
                safe_call["id"] = json!(id);
            }
            let mut safe_part = json!({ "functionCall": safe_call });
            if let Some(sig) = object.get("thoughtSignature") {
                let sig = sig.as_str().filter(|s| s.len() <= 262_144)?;
                safe_part["thoughtSignature"] = json!(sig);
            }
            *saw_function_call = true;
            projected.push(safe_part);
        } else {
            let safe_part = valid_part_text_signature(object)?;
            let is_thought = safe_part.get("thought").and_then(Value::as_bool) == Some(true);
            if collect_text
                && !is_thought
                && let Some(text) = safe_part.get("text").and_then(Value::as_str)
            {
                if assembled_text
                    .len()
                    .checked_add(text.len())
                    .is_none_or(|n| n > MAX_ASSEMBLED_JSON_BYTES)
                {
                    return None;
                }
                assembled_text.push_str(text);
            }
            projected.push(safe_part);
        }
    }
    Some(projected)
}

pub(crate) fn map_finish_reason(
    raw: &str,
    saw_function_call: bool,
) -> Option<niu_storage::RequestFinishReason> {
    match raw {
        "STOP" => Some(if saw_function_call {
            niu_storage::RequestFinishReason::ToolCalls
        } else {
            niu_storage::RequestFinishReason::Stop
        }),
        "MAX_TOKENS" => Some(niu_storage::RequestFinishReason::Length),
        "SAFETY" | "RECITATION" | "BLOCKLIST" | "PROHIBITED_CONTENT" | "SPII" => {
            Some(niu_storage::RequestFinishReason::ContentFilter)
        }
        _ => None,
    }
}

pub(crate) fn check_structured_json(
    validator: &GenerateContentOutputValidator,
    assembled_text: &str,
    saw_function_call: bool,
    finish: niu_storage::RequestFinishReason,
) -> bool {
    if finish != niu_storage::RequestFinishReason::Stop
        && finish != niu_storage::RequestFinishReason::ToolCalls
    {
        return true;
    }
    if validator.require_tool_call && !saw_function_call {
        return false;
    }
    if !saw_function_call && (validator.json_mode || validator.json_schema.is_some()) {
        let Ok(parsed) = serde_json::from_str::<Value>(assembled_text) else {
            return false;
        };
        if let Some(schema) = &validator.json_schema
            && !schema.is_valid(&parsed)
        {
            return false;
        }
    }
    true
}

pub(crate) struct BufferedProjection {
    pub valid: bool,
    pub sanitized: Value,
    pub usage: Option<(u64, u64)>,
    pub token_categories: Option<niu_storage::RequestTokenCategories>,
    pub provider_model: Option<String>,
    pub finish_reasons: Option<Vec<niu_storage::RequestChoiceFinish>>,
}

pub(crate) fn sanitize_buffered_response(
    value: &Value,
    public_model: &str,
    validator: &GenerateContentOutputValidator,
) -> BufferedProjection {
    let usage_snapshot = parse_usage_metadata(&value["usageMetadata"], false);
    let provider_model = value["modelVersion"]
        .as_str()
        .filter(|s| !s.is_empty() && s.len() <= 200 && !s.chars().any(char::is_control))
        .map(str::to_owned);

    let projected = (|| -> Option<(Value, Vec<niu_storage::RequestChoiceFinish>)> {
        if value.get("error").is_some_and(|e| !e.is_null()) {
            return None;
        }
        let candidate = value["candidates"]
            .as_array()
            .filter(|v| v.len() == 1)
            .and_then(|v| v.first())?;
        let stop = candidate.get("finishReason").and_then(Value::as_str)?;
        let mut saw_function_call = false;
        let finish = map_finish_reason(stop, false)?;
        let allow_empty_parts = finish == niu_storage::RequestFinishReason::ContentFilter
            || finish == niu_storage::RequestFinishReason::Length;
        let collect_text = validator.json_mode || validator.json_schema.is_some();
        let mut assembled_text = String::new();
        let parts = if let Some(content) = candidate.get("content").and_then(Value::as_object) {
            if content.get("role").and_then(Value::as_str) != Some("model") {
                return None;
            }
            let raw_parts = content.get("parts").and_then(Value::as_array)?;
            if raw_parts.is_empty() && !allow_empty_parts {
                return None;
            }
            project_parts(
                raw_parts,
                validator,
                &mut assembled_text,
                collect_text,
                &mut saw_function_call,
            )?
        } else if allow_empty_parts {
            Vec::new()
        } else {
            return None;
        };
        let final_finish = map_finish_reason(stop, saw_function_call)?;
        if !check_structured_json(validator, &assembled_text, saw_function_call, final_finish) {
            return None;
        }
        let finish_reasons = vec![niu_storage::RequestChoiceFinish {
            index: 0,
            reason: final_finish,
        }];
        let mut sanitized = json!({
            "candidates": [{
                "index": 0,
                "content": { "role": "model", "parts": parts },
                "finishReason": stop,
            }],
            "modelVersion": public_model,
            "usageMetadata": usage_snapshot.sanitized_metadata.clone(),
        });
        if let Some(id) = value["responseId"]
            .as_str()
            .filter(|s| !s.is_empty() && s.len() <= 200 && !s.chars().any(char::is_control))
        {
            sanitized["responseId"] = json!(id);
        }
        Some((sanitized, finish_reasons))
    })();

    match projected {
        Some((sanitized, finish_reasons)) => BufferedProjection {
            valid: true,
            sanitized,
            usage: usage_snapshot.usage,
            token_categories: usage_snapshot.token_categories,
            provider_model,
            finish_reasons: Some(finish_reasons),
        },
        None => BufferedProjection {
            valid: false,
            sanitized: Value::Null,
            usage: usage_snapshot.usage,
            token_categories: usage_snapshot.token_categories,
            provider_model,
            finish_reasons: None,
        },
    }
}

#[derive(PartialEq, Eq)]
enum JsonArrayState {
    BeforeOpen,
    ExpectObjectOrClose,
    ExpectObject,
    InObject,
    ExpectCommaOrClose,
    Closed,
}

struct JsonArrayScanner {
    state: JsonArrayState,
    started: bool,
    emitted_any: bool,
    buffer: Vec<u8>,
    depth: usize,
    in_string: bool,
    escape: bool,
    bom_skip: usize,
}

impl Default for JsonArrayScanner {
    fn default() -> Self {
        Self {
            state: JsonArrayState::BeforeOpen,
            started: false,
            emitted_any: false,
            buffer: Vec::new(),
            depth: 0,
            in_string: false,
            escape: false,
            bom_skip: 0,
        }
    }
}

impl JsonArrayScanner {
    fn feed(&mut self, bytes: &[u8]) -> Result<Vec<Value>, &'static str> {
        let mut chunks = Vec::new();
        for &byte in bytes {
            if !self.started {
                if self.bom_skip == 0 && byte == 0xef {
                    self.bom_skip = 1;
                    continue;
                }
                if self.bom_skip == 1 && byte == 0xbb {
                    self.bom_skip = 2;
                    continue;
                }
                if self.bom_skip == 2 && byte == 0xbf {
                    self.bom_skip = 0;
                    self.started = true;
                    continue;
                }
                if self.bom_skip != 0 {
                    return Err("Invalid UTF-8 BOM in GenerateContent stream");
                }
                self.started = true;
            }
            match self.state {
                JsonArrayState::BeforeOpen => {
                    if byte.is_ascii_whitespace() {
                        continue;
                    }
                    if byte == b'[' {
                        self.state = JsonArrayState::ExpectObjectOrClose;
                    } else {
                        return Err("Expected JSON array opening in GenerateContent stream");
                    }
                }
                JsonArrayState::ExpectObjectOrClose => {
                    if byte.is_ascii_whitespace() {
                        continue;
                    }
                    if byte == b']' && !self.emitted_any {
                        return Err("Empty GenerateContent JSON array stream");
                    } else if byte == b'{' {
                        self.buffer.clear();
                        self.buffer.push(b'{');
                        self.depth = 1;
                        self.in_string = false;
                        self.escape = false;
                        self.state = JsonArrayState::InObject;
                    } else {
                        return Err("Expected JSON object in GenerateContent stream");
                    }
                }
                JsonArrayState::ExpectObject => {
                    if byte.is_ascii_whitespace() {
                        continue;
                    }
                    if byte == b'{' {
                        self.buffer.clear();
                        self.buffer.push(b'{');
                        self.depth = 1;
                        self.in_string = false;
                        self.escape = false;
                        self.state = JsonArrayState::InObject;
                    } else {
                        return Err("Expected JSON object after comma in GenerateContent stream");
                    }
                }
                JsonArrayState::InObject => {
                    if self.buffer.len() >= MAX_CHUNK_BYTES {
                        return Err("GenerateContent JSON stream object exceeds inspection limit");
                    }
                    self.buffer.push(byte);
                    if self.in_string {
                        if self.escape {
                            self.escape = false;
                        } else if byte == b'\\' {
                            self.escape = true;
                        } else if byte == b'"' {
                            self.in_string = false;
                        }
                    } else {
                        match byte {
                            b'"' => self.in_string = true,
                            b'{' => self.depth = self.depth.saturating_add(1),
                            b'}' => {
                                self.depth = self.depth.saturating_sub(1);
                                if self.depth == 0 {
                                    let parsed: Value = serde_json::from_slice(&self.buffer)
                                        .map_err(|_| "Invalid GenerateContent JSON chunk")?;
                                    self.buffer.clear();
                                    self.emitted_any = true;
                                    self.state = JsonArrayState::ExpectCommaOrClose;
                                    chunks.push(parsed);
                                }
                            }
                            _ => {}
                        }
                    }
                }
                JsonArrayState::ExpectCommaOrClose => {
                    if byte.is_ascii_whitespace() {
                        continue;
                    }
                    match byte {
                        b',' => self.state = JsonArrayState::ExpectObject,
                        b']' => self.state = JsonArrayState::Closed,
                        _ => return Err("Invalid delimiter in GenerateContent JSON stream"),
                    }
                }
                JsonArrayState::Closed => {
                    if !byte.is_ascii_whitespace() {
                        return Err("Trailing data after GenerateContent JSON array");
                    }
                }
            }
        }
        Ok(chunks)
    }
}

#[derive(Default)]
struct SseScanner {
    line: Vec<u8>,
    data: Vec<u8>,
    event: Option<String>,
    event_bytes: usize,
    skip_lf: bool,
    first_line: bool,
    started: bool,
}

impl SseScanner {
    fn feed(&mut self, bytes: &[u8]) -> Result<Vec<Value>, &'static str> {
        let mut chunks = Vec::new();
        for &byte in bytes {
            if self.skip_lf {
                self.skip_lf = false;
                if byte == b'\n' {
                    continue;
                }
            }
            if !self.started {
                self.started = true;
                self.first_line = true;
            }
            self.event_bytes += 1;
            if self.event_bytes > MAX_CHUNK_BYTES {
                return Err("GenerateContent SSE event exceeds inspection limit");
            }
            if byte != b'\r' && byte != b'\n' {
                self.line.push(byte);
                continue;
            }
            self.skip_lf = byte == b'\r';
            let raw = std::mem::take(&mut self.line);
            let raw = if self.first_line {
                raw.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(&raw)
            } else {
                &raw
            };
            self.first_line = false;
            let line = std::str::from_utf8(raw).map_err(|_| "Invalid GenerateContent UTF-8")?;
            if line.is_empty() {
                self.event_bytes = 0;
                if self.event.as_deref() == Some("error") {
                    return Err("Upstream GenerateContent returned an SSE error event");
                }
                if !self.data.is_empty() {
                    let parsed: Value = serde_json::from_slice(&self.data)
                        .map_err(|_| "Invalid GenerateContent SSE JSON")?;
                    chunks.push(parsed);
                    self.data.clear();
                }
                self.event = None;
            } else if let Some(data) = line.strip_prefix("data:") {
                if !self.data.is_empty() {
                    self.data.push(b'\n');
                }
                self.data
                    .extend_from_slice(data.strip_prefix(' ').unwrap_or(data).as_bytes());
            } else if let Some(event) = line.strip_prefix("event:") {
                self.event = Some(event.trim().to_owned());
            }
        }
        Ok(chunks)
    }

    fn finish_eof(&mut self) -> Result<Option<Value>, &'static str> {
        if !self.line.is_empty() {
            let extra = self.feed(b"\n\n")?;
            return Ok(extra.into_iter().next());
        }
        if !self.data.is_empty() {
            let parsed: Value = serde_json::from_slice(&self.data)
                .map_err(|_| "Invalid trailing GenerateContent SSE JSON")?;
            self.data.clear();
            return Ok(Some(parsed));
        }
        Ok(None)
    }
}

struct GenerateContentStreamState {
    public_model: String,
    validator: GenerateContentOutputValidator,
    sse: bool,
    sse_scanner: SseScanner,
    json_scanner: JsonArrayScanner,
    opened_json_array: bool,
    assembled_text: String,
    saw_parts: bool,
    saw_function_call: bool,
    finish_reason: Option<niu_storage::RequestFinishReason>,
    usage: Option<(u64, u64)>,
    token_categories: Option<niu_storage::RequestTokenCategories>,
    provider_model: Option<String>,
    has_output: bool,
}

impl GenerateContentStreamState {
    fn new(public_model: String, validator: GenerateContentOutputValidator, sse: bool) -> Self {
        Self {
            public_model,
            validator,
            sse,
            sse_scanner: SseScanner::default(),
            json_scanner: JsonArrayScanner::default(),
            opened_json_array: false,
            assembled_text: String::new(),
            saw_parts: false,
            saw_function_call: false,
            finish_reason: None,
            usage: None,
            token_categories: None,
            provider_model: None,
            has_output: false,
        }
    }

    fn observe_chunk(&mut self, value: Value) -> Result<Value, &'static str> {
        if value.get("error").is_some_and(|e| !e.is_null()) {
            return Err("Upstream GenerateContent stream reported an error");
        }
        if let Some(model) = value
            .get("modelVersion")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty() && s.len() <= 200 && !s.chars().any(char::is_control))
        {
            self.provider_model = Some(model.to_owned());
        }
        let mut sanitized = serde_json::Map::new();
        sanitized.insert("modelVersion".into(), json!(self.public_model));
        if let Some(id) = value
            .get("responseId")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty() && s.len() <= 200 && !s.chars().any(char::is_control))
        {
            sanitized.insert("responseId".into(), json!(id));
        }

        if let Some(candidates) = value.get("candidates") {
            let candidates = candidates
                .as_array()
                .filter(|v| v.len() == 1)
                .ok_or("Invalid GenerateContent stream candidates")?;
            let candidate = &candidates[0];
            let collect_text = self.validator.json_mode || self.validator.json_schema.is_some();
            let mut safe_candidate = serde_json::Map::new();
            safe_candidate.insert("index".into(), json!(0));
            if let Some(content) = candidate.get("content").and_then(Value::as_object) {
                if let Some(role) = content.get("role").and_then(Value::as_str)
                    && role != "model"
                {
                    return Err("Invalid GenerateContent candidate role");
                }
                if let Some(raw_parts) = content.get("parts").and_then(Value::as_array) {
                    let safe_parts = project_parts(
                        raw_parts,
                        &self.validator,
                        &mut self.assembled_text,
                        collect_text,
                        &mut self.saw_function_call,
                    )
                    .ok_or("Invalid GenerateContent candidate part")?;
                    if !safe_parts.is_empty() {
                        self.saw_parts = true;
                        self.has_output = true;
                    }
                    safe_candidate.insert(
                        "content".into(),
                        json!({ "role": "model", "parts": safe_parts }),
                    );
                }
            }
            if let Some(raw_finish) = candidate.get("finishReason").and_then(Value::as_str) {
                let mapped = map_finish_reason(raw_finish, self.saw_function_call)
                    .ok_or("Unsupported GenerateContent finishReason")?;
                let allow_empty = matches!(
                    mapped,
                    niu_storage::RequestFinishReason::ContentFilter
                        | niu_storage::RequestFinishReason::Length
                );
                if !self.saw_parts && !allow_empty {
                    return Err("GenerateContent terminated without output parts");
                }
                self.finish_reason = Some(mapped);
                safe_candidate.insert("finishReason".into(), json!(raw_finish));
            }
            sanitized.insert(
                "candidates".into(),
                Value::Array(vec![Value::Object(safe_candidate)]),
            );
        }

        if let Some(usage_meta) = value.get("usageMetadata").filter(|v| !v.is_null()) {
            let snapshot = parse_usage_metadata(usage_meta, true);
            if snapshot.usage.is_none() {
                return Err("Invalid GenerateContent usageMetadata");
            }
            self.usage = snapshot.usage;
            self.token_categories = snapshot.token_categories;
            sanitized.insert("usageMetadata".into(), snapshot.sanitized_metadata);
        }

        Ok(Value::Object(sanitized))
    }

    fn feed(&mut self, bytes: &[u8]) -> Result<Vec<u8>, &'static str> {
        let raw_chunks = if self.sse {
            self.sse_scanner.feed(bytes)?
        } else {
            self.json_scanner.feed(bytes)?
        };
        let mut out = Vec::new();
        for chunk in raw_chunks {
            let safe = self.observe_chunk(chunk)?;
            if self.sse {
                out.extend_from_slice(format!("data: {safe}\n\n").as_bytes());
            } else {
                if !self.opened_json_array {
                    out.push(b'[');
                    self.opened_json_array = true;
                } else {
                    out.push(b',');
                }
                out.extend_from_slice(&serde_json::to_vec(&safe).map_err(|_| "Encode error")?);
            }
        }
        Ok(out)
    }

    fn finish_eof(&mut self) -> Result<(Vec<u8>, bool), &'static str> {
        let mut out = Vec::new();
        if self.sse {
            if let Some(chunk) = self.sse_scanner.finish_eof()? {
                let safe = self.observe_chunk(chunk)?;
                out.extend_from_slice(format!("data: {safe}\n\n").as_bytes());
            }
        } else if self.json_scanner.state != JsonArrayState::Closed {
            return Err("GenerateContent JSON stream truncated before closing bracket");
        }
        let finish = self
            .finish_reason
            .ok_or("GenerateContent stream ended without a terminal finishReason")?;
        if self.usage.is_none() {
            return Err("GenerateContent stream ended without valid usageMetadata");
        }
        let valid_output = check_structured_json(
            &self.validator,
            &self.assembled_text,
            self.saw_function_call,
            finish,
        );
        if valid_output && !self.sse {
            out.push(b']');
        }
        Ok((out, valid_output))
    }

    fn completion(&self, invalid_output: bool) -> StreamCompletion {
        StreamCompletion {
            usage: self.usage,
            provider_model: self.provider_model.clone(),
            token_categories: self.token_categories,
            finish_reasons: self
                .finish_reason
                .map(|reason| vec![niu_storage::RequestChoiceFinish { index: 0, reason }]),
            invalid_output,
        }
    }
}

pub fn tracked_generate_content_body<S>(
    upstream: S,
    attempt: StreamAttempt,
    public_model: String,
    validator: GenerateContentOutputValidator,
    sse: bool,
) -> Body
where
    S: Stream<Item = Result<Bytes, reqwest::Error>> + Send + 'static,
{
    let state = (
        Box::pin(upstream),
        GenerateContentStreamState::new(public_model, validator, sse),
        PendingStreamAttempt(Some(attempt)),
        false,
        crate::request_timings::current(),
    );
    Body::from_stream(futures_util::stream::unfold(
        state,
        |(mut upstream, mut state, mut attempt, stopped, timing)| async move {
            if stopped {
                return None;
            }
            loop {
                match upstream.next().await {
                    Some(Ok(bytes)) => match state.feed(&bytes) {
                        Ok(out) => {
                            if state.has_output
                                && let Some(timing) = &timing
                            {
                                timing.output();
                            }
                            if out.is_empty() {
                                continue;
                            }
                            return Some((
                                Ok::<_, std::io::Error>(Bytes::from(out)),
                                (upstream, state, attempt, false, timing),
                            ));
                        }
                        Err(reason) => {
                            if let Some(context) = attempt.take() {
                                persist_stream_failure(
                                    context,
                                    niu_storage::RequestFailureKind::UpstreamInvalidResponse,
                                )
                                .await;
                            }
                            return if state.sse {
                                let err_event = json!({"error":{"code":502,"status":"INTERNAL","message":reason}});
                                Some((
                                    Ok(Bytes::from(format!("event: error\ndata: {err_event}\n\n"))),
                                    (upstream, state, attempt, true, timing),
                                ))
                            } else {
                                Some((
                                    Err(std::io::Error::other(reason)),
                                    (upstream, state, attempt, true, timing),
                                ))
                            };
                        }
                    },
                    Some(Err(error)) => {
                        let kind = if error.is_timeout() {
                            niu_storage::RequestFailureKind::UpstreamTimeout
                        } else {
                            niu_storage::RequestFailureKind::UpstreamTransportError
                        };
                        if let Some(context) = attempt.take() {
                            persist_stream_failure(context, kind).await;
                        }
                        return if state.sse {
                            let err_event = json!({"error":{"code":502,"status":"INTERNAL","message":"Upstream GenerateContent stream interrupted"}});
                            Some((
                                Ok(Bytes::from(format!("event: error\ndata: {err_event}\n\n"))),
                                (upstream, state, attempt, true, timing),
                            ))
                        } else {
                            Some((
                                Err(std::io::Error::other("upstream stream interrupted")),
                                (upstream, state, attempt, true, timing),
                            ))
                        };
                    }
                    None => match state.finish_eof() {
                        Ok((mut tail, valid_output)) => {
                            if state.has_output
                                && let Some(timing) = &timing
                            {
                                timing.output();
                            }
                            if let Some(context) = attempt.take() {
                                context.complete(state.completion(!valid_output)).await;
                            }
                            if !valid_output {
                                return if state.sse {
                                    let err_event = json!({"error":{"code":502,"status":"INTERNAL","message":"Upstream output did not satisfy the requested format or tool constraints"}});
                                    tail.extend_from_slice(
                                        format!("event: error\ndata: {err_event}\n\n").as_bytes(),
                                    );
                                    Some((
                                        Ok(Bytes::from(tail)),
                                        (upstream, state, attempt, true, timing),
                                    ))
                                } else {
                                    Some((
                                        Err(std::io::Error::other(
                                            "Upstream output did not satisfy the requested format or tool constraints",
                                        )),
                                        (upstream, state, attempt, true, timing),
                                    ))
                                };
                            }
                            if tail.is_empty() {
                                return None;
                            }
                            return Some((
                                Ok(Bytes::from(tail)),
                                (upstream, state, attempt, true, timing),
                            ));
                        }
                        Err(reason) => {
                            if let Some(context) = attempt.take() {
                                persist_stream_failure(
                                    context,
                                    niu_storage::RequestFailureKind::UpstreamInvalidResponse,
                                )
                                .await;
                            }
                            return if state.sse {
                                let err_event = json!({"error":{"code":502,"status":"INTERNAL","message":reason}});
                                Some((
                                    Ok(Bytes::from(format!("event: error\ndata: {err_event}\n\n"))),
                                    (upstream, state, attempt, true, timing),
                                ))
                            } else {
                                Some((
                                    Err(std::io::Error::other(reason)),
                                    (upstream, state, attempt, true, timing),
                                ))
                            };
                        }
                    },
                }
            }
        },
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn json_array_and_sse_streaming_account_tool_use_prompt_tokens() {
        let mut validator = GenerateContentOutputValidator::default();
        validator.tools.insert("lookup".into(), None);
        let mut state =
            GenerateContentStreamState::new("gemini-2.5-flash".into(), validator.clone(), false);
        let payload = json!([
            {
                "candidates": [{
                    "index": 0,
                    "content": {
                        "role": "model",
                        "parts": [
                            {"text": "thinking...", "thought": true, "thoughtSignature": "sig-1"},
                            {"functionCall": {"name": "lookup", "args": {"q": "niu"}}, "thoughtSignature": "sig-2"}
                        ]
                    },
                    "finishReason": "STOP"
                }],
                "usageMetadata": {
                    "promptTokenCount": 10,
                    "toolUsePromptTokenCount": 6,
                    "candidatesTokenCount": 4,
                    "thoughtsTokenCount": 2,
                    "totalTokenCount": 22
                },
                "modelVersion": "gemini-2.5-flash-001"
            }
        ]);
        let mut out = state.feed(payload.to_string().as_bytes()).unwrap();
        let (tail, valid) = state.finish_eof().unwrap();
        assert!(valid);
        out.extend_from_slice(&tail);
        let parsed: Value = serde_json::from_slice(&out).unwrap();
        assert_eq!(parsed[0]["modelVersion"], "gemini-2.5-flash");
        assert_eq!(
            parsed[0]["candidates"][0]["content"]["parts"][1]["thoughtSignature"],
            "sig-2"
        );
        let completion = state.completion(false);
        assert_eq!(completion.usage, Some((16, 6)));
        assert_eq!(
            completion.token_categories.unwrap().reasoning_output_tokens,
            Some(2)
        );
        assert_eq!(
            completion.finish_reasons.unwrap()[0].reason,
            niu_storage::RequestFinishReason::ToolCalls
        );

        let mut sse_state =
            GenerateContentStreamState::new("gemini-2.5-flash".into(), validator, true);
        let sse_wire = format!("data: {}\n\n", payload[0]);
        let sse_out = sse_state.feed(sse_wire.as_bytes()).unwrap();
        let (_, valid_sse) = sse_state.finish_eof().unwrap();
        assert!(valid_sse);
        assert!(String::from_utf8(sse_out).unwrap().contains("sig-2"));
    }
}
