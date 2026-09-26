use super::*;

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn execution_import_api_is_scoped_and_read_only(pool: sqlx::PgPool) {
    let state = test_state(None, pool.clone());
    let org = state.store.create_organization("imports").await.unwrap();
    let a = state.store.create_project(org, "a").await.unwrap();
    let b = state.store.create_project(org, "b").await.unwrap();
    let key = state
        .store
        .issue_key(a, "client", &["fast".into()], 3600)
        .await
        .unwrap();
    let app = router(state);
    let base = format!(
        "/admin/v1/organizations/{org}/projects/{}/execution-imports",
        a.project_id
    );
    let fixture = include_str!("../../../../../contracts/fixtures/parallel-task.v1.json");
    let mut id = None;
    for (auth, expected) in [
        (format!("Bearer {}", key.token), StatusCode::UNAUTHORIZED),
        (
            "Bearer niu-test-admin-token-that-is-long-1234".into(),
            StatusCode::CREATED,
        ),
        (
            "Bearer niu-test-admin-token-that-is-long-1234".into(),
            StatusCode::OK,
        ),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::post(&base)
                    .header("authorization", auth)
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(fixture))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
        if matches!(expected, StatusCode::CREATED | StatusCode::OK) {
            let body: Value =
                serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                    .unwrap();
            if let Some(ref previous) = id {
                assert_eq!(previous, &body["id"]);
            }
            id = Some(body["id"].clone());
        }
    }
    let id = id.unwrap();
    for (auth, expected) in [
        (format!("Bearer {}", key.token), StatusCode::UNAUTHORIZED),
        (
            "Bearer niu-test-admin-token-that-is-long-1234".into(),
            StatusCode::OK,
        ),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::get(format!("{base}?limit=1"))
                    .header("authorization", auth)
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
            assert_eq!(body["data"][0]["id"], id);
            assert_eq!(body["data"][0]["coverage"], "partial");
            assert!(body["data"][0].get("spans").is_none());
            assert!(body["next_cursor"].is_null());
        }
    }
    let path = format!("{base}/{}", id.as_str().unwrap());
    for (url, expected) in [
        (path.clone(), StatusCode::OK),
        (
            format!(
                "/admin/v1/organizations/{org}/projects/{}/execution-imports/{}",
                b.project_id,
                id.as_str().unwrap()
            ),
            StatusCode::NOT_FOUND,
        ),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::get(url)
                    .header(
                        "authorization",
                        "Bearer niu-test-admin-token-that-is-long-1234",
                    )
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
            assert_eq!(body["charges"]["entries"], json!([]));
            assert_eq!(
                body["charges"]["unresolved"],
                json!(["charge-1", "charge-2"])
            );
            assert_eq!(body["charges"]["task_total_complete"], false);
            assert_eq!(body["charges"]["attribution"], "imported_reference");
        }
    }
    let mut conflicting: Value = serde_json::from_str(fixture).unwrap();
    conflicting["coverage"] = json!("unknown");
    let response = app
        .clone()
        .oneshot(
            Request::post(&base)
                .header(
                    "authorization",
                    "Bearer niu-test-admin-token-that-is-long-1234",
                )
                .header("content-type", "application/json")
                .body(axum::body::Body::from(conflicting.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::CONFLICT);
    let response = app
        .clone()
        .oneshot(
            Request::delete(&path)
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
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    let attempts: i64 = sqlx::query_scalar("SELECT count(*) FROM attempts")
        .fetch_one(&pool)
        .await
        .unwrap();
    let charges: i64 = sqlx::query_scalar("SELECT count(*) FROM cost_entries")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!((attempts, charges), (0, 0));
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn execution_import_api_is_idempotent_scoped_and_deletable(pool: sqlx::PgPool) {
    let state = test_state(None, pool.clone());
    let organization = state
        .store
        .create_organization("observations")
        .await
        .unwrap();
    let scope = state
        .store
        .create_project(organization, "project")
        .await
        .unwrap();
    let other = state
        .store
        .create_project(organization, "other")
        .await
        .unwrap();
    let account = state
        .store
        .create_account(
            scope,
            &niu_storage::AccountInput {
                provider: "fixture".into(),
                plan: "subscription".into(),
                authentication_mode: niu_storage::AuthMode::OAuthRefresh,
                billing_mode: niu_storage::BillingMode::Subscription,
                credential_reference: "env:FIXTURE_ACCOUNT".into(),
                concurrency_limit: 2,
            },
        )
        .await
        .unwrap();
    state
        .store
        .set_account_health(scope, account, niu_storage::AccountHealth::Ready)
        .await
        .unwrap();
    let operation = state
        .store
        .create_operation(scope, "model-a")
        .await
        .unwrap();
    let attempt = state
        .store
        .prepare_account_attempt(scope, operation, "fixture-account", "v1", account)
        .await
        .unwrap();
    let base = format!(
        "/admin/v1/organizations/{}/projects/{}/executions",
        scope.organization_id, scope.project_id
    );
    let mut record: Value = serde_json::from_str(include_str!(
        "../../../../../contracts/fixtures/parallel-task.v1.json"
    ))
    .unwrap();
    for span in record["spans"].as_array_mut().unwrap() {
        if matches!(span["id"].as_str(), Some("model" | "attempt")) {
            span["charge_ref"] = json!(attempt.to_string());
        }
    }
    let app = router(state);
    let unauthorized = app
        .clone()
        .oneshot(Request::get(&base).body(axum::body::Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(unauthorized.status(), StatusCode::UNAUTHORIZED);

    let post = |body: Value| {
        Request::post(&base)
            .header(
                "authorization",
                "Bearer niu-test-admin-token-that-is-long-1234",
            )
            .header("content-type", "application/json")
            .body(axum::body::Body::from(body.to_string()))
            .unwrap()
    };
    let first = app.clone().oneshot(post(record.clone())).await.unwrap();
    assert_eq!(first.status(), StatusCode::CREATED);
    let first_body: Value =
        serde_json::from_slice(&first.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(first_body["created"], true);
    let id = first_body["id"].as_str().unwrap().to_owned();

    let mut second_record = record.clone();
    second_record["record_id"] = json!("parallel-fixture-2");
    let second = app.clone().oneshot(post(second_record)).await.unwrap();
    assert_eq!(second.status(), StatusCode::CREATED);

    let cohort_path = format!("{base}/cohort");
    let cohort_unauthorized = app
        .clone()
        .oneshot(
            Request::get(&cohort_path)
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(cohort_unauthorized.status(), StatusCode::UNAUTHORIZED);
    let cohort_response = app
        .clone()
        .oneshot(
            Request::get(&cohort_path)
                .header(
                    "authorization",
                    "Bearer niu-test-admin-token-that-is-long-1234",
                )
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(cohort_response.status(), StatusCode::OK);
    let cohort_body: Value = serde_json::from_slice(
        &cohort_response
            .into_body()
            .collect()
            .await
            .unwrap()
            .to_bytes(),
    )
    .unwrap();
    assert_eq!(cohort_body["data"]["records_scanned"], 2);
    assert_eq!(cohort_body["data"]["outcomes"]["conflicting"], 2);
    assert_eq!(
        cohort_body["data"]["cost_evidence"]["unique_charge_references"],
        2
    );
    assert_eq!(
        cohort_body["data"]["cost_evidence"]["unresolved_references"],
        1
    );
    assert_eq!(
        cohort_body["data"]["cost_evidence"]["attempts_without_cost_entries"],
        1
    );
    assert_eq!(cohort_body["data"]["cost_evidence"]["complete"], false);
    assert_eq!(cohort_body["data"]["invoice_cash"]["state"], "not_imported");

    let replay = app.clone().oneshot(post(record.clone())).await.unwrap();
    assert_eq!(replay.status(), StatusCode::OK);
    let replay_body: Value =
        serde_json::from_slice(&replay.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(replay_body["id"], id);
    assert_eq!(replay_body["created"], false);

    let list = app
        .clone()
        .oneshot(
            Request::get(format!("{base}?task_id=task&limit=1"))
                .header(
                    "authorization",
                    "Bearer niu-test-admin-token-that-is-long-1234",
                )
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(list.status(), StatusCode::OK);
    let list_body: Value =
        serde_json::from_slice(&list.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(list_body["data"].as_array().unwrap().len(), 1);
    assert!(list_body["next_cursor"].as_str().is_some());
    assert!(list_body["data"][0].get("spans").is_none());
    let first_page_id = list_body["data"][0]["id"].clone();
    let next = app
        .clone()
        .oneshot(
            Request::get(format!(
                "{base}?task_id=task&limit=1&after={}",
                list_body["next_cursor"].as_str().unwrap()
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
    assert_eq!(next.status(), StatusCode::OK);
    let next_body: Value =
        serde_json::from_slice(&next.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(next_body["data"].as_array().unwrap().len(), 1);
    assert_ne!(next_body["data"][0]["id"], first_page_id);

    let detail_path = format!("{base}/{id}");
    let detail = app
        .clone()
        .oneshot(
            Request::get(&detail_path)
                .header(
                    "authorization",
                    "Bearer niu-test-admin-token-that-is-long-1234",
                )
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(detail.status(), StatusCode::OK);
    let detail_body: Value =
        serde_json::from_slice(&detail.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(detail_body["record"], record);
    let account_links = detail_body["linked_accounts"].as_array().unwrap();
    assert_eq!(account_links.len(), 2);
    assert!(
        account_links
            .iter()
            .all(|link| link["account_id"] == account.to_string())
    );
    assert!(account_links.iter().any(|link| link["span_id"] == "model"));

    let account_executions_path = format!(
        "/admin/v1/organizations/{}/projects/{}/accounts/{}/executions",
        scope.organization_id, scope.project_id, account
    );
    let account_executions = app
        .clone()
        .oneshot(
            Request::get(&account_executions_path)
                .header(
                    "authorization",
                    "Bearer niu-test-admin-token-that-is-long-1234",
                )
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(account_executions.status(), StatusCode::OK);
    let account_execution_body: Value = serde_json::from_slice(
        &account_executions
            .into_body()
            .collect()
            .await
            .unwrap()
            .to_bytes(),
    )
    .unwrap();
    assert_eq!(account_execution_body["data"].as_array().unwrap().len(), 2);
    assert_eq!(account_execution_body["data"][0]["task_id"], "task");

    let reopened_pool = PgPool::connect_with((*pool.connect_options()).clone())
        .await
        .unwrap();
    let reopened = niu_storage::Store::from_pool(reopened_pool.clone());
    let persisted = reopened
        .execution_import(scope, Uuid::parse_str(&id).unwrap())
        .await
        .unwrap()
        .unwrap();
    assert_eq!(serde_json::to_value(persisted).unwrap(), record);
    reopened_pool.close().await;

    let other_path = format!(
        "/admin/v1/organizations/{}/projects/{}/executions/{id}",
        other.organization_id, other.project_id
    );
    let cross_scope = app
        .clone()
        .oneshot(
            Request::get(&other_path)
                .header(
                    "authorization",
                    "Bearer niu-test-admin-token-that-is-long-1234",
                )
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(cross_scope.status(), StatusCode::NOT_FOUND);

    let mut changed = record.clone();
    changed["coverage"] = json!("unknown");
    let conflict = app.clone().oneshot(post(changed)).await.unwrap();
    assert_eq!(conflict.status(), StatusCode::CONFLICT);
    let mut unsupported = record.clone();
    unsupported["schema_version"] = json!(2);
    let invalid = app.clone().oneshot(post(unsupported)).await.unwrap();
    assert_eq!(invalid.status(), StatusCode::BAD_REQUEST);

    let deleted = app
        .clone()
        .oneshot(
            Request::delete(&detail_path)
                .header(
                    "authorization",
                    "Bearer niu-test-admin-token-that-is-long-1234",
                )
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(deleted.status(), StatusCode::NO_CONTENT);
    let absent = app
        .oneshot(
            Request::get(&detail_path)
                .header(
                    "authorization",
                    "Bearer niu-test-admin-token-that-is-long-1234",
                )
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(absent.status(), StatusCode::NOT_FOUND);

    let attempts: i64 = sqlx::query_scalar("SELECT count(*) FROM attempts")
        .fetch_one(&pool)
        .await
        .unwrap();
    let charges: i64 = sqlx::query_scalar("SELECT count(*) FROM cost_entries")
        .fetch_one(&pool)
        .await
        .unwrap();
    // The assigned attempt was created before import; metadata import and
    // deletion must not create or charge additional work.
    assert_eq!((attempts, charges), (1, 0));
}
