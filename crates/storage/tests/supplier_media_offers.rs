use niu_storage::{
    MIGRATOR, ProviderOfferInput, ProviderOfferQualificationInput, ProviderQualificationInput,
    Store, StoreError, SupplierMediaOfferInput,
};
use serde_json::json;
use sqlx::{PgPool, Row};
use uuid::Uuid;

async fn fixture(pool: &PgPool) -> (Store, Uuid, SupplierMediaOfferInput) {
    MIGRATOR.run(pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let supplier = store
        .create_provider_business("Media supplier")
        .await
        .unwrap();
    let vendor = Uuid::new_v4();
    sqlx::query("INSERT INTO vendors(id,name,adapter,api_base,credential_ciphertext) VALUES($1,'Video credential','openai','https://fixture.example',$2)").bind(vendor).bind(vec![17u8;48]).execute(pool).await.unwrap();
    store
        .associate_vendor_supplier(vendor, supplier, 1)
        .await
        .unwrap();
    let schema = json!({"version":1,"revision":"schema-one","model_alias":"video-fixture","upstream_model":"private-video","channel":"ark-direct-v1","maximum_body_bytes":1024,"maximum_content_items":1,"inputs":{"text":{"maximum_items":1,"maximum_bytes":256,"https":false,"data_mime_types":[],"roles":[],"role_required":false}},"controls":{},"required_controls":[],"exclusive_controls":[],"callbacks_qualified":false});
    sqlx::query("INSERT INTO vendor_models(alias,vendor_id,upstream_model,capabilities) VALUES('video-fixture',$1,'private-video',$2)").bind(vendor).bind(json!({"video_schema":schema})).execute(pool).await.unwrap();
    let vendor_revision = sqlx::query_scalar("SELECT revision FROM vendors WHERE id=$1")
        .bind(vendor)
        .fetch_one(pool)
        .await
        .unwrap();
    (
        store,
        supplier,
        SupplierMediaOfferInput {
            revision: Uuid::new_v4(),
            model_alias: "video-fixture".into(),
            vendor_id: vendor,
            vendor_revision,
            model_revision: 1,
            schema_revision: "schema-one".into(),
            expected_revision: None,
        },
    )
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn media_offer_has_no_text_prices_and_replays_without_replacing_newer_revision(pool: PgPool) {
    let (store, supplier, mut input) = fixture(&pool).await;
    let choices = store
        .supplier_media_offer_models(supplier, None, 1)
        .await
        .unwrap();
    assert_eq!(choices["data"][0]["api_key_name"], "Video credential");
    assert_eq!(
        choices["data"][0]["vendor_revision"],
        input.vendor_revision.to_string()
    );
    assert!(choices["data"][0]["offer_revision"].is_null());
    let choice = choices["data"][0].as_object().unwrap();
    for forbidden in [
        "credential_ciphertext",
        "api_base",
        "upstream_model",
        "prompt_rate",
        "completion_rate",
    ] {
        assert!(!choice.contains_key(forbidden));
    }
    assert_eq!(
        store
            .publish_supplier_media_offer(supplier, &input)
            .await
            .unwrap(),
        input.revision
    );
    assert_eq!(
        store
            .publish_supplier_media_offer(supplier, &input)
            .await
            .unwrap(),
        input.revision
    );
    let row=sqlx::query("SELECT rate_kind,currency,prompt_rate,completion_rate FROM provider_offer_revisions WHERE id=$1").bind(input.revision).fetch_one(&pool).await.unwrap();
    assert_eq!(row.get::<String, _>("rate_kind"), "media");
    assert!(row.get::<Option<String>, _>("currency").is_none());
    assert!(row.get::<Option<i64>, _>("prompt_rate").is_none());
    assert!(row.get::<Option<i64>, _>("completion_rate").is_none());
    let old = input.revision;
    input.revision = Uuid::new_v4();
    input.expected_revision = Some(old);
    store
        .publish_supplier_media_offer(supplier, &input)
        .await
        .unwrap();
    let latest = input.revision;
    input.revision = old;
    input.expected_revision = None;
    store
        .publish_supplier_media_offer(supplier, &input)
        .await
        .unwrap();
    let current: Uuid =
        sqlx::query_scalar("SELECT current_revision FROM provider_offers WHERE provider_id=$1")
            .bind(supplier)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(current, latest);
    input.schema_revision = "different".into();
    assert!(matches!(
        store.publish_supplier_media_offer(supplier, &input).await,
        Err(StoreError::Conflict)
    ));
    let dashboard = store.provider_dashboard(supplier, 30).await.unwrap();
    assert_eq!(dashboard["offers"][0]["rate_kind"], "media");
    assert!(dashboard["offers"][0]["prompt_rate"].is_null());
    assert!(
        !store
            .supplier_model_available("video-fixture")
            .await
            .unwrap()
    );
    assert!(
        store
            .supplier_model_uses_media_offer("video-fixture")
            .await
            .unwrap()
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn stale_bindings_and_foreign_ownership_cannot_publish_or_renew_qualification(pool: PgPool) {
    let (store, supplier, mut input) = fixture(&pool).await;
    let foreign = store
        .create_provider_business("Foreign supplier")
        .await
        .unwrap();
    assert!(
        store
            .supplier_media_offer_models(foreign, None, 100)
            .await
            .unwrap()["data"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    assert!(matches!(
        store.publish_supplier_media_offer(foreign, &input).await,
        Err(StoreError::Conflict)
    ));
    input.vendor_revision += 1;
    assert!(matches!(
        store.publish_supplier_media_offer(supplier, &input).await,
        Err(StoreError::Conflict)
    ));
    input.vendor_revision -= 1;
    store
        .publish_supplier_media_offer(supplier, &input)
        .await
        .unwrap();
    assert!(matches!(
        store.publish_supplier_media_offer(foreign, &input).await,
        Err(StoreError::Conflict)
    ));
    let offer: Uuid = sqlx::query_scalar("SELECT id FROM provider_offers WHERE provider_id=$1")
        .bind(supplier)
        .fetch_one(&pool)
        .await
        .unwrap();
    let expiry = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
        + 86400000;
    store
        .qualify_provider_business(
            supplier,
            &ProviderQualificationInput {
                supply_rights_sha256: "a".repeat(64),
                supply_capability_sha256: "b".repeat(64),
                data_handling_sha256: "c".repeat(64),
                valid_until_ms: expiry,
            },
        )
        .await
        .unwrap();
    let review = ProviderOfferQualificationInput {
        rate_revision: input.revision,
        model_identity_sha256: "d".repeat(64),
        protocol_matrix_sha256: "e".repeat(64),
        protocol_matrix_version: "video-v1".into(),
        data_handling_sha256: "f".repeat(64),
        availability_sha256: "1".repeat(64),
        agreed_rates_sha256: "2".repeat(64),
        valid_until_ms: expiry,
    };
    store
        .qualify_provider_offer(supplier, offer, &review)
        .await
        .unwrap();
    assert!(
        sqlx::query_scalar::<_, bool>("SELECT niu_offer_qualification_current($1,$2,$3)")
            .bind(supplier)
            .bind(offer)
            .bind(input.revision)
            .fetch_one(&pool)
            .await
            .unwrap()
    );
    sqlx::query("UPDATE provider_offers SET active=TRUE WHERE id=$1")
        .bind(offer)
        .execute(&pool)
        .await
        .unwrap();
    let scope = store.default_workspace().await.unwrap();
    let operation = store
        .create_operation(scope, "video-fixture")
        .await
        .unwrap();
    let attempt = store
        .prepare_attempt(scope, operation, "video-fixture", "fixture-route")
        .await
        .unwrap();
    store
        .bind_provider_offer(
            scope,
            attempt,
            "video-fixture",
            "private-video",
            Some("https://fixture.example"),
        )
        .await
        .unwrap();
    let denied = sqlx::query("UPDATE attempts SET execution='may_have_executed' WHERE id=$1")
        .bind(attempt)
        .execute(&pool)
        .await
        .unwrap_err();
    assert_eq!(
        denied.as_database_error().unwrap().message(),
        "media offer requires pinned media pricing, liability and route"
    );
    sqlx::query("UPDATE provider_offers SET active=FALSE WHERE id=$1")
        .bind(offer)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("UPDATE vendor_models SET revision=revision+1 WHERE alias='video-fixture'")
        .execute(&pool)
        .await
        .unwrap();
    assert!(
        !sqlx::query_scalar::<_, bool>("SELECT niu_offer_qualification_current($1,$2,$3)")
            .bind(supplier)
            .bind(offer)
            .bind(input.revision)
            .fetch_one(&pool)
            .await
            .unwrap()
    );
    assert!(
        store
            .qualify_provider_offer(supplier, offer, &review)
            .await
            .is_err()
    );
    input.revision = Uuid::new_v4();
    input.expected_revision = Some(review.rate_revision);
    assert!(matches!(
        store.publish_supplier_media_offer(supplier, &input).await,
        Err(StoreError::Conflict)
    ));
    input.model_revision += 1;
    store
        .publish_supplier_media_offer(supplier, &input)
        .await
        .unwrap();
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn text_revision_is_immutable_and_media_conversion_does_not_invent_prices(pool: PgPool) {
    let (store, supplier, mut input) = fixture(&pool).await;
    let text = store
        .publish_provider_offer(
            supplier,
            &ProviderOfferInput {
                model_alias: input.model_alias.clone(),
                currency: "USD".into(),
                prompt_rate: "123".into(),
                completion_rate: "456".into(),
                expected_revision: None,
            },
        )
        .await
        .unwrap();
    input.expected_revision = Some(text);
    store
        .publish_supplier_media_offer(supplier, &input)
        .await
        .unwrap();
    let old=sqlx::query("SELECT rate_kind,currency,prompt_rate,completion_rate FROM provider_offer_revisions WHERE id=$1").bind(text).fetch_one(&pool).await.unwrap();
    assert_eq!(old.get::<String, _>("rate_kind"), "text");
    assert_eq!(old.get::<String, _>("currency"), "USD");
    assert_eq!(old.get::<i64, _>("prompt_rate"), 123);
    assert_eq!(old.get::<i64, _>("completion_rate"), 456);
    assert!(
        sqlx::query("UPDATE provider_offer_revisions SET prompt_rate=0 WHERE id=$1")
            .bind(text)
            .execute(&pool)
            .await
            .is_err()
    );
    assert!(
        store
            .supplier_media_offer_models(supplier, None, 0)
            .await
            .is_err()
    );
    assert!(
        store
            .supplier_media_offer_models(supplier, Some(" bad"), 100)
            .await
            .is_err()
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn media_rebinding_and_concurrent_publication_preserve_ownership_and_original_receipts(
    pool: PgPool,
) {
    let (store, supplier, mut input) = fixture(&pool).await;
    store
        .publish_supplier_media_offer(supplier, &input)
        .await
        .unwrap();
    let original = input.revision;
    let original_vendor = input.vendor_id;
    let replacement = Uuid::new_v4();
    sqlx::query("INSERT INTO vendors(id,name,adapter,api_base,credential_ciphertext) VALUES($1,'Replacement credential','openai','https://other.fixture.example',$2)").bind(replacement).bind(vec![17u8;48]).execute(&pool).await.unwrap();
    let foreign = store
        .create_provider_business("Foreign owner")
        .await
        .unwrap();
    store
        .associate_vendor_supplier(replacement, foreign, 1)
        .await
        .unwrap();
    sqlx::query(
        "UPDATE vendor_models SET vendor_id=$1,revision=revision+1 WHERE alias='video-fixture'",
    )
    .bind(replacement)
    .execute(&pool)
    .await
    .unwrap();
    input.revision = Uuid::new_v4();
    input.expected_revision = Some(original);
    input.vendor_id = replacement;
    input.model_revision = 2;
    input.vendor_revision = 2;
    assert!(matches!(
        store.publish_supplier_media_offer(supplier, &input).await,
        Err(StoreError::Conflict)
    ));
    let own = Uuid::new_v4();
    sqlx::query("INSERT INTO vendors(id,name,adapter,api_base,credential_ciphertext) VALUES($1,'Second owned credential','openai','https://owned.fixture.example',$2)").bind(own).bind(vec![17u8;48]).execute(&pool).await.unwrap();
    store
        .associate_vendor_supplier(own, supplier, 1)
        .await
        .unwrap();
    sqlx::query(
        "UPDATE vendor_models SET vendor_id=$1,revision=revision+1 WHERE alias='video-fixture'",
    )
    .bind(own)
    .execute(&pool)
    .await
    .unwrap();
    input.vendor_id = own;
    input.model_revision = 3;
    let other = SupplierMediaOfferInput {
        revision: Uuid::new_v4(),
        model_alias: input.model_alias.clone(),
        vendor_id: own,
        vendor_revision: input.vendor_revision,
        model_revision: input.model_revision,
        schema_revision: input.schema_revision.clone(),
        expected_revision: input.expected_revision,
    };
    let (first, second) = tokio::join!(
        store.publish_supplier_media_offer(supplier, &input),
        store.publish_supplier_media_offer(supplier, &other)
    );
    assert_eq!(usize::from(first.is_ok()) + usize::from(second.is_ok()), 1);
    assert!(
        matches!(first, Err(StoreError::Conflict)) || matches!(second, Err(StoreError::Conflict))
    );
    let pinned: Uuid =
        sqlx::query_scalar("SELECT vendor_id FROM provider_offer_revisions WHERE id=$1")
            .bind(original)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(pinned, original_vendor);
    let current_vendor: Uuid =
        sqlx::query_scalar("SELECT vendor_id FROM provider_offers WHERE provider_id=$1")
            .bind(supplier)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(current_vendor, own);
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn personal_credentials_never_become_media_supply(pool: PgPool) {
    let (store, supplier, mut input) = fixture(&pool).await;
    let scope = store.default_workspace().await.unwrap();
    store
        .assign_personal_vendor_owner(
            input.vendor_id,
            scope.organization_id,
            input.vendor_revision,
        )
        .await
        .unwrap();
    input.vendor_revision += 1;
    assert!(
        store
            .supplier_media_offer_models(supplier, None, 100)
            .await
            .unwrap()["data"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    assert!(matches!(
        store.publish_supplier_media_offer(supplier, &input).await,
        Err(StoreError::Conflict)
    ));
    let count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM provider_offers WHERE provider_id=$1")
            .bind(supplier)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(count, 0);
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn one_supplier_keeps_multiple_credentials_and_model_subsets_independent(pool: PgPool) {
    let (store, supplier, first) = fixture(&pool).await;
    let copy = |input: &SupplierMediaOfferInput| SupplierMediaOfferInput {
        revision: input.revision,
        model_alias: input.model_alias.clone(),
        vendor_id: input.vendor_id,
        vendor_revision: input.vendor_revision,
        model_revision: input.model_revision,
        schema_revision: input.schema_revision.clone(),
        expected_revision: input.expected_revision,
    };
    let second_vendor = Uuid::new_v4();
    sqlx::query("INSERT INTO vendors(id,name,adapter,api_base,credential_ciphertext) VALUES($1,'Independent credential','openai','https://independent.fixture.example',$2)")
        .bind(second_vendor).bind(vec![19u8;48]).execute(&pool).await.unwrap();
    store
        .associate_vendor_supplier(second_vendor, supplier, 1)
        .await
        .unwrap();
    let second_revision: i64 = sqlx::query_scalar("SELECT revision FROM vendors WHERE id=$1")
        .bind(second_vendor)
        .fetch_one(&pool)
        .await
        .unwrap();
    let capabilities: serde_json::Value =
        sqlx::query_scalar("SELECT capabilities FROM vendor_models WHERE alias=$1")
            .bind(&first.model_alias)
            .fetch_one(&pool)
            .await
            .unwrap();
    let mut inputs = vec![copy(&first)];
    for (alias, vendor, revision) in [
        ("shared-key-video", first.vendor_id, first.vendor_revision),
        ("separate-key-video", second_vendor, second_revision),
    ] {
        let mut schema = capabilities.clone();
        schema["video_schema"]["model_alias"] = json!(alias);
        schema["video_schema"]["upstream_model"] = json!(alias);
        sqlx::query("INSERT INTO vendor_models(alias,vendor_id,upstream_model,capabilities) VALUES($1,$2,$1,$3)").bind(alias).bind(vendor).bind(schema).execute(&pool).await.unwrap();
        inputs.push(SupplierMediaOfferInput {
            revision: Uuid::new_v4(),
            model_alias: alias.into(),
            vendor_id: vendor,
            vendor_revision: revision,
            model_revision: 1,
            schema_revision: first.schema_revision.clone(),
            expected_revision: None,
        });
    }
    let choices = store
        .supplier_media_offer_models(supplier, None, 10)
        .await
        .unwrap();
    assert_eq!(choices["data"].as_array().unwrap().len(), 3);
    for input in &inputs {
        let row = choices["data"]
            .as_array()
            .unwrap()
            .iter()
            .find(|row| row["model_alias"] == input.model_alias)
            .unwrap();
        assert_eq!(row["vendor_id"], input.vendor_id.to_string());
        store
            .publish_supplier_media_offer(supplier, input)
            .await
            .unwrap();
        let saved: Uuid =
            sqlx::query_scalar("SELECT vendor_id FROM provider_offer_revisions WHERE id=$1")
                .bind(input.revision)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(saved, input.vendor_id);
    }
    sqlx::query("UPDATE vendors SET revision=revision+1 WHERE id=$1")
        .bind(first.vendor_id)
        .execute(&pool)
        .await
        .unwrap();
    for stale in &inputs[..2] {
        let mut update = copy(stale);
        update.revision = Uuid::new_v4();
        update.expected_revision = Some(stale.revision);
        assert!(matches!(
            store.publish_supplier_media_offer(supplier, &update).await,
            Err(StoreError::Conflict)
        ));
    }
    let mut independent = copy(&inputs[2]);
    independent.expected_revision = Some(independent.revision);
    independent.revision = Uuid::new_v4();
    store
        .publish_supplier_media_offer(supplier, &independent)
        .await
        .unwrap();
    let foreign = store
        .create_provider_business("Unrelated Supplier")
        .await
        .unwrap();
    assert!(
        store
            .supplier_media_offer_models(foreign, None, 10)
            .await
            .unwrap()["data"]
            .as_array()
            .unwrap()
            .is_empty()
    );
}
