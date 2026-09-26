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
