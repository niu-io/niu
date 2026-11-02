use niu_storage::{
    ColorMode, MIGRATOR, OperatorAuditActor, OperatorRole, OperatorScope, Store, StoreError,
    passwords::hash_password,
};
use sqlx::PgPool;

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn self_service_creation_is_atomic_scoped_and_idempotent(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let actor = store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(scope.project_id),
            },
            "Member",
            OperatorRole::Viewer,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let principal = store.authenticate_operator(&actor.token).await.unwrap();
    let key = [7u8; 32];
    let (first, second) = tokio::join!(
        store.create_account_organization(principal, "Independent", "USD", &key),
        store.create_account_organization(principal, "Independent", "USD", &key),
    );
    let created = first.unwrap();
    assert_eq!(created, second.unwrap());
    assert_eq!(created.slug, "independent");
    assert_ne!(created.organization_id, scope.organization_id);
    assert!(matches!(
        store
            .create_account_organization(principal, "Changed", "USD", &key)
            .await,
        Err(StoreError::Conflict)
    ));
    let result: (String, Option<uuid::Uuid>, i64, i64) = sqlx::query_as("SELECT o.role,o.project_id,a.credit_limit_nanos,(SELECT count(*) FROM customer_balance_entries e WHERE e.organization_id=o.organization_id) FROM admin_operators o JOIN customer_balance_accounts a ON a.organization_id=o.organization_id WHERE o.id=$1")
        .bind(created.operator_id).fetch_one(&pool).await.unwrap();
    assert_eq!(result, ("owner".into(), None, 0, 0));
    let linked: i64 =
        sqlx::query_scalar("SELECT count(*) FROM account_memberships WHERE identity_id=$1")
            .bind(actor.operator_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(linked, 2);
    let other = store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: None,
            },
            "Other member",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let other_principal = store.authenticate_operator(&other.token).await.unwrap();
    let other_created = store
        .create_account_organization(other_principal, "Independent", "USD", &key)
        .await
        .unwrap();
    assert_ne!(other_created.organization_id, created.organization_id);
    assert_eq!(other_created.slug, "independent-2");
    sqlx::query("UPDATE admin_operators SET revoked_at=clock_timestamp() WHERE id=$1")
        .bind(created.operator_id)
        .execute(&pool)
        .await
        .unwrap();
    assert!(matches!(
        store
            .create_account_organization(principal, "Independent", "USD", &key)
            .await,
        Err(StoreError::Conflict)
    ));
    sqlx::query("UPDATE admin_sessions SET revoked_at=clock_timestamp() WHERE id=$1")
        .bind(principal.session_id)
        .execute(&pool)
        .await
        .unwrap();
    assert!(matches!(
        store
            .create_account_organization(principal, "Independent", "USD", &key)
            .await,
        Err(StoreError::Unauthorized)
    ));
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn multi_organization_switching_claiming_and_profile_identity(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();

    // Create primary member Alice in initial organization with password login
    let alice_issued = store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: None,
            },
            "Alice",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let initial_pw_hash = hash_password("correct-horse-battery-staple").unwrap();
    store
        .set_member_password(
            alice_issued.operator_id,
            "alice@example.com",
            &initial_pw_hash,
            None,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let verified = store
        .member_password_credential("alice@example.com")
        .await
        .unwrap()
        .unwrap()
        .verify("correct-horse-battery-staple")
        .unwrap();
    let login_session = store.issue_password_login_session(verified).await.unwrap();
    let alice_principal = store
        .authenticate_operator(&login_session.token)
        .await
        .unwrap();

    // Self-service create Chinese-named Org 2 and explicit-slug Org 3
    let org_two = store
        .create_account_organization(alice_principal, "星河智能", "CNY", &[11u8; 32])
        .await
        .unwrap();
    assert_eq!(org_two.slug, "xing-he-zhi-neng");

    let org_three = store
        .create_account_organization_with_slug(
            alice_principal,
            "Acme Labs",
            Some("acme-labs"),
            "USD",
            Some(&[12u8; 32]),
        )
        .await
        .unwrap();
    assert_eq!(org_three.slug, "acme-labs");

    // Duplicate explicit slug is rejected
    assert!(matches!(
        store
            .create_account_organization_with_slug(
                alice_principal,
                "Acme Duplicate",
                Some("acme-labs"),
                "USD",
                Some(&[13u8; 32]),
            )
            .await,
        Err(StoreError::OrganizationSlugTaken)
    ));

    // Member organization list returns all 3 active organizations with slugs
    let listed = store.member_organizations(alice_principal).await.unwrap();
    assert_eq!(listed.len(), 3);
    assert_eq!(listed[0].id, scope.organization_id);
    assert_eq!(listed[1].id, org_two.organization_id);
    assert_eq!(listed[1].slug.as_deref(), Some("xing-he-zhi-neng"));
    assert_eq!(listed[2].id, org_three.organization_id);
    assert_eq!(listed[2].slug.as_deref(), Some("acme-labs"));

    // Switch session to Org 2 by slug and verify bearer token now authenticates in Org 2
    let switched_two = store
        .switch_session_organization(alice_principal, "xing-he-zhi-neng")
        .await
        .unwrap();
    assert_eq!(switched_two.id, org_two.operator_id);
    assert_eq!(switched_two.scope.organization_id, org_two.organization_id);
    assert_eq!(switched_two.role, OperatorRole::Owner);
    let reloaded = store
        .authenticate_operator(&login_session.token)
        .await
        .unwrap();
    assert_eq!(reloaded, switched_two);

    // Rename Org 2 while switched into Org 2; slug stays immutable
    let renamed = store
        .rename_organization(org_two.organization_id, "星河智能集团", Some(switched_two))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(renamed.name, "星河智能集团");
    assert_eq!(renamed.slug.as_deref(), Some("xing-he-zhi-neng"));

    // Profile and preferences resolve to the shared account identity across organizations
    store
        .set_member_color_mode(switched_two.id, ColorMode::Dark)
        .await
        .unwrap();
    assert_eq!(
        store.member_color_mode(alice_principal.id).await.unwrap(),
        "dark"
    );
    let updated_profile = store
        .update_member_profile(switched_two.id, "Alice Founder", None, 0)
        .await
        .unwrap();
    assert_eq!(updated_profile.name, "Alice Founder");
    assert_eq!(updated_profile.email.as_deref(), Some("alice@example.com"));
    assert_eq!(
        store.member_profile(alice_principal.id).await.unwrap().name,
        "Alice Founder"
    );

    // Separate organization Org B invites Alice as a workspace-scoped Admin
    let org_b = store
        .create_prepaid_organization("External Partner", "USD")
        .await
        .unwrap();
    let org_b_workspace = store.create_project(org_b, "Partner API").await.unwrap();
    let org_b_owner = store
        .create_operator(
            OperatorScope {
                organization_id: org_b,
                project_id: None,
            },
            "Partner Owner",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let invite = store
        .create_operator(
            OperatorScope {
                organization_id: org_b,
                project_id: Some(org_b_workspace.project_id),
            },
            "Alice Partner Admin",
            OperatorRole::Admin,
            3600,
            OperatorAuditActor::Operator(org_b_owner.operator_id),
        )
        .await
        .unwrap();

    // Foreign organization cannot be switched into before claiming the invite
    assert!(matches!(
        store
            .switch_session_organization(switched_two, &org_b.to_string())
            .await,
        Err(StoreError::Unauthorized)
    ));

    // Claiming the invite links the membership, revokes the one-time invite token, and switches session
    let claimed = store
        .claim_organization_membership(switched_two, &invite.token)
        .await
        .unwrap();
    assert_eq!(claimed.id, invite.operator_id);
    assert_eq!(claimed.scope.organization_id, org_b);
    assert_eq!(claimed.scope.project_id, Some(org_b_workspace.project_id));
    assert_eq!(claimed.role, OperatorRole::Admin);
    assert!(matches!(
        store.authenticate_operator(&invite.token).await,
        Err(StoreError::Unauthorized)
    ));

    // Workspace-scoped member in Org B cannot rename Org B
    assert!(matches!(
        store
            .rename_organization(org_b, "Hijacked Name", Some(claimed))
            .await,
        Err(StoreError::Unauthorized)
    ));

    // Org B owner cannot reset Alice's shared password (since Alice belongs to other organizations)
    let reset_hash = hash_password("partner-reset-attempt-password").unwrap();
    assert!(matches!(
        store
            .set_member_password(
                invite.operator_id,
                "alice@example.com",
                &reset_hash,
                None,
                OperatorAuditActor::Operator(org_b_owner.operator_id),
            )
            .await,
        Err(StoreError::Conflict)
    ));

    // Revoking Alice's initial operator in Org 1 still allows Alice to sign in with her password into her remaining active organizations
    store
        .revoke_operator(alice_issued.operator_id, OperatorAuditActor::Installation)
        .await
        .unwrap();
    let relogin_cred = store
        .member_password_credential("alice@example.com")
        .await
        .unwrap()
        .expect("credential remains active via remaining organization memberships");
    let relogin_verified = relogin_cred.verify("correct-horse-battery-staple").unwrap();
    let relogin_session = store
        .issue_password_login_session(relogin_verified)
        .await
        .unwrap();
    let relogin_principal = store
        .authenticate_operator(&relogin_session.token)
        .await
        .unwrap();
    assert_eq!(
        relogin_principal.scope.organization_id,
        org_two.organization_id
    );
}

#[sqlx::test(migrations = false)]
#[ignore = "requires PostgreSQL"]
async fn migration_preserves_existing_identities_scopes_and_financial_attribution(pool: PgPool) {
    // Run migrations up to 0403 (before 0404_organization_identity and 0405_organization_slugs)
    let mut pre_404_migrator = sqlx::migrate!();
    pre_404_migrator
        .migrations
        .to_mut()
        .retain(|m| m.version <= 403);
    pre_404_migrator.run(&pool).await.unwrap();

    let org_alpha = uuid::Uuid::new_v4();
    let org_beta = uuid::Uuid::new_v4();
    let ws_alpha = uuid::Uuid::new_v4();
    let ws_beta = uuid::Uuid::new_v4();
    let op_alpha = uuid::Uuid::new_v4();
    let op_beta = uuid::Uuid::new_v4();

    // Seed two organizations with operators sharing the same display name ("Shared Name"),
    // distinct workspaces, balances, attempts, and provider links prior to 0404/0405.
    sqlx::query("INSERT INTO organizations (id, name) VALUES ($1, 'Org Alpha'), ($2, 'Org Beta')")
        .bind(org_alpha)
        .bind(org_beta)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO customer_balance_accounts (id, organization_id, currency, credit_limit_nanos) \
         VALUES ($1, $2, 'USD', 500000), ($3, $4, 'CNY', 900000)",
    )
    .bind(uuid::Uuid::new_v4())
    .bind(org_alpha)
    .bind(uuid::Uuid::new_v4())
    .bind(org_beta)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO projects (id, organization_id, name) \
         VALUES ($1, $2, 'Alpha Prod'), ($3, $4, 'Beta Staging')",
    )
    .bind(ws_alpha)
    .bind(org_alpha)
    .bind(ws_beta)
    .bind(org_beta)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO admin_operators (id, name, role, organization_id, project_id) \
         VALUES ($1, 'Shared Name', 'owner', $2, NULL), \
                ($3, 'Shared Name', 'admin', $4, $5)",
    )
    .bind(op_alpha)
    .bind(org_alpha)
    .bind(op_beta)
    .bind(org_beta)
    .bind(ws_beta)
    .execute(&pool)
    .await
    .unwrap();

    let pw_hash = hash_password("migrated-member-password").unwrap();
    sqlx::query(
        "INSERT INTO member_password_credentials (operator_id, email, password_hash, revision) \
         VALUES ($1, 'shared@example.com', $2, 1)",
    )
    .bind(op_alpha)
    .bind(&pw_hash)
    .execute(&pool)
    .await
    .unwrap();

    let session_alpha = uuid::Uuid::new_v4();
    let session_beta = uuid::Uuid::new_v4();
    sqlx::query(
        "INSERT INTO admin_sessions (id, operator_id, token_hash, expires_at_unix) \
         VALUES ($1, $2, $3, extract(epoch FROM clock_timestamp())::bigint + 3600), \
                ($4, $5, $6, extract(epoch FROM clock_timestamp())::bigint + 3600)",
    )
    .bind(session_alpha)
    .bind(op_alpha)
    .bind([21u8; 32].as_slice())
    .bind(session_beta)
    .bind(op_beta)
    .bind([22u8; 32].as_slice())
    .execute(&pool)
    .await
    .unwrap();

    let provider_id = uuid::Uuid::new_v4();
    sqlx::query("INSERT INTO provider_businesses (id, name) VALUES ($1, 'Alpha Provider')")
        .bind(provider_id)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO provider_memberships (provider_id, operator_id, role, active) \
         VALUES ($1, $2, 'manager', true)",
    )
    .bind(provider_id)
    .bind(op_alpha)
    .execute(&pool)
    .await
    .unwrap();

    let operation_id = uuid::Uuid::new_v4();
    let attempt_id = uuid::Uuid::new_v4();
    let invoice_id = uuid::Uuid::new_v4();
    sqlx::query(
        "INSERT INTO operations (id, organization_id, project_id, model_alias) \
         VALUES ($1, $2, $3, 'gpt-4o')",
    )
    .bind(operation_id)
    .bind(org_alpha)
    .bind(ws_alpha)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO attempts (id, organization_id, project_id, operation_id, resource_id, offer_revision) \
         VALUES ($1, $2, $3, $4, 'res-1', 'rev-1')",
    )
    .bind(attempt_id)
    .bind(org_alpha)
    .bind(ws_alpha)
    .bind(operation_id)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO customer_invoices (id, organization_id, project_id, from_ms, to_ms, currency, amount_nanos, idempotency_key) \
         VALUES ($1, $2, $3, 1000, 2000, 'USD', 125000, $4)",
    )
    .bind(invoice_id)
    .bind(org_beta)
    .bind(ws_beta)
    .bind(uuid::Uuid::new_v4())
    .execute(&pool)
    .await
    .unwrap();

    // Apply remaining migrations (0404 and 0405)
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());

    // Verify no unauthorized identity merging occurred despite identical operator names
    let alpha_identity: uuid::Uuid =
        sqlx::query_scalar("SELECT identity_id FROM account_memberships WHERE operator_id = $1")
            .bind(op_alpha)
            .fetch_one(&pool)
            .await
            .unwrap();
    let beta_identity: uuid::Uuid =
        sqlx::query_scalar("SELECT identity_id FROM account_memberships WHERE operator_id = $1")
            .bind(op_beta)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(alpha_identity, op_alpha);
    assert_eq!(beta_identity, op_beta);
    assert_ne!(alpha_identity, beta_identity);

    // Verify backfilled organization slugs and preserved financial balances and workspace scopes
    let alpha_route = store
        .organization_route("org-alpha", None)
        .await
        .unwrap()
        .unwrap();
    let beta_route = store
        .organization_route("org-beta", None)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(alpha_route.id, org_alpha);
    assert_eq!(beta_route.id, org_beta);

    let alpha_balance: i64 = sqlx::query_scalar(
        "SELECT credit_limit_nanos FROM customer_balance_accounts WHERE organization_id = $1",
    )
    .bind(org_alpha)
    .fetch_one(&pool)
    .await
    .unwrap();
    let beta_balance: i64 = sqlx::query_scalar(
        "SELECT credit_limit_nanos FROM customer_balance_accounts WHERE organization_id = $1",
    )
    .bind(org_beta)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(alpha_balance, 500_000);
    assert_eq!(beta_balance, 900_000);

    let beta_op_view = store.operator(op_beta).await.unwrap().unwrap();
    assert_eq!(beta_op_view.organization_id, Some(org_beta));
    assert_eq!(beta_op_view.project_id, Some(ws_beta));
    assert_eq!(beta_op_view.role, OperatorRole::Admin);

    let migrated_cred = store
        .member_password_credential("shared@example.com")
        .await
        .unwrap()
        .unwrap()
        .verify("migrated-member-password")
        .unwrap();
    let migrated_session = store
        .issue_password_login_session(migrated_cred)
        .await
        .unwrap();
    let migrated_principal = store
        .authenticate_operator(&migrated_session.token)
        .await
        .unwrap();
    assert_eq!(migrated_principal.id, op_alpha);
    assert_eq!(migrated_principal.scope.organization_id, org_alpha);
    let visible_orgs = store
        .member_organizations(migrated_principal)
        .await
        .unwrap();
    assert_eq!(visible_orgs.len(), 1);
    assert_eq!(visible_orgs[0].id, org_alpha);

    let provider_links: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM provider_memberships WHERE provider_id = $1 AND operator_id = $2 AND active",
    )
    .bind(provider_id)
    .bind(op_alpha)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(provider_links, 1);

    let attempt_scope: (uuid::Uuid, uuid::Uuid) =
        sqlx::query_as("SELECT organization_id, project_id FROM attempts WHERE id = $1")
            .bind(attempt_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(attempt_scope, (org_alpha, ws_alpha));

    let invoice_scope: (uuid::Uuid, uuid::Uuid, i64) = sqlx::query_as(
        "SELECT organization_id, project_id, amount_nanos FROM customer_invoices WHERE id = $1",
    )
    .bind(invoice_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(invoice_scope, (org_beta, ws_beta, 125_000));
}
