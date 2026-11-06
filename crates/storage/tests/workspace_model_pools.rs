use niu_storage::{
    MIGRATOR, OperatorAuditActor, OperatorRole, OperatorScope, RoutePoolCandidate,
    RoutePoolDefaultAction, Store, WorkspaceModelPool,
};
use sqlx::PgPool;

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn workspace_pools_require_delegation_preserve_revisions_and_isolate_tenants(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let actor = store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(scope.project_id),
            },
            "Pool owner",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let grant = store
        .create_agent_authorization_with_capabilities(
            "Codex",
            &["pools:read".into(), "pools:write".into()],
        )
        .await
        .unwrap();
    store
        .approve_agent_authorization(
            &grant.user_code,
            scope,
            actor.operator_id,
            &["fast".into()],
            3600,
        )
        .await
        .unwrap();
    let issued = store
        .exchange_agent_authorization(&grant.device_secret)
        .await
        .unwrap()
        .unwrap();
    let principal = store.authenticate(&issued.token).await.unwrap();
    let input = WorkspaceModelPool {
        slug: "assistant".into(),
        name: "Assistant".into(),
        description: "Task-specific model policy".into(),
        enabled: true,
        revision: 0,
        candidates: vec![RoutePoolCandidate {
            alias: "fast".into(),
            priority: 100,
            weight: 1000,
            enabled: true,
        }],
        rules: vec![],
        default_action: RoutePoolDefaultAction::Candidates,
        strategy: Default::default(),
    };
    let ordinary = store
        .issue_key(scope, "Ordinary", &["fast".into()], 3600)
        .await
        .unwrap();
    let ordinary_principal = store.authenticate(&ordinary.token).await.unwrap();
    assert!(
        store
            .set_workspace_model_pool(&ordinary_principal, &input)
            .await
            .is_err()
    );
    let saved = store
        .set_workspace_model_pool(&principal, &input)
        .await
        .unwrap();
    assert_eq!(saved.revision, 1);
    assert!(
        store
            .set_workspace_model_pool(&principal, &input)
            .await
            .is_err()
    );
    let (a, b) = tokio::join!(
        store.set_workspace_model_pool(&principal, &saved),
        store.set_workspace_model_pool(&principal, &saved)
    );
    assert_ne!(a.is_ok(), b.is_ok());
    assert_eq!(
        store
            .workspace_model_pool(scope, "assistant")
            .await
            .unwrap()
            .unwrap()
            .revision,
        2
    );
    let history = store
        .workspace_model_pool_history(scope, "assistant", None)
        .await
        .unwrap();
    assert_eq!(history.len(), 2);
    assert_eq!(history[0].revision, 2);
    assert_eq!(history[1].revision, 1);
    let selection = store
        .record_workspace_pool_selection(&principal, &saved, "fast", None)
        .await
        .unwrap();
    let operation = store.create_operation(scope, "fast").await.unwrap();
    let attempt = store
        .prepare_attempt(scope, operation, "fixture-route", "fixture")
        .await
        .unwrap();
    store
        .finish_workspace_pool_selection(scope, selection, Some(operation), Some(attempt), 200)
        .await
        .unwrap();
    let evidence = store
        .workspace_pool_selections(scope, "assistant")
        .await
        .unwrap();
    assert_eq!(evidence.len(), 1);
    assert_eq!(evidence[0]["pool_revision"], 1);
    assert_eq!(evidence[0]["selected_model"], "fast");
    assert_eq!(evidence[0]["response_status"], 200);
    assert!(
        evidence[0]["reference"]
            .as_str()
            .is_some_and(|value| !value.is_empty())
    );
    assert!(
        store
            .finish_workspace_pool_selection(scope, selection, Some(operation), Some(attempt), 500)
            .await
            .is_err(),
        "a response record cannot be overwritten"
    );
    let early_failure = store
        .record_workspace_pool_selection(&principal, &saved, "fast", None)
        .await
        .unwrap();
    store
        .finish_workspace_pool_selection(scope, early_failure, Some(operation), None, 503)
        .await
        .unwrap();
    let invalid_link = store
        .record_workspace_pool_selection(&principal, &saved, "fast", None)
        .await
        .unwrap();
    assert!(
        store
            .finish_workspace_pool_selection(scope, invalid_link, None, Some(attempt), 503)
            .await
            .is_err()
    );
    let other = store
        .create_project(scope.organization_id, "Other workspace")
        .await
        .unwrap();
    let foreign_operation = store.create_operation(other, "fast").await.unwrap();
    assert!(
        store
            .finish_workspace_pool_selection(
                scope,
                invalid_link,
                Some(foreign_operation),
                None,
                503
            )
            .await
            .is_err(),
        "cross-workspace operation must not be linked"
    );
    assert!(
        store
            .workspace_model_pool(other, "assistant")
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        store
            .workspace_model_pools(other, None)
            .await
            .unwrap()
            .is_empty()
    );
    let mut denied = input.clone();
    denied.slug = "unauthorized".into();
    denied.candidates[0].alias = "other-model".into();
    assert!(
        store
            .set_workspace_model_pool(&principal, &denied)
            .await
            .is_err()
    );
    denied.candidates[0].alias = "pool/nested".into();
    assert!(denied.validate().is_err());
    let revision: i64 = sqlx::query_scalar("SELECT revision FROM api_keys WHERE id=$1")
        .bind(issued.id)
        .fetch_one(&pool)
        .await
        .unwrap();
    store
        .update_key_metadata(
            scope,
            issued.id,
            "Reduced grant",
            &["other-model".into()],
            revision,
            "fixture owner",
        )
        .await
        .unwrap();
    let mut changed = saved.clone();
    changed.revision = 2;
    assert!(
        store
            .set_workspace_model_pool(&principal, &changed)
            .await
            .is_err(),
        "stale authenticated model grants must not authorize a write"
    );
    store
        .delete_workspace_model_pool(&principal, "assistant", 2)
        .await
        .unwrap();
    assert!(
        store
            .workspace_model_pool(scope, "assistant")
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        store
            .workspace_model_pools(scope, None)
            .await
            .unwrap()
            .is_empty()
    );
    assert!(
        store
            .delete_workspace_model_pool(&principal, "assistant", 2)
            .await
            .is_err(),
        "a deleted pool cannot be deleted twice"
    );
    assert_eq!(
        store
            .workspace_model_pool_history(scope, "assistant", None)
            .await
            .unwrap()
            .len(),
        2
    );
    store.revoke_key(scope, issued.id).await.unwrap();
    assert!(
        store
            .set_workspace_model_pool(&principal, &saved)
            .await
            .is_err()
    );
    let stored: serde_json::Value =
        sqlx::query_scalar("SELECT configuration FROM workspace_model_pools LIMIT 1")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(stored.get("vendor").is_none());
    assert!(stored.get("pricing").is_none());
    assert!(
        sqlx::query("DELETE FROM workspace_model_pool_history")
            .execute(&pool)
            .await
            .is_err()
    );
}
