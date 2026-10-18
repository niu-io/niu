use std::time::Duration;

use litellm_http::{request::http_request, transport::Error as TransportError};
use litellm_llms::base_llm::anthropic_messages::transformation::BaseAnthropicMessagesConfig;
use litellm_types::llms::anthropic_messages::anthropic_response::AnthropicMessagesResponse;
use serde_json::Value;

use super::{Error, client::http_client, common_utils::truncate_error_body};

const MAX_MESSAGES_RESPONSE_BYTES: usize = 16 * 1024 * 1024;
const MAX_ERROR_RESPONSE_BYTES: usize = 64 * 1024;

pub(super) fn network(error: reqwest::Error) -> Error {
    Error::Transport(TransportError::Network(error.to_string()))
}

pub(super) async fn send(
    url: &str,
    headers: &[(String, String)],
    body: &Value,
    timeout: Option<Duration>,
) -> Result<reqwest::Response, Error> {
    let builder = headers.iter().fold(
        http_client().post(url).json(body),
        |builder, (key, value)| builder.header(key, value),
    );
    let builder = match timeout {
        Some(duration) => builder.timeout(duration),
        None => builder,
    };
    http_request(builder).await.map_err(network)
}

pub(super) async fn read_response_text(mut response: reqwest::Response) -> Result<String, Error> {
    if response
        .content_length()
        .is_some_and(|len| len > MAX_MESSAGES_RESPONSE_BYTES as u64)
    {
        return Err(Error::InvalidResponse(format!(
            "messages response exceeds {MAX_MESSAGES_RESPONSE_BYTES} byte limit"
        )));
    }
    let mut raw_body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(network)? {
        if chunk.len() > MAX_MESSAGES_RESPONSE_BYTES.saturating_sub(raw_body.len()) {
            return Err(Error::InvalidResponse(format!(
                "messages response exceeds {MAX_MESSAGES_RESPONSE_BYTES} byte limit"
            )));
        }
        raw_body.extend_from_slice(&chunk);
    }
    String::from_utf8(raw_body)
        .map_err(|err| Error::InvalidResponse(format!("invalid messages response UTF-8: {err}")))
}

pub(super) async fn provider_error(mut response: reqwest::Response) -> Error {
    let status = response.status().as_u16();
    let mut raw_body = Vec::new();
    while raw_body.len() < MAX_ERROR_RESPONSE_BYTES {
        match response.chunk().await {
            Ok(Some(chunk)) => {
                let remaining = MAX_ERROR_RESPONSE_BYTES - raw_body.len();
                let take = chunk.len().min(remaining);
                raw_body.extend_from_slice(&chunk[..take]);
                if take < chunk.len() {
                    break;
                }
            }
            Ok(None) => break,
            Err(error) => return network(error),
        }
    }
    let text = String::from_utf8_lossy(&raw_body);
    Error::Transport(TransportError::Http {
        status,
        body: truncate_error_body(&text),
    })
}

pub(super) fn decode_response(
    config: &dyn BaseAnthropicMessagesConfig,
    model: &str,
    text: &str,
) -> Result<AnthropicMessagesResponse, Error> {
    let response = serde_json::from_str(text)
        .map_err(|err| Error::InvalidResponse(format!("invalid messages response JSON: {err}")))?;
    config
        .transform_anthropic_messages_response(model, response)
        .map_err(Error::from)
}
