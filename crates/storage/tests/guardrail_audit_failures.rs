use niu_storage::{
    GatewayAdmission, GatewayAdmissionStatus, GatewayReservation, MIGRATOR, PriceInput, Principal,
    Store, StoreError, TenantScope, TokenRates,
};
use serde_json::json;
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Clone, Copy)]
enum Admission {
    Prepared,
    Priced,
    Batch,
}

struct Fixture {
    mode: Admission,
    scope: TenantScope,
    principal: Principal,
    operation: Uuid,
    attempt: Uuid,
    reservation: Option<GatewayReservation>,
    batch_extra: Option<(Uuid, Uuid)>,
}

async fn fixture(store: &Store, mode: Admission) -> Fixture {
    let root = store.default_workspace().await.unwrap();
    let scope = store
        .create_project(root.organization_id, "Audit failure qualification")
        .await
        .unwrap();
    let key = store
        .issue_key(scope, "Denied admission", &["fast".into()], 3600)
        .await
        .unwrap();
    let principal = store.authenticate(&key.token).await.unwrap();
    let reservation = if matches!(mode, Admission::Priced) {
        store.create_budget(scope, "USD", 100).await.unwrap();
        let price = store
            .publish_price(
                scope,
                PriceInput {
                    resource_id: "fast",
                    offer_revision: "v1",
                    currency: "USD",
                    api_equivalent: TokenRates {
                        prompt: 1_000_000,
                        completion: 1_000_000,
                    },
                    cash: TokenRates {
                        prompt: 1_000_000,
                        completion: 1_000_000,
                    },
                },
            )
            .await
            .unwrap();
        Some(GatewayReservation {
            price_revision_id: price,
            resource_id: "fast".into(),
            offer_revision: "v1".into(),
            prompt_bound: 10,
            completion_bound: 10,
            can_report_reasoning_tokens: true,
        })
    } else {
        None
    };
    let (operation, attempt) = if matches!(mode, Admission::Batch) {
        (Uuid::new_v4(), Uuid::new_v4())
    } else {
        let operation = store.create_operation(scope, "fast").await.unwrap();
        let attempt = store
            .prepare_attempt(scope, operation, "fast", "v1")
            .await
            .unwrap();
        (operation, attempt)
    };
    store.activate_workspace_guardrail(scope, 0, &json!({"schema_version":1,"name":"Mandatory denial","models":{"mode":"deny_all"},"providers":{"mode":"inherit"}})).await.unwrap();
    Fixture {
        mode,
        scope,
        principal,
        operation,
        attempt,
        reservation,
        batch_extra: matches!(mode, Admission::Batch).then(|| (Uuid::new_v4(), Uuid::new_v4())),
    }
}

async fn admit(store: &Store, f: &Fixture) -> Result<(), StoreError> {
    match f.mode {
        Admission::Prepared => store.mark_dispatched(&f.principal, f.attempt).await,
        Admission::Priced => {
            store
                .reserve_and_dispatch_gateway(
                    &f.principal,
                    f.attempt,
                    f.reservation.as_ref().unwrap(),
                )
                .await
        }
        Admission::Batch => {
            let statuses = store
                .admit_unpriced_gateway_batch(
                    [Some((f.operation, f.attempt)), f.batch_extra]
                        .into_iter()
                        .flatten()
                        .map(|(operation, attempt)| GatewayAdmission {
                            managed_route: None,
                            token_bound: None,
                            inspected_guardrails: None,
                            operation_id: operation,
                            attempt_id: attempt,
                            scope: f.scope,
                            key_id: f.principal.key_id(),
                            model: "fast".into(),
                            upstream_model: "fast".into(),
                            dispatch_provider: "openai".into(),
                            api_base: None,
                            task_id: None,
                            revision: "v1".into(),
                        })
                        .collect(),
                )
                .await?;
            assert!(
                statuses
                    .iter()
                    .all(|status| *status == GatewayAdmissionStatus::Admitted)
            );
            Ok(())
        }
    }
}

