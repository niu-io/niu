use niu_storage::{MIGRATOR, Store, StoreError, TenantScope};
use sqlx::PgPool;
use uuid::Uuid;

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn workspace_changes_preserve_tenant_boundaries_and_saved_records(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let default = store.default_workspace().await.unwrap();
    let workspace = store
        .create_project(default.organization_id, "Before")
        .await
        .unwrap();
    let listed = store
        .workspaces(Some(default.organization_id), None)
        .await
        .unwrap();
    assert!(
        listed
            .iter()
            .find(|item| item.id == default.project_id)
            .unwrap()
            .is_default
    );
    assert!(
        !listed
            .iter()
            .find(|item| item.id == workspace.project_id)
            .unwrap()
            .is_default
    );
    store
        .rename_workspace(default, "Renamed protected workspace")
        .await
        .unwrap();
    assert!(
        store
            .workspaces(Some(default.organization_id), Some(default.project_id))
            .await
            .unwrap()[0]
            .is_default
    );
    let foreign = TenantScope {
        organization_id: Uuid::new_v4(),
        project_id: workspace.project_id,
    };
    assert!(!store.rename_workspace(foreign, "Foreign").await.unwrap());
    assert!(!store.delete_empty_workspace(foreign).await.unwrap());
    assert!(store.rename_workspace(workspace, " After ").await.unwrap());
    assert_eq!(
        store
            .projects(default.organization_id)
            .await
            .unwrap()
            .iter()
            .find(|p| p.id == workspace.project_id)
            .unwrap()
            .name,
        "After"
    );
    let operation = store
        .create_operation(workspace, "test-model")
        .await
        .unwrap();
    assert!(matches!(
        store.delete_empty_workspace(workspace).await,
        Err(StoreError::WorkspaceNotEmpty)
    ));
    assert!(
        sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM operations WHERE id=$1)")
            .bind(operation)
            .fetch_one(&pool)
            .await
            .unwrap()
    );
    assert!(matches!(
        store.delete_empty_workspace(default).await,
        Err(StoreError::WorkspaceNotEmpty)
    ));
    let empty = store
        .create_project(default.organization_id, "Disposable")
        .await
        .unwrap();
    assert!(store.delete_empty_workspace(empty).await.unwrap());
    assert!(!store.delete_empty_workspace(empty).await.unwrap());
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn workspace_summaries_count_requests_once_and_preserve_scope(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let other = store
        .create_project(scope.organization_id, "Other")
        .await
        .unwrap();
    store.create_operation(scope, "model").await.unwrap();
    let old = store.create_operation(scope, "model").await.unwrap();
    sqlx::query("UPDATE operations SET created_at=now()-interval '31 days' WHERE id=$1")
        .bind(old)
        .execute(&pool)
        .await
        .unwrap();
    store.create_operation(other, "model").await.unwrap();
    for (index, expired, revoked) in [(1u8, false, false), (2, true, false), (3, false, true)] {
        sqlx::query("INSERT INTO api_keys(id,organization_id,project_id,name,token_hash,allowed_models,expires_at,revoked_at) VALUES($1,$2,$3,'Key',$4,ARRAY['model'],CASE WHEN $5 THEN now()-interval '1 day' ELSE now()+interval '1 day' END,CASE WHEN $6 THEN now() ELSE NULL END)")
            .bind(Uuid::new_v4()).bind(scope.organization_id).bind(scope.project_id)
            .bind(vec![index;32]).bind(expired).bind(revoked).execute(&pool).await.unwrap();
    }
    let listed = store
        .workspaces(Some(scope.organization_id), Some(scope.project_id))
        .await
        .unwrap();
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].requests_30d, 1);
    assert_eq!(listed[0].active_key_count, 1);
    let days = listed[0].requests_by_day.as_array().unwrap();
    assert_eq!(days.len(), 30);
    assert_eq!(
        days.iter()
            .map(|day| day["request_count"].as_i64().unwrap())
            .sum::<i64>(),
        1
    );
    assert!(
        days.windows(2)
            .all(|days| days[0]["start_ms"].as_i64().unwrap()
                < days[1]["start_ms"].as_i64().unwrap())
    );
    assert!(listed[0].last_request_at_ms.is_some());
    assert!(listed[0].created_at_ms > 0);
    assert!(
        store
            .workspaces(Some(Uuid::new_v4()), Some(scope.project_id))
            .await
            .unwrap()
            .is_empty()
    );
}
