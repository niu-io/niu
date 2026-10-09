use axum::{
    Router,
    body::Body,
    http::{HeaderMap, StatusCode, header},
    response::IntoResponse,
    routing::get,
};
use niu_media::{
    query::{DirectQueryProtocol, QueryStatus},
    transport::{QueryTransportError, query_job},
};
use std::{
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
    time::Duration,
};

#[tokio::test]
async fn query_transport_bounds_reads_and_never_follows_redirects_or_retries() {
    let calls = Arc::new(AtomicUsize::new(0));
    let seen = calls.clone();
    let router=Router::new().route("/job",get(move |headers:HeaderMap| { let seen=seen.clone(); async move {
        seen.fetch_add(1,Ordering::SeqCst);
        assert_eq!(headers.get(header::AUTHORIZATION).unwrap(),"Bearer fixture-token");
        axum::Json(serde_json::json!({"id":"job","model":"model","status":"succeeded","usage":{"completion_tokens":2}}))
    }})).route("/redirect",get(||async {(StatusCode::FOUND,[(header::LOCATION,"/job")])}))
    .route("/large",get(||async {"x".repeat(1024)}))
    .route("/chunked",get(||async { Body::from_stream(futures_util::stream::iter((0..4).map(|_|Ok::<_,std::io::Error>(vec![b'x';100])))) }))
    .route("/error",get(||async {(StatusCode::BAD_GATEWAY,"private error body")}))
    .route("/slow",get(||async {tokio::time::sleep(Duration::from_millis(200)).await;"{}".into_response()}));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
    let protocol = DirectQueryProtocol {
        revision: "fixture".into(),
        meter: "video_tokens".into(),
        maximum_body_bytes: 256,
        maximum_url_bytes: 1024,
    };
    let request = |path: &str| format!("http://{address}{path}");
    let result = query_job(
        &protocol,
        &request("/job"),
        "fixture-token",
        "job",
        "model",
        Duration::from_secs(2),
    )
    .await
    .unwrap();
    assert_eq!(result.status, QueryStatus::Succeeded);
    assert!(matches!(
        query_job(
            &protocol,
            &request("/redirect"),
            "fixture-token",
            "job",
            "model",
            Duration::from_secs(2)
        )
        .await,
        Err(QueryTransportError::HttpStatus(302))
    ));
    assert_eq!(calls.load(Ordering::SeqCst), 1);
    for path in ["/large", "/chunked"] {
        assert!(matches!(
            query_job(
                &protocol,
                &request(path),
                "fixture-token",
                "job",
                "model",
                Duration::from_secs(2)
            )
            .await,
            Err(QueryTransportError::TooLarge)
        ));
    }
    assert!(matches!(
        query_job(
            &protocol,
            &request("/error"),
            "fixture-token",
            "job",
            "model",
            Duration::from_secs(2)
        )
        .await,
        Err(QueryTransportError::HttpStatus(502))
    ));
    assert!(matches!(
        query_job(
            &protocol,
            &request("/slow"),
            "fixture-token",
            "job",
            "model",
            Duration::from_millis(20)
        )
        .await,
        Err(QueryTransportError::Timeout)
    ));
    let mut invalid = protocol;
    invalid.revision.clear();
    assert!(
        query_job(
            &invalid,
            &request("/job"),
            "fixture-token",
            "job",
            "model",
            Duration::from_secs(2)
        )
        .await
        .is_err()
    );
    assert_eq!(
        calls.load(Ordering::SeqCst),
        1,
        "invalid protocol must not dispatch"
    );
    server.abort();
}
