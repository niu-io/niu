use litellm_http::{outbound::OutboundRequest, request::truncate_error_body};
use litellm_llms::base_llm::chat::transformation::ProviderChatResponseData;
use litellm_types::utils::ChatCompletionsResponse;
use serde_json::Value;

use super::{Error, client::http_client, prepare::prepare_provider_request};
use crate::chat_completions::types::{
    ProviderChatCompletionsRequest, ResolvedChatCompletionsRequest,
};

const MAX_CHAT_COMPLETIONS_RESPONSE_BYTES: usize = 16 * 1024 * 1024;

pub(super) async fn execute_chat_completions_provider_call(
    request: ResolvedChatCompletionsRequest<'_>,
) -> Result<ChatCompletionsResponse, Error> {
    let request = prepare_provider_request(request)?;
    let outbound = outbound_request(&request).await?;

    let mut response = outbound.send(http_client()).await.map_err(|err| {
        // Failing to establish the connection means the request never went out,
        // so the host can still serve it. Everything else here, a timeout
        // above all, may have reached the provider and been answered.
        if err.is_connect() || err.is_builder() {
            Error::Transport(litellm_http::transport::Error::Connect(err.to_string()))
        } else {
            Error::Transport(litellm_http::transport::Error::Network(err.to_string()))
        }
    })?;

    let status = response.status();
    if response
        .content_length()
        .is_some_and(|len| len > MAX_CHAT_COMPLETIONS_RESPONSE_BYTES as u64)
    {
        return Err(Error::InvalidResponse(format!(
            "chat completions response exceeds {MAX_CHAT_COMPLETIONS_RESPONSE_BYTES} byte limit"
        )));
    }
    let mut raw_body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|err| Error::Transport(litellm_http::transport::Error::Network(err.to_string())))?
    {
        if chunk.len() > MAX_CHAT_COMPLETIONS_RESPONSE_BYTES.saturating_sub(raw_body.len()) {
            return Err(Error::InvalidResponse(format!(
                "chat completions response exceeds {MAX_CHAT_COMPLETIONS_RESPONSE_BYTES} byte limit"
            )));
        }
        raw_body.extend_from_slice(&chunk);
    }

    if !status.is_success() {
        let text = String::from_utf8_lossy(&raw_body);
        return Err(Error::Transport(litellm_http::transport::Error::Http {
            status: status.as_u16(),
            body: truncate_error_body(&text),
        }));
    }

    let body: Value = serde_json::from_slice(&raw_body).map_err(|err| {
        Error::InvalidResponse(format!("invalid chat completions response JSON: {err}"))
    })?;
    request
        .config
        .transform_response(&request.model, ProviderChatResponseData { body })
        .map_err(Error::from)
        .map_err(as_response_error)
}

/// Re-tag an error raised while normalizing a response the provider already
/// returned.
///
/// A config reports the same variants on either side of the call: a missing
/// field or an unsupported block can mean "this request cannot be translated"
/// during prepare and "this response cannot be normalized" here. Only the
/// second kind has already been billed, and a host that keeps a reference
/// implementation must not retry those, so collapse them to one variant that
/// can only mean the provider was already called.
pub(super) fn as_response_error(err: Error) -> Error {
    match err {
        already @ (Error::InvalidResponse(_)
        | Error::Transport(litellm_http::transport::Error::Http { .. })) => already,
        other => Error::InvalidResponse(other.to_string()),
    }
}

pub(super) async fn outbound_request(
    request: &ProviderChatCompletionsRequest,
) -> Result<OutboundRequest, Error> {
    crate::outbound::outbound_request(
        &request.auth,
        request.url.clone(),
        request.upstream_headers.clone(),
        &request.body,
        request.timeout,
        &request.optional_params,
    )
    .await
    .map_err(|error| match error {
        // Python drops the caller's copy and prefers a forwarded Authorization
        // over the signature, so leave the request to it.
        Error::Http(litellm_http::Error::ComputedHeader(_)) => {
            Error::Unsupported("request forwards a header AWS SigV4 computes")
        }
        other => other,
    })
}
