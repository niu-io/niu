use litellm_http::request::truncate_error_body;
use serde_json::Value;

use super::{Error, client::http_client};
use crate::audio_transcription::types::ProviderAudioTranscriptionRequest;

const MAX_AUDIO_TRANSCRIPTION_RESPONSE_BYTES: usize = 32 * 1024 * 1024;
const MAX_ERROR_RESPONSE_BYTES: usize = 64 * 1024;

pub async fn execute_audio_transcription_provider_call(
    request: ProviderAudioTranscriptionRequest,
) -> Result<Value, Error> {
    let mut response = crate::outbound::outbound_request::<Error>(
        &request.auth,
        request.url.clone(),
        request.upstream_headers.clone(),
        &request.body,
        request.timeout,
        &request.optional_params,
    )
    .await?
    .send(http_client())
    .await
    .map_err(|error| {
        Error::Transport(litellm_http::transport::Error::Network(error.to_string()))
    })?;
    let status = response.status();
    if !status.is_success() {
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
                Err(error) => {
                    return Err(Error::Transport(litellm_http::transport::Error::Network(
                        error.to_string(),
                    )));
                }
            }
        }
        let text = String::from_utf8_lossy(&raw_body);
        return Err(Error::Transport(litellm_http::transport::Error::Http {
            status: status.as_u16(),
            body: truncate_error_body(&text),
        }));
    }
    if response
        .content_length()
        .is_some_and(|len| len > MAX_AUDIO_TRANSCRIPTION_RESPONSE_BYTES as u64)
    {
        return Err(Error::InvalidResponse(format!(
            "audio response exceeds {MAX_AUDIO_TRANSCRIPTION_RESPONSE_BYTES} byte limit"
        )));
    }
    let mut raw_body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|error| {
        Error::Transport(litellm_http::transport::Error::Network(error.to_string()))
    })? {
        if chunk.len() > MAX_AUDIO_TRANSCRIPTION_RESPONSE_BYTES.saturating_sub(raw_body.len()) {
            return Err(Error::InvalidResponse(format!(
                "audio response exceeds {MAX_AUDIO_TRANSCRIPTION_RESPONSE_BYTES} byte limit"
            )));
        }
        raw_body.extend_from_slice(&chunk);
    }
    let response_json = serde_json::from_slice(&raw_body)
        .map_err(|error| Error::InvalidResponse(format!("invalid audio response JSON: {error}")))?;
    Ok(request
        .config
        .transform_audio_transcription_response(&request.model, response_json)?
        .into_json())
}
