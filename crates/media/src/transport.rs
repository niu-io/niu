//! Bounded query transport only; no generation submission or automatic retry.
use crate::query::{DirectQueryProtocol, QueryError, QueryObservation};
use std::time::Duration;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum QueryTransportError {
    InvalidConfiguration,
    EndpointRejected,
    Transport,
    Timeout,
    HttpStatus(u16),
    TooLarge,
    Decode(QueryError),
}

fn transport_error(error: reqwest::Error) -> QueryTransportError {
    if error.is_timeout() {
        QueryTransportError::Timeout
    } else {
        QueryTransportError::Transport
    }
}

/// `endpoint` must be the qualified query URL for the pinned job. This transport
/// does not establish channel qualification, authorize access, or perform billing.
pub async fn query_job(
    protocol: &DirectQueryProtocol,
    endpoint: &str,
    token: &str,
    expected_job: &str,
    expected_model: &str,
    timeout: Duration,
) -> Result<QueryObservation, QueryTransportError> {
    if timeout.is_zero()
        || timeout > Duration::from_secs(60)
        || token.trim() != token
        || token.is_empty()
        || token.len() > 16384
        || token.chars().any(char::is_control)
        || protocol.maximum_body_bytes == 0
        || protocol.maximum_body_bytes > 1024 * 1024
    {
        return Err(QueryTransportError::InvalidConfiguration);
    }
    protocol
        .validate_configuration(expected_job, expected_model)
        .map_err(QueryTransportError::Decode)?;
    let work = async {
        let client = niu_upstream::client_for_endpoint(endpoint, timeout)
            .await
            .map_err(|_| QueryTransportError::EndpointRejected)?;
        let mut response = client
            .get(endpoint)
            .bearer_auth(token)
            .send()
            .await
            .map_err(transport_error)?;
        if !response.status().is_success() {
            return Err(QueryTransportError::HttpStatus(response.status().as_u16()));
        }
        if response
            .content_length()
            .is_some_and(|n| n > protocol.maximum_body_bytes as u64)
        {
            return Err(QueryTransportError::TooLarge);
        }
        let mut body = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(transport_error)? {
            if chunk.len() > protocol.maximum_body_bytes.saturating_sub(body.len()) {
                return Err(QueryTransportError::TooLarge);
            }
            body.extend_from_slice(&chunk);
        }
        protocol
            .decode(&body, expected_job, expected_model)
            .map_err(QueryTransportError::Decode)
    };
    tokio::time::timeout(timeout, work)
        .await
        .map_err(|_| QueryTransportError::Timeout)?
}
