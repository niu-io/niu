use super::*;

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn quota_import_is_authorized_idempotent_and_scoped(pool: sqlx::PgPool) {
    let state = test_state(None, pool.clone());
    let scope = state.store.default_workspace().await.unwrap();
    let other = state
        .store
        .create_project(scope.organization_id, "other")
        .await
        .unwrap();
    let account = state
        .store
        .create_account(
            scope,
            &niu_storage::AccountInput {
                provider: "fixture".into(),
                plan: "monthly".into(),
                authentication_mode: niu_storage::AuthMode::ApiKey,
                billing_mode: niu_storage::BillingMode::Subscription,
                credential_reference: "env:FIXTURE".into(),
                concurrency_limit: 1,
            },
        )
        .await
        .unwrap();
    let key = state
        .store
        .issue_key(scope, "client", &["fast".into()], 3600)
        .await
        .unwrap();
    let store = state.store.clone();
    let collector = store
        .issue_collector_key(scope, "collector", 3600)
        .await
        .unwrap();
    let app = router(state);
    let path = format!(
        "/admin/v1/organizations/{}/projects/{}/accounts/{account}/quota",
        scope.organization_id, scope.project_id
    );
    let wrong_path = format!(
        "/admin/v1/organizations/{}/projects/{}/accounts/{account}/quota",
        scope.organization_id, other.project_id
    );
    let body = json!({"schema_version":1, "window_key":"monthly", "unit":"tokens", "remaining":i64::MAX, "maximum":null,
            "observed_at_ms":1, "valid_until_ms":2, "resets_at_ms":3, "source":"fixture"});
    let admin = "Bearer niu-test-admin-token-that-is-long-1234".to_string();
    let mut id = None;
    for (url, auth, payload, expected) in [
        (
            path.clone(),
            format!("Bearer {}", key.token),
            body.clone(),
            StatusCode::UNAUTHORIZED,
        ),
        (
            wrong_path.clone(),
            admin.clone(),
            body.clone(),
            StatusCode::CONFLICT,
        ),
        (
            path.clone(),
            format!("Bearer {}", collector.token),
            body.clone(),
            StatusCode::CREATED,
        ),
        (
            wrong_path.clone(),
            format!("Bearer {}", collector.token),
            body.clone(),
            StatusCode::UNAUTHORIZED,
        ),
        (
            path.clone(),
            admin.clone(),
            body.clone(),
            StatusCode::CREATED,
        ),
        (
            path.clone(),
            admin.clone(),
            body.clone(),
            StatusCode::CREATED,
        ),
        (
            path.clone(),
            admin.clone(),
            {
                let mut b = body.clone();
                b["remaining"] = json!(0);
                b
            },
            StatusCode::CONFLICT,
        ),
        (
            path.clone(),
            admin.clone(),
            {
                let mut b = body.clone();
                b["remaining"] = json!(-1);
                b
            },
            StatusCode::BAD_REQUEST,
        ),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::post(url)
                    .header("authorization", auth)
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(payload.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
        if expected == StatusCode::CREATED {
            let response: Value =
                serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                    .unwrap();
            if let Some(previous) = &id {
                assert_eq!(previous, &response["id"]);
            }
            id = Some(response["id"].clone());
        }
    }
    for url in [
        "/v1/models".to_string(),
        "/admin/v1/organizations".to_string(),
        path.clone(),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::get(url)
                    .header("authorization", format!("Bearer {}", collector.token))
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }
    store
        .revoke_collector_key(scope, collector.id)
        .await
        .unwrap();
    let response = app
        .clone()
        .oneshot(
            Request::post(&path)
                .header("authorization", format!("Bearer {}", collector.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    let expired = store
        .issue_collector_key(scope, "expired", 3600)
        .await
        .unwrap();
    sqlx::query("UPDATE collector_keys SET expires_at=now()-interval '1 second' WHERE id=$1")
        .bind(expired.id)
        .execute(&pool)
        .await
        .unwrap();
    let response = app
        .clone()
        .oneshot(
            Request::post(&path)
                .header("authorization", format!("Bearer {}", expired.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(response.headers()["cache-control"], "no-store");
    let response = app
        .oneshot(
            Request::get(path)
                .header("authorization", admin)
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.headers()["cache-control"], "no-store");
    let response: Value =
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(response["data"][0]["remaining"], i64::MAX.to_string());
    assert_eq!(response["data"][0]["fresh"], false);
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM quota_observations")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 1);
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn quota_import_is_versioned_idempotent_and_read_only(pool: sqlx::PgPool) {
    let state = test_state(None, pool.clone());
    let organization = state.store.create_organization("quota").await.unwrap();
    let scope = state
        .store
        .create_project(organization, "project")
        .await
        .unwrap();
    let app = router(state.clone());
    let accounts = format!(
        "/admin/v1/organizations/{}/projects/{}/accounts",
        scope.organization_id, scope.project_id
    );
    let account = admin_call(
        &app,
        &accounts,
        json!({
            "provider": "fixture", "plan": "weekly", "authentication_mode": "oauth_refresh",
            "billing_mode": "subscription", "credential_reference": "env:FIXTURE_ACCOUNT",
            "concurrency_limit": 2
        }),
    )
    .await;
    let account_id = account["id"].as_str().unwrap();
    let quota = format!("{accounts}/{account_id}/quota");
    let now: i64 =
        sqlx::query_scalar("SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint")
            .fetch_one(&pool)
            .await
            .unwrap();
    let observation = json!({
        "schema_version": 1, "window_key": "weekly", "unit": "tokens",
        "remaining": 800, "maximum": 1000, "observed_at_ms": now - 1,
        "valid_until_ms": now + 60000, "resets_at_ms": now + 3600000,
        "source": "provider-header"
    });
    let post = |body: Value| {
        Request::post(&quota)
            .header(
                "authorization",
                "Bearer niu-test-admin-token-that-is-long-1234",
            )
            .header("content-type", "application/json")
            .body(axum::body::Body::from(body.to_string()))
            .unwrap()
    };
    let unauthorized = app
        .clone()
        .oneshot(
            Request::post(&quota)
                .header("content-type", "application/json")
                .body(axum::body::Body::from(observation.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(unauthorized.status(), StatusCode::UNAUTHORIZED);

    let first = app
        .clone()
        .oneshot(post(observation.clone()))
        .await
        .unwrap();
    assert_eq!(first.status(), StatusCode::CREATED);
    let first_body: Value =
        serde_json::from_slice(&first.into_body().collect().await.unwrap().to_bytes()).unwrap();
    let replay = app
        .clone()
        .oneshot(post(observation.clone()))
        .await
        .unwrap();
    assert_eq!(replay.status(), StatusCode::CREATED);
    let replay_body: Value =
        serde_json::from_slice(&replay.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(first_body["id"], replay_body["id"]);

    let mut unsupported_version = observation.clone();
    unsupported_version["schema_version"] = json!(2);
    let invalid = app
        .clone()
        .oneshot(post(unsupported_version))
        .await
        .unwrap();
    assert_eq!(invalid.status(), StatusCode::BAD_REQUEST);

    let mut conflicting = observation.clone();
    conflicting["remaining"] = json!(700);
    let response = app.clone().oneshot(post(conflicting)).await.unwrap();
    assert_eq!(response.status(), StatusCode::CONFLICT);
    let read = app
        .clone()
        .oneshot(
            Request::get(&quota)
                .header(
                    "authorization",
                    "Bearer niu-test-admin-token-that-is-long-1234",
                )
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(read.status(), StatusCode::OK);
    let body: Value =
        serde_json::from_slice(&read.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(body["data"][0]["remaining"], "800");
    assert_eq!(body["data"][0]["unit"], "tokens");
    assert_eq!(body["data"][0]["fresh"], true);
    assert!(body["data"][0].get("credential_reference").is_none());
    // Import/report operations do not dispatch inference or mutate account health.
    assert_eq!(
        state.store.accounts(scope).await.unwrap()[0].health,
        "unverified"
    );
    assert_eq!(state.usage.snapshot().attempts_total, 0);
    let reopened_pool = PgPool::connect_with((*pool.connect_options()).clone())
        .await
        .unwrap();
    let reopened = niu_storage::Store::from_pool(reopened_pool.clone());
    let persisted = reopened
        .quota(scope, Uuid::parse_str(account_id).unwrap())
        .await
        .unwrap();
    assert_eq!(persisted.len(), 1);
    assert_eq!(persisted[0].remaining.as_deref(), Some("800"));
    assert_eq!(persisted[0].previous_remaining, None);
    reopened_pool.close().await;

    let delete_path = format!("{quota}?window_key=weekly");
    let unauthorized_delete = app
        .clone()
        .oneshot(
            Request::delete(&delete_path)
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(unauthorized_delete.status(), StatusCode::UNAUTHORIZED);
    let deleted = app
        .clone()
        .oneshot(
            Request::delete(&delete_path)
                .header(
                    "authorization",
                    "Bearer niu-test-admin-token-that-is-long-1234",
                )
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(deleted.status(), StatusCode::OK);
    let deleted_body: Value =
        serde_json::from_slice(&deleted.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(deleted_body["window_key"], "weekly");
    assert_eq!(deleted_body["deleted_count"], 1);
    let empty = app
        .clone()
        .oneshot(
            Request::get(&quota)
                .header(
                    "authorization",
                    "Bearer niu-test-admin-token-that-is-long-1234",
                )
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let empty_body: Value =
        serde_json::from_slice(&empty.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert!(empty_body["data"].as_array().unwrap().is_empty());
    assert_eq!(
        state.store.accounts(scope).await.unwrap()[0].health,
        "unverified"
    );
    assert_eq!(state.usage.snapshot().attempts_total, 0);
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn quota_collector_fallback_does_not_hide_operator_storage_failures(pool: sqlx::PgPool) {
    let state = test_state(None, pool.clone());
    let scope = state.store.default_workspace().await.unwrap();
    let account = state
        .store
        .create_account(
            scope,
            &niu_storage::AccountInput {
                provider: "fixture".into(),
                plan: "monthly".into(),
                authentication_mode: niu_storage::AuthMode::ApiKey,
                billing_mode: niu_storage::BillingMode::Subscription,
                credential_reference: "env:FIXTURE".into(),
                concurrency_limit: 1,
            },
        )
        .await
        .unwrap();
    let collector = state
        .store
        .issue_collector_key(scope, "collector", 3600)
        .await
        .unwrap();
    let path = format!(
        "/admin/v1/organizations/{}/projects/{}/accounts/{}/quota",
        scope.organization_id, scope.project_id, account
    );
    let body = json!({
        "schema_version": 1, "window_key": "monthly", "unit": "tokens",
        "remaining": 90, "maximum": 100, "observed_at_ms": 1,
        "valid_until_ms": 2, "resets_at_ms": 3, "source": "fixture"
    });
    let app = router(state);

    sqlx::query("ALTER TABLE admin_sessions RENAME TO admin_sessions_unavailable")
        .execute(&pool)
        .await
        .unwrap();
    let response = app
        .oneshot(
            Request::post(path)
                .header("authorization", format!("Bearer {}", collector.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    sqlx::query("ALTER TABLE admin_sessions_unavailable RENAME TO admin_sessions")
        .execute(&pool)
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
}
