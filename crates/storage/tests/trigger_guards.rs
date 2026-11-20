//! Migration-level tests for the prioritized attempt, route and billing guards.
//!
//! Each test names the trigger it exercises so `scripts/db_schema_inventory.py`
//! can count named coverage honestly. These are database tests: they run the
//! embedded migrations against a disposable PostgreSQL database and assert the
//! SQLSTATE or the store-level meaning, not only that an operation failed.
//!
//! Run with `python3 scripts/test-postgres.py trigger_ --package niu-storage --test trigger_guards`.
//! The test does not claim full schema coverage; see the untested list in
//! `docs/architecture/database-trigger-inventory.md`.

use niu_storage::trigger_error::{TRIGGER_CONSTRAINTS, TRIGGER_ERROR_CODES};
use niu_storage::{MIGRATOR, OperatorAuditActor, Store, StoreError, TenantScope};
use serde_json::json;
use sqlx::PgPool;
use uuid::Uuid;

fn sqlstate(error: &sqlx::Error) -> Option<String> {
    error
        .as_database_error()
        .and_then(|database| database.code())
        .map(|code| code.into_owned())
}

async fn workspace(pool: &PgPool) -> (Store, TenantScope) {
    MIGRATOR.run(pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    (store, scope)
}

async fn key(store: &Store, scope: TenantScope, name: &str) -> (Uuid, String) {
    let issued = store
        .issue_key(scope, name, &["*".into()], 3600)
        .await
        .unwrap();
    (issued.id, issued.token)
}

async fn attempt(store: &Store, scope: TenantScope, model: &str) -> (Uuid, Uuid) {
    let operation = store.create_operation(scope, model).await.unwrap();
    let attempt = store
        .prepare_attempt(scope, operation, model, "fixture")
        .await
        .unwrap();
    (operation, attempt)
}

/// Minimal text Vendor/model pair. The disposable database has no active
/// routing registry, so the registry writer guard is a no-op.
async fn vendor_model(pool: &PgPool, alias: &str, capabilities: serde_json::Value) -> Uuid {
    let vendor = Uuid::new_v4();
    sqlx::query("INSERT INTO vendors(id,name,adapter,api_base,credential_ciphertext) VALUES($1,$2,'openai','https://guard.invalid/v1',decode(repeat('ab',30),'hex'))")
        .bind(vendor)
        .bind(format!("guard-{vendor}"))
        .execute(pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO vendor_models(alias,vendor_id,upstream_model,capabilities) VALUES($1,$2,$3,$4)")
        .bind(alias)
        .bind(vendor)
        .bind(format!("upstream-{alias}"))
        .bind(capabilities)
        .execute(pool)
        .await
        .unwrap();
    vendor
}

async fn media_route(
    pool: &PgPool,
    scope: TenantScope,
    attempt: Uuid,
    vendor: Uuid,
    model: &str,
    vendor_revision: i64,
    model_revision: i64,
) {
    sqlx::query("INSERT INTO media_recovery_routes(organization_id,project_id,attempt_id,vendor_id,vendor_revision,model_revision,upstream_model,schema_revision,adapter,api_base) VALUES($1,$2,$3,$4,$5,$6,$7,'v1','openai','https://guard.invalid/v1')")
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(attempt)
        .bind(vendor)
        .bind(vendor_revision)
        .bind(model_revision)
        .bind(format!("upstream-{model}"))
        .execute(pool)
        .await
        .unwrap();
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn trigger_attempts_enforce_key_request_rate_blocks_disabled_and_exhausted(pool: PgPool) {
    let (store, scope) = workspace(&pool).await;
    let (key_id, token) = key(&store, scope, "request rate").await;
    let principal = store.authenticate(&token).await.unwrap();

    store
        .set_key_request_rate_policy(scope, key_id, Some(0), 0, OperatorAuditActor::Installation)
        .await
        .unwrap();
    let (_, disabled) = attempt(&store, scope, "fast").await;
    assert_eq!(
        store
            .mark_dispatched(&principal, disabled)
            .await
            .unwrap_err()
            .to_string(),
        StoreError::KeyRequestRateDisabled.to_string()
    );

    store
        .set_key_request_rate_policy(scope, key_id, Some(1), 1, OperatorAuditActor::Installation)
        .await
        .unwrap();
    let (_, first) = attempt(&store, scope, "fast").await;
    store.mark_dispatched(&principal, first).await.unwrap();
    let (_, second) = attempt(&store, scope, "fast").await;
    assert!(matches!(
        store.mark_dispatched(&principal, second).await,
        Err(StoreError::KeyRequestRateExceeded)
    ));
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn trigger_attempts_enforce_key_concurrency_blocks_second_unresolved_dispatch(pool: PgPool) {
    let (store, scope) = workspace(&pool).await;
    let (key_id, token) = key(&store, scope, "concurrency").await;
    let principal = store.authenticate(&token).await.unwrap();
    store
        .set_key_concurrency_policy(scope, key_id, Some(1), 0, OperatorAuditActor::Installation)
        .await
        .unwrap();
    let (_, first) = attempt(&store, scope, "fast").await;
    store.mark_dispatched(&principal, first).await.unwrap();
    let (_, second) = attempt(&store, scope, "fast").await;
    assert!(matches!(
        store.mark_dispatched(&principal, second).await,
        Err(StoreError::KeyConcurrencyExceeded)
    ));
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn trigger_attempts_enforce_key_token_rate_requires_bound_and_rejects_exhaustion(
    pool: PgPool,
) {
    let (store, scope) = workspace(&pool).await;
    let (key_id, token) = key(&store, scope, "token rate").await;
    let principal = store.authenticate(&token).await.unwrap();
    store
        .set_key_token_rate_policy(scope, key_id, Some(10), 0, OperatorAuditActor::Installation)
        .await
        .unwrap();

    let (_, unbounded) = attempt(&store, scope, "fast").await;
    assert!(matches!(
        store.mark_dispatched(&principal, unbounded).await,
        Err(StoreError::KeyTokenBoundRequired)
    ));

    let (_, bounded) = attempt(&store, scope, "fast").await;
    store
        .bind_key_token_bound(scope, bounded, Some(20))
        .await
        .unwrap();
    assert!(matches!(
        store.mark_dispatched(&principal, bounded).await,
        Err(StoreError::KeyTokenRateExceeded)
    ));
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn trigger_attempts_dispatch_requires_current_model_guardrails_rejects_denied_model(
    pool: PgPool,
) {
    let (store, scope) = workspace(&pool).await;
    let (key_id, _) = key(&store, scope, "guardrail").await;
    store
        .activate_workspace_guardrail(
            scope,
            0,
            &json!({"schema_version":1,"name":"Deny all","models":{"mode":"deny_all"},"providers":{"mode":"inherit"}}),
        )
        .await
        .unwrap();
    let (_, attempt) = attempt(&store, scope, "fast").await;
    let error = sqlx::query(
        "UPDATE attempts SET execution='may_have_executed',dispatched_at=clock_timestamp(),api_key_id=$2 WHERE id=$1",
    )
    .bind(attempt)
    .bind(key_id)
    .execute(&pool)
    .await
    .unwrap_err();
    assert_eq!(sqlstate(&error).as_deref(), Some("P0010"));
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn trigger_attempts_require_customer_balance_dispatch_rejects_unfunded_currency_dispatch(
    pool: PgPool,
) {
    let (store, scope) = workspace(&pool).await;
    sqlx::query(
        "INSERT INTO customer_balance_accounts(id,organization_id,currency) VALUES($1,$2,'USD')",
    )
    .bind(Uuid::new_v4())
    .bind(scope.organization_id)
    .execute(&pool)
    .await
    .unwrap();
    let (_, attempt) = attempt(&store, scope, "fast").await;
    let error = sqlx::query(
        "UPDATE attempts SET execution='may_have_executed',dispatched_at=clock_timestamp() WHERE id=$1",
    )
    .bind(attempt)
    .execute(&pool)
    .await
    .unwrap_err();
    assert_eq!(sqlstate(&error).as_deref(), Some("P0009"));
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn trigger_attempts_preserve_attempt_public_reference_rejects_rename(pool: PgPool) {
    let (store, scope) = workspace(&pool).await;
    let (_, attempt) = attempt(&store, scope, "fast").await;
    let error = sqlx::query("UPDATE attempts SET public_reference='renamed' WHERE id=$1")
        .bind(attempt)
        .execute(&pool)
        .await
        .unwrap_err();
    assert_eq!(sqlstate(&error).as_deref(), Some("P0001"));
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn trigger_attempts_immutable_dispatch_provider_snapshot_rejects_change_after_dispatch(
    pool: PgPool,
) {
    let (store, scope) = workspace(&pool).await;
    let (key_id, _) = key(&store, scope, "provider snapshot").await;
    let (_, attempt) = attempt(&store, scope, "fast").await;
    sqlx::query(
        "UPDATE attempts SET execution='may_have_executed',dispatched_at=clock_timestamp(),api_key_id=$2 WHERE id=$1",
    )
    .bind(attempt)
    .bind(key_id)
    .execute(&pool)
    .await
    .unwrap();
    let error = sqlx::query("UPDATE attempts SET dispatch_provider='openai' WHERE id=$1")
        .bind(attempt)
        .execute(&pool)
        .await
        .unwrap_err();
    assert_eq!(sqlstate(&error).as_deref(), Some("P0006"));
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn trigger_attempts_require_current_media_dispatch_route_rejects_stale_route(pool: PgPool) {
    let (store, scope) = workspace(&pool).await;
    let vendor = vendor_model(
        &pool,
        "media-model",
        json!({"video_schema":{"revision":"v1"}}),
    )
    .await;
    let (_, attempt) = attempt(&store, scope, "media-model").await;
    media_route(&pool, scope, attempt, vendor, "media-model", 1, 2).await;
    let error = sqlx::query(
        "UPDATE attempts SET execution='may_have_executed',dispatched_at=clock_timestamp() WHERE id=$1",
    )
    .bind(attempt)
    .execute(&pool)
    .await
    .unwrap_err();
    assert_eq!(sqlstate(&error).as_deref(), Some("23514"));
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn trigger_attempts_require_media_recovery_protocol_rejects_dispatch_without_protocol(
    pool: PgPool,
) {
    let (store, scope) = workspace(&pool).await;
    let vendor = vendor_model(
        &pool,
        "media-protocol",
        json!({"video_schema":{"revision":"v1"}}),
    )
    .await;
    let (_, attempt) = attempt(&store, scope, "media-protocol").await;
    media_route(&pool, scope, attempt, vendor, "media-protocol", 1, 1).await;
    let error = sqlx::query(
        "UPDATE attempts SET execution='may_have_executed',dispatched_at=clock_timestamp() WHERE id=$1",
    )
    .bind(attempt)
    .execute(&pool)
    .await
    .unwrap_err();
    assert_eq!(sqlstate(&error).as_deref(), Some("P0008"));
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn trigger_attempts_require_media_output_before_dispatch_rejects_missing_snapshot(
    pool: PgPool,
) {
    let (store, scope) = workspace(&pool).await;
    let vendor = vendor_model(
        &pool,
        "media-output",
        json!({"video_schema":{"revision":"v1","output":{"kind":"video"}}}),
    )
    .await;
    let (_, attempt) = attempt(&store, scope, "media-output").await;
    media_route(&pool, scope, attempt, vendor, "media-output", 1, 1).await;
    let error = sqlx::query("UPDATE attempts SET dispatched_at=clock_timestamp() WHERE id=$1")
        .bind(attempt)
        .execute(&pool)
        .await
        .unwrap_err();
    assert_eq!(sqlstate(&error).as_deref(), Some("P0001"));
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn trigger_attempts_require_media_completion_evidence_rejects_unresolved_job(pool: PgPool) {
    let (store, scope) = workspace(&pool).await;
    let vendor = vendor_model(
        &pool,
        "media-completion",
        json!({"video_schema":{"revision":"v1"}}),
    )
    .await;
    let (_, attempt) = attempt(&store, scope, "media-completion").await;
    media_route(&pool, scope, attempt, vendor, "media-completion", 1, 1).await;
    sqlx::query("INSERT INTO media_jobs(organization_id,project_id,attempt_id,upstream_job_id,schema_revision) VALUES($1,$2,$3,'job-1','v1')")
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(attempt)
        .execute(&pool)
        .await
        .unwrap();
    let error = sqlx::query("UPDATE attempts SET execution='confirmed_completed',completed_at=clock_timestamp() WHERE id=$1")
        .bind(attempt)
        .execute(&pool)
        .await
        .unwrap_err();
    assert_eq!(sqlstate(&error).as_deref(), Some("23514"));
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn trigger_attempts_enforce_vendor_request_rate_rejects_disabled_credential(pool: PgPool) {
    let (store, scope) = workspace(&pool).await;
    let vendor = vendor_model(&pool, "vendor-rate", json!({})).await;
    let (_, attempt) = attempt(&store, scope, "vendor-rate").await;
    sqlx::query("INSERT INTO managed_attempt_routes(attempt_id,vendor_id,model_alias,vendor_revision,model_revision) VALUES($1,$2,'vendor-rate',1,1)")
        .bind(attempt)
        .bind(vendor)
        .execute(&pool)
        .await
        .unwrap();
    // `initialize_vendor_request_rate` seeds revision 0 with no limit.
    store
        .set_vendor_request_rate_policy(vendor, Some(0), 0, OperatorAuditActor::Installation)
        .await
        .unwrap();
    let error = sqlx::query(
        "UPDATE attempts SET execution='may_have_executed',dispatched_at=clock_timestamp(),dispatch_provider='openai' WHERE id=$1",
    )
    .bind(attempt)
    .execute(&pool)
    .await
    .unwrap_err();
    assert_eq!(sqlstate(&error).as_deref(), Some("P0027"));
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn trigger_attempts_zy_check_inspected_guardrail_binding_requires_input_binding(
    pool: PgPool,
) {
    let (store, scope) = workspace(&pool).await;
    let (key_id, _) = key(&store, scope, "inspection binding").await;
    store
        .activate_workspace_guardrail(
            scope,
            0,
            &json!({
                "schema_version":1,
                "name":"Require input inspection",
                "models":{"mode":"inherit"},
                "providers":{"mode":"inherit"},
                "input_rules":[{"pattern":"blocked","action":"block"}]
            }),
        )
        .await
        .unwrap();
    let (_, attempt) = attempt(&store, scope, "fast").await;
    let error = sqlx::query(
        "UPDATE attempts SET execution='may_have_executed',dispatched_at=clock_timestamp(),api_key_id=$2 WHERE id=$1",
    )
    .bind(attempt)
    .bind(key_id)
    .execute(&pool)
    .await
    .unwrap_err();
    assert_eq!(sqlstate(&error).as_deref(), Some("P0010"));
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn trigger_attempts_recheck_managed_attempt_route_rejects_stale_vendor_revision(
    pool: PgPool,
) {
    let (store, scope) = workspace(&pool).await;
    let vendor = vendor_model(&pool, "managed-model", json!({})).await;
    let (_, attempt) = attempt(&store, scope, "managed-model").await;
    sqlx::query("INSERT INTO managed_attempt_routes(attempt_id,vendor_id,model_alias,vendor_revision,model_revision) VALUES($1,$2,'managed-model',99,1)")
        .bind(attempt)
        .bind(vendor)
        .execute(&pool)
        .await
        .unwrap();
    let error = sqlx::query(
        "UPDATE attempts SET execution='may_have_executed',dispatched_at=clock_timestamp() WHERE id=$1",
    )
    .bind(attempt)
    .execute(&pool)
    .await
    .unwrap_err();
    assert_eq!(sqlstate(&error).as_deref(), Some("P0024"));
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn trigger_managed_attempt_routes_protect_managed_attempt_route_rejects_update(pool: PgPool) {
    let (store, scope) = workspace(&pool).await;
    let vendor = vendor_model(&pool, "managed-immutable", json!({})).await;
    let (_, attempt) = attempt(&store, scope, "managed-immutable").await;
    sqlx::query("INSERT INTO managed_attempt_routes(attempt_id,vendor_id,model_alias,vendor_revision,model_revision) VALUES($1,$2,'managed-immutable',1,1)")
        .bind(attempt)
        .bind(vendor)
        .execute(&pool)
        .await
        .unwrap();
    let error =
        sqlx::query("UPDATE managed_attempt_routes SET vendor_revision=2 WHERE attempt_id=$1")
            .bind(attempt)
            .execute(&pool)
            .await
            .unwrap_err();
    assert_eq!(sqlstate(&error).as_deref(), Some("P0024"));
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn trigger_model_route_pools_protect_model_route_pool_rejects_identity_change(pool: PgPool) {
    workspace(&pool).await;
    sqlx::query("INSERT INTO model_route_pools(alias,enabled,revision,candidates) VALUES('guard-pool',true,1,'[{\"alias\":\"guard-pool\",\"enabled\":true}]'::jsonb)")
        .execute(&pool)
        .await
        .unwrap();
    let error =
        sqlx::query("UPDATE model_route_pools SET alias='renamed-pool' WHERE alias='guard-pool'")
            .execute(&pool)
            .await
            .unwrap_err();
    assert_eq!(sqlstate(&error).as_deref(), Some("P0024"));
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn trigger_customer_balance_accounts_platform_currency_guard_rejects_mismatched_money_row(
    pool: PgPool,
) {
    let (_store, scope) = workspace(&pool).await;
    sqlx::query("INSERT INTO platform_currency(singleton,currency) VALUES(true,'USD')")
        .execute(&pool)
        .await
        .unwrap();
    let error = sqlx::query(
        "INSERT INTO customer_balance_accounts(id,organization_id,currency) VALUES($1,$2,'CNY')",
    )
    .bind(Uuid::new_v4())
    .bind(scope.organization_id)
    .execute(&pool)
    .await
    .unwrap_err();
    assert_eq!(sqlstate(&error).as_deref(), Some("23514"));
    assert_eq!(
        error
            .as_database_error()
            .and_then(|database| database.constraint()),
        Some("platform_currency_guard")
    );
    assert!(matches!(
        niu_storage::trigger_error::classify(&error),
        Some(StoreError::PlatformCurrencyMismatch)
    ));
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn trigger_attempts_require_gateway_retry_deadline_is_rust_owned(pool: PgPool) {
    let (store, scope) = workspace(&pool).await;
    let (key_id, token) = key(&store, scope, "retry deadline").await;
    let principal = store.authenticate(&token).await.unwrap();
    let (operation, attempt) = attempt(&store, scope, "fast").await;
    sqlx::query("INSERT INTO gateway_retry_policies(operation_id,key_id,policy_revision,maximum_attempts,deadline) VALUES($1,$2,'openrouter-chat-auth-rejection-v1',2,clock_timestamp()-interval '1 second')")
        .bind(operation)
        .bind(key_id)
        .execute(&pool)
        .await
        .unwrap();
    assert!(matches!(
        store.mark_dispatched(&principal, attempt).await,
        Err(StoreError::GatewayRequestDeadlineExceeded)
    ));
    let execution: String = sqlx::query_scalar("SELECT execution FROM attempts WHERE id=$1")
        .bind(attempt)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(execution, "not_sent");
}

/// The tables in `trigger_error` are the single mapping. Read the effective
/// schema and fail when a custom SQLSTATE or named trigger constraint is absent.
#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn trigger_error_tables_cover_effective_schema(pool: PgPool) {
    workspace(&pool).await;
    let codes: Vec<String> = sqlx::query_scalar(
        "SELECT DISTINCT (regexp_matches(p.prosrc, 'ERRCODE\\s*=\\s*''(P[0-9]{4})''', 'g'))[1] \
         FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace \
         WHERE n.nspname='public' AND p.prokind='f' AND p.prosrc ~ 'RAISE EXCEPTION'",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    let mapped_codes: std::collections::HashSet<&str> = TRIGGER_ERROR_CODES
        .iter()
        .map(|mapping| mapping.code)
        .collect();
    for code in &codes {
        assert!(
            mapped_codes.contains(code.as_str()),
            "custom SQLSTATE {code} is raised by a trigger function but missing from TRIGGER_ERROR_CODES"
        );
    }

    let constraints: Vec<String> = sqlx::query_scalar(
        "SELECT DISTINCT (regexp_matches(p.prosrc, 'CONSTRAINT\\s*=\\s*''([a-z0-9_]+)''', 'g'))[1] \
         FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace \
         WHERE n.nspname='public' AND p.prokind='f' AND p.prosrc ~ 'CONSTRAINT'",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    let mapped_constraints: std::collections::HashSet<&str> = TRIGGER_CONSTRAINTS
        .iter()
        .map(|mapping| mapping.name)
        .collect();
    for constraint in &constraints {
        assert!(
            mapped_constraints.contains(constraint.as_str()),
            "trigger constraint {constraint} is missing from TRIGGER_CONSTRAINTS"
        );
    }
    assert!(!codes.is_empty());
    assert!(!constraints.is_empty());
}
