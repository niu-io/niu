//! One-shot submission. No error after dispatch proves that generation did not run.
use crate::{ValidatedVideoRequest, valid_name};
use std::time::Duration;

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SubmissionError {
    InvalidConfiguration,
    EndpointRejected,
    /// A paid operation may exist. Retain liability; never automatically resubmit.
    Uncertain,
    /// A non-success HTTP response is diagnostic evidence only. It does not
    /// prove that an asynchronous job was never created or billed.
    UncertainHttpStatus(u16),
    /// Bounded public identifiers only; execution remains uncertain.
    UncertainHttpResponse {
        status: u16,
        diagnostic: SubmissionDiagnostic,
    },
}

/// Safe correlation fields only. Never retains Provider messages or raw bodies.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct SubmissionDiagnostic {
    pub error_code: Option<String>,
    pub request_id: Option<String>,
}

// Typed extraction rejects duplicate known fields. Unknown message/result fields
// are ignored and never enter the diagnostic. The input itself is bounded below.
#[derive(serde::Deserialize)]
struct ErrorEnvelope {
    #[serde(default, alias = "Error")]
    error: Option<ErrorCode>,
    #[serde(default, alias = "RequestId", alias = "requestId")]
    request_id: Option<String>,
    #[serde(default, alias = "ResponseMetadata")]
    response_metadata: Option<ErrorMetadata>,
}
#[derive(serde::Deserialize)]
struct ErrorCode {
    #[serde(default, alias = "Code")]
    code: Option<String>,
}
#[derive(serde::Deserialize)]
struct ErrorMetadata {
    #[serde(default, alias = "Error")]
    error: Option<ErrorCode>,
    #[serde(default, alias = "RequestId", alias = "requestId")]
    request_id: Option<String>,
}
fn public_identifier(value: Option<&str>, secret: &str, maximum_bytes: usize) -> Option<String> {
    value
        .filter(|value| {
            !value.is_empty()
                && value.len() <= maximum_bytes
                && value.as_bytes()[0].is_ascii_alphanumeric()
                && !value.starts_with("sk-")
                && !value.contains(secret)
                && value
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || b"_-.:".contains(&byte))
        })
        .map(str::to_owned)
}

async fn rejected_response(
    mut response: reqwest::Response,
    maximum_response_bytes: usize,
    secret: &str,
    deadline: tokio::time::Instant,
) -> SubmissionError {
    let status = response.status().as_u16();
    let mut diagnostic = SubmissionDiagnostic {
        error_code: None,
        request_id: ["x-request-id", "x-tt-logid", "request-id"]
            .into_iter()
            .find_map(|name| {
                public_identifier(
                    response.headers().get(name).and_then(|v| v.to_str().ok()),
                    secret,
                    200,
                )
            }),
    };
    let limit = maximum_response_bytes.min(64 * 1024);
    let read = async {
        if response.content_length().is_some_and(|n| n > limit as u64) {
            return None;
        }
        let mut body = Vec::new();
        while let Some(chunk) = response.chunk().await.ok()? {
            if chunk.len() > limit.saturating_sub(body.len()) {
                return None;
            }
            body.extend_from_slice(&chunk);
        }
        serde_json::from_slice::<ErrorEnvelope>(&body).ok()
    };
    // An unreadable, oversized or late body must not erase the already observed
    // HTTP status. No retry or nonexecution inference follows from diagnostics.
    if let Ok(Some(envelope)) = tokio::time::timeout_at(deadline, read).await {
        let metadata = envelope.response_metadata;
        diagnostic.error_code = public_identifier(
            envelope.error.as_ref().and_then(|v| v.code.as_deref()),
            secret,
            128,
        )
        .or_else(|| {
            public_identifier(
                metadata
                    .as_ref()
                    .and_then(|v| v.error.as_ref())
                    .and_then(|v| v.code.as_deref()),
                secret,
                128,
            )
        });
        if diagnostic.request_id.is_none() {
            diagnostic.request_id = public_identifier(envelope.request_id.as_deref(), secret, 200)
                .or_else(|| {
                    public_identifier(
                        metadata.as_ref().and_then(|v| v.request_id.as_deref()),
                        secret,
                        200,
                    )
                });
        }
    }
    SubmissionError::UncertainHttpResponse { status, diagnostic }
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
        let response = client.post(endpoint).bearer_auth(token).json(&body).send();
        let mut response = tokio::time::timeout_at(deadline, response)
            .await
            .map_err(|_| SubmissionError::Uncertain)?
            .map_err(|_| SubmissionError::Uncertain)?;
        if !response.status().is_success() {
            return Err(rejected_response(response, maximum_response_bytes, token, deadline).await);
        }
        if response
            .content_length()
            .is_some_and(|n| n > maximum_response_bytes as u64)
        {
            return Err(SubmissionError::Uncertain);
        }
        let mut body = Vec::new();
        while let Some(chunk) = tokio::time::timeout_at(deadline, response.chunk())
            .await
            .map_err(|_| SubmissionError::Uncertain)?
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
    work.await
}
