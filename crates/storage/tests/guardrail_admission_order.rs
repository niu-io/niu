use niu_storage::{GatewayAdmission, GatewayAdmissionStatus, MIGRATOR, Store, TenantScope};
use sqlx::PgPool;
use uuid::Uuid;

fn request(scope: TenantScope, key: Uuid) -> GatewayAdmission {
    GatewayAdmission {
        inspected_guardrails: None,
        operation_id: Uuid::new_v4(),
        attempt_id: Uuid::new_v4(),
        scope,
        key_id: key,
        model: "fast".into(),
        upstream_model: "fast".into(),
        dispatch_provider: "openai".into(),
        api_base: None,
        task_id: None,
        revision: "concurrency-fixture".into(),
    }
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn opposing_workspace_batches_complete_without_lock_order_conflicts(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool);
    let a = store.default_workspace().await.unwrap();
    let b = store
        .create_project(a.organization_id, "Opposing batch scope")
        .await
        .unwrap();
    let ka = store
        .issue_key(a, "Batch A", &["*".into()], 3600)
        .await
        .unwrap();
    let kb = store
        .issue_key(b, "Batch B", &["*".into()], 3600)
        .await
        .unwrap();
    let snapshot_a = store.guardrail_snapshot(a, ka.id).await.unwrap().unwrap();
    let snapshot_b = store.guardrail_snapshot(b, kb.id).await.unwrap().unwrap();
    let bound_request = |scope, key, snapshot: &niu_storage::GuardrailSnapshot| {
        let mut admission = request(scope, key);
        admission.inspected_guardrails = Some(snapshot.clone());
        admission
    };
    for _ in 0..16 {
        let (left, right) = tokio::time::timeout(std::time::Duration::from_secs(5), async {
            tokio::join!(
                store.admit_unpriced_gateway_batch(vec![
                    bound_request(a, ka.id, &snapshot_a),
                    bound_request(b, kb.id, &snapshot_b)
                ]),
                store.admit_unpriced_gateway_batch(vec![
                    bound_request(b, kb.id, &snapshot_b),
                    bound_request(a, ka.id, &snapshot_a)
                ]),
            )
        })
        .await
        .expect("admission must not hang on opposing workspace order");
        assert_eq!(left.unwrap(), vec![GatewayAdmissionStatus::Admitted; 2]);
        assert_eq!(right.unwrap(), vec![GatewayAdmissionStatus::Admitted; 2]);
    }
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn inspected_revision_change_blocks_even_when_access_still_allows(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let key = store
        .issue_key(scope, "Inspection binding", &["*".into()], 3600)
        .await
        .unwrap();
    let old = store
        .guardrail_snapshot(scope, key.id)
        .await
        .unwrap()
        .unwrap();
    let policy = serde_json::json!({"schema_version":1,"name":"Allow","models":{"mode":"inherit"},"providers":{"mode":"inherit"}});
    store
        .activate_workspace_guardrail(scope, 0, &policy)
        .await
        .unwrap();
    let mut stale = request(scope, key.id);
    stale.inspected_guardrails = Some(old);
    assert!(matches!(
        store.admit_unpriced_gateway_batch(vec![stale]).await,
        Err(niu_storage::StoreError::Conflict)
    ));
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM inspected_guardrail_bindings")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(
        count, 0,
        "failed admission rolls back the inspection binding"
    );
    let denial: (String, Option<i64>) = sqlx::query_as("SELECT reason,workspace_revision FROM batch_guardrail_rejections WHERE organization_id=$1 AND project_id=$2 AND key_id=$3")
        .bind(scope.organization_id).bind(scope.project_id).bind(key.id).fetch_one(&pool).await.unwrap();
    assert_eq!(denial, ("policy_changed".into(), Some(1)));
    let attempts: i64 = sqlx::query_scalar("SELECT count(*) FROM attempts")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(attempts, 0, "audit must not invent rolled-back attempts");

    let current = store
        .guardrail_snapshot(scope, key.id)
        .await
        .unwrap()
        .unwrap();
    let mut allowed = request(scope, key.id);
    allowed.inspected_guardrails = Some(current.clone());
    assert_eq!(
        store
            .admit_unpriced_gateway_batch(vec![allowed])
            .await
            .unwrap(),
        vec![GatewayAdmissionStatus::Admitted]
    );
    assert!(
        sqlx::query("DELETE FROM inspected_guardrail_bindings")
            .execute(&pool)
            .await
            .is_err()
    );
    store
        .assign_key_guardrail(scope, key.id, 1, 0)
        .await
        .unwrap();
    let mut stale_key = request(scope, key.id);
    stale_key.inspected_guardrails = Some(current);
    assert!(matches!(
        store.admit_unpriced_gateway_batch(vec![stale_key]).await,
        Err(niu_storage::StoreError::Conflict)
    ));
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn prepared_binding_rejects_new_allowing_policy_and_retains_not_sent(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool);
    let scope = store.default_workspace().await.unwrap();
    let key = store
        .issue_key(scope, "Prepared inspection", &["*".into()], 3600)
        .await
        .unwrap();
    let principal = store.authenticate(&key.token).await.unwrap();
    let snapshot = store
        .guardrail_snapshot(scope, key.id)
        .await
        .unwrap()
        .unwrap();
    let (operation, attempt) = store
        .prepare_gateway_attempt(scope, "fast", None, "fixture")
        .await
        .unwrap();
    let _ = operation;
    store
        .bind_inspected_guardrails(scope, attempt, key.id, &snapshot)
        .await
        .unwrap();
    store.activate_workspace_guardrail(scope, 0, &serde_json::json!({"schema_version":1,"name":"New allowing policy","models":{"mode":"inherit"},"providers":{"mode":"inherit"}})).await.unwrap();
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

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn live_input_policy_rejects_compatibility_admission_without_inspection(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool);
    let scope = store.default_workspace().await.unwrap();
    let key = store
        .issue_key(scope, "Uninspected compatibility", &["*".into()], 3600)
        .await
        .unwrap();
    let policy = serde_json::json!({"schema_version":1,"name":"Input protection","models":{"mode":"inherit"},"providers":{"mode":"inherit"},"input_rules":[{"pattern":"fixture","action":"block"}]});
    store
        .activate_workspace_guardrail(scope, 0, &policy)
        .await
        .unwrap();
    assert!(matches!(
        store
            .admit_unpriced_gateway_batch(vec![request(scope, key.id)])
            .await,
        Err(niu_storage::StoreError::Conflict)
    ));
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn policy_snapshot_without_input_result_cannot_dispatch_active_rules(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let key = store
        .issue_key(scope, "Inspection result fixture", &["*".into()], 3600)
        .await
        .unwrap();
    store.activate_workspace_guardrail(scope, 0, &serde_json::json!({"schema_version":1,"name":"Input rules","models":{"mode":"inherit"},"providers":{"mode":"inherit"},"input_rules":[{"pattern":"fixture","action":"block"}]})).await.unwrap();
    let snapshot = store
        .guardrail_snapshot(scope, key.id)
        .await
        .unwrap()
        .unwrap();
    let mut missing = request(scope, key.id);
    missing.inspected_guardrails = Some(snapshot.clone());
    assert!(matches!(
        store.admit_unpriced_gateway_batch(vec![missing]).await,
        Err(niu_storage::StoreError::Conflict)
    ));
    let mut inspected = snapshot;
    inspected.input_outcome = Some("allowed".into());
    inspected.input_elapsed_ms = Some(0);
    let mut admission = request(scope, key.id);
    let attempt = admission.attempt_id;
    admission.inspected_guardrails = Some(inspected.clone());
    assert_eq!(
        store
            .admit_unpriced_gateway_batch(vec![admission])
            .await
            .unwrap(),
        vec![GatewayAdmissionStatus::Admitted]
    );
    let decision = store
        .dispatch_guardrail_decision(scope, attempt)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(decision["input_inspection"]["outcome"], "allowed");
    assert_eq!(decision["input_inspection"]["elapsed_ms"], 0);
    inspected.input_outcome = None;
    let mut invalid = request(scope, key.id);
    invalid.inspected_guardrails = Some(inspected);
    assert!(
        store
            .admit_unpriced_gateway_batch(vec![invalid])
            .await
            .is_err()
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn unqualified_image_requirements_cannot_bypass_storage_dispatch(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let root = store.default_workspace().await.unwrap();
    for (name, requirement, key_only) in [
        (
            "Workspace image requirement",
            serde_json::json!([{"detector":"fixture-image","configuration_fingerprint":"a".repeat(64),"consent_to_image_processing":true}]),
            false,
        ),
        (
            "Key image requirement",
            serde_json::json!([{"detector":"fixture-image"}]),
            true,
        ),
        (
            "Malformed image requirement",
            serde_json::Value::Null,
            false,
        ),
    ] {
        let scope = store
            .create_project(root.organization_id, name)
            .await
            .unwrap();
        let key = store
            .issue_key(scope, "Image dispatch gate", &["*".into()], 3600)
            .await
            .unwrap();
        let policy = serde_json::json!({"schema_version":1,"name":name,"models":{"mode":"inherit"},"providers":{"mode":"inherit"},"image_detectors":requirement});
        store
            .activate_workspace_guardrail(scope, 0, &policy)
            .await
            .unwrap();
        if key_only {
            store
                .assign_key_guardrail(scope, key.id, 1, 0)
                .await
                .unwrap();
            store.activate_workspace_guardrail(scope,1,&serde_json::json!({"schema_version":1,"name":"Workspace allows","models":{"mode":"inherit"},"providers":{"mode":"inherit"}})).await.unwrap();
        }
        let snapshot = store
            .guardrail_snapshot(scope, key.id)
            .await
            .unwrap()
            .unwrap();
        let mut admission = request(scope, key.id);
        admission.inspected_guardrails = Some(snapshot);
        assert!(matches!(
            store.admit_unpriced_gateway_batch(vec![admission]).await,
            Err(niu_storage::StoreError::Conflict)
        ));
        let sent:i64=sqlx::query_scalar("SELECT count(*) FROM attempts WHERE organization_id=$1 AND project_id=$2 AND execution='may_have_executed'").bind(scope.organization_id).bind(scope.project_id).fetch_one(&pool).await.unwrap();
        assert_eq!(
            sent, 0,
            "image requirement must not be ignored by storage admission"
        );
    }
    let scope = store
        .create_project(root.organization_id, "No image requirement")
        .await
        .unwrap();
    let key = store
        .issue_key(scope, "Text dispatch control", &["*".into()], 3600)
        .await
        .unwrap();
    store.activate_workspace_guardrail(scope,0,&serde_json::json!({"schema_version":1,"name":"No image inspection","models":{"mode":"inherit"},"providers":{"mode":"inherit"},"image_detectors":[]})).await.unwrap();
    let mut admission = request(scope, key.id);
    admission.inspected_guardrails = store.guardrail_snapshot(scope, key.id).await.unwrap();
    assert_eq!(
        store
            .admit_unpriced_gateway_batch(vec![admission])
            .await
            .unwrap(),
        vec![GatewayAdmissionStatus::Admitted]
    );
}
