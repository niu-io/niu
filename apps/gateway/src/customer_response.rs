//! Remove upstream commercial metadata before returning inference responses.
use serde_json::Value;

pub(crate) const MAX_STRUCTURED_RESPONSE_BYTES: usize = 16 * 1024 * 1024;

/// Responses terminal events repeat the complete response, unlike Chat deltas.
pub(crate) fn sse_event_limit(responses: bool) -> usize {
    if responses {
        MAX_STRUCTURED_RESPONSE_BYTES
    } else {
        65_536
    }
}

/// Token counts remain provider evidence. Supplier prices are never customer charges.
pub fn sanitize(value: &mut Value) -> bool {
    let mut changed = false;
    if let Some(object) = value.as_object_mut() {
        for key in ["cost", "cost_details", "upstream_inference_cost", "is_byok"] {
            changed |= object.remove(key).is_some();
        }
        if let Some(usage) = object.get_mut("usage") {
            changed |= sanitize_usage(usage);
        }
        if let Some(response) = object.get_mut("response") {
            changed |= sanitize(response);
        }
    }
    changed
}

/// Reapply the current commercial boundary to historical retained responses.
/// Incomplete or malformed structured content cannot be exposed as raw data.
pub fn sanitize_retained(content_type: &str, text: &str) -> Option<String> {
    match content_type
        .split(';')
        .next()?
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "application/json" => {
            let mut value: Value = serde_json::from_str(text).ok()?;
            if sanitize(&mut value) {
                Some(value.to_string())
            } else {
                Some(text.to_owned())
            }
        }
        "text/event-stream" => {
            // At EOF a CR is a complete line ending. The live parser holds it
            // for an optional LF; retained bodies have no next chunk to await.
            let terminal;
            let wire = if text.ends_with('\r') {
                terminal = format!("{text}\n");
                terminal.as_str()
            } else {
                text
            };
            let mut responses = false;
            let mut remaining = wire.as_bytes();
            while !remaining.is_empty() {
                let end = event_end(remaining)?;
                if end > MAX_STRUCTURED_RESPONSE_BYTES {
                    return None;
                }
                let frame = std::str::from_utf8(&remaining[..end]).ok()?;
                let data = frame
                    .trim_start_matches('\u{feff}')
                    .split(['\r', '\n'])
                    .filter_map(|line| line.strip_prefix("data:").map(str::trim_start))
                    .collect::<Vec<_>>()
                    .join("\n");
                if !data.is_empty() && data != "[DONE]" {
                    let value = serde_json::from_str::<Value>(&data).ok()?;
                    responses |= value
                        .get("type")
                        .and_then(Value::as_str)
                        .is_some_and(|kind| kind.starts_with("response."));
                }
                remaining = &remaining[end..];
            }
            let mut filter = CustomerSse::with_protocol(responses, None);
            let mut bytes = filter.feed(wire.as_bytes()).ok()?;
            bytes.extend(filter.finish_terminal().ok()?);
            String::from_utf8(bytes).ok()
        }
        "text/plain" => Some(text.to_owned()),
        _ => None,
    }
}

// Only usage metadata is traversed recursively. Generated JSON and tool arguments
// may legitimately contain cost fields and are never rewritten by this boundary.
fn sanitize_usage(value: &mut Value) -> bool {
    let mut changed = false;
    match value {
        Value::Object(object) => {
            for key in ["cost", "cost_details", "upstream_inference_cost", "is_byok"] {
                changed |= object.remove(key).is_some();
            }
            for nested in object.values_mut() {
                changed |= sanitize_usage(nested);
            }
        }
        Value::Array(values) => {
            for nested in values {
                changed |= sanitize_usage(nested);
            }
        }
        _ => {}
    }
    changed
}

