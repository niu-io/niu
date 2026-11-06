//! Single-statement key-policy reads need no transaction setup and must keep
//! returning the active policy revision and its empty-history shape.
use niu_storage::{MIGRATOR, Store};
use sqlx::PgPool;

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn single_statement_key_policy_reads_are_not_transactional(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool);
    let organization = store
        .create_organization("IP policy fixture")
        .await
        .unwrap();
    let workspace = store
        .create_project(organization, "IP policy workspace")
        .await
        .unwrap();
    let key = store
        .issue_key(workspace, "IP policy key", &["*".into()], 3600)
        .await
        .unwrap();
    // The key is active and has no policy: it is authorized from any source.
    store.check_key_ip(workspace, key.id, None).await.unwrap();
    // The active key exists; an absent policy is represented as null fields.
    let policy = store
        .key_ip_policy(workspace, key.id)
        .await
        .unwrap()
        .expect("active key returns a policy shape");
    assert!(policy["allowed_cidrs"].is_null());
    assert!(policy["revision"].is_null());
    assert!(
        store
            .key_ip_history(workspace, key.id, None, 10)
            .await
            .unwrap()
            .is_empty()
    );
}
