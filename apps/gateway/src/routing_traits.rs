//! Normalized request traits shared by routing preview and inference dispatch.
//!
//! Each inference protocol exposes a different native request shape. Routing must
//! derive the same validated requirements from that shape before filtering pool
//! candidates. This module owns the protocol support matrix, the native trait
//! extractors and the single trait-to-requirements conversion used by both
//! `/v1/routing/preview` and the inference handlers.
//!
//! Unsupported traits are never silently discarded: a protocol that cannot carry
//! an image, tool declaration, structured-output instruction or reasoning control
//! rejects the request (or the preview context) explicitly before candidate
//! filtering.

use crate::config::ModelRequirements;
use crate::error::ApiError;
use crate::guardrails::input::Protocol;
use serde_json::Value;
use uuid::Uuid;

/// A normalized request capability. These are routing requirements, not proof
/// that the eventual upstream model will honour them.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum RequestTrait {
    Streaming,
    Vision,
    Tools,
    StructuredOutput,
    Reasoning,
    TokenBounds,
    EmbeddingDimensions,
    EmbeddingBase64,
}

/// Normalized, protocol-independent request traits extracted from a native body
/// or declared by a preview context.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub(crate) struct RequestTraits {
    pub streaming: bool,
    pub vision: bool,
    pub tools: bool,
    pub structured_output: bool,
    pub reasoning: bool,
    pub embedding_dimensions: bool,
    pub embedding_base64: bool,
    /// Conservative character-based estimate, never exact tokenization.
    pub estimated_input_tokens: Option<u64>,
    pub requested_output_tokens: Option<u64>,
}

/// Which traits a protocol adapter can actually carry through to an upstream
/// request. Anything outside this set is rejected explicitly, not dropped.
pub(crate) fn supports(protocol: Protocol, request_trait: RequestTrait) -> bool {
    use RequestTrait::*;
    match protocol {
        Protocol::Chat => matches!(
            request_trait,
            Streaming | Vision | Tools | StructuredOutput | Reasoning | TokenBounds
        ),
        // The implemented Responses subset is buffered or streamed text only.
        Protocol::Responses => matches!(request_trait, Streaming | TokenBounds),
        // Native Messages supports client tools and text streaming; media,
        // extended thinking and structured output remain unimplemented.
        Protocol::Messages => matches!(request_trait, Streaming | Tools | TokenBounds),
        // The implemented GenerateContent subset is buffered text only.
        Protocol::GenerateContent => matches!(request_trait, TokenBounds),
        Protocol::Embeddings => matches!(
            request_trait,
            TokenBounds | EmbeddingDimensions | EmbeddingBase64
        ),
        Protocol::VideoText => false,
    }
}

/// One trait at a time: caller order determines which explicit error is returned
/// when several unsupported traits are present.
fn unsupported_message(protocol: Protocol, request_trait: RequestTrait) -> &'static str {
    use RequestTrait::*;
    match (protocol, request_trait) {
        (Protocol::Embeddings, Streaming) => "Embeddings do not support streaming requests",
        (Protocol::Embeddings, Vision) => "Embeddings do not support image inputs",
        (Protocol::Embeddings, Tools) => "Embeddings do not support tool declarations",
        (Protocol::Embeddings, StructuredOutput) => "Embeddings do not support structured output",
        (Protocol::Embeddings, Reasoning) => "Embeddings do not support reasoning controls",
        (_, EmbeddingDimensions) => {
            "Embedding dimensions are only supported by the Embeddings protocol"
        }
        (_, EmbeddingBase64) => {
            "Base64 embedding output is only supported by the Embeddings protocol"
        }
        (Protocol::Responses, Vision) => "Responses requests do not support image inputs",
        (Protocol::Responses, Tools) => "Responses requests do not support tool declarations",
        (Protocol::Responses, StructuredOutput) => {
            "Responses requests do not support structured output"
        }
        (Protocol::Responses, Reasoning) => "Responses requests do not support reasoning controls",
        (Protocol::Messages, Vision) => "Messages requests do not support image or document inputs",
        (Protocol::Messages, StructuredOutput) => {
            "Messages requests do not support structured output"
        }
        (Protocol::Messages, Reasoning) => "Messages requests do not support extended thinking",
        (Protocol::GenerateContent, Streaming) => {
            "GenerateContent supports buffered requests only; streaming is not implemented"
        }
        (Protocol::GenerateContent, Vision) => {
            "GenerateContent requests do not support media inputs"
        }
        (Protocol::GenerateContent, Tools) => {
            "GenerateContent requests do not support tool declarations"
        }
        (Protocol::GenerateContent, StructuredOutput) => {
            "GenerateContent requests do not support structured output"
        }
        (Protocol::GenerateContent, Reasoning) => {
            "GenerateContent requests do not support thinking configuration"
        }
        (Protocol::VideoText, _) => "Video text requests are not routable through model pools",
        // Supported trait/protocol pairs never reach this helper. Keep a
        // defensive message for future matrix edits instead of a silent pass.
        _ => "This protocol does not support the requested trait",
    }
}

