use niu_storage::{
    MIGRATOR, OperatorAuditActor, OperatorPrincipal, OperatorRole, OperatorScope, Store,
    StoreError, passwords::hash_password,
};
use sqlx::PgPool;
use uuid::Uuid;

async fn fixture(pool: &PgPool) -> (Store, OperatorScope, Uuid) {
    MIGRATOR.run(pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let workspace = store.default_workspace().await.unwrap();
    let scope = OperatorScope {
        organization_id: workspace.organization_id,
        project_id: None,
    };
    let owner = store
        .create_operator(
            scope,
            "Inviting Owner",
            OperatorRole::Owner,
            3_600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    (store, scope, owner.operator_id)
}

async fn recipient_account(
    store: &Store,
    email: &str,
) -> (OperatorScope, Uuid, OperatorPrincipal, String) {
    let organization_id = store.create_organization("Recipient Org").await.unwrap();
    let workspace = store
        .create_project(organization_id, "Recipient Workspace")
        .await
        .unwrap();
    let scope = OperatorScope {
        organization_id,
        project_id: Some(workspace.project_id),
    };
    let recipient = store
        .create_operator(
            scope,
            "Invited Person",
            OperatorRole::Viewer,
            3_600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let hash = hash_password("synthetic invitation passphrase").unwrap();
    store
        .set_member_password(
            recipient.operator_id,
            email,
            &hash,
            None,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    // A password change revokes prior sessions, so issue and authenticate one
    // after the credential is saved.
    let issued = store
        .create_operator_session(
            recipient.operator_id,
            3_600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let principal = store.authenticate_operator(&issued.token).await.unwrap();
    assert_eq!(principal.id, recipient.operator_id);
    (scope, recipient.operator_id, principal, issued.token)
}

fn token_digest(token: &str) -> Vec<u8> {
    use sha2::{Digest, Sha256};
    Sha256::digest(token.as_bytes()).to_vec()
}

#[sqlx::test(migrations = "./migrations")]
#[ignore = "requires PostgreSQL"]
async fn invitation_creation_stores_only_digest_and_replaces_pending_links(pool: PgPool) {
    let (store, scope, owner_id) = fixture(&pool).await;
    let created = store
        .create_member_invitation(
            scope,
            "Person@Example.Test",
            Some("  New Member  "),
            OperatorRole::Viewer,
            7 * 86_400,
            OperatorAuditActor::Operator(owner_id),
        )
        .await
        .unwrap();
    assert!(created.token.starts_with("niu_invite_"));
    assert_eq!(created.invitation.recipient_email, "person@example.test");
    assert_eq!(
        created.invitation.recipient_name.as_deref(),
        Some("New Member")
    );
    assert_eq!(created.invitation.role, OperatorRole::Viewer);
    assert_eq!(created.invitation.organization_id, scope.organization_id);
    assert_eq!(created.invitation.project_id, None);
    assert_eq!(created.invitation.delivery, "not_configured");
    assert_eq!(
        created.invitation.status,
        niu_storage::MemberInvitationStatus::Pending
    );

    let plaintext_matches: i64 =
        sqlx::query_scalar("SELECT count(*) FROM member_invitations WHERE token_sha256 = $1")
            .bind(created.token.as_bytes())
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(plaintext_matches, 0);
    let stored_digest: Vec<u8> = sqlx::query_scalar("SELECT token_sha256 FROM member_invitations")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(stored_digest, token_digest(&created.token));

    let replacement = store
        .create_member_invitation(
            scope,
            "person@example.test",
            Some("New Member"),
            OperatorRole::Admin,
            30 * 86_400,
            OperatorAuditActor::Operator(owner_id),
        )
        .await
        .unwrap();
    assert_ne!(replacement.token, created.token);
    let events: Vec<String> = sqlx::query_scalar(
        "SELECT action FROM member_invitation_events WHERE invitation_id = $1 \
         ORDER BY created_at, id",
    )
    .bind(created.invitation.id)
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(events, vec!["created".to_string(), "replaced".to_string()]);
    let listed = store.member_invitations(scope).await.unwrap();
    assert_eq!(listed.len(), 2);
    assert!(
        listed
            .iter()
            .any(|invitation| invitation.id == created.invitation.id
                && invitation.status == niu_storage::MemberInvitationStatus::Canceled)
    );
}

#[sqlx::test(migrations = "./migrations")]
#[ignore = "requires PostgreSQL"]
async fn acceptance_is_one_time_bound_to_email_and_exact_scope(pool: PgPool) {
    let (store, scope, owner_id) = fixture(&pool).await;
    let (_, _, recipient, recipient_token) =
        recipient_account(&store, "recipient@example.test").await;
    let owner_principal = store
        .create_operator_session(owner_id, 3_600, OperatorAuditActor::Installation)
        .await
        .unwrap();
    let owner_principal = store
        .authenticate_operator(&owner_principal.token)
        .await
        .unwrap();
    let workspace_id: Uuid =
        sqlx::query_scalar("SELECT id FROM projects WHERE organization_id = $1 LIMIT 1")
            .bind(scope.organization_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    let created = store
        .create_member_invitation(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(workspace_id),
            },
            "recipient@example.test",
            None,
            OperatorRole::Admin,
            3_600,
            OperatorAuditActor::Operator(owner_id),
        )
        .await
        .unwrap();

    let preview = store
        .preview_member_invitation(recipient, &created.token)
        .await
        .unwrap();
    assert!(preview.email_matches);
    assert_eq!(
        preview.caller_email.as_deref(),
        Some("recipient@example.test")
    );
    assert_eq!(preview.invitation.project_id, Some(workspace_id));
    let owner_preview = store
        .preview_member_invitation(owner_principal, &created.token)
        .await
        .unwrap();
    assert!(!owner_preview.email_matches);

    assert!(matches!(
        store
            .accept_member_invitation(owner_principal, &created.token)
            .await,
        Err(StoreError::InvitationIdentityMismatch)
    ));

    let accepted = store
        .accept_member_invitation(recipient, &created.token)
        .await
        .unwrap();
    assert!(!accepted.replayed);
    let saved_operator: Option<Uuid> =
        sqlx::query_scalar("SELECT accepted_operator_id FROM member_invitations WHERE id = $1")
            .bind(accepted.invitation.id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(saved_operator, Some(accepted.operator_id));
    assert_eq!(
        accepted.invitation.status,
        niu_storage::MemberInvitationStatus::Accepted
    );
    let (role, project_id): (String, Option<Uuid>) =
        sqlx::query_as("SELECT role, project_id FROM admin_operators WHERE id = $1")
            .bind(accepted.operator_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(role, "admin");
    assert_eq!(project_id, Some(workspace_id));
    let switched_operator: Uuid =
        sqlx::query_scalar("SELECT operator_id FROM admin_sessions WHERE token_hash = $1")
            .bind(token_digest(&recipient_token))
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(switched_operator, accepted.operator_id);
    let member_count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM admin_operators WHERE organization_id = $1")
            .bind(scope.organization_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(member_count, 2);

    // Same-identity replay reconciles the completed membership without creating
    // another operator or returning a reusable credential. The replayed caller
    // now authenticates as the newly created member session.
    let replayed_principal = store.authenticate_operator(&recipient_token).await.unwrap();
    assert_eq!(replayed_principal.id, accepted.operator_id);
    let replay = store
        .accept_member_invitation(replayed_principal, &created.token)
        .await
        .unwrap();
    assert!(replay.replayed);
    assert_eq!(replay.operator_id, accepted.operator_id);
    let member_count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM admin_operators WHERE organization_id = $1")
            .bind(scope.organization_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(member_count, 2);

    // A different account holding the same link cannot replay the secret.
    assert!(matches!(
        store
            .accept_member_invitation(owner_principal, &created.token)
            .await,
        Err(StoreError::InvitationUnavailable)
    ));
    let events: Vec<String> = sqlx::query_scalar(
        "SELECT action FROM member_invitation_events WHERE invitation_id = $1 ORDER BY created_at, id",
    )
    .bind(created.invitation.id)
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(events, vec!["created".to_string(), "accepted".to_string()]);
    let audit_actor: (String, Option<Uuid>) = sqlx::query_as(
        "SELECT actor_kind, actor_operator_id FROM operator_audit_events \
         WHERE target_operator_id = $1 AND action = 'operator_created'",
    )
    .bind(accepted.operator_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(audit_actor, ("operator".to_string(), Some(owner_id)));
}

#[sqlx::test(migrations = "./migrations")]
#[ignore = "requires PostgreSQL"]
async fn canceled_expired_replaced_and_unauthorized_invitations_are_rejected(pool: PgPool) {
    let (store, scope, owner_id) = fixture(&pool).await;
    let (_, _, recipient, _) = recipient_account(&store, "recipient@example.test").await;
    let actor = OperatorAuditActor::Operator(owner_id);

    let canceled = store
        .create_member_invitation(
            scope,
            "recipient@example.test",
            None,
            OperatorRole::Viewer,
            3_600,
            actor,
        )
        .await
        .unwrap();
    store
        .cancel_member_invitation(canceled.invitation.id, actor)
        .await
        .unwrap();
    store
        .cancel_member_invitation(canceled.invitation.id, actor)
        .await
        .unwrap();
    assert!(matches!(
        store
            .accept_member_invitation(recipient, &canceled.token)
            .await,
        Err(StoreError::InvitationUnavailable)
    ));

    let expiring = store
        .create_member_invitation(
            scope,
            "recipient@example.test",
            None,
            OperatorRole::Viewer,
            3_600,
            actor,
        )
        .await
        .unwrap();
    sqlx::query(
        "UPDATE member_invitations SET created_at = clock_timestamp() - interval '2 hours', expires_at = clock_timestamp() - interval '1 hour' WHERE id = $1",
    )
    .bind(expiring.invitation.id)
    .execute(&pool)
    .await
    .unwrap();
    assert!(matches!(
        store
            .accept_member_invitation(recipient, &expiring.token)
            .await,
        Err(StoreError::InvitationUnavailable)
    ));

    let workspace_id: Uuid =
        sqlx::query_scalar("SELECT id FROM projects WHERE organization_id = $1 LIMIT 1")
            .bind(scope.organization_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    let project_owner = store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(workspace_id),
            },
            "Workspace Owner",
            OperatorRole::Owner,
            3_600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let project_actor = OperatorAuditActor::Operator(project_owner.operator_id);
    assert!(matches!(
        store
            .create_member_invitation(
                scope,
                "another@example.test",
                None,
                OperatorRole::Viewer,
                3_600,
                project_actor,
            )
            .await,
        Err(StoreError::InvitationAuthorityLost)
    ));
    let workspace_invite = store
        .create_member_invitation(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(workspace_id),
            },
            "another@example.test",
            None,
            OperatorRole::Viewer,
            3_600,
            project_actor,
        )
        .await
        .unwrap();
    assert_eq!(workspace_invite.invitation.project_id, Some(workspace_id));

    for (email, ttl) in [
        ("not-an-email", 3_600),
        ("recipient@example.test", 10),
        ("recipient@example.test", 31 * 86_400),
    ] {
        assert!(matches!(
            store
                .create_member_invitation(scope, email, None, OperatorRole::Viewer, ttl, actor)
                .await,
            Err(StoreError::InvalidInvitation)
        ));
    }
}

#[sqlx::test(migrations = "./migrations")]
#[ignore = "requires PostgreSQL"]
async fn existing_members_and_demoted_inviters_cannot_grant_access(pool: PgPool) {
    let (store, scope, owner_id) = fixture(&pool).await;
    let hash = hash_password("synthetic invitation passphrase").unwrap();
    store
        .set_member_password(
            owner_id,
            "owner@example.test",
            &hash,
            None,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let actor = OperatorAuditActor::Operator(owner_id);
    assert!(matches!(
        store
            .create_member_invitation(
                scope,
                "owner@example.test",
                None,
                OperatorRole::Viewer,
                3_600,
                actor,
            )
            .await,
        Err(StoreError::InvitationRecipientAlreadyMember)
    ));

    let (_, _, recipient, _) = recipient_account(&store, "recipient-two@example.test").await;
    let created = store
        .create_member_invitation(
            scope,
            "recipient-two@example.test",
            None,
            OperatorRole::Viewer,
            3_600,
            actor,
        )
        .await
        .unwrap();
    sqlx::query("UPDATE admin_operators SET role = 'admin' WHERE id = $1")
        .bind(owner_id)
        .execute(&pool)
        .await
        .unwrap();
    assert!(matches!(
        store
            .accept_member_invitation(recipient, &created.token)
            .await,
        Err(StoreError::InvitationAuthorityLost)
    ));
    let rejected_events: Vec<String> =
        sqlx::query_scalar("SELECT action FROM member_invitation_events WHERE invitation_id = $1")
            .bind(created.invitation.id)
            .fetch_all(&pool)
            .await
            .unwrap();
    assert_eq!(rejected_events, vec!["created".to_string()]);
}
