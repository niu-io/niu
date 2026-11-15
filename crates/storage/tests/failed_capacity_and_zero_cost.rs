use niu_storage::{
    GatewayActivityFilter, MIGRATOR, OperatorAuditActor, ProviderOfferInput, RequestFailure,
    RequestFailureKind, RequestTransportPhase, Store,
};
use serde_json::json;
use sqlx::PgPool;
use uuid::Uuid;

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn failed_requests_release_capacity_according_to_failure_semantics(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();

    // Key 1: HTTP 429 and connection/region rejections release TPM and concurrency immediately.
    let key1 = store
        .issue_key(scope, "Immediate release key", &["*".into()], 3600)
        .await
        .unwrap();
    store
        .set_key_concurrency_policy(scope, key1.id, Some(1), 0, OperatorAuditActor::Installation)
        .await
        .unwrap();
    store
        .set_key_token_rate_policy(
            scope,
            key1.id,
            Some(100),
            0,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let principal1 = store.authenticate(&key1.token).await.unwrap();

    for failure in [
        RequestFailure {
            kind: RequestFailureKind::UpstreamHttpError,
            upstream_http_status: Some(429),
            transport_phase: None,
        },
        RequestFailure {
            kind: RequestFailureKind::UpstreamRegionUnavailable,
            upstream_http_status: Some(403),
            transport_phase: None,
        },
        RequestFailure {
            kind: RequestFailureKind::UpstreamAccountRestricted,
            upstream_http_status: Some(403),
            transport_phase: None,
        },
        RequestFailure {
            kind: RequestFailureKind::UpstreamConnectionError,
            upstream_http_status: None,
            transport_phase: Some(RequestTransportPhase::Connection),
        },
    ] {
        let operation = store.create_operation(scope, "fast").await.unwrap();
        let attempt = store
            .prepare_attempt(scope, operation, "internal-route", "fixture")
            .await
            .unwrap();
        store
            .bind_key_token_bound(scope, attempt, Some(80))
            .await
            .unwrap();
        store.mark_dispatched(&principal1, attempt).await.unwrap();
        store
            .save_request_failure(scope, attempt, failure)
            .await
            .unwrap();

        let tpm = store
            .key_token_rate_policy(scope, key1.id)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(tpm["reserved_tokens"], "0");
        assert_eq!(tpm["unbounded_requests"], 0);
        assert_eq!(tpm["committed_tokens"], "0");
        assert_eq!(
            store
                .key_capacity_requests(scope, key1.id, "tokens", None, 50)
                .await
                .unwrap()
                .unwrap()["total"],
            0
        );
        let conc = store
            .key_concurrency_policy(scope, key1.id)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(conc["active_requests"], 0);
        assert_eq!(
            store
                .key_capacity_requests(scope, key1.id, "concurrency", None, 50)
                .await
                .unwrap()
                .unwrap()["total"],
            0
        );
    }

    // Unbounded attempt dispatched before a TPM limit was set is cleared immediately on 429,
    // allowing an 80-token dispatch immediately afterwards.
    store
        .set_key_token_rate_policy(scope, key1.id, None, 1, OperatorAuditActor::Installation)
        .await
        .unwrap();
    let op_unbounded = store.create_operation(scope, "fast").await.unwrap();
    let att_unbounded = store
        .prepare_attempt(scope, op_unbounded, "internal-route", "fixture")
        .await
        .unwrap();
    store
        .mark_dispatched(&principal1, att_unbounded)
        .await
        .unwrap();
    store
        .set_key_token_rate_policy(
            scope,
            key1.id,
            Some(100),
            2,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    assert_eq!(
        store
            .key_token_rate_policy(scope, key1.id)
            .await
            .unwrap()
            .unwrap()["unbounded_requests"],
        1
    );
    store
        .save_request_failure(
            scope,
            att_unbounded,
            RequestFailure {
                kind: RequestFailureKind::UpstreamHttpError,
                upstream_http_status: Some(429),
                transport_phase: None,
            },
        )
        .await
        .unwrap();
    assert_eq!(
        store
            .key_token_rate_policy(scope, key1.id)
            .await
            .unwrap()
            .unwrap()["unbounded_requests"],
        0
    );
    let op_followup = store.create_operation(scope, "fast").await.unwrap();
    let att_followup = store
        .prepare_attempt(scope, op_followup, "internal-route", "fixture")
        .await
        .unwrap();
    store
        .bind_key_token_bound(scope, att_followup, Some(80))
        .await
        .unwrap();
    store
        .mark_dispatched(&principal1, att_followup)
        .await
        .unwrap();

    // Key 2: Uncertain HTTP 502 releases concurrency immediately, holds TPM for 60s, and expires after 60s.
    let key2 = store
        .issue_key(scope, "Uncertain 502 key", &["*".into()], 3600)
        .await
        .unwrap();
    store
        .set_key_concurrency_policy(scope, key2.id, Some(1), 0, OperatorAuditActor::Installation)
        .await
        .unwrap();
    store
        .set_key_token_rate_policy(
            scope,
            key2.id,
            Some(100),
            0,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let principal2 = store.authenticate(&key2.token).await.unwrap();
    let root2: Uuid = sqlx::query_scalar("SELECT spending_root_id FROM api_keys WHERE id=$1")
        .bind(key2.id)
        .fetch_one(&pool)
        .await
        .unwrap();

    let op502 = store.create_operation(scope, "fast").await.unwrap();
    let att502 = store
        .prepare_attempt(scope, op502, "internal-route", "fixture")
        .await
        .unwrap();
    store
        .bind_key_token_bound(scope, att502, Some(80))
        .await
        .unwrap();
    store.mark_dispatched(&principal2, att502).await.unwrap();
    store
        .save_request_failure(
            scope,
            att502,
            RequestFailure {
                kind: RequestFailureKind::UpstreamHttpError,
                upstream_http_status: Some(502),
                transport_phase: None,
            },
        )
        .await
        .unwrap();

    let tpm2 = store
        .key_token_rate_policy(scope, key2.id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(tpm2["reserved_tokens"], "80");
    assert_eq!(
        store
            .key_capacity_requests(scope, key2.id, "tokens", None, 50)
            .await
            .unwrap()
            .unwrap()["total"],
        1
    );
    assert_eq!(
        store
            .key_concurrency_policy(scope, key2.id)
            .await
            .unwrap()
            .unwrap()["active_requests"],
        0
    );
    assert_eq!(
        store
            .key_capacity_requests(scope, key2.id, "concurrency", None, 50)
            .await
            .unwrap()
            .unwrap()["total"],
        0
    );
    // New dispatch fits in concurrency (released) and remaining 20 TPM budget.
    let op_small = store.create_operation(scope, "fast").await.unwrap();
    let att_small = store
        .prepare_attempt(scope, op_small, "internal-route", "fixture")
        .await
        .unwrap();
    store
        .bind_key_token_bound(scope, att_small, Some(10))
        .await
        .unwrap();
    store.mark_dispatched(&principal2, att_small).await.unwrap();

    // After 61 seconds, the failed 502 attempt (80 tokens) expires from TPM budget,
    // leaving only the still-in-flight attempt's 10 reserved tokens.
    let expired: (i64, i64, i64) = sqlx::query_as(
        "SELECT known_tokens::bigint, reserved_tokens::bigint, unbounded_requests FROM niu_key_token_budget($1, NULL, clock_timestamp() + interval '61 seconds')",
    )
    .bind(root2)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(expired, (0, 10, 0));

    // Key 3: Client disconnect (response_stream_cancelled) retains concurrency until settled while expiring TPM after 60s.
    let key3 = store
        .issue_key(scope, "Disconnect key", &["*".into()], 3600)
        .await
        .unwrap();
    store
        .set_key_concurrency_policy(scope, key3.id, Some(1), 0, OperatorAuditActor::Installation)
        .await
        .unwrap();
    let principal3 = store.authenticate(&key3.token).await.unwrap();
    let root3: Uuid = sqlx::query_scalar("SELECT spending_root_id FROM api_keys WHERE id=$1")
        .bind(key3.id)
        .fetch_one(&pool)
        .await
        .unwrap();

    let op_cancel = store.create_operation(scope, "fast").await.unwrap();
    let att_cancel = store
        .prepare_attempt(scope, op_cancel, "internal-route", "fixture")
        .await
        .unwrap();
    store
        .bind_key_token_bound(scope, att_cancel, Some(20))
        .await
        .unwrap();
    store
        .mark_dispatched(&principal3, att_cancel)
        .await
        .unwrap();
    store
        .save_request_failure(
            scope,
            att_cancel,
            RequestFailure {
                kind: RequestFailureKind::ResponseStreamCancelled,
                upstream_http_status: None,
                transport_phase: None,
            },
        )
        .await
        .unwrap();

    assert_eq!(
        store
            .key_concurrency_policy(scope, key3.id)
            .await
            .unwrap()
            .unwrap()["active_requests"],
        1
    );
    assert_eq!(
        store
            .key_capacity_requests(scope, key3.id, "concurrency", None, 50)
            .await
            .unwrap()
            .unwrap()["total"],
        1
    );
    // Second concurrent attempt must still be blocked by concurrency limit=1.
    let op_blocked = store.create_operation(scope, "fast").await.unwrap();
    let att_blocked = store
        .prepare_attempt(scope, op_blocked, "internal-route", "fixture")
        .await
        .unwrap();
    assert!(
        store
            .mark_dispatched(&principal3, att_blocked)
            .await
            .is_err()
    );

    let cancel_expired: (i64, i64, i64) = sqlx::query_as(
        "SELECT known_tokens::bigint, reserved_tokens::bigint, unbounded_requests FROM niu_key_token_budget($1, NULL, clock_timestamp() + interval '61 seconds')",
    )
    .bind(root3)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(cancel_expired, (0, 0, 0));
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn zero_cost_failed_requests_are_not_pending_while_paid_failures_remain_pending(
    pool: PgPool,
) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();

    store
        .publish_customer_tariff(
            scope,
            &ProviderOfferInput {
                model_alias: "free-text".into(),
                currency: "USD".into(),
                prompt_rate: "0".into(),
                completion_rate: "0".into(),
                expected_revision: None,
            },
        )
        .await
        .unwrap();
    store
        .publish_customer_tariff(
            scope,
            &ProviderOfferInput {
                model_alias: "paid-text".into(),
                currency: "USD".into(),
                prompt_rate: "1000".into(),
                completion_rate: "1000".into(),
                expected_revision: None,
            },
        )
        .await
        .unwrap();

    let key = store
        .issue_key(scope, "Billing test key", &["*".into()], 3600)
        .await
        .unwrap();
    let principal = store.authenticate(&key.token).await.unwrap();

    let (_, free_429) = store
        .prepare_gateway_attempt(scope, "free-text", None, "fixture")
        .await
        .unwrap();
    store
        .bind_customer_tariff(scope, free_429, "free-text")
        .await
        .unwrap();
    store.mark_dispatched(&principal, free_429).await.unwrap();
    store
        .save_request_failure(
            scope,
            free_429,
            RequestFailure {
                kind: RequestFailureKind::UpstreamHttpError,
                upstream_http_status: Some(429),
                transport_phase: None,
            },
        )
        .await
        .unwrap();

    let (_, free_502) = store
        .prepare_gateway_attempt(scope, "free-text", None, "fixture")
        .await
        .unwrap();
    store
        .bind_customer_tariff(scope, free_502, "free-text")
        .await
        .unwrap();
    store.mark_dispatched(&principal, free_502).await.unwrap();
    store
        .save_request_failure(
            scope,
            free_502,
            RequestFailure {
                kind: RequestFailureKind::UpstreamHttpError,
                upstream_http_status: Some(502),
                transport_phase: None,
            },
        )
        .await
        .unwrap();

    let (_, paid_502) = store
        .prepare_gateway_attempt(scope, "paid-text", None, "fixture")
        .await
        .unwrap();
    store
        .bind_customer_tariff(scope, paid_502, "paid-text")
        .await
        .unwrap();
    store.mark_dispatched(&principal, paid_502).await.unwrap();
    store
        .save_request_failure(
            scope,
            paid_502,
            RequestFailure {
                kind: RequestFailureKind::UpstreamHttpError,
                upstream_http_status: Some(502),
                transport_phase: None,
            },
        )
        .await
        .unwrap();

    // Both failed zero-cost attempts report not_charged; paid 502 remains pending.
    assert_eq!(
        store
            .gateway_request(scope, free_429)
            .await
            .unwrap()
            .unwrap()
            .customer_charge_status,
        "not_charged"
    );
    assert_eq!(
        store
            .gateway_request(scope, free_502)
            .await
            .unwrap()
            .unwrap()
            .customer_charge_status,
        "not_charged"
    );
    assert_eq!(
        store
            .gateway_request(scope, paid_502)
            .await
            .unwrap()
            .unwrap()
            .customer_charge_status,
        "pending"
    );

    let exported = store
        .gateway_activity_export(scope, &GatewayActivityFilter::default())
        .await
        .unwrap();
    let free_export_count = exported
        .iter()
        .filter(|row| row.model == "free-text" && row.customer_charge_status == "not_charged")
        .count();
    let paid_export_count = exported
        .iter()
        .filter(|row| row.model == "paid-text" && row.customer_charge_status == "pending")
        .count();
    assert_eq!(free_export_count, 2);
    assert_eq!(paid_export_count, 1);

    let summary = store
        .gateway_activity_summary(scope, &GatewayActivityFilter::default())
        .await
        .unwrap();
    assert_eq!(summary.unresolved_customer_charge_count, 1);

    let billing = store.customer_billing(scope).await.unwrap();
    assert_eq!(billing["unresolved"], "1");

    let session_id = Uuid::new_v4();
    store
        .save_chat_session(
            scope,
            "owner",
            session_id,
            &json!({
                "id": session_id,
                "prompt": "Check zero-cost failure status",
                "createdAt": 1,
                "results": [
                    {"attemptId": free_429, "model": "free-text", "phase": "error", "elapsedMs": 1},
                    {"attemptId": free_502, "model": "free-text", "phase": "error", "elapsedMs": 1},
                    {"attemptId": paid_502, "model": "paid-text", "phase": "error", "elapsedMs": 1}
                ],
                "turns": []
            }),
        )
        .await
        .unwrap();
    let saved = store.chat_sessions(scope, "owner").await.unwrap();
    let statuses: Vec<&str> = saved[0]["results"]
        .as_array()
        .unwrap()
        .iter()
        .map(|row| row["customerChargeStatus"].as_str().unwrap())
        .collect();
    assert_eq!(statuses, vec!["not_charged", "not_charged", "pending"]);
}
