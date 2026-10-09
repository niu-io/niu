use niu_storage::{MIGRATOR, ProviderOfferInput, Store, TenantScope};
use sqlx::PgPool;
use uuid::Uuid;

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn own_key_requests_are_not_missing_customer_rates(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let vendor = Uuid::new_v4();
    sqlx::query("INSERT INTO vendors(id,name,adapter,api_base,credential_ciphertext) VALUES($1,'own-key billing fixture','openai','https://example.com/v1',$2)")
        .bind(vendor).bind(vec![1u8;48]).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO vendor_models(alias,vendor_id,upstream_model,capabilities) VALUES('own-key-billing',$1,'upstream',$2)")
        .bind(vendor).bind(serde_json::json!({})).execute(&pool).await.unwrap();
    let revision: i64 = sqlx::query_scalar("SELECT revision FROM vendors WHERE id=$1")
        .bind(vendor)
        .fetch_one(&pool)
        .await
        .unwrap();
    store
        .assign_personal_vendor_owner(vendor, scope.organization_id, revision)
        .await
        .unwrap();
    let route = store
        .personal_vendor_route(scope.organization_id, "own-key-billing")
        .await
        .unwrap()
        .unwrap();
    let (_, personal) = store
        .prepare_gateway_attempt(scope, "own-key-billing", None, "fixture")
        .await
        .unwrap();
    store
        .bind_personal_attempt_route(scope, personal, &route)
        .await
        .unwrap();
    let key = store
        .issue_key(scope, "Own-key billing", &["own-key-billing".into()], 3600)
        .await
        .unwrap();
    let principal = store.authenticate(&key.token).await.unwrap();
    let snapshot = store
        .guardrail_snapshot(scope, key.id)
        .await
        .unwrap()
        .unwrap();
    store
        .bind_inspected_guardrails(scope, personal, key.id, &snapshot)
        .await
        .unwrap();
    store
        .set_attempt_dispatch_provider(scope, personal, "openai")
        .await
        .unwrap();
    store.mark_dispatched(&principal, personal).await.unwrap();
    let billing = store.customer_billing(scope).await.unwrap();
    assert_eq!(billing["unpriced"], "0");
    assert_eq!(billing["unresolved"], "0");
    assert_eq!(billing["balances"], serde_json::json!([]));
    attempt(&store, &pool, scope, "missing-rate").await;
    assert_eq!(
        store.customer_billing(scope).await.unwrap()["unpriced"],
        "1"
    );
}

