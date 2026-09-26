use niu_storage::{MIGRATOR, OperatorAuditActor, OperatorScope, Store, StoreError, TenantScope};
use sqlx::PgPool;

// Run explicitly with DATABASE_URL pointing to a disposable PostgreSQL server.
// SQLx creates and removes an isolated database for this test.
#[sqlx::test]
#[ignore = "requires PostgreSQL with permission to create test databases"]
async fn tenant_boundaries_dispatch_races_and_restart(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let org_a = store.create_organization("A").await.unwrap();
    let org_b = store.create_organization("B").await.unwrap();
    let a = store.create_project(org_a, "A project").await.unwrap();
    let b = store.create_project(org_b, "B project").await.unwrap();
    let key_a = store
        .issue_key(a, "a", &["fast".into()], 3600)
        .await
        .unwrap();
    let key_b = store
        .issue_key(b, "b", &["fast".into()], 3600)
        .await
        .unwrap();
    let principal_a = store.authenticate(&key_a.token).await.unwrap();
    let principal_b = store.authenticate(&key_b.token).await.unwrap();
    let operation = store.create_operation(a, "fast").await.unwrap();
    assert!(
        store
            .create_operation(
                TenantScope {
                    organization_id: org_b,
                    project_id: a.project_id
                },
                "fast"
            )
            .await
            .is_err()
    );
    assert!(
        store
            .prepare_attempt(b, operation, "provider", "v1")
            .await
            .is_err()
    );
    let attempt = store
        .prepare_attempt(a, operation, "provider", "v1")
        .await
        .unwrap();
    assert!(store.attempt(b, attempt).await.unwrap().is_none());
    assert!(matches!(
        store.mark_dispatched(&principal_b, attempt).await,
        Err(StoreError::Conflict)
    ));
    let (first, second) = tokio::join!(
        store.mark_dispatched(&principal_a, attempt),
        store.mark_dispatched(&principal_a, attempt)
    );
    assert_ne!(first.is_ok(), second.is_ok());
    assert!(matches!(
        first.as_ref().err().or(second.as_ref().err()),
        Some(StoreError::Conflict)
    ));

    // Independent connection observes committed uncertainty after the dispatching
    // client disappears. No reset-to-free or implicit replay is allowed.
    let reopened_pool = PgPool::connect_with((*pool.connect_options()).clone())
        .await
        .unwrap();
    let reopened = Store::from_pool(reopened_pool.clone());
    let recovered = reopened.attempt(a, attempt).await.unwrap().unwrap();
    assert_eq!(recovered.execution, "may_have_executed");
    assert_eq!(recovered.prompt_tokens, None);
    assert_eq!(recovered.usage_confidence, "unknown");
    reopened.complete(a, attempt, None).await.unwrap();
    let completed = store.attempt(a, attempt).await.unwrap().unwrap();
    assert_eq!(completed.execution, "confirmed_completed");
    assert_eq!(completed.settlement, "reconciliation_required");
    assert!(matches!(
        store.complete(a, attempt, Some((0, 0))).await,
        Err(StoreError::Conflict)
    ));

    let zero = store
        .prepare_attempt(a, operation, "provider", "v1")
        .await
        .unwrap();
    store.mark_dispatched(&principal_a, zero).await.unwrap();
    assert!(matches!(
        store.complete(a, zero, Some((u64::MAX, 0))).await,
        Err(StoreError::InvalidUsage)
    ));
    store.complete(a, zero, Some((0, 0))).await.unwrap();
    let record = store.attempt(a, zero).await.unwrap().unwrap();
    assert_eq!(record.prompt_tokens, Some(0));
    assert_eq!(record.usage_confidence, "provider_reported");
    assert_eq!(record.settlement, "unresolved");
    // Reapplying embedded migrations preserves data.
    MIGRATOR.run(&pool).await.unwrap();
    assert!(store.attempt(a, attempt).await.unwrap().is_some());
    reopened_pool.close().await;
}

