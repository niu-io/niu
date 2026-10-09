use niu_metered_cost::{Dimensions, Quantity, Rounding, Tariff};
use niu_storage::{
    CustomerMediaRateCard, MIGRATOR, Store, StoreError, VendorInput, VendorModelInput,
};
use serde_json::json;
use sqlx::PgPool;
use uuid::Uuid;

async fn fixture(pool: &PgPool) -> (Store, Uuid, CustomerMediaRateCard) {
    MIGRATOR.run(pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let vendor = store
        .create_vendor(VendorInput {
            id: Uuid::new_v4(),
            name: "Video tariff fixture".into(),
            adapter: "openai".into(),
            api_base: "https://fixture.example".into(),
            enabled: true,
            credential_ciphertext: vec![17; 48],
        })
        .await
        .unwrap();
    let schema = json!({"version":1,"revision":"rate-schema","model_alias":"fixture-video","upstream_model":"private-video","channel":"ark-direct-v1","maximum_body_bytes":1024,"maximum_content_items":1,"inputs":{"text":{"maximum_items":1,"maximum_bytes":256,"https":false,"data_mime_types":[],"roles":[],"role_required":false}},"controls":{},"required_controls":[],"exclusive_controls":[],"callbacks_qualified":false});
    let model = store
        .upsert_vendor_model(
            vendor.id,
            VendorModelInput {
                alias: "fixture-video".into(),
                upstream_model: "private-video".into(),
                enabled: true,
                public_catalog: false,
                capabilities: json!({"video_schema":schema}),
                pricing: None,
                expected_revision: None,
            },
        )
        .await
        .unwrap();
    let card = CustomerMediaRateCard {
        revision: "selling-1".into(),
        vendor_id: vendor.id,
        vendor_revision: vendor.revision,
        model_revision: model.revision,
        schema_revision: "rate-schema".into(),
        offer_revision: "offer-1".into(),
        tariff: Tariff {
            revision: "tariff-1".into(),
            dimensions: Dimensions {
                model: "fixture-video".into(),
                channel: "ark-direct-v1".into(),
                resolution: "720p".into(),
                reference_video: false,
            },
            meter: "video_tokens".into(),
            currency: "CNY".into(),
            decimal_places: 9,
            amount_units: 100,
            per_quantity: Quantity::integer(1_000_000),
            minimum_quantity: Quantity::integer(0),
            rounding: Rounding::Up,
            effective_from: 10,
            effective_until: Some(100),
        },
        discounts: vec![],
        maximum_quantity: Quantity::integer(200_000),
        liability_qualification_revision: "fixture-bound-1".into(),
    };
    (store, scope.organization_id, card)
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn customer_rate_selection_is_scoped_effective_immutable_and_restart_safe(pool: PgPool) {
    let (store, organization, card) = fixture(&pool).await;
    store
        .register_customer_media_rate(organization, &card)
        .await
        .unwrap();
    store
        .register_customer_media_rate(organization, &card)
        .await
        .unwrap();
    let mut changed = card.clone();
    changed.tariff.amount_units = 500;
    assert!(matches!(
        store
            .register_customer_media_rate(organization, &changed)
            .await,
        Err(StoreError::Conflict)
    ));
    let restored = Store::from_pool(pool.clone());
    let selected = restored
        .select_customer_media_rate(organization, &card.tariff.dimensions, 10)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(selected.pricing.tariff(), &card.tariff);
    assert_eq!(selected.liability.maximum_quantity, card.maximum_quantity);
    for at in [9, 100] {
        assert!(
            restored
                .select_customer_media_rate(organization, &card.tariff.dimensions, at)
                .await
                .unwrap()
                .is_none()
        );
    }
    let foreign = store
        .create_organization("Other video customer")
        .await
        .unwrap();
    assert!(
        restored
            .select_customer_media_rate(foreign, &card.tariff.dimensions, 20)
            .await
            .unwrap()
            .is_none()
    );
    let mut other_dimensions = card.tariff.dimensions.clone();
    other_dimensions.reference_video = true;
    assert!(
        restored
            .select_customer_media_rate(organization, &other_dimensions, 20)
            .await
            .unwrap()
            .is_none()
    );
    changed.revision = "selling-2".into();
    store
        .register_customer_media_rate(organization, &changed)
        .await
        .unwrap();
    assert!(matches!(
        restored
            .select_customer_media_rate(organization, &card.tariff.dimensions, 20)
            .await,
        Err(StoreError::InvalidPrice)
    ));
    assert!(
        sqlx::query(
            "UPDATE customer_media_rate_cards SET resolution='1080p' WHERE organization_id=$1"
        )
        .bind(organization)
        .execute(&pool)
        .await
        .is_err()
    );
    assert!(
        sqlx::query("DELETE FROM customer_media_rate_cards WHERE organization_id=$1")
            .bind(organization)
            .execute(&pool)
            .await
            .is_err()
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn customer_media_rate_rejects_stale_mapping_and_personal_credentials(pool: PgPool) {
    let (store, organization, card) = fixture(&pool).await;
    store
        .register_customer_media_rate(organization, &card)
        .await
        .unwrap();
    store
        .assign_personal_vendor_owner(card.vendor_id, organization, card.vendor_revision)
        .await
        .unwrap();
    assert!(matches!(
        store
            .select_customer_media_rate(organization, &card.tariff.dimensions, 20)
            .await,
        Err(StoreError::Conflict)
    ));
    assert!(matches!(
        store
            .register_customer_media_rate(organization, &card)
            .await,
        Err(StoreError::Conflict)
    ));
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn customer_media_rate_requires_exact_current_model_revision(pool: PgPool) {
    let (store, organization, card) = fixture(&pool).await;
    store
        .register_customer_media_rate(organization, &card)
        .await
        .unwrap();
    sqlx::query("UPDATE vendor_models SET revision=revision+1 WHERE vendor_id=$1 AND alias=$2")
        .bind(card.vendor_id)
        .bind(&card.tariff.dimensions.model)
        .execute(&pool)
        .await
        .unwrap();
    assert!(matches!(
        store
            .select_customer_media_rate(organization, &card.tariff.dimensions, 20)
            .await,
        Err(StoreError::Conflict)
    ));
    assert!(matches!(
        store
            .register_customer_media_rate(organization, &card)
            .await,
        Err(StoreError::Conflict)
    ));
    let mut invalid = card.clone();
    invalid.maximum_quantity = Quantity::integer(0);
    assert!(matches!(
        store
            .register_customer_media_rate(organization, &invalid)
            .await,
        Err(StoreError::InvalidPrice)
    ));
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn customer_media_discount_periods_and_resolution_rates_select_independently(pool: PgPool) {
    let (store, organization, mut card) = fixture(&pool).await;
    assert_eq!(
        store.customer_media_rate_models(None, 50).await.unwrap()["data"],
        json!([]),
        "an enabled schema without commercial qualification is not a pricing choice"
    );
    card.discounts.push(niu_metered_cost::Discount {
        revision: "customer-promotion".into(),
        dimensions: Some(card.tariff.dimensions.clone()),
        offer: Some(card.offer_revision.clone()),
        customer: Some(organization.to_string()),
        effective_from: 30,
        effective_until: Some(40),
        priority: 10,
        stacking: niu_metered_cost::Stacking::Exclusive,
        multiplier: Quantity::new(4, 5).unwrap(),
    });
    store
        .register_customer_media_rate(organization, &card)
        .await
        .unwrap();
    let mut high = card.clone();
    high.revision = "selling-high-resolution".into();
    high.tariff.revision = "tariff-high-resolution".into();
    high.tariff.dimensions.resolution = "1080p".into();
    high.tariff.amount_units = 200;
    store
        .register_customer_media_rate(organization, &high)
        .await
        .unwrap();
    let restored = Store::from_pool(pool);
    let usage = niu_metered_cost::Usage::Known {
        meter: "video_tokens".into(),
        quantity: Quantity::integer(1_000_000),
        provenance: niu_metered_cost::Provenance::Reported,
    };
    for (at, expected) in [(29, 100), (30, 80), (39, 80), (40, 100)] {
        let rate = restored
            .select_customer_media_rate(organization, &card.tariff.dimensions, at)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(
            rate.pricing.calculate(&usage).unwrap().amount_units,
            expected
        );
        let high_rate = restored
            .select_customer_media_rate(organization, &high.tariff.dimensions, at)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(
            high_rate.pricing.calculate(&usage).unwrap().amount_units,
            200
        );
    }
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn retirement_replaces_open_ended_rate_without_repricing_history(pool: PgPool) {
    let (store, organization, mut original) = fixture(&pool).await;
    original.tariff.effective_until = None;
    store
        .register_customer_media_rate(organization, &original)
        .await
        .unwrap();
    let historical = store
        .select_customer_media_rate(organization, &original.tariff.dimensions, 20)
        .await
        .unwrap()
        .unwrap()
        .pricing;
    let mut replacement = original.clone();
    replacement.revision = "selling-replacement".into();
    replacement.tariff.revision = "tariff-replacement".into();
    replacement.tariff.effective_from = 30;
    replacement.tariff.amount_units = 200;
    store
        .register_customer_media_rate(organization, &replacement)
        .await
        .unwrap();
    assert!(matches!(
        store
            .select_customer_media_rate(organization, &original.tariff.dimensions, 30)
            .await,
        Err(StoreError::InvalidPrice)
    ));
    store
        .retire_customer_media_rate(organization, &original.revision, 30)
        .await
        .unwrap();
    store
        .retire_customer_media_rate(organization, &original.revision, 30)
        .await
        .unwrap();
    assert!(matches!(
        store
            .retire_customer_media_rate(organization, &original.revision, 31)
            .await,
        Err(StoreError::Conflict)
    ));
    let restored = Store::from_pool(pool.clone());
    for (at, expected) in [(29, 100), (30, 200), (100, 200)] {
        let selected = restored
            .select_customer_media_rate(organization, &original.tariff.dimensions, at)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(selected.pricing.tariff().amount_units, expected);
    }
    let old_document: serde_json::Value = sqlx::query_scalar(
        "SELECT document FROM customer_media_rate_cards WHERE organization_id=$1 AND revision=$2",
    )
    .bind(organization)
    .bind(&original.revision)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(old_document, serde_json::to_value(&original).unwrap());
    let reconstructed =
        niu_metered_cost::PricingSnapshot::decode(&historical.encode().unwrap()).unwrap();
    assert_eq!(reconstructed.tariff().amount_units, 100);
    assert_eq!(reconstructed.tariff().effective_until, None);
    let reported = niu_metered_cost::Usage::Known {
        meter: "video_tokens".into(),
        quantity: Quantity::integer(100_000),
        provenance: niu_metered_cost::Provenance::Reported,
    };
    assert_eq!(reconstructed.calculate(&reported).unwrap().amount_units, 10);
    let current = restored
        .select_customer_media_rate(organization, &original.tariff.dimensions, 30)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        current.pricing.calculate(&reported).unwrap().amount_units,
        20
    );

    for sql in [
        "UPDATE customer_media_rate_retirements SET effective_until=31 WHERE organization_id=$1",
        "DELETE FROM customer_media_rate_retirements WHERE organization_id=$1",
    ] {
        assert!(
            sqlx::query(sql)
                .bind(organization)
                .execute(&pool)
                .await
                .is_err()
        );
    }
    let foreign = store
        .create_organization("Other rate customer")
        .await
        .unwrap();
    assert!(matches!(
        store
            .retire_customer_media_rate(foreign, &original.revision, 30)
            .await,
        Err(StoreError::Conflict)
    ));
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn retirement_boundaries_and_competing_cutoffs_fail_safely(pool: PgPool) {
    let (store, organization, card) = fixture(&pool).await;
    store
        .register_customer_media_rate(organization, &card)
        .await
        .unwrap();
    for cutoff in [9, 101] {
        assert!(matches!(
            store
                .retire_customer_media_rate(organization, &card.revision, cutoff)
                .await,
            Err(StoreError::InvalidPrice)
        ));
        assert!(sqlx::query("INSERT INTO customer_media_rate_retirements(organization_id,revision,effective_until) VALUES($1,$2,$3)")
            .bind(organization).bind(&card.revision).bind(cutoff).execute(&pool).await.is_err());
    }
    let (a, b) = tokio::join!(
        store.retire_customer_media_rate(organization, &card.revision, 30),
        store.retire_customer_media_rate(organization, &card.revision, 40)
    );
    assert!(a.is_ok() ^ b.is_ok());
    assert!(matches!(a, Err(StoreError::Conflict)) || matches!(b, Err(StoreError::Conflict)));
    let cutoff = if a.is_ok() { 30 } else { 40 };
    assert!(
        store
            .select_customer_media_rate(organization, &card.tariff.dimensions, cutoff - 1)
            .await
            .unwrap()
            .is_some()
    );
    assert!(
        store
            .select_customer_media_rate(organization, &card.tariff.dimensions, cutoff)
            .await
            .unwrap()
            .is_none()
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn replacement_is_atomic_historical_and_retry_safe(pool: PgPool) {
    let (store, organization, original) = fixture(&pool).await;
    store
        .register_customer_media_rate(organization, &original)
        .await
        .unwrap();
    let mut next = original.clone();
    next.revision = "selling-replacement".into();
    next.tariff.revision = "tariff-replacement".into();
    next.tariff.effective_from = 50;
    next.tariff.amount_units = 250;
    store
        .replace_customer_media_rate(organization, &original.revision, &next)
        .await
        .unwrap();
    let restored = Store::from_pool(pool.clone());
    restored
        .replace_customer_media_rate(organization, &original.revision, &next)
        .await
        .unwrap();
    for (at, expected) in [(49, &original), (50, &next)] {
        let selected = restored
            .select_customer_media_rate(organization, &original.tariff.dimensions, at)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(selected.revision, expected.revision);
        assert_eq!(selected.pricing.tariff(), &expected.tariff);
    }
    let mut changed = next.clone();
    changed.tariff.amount_units += 1;
    assert!(matches!(
        restored
            .replace_customer_media_rate(organization, &original.revision, &changed)
            .await,
        Err(StoreError::Conflict)
    ));
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn selling_history_is_scoped_bounded_and_exact(pool: PgPool) {
    let (store, organization, mut card) = fixture(&pool).await;
    card.tariff.amount_units = 9_007_199_254_740_993;
    store
        .register_customer_media_rate(organization, &card)
        .await
        .unwrap();
    store
        .retire_customer_media_rate(organization, &card.revision, 50)
        .await
        .unwrap();
    let mut next = card.clone();
    next.revision = "selling-2".into();
    next.tariff.effective_from = 50;
    store
        .register_customer_media_rate(organization, &next)
        .await
        .unwrap();
    let page = store
        .customer_media_rates(organization, None, 1)
        .await
        .unwrap();
    assert_eq!(page["has_more"], true);
    assert_eq!(page["next_after"], "selling-1");
    assert_eq!(
        page["data"][0]["card"]["tariff"]["amount_units"],
        "9007199254740993"
    );
    assert_eq!(
        page["data"][0]["card"]["vendor_revision"],
        card.vendor_revision.to_string()
    );
    assert_eq!(page["data"][0]["retirement_effective_until"], "50");
    assert!(!page.to_string().contains("purchase"));
    let last = store
        .customer_media_rates(organization, Some("selling-1"), 1)
        .await
        .unwrap();
    assert_eq!(last["data"][0]["card"]["revision"], "selling-2");
    assert_eq!(last["has_more"], false);
    assert!(
        store
            .customer_media_rates(Uuid::new_v4(), None, 50)
            .await
            .unwrap()["data"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    for limit in [0, 101] {
        assert!(matches!(
            store.customer_media_rates(organization, None, limit).await,
            Err(StoreError::InvalidPrice)
        ));
    }
    for cursor in ["", " bad", "bad\n"] {
        assert!(matches!(
            store
                .customer_media_rates(organization, Some(cursor), 50)
                .await,
            Err(StoreError::InvalidPrice)
        ));
    }
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn rejected_replacement_rolls_back_publication_and_retirement(pool: PgPool) {
    let (store, organization, original) = fixture(&pool).await;
    store
        .register_customer_media_rate(organization, &original)
        .await
        .unwrap();
    let mut next = original.clone();
    next.revision = "invalid-replacement".into();
    next.tariff.effective_from = 101; // beyond the original interval
    next.tariff.effective_until = Some(200);
    assert!(matches!(
        store
            .replace_customer_media_rate(organization, &original.revision, &next)
            .await,
        Err(StoreError::InvalidPrice)
    ));
    let count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM customer_media_rate_cards WHERE organization_id=$1 AND revision=$2",
    )
    .bind(organization)
    .bind(&next.revision)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(count, 0);
    assert_eq!(
        store
            .select_customer_media_rate(organization, &original.tariff.dimensions, 50)
            .await
            .unwrap()
            .unwrap()
            .revision,
        original.revision
    );
    next.tariff.effective_from = 50;
    next.tariff.dimensions.resolution = "1080p".into();
    assert!(matches!(
        store
            .replace_customer_media_rate(organization, &original.revision, &next)
            .await,
        Err(StoreError::InvalidPrice)
    ));
    assert!(matches!(
        store
            .replace_customer_media_rate(Uuid::new_v4(), &original.revision, &next)
            .await,
        Err(StoreError::Conflict)
    ));
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn competing_replacements_leave_one_effective_schedule(pool: PgPool) {
    let (store, organization, original) = fixture(&pool).await;
    store
        .register_customer_media_rate(organization, &original)
        .await
        .unwrap();
    let mut first = original.clone();
    first.revision = "replacement-a".into();
    first.tariff.effective_from = 50;
    let mut second = first.clone();
    second.revision = "replacement-b".into();
    second.tariff.amount_units = 300;
    let (a, b) = tokio::join!(
        store.replace_customer_media_rate(organization, &original.revision, &first),
        store.replace_customer_media_rate(organization, &original.revision, &second),
    );
    assert_eq!(usize::from(a.is_ok()) + usize::from(b.is_ok()), 1);
    assert!(matches!(
        a.as_ref().err().or(b.as_ref().err()),
        Some(StoreError::Conflict)
    ));
    let selected = store
        .select_customer_media_rate(organization, &original.tariff.dimensions, 50)
        .await
        .unwrap()
        .unwrap();
    assert!(selected.revision == first.revision || selected.revision == second.revision);
}
