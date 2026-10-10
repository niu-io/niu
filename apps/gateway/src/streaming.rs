//! Bounded Chat and Responses SSE inspection; customer output excludes supplier commercial metadata.
use crate::{admission::GatewayWrites, usage::UsageAttempt};
use axum::body::{Body, Bytes};
use futures_util::{Stream, StreamExt};
use niu_storage::TenantScope;
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, BTreeSet},
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
    responses: bool,
    line: Vec<u8>,
    data: Vec<u8>,
    skip_lf: bool,
    first_line: bool,
    started: bool,
    event_bytes: usize,
    error_event: bool,
    pub done: bool,
    has_output: bool,
    usage: Option<(u64, u64)>,
    ambiguous_usage: bool,
    token_categories: Option<niu_storage::RequestTokenCategories>,
    categories_seen: bool,
    ambiguous_categories: bool,
    provider_model: Option<String>,
    conflicting_provider_model: bool,
    finish_choices: BTreeMap<u32, Option<niu_storage::RequestFinishReason>>,
    ambiguous_finish: bool,
}

impl ChatEvidence {
    fn observe_response_event(&mut self, value: &Value) -> Result<(), &'static str> {
        let kind = value
            .get("type")
            .and_then(Value::as_str)
            .ok_or("Responses event has no type")?;
        if matches!(kind, "error" | "response.failed") {
            return Err("upstream returned a Responses error event");
        }
        if matches!(
            kind,
            "response.output_text.delta" | "response.refusal.delta"
        ) {
            let delta = value
                .get("delta")
                .and_then(Value::as_str)
                .ok_or("invalid Responses output delta")?;
            self.has_output |= !delta.is_empty();
        }
        if !matches!(kind, "response.completed" | "response.incomplete") {
            return Ok(());
        }
        let response = &value["response"];
        let status = if kind == "response.completed" {
            "completed"
        } else {
            "incomplete"
        };
        if response["object"] != "response"
            || response["status"] != status
            || response["id"]
                .as_str()
                .is_none_or(|id| id.trim().is_empty())
            || response.get("error").is_some_and(|error| !error.is_null())
            || !response.get("output").is_some_and(Value::is_array)
        {
            return Err("invalid Responses terminal envelope");
        }
        let usage = &response["usage"];
        self.usage = usage["input_tokens"]
            .as_u64()
            .zip(usage["output_tokens"].as_u64())
            .filter(|(a, b)| *a <= i64::MAX as u64 && *b <= i64::MAX as u64)
            .filter(|(a, b)| {
                usage
                    .get("total_tokens")
                    .is_none_or(|v| a.checked_add(*b) == v.as_u64())
            });
        self.token_categories = self.usage.and_then(|totals| {
            niu_storage::RequestTokenCategories::from_responses_usage(usage, totals)
        });
        self.provider_model = response["model"]
            .as_str()
            .map(str::trim)
            .filter(|v| !v.is_empty() && v.len() <= 200 && !v.chars().any(char::is_control))
            .map(str::to_owned);
        if let Some(choices) = niu_storage::RequestChoiceFinish::from_responses_response(response) {
            for choice in choices {
                self.finish_choices
                    .insert(choice.index, Some(choice.reason));
            }
        }
        self.done = true;
        Ok(())
    }

    pub fn finish_reasons(&self) -> Option<Vec<niu_storage::RequestChoiceFinish>> {
        if !self.done || self.ambiguous_finish || self.finish_choices.is_empty() {
            return None;
        }
        self.finish_choices
            .iter()
            .map(|(&index, &reason)| {
                Some(niu_storage::RequestChoiceFinish {
                    index,
                    reason: reason?,
                })
            })
            .collect()
    }

    fn observe_finish_reasons(&mut self, value: &Value) {
        let Some(choices) = value.get("choices") else {
            return;
        };
        let Some(choices) = choices.as_array() else {
            self.ambiguous_finish = true;
            return;
        };
        if choices.len() > 128 {
            self.ambiguous_finish = true;
            return;
        }
        let mut event_indexes = BTreeSet::new();
        for choice in choices {
            let Some(index) = choice
                .get("index")
                .and_then(Value::as_u64)
                .and_then(|v| u32::try_from(v).ok())
            else {
                self.ambiguous_finish = true;
                continue;
            };
            if !event_indexes.insert(index) {
                self.ambiguous_finish = true;
            }
            if !self.finish_choices.contains_key(&index) && self.finish_choices.len() >= 128 {
                self.ambiguous_finish = true;
                continue;
            }
            let previous = self.finish_choices.entry(index).or_insert(None);
            let delta = &choice["delta"];
            let new_output = ["content", "reasoning", "reasoning_content", "refusal"]
                .iter()
                .any(|field| {
                    delta[*field]
                        .as_str()
                        .is_some_and(|value| !value.is_empty())
                })
                || delta["tool_calls"]
                    .as_array()
                    .is_some_and(|calls| !calls.is_empty())
                || delta["function_call"]
                    .as_object()
                    .is_some_and(|call| !call.is_empty());
            if previous.is_some() && new_output {
                self.ambiguous_finish = true;
            }
            if let Some(reason) = choice.get("finish_reason").filter(|v| !v.is_null()) {
                match serde_json::from_value::<niu_storage::RequestFinishReason>(reason.clone()) {
                    Ok(reason) if previous.is_none_or(|prior| prior == reason) => {
                        *previous = Some(reason)
                    }
                    _ => self.ambiguous_finish = true,
                }
            }
        }
    }

    pub fn token_categories(&self) -> Option<niu_storage::RequestTokenCategories> {
        if self.ambiguous_usage || self.ambiguous_categories {
            None
        } else {
            self.token_categories
        }
    }
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
                if self.responses {
                    return Err("Responses stream ended without a response terminal event");
                }
                self.done = true;
                self.data.clear();
                return Ok(());
            }
            let value: Value =
                serde_json::from_slice(&self.data).map_err(|_| "invalid upstream SSE JSON")?;
            self.data.clear();
            if self.responses {
                return self.observe_response_event(&value);
            }
            if !value.is_object() || value.get("error").is_some() {
                return Err("invalid upstream chat event");
            }
            if let Some(reported) = value.get("model") {
                match reported.as_str().map(str::trim).filter(|model| {
                    !model.is_empty()
                        && model.len() <= 200
                        && model.chars().all(|character| !character.is_control())
                }) {
                    Some(model) => match self.provider_model.as_deref() {
                        Some(previous) if previous != model => {
                            self.conflicting_provider_model = true;
                        }
                        None => self.provider_model = Some(model.to_owned()),
                        _ => {}
                    },
                    None => {
                        self.conflicting_provider_model = true;
                    }
                }
            }
            if let Some(usage) = value.get("usage").filter(|v| !v.is_null()) {
                let observed = usage["prompt_tokens"]
                    .as_u64()
                    .zip(usage["completion_tokens"].as_u64())
                    .filter(|(a, b)| *a <= i64::MAX as u64 && *b <= i64::MAX as u64)
                    .filter(|(a, b)| {
                        usage.get("total_tokens").is_none_or(|reported| {
                            a.checked_add(*b)
                                .is_some_and(|total| reported.as_u64() == Some(total))
                        })
                    });
                match observed {
                    Some(current) if self.usage.is_none_or(|prior| prior == current) => {
                        self.usage = Some(current);
                        let categories =
                            niu_storage::RequestTokenCategories::from_openai_usage(usage, current);
                        if self.categories_seen && self.token_categories != categories {
                            self.ambiguous_categories = true;
                        }
                        self.categories_seen = true;
                        self.token_categories = categories;
                    }
                    _ => self.ambiguous_usage = true,
                }
            }
            self.observe_finish_reasons(&value);
            self.has_output |=
                value
                    .get("choices")
                    .and_then(Value::as_array)
                    .is_some_and(|choices| {
                        choices.iter().any(|choice| {
                            let delta = &choice["delta"];
                            ["content", "reasoning", "reasoning_content", "refusal"]
                                .iter()
                                .any(|field| delta[*field].as_str().is_some_and(|v| !v.is_empty()))
                                || delta["tool_calls"]
                                    .as_array()
                                    .is_some_and(|v| !v.is_empty())
                        })
                    });
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
    pub store: niu_storage::Store,
    pub gateway_writes: GatewayWrites,
    pub scope: TenantScope,
    pub id: Uuid,
    pub priced: bool,
    pub usage: UsageAttempt,
    pub failures: Arc<AtomicU64>,
}

