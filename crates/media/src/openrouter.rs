//! OpenRouter video protocol. Transport evidence never authorizes customer billing.
use crate::{
    ValidatedVideoRequest,
    query::{ProviderTimes, QueryError, QueryObservation, QueryStatus, ReportedQuantity},
    result::{ResultError, ResultKind, ResultMedia},
    transport::QueryTransportError,
};
use serde_json::{Value, json};
use std::time::Duration;
use url::Url;

pub const REVISION: &str = "openrouter-video-v1";

/// Translate only supported, schema-validated text input. Unsupported controls
/// cannot be silently discarded, including frame-rate and callback constraints.
pub fn submission_body(request: &ValidatedVideoRequest) -> Result<Value, QueryError> {
    let body = request
        .body()
        .as_object()
        .ok_or(QueryError::InvalidConfiguration)?;
    if body.keys().any(|key| {
        !matches!(
            key.as_str(),
            "model" | "content" | "duration" | "resolution" | "ratio" | "seed"
        )
    }) {
        return Err(QueryError::InvalidConfiguration);
    }
    let content = body
        .get("content")
        .and_then(Value::as_array)
        .ok_or(QueryError::InvalidConfiguration)?;
    let mut texts = Vec::new();
    for item in content {
        if item.get("type").and_then(Value::as_str) != Some("text") {
            return Err(QueryError::InvalidConfiguration);
        }
        texts.push(
            item.get("text")
                .and_then(Value::as_str)
                .ok_or(QueryError::InvalidConfiguration)?,
        );
    }
    if texts.is_empty() {
        return Err(QueryError::InvalidConfiguration);
    }
    let mut output = json!({"model":body.get("model").ok_or(QueryError::InvalidConfiguration)?,"prompt":texts.join("\n")});
    for (source, target) in [
        ("duration", "duration"),
        ("resolution", "resolution"),
        ("ratio", "aspect_ratio"),
        ("seed", "seed"),
    ] {
        if let Some(value) = body.get(source) {
            output[target] = value.clone();
        }
    }
    Ok(output)
}

pub fn job_endpoint(base: &str, job: &str) -> Result<Url, QueryError> {
    if !crate::public_https(base, 8192)
        || !crate::valid_name(job)
        || !job
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err(QueryError::InvalidConfiguration);
    }
    let mut url = Url::parse(base).map_err(|_| QueryError::InvalidConfiguration)?;
    if url.query().is_some() {
        return Err(QueryError::InvalidConfiguration);
    }
    url.path_segments_mut()
        .map_err(|_| QueryError::InvalidConfiguration)?
        .pop_if_empty()
        .push("videos")
        .push(job);
    Ok(url)
}

/// The response job ID must match the pinned submission. A missing model is not
/// reported model evidence; expected_model is the original saved route identity.
pub fn decode(
    body: &[u8],
    base: &str,
    job: &str,
    expected_model: &str,
) -> Result<QueryObservation, QueryError> {
    if body.len() > 64 * 1024 {
        return Err(QueryError::TooLarge);
    }
    if !crate::valid_name(expected_model) {
        return Err(QueryError::InvalidConfiguration);
    }
    let endpoint = job_endpoint(base, job)?;
    let value: Value = serde_json::from_slice(body).map_err(|_| QueryError::InvalidResponse)?;
    if value.get("id").and_then(Value::as_str) != Some(job)
        || value
            .get("model")
            .is_some_and(|model| model.as_str() != Some(expected_model))
    {
        return Err(QueryError::IdentityMismatch);
    }
    let status = match value
        .get("status")
        .and_then(Value::as_str)
        .ok_or(QueryError::InvalidResponse)?
    {
        "pending" => QueryStatus::Queued,
        "processing" | "in_progress" => QueryStatus::Running,
        "completed" => QueryStatus::Succeeded,
        "failed" => QueryStatus::Failed,
        // Documented polling terminal states, not evidence of zero liability.
        // https://openrouter.ai/blog/tutorials/video-generation-api/
        "cancelled" => QueryStatus::Cancelled,
        "expired" => QueryStatus::Expired,
        _ => QueryStatus::Unknown,
    };
    let has_provider_error = value.get("error").is_some_and(|v| !v.is_null());
    if status == QueryStatus::Succeeded && has_provider_error {
        return Err(QueryError::InvalidResponse);
    }
    let mut video_url = None;
    if status == QueryStatus::Succeeded {
        let urls = value
            .get("unsigned_urls")
            .and_then(Value::as_array)
            .ok_or(QueryError::InvalidResponse)?;
        if urls.len() != 1 {
            return Err(QueryError::InvalidResponse);
        }
        let result = urls[0].as_str().ok_or(QueryError::InvalidResponse)?;
        validate_content_url(&endpoint, result).map_err(|_| QueryError::InvalidResponse)?;
        video_url = Some(result.into());
    }
    Ok(QueryObservation {
        status,
        quantity: ReportedQuantity::Missing,
        times: ProviderTimes::Missing,
        has_provider_error,
        upstream_job: job.into(),
        upstream_model: expected_model.into(),
        video_url,
        last_frame_url: None,
        protocol_revision: REVISION.into(),
        meter: "seconds".into(),
    })
}

