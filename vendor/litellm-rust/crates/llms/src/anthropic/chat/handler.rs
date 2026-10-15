use std::collections::HashMap;

use litellm_core_utils::core_helpers::{finish_reason_for, unix_now, usage_from_parts};
use litellm_types::{
    llms::openai::{
        ChatCompletionThinkingBlock, ChatCompletionToolCallChunk,
        ChatCompletionToolCallFunctionChunk,
    },
    utils::{
        ChatCompletionChunk, ChatCompletionDelta, ChatCompletionStreamingChoice,
        ChatCompletionsUsage,
    },
};
use serde_json::{Map, Value, json};

use crate::{
    anthropic::experimental_pass_through::messages::streaming_iterator::{
        AnthropicContentBlock, AnthropicContentBlockDelta, AnthropicMessagesStreamEvent,
        AnthropicStreamUsage,
    },
    base_llm::{base_model_iterator::StreamTransformer, chat::transformation::Error},
};

const RESPONSE_FORMAT_TOOL_NAME: &str = "json_tool_call";
const MAX_ACCUMULATED_JSON_BYTES: usize = 4 * 1024 * 1024;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AnthropicJsonChunkType {
    ValidJson,
    AccumulatedJson,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AnthropicContentBlockType {
    Text,
    ToolUse,
    ServerToolUse,
    Thinking,
    RedactedThinking,
    Compaction,
    ToolResult(String),
    Other(String),
}

impl AnthropicContentBlockType {
    fn from_block_type(block_type: &str) -> Self {
        match block_type {
            "text" => Self::Text,
            "tool_use" => Self::ToolUse,
            "server_tool_use" => Self::ServerToolUse,
            "thinking" => Self::Thinking,
            "redacted_thinking" => Self::RedactedThinking,
            "compaction" => Self::Compaction,
            other if other.ends_with("_tool_result") => Self::ToolResult(other.to_string()),
            other => Self::Other(other.to_string()),
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct AnthropicContentBlockDeltaEvent {
    pub index: u64,
    pub delta: AnthropicContentBlockDelta,
}

pub struct AnthropicChatCompletionsStreamTransformer {
    pub content_blocks: Vec<AnthropicContentBlockDeltaEvent>,
    pub tool_index: i64,
    pub json_mode: bool,
    pub speed: Option<String>,
    pub tool_name_reverse_map: HashMap<String, String>,
    pub response_id: String,
    pub served_model: Option<String>,
    pub is_response_format_tool: bool,
    pub converted_response_format_tool: bool,
    pub accumulated_json: String,
    pub chunk_type: AnthropicJsonChunkType,
    pub current_content_block_type: Option<AnthropicContentBlockType>,
    pub web_search_results: Vec<Value>,
    pub web_search_calls: HashMap<String, Value>,
    pub compaction_blocks: Vec<Value>,
    pub reasoning_content_chunks: Vec<String>,
    pub server_tool_inputs: HashMap<String, Value>,
    pub tool_results: Vec<Value>,
    pub current_server_tool_id: Option<String>,
    pub container_id: Option<String>,
}

impl AnthropicChatCompletionsStreamTransformer {
    pub fn new(
        json_mode: bool,
        speed: Option<String>,
        tool_name_reverse_map: HashMap<String, String>,
    ) -> Self {
        Self {
            content_blocks: Vec::new(),
            tool_index: -1,
            json_mode,
            speed,
            tool_name_reverse_map,
            response_id: String::new(),
            served_model: None,
            is_response_format_tool: false,
            converted_response_format_tool: false,
            accumulated_json: String::new(),
            chunk_type: AnthropicJsonChunkType::ValidJson,
            current_content_block_type: None,
            web_search_results: Vec::new(),
            web_search_calls: HashMap::new(),
            compaction_blocks: Vec::new(),
            reasoning_content_chunks: Vec::new(),
            server_tool_inputs: HashMap::new(),
            tool_results: Vec::new(),
            current_server_tool_id: None,
            container_id: None,
        }
    }

    fn build_chunk(
        &self,
        delta: ChatCompletionDelta,
        finish_reason: Option<String>,
        usage: Option<ChatCompletionsUsage>,
        provider_specific_fields: Option<Map<String, Value>>,
    ) -> ChatCompletionChunk {
        ChatCompletionChunk {
            id: self.response_id.clone(),
            created: unix_now(),
            model: self.served_model.clone(),
            object: "chat.completion.chunk".to_string(),
            choices: vec![ChatCompletionStreamingChoice {
                index: 0,
                delta,
                finish_reason,
                logprobs: None,
            }],
            usage,
            provider_specific_fields,
        }
    }

    pub fn check_empty_tool_call_args(&self) -> bool {
        self.current_content_block_type == Some(AnthropicContentBlockType::ToolUse)
            && !self.is_response_format_tool
            && !self.content_blocks.iter().any(|event| {
                matches!(
                    &event.delta,
                    AnthropicContentBlockDelta::InputJsonDelta { partial_json }
                        if !partial_json.is_empty()
                )
            })
    }

    pub fn handle_usage(&mut self, usage: AnthropicStreamUsage) -> ChatCompletionsUsage {
        usage_from_parts(
            usage.input_tokens,
            usage.output_tokens,
            usage.cache_read_input_tokens,
            usage.cache_creation_input_tokens,
        )
    }

    pub fn handle_content_block_delta(
        &mut self,
        index: u64,
        delta: AnthropicContentBlockDelta,
    ) -> (
        String,
        Option<ChatCompletionToolCallChunk>,
        Vec<ChatCompletionThinkingBlock>,
        Option<Value>,
        Option<String>,
    ) {
        self.content_blocks.push(AnthropicContentBlockDeltaEvent {
            index,
            delta: delta.clone(),
        });
        match delta {
            AnthropicContentBlockDelta::TextDelta { text } => (text, None, Vec::new(), None, None),
            AnthropicContentBlockDelta::InputJsonDelta { partial_json } => {
                if self.current_content_block_type == Some(AnthropicContentBlockType::ServerToolUse)
                {
                    if let Some(tool_id) = &self.current_server_tool_id {
                        let entry = self
                            .server_tool_inputs
                            .entry(tool_id.clone())
                            .or_insert_with(|| Value::String(String::new()));
                        if let Value::String(buf) = entry
                            && buf.len().saturating_add(partial_json.len())
                                <= MAX_ACCUMULATED_JSON_BYTES
                        {
                            buf.push_str(&partial_json);
                        }
                    }
                    return (String::new(), None, Vec::new(), None, None);
                }
                let tool_use = ChatCompletionToolCallChunk {
                    id: None,
                    tool_type: "function".to_string(),
                    function: ChatCompletionToolCallFunctionChunk {
                        name: None,
                        arguments: partial_json,
                        provider_specific_fields: None,
                    },
                    index: self.tool_index.max(0),
                };
                let (text, tool_use) = self.handle_json_mode_chunk(String::new(), Some(tool_use));
                (text, tool_use, Vec::new(), None, None)
            }
            AnthropicContentBlockDelta::Citations { citation } => {
                (String::new(), None, Vec::new(), Some(citation), None)
            }
            AnthropicContentBlockDelta::ThinkingDelta { thinking } => {
                self.reasoning_content_chunks.push(thinking.clone());
                let block = ChatCompletionThinkingBlock::Thinking {
                    thinking: Some(thinking.clone()),
                    signature: None,
                    cache_control: None,
                };
                (String::new(), None, vec![block], None, Some(thinking))
            }
            AnthropicContentBlockDelta::SignatureDelta { signature } => {
                let block = ChatCompletionThinkingBlock::Thinking {
                    thinking: Some(String::new()),
                    signature: Some(signature),
                    cache_control: None,
                };
                (String::new(), None, vec![block], None, None)
            }
            AnthropicContentBlockDelta::CompactionDelta { content } => {
                self.compaction_blocks.push(json!({
                    "type": "compaction",
                    "content": content,
                }));
                (String::new(), None, Vec::new(), None, None)
            }
        }
    }

    pub fn handle_content_block_start(
        &mut self,
        index: u64,
        content_block: AnthropicContentBlock,
    ) -> Result<ChatCompletionChunk, Error> {
        self.content_blocks.clear();
        let kind = AnthropicContentBlockType::from_block_type(&content_block.block_type);
        self.current_content_block_type = Some(kind.clone());

        let mut delta = ChatCompletionDelta::default();
        match kind {
            AnthropicContentBlockType::Text => {
                delta.content = Some(content_block.text.unwrap_or_default());
            }
            AnthropicContentBlockType::ToolUse => {
                let raw_name = content_block.name.clone().unwrap_or_default();
                let mapped_name = self
                    .tool_name_reverse_map
                    .get(&raw_name)
                    .cloned()
                    .unwrap_or(raw_name);
                if self.json_mode && mapped_name == RESPONSE_FORMAT_TOOL_NAME {
                    self.is_response_format_tool = true;
                    self.converted_response_format_tool = true;
                    delta.content = Some(String::new());
                } else {
                    self.is_response_format_tool = false;
                    self.tool_index = self.tool_index.saturating_add(1);
                    delta.tool_calls = Some(vec![ChatCompletionToolCallChunk {
                        id: content_block.id,
                        tool_type: "function".to_string(),
                        function: ChatCompletionToolCallFunctionChunk {
                            name: Some(mapped_name),
                            arguments: String::new(),
                            provider_specific_fields: None,
                        },
                        index: self.tool_index,
                    }]);
                }
            }
            AnthropicContentBlockType::ServerToolUse => {
                self.current_server_tool_id = content_block.id.clone();
                if let Some(id) = content_block.id {
                    self.web_search_calls.insert(
                        id.clone(),
                        json!({
                            "id": id,
                            "index": index,
                            "name": content_block.name,
                            "status": "in_progress",
                        }),
                    );
                }
            }
            AnthropicContentBlockType::Thinking => {
                if let Some(thinking) = content_block.thinking
                    && !thinking.is_empty()
                {
                    self.reasoning_content_chunks.push(thinking.clone());
                    delta.reasoning_content = Some(thinking.clone());
                    delta.thinking_blocks = Some(vec![ChatCompletionThinkingBlock::Thinking {
                        thinking: Some(thinking),
                        signature: content_block.signature,
                        cache_control: None,
                    }]);
                }
            }
            AnthropicContentBlockType::RedactedThinking => {
                let blocks = self.handle_redacted_thinking_content(&content_block);
                if !blocks.is_empty() {
                    delta.thinking_blocks = Some(blocks);
                }
            }
            AnthropicContentBlockType::Compaction => {
                if let Some(content) = content_block.content {
                    self.compaction_blocks.push(json!({
                        "type": "compaction",
                        "content": content,
                    }));
                }
            }
            AnthropicContentBlockType::ToolResult(_) => {
                if let Ok(value) = serde_json::to_value(&content_block) {
                    if content_block.block_type == "web_search_tool_result" {
                        self.complete_web_search_call(value.clone());
                    }
                    self.tool_results.push(value);
                }
            }
            AnthropicContentBlockType::Other(_) => {}
        }

        Ok(self.build_chunk(delta, None, None, None))
    }

    pub fn handle_json_mode_chunk(
        &mut self,
        text: String,
        tool_use: Option<ChatCompletionToolCallChunk>,
    ) -> (String, Option<ChatCompletionToolCallChunk>) {
        if (self.json_mode || self.is_response_format_tool)
            && let Some(tool) = tool_use
        {
            self.converted_response_format_tool = true;
            return (tool.function.arguments, None);
        }
        (text, tool_use)
    }

    pub fn handle_accumulated_json_chunk(
        &mut self,
        data: &str,
        is_final: bool,
    ) -> Result<Option<ChatCompletionChunk>, Error> {
        if self.accumulated_json.len().saturating_add(data.len()) > MAX_ACCUMULATED_JSON_BYTES {
            return Err(Error::InvalidResponse(
                "accumulated JSON chunk exceeds maximum size".into(),
            ));
        }
        self.accumulated_json.push_str(data);
        if self.chunk_type == AnthropicJsonChunkType::ValidJson {
            if is_final || serde_json::from_str::<Value>(&self.accumulated_json).is_ok() {
                let content = std::mem::take(&mut self.accumulated_json);
                if content.is_empty() {
                    return Ok(None);
                }
                let delta = ChatCompletionDelta {
                    content: Some(content),
                    ..Default::default()
                };
                return Ok(Some(self.build_chunk(delta, None, None, None)));
            }
            return Ok(None);
        }
        if data.is_empty() {
            return Ok(None);
        }
        let delta = ChatCompletionDelta {
            content: Some(data.to_string()),
            ..Default::default()
        };
        Ok(Some(self.build_chunk(delta, None, None, None)))
    }

    pub fn handle_redacted_thinking_content(
        &mut self,
        content_block: &AnthropicContentBlock,
    ) -> Vec<ChatCompletionThinkingBlock> {
        match &content_block.data {
            Some(data) => vec![ChatCompletionThinkingBlock::RedactedThinking {
                data: Some(data.clone()),
                cache_control: content_block.extra.get("cache_control").cloned(),
            }],
            None => Vec::new(),
        }
    }

    pub fn web_search_call_snapshot(&self) -> HashMap<String, Value> {
        self.web_search_calls.clone()
    }

    pub fn complete_web_search_call(&mut self, result: Value) {
        if let Some(tool_use_id) = result.get("tool_use_id").and_then(Value::as_str)
            && let Some(Value::Object(call)) = self.web_search_calls.get_mut(tool_use_id)
        {
            call.insert("status".to_string(), Value::String("completed".to_string()));
        }
        self.web_search_results.push(result);
    }

    pub fn build_code_interpreter_results(&self) -> Vec<Value> {
        self.tool_results
            .iter()
            .filter(|item| {
                item.get("type")
                    .and_then(Value::as_str)
                    .is_some_and(|t| t.contains("code_execution") || t.contains("bash"))
            })
            .cloned()
            .collect()
    }

    pub fn handle_message_delta(
        &mut self,
        event: AnthropicMessagesStreamEvent,
    ) -> (Option<String>, Option<ChatCompletionsUsage>, Option<Value>) {
        if let AnthropicMessagesStreamEvent::MessageDelta {
            delta,
            usage,
            context_management,
        } = event
        {
            if let Some(container_id) = delta
                .container
                .as_ref()
                .and_then(|c| c.get("id"))
                .and_then(Value::as_str)
            {
                self.container_id = Some(container_id.to_string());
            }
            let finish_reason = delta.stop_reason.as_deref().map(|reason| {
                if reason == "tool_use" && (self.json_mode || self.converted_response_format_tool) {
                    "stop".to_string()
                } else {
                    finish_reason_for(reason).to_string()
                }
            });
            let mapped_usage = usage.map(|u| self.handle_usage(u));
            return (finish_reason, mapped_usage, context_management);
        }
        (None, None, None)
    }

    pub fn chunk_parser(
        &mut self,
        event: AnthropicMessagesStreamEvent,
    ) -> Result<ChatCompletionChunk, Error> {
        match event {
            AnthropicMessagesStreamEvent::MessageStart { message } => {
                self.response_id = message.id;
                self.served_model = Some(message.model);
                let usage = self.handle_usage(message.usage);
                let delta = ChatCompletionDelta {
                    role: Some(message.role),
                    content: Some(String::new()),
                    ..Default::default()
                };
                Ok(self.build_chunk(delta, None, Some(usage), None))
            }
            AnthropicMessagesStreamEvent::ContentBlockStart {
                index,
                content_block,
            } => self.handle_content_block_start(index, content_block),
            AnthropicMessagesStreamEvent::ContentBlockDelta { index, delta } => {
                let (text, tool_call, thinking_blocks, citation, reasoning_content) =
                    self.handle_content_block_delta(index, delta);
                let mut chunk_delta = ChatCompletionDelta::default();
                if !text.is_empty() {
                    chunk_delta.content = Some(text);
                }
                if let Some(tool) = tool_call {
                    chunk_delta.tool_calls = Some(vec![tool]);
                }
                if !thinking_blocks.is_empty() {
                    chunk_delta.thinking_blocks = Some(thinking_blocks);
                }
                if let Some(reasoning) = reasoning_content {
                    chunk_delta.reasoning_content = Some(reasoning);
                }
                let mut provider_fields = Map::new();
                if let Some(citation) = citation {
                    provider_fields.insert("citations".to_string(), json!([citation]));
                }
                let provider_specific =
                    (!provider_fields.is_empty()).then_some(provider_fields.clone());
                if provider_specific.is_some() {
                    chunk_delta.provider_specific_fields = Some(provider_fields);
                }
                Ok(self.build_chunk(chunk_delta, None, None, provider_specific))
            }
            AnthropicMessagesStreamEvent::ContentBlockStop { .. } => {
                let mut delta = ChatCompletionDelta::default();
                if self.check_empty_tool_call_args() {
                    delta.tool_calls = Some(vec![ChatCompletionToolCallChunk {
                        id: None,
                        tool_type: "function".to_string(),
                        function: ChatCompletionToolCallFunctionChunk {
                            name: None,
                            arguments: "{}".to_string(),
                            provider_specific_fields: None,
                        },
                        index: self.tool_index.max(0),
                    }]);
                }
                self.current_content_block_type = None;
                self.is_response_format_tool = false;
                self.current_server_tool_id = None;
                self.content_blocks.clear();
                Ok(self.build_chunk(delta, None, None, None))
            }
            AnthropicMessagesStreamEvent::MessageDelta { .. } => {
                let (finish_reason, usage, context_management) = self.handle_message_delta(event);
                let mut provider_fields = Map::new();
                if let Some(cm) = context_management {
                    provider_fields.insert("context_management".to_string(), cm);
                }
                if let Some(speed) = &self.speed {
                    provider_fields.insert("speed".to_string(), Value::String(speed.clone()));
                }
                if let Some(container_id) = &self.container_id {
                    provider_fields.insert("container".to_string(), json!({ "id": container_id }));
                }
                let provider_specific = (!provider_fields.is_empty()).then_some(provider_fields);
                Ok(self.build_chunk(
                    ChatCompletionDelta::default(),
                    finish_reason,
                    usage,
                    provider_specific,
                ))
            }
            AnthropicMessagesStreamEvent::MessageStop | AnthropicMessagesStreamEvent::Ping => {
                Ok(self.build_chunk(ChatCompletionDelta::default(), None, None, None))
            }
            AnthropicMessagesStreamEvent::Error { error } => Err(Error::InvalidResponse(format!(
                "{}: {}",
                error.error_type, error.message
            ))),
        }
    }
}

impl StreamTransformer for AnthropicChatCompletionsStreamTransformer {
    type Input = AnthropicMessagesStreamEvent;
    type Output = ChatCompletionChunk;
    type Error = Error;

    fn transform(&mut self, input: Self::Input) -> Result<Vec<Self::Output>, Self::Error> {
        match input {
            AnthropicMessagesStreamEvent::Ping | AnthropicMessagesStreamEvent::MessageStop => {
                Ok(Vec::new())
            }
            other => Ok(vec![self.chunk_parser(other)?]),
        }
    }

    fn finish(&mut self) -> Result<Vec<Self::Output>, Self::Error> {
        if !self.accumulated_json.is_empty()
            && let Some(chunk) = self.handle_accumulated_json_chunk("", true)?
        {
            return Ok(vec![chunk]);
        }
        Ok(Vec::new())
    }
}