async fn attempt(store: &Store, pool: &PgPool, scope: TenantScope, alias: &str) -> Uuid {
    let op = store.create_operation(scope, alias).await.unwrap();
    let id = store
        .prepare_attempt(scope, op, alias, "test")
        .await
        .unwrap();
    store.bind_customer_tariff(scope, id, alias).await.unwrap();
    if store
        .customer_balance_enabled(scope.organization_id)
        .await
        .unwrap()
    {
        store
            .reserve_customer_balance(scope, id, 10000)
            .await
            .unwrap();
    }
    sqlx::query("UPDATE attempts SET execution='may_have_executed',dispatched_at=to_timestamp(1700000000) WHERE id=$1").bind(id).execute(pool).await.unwrap();
    id
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn customer_billing_pins_rates_and_invoices_only_reconciled_usage(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let unpriced = attempt(&store, &pool, scope, "text").await;
    store
        .complete_and_settle(scope, unpriced, Some((100, 100)))
        .await
        .unwrap();
    let mut rate = ProviderOfferInput {
        model_alias: "text".into(),
        currency: "USD".into(),
        prompt_rate: "3000000000".into(),
        completion_rate: "7000000000".into(),
        expected_revision: None,
    };
    let first = store.publish_customer_tariff(scope, &rate).await.unwrap();
    let old = attempt(&store, &pool, scope, "text").await;
    rate.expected_revision = Some(first);
    rate.prompt_rate = "4000000000".into();
    let second = store.publish_customer_tariff(scope, &rate).await.unwrap();
    assert!(store.publish_customer_tariff(scope, &rate).await.is_err());
    let new = attempt(&store, &pool, scope, "text").await;
    // Terminal nonexecution has no customer charge and must not hold invoices.
    let failed_priced = attempt(&store, &pool, scope, "text").await;
    let failed_unpriced = attempt(&store, &pool, scope, "other-model").await;
    sqlx::query("UPDATE attempts SET execution='confirmed_not_executed' WHERE id=ANY($1)")
        .bind(vec![failed_priced, failed_unpriced])
        .execute(&pool)
        .await
        .unwrap();

    let from = 1_699_999_999_000;
    let to = 1_700_000_001_000;
    let key = Uuid::new_v4();
    assert!(
        store
            .issue_customer_invoice(scope, from, to, "USD", key)
            .await
            .is_err()
    );
    store
        .complete_and_settle(scope, old, Some((1_000_000, 500_000)))
        .await
        .unwrap();
    assert!(
        store
            .issue_customer_invoice(scope, from, to, "USD", key)
            .await
            .is_err()
    );
    store
        .complete_and_settle(scope, new, Some((1, 1)))
        .await
        .unwrap();
    let (a, b) = tokio::join!(
        store.accrue_customer_charge(new),
        store.accrue_customer_charge(new)
    );
    a.unwrap();
    b.unwrap();
    let overview = store.customer_billing(scope).await.unwrap();
    assert_eq!(overview["unpriced"], "1");
    assert_eq!(overview["unresolved"], "0");
    let charges: i64 =
        sqlx::query_scalar("SELECT count(*) FROM customer_charges WHERE attempt_id=ANY($1)")
            .bind(vec![failed_priced, failed_unpriced])
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(charges, 0);

    assert_eq!(overview["balances"][0]["unbilled_nanos"], "6500011000");
    let (a, b) = tokio::join!(
        store.issue_customer_invoice(scope, from, to, "USD", key),
        store.issue_customer_invoice(scope, from, to, "USD", key)
    );
    let invoice = a.unwrap();
    assert_eq!(invoice, b.unwrap());
    assert!(
        store
            .issue_customer_invoice(scope, from, to + 1, "USD", key)
            .await
            .is_err()
    );
    assert!(
        store
            .issue_customer_invoice(scope, from, to, "USD", Uuid::new_v4())
            .await
            .is_err()
    );
    let lines = store.customer_invoice_lines(scope, invoice).await.unwrap();
    assert_eq!(lines.len(), 2);
    assert!(
        lines
            .iter()
            .any(|line| line["revision"] == first.to_string()
                && line["amount_nanos"] == "6500000000")
    );
    assert!(
        lines
            .iter()
            .any(|line| line["revision"] == second.to_string() && line["amount_nanos"] == "11000")
    );
    let foreign = TenantScope {
        organization_id: Uuid::new_v4(),
        project_id: Uuid::new_v4(),
    };
    assert!(
        store
            .customer_invoice_lines(foreign, invoice)
            .await
            .unwrap()
            .is_empty()
    );
    assert!(
        store
            .record_customer_payment(foreign, invoice, "bank-1")
            .await
            .is_err()
    );
    let (a, b) = tokio::join!(
        store.record_customer_payment(scope, invoice, "bank-1"),
        store.record_customer_payment(scope, invoice, "bank-1")
    );
    a.unwrap();
    b.unwrap();
    assert!(
        store
            .record_customer_payment(scope, invoice, "changed-reference")
            .await
            .is_err()
    );
    let overview = store.customer_billing(scope).await.unwrap();
    assert_eq!(overview["balances"][0]["paid_nanos"], "6500011000");
    assert_eq!(overview["balances"][0]["due_nanos"], "0");
    assert!(
        sqlx::query("UPDATE customer_charges SET amount_nanos=0")
            .execute(&pool)
            .await
            .is_err()
    );
    assert!(
        sqlx::query("DELETE FROM customer_invoices")
            .execute(&pool)
            .await
            .is_err()
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM provider_earnings")
            .fetch_one(&pool)
            .await
            .unwrap(),
        0
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn prepaid_charge_is_pinned_prospective_and_debited_once(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    store
        .publish_customer_tariff(
            scope,
            &ProviderOfferInput {
                model_alias: "text".into(),
                currency: "USD".into(),
                prompt_rate: "3000000000".into(),
                completion_rate: "7000000000".into(),
                expected_revision: None,
            },
        )
        .await
        .unwrap();
    let historical = attempt(&store, &pool, scope, "text").await;
    let account = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO customer_balance_accounts(id,organization_id,currency) VALUES($1,$2,'USD')",
    )
    .bind(account)
    .bind(scope.organization_id)
    .execute(&pool)
    .await
    .unwrap();
    store
        .record_settled_customer_funding(
            scope.organization_id,
            "USD",
            10000,
            "test-settlement",
            "charge-fixture",
        )
        .await
        .unwrap();
    let current = attempt(&store, &pool, scope, "text").await;
    for id in [historical, current] {
        store
            .complete_and_settle(scope, id, Some((1, 1)))
            .await
            .unwrap();
    }
    let (a, b) = tokio::join!(
        store.accrue_customer_charge(current),
        store.accrue_customer_charge(current)
    );
    a.unwrap();
    b.unwrap();
    store.accrue_customer_charge(historical).await.unwrap();
    let entries: Vec<(Uuid, i64)> = sqlx::query_as(
        "SELECT attempt_id,amount_nanos FROM customer_balance_entries WHERE account_id=$1 AND kind='charge'",
    )
    .bind(account)
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(entries, vec![(current, -10000)]);
    let summary = store
        .customer_balance_summary(scope.organization_id)
        .await
        .unwrap();
    assert_eq!(summary[0]["balance_nanos"], "0");
    assert_eq!(summary[0]["credit_limit_nanos"], "0");
    assert_eq!(
        summary[0]["warning_threshold_nanos"],
        serde_json::Value::Null
    );
    assert_eq!(summary[0]["low_balance"], false);
    assert_eq!(summary[0]["posted_credit_exhausted"], true);
    store
        .configure_customer_balance_policy(scope.organization_id, "USD", 20000, Some(5000), 0)
        .await
        .unwrap();
    let summary = store
        .customer_balance_summary(scope.organization_id)
        .await
        .unwrap();
    assert_eq!(summary[0]["credit_limit_nanos"], "20000");
    assert_eq!(summary[0]["low_balance"], true);
    assert_eq!(summary[0]["posted_credit_exhausted"], false);
    assert!(summary[0].get("id").is_none());
    assert!(
        store
            .customer_balance_summary(Uuid::new_v4())
            .await
            .unwrap()
            .is_empty()
    );

    let reopened = Store::from_pool(pool.clone());
    reopened.accrue_customer_charge(current).await.unwrap();
    assert_eq!(
        sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM customer_balance_entries WHERE account_id=$1"
        )
        .bind(account)
        .fetch_one(&pool)
        .await
        .unwrap(),
        2
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn settled_funding_is_exact_idempotent_and_cannot_cross_accounts(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let (a, b) = tokio::join!(
        store.record_settled_customer_funding(
            scope.organization_id,
            "CNY",
            1000000000,
            "test-settlement",
            "payment-one"
        ),
        store.record_settled_customer_funding(
            scope.organization_id,
            "CNY",
            1000000000,
            "test-settlement",
            "payment-one"
        )
    );
    let entry = a.unwrap();
    assert_eq!(entry, b.unwrap());
    assert!(
        store
            .record_settled_customer_funding(
                scope.organization_id,
                "CNY",
                2000000000,
                "test-settlement",
                "payment-one"
            )
            .await
            .is_err()
    );
    assert!(
        store
            .record_settled_customer_funding(
                scope.organization_id,
                "USD",
                1000000000,
                "test-settlement",
                "payment-one"
            )
            .await
            .is_err()
    );
    let foreign = Uuid::new_v4();
    sqlx::query("INSERT INTO organizations(id,name) VALUES($1,'Other funding test')")
        .bind(foreign)
        .execute(&pool)
        .await
        .unwrap();
    assert!(
        store
            .record_settled_customer_funding(
                foreign,
                "CNY",
                1000000000,
                "test-settlement",
                "payment-one"
            )
            .await
            .is_err()
    );
    assert!(
        store
            .customer_balance_summary(foreign)
            .await
            .unwrap()
            .is_empty()
    );
    for amount in [0, -1] {
        assert!(
            store
                .record_settled_customer_funding(
                    scope.organization_id,
                    "CNY",
                    amount,
                    "test-settlement",
                    "bad-payment"
                )
                .await
                .is_err()
        );
    }
    let summary = store
        .customer_balance_summary(scope.organization_id)
        .await
        .unwrap();
    assert_eq!(summary.len(), 1);
    assert_eq!(summary[0]["balance_nanos"], "1000000000");
    assert_eq!(summary[0]["credit_limit_nanos"], "0");
    assert_eq!(summary[0]["posted_credit_exhausted"], false);
    let reopened = Store::from_pool(pool.clone());
    assert_eq!(
        reopened
            .record_settled_customer_funding(
                scope.organization_id,
                "CNY",
                1000000000,
                "test-settlement",
                "payment-one"
            )
            .await
            .unwrap(),
        entry
    );
    assert!(
        sqlx::query("UPDATE customer_funding_receipts SET amount_nanos=1")
            .execute(&pool)
            .await
            .is_err()
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn prepaid_reservations_share_capacity_and_hold_uncertain_liabilities(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    store
        .record_settled_customer_funding(
            scope.organization_id,
            "USD",
            100000,
            "test-settlement",
            "reservation-funding",
        )
        .await
        .unwrap();
    let second_scope = TenantScope {
        organization_id: scope.organization_id,
        project_id: Uuid::new_v4(),
    };
    sqlx::query(
        "INSERT INTO projects(id,organization_id,name) VALUES($1,$2,'Second prepaid workspace')",
    )
    .bind(second_scope.project_id)
    .bind(scope.organization_id)
    .execute(&pool)
    .await
    .unwrap();
    let mut ids = Vec::new();
    for scoped in [scope, second_scope] {
        store
            .publish_customer_tariff(
                scoped,
                &ProviderOfferInput {
                    model_alias: "text".into(),
                    currency: "USD".into(),
                    prompt_rate: "3000000000".into(),
                    completion_rate: "7000000000".into(),
                    expected_revision: None,
                },
            )
            .await
            .unwrap();
        let op = store.create_operation(scoped, "text").await.unwrap();
        let id = store
            .prepare_attempt(scoped, op, "text", "test")
            .await
            .unwrap();
        store
            .bind_customer_tariff(scoped, id, "text")
            .await
            .unwrap();
        ids.push(id);
    }
    let (a, b) = tokio::join!(
        store.reserve_customer_balance(scope, ids[0], 60000),
        store.reserve_customer_balance(second_scope, ids[1], 60000)
    );
    assert_ne!(a.is_ok(), b.is_ok());
    let loser = if a.is_ok() { ids[1] } else { ids[0] };
    assert!(
        sqlx::query(
            "UPDATE attempts SET execution='may_have_executed',dispatched_at=now() WHERE id=$1"
        )
        .bind(loser)
        .execute(&pool)
        .await
        .is_err()
    );
    let (winner, scoped) = if a.is_ok() {
        (ids[0], scope)
    } else {
        (ids[1], second_scope)
    };
    store
        .reserve_customer_balance(scoped, winner, 60000)
        .await
        .unwrap();
    assert!(
        store
            .reserve_customer_balance(scoped, winner, 50000)
            .await
            .is_err()
    );
    assert!(
        store
            .reserve_customer_balance(
                TenantScope {
                    organization_id: Uuid::new_v4(),
                    project_id: scoped.project_id
                },
                winner,
                60000
            )
            .await
            .is_err()
    );
    sqlx::query(
        "UPDATE attempts SET execution='may_have_executed',dispatched_at=now() WHERE id=$1",
    )
    .bind(winner)
    .execute(&pool)
    .await
    .unwrap();
    assert!(
        store
            .release_nonexecuted_customer_balance(scoped, winner)
            .await
            .is_err()
    );
    let held:i64=sqlx::query_scalar("SELECT SUM(amount_nanos)::bigint FROM customer_balance_reservations WHERE released_at IS NULL").fetch_one(&pool).await.unwrap();
    assert_eq!(held, 60000);
    assert!(
        sqlx::query(
            "UPDATE customer_balance_reservations SET released_at=now() WHERE attempt_id=$1"
        )
        .bind(winner)
        .execute(&pool)
        .await
        .is_err()
    );
    assert!(
        sqlx::query("UPDATE customer_balance_reservations SET amount_nanos=1 WHERE attempt_id=$1")
            .bind(winner)
            .execute(&pool)
            .await
            .is_err()
    );

    store
        .complete_and_settle(scoped, winner, Some((1, 1)))
        .await
        .unwrap();
    store.accrue_customer_charge(winner).await.unwrap();
    let held: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM customer_balance_reservations WHERE released_at IS NULL",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(held, 0);
    assert!(
        sqlx::query(
            "UPDATE customer_balance_reservations SET released_at=NULL WHERE attempt_id=$1"
        )
        .bind(winner)
        .execute(&pool)
        .await
        .is_err()
    );
    assert!(
        sqlx::query("DELETE FROM customer_balance_reservations WHERE attempt_id=$1")
            .bind(winner)
            .execute(&pool)
            .await
            .is_err()
    );

    assert_eq!(
        store
            .customer_balance_summary(scope.organization_id)
            .await
            .unwrap()[0]["balance_nanos"],
        "90000"
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn concurrent_prepaid_admission_never_exceeds_company_capacity(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    store
        .record_settled_customer_funding(
            scope.organization_id,
            "USD",
            100000,
            "test-settlement",
            "concurrent-admission",
        )
        .await
        .unwrap();
    store
        .publish_customer_tariff(
            scope,
            &ProviderOfferInput {
                model_alias: "text".into(),
                currency: "USD".into(),
                prompt_rate: "3000000000".into(),
                completion_rate: "7000000000".into(),
                expected_revision: None,
            },
        )
        .await
        .unwrap();
    let mut attempts = Vec::new();
    for _ in 0..16 {
        let operation = store.create_operation(scope, "text").await.unwrap();
        let id = store
            .prepare_attempt(scope, operation, "text", "test")
            .await
            .unwrap();
        store.bind_customer_tariff(scope, id, "text").await.unwrap();
        attempts.push(id);
    }
    let barrier = std::sync::Arc::new(tokio::sync::Barrier::new(attempts.len()));
    let mut tasks = tokio::task::JoinSet::new();
    for id in attempts {
        let store = store.clone();
        let barrier = barrier.clone();
        tasks.spawn(async move {
            barrier.wait().await;
            (id, store.reserve_customer_balance(scope, id, 10000).await)
        });
    }
    let mut accepted = Vec::new();
    let mut denied = Vec::new();
    while let Some(result) = tasks.join_next().await {
        let (id, outcome) = result.unwrap();
        match outcome {
            Ok(()) => accepted.push(id),
            Err(niu_storage::StoreError::BudgetExceeded) => denied.push(id),
            Err(error) => panic!("unexpected admission error: {error:?}"),
        }
    }
    assert_eq!(accepted.len(), 10);
    assert_eq!(denied.len(), 6);
    let summary = store
        .customer_balance_summary(scope.organization_id)
        .await
        .unwrap();
    assert_eq!(summary[0]["balance_nanos"], "100000");
    assert_eq!(summary[0]["reserved_nanos"], "100000");
    assert_eq!(summary[0]["available_nanos"], "0");
    // Retrying an accepted reservation cannot consume another slice of balance.
    for id in &accepted {
        store
            .reserve_customer_balance(scope, *id, 10000)
            .await
            .unwrap();
    }
    store
        .release_nonexecuted_customer_balance(scope, accepted[0])
        .await
        .unwrap();
    store
        .reserve_customer_balance(scope, denied[0], 10000)
        .await
        .unwrap();
    assert!(matches!(
        store
            .reserve_customer_balance(scope, denied[1], 10000)
            .await,
        Err(niu_storage::StoreError::BudgetExceeded)
    ));
    let summary = store
        .customer_balance_summary(scope.organization_id)
        .await
        .unwrap();
    assert_eq!(summary[0]["reserved_nanos"], "100000");
    assert_eq!(summary[0]["available_nanos"], "0");
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn approved_credit_preserves_holds_and_supports_negative_balance_recovery(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    assert_eq!(
        store
            .configure_customer_balance_policy(scope.organization_id, "USD", 20000, Some(5000), 0)
            .await
            .unwrap(),
        1
    );
    assert!(
        store
            .configure_customer_balance_policy(scope.organization_id, "USD", 0, None, 0)
            .await
            .is_err()
    );
    store
        .publish_customer_tariff(
            scope,
            &ProviderOfferInput {
                model_alias: "text".into(),
                currency: "USD".into(),
                prompt_rate: "3000000000".into(),
                completion_rate: "7000000000".into(),
                expected_revision: None,
            },
        )
        .await
        .unwrap();
    let id = attempt(&store, &pool, scope, "text").await;
    assert!(
        store
            .configure_customer_balance_policy(scope.organization_id, "USD", 0, Some(5000), 1)
            .await
            .is_err()
    );
    store
        .complete_and_settle(scope, id, Some((1, 1)))
        .await
        .unwrap();
    let summary = store
        .customer_balance_summary(scope.organization_id)
        .await
        .unwrap();
    assert_eq!(summary[0]["balance_nanos"], "-10000");
    assert_eq!(summary[0]["available_nanos"], "10000");
    assert_eq!(summary[0]["low_balance"], true);
    assert_eq!(
        store
            .configure_customer_balance_policy(scope.organization_id, "USD", 0, Some(5000), 1)
            .await
            .unwrap(),
        2
    );
    assert_eq!(
        store
            .customer_balance_summary(scope.organization_id)
            .await
            .unwrap()[0]["available_nanos"],
        "-10000"
    );
    let op = store.create_operation(scope, "text").await.unwrap();
    let next = store
        .prepare_attempt(scope, op, "text", "test")
        .await
        .unwrap();
    store
        .bind_customer_tariff(scope, next, "text")
        .await
        .unwrap();
    assert!(
        store
            .reserve_customer_balance(scope, next, 10000)
            .await
            .is_err()
    );
    store
        .record_settled_customer_funding(
            scope.organization_id,
            "USD",
            30000,
            "test-settlement",
            "credit-recovery",
        )
        .await
        .unwrap();
    store
        .reserve_customer_balance(scope, next, 10000)
        .await
        .unwrap();
    let summary = store
        .customer_balance_summary(scope.organization_id)
        .await
        .unwrap();
    assert_eq!(summary[0]["balance_nanos"], "20000");
    assert_eq!(summary[0]["available_nanos"], "10000");
    assert_eq!(summary[0]["low_balance"], false);
    assert!(
        sqlx::query("DELETE FROM customer_balance_policy_revisions")
            .execute(&pool)
            .await
            .is_err()
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn balance_release_recovery_keeps_uncertain_holds(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    store
        .record_settled_customer_funding(
            scope.organization_id,
            "USD",
            100000,
            "test-settlement",
            "release-recovery",
        )
        .await
        .unwrap();
    store
        .publish_customer_tariff(
            scope,
            &ProviderOfferInput {
                model_alias: "text".into(),
                currency: "USD".into(),
                prompt_rate: "3000000000".into(),
                completion_rate: "7000000000".into(),
                expected_revision: None,
            },
        )
        .await
        .unwrap();
    let mut ids = Vec::new();
    for _ in 0..3 {
        let op = store.create_operation(scope, "text").await.unwrap();
        let id = store
            .prepare_attempt(scope, op, "text", "test")
            .await
            .unwrap();
        store.bind_customer_tariff(scope, id, "text").await.unwrap();
        store
            .reserve_customer_balance(scope, id, 10000)
            .await
            .unwrap();
        ids.push(id);
    }
    for (id, status) in [
        (ids[1], "confirmed_not_executed"),
        (ids[2], "may_have_executed"),
    ] {
        sqlx::query("UPDATE attempts SET execution=$2,dispatched_at=now() WHERE id=$1")
            .bind(id)
            .bind(status)
            .execute(&pool)
            .await
            .unwrap();
    }
    let reopened = Store::from_pool(pool.clone());
    assert_eq!(
        reopened
            .recover_customer_balance_releases(None)
            .await
            .unwrap(),
        (None, 0)
    );
    assert_eq!(
        reopened
            .recover_customer_balance_releases(None)
            .await
            .unwrap(),
        (None, 0)
    );
    let held: Vec<Uuid> = sqlx::query_scalar(
        "SELECT attempt_id FROM customer_balance_reservations WHERE released_at IS NULL",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(held, vec![ids[2]]);
    assert!(
        store
            .reserve_customer_balance(scope, ids[0], 10000)
            .await
            .is_err()
    );
    assert_eq!(
        store
            .customer_balance_summary(scope.organization_id)
            .await
            .unwrap()[0]["available_nanos"],
        "90000"
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn balance_reversals_are_bounded_idempotent_and_keep_actual_debt(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let funding = store
        .record_settled_customer_funding(
            scope.organization_id,
            "USD",
            10000,
            "test-settlement",
            "reversal-fixture",
        )
        .await
        .unwrap();
    store
        .publish_customer_tariff(
            scope,
            &ProviderOfferInput {
                model_alias: "text".into(),
                currency: "USD".into(),
                prompt_rate: "3000000000".into(),
                completion_rate: "7000000000".into(),
                expected_revision: None,
            },
        )
        .await
        .unwrap();
    let id = attempt(&store, &pool, scope, "text").await;
    store
        .complete_and_settle(scope, id, Some((1, 1)))
        .await
        .unwrap();
    let key = Uuid::new_v4();
    let (a, b) = tokio::join!(
        store.reverse_customer_balance_entry(scope.organization_id, funding, 6000, key),
        store.reverse_customer_balance_entry(scope.organization_id, funding, 6000, key)
    );
    let reversal = a.unwrap();
    assert_eq!(reversal, b.unwrap());
    assert!(
        store
            .reverse_customer_balance_entry(scope.organization_id, funding, 7000, key)
            .await
            .is_err()
    );
    assert!(
        store
            .reverse_customer_balance_entry(scope.organization_id, funding, 5000, Uuid::new_v4())
            .await
            .is_err()
    );
    assert!(
        store
            .reverse_customer_balance_entry(Uuid::new_v4(), funding, 1, Uuid::new_v4())
            .await
            .is_err()
    );
    assert!(
        store
            .reverse_customer_balance_entry(scope.organization_id, reversal, 1, Uuid::new_v4())
            .await
            .is_err()
    );
    assert_eq!(
        store
            .customer_balance_summary(scope.organization_id)
            .await
            .unwrap()[0]["balance_nanos"],
        "-6000"
    );
    let charge: Uuid = sqlx::query_scalar(
        "SELECT id FROM customer_balance_entries WHERE attempt_id=$1 AND kind='charge'",
    )
    .bind(id)
    .fetch_one(&pool)
    .await
    .unwrap();
    let (a, b) = tokio::join!(
        store.reverse_customer_balance_entry(scope.organization_id, charge, 6000, Uuid::new_v4()),
        store.reverse_customer_balance_entry(scope.organization_id, charge, 6000, Uuid::new_v4())
    );
    assert_ne!(a.is_ok(), b.is_ok());
    assert_eq!(
        store
            .customer_balance_summary(scope.organization_id)
            .await
            .unwrap()[0]["balance_nanos"],
        "0"
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>(
            "SELECT amount_nanos FROM customer_charges WHERE attempt_id=$1"
        )
        .bind(id)
        .fetch_one(&pool)
        .await
        .unwrap(),
        10000
    );
    let reopened = Store::from_pool(pool.clone());
    assert_eq!(
        reopened
            .reverse_customer_balance_entry(scope.organization_id, funding, 6000, key)
            .await
            .unwrap(),
        reversal
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn company_balance_history_pages_and_rejects_foreign_cursors(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let company = store.create_organization("History test").await.unwrap();
    let foreign = store.create_organization("Other company").await.unwrap();
    let other = store
        .record_settled_customer_funding(foreign, "USD", 1, "fixture", "foreign-history")
        .await
        .unwrap();
    store
        .configure_customer_balance_policy(company, "USD", 0, None, 0)
        .await
        .unwrap();
    // Explicit test-only ledger fixtures share one transaction timestamp.
    let mut tx = pool.begin().await.unwrap();
    for _ in 0..105 {
        sqlx::query("INSERT INTO customer_balance_entries(id,organization_id,account_id,currency,kind,amount_nanos,idempotency_key) SELECT $1,organization_id,id,currency,'funding',1,$2 FROM customer_balance_accounts WHERE organization_id=$3 AND currency='USD'")
            .bind(Uuid::new_v4()).bind(Uuid::new_v4()).bind(company).execute(&mut *tx).await.unwrap();
    }
    tx.commit().await.unwrap();
    let (first, cursor) = store
        .customer_balance_transaction_page(company, None)
        .await
        .unwrap();
    assert_eq!(first.len(), 100);
    assert!(
        first
            .iter()
            .all(|entry| entry["created_at"] == first[0]["created_at"])
    );

    let newer = store
        .record_settled_customer_funding(company, "USD", 1, "fixture", "history-newer")
        .await
        .unwrap();
    let (second, end) = store
        .customer_balance_transaction_page(company, cursor)
        .await
        .unwrap();
    assert_eq!(second.len(), 5);
    assert!(end.is_none());
    assert!(
        !second
            .iter()
            .any(|entry| entry["id"].as_str() == Some(newer.to_string().as_str()))
    );
    let (refreshed, _) = store
        .customer_balance_transaction_page(company, None)
        .await
        .unwrap();
    assert_eq!(refreshed[0]["id"], newer.to_string());

    let mut ids: Vec<_> = first
        .iter()
        .chain(second.iter())
        .map(|entry| entry["id"].as_str().unwrap())
        .collect();
    ids.sort_unstable();
    ids.dedup();
    assert_eq!(ids.len(), 105);
    assert!(
        store
            .customer_balance_transaction_page(company, Some(other))
            .await
            .is_err()
    );
    assert!(
        store
            .customer_balance_transaction_page(company, Some(Uuid::new_v4()))
            .await
            .is_err()
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn prepaid_company_creation_is_atomic_zero_credit_and_preserves_legacy(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let legacy = store.create_organization("Legacy fixture").await.unwrap();
    let company = store
        .create_prepaid_organization("New customer", "USD")
        .await
        .unwrap();
    assert!(!store.customer_balance_enabled(legacy).await.unwrap());
    assert!(store.customer_balance_enabled(company).await.unwrap());
    let balances = store.customer_balance_summary(company).await.unwrap();
    assert_eq!(balances.len(), 1);
    assert_eq!(balances[0]["currency"], "USD");
    for field in [
        "balance_nanos",
        "available_nanos",
        "reserved_nanos",
        "credit_limit_nanos",
        "policy_revision",
    ] {
        assert_eq!(balances[0][field], "0");
    }
    assert!(
        store
            .create_prepaid_organization("Invalid currency", "usd")
            .await
            .is_err()
    );
    assert!(store.create_prepaid_organization("", "USD").await.is_err());
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM organizations WHERE name IN ('Invalid currency','')",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(count, 0);
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn default_prepaid_setup_is_concurrent_idempotent_and_shared(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let (a, b) = tokio::join!(
        store.default_prepaid_workspace(),
        store.default_prepaid_workspace()
    );
    let a = a.unwrap();
    let b = b.unwrap();
    assert_eq!(a.organization_id, b.organization_id);
    assert_eq!(a.project_id, b.project_id);
    let balances = store
        .customer_balance_summary(a.organization_id)
        .await
        .unwrap();
    assert_eq!(balances.len(), 1);
    assert_eq!(balances[0]["available_nanos"], "0");
    assert_eq!(balances[0]["credit_limit_nanos"], "0");
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM customer_balance_accounts")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 1);
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn prepaid_setup_reuses_legacy_default_without_retroactive_conversion(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let old = store.default_workspace().await.unwrap();
    let new = store.default_prepaid_workspace().await.unwrap();
    assert_eq!(old.organization_id, new.organization_id);
    assert_eq!(old.project_id, new.project_id);
    assert!(
        !store
            .customer_balance_enabled(old.organization_id)
            .await
            .unwrap()
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn customer_warning_changes_are_revision_checked_without_changing_credit(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let company = store
        .create_prepaid_organization("Warning owner", "USD")
        .await
        .unwrap();
    store
        .configure_customer_balance_policy(company, "USD", 100, None, 0)
        .await
        .unwrap();
    let (a, b) = tokio::join!(
        store.configure_customer_balance_warning(company, "USD", Some(10), 1),
        store.configure_customer_balance_warning(company, "USD", Some(20), 1)
    );
    assert_ne!(a.is_ok(), b.is_ok());
    let balances = store.customer_balance_summary(company).await.unwrap();
    assert_eq!(balances[0]["credit_limit_nanos"], "100");
    assert_eq!(balances[0]["balance_nanos"], "0");
    assert_eq!(balances[0]["policy_revision"], "2");
    assert_eq!(balances[0]["low_balance"], true);
    assert_eq!(
        store
            .configure_customer_balance_warning(company, "USD", None, 2)
            .await
            .unwrap(),
        3
    );
    assert!(
        !store.customer_balance_summary(company).await.unwrap()[0]["low_balance"]
            .as_bool()
            .unwrap()
    );
    assert!(
        store
            .configure_customer_balance_warning(company, "EUR", Some(1), 0)
            .await
            .is_err()
    );
    assert!(
        store
            .configure_customer_balance_warning(company, "USD", Some(-1), 3)
            .await
            .is_err()
    );
    assert_eq!(
        store.customer_balance_summary(company).await.unwrap().len(),
        1
    );
}
