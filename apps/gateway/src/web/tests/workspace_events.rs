use super::*;
use axum::body::{Body, Bytes, to_bytes};
use niu_storage::{IssuedKey, OperatorAuditActor, OperatorRole, OperatorScope, Store, TenantScope};
use std::sync::atomic::{AtomicUsize, Ordering};

async fn grant(store: &Store, scope: TenantScope, owner: Uuid, capabilities: &[&str]) -> IssuedKey {
    let request = store
        .create_agent_authorization_with_capabilities(
            "Codex",
            &capabilities
                .iter()
                .map(|value| value.to_string())
                .collect::<Vec<_>>(),
        )
        .await
        .unwrap();
    store
        .approve_agent_authorization(&request.user_code, scope, owner, &["fast".into()], 3600)
        .await
        .unwrap();
    store
        .exchange_agent_authorization(&request.device_secret)
        .await
        .unwrap()
        .unwrap()
}
async fn send(
    app: &Router,
    method: &str,
    path: &str,
    key: &str,
    body: Value,
) -> (StatusCode, Value) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(method)
                .uri(path)
                .header("authorization", format!("Bearer {key}"))
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert!(
        response.headers()["cache-control"]
            .to_str()
            .unwrap()
            .contains("no-store")
    );
    let status = response.status();
    let bytes = to_bytes(response.into_body(), 65536).await.unwrap();
    (status, serde_json::from_slice(&bytes).unwrap())
}
#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn workspace_events_api_delivers_signed_test_retries_reconciles_and_revokes(pool: PgPool) {
    #[derive(Clone)]
    struct Receiver {
        secret: Arc<Mutex<String>>,
        hits: Arc<AtomicUsize>,
        event: Arc<Mutex<Option<String>>>,
    }
    async fn receive(
        State(receiver): State<Receiver>,
        headers: HeaderMap,
        body: Bytes,
    ) -> StatusCode {
        use hmac::{Hmac, Mac};
        let signature = headers["x-niu-signature"].to_str().unwrap();
        let (timestamp, digest) = signature.split_once(",v1=").unwrap();
        let timestamp = timestamp.strip_prefix("t=").unwrap();
        let bytes = (0..digest.len())
            .step_by(2)
            .map(|index| u8::from_str_radix(&digest[index..index + 2], 16).unwrap())
            .collect::<Vec<_>>();
        let mut mac =
            Hmac::<sha2::Sha256>::new_from_slice(receiver.secret.lock().unwrap().as_bytes())
                .unwrap();
        mac.update(format!("{timestamp}.").as_bytes());
        mac.update(&body);
        mac.verify_slice(&bytes).unwrap();
        let event: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(event["type"], "subscription.test");
        assert_eq!(event["resource"]["kind"], "subscription");
        assert_eq!(event["id"], headers["x-niu-event-id"].to_str().unwrap());
        let reference = event["id"].as_str().unwrap().to_string();
        let mut previous = receiver.event.lock().unwrap();
        if let Some(previous) = previous.as_ref() {
            assert_eq!(previous, &reference);
        } else {
            *previous = Some(reference);
        }
        if receiver.hits.fetch_add(1, Ordering::SeqCst) == 0 {
            StatusCode::SERVICE_UNAVAILABLE
        } else {
            StatusCode::NO_CONTENT
        }
    }
    let fixture = Receiver {
        secret: Arc::new(Mutex::new(String::new())),
        hits: Arc::new(AtomicUsize::new(0)),
        event: Arc::new(Mutex::new(None)),
    };
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let upstream = Router::new()
        .route("/events", post(receive))
        .with_state(fixture.clone());
    let receiver = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
    let mut state = test_state(None, pool.clone());
    state
        .store
        .configure_platform_currency("USD")
        .await
        .unwrap();
    crate::payments::readiness::configure_test_gateway(&mut state).await;
    let cipher = Arc::new(
        crate::vendors::crypto::CredentialCipher::new(
            "event-api-fixture-encryption-key-at-least-32-characters",
        )
        .unwrap(),
    );
    state.vendor_cipher = Some(cipher.clone());
    let store = state.store.clone();
    let scope = store.default_workspace().await.unwrap();
    let owner = store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: None,
            },
            "Event API owner",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let writer = grant(
        &store,
        scope,
        owner.operator_id,
        &["events:read", "events:write"],
    )
    .await;
    let reader = grant(&store, scope, owner.operator_id, &["events:read"]).await;
    let ordinary = store
        .issue_key(scope, "Ordinary", &["fast".into()], 3600)
        .await
        .unwrap();
    let other = store
        .create_project(scope.organization_id, "Other event workspace")
        .await
        .unwrap();
    let foreign = grant(
        &store,
        other,
        owner.operator_id,
        &["events:read", "events:write"],
    )
    .await;
    let app = router(state);
    let configuration = json!({"slug":"agent-events","name":"Agent events","endpoint":"https://receiver.example/events","event_types":["pool.changed"],"enabled":true,"revision":0});
    let proposal = json!({"configuration":configuration});
    assert_eq!(
        send(
            &app,
            "PUT",
            "/v1/events/agent-events",
            &ordinary.token,
            proposal.clone()
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        send(
            &app,
            "PUT",
            "/v1/events/agent-events",
            &reader.token,
            proposal.clone()
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    let (status, created) = send(
        &app,
        "PUT",
        "/v1/events/agent-events",
        &writer.token,
        proposal.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(created["data"]["revision"], 1);
    let secret = created["signing_secret"].as_str().unwrap().to_owned();
    *fixture.secret.lock().unwrap() = secret.clone();
    let (status, current) = send(
        &app,
        "GET",
        "/v1/events/agent-events",
        &reader.token,
        Value::Null,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(current.get("signing_secret").is_none());
    assert!(!current.to_string().contains(&secret));
    assert_eq!(current["authorization_active"], true);
    assert_eq!(
        send(
            &app,
            "GET",
            "/v1/events/agent-events",
            &foreign.token,
            Value::Null
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        send(
            &app,
            "PUT",
            "/v1/events/agent-events",
            &writer.token,
            proposal
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    // A targeted test must not wake another subscription in this workspace.
    let mut second = configuration.clone();
    second["slug"] = json!("other-receiver");
    assert_eq!(
        send(
            &app,
            "PUT",
            "/v1/events/other-receiver",
            &writer.token,
            json!({"configuration":second})
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_eq!(
        send(
            &app,
            "POST",
            "/v1/events/agent-events/test",
            &reader.token,
            json!({"revision":1})
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        send(
            &app,
            "POST",
            "/v1/events/agent-events/test",
            &writer.token,
            json!({"revision":7})
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    let (status, queued) = send(
        &app,
        "POST",
        "/v1/events/agent-events/test",
        &writer.token,
        json!({"revision":1}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(queued["data"]["delivery"], "queued");
    let other_record = store
        .event_subscription(scope, "other-receiver")
        .await
        .unwrap()
        .unwrap();
    assert!(
        store
            .claim_event_delivery(other_record.id)
            .await
            .unwrap()
            .is_none()
    );
    crate::resource_events::run_fixture_batch(&store, &cipher, &format!("http://{address}/events"))
        .await
        .unwrap();
    let (_, diagnostics) = send(
        &app,
        "GET",
        "/v1/events/agent-events/deliveries",
        &reader.token,
        Value::Null,
    )
    .await;
    assert_eq!(diagnostics["data"][0]["state"], "pending");
    assert_eq!(diagnostics["data"][0]["response_status"], 503);
    let delivery_id = Uuid::parse_str(diagnostics["data"][0]["id"].as_str().unwrap()).unwrap();
    sqlx::query("UPDATE workspace_event_deliveries SET available_at=clock_timestamp()-interval '1 second' WHERE id=$1").bind(delivery_id).execute(&pool).await.unwrap();
    crate::resource_events::run_fixture_batch(&store, &cipher, &format!("http://{address}/events"))
        .await
        .unwrap();
    let (_, diagnostics) = send(
        &app,
        "GET",
        "/v1/events/agent-events/deliveries",
        &reader.token,
        Value::Null,
    )
    .await;
    assert_eq!(diagnostics["data"][0]["state"], "delivered");
    assert_eq!(diagnostics["data"][0]["attempts"], 2);
    assert_eq!(diagnostics["data"][0]["response_status"], 204);
    assert_eq!(diagnostics["data"][0]["lease_expired"], false);
    let (_, processed) = send(
        &app,
        "GET",
        "/v1/events/agent-events",
        &reader.token,
        Value::Null,
    )
    .await;
    assert_eq!(processed["processed_cursor"], "1");

    assert_eq!(fixture.hits.load(Ordering::SeqCst), 2);
    let (_, events) = send(
        &app,
        "GET",
        "/v1/events/log?after=0",
        &reader.token,
        Value::Null,
    )
    .await;
    assert_eq!(events["data"][0]["id"], queued["data"]["id"]);
    assert_eq!(events["next_after"], "1");
    assert_eq!(
        send(
            &app,
            "GET",
            "/v1/events/log?after=999",
            &reader.token,
            Value::Null
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    let (_, foreign_events) =
        send(&app, "GET", "/v1/events/log", &foreign.token, Value::Null).await;
    assert_eq!(foreign_events["data"], json!([]));
    let mut changed = configuration.clone();
    changed["revision"] = json!(1);
    changed["endpoint"] = json!("https://new-receiver.example/events");
    assert_eq!(
        send(
            &app,
            "PUT",
            "/v1/events/agent-events",
            &writer.token,
            json!({"configuration":changed})
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    let (_, rotated) = send(
        &app,
        "PUT",
        "/v1/events/agent-events",
        &writer.token,
        json!({"configuration":changed,"rotate_secret":true}),
    )
    .await;
    assert_ne!(rotated["signing_secret"], created["signing_secret"]);
    assert_eq!(rotated["data"]["revision"], 2);
    changed["revision"] = json!(2);
    changed["enabled"] = json!(false);
    let (_, disabled) = send(
        &app,
        "PUT",
        "/v1/events/agent-events",
        &writer.token,
        json!({"configuration":changed}),
    )
    .await;
    assert!(disabled.get("signing_secret").is_none());
    assert_eq!(disabled["data"]["revision"], 3);
    assert_eq!(
        send(
            &app,
            "POST",
            "/v1/events/agent-events/test",
            &writer.token,
            json!({"revision":3})
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    crate::resource_events::run_fixture_batch(&store, &cipher, &format!("http://{address}/events"))
        .await
        .unwrap();
    assert_eq!(
        fixture.hits.load(Ordering::SeqCst),
        2,
        "disabled and targeted subscriptions must not create extra delivery"
    );
    store.revoke_key(scope, writer.id).await.unwrap();
    let (_, readback) = send(
        &app,
        "GET",
        "/v1/events/agent-events",
        &reader.token,
        Value::Null,
    )
    .await;
    assert_eq!(readback["authorization_active"], false);
    let (_, history) = send(
        &app,
        "GET",
        "/v1/events/agent-events/history",
        &reader.token,
        Value::Null,
    )
    .await;
    assert_eq!(history["data"].as_array().unwrap().len(), 3);
    assert!(!history.to_string().contains(&secret));
    receiver.abort();
}
