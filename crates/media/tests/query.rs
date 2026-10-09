use niu_media::query::*;
use serde_json::{Value, json};
fn protocol() -> DirectQueryProtocol {
    DirectQueryProtocol {
        revision: "fixture-direct-v1".into(),
        meter: "video_tokens".into(),
        maximum_body_bytes: 4096,
        maximum_url_bytes: 1024,
    }
}
fn response() -> Value {
    json!({"id":"job","model":"model","status":"succeeded","usage":{"completion_tokens":108000},"content":{"video_url":"https://media.example/video.mp4?signature=private","last_frame_url":"https://media.example/last.png"},"created_at":10,"updated_at":20})
}
fn decode(value: &Value) -> Result<QueryObservation, QueryError> {
    protocol().decode(&serde_json::to_vec(value).unwrap(), "job", "model")
}
#[test]
fn completed_result_has_explicit_reported_usage_and_private_urls() {
    let result = decode(&response()).unwrap();
    assert_eq!(result.status, QueryStatus::Succeeded);
    assert_eq!(result.quantity, ReportedQuantity::Reported(108000));
    assert_eq!(
        result.times,
        ProviderTimes::Reported {
            created_at: 10,
            updated_at: 20
        }
    );
    assert_eq!(result.meter(), "video_tokens");
    assert_eq!(result.protocol_revision(), "fixture-direct-v1");
    assert!(result.video_url().unwrap().contains("signature=private"));
    assert!(result.last_frame_url().is_some());
}
#[test]
fn pending_and_unqualified_status_never_report_billable_actuals() {
    for (status, expected) in [
        ("queued", QueryStatus::Queued),
        ("running", QueryStatus::Running),
        ("cancelled", QueryStatus::Unknown),
        ("unexpected", QueryStatus::Unknown),
        ("failed", QueryStatus::Failed),
    ] {
        let mut value = response();
        value["status"] = status.into();
        value["usage"]["completion_tokens"] = 0.into();
        let result = decode(&value).unwrap();
        assert_eq!(result.status, expected);
        assert_eq!(result.quantity, ReportedQuantity::Missing);
        assert!(result.video_url().is_none());
    }
}
#[test]
fn missing_invalid_and_zero_usage_remain_distinct() {
    for (value, expected) in [
        (Value::Null, ReportedQuantity::Missing),
        (json!({}), ReportedQuantity::Missing),
        (
            json!({"completion_tokens":0}),
            ReportedQuantity::Reported(0),
        ),
        (json!({"completion_tokens":-1}), ReportedQuantity::Invalid),
        (json!({"completion_tokens":1.5}), ReportedQuantity::Invalid),
        (
            json!({"completion_tokens":"108000"}),
            ReportedQuantity::Invalid,
        ),
        (json!({"completion_tokens":null}), ReportedQuantity::Missing),
        (
            json!({"completion_tokens":u64::MAX}),
            ReportedQuantity::Reported(u64::MAX),
        ),
    ] {
        let mut body = response();
        body["usage"] = value;
        assert_eq!(decode(&body).unwrap().quantity, expected);
    }
    let mut body = response();
    body["updated_at"] = 9.into();
    assert_eq!(decode(&body).unwrap().times, ProviderTimes::Invalid);
    body.as_object_mut().unwrap().remove("content");
    let result = decode(&body).unwrap();
    assert!(result.video_url().is_none());
    assert_eq!(
        result.quantity,
        ReportedQuantity::Reported(108000),
        "missing download is not free generation"
    );
}
#[test]
fn identity_errors_unsafe_urls_and_malformed_responses_are_safe_failures() {
    for field in ["id", "model"] {
        let mut value = response();
        value[field] = "foreign".into();
        assert!(matches!(decode(&value), Err(QueryError::IdentityMismatch)));
    }
    for url in [
        "http://media.example/file",
        "https://localhost/file",
        "https://127.0.0.1/file",
        "https://user:secret@media.example/file",
        "file:///private/file",
        "https://media.example/file#secret",
    ] {
        let mut value = response();
        value["content"]["video_url"] = url.into();
        assert!(matches!(decode(&value), Err(QueryError::InvalidResponse)));
    }
    let mut value = response();
    value["error"] = json!({"code":"failure","message":"private upstream message"});
    assert!(matches!(decode(&value), Err(QueryError::InvalidResponse)));
    value["status"] = "failed".into();
    assert!(decode(&value).unwrap().has_provider_error);
    assert!(matches!(
        protocol().decode(b"[]", "job", "model"),
        Err(QueryError::InvalidResponse)
    ));
    assert!(matches!(
        protocol().decode(&vec![b' '; 4097], "job", "model"),
        Err(QueryError::TooLarge)
    ));
    let mut bad = protocol();
    bad.meter.clear();
    assert!(matches!(
        bad.decode(b"{}", "job", "model"),
        Err(QueryError::InvalidConfiguration)
    ));
}

#[test]
fn durable_metadata_excludes_identity_urls_and_preserves_large_exact_quantities() {
    let protocol = niu_media::query::DirectQueryProtocol {
        revision: "fixture".into(),
        meter: "video_tokens".into(),
        maximum_body_bytes: 4096,
        maximum_url_bytes: 1024,
    };
    let body=serde_json::to_vec(&serde_json::json!({"id":"private-job","model":"private-model","status":"succeeded","usage":{"completion_tokens":u64::MAX},"created_at":1,"updated_at":2,"content":{"video_url":"https://fixture.example/private-result"}})).unwrap();
    let observation = protocol
        .decode(&body, "private-job", "private-model")
        .unwrap();
    let metadata = observation.metadata();
    assert_eq!(metadata["quantity"]["value"], u64::MAX.to_string());
    assert_eq!(metadata["provider_times"]["created_at"], "1");
    assert_eq!(metadata["provider_times"]["updated_at"], "2");
    assert!(!metadata.to_string().contains("private-"));
    assert_eq!(metadata.as_object().unwrap().len(), 7);
}
