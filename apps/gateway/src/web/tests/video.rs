use super::*;

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn video_job_reads_require_current_scoped_model_access(pool: PgPool) {
    niu_storage::MIGRATOR.run(&pool).await.unwrap();
    let mut state = test_state(None, pool.clone());
    state.vendor_cipher = Some(Arc::new(
        crate::vendors::crypto::CredentialCipher::new(
            "fixture-media-result-encryption-key-with-entropy-123456",
        )
        .unwrap(),
    ));
    let scope = state.store.default_workspace().await.unwrap();
    let key = state
        .store
        .issue_key(scope, "Video reader", &["*".into()], 3600)
        .await
        .unwrap();
    let vendor = state
        .store
        .create_vendor(niu_storage::VendorInput {
            id: Uuid::new_v4(),
            name: "Video status fixture".into(),
            adapter: "openai".into(),
            api_base: "https://fixture.example/v1".into(),
            enabled: true,
            credential_ciphertext: vec![17; 48],
        })
        .await
        .unwrap();
    let schema = json!({"version":1,"revision":"status-schema","model_alias":"fixture-video","upstream_model":"private-model","channel":"fixture","maximum_body_bytes":1024,"maximum_content_items":1,"inputs":{"text":{"maximum_items":1,"maximum_bytes":256,"https":false,"data_mime_types":[],"roles":[],"role_required":false}},"controls":{},"required_controls":[],"exclusive_controls":[],"callbacks_qualified":false});
    state
        .store
        .upsert_vendor_model(
            vendor.id,
            niu_storage::VendorModelInput {
                alias: "fixture-video".into(),
                upstream_model: "private-model".into(),
                public_catalog: false,
                enabled: true,
                capabilities: json!({"video_schema":schema}),
                pricing: None,
                expected_revision: None,
            },
        )
        .await
        .unwrap();
    let operation = state
        .store
        .create_operation(scope, "fixture-video")
        .await
        .unwrap();
    let id = state
        .store
        .prepare_attempt(scope, operation, "fixture-video", "fixture-offer")
        .await
        .unwrap();
    state
        .store
        .pin_media_recovery_route(scope, id)
        .await
        .unwrap();
    sqlx::query(
        "UPDATE attempts SET execution='may_have_executed',dispatched_at=now() WHERE id=$1",
    )
    .bind(id)
    .execute(&pool)
    .await
    .unwrap();
    let app = router(state.clone());
    let path = format!("/v1/video/jobs/{}", Uuid::new_v4());
    for (token, expected) in [
        (None, StatusCode::UNAUTHORIZED),
        (Some(key.token.as_str()), StatusCode::NOT_FOUND),
    ] {
        let mut request = Request::get(&path);
        if let Some(token) = token {
            request = request.header("authorization", format!("Bearer {token}"));
        }
        let response = app
            .clone()
            .oneshot(request.body(axum::body::Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
    }
    let response = app
        .clone()
        .oneshot(
            Request::get(format!("/v1/video/jobs/{id}"))
                .header("authorization", format!("Bearer {}", key.token))
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let value: Value =
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(value["status"], "submission_unknown");
    assert_eq!(value["model"], "fixture-video");
    assert_eq!(value.as_object().unwrap().len(), 4);
    let other = state
        .store
        .create_project(scope.organization_id, "Other video workspace")
        .await
        .unwrap();
    let other_key = state
        .store
        .issue_key(other, "Other workspace", &["*".into()], 3600)
        .await
        .unwrap();
    let denied_key = state
        .store
        .issue_key(scope, "Other model", &["different-model".into()], 3600)
        .await
        .unwrap();
    for suffix in ["", "/billing", "/results/video"] {
        for token in [&other_key.token, &denied_key.token] {
            let response = app
                .clone()
                .oneshot(
                    Request::get(format!("/v1/video/jobs/{id}{suffix}"))
                        .header("authorization", format!("Bearer {token}"))
                        .body(axum::body::Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::NOT_FOUND);
        }
    }
    for (endpoint, body) in [
        (
            "/v1/chat/completions",
            json!({"model":"fixture-video","messages":[{"role":"user","content":"Generate a video"}]}),
        ),
        (
            "/v1/responses",
            json!({"model":"fixture-video","input":"Generate a video"}),
        ),
        (
            "/v1/embeddings",
            json!({"model":"fixture-video","input":"Generate a video"}),
        ),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::post(endpoint)
                    .header("authorization", format!("Bearer {}", key.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(
            response.status(),
            StatusCode::NOT_IMPLEMENTED,
            "video model must not be routed to {endpoint}"
        );
    }
    let attempts: i64 = sqlx::query_scalar("SELECT count(*) FROM attempts WHERE project_id=$1")
        .bind(scope.project_id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(
        attempts, 1,
        "text endpoint rejection must not create a dispatch attempt"
    );
    for (index, statuses) in [
        vec![niu_storage::MediaJobStatus::Queued],
        vec![niu_storage::MediaJobStatus::Running],
        vec![
            niu_storage::MediaJobStatus::Succeeded,
            niu_storage::MediaJobStatus::Failed,
        ],
    ]
    .into_iter()
    .enumerate()
    {
        let operation = state
            .store
            .create_operation(scope, "fixture-video")
            .await
            .unwrap();
        let attempt = state
            .store
            .prepare_attempt(scope, operation, "fixture-video", "fixture-offer")
            .await
            .unwrap();
        state
            .store
            .pin_media_recovery_route(scope, attempt)
            .await
            .unwrap();
        sqlx::query(
            "UPDATE attempts SET execution='may_have_executed',dispatched_at=now() WHERE id=$1",
        )
        .bind(attempt)
        .execute(&pool)
        .await
        .unwrap();
        state
            .store
            .bind_media_job(
                scope,
                attempt,
                &format!("history-upstream-{index}"),
                "status-schema",
            )
            .await
            .unwrap();
        for status in statuses {
            state
                .store
                .record_media_job_status(scope, attempt, status)
                .await
                .unwrap();
        }
    }
    async fn history(app: &Router, token: &str, query: &str) -> (StatusCode, Value) {
        let response = app
            .clone()
            .oneshot(
                Request::get(format!("/v1/video/jobs{query}"))
                    .header("authorization", format!("Bearer {token}"))
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let status = response.status();
        let body =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        (status, body)
    }
    let (status, first) = history(&app, &key.token, "?limit=2").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(first["data"].as_array().unwrap().len(), 2);
    assert_eq!(first["has_more"], true);
    let cursor = first["next_before"].as_str().unwrap();
    let (status, second) = history(&app, &key.token, &format!("?limit=2&before={cursor}")).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(second["data"].as_array().unwrap().len(), 2);
    assert_eq!(second["has_more"], false);
    assert!(second["next_before"].is_null());
    let rows: Vec<_> = first["data"]
        .as_array()
        .unwrap()
        .iter()
        .chain(second["data"].as_array().unwrap())
        .collect();
    let ids: std::collections::HashSet<_> =
        rows.iter().map(|row| row["id"].as_str().unwrap()).collect();
    assert_eq!(ids.len(), 4);
    assert!(ids.contains(id.to_string().as_str()));
    let statuses: std::collections::HashSet<_> = rows
        .iter()
        .map(|row| row["status"].as_str().unwrap())
        .collect();
    assert_eq!(
        statuses,
        std::collections::HashSet::from([
            "submission_unknown",
            "queued",
            "running",
            "reconciliation_required"
        ])
    );
    assert!(rows.iter().all(|row| {
        row.as_object().unwrap().len() == 5
            && row["created_at_ms"]
                .as_str()
                .unwrap()
                .parse::<i64>()
                .is_ok()
    }));
    assert!(!first.to_string().contains("private-model"));
    assert!(!first.to_string().contains("history-upstream"));
    for token in [&other_key.token, &denied_key.token] {
        let (status, empty) = history(&app, token, "").await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(empty["data"], json!([]));
        assert_eq!(
            history(&app, token, &format!("?before={cursor}")).await.0,
            StatusCode::BAD_REQUEST
        );
    }
    for query in [
        "?limit=0",
        "?limit=101",
        "?before=invalid",
        "?extra=invalid",
    ] {
        assert_eq!(
            history(&app, &key.token, query).await.0,
            StatusCode::BAD_REQUEST
        );
    }
    assert_eq!(
        history(&app, &key.token, &format!("?before={}", Uuid::new_v4()))
            .await
            .0,
        StatusCode::BAD_REQUEST
    );
    // Dashboard sessions select an active workspace key without receiving its secret.
    let viewer = state
        .store
        .create_operator(
            niu_storage::OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(scope.project_id),
            },
            "Video reader",
            niu_storage::OperatorRole::Viewer,
            3600,
            niu_storage::OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let base = format!(
        "/admin/v1/organizations/{}/projects/{}/keys/{}/video",
        scope.organization_id, scope.project_id, key.id
    );
    for suffix in [
        "/jobs".to_string(),
        format!("/jobs/{id}"),
        format!("/jobs/{id}/billing"),
        format!("/jobs/{id}/timings"),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::get(format!("{base}{suffix}"))
                    .header("authorization", format!("Bearer {}", viewer.token))
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK, "dashboard read {suffix}");
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        assert!(!String::from_utf8_lossy(&bytes).contains(&key.token));
    }
    for suffix in ["/jobs".to_string(), format!("/jobs/{id}/refresh")] {
        let response = app
            .clone()
            .oneshot(
                Request::post(format!("{base}{suffix}"))
                    .header("authorization", format!("Bearer {}", viewer.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from("{}"))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }
    let foreign = format!(
        "/admin/v1/organizations/{}/projects/{}/keys/{}/video/jobs",
        other.organization_id, other.project_id, other_key.id
    );
    let response = app
        .clone()
        .oneshot(
            Request::get(foreign)
                .header("authorization", format!("Bearer {}", viewer.token))
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    let denied_base = format!(
        "/admin/v1/organizations/{}/projects/{}/keys/{}/video",
        scope.organization_id, scope.project_id, denied_key.id
    );
    for suffix in [
        format!("/jobs/{id}"),
        format!("/jobs/{id}/billing"),
        format!("/jobs/{id}/timings"),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::get(format!("{denied_base}{suffix}"))
                    .header("authorization", format!("Bearer {}", viewer.token))
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }
    state
        .store
        .bind_media_job(scope, id, "private-results-job", "status-schema")
        .await
        .unwrap();
    state
        .store
        .record_media_job_status(scope, id, niu_storage::MediaJobStatus::Succeeded)
        .await
        .unwrap();
    let private_url = "https://127.0.0.1/private-result?signature=secret";
    let kind = niu_storage::MediaResultKind::Video;
    let encrypted = state
        .vendor_cipher
        .as_ref()
        .unwrap()
        .seal_media_result(scope, id, kind, private_url)
        .unwrap();
    state
        .store
        .save_media_result_reference(scope, id, kind, &encrypted)
        .await
        .unwrap();
    for (token, expected) in [
        (&key.token, StatusCode::BAD_GATEWAY),
        (&denied_key.token, StatusCode::NOT_FOUND),
        (&other_key.token, StatusCode::NOT_FOUND),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::get(format!("/v1/video/jobs/{id}/results/video"))
                    .header("authorization", format!("Bearer {token}"))
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        let text = String::from_utf8_lossy(&bytes);
        assert!(!text.contains("signature"));
        assert!(!text.contains("127.0.0.1"));
        if expected == StatusCode::BAD_GATEWAY {
            let body: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
            assert_eq!(body["error"]["type"], "media_result_destination_rejected");
            assert!(body["error"]["message"].as_str().unwrap().contains("DNS"));
        }
    }
    let response = app
        .clone()
        .oneshot(
            Request::get(format!("{base}/jobs/{id}/results/video"))
                .header("authorization", format!("Bearer {}", viewer.token))
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(
        response.status(),
        StatusCode::BAD_GATEWAY,
        "reader reaches authorized result retrieval without a key secret"
    );
    let response = app
        .clone()
        .oneshot(
            Request::delete(format!("{base}/jobs/{id}/results"))
                .header("authorization", format!("Bearer {}", viewer.token))
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    let response = app
        .clone()
        .oneshot(
            Request::get(format!("{denied_base}/jobs/{id}/results/video"))
                .header("authorization", format!("Bearer {}", viewer.token))
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    let foreign_result = format!(
        "/admin/v1/organizations/{}/projects/{}/keys/{}/video/jobs/{id}/results/video",
        other.organization_id, other.project_id, other_key.id
    );
    let response = app
        .clone()
        .oneshot(
            Request::get(foreign_result)
                .header("authorization", format!("Bearer {}", viewer.token))
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    for (path, token) in [
        (format!("/v1/video/jobs/{id}/results"), &key.token),
        (format!("{base}/jobs/{id}/results"), &viewer.token),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::get(path)
                    .header("authorization", format!("Bearer {token}"))
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let metadata: Value =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        assert_eq!(
            metadata,
            json!({"video":"available","last_frame":"missing"})
        );
    }
    for token in [&denied_key.token, &other_key.token] {
        let response = app
            .clone()
            .oneshot(
                Request::delete(format!("/v1/video/jobs/{id}/results"))
                    .header("authorization", format!("Bearer {token}"))
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }
    let response = app
        .clone()
        .oneshot(
            Request::delete(format!("/v1/video/jobs/{id}/results"))
                .header("authorization", format!("Bearer {}", key.token))
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert!(
        !state
            .store
            .save_media_result_reference(scope, id, kind, &encrypted)
            .await
            .unwrap()
    );
    let response = app
        .clone()
        .oneshot(
            Request::get(format!("/v1/video/jobs/{id}/results/video"))
                .header("authorization", format!("Bearer {}", key.token))
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    assert_eq!(
        state
            .store
            .media_result_availability(scope, id)
            .await
            .unwrap()
            .unwrap(),
        json!({"video":"unavailable","last_frame":"unavailable"})
    );
    sqlx::query("UPDATE api_keys SET allowed_models=ARRAY['different-model'] WHERE id=$1")
        .bind(key.id)
        .execute(&pool)
        .await
        .unwrap();
    let response = app
        .clone()
        .oneshot(
            Request::get(format!("{base}/jobs/{id}"))
                .header("authorization", format!("Bearer {}", viewer.token))
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(
        response.status(),
        StatusCode::NOT_FOUND,
        "saved job reads honor changed grants"
    );
    state.store.revoke_key(scope, key.id).await.unwrap();
    let response = app
        .clone()
        .oneshot(
            Request::get(format!("{base}/jobs"))
                .header("authorization", format!("Bearer {}", viewer.token))
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

    assert_eq!(
        history(&app, &key.token, "").await.0,
        StatusCode::UNAUTHORIZED
    );
    let response = app
        .oneshot(
            Request::get(path)
                .header("authorization", format!("Bearer {}", key.token))
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn video_create_pins_personal_dispatch_and_never_retries_uncertainty(pool: PgPool) {
    niu_storage::MIGRATOR.run(&pool).await.unwrap();
    let captured = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let seen = captured.clone();
    let queries = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let query_seen = queries.clone();
    let upstream = Router::new().route(
        "/contents/generations/tasks",
        post(move |headers: HeaderMap, Json(body): Json<Value>| {
            let seen = seen.clone();
            async move {
                seen.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                tokio::time::sleep(std::time::Duration::from_millis(30)).await;
                assert_eq!(headers["authorization"], "Bearer private-video-token");
                assert_eq!(body["model"], "private-video-model");
                assert!(
                    !body["content"][0]["text"]
                        .as_str()
                        .unwrap()
                        .contains("secret")
                );
                if body["content"][0]["text"] != "uncertain" {
                    assert_eq!(body["content"][0]["text"], "valid [REDACTED]");
                }
                if body["content"][0]["text"] == "uncertain" {
                    Json(json!({"error":{"message":"private failure"}}))
                } else {
                    Json(json!({"id":"private-upstream-job"}))
                }
            }
        }),
    );
    let upstream=upstream.route("/contents/generations/tasks/{job}",axum::routing::get(move |headers:HeaderMap, axum::extract::Path(job):axum::extract::Path<String>| {
        let query_seen=query_seen.clone(); async move {
            query_seen.fetch_add(1,std::sync::atomic::Ordering::SeqCst);
            assert_eq!(headers["authorization"],"Bearer private-video-token");
            assert_eq!(job,"private-upstream-job");
            Json(json!({"id":job,"model":"private-video-model","status":"succeeded","usage":{"completion_tokens":200000},"content":{"video_url":"https://fixture.example/private-result.mp4"}}))
        }
    }));
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
    let mut state = test_state(None, pool.clone());
    let scope = state.store.default_workspace().await.unwrap();
    let cipher = Arc::new(
        crate::vendors::crypto::CredentialCipher::new(
            "fixture-video-encryption-key-with-entropy-123456",
        )
        .unwrap(),
    );
    let vendor_id = Uuid::new_v4();
    let vendor = state
        .store
        .create_vendor(niu_storage::VendorInput {
            id: vendor_id,
            name: "Personal video fixture".into(),
            adapter: "openai".into(),
            api_base: format!("http://{address}"),
            enabled: true,
            credential_ciphertext: cipher.seal(vendor_id, "private-video-token").unwrap(),
        })
        .await
        .unwrap();
    state.vendor_cipher = Some(cipher);
    state
        .store
        .assign_personal_vendor_owner(vendor.id, scope.organization_id, vendor.revision)
        .await
        .unwrap();
    let schema = json!({"version":1,"revision":"create-schema","model_alias":"fixture-video","upstream_model":"private-video-model","channel":"ark-direct-v1","maximum_body_bytes":1024,"maximum_content_items":1,"inputs":{"text":{"maximum_items":1,"maximum_bytes":256,"https":false,"data_mime_types":[],"roles":[],"role_required":false}},"controls":{},"required_controls":[],"exclusive_controls":[],"callbacks_qualified":false});
    state
        .store
        .upsert_vendor_model(
            vendor.id,
            niu_storage::VendorModelInput {
                alias: "fixture-video".into(),
                upstream_model: "private-video-model".into(),
                public_catalog: false,
                enabled: true,
                capabilities: json!({"video_schema":schema}),
                pricing: None,
                expected_revision: None,
            },
        )
        .await
        .unwrap();
    let key = state
        .store
        .issue_key(scope, "Video creator", &["fixture-video".into()], 3600)
        .await
        .unwrap();
    state.store.activate_workspace_guardrail(scope, 0, &json!({
        "schema_version":1,"name":"Video prompt inspection",
        "models":{"mode":"inherit"},"providers":{"mode":"inherit"},
        "input_rules":[{"pattern":"secret","action":"redact"},{"pattern":"denied","action":"block"}]
    })).await.unwrap();
    let app = router(state.clone());
    let blocked = app.clone().oneshot(
        Request::post("/v1/video/jobs")
            .header("authorization", format!("Bearer {}", key.token))
            .header("content-type", "application/json")
            .body(axum::body::Body::from(json!({"model":"fixture-video","content":[{"type":"text","text":"denied secret"}]}).to_string()))
            .unwrap()
    ).await.unwrap();
    assert_eq!(blocked.status(), StatusCode::FORBIDDEN);
    assert_eq!(captured.load(std::sync::atomic::Ordering::SeqCst), 0);
    for (prompt, expected_status) in [("valid", "unknown"), ("uncertain", "submission_unknown")] {
        let text = if prompt == "valid" {
            "valid secret"
        } else {
            prompt
        };
        let body = json!({"model":"fixture-video","content":[{"type":"text","text":text}]});
        let response = app
            .clone()
            .oneshot(
                Request::post("/v1/video/jobs")
                    .header("authorization", format!("Bearer {}", key.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::ACCEPTED);
        let value: Value =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        assert_eq!(value["status"], expected_status);
        assert!(!value.to_string().contains("private-"));
        let id = Uuid::parse_str(value["id"].as_str().unwrap()).unwrap();
        let inspection: String = sqlx::query_scalar(
            "SELECT input_outcome FROM inspected_guardrail_bindings WHERE attempt_id=$1",
        )
        .bind(id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(
            inspection,
            if prompt == "valid" {
                "redacted"
            } else {
                "allowed"
            }
        );
        let response = app
            .clone()
            .oneshot(
                Request::get(format!("/v1/video/jobs/{id}/billing"))
                    .header("authorization", format!("Bearer {}", key.token))
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let bill: Value =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        assert_eq!(bill["mode"], "owner_funded");
        assert_eq!(bill["state"], "owner_funded");
        for field in [
            "currency",
            "price",
            "charge_nanos",
            "reserved_nanos",
            "usage",
        ] {
            assert!(bill[field].is_null());
        }
        if prompt == "valid" {
            assert_eq!(
                state
                    .store
                    .enqueue_pending_personal_media_queries()
                    .await
                    .unwrap(),
                1
            );
            let (a, b) = tokio::join!(
                state.store.claim_media_query(Uuid::new_v4()),
                state.store.claim_media_query(Uuid::new_v4())
            );
            let a = a.unwrap();
            let b = b.unwrap();
            assert_eq!(
                usize::from(a.is_some()) + usize::from(b.is_some()),
                1,
                "replicas must not claim the same query"
            );
            let old = a.or(b).unwrap();
            sqlx::query("UPDATE media_query_schedule SET lease_until=now()-interval '1 second' WHERE attempt_id=$1").bind(id).execute(&pool).await.unwrap();
            let new = state
                .store
                .claim_media_query(Uuid::new_v4())
                .await
                .unwrap()
                .unwrap();
            assert!(
                state
                    .store
                    .finish_media_query(&old, false, true)
                    .await
                    .is_err(),
                "expired owner cannot stop a new lease"
            );
            state
                .store
                .finish_media_query(&new, true, false)
                .await
                .unwrap();
            assert!(
                state
                    .store
                    .claim_media_query(Uuid::new_v4())
                    .await
                    .unwrap()
                    .is_none(),
                "failed queries must back off"
            );
            sqlx::query("UPDATE media_query_schedule SET next_poll_at=now() WHERE attempt_id=$1")
                .bind(id)
                .execute(&pool)
                .await
                .unwrap();
        }
        let mut restarted = state.clone();
        restarted.store = niu_storage::Store::from_pool(pool.clone());
        assert_eq!(
            crate::video_recovery::run_once(&restarted).await.unwrap(),
            prompt == "valid"
        );
        assert!(
            !crate::video_recovery::run_once(&restarted).await.unwrap(),
            "completed and reference-less jobs cannot keep polling"
        );
        if prompt == "valid" {
            let kind = niu_storage::MediaResultKind::Video;
            let encrypted = restarted
                .store
                .media_result_reference(scope, id, kind)
                .await
                .unwrap()
                .expect("recovery persists encrypted result");
            let url = restarted
                .vendor_cipher
                .as_ref()
                .unwrap()
                .open_media_result(scope, id, kind, &encrypted)
                .unwrap();
            assert_eq!(url, "https://fixture.example/private-result.mp4");
            assert!(
                !encrypted
                    .windows(url.len())
                    .any(|bytes| bytes == url.as_bytes())
            );
        }
        for _ in 0..2 {
            let response = app
                .clone()
                .oneshot(
                    Request::post(format!("/v1/video/jobs/{id}/refresh"))
                        .header("authorization", format!("Bearer {}", key.token))
                        .body(axum::body::Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            if prompt == "uncertain" {
                assert_eq!(response.status(), StatusCode::CONFLICT);
            } else {
                assert_eq!(response.status(), StatusCode::OK);
                let refreshed: Value = serde_json::from_slice(
                    &response.into_body().collect().await.unwrap().to_bytes(),
                )
                .unwrap();
                assert_eq!(refreshed["status"], "succeeded");
                assert!(!refreshed.to_string().contains("private-"));
            }
        }
        let response = app
            .clone()
            .oneshot(
                Request::get(format!("/v1/video/jobs/{id}/timings"))
                    .header("authorization", format!("Bearer {}", key.token))
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let measured: Value =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        let spans = measured["data"].as_array().unwrap();
        assert_eq!(spans.len(), if prompt == "valid" { 4 } else { 1 });
        assert_eq!(spans[0]["phase"], "submission");
        assert!(
            spans[0]["elapsed_ms"].as_i64().unwrap() >= 20,
            "must measure actual delayed transport"
        );
        assert_eq!(
            spans[0]["outcome"],
            if prompt == "valid" {
                "received"
            } else {
                "unavailable"
            }
        );
        assert!(!measured.to_string().contains("private-"));
        assert!(
            spans
                .iter()
                .all(|span| span.as_object().unwrap().len() == 4)
        );
        assert_eq!(
            state
                .store
                .media_submission_is_unresolved(scope, id)
                .await
                .unwrap(),
            prompt == "uncertain"
        );
    }
    let evidence: Vec<Value> =
        sqlx::query_scalar("SELECT metadata FROM media_query_evidence WHERE project_id=$1")
            .bind(scope.project_id)
            .fetch_all(&pool)
            .await
            .unwrap();
    assert_eq!(
        evidence.len(),
        1,
        "identical refresh evidence must deduplicate"
    );
    assert_eq!(evidence[0]["quantity"]["value"], "200000");
    assert_eq!(evidence[0]["provider_times"]["state"], "missing");
    assert!(!evidence[0].to_string().contains("private-"));
    assert_eq!(queries.load(std::sync::atomic::Ordering::SeqCst), 3);
    assert_eq!(captured.load(std::sync::atomic::Ordering::SeqCst), 2);
    let charged: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM customer_attempt_balance_accounts WHERE project_id=$1",
    )
    .bind(scope.project_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(
        charged, 0,
        "owner-funded jobs cannot acquire customer billing"
    );
    let current = state
        .store
        .vendor_models(vendor.id)
        .await
        .unwrap()
        .remove(0);
    let mut output_schema = schema.clone();
    output_schema["revision"] = json!("output-schema-new");
    output_schema["controls"] = json!({"resolution":{"kind":"choice","values":["720p","1080p"],"default":"720p"},"ratio":{"kind":"choice","values":["16:9"],"default":"16:9"},"duration":{"kind":"integer","minimum":1,"maximum":10,"default":5},"frames_per_second":{"kind":"integer","minimum":24,"maximum":60,"default":24}});
    output_schema["output"] = json!({"specifications":[{"resolution":"720p","ratio":"16:9","width":1280,"height":720}],"estimator":"OutputSecondsV1","estimator_revision":"reviewed-seconds-fixture"});
    state
        .store
        .upsert_vendor_model(
            vendor.id,
            niu_storage::VendorModelInput {
                alias: "fixture-video".into(),
                upstream_model: "private-video-model".into(),
                public_catalog: false,
                enabled: true,
                capabilities: json!({"video_schema":output_schema}),
                pricing: None,
                expected_revision: Some(current.revision),
            },
        )
        .await
        .unwrap();
    for (extra, expected) in [
        (json!({}), StatusCode::NOT_IMPLEMENTED),
        (json!({"resolution":"1080p"}), StatusCode::BAD_REQUEST),
    ] {
        let mut body =
            json!({"model":"fixture-video","content":[{"type":"text","text":"No dispatch"}]});
        body.as_object_mut()
            .unwrap()
            .extend(extra.as_object().unwrap().clone());
        let response = app
            .clone()
            .oneshot(
                Request::post("/v1/video/jobs")
                    .header("authorization", format!("Bearer {}", key.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
    }
    assert_eq!(
        captured.load(std::sync::atomic::Ordering::SeqCst),
        2,
        "unsupported meters and unmapped output dimensions cause zero generation calls"
    );
    let response = app
        .clone()
        .oneshot(
            Request::get("/v1/video/models")
                .header("authorization", format!("Bearer {}", key.token))
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let unsupported: Value =
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(
        unsupported["data"],
        json!([]),
        "unsupported meter is not advertised"
    );
    let current = state
        .store
        .vendor_models(vendor.id)
        .await
        .unwrap()
        .remove(0);
    output_schema["revision"] = json!("personal-estimate-schema");
    output_schema["output"]["estimator"] = json!("SeedancePixelsV1");
    state
        .store
        .upsert_vendor_model(
            vendor.id,
            niu_storage::VendorModelInput {
                alias: "fixture-video".into(),
                upstream_model: "private-video-model".into(),
                public_catalog: false,
                enabled: true,
                capabilities: json!({"video_schema":output_schema}),
                pricing: None,
                expected_revision: Some(current.revision),
            },
        )
        .await
        .unwrap();
    let response = app.clone().oneshot(Request::post("/v1/video/estimate")
        .header("authorization",format!("Bearer {}",key.token)).header("content-type","application/json")
        .body(axum::body::Body::from(json!({"model":"fixture-video","content":[{"type":"text","text":"Personal estimate"}]}).to_string())).unwrap()).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let quote: Value =
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(quote["mode"], "owner_funded");
    assert_eq!(quote["estimate"]["quantity"]["numerator"], "108000");
    assert!(quote["estimate"]["amount_nanos"].is_null());
    assert!(quote["estimate"]["currency"].is_null());
    assert!(quote["maximum_charge_nanos"].is_null());
    assert!(quote["selected_at"].is_null());
    let response = app
        .clone()
        .oneshot(
            Request::get("/v1/video/models")
                .header("authorization", format!("Bearer {}", key.token))
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let personal: Value =
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(personal["data"][0]["mode"], "owner_funded");
    assert!(!personal.to_string().contains("private-video-model"));
    let denied = state
        .store
        .issue_key(scope, "No video grant", &["different-model".into()], 3600)
        .await
        .unwrap();
    let other_org = state
        .store
        .create_organization("Other Video owner")
        .await
        .unwrap();
    let other_scope = state
        .store
        .create_project(other_org, "Other Video workspace")
        .await
        .unwrap();
    let foreign = state
        .store
        .issue_key(
            other_scope,
            "Foreign Video key",
            &["fixture-video".into()],
            3600,
        )
        .await
        .unwrap();
    for token in [&denied.token, &foreign.token] {
        let response = app
            .clone()
            .oneshot(
                Request::get("/v1/video/models")
                    .header("authorization", format!("Bearer {token}"))
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let inaccessible: Value =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        assert_eq!(inaccessible["data"], json!([]));
    }
    state.store.activate_workspace_guardrail(scope, 1, &json!({"schema_version":1,"name":"Video discovery denial","models":{"mode":"deny_all"},"providers":{"mode":"inherit"}})).await.unwrap();
    let response = app
        .clone()
        .oneshot(
            Request::get("/v1/video/models")
                .header("authorization", format!("Bearer {}", key.token))
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let inaccessible: Value =
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(
        inaccessible["data"],
        json!([]),
        "Video discovery respects current workspace policy"
    );
    assert_eq!(
        captured.load(std::sync::atomic::Ordering::SeqCst),
        2,
        "capability discovery never dispatches generation"
    );

    assert_eq!(captured.load(std::sync::atomic::Ordering::SeqCst), 2);

    server.abort();
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn video_selling_configuration_requires_platform_administration(pool: PgPool) {
    niu_storage::MIGRATOR.run(&pool).await.unwrap();
    let state = test_state(None, pool.clone());
    let scope = state.store.default_workspace().await.unwrap();
    let vendor = state
        .store
        .create_vendor(niu_storage::VendorInput {
            id: Uuid::new_v4(),
            name: "Commercial video rate fixture".into(),
            adapter: "openai".into(),
            api_base: "https://fixture.example".into(),
            enabled: true,
            credential_ciphertext: vec![17; 48],
        })
        .await
        .unwrap();
    let schema = json!({"version":1,"revision":"selling-schema","model_alias":"fixture-video","upstream_model":"private-model","channel":"ark-direct-v1","maximum_body_bytes":1024,"maximum_content_items":1,"inputs":{"text":{"maximum_items":1,"maximum_bytes":256,"https":false,"data_mime_types":[],"roles":[],"role_required":false}},"controls":{},"required_controls":[],"exclusive_controls":[],"callbacks_qualified":false});
    let model = state
        .store
        .upsert_vendor_model(
            vendor.id,
            niu_storage::VendorModelInput {
                alias: "fixture-video".into(),
                upstream_model: "private-model".into(),
                public_catalog: false,
                enabled: true,
                capabilities: json!({"video_schema":schema}),
                pricing: None,
                expected_revision: None,
            },
        )
        .await
        .unwrap();
    let quantity = |n: &str| json!({"numerator":n,"denominator":"1"});
    let body = json!({"revision":"selling-1","vendor_id":vendor.id,"vendor_revision":vendor.revision,"model_revision":model.revision,"schema_revision":"selling-schema","offer_revision":"offer-1","tariff":{"revision":"tariff-1","dimensions":{"model":"fixture-video","channel":"ark-direct-v1","resolution":"720p","reference_video":false},"meter":"video_tokens","currency":"CNY","decimal_places":9,"amount_units":100,"per_quantity":quantity("1000000"),"minimum_quantity":quantity("0"),"rounding":"Up","effective_from":10,"effective_until":100},"discounts":[],"maximum_quantity":quantity("200000"),"liability_qualification_revision":"fixture-bound"});
    let key = state
        .store
        .issue_key(scope, "Customer inference", &["*".into()], 3600)
        .await
        .unwrap();
    let mut actors = vec![(key.token, StatusCode::UNAUTHORIZED)];
    for role in [
        niu_storage::OperatorRole::Owner,
        niu_storage::OperatorRole::Admin,
        niu_storage::OperatorRole::Viewer,
    ] {
        let actor = state
            .store
            .create_operator(
                niu_storage::OperatorScope {
                    organization_id: scope.organization_id,
                    project_id: None,
                },
                "Rate configuration access",
                role,
                3600,
                niu_storage::OperatorAuditActor::Installation,
            )
            .await
            .unwrap();
        actors.push((actor.token, StatusCode::FORBIDDEN));
    }
    let app = router(state.clone());
    let path = format!(
        "/admin/v1/organizations/{}/billing/media-rates",
        scope.organization_id
    );
    for (token, expected) in actors {
        let response = app
            .clone()
            .oneshot(
                Request::get(&path)
                    .header("authorization", format!("Bearer {token}"))
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected);

        for (endpoint, payload) in [
            (path.clone(), body.clone()),
            (
                format!("{path}/replace"),
                json!({"previous_revision":"selling-1","rate":body}),
            ),
            (
                format!("{path}/selling-1/retire"),
                json!({"effective_until":30}),
            ),
            (
                format!("/admin/v1/providers/{}/media-rates", Uuid::new_v4()),
                json!({"revision":"purchase-access","offer_revision":Uuid::new_v4(),"vendor_revision":vendor.revision,"model_revision":model.revision,"schema_revision":"selling-schema","tariff":body["tariff"],"discounts":[]}),
            ),
        ] {
            let response = app
                .clone()
                .oneshot(
                    Request::post(&endpoint)
                        .header("authorization", format!("Bearer {token}"))
                        .header("content-type", "application/json")
                        .body(axum::body::Body::from(payload.to_string()))
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), expected);
        }
    }
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM customer_media_rate_cards")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 0, "denied customer writes must not publish prices");
    let platform_member = state
        .store
        .create_operator(
            niu_storage::OperatorScope {
                organization_id: scope.organization_id,
                project_id: None,
            },
            "Platform pricing administrator",
            niu_storage::OperatorRole::Owner,
            3600,
            niu_storage::OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    sqlx::query("UPDATE admin_operators SET platform_admin=true WHERE id=$1")
        .bind(platform_member.operator_id)
        .execute(&pool)
        .await
        .unwrap();
    for endpoint in [
        path.clone(),
        format!(
            "/admin/v1/organizations/{}/billing/media-rate-models",
            scope.organization_id
        ),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::get(endpoint)
                    .header("authorization", format!("Bearer {}", platform_member.token))
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }
    for expected in [StatusCode::OK, StatusCode::OK] {
        let response = app
            .clone()
            .oneshot(
                Request::post(&path)
                    .header("authorization", format!("Bearer {}", platform_member.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
        let value: Value =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        assert_eq!(value, json!({"data":{"revision":"selling-1"}}));
    }
    let mut changed = body.clone();
    changed["tariff"]["amount_units"] = json!(200);
    let response = app
        .clone()
        .oneshot(
            Request::post(&path)
                .header("authorization", format!("Bearer {}", platform_member.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(changed.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::CONFLICT);
    for (cutoff, expected) in [
        (30, StatusCode::OK),
        (30, StatusCode::OK),
        (31, StatusCode::CONFLICT),
        (9, StatusCode::BAD_REQUEST),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::post(format!("{path}/selling-1/retire"))
                    .header("authorization", format!("Bearer {}", platform_member.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(
                        json!({"effective_until":cutoff}).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
        if expected == StatusCode::OK {
            let value: Value =
                serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                    .unwrap();
            assert_eq!(
                value,
                json!({"data":{"revision":"selling-1","effective_until":"30"}})
            );
        }
    }
    let mut replacement = body.clone();
    replacement["revision"] = json!("selling-2");
    replacement["tariff"]["revision"] = json!("tariff-2");
    replacement["tariff"]["effective_from"] = json!(30);
    replacement["tariff"]["amount_units"] = json!(250);
    for _ in 0..2 {
        let response = app
            .clone()
            .oneshot(
                Request::post(format!("{path}/replace"))
                    .header("authorization", format!("Bearer {}", platform_member.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(
                        json!({"previous_revision":"selling-1","rate":replacement}).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let value: Value =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        assert_eq!(
            value,
            json!({"data":{"revision":"selling-2","effective_from":"30"}})
        );
    }
    let response = app
        .clone()
        .oneshot(
            Request::get(format!("{path}?limit=1"))
                .header("authorization", format!("Bearer {}", platform_member.token))
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let page: Value =
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(page["data"][0]["card"]["revision"], "selling-1");
    assert_eq!(page["data"][0]["card"]["tariff"]["amount_units"], "100");
    assert_eq!(page["has_more"], true);
    assert_eq!(page["next_after"], "selling-1");
    sqlx::query("UPDATE admin_operators SET platform_admin=false WHERE id=$1")
        .bind(platform_member.operator_id)
        .execute(&pool)
        .await
        .unwrap();
    for method in [axum::http::Method::GET, axum::http::Method::POST] {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(method)
                    .uri(&path)
                    .header("authorization", format!("Bearer {}", platform_member.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn prepaid_video_reserves_before_egress_and_settles_reported_usage_once(pool: PgPool) {
    prepaid_video_path(pool, false).await;
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn dashboard_video_owner_uses_prepaid_admission_and_durable_settlement(pool: PgPool) {
    prepaid_video_path(pool, true).await;
}

async fn prepaid_video_path(pool: PgPool, via_dashboard: bool) {
    niu_storage::MIGRATOR.run(&pool).await.unwrap();
    let posts = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let gets = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let usage_ready = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let reported = usage_ready.clone();
    let dispatch_pool = pool.clone();
    let post_count = posts.clone();
    let get_count = gets.clone();
    let upstream=Router::new()
        .route("/contents/generations/tasks",post(move |headers:HeaderMap,Json(body):Json<Value>| {
            let count=post_count.clone(); let dispatch_pool=dispatch_pool.clone(); async move {
                let admitted:i64=sqlx::query_scalar("SELECT count(*) FROM customer_balance_reservations r JOIN attempts a ON a.id=r.attempt_id WHERE r.released_at IS NULL AND r.amount_nanos=20 AND a.execution='may_have_executed'").fetch_one(&dispatch_pool).await.unwrap();
                assert_eq!(admitted,1,"funded reservation and durable dispatch must exist before upstream generation receives the request");
                assert_eq!(headers["authorization"],"Bearer fixture-commercial-video-token");
                assert_eq!(body["model"],"private-video");
                assert_eq!(body["resolution"],"720p");
                assert!(!body["content"][0]["text"].as_str().unwrap().contains("secret"));
                count.fetch_add(1,std::sync::atomic::Ordering::SeqCst);
                if body["content"][0]["text"]=="uncertain" {Json(json!({"error":{"message":"private failure"}}))}
                else {Json(json!({"id":"private-job"}))}
            }
        }))
        .route("/contents/generations/tasks/{job}",axum::routing::get(move |headers:HeaderMap,axum::extract::Path(job):axum::extract::Path<String>| {
            let count=get_count.clone(); let reported=reported.clone(); async move {
                assert_eq!(headers["authorization"],"Bearer fixture-commercial-video-token");
                assert_eq!(job,"private-job");
                count.fetch_add(1,std::sync::atomic::Ordering::SeqCst);
                let mut result=json!({"id":job,"model":"private-video","status":"succeeded","content":{"video_url":"https://fixture.example/private-result.mp4"}});
                if reported.load(std::sync::atomic::Ordering::SeqCst) {result["usage"]=json!({"completion_tokens":100000});}
                Json(result)
            }
        }));
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
    let mut state = test_state(None, pool.clone());
    let organization = state
        .store
        .create_prepaid_organization("Video customer fixture", "CNY")
        .await
        .unwrap();
    let scope = state
        .store
        .create_project(organization, "Video workspace")
        .await
        .unwrap();
    let cipher = Arc::new(
        crate::vendors::crypto::CredentialCipher::new(
            "commercial-video-fixture-encryption-key-123456",
        )
        .unwrap(),
    );
    let vendor_id = Uuid::new_v4();
    let vendor = state
        .store
        .create_vendor(niu_storage::VendorInput {
            id: vendor_id,
            name: "Video Supplier credential".into(),
            adapter: "openai".into(),
            api_base: format!("http://{address}"),
            enabled: true,
            credential_ciphertext: cipher
                .seal(vendor_id, "fixture-commercial-video-token")
                .unwrap(),
        })
        .await
        .unwrap();
    state.vendor_cipher = Some(cipher);
    let supplier = state
        .store
        .create_provider_business("Video Supplier fixture")
        .await
        .unwrap();
    state
        .store
        .associate_vendor_supplier(vendor_id, supplier, vendor.revision)
        .await
        .unwrap();
    let mut schema = json!({"version":1,"revision":"prepaid-schema","model_alias":"fixture-video","upstream_model":"private-video","channel":"ark-direct-v1","maximum_body_bytes":1024,"maximum_content_items":1,"inputs":{"text":{"maximum_items":1,"maximum_bytes":256,"https":false,"data_mime_types":[],"roles":[],"role_required":false}},"controls":{"resolution":{"kind":"choice","values":["720p"],"default":"720p"}},"required_controls":[],"exclusive_controls":[],"callbacks_qualified":false});
    schema["controls"]["resolution"]["values"] = json!(["720p", "1080p"]);
    schema["controls"]["duration"] = json!({"kind":"integer","minimum":1,"maximum":10,"default":5});
    schema["controls"]["ratio"] = json!({"kind":"choice","values":["16:9"],"default":"16:9"});
    schema["controls"]["frames_per_second"] =
        json!({"kind":"integer","minimum":24,"maximum":60,"default":24});
    schema["output"] = json!({"specifications":[{"resolution":"720p","ratio":"16:9","width":1280,"height":720}],"estimator":"SeedancePixelsV1","estimator_revision":"qualified-fixture-formula"});

    let model = state
        .store
        .upsert_vendor_model(
            vendor_id,
            niu_storage::VendorModelInput {
                alias: "fixture-video".into(),
                upstream_model: "private-video".into(),
                enabled: true,
                public_catalog: false,
                capabilities: json!({"video_schema":schema}),
                pricing: None,
                expected_revision: None,
            },
        )
        .await
        .unwrap();
    let current_vendor = state.store.vendor(vendor_id).await.unwrap().unwrap();
    let offer_revision = state
        .store
        .publish_supplier_media_offer(
            supplier,
            &niu_storage::SupplierMediaOfferInput {
                revision: Uuid::new_v4(),
                model_alias: "fixture-video".into(),
                vendor_id,
                vendor_revision: current_vendor.revision,
                model_revision: model.revision,
                schema_revision: "prepaid-schema".into(),
                expected_revision: None,
            },
        )
        .await
        .unwrap();
    let offer: Uuid = sqlx::query_scalar(
        "SELECT id FROM provider_offers WHERE provider_id=$1 AND model_alias='fixture-video'",
    )
    .bind(supplier)
    .fetch_one(&pool)
    .await
    .unwrap();
    let expiry = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
        + 3600000;
    state
        .store
        .qualify_provider_business(
            supplier,
            &niu_storage::ProviderQualificationInput {
                supply_rights_sha256: "a".repeat(64),
                supply_capability_sha256: "b".repeat(64),
                data_handling_sha256: "c".repeat(64),
                valid_until_ms: expiry,
            },
        )
        .await
        .unwrap();
    state
        .store
        .qualify_provider_offer(
            supplier,
            offer,
            &niu_storage::ProviderOfferQualificationInput {
                rate_revision: offer_revision,
                model_identity_sha256: "d".repeat(64),
                protocol_matrix_sha256: "e".repeat(64),
                protocol_matrix_version: "video-fixture-v1".into(),
                data_handling_sha256: "f".repeat(64),
                availability_sha256: "1".repeat(64),
                agreed_rates_sha256: "2".repeat(64),
                valid_until_ms: expiry,
            },
        )
        .await
        .unwrap();
    let actor = state
        .store
        .create_operator(
            niu_storage::OperatorScope {
                organization_id: organization,
                project_id: None,
            },
            "Fixture administrator",
            niu_storage::OperatorRole::Owner,
            3600,
            niu_storage::OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    state
        .store
        .set_provider_member(supplier, actor.operator_id, "manager", true)
        .await
        .unwrap();
    state
        .store
        .set_provider_offer_active(supplier, offer, actor.operator_id, true)
        .await
        .unwrap();
    let vendor = state.store.vendor(vendor_id).await.unwrap().unwrap();
    let q = |n: &str| json!({"numerator":n,"denominator":"1"});
    let card:niu_storage::CustomerMediaRateCard=serde_json::from_value(json!({"revision":"selling-fixture","vendor_id":vendor_id,"vendor_revision":vendor.revision,"model_revision":model.revision,"schema_revision":"prepaid-schema","offer_revision":offer_revision.to_string(),"tariff":{"revision":"retail-fixture","dimensions":{"model":"fixture-video","channel":"ark-direct-v1","resolution":"720p","reference_video":false},"meter":"video_tokens","currency":"CNY","decimal_places":9,"amount_units":100,"per_quantity":q("1000000"),"minimum_quantity":q("0"),"rounding":"Up","effective_from":0,"effective_until":null},"discounts":[],"maximum_quantity":q("200000"),"liability_qualification_revision":"synthetic-maximum-fixture"})).unwrap();
    state
        .store
        .register_customer_media_rate(organization, &card)
        .await
        .unwrap();
    let mut purchase_tariff = card.tariff.clone();
    purchase_tariff.revision = "supplier-purchase-fixture".into();
    purchase_tariff.amount_units = 40;
    let purchase = niu_storage::SupplierMediaRateCard {
        revision: "purchase-fixture".into(),
        offer_revision,
        vendor_revision: vendor.revision,
        model_revision: model.revision,
        schema_revision: "prepaid-schema".into(),
        tariff: purchase_tariff,
        discounts: vec![],
    };
    let missing_purchase_key = state
        .store
        .issue_key(
            scope,
            "Unconfigured purchase check",
            &["fixture-video".into()],
            3600,
        )
        .await
        .unwrap();
    let denied = create(
        &router(state.clone()),
        "/v1/video/jobs",
        &missing_purchase_key.token,
        "valid",
    )
    .await;
    assert_eq!(
        denied.0,
        StatusCode::BAD_REQUEST,
        "unpriced Supplier media cannot dispatch"
    );
    assert_eq!(posts.load(std::sync::atomic::Ordering::SeqCst), 0);
    state
        .store
        .register_supplier_media_rate(supplier, &purchase)
        .await
        .unwrap();
    state
        .store
        .register_supplier_media_rate(supplier, &purchase)
        .await
        .unwrap();
    let mut changed_purchase = purchase.clone();
    changed_purchase.tariff.amount_units = 400;
    assert!(matches!(
        state
            .store
            .register_supplier_media_rate(supplier, &changed_purchase)
            .await,
        Err(niu_storage::StoreError::Conflict)
    ));
    let key = state
        .store
        .issue_key(scope, "Video customer key", &["fixture-video".into()], 3600)
        .await
        .unwrap();
    state.store.activate_workspace_guardrail(scope, 0, &json!({
        "schema_version":1,"name":"Customer video input rules",
        "models":{"mode":"inherit"},"providers":{"mode":"inherit"},
        "input_rules":[{"pattern":"secret","action":"redact"},{"pattern":"denied","action":"block"}]
    })).await.unwrap();
    let app = router(state.clone());
    let dashboard_base = format!(
        "/admin/v1/organizations/{}/projects/{}/keys/{}/video",
        scope.organization_id, scope.project_id, key.id
    );
    let create_path = if via_dashboard {
        format!("{dashboard_base}/jobs")
    } else {
        "/v1/video/jobs".into()
    };
    let estimate_path = if via_dashboard {
        format!("{dashboard_base}/estimate")
    } else {
        "/v1/video/estimate".into()
    };
    let inference_token = if via_dashboard {
        actor.token.as_str()
    } else {
        key.token.as_str()
    };
    let before_block: (i64, i64) = sqlx::query_as("SELECT (SELECT count(*) FROM customer_balance_reservations WHERE organization_id=$1),(SELECT count(*) FROM customer_balance_entries WHERE organization_id=$1)")
        .bind(organization).fetch_one(&pool).await.unwrap();
    let blocked = create(&app, &create_path, inference_token, "denied secret").await;
    assert_eq!(blocked.0, StatusCode::FORBIDDEN);
    assert_eq!(posts.load(std::sync::atomic::Ordering::SeqCst), 0);
    let after_block: (i64, i64) = sqlx::query_as("SELECT (SELECT count(*) FROM customer_balance_reservations WHERE organization_id=$1),(SELECT count(*) FROM customer_balance_entries WHERE organization_id=$1)")
        .bind(organization).fetch_one(&pool).await.unwrap();
    assert_eq!(
        after_block, before_block,
        "blocked video must not reserve or change customer funds"
    );

    let model_choices_path = format!("/admin/v1/providers/{supplier}/media-rate-models?limit=1");
    for (token, expected) in [
        (actor.token.as_str(), StatusCode::FORBIDDEN),
        (key.token.as_str(), StatusCode::UNAUTHORIZED),
        ("niu-test-admin-token-that-is-long-1234", StatusCode::OK),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::get(&model_choices_path)
                    .header("authorization", format!("Bearer {token}"))
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
        if expected == StatusCode::OK {
            let value: Value =
                serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                    .unwrap();
            assert_eq!(value["data"].as_array().unwrap().len(), 1);
            assert_eq!(value["data"][0]["model_alias"], "fixture-video");
            assert_eq!(
                value["data"][0]["api_key_name"],
                "Video Supplier credential"
            );
            assert_eq!(
                value["data"][0]["offer_revision"],
                offer_revision.to_string()
            );
            assert_eq!(
                value["data"][0]["vendor_revision"],
                vendor.revision.to_string()
            );
            assert_eq!(
                value["data"][0]["model_revision"],
                model.revision.to_string()
            );
            assert_eq!(value["data"][0]["resolutions"], json!(["720p"]));
            assert_eq!(value["data"][0]["reference_video"], false);
            assert_eq!(value["has_more"], false);
            assert!(value["next_after"].is_null());
            let serialized = value.to_string();
            for private in [
                "fixture-commercial-video-token",
                "api_base",
                "private-video",
                "amount_units",
                "prompt_rate",
            ] {
                assert!(!serialized.contains(private));
            }
        }
    }
    let customer_choices_path = format!(
        "/admin/v1/organizations/{}/billing/media-rate-models?limit=1",
        scope.organization_id
    );
    for (token, expected) in [
        (actor.token.as_str(), StatusCode::FORBIDDEN),
        (key.token.as_str(), StatusCode::UNAUTHORIZED),
        ("niu-test-admin-token-that-is-long-1234", StatusCode::OK),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::get(&customer_choices_path)
                    .header("authorization", format!("Bearer {token}"))
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
        if expected == StatusCode::OK {
            let value: Value =
                serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                    .unwrap();
            assert_eq!(value["data"].as_array().unwrap().len(), 1);
            assert_eq!(value["data"][0]["model_alias"], "fixture-video");
            assert_eq!(value["data"][0]["vendor_id"], vendor_id.to_string());
            assert_eq!(
                value["data"][0]["api_key_name"],
                "Video Supplier credential"
            );
            assert_eq!(
                value["data"][0]["offer_revision"],
                offer_revision.to_string()
            );
            assert_eq!(
                value["data"][0]["vendor_revision"],
                vendor.revision.to_string()
            );
            assert_eq!(
                value["data"][0]["model_revision"],
                model.revision.to_string()
            );
            assert_eq!(value["data"][0]["resolutions"], json!(["720p"]));
            assert_eq!(value["data"][0]["reference_video"], false);
            assert_eq!(value["has_more"], false);
            assert!(value["next_after"].is_null());
            let serialized = value.to_string();
            for private in [
                "fixture-commercial-video-token",
                "api_base",
                "private-video",
                "amount_units",
                "prompt_rate",
            ] {
                assert!(!serialized.contains(private));
            }
        }
    }
    assert!(
        state
            .store
            .customer_media_rate_models(Some("fixture-video"), 1)
            .await
            .unwrap()["data"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    assert!(
        state
            .store
            .customer_media_rate_models(None, 101)
            .await
            .is_err()
    );
    let later = state
        .store
        .supplier_media_rate_models(supplier, Some("fixture-video"), 1)
        .await
        .unwrap();
    assert_eq!(later["data"], json!([]));
    assert!(
        state
            .store
            .supplier_media_rate_models(supplier, None, 101)
            .await
            .is_err()
    );
    async fn create(app: &Router, path: &str, key: &str, prompt: &str) -> (StatusCode, Value) {
        let response = app
            .clone()
            .oneshot(
                Request::post(path)
                    .header("authorization", format!("Bearer {key}"))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(
                        json!({"model":"fixture-video","content":[{"type":"text","text":prompt}]})
                            .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        let status = response.status();
        let body =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        (status, body)
    }
    assert_eq!(
        create(&app, &create_path, inference_token, "valid").await.0,
        StatusCode::PAYMENT_REQUIRED
    );
    assert_eq!(posts.load(std::sync::atomic::Ordering::SeqCst), 0);
    state
        .store
        .record_settled_customer_funding(
            organization,
            "CNY",
            40,
            "synthetic-bank",
            "video-fixture-funding",
        )
        .await
        .unwrap();
    for (path, body) in [
        (
            "/v1/chat/completions",
            json!({"model":"fixture-video","messages":[{"role":"user","content":"text"}]}),
        ),
        (
            "/v1/embeddings",
            json!({"model":"fixture-video","input":"text"}),
        ),
        (
            "/v1/responses",
            json!({"model":"fixture-video","input":"text"}),
        ),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::post(path)
                    .header("authorization", format!("Bearer {}", key.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_IMPLEMENTED);
        let rejection: Value =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        assert_eq!(rejection["error"]["type"], "unsupported_operation_error");
        assert_eq!(posts.load(std::sync::atomic::Ordering::SeqCst), 0);
    }
    let charged: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM customer_balance_entries WHERE organization_id=$1 AND kind='charge'",
    )
    .bind(organization)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(charged, 0);
    let models_path = if via_dashboard {
        format!("{dashboard_base}/models")
    } else {
        "/v1/video/models".into()
    };
    let response = app
        .clone()
        .oneshot(
            Request::get(&models_path)
                .header("authorization", format!("Bearer {inference_token}"))
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let catalog: Value =
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(catalog["data"].as_array().unwrap().len(), 1);
    assert_eq!(catalog["data"][0]["id"], "fixture-video");
    assert_eq!(catalog["data"][0]["mode"], "customer");
    assert_eq!(catalog["data"][0]["input_types"], json!(["text"]));
    assert_eq!(
        catalog["data"][0]["controls"]["resolution"]["values"],
        json!(["720p"])
    );
    assert_eq!(
        catalog["data"][0]["output"]["specifications"][0]["width"],
        1280
    );
    for private in [
        "vendor_id",
        "revision",
        "private-video",
        "amount_units",
        "api_base",
        "credential",
    ] {
        assert!(!catalog.to_string().contains(private));
    }
    let before_estimate: (i64, i64) = sqlx::query_as("SELECT (SELECT count(*) FROM attempts WHERE organization_id=$1),(SELECT count(*) FROM customer_balance_reservations WHERE organization_id=$1)")
        .bind(organization).fetch_one(&pool).await.unwrap();
    let estimate_body =
        json!({"model":"fixture-video","content":[{"type":"text","text":"Estimate only"}]});
    let response = app
        .clone()
        .oneshot(
            Request::post(&estimate_path)
                .header("authorization", format!("Bearer {inference_token}"))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(estimate_body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let quote: Value =
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(quote["estimate"]["quantity"]["numerator"], "108000");
    assert_eq!(quote["estimate"]["amount_nanos"], "11");
    assert_eq!(quote["estimate"]["provenance"], "Estimate");
    assert_eq!(quote["maximum_charge_nanos"], "20");
    assert_eq!(quote["mode"], "customer");
    assert!(!quote.to_string().contains("vendor_id"));
    assert!(!quote.to_string().contains("private-"));
    if via_dashboard {
        let viewer = state
            .store
            .create_operator(
                niu_storage::OperatorScope {
                    organization_id: organization,
                    project_id: Some(scope.project_id),
                },
                "Estimate reader",
                niu_storage::OperatorRole::Viewer,
                3600,
                niu_storage::OperatorAuditActor::Installation,
            )
            .await
            .unwrap();
        let response = app
            .clone()
            .oneshot(
                Request::post(&estimate_path)
                    .header("authorization", format!("Bearer {}", viewer.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(estimate_body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let read_quote: Value =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        assert_eq!(read_quote["estimate"], quote["estimate"]);
        assert_eq!(
            read_quote["maximum_charge_nanos"],
            quote["maximum_charge_nanos"]
        );
    }

    for (token, change, expected) in [
        ("invalid-key", json!({}), StatusCode::UNAUTHORIZED),
        (
            key.token.as_str(),
            json!({"duration":0}),
            StatusCode::BAD_REQUEST,
        ),
        (
            key.token.as_str(),
            json!({"resolution":"1080p"}),
            StatusCode::BAD_REQUEST,
        ),
        (
            key.token.as_str(),
            json!({"model":"not-granted"}),
            StatusCode::NOT_FOUND,
        ),
        (
            key.token.as_str(),
            json!({"callback_url":"https://fixture.example/callback"}),
            StatusCode::NOT_IMPLEMENTED,
        ),
    ] {
        let mut invalid = estimate_body.clone();
        invalid
            .as_object_mut()
            .unwrap()
            .extend(change.as_object().unwrap().clone());
        let response = app
            .clone()
            .oneshot(
                Request::post("/v1/video/estimate")
                    .header("authorization", format!("Bearer {token}"))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(invalid.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
    }
    let after_estimate: (i64, i64) = sqlx::query_as("SELECT (SELECT count(*) FROM attempts WHERE organization_id=$1),(SELECT count(*) FROM customer_balance_reservations WHERE organization_id=$1)")
        .bind(organization).fetch_one(&pool).await.unwrap();
    assert_eq!(after_estimate, before_estimate);
    assert_eq!(posts.load(std::sync::atomic::Ordering::SeqCst), 0);
    state
        .store
        .set_customer_workspace_spending_limit(scope, "CNY", 19, 0)
        .await
        .unwrap();
    let limit_denied = create(&app, &create_path, inference_token, "valid").await;
    assert_eq!(limit_denied.0, StatusCode::PAYMENT_REQUIRED);
    assert_eq!(
        limit_denied.1["error"]["type"],
        "workspace_spending_limit_exceeded"
    );
    assert_eq!(posts.load(std::sync::atomic::Ordering::SeqCst), 0);
    let held: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM customer_balance_reservations WHERE organization_id=$1",
    )
    .bind(organization)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(held, 0);
    state
        .store
        .set_customer_workspace_spending_limit(scope, "CNY", 30, 1)
        .await
        .unwrap();
    let (status, job) = create(&app, &create_path, inference_token, "valid secret").await;
    assert_eq!(status, StatusCode::ACCEPTED, "{job}");
    assert_eq!(job["status"], "unknown");
    let id = Uuid::parse_str(job["id"].as_str().unwrap()).unwrap();
    let output_snapshot = state
        .store
        .media_output_snapshot(scope, id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(output_snapshot["output"]["specification"]["width"], 1280);
    assert_eq!(output_snapshot["estimated_usage"]["provenance"], "Estimate");
    assert_eq!(output_snapshot["estimated_usage"]["meter"], "video_tokens");
    assert!(!output_snapshot.to_string().contains("content"));

    let hold:i64=sqlx::query_scalar("SELECT amount_nanos FROM customer_balance_reservations WHERE attempt_id=$1 AND released_at IS NULL").bind(id).fetch_one(&pool).await.unwrap();
    assert_eq!(hold, 20);
    let cutoff = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    let mut replacement_purchase = purchase.clone();
    replacement_purchase.revision = "purchase-replacement".into();
    replacement_purchase.tariff.revision = "replacement-purchase-tariff".into();
    replacement_purchase.tariff.amount_units = 80;
    replacement_purchase.tariff.effective_from = cutoff;
    state
        .store
        .register_supplier_media_rate(supplier, &replacement_purchase)
        .await
        .unwrap();
    async fn unsubmitted_supplier_attempt(
        state: &AppState,
        scope: niu_storage::TenantScope,
        endpoint: &str,
    ) -> Uuid {
        let operation = state
            .store
            .create_operation(scope, "fixture-video")
            .await
            .unwrap();
        let attempt = state
            .store
            .prepare_attempt(
                scope,
                operation,
                "fixture-video",
                "supplier-lifecycle-check",
            )
            .await
            .unwrap();
        state
            .store
            .bind_provider_offer(
                scope,
                attempt,
                "fixture-video",
                "private-video",
                Some(endpoint),
            )
            .await
            .unwrap();
        attempt
    }
    let boundary = unsubmitted_supplier_attempt(&state, scope, &vendor.api_base).await;
    assert!(
        matches!(
            state
                .store
                .bind_supplier_media_rate(
                    scope,
                    boundary,
                    &card.tariff.dimensions,
                    "video_tokens",
                    cutoff
                )
                .await,
            Err(niu_storage::StoreError::InvalidPrice)
        ),
        "overlapping purchase rates fail closed"
    );
    let retire_path = format!("/admin/v1/providers/{supplier}/media-rates/purchase-fixture/retire");
    for (token, expected, time) in [
        (actor.token.as_str(), StatusCode::FORBIDDEN, cutoff),
        (key.token.as_str(), StatusCode::UNAUTHORIZED, cutoff),
        (
            "niu-test-admin-token-that-is-long-1234",
            StatusCode::OK,
            cutoff,
        ),
        (
            "niu-test-admin-token-that-is-long-1234",
            StatusCode::OK,
            cutoff,
        ),
        (
            "niu-test-admin-token-that-is-long-1234",
            StatusCode::CONFLICT,
            cutoff + 1,
        ),
        (
            "niu-test-admin-token-that-is-long-1234",
            StatusCode::BAD_REQUEST,
            -1,
        ),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::post(&retire_path)
                    .header("authorization", format!("Bearer {token}"))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(
                        json!({"effective_until":time}).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
    }
    let before = unsubmitted_supplier_attempt(&state, scope, &vendor.api_base).await;
    state
        .store
        .bind_supplier_media_rate(
            scope,
            before,
            &card.tariff.dimensions,
            "video_tokens",
            cutoff - 1,
        )
        .await
        .unwrap();
    state
        .store
        .bind_supplier_media_rate(
            scope,
            boundary,
            &card.tariff.dimensions,
            "video_tokens",
            cutoff,
        )
        .await
        .unwrap();
    for (attempt, expected) in [(id, "40"), (before, "40"), (boundary, "80")] {
        let price:String=sqlx::query_scalar("SELECT snapshot->'tariff'->>'amount_units' FROM supplier_media_attempt_pricing WHERE attempt_id=$1").bind(attempt).fetch_one(&pool).await.unwrap();
        assert_eq!(price, expected);
    }
    let page = state
        .store
        .supplier_media_rates(supplier, None, 1)
        .await
        .unwrap();
    assert_eq!(page["data"].as_array().unwrap().len(), 1);
    assert_eq!(page["has_more"], true);
    assert_eq!(page["next_after"], "purchase-fixture");
    assert_eq!(page["data"][0]["card"]["tariff"]["amount_units"], "40");
    assert_eq!(
        page["data"][0]["retirement_effective_until"],
        cutoff.to_string()
    );
    assert!(page["data"][0]["created_at"].is_string());
    let page = state
        .store
        .supplier_media_rates(supplier, Some("purchase-fixture"), 1)
        .await
        .unwrap();
    assert_eq!(page["data"][0]["card"]["revision"], "purchase-replacement");
    assert_eq!(page["has_more"], false);
    assert!(page["next_after"].is_null());
    for token in [
        actor.token.as_str(),
        "niu-test-admin-token-that-is-long-1234",
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::get(format!(
                    "/admin/v1/providers/{supplier}/media-rates?limit=1"
                ))
                .header("authorization", format!("Bearer {token}"))
                .body(axum::body::Body::empty())
                .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }
    for sql in [
        "UPDATE supplier_media_rate_retirements SET effective_until=1 WHERE provider_id=$1",
        "DELETE FROM supplier_media_rate_retirements WHERE provider_id=$1",
    ] {
        assert!(
            sqlx::query(sql)
                .bind(supplier)
                .execute(&pool)
                .await
                .is_err()
        );
    }
    let audits:i64=sqlx::query_scalar("SELECT count(*) FROM provider_audit_events WHERE provider_id=$1 AND action='media_rate_retired'").bind(supplier).fetch_one(&pool).await.unwrap();
    assert_eq!(audits, 1);
    let mut bounded_purchase = purchase.clone();
    bounded_purchase.revision = "bounded-purchase-check".into();
    bounded_purchase.tariff.revision = "bounded-purchase-tariff".into();
    bounded_purchase.tariff.effective_until = Some(10);
    state
        .store
        .register_supplier_media_rate(supplier, &bounded_purchase)
        .await
        .unwrap();
    for invalid in [-1, 11] {
        assert!(matches!(
            state
                .store
                .retire_supplier_media_rate(supplier, &bounded_purchase.revision, invalid)
                .await,
            Err(niu_storage::StoreError::InvalidPrice)
        ));
        assert!(sqlx::query("INSERT INTO supplier_media_rate_retirements(provider_id,revision,effective_until) VALUES($1,$2,$3)").bind(supplier).bind(&bounded_purchase.revision).bind(invalid).execute(&pool).await.is_err());
    }
    let (first, second) = tokio::join!(
        state
            .store
            .retire_supplier_media_rate(supplier, &bounded_purchase.revision, 2),
        state
            .store
            .retire_supplier_media_rate(supplier, &bounded_purchase.revision, 3)
    );
    assert!(first.is_ok() ^ second.is_ok());
    assert!(
        matches!(first, Err(niu_storage::StoreError::Conflict))
            || matches!(second, Err(niu_storage::StoreError::Conflict))
    );
    let outsider = state
        .store
        .create_operator(
            niu_storage::OperatorScope {
                organization_id: organization,
                project_id: None,
            },
            "Company-only reader",
            niu_storage::OperatorRole::Owner,
            3600,
            niu_storage::OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    for (token, expected) in [
        (outsider.token.as_str(), StatusCode::NOT_FOUND),
        (key.token.as_str(), StatusCode::UNAUTHORIZED),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::get(format!("/admin/v1/providers/{supplier}/media-rates"))
                    .header("authorization", format!("Bearer {token}"))
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
    }

    for sql in [
        "UPDATE supplier_media_attempt_pricing SET snapshot='{}'::jsonb WHERE attempt_id=$1",
        "DELETE FROM supplier_media_attempt_pricing WHERE attempt_id=$1",
    ] {
        assert!(sqlx::query(sql).bind(id).execute(&pool).await.is_err());
    }
    assert!(sqlx::query("INSERT INTO provider_earnings(attempt_id,provider_id,revision_id,currency,amount_nanos,prompt_tokens,completion_tokens) VALUES($1,$2,$3,'CNY',0,0,0)")
        .bind(id).bind(supplier).bind(offer_revision).execute(&pool).await.is_err(),"media cannot acquire a text earning");

    async fn billing(app: &axum::Router, token: &str, id: Uuid) -> Value {
        let response = app
            .clone()
            .oneshot(
                Request::get(format!("/v1/video/jobs/{id}/billing"))
                    .header("authorization", format!("Bearer {token}"))
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap()
    }
    let bill = billing(&app, &key.token, id).await;
    if via_dashboard {
        let response = app
            .clone()
            .oneshot(
                Request::get(format!("{dashboard_base}/jobs/{id}/billing"))
                    .header("authorization", format!("Bearer {}", actor.token))
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let dashboard_bill: Value =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        assert_eq!(
            dashboard_bill, bill,
            "dashboard preserves the customer accounting projection"
        );
    }
    assert_eq!(bill["state"], "reserved");
    assert_eq!(bill["reserved_nanos"], "20");
    assert!(bill["charge_nanos"].is_null());
    assert!(bill["usage"].is_null());
    assert_eq!(bill["price"]["amount_units"], "100");
    assert_eq!(bill["effective_output"]["specification"]["width"], 1280);
    assert_eq!(bill["estimate"]["quantity"]["numerator"], "108000");
    assert_eq!(bill["estimate"]["provenance"], "Estimate");
    assert_eq!(bill["estimate"]["currency"], "CNY");
    assert_eq!(bill["estimate"]["amount_nanos"], "11");
    let original_estimate = bill["estimate"].clone();
    let original_output = bill["effective_output"].clone();
    for private in [
        id.to_string(),
        organization.to_string(),
        "private-".into(),
        "vendor_id".into(),
        "offer_revision".into(),
        "snapshot_revision".into(),
    ] {
        assert!(!bill.to_string().contains(&private));
    }
    assert!(crate::video_recovery::run_once(&state).await.unwrap());
    assert!(
        !state
            .store
            .media_query_recovery_complete(scope, id)
            .await
            .unwrap(),
        "generation success without reported usage is not settled completion"
    );
    let scheduling: (bool, i32) =
        sqlx::query_as("SELECT stopped,failures FROM media_query_schedule WHERE attempt_id=$1")
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(scheduling, (false, 1));
    let pending_hold:i64=sqlx::query_scalar("SELECT amount_nanos FROM customer_balance_reservations WHERE attempt_id=$1 AND released_at IS NULL").bind(id).fetch_one(&pool).await.unwrap();
    assert_eq!(pending_hold, 20);
    let bill = billing(&app, &key.token, id).await;
    assert_eq!(bill["state"], "awaiting_usage");
    assert_eq!(bill["reserved_nanos"], "20");
    assert!(bill["charge_nanos"].is_null());
    // Reconstruct lost operational scheduling after success was persisted but
    // billing was not. Immutable job/query/price/hold evidence remains intact.
    sqlx::query("DELETE FROM media_query_schedule WHERE attempt_id=$1")
        .bind(id)
        .execute(&pool)
        .await
        .unwrap();
    let mut restarted = state.clone();
    restarted.store = niu_storage::Store::from_pool(pool.clone());
    sqlx::query("CREATE FUNCTION fixture_video_debit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic ledger failure'; END $$").execute(&pool).await.unwrap();
    sqlx::query("CREATE TRIGGER fixture_video_debit_failure BEFORE INSERT ON customer_balance_entries FOR EACH ROW WHEN (NEW.kind='charge') EXECUTE FUNCTION fixture_video_debit_failure()").execute(&pool).await.unwrap();
    usage_ready.store(true, std::sync::atomic::Ordering::SeqCst);
    assert!(crate::video_recovery::run_once(&restarted).await.unwrap());
    assert!(
        !restarted
            .store
            .media_query_recovery_complete(scope, id)
            .await
            .unwrap(),
        "a failed ledger write cannot finish billing recovery"
    );
    let charge_count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM customer_balance_entries WHERE organization_id=$1 AND kind='charge'",
    )
    .bind(organization)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(charge_count, 0);
    let earning:(i64,Option<i64>,Option<i64>,String)=sqlx::query_as("SELECT amount_nanos,prompt_tokens,completion_tokens,billing_meter FROM provider_earnings WHERE attempt_id=$1")
        .bind(id).fetch_one(&pool).await.unwrap();
    assert_eq!(
        earning,
        (4, None, None, "video_tokens".into()),
        "Supplier obligation is independent of an unposted customer charge"
    );
    let dashboard = state.store.provider_dashboard(supplier, 30).await.unwrap();
    assert!(dashboard["consumption"].as_array().unwrap().is_empty());
    assert_eq!(dashboard["media_consumption"][0]["quantity"], "100000");
    assert_eq!(dashboard["media_consumption"][0]["amount_nanos"], "4");

    let bill = billing(&app, &key.token, id).await;
    assert_eq!(bill["state"], "awaiting_settlement");
    assert_eq!(bill["usage"]["quantity"]["numerator"], "100000");
    assert!(bill["charge_nanos"].is_null());
    assert_eq!(gets.load(std::sync::atomic::Ordering::SeqCst), 2);
    sqlx::query("DROP TRIGGER fixture_video_debit_failure ON customer_balance_entries")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("DROP FUNCTION fixture_video_debit_failure()")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("UPDATE media_query_schedule SET next_poll_at=now() WHERE attempt_id=$1")
        .bind(id)
        .execute(&pool)
        .await
        .unwrap();
    usage_ready.store(false, std::sync::atomic::Ordering::SeqCst);
    state.store.revoke_key(scope, key.id).await.unwrap();
    restarted.store = niu_storage::Store::from_pool(pool.clone());
    assert!(crate::video_recovery::run_once(&restarted).await.unwrap());
    assert_eq!(
        gets.load(std::sync::atomic::Ordering::SeqCst),
        2,
        "stored reported usage must reconcile without a new upstream query"
    );
    let denied = app
        .clone()
        .oneshot(
            Request::get(format!("/v1/video/jobs/{id}"))
                .header("authorization", format!("Bearer {}", key.token))
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(denied.status(), StatusCode::UNAUTHORIZED);
    let key = state
        .store
        .issue_key(
            scope,
            "Replacement video key",
            &["fixture-video".into()],
            3600,
        )
        .await
        .unwrap();
    let create_path = if via_dashboard {
        format!(
            "/admin/v1/organizations/{}/projects/{}/keys/{}/video/jobs",
            scope.organization_id, scope.project_id, key.id
        )
    } else {
        "/v1/video/jobs".into()
    };
    let inference_token = if via_dashboard {
        actor.token.as_str()
    } else {
        key.token.as_str()
    };
    usage_ready.store(true, std::sync::atomic::Ordering::SeqCst);
    assert!(
        restarted
            .store
            .media_query_recovery_complete(scope, id)
            .await
            .unwrap()
    );
    assert!(!crate::video_recovery::run_once(&restarted).await.unwrap());
    assert_eq!(
        posts.load(std::sync::atomic::Ordering::SeqCst),
        1,
        "recovery cannot repeat generation"
    );
    for _ in 0..2 {
        let response = app
            .clone()
            .oneshot(
                Request::post(format!("/v1/video/jobs/{id}/refresh"))
                    .header("authorization", format!("Bearer {}", key.token))
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let result: Value =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        assert_eq!(result["status"], "succeeded");
        assert_eq!(result.as_object().unwrap().len(), 4);
        assert!(!result.to_string().contains("private-"));
    }
    let charges:Vec<i64>=sqlx::query_scalar("SELECT amount_nanos FROM customer_balance_entries WHERE organization_id=$1 AND kind='charge'").bind(organization).fetch_all(&pool).await.unwrap();
    assert_eq!(charges, vec![-10]);
    let earnings: Vec<i64> =
        sqlx::query_scalar("SELECT amount_nanos FROM provider_earnings WHERE provider_id=$1")
            .bind(supplier)
            .fetch_all(&pool)
            .await
            .unwrap();
    assert_eq!(
        earnings,
        vec![4],
        "duplicate video observations cannot accrue twice"
    );
    let settlement_key = Uuid::new_v4();
    let settlement = state
        .store
        .record_provider_settlement(supplier, settlement_key, "synthetic-video-payment", &[id])
        .await
        .unwrap();
    assert_eq!(
        state
            .store
            .record_provider_settlement(supplier, settlement_key, "synthetic-video-payment", &[id])
            .await
            .unwrap(),
        settlement
    );
    let dashboard = state.store.provider_dashboard(supplier, 30).await.unwrap();
    assert_eq!(dashboard["balances"][0]["paid_nanos"], "4");
    assert_eq!(dashboard["balances"][0]["unpaid_nanos"], "0");
    let foreign_supplier = state
        .store
        .create_provider_business("Other video Supplier")
        .await
        .unwrap();
    let denied = app
        .clone()
        .oneshot(
            Request::get(format!(
                "/admin/v1/providers/{foreign_supplier}/media-rates"
            ))
            .header("authorization", format!("Bearer {}", actor.token))
            .body(axum::body::Body::empty())
            .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(denied.status(), StatusCode::NOT_FOUND);
    assert!(matches!(
        state
            .store
            .retire_supplier_media_rate(foreign_supplier, &purchase.revision, cutoff)
            .await,
        Err(niu_storage::StoreError::Conflict)
    ));

    assert!(
        matches!(
            state
                .store
                .register_supplier_media_rate(foreign_supplier, &purchase)
                .await,
            Err(niu_storage::StoreError::Conflict)
        ),
        "one Supplier cannot acquire another Supplier's purchase card"
    );

    assert!(
        state
            .store
            .provider_dashboard(foreign_supplier, 30)
            .await
            .unwrap()["media_consumption"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    assert!(
        state
            .store
            .record_provider_settlement(foreign_supplier, Uuid::new_v4(), "wrong-supplier", &[id])
            .await
            .is_err()
    );

    let bill = billing(&app, &key.token, id).await;
    assert_eq!(bill["state"], "settled");
    assert_eq!(bill["reserved_nanos"], "0");
    assert_eq!(bill["charge_nanos"], "10");
    assert_eq!(bill["settled_usage"]["quantity"]["numerator"], "100000");
    assert_eq!(
        bill["settled_usage"]["billable_quantity"]["numerator"],
        "100000"
    );
    assert_eq!(bill["settled_usage"]["provenance"], "Reported");
    assert_eq!(bill["estimate"], original_estimate);
    assert_eq!(bill["effective_output"], original_output);
    assert_ne!(bill["estimate"]["amount_nanos"], bill["charge_nanos"]);
    let (status, uncertain) = create(&app, &create_path, inference_token, "uncertain").await;
    assert_eq!(status, StatusCode::ACCEPTED);
    assert_eq!(uncertain["status"], "submission_unknown");
    assert_eq!(
        create(&app, &create_path, inference_token, "insufficient")
            .await
            .0,
        StatusCode::PAYMENT_REQUIRED
    );
    assert_eq!(posts.load(std::sync::atomic::Ordering::SeqCst), 2);
    assert_eq!(gets.load(std::sync::atomic::Ordering::SeqCst), 4);
    let pending:i64=sqlx::query_scalar("SELECT sum(amount_nanos)::bigint FROM customer_balance_reservations WHERE organization_id=$1 AND released_at IS NULL").bind(organization).fetch_one(&pool).await.unwrap();
    assert_eq!(
        pending, 20,
        "uncertain generation must retain its original liability"
    );
    let balance: i64 = sqlx::query_scalar(
        "SELECT sum(amount_nanos)::bigint FROM customer_balance_entries WHERE organization_id=$1",
    )
    .bind(organization)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(balance, 30);
    let mut transition_original = purchase.clone();
    transition_original.revision = "transition-original".into();
    transition_original.tariff.revision = "transition-original-price".into();
    transition_original.tariff.effective_from = 200;
    transition_original.tariff.effective_until = Some(220);
    state
        .store
        .register_supplier_media_rate(supplier, &transition_original)
        .await
        .unwrap();
    let mut transition_next = transition_original.clone();
    transition_next.revision = "transition-next".into();
    transition_next.tariff.revision = "transition-next-price".into();
    transition_next.tariff.effective_from = 210;
    transition_next.tariff.amount_units = 70;
    let transition_path = format!("/admin/v1/providers/{supplier}/media-rates/replace");
    for (token, expected) in [
        (actor.token.as_str(), StatusCode::FORBIDDEN),
        (key.token.as_str(), StatusCode::UNAUTHORIZED),
        ("niu-test-admin-token-that-is-long-1234", StatusCode::OK),
        ("niu-test-admin-token-that-is-long-1234", StatusCode::OK),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::post(&transition_path)
                    .header("authorization", format!("Bearer {token}"))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(
                        json!({"previous_revision":"transition-original","rate":transition_next})
                            .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
    }
    let ended: i64 = sqlx::query_scalar("SELECT effective_until FROM supplier_media_rate_retirements WHERE provider_id=$1 AND revision='transition-original'")
        .bind(supplier).fetch_one(&pool).await.unwrap();
    assert_eq!(ended, 210);
    let mut conflicting_transition = transition_next.clone();
    conflicting_transition.revision = "transition-must-rollback".into();
    conflicting_transition.tariff.effective_from = 211;
    assert!(matches!(
        state
            .store
            .replace_supplier_media_rate(supplier, "transition-original", &conflicting_transition)
            .await,
        Err(niu_storage::StoreError::Conflict)
    ));
    let dangling: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM supplier_media_rate_cards WHERE provider_id=$1 AND revision='transition-must-rollback'")
        .bind(supplier).fetch_one(&pool).await.unwrap();
    assert_eq!(
        dangling, 0,
        "failed retirement rolls back the new rate as well"
    );
    conflicting_transition.tariff.dimensions.reference_video = true;
    assert!(matches!(
        state
            .store
            .replace_supplier_media_rate(supplier, "transition-original", &conflicting_transition)
            .await,
        Err(niu_storage::StoreError::InvalidPrice)
    ));
    assert!(matches!(
        state
            .store
            .replace_supplier_media_rate(foreign_supplier, "transition-original", &transition_next)
            .await,
        Err(niu_storage::StoreError::Conflict)
    ));
    let unchanged: Value = sqlx::query_scalar("SELECT document FROM supplier_media_rate_cards WHERE provider_id=$1 AND revision='transition-original'")
        .bind(supplier).fetch_one(&pool).await.unwrap();
    assert_eq!(
        unchanged,
        serde_json::to_value(&transition_original).unwrap()
    );
    let historical_earning: i64 =
        sqlx::query_scalar("SELECT amount_nanos FROM provider_earnings WHERE attempt_id=$1")
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        historical_earning, 4,
        "replacement cannot reprice an existing earning"
    );
    let foreign_choices = state
        .store
        .supplier_media_rate_models(foreign_supplier, None, 50)
        .await
        .unwrap();
    assert_eq!(foreign_choices["data"], json!([]));
    state.store.create_budget(scope, "CNY", 1000).await.unwrap();
    let before_budget: (i64, i64, i64) = sqlx::query_as("SELECT (SELECT count(*) FROM attempts WHERE organization_id=$1),(SELECT count(*) FROM customer_balance_reservations WHERE organization_id=$1),(SELECT count(*) FROM customer_balance_entries WHERE organization_id=$1)")
        .bind(organization).fetch_one(&pool).await.unwrap();
    let calls_before_budget = posts.load(std::sync::atomic::Ordering::SeqCst);
    let budget_denial = create(&app, &create_path, inference_token, "valid").await;
    assert_eq!(budget_denial.0, StatusCode::NOT_IMPLEMENTED);
    assert!(budget_denial.1.to_string().contains("workspace budget"));
    let after_budget: (i64, i64, i64) = sqlx::query_as("SELECT (SELECT count(*) FROM attempts WHERE organization_id=$1),(SELECT count(*) FROM customer_balance_reservations WHERE organization_id=$1),(SELECT count(*) FROM customer_balance_entries WHERE organization_id=$1)")
        .bind(organization).fetch_one(&pool).await.unwrap();
    assert_eq!(after_budget, before_budget);
    assert_eq!(
        posts.load(std::sync::atomic::Ordering::SeqCst),
        calls_before_budget
    );
    state
        .store
        .set_provider_offer_active(supplier, offer, actor.operator_id, false)
        .await
        .unwrap();
    let disabled_choices = state
        .store
        .supplier_media_rate_models(supplier, None, 50)
        .await
        .unwrap();
    assert_eq!(
        disabled_choices["data"],
        json!([]),
        "paused offers cannot be selected for publication"
    );
    assert_eq!(
        state
            .store
            .customer_media_rate_models(None, 50)
            .await
            .unwrap()["data"],
        json!([]),
        "paused commercial offers are unavailable to customer price configuration"
    );
    let disabled_models_path = if via_dashboard {
        format!(
            "/admin/v1/organizations/{}/projects/{}/keys/{}/video/models",
            scope.organization_id, scope.project_id, key.id
        )
    } else {
        "/v1/video/models".into()
    };
    let response = app
        .clone()
        .oneshot(
            Request::get(disabled_models_path)
                .header("authorization", format!("Bearer {inference_token}"))
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let unavailable: Value =
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(
        unavailable["data"],
        json!([]),
        "inactive supply disappears from customer Video discovery"
    );
    server.abort();
}