#[sqlx::test]
#[ignore = "requires PostgreSQL with permission to create test databases"]
async fn operator_sessions_store_only_hashes_and_revocation_blocks_authentication(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let org_a = store.create_organization("Operator org A").await.unwrap();
    let org_b = store.create_organization("Operator org B").await.unwrap();
    let project_a = store
        .create_project(org_a, "Operator project A")
        .await
        .unwrap();
    let project_a2 = store
        .create_project(org_a, "Operator project A2")
        .await
        .unwrap();
    let project_b = store
        .create_project(org_b, "Operator project B")
        .await
        .unwrap();
    let scoped_project = OperatorScope {
        organization_id: org_a,
        project_id: Some(project_a.project_id),
    };
    let issued = store
        .create_operator(
            scoped_project,
            "Read only",
            niu_storage::OperatorRole::Viewer,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let principal = store.authenticate_operator(&issued.token).await.unwrap();
    assert_eq!(principal.id, issued.operator_id);
    assert_eq!(principal.role, niu_storage::OperatorRole::Viewer);
    assert_eq!(principal.scope, scoped_project);
    assert!(store.authenticate_operator("short").await.is_err());

    let org_wide = store
        .create_operator(
            OperatorScope {
                organization_id: org_a,
                project_id: None,
            },
            "Organization owner",
            niu_storage::OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    store
        .create_operator(
            OperatorScope {
                organization_id: org_a,
                project_id: Some(project_a2.project_id),
            },
            "Other project admin",
            niu_storage::OperatorRole::Admin,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    store
        .create_operator(
            OperatorScope {
                organization_id: org_b,
                project_id: Some(project_b.project_id),
            },
            "Other organization viewer",
            niu_storage::OperatorRole::Viewer,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();

    let operator = store.operator(issued.operator_id).await.unwrap().unwrap();
    assert_eq!(operator.name, "Read only");
    assert_eq!(operator.role, niu_storage::OperatorRole::Viewer);
    assert_eq!(operator.organization_id, Some(org_a));
    assert_eq!(operator.project_id, Some(project_a.project_id));
    assert!(!operator.revoked);
    let organization_operators = store
        .operators_for_scope(OperatorScope {
            organization_id: org_a,
            project_id: None,
        })
        .await
        .unwrap();
    assert_eq!(organization_operators.len(), 3);
    assert!(
        organization_operators
            .iter()
            .any(|item| item.id == org_wide.operator_id)
    );
    assert!(
        organization_operators
            .iter()
            .all(|item| item.organization_id == Some(org_a))
    );
    let project_operators = store.operators_for_scope(scoped_project).await.unwrap();
    assert_eq!(project_operators.len(), 1);
    assert_eq!(project_operators[0].id, issued.operator_id);
    let installation_operators = store.operators().await.unwrap();
    assert_eq!(installation_operators.len(), 4);
    assert!(
        installation_operators
            .iter()
            .any(|item| item.organization_id == Some(org_b))
    );
    assert!(
        store
            .create_operator(
                OperatorScope {
                    organization_id: org_b,
                    project_id: Some(project_a.project_id),
                },
                "Mismatched tenant",
                niu_storage::OperatorRole::Viewer,
                3600,
                OperatorAuditActor::Installation,
            )
            .await
            .is_err()
    );
    let sessions = store.operator_sessions(issued.operator_id).await.unwrap();
    assert_eq!(sessions.len(), 1);
    assert_eq!(sessions[0].id, issued.session.id);
    assert!(!sessions[0].revoked);

    let stored_hash: Vec<u8> =
        sqlx::query_scalar("SELECT token_hash FROM admin_sessions WHERE id=$1")
            .bind(issued.session.id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(stored_hash.len(), 32);
    assert_ne!(stored_hash, issued.token.as_bytes());

    store
        .revoke_operator_session(
            issued.operator_id,
            issued.session.id,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    assert!(store.authenticate_operator(&issued.token).await.is_err());
    assert!(
        store
            .revoke_operator_session(
                issued.operator_id,
                issued.session.id,
                OperatorAuditActor::Installation,
            )
            .await
            .is_err()
    );

    let replacement = store
        .create_operator_session(issued.operator_id, 3600, OperatorAuditActor::Installation)
        .await
        .unwrap();
    let replacement_principal = store
        .authenticate_operator(&replacement.token)
        .await
        .unwrap();
    assert_eq!(
        replacement_principal.role,
        niu_storage::OperatorRole::Viewer
    );
    assert_eq!(replacement_principal.scope, scoped_project);
    store
        .revoke_operator(issued.operator_id, OperatorAuditActor::Installation)
        .await
        .unwrap();
    assert!(
        store
            .authenticate_operator(&replacement.token)
            .await
            .is_err()
    );
    assert!(
        store
            .create_operator_session(issued.operator_id, 3600, OperatorAuditActor::Installation,)
            .await
            .is_err()
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL with permission to create test databases"]
async fn operator_scope_migration_revokes_legacy_credentials(pool: PgPool) {
    use uuid::Uuid;

    let organization = Uuid::new_v4();
    let legacy_operator = Uuid::new_v4();
    let legacy_session = Uuid::new_v4();
    let schema = format!("niu_migration_{}", Uuid::new_v4().simple());
    sqlx::query(&format!("CREATE SCHEMA {schema}"))
        .execute(&pool)
        .await
        .unwrap();
    let mut connection = pool.acquire().await.unwrap();
    sqlx::query("SELECT set_config('search_path', $1, false)")
        .bind(&schema)
        .execute(&mut *connection)
        .await
        .unwrap();
    sqlx::raw_sql(
        "CREATE TABLE organizations (id UUID PRIMARY KEY); \
         CREATE TABLE projects (organization_id UUID NOT NULL REFERENCES organizations(id), \
             id UUID NOT NULL, PRIMARY KEY (organization_id, id));",
    )
    .execute(&mut *connection)
    .await
    .unwrap();
    sqlx::raw_sql(include_str!("../migrations/0010_operator_sessions.sql"))
        .execute(&mut *connection)
        .await
        .unwrap();
    sqlx::query("INSERT INTO organizations (id) VALUES ($1)")
        .bind(organization)
        .execute(&mut *connection)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO admin_operators (id, name, role) VALUES ($1, 'legacy owner', 'owner')",
    )
    .bind(legacy_operator)
    .execute(&mut *connection)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO admin_sessions (id, operator_id, token_hash, expires_at_unix) \
         VALUES ($1, $2, $3, extract(epoch FROM now())::bigint + 3600)",
    )
    .bind(legacy_session)
    .bind(legacy_operator)
    .bind([7_u8; 32].as_slice())
    .execute(&mut *connection)
    .await
    .unwrap();

    sqlx::raw_sql(include_str!("../migrations/0011_operator_scopes.sql"))
        .execute(&mut *connection)
        .await
        .unwrap();

    let revoked: (bool, bool) = sqlx::query_as(
        "SELECT o.revoked_at IS NOT NULL, s.revoked_at IS NOT NULL \
         FROM admin_operators o JOIN admin_sessions s ON s.operator_id=o.id \
         WHERE o.id=$1 AND s.id=$2",
    )
    .bind(legacy_operator)
    .bind(legacy_session)
    .fetch_one(&mut *connection)
    .await
    .unwrap();
    assert_eq!(revoked, (true, true));

    let unscoped_insert = sqlx::query(
        "INSERT INTO admin_operators (id, name, role) VALUES ($1, 'unscoped owner', 'owner')",
    )
    .bind(Uuid::new_v4())
    .execute(&mut *connection)
    .await;
    assert!(unscoped_insert.is_err());

    sqlx::query("SELECT set_config('search_path', 'public', false)")
        .execute(&mut *connection)
        .await
        .unwrap();
    sqlx::query(&format!("DROP SCHEMA {schema} CASCADE"))
        .execute(&mut *connection)
        .await
        .unwrap();
}

#[sqlx::test]
#[ignore = "requires PostgreSQL with permission to create test databases"]
async fn key_permissions_expiry_and_revocation_are_rechecked(pool: PgPool) {
    let store = Store::from_pool(pool.clone());
    let org = store.create_organization("keys").await.unwrap();
    let scope = store.create_project(org, "project").await.unwrap();
    let issued = store
        .issue_key(scope, "limited", &["fast".into()], 3600)
        .await
        .unwrap();
    let principal = store.authenticate(&issued.token).await.unwrap();
    assert_eq!(principal.scope().project_id, scope.project_id);
    assert!(store.authenticate("niu_invalid").await.is_err());
    let stored: Vec<u8> = sqlx::query_scalar("SELECT token_hash FROM api_keys WHERE id = $1")
        .bind(issued.id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(stored.len(), 32);
    assert_ne!(stored, issued.token.as_bytes());

    let op = store.create_operation(scope, "restricted").await.unwrap();
    let denied = store
        .prepare_attempt(scope, op, "provider", "v1")
        .await
        .unwrap();
    assert!(store.mark_dispatched(&principal, denied).await.is_err());
    assert_eq!(
        store
            .attempt(scope, denied)
            .await
            .unwrap()
            .unwrap()
            .execution,
        "not_sent"
    );
    let op = store.create_operation(scope, "fast").await.unwrap();
    let attempt = store
        .prepare_attempt(scope, op, "provider", "v1")
        .await
        .unwrap();
    store.revoke_key(scope, issued.id).await.unwrap();
    store.revoke_key(scope, issued.id).await.unwrap();
    assert!(matches!(
        store.authenticate(&issued.token).await,
        Err(StoreError::Unauthorized)
    ));
    assert!(matches!(
        store.mark_dispatched(&principal, attempt).await,
        Err(StoreError::Unauthorized)
    ));

    let expires = store
        .issue_key(scope, "expiring", &["fast".into()], 3600)
        .await
        .unwrap();
    let stale = store.authenticate(&expires.token).await.unwrap();
    sqlx::query(
        "UPDATE api_keys SET expires_at = clock_timestamp() - interval '1 second' WHERE id = $1",
    )
    .bind(expires.id)
    .execute(&pool)
    .await
    .unwrap();
    assert!(matches!(
        store.authenticate(&expires.token).await,
        Err(StoreError::Unauthorized)
    ));
    assert!(matches!(
        store.mark_dispatched(&stale, attempt).await,
        Err(StoreError::Unauthorized)
    ));
    assert_eq!(
        store
            .attempt(scope, attempt)
            .await
            .unwrap()
            .unwrap()
            .execution,
        "not_sent"
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL with permission to create test databases"]
async fn concurrent_budgets_idempotent_settlement_and_unknown_holds(pool: PgPool) {
    use niu_storage::{PriceInput, TokenRates};
    let store = Store::from_pool(pool.clone());
    let org = store.create_organization("costs").await.unwrap();
    let scope = store.create_project(org, "budgeted").await.unwrap();
    let issued = store
        .issue_key(scope, "client", &["fast".into()], 3600)
        .await
        .unwrap();
    let principal = store.authenticate(&issued.token).await.unwrap();
    store.create_budget(scope, "USD", 100).await.unwrap();
    let price = store
        .publish_price(
            scope,
            PriceInput {
                resource_id: "fast",
                offer_revision: "v1",
                currency: "USD",
                api_equivalent: TokenRates {
                    prompt: 2_000_000,
                    completion: 4_000_000,
                },
                cash: TokenRates {
                    prompt: 1_000_000,
                    completion: 2_000_000,
                },
            },
        )
        .await
        .unwrap();
    let op = store.create_operation(scope, "fast").await.unwrap();
    let a = store
        .prepare_attempt(scope, op, "fast", "v1")
        .await
        .unwrap();
    let b = store
        .prepare_attempt(scope, op, "fast", "v1")
        .await
        .unwrap();
    assert!(store.mark_dispatched(&principal, a).await.is_err());
    let (ra, rb) = tokio::join!(
        store.reserve_cost(scope, a, price, 40, 10),
        store.reserve_cost(scope, b, price, 40, 10)
    );
    assert_ne!(ra.is_ok(), rb.is_ok());
    assert!(matches!(
        ra.as_ref().err().or(rb.as_ref().err()),
        Some(StoreError::BudgetExceeded)
    ));
    let (winner, loser) = if ra.is_ok() { (a, b) } else { (b, a) };
    store
        .reserve_cost(scope, winner, price, 40, 10)
        .await
        .unwrap();
    assert_eq!(
        store.budget(scope).await.unwrap().unwrap().reserved_nanos,
        60
    );
    store.mark_dispatched(&principal, winner).await.unwrap();
    store.complete(scope, winner, Some((20, 10))).await.unwrap();
    let restarted = Store::from_pool(pool.clone());
    let (recovered, raced) = tokio::join!(
        restarted.recover_settlements(None),
        store.recover_settlements(None)
    );
    assert_eq!(recovered.unwrap(), (None, 0));
    assert_eq!(raced.unwrap(), (None, 0));
    let (first, duplicate) = tokio::join!(
        store.settle_cost(scope, winner),
        store.settle_cost(scope, winner)
    );
    let first = first.unwrap();
    assert_eq!(first, duplicate.unwrap());
    assert_eq!(
        store.cost_entries(scope, None, 1).await.unwrap(),
        vec![first]
    );
    let first = store.settle_cost(scope, winner).await.unwrap();
    let mut record: niu_execution::observation::ExecutionRecord = serde_json::from_str(
        include_str!("../../../contracts/fixtures/parallel-task.v1.json"),
    )
    .unwrap();
    for span in &mut record.spans {
        if span.charge_ref.as_deref() == Some("charge-1") {
            span.charge_ref = Some(format!("niu:attempt:{winner}"));
        }
    }
    let charges = store.execution_charges(scope, &record).await.unwrap();
    assert_eq!(
        charges.entries,
        vec![store.settle_cost(scope, winner).await.unwrap()]
    );
    assert_eq!(charges.unresolved, vec!["charge-2"]);
    let isolated_scope = store.create_project(org, "isolated charges").await.unwrap();
    let isolated = store
        .execution_charges(isolated_scope, &record)
        .await
        .unwrap();
    assert!(isolated.entries.is_empty());
    assert_eq!(isolated.unresolved.len(), 2);

    assert!(
        store
            .cost_entries(scope, Some(winner), 1)
            .await
            .unwrap()
            .is_empty()
    );
    let other_scope = store.create_project(org, "other ledger").await.unwrap();
    assert!(
        store
            .cost_entries(other_scope, None, 100)
            .await
            .unwrap()
            .is_empty()
    );
    let wrong_org = TenantScope {
        organization_id: uuid::Uuid::new_v4(),
        project_id: scope.project_id,
    };
    assert!(
        store
            .cost_entries(wrong_org, None, 100)
            .await
            .unwrap()
            .is_empty()
    );
    assert!(store.cost_entries(scope, None, 0).await.is_err());
    assert!(store.cost_entries(scope, None, 102).await.is_err());
    assert_eq!(first.cash_nanos, 40);
    assert_eq!(first.api_equivalent_nanos, 80);
    assert_eq!(first.usage_prompt_tokens, 20);
    assert!(!first.bound_exceeded);
    let budget = store.budget(scope).await.unwrap().unwrap();
    assert_eq!((budget.spent_nanos, budget.reserved_nanos), (40, 0));
    assert!(
        sqlx::query("UPDATE price_revisions SET cash_prompt_rate=0 WHERE id=$1")
            .bind(price)
            .execute(&pool)
            .await
            .is_err()
    );
    assert!(
        sqlx::query("DELETE FROM cost_entries WHERE attempt_id=$1")
            .bind(winner)
            .execute(&pool)
            .await
            .is_err()
    );
    store
        .reserve_cost(scope, loser, price, 40, 10)
        .await
        .unwrap();
    store.mark_dispatched(&principal, loser).await.unwrap();
    store.complete_and_settle(scope, loser, None).await.unwrap();
    assert_eq!(store.recover_settlements(None).await.unwrap(), (None, 0));
    assert!(matches!(
        store.settle_cost(scope, loser).await,
        Err(StoreError::Unresolved)
    ));
    assert!(matches!(
        store.release_unsent_cost(scope, loser).await,
        Err(StoreError::Unresolved)
    ));
    let extra = store
        .prepare_attempt(scope, op, "fast", "v1")
        .await
        .unwrap();
    assert!(matches!(
        store.reserve_cost(scope, extra, price, 1, 0).await,
        Err(StoreError::BudgetExceeded)
    ));
    let budget = store.budget(scope).await.unwrap().unwrap();
    assert_eq!((budget.spent_nanos, budget.reserved_nanos), (40, 60));
}

#[sqlx::test]
#[ignore = "requires PostgreSQL with permission to create test databases"]
async fn unsent_release_and_provider_overrun_preserve_liability(pool: PgPool) {
    use niu_storage::{PriceInput, TokenRates};
    let store = Store::from_pool(pool);
    let org = store.create_organization("overrun").await.unwrap();
    let scope = store.create_project(org, "project").await.unwrap();
    let key = store
        .issue_key(scope, "client", &["fast".into()], 3600)
        .await
        .unwrap();
    let principal = store.authenticate(&key.token).await.unwrap();
    store.create_budget(scope, "USD", 10).await.unwrap();
    let price = store
        .publish_price(
            scope,
            PriceInput {
                resource_id: "fast",
                offer_revision: "v1",
                currency: "USD",
                api_equivalent: TokenRates {
                    prompt: 1_000_000,
                    completion: 1_000_000,
                },
                cash: TokenRates {
                    prompt: 1_000_000,
                    completion: 1_000_000,
                },
            },
        )
        .await
        .unwrap();
    let op = store.create_operation(scope, "fast").await.unwrap();
    let unsent = store
        .prepare_attempt(scope, op, "fast", "v1")
        .await
        .unwrap();
    store
        .reserve_cost(scope, unsent, price, 10, 0)
        .await
        .unwrap();
    store.release_unsent_cost(scope, unsent).await.unwrap();
    store.release_unsent_cost(scope, unsent).await.unwrap();
    assert!(store.mark_dispatched(&principal, unsent).await.is_err());
    assert_eq!(
        store.budget(scope).await.unwrap().unwrap().reserved_nanos,
        0
    );
    let sent = store
        .prepare_attempt(scope, op, "fast", "v1")
        .await
        .unwrap();
    store.reserve_cost(scope, sent, price, 10, 0).await.unwrap();
    store.mark_dispatched(&principal, sent).await.unwrap();
    store
        .complete_and_settle(scope, sent, Some((15, 0)))
        .await
        .unwrap();
    assert_eq!(
        store
            .attempt(scope, sent)
            .await
            .unwrap()
            .unwrap()
            .settlement,
        "settled"
    );
    let entry = store.settle_cost(scope, sent).await.unwrap();
    assert_eq!(entry.cash_nanos, 15);
    assert!(entry.bound_exceeded);
    let budget = store.budget(scope).await.unwrap().unwrap();
    assert_eq!((budget.spent_nanos, budget.reserved_nanos), (15, 0));
    let extra = store
        .prepare_attempt(scope, op, "fast", "v1")
        .await
        .unwrap();
    assert!(matches!(
        store.reserve_cost(scope, extra, price, 1, 0).await,
        Err(StoreError::BudgetExceeded)
    ));
}

#[sqlx::test]
#[ignore = "requires PostgreSQL with permission to create test databases"]
async fn account_refresh_concurrency_and_dispatch_health_are_isolated(pool: PgPool) {
    use niu_storage::{AccountHealth, AccountInput, AuthMode, BillingMode};
    let store = Store::from_pool(pool);
    let org = store.create_organization("accounts").await.unwrap();
    let scope = store.create_project(org, "project").await.unwrap();
    let input = AccountInput {
        provider: "fixture".into(),
        plan: "subscription".into(),
        authentication_mode: AuthMode::OAuthRefresh,
        billing_mode: BillingMode::Subscription,
        credential_reference: "secret:account-a/v1".into(),
        concurrency_limit: 1,
    };
    let a = store.create_account(scope, &input).await.unwrap();
    let b = store.create_account(scope, &input).await.unwrap();
    let op = store.create_operation(scope, "fast").await.unwrap();
    assert!(matches!(
        store
            .prepare_account_attempt(scope, op, "fast", "v1", a)
            .await,
        Err(StoreError::AccountUnavailable)
    ));
    store
        .set_account_health(scope, a, AccountHealth::Ready)
        .await
        .unwrap();
    let (one, two) = tokio::join!(
        store.begin_account_refresh(scope, a),
        store.begin_account_refresh(scope, a)
    );
    assert_ne!(one.is_ok(), two.is_ok());
    let owner = one.ok().or(two.ok()).unwrap();
    let other_owner = store.begin_account_refresh(scope, b).await.unwrap();
    assert!(
        store
            .prepare_account_attempt(scope, op, "fast", "v1", a)
            .await
            .is_err()
    );
    assert!(
        store
            .finish_account_refresh(scope, a, other_owner, "secret:wrong")
            .await
            .is_err()
    );
    store
        .finish_account_refresh(scope, a, owner, "secret:account-a/v2")
        .await
        .unwrap();
    let accounts = store.accounts(scope).await.unwrap();
    assert_eq!(
        accounts
            .iter()
            .find(|x| x.id == a)
            .unwrap()
            .credential_revision,
        2
    );
    assert!(accounts.iter().find(|x| x.id == b).unwrap().refreshing);
    let (one, two) = tokio::join!(
        store.prepare_account_attempt(scope, op, "fast", "v1", a),
        store.prepare_account_attempt(scope, op, "fast", "v1", a)
    );
    assert_ne!(one.is_ok(), two.is_ok());
    let attempt = one.ok().or(two.ok()).unwrap();
    assert!(store.begin_account_refresh(scope, a).await.is_err());
    let key = store
        .issue_key(scope, "client", &["fast".into()], 3600)
        .await
        .unwrap();
    let principal = store.authenticate(&key.token).await.unwrap();
    store
        .set_account_health(scope, a, AccountHealth::Disabled)
        .await
        .unwrap();
    assert!(matches!(
        store.mark_dispatched(&principal, attempt).await,
        Err(StoreError::AccountUnavailable)
    ));
    store
        .set_account_health(scope, a, AccountHealth::Ready)
        .await
        .unwrap();
    store.mark_dispatched(&principal, attempt).await.unwrap();
    assert!(matches!(
        store.release_account_slot(scope, attempt).await,
        Err(StoreError::Unresolved)
    ));
    store.complete(scope, attempt, None).await.unwrap();
    store.release_account_slot(scope, attempt).await.unwrap();
    let next = store
        .prepare_account_attempt(scope, op, "fast", "v1", a)
        .await
        .unwrap();
    store.release_account_slot(scope, next).await.unwrap();
    assert!(store.mark_dispatched(&principal, next).await.is_err());
}

#[sqlx::test]
#[ignore = "requires PostgreSQL with permission to create test databases"]
async fn quota_observations_preserve_units_freshness_and_tenant_boundaries(pool: PgPool) {
    use niu_storage::{AccountInput, AuthMode, BillingMode, QuotaInput, QuotaUnit};
    let store = Store::from_pool(pool.clone());
    let org = store.create_organization("quota").await.unwrap();
    let scope = store.create_project(org, "a").await.unwrap();
    let other = store.create_project(org, "b").await.unwrap();
    let account = store
        .create_account(
            scope,
            &AccountInput {
                provider: "fixture".into(),
                plan: "plan".into(),
                authentication_mode: AuthMode::OAuthRefresh,
                billing_mode: BillingMode::Subscription,
                credential_reference: "env:TEST_ACCOUNT".into(),
                concurrency_limit: 2,
            },
        )
        .await
        .unwrap();
    let now: i64 =
        sqlx::query_scalar("SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint")
            .fetch_one(&pool)
            .await
            .unwrap();
    let mut input = QuotaInput {
        schema_version: 1,
        window_key: "short".into(),
        unit: QuotaUnit::MillionthsOfWindow,
        remaining: Some(250_000),
        maximum: Some(1_000_000),
        observed_at_ms: now - 1000,
        valid_until_ms: now + 60000,
        resets_at_ms: now + 120000,
        source: "provider-header".into(),
    };
    assert!(store.observe_quota(other, account, &input).await.is_err());
    let observation_id = store.observe_quota(scope, account, &input).await.unwrap();
    // An exact collector replay is safe and returns the original record.
    assert_eq!(
        store.observe_quota(scope, account, &input).await.unwrap(),
        observation_id
    );
    let mut conflicting_replay = input.clone();
    conflicting_replay.remaining = Some(200_000);
    assert!(matches!(
        store
            .observe_quota(scope, account, &conflicting_replay)
            .await,
        Err(StoreError::Conflict)
    ));
    // A delayed older observation must not replace the newer value.
    input.observed_at_ms = now - 2000;
    input.remaining = Some(900_000);
    store.observe_quota(scope, account, &input).await.unwrap();
    let windows = store.quota(scope, account).await.unwrap();
    assert_eq!(windows.len(), 1);
    assert_eq!(windows[0].remaining.as_deref(), Some("250000"));
    assert_eq!(windows[0].previous_remaining.as_deref(), Some("900000"));
    assert_eq!(windows[0].unit, "millionths_of_window");
    assert!(windows[0].fresh);
    assert!(store.quota(other, account).await.unwrap().is_empty());
    input.window_key = "stale".into();
    input.valid_until_ms = now - 1;
    store.observe_quota(scope, account, &input).await.unwrap();
    input.window_key = "reset".into();
    input.valid_until_ms = now + 60000;
    input.resets_at_ms = now - 1;
    store.observe_quota(scope, account, &input).await.unwrap();
    input.window_key = "unknown".into();
    input.resets_at_ms = now + 60000;
    input.remaining = None;
    store.observe_quota(scope, account, &input).await.unwrap();
    for window in store.quota(scope, account).await.unwrap() {
        assert_eq!(window.fresh, window.window_key == "short");
    }
    input.observed_at_ms = now + 100000;
    input.valid_until_ms = now + 200000;
    input.resets_at_ms = now + 200000;
    assert!(matches!(
        store.observe_quota(scope, account, &input).await,
        Err(StoreError::InvalidAccount)
    ));
    assert!(matches!(
        store.delete_quota_window(other, account, "short").await,
        Err(StoreError::Conflict)
    ));
    assert_eq!(
        store
            .delete_quota_window(scope, account, "short")
            .await
            .unwrap(),
        2
    );
    assert_eq!(
        store
            .delete_quota_window(scope, account, "short")
            .await
            .unwrap(),
        0
    );
    let remaining_windows = store.quota(scope, account).await.unwrap();
    assert!(
        !remaining_windows
            .iter()
            .any(|window| window.window_key == "short")
    );
    assert_eq!(remaining_windows.len(), 3);
}

#[sqlx::test]
#[ignore = "requires PostgreSQL with permission to create test databases"]
async fn rotation_is_atomic_scoped_and_audited_without_extending_expiry(pool: PgPool) {
    let store = Store::from_pool(pool.clone());
    let org = store.create_organization("rotation").await.unwrap();
    let scope = store.create_project(org, "a").await.unwrap();
    let other = store.create_project(org, "b").await.unwrap();
    let original = store
        .issue_key(scope, "client", &["fast".into()], 3600)
        .await
        .unwrap();
    let before = store.list_keys(scope).await.unwrap().remove(0);
    assert!(store.rotate_key(other, original.id).await.is_err());
    assert!(store.authenticate(&original.token).await.is_ok());
    let (one, two) = tokio::join!(
        store.rotate_key(scope, original.id),
        store.rotate_key(scope, original.id)
    );
    assert_ne!(one.is_ok(), two.is_ok());
    let replacement = one.ok().or(two.ok()).unwrap();
    assert!(store.authenticate(&original.token).await.is_err());
    let principal = store.authenticate(&replacement.token).await.unwrap();
    assert!(principal.allows_model("fast"));
    assert!(!principal.allows_model("restricted"));
    let keys = store.list_keys(scope).await.unwrap();
    assert_eq!(keys.len(), 2);
    let after = keys.iter().find(|k| k.id == replacement.id).unwrap();
    assert_eq!(before.expires_at_ms, after.expires_at_ms);
    assert!(keys.iter().find(|k| k.id == original.id).unwrap().revoked);
    store.revoke_key(scope, replacement.id).await.unwrap();
    store.revoke_key(scope, replacement.id).await.unwrap();
    let events: i64 =
        sqlx::query_scalar("SELECT count(*) FROM key_audit_events WHERE project_id=$1")
            .bind(scope.project_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(events, 3);
    assert!(
        sqlx::query("DELETE FROM key_audit_events WHERE project_id=$1")
            .bind(scope.project_id)
            .execute(&pool)
            .await
            .is_err()
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn execution_imports_are_scoped_idempotent_and_deletable(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let org = store.create_organization("observation").await.unwrap();
    let a = store.create_project(org, "a").await.unwrap();
    let b = store.create_project(org, "b").await.unwrap();
    let record: niu_execution::observation::ExecutionRecord = serde_json::from_str(include_str!(
        "../../../contracts/fixtures/parallel-task.v1.json"
    ))
    .unwrap();
    let (left, right) = tokio::join!(
        store.import_execution(a, &record),
        store.import_execution(a, &record)
    );
    let left = left.unwrap();
    let right = right.unwrap();
    assert_ne!(left.created, right.created);
    let id = left.id;
    assert_eq!(id, right.id);
    assert_eq!(
        Store::from_pool(pool.clone())
            .execution_import(a, id)
            .await
            .unwrap(),
        Some(record.clone())
    );
    assert!(store.execution_import(b, id).await.unwrap().is_none());
    assert!(!store.delete_execution_import(b, id).await.unwrap());
    let independent = store.import_execution(b, &record).await.unwrap().id;
    assert_ne!(independent, id);
    let mut second_record = record.clone();
    second_record.record_id = "second-record".into();
    let second = store.import_execution(a, &second_record).await.unwrap().id;
    let mut expected = [id, second];
    expected.sort();
    let first_page = store.execution_imports(a, None, None, 1).await.unwrap();
    assert_eq!(first_page[0].id, expected[0]);
    assert_eq!(first_page[0].coverage, "partial");
    let second_page = store
        .execution_imports(a, Some(first_page[0].id), None, 1)
        .await
        .unwrap();
    assert_eq!(second_page[0].id, expected[1]);
    assert!(
        store
            .execution_imports(a, Some(second_page[0].id), None, 1)
            .await
            .unwrap()
            .is_empty()
    );
    let isolated = store.execution_imports(b, None, None, 100).await.unwrap();
    assert_eq!(isolated.len(), 1);
    assert_eq!(isolated[0].id, independent);
    assert!(store.execution_imports(a, None, None, 0).await.is_err());

    let mut conflict = record.clone();
    conflict.coverage = niu_execution::observation::Coverage::Unknown;
    assert!(matches!(
        store.import_execution(a, &conflict).await,
        Err(StoreError::Conflict)
    ));
    let mut invalid = record.clone();
    invalid.schema_version = 2;
    assert!(matches!(
        store.import_execution(a, &invalid).await,
        Err(StoreError::InvalidObservation)
    ));
    assert!(store.delete_execution_import(a, id).await.unwrap());
    assert!(store.execution_import(a, id).await.unwrap().is_none());
    assert!(
        store
            .execution_import(b, independent)
            .await
            .unwrap()
            .is_some()
    );
    let attempts: i64 = sqlx::query_scalar("SELECT count(*) FROM attempts")
        .fetch_one(&pool)
        .await
        .unwrap();
    let charges: i64 = sqlx::query_scalar("SELECT count(*) FROM cost_entries")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!((attempts, charges), (0, 0));
}

#[sqlx::test]
#[ignore = "requires PostgreSQL with permission to create test databases"]
async fn default_workspace_is_atomic_and_idempotent(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let unrelated = store
        .create_organization("Personal workspace")
        .await
        .unwrap();
    let (a, b) = tokio::join!(store.default_workspace(), store.default_workspace());
    let a = a.unwrap();
    let b = b.unwrap();
    assert_eq!(a.organization_id, b.organization_id);
    assert_eq!(a.project_id, b.project_id);
    assert_ne!(a.organization_id, unrelated);
    let restarted = Store::from_pool(pool.clone())
        .default_workspace()
        .await
        .unwrap();
    assert_eq!(a.project_id, restarted.project_id);
    let counts: (i64, i64) = sqlx::query_as(
        "SELECT (SELECT count(*) FROM organizations), (SELECT count(*) FROM projects)",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(counts, (2, 1));
    let keys: i64 = sqlx::query_scalar("SELECT count(*) FROM api_keys")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(keys, 0);
}

#[sqlx::test]
#[ignore = "requires PostgreSQL with permission to create test databases"]
async fn execution_cohort_deduplicates_scoped_costs_and_keeps_unknowns_explicit(pool: PgPool) {
    use niu_execution::observation::{
        Coverage, ExecutionRecord, Outcome, OutcomeAuthority, OutcomeResult, SpanKind, SpanStatus,
    };
    use niu_storage::{PriceInput, TokenRates};
    use uuid::Uuid;

    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let organization = store.create_organization("cohort").await.unwrap();
    let scope = store
        .create_project(organization, "observed")
        .await
        .unwrap();
    let key = store
        .issue_key(scope, "cohort-client", &["fast".into()], 3600)
        .await
        .unwrap();
    let principal = store.authenticate(&key.token).await.unwrap();
    store.create_budget(scope, "USD", 1_000).await.unwrap();
    let price = store
        .publish_price(
            scope,
            PriceInput {
                resource_id: "fast",
                offer_revision: "cohort-v1",
                currency: "USD",
                api_equivalent: TokenRates {
                    prompt: 2_000_000,
                    completion: 4_000_000,
                },
                cash: TokenRates {
                    prompt: 1_000_000,
                    completion: 2_000_000,
                },
            },
        )
        .await
        .unwrap();
    let operation = store.create_operation(scope, "fast").await.unwrap();
    let mut attempt_ids = Vec::new();
    for usage in [(20, 10), (10, 0)] {
        let attempt = store
            .prepare_attempt(scope, operation, "fast", "cohort-v1")
            .await
            .unwrap();
        store
            .reserve_cost(scope, attempt, price, 20, 10)
            .await
            .unwrap();
        store.mark_dispatched(&principal, attempt).await.unwrap();
        store
            .complete_and_settle(scope, attempt, Some(usage))
            .await
            .unwrap();
        attempt_ids.push(attempt);
    }

    fn observed_record(record_id: &str, attempt_id: Uuid, accepted: bool) -> ExecutionRecord {
        let mut record: ExecutionRecord = serde_json::from_str(include_str!(
            "../../../contracts/fixtures/parallel-task.v1.json"
        ))
        .unwrap();
        record.record_id = record_id.into();
        record.coverage = Coverage::Complete;
        for span in &mut record.spans {
            if matches!(
                span.kind,
                SpanKind::ModelInvocation | SpanKind::ToolInvocation | SpanKind::Attempt
            ) {
                span.charge_ref = Some(attempt_id.to_string());
            }
        }
        record
            .outcomes
            .retain(|outcome| outcome.authority == OutcomeAuthority::DeterministicValidator);
        record.outcomes[0].evidence_id = format!("validator-{record_id}");
        record.outcomes[0].result = if accepted {
            OutcomeResult::Accepted
        } else {
            OutcomeResult::Rejected
        };
        if accepted {
            record.outcomes.push(Outcome {
                span_id: "task".into(),
                evidence_id: format!("agent-{record_id}"),
                authority: OutcomeAuthority::AgentClaim,
                result: OutcomeResult::Accepted,
            });
        }
        record
    }

    let accepted = observed_record("accepted", attempt_ids[0], true);
    let duplicate_reference = observed_record("retry-observation", attempt_ids[0], false);
    let mut failed_attempt = observed_record("failed-work", attempt_ids[1], false);
    failed_attempt
        .spans
        .iter_mut()
        .find(|span| span.id == "tool")
        .unwrap()
        .status = Some(SpanStatus::Failed);
    for record in [&accepted, &duplicate_reference, &failed_attempt] {
        store.import_execution(scope, record).await.unwrap();
    }

    let account_id = Uuid::new_v4();
    sqlx::query("INSERT INTO supplier_accounts (id,organization_id,project_id,provider,plan,authentication_mode,billing_mode,credential_reference,concurrency_limit) VALUES ($1,$2,$3,'Aster','Team','api_key','subscription','env:COHORT_TEST',1)")
        .bind(account_id)
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO quota_observations (id,organization_id,project_id,account_id,window_key,unit,remaining,maximum,observed_at_ms,valid_until_ms,resets_at_ms,source) VALUES ($1,$2,$3,$4,'weekly','requests',7,10,1,100,200,'cohort-test')")
        .bind(Uuid::new_v4())
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(account_id)
        .execute(&pool)
        .await
        .unwrap();

    let report = store.execution_cohort(scope).await.unwrap();
    assert_eq!(report.records_scanned, 3);
    assert_eq!(report.coverage.complete, 3);
    assert_eq!((report.outcomes.accepted, report.outcomes.rejected), (1, 2));
    assert_eq!(report.outcome_evidence.agent_claim.accepted, 1);
    assert_eq!(report.outcome_evidence.deterministic_validator.accepted, 1);
    assert_eq!(report.outcome_evidence.deterministic_validator.rejected, 2);
    assert_eq!(report.outcome_evidence.human_acceptance.absent, 3);
    assert_eq!(report.accepted_completions, 1);
    assert_eq!(report.work.failed_spans, 1);
    assert_eq!(report.work.billable_roots_without_charge_references, 0);
    assert_eq!(report.cost_evidence.unique_charge_references, 2);
    assert_eq!(report.cost_evidence.unique_attempt_references, 2);
    assert_eq!(report.cost_evidence.resolved_attempts, 2);
    assert_eq!(report.cost_evidence.settled_cost_entries, 2);
    assert!(report.cost_evidence.complete);
    assert_eq!(report.api_equivalent_by_currency[0].amount_nanos, "100");
    assert_eq!(
        report.configured_rate_cash_by_currency[0].amount_nanos,
        "50"
    );
    assert_eq!(
        report.api_equivalent_per_accepted_completion[0].numerator_nanos,
        "100"
    );
    assert_eq!(
        report.api_equivalent_per_accepted_completion[0].denominator,
        1
    );
    assert_eq!(report.capacity.quota_observations, 1);
    assert_eq!(report.capacity.task_attribution, "unavailable");
    assert_eq!(report.invoice_cash.state, "not_imported");
    assert!(report.invoice_cash.totals_by_currency.is_empty());
    assert_eq!(report.subscription_allocation_cash.state, "not_imported");
    assert!(
        report
            .subscription_allocation_cash
            .totals_by_currency
            .is_empty()
    );

    let mut partial = observed_record("partial-coverage", Uuid::new_v4(), true);
    partial.coverage = Coverage::Partial;
    partial
        .spans
        .iter_mut()
        .find(|span| span.id == "attempt")
        .unwrap()
        .charge_ref = Some("provider-ledger-reference".into());
    store.import_execution(scope, &partial).await.unwrap();
    let incomplete = store.execution_cohort(scope).await.unwrap();
    assert_eq!(incomplete.accepted_completions, 2);
    // One UUID has no scoped attempt row and one provider-native namespace is
    // intentionally not guessed to be a canonical ledger identifier.
    assert_eq!(incomplete.cost_evidence.unresolved_references, 2);
    assert!(!incomplete.cost_evidence.complete);
    assert!(incomplete.api_equivalent_per_accepted_completion.is_empty());
    assert_eq!(incomplete.api_equivalent_by_currency[0].amount_nanos, "100");

    let empty_cost_scope = store
        .create_project(organization, "zero accepted")
        .await
        .unwrap();
    let no_acceptance: ExecutionRecord = serde_json::from_value(serde_json::json!({
        "schema_version": 1,
        "source": "cohort-test",
        "record_id": "rejected-only",
        "task_id": "task",
        "coverage": "complete",
        "spans": [{"id":"task","kind":"task"},{"id":"validation","kind":"validation"}],
        "links": [{"from":"task","to":"validation","kind":"contains"}],
        "outcomes": [{"span_id":"task","evidence_id":"rejected","authority":"deterministic_validator","result":"rejected"}]
    }))
    .unwrap();
    store
        .import_execution(empty_cost_scope, &no_acceptance)
        .await
        .unwrap();
    let zero = store.execution_cohort(empty_cost_scope).await.unwrap();
    assert_eq!(zero.accepted_completions, 0);
    assert!(zero.cost_evidence.complete);
    assert!(zero.api_equivalent_per_accepted_completion.is_empty());
    assert!(zero.configured_rate_cash_per_accepted_completion.is_empty());
    assert!(zero.api_equivalent_by_currency.is_empty());

    let wrong_tenant = TenantScope {
        organization_id: Uuid::new_v4(),
        project_id: scope.project_id,
    };
    let isolated = store.execution_cohort(wrong_tenant).await.unwrap();
    assert_eq!(isolated.records_scanned, 0);
    assert!(isolated.api_equivalent_by_currency.is_empty());
    assert_eq!(isolated.capacity.quota_observations, 0);
    assert!(!isolated.cost_evidence.complete);
}
