//! Monotonic request timings. No content is retained by timing collection.
use crate::state::AppState;
use axum::{body::Body, extract::State, http::Request, middleware::Next, response::Response};
use futures_util::StreamExt;
use std::{
    sync::{Arc, Mutex},
    time::Instant,
};
use uuid::Uuid;

#[derive(Clone)]
pub struct Timing {
    measurements: Arc<Mutex<Measurements>>,
    writes: tokio_util::task::TaskTracker,
}
struct Measurements {
    start: Instant,
    dispatch: Option<i64>,
    attempt: Option<Uuid>,
    first_output: Option<i64>,
}
tokio::task_local! { static CURRENT: Timing; }
fn millis(start: Instant) -> i64 {
    start.elapsed().as_millis().min(i64::MAX as u128) as i64
}
pub fn current() -> Option<Timing> {
    CURRENT.try_with(Clone::clone).ok()
}
pub fn dispatched(store: &niu_storage::Store, attempt: Uuid) {
    if let Some(timing) = current() {
        let mut m = timing.measurements.lock().unwrap();
        let elapsed = millis(m.start);
        if let Some(previous) = m.attempt.filter(|previous| *previous != attempt) {
            // The previous rejection was not delivered to the client. Preserve
            // observed elapsed time without inventing headers/output or status.
            let record = niu_storage::RequestTimingRecord {
                attempt: previous,
                dispatch_ms: m.dispatch,
                headers_ms: None,
                first_output_ms: None,
                total_ms: elapsed,
                complete: false,
                http_status: None,
            };
            let store = store.clone();
            timing.writes.spawn(async move {
                if store.save_request_timing(record).await.is_err() {
                    tracing::warn!("Superseded attempt timing persistence failed");
                }
            });
        }
        m.dispatch = Some(elapsed);
        m.attempt = Some(attempt);
        m.first_output = None;
    }
}

impl Timing {
    pub fn output(&self) {
        let mut m = self.measurements.lock().unwrap();
        if m.first_output.is_none() {
            m.first_output = Some(millis(m.start));
        }
    }
}
struct Finish {
    timing: Timing,
    store: niu_storage::Store,
    headers: Option<i64>,
    status: Option<i32>,
    complete: bool,
    failed: bool,
}
impl Drop for Finish {
    fn drop(&mut self) {
        let m = self.timing.measurements.lock().unwrap();
        let Some(attempt) = m.attempt else {
            return;
        };
        let (dispatch, first, total) = (m.dispatch, m.first_output, millis(m.start));
        let (store, attempt, headers, status, complete) = (
            self.store.clone(),
            attempt,
            self.headers,
            self.status,
            self.complete,
        );
        self.timing.writes.spawn(async move {
            if store
                .save_request_timing(niu_storage::RequestTimingRecord {
                    attempt,
                    dispatch_ms: dispatch,
                    headers_ms: headers,
                    first_output_ms: first,
                    total_ms: total,
                    complete,
                    http_status: status,
                })
                .await
                .is_err()
            {
                tracing::warn!("Request timing persistence failed");
            }
        });
    }
}
pub async fn collect(
    State(state): State<AppState>,
    request: Request<Body>,
    next: Next,
) -> Response {
    let path = request.uri().path();
    let inference = matches!(
        path,
        "/v1/chat/completions" | "/v1/responses" | "/v1/embeddings" | "/v1/messages"
    ) || path.starts_with("/admin/v1/organizations/")
        && path.ends_with("/chat/completions");
    if !inference || request.method() != axum::http::Method::POST {
        return next.run(request).await;
    }
    let timing = Timing {
        measurements: Arc::new(Mutex::new(Measurements {
            start: Instant::now(),
            dispatch: None,
            attempt: None,
            first_output: None,
        })),
        writes: state.diagnostic_writes.clone(),
    };
    let mut finish = Finish {
        headers: None,
        status: None,
        timing: timing.clone(),
        store: state.store.clone(),
        complete: false,
        failed: false,
    };
    let response = CURRENT.scope(timing.clone(), next.run(request)).await;
    {
        let mut m = timing.measurements.lock().unwrap();
        if m.attempt.is_none() {
            m.attempt = response
                .headers()
                .get("x-niu-attempt-id")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| Uuid::parse_str(v).ok());
        }
        if m.attempt.is_none() {
            return response;
        }
        finish.headers = Some(millis(m.start));
    }
    finish.status = Some(response.status().as_u16() as i32);
    let (parts, body) = response.into_parts();
    let stream = futures_util::stream::unfold(
        (body.into_data_stream(), finish),
        |(mut stream, mut finish)| async move {
            match stream.next().await {
                Some(chunk) => {
                    finish.failed |= chunk.is_err();
                    Some((chunk, (stream, finish)))
                }
                None => {
                    finish.complete = !finish.failed;
                    drop(finish);
                    None
                }
            }
        },
    );
    Response::from_parts(parts, Body::from_stream(stream))
}