/// Reject traits that the selected protocol cannot express. Dispatch calls this
/// before pool selection; preview calls it for the declared context.
pub(crate) fn require_supported(
    protocol: Protocol,
    traits: &RequestTraits,
) -> Result<(), ApiError> {
    if protocol == Protocol::VideoText {
        return Err(ApiError::invalid_request(
            "Video text requests are not routable through model pools",
        ));
    }
    for (requested, request_trait) in [
        (traits.streaming, RequestTrait::Streaming),
        (traits.vision, RequestTrait::Vision),
        (traits.tools, RequestTrait::Tools),
        (traits.structured_output, RequestTrait::StructuredOutput),
        (traits.reasoning, RequestTrait::Reasoning),
        (
            traits.estimated_input_tokens.is_some() || traits.requested_output_tokens.is_some(),
            RequestTrait::TokenBounds,
        ),
        (
            traits.embedding_dimensions,
            RequestTrait::EmbeddingDimensions,
        ),
        (traits.embedding_base64, RequestTrait::EmbeddingBase64),
    ] {
        if requested && !supports(protocol, request_trait) {
            return Err(ApiError::invalid_request(unsupported_message(
                protocol,
                request_trait,
            )));
        }
    }
    Ok(())
}

impl RequestTraits {
    /// The single normalization point into candidate-filter requirements. The
    /// Messages protocol uses its own capability flags because native streaming
    /// and native tools are separate route declarations.
    pub(crate) fn requirements(
        self,
        project_id: Option<Uuid>,
        protocol: Protocol,
    ) -> ModelRequirements {
        let messages = protocol == Protocol::Messages;
        ModelRequirements {
            project_id,
            streaming: self.streaming && !messages,
            messages_streaming: self.streaming && messages,
            messages_tools: self.tools && messages,
            messages_streaming_tools: self.tools && self.streaming && messages,
            tools: self.tools && !messages,
            streaming_tools: self.tools && self.streaming && !messages,
            structured_output: self.structured_output,
            embedding_dimensions: self.embedding_dimensions,
            embedding_base64: self.embedding_base64,
            vision: self.vision,
            reasoning: self.reasoning,
            estimated_input_tokens: self.estimated_input_tokens,
            requested_output_tokens: self.requested_output_tokens,
        }
    }
}

/// Derive normalized traits from a protocol-native request body. Detection is
/// intentionally independent from field validation: an unsupported trait must be
/// visible to `require_supported`, not silently absent from requirements.
pub(crate) fn extract(protocol: Protocol, body: &Value) -> RequestTraits {
    match protocol {
        Protocol::Chat => chat(body),
        Protocol::Responses => responses(body),
        Protocol::Messages => messages(body),
        Protocol::GenerateContent => generate_content(body),
        Protocol::Embeddings => embeddings(body),
        Protocol::VideoText => RequestTraits::default(),
    }
}

fn bool_field(body: &Value, field: &str) -> bool {
    body.get(field).and_then(Value::as_bool) == Some(true)
}

fn estimate_tokens(chars: usize) -> u64 {
    ((chars.saturating_add(3)) / 4).max(1) as u64
}

fn string_chars(value: &Value) -> usize {
    value.as_str().map_or(0, |text| text.chars().count())
}

