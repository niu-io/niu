//! Native text SSE state machine. Output is projected, never passed through.
use super::{PendingStreamAttempt, StreamAttempt, StreamCompletion, persist_stream_failure};
use axum::body::{Body, Bytes};
use futures_util::{Stream, StreamExt};
use serde_json::{Value, json};

const USAGE_FIELDS: [&str; 4] = [
    "input_tokens",
    "output_tokens",
    "cache_creation_input_tokens",
    "cache_read_input_tokens",
];

struct Messages {
    public_model: String,
    provider_model: Option<String>,
    line: Vec<u8>,
    data: Vec<u8>,
    event: Option<String>,
    event_bytes: usize,
    skip_lf: bool,
    first_line: bool,
    started: bool,
    blocks: u64,
    active: bool,
    stop: Option<String>,
    counts: [Option<u64>; 4],
    invalid_usage: bool,
    done: bool,
    has_output: bool,
}

impl Messages {
    fn new(public_model: String) -> Self {
        Self {
            public_model,
            provider_model: None,
            line: vec![],
            data: vec![],
            event: None,
            event_bytes: 0,
            skip_lf: false,
            first_line: true,
            started: false,
            blocks: 0,
            active: false,
            stop: None,
            counts: [None; 4],
            invalid_usage: false,
            done: false,
            has_output: false,
        }
    }

    fn usage(&mut self, value: &Value) -> Value {
        let mut output = serde_json::Map::new();
        for (index, field) in USAGE_FIELDS.iter().enumerate() {
            if let Some(value) = value.get(field) {
                let next = value.as_u64().filter(|n| *n <= 9_007_199_254_740_991);
                if (!value.is_null() && next.is_none())
                    || self.counts[index]
                        .zip(next)
                        .is_some_and(|(old, new)| new < old)
                {
                    self.invalid_usage = true;
                }
                self.counts[index] = next;
                output.insert((*field).to_owned(), json!(next));
            }
        }
        Value::Object(output)
    }

    fn observe(&mut self, value: Value) -> Result<Value, &'static str> {
        let kind = value["type"].as_str().ok_or("Messages event has no type")?;
        if self.event.as_deref().is_some_and(|event| event != kind) {
            return Err("Messages event type mismatch");
        }
        match kind {
            "ping" => Ok(json!({"type":"ping"})),
            "message_start" if !self.started => {
                let message = &value["message"];
                let id = message["id"]
                    .as_str()
                    .filter(|s| !s.is_empty() && s.len() <= 200 && !s.chars().any(char::is_control))
                    .ok_or("Invalid Messages identity")?;
                let model = message["model"]
                    .as_str()
                    .filter(|s| !s.is_empty() && s.len() <= 200 && !s.chars().any(char::is_control))
                    .ok_or("Invalid Messages model")?;
                if message["type"] != "message"
                    || message["role"] != "assistant"
                    || message["content"].as_array().is_none_or(|a| !a.is_empty())
                    || !message["stop_reason"].is_null()
                {
                    return Err("Invalid Messages start");
                }
                self.started = true;
                self.provider_model = Some(model.to_owned());
                let usage = self.usage(&message["usage"]);
                Ok(
                    json!({"type":kind,"message":{"id":id,"type":"message","role":"assistant","model":self.public_model,"content":[],"stop_reason":null,"stop_sequence":null,"usage":usage}}),
                )
            }
            "content_block_start"
                if self.started && !self.active && self.stop.is_none() && self.blocks < 128 =>
            {
                if value["index"].as_u64() != Some(self.blocks)
                    || value["content_block"]["type"] != "text"
                    || !value["content_block"]["text"].is_string()
                    || value["content_block"]
                        .get("citations")
                        .is_some_and(|v| !v.is_null() && v.as_array().is_none_or(|a| !a.is_empty()))
                {
                    return Err("Unsupported Messages block");
                }
                self.active = true;
                self.has_output |= value["content_block"]["text"]
                    .as_str()
                    .is_some_and(|s| !s.is_empty());
                Ok(
                    json!({"type":kind,"index":self.blocks,"content_block":{"type":"text","text":value["content_block"]["text"]}}),
                )
            }
            "content_block_delta" if self.active && self.stop.is_none() => {
                if value["index"].as_u64() != Some(self.blocks)
                    || value["delta"]["type"] != "text_delta"
                    || !value["delta"]["text"].is_string()
                {
                    return Err("Unsupported Messages delta");
                }
                self.has_output |= value["delta"]["text"]
                    .as_str()
                    .is_some_and(|s| !s.is_empty());
                Ok(
                    json!({"type":kind,"index":self.blocks,"delta":{"type":"text_delta","text":value["delta"]["text"]}}),
                )
            }
            "content_block_stop" if self.active => {
                if value["index"].as_u64() != Some(self.blocks) {
                    return Err("Invalid Messages block order");
                }
                let index = self.blocks;
                self.blocks += 1;
                self.active = false;
                Ok(json!({"type":kind,"index":index}))
            }
            "message_delta" if self.started && !self.active && self.blocks > 0 => {
                let stop = value["delta"]["stop_reason"]
                    .as_str()
                    .filter(|s| ["end_turn", "max_tokens", "stop_sequence"].contains(s))
                    .ok_or("Invalid Messages finish reason")?;
                if self.stop.as_deref().is_some_and(|old| old != stop) {
                    return Err("Conflicting Messages finish reason");
                }
                let sequence = &value["delta"]["stop_sequence"];
                if !sequence.is_null() && sequence.as_str().is_none_or(|s| s.len() > 512) {
                    return Err("Invalid Messages stop sequence");
                }
                self.stop = Some(stop.to_owned());
                let usage = self.usage(&value["usage"]);
                Ok(
                    json!({"type":kind,"delta":{"stop_reason":stop,"stop_sequence":sequence},"usage":usage}),
                )
            }
            "message_stop" if self.started && !self.active && self.stop.is_some() => {
                self.done = true;
                Ok(json!({"type":kind}))
            }
            _ => Err("Unsupported or out-of-order Messages event"),
        }
    }

    fn feed(&mut self, bytes: &[u8]) -> Result<Vec<u8>, &'static str> {
        let mut output = Vec::new();
        for &byte in bytes {
            // Native message_stop is terminal. OpenRouter's extra [DONE] is not
            // forwarded and cannot supply additional billing evidence.
            if self.done {
                break;
            }
            if self.skip_lf {
                self.skip_lf = false;
                if byte == b'\n' {
                    continue;
                }
            }
            self.event_bytes += 1;
            if self.event_bytes > 65_536 {
                return Err("Messages event exceeds inspection limit");
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
            let line = std::str::from_utf8(raw).map_err(|_| "Invalid Messages UTF-8")?;
            if line.is_empty() {
                self.event_bytes = 0;
                if !self.data.is_empty() {
                    let value =
                        serde_json::from_slice(&self.data).map_err(|_| "Invalid Messages JSON")?;
                    let safe = self.observe(value)?;
                    output.extend_from_slice(
                        format!(
                            "event: {}\ndata: {}\n\n",
                            safe["type"].as_str().unwrap(),
                            safe
                        )
                        .as_bytes(),
                    );
                }
                self.data.clear();
                self.event = None;
            } else if let Some(data) = line.strip_prefix("data:") {
                if !self.data.is_empty() {
                    self.data.push(b'\n');
                }
                self.data
                    .extend_from_slice(data.strip_prefix(' ').unwrap_or(data).as_bytes());
            } else if let Some(event) = line.strip_prefix("event:") {
                if self.event.is_some() {
                    return Err("Duplicate Messages event field");
                }
                self.event = Some(event.trim().to_owned());
            }
        }
        Ok(output)
    }

    fn completion(&self) -> StreamCompletion {
        let usage = if self.invalid_usage {
            None
        } else {
            (|| {
                Some((
                    self.counts[0]?
                        .checked_add(self.counts[2]?)?
                        .checked_add(self.counts[3]?)?,
                    self.counts[1]?,
                ))
            })()
        };
        let token_categories = usage.map(|_| niu_storage::RequestTokenCategories {
            cached_input_tokens: self.counts[3].map(|v| v as i64),
            cache_write_input_tokens: self.counts[2].map(|v| v as i64),
            reasoning_output_tokens: None,
        });
        StreamCompletion {
            usage,
            token_categories,
            provider_model: self.provider_model.clone(),
            invalid_output: false,
            finish_reasons: Some(vec![niu_storage::RequestChoiceFinish {
                index: 0,
                reason: if self.stop.as_deref() == Some("max_tokens") {
                    niu_storage::RequestFinishReason::Length
                } else {
                    niu_storage::RequestFinishReason::Stop
                },
            }]),
        }
    }
}

