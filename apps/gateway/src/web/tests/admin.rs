use super::*;

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn key_metadata_patch_requires_workspace_write_and_valid_grants(pool: PgPool) {
    use niu_storage::{OperatorAuditActor, OperatorRole, OperatorScope};
    let state = test_state(None, pool.clone());
    let scope = state.store.default_workspace().await.unwrap();
    let other = state
        .store
        .create_project(scope.organization_id, "Sibling keys")
        .await
        .unwrap();
    let key = state
        .store
        .issue_key(scope, "Original", &["*".into()], 3600)
        .await
        .unwrap();
    let foreign = state
        .store
        .issue_key(other, "Sibling", &["*".into()], 3600)
        .await
        .unwrap();
    let operator_scope = OperatorScope {
        organization_id: scope.organization_id,
        project_id: Some(scope.project_id),
    };
    let writer = state
        .store
        .create_operator(
            operator_scope,
            "Key writer",
            OperatorRole::Admin,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let reader = state
        .store
        .create_operator(
            operator_scope,
            "Key reader",
            OperatorRole::Viewer,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let app = router(state.clone());
    let path = format!(
        "/admin/v1/organizations/{}/projects/{}/keys/{}",
        scope.organization_id, scope.project_id, key.id
    );
    let foreign_path = format!(
        "/admin/v1/organizations/{}/projects/{}/keys/{}",
        other.organization_id, other.project_id, foreign.id
    );
    let valid = json!({"name":"Renamed","allowed_models":["*"],"expected_revision":1});
    for (token, route, payload, expected) in [
        (
            key.token.as_str(),
            path.as_str(),
            valid.clone(),
            StatusCode::UNAUTHORIZED,
        ),
        (
            reader.token.as_str(),
            path.as_str(),
            valid.clone(),
            StatusCode::FORBIDDEN,
        ),
        (
            writer.token.as_str(),
            foreign_path.as_str(),
            valid.clone(),
            StatusCode::NOT_FOUND,
        ),
        (
            writer.token.as_str(),
            path.as_str(),
            json!({"name":"Invalid","allowed_models":["missing-model"],"expected_revision":1}),
            StatusCode::BAD_REQUEST,
        ),
        (
            writer.token.as_str(),
            path.as_str(),
            valid.clone(),
            StatusCode::OK,
        ),
        (
            writer.token.as_str(),
            path.as_str(),
            valid,
            StatusCode::CONFLICT,
        ),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::patch(route)
                    .header("authorization", format!("Bearer {token}"))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(payload.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
    }
    let saved = state.store.list_keys(scope).await.unwrap().remove(0);
    assert_eq!(saved.name, "Renamed");
    assert_eq!(saved.revision, 2);
    let actor: String = sqlx::query_scalar(
        "SELECT actor FROM key_audit_events WHERE key_id=$1 AND action='updated'",
    )
    .bind(key.id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(actor, format!("operator:{}", writer.operator_id));
    assert_eq!(
        state.store.list_keys(other).await.unwrap().remove(0).name,
        "Sibling"
    );
}

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
        assert_eq!(status, StatusCode::NOT_FOUND, "unexpected access to {path}");
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
    for suffix in ["costs", "budget"] {
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

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn workspace_guardrail_api_enforces_roles_and_scope(pool: sqlx::PgPool) {
    use axum::http::Method;
    use niu_storage::{OperatorAuditActor, OperatorRole, OperatorScope};
    let state = test_state(None, pool.clone());
    let scope = state.store.default_workspace().await.unwrap();
    let other = state
        .store
        .create_project(scope.organization_id, "Other guarded workspace")
        .await
        .unwrap();
    let operator_scope = OperatorScope {
        organization_id: scope.organization_id,
        project_id: Some(scope.project_id),
    };
    let writer = state
        .store
        .create_operator(
            operator_scope,
            "Policy manager",
            OperatorRole::Admin,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let viewer = state
        .store
        .create_operator(
            operator_scope,
            "Policy reader",
            OperatorRole::Viewer,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let app = router(state.clone());
    let policy = json!({"schema_version":1,"name":"Restricted","models":{"mode":"deny_all"},"providers":{"mode":"inherit"}});
    let mut invalid_input = policy.clone();
    invalid_input["input_rules"] = json!([{"pattern":"[private-pattern-fixture","action":"block"}]);
    let policy_path = format!(
        "/admin/v1/organizations/{}/projects/{}/guardrails",
        scope.organization_id, scope.project_id
    );
    for (credential, expected) in [
        (&viewer.token, StatusCode::FORBIDDEN),
        (&writer.token, StatusCode::BAD_REQUEST),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::put(&policy_path)
                    .header("authorization", format!("Bearer {credential}"))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(
                        json!({"expected_revision":0,"policy":invalid_input}).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
        let body = response.into_body().collect().await.unwrap().to_bytes();
        assert!(!String::from_utf8_lossy(&body).contains("private-pattern-fixture"));
        assert!(
            state
                .store
                .workspace_guardrail(scope)
                .await
                .unwrap()
                .is_none()
        );
    }
    let assignment_key = state
        .store
        .issue_key(scope, "Malformed policy fixture", &["*".into()], 3600)
        .await
        .unwrap();
    let key_path = format!(
        "/admin/v1/organizations/{}/projects/{}/keys/{}/guardrail",
        scope.organization_id, scope.project_id, assignment_key.id
    );
    let mut malformed_policy = policy.clone();
    malformed_policy["private-pattern-fixture"] = json!(true);
    for (method, path, payload) in [
        (
            Method::PUT,
            policy_path.clone(),
            json!({"expected_revision":0,"policy":malformed_policy}),
        ),
        (
            Method::POST,
            format!("{policy_path}/preview"),
            json!({"policy":malformed_policy,"model":"fast","provider":"openai"}),
        ),
        (
            Method::POST,
            format!("{policy_path}/rollback"),
            json!({"expected_revision":"private-pattern-fixture","target_revision":1}),
        ),
        (
            Method::PUT,
            key_path,
            json!({"policy_revision":"private-pattern-fixture","expected_assignment_revision":0}),
        ),
    ] {
        for (credential, expected) in [
            (writer.token.as_str(), StatusCode::BAD_REQUEST),
            ("invalid-credential", StatusCode::UNAUTHORIZED),
        ] {
            let response = app
                .clone()
                .oneshot(
                    Request::builder()
                        .method(method.clone())
                        .uri(&path)
                        .header("authorization", format!("Bearer {credential}"))
                        .header("content-type", "application/json")
                        .body(axum::body::Body::from(payload.to_string()))
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), expected);
            let bytes = response.into_body().collect().await.unwrap().to_bytes();
            assert!(!String::from_utf8_lossy(&bytes).contains("private-pattern-fixture"));
            assert!(
                state
                    .store
                    .workspace_guardrail(scope)
                    .await
                    .unwrap()
                    .is_none()
            );
        }
    }
    for (token, target, method, suffix, payload, expected) in [
        (
            &viewer.token,
            scope,
            Method::GET,
            "",
            json!(null),
            StatusCode::OK,
        ),
        (
            &viewer.token,
            scope,
            Method::POST,
            "/preview",
            json!({"policy":policy,"model":"fast","provider":"openai"}),
            StatusCode::OK,
        ),
        (
            &viewer.token,
            scope,
            Method::PUT,
            "",
            json!({"expected_revision":0,"policy":policy}),
            StatusCode::FORBIDDEN,
        ),
        (
            &writer.token,
            other,
            Method::GET,
            "",
            json!(null),
            StatusCode::FORBIDDEN,
        ),
        (
            &writer.token,
            other,
            Method::PUT,
            "",
            json!({"expected_revision":0,"policy":policy}),
            StatusCode::FORBIDDEN,
        ),
        (
            &writer.token,
            scope,
            Method::PUT,
            "",
            json!({"expected_revision":0,"policy":policy}),
            StatusCode::OK,
        ),
    ] {
        let path = format!(
            "/admin/v1/organizations/{}/projects/{}/guardrails{suffix}",
            target.organization_id, target.project_id
        );
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(method)
                    .uri(path)
                    .header("authorization", format!("Bearer {token}"))
                    .header("content-type", "application/json")
                    .body(if payload.is_null() {
                        axum::body::Body::empty()
                    } else {
                        axum::body::Body::from(payload.to_string())
                    })
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
    }
    assert!(
        state
            .store
            .workspace_guardrail(other)
            .await
            .unwrap()
            .is_none()
    );
    assert_eq!(
        state
            .store
            .workspace_guardrail(scope)
            .await
            .unwrap()
            .unwrap()["revision"],
        1
    );
    let active_before = state.store.workspace_guardrail(scope).await.unwrap();
    for (field, unsupported) in [
        (
            "output",
            json!({"mode":"windowed","rules":[{"pattern":"fixture","action":"block"}]}),
        ),
        (
            "detectors",
            json!([{"endpoint":"https://detector.invalid","credential":"private-detector-fixture"}]),
        ),
        (
            "budget",
            json!({"currency":"USD","amount_nanos":"1","period":"month"}),
        ),
    ] {
        let mut draft = policy.clone();
        draft[field] = unsupported;
        let response = app
            .clone()
            .oneshot(
                Request::put(&policy_path)
                    .header("authorization", format!("Bearer {}", writer.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(
                        json!({"expected_revision":1,"policy":draft}).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let body = response.into_body().collect().await.unwrap().to_bytes();
        assert!(!String::from_utf8_lossy(&body).contains("private-detector-fixture"));
        assert_eq!(
            state.store.workspace_guardrail(scope).await.unwrap(),
            active_before
        );
    }
    let relaxed = json!({"schema_version":1,"name":"Relaxed","models":{"mode":"allow_all"},"providers":{"mode":"inherit"}});
    state
        .store
        .activate_workspace_guardrail(scope, 1, &relaxed)
        .await
        .unwrap();
    for (token, target, expected) in [
        (&viewer.token, scope, StatusCode::FORBIDDEN),
        (&writer.token, other, StatusCode::FORBIDDEN),
        (&writer.token, scope, StatusCode::OK),
        (&writer.token, scope, StatusCode::CONFLICT),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::post(format!(
                    "/admin/v1/organizations/{}/projects/{}/guardrails/rollback",
                    target.organization_id, target.project_id
                ))
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({"expected_revision":2,"target_revision":1}).to_string(),
                ))
                .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
    }
    assert_eq!(
        state.store.workspace_guardrail(scope).await.unwrap(),
        Some(json!({"revision":3,"policy":policy}))
    );
    assert_eq!(
        state
            .store
            .workspace_guardrail_revision(scope, 2)
            .await
            .unwrap(),
        Some(relaxed)
    );
    let audit: (String,Option<i64>) = sqlx::query_as("SELECT activated_by,restored_from_revision FROM workspace_guardrail_revisions WHERE organization_id=$1 AND project_id=$2 AND revision=3")
        .bind(scope.organization_id).bind(scope.project_id).fetch_one(&pool).await.unwrap();
    assert!(audit.0.starts_with("operator:"));
    assert_eq!(audit.1, Some(1));
    assert!(!audit.0.contains(&writer.token));
    let history_path = format!("{policy_path}/history");
    for (credential, target, suffix, expected) in [
        (viewer.token.as_str(), scope, "", StatusCode::OK),
        (viewer.token.as_str(), other, "", StatusCode::FORBIDDEN),
        (
            viewer.token.as_str(),
            scope,
            "?before_revision=0",
            StatusCode::BAD_REQUEST,
        ),
        (
            viewer.token.as_str(),
            scope,
            "?before_revision=private-marker",
            StatusCode::BAD_REQUEST,
        ),
        (
            "invalid-credential",
            scope,
            "?before_revision=private-marker",
            StatusCode::UNAUTHORIZED,
        ),
    ] {
        let uri = format!(
            "/admin/v1/organizations/{}/projects/{}/guardrails/history{suffix}",
            target.organization_id, target.project_id
        );
        let response = app
            .clone()
            .oneshot(
                Request::get(uri)
                    .header("authorization", format!("Bearer {credential}"))
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        let text = String::from_utf8_lossy(&bytes);
        assert!(!text.contains("private-marker"));
        assert!(!text.contains(&writer.token));
        assert!(!text.contains(&writer.session.id.to_string()));
        if expected == StatusCode::OK {
            let body: Value = serde_json::from_slice(&bytes).unwrap();
            assert_eq!(body["data"][0]["revision"], 3);
            assert_eq!(body["data"][0]["restored_from_revision"], 1);
            assert_eq!(body["data"][0]["actor_name"], "Policy manager");
            assert_eq!(body["data"][0]["active"], true);
            assert_eq!(body["data"][1]["active"], false);
            assert!(body["data"][0].get("policy").is_none());
            assert_eq!(body["next_cursor"], Value::Null);
        }
    }
    for (credential, target, revision, expected) in [
        (viewer.token.as_str(), scope, 1, StatusCode::OK),
        (viewer.token.as_str(), other, 1, StatusCode::FORBIDDEN),
        (viewer.token.as_str(), scope, 999, StatusCode::NOT_FOUND),
        (viewer.token.as_str(), scope, 0, StatusCode::BAD_REQUEST),
        ("invalid-credential", scope, 1, StatusCode::UNAUTHORIZED),
    ] {
        let uri = format!(
            "/admin/v1/organizations/{}/projects/{}/guardrails/revisions/{revision}",
            target.organization_id, target.project_id
        );
        let response = app
            .clone()
            .oneshot(
                Request::get(uri)
                    .header("authorization", format!("Bearer {credential}"))
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
        if expected == StatusCode::OK {
            assert_eq!(response.headers()["cache-control"], "no-store");
            let body: Value =
                serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                    .unwrap();
            assert_eq!(body, json!({"data":{"revision":1,"policy":policy}}));
        }
    }
    for expected in 3..104 {
        state
            .store
            .activate_workspace_guardrail(scope, expected, &policy)
            .await
            .unwrap();
    }
    let mut cursor = None;
    let mut revisions = Vec::new();
    loop {
        let uri = cursor.map_or(history_path.clone(), |revision| {
            format!("{history_path}?before_revision={revision}")
        });
        let response = app
            .clone()
            .oneshot(
                Request::get(uri)
                    .header("authorization", format!("Bearer {}", viewer.token))
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()["cache-control"], "no-store");
        let body: Value =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        let page = body["data"].as_array().unwrap();
        assert!(page.len() <= 100);
        revisions.extend(page.iter().map(|event| event["revision"].as_i64().unwrap()));
        cursor = body["next_cursor"].as_i64();
        if cursor.is_none() {
            break;
        }
    }
    assert_eq!(revisions, (1..=104).rev().collect::<Vec<_>>());
    let mut observed = policy.clone();
    observed["output"] =
        json!({"mode":"observe_only","rules":[{"pattern":"fixture","action":"block"}]});
    let response = app
        .clone()
        .oneshot(
            Request::put(&policy_path)
                .header("authorization", format!("Bearer {}", writer.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({"expected_revision":104,"policy":observed}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        state
            .store
            .workspace_guardrail(scope)
            .await
            .unwrap()
            .unwrap(),
        json!({"revision":105,"policy":observed})
    );
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn synthetic_input_preview_is_scoped_safe_and_never_dispatches(pool: PgPool) {
    use niu_storage::{OperatorAuditActor, OperatorRole, OperatorScope};
    let state = test_state(None, pool);
    let scope = state.store.default_workspace().await.unwrap();
    let other = state
        .store
        .create_project(scope.organization_id, "Other synthetic workspace")
        .await
        .unwrap();
    let viewer = state
        .store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(scope.project_id),
            },
            "Synthetic reader",
            OperatorRole::Viewer,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let key = state
        .store
        .issue_key(scope, "Inference only", &["*".into()], 3600)
        .await
        .unwrap();
    let app = router(state.clone());
    let path = |target: niu_storage::TenantScope| {
        format!(
            "/admin/v1/organizations/{}/projects/{}/guardrails/input-preview",
            target.organization_id, target.project_id
        )
    };
    for (protocol, request, action, outcome, redacted) in [
        (
            "chat",
            json!({"messages":[{"role":"user","content":"fixture-private-secret"}]}),
            "block",
            "blocked",
            false,
        ),
        (
            "responses",
            json!({"instructions":"fixture-private-secret","input":"hello"}),
            "redact",
            "allowed",
            true,
        ),
        (
            "embeddings",
            json!({"input":["hello","fixture-private-secret"]}),
            "redact",
            "allowed",
            true,
        ),
        (
            "embeddings",
            json!({"input":[1,2]}),
            "block",
            "indeterminate",
            false,
        ),
    ] {
        let body = json!({"protocol":protocol,"rules":[{"pattern":"fixture-private-secret","action":action}],"request":request});
        let response = app
            .clone()
            .oneshot(
                Request::post(path(scope))
                    .header("authorization", format!("Bearer {}", viewer.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()["cache-control"], "no-store");
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        assert!(
            !std::str::from_utf8(&bytes)
                .unwrap()
                .contains("fixture-private-secret")
        );
        let result: Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(result["outcome"], outcome);
        assert_eq!(result["redacted"], redacted);
        assert_eq!(result["enforcement"], false);
        assert_eq!(result["synthetic"], true);
    }
    for (rule, status) in [
        (
            json!({"preset":"email_v1","action":"redact"}),
            StatusCode::OK,
        ),
        (
            json!({"preset":"email_v1","pattern":"x","action":"redact"}),
            StatusCode::BAD_REQUEST,
        ),
        (json!({"action":"redact"}), StatusCode::BAD_REQUEST),
        (
            json!({"preset":"unknown","action":"redact"}),
            StatusCode::BAD_REQUEST,
        ),
    ] {
        let response=app.clone().oneshot(Request::post(path(scope)).header("authorization",format!("Bearer {}",viewer.token)).header("content-type","application/json").body(axum::body::Body::from(json!({"protocol":"chat","rules":[rule],"request":{"messages":[{"role":"user","content":"fixture@example.test"}]}}).to_string())).unwrap()).await.unwrap();
        assert_eq!(response.status(), status);
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        assert!(
            !std::str::from_utf8(&bytes)
                .unwrap()
                .contains("fixture@example.test")
        );
        if status == StatusCode::OK {
            assert_eq!(
                serde_json::from_slice::<Value>(&bytes).unwrap()["redacted"],
                true
            );
        }
    }
    for body in [
        json!({"protocol":"fixture-private-secret","rules":[],"request":{}}),
        json!({"protocol":"chat","rules":[{"pattern":"x","action":"fixture-private-secret"}],"request":{}}),
        json!({"protocol":"chat","rules":[],"request":{},"fixture-private-secret":true}),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::post(path(scope))
                    .header("authorization", format!("Bearer {}", viewer.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        assert!(
            !std::str::from_utf8(&bytes)
                .unwrap()
                .contains("fixture-private-secret")
        );
    }
    for (token, target, pattern, status) in [
        (&key.token, scope, "x", StatusCode::UNAUTHORIZED),
        (&viewer.token, other, "x", StatusCode::FORBIDDEN),
        (&viewer.token, scope, "(", StatusCode::BAD_REQUEST),
    ] {
        let response=app.clone().oneshot(Request::post(path(target)).header("authorization",format!("Bearer {token}")).header("content-type","application/json").body(axum::body::Body::from(json!({"protocol":"chat","rules":[{"pattern":pattern,"action":"block"}],"request":{"messages":[{"role":"user","content":"fixture-private-secret"}]}}).to_string())).unwrap()).await.unwrap();
        assert_eq!(response.status(), status);
        assert!(
            !std::str::from_utf8(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap()
                .contains("fixture-private-secret")
        );
    }
    assert!(
        state
            .store
            .workspace_guardrail(scope)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        state
            .store
            .gateway_activity(scope, None, 100, &Default::default())
            .await
            .unwrap()
            .is_empty()
    );
    assert_eq!(state.requests.load(std::sync::atomic::Ordering::Relaxed), 0);
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn request_guardrail_attribution_requires_workspace_read_access(pool: PgPool) {
    use niu_storage::{OperatorAuditActor, OperatorRole, OperatorScope};
    let state = test_state(None, pool);
    let scope = state.store.default_workspace().await.unwrap();
    let other = state
        .store
        .create_project(scope.organization_id, "Other decision workspace")
        .await
        .unwrap();
    let viewer = state
        .store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(scope.project_id),
            },
            "Decision reader",
            OperatorRole::Viewer,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let key = state
        .store
        .issue_key(scope, "Decision client", &["*".into()], 3600)
        .await
        .unwrap();
    let principal = state.store.authenticate(&key.token).await.unwrap();
    let op = state.store.create_operation(scope, "fast").await.unwrap();
    let attempt = state
        .store
        .prepare_attempt(scope, op, "fast", "fixture")
        .await
        .unwrap();
    state
        .store
        .mark_dispatched(&principal, attempt)
        .await
        .unwrap();
    let app = router(state.clone());
    for (token, target, status) in [
        (&key.token, scope, StatusCode::UNAUTHORIZED),
        (&viewer.token, other, StatusCode::FORBIDDEN),
        (&viewer.token, scope, StatusCode::OK),
    ] {
        let path = format!(
            "/admin/v1/organizations/{}/projects/{}/requests/{attempt}/guardrails",
            target.organization_id, target.project_id
        );
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
        assert_eq!(response.status(), status);
        if status == StatusCode::OK {
            assert_eq!(response.headers()["cache-control"], "no-store");
            let bytes = response.into_body().collect().await.unwrap().to_bytes();
            let text = std::str::from_utf8(&bytes).unwrap();
            assert!(!text.contains(&key.token));
            assert!(!text.contains(&attempt.to_string()));
            assert!(!text.contains(&key.id.to_string()));
            let data: Value = serde_json::from_slice(&bytes).unwrap();
            assert_eq!(data["data"]["outcome"], "allowed");
            assert!(data["data"]["workspace_revision"].is_null());
            assert!(data["data"]["key_policy_revision"].is_null());
        }
    }
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn synthetic_output_preview_is_scoped_bounded_and_does_not_dispatch(pool: PgPool) {
    use niu_storage::{OperatorAuditActor, OperatorRole, OperatorScope};
    let state = test_state(None, pool.clone());
    let scope = state.store.default_workspace().await.unwrap();
    let other = state
        .store
        .create_project(scope.organization_id, "Other output preview workspace")
        .await
        .unwrap();
    let viewer = state
        .store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(scope.project_id),
            },
            "Output preview reader",
            OperatorRole::Viewer,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let key = state
        .store
        .issue_key(scope, "Inference only", &["*".into()], 3600)
        .await
        .unwrap();
    let app = router(state.clone());
    let path = |target: niu_storage::TenantScope| {
        format!(
            "/admin/v1/organizations/{}/projects/{}/guardrails/output-preview",
            target.organization_id, target.project_id
        )
    };
    let chat =
        json!({"choices":[{"message":{"role":"assistant","content":"fixture-private-secret"}}]});
    for (protocol, body, rules, outcome, reason, redacted) in [
        (
            "chat",
            chat.clone(),
            json!([{"pattern":"fixture-private-secret","action":"block"}]),
            "blocked",
            "pattern_denial",
            false,
        ),
        (
            "chat",
            chat.clone(),
            json!([{"pattern":"fixture-private-secret","action":"redact"}]),
            "allowed",
            "inspected_text",
            true,
        ),
        (
            "chat",
            chat.clone(),
            json!([{"pattern":"absent","action":"block"}]),
            "allowed",
            "inspected_text",
            false,
        ),
        (
            "responses",
            json!({"output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"fixture@example.test","annotations":[]}]}]}),
            json!([{"preset":"email_v1","action":"redact"}]),
            "allowed",
            "inspected_text",
            true,
        ),
        (
            "responses",
            json!({"output":[{"type":"message","role":"assistant","content":[{"type":"refusal","refusal":"fixture-private-secret"}]}]}),
            json!([{"pattern":"fixture-private-secret","action":"block"}]),
            "blocked",
            "pattern_denial",
            false,
        ),
        (
            "responses",
            json!({"output":[{"type":"reasoning","summary":[{"type":"summary_text","text":"fixture-private-secret"}]},{"type":"message","role":"assistant","content":[{"type":"output_text","text":"ordinary"}]}]}),
            json!([{"pattern":"fixture-private-secret","action":"redact"}]),
            "allowed",
            "inspected_text",
            true,
        ),
        (
            "chat",
            json!({"choices":[{"message":{"role":"assistant","content":"safe","tool_calls":[]}}]}),
            json!([{"pattern":"absent","action":"block"}]),
            "indeterminate",
            "unsupported_content",
            false,
        ),
        (
            "chat",
            json!({"choices":[{"message":{"role":"assistant","content":"x".repeat(150_000)}}]}),
            json!([{"pattern":"x","action":"redact"}]),
            "indeterminate",
            "resource_limit",
            false,
        ),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::post(path(scope))
                    .header("authorization", format!("Bearer {}", viewer.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(
                        json!({"protocol":protocol,"rules":rules,"response":body}).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()["cache-control"], "no-store");
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        let text = std::str::from_utf8(&bytes).unwrap();
        assert!(!text.contains("fixture-private-secret") && !text.contains("fixture@example.test"));
        assert_eq!(
            serde_json::from_slice::<Value>(&bytes).unwrap(),
            json!({"outcome":outcome,"reason":reason,"redacted":redacted,"synthetic":true,"enforcement":false,"mode":"buffered_full","coverage":"local_text"})
        );
    }
    for (action, pattern, expected) in [
        ("block", "fixture-private-secret", "matched"),
        ("redact", "fixture-private-secret", "matched"),
        ("block", "absent", "clear"),
    ] {
        let response = app.clone().oneshot(Request::post(path(scope)).header("authorization", format!("Bearer {}", viewer.token)).header("content-type", "application/json").body(axum::body::Body::from(json!({"mode":"observe_only","protocol":"chat","rules":[{"pattern":pattern,"action":action}],"response":chat}).to_string())).unwrap()).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        let preview: Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(preview["mode"], "observe_only");
        assert_eq!(preview["outcome"], expected);
        assert_eq!(preview["redacted"], false);
        assert_eq!(preview["enforcement"], false);
        assert!(!String::from_utf8_lossy(&bytes).contains("fixture-private-secret"));
    }
    for (credential, target, body, expected) in [
        (
            key.token.as_str(),
            scope,
            json!({}),
            StatusCode::UNAUTHORIZED,
        ),
        (
            viewer.token.as_str(),
            other,
            json!({}),
            StatusCode::FORBIDDEN,
        ),
        (
            viewer.token.as_str(),
            scope,
            json!({"protocol":"chat","rules":[],"response":chat}),
            StatusCode::BAD_REQUEST,
        ),
        (
            viewer.token.as_str(),
            scope,
            json!({"protocol":"embeddings","rules":[{"pattern":"x","action":"block"}],"response":{}}),
            StatusCode::BAD_REQUEST,
        ),
        (
            viewer.token.as_str(),
            scope,
            json!({"protocol":"chat","rules":[{"pattern":"[fixture-private-secret","action":"block"}],"response":chat}),
            StatusCode::BAD_REQUEST,
        ),
        (
            viewer.token.as_str(),
            scope,
            json!({"protocol":"chat","rules":vec![json!({"pattern":"x","action":"block"});33],"response":chat}),
            StatusCode::BAD_REQUEST,
        ),
        (
            viewer.token.as_str(),
            scope,
            json!({"protocol":"chat","rules":[],"response":chat,"fixture-private-secret":true}),
            StatusCode::BAD_REQUEST,
        ),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::post(path(target))
                    .header("authorization", format!("Bearer {credential}"))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        assert!(!String::from_utf8_lossy(&bytes).contains("fixture-private-secret"));
    }
    assert!(
        state
            .store
            .workspace_guardrail(scope)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        state
            .store
            .gateway_activity(scope, None, 100, &Default::default())
            .await
            .unwrap()
            .is_empty()
    );
    let decisions: i64 = sqlx::query_scalar("SELECT count(*) FROM output_guardrail_decisions")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(decisions, 0);
    assert_eq!(state.requests.load(std::sync::atomic::Ordering::Relaxed), 0);
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn dispatch_denial_reads_are_scoped_and_content_free(pool: PgPool) {
    use niu_storage::{OperatorAuditActor, OperatorRole, OperatorScope};
    let state = test_state(None, pool);
    let scope = state.store.default_workspace().await.unwrap();
    let other = state
        .store
        .create_project(scope.organization_id, "Other denial workspace")
        .await
        .unwrap();
    let reader = state
        .store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(scope.project_id),
            },
            "Denial reader",
            OperatorRole::Viewer,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let key = state
        .store
        .issue_key(scope, "Named API key", &["*".into()], 3600)
        .await
        .unwrap();
    let principal = state.store.authenticate(&key.token).await.unwrap();
    let operation = state.store.create_operation(scope, "fast").await.unwrap();
    let attempt = state
        .store
        .prepare_attempt(scope, operation, "fast", "fixture")
        .await
        .unwrap();
    state.store.activate_workspace_guardrail(scope, 0, &json!({"schema_version":1,"name":"Mandatory access","models":{"mode":"deny_all"},"providers":{"mode":"inherit"}})).await.unwrap();
    assert!(matches!(
        state.store.mark_dispatched(&principal, attempt).await,
        Err(niu_storage::StoreError::Conflict)
    ));
    assert!(
        state
            .store
            .guardrail_dispatch_denials(other)
            .await
            .unwrap()
            .is_empty()
    );
    let app = router(state.clone());
    for (token, target, expected) in [
        (&key.token, scope, StatusCode::UNAUTHORIZED),
        (&reader.token, other, StatusCode::FORBIDDEN),
        (&reader.token, scope, StatusCode::OK),
    ] {
        let path = format!(
            "/admin/v1/organizations/{}/projects/{}/guardrails/dispatch-denials",
            target.organization_id, target.project_id
        );
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
        assert_eq!(response.status(), expected);
        if expected == StatusCode::OK {
            assert_eq!(response.headers()["cache-control"], "no-store");
            let body: Value =
                serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                    .unwrap();
            assert_eq!(body["coverage"], "latest_100_dispatch_policy_exceptions");
            assert_eq!(body["data"][0]["key_name"], "Named API key");
            assert_eq!(body["data"][0]["workspace_policy_name"], "Mandatory access");
            assert_eq!(body["data"][0]["reason"], "access_denied");
            assert_eq!(body["data"][0]["workspace_revision"], 1);
            let text = body.to_string();
            for private in [
                key.id.to_string(),
                attempt.to_string(),
                reader.operator_id.to_string(),
                key.token.clone(),
                reader.token.clone(),
            ] {
                assert!(!text.contains(&private));
            }
            assert!(body["data"][0].get("policy").is_none());
        }
    }
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn customer_onboarding_provisions_shared_zero_credit_balance(pool: sqlx::PgPool) {
    let state = test_state(None, pool.clone());
    let app = router(state.clone());
    let original_count: i64 = sqlx::query_scalar("SELECT count(*) FROM organizations")
        .fetch_one(&pool)
        .await
        .unwrap();
    for currency in [
        json!("cny"),
        json!("CN"),
        json!("CNY "),
        json!(null),
        json!(123),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::post("/admin/v1/organizations")
                    .header(
                        "authorization",
                        "Bearer niu-test-admin-token-that-is-long-1234",
                    )
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(
                        json!({"name":"Invalid currency company","currency":currency}).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert!(response.status().is_client_error());
    }
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM organizations")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(
        count, original_count,
        "Invalid currency must not create a company"
    );
    for (path, body, field, currency) in [
        (
            "/admin/v1/organizations",
            json!({"name":"New prepaid company"}),
            "id",
            "USD",
        ),
        (
            "/admin/v1/workspaces",
            json!({"name":"New personal workspace"}),
            "organization_id",
            "USD",
        ),
        (
            "/admin/v1/setup/default-workspace",
            json!({}),
            "organization_id",
            "USD",
        ),
        (
            "/admin/v1/organizations",
            json!({"name":"Domestic prepaid company","currency":"CNY"}),
            "id",
            "CNY",
        ),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::post(path)
                    .header(
                        "authorization",
                        "Bearer niu-test-admin-token-that-is-long-1234",
                    )
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(
            response.status(),
            if path.contains("setup/") {
                StatusCode::OK
            } else {
                StatusCode::CREATED
            }
        );
        let result: Value =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        let organization: uuid::Uuid = result[field].as_str().unwrap().parse().unwrap();
        let balances = state
            .store
            .customer_balance_summary(organization)
            .await
            .unwrap();
        assert_eq!(balances.len(), 1);
        assert_eq!(balances[0]["currency"], currency);
        assert_eq!(balances[0]["balance_nanos"], "0");
        assert_eq!(balances[0]["credit_limit_nanos"], "0");
        assert!(
            state
                .store
                .customer_balance_enabled(organization)
                .await
                .unwrap()
        );
    }
}

#[tokio::test]
async fn external_detector_preview_requires_installation_auth_and_explicit_consent() {
    let mut state = test_state(
        None,
        sqlx::postgres::PgPoolOptions::new()
            .connect_lazy("postgres://localhost/unused")
            .unwrap(),
    );
    let config = crate::guardrails::detector::Config {
        authorized_workspaces: Vec::new(),
        cost_mode: crate::guardrails::detector::CostMode::Unknown,
        endpoint: "http://127.0.0.1:1/detect".into(),
        api_key_env: "NIU_UNCONFIGURED_TEST_DETECTOR_CREDENTIAL".into(),
        revision: "fixture-v1".into(),
        recipient: "Local fixture".into(),
        region: "Local".into(),
        retention: "None".into(),
        timeout_ms: 100,
        concurrency: 1,
        max_text_bytes: 32,
    };
    let fingerprint = config.fingerprint();
    state.detectors = std::sync::Arc::new(std::collections::HashMap::from([(
        "fixture".into(),
        crate::guardrails::detector::Runtime::new(config),
    )]));
    let app = router(state);
    for authenticated in [false, true] {
        let mut request = Request::get("/admin/v1/guardrails/detectors/fixture");
        if authenticated {
            request = request.header(
                "authorization",
                "Bearer niu-test-admin-token-that-is-long-1234",
            );
        }
        let response = app
            .clone()
            .oneshot(request.body(axum::body::Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(
            response.status(),
            if authenticated {
                StatusCode::OK
            } else {
                StatusCode::UNAUTHORIZED
            }
        );
        if authenticated {
            assert_eq!(response.headers()["cache-control"], "no-store");
            let body = axum::body::to_bytes(response.into_body(), 4096)
                .await
                .unwrap();
            let description: Value = serde_json::from_slice(&body).unwrap();
            assert_eq!(description["configuration_fingerprint"], fingerprint);
            assert_eq!(description["recipient"], "Local fixture");
            assert_eq!(description["processing_guarantees"], "declared_unverified");
            assert_eq!(description["external_charge"], "unknown");
            assert_eq!(description["policy_activation"], false);
            assert!(description.get("endpoint").is_none());
            assert!(description.get("api_key_env").is_none());
        }
    }
    for (auth, consent, pin, expected) in [
        (false, true, fingerprint.as_str(), StatusCode::UNAUTHORIZED),
        (true, false, fingerprint.as_str(), StatusCode::BAD_REQUEST),
        (true, true, fingerprint.as_str(), StatusCode::OK),
        (
            true,
            true,
            "stale-or-forged-fingerprint",
            StatusCode::BAD_REQUEST,
        ),
    ] {
        let mut request = Request::post("/admin/v1/guardrails/detectors/fixture/preview")
            .header("content-type", "application/json");
        if auth {
            request = request.header(
                "authorization",
                "Bearer niu-test-admin-token-that-is-long-1234",
            );
        }
        let response = app
            .clone()
            .oneshot(
                request
                    .body(axum::body::Body::from(
                        json!({"text":"synthetic", "consent_to_external_processing":consent,"configuration_fingerprint":pin})
                            .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
        if expected == StatusCode::OK {
            assert_eq!(response.headers()["cache-control"], "no-store");
            let body = axum::body::to_bytes(response.into_body(), 4096)
                .await
                .unwrap();
            let result: Value = serde_json::from_slice(&body).unwrap();
            assert_eq!(
                result,
                json!({"outcome":"indeterminate", "reason":"credential_unavailable", "synthetic":true,"enforcement":false})
            );
        }
    }
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn external_detector_installation_boundary_rejects_workspace_roles_and_inference_keys(
    pool: PgPool,
) {
    use niu_storage::{OperatorAuditActor, OperatorRole, OperatorScope};
    let state = test_state(None, pool);
    let scope = state.store.default_workspace().await.unwrap();
    for role in [
        OperatorRole::Viewer,
        OperatorRole::Admin,
        OperatorRole::Owner,
    ] {
        let identity = state
            .store
            .create_operator(
                OperatorScope {
                    organization_id: scope.organization_id,
                    project_id: Some(scope.project_id),
                },
                "Detector boundary fixture",
                role,
                3600,
                OperatorAuditActor::Installation,
            )
            .await
            .unwrap();
        for path in [
            "/admin/v1/guardrails/detectors/missing",
            "/admin/v1/guardrails/detectors/missing/preview",
        ] {
            let request = if path.ends_with("preview") {
                Request::post(path)
            } else {
                Request::get(path)
            };
            let response = router(state.clone()).oneshot(request.header("authorization", format!("Bearer {}", identity.token)).header("content-type", "application/json").body(axum::body::Body::from(r#"{"text":"synthetic","consent_to_external_processing":true,"configuration_fingerprint":"stale"}"#)).unwrap()).await.unwrap();
            assert_eq!(response.status(), StatusCode::FORBIDDEN);
        }
    }
    let key = state
        .store
        .issue_key(scope, "Detector inference boundary", &["*".into()], 3600)
        .await
        .unwrap();
    let response = router(state)
        .oneshot(
            Request::get("/admin/v1/guardrails/detectors/missing")
                .header("authorization", format!("Bearer {}", key.token))
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn required_input_detector_denies_before_inference_and_binds_clear_receipts(pool: PgPool) {
    use std::sync::atomic::{AtomicUsize, Ordering};
    let inference_calls = Arc::new(AtomicUsize::new(0));
    let detector_calls = Arc::new(AtomicUsize::new(0));
    let verdict = Arc::new(Mutex::new("matched".to_owned()));
    let calls = inference_calls.clone();
    let response_calls = inference_calls.clone();
    let embedding_calls = inference_calls.clone();
    let inspected = detector_calls.clone();
    let detector_verdict = verdict.clone();
    let upstream = Router::new()
        .route("/v1/chat/completions", post(move |Json(body): Json<Value>| { let calls = calls.clone(); async move {
            assert_eq!(body["messages"][0]["content"], "[REDACTED] private fixture 🐂");
            assert!(!body.to_string().contains("synthetic"));
            calls.fetch_add(1, Ordering::SeqCst);
            Json(json!({"id":"fixture","model":"fixture-model","choices":[{"index":0,"message":{"role":"assistant","content":"ok"},"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"completion_tokens":1,"total_tokens":3}}))
        }}))
        .route("/v1/responses", post(move |Json(body): Json<Value>| { let calls = response_calls.clone(); async move {
            assert_eq!(body["input"], "[REDACTED] private fixture 🐂");
            assert!(!body.to_string().contains("synthetic"));
            calls.fetch_add(1, Ordering::SeqCst);
            Json(json!({"id":"fixture","object":"response","status":"completed","model":"fixture-model","output":[{"id":"message","type":"message","status":"completed","role":"assistant","content":[{"type":"output_text","text":"ok","annotations":[]}]}],"usage":{"input_tokens":2,"output_tokens":1,"total_tokens":3}}))
        }}))
        .route("/v1/embeddings", post(move |Json(body): Json<Value>| { let calls = embedding_calls.clone(); async move {
            assert_eq!(body["input"], "[REDACTED] private fixture 🐂");
            assert!(!body.to_string().contains("synthetic"));
            calls.fetch_add(1, Ordering::SeqCst);
            Json(json!({"object":"list","model":"fixture-model","data":[{"object":"embedding","index":0,"embedding":[0.1,0.2]}],"usage":{"prompt_tokens":2,"total_tokens":2}}))
        }}))
        .route("/detect", post(move |headers: HeaderMap, Json(body): Json<Value>| { let inspected = inspected.clone(); let verdict = detector_verdict.clone(); async move {
            let expected_auth = format!("Bearer {}", std::env::var("PATH").unwrap());
            assert!(headers["authorization"].as_bytes() == expected_auth.as_bytes(), "detector must receive only its configured credential");
            for header in ["cookie", "x-api-key", "api-key", "openai-organization"] {
                assert!(!headers.contains_key(header), "caller header reached detector: {header}");
            }
            assert_eq!(body, json!({"schema_version":1,"detector_revision":"fixture-v1","text":"[REDACTED] private fixture 🐂"}));
            inspected.fetch_add(1, Ordering::SeqCst);
            let mode = verdict.lock().unwrap().clone();
            if mode == "timeout" {
                tokio::time::sleep(std::time::Duration::from_millis(750)).await;
            }
            if mode == "service_failure" {
                return axum::response::IntoResponse::into_response((StatusCode::SERVICE_UNAVAILABLE, "private service diagnostics"));
            }
            if mode == "response_limit" {
                return axum::response::IntoResponse::into_response("private".repeat(600));
            }
            axum::response::IntoResponse::into_response(Json(json!({"schema_version":1,"detector_revision":"fixture-v1","verdict":mode})))
        }}));
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let task = tokio::spawn(async move {
        axum::serve(listener, upstream).await.unwrap();
    });
    let mut state = test_state(Some(format!("http://{address}/v1")), pool.clone());
    Arc::make_mut(&mut state.config)
        .models
        .get_mut("fast")
        .unwrap()
        .supports_responses = true;
    let scope = state.store.default_workspace().await.unwrap();
    let config = crate::guardrails::detector::Config {
        authorized_workspaces: vec![scope.project_id],
        cost_mode: crate::guardrails::detector::CostMode::DeclaredUnmetered,
        endpoint: format!("http://{address}/detect"),
        api_key_env: "PATH".into(),
        revision: "fixture-v1".into(),
        recipient: "Local fixture".into(),
        region: "Local".into(),
        retention: "None".into(),
        timeout_ms: 500,
        concurrency: 1,
        max_text_bytes: 1024,
    };
    let fingerprint = config.fingerprint();
    state.detectors = Arc::new(HashMap::from([(
        "fixture".into(),
        crate::guardrails::detector::Runtime::new(config),
    )]));
    let key = state
        .store
        .issue_key(scope, "Detector test key", &["fast".into()], 3600)
        .await
        .unwrap();
    let policy = json!({"schema_version":1,"name":"Required detector","input_rules":[{"pattern":"synthetic","action":"redact"}],"models":{"mode":"inherit"},"providers":{"mode":"inherit"},"input_detectors":[{"detector":"fixture","configuration_fingerprint":fingerprint,"consent_to_external_processing":true}]});
    let app = router(state.clone());
    let activation = app
        .clone()
        .oneshot(
            Request::put(format!(
                "/admin/v1/organizations/{}/projects/{}/guardrails",
                scope.organization_id, scope.project_id
            ))
            .header(
                "authorization",
                "Bearer niu-test-admin-token-that-is-long-1234",
            )
            .header("content-type", "application/json")
            .body(axum::body::Body::from(
                json!({"expected_revision":0,"policy":policy}).to_string(),
            ))
            .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(activation.status(), StatusCode::OK);
    let requests = [
        (
            "/v1/chat/completions",
            json!({"model":"fast","messages":[{"role":"user","content":"synthetic private fixture 🐂"}]}),
        ),
        (
            "/v1/responses",
            json!({"model":"fast","input":"synthetic private fixture 🐂"}),
        ),
        (
            "/v1/embeddings",
            json!({"model":"fast","input":"synthetic private fixture 🐂"}),
        ),
    ];
    // Unsupported content must fail before either external recipient sees it,
    // including requests that ask for a streaming model response.
    for (path, request_body) in [
        (
            "/v1/chat/completions",
            json!({"model":"fast","stream":true,"messages":[{"role":"user","content":"synthetic private fixture 🐂"}],"tools":[{"type":"function","function":{"name":"private_tool","parameters":{"type":"object"}}}]}),
        ),
        (
            "/v1/chat/completions",
            json!({"model":"fast","messages":[{"role":"user","content":[{"type":"text","text":"synthetic private fixture 🐂"},{"type":"image_url","image_url":{"url":"https://example.invalid/private-image"}}]}]}),
        ),
        (
            "/v1/responses",
            json!({"model":"fast","stream":true,"input":"synthetic private fixture 🐂","previous_response_id":"private-state-reference"}),
        ),
        (
            "/v1/responses",
            json!({"model":"fast","input":"synthetic private fixture 🐂","tools":[{"type":"function","name":"private_tool","parameters":{"type":"object"}}]}),
        ),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::post(path)
                    .header("authorization", format!("Bearer {}", key.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(request_body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN, "{path}");
        let body = axum::body::to_bytes(response.into_body(), 16_384)
            .await
            .unwrap();
        for private in [
            "synthetic",
            "private_tool",
            "private-image",
            "private-state-reference",
        ] {
            assert!(!String::from_utf8_lossy(&body).contains(private));
        }
        assert_eq!(detector_calls.load(Ordering::SeqCst), 0);
        assert_eq!(inference_calls.load(Ordering::SeqCst), 0);
    }
    let pre_egress_attempts: i64 =
        sqlx::query_scalar("SELECT count(*) FROM attempts WHERE project_id=$1")
            .bind(scope.project_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(pre_egress_attempts, 0);
    for (protocol_index, (path, request_body)) in requests.iter().enumerate() {
        for (mode, expected, calls) in [
            ("matched", StatusCode::FORBIDDEN, 0),
            ("forged", StatusCode::FORBIDDEN, 0),
            ("service_failure", StatusCode::FORBIDDEN, 0),
            ("timeout", StatusCode::FORBIDDEN, 0),
            ("response_limit", StatusCode::FORBIDDEN, 0),
            ("clear", StatusCode::OK, 1),
        ] {
            *verdict.lock().unwrap() = mode.into();
            let response = app
                .clone()
                .oneshot(
                    Request::post(*path)
                        .header("authorization", format!("Bearer {}", key.token))
                        .header("content-type", "application/json")
                        .header("cookie", "caller-session=private-fixture")
                        .header("x-api-key", "caller-api-key-fixture")
                        .header("api-key", "caller-api-key-fixture")
                        .header("openai-organization", "caller-organization-fixture")
                        .body(axum::body::Body::from(request_body.to_string()))
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), expected, "{mode}");
            let body = axum::body::to_bytes(response.into_body(), 16_384)
                .await
                .unwrap();
            assert!(!String::from_utf8_lossy(&body).contains("private service diagnostics"));
            assert!(!String::from_utf8_lossy(&body).contains("synthetic private fixture"));
            assert_eq!(
                inference_calls.load(Ordering::SeqCst),
                protocol_index + calls,
                "{path}: {mode}"
            );
        }
    }
    assert_eq!(detector_calls.load(Ordering::SeqCst), 18);
    let receipts: Vec<Value> = sqlx::query_scalar("SELECT jsonb_build_object('outcome',outcome,'reason',reason,'fingerprint',configuration_fingerprint) FROM input_detector_decisions ORDER BY recorded_at").fetch_all(&pool).await.unwrap();
    assert_eq!(receipts.len(), 18);
    let (groups, remainder) = receipts.as_chunks::<6>();
    assert!(remainder.is_empty());
    for receipts in groups {
        assert_eq!(receipts[0]["outcome"], "matched");
        assert_eq!(receipts[1]["reason"], "invalid_response");
        assert_eq!(receipts[2]["reason"], "service_failure");
        assert_eq!(receipts[3]["reason"], "timeout");
        assert_eq!(receipts[4]["reason"], "response_limit");
        assert_eq!(receipts[5]["outcome"], "clear");
    }
    let attempts: i64 = sqlx::query_scalar("SELECT count(*) FROM attempts WHERE project_id=$1")
        .bind(scope.project_id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(
        attempts, 3,
        "detector failures must not create model attempts"
    );
    let bound: i64 = sqlx::query_scalar("SELECT count(*) FROM inspected_guardrail_bindings WHERE cardinality(input_detector_decision_ids)=1").fetch_one(&pool).await.unwrap();
    assert_eq!(bound, 3);
    assert!(
        sqlx::query("UPDATE input_detector_decisions SET outcome='clear'")
            .execute(&pool)
            .await
            .is_err()
    );
    let principal = state.store.authenticate(&key.token).await.unwrap();
    let (_, missing_receipt_attempt) = state
        .store
        .prepare_gateway_attempt(scope, "fast", None, "fixture")
        .await
        .unwrap();
    state
        .store
        .set_attempt_dispatch_provider(scope, missing_receipt_attempt, "openai")
        .await
        .unwrap();
    assert!(
        state
            .store
            .mark_dispatched(&principal, missing_receipt_attempt)
            .await
            .is_err()
    );
    let execution: String = sqlx::query_scalar("SELECT execution::text FROM attempts WHERE id=$1")
        .bind(missing_receipt_attempt)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(execution, "not_sent");
    let audit = state.store.input_detector_decisions(scope).await.unwrap();
    assert_eq!(audit.len(), 18);
    let serialized = serde_json::to_string(&audit).unwrap();
    assert!(!serialized.contains("synthetic private fixture"));
    assert!(!serialized.contains("127.0.0.1"));
    assert!(!serialized.contains(&key.token));
    assert!(
        audit
            .iter()
            .all(|entry| entry.get("id").is_none() && entry.get("key_id").is_none())
    );
    let foreign = state
        .store
        .create_project(scope.organization_id, "Foreign detector fixture")
        .await
        .unwrap();
    assert!(
        state
            .store
            .input_detector_decisions(foreign)
            .await
            .unwrap()
            .is_empty()
    );
    let viewer = state
        .store
        .create_operator(
            niu_storage::OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(scope.project_id),
            },
            "Detector audit reader",
            niu_storage::OperatorRole::Viewer,
            3600,
            niu_storage::OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    for (target, status) in [(scope, StatusCode::OK), (foreign, StatusCode::FORBIDDEN)] {
        let response = app
            .clone()
            .oneshot(
                Request::get(format!(
                    "/admin/v1/organizations/{}/projects/{}/guardrails/detector-decisions",
                    target.organization_id, target.project_id
                ))
                .header("authorization", format!("Bearer {}", viewer.token))
                .body(axum::body::Body::empty())
                .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), status);
        if status == StatusCode::OK {
            assert_eq!(response.headers()["cache-control"], "no-store");
            let body = axum::body::to_bytes(response.into_body(), 16_384)
                .await
                .unwrap();
            let data: Value = serde_json::from_slice(&body).unwrap();
            assert_eq!(data["coverage"], "latest_100_input_detector_decisions");
            assert_eq!(data["data"].as_array().unwrap().len(), 18);
            assert!(!String::from_utf8_lossy(&body).contains("synthetic private fixture"));
        }
    }
    let response = app
        .clone()
        .oneshot(
            Request::get(format!(
                "/admin/v1/organizations/{}/projects/{}/guardrails/detectors",
                scope.organization_id, scope.project_id
            ))
            .header("authorization", format!("Bearer {}", viewer.token))
            .body(axum::body::Body::empty())
            .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = axum::body::to_bytes(response.into_body(), 8192)
        .await
        .unwrap();
    let description: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(description["data"].as_array().unwrap().len(), 1);
    assert_eq!(description["data"][0]["recipient"], "Local fixture");
    assert_eq!(
        description["data"][0]["content_sent"],
        "request_text_after_local_redaction"
    );
    assert!(description["data"][0].get("endpoint").is_none());
    assert!(description["data"][0].get("api_key_env").is_none());
    let other_org = state
        .store
        .create_organization("Foreign detector organization")
        .await
        .unwrap();
    let org_owner = state
        .store
        .create_operator(
            niu_storage::OperatorScope {
                organization_id: other_org,
                project_id: None,
            },
            "Foreign organization owner",
            niu_storage::OperatorRole::Owner,
            3600,
            niu_storage::OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let response = app
        .clone()
        .oneshot(
            Request::get(format!(
                "/admin/v1/organizations/{}/projects/{}/guardrails/detectors",
                other_org, scope.project_id
            ))
            .header("authorization", format!("Bearer {}", org_owner.token))
            .body(axum::body::Body::empty())
            .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    sqlx::query("CREATE FUNCTION fixture_reject_detector_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'private receipt storage failure' USING ERRCODE='XX000'; END; $$")
        .execute(&pool).await.unwrap();
    sqlx::query("CREATE TRIGGER fixture_detector_receipt_failure BEFORE INSERT ON input_detector_decisions FOR EACH ROW EXECUTE FUNCTION fixture_reject_detector_receipt()")
        .execute(&pool).await.unwrap();
    let attempts_before: i64 = sqlx::query_scalar("SELECT count(*) FROM attempts")
        .fetch_one(&pool)
        .await
        .unwrap();
    let response = app.clone().oneshot(Request::post("/v1/chat/completions")
        .header("authorization", format!("Bearer {}", key.token))
        .header("content-type", "application/json")
        .body(axum::body::Body::from(json!({"model":"fast","messages":[{"role":"user","content":"synthetic private fixture 🐂"}]}).to_string())).unwrap())
        .await.unwrap();
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    let body = axum::body::to_bytes(response.into_body(), 16_384)
        .await
        .unwrap();
    let error: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(error["error"]["type"], "storage_error");
    assert!(!String::from_utf8_lossy(&body).contains("private receipt storage failure"));
    assert!(!String::from_utf8_lossy(&body).contains("synthetic private fixture"));
    assert_eq!(inference_calls.load(Ordering::SeqCst), 3);
    let attempts_after: i64 = sqlx::query_scalar("SELECT count(*) FROM attempts")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(attempts_after, attempts_before);
    assert_eq!(
        state
            .store
            .input_detector_decisions(scope)
            .await
            .unwrap()
            .len(),
        18
    );
    sqlx::query("DROP TRIGGER fixture_detector_receipt_failure ON input_detector_decisions")
        .execute(&pool)
        .await
        .unwrap();
    task.abort();
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn customer_workspace_spending_management_requires_owner_and_scope(pool: PgPool) {
    niu_storage::MIGRATOR.run(&pool).await.unwrap();
    let state = test_state(None, pool.clone());
    let scope = state.store.default_workspace().await.unwrap();
    state
        .store
        .record_settled_customer_funding(scope.organization_id, "CNY", 100, "fixture", "limit-api")
        .await
        .unwrap();
    let mut tokens = Vec::new();
    for role in [
        niu_storage::OperatorRole::Owner,
        niu_storage::OperatorRole::Admin,
        niu_storage::OperatorRole::Viewer,
    ] {
        tokens.push(
            state
                .store
                .create_operator(
                    niu_storage::OperatorScope {
                        organization_id: scope.organization_id,
                        project_id: Some(scope.project_id),
                    },
                    "Limit manager",
                    role,
                    3600,
                    niu_storage::OperatorAuditActor::Installation,
                )
                .await
                .unwrap()
                .token,
        );
    }
    let key = state
        .store
        .issue_key(scope, "Inference only", &["*".into()], 3600)
        .await
        .unwrap();
    let other = state
        .store
        .create_project(scope.organization_id, "Other limit workspace")
        .await
        .unwrap();
    let app = router(state.clone());
    let base = format!(
        "/admin/v1/organizations/{}/projects/{}/spending-limit/CNY",
        scope.organization_id, scope.project_id
    );
    async fn call(
        app: &Router,
        method: &str,
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
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        (
            status,
            serde_json::from_slice(&bytes).unwrap_or(Value::Null),
        )
    }
    for token in ["invalid", key.token.as_str()] {
        assert_eq!(
            call(&app, "GET", &base, token, Value::Null).await.0,
            StatusCode::UNAUTHORIZED
        );
    }
    for token in &tokens {
        assert!(call(&app, "GET", &base, token, Value::Null).await.1["data"].is_null());
    }
    let collection = base.strip_suffix("/CNY").unwrap();
    for token in ["invalid", key.token.as_str()] {
        assert_eq!(
            call(&app, "GET", collection, token, Value::Null).await.0,
            StatusCode::UNAUTHORIZED
        );
    }
    for token in &tokens {
        let (status, result) = call(&app, "GET", collection, token, Value::Null).await;
        assert_eq!(status, StatusCode::OK);
        let rows = result["data"].as_array().unwrap();
        let cny = rows.iter().find(|row| row["currency"] == "CNY").unwrap();
        assert_eq!(
            cny,
            &json!({"currency":"CNY","limit_nanos":null,"revision":null,"committed_nanos":"0"})
        );
        assert!(rows.iter().all(|row| row.as_object().unwrap().len() == 4));
    }
    let foreign_collection = format!(
        "/admin/v1/organizations/{}/projects/{}/spending-limit",
        scope.organization_id, other.project_id
    );
    assert_eq!(
        call(&app, "GET", &foreign_collection, &tokens[0], Value::Null)
            .await
            .0,
        StatusCode::NOT_FOUND
    );
    let input = json!({"limit_nanos":"50","expected_revision":"0"});
    for token in [&tokens[1], &tokens[2]] {
        assert_eq!(
            call(&app, "PUT", &base, token, input.clone()).await.0,
            StatusCode::FORBIDDEN
        );
    }
    let foreign = format!(
        "/admin/v1/organizations/{}/projects/{}/spending-limit/CNY",
        scope.organization_id, other.project_id
    );
    assert_eq!(
        call(&app, "PUT", &foreign, &tokens[0], input.clone())
            .await
            .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        call(&app, "GET", &foreign, &tokens[0], Value::Null).await.0,
        StatusCode::NOT_FOUND
    );
    for value in ["-1", "1e3", "1.0", " 1", "", "9223372036854775808"] {
        assert_eq!(
            call(
                &app,
                "PUT",
                &base,
                &tokens[0],
                json!({"limit_nanos":value,"expected_revision":"0"})
            )
            .await
            .0,
            StatusCode::BAD_REQUEST
        );
    }
    assert_eq!(
        call(&app, "PUT", &base, &tokens[0], input.clone()).await.0,
        StatusCode::OK
    );
    assert_eq!(
        call(&app, "PUT", &base, &tokens[0], input).await.0,
        StatusCode::CONFLICT
    );
    assert_eq!(
        call(
            &app,
            "PUT",
            &base,
            &tokens[0],
            json!({"limit_nanos":"60","expected_revision":"1"})
        )
        .await
        .0,
        StatusCode::OK
    );
    let (status, current) = call(&app, "GET", &base, &tokens[2], Value::Null).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(current["data"]["limit_nanos"], "60");
    assert_eq!(current["data"]["committed_nanos"], "0");
    let rows = call(&app, "GET", collection, &tokens[2], Value::Null)
        .await
        .1;
    assert_eq!(
        rows["data"]
            .as_array()
            .unwrap()
            .iter()
            .find(|row| row["currency"] == "CNY")
            .unwrap(),
        &current["data"]
    );
    sqlx::query("UPDATE admin_operators SET name='Renamed member' WHERE organization_id=$1 AND project_id=$2 AND role='owner'")
        .bind(scope.organization_id).bind(scope.project_id).execute(&pool).await.unwrap();
    let (status, page) = call(
        &app,
        "GET",
        &format!("{base}/history?limit=1"),
        &tokens[2],
        Value::Null,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(page["data"][0]["revision"], "2");
    assert_eq!(page["data"][0]["actor_kind"], "member");
    assert_eq!(page["data"][0]["actor_name"], "Limit manager");
    assert_eq!(page["next_before_revision"], "2");
    let page2 = call(
        &app,
        "GET",
        &format!("{base}/history?limit=1&before_revision=2"),
        &tokens[2],
        Value::Null,
    )
    .await
    .1;
    assert_eq!(page2["data"][0]["revision"], "1");
    for query in ["limit=0", "limit=101", "before_revision=0", "unknown=true"] {
        assert_eq!(
            call(
                &app,
                "GET",
                &format!("{base}/history?{query}"),
                &tokens[0],
                Value::Null
            )
            .await
            .0,
            StatusCode::BAD_REQUEST
        );
    }
    for value in [current, page, page2] {
        let serialized = value.to_string();
        assert!(!serialized.contains(&scope.organization_id.to_string()));
        assert!(!serialized.contains(&scope.project_id.to_string()));
        assert!(!serialized.contains("procurement"));
        assert!(!serialized.contains("account_id"));
        assert!(!serialized.contains("actor_member_id"));
    }
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn image_detector_discovery_is_scoped_and_does_not_enable_processing(pool: PgPool) {
    let mut state = test_state(None, pool);
    let organization = state
        .store
        .create_organization("Image inspection discovery")
        .await
        .unwrap();
    let scope = state
        .store
        .create_project(organization, "Image processing workspace")
        .await
        .unwrap();
    let foreign = state
        .store
        .create_project(organization, "Other workspace")
        .await
        .unwrap();
    let config:niu_media::image_detector::Config=serde_json::from_value(json!({
        "endpoint":"http://127.0.0.1:1/image-inspect","api_key_env":"NIU_IMAGE_DISCOVERY_UNUSED_KEY",
        "detector_revision":"fixture-v2","recipient":"Fixture image recipient","region":"Local fixture","retention":"No retention declared",
        "authorized_workspaces":[scope.project_id.to_string()],"declared_unmetered":true,"timeout_ms":100,
        "maximum_encoded_bytes":4096,"maximum_width":32,"maximum_height":32,"maximum_decoded_bytes":4096,"concurrency":1
    })).unwrap();
    state.image_detectors = Arc::new(std::collections::HashMap::from([(
        "fixture-image".into(),
        niu_media::image_detector::Runtime::new(config).unwrap(),
    )]));
    let viewer = state
        .store
        .create_operator(
            niu_storage::OperatorScope {
                organization_id: organization,
                project_id: Some(scope.project_id),
            },
            "Image discovery reader",
            niu_storage::OperatorRole::Viewer,
            3600,
            niu_storage::OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let app = router(state.clone());
    for (target, token, expected) in [
        (scope, None, StatusCode::UNAUTHORIZED),
        (scope, Some(viewer.token.as_str()), StatusCode::OK),
        (foreign, Some(viewer.token.as_str()), StatusCode::FORBIDDEN),
    ] {
        let mut request = Request::get(format!(
            "/admin/v1/organizations/{}/projects/{}/guardrails/image-detectors",
            target.organization_id, target.project_id
        ));
        if let Some(token) = token {
            request = request.header("authorization", format!("Bearer {token}"));
        }
        let response = app
            .clone()
            .oneshot(request.body(axum::body::Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
        if expected == StatusCode::OK {
            assert_eq!(response.headers()["cache-control"], "no-store");
            let bytes = axum::body::to_bytes(response.into_body(), 8192)
                .await
                .unwrap();
            let body: Value = serde_json::from_slice(&bytes).unwrap();
            assert_eq!(body["data"].as_array().unwrap().len(), 1);
            assert_eq!(body["data"][0]["schema_version"], 2);
            assert_eq!(body["data"][0]["policy_activation"], false);
            assert_eq!(body["data"][0]["content_sent"], "exact_encoded_image");
            let text = String::from_utf8(bytes.to_vec()).unwrap();
            for private in [
                "127.0.0.1",
                "NIU_IMAGE_DISCOVERY_UNUSED_KEY",
                &scope.project_id.to_string(),
                &viewer.token,
            ] {
                assert!(!text.contains(private));
            }
        }
    }
    let response = app
        .oneshot(
            Request::get(format!(
                "/admin/v1/organizations/{}/projects/{}/guardrails/image-detectors",
                organization, foreign.project_id
            ))
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
    let body: Value = serde_json::from_slice(
        &axum::body::to_bytes(response.into_body(), 8192)
            .await
            .unwrap(),
    )
    .unwrap();
    assert!(body["data"].as_array().unwrap().is_empty());
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL and isolated NIU_IMAGE_STORAGE_TEST_KEY"]
async fn image_detector_preview_requires_current_consent_and_workspace_write_access(pool: PgPool) {
    async fn call(
        app: &Router,
        method: &str,
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
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        (
            status,
            serde_json::from_slice(&bytes).unwrap_or(Value::Null),
        )
    }
    use base64::Engine;
    use std::sync::atomic::{AtomicUsize, Ordering};
    let mut state = test_state(None, pool.clone());
    let scope = state.store.default_workspace().await.unwrap();
    let foreign = state
        .store
        .create_project(scope.organization_id, "Foreign image preview")
        .await
        .unwrap();
    let calls = Arc::new(AtomicUsize::new(0));
    let mode = Arc::new(AtomicUsize::new(0));
    let observed = calls.clone();
    let reply_mode = mode.clone();
    let secret = std::env::var("NIU_IMAGE_STORAGE_TEST_KEY").expect("isolated detector credential");
    let service = axum::Router::new().route("/inspect", axum::routing::post(move |headers: HeaderMap, axum::Json(body): axum::Json<Value>| {
        let calls=observed.clone(); let mode=reply_mode.clone(); let secret=secret.clone();
        async move {
            assert_eq!(headers["authorization"], format!("Bearer {secret}"));
            calls.fetch_add(1, Ordering::SeqCst);
            axum::Json(json!({"schema_version":2,"detector_revision":body["detector_revision"],
                "content_sha256":if mode.load(Ordering::SeqCst)==2 {json!("mismatched")} else {body["content_sha256"].clone()},
                "verdict":if mode.load(Ordering::SeqCst)==1 {"matched"} else {"clear"}}))
        }
    }));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let task = tokio::spawn(async move { axum::serve(listener, service).await.unwrap() });
    let config:niu_media::image_detector::Config=serde_json::from_value(json!({
        "endpoint":format!("http://{address}/inspect"),"api_key_env":"NIU_IMAGE_STORAGE_TEST_KEY",
        "detector_revision":"fixture-v2","recipient":"Local fixture","region":"Local","retention":"None declared",
        "authorized_workspaces":[scope.project_id.to_string()],"declared_unmetered":true,"timeout_ms":1000,
        "maximum_encoded_bytes":4096,"maximum_width":32,"maximum_height":32,"maximum_decoded_bytes":4096,"concurrency":1
    })).unwrap();
    let runtime = niu_media::image_detector::Runtime::new(config.clone()).unwrap();
    let fingerprint = runtime.fingerprint().to_string();
    state.image_detectors = Arc::new(std::collections::HashMap::from([(
        "fixture-image".into(),
        runtime,
    )]));
    let mut image = std::io::Cursor::new(Vec::new());
    image::DynamicImage::new_rgb8(2, 2)
        .write_to(&mut image, image::ImageFormat::Png)
        .unwrap();
    let reference = format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(image.into_inner())
    );
    let viewer = state
        .store
        .create_operator(
            niu_storage::OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(scope.project_id),
            },
            "Image preview reader",
            niu_storage::OperatorRole::Viewer,
            3600,
            niu_storage::OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let app = router(state.clone());
    let path = |scope: niu_storage::TenantScope| {
        format!(
            "/admin/v1/organizations/{}/projects/{}/guardrails/image-detectors/fixture-image/preview",
            scope.organization_id, scope.project_id
        )
    };
    let body = json!({"consent":{"configuration_fingerprint":fingerprint,"consent_to_image_processing":true},"image":reference});
    let admin = "niu-test-admin-token-that-is-long-1234";
    assert_eq!(
        call(&app, "POST", &path(scope), &viewer.token, body.clone())
            .await
            .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        call(&app, "POST", &path(foreign), admin, body.clone())
            .await
            .0,
        StatusCode::BAD_REQUEST
    );
    for change in [
        json!({"configuration_fingerprint":fingerprint,"consent_to_image_processing":false}),
        json!({"configuration_fingerprint":"stale","consent_to_image_processing":true}),
    ] {
        let mut denied = body.clone();
        denied["consent"] = change;
        assert_eq!(
            call(&app, "POST", &path(scope), admin, denied).await.0,
            StatusCode::BAD_REQUEST
        );
    }
    let mut invalid = body.clone();
    invalid["image"] = json!("https://example.com/image.png");
    assert_eq!(
        call(&app, "POST", &path(scope), admin, invalid).await.0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(calls.load(Ordering::SeqCst), 0);
    for (value, outcome) in [(0, "clear"), (1, "matched"), (2, "indeterminate")] {
        mode.store(value, Ordering::SeqCst);
        let (status, result) = call(&app, "POST", &path(scope), admin, body.clone()).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(result["outcome"], outcome);
        assert_eq!(result["policy_activation"], false);
        assert_eq!(result["enforcement"], false);
        for private in [
            &reference,
            &fingerprint,
            &scope.project_id.to_string(),
            "NIU_IMAGE_STORAGE_TEST_KEY",
        ] {
            assert!(!result.to_string().contains(private));
        }
    }
    assert_eq!(calls.load(Ordering::SeqCst), 3);
    for table in [
        "image_processing_approvals",
        "image_request_bindings",
        "attempts",
        "customer_balance_entries",
    ] {
        let count: i64 = sqlx::query_scalar(&format!("SELECT count(*) FROM {table}"))
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(
            count, 0,
            "synthetic preview must not persist content, approvals or charges"
        );
    }
    let base = format!(
        "/admin/v1/organizations/{}/projects/{}/guardrails",
        scope.organization_id, scope.project_id
    );
    let policy = json!({"schema_version":1,"name":"Required image inspection","models":{"mode":"inherit"},"providers":{"mode":"inherit"},"image_detectors":[{"detector":"fixture-image","configuration_fingerprint":fingerprint,"consent_to_image_processing":true}]});
    let activation = json!({"expected_revision":0,"policy":policy});
    assert_eq!(
        call(&app, "PUT", &base, &viewer.token, activation.clone())
            .await
            .0,
        StatusCode::FORBIDDEN
    );
    let mut stale = activation.clone();
    stale["policy"]["image_detectors"][0]["configuration_fingerprint"] = json!("a".repeat(64));
    assert_eq!(
        call(&app, "PUT", &base, admin, stale).await.0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        call(&app, "PUT", &base, admin, activation.clone()).await.0,
        StatusCode::OK
    );
    assert_eq!(
        call(&app, "PUT", &base, admin, activation).await.0,
        StatusCode::CONFLICT
    );
    let mut rebuilt = test_state(None, pool.clone());
    rebuilt.image_detectors = Arc::new(std::collections::HashMap::from([(
        "fixture-image".into(),
        niu_media::image_detector::Runtime::new(config.clone()).unwrap(),
    )]));
    let restored = router(rebuilt.clone());
    let read = call(&restored, "GET", &base, &viewer.token, Value::Null).await;
    assert_eq!(read.0, StatusCode::OK);
    assert_eq!(
        read.1["data"]["policy"]["image_detectors"],
        policy["image_detectors"]
    );
    let key = state
        .store
        .issue_key(scope, "Image requirement key", &["fast".into()], 3600)
        .await
        .unwrap();
    let denied = call(
        &restored,
        "POST",
        "/v1/chat/completions",
        &key.token,
        json!({"model":"fast","messages":[{"role":"user","content":"Fixture text"}]}),
    )
    .await;
    assert_eq!(
        denied.0,
        StatusCode::FORBIDDEN,
        "unqualified image policy must deny before financial admission"
    );
    let attempts: i64 = sqlx::query_scalar("SELECT count(*) FROM attempts")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(attempts, 0);
    let mut withdrawn = policy.clone();
    withdrawn["image_detectors"] = json!([]);
    assert_eq!(
        call(
            &restored,
            "PUT",
            &base,
            admin,
            json!({"expected_revision":1,"policy":withdrawn})
        )
        .await
        .0,
        StatusCode::OK
    );
    let mut changed = config;
    changed.retention = "Changed processing conditions".into();
    rebuilt.image_detectors = Arc::new(std::collections::HashMap::from([(
        "fixture-image".into(),
        niu_media::image_detector::Runtime::new(changed).unwrap(),
    )]));
    let changed_app = router(rebuilt);
    assert_eq!(
        call(
            &changed_app,
            "POST",
            &format!("{base}/rollback"),
            admin,
            json!({"expected_revision":2,"target_revision":1})
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    let read = call(&changed_app, "GET", &base, admin, Value::Null).await.1;
    assert!(read["data"]["policy"].get("image_detectors").is_none());
    assert_eq!(
        calls.load(Ordering::SeqCst),
        3,
        "saving and revoking consent must not process content"
    );
    task.abort();
}