fn chat(body: &Value) -> RequestTraits {
    let mut traits = RequestTraits {
        streaming: bool_field(body, "stream"),
        ..Default::default()
    };
    let mut input_chars = 0usize;
    let mut has_vision = false;
    let mut has_tool_history = false;
    if let Some(messages) = body.get("messages").and_then(Value::as_array) {
        for message in messages {
            if message.get("role").and_then(Value::as_str) == Some("tool")
                || message.get("tool_calls").is_some()
            {
                has_tool_history = true;
            }
            match message.get("content") {
                Some(Value::String(text)) => {
                    input_chars = input_chars.saturating_add(text.chars().count());
                }
                Some(Value::Array(parts)) => {
                    for part in parts {
                        input_chars = input_chars.saturating_add(string_chars(&part["text"]));
                        if matches!(
                            part.get("type").and_then(Value::as_str),
                            Some("image_url" | "input_image" | "image")
                        ) {
                            has_vision = true;
                        }
                    }
                }
                _ => {}
            }
        }
    }
    traits.tools = body.get("tools").is_some() || has_tool_history;
    traits.structured_output = matches!(
        body.pointer("/response_format/type")
            .and_then(Value::as_str),
        Some("json_object" | "json_schema")
    );
    traits.reasoning = body.get("reasoning").is_some()
        || body.get("reasoning_effort").is_some()
        || body.get("include_reasoning").and_then(Value::as_bool) == Some(true);
    traits.vision = has_vision;
    traits.estimated_input_tokens = Some(estimate_tokens(input_chars));
    traits.requested_output_tokens = body
        .get("max_completion_tokens")
        .and_then(Value::as_u64)
        .or_else(|| body.get("max_tokens").and_then(Value::as_u64));
    traits
}

fn responses(body: &Value) -> RequestTraits {
    let mut traits = RequestTraits {
        streaming: bool_field(body, "stream"),
        ..Default::default()
    };
    traits.tools = body.get("tools").is_some() || body.get("tool_choice").is_some();
    traits.structured_output = matches!(
        body.pointer("/text/format/type").and_then(Value::as_str),
        Some("json_object" | "json_schema")
    ) || body.get("response_format").is_some();
    traits.reasoning = body.get("reasoning").is_some()
        || body.get("reasoning_effort").is_some()
        || body
            .get("include")
            .and_then(Value::as_array)
            .is_some_and(|items| {
                items.iter().any(|item| {
                    item.as_str()
                        .is_some_and(|value| value.starts_with("reasoning"))
                })
            });
    traits.vision = body.get("input").is_some_and(response_input_has_media);
    let input_chars = match body.get("input") {
        Some(Value::String(text)) => text.chars().count(),
        Some(input) => text_field_chars(input),
        None => 0,
    }
    .saturating_add(string_chars(&body["instructions"]));
    traits.estimated_input_tokens = Some(estimate_tokens(input_chars));
    traits.requested_output_tokens = body.get("max_output_tokens").and_then(Value::as_u64);
    traits
}

fn messages(body: &Value) -> RequestTraits {
    let mut traits = RequestTraits {
        streaming: bool_field(body, "stream"),
        ..Default::default()
    };
    traits.tools = body.get("tools").is_some()
        || body.get("tool_choice").is_some()
        || body
            .get("messages")
            .is_some_and(message_list_has_tool_blocks);
    traits.structured_output = body.pointer("/output_config/format").is_some()
        || body.pointer("/output_config/response_format").is_some()
        || body.get("response_format").is_some();
    traits.reasoning =
        body.get("thinking").is_some() || body.pointer("/output_config/effort").is_some();
    traits.vision = body.get("messages").is_some_and(message_list_has_media);
    let mut input_chars = content_chars(&body["system"]);
    if let Some(messages) = body.get("messages").and_then(Value::as_array) {
        for message in messages {
            input_chars = input_chars.saturating_add(content_chars(&message["content"]));
        }
    }
    traits.estimated_input_tokens = Some(estimate_tokens(input_chars));
    traits.requested_output_tokens = body.get("max_tokens").and_then(Value::as_u64);
    traits
}

