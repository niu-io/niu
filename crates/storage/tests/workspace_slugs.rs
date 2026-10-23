use niu_storage::{MIGRATOR, Store, StoreError};
use sqlx::PgPool;
#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn slugs_are_short_unique_durable_and_scoped(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let default = store.default_workspace().await.unwrap();
    let default_entry = store
        .workspaces(Some(default.organization_id), Some(default.project_id))
        .await
        .unwrap();
    assert_eq!(default_entry[0].name, "Default workspace");
    assert_eq!(default_entry[0].slug, "default-workspace");
    let first = store
        .create_workspace_with_slug(Some(default.organization_id), "产品 实验", None, None, None)
        .await
        .unwrap();
    let second = store
        .create_workspace_with_slug(Some(default.organization_id), "产品 实验", None, None, None)
        .await
        .unwrap();
    let entries = store
        .workspaces(Some(default.organization_id), None)
        .await
        .unwrap();
    assert_eq!(
        entries
            .iter()
            .find(|w| w.id == first.project_id)
            .unwrap()
            .slug,
        "chan-pin-shi-yan"
    );
    assert_eq!(
        entries
            .iter()
            .find(|w| w.id == second.project_id)
            .unwrap()
            .slug,
        "chan-pin-shi-yan-2"
    );
    let chosen = store
        .create_workspace_with_slug(
            Some(default.organization_id),
            "Custom name",
            Some("research"),
            None,
            None,
        )
        .await
        .unwrap();
    assert!(matches!(
        store
            .create_workspace_with_slug(
                Some(default.organization_id),
                "Another name",
                Some("research"),
                None,
                None
            )
            .await,
        Err(StoreError::WorkspaceSlugTaken)
    ));
    store
        .rename_workspace(chosen, "Changed name")
        .await
        .unwrap();
    assert_eq!(
        store
            .workspace_route("research", Some(default.organization_id), None)
            .await
            .unwrap()
            .unwrap()
            .id,
        chosen.project_id
    );
    assert!(
        store
            .workspace_route("research", Some(uuid::Uuid::new_v4()), None)
            .await
            .unwrap()
            .is_none()
    );
    sqlx::query("INSERT INTO workspace_slug_aliases(slug,project_id) VALUES('old-bookmark',$1)")
        .bind(chosen.project_id)
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        store
            .workspace_route("old-bookmark", None, None)
            .await
            .unwrap()
            .unwrap()
            .slug,
        "research"
    );
    assert!(matches!(
        store
            .create_workspace_with_slug(
                Some(default.organization_id),
                "Alias hijack",
                Some("old-bookmark"),
                None,
                None
            )
            .await,
        Err(StoreError::WorkspaceSlugTaken)
    ));
    let (a, b) = tokio::join!(
        store.create_workspace(Some(default.organization_id), "Concurrent"),
        store.create_workspace(Some(default.organization_id), "Concurrent")
    );
    assert_ne!(a.unwrap().project_id, b.unwrap().project_id);
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn provider_and_key_slugs_survive_renames_and_keep_duplicate_names_distinct(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let first = store
        .create_provider_business("牛元 Provider")
        .await
        .unwrap();
    let second = store
        .create_provider_business("牛元 Provider")
        .await
        .unwrap();
    assert_eq!(
        store.supplier_profile(first).await.unwrap().unwrap().slug,
        "niu-yuan-provider"
    );
    assert_eq!(
        store.supplier_profile(second).await.unwrap().unwrap().slug,
        "niu-yuan-provider-2"
    );
    sqlx::query("UPDATE provider_businesses SET name='Renamed' WHERE id=$1")
        .bind(first)
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        store.supplier_profile(first).await.unwrap().unwrap().slug,
        "niu-yuan-provider"
    );
    let scope = store.default_workspace().await.unwrap();
    let key = store
        .issue_key(scope, "生产 Key", &["*".into()], 3600)
        .await
        .unwrap();
    let duplicate = store
        .issue_key(scope, "生产 Key", &["*".into()], 3600)
        .await
        .unwrap();
    let slugs: Vec<(uuid::Uuid, String)> =
        sqlx::query_as("SELECT id,slug FROM api_keys WHERE id IN ($1,$2)")
            .bind(key.id)
            .bind(duplicate.id)
            .fetch_all(&pool)
            .await
            .unwrap();
    assert_eq!(
        slugs.iter().find(|(id, _)| *id == key.id).unwrap().1,
        "sheng-chan-key"
    );
    assert_eq!(
        slugs.iter().find(|(id, _)| *id == duplicate.id).unwrap().1,
        "sheng-chan-key-2"
    );
    sqlx::query("UPDATE api_keys SET name='Renamed' WHERE id=$1")
        .bind(key.id)
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        store
            .list_keys(scope)
            .await
            .unwrap()
            .iter()
            .find(|k| k.id == key.id)
            .unwrap()
            .slug,
        "sheng-chan-key"
    );
    let details = store.list_key_details(scope).await.unwrap();
    assert_eq!(
        details
            .iter()
            .find(|row| row["id"] == key.id.to_string())
            .unwrap()["slug"],
        "sheng-chan-key"
    );
    let rotated = store.rotate_key(scope, key.id).await.unwrap();
    assert_ne!(rotated.id, key.id);
    assert!(
        store
            .list_keys(scope)
            .await
            .unwrap()
            .iter()
            .any(|k| k.id == rotated.id && !k.slug.is_empty())
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn initial_limit_is_atomic_and_part_of_replay(pool: PgPool) {
    use niu_storage::{OperatorAuditActor, WorkspaceCreationKey, WorkspaceCreationLimit};
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let organization = store
        .create_prepaid_organization("Budget company", "USD")
        .await
        .unwrap();
    let key = || {
        Some(WorkspaceCreationKey {
            actor: OperatorAuditActor::Installation,
            key_sha256: vec![9; 32],
        })
    };
    let limit = |currency: &str, amount| {
        Some(WorkspaceCreationLimit {
            currency: currency.into(),
            limit_nanos: amount,
        })
    };
    let first = store
        .create_workspace_with_limit(
            Some(organization),
            "Initial cap",
            Some("initial-cap"),
            limit("USD", 0),
            key(),
            None,
        )
        .await
        .unwrap();
    let saved = store
        .customer_workspace_spending_limit(first, "USD")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(saved["limit_nanos"], "0");
    assert_eq!(saved["revision"], "1");
    let history = store
        .customer_workspace_spending_limit_history(first, "USD", None, 10)
        .await
        .unwrap();
    assert_eq!(history.len(), 1);
    assert_eq!(history[0]["actor_kind"], "installation");
    assert_eq!(
        store
            .create_workspace_with_limit(
                Some(organization),
                "Initial cap",
                Some("initial-cap"),
                limit("USD", 0),
                key(),
                None
            )
            .await
            .unwrap()
            .project_id,
        first.project_id
    );
    assert!(matches!(
        store
            .create_workspace_with_limit(
                Some(organization),
                "Initial cap",
                Some("initial-cap"),
                limit("USD", 1),
                key(),
                None
            )
            .await,
        Err(StoreError::Conflict)
    ));
    use niu_storage::{OperatorRole, OperatorScope};
    let issued = store
        .create_operator(
            OperatorScope {
                organization_id: organization,
                project_id: None,
            },
            "Company admin",
            OperatorRole::Admin,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let admin = store.authenticate_operator(&issued.token).await.unwrap();
    assert!(matches!(
        store
            .create_workspace_with_limit(
                Some(organization),
                "Unauthorized cap",
                Some("unauthorized-cap"),
                limit("USD", 1),
                None,
                Some(admin)
            )
            .await,
        Err(StoreError::Unauthorized)
    ));
    assert!(
        !store
            .workspaces(Some(organization), None)
            .await
            .unwrap()
            .iter()
            .any(|workspace| workspace.slug == "unauthorized-cap")
    );
    store
        .create_workspace_with_limit(
            Some(organization),
            "Admin without cap",
            Some("admin-no-cap"),
            None,
            None,
            Some(admin),
        )
        .await
        .unwrap();
    for (slug, currency, amount) in [("wrong-currency", "EUR", 1), ("negative-limit", "USD", -1)] {
        assert!(
            store
                .create_workspace_with_limit(
                    Some(organization),
                    "Must roll back",
                    Some(slug),
                    limit(currency, amount),
                    None,
                    None
                )
                .await
                .is_err()
        );
        let count: i64 = sqlx::query_scalar("SELECT count(*) FROM projects WHERE route_slug=$1")
            .bind(slug)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 0);
    }
}
