use super::*;

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn gateway_activity_uses_a_chronological_cursor_without_external_task_imports(
    pool: sqlx::PgPool,
) {
    let state = test_state(None, pool);
    let organization = state
        .store
        .create_organization("gateway history")
        .await
        .unwrap();
    let scope = state
        .store
        .create_project(organization, "history")
        .await
        .unwrap();
    let key = state
        .store
        .issue_key(scope, "client", &["fast".into()], 3600)
        .await
        .unwrap();
    let principal = state.store.authenticate(&key.token).await.unwrap();
    let high_volume_key = state
        .store
        .issue_key(scope, "Batch analysis", &["fast".into()], 3600)
        .await
        .unwrap();
    let high_volume_principal = state
        .store
        .authenticate(&high_volume_key.token)
        .await
        .unwrap();
    let unknown_usage_key = state
        .store
        .issue_key(scope, "Background sync", &["fast".into()], 3600)
        .await
        .unwrap();
    let unknown_usage_principal = state
        .store
        .authenticate(&unknown_usage_key.token)
        .await
        .unwrap();
    for index in 0..105u64 {
        let (request_principal, prompt_tokens) = if index == 104 {
            (&high_volume_principal, 10_000)
        } else {
            (&principal, index + 1)
        };
        let operation = state
            .store
            .create_operation_for_task(scope, "fast", Some("task-history"))
            .await
            .unwrap();
        let attempt = state
            .store
            .prepare_attempt(scope, operation, "fast", "route-v1")
            .await
            .unwrap();
        state
            .store
            .mark_dispatched(request_principal, attempt)
            .await
            .unwrap();
        state
            .store
            .complete_with_provider_model(
                scope,
                attempt,
                Some((prompt_tokens, 1)),
                Some("upstream-fast-v1"),
            )
            .await
            .unwrap();
        if index < 3 {
            let duration = [100, 300, 10_000][index as usize];
            state
                .store
                .save_request_timing(niu_storage::RequestTimingRecord {
                    attempt,
                    dispatch_ms: Some(10),
                    headers_ms: Some(20),
                    first_output_ms: Some(50),
                    total_ms: duration,
                    complete: index < 2,
                    http_status: Some(200),
                })
                .await
                .unwrap();
        }
    }
    let unknown_operation = state
        .store
        .create_operation_for_task(scope, "fast", Some("task-history"))
        .await
        .unwrap();
    let unknown_attempt = state
        .store
        .prepare_attempt(scope, unknown_operation, "fast", "route-v1")
        .await
        .unwrap();
    state
        .store
        .mark_dispatched(&unknown_usage_principal, unknown_attempt)
        .await
        .unwrap();
    state
        .store
        .complete_with_provider_model(scope, unknown_attempt, None, Some("upstream-fast-v1"))
        .await
        .unwrap();

    let app = router(state.clone());
    let retired_import = format!(
        "/admin/v1/organizations/{organization}/projects/{}/executions",
        scope.project_id
    );
    let rejected = app
        .clone()
        .oneshot(
            Request::post(retired_import)
                .header(
                    "authorization",
                    "Bearer niu-test-admin-token-that-is-long-1234",
                )
                .header("content-type", "application/json")
                .body(axum::body::Body::from("{}"))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(rejected.status(), StatusCode::NOT_FOUND);

    let base = format!(
        "/admin/v1/organizations/{organization}/projects/{}/requests",
        scope.project_id
    );
    let page_request = |path: String| {
        let app = app.clone();
        async move {
            app.oneshot(
                Request::get(path)
                    .header(
                        "authorization",
                        "Bearer niu-test-admin-token-that-is-long-1234",
                    )
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap()
        }
    };
    let first_page = page_request(format!("{base}?limit=100")).await;
    assert_eq!(first_page.status(), StatusCode::OK);
    let first_body: Value =
        serde_json::from_slice(&first_page.into_body().collect().await.unwrap().to_bytes())
            .unwrap();
    let first_rows = first_body["data"].as_array().unwrap();
    assert_eq!(first_rows.len(), 100);
    let cursor = first_body["next_cursor"].as_str().unwrap().to_owned();
    let mut seen = Vec::new();
    let mut previous: Option<(String, String)> = None;
    for row in first_rows {
        assert_eq!(row["task_id"], "task-history");
        assert_eq!(row["provider_model"], "upstream-fast-v1");
        assert!(row["task_evidence"].is_null());
        let attempt_id = row["attempt_id"].as_str().unwrap().to_owned();
        assert!(!seen.contains(&attempt_id));
        seen.push(attempt_id.clone());
        let current = (row["created_at"].as_str().unwrap().to_owned(), attempt_id);
        if let Some(prior) = previous.as_ref() {
            assert!(prior >= &current, "activity pages are not chronological");
        }
        previous = Some(current);
    }

    let arriving_operation = state
        .store
        .create_operation_for_task(scope, "fast", Some("task-history"))
        .await
        .unwrap();
    let arriving_attempt = state
        .store
        .prepare_attempt(scope, arriving_operation, "fast", "route-v1")
        .await
        .unwrap();
    state
        .store
        .mark_dispatched(&principal, arriving_attempt)
        .await
        .unwrap();
    state
        .store
        .complete_with_provider_model(
            scope,
            arriving_attempt,
            Some((106, 1)),
            Some("upstream-fast-v1"),
        )
        .await
        .unwrap();

    let older_page = page_request(format!("{base}?limit=100&after={cursor}")).await;
    assert_eq!(older_page.status(), StatusCode::OK);
    let older_body: Value =
        serde_json::from_slice(&older_page.into_body().collect().await.unwrap().to_bytes())
            .unwrap();
    let older_rows = older_body["data"].as_array().unwrap();
    assert_eq!(older_body["summary"]["timing_count"], 2);
    assert_eq!(older_body["summary"]["average_duration_ms"], 200);
    assert_eq!(
        older_body["summary"]["latency_percentiles"],
        json!({"boundary":"gateway_body_ms","sample_count":2,"p50_ms":100,"p95_ms":300,"p99_ms":300})
    );
    assert_eq!(older_rows.len(), 6);
    let linked_attempt = older_rows[0]["attempt_id"].as_str().unwrap();
    let detail = page_request(format!("{base}/{linked_attempt}")).await;
    assert_eq!(detail.status(), StatusCode::OK);
    assert_eq!(detail.headers()["cache-control"], "no-store");
    let detail: Value =
        serde_json::from_slice(&detail.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(detail["data"], older_rows[0]);
    assert!(detail["data"].get("cash_nanos").is_none());
    assert!(detail["data"].get("supplier_cost_nanos").is_none());
    let foreign_scope = state
        .store
        .create_project(organization, "other-request-workspace")
        .await
        .unwrap();
    let foreign = page_request(format!(
        "/admin/v1/organizations/{organization}/projects/{}/requests/{linked_attempt}",
        foreign_scope.project_id
    ))
    .await;
    assert_eq!(foreign.status(), StatusCode::NOT_FOUND);
    let missing = page_request(format!("{base}/{}", uuid::Uuid::new_v4())).await;
    assert_eq!(missing.status(), StatusCode::NOT_FOUND);
    let client_detail = app
        .clone()
        .oneshot(
            Request::get(format!("{base}/{linked_attempt}"))
                .header("authorization", format!("Bearer {}", key.token))
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(client_detail.status(), StatusCode::UNAUTHORIZED);
    let full_count = older_body["summary"]["request_count"].as_i64().unwrap();
    assert!(full_count > 100);
    assert_eq!(
        older_body["summary"]["request_histogram"]
            .as_array()
            .unwrap()
            .iter()
            .map(|b| b["request_count"].as_i64().unwrap())
            .sum::<i64>(),
        full_count
    );
    assert!(older_body["next_cursor"].is_null());
    for row in older_rows {
        assert_eq!(row["task_id"], "task-history");
        assert!(row["task_evidence"].is_null());
        let attempt_id = row["attempt_id"].as_str().unwrap().to_owned();
        assert!(!seen.contains(&attempt_id));
        assert_ne!(attempt_id, arriving_attempt.to_string());
        seen.push(attempt_id);
    }
    assert_eq!(seen.len(), 106);

    let refreshed = page_request(format!("{base}?limit=100")).await;
    assert_eq!(refreshed.status(), StatusCode::OK);
    let refreshed_body: Value =
        serde_json::from_slice(&refreshed.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(
        refreshed_body["data"][0]["attempt_id"],
        arriving_attempt.to_string()
    );

    let filtered = page_request(format!(
        "{base}?limit=10&model_alias=fast&status=confirmed_completed"
    ))
    .await;
    assert_eq!(filtered.status(), StatusCode::OK);
    let filtered_body: Value =
        serde_json::from_slice(&filtered.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(filtered_body["data"].as_array().unwrap().len(), 10);
    assert_eq!(filtered_body["summary"]["request_count"], 107);
    assert_eq!(
        filtered_body["summary"]["latency_percentiles"]["sample_count"],
        2
    );
    assert_eq!(filtered_body["summary"]["usage_count"], 106);
    assert_eq!(filtered_body["summary"]["prompt_tokens"], "15566");
    assert_eq!(filtered_body["summary"]["completion_tokens"], "106");
    assert_eq!(
        filtered_body["summary"]["unresolved_customer_charge_count"],
        0
    );
    assert_eq!(filtered_body["summary"]["unpriced_request_count"], 107);
    assert_eq!(
        filtered_body["summary"]["usage_by_model"][0]["model_alias"],
        "fast"
    );
    assert_eq!(
        filtered_body["summary"]["usage_by_model"][0]["prompt_tokens"],
        "15566"
    );
    assert_eq!(
        filtered_body["summary"]["usage_by_model"][0]["completion_tokens"],
        "106"
    );
    assert_eq!(
        filtered_body["summary"]["usage_by_model"][0]["unknown_usage_count"],
        1
    );
    assert_eq!(
        filtered_body["summary"]["usage_by_key"]
            .as_array()
            .unwrap()
            .len(),
        3
    );
    let histogram = filtered_body["summary"]["request_histogram"]
        .as_array()
        .unwrap();
    assert!(histogram.len() <= 24);
    assert_eq!(
        histogram
            .iter()
            .map(|b| b["request_count"].as_i64().unwrap())
            .sum::<i64>(),
        filtered_body["summary"]["request_count"].as_i64().unwrap()
    );
    assert!(
        histogram
            .iter()
            .all(|b| b["end_ms"].as_i64().unwrap() > b["start_ms"].as_i64().unwrap())
    );
    assert_eq!(
        filtered_body["summary"]["usage_by_key"][0]["api_key_id"],
        high_volume_key.id.to_string()
    );
    assert_eq!(
        filtered_body["summary"]["usage_by_key"][0]["key_name"],
        "Batch analysis"
    );
    assert_eq!(
        filtered_body["summary"]["usage_by_key"][0]["prompt_tokens"],
        "10000"
    );
    assert_eq!(
        filtered_body["summary"]["usage_by_key"][1]["api_key_id"],
        key.id.to_string()
    );
    assert_eq!(
        filtered_body["summary"]["usage_by_key"][1]["key_name"],
        "client"
    );
    assert_eq!(
        filtered_body["summary"]["usage_by_key"][1]["prompt_tokens"],
        "5566"
    );
    assert_eq!(
        filtered_body["summary"]["usage_by_key"][2]["api_key_id"],
        unknown_usage_key.id.to_string()
    );
    assert_eq!(
        filtered_body["summary"]["usage_by_key"][2]["key_name"],
        "Background sync"
    );
    assert_eq!(
        filtered_body["summary"]["usage_by_key"][2]["usage_count"],
        0
    );
    assert_eq!(
        filtered_body["summary"]["usage_by_key"][2]["unknown_usage_count"],
        1
    );
    assert_eq!(
        filtered_body["summary"]["usage_by_key"][2]["prompt_tokens"],
        "0"
    );
    assert!(first_rows.iter().all(|row| {
        row["customer_charge_status"] == "unpriced"
            && row.get("cash_nanos").is_none()
            && row.get("api_equivalent_nanos").is_none()
    }));

    // A real request without a completed timing must not become a zero-duration sample.
    for query in [
        format!("key_id={}", high_volume_key.id),
        "model_alias=missing-model".to_string(),
        "from_ms=0&to_ms=1".to_string(),
        "status=confirmed_not_executed".to_string(),
    ] {
        let response = page_request(format!("{base}?{query}")).await;
        assert_eq!(response.status(), StatusCode::OK);
        let body: Value =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        assert_eq!(
            body["summary"]["latency_percentiles"],
            json!({
                "boundary": "gateway_body_ms", "sample_count": 0,
                "p50_ms": null, "p95_ms": null, "p99_ms": null,
            })
        );
        if query.starts_with("key_id=") {
            assert_eq!(body["summary"]["request_count"], 1);
        }
    }

    let other_organization = state
        .store
        .create_organization("other history workspace")
        .await
        .unwrap();
    let other_scope = state
        .store
        .create_project(other_organization, "other history project")
        .await
        .unwrap();
    let other_key = state
        .store
        .issue_key(other_scope, "other project key", &["fast".into()], 3600)
        .await
        .unwrap();
    let foreign_key_filter = page_request(format!("{base}?key_id={}", other_key.id)).await;
    assert_eq!(foreign_key_filter.status(), StatusCode::OK);
    let foreign_body: Value = serde_json::from_slice(
        &foreign_key_filter
            .into_body()
            .collect()
            .await
            .unwrap()
            .to_bytes(),
    )
    .unwrap();
    assert!(foreign_body["data"].as_array().unwrap().is_empty());
    assert_eq!(foreign_body["summary"]["request_count"], 0);
    assert_eq!(
        foreign_body["summary"]["latency_percentiles"]["p95_ms"],
        Value::Null
    );
    assert_eq!(foreign_body["summary"]["request_histogram"], json!([]));

    let empty_date_window = page_request(format!("{base}?from_ms=0&to_ms=1")).await;
    assert_eq!(empty_date_window.status(), StatusCode::OK);
    let empty_date_body: Value = serde_json::from_slice(
        &empty_date_window
            .into_body()
            .collect()
            .await
            .unwrap()
            .to_bytes(),
    )
    .unwrap();
    assert!(empty_date_body["data"].as_array().unwrap().is_empty());
    assert_eq!(empty_date_body["summary"]["request_count"], 0);
    assert_eq!(empty_date_body["summary"]["request_histogram"], json!([]));

    let response = app
        .clone()
        .oneshot(
            Request::get(format!("{base}?limit=101"))
                .header(
                    "authorization",
                    "Bearer niu-test-admin-token-that-is-long-1234",
                )
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn workspace_activity_reports_customer_charges_without_supplier_costs(pool: sqlx::PgPool) {
    use niu_storage::{PriceInput, ProviderOfferInput, TokenRates};

    let state = test_state(None, pool);
    let organization = state
        .store
        .create_organization("activity accounting")
        .await
        .unwrap();
    let scope = state
        .store
        .create_project(organization, "workspace")
        .await
        .unwrap();
    state.store.create_budget(scope, "USD", 30).await.unwrap();
    let key = state
        .store
        .issue_key(scope, "client", &["fast".into()], 3600)
        .await
        .unwrap();
    let principal = state.store.authenticate(&key.token).await.unwrap();
    let upstream_price = state
        .store
        .publish_price(
            scope,
            PriceInput {
                resource_id: "fast",
                offer_revision: "route-v1",
                currency: "USD",
                api_equivalent: TokenRates {
                    prompt: 4_000_000,
                    completion: 8_000_000,
                },
                cash: TokenRates {
                    prompt: 1_000_000,
                    completion: 2_000_000,
                },
            },
        )
        .await
        .unwrap();
    state
        .store
        .publish_customer_tariff(
            scope,
            &ProviderOfferInput {
                model_alias: "fast".into(),
                currency: "USD".into(),
                prompt_rate: "50000000".into(),
                completion_rate: "100000000".into(),
                expected_revision: None,
            },
        )
        .await
        .unwrap();
    let (_, attempt) = state
        .store
        .prepare_gateway_attempt(scope, "fast", None, "route-v1")
        .await
        .unwrap();
    state
        .store
        .bind_customer_tariff(scope, attempt, "fast")
        .await
        .unwrap();
    state
        .store
        .reserve_and_dispatch_gateway(
            &principal,
            attempt,
            &niu_storage::GatewayReservation {
                price_revision_id: upstream_price,
                resource_id: "fast".into(),
                offer_revision: "route-v1".into(),
                prompt_bound: 10,
                completion_bound: 10,
                can_report_reasoning_tokens: true,
            },
        )
        .await
        .unwrap();
    state
        .store
        .complete_and_settle_with_provider_model(
            scope,
            attempt,
            Some((2, 1)),
            Some("upstream-fast-v1"),
        )
        .await
        .unwrap();

    let path = format!(
        "/admin/v1/organizations/{organization}/projects/{}/requests?limit=10",
        scope.project_id
    );
    let response = router(state.clone())
        .oneshot(
            Request::get(path)
                .header(
                    "authorization",
                    "Bearer niu-test-admin-token-that-is-long-1234",
                )
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body: Value =
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap();
    let row = &body["data"][0];
    assert_eq!(row["customer_charge_status"], "charged");
    assert_eq!(row["customer_charge_currency"], "USD");
    assert_eq!(row["customer_charge_nanos"], "200");
    assert_eq!(row["usage_confidence"], "provider_reported");
    for supplier_field in ["cash_nanos", "api_equivalent_nanos", "currency"] {
        assert!(row.get(supplier_field).is_none(), "leaked {supplier_field}");
    }
    assert_eq!(
        body["summary"]["customer_charges"][0]["amount_nanos"],
        "200"
    );
    assert_eq!(body["summary"]["unpriced_request_count"], 0);
    assert_eq!(body["summary"]["unresolved_customer_charge_count"], 0);
    assert_eq!(body["summary"]["usage_by_model"][0]["prompt_tokens"], "2");
    assert_eq!(
        body["summary"]["usage_by_model"][0]["completion_tokens"],
        "1"
    );

    let supplier_cost = state
        .store
        .cost_entries(scope, None, 10)
        .await
        .unwrap()
        .pop()
        .unwrap();
    assert_eq!(supplier_cost.cash_nanos, 4);
    assert_ne!(
        supplier_cost.cash_nanos.to_string(),
        row["customer_charge_nanos"]
    );
}
