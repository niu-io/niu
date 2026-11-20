//! Deterministic incident notification-state fixtures. No upstream transport,
//! paid call or browser is used; deliveries are driven through the same store
//! operations as the gateway worker and a test-only terminal outcome.
use niu_storage::{
    EventSubscription, MIGRATOR, OperatorAuditActor, OperatorRole, OperatorScope, RequestFailure,
    RequestFailureKind, Store, TenantScope, VendorInput, VendorModelInput, VendorModelView,
    VendorView,
};
use sqlx::PgPool;
use uuid::Uuid;

fn subscription(event_types: &[&str]) -> EventSubscription {
    EventSubscription {
        slug: "incident-receiver".into(),
        name: "Incident receiver".into(),
        endpoint: "https://receiver.example/incidents".into(),
        event_types: event_types.iter().map(|value| value.to_string()).collect(),
        enabled: true,
        revision: 0,
    }
}

async fn emitter(store: &Store, scope: TenantScope) -> (Uuid, Uuid) {
    let owner = store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(scope.project_id),
            },
            "Incident notification owner",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let auth = store
        .create_agent_authorization_with_capabilities(
            "Codex",
            &["events:read".into(), "events:write".into()],
        )
        .await
        .unwrap();
    store
        .approve_agent_authorization(
            &auth.user_code,
            scope,
            owner.operator_id,
            &["fast".into()],
            3600,
        )
        .await
        .unwrap();
    let key = store
        .exchange_agent_authorization(&auth.device_secret)
        .await
        .unwrap()
        .unwrap();
    let principal = store.authenticate(&key.token).await.unwrap();
    let id = Uuid::new_v4();
    store
        .set_event_subscription(
            &principal,
            id,
            &subscription(&["incident.opened", "incident.resolved"]),
            Some(&[7u8; 48]),
        )
        .await
        .unwrap();
    (key.id, id)
}

async fn open_incident(
    store: &Store,
    pool: &PgPool,
    scope: TenantScope,
) -> (VendorView, VendorModelView, String) {
    let vendor = store
        .create_vendor(VendorInput {
            id: Uuid::new_v4(),
            name: "Incident notification connection".into(),
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
                alias: "incident-notification-model".into(),
                upstream_model: "incident-notification-model".into(),
                public_catalog: false,
                enabled: true,
                capabilities: serde_json::json!({}),
                pricing: None,
                expected_revision: None,
            },
        )
        .await
        .unwrap();
    let operation = store.create_operation(scope, &model.alias).await.unwrap();
    let attempt = store
        .prepare_attempt(scope, operation, &model.alias, "fixture")
        .await
        .unwrap();
    sqlx::query("INSERT INTO managed_attempt_routes(attempt_id,vendor_id,model_alias,vendor_revision,model_revision) VALUES($1,$2,$3,$4,$5)")
        .bind(attempt).bind(vendor.id).bind(&model.alias).bind(vendor.revision).bind(model.revision)
        .execute(pool).await.unwrap();
    sqlx::query("UPDATE attempts SET dispatch_provider='openai',execution='may_have_executed',dispatched_at=clock_timestamp() WHERE id=$1")
        .bind(attempt).execute(pool).await.unwrap();
    store
        .save_request_failure(
            scope,
            attempt,
            RequestFailure {
                kind: RequestFailureKind::UpstreamAccountRestricted,
                upstream_http_status: Some(403),
                transport_phase: None,
            },
        )
        .await
        .unwrap();
    let reference: String = sqlx::query_scalar(
        "SELECT reference FROM incident_workspace_events WHERE organization_id=$1 AND project_id=$2",
    )
    .bind(scope.organization_id)
    .bind(scope.project_id)
    .fetch_one(pool)
    .await
    .unwrap();
    (vendor, model, reference)
}

