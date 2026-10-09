use axum::{Json, Router, extract::Path, http::StatusCode, response::IntoResponse, routing::post};
use image::{DynamicImage, ImageFormat};
use niu_media::{
    image_input::{DecodeLimits, DecodeService},
    image_inspection::{ImageInspectionContract, InspectionError, inspect},
};
use std::{
    io::Cursor,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
    time::Duration,
};

#[tokio::test]
async fn exact_image_verdicts_bound_content_revision_and_failure_behavior() {
    let calls = Arc::new(AtomicUsize::new(0));
    let seen = calls.clone();
    let router=Router::new().route("/{mode}",post(move |Path(mode):Path<String>,Json(body):Json<serde_json::Value>| {
        let seen=seen.clone();async move {
            seen.fetch_add(1,Ordering::SeqCst);
            assert_eq!(body["schema_version"],2);
            assert!(body["image"].as_str().unwrap().starts_with("data:image/png;base64,"));
            let mut response=serde_json::json!({"schema_version":2,"detector_revision":body["detector_revision"],"content_sha256":body["content_sha256"],"verdict":"clear"});
            match mode.as_str() {
                "matched"=>response["verdict"]="matched".into(),
                "wrong-content"=>response["content_sha256"]="0".repeat(64).into(),
                "wrong-revision"=>response["detector_revision"]="other".into(),
                "wrong-version"=>response["schema_version"]=1.into(),
                "unknown"=>response["verdict"]="unknown".into(),
                "extra"=>response["private"]="untrusted-detector-message".into(),
                "large"=>return "x".repeat(4097).into_response(),
                "error"=>return (StatusCode::BAD_GATEWAY,"private service failure").into_response(),
                "redirect"=>return (StatusCode::FOUND,[("location","/clear")]).into_response(),
                "slow"=>tokio::time::sleep(Duration::from_millis(200)).await,
                _=>{}
            }
            Json(response).into_response()
        }
    }));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
    let mut bytes = Cursor::new(Vec::new());
    DynamicImage::new_rgb8(2, 2)
        .write_to(&mut bytes, ImageFormat::Png)
        .unwrap();
    let bytes = bytes.into_inner();
    let service = DecodeService::new(
        DecodeLimits {
            maximum_encoded_bytes: 4096,
            maximum_width: 32,
            maximum_height: 32,
            maximum_decoded_bytes: 4096,
        },
        1,
    )
    .unwrap();
    let contract = ImageInspectionContract {
        detector_revision: "fixture-image-v1".into(),
        maximum_inline_bytes: 4096,
    };
    let image = service.decode(&bytes, "image/png").await.unwrap();
    let expected = image.inline_reference(4096).unwrap();
    let approval = inspect(
        &contract,
        &format!("http://{address}/clear"),
        "synthetic-fixture-key",
        image,
        Duration::from_secs(2),
    )
    .await
    .unwrap();
    assert_eq!(approval.inline_reference(4096).unwrap(), expected);
    assert_eq!(approval.detector_revision(), "fixture-image-v1");
    assert_eq!(approval.content_sha256().len(), 64);
    assert!(service.decode(&bytes, "image/png").await.is_err());
    drop(approval);
    for (mode, error) in [
        ("matched", InspectionError::Matched),
        ("wrong-content", InspectionError::InvalidResponse),
        ("wrong-revision", InspectionError::InvalidResponse),
        ("wrong-version", InspectionError::InvalidResponse),
        ("unknown", InspectionError::InvalidResponse),
        ("extra", InspectionError::InvalidResponse),
        ("large", InspectionError::ResponseLimit),
        ("error", InspectionError::ServiceFailure),
        ("redirect", InspectionError::ServiceFailure),
        ("slow", InspectionError::Timeout),
    ] {
        let before = calls.load(Ordering::SeqCst);
        let image = service.decode(&bytes, "image/png").await.unwrap();
        let result = inspect(
            &contract,
            &format!("http://{address}/{mode}"),
            "synthetic-fixture-key",
            image,
            Duration::from_millis(100),
        )
        .await;
        assert_eq!(result.err(), Some(error), "{mode}");
        assert_eq!(
            calls.load(Ordering::SeqCst),
            before + 1,
            "no retry or redirect"
        );
    }
    let before = calls.load(Ordering::SeqCst);
    for (credential, timeout) in [
        ("", Duration::from_secs(1)),
        ("key", Duration::ZERO),
        ("key", Duration::from_secs(31)),
    ] {
        let image = service.decode(&bytes, "image/png").await.unwrap();
        assert_eq!(
            inspect(
                &contract,
                &format!("http://{address}/clear"),
                credential,
                image,
                timeout
            )
            .await
            .err(),
            Some(InspectionError::InvalidConfiguration)
        );
    }
    assert_eq!(calls.load(Ordering::SeqCst), before);
    assert!(service.decode(&bytes, "image/png").await.is_ok());
    server.abort();
}
