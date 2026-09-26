use niu_storage::{MIGRATOR, OperatorAuditActor, OperatorRole, OperatorScope, Store, StoreError};
use sqlx::PgPool;
use uuid::Uuid;

#[sqlx::test]
#[ignore = "requires PostgreSQL with permission to create test databases"]
async fn operator_lifecycle_audit_is_atomic_attributed_and_cursor_stable(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let organization_id = store
        .create_organization("audit organization")
        .await
        .unwrap();
    let scope = store
        .create_project(organization_id, "audit project")
        .await
        .unwrap();
    let operator_scope = OperatorScope {
        organization_id,
        project_id: Some(scope.project_id),
    };

    let initial = store
        .create_operator(
            operator_scope,
            "owner",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let second_session = store
        .create_operator_session(
            initial.operator_id,
            3600,
            OperatorAuditActor::Operator(initial.operator_id),
        )
        .await
        .unwrap();
    store
        .revoke_operator_session(
            initial.operator_id,
            second_session.session.id,
            OperatorAuditActor::Operator(initial.operator_id),
        )
        .await
        .unwrap();
    store
        .revoke_operator(
            initial.operator_id,
            OperatorAuditActor::Operator(initial.operator_id),
        )
        .await
        .unwrap();

    let mut collected = Vec::new();
    let first_page = store
        .operator_audit_events(initial.operator_id, None, 2)
        .await
        .unwrap();
    assert_eq!(first_page.data.len(), 2);
    let cursor = first_page.next_cursor.expect("more than one page");
    collected.extend(first_page.data);
    let second_page = store
        .operator_audit_events(initial.operator_id, Some(cursor), 2)
        .await
        .unwrap();
    assert_eq!(second_page.data.len(), 2);
    assert!(second_page.next_cursor.is_some());
    let next = second_page.next_cursor.unwrap();
    collected.extend(second_page.data);
    let last_page = store
        .operator_audit_events(initial.operator_id, Some(next), 2)
        .await
        .unwrap();
    assert_eq!(last_page.data.len(), 1);
    assert!(last_page.next_cursor.is_none());
    collected.extend(last_page.data);

    let unique = collected
        .iter()
        .map(|event| event.id)
        .collect::<std::collections::HashSet<_>>();
    assert_eq!(unique.len(), 5, "cursor pages must not repeat events");
    assert!(collected.windows(2).all(|pair| {
        pair[0].created_at > pair[1].created_at
            || (pair[0].created_at == pair[1].created_at && pair[0].id > pair[1].id)
    }));
    let actions = collected
        .iter()
        .map(|event| event.action.as_str())
        .collect::<Vec<_>>();
    assert!(actions.contains(&"operator_created"));
    assert!(actions.contains(&"session_created"));
    assert!(actions.contains(&"session_revoked"));
    assert!(actions.contains(&"operator_revoked"));
    for event in &collected {
        assert_eq!(event.target_operator_id, initial.operator_id);
        assert_eq!(event.organization_id, organization_id);
        assert_eq!(event.project_id, Some(scope.project_id));
        assert!(event.created_at.ends_with('Z'));
        if event.action == "operator_created"
            || (event.action == "session_created"
                && event.target_session_id == Some(initial.session.id))
        {
            assert_eq!(event.actor_kind, "installation");
            assert_eq!(event.actor_operator_id, None);
            if event.action == "operator_created" {
                assert_eq!(event.target_session_id, None);
            }
        } else {
            assert_eq!(event.actor_kind, "operator");
            assert_eq!(event.actor_operator_id, Some(initial.operator_id));
        }
    }
    assert!(
        serde_json::to_string(&collected)
            .unwrap()
            .find(&initial.token)
            .is_none(),
        "audit records must not contain session bearer tokens"
    );

    let other = store
        .create_operator(
            operator_scope,
            "other",
            OperatorRole::Viewer,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let other_event = store
        .operator_audit_events(other.operator_id, None, 1)
        .await
        .unwrap()
        .data
        .into_iter()
        .next()
        .unwrap();
    assert!(matches!(
        store
            .operator_audit_events(initial.operator_id, Some(other_event.id), 10)
            .await,
        Err(StoreError::InvalidOperatorAuditQuery)
    ));
    assert!(matches!(
        store
            .operator_audit_events(initial.operator_id, None, 101)
            .await,
        Err(StoreError::InvalidOperatorAuditQuery)
    ));

    let count_before_failed_writes: i64 =
        sqlx::query_scalar("SELECT count(*) FROM operator_audit_events")
            .fetch_one(&pool)
            .await
            .unwrap();
    let invalid_actor = Uuid::new_v4();
    assert!(
        store
            .create_operator(
                operator_scope,
                "must roll back",
                OperatorRole::Viewer,
                3600,
                OperatorAuditActor::Operator(invalid_actor),
            )
            .await
            .is_err()
    );
    let rolled_back: bool = sqlx::query_scalar(
        "SELECT NOT EXISTS(SELECT 1 FROM admin_operators WHERE name='must roll back') \
         AND (SELECT count(*) FROM operator_audit_events)=$1",
    )
    .bind(count_before_failed_writes)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(
        rolled_back,
        "failed audit insertion rolls back the lifecycle write"
    );

    assert!(matches!(
        store
            .revoke_operator(initial.operator_id, OperatorAuditActor::Installation)
            .await,
        Err(StoreError::Conflict)
    ));
    let count_after_failed_revoke: i64 =
        sqlx::query_scalar("SELECT count(*) FROM operator_audit_events")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(count_after_failed_revoke, count_before_failed_writes);
}
