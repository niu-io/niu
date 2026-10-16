//! Automated performance, latency percentile (P50/P95/P99), and throughput SLO
//! test suite for the Niu backend service.
//!
//! Enforces deterministic performance gates across SSE stream sanitization,
//! multi-rule guardrail regex inspection, and end-to-end PostgreSQL-backed
//! HTTP gateway inference proxy workflows.

use super::*;
use crate::{
    customer_response::CustomerSse,
    guardrails::input::{Action, CompiledInputPolicy, Protocol, RuleConfig},
    streaming::ChatEvidence,
};
use std::time::Instant;

fn percentile_ms(samples_ms: &[f64], p: f64) -> f64 {
    assert!(
        !samples_ms.is_empty(),
        "percentile requires non-empty samples"
    );
    let mut sorted = samples_ms.to_vec();
    sorted.sort_by(|a, b| a.total_cmp(b));
    let idx = ((sorted.len() as f64 * p).ceil() as usize)
        .saturating_sub(1)
        .min(sorted.len() - 1);
    (sorted[idx] * 1000.0).round() / 1000.0
}

#[test]
fn performance_sse_sanitization_and_evidence_throughput_slo() {
    let payload = concat!(
        "data: {\"id\":\"perf-sse-1\",\"model\":\"provider-secret\",\"choices\":[{\"index\":0,\"delta\":{\"role\":\"assistant\",\"content\":\"Hello \"},\"finish_reason\":null}]}\n\n",
        "data: {\"id\":\"perf-sse-1\",\"model\":\"provider-secret\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"from Niu gateway \"},\"finish_reason\":null}]}\n\n",
        "data: {\"id\":\"perf-sse-1\",\"model\":\"provider-secret\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"benchmark.\"},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":32,\"completion_tokens\":16,\"total_tokens\":48,\"cost\":0.012,\"cost_details\":{\"upstream_inference_cost\":0.009},\"is_byok\":false}}\n\n",
        "data: [DONE]\n\n"
    )
    .as_bytes();

    // Warmup
    for _ in 0..50 {
        let mut sse = CustomerSse::with_protocol(false, Some("fast".to_string()));
        let mut evidence = ChatEvidence::default();
        evidence.feed(payload).unwrap();
        let _ = sse.feed(payload).unwrap();
        let _ = sse.finish_terminal().unwrap();
    }

    let iterations = 1_000usize;
    let mut latencies_ms = Vec::with_capacity(iterations);
    let suite_start = Instant::now();

    for _ in 0..iterations {
        let started = Instant::now();
        let mut sse = CustomerSse::with_protocol(false, Some("fast".to_string()));
        let mut evidence = ChatEvidence::default();
        for chunk in payload.chunks(128) {
            evidence.feed(chunk).unwrap();
            let _ = sse.feed(chunk).unwrap();
        }
        let _ = sse.finish_terminal().unwrap();
        assert!(evidence.done);
        assert_eq!(evidence.usage(), Some((32, 16)));
        latencies_ms.push(started.elapsed().as_secs_f64() * 1000.0);
    }

    let elapsed_secs = suite_start.elapsed().as_secs_f64();
    let p50 = percentile_ms(&latencies_ms, 0.50);
    let p95 = percentile_ms(&latencies_ms, 0.95);
    let p99 = percentile_ms(&latencies_ms, 0.99);
    let streams_per_sec = iterations as f64 / elapsed_secs.max(1e-6);

    println!(
        "[perf:sse_sanitization] samples={iterations} p50={p50:.3}ms p95={p95:.3}ms p99={p99:.3}ms throughput={streams_per_sec:.1} streams/s"
    );

    // Deterministic SLO gate (generous enough for debug CI runners while catching O(N^2) regressions)
    assert!(
        p95 < 10.0,
        "SSE sanitization P95 ({p95:.3}ms) exceeded 10.0ms SLO"
    );
    assert!(
        streams_per_sec > 200.0,
        "SSE sanitization throughput ({streams_per_sec:.1} streams/s) fell below 200 streams/s SLO"
    );
}

