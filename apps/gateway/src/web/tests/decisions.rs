use super::*;
use axum::body::Body;
use axum::http::HeaderMap;
use axum::response::IntoResponse;
use axum::routing::post;
use niu_storage::{IssuedKey, TenantScope};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::net::TcpListener;

/// Fixture-only upstream. No external Provider or paid request is used.
#[derive(Clone)]
struct DecisionFixture {
    requests: Arc<Mutex<Vec<Value>>>,
    mode: Arc<Mutex<Mode>>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Mode {
    Decided,
    Abstained,
    Malformed,
    Incompatible,
    Oversized,
    Timeout,
    UpstreamError,
}

impl Default for DecisionFixture {
    fn default() -> Self {
        Self {
            requests: Arc::new(Mutex::new(Vec::new())),
            mode: Arc::new(Mutex::new(Mode::Decided)),
        }
    }
}

impl DecisionFixture {
    fn reset(&self, mode: Mode) {
        *self.mode.lock().unwrap() = mode;
        self.requests.lock().unwrap().clear();
    }

    fn requests(&self) -> Vec<Value> {
        self.requests.lock().unwrap().clone()
    }
}

async fn decision_provider(
    State(fixture): State<DecisionFixture>,
    Json(body): Json<Value>,
) -> axum::response::Response {
    fixture.requests.lock().unwrap().push(body);
    let mode = *fixture.mode.lock().unwrap();
    if mode == Mode::Timeout {
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    if mode == Mode::UpstreamError {
        return (
            StatusCode::BAD_GATEWAY,
            Json(json!({"error": {"message": "fixture upstream failure"}})),
        )
            .into_response();
    }
    // Chat content is a text document. The decision validator parses it; Niu
    // never accepts an upstream object shape as the validated decision.
    let (content, completion_tokens) = match mode {
        Mode::Decided | Mode::Timeout => ("{\"label\":\"billing\"}", 3),
        Mode::Oversized => ("{\"label\":\"billing\"}", 999),
        Mode::Abstained => ("{\"abstain\":true}", 2),
        Mode::Malformed => ("not a decision", 5),
        Mode::Incompatible => ("{\"path\":\"deep\",\"confidence\":0.9}", 8),
        Mode::UpstreamError => unreachable!(),
    };
    Json(json!({
        "id": "decision-fixture",
        "created": 1,
        "model": "provider-secret-model",
        "choices": [{
            "index": 0,
            "message": {"role": "assistant", "content": content},
            "finish_reason": "stop"
        }],
        "usage": {
            "prompt_tokens": 11,
            "completion_tokens": completion_tokens,
            "total_tokens": 11 + completion_tokens
        }
    }))
    .into_response()
}

fn request_body() -> Value {
    json!({
        "model": "fast",
        "input": {"message": "The invoice total is wrong"},
        "output_schema": {
            "type": "object",
            "properties": {
                "label": {"type": "string", "enum": ["billing", "technical"]},
                "urgent": {"type": "boolean"}
            },
            "required": ["label"],
            "additionalProperties": false
        },
        "timeout_ms": 800,
        "max_output_tokens": 32
    })
}

async fn setup(
    pool: PgPool,
    fixture: &DecisionFixture,
    qualified: bool,
) -> (Router, TenantScope, IssuedKey) {
    let upstream = Router::new()
        .route("/v1/chat/completions", post(decision_provider))
        .with_state(fixture.clone());
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
    let mut state = test_state(Some(format!("http://{address}/v1")), pool);
    state
        .store
        .configure_platform_currency("USD")
        .await
        .unwrap();
    crate::payments::readiness::configure_test_gateway(&mut state).await;
    Arc::make_mut(&mut state.config)
        .models
        .get_mut("fast")
        .unwrap()
        .supports_structured_output = qualified;
    let organization = state.store.create_organization("decisions").await.unwrap();
    let scope = state
        .store
        .create_project(organization, "workspace")
        .await
        .unwrap();
    personal_test_route(&mut state, organization).await;
    let key = state
        .store
        .issue_key(scope, "decision caller", &["fast".into()], 3600)
        .await
        .unwrap();
    (router(state), scope, key)
}

async fn send(app: &Router, token: &str, body: Value) -> (StatusCode, HeaderMap, Value) {
    let response = app
        .clone()
        .oneshot(
            Request::post("/v1/decisions")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    let headers = response.headers().clone();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (
        status,
        headers,
        if bytes.is_empty() {
            Value::Null
        } else {
            serde_json::from_slice(&bytes).unwrap()
        },
    )
}

fn header(headers: &HeaderMap, name: &str) -> Option<String> {
    headers
        .get(name)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned)
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn decision_endpoint_returns_validated_output_and_bounded_evidence(pool: PgPool) {
    let fixture = DecisionFixture::default();
    let (app, scope, key) = setup(pool.clone(), &fixture, true).await;

    let (status, headers, body) = send(&app, &key.token, request_body()).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["decision"], json!({"label": "billing"}));
    assert_eq!(body["evidence"]["outcome"], "decided");
    assert_eq!(body["evidence"]["model"], "fast");
    assert_eq!(body["evidence"]["calls"], 1);
    assert_eq!(body["evidence"]["input_tokens"], 11);
    assert_eq!(body["evidence"]["output_tokens"], 3);
    assert_eq!(body["evidence"]["tokens_estimated"], false);
    assert_eq!(body["evidence"]["timeout_ms"], 800);
    assert_eq!(body["evidence"]["max_output_tokens"], 32);
    assert_eq!(
        header(&headers, "x-niu-decision-outcome").as_deref(),
        Some("decided")
    );
    assert_eq!(
        header(&headers, "x-niu-decision-calls").as_deref(),
        Some("1")
    );
    assert_eq!(
        header(&headers, "x-niu-decision-tokens-estimated").as_deref(),
        Some("false")
    );
    assert!(header(&headers, "x-niu-decision-latency-ms").is_some());
    assert!(header(&headers, "x-niu-operation-id").is_some());
    assert!(header(&headers, "x-niu-attempt-id").is_some());
    assert_eq!(
        header(&headers, "cache-control").as_deref(),
        Some("no-store")
    );
    assert_eq!(header(&headers, "x-niu-decision-failure"), None);

    let requests = fixture.requests();
    assert_eq!(requests.len(), 1);
    let forwarded = &requests[0];
    assert_eq!(forwarded["model"], "provider-secret-model");
    assert_eq!(forwarded.get("response_format"), None);
    assert_eq!(forwarded["stream"], false);
    assert_eq!(forwarded["temperature"], 0);
    assert_eq!(forwarded["max_tokens"], 32);
    let prompt = forwarded["messages"][1]["content"].as_str().unwrap();
    assert!(prompt.contains("label: string; one of \"billing\", \"technical\""));
    assert!(prompt.contains("The invoice total is wrong"));
    assert!(!prompt.contains("provider-secret-model"));
    assert!(!prompt.contains("PROVIDER_KEY"));
    assert!(!prompt.contains("procurement"));
    assert!(!prompt.contains("margin"));

    // The nested decision call keeps ordinary inference records and billing but
    // opts out of ordinary Logs payload capture so the internal prompt is not
    // retained as a customer payload.
    let attempt: Uuid = header(&headers, "x-niu-attempt-id")
        .unwrap()
        .parse()
        .unwrap();
    let payloads: i64 =
        sqlx::query_scalar("SELECT count(*) FROM request_payloads WHERE attempt_id=$1")
            .bind(attempt)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(payloads, 0);
    let attempt_state: (String, Option<i64>, Option<i64>) = sqlx::query_as(
        "SELECT execution, prompt_tokens, completion_tokens FROM attempts WHERE id=$1 AND organization_id=$2 AND project_id=$3",
    )
    .bind(attempt)
    .bind(scope.organization_id)
    .bind(scope.project_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(
        attempt_state,
        ("confirmed_completed".into(), Some(11), Some(3))
    );
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn decision_endpoint_rejects_incompatible_output_and_generation_fields(pool: PgPool) {
    let fixture = DecisionFixture::default();
    let (app, _scope, key) = setup(pool, &fixture, true).await;

    fixture.reset(Mode::Malformed);
    let (status, headers, body) = send(&app, &key.token, request_body()).await;
    assert_eq!(status, StatusCode::BAD_GATEWAY, "{body}");
    assert_eq!(
        header(&headers, "x-niu-error-code").as_deref(),
        Some("decision_invalid_output")
    );
    assert_eq!(
        header(&headers, "x-niu-decision-outcome").as_deref(),
        Some("invalid")
    );
    assert_eq!(
        header(&headers, "x-niu-decision-failure").as_deref(),
        Some("malformed_output")
    );

    fixture.reset(Mode::Incompatible);
    let (status, headers, body) = send(&app, &key.token, request_body()).await;
    assert_eq!(status, StatusCode::BAD_GATEWAY, "{body}");
    assert_eq!(
        header(&headers, "x-niu-error-code").as_deref(),
        Some("decision_invalid_output")
    );
    assert_eq!(
        header(&headers, "x-niu-decision-outcome").as_deref(),
        Some("invalid")
    );
    assert_eq!(
        header(&headers, "x-niu-decision-failure").as_deref(),
        Some("schema_mismatch")
    );

    fixture.reset(Mode::Abstained);
    let (status, headers, body) = send(&app, &key.token, request_body()).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["decision"], Value::Null);
    assert_eq!(body["evidence"]["outcome"], "abstained");
    assert_eq!(
        header(&headers, "x-niu-decision-outcome").as_deref(),
        Some("abstained")
    );

    // Generation fields are not reinterpreted as a Chat request, and a pool or
    // Auto alias cannot substitute a decision.
    fixture.reset(Mode::Decided);
    for invalid in [
        json!({"messages": [{"role": "user", "content": "hi"}]}),
        json!({"stream": true}),
        json!({"model": "pool/assistant"}),
        json!({"model": "codex/session"}),
    ] {
        let mut body = request_body();
        if let Value::Object(ref mut object) = body {
            for (name, value) in invalid.as_object().unwrap() {
                object.insert(name.clone(), value.clone());
            }
        }
        let (status, headers, body) = send(&app, &key.token, body).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
        assert!(
            matches!(
                header(&headers, "x-niu-error-code").as_deref(),
                Some("decision_invalid_request" | "decision_pool_not_supported")
            ),
            "{body}"
        );
    }
    assert!(fixture.requests().is_empty());
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn decision_endpoint_rejects_ungranted_models_and_bounds_without_dispatch(pool: PgPool) {
    let fixture = DecisionFixture::default();
    let (app, _scope, key) = setup(pool, &fixture, true).await;

    let (status, _, body) = send(&app, "not-a-real-key", request_body()).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED, "{body}");

    // A model that is visible in general but not granted to this key is not
    // found, matching ordinary inference grant behavior without revealing it.
    let mut ungranted_request = request_body();
    ungranted_request["model"] = json!("not-granted");
    let (status, headers, body) = send(&app, &key.token, ungranted_request).await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{body}");
    assert_eq!(
        header(&headers, "x-niu-error-code").as_deref(),
        Some("not_found_error")
    );
    assert!(fixture.requests().is_empty());

    for (field, value) in [
        ("timeout_ms", json!(10)),
        ("timeout_ms", json!(10_000)),
        ("max_output_tokens", json!(0)),
        ("max_output_tokens", json!(2_000)),
    ] {
        fixture.reset(Mode::Decided);
        let mut body = request_body();
        body[field] = value;
        let (status, headers, body) = send(&app, &key.token, body).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
        assert_eq!(
            header(&headers, "x-niu-error-code").as_deref(),
            Some("decision_invalid_request")
        );
    }
    let mut oversized = request_body();
    oversized["input"] = json!({"text": "x".repeat(17 * 1024)});
    let (status, headers, _body) = send(&app, &key.token, oversized).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(
        header(&headers, "x-niu-error-code").as_deref(),
        Some("decision_invalid_request")
    );

    fixture.reset(Mode::Oversized);
    let mut bounded = request_body();
    bounded["max_output_tokens"] = json!(32);
    let (status, headers, body) = send(&app, &key.token, bounded).await;
    assert_eq!(status, StatusCode::BAD_GATEWAY, "{body}");
    assert_eq!(
        header(&headers, "x-niu-error-code").as_deref(),
        Some("decision_output_bound_exceeded")
    );
    assert_eq!(
        header(&headers, "x-niu-decision-failure").as_deref(),
        Some("output_bound_exceeded")
    );
    assert!(fixture.requests().len() <= 1);
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn decision_endpoint_preserves_nested_inference_errors(pool: PgPool) {
    let fixture = DecisionFixture::default();
    let (app, _scope, key) = setup(pool, &fixture, true).await;

    fixture.reset(Mode::UpstreamError);
    let (status, headers, body) = send(&app, &key.token, request_body()).await;
    assert_eq!(status, StatusCode::BAD_GATEWAY, "{body}");
    assert_eq!(
        header(&headers, "x-niu-error-code").as_deref(),
        Some("upstream_error")
    );
    assert_eq!(
        header(&headers, "x-niu-decision-outcome").as_deref(),
        Some("rejected")
    );
    assert_eq!(fixture.requests().len(), 1);
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn decision_endpoint_times_out(pool: PgPool) {
    let fixture = DecisionFixture::default();
    let (app, _scope, key) = setup(pool, &fixture, true).await;

    fixture.reset(Mode::Timeout);
    let mut request = request_body();
    request["timeout_ms"] = json!(50);
    let (status, headers, body) = send(&app, &key.token, request).await;
    assert_eq!(status, StatusCode::GATEWAY_TIMEOUT, "{body}");
    assert_eq!(
        header(&headers, "x-niu-error-code").as_deref(),
        Some("decision_timeout")
    );
    assert_eq!(
        header(&headers, "x-niu-decision-outcome").as_deref(),
        Some("timeout")
    );
    assert_eq!(
        header(&headers, "x-niu-decision-calls").as_deref(),
        Some("1")
    );
    assert!(fixture.requests().len() <= 1);
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn decision_endpoint_requires_structured_output(pool: PgPool) {
    let fixture = DecisionFixture::default();
    let (app, _scope, key) = setup(pool, &fixture, false).await;

    let (status, headers, body) = send(&app, &key.token, request_body()).await;
    assert_eq!(status, StatusCode::NOT_IMPLEMENTED, "{body}");
    assert_eq!(
        header(&headers, "x-niu-error-code").as_deref(),
        Some("decision_not_qualified")
    );
    assert_eq!(
        header(&headers, "x-niu-decision-outcome").as_deref(),
        Some("rejected")
    );
    assert_eq!(
        header(&headers, "x-niu-decision-calls").as_deref(),
        Some("0")
    );
    assert!(fixture.requests().is_empty());
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn decision_endpoint_obeys_workspace_spending_caps(pool: PgPool) {
    let fixture = DecisionFixture::default();
    let upstream = Router::new()
        .route("/v1/chat/completions", post(decision_provider))
        .with_state(fixture.clone());
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
    let mut state = test_state(Some(format!("http://{address}/v1")), pool);
    crate::payments::readiness::configure_test_gateway(&mut state).await;
    state
        .store
        .configure_platform_currency("USD")
        .await
        .unwrap();
    let scope = state.store.default_workspace().await.unwrap();
    let pricing = crate::config::RoutePricing {
        currency: "USD".into(),
        api_prompt_rate: 1_000_000,
        api_completion_rate: 1_000_000,
        cash_prompt_rate: 1_000_000,
        cash_completion_rate: 1_000_000,
        max_input_tokens: 1_000_000,
        max_output_tokens: 1_000_000,
    };
    let mut fast = state.config.models["fast"].clone();
    fast.pricing = Some(pricing);
    fast.supports_structured_output = true;
    Arc::make_mut(&mut state.config)
        .models
        .insert("fast".into(), fast);
    state
        .store
        .publish_customer_balance_grant(
            scope.organization_id,
            niu_storage::CustomerBalanceGrantPublication {
                currency: "USD",
                amount_nanos: 1_000_000_000,
                reason: "Isolated decision cap fixture",
                idempotency_key: Uuid::new_v4(),
            },
            niu_storage::OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    state
        .store
        .create_budget(scope, "USD", 1_000_000_000)
        .await
        .unwrap();
    state
        .store
        .publish_customer_tariff(
            scope,
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
    // No additional spend fits: the workspace limit equals the already
    // committed amount (zero before any request).
    state
        .store
        .set_customer_workspace_spending_limit(scope, "USD", 0, 0)
        .await
        .unwrap();
    let key = state
        .store
        .issue_key(scope, "decision cap caller", &["fast".into()], 3600)
        .await
        .unwrap();
    let app = router(state);

    let (status, headers, body) = send(&app, &key.token, request_body()).await;
    assert_eq!(status, StatusCode::PAYMENT_REQUIRED, "{body}");
    assert_eq!(
        header(&headers, "x-niu-error-code").as_deref(),
        Some("workspace_spending_limit_exceeded")
    );
    assert_eq!(
        header(&headers, "x-niu-decision-outcome").as_deref(),
        Some("rejected")
    );
    assert!(fixture.requests().is_empty());
}
