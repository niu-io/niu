//! Complete textual output extraction. No streaming or activation guarantee is implied.
use super::input::{InspectionError, Protocol, TextRule, inspect_chat};
use serde_json::{Value, json};

/// Inspect every supported candidate against original text before redacting any.
/// Opaque tool, reasoning, audio and annotation structures fail closed.
pub fn inspect(
    protocol: Protocol,
    body: &Value,
    rules: &[TextRule],
) -> Result<Value, InspectionError> {
    if serde_json::to_vec(body)
        .map_err(|_| InspectionError::UnsupportedContent)?
        .len()
        > 1024 * 1024
    {
        return Err(InspectionError::ResourceLimit);
    }
    let object = body
        .as_object()
        .ok_or(InspectionError::UnsupportedContent)?;
    let allowed: &[&str] = match protocol {
        Protocol::GenerateContent => &["candidates", "usageMetadata", "modelVersion", "responseId"],
        Protocol::Messages => &[
            "id",
            "type",
            "role",
            "model",
            "content",
            "stop_reason",
            "stop_sequence",
            "usage",
        ],
        Protocol::Chat => &[
            "id",
            "object",
            "created",
            "model",
            "provider",
            "choices",
            "usage",
            "system_fingerprint",
            "service_tier",
        ],
        Protocol::Responses => &[
            "id",
            "object",
            "created_at",
            "status",
            "model",
            "output",
            "output_text",
            "usage",
            "completed_at",
            "error",
            "incomplete_details",
            "instructions",
            "metadata",
            "parallel_tool_calls",
            "frequency_penalty",
            "presence_penalty",
            "temperature",
            "top_p",
            "tool_choice",
            "tools",
            "background",
            "max_output_tokens",
            "max_tool_calls",
            "previous_response_id",
            "prompt",
            "prompt_cache_key",
            "prompt_cache_options",
            "reasoning",
            "safety_identifier",
            "service_tier",
            "store",
            "text",
            "top_logprobs",
            "truncation",
            "user",
        ],
        Protocol::Embeddings | Protocol::VideoText => {
            return Err(InspectionError::UnsupportedContent);
        }
    };
    if object.keys().any(|key| !allowed.contains(&key.as_str())) {
        return Err(InspectionError::UnsupportedContent);
    }
    let mut paths = Vec::new();
    match protocol {
        Protocol::GenerateContent => {
            let candidates = body["candidates"]
                .as_array()
                .filter(|v| v.len() == 1)
                .ok_or(InspectionError::UnsupportedContent)?;
            let candidate = &candidates[0];
            if !candidate.as_object().is_some_and(|v| {
                v.keys()
                    .all(|key| ["index", "content", "finishReason"].contains(&key.as_str()))
            }) || candidate["index"].as_u64() != Some(0)
                || !matches!(
                    candidate["finishReason"].as_str(),
                    Some("STOP" | "MAX_TOKENS")
                )
            {
                return Err(InspectionError::UnsupportedContent);
            }
            let content = &candidate["content"];
            if !content.as_object().is_some_and(|v| v.len() == 2) || content["role"] != "model" {
                return Err(InspectionError::UnsupportedContent);
            }
            let parts = content["parts"]
                .as_array()
                .filter(|v| !v.is_empty() && v.len() <= 128)
                .ok_or(InspectionError::UnsupportedContent)?;
            for (i, part) in parts.iter().enumerate() {
                if !part.as_object().is_some_and(|v| v.len() == 1) || !part["text"].is_string() {
                    return Err(InspectionError::UnsupportedContent);
                }
                paths.push(format!("/candidates/0/content/parts/{i}/text"));
            }
        }
        Protocol::Messages => {
            if body.get("type").and_then(Value::as_str) != Some("message")
                || body.get("role").and_then(Value::as_str) != Some("assistant")
            {
                return Err(InspectionError::UnsupportedContent);
            }
            let blocks = body
                .get("content")
                .and_then(Value::as_array)
                .filter(|blocks| !blocks.is_empty() && blocks.len() <= 128)
                .ok_or(InspectionError::UnsupportedContent)?;
            for (index, block) in blocks.iter().enumerate() {
                if !block.as_object().is_some_and(|b| b.len() == 2)
                    || block.get("type").and_then(Value::as_str) != Some("text")
                    || !block.get("text").is_some_and(Value::is_string)
                {
                    return Err(InspectionError::UnsupportedContent);
                }
                paths.push(format!("/content/{index}/text"));
            }
            optional_label(body, "/stop_sequence", &mut paths)?;
        }
        Protocol::Chat => {
            // OpenRouter adds these textual labels to its normalized Chat envelope.
            // Inspect their values too; never admit arbitrary nested metadata here.
            optional_label(body, "/provider", &mut paths)?;
            let choices = body
                .get("choices")
                .and_then(Value::as_array)
                .filter(|items| !items.is_empty())
                .ok_or(InspectionError::UnsupportedContent)?;
            for (index, choice) in choices.iter().enumerate() {
                if !choice.as_object().is_some_and(|object| {
                    object.keys().all(|key| {
                        [
                            "index",
                            "message",
                            "finish_reason",
                            "native_finish_reason",
                            "logprobs",
                        ]
                        .contains(&key.as_str())
                    })
                }) {
                    return Err(InspectionError::UnsupportedContent);
                }
                optional_label(
                    body,
                    &format!("/choices/{index}/native_finish_reason"),
                    &mut paths,
                )?;

                if choice.get("logprobs").is_some_and(|value| !value.is_null()) {
                    return Err(InspectionError::UnsupportedContent);
                }
                let message = choice
                    .get("message")
                    .and_then(Value::as_object)
                    .ok_or(InspectionError::UnsupportedContent)?;
                if message.keys().any(|key| {
                    ![
                        "role",
                        "content",
                        "refusal",
                        "reasoning",
                        "reasoning_content",
                    ]
                    .contains(&key.as_str())
                }) || message.get("role").and_then(Value::as_str) != Some("assistant")
                {
                    return Err(InspectionError::UnsupportedContent);
                }
                let mut has_text = false;
                for field in ["content", "refusal", "reasoning", "reasoning_content"] {
                    match message.get(field) {
                        Some(Value::String(_)) => {
                            has_text = true;
                            paths.push(format!("/choices/{index}/message/{field}"));
                        }
                        None | Some(Value::Null) => {}
                        _ => return Err(InspectionError::UnsupportedContent),
                    }
                }
                if !has_text {
                    return Err(InspectionError::UnsupportedContent);
                }
            }
        }
        Protocol::Responses => {
            inspect_response_metadata(body, &mut paths)?;
            if body.get("output_text").is_some() {
                require_text(body, "/output_text", &mut paths)?;
            }
            let output = body
                .get("output")
                .and_then(Value::as_array)
                .filter(|items| !items.is_empty())
                .ok_or(InspectionError::UnsupportedContent)?;
            if !output
                .iter()
                .any(|item| item.get("type").and_then(Value::as_str) == Some("message"))
            {
                return Err(InspectionError::UnsupportedContent);
            }
            for (index, item) in output.iter().enumerate() {
                if item.get("type").and_then(Value::as_str) == Some("reasoning") {
                    if !item.as_object().is_some_and(|object| {
                        object.keys().all(|key| {
                            [
                                "id",
                                "type",
                                "status",
                                "summary",
                                "content",
                                "encrypted_content",
                            ]
                            .contains(&key.as_str())
                        })
                    }) || item
                        .get("encrypted_content")
                        .is_some_and(|value| !value.is_null())
                        || item.get("content").is_some_and(|value| {
                            !value.is_null() && !value.as_array().is_some_and(Vec::is_empty)
                        })
                    {
                        return Err(InspectionError::UnsupportedContent);
                    }
                    if let Some(summary) = item.get("summary") {
                        let summary = summary
                            .as_array()
                            .ok_or(InspectionError::UnsupportedContent)?;
                        for (part, value) in summary.iter().enumerate() {
                            if value.get("type").and_then(Value::as_str) != Some("summary_text")
                                || !value.as_object().is_some_and(|object| {
                                    object
                                        .keys()
                                        .all(|key| ["type", "text"].contains(&key.as_str()))
                                })
                            {
                                return Err(InspectionError::UnsupportedContent);
                            }
                            require_text(
                                body,
                                &format!("/output/{index}/summary/{part}/text"),
                                &mut paths,
                            )?;
                        }
                    }
                    continue;
                }

                if item.get("type").and_then(Value::as_str) != Some("message")
                    || item.get("role").and_then(Value::as_str) != Some("assistant")
                    || !item.as_object().is_some_and(|object| {
                        object.keys().all(|key| {
                            ["id", "type", "role", "status", "content"].contains(&key.as_str())
                        })
                    })
                {
                    return Err(InspectionError::UnsupportedContent);
                }
                let content = item
                    .get("content")
                    .and_then(Value::as_array)
                    .filter(|items| !items.is_empty())
                    .ok_or(InspectionError::UnsupportedContent)?;
                for (part, content) in content.iter().enumerate() {
                    let field = match content.get("type").and_then(Value::as_str) {
                        Some("output_text") => "text",
                        Some("refusal") => "refusal",
                        _ => return Err(InspectionError::UnsupportedContent),
                    };
                    if !content.as_object().is_some_and(|object| {
                        object.keys().all(|key| {
                            ["type", field, "annotations", "logprobs"].contains(&key.as_str())
                        })
                    }) || content
                        .get("annotations")
                        .is_some_and(|value| !value.as_array().is_some_and(Vec::is_empty))
                        || content.get("logprobs").is_some_and(|value| {
                            !value.is_null() && !value.as_array().is_some_and(Vec::is_empty)
                        })
                    {
                        return Err(InspectionError::UnsupportedContent);
                    }
                    require_text(
                        body,
                        &format!("/output/{index}/content/{part}/{field}"),
                        &mut paths,
                    )?;
                }
            }
        }
        Protocol::Embeddings | Protocol::VideoText => {
            return Err(InspectionError::UnsupportedContent);
        }
    }
    if paths.is_empty() || paths.len() > 4096 {
        return Err(InspectionError::ResourceLimit);
    }
    let messages: Vec<Value> = paths.iter().map(|path| {
        json!({"role":"assistant","content":body.pointer(path).and_then(Value::as_str).unwrap()})
    }).collect();
    let inspected = inspect_chat(&json!({"messages":messages}), rules)?;
    let mut transformed = body.clone();
    for (index, path) in paths.iter().enumerate() {
        *transformed
            .pointer_mut(path)
            .ok_or(InspectionError::UnsupportedContent)? =
            inspected["messages"][index]["content"].clone();
    }
    if matches!(protocol, Protocol::Responses) {
        inspect_response_metadata(&transformed, &mut Vec::new())?;
    }
    if serde_json::to_vec(&transformed)
        .map_err(|_| InspectionError::UnsupportedContent)?
        .len()
        > 1024 * 1024
    {
        return Err(InspectionError::ResourceLimit);
    }
    Ok(transformed)
}

