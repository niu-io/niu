//! Refs #108: recovery must neither duplicate credentials nor retain secrets.
use niu_storage::{
    MIGRATOR, OperatorAuditActor, Store, StoreError, TenantScope, UnifiedKeyPoliciesInput,
};
use sqlx::PgPool;
use uuid::Uuid;

async fn fixture(pool: &PgPool) -> (Store, TenantScope) {
    MIGRATOR.run(pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    (store, scope)
}
async fn create(
    store: &Store,
    scope: TenantScope,
    request: Uuid,
    name: &str,
) -> niu_storage::KeyMutationResult {
    store
        .issue_key_request(
            scope,
            request,
            name,
            &["*".into()],
            Some(3600),
            UnifiedKeyPoliciesInput::default(),
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap()
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn key_creation_recovery_is_durable_scoped_and_does_not_reveal_secret(pool: PgPool) {
    let (store, scope) = fixture(&pool).await;
    let request = Uuid::new_v4();
    assert!(
        store
            .key_request_status(scope, request)
            .await
            .unwrap()
            .is_none()
    );
    let first = create(&store, scope, request, "Recovery fixture").await;
    let token = first.token.unwrap();
    assert!(store.authenticate(&token).await.is_ok());
    // Lose the first HTTP response and reconstruct the service from storage.
    let restarted = Store::from_pool(pool.clone());
    let recovered = create(&restarted, scope, request, "Recovery fixture").await;
    assert_eq!(recovered.id, first.id);
    assert!(recovered.token.is_none());
    let status = restarted
        .key_request_status(scope, request)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(status.key_id, first.id);
    assert_eq!(status.action, "create");
    assert!(!serde_json::to_string(&status).unwrap().contains(&token));
    let count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM api_keys WHERE name='Recovery fixture'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(count, 1);
    assert!(matches!(
        restarted
            .issue_key_request(
                scope,
                request,
                "Different intent",
                &["*".into()],
                Some(3600),
                UnifiedKeyPoliciesInput::default(),
                OperatorAuditActor::Installation
            )
            .await,
        Err(StoreError::Conflict)
    ));
    let foreign = TenantScope {
        organization_id: Uuid::new_v4(),
        project_id: scope.project_id,
    };
    assert!(
        restarted
            .key_request_status(foreign, request)
            .await
            .unwrap()
            .is_none()
    );
    restarted.revoke_key(scope, first.id).await.unwrap();
    assert!(
        create(&restarted, scope, request, "Recovery fixture")
            .await
            .token
            .is_none()
    );
    assert!(restarted.authenticate(&token).await.is_err());
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn key_creation_concurrent_retry_returns_one_secret_and_failed_validation_is_retryable(
    pool: PgPool,
) {
    let (store, scope) = fixture(&pool).await;
    let request = Uuid::new_v4();
    let invalid = store
        .issue_key_request(
            scope,
            request,
            "",
            &["*".into()],
            Some(3600),
            UnifiedKeyPoliciesInput::default(),
            OperatorAuditActor::Installation,
        )
        .await;
    assert!(matches!(invalid, Err(StoreError::InvalidKey)));
    assert!(
        store
            .key_request_status(scope, request)
            .await
            .unwrap()
            .is_none()
    );
    let (a, b) = tokio::join!(
        create(&store, scope, request, "Concurrent fixture"),
        create(&store, scope, request, "Concurrent fixture")
    );
    assert_eq!(a.id, b.id);
    assert_eq!(
        usize::from(a.token.is_some()) + usize::from(b.token.is_some()),
        1
    );
    let count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM api_keys WHERE name='Concurrent fixture'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(count, 1);
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn key_rotation_response_loss_recovers_replacement_without_rotating_again(pool: PgPool) {
    let (store, scope) = fixture(&pool).await;
    let old = store
        .issue_key(scope, "Rotate recovery fixture", &["*".into()], 3600)
        .await
        .unwrap();
    let request = Uuid::new_v4();
    let first = store
        .rotate_key_request(scope, request, old.id)
        .await
        .unwrap();
    assert!(store.authenticate(&old.token).await.is_err());
    assert!(
        store
            .authenticate(first.token.as_ref().unwrap())
            .await
            .is_ok()
    );
    let recovered = store
        .rotate_key_request(scope, request, old.id)
        .await
        .unwrap();
    assert_eq!(recovered.id, first.id);
    assert!(recovered.token.is_none());
    assert_eq!(
        store
            .key_request_status(scope, request)
            .await
            .unwrap()
            .unwrap()
            .action,
        "rotate"
    );
    assert!(matches!(
        store.rotate_key_request(scope, request, first.id).await,
        Err(StoreError::Conflict)
    ));
    let count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM key_audit_events WHERE key_id=$1 AND action='rotated'",
    )
    .bind(old.id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(count, 1);
    // Explicit recovery can revoke the undisclosed replacement and issue a new
    // operation. Repeating the lost request cannot revive either old secret.
    store.revoke_key(scope, first.id).await.unwrap();
    assert!(
        store
            .authenticate(first.token.as_ref().unwrap())
            .await
            .is_err()
    );
    assert!(
        store
            .rotate_key_request(scope, request, old.id)
            .await
            .unwrap()
            .token
            .is_none()
    );
}
