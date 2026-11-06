use niu_storage::{MIGRATOR, OperatorAuditActor, OperatorRole, OperatorScope, Store, StoreError};
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
                strategy: Default::default(),
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

async fn rotation_grants(pool: &PgPool, key_id: uuid::Uuid) -> Vec<(String, uuid::Uuid)> {
    sqlx::query_as(
        "SELECT capability,authorization_id FROM agent_key_capabilities WHERE key_id=$1 ORDER BY capability",
    )
    .bind(key_id)
    .fetch_all(pool)
    .await
    .unwrap()
}

/// Compare the replacement's fixed fields and approved grants with its direct
/// predecessor. Expiry is compared as an absolute timestamp, not a lifetime.
async fn assert_rotation_inheritance(pool: &PgPool, original: uuid::Uuid, replacement: uuid::Uuid) {
    let fields: (bool, bool, bool, bool) = sqlx::query_as(
        "SELECT r.allowed_models=o.allowed_models,r.invocation_allowed=o.invocation_allowed,r.expires_at=o.expires_at,r.spending_root_id=o.spending_root_id FROM api_keys r JOIN api_keys o ON o.id=$1 WHERE r.id=$2",
    )
    .bind(original)
    .bind(replacement)
    .fetch_one(pool)
    .await
    .unwrap();
    assert!(fields.0, "rotation changed the fixed model scope");
    assert!(fields.1, "rotation changed the invocation flag");
    assert!(
        fields.2,
        "rotation renewed or shortened the absolute expiry"
    );
    assert!(fields.3, "rotation changed the spending root");
    assert_eq!(
        rotation_grants(pool, replacement).await,
        rotation_grants(pool, original).await,
        "rotation changed the explicitly approved management grants"
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn management_rotation_keeps_exact_authority_across_races_retries_and_approver_loss(
    pool: PgPool,
) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let owner = store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(scope.project_id),
            },
            "Rotation approver",
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
                "events:read".into(),
                "events:write".into(),
            ],
        )
        .await
        .unwrap();
    store
        .approve_agent_authorization_with_invocation(
            &request.user_code,
            scope,
            owner.operator_id,
            &["fast".into(), "steady".into()],
            7200,
            false,
        )
        .await
        .unwrap();
    let issued = store
        .exchange_agent_authorization(&request.device_secret)
        .await
        .unwrap()
        .unwrap();
    let issued_principal = store.authenticate(&issued.token).await.unwrap();
    let baseline = store.key_introspection(&issued_principal).await.unwrap();
    assert_eq!(baseline["invocation_allowed"], false);
    assert_eq!(
        baseline["allowed_models"],
        serde_json::json!(["fast", "steady"])
    );
    assert_eq!(
        baseline["management_capabilities"],
        serde_json::json!(["events:read", "events:write", "pools:read", "pools:write"])
    );
    let baseline_expiry = baseline["expires_at_ms"].as_i64().unwrap();
    assert_eq!(rotation_grants(&pool, issued.id).await.len(), 4);

    // Two concurrent rotations of the same live management key: exactly one
    // replacement is minted and the loser observes the revoked predecessor.
    let (left, right) = tokio::join!(
        store.rotate_key(scope, issued.id),
        store.rotate_key(scope, issued.id)
    );
    let (replacement, replacement_token) = match (left, right) {
        (Ok(key), Err(StoreError::Conflict)) | (Err(StoreError::Conflict), Ok(key)) => {
            (key.id, key.token)
        }
        _ => panic!("exactly one concurrent rotation must commit"),
    };
    assert!(store.authenticate(&issued.token).await.is_err());
    assert_rotation_inheritance(&pool, issued.id, replacement).await;
    let replacement_principal = store.authenticate(&replacement_token).await.unwrap();
    let rotated = store
        .key_introspection(&replacement_principal)
        .await
        .unwrap();
    assert_eq!(rotated["expires_at_ms"].as_i64().unwrap(), baseline_expiry);
    assert_eq!(rotated["allowed_models"], baseline["allowed_models"]);
    assert_eq!(rotated["invocation_allowed"], false);
    assert_eq!(
        rotated["management_capabilities"],
        baseline["management_capabilities"]
    );
    assert!(
        !store
            .agent_key_has_capability(scope, replacement, "evaluations:write")
            .await
            .unwrap(),
        "rotation must never add an unapproved capability"
    );
    let saved = store
        .set_workspace_model_pool(
            &replacement_principal,
            &niu_storage::WorkspaceModelPool {
                slug: "race-routing".into(),
                name: "Race routing".into(),
                description: "Authorized after a concurrent rotation".into(),
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
                strategy: Default::default(),
            },
        )
        .await
        .unwrap();
    assert_eq!(saved.revision, 1);
    let rotated_audit: Option<uuid::Uuid> = sqlx::query_scalar(
        "SELECT replacement_key_id FROM key_audit_events WHERE key_id=$1 AND action='rotated'",
    )
    .bind(issued.id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(rotated_audit, Some(replacement));

    // A lost rotation response retries with the recorded request identity: the
    // committed replacement is recovered without another rotation or secret.
    let retry_request = uuid::Uuid::new_v4();
    let retried = store
        .rotate_key_request(scope, retry_request, replacement)
        .await
        .unwrap();
    let retried_token = retried
        .token
        .clone()
        .expect("first rotation returns one secret");
    assert!(store.authenticate(&replacement_token).await.is_err());
    assert_rotation_inheritance(&pool, replacement, retried.id).await;
    assert_rotation_inheritance(&pool, issued.id, retried.id).await;
    let retried_principal = store.authenticate(&retried_token).await.unwrap();
    let retried_view = store.key_introspection(&retried_principal).await.unwrap();
    assert_eq!(
        retried_view["expires_at_ms"].as_i64().unwrap(),
        baseline_expiry
    );
    assert_eq!(retried_view["allowed_models"], baseline["allowed_models"]);
    assert_eq!(retried_view["invocation_allowed"], false);
    assert_eq!(
        retried_view["management_capabilities"],
        baseline["management_capabilities"]
    );
    let saved_retry = store
        .set_workspace_model_pool(
            &retried_principal,
            &niu_storage::WorkspaceModelPool {
                slug: "retry-routing".into(),
                name: "Retry routing".into(),
                description: "Authorized after a recovered rotation".into(),
                enabled: true,
                revision: 0,
                candidates: vec![niu_storage::RoutePoolCandidate {
                    alias: "steady".into(),
                    priority: 100,
                    weight: 1000,
                    enabled: true,
                }],
                rules: vec![],
                default_action: niu_storage::RoutePoolDefaultAction::Candidates,
                strategy: Default::default(),
            },
        )
        .await
        .unwrap();
    assert_eq!(saved_retry.revision, 1);
    let replay = store
        .rotate_key_request(scope, retry_request, replacement)
        .await
        .unwrap();
    assert_eq!(replay.id, retried.id);
    assert!(replay.token.is_none());
    let status = store
        .key_request_status(scope, retry_request)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(status.key_id, retried.id);
    assert_eq!(status.action, "rotate");
    let retried_audit: Option<uuid::Uuid> = sqlx::query_scalar(
        "SELECT replacement_key_id FROM key_audit_events WHERE key_id=$1 AND action='rotated'",
    )
    .bind(replacement)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(retried_audit, Some(retried.id));
    let rotation_audits: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM key_audit_events WHERE action='rotated' AND key_id=ANY($1)",
    )
    .bind(vec![issued.id, replacement])
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(
        rotation_audits, 2,
        "each committed rotation records exactly one audit event; replays do not"
    );

    // Capability scope and rotation stay tenant-bound.
    let other = store
        .create_project(scope.organization_id, "rotation-elsewhere")
        .await
        .unwrap();
    assert!(
        !store
            .agent_key_has_capability(other, retried.id, "pools:read")
            .await
            .unwrap()
    );
    assert!(
        store
            .agent_key_capabilities(other, retried.id)
            .await
            .unwrap()
            .is_empty()
    );
    assert!(matches!(
        store.rotate_key(other, retried.id).await,
        Err(StoreError::Conflict)
    ));
    assert!(store.authenticate(&retried_token).await.is_ok());

    // Rotation racing revocation: whichever transaction wins, the predecessor
    // stops authenticating and at most one live replacement exists. The losing
    // rotation reports a conflict instead of minting an unverified credential.
    let revocable_request = store
        .create_agent_authorization_with_capabilities(
            "Claude Code",
            &["pools:read".into(), "pools:write".into()],
        )
        .await
        .unwrap();
    store
        .approve_agent_authorization_with_invocation(
            &revocable_request.user_code,
            scope,
            owner.operator_id,
            &["steady".into()],
            7200,
            true,
        )
        .await
        .unwrap();
    let revocable = store
        .exchange_agent_authorization(&revocable_request.device_secret)
        .await
        .unwrap()
        .unwrap();
    let enabled = store.rotate_key(scope, revocable.id).await.unwrap();
    assert!(store.authenticate(&revocable.token).await.is_err());
    assert_rotation_inheritance(&pool, revocable.id, enabled.id).await;
    let enabled_principal = store.authenticate(&enabled.token).await.unwrap();
    assert!(
        enabled_principal.invocation_allowed(),
        "rotation must preserve enabled invocation authority"
    );
    assert_eq!(
        store
            .agent_key_capabilities(scope, enabled.id)
            .await
            .unwrap(),
        vec!["pools:read".to_string(), "pools:write".to_string()]
    );
    let (rotation, revocation) = tokio::join!(
        store.rotate_key(scope, enabled.id),
        store.revoke_key(scope, enabled.id)
    );
    revocation.unwrap();
    assert!(store.authenticate(&enabled.token).await.is_err());
    let live_descendants: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM api_keys WHERE spending_root_id=$1 AND revoked_at IS NULL",
    )
    .bind(revocable.id)
    .fetch_one(&pool)
    .await
    .unwrap();
    match rotation {
        Ok(replacement) => {
            assert_eq!(live_descendants, 1);
            assert_rotation_inheritance(&pool, enabled.id, replacement.id).await;
            let principal = store.authenticate(&replacement.token).await.unwrap();
            assert!(principal.invocation_allowed());
            assert_eq!(
                store
                    .agent_key_capabilities(scope, replacement.id)
                    .await
                    .unwrap(),
                vec!["pools:read".to_string(), "pools:write".to_string()]
            );
            assert_eq!(
                store
                    .set_workspace_model_pool(
                        &principal,
                        &niu_storage::WorkspaceModelPool {
                            slug: "revoke-race-routing".into(),
                            name: "Revoke race routing".into(),
                            description: "Authorized if rotation precedes revocation".into(),
                            enabled: true,
                            revision: 0,
                            candidates: vec![niu_storage::RoutePoolCandidate {
                                alias: "steady".into(),
                                priority: 100,
                                weight: 1000,
                                enabled: true,
                            }],
                            rules: vec![],
                            default_action: niu_storage::RoutePoolDefaultAction::Candidates,
                            strategy: Default::default(),
                        },
                    )
                    .await
                    .unwrap()
                    .revision,
                1
            );
        }
        Err(StoreError::Conflict) => assert_eq!(live_descendants, 0),
        Err(_) => panic!("unexpected rotation outcome while racing revocation"),
    }

    // Losing the approving operator removes delegated management authority;
    // retained grant rows stay as history and no later rotation revives them.
    store
        .revoke_operator(owner.operator_id, OperatorAuditActor::Installation)
        .await
        .unwrap();
    assert!(
        !store
            .agent_key_has_capability(scope, retried.id, "pools:read")
            .await
            .unwrap()
    );
    assert!(
        store
            .agent_key_capabilities(scope, retried.id)
            .await
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        rotation_grants(&pool, retried.id).await.len(),
        4,
        "historical grant rows remain attached to the key"
    );
    let without_approver = store.key_introspection(&retried_principal).await.unwrap();
    assert_eq!(
        without_approver["management_capabilities"],
        serde_json::json!([])
    );
    assert_eq!(
        without_approver["expires_at_ms"].as_i64().unwrap(),
        baseline_expiry
    );
    assert_eq!(without_approver["invocation_allowed"], false);
    assert!(matches!(
        store
            .set_workspace_model_pool(
                &retried_principal,
                &niu_storage::WorkspaceModelPool {
                    slug: "revoked-approver".into(),
                    name: "Revoked approver".into(),
                    description: "Must be refused".into(),
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
                    strategy: Default::default(),
                },
            )
            .await,
        Err(StoreError::Unauthorized)
    ));
    let after_loss = store.rotate_key(scope, retried.id).await.unwrap();
    assert!(store.authenticate(&retried_token).await.is_err());
    assert!(rotation_grants(&pool, after_loss.id).await.is_empty());
    let after_loss_principal = store.authenticate(&after_loss.token).await.unwrap();
    let after_loss_view = store
        .key_introspection(&after_loss_principal)
        .await
        .unwrap();
    assert_eq!(
        after_loss_view["management_capabilities"],
        serde_json::json!([])
    );
    assert_eq!(
        after_loss_view["expires_at_ms"].as_i64().unwrap(),
        baseline_expiry
    );
    assert_eq!(
        after_loss_view["allowed_models"],
        baseline["allowed_models"]
    );
    assert_eq!(after_loss_view["invocation_allowed"], false);
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn task_context_and_interface_scope_are_frozen_at_approval(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let owner = store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(scope.project_id),
            },
            "Interface scope owner",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    // Task context is trimmed display text, not a permission input.
    let request = store
        .create_agent_authorization_with_task(
            "Codex",
            &["pools:read".into()],
            Some("  Review routing evidence  "),
        )
        .await
        .unwrap();
    let view = store
        .agent_authorization_view(&request.user_code)
        .await
        .unwrap();
    assert_eq!(view.task.as_deref(), Some("Review routing evidence"));
    assert_eq!(view.capabilities, vec!["pools:read"]);
    // Unknown, empty and duplicate interface selections are rejected instead
    // of being widened to every protocol.
    for protocols in [
        vec![],
        vec!["chat".into(), "chat".into()],
        vec!["platform".into()],
    ] {
        assert!(matches!(
            store
                .approve_agent_authorization_with_scope(
                    &request.user_code,
                    scope,
                    owner.operator_id,
                    &["fast".into()],
                    3600,
                    true,
                    &protocols,
                )
                .await,
            Err(StoreError::InvalidKey)
        ));
    }
    store
        .approve_agent_authorization_with_scope(
            &request.user_code,
            scope,
            owner.operator_id,
            &["fast".into()],
            3600,
            true,
            &["chat".into()],
        )
        .await
        .unwrap();
    let issued = store
        .exchange_agent_authorization(&request.device_secret)
        .await
        .unwrap()
        .unwrap();
    let principal = store.authenticate(&issued.token).await.unwrap();
    assert!(principal.invocation_allowed());
    assert!(principal.allows_invocation_protocol("chat"));
    assert!(!principal.allows_invocation_protocol("embeddings"));
    assert_eq!(
        store.key_invocation_protocols(&principal).await.unwrap(),
        vec!["chat"]
    );
    let introspection = store.key_introspection(&principal).await.unwrap();
    assert_eq!(
        introspection["invocation_protocols"],
        serde_json::json!(["chat"])
    );
    // Rotation preserves both the switch and the exact interface list.
    let rotated = store.rotate_key(scope, issued.id).await.unwrap();
    let replacement = store.authenticate(&rotated.token).await.unwrap();
    assert!(replacement.allows_invocation_protocol("chat"));
    assert!(!replacement.allows_invocation_protocol("video"));
    assert_eq!(
        store.key_invocation_protocols(&replacement).await.unwrap(),
        vec!["chat"]
    );
}
