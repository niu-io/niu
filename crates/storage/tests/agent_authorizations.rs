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
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM api_keys WHERE name='Niu for DeepSeek Harness'")
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
