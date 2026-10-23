//! Default body capture with explicit opt-out, never headers or upstream credentials. Customer output
//! has already passed commercial metadata sanitization before this layer.
use crate::{error::ApiError, state::AppState};
use axum::{
    body::{Body, to_bytes},
    extract::State,
    http::Request,
    middleware::Next,
    response::{IntoResponse, Response},
};
use futures_util::StreamExt;
use serde_json::Value;
use std::error::Error as _;
use uuid::Uuid;
const LIMIT: usize = 1_048_576;

#[derive(Clone)]
pub(crate) struct InspectedRequestPayload(pub Value);

const MAX_CREDENTIAL_SCRUB_DEPTH: usize = 64;
static PAYLOAD_WRITE_CONCURRENCY: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(4);

#[derive(Default)]
enum CapturedRequest {
    #[default]
    None,
    Raw(axum::body::Bytes),
    Inspected(Value),
}

struct Capture {
    writes: tokio_util::task::TaskTracker,
    store: niu_storage::Store,
    attempt: Uuid,
    request: CapturedRequest,
    bytes: Vec<u8>,
    content_type: String,
    complete: bool,
    failed: bool,
    truncated: bool,
}
impl Drop for Capture {
    fn drop(&mut self) {
        let store = self.store.clone();
        let attempt = self.attempt;
        let captured_request = std::mem::take(&mut self.request);
        let raw_bytes = std::mem::take(&mut self.bytes);
        let response = match String::from_utf8(raw_bytes) {
            Ok(value) => value,
            Err(error) => {
                let valid_len = error.utf8_error().valid_up_to();
                let mut bytes = error.into_bytes();
                bytes.truncate(valid_len);
                String::from_utf8(bytes).unwrap_or_default()
            }
        };
        let content_type = std::mem::take(&mut self.content_type);
        let complete = self.complete;
        let truncated = self.truncated;
        self.writes.spawn(async move {
            let mut request = match captured_request {
                CapturedRequest::None => Value::Null,
                CapturedRequest::Raw(bytes) => {
                    serde_json::from_slice::<Value>(&bytes).unwrap_or(Value::Null)
                }
                CapturedRequest::Inspected(value) => value,
            };
            remove_credentials(&mut request);
            let _permit = PAYLOAD_WRITE_CONCURRENCY.acquire().await;
            if store
                .save_request_payload(
                    attempt,
                    &request,
                    &response,
                    &content_type,
                    complete,
                    truncated,
                )
                .await
                .is_err()
            {
                tracing::warn!("Request payload persistence failed");
            }
        });
    }
}

pub(crate) fn remove_credentials(value: &mut Value) {
    remove_credentials_bounded(value, 0);
}

