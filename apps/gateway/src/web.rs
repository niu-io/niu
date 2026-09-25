use std::{env, time::Duration};

use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
    routing::get,
};
use litellm_core::chat_completions::{chat_completions, types::ChatCompletionsRequest};
use serde_json::{Value, json};
use std::sync::atomic::Ordering;
use tower_http::services::{ServeDir, ServeFile};
use uuid::Uuid;

use crate::{error::ApiError, state::AppState};

pub fn router(state: AppState) -> Router {
    let console_dir =
        env::var("NIU_CONSOLE_DIR").unwrap_or_else(|_| "apps/console/dist".to_owned());
    let index = format!("{console_dir}/index.html");
    Router::new()
        .route("/healthz", get(health))
        .route("/readyz", get(ready))
        .route(
            "/admin/v1/organizations",
            get(crate::admin::organizations).post(crate::admin::organization),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects",
            get(crate::admin::projects).post(crate::admin::project),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/keys",
            get(crate::admin::keys).post(crate::admin::issue_key),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/keys/{key}",
            axum::routing::delete(crate::admin::revoke_key),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/rotate",
            axum::routing::post(crate::admin::rotate_key),
        )
        .route("/v1/models", get(public_models))
        .route("/v1/chat/completions", axum::routing::post(chat))
        .route("/admin/v1/models", get(admin_models))
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/accounts",
            get(crate::admin::accounts).post(crate::admin::create_account),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/accounts/{account}/quota",
            get(crate::admin::quota),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/budget",
            get(crate::admin::budget).post(crate::admin::create_budget),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/costs",
            get(crate::admin::costs),
        )
        .route("/admin/v1/metrics", get(admin_metrics))
        .fallback_service(ServeDir::new(console_dir).fallback(ServeFile::new(index)))
        .layer(DefaultBodyLimit::max(1_048_576))
        .with_state(state)
}

async fn health(State(state): State<AppState>) -> Json<Value> {
    Json(json!({
        "status": "ok",
        "service": "niu",
        "model_count": state.config.models.len()
    }))
}

async fn ready(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    state.store.ready().await.map_err(ApiError::from_store)?;
    Ok(Json(json!({"status": "ok"})))
}

async fn public_models(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let principal = state.authorize_api(bearer(&headers)).await?;
    let data: Vec<_> = state
        .config
        .models
        .keys()
        .filter(|model| principal.allows_model(model))
        .map(|model| json!({"id": model, "object": "model", "owned_by": "niu"}))
        .collect();
    Ok(Json(json!({"object": "list", "data": data})))
}

async fn admin_models(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    state.authorize_admin(bearer(&headers))?;
    let data: Vec<_> = state
        .config
        .models
        .iter()
        .map(|(name, model)| {
            json!({
                "id": name,
                "provider": model.provider,
                "upstream_model": model.upstream_model
            })
        })
        .collect();
    Ok(Json(json!({"data": data})))
}

async fn admin_metrics(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    state.authorize_admin(bearer(&headers))?;
    let usage = state.usage.snapshot();
    Ok(Json(json!({
        "requests_total": state.requests.load(Ordering::Relaxed),
        "requests_failed": state.failures.load(Ordering::Relaxed),
        "prompt_tokens": usage.prompt_tokens,
        "completion_tokens": usage.completion_tokens,
        "usage": usage
    })))
}

async fn chat(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(mut body): Json<Value>,
) -> Result<Response, ApiError> {
    let principal = state.authorize_api(bearer(&headers)).await?;
    let public_model = body
        .get("model")
        .and_then(Value::as_str)
        .filter(|model| !model.is_empty())
        .ok_or_else(|| ApiError::invalid_request("A model name is required"))?
        .to_owned();
    if !principal.allows_model(&public_model) {
        return Err(ApiError::not_found());
    }
    let model = state
        .config
        .models
        .get(&public_model)
        .ok_or_else(ApiError::not_found)?;
    let stream = match body.get("stream") {
        None => false,
        Some(Value::Bool(value)) => *value,
        _ => return Err(ApiError::invalid_request("stream must be a boolean")),
    };
    let messages = body
        .get("messages")
        .filter(|messages| messages.is_array())
        .cloned()
        .ok_or_else(|| ApiError::invalid_request("messages must be an array"))?;
    if messages.as_array().is_none_or(Vec::is_empty) {
        return Err(ApiError::invalid_request(
            "messages must contain at least one message",
        ));
    }
    let api_key = state
        .provider_key(&model.api_key_env)
        .ok_or_else(ApiError::unavailable)?
        .to_owned();
    let timeout = Duration::from_secs(state.config.server.request_timeout_seconds);
    state.requests.fetch_add(1, Ordering::Relaxed);

    if stream && model.provider != "openai" {
        return Err(ApiError::unsupported());
    }
    if !matches!(model.provider.as_str(), "openai" | "anthropic" | "bedrock") {
        return Err(ApiError::invalid_request(
            "Provider is not supported by this gateway",
        ));
    }
    if let Some(price) = &model.pricing {
        validate_priced_request(&mut body, price)?;
    }
    let scope = principal.scope();
    let operation = state
        .store
        .create_operation(scope, &public_model)
        .await
        .map_err(ApiError::from_store)?;
    // Hash the routing configuration, never its secret. Durable configuration
    // publication will replace this startup revision in the management slice.
    use sha2::{Digest, Sha256};
    let revision = format!(
        "{:x}",
        Sha256::digest(
            serde_json::to_vec(&json!({
                "provider": model.provider, "model": model.upstream_model,
                "endpoint": model.api_base, "credential_reference": model.api_key_env,
                "pricing": model.pricing
            }))
            .expect("route serialization")
        )
    );
    let attempt = state
        .store
        .prepare_attempt(scope, operation, &public_model, &revision)
        .await
        .map_err(ApiError::from_store)?;
    if let Some(price) = &model.pricing {
        let price_id = state
            .store
            .publish_price(
                scope,
                niu_storage::PriceInput {
                    resource_id: &public_model,
                    offer_revision: &revision,
                    currency: &price.currency,
                    api_equivalent: niu_storage::TokenRates {
                        prompt: price.api_prompt_rate,
                        completion: price.api_completion_rate,
                    },
                    cash: niu_storage::TokenRates {
                        prompt: price.cash_prompt_rate,
                        completion: price.cash_completion_rate,
                    },
                },
            )
            .await
            .map_err(ApiError::from_store)?;
        state
            .store
            .reserve_cost(
                scope,
                attempt,
                price_id,
                price.max_input_tokens,
                price.max_output_tokens,
            )
            .await
            .map_err(ApiError::from_store)?;
    }
    if let Err(error) = state.store.mark_dispatched(&principal, attempt).await {
        if model.pricing.is_some() {
            // A lost commit acknowledgement must not release a dispatched hold.
            // The storage transition proves not_sent before releasing anything.
            let _ = state.store.release_unsent_cost(scope, attempt).await;
        }
        return Err(ApiError::from_store(error));
    }
    let result = execute_chat(
        &state,
        &public_model,
        model,
        api_key,
        body,
        messages,
        stream,
        timeout,
        scope,
        attempt,
    )
    .await;
    let mut response = match result {
        Ok(result) => {
            if result.completed {
                if let Err(error) = state
                    .store
                    .complete_and_settle(scope, attempt, result.usage)
                    .await
                {
                    ApiError::from_store(error).into_response()
                } else {
                    result.response
                }
            } else {
                result.response
            }
        }
        Err(error) => error.into_response(),
    };
    response.headers_mut().insert(
        "x-niu-operation-id",
        HeaderValue::from_str(&operation.to_string()).unwrap(),
    );
    response.headers_mut().insert(
        "x-niu-attempt-id",
        HeaderValue::from_str(&attempt.to_string()).unwrap(),
    );
    Ok(response)
}

