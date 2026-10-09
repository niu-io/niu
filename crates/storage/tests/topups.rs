use niu_storage::{MIGRATOR, Store, TopupInput};
use sqlx::PgPool;
use uuid::Uuid;

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn epay_payment_references_match_verifier_without_relaxing_other_adapters(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let company = store
        .create_prepaid_organization("EPay reference boundaries", "CNY")
        .await
        .unwrap();
    for (aggregator, reference, accepted) in [
        ("epay", "payment_123-abc", true),
        ("zhifux", "payment_123-abc", false),
        ("epay", "", false),
        ("epay", "payment/reference", false),
    ] {
        let order = store
            .create_customer_topup(
                company,
                &TopupInput {
                    currency: "CNY",
                    amount_nanos: 10_000_000,
                    aggregator,
                    merchant: "1234",
                    payment_method: "alipay",
                    idempotency_key: Uuid::new_v4(),
                },
            )
            .await
            .unwrap();
        assert_eq!(
            store
                .bind_customer_topup_provider(company, order.id, reference)
                .await
                .is_ok(),
            accepted
        );
        if accepted {
            let entry = store
                .settle_verified_customer_topup(company, order.id, reference, order.amount_nanos)
                .await
                .unwrap();
            assert_eq!(
                Store::from_pool(pool.clone())
                    .settle_verified_customer_topup(
                        company,
                        order.id,
                        reference,
                        order.amount_nanos
                    )
                    .await
                    .unwrap(),
                entry
            );
        } else {
            assert!(sqlx::query("INSERT INTO customer_topup_provider_orders(order_id,aggregator,merchant,platform_reference) VALUES($1,$2,'1234',$3)").bind(order.id).bind(aggregator).bind(reference).execute(&pool).await.is_err());
        }
    }
    let credits: i64 =
        sqlx::query_scalar("SELECT count(*) FROM customer_balance_entries WHERE kind='funding'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(credits, 1);
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn epay_merchant_checkout_survives_reopen_without_payment_identity(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let company = store
        .create_prepaid_organization("EPay checkout", "CNY")
        .await
        .unwrap();
    let foreign = store
        .create_prepaid_organization("Other checkout", "CNY")
        .await
        .unwrap();
    let order = store
        .create_customer_topup(
            company,
            &TopupInput {
                currency: "CNY",
                amount_nanos: 1_230_000_000,
                aggregator: "epay",
                merchant: "1234",
                payment_method: "alipay",
                idempotency_key: Uuid::new_v4(),
            },
        )
        .await
        .unwrap();
    let checkout = "https://checkout.example/submit.php?out_trade_no=saved";
    assert!(
        store
            .save_epay_merchant_checkout(foreign, order.id, checkout)
            .await
            .is_err()
    );
    assert!(
        store
            .save_epay_merchant_checkout(company, order.id, "http://checkout.example/submit.php")
            .await
            .is_err()
    );
    let (a, b) = tokio::join!(
        store.save_epay_merchant_checkout(company, order.id, checkout),
        store.save_epay_merchant_checkout(company, order.id, checkout)
    );
    a.unwrap();
    b.unwrap();
    let reopened = Store::from_pool(pool.clone());
    assert_eq!(
        reopened
            .customer_topup_checkout(company, order.id)
            .await
            .unwrap()
            .as_deref(),
        Some(checkout)
    );
    assert!(
        reopened
            .customer_topup_checkout(foreign, order.id)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        reopened
            .customer_topup_platform_reference(company, order.id)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        reopened
            .settle_verified_customer_topup(company, order.id, "notYetKnown", order.amount_nanos)
            .await
            .is_err()
    );
    assert!(
        reopened
            .save_epay_merchant_checkout(
                company,
                order.id,
                "https://checkout.example/submit.php?changed=1"
            )
            .await
            .is_err()
    );
    let (history, _) = reopened
        .customer_topup_history(company, None)
        .await
        .unwrap();
    assert_eq!(history[0]["status"], "pending");
    assert_eq!(history[0]["checkout_url"], checkout);
    let credits: i64 =
        sqlx::query_scalar("SELECT count(*) FROM customer_balance_entries WHERE kind='funding'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(credits, 0);
    reopened
        .bind_customer_topup_provider(company, order.id, "payment123")
        .await
        .unwrap();
    reopened
        .settle_verified_customer_topup(company, order.id, "payment123", order.amount_nanos)
        .await
        .unwrap();
    let (history, _) = reopened
        .customer_topup_history(company, None)
        .await
        .unwrap();
    assert_eq!(history[0]["status"], "paid");
    assert!(history[0]["checkout_url"].is_null());
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn customer_topup_history_is_bounded_scoped_and_recovers_saved_checkout(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let company = store
        .create_prepaid_organization("Checkout history", "CNY")
        .await
        .unwrap();
    let foreign = store
        .create_prepaid_organization("Foreign checkout history", "CNY")
        .await
        .unwrap();
    let mut ids = Vec::new();
    for index in 0..102 {
        let organization = if index == 101 { foreign } else { company };
        let order = store
            .create_customer_topup(
                organization,
                &TopupInput {
                    currency: "CNY",
                    amount_nanos: 1_000_000_000,
                    aggregator: "zhifux",
                    merchant: "privateMerchant",
                    payment_method: "wxpaynative",
                    idempotency_key: Uuid::new_v4(),
                },
            )
            .await
            .unwrap();
        ids.push(order.id);
        if index == 100 {
            store
                .bind_customer_topup_checkout(
                    company,
                    order.id,
                    "privatePlatform",
                    "https://checkout.example/pay?saved=1",
                )
                .await
                .unwrap();
        }
    }
    let (page, next) = Store::from_pool(pool.clone())
        .customer_topup_history(company, None)
        .await
        .unwrap();
    assert_eq!(page.len(), 100);
    assert!(next.is_some());
    assert_eq!(page[0]["id"], ids[100].to_string());
    assert_eq!(page[0]["status"], "pending");
    assert_eq!(
        page[0]["checkout_url"],
        "https://checkout.example/pay?saved=1"
    );
    assert!(page[0]["created_at"].as_str().is_some());
    let serialized = serde_json::to_string(&page).unwrap();
    for confidential in [
        "privateMerchant",
        "privatePlatform",
        "account_id",
        "supplier",
        "margin",
    ] {
        assert!(!serialized.contains(confidential));
    }
    let (older, end) = store.customer_topup_history(company, next).await.unwrap();
    assert_eq!(older.len(), 1);
    assert_eq!(older[0]["id"], ids[0].to_string());
    assert!(end.is_none());
    assert!(
        store
            .customer_topup_history(company, Some(ids[101]))
            .await
            .is_err()
    );
    assert!(
        store
            .customer_topup_history(company, Some(Uuid::new_v4()))
            .await
            .is_err()
    );
    store
        .close_verified_customer_topup(company, ids[100], "privatePlatform")
        .await
        .unwrap();
    let (updated, _) = store.customer_topup_history(company, None).await.unwrap();
    assert_eq!(updated[0]["status"], "closed");
    assert!(updated[0]["checkout_url"].is_null());
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn verified_closure_is_scoped_immutable_and_excludes_settlement(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let company = store
        .create_prepaid_organization("Closed payments", "CNY")
        .await
        .unwrap();
    let other = store
        .create_prepaid_organization("Other closed payments", "CNY")
        .await
        .unwrap();
    for mode in ["closed", "paid", "race"] {
        let order = store
            .create_customer_topup(
                company,
                &TopupInput {
                    currency: "CNY",
                    amount_nanos: 1_000_000_000,
                    aggregator: "zhifux",
                    merchant: "merchant01",
                    payment_method: "wxpaynative",
                    idempotency_key: Uuid::new_v4(),
                },
            )
            .await
            .unwrap();
        assert!(
            store
                .close_verified_customer_topup(company, order.id, mode)
                .await
                .is_err()
        );
        store
            .bind_customer_topup_provider(company, order.id, mode)
            .await
            .unwrap();
        assert!(
            store
                .close_verified_customer_topup(other, order.id, mode)
                .await
                .is_err()
        );
        assert!(
            store
                .close_verified_customer_topup(company, order.id, "changed")
                .await
                .is_err()
        );
        match mode {
            "closed" => {
                store
                    .close_verified_customer_topup(company, order.id, mode)
                    .await
                    .unwrap();
                store
                    .close_verified_customer_topup(company, order.id, mode)
                    .await
                    .unwrap();
                assert!(
                    store
                        .settle_verified_customer_topup(company, order.id, mode, 1_000_000_000)
                        .await
                        .is_err()
                );
                assert_eq!(
                    store.customer_balance_summary(company).await.unwrap()[0]["balance_nanos"],
                    "0"
                );
                assert_eq!(
                    Store::from_pool(pool.clone())
                        .customer_topup_closed(company, order.id)
                        .await
                        .unwrap(),
                    Some(true)
                );
                assert_eq!(
                    store.customer_topup_closed(other, order.id).await.unwrap(),
                    None
                );
                assert!(
                    store
                        .pending_customer_topup("zhifux", "merchant01", None)
                        .await
                        .unwrap()
                        .is_none()
                );
                assert!(
                    sqlx::query("DELETE FROM customer_topup_closures WHERE order_id=$1")
                        .bind(order.id)
                        .execute(&pool)
                        .await
                        .is_err()
                );
                assert!(
                    sqlx::query(
                        "UPDATE customer_topup_closures SET verified_at=now() WHERE order_id=$1"
                    )
                    .bind(order.id)
                    .execute(&pool)
                    .await
                    .is_err()
                );
            }
            "paid" => {
                store
                    .settle_verified_customer_topup(company, order.id, mode, 1_000_000_000)
                    .await
                    .unwrap();
                assert!(
                    store
                        .close_verified_customer_topup(company, order.id, mode)
                        .await
                        .is_err()
                );
                assert!(sqlx::query("INSERT INTO customer_topup_closures(order_id,platform_reference) VALUES($1,$2)").bind(order.id).bind(mode).execute(&pool).await.is_err());
            }
            _ => {
                let (closed, paid) = tokio::join!(
                    store.close_verified_customer_topup(company, order.id, mode),
                    store.settle_verified_customer_topup(company, order.id, mode, 1_000_000_000),
                );
                assert_ne!(closed.is_ok(), paid.is_ok());
                let closed = store
                    .customer_topup_closed(company, order.id)
                    .await
                    .unwrap()
                    .unwrap();
                let paid = store
                    .customer_topup_paid(company, order.id)
                    .await
                    .unwrap()
                    .unwrap();
                assert_ne!(closed, paid);
            }
        }
    }
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn checkout_response_is_durable_scoped_immutable_and_atomic(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let company = store
        .create_prepaid_organization("Checkout persistence", "CNY")
        .await
        .unwrap();
    let other = store
        .create_prepaid_organization("Other checkout", "CNY")
        .await
        .unwrap();
    let order = store
        .create_customer_topup(
            company,
            &TopupInput {
                currency: "CNY",
                amount_nanos: 1_000_000_000,
                aggregator: "zhifux",
                merchant: "merchant01",
                payment_method: "wxpaynative",
                idempotency_key: Uuid::new_v4(),
            },
        )
        .await
        .unwrap();
    let checkout = "https://checkout.example/pay?order=saved";
    for invalid in [
        "http://checkout.example/pay",
        "https://user@checkout.example/pay",
        "https://checkout.example/pay#fragment",
    ] {
        assert!(
            store
                .bind_customer_topup_checkout(company, order.id, "platform01", invalid)
                .await
                .is_err()
        );
    }
    assert!(
        store
            .customer_topup_platform_reference(company, order.id)
            .await
            .unwrap()
            .is_none()
    );
    sqlx::query("CREATE FUNCTION reject_test_checkout() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$").execute(&pool).await.unwrap();
    sqlx::query("CREATE TRIGGER reject_test_checkout BEFORE INSERT ON customer_topup_checkout FOR EACH ROW EXECUTE FUNCTION reject_test_checkout()").execute(&pool).await.unwrap();
    assert!(
        store
            .bind_customer_topup_checkout(company, order.id, "platform01", checkout)
            .await
            .is_err()
    );
    assert!(
        store
            .customer_topup_platform_reference(company, order.id)
            .await
            .unwrap()
            .is_none()
    );
    sqlx::query("DROP TRIGGER reject_test_checkout ON customer_topup_checkout")
        .execute(&pool)
        .await
        .unwrap();
    let (a, b) = tokio::join!(
        store.bind_customer_topup_checkout(company, order.id, "platform01", checkout),
        store.bind_customer_topup_checkout(company, order.id, "platform01", checkout)
    );
    a.unwrap();
    b.unwrap();
    assert_eq!(
        Store::from_pool(pool.clone())
            .customer_topup_checkout(company, order.id)
            .await
            .unwrap()
            .as_deref(),
        Some(checkout)
    );
    assert!(
        store
            .customer_topup_checkout(other, order.id)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        store
            .bind_customer_topup_checkout(other, order.id, "platform01", checkout)
            .await
            .is_err()
    );
    assert!(
        store
            .bind_customer_topup_checkout(
                company,
                order.id,
                "platform01",
                "https://checkout.example/changed"
            )
            .await
            .is_err()
    );
    assert!(
        store
            .bind_customer_topup_checkout(company, order.id, "changedPlatform", checkout)
            .await
            .is_err()
    );
    assert!(sqlx::query("UPDATE customer_topup_checkout SET checkout_url='https://checkout.example/changed' WHERE order_id=$1").bind(order.id).execute(&pool).await.is_err());
    assert_eq!(
        store.customer_balance_summary(company).await.unwrap()[0]["balance_nanos"],
        "0"
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn merchant_query_admission_coordinates_replicas_and_survives_reopening(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let first = Store::from_pool(pool.clone());
    let second = Store::from_pool(pool.clone());
    let (a, b) = tokio::join!(
        first.claim_payment_query("zhifux", "merchant01"),
        second.claim_payment_query("zhifux", "merchant01")
    );
    assert_ne!(a.unwrap(), b.unwrap());
    assert!(
        !Store::from_pool(pool.clone())
            .claim_payment_query("zhifux", "merchant01")
            .await
            .unwrap()
    );
    assert!(
        first
            .claim_payment_query("zhifux", "merchant02")
            .await
            .unwrap()
    );
    assert!(
        first
            .claim_payment_query("other", "merchant01")
            .await
            .unwrap()
    );
    assert!(
        first
            .claim_payment_query("INVALID", "merchant01")
            .await
            .is_err()
    );
    let remaining: f64 = sqlx::query_scalar("SELECT extract(epoch FROM next_query_at-clock_timestamp())::float8 FROM payment_query_limits WHERE aggregator='zhifux' AND merchant='merchant01'").fetch_one(&pool).await.unwrap();
    assert!(remaining > 0.0 && remaining <= 3.0);
    // Fixture-controlled expiry avoids a wall-clock sleep and keeps admission
    // assertions tied to the authoritative database timestamp.
    sqlx::query("UPDATE payment_query_limits SET next_query_at=clock_timestamp()-interval '1 second' WHERE aggregator='zhifux' AND merchant='merchant01'").execute(&pool).await.unwrap();
    assert!(
        second
            .claim_payment_query("zhifux", "merchant01")
            .await
            .unwrap()
    );
    assert!(
        !first
            .claim_payment_query("zhifux", "merchant01")
            .await
            .unwrap()
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn topup_intent_identity_and_settlement_are_scoped_atomic_and_idempotent(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let company = store
        .create_prepaid_organization("Payment review", "CNY")
        .await
        .unwrap();
    let other = store
        .create_prepaid_organization("Other company", "CNY")
        .await
        .unwrap();
    let mut input = TopupInput {
        currency: "CNY",
        amount_nanos: 10_000_000_000,
        aggregator: "zhifux",
        merchant: "merchant01",
        payment_method: "wxpaynative",
        idempotency_key: Uuid::new_v4(),
    };
    let (a, b) = tokio::join!(
        store.create_customer_topup(company, &input),
        store.create_customer_topup(company, &input)
    );
    let order = a.unwrap();
    assert_eq!(order, b.unwrap());
    assert!(
        store
            .pending_customer_topup("zhifux", "merchant01", None)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        store
            .claim_customer_topup_creation(other, order.id)
            .await
            .is_err()
    );
    let (first, second) = tokio::join!(
        store.claim_customer_topup_creation(company, order.id),
        store.claim_customer_topup_creation(company, order.id)
    );
    assert_ne!(first.unwrap(), second.unwrap());
    assert_eq!(
        store
            .pending_customer_topup("zhifux", "merchant01", None)
            .await
            .unwrap(),
        Some(order.clone())
    );
    assert!(
        store
            .pending_customer_topup("zhifux", "merchant01", Some(order.id))
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        store
            .pending_customer_topup("zhifux", "otherMerchant", None)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        !Store::from_pool(pool.clone())
            .claim_customer_topup_creation(company, order.id)
            .await
            .unwrap()
    );
    assert!(
        sqlx::query("DELETE FROM customer_topup_creation_claims WHERE order_id=$1")
            .bind(order.id)
            .execute(&pool)
            .await
            .is_err()
    );
    assert_eq!(
        store
            .customer_topup_for_callback("zhifux", "merchant01", order.id)
            .await
            .unwrap(),
        Some(order.clone())
    );
    for (aggregator, merchant) in [("other", "merchant01"), ("zhifux", "otherMerchant")] {
        assert!(
            store
                .customer_topup_for_callback(aggregator, merchant, order.id)
                .await
                .unwrap()
                .is_none()
        );
    }
    assert!(
        store
            .customer_topup_platform_reference(company, order.id)
            .await
            .unwrap()
            .is_none()
    );
    assert_eq!(
        store.customer_balance_summary(company).await.unwrap()[0]["balance_nanos"],
        "0"
    );
    assert!(
        store
            .customer_topup(other, order.id)
            .await
            .unwrap()
            .is_none()
    );
    input.amount_nanos += 1;
    assert!(store.create_customer_topup(company, &input).await.is_err());
    input.amount_nanos -= 1;
    assert!(
        store
            .settle_verified_customer_topup(company, order.id, "platform01", input.amount_nanos)
            .await
            .is_err()
    );
    assert!(
        store
            .bind_customer_topup_provider(other, order.id, "platform01")
            .await
            .is_err()
    );
    store
        .bind_customer_topup_provider(company, order.id, "platform01")
        .await
        .unwrap();
    store
        .bind_customer_topup_provider(company, order.id, "platform01")
        .await
        .unwrap();
    assert!(
        store
            .bind_customer_topup_provider(company, order.id, "replacement")
            .await
            .is_err()
    );
    assert!(
        store
            .settle_verified_customer_topup(company, order.id, "platform01", input.amount_nanos - 1)
            .await
            .is_err()
    );
    assert!(
        store
            .settle_verified_customer_topup(other, order.id, "platform01", input.amount_nanos)
            .await
            .is_err()
    );
    let (a, b) = tokio::join!(
        store.settle_verified_customer_topup(company, order.id, "platform01", input.amount_nanos),
        store.settle_verified_customer_topup(company, order.id, "platform01", input.amount_nanos)
    );
    assert_eq!(a.unwrap(), b.unwrap());
    assert!(
        store
            .pending_customer_topup("zhifux", "merchant01", None)
            .await
            .unwrap()
            .is_none()
    );
    assert_eq!(
        store.customer_balance_summary(company).await.unwrap()[0]["balance_nanos"],
        "10000000000"
    );
    assert_eq!(
        store
            .customer_balance_transactions(company)
            .await
            .unwrap()
            .len(),
        1
    );
    let reopened = Store::from_pool(pool.clone());
    assert_eq!(
        reopened
            .customer_topup_platform_reference(company, order.id)
            .await
            .unwrap()
            .as_deref(),
        Some("platform01")
    );
    assert!(
        reopened
            .customer_topup_platform_reference(other, order.id)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        reopened
            .customer_topup_for_callback("zhifux", "merchant01", Uuid::new_v4())
            .await
            .unwrap()
            .is_none()
    );
    assert_eq!(
        reopened.customer_topup(company, order.id).await.unwrap(),
        Some(order.clone())
    );
    assert!(
        sqlx::query("UPDATE customer_topup_orders SET amount_nanos=1 WHERE id=$1")
            .bind(order.id)
            .execute(&pool)
            .await
            .is_err()
    );
    assert!(
        sqlx::query("DELETE FROM customer_topup_settlements WHERE order_id=$1")
            .bind(order.id)
            .execute(&pool)
            .await
            .is_err()
    );
    input.idempotency_key = Uuid::new_v4();
    let foreign = store.create_customer_topup(other, &input).await.unwrap();
    assert!(
        store
            .bind_customer_topup_provider(other, foreign.id, "platform01")
            .await
            .is_err()
    );
    assert_eq!(
        store.customer_balance_summary(other).await.unwrap()[0]["balance_nanos"],
        "0"
    );
    // A saved provider identity must also suppress creation for legacy orders
    // that were bound before creation claims were introduced.
    store
        .bind_customer_topup_provider(other, foreign.id, "foreignPlatform")
        .await
        .unwrap();
    assert_eq!(
        Store::from_pool(pool.clone())
            .pending_customer_topup("zhifux", "merchant01", None)
            .await
            .unwrap(),
        Some(foreign.clone())
    );
    assert!(
        !store
            .claim_customer_topup_creation(other, foreign.id)
            .await
            .unwrap()
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn settlement_failure_rolls_back_funding_and_can_be_retried(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let company = store
        .create_prepaid_organization("Atomic payment", "CNY")
        .await
        .unwrap();
    let input = TopupInput {
        currency: "CNY",
        amount_nanos: 1_000_000_000,
        aggregator: "zhifux",
        merchant: "merchant01",
        payment_method: "alipaysign",
        idempotency_key: Uuid::new_v4(),
    };
    let order = store.create_customer_topup(company, &input).await.unwrap();
    store
        .bind_customer_topup_provider(company, order.id, "platform02")
        .await
        .unwrap();
    sqlx::query("CREATE FUNCTION reject_test_settlement() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$").execute(&pool).await.unwrap();
    sqlx::query("CREATE TRIGGER reject_test_settlement BEFORE INSERT ON customer_topup_settlements FOR EACH ROW EXECUTE FUNCTION reject_test_settlement()").execute(&pool).await.unwrap();
    assert!(
        store
            .settle_verified_customer_topup(company, order.id, "platform02", input.amount_nanos)
            .await
            .is_err()
    );
    assert_eq!(
        store.customer_balance_summary(company).await.unwrap()[0]["balance_nanos"],
        "0"
    );
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM customer_funding_receipts")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 0);
    sqlx::query("DROP TRIGGER reject_test_settlement ON customer_topup_settlements")
        .execute(&pool)
        .await
        .unwrap();
    store
        .settle_verified_customer_topup(company, order.id, "platform02", input.amount_nanos)
        .await
        .unwrap();
    assert_eq!(
        store.customer_balance_summary(company).await.unwrap()[0]["balance_nanos"],
        "1000000000"
    );
    let missing = TopupInput {
        currency: "USD",
        ..input
    };
    assert!(
        store
            .create_customer_topup(company, &missing)
            .await
            .is_err()
    );
    assert_eq!(
        store.customer_balance_summary(company).await.unwrap().len(),
        1
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn preexisting_funding_receipt_cannot_be_credited_again_as_a_topup(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let company = store
        .create_prepaid_organization("Receipt collision", "CNY")
        .await
        .unwrap();
    store
        .record_settled_customer_funding(
            company,
            "CNY",
            1_000_000_000,
            "zhifux:merchant01",
            "existingPlatform",
        )
        .await
        .unwrap();
    let input = TopupInput {
        currency: "CNY",
        amount_nanos: 1_000_000_000,
        aggregator: "zhifux",
        merchant: "merchant01",
        payment_method: "wxpaynative",
        idempotency_key: Uuid::new_v4(),
    };
    let order = store.create_customer_topup(company, &input).await.unwrap();
    store
        .bind_customer_topup_provider(company, order.id, "existingPlatform")
        .await
        .unwrap();
    assert!(
        store
            .settle_verified_customer_topup(
                company,
                order.id,
                "existingPlatform",
                input.amount_nanos
            )
            .await
            .is_err()
    );
    assert_eq!(
        store.customer_balance_summary(company).await.unwrap()[0]["balance_nanos"],
        "1000000000"
    );
    assert_eq!(
        store
            .customer_balance_transactions(company)
            .await
            .unwrap()
            .len(),
        1
    );
    let settlements: i64 = sqlx::query_scalar("SELECT count(*) FROM customer_topup_settlements")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(settlements, 0);
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn stripe_session_references_settle_once_and_preserve_legacy_limits(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let company = store
        .create_prepaid_organization("Stripe fixture", "USD")
        .await
        .unwrap();
    let create = |aggregator| TopupInput {
        currency: "USD",
        amount_nanos: 2_000_000_000,
        aggregator,
        merchant: "fixtureMerchant",
        payment_method: "card",
        idempotency_key: Uuid::new_v4(),
    };
    let order = store
        .create_customer_topup(company, &create("stripe"))
        .await
        .unwrap();
    for invalid in ["plainLegacy", "cs_", "cs_bad/path", "cs_nonascii牛"] {
        assert!(
            store
                .bind_customer_topup_provider(company, order.id, invalid)
                .await
                .is_err()
        );
    }
    let session = "cs_test_saved_fixture";
    for invalid in [
        "https://evil.example/pay#fragment",
        "https://checkout.stripe.com.evil.example/pay",
        "https://user:secret@checkout.stripe.com/pay",
    ] {
        assert!(
            store
                .bind_customer_topup_checkout(company, order.id, session, invalid)
                .await
                .is_err()
        );
    }
    let checkout = "https://checkout.stripe.com/c/pay/cs_test_saved_fixture#checkout-state";
    store
        .bind_customer_topup_checkout(company, order.id, session, checkout)
        .await
        .unwrap();
    assert_eq!(
        Store::from_pool(pool.clone())
            .customer_topup_checkout(company, order.id)
            .await
            .unwrap()
            .as_deref(),
        Some(checkout)
    );
    store
        .bind_customer_topup_provider(company, order.id, session)
        .await
        .unwrap();
    assert!(
        store
            .settle_verified_customer_topup(company, order.id, session, 1_000_000_000)
            .await
            .is_err()
    );
    let (a, b) = tokio::join!(
        store.settle_verified_customer_topup(company, order.id, session, order.amount_nanos),
        store.settle_verified_customer_topup(company, order.id, session, order.amount_nanos)
    );
    assert_eq!(a.unwrap(), b.unwrap());
    let reopened = Store::from_pool(pool.clone());
    assert_eq!(
        reopened
            .customer_topup_platform_reference(company, order.id)
            .await
            .unwrap()
            .as_deref(),
        Some(session)
    );
    let entries: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM customer_balance_entries WHERE organization_id=$1 AND kind='funding'",
    )
    .bind(company)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(entries, 1);
    let legacy = store
        .create_customer_topup(company, &create("zhifux"))
        .await
        .unwrap();
    assert!(
        store
            .bind_customer_topup_provider(company, legacy.id, "legacy_with_underscore")
            .await
            .is_err()
    );
    store
        .bind_customer_topup_provider(company, legacy.id, "legacyAlphanumeric")
        .await
        .unwrap();
}
