use super::*;

#[tokio::test]
async fn benchmark_analysis_is_admin_only_and_does_not_dispatch_work() {
    let app = router(test_state(
        None,
        sqlx::postgres::PgPoolOptions::new()
            .connect_lazy("postgres://localhost/unused")
            .unwrap(),
    ));
    let fixture = include_str!("../../../../../contracts/fixtures/paired-experiment.v1.json");
    let unauthorized = app
        .clone()
        .oneshot(
            Request::post("/admin/v1/benchmarks/compare")
                .header("content-type", "application/json")
                .body(axum::body::Body::from(fixture.to_owned()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(unauthorized.status(), StatusCode::UNAUTHORIZED);

    let response = app
        .clone()
        .oneshot(
            Request::post("/admin/v1/benchmarks/compare")
                .header(
                    "authorization",
                    "Bearer niu-test-admin-token-that-is-long-1234",
                )
                .header("content-type", "application/json")
                .body(axum::body::Body::from(fixture.to_owned()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let report: Value =
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(report["data"]["evidence_kind"], "paired_experiment");
    assert_eq!(report["data"]["total_cash_nanos"], "630");
    assert_eq!(report["data"]["pairs"].as_array().unwrap().len(), 3);

    let mut invalid: Value = serde_json::from_str(fixture).unwrap();
    invalid["opt_in"] = Value::Bool(false);
    let rejected = app
        .oneshot(
            Request::post("/admin/v1/benchmarks/compare")
                .header(
                    "authorization",
                    "Bearer niu-test-admin-token-that-is-long-1234",
                )
                .header("content-type", "application/json")
                .body(axum::body::Body::from(invalid.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(rejected.status(), StatusCode::BAD_REQUEST);
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn admin_cost_reporting_preserves_precision_and_requires_admin(pool: sqlx::PgPool) {
    let store = niu_storage::Store::from_pool(pool.clone());
    let org = store.create_organization("reporting").await.unwrap();
    let scope = store.create_project(org, "costs").await.unwrap();
    let key = store
        .issue_key(scope, "client", &["fast".into()], 3600)
        .await
        .unwrap();
    let app = router(test_state(None, pool));
    let base = format!(
        "/admin/v1/organizations/{org}/projects/{}",
        scope.project_id
    );
    let budget_path = format!("{base}/budget");
    for (auth, payload, expected) in [
        (
            format!("Bearer {}", key.token),
            json!({"currency":"USD","limit_nanos":"100"}),
            StatusCode::UNAUTHORIZED,
        ),
        (
            "Bearer niu-test-admin-token-that-is-long-1234".into(),
            json!({"currency":"USD","limit_nanos":"1e9"}),
            StatusCode::BAD_REQUEST,
        ),
        (
            "Bearer niu-test-admin-token-that-is-long-1234".into(),
            json!({"currency":"usd","limit_nanos":"100"}),
            StatusCode::BAD_REQUEST,
        ),
        (
            "Bearer niu-test-admin-token-that-is-long-1234".into(),
            json!({"currency":"USD","limit_nanos":"9223372036854775808"}),
            StatusCode::BAD_REQUEST,
        ),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::post(&budget_path)
                    .header("authorization", auth)
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(payload.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
    }
    let create = || {
        app.clone().oneshot(
            Request::post(&budget_path)
                .header(
                    "authorization",
                    "Bearer niu-test-admin-token-that-is-long-1234",
                )
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({"currency":"USD","limit_nanos":"9007199254740993"}).to_string(),
                ))
                .unwrap(),
        )
    };
    let (first, raced) = tokio::join!(create(), create());
    let statuses = [first.unwrap().status(), raced.unwrap().status()];
    assert!(statuses.contains(&StatusCode::CREATED));
    assert!(statuses.contains(&StatusCode::CONFLICT));
    for suffix in ["budget", "costs"] {
        for auth in [String::new(), format!("Bearer {}", key.token)] {
            let response = app
                .clone()
                .oneshot(
                    Request::get(format!("{base}/{suffix}"))
                        .header("authorization", auth)
                        .body(axum::body::Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        }
    }
    for (suffix, expected) in [
        (
            "budget",
            json!({"data": {"currency":"USD", "limit_nanos":"9007199254740993", "reserved_nanos":"0", "spent_nanos":"0", "period":"lifetime"}}),
        ),
        ("costs", json!({"data": [], "next_cursor": null})),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::get(format!("{base}/{suffix}"))
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
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        assert_eq!(body, expected);
    }
    let price = store
        .publish_price(
            scope,
            niu_storage::PriceInput {
                resource_id: "fast",
                offer_revision: "v1",
                currency: "USD",
                api_equivalent: niu_storage::TokenRates {
                    prompt: 2_000_000,
                    completion: 4_000_000,
                },
                cash: niu_storage::TokenRates {
                    prompt: 1_000_000,
                    completion: 2_000_000,
                },
            },
        )
        .await
        .unwrap();
    let principal = store.authenticate(&key.token).await.unwrap();
    for _ in 0..2 {
        let operation = store.create_operation(scope, "fast").await.unwrap();
        let attempt = store
            .prepare_attempt(scope, operation, "fast", "v1")
            .await
            .unwrap();
        store
            .reserve_cost(scope, attempt, price, 20, 10)
            .await
            .unwrap();
        store.mark_dispatched(&principal, attempt).await.unwrap();
        store
            .complete(scope, attempt, Some((20, 10)))
            .await
            .unwrap();
        store.settle_cost(scope, attempt).await.unwrap();
    }
    let mut cursor = None;
    let mut seen = Vec::new();
    for page in 0..2 {
        let path = match cursor {
            Some(ref c) => format!("{base}/costs?limit=1&after={c}"),
            None => format!("{base}/costs?limit=1"),
        };
        let response = app
            .clone()
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
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        assert_eq!(body["data"].as_array().unwrap().len(), 1);
        let entry = &body["data"][0];
        assert_eq!(entry["cash_nanos"], "40");
        assert_eq!(entry["api_equivalent_nanos"], "80");
        assert_eq!(entry["usage_prompt_tokens"], "20");
        assert!(!seen.contains(&entry["attempt_id"]));
        seen.push(entry["attempt_id"].clone());
        cursor = body["next_cursor"].as_str().map(str::to_owned);
        assert_eq!(cursor.is_some(), page == 0);
    }
    let response = app
        .oneshot(
            Request::get(format!("{base}/costs?limit=101"))
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
async fn readiness_and_liveness_do_not_require_credentials(pool: sqlx::PgPool) {
    let app = router(test_state(None, pool.clone()));
    for path in ["/healthz", "/readyz", "/enterprise/readyz"] {
        let response = app
            .clone()
            .oneshot(Request::get(path).body(axum::body::Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn quick_setup_requires_admin_and_reuses_default(pool: sqlx::PgPool) {
    let state = test_state(None, pool.clone());
    let scope = state.store.default_workspace().await.unwrap();
    let key = state
        .store
        .issue_key(scope, "client", &["fast".into()], 3600)
        .await
        .unwrap();
    let app = router(state);
    let mut result = None;
    for authorization in [
        None,
        Some(format!("Bearer {}", key.token)),
        Some("Bearer niu-test-admin-token-that-is-long-1234".into()),
        Some("Bearer niu-test-admin-token-that-is-long-1234".into()),
    ] {
        let allowed =
            authorization.as_deref() == Some("Bearer niu-test-admin-token-that-is-long-1234");
        let mut request = Request::post("/admin/v1/setup/default-workspace");
        if let Some(value) = authorization {
            request = request.header("authorization", value);
        }
        let response = app
            .clone()
            .oneshot(request.body(axum::body::Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(
            response.status(),
            if allowed {
                StatusCode::OK
            } else {
                StatusCode::UNAUTHORIZED
            }
        );
        if allowed {
            let body: Value =
                serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                    .unwrap();
            assert_eq!(body["project_id"], scope.project_id.to_string());
            if let Some(previous) = &result {
                assert_eq!(previous, &body);
            }
            result = Some(body);
        }
    }
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn bootstrap_api_issues_scoped_keys_and_revokes_them(pool: sqlx::PgPool) {
    let app = router(test_state(None, pool));
    let org = admin_call(&app, "/admin/v1/organizations", json!({"name": "team"})).await;
    let project_path = format!(
        "/admin/v1/organizations/{}/projects",
        org["id"].as_str().unwrap()
    );
    let project = admin_call(&app, &project_path, json!({"name": "app"})).await;
    let key_path = format!("{}/{}/keys", project_path, project["id"].as_str().unwrap());
    let account_path = format!(
        "{}/{}/accounts",
        project_path,
        project["id"].as_str().unwrap()
    );
    let account = admin_call(
        &app,
        &account_path,
        json!({
            "provider": "fixture", "plan": "subscription", "authentication_mode": "oauth_refresh",
            "billing_mode": "subscription", "credential_reference": "secret:fixture-account",
            "concurrency_limit": 2,
        }),
    )
    .await;
    assert_eq!(account["health"], "unverified");
    let response = app
        .clone()
        .oneshot(
            Request::get(&account_path)
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
    let accounts: Value =
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(accounts["data"][0]["billing_mode"], "subscription");
    assert!(accounts["data"][0].get("credential_reference").is_none());
    let denied = app
        .clone()
        .oneshot(
            Request::get(&account_path)
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(denied.status(), StatusCode::UNAUTHORIZED);
    let key = admin_call(
        &app,
        &key_path,
        json!({"name": "inference", "allowed_models": ["fast"], "ttl_seconds": 3600}),
    )
    .await;
    let auth = format!("Bearer {}", key["token"].as_str().unwrap());
    let response = app
        .clone()
        .oneshot(
            Request::get("/v1/models")
                .header("authorization", &auth)
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let models: Value =
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(models["data"][0]["id"], "fast");
    let response = app
        .clone()
        .oneshot(
            Request::post("/admin/v1/organizations")
                .header("authorization", &auth)
                .header("content-type", "application/json")
                .body(axum::body::Body::from(r#"{"name":"unauthorized"}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    let key = admin_call(
        &app,
        &format!("{}/{}/rotate", key_path, key["id"].as_str().unwrap()),
        json!({}),
    )
    .await;
    let replacement_auth = format!("Bearer {}", key["token"].as_str().unwrap());
    let replacement = app
        .clone()
        .oneshot(
            Request::get("/v1/models")
                .header("authorization", replacement_auth)
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(replacement.status(), StatusCode::OK);
    let response = app
        .clone()
        .oneshot(
            Request::delete(format!("{}/{}", key_path, key["id"].as_str().unwrap()))
                .header(
                    "authorization",
                    "Bearer niu-test-admin-token-that-is-long-1234",
                )
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::NO_CONTENT);
    let response = app
        .oneshot(
            Request::get("/v1/models")
                .header("authorization", &auth)
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}
