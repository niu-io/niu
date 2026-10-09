//! Exact approved bytes for a short-lived, claimed Supplier fetch capability.
//! Never log token paths or accept a caller-controlled remote source URL.
use crate::state::AppState;
use axum::{
    body::{Body, Bytes},
    extract::{Path, State, rejection::PathRejection},
    http::{HeaderMap, StatusCode, Uri},
    response::{IntoResponse, Response},
};
use std::sync::{Arc, LazyLock};
use tokio::sync::Semaphore;

pub(crate) static TRANSFERS: LazyLock<Arc<Semaphore>> =
    LazyLock::new(|| Arc::new(Semaphore::new(4)));

fn status(code: StatusCode) -> Response {
    let mut response = code.into_response();
    protect(&mut response);
    response
}
fn protect(response: &mut Response) {
    for (name, value) in [
        ("cache-control", "no-store, max-age=0"),
        ("referrer-policy", "no-referrer"),
        ("x-content-type-options", "nosniff"),
        ("cross-origin-resource-policy", "same-origin"),
        ("content-security-policy", "default-src 'none'; sandbox"),
    ] {
        response
            .headers_mut()
            .insert(name, axum::http::HeaderValue::from_static(value));
    }
}
pub(crate) async fn reject_head() -> Response {
    status(StatusCode::METHOD_NOT_ALLOWED)
}

pub(crate) async fn read(
    State(state): State<AppState>,
    path: Result<Path<String>, PathRejection>,
    uri: Uri,
    headers: HeaderMap,
) -> Response {
    let Ok(Path(token)) = path else {
        return status(StatusCode::NOT_FOUND);
    };
    if uri.query().is_some()
        || headers.contains_key("transfer-encoding")
        || headers.get("content-length").is_some_and(|v| v != "0")
    {
        return status(StatusCode::BAD_REQUEST);
    }
    if headers.contains_key("range") || headers.contains_key("if-range") {
        return status(StatusCode::RANGE_NOT_SATISFIABLE);
    }
    let Ok(permit) = TRANSFERS.clone().try_acquire_owned() else {
        let mut response = status(StatusCode::SERVICE_UNAVAILABLE);
        response
            .headers_mut()
            .insert("retry-after", axum::http::HeaderValue::from_static("1"));
        return response;
    };
    let Some(cipher) = &state.vendor_cipher else {
        return status(StatusCode::NOT_FOUND);
    };
    let detectors: Vec<_> = state
        .image_detectors
        .iter()
        .map(|(name, runtime)| (name.as_str(), runtime))
        .collect();
    let source = match state
        .store
        .deliver_asset_image_source(&token, &detectors, |aad, bytes| {
            cipher
                .open_bytes_with_aad(aad, bytes)
                .map_err(|_| niu_storage::StoreError::InvalidObservation)
        })
        .await
    {
        Ok(Some(source)) => source,
        Ok(None) | Err(_) => return status(StatusCode::NOT_FOUND),
    };
    let content_type = source.content_type().to_owned();
    let bytes = Bytes::copy_from_slice(source.bytes());
    let length = bytes.len();
    // Retain the slot in the body stream until it is consumed or dropped.
    let stream =
        futures_util::stream::unfold((Some(bytes), permit), |(bytes, permit)| async move {
            bytes.map(|bytes| (Ok::<_, std::convert::Infallible>(bytes), (None, permit)))
        });
    let mut response = Body::from_stream(stream).into_response();
    protect(&mut response);
    response.headers_mut().insert(
        "content-type",
        axum::http::HeaderValue::from_str(&content_type).expect("validated image content type"),
    );
    response
        .headers_mut()
        .insert("content-length", axum::http::HeaderValue::from(length));
    response.headers_mut().insert(
        "content-disposition",
        axum::http::HeaderValue::from_static("attachment"),
    );
    response
}
