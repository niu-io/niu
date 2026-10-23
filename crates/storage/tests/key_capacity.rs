//! Refs #107: inspect the same contributors that actually consume key capacity.
use niu_storage::{MIGRATOR, Store};
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn capacity_diagnostics_match_lineage_windows_and_scope(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let other = store
        .create_project(scope.organization_id, "Other capacity")
        .await
        .unwrap();
    let key = store
        .issue_key(scope, "Before rotation", &["fast".into()], 3600)
        .await
        .unwrap();
    let principal = store.authenticate(&key.token).await.unwrap();
    let mut attempts = Vec::new();
    for index in 0..6 {
        let operation = store.create_operation(scope, "fast").await.unwrap();
        let attempt = store
            .prepare_attempt(scope, operation, "internal-route", "fixture")
            .await
            .unwrap();
        if index == 0 {
            store
                .bind_key_token_bound(scope, attempt, Some(20))
                .await
                .unwrap();
        }
        if index != 5 {
            store.mark_dispatched(&principal, attempt).await.unwrap();
        }
        attempts.push(attempt);
    }
    // A recent completed request with unknown usage still consumes token capacity.
    sqlx::query(
        "UPDATE attempts SET execution='confirmed_completed',completed_at=now() WHERE id=$1",
    )
    .bind(attempts[1])
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query("UPDATE attempts SET execution='confirmed_completed',usage_confidence='provider_reported',prompt_tokens=3,completion_tokens=4,completed_at=now() WHERE id=$1").bind(attempts[2]).execute(&pool).await.unwrap();
    sqlx::query("UPDATE attempts SET execution='confirmed_completed',completed_at=now()-interval '2 minutes' WHERE id=$1").bind(attempts[3]).execute(&pool).await.unwrap();
    sqlx::query(
        "UPDATE attempts SET execution='confirmed_not_executed',completed_at=now() WHERE id=$1",
    )
    .bind(attempts[4])
    .execute(&pool)
    .await
    .unwrap();
    let rotated = store.rotate_key(scope, key.id).await.unwrap();
    let principal = store.authenticate(&rotated.token).await.unwrap();
    let operation = store.create_operation(scope, "fast").await.unwrap();
    let pending = store
        .prepare_attempt(scope, operation, "internal-route", "fixture")
        .await
        .unwrap();
    store.mark_dispatched(&principal, pending).await.unwrap();
    let concurrency = store
        .key_capacity_requests(scope, rotated.id, "concurrency", None, 100)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(concurrency["total"], 2);
    assert_eq!(
        concurrency["total"],
        store
            .key_concurrency_policy(scope, rotated.id)
            .await
            .unwrap()
            .unwrap()["active_requests"]
    );
    let tokens = store
        .key_capacity_requests(scope, rotated.id, "tokens", None, 100)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(tokens["total"], 3);
    let rows = tokens["data"].as_array().unwrap();
    assert_eq!(
        rows.iter()
            .filter(|row| row["reserved_tokens"].is_null())
            .count(),
        2
    );
    assert!(rows.iter().any(|row| row["reserved_tokens"] == "20"));
    assert_eq!(
        store
            .key_token_rate_policy(scope, rotated.id)
            .await
            .unwrap()
            .unwrap()["unbounded_requests"],
        2
    );
    assert!(rows.iter().all(|row| row["model_alias"] == "fast"));
    assert!(!tokens.to_string().contains("internal-route"));
    let first = store
        .key_capacity_requests(scope, rotated.id, "tokens", None, 1)
        .await
        .unwrap()
        .unwrap();
    let after = Uuid::parse_str(first["next_after"].as_str().unwrap()).unwrap();
    let second = store
        .key_capacity_requests(scope, rotated.id, "tokens", Some(after), 100)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(second["data"].as_array().unwrap().len(), 2);
    assert!(
        second["data"]
            .as_array()
            .unwrap()
            .iter()
            .all(|row| row["attempt_id"] != first["data"][0]["attempt_id"])
    );
    assert_eq!(
        store
            .key_capacity_requests(other, rotated.id, "tokens", None, 100)
            .await
            .unwrap(),
        None
    );
    assert!(
        store
            .key_capacity_requests(scope, rotated.id, "tokens", Some(Uuid::new_v4()), 100)
            .await
            .is_err()
    );
    assert!(
        store
            .key_capacity_requests(scope, rotated.id, "wrong", None, 100)
            .await
            .is_err()
    );
    assert_eq!(second["next_after"], Value::Null);
}
