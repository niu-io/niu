//! Bounded inspection of chat SSE frames. Wire bytes remain unchanged.
use crate::{admission::GatewayWrites, usage::UsageAttempt};
use axum::body::{Body, Bytes};
use futures_util::{Stream, StreamExt};
use niu_storage::TenantScope;
use serde_json::{Value, json};
use std::{
    io,
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
};
use uuid::Uuid;

const MAX_EVENT_BYTES: usize = 65_536;
const MAX_RESPONSES_EVENT_BYTES: usize = 16 * 1024 * 1024;

#[derive(Default)]
pub struct ChatEvidence {
    line: Vec<u8>,
    data: Vec<u8>,
    skip_lf: bool,
    first_line: bool,
    started: bool,
    event_bytes: usize,
    error_event: bool,
    pub done: bool,
    usage: Option<(u64, u64)>,
    ambiguous_usage: bool,
    provider_model: Option<String>,
    conflicting_provider_model: bool,
}

#[derive(Default)]
pub struct ResponsesEvidence {
    line: Vec<u8>,
    data: Vec<u8>,
    event_name: Vec<u8>,
    skip_lf: bool,
    event_bytes: usize,
    event_overflow: bool,
    discarding_line: bool,
    pub done: bool,
    pub failed: bool,
    usage: Option<(u64, u64)>,
    provider_model: Option<String>,
}

impl ResponsesEvidence {
    pub fn usage(&self) -> Option<(u64, u64)> {
        self.usage
    }

    pub fn provider_model(&self) -> Option<&str> {
        self.provider_model.as_deref()
    }

    pub fn feed(&mut self, bytes: &[u8]) {
        for &byte in bytes {
            if self.done {
                break;
            }
            if self.skip_lf {
                self.skip_lf = false;
                if byte == b'\n' {
                    continue;
                }
            }
            self.event_bytes = self.event_bytes.saturating_add(1);
            if self.event_bytes > MAX_RESPONSES_EVENT_BYTES {
                self.event_overflow = true;
                self.line.clear();
                self.data.clear();
                self.discarding_line = true;
            }
            if byte == b'\r' || byte == b'\n' {
                if self.discarding_line {
                    self.discarding_line = false;
                } else {
                    self.finish_line();
                }
                self.skip_lf = byte == b'\r';
            } else if !self.event_overflow {
                self.line.push(byte);
            }
        }
    }

    fn finish_line(&mut self) {
        let line = std::mem::take(&mut self.line);
        if line.is_empty() {
            let event_name = std::mem::take(&mut self.event_name);
            let explicit_terminal = matches!(
                event_name.as_slice(),
                b"response.completed" | b"response.incomplete"
            );
            let explicit_failure = matches!(event_name.as_slice(), b"response.failed" | b"error");
            if explicit_failure {
                self.failed = true;
            }
            if explicit_terminal && self.event_overflow {
                self.done = true;
            } else if !self.event_overflow && !self.data.is_empty() {
                self.data.pop();
                if self.data == b"[DONE]" {
                    // Responses streams normally carry an explicit terminal
                    // response event. A bare sentinel has no usage evidence.
                    self.done = false;
                } else if let Ok(value) = serde_json::from_slice::<Value>(&self.data)
                    && value.is_object()
                {
                    let event_type = value
                        .get("type")
                        .and_then(Value::as_str)
                        .unwrap_or_default();
                    if explicit_failure || matches!(event_type, "response.failed" | "error") {
                        self.failed = true;
                    }
                    let payload_terminal =
                        matches!(event_type, "response.completed" | "response.incomplete");
                    let event_matches_payload =
                        event_name.is_empty() || event_name.as_slice() == event_type.as_bytes();
                    if payload_terminal && event_matches_payload {
                        let response = value.get("response").unwrap_or(&value);
                        self.usage = response
                            .get("usage")
                            .and_then(|usage| {
                                usage["input_tokens"]
                                    .as_u64()
                                    .zip(usage["output_tokens"].as_u64())
                            })
                            .filter(|(input, output)| {
                                *input <= i64::MAX as u64 && *output <= i64::MAX as u64
                            });
                        self.provider_model = response
                            .get("model")
                            .and_then(Value::as_str)
                            .map(str::trim)
                            .filter(|model| {
                                !model.is_empty()
                                    && model.len() <= 200
                                    && model.chars().all(|character| !character.is_control())
                            })
                            .map(str::to_owned);
                        self.done = true;
                    }
                }
            }
            self.data.clear();
            self.event_bytes = 0;
            self.event_overflow = false;
            return;
        }
        if line.starts_with(b":") {
            return;
        }
        let split = line
            .iter()
            .position(|&byte| byte == b':')
            .unwrap_or(line.len());
        let field = &line[..split];
        let value = if split < line.len() {
            line[split + 1..]
                .strip_prefix(b" ")
                .unwrap_or(&line[split + 1..])
        } else {
            &[]
        };
        match field {
            b"event" => self.event_name = value.to_vec(),
            b"data" if !self.event_overflow => {
                self.data.extend_from_slice(value);
                self.data.push(b'\n');
            }
            _ => {}
        }
    }
}

