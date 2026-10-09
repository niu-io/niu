use axum::{Json, Router, http::HeaderMap, routing::post};
use image::{DynamicImage, ImageFormat};
use niu_media::image_detector::{Config, Consent, Runtime};
use niu_storage::{ImageApprovalRecord, MIGRATOR, Store, StoreError};
use sqlx::PgPool;
use std::io::Cursor;

#[sqlx::test]
#[ignore = "requires PostgreSQL and an isolated NIU_IMAGE_STORAGE_TEST_KEY"]
async fn image_approval_receipts_are_immutable_scoped_and_policy_current(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let root = store.default_workspace().await.unwrap();
    let scope = store
        .create_project(root.organization_id, "Image receipt customer")
        .await
        .unwrap();
    let foreign = store
        .create_project(root.organization_id, "Other image workspace")
        .await
        .unwrap();
    let key = store
        .issue_key(scope, "Image receipt key", &["*".into()], 3600)
        .await
        .unwrap();
    let other_key = store
        .issue_key(foreign, "Other image key", &["*".into()], 3600)
        .await
        .unwrap();
    let principal = store.authenticate(&key.token).await.unwrap();
    let other = store.authenticate(&other_key.token).await.unwrap();
    let snapshot = store
        .guardrail_snapshot(scope, key.id)
        .await
        .unwrap()
        .unwrap();
    store
        .authorize_image_inspection(&principal, &snapshot)
        .await
        .unwrap();
    let secret =
        std::env::var("NIU_IMAGE_STORAGE_TEST_KEY").expect("isolated fixture credential required");
    let secret_check = secret.clone();
    let server=Router::new().route("/inspect",post(move |headers:HeaderMap,Json(body):Json<serde_json::Value>| {
        let secret=secret_check.clone();async move {
            assert!(headers["authorization"]==format!("Bearer {secret}"),"unexpected detector authorization");
            Json(serde_json::json!({"schema_version":2,"detector_revision":body["detector_revision"],"content_sha256":body["content_sha256"],"verdict":"clear"}))
        }
    }));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let task = tokio::spawn(async move { axum::serve(listener, server).await.unwrap() });
    let config = Config {
        endpoint: format!("http://{address}/inspect"),
        api_key_env: "NIU_IMAGE_STORAGE_TEST_KEY".into(),
        detector_revision: "fixture-v2".into(),
        recipient: "Fixture recipient".into(),
        region: "Fixture".into(),
        retention: "None declared".into(),
        authorized_workspaces: vec![scope.project_id.to_string(), foreign.project_id.to_string()],
        declared_unmetered: true,
        timeout_ms: 1000,
        maximum_encoded_bytes: 4096,
        maximum_width: 32,
        maximum_height: 32,
        maximum_decoded_bytes: 4096,
        concurrency: 1,
    };
    let runtime = Runtime::new(config).unwrap();
    let consent = Consent {
        configuration_fingerprint: runtime.fingerprint().into(),
        consent_to_image_processing: true,
    };
    let mut bytes = Cursor::new(Vec::new());
    DynamicImage::new_rgb8(2, 2)
        .write_to(&mut bytes, ImageFormat::Png)
        .unwrap();
    let reference = niu_media::image_input::decode(
        &bytes.into_inner(),
        "image/png",
        niu_media::image_input::DecodeLimits {
            maximum_encoded_bytes: 4096,
            maximum_width: 32,
            maximum_height: 32,
            maximum_decoded_bytes: 4096,
        },
    )
    .unwrap()
    .inline_reference(4096)
    .unwrap();
    let approval = runtime
        .inspect_inline(&scope.project_id.to_string(), &consent, &reference)
        .await
        .unwrap();
    let record = || ImageApprovalRecord {
        detector_name: "fixture-image",
        content_position: 1,
        elapsed_ms: 10,
        runtime: &runtime,
        consent: &consent,
        approval: &approval,
    };
    let id = store
        .record_image_processing_approval(&principal, &snapshot, record())
        .await
        .unwrap();
    let source_id = uuid::Uuid::new_v4();
    let source_input = || niu_storage::InspectedImageSourceInput {
        id: source_id,
        approval_id: id,
        valid_for_seconds: 60,
        runtime: &runtime,
        consent: &consent,
        approval: &approval,
        additional_approvals: &[],
    };
    let mut oversized_envelope = source_input();
    oversized_envelope.id = uuid::Uuid::new_v4();
    assert!(matches!(
        store
            .save_inspected_image_source(&principal, &snapshot, oversized_envelope, |bytes, _| Ok(
                vec![42; bytes.len() + 129]
            ))
            .await,
        Err(StoreError::InvalidObservation)
    ));
    let mut incorrect = source_input();
    incorrect.approval_id = uuid::Uuid::new_v4();
    assert!(
        store
            .save_inspected_image_source(&principal, &snapshot, incorrect, |_, _| panic!(
                "missing receipt must not seal"
            ))
            .await
            .is_err()
    );
    store
        .save_inspected_image_source(&principal, &snapshot, source_input(), |bytes, _| {
            let mut encrypted = vec![42; 28];
            encrypted.extend(bytes.iter().map(|b| b ^ 42));
            Ok(encrypted)
        })
        .await
        .unwrap();
    assert!(matches!(
        store
            .save_inspected_image_source(&principal, &snapshot, source_input(), |_, _| Ok(vec![
                42;
                28
            ]))
            .await,
        Err(StoreError::Conflict)
    ));
    let expiring_id = uuid::Uuid::new_v4();
    let mut expiring = source_input();
    expiring.id = expiring_id;
    expiring.valid_for_seconds = 1;
    store
        .save_inspected_image_source(&principal, &snapshot, expiring, |_, _| Ok(vec![42; 28]))
        .await
        .unwrap();
    assert!(
        store
            .inspected_image_source(&principal, &snapshot, expiring_id)
            .await
            .unwrap()
            .is_some()
    );
    tokio::time::sleep(std::time::Duration::from_millis(1100)).await;
    assert!(
        store
            .inspected_image_source(&principal, &snapshot, expiring_id)
            .await
            .unwrap()
            .is_none()
    );
    let mut held = pool.begin().await.unwrap();
    sqlx::query("SELECT id FROM inspected_image_sources WHERE id=$1 FOR UPDATE")
        .bind(expiring_id)
        .execute(&mut *held)
        .await
        .unwrap();
    assert_eq!(
        store.purge_expired_inspected_image_sources().await.unwrap(),
        0
    );
    held.rollback().await.unwrap();
    assert_eq!(
        store.purge_expired_inspected_image_sources().await.unwrap(),
        1
    );
    assert_eq!(
        store.purge_expired_inspected_image_sources().await.unwrap(),
        0
    );
    let removed: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM inspected_image_source_content WHERE source_id=$1",
    )
    .bind(expiring_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(removed, 0);
    let tombstone: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM inspected_image_source_erasures WHERE source_id=$1",
    )
    .bind(expiring_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(tombstone, 1);
    assert!(
        store
            .inspected_image_source(&principal, &snapshot, source_id)
            .await
            .unwrap()
            .is_some()
    );
    // Seed expired encrypted fixtures without waiting for eighteen independent timers.
    for _ in 0..18 {
        let expired = uuid::Uuid::new_v4();
        sqlx::query("INSERT INTO inspected_image_sources(id,approval_id,organization_id,project_id,key_id,content_sha256,content_type,byte_length,created_at,expires_at) SELECT $1,approval_id,organization_id,project_id,key_id,content_sha256,content_type,byte_length,clock_timestamp()-interval '2 minutes',clock_timestamp()-interval '1 minute' FROM inspected_image_sources WHERE id=$2")
            .bind(expired).bind(source_id).execute(&pool).await.unwrap();
        sqlx::query(
            "INSERT INTO inspected_image_source_content(source_id,ciphertext) VALUES($1,$2)",
        )
        .bind(expired)
        .bind(vec![42u8; 29])
        .execute(&pool)
        .await
        .unwrap();
    }
    let reopened_cleanup = Store::from_pool(pool.clone());
    assert_eq!(
        reopened_cleanup
            .purge_expired_inspected_image_sources()
            .await
            .unwrap(),
        16
    );
    assert_eq!(
        reopened_cleanup
            .purge_expired_inspected_image_sources()
            .await
            .unwrap(),
        2
    );
    assert_eq!(
        reopened_cleanup
            .purge_expired_inspected_image_sources()
            .await
            .unwrap(),
        0
    );
    let policy_source_id = uuid::Uuid::new_v4();
    let mut policy_source = source_input();
    policy_source.id = policy_source_id;
    store
        .save_inspected_image_source(&principal, &snapshot, policy_source, |_, _| {
            Ok(vec![42; 28])
        })
        .await
        .unwrap();
    let reopened = Store::from_pool(pool.clone());
    let saved = reopened
        .inspected_image_source(&principal, &snapshot, source_id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(saved.content_type, "image/png");
    assert_eq!(saved.content_sha256, approval.content_sha256());
    assert_eq!(saved.byte_length as usize, saved.ciphertext.len() - 28);
    let foreign_snapshot = store
        .guardrail_snapshot(foreign, other_key.id)
        .await
        .unwrap()
        .unwrap();
    assert!(
        store
            .inspected_image_source(&other, &foreign_snapshot, source_id)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        !store
            .erase_inspected_image_source(&other, source_id)
            .await
            .unwrap()
    );
    assert!(
        sqlx::query("UPDATE inspected_image_sources SET content_type='image/jpeg' WHERE id=$1")
            .bind(source_id)
            .execute(&pool)
            .await
            .is_err()
    );
    assert!(
        sqlx::query("UPDATE inspected_image_source_content SET ciphertext=$2 WHERE source_id=$1")
            .bind(source_id)
            .bind(vec![0u8; 28])
            .execute(&pool)
            .await
            .is_err()
    );
    assert!(
        store
            .erase_inspected_image_source(&principal, source_id)
            .await
            .unwrap()
    );
    assert!(
        !store
            .erase_inspected_image_source(&principal, source_id)
            .await
            .unwrap()
    );
    assert!(
        reopened
            .inspected_image_source(&principal, &snapshot, source_id)
            .await
            .unwrap()
            .is_none()
    );
    let metadata: i64 =
        sqlx::query_scalar("SELECT count(*) FROM inspected_image_sources WHERE id=$1")
            .bind(source_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(metadata, 1);
    let stored: serde_json::Value =
        sqlx::query_scalar("SELECT to_jsonb(r) FROM image_processing_approvals r WHERE id=$1")
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(stored["key_id"], key.id.to_string());
    assert_eq!(stored["content_sha256"], approval.content_sha256());
    assert_eq!(stored["configuration_fingerprint"], runtime.fingerprint());
    assert_eq!(stored["content_position"], 1);
    assert_eq!(stored["elapsed_ms"], 10);
    let serialized = stored.to_string();
    for private in [
        &reference,
        &secret,
        &key.token,
        "127.0.0.1",
        "NIU_IMAGE_STORAGE_TEST_KEY",
    ] {
        assert!(!serialized.contains(private));
    }
    for statement in [
        "UPDATE image_processing_approvals SET elapsed_ms=11 WHERE id=$1",
        "DELETE FROM image_processing_approvals WHERE id=$1",
    ] {
        assert!(
            sqlx::query(statement)
                .bind(id)
                .execute(&pool)
                .await
                .is_err()
        );
    }
    let foreign_snapshot = store
        .guardrail_snapshot(foreign, other_key.id)
        .await
        .unwrap()
        .unwrap();
    assert!(matches!(
        store
            .record_image_processing_approval(&other, &foreign_snapshot, record())
            .await,
        Err(StoreError::Unauthorized)
    ));
    let mut invalid = record();
    invalid.content_position = 256;
    assert!(matches!(
        store
            .record_image_processing_approval(&principal, &snapshot, invalid)
            .await,
        Err(StoreError::InvalidObservation)
    ));
    let withdrawn = Consent {
        consent_to_image_processing: false,
        ..consent.clone()
    };
    let mut withdrawn_record = record();
    withdrawn_record.consent = &withdrawn;
    assert!(matches!(
        store
            .record_image_processing_approval(&principal, &snapshot, withdrawn_record)
            .await,
        Err(StoreError::Unauthorized)
    ));
    store.activate_workspace_guardrail(scope,0,&serde_json::json!({"schema_version":1,"name":"New policy","models":{"mode":"inherit"},"providers":{"mode":"inherit"}})).await.unwrap();
    assert!(matches!(
        store
            .inspected_image_source(&principal, &snapshot, policy_source_id)
            .await,
        Err(StoreError::Conflict)
    ));
    let changed_snapshot = store
        .guardrail_snapshot(scope, key.id)
        .await
        .unwrap()
        .unwrap();
    assert!(
        store
            .inspected_image_source(&principal, &changed_snapshot, policy_source_id)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        store
            .erase_inspected_image_source(&principal, policy_source_id)
            .await
            .unwrap()
    );
    assert!(matches!(
        store
            .authorize_image_inspection(&principal, &snapshot)
            .await,
        Err(StoreError::Conflict)
    ));
    assert!(matches!(
        store
            .record_image_processing_approval(&principal, &snapshot, record())
            .await,
        Err(StoreError::Conflict)
    ));
    let current = store
        .guardrail_snapshot(scope, key.id)
        .await
        .unwrap()
        .unwrap();
    store.revoke_key(scope, key.id).await.unwrap();
    assert!(matches!(
        store.authorize_image_inspection(&principal, &current).await,
        Err(StoreError::Unauthorized)
    ));
    assert!(matches!(
        store
            .record_image_processing_approval(&principal, &current, record())
            .await,
        Err(StoreError::Unauthorized)
    ));
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM image_processing_approvals")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 1);
    for table in [
        "attempts",
        "customer_balance_reservations",
        "customer_balance_entries",
    ] {
        let count: i64 = sqlx::query_scalar(&format!("SELECT count(*) FROM {table}"))
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(
            count, 0,
            "approval receipts never create execution or charges"
        );
    }
    drop(approval);
    let binding_key = store
        .issue_key(scope, "Request image key", &["*".into()], 3600)
        .await
        .unwrap();
    let binding_principal = store.authenticate(&binding_key.token).await.unwrap();
    store.activate_workspace_guardrail(scope,1,&serde_json::json!({"schema_version":1,"name":"Required image processors","models":{"mode":"inherit"},"providers":{"mode":"inherit"},"image_detectors":[
        {"detector":"fixture-image","configuration_fingerprint":runtime.fingerprint(),"consent_to_image_processing":true},
        {"detector":"required-other","configuration_fingerprint":runtime.fingerprint(),"consent_to_image_processing":true}
    ]})).await.unwrap();
    let binding_snapshot = store
        .guardrail_snapshot(scope, binding_key.id)
        .await
        .unwrap()
        .unwrap();
    let approval = runtime
        .inspect_inline(&scope.project_id.to_string(), &consent, &reference)
        .await
        .unwrap();
    let receipt = store
        .record_image_processing_approval(
            &binding_principal,
            &binding_snapshot,
            ImageApprovalRecord {
                detector_name: "fixture-image",
                content_position: 1,
                elapsed_ms: 10,
                runtime: &runtime,
                consent: &consent,
                approval: &approval,
            },
        )
        .await
        .unwrap();
    let second_receipt = store
        .record_image_processing_approval(
            &binding_principal,
            &binding_snapshot,
            ImageApprovalRecord {
                detector_name: "required-other",
                content_position: 1,
                elapsed_ms: 10,
                runtime: &runtime,
                consent: &consent,
                approval: &approval,
            },
        )
        .await
        .unwrap();
    let vendor = store
        .create_vendor(niu_storage::VendorInput {
            id: uuid::Uuid::new_v4(),
            name: "Image binding route".into(),
            adapter: "openai".into(),
            api_base: "https://fixture.example/v1".into(),
            enabled: true,
            credential_ciphertext: vec![17; 48],
        })
        .await
        .unwrap();
    let schema:niu_media::VideoSchema=serde_json::from_value(serde_json::json!({"version":1,"revision":"image-schema-1","model_alias":"fixture-image-video","upstream_model":"upstream-image-video","channel":"fixture-channel","maximum_body_bytes":4096,"maximum_content_items":3,"inputs":{"text":{"maximum_items":1,"maximum_bytes":256,"https":false,"data_mime_types":[],"roles":[],"role_required":false},"image_url":{"maximum_items":2,"maximum_bytes":4096,"https":false,"data_mime_types":["image/png"],"roles":[],"role_required":false}},"controls":{},"required_controls":[],"exclusive_controls":[],"callbacks_qualified":false})).unwrap();
    store
        .upsert_vendor_model(
            vendor.id,
            niu_storage::VendorModelInput {
                alias: schema.model_alias.clone(),
                upstream_model: schema.upstream_model.clone(),
                public_catalog: false,
                enabled: true,
                capabilities: serde_json::json!({"video_schema":schema}),
                pricing: None,
                expected_revision: None,
            },
        )
        .await
        .unwrap();
    let body = serde_json::json!({"model":"fixture-image-video","content":[{"type":"text","text":"Fixture request"},{"type":"image_url","image_url":{"url":reference}}]});
    let validate = |body: &serde_json::Value| {
        schema
            .validate_request(&serde_json::to_vec(body).unwrap())
            .unwrap()
    };
    let request = validate(&body);
    let entries = [
        niu_storage::ImageRequestApproval {
            receipt_id: receipt,
            runtime: &runtime,
            consent: &consent,
            approval: &approval,
        },
        niu_storage::ImageRequestApproval {
            receipt_id: second_receipt,
            runtime: &runtime,
            consent: &consent,
            approval: &approval,
        },
    ];
    let attempt = prepare_image_attempt(&store, scope, binding_key.id, &binding_snapshot).await;
    assert!(
        matches!(
            store.mark_dispatched(&binding_principal, attempt).await,
            Err(StoreError::Conflict)
        ),
        "ordinary dispatch cannot bypass required image receipts"
    );
    assert!(
        matches!(
            store
                .mark_image_dispatched(
                    &binding_principal,
                    attempt,
                    &binding_snapshot,
                    &request,
                    &entries
                )
                .await,
            Err(StoreError::Conflict)
        ),
        "dispatch recheck must not create a missing binding"
    );

    assert!(
        matches!(
            store
                .bind_image_request(
                    &binding_principal,
                    attempt,
                    &binding_snapshot,
                    &request,
                    &entries[..1]
                )
                .await,
            Err(StoreError::Conflict)
        ),
        "each required detector must cover each image"
    );
    let bindings: i64 = sqlx::query_scalar("SELECT count(*) FROM image_request_bindings")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(
        bindings, 0,
        "partial detector coverage must leave no binding"
    );
    store
        .bind_image_request(
            &binding_principal,
            attempt,
            &binding_snapshot,
            &request,
            &entries,
        )
        .await
        .unwrap();
    let before: serde_json::Value =
        sqlx::query_scalar("SELECT to_jsonb(r) FROM image_request_bindings r WHERE attempt_id=$1")
            .bind(attempt)
            .fetch_one(&pool)
            .await
            .unwrap();
    store
        .bind_image_request(
            &binding_principal,
            attempt,
            &binding_snapshot,
            &request,
            &entries,
        )
        .await
        .unwrap();
    let after: serde_json::Value =
        sqlx::query_scalar("SELECT to_jsonb(r) FROM image_request_bindings r WHERE attempt_id=$1")
            .bind(attempt)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(before, after);
    assert!(!after.to_string().contains(&reference));
    let mut changed = body.clone();
    changed["content"][0]["text"] = "Changed request".into();
    assert!(matches!(
        store
            .bind_image_request(
                &binding_principal,
                attempt,
                &binding_snapshot,
                &validate(&changed),
                &entries
            )
            .await,
        Err(StoreError::Conflict)
    ));
    let mut moved = body.clone();
    moved["content"].as_array_mut().unwrap().swap(0, 1);
    assert!(matches!(
        store
            .bind_image_request(
                &binding_principal,
                attempt,
                &binding_snapshot,
                &validate(&moved),
                &entries
            )
            .await,
        Err(StoreError::Conflict)
    ));
    let mut missing = body.clone();
    missing["content"]
        .as_array_mut()
        .unwrap()
        .push(body["content"][1].clone());
    assert!(matches!(
        store
            .bind_image_request(
                &binding_principal,
                attempt,
                &binding_snapshot,
                &validate(&missing),
                &entries
            )
            .await,
        Err(StoreError::Conflict)
    ));
    assert!(
        matches!(
            store
                .mark_image_dispatched(
                    &binding_principal,
                    attempt,
                    &binding_snapshot,
                    &validate(&changed),
                    &entries
                )
                .await,
            Err(StoreError::Conflict)
        ),
        "changed wire content cannot commit image dispatch"
    );
    let second_attempt =
        prepare_image_attempt(&store, scope, binding_key.id, &binding_snapshot).await;
    assert!(matches!(
        store
            .bind_image_request(
                &binding_principal,
                second_attempt,
                &binding_snapshot,
                &request,
                &entries
            )
            .await,
        Err(StoreError::Conflict)
    ));
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM image_request_bindings")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(
        count, 1,
        "failed reuse must roll back the entire request binding"
    );
    for query in [
        "UPDATE image_request_bindings SET body_sha256=repeat('a',64) WHERE attempt_id=$1",
        "DELETE FROM image_request_bindings WHERE attempt_id=$1",
        "DELETE FROM image_request_approval_bindings WHERE attempt_id=$1",
    ] {
        assert!(
            sqlx::query(query)
                .bind(attempt)
                .execute(&pool)
                .await
                .is_err()
        );
    }
    store
        .mark_image_dispatched(
            &binding_principal,
            attempt,
            &binding_snapshot,
            &request,
            &entries,
        )
        .await
        .unwrap();
    assert!(
        matches!(
            store
                .mark_image_dispatched(
                    &binding_principal,
                    attempt,
                    &binding_snapshot,
                    &request,
                    &entries
                )
                .await,
            Err(StoreError::Conflict)
        ),
        "dispatch intent cannot be committed twice"
    );
    store.activate_workspace_guardrail(scope,2,&serde_json::json!({"schema_version":1,"name":"Changed image policy","models":{"mode":"inherit"},"providers":{"mode":"inherit"}})).await.unwrap();
    assert!(matches!(
        store
            .bind_image_request(
                &binding_principal,
                attempt,
                &binding_snapshot,
                &request,
                &entries
            )
            .await,
        Err(StoreError::Conflict)
    ));
    let newer = store
        .guardrail_snapshot(scope, binding_key.id)
        .await
        .unwrap()
        .unwrap();
    assert!(matches!(
        store
            .bind_image_request(&binding_principal, attempt, &newer, &request, &entries)
            .await,
        Err(StoreError::Conflict)
    ));
    store.revoke_key(scope, binding_key.id).await.unwrap();
    assert!(matches!(
        store
            .bind_image_request(&binding_principal, attempt, &newer, &request, &entries)
            .await,
        Err(StoreError::Unauthorized)
    ));
    let sent: i64 =
        sqlx::query_scalar("SELECT count(*) FROM attempts WHERE execution='may_have_executed'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(sent, 1);
    for table in ["customer_balance_reservations", "customer_balance_entries"] {
        let count: i64 = sqlx::query_scalar(&format!("SELECT count(*) FROM {table}"))
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 0);
    }
    let record = || ImageApprovalRecord {
        detector_name: "fixture-image",
        content_position: 1,
        elapsed_ms: 10,
        runtime: &runtime,
        consent: &consent,
        approval: &approval,
    };
    let source_key = store
        .issue_key(scope, "Source coverage key", &["*".into()], 3600)
        .await
        .unwrap();
    let source_principal = store.authenticate(&source_key.token).await.unwrap();
    store.activate_workspace_guardrail(scope,3,&serde_json::json!({
        "schema_version":1,"name":"Source detector coverage",
        "models":{"mode":"inherit"},"providers":{"mode":"inherit"},
        "image_detectors":[
            {"detector":"fixture-image","configuration_fingerprint":runtime.fingerprint(),"consent_to_image_processing":true},
            {"detector":"second-image","configuration_fingerprint":runtime.fingerprint(),"consent_to_image_processing":true}
        ]
    })).await.unwrap();
    let source_snapshot = store
        .guardrail_snapshot(scope, source_key.id)
        .await
        .unwrap()
        .unwrap();
    let first = store
        .record_image_processing_approval(&source_principal, &source_snapshot, record())
        .await
        .unwrap();
    let mut second_record = record();
    second_record.detector_name = "second-image";
    let second = store
        .record_image_processing_approval(&source_principal, &source_snapshot, second_record)
        .await
        .unwrap();
    let covered_id = uuid::Uuid::new_v4();
    let covered_input = || niu_storage::InspectedImageSourceInput {
        id: covered_id,
        approval_id: first,
        valid_for_seconds: 60,
        runtime: &runtime,
        consent: &consent,
        approval: record().approval,
        additional_approvals: &[],
    };
    assert!(matches!(
        store
            .save_inspected_image_source(
                &source_principal,
                &source_snapshot,
                covered_input(),
                |_, _| panic!("incomplete coverage must not seal")
            )
            .await,
        Err(StoreError::Conflict)
    ));
    let duplicate = [niu_storage::ImageRequestApproval {
        receipt_id: first,
        runtime: &runtime,
        consent: &consent,
        approval: record().approval,
    }];
    let mut duplicate_input = covered_input();
    duplicate_input.additional_approvals = &duplicate;
    assert!(matches!(
        store
            .save_inspected_image_source(
                &source_principal,
                &source_snapshot,
                duplicate_input,
                |_, _| panic!("duplicate approval must not seal")
            )
            .await,
        Err(StoreError::Conflict)
    ));
    let extra = [niu_storage::ImageRequestApproval {
        receipt_id: second,
        runtime: &runtime,
        consent: &consent,
        approval: record().approval,
    }];
    let mut complete_input = covered_input();
    complete_input.additional_approvals = &extra;
    store
        .save_inspected_image_source(
            &source_principal,
            &source_snapshot,
            complete_input,
            |bytes, _| {
                let mut sealed = vec![42; 29];
                sealed.extend_from_slice(bytes);
                Ok(sealed)
            },
        )
        .await
        .unwrap();
    let proof_count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM inspected_image_source_approvals WHERE source_id=$1",
    )
    .bind(covered_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(proof_count, 2);
    assert!(
        store
            .inspected_image_source(&source_principal, &source_snapshot, covered_id)
            .await
            .unwrap()
            .is_some()
    );
    assert!(
        sqlx::query("DELETE FROM inspected_image_source_approvals WHERE source_id=$1")
            .bind(covered_id)
            .execute(&pool)
            .await
            .is_err()
    );
    let vendor = uuid::Uuid::new_v4();
    store
        .create_vendor(niu_storage::VendorInput {
            id: vendor,
            name: "Ingestion fixture".into(),
            adapter: "openai".into(),
            api_base: "https://ark.cn-beijing.volcengineapi.com/api/v3".into(),
            enabled: false,
            credential_ciphertext: vec![1; 48],
        })
        .await
        .unwrap();
    store
        .save_asset_management_credential(vendor, 0, "original-project", &[1; 48])
        .await
        .unwrap();
    let qualification = || niu_storage::AssetOperationQualification {
        vendor_id: vendor,
        vendor_revision: 1,
        credential_revision: 1,
        rights_sha256: [1; 32],
        protocol_sha256: [2; 32],
        data_handling_sha256: [3; 32],
        free_operation_sha256: [4; 32],
        valid_for_seconds: 60,
    };
    let group_grant = store
        .qualify_asset_group_creation(
            scope,
            qualification(),
            niu_storage::OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let ingestion_grant = store
        .qualify_asset_creation(
            scope,
            qualification(),
            niu_storage::OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let group_body =
        niu_media::asset_group::OrdinaryAssetGroupCreate::new("Ingestion destination".into(), None)
            .unwrap();
    let group_intent = store
        .prepare_asset_group_create(scope, uuid::Uuid::new_v4(), vendor, 1, &group_body)
        .await
        .unwrap();
    assert!(
        store
            .claim_asset_group_create(scope, group_intent.id)
            .await
            .unwrap()
    );
    assert!(
        store
            .record_asset_group_dispatch_outcome(
                scope,
                group_intent.id,
                Some("group-ingestion"),
                None,
                1
            )
            .await
            .unwrap()
    );
    let consent_id = uuid::Uuid::new_v4();
    let ingestion = || niu_storage::AssetImageIngestionConsent {
        id: consent_id,
        source_id: covered_id,
        group_intent_id: group_intent.id,
        authorization_id: ingestion_grant,
        valid_for_seconds: 900,
        confirm_ingestion: true,
    };
    let mut missing_confirmation = ingestion();
    missing_confirmation.confirm_ingestion = false;
    assert!(matches!(
        store
            .consent_asset_image_ingestion(
                &source_principal,
                &source_snapshot,
                missing_confirmation
            )
            .await,
        Err(StoreError::InvalidObservation)
    ));
    let mut wrong_grant = ingestion();
    wrong_grant.authorization_id = group_grant;
    assert!(matches!(
        store
            .consent_asset_image_ingestion(&source_principal, &source_snapshot, wrong_grant)
            .await,
        Err(StoreError::Conflict)
    ));
    assert!(matches!(
        store
            .consent_asset_image_ingestion(&other, &foreign_snapshot, ingestion())
            .await,
        Err(StoreError::Conflict)
    ));
    let mut erased_source = ingestion();
    erased_source.source_id = source_id;
    assert!(matches!(
        store
            .consent_asset_image_ingestion(&source_principal, &source_snapshot, erased_source)
            .await,
        Err(StoreError::Conflict)
    ));
    assert!(
        store
            .consent_asset_image_ingestion(&source_principal, &source_snapshot, ingestion())
            .await
            .unwrap()
    );
    assert!(
        !Store::from_pool(pool.clone())
            .consent_asset_image_ingestion(&source_principal, &source_snapshot, ingestion())
            .await
            .unwrap()
    );
    let capped:bool=sqlx::query_scalar("SELECT d.expires_at<=s.expires_at AND d.expires_at<=a.expires_at FROM asset_image_ingestion_consents d JOIN inspected_image_sources s ON s.id=d.source_id JOIN asset_operation_authorizations a ON a.id=d.authorization_id WHERE d.id=$1").bind(consent_id).fetch_one(&pool).await.unwrap();
    assert!(capped);
    let mut retarget = ingestion();
    retarget.valid_for_seconds = 60;
    assert!(matches!(
        store
            .consent_asset_image_ingestion(&source_principal, &source_snapshot, retarget)
            .await,
        Err(StoreError::Conflict)
    ));
    assert!(sqlx::query("UPDATE asset_image_ingestion_consents SET expires_at=clock_timestamp()+interval '10 minutes' WHERE id=$1").bind(consent_id).execute(&pool).await.is_err());
    assert!(
        !store
            .revoke_asset_image_ingestion_consent(&other, consent_id)
            .await
            .unwrap()
    );
    assert!(
        store
            .revoke_asset_image_ingestion_consent(&source_principal, consent_id)
            .await
            .unwrap()
    );
    assert!(
        !store
            .revoke_asset_image_ingestion_consent(&source_principal, consent_id)
            .await
            .unwrap()
    );
    assert!(matches!(
        store
            .consent_asset_image_ingestion(&source_principal, &source_snapshot, ingestion())
            .await,
        Err(StoreError::Conflict)
    ));
    let detectors = [("fixture-image", &runtime), ("second-image", &runtime)];
    // Backdate new fixture claims to simulate a process lost after commit.
    let mut abandoned = Vec::new();
    for _ in 0..18 {
        let id = uuid::Uuid::new_v4();
        let mut consent = ingestion();
        consent.id = id;
        store
            .consent_asset_image_ingestion(&source_principal, &source_snapshot, consent)
            .await
            .unwrap();
        sqlx::query("INSERT INTO asset_image_ingestion_claims(consent_id,created_at) VALUES($1,clock_timestamp()-interval '61 seconds')")
            .bind(id).execute(&pool).await.unwrap();
        abandoned.push(id);
    }
    let reopened = Store::from_pool(pool.clone());
    assert_eq!(
        reopened
            .recover_interrupted_asset_image_ingestions()
            .await
            .unwrap(),
        16
    );
    assert_eq!(
        reopened
            .recover_interrupted_asset_image_ingestions()
            .await
            .unwrap(),
        2
    );
    assert_eq!(
        reopened
            .recover_interrupted_asset_image_ingestions()
            .await
            .unwrap(),
        0
    );
    for id in abandoned {
        let outcome: (String,String,i64) = sqlx::query_as("SELECT outcome,reason,duration_ms FROM asset_image_ingestion_outcomes WHERE consent_id=$1")
            .bind(id).fetch_one(&pool).await.unwrap();
        assert_eq!(outcome.0, "uncertain");
        assert_eq!(outcome.1, "timeout");
        assert!(outcome.2 >= 61000);
        assert!(
            reopened
                .claim_asset_image_ingestion(
                    &source_principal,
                    &source_snapshot,
                    id,
                    &detectors,
                    |_, _| panic!("recovery never authorizes replay")
                )
                .await
                .unwrap()
                .is_none()
        );
        assert!(
            !reopened
                .finish_asset_image_ingestion(
                    &source_principal,
                    id,
                    niu_storage::AssetImageIngestionOutcome::Accepted {
                        upstream_asset_id: "asset-late"
                    },
                    1
                )
                .await
                .unwrap()
        );
    }
    let dispatch_id = uuid::Uuid::new_v4();
    let mut dispatch_consent = ingestion();
    dispatch_consent.id = dispatch_id;
    store
        .consent_asset_image_ingestion(&source_principal, &source_snapshot, dispatch_consent)
        .await
        .unwrap();
    assert!(
        store
            .claim_asset_image_ingestion(
                &other,
                &foreign_snapshot,
                dispatch_id,
                &detectors,
                |_, _| panic!("foreign scope must not decrypt")
            )
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        store
            .claim_asset_image_ingestion(
                &source_principal,
                &source_snapshot,
                consent_id,
                &detectors,
                |_, _| panic!("revoked consent must not decrypt")
            )
            .await
            .unwrap()
            .is_none()
    );
    assert!(matches!(
        store
            .claim_asset_image_ingestion(
                &source_principal,
                &source_snapshot,
                dispatch_id,
                &detectors,
                |_, _| Ok(vec![1])
            )
            .await,
        Err(StoreError::InvalidObservation)
    ));
    assert!(
        store
            .claim_asset_image_ingestion(
                &source_principal,
                &source_snapshot,
                dispatch_id,
                &[],
                |_, _| panic!("missing detector must not decrypt")
            )
            .await
            .unwrap()
            .is_none()
    );
    let incomplete_detectors = [("fixture-image", &runtime)];
    assert!(
        store
            .claim_asset_image_ingestion(
                &source_principal,
                &source_snapshot,
                dispatch_id,
                &incomplete_detectors,
                |_, _| panic!("all source detectors are required")
            )
            .await
            .unwrap()
            .is_none()
    );
    let open = |_: &[u8], ciphertext: &[u8]| Ok(ciphertext[29..].to_vec());
    let (one, two) = tokio::join!(
        store.claim_asset_image_ingestion(
            &source_principal,
            &source_snapshot,
            dispatch_id,
            &detectors,
            open
        ),
        store.claim_asset_image_ingestion(
            &source_principal,
            &source_snapshot,
            dispatch_id,
            &detectors,
            open
        )
    );
    let claimed = match (one.unwrap(), two.unwrap()) {
        (Some(claimed), None) | (None, Some(claimed)) => claimed,
        _ => panic!("one ingestion claim must win"),
    };
    assert_eq!(
        store
            .recover_interrupted_asset_image_ingestions()
            .await
            .unwrap(),
        0
    );
    assert_eq!(claimed.credential.vendor_id, vendor);
    assert_eq!(claimed.credential.upstream_project, "original-project");
    assert_eq!(claimed.source.content_type(), "image/png");
    assert!(!claimed.source.bytes().is_empty());
    assert!(
        !store
            .finish_asset_image_ingestion(
                &other,
                dispatch_id,
                niu_storage::AssetImageIngestionOutcome::Uncertain { reason: "timeout" },
                1
            )
            .await
            .unwrap()
    );
    assert!(
        store
            .finish_asset_image_ingestion(
                &source_principal,
                dispatch_id,
                niu_storage::AssetImageIngestionOutcome::Uncertain { reason: "timeout" },
                1
            )
            .await
            .unwrap()
    );
    assert!(
        !store
            .finish_asset_image_ingestion(
                &source_principal,
                dispatch_id,
                niu_storage::AssetImageIngestionOutcome::Accepted {
                    upstream_asset_id: "asset-later"
                },
                2
            )
            .await
            .unwrap()
    );
    assert!(
        Store::from_pool(pool.clone())
            .claim_asset_image_ingestion(
                &source_principal,
                &source_snapshot,
                dispatch_id,
                &detectors,
                |_, _| panic!("replay must not decrypt")
            )
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        sqlx::query("DELETE FROM asset_image_ingestion_claims WHERE consent_id=$1")
            .bind(dispatch_id)
            .execute(&pool)
            .await
            .is_err()
    );
    let outcome: String = sqlx::query_scalar(
        "SELECT outcome FROM asset_image_ingestion_outcomes WHERE consent_id=$1",
    )
    .bind(dispatch_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(outcome, "uncertain");
    let delete_grant = store
        .qualify_asset_group_deletion(
            scope,
            qualification(),
            niu_storage::OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let deletion_id = uuid::Uuid::new_v4();
    store
        .consent_asset_group_deletion(
            scope,
            niu_storage::AssetGroupDeletionConsent {
                id: deletion_id,
                intent_id: group_intent.id,
                authorization_id: delete_grant,
                valid_for_seconds: 60,
                confirm_cascade: true,
            },
            niu_storage::OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    assert!(
        store
            .claim_asset_group_deletion(scope, deletion_id)
            .await
            .unwrap()
            .is_none(),
        "unresolved upload must fence cascading deletion"
    );
    let occupied:i64 = sqlx::query_scalar("SELECT count(*) FROM inspected_image_source_content c JOIN inspected_image_sources s ON s.id=c.source_id WHERE s.organization_id=$1 AND s.project_id=$2")
        .bind(scope.organization_id).bind(scope.project_id).fetch_one(&pool).await.unwrap();
    // Expired bytes awaiting cleanup count too. Leave exactly one admission slot.
    let seeded:Vec<uuid::Uuid> = sqlx::query_scalar("INSERT INTO inspected_image_sources(id,approval_id,organization_id,project_id,key_id,content_sha256,content_type,byte_length,created_at,expires_at) SELECT gen_random_uuid(),s.approval_id,s.organization_id,s.project_id,s.key_id,s.content_sha256,s.content_type,s.byte_length,clock_timestamp()-interval '2 minutes',clock_timestamp()-interval '1 minute' FROM inspected_image_sources s CROSS JOIN generate_series(1,$2::bigint) WHERE s.id=$1 RETURNING id")
        .bind(covered_id).bind(255-occupied).fetch_all(&pool).await.unwrap();
    sqlx::query("INSERT INTO inspected_image_source_content(source_id,ciphertext) SELECT unnest($1::uuid[]),$2")
        .bind(&seeded).bind(vec![42u8;29]).execute(&pool).await.unwrap();
    let first_source = uuid::Uuid::new_v4();
    let second_source = uuid::Uuid::new_v4();
    let mut first_input = covered_input();
    first_input.id = first_source;
    first_input.additional_approvals = &extra;
    let mut second_input = covered_input();
    second_input.id = second_source;
    second_input.additional_approvals = &extra;
    let seal = |bytes: &[u8], _: &[u8]| {
        let mut sealed = vec![42; 29];
        sealed.extend_from_slice(bytes);
        Ok(sealed)
    };
    let (one, two) = tokio::join!(
        store.save_inspected_image_source(&source_principal, &source_snapshot, first_input, seal),
        store.save_inspected_image_source(&source_principal, &source_snapshot, second_input, seal)
    );
    let retry = match (one, two) {
        (Ok(()), Err(StoreError::ImageSourceCapacityExceeded)) => second_source,
        (Err(StoreError::ImageSourceCapacityExceeded), Ok(())) => first_source,
        _ => panic!("only one concurrent admission may take the last workspace slot"),
    };
    assert_eq!(
        store.purge_expired_inspected_image_sources().await.unwrap(),
        16
    );
    let mut retry_input = covered_input();
    retry_input.id = retry;
    retry_input.additional_approvals = &extra;
    store
        .save_inspected_image_source(&source_principal, &source_snapshot, retry_input, seal)
        .await
        .unwrap();
    task.abort();
}

async fn prepare_image_attempt(
    store: &Store,
    scope: niu_storage::TenantScope,
    key: uuid::Uuid,
    snapshot: &niu_storage::GuardrailSnapshot,
) -> uuid::Uuid {
    let operation = store
        .create_operation(scope, "fixture-image-video")
        .await
        .unwrap();
    let attempt = store
        .prepare_attempt(scope, operation, "fixture-image-video", "fixture-offer")
        .await
        .unwrap();
    store
        .pin_media_recovery_route(scope, attempt)
        .await
        .unwrap();
    store
        .bind_inspected_guardrails(scope, attempt, key, snapshot)
        .await
        .unwrap();
    attempt
}