fn generate_content(body: &Value) -> RequestTraits {
    let input_chars = text_field_chars(&body["contents"])
        .saturating_add(text_field_chars(&body["systemInstruction"]));
    RequestTraits {
        tools: body.get("tools").is_some() || body.get("toolConfig").is_some(),
        structured_output: body
            .pointer("/generationConfig/responseMimeType")
            .and_then(Value::as_str)
            == Some("application/json")
            || body.pointer("/generationConfig/responseSchema").is_some()
            || body
                .pointer("/generationConfig/responseJsonSchema")
                .is_some(),
        reasoning: body.pointer("/generationConfig/thinkingConfig").is_some()
            || body.pointer("/thinkingConfig").is_some(),
        vision: body.get("contents").is_some_and(|contents| {
            contains_any_key(
                contents,
                &["inlineData", "inline_data", "fileData", "file_data"],
            )
        }),
        estimated_input_tokens: Some(estimate_tokens(input_chars)),
        requested_output_tokens: body
            .pointer("/generationConfig/maxOutputTokens")
            .and_then(Value::as_u64),
        ..Default::default()
    }
}

fn embeddings(body: &Value) -> RequestTraits {
    RequestTraits {
        embedding_dimensions: body.get("dimensions").is_some(),
        embedding_base64: body.get("encoding_format").and_then(Value::as_str) == Some("base64"),
        ..Default::default()
    }
}

/// Sum human-readable `text` fields without counting URLs, IDs, roles or tool
/// schemas. A bare string is only counted by the caller when it is the complete
/// text input, never as a nested structural value.
fn text_field_chars(value: &Value) -> usize {
    match value {
        Value::String(_) => 0,
        Value::Array(items) => items.iter().map(text_field_chars).sum(),
        Value::Object(object) => {
            if let Some(text) = object.get("text").and_then(Value::as_str) {
                text.chars().count()
            } else {
                object.values().map(text_field_chars).sum()
            }
        }
        _ => 0,
    }
}

/// Messages text content is either a string or a list of content blocks. Tool
/// result blocks nest their own text content; tool arguments are excluded.
fn content_chars(value: &Value) -> usize {
    match value {
        Value::String(text) => text.chars().count(),
        Value::Array(items) => items.iter().map(content_chars).sum(),
        Value::Object(object) => {
            if let Some(text) = object.get("text").and_then(Value::as_str) {
                text.chars().count()
            } else if let Some(content) = object.get("content") {
                content_chars(content)
            } else {
                0
            }
        }
        _ => 0,
    }
}

/// Responses image inputs are content parts. Restrict detection to the input
/// item envelope so arbitrary values inside function-call payloads cannot
/// masquerade as images.
fn response_input_has_media(input: &Value) -> bool {
    let Some(items) = input.as_array() else {
        return false;
    };
    items.iter().any(|item| {
        item.get("type")
            .and_then(Value::as_str)
            .is_some_and(|kind| matches!(kind, "input_image" | "image" | "image_url"))
            || item
                .get("content")
                .is_some_and(|content| content_parts_have_media(content, 0))
    })
}

/// Tool-use history also needs a route declaring native tool support, matching
/// the Chat tool-history rule.
fn message_list_has_tool_blocks(messages: &Value) -> bool {
    let Some(messages) = messages.as_array() else {
        return false;
    };
    messages.iter().any(|message| {
        message
            .get("content")
            .and_then(Value::as_array)
            .is_some_and(|parts| {
                parts.iter().any(|part| {
                    matches!(
                        part.get("type").and_then(Value::as_str),
                        Some("tool_use" | "tool_result")
                    )
                })
            })
    })
}

fn message_list_has_media(messages: &Value) -> bool {
    let Some(messages) = messages.as_array() else {
        return false;
    };
    messages.iter().any(|message| {
        message
            .get("content")
            .is_some_and(|content| content_parts_have_media(content, 0))
    })
}

/// Only inspect content-block types and nested tool-result content. Tool-use
/// arguments are deliberately excluded: a JSON schema or input value named
/// `image` is not an image request.
fn content_parts_have_media(content: &Value, depth: u8) -> bool {
    if depth > 2 {
        return false;
    }
    let Value::Array(parts) = content else {
        return false;
    };
    parts.iter().any(|part| {
        part.get("type")
            .and_then(Value::as_str)
            .is_some_and(|kind| matches!(kind, "image" | "document" | "input_image" | "image_url"))
            || part
                .get("content")
                .is_some_and(|nested| content_parts_have_media(nested, depth + 1))
    })
}

