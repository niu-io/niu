//! An absolute upload deadline, independent of Provider and response deadlines.
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};

use axum::{
    body::{Body, HttpBody},
    extract::{Request, State},
    middleware::Next,
    response::{IntoResponse, Response},
};
use http_body_util::{BodyExt, StreamBody};

use crate::{error::ApiError, state::AppState};

pub(crate) async fn limit(State(state): State<AppState>, request: Request, next: Next) -> Response {
    if request.body().is_end_stream() {
        return next.run(request).await;
    }
    let deadline = tokio::time::Instant::now()
        + std::time::Duration::from_secs(state.config.server.request_body_timeout_seconds);
    let expired = Arc::new(AtomicBool::new(false));
    let (parts, body) = request.into_parts();
    let observed = expired.clone();
    let frames = futures_util::stream::unfold(Some(body), move |body| {
        let expired = observed.clone();
        async move {
            let mut body = body?;
            // Tokio polls the inner future before its timer. Check first so an
            // already-ready frame cannot extend an expired absolute budget.
            let frame = if tokio::time::Instant::now() >= deadline {
                Err(())
            } else {
                tokio::time::timeout_at(deadline, body.frame())
                    .await
                    .map_err(|_| ())
            };
            match frame {
                Ok(Some(frame)) => Some((frame, Some(body))),
                Ok(None) => None,
                Err(_) => {
                    expired.store(true, Ordering::Relaxed);
                    Some((
                        Err(axum::Error::new(std::io::Error::new(
                            std::io::ErrorKind::TimedOut,
                            "Request body deadline exceeded",
                        ))),
                        None,
                    ))
                }
            }
        }
    });
    let response = next
        .run(Request::from_parts(
            parts,
            Body::new(StreamBody::new(frames)),
        ))
        .await;
    if expired.load(Ordering::Relaxed) {
        ApiError::request_body_timeout().into_response()
    } else {
        response
    }
}
