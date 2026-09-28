use niu_storage::{
    MIGRATOR, OperatorAuditActor, OperatorRole, OperatorScope, ProviderOfferInput, Store,
};
use serde_json::json;
use sqlx::PgPool;
use uuid::Uuid;

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn provider_earnings_pin_rates_reconcile_and_settle_exactly_once(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let operator = store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(scope.project_id),
            },
            "supplier member",
            OperatorRole::Viewer,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let supplier = store
        .create_provider_business("Test supplier")
        .await
        .unwrap();
    let other = store
        .create_provider_business("Other supplier")
        .await
        .unwrap();
    assert!(
        store
            .provider_memberships(operator.operator_id)
            .await
            .unwrap()
            .is_empty()
    );
    store
        .set_provider_member(supplier, operator.operator_id, "manager", true)
        .await
        .unwrap();
    assert!(
        store
            .provider_member(supplier, operator.operator_id, true)
            .await
            .unwrap()
    );
    assert!(
        !store
            .provider_member(other, operator.operator_id, false)
            .await
            .unwrap()
    );
    let vendor = Uuid::new_v4();
    sqlx::query("INSERT INTO vendors(id,name,adapter,api_base,credential_ciphertext) VALUES($1,'test upstream','openai','https://example.com/v1',$2)").bind(vendor).bind(vec![1u8;48]).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO vendor_models(alias,vendor_id,upstream_model,capabilities) VALUES('test-model',$1,'qwen/test',$2)").bind(vendor).bind(json!({})).execute(&pool).await.unwrap();
    let mut rate = ProviderOfferInput {
        model_alias: "test-model".into(),
        currency: "USD".into(),
        prompt_rate: "1000000000".into(),
        completion_rate: "2000000000".into(),
        expected_revision: None,
    };
    let revision = store.publish_provider_offer(supplier, &rate).await.unwrap();
    assert!(store.publish_provider_offer(other, &rate).await.is_err());
    let op = store.create_operation(scope, "test-model").await.unwrap();
    let attempt = store
        .prepare_attempt(scope, op, "test-model", "route-v1")
        .await
        .unwrap();
    store
        .bind_provider_offer(
            scope,
            attempt,
            "test-model",
            "qwen/test",
            Some("https://example.com/v1"),
        )
        .await
        .unwrap();
    let retail = ProviderOfferInput {
        prompt_rate: "4000000000".into(),
        completion_rate: "8000000000".into(),
        model_alias: rate.model_alias.clone(),
        currency: rate.currency.clone(),
        expected_revision: None,
    };
    store.publish_customer_tariff(scope, &retail).await.unwrap();
    store
        .bind_customer_tariff(scope, attempt, "test-model")
        .await
        .unwrap();
    sqlx::query(
        "UPDATE attempts SET execution='may_have_executed',dispatched_at=now() WHERE id=$1",
    )
    .bind(attempt)
    .execute(&pool)
    .await
    .unwrap();
    store.accrue_provider_earning(attempt).await.unwrap();
    let unresolved = store.provider_dashboard(supplier, 30).await.unwrap();
    assert_eq!(unresolved["traffic"]["unresolved"], "1");
    assert!(unresolved["balances"].as_array().unwrap().is_empty());
    rate.expected_revision = Some(revision);
    rate.prompt_rate = "9000000000".into();
    store.publish_provider_offer(supplier, &rate).await.unwrap();
    store
        .complete_and_settle(scope, attempt, Some((1_000_000, 500_000)))
        .await
        .unwrap();
    let (a, b) = tokio::join!(
        store.accrue_provider_earning(attempt),
        store.accrue_provider_earning(attempt)
    );
    a.unwrap();
    b.unwrap();
    assert_eq!(
        store.customer_billing(scope).await.unwrap()["balances"][0]["charged_nanos"],
        "8000000000"
    );
    let report = store.provider_dashboard(supplier, 30).await.unwrap();
    assert_eq!(report["balances"][0]["earned_nanos"], "2000000000");
    assert_eq!(report["balances"][0]["unpaid_nanos"], "2000000000");
    assert_eq!(report["earnings"].as_array().unwrap().len(), 1);
    assert_eq!(report["daily"].as_array().unwrap().len(), 1);
    assert!(report.to_string().find("credential").is_none());
    assert!(
        store
            .record_provider_settlement(other, Uuid::new_v4(), "payment", &[attempt])
            .await
            .is_err()
    );
    let key = Uuid::new_v4();
    let payment_attempts = [attempt];
    let (first, second) = tokio::join!(
        store.record_provider_settlement(supplier, key, "external-payment-1", &payment_attempts),
        store.record_provider_settlement(supplier, key, "external-payment-1", &payment_attempts)
    );
    assert_eq!(first.unwrap(), second.unwrap());
    assert!(
        store
            .record_provider_settlement(supplier, key, "changed-reference", &[attempt])
            .await
            .is_err()
    );
    assert!(
        store
            .record_provider_settlement(supplier, Uuid::new_v4(), "another-payment", &[attempt])
            .await
            .is_err()
    );
    let report = store.provider_dashboard(supplier, 30).await.unwrap();
    assert_eq!(report["balances"][0]["unpaid_nanos"], "0");
    assert_eq!(report["balances"][0]["paid_nanos"], "2000000000");
    assert_eq!(report["earnings"][0]["status"], "paid");
    let offer = Uuid::parse_str(report["offers"][0]["id"].as_str().unwrap()).unwrap();
    store
        .set_provider_offer_active(supplier, offer, operator.operator_id, false)
        .await
        .unwrap();
    let attempt2 = store
        .prepare_attempt(scope, op, "test-model", "route-v1")
        .await
        .unwrap();
    assert!(
        store
            .bind_provider_offer(
                scope,
                attempt2,
                "test-model",
                "qwen/test",
                Some("https://example.com/v1")
            )
            .await
            .is_err()
    );
    store
        .set_provider_member(supplier, operator.operator_id, "manager", false)
        .await
        .unwrap();
    assert!(
        store
            .provider_memberships(operator.operator_id)
            .await
            .unwrap()
            .is_empty()
    );
    assert!(
        store
            .set_provider_offer_active(supplier, offer, operator.operator_id, true)
            .await
            .is_err()
    );
    assert!(
        sqlx::query("UPDATE provider_earnings SET amount_nanos=0")
            .execute(&pool)
            .await
            .is_err()
    );
}
