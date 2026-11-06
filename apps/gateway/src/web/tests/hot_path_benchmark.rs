//! Ignored benchmark for the pre-dispatch inference hot path: key
//! authentication, installation readiness, published route resolution and
//! credential decryption on every request.
//!
//! Run it through `scripts/hot-path-benchmark.py`, which starts a disposable
//! PostgreSQL cluster with `log_statement=all`, invokes this test and reports
//! the request latency percentiles together with the exact statements executed
//! between its markers. The fixture is local: one organization, workspace,
//! credential, owner-funded vendor route and a loopback upstream. No paid model
//! call or external network dependency is involved.

use super::*;
use axum::{Json, Router, routing::post};
use std::sync::Arc;
use std::time::Instant;
use tokio::net::TcpListener;

const START_MARKER: &str = "NIU_HOT_PATH_START";
const END_MARKER: &str = "NIU_HOT_PATH_END";

fn percentile_ms(samples: &[f64], fraction: f64) -> f64 {
    let mut sorted = samples.to_vec();
    sorted.sort_by(|a, b| a.total_cmp(b));
    let index = ((sorted.len() as f64 * fraction).ceil() as usize)
        .saturating_sub(1)
        .min(sorted.len() - 1);
    (sorted[index] * 1000.0).round() / 1000.0
}

async fn upstream_chat() -> Json<Value> {
    Json(json!({
        "id": "hot-path-upstream",
        "object": "chat.completion",
        "created": 1750000000,
        "model": "provider-secret-model",
        "choices": [{
            "index": 0,
            "message": {"role": "assistant", "content": "ok"},
            "finish_reason": "stop"
        }],
        "usage": {"prompt_tokens": 8, "completion_tokens": 2, "total_tokens": 10}
    }))
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL; run through scripts/hot-path-benchmark.py"]
async fn hot_path_readiness_registry_credential(pool: PgPool) {
    let upstream_listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let upstream_address = upstream_listener.local_addr().unwrap();
    let upstream = Router::new().route("/v1/chat/completions", post(upstream_chat));
    let upstream_task =
        tokio::spawn(async move { axum::serve(upstream_listener, upstream).await.unwrap() });

    let mut state = test_state(Some(format!("http://{upstream_address}/v1")), pool.clone());
    // Exercise the published-registry path used by a production gateway instead
    // of the compatibility fallback that reads catalog rows directly.
    let compiler = crate::vendors::publication::Compiler::new(
        state.config.models.clone(),
        std::iter::once("PROVIDER_KEY".to_owned()).collect(),
    )
    .expect("compile static catalog");
    state.store = state.store.clone().with_route_compiler(Arc::new(compiler));
    crate::payments::readiness::configure_test_gateway(&mut state).await;
    state
        .store
        .configure_platform_currency("USD")
        .await
        .unwrap();
    assert!(
        crate::payments::readiness::inspect(&state)
            .await
            .unwrap()
            .ready,
        "fixture must take the ready fast path through the readiness gate"
    );

    let scope = state.store.default_workspace().await.unwrap();
    personal_test_route(&mut state, scope.organization_id).await;
    let key = state
        .store
        .issue_key(scope, "Hot path benchmark", &["fast".to_owned()], 3600)
        .await
        .unwrap();
    assert!(
        crate::vendors::publication::snapshot(&state)
            .await
            .unwrap()
            .is_some(),
        "fixture must resolve through the published route registry"
    );

    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let app = router(state.clone());
    let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    let client = reqwest::Client::builder()
        .pool_max_idle_per_host(1)
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .unwrap();
    let url = format!("http://{address}/v1/chat/completions");
    let body = json!({
        "model": "fast",
        "messages": [{"role": "user", "content": "hot path benchmark"}]
    })
    .to_string();

    async fn request(client: &reqwest::Client, url: &str, token: &str, body: &str) -> f64 {
        let started = Instant::now();
        let response = client
            .post(url)
            .header("authorization", format!("Bearer {token}"))
            .header("content-type", "application/json")
            .body(body.to_owned())
            .send()
            .await
            .expect("gateway request");
        assert_eq!(response.status(), reqwest::StatusCode::OK);
        let _ = response.bytes().await.expect("response body");
        started.elapsed().as_secs_f64() * 1000.0
    }

    for _ in 0..50 {
        request(&client, &url, &key.token, &body).await;
    }

    let samples: usize = std::env::var("NIU_HOT_PATH_SAMPLES")
        .ok()
        .and_then(|value| value.parse().ok())
        .filter(|value: &usize| (100..=20_000).contains(value))
        .unwrap_or(800);
    let begin = std::time::Instant::now();
    sqlx::query(&format!("SELECT '{START_MARKER}'"))
        .execute(&pool)
        .await
        .unwrap();
    let mut latencies = Vec::with_capacity(samples);
    for _ in 0..samples {
        latencies.push(request(&client, &url, &key.token, &body).await);
    }
    // Let default-on request diagnostics and batched admission writes settle so
    // the marker-bounded statement count includes the work each request caused.
    state.gateway_writes.shutdown().await;
    state.diagnostic_writes.close();
    state.diagnostic_writes.wait().await;
    sqlx::query(&format!("SELECT '{END_MARKER}'"))
        .execute(&pool)
        .await
        .unwrap();
    let elapsed = begin.elapsed().as_secs_f64();

    server.abort();
    upstream_task.abort();

    let p50 = percentile_ms(&latencies, 0.50);
    let p95 = percentile_ms(&latencies, 0.95);
    let p99 = percentile_ms(&latencies, 0.99);
    let max = (latencies.iter().copied().fold(f64::MIN, f64::max) * 1000.0).round() / 1000.0;
    println!(
        "[hot-path] {}",
        json!({
            "samples": samples,
            "p50_ms": p50,
            "p95_ms": p95,
            "p99_ms": p99,
            "max_ms": max,
            "elapsed_seconds": (elapsed * 1000.0).round() / 1000.0,
            "requests_per_second": (samples as f64 / elapsed * 100.0).round() / 100.0,
            "scope": "in-process loopback HTTP to the real router; readiness ready fast path, published registry, owner-funded managed route with encrypted credential"
        })
    );
}
