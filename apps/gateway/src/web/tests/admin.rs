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
async fn project_operator_cannot_read_sibling_workspace_keys_or_activity(pool: sqlx::PgPool) {
    use axum::http::Method;
    use niu_storage::{OperatorAuditActor, OperatorRole, OperatorScope};

    let store = niu_storage::Store::from_pool(pool.clone());
    let organization_id = store
        .create_organization("workspace boundary")
        .await
        .unwrap();
    let first = store
        .create_project(organization_id, "first")
        .await
        .unwrap();
    let second = store
        .create_project(organization_id, "second")
        .await
        .unwrap();
    let first_key = store
        .issue_key(first, "first workspace key", &["fast".into()], 3600)
        .await
        .unwrap();
    let second_key = store
        .issue_key(second, "second workspace key", &["fast".into()], 3600)
        .await
        .unwrap();
    let first_account = store
        .create_account(
            first,
            &niu_storage::AccountInput {
                provider: "fixture".into(),
                plan: "subscription".into(),
                authentication_mode: niu_storage::AuthMode::OAuthRefresh,
                billing_mode: niu_storage::BillingMode::Subscription,
                credential_reference: "secret:first-account".into(),
                concurrency_limit: 1,
            },
        )
        .await
        .unwrap();
    let second_account = store
        .create_account(
            second,
            &niu_storage::AccountInput {
                provider: "fixture".into(),
                plan: "subscription".into(),
                authentication_mode: niu_storage::AuthMode::OAuthRefresh,
                billing_mode: niu_storage::BillingMode::Subscription,
                credential_reference: "secret:second-account".into(),
                concurrency_limit: 1,
            },
        )
        .await
        .unwrap();
    let operator = store
        .create_operator(
            OperatorScope {
                organization_id,
                project_id: Some(first.project_id),
            },
            "first workspace owner",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let app = router(test_state(None, pool));

    async fn get(app: &Router, path: &str, token: &str) -> (StatusCode, Value) {
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
        let status = response.status();
        let body = response.into_body().collect().await.unwrap().to_bytes();
        (status, serde_json::from_slice(&body).unwrap_or(Value::Null))
    }

    let (status, workspaces) = get(&app, "/admin/v1/workspaces", &operator.token).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(workspaces["data"].as_array().unwrap().len(), 1);
    assert_eq!(workspaces["data"][0]["id"], first.project_id.to_string());

    let first_base = format!(
        "/admin/v1/organizations/{organization_id}/projects/{}",
        first.project_id
    );
    let second_base = format!(
        "/admin/v1/organizations/{organization_id}/projects/{}",
        second.project_id
    );
    let (status, keys) = get(&app, &format!("{first_base}/keys"), &operator.token).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(keys["data"].as_array().unwrap().len(), 1);
    assert_eq!(keys["data"][0]["id"], first_key.id.to_string());

    let (status, accounts) = get(&app, &format!("{first_base}/accounts"), &operator.token).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(accounts["data"].as_array().unwrap().len(), 1);
    assert_eq!(accounts["data"][0]["id"], first_account.to_string());

    for path in [
        format!("{second_base}/keys"),
        format!("{second_base}/requests"),
        format!("{second_base}/costs"),
        format!("{second_base}/budget"),
        format!("{second_base}/accounts"),
        format!("{second_base}/accounts/{}/quota", second_account),
        format!("{second_base}/accounts/{}/executions", second_account),
        format!("{second_base}/executions"),
        format!("{second_base}/executions/cohort"),
        format!("{second_base}/execution-imports"),
    ] {
        let (status, _) = get(&app, &path, &operator.token).await;
        let expected = if path.ends_with("/costs")
            || path.ends_with("/budget")
            || path.ends_with("/executions/cohort")
        {
            StatusCode::FORBIDDEN
        } else {
            StatusCode::NOT_FOUND
        };
        assert_eq!(status, expected, "unexpected access to {path}");
    }
    for (method, path, payload) in [
        (
            Method::POST,
            format!("{second_base}/keys"),
            Some(json!({"name":"forged key","allowed_models":["fast"],"ttl_seconds":3600})),
        ),
        (
            Method::POST,
            format!("{second_base}/accounts"),
            Some(json!({
                "provider":"fixture", "plan":"subscription", "authentication_mode":"oauth_refresh",
                "billing_mode":"subscription", "credential_reference":"secret:forged", "concurrency_limit":1
            })),
        ),
        (
            Method::POST,
            format!("{second_base}/collector-keys"),
            Some(json!({"name":"forged collector", "ttl_seconds":3600})),
        ),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(method)
                    .uri(&path)
                    .header("authorization", format!("Bearer {}", operator.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(payload.unwrap().to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(
            response.status(),
            StatusCode::NOT_FOUND,
            "unexpected access to {path}"
        );
    }
    assert_ne!(first_key.id, second_key.id);

    let (status, requests) = get(&app, &format!("{first_base}/requests"), &operator.token).await;
    assert_eq!(status, StatusCode::OK);
    assert!(requests["data"].is_array());
    // Procurement and platform cost evidence remain installation-only even
    // when the operator has access to the requested customer workspace.
    for suffix in ["costs", "budget", "executions/cohort"] {
        let (status, _) = get(&app, &format!("{first_base}/{suffix}"), &operator.token).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
    }
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn workspace_creation_obeys_operator_write_and_organization_scope(pool: sqlx::PgPool) {
    use niu_storage::{OperatorAuditActor, OperatorRole, OperatorScope};

    let store = niu_storage::Store::from_pool(pool.clone());
    let organization = store
        .create_organization("workspace creation")
        .await
        .unwrap();
    let foreign_organization = store
        .create_organization("foreign workspace creation")
        .await
        .unwrap();
    let project = store
        .create_project(organization, "existing project")
        .await
        .unwrap();
    let organization_owner = store
        .create_operator(
            OperatorScope {
                organization_id: organization,
                project_id: None,
            },
            "organization owner",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let project_owner = store
        .create_operator(
            OperatorScope {
                organization_id: organization,
                project_id: Some(project.project_id),
            },
            "project owner",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let viewer = store
        .create_operator(
            OperatorScope {
                organization_id: organization,
                project_id: None,
            },
            "organization viewer",
            OperatorRole::Viewer,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let app = router(test_state(None, pool));

    async fn create(
        app: &Router,
        token: &str,
        name: &str,
        organization_id: Option<Uuid>,
    ) -> (StatusCode, Value) {
        let response = app
            .clone()
            .oneshot(
                Request::post("/admin/v1/workspaces")
                    .header("authorization", format!("Bearer {token}"))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(
                        json!({"name": name, "organization_id": organization_id}).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        let status = response.status();
        let body = response.into_body().collect().await.unwrap().to_bytes();
        (status, serde_json::from_slice(&body).unwrap_or(Value::Null))
    }

    let (status, created) = create(
        &app,
        &organization_owner.token,
        "owner workspace",
        Some(organization),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(created["organization_id"], organization.to_string());
    assert_eq!(
        create(
            &app,
            &organization_owner.token,
            "foreign workspace",
            Some(foreign_organization),
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        create(
            &app,
            &project_owner.token,
            "sibling workspace",
            Some(organization),
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        create(
            &app,
            &viewer.token,
            "read only workspace",
            Some(organization)
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );

    let (status, personal) = create(
        &app,
        "niu-test-admin-token-that-is-long-1234",
        "personal workspace",
        None,
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    assert_ne!(personal["organization_id"], organization.to_string());
    assert_eq!(personal["organization_name"], "Personal workspace");
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