async fn assert_no_dispatch(store: &Store, pool: &PgPool, f: &Fixture) {
    let row = store.attempt(f.scope, f.attempt).await.unwrap();
    if matches!(f.mode, Admission::Batch) {
        assert!(row.is_none(), "failed batch must roll back its attempt");
        let operation: bool =
            sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM operations WHERE id=$1)")
                .bind(f.operation)
                .fetch_one(pool)
                .await
                .unwrap();
        assert!(!operation, "failed batch must roll back its operation");
        if let Some((operation, attempt)) = f.batch_extra {
            assert!(store.attempt(f.scope, attempt).await.unwrap().is_none());
            let exists: bool =
                sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM operations WHERE id=$1)")
                    .bind(operation)
                    .fetch_one(pool)
                    .await
                    .unwrap();
            assert!(!exists, "every member of the failed batch must roll back");
        }
    } else {
        assert_eq!(row.unwrap().execution, "not_sent");
    }
    let reservations: i64 =
        sqlx::query_scalar("SELECT count(*) FROM cost_reservations WHERE attempt_id=$1")
            .bind(f.attempt)
            .fetch_one(pool)
            .await
            .unwrap();
    assert_eq!(reservations, 0);
    assert!(
        store
            .dispatch_guardrail_decision(f.scope, f.attempt)
            .await
            .unwrap()
            .is_none()
    );
    if let Some(budget) = store.budget(f.scope).await.unwrap() {
        assert_eq!((budget.reserved_nanos, budget.spent_nanos), (0, 0));
    }
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn denial_audit_write_failure_is_fail_closed_and_recoverable(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    sqlx::query("CREATE FUNCTION fixture_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected audit storage failure' USING ERRCODE='XX000'; END; $$").execute(&pool).await.unwrap();
    for mode in [Admission::Prepared, Admission::Priced, Admission::Batch] {
        let f = fixture(&store, mode).await;
        for table in [
            "dispatch_guardrail_rejections",
            "batch_guardrail_rejections",
        ] {
            // Fixed test-owned identifiers; no request text enters SQL.
            sqlx::query(&format!("CREATE TRIGGER fixture_audit_failure BEFORE INSERT ON {table} FOR EACH ROW EXECUTE FUNCTION fixture_reject_audit()" )).execute(&pool).await.unwrap();
        }
        assert!(
            matches!(admit(&store, &f).await, Err(StoreError::Database(ref error)) if error.as_database_error().and_then(|e| e.code()).as_deref() == Some("XX000")),
            "failed audit must never acknowledge admission or a recorded denial"
        );
        assert_no_dispatch(&store, &pool, &f).await;
        assert!(
            store
                .guardrail_dispatch_denials(f.scope)
                .await
                .unwrap()
                .is_empty()
        );
        for table in [
            "dispatch_guardrail_rejections",
            "batch_guardrail_rejections",
        ] {
            sqlx::query(&format!("DROP TRIGGER fixture_audit_failure ON {table}"))
                .execute(&pool)
                .await
                .unwrap();
        }
        assert!(matches!(admit(&store, &f).await, Err(StoreError::Conflict)));
        assert_no_dispatch(&store, &pool, &f).await;
        let denials = store.guardrail_dispatch_denials(f.scope).await.unwrap();
        assert_eq!(denials.len(), 1);
        assert_eq!(denials[0]["reason"], "access_denied");
        assert_eq!(denials[0]["workspace_revision"], 1);
    }
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn database_cancellation_before_admission_keeps_denied_work_unsent(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    for mode in [Admission::Prepared, Admission::Priced, Admission::Batch] {
        let f = fixture(&store, mode).await;
        let scope = f.scope;
        let mut holder = pool.begin().await.unwrap();
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('niu-guardrails:'||$1::text||':'||$2::text,0))").bind(scope.organization_id).bind(scope.project_id).execute(&mut *holder).await.unwrap();
        let worker_store = store.clone();
        let worker = tokio::spawn(async move {
            let result = admit(&worker_store, &f).await;
            (f, result)
        });
        let pid = tokio::time::timeout(std::time::Duration::from_secs(5), async {
            loop {
                let pids: Vec<i32> = sqlx::query_scalar("SELECT DISTINCT pid FROM pg_locks WHERE locktype='advisory' AND NOT granted AND database=(SELECT oid FROM pg_database WHERE datname=current_database())").fetch_all(&pool).await.unwrap();
                if !pids.is_empty() { assert_eq!(pids.len(), 1); break pids[0]; }
                tokio::task::yield_now().await;
            }
        }).await.expect("admission must be observed waiting before cancellation");
        let cancelled: bool = sqlx::query_scalar("SELECT pg_cancel_backend($1)")
            .bind(pid)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert!(cancelled);
        let (f, result) = tokio::time::timeout(std::time::Duration::from_secs(5), worker)
            .await
            .unwrap()
            .unwrap();
        assert!(
            matches!(result, Err(StoreError::Database(ref error)) if error.as_database_error().and_then(|e| e.code()).as_deref()==Some("57014"))
        );
        holder.rollback().await.unwrap();
        assert_no_dispatch(&store, &pool, &f).await;
        assert!(
            store
                .guardrail_dispatch_denials(scope)
                .await
                .unwrap()
                .is_empty(),
            "cancelled precheck must not fabricate a checked policy denial"
        );
        assert!(matches!(admit(&store, &f).await, Err(StoreError::Conflict)));
        assert_no_dispatch(&store, &pool, &f).await;
        assert_eq!(
            store.guardrail_dispatch_denials(scope).await.unwrap().len(),
            1
        );
    }
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn prepaid_policy_denial_commits_audit_and_releases_customer_hold(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let f = fixture(&store, Admission::Priced).await;
    store
        .record_settled_customer_funding(
            f.scope.organization_id,
            "USD",
            100,
            "fixture",
            "denial-funding",
        )
        .await
        .unwrap();
    store
        .publish_customer_tariff(
            f.scope,
            &niu_storage::ProviderOfferInput {
                model_alias: "fast".into(),
                currency: "USD".into(),
                prompt_rate: "1000000".into(),
                completion_rate: "1000000".into(),
                expected_revision: None,
            },
        )
        .await
        .unwrap();
    store
        .bind_customer_tariff(f.scope, f.attempt, "fast")
        .await
        .unwrap();
    assert!(matches!(admit(&store, &f).await, Err(StoreError::Conflict)));
    assert_no_dispatch(&store, &pool, &f).await;
    assert_eq!(
        store
            .guardrail_dispatch_denials(f.scope)
            .await
            .unwrap()
            .len(),
        1
    );
    let balances = store
        .customer_balance_summary(f.scope.organization_id)
        .await
        .unwrap();
    assert_eq!(balances[0]["balance_nanos"], "100");
    assert_eq!(balances[0]["reserved_nanos"], "0");
    assert_eq!(balances[0]["available_nanos"], "100");
}
