use niu_metered_cost::*;
use niu_storage::{MIGRATOR, Store, TenantScope};
use sqlx::PgPool;

fn pricing(scope: TenantScope, amount: u64) -> PricingSnapshot {
    let dimensions = Dimensions {
        model: "fixture-video".into(),
        channel: "fixture".into(),
        resolution: "720p".into(),
        reference_video: false,
    };
    let card = Tariff {
        revision: format!("customer-{amount}"),
        dimensions: dimensions.clone(),
        meter: "video_tokens".into(),
        currency: "CNY".into(),
        decimal_places: 9,
        amount_units: amount,
        per_quantity: Quantity::integer(1_000_000),
        minimum_quantity: Quantity::integer(0),
        rounding: Rounding::Up,
        effective_from: 10,
        effective_until: Some(100),
    };
    pin_pricing(
        &[card],
        &[],
        &PricingContext {
            dimensions: &dimensions,
            offer: "fixture-offer",
            customer: &scope.organization_id.to_string(),
            at: 20,
        },
    )
    .unwrap()
}

async fn attempt(store: &Store, scope: TenantScope) -> uuid::Uuid {
    let operation = store
        .create_operation(scope, "fixture-video")
        .await
        .unwrap();
    store
        .prepare_attempt(scope, operation, "fixture-video", "fixture-offer")
        .await
        .unwrap()
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn pricing_is_scoped_immutable_idempotent_and_survives_a_new_store(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let other = store
        .create_project(scope.organization_id, "Other media workspace")
        .await
        .unwrap();
    let id = attempt(&store, scope).await;
    let snapshot = pricing(scope, 100);
    store
        .bind_customer_media_pricing(scope, id, &snapshot)
        .await
        .unwrap();
    store
        .bind_customer_media_pricing(scope, id, &snapshot)
        .await
        .unwrap();
    assert!(
        store
            .bind_customer_media_pricing(scope, id, &pricing(scope, 200))
            .await
            .is_err()
    );
    assert!(
        store
            .bind_customer_media_pricing(other, id, &snapshot)
            .await
            .is_err()
    );
    assert!(
        store
            .customer_media_pricing(other, id)
            .await
            .unwrap()
            .is_none()
    );
    let organization = store
        .create_organization("Other media company")
        .await
        .unwrap();
    let foreign = store
        .create_project(organization, "Foreign media workspace")
        .await
        .unwrap();
    assert!(
        store
            .bind_customer_media_pricing(scope, id, &pricing(foreign, 100))
            .await
            .is_err()
    );
    let fresh = Store::from_pool(pool.clone());
    let saved = fresh
        .customer_media_pricing(scope, id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(saved, snapshot);
    let usage = Usage::Known {
        meter: "video_tokens".into(),
        quantity: Quantity::integer(108000),
        provenance: Provenance::Reported,
    };
    assert_eq!(saved.calculate(&usage).unwrap().amount_units, 11);
    assert!(
        sqlx::query(
            "UPDATE customer_media_attempt_pricing SET snapshot=snapshot WHERE attempt_id=$1"
        )
        .bind(id)
        .execute(&pool)
        .await
        .is_err()
    );
    assert!(
        sqlx::query("DELETE FROM customer_media_attempt_pricing WHERE attempt_id=$1")
            .bind(id)
            .execute(&pool)
            .await
            .is_err()
    );
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM customer_media_attempt_pricing")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 1);
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn pricing_cannot_be_added_after_egress_or_mix_text_and_media(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let id = attempt(&store, scope).await;
    // Simulate durable egress intent, without sending a paid request.
    sqlx::query(
        "UPDATE attempts SET execution='may_have_executed',dispatched_at=now() WHERE id=$1",
    )
    .bind(id)
    .execute(&pool)
    .await
    .unwrap();
    assert!(
        store
            .bind_customer_media_pricing(scope, id, &pricing(scope, 100))
            .await
            .is_err()
    );
    let input = niu_storage::ProviderOfferInput {
        model_alias: "fixture-video".into(),
        currency: "CNY".into(),
        prompt_rate: "100".into(),
        completion_rate: "100".into(),
        expected_revision: None,
    };
    let revision = store.publish_customer_tariff(scope, &input).await.unwrap();
    let text = attempt(&store, scope).await;
    store
        .bind_customer_tariff(scope, text, "fixture-video")
        .await
        .unwrap();
    assert!(
        store
            .bind_customer_media_pricing(scope, text, &pricing(scope, 100))
            .await
            .is_err()
    );
    let media = attempt(&store, scope).await;
    store
        .bind_customer_media_pricing(scope, media, &pricing(scope, 100))
        .await
        .unwrap();
    assert!(
        sqlx::query("INSERT INTO customer_attempt_tariffs(attempt_id,revision_id) VALUES($1,$2)")
            .bind(media)
            .bind(revision)
            .execute(&pool)
            .await
            .is_err()
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn concurrent_price_bindings_have_one_authoritative_winner(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let first = pricing(scope, 100);
    let second = pricing(scope, 200);
    let id = attempt(&store, scope).await;
    let (left, right) = tokio::join!(
        store.bind_customer_media_pricing(scope, id, &first),
        store.bind_customer_media_pricing(scope, id, &second)
    );
    assert_ne!(left.is_ok(), right.is_ok());
    let saved = store
        .customer_media_pricing(scope, id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(saved, if left.is_ok() { first.clone() } else { second });
    let duplicate = attempt(&store, scope).await;
    let (left, right) = tokio::join!(
        store.bind_customer_media_pricing(scope, duplicate, &first),
        store.bind_customer_media_pricing(scope, duplicate, &first)
    );
    assert!(left.is_ok() && right.is_ok());

    store
        .publish_customer_tariff(
            scope,
            &niu_storage::ProviderOfferInput {
                model_alias: "fixture-video".into(),
                currency: "CNY".into(),
                prompt_rate: "100".into(),
                completion_rate: "100".into(),
                expected_revision: None,
            },
        )
        .await
        .unwrap();
    for _ in 0..8 {
        let id = attempt(&store, scope).await;
        let (text, media) = tokio::join!(
            store.bind_customer_tariff(scope, id, "fixture-video"),
            store.bind_customer_media_pricing(scope, id, &first)
        );
        assert_ne!(text.is_ok(), media.is_ok());
        let count: i64 = sqlx::query_scalar("SELECT (SELECT count(*) FROM customer_attempt_tariffs WHERE attempt_id=$1)+(SELECT count(*) FROM customer_media_attempt_pricing WHERE attempt_id=$1)")
            .bind(id).fetch_one(&pool).await.unwrap();
        assert_eq!(count, 1);
    }
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn model_offer_and_company_identity_are_bound_to_the_attempt(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    for (model, offer) in [
        ("other-model", "fixture-offer"),
        ("fixture-video", "other-offer"),
    ] {
        let operation = store.create_operation(scope, model).await.unwrap();
        let id = store
            .prepare_attempt(scope, operation, model, offer)
            .await
            .unwrap();
        assert!(
            store
                .bind_customer_media_pricing(scope, id, &pricing(scope, 100))
                .await
                .is_err()
        );
        assert!(
            store
                .customer_media_pricing(scope, id)
                .await
                .unwrap()
                .is_none()
        );
    }
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM customer_media_attempt_pricing")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 0);
}

fn reported(quantity: u128) -> Usage {
    Usage::Known {
        meter: "video_tokens".into(),
        quantity: Quantity::integer(quantity),
        provenance: Provenance::Reported,
    }
}

async fn sent_media(store: &Store, pool: &PgPool, scope: TenantScope) -> uuid::Uuid {
    let id = attempt(store, scope).await;
    store
        .bind_customer_media_pricing(scope, id, &pricing(scope, 100))
        .await
        .unwrap();
    sqlx::query(
        "UPDATE attempts SET execution='may_have_executed',dispatched_at=now() WHERE id=$1",
    )
    .bind(id)
    .execute(pool)
    .await
    .unwrap();
    id
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn reported_media_usage_is_durable_scoped_and_preserves_conflicts(pool: PgPool) {
    use niu_storage::{MediaUsageSource as Source, MediaUsageState as State};
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let id = attempt(&store, scope).await;
    store
        .bind_customer_media_pricing(scope, id, &pricing(scope, 100))
        .await
        .unwrap();
    assert_eq!(
        store.customer_media_usage_state(scope, id).await.unwrap(),
        State::Unknown
    );
    assert!(
        store
            .record_customer_media_usage(scope, id, Source::Query, &reported(108000))
            .await
            .is_err()
    );
    sqlx::query(
        "UPDATE attempts SET execution='may_have_executed',dispatched_at=now() WHERE id=$1",
    )
    .bind(id)
    .execute(&pool)
    .await
    .unwrap();
    let estimate = Usage::Known {
        meter: "video_tokens".into(),
        quantity: Quantity::integer(108000),
        provenance: Provenance::Estimate,
    };
    assert!(
        store
            .record_customer_media_usage(scope, id, Source::Query, &estimate)
            .await
            .is_err()
    );
    assert!(
        store
            .record_customer_media_usage(scope, id, Source::Query, &Usage::Unresolved)
            .await
            .is_err()
    );
    let wrong = Usage::Known {
        meter: "seconds".into(),
        quantity: Quantity::integer(5),
        provenance: Provenance::Reported,
    };
    assert!(
        store
            .record_customer_media_usage(scope, id, Source::Query, &wrong)
            .await
            .is_err()
    );
    for source in [Source::Query, Source::Query, Source::Callback] {
        store
            .record_customer_media_usage(scope, id, source, &reported(108000))
            .await
            .unwrap();
    }
    let fresh = Store::from_pool(pool.clone());
    let State::Agreed(receipt) = fresh.customer_media_usage_state(scope, id).await.unwrap() else {
        panic!("missing agreed usage");
    };
    assert_eq!(receipt.amount_units, 11);
    assert_eq!(receipt.provenance, Provenance::Reported);
    let other = store
        .create_project(scope.organization_id, "Other media usage workspace")
        .await
        .unwrap();
    assert_eq!(
        store.customer_media_usage_state(other, id).await.unwrap(),
        State::Unknown
    );
    assert!(
        store
            .record_customer_media_usage(other, id, Source::Query, &reported(108000))
            .await
            .is_err()
    );
    store
        .record_customer_media_usage(scope, id, Source::Callback, &reported(108001))
        .await
        .unwrap();
    assert_eq!(
        fresh.customer_media_usage_state(scope, id).await.unwrap(),
        State::Conflicting
    );
    // A late repeat cannot overwrite the discrepancy with the original value.
    store
        .record_customer_media_usage(scope, id, Source::Query, &reported(108000))
        .await
        .unwrap();
    assert_eq!(
        fresh.customer_media_usage_state(scope, id).await.unwrap(),
        State::Conflicting
    );
    let count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM customer_media_usage_observations WHERE attempt_id=$1",
    )
    .bind(id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(count, 3);
    assert!(
        sqlx::query("UPDATE customer_media_usage_observations SET meter=meter WHERE attempt_id=$1")
            .bind(id)
            .execute(&pool)
            .await
            .is_err()
    );
    assert!(
        sqlx::query("DELETE FROM customer_media_usage_observations WHERE attempt_id=$1")
            .bind(id)
            .execute(&pool)
            .await
            .is_err()
    );
    let charges: i64 =
        sqlx::query_scalar("SELECT count(*) FROM customer_charges WHERE attempt_id=$1")
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(charges, 0);
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn usage_retries_are_bounded_and_overflow_evidence_is_not_discarded(pool: PgPool) {
    use niu_storage::{MediaUsageSource as Source, MediaUsageState as State};
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let id = sent_media(&store, &pool, scope).await;
    let usage = reported(0);
    let (left, right) = tokio::join!(
        store.record_customer_media_usage(scope, id, Source::Query, &usage),
        store.record_customer_media_usage(scope, id, Source::Query, &usage)
    );
    assert!(left.is_ok() && right.is_ok());
    for quantity in 1..16 {
        store
            .record_customer_media_usage(scope, id, Source::Query, &reported(quantity))
            .await
            .unwrap();
    }
    assert!(
        store
            .record_customer_media_usage(scope, id, Source::Query, &reported(16))
            .await
            .is_err()
    );
    store
        .record_customer_media_usage(scope, id, Source::Query, &usage)
        .await
        .unwrap();
    let count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM customer_media_usage_observations WHERE attempt_id=$1",
    )
    .bind(id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(count, 16);
    assert_eq!(
        store.customer_media_usage_state(scope, id).await.unwrap(),
        State::Conflicting
    );
    let overflow = sent_media(&store, &pool, scope).await;
    store
        .record_customer_media_usage(scope, overflow, Source::Query, &reported(u128::MAX))
        .await
        .unwrap();
    assert_eq!(
        store
            .customer_media_usage_state(scope, overflow)
            .await
            .unwrap(),
        State::Unpriceable
    );
    let count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM customer_media_usage_observations WHERE attempt_id=$1",
    )
    .bind(overflow)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(count, 1);
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn media_reservation_is_pinned_atomic_and_retains_uncertain_liability(pool: PgPool) {
    use niu_storage::MediaLiabilityBound;
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    store
        .record_settled_customer_funding(
            scope.organization_id,
            "CNY",
            100,
            "fixture",
            "media-funding",
        )
        .await
        .unwrap();
    let id = attempt(&store, scope).await;
    store
        .bind_customer_media_pricing(scope, id, &pricing(scope, 100))
        .await
        .unwrap();
    let bound = MediaLiabilityBound {
        meter: "video_tokens".into(),
        maximum_quantity: Quantity::integer(1_000_000),
        qualification_revision: "fixture-bound-v1".into(),
    };
    assert_eq!(
        store
            .reserve_customer_media_balance(scope, id, &bound)
            .await
            .unwrap(),
        100
    );
    assert_eq!(
        store
            .reserve_customer_media_balance(scope, id, &bound)
            .await
            .unwrap(),
        100
    );
    let changed = MediaLiabilityBound {
        qualification_revision: "fixture-bound-v2".into(),
        ..bound
    };
    assert!(
        store
            .reserve_customer_media_balance(scope, id, &changed)
            .await
            .is_err()
    );
    let denied = attempt(&store, scope).await;
    store
        .bind_customer_media_pricing(scope, denied, &pricing(scope, 100))
        .await
        .unwrap();
    assert!(
        store
            .reserve_customer_media_balance(scope, denied, &changed)
            .await
            .is_err()
    );
    let count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM customer_attempt_balance_accounts WHERE attempt_id=$1",
    )
    .bind(denied)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(count, 0);
    assert!(
        sqlx::query(
            "UPDATE attempts SET execution='may_have_executed',dispatched_at=now() WHERE id=$1"
        )
        .bind(denied)
        .execute(&pool)
        .await
        .is_err()
    );
    sqlx::query(
        "UPDATE attempts SET execution='may_have_executed',dispatched_at=now() WHERE id=$1",
    )
    .bind(id)
    .execute(&pool)
    .await
    .unwrap();
    assert!(
        store
            .release_nonexecuted_customer_balance(scope, id)
            .await
            .is_err()
    );
    let fresh = Store::from_pool(pool.clone());
    let summary = fresh
        .customer_balance_summary(scope.organization_id)
        .await
        .unwrap();
    assert_eq!(summary[0]["reserved_nanos"], "100");
    assert_eq!(summary[0]["available_nanos"], "0");
    assert!(
        sqlx::query(
            "UPDATE customer_media_liability_bounds SET maximum_nanos=1 WHERE attempt_id=$1"
        )
        .bind(id)
        .execute(&pool)
        .await
        .is_err()
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn concurrent_media_reservations_share_company_capacity(pool: PgPool) {
    use niu_storage::MediaLiabilityBound;
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    store
        .record_settled_customer_funding(
            scope.organization_id,
            "CNY",
            100,
            "fixture",
            "media-concurrency",
        )
        .await
        .unwrap();
    let bound = MediaLiabilityBound {
        meter: "video_tokens".into(),
        maximum_quantity: Quantity::integer(100_000),
        qualification_revision: "fixture-bound".into(),
    };
    let mut attempts = Vec::new();
    for _ in 0..16 {
        let id = attempt(&store, scope).await;
        store
            .bind_customer_media_pricing(scope, id, &pricing(scope, 100))
            .await
            .unwrap();
        attempts.push(id);
    }
    let mut jobs = Vec::new();
    for id in attempts {
        let store = store.clone();
        let bound = MediaLiabilityBound {
            meter: bound.meter.clone(),
            maximum_quantity: bound.maximum_quantity,
            qualification_revision: bound.qualification_revision.clone(),
        };
        jobs.push(tokio::spawn(async move {
            store
                .reserve_customer_media_balance(scope, id, &bound)
                .await
        }));
    }
    let mut admitted = 0;
    for job in jobs {
        if job.await.unwrap().is_ok() {
            admitted += 1;
        }
    }
    assert_eq!(admitted, 10);
    let summary = store
        .customer_balance_summary(scope.organization_id)
        .await
        .unwrap();
    assert_eq!(summary[0]["reserved_nanos"], "100");
    assert_eq!(summary[0]["available_nanos"], "0");
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn personal_routes_and_customer_media_pricing_cannot_mix(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let vendor = store
        .create_vendor(niu_storage::VendorInput {
            id: uuid::Uuid::new_v4(),
            name: "Personal accounting fixture".into(),
            adapter: "openrouter".into(),
            api_base: "https://provider.example.test/v1".into(),
            enabled: true,
            credential_ciphertext: vec![0x11; 48],
        })
        .await
        .unwrap();
    store
        .assign_personal_vendor_owner(vendor.id, scope.organization_id, vendor.revision)
        .await
        .unwrap();
    store
        .upsert_vendor_model(
            vendor.id,
            niu_storage::VendorModelInput {
                alias: "fixture-video".into(),
                upstream_model: "fixture-upstream".into(),
                public_catalog: false,
                enabled: true,
                capabilities: serde_json::json!({"chat":true}),
                pricing: None,
                expected_revision: None,
            },
        )
        .await
        .unwrap();
    let route = store
        .personal_vendor_route(scope.organization_id, "fixture-video")
        .await
        .unwrap()
        .unwrap();
    let personal = attempt(&store, scope).await;
    store
        .bind_personal_attempt_route(scope, personal, &route)
        .await
        .unwrap();
    assert!(
        store
            .bind_customer_media_pricing(scope, personal, &pricing(scope, 100))
            .await
            .is_err()
    );
    let retail = attempt(&store, scope).await;
    store
        .bind_customer_media_pricing(scope, retail, &pricing(scope, 100))
        .await
        .unwrap();
    assert!(
        store
            .bind_personal_attempt_route(scope, retail, &route)
            .await
            .is_err()
    );
    for _ in 0..8 {
        let id = attempt(&store, scope).await;
        let snapshot = pricing(scope, 100);
        let (personal, retail) = tokio::join!(
            store.bind_personal_attempt_route(scope, id, &route),
            store.bind_customer_media_pricing(scope, id, &snapshot)
        );
        assert_ne!(personal.is_ok(), retail.is_ok());
    }
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn media_admission_rejects_unqualified_units_and_inexact_ledger_precision(pool: PgPool) {
    use niu_storage::MediaLiabilityBound;
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    store
        .record_settled_customer_funding(
            scope.organization_id,
            "CNY",
            1_000_000,
            "fixture",
            "media-precision",
        )
        .await
        .unwrap();
    for (precision, amount, meter, revision, expected) in [
        (6, 100, "video_tokens", "fixture", Some(10_000)),
        (10, 100, "video_tokens", "fixture", None),
        (9, 0, "video_tokens", "fixture", None),
        (9, 100, "seconds", "fixture", None),
        (9, 100, "video_tokens", "", None),
    ] {
        let id = attempt(&store, scope).await;
        let mut tariff = pricing(scope, amount).tariff().clone();
        tariff.decimal_places = precision;
        let snapshot = pin_pricing(
            std::slice::from_ref(&tariff),
            &[],
            &PricingContext {
                dimensions: &tariff.dimensions,
                offer: "fixture-offer",
                customer: &scope.organization_id.to_string(),
                at: 20,
            },
        )
        .unwrap();
        store
            .bind_customer_media_pricing(scope, id, &snapshot)
            .await
            .unwrap();
        let bound = MediaLiabilityBound {
            meter: meter.into(),
            maximum_quantity: Quantity::integer(100_000),
            qualification_revision: revision.into(),
        };
        let result = store
            .reserve_customer_media_balance(scope, id, &bound)
            .await;
        if let Some(expected) = expected {
            assert_eq!(result.unwrap(), expected);
        } else {
            assert!(result.is_err());
            let count: i64 = sqlx::query_scalar(
                "SELECT count(*) FROM customer_balance_reservations WHERE attempt_id=$1",
            )
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(count, 0);
        }
    }
}

async fn reserved_sent_media(store: &Store, pool: &PgPool, scope: TenantScope) -> uuid::Uuid {
    let id = attempt(store, scope).await;
    store
        .bind_customer_media_pricing(scope, id, &pricing(scope, 100))
        .await
        .unwrap();
    store
        .reserve_customer_media_balance(
            scope,
            id,
            &niu_storage::MediaLiabilityBound {
                meter: "video_tokens".into(),
                maximum_quantity: Quantity::integer(1_000_000),
                qualification_revision: "fixture-bound".into(),
            },
        )
        .await
        .unwrap();
    sqlx::query(
        "UPDATE attempts SET execution='may_have_executed',dispatched_at=now() WHERE id=$1",
    )
    .bind(id)
    .execute(pool)
    .await
    .unwrap();
    id
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn successful_media_settlement_is_atomic_exact_and_idempotent(pool: PgPool) {
    use niu_storage::MediaUsageSource as Source;
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    store
        .record_settled_customer_funding(
            scope.organization_id,
            "CNY",
            1000,
            "fixture",
            "media-settlement",
        )
        .await
        .unwrap();
    let id = reserved_sent_media(&store, &pool, scope).await;
    store
        .record_customer_media_usage(scope, id, Source::Query, &reported(200_000))
        .await
        .unwrap();
    assert!(store.settle_customer_media_charge(scope, id).await.is_err());
    store.complete(scope, id, None).await.unwrap();
    sqlx::query("CREATE FUNCTION fail_media_debit_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind='charge' THEN RAISE EXCEPTION 'fixture debit failure'; END IF; RETURN NEW; END; $$")
        .execute(&pool).await.unwrap();
    sqlx::query("CREATE TRIGGER fail_media_debit_fixture BEFORE INSERT ON customer_balance_entries FOR EACH ROW EXECUTE FUNCTION fail_media_debit_fixture()")
        .execute(&pool).await.unwrap();
    assert!(store.settle_customer_media_charge(scope, id).await.is_err());
    let charges: i64 =
        sqlx::query_scalar("SELECT count(*) FROM customer_media_charges WHERE attempt_id=$1")
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(charges, 0);
    assert_eq!(
        store
            .customer_balance_summary(scope.organization_id)
            .await
            .unwrap()[0]["reserved_nanos"],
        "100"
    );
    sqlx::query("DROP TRIGGER fail_media_debit_fixture ON customer_balance_entries")
        .execute(&pool)
        .await
        .unwrap();
    let (left, right) = tokio::join!(
        store.settle_customer_media_charge(scope, id),
        store.settle_customer_media_charge(scope, id)
    );
    assert_eq!(left.unwrap(), 20);
    assert_eq!(right.unwrap(), 20);
    let fresh = Store::from_pool(pool.clone());
    assert_eq!(
        fresh.settle_customer_media_charge(scope, id).await.unwrap(),
        20
    );
    let summary = fresh
        .customer_balance_summary(scope.organization_id)
        .await
        .unwrap();
    assert_eq!(summary[0]["balance_nanos"], "980");
    assert_eq!(summary[0]["reserved_nanos"], "0");
    let filter = niu_storage::GatewayActivityFilter::default();
    let activity = fresh.gateway_request(scope, id).await.unwrap().unwrap();
    assert_eq!(activity.customer_charge_status, "charged");
    // Pricing alone is not a video identity: this pure accounting fixture has
    // no pinned video recovery route and must retain generic inference kind.
    assert_eq!(activity.request_kind, "inference");
    assert_eq!(activity.customer_charge_nanos.as_deref(), Some("20"));
    assert_eq!(activity.customer_charge_currency.as_deref(), Some("CNY"));
    let aggregate = fresh
        .gateway_activity_summary(scope, &filter)
        .await
        .unwrap();
    assert_eq!(aggregate.customer_charges[0].amount_nanos, "20");
    assert_eq!(aggregate.unresolved_customer_charge_count, 0);
    assert_eq!(aggregate.unpriced_request_count, 0);
    let export = fresh.gateway_activity_export(scope, &filter).await.unwrap();
    assert_eq!(export[0].customer_charge_nanos.as_deref(), Some("20"));
    let count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM customer_balance_entries WHERE attempt_id=$1")
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(count, 1);
    let other = store
        .create_project(scope.organization_id, "Other media settlement workspace")
        .await
        .unwrap();
    assert!(store.settle_customer_media_charge(other, id).await.is_err());
    assert!(fresh.gateway_request(other, id).await.unwrap().is_none());
    assert!(
        fresh
            .gateway_activity_export(other, &filter)
            .await
            .unwrap()
            .is_empty()
    );
    assert!(
        fresh
            .gateway_activity_summary(other, &filter)
            .await
            .unwrap()
            .customer_charges
            .is_empty()
    );
    assert!(
        sqlx::query("UPDATE customer_media_charges SET amount_nanos=21 WHERE attempt_id=$1")
            .bind(id)
            .execute(&pool)
            .await
            .is_err()
    );
    let error = sqlx::query("INSERT INTO customer_balance_entries(id,organization_id,account_id,currency,kind,amount_nanos,idempotency_key,project_id,attempt_id) SELECT $1,organization_id,account_id,currency,'charge',-21,$2,project_id,attempt_id FROM customer_attempt_balance_accounts WHERE attempt_id=$2")
        .bind(uuid::Uuid::new_v4()).bind(id).execute(&pool).await.unwrap_err();
    assert!(error.to_string().contains("requires one exact charge"));
    store
        .record_customer_media_usage(scope, id, Source::Callback, &reported(300_000))
        .await
        .unwrap();
    assert_eq!(
        store.customer_media_usage_state(scope, id).await.unwrap(),
        niu_storage::MediaUsageState::Conflicting
    );
    assert_eq!(
        store.settle_customer_media_charge(scope, id).await.unwrap(),
        20
    );
    assert_eq!(
        store
            .customer_balance_summary(scope.organization_id)
            .await
            .unwrap()[0]["balance_nanos"],
        "980"
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn conflicting_unknown_and_overflow_usage_keep_media_holds(pool: PgPool) {
    use niu_storage::MediaUsageSource as Source;
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    store
        .record_settled_customer_funding(
            scope.organization_id,
            "CNY",
            1000,
            "fixture",
            "media-unresolved",
        )
        .await
        .unwrap();
    for case in 0..3 {
        let id = reserved_sent_media(&store, &pool, scope).await;
        store.complete(scope, id, None).await.unwrap();
        match case {
            1 => {
                store
                    .record_customer_media_usage(scope, id, Source::Query, &reported(1))
                    .await
                    .unwrap();
                store
                    .record_customer_media_usage(scope, id, Source::Callback, &reported(2))
                    .await
                    .unwrap();
            }
            2 => store
                .record_customer_media_usage(scope, id, Source::Query, &reported(u128::MAX))
                .await
                .unwrap(),
            _ => (),
        }
        assert!(store.settle_customer_media_charge(scope, id).await.is_err());
    }
    let summary = store
        .customer_balance_summary(scope.organization_id)
        .await
        .unwrap();
    assert_eq!(summary[0]["balance_nanos"], "1000");
    assert_eq!(summary[0]["reserved_nanos"], "300");
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM customer_media_charges")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 0);
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn zero_actual_and_bound_breach_remain_distinct_accounting_facts(pool: PgPool) {
    use niu_storage::MediaUsageSource as Source;
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    store
        .record_settled_customer_funding(
            scope.organization_id,
            "CNY",
            100,
            "fixture",
            "media-bound-breach",
        )
        .await
        .unwrap();
    let zero = reserved_sent_media(&store, &pool, scope).await;
    store
        .record_customer_media_usage(scope, zero, Source::Query, &reported(0))
        .await
        .unwrap();
    store.complete(scope, zero, None).await.unwrap();
    assert_eq!(
        store
            .settle_customer_media_charge(scope, zero)
            .await
            .unwrap(),
        0
    );
    let count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM customer_balance_entries WHERE attempt_id=$1")
            .bind(zero)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(count, 0);
    let breach = reserved_sent_media(&store, &pool, scope).await;
    store
        .record_customer_media_usage(scope, breach, Source::Query, &reported(2_000_000))
        .await
        .unwrap();
    store.complete(scope, breach, None).await.unwrap();
    assert!(
        store
            .settle_customer_media_charge(scope, breach)
            .await
            .is_err()
    );
    let exceeded: bool =
        sqlx::query_scalar("SELECT bound_exceeded FROM customer_media_charges WHERE attempt_id=$1")
            .bind(breach)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(exceeded);
    let filter = niu_storage::GatewayActivityFilter::default();
    let activity = store.gateway_request(scope, breach).await.unwrap().unwrap();
    assert_eq!(activity.customer_charge_status, "pending");
    assert!(activity.customer_charge_nanos.is_none());
    let zero_activity = store.gateway_request(scope, zero).await.unwrap().unwrap();
    assert_eq!(zero_activity.customer_charge_status, "charged");
    assert_eq!(zero_activity.customer_charge_nanos.as_deref(), Some("0"));
    let activity_summary = store
        .gateway_activity_summary(scope, &filter)
        .await
        .unwrap();
    assert_eq!(activity_summary.unresolved_customer_charge_count, 1);
    assert_eq!(activity_summary.unpriced_request_count, 0);
    assert_eq!(activity_summary.customer_charges[0].amount_nanos, "0");
    let summary = store
        .customer_balance_summary(scope.organization_id)
        .await
        .unwrap();
    assert_eq!(summary[0]["balance_nanos"], "100");
    assert_eq!(summary[0]["reserved_nanos"], "100");
    assert!(
        sqlx::query(
            "UPDATE customer_balance_reservations SET released_at=now() WHERE attempt_id=$1"
        )
        .bind(breach)
        .execute(&pool)
        .await
        .is_err()
    );
    let revision: i64 = summary[0]["policy_revision"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap();
    store
        .configure_customer_balance_policy(scope.organization_id, "CNY", 100, None, revision)
        .await
        .unwrap();
    assert_eq!(
        store
            .settle_customer_media_charge(scope, breach)
            .await
            .unwrap(),
        200
    );
    let summary = store
        .customer_balance_summary(scope.organization_id)
        .await
        .unwrap();
    assert_eq!(summary[0]["balance_nanos"], "-100");
    assert_eq!(summary[0]["reserved_nanos"], "0");
    assert_eq!(summary[0]["posted_credit_exhausted"], true);
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn media_settlement_cannot_spend_other_jobs_reserved_capacity(pool: PgPool) {
    use niu_storage::MediaUsageSource as Source;
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    store
        .record_settled_customer_funding(
            scope.organization_id,
            "CNY",
            200,
            "fixture",
            "media-other-holds",
        )
        .await
        .unwrap();
    let first = reserved_sent_media(&store, &pool, scope).await;
    let _other = reserved_sent_media(&store, &pool, scope).await;
    store
        .record_customer_media_usage(scope, first, Source::Query, &reported(1_500_000))
        .await
        .unwrap();
    store.complete(scope, first, None).await.unwrap();
    assert!(
        store
            .settle_customer_media_charge(scope, first)
            .await
            .is_err()
    );
    let summary = store
        .customer_balance_summary(scope.organization_id)
        .await
        .unwrap();
    assert_eq!(summary[0]["balance_nanos"], "200");
    assert_eq!(summary[0]["reserved_nanos"], "200");
    store
        .record_settled_customer_funding(
            scope.organization_id,
            "CNY",
            50,
            "fixture",
            "media-reconciliation-funding",
        )
        .await
        .unwrap();
    assert_eq!(
        store
            .settle_customer_media_charge(scope, first)
            .await
            .unwrap(),
        150
    );
    let summary = store
        .customer_balance_summary(scope.organization_id)
        .await
        .unwrap();
    assert_eq!(summary[0]["balance_nanos"], "100");
    assert_eq!(summary[0]["reserved_nanos"], "100");
    assert_eq!(summary[0]["available_nanos"], "0");
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn customer_workspace_limit_serializes_shared_text_and_media_holds(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    store
        .record_settled_customer_funding(
            scope.organization_id,
            "CNY",
            1000,
            "fixture",
            "workspace-limit",
        )
        .await
        .unwrap();
    assert_eq!(
        store
            .set_customer_workspace_spending_limit(scope, "CNY", 50, 0)
            .await
            .unwrap(),
        1
    );
    let mut pending = Vec::new();
    for _ in 0..16 {
        let id = attempt(&store, scope).await;
        store
            .bind_customer_media_pricing(scope, id, &pricing(scope, 100))
            .await
            .unwrap();
        pending.push(id);
    }
    for id in &pending {
        sqlx::query("INSERT INTO customer_attempt_balance_accounts(attempt_id,organization_id,project_id,account_id,currency) SELECT $1,organization_id,$2,id,currency FROM customer_balance_accounts WHERE organization_id=$3 AND currency='CNY'")
            .bind(id).bind(scope.project_id).bind(scope.organization_id).execute(&pool).await.unwrap();
    }
    let mut jobs = Vec::new();
    for (index, id) in pending.iter().copied().enumerate() {
        let store = store.clone();
        jobs.push(tokio::spawn(async move {
            let result = if index % 2 == 0 {
                store.reserve_customer_balance(scope, id, 10).await
            } else {
                store
                    .reserve_customer_media_balance(
                        scope,
                        id,
                        &niu_storage::MediaLiabilityBound {
                            meter: "video_tokens".into(),
                            maximum_quantity: Quantity::integer(100_000),
                            qualification_revision: "workspace-bound".into(),
                        },
                    )
                    .await
                    .map(|_| ())
            };
            (id, result)
        }));
    }
    let mut admitted = Vec::new();
    let mut rejected = Vec::new();
    for job in jobs {
        let (id, result) = job.await.unwrap();
        if result.is_ok() {
            admitted.push(id);
        } else {
            assert!(matches!(
                result,
                Err(niu_storage::StoreError::WorkspaceSpendingLimitExceeded)
            ));
            rejected.push(id);
        }
    }
    assert_eq!(admitted.len(), 5);
    assert_eq!(
        store
            .customer_workspace_spending_limit(scope, "CNY")
            .await
            .unwrap()
            .unwrap()["committed_nanos"],
        "50"
    );
    assert!(matches!(
        store
            .set_customer_workspace_spending_limit(scope, "CNY", 49, 1)
            .await,
        Err(niu_storage::StoreError::BudgetExceeded)
    ));
    assert!(
        store
            .set_customer_workspace_spending_limit(scope, "CNY", 60, 0)
            .await
            .is_err()
    );
    // Database enforcement protects alternate insertion paths as well.
    assert!(sqlx::query("INSERT INTO customer_balance_reservations(attempt_id,organization_id,account_id,currency,amount_nanos) SELECT attempt_id,organization_id,account_id,currency,1 FROM customer_attempt_balance_accounts WHERE attempt_id=$1")
        .bind(rejected[0]).execute(&pool).await.is_err());
    store
        .release_nonexecuted_customer_balance(scope, admitted[0])
        .await
        .unwrap();
    store
        .reserve_customer_balance(scope, rejected[0], 10)
        .await
        .unwrap();
    assert_eq!(
        store
            .set_customer_workspace_spending_limit(scope, "CNY", 60, 1)
            .await
            .unwrap(),
        2
    );
    let fresh = Store::from_pool(pool.clone());
    let saved = fresh
        .customer_workspace_spending_limit(scope, "CNY")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(saved["limit_nanos"], "60");
    assert_eq!(saved["revision"], "2");
    assert_eq!(saved["committed_nanos"], "50");
    let other = store
        .create_project(scope.organization_id, "Independent limit workspace")
        .await
        .unwrap();
    assert!(
        store
            .customer_workspace_spending_limit(other, "CNY")
            .await
            .unwrap()
            .is_none()
    );
    let other_id = attempt(&store, other).await;
    store
        .bind_customer_media_pricing(other, other_id, &pricing(other, 100))
        .await
        .unwrap();
    sqlx::query("INSERT INTO customer_attempt_balance_accounts(attempt_id,organization_id,project_id,account_id,currency) SELECT $1,organization_id,$2,id,currency FROM customer_balance_accounts WHERE organization_id=$3 AND currency='CNY'")
        .bind(other_id).bind(other.project_id).bind(other.organization_id).execute(&pool).await.unwrap();
    store
        .reserve_customer_balance(other, other_id, 100)
        .await
        .unwrap();
    assert_eq!(
        fresh
            .customer_workspace_spending_limit(scope, "CNY")
            .await
            .unwrap()
            .unwrap()["committed_nanos"],
        "50"
    );
}

#[sqlx::test(migrations = false)]
#[ignore = "requires PostgreSQL"]
async fn workspace_limit_history_upgrades_without_inventing_dates_or_revisions(pool: PgPool) {
    let old = sqlx::migrate::Migrator {
        migrations: std::borrow::Cow::Owned(
            MIGRATOR
                .iter()
                .filter(|m| m.version <= 138)
                .cloned()
                .collect(),
        ),
        ignore_missing: false,
        locking: true,
        no_tx: false,
    };
    old.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    store
        .record_settled_customer_funding(
            scope.organization_id,
            "CNY",
            100,
            "fixture",
            "history-upgrade",
        )
        .await
        .unwrap();
    store
        .set_customer_workspace_spending_limit(scope, "CNY", 40, 0)
        .await
        .unwrap();
    store
        .set_customer_workspace_spending_limit(scope, "CNY", 50, 1)
        .await
        .unwrap();
    MIGRATOR.run(&pool).await.unwrap();
    let baseline = store
        .customer_workspace_spending_limit_history(scope, "CNY", None, 100)
        .await
        .unwrap();
    assert_eq!(baseline.len(), 1);
    assert_eq!(baseline[0]["revision"], "2");
    assert_eq!(baseline[0]["source"], "migration_baseline");
    assert!(baseline[0]["recorded_at"].is_null());
    store
        .set_customer_workspace_spending_limit(scope, "CNY", 60, 2)
        .await
        .unwrap();
    assert!(
        store
            .set_customer_workspace_spending_limit(scope, "CNY", 70, 2)
            .await
            .is_err()
    );
    let fresh = Store::from_pool(pool.clone());
    let page = fresh
        .customer_workspace_spending_limit_history(scope, "CNY", None, 1)
        .await
        .unwrap();
    assert_eq!(page.len(), 1);
    assert_eq!(page[0]["revision"], "3");
    assert_eq!(page[0]["limit_nanos"], "60");
    assert_eq!(page[0]["source"], "configuration");
    assert!(page[0]["recorded_at"].is_string());
    assert_eq!(page[0].as_object().unwrap().len(), 7);
    assert_eq!(page[0]["actor_kind"], "unknown");
    assert!(page[0]["actor_name"].is_null());
    assert_eq!(
        fresh
            .customer_workspace_spending_limit_history(scope, "CNY", Some(3), 100)
            .await
            .unwrap(),
        baseline
    );
    let other = store
        .create_project(scope.organization_id, "Other history scope")
        .await
        .unwrap();
    assert!(
        fresh
            .customer_workspace_spending_limit_history(other, "CNY", None, 100)
            .await
            .unwrap()
            .is_empty()
    );
    assert!(
        fresh
            .customer_workspace_spending_limit_history(scope, "USD", None, 100)
            .await
            .unwrap()
            .is_empty()
    );
    assert!(
        fresh
            .customer_workspace_spending_limit_history(scope, "CNY", Some(0), 100)
            .await
            .is_err()
    );
    assert!(
        fresh
            .customer_workspace_spending_limit_history(scope, "CNY", None, 101)
            .await
            .is_err()
    );
    for sql in [
        "UPDATE customer_workspace_limit_history SET limit_nanos=1 WHERE organization_id=$1",
        "DELETE FROM customer_workspace_limit_history WHERE organization_id=$1",
    ] {
        assert!(
            sqlx::query(sql)
                .bind(scope.organization_id)
                .execute(&pool)
                .await
                .is_err()
        );
    }
    assert_eq!(
        fresh
            .customer_workspace_spending_limit_history(scope, "CNY", None, 100)
            .await
            .unwrap()
            .len(),
        2
    );
}