fn validate_priced_request(
    body: &mut Value,
    price: &crate::config::RoutePricing,
) -> Result<(), ApiError> {
    let object = body
        .as_object_mut()
        .ok_or_else(|| ApiError::invalid_request("Expected a JSON object"))?;
    // The first priced contract covers a single text completion. Additional
    // modalities and tool execution require their own billable dimensions.
    const ALLOWED: &[&str] = &[
        "model",
        "messages",
        "stream",
        "stream_options",
        "temperature",
        "top_p",
        "stop",
        "max_tokens",
        "max_completion_tokens",
        "n",
        "seed",
        "presence_penalty",
        "frequency_penalty",
        "user",
    ];
    if object.keys().any(|k| !ALLOWED.contains(&k.as_str()))
        || object.get("n").is_some_and(|v| v.as_u64() != Some(1))
        || object
            .get("messages")
            .and_then(Value::as_array)
            .is_none_or(|messages| {
                messages.iter().any(|m| {
                    m.as_object().is_none_or(|m| {
                        m.keys().any(|k| k != "role" && k != "content")
                            || !matches!(
                                m.get("role").and_then(Value::as_str),
                                Some("system" | "developer" | "user" | "assistant")
                            )
                            || !m.get("content").is_some_and(Value::is_string)
                    })
                })
            })
    {
        return Err(ApiError::invalid_request(
            "This priced route supports one text completion without tools or additional billable modalities",
        ));
    }
    if object.contains_key("max_tokens") && object.contains_key("max_completion_tokens") {
        return Err(ApiError::invalid_request(
            "Specify only one output token limit",
        ));
    }
    if object.get("stream") == Some(&Value::Bool(true)) {
        if object.get("stream_options").is_some_and(|value| {
            value
                .as_object()
                .is_none_or(|options| options.keys().any(|key| key != "include_usage"))
        }) {
            return Err(ApiError::invalid_request(
                "Unsupported stream options on this priced route",
            ));
        }
        // Financial settlement requires final usage even when the caller did not
        // request it. Absence in the response still remains unknown.
        object.insert("stream_options".into(), json!({"include_usage": true}));
    }
    let output = object
        .get("max_completion_tokens")
        .or_else(|| object.get("max_tokens"));
    if let Some(value) = output {
        if value
            .as_i64()
            .is_none_or(|v| v <= 0 || v > price.max_output_tokens)
        {
            return Err(ApiError::invalid_request(
                "Output limit exceeds the priced route bound",
            ));
        }
    } else {
        object.insert(
            "max_completion_tokens".into(),
            json!(price.max_output_tokens),
        );
    }
    Ok(())
}

struct ProviderResponse {
    response: Response,
    completed: bool,
    usage: Option<(u64, u64)>,
}