#[derive(Default)]
pub struct CustomerSse {
    responses: bool,
    public_model: Option<String>,
    pending: Vec<u8>,
    boundary: EventBoundary,
    started: bool,
    done: bool,
}
impl CustomerSse {
    pub fn with_protocol(responses: bool, public_model: Option<String>) -> Self {
        Self {
            responses,
            public_model,
            ..Default::default()
        }
    }
    pub fn feed(&mut self, bytes: &[u8]) -> Result<Vec<u8>, &'static str> {
        if self.done {
            return Ok(Vec::new());
        }
        self.pending.extend_from_slice(bytes);
        let mut output = Vec::new();
        while let Some(end) = self.boundary.find(&self.pending) {
            if end > sse_event_limit(self.responses) {
                return Err("upstream SSE event exceeds inspection limit");
            }
            let frame: Vec<u8> = self.pending.drain(..end).collect();
            self.boundary = EventBoundary::default();
            let text = std::str::from_utf8(&frame).map_err(|_| "invalid upstream SSE UTF-8")?;
            let text = if self.started {
                text
            } else {
                self.started = true;
                text.strip_prefix('\u{feff}').unwrap_or(text)
            };
            let data = text
                .split(['\r', '\n'])
                .filter_map(|line| {
                    line.strip_prefix("data:")
                        .map(|s| s.strip_prefix(' ').unwrap_or(s))
                })
                .collect::<Vec<_>>()
                .join("\n");
            if data == "[DONE]" {
                output.extend_from_slice(&frame);
                self.done = true;
                self.pending.clear();
                break;
            }
            if data.is_empty() {
                output.extend_from_slice(&frame);
                continue;
            }
            let mut value =
                serde_json::from_str::<Value>(&data).map_err(|_| "invalid upstream SSE JSON")?;
            let terminal_response = matches!(
                value.get("type").and_then(Value::as_str),
                Some("response.completed" | "response.incomplete" | "response.failed")
            );
            if terminal_response {
                self.done = true;
                self.pending.clear();
            }
            let mut changed = sanitize(&mut value);
            if let Some(model) = &self.public_model
                && let Some(response) = value.get_mut("response").and_then(Value::as_object_mut)
                && response.contains_key("model")
            {
                response.insert("model".into(), Value::String(model.clone()));
                changed = true;
            }
            if changed {
                // Preserve event fields, comments and identifiers; replace only data.
                for line in text
                    .split(['\r', '\n'])
                    .filter(|line| !line.is_empty() && !line.starts_with("data:"))
                {
                    output.extend_from_slice(line.as_bytes());
                    output.push(b'\n');
                }
                output.extend_from_slice(b"data: ");
                output.extend_from_slice(value.to_string().as_bytes());
                output.extend_from_slice(b"\n\n");
                if terminal_response {
                    break;
                }
                continue;
            }
            output.extend_from_slice(&frame);
            if terminal_response {
                break;
            }
        }
        if self.pending.len() > sse_event_limit(self.responses) {
            return Err("upstream SSE event exceeds inspection limit");
        }
        Ok(output)
    }
    /// Evidence recognizes a blank CR line immediately. Complete its optional LF
    /// before the tracked body stops, rather than losing the terminal event.
    pub fn finish_terminal(&mut self) -> Result<Vec<u8>, &'static str> {
        if !self.done && self.pending.last() == Some(&b'\r') {
            self.feed(b"\n")
        } else {
            Ok(Vec::new())
        }
    }
}

// SSE permits LF, CR and CRLF independently on each line. A trailing CR is
// held until its optional LF arrives, preserving safe frames byte-for-byte.
fn event_end(bytes: &[u8]) -> Option<usize> {
    EventBoundary::default().find(bytes)
}

/// Resume at the previous chunk boundary instead of rescanning a large Responses
/// snapshot from its beginning for every transport chunk.
#[derive(Default)]
struct EventBoundary {
    line_start: usize,
    cursor: usize,
}

