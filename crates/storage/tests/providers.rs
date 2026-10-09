use niu_storage::{
    MIGRATOR, OperatorAuditActor, OperatorRole, OperatorScope, ProviderOfferInput,
    ProviderOfferQualificationInput, ProviderQualificationInput, Store,
};
use serde_json::json;
use sqlx::PgPool;
use uuid::Uuid;

fn qualification_expiry_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
        + 30 * 24 * 60 * 60 * 1000
}

fn supplier_qualification() -> ProviderQualificationInput {
    ProviderQualificationInput {
        supply_rights_sha256: "a".repeat(64),
        supply_capability_sha256: "b".repeat(64),
        data_handling_sha256: "c".repeat(64),
        valid_until_ms: qualification_expiry_ms(),
    }
}

fn offer_qualification(rate_revision: Uuid) -> ProviderOfferQualificationInput {
    ProviderOfferQualificationInput {
        rate_revision,
        model_identity_sha256: "d".repeat(64),
        protocol_matrix_sha256: "e".repeat(64),
        protocol_matrix_version: "chat-v1".into(),
        data_handling_sha256: "f".repeat(64),
        availability_sha256: "1".repeat(64),
        agreed_rates_sha256: "2".repeat(64),
        valid_until_ms: qualification_expiry_ms(),
    }
}

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
    assert!(!store.supplier_model_available("test-model").await.unwrap());
    assert_eq!(
        store.vendor_models_with_availability(vendor).await.unwrap()[0]["available"],
        false
    );
    assert!(
        store
            .supplier_model_available("legacy-route-without-offer")
            .await
            .unwrap()
    );
    assert!(store.publish_provider_offer(other, &rate).await.is_err());
    assert_eq!(
        store.provider_businesses().await.unwrap()[0]["qualification_status"],
        "unqualified"
    );
    let offer: Uuid = sqlx::query_scalar(
        "SELECT id FROM provider_offers WHERE provider_id=$1 AND model_alias='test-model'",
    )
    .bind(supplier)
    .fetch_one(&pool)
    .await
    .unwrap();
    let op = store.create_operation(scope, "test-model").await.unwrap();
    let attempt = store
        .prepare_attempt(scope, op, "test-model", "route-v1")
        .await
        .unwrap();
    assert!(
        store
            .bind_provider_offer(
                scope,
                attempt,
                "test-model",
                "qwen/test",
                Some("https://example.com/v1"),
            )
            .await
            .is_err()
    );
    store
        .qualify_provider_business(supplier, &supplier_qualification())
        .await
        .unwrap();
    store
        .qualify_provider_offer(supplier, offer, &offer_qualification(revision))
        .await
        .unwrap();
    store
        .set_provider_offer_active(supplier, offer, operator.operator_id, true)
        .await
        .unwrap();
    assert!(store.supplier_model_available("test-model").await.unwrap());
    assert_eq!(
        store.vendor_models_with_availability(vendor).await.unwrap()[0]["available"],
        true
    );
    assert!(
        !store
            .unavailable_supplier_models()
            .await
            .unwrap()
            .contains(&"test-model".to_owned())
    );
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
    let updated_revision = store.publish_provider_offer(supplier, &rate).await.unwrap();
    let updated = store.provider_dashboard(supplier, 30).await.unwrap();
    assert_eq!(
        updated["offers"][0]["revision"],
        updated_revision.to_string()
    );
    assert_eq!(updated["offers"][0]["prompt_rate"], "9000000000");
    assert_eq!(updated["offers"][0]["active"], false);
    assert_eq!(updated["offers"][0]["qualified"], false);
    assert!(
        store
            .unavailable_supplier_models()
            .await
            .unwrap()
            .contains(&"test-model".to_owned())
    );
    assert!(!store.supplier_model_available("test-model").await.unwrap());
    // Reusing the former revision cannot replace a newer agreed rate.
    assert!(store.publish_provider_offer(supplier, &rate).await.is_err());
    let preserved = store.provider_dashboard(supplier, 30).await.unwrap();
    assert_eq!(preserved["offers"], updated["offers"]);
    rate.expected_revision = Some(updated_revision);
    let competing = ProviderOfferInput {
        model_alias: rate.model_alias.clone(),
        currency: rate.currency.clone(),
        prompt_rate: "7000000000".into(),
        completion_rate: rate.completion_rate.clone(),
        expected_revision: Some(updated_revision),
    };
    let (first_edit, second_edit) = tokio::join!(
        store.publish_provider_offer(supplier, &rate),
        store.publish_provider_offer(supplier, &competing)
    );
    assert_ne!(first_edit.is_ok(), second_edit.is_ok());
    let winning_revision = first_edit.or(second_edit).unwrap();
    let concurrent = store.provider_dashboard(supplier, 30).await.unwrap();
    assert_eq!(
        concurrent["offers"][0]["revision"],
        winning_revision.to_string()
    );
    assert_eq!(concurrent["offers"][0]["active"], false);
    assert_eq!(concurrent["offers"][0]["qualified"], false);
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

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn expired_supplier_evidence_blocks_a_bound_attempt_before_dispatch(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let supplier = store
        .create_provider_business("Expiring supplier")
        .await
        .unwrap();
    let operator = store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(scope.project_id),
            },
            "supplier manager",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    store
        .set_provider_member(supplier, operator.operator_id, "manager", true)
        .await
        .unwrap();

    let vendor = Uuid::new_v4();
    sqlx::query("INSERT INTO vendors(id,name,adapter,api_base,credential_ciphertext) VALUES($1,'expiring upstream','openai','https://example.com/v1',$2)")
        .bind(vendor)
        .bind(vec![1u8; 48])
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO vendor_models(alias,vendor_id,upstream_model,capabilities) VALUES('expiring-model',$1,'maker/model',$2)")
        .bind(vendor)
        .bind(json!({}))
        .execute(&pool)
        .await
        .unwrap();
    let revision = store
        .publish_provider_offer(
            supplier,
            &ProviderOfferInput {
                model_alias: "expiring-model".into(),
                currency: "USD".into(),
                prompt_rate: "1000000000".into(),
                completion_rate: "2000000000".into(),
                expected_revision: None,
            },
        )
        .await
        .unwrap();
    let offer: Uuid = sqlx::query_scalar(
        "SELECT id FROM provider_offers WHERE provider_id=$1 AND model_alias='expiring-model'",
    )
    .bind(supplier)
    .fetch_one(&pool)
    .await
    .unwrap();
    let valid_until_ms = qualification_expiry_ms() - 30 * 24 * 60 * 60 * 1000 + 1200;
    let mut business_review = supplier_qualification();
    business_review.valid_until_ms = valid_until_ms;
    store
        .qualify_provider_business(supplier, &business_review)
        .await
        .unwrap();
    let mut offer_review = offer_qualification(revision);
    offer_review.valid_until_ms = valid_until_ms;
    store
        .qualify_provider_offer(supplier, offer, &offer_review)
        .await
        .unwrap();
    store
        .set_provider_offer_active(supplier, offer, operator.operator_id, true)
        .await
        .unwrap();

    let operation = store
        .create_operation(scope, "expiring-model")
        .await
        .unwrap();
    let attempt = store
        .prepare_attempt(scope, operation, "expiring-model", "route-v1")
        .await
        .unwrap();
    store
        .bind_provider_offer(
            scope,
            attempt,
            "expiring-model",
            "maker/model",
            Some("https://example.com/v1"),
        )
        .await
        .unwrap();
    tokio::time::sleep(std::time::Duration::from_millis(1300)).await;
    let error = sqlx::query(
        "UPDATE attempts SET execution='may_have_executed',dispatched_at=now() WHERE id=$1",
    )
    .bind(attempt)
    .execute(&pool)
    .await
    .unwrap_err();
    assert_eq!(
        error
            .as_database_error()
            .and_then(|database_error| database_error.code())
            .as_deref(),
        Some("P0007")
    );
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
#[ignore = "requires PostgreSQL"]
async fn material_supplier_route_changes_require_new_qualification(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let supplier = store
        .create_provider_business("Route review fixture")
        .await
        .unwrap();
    let vendor = Uuid::new_v4();
    sqlx::query("INSERT INTO vendors(id,name,adapter,api_base,credential_ciphertext) VALUES($1,'review route','openai','https://example.com/v1',$2)")
        .bind(vendor).bind(vec![1u8;48]).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO vendor_models(alias,vendor_id,upstream_model,capabilities) VALUES('review-model',$1,'model-original','{}')")
        .bind(vendor).execute(&pool).await.unwrap();
    let revision = store
        .publish_provider_offer(
            supplier,
            &ProviderOfferInput {
                model_alias: "review-model".into(),
                currency: "USD".into(),
                prompt_rate: "1".into(),
                completion_rate: "2".into(),
                expected_revision: None,
            },
        )
        .await
        .unwrap();
    let offer: Uuid = sqlx::query_scalar("SELECT id FROM provider_offers WHERE provider_id=$1")
        .bind(supplier)
        .fetch_one(&pool)
        .await
        .unwrap();
    store
        .qualify_provider_business(supplier, &supplier_qualification())
        .await
        .unwrap();
    sqlx::query("INSERT INTO vendors(id,name,adapter,api_base,credential_ciphertext) VALUES($1,'replacement review route','openai','https://replacement.example/v1',$2)")
        .bind(Uuid::new_v4()).bind(vec![1u8;48]).execute(&pool).await.unwrap();
    for mutation in [
        "UPDATE vendors SET api_base='https://other.example/v1' WHERE id=$1",
        "UPDATE vendors SET credential_ciphertext=decode(repeat('02',48),'hex') WHERE id=$1",
        "UPDATE vendors SET adapter='openrouter' WHERE id=$1",
        "UPDATE vendor_models SET upstream_model='model-other' WHERE vendor_id=$1",
        "UPDATE vendor_models SET capabilities='{\"tools\":true}' WHERE vendor_id=$1",
        "UPDATE vendor_models SET vendor_id=(SELECT id FROM vendors WHERE name='replacement review route') WHERE vendor_id=$1",
    ] {
        store
            .qualify_provider_offer(supplier, offer, &offer_qualification(revision))
            .await
            .unwrap();
        sqlx::query("UPDATE provider_offers SET active=TRUE WHERE id=$1")
            .bind(offer)
            .execute(&pool)
            .await
            .unwrap();
        let scope = store.default_workspace().await.unwrap();
        let operation = store.create_operation(scope, "review-model").await.unwrap();
        let pending = store
            .prepare_attempt(scope, operation, "review-model", "review-route")
            .await
            .unwrap();
        let upstream: String = sqlx::query_scalar(
            "SELECT upstream_model FROM vendor_models WHERE alias='review-model'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        let endpoint: String = sqlx::query_scalar("SELECT api_base FROM vendors WHERE id=$1")
            .bind(vendor)
            .fetch_one(&pool)
            .await
            .unwrap();
        store
            .bind_provider_offer(scope, pending, "review-model", &upstream, Some(&endpoint))
            .await
            .unwrap();
        for disabled in [
            "UPDATE vendors SET enabled=FALSE WHERE id=$1",
            "UPDATE vendor_models SET enabled=FALSE WHERE vendor_id=$1",
        ] {
            let mut switch = pool.begin().await.unwrap();
            sqlx::query(disabled)
                .bind(vendor)
                .execute(&mut *switch)
                .await
                .unwrap();
            // Availability changes preserve qualification but still deny dispatch.
            let qualified: bool = sqlx::query_scalar("SELECT niu_offer_qualification_current(provider_id,id,current_revision) FROM provider_offers WHERE id=$1")
                .bind(offer).fetch_one(&mut *switch).await.unwrap();
            assert!(qualified);
            let available: bool =
                sqlx::query_scalar("SELECT niu_supplier_model_route_available('review-model')")
                    .fetch_one(&mut *switch)
                    .await
                    .unwrap();
            assert!(!available);

            let error = sqlx::query(
                "UPDATE attempts SET execution='may_have_executed',dispatched_at=now() WHERE id=$1",
            )
            .bind(pending)
            .execute(&mut *switch)
            .await
            .unwrap_err();
            assert_eq!(
                error.as_database_error().and_then(|e| e.code()).as_deref(),
                Some("P0007")
            );
            switch.rollback().await.unwrap();
            assert_eq!(
                store
                    .attempt(scope, pending)
                    .await
                    .unwrap()
                    .unwrap()
                    .execution,
                "not_sent"
            );
        }
        // Display-name edits and unchanged connection values preserve the review.
        sqlx::query("UPDATE vendors SET name='renamed route',api_base=api_base WHERE id=$1")
            .bind(vendor)
            .execute(&pool)
            .await
            .unwrap();
        assert!(
            store
                .supplier_model_available("review-model")
                .await
                .unwrap()
        );
        let mut rollback = pool.begin().await.unwrap();
        sqlx::query(mutation)
            .bind(vendor)
            .execute(&mut *rollback)
            .await
            .unwrap();
        let available: bool = sqlx::query_scalar("SELECT niu_offer_qualification_current(provider_id,id,current_revision) FROM provider_offers WHERE id=$1")
            .bind(offer).fetch_one(&mut *rollback).await.unwrap();
        assert!(!available);
        rollback.rollback().await.unwrap();
        assert!(
            store
                .supplier_model_available("review-model")
                .await
                .unwrap()
        );
        sqlx::query(mutation)
            .bind(vendor)
            .execute(&pool)
            .await
            .unwrap();
        assert!(
            !store
                .supplier_model_available("review-model")
                .await
                .unwrap()
        );
        let state: (bool, Option<Uuid>) = sqlx::query_as(
            "SELECT active,current_qualification_review FROM provider_offers WHERE id=$1",
        )
        .bind(offer)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(state, (false, None));
        assert!(
            sqlx::query("UPDATE provider_offers SET active=TRUE WHERE id=$1")
                .bind(offer)
                .execute(&pool)
                .await
                .is_err()
        );
        // Requalifying the changed route must not revive an already prepared request.
        store
            .qualify_provider_offer(supplier, offer, &offer_qualification(revision))
            .await
            .unwrap();
        sqlx::query("UPDATE provider_offers SET active=TRUE WHERE id=$1")
            .bind(offer)
            .execute(&pool)
            .await
            .unwrap();
        let error = sqlx::query(
            "UPDATE attempts SET execution='may_have_executed',dispatched_at=now() WHERE id=$1",
        )
        .bind(pending)
        .execute(&pool)
        .await
        .unwrap_err();
        assert_eq!(
            error.as_database_error().and_then(|e| e.code()).as_deref(),
            Some("P0007")
        );
        assert_eq!(
            store
                .attempt(scope, pending)
                .await
                .unwrap()
                .unwrap()
                .execution,
            "not_sent"
        );
    }
    let retained: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM provider_offer_qualification_reviews WHERE offer_id=$1",
    )
    .bind(offer)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(retained, 12);
    let audited: i64 = sqlx::query_scalar("SELECT count(*) FROM provider_audit_events WHERE provider_id=$1 AND action IN ('route_qualification_invalidated','model_qualification_invalidated')")
        .bind(supplier).fetch_one(&pool).await.unwrap();
    assert_eq!(audited, 6);
}
