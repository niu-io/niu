//! Bounded local text inspection. Protocol extraction and dispatch integration are separate.
use regex::{Regex, RegexBuilder};

#[derive(Debug, PartialEq, Eq, Clone, Copy, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Action {
    Block,
    Redact,
}

pub struct TextRule {
    expression: Regex,
    action: Action,
}

#[derive(Debug, PartialEq, Eq, Clone, Copy, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Protocol {
    Chat,
    Messages,
    Responses,
    Embeddings,
    VideoText,
}

#[derive(Debug, PartialEq, Eq, Clone, serde::Deserialize, serde::Serialize)]
#[serde(deny_unknown_fields)]
pub struct RuleConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pattern: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preset: Option<Preset>,
    pub action: Action,
}

/// Compile the effective rule set together so an optional redaction can never
/// conceal original text from a mandatory block rule. No content is logged.
pub struct CompiledInputPolicy {
    rules: Vec<TextRule>,
}

impl CompiledInputPolicy {
    /// Video text extraction only; media coverage and dispatch integration are
    /// separate. Reuses the same original-text block/redaction composition.
    pub fn inspect_video_text(
        &self,
        body: &serde_json::Value,
    ) -> Result<serde_json::Value, InspectionError> {
        let content = body
            .get("content")
            .and_then(serde_json::Value::as_array)
            .filter(|items| !items.is_empty())
            .ok_or(InspectionError::UnsupportedContent)?;
        if content.len() > 32 {
            return Err(InspectionError::ResourceLimit);
        }
        let mut total_bytes = 0usize;
        let mut messages = Vec::with_capacity(content.len());
        for item in content {
            let object = item
                .as_object()
                .ok_or(InspectionError::UnsupportedContent)?;
            if object
                .keys()
                .any(|key| !["type", "text", "role"].contains(&key.as_str()))
                || item.get("type").and_then(serde_json::Value::as_str) != Some("text")
            {
                return Err(InspectionError::UnsupportedContent);
            }
            let text = item
                .get("text")
                .and_then(serde_json::Value::as_str)
                .ok_or(InspectionError::UnsupportedContent)?;
            total_bytes = total_bytes
                .checked_add(text.len())
                .filter(|size| *size <= 65_536)
                .ok_or(InspectionError::ResourceLimit)?;
            messages.push(serde_json::json!({"role":"user","content":text}));
        }
        let inspected = inspect_chat(&serde_json::json!({"messages":messages}), &self.rules)?;
        let mut output = body.clone();
        for (index, item) in output["content"]
            .as_array_mut()
            .unwrap()
            .iter_mut()
            .enumerate()
        {
            item["text"] = inspected["messages"][index]["content"].clone();
        }
        Ok(output)
    }

    pub fn compile(configs: &[RuleConfig]) -> Result<Self, InspectionError> {
        if configs.len() > 32 {
            return Err(InspectionError::ResourceLimit);
        }
        let rules = configs
            .iter()
            .map(|config| {
                let pattern = match (&config.pattern, config.preset) {
                    (Some(pattern), None) => pattern.as_str(),
                    (None, Some(preset)) => preset.pattern(),
                    _ => return Err(InspectionError::InvalidPattern),
                };
                TextRule::compile(pattern, config.action)
            })
            .collect::<Result<Vec<_>, _>>()?;
        Ok(Self { rules })
    }

    pub fn inspect_output(
        &self,
        protocol: Protocol,
        body: &serde_json::Value,
    ) -> Result<serde_json::Value, InspectionError> {
        super::output::inspect(protocol, body, &self.rules)
    }

