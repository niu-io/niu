//! Bounded inspection of chat SSE frames. Wire bytes remain unchanged.
use crate::usage::UsageAttempt;
use axum::body::{Body, Bytes};
use futures_util::{Stream, StreamExt};
use niu_storage::{Store, TenantScope};
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
}

impl ChatEvidence {
    pub fn usage(&self) -> Option<(u64, u64)> {
        if self.ambiguous_usage {
            None
        } else {
            self.usage
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
    pub store: Store,
    pub scope: TenantScope,
    pub id: Uuid,
    pub usage: UsageAttempt,
    pub failures: Arc<AtomicU64>,
}

/// Cancellation drops the upstream stream and leaves durable uncertainty. A
/// terminal event commits execution evidence before its bytes reach the client.
/// Financial settlement is intentionally separate.
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
                            match context
                                .store
                                .complete_and_settle(context.scope, context.id, evidence.usage())
                                .await
                            {
                                Ok(()) => {
                                    if let Some((prompt, completion)) = evidence.usage() {
                                        context.usage.report(&json!({"prompt_tokens": prompt, "completion_tokens": completion}));
                                    }
                                    Ok(bytes)
                                }
                                Err(_) => {
                                    context.failures.fetch_add(1, Ordering::Relaxed);
                                    Err(io::Error::other("unable to persist stream completion"))
                                }
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
            if output.is_err() {
                if let Some(context) = attempt.take() {
                    context.failures.fetch_add(1, Ordering::Relaxed);
                }
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
}