/// Bound supplemental textual labels and include them in inspection.
fn optional_label(
    body: &Value,
    path: &str,
    paths: &mut Vec<String>,
) -> Result<(), InspectionError> {
    match body.pointer(path) {
        None | Some(Value::Null) => Ok(()),
        Some(Value::String(value)) if value.len() <= 512 => {
            paths.push(path.to_owned());
            Ok(())
        }
        _ => Err(InspectionError::UnsupportedContent),
    }
}

/// Accept standard response configuration without treating arbitrary objects as metadata.
fn inspect_response_metadata(body: &Value, paths: &mut Vec<String>) -> Result<(), InspectionError> {
    for field in [
        "created_at",
        "completed_at",
        "frequency_penalty",
        "presence_penalty",
        "temperature",
        "top_p",
        "max_output_tokens",
        "max_tool_calls",
        "top_logprobs",
    ] {
        if body
            .get(field)
            .is_some_and(|value| !value.is_null() && !value.is_number())
        {
            return Err(InspectionError::UnsupportedContent);
        }
    }
    for field in ["parallel_tool_calls", "background", "store"] {
        if body
            .get(field)
            .is_some_and(|value| !value.is_null() && !value.is_boolean())
        {
            return Err(InspectionError::UnsupportedContent);
        }
    }
    for field in [
        "previous_response_id",
        "prompt_cache_key",
        "safety_identifier",
    ] {
        if body.get(field).is_some_and(|value| {
            !value.is_null() && !value.as_str().is_some_and(|text| text.len() <= 512)
        }) {
            return Err(InspectionError::UnsupportedContent);
        }
    }
    for field in ["instructions", "user"] {
        if body.get(field).is_some_and(|value| !value.is_null()) {
            require_text(body, &format!("/{field}"), paths)?;
        }
    }
    if let Some(metadata) = body.get("metadata").filter(|value| !value.is_null()) {
        let metadata = metadata
            .as_object()
            .filter(|values| values.len() <= 16)
            .ok_or(InspectionError::UnsupportedContent)?;
        for (key, value) in metadata {
            if key.len() > 64 || !value.as_str().is_some_and(|text| text.len() <= 512) {
                return Err(InspectionError::UnsupportedContent);
            }
            // Metadata keys are protocol labels; values are observable text.
            let escaped = key.replace('~', "~0").replace('/', "~1");
            require_text(body, &format!("/metadata/{escaped}"), paths)?;
        }
    }
    if body.get("error").is_some_and(|value| !value.is_null())
        || body.get("prompt").is_some_and(|value| !value.is_null())
        // OpenRouter emits this absent configuration explicitly as null.
        // Nonempty cache metadata has no declared inspection coverage.
        || body
            .get("prompt_cache_options")
            .is_some_and(|value| !value.is_null())
    {
        return Err(InspectionError::UnsupportedContent);
    }
    if let Some(details) = body
        .get("incomplete_details")
        .filter(|value| !value.is_null())
        && (!details.as_object().is_some_and(|object| object.len() == 1)
            || !matches!(
                details.get("reason").and_then(Value::as_str),
                Some("max_output_tokens" | "content_filter")
            ))
    {
        return Err(InspectionError::UnsupportedContent);
    }
    for (field, values) in [
        ("tool_choice", &["auto", "none"][..]),
        ("truncation", &["auto", "disabled"][..]),
        (
            "service_tier",
            &["auto", "default", "flex", "priority", "scale"][..],
        ),
    ] {
        if body.get(field).is_some_and(|value| {
            !value.is_null() && !value.as_str().is_some_and(|text| values.contains(&text))
        }) {
            return Err(InspectionError::UnsupportedContent);
        }
    }
    if body
        .get("tools")
        .is_some_and(|value| !value.as_array().is_some_and(Vec::is_empty))
    {
        return Err(InspectionError::UnsupportedContent);
    }
    if let Some(reasoning) = body.get("reasoning").filter(|value| !value.is_null()) {
        let object = reasoning
            .as_object()
            .ok_or(InspectionError::UnsupportedContent)?;
        if object
            .keys()
            .any(|key| !["effort", "summary", "context"].contains(&key.as_str()))
            || object.get("context").is_some_and(|value| !value.is_null())
        {
            return Err(InspectionError::UnsupportedContent);
        }
        for (field, values) in [
            (
                "effort",
                &["none", "minimal", "low", "medium", "high", "xhigh", "auto"][..],
            ),
            ("summary", &["auto", "concise", "detailed"][..]),
        ] {
            if object.get(field).is_some_and(|value| {
                !value.is_null() && !value.as_str().is_some_and(|text| values.contains(&text))
            }) {
                return Err(InspectionError::UnsupportedContent);
            }
        }
    }
    if let Some(text) = body.get("text").filter(|value| !value.is_null()) {
        let object = text
            .as_object()
            .ok_or(InspectionError::UnsupportedContent)?;
        if object
            .keys()
            .any(|key| !["format", "verbosity"].contains(&key.as_str()))
            || object.get("format").is_some_and(|value| {
                !value.as_object().is_some_and(|format| {
                    format.len() == 1 && format.get("type").and_then(Value::as_str) == Some("text")
                })
            })
            || object.get("verbosity").is_some_and(|value| {
                !value
                    .as_str()
                    .is_some_and(|value| ["low", "medium", "high"].contains(&value))
            })
        {
            return Err(InspectionError::UnsupportedContent);
        }
    }
    Ok(())
}

