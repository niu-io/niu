//! BabelArk OpenAI-compatible video protocol. Provider-specific request and
//! response shapes stay in this module; core dispatch only selects a revision.
use crate::{
    ValidatedVideoRequest,
    query::{ProviderTimes, QueryError, QueryObservation, QueryStatus, ReportedQuantity},
    result::{ResultError, ResultKind, ResultMedia},
    transport::QueryTransportError,
};
use serde_json::{Value, json};
use std::time::Duration;
use url::Url;

pub const REVISION: &str = "babelark-video-v1";

/// Translate only schema-validated text input. BabelArk requires `input.prompt`
/// and its resolution enum is uppercase; absent controls stay absent.
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
    let mut parameters = serde_json::Map::new();
    if let Some(duration) = body.get("duration") {
        parameters.insert("duration".into(), duration.clone());
    }
    if let Some(resolution) = body.get("resolution").and_then(Value::as_str) {
        parameters.insert("resolution".into(), json!(resolution.to_ascii_uppercase()));
    }
    if let Some(ratio) = body.get("ratio") {
        parameters.insert("ratio".into(), ratio.clone());
    }
    if let Some(seed) = body.get("seed") {
        parameters.insert("seed".into(), seed.clone());
    }
    Ok(json!({
        "model": body.get("model").ok_or(QueryError::InvalidConfiguration)?,
        "input": {"prompt": texts.join("\n")},
        "parameters": parameters,
    }))
}

/// BabelArk returns its async task under `output.task_id`, not OpenAI `id`.
pub fn receipt(value: &Value) -> Option<&str> {
    value
        .get("output")?
        .get("task_id")?
        .as_str()
        .filter(|id| crate::valid_name(id))
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

pub fn decode(
    body: &[u8],
    base: &str,
    job: &str,
    expected_model: &str,
) -> Result<QueryObservation, QueryError> {
    if body.len() > 64 * 1024 || !crate::valid_name(expected_model) {
        return Err(QueryError::InvalidConfiguration);
    }
    let endpoint = job_endpoint(base, job)?;
    let value: Value = serde_json::from_slice(body).map_err(|_| QueryError::InvalidResponse)?;
    let output = value
        .get("output")
        .and_then(Value::as_object)
        .ok_or(QueryError::InvalidResponse)?;
    if output.get("task_id").and_then(Value::as_str) != Some(job) {
        return Err(QueryError::IdentityMismatch);
    }
    let status = match output
        .get("task_status")
        .and_then(Value::as_str)
        .ok_or(QueryError::InvalidResponse)?
    {
        "PENDING" => QueryStatus::Queued,
        "RUNNING" => QueryStatus::Running,
        "SUCCEEDED" => QueryStatus::Succeeded,
        "FAILED" => QueryStatus::Failed,
        "CANCELED" | "CANCELLED" => QueryStatus::Cancelled,
        _ => QueryStatus::Unknown,
    };
    let has_provider_error = output.get("code").is_some() || output.get("message").is_some();
    let video_url = if status == QueryStatus::Succeeded {
        let url = output
            .get("video_url")
            .and_then(Value::as_str)
            .ok_or(QueryError::InvalidResponse)?;
        if !crate::public_https(url, 8192) {
            return Err(QueryError::InvalidResponse);
        }
        let parsed = Url::parse(url).map_err(|_| QueryError::InvalidResponse)?;
        if parsed.scheme() != "https" {
            return Err(QueryError::InvalidResponse);
        }
        // Do not trust a result URL from a different origin than the pinned
        // status endpoint's provider unless it is the known OSS result host.
        if parsed.host_str() != endpoint.host_str()
            && !parsed
                .host_str()
                .is_some_and(|host| host.ends_with(".aliyuncs.com"))
        {
            return Err(QueryError::InvalidResponse);
        }
        Some(url.to_owned())
    } else {
        None
    };
    Ok(QueryObservation {
        status,
        quantity: ReportedQuantity::Missing,
        times: ProviderTimes::Missing,
        has_provider_error,
        upstream_job: job.into(),
        upstream_model: expected_model.into(),
        reported_model: None,
        video_url,
        last_frame_url: None,
        protocol_revision: REVISION.into(),
        meter: "seconds".into(),
    })
}

pub async fn query_job(
    base: &str,
    token: &str,
    job: &str,
    model: &str,
    timeout: Duration,
) -> Result<QueryObservation, QueryTransportError> {
    if timeout.is_zero() || timeout > Duration::from_secs(60) || token.is_empty() {
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

/// BabelArk returns an unauthenticated OSS URL; fetch it through the ordinary
/// result transport after the exact HTTPS check above.
pub async fn fetch_result(
    url: &str,
    maximum_bytes: usize,
    timeout: Duration,
) -> Result<ResultMedia, ResultError> {
    crate::result::fetch_result(url, ResultKind::Video, maximum_bytes, timeout).await
}
