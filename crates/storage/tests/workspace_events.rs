use niu_storage::{
    EventSubscription, MIGRATOR, OperatorAuditActor, OperatorRole, OperatorScope,
    RoutePoolCandidate, RoutePoolDefaultAction, Store, WorkspaceModelPool,
};
use sqlx::PgPool;
use uuid::Uuid;

fn subscription() -> EventSubscription {
    EventSubscription {
        slug: "agent-events".into(),
        name: "Agent events".into(),
        endpoint: "https://receiver.example/events".into(),
        event_types: vec!["pool.changed".into()],
        enabled: true,
        revision: 0,
    }
}
#[test]
fn subscriptions_reject_unknown_events_unsafe_urls_and_invalid_names() {
    subscription().validate().unwrap();
    for endpoint in [
        "http://receiver.example/events",
        "https://localhost/events",
        "https://127.0.0.1/events",
        "https://[::1]/events",
        "https://receiver.local/events",
        "https://user:secret@receiver.example/events",
        "https://receiver.example/events?secret=token",
        "https://receiver.example/events#fragment",
        "https://receiver.example:444/events",
    ] {
        let mut input = subscription();
        input.endpoint = endpoint.into();
        assert!(input.validate().is_err(), "accepted {endpoint}");
    }
    let mut input = subscription();
    input.event_types.push("unsupported".into());
    assert!(input.validate().is_err());
    input = subscription();
    input.event_types = vec!["pool.changed".into(), "evaluation.recorded".into()];
    input.validate().unwrap();
    input.event_types = vec!["evaluation.recorded".into()];
    input.validate().unwrap();
    input.event_types.push("evaluation.recorded".into());
    assert!(input.validate().is_err());
    input.event_types.clear();
    assert!(input.validate().is_err());
    input = subscription();
    input.slug = "log".into();
    assert!(input.validate().is_err());
}
#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn resource_events_are_atomic_scoped_and_subscriptions_require_current_delegation(
    pool: PgPool,
) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let owner = store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(scope.project_id),
            },
            "Event owner",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let auth = store
        .create_agent_authorization_with_capabilities(
            "Codex",
            &[
                "events:read".into(),
                "events:write".into(),
                "pools:write".into(),
            ],
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
    let ordinary = store
        .issue_key(scope, "Ordinary", &["fast".into()], 3600)
        .await
        .unwrap();
    let ordinary_principal = store.authenticate(&ordinary.token).await.unwrap();
    let id = Uuid::new_v4();
    let cipher = vec![42u8; 48];
    let input = subscription();
    assert!(
        store
            .set_event_subscription(&ordinary_principal, id, &input, Some(&cipher))
            .await
            .is_err()
    );
    let policy = WorkspaceModelPool {
        slug: "assistant".into(),
        name: "Assistant".into(),
        description: "".into(),
        enabled: true,
        revision: 0,
        candidates: vec![RoutePoolCandidate {
            alias: "fast".into(),
            priority: 100,
            weight: 1000,
            enabled: true,
        }],
        rules: vec![],
        default_action: RoutePoolDefaultAction::Candidates,
    };
    let policy = store
        .set_workspace_model_pool(&principal, &policy)
        .await
        .unwrap();
    let first = store.workspace_events(scope, 0).await.unwrap();
    assert_eq!(first.len(), 1);
    assert_eq!(first[0]["type"], "pool.changed");
    assert_eq!(first[0]["sequence"], "1");
    assert_eq!(first[0]["resource"]["slug"], "assistant");
    assert_eq!(first[0]["resource"]["revision"], 1);
    let saved = store
        .set_event_subscription(&principal, id, &input, Some(&cipher))
        .await
        .unwrap();
    let internal = store
        .event_subscription(scope, &input.slug)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        internal.cursor, 1,
        "creation must not silently replay prior events"
    );
    assert_eq!(internal.secret_ciphertext, cipher);
    assert!(
        serde_json::to_value(&saved)
            .unwrap()
            .get("secret_ciphertext")
            .is_none()
    );
    assert!(
        store
            .set_event_subscription(&principal, id, &input, Some(&cipher))
            .await
            .is_err()
    );
    let (left, right) = tokio::join!(
        store.set_workspace_model_pool(&principal, &policy),
        store.set_workspace_model_pool(&principal, &policy)
    );
    assert_ne!(left.is_ok(), right.is_ok());
    let events = store.workspace_events(scope, 0).await.unwrap();
    assert_eq!(
        events.len(),
        2,
        "failed revision write must not emit a phantom event"
    );
    assert_eq!(events[1]["sequence"], "2");
    assert_eq!(events[1]["resource"]["revision"], 2);
    assert_eq!(store.workspace_events(scope, 1).await.unwrap().len(), 1);
    assert!(store.workspace_events(scope, -1).await.is_err());
    let mut renamed = saved.clone();
    renamed.name = "Renamed event receiver".into();
    let renamed = store
        .set_event_subscription(&principal, id, &renamed, None)
        .await
        .unwrap();
    assert_eq!(
        store
            .event_subscription(scope, &input.slug)
            .await
            .unwrap()
            .unwrap()
            .cursor,
        1,
        "metadata edits must preserve pending reconciliation"
    );
    assert!(
        store
            .event_delivery_candidates()
            .await
            .unwrap()
            .contains(&id)
    );
    let (first, concurrent) = tokio::join!(
        store.claim_event_delivery(id),
        store.claim_event_delivery(id)
    );
    let first = first.unwrap();
    let concurrent = concurrent.unwrap();
    assert_ne!(
        first.is_some(),
        concurrent.is_some(),
        "only one live lease may be issued"
    );
    let first = first.or(concurrent).unwrap();
    assert_eq!(first.sequence, 2);
    assert_eq!(first.attempt, 1);
    assert!(store.event_delivery_authorized(&first).await.unwrap());
    store
        .finish_event_delivery(&first, Some(503), Some("http"))
        .await
        .unwrap();
    assert!(
        store.claim_event_delivery(id).await.unwrap().is_none(),
        "backoff must prevent immediate replay"
    );
    sqlx::query("UPDATE workspace_event_deliveries SET available_at=clock_timestamp()-interval '1 second' WHERE id=$1").bind(first.id).execute(&pool).await.unwrap();
    let second = store.claim_event_delivery(id).await.unwrap().unwrap();
    assert_eq!(second.id, first.id);
    assert_eq!(second.event["id"], first.event["id"]);
    assert_eq!(second.attempt, 2);
    sqlx::query("UPDATE workspace_event_deliveries SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1").bind(second.id).execute(&pool).await.unwrap();
    assert!(!store.event_delivery_authorized(&second).await.unwrap());
    let recovered = store.claim_event_delivery(id).await.unwrap().unwrap();
    assert_ne!(recovered.lease, second.lease);
    assert_eq!(recovered.id, second.id);
    assert_eq!(recovered.attempt, 3);
    assert!(
        store
            .finish_event_delivery(&second, Some(200), None)
            .await
            .is_err(),
        "late worker cannot overwrite a recovered lease"
    );
    store
        .finish_event_delivery(&recovered, Some(204), None)
        .await
        .unwrap();
    assert!(store.claim_event_delivery(id).await.unwrap().is_none());
    let deliveries = store.event_deliveries(scope, &input.slug).await.unwrap();
    assert_eq!(deliveries[0]["state"], "delivered");
    assert_eq!(deliveries[0]["attempts"], 3);
    assert_eq!(deliveries[0]["response_status"], 204);
    assert!(deliveries[0].get("secret_ciphertext").is_none());
    let mut changed = renamed.clone();
    changed.endpoint = "https://other.example/events".into();
    assert!(
        store
            .set_event_subscription(&principal, id, &changed, None)
            .await
            .is_err(),
        "new destination requires a new signing credential"
    );
    let changed = store
        .set_event_subscription(&principal, id, &changed, Some(&vec![43; 48]))
        .await
        .unwrap();
    assert_eq!(
        store
            .event_subscription(scope, &input.slug)
            .await
            .unwrap()
            .unwrap()
            .cursor,
        2
    );
    let mut disabled = changed;
    disabled.enabled = false;
    let disabled = store
        .set_event_subscription(&principal, id, &disabled, None)
        .await
        .unwrap();
    assert!(!disabled.enabled);
    assert_eq!(
        store
            .event_subscription_history(scope, &input.slug, None)
            .await
            .unwrap()
            .len(),
        4
    );
    assert!(sqlx::query("UPDATE workspace_events SET resource_revision=7 WHERE organization_id=$1 AND project_id=$2").bind(scope.organization_id).bind(scope.project_id).execute(&pool).await.is_err());
    let other = store
        .create_project(scope.organization_id, "Other event workspace")
        .await
        .unwrap();
    assert!(store.workspace_events(other, 0).await.unwrap().is_empty());
    assert!(store.event_subscriptions(other).await.unwrap().is_empty());
    assert!(
        store
            .event_subscription(other, &input.slug)
            .await
            .unwrap()
            .is_none()
    );
    let mut resumed = disabled.clone();
    resumed.enabled = true;
    store
        .set_event_subscription(&principal, id, &resumed, None)
        .await
        .unwrap();
    let mut next_policy = policy;
    next_policy.revision = 2;
    store
        .set_workspace_model_pool(&principal, &next_policy)
        .await
        .unwrap();
    for number in 1..8 {
        let retry = store.claim_event_delivery(id).await.unwrap().unwrap();
        assert_eq!(retry.attempt, number);
        store
            .finish_event_delivery(&retry, Some(500), Some("http"))
            .await
            .unwrap();
        sqlx::query("UPDATE workspace_event_deliveries SET available_at=clock_timestamp()-interval '1 second' WHERE id=$1").bind(retry.id).execute(&pool).await.unwrap();
    }
    let eighth = store.claim_event_delivery(id).await.unwrap().unwrap();
    assert_eq!(eighth.attempt, 8);
    assert!(
        store.claim_event_delivery(id).await.unwrap().is_none(),
        "the eighth live lease must not be marked exhausted early"
    );
    assert!(store.event_delivery_authorized(&eighth).await.unwrap());
    sqlx::query("UPDATE workspace_event_deliveries SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1").bind(eighth.id).execute(&pool).await.unwrap();
    assert!(store.claim_event_delivery(id).await.unwrap().is_none());
    let exhausted = store.event_deliveries(scope, &input.slug).await.unwrap();
    assert_eq!(exhausted[0]["state"], "failed");
    assert_eq!(exhausted[0]["failure_kind"], "exhausted");
    assert_eq!(
        exhausted[0]["response_status"],
        serde_json::Value::Null,
        "an abandoned lease does not invent an HTTP outcome"
    );
    next_policy.revision = 3;
    store
        .set_workspace_model_pool(&principal, &next_policy)
        .await
        .unwrap();
    let revoked_claim = store.claim_event_delivery(id).await.unwrap().unwrap();
    let private_before = store
        .event_subscription(scope, &input.slug)
        .await
        .unwrap()
        .unwrap();
    let rotation = store
        .begin_encryption_rotation(Uuid::new_v4(), [1; 32], [2; 32])
        .await
        .unwrap();
    let replacement = vec![1u8; 48];
    store
        .replace_encrypted_envelope(
            &rotation,
            niu_storage::EncryptionRewrapTarget::EventSubscription(id),
            &private_before.secret_ciphertext,
            &replacement,
        )
        .await
        .unwrap();
    let private_after = store
        .event_subscription(scope, &input.slug)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(private_after.secret_ciphertext, replacement);
    assert_eq!(
        private_after.configuration.revision, private_before.configuration.revision,
        "offline key rotation must not mutate subscription policy revisions"
    );
    assert_eq!(private_after.cursor, private_before.cursor);
    store.revoke_key(scope, key.id).await.unwrap();
    assert!(
        !store
            .event_delivery_authorized(&revoked_claim)
            .await
            .unwrap()
    );
    assert!(
        !store
            .event_delivery_candidates()
            .await
            .unwrap()
            .contains(&id)
    );
    assert!(store.claim_event_delivery(id).await.unwrap().is_none());
    store
        .finish_event_delivery(&revoked_claim, None, Some("authority"))
        .await
        .unwrap();
    assert!(
        store
            .set_event_subscription(&principal, id, &disabled, None)
            .await
            .is_err(),
        "stale authenticated principal must not authorize a mutation"
    );
}
