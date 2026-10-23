use niu_storage::{MIGRATOR, OperatorAuditActor, OperatorRole, OperatorScope, Store, StoreError};
use sqlx::PgPool;

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn operator_identity_replay_is_atomic_and_never_restores_access(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let workspace = store.default_workspace().await.unwrap();
    let scope = OperatorScope {
        organization_id: workspace.organization_id,
        project_id: None,
    };
    let key = [42u8; 32];
    let (first, second) = tokio::join!(
        store.create_operator_identity(
            scope,
            "Owner",
            OperatorRole::Owner,
            &key,
            OperatorAuditActor::Installation
        ),
        store.create_operator_identity(
            scope,
            "Owner",
            OperatorRole::Owner,
            &key,
            OperatorAuditActor::Installation
        )
    );
    let first = first.unwrap();
    assert_eq!(first.id, second.unwrap().id);
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM admin_sessions WHERE operator_id=$1")
            .bind(first.id)
            .fetch_one(&pool)
            .await
            .unwrap(),
        0
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>(
            "SELECT count(*) FROM operator_creation_receipts WHERE operator_id=$1"
        )
        .bind(first.id)
        .fetch_one(&pool)
        .await
        .unwrap(),
        1
    );
    assert!(matches!(
        store
            .create_operator_identity(
                scope,
                "Different owner",
                OperatorRole::Owner,
                &key,
                OperatorAuditActor::Installation
            )
            .await,
        Err(StoreError::Conflict)
    ));
    sqlx::query("UPDATE admin_operators SET role='viewer' WHERE id=$1")
        .bind(first.id)
        .execute(&pool)
        .await
        .unwrap();
    let replay = store
        .create_operator_identity(
            scope,
            "Owner",
            OperatorRole::Owner,
            &key,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    assert_eq!(replay.role, OperatorRole::Viewer);
    sqlx::query("UPDATE admin_operators SET revoked_at=now() WHERE id=$1")
        .bind(first.id)
        .execute(&pool)
        .await
        .unwrap();
    assert!(matches!(
        store
            .create_operator_identity(
                scope,
                "Owner",
                OperatorRole::Owner,
                &key,
                OperatorAuditActor::Installation
            )
            .await,
        Err(StoreError::Conflict)
    ));
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM admin_operators WHERE name='Owner'")
            .fetch_one(&pool)
            .await
            .unwrap(),
        1
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn operator_identity_receipt_failure_rolls_back_identity(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let workspace = store.default_workspace().await.unwrap();
    let scope = OperatorScope {
        organization_id: workspace.organization_id,
        project_id: None,
    };
    sqlx::raw_sql("CREATE FUNCTION fail_identity_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic receipt fault'; END $$; CREATE TRIGGER fail_identity_receipt BEFORE INSERT ON operator_creation_receipts FOR EACH ROW EXECUTE FUNCTION fail_identity_receipt();").execute(&pool).await.unwrap();
    let key = [43u8; 32];
    assert!(
        store
            .create_operator_identity(
                scope,
                "Atomic owner",
                OperatorRole::Owner,
                &key,
                OperatorAuditActor::Installation
            )
            .await
            .is_err()
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>(
            "SELECT count(*) FROM admin_operators WHERE name='Atomic owner'"
        )
        .fetch_one(&pool)
        .await
        .unwrap(),
        0
    );
    sqlx::query("DROP TRIGGER fail_identity_receipt ON operator_creation_receipts")
        .execute(&pool)
        .await
        .unwrap();
    store
        .create_operator_identity(
            scope,
            "Atomic owner",
            OperatorRole::Owner,
            &key,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    assert_eq!(
        sqlx::query_scalar::<_, i64>(
            "SELECT count(*) FROM admin_operators WHERE name='Atomic owner'"
        )
        .fetch_one(&pool)
        .await
        .unwrap(),
        1
    );
}
