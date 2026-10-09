use niu_storage::{MIGRATOR, Store, StoreError, VendorInput, VendorModelInput, VendorUpdate};
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

fn vendor_input(id: Uuid, name: &str, ciphertext: Vec<u8>) -> VendorInput {
    VendorInput {
        id,
        name: name.to_owned(),
        adapter: "openrouter".to_owned(),
        api_base: "https://openrouter.ai/api/v1".to_owned(),
        enabled: true,
        credential_ciphertext: ciphertext,
    }
}

fn model_input(alias: &str, upstream_model: &str) -> VendorModelInput {
    VendorModelInput {
        alias: alias.to_owned(),
        upstream_model: upstream_model.to_owned(),
        public_catalog: true,
        enabled: true,
        capabilities: json!({"chat": true, "streaming": true}),
        pricing: Some(json!({"currency": "USD", "unit": "token"})),
        expected_revision: None,
    }
}

fn copy_model_input(input: &VendorModelInput) -> VendorModelInput {
    VendorModelInput {
        alias: input.alias.clone(),
        upstream_model: input.upstream_model.clone(),
        public_catalog: input.public_catalog,
        enabled: input.enabled,
        capabilities: input.capabilities.clone(),
        pricing: input.pricing.clone(),
        expected_revision: input.expected_revision,
    }
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn configured_video_schema_is_versioned_and_matches_supplier_mapping(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let vendor = store
        .create_vendor(vendor_input(
            Uuid::new_v4(),
            "Video schema fixture",
            vec![0x11; 48],
        ))
        .await
        .unwrap();
    let schema = json!({"version":1,"revision":"fixture-v1","model_alias":"fixture-video","upstream_model":"fixture-upstream","channel":"fixture-channel",
        "maximum_body_bytes":4096,"maximum_content_items":1,
        "inputs":{"text":{"maximum_items":1,"maximum_bytes":256,"https":false,"data_mime_types":[],"roles":[],"role_required":false}},
        "controls":{"duration":{"kind":"integer","minimum":1,"maximum":10,"default":5}},
        "required_controls":["duration"],"exclusive_controls":[],"callbacks_qualified":false});
    let mut input = model_input("fixture-video", "fixture-upstream");
    input.capabilities = json!({"video_schema":schema});
    let first = store
        .upsert_vendor_model(vendor.id, copy_model_input(&input))
        .await
        .unwrap();
    assert_eq!(first.capabilities["video_schema"]["revision"], "fixture-v1");
    input.expected_revision = Some(first.revision);
    for field in ["model_alias", "upstream_model"] {
        let mut invalid = copy_model_input(&input);
        invalid.capabilities["video_schema"][field] = "other".into();
        assert!(store.upsert_vendor_model(vendor.id, invalid).await.is_err());
    }
    let mut invalid = copy_model_input(&input);
    invalid.capabilities["video_schema"]["version"] = 2.into();
    assert!(store.upsert_vendor_model(vendor.id, invalid).await.is_err());
    input.capabilities["video_schema"]["revision"] = "fixture-v2".into();
    let updated = store.upsert_vendor_model(vendor.id, input).await.unwrap();
    assert_eq!(updated.revision, first.revision + 1);
    let fresh = Store::from_pool(pool.clone());
    let route = fresh.vendor_route("fixture-video").await.unwrap().unwrap();
    assert_eq!(
        route.model.capabilities["video_schema"]["revision"],
        "fixture-v2"
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL with permission to create test databases"]
async fn vendor_registry_is_atomic_versioned_persistent_and_secret_safe(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let first_id = Uuid::new_v4();
    let first_ciphertext = vec![0xa5; 48];
    let first = store
        .create_vendor(vendor_input(
            first_id,
            "OpenRouter shared",
            first_ciphertext.clone(),
        ))
        .await
        .unwrap();
    assert!(first.has_credential);
    assert_eq!(first.revision, 1);
    assert!(
        serde_json::to_value(&first)
            .unwrap()
            .get("credential_ciphertext")
            .is_none()
    );
    assert_eq!(
        store.vendor(first_id).await.unwrap().unwrap().name,
        first.name
    );
    assert_eq!(
        store
            .vendor_by_name("OpenRouter shared")
            .await
            .unwrap()
            .unwrap()
            .id,
        first_id
    );

    let model = store
        .upsert_vendor_model(first_id, model_input("fast", "openai/gpt-4.1-mini"))
        .await
        .unwrap();
    assert_eq!(model.revision, 1);
    assert_eq!(store.vendor_models(first_id).await.unwrap().len(), 1);
    assert_eq!(
        store
            .vendor_models_with_availability(first_id)
            .await
            .unwrap()[0]["available"],
        true
    );
    sqlx::query("UPDATE vendors SET enabled=FALSE WHERE id=$1")
        .bind(first_id)
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        store
            .vendor_models_with_availability(first_id)
            .await
            .unwrap()[0]["available"],
        false
    );
    sqlx::query("UPDATE vendors SET enabled=TRUE WHERE id=$1")
        .bind(first_id)
        .execute(&pool)
        .await
        .unwrap();

    let second_id = Uuid::new_v4();
    store
        .create_vendor(vendor_input(second_id, "OpenAI direct", vec![0x5a; 64]))
        .await
        .unwrap();
    assert!(matches!(
        store
            .upsert_vendor_model(second_id, model_input("fast", "gpt-4.1-mini"))
            .await,
        Err(StoreError::Conflict)
    ));
    let mut foreign_update = model_input("fast", "gpt-4.1-mini");
    foreign_update.expected_revision = Some(1);
    assert!(matches!(
        store.upsert_vendor_model(second_id, foreign_update).await,
        Err(StoreError::Conflict)
    ));

    let mut invalid_capabilities = model_input("broken", "model-x");
    invalid_capabilities.capabilities = Value::Bool(true);
    assert!(matches!(
        store
            .upsert_vendor_model(first_id, invalid_capabilities)
            .await,
        Err(StoreError::InvalidVendor)
    ));
    let mut remote_http = vendor_input(Uuid::new_v4(), "Invalid endpoint", vec![0x5a; 64]);
    remote_http.api_base = "http://api.example.test/v1".to_owned();
    assert!(matches!(
        store.create_vendor(remote_http).await,
        Err(StoreError::InvalidVendor)
    ));

    let mut local_mock = vendor_input(Uuid::new_v4(), "Local mock", vec![0x5a; 30]);
    local_mock.api_base = "http://[::1]:4010/v1".to_owned();
    assert_eq!(
        store.create_vendor(local_mock).await.unwrap().name,
        "Local mock"
    );

    let rotated_ciphertext = vec![0x3c; 72];
    let updated = store
        .update_vendor(
            first_id,
            VendorUpdate {
                name: "OpenRouter shared updated".to_owned(),
                api_base: "https://openrouter.ai/api/v1".to_owned(),
                enabled: false,
                credential_ciphertext: Some(rotated_ciphertext.clone()),
                expected_revision: 1,
            },
        )
        .await
        .unwrap();
    assert_eq!(updated.revision, 2);
    assert!(!updated.enabled);
    assert!(matches!(
        store
            .update_vendor(
                first_id,
                VendorUpdate {
                    name: "stale update".to_owned(),
                    api_base: "https://openrouter.ai/api/v1".to_owned(),
                    enabled: true,
                    credential_ciphertext: None,
                    expected_revision: 1,
                },
            )
            .await,
        Err(StoreError::Conflict)
    ));

    let mut disable_model = model_input("fast", "openai/gpt-4.1-mini");
    disable_model.enabled = false;
    disable_model.expected_revision = Some(1);
    let disabled_model = store
        .upsert_vendor_model(first_id, disable_model)
        .await
        .unwrap();
    assert_eq!(disabled_model.revision, 2);
    assert!(!disabled_model.enabled);
    let route = store.vendor_route("fast").await.unwrap().unwrap();
    assert!(!route.vendor.enabled);
    assert!(!route.model.enabled);
    assert_eq!(route.credential_ciphertext, rotated_ciphertext);
    assert!(
        store
            .all_vendor_routes()
            .await
            .unwrap()
            .iter()
            .any(|item| item.model.alias == "fast" && !item.model.enabled)
    );

    let seeded_id = Uuid::new_v4();
    store
        .seed_vendor(
            vendor_input(seeded_id, "Seeded OpenRouter", vec![0x7b; 56]),
            vec![model_input("seeded", "vendor/seeded-model")],
        )
        .await
        .unwrap();
    store
        .update_vendor(
            seeded_id,
            VendorUpdate {
                name: "Admin renamed OpenRouter".to_owned(),
                api_base: "https://openrouter.ai/api/v1".to_owned(),
                enabled: false,
                credential_ciphertext: None,
                expected_revision: 1,
            },
        )
        .await
        .unwrap();
    let replacement = model_input("seeded-replacement", "vendor/replacement");
    store
        .seed_vendor(
            vendor_input(Uuid::new_v4(), "Seeded OpenRouter", vec![0x11; 56]),
            vec![replacement],
        )
        .await
        .unwrap();
    assert_eq!(
        store
            .vendor_by_name("Seeded OpenRouter")
            .await
            .unwrap()
            .unwrap()
            .id,
        seeded_id,
        "bootstrap lookup must still find a renamed seed"
    );
    let renamed = store.vendor(seeded_id).await.unwrap().unwrap();
    assert_eq!(renamed.name, "Admin renamed OpenRouter");
    assert!(!renamed.enabled);
    let seeded_models = store.vendor_models(seeded_id).await.unwrap();
    assert_eq!(seeded_models.len(), 1);
    assert_eq!(seeded_models[0].alias, "seeded");

    let before_failed_seed: i64 = sqlx::query_scalar("SELECT count(*) FROM vendor_audit_events")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert!(matches!(
        store
            .seed_vendor(
                vendor_input(Uuid::new_v4(), "Must rollback", vec![0x22; 64]),
                vec![model_input("fast", "collision")],
            )
            .await,
        Err(StoreError::Conflict)
    ));
    assert!(
        store
            .vendor_by_name("Must rollback")
            .await
            .unwrap()
            .is_none()
    );
    let after_failed_seed: i64 = sqlx::query_scalar("SELECT count(*) FROM vendor_audit_events")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(after_failed_seed, before_failed_seed);

    let audit_rows: Vec<(String, Option<String>, i64, String)> = sqlx::query_as(
        "SELECT action,model_alias,revision,actor_kind FROM vendor_audit_events WHERE vendor_id=$1 ORDER BY id",
    )
    .bind(first_id)
    .fetch_all(&pool)
    .await
    .unwrap();
    assert!(audit_rows.iter().any(|row| row.0 == "vendor_created"));
    assert!(audit_rows.iter().any(|row| row.0 == "vendor_updated"));
    assert!(
        audit_rows
            .iter()
            .all(|row| row.2 > 0 && row.3 == "installation")
    );
    let audit_json = serde_json::to_string(&audit_rows).unwrap();
    assert!(!audit_json.contains("credential_ciphertext"));

    let reopened_pool = PgPool::connect_with((*pool.connect_options()).clone())
        .await
        .unwrap();
    let reopened = Store::from_pool(reopened_pool.clone());
    assert_eq!(
        reopened
            .vendor_route("fast")
            .await
            .unwrap()
            .unwrap()
            .credential_ciphertext,
        rotated_ciphertext
    );
    assert_eq!(reopened.vendors().await.unwrap().len(), 4);
    reopened_pool.close().await;
}

#[sqlx::test]
#[ignore = "requires PostgreSQL with permission to create test databases"]
async fn supplier_ownership_is_explicit_durable_and_cannot_be_reassigned(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let vendor = store
        .create_vendor(vendor_input(Uuid::new_v4(), "Same name", vec![0xa5; 48]))
        .await
        .unwrap();
    let first = store.create_provider_business("Same name").await.unwrap();
    let second = store
        .create_provider_business("Different business")
        .await
        .unwrap();
    assert!(store.vendor_supplier(vendor.id).await.unwrap().is_none());
    assert!(matches!(
        store
            .associate_vendor_supplier(vendor.id, first, vendor.revision + 1)
            .await,
        Err(StoreError::Conflict)
    ));
    assert!(matches!(
        store
            .associate_vendor_supplier(vendor.id, Uuid::new_v4(), vendor.revision)
            .await,
        Err(StoreError::Conflict)
    ));
    store
        .associate_vendor_supplier(vendor.id, first, vendor.revision)
        .await
        .unwrap();
    store
        .associate_vendor_supplier(vendor.id, first, vendor.revision)
        .await
        .unwrap();
    assert!(matches!(
        store
            .associate_vendor_supplier(vendor.id, second, vendor.revision + 1)
            .await,
        Err(StoreError::Conflict)
    ));
    let reopened = Store::from_pool(pool);
    let ownership = reopened.vendor_supplier(vendor.id).await.unwrap().unwrap();
    assert_eq!(ownership["id"], first.to_string());
    assert_eq!(
        reopened.vendor(vendor.id).await.unwrap().unwrap().revision,
        vendor.revision + 1
    );
    assert_eq!(reopened.provider_businesses().await.unwrap().len(), 2);
    assert_eq!(ownership.as_object().unwrap().len(), 2);
}

#[sqlx::test]
#[ignore = "requires PostgreSQL with permission to create test databases"]
async fn configured_supplier_ownership_and_offer_owner_cannot_diverge(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let vendor = store
        .create_vendor(vendor_input(
            Uuid::new_v4(),
            "Explicit owner",
            vec![0xa5; 48],
        ))
        .await
        .unwrap();
    let first = store
        .create_provider_business("First supplier")
        .await
        .unwrap();
    let second = store
        .create_provider_business("Second supplier")
        .await
        .unwrap();
    store
        .upsert_vendor_model(vendor.id, model_input("ownership-model", "upstream-model"))
        .await
        .unwrap();
    let offer = niu_storage::ProviderOfferInput {
        model_alias: "ownership-model".into(),
        currency: "USD".into(),
        prompt_rate: "1".into(),
        completion_rate: "2".into(),
        expected_revision: None,
    };
    store.publish_provider_offer(first, &offer).await.unwrap();
    assert!(matches!(
        store
            .associate_vendor_supplier(vendor.id, second, vendor.revision)
            .await,
        Err(StoreError::Conflict)
    ));
    assert!(store.vendor_supplier(vendor.id).await.unwrap().is_none());
    store
        .associate_vendor_supplier(vendor.id, first, vendor.revision)
        .await
        .unwrap();
    store
        .upsert_vendor_model(vendor.id, model_input("second-model", "upstream-model"))
        .await
        .unwrap();
    let another = niu_storage::ProviderOfferInput {
        model_alias: "second-model".into(),
        ..offer
    };
    assert!(matches!(
        store.publish_provider_offer(second, &another).await,
        Err(StoreError::Conflict)
    ));
    store.publish_provider_offer(first, &another).await.unwrap();
}

#[sqlx::test]
#[ignore = "requires PostgreSQL with permission to create test databases"]
async fn supplier_configuration_creation_is_atomic_and_opt_in(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let legacy = store
        .create_vendor(vendor_input(Uuid::new_v4(), "Legacy", vec![7; 48]))
        .await
        .unwrap();
    assert!(store.vendor_supplier(legacy.id).await.unwrap().is_none());
    let created = store
        .create_vendor_with_supplier(
            vendor_input(Uuid::new_v4(), "New Supplier", vec![8; 48]),
            true,
        )
        .await
        .unwrap();
    let owner = store.vendor_supplier(created.id).await.unwrap().unwrap();
    assert_eq!(owner["name"], "New Supplier");
    let supplier: Uuid = owner["id"].as_str().unwrap().parse().unwrap();
    assert_eq!(store.supplier_vendors(supplier).await.unwrap().len(), 1);
    let before: i64 = sqlx::query_scalar("SELECT count(*) FROM provider_businesses")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert!(matches!(
        store
            .create_vendor_with_supplier(
                vendor_input(Uuid::new_v4(), "New Supplier", vec![9; 48]),
                true
            )
            .await,
        Err(StoreError::Conflict)
    ));
    let after: i64 = sqlx::query_scalar("SELECT count(*) FROM provider_businesses")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(
        before, after,
        "failed vendor insertion must roll back business creation"
    );
    let audit: i64 = sqlx::query_scalar("SELECT count(*) FROM vendor_audit_events WHERE vendor_id=$1 AND action='supplier_associated'").bind(created.id).fetch_one(&pool).await.unwrap();
    assert_eq!(audit, 1);
}

#[sqlx::test]
#[ignore = "requires PostgreSQL with permission to create test databases"]
async fn supplier_supports_independent_credentials_and_model_subsets(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let first = store
        .create_vendor_with_supplier(
            vendor_input(Uuid::new_v4(), "General key", vec![1; 48]),
            true,
        )
        .await
        .unwrap();
    let owner = store.vendor_supplier(first.id).await.unwrap().unwrap();
    let supplier: Uuid = owner["id"].as_str().unwrap().parse().unwrap();
    let second = store
        .create_vendor_for_supplier(
            vendor_input(Uuid::new_v4(), "Restricted key", vec![2; 48]),
            false,
            Some(supplier),
        )
        .await
        .unwrap();
    for (vendor, alias) in [
        (first.id, "general-a"),
        (first.id, "general-b"),
        (second.id, "restricted-a"),
        (second.id, "restricted-b"),
    ] {
        store
            .upsert_vendor_model(vendor, model_input(alias, alias))
            .await
            .unwrap();
    }
    let reopened = Store::from_pool(pool.clone());
    assert_eq!(reopened.supplier_vendors(supplier).await.unwrap().len(), 2);
    assert_eq!(reopened.vendor_models(first.id).await.unwrap().len(), 2);
    assert_eq!(reopened.vendor_models(second.id).await.unwrap().len(), 2);
    assert_eq!(
        reopened.vendor_supplier(second.id).await.unwrap().unwrap()["id"],
        owner["id"]
    );
    store
        .update_vendor(
            first.id,
            VendorUpdate {
                name: first.name.clone(),
                api_base: first.api_base.clone(),
                enabled: false,
                credential_ciphertext: Some(vec![4; 48]),
                expected_revision: first.revision,
            },
        )
        .await
        .unwrap();
    assert_eq!(
        store.vendor_credential_ciphertext(second.id).await.unwrap(),
        Some(vec![2; 48])
    );
    assert!(store.vendor(second.id).await.unwrap().unwrap().enabled);
    assert_eq!(store.vendor_models(second.id).await.unwrap().len(), 2);
    assert_eq!(store.vendor_models(first.id).await.unwrap().len(), 2);
    let owned = reopened
        .vendors_with_supplier(Some(supplier))
        .await
        .unwrap();
    assert_eq!(owned.len(), 2);
    for configuration in owned {
        assert_eq!(configuration["supplier"], owner);
        assert_eq!(configuration.as_object().unwrap().len(), 9);
        assert_eq!(configuration["owner_funded"], false);
        assert!(configuration.get("credential_ciphertext").is_none());
        assert!(configuration.get("api_key").is_none());
    }
    assert!(
        reopened
            .vendors_with_supplier(Some(Uuid::new_v4()))
            .await
            .unwrap()
            .is_empty()
    );
    let businesses: i64 = sqlx::query_scalar("SELECT count(*) FROM provider_businesses")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(businesses, 1);
    let missing_id = Uuid::new_v4();
    assert!(matches!(
        store
            .create_vendor_for_supplier(
                vendor_input(missing_id, "Missing owner", vec![3; 48]),
                false,
                Some(Uuid::new_v4())
            )
            .await,
        Err(StoreError::Conflict)
    ));
    assert!(store.vendor(missing_id).await.unwrap().is_none());
    assert!(matches!(
        store
            .create_vendor_for_supplier(
                vendor_input(Uuid::new_v4(), "Conflicting owner", vec![3; 48]),
                true,
                Some(supplier)
            )
            .await,
        Err(StoreError::InvalidVendor)
    ));
    assert_eq!(store.supplier_vendors(supplier).await.unwrap().len(), 2);
}