impl ChatEvidence {
    pub fn usage(&self) -> Option<(u64, u64)> {
        if self.ambiguous_usage {
            None
        } else {
            self.usage
        }
    }

    pub fn provider_model(&self) -> Option<&str> {
        if self.conflicting_provider_model {
            None
        } else {
            self.provider_model.as_deref()
        }
    }

    pub fn feed(&mut self, bytes: &[u8]) -> Result<(), &'static str> {
        for &byte in bytes {
            if self.done {
                break;
            }
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
            if self.event_bytes > MAX_EVENT_BYTES {
                return Err("upstream SSE event exceeds inspection limit");
            }
            if byte == b'\r' || byte == b'\n' {
                self.finish_line()?;
                self.skip_lf = byte == b'\r';
            } else {
                self.line.push(byte);
            }
        }
        Ok(())
    }

    fn finish_line(&mut self) -> Result<(), &'static str> {
        let owned = std::mem::take(&mut self.line);
        let line = if self.first_line {
            owned.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(&owned)
        } else {
            &owned
        };
        self.first_line = false;
        if line.is_empty() {
            self.event_bytes = 0;
            if self.error_event {
                return Err("upstream returned an SSE error event");
            }
            if self.data.is_empty() {
                return Ok(());
            }
            self.data.pop(); // Remove the final newline appended to data fields.
            if self.data == b"[DONE]" {
                self.done = true;
                self.data.clear();
                return Ok(());
            }
            let value: Value =
                serde_json::from_slice(&self.data).map_err(|_| "invalid upstream SSE JSON")?;
            self.data.clear();
            if !value.is_object() || value.get("error").is_some() {
                return Err("invalid upstream chat event");
            }
            if let Some(model) = value
                .get("model")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|model| {
                    !model.is_empty()
                        && model.len() <= 200
                        && model.chars().all(|character| !character.is_control())
                })
            {
                match self.provider_model.as_deref() {
                    Some(previous) if previous != model => {
                        self.conflicting_provider_model = true;
                    }
                    None => self.provider_model = Some(model.to_owned()),
                    _ => {}
                }
            }
            if let Some(usage) = value.get("usage").filter(|v| !v.is_null()) {
                let observed = usage["prompt_tokens"]
                    .as_u64()
                    .zip(usage["completion_tokens"].as_u64())
                    .filter(|(a, b)| *a <= i64::MAX as u64 && *b <= i64::MAX as u64);
                match observed {
                    Some(current) if self.usage.is_none_or(|prior| prior == current) => {
                        self.usage = Some(current)
                    }
                    _ => self.ambiguous_usage = true,
                }
            }
            self.error_event = false;
        } else if !line.starts_with(b":") {
            let split = line.iter().position(|&b| b == b':').unwrap_or(line.len());
            let field = &line[..split];
            let value = if split < line.len() {
                &line[split + 1..]
            } else {
                &[]
            };
            let value = value.strip_prefix(b" ").unwrap_or(value);
            if field == b"data" {
                self.data.extend_from_slice(value);
                self.data.push(b'\n');
            }
            if field == b"event" {
                self.error_event = value == b"error";
            }
        }
        Ok(())
    }
}

pub struct StreamAttempt {
    pub gateway_writes: GatewayWrites,
    pub scope: TenantScope,
    pub id: Uuid,
    pub priced: bool,
    pub usage: UsageAttempt,
    pub failures: Arc<AtomicU64>,
}