#[test]
fn performance_guardrail_inspection_latency_slo() {
    let rules: Vec<RuleConfig> = (0..32)
        .map(|i| RuleConfig {
            pattern: Some(format!("BENCHMARK_ABSENT_PATTERN_{i}_[0-9]{{6}}")),
            preset: None,
            action: Action::Block,
        })
        .collect();
    let compiled = CompiledInputPolicy::compile(&rules).expect("compile 32 rules");

    for (size_bytes, max_p95_ms) in [(4_096usize, 15.0f64), (65_536usize, 80.0f64)] {
        let payload = json!({
            "messages": [{"role": "user", "content": "a".repeat(size_bytes)}]
        });

        for _ in 0..10 {
            let _ = compiled.inspect(Protocol::Chat, &payload).unwrap();
        }

        let samples = 80usize;
        let mut latencies_ms = Vec::with_capacity(samples);
        for _ in 0..samples {
            let started = Instant::now();
            let out = compiled.inspect(Protocol::Chat, &payload).unwrap();
            assert_eq!(
                out["messages"][0]["content"].as_str().unwrap().len(),
                size_bytes
            );
            latencies_ms.push(started.elapsed().as_secs_f64() * 1000.0);
        }

        let p50 = percentile_ms(&latencies_ms, 0.50);
        let p95 = percentile_ms(&latencies_ms, 0.95);
        let p99 = percentile_ms(&latencies_ms, 0.99);
        println!(
            "[perf:guardrail_inspect] bytes={size_bytes} rules=32 samples={samples} p50={p50:.3}ms p95={p95:.3}ms p99={p99:.3}ms"
        );
        assert!(
            p95 < max_p95_ms,
            "Guardrail inspection ({size_bytes}B, 32 rules) P95 ({p95:.3}ms) exceeded {max_p95_ms:.1}ms SLO"
        );
    }
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn performance_end_to_end_gateway_proxy_latency_and_throughput_slo(pool: sqlx::PgPool) {
    use axum::response::{IntoResponse, Response};

    let upstream = Router::new().route(
        "/v1/chat/completions",
        post(|Json(body): Json<Value>| async move {
            if body.get("stream") == Some(&json!(true)) {
                let sse_payload = concat!(
                    "data: {\"id\":\"perf-stream\",\"model\":\"provider-secret-model\",\"choices\":[{\"index\":0,\"delta\":{\"role\":\"assistant\",\"content\":\"fast \"},\"finish_reason\":null}]}\n\n",
                    "data: {\"id\":\"perf-stream\",\"model\":\"provider-secret-model\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"stream\"},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":8,\"completion_tokens\":4,\"total_tokens\":12,\"cost\":0.01,\"cost_details\":{\"upstream_inference_cost\":0.008}}}\n\n",
                    "data: [DONE]\n\n"
                );
                return Response::builder()
                    .header("content-type", "text/event-stream")
                    .body(axum::body::Body::from(sse_payload))
                    .unwrap();
            }
            Json(json!({
                "id": "perf-sync",
                "object": "chat.completion",
                "created": 1750000000,
                "model": "provider-secret-model",
                "cost": 0.01,
                "choices": [{
                    "index": 0,
                    "message": {"role": "assistant", "content": "ok"},
                    "finish_reason": "stop"
                }],
                "usage": {"prompt_tokens": 8, "completion_tokens": 2, "total_tokens": 10, "cost": 0.01}
            }))
            .into_response()
        }),
    );

    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });

    let state = test_state(Some(format!("http://{address}/v1")), pool.clone());
    let org = state
        .store
        .create_organization("Performance Benchmark Org")
        .await
        .unwrap();
    let scope = state
        .store
        .create_project(org, "Performance Workspace")
        .await
        .unwrap();
    let key = state
        .store
        .issue_key(scope, "Benchmark Key", &["fast".into()], 3600)
        .await
        .unwrap();
    let app = router(state.clone());

    // 1. Warmup phase (12 requests)
    for _ in 0..12 {
        let resp = app
            .clone()
            .oneshot(
                Request::post("/v1/chat/completions")
                    .header("authorization", format!("Bearer {}", key.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(
                        json!({
                            "model": "fast",
                            "messages": [{"role": "user", "content": "warmup"}]
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let _ = resp.into_body().collect().await.unwrap();
    }

    // 2. Concurrent JSON Chat Proxy Benchmark (96 requests across 12 workers)
    let workers = 12usize;
    let requests_per_worker = 8usize;
    let total_json_requests = workers * requests_per_worker;
    let json_start = Instant::now();
    let mut json_handles = Vec::with_capacity(workers);
    for _ in 0..workers {
        let app_clone = app.clone();
        let token = key.token.clone();
        json_handles.push(tokio::spawn(async move {
            let mut worker_samples = Vec::with_capacity(requests_per_worker);
            for _ in 0..requests_per_worker {
                let req_start = Instant::now();
                let resp = app_clone
                    .clone()
                    .oneshot(
                        Request::post("/v1/chat/completions")
                            .header("authorization", format!("Bearer {token}"))
                            .header("content-type", "application/json")
                            .body(axum::body::Body::from(
                                json!({
                                    "model": "fast",
                                    "messages": [{"role": "user", "content": "benchmark sync"}]
                                })
                                .to_string(),
                            ))
                            .unwrap(),
                    )
                    .await
                    .unwrap();
                assert_eq!(resp.status(), StatusCode::OK);
                let bytes = resp.into_body().collect().await.unwrap().to_bytes();
                let parsed: Value = serde_json::from_slice(&bytes).unwrap();
                assert_eq!(parsed["model"], "fast");
                assert!(parsed.get("cost").is_none());
                worker_samples.push(req_start.elapsed().as_secs_f64() * 1000.0);
            }
            worker_samples
        }));
    }

    let mut json_latencies = Vec::with_capacity(total_json_requests);
    for handle in json_handles {
        json_latencies.extend(handle.await.unwrap());
    }
    let json_elapsed = json_start.elapsed().as_secs_f64();
    let json_rps = total_json_requests as f64 / json_elapsed.max(1e-6);
    let json_p50 = percentile_ms(&json_latencies, 0.50);
    let json_p95 = percentile_ms(&json_latencies, 0.95);
    let json_p99 = percentile_ms(&json_latencies, 0.99);

    // 3. Concurrent SSE Streaming Chat Proxy Benchmark (48 streams across 12 workers)
    let streams_per_worker = 4usize;
    let total_sse_requests = workers * streams_per_worker;
    let sse_start = Instant::now();
    let mut sse_handles = Vec::with_capacity(workers);
    for _ in 0..workers {
        let app_clone = app.clone();
        let token = key.token.clone();
        sse_handles.push(tokio::spawn(async move {
            let mut worker_samples = Vec::with_capacity(streams_per_worker);
            for _ in 0..streams_per_worker {
                let req_start = Instant::now();
                let resp = app_clone
                    .clone()
                    .oneshot(
                        Request::post("/v1/chat/completions")
                            .header("authorization", format!("Bearer {token}"))
                            .header("content-type", "application/json")
                            .body(axum::body::Body::from(
                                json!({
                                    "model": "fast",
                                    "stream": true,
                                    "messages": [{"role": "user", "content": "benchmark stream"}]
                                })
                                .to_string(),
                            ))
                            .unwrap(),
                    )
                    .await
                    .unwrap();
                assert_eq!(resp.status(), StatusCode::OK);
                let bytes = resp.into_body().collect().await.unwrap().to_bytes();
                let text = std::str::from_utf8(&bytes).unwrap();
                assert!(text.contains("data: [DONE]"));
                assert!(!text.contains("upstream_inference_cost"));
                worker_samples.push(req_start.elapsed().as_secs_f64() * 1000.0);
            }
            worker_samples
        }));
    }

    let mut sse_latencies = Vec::with_capacity(total_sse_requests);
    for handle in sse_handles {
        sse_latencies.extend(handle.await.unwrap());
    }
    let sse_elapsed = sse_start.elapsed().as_secs_f64();
    let sse_rps = total_sse_requests as f64 / sse_elapsed.max(1e-6);
    let sse_p50 = percentile_ms(&sse_latencies, 0.50);
    let sse_p95 = percentile_ms(&sse_latencies, 0.95);
    let sse_p99 = percentile_ms(&sse_latencies, 0.99);

    state.gateway_writes.shutdown().await;

    println!(
        "[perf:e2e_chat_json] requests={total_json_requests} workers={workers} p50={json_p50:.3}ms p95={json_p95:.3}ms p99={json_p99:.3}ms rps={json_rps:.1}"
    );
    println!(
        "[perf:e2e_chat_sse] requests={total_sse_requests} workers={workers} p50={sse_p50:.3}ms p95={sse_p95:.3}ms p99={sse_p99:.3}ms rps={sse_rps:.1}"
    );

    if let Ok(summary_path) = std::env::var("GITHUB_STEP_SUMMARY") {
        let markdown = format!(
            "\n### Backend Gateway Performance & SLO Qualification\n\n\
             | Workload | Requests | Workers | P50 (ms) | P95 (ms) | P99 (ms) | Throughput (req/s) |\n\
             | --- | ---: | ---: | ---: | ---: | ---: | ---: |\n\
             | `/v1/chat/completions` (JSON) | {total_json_requests} | {workers} | {json_p50:.2} | {json_p95:.2} | {json_p99:.2} | {json_rps:.1} |\n\
             | `/v1/chat/completions` (SSE Stream) | {total_sse_requests} | {workers} | {sse_p50:.2} | {sse_p95:.2} | {sse_p99:.2} | {sse_rps:.1} |\n"
        );
        let _ = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(summary_path)
            .and_then(|mut f| std::io::Write::write_all(&mut f, markdown.as_bytes()));
    }

    assert!(
        json_p95 < 250.0,
        "E2E JSON chat proxy P95 ({json_p95:.2}ms) exceeded 250ms SLO"
    );
    assert!(
        sse_p95 < 250.0,
        "E2E SSE chat proxy P95 ({sse_p95:.2}ms) exceeded 250ms SLO"
    );
    assert!(
        json_rps > 25.0,
        "E2E JSON chat proxy throughput ({json_rps:.1} req/s) fell below 25 req/s SLO"
    );

    server.abort();
}