fn require_text(body: &Value, path: &str, paths: &mut Vec<String>) -> Result<(), InspectionError> {
    if !body.pointer(path).is_some_and(Value::is_string) {
        return Err(InspectionError::UnsupportedContent);
    }
    paths.push(path.to_owned());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::guardrails::input::Action;

    #[test]
    fn openrouter_chat_labels_preserve_envelope_and_cannot_hide_text() {
        let body = json!({"id":"completion-fixture","object":"chat.completion","created":1,"model":"fixture",
            "provider":"fixture-secret","choices":[{"index":0,"native_finish_reason":"fixture-secret","finish_reason":"stop","logprobs":null,
            "message":{"role":"assistant","content":"fixture-secret","reasoning":null,"refusal":null}}],"usage":{"prompt_tokens":1,"completion_tokens":1}});
        let redacted = inspect(
            Protocol::Chat,
            &body,
            &[TextRule::compile("fixture-secret", Action::Redact).unwrap()],
        )
        .unwrap();
        assert_eq!(redacted["provider"], "[REDACTED]");
        assert_eq!(redacted["choices"][0]["native_finish_reason"], "[REDACTED]");
        assert_eq!(redacted["choices"][0]["message"]["content"], "[REDACTED]");
        assert_eq!(redacted["usage"], body["usage"]);
        assert_eq!(
            inspect(
                Protocol::Chat,
                &body,
                &[TextRule::compile("fixture-secret", Action::Block).unwrap()]
            ),
            Err(InspectionError::Blocked)
        );
        for path in ["/provider", "/choices/0/native_finish_reason"] {
            for value in [
                json!({"text":"opaque"}),
                json!(["opaque"]),
                json!("x".repeat(513)),
            ] {
                let mut invalid = body.clone();
                *invalid.pointer_mut(path).unwrap() = value;
                assert_eq!(
                    inspect(Protocol::Chat, &invalid, &[]),
                    Err(InspectionError::UnsupportedContent)
                );
            }
        }
        let mut unknown = body.clone();
        unknown["unrecognized"] = json!("opaque");
        assert_eq!(
            inspect(Protocol::Chat, &unknown, &[]),
            Err(InspectionError::UnsupportedContent)
        );
    }

    #[test]
    fn standard_responses_metadata_and_reasoning_summaries_are_inspected() {
        let body: Value = serde_json::from_str(r#"{"id":"response-fixture","object":"response","created_at":1,"completed_at":2,"status":"completed","model":"fixture",
        "error":null,"incomplete_details":null,"instructions":"fixture-secret","metadata":{"note/~":"fixture-secret"},
        "frequency_penalty":null,"presence_penalty":null,"temperature":1,"top_p":1,"max_output_tokens":100,"max_tool_calls":null,
        "parallel_tool_calls":false,"tools":[],"tool_choice":"auto","background":false,"store":false,
        "previous_response_id":null,"prompt":null,"prompt_cache_key":null,"safety_identifier":null,"service_tier":"default",
        "reasoning":{"effort":"low","summary":"auto"},"text":{"format":{"type":"text"},"verbosity":"medium"},"top_logprobs":0,"truncation":"disabled","user":null,
        "usage":{"input_tokens":2,"output_tokens":1},"output":[
            {"type":"reasoning","id":"reasoning-fixture","status":"completed","summary":[{"type":"summary_text","text":"fixture-secret"}]},
            {"type":"message","role":"assistant","content":[{"type":"output_text","text":"ordinary","annotations":[]}]}
        ]}"#).unwrap();
        let redacted = inspect(
            Protocol::Responses,
            &body,
            &[TextRule::compile("fixture-secret", Action::Redact).unwrap()],
        )
        .unwrap();
        assert_eq!(redacted["metadata"]["note/~"], "[REDACTED]");
        assert_eq!(redacted["instructions"], "[REDACTED]");
        assert_eq!(redacted["output"][0]["summary"][0]["text"], "[REDACTED]");
        assert_eq!(redacted["usage"], body["usage"]);
        assert_eq!(
            inspect(
                Protocol::Responses,
                &body,
                &[TextRule::compile("fixture-secret", Action::Block).unwrap()]
            ),
            Err(InspectionError::Blocked)
        );
        for (field, value) in [
            ("reasoning", json!({"unknown":"fixture-secret"})),
            ("tools", json!([{"type":"function"}])),
            ("text", json!({"format":{"type":"json_schema","schema":{}}})),
        ] {
            let mut invalid = body.clone();
            invalid[field] = value;
            assert_eq!(
                inspect(Protocol::Responses, &invalid, &[]),
                Err(InspectionError::UnsupportedContent)
            );
        }
        let mut opaque = body.clone();
        opaque["output"][0]["encrypted_content"] = json!("opaque-fixture");
        assert_eq!(
            inspect(Protocol::Responses, &opaque, &[]),
            Err(InspectionError::UnsupportedContent)
        );
        let mut growing = body.clone();
        growing["metadata"] = json!({"note":"x".repeat(100)});
        assert_eq!(
            inspect(
                Protocol::Responses,
                &growing,
                &[TextRule::compile("x", Action::Redact).unwrap()]
            ),
            Err(InspectionError::UnsupportedContent)
        );
    }

    #[test]
    fn all_candidates_refusals_and_visible_reasoning_are_inspected() {
        let rules = [TextRule::compile("秘密", Action::Redact).unwrap()];
        let body = json!({"id":"fixture","usage":{"prompt_tokens":7,"completion_tokens":9},"choices":[
            {"index":0,"message":{"role":"assistant","content":"秘密","reasoning_content":"秘密"}},
            {"index":1,"message":{"role":"assistant","content":null,"refusal":"秘密"}}
        ]});
        let result = inspect(Protocol::Chat, &body, &rules).unwrap();
        assert_eq!(result["usage"], body["usage"]);
        assert_eq!(result["choices"][0]["message"]["content"], "[REDACTED]");
        assert_eq!(
            result["choices"][0]["message"]["reasoning_content"],
            "[REDACTED]"
        );
        assert_eq!(result["choices"][1]["message"]["refusal"], "[REDACTED]");
        assert_eq!(body["choices"][0]["message"]["content"], "秘密");
    }

    #[test]
    fn responses_duplicate_text_and_nested_parts_are_transformed_together() {
        let body = json!({"output_text":"fixture-secret","output":[{"type":"message","role":"assistant","content":[
            {"type":"output_text","text":"fixture-secret","annotations":[]},
            {"type":"refusal","refusal":"fixture-secret"}
        ]}]});
        let redact = TextRule::compile("fixture-secret", Action::Redact).unwrap();
        let result = inspect(Protocol::Responses, &body, &[redact]).unwrap();
        assert!(!result.to_string().contains("fixture-secret"));
        let rules = [
            TextRule::compile("fixture-secret", Action::Redact).unwrap(),
            TextRule::compile("fixture-secret", Action::Block).unwrap(),
        ];
        assert_eq!(
            inspect(Protocol::Responses, &body, &rules),
            Err(InspectionError::Blocked)
        );
    }

    #[test]
    fn opaque_content_and_malformed_candidates_are_rejected() {
        for body in [
            json!({"choices":[]}),
            json!({"choices":[{"message":{"role":"assistant","content":"ok","tool_calls":[]}}]}),
            json!({"choices":[{"message":{"role":"assistant","content":[{"type":"audio"}]}}]}),
            json!({"choices":[{"logprobs":{"content":[{"token":"secret"}]},"message":{"role":"assistant","content":"ok"}}]}),
        ] {
            assert_eq!(
                inspect(Protocol::Chat, &body, &[]),
                Err(InspectionError::UnsupportedContent)
            );
        }
        for item in [
            json!({"type":"function_call","arguments":"secret"}),
            json!({"type":"reasoning","summary":[]}),
            json!({"type":"message","role":"assistant","content":[{"type":"output_text","text":"ok","annotations":[{"text":"secret"}]}]}),
        ] {
            assert_eq!(
                inspect(Protocol::Responses, &json!({"output":[item]}), &[]),
                Err(InspectionError::UnsupportedContent)
            );
        }
        assert_eq!(
            inspect(Protocol::Embeddings, &json!({"data":[]}), &[]),
            Err(InspectionError::UnsupportedContent)
        );
    }

    #[test]
    fn complete_response_size_and_redaction_growth_are_bounded() {
        let body =
            json!({"choices":[{"message":{"role":"assistant","content":"x".repeat(1024*1024)}}]});
        assert_eq!(
            inspect(Protocol::Chat, &body, &[]),
            Err(InspectionError::ResourceLimit)
        );
        let body =
            json!({"choices":[{"message":{"role":"assistant","content":"x".repeat(150_000)}}]});
        let rule = TextRule::compile("x", Action::Redact).unwrap();
        assert_eq!(
            inspect(Protocol::Chat, &body, &[rule]),
            Err(InspectionError::ResourceLimit)
        );
    }
}