fn state(value: &serde_json::Value) -> &str {
    value["notifications"]["state"]
        .as_str()
        .or_else(|| value["state"].as_str())
        .unwrap()
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn notification_state_moves_from_not_configured_to_queued_and_delivered(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let (_, _, reference) = open_incident(&store, &pool, scope).await;

    let summary = store.workspace_active_incidents(scope).await.unwrap();
    assert_eq!(state(&summary), "not_configured");
    assert_eq!(summary["notifications"]["incidents"], 1);
    assert_eq!(summary["notifications"]["subscribers"], 0);
    assert_eq!(summary["notifications"]["delivered"], 0);

    let detail = store
        .workspace_incident_event_detail(scope, &reference)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(detail["notification"]["state"], "not_configured");
    assert_eq!(detail["notification"]["event"], "opened");

    let (_, subscription_id) = emitter(&store, scope).await;
    let summary = store.workspace_active_incidents(scope).await.unwrap();
    assert_eq!(state(&summary), "queued");
    assert_eq!(summary["notifications"]["subscribers"], 1);
    assert_eq!(summary["notifications"]["authorized"], 1);

    assert!(store.publish_one_incident_event().await.unwrap());
    let summary = store.workspace_active_incidents(scope).await.unwrap();
    assert_eq!(state(&summary), "queued");

    let claim = store
        .claim_event_delivery(subscription_id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(claim.attempt, 1);
    store
        .finish_event_delivery(&claim, Some(204), None)
        .await
        .unwrap();
    let summary = store.workspace_active_incidents(scope).await.unwrap();
    assert_eq!(state(&summary), "delivered");
    assert_eq!(summary["notifications"]["delivered"], 1);
    assert_eq!(summary["notifications"]["failed"], 0);
    let detail = store
        .workspace_incident_event_detail(scope, &reference)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(detail["notification"]["state"], "delivered");
    assert!(detail["notification"]["last_attempt_at"].is_string());
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn terminal_delivery_failure_is_never_reported_as_delivered(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    open_incident(&store, &pool, scope).await;
    let (key_id, subscription_id) = emitter(&store, scope).await;
    store.publish_one_incident_event().await.unwrap();

    let claim = store
        .claim_event_delivery(subscription_id)
        .await
        .unwrap()
        .unwrap();
    store
        .finish_event_delivery(&claim, None, Some("destination"))
        .await
        .unwrap();
    let summary = store.workspace_active_incidents(scope).await.unwrap();
    assert_eq!(state(&summary), "failed");
    assert_eq!(summary["notifications"]["failed"], 1);
    assert_eq!(summary["notifications"]["delivered"], 0);

    // A revoked issuer is not reported as healthy configured delivery.
    store.revoke_key(scope, key_id).await.unwrap();
    let summary = store.workspace_active_incidents(scope).await.unwrap();
    assert_eq!(state(&summary), "authority_inactive");
    assert_eq!(summary["notifications"]["authorized"], 0);
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn expired_lease_is_sending_and_can_be_recovered_after_expiry(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    open_incident(&store, &pool, scope).await;
    let (_, subscription_id) = emitter(&store, scope).await;
    store.publish_one_incident_event().await.unwrap();

    let claim = store
        .claim_event_delivery(subscription_id)
        .await
        .unwrap()
        .unwrap();
    let summary = store.workspace_active_incidents(scope).await.unwrap();
    assert_eq!(state(&summary), "sending");
    assert!(
        store
            .claim_event_delivery(subscription_id)
            .await
            .unwrap()
            .is_none()
    );
    sqlx::query("UPDATE workspace_event_deliveries SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1")
        .bind(claim.id).execute(&pool).await.unwrap();
    let recovered = store
        .claim_event_delivery(subscription_id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(recovered.attempt, 2);
    assert_eq!(recovered.id, claim.id);
    store
        .finish_event_delivery(&recovered, Some(204), None)
        .await
        .unwrap();
    let summary = store.workspace_active_incidents(scope).await.unwrap();
    assert_eq!(state(&summary), "delivered");
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn subscription_expiry_removes_delivery_authority_without_reclassifying_evidence(
    pool: PgPool,
) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    open_incident(&store, &pool, scope).await;
    let (key_id, subscription_id) = emitter(&store, scope).await;
    sqlx::query("UPDATE api_keys SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1")
        .bind(key_id)
        .execute(&pool)
        .await
        .unwrap();
    let summary = store.workspace_active_incidents(scope).await.unwrap();
    assert_eq!(state(&summary), "authority_inactive");
    assert!(
        store
            .claim_event_delivery(subscription_id)
            .await
            .unwrap()
            .is_none()
    );
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn foreign_workspace_cannot_read_notification_state_and_platform_sees_incomplete(
    pool: PgPool,
) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let (_, _, reference) = open_incident(&store, &pool, scope).await;
    let other = store
        .create_project(scope.organization_id, "Other workspace")
        .await
        .unwrap();
    assert!(
        store
            .workspace_incident_event_detail(other, &reference)
            .await
            .unwrap()
            .is_none()
    );
    let other_summary = store.workspace_active_incidents(other).await.unwrap();
    assert_eq!(state(&other_summary), "none");
    assert_eq!(other_summary["notifications"]["incidents"], 0);

    let platform = store
        .platform_connection_incidents(None, Some("active"), None)
        .await
        .unwrap();
    assert_eq!(platform["coverage"]["proactive_probe"], "not_configured");
    assert_eq!(platform["coverage"]["request_observed"], true);
    assert_eq!(platform["data"][0]["notifications"]["workspaces"], 1);
    assert_eq!(platform["data"][0]["notifications"]["state"], "incomplete");
    assert_eq!(platform["data"][0]["notifications"]["not_configured"], 1);
    assert!(platform["data"][0].get("incident_id").is_none());
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn resolved_incident_reports_resolution_notification_state(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let (vendor, model, reference) = open_incident(&store, &pool, scope).await;
    let (_, subscription_id) = emitter(&store, scope).await;
    store.publish_one_incident_event().await.unwrap();
    let opening = store
        .claim_event_delivery(subscription_id)
        .await
        .unwrap()
        .unwrap();
    store
        .finish_event_delivery(&opening, Some(204), None)
        .await
        .unwrap();

    let operation = store.create_operation(scope, &model.alias).await.unwrap();
    let recovery = store
        .prepare_attempt(scope, operation, &model.alias, "fixture")
        .await
        .unwrap();
    sqlx::query("INSERT INTO managed_attempt_routes(attempt_id,vendor_id,model_alias,vendor_revision,model_revision) VALUES($1,$2,$3,$4,$5)")
        .bind(recovery).bind(vendor.id).bind(&model.alias).bind(vendor.revision).bind(model.revision)
        .execute(&pool).await.unwrap();
    sqlx::query("UPDATE attempts SET dispatch_provider='openai',execution='may_have_executed',dispatched_at=clock_timestamp() WHERE id=$1")
        .bind(recovery).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO request_timings(attempt_id,total_ms,complete,http_status) VALUES($1,1,true,200)")
        .bind(recovery).execute(&pool).await.unwrap();
    sqlx::query("UPDATE attempts SET execution='confirmed_completed',completed_at=clock_timestamp() WHERE id=$1")
        .bind(recovery).execute(&pool).await.unwrap();

    assert!(store.publish_one_incident_event().await.unwrap());
    let detail = store
        .workspace_incident_event_detail(scope, &reference)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(detail["status"], "resolved");
    assert_eq!(detail["notification"]["event"], "resolved");
    assert_eq!(detail["notification"]["state"], "queued");
    assert_eq!(detail["notification"]["queued"], 0);

    let platform = store
        .platform_connection_incidents(None, Some("resolved"), None)
        .await
        .unwrap();
    assert_eq!(platform["data"][0]["notifications"]["state"], "queued");
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn concurrent_claims_create_one_notification_attempt(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    open_incident(&store, &pool, scope).await;
    let (_, subscription_id) = emitter(&store, scope).await;
    store.publish_one_incident_event().await.unwrap();

    let (left, right) = tokio::join!(
        store.claim_event_delivery(subscription_id),
        store.claim_event_delivery(subscription_id)
    );
    let claims = [left.unwrap(), right.unwrap()];
    assert_eq!(
        claims.iter().filter(|claim| claim.is_some()).count(),
        1,
        "competing claims must not both start a delivery"
    );
    let claim = claims.into_iter().flatten().next().unwrap();
    assert_eq!(claim.attempt, 1);
    let summary = store.workspace_active_incidents(scope).await.unwrap();
    assert_eq!(state(&summary), "sending");
    store
        .finish_event_delivery(&claim, Some(204), None)
        .await
        .unwrap();
    let summary = store.workspace_active_incidents(scope).await.unwrap();
    assert_eq!(state(&summary), "delivered");
    assert_eq!(summary["notifications"]["delivered"], 1);
}
