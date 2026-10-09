use niu_storage::{MIGRATOR, Store};
use sqlx::PgPool;

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn metadata_edits_preserve_secret_expiry_and_enforce_scope_and_revision(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let other = store
        .create_project(scope.organization_id, "Other metadata scope")
        .await
        .unwrap();
    let key = store
        .issue_key(scope, "Original", &["fast".into()], 3600)
        .await
        .unwrap();
    let before = store.list_keys(scope).await.unwrap().remove(0);
    let previous_principal = store.authenticate(&key.token).await.unwrap();
    assert!(
        store
            .update_key_metadata(other, key.id, "Foreign", &["*".into()], 1, "test")
            .await
            .is_err()
    );
    assert_eq!(
        store
            .update_key_metadata(scope, key.id, " Renamed ", &["slow".into()], 1, "test")
            .await
            .unwrap(),
        2
    );
    assert!(
        store
            .update_key_metadata(scope, key.id, "Stale", &["*".into()], 1, "test")
            .await
            .is_err()
    );
    let after = store.list_keys(scope).await.unwrap().remove(0);
    assert_eq!(after.name, "Renamed");
    assert_eq!(after.expires_at_ms, before.expires_at_ms);
    let principal = store.authenticate(&key.token).await.unwrap();
    assert!(principal.allows_model("slow"));
    assert!(!principal.allows_model("fast"));
    let operation = store.create_operation(scope, "fast").await.unwrap();
    let attempt = store
        .prepare_attempt(scope, operation, "fast", "fixture")
        .await
        .unwrap();
    assert!(
        store
            .mark_dispatched(&previous_principal, attempt)
            .await
            .is_err()
    );
    let audit: serde_json::Value = sqlx::query_scalar(
        "SELECT updated_metadata FROM key_audit_events WHERE key_id=$1 AND action='updated'",
    )
    .bind(key.id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(audit["name"], "Renamed");
    assert_eq!(
        store
            .update_key_metadata(scope, key.id, "Renamed", &["slow".into()], 2, "test")
            .await
            .unwrap(),
        2
    );
    store.revoke_key(scope, key.id).await.unwrap();
    assert!(
        store
            .update_key_metadata(scope, key.id, "Revoked", &["*".into()], 2, "test")
            .await
            .is_err()
    );
    let expired = store
        .issue_key(scope, "Expired", &["*".into()], 3600)
        .await
        .unwrap();
    sqlx::query("UPDATE api_keys SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1")
        .bind(expired.id)
        .execute(&pool)
        .await
        .unwrap();
    assert!(
        store
            .update_key_metadata(scope, expired.id, "Cannot edit", &["*".into()], 1, "test")
            .await
            .is_err()
    );
    let events: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM key_audit_events WHERE key_id=$1 AND action='updated'",
    )
    .bind(expired.id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(events, 0);
}
