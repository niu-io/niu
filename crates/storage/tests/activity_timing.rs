use niu_storage::{GatewayActivityFilter, MIGRATOR, Store};
use sqlx::PgPool;

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn activity_average_matches_complete_request_timing_and_excludes_interruptions(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let key = store
        .issue_key(scope, "Timing fixture", &["*".into()], 3600)
        .await
        .unwrap();
    let principal = store.authenticate(&key.token).await.unwrap();
    for (model, timing) in [
        ("measured", Some((100, true))),
        ("measured", Some((300, true))),
        ("interrupted", Some((10_000, false))),
        ("legacy", None),
    ] {
        let operation = store.create_operation(scope, model).await.unwrap();
        let attempt = store
            .prepare_attempt(scope, operation, model, "timing-fixture")
            .await
            .unwrap();
        store.mark_dispatched(&principal, attempt).await.unwrap();
        store
            .complete_with_provider_model(scope, attempt, Some((1, 1)), Some(model))
            .await
            .unwrap();
        sqlx::query(
            "UPDATE attempts SET completed_at=dispatched_at+interval '7 milliseconds' WHERE id=$1",
        )
        .bind(attempt)
        .execute(&pool)
        .await
        .unwrap();
        if let Some((total, complete)) = timing {
            store
                .save_request_timing(niu_storage::RequestTimingRecord {
                    attempt,
                    dispatch_ms: Some(10),
                    headers_ms: Some(20),
                    first_output_ms: Some(50),
                    total_ms: total,
                    complete,
                    http_status: Some(200),
                })
                .await
                .unwrap();
        }
    }
    let summary = store
        .gateway_activity_summary(scope, &GatewayActivityFilter::default())
        .await
        .unwrap();
    assert_eq!(summary.request_count, 4);
    assert_eq!(summary.timing_count, 2);
    assert_eq!(summary.average_duration_ms, Some(200)); // Full gateway totals only.
    assert_eq!(
        summary.latency_percentiles,
        serde_json::json!({
            "boundary":"gateway_body_ms","sample_count":2,"p50_ms":100,"p95_ms":300,"p99_ms":300
        })
    );
    let interrupted = store
        .gateway_activity_summary(
            scope,
            &GatewayActivityFilter {
                model_alias: Some("interrupted".into()),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert_eq!(interrupted.request_count, 1);
    assert_eq!(interrupted.timing_count, 0);
    assert_eq!(interrupted.average_duration_ms, None);
    assert_eq!(interrupted.latency_percentiles["sample_count"], 0);
    assert!(interrupted.latency_percentiles["p99_ms"].is_null());
    let legacy = store
        .gateway_activity_summary(
            scope,
            &GatewayActivityFilter {
                model_alias: Some("legacy".into()),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert_eq!(legacy.request_count, 1);
    assert_eq!(legacy.timing_count, 0);
    assert_eq!(legacy.average_duration_ms, None);
    assert!(legacy.latency_percentiles["p50_ms"].is_null());
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn interrupted_timing_preserves_unknown_headers_and_rejects_invalid_chronology(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let operation = store.create_operation(scope, "timing-model").await.unwrap();
    let attempt = store
        .prepare_attempt(scope, operation, "timing-model", "timing-fixture")
        .await
        .unwrap();
    let valid = niu_storage::RequestTimingRecord {
        attempt,
        dispatch_ms: Some(10),
        headers_ms: None,
        first_output_ms: None,
        total_ms: 20,
        complete: false,
        http_status: None,
    };
    let mut invalid = Vec::new();
    let mut item = valid.clone();
    item.total_ms = -1;
    invalid.push(item);
    let mut item = valid.clone();
    item.dispatch_ms = Some(21);
    invalid.push(item);
    let mut item = valid.clone();
    item.first_output_ms = Some(15);
    invalid.push(item);
    let mut item = valid.clone();
    item.headers_ms = Some(5);
    invalid.push(item);
    let mut item = valid.clone();
    item.headers_ms = Some(21);
    invalid.push(item);
    let mut item = valid.clone();
    item.headers_ms = Some(12);
    item.first_output_ms = Some(11);
    invalid.push(item);
    let mut item = valid.clone();
    item.headers_ms = Some(12);
    item.first_output_ms = Some(21);
    invalid.push(item);
    for item in invalid {
        assert!(matches!(
            store.save_request_timing(item).await,
            Err(niu_storage::StoreError::InvalidObservation)
        ));
    }
    for (dispatch, first, total) in [
        (Some(10_i64), None, -1_i64),
        (Some(21), None, 20),
        (Some(10), Some(15_i64), 20),
    ] {
        let error = sqlx::query("INSERT INTO request_timings(attempt_id,dispatch_ms,headers_ms,first_output_ms,total_ms,complete,http_status) VALUES($1,$2,NULL,$3,$4,false,NULL)")
            .bind(attempt).bind(dispatch).bind(first).bind(total).execute(&pool).await.unwrap_err();
        assert_eq!(
            error.as_database_error().unwrap().code().as_deref(),
            Some("23514")
        );
    }
    store.save_request_timing(valid).await.unwrap();
    let saved: (Option<i64>, Option<i64>, Option<i32>, i64, bool) = sqlx::query_as("SELECT headers_ms,first_output_ms,http_status,total_ms,complete FROM request_timings WHERE attempt_id=$1")
        .bind(attempt).fetch_one(&pool).await.unwrap();
    assert_eq!(saved, (None, None, None, 20, false));
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn key_status_filters_entire_workspace_before_pagination(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let first = store
        .issue_key(scope, "First active", &["*".into()], 3600)
        .await
        .unwrap();
    let revoked = store
        .issue_key(scope, "Revoked", &["*".into()], 3600)
        .await
        .unwrap();
    let expired = store
        .issue_key(scope, "Expired", &["*".into()], 3600)
        .await
        .unwrap();
    let last = store
        .issue_key(scope, "Last active", &["*".into()], 3600)
        .await
        .unwrap();
    store.revoke_key(scope, revoked.id).await.unwrap();
    sqlx::query("UPDATE api_keys SET expires_at=now()-interval '1 minute' WHERE id=$1")
        .bind(expired.id)
        .execute(&pool)
        .await
        .unwrap();

    let (active, next) = store
        .key_directory_page(scope, None, 1, Some(true))
        .await
        .unwrap();
    assert_eq!(active[0].id, first.id);
    assert_eq!(next, Some(first.id));
    let (active, next) = store
        .key_directory_page(scope, next, 1, Some(true))
        .await
        .unwrap();
    assert_eq!(active[0].id, last.id);
    assert!(next.is_none());

    let (inactive, next) = store
        .key_directory_page(scope, None, 1, Some(false))
        .await
        .unwrap();
    assert_eq!(inactive[0].id, revoked.id);
    assert!(inactive[0].revoked);
    assert_eq!(next, Some(revoked.id));
    let (inactive, next) = store
        .key_directory_page(scope, next, 1, Some(false))
        .await
        .unwrap();
    assert_eq!(inactive[0].id, expired.id);
    assert!(inactive[0].expired);
    assert!(next.is_none());
}
