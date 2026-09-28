use niu_storage::{MIGRATOR, ProviderOfferInput, Store, TenantScope};
use sqlx::PgPool;
use uuid::Uuid;

async fn attempt(store: &Store, pool: &PgPool, scope: TenantScope, alias: &str) -> Uuid {
    let op = store.create_operation(scope, alias).await.unwrap();
    let id = store
        .prepare_attempt(scope, op, alias, "test")
        .await
        .unwrap();
    store.bind_customer_tariff(scope, id, alias).await.unwrap();
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
