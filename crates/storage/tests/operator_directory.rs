use niu_storage::{MIGRATOR, OperatorScope, Store, StoreError};
use sqlx::PgPool;
use uuid::Uuid;

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn operator_directory_pages_before_and_after_tenant_scoping(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let workspace = store.default_workspace().await.unwrap();
    let company = workspace.organization_id;
    // More than the former cap, including users with identical display names.
    sqlx::query("INSERT INTO admin_operators(id,name,role,organization_id,project_id) SELECT gen_random_uuid(),'Repeated name','owner',$1,NULL FROM generate_series(1,1003)")
        .bind(company).execute(&pool).await.unwrap();
    let scoped = Uuid::new_v4();
    sqlx::query("INSERT INTO admin_operators(id,name,role,organization_id,project_id) VALUES($1,'Workspace owner','owner',$2,$3)")
        .bind(scoped).bind(company).bind(workspace.project_id).execute(&pool).await.unwrap();
    let scope = Some(OperatorScope {
        organization_id: company,
        project_id: None,
    });
    let first = store.operator_page(scope, None, 1000).await.unwrap();
    assert_eq!(first.len(), 1000);
    let next = store
        .operator_page(scope, Some(first.last().unwrap().id), 1000)
        .await
        .unwrap();
    assert_eq!(next.len(), 4);
    assert!(
        next.iter()
            .all(|row| !first.iter().any(|old| old.id == row.id))
    );
    let restricted = Some(OperatorScope {
        organization_id: company,
        project_id: Some(workspace.project_id),
    });
    let own = store.operator_page(restricted, None, 1000).await.unwrap();
    assert_eq!(own.len(), 1);
    assert_eq!(own[0].id, scoped);
    assert!(matches!(
        store.operator_page(restricted, Some(first[0].id), 10).await,
        Err(StoreError::Conflict)
    ));
    assert!(matches!(
        store.operator_page(scope, Some(Uuid::new_v4()), 10).await,
        Err(StoreError::Conflict)
    ));
    assert!(
        store
            .operator_page(
                Some(OperatorScope {
                    organization_id: Uuid::new_v4(),
                    project_id: None
                }),
                None,
                10
            )
            .await
            .unwrap()
            .is_empty()
    );
}