async fn persist_stream_failure(context: StreamAttempt, kind: niu_storage::RequestFailureKind) {
    context.failures.fetch_add(1, Ordering::Relaxed);
    if context
        .store
        .save_request_failure(
            context.scope,
            context.id,
            niu_storage::RequestFailure {
                kind,
                upstream_http_status: None,
            },
        )
        .await
        .is_err()
    {
        tracing::error!(attempt_id = %context.id, "stream failure observation could not be saved");
    }
}

/// Cancellation drops the upstream stream and leaves durable uncertainty.
/// Terminal usage evidence is queued after dispatch intent has been committed;
/// a priced request retains its durable budget hold until settlement finishes.
pub fn tracked_body<S>(upstream: S, attempt: StreamAttempt) -> Body
where
    S: Stream<Item = Result<Bytes, reqwest::Error>> + Send + 'static,
{
    tracked_protocol_body(upstream, attempt, false, None)
}

pub fn tracked_responses_body<S>(upstream: S, attempt: StreamAttempt, public_model: String) -> Body
where
    S: Stream<Item = Result<Bytes, reqwest::Error>> + Send + 'static,
{
    tracked_protocol_body(upstream, attempt, true, Some(public_model))
}

fn tracked_protocol_body<S>(
    upstream: S,
    attempt: StreamAttempt,
    responses: bool,
    public_model: Option<String>,
) -> Body
where
    S: Stream<Item = Result<Bytes, reqwest::Error>> + Send + 'static,
{
    let state = (
        Box::pin(upstream),
        ChatEvidence {
            responses,
            ..Default::default()
        },
        crate::customer_response::CustomerSse::with_public_model(public_model),
        Some(attempt),
        false,
    );
    let timing = crate::request_timings::current();
    let stream = futures_util::stream::unfold(
        (state, timing),
        |((mut upstream, mut evidence, mut customer_output, mut attempt, stopped), timing)| async move {
            if stopped {
                return None;
            }
            let item = upstream.next().await;
            let mut stopped = false;
            let mut failure_kind = niu_storage::RequestFailureKind::UpstreamInvalidResponse;
            let output = match item {
                Some(Ok(bytes)) => match evidence.feed(&bytes) {
                    Err(reason) => {
                        stopped = true;
                        Err(io::Error::other(reason))
                    }
                    Ok(()) => {
                        if evidence.has_output
                            && let Some(timing) = &timing
                        {
                            timing.output();
                        }
                        let bytes = match customer_output.feed(&bytes) {
                            Ok(mut bytes) => {
                                if evidence.done {
                                    match customer_output.finish_terminal() {
                                        Ok(tail) => bytes.extend(tail),
                                        Err(reason) => {
                                            if let Some(context) = attempt.take() {
                                                persist_stream_failure(context, failure_kind).await;
                                            }
                                            return Some((
                                                Err(io::Error::other(reason)),
                                                (
                                                    (
                                                        upstream,
                                                        evidence,
                                                        customer_output,
                                                        attempt,
                                                        true,
                                                    ),
                                                    timing,
                                                ),
                                            ));
                                        }
                                    }
                                }
                                Bytes::from(bytes)
                            }
                            Err(reason) => {
                                if let Some(context) = attempt.take() {
                                    persist_stream_failure(context, failure_kind).await;
                                }
                                return Some((
                                    Err(io::Error::other(reason)),
                                    ((upstream, evidence, customer_output, attempt, true), timing),
                                ));
                            }
                        };
                        if evidence.done {
                            stopped = true;
                            let context = attempt.take().expect("active stream context");
                            let provider_model = evidence.provider_model().map(str::to_owned);
                            let usage = evidence.usage();
                            if context.priced {
                                if context
                                    .gateway_writes
                                    .complete_priced(crate::admission::PricedGatewayCompletion {
                                        token_categories: evidence.token_categories(),
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
                                if let Some(choices) = evidence.finish_reasons()
                                    && context
                                        .store
                                        .save_request_finish_reasons(
                                            context.scope,
                                            context.id,
                                            choices,
                                        )
                                        .await
                                        .is_err()
                                {
                                    tracing::error!(attempt_id = %context.id, "stream finish-reason observation could not be saved");
                                }
                                if let Some((prompt, completion)) = usage {
                                    context.usage.report(&json!({"prompt_tokens": prompt, "completion_tokens": completion}));
                                }
                                Ok(bytes)
                            } else {
                                if context
                                    .gateway_writes
                                    .complete_unpriced(niu_storage::GatewayCompletion {
                                        token_categories: evidence.token_categories(),
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
                                if let Some(choices) = evidence.finish_reasons()
                                    && context
                                        .store
                                        .save_request_finish_reasons(
                                            context.scope,
                                            context.id,
                                            choices,
                                        )
                                        .await
                                        .is_err()
                                {
                                    tracing::error!(attempt_id = %context.id, "stream finish-reason observation could not be saved");
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
                Some(Err(error)) => {
                    failure_kind = if error.is_timeout() {
                        niu_storage::RequestFailureKind::UpstreamTimeout
                    } else {
                        niu_storage::RequestFailureKind::UpstreamTransportError
                    };
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
                persist_stream_failure(context, failure_kind).await;
            }
            Some((
                output,
                (
                    (upstream, evidence, customer_output, attempt, stopped),
                    timing,
                ),
            ))
        },
    );
    Body::from_stream(stream)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn output_after_a_choice_finish_invalidates_only_finish_evidence() {
        for delta in [
            json!({"content":"late text"}),
            json!({"reasoning_content":"late reasoning"}),
            json!({"refusal":"late refusal"}),
            json!({"tool_calls":[{"index":0}]}),
            json!({"function_call":{"arguments":"{}"}}),
        ] {
            let source = format!(
                "data: {}\n\ndata: {}\n\ndata: {}\n\ndata: [DONE]\n\n",
                json!({"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}),
                json!({"choices":[{"index":0,"delta":delta,"finish_reason":null}]}),
                json!({"choices":[],"usage":{"prompt_tokens":2,"completion_tokens":1}})
            );
            for width in 1..=source.len() {
                let mut evidence = ChatEvidence::default();
                for chunk in source.as_bytes().chunks(width) {
                    evidence.feed(chunk).unwrap();
                }
                assert!(evidence.done);
                assert_eq!(evidence.finish_reasons(), None);
                assert_eq!(evidence.usage(), Some((2, 1)));
            }
        }
        let source = b"data: {\"choices\":[{\"index\":0,\"finish_reason\":\"stop\"}]}\n\ndata: {\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n\n";
        let mut evidence = ChatEvidence::default();
        evidence.feed(source).unwrap();
        assert_eq!(
            evidence.finish_reasons().unwrap()[0].reason,
            niu_storage::RequestFinishReason::Stop
        );
    }

    #[test]
    fn finish_reasons_require_terminal_complete_consistent_choices() {
        let source = concat!(
            "data: {\"choices\":[{\"index\":1,\"delta\":{\"content\":\"private\"},\"finish_reason\":null},{\"index\":0,\"delta\":{},\"finish_reason\":null}]}\n\n",
            "data: {\"choices\":[{\"index\":0,\"finish_reason\":\"stop\"}]}\n\n",
            "data: {\"choices\":[{\"index\":1,\"finish_reason\":\"length\"}]}\n\n",
            "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":2,\"completion_tokens\":1}}\n\n",
            "data: [DONE]\n\n"
        );
        for width in 1..=source.len() {
            let mut evidence = ChatEvidence::default();
            for chunk in source.as_bytes().chunks(width) {
                evidence.feed(chunk).unwrap();
            }
            assert_eq!(
                evidence.finish_reasons(),
                Some(vec![
                    niu_storage::RequestChoiceFinish {
                        index: 0,
                        reason: niu_storage::RequestFinishReason::Stop
                    },
                    niu_storage::RequestChoiceFinish {
                        index: 1,
                        reason: niu_storage::RequestFinishReason::Length
                    },
                ])
            );
            assert!(
                !serde_json::to_string(&evidence.finish_reasons())
                    .unwrap()
                    .contains("private")
            );
        }
        for choices in [
            json!([{"index":0,"finish_reason":null}]),
            json!([{"index":0,"finish_reason":"arbitrary-private-reason"}]),
            json!([{"index":0,"finish_reason":"stop"},{"index":0,"finish_reason":"stop"}]),
            json!([{"index":1,"finish_reason":null}]),
            json!([{"finish_reason":"stop"}]),
        ] {
            let mut evidence = ChatEvidence::default();
            evidence
                .feed(b"data: {\"choices\":[{\"index\":0,\"finish_reason\":null}]}\n\n")
                .unwrap();
            evidence
                .feed(format!("data: {}\n\n", json!({"choices":choices})).as_bytes())
                .unwrap();
            evidence.feed(b"data: [DONE]\n\n").unwrap();
            assert_eq!(evidence.finish_reasons(), None);
        }
        let mut evidence = ChatEvidence::default();
        evidence
            .feed(b"data: {\"choices\":[{\"index\":0,\"finish_reason\":\"stop\"}]}\n\n")
            .unwrap();
        assert_eq!(evidence.finish_reasons(), None);
        evidence.feed(b"data: {\"choices\":[{\"index\":0,\"finish_reason\":\"length\"}]}\n\ndata: [DONE]\n\n").unwrap();
        assert_eq!(evidence.finish_reasons(), None);
    }
    #[test]
    fn customer_terminal_delivery_matches_evidence_across_line_endings() {
        for line in ["\n", "\r", "\r\n"] {
            for blank in ["\n", "\r", "\r\n"] {
                // Adjacent CR + LF is one line ending, not a blank line.
                if line == "\r" && blank == "\n" {
                    continue;
                }
                let source = format!(
                    "data: {{\"usage\":{{\"prompt_tokens\":2,\"completion_tokens\":1,\"cost_details\":{{\"upstream_inference_cost\":1}}}}}}{line}{blank}data: [DONE]{line}{blank}"
                );
                for width in 1..=source.len() {
                    let mut evidence = ChatEvidence::default();
                    let mut customer = crate::customer_response::CustomerSse::default();
                    let mut output = Vec::new();
                    for chunk in source.as_bytes().chunks(width) {
                        evidence.feed(chunk).unwrap();
                        output.extend(customer.feed(chunk).unwrap());
                        if evidence.done {
                            output.extend(customer.finish_terminal().unwrap());
                            break;
                        }
                    }
                    assert!(evidence.done);
                    assert_eq!(evidence.usage(), Some((2, 1)));
                    let output = String::from_utf8(output).unwrap();
                    assert!(
                        output.contains("data: [DONE]"),
                        "{line:?}/{blank:?}, width {width}"
                    );
                    assert!(!output.contains("cost_details"));
                }
            }
        }
    }
    #[test]
    fn first_output_excludes_role_usage_and_keepalive_events() {
        let mut evidence = ChatEvidence::default();
        evidence.feed(b": keepalive\n\ndata: {\"choices\":[{\"delta\":{\"role\":\"assistant\",\"content\":\"\"}}]}\n\ndata: {\"usage\":{\"prompt_tokens\":1,\"completion_tokens\":0}}\n\n").unwrap();
        assert!(!evidence.has_output);
        let output = b"data: {\"choices\":[{\"delta\":{\"content\":\"Hi\"}}]}\n\n";
        for byte in &output[..output.len() - 1] {
            evidence.feed(&[*byte]).unwrap();
        }
        assert!(!evidence.has_output);
        evidence.feed(&output[output.len() - 1..]).unwrap();
        assert!(evidence.has_output);
    }
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
            r#"{"prompt_tokens":2,"completion_tokens":1,"total_tokens":4}"#,
            r#"{"prompt_tokens":2,"completion_tokens":1,"total_tokens":null}"#,
            r#"{"prompt_tokens":2,"completion_tokens":1,"total_tokens":"3"}"#,
            r#"{"prompt_tokens":2,"completion_tokens":1,"total_tokens":-1}"#,
            r#"{"prompt_tokens":2,"completion_tokens":1,"total_tokens":3.5}"#,
        ] {
            let mut evidence = ChatEvidence::default();
            evidence.feed(format!("data: {{\"usage\":{{\"prompt_tokens\":2,\"completion_tokens\":1}}}}\n\ndata: {{\"usage\":{second}}}\n\ndata: [DONE]\n\n").as_bytes()).unwrap();
            assert!(evidence.done);
            assert_eq!(evidence.usage(), None);
            assert_eq!(evidence.token_categories(), None);
        }
    }
    #[test]
    fn category_evidence_survives_fragmentation_and_conflicts_remain_unknown() {
        let event = r#"{"usage":{"prompt_tokens":2,"completion_tokens":1,"total_tokens":3,"prompt_tokens_details":{"cached_tokens":1},"completion_tokens_details":{"reasoning_tokens":0}}}"#;
        let bytes = format!("data: {event}\n\ndata: [DONE]\n\n");
        for width in 1..=bytes.len() {
            let mut evidence = ChatEvidence::default();
            for chunk in bytes.as_bytes().chunks(width) {
                evidence.feed(chunk).unwrap();
            }
            assert!(evidence.done);
            assert_eq!(
                evidence.token_categories(),
                Some(niu_storage::RequestTokenCategories {
                    cached_input_tokens: Some(1),
                    reasoning_output_tokens: Some(0)
                })
            );
        }
        for second in [
            r#"{"usage":{"prompt_tokens":2,"completion_tokens":1,"prompt_tokens_details":{"cached_tokens":2}}}"#,
            r#"{"usage":{"prompt_tokens":3,"completion_tokens":1,"prompt_tokens_details":{"cached_tokens":1}}}"#,
            r#"{"usage":{"prompt_tokens":2,"completion_tokens":1}}"#,
            r#"{"usage":{"prompt_tokens":2,"completion_tokens":1,"prompt_tokens_details":{"cached_tokens":-1}}}"#,
        ] {
            let mut evidence = ChatEvidence::default();
            evidence
                .feed(format!("data: {event}\n\ndata: {second}\n\ndata: [DONE]\n\n").as_bytes())
                .unwrap();
            assert!(evidence.done);
            assert_eq!(evidence.token_categories(), None);
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
    fn malformed_stream_identity_cannot_be_hidden_by_an_earlier_or_later_valid_name() {
        let valid = json!({"model":"provider-model-a","choices":[]});
        for model in [
            json!(null),
            json!(42),
            json!({"name":"provider-model-a"}),
            json!(""),
            json!("bad\nmodel"),
            json!("m".repeat(201)),
        ] {
            let invalid = json!({"model":model,"choices":[]});
            for events in [[&valid, &invalid], [&invalid, &valid]] {
                let wire = format!(
                    "data: {}\n\ndata: {}\n\ndata: {{\"usage\":{{\"prompt_tokens\":2,\"completion_tokens\":1,\"total_tokens\":3}}}}\n\ndata: [DONE]\n\n",
                    events[0], events[1]
                );
                let mut evidence = ChatEvidence::default();
                for fragment in wire.as_bytes().chunks(3) {
                    evidence.feed(fragment).unwrap();
                }
                assert!(evidence.done);
                assert_eq!(evidence.provider_model(), None);
                assert_eq!(evidence.usage(), Some((2, 1)));
            }
        }
        let mut absent = ChatEvidence::default();
        absent
            .feed(
                format!("data: {valid}\n\ndata: {{\"choices\":[]}}\n\ndata: [DONE]\n\n").as_bytes(),
            )
            .unwrap();
        assert_eq!(absent.provider_model(), Some("provider-model-a"));
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