    pub fn inspect(
        &self,
        protocol: Protocol,
        body: &serde_json::Value,
    ) -> Result<serde_json::Value, InspectionError> {
        match protocol {
            Protocol::Chat => inspect_chat(body, &self.rules),
            Protocol::Messages => inspect_messages(body, &self.rules),
            Protocol::Responses => inspect_responses(body, &self.rules),
            Protocol::Embeddings => inspect_embeddings(body, &self.rules),
            Protocol::VideoText => self.inspect_video_text(body),
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum InspectionError {
    InvalidPattern,
    ResourceLimit,
    Blocked,
    UnsupportedContent,
}

/// Textual message subset only. Returns a transformed clone; failures never mutate input.
/// Use one inspection pass for all original system/message text. The temporary
/// Chat-shaped document is local inspection input only, never an upstream body.
/// Native cache metadata contains no inspectable text and is preserved verbatim.
pub(crate) fn valid_message_cache_control(value: &serde_json::Value) -> bool {
    value.as_object().is_some_and(|object| {
        object
            .keys()
            .all(|key| ["type", "ttl"].contains(&key.as_str()))
            && value["type"] == "ephemeral"
            && value
                .get("ttl")
                .is_none_or(|ttl| ttl == "5m" || ttl == "1h")
    })
}

pub fn inspect_messages(
    body: &serde_json::Value,
    rules: &[TextRule],
) -> Result<serde_json::Value, InspectionError> {
    let mut inspected = body.clone();
    let mut messages = body
        .get("messages")
        .and_then(serde_json::Value::as_array)
        .cloned()
        .ok_or(InspectionError::UnsupportedContent)?;
    let has_system = body.get("system").is_some();
    if let Some(system) = body.get("system") {
        messages.insert(0, serde_json::json!({"role":"system","content":system}));
    }
    let mut cache_controls = Vec::new();
    for (message_index, message) in messages.iter_mut().enumerate() {
        if let Some(parts) = message["content"].as_array_mut() {
            for (part_index, part) in parts.iter_mut().enumerate() {
                if let Some(control) = part
                    .as_object_mut()
                    .and_then(|part| part.remove("cache_control"))
                {
                    if !valid_message_cache_control(&control) {
                        return Err(InspectionError::UnsupportedContent);
                    }
                    cache_controls.push((message_index, part_index, control));
                }
            }
        }
    }
    let mut normalized = inspect_chat(&serde_json::json!({"messages":messages}), rules)?;
    for (message_index, part_index, control) in cache_controls {
        normalized["messages"][message_index]["content"][part_index]["cache_control"] = control;
    }
    let mut messages = normalized["messages"].as_array().unwrap().clone();
    if has_system {
        inspected["system"] = messages.remove(0)["content"].clone();
    }
    inspected["messages"] = serde_json::Value::Array(messages);
    Ok(inspected)
}

pub fn inspect_chat(
    body: &serde_json::Value,
    rules: &[TextRule],
) -> Result<serde_json::Value, InspectionError> {
    if rules.len() > 32 {
        return Err(InspectionError::ResourceLimit);
    }
    let mut output = body.clone();
    if body.get("tools").is_some() || body.get("functions").is_some() {
        return Err(InspectionError::UnsupportedContent);
    }
    let messages = output
        .get_mut("messages")
        .and_then(serde_json::Value::as_array_mut)
        .filter(|messages| !messages.is_empty())
        .ok_or(InspectionError::UnsupportedContent)?;
    let mut paths = Vec::new();
    let mut total = 0usize;
    for (index, message) in messages.iter().enumerate() {
        if !message.as_object().is_some_and(|object| {
            object
                .keys()
                .all(|key| ["role", "content", "name", "tool_call_id"].contains(&key.as_str()))
        }) {
            return Err(InspectionError::UnsupportedContent);
        }
        let role = message
            .get("role")
            .and_then(serde_json::Value::as_str)
            .ok_or(InspectionError::UnsupportedContent)?;
        if !["system", "developer", "user", "assistant", "tool"].contains(&role)
            || message.get("tool_calls").is_some()
            || message.get("function_call").is_some()
            || message.get("audio").is_some()
            || message.get("refusal").is_some()
        {
            return Err(InspectionError::UnsupportedContent);
        }
        let content = message
            .get("content")
            .ok_or(InspectionError::UnsupportedContent)?;
        if let Some(text) = content.as_str() {
            total = total
                .checked_add(text.len())
                .ok_or(InspectionError::ResourceLimit)?;
            paths.push(format!("/messages/{index}/content"));
        } else if let Some(parts) = content.as_array() {
            for (part_index, part) in parts.iter().enumerate() {
                if !part.as_object().is_some_and(|object| {
                    object
                        .keys()
                        .all(|key| ["type", "text", "cache_control"].contains(&key.as_str()))
                }) {
                    return Err(InspectionError::UnsupportedContent);
                }
                if part
                    .get("cache_control")
                    .is_some_and(|control| !valid_message_cache_control(control))
                {
                    return Err(InspectionError::UnsupportedContent);
                }
                if part.get("type").and_then(serde_json::Value::as_str) != Some("text") {
                    return Err(InspectionError::UnsupportedContent);
                }
                let text = part
                    .get("text")
                    .and_then(serde_json::Value::as_str)
                    .ok_or(InspectionError::UnsupportedContent)?;
                total = total
                    .checked_add(text.len())
                    .ok_or(InspectionError::ResourceLimit)?;
                paths.push(format!("/messages/{index}/content/{part_index}/text"));
            }
        } else {
            return Err(InspectionError::UnsupportedContent);
        }
        if total > 1024 * 1024 || paths.len() > 4096 {
            return Err(InspectionError::ResourceLimit);
        }
    }
    // Evaluate every original field for denials before transforming any field.
    for path in &paths {
        let text = output
            .pointer(path)
            .and_then(serde_json::Value::as_str)
            .unwrap();
        if rules
            .iter()
            .any(|rule| matches!(rule.action, Action::Block) && rule.expression.is_match(text))
        {
            return Err(InspectionError::Blocked);
        }
    }
    let mut transformed_bytes = 0usize;
    for path in paths {
        let field = output.pointer_mut(&path).unwrap();
        let text = inspect_text(field.as_str().unwrap(), rules)?;
        transformed_bytes = transformed_bytes
            .checked_add(text.len())
            .filter(|n| *n <= 1024 * 1024)
            .ok_or(InspectionError::ResourceLimit)?;
        *field = serde_json::Value::String(text);
    }
    Ok(output)
}

/// Self-contained Responses text only. Previous-response state, files and tools
/// cannot be inspected here and must not silently bypass a required policy.
pub fn inspect_responses(
    body: &serde_json::Value,
    rules: &[TextRule],
) -> Result<serde_json::Value, InspectionError> {
    use serde_json::{Value, json};
    if rules.len() > 32 {
        return Err(InspectionError::ResourceLimit);
    }
    if ["tools", "previous_response_id", "conversation", "prompt"]
        .iter()
        .any(|key| body.get(key).is_some())
    {
        return Err(InspectionError::UnsupportedContent);
    }
    let mut messages = Vec::new();
    let instructions = match body.get("instructions") {
        None => None,
        Some(Value::String(text)) => {
            messages.push(json!({"role":"developer","content":text}));
            Some(0usize)
        }
        _ => return Err(InspectionError::UnsupportedContent),
    };
    let offset = messages.len();
    let input = body
        .get("input")
        .ok_or(InspectionError::UnsupportedContent)?;
    let plain = input.is_string();
    if let Some(text) = input.as_str() {
        messages.push(json!({"role":"user","content":text}));
    } else if let Some(items) = input.as_array().filter(|items| !items.is_empty()) {
        for item in items {
            let object = item
                .as_object()
                .ok_or(InspectionError::UnsupportedContent)?;
            if !object
                .keys()
                .all(|key| ["type", "role", "content"].contains(&key.as_str()))
                || item.get("type").is_some_and(|kind| kind != "message")
            {
                return Err(InspectionError::UnsupportedContent);
            }
            let mut message = item.clone();
            message.as_object_mut().unwrap().remove("type");
            if let Some(parts) = message.get_mut("content").and_then(Value::as_array_mut) {
                for part in parts {
                    if part.get("type") != Some(&json!("input_text")) {
                        return Err(InspectionError::UnsupportedContent);
                    }
                    part["type"] = json!("text");
                }
            }
            messages.push(message);
        }
    } else {
        return Err(InspectionError::UnsupportedContent);
    }
    let inspected = inspect_chat(&json!({"messages":messages}), rules)?;
    let mut output = body.clone();
    if let Some(index) = instructions {
        output["instructions"] = inspected["messages"][index]["content"].clone();
    }
    if plain {
        output["input"] = inspected["messages"][offset]["content"].clone();
    } else {
        for (index, item) in output["input"]
            .as_array_mut()
            .unwrap()
            .iter_mut()
            .enumerate()
        {
            let original_parts = item["content"].is_array();
            item["content"] = inspected["messages"][offset + index]["content"].clone();
            if original_parts {
                for part in item["content"].as_array_mut().unwrap() {
                    part["type"] = json!("input_text");
                }
            }
        }
    }
    Ok(output)
}

/// Text Embeddings inputs only. Encoded token IDs are not inspectable text.
pub fn inspect_embeddings(
    body: &serde_json::Value,
    rules: &[TextRule],
) -> Result<serde_json::Value, InspectionError> {
    use serde_json::{Value, json};
    let input = body
        .get("input")
        .ok_or(InspectionError::UnsupportedContent)?;
    let plain = input.is_string();
    let texts: Vec<&str> = if let Some(text) = input.as_str() {
        vec![text]
    } else if let Some(items) = input
        .as_array()
        .filter(|items| !items.is_empty() && items.len() <= 4096)
    {
        items
            .iter()
            .map(|item| item.as_str().ok_or(InspectionError::UnsupportedContent))
            .collect::<Result<_, _>>()?
    } else {
        return Err(InspectionError::UnsupportedContent);
    };
    let messages: Vec<_> = texts
        .iter()
        .map(|text| json!({"role":"user","content":text}))
        .collect();
    let inspected = inspect_chat(&json!({"messages":messages}), rules)?;
    let mut output = body.clone();
    output["input"] = if plain {
        inspected["messages"][0]["content"].clone()
    } else {
        Value::Array(
            inspected["messages"]
                .as_array()
                .unwrap()
                .iter()
                .map(|message| message["content"].clone())
                .collect(),
        )
    };
    Ok(output)
}

#[derive(Debug, PartialEq, Eq, Clone, Copy, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Preset {
    EmailV1,
    ApiKeyPrefixV1,
    NiuApiKeyV1,
}

impl Preset {
    pub fn pattern(self) -> &'static str {
        match self {
            Self::NiuApiKeyV1 => r"\bniu_[a-f0-9]{64}\b",
            Self::EmailV1 => r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b",
            Self::ApiKeyPrefixV1 => {
                r"\b(?:sk-(?:or-v1-|proj-)?|ghp_|github_pat_)[A-Za-z0-9_-]{16,}\b"
            }
        }
    }
}

impl TextRule {
    pub fn compile(pattern: &str, action: Action) -> Result<Self, InspectionError> {
        if pattern.is_empty() || pattern.len() > 4096 {
            return Err(InspectionError::ResourceLimit);
        }
        let expression = RegexBuilder::new(pattern)
            .size_limit(256 * 1024)
            .dfa_size_limit(256 * 1024)
            .nest_limit(64)
            .build()
            .map_err(|_| InspectionError::InvalidPattern)?;
        Ok(Self { expression, action })
    }
}

pub fn inspect_text(text: &str, rules: &[TextRule]) -> Result<String, InspectionError> {
    const MAX_BYTES: usize = 1024 * 1024;
    if text.len() > MAX_BYTES || rules.len() > 32 {
        return Err(InspectionError::ResourceLimit);
    }
    // Block checks inspect originals: earlier redaction cannot hide a mandatory denial.
    if rules
        .iter()
        .any(|rule| matches!(rule.action, Action::Block) && rule.expression.is_match(text))
    {
        return Err(InspectionError::Blocked);
    }
    let mut output = text.to_owned();
    for rule in rules
        .iter()
        .filter(|rule| matches!(rule.action, Action::Redact))
    {
        let mut transformed = String::new();
        let mut offset = 0;
        for found in rule.expression.find_iter(&output) {
            let additional = found.start() - offset + "[REDACTED]".len();
            if transformed
                .len()
                .checked_add(additional)
                .is_none_or(|n| n > MAX_BYTES)
            {
                return Err(InspectionError::ResourceLimit);
            }
            transformed.push_str(&output[offset..found.start()]);
            transformed.push_str("[REDACTED]");
            offset = found.end();
        }
        if transformed
            .len()
            .checked_add(output.len() - offset)
            .is_none_or(|n| n > MAX_BYTES)
        {
            return Err(InspectionError::ResourceLimit);
        }
        transformed.push_str(&output[offset..]);
        output = transformed;
    }
    Ok(output)
}

#[derive(Debug)]
pub enum WorkerError {
    Busy,
    Failed,
    Deadline,
}

/// No unbounded work queue. A cancelled waiter cannot release a running job's slot.
pub async fn run_bounded<T: Send + 'static>(
    slots: std::sync::Arc<tokio::sync::Semaphore>,
    work: impl FnOnce() -> T + Send + 'static,
) -> Result<T, WorkerError> {
    let permit = slots.try_acquire_owned().map_err(|_| WorkerError::Busy)?;
    let job = tokio::task::spawn_blocking(move || {
        let _permit = permit;
        work()
    });
    tokio::time::timeout(std::time::Duration::from_secs(5), job)
        .await
        .map_err(|_| WorkerError::Deadline)?
        .map_err(|_| WorkerError::Failed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn video_detector_text_preserves_order_and_rejects_uncovered_media() {
        let body = serde_json::json!({"content":[{"type":"text","text":"雪 first"},
            {"type":"text","text":"second"}]});
        assert_eq!(
            detector_text(Protocol::VideoText, &body).unwrap(),
            "雪 first\nsecond"
        );
        let media = serde_json::json!({"content":[{"type":"text","text":"first"},
            {"type":"image_url","image_url":{"url":"https://fixture.example/a"}}]});
        assert_eq!(
            detector_text(Protocol::VideoText, &media),
            Err(InspectionError::UnsupportedContent)
        );
        assert_eq!(
            CompiledInputPolicy::compile(&[]).unwrap().inspect_output(
                Protocol::VideoText,
                &serde_json::json!({"status":"succeeded"})
            ),
            Err(InspectionError::UnsupportedContent)
        );
    }

    #[test]
    fn video_text_extraction_rejects_excess_items_and_bytes() {
        let policy = CompiledInputPolicy::compile(&[]).unwrap();
        let item = serde_json::json!({"type":"text","text":"short"});
        let many = serde_json::json!({"content": vec![item; 33]});
        assert_eq!(
            policy.inspect_video_text(&many),
            Err(InspectionError::ResourceLimit)
        );
        let large = serde_json::json!({"content":[{"type":"text","text":"x".repeat(65_537)}]});
        assert_eq!(
            policy.inspect_video_text(&large),
            Err(InspectionError::ResourceLimit)
        );
        let split = serde_json::json!({"content":[{"type":"text","text":"x".repeat(32_769)},
            {"type":"text","text":"y".repeat(32_768)}]});
        assert_eq!(
            policy.inspect_video_text(&split),
            Err(InspectionError::ResourceLimit)
        );
    }

    #[test]
    fn video_text_preserves_controls_and_never_claims_media_coverage() {
        let redact = RuleConfig {
            pattern: Some("secret".into()),
            preset: None,
            action: Action::Redact,
        };
        let policy = CompiledInputPolicy::compile(std::slice::from_ref(&redact)).unwrap();
        let body = serde_json::json!({"model":"video","duration":5,"content":[
            {"type":"text","text":"雪 secret","role":"prompt"},
            {"type":"text","text":"second"}]});
        let output = policy.inspect_video_text(&body).unwrap();
        assert_eq!(output["duration"], body["duration"]);
        assert_eq!(output["model"], body["model"]);
        assert_eq!(output["content"][0]["role"], "prompt");
        assert_eq!(output["content"][0]["text"], "雪 [REDACTED]");
        assert_eq!(output["content"][1], body["content"][1]);
        let block = RuleConfig {
            action: Action::Block,
            ..redact.clone()
        };
        let combined = CompiledInputPolicy::compile(&[redact, block]).unwrap();
        assert_eq!(
            combined.inspect_video_text(&body),
            Err(InspectionError::Blocked)
        );
        let media = serde_json::json!({"content":[{"type":"image_url","image_url":{"url":"https://fixture.example/a"}}]});
        assert_eq!(
            policy.inspect_video_text(&media),
            Err(InspectionError::UnsupportedContent)
        );
        assert_eq!(body["content"][0]["text"], "雪 secret");
    }

    #[test]
    fn compiled_effective_policy_blocks_original_text_across_protocols() {
        let configs = vec![
            RuleConfig {
                pattern: Some("fixture-secret".into()),
                preset: None,
                action: Action::Redact,
            },
            RuleConfig {
                pattern: Some("fixture-secret".into()),
                preset: None,
                action: Action::Block,
            },
        ];
        let policy = CompiledInputPolicy::compile(&configs).unwrap();
        for (protocol, body) in [
            (
                Protocol::Chat,
                serde_json::json!({"messages":[{"role":"user","content":"雪 fixture-secret"}]}),
            ),
            (
                Protocol::Responses,
                serde_json::json!({"input":"雪 fixture-secret"}),
            ),
            (
                Protocol::Embeddings,
                serde_json::json!({"input":["clean","雪 fixture-secret"]}),
            ),
        ] {
            let original = body.clone();
            assert_eq!(
                policy.inspect(protocol, &body),
                Err(InspectionError::Blocked)
            );
            assert_eq!(body, original);
        }
    }

    #[test]
    fn shared_rule_configuration_is_versioned_exact_and_bounded() {
        let preset: RuleConfig =
            serde_json::from_value(serde_json::json!({"preset":"email_v1","action":"redact"}))
                .unwrap();
        assert_eq!(
            serde_json::to_value(&preset).unwrap(),
            serde_json::json!({"preset":"email_v1","action":"redact"})
        );
        let body = serde_json::json!({"input":"雪 test@example.com"});
        assert_eq!(
            CompiledInputPolicy::compile(std::slice::from_ref(&preset))
                .unwrap()
                .inspect(Protocol::Embeddings, &body)
                .unwrap(),
            serde_json::json!({"input":"雪 [REDACTED]"})
        );
        assert!(matches!(
            CompiledInputPolicy::compile(&vec![preset.clone(); 33]),
            Err(InspectionError::ResourceLimit)
        ));
        let mut conflicting = preset;
        conflicting.pattern = Some("other".into());
        assert!(matches!(
            CompiledInputPolicy::compile(&[conflicting]),
            Err(InspectionError::InvalidPattern)
        ));
        for input in [
            serde_json::json!({"preset":"unversioned","action":"redact"}),
            serde_json::json!({"pattern":"fixture","action":"redact","extra":"ignored"}),
        ] {
            assert!(serde_json::from_value::<RuleConfig>(input).is_err());
        }
    }
    #[tokio::test]
    async fn cancelled_waiter_keeps_worker_slot_until_work_finishes() {
        let slots = std::sync::Arc::new(tokio::sync::Semaphore::new(1));
        let (started_tx, started_rx) = tokio::sync::oneshot::channel();
        let (finish_tx, finish_rx) = tokio::sync::oneshot::channel();
        let worker_slots = slots.clone();
        let task = tokio::spawn(async move {
            run_bounded(worker_slots, move || {
                started_tx.send(()).unwrap();
                finish_rx.blocking_recv().unwrap();
            })
            .await
        });
        started_rx.await.unwrap();
        task.abort();
        assert!(task.await.unwrap_err().is_cancelled());
        assert_eq!(slots.available_permits(), 0);
        assert!(matches!(
            run_bounded(slots.clone(), || ()).await,
            Err(WorkerError::Busy)
        ));
        finish_tx.send(()).unwrap();
        let permit = tokio::time::timeout(
            std::time::Duration::from_secs(1),
            slots.clone().acquire_owned(),
        )
        .await
        .unwrap()
        .unwrap();
        drop(permit);
        assert_eq!(run_bounded(slots, || 7).await.unwrap(), 7);
    }

    #[tokio::test]
    async fn deadline_keeps_running_worker_bounded_and_recovers_after_completion() {
        let slots = std::sync::Arc::new(tokio::sync::Semaphore::new(1));
        let (started_tx, started_rx) = tokio::sync::oneshot::channel();
        let (finish_tx, finish_rx) = tokio::sync::oneshot::channel();
        let worker_slots = slots.clone();
        let task = tokio::spawn(async move {
            run_bounded(worker_slots, move || {
                started_tx.send(()).unwrap();
                finish_rx.blocking_recv().unwrap();
            })
            .await
        });
        started_rx.await.unwrap();
        let result = task.await.unwrap();
        assert!(matches!(result, Err(WorkerError::Deadline)));
        assert_eq!(slots.available_permits(), 0);
        assert!(matches!(
            run_bounded(slots.clone(), || ()).await,
            Err(WorkerError::Busy)
        ));
        finish_tx.send(()).unwrap();
        let permit = tokio::time::timeout(
            std::time::Duration::from_secs(1),
            slots.clone().acquire_owned(),
        )
        .await
        .unwrap()
        .unwrap();
        drop(permit);
        assert_eq!(run_bounded(slots, || 7).await.unwrap(), 7);
    }

    #[tokio::test]
    async fn failed_worker_releases_capacity_without_returning_its_payload() {
        let slots = std::sync::Arc::new(tokio::sync::Semaphore::new(1));
        let result: Result<(), WorkerError> = run_bounded(slots.clone(), || {
            panic!("synthetic worker failure");
        })
        .await;
        assert!(matches!(result, Err(WorkerError::Failed)));
        assert_eq!(slots.available_permits(), 1);
        assert_eq!(run_bounded(slots, || 7).await.unwrap(), 7);
    }

    #[test]
    fn niu_key_preset_matches_issued_shape_without_changing_existing_preset() {
        let token = format!("niu_{}", "a".repeat(64));
        let block = TextRule::compile(Preset::NiuApiKeyV1.pattern(), Action::Block).unwrap();
        assert_eq!(
            inspect_text(&token, &[block]),
            Err(InspectionError::Blocked)
        );
        let redact = TextRule::compile(Preset::NiuApiKeyV1.pattern(), Action::Redact).unwrap();
        assert_eq!(
            inspect_text(&format!("授权 '{token}' 🐂"), &[redact]).unwrap(),
            "授权 '[REDACTED]' 🐂"
        );
        for text in [
            format!("niu_{}", "a".repeat(63)),
            format!("niu_{}", "a".repeat(65)),
            format!("niu_{}", "z".repeat(64)),
            format!("prefix{token}"),
            "niu_example".to_owned(),
        ] {
            let rule = TextRule::compile(Preset::NiuApiKeyV1.pattern(), Action::Block).unwrap();
            assert_eq!(inspect_text(&text, &[rule]).unwrap(), text);
        }
        let prior = TextRule::compile(Preset::ApiKeyPrefixV1.pattern(), Action::Block).unwrap();
        assert_eq!(inspect_text(&token, &[prior]).unwrap(), token);
        let config: RuleConfig =
            serde_json::from_value(serde_json::json!({"preset":"niu_api_key_v1","action":"block"}))
                .unwrap();
        assert_eq!(config.preset, Some(Preset::NiuApiKeyV1));
    }

    #[test]
    fn preset_coverage_is_explicit_and_does_not_claim_universal_detection() {
        let email = TextRule::compile(Preset::EmailV1.pattern(), Action::Redact).unwrap();
        assert_eq!(
            inspect_text("Contact fixture@example.test 🐂", &[email]).unwrap(),
            "Contact [REDACTED] 🐂"
        );
        let keys = TextRule::compile(Preset::ApiKeyPrefixV1.pattern(), Action::Block).unwrap();
        let token = format!("{}{}", "sk-or-v1-", "x".repeat(20));
        assert_eq!(inspect_text(&token, &[keys]), Err(InspectionError::Blocked));
        for text in [
            "sk-short",
            "opaque credentials without a known prefix",
            "name@example",
            "用户@例子.测试",
        ] {
            let rules = [
                TextRule::compile(Preset::EmailV1.pattern(), Action::Block).unwrap(),
                TextRule::compile(Preset::ApiKeyPrefixV1.pattern(), Action::Block).unwrap(),
            ];
            assert_eq!(inspect_text(text, &rules).unwrap(), text);
        }
        // Example addresses are still matches: this preset is syntax matching, not classification.
        assert_eq!(
            inspect_text(
                "docs@example.test",
                &[TextRule::compile(Preset::EmailV1.pattern(), Action::Block).unwrap()]
            ),
            Err(InspectionError::Blocked)
        );
    }

    #[test]
    fn unicode_redaction_preserves_boundaries_and_block_precedence() {
        let redact = TextRule::compile("秘密", Action::Redact).unwrap();
        assert_eq!(
            inspect_text("hello 秘密 🐂", &[redact]).unwrap(),
            "hello [REDACTED] 🐂"
        );
        let rules = [
            TextRule::compile("secret", Action::Redact).unwrap(),
            TextRule::compile("secret", Action::Block).unwrap(),
        ];
        assert_eq!(
            inspect_text("secret", &rules),
            Err(InspectionError::Blocked)
        );
        assert_eq!(inspect_text("benign", &rules).unwrap(), "benign");
    }
    #[test]
    fn patterns_inputs_and_output_growth_are_bounded() {
        assert!(TextRule::compile("(", Action::Block).is_err());
        assert!(TextRule::compile(&"a".repeat(4097), Action::Block).is_err());
        assert_eq!(
            inspect_text(&"a".repeat(1024 * 1024 + 1), &[]),
            Err(InspectionError::ResourceLimit)
        );
        let rule = TextRule::compile("a", Action::Redact).unwrap();
        assert_eq!(
            inspect_text(&"a".repeat(200_000), &[rule]),
            Err(InspectionError::ResourceLimit)
        );
    }

    #[test]
    fn responses_inspects_instructions_and_nested_text_without_changing_protocol() {
        use serde_json::json;
        let original = json!({"model":"secret-model","instructions":"秘密", "input":[{"type":"message","role":"user","content":[{"type":"input_text","text":"hello 秘密"}]}],"stream":true});
        let transformed = inspect_responses(
            &original,
            &[TextRule::compile("秘密", Action::Redact).unwrap()],
        )
        .unwrap();
        assert_eq!(transformed["instructions"], "[REDACTED]");
        assert_eq!(
            transformed["input"][0]["content"][0],
            json!({"type":"input_text","text":"hello [REDACTED]"})
        );
        assert_eq!(transformed["model"], original["model"]);
        assert_eq!(transformed["stream"], true);
        assert_eq!(original["instructions"], "秘密");
        let rules = [
            TextRule::compile("secret", Action::Redact).unwrap(),
            TextRule::compile("secret", Action::Block).unwrap(),
        ];
        assert_eq!(
            inspect_responses(&json!({"instructions":"secret","input":"benign"}), &rules),
            Err(InspectionError::Blocked)
        );
        for body in [
            json!({"input":"safe","previous_response_id":"hidden"}),
            json!({"input":"safe","conversation":"hidden"}),
            json!({"input":"safe","tools":[]}),
            json!({"input":[{"type":"function_call_output","output":"secret"}]}),
            json!({"input":[{"role":"user","content":[{"type":"input_image","image_url":"hidden"}]}]}),
            json!({"input":[],"instructions":"safe"}),
        ] {
            assert_eq!(
                inspect_responses(&body, &rules),
                Err(InspectionError::UnsupportedContent)
            );
        }
    }

    #[test]
    fn embeddings_text_is_inspected_as_a_batch_and_encoded_tokens_fail_closed() {
        use serde_json::json;
        let original = json!({"model":"secret-model","input":["hello 秘密 🐂","benign"],"dimensions":32,"encoding_format":"base64"});
        let output = inspect_embeddings(
            &original,
            &[TextRule::compile("秘密", Action::Redact).unwrap()],
        )
        .unwrap();
        assert_eq!(output["input"], json!(["hello [REDACTED] 🐂", "benign"]));
        assert_eq!(output["dimensions"], 32);
        assert_eq!(output["encoding_format"], "base64");
        assert_eq!(original["input"][0], "hello 秘密 🐂");
        let rules = [
            TextRule::compile("secret", Action::Redact).unwrap(),
            TextRule::compile("secret", Action::Block).unwrap(),
        ];
        assert_eq!(
            inspect_embeddings(&json!({"input":["safe","secret"]}), &rules),
            Err(InspectionError::Blocked)
        );
        for input in [
            json!([1, 2]),
            json!([[1, 2], [3]]),
            json!(["text", 1]),
            json!([]),
            json!(null),
        ] {
            assert_eq!(
                inspect_embeddings(&json!({"input":input}), &rules),
                Err(InspectionError::UnsupportedContent)
            );
        }
        assert_eq!(
            inspect_embeddings(
                &json!({"input":["x".repeat(600_000),"x".repeat(600_000)]}),
                &[]
            ),
            Err(InspectionError::ResourceLimit)
        );
    }

    #[test]
    fn chat_redaction_preserves_structure_and_rejects_uninspected_parts() {
        use serde_json::json;
        let body = json!({"model":"secret-model","messages":[{"role":"system","content":"秘密"},{"role":"user","content":[{"type":"text","text":"hello 秘密"}]}]});
        let rule = TextRule::compile("秘密", Action::Redact).unwrap();
        let transformed = inspect_chat(&body, &[rule]).unwrap();
        assert_eq!(transformed["model"], "secret-model");
        assert_eq!(
            transformed["messages"][1]["content"][0]["text"],
            "hello [REDACTED]"
        );
        assert_eq!(body["messages"][0]["content"], "秘密");
        for message in [
            json!({"role":"user","content":[{"type":"image_url","image_url":{"url":"data:test"}}]}),
            json!({"role":"assistant","content":"x","tool_calls":[]}),
            json!({"role":"user","content":null}),
        ] {
            assert_eq!(
                inspect_chat(&json!({"messages":[message]}), &[]),
                Err(InspectionError::UnsupportedContent)
            );
        }
    }
}

/// Validates the same bounded textual subset as local input rules, then sends
/// content fields only. Field boundaries are explicit newline separators.
pub fn detector_text(
    protocol: Protocol,
    body: &serde_json::Value,
) -> Result<String, InspectionError> {
    let validated = CompiledInputPolicy::compile(&[])?.inspect(protocol, body)?;
    fn collect(value: &serde_json::Value, texts: &mut Vec<String>) {
        match value {
            serde_json::Value::String(text) => texts.push(text.clone()),
            serde_json::Value::Array(items) => {
                for item in items {
                    collect(item, texts);
                }
            }
            serde_json::Value::Object(object) => {
                for key in ["content", "text"] {
                    if let Some(value) = object.get(key) {
                        collect(value, texts);
                    }
                }
            }
            _ => (),
        }
    }
    let mut texts = Vec::new();
    match protocol {
        Protocol::Chat => collect(&validated["messages"], &mut texts),
        Protocol::Messages => {
            collect(&validated["system"], &mut texts);
            collect(&validated["messages"], &mut texts);
        }
        Protocol::Responses => {
            if let Some(instructions) = validated.get("instructions") {
                collect(instructions, &mut texts);
            }
            collect(&validated["input"], &mut texts);
        }
        Protocol::Embeddings => collect(&validated["input"], &mut texts),
        Protocol::VideoText => {
            for item in validated["content"]
                .as_array()
                .ok_or(InspectionError::UnsupportedContent)?
            {
                collect(&item["text"], &mut texts);
            }
        }
    }
    let text = texts.join("\n");
    if text.len() > 65_536 {
        return Err(InspectionError::ResourceLimit);
    }
    Ok(text)
}

#[cfg(test)]
mod detector_extraction_tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn detector_text_extracts_only_validated_content_with_unicode_and_boundaries() {
        assert_eq!(detector_text(Protocol::Chat, &json!({"model":"do-not-send","messages":[{"role":"user","name":"do-not-send","content":[{"type":"text","text":"牛元"},{"type":"text","text":"hello"}]}]})).unwrap(), "牛元\nhello");
        assert_eq!(detector_text(Protocol::Responses, &json!({"instructions":"rules","input":[{"type":"message","role":"user","content":[{"type":"input_text","text":"牛元"}]}]})).unwrap(), "rules\n牛元");
        assert_eq!(
            detector_text(Protocol::Embeddings, &json!({"input":["one","two"]})).unwrap(),
            "one\ntwo"
        );
        assert_eq!(
            detector_text(
                Protocol::Chat,
                &json!({"messages":[{"role":"user","content":[{"type":"image_url","image_url":{"url":"https://example.com"}}]}]})
            ),
            Err(InspectionError::UnsupportedContent)
        );
        assert_eq!(
            detector_text(
                Protocol::Responses,
                &json!({"input":"hello","previous_response_id":"private-reference"})
            ),
            Err(InspectionError::UnsupportedContent)
        );
        assert_eq!(
            detector_text(Protocol::Embeddings, &json!({"input":[1,2,3]})),
            Err(InspectionError::UnsupportedContent)
        );
        assert_eq!(
            detector_text(
                Protocol::Chat,
                &json!({"messages":[{"role":"user","content":"x".repeat(65_537)}]})
            ),
            Err(InspectionError::ResourceLimit)
        );
    }
}