fn remove_credentials_bounded(value: &mut Value, depth: usize) {
    if depth >= MAX_CREDENTIAL_SCRUB_DEPTH {
        return;
    }
    match value {
        Value::Object(object) => {
            object.retain(|key, _| {
                !key.eq_ignore_ascii_case("authorization")
                    && !key.eq_ignore_ascii_case("proxy-authorization")
                    && !key.eq_ignore_ascii_case("cookie")
                    && !key.eq_ignore_ascii_case("set-cookie")
                    && !key.eq_ignore_ascii_case("api_key")
                    && !key.eq_ignore_ascii_case("api-key")
                    && !key.eq_ignore_ascii_case("x-api-key")
                    && !key.eq_ignore_ascii_case("password")
                    && !key.eq_ignore_ascii_case("access_token")
                    && !key.eq_ignore_ascii_case("refresh_token")
            });
            for item in object.values_mut() {
                remove_credentials_bounded(item, depth + 1);
            }
        }
        Value::Array(items) => {
            for item in items {
                remove_credentials_bounded(item, depth + 1);
            }
        }
        _ => {}
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum PayloadCaptureMode {
    DefaultOn,
    OptIn,
    Disabled,
}

impl PayloadCaptureMode {
    pub(crate) fn from_env_value(value: Option<&str>) -> Self {
        match value.map(str::trim) {
            None | Some("") | Some("true") | Some("1") | Some("on") | Some("default") => {
                Self::DefaultOn
            }
            Some(v)
                if v.eq_ignore_ascii_case("false")
                    || v == "0"
                    || v.eq_ignore_ascii_case("off")
                    || v.eq_ignore_ascii_case("opt-in")
                    || v.eq_ignore_ascii_case("opt_in") =>
            {
                Self::OptIn
            }
            Some(v) if v.eq_ignore_ascii_case("disabled") || v.eq_ignore_ascii_case("never") => {
                Self::Disabled
            }
            Some(_) => Self::DefaultOn,
        }
    }

    pub(crate) fn from_env() -> Self {
        let value = std::env::var("NIU_REQUEST_PAYLOAD_CAPTURE").ok();
        Self::from_env_value(value.as_deref())
    }
}

pub(crate) fn payload_capture_enabled(headers: &axum::http::HeaderMap) -> Result<bool, ApiError> {
    payload_capture_enabled_with_mode(headers, PayloadCaptureMode::from_env())
}

pub(crate) fn payload_capture_enabled_with_mode(
    headers: &axum::http::HeaderMap,
    mode: PayloadCaptureMode,
) -> Result<bool, ApiError> {
    let mut values = headers.get_all("x-niu-log-payloads").iter();
    let Some(value) = values.next() else {
        return Ok(matches!(mode, PayloadCaptureMode::DefaultOn));
    };
    if values.next().is_some() {
        return Err(ApiError::invalid_request(
            "Use one x-niu-log-payloads header with true or false",
        ));
    }
    let header_enabled = match value.to_str() {
        Ok(value) if value.eq_ignore_ascii_case("true") => true,
        Ok(value) if value.eq_ignore_ascii_case("false") => false,
        _ => {
            return Err(ApiError::invalid_request(
                "x-niu-log-payloads must be true or false",
            ));
        }
    };
    if matches!(mode, PayloadCaptureMode::Disabled) {
        return Ok(false);
    }
    Ok(header_enabled)
}

pub async fn capture(
    State(state): State<AppState>,
    request: Request<Body>,
    next: Next,
) -> Response {
    let path = request.uri().path();
    let saved_video_submit = request
        .extensions()
        .get::<axum::extract::MatchedPath>()
        .is_some_and(|route| matches!(route.as_str(),
            "/api/v1/organizations/{organization}/projects/{project}/video/intents/{intent}/submit"
            | "/admin/v1/organizations/{organization}/projects/{project}/video/intents/{intent}/submit"));
    let video = path == "/v1/video/jobs" || saved_video_submit;
    let inference = video
        || matches!(
            path,
            "/v1/chat/completions" | "/v1/responses" | "/v1/messages" | "/v1/embeddings"
        )
        || path.starts_with("/v1beta/models/");
    if !inference || request.method() != axum::http::Method::POST {
        return next.run(request).await;
    }
    match payload_capture_enabled(request.headers()) {
        Ok(false) => return next.run(request).await,
        Ok(true) => {}
        Err(error) => return error.into_response(),
    }
    // Video handlers supply their inspected input through a response extension.
    // Do not pre-buffer their bodies here: video has its own larger image limit.
    let (mut input, request) = if video {
        (CapturedRequest::None, request)
    } else {
        let (parts, body) = request.into_parts();
        let bytes = match to_bytes(body, LIMIT).await {
            Ok(bytes) => bytes,
            Err(error) => {
                // Capture must preserve the router's 413 semantics. Transport read
                // failures are not evidence that the client exceeded the size cap.
                if error
                    .source()
                    .is_some_and(|source| source.is::<http_body_util::LengthLimitError>())
                {
                    return ApiError::request_too_large().into_response();
                }
                return ApiError::invalid_request("Could not read request body").into_response();
            }
        };
        if serde_json::from_slice::<serde::de::IgnoredAny>(&bytes).is_err() {
            return ApiError::invalid_request("Invalid JSON request").into_response();
        }
        (
            CapturedRequest::Raw(bytes.clone()),
            Request::from_parts(parts, Body::from(bytes)),
        )
    };
    let mut response = next.run(request).await;
    if video
        && response
            .extensions()
            .get::<InspectedRequestPayload>()
            .is_none()
    {
        return response;
    }
    if let Some(inspected) = response
        .extensions_mut()
        .remove::<InspectedRequestPayload>()
    {
        input = CapturedRequest::Inspected(inspected.0);
    }
    let Some(attempt) = response
        .headers()
        .get("x-niu-attempt-id")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| Uuid::parse_str(v).ok())
    else {
        return response;
    };
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_owned();
    let (parts, body) = response.into_parts();
    let capture = Capture {
        writes: state.diagnostic_writes.clone(),
        store: state.store.clone(),
        attempt,
        request: input,
        bytes: vec![],
        content_type,
        complete: false,
        failed: false,
        truncated: false,
    };
    let stream = futures_util::stream::unfold(
        (body.into_data_stream(), capture),
        |(mut stream, mut capture)| async move {
            match stream.next().await {
                Some(chunk) => {
                    if let Ok(bytes) = &chunk {
                        let remaining = LIMIT - capture.bytes.len();
                        capture
                            .bytes
                            .extend_from_slice(&bytes[..remaining.min(bytes.len())]);
                        capture.truncated |= bytes.len() > remaining;
                    }
                    capture.failed |= chunk.is_err();
                    Some((chunk, (stream, capture)))
                }
                None => {
                    capture.complete = !capture.failed;
                    drop(capture);
                    None
                }
            }
        },
    );
    Response::from_parts(parts, Body::from_stream(stream))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::{HeaderMap, HeaderValue};

    #[test]
    fn payload_capture_mode_respects_deployment_policy_and_request_headers() {
        let empty = HeaderMap::new();
        assert_eq!(
            payload_capture_enabled_with_mode(&empty, PayloadCaptureMode::from_env_value(None))
                .unwrap(),
            true
        );
        assert_eq!(
            payload_capture_enabled_with_mode(
                &empty,
                PayloadCaptureMode::from_env_value(Some("opt-in"))
            )
            .unwrap(),
            false
        );
        assert_eq!(
            payload_capture_enabled_with_mode(
                &empty,
                PayloadCaptureMode::from_env_value(Some("disabled"))
            )
            .unwrap(),
            false
        );

        let mut opt_in = HeaderMap::new();
        opt_in.insert("x-niu-log-payloads", HeaderValue::from_static("true"));
        assert_eq!(
            payload_capture_enabled_with_mode(&opt_in, PayloadCaptureMode::OptIn).unwrap(),
            true
        );
        assert_eq!(
            payload_capture_enabled_with_mode(&opt_in, PayloadCaptureMode::Disabled).unwrap(),
            false
        );

        let mut opt_out = HeaderMap::new();
        opt_out.insert("x-niu-log-payloads", HeaderValue::from_static("false"));
        assert_eq!(
            payload_capture_enabled_with_mode(&opt_out, PayloadCaptureMode::DefaultOn).unwrap(),
            false
        );
    }

    #[tokio::test]
    async fn payload_write_semaphore_bounds_concurrent_writers() {
        assert_eq!(PAYLOAD_WRITE_CONCURRENCY.available_permits(), 4);
        let p1 = PAYLOAD_WRITE_CONCURRENCY.acquire().await.unwrap();
        let p2 = PAYLOAD_WRITE_CONCURRENCY.acquire().await.unwrap();
        let p3 = PAYLOAD_WRITE_CONCURRENCY.acquire().await.unwrap();
        let p4 = PAYLOAD_WRITE_CONCURRENCY.acquire().await.unwrap();
        assert_eq!(PAYLOAD_WRITE_CONCURRENCY.available_permits(), 0);
        assert!(PAYLOAD_WRITE_CONCURRENCY.try_acquire().is_err());
        drop((p1, p2, p3, p4));
        assert_eq!(PAYLOAD_WRITE_CONCURRENCY.available_permits(), 4);
    }
}