async fn execute_chat(
    state: &AppState,
    public_model: &str,
    model: &crate::config::ModelConfig,
    api_key: String,
    body: Value,
    messages: Value,
    stream: bool,
    timeout: Duration,
    scope: niu_storage::TenantScope,
    attempt: Uuid,
) -> Result<ProviderResponse, ApiError> {
    if stream {
        if model.provider != "openai" {
            state.failures.fetch_add(1, Ordering::Relaxed);
            return Err(ApiError::unsupported());
        }
        return stream_openai(
            &state,
            &public_model,
            model,
            api_key,
            body,
            timeout,
            scope,
            attempt,
        )
        .await;
    }

    if model.provider == "openai" {
        return complete_openai(&state, &public_model, model, api_key, body, timeout).await;
    }

    let mut optional_params = body
        .as_object()
        .cloned()
        .ok_or_else(|| ApiError::invalid_request("The request body must be a JSON object"))?;
    optional_params.remove("model");
    optional_params.remove("messages");
    optional_params.remove("stream");
    strip_server_control_fields(&mut optional_params);

    // The native adapter normalizes absent usage to zero, so its usage is not
    // provider evidence until that provenance is preserved by the adapter.
    let _usage_attempt = state.usage.begin();
    let result = chat_completions(ChatCompletionsRequest {
        model: &model.upstream_model,
        messages,
        optional_params,
        api_key: Some(&api_key),
        api_base: model.api_base.as_deref(),
        custom_llm_provider: Some(&model.provider),
        extra_headers: None,
        timeout: Some(timeout),
    })
    .await;
    let response = match result {
        Ok(response) => response,
        Err(_error) => {
            state.failures.fetch_add(1, Ordering::Relaxed);
            return Err(ApiError::upstream());
        }
    };
    let mut value = serde_json::to_value(response).map_err(|_| ApiError::upstream())?;
    if let Some(object) = value.as_object_mut() {
        object.insert(
            "id".to_owned(),
            json!(format!("chatcmpl-{}", Uuid::new_v4())),
        );
        object.insert("object".to_owned(), json!("chat.completion"));
        object.insert("model".to_owned(), json!(public_model));
    }
    Ok(ProviderResponse {
        response: Json(value).into_response(),
        completed: true,
        usage: None,
    })
}

async fn complete_openai(
    state: &AppState,
    public_model: &str,
    model: &crate::config::ModelConfig,
    api_key: String,
    mut body: Value,
    timeout: Duration,
) -> Result<ProviderResponse, ApiError> {
    let base = model
        .api_base
        .as_deref()
        .unwrap_or("https://api.openai.com/v1");
    let endpoint = format!("{}/chat/completions", base.trim_end_matches('/'));
    let Some(object) = body.as_object_mut() else {
        return Err(ApiError::invalid_request(
            "The request body must be a JSON object",
        ));
    };
    object.insert("model".to_owned(), json!(model.upstream_model));
    strip_server_control_fields(object);

    let usage_attempt = state.usage.begin();
    let upstream = state
        .http
        .post(endpoint)
        .bearer_auth(api_key)
        .timeout(timeout)
        .json(&body)
        .send()
        .await
        .map_err(|_| {
            state.failures.fetch_add(1, Ordering::Relaxed);
            ApiError::upstream()
        })?;
    if !upstream.status().is_success() {
        state.failures.fetch_add(1, Ordering::Relaxed);
        return Err(ApiError::upstream());
    }
    let mut value: Value = upstream.json().await.map_err(|_| {
        state.failures.fetch_add(1, Ordering::Relaxed);
        ApiError::upstream()
    })?;
    if !value.get("choices").is_some_and(Value::is_array) {
        state.failures.fetch_add(1, Ordering::Relaxed);
        return Err(ApiError::upstream());
    }
    if let Some(object) = value.as_object_mut() {
        object
            .entry("id")
            .or_insert_with(|| json!(format!("chatcmpl-{}", Uuid::new_v4())));
        object.insert("object".to_owned(), json!("chat.completion"));
        object.insert("model".to_owned(), json!(public_model));
    }
    let usage = value["usage"]["prompt_tokens"]
        .as_u64()
        .zip(value["usage"]["completion_tokens"].as_u64());
    usage_attempt.report(&value["usage"]);
    Ok(ProviderResponse {
        response: Json(value).into_response(),
        completed: true,
        usage,
    })
}

