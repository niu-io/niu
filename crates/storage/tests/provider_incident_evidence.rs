use niu_storage::{
    MIGRATOR, RequestFailure, RequestFailureKind, Store, TenantScope, VendorInput,
    VendorModelInput, VendorModelView, VendorUpdate, VendorView,
};
use sqlx::{Acquire, PgPool};
use uuid::Uuid;

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn account_restriction_is_durable_without_claiming_nonexecution(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let operation = store
        .create_operation(scope, "restricted-model")
        .await
        .unwrap();
    let attempt = store
        .prepare_attempt(scope, operation, "restricted-model", "fixture")
        .await
        .unwrap();
    let vendor = store
        .create_vendor(VendorInput {
            id: uuid::Uuid::new_v4(),
            name: "Incident fixture".into(),
            adapter: "openai".into(),
            api_base: "https://example.test/v1".into(),
            enabled: true,
            credential_ciphertext: vec![1; 48],
        })
        .await
        .unwrap();
    let model = store
        .upsert_vendor_model(
            vendor.id,
            VendorModelInput {
                alias: "restricted-model".into(),
                upstream_model: "restricted-model".into(),
                public_catalog: false,
                enabled: true,
                capabilities: serde_json::json!({}),
                pricing: None,
                expected_revision: None,
            },
        )
        .await
        .unwrap();
    sqlx::query("INSERT INTO managed_attempt_routes(attempt_id,vendor_id,model_alias,vendor_revision,model_revision) VALUES($1,$2,$3,$4,$5)")
        .bind(attempt).bind(vendor.id).bind(&model.alias).bind(vendor.revision).bind(model.revision)
        .execute(&pool).await.unwrap();
    // Model a dispatched attempt without performing any upstream transport.
    sqlx::query("UPDATE attempts SET dispatch_provider='openai',execution='may_have_executed',dispatched_at=clock_timestamp() WHERE id=$1")
        .bind(attempt).execute(&pool).await.unwrap();
    let failure = RequestFailure {
        kind: RequestFailureKind::UpstreamAccountRestricted,
        upstream_http_status: Some(403),
        transport_phase: None,
    };
    store
        .save_request_failure(scope, attempt, failure)
        .await
        .unwrap();
    store
        .save_request_failure(scope, attempt, failure)
        .await
        .unwrap();
    let saved: (String, String) = sqlx::query_as("SELECT f.kind,a.execution FROM request_failures f JOIN attempts a ON a.id=f.attempt_id WHERE a.id=$1")
        .bind(attempt).fetch_one(&pool).await.unwrap();
    assert_eq!(
        saved,
        (
            "upstream_account_restricted".into(),
            "may_have_executed".into()
        )
    );
    let observations: i64 =
        sqlx::query_scalar("SELECT observations FROM connection_incidents WHERE vendor_id=$1")
            .bind(vendor.id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        observations, 1,
        "identical replay must not create another incident observation"
    );
    assert!(
        store
            .save_request_failure(
                scope,
                attempt,
                RequestFailure {
                    kind: RequestFailureKind::UpstreamHttpError,
                    ..failure
                }
            )
            .await
            .is_err()
    );
    assert!(
        store
            .save_request_failure(
                scope,
                attempt,
                RequestFailure {
                    upstream_http_status: None,
                    ..failure
                }
            )
            .await
            .is_err()
    );
    let stale_operation = store
        .create_operation(scope, "restricted-model")
        .await
        .unwrap();
    let stale_candidate = store
        .prepare_attempt(scope, stale_operation, "restricted-model", "fixture")
        .await
        .unwrap();
    sqlx::query("INSERT INTO managed_attempt_routes(attempt_id,vendor_id,model_alias,vendor_revision,model_revision) VALUES($1,$2,$3,$4,$5)")
        .bind(stale_candidate).bind(vendor.id).bind(&model.alias).bind(vendor.revision).bind(model.revision)
        .execute(&pool).await.unwrap();
    sqlx::query("UPDATE attempts SET dispatch_provider='openai',execution='may_have_executed',dispatched_at=clock_timestamp() WHERE id=$1")
        .bind(stale_candidate).execute(&pool).await.unwrap();
    // Remap the same alias to a replacement upstream model while the candidate is in flight.
    let remapped_model = store
        .upsert_vendor_model(
            vendor.id,
            VendorModelInput {
                alias: "restricted-model".into(),
                upstream_model: "restricted-model-v2".into(),
                public_catalog: false,
                enabled: true,
                capabilities: serde_json::json!({}),
                pricing: None,
                expected_revision: Some(model.revision),
            },
        )
        .await
        .unwrap();
    assert!(remapped_model.revision > model.revision);
    sqlx::query("INSERT INTO request_timings(attempt_id,total_ms,complete,http_status) VALUES($1,1,true,200)")
        .bind(stale_candidate).execute(&pool).await.unwrap();
    sqlx::query("UPDATE attempts SET execution='confirmed_completed',completed_at=clock_timestamp() WHERE id=$1")
        .bind(stale_candidate).execute(&pool).await.unwrap();
    let stale_recovery: Option<uuid::Uuid> = sqlx::query_scalar(
        "SELECT recovery_attempt_id FROM connection_incidents WHERE vendor_id=$1",
    )
    .bind(vendor.id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(
        stale_recovery, None,
        "success under an obsolete model revision must not resolve the incident"
    );

    // Also verify the reverse arrival order (execution before timing) under an obsolete mapping cannot resolve.
    let stale_exec_first_op = store
        .create_operation(scope, "restricted-model")
        .await
        .unwrap();
    let stale_exec_first = store
        .prepare_attempt(scope, stale_exec_first_op, "restricted-model", "fixture")
        .await
        .unwrap();
    sqlx::query("INSERT INTO managed_attempt_routes(attempt_id,vendor_id,model_alias,vendor_revision,model_revision) VALUES($1,$2,$3,$4,$5)")
        .bind(stale_exec_first).bind(vendor.id).bind(&model.alias).bind(vendor.revision).bind(model.revision)
        .execute(&pool).await.unwrap();
    sqlx::query("UPDATE attempts SET dispatch_provider='openai',execution='confirmed_completed',dispatched_at=clock_timestamp(),completed_at=clock_timestamp() WHERE id=$1")
        .bind(stale_exec_first).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO request_timings(attempt_id,total_ms,complete,http_status) VALUES($1,1,true,200)")
        .bind(stale_exec_first).execute(&pool).await.unwrap();
    let stale_exec_first_recovery: Option<uuid::Uuid> = sqlx::query_scalar(
        "SELECT recovery_attempt_id FROM connection_incidents WHERE vendor_id=$1",
    )
    .bind(vendor.id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(
        stale_exec_first_recovery, None,
        "reverse-order evidence under an obsolete model revision must not resolve the incident"
    );

    // Now dispatch and complete a request under the current (vendor.revision, remapped_model.revision).
    let recovered_operation = store
        .create_operation(scope, "restricted-model")
        .await
        .unwrap();
    let recovered = store
        .prepare_attempt(scope, recovered_operation, "restricted-model", "fixture")
        .await
        .unwrap();
    sqlx::query("INSERT INTO managed_attempt_routes(attempt_id,vendor_id,model_alias,vendor_revision,model_revision) VALUES($1,$2,$3,$4,$5)")
        .bind(recovered).bind(vendor.id).bind(&remapped_model.alias).bind(vendor.revision).bind(remapped_model.revision)
        .execute(&pool).await.unwrap();
    sqlx::query("UPDATE attempts SET dispatch_provider='openai',execution='may_have_executed',dispatched_at=clock_timestamp() WHERE id=$1")
        .bind(recovered).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO request_timings(attempt_id,total_ms,complete,http_status) VALUES($1,1,true,200)")
        .bind(recovered).execute(&pool).await.unwrap();
    let active: bool = sqlx::query_scalar(
        "SELECT resolved_at IS NULL FROM connection_incidents WHERE vendor_id=$1",
    )
    .bind(vendor.id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(active, "HTTP timing alone cannot confirm recovery");
    sqlx::query("UPDATE attempts SET execution='confirmed_completed',completed_at=clock_timestamp() WHERE id=$1")
        .bind(recovered).execute(&pool).await.unwrap();
    let recovery: Option<uuid::Uuid> = sqlx::query_scalar(
        "SELECT recovery_attempt_id FROM connection_incidents WHERE vendor_id=$1",
    )
    .bind(vendor.id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(recovery, Some(recovered));

    // Verify a subsequent incident where execution arrives before timing under the current mapping,
    // and verify that disabling the model blocks resolution until re-enabled at the current revision.
    let second_fail_op = store
        .create_operation(scope, "restricted-model")
        .await
        .unwrap();
    let second_fail = store
        .prepare_attempt(scope, second_fail_op, "restricted-model", "fixture")
        .await
        .unwrap();
    sqlx::query("INSERT INTO managed_attempt_routes(attempt_id,vendor_id,model_alias,vendor_revision,model_revision) VALUES($1,$2,$3,$4,$5)")
        .bind(second_fail).bind(vendor.id).bind(&remapped_model.alias).bind(vendor.revision).bind(remapped_model.revision)
        .execute(&pool).await.unwrap();
    sqlx::query("UPDATE attempts SET dispatch_provider='openai',execution='may_have_executed',dispatched_at=clock_timestamp() WHERE id=$1")
        .bind(second_fail).execute(&pool).await.unwrap();
    store
        .save_request_failure(scope, second_fail, failure)
        .await
        .unwrap();
    let disabled_candidate_op = store
        .create_operation(scope, "restricted-model")
        .await
        .unwrap();
    let disabled_candidate = store
        .prepare_attempt(scope, disabled_candidate_op, "restricted-model", "fixture")
        .await
        .unwrap();
    sqlx::query("INSERT INTO managed_attempt_routes(attempt_id,vendor_id,model_alias,vendor_revision,model_revision) VALUES($1,$2,$3,$4,$5)")
        .bind(disabled_candidate).bind(vendor.id).bind(&remapped_model.alias).bind(vendor.revision).bind(remapped_model.revision)
        .execute(&pool).await.unwrap();
    sqlx::query("UPDATE attempts SET dispatch_provider='openai',execution='may_have_executed',dispatched_at=clock_timestamp() WHERE id=$1")
        .bind(disabled_candidate).execute(&pool).await.unwrap();
    let disabled_model = store
        .upsert_vendor_model(
            vendor.id,
            VendorModelInput {
                alias: "restricted-model".into(),
                upstream_model: "restricted-model-v2".into(),
                public_catalog: false,
                enabled: false,
                capabilities: serde_json::json!({}),
                pricing: None,
                expected_revision: Some(remapped_model.revision),
            },
        )
        .await
        .unwrap();
    sqlx::query("UPDATE attempts SET execution='confirmed_completed',completed_at=clock_timestamp() WHERE id=$1")
        .bind(disabled_candidate).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO request_timings(attempt_id,total_ms,complete,http_status) VALUES($1,1,true,200)")
        .bind(disabled_candidate).execute(&pool).await.unwrap();
    let still_active: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM connection_incidents WHERE vendor_id=$1 AND resolved_at IS NULL)",
    )
    .bind(vendor.id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(
        still_active,
        "disabled model mapping must not resolve active incident"
    );

    let reenabled_model = store
        .upsert_vendor_model(
            vendor.id,
            VendorModelInput {
                alias: "restricted-model".into(),
                upstream_model: "restricted-model-v2".into(),
                public_catalog: false,
                enabled: true,
                capabilities: serde_json::json!({}),
                pricing: None,
                expected_revision: Some(disabled_model.revision),
            },
        )
        .await
        .unwrap();
    let exec_first_op = store
        .create_operation(scope, "restricted-model")
        .await
        .unwrap();
    let exec_first = store
        .prepare_attempt(scope, exec_first_op, "restricted-model", "fixture")
        .await
        .unwrap();
    sqlx::query("INSERT INTO managed_attempt_routes(attempt_id,vendor_id,model_alias,vendor_revision,model_revision) VALUES($1,$2,$3,$4,$5)")
        .bind(exec_first).bind(vendor.id).bind(&reenabled_model.alias).bind(vendor.revision).bind(reenabled_model.revision)
        .execute(&pool).await.unwrap();
    sqlx::query("UPDATE attempts SET dispatch_provider='openai',execution='confirmed_completed',dispatched_at=clock_timestamp(),completed_at=clock_timestamp() WHERE id=$1")
        .bind(exec_first).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO request_timings(attempt_id,total_ms,complete,http_status) VALUES($1,1,true,200)")
        .bind(exec_first).execute(&pool).await.unwrap();
    let second_recovery: Option<uuid::Uuid> = sqlx::query_scalar(
        "SELECT recovery_attempt_id FROM connection_incidents WHERE vendor_id=$1 ORDER BY id DESC LIMIT 1",
    )
    .bind(vendor.id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(second_recovery, Some(exec_first));
}

const RESTRICTION: RequestFailure = RequestFailure {
    kind: RequestFailureKind::UpstreamAccountRestricted,
    upstream_http_status: Some(403),
    transport_phase: None,
};

#[derive(Clone, Copy)]
enum EvidenceOrder {
    TimingFirst,
    ExecutionFirst,
}

async fn new_vendor(store: &Store, name: &str) -> VendorView {
    store
        .create_vendor(VendorInput {
            id: Uuid::new_v4(),
            name: name.into(),
            adapter: "openai".into(),
            api_base: "https://example.test/v1".into(),
            enabled: true,
            credential_ciphertext: vec![1; 48],
        })
        .await
        .unwrap()
}

async fn new_model(
    store: &Store,
    vendor: Uuid,
    alias: &str,
    upstream_model: &str,
) -> VendorModelView {
    store
        .upsert_vendor_model(
            vendor,
            VendorModelInput {
                alias: alias.into(),
                upstream_model: upstream_model.into(),
                public_catalog: false,
                enabled: true,
                capabilities: serde_json::json!({}),
                pricing: None,
                expected_revision: None,
            },
        )
        .await
        .unwrap()
}

/// Bind a dispatch-time managed route at the supplied revisions, then mark the
/// attempt dispatched without performing any upstream transport.
async fn dispatch(
    pool: &PgPool,
    store: &Store,
    scope: TenantScope,
    vendor: Uuid,
    alias: &str,
    vendor_revision: i64,
    model_revision: i64,
) -> Uuid {
    let operation = store.create_operation(scope, alias).await.unwrap();
    let attempt = store
        .prepare_attempt(scope, operation, alias, "fixture")
        .await
        .unwrap();
    sqlx::query("INSERT INTO managed_attempt_routes(attempt_id,vendor_id,model_alias,vendor_revision,model_revision) VALUES($1,$2,$3,$4,$5)")
        .bind(attempt).bind(vendor).bind(alias).bind(vendor_revision).bind(model_revision)
        .execute(pool).await.unwrap();
    sqlx::query("UPDATE attempts SET dispatch_provider='openai',execution='may_have_executed',dispatched_at=clock_timestamp() WHERE id=$1")
        .bind(attempt)
        .execute(pool)
        .await
        .unwrap();
    attempt
}

async fn record_restriction(store: &Store, scope: TenantScope, attempt: Uuid) {
    store
        .save_request_failure(scope, attempt, RESTRICTION)
        .await
        .unwrap();
}

async fn record_timing(pool: &PgPool, attempt: Uuid) {
    sqlx::query("INSERT INTO request_timings(attempt_id,total_ms,complete,http_status) VALUES($1,1,true,200)")
        .bind(attempt)
        .execute(pool)
        .await
        .unwrap();
}

async fn confirm_completion(pool: &PgPool, attempt: Uuid) {
    sqlx::query("UPDATE attempts SET execution='confirmed_completed',completed_at=clock_timestamp() WHERE id=$1")
        .bind(attempt)
        .execute(pool)
        .await
        .unwrap();
}

async fn complete(pool: &PgPool, attempt: Uuid, order: EvidenceOrder) {
    match order {
        EvidenceOrder::TimingFirst => {
            record_timing(pool, attempt).await;
            confirm_completion(pool, attempt).await;
        }
        EvidenceOrder::ExecutionFirst => {
            confirm_completion(pool, attempt).await;
            record_timing(pool, attempt).await;
        }
    }
}

/// Latest incident for the observed connection and model alias:
/// (active, recovery attempt, observation count).
async fn incident_state(pool: &PgPool, vendor: Uuid, alias: &str) -> (bool, Option<Uuid>, i64) {
    sqlx::query_as("SELECT resolved_at IS NULL,recovery_attempt_id,observations FROM connection_incidents WHERE vendor_id=$1 AND model_alias=$2 ORDER BY id DESC LIMIT 1")
        .bind(vendor)
        .bind(alias)
        .fetch_one(pool)
        .await
        .unwrap()
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn recovery_requires_current_connection_and_model_revisions(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let vendor = new_vendor(&store, "connection revision fixture").await;
    let alias = "connection-revision-model";
    let model = new_model(&store, vendor.id, alias, "upstream-a").await;

    let failed = dispatch(
        &pool,
        &store,
        scope,
        vendor.id,
        alias,
        vendor.revision,
        model.revision,
    )
    .await;
    record_restriction(&store, scope, failed).await;
    let observed: Vec<(i64, i64)> = sqlx::query_as("SELECT o.vendor_revision,o.model_revision FROM connection_incident_observations o JOIN connection_incidents i ON i.id=o.incident_id WHERE i.vendor_id=$1 AND i.model_alias=$2")
        .bind(vendor.id)
        .bind(alias)
        .fetch_all(&pool)
        .await
        .unwrap();
    assert_eq!(observed, vec![(vendor.revision, model.revision)]);
    assert!(incident_state(&pool, vendor.id, alias).await.0);

    // Both candidates were dispatched under the revisions that are about to
    // become obsolete, and each completes only after those changes.
    let stale_timing = dispatch(
        &pool,
        &store,
        scope,
        vendor.id,
        alias,
        vendor.revision,
        model.revision,
    )
    .await;
    let stale_execution = dispatch(
        &pool,
        &store,
        scope,
        vendor.id,
        alias,
        vendor.revision,
        model.revision,
    )
    .await;

    let updated_vendor = store
        .update_vendor(
            vendor.id,
            VendorUpdate {
                name: vendor.name.clone(),
                api_base: "https://example.test/v2".into(),
                enabled: true,
                credential_ciphertext: None,
                expected_revision: vendor.revision,
            },
        )
        .await
        .unwrap();
    assert_eq!(
        updated_vendor.revision,
        vendor.revision + 1,
        "connection update must advance the connection revision"
    );
    let remapped = store
        .upsert_vendor_model(
            vendor.id,
            VendorModelInput {
                alias: alias.into(),
                upstream_model: "upstream-b".into(),
                public_catalog: false,
                enabled: true,
                capabilities: serde_json::json!({}),
                pricing: None,
                expected_revision: Some(model.revision),
            },
        )
        .await
        .unwrap();
    assert_eq!(
        remapped.revision,
        model.revision + 1,
        "target change must advance the model revision"
    );

    complete(&pool, stale_timing, EvidenceOrder::TimingFirst).await;
    complete(&pool, stale_execution, EvidenceOrder::ExecutionFirst).await;
    let (active, recovery, observations) = incident_state(&pool, vendor.id, alias).await;
    assert!(
        active,
        "success under obsolete connection/model revisions must not resolve the incident"
    );
    assert_eq!(recovery, None);
    assert_eq!(
        observations, 1,
        "stale successes must not add incident observations"
    );

    // Under the current revisions, execution alone and an incomplete timing
    // record are insufficient; the complete 2xx timing is the last evidence.
    let current = dispatch(
        &pool,
        &store,
        scope,
        vendor.id,
        alias,
        updated_vendor.revision,
        remapped.revision,
    )
    .await;
    confirm_completion(&pool, current).await;
    assert!(
        incident_state(&pool, vendor.id, alias).await.0,
        "execution evidence alone cannot resolve"
    );
    sqlx::query("INSERT INTO request_timings(attempt_id,total_ms,complete,http_status) VALUES($1,1,false,200)")
        .bind(current)
        .execute(&pool)
        .await
        .unwrap();
    assert!(
        incident_state(&pool, vendor.id, alias).await.0,
        "incomplete timing must not resolve"
    );
    sqlx::query("UPDATE request_timings SET complete=true WHERE attempt_id=$1")
        .bind(current)
        .execute(&pool)
        .await
        .unwrap();
    let (active, recovery, _) = incident_state(&pool, vendor.id, alias).await;
    assert!(!active);
    assert_eq!(recovery, Some(current));

    // Historical observation evidence keeps the revisions observed at failure
    // time, and exactly one incident row was created and resolved.
    let observed_after: Vec<(i64, i64)> = sqlx::query_as("SELECT o.vendor_revision,o.model_revision FROM connection_incident_observations o JOIN connection_incidents i ON i.id=o.incident_id WHERE i.vendor_id=$1 AND i.model_alias=$2")
        .bind(vendor.id)
        .bind(alias)
        .fetch_all(&pool)
        .await
        .unwrap();
    assert_eq!(
        observed_after,
        vec![(vendor.revision, model.revision)],
        "recovery must not rewrite historical observation revisions"
    );
    let incident_count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM connection_incidents WHERE vendor_id=$1 AND model_alias=$2",
    )
    .bind(vendor.id)
    .bind(alias)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(incident_count, 1);

    // Existing billing and execution-uncertainty semantics stay unchanged: the
    // restriction remains may_have_executed and no reservation or charge appears.
    let failure_attempt: (String, String) =
        sqlx::query_as("SELECT execution,usage_confidence FROM attempts WHERE id=$1")
            .bind(failed)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        failure_attempt,
        ("may_have_executed".into(), "unknown".into())
    );
    let failure_kind: String =
        sqlx::query_scalar("SELECT kind FROM request_failures WHERE attempt_id=$1")
            .bind(failed)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(failure_kind, "upstream_account_restricted");
    let reservations: i64 = sqlx::query_scalar(
        "SELECT (SELECT count(*) FROM cost_reservations WHERE attempt_id=$1)+(SELECT count(*) FROM customer_balance_reservations WHERE attempt_id=$1)",
    )
    .bind(failed)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(reservations, 0);

    // Bounded platform evidence describes the same resolved incident.
    let page = store
        .platform_connection_incidents(Some(vendor.id), Some("resolved"), None)
        .await
        .unwrap();
    let data = page["data"].as_array().unwrap();
    assert_eq!(data.len(), 1);
    assert_eq!(data[0]["status"], "resolved");
    assert_eq!(data[0]["observations"], "1");
    assert!(data[0]["recovered_at"].is_string());

    // A connection-level disable is also a configuration change: a success that
    // was already in flight cannot resolve the newer incident, and re-enabling
    // still requires a success under the re-enabled revision.
    let next_failure = dispatch(
        &pool,
        &store,
        scope,
        vendor.id,
        alias,
        updated_vendor.revision,
        remapped.revision,
    )
    .await;
    record_restriction(&store, scope, next_failure).await;
    let disabled_candidate = dispatch(
        &pool,
        &store,
        scope,
        vendor.id,
        alias,
        updated_vendor.revision,
        remapped.revision,
    )
    .await;
    let disabled_vendor = store
        .update_vendor(
            vendor.id,
            VendorUpdate {
                name: vendor.name.clone(),
                api_base: "https://example.test/v2".into(),
                enabled: false,
                credential_ciphertext: None,
                expected_revision: updated_vendor.revision,
            },
        )
        .await
        .unwrap();
    assert_eq!(disabled_vendor.revision, updated_vendor.revision + 1);
    complete(&pool, disabled_candidate, EvidenceOrder::TimingFirst).await;
    assert!(
        incident_state(&pool, vendor.id, alias).await.0,
        "success while the connection is disabled must not resolve"
    );
    let reenabled_vendor = store
        .update_vendor(
            vendor.id,
            VendorUpdate {
                name: vendor.name.clone(),
                api_base: "https://example.test/v2".into(),
                enabled: true,
                credential_ciphertext: None,
                expected_revision: disabled_vendor.revision,
            },
        )
        .await
        .unwrap();
    assert_eq!(reenabled_vendor.revision, disabled_vendor.revision + 1);
    let enabled_candidate = dispatch(
        &pool,
        &store,
        scope,
        vendor.id,
        alias,
        reenabled_vendor.revision,
        remapped.revision,
    )
    .await;
    complete(&pool, enabled_candidate, EvidenceOrder::ExecutionFirst).await;
    assert_eq!(
        incident_state(&pool, vendor.id, alias).await.1,
        Some(enabled_candidate)
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn pending_mapping_change_serializes_against_recovery(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let vendor = new_vendor(&store, "mapping race fixture").await;
    let alias = "mapping-race-model";
    let model = new_model(&store, vendor.id, alias, "upstream-a").await;
    let failed = dispatch(
        &pool,
        &store,
        scope,
        vendor.id,
        alias,
        vendor.revision,
        model.revision,
    )
    .await;
    record_restriction(&store, scope, failed).await;
    let candidate = dispatch(
        &pool,
        &store,
        scope,
        vendor.id,
        alias,
        vendor.revision,
        model.revision,
    )
    .await;
    // Successful timing is already durable; only the execution transition will
    // make the resolver consider this attempt. This is the in-flight recovery
    // whose evidence arrives while a mapping change is being committed.
    record_timing(&pool, candidate).await;

    // Hold the same row-level change that Store::upsert_vendor_model commits
    // (new upstream target plus revision+1) in an uncommitted transaction.
    let mut control = pool.acquire().await.unwrap();
    let mut evidence = pool.acquire().await.unwrap();
    let mut watcher = pool.acquire().await.unwrap();
    let evidence_pid: i32 = sqlx::query_scalar("SELECT pg_backend_pid()")
        .fetch_one(&mut *evidence)
        .await
        .unwrap();
    let mut pending = control.begin().await.unwrap();
    let revision: i64 = sqlx::query_scalar(
        "UPDATE vendor_models SET revision=revision+1,upstream_model='upstream-raced',updated_at=now() WHERE alias=$1 RETURNING revision",
    )
    .bind(alias)
    .fetch_one(&mut *pending)
    .await
    .unwrap();
    assert_eq!(revision, model.revision + 1);

    let success_evidence = async {
        sqlx::query("UPDATE attempts SET execution='confirmed_completed',completed_at=clock_timestamp() WHERE id=$1")
            .bind(candidate)
            .execute(&mut *evidence)
            .await
    };
    let finish_mapping_change = async {
        let mut blocked = false;
        for _ in 0..2_000 {
            let waiting: bool = sqlx::query_scalar(
                "SELECT COALESCE(wait_event_type='Lock',false) FROM pg_stat_activity WHERE pid=$1",
            )
            .bind(evidence_pid)
            .fetch_one(&mut *watcher)
            .await
            .unwrap();
            if waiting {
                blocked = true;
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(5)).await;
        }
        assert!(
            blocked,
            "recovery did not wait for the pending mapping change"
        );
        pending.commit().await.unwrap();
    };
    let (evidence_result, ()) = tokio::join!(success_evidence, finish_mapping_change);
    evidence_result.unwrap();

    let (active, recovery, _) = incident_state(&pool, vendor.id, alias).await;
    assert!(
        active,
        "recovery must be evaluated after the pending mapping revision commits"
    );
    assert_eq!(recovery, None);

    // A success dispatched after the committed mapping change resolves it.
    let current = dispatch(
        &pool,
        &store,
        scope,
        vendor.id,
        alias,
        vendor.revision,
        revision,
    )
    .await;
    complete(&pool, current, EvidenceOrder::TimingFirst).await;
    assert_eq!(
        incident_state(&pool, vendor.id, alias).await.1,
        Some(current)
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn newer_failure_or_incident_requires_later_current_success(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    for (alias, stale_order, current_order) in [
        (
            "newer-failure-timing-first",
            EvidenceOrder::TimingFirst,
            EvidenceOrder::ExecutionFirst,
        ),
        (
            "newer-failure-execution-first",
            EvidenceOrder::ExecutionFirst,
            EvidenceOrder::TimingFirst,
        ),
    ] {
        let vendor = new_vendor(&store, &format!("{alias} fixture")).await;
        let model = new_model(&store, vendor.id, alias, "upstream-current").await;
        let (vendor_revision, model_revision) = (vendor.revision, model.revision);

        let first_failure = dispatch(
            &pool,
            &store,
            scope,
            vendor.id,
            alias,
            vendor_revision,
            model_revision,
        )
        .await;
        record_restriction(&store, scope, first_failure).await;
        assert!(incident_state(&pool, vendor.id, alias).await.0);

        // An in-flight success dispatched after the first observation, then a
        // newer failure dispatched and recorded before that success completes.
        let older_success = dispatch(
            &pool,
            &store,
            scope,
            vendor.id,
            alias,
            vendor_revision,
            model_revision,
        )
        .await;
        let newer_failure = dispatch(
            &pool,
            &store,
            scope,
            vendor.id,
            alias,
            vendor_revision,
            model_revision,
        )
        .await;
        record_restriction(&store, scope, newer_failure).await;
        let observations = incident_state(&pool, vendor.id, alias).await.2;
        assert_eq!(observations, 2);

        complete(&pool, older_success, stale_order).await;
        let (active, recovery, _) = incident_state(&pool, vendor.id, alias).await;
        assert!(
            active,
            "a success dispatched before a newer failure cannot clear the newer evidence"
        );
        assert_eq!(recovery, None);

        let recovery_success = dispatch(
            &pool,
            &store,
            scope,
            vendor.id,
            alias,
            vendor_revision,
            model_revision,
        )
        .await;
        complete(&pool, recovery_success, current_order).await;
        assert_eq!(
            incident_state(&pool, vendor.id, alias).await.1,
            Some(recovery_success)
        );

        // A late success evidence arrival for an attempt dispatched before a
        // newer incident must not clear that newer incident.
        let stale_again = dispatch(
            &pool,
            &store,
            scope,
            vendor.id,
            alias,
            vendor_revision,
            model_revision,
        )
        .await;
        let third_failure = dispatch(
            &pool,
            &store,
            scope,
            vendor.id,
            alias,
            vendor_revision,
            model_revision,
        )
        .await;
        record_restriction(&store, scope, third_failure).await;
        let (active, recovery, observations) = incident_state(&pool, vendor.id, alias).await;
        assert!(active, "the newer failure must open a current incident");
        assert_eq!(recovery, None);
        assert_eq!(observations, 1);
        complete(&pool, stale_again, stale_order).await;
        let (active, recovery, _) = incident_state(&pool, vendor.id, alias).await;
        assert!(
            active,
            "stale success evidence must not clear a newer incident"
        );
        assert_eq!(recovery, None);

        let final_success = dispatch(
            &pool,
            &store,
            scope,
            vendor.id,
            alias,
            vendor_revision,
            model_revision,
        )
        .await;
        complete(&pool, final_success, current_order).await;
        assert_eq!(
            incident_state(&pool, vendor.id, alias).await.1,
            Some(final_success)
        );

        // Billing and upstream execution classification remain untouched.
        for failure in [first_failure, newer_failure, third_failure] {
            let execution: (String, String) =
                sqlx::query_as("SELECT execution,usage_confidence FROM attempts WHERE id=$1")
                    .bind(failure)
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(
                execution,
                ("may_have_executed".into(), "unknown".into()),
                "incident resolution must not infer nonexecution"
            );
        }
        let reservations: i64 = sqlx::query_scalar(
            "SELECT (SELECT count(*) FROM cost_reservations)+(SELECT count(*) FROM customer_balance_reservations)",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(reservations, 0);
    }
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn concurrent_failure_observation_blocks_recovery(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let vendor = new_vendor(&store, "failure race fixture").await;
    let alias = "failure-race-model";
    let model = new_model(&store, vendor.id, alias, "upstream-a").await;
    let failed = dispatch(
        &pool,
        &store,
        scope,
        vendor.id,
        alias,
        vendor.revision,
        model.revision,
    )
    .await;
    record_restriction(&store, scope, failed).await;
    let incident: i64 = sqlx::query_scalar(
        "SELECT id FROM connection_incidents WHERE vendor_id=$1 AND model_alias=$2 AND resolved_at IS NULL",
    )
    .bind(vendor.id)
    .bind(alias)
    .fetch_one(&pool)
    .await
    .unwrap();

    // Only execution is pending: successful timing is already durable.
    let candidate = dispatch(
        &pool,
        &store,
        scope,
        vendor.id,
        alias,
        vendor.revision,
        model.revision,
    )
    .await;
    record_timing(&pool, candidate).await;

    // Hold the recorder's newer-observation row update in an uncommitted
    // transaction: the same `last_observed_at`/`observations` conflict update
    // that a concurrent failure recording performs on the active incident.
    let mut control = pool.acquire().await.unwrap();
    let mut evidence = pool.acquire().await.unwrap();
    let mut watcher = pool.acquire().await.unwrap();
    let evidence_pid: i32 = sqlx::query_scalar("SELECT pg_backend_pid()")
        .fetch_one(&mut *evidence)
        .await
        .unwrap();
    let mut pending_failure = control.begin().await.unwrap();
    let observations: i64 = sqlx::query_scalar(
        "UPDATE connection_incidents SET last_observed_at=clock_timestamp(),observations=observations+1 WHERE id=$1 RETURNING observations",
    )
    .bind(incident)
    .fetch_one(&mut *pending_failure)
    .await
    .unwrap();
    assert_eq!(observations, 2);

    let success_evidence = async {
        sqlx::query("UPDATE attempts SET execution='confirmed_completed',completed_at=clock_timestamp() WHERE id=$1")
            .bind(candidate)
            .execute(&mut *evidence)
            .await
    };
    let finish_failure = async {
        let mut blocked = false;
        for _ in 0..2_000 {
            let waiting: bool = sqlx::query_scalar(
                "SELECT COALESCE(wait_event_type='Lock',false) FROM pg_stat_activity WHERE pid=$1",
            )
            .bind(evidence_pid)
            .fetch_one(&mut *watcher)
            .await
            .unwrap();
            if waiting {
                blocked = true;
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(5)).await;
        }
        assert!(
            blocked,
            "recovery did not wait for the pending failure observation"
        );
        pending_failure.commit().await.unwrap();
    };
    let (evidence_result, ()) = tokio::join!(success_evidence, finish_failure);
    evidence_result.unwrap();

    let (active, recovery, observations) = incident_state(&pool, vendor.id, alias).await;
    assert!(
        active,
        "a success dispatched before the newer failure observation must not resolve"
    );
    assert_eq!(recovery, None);
    assert_eq!(observations, 2);

    // A success dispatched after the newer observation resolves it.
    let current = dispatch(
        &pool,
        &store,
        scope,
        vendor.id,
        alias,
        vendor.revision,
        model.revision,
    )
    .await;
    complete(&pool, current, EvidenceOrder::TimingFirst).await;
    assert_eq!(
        incident_state(&pool, vendor.id, alias).await.1,
        Some(current)
    );
}
