use niu_storage::{MIGRATOR, OperatorAuditActor, OperatorRole, OperatorScope, Store};
use sqlx::PgPool;

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn browser_grant_is_scoped_single_use_and_concurrency_safe(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let actor = store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(scope.project_id),
            },
            "Grant owner",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let request = store
        .create_agent_authorization_with_capabilities(
            "DeepSeek Harness",
            &["pools:read".into(), "pools:write".into()],
        )
        .await
        .unwrap();
    assert!(
        store
            .exchange_agent_authorization(&request.device_secret)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        store
            .exchange_agent_authorization(&request.user_code)
            .await
            .is_err()
    );
    assert!(matches!(
        store
            .exchange_agent_authorization(&request.device_secret)
            .await,
        Err(niu_storage::StoreError::AgentAuthorizationPollLimited)
    ));
    sqlx::query("UPDATE agent_authorizations SET next_poll_at=clock_timestamp()-interval '1 second' WHERE user_code=$1").bind(&request.user_code).execute(&pool).await.unwrap();
    store
        .approve_agent_authorization(
            &request.user_code,
            scope,
            actor.operator_id,
            &["fast".into()],
            3600,
        )
        .await
        .unwrap();
    assert!(
        store
            .approve_agent_authorization(
                &request.user_code,
                scope,
                actor.operator_id,
                &["*".into()],
                3600
            )
            .await
            .is_err()
    );
    let (a, b) = tokio::join!(
        store.exchange_agent_authorization(&request.device_secret),
        store.exchange_agent_authorization(&request.device_secret)
    );
    assert_ne!(a.is_ok(), b.is_ok());
    let issued = if let Ok(Some(key)) = a {
        key
    } else {
        b.unwrap().unwrap()
    };
    let principal = store.authenticate(&issued.token).await.unwrap();
    assert_eq!(principal.scope().organization_id, scope.organization_id);
    assert_eq!(principal.scope().project_id, scope.project_id);
    assert!(principal.allows_model("fast"));
    assert!(!principal.allows_model("other"));
    assert!(
        store
            .agent_key_has_capability(scope, issued.id, "pools:write")
            .await
            .unwrap()
    );
    assert!(
        !store
            .agent_key_has_capability(scope, issued.id, "events:write")
            .await
            .unwrap()
    );
    let ordinary = store
        .issue_key(scope, "Ordinary key", &["fast".into()], 3600)
        .await
        .unwrap();
    assert!(
        !store
            .agent_key_has_capability(scope, ordinary.id, "pools:write")
            .await
            .unwrap()
    );
    store.revoke_key(scope, issued.id).await.unwrap();
    assert!(
        !store
            .agent_key_has_capability(scope, issued.id, "pools:write")
            .await
            .unwrap()
    );

    assert!(
        store
            .exchange_agent_authorization(&request.device_secret)
            .await
            .is_err()
    );
    let count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM api_keys WHERE name='Niu for DeepSeek Harness'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(count, 1);
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn denied_and_expired_requests_never_issue_credentials(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let denied = store
        .create_agent_authorization("Claude Code")
        .await
        .unwrap();
    store
        .deny_agent_authorization(&denied.user_code)
        .await
        .unwrap();
    assert!(
        store
            .exchange_agent_authorization(&denied.device_secret)
            .await
            .is_err()
    );
    let expired = store.create_agent_authorization("Codex").await.unwrap();
    sqlx::query("UPDATE agent_authorizations SET created_at=clock_timestamp()-interval '20 minutes',expires_at=clock_timestamp()-interval '10 minutes' WHERE user_code=$1").bind(&expired.user_code).execute(&pool).await.unwrap();
    assert!(
        store
            .agent_authorization_view(&expired.user_code)
            .await
            .is_err()
    );
    assert!(
        store
            .exchange_agent_authorization(&expired.device_secret)
            .await
            .is_err()
    );
    let count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM api_keys WHERE name LIKE 'Niu for %'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(count, 0);
    assert!(
        store
            .create_agent_authorization("unknown host")
            .await
            .is_err()
    );
    assert!(
        store
            .create_agent_authorization_with_capabilities("Codex", &["platform:admin".into()])
            .await
            .is_err()
    );
    assert!(
        store
            .create_agent_authorization_with_capabilities(
                "Codex",
                &["pools:write".into(), "pools:write".into()]
            )
            .await
            .is_err()
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn management_grant_retains_discovery_but_refuses_dispatch_and_rotation_expansion(
    pool: PgPool,
) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let actor = store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(scope.project_id),
            },
            "Management owner",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let request = store
        .create_agent_authorization_with_capabilities(
            "Codex",
            &[
                "pools:read".into(),
                "pools:write".into(),
                "events:write".into(),
            ],
        )
        .await
        .unwrap();
    store
        .approve_agent_authorization_with_invocation(
            &request.user_code,
            scope,
            actor.operator_id,
            &["fast".into()],
            3600,
            false,
        )
        .await
        .unwrap();
    let issued = store
        .exchange_agent_authorization(&request.device_secret)
        .await
        .unwrap()
        .unwrap();
    let principal = store.authenticate(&issued.token).await.unwrap();
    assert!(principal.allows_model("fast"));
    assert!(!principal.allows_model("other-model"));
    assert!(
        !store
            .authenticate_with_ip(&issued.token, None)
            .await
            .unwrap()
            .invocation_allowed()
    );
    assert!(
        !store
            .dashboard_key_with_ip(scope, issued.id, None)
            .await
            .unwrap()
            .invocation_allowed()
    );
    assert!(
        !store
            .dashboard_key_by_id_with_ip(issued.id, None)
            .await
            .unwrap()
            .0
            .invocation_allowed()
    );
    assert!(
        store
            .agent_key_has_capability(scope, issued.id, "pools:read")
            .await
            .unwrap()
    );
    let initial_introspection = store.key_introspection(&principal).await.unwrap();
    assert_eq!(initial_introspection["invocation_allowed"], false);
    assert_eq!(
        initial_introspection["management_capabilities"],
        serde_json::json!(["events:write", "pools:read", "pools:write"])
    );
    let initial_expires_at_ms = initial_introspection["expires_at_ms"].as_i64().unwrap();
    let sub_id = uuid::Uuid::new_v4();
    store
        .set_event_subscription(
            &principal,
            sub_id,
            &niu_storage::EventSubscription {
                slug: "pool-alerts".into(),
                name: "Pool alerts".into(),
                endpoint: "https://example.test/webhooks/niu".into(),
                event_types: vec!["pool.changed".into()],
                enabled: true,
                revision: 0,
            },
            Some(&vec![7u8; 48]),
        )
        .await
        .unwrap();
    assert!(
        store
            .event_subscription_authorized(scope, "pool-alerts")
            .await
            .unwrap()
    );
    assert!(matches!(
        store
            .mark_dispatched(&principal, uuid::Uuid::new_v4())
            .await,
        Err(niu_storage::StoreError::InvocationDenied)
    ));
    let rotated = store.rotate_key(scope, issued.id).await.unwrap();
    assert!(
        store.authenticate(&issued.token).await.is_err(),
        "rotated-out token must not authenticate"
    );
    assert!(
        !store
            .agent_key_has_capability(scope, issued.id, "pools:read")
            .await
            .unwrap(),
        "revoked predecessor key must not retain active capability"
    );
    assert!(
        matches!(
            store.rotate_key(scope, issued.id).await,
            Err(niu_storage::StoreError::Conflict)
        ),
        "already rotated key cannot be rotated a second time"
    );
    let replacement = store.authenticate(&rotated.token).await.unwrap();
    assert!(replacement.allows_model("fast"));
    assert!(!replacement.allows_model("other-model"));
    assert!(!store.key_invocation_allowed(&replacement).await.unwrap());
    assert!(
        store
            .agent_key_has_capability(scope, rotated.id, "pools:read")
            .await
            .unwrap(),
        "rotation must retain explicitly approved management access"
    );
    assert!(
        store
            .agent_key_has_capability(scope, rotated.id, "pools:write")
            .await
            .unwrap()
    );
    assert!(
        store
            .agent_key_has_capability(scope, rotated.id, "events:write")
            .await
            .unwrap()
    );
    assert!(
        !store
            .agent_key_has_capability(scope, rotated.id, "evaluations:write")
            .await
            .unwrap(),
        "rotation must never expand unapproved capabilities"
    );
    let rotated_introspection = store.key_introspection(&replacement).await.unwrap();
    assert_eq!(rotated_introspection["invocation_allowed"], false);
    assert_eq!(
        rotated_introspection["allowed_models"],
        serde_json::json!(["fast"])
    );
    assert_eq!(
        rotated_introspection["expires_at_ms"].as_i64().unwrap(),
        initial_expires_at_ms,
        "rotation must preserve original absolute expiry"
    );
    assert_eq!(
        rotated_introspection["management_capabilities"],
        serde_json::json!(["events:write", "pools:read", "pools:write"])
    );
    let roots: (uuid::Uuid, uuid::Uuid, uuid::Uuid) = sqlx::query_as(
        "SELECT orig.spending_root_id, repl.spending_root_id, a.issued_key_id \
         FROM api_keys orig \
         JOIN api_keys repl ON repl.id = $2 \
         JOIN agent_authorizations a ON a.user_code = $3 \
         WHERE orig.id = $1",
    )
    .bind(issued.id)
    .bind(rotated.id)
    .bind(&request.user_code)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(roots.0, issued.id);
    assert_eq!(
        roots.1, issued.id,
        "rotation must preserve the spending root"
    );
    assert_eq!(
        roots.2, issued.id,
        "authorization record must preserve originally issued key provenance"
    );
    let audit_replacement: Option<uuid::Uuid> = sqlx::query_scalar(
        "SELECT replacement_key_id FROM key_audit_events WHERE key_id=$1 AND action='rotated'",
    )
    .bind(issued.id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(audit_replacement, Some(rotated.id));
    assert!(
        store
            .event_subscription_authorized(scope, "pool-alerts")
            .await
            .unwrap(),
        "active event subscription must remain authorized across key rotation"
    );
    // Perform a real non-inference management operation using the rotated replacement key.
    let saved_pool = store
        .set_workspace_model_pool(
            &replacement,
            &niu_storage::WorkspaceModelPool {
                slug: "rotated-routing".into(),
                name: "Rotated routing".into(),
                description: "Task-specific model policy".into(),
                enabled: true,
                revision: 0,
                candidates: vec![niu_storage::RoutePoolCandidate {
                    alias: "fast".into(),
                    priority: 100,
                    weight: 1000,
                    enabled: true,
                }],
                rules: vec![],
                default_action: niu_storage::RoutePoolDefaultAction::Candidates,
            },
        )
        .await
        .unwrap();
    assert_eq!(saved_pool.revision, 1);
    assert_eq!(
        store
            .workspace_model_pools(scope, None)
            .await
            .unwrap()
            .len(),
        1
    );
    assert!(matches!(
        store
            .mark_dispatched(&replacement, uuid::Uuid::new_v4())
            .await,
        Err(niu_storage::StoreError::InvocationDenied)
    ));
    // Repeated rotation continues to preserve exact capabilities and provenance.
    let rotated_twice = store.rotate_key(scope, rotated.id).await.unwrap();
    assert!(store.authenticate(&rotated.token).await.is_err());
    assert!(
        store
            .agent_key_has_capability(scope, rotated_twice.id, "pools:write")
            .await
            .unwrap()
    );
    // Narrowing or revoking the approver's authority revokes delegated management access.
    sqlx::query("UPDATE admin_operators SET role='viewer' WHERE id=$1")
        .bind(actor.operator_id)
        .execute(&pool)
        .await
        .unwrap();
    assert!(
        !store
            .agent_key_has_capability(scope, rotated_twice.id, "pools:write")
            .await
            .unwrap(),
        "demoting approver must revoke delegated management authority on rotated key"
    );
    assert!(
        !store
            .event_subscription_authorized(scope, "pool-alerts")
            .await
            .unwrap(),
        "demoting approver must stop event delivery authorization"
    );
}
