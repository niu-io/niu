//! Automated stability, fault-injection, concurrency, and resilience test suite
//! for the Niu backend service.
//!
//! Verifies bounded memory and stack depth under adversarial inputs, arbitrarily
//! fragmented SSE streams, concurrent guardrail regex evaluation, upstream chaos
//! (429/500/502/malformed JSON/inconsistent usage), mid-stream client disconnect
//! slot recovery, and zero budget overdraft under concurrent contention.

use super::*;
use crate::{
    customer_response::{CustomerSse, sanitize},
    guardrails::input::{Action, CompiledInputPolicy, InspectionError, Protocol, RuleConfig},
    streaming::ChatEvidence,
};
use std::sync::atomic::{AtomicUsize, Ordering};

#[test]
fn stability_sse_chunk_fragmentation_and_deep_nesting_resilience() {
    let raw_stream = concat!(
        "\u{feff}data: {\"id\":\"frag-1\",\"model\":\"provider-secret\",\"choices\":[{\"index\":0,\"delta\":{\"role\":\"assistant\",\"content\":\"牛元 Niu 🚀 \"},\"finish_reason\":null}]}\r\n\r\n",
        "data: {\"id\":\"frag-1\",\"model\":\"provider-secret\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"resilient stream\"},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":12,\"completion_tokens\":6,\"total_tokens\":18,\"cost\":0.09,\"cost_details\":{\"upstream_inference_cost\":0.07},\"is_byok\":true}}\n\n",
        "data: [DONE]\r\n\r\n",
        "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"FORBIDDEN_POST_DONE_TRAILER\"}}],\"usage\":{\"prompt_tokens\":9999,\"completion_tokens\":9999}}\n\n"
    );
    let raw_bytes = raw_stream.as_bytes();

    for chunk_size in [1usize, 2, 3, 5, 7, 13, 31, 64, raw_bytes.len()] {
        let mut sse = CustomerSse::with_protocol(false, Some("fast".to_string()));
        let mut evidence = ChatEvidence::default();
        let mut delivered = Vec::new();

        for chunk in raw_bytes.chunks(chunk_size) {
            evidence.feed(chunk).expect("evidence feed must succeed");
            let out = sse.feed(chunk).expect("sse feed must succeed");
            delivered.extend_from_slice(&out);
        }
        delivered.extend_from_slice(&sse.finish_terminal().expect("terminal finish"));

        let text = String::from_utf8(delivered).expect("valid UTF-8 output");
        assert!(
            text.contains("牛元 Niu 🚀 "),
            "multi-byte UTF-8 content must survive {chunk_size}-byte chunking"
        );
        assert!(text.contains("resilient stream"));
        assert!(text.contains("data: [DONE]"));
        assert!(!text.contains("upstream_inference_cost"));
        assert!(!text.contains("cost_details"));
        assert!(!text.contains("is_byok"));
        assert!(
            !text.contains("FORBIDDEN_POST_DONE_TRAILER"),
            "post-[DONE] trailer must be ignored at chunk_size={chunk_size}"
        );
        assert!(evidence.done);
        assert_eq!(evidence.usage(), Some((12, 6)));
    }

    // Deeply nested usage object (100 levels) must not overflow the stack and
    // must null out compound values beyond depth 64.
    let mut nested = json!({"cost": 0.5, "leaf": "safe"});
    for _ in 0..100 {
        nested = json!({"cost": 0.1, "nested": nested});
    }
    let mut envelope = json!({
        "id": "deep-usage",
        "usage": nested
    });
    assert!(sanitize(&mut envelope));
    assert!(envelope["usage"].get("cost").is_none());

    // Oversized SSE frame (> 65,536 bytes for Chat) must fail closed immediately.
    let oversized_frame = format!(
        "data: {{\"choices\":[{{\"index\":0,\"delta\":{{\"content\":\"{}\"}}}}]}}\n\n",
        "A".repeat(70_000)
    );
    let mut sse_limit = CustomerSse::default();
    assert!(
        sse_limit.feed(oversized_frame.as_bytes()).is_err(),
        "oversized Chat SSE event must fail closed"
    );
    let mut evidence_limit = ChatEvidence::default();
    assert!(
        evidence_limit.feed(oversized_frame.as_bytes()).is_err(),
        "oversized ChatEvidence SSE event must fail closed"
    );
}

