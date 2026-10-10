use niu_storage::{MIGRATOR, MediaJobStatus as Status, Store};
use sqlx::PgPool;

async fn configure_video(store: &Store) -> uuid::Uuid {
    let vendor = store
        .create_vendor(niu_storage::VendorInput {
            id: uuid::Uuid::new_v4(),
            name: "Video recovery fixture".into(),
            adapter: "openai".into(),
            api_base: "https://fixture.example/v1".into(),
            enabled: true,
            credential_ciphertext: vec![17; 48],
        })
        .await
        .unwrap();
    let schema = serde_json::json!({"version":1,"revision":"schema-1","model_alias":"fixture-video","upstream_model":"upstream-video","channel":"fixture-channel",
        "maximum_body_bytes":4096,"maximum_content_items":1,
        "inputs":{"text":{"maximum_items":1,"maximum_bytes":256,"https":false,"data_mime_types":[],"roles":[],"role_required":false}},
        "controls":{},"required_controls":[],"exclusive_controls":[],"callbacks_qualified":false});
    store
        .upsert_vendor_model(
            vendor.id,
            niu_storage::VendorModelInput {
                alias: "fixture-video".into(),
                upstream_model: "upstream-video".into(),
                public_catalog: false,
                enabled: true,
                capabilities: serde_json::json!({"video_schema":schema}),
                pricing: None,
                expected_revision: None,
            },
        )
        .await
        .unwrap();
    vendor.id
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn job_binding_and_observations_are_scoped_durable_and_monotonic(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    configure_video(&store).await;
    let other = store
        .create_project(scope.organization_id, "Other video workspace")
        .await
        .unwrap();
    let operation = store
        .create_operation(scope, "fixture-video")
        .await
        .unwrap();
    let id = store
        .prepare_attempt(scope, operation, "fixture-video", "fixture-offer")
        .await
        .unwrap();
    assert!(
        store
            .bind_media_job(scope, id, "upstream-job", "schema-1")
            .await
            .is_err()
    );
    store.pin_media_recovery_route(scope, id).await.unwrap();
    sqlx::query(
        "UPDATE attempts SET execution='may_have_executed',dispatched_at=now() WHERE id=$1",
    )
    .bind(id)
    .execute(&pool)
    .await
    .unwrap();
    store
        .bind_media_job(scope, id, "upstream-job", "schema-1")
        .await
        .unwrap();
    store
        .bind_media_job(scope, id, "upstream-job", "schema-1")
        .await
        .unwrap();
    assert!(
        store
            .bind_media_job(scope, id, "different-job", "schema-1")
            .await
            .is_err()
    );
    assert!(
        store
            .bind_media_job(scope, id, "upstream-job", "schema-2")
            .await
            .is_err()
    );
    assert!(
        store
            .bind_media_job(other, id, "upstream-job", "schema-1")
            .await
            .is_err()
    );
    assert!(
        store
            .record_media_job_status(other, id, Status::Succeeded)
            .await
            .is_err()
    );
    assert_eq!(store.media_job_status(other, id).await.unwrap(), None);
    assert_eq!(
        store.media_job_status(scope, id).await.unwrap(),
        Some(Status::Unknown)
    );
    for (status, expected) in [
        (Status::Queued, Status::Queued),
        (Status::Running, Status::Running),
        (Status::Queued, Status::Running),
        (Status::Unknown, Status::Unknown),
        (Status::Succeeded, Status::Succeeded),
        (Status::Running, Status::Succeeded),
        (Status::Unknown, Status::Succeeded),
        (Status::Failed, Status::Conflicting),
        (Status::Succeeded, Status::Conflicting),
    ] {
        store
            .record_media_job_status(scope, id, status)
            .await
            .unwrap();
        assert_eq!(
            store.media_job_status(scope, id).await.unwrap(),
            Some(expected)
        );
    }
    assert!(
        store
            .record_media_job_status(scope, id, Status::Conflicting)
            .await
            .is_err()
    );
    let fresh = Store::from_pool(pool.clone());
    assert_eq!(
        fresh.media_job_status(scope, id).await.unwrap(),
        Some(Status::Conflicting)
    );
    let count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM media_job_observations WHERE attempt_id=$1")
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(count, 5);
    assert!(
        sqlx::query("DELETE FROM media_jobs WHERE attempt_id=$1")
            .bind(id)
            .execute(&pool)
            .await
            .is_err()
    );
    assert!(
        sqlx::query("UPDATE media_job_observations SET status='queued' WHERE attempt_id=$1")
            .bind(id)
            .execute(&pool)
            .await
            .is_err()
    );
    let charges: i64 =
        sqlx::query_scalar("SELECT count(*) FROM customer_media_charges WHERE attempt_id=$1")
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(charges, 0, "status evidence alone cannot create a charge");
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn concurrent_bindings_cannot_replace_job_or_duplicate_status(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    configure_video(&store).await;
    let operation = store
        .create_operation(scope, "fixture-video")
        .await
        .unwrap();
    let id = store
        .prepare_attempt(scope, operation, "fixture-video", "fixture-offer")
        .await
        .unwrap();
    store.pin_media_recovery_route(scope, id).await.unwrap();
    sqlx::query(
        "UPDATE attempts SET execution='may_have_executed',dispatched_at=now() WHERE id=$1",
    )
    .bind(id)
    .execute(&pool)
    .await
    .unwrap();
    let (first, second) = tokio::join!(
        store.bind_media_job(scope, id, "job-a", "schema-1"),
        store.bind_media_job(scope, id, "job-b", "schema-1")
    );
    assert_ne!(first.is_ok(), second.is_ok());
    let (first, second) = tokio::join!(
        store.record_media_job_status(scope, id, Status::Running),
        store.record_media_job_status(scope, id, Status::Running)
    );
    first.unwrap();
    second.unwrap();
    let count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM media_job_observations WHERE attempt_id=$1")
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(count, 1);
    let org = store
        .create_organization("Foreign video company")
        .await
        .unwrap();
    let foreign = store
        .create_project(org, "Foreign video workspace")
        .await
        .unwrap();
    assert_eq!(store.media_job_status(foreign, id).await.unwrap(), None);
    assert!(
        store
            .record_media_job_status(foreign, id, Status::Failed)
            .await
            .is_err()
    );
    assert!(
        store
            .bind_media_job(foreign, id, "job-a", "schema-1")
            .await
            .is_err()
    );
    assert_eq!(
        store.media_job_status(scope, id).await.unwrap(),
        Some(Status::Running)
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn recovery_keeps_original_account_and_duplicate_jobs_cannot_rebind(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let vendor = configure_video(&store).await;
    let other = store
        .create_project(scope.organization_id, "Other recovery workspace")
        .await
        .unwrap();
    let mut ids = Vec::new();
    for _ in 0..2 {
        let operation = store
            .create_operation(scope, "fixture-video")
            .await
            .unwrap();
        let id = store
            .prepare_attempt(scope, operation, "fixture-video", "fixture-offer")
            .await
            .unwrap();
        store.pin_media_recovery_route(scope, id).await.unwrap();
        store.pin_media_recovery_route(scope, id).await.unwrap();
        sqlx::query(
            "UPDATE attempts SET execution='may_have_executed',dispatched_at=now() WHERE id=$1",
        )
        .bind(id)
        .execute(&pool)
        .await
        .unwrap();
        assert!(store.pin_media_recovery_route(scope, id).await.is_err());
        ids.push(id);
    }
    store
        .bind_media_job(scope, ids[0], "original-job", "schema-1")
        .await
        .unwrap();
    assert!(
        store
            .bind_media_job(scope, ids[1], "original-job", "schema-1")
            .await
            .is_err()
    );
    assert_eq!(
        store.media_job_status(scope, ids[1]).await.unwrap(),
        None,
        "duplicate claim must roll back job insertion"
    );
    assert!(sqlx::query("INSERT INTO media_jobs(organization_id,project_id,attempt_id,upstream_job_id,schema_revision) VALUES($1,$2,$3,'original-job','schema-1')")
        .bind(scope.organization_id).bind(scope.project_id).bind(ids[1]).execute(&pool).await.is_err(), "database also rejects duplicate upstream jobs");
    let fresh = Store::from_pool(pool.clone());
    let route = fresh
        .media_recovery_route(scope, ids[0])
        .await
        .unwrap()
        .unwrap();
    assert_eq!(route.upstream_job_id, "original-job");
    assert_eq!(route.upstream_model, "upstream-video");
    assert_eq!(route.credential_ciphertext, vec![17; 48]);
    assert!(
        fresh
            .media_recovery_route(other, ids[0])
            .await
            .unwrap()
            .is_none()
    );
    let replacement = store
        .create_vendor(niu_storage::VendorInput {
            id: uuid::Uuid::new_v4(),
            name: "Replacement recovery fixture".into(),
            adapter: "openai".into(),
            api_base: "https://replacement.example/v1".into(),
            enabled: true,
            credential_ciphertext: vec![19; 48],
        })
        .await
        .unwrap();
    sqlx::query("UPDATE vendor_models SET vendor_id=$1 WHERE alias='fixture-video'")
        .bind(replacement.id)
        .execute(&pool)
        .await
        .unwrap();
    assert!(
        fresh.media_recovery_route(scope, ids[0]).await.is_err(),
        "moved model cannot look like an absent job"
    );
    sqlx::query("UPDATE vendor_models SET vendor_id=$1 WHERE alias='fixture-video'")
        .bind(vendor)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("UPDATE vendor_models SET enabled=false WHERE alias='fixture-video'")
        .execute(&pool)
        .await
        .unwrap();
    assert!(fresh.media_recovery_route(scope, ids[0]).await.is_err());
    sqlx::query(
        "UPDATE vendor_models SET enabled=true,revision=revision+1 WHERE alias='fixture-video'",
    )
    .execute(&pool)
    .await
    .unwrap();
    let recovered = fresh
        .media_recovery_route(scope, ids[0])
        .await
        .unwrap()
        .unwrap();
    assert_eq!(recovered.upstream_job_id, "original-job");
    assert_eq!(recovered.upstream_model, "upstream-video");
    // Model edits preserve original snapshots; credential invalidation is separate.
    let current = store.vendor(vendor).await.unwrap().unwrap();
    store
        .update_vendor(
            vendor,
            niu_storage::VendorUpdate {
                name: current.name,
                api_base: current.api_base,
                enabled: true,
                credential_ciphertext: Some(vec![18; 48]),
                expected_revision: current.revision,
            },
        )
        .await
        .unwrap();
    assert!(fresh.media_recovery_route(scope, ids[0]).await.is_err());
    assert!(
        sqlx::query(
            "UPDATE media_recovery_routes SET vendor_revision=vendor_revision+1 WHERE attempt_id=$1"
        )
        .bind(ids[0])
        .execute(&pool)
        .await
        .is_err()
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn database_rejects_new_job_without_scoped_schema_pin(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let operation = store
        .create_operation(scope, "fixture-video")
        .await
        .unwrap();
    let id = store
        .prepare_attempt(scope, operation, "fixture-video", "fixture-offer")
        .await
        .unwrap();
    assert!(sqlx::query("INSERT INTO media_jobs(organization_id,project_id,attempt_id,upstream_job_id,schema_revision) VALUES($1,$2,$3,'unbound-job','schema-1')")
        .bind(scope.organization_id).bind(scope.project_id).bind(id).execute(&pool).await.is_err());
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn job_success_usage_and_settlement_remain_separate_and_conflicts_keep_holds(pool: PgPool) {
    use niu_metered_cost::*;
    use niu_storage::{MediaLiabilityBound, MediaUsageSource};
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    configure_video(&store).await;
    store
        .record_settled_customer_funding(
            scope.organization_id,
            "CNY",
            1000,
            "fixture",
            "video-lifecycle",
        )
        .await
        .unwrap();
    let dimensions = Dimensions {
        model: "fixture-video".into(),
        channel: "fixture-channel".into(),
        resolution: "720p".into(),
        reference_video: false,
    };
    let tariff = Tariff {
        revision: "customer-fixture".into(),
        dimensions: dimensions.clone(),
        meter: "video_tokens".into(),
        currency: "CNY".into(),
        decimal_places: 9,
        amount_units: 100,
        per_quantity: Quantity::integer(1_000_000),
        minimum_quantity: Quantity::integer(0),
        rounding: Rounding::Up,
        effective_from: 10,
        effective_until: Some(100),
    };
    let customer = scope.organization_id.to_string();
    let snapshot = pin_pricing(
        &[tariff],
        &[],
        &PricingContext {
            dimensions: &dimensions,
            offer: "fixture-offer",
            customer: &customer,
            at: 20,
        },
    )
    .unwrap();
    let mut ids = Vec::new();
    for reference in ["successful-job", "conflicting-job"] {
        let operation = store
            .create_operation(scope, "fixture-video")
            .await
            .unwrap();
        let id = store
            .prepare_attempt(scope, operation, "fixture-video", "fixture-offer")
            .await
            .unwrap();
        store.pin_media_recovery_route(scope, id).await.unwrap();
        store
            .bind_customer_media_pricing(scope, id, &snapshot)
            .await
            .unwrap();
        store
            .reserve_customer_media_balance(
                scope,
                id,
                &MediaLiabilityBound {
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
        .execute(&pool)
        .await
        .unwrap();
        store
            .bind_media_job(scope, id, reference, "schema-1")
            .await
            .unwrap();
        assert!(store.confirm_media_job_completion(scope, id).await.is_err());
        assert!(
            store.complete(scope, id, None).await.is_err(),
            "generic completion cannot bypass job evidence"
        );
        store
            .record_media_job_status(scope, id, Status::Succeeded)
            .await
            .unwrap();
        store.confirm_media_job_completion(scope, id).await.unwrap();
        store.confirm_media_job_completion(scope, id).await.unwrap();
        assert!(
            store.settle_customer_media_charge(scope, id).await.is_err(),
            "success alone has no usage"
        );
        store
            .record_customer_media_usage(
                scope,
                id,
                MediaUsageSource::Query,
                &Usage::Known {
                    meter: "video_tokens".into(),
                    quantity: Quantity::integer(200_000),
                    provenance: Provenance::Reported,
                },
            )
            .await
            .unwrap();
        ids.push(id);
    }
    let (failure, _completion) = tokio::join!(
        store.record_media_job_status(scope, ids[1], Status::Failed),
        store.confirm_media_job_completion(scope, ids[1])
    );
    failure.unwrap();
    assert!(
        store
            .confirm_media_job_completion(scope, ids[1])
            .await
            .is_err()
    );
    assert!(
        store
            .settle_customer_media_charge(scope, ids[1])
            .await
            .is_err()
    );
    let held: bool = sqlx::query_scalar(
        "SELECT released_at IS NULL FROM customer_balance_reservations WHERE attempt_id=$1",
    )
    .bind(ids[1])
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(held);
    let protocol = niu_media::query::DirectQueryProtocol {
        revision: "fixture-query".into(),
        meter: "video_tokens".into(),
        maximum_body_bytes: 1024,
        maximum_url_bytes: 1024,
    };
    for usage in [
        serde_json::Value::Null,
        serde_json::json!({"completion_tokens":"invalid"}),
    ] {
        let body = serde_json::to_vec(&serde_json::json!({"id":"successful-job","model":"upstream-video","status":"succeeded","usage":usage})).unwrap();
        let incomplete = protocol
            .decode(&body, "successful-job", "upstream-video")
            .unwrap();
        assert_eq!(
            store
                .apply_media_query_observation(scope, ids[0], &incomplete)
                .await
                .unwrap(),
            None
        );
    }
    let unposted: i64 =
        sqlx::query_scalar("SELECT count(*) FROM customer_media_charges WHERE attempt_id=$1")
            .bind(ids[0])
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        unposted, 0,
        "an incomplete observation cannot settle using older usage"
    );
    let decoded = protocol.decode(br#"{"id":"successful-job","model":"upstream-video","status":"succeeded","usage":{"completion_tokens":200000}}"#,"successful-job","upstream-video").unwrap();
    assert!(
        store
            .apply_media_query_observation(scope, ids[1], &decoded)
            .await
            .is_err(),
        "a valid response for another job cannot mutate this job"
    );
    for _ in 0..2 {
        assert_eq!(
            store
                .apply_media_query_observation(scope, ids[0], &decoded)
                .await
                .unwrap(),
            Some(20)
        );
    }
    assert_eq!(
        store
            .settle_customer_media_charge(scope, ids[0])
            .await
            .unwrap(),
        20
    );
    store
        .record_media_job_status(scope, ids[0], Status::Failed)
        .await
        .unwrap();
    assert_eq!(
        store.media_job_status(scope, ids[0]).await.unwrap(),
        Some(Status::Conflicting)
    );
    assert_eq!(
        store
            .settle_customer_media_charge(scope, ids[0])
            .await
            .unwrap(),
        20,
        "late conflict preserves prior debit for explicit reconciliation"
    );
    let charges: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM customer_balance_entries WHERE kind='charge' AND organization_id=$1",
    )
    .bind(scope.organization_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(charges, 1);
    let key = store
        .issue_key(
            scope,
            "Historical billing reader",
            &["fixture-video".into()],
            3600,
        )
        .await
        .unwrap();
    let reader = store.authenticate(&key.token).await.unwrap();
    store
        .record_customer_media_usage(
            scope,
            ids[0],
            MediaUsageSource::Callback,
            &Usage::Known {
                meter: "video_tokens".into(),
                quantity: Quantity::integer(300000),
                provenance: Provenance::Reported,
            },
        )
        .await
        .unwrap();
    let restarted = Store::from_pool(pool.clone());
    let bill = restarted
        .media_billing_for_key(&reader, ids[0])
        .await
        .unwrap()
        .unwrap();
    assert_eq!(bill["state"], "reconciliation_required");
    assert_eq!(bill["charge_nanos"], "20");
    assert!(bill["usage"].is_null());
    assert_eq!(bill["settled_usage"]["quantity"]["numerator"], "200000");
    assert_eq!(
        bill["settled_usage"]["billable_quantity"]["numerator"],
        "200000"
    );
    assert_eq!(bill["settled_usage"]["provenance"], "Reported");
    assert!(bill["settled_usage"].get("tariff_revision").is_none());
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn uncertain_submission_survives_store_reconstruction_without_inventing_a_job(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    configure_video(&store).await;
    let other = store
        .create_project(scope.organization_id, "Other uncertainty workspace")
        .await
        .unwrap();
    let operation = store
        .create_operation(scope, "fixture-video")
        .await
        .unwrap();
    let id = store
        .prepare_attempt(scope, operation, "fixture-video", "fixture-offer")
        .await
        .unwrap();
    store.pin_media_recovery_route(scope, id).await.unwrap();
    assert!(
        store
            .record_media_submission_uncertainty(scope, id)
            .await
            .is_err()
    );
    assert!(sqlx::query("INSERT INTO media_submission_uncertainty(organization_id,project_id,attempt_id) VALUES($1,$2,$3)").bind(scope.organization_id).bind(scope.project_id).bind(id).execute(&pool).await.is_err());
    sqlx::query(
        "UPDATE attempts SET execution='may_have_executed',dispatched_at=now() WHERE id=$1",
    )
    .bind(id)
    .execute(&pool)
    .await
    .unwrap();
    let issued = store
        .issue_key(scope, "Video status", &["fixture-video".into()], 3600)
        .await
        .unwrap();
    let reader = store.authenticate(&issued.token).await.unwrap();
    let denied = store
        .issue_key(scope, "Other model", &["other-model".into()], 3600)
        .await
        .unwrap();
    let denied = store.authenticate(&denied.token).await.unwrap();
    let state = store
        .media_job_state_for_key(&reader, id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(state["status"], "submission_unknown");
    let activity = store.gateway_request(scope, id).await.unwrap().unwrap();
    assert_eq!(activity.request_kind, "video");
    assert!(store.gateway_request(other, id).await.unwrap().is_none());
    assert_eq!(state["model"], "fixture-video");
    assert!(
        store
            .media_job_state_for_key(&denied, id)
            .await
            .unwrap()
            .is_none()
    );
    assert!(state.get("upstream_job_id").is_none());
    for i in 0..101 {
        store
            .record_media_transport_timing(
                scope,
                id,
                &niu_storage::MediaTransportTiming {
                    id: uuid::Uuid::new_v4(),
                    phase: "submission",
                    started_unix_ms: 1000 + i,
                    elapsed_ms: 10,
                    received: true,
                    upstream_http_status: None,
                },
            )
            .await
            .unwrap();
    }
    let timings = store
        .media_transport_timings_for_key(&reader, id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(timings["has_more"], true);
    assert_eq!(timings["data"].as_array().unwrap().len(), 100);
    assert_eq!(timings["data"][0]["started_unix_ms"], 1001);
    assert_eq!(timings["data"][99]["started_unix_ms"], 1100);
    assert!(
        store
            .media_transport_timings_for_key(&denied, id)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        sqlx::query("DELETE FROM media_transport_timings WHERE attempt_id=$1")
            .bind(id)
            .execute(&pool)
            .await
            .is_err()
    );
    let candidates = store
        .media_recovery_candidates(scope, None, 10)
        .await
        .unwrap();
    assert_eq!(
        candidates.len(),
        1,
        "crash before uncertainty marker must remain discoverable"
    );
    assert_eq!(candidates[0].attempt_id, id);
    assert!(!candidates[0].has_upstream_reference);
    assert!(
        store
            .media_recovery_candidates(other, None, 10)
            .await
            .unwrap()
            .is_empty()
    );
    assert!(
        store
            .media_recovery_candidates(scope, Some(id), 10)
            .await
            .unwrap()
            .is_empty()
    );
    assert!(
        store
            .media_recovery_candidates(scope, None, 101)
            .await
            .is_err()
    );
    for _ in 0..2 {
        store
            .record_media_submission_uncertainty(scope, id)
            .await
            .unwrap();
    }
    assert!(
        store
            .record_media_submission_uncertainty(other, id)
            .await
            .is_err()
    );
    let restored = Store::from_pool(pool.clone());
    assert!(
        restored
            .media_submission_is_unresolved(scope, id)
            .await
            .unwrap()
    );
    assert!(
        !restored
            .media_submission_is_unresolved(other, id)
            .await
            .unwrap()
    );
    assert!(
        restored
            .media_recovery_route(scope, id)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        sqlx::query("DELETE FROM media_submission_uncertainty WHERE attempt_id=$1")
            .bind(id)
            .execute(&pool)
            .await
            .is_err()
    );
    restored
        .bind_media_job(scope, id, "reconciled-job", "schema-1")
        .await
        .unwrap();
    assert!(
        !restored
            .media_submission_is_unresolved(scope, id)
            .await
            .unwrap()
    );
    let count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM media_submission_uncertainty WHERE attempt_id=$1")
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(count, 1);
    let candidates = restored
        .media_recovery_candidates(scope, None, 1)
        .await
        .unwrap();
    assert!(candidates[0].has_upstream_reference);
    restored
        .record_media_job_status(scope, id, Status::Succeeded)
        .await
        .unwrap();
    restored
        .confirm_media_job_completion(scope, id)
        .await
        .unwrap();
    assert!(
        restored
            .media_recovery_candidates(scope, None, 1)
            .await
            .unwrap()
            .is_empty()
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn route_change_between_pin_and_dispatch_blocks_egress_intent(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let vendor = configure_video(&store).await;
    let operation = store
        .create_operation(scope, "fixture-video")
        .await
        .unwrap();
    let id = store
        .prepare_attempt(scope, operation, "fixture-video", "fixture-offer")
        .await
        .unwrap();
    store.pin_media_recovery_route(scope, id).await.unwrap();
    sqlx::query("UPDATE vendors SET revision=revision+1 WHERE id=$1")
        .bind(vendor)
        .execute(&pool)
        .await
        .unwrap();
    assert!(
        sqlx::query(
            "UPDATE attempts SET execution='may_have_executed',dispatched_at=now() WHERE id=$1"
        )
        .bind(id)
        .execute(&pool)
        .await
        .is_err()
    );
    let unsent: bool = sqlx::query_scalar(
        "SELECT execution='not_sent' AND dispatched_at IS NULL FROM attempts WHERE id=$1",
    )
    .bind(id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(unsent);
    assert!(
        store.pin_media_recovery_route(scope, id).await.is_err(),
        "cannot silently replace the original pin"
    );
    assert!(
        store
            .record_media_submission_uncertainty(scope, id)
            .await
            .is_err()
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn media_dispatch_pin_rejects_a_route_changed_after_resolution(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let vendor = configure_video(&store).await;
    let resolved = store.vendor_route("fixture-video").await.unwrap().unwrap();
    sqlx::query("UPDATE vendor_models SET revision=revision+1 WHERE vendor_id=$1")
        .bind(vendor)
        .execute(&pool)
        .await
        .unwrap();
    let operation = store
        .create_operation(scope, "fixture-video")
        .await
        .unwrap();
    let id = store
        .prepare_attempt(scope, operation, "fixture-video", "fixture-offer")
        .await
        .unwrap();
    store.pin_media_recovery_route(scope, id).await.unwrap();
    assert!(
        matches!(
            store
                .require_media_dispatch_route(scope, id, &resolved)
                .await,
            Err(niu_storage::StoreError::Conflict)
        ),
        "a new pin cannot authorize the old resolved credential/model context"
    );
    let current = store.vendor_route("fixture-video").await.unwrap().unwrap();
    store
        .require_media_dispatch_route(scope, id, &current)
        .await
        .unwrap();
    let other = store
        .create_project(scope.organization_id, "Foreign media scope")
        .await
        .unwrap();
    assert!(
        store
            .require_media_dispatch_route(other, id, &current)
            .await
            .is_err()
    );
    sqlx::query("UPDATE vendor_models SET revision=revision+1 WHERE vendor_id=$1")
        .bind(vendor)
        .execute(&pool)
        .await
        .unwrap();
    assert!(
        sqlx::query(
            "UPDATE attempts SET execution='may_have_executed',dispatched_at=now() WHERE id=$1"
        )
        .bind(id)
        .execute(&pool)
        .await
        .is_err(),
        "a later revision change must also fail at the database dispatch boundary"
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn output_estimates_are_immutable_scoped_and_survive_configuration_changes(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let vendor = configure_video(&store).await;
    let schema_json = serde_json::json!({"version":1,"revision":"output-1","model_alias":"fixture-video","upstream_model":"upstream-video","channel":"fixture-channel",
        "maximum_body_bytes":4096,"maximum_content_items":2,
        "inputs":{"text":{"maximum_items":1,"maximum_bytes":256,"https":false,"data_mime_types":[],"roles":[],"role_required":false},
            "image_url":{"maximum_items":1,"maximum_bytes":256,"https":true,"data_mime_types":[],"roles":[],"role_required":false},
            "video_url":{"maximum_items":1,"maximum_bytes":256,"https":true,"data_mime_types":[],"roles":[],"role_required":false}},
        "controls":{"resolution":{"kind":"choice","values":["720p"],"default":"720p"},
        "ratio":{"kind":"choice","values":["16:9"],"default":"16:9"},
        "duration":{"kind":"integer","minimum":1,"maximum":10,"default":5},
        "frames_per_second":{"kind":"integer","minimum":24,"maximum":60,"default":24}},
        "required_controls":[],"exclusive_controls":[],"callbacks_qualified":false,
        "output":{"specifications":[{"resolution":"720p","ratio":"16:9","width":1280,"height":720}],"estimator":"SeedancePixelsV1","estimator_revision":"pixels-review-1"}});
    sqlx::query("UPDATE vendor_models SET capabilities=$1,revision=revision+1 WHERE vendor_id=$2")
        .bind(serde_json::json!({"video_schema":schema_json}))
        .bind(vendor)
        .execute(&pool)
        .await
        .unwrap();
    let schema: niu_media::VideoSchema = serde_json::from_value(schema_json.clone()).unwrap();
    let body = serde_json::json!({"model":"fixture-video","content":[{"type":"text","text":"Private prompt must not be saved"}]});
    let request = schema
        .validate_request(&serde_json::to_vec(&body).unwrap())
        .unwrap();
    let operation = store
        .create_operation(scope, "fixture-video")
        .await
        .unwrap();
    let attempt = store
        .prepare_attempt(scope, operation, "fixture-video", "fixture-offer")
        .await
        .unwrap();
    assert!(
        store
            .pin_media_output_snapshot(scope, attempt, &request)
            .await
            .is_err()
    );
    store
        .pin_media_recovery_route(scope, attempt)
        .await
        .unwrap();
    assert!(
        sqlx::query(
            "UPDATE attempts SET dispatched_at=now(),execution='may_have_executed' WHERE id=$1"
        )
        .bind(attempt)
        .execute(&pool)
        .await
        .is_err()
    );
    store
        .pin_media_output_snapshot(scope, attempt, &request)
        .await
        .unwrap();
    store
        .pin_media_output_snapshot(scope, attempt, &request)
        .await
        .unwrap();
    let saved = store
        .media_output_snapshot(scope, attempt)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(saved["output"]["specification"]["width"], 1280);
    assert_eq!(saved["output"]["duration_seconds"], 5);
    assert_eq!(saved["estimated_usage"]["provenance"], "Estimate");
    assert_eq!(saved["estimated_usage"]["meter"], "video_tokens");
    let quantity: niu_metered_cost::Quantity =
        serde_json::from_value(saved["estimated_usage"]["quantity"].clone()).unwrap();
    assert_eq!(quantity, niu_metered_cost::Quantity::integer(108000));
    assert!(!saved.to_string().contains("Private prompt"));
    assert!(!saved.to_string().contains("fixture-offer"));
    // Output metadata can be pinned for an image without retaining its source.
    // This does not authorize retrieval or generation; receipt guards remain separate.
    let mut image_body = body.clone();
    image_body["content"].as_array_mut().unwrap().push(serde_json::json!({"type":"image_url","image_url":{"url":"https://private-reference.example/image.png"}}));
    let image_request = schema
        .validate_request(&serde_json::to_vec(&image_body).unwrap())
        .unwrap();
    let image_operation = store
        .create_operation(scope, "fixture-video")
        .await
        .unwrap();
    let image_attempt = store
        .prepare_attempt(scope, image_operation, "fixture-video", "fixture-offer")
        .await
        .unwrap();
    store
        .pin_media_recovery_route(scope, image_attempt)
        .await
        .unwrap();
    store
        .pin_media_output_snapshot(scope, image_attempt, &image_request)
        .await
        .unwrap();
    let image_saved = store
        .media_output_snapshot(scope, image_attempt)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(image_saved["estimated_usage"], saved["estimated_usage"]);
    assert!(!image_saved.to_string().contains("private-reference"));
    let mut video_body = body.clone();
    video_body["content"].as_array_mut().unwrap().push(serde_json::json!({"type":"video_url","video_url":{"url":"https://private-reference.example/video.mp4"}}));
    let video_request = schema
        .validate_request(&serde_json::to_vec(&video_body).unwrap())
        .unwrap();
    assert!(matches!(
        store
            .pin_media_output_snapshot(scope, image_attempt, &video_request)
            .await,
        Err(niu_storage::StoreError::InvalidUsage)
    ));
    let mut changed = body.clone();
    changed["duration"] = serde_json::json!(10);
    let changed = schema
        .validate_request(&serde_json::to_vec(&changed).unwrap())
        .unwrap();
    assert!(
        store
            .pin_media_output_snapshot(scope, attempt, &changed)
            .await
            .is_err()
    );
    let other = store
        .create_project(scope.organization_id, "Different output workspace")
        .await
        .unwrap();
    assert!(
        store
            .media_output_snapshot(other, attempt)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        store
            .pin_media_output_snapshot(other, attempt, &request)
            .await
            .is_err()
    );
    assert!(
        sqlx::query("UPDATE media_output_snapshots SET document='{}' WHERE attempt_id=$1")
            .bind(attempt)
            .execute(&pool)
            .await
            .is_err()
    );
    assert!(
        sqlx::query("DELETE FROM media_output_snapshots WHERE attempt_id=$1")
            .bind(attempt)
            .execute(&pool)
            .await
            .is_err()
    );
    sqlx::query(
        "UPDATE attempts SET dispatched_at=now(),execution='may_have_executed' WHERE id=$1",
    )
    .bind(attempt)
    .execute(&pool)
    .await
    .unwrap();
    assert!(
        store
            .pin_media_output_snapshot(scope, attempt, &request)
            .await
            .is_err()
    );
    let mut changed_schema = schema_json;
    changed_schema["revision"] = serde_json::json!("output-2");
    changed_schema["output"]["specifications"][0]["width"] = serde_json::json!(1920);
    sqlx::query("UPDATE vendor_models SET capabilities=$1,revision=revision+1 WHERE vendor_id=$2")
        .bind(serde_json::json!({"video_schema":changed_schema}))
        .bind(vendor)
        .execute(&pool)
        .await
        .unwrap();
    let reopened = Store::from_pool(pool.clone());
    assert_eq!(
        reopened
            .media_output_snapshot(scope, attempt)
            .await
            .unwrap(),
        Some(saved)
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn result_references_are_scoped_expiring_and_cannot_be_resurrected(pool: PgPool) {
    use niu_storage::MediaResultKind;
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    configure_video(&store).await;
    let other = store
        .create_project(scope.organization_id, "Other result workspace")
        .await
        .unwrap();
    let operation = store
        .create_operation(scope, "fixture-video")
        .await
        .unwrap();
    let id = store
        .prepare_attempt(scope, operation, "fixture-video", "fixture-offer")
        .await
        .unwrap();
    store.pin_media_recovery_route(scope, id).await.unwrap();
    sqlx::query(
        "UPDATE attempts SET execution='may_have_executed',dispatched_at=now() WHERE id=$1",
    )
    .bind(id)
    .execute(&pool)
    .await
    .unwrap();
    store
        .bind_media_job(scope, id, "upstream-result-job", "schema-1")
        .await
        .unwrap();
    let kind = MediaResultKind::Video;
    assert!(
        store
            .save_media_result_reference(scope, id, kind, &[17; 48])
            .await
            .is_err()
    );
    store
        .record_media_job_status(scope, id, Status::Succeeded)
        .await
        .unwrap();
    assert!(
        store
            .save_media_result_reference(scope, id, kind, &[1; 2])
            .await
            .is_err()
    );
    assert!(
        store
            .save_media_result_reference(other, id, kind, &[17; 48])
            .await
            .is_err()
    );
    assert!(
        store
            .save_media_result_reference(scope, id, kind, &[17; 48])
            .await
            .unwrap()
    );
    assert_eq!(
        store.media_result_reference(scope, id, kind).await.unwrap(),
        Some(vec![17; 48])
    );
    assert!(
        store
            .media_result_reference(other, id, kind)
            .await
            .unwrap()
            .is_none()
    );
    let expiry: String = sqlx::query_scalar(
        "SELECT expires_at::text FROM media_result_references WHERE attempt_id=$1 AND kind='video'",
    )
    .bind(id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(
        store
            .save_media_result_reference(scope, id, kind, &[18; 48])
            .await
            .unwrap()
    );
    let refreshed: String = sqlx::query_scalar(
        "SELECT expires_at::text FROM media_result_references WHERE attempt_id=$1 AND kind='video'",
    )
    .bind(id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(expiry, refreshed);
    assert!(sqlx::query("UPDATE media_result_references SET expires_at=expires_at+interval '1 hour' WHERE attempt_id=$1").bind(id).execute(&pool).await.is_err());
    // A historical fixture proves reads deny expired data before periodic cleanup.
    sqlx::query("INSERT INTO media_result_references(organization_id,project_id,attempt_id,kind,ciphertext,created_at,expires_at) VALUES($1,$2,$3,'last_frame',$4,now()-interval '25 hours',now()-interval '1 hour')").bind(scope.organization_id).bind(scope.project_id).bind(id).bind(vec![21_u8;48]).execute(&pool).await.unwrap();
    assert!(
        store
            .media_result_reference(scope, id, MediaResultKind::LastFrame)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        !store
            .save_media_result_reference(scope, id, MediaResultKind::LastFrame, &[22; 48])
            .await
            .unwrap()
    );
    assert_eq!(
        store.purge_expired_media_result_references().await.unwrap(),
        1
    );
    let wiped:bool=sqlx::query_scalar("SELECT ciphertext IS NULL AND deleted_at IS NOT NULL FROM media_result_references WHERE attempt_id=$1 AND kind='last_frame'").bind(id).fetch_one(&pool).await.unwrap();
    assert!(wiped);
    store
        .delete_media_result_references(other, id)
        .await
        .unwrap();
    assert!(
        store
            .media_result_reference(scope, id, kind)
            .await
            .unwrap()
            .is_some()
    );
    store
        .delete_media_result_references(scope, id)
        .await
        .unwrap();
    store
        .delete_media_result_references(scope, id)
        .await
        .unwrap();
    assert!(
        store
            .media_result_reference(scope, id, kind)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        !store
            .save_media_result_reference(scope, id, kind, &[19; 48])
            .await
            .unwrap()
    );
    assert!(
        sqlx::query(
            "UPDATE media_result_references SET deleted_at=NULL,ciphertext=$2 WHERE attempt_id=$1"
        )
        .bind(id)
        .bind(vec![20_u8; 48])
        .execute(&pool)
        .await
        .is_err()
    );
    assert!(
        sqlx::query("DELETE FROM media_result_references WHERE attempt_id=$1")
            .bind(id)
            .execute(&pool)
            .await
            .is_err()
    );
    // Deletion before any result exists must also survive eventual completion.
    let operation = store
        .create_operation(scope, "fixture-video")
        .await
        .unwrap();
    let pending = store
        .prepare_attempt(scope, operation, "fixture-video", "fixture-offer")
        .await
        .unwrap();
    store
        .pin_media_recovery_route(scope, pending)
        .await
        .unwrap();
    store
        .delete_media_result_references(scope, pending)
        .await
        .unwrap();
    sqlx::query(
        "UPDATE attempts SET execution='may_have_executed',dispatched_at=now() WHERE id=$1",
    )
    .bind(pending)
    .execute(&pool)
    .await
    .unwrap();
    store
        .bind_media_job(scope, pending, "deleted-before-completion", "schema-1")
        .await
        .unwrap();
    store
        .record_media_job_status(scope, pending, Status::Succeeded)
        .await
        .unwrap();
    for kind in [MediaResultKind::Video, MediaResultKind::LastFrame] {
        assert!(
            !store
                .save_media_result_reference(scope, pending, kind, &[24; 48])
                .await
                .unwrap()
        );
        assert!(
            store
                .media_result_reference(scope, pending, kind)
                .await
                .unwrap()
                .is_none()
        );
    }
    // Conflicting terminal evidence cannot release an existing result reference.
    let operation = store
        .create_operation(scope, "fixture-video")
        .await
        .unwrap();
    let conflict = store
        .prepare_attempt(scope, operation, "fixture-video", "fixture-offer")
        .await
        .unwrap();
    store
        .pin_media_recovery_route(scope, conflict)
        .await
        .unwrap();
    sqlx::query(
        "UPDATE attempts SET execution='may_have_executed',dispatched_at=now() WHERE id=$1",
    )
    .bind(conflict)
    .execute(&pool)
    .await
    .unwrap();
    store
        .bind_media_job(scope, conflict, "conflicting-result-job", "schema-1")
        .await
        .unwrap();
    store
        .record_media_job_status(scope, conflict, Status::Succeeded)
        .await
        .unwrap();
    store
        .save_media_result_reference(scope, conflict, kind, &[23; 48])
        .await
        .unwrap();
    store
        .record_media_job_status(scope, conflict, Status::Failed)
        .await
        .unwrap();
    assert!(
        store
            .media_result_reference(scope, conflict, kind)
            .await
            .unwrap()
            .is_none()
    );
}

#[sqlx::test(migrations = false)]
#[ignore = "requires PostgreSQL"]
async fn result_retention_hardening_upgrades_saved_references_without_extending_or_losing_them(
    pool: PgPool,
) {
    let old = sqlx::migrate::Migrator {
        migrations: std::borrow::Cow::Owned(
            MIGRATOR
                .iter()
                .filter(|migration| migration.version <= 135)
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
    configure_video(&store).await;
    let operation = store
        .create_operation(scope, "fixture-video")
        .await
        .unwrap();
    let id = store
        .prepare_attempt(scope, operation, "fixture-video", "fixture-offer")
        .await
        .unwrap();
    // Seed the version-135 schema directly. Current Store route pinning also
    // writes protocol snapshots introduced later, so it cannot construct an
    // historical database before the migration under examination runs.
    sqlx::query("INSERT INTO media_recovery_routes(organization_id,project_id,attempt_id,vendor_id,vendor_revision,model_revision,upstream_model,schema_revision,adapter,api_base) SELECT a.organization_id,a.project_id,a.id,v.id,v.revision,m.revision,m.upstream_model,m.capabilities->'video_schema'->>'revision',v.adapter,v.api_base FROM attempts a JOIN vendor_models m ON m.alias=a.resource_id JOIN vendors v ON v.id=m.vendor_id WHERE a.id=$1")
        .bind(id).execute(&pool).await.unwrap();
    sqlx::query(
        "UPDATE attempts SET execution='may_have_executed',dispatched_at=now() WHERE id=$1",
    )
    .bind(id)
    .execute(&pool)
    .await
    .unwrap();
    store
        .bind_media_job(scope, id, "retained-upgrade-job", "schema-1")
        .await
        .unwrap();
    store
        .record_media_job_status(scope, id, Status::Succeeded)
        .await
        .unwrap();
    sqlx::query("INSERT INTO media_result_references(organization_id,project_id,attempt_id,kind,ciphertext,created_at,expires_at) VALUES($1,$2,$3,'video',$4,now()-interval '1 hour',now()+interval '23 hours 0.5 seconds')").bind(scope.organization_id).bind(scope.project_id).bind(id).bind(vec![31_u8;48]).execute(&pool).await.unwrap();
    MIGRATOR.run(&pool).await.unwrap();
    assert_eq!(
        store
            .media_result_reference(scope, id, niu_storage::MediaResultKind::Video)
            .await
            .unwrap(),
        Some(vec![31; 48])
    );
    let exact:bool=sqlx::query_scalar("SELECT expires_at=created_at+interval '24 hours' FROM media_result_references WHERE attempt_id=$1").bind(id).fetch_one(&pool).await.unwrap();
    assert!(exact);
    assert!(
        sqlx::query("DELETE FROM media_result_references WHERE attempt_id=$1")
            .bind(id)
            .execute(&pool)
            .await
            .is_err()
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn lifecycle_timing_preserves_first_observations_and_terminal_conflicts(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    configure_video(&store).await;
    let operation = store
        .create_operation(scope, "fixture-video")
        .await
        .unwrap();
    let id = store
        .prepare_attempt(scope, operation, "fixture-video", "fixture-offer")
        .await
        .unwrap();
    store.pin_media_recovery_route(scope, id).await.unwrap();
    sqlx::query(
        "UPDATE attempts SET execution='may_have_executed',dispatched_at=now() WHERE id=$1",
    )
    .bind(id)
    .execute(&pool)
    .await
    .unwrap();
    store
        .bind_media_job(scope, id, "private-upstream-job", "schema-1")
        .await
        .unwrap();
    let issued = store
        .issue_key(scope, "Lifecycle reader", &["fixture-video".into()], 3600)
        .await
        .unwrap();
    let reader = store.authenticate(&issued.token).await.unwrap();
    let initial = store
        .media_transport_timings_for_key(&reader, id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(initial["lifecycle"]["observations"], serde_json::json!([]));
    assert!(initial["lifecycle"]["submitted_unix_ms"].as_i64().unwrap() > 0);
    for status in [Status::Queued, Status::Running, Status::Succeeded] {
        store
            .record_media_job_status(scope, id, status)
            .await
            .unwrap();
    }
    let first = store
        .media_transport_timings_for_key(&reader, id)
        .await
        .unwrap()
        .unwrap();
    store
        .record_media_job_status(scope, id, Status::Running)
        .await
        .unwrap();
    let restarted = Store::from_pool(pool.clone());
    assert_eq!(
        first,
        restarted
            .media_transport_timings_for_key(&reader, id)
            .await
            .unwrap()
            .unwrap()
    );
    assert_eq!(
        first["lifecycle"]["observations"].as_array().unwrap().len(),
        3
    );
    assert_eq!(first["lifecycle"]["conflicting_terminal"], false);
    store
        .record_media_job_status(scope, id, Status::Failed)
        .await
        .unwrap();
    let conflict = store
        .media_transport_timings_for_key(&reader, id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(conflict["lifecycle"]["conflicting_terminal"], true);
    assert_eq!(
        conflict["lifecycle"]["observations"]
            .as_array()
            .unwrap()
            .len(),
        4
    );
    let serialized = conflict.to_string();
    assert!(!serialized.contains("private-upstream-job"));
    assert!(!serialized.contains(&id.to_string()));
    let denied = store
        .issue_key(scope, "Different model", &["other-model".into()], 3600)
        .await
        .unwrap();
    let denied = store.authenticate(&denied.token).await.unwrap();
    assert!(
        store
            .media_transport_timings_for_key(&denied, id)
            .await
            .unwrap()
            .is_none()
    );
}