fn contains_any_key(value: &Value, keys: &[&str]) -> bool {
    match value {
        Value::Array(items) => items.iter().any(|item| contains_any_key(item, keys)),
        Value::Object(object) => {
            object.keys().any(|key| keys.contains(&key.as_str()))
                || object.values().any(|item| contains_any_key(item, keys))
        }
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn fixture(source: &str) -> Value {
        serde_json::from_str(source).expect("fixture must be valid JSON")
    }

    fn protocol(name: &str) -> Protocol {
        match name {
            "chat" => Protocol::Chat,
            "responses" => Protocol::Responses,
            "messages" => Protocol::Messages,
            "generate_content" => Protocol::GenerateContent,
            "embeddings" => Protocol::Embeddings,
            other => panic!("unknown fixture protocol {other}"),
        }
    }

    fn supported_fixtures() -> Vec<(&'static str, Value, Value)> {
        vec![
            (
                "chat",
                fixture(include_str!(
                    "../tests/fixtures/routing-traits/chat-supported.json"
                )),
                json!({
                    "protocol": "chat",
                    "streaming": true,
                    "vision": true,
                    "tools": true,
                    "structured_output": true,
                    "reasoning": true,
                    "estimated_input_tokens": 3,
                    "requested_output_tokens": 256
                }),
            ),
            (
                "responses",
                fixture(include_str!(
                    "../tests/fixtures/routing-traits/responses-supported.json"
                )),
                json!({
                    "protocol": "responses",
                    "streaming": true,
                    "estimated_input_tokens": 3,
                    "requested_output_tokens": 128
                }),
            ),
            (
                "messages",
                fixture(include_str!(
                    "../tests/fixtures/routing-traits/messages-supported.json"
                )),
                json!({
                    "protocol": "messages",
                    "streaming": true,
                    "tools": true,
                    "estimated_input_tokens": 2,
                    "requested_output_tokens": 64
                }),
            ),
            (
                "generate_content",
                fixture(include_str!(
                    "../tests/fixtures/routing-traits/generate-content-supported.json"
                )),
                json!({
                    "protocol": "generate_content",
                    "estimated_input_tokens": 2,
                    "requested_output_tokens": 32
                }),
            ),
        ]
    }

    #[test]
    fn protocol_trait_matrix_is_explicit() {
        use RequestTrait::*;
        let cases = [
            (
                Protocol::Chat,
                vec![
                    Streaming,
                    Vision,
                    Tools,
                    StructuredOutput,
                    Reasoning,
                    TokenBounds,
                ],
            ),
            (Protocol::Responses, vec![Streaming, TokenBounds]),
            (Protocol::Messages, vec![Streaming, Tools, TokenBounds]),
            (Protocol::GenerateContent, vec![TokenBounds]),
            (
                Protocol::Embeddings,
                vec![TokenBounds, EmbeddingDimensions, EmbeddingBase64],
            ),
        ];
        let all = [
            Streaming,
            Vision,
            Tools,
            StructuredOutput,
            Reasoning,
            TokenBounds,
            EmbeddingDimensions,
            EmbeddingBase64,
        ];
        for (protocol, supported) in cases {
            for request_trait in all {
                assert_eq!(
                    supports(protocol, request_trait),
                    supported.contains(&request_trait),
                    "{protocol:?} support for {request_trait:?}"
                );
            }
        }
        for request_trait in all {
            assert!(!supports(Protocol::VideoText, request_trait));
        }
    }

    #[test]
    fn native_fixtures_extract_expected_traits_and_requirements() {
        for (name, request, preview) in supported_fixtures() {
            let protocol = protocol(name);
            let dispatch = extract(protocol, &request);
            let expected = extract_traits_from_preview(&preview);
            assert_eq!(dispatch, expected, "{name} native extraction");
            require_supported(protocol, &dispatch).unwrap_or_else(|_| {
                panic!("{name} supported fixture rejected by the support matrix")
            });
            assert_eq!(
                dispatch.requirements(Some(Uuid::nil()), protocol),
                expected.requirements(Some(Uuid::nil()), protocol),
                "{name} preview and dispatch requirements"
            );
        }
    }

    fn fixture_model(
        provider: &str,
        capability_fields: &str,
        catalog_fields: &str,
    ) -> crate::config::ModelConfig {
        toml::from_str(&format!(
            "provider = \"{provider}\"\n\
             upstream_model = \"fixture\"\n\
             api_key_env = \"FIXTURE_KEY\"\n\
             {capability_fields}\n\
             [catalog]\n\
             context_length = 8192\n\
             {catalog_fields}"
        ))
        .expect("fixture model")
    }

    #[test]
    fn preview_and_dispatch_filter_candidate_models_identically() {
        let chat_capable = fixture_model(
            "openai",
            "supports_tool_calls = true\n\
             supports_streaming_tool_calls = true\n\
             supports_structured_output = true\n\
             supports_responses = true",
            "input_modalities = [\"text\", \"image\"]\n\
             supported_parameters = [\"reasoning\"]\n\
             max_completion_tokens = 2048",
        );
        let openai_plain = fixture_model(
            "openai",
            "supports_responses = true",
            "max_completion_tokens = 2048",
        );
        let anthropic_tools = fixture_model(
            "anthropic",
            "supports_messages = true\n\
             supports_messages_streaming = true\n\
             supports_messages_tools = true\n\
             supports_messages_streaming_tools = true",
            "max_completion_tokens = 2048",
        );
        let anthropic_plain = fixture_model(
            "anthropic",
            "supports_messages = true\nsupports_messages_streaming = true",
            "max_completion_tokens = 2048",
        );
        let gemini_roomy = fixture_model(
            "gemini",
            "supports_generate_content = true",
            "max_completion_tokens = 64",
        );
        let gemini_tight = fixture_model(
            "gemini",
            "supports_generate_content = true",
            "max_completion_tokens = 16",
        );
        let models = [
            ("chat_capable", &chat_capable),
            ("openai_plain", &openai_plain),
            ("anthropic_tools", &anthropic_tools),
            ("anthropic_plain", &anthropic_plain),
            ("gemini_roomy", &gemini_roomy),
            ("gemini_tight", &gemini_tight),
        ];
        for (name, request, preview) in supported_fixtures() {
            let protocol = protocol(name);
            let dispatch = extract(protocol, &request).requirements(Some(Uuid::nil()), protocol);
            let context: crate::web::PreviewContext =
                serde_json::from_value(preview).expect("preview context");
            let declared = context
                .requirements(Some(Uuid::nil()))
                .expect("supported preview context");
            assert_eq!(dispatch, declared, "{name} requirements parity");

            let dispatch_eligible: Vec<_> = models
                .iter()
                .filter(|(_, model)| {
                    crate::vendors::supports_protocol(model, &protocol) && dispatch.allows(model)
                })
                .map(|(label, _)| *label)
                .collect();
            let preview_eligible: Vec<_> = models
                .iter()
                .filter(|(_, model)| {
                    crate::vendors::supports_protocol(model, &protocol) && declared.allows(model)
                })
                .map(|(label, _)| *label)
                .collect();
            assert_eq!(
                dispatch_eligible, preview_eligible,
                "{name} candidate eligibility parity"
            );
            let expected = match name {
                "chat" => vec!["chat_capable"],
                "responses" => vec!["chat_capable", "openai_plain"],
                "messages" => vec!["anthropic_tools"],
                "generate_content" => vec!["gemini_roomy"],
                other => panic!("unknown fixture {other}"),
            };
            assert_eq!(dispatch_eligible, expected, "{name} expected candidates");
        }
    }

    #[test]
    fn messages_media_detection_ignores_tool_arguments() {
        let tool_arguments = json!({
            "model": "pool/assistant",
            "max_tokens": 16,
            "messages": [{
                "role": "assistant",
                "content": [{
                    "type": "tool_use",
                    "id": "toolu_1",
                    "name": "lookup",
                    "input": {"type": "image", "url": "https://example.invalid/image.png"}
                }]
            }]
        });
        let traits = extract(Protocol::Messages, &tool_arguments);
        assert!(!traits.vision, "tool arguments are not image inputs");
        assert!(traits.tools);

        let tool_result_image = json!({
            "model": "pool/assistant",
            "max_tokens": 16,
            "messages": [{
                "role": "user",
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": "toolu_1",
                    "content": [{
                        "type": "image",
                        "source": {"type": "base64", "media_type": "image/png", "data": "AAAA"}
                    }]
                }]
            }]
        });
        assert!(extract(Protocol::Messages, &tool_result_image).vision);
    }

    #[test]
    fn messages_output_config_effort_is_reasoning_not_structured_output() {
        let effort_only = json!({
            "model": "pool/assistant",
            "max_tokens": 16,
            "messages": [{"role": "user", "content": "hi"}],
            "output_config": {"effort": "high"}
        });
        let traits = extract(Protocol::Messages, &effort_only);
        assert!(traits.reasoning);
        assert!(!traits.structured_output);

        let structured = json!({
            "model": "pool/assistant",
            "max_tokens": 16,
            "messages": [{"role": "user", "content": "hi"}],
            "output_config": {"format": {"type": "json_schema", "schema": {"type": "object"}}}
        });
        assert!(extract(Protocol::Messages, &structured).structured_output);
    }

    #[test]
    fn unsupported_native_traits_are_rejected_explicitly() {
        let fixtures = [
            (
                "responses",
                fixture(include_str!(
                    "../tests/fixtures/routing-traits/responses-unsupported.json"
                )),
                json!({
                    "protocol": "responses",
                    "streaming": true,
                    "vision": true,
                    "tools": true,
                    "structured_output": true,
                    "reasoning": true
                }),
                "Responses requests do not support image inputs",
            ),
            (
                "messages",
                fixture(include_str!(
                    "../tests/fixtures/routing-traits/messages-unsupported.json"
                )),
                json!({
                    "protocol": "messages",
                    "vision": true,
                    "structured_output": true,
                    "reasoning": true
                }),
                "Messages requests do not support image or document inputs",
            ),
            (
                "generate_content",
                fixture(include_str!(
                    "../tests/fixtures/routing-traits/generate-content-unsupported.json"
                )),
                json!({
                    "protocol": "generate_content",
                    "vision": true,
                    "tools": true,
                    "structured_output": true,
                    "reasoning": true
                }),
                "GenerateContent requests do not support media inputs",
            ),
        ];
        for (name, request, preview, message) in fixtures {
            let protocol = protocol(name);
            let dispatch = extract(protocol, &request);
            let preview_traits = extract_traits_from_preview(&preview);
            let dispatch_error = require_supported(protocol, &dispatch)
                .expect_err("unsupported native traits must be rejected");
            let preview_error = require_supported(protocol, &preview_traits)
                .expect_err("equivalent preview context must be rejected");
            assert_eq!(
                dispatch_error.test_message(),
                preview_error.test_message(),
                "{name} dispatch/preview rejection parity"
            );
            assert!(
                dispatch_error.test_message().contains(message),
                "{name} explicit message: {}",
                dispatch_error.test_message()
            );
        }
    }

    #[test]
    fn preview_defaults_match_native_extraction_for_supported_fixtures() {
        for (name, request, preview) in supported_fixtures() {
            let protocol = protocol(name);
            let native = extract(protocol, &request);
            let declared = extract_traits_from_preview(&preview);
            let preview_json: Value = preview;
            let context: crate::web::PreviewContext =
                serde_json::from_value(preview_json).expect("preview context");
            assert_eq!(
                declared.requirements(Some(Uuid::nil()), protocol),
                context
                    .requirements(Some(Uuid::nil()))
                    .expect("supported preview context"),
                "{name} context normalization"
            );
            assert_eq!(
                native.requirements(Some(Uuid::nil()), protocol),
                context
                    .requirements(Some(Uuid::nil()))
                    .expect("supported preview context"),
                "{name} dispatch/preview requirements parity"
            );
        }
    }

    fn extract_traits_from_preview(value: &Value) -> RequestTraits {
        RequestTraits {
            streaming: value.get("streaming").and_then(Value::as_bool) == Some(true),
            vision: value.get("vision").and_then(Value::as_bool) == Some(true),
            tools: value.get("tools").and_then(Value::as_bool) == Some(true),
            structured_output: value.get("structured_output").and_then(Value::as_bool)
                == Some(true),
            reasoning: value.get("reasoning").and_then(Value::as_bool) == Some(true),
            embedding_dimensions: value.get("embedding_dimensions").and_then(Value::as_bool)
                == Some(true),
            embedding_base64: value.get("embedding_base64").and_then(Value::as_bool) == Some(true),
            estimated_input_tokens: value.get("estimated_input_tokens").and_then(Value::as_u64),
            requested_output_tokens: value.get("requested_output_tokens").and_then(Value::as_u64),
        }
    }
}
