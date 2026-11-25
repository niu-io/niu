//! Refs #102: published platform prices do not require workspace enrollment.
use niu_metered_cost::{Dimensions, Quantity, Rounding};
use niu_storage::{
    CustomerPricingItemInput, MIGRATOR, MediaRetailSchedule, OperatorAuditActor,
    RetailMediaEnrollmentPublication, RetailPromotionPublication, RetailSchedule,
    RetailStandardPublication, RetailTextEnrollmentPublication, Store, StoreError,
    TextRetailSchedule,
};
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

async fn fixture(pool: &PgPool) -> Store {
    MIGRATOR.run(pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let vendor = Uuid::new_v4();
    sqlx::query("INSERT INTO vendors(id,name,adapter,api_base,credential_ciphertext) VALUES($1,'Default price fixture','openai','https://example.invalid/v1',$2)")
        .bind(vendor).bind(vec![1u8;48]).execute(pool).await.unwrap();
    sqlx::query("INSERT INTO vendor_models(alias,vendor_id,upstream_model,capabilities) VALUES('default-price',$1,'fixture',$2)")
        .bind(vendor).bind(json!({})).execute(pool).await.unwrap();
    store
}

async fn publish(store: &Store, currency: &str, version: &str, schedule: RetailSchedule) -> Value {
    store
        .publish_retail_standard(
            RetailStandardPublication {
                model_alias: "default-price".into(),
                currency: currency.into(),
                schedule,
                expected_version: version.into(),
                idempotency_key: Uuid::new_v4(),
                reason: "Default pricing regression".into(),
            },
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap()
}
fn text(rate: &str) -> RetailSchedule {
    RetailSchedule::Text(TextRetailSchedule {
        prompt_rate: rate.into(),
        completion_rate: rate.into(),
        cached_prompt_rate: None,
        cache_write_prompt_rate: None,
        reasoning_completion_rate: None,
        minimum_charge_nanos: "0".into(),
        request_fee_nanos: "0".into(),
        context_tiers: vec![],
    })
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn standard_price_can_be_published_without_a_note_and_retried(pool: PgPool) {
    let store = fixture(&pool).await;
    let key = Uuid::new_v4();
    let input = RetailStandardPublication {
        model_alias: "default-price".into(),
        currency: "USD".into(),
        schedule: text("1000000000"),
        expected_version: "0".into(),
        idempotency_key: key,
        reason: String::new(),
    };
    let mut body = serde_json::to_value(&input).unwrap();
    body.as_object_mut().unwrap().remove("reason");
    let omitted: RetailStandardPublication = serde_json::from_value(body).unwrap();
    assert_eq!(omitted.reason, "");
    let first = store
        .publish_retail_standard(omitted, OperatorAuditActor::Installation)
        .await
        .unwrap();
    let retry = store
        .publish_retail_standard(input, OperatorAuditActor::Installation)
        .await
        .unwrap();
    assert_eq!(first, retry);
    let (action, note, count): (String, String, i64) = sqlx::query_as("SELECT action,reason,(SELECT count(*) FROM platform_retail_price_changes WHERE idempotency_key=$1) FROM platform_retail_price_changes WHERE idempotency_key=$1")
        .bind(key).fetch_one(&pool).await.unwrap();
    assert_eq!(
        (action.as_str(), note.as_str(), count),
        ("standard_published", "", 1)
    );
    let promotion = RetailPromotionPublication {
        baseline_revision: Uuid::new_v4(),
        customer_organization_id: None,
        schedule: text("1000000000"),
        effective_from: "1".into(),
        effective_until: "2".into(),
        expected_version: "1".into(),
        idempotency_key: Uuid::new_v4(),
        reason: String::new(),
    };
    assert!(matches!(
        store
            .publish_retail_promotion(Uuid::new_v4(), promotion, OperatorAuditActor::Installation)
            .await,
        Err(StoreError::InvalidPrice)
    ));
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn platform_text_defaults_apply_without_enrollment_and_pin_existing_operations(pool: PgPool) {
    let store = fixture(&pool).await;
    let scope = store.default_workspace().await.unwrap();
    publish(&store, "CNY", "0", text("99000000000")).await;
    store.configure_platform_currency("USD").await.unwrap();
    assert!(store.customer_model_prices(scope).await.unwrap().is_empty());
    let price = publish(&store, "USD", "0", text("1000000000")).await;
    let prices = store.customer_model_prices(scope).await.unwrap();
    assert_eq!(prices["default-price"]["currency"], "USD");
    assert_eq!(prices["default-price"]["prompt_rate"], "1000000000");
    let configuration = store
        .retail_text_enrollment(scope, "default-price")
        .await
        .unwrap();
    assert_eq!(configuration["price_id"], price["price_id"]);
    assert_eq!(configuration["version"], "0");
    assert_eq!(configuration["pricing_source"], "platform");
    let operation = store
        .create_operation(scope, "default-price")
        .await
        .unwrap();
    let first = store
        .prepare_attempt(scope, operation, "default-price", "test")
        .await
        .unwrap();
    store
        .bind_customer_tariff(scope, first, "default-price")
        .await
        .unwrap();
    publish(&store, "USD", "1", text("2000000000")).await;
    let retry = store
        .prepare_attempt(scope, operation, "default-price", "test")
        .await
        .unwrap();
    store
        .bind_customer_tariff(scope, retry, "default-price")
        .await
        .unwrap();
    let pinned: Vec<String> = sqlx::query_scalar("SELECT r.prompt_rate::text FROM customer_attempt_tariffs a JOIN customer_tariff_revisions r ON r.id=a.revision_id WHERE a.attempt_id=ANY($1)")
        .bind(vec![first,retry]).fetch_all(&pool).await.unwrap();
    assert_eq!(pinned, vec!["1000000000", "1000000000"]);
    assert_eq!(
        store.customer_model_prices(scope).await.unwrap()["default-price"]["prompt_rate"],
        "2000000000"
    );
    let legacy = niu_storage::ProviderOfferInput {
        model_alias: "default-price".into(),
        currency: "USD".into(),
        prompt_rate: "3000000000".into(),
        completion_rate: "3000000000".into(),
        expected_revision: None,
    };
    assert!(matches!(
        store.publish_customer_tariff(scope, &legacy).await,
        Err(niu_storage::StoreError::Conflict)
    ));
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM retail_text_enrollments")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 0);
    // A deliberate compatibility selection still wins over the new default.
    store
        .publish_retail_text_enrollment(
            scope,
            &RetailTextEnrollmentPublication {
                model_alias: "default-price".into(),
                price_id: None,
                expected_version: "0".into(),
                idempotency_key: Uuid::new_v4(),
                reason: "Keep explicit legacy contract".into(),
            },
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    assert!(store.customer_model_prices(scope).await.unwrap().is_empty());
    assert!(
        store
            .retail_text_enrollment(scope, "default-price")
            .await
            .unwrap()["effective_price"]
            .is_null()
    );
    store.publish_customer_tariff(scope, &legacy).await.unwrap();
    assert_eq!(
        store.customer_model_prices(scope).await.unwrap()["default-price"]["prompt_rate"],
        "3000000000"
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn platform_media_defaults_require_exact_dimensions_and_preserve_explicit_legacy(
    pool: PgPool,
) {
    let store = fixture(&pool).await;
    let scope = store.default_workspace().await.unwrap();
    let dimensions = Dimensions {
        model: "default-price".into(),
        channel: "fixture".into(),
        resolution: "720p".into(),
        reference_video: false,
    };
    let schedule = RetailSchedule::Media(MediaRetailSchedule {
        dimensions: dimensions.clone(),
        meter: "video_tokens".into(),
        decimal_places: 9,
        amount_units: "100".into(),
        per_quantity: Quantity::integer(1),
        minimum_quantity: Quantity::integer(0),
        rounding: Rounding::Up,
    });
    publish(&store, "CNY", "0", schedule.clone()).await;
    store.configure_platform_currency("USD").await.unwrap();
    assert!(
        store
            .retail_media_enrollment_preview(scope, &dimensions, "video_tokens")
            .await
            .unwrap()
            .is_none()
    );
    let price = publish(&store, "USD", "0", schedule).await;
    let selected = store
        .retail_media_enrollment_preview(scope, &dimensions, "video_tokens")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(json!(selected.price_id), price["price_id"]);
    assert_eq!(selected.currency, "USD");
    let configuration = store
        .retail_media_enrollment(scope, &dimensions, "video_tokens")
        .await
        .unwrap();
    assert_eq!(configuration["price_id"], price["price_id"]);
    assert_eq!(configuration["version"], "0");
    let other = Dimensions {
        resolution: "1080p".into(),
        ..dimensions.clone()
    };
    assert!(
        store
            .retail_media_enrollment_preview(scope, &other, "video_tokens")
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        store
            .retail_media_enrollment_preview(scope, &dimensions, "seconds")
            .await
            .unwrap()
            .is_none()
    );
    store
        .publish_retail_media_enrollment(
            scope,
            &RetailMediaEnrollmentPublication {
                dimensions: dimensions.clone(),
                meter: "video_tokens".into(),
                price_id: None,
                expected_version: "0".into(),
                idempotency_key: Uuid::new_v4(),
                reason: "Keep explicit legacy contract".into(),
            },
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    assert!(
        store
            .retail_media_enrollment_preview(scope, &dimensions, "video_tokens")
            .await
            .unwrap()
            .is_none()
    );
}

// Refs #102: price preparation consumes validated configuration, not live supply.
#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn retail_media_choices_validate_schema_and_hide_internal_configuration(pool: PgPool) {
    let store = fixture(&pool).await;
    let mut schema = json!({
        "version": 1,
        "revision": "ark-output-v1",
        "model_alias": "seedance-2.0",
        "upstream_model": "doubao-seedance-2-0",
        "channel": "ark-direct-v1",
        "maximum_body_bytes": 16384,
        "maximum_content_items": 8,
        "inputs": {
            "text": {
                "maximum_items": 2,
                "maximum_bytes": 1024,
                "https": false,
                "data_mime_types": [],
                "roles": [],
                "role_required": false
            },
            "image_url": {
                "maximum_items": 4,
                "maximum_bytes": 512,
                "https": true,
                "data_mime_types": ["image/png"],
                "roles": ["first_frame", "reference_image"],
                "role_required": false
            },
            "video_url": {
                "maximum_items": 2,
                "maximum_bytes": 512,
                "https": true,
                "data_mime_types": [],
                "roles": ["reference_video"],
                "role_required": false
            },
            "audio_url": {
                "maximum_items": 2,
                "maximum_bytes": 512,
                "https": true,
                "data_mime_types": [],
                "roles": ["reference_audio"],
                "role_required": false
            }
        },
        "controls": {
            "resolution": {"kind": "choice", "values": ["720p"], "default": "720p"},
            "ratio": {"kind": "choice", "values": ["16:9"], "default": "16:9"},
            "duration": {"kind": "integer", "minimum": 1, "maximum": 10, "default": 5},
            "frames_per_second": {"kind": "integer", "minimum": 24, "maximum": 60, "default": 24}
        },
        "required_controls": [],
        "exclusive_controls": [],
        "callbacks_qualified": false,
        "output": {
            "specifications": [{"resolution": "720p", "ratio": "16:9", "width": 1280, "height": 720}],
            "estimator": "SeedancePixelsV1",
            "estimator_revision": "pixels-v1"
        }
    });
    schema["model_alias"] = json!("default-price");
    schema["upstream_model"] = json!("fixture");
    sqlx::query("UPDATE vendor_models SET capabilities=$1 WHERE alias='default-price'")
        .bind(json!({"video_schema":schema}))
        .execute(&pool)
        .await
        .unwrap();
    let page = store.registered_retail_models(None, 100).await.unwrap();
    assert_eq!(
        page["data"],
        json!([{ "model_alias":"default-price", "media":{
            "channel":"ark-direct-v1", "resolutions":["720p"], "reference_video":true, "meter":"video_tokens"
        }}])
    );
    assert!(!page.to_string().contains("upstream_model"));
    assert!(!page.to_string().contains("maximum_body_bytes"));
    schema["upstream_model"] = json!("stale-mapping");
    sqlx::query("UPDATE vendor_models SET capabilities=$1 WHERE alias='default-price'")
        .bind(json!({"video_schema":schema}))
        .execute(&pool)
        .await
        .unwrap();
    assert!(store.registered_retail_models(None, 100).await.unwrap()["data"][0]["media"].is_null());
    sqlx::query("UPDATE vendor_models SET capabilities=$1 WHERE alias='default-price'")
        .bind(json!({"video_schema":{"version":99}}))
        .execute(&pool)
        .await
        .unwrap();
    assert!(store.registered_retail_models(None, 100).await.unwrap()["data"][0]["media"].is_null());
    assert!(
        store
            .registered_retail_models(Some("missing-cursor"), 100)
            .await
            .is_err()
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn customer_account_and_pricing_endpoints_apply_replace_and_reset_atomically(pool: PgPool) {
    let store = fixture(&pool).await;
    store.configure_platform_currency("USD").await.unwrap();
    let scope = store.default_workspace().await.unwrap();
    let org_id = scope.organization_id;

    // Single-customer account lookup returns the organization summary; missing org returns None.
    let missing = store
        .platform_customer_account(Uuid::new_v4())
        .await
        .unwrap();
    assert!(missing.is_none());
    let summary = store
        .platform_customer_account(org_id)
        .await
        .unwrap()
        .expect("customer exists");
    assert_eq!(summary["organization_id"], json!(org_id));
    assert!(summary["workspace_count"].as_u64().unwrap() >= 1);
    assert!(summary["workspaces"].is_array());
    assert!(summary["members"].is_array());
    assert!(summary["recent_transactions"].is_array());
    assert_eq!(summary["custom_price_count"], json!(0));

    // Publish a standard price of $2.00 / $2.00 per 1M tokens.
    let published = publish(&store, "USD", "0", text("2000000000")).await;
    let price_id: Uuid = serde_json::from_value(published["price_id"].clone()).unwrap();

    // Initially no customer-specific discount.
    let initial = store
        .platform_customer_pricing(org_id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(initial["items"].as_array().unwrap().len(), 1);
    assert!(initial["items"][0]["active_promotion"].is_null());

    // Set explicit customer price ($1.70 / $1.70) atomically.
    store
        .set_platform_customer_pricing(
            org_id,
            vec![CustomerPricingItemInput {
                price_id,
                schedule: Some(text("1700000000")),
                valid_seconds: Some(86_400 * 365),
                reason: Some("VIP 85%".into()),
            }],
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap()
        .unwrap();
    let after_first = store
        .platform_customer_pricing(org_id)
        .await
        .unwrap()
        .unwrap();
    let first_promo = &after_first["items"][0]["active_promotion"];
    assert_eq!(first_promo["schedule"]["prompt_rate"], "1700000000");
    assert_eq!(first_promo["state"], "within_period");

    // Effective customer price reflects the customer schedule immediately.
    let customer_prices = store.customer_model_prices(scope).await.unwrap();
    assert_eq!(
        customer_prices["default-price"]["prompt_rate"],
        "1700000000"
    );

    // Replace with $1.50 / $1.50 atomically (retires $1.70 and publishes $1.50 in one transaction).
    store
        .set_platform_customer_pricing(
            org_id,
            vec![CustomerPricingItemInput {
                price_id,
                schedule: Some(text("1500000000")),
                valid_seconds: Some(86_400 * 365),
                reason: None,
            }],
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap()
        .unwrap();
    let after_second = store
        .platform_customer_pricing(org_id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        after_second["items"][0]["active_promotion"]["schedule"]["prompt_rate"],
        "1500000000"
    );

    // Reject schedules above standard price.
    assert!(matches!(
        store
            .set_platform_customer_pricing(
                org_id,
                vec![CustomerPricingItemInput {
                    price_id,
                    schedule: Some(text("2500000000")),
                    valid_seconds: None,
                    reason: None,
                }],
                OperatorAuditActor::Installation,
            )
            .await,
        Err(StoreError::InvalidPrice)
    ));

    // Reset back to platform standard pricing via single-model reset.
    store
        .reset_platform_customer_model_pricing(org_id, price_id, OperatorAuditActor::Installation)
        .await
        .unwrap()
        .unwrap();
    let after_reset = store
        .platform_customer_pricing(org_id)
        .await
        .unwrap()
        .unwrap();
    assert!(after_reset["items"][0]["active_promotion"].is_null());
    let customer_prices_after = store.customer_model_prices(scope).await.unwrap();
    assert_eq!(
        customer_prices_after["default-price"]["prompt_rate"],
        "2000000000"
    );
}
