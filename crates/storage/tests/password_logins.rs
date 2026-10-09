use niu_storage::{
    MIGRATOR, OperatorAuditActor, OperatorRole, OperatorScope, Store, StoreError,
    passwords::hash_password,
};
use sqlx::PgPool;

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn password_identity_conflicts_do_not_revoke_or_reassign_members(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let workspace = store.default_workspace().await.unwrap();
    let scope = OperatorScope {
        organization_id: workspace.organization_id,
        project_id: Some(workspace.project_id),
    };
    let first = store
        .create_operator(
            scope,
            "First member",
            OperatorRole::Viewer,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let second = store
        .create_operator(
            scope,
            "Second member",
            OperatorRole::Admin,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let hash = hash_password("synthetic identity passphrase").unwrap();
    store
        .set_member_password(
            first.operator_id,
            "unique@example.test",
            &hash,
            None,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    assert!(matches!(
        store
            .set_member_password(
                second.operator_id,
                "UNIQUE@example.test",
                &hash,
                None,
                OperatorAuditActor::Installation
            )
            .await,
        Err(StoreError::Conflict)
    ));
    assert!(store.authenticate_operator(&second.token).await.is_ok());
    assert_eq!(
        store
            .operator_audit_events(second.operator_id, None, 100)
            .await
            .unwrap()
            .data
            .len(),
        2
    );
    for (email, stored_hash) in [
        ("not-an-email", hash.as_str()),
        ("member@example.test", "$argon2id$v=19$invalid"),
    ] {
        assert!(matches!(
            store
                .set_member_password(
                    second.operator_id,
                    email,
                    stored_hash,
                    None,
                    OperatorAuditActor::Installation
                )
                .await,
            Err(StoreError::InvalidOperator)
        ));
    }
    let credential = store
        .member_password_credential("unique@example.test")
        .await
        .unwrap()
        .unwrap();
    let workers = niu_storage::PasswordWorkers::new(1).unwrap();
    let verified = workers
        .verify(credential, "synthetic identity passphrase".into())
        .await
        .unwrap()
        .unwrap();
    let session = store.issue_password_login_session(verified).await.unwrap();
    assert_eq!(session.operator_id, first.operator_id);
    assert_eq!(
        store
            .authenticate_operator(&session.token)
            .await
            .unwrap()
            .role,
        OperatorRole::Viewer
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn member_password_reset_revokes_sessions_and_rejects_verified_stale_logins(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let workspace = store.default_workspace().await.unwrap();
    let scope = OperatorScope {
        organization_id: workspace.organization_id,
        project_id: Some(workspace.project_id),
    };
    let member = store
        .create_operator(
            scope,
            "Password member",
            OperatorRole::Viewer,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let first = hash_password("synthetic first passphrase").unwrap();
    let second = hash_password("synthetic second passphrase").unwrap();
    assert_eq!(
        store
            .set_member_password(
                member.operator_id,
                "Member@Example.test",
                &first,
                None,
                OperatorAuditActor::Installation
            )
            .await
            .unwrap(),
        1
    );
    assert!(store.authenticate_operator(&member.token).await.is_err());
    assert!(
        store
            .member_password_credential("unknown@example.test")
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        store
            .member_password_credential("member@example.test")
            .await
            .unwrap()
            .unwrap()
            .verify("wrong synthetic passphrase")
            .is_none()
    );
    let stale = store
        .member_password_credential("member@example.test")
        .await
        .unwrap()
        .unwrap()
        .verify("synthetic first passphrase")
        .unwrap();
    let credential = store
        .member_password_credential("MEMBER@example.test")
        .await
        .unwrap()
        .unwrap()
        .verify("synthetic first passphrase")
        .unwrap();
    let issued = store
        .issue_password_login_session(credential)
        .await
        .unwrap();
    let reopened = Store::from_pool(pool.clone());
    let principal = reopened.authenticate_operator(&issued.token).await.unwrap();
    assert_eq!(principal.scope, scope);
    assert_eq!(principal.role, OperatorRole::Viewer);
    assert!(matches!(
        store
            .set_member_password(
                member.operator_id,
                "member@example.test",
                &second,
                None,
                OperatorAuditActor::Installation
            )
            .await,
        Err(StoreError::Conflict)
    ));
    assert!(store.authenticate_operator(&issued.token).await.is_ok());
    assert_eq!(
        store
            .set_member_password(
                member.operator_id,
                "member@example.test",
                &second,
                Some(1),
                OperatorAuditActor::Installation
            )
            .await
            .unwrap(),
        2
    );
    assert!(matches!(
        store.issue_password_login_session(stale).await,
        Err(StoreError::Unauthorized)
    ));
    assert!(store.authenticate_operator(&issued.token).await.is_err());
    assert!(
        store
            .member_password_credential("member@example.test")
            .await
            .unwrap()
            .unwrap()
            .verify("synthetic first passphrase")
            .is_none()
    );
    let current = reopened
        .member_password_credential("member@example.test")
        .await
        .unwrap()
        .unwrap()
        .verify("synthetic second passphrase")
        .unwrap();
    let current_session = reopened
        .issue_password_login_session(current)
        .await
        .unwrap();
    assert!(
        reopened
            .authenticate_operator(&current_session.token)
            .await
            .is_ok()
    );
    let revoked_snapshot = reopened
        .member_password_credential("member@example.test")
        .await
        .unwrap()
        .unwrap()
        .verify("synthetic second passphrase")
        .unwrap();
    store
        .revoke_operator(member.operator_id, OperatorAuditActor::Installation)
        .await
        .unwrap();
    assert!(
        store
            .member_password_credential("member@example.test")
            .await
            .unwrap()
            .is_none()
    );
    assert!(matches!(
        store.issue_password_login_session(revoked_snapshot).await,
        Err(StoreError::Unauthorized)
    ));
    assert!(
        store
            .authenticate_operator(&current_session.token)
            .await
            .is_err()
    );
    let audit = store
        .operator_audit_events(member.operator_id, None, 100)
        .await
        .unwrap();
    assert_eq!(
        audit
            .data
            .iter()
            .filter(|event| event.action == "password_changed")
            .count(),
        2
    );
    let serialized = serde_json::to_string(&audit).unwrap();
    assert!(!serialized.contains(&first));
    assert!(!serialized.contains(&second));
    let members = serde_json::to_string(&store.operators().await.unwrap()).unwrap();
    assert!(!members.contains("password_hash"));
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn development_account_is_durable_and_does_not_reset_saved_credentials(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let hash = niu_storage::passwords::hash_development_password("Hello123").unwrap();
    store
        .provision_development_member("demo@niu.io", &hash)
        .await
        .unwrap();
    let credential = store
        .member_password_credential("demo@niu.io")
        .await
        .unwrap()
        .unwrap();
    let issued = store
        .issue_password_login_session(credential.verify("Hello123").unwrap())
        .await
        .unwrap();
    let principal = store.authenticate_operator(&issued.token).await.unwrap();
    assert_eq!(principal.role, OperatorRole::Owner);
    assert_eq!(
        principal.scope.organization_id,
        store.default_workspace().await.unwrap().organization_id
    );
    let profile = store.member_profile(principal.id).await.unwrap();
    assert_eq!(profile.name, "Demo");
    assert_eq!(profile.email.as_deref(), Some("demo@niu.io"));
    store
        .update_member_profile(principal.id, "Saved name", None, profile.revision)
        .await
        .unwrap();
    let different_hash = hash_password("AnotherPassword123").unwrap();
    store
        .provision_development_member("demo@niu.io", &different_hash)
        .await
        .unwrap();
    assert_eq!(
        store.member_profile(principal.id).await.unwrap().name,
        "Saved name"
    );
    assert!(
        store
            .member_password_credential("demo@niu.io")
            .await
            .unwrap()
            .unwrap()
            .verify("Hello123")
            .is_some()
    );
    assert!(
        store
            .member_password_credential("demo@niu.io")
            .await
            .unwrap()
            .unwrap()
            .verify("AnotherPassword123")
            .is_none()
    );
}
