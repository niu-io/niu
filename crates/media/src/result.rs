//! Bounded retrieval of private Supplier result URLs. Callers must establish
//! current job authorization and retention before invoking this transport.
use std::time::Duration;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ResultKind {
    Video,
    LastFrame,
    ReferenceImage,
}
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ResultError {
    InvalidConfiguration,
    EndpointRejected,
    Transport,
    Timeout,
    Unavailable,
    HttpStatus(u16),
    TooLarge,
    InvalidMedia,
}
/// Intentionally lacks Debug/Serialize: the body is private customer content.
pub struct ResultMedia {
    pub content_type: &'static str,
    pub bytes: Vec<u8>,
}
fn transport_error(error: reqwest::Error) -> ResultError {
    if error.is_timeout() {
        ResultError::Timeout
    } else {
        ResultError::Transport
    }
}
fn format(kind: ResultKind, mime: &str, body: &[u8]) -> Option<&'static str> {
    match (kind, mime) {
        (ResultKind::Video, "video/mp4") if body.len() >= 12 && &body[4..8] == b"ftyp" => {
            Some("video/mp4")
        }
        (ResultKind::Video, "video/webm") if body.starts_with(&[0x1a, 0x45, 0xdf, 0xa3]) => {
            Some("video/webm")
        }
        (ResultKind::LastFrame | ResultKind::ReferenceImage, "image/png")
            if body.starts_with(b"\x89PNG\r\n\x1a\n") =>
        {
            Some("image/png")
        }
        (ResultKind::LastFrame | ResultKind::ReferenceImage, "image/jpeg")
            if body.starts_with(&[0xff, 0xd8, 0xff]) =>
        {
            Some("image/jpeg")
        }
        (ResultKind::ReferenceImage, "image/webp")
            if body.len() >= 12 && &body[..4] == b"RIFF" && &body[8..12] == b"WEBP" =>
        {
            Some("image/webp")
        }
        _ => None,
    }
}
async fn read(
    mut response: reqwest::Response,
    kind: ResultKind,
    maximum_bytes: usize,
) -> Result<ResultMedia, ResultError> {
    match response.status().as_u16() {
        200 => {}
        403 | 404 | 410 => return Err(ResultError::Unavailable),
        status => return Err(ResultError::HttpStatus(status)),
    }
    if response
        .headers()
        .contains_key(reqwest::header::CONTENT_ENCODING)
    {
        return Err(ResultError::InvalidMedia);
    }
    let mime = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.split(';').next())
        .map(|v| v.trim().to_ascii_lowercase())
        .ok_or(ResultError::InvalidMedia)?;
    if !matches!(
        (kind, mime.as_str()),
        (ResultKind::Video, "video/mp4" | "video/webm")
            | (ResultKind::LastFrame, "image/png" | "image/jpeg")
            | (
                ResultKind::ReferenceImage,
                "image/png" | "image/jpeg" | "image/webp"
            )
    ) {
        return Err(ResultError::InvalidMedia);
    }
    if response
        .content_length()
        .is_some_and(|n| n > maximum_bytes as u64)
    {
        return Err(ResultError::TooLarge);
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(transport_error)? {
        if chunk.len() > maximum_bytes.saturating_sub(bytes.len()) {
            return Err(ResultError::TooLarge);
        }
        bytes.extend_from_slice(&chunk);
    }
    let content_type = format(kind, &mime, &bytes).ok_or(ResultError::InvalidMedia)?;
    Ok(ResultMedia {
        content_type,
        bytes,
    })
}
/// One GET, no retries, credentials, cookies, redirects or environment proxies.
/// HTTPS syntax is checked before DNS; the upstream client verifies all resolved
/// addresses and pins them to the connection. Signed URLs never enter errors.
/// File signatures only validate the container type, not media safety/inspection.
pub async fn fetch_result(
    endpoint: &str,
    kind: ResultKind,
    maximum_bytes: usize,
    timeout: Duration,
) -> Result<ResultMedia, ResultError> {
    if maximum_bytes == 0
        || maximum_bytes > 256 * 1024 * 1024
        || timeout.is_zero()
        || timeout > Duration::from_secs(60)
    {
        return Err(ResultError::InvalidConfiguration);
    }
    if !crate::public_https(endpoint, 8192) {
        return Err(ResultError::EndpointRejected);
    }
    let work = async {
        let client = niu_upstream::client_for_endpoint(endpoint, timeout)
            .await
            .map_err(|_| ResultError::EndpointRejected)?;
        let response = client
            .get(endpoint)
            .header(reqwest::header::ACCEPT_ENCODING, "identity")
            .send()
            .await
            .map_err(transport_error)?;
        read(response, kind, maximum_bytes).await
    };
    tokio::time::timeout(timeout, work)
        .await
        .map_err(|_| ResultError::Timeout)?
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        Router,
        body::Body,
        http::{HeaderMap, StatusCode, header},
        routing::get,
    };
    #[tokio::test]
    async fn reference_response_reader_preserves_encoding_and_kind_boundaries() {
        let mut encoded = std::io::Cursor::new(Vec::new());
        image::DynamicImage::new_rgb8(2, 2)
            .write_to(&mut encoded, image::ImageFormat::WebP)
            .unwrap();
        let webp = encoded.into_inner();
        let router = Router::new()
            .route(
                "/image",
                get(move |headers: HeaderMap| {
                    let body = webp.clone();
                    async move {
                        assert!(!headers.contains_key(header::AUTHORIZATION));
                        assert!(!headers.contains_key(header::COOKIE));
                        ([(header::CONTENT_TYPE, "image/webp")], body)
                    }
                }),
            )
            .route(
                "/encoded",
                get(|| async {
                    (
                        [
                            (header::CONTENT_TYPE, "image/png"),
                            (header::CONTENT_ENCODING, "gzip"),
                        ],
                        b"private-compressed-content".to_vec(),
                    )
                }),
            )
            .route(
                "/svg",
                get(|| async {
                    (
                        [(header::CONTENT_TYPE, "image/svg+xml")],
                        "<svg>private</svg>",
                    )
                }),
            );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
        // Exercise only response handling locally, without weakening public HTTPS/DNS rules.
        let client = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap();
        let response = client
            .get(format!("http://{address}/image"))
            .send()
            .await
            .unwrap();
        let media = read(response, ResultKind::ReferenceImage, 4096)
            .await
            .unwrap();
        let service = crate::image_input::DecodeService::new(
            crate::image_input::DecodeLimits {
                maximum_encoded_bytes: 4096,
                maximum_width: 32,
                maximum_height: 32,
                maximum_decoded_bytes: 4096,
            },
            1,
        )
        .unwrap();
        let decoded = service
            .decode(&media.bytes, media.content_type)
            .await
            .unwrap();
        assert_eq!((decoded.width(), decoded.height()), (2, 2));
        for (path, kind) in [
            ("image", ResultKind::LastFrame),
            ("image", ResultKind::Video),
            ("encoded", ResultKind::ReferenceImage),
            ("svg", ResultKind::ReferenceImage),
        ] {
            let response = client
                .get(format!("http://{address}/{path}"))
                .send()
                .await
                .unwrap();
            assert_eq!(
                read(response, kind, 4096).await.err(),
                Some(ResultError::InvalidMedia)
            );
        }
        server.abort();
    }
    #[tokio::test]
    async fn result_reads_bound_chunked_data_and_reject_redirects_wrong_types_and_expiry() {
        let router = Router::new()
            .route(
                "/video",
                get(|headers: HeaderMap| async move {
                    assert!(!headers.contains_key(header::AUTHORIZATION));
                    assert!(!headers.contains_key(header::COOKIE));
                    (
                        [(header::CONTENT_TYPE, "video/mp4")],
                        b"\x00\x00\x00\x18ftypisom".to_vec(),
                    )
                }),
            )
            .route(
                "/redirect",
                get(|| async { (StatusCode::FOUND, [(header::LOCATION, "/video")]) }),
            )
            .route(
                "/expired",
                get(|| async { (StatusCode::GONE, "private signed-url error") }),
            )
            .route(
                "/html",
                get(|| async {
                    (
                        [(header::CONTENT_TYPE, "text/html")],
                        "<script>private</script>",
                    )
                }),
            )
            .route(
                "/fake",
                get(|| async { ([(header::CONTENT_TYPE, "video/mp4")], "<html>bad</html>") }),
            )
            .route(
                "/chunked",
                get(|| async {
                    (
                        [(header::CONTENT_TYPE, "video/mp4")],
                        Body::from_stream(futures_util::stream::iter(
                            (0..4).map(|_| Ok::<_, std::io::Error>(vec![b'x'; 8])),
                        )),
                    )
                }),
            );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
        // Test only the response reader over loopback. Public transport never permits HTTP/local URLs.
        let client = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap();
        for (path, expected) in [
            ("redirect", ResultError::HttpStatus(302)),
            ("expired", ResultError::Unavailable),
            ("html", ResultError::InvalidMedia),
            ("fake", ResultError::InvalidMedia),
            ("chunked", ResultError::TooLarge),
        ] {
            let response = client
                .get(format!("http://{address}/{path}"))
                .send()
                .await
                .unwrap();
            assert_eq!(
                read(response, ResultKind::Video, 16).await.err(),
                Some(expected)
            );
        }
        let response = client
            .get(format!("http://{address}/video"))
            .send()
            .await
            .unwrap();
        let result = read(response, ResultKind::Video, 16).await.unwrap();
        assert_eq!(result.content_type, "video/mp4");
        assert_eq!(result.bytes.len(), 12);
        server.abort();
    }
    #[tokio::test]
    async fn public_result_transport_rejects_local_credentials_and_invalid_bounds_before_network() {
        for endpoint in [
            "http://localhost/a",
            "https://127.0.0.1/a",
            "https://[::1]/a",
            "https://media.local/a",
            "https://user:secret@media.example/a",
            "https://media.example/a#private",
        ] {
            assert_eq!(
                fetch_result(endpoint, ResultKind::Video, 16, Duration::from_secs(1))
                    .await
                    .err(),
                Some(ResultError::EndpointRejected)
            );
        }
        assert_eq!(
            fetch_result(
                "https://media.example/a",
                ResultKind::Video,
                0,
                Duration::from_secs(1)
            )
            .await
            .err(),
            Some(ResultError::InvalidConfiguration)
        );
    }
    #[test]
    fn images_and_video_cannot_masquerade_as_each_other_or_active_documents() {
        assert_eq!(
            format(ResultKind::LastFrame, "image/png", b"\x89PNG\r\n\x1a\n"),
            Some("image/png")
        );
        assert_eq!(
            format(ResultKind::Video, "image/png", b"\x89PNG\r\n\x1a\n"),
            None
        );
        assert_eq!(
            format(ResultKind::LastFrame, "image/svg+xml", b"<svg/>"),
            None
        );
        assert_eq!(format(ResultKind::LastFrame, "image/jpeg", b"<html>"), None);
    }
}