/// Cancellation drops the upstream stream and leaves durable uncertainty.
/// Terminal usage evidence is queued after dispatch intent has been committed;
/// a priced request retains its durable budget hold until settlement finishes.
pub fn tracked_body<S>(upstream: S, attempt: StreamAttempt) -> Body
where
    S: Stream<Item = Result<Bytes, reqwest::Error>> + Send + 'static,
{
    let state = (
        Box::pin(upstream),
        ChatEvidence::default(),
        Some(attempt),
        false,
    );
    let stream = futures_util::stream::unfold(
        state,
        |(mut upstream, mut evidence, mut attempt, stopped)| async move {
            if stopped {
                return None;
            }
            let item = upstream.next().await;
            let mut stopped = false;
            let output = match item {
                Some(Ok(bytes)) => match evidence.feed(&bytes) {
                    Err(reason) => {
                        stopped = true;
                        Err(io::Error::other(reason))
                    }
                    Ok(()) => {
                        if evidence.done {
                            stopped = true;
                            let context = attempt.take().expect("active stream context");
                            let provider_model = evidence.provider_model().map(str::to_owned);
                            let usage = evidence.usage();
                            if context.priced {
                                if context
                                    .gateway_writes
                                    .complete_priced(crate::admission::PricedGatewayCompletion {
                                        scope: context.scope,
                                        attempt_id: context.id,
                                        usage,
                                        provider_model,
                                    })
                                    .await
                                    .is_err()
                                {
                                    tracing::error!(
                                        attempt_id = %context.id,
                                        "priced stream completion writer is unavailable; the durable reservation remains unresolved"
                                    );
                                }
                                if let Some((prompt, completion)) = usage {
                                    context.usage.report(&json!({"prompt_tokens": prompt, "completion_tokens": completion}));
                                }
                                Ok(bytes)
                            } else {
                                if context
                                    .gateway_writes
                                    .complete_unpriced(niu_storage::GatewayCompletion {
                                        scope: context.scope,
                                        attempt_id: context.id,
                                        usage,
                                        provider_model,
                                    })
                                    .await
                                    .is_err()
                                {
                                    tracing::error!(
                                        attempt_id = %context.id,
                                        "unpriced stream completion writer is unavailable; the durable request remains unresolved"
                                    );
                                }
                                if let Some((prompt, completion)) = usage {
                                    context.usage.report(&json!({"prompt_tokens": prompt, "completion_tokens": completion}));
                                }
                                Ok(bytes)
                            }
                        } else {
                            Ok(bytes)
                        }
                    }
                },
                Some(Err(_)) => {
                    stopped = true;
                    Err(io::Error::other("upstream stream interrupted"))
                }
                None => {
                    stopped = true;
                    Err(io::Error::other(
                        "upstream stream ended without a terminal event",
                    ))
                }
            };
            if output.is_err()
                && let Some(context) = attempt.take()
            {
                context.failures.fetch_add(1, Ordering::Relaxed);
            }
            Some((output, (upstream, evidence, attempt, stopped)))
        },
    );
    Body::from_stream(stream)
}