#[tokio::test]
async fn stability_guardrail_concurrent_regex_compilation_and_evaluation() {
    let mut tasks = Vec::new();
    for worker_id in 0..32usize {
        tasks.push(tokio::spawn(async move {
            let rules: Vec<RuleConfig> = (0..32)
                .map(|idx| RuleConfig {
                    pattern: Some(format!("SYNTHETIC_MARKER_{worker_id}_{idx}_[0-9]{{4}}")),
                    preset: None,
                    action: if idx % 2 == 0 {
                        Action::Redact
                    } else {
                        Action::Block
                    },
                })
                .collect();
            let policy = CompiledInputPolicy::compile(&rules).expect("compile 32 rules");

            let clean_text = "x".repeat(16_384);
            let clean_body = json!({"messages": [{"role": "user", "content": clean_text}]});
            let inspected = policy
                .inspect(Protocol::Chat, &clean_body)
                .expect("clean payload must pass");
            assert_eq!(
                inspected["messages"][0]["content"].as_str().unwrap().len(),
                16_384
            );

            let redact_body = json!({
                "messages": [{
                    "role": "user",
                    "content": format!("prefix SYNTHETIC_MARKER_{worker_id}_0_1234 suffix")
                }]
            });
            let redacted = policy
                .inspect(Protocol::Chat, &redact_body)
                .expect("even-index rule must redact");
            assert_eq!(
                redacted["messages"][0]["content"],
                "prefix [REDACTED] suffix"
            );

            let block_body = json!({
                "messages": [{
                    "role": "user",
                    "content": format!("prefix SYNTHETIC_MARKER_{worker_id}_1_5678 suffix")
                }]
            });
            assert_eq!(
                policy.inspect(Protocol::Chat, &block_body),
                Err(InspectionError::Blocked)
            );
        }));
    }

    for task in tasks {
        task.await
            .expect("concurrent guardrail worker must not panic");
    }
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn stability_high_concurrency_fault_injection_and_cancellation_recovery(pool: sqlx::PgPool) {
    use axum::response::{IntoResponse, Response};

    let upstream = Router::new().route(
        "/v1/chat/completions",
        post(|Json(body): Json<Value>| async move {
            let mode = body
                .pointer("/messages/0/content")
                .and_then(Value::as_str)
                .unwrap_or("ok");
            match mode {
                "upstream-429" => (
                    StatusCode::TOO_MANY_REQUESTS,
                    Json(json!({"error": {"message": "private-upstream-rate-limit-detail"}})),
                )
                    .into_response(),
                "upstream-500" => (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"error": {"message": "private-upstream-stack-trace"}})),
                )
                    .into_response(),
                "malformed-json" => Response::builder()
                    .status(StatusCode::OK)
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from("{not-valid-json"))
                    .unwrap(),
                "inconsistent-usage" => Json(json!({
                    "id": "bad-usage",
                    "model": "provider-secret-model",
                    "choices": [{"index": 0, "message": {"role": "assistant", "content": "hi"}, "finish_reason": "stop"}],
                    "usage": {"prompt_tokens": 5, "completion_tokens": 5, "total_tokens": 999}
                }))
                .into_response(),
                "slow-stream-cancel" => {
                    let stream = async_stream_chunks();
                    Response::builder()
                        .status(StatusCode::OK)
                        .header("content-type", "text/event-stream")
                        .body(axum::body::Body::from_stream(stream))
                        .unwrap()
                }
                _ => Json(json!({
                    "id": "stable-ok",
                    "model": "provider-secret-model",
                    "choices": [{"index": 0, "message": {"role": "assistant", "content": "ok"}, "finish_reason": "stop"}],
                    "usage": {"prompt_tokens": 4, "completion_tokens": 2, "total_tokens": 6}
                }))
                .into_response(),
            }
        }),
    );

    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });

    let state = test_state(Some(format!("http://{address}/v1")), pool.clone());
    let org = state
        .store
        .create_organization("Stability Chaos Org")
        .await
        .unwrap();
    let scope = state
        .store
        .create_project(org, "Chaos Workspace")
        .await
        .unwrap();
    let key = state
        .store
        .issue_key(scope, "Chaos Key", &["fast".into()], 3600)
        .await
        .unwrap();
    let app = router(state.clone());

    let scenarios = [
        "ok",
        "upstream-429",
        "upstream-500",
        "malformed-json",
        "inconsistent-usage",
        "slow-stream-cancel",
    ];

    let mut handles = Vec::new();
    for i in 0..48usize {
        let scenario = scenarios[i % scenarios.len()];
        let app_clone = app.clone();
        let token = key.token.clone();
        handles.push(tokio::spawn(async move {
            let is_stream = scenario == "slow-stream-cancel";
            let req = Request::post("/v1/chat/completions")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({
                        "model": "fast",
                        "stream": is_stream,
                        "messages": [{"role": "user", "content": scenario}]
                    })
                    .to_string(),
                ))
                .unwrap();
            let resp = app_clone.oneshot(req).await.unwrap();
            let status = resp.status();
            if is_stream {
                assert_eq!(status, StatusCode::OK);
                // Read only the first frame and drop the body to simulate abrupt client disconnect.
                let mut body_stream = resp.into_body().into_data_stream();
                let first = futures_util::StreamExt::next(&mut body_stream).await;
                assert!(first.is_some());
                drop(body_stream);
            } else {
                let bytes = resp.into_body().collect().await.unwrap().to_bytes();
                let text = String::from_utf8_lossy(&bytes);
                assert!(
                    !text.contains("private-upstream-"),
                    "private upstream error details must never leak to clients"
                );
                match scenario {
                    "ok" | "inconsistent-usage" => assert_eq!(status, StatusCode::OK),
                    "upstream-429" => assert_eq!(status, StatusCode::TOO_MANY_REQUESTS),
                    "upstream-500" => assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR),
                    "malformed-json" => assert_eq!(status, StatusCode::BAD_GATEWAY),
                    _ => unreachable!(),
                }
            }
        }));
    }

    for handle in handles {
        handle.await.expect("chaos request task must not panic");
    }

    // Verify gateway still serves normal traffic cleanly after the fault storm.
    let recovery_resp = app
        .clone()
        .oneshot(
            Request::post("/v1/chat/completions")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({
                        "model": "fast",
                        "messages": [{"role": "user", "content": "ok"}]
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(recovery_resp.status(), StatusCode::OK);
    let _ = recovery_resp.into_body().collect().await.unwrap();

    // Drain asynchronous writer queues and verify in-flight counter returned to 0.
    state.gateway_writes.shutdown().await;
    assert_eq!(
        state.inference_in_flight.load(Ordering::SeqCst),
        0,
        "inference_in_flight must return to 0 after concurrent chaos and stream cancellations"
    );

    // After writer queue shutdown, new admissions must fail closed with 503 Service Unavailable.
    let post_shutdown_resp = app
        .oneshot(
            Request::post("/v1/chat/completions")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({
                        "model": "fast",
                        "messages": [{"role": "user", "content": "ok"}]
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(post_shutdown_resp.status(), StatusCode::SERVICE_UNAVAILABLE);

    server.abort();
}

fn async_stream_chunks()
-> impl futures_util::Stream<Item = Result<axum::body::Bytes, std::io::Error>> {
    futures_util::stream::unfold(0u32, |step| async move {
        match step {
            0 => Some((
                Ok(axum::body::Bytes::from_static(
                    b"data: {\"id\":\"cancel-1\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"chunk-1\"},\"finish_reason\":null}]}\n\n",
                )),
                1,
            )),
            1 => {
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                Some((
                    Ok(axum::body::Bytes::from_static(b"data: [DONE]\n\n")),
                    2,
                ))
            }
            _ => None,
        }
    })
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn stability_concurrent_priced_budget_contention_never_overdrafts(pool: sqlx::PgPool) {
    const INPUT_BOUND: i64 = 64;
    const RESERVATION_PER_REQ: i64 = INPUT_BOUND + 10 * 2; // 84 nanos
    const ALLOWED_CONCURRENT_REQUESTS: i64 = 5;

    let upstream_hits = Arc::new(AtomicUsize::new(0));
    let hits_ref = upstream_hits.clone();

    let upstream = Router::new().route(
        "/v1/chat/completions",
        post(move || {
            let hits = hits_ref.clone();
            async move {
                hits.fetch_add(1, Ordering::SeqCst);
                tokio::time::sleep(std::time::Duration::from_millis(10)).await;
                Json(json!({
                    "id": "priced-contention",
                    "model": "provider-secret-model",
                    "choices": [{
                        "index": 0,
                        "message": {"role": "assistant", "content": "ok"},
                        "finish_reason": "stop"
                    }],
                    "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15}
                }))
            }
        }),
    );

    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });

    let mut state = test_state(Some(format!("http://{address}/v1")), pool.clone());
    Arc::make_mut(&mut state.config)
        .models
        .get_mut("fast")
        .unwrap()
        .pricing = Some(crate::config::RoutePricing {
        currency: "USD".into(),
        api_prompt_rate: 1_000_000,
        api_completion_rate: 2_000_000,
        cash_prompt_rate: 1_000_000,
        cash_completion_rate: 2_000_000,
        max_input_tokens: INPUT_BOUND,
        max_output_tokens: 10,
    });

    let org = state
        .store
        .create_organization("Budget Contention Org")
        .await
        .unwrap();
    let scope = state
        .store
        .create_project(org, "Budget Contention Workspace")
        .await
        .unwrap();
    let total_budget = RESERVATION_PER_REQ * ALLOWED_CONCURRENT_REQUESTS;
    state
        .store
        .create_budget(scope, "USD", total_budget)
        .await
        .unwrap();
    let key = state
        .store
        .issue_key(scope, "Contention Key", &["fast".into()], 3600)
        .await
        .unwrap();

    let app = router(state.clone());

    // Launch 20 concurrent requests simultaneously against a budget that can hold 5 reservations.
    let barrier = Arc::new(tokio::sync::Barrier::new(20));
    let mut handles = Vec::new();
    for _ in 0..20 {
        let app_clone = app.clone();
        let token = key.token.clone();
        let sync = barrier.clone();
        handles.push(tokio::spawn(async move {
            sync.wait().await;
            let resp = app_clone
                .oneshot(
                    Request::post("/v1/chat/completions")
                        .header("authorization", format!("Bearer {token}"))
                        .header("content-type", "application/json")
                        .body(axum::body::Body::from(
                            json!({
                                "model": "fast",
                                "messages": [{"role": "user", "content": "hi"}]
                            })
                            .to_string(),
                        ))
                        .unwrap(),
                )
                .await
                .unwrap();
            resp.status()
        }));
    }

    let mut ok_count = 0usize;
    let mut rejected_count = 0usize;
    for handle in handles {
        match handle.await.unwrap() {
            StatusCode::OK => ok_count += 1,
            StatusCode::PAYMENT_REQUIRED | StatusCode::TOO_MANY_REQUESTS => rejected_count += 1,
            other => panic!("unexpected status under budget contention: {other}"),
        }
    }

    state.gateway_writes.shutdown().await;

    assert!(
        (1..=20).contains(&ok_count),
        "at least one request must succeed under contention"
    );
    assert!(
        rejected_count > 0,
        "concurrent burst exceeding reservation capacity must reject excess requests"
    );
    assert_eq!(ok_count + rejected_count, 20);
    assert_eq!(upstream_hits.load(Ordering::SeqCst), ok_count);

    let budget_snapshot = state.store.budget(scope).await.unwrap().unwrap();
    assert_eq!(
        budget_snapshot.reserved_nanos, 0,
        "all reservations must be settled or released after completion"
    );
    assert!(
        budget_snapshot.spent_nanos <= total_budget,
        "settled spend ({}) must never exceed budget limit ({total_budget})",
        budget_snapshot.spent_nanos
    );

    server.abort();
}
