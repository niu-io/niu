use niu_storage::{MIGRATOR, Store};
use sqlx::PgPool;

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn last_used_is_scoped_durable_dispatch_and_stays_with_rotated_key(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let other = store
        .create_project(scope.organization_id, "Other key activity")
        .await
        .unwrap();
    let key = store
        .issue_key(scope, "Activity key", &["fast".into()], 3600)
        .await
        .unwrap();
    let unused = store
        .issue_key(scope, "Unused key", &["fast".into()], 3600)
        .await
        .unwrap();
    let principal = store.authenticate(&key.token).await.unwrap();
    // Successful authentication and an unsent operation are not model usage.
    assert!(
        store
            .list_keys(scope)
            .await
            .unwrap()
            .iter()
            .all(|key| key.last_used_at_ms.is_none())
    );
    let operation = store.create_operation(scope, "fast").await.unwrap();
    let unsent = store
        .prepare_attempt(scope, operation, "fast", "fixture")
        .await
        .unwrap();
    assert!(
        store
            .list_keys(scope)
            .await
            .unwrap()
            .iter()
            .all(|key| key.last_used_at_ms.is_none())
    );
    for _ in 0..2 {
        let operation = store.create_operation(scope, "fast").await.unwrap();
        let attempt = store
            .prepare_attempt(scope, operation, "fast", "fixture")
            .await
            .unwrap();
        store.mark_dispatched(&principal, attempt).await.unwrap();
    }
    let expected: i64 = sqlx::query_scalar("SELECT floor(extract(epoch FROM max(dispatched_at))*1000)::bigint FROM attempts WHERE organization_id=$1 AND project_id=$2 AND api_key_id=$3").bind(scope.organization_id).bind(scope.project_id).bind(key.id).fetch_one(&pool).await.unwrap();
    let replacement = store.rotate_key(scope, key.id).await.unwrap();
    let reopened = Store::from_pool(pool.clone());
    let keys = reopened.list_keys(scope).await.unwrap();
    let old = keys.iter().find(|item| item.id == key.id).unwrap();
    assert!(old.revoked);
    assert_eq!(old.last_used_at_ms, Some(expected));
    assert!(
        keys.iter()
            .find(|item| item.id == replacement.id)
            .unwrap()
            .last_used_at_ms
            .is_none()
    );
    assert!(
        keys.iter()
            .find(|item| item.id == unused.id)
            .unwrap()
            .last_used_at_ms
            .is_none()
    );
    let serialized = serde_json::to_value(old).unwrap();
    assert_eq!(serialized["last_used_at_ms"], expected);
    assert!(serialized.get("token").is_none());
    assert!(serialized.get("token_hash").is_none());
    assert_eq!(
        reopened
            .attempt(scope, unsent)
            .await
            .unwrap()
            .unwrap()
            .execution,
        "not_sent"
    );
    assert!(reopened.list_keys(other).await.unwrap().is_empty());
    let foreign = reopened
        .issue_key(other, "Foreign activity", &["fast".into()], 3600)
        .await
        .unwrap();
    let foreign_principal = reopened.authenticate(&foreign.token).await.unwrap();
    let operation = reopened.create_operation(other, "fast").await.unwrap();
    let attempt = reopened
        .prepare_attempt(other, operation, "fast", "fixture")
        .await
        .unwrap();
    reopened
        .mark_dispatched(&foreign_principal, attempt)
        .await
        .unwrap();
    assert_eq!(
        reopened
            .list_keys(scope)
            .await
            .unwrap()
            .iter()
            .find(|item| item.id == key.id)
            .unwrap()
            .last_used_at_ms,
        Some(expected)
    );
    assert!(
        reopened.list_keys(other).await.unwrap()[0]
            .last_used_at_ms
            .is_some()
    );
}
