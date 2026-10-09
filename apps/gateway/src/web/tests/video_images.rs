use super::*;
use std::sync::atomic::{AtomicUsize, Ordering};

async fn call(
    app: &Router,
    method: axum::http::Method,
    path: &str,
    token: &str,
    body: Value,
) -> (StatusCode, Value) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(method)
                .uri(path)
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    let body = response.into_body().collect().await.unwrap().to_bytes();
    (status, serde_json::from_slice(&body).unwrap())
}

#[sqlx::test]
#[ignore = "requires PostgreSQL and isolated image detector credentials"]
async fn video_inline_images_require_exact_inspection_and_current_key_at_dispatch(pool: PgPool) {
    niu_storage::MIGRATOR.run(&pool).await.unwrap();
    let mut state = test_state(None, pool.clone());
    let scope = state.store.default_workspace().await.unwrap();
    let key = state
        .store
        .issue_key(
            scope,
            "Image video fixture",
            &["fixture-image-video".into()],
            3600,
        )
        .await
        .unwrap();
    let mut bytes = std::io::Cursor::new(Vec::new());
    image::DynamicImage::new_rgb8(2, 2)
        .write_to(&mut bytes, image::ImageFormat::Png)
        .unwrap();
    let reference = niu_media::image_input::decode(
        &bytes.into_inner(),
        "image/png",
        niu_media::image_input::DecodeLimits {
            maximum_encoded_bytes: 4096,
            maximum_width: 32,
            maximum_height: 32,
            maximum_decoded_bytes: 4096,
        },
    )
    .unwrap()
    .inline_reference(4096)
    .unwrap();
    let creates = Arc::new(AtomicUsize::new(0));
    let captures = creates.clone();
    let expected = reference.clone();
    let upstream = Router::new().route(
        "/contents/generations/tasks",
        post(move |Json(body): Json<Value>| {
            let captures = captures.clone();
            let expected = expected.clone();
            async move {
                captures.fetch_add(1, Ordering::SeqCst);
                assert_eq!(body["model"], "upstream-image-video");
                assert_eq!(body["content"][0]["text"], "prompt [REDACTED]");
                assert_eq!(body["content"][1]["image_url"]["url"], expected);
                Json(json!({"id":"fixture-image-job"}))
            }
        }),
    );
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = format!("http://{}", listener.local_addr().unwrap());
    let upstream_task = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
    let inspector_calls = Arc::new(AtomicUsize::new(0));
    let seen = inspector_calls.clone();
    let mode = Arc::new(AtomicUsize::new(0));
    let current_mode = mode.clone();
    let store = state.store.clone();
    let key_id = key.id;
    let inspector = Router::new().route("/inspect", post(move |Json(body): Json<Value>| {
        let seen = seen.clone(); let mode = current_mode.clone(); let store = store.clone(); async move {
            seen.fetch_add(1, Ordering::SeqCst);
            let mode = mode.load(Ordering::SeqCst);
            if mode == 2 { store.revoke_key(scope, key_id).await.unwrap(); }
            Json(json!({"schema_version":2,"detector_revision":body["detector_revision"],
                "content_sha256":body["content_sha256"],"verdict":if mode == 1 {"matched"} else {"clear"}}))
        }
    }));
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let inspection_endpoint = format!("http://{}/inspect", listener.local_addr().unwrap());
    let inspector_task =
        tokio::spawn(async move { axum::serve(listener, inspector).await.unwrap() });
    let runtime = niu_media::image_detector::Runtime::new(niu_media::image_detector::Config {
        endpoint: inspection_endpoint,
        api_key_env: "NIU_IMAGE_STORAGE_TEST_KEY".into(),
        detector_revision: "fixture-v2".into(),
        recipient: "Fixture".into(),
        region: "Fixture".into(),
        retention: "None".into(),
        authorized_workspaces: vec![scope.project_id.to_string()],
        declared_unmetered: true,
        timeout_ms: 1000,
        maximum_encoded_bytes: 4096,
        maximum_width: 32,
        maximum_height: 32,
        maximum_decoded_bytes: 4096,
        concurrency: 1,
    })
    .unwrap();
    let fingerprint = runtime.fingerprint().to_owned();
    state.image_detectors = Arc::new(std::collections::HashMap::from([(
        "fixture-image".into(),
        runtime,
    )]));
    let cipher = Arc::new(
        crate::vendors::crypto::CredentialCipher::new(
            "fixture-image-video-encryption-key-long-enough",
        )
        .unwrap(),
    );
    let vendor_id = Uuid::new_v4();
    let vendor = state
        .store
        .create_vendor(niu_storage::VendorInput {
            id: vendor_id,
            name: "Image video fixture".into(),
            adapter: "openai".into(),
            api_base: endpoint,
            enabled: true,
            credential_ciphertext: cipher.seal(vendor_id, "fixture-video-key").unwrap(),
        })
        .await
        .unwrap();
    state.vendor_cipher = Some(cipher);
    state
        .store
        .assign_personal_vendor_owner(vendor.id, scope.organization_id, vendor.revision)
        .await
        .unwrap();
    let mut schema = json!({"version":1,"revision":"image-schema-1","model_alias":"fixture-image-video","upstream_model":"upstream-image-video","channel":"ark-direct-v1","maximum_body_bytes":4096,"maximum_content_items":3,"inputs":{"text":{"maximum_items":1,"maximum_bytes":256,"https":false,"data_mime_types":[],"roles":[],"role_required":false},"image_url":{"maximum_items":2,"maximum_bytes":4096,"https":false,"data_mime_types":["image/png"],"roles":[],"role_required":false}},"controls":{},"required_controls":[],"exclusive_controls":[],"callbacks_qualified":false});
    schema["controls"] = json!({"resolution":{"kind":"choice","values":["720p"],"default":"720p"},
        "ratio":{"kind":"choice","values":["16:9"],"default":"16:9"},
        "duration":{"kind":"integer","minimum":1,"maximum":10,"default":5},
        "frames_per_second":{"kind":"integer","minimum":24,"maximum":60,"default":24}});
    schema["output"] = json!({"specifications":[{"resolution":"720p","ratio":"16:9","width":1280,"height":720}],
        "estimator":"SeedancePixelsV1","estimator_revision":"fixture-output-v1"});
    state
        .store
        .upsert_vendor_model(
            vendor.id,
            niu_storage::VendorModelInput {
                alias: "fixture-image-video".into(),
                upstream_model: "upstream-image-video".into(),
                public_catalog: false,
                enabled: true,
                capabilities: json!({"video_schema":schema}),
                pricing: None,
                expected_revision: None,
            },
        )
        .await
        .unwrap();
    let app = router(state.clone());
    let (status, models) = call(
        &app,
        axum::http::Method::GET,
        "/v1/video/models",
        &key.token,
        json!({}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(models["data"][0]["input_types"], json!(["text"]));
    let request = json!({"model":"fixture-image-video","content":[{"type":"text","text":"prompt secret"},{"type":"image_url","image_url":{"url":reference}}]});
    // No required, consented inspector: neither inspection nor generation.
    assert_eq!(
        call(
            &app,
            axum::http::Method::POST,
            "/v1/video/jobs",
            &key.token,
            request.clone()
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(inspector_calls.load(Ordering::SeqCst), 0);
    state.store.activate_workspace_guardrail(scope,0,&json!({"schema_version":1,"name":"Images",
        "models":{"mode":"inherit"},"providers":{"mode":"inherit"},
        "input_rules":[{"pattern":"secret","action":"redact"}],
        "image_detectors":[{"detector":"fixture-image","configuration_fingerprint":fingerprint,"consent_to_image_processing":true}]
    })).await.unwrap();
    let (status, models) = call(
        &app,
        axum::http::Method::GET,
        "/v1/video/models",
        &key.token,
        json!({}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        models["data"][0]["input_types"],
        json!(["text", "image_url"])
    );
    assert_eq!(models["data"][0]["image_url"]["maximum_items"], 1);
    assert_eq!(models["data"][0]["image_url"]["https"], false);
    assert_eq!(models["data"][0]["requires_image"], true);
    assert_eq!(inspector_calls.load(Ordering::SeqCst), 0);
    let mut oversized_batch = request.clone();
    oversized_batch["content"]
        .as_array_mut()
        .unwrap()
        .push(request["content"][1].clone());
    assert_eq!(
        call(
            &app,
            axum::http::Method::POST,
            "/v1/video/jobs",
            &key.token,
            oversized_batch
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(inspector_calls.load(Ordering::SeqCst), 0);
    assert_eq!(creates.load(Ordering::SeqCst), 0);
    // Invalid bytes, remote references and unbound upstream asset IDs must not
    // reach inspection or generation, including through preflight estimation.
    for reference in [
        "data:image/png;base64,not-base64",
        "data:image/png;base64,AAAA",
        "https://example.com/reference.png",
        "asset://asset-unbound-reference",
        "asset%3A%2F%2Fasset-unbound-reference",
        "ASSET://asset-unbound-reference",
    ] {
        for path in ["/v1/video/estimate", "/v1/video/jobs"] {
            let mut invalid = request.clone();
            invalid["content"][1]["image_url"]["url"] = json!(reference);
            let (status, response) =
                call(&app, axum::http::Method::POST, path, &key.token, invalid).await;
            assert!(status.is_client_error());
            assert!(!response.to_string().contains(reference));
            assert_eq!(inspector_calls.load(Ordering::SeqCst), 0);
            assert_eq!(creates.load(Ordering::SeqCst), 0);
            let attempts: i64 = sqlx::query_scalar("SELECT count(*) FROM attempts")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(attempts, 0);
        }
    }
    assert_eq!(
        call(
            &app,
            axum::http::Method::POST,
            "/v1/video/jobs",
            &key.token,
            request.clone()
        )
        .await
        .0,
        StatusCode::ACCEPTED
    );
    assert_eq!(creates.load(Ordering::SeqCst), 1);
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM image_request_bindings")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 1);
    mode.store(1, Ordering::SeqCst);
    assert_eq!(
        call(
            &app,
            axum::http::Method::POST,
            "/v1/video/jobs",
            &key.token,
            request.clone()
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(creates.load(Ordering::SeqCst), 1);
    mode.store(2, Ordering::SeqCst);
    assert_eq!(
        call(
            &app,
            axum::http::Method::POST,
            "/v1/video/jobs",
            &key.token,
            request
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(creates.load(Ordering::SeqCst), 1);
    assert_eq!(inspector_calls.load(Ordering::SeqCst), 3);
    for table in ["customer_balance_entries", "customer_balance_reservations"] {
        let count: i64 = sqlx::query_scalar(&format!("SELECT count(*) FROM {table}"))
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 0);
    }
    inspector_task.abort();
    upstream_task.abort();
}
