//! One-shot submission. No error after dispatch proves that generation did not run.
use crate::{ValidatedVideoRequest, valid_name};
use std::time::Duration;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SubmissionError {
    InvalidConfiguration,
    EndpointRejected,
    /// A paid operation may exist. Retain liability; never automatically resubmit.
    Uncertain,
    /// A non-success HTTP response is diagnostic evidence only. It does not
    /// prove that an asynchronous job was never created or billed.
    UncertainHttpStatus(u16),
}

/// Upstream reference is internal recovery data, not a customer display label.
/// Deliberately excludes Debug/Serialize to prevent accidental disclosure.
pub struct SubmissionReceipt {
    upstream_job: String,
    protocol_revision: String,
}
impl SubmissionReceipt {
    pub fn upstream_job(&self) -> &str {
        &self.upstream_job
    }
    pub fn protocol_revision(&self) -> &str {
        &self.protocol_revision
    }
}

/// Only accepts a schema-validated request. The caller must authorize the route,
/// pin its configuration and commit financial admission before invoking this.
/// An HTTP error alone cannot establish nonexecution for an arbitrary channel.
pub async fn submit_job(
    endpoint: &str,
    token: &str,
    protocol_revision: &str,
    request: &ValidatedVideoRequest,
    maximum_response_bytes: usize,
    timeout: Duration,
) -> Result<SubmissionReceipt, SubmissionError> {
    if !valid_name(protocol_revision)
        || token.is_empty()
        || token.trim() != token
        || token.len() > 16384
        || token.chars().any(char::is_control)
        || !(1..=1024 * 1024).contains(&maximum_response_bytes)
        || timeout.is_zero()
        || timeout > Duration::from_secs(60)
    {
        return Err(SubmissionError::InvalidConfiguration);
    }
    // Failure to resolve/authorize the endpoint occurs before the POST.
    let deadline = tokio::time::Instant::now() + timeout;
    let client = tokio::time::timeout_at(
        deadline,
        niu_upstream::client_for_endpoint(endpoint, timeout),
    )
    .await
    .map_err(|_| SubmissionError::EndpointRejected)?
    .map_err(|_| SubmissionError::EndpointRejected)?;
    let body = if protocol_revision == crate::openrouter::REVISION {
        crate::openrouter::submission_body(request)
            .map_err(|_| SubmissionError::InvalidConfiguration)?
    } else {
        request.body().clone()
    };
    let work = async {
        let mut response = client
            .post(endpoint)
            .bearer_auth(token)
            .json(&body)
            .send()
            .await
            .map_err(|_| SubmissionError::Uncertain)?;
        if !response.status().is_success() {
            return Err(SubmissionError::UncertainHttpStatus(
                response.status().as_u16(),
            ));
        }
        if response
            .content_length()
            .is_some_and(|n| n > maximum_response_bytes as u64)
        {
            return Err(SubmissionError::Uncertain);
        }
        let mut body = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| SubmissionError::Uncertain)?
        {
            if chunk.len() > maximum_response_bytes.saturating_sub(body.len()) {
                return Err(SubmissionError::Uncertain);
            }
            body.extend_from_slice(&chunk);
        }
        let value: serde_json::Value =
            serde_json::from_slice(&body).map_err(|_| SubmissionError::Uncertain)?;
        let object = value.as_object().ok_or(SubmissionError::Uncertain)?;
        if object.get("error").is_some_and(|v| !v.is_null()) {
            return Err(SubmissionError::Uncertain);
        }
        let job = object
            .get("id")
            .and_then(serde_json::Value::as_str)
            .filter(|v| valid_name(v))
            .ok_or(SubmissionError::Uncertain)?;
        Ok(SubmissionReceipt {
            upstream_job: job.into(),
            protocol_revision: protocol_revision.into(),
        })
    };
    tokio::time::timeout_at(deadline, work)
        .await
        .map_err(|_| SubmissionError::Uncertain)?
}