pub fn tracked_messages_body<S>(upstream: S, attempt: StreamAttempt, public_model: String) -> Body
where
    S: Stream<Item = Result<Bytes, reqwest::Error>> + Send + 'static,
{
    let state = (
        Box::pin(upstream),
        Messages::new(public_model),
        PendingStreamAttempt(Some(attempt)),
        false,
        crate::request_timings::current(),
    );
    Body::from_stream(futures_util::stream::unfold(
        state,
        |(mut upstream, mut evidence, mut attempt, stopped, timing)| async move {
            if stopped {
                return None;
            }
            let result = match upstream.next().await {
                Some(Ok(bytes)) => evidence
                    .feed(&bytes)
                    .map_err(|_| niu_storage::RequestFailureKind::UpstreamInvalidResponse),
                Some(Err(error)) => Err(if error.is_timeout() {
                    niu_storage::RequestFailureKind::UpstreamTimeout
                } else {
                    niu_storage::RequestFailureKind::UpstreamTransportError
                }),
                None => Err(niu_storage::RequestFailureKind::UpstreamInvalidResponse),
            };
            let (bytes, stopped) = match result {
                Ok(bytes) => {
                    if evidence.has_output
                        && let Some(timing) = &timing
                    {
                        timing.output();
                    }
                    if evidence.done
                        && let Some(context) = attempt.take()
                    {
                        context.complete_observation(evidence.completion()).await;
                    }
                    (bytes, evidence.done)
                }
                Err(kind) => {
                    if let Some(context) = attempt.take() {
                        persist_stream_failure(context, kind).await;
                    }
                    (b"event: error\ndata: {\"type\":\"error\",\"error\":{\"type\":\"api_error\",\"message\":\"Upstream Messages stream did not complete safely\"}}\n\n".to_vec(),true)
                }
            };
            Some((
                Ok::<_, std::io::Error>(Bytes::from(bytes)),
                (upstream, evidence, attempt, stopped, timing),
            ))
        },
    ))
}