impl EventBoundary {
    fn find(&mut self, bytes: &[u8]) -> Option<usize> {
        while self.cursor < bytes.len() {
            match bytes[self.cursor] {
                b'\r' | b'\n' => {
                    if bytes[self.cursor] == b'\r' && self.cursor + 1 == bytes.len() {
                        return None;
                    }
                    let next = self.cursor
                        + if bytes[self.cursor] == b'\r'
                            && bytes.get(self.cursor + 1) == Some(&b'\n')
                        {
                            2
                        } else {
                            1
                        };
                    if self.cursor == self.line_start {
                        return Some(next);
                    }
                    self.line_start = next;
                    self.cursor = next;
                }
                _ => self.cursor += 1,
            }
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn keeps_token_evidence_and_user_content_without_supplier_costs() {
        let mut response = json!({"choices":[{"message":{"content":"cost_details is a field"}}],"usage":{"prompt_tokens":12,"completion_tokens":2,"cost":0.3,"cost_details":{"upstream_inference_cost":0.1},"is_byok":false,"prompt_tokens_details":{"cached_tokens":4}}});
        assert!(sanitize(&mut response));
        assert_eq!(response["usage"]["prompt_tokens"], 12);
        assert_eq!(
            response["usage"]["prompt_tokens_details"]["cached_tokens"],
            4
        );
        assert!(response["usage"].get("cost_details").is_none());
        assert!(response["usage"].get("cost").is_none());
        assert_eq!(
            response["choices"][0]["message"]["content"],
            "cost_details is a field"
        );
    }
    #[test]
    fn nested_usage_costs_are_removed_without_rewriting_generated_json() {
        let content =
            json!({"cost":123,"cost_details":{"upstream_inference_cost":456}}).to_string();
        let mut response = json!({
            "response":{"usage":{"completion_tokens":7,"completion_tokens_details":{"reasoning_tokens":3,"cost":0.1},"breakdown":[{"upstream_inference_cost":0.2,"tokens":4}]}},
            "choices":[{"message":{"content":content,"tool_calls":[{"function":{"arguments":content}}]}}]
        });
        assert!(sanitize(&mut response));
        assert_eq!(response["response"]["usage"]["completion_tokens"], 7);
        assert_eq!(
            response["response"]["usage"]["completion_tokens_details"],
            json!({"reasoning_tokens":3})
        );
        assert_eq!(
            response["response"]["usage"]["breakdown"],
            json!([{"tokens":4}])
        );
        assert_eq!(response["choices"][0]["message"]["content"], content);
        assert_eq!(
            response["choices"][0]["message"]["tool_calls"][0]["function"]["arguments"],
            content
        );
        assert!(!sanitize(&mut response));
    }
    #[test]
    fn retained_json_and_sse_apply_current_boundary_and_fail_closed() {
        let original = r#"{"usage":{"details":{"cost":123,"tokens":2}},"choices":[{"message":{"content":"cost is user text"}}]}"#;
        let cleaned = sanitize_retained("application/json; charset=utf-8", original).unwrap();
        assert!(!cleaned.contains("123"));
        assert!(cleaned.contains("cost is user text"));
        let wire = format!("data: {original}\n\ndata: [DONE]\n\n");
        let cleaned = sanitize_retained("text/event-stream", &wire).unwrap();
        assert!(!cleaned.contains("123"));
        assert!(cleaned.ends_with("data: [DONE]\n\n"));
        for (kind, text) in [
            ("application/json", "{invalid"),
            ("text/event-stream", "data: {invalid}\n\n"),
            ("text/event-stream", "data: {\"usage\":{\"cost\":123}"),
            ("application/octet-stream", "opaque"),
        ] {
            assert_eq!(sanitize_retained(kind, text), None);
        }
        assert_eq!(
            sanitize_retained("text/plain", "cost is user text"),
            Some("cost is user text".into())
        );
    }
    #[test]
    fn retained_stream_accepts_terminal_cr_without_accepting_incomplete_events() {
        let wire = "data: {\"usage\":{\"cost\":123,\"completion_tokens\":2}}\r\rdata: [DONE]\r\r";
        let cleaned = sanitize_retained("Text/Event-Stream; charset=utf-8", wire).unwrap();
        assert!(!cleaned.contains("123"));
        assert!(cleaned.contains("completion_tokens"));
        assert!(cleaned.contains("[DONE]"));
        assert_eq!(sanitize_retained("text/event-stream", "data: {}\r"), None);
        assert_eq!(
            sanitize_retained("text/event-stream", "data: {invalid}\r\r"),
            None
        );
        assert_eq!(
            sanitize_retained("Application/JSON", "{}"),
            Some("{}".into())
        );
    }
    #[test]
    fn fragmented_frames_strip_commercial_fields_and_preserve_safe_wire_bytes() {
        let safe = "data: {\"choices\":[{\"delta\":{\"content\":\"你好\"}}]}\r\n\r\n";
        let source = format!(
            "{safe}data: {{\"usage\":{{\"prompt_tokens\":12,\"completion_tokens\":2,\"completion_tokens_details\":{{\"reasoning_tokens\":1,\"cost\":0.5}},\"cost_details\":{{\"upstream_inference_cost\":1}}}}}}\r\n\r\ndata: [DONE]\r\n\r\n"
        );
        for width in 1..=source.len() {
            let mut filter = CustomerSse::default();
            let mut result = Vec::new();
            for chunk in source.as_bytes().chunks(width) {
                result.extend(filter.feed(chunk).unwrap());
            }
            let result = String::from_utf8(result).unwrap();
            assert!(result.starts_with(safe));
            assert!(result.ends_with("data: [DONE]\r\n\r\n"));
            assert!(!result.contains("cost_details"));
            assert!(!result.contains("\"cost\""));
            assert!(result.contains("reasoning_tokens"));
            assert!(result.contains("prompt_tokens"));
        }
    }
    #[test]
    fn first_event_bom_cannot_hide_supplier_commercial_fields() {
        let source = "\u{feff}data: {\"choices\":[{\"delta\":{\"content\":\"cost is user text\"}}],\"usage\":{\"prompt_tokens\":12,\"completion_tokens\":2,\"cost\":0.3,\"cost_details\":{\"upstream_inference_cost\":1}}}\r\n\r\ndata: [DONE]\r\n\r\n";
        for width in [1, 2, 3, 7, source.len()] {
            let mut filter = CustomerSse::default();
            let mut result = Vec::new();
            for fragment in source.as_bytes().chunks(width) {
                result.extend(filter.feed(fragment).unwrap());
            }
            let result = String::from_utf8(result).unwrap();
            assert!(!result.contains("upstream_inference_cost"));
            assert!(!result.contains("cost_details"));
            assert!(!result.contains("\"cost\":"));
            assert!(result.contains("prompt_tokens"));
            assert!(result.contains("cost is user text"));
            assert!(result.ends_with("data: [DONE]\r\n\r\n"));
        }
    }
    #[test]
    fn terminal_event_stops_customer_output_before_trailing_invalid_or_oversized_bytes() {
        let terminal = b"data: {\"choices\":[]}\n\ndata: [DONE]\n\n";
        let mut source = terminal.to_vec();
        source.extend_from_slice(b"data: \xff");
        source.extend(vec![b'x'; 65_537]);
        for width in [1, 3, 7, 64, source.len()] {
            let mut filter = CustomerSse::default();
            let mut result = Vec::new();
            for fragment in source.chunks(width) {
                result.extend(filter.feed(fragment).unwrap());
            }
            assert_eq!(result, terminal);
            assert!(filter.feed(b"data: late\n\n").unwrap().is_empty());
        }
    }
    #[test]
    fn malformed_live_data_cannot_bypass_commercial_inspection() {
        let invalid = b"data: {\"usage\":{\"cost_details\":\"private-fixture\"}\n\n";
        for width in [1, 3, invalid.len()] {
            let mut filter = CustomerSse::default();
            let mut output = Vec::new();
            let mut failed = false;
            for chunk in invalid.chunks(width) {
                match filter.feed(chunk) {
                    Ok(bytes) => output.extend(bytes),
                    Err(reason) => {
                        assert_eq!(reason, "invalid upstream SSE JSON");
                        failed = true;
                        break;
                    }
                }
            }
            assert!(failed);
            assert!(output.is_empty());
        }
        let keepalive = b": keepalive\n\nevent: ping\ndata:\n\n";
        assert_eq!(CustomerSse::default().feed(keepalive).unwrap(), keepalive);
    }
}
