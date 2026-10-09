use niu_storage::{MIGRATOR, Store};
use serde_json::json;
use sqlx::PgPool;

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn payload_retention_is_scoped_and_preserves_accounting(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let other = store
        .create_project(scope.organization_id, "Other workspace")
        .await
        .unwrap();
    let operation = store.create_operation(scope, "test-model").await.unwrap();
    let attempt = store
        .prepare_attempt(scope, operation, "test-model", "fixture")
        .await
        .unwrap();
    assert!(
        store
            .save_request_payload(
                uuid::Uuid::new_v4(),
                &json!({}),
                "missing",
                "text/plain",
                true,
                false
            )
            .await
            .is_err()
    );
    let request = json!({"messages":[{"role":"user","content":"retained fixture"}]});
    store
        .save_request_payload(
            attempt,
            &request,
            "original",
            "application/json",
            true,
            false,
        )
        .await
        .unwrap();
    // A duplicate capture neither replaces the first record nor extends retention.
    store
        .save_request_payload(
            attempt,
            &json!({}),
            "replacement",
            "text/plain",
            false,
            true,
        )
        .await
        .unwrap();
    let saved = store
        .request_payload(scope, attempt)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(saved["request"], request);
    assert_eq!(saved["response"], "original");
    let hours: f64 = sqlx::query_scalar("SELECT extract(epoch FROM expires_at-now())::double precision/3600 FROM request_payloads WHERE attempt_id=$1").bind(attempt).fetch_one(&pool).await.unwrap();
    assert!(hours > 23.9 && hours <= 24.0);
    assert!(
        store
            .request_payload(other, attempt)
            .await
            .unwrap()
            .is_none()
    );
    store.delete_request_payload(other, attempt).await.unwrap();
    assert!(
        store
            .request_payload(scope, attempt)
            .await
            .unwrap()
            .is_some()
    );
    store.delete_request_payload(scope, attempt).await.unwrap();
    assert!(
        store
            .request_payload(scope, attempt)
            .await
            .unwrap()
            .is_none()
    );
    assert!(store.attempt(scope, attempt).await.unwrap().is_some());
    // A late capture must not resurrect an explicitly deleted record.
    store
        .save_request_payload(attempt, &request, "late", "text/plain", true, false)
        .await
        .unwrap();
    assert!(
        store
            .request_payload(scope, attempt)
            .await
            .unwrap()
            .is_none()
    );
    // Use a separate undeleted attempt to exercise expiration and size limits.
    let attempt = store
        .prepare_attempt(scope, operation, "test-model", "expiry-fixture")
        .await
        .unwrap();
    store
        .save_request_payload(
            attempt,
            &request,
            "expired",
            "application/json",
            false,
            true,
        )
        .await
        .unwrap();
    sqlx::query(
        "UPDATE request_payloads SET expires_at=now()-interval '1 second' WHERE attempt_id=$1",
    )
    .bind(attempt)
    .execute(&pool)
    .await
    .unwrap();
    assert!(
        store
            .request_payload(scope, attempt)
            .await
            .unwrap()
            .is_none()
    );
    store.purge_expired_request_payloads().await.unwrap();
    let count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM request_payloads WHERE attempt_id=$1")
            .bind(attempt)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(count, 0);
    assert!(store.attempt(scope, attempt).await.unwrap().is_some());
    // Oversized payloads cannot bypass capture limits through storage directly.
    assert!(
        store
            .save_request_payload(
                attempt,
                &request,
                &"x".repeat(1_048_577),
                "text/plain",
                true,
                false
            )
            .await
            .is_err()
    );
    assert!(
        store
            .request_payload(scope, attempt)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        store
            .save_request_payload(
                attempt,
                &json!({"content":"x".repeat(2_097_153)}),
                "small",
                "text/plain",
                true,
                false
            )
            .await
            .is_err()
    );
    assert!(
        store
            .request_payload(scope, attempt)
            .await
            .unwrap()
            .is_none()
    );
    // A late capture cannot revive content or extend retention after physical purge.
    sqlx::query("UPDATE attempts SET created_at=now()-interval '25 hours' WHERE id=$1")
        .bind(attempt)
        .execute(&pool)
        .await
        .unwrap();
    store
        .save_request_payload(
            attempt,
            &request,
            "late duplicate",
            "text/plain",
            true,
            false,
        )
        .await
        .unwrap();
    assert!(
        store
            .request_payload(scope, attempt)
            .await
            .unwrap()
            .is_none()
    );
    let retained: i64 =
        sqlx::query_scalar("SELECT count(*) FROM request_payloads WHERE attempt_id=$1")
            .bind(attempt)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(retained, 0);
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn payload_cleanup_is_bounded_and_skips_locked_records(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let operation = store
        .create_operation(scope, "cleanup-fixture")
        .await
        .unwrap();
    sqlx::query("WITH made AS (INSERT INTO attempts(id,organization_id,project_id,operation_id,resource_id,offer_revision) SELECT gen_random_uuid(),$1,$2,$3,'cleanup-fixture','fixture' FROM generate_series(1,550) RETURNING id) INSERT INTO request_payloads(attempt_id,request_body,response_body,response_content_type,response_complete,response_truncated,expires_at) SELECT id,'{}','expired fixture','text/plain',true,false,now()-interval '1 hour' FROM made")
        .bind(scope.organization_id).bind(scope.project_id).bind(operation).execute(&pool).await.unwrap();
    let mut held = pool.begin().await.unwrap();
    sqlx::query("SELECT attempt_id FROM request_payloads ORDER BY attempt_id LIMIT 10 FOR UPDATE")
        .fetch_all(&mut *held)
        .await
        .unwrap();
    for expected in [50_i64, 10] {
        tokio::time::timeout(
            std::time::Duration::from_secs(2),
            store.purge_expired_request_payloads(),
        )
        .await
        .unwrap()
        .unwrap();
        let count: i64 = sqlx::query_scalar("SELECT count(*) FROM request_payloads")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, expected);
    }
    held.commit().await.unwrap();
    store.purge_expired_request_payloads().await.unwrap();
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM request_payloads")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 0);
    let attempts: i64 = sqlx::query_scalar("SELECT count(*) FROM attempts WHERE operation_id=$1")
        .bind(operation)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(attempts, 550);
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn explicit_deletion_survives_concurrent_capture_and_pre_capture_deletion(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    for index in 0..12 {
        let operation = store
            .create_operation(scope, "deletion-fixture")
            .await
            .unwrap();
        let attempt = store
            .prepare_attempt(scope, operation, "deletion-fixture", "fixture")
            .await
            .unwrap();
        let request = json!({"input":"synthetic deletion fixture"});
        if index == 0 {
            // Deleting before capture creates the same durable prohibition.
            store.delete_request_payload(scope, attempt).await.unwrap();
        }
        let (capture, deletion) = tokio::join!(
            store.save_request_payload(attempt, &request, "response", "text/plain", true, false),
            store.delete_request_payload(scope, attempt),
        );
        capture.unwrap();
        deletion.unwrap();
        store
            .save_request_payload(attempt, &request, "late retry", "text/plain", true, false)
            .await
            .unwrap();
        assert!(
            store
                .request_payload(scope, attempt)
                .await
                .unwrap()
                .is_none()
        );
        let rows: i64 =
            sqlx::query_scalar("SELECT count(*) FROM request_payloads WHERE attempt_id=$1")
                .bind(attempt)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(rows, 0);
        let markers: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM request_payload_deletions WHERE attempt_id=$1",
        )
        .bind(attempt)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(markers, 1);
        assert!(store.attempt(scope, attempt).await.unwrap().is_some());
    }
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn payload_expiry_cleanup_survives_asset_cleanup_failure(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let operation = store
        .create_operation(scope, "retention-fixture")
        .await
        .unwrap();
    let attempt = store
        .prepare_attempt(scope, operation, "retention-fixture", "fixture")
        .await
        .unwrap();
    store
        .save_request_payload(
            attempt,
            &json!({"messages":[]}),
            "expired",
            "text/plain",
            true,
            false,
        )
        .await
        .unwrap();
    sqlx::query(
        "UPDATE request_payloads SET expires_at=now()-interval '1 second' WHERE attempt_id=$1",
    )
    .bind(attempt)
    .execute(&pool)
    .await
    .unwrap();
    // A statement-level fault fires even when this fixture has no asset rows.
    sqlx::query("CREATE FUNCTION fail_asset_retention_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture asset cleanup failure'; END $$").execute(&pool).await.unwrap();
    sqlx::query("CREATE TRIGGER fail_asset_retention_fixture BEFORE UPDATE ON asset_group_create_intents FOR EACH STATEMENT EXECUTE FUNCTION fail_asset_retention_fixture()").execute(&pool).await.unwrap();
    // The maintenance caller still sees the error and schedules a retry.
    assert!(store.purge_expired_request_payloads().await.is_err());
    let count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM request_payloads WHERE attempt_id=$1")
            .bind(attempt)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(count, 0);
    assert!(store.attempt(scope, attempt).await.unwrap().is_some());
    sqlx::query("DROP TRIGGER fail_asset_retention_fixture ON asset_group_create_intents")
        .execute(&pool)
        .await
        .unwrap();
    store.purge_expired_request_payloads().await.unwrap();
}
