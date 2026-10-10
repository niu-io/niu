use axum::{
    Json, Router,
    http::{HeaderMap, StatusCode},
    routing::post,
};
use niu_media::{
    VideoSchema,
    submission::{SubmissionError, submit_job},
};
use serde_json::json;
use std::{
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
    time::Duration,
};

#[tokio::test]
async fn submission_never_replays_uncertain_paid_operations() {
    let schema: VideoSchema = serde_json::from_value(json!({
        "version":1,"revision":"fixture","model_alias":"video","upstream_model":"upstream",
        "channel":"fixture","maximum_body_bytes":1024,"maximum_content_items":1,
        "inputs":{"text":{"maximum_items":1,"maximum_bytes":512,"https":false,
            "data_mime_types":[],"roles":[],"role_required":false}},
        "controls":{},"required_controls":[],"exclusive_controls":[],"callbacks_qualified":false
    }))
    .unwrap();
    let request = schema
        .validate_request(br#"{"model":"video","content":[{"type":"text","text":"hello"}]}"#)
        .unwrap();
    let calls = Arc::new(AtomicUsize::new(0));
    let observed = calls.clone();
    let app = Router::new().route(
        "/{mode}",
        post(
            move |axum::extract::Path(mode): axum::extract::Path<String>,
                  headers: HeaderMap,
                  Json(body): Json<serde_json::Value>| {
                let observed = observed.clone();
                async move {
                    observed.fetch_add(1, Ordering::SeqCst);
                    assert_eq!(headers["authorization"], "Bearer fixture-token");
                    assert_eq!(body["model"], "upstream");
                    match mode.as_str() {
                        "slow" => {
                            tokio::time::sleep(Duration::from_millis(100)).await;
                            (StatusCode::OK, Json(json!({"id":"job"})))
                        }
                        "error" => (StatusCode::BAD_GATEWAY, Json(json!({"private":"secret"}))),
                        "malformed" => (StatusCode::OK, Json(json!({"id":""}))),
                        "large" => (StatusCode::OK, Json(json!({"id":"x".repeat(1024)}))),
                        _ => (StatusCode::OK, Json(json!({"id":"job"}))),
                    }
                }
            },
        ),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    let endpoint = |mode: &str| format!("http://{address}/{mode}");
    let receipt = submit_job(
        &endpoint("ok"),
        "fixture-token",
        "fixture",
        &request,
        256,
        Duration::from_secs(1),
    )
    .await
    .unwrap();
    assert_eq!(receipt.upstream_job(), "job");
    for mode in ["error", "malformed", "large", "slow"] {
        let before = calls.load(Ordering::SeqCst);
        assert!(matches!(
            submit_job(
                &endpoint(mode),
                "fixture-token",
                "fixture",
                &request,
                256,
                Duration::from_millis(30)
            )
            .await,
            Err(SubmissionError::Uncertain | SubmissionError::UncertainHttpStatus(_))
        ));
        assert_eq!(calls.load(Ordering::SeqCst), before + 1);
    }
    let before = calls.load(Ordering::SeqCst);
    assert!(matches!(
        submit_job(
            &endpoint("ok"),
            "fixture-token",
            "",
            &request,
            256,
            Duration::from_secs(1)
        )
        .await,
        Err(SubmissionError::InvalidConfiguration)
    ));
    assert_eq!(calls.load(Ordering::SeqCst), before);
    server.abort();
}
