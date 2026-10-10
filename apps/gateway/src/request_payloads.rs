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

struct Capture {
    writes: tokio_util::task::TaskTracker,
    store: niu_storage::Store,
    attempt: Uuid,
    request: Value,
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
        let request = std::mem::take(&mut self.request);
        let valid = match std::str::from_utf8(&self.bytes) {
            Ok(value) => value,
            Err(error) => std::str::from_utf8(&self.bytes[..error.valid_up_to()]).unwrap_or(""),
        };
        let response = valid.to_owned();
        let content_type = self.content_type.clone();
        let complete = self.complete;
        let truncated = self.truncated;
        self.writes.spawn(async move {
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
    match value {
        Value::Object(object) => {
            object.retain(|key, _| {
                !matches!(
                    key.to_ascii_lowercase().as_str(),
                    "authorization"
                        | "proxy-authorization"
                        | "cookie"
                        | "set-cookie"
                        | "api_key"
                        | "api-key"
                        | "x-api-key"
                        | "password"
                        | "access_token"
                        | "refresh_token"
                )
            });
            for item in object.values_mut() {
                remove_credentials(item);
            }
        }
        Value::Array(items) => {
            for item in items {
                remove_credentials(item);
            }
        }
        _ => {}
    }
}

fn payload_capture_enabled(headers: &axum::http::HeaderMap) -> Result<bool, ApiError> {
    let mut values = headers.get_all("x-niu-log-payloads").iter();
    let Some(value) = values.next() else {
        return Ok(true);
    };
    if values.next().is_some() {
        return Err(ApiError::invalid_request(
            "Use one x-niu-log-payloads header with true or false",
        ));
    }
    match value.to_str() {
        Ok(value) if value.eq_ignore_ascii_case("true") => Ok(true),
        Ok(value) if value.eq_ignore_ascii_case("false") => Ok(false),
        _ => Err(ApiError::invalid_request(
            "x-niu-log-payloads must be true or false",
        )),
    }
}

pub async fn capture(
    State(state): State<AppState>,
    request: Request<Body>,
    next: Next,
) -> Response {
    let path = request.uri().path();
    let video = path == "/v1/video/jobs"
        || path.starts_with("/admin/v1/organizations/")
            && (path.ends_with("/video/jobs")
                || path.contains("/video-intents/") && path.ends_with("/submit"));
    let inference = video
        || matches!(
            path,
            "/v1/chat/completions" | "/v1/responses" | "/v1/messages" | "/v1/embeddings"
        )
        || path.starts_with("/admin/v1/organizations/") && path.ends_with("/chat/completions");
    let inference = inference || path.starts_with("/v1beta/models/");
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
        (Value::Null, request)
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
        let mut input = match serde_json::from_slice::<Value>(&bytes) {
            Ok(value) => value,
            Err(_) => return ApiError::invalid_request("Invalid JSON request").into_response(),
        };
        remove_credentials(&mut input);
        (input, Request::from_parts(parts, Body::from(bytes)))
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
        input = inspected.0;
        remove_credentials(&mut input);
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
