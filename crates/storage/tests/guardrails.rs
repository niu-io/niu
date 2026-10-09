use niu_storage::{MIGRATOR, Store};
use serde_json::json;
use sqlx::PgPool;

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn policy_activation_is_durable_scoped_and_concurrency_safe(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let other = store
        .create_project(scope.organization_id, "Other policy workspace")
        .await
        .unwrap();
    let policy = json!({"schema_version":1,"name":"Initial","models":{"mode":"deny_all"},"providers":{"mode":"inherit"}});
    assert!(store.workspace_guardrail(scope).await.unwrap().is_none());
    assert_eq!(
        store
            .activate_workspace_guardrail(scope, 0, &policy)
            .await
            .unwrap(),
        1
    );
    assert!(store.workspace_guardrail(other).await.unwrap().is_none());
    let updated = json!({"schema_version":1,"name":"Next","models":{"mode":"deny_all"},"providers":{"mode":"inherit"}});
    let (a, b) = tokio::join!(
        store.activate_workspace_guardrail(scope, 1, &updated),
        store.activate_workspace_guardrail(scope, 1, &updated)
    );
    assert_eq!(usize::from(a.is_ok()) + usize::from(b.is_ok()), 1);
    assert!(
        store
            .activate_workspace_guardrail(scope, 1, &policy)
            .await
            .is_err()
    );
    let reopened = Store::from_pool(
        PgPool::connect_with((*pool.connect_options()).clone())
            .await
            .unwrap(),
    );
    assert_eq!(
        reopened.workspace_guardrail(scope).await.unwrap(),
        Some(json!({"revision":2,"policy":updated.clone()}))
    );
    let original: serde_json::Value = sqlx::query_scalar("SELECT policy FROM workspace_guardrail_revisions WHERE organization_id=$1 AND project_id=$2 AND revision=1")
        .bind(scope.organization_id).bind(scope.project_id).fetch_one(&pool).await.unwrap();
    assert_eq!(original, policy);
    let key = store
        .issue_key(scope, "Policy key", &["*".into()], 3600)
        .await
        .unwrap();
    let other_key = store
        .issue_key(other, "Other key", &["*".into()], 3600)
        .await
        .unwrap();
    let unassigned = store
        .guardrail_snapshot(scope, key.id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(unassigned.workspace_revision, Some(2));
    assert!(unassigned.key_assignment_revision.is_none());
    assert!(unassigned.key_policy_revision.is_none());
    assert!(unassigned.key_policy.is_none());
    assert!(
        store
            .assign_key_guardrail(scope, other_key.id, 1, 0)
            .await
            .is_err()
    );
    assert!(
        store
            .assign_key_guardrail(other, key.id, 1, 0)
            .await
            .is_err()
    );
    assert_eq!(
        store
            .assign_key_guardrail(scope, key.id, 1, 0)
            .await
            .unwrap(),
        1
    );
    assert!(
        store
            .assign_key_guardrail(scope, key.id, 2, 0)
            .await
            .is_err()
    );
    assert_eq!(
        store.key_guardrail(scope, key.id).await.unwrap(),
        Some(policy.clone())
    );
    let snapshot = store
        .guardrail_snapshot(scope, key.id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(snapshot.workspace_revision, Some(2));
    assert_eq!(snapshot.workspace_policy, Some(updated.clone()));
    assert_eq!(snapshot.key_assignment_revision, Some(1));
    assert_eq!(snapshot.key_policy_revision, Some(1));
    assert_eq!(snapshot.key_policy, Some(policy));
    assert!(
        store
            .guardrail_snapshot(other, key.id)
            .await
            .unwrap()
            .is_none()
    );
    assert!(store.key_guardrail(other, key.id).await.unwrap().is_none());
    assert_eq!(
        store
            .assign_key_guardrail(scope, key.id, 2, 1)
            .await
            .unwrap(),
        2
    );
    assert_eq!(
        reopened.key_guardrail(scope, key.id).await.unwrap(),
        Some(updated)
    );
    let rotated = store.rotate_key(scope, key.id).await.unwrap();
    assert_eq!(
        store.key_guardrail(scope, rotated.id).await.unwrap(),
        store.key_guardrail(scope, key.id).await.unwrap()
    );
    assert!(
        store
            .assign_key_guardrail(scope, key.id, 1, 2)
            .await
            .is_err()
    );
    assert!(store.authenticate(&key.token).await.is_err());
    assert!(store.authenticate(&rotated.token).await.is_ok());
    let inherited = store
        .key_guardrail_history(scope, rotated.id, None)
        .await
        .unwrap();
    assert_eq!(inherited.len(), 1);
    assert_eq!(inherited[0]["assignment_revision"], 2);
    assert_eq!(inherited[0]["policy_revision"], 2);
    assert_eq!(inherited[0]["actor_name"], "System");
    assert!(
        store
            .key_guardrail_history(other, rotated.id, None)
            .await
            .unwrap()
            .is_empty()
    );
    let history: Vec<(i64, i64, String)> = sqlx::query_as("SELECT assignment_revision,policy_revision,actor FROM key_guardrail_assignment_events WHERE key_id=$1 ORDER BY assignment_revision")
        .bind(key.id).fetch_all(&pool).await.unwrap();
    assert_eq!(
        history,
        vec![(1, 1, "system".into()), (2, 2, "system".into())]
    );
    assert!(
        sqlx::query("DELETE FROM key_guardrail_assignment_events WHERE key_id=$1")
            .bind(key.id)
            .execute(&pool)
            .await
            .is_err()
    );

    let (first, second) = tokio::join!(
        store.assign_key_guardrail_as(scope, rotated.id, 1, 2, "reviewer-one"),
        reopened.assign_key_guardrail_as(scope, rotated.id, 2, 2, "reviewer-two"),
    );
    assert_eq!(usize::from(first.is_ok()) + usize::from(second.is_ok()), 1);
    let committed: Vec<(i64, String)> = sqlx::query_as(
        "SELECT assignment_revision,actor FROM key_guardrail_assignment_events WHERE key_id=$1 ORDER BY assignment_revision",
    )
    .bind(rotated.id)
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(committed.len(), 2);
    assert_eq!(committed[0], (2, "system".into()));
    assert_eq!(committed[1].0, 3);
    assert_eq!(
        committed[1].1,
        if first.is_ok() {
            "reviewer-one"
        } else {
            "reviewer-two"
        }
    );

    assert_eq!(
        store
            .clear_key_guardrail_as(scope, rotated.id, 3, "reviewer-clear")
            .await
            .unwrap(),
        4
    );
    assert!(
        store
            .key_guardrail(scope, rotated.id)
            .await
            .unwrap()
            .is_none()
    );
    let cleared = store
        .key_guardrail_assignment(scope, rotated.id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(cleared["assignment_revision"], 4);
    assert!(cleared["policy_revision"].is_null());
    assert!(cleared["policy"].is_null());
    assert!(
        store
            .assign_key_guardrail(scope, rotated.id, 1, 0)
            .await
            .is_err()
    );
    assert!(
        store
            .assign_key_guardrail(scope, rotated.id, 1, 3)
            .await
            .is_err()
    );
    assert!(
        store
            .clear_key_guardrail_as(scope, rotated.id, 3, "stale")
            .await
            .is_err()
    );
    let removal: (Option<i64>, String) = sqlx::query_as("SELECT policy_revision,actor FROM key_guardrail_assignment_events WHERE key_id=$1 AND assignment_revision=4")
        .bind(rotated.id).fetch_one(&pool).await.unwrap();
    assert_eq!(removal, (None, "reviewer-clear".into()));
    assert_eq!(
        store
            .assign_key_guardrail(scope, rotated.id, 1, 4)
            .await
            .unwrap(),
        5
    );
    assert_eq!(
        store
            .clear_key_guardrail_as(scope, rotated.id, 5, "reviewer-clear-again")
            .await
            .unwrap(),
        6
    );
    let cleared_rotation = store.rotate_key(scope, rotated.id).await.unwrap();
    let cleared_history = reopened
        .key_guardrail_history(scope, cleared_rotation.id, None)
        .await
        .unwrap();
    assert_eq!(cleared_history.len(), 1);
    assert_eq!(cleared_history[0]["assignment_revision"], 6);
    assert!(cleared_history[0]["policy_revision"].is_null());
    assert!(
        reopened
            .key_guardrail(scope, cleared_rotation.id)
            .await
            .unwrap()
            .is_none()
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn prepared_attempt_rechecks_current_workspace_and_key_model_policy(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let key = store
        .issue_key(scope, "Dispatch policy fixture", &["*".into()], 3600)
        .await
        .unwrap();
    let principal = store.authenticate(&key.token).await.unwrap();
    let deny = json!({"schema_version":1,"name":"Mandatory","models":{"mode":"deny_all"},"providers":{"mode":"inherit"}});
    let allow = json!({"schema_version":1,"name":"Allowed","models":{"mode":"allow_all"},"providers":{"mode":"inherit"}});
    for use_key in [false, true] {
        let operation = store.create_operation(scope, "fast").await.unwrap();
        let attempt = store
            .prepare_attempt(scope, operation, "fast", "dispatch-policy")
            .await
            .unwrap();
        if !use_key {
            store
                .activate_workspace_guardrail(scope, 0, &deny)
                .await
                .unwrap();
        } else {
            store
                .activate_workspace_guardrail(scope, 1, &allow)
                .await
                .unwrap();
            store
                .assign_key_guardrail(scope, key.id, 1, 0)
                .await
                .unwrap();
        }
        let error = sqlx::query(
            "UPDATE attempts SET execution='may_have_executed',api_key_id=$2 WHERE id=$1",
        )
        .bind(attempt)
        .bind(key.id)
        .execute(&pool)
        .await
        .unwrap_err();
        let database = error.as_database_error().unwrap();
        assert_eq!(database.code().as_deref(), Some("P0010"));
        let postgres = database
            .try_downcast_ref::<sqlx::postgres::PgDatabaseError>()
            .unwrap();
        let metadata: serde_json::Value = serde_json::from_str(postgres.detail().unwrap()).unwrap();
        assert_eq!(metadata["reason"], "access_denied");
        assert_eq!(metadata["workspace_revision"], if use_key { 2 } else { 1 });
        assert_eq!(
            metadata["key_policy_revision"],
            if use_key { json!(1) } else { json!(null) }
        );
        assert_eq!(metadata.as_object().unwrap().len(), 7);
        assert!(matches!(
            store.mark_dispatched(&principal, attempt).await,
            Err(niu_storage::StoreError::Conflict)
        ));
        let audits: Vec<serde_json::Value> = sqlx::query_scalar("SELECT jsonb_build_object('reason',reason,'workspace_revision',workspace_revision,'key_policy_revision',key_policy_revision) FROM dispatch_guardrail_rejections WHERE attempt_id=$1")
            .bind(attempt).fetch_all(&pool).await.unwrap();
        assert_eq!(audits.len(), 1);
        assert_eq!(audits[0]["reason"], "access_denied");
        assert_eq!(audits[0]["workspace_revision"], if use_key { 2 } else { 1 });
        assert_eq!(
            audits[0]["key_policy_revision"],
            if use_key { json!(1) } else { json!(null) }
        );
        assert!(
            store
                .dispatch_guardrail_decision(scope, attempt)
                .await
                .unwrap()
                .is_none()
        );
        assert!(
            sqlx::query("DELETE FROM dispatch_guardrail_rejections WHERE attempt_id=$1")
                .bind(attempt)
                .execute(&pool)
                .await
                .is_err()
        );
        assert_eq!(
            store
                .attempt(scope, attempt)
                .await
                .unwrap()
                .unwrap()
                .execution,
            "not_sent"
        );
    }
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn prepared_attempt_rechecks_provider_rules_with_recorded_identity(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let key = store
        .issue_key(scope, "Provider dispatch fixture", &["*".into()], 3600)
        .await
        .unwrap();
    let principal = store.authenticate(&key.token).await.unwrap();
    let deny = json!({"schema_version":1,"name":"Provider restriction","models":{"mode":"allow_all"},"providers":{"mode":"deny_all"}});
    let allow = json!({"schema_version":1,"name":"Allowed","models":{"mode":"allow_all"},"providers":{"mode":"inherit"}});
    for use_key in [false, true] {
        let operation = store.create_operation(scope, "fast").await.unwrap();
        let attempt = store
            .prepare_attempt(scope, operation, "fast", "provider-policy")
            .await
            .unwrap();
        store
            .set_attempt_dispatch_provider(scope, attempt, "openrouter")
            .await
            .unwrap();
        if !use_key {
            store
                .activate_workspace_guardrail(scope, 0, &deny)
                .await
                .unwrap();
        } else {
            store
                .activate_workspace_guardrail(scope, 1, &allow)
                .await
                .unwrap();
            store
                .assign_key_guardrail(scope, key.id, 1, 0)
                .await
                .unwrap();
        }
        assert!(matches!(
            store.mark_dispatched(&principal, attempt).await,
            Err(niu_storage::StoreError::Conflict)
        ));
        assert_eq!(
            store
                .attempt(scope, attempt)
                .await
                .unwrap()
                .unwrap()
                .execution,
            "not_sent"
        );
    }
    store
        .clear_key_guardrail_as(scope, key.id, 1, "system")
        .await
        .unwrap();
    let restricted = json!({"schema_version":1,"name":"OpenRouter only","models":{"mode":"allow_all"},"providers":{"mode":"allow_list","values":["openrouter"]}});
    store
        .activate_workspace_guardrail(scope, 2, &restricted)
        .await
        .unwrap();
    for (provider, permitted) in [
        (Some("openrouter"), true),
        (Some("openai"), false),
        (None, false),
    ] {
        let operation = store.create_operation(scope, "fast").await.unwrap();
        let attempt = store
            .prepare_attempt(scope, operation, "fast", "provider-policy")
            .await
            .unwrap();
        if let Some(provider) = provider {
            store
                .set_attempt_dispatch_provider(scope, attempt, provider)
                .await
                .unwrap();
        }
        assert_eq!(
            store.mark_dispatched(&principal, attempt).await.is_ok(),
            permitted
        );
        if provider.is_some() {
            assert!(
                sqlx::query("UPDATE attempts SET dispatch_provider='another-provider' WHERE id=$1")
                    .bind(attempt)
                    .execute(&pool)
                    .await
                    .is_err()
            );
        }
    }
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn dispatch_policy_attribution_is_immutable_and_preserves_historical_revisions(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let other = store
        .create_project(scope.organization_id, "Other audit workspace")
        .await
        .unwrap();
    let key = store
        .issue_key(scope, "Audited client", &["*".into()], 3600)
        .await
        .unwrap();
    let principal = store.authenticate(&key.token).await.unwrap();
    let allow = json!({"schema_version":1,"name":"Allowed original","models":{"mode":"allow_all"},"providers":{"mode":"inherit"}});
    store
        .activate_workspace_guardrail(scope, 0, &allow)
        .await
        .unwrap();
    store
        .assign_key_guardrail(scope, key.id, 1, 0)
        .await
        .unwrap();
    let op = store.create_operation(scope, "fast").await.unwrap();
    let attempt = store
        .prepare_attempt(scope, op, "fast", "fixture")
        .await
        .unwrap();
    assert!(
        store
            .dispatch_guardrail_decision(scope, attempt)
            .await
            .unwrap()
            .is_none()
    );
    store.mark_dispatched(&principal, attempt).await.unwrap();
    let original = store
        .dispatch_guardrail_decision(scope, attempt)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(original["workspace_revision"], 1);
    assert_eq!(original["key_policy_revision"], 1);
    assert_eq!(original["key_assignment_revision"], 1);
    assert_eq!(original["workspace_policy_name"], "Allowed original");
    assert_eq!(original["coverage"], "model_provider_access");
    assert!(
        store
            .dispatch_guardrail_decision(other, attempt)
            .await
            .unwrap()
            .is_none()
    );
    let deny = json!({"schema_version":1,"name":"Current denial","models":{"mode":"deny_all"},"providers":{"mode":"inherit"}});
    store
        .activate_workspace_guardrail(scope, 1, &deny)
        .await
        .unwrap();
    store
        .clear_key_guardrail_as(scope, key.id, 1, "system")
        .await
        .unwrap();
    assert_eq!(
        store
            .dispatch_guardrail_decision(scope, attempt)
            .await
            .unwrap(),
        Some(original)
    );
    let op = store.create_operation(scope, "fast").await.unwrap();
    let denied = store
        .prepare_attempt(scope, op, "fast", "fixture")
        .await
        .unwrap();
    assert!(store.mark_dispatched(&principal, denied).await.is_err());
    assert!(
        store
            .dispatch_guardrail_decision(scope, denied)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        sqlx::query("DELETE FROM dispatch_guardrail_decisions WHERE attempt_id=$1")
            .bind(attempt)
            .execute(&pool)
            .await
            .is_err()
    );
    assert!(
        sqlx::query(
            "UPDATE dispatch_guardrail_decisions SET workspace_revision=2 WHERE attempt_id=$1"
        )
        .bind(attempt)
        .execute(&pool)
        .await
        .is_err()
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn priced_policy_rejection_commits_audit_without_reservation_or_budget_effects(pool: PgPool) {
    use niu_storage::{GatewayReservation, PriceInput, TokenRates};
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let key = store
        .issue_key(scope, "Priced denial", &["fast".into()], 3600)
        .await
        .unwrap();
    let principal = store.authenticate(&key.token).await.unwrap();
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
    let operation = store.create_operation(scope, "fast").await.unwrap();
    let attempt = store
        .prepare_attempt(scope, operation, "fast", "v1")
        .await
        .unwrap();
    store.activate_workspace_guardrail(scope, 0, &json!({"schema_version":1,"name":"Mandatory denial","models":{"mode":"deny_all"},"providers":{"mode":"inherit"}})).await.unwrap();
    let reservation = GatewayReservation {
        price_revision_id: price,
        resource_id: "fast".into(),
        offer_revision: "v1".into(),
        prompt_bound: 10,
        completion_bound: 10,
    };
    assert!(matches!(
        store
            .reserve_and_dispatch_gateway(&principal, attempt, &reservation)
            .await,
        Err(niu_storage::StoreError::Conflict)
    ));
    assert_eq!(
        store
            .attempt(scope, attempt)
            .await
            .unwrap()
            .unwrap()
            .execution,
        "not_sent"
    );
    let count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM cost_reservations WHERE attempt_id=$1")
            .bind(attempt)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(count, 0);
    let budget = store.budget(scope).await.unwrap().unwrap();
    assert_eq!(budget.reserved_nanos, 0);
    assert_eq!(budget.spent_nanos, 0);
    let audit: (String, Option<i64>) = sqlx::query_as(
        "SELECT reason,workspace_revision FROM dispatch_guardrail_rejections WHERE attempt_id=$1",
    )
    .bind(attempt)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(audit, ("access_denied".into(), Some(1)));
    assert!(
        store
            .dispatch_guardrail_decision(scope, attempt)
            .await
            .unwrap()
            .is_none()
    );
    store.activate_workspace_guardrail(scope, 1, &json!({"schema_version":1,"name":"Allow after review","models":{"mode":"inherit"},"providers":{"mode":"inherit"}})).await.unwrap();
    store
        .reserve_and_dispatch_gateway(&principal, attempt, &reservation)
        .await
        .unwrap();
    assert_eq!(
        store
            .attempt(scope, attempt)
            .await
            .unwrap()
            .unwrap()
            .execution,
        "may_have_executed"
    );
    assert_eq!(
        store.budget(scope).await.unwrap().unwrap().reserved_nanos,
        20
    );
    let denials: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM dispatch_guardrail_rejections WHERE attempt_id=$1",
    )
    .bind(attempt)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(denials, 1, "allowed retry must not add a rejection");
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn rejection_metadata_observes_activation_committed_while_dispatch_waits(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let key = store
        .issue_key(scope, "Waiting dispatch", &["fast".into()], 3600)
        .await
        .unwrap();
    let principal = store.authenticate(&key.token).await.unwrap();
    let operation = store.create_operation(scope, "fast").await.unwrap();
    let attempt = store
        .prepare_attempt(scope, operation, "fast", "fixture")
        .await
        .unwrap();
    let mut activation = pool.begin().await.unwrap();
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('niu-guardrails:'||$1::text||':'||$2::text,0))")
        .bind(scope.organization_id).bind(scope.project_id).execute(&mut *activation).await.unwrap();
    let dispatch_store = store.clone();
    let dispatch =
        tokio::spawn(async move { dispatch_store.mark_dispatched(&principal, attempt).await });
    tokio::time::timeout(std::time::Duration::from_secs(5), async {
        loop {
            let waiting: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted AND database=(SELECT oid FROM pg_database WHERE datname=current_database()))")
                .fetch_one(&pool).await.unwrap();
            if waiting { break; }
            tokio::task::yield_now().await;
        }
    }).await.expect("dispatch must actually wait for activation");
    let policy = json!({"schema_version":1,"name":"Concurrent mandatory denial","models":{"mode":"deny_all"},"providers":{"mode":"inherit"}});
    sqlx::query("INSERT INTO workspace_guardrail_heads(organization_id,project_id,revision) VALUES($1,$2,0)")
        .bind(scope.organization_id).bind(scope.project_id).execute(&mut *activation).await.unwrap();
    sqlx::query("INSERT INTO workspace_guardrail_revisions(organization_id,project_id,revision,policy) VALUES($1,$2,1,$3)")
        .bind(scope.organization_id).bind(scope.project_id).bind(policy).execute(&mut *activation).await.unwrap();
    sqlx::query("INSERT INTO workspace_guardrail_heads(organization_id,project_id,revision) VALUES($1,$2,1) ON CONFLICT(organization_id,project_id) DO UPDATE SET revision=1")
        .bind(scope.organization_id).bind(scope.project_id).execute(&mut *activation).await.unwrap();
    activation.commit().await.unwrap();
    assert!(matches!(
        dispatch.await.unwrap(),
        Err(niu_storage::StoreError::Conflict)
    ));
    let revision: Option<i64> = sqlx::query_scalar(
        "SELECT workspace_revision FROM dispatch_guardrail_rejections WHERE attempt_id=$1",
    )
    .bind(attempt)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(revision, Some(1));
    assert_eq!(
        store
            .attempt(scope, attempt)
            .await
            .unwrap()
            .unwrap()
            .execution,
        "not_sent"
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn combined_dispatch_denials_are_bounded_ordered_scoped_and_sanitized(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let other = store
        .create_project(scope.organization_id, "Separate audit workspace")
        .await
        .unwrap();
    let key = store
        .issue_key(scope, "Readable key", &["*".into()], 3600)
        .await
        .unwrap();
    let other_key = store
        .issue_key(other, "Private other key", &["*".into()], 3600)
        .await
        .unwrap();
    store.activate_workspace_guardrail(scope, 0, &json!({"schema_version":1,"name":"Historical policy","models":{"mode":"inherit"},"providers":{"mode":"inherit"}})).await.unwrap();
    store.activate_workspace_guardrail(scope, 1, &json!({"schema_version":1,"name":"Current policy","models":{"mode":"inherit"},"providers":{"mode":"inherit"}})).await.unwrap();
    let operation = store.create_operation(scope, "fixture").await.unwrap();
    let attempt = store
        .prepare_attempt(scope, operation, "fixture", "fixture")
        .await
        .unwrap();
    sqlx::query("INSERT INTO batch_guardrail_rejections(organization_id,project_id,key_id,reason,workspace_revision,recorded_at) SELECT $1,$2,$3,'policy_changed',1,timestamptz '2026-01-01 00:00:00+00'+i*interval '1 second' FROM generate_series(1,60) i")
        .bind(scope.organization_id).bind(scope.project_id).bind(key.id).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO dispatch_guardrail_rejections(organization_id,project_id,attempt_id,key_id,reason,workspace_revision,recorded_at) SELECT $1,$2,$3,$4,'access_denied',1,timestamptz '2026-01-01 00:00:00+00'+i*interval '1 second' FROM generate_series(61,110) i")
        .bind(scope.organization_id).bind(scope.project_id).bind(attempt).bind(key.id).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO batch_guardrail_rejections(organization_id,project_id,key_id,reason) VALUES($1,$2,$3,'policy_changed')")
        .bind(other.organization_id).bind(other.project_id).bind(other_key.id).execute(&pool).await.unwrap();
    let rows = store.guardrail_dispatch_denials(scope).await.unwrap();
    assert_eq!(
        rows.len(),
        100,
        "limit applies after combining both audit tables"
    );
    assert_eq!(
        rows.iter().filter(|row| row["stage"] == "dispatch").count(),
        50
    );
    assert_eq!(
        rows.iter()
            .filter(|row| row["stage"] == "batch_admission")
            .count(),
        50
    );
    for (index, row) in rows.iter().enumerate() {
        assert_eq!(row["key_name"], "Readable key");
        assert_eq!(row["workspace_policy_name"], "Historical policy");
        assert_eq!(row["workspace_revision"], 1);
        assert!(row["key_policy_name"].is_null());
        assert!(row["key_assignment_revision"].is_null());
        if index > 0 {
            assert!(
                rows[index - 1]["recorded_at"].as_str().unwrap()
                    > row["recorded_at"].as_str().unwrap()
            );
        }
        let text = row.to_string();
        for private in [
            key.id.to_string(),
            other_key.id.to_string(),
            attempt.to_string(),
            scope.project_id.to_string(),
            key.token.clone(),
            other_key.token.clone(),
        ] {
            assert!(!text.contains(&private));
        }
        assert_eq!(row.as_object().unwrap().len(), 11);
    }
    let other_rows = store.guardrail_dispatch_denials(other).await.unwrap();
    assert_eq!(other_rows.len(), 1);
    assert_eq!(other_rows[0]["key_name"], "Private other key");
    assert!(other_rows[0]["workspace_revision"].is_null());
    assert!(
        sqlx::query("UPDATE batch_guardrail_rejections SET reason='access_denied'")
            .execute(&pool)
            .await
            .is_err()
    );
}