fn validate_content_url(job: &Url, content: &str) -> Result<(), ResultError> {
    if !crate::public_https(content, 8192) {
        return Err(ResultError::EndpointRejected);
    }
    let result = Url::parse(content).map_err(|_| ResultError::EndpointRejected)?;
    if result.origin() != job.origin()
        || result.path() != format!("{}/content", job.path())
        || !matches!(result.query(), None | Some("index=0"))
    {
        return Err(ResultError::EndpointRejected);
    }
    Ok(())
}

pub async fn query_job(
    base: &str,
    token: &str,
    job: &str,
    model: &str,
    timeout: Duration,
) -> Result<QueryObservation, QueryTransportError> {
    if timeout.is_zero() || timeout > Duration::from_secs(60) || !valid_token(token) {
        return Err(QueryTransportError::InvalidConfiguration);
    }
    let endpoint = job_endpoint(base, job).map_err(QueryTransportError::Decode)?;
    let work = async {
        let client = niu_upstream::client_for_endpoint(endpoint.as_str(), timeout)
            .await
            .map_err(|_| QueryTransportError::EndpointRejected)?;
        let mut response = client
            .get(endpoint)
            .bearer_auth(token)
            .send()
            .await
            .map_err(|_| QueryTransportError::Transport)?;
        if !response.status().is_success() {
            return Err(QueryTransportError::HttpStatus(response.status().as_u16()));
        }
        if response
            .content_length()
            .is_some_and(|size| size > 64 * 1024)
        {
            return Err(QueryTransportError::TooLarge);
        }
        let mut body = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| QueryTransportError::Transport)?
        {
            if chunk.len() > (64 * 1024usize).saturating_sub(body.len()) {
                return Err(QueryTransportError::TooLarge);
            }
            body.extend_from_slice(&chunk);
        }
        decode(&body, base, job, model).map_err(QueryTransportError::Decode)
    };
    tokio::time::timeout(timeout, work)
        .await
        .map_err(|_| QueryTransportError::Timeout)?
}

fn valid_token(token: &str) -> bool {
    !token.is_empty()
        && token.len() <= 16384
        && token.trim() == token
        && !token.chars().any(char::is_control)
}

/// Authenticate only the pinned job's content endpoint. Follow at most three
/// independently DNS-checked HTTPS redirects, with no credentials after the
/// first request, even if a later redirect returns to the original origin.
pub async fn fetch_result(
    base: &str,
    token: &str,
    job: &str,
    content: &str,
    maximum_bytes: usize,
    timeout: Duration,
) -> Result<ResultMedia, ResultError> {
    if !valid_token(token)
        || maximum_bytes == 0
        || maximum_bytes > 256 * 1024 * 1024
        || timeout.is_zero()
        || timeout > Duration::from_secs(60)
    {
        return Err(ResultError::InvalidConfiguration);
    }
    let job = job_endpoint(base, job).map_err(|_| ResultError::EndpointRejected)?;
    validate_content_url(&job, content)?;
    let work = async {
        let mut endpoint = Url::parse(content).map_err(|_| ResultError::EndpointRejected)?;
        for hop in 0..4 {
            if !crate::public_https(endpoint.as_str(), 8192) {
                return Err(ResultError::EndpointRejected);
            }
            let client =
                crate::result::client_for_result_endpoint(endpoint.as_str(), timeout).await?;
            let mut request = client
                .get(endpoint.clone())
                .header(reqwest::header::ACCEPT_ENCODING, "identity");
            if hop == 0 {
                request = request.bearer_auth(token);
            }
            let response = request.send().await.map_err(|_| ResultError::Transport)?;
            if matches!(response.status().as_u16(), 301 | 302 | 303 | 307 | 308) {
                let location = response
                    .headers()
                    .get(reqwest::header::LOCATION)
                    .and_then(|v| v.to_str().ok())
                    .ok_or(ResultError::EndpointRejected)?;
                endpoint = endpoint
                    .join(location)
                    .map_err(|_| ResultError::EndpointRejected)?;
                continue;
            }
            return crate::result::read(response, ResultKind::Video, maximum_bytes).await;
        }
        Err(ResultError::Unavailable)
    };
    tokio::time::timeout(timeout, work)
        .await
        .map_err(|_| ResultError::Timeout)?
}
