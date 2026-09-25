use niu_storage::{MIGRATOR, Store, StoreError, TenantScope};
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
    store.observe_quota(scope, account, &input).await.unwrap();
    // A delayed older observation must not replace the newer value.
    input.observed_at_ms = now - 2000;
    input.remaining = Some(900_000);
    store.observe_quota(scope, account, &input).await.unwrap();
    let windows = store.quota(scope, account).await.unwrap();
    assert_eq!(windows.len(), 1);
    assert_eq!(windows[0].remaining, Some(250_000));
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
    assert!(
        sqlx::query("DELETE FROM quota_observations WHERE account_id=$1")
            .bind(account)
            .execute(&pool)
            .await
            .is_err()
    );
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
    let id = left.unwrap();
    assert_eq!(id, right.unwrap());
    assert_eq!(
        Store::from_pool(pool.clone())
            .execution_import(a, id)
            .await
            .unwrap(),
        Some(record.clone())
    );
    assert!(store.execution_import(b, id).await.unwrap().is_none());
    assert!(!store.delete_execution_import(b, id).await.unwrap());
    let independent = store.import_execution(b, &record).await.unwrap();
    assert_ne!(independent, id);
    let mut second_record = record.clone();
    second_record.record_id = "second-record".into();
    let second = store.import_execution(a, &second_record).await.unwrap();
    let mut expected = vec![id, second];
    expected.sort();
    let first_page = store.execution_imports(a, None, 1).await.unwrap();
    assert_eq!(first_page[0].id, expected[0]);
    assert_eq!(first_page[0].coverage, "partial");
    let second_page = store
        .execution_imports(a, Some(first_page[0].id), 1)
        .await
        .unwrap();
    assert_eq!(second_page[0].id, expected[1]);
    assert!(
        store
            .execution_imports(a, Some(second_page[0].id), 1)
            .await
            .unwrap()
            .is_empty()
    );
    let isolated = store.execution_imports(b, None, 100).await.unwrap();
    assert_eq!(isolated.len(), 1);
    assert_eq!(isolated[0].id, independent);
    assert!(store.execution_imports(a, None, 0).await.is_err());

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