/// Passes Codex Responses SSE bytes unchanged and records only terminal usage
/// metadata. Dropping the downstream body cancels the upstream stream and
/// leaves the durable attempt unresolved.
pub fn tracked_responses_body<S>(upstream: S, attempt: StreamAttempt) -> Body
where
    S: Stream<Item = Result<Bytes, reqwest::Error>> + Send + 'static,
{
    let state = (
        Box::pin(upstream),
        ResponsesEvidence::default(),
        Some(attempt),
        false,
    );
    let stream = futures_util::stream::unfold(
        state,
        |(mut upstream, mut evidence, mut attempt, stopped)| async move {
            if stopped {
                return None;
            }
            let item = upstream.next().await;
            let mut stopped = false;
            let output = match item {
                Some(Ok(bytes)) => {
                    evidence.feed(&bytes);
                    if evidence.done {
                        stopped = true;
                        let context = attempt.take().expect("active Codex stream context");
                        let usage = evidence.usage();
                        if context
                            .gateway_writes
                            .complete_unpriced(niu_storage::GatewayCompletion {
                                scope: context.scope,
                                attempt_id: context.id,
                                usage,
                                provider_model: evidence.provider_model().map(str::to_owned),
                            })
                            .await
                            .is_err()
                        {
                            tracing::error!(
                                attempt_id = %context.id,
                                "Codex stream completion writer is unavailable; the durable request remains unresolved"
                            );
                        }
                        if let Some((prompt, completion)) = usage {
                            context.usage.report(&json!({
                                "prompt_tokens": prompt,
                                "completion_tokens": completion
                            }));
                        }
                    }
                    Ok(bytes)
                }
                Some(Err(_)) => {
                    stopped = true;
                    Err(io::Error::other("upstream Codex stream interrupted"))
                }
                None => {
                    stopped = true;
                    Err(io::Error::other(if evidence.failed {
                        "upstream Codex request failed"
                    } else {
                        "upstream Codex stream ended without a terminal event"
                    }))
                }
            };
            if output.is_err()
                && let Some(context) = attempt.take()
            {
                context.failures.fetch_add(1, Ordering::Relaxed);
            }
            Some((output, (upstream, evidence, attempt, stopped)))
        },
    );
    Body::from_stream(stream)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn fragmented_utf8_crlf_multiline_and_terminal_events() {
        let bytes = "\u{feff}: hello\r\ndata: {\r\ndata: \"choices\": [{\"delta\": {\"content\":\"你好\"}}]}\r\n\r\ndata: {\"usage\":{\"prompt_tokens\":2,\"completion_tokens\":1}}\r\n\r\ndata: [DONE]\r\n\r\n".as_bytes();
        for width in 1..=bytes.len() {
            let mut evidence = ChatEvidence::default();
            for chunk in bytes.chunks(width) {
                evidence.feed(chunk).unwrap();
            }
            assert!(evidence.done);
            assert_eq!(evidence.usage(), Some((2, 1)));
        }
    }
    #[test]
    fn conflicting_or_invalid_usage_is_unknown_not_zero() {
        for second in [
            r#"{"prompt_tokens":3,"completion_tokens":1}"#,
            r#"{"prompt_tokens":-1,"completion_tokens":1}"#,
        ] {
            let mut evidence = ChatEvidence::default();
            evidence.feed(format!("data: {{\"usage\":{{\"prompt_tokens\":2,\"completion_tokens\":1}}}}\n\ndata: {{\"usage\":{second}}}\n\ndata: [DONE]\n\n").as_bytes()).unwrap();
            assert!(evidence.done);
            assert_eq!(evidence.usage(), None);
        }
    }
    #[test]
    fn provider_model_is_retained_only_when_stream_identity_is_consistent() {
        let mut single = ChatEvidence::default();
        single
            .feed(b"data: {\"model\":\"provider-model-a\",\"choices\":[]}\n\n")
            .unwrap();
        assert_eq!(single.provider_model(), Some("provider-model-a"));

        let mut conflicting = ChatEvidence::default();
        conflicting
            .feed(b"data: {\"model\":\"provider-model-a\",\"choices\":[]}\n\ndata: {\"model\":\"provider-model-b\",\"choices\":[]}\n\n")
            .unwrap();
        assert_eq!(conflicting.provider_model(), None);

        let mut oversized = ChatEvidence::default();
        let value = format!(
            "data: {{\"model\":\"{}\",\"choices\":[]}}\n\n",
            "m".repeat(201)
        );
        oversized.feed(value.as_bytes()).unwrap();
        assert_eq!(oversized.provider_model(), None);
    }
    #[test]
    fn rejects_errors_and_bounds_memory_without_accepting_partial_terminal() {
        let mut partial = ChatEvidence::default();
        partial.feed(b"data: [DONE]\n").unwrap();
        assert!(!partial.done);
        assert!(
            ChatEvidence::default()
                .feed(b"event: error\ndata: {}\n\n")
                .is_err()
        );
        assert!(ChatEvidence::default().feed(b"data: {broken}\n\n").is_err());
        assert!(
            ChatEvidence::default()
                .feed(&vec![b'x'; MAX_EVENT_BYTES + 1])
                .is_err()
        );
    }

    #[test]
    fn codex_responses_captures_only_matching_terminal_usage_and_model() {
        let bytes = b"event: response.completed\r\ndata: {\"type\":\"response.completed\",\"response\":{\"model\":\"gpt-codex\",\"usage\":{\"input_tokens\":7,\"output_tokens\":3}}}\r\n\r\n";
        for width in 1..=bytes.len() {
            let mut evidence = ResponsesEvidence::default();
            for chunk in bytes.chunks(width) {
                evidence.feed(chunk);
            }
            assert!(evidence.done);
            assert_eq!(evidence.usage(), Some((7, 3)));
            assert_eq!(evidence.provider_model(), Some("gpt-codex"));
        }
    }

    #[test]
    fn codex_responses_does_not_complete_on_mismatched_terminal_event() {
        let mut evidence = ResponsesEvidence::default();
        evidence.feed(
            b"event: response.completed\ndata: {\"type\":\"response.failed\",\"response\":{\"usage\":{\"input_tokens\":7,\"output_tokens\":3}}}\n\n",
        );
        assert!(!evidence.done);
        assert_eq!(evidence.usage(), None);
    }
}