async fn stream_openai(
    state: &AppState,
    public_model: &str,
    model: &crate::config::ModelConfig,
    api_key: String,
    mut body: Value,
    timeout: Duration,
    scope: niu_storage::TenantScope,
    attempt: Uuid,
) -> Result<ProviderResponse, ApiError> {
    let base = model
        .api_base
        .as_deref()
        .unwrap_or("https://api.openai.com/v1");
    let endpoint = format!("{}/chat/completions", base.trim_end_matches('/'));
    if let Some(object) = body.as_object_mut() {
        object.insert("model".to_owned(), json!(model.upstream_model));
        strip_server_control_fields(object);
    }
    let usage_attempt = state.usage.begin();
    let upstream = state
        .http
        .post(endpoint)
        .bearer_auth(api_key)
        .header(header::ACCEPT, "text/event-stream")
        .timeout(timeout)
        .json(&body)
        .send()
        .await
        .map_err(|_| {
            state.failures.fetch_add(1, Ordering::Relaxed);
            ApiError::upstream()
        })?;
    let status =
        StatusCode::from_u16(upstream.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    if !status.is_success() {
        state.failures.fetch_add(1, Ordering::Relaxed);
        return Err(ApiError::upstream());
    }
    let content_type = upstream
        .headers()
        .get(header::CONTENT_TYPE)
        .cloned()
        .ok_or_else(|| {
            state.failures.fetch_add(1, Ordering::Relaxed);
            ApiError::upstream()
        })?;
    if content_type
        .to_str()
        .ok()
        .and_then(|v| v.split(';').next())
        .is_none_or(|v| !v.trim().eq_ignore_ascii_case("text/event-stream"))
    {
        state.failures.fetch_add(1, Ordering::Relaxed);
        return Err(ApiError::upstream());
    }
    let mut response = Response::new(crate::streaming::tracked_body(
        upstream.bytes_stream(),
        crate::streaming::StreamAttempt {
            store: state.store.clone(),
            scope,
            id: attempt,
            usage: usage_attempt,
            failures: state.failures.clone(),
        },
    ));
    *response.status_mut() = status;
    response
        .headers_mut()
        .insert(header::CONTENT_TYPE, content_type);
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
    response.headers_mut().insert(
        "x-niu-model",
        HeaderValue::from_str(public_model).unwrap_or(HeaderValue::from_static("unknown")),
    );
    Ok(ProviderResponse {
        response,
        completed: false,
        usage: None,
    })
}

fn strip_server_control_fields(body: &mut serde_json::Map<String, Value>) {
    body.retain(|name, _| {
        !matches!(
            name.to_ascii_lowercase().as_str(),
            "api_key"
                | "api_base"
                | "custom_llm_provider"
                | "extra_headers"
                | "headers"
                | "authorization"
        )
    });
}

fn bearer(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
}

#[cfg(test)]
mod tests {
    use std::{
        collections::HashMap,
        sync::{Arc, Mutex},
    };

    use axum::{
        Json, Router,
        extract::State,
        http::{HeaderMap, Request, StatusCode},
        routing::post,
    };
    use http_body_util::BodyExt;
    use serde_json::{Value, json};
    use tokio::net::TcpListener;
    use tower::ServiceExt;

    use crate::{
        config::AppConfig,
        state::{AppState, TokenSet},
    };

    use super::router;

    #[derive(Clone, Default)]
    struct Captured(Arc<Mutex<Option<(HeaderMap, Value)>>>);

    async fn provider(
        State(captured): State<Captured>,
        headers: HeaderMap,
        Json(body): Json<Value>,
    ) -> Json<Value> {
        *captured.0.lock().expect("capture mutex") = Some((headers, body));
        Json(json!({
            "id": "upstream-id",
            "created": 123,
            "model": "provider-model",
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": "ok"},
                "finish_reason": "stop"
            }],
            "usage": {"prompt_tokens": 2, "completion_tokens": 1, "total_tokens": 3}
        }))
    }

    fn test_state(api_base: Option<String>, pool: sqlx::PgPool) -> AppState {
        let mut config: AppConfig = toml::from_str(
            r#"
                [models.fast]
                provider = "openai"
                upstream_model = "provider-secret-model"
                api_key_env = "PROVIDER_KEY"
            "#,
        )
        .expect("valid test config");
        config.models.get_mut("fast").expect("model route").api_base = api_base;
        let admin_tokens = TokenSet::parse(
            "NIU_ADMIN_TOKENS",
            "niu-test-admin-token-that-is-long-1234".into(),
        )
        .expect("valid test admin token");
        AppState::new(
            config,
            niu_storage::Store::from_pool(pool),
            admin_tokens,
            reqwest::Client::new(),
            HashMap::from([("PROVIDER_KEY".into(), "provider-secret-token".into())]),
        )
    }

    #[tokio::test]
    async fn model_routes_require_a_valid_client_token() {
        let response = router(test_state(
            None,
            sqlx::postgres::PgPoolOptions::new()
                .connect_lazy("postgres://localhost/unused")
                .unwrap(),
        ))
        .oneshot(
            Request::get("/v1/models")
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[sqlx::test(migrations = "../../crates/storage/migrations")]
    #[ignore = "requires PostgreSQL"]
    async fn priced_streaming_settles_only_terminal_usage(pool: sqlx::PgPool) {
        for (payload, completed, settled) in [
            (
                "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":2,\"completion_tokens\":1}}\n\ndata: [DONE]\n\n",
                true,
                true,
            ),
            ("data: {\"choices\":[]}\n\ndata: [DONE]\n\n", true, false),
            (
                "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":2,\"completion_tokens\":1}}\n\n",
                false,
                false,
            ),
        ] {
            let captured = Captured::default();
            let observed = captured.clone();
            let upstream = Router::new().route(
                "/v1/chat/completions",
                post(move |headers: HeaderMap, Json(body): Json<Value>| {
                    let observed = observed.clone();
                    async move {
                        *observed.0.lock().unwrap() = Some((headers, body));
                        ([("content-type", "text/event-stream")], payload)
                    }
                }),
            );
            let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
            let address = listener.local_addr().unwrap();
            let task = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
            let mut state = test_state(Some(format!("http://{address}/v1")), pool.clone());
            Arc::make_mut(&mut state.config)
                .models
                .get_mut("fast")
                .unwrap()
                .pricing = Some(crate::config::RoutePricing {
                currency: "USD".into(),
                api_prompt_rate: 2_000_000,
                api_completion_rate: 4_000_000,
                cash_prompt_rate: 1_000_000,
                cash_completion_rate: 2_000_000,
                max_input_tokens: 10,
                max_output_tokens: 10,
            });
            let org = state
                .store
                .create_organization("stream-costs")
                .await
                .unwrap();
            let scope = state
                .store
                .create_project(org, "stream-costs")
                .await
                .unwrap();
            state.store.create_budget(scope, "USD", 30).await.unwrap();
            let key = state
                .store
                .issue_key(scope, "client", &["fast".into()], 3600)
                .await
                .unwrap();
            let response = router(state.clone()).oneshot(Request::post("/v1/chat/completions")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(json!({"model":"fast","messages":[{"role":"user","content":"hi"}],"stream":true}).to_string())).unwrap()).await.unwrap();
            assert_eq!(response.status(), StatusCode::OK);
            let id: uuid::Uuid = response.headers()["x-niu-attempt-id"]
                .to_str()
                .unwrap()
                .parse()
                .unwrap();
            let body = response.into_body().collect().await;
            assert_eq!(body.is_ok(), completed);
            assert_eq!(
                captured.0.lock().unwrap().as_ref().unwrap().1["stream_options"]["include_usage"],
                true
            );
            state.store.recover_settlements(None).await.unwrap();
            let budget = state.store.budget(scope).await.unwrap().unwrap();
            assert_eq!(
                (budget.spent_nanos, budget.reserved_nanos),
                if settled { (4, 0) } else { (0, 30) }
            );
            assert_eq!(
                state
                    .store
                    .cost_entries(scope, None, 100)
                    .await
                    .unwrap()
                    .len(),
                usize::from(settled)
            );
            let attempt = state.store.attempt(scope, id).await.unwrap().unwrap();
            assert_eq!(
                attempt.execution,
                if completed {
                    "confirmed_completed"
                } else {
                    "may_have_executed"
                }
            );
            task.abort();
        }
    }

    #[sqlx::test(migrations = "../../crates/storage/migrations")]
    #[ignore = "requires PostgreSQL"]
    async fn priced_inference_reserves_settles_and_blocks_exhaustion(pool: sqlx::PgPool) {
        let captured = Captured::default();
        let upstream = Router::new()
            .route("/v1/chat/completions", post(provider))
            .with_state(captured.clone());
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let task = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
        let mut state = test_state(Some(format!("http://{address}/v1")), pool);
        Arc::make_mut(&mut state.config)
            .models
            .get_mut("fast")
            .unwrap()
            .pricing = Some(crate::config::RoutePricing {
            currency: "USD".into(),
            api_prompt_rate: 2_000_000,
            api_completion_rate: 4_000_000,
            cash_prompt_rate: 1_000_000,
            cash_completion_rate: 2_000_000,
            max_input_tokens: 10,
            max_output_tokens: 10,
        });
        let org = state.store.create_organization("priced").await.unwrap();
        let scope = state.store.create_project(org, "priced").await.unwrap();
        state.store.create_budget(scope, "USD", 34).await.unwrap();
        let key = state
            .store
            .issue_key(scope, "client", &["fast".into()], 3600)
            .await
            .unwrap();
        let app = router(state.clone());
        for (body, expected) in [
            (
                json!({"model":"fast","messages":[{"role":"user","content":"hi"}],"n":2}),
                StatusCode::BAD_REQUEST,
            ),
            (
                json!({"model":"fast","messages":[{"role":"user","content":"hi"}],"max_completion_tokens":11}),
                StatusCode::BAD_REQUEST,
            ),
            (
                json!({"model":"fast","messages":[{"role":"user","content":"hi"}]}),
                StatusCode::OK,
            ),
            (
                json!({"model":"fast","messages":[{"role":"user","content":"hi"}]}),
                StatusCode::OK,
            ),
            (
                json!({"model":"fast","messages":[{"role":"user","content":"hi"}]}),
                StatusCode::PAYMENT_REQUIRED,
            ),
        ] {
            *captured.0.lock().unwrap() = None;
            let response = app
                .clone()
                .oneshot(
                    Request::post("/v1/chat/completions")
                        .header("authorization", format!("Bearer {}", key.token))
                        .header("content-type", "application/json")
                        .body(axum::body::Body::from(body.to_string()))
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), expected);
            if expected == StatusCode::OK {
                let attempt: uuid::Uuid = response.headers()["x-niu-attempt-id"]
                    .to_str()
                    .unwrap()
                    .parse()
                    .unwrap();
                assert_eq!(
                    state
                        .store
                        .attempt(scope, attempt)
                        .await
                        .unwrap()
                        .unwrap()
                        .settlement,
                    "settled"
                );
                assert_eq!(
                    captured.0.lock().unwrap().as_ref().unwrap().1["max_completion_tokens"],
                    10
                );
            } else {
                assert!(captured.0.lock().unwrap().is_none());
            }
        }
        let budget = state.store.budget(scope).await.unwrap().unwrap();
        assert_eq!((budget.spent_nanos, budget.reserved_nanos), (8, 0));
        let entries = state.store.cost_entries(scope, None, 100).await.unwrap();
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].price_revision_id, entries[1].price_revision_id);
        for entry in entries {
            assert_eq!((entry.cash_nanos, entry.api_equivalent_nanos), (4, 8));
        }
        task.abort();
    }

    #[sqlx::test(migrations = "../../crates/storage/migrations")]
    #[ignore = "requires PostgreSQL"]
    async fn admin_cost_reporting_preserves_precision_and_requires_admin(pool: sqlx::PgPool) {
        let store = niu_storage::Store::from_pool(pool.clone());
        let org = store.create_organization("reporting").await.unwrap();
        let scope = store.create_project(org, "costs").await.unwrap();
        let key = store
            .issue_key(scope, "client", &["fast".into()], 3600)
            .await
            .unwrap();
        let app = router(test_state(None, pool));
        let base = format!(
            "/admin/v1/organizations/{org}/projects/{}",
            scope.project_id
        );
        let budget_path = format!("{base}/budget");
        for (auth, payload, expected) in [
            (
                format!("Bearer {}", key.token),
                json!({"currency":"USD","limit_nanos":"100"}),
                StatusCode::UNAUTHORIZED,
            ),
            (
                "Bearer niu-test-admin-token-that-is-long-1234".into(),
                json!({"currency":"USD","limit_nanos":"1e9"}),
                StatusCode::BAD_REQUEST,
            ),
            (
                "Bearer niu-test-admin-token-that-is-long-1234".into(),
                json!({"currency":"usd","limit_nanos":"100"}),
                StatusCode::BAD_REQUEST,
            ),
            (
                "Bearer niu-test-admin-token-that-is-long-1234".into(),
                json!({"currency":"USD","limit_nanos":"9223372036854775808"}),
                StatusCode::BAD_REQUEST,
            ),
        ] {
            let response = app
                .clone()
                .oneshot(
                    Request::post(&budget_path)
                        .header("authorization", auth)
                        .header("content-type", "application/json")
                        .body(axum::body::Body::from(payload.to_string()))
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), expected);
        }
        let create = || {
            app.clone().oneshot(
                Request::post(&budget_path)
                    .header(
                        "authorization",
                        "Bearer niu-test-admin-token-that-is-long-1234",
                    )
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(
                        json!({"currency":"USD","limit_nanos":"9007199254740993"}).to_string(),
                    ))
                    .unwrap(),
            )
        };
        let (first, raced) = tokio::join!(create(), create());
        let statuses = [first.unwrap().status(), raced.unwrap().status()];
        assert!(statuses.contains(&StatusCode::CREATED));
        assert!(statuses.contains(&StatusCode::CONFLICT));
        for suffix in ["budget", "costs"] {
            for auth in [String::new(), format!("Bearer {}", key.token)] {
                let response = app
                    .clone()
                    .oneshot(
                        Request::get(format!("{base}/{suffix}"))
                            .header("authorization", auth)
                            .body(axum::body::Body::empty())
                            .unwrap(),
                    )
                    .await
                    .unwrap();
                assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
            }
        }
        for (suffix, expected) in [
            (
                "budget",
                json!({"data": {"currency":"USD", "limit_nanos":"9007199254740993", "reserved_nanos":"0", "spent_nanos":"0", "period":"lifetime"}}),
            ),
            ("costs", json!({"data": [], "next_cursor": null})),
        ] {
            let response = app
                .clone()
                .oneshot(
                    Request::get(format!("{base}/{suffix}"))
                        .header(
                            "authorization",
                            "Bearer niu-test-admin-token-that-is-long-1234",
                        )
                        .body(axum::body::Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::OK);
            let body: Value =
                serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                    .unwrap();
            assert_eq!(body, expected);
        }
        let price = store
            .publish_price(
                scope,
                niu_storage::PriceInput {
                    resource_id: "fast",
                    offer_revision: "v1",
                    currency: "USD",
                    api_equivalent: niu_storage::TokenRates {
                        prompt: 2_000_000,
                        completion: 4_000_000,
                    },
                    cash: niu_storage::TokenRates {
                        prompt: 1_000_000,
                        completion: 2_000_000,
                    },
                },
            )
            .await
            .unwrap();
        let principal = store.authenticate(&key.token).await.unwrap();
        for _ in 0..2 {
            let operation = store.create_operation(scope, "fast").await.unwrap();
            let attempt = store
                .prepare_attempt(scope, operation, "fast", "v1")
                .await
                .unwrap();
            store
                .reserve_cost(scope, attempt, price, 20, 10)
                .await
                .unwrap();
            store.mark_dispatched(&principal, attempt).await.unwrap();
            store
                .complete(scope, attempt, Some((20, 10)))
                .await
                .unwrap();
            store.settle_cost(scope, attempt).await.unwrap();
        }
        let mut cursor = None;
        let mut seen = Vec::new();
        for page in 0..2 {
            let path = match cursor {
                Some(ref c) => format!("{base}/costs?limit=1&after={c}"),
                None => format!("{base}/costs?limit=1"),
            };
            let response = app
                .clone()
                .oneshot(
                    Request::get(path)
                        .header(
                            "authorization",
                            "Bearer niu-test-admin-token-that-is-long-1234",
                        )
                        .body(axum::body::Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::OK);
            let body: Value =
                serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                    .unwrap();
            assert_eq!(body["data"].as_array().unwrap().len(), 1);
            let entry = &body["data"][0];
            assert_eq!(entry["cash_nanos"], "40");
            assert_eq!(entry["api_equivalent_nanos"], "80");
            assert_eq!(entry["usage_prompt_tokens"], "20");
            assert!(!seen.contains(&entry["attempt_id"]));
            seen.push(entry["attempt_id"].clone());
            cursor = body["next_cursor"].as_str().map(str::to_owned);
            assert_eq!(cursor.is_some(), page == 0);
        }
        let response = app
            .oneshot(
                Request::get(format!("{base}/costs?limit=101"))
                    .header(
                        "authorization",
                        "Bearer niu-test-admin-token-that-is-long-1234",
                    )
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[sqlx::test(migrations = "../../crates/storage/migrations")]
    #[ignore = "requires PostgreSQL"]
    async fn chat_uses_server_routing_and_credentials_not_client_control_fields(
        pool: sqlx::PgPool,
    ) {
        let captured = Captured::default();
        let upstream = Router::new()
            .route("/v1/chat/completions", post(provider))
            .with_state(captured.clone());
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });

        let state = test_state(Some(format!("http://{address}/v1")), pool);
        let org = state.store.create_organization("test").await.unwrap();
        let scope = state.store.create_project(org, "test").await.unwrap();
        let key = state
            .store
            .issue_key(scope, "client", &["fast".into()], 3600)
            .await
            .unwrap();
        let app = router(state.clone());
        let body = json!({
            "model": "fast",
            "messages": [{"role": "user", "content": "hello"}],
            "api_key": "attacker-key",
            "API_BASE": "https://attacker.example/",
            "extra_headers": {"Authorization": "Bearer attacker-key"},
            "temperature": 0.2
        });
        let response = app
            .clone()
            .oneshot(
                Request::post("/v1/chat/completions")
                    .header("authorization", format!("Bearer {}", key.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();

        let attempt_id: uuid::Uuid = response.headers()["x-niu-attempt-id"]
            .to_str()
            .unwrap()
            .parse()
            .unwrap();
        let attempt = state
            .store
            .attempt(scope, attempt_id)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(attempt.execution, "confirmed_completed");
        assert_eq!(attempt.prompt_tokens, Some(2));
        assert_eq!(attempt.completion_tokens, Some(1));
        assert_eq!(attempt.settlement, "unresolved");
        let status = response.status();
        let payload = response.into_body().collect().await.unwrap().to_bytes();
        let payload_text = String::from_utf8_lossy(&payload);
        let captured_request = captured.0.lock().unwrap().clone();
        assert_eq!(
            status,
            StatusCode::OK,
            "response={payload_text}; upstream={captured_request:?}"
        );
        let payload: Value = serde_json::from_slice(&payload).unwrap();
        assert_eq!(payload["model"], "fast");
        assert_eq!(payload["id"], "upstream-id");
        let usage = state.usage.snapshot();
        assert_eq!(usage.attempts_provider_reported, 1);
        assert_eq!(usage.attempts_unknown, 0);
        assert_eq!((usage.prompt_tokens, usage.completion_tokens), (2, 1));

        let (headers, sent_body) = captured_request.expect("provider called");
        assert_eq!(
            headers.get("authorization").unwrap(),
            "Bearer provider-secret-token"
        );
        assert_eq!(sent_body["model"], "provider-secret-model");
        assert_eq!(sent_body["temperature"], 0.2);
        assert!(sent_body.get("api_key").is_none());
        assert!(sent_body.get("API_BASE").is_none());
        assert!(sent_body.get("extra_headers").is_none());
        state.store.revoke_key(scope, key.id).await.unwrap();
        *captured.0.lock().unwrap() = None;
        let revoked = app
            .oneshot(
                Request::post("/v1/chat/completions")
                    .header("authorization", format!("Bearer {}", key.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(revoked.status(), StatusCode::UNAUTHORIZED);
        assert!(captured.0.lock().unwrap().is_none());
    }

    #[sqlx::test(migrations = "../../crates/storage/migrations")]
    #[ignore = "requires PostgreSQL"]
    async fn readiness_and_liveness_do_not_require_credentials(pool: sqlx::PgPool) {
        let app = router(test_state(None, pool.clone()));
        for path in ["/healthz", "/readyz"] {
            let response = app
                .clone()
                .oneshot(Request::get(path).body(axum::body::Body::empty()).unwrap())
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::OK);
        }
    }
    async fn admin_call(app: &Router, path: &str, body: Value) -> Value {
        let response = app
            .clone()
            .oneshot(
                Request::post(path)
                    .header(
                        "authorization",
                        "Bearer niu-test-admin-token-that-is-long-1234",
                    )
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::CREATED);
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap()
    }

    #[sqlx::test(migrations = "../../crates/storage/migrations")]
    #[ignore = "requires PostgreSQL"]
    async fn bootstrap_api_issues_scoped_keys_and_revokes_them(pool: sqlx::PgPool) {
        let app = router(test_state(None, pool));
        let org = admin_call(&app, "/admin/v1/organizations", json!({"name": "team"})).await;
        let project_path = format!(
            "/admin/v1/organizations/{}/projects",
            org["id"].as_str().unwrap()
        );
        let project = admin_call(&app, &project_path, json!({"name": "app"})).await;
        let key_path = format!("{}/{}/keys", project_path, project["id"].as_str().unwrap());
        let account_path = format!(
            "{}/{}/accounts",
            project_path,
            project["id"].as_str().unwrap()
        );
        let account = admin_call(&app, &account_path, json!({
            "provider": "fixture", "plan": "subscription", "authentication_mode": "oauth_refresh",
            "billing_mode": "subscription", "credential_reference": "secret:fixture-account",
            "concurrency_limit": 2,
        })).await;
        assert_eq!(account["health"], "unverified");
        let response = app
            .clone()
            .oneshot(
                Request::get(&account_path)
                    .header(
                        "authorization",
                        "Bearer niu-test-admin-token-that-is-long-1234",
                    )
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let accounts: Value =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        assert_eq!(accounts["data"][0]["billing_mode"], "subscription");
        assert!(accounts["data"][0].get("credential_reference").is_none());
        let denied = app
            .clone()
            .oneshot(
                Request::get(&account_path)
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(denied.status(), StatusCode::UNAUTHORIZED);
        let key = admin_call(
            &app,
            &key_path,
            json!({"name": "inference", "allowed_models": ["fast"], "ttl_seconds": 3600}),
        )
        .await;
        let auth = format!("Bearer {}", key["token"].as_str().unwrap());
        let response = app
            .clone()
            .oneshot(
                Request::get("/v1/models")
                    .header("authorization", &auth)
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let models: Value =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        assert_eq!(models["data"][0]["id"], "fast");
        let response = app
            .clone()
            .oneshot(
                Request::post("/admin/v1/organizations")
                    .header("authorization", &auth)
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(r#"{"name":"unauthorized"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        let key = admin_call(
            &app,
            &format!("{}/{}/rotate", key_path, key["id"].as_str().unwrap()),
            json!({}),
        )
        .await;
        let replacement_auth = format!("Bearer {}", key["token"].as_str().unwrap());
        let replacement = app
            .clone()
            .oneshot(
                Request::get("/v1/models")
                    .header("authorization", replacement_auth)
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(replacement.status(), StatusCode::OK);
        let response = app
            .clone()
            .oneshot(
                Request::delete(format!("{}/{}", key_path, key["id"].as_str().unwrap()))
                    .header(
                        "authorization",
                        "Bearer niu-test-admin-token-that-is-long-1234",
                    )
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NO_CONTENT);
        let response = app
            .oneshot(
                Request::get("/v1/models")
                    .header("authorization", &auth)
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }
    #[sqlx::test(migrations = "../../crates/storage/migrations")]
    #[ignore = "requires PostgreSQL"]
    async fn missing_usage_and_provider_failures_remain_unsettled(pool: sqlx::PgPool) {
        for (status, payload, expected_status, execution, settlement) in [
            (
                StatusCode::OK,
                json!({"choices": []}),
                StatusCode::OK,
                "confirmed_completed",
                "reconciliation_required",
            ),
            (
                StatusCode::OK,
                json!({"unexpected": true}),
                StatusCode::BAD_GATEWAY,
                "may_have_executed",
                "unresolved",
            ),
            (
                StatusCode::BAD_GATEWAY,
                json!({"error": "failed"}),
                StatusCode::BAD_GATEWAY,
                "may_have_executed",
                "unresolved",
            ),
        ] {
            let upstream = Router::new().route(
                "/v1/chat/completions",
                post(move || {
                    let payload = payload.clone();
                    async move { (status, Json(payload)) }
                }),
            );
            let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
            let address = listener.local_addr().unwrap();
            let task = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
            let state = test_state(Some(format!("http://{address}/v1")), pool.clone());
            let org = state
                .store
                .create_organization("failure-test")
                .await
                .unwrap();
            let scope = state.store.create_project(org, "app").await.unwrap();
            let key = state
                .store
                .issue_key(scope, "client", &["fast".into()], 3600)
                .await
                .unwrap();
            let response = router(state.clone()).oneshot(Request::post("/v1/chat/completions")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(json!({"model": "fast", "messages": [{"role": "user", "content": "hello"}]}).to_string())).unwrap()).await.unwrap();
            assert_eq!(response.status(), expected_status);
            let id = response.headers()["x-niu-attempt-id"]
                .to_str()
                .unwrap()
                .parse()
                .unwrap();
            let evidence = state.store.attempt(scope, id).await.unwrap().unwrap();
            assert_eq!(evidence.execution, execution);
            assert_eq!(evidence.settlement, settlement);
            assert_eq!(evidence.usage_confidence, "unknown");
            assert_eq!(evidence.prompt_tokens, None);
            task.abort();
        }
    }
    #[sqlx::test(migrations = "../../crates/storage/migrations")]
    #[ignore = "requires PostgreSQL"]
    async fn streaming_persists_terminal_evidence_and_keeps_interruptions_unknown(
        pool: sqlx::PgPool,
    ) {
        for (wire, complete, usage) in [
            (
                "data: {\"choices\":[]}\r\n\r\ndata: {\"usage\":{\"prompt_tokens\":9,\"completion_tokens\":4}}\r\n\r\ndata: [DONE]\r\n\r\n",
                true,
                Some((9, 4)),
            ),
            ("data: {\"choices\":[]}\n\ndata: [DONE]\n\n", true, None),
            ("data: {\"choices\":[]}\n\n", false, None),
            (
                "data: {\"error\":{\"message\":\"failed\"}}\n\n",
                false,
                None,
            ),
        ] {
            let upstream = Router::new().route(
                "/v1/chat/completions",
                post(move || async move {
                    let chunks: Vec<_> = wire
                        .as_bytes()
                        .chunks(3)
                        .map(|chunk| {
                            Ok::<_, std::convert::Infallible>(axum::body::Bytes::copy_from_slice(
                                chunk,
                            ))
                        })
                        .collect();
                    (
                        [("content-type", "text/event-stream")],
                        axum::body::Body::from_stream(futures_util::stream::iter(chunks)),
                    )
                }),
            );
            let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
            let address = listener.local_addr().unwrap();
            let server =
                tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
            let state = test_state(Some(format!("http://{address}/v1")), pool.clone());
            let org = state.store.create_organization("streaming").await.unwrap();
            let scope = state.store.create_project(org, "project").await.unwrap();
            let key = state
                .store
                .issue_key(scope, "key", &["fast".into()], 3600)
                .await
                .unwrap();
            let app = router(state.clone());
            let request = || {
                Request::post("/v1/chat/completions").header("authorization", format!("Bearer {}", key.token)).header("content-type", "application/json")
                .body(axum::body::Body::from(json!({"model":"fast", "stream":true, "messages":[{"role":"user","content":"hello"}]}).to_string())).unwrap()
            };
            let response = app.clone().oneshot(request()).await.unwrap();
            assert_eq!(response.status(), StatusCode::OK);
            let id = response.headers()["x-niu-attempt-id"]
                .to_str()
                .unwrap()
                .parse()
                .unwrap();
            let collected = response.into_body().collect().await;
            assert_eq!(collected.is_ok(), complete);
            if complete {
                assert_eq!(collected.unwrap().to_bytes().as_ref(), wire.as_bytes());
            }
            let attempt = state.store.attempt(scope, id).await.unwrap().unwrap();
            assert_eq!(
                attempt.execution,
                if complete {
                    "confirmed_completed"
                } else {
                    "may_have_executed"
                }
            );
            assert_eq!(attempt.prompt_tokens, usage.map(|(p, _)| p));
            assert_eq!(attempt.completion_tokens, usage.map(|(_, c)| c));
            assert_eq!(
                state.usage.snapshot().attempts_provider_reported,
                u64::from(usage.is_some())
            );
            // A client that drops before polling receives no completion guarantee.
            let cancelled = app.oneshot(request()).await.unwrap();
            let id = cancelled.headers()["x-niu-attempt-id"]
                .to_str()
                .unwrap()
                .parse()
                .unwrap();
            drop(cancelled);
            assert_eq!(
                state
                    .store
                    .attempt(scope, id)
                    .await
                    .unwrap()
                    .unwrap()
                    .execution,
                "may_have_executed"
            );
            server.abort();
        }
    }
}
