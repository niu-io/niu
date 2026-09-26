use std::time::Duration;

use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{any, get},
};
use litellm_core::chat_completions::{
    chat_completions, chat_completions_decline_reason, types::ChatCompletionsRequest,
};
use serde_json::{Value, json};
use std::sync::atomic::Ordering;
use uuid::Uuid;

use crate::{error::ApiError, state::AppState};

mod static_site;

pub fn router(state: AppState) -> Router {
    Router::new()
        .route(
            "/admin/v1/setup/default-workspace",
            axum::routing::post(crate::admin::default_workspace),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/collector-keys",
            axum::routing::post(crate::admin::issue_collector_key),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/collector-keys/{id}",
            axum::routing::delete(crate::admin::revoke_collector_key),
        )
        .merge(static_site::router())
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
        .route(
            "/admin/v1/operators",
            get(crate::admin::operators).post(crate::admin::create_operator),
        )
        .route(
            "/admin/v1/operators/{operator}",
            axum::routing::delete(crate::admin::revoke_operator),
        )
        .route(
            "/admin/v1/operators/{operator}/sessions",
            get(crate::admin::operator_sessions).post(crate::admin::create_operator_session),
        )
        .route(
            "/admin/v1/operators/{operator}/sessions/{session}",
            axum::routing::delete(crate::admin::revoke_operator_session),
        )
        .route("/catalog/v1/models", get(catalog_models))
        .route("/v1/models", get(public_models))
        .route("/v1/chat/completions", axum::routing::post(chat))
        .route("/v1/responses", axum::routing::post(responses))
        .route("/v1/embeddings", axum::routing::post(embeddings))
        .route("/admin/v1/models", get(admin_models))
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/accounts",
            get(crate::admin::accounts).post(crate::admin::create_account),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/accounts/{account}/quota",
            get(crate::admin::quota)
                .post(crate::admin::observe_quota)
                .delete(crate::admin::delete_quota_window),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/accounts/{account}/executions",
            get(crate::admin::account_executions),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/budget",
            get(crate::admin::budget).post(crate::admin::create_budget),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/costs",
            get(crate::admin::costs),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/execution-imports",
            get(crate::admin::execution_imports).post(crate::admin::import_execution),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/execution-imports/{execution}",
            get(crate::admin::execution_import).delete(crate::admin::delete_execution_import),
        )
        // The concise aliases are used by the console. The explicit
        // execution-imports paths remain available for API and SDK clients.
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/executions",
            get(crate::admin::execution_imports).post(crate::admin::import_execution),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/executions/cohort",
            get(crate::admin::execution_cohort),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/executions/{execution}",
            get(crate::admin::execution_import).delete(crate::admin::delete_execution_import),
        )
        .route("/admin/v1/metrics", get(admin_metrics))
        .route(
            "/admin/v1/benchmarks/compare",
            axum::routing::post(crate::admin::compare_benchmark),
        )
        .route("/v1", any(api_not_found))
        .route("/v1/{*path}", any(api_not_found))
        .route("/catalog/v1", any(api_not_found))
        .route("/catalog/v1/{*path}", any(api_not_found))
        .route("/admin/v1", any(api_not_found))
        .route("/admin/v1/{*path}", any(api_not_found))
        .layer(DefaultBodyLimit::max(1_048_576))
        .with_state(state)
}

async fn api_not_found() -> ApiError {
    ApiError::not_found()
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

async fn catalog_models(State(state): State<AppState>) -> Json<Value> {
    let data: Vec<_> = state
        .config
        .models
        .iter()
        .filter(|(_, model)| model.public_catalog)
        .map(|(name, model)| {
            json!({
                "id": name,
                "object": "model",
                "owned_by": "niu",
                "capabilities": {
                    "chat_completions": true,
                    "streaming": model.provider == "openai",
                    "embeddings": model.supports_embeddings,
                    "responses": model.supports_responses
                }
            })
        })
        .collect();
    Json(json!({"object": "list", "data": data}))
}

async fn admin_models(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    state
        .authorize_admin(bearer(&headers), niu_storage::AdminPermission::Read)
        .await?;
    let data: Vec<_> = state
        .config
        .models
        .iter()
        .map(|(name, model)| {
            json!({
                "id": name,
                "provider": model.provider,
                "upstream_model": model.upstream_model,
                "public_catalog": model.public_catalog,
                "supports_embeddings": model.supports_embeddings,
                "supports_embedding_dimensions": model.supports_embedding_dimensions,
                "supports_embedding_base64": model.supports_embedding_base64,
                "supports_tool_calls": model.supports_tool_calls,
                "supports_streaming_tool_calls": model.supports_streaming_tool_calls,
                "supports_structured_output": model.supports_structured_output,
                "supports_responses": model.supports_responses
            })
        })
        .collect();
    Ok(Json(json!({"data": data})))
}

async fn admin_metrics(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    state
        .authorize_admin(bearer(&headers), niu_storage::AdminPermission::Read)
        .await?;
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
    if stream && model.provider != "openai" {
        return Err(ApiError::unsupported());
    }
    if !matches!(model.provider.as_str(), "openai" | "anthropic" | "bedrock") {
        return Err(ApiError::invalid_request(
            "Provider is not supported by this gateway",
        ));
    }
    validate_chat_capabilities(&body, model, stream)?;
    if let Some(price) = &model.pricing {
        validate_priced_request(&mut body, price)?;
    }
    let native_optional_params = if model.provider == "openai" {
        None
    } else {
        let optional_params = map_native_chat_params(&body, &model.provider)?;
        if chat_completions_decline_reason(
            &model.upstream_model,
            Some(&model.provider),
            messages.clone(),
            &optional_params,
        )
        .is_some()
        {
            return Err(ApiError::unsupported());
        }
        Some(optional_params)
    };
    let api_key = state
        .provider_key(&model.api_key_env)
        .ok_or_else(ApiError::unavailable)?
        .to_owned();
    let timeout = Duration::from_secs(state.config.server.request_timeout_seconds);
    state.requests.fetch_add(1, Ordering::Relaxed);
    let dispatch = begin_attempt(&state, &principal, &public_model, model, None).await?;
    let result = execute_chat(
        &state,
        ChatExecution {
            public_model: &public_model,
            model,
            api_key,
            body,
            messages,
            native_optional_params,
            stream,
            timeout,
            scope: dispatch.scope,
            attempt: dispatch.attempt,
        },
    )
    .await;
    Ok(finalize_response(&state, dispatch, result).await)
}

#[derive(Clone, Copy)]
struct ResponsesRequestBounds {
    input_bytes: usize,
    max_output_tokens: Option<i64>,
}

async fn responses(
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
    let bounds = validate_responses_request(&mut body, model.pricing.as_ref())?;
    if model.provider != "openai" || !model.supports_responses {
        return Err(ApiError::unsupported());
    }
    if let Some(price) = &model.pricing
        && bounds.input_bytes > price.max_input_tokens as usize
    {
        return Err(ApiError::invalid_request(
            "Responses input exceeds the priced route's conservative UTF-8 byte bound",
        ));
    }
    let api_key = state
        .provider_key(&model.api_key_env)
        .ok_or_else(ApiError::unavailable)?
        .to_owned();
    let timeout = Duration::from_secs(state.config.server.request_timeout_seconds);
    state.requests.fetch_add(1, Ordering::Relaxed);
    let dispatch = begin_attempt(
        &state,
        &principal,
        &public_model,
        model,
        bounds.max_output_tokens,
    )
    .await?;
    let result = execute_responses(&state, &public_model, model, api_key, body, timeout).await;
    Ok(finalize_response(&state, dispatch, result).await)
}

fn validate_responses_request(
    body: &mut Value,
    price: Option<&crate::config::RoutePricing>,
) -> Result<ResponsesRequestBounds, ApiError> {
    let object = body
        .as_object_mut()
        .ok_or_else(|| ApiError::invalid_request("The request body must be a JSON object"))?;
    const ALLOWED: &[&str] = &[
        "model",
        "input",
        "instructions",
        "max_output_tokens",
        "temperature",
        "top_p",
        "metadata",
        "user",
        "stream",
    ];
    if object.keys().any(|key| !ALLOWED.contains(&key.as_str())) {
        return Err(ApiError::invalid_request(
            "Unsupported field in Responses request",
        ));
    }
    match object.get("stream") {
        None | Some(Value::Bool(false)) => {}
        Some(Value::Bool(true)) => return Err(ApiError::unsupported()),
        _ => return Err(ApiError::invalid_request("stream must be a boolean")),
    }
    let input_bytes = object
        .get("input")
        .and_then(Value::as_str)
        .filter(|input| !input.is_empty())
        .map(str::len)
        .ok_or_else(|| ApiError::invalid_request("input must be a non-empty text string"))?;
    let instructions_bytes = match object.get("instructions") {
        None => 0,
        Some(Value::String(instructions)) => instructions.len(),
        _ => return Err(ApiError::invalid_request("instructions must be a string")),
    };
    let input_bytes = input_bytes
        .checked_add(instructions_bytes)
        .ok_or_else(|| ApiError::invalid_request("Responses input is too large"))?;
    if object
        .get("user")
        .is_some_and(|user| user.as_str().is_none_or(|user| user.len() > 512))
    {
        return Err(ApiError::invalid_request(
            "user must be a string of at most 512 bytes",
        ));
    }
    if object.get("metadata").is_some_and(|metadata| {
        metadata.as_object().is_none_or(|metadata| {
            metadata.len() > 16
                || metadata.iter().any(|(key, value)| {
                    key.len() > 64 || value.as_str().is_none_or(|value| value.len() > 512)
                })
        })
    }) {
        return Err(ApiError::invalid_request(
            "metadata must contain at most 16 string values with bounded keys and values",
        ));
    }
    for (name, minimum, maximum) in [("temperature", 0.0, 2.0), ("top_p", 0.0, 1.0)] {
        if object.get(name).is_some_and(|value| {
            value
                .as_f64()
                .is_none_or(|value| !(minimum..=maximum).contains(&value))
        }) {
            return Err(ApiError::invalid_request(
                "temperature or top_p is outside its supported range",
            ));
        }
    }

    let mut max_output_tokens = match object.get("max_output_tokens") {
        None => None,
        Some(value) => Some(
            value
                .as_i64()
                .filter(|value| (1..=1_000_000).contains(value))
                .ok_or_else(|| {
                    ApiError::invalid_request(
                        "max_output_tokens must be an integer from 1 to 1000000",
                    )
                })?,
        ),
    };
    if let Some(price) = price {
        if let Some(output) = max_output_tokens {
            if output > price.max_output_tokens {
                return Err(ApiError::invalid_request(
                    "Output limit exceeds the priced route bound",
                ));
            }
        } else {
            max_output_tokens = Some(price.max_output_tokens);
            object.insert("max_output_tokens".into(), json!(price.max_output_tokens));
        }
    }
    Ok(ResponsesRequestBounds {
        input_bytes,
        max_output_tokens,
    })
}

#[derive(Clone, Copy)]
struct EmbeddingInputBounds {
    item_count: usize,
    utf8_bytes: usize,
    dimensions: Option<usize>,
    encoding_format: &'static str,
}

async fn embeddings(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<Value>,
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
    // Only OpenAI-compatible embedding routes are implemented. Reject before
    // creating an operation or dispatch attempt for other providers.
    if model.provider != "openai" {
        return Err(ApiError::unsupported());
    }
    let input_bounds = validate_embedding_request(&body)?;
    if !model.supports_embeddings
        || (input_bounds.dimensions.is_some() && !model.supports_embedding_dimensions)
        || (input_bounds.encoding_format == "base64" && !model.supports_embedding_base64)
    {
        return Err(ApiError::unsupported());
    }
    if let Some(price) = &model.pricing
        && input_bounds.utf8_bytes > price.max_input_tokens as usize
    {
        return Err(ApiError::invalid_request(
            "Embedding input exceeds the priced route's conservative UTF-8 byte bound",
        ));
    }
    let api_key = state
        .provider_key(&model.api_key_env)
        .ok_or_else(ApiError::unavailable)?
        .to_owned();
    let timeout = Duration::from_secs(state.config.server.request_timeout_seconds);
    state.requests.fetch_add(1, Ordering::Relaxed);

    let dispatch = begin_attempt(&state, &principal, &public_model, model, Some(0)).await?;
    let result = execute_embeddings(
        &state,
        EmbeddingExecution {
            public_model: &public_model,
            model,
            api_key,
            body,
            input_bounds,
            timeout,
        },
    )
    .await;
    Ok(finalize_response(&state, dispatch, result).await)
}

fn validate_embedding_request(body: &Value) -> Result<EmbeddingInputBounds, ApiError> {
    let object = body
        .as_object()
        .ok_or_else(|| ApiError::invalid_request("The request body must be a JSON object"))?;
    const ALLOWED: &[&str] = &["model", "input", "encoding_format", "dimensions", "user"];
    if object.keys().any(|key| !ALLOWED.contains(&key.as_str())) {
        return Err(ApiError::invalid_request(
            "Unsupported field in embeddings request",
        ));
    }
    let input = object
        .get("input")
        .ok_or_else(|| ApiError::invalid_request("input is required"))?;
    let (item_count, utf8_bytes) = match input {
        Value::String(text) if !text.is_empty() => (1, text.len()),
        Value::Array(items) if !items.is_empty() && items.len() <= 2048 => {
            let mut total_bytes = 0_usize;
            for item in items {
                let Some(text) = item.as_str().filter(|text| !text.is_empty()) else {
                    return Err(ApiError::invalid_request(
                        "input arrays must contain non-empty strings",
                    ));
                };
                total_bytes = total_bytes
                    .checked_add(text.len())
                    .ok_or_else(|| ApiError::invalid_request("input is too large"))?;
            }
            (items.len(), total_bytes)
        }
        Value::Array(_) => {
            return Err(ApiError::invalid_request(
                "input must contain between 1 and 2048 strings",
            ));
        }
        _ => {
            return Err(ApiError::invalid_request(
                "input must be a non-empty string or array of strings",
            ));
        }
    };
    let dimensions = match object.get("dimensions") {
        None => None,
        Some(value) => Some(
            value
                .as_u64()
                .filter(|value| (1..=65_536).contains(value))
                .ok_or_else(|| {
                    ApiError::invalid_request("dimensions must be an integer from 1 to 65536")
                })? as usize,
        ),
    };
    let encoding_format = match object.get("encoding_format") {
        None => "float",
        Some(Value::String(value)) if value == "float" => "float",
        Some(Value::String(value)) if value == "base64" => "base64",
        _ => {
            return Err(ApiError::invalid_request(
                "encoding_format must be float or base64",
            ));
        }
    };
    if let Some(user) = object.get("user")
        && !user.as_str().is_some_and(|value| value.len() <= 512)
    {
        return Err(ApiError::invalid_request(
            "user must be a string up to 512 bytes",
        ));
    }
    Ok(EmbeddingInputBounds {
        item_count,
        utf8_bytes,
        dimensions,
        encoding_format,
    })
}

#[derive(Clone, Copy)]
struct DispatchContext {
    scope: niu_storage::TenantScope,
    operation: Uuid,
    attempt: Uuid,
}

async fn begin_attempt(
    state: &AppState,
    principal: &niu_storage::Principal,
    public_model: &str,
    model: &crate::config::ModelConfig,
    completion_bound: Option<i64>,
) -> Result<DispatchContext, ApiError> {
    let scope = principal.scope();
    let operation = state
        .store
        .create_operation(scope, public_model)
        .await
        .map_err(ApiError::from_store)?;
    let revision = route_revision(model);
    let attempt = state
        .store
        .prepare_attempt(scope, operation, public_model, &revision)
        .await
        .map_err(ApiError::from_store)?;
    if let Some(price) = &model.pricing {
        let price_id = state
            .store
            .publish_price(
                scope,
                niu_storage::PriceInput {
                    resource_id: public_model,
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
                completion_bound.unwrap_or(price.max_output_tokens),
            )
            .await
            .map_err(ApiError::from_store)?;
    }
    if let Err(error) = state.store.mark_dispatched(principal, attempt).await {
        if model.pricing.is_some() {
            // A lost commit acknowledgement must not release a dispatched hold.
            // The storage transition proves not_sent before releasing anything.
            let _ = state.store.release_unsent_cost(scope, attempt).await;
        }
        return Err(ApiError::from_store(error));
    }
    Ok(DispatchContext {
        scope,
        operation,
        attempt,
    })
}

fn route_revision(model: &crate::config::ModelConfig) -> String {
    use sha2::{Digest, Sha256};
    format!(
        "{:x}",
        Sha256::digest(
            serde_json::to_vec(&json!({
                "provider": model.provider,
                "model": model.upstream_model,
                "endpoint": model.api_base,
                "credential_reference": model.api_key_env,
                "supports_embeddings": model.supports_embeddings,
                "supports_embedding_dimensions": model.supports_embedding_dimensions,
                "supports_embedding_base64": model.supports_embedding_base64,
                "supports_tool_calls": model.supports_tool_calls,
                "supports_streaming_tool_calls": model.supports_streaming_tool_calls,
                "supports_structured_output": model.supports_structured_output,
                "supports_responses": model.supports_responses,
                "pricing": model.pricing
            }))
            .expect("route serialization")
        )
    )
}

async fn finalize_response(
    state: &AppState,
    dispatch: DispatchContext,
    result: Result<ProviderResponse, ApiError>,
) -> Response {
    let mut response = match result {
        Ok(result) if result.completed => {
            if let Err(error) = state
                .store
                .complete_and_settle(dispatch.scope, dispatch.attempt, result.usage)
                .await
            {
                ApiError::from_store(error).into_response()
            } else {
                result.response
            }
        }
        Ok(result) => result.response,
        Err(error) => error.into_response(),
    };
    response.headers_mut().insert(
        "x-niu-operation-id",
        HeaderValue::from_str(&dispatch.operation.to_string()).unwrap(),
    );
    response.headers_mut().insert(
        "x-niu-attempt-id",
        HeaderValue::from_str(&dispatch.attempt.to_string()).unwrap(),
    );
    response
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

struct EmbeddingExecution<'a> {
    public_model: &'a str,
    model: &'a crate::config::ModelConfig,
    api_key: String,
    body: Value,
    input_bounds: EmbeddingInputBounds,
    timeout: Duration,
}

async fn execute_embeddings(
    state: &AppState,
    execution: EmbeddingExecution<'_>,
) -> Result<ProviderResponse, ApiError> {
    let EmbeddingExecution {
        public_model,
        model,
        api_key,
        mut body,
        input_bounds,
        timeout,
    } = execution;
    let base = model
        .api_base
        .as_deref()
        .unwrap_or("https://api.openai.com/v1");
    let endpoint = format!("{}/embeddings", base.trim_end_matches('/'));
    let object = body
        .as_object_mut()
        .ok_or_else(|| ApiError::invalid_request("The request body must be a JSON object"))?;
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
    let valid_data = value
        .get("data")
        .and_then(Value::as_array)
        .is_some_and(|data| {
            data.len() == input_bounds.item_count
                && data.iter().enumerate().all(|(index, item)| {
                    let object_is_valid = item
                        .get("object")
                        .is_none_or(|object| object.as_str() == Some("embedding"));
                    let index_is_valid = item
                        .get("index")
                        .is_none_or(|value| value.as_u64() == Some(index as u64));
                    object_is_valid && index_is_valid && {
                        let Some(embedding) = item.get("embedding") else {
                            return false;
                        };
                        match input_bounds.encoding_format {
                            "float" => embedding.as_array().is_some_and(|values| {
                                input_bounds
                                    .dimensions
                                    .is_none_or(|dimensions| values.len() == dimensions)
                                    && values.iter().all(Value::is_number)
                            }),
                            "base64" => embedding.as_str().is_some(),
                            _ => false,
                        }
                    }
                })
        });
    if !valid_data {
        state.failures.fetch_add(1, Ordering::Relaxed);
        return Err(ApiError::upstream());
    }
    let usage = value["usage"]["prompt_tokens"]
        .as_u64()
        .map(|prompt_tokens| {
            // Embedding requests produce no completion tokens; that zero follows
            // from the operation contract rather than missing provider evidence.
            usage_attempt.report(&json!({
                "prompt_tokens": prompt_tokens,
                "completion_tokens": 0
            }));
            (prompt_tokens, 0)
        });
    if let Some(object) = value.as_object_mut() {
        object.insert("object".to_owned(), json!("list"));
        object.insert("model".to_owned(), json!(public_model));
    }
    Ok(ProviderResponse {
        response: Json(value).into_response(),
        completed: true,
        usage,
    })
}

async fn execute_responses(
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
    let endpoint = format!("{}/responses", base.trim_end_matches('/'));
    let object = body
        .as_object_mut()
        .ok_or_else(|| ApiError::invalid_request("The request body must be a JSON object"))?;
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
    if !valid_responses_response(&value) {
        state.failures.fetch_add(1, Ordering::Relaxed);
        return Err(ApiError::upstream());
    }
    let usage = responses_usage(&value);
    if let Some((input_tokens, output_tokens)) = usage {
        usage_attempt.report(&json!({
            "prompt_tokens": input_tokens,
            "completion_tokens": output_tokens
        }));
    }
    if let Some(object) = value.as_object_mut() {
        object.insert("model".to_owned(), json!(public_model));
    }
    Ok(ProviderResponse {
        response: Json(value).into_response(),
        completed: true,
        usage,
    })
}

fn valid_responses_response(response: &Value) -> bool {
    if response
        .get("id")
        .and_then(Value::as_str)
        .is_none_or(str::is_empty)
        || response.get("object").and_then(Value::as_str) != Some("response")
        || !matches!(
            response.get("status").and_then(Value::as_str),
            Some("completed" | "incomplete")
        )
    {
        return false;
    }
    let Some(output) = response.get("output").and_then(Value::as_array) else {
        return false;
    };
    if output.is_empty() {
        return false;
    }
    let mut has_text_message = false;
    for item in output {
        match item.get("type").and_then(Value::as_str) {
            Some("reasoning") => {}
            Some("message") if item.get("role").and_then(Value::as_str) == Some("assistant") => {
                let Some(content) = item.get("content").and_then(Value::as_array) else {
                    return false;
                };
                if content.is_empty() {
                    return false;
                }
                for part in content {
                    match part.get("type").and_then(Value::as_str) {
                        Some("output_text")
                            if part.get("text").and_then(Value::as_str).is_some() =>
                        {
                            has_text_message = true;
                        }
                        Some("refusal")
                            if part.get("refusal").and_then(Value::as_str).is_some() =>
                        {
                            has_text_message = true;
                        }
                        _ => return false,
                    }
                }
            }
            _ => return false,
        }
    }
    has_text_message
}

fn responses_usage(response: &Value) -> Option<(u64, u64)> {
    response
        .get("usage")
        .and_then(|usage| {
            usage
                .get("input_tokens")
                .and_then(Value::as_u64)
                .zip(usage.get("output_tokens").and_then(Value::as_u64))
        })
        .filter(|(input, output)| *input <= i64::MAX as u64 && *output <= i64::MAX as u64)
}

struct ChatExecution<'a> {
    public_model: &'a str,
    model: &'a crate::config::ModelConfig,
    api_key: String,
    body: Value,
    messages: Value,
    native_optional_params: Option<serde_json::Map<String, Value>>,
    stream: bool,
    timeout: Duration,
    scope: niu_storage::TenantScope,
    attempt: Uuid,
}

struct StreamExecution<'a> {
    public_model: &'a str,
    model: &'a crate::config::ModelConfig,
    api_key: String,
    body: Value,
    timeout: Duration,
    scope: niu_storage::TenantScope,
    attempt: Uuid,
}

async fn execute_chat(
    state: &AppState,
    execution: ChatExecution<'_>,
) -> Result<ProviderResponse, ApiError> {
    let ChatExecution {
        public_model,
        model,
        api_key,
        body,
        messages,
        native_optional_params,
        stream,
        timeout,
        scope,
        attempt,
    } = execution;
    if stream {
        if model.provider != "openai" {
            state.failures.fetch_add(1, Ordering::Relaxed);
            return Err(ApiError::unsupported());
        }
        return stream_openai(
            state,
            StreamExecution {
                public_model,
                model,
                api_key,
                body,
                timeout,
                scope,
                attempt,
            },
        )
        .await;
    }

    if model.provider == "openai" {
        return complete_openai(state, public_model, model, api_key, body, timeout).await;
    }

    let optional_params = native_optional_params.ok_or_else(ApiError::unsupported)?;

    // The native adapter normalizes absent usage fields to zero. Treat only
    // complete, positive token counts as evidence until the adapter exposes
    // raw-field provenance; a missing counter must never become billable zero.
    let usage_attempt = state.usage.begin();
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
    let usage = validated_native_chat_usage(&value["usage"]);
    if let Some((prompt, completion)) = usage {
        usage_attempt.report(&json!({
            "prompt_tokens": prompt,
            "completion_tokens": completion
        }));
    }
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
        usage,
    })
}

fn validated_native_chat_usage(usage: &Value) -> Option<(u64, u64)> {
    let prompt = usage.get("prompt_tokens")?.as_u64()?;
    let completion = usage.get("completion_tokens")?.as_u64()?;
    let total = usage.get("total_tokens")?.as_u64()?;
    let input_text = usage
        .pointer("/prompt_tokens_details/text_tokens")?
        .as_u64()?;
    if prompt == 0
        || completion == 0
        || input_text == 0
        || prompt.checked_add(completion)? != total
        || prompt > i64::MAX as u64
        || completion > i64::MAX as u64
    {
        return None;
    }
    Some((prompt, completion))
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
    if !value.get("choices").is_some_and(Value::is_array)
        || !valid_chat_completion_features(&value, &body)
    {
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
    execution: StreamExecution<'_>,
) -> Result<ProviderResponse, ApiError> {
    let StreamExecution {
        public_model,
        model,
        api_key,
        mut body,
        timeout,
        scope,
        attempt,
    } = execution;
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

fn map_native_chat_params(
    body: &Value,
    provider: &str,
) -> Result<serde_json::Map<String, Value>, ApiError> {
    let mappings: &[(&str, &str)] = match provider {
        "anthropic" => &[
            ("max_tokens", "max_tokens"),
            ("temperature", "temperature"),
            ("top_p", "top_p"),
            ("stop", "stop_sequences"),
        ],
        "bedrock" => &[
            ("max_tokens", "maxTokens"),
            ("temperature", "temperature"),
            ("top_p", "topP"),
            ("stop", "stopSequences"),
        ],
        _ => return Err(ApiError::unsupported()),
    };
    let mut params = body
        .as_object()
        .cloned()
        .ok_or_else(|| ApiError::invalid_request("The request body must be a JSON object"))?;
    for field in ["model", "messages", "stream", "stream_options"] {
        params.remove(field);
    }
    strip_server_control_fields(&mut params);

    let mut mapped = serde_json::Map::new();
    for (name, value) in params {
        let target = mappings
            .iter()
            .find_map(|(source, target)| (*source == name).then_some(*target))
            .ok_or_else(ApiError::unsupported)?;
        let value = match name.as_str() {
            "max_tokens"
                if value
                    .as_u64()
                    .is_some_and(|tokens| (1..=1_000_000).contains(&tokens)) =>
            {
                value
            }
            "temperature"
                if value
                    .as_f64()
                    .is_some_and(|temperature| (0.0..=1.0).contains(&temperature)) =>
            {
                value
            }
            "top_p"
                if value
                    .as_f64()
                    .is_some_and(|top_p| (0.0..=1.0).contains(&top_p)) =>
            {
                value
            }
            "stop" => {
                let stops = match value {
                    Value::String(stop) if !stop.is_empty() && stop.len() <= 1000 => {
                        vec![Value::String(stop)]
                    }
                    Value::Array(stops)
                        if !stops.is_empty()
                            && stops.len() <= 4
                            && stops.iter().all(|stop| {
                                stop.as_str()
                                    .is_some_and(|stop| !stop.is_empty() && stop.len() <= 1000)
                            }) =>
                    {
                        stops
                    }
                    _ => return Err(ApiError::invalid_request("stop is invalid for this route")),
                };
                Value::Array(stops)
            }
            _ => {
                return Err(ApiError::invalid_request(
                    "A native chat parameter is invalid",
                ));
            }
        };
        mapped.insert(target.to_owned(), value);
    }
    Ok(mapped)
}

fn validate_chat_capabilities(
    body: &Value,
    model: &crate::config::ModelConfig,
    stream: bool,
) -> Result<(), ApiError> {
    let object = body
        .as_object()
        .ok_or_else(|| ApiError::invalid_request("The request body must be a JSON object"))?;

    let tool_names = if let Some(tools) = object.get("tools") {
        let Some(tools) = tools
            .as_array()
            .filter(|tools| !tools.is_empty() && tools.len() <= 128)
        else {
            return Err(ApiError::invalid_request(
                "tools must contain between 1 and 128 function definitions",
            ));
        };
        let mut names = std::collections::HashSet::with_capacity(tools.len());
        for tool in tools {
            let function = tool
                .get("function")
                .filter(|_| tool.get("type").and_then(Value::as_str) == Some("function"))
                .ok_or_else(|| ApiError::invalid_request("Each tool must be a function tool"))?;
            let name = function
                .get("name")
                .and_then(Value::as_str)
                .filter(|name| {
                    !name.is_empty()
                        && name.len() <= 64
                        && name
                            .bytes()
                            .all(|byte| byte.is_ascii_alphanumeric() || b"_-".contains(&byte))
                })
                .ok_or_else(|| {
                    ApiError::invalid_request("Each function tool needs a valid name")
                })?;
            if !names.insert(name) {
                return Err(ApiError::invalid_request(
                    "Function tool names must be unique",
                ));
            }
            if let Some(parameters) = function.get("parameters")
                && !parameters.is_object()
            {
                return Err(ApiError::invalid_request(
                    "Function tool parameters must be a JSON Schema object",
                ));
            }
            if function
                .get("strict")
                .is_some_and(|strict| !strict.is_boolean())
            {
                return Err(ApiError::invalid_request("Tool strict must be a boolean"));
            }
        }
        Some(names)
    } else {
        None
    };

    if let Some(choice) = object.get("tool_choice") {
        match choice {
            Value::String(choice) if matches!(choice.as_str(), "none" | "auto" | "required") => {
                if choice != "none" && tool_names.is_none() {
                    return Err(ApiError::invalid_request(
                        "tool_choice requires a tools array",
                    ));
                }
            }
            Value::Object(choice)
                if choice.get("type").and_then(Value::as_str) == Some("function") =>
            {
                let name = choice
                    .get("function")
                    .and_then(|function| function.get("name"))
                    .and_then(Value::as_str)
                    .ok_or_else(|| {
                        ApiError::invalid_request("tool_choice needs a function name")
                    })?;
                if !tool_names
                    .as_ref()
                    .is_some_and(|names| names.contains(name))
                {
                    return Err(ApiError::invalid_request(
                        "tool_choice must name one of the declared tools",
                    ));
                }
            }
            _ => return Err(ApiError::invalid_request("Invalid tool_choice")),
        }
    }

    let has_tool_semantics = tool_names.is_some()
        || object
            .get("messages")
            .and_then(Value::as_array)
            .is_some_and(|messages| {
                messages.iter().any(|message| {
                    message.get("role").and_then(Value::as_str) == Some("tool")
                        || message.get("tool_calls").is_some()
                })
            });
    if has_tool_semantics {
        if !model.supports_tool_calls {
            return Err(ApiError::unsupported());
        }
        if stream && !model.supports_streaming_tool_calls {
            return Err(ApiError::unsupported());
        }
    }

    if let Some(format) = object.get("response_format") {
        let format = format
            .as_object()
            .ok_or_else(|| ApiError::invalid_request("response_format must be an object"))?;
        match format.get("type").and_then(Value::as_str) {
            Some("text") => {}
            Some("json_object") => {
                if !model.supports_structured_output || stream {
                    return Err(ApiError::unsupported());
                }
            }
            Some("json_schema") => {
                let schema = format
                    .get("json_schema")
                    .and_then(Value::as_object)
                    .ok_or_else(|| {
                        ApiError::invalid_request("json_schema response format is required")
                    })?;
                if schema
                    .get("name")
                    .and_then(Value::as_str)
                    .is_none_or(|name| name.is_empty() || name.len() > 64)
                    || !schema.get("schema").is_some_and(Value::is_object)
                    || schema
                        .get("strict")
                        .is_some_and(|strict| !strict.is_boolean())
                {
                    return Err(ApiError::invalid_request(
                        "json_schema requires a name and JSON Schema object",
                    ));
                }
                if !model.supports_structured_output || stream {
                    return Err(ApiError::unsupported());
                }
            }
            _ => {
                return Err(ApiError::invalid_request(
                    "Unsupported response_format type",
                ));
            }
        }
    }

    if has_tool_semantics
        && matches!(
            body.pointer("/response_format/type")
                .and_then(Value::as_str),
            Some("json_object" | "json_schema")
        )
    {
        return Err(ApiError::unsupported());
    }

    Ok(())
}

fn valid_chat_completion_features(response: &Value, request: &Value) -> bool {
    let Some(choices) = response.get("choices").and_then(Value::as_array) else {
        return false;
    };
    let tool_names: std::collections::HashSet<&str> = request
        .get("tools")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|tool| tool.pointer("/function/name").and_then(Value::as_str))
        .collect();
    let json_mode = matches!(
        request
            .pointer("/response_format/type")
            .and_then(Value::as_str),
        Some("json_object" | "json_schema")
    );

    choices.iter().all(|choice| {
        let Some(message) = choice.get("message").filter(|value| value.is_object()) else {
            return false;
        };
        let calls = match message.get("tool_calls") {
            None | Some(Value::Null) => None,
            Some(Value::Array(calls)) if !calls.is_empty() => Some(calls),
            _ => return false,
        };
        if choice.get("finish_reason").and_then(Value::as_str) == Some("tool_calls")
            && calls.is_none()
        {
            return false;
        }
        if let Some(calls) = calls {
            if tool_names.is_empty()
                || choice.get("finish_reason").and_then(Value::as_str) != Some("tool_calls")
            {
                return false;
            }
            for call in calls {
                let Some(name) = call.pointer("/function/name").and_then(Value::as_str) else {
                    return false;
                };
                if call.get("type").and_then(Value::as_str) != Some("function")
                    || call
                        .get("id")
                        .and_then(Value::as_str)
                        .is_none_or(str::is_empty)
                    || !tool_names.contains(name)
                    || call
                        .pointer("/function/arguments")
                        .and_then(Value::as_str)
                        .and_then(|arguments| serde_json::from_str::<Value>(arguments).ok())
                        .is_none_or(|arguments| !arguments.is_object())
                {
                    return false;
                }
            }
        }
        if json_mode && message.get("refusal").and_then(Value::as_str).is_none() {
            let Some(content) = message.get("content").and_then(Value::as_str) else {
                return false;
            };
            if serde_json::from_str::<Value>(content).is_err() {
                return false;
            }
        }
        true
    })
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
    use sqlx::PgPool;
    use tokio::net::TcpListener;
    use tower::ServiceExt;
    use uuid::Uuid;

    use crate::{
        config::AppConfig,
        state::{AppState, TokenSet},
    };

    use super::{
        responses_usage, router, valid_chat_completion_features, valid_responses_response,
        validate_chat_capabilities, validate_embedding_request, validate_responses_request,
    };

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

    async fn tool_provider(
        State(captured): State<Captured>,
        headers: HeaderMap,
        Json(body): Json<Value>,
    ) -> Json<Value> {
        let response = if body.get("response_format").is_some() {
            let content =
                if body.pointer("/response_format/json_schema/name") == Some(&json!("invalid")) {
                    "not-json"
                } else {
                    "{\"answer\":42}"
                };
            json!({
                "id": "upstream-structured-response",
                "model": "provider-secret-model",
                "choices": [{
                    "index": 0,
                    "message": {"role": "assistant", "content": content},
                    "finish_reason": "stop"
                }],
                "usage": {"prompt_tokens": 11, "completion_tokens": 3, "total_tokens": 14}
            })
        } else {
            json!({
                "id": "upstream-tool-response",
                "model": "provider-secret-model",
                "choices": [{
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": null,
                        "tool_calls": [{
                            "id": "call_weather_1",
                            "type": "function",
                            "function": {
                                "name": "lookup_weather",
                                "arguments": "{\"city\":\"Paris\"}"
                            }
                        }]
                    },
                    "finish_reason": "tool_calls"
                }],
                "usage": {"prompt_tokens": 19, "completion_tokens": 8, "total_tokens": 27}
            })
        };
        *captured.0.lock().expect("capture mutex") = Some((headers, body));
        Json(response)
    }

    fn tool_stream_payload() -> Vec<u8> {
        let events = [
            json!({"choices":[{"index":0,"delta":{"role":"assistant","tool_calls":[{"index":0,"id":"call_weather_1","type":"function","function":{"name":"lookup_weather","arguments":"{\"city\":"}}]}}]}),
            json!({"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\"Paris\"}"}}]},"finish_reason":null}]}),
            json!({"choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}),
            json!({"choices":[],"usage":{"prompt_tokens":19,"completion_tokens":8,"total_tokens":27}}),
        ];
        let mut payload = events
            .iter()
            .map(|event| format!("data: {event}\n\n"))
            .collect::<String>();
        payload.push_str("data: [DONE]\n\n");
        payload.into_bytes()
    }

    async fn streaming_tool_provider(
        State(captured): State<Captured>,
        headers: HeaderMap,
        Json(body): Json<Value>,
    ) -> (
        [(axum::http::header::HeaderName, &'static str); 1],
        axum::body::Body,
    ) {
        *captured.0.lock().expect("capture mutex") = Some((headers, body));
        let payload = tool_stream_payload();
        let chunks = payload
            .chunks(17)
            .map(|chunk| Ok::<_, std::io::Error>(axum::body::Bytes::copy_from_slice(chunk)))
            .collect::<Vec<_>>();
        (
            [(axum::http::header::CONTENT_TYPE, "text/event-stream")],
            axum::body::Body::from_stream(futures_util::stream::iter(chunks)),
        )
    }

    async fn responses_provider(
        State(captured): State<Captured>,
        headers: HeaderMap,
        Json(body): Json<Value>,
    ) -> Json<Value> {
        let output = if body.get("input").and_then(Value::as_str) == Some("broken") {
            json!([{
                "id":"call_1","type":"function_call","call_id":"call_1",
                "name":"unconfigured_tool","arguments":"{}"
            }])
        } else {
            json!([{
                "id":"msg_1","type":"message","status":"completed","role":"assistant",
                "content":[{"type":"output_text","text":"Hello from Responses","annotations":[]}]
            }])
        };
        *captured.0.lock().expect("capture mutex") = Some((headers, body));
        Json(json!({
            "id":"resp_test_1","object":"response","status":"completed",
            "created_at":1750000000,"model":"provider-secret-model","output":output,
            "usage":{"input_tokens":4,"output_tokens":2,"total_tokens":6}
        }))
    }

    async fn embedding_provider(
        State(captured): State<Captured>,
        headers: HeaderMap,
        Json(body): Json<Value>,
    ) -> Json<Value> {
        let item_count = match body.get("input") {
            Some(Value::Array(items)) => items.len(),
            Some(Value::String(_)) => 1,
            _ => 0,
        };
        let dimensions = body.get("dimensions").and_then(Value::as_u64).unwrap_or(2) as usize;
        let base64 = body.get("encoding_format").and_then(Value::as_str) == Some("base64");
        let data = (0..item_count)
            .map(|index| {
                json!({
                    "object": "embedding",
                    "index": index,
                    "embedding": if base64 { json!("AA==") } else { json!(vec![0.1; dimensions]) }
                })
            })
            .collect::<Vec<_>>();
        *captured.0.lock().expect("capture mutex") = Some((headers, body));
        Json(json!({
            "object": "list",
            "data": data,
            "model": "provider-secret-model",
            "usage": {"prompt_tokens": 5, "total_tokens": 5}
        }))
    }

    fn test_state(api_base: Option<String>, pool: sqlx::PgPool) -> AppState {
        let mut config: AppConfig = toml::from_str(
            r#"
                [models.fast]
                provider = "openai"
                upstream_model = "provider-secret-model"
                api_key_env = "PROVIDER_KEY"
                supports_embeddings = true
                supports_embedding_dimensions = true
                supports_embedding_base64 = true
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

    #[test]
    fn chat_feature_contracts_validate_input_and_provider_output() {
        let mut config: crate::config::AppConfig = toml::from_str(
            r#"
                [models.fast]
                provider = "openai"
                upstream_model = "provider-model"
                api_key_env = "PROVIDER_KEY"
                supports_tool_calls = true
                supports_streaming_tool_calls = true
                supports_structured_output = true
            "#,
        )
        .unwrap();
        let model = config.models.get_mut("fast").unwrap();
        let tools = json!({
            "model": "fast",
            "messages": [{"role":"user","content":"Weather in Paris?"}],
            "tools": [{
                "type": "function",
                "function": {"name":"lookup_weather","parameters":{"type":"object"}}
            }],
            "tool_choice": {"type":"function","function":{"name":"lookup_weather"}}
        });
        assert!(validate_chat_capabilities(&tools, model, false).is_ok());
        assert!(validate_chat_capabilities(&tools, model, true).is_ok());

        let tool_response = json!({"choices":[{
            "message":{"role":"assistant","content":null,"tool_calls":[{
                "id":"call_weather_1","type":"function","function":{
                    "name":"lookup_weather","arguments":"{\"city\":\"Paris\"}"
                }
            }]},"finish_reason":"tool_calls"
        }]});
        assert!(valid_chat_completion_features(&tool_response, &tools));

        let mut unknown_tool = tool_response.clone();
        unknown_tool["choices"][0]["message"]["tool_calls"][0]["function"]["name"] =
            json!("send_secret");
        assert!(!valid_chat_completion_features(&unknown_tool, &tools));
        let mut invalid_arguments = tool_response.clone();
        invalid_arguments["choices"][0]["message"]["tool_calls"][0]["function"]["arguments"] =
            json!("not-json");
        assert!(!valid_chat_completion_features(&invalid_arguments, &tools));

        let structured = json!({
            "model":"fast",
            "messages":[{"role":"user","content":"Return a JSON object"}],
            "response_format":{"type":"json_schema","json_schema":{
                "name":"answer","schema":{"type":"object","required":["answer"]},"strict":true
            }}
        });
        assert!(validate_chat_capabilities(&structured, model, false).is_ok());
        assert!(validate_chat_capabilities(&structured, model, true).is_err());
        assert!(valid_chat_completion_features(
            &json!({"choices":[{"message":{"content":"{\"answer\":42}"}}]}),
            &structured
        ));
        assert!(!valid_chat_completion_features(
            &json!({"choices":[{"message":{"content":"not-json"}}]}),
            &structured
        ));

        let duplicate_tools = json!({
            "model":"fast","messages":[{"role":"user","content":"hi"}],
            "tools":[
                {"type":"function","function":{"name":"same"}},
                {"type":"function","function":{"name":"same"}}
            ]
        });
        assert!(validate_chat_capabilities(&duplicate_tools, model, false).is_err());
        let unknown_choice = json!({
            "model":"fast","messages":[{"role":"user","content":"hi"}],
            "tools":[{"type":"function","function":{"name":"known"}}],
            "tool_choice":{"type":"function","function":{"name":"unknown"}}
        });
        assert!(validate_chat_capabilities(&unknown_choice, model, false).is_err());

        model.supports_tool_calls = false;
        assert!(validate_chat_capabilities(&tools, model, false).is_err());
        model.supports_tool_calls = true;
        model.supports_streaming_tool_calls = false;
        assert!(validate_chat_capabilities(&tools, model, true).is_err());
    }

    #[test]
    fn responses_contract_bounds_text_inputs_and_validates_output_items() {
        let price = crate::config::RoutePricing {
            currency: "USD".into(),
            api_prompt_rate: 1_000_000,
            api_completion_rate: 1_000_000,
            cash_prompt_rate: 1_000_000,
            cash_completion_rate: 1_000_000,
            max_input_tokens: 20,
            max_output_tokens: 10,
        };
        let mut body = json!({
            "model":"fast","input":"hi","instructions":"Be terse",
            "temperature":0.5,"top_p":0.9,
            "metadata":{"source":"test"},"user":"account-1"
        });
        let bounds = validate_responses_request(&mut body, Some(&price)).unwrap();
        assert_eq!(bounds.input_bytes, 10);
        assert_eq!(bounds.max_output_tokens, Some(10));
        assert_eq!(body["max_output_tokens"], 10);

        let response = json!({
            "id":"resp_1","object":"response","status":"completed",
            "output":[
                {"id":"reasoning_1","type":"reasoning","summary":[]},
                {"id":"msg_1","type":"message","role":"assistant","content":[
                    {"type":"output_text","text":"hello","annotations":[]}
                ]}
            ],
            "usage":{"input_tokens":3,"output_tokens":2,"total_tokens":5}
        });
        assert!(valid_responses_response(&response));
        assert_eq!(responses_usage(&response), Some((3, 2)));
        let mut invalid_output = response.clone();
        invalid_output["output"][0]["type"] = json!("function_call");
        assert!(!valid_responses_response(&invalid_output));
        let mut invalid_text = response.clone();
        invalid_text["output"][1]["content"][0]["text"] = json!(false);
        assert!(!valid_responses_response(&invalid_text));

        for invalid in [
            json!({"model":"fast","input":[{"role":"user","content":"hi"}]}),
            json!({"model":"fast","input":"hi","stream":true}),
            json!({"model":"fast","input":"hi","max_output_tokens":11}),
            json!({"model":"fast","input":"hi","tools":[]}),
            json!({"model":"fast","input":"hi","temperature":3}),
            json!({"model":"fast","input":"hi","metadata":{"bad":["value"]}}),
        ] {
            let mut invalid = invalid;
            assert!(
                validate_responses_request(&mut invalid, Some(&price)).is_err(),
                "accepted {invalid}"
            );
        }
    }

    #[sqlx::test(migrations = "../../crates/storage/migrations")]
    #[ignore = "requires PostgreSQL"]
    async fn tool_calls_require_route_opt_in_and_persist_provider_usage(pool: PgPool) {
        let captured = Captured::default();
        let upstream = Router::new()
            .route("/v1/chat/completions", post(tool_provider))
            .with_state(captured.clone());
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let task = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
        let mut state = test_state(Some(format!("http://{address}/v1")), pool.clone());
        let route = Arc::make_mut(&mut state.config)
            .models
            .get_mut("fast")
            .unwrap();
        route.supports_tool_calls = true;
        route.supports_structured_output = true;
        let organization = state.store.create_organization("tool calls").await.unwrap();
        let scope = state
            .store
            .create_project(organization, "project")
            .await
            .unwrap();
        let key = state
            .store
            .issue_key(scope, "client", &["fast".into()], 3600)
            .await
            .unwrap();
        let request = json!({
            "model":"fast",
            "messages":[{"role":"user","content":"What is the weather in Paris?"}],
            "tools":[{"type":"function","function":{
                "name":"lookup_weather","description":"Look up current weather",
                "parameters":{"type":"object","properties":{"city":{"type":"string"}},"required":["city"]}
            }}],
            "tool_choice":"required"
        });
        let response = router(state.clone())
            .oneshot(
                Request::post("/v1/chat/completions")
                    .header("authorization", format!("Bearer {}", key.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(request.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let attempt_id: Uuid = response.headers()["x-niu-attempt-id"]
            .to_str()
            .unwrap()
            .parse()
            .unwrap();
        let body: Value =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        assert_eq!(body["model"], "fast");
        assert_eq!(body["choices"][0]["finish_reason"], "tool_calls");
        assert_eq!(
            body["choices"][0]["message"]["tool_calls"][0]["function"]["name"],
            "lookup_weather"
        );

        let (headers, forwarded) = captured.0.lock().unwrap().take().unwrap();
        assert_eq!(headers["authorization"], "Bearer provider-secret-token");
        assert_eq!(forwarded["model"], "provider-secret-model");
        assert_eq!(forwarded["tools"], request["tools"]);
        assert_eq!(forwarded["tool_choice"], "required");
        let attempt = state
            .store
            .attempt(scope, attempt_id)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(attempt.execution, "confirmed_completed");
        assert_eq!(attempt.usage_confidence, "provider_reported");
        assert_eq!(
            (attempt.prompt_tokens, attempt.completion_tokens),
            (Some(19), Some(8))
        );

        let structured_request = json!({
            "model":"fast",
            "messages":[{"role":"user","content":"Return the answer as JSON"}],
            "response_format":{"type":"json_schema","json_schema":{
                "name":"answer","schema":{"type":"object","required":["answer"]},"strict":true
            }}
        });
        let structured = router(state.clone())
            .oneshot(
                Request::post("/v1/chat/completions")
                    .header("authorization", format!("Bearer {}", key.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(structured_request.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(structured.status(), StatusCode::OK);
        let structured_attempt: Uuid = structured.headers()["x-niu-attempt-id"]
            .to_str()
            .unwrap()
            .parse()
            .unwrap();
        let structured_body: Value =
            serde_json::from_slice(&structured.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        assert_eq!(
            structured_body["choices"][0]["message"]["content"],
            "{\"answer\":42}"
        );
        let (_, forwarded_schema) = captured.0.lock().unwrap().take().unwrap();
        assert_eq!(forwarded_schema["model"], "provider-secret-model");
        assert_eq!(
            forwarded_schema["response_format"],
            structured_request["response_format"]
        );
        let structured_persisted = state
            .store
            .attempt(scope, structured_attempt)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(structured_persisted.execution, "confirmed_completed");
        assert_eq!(structured_persisted.prompt_tokens, Some(11));

        let mut malformed_schema_request = structured_request;
        malformed_schema_request["response_format"]["json_schema"]["name"] = json!("invalid");
        let malformed = router(state.clone())
            .oneshot(
                Request::post("/v1/chat/completions")
                    .header("authorization", format!("Bearer {}", key.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(malformed_schema_request.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(malformed.status(), StatusCode::BAD_GATEWAY);
        let unknown_attempts: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM attempts WHERE execution = 'may_have_executed' AND usage_confidence = 'unknown'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(unknown_attempts, 1);
        let (_, malformed_forwarded) = captured.0.lock().unwrap().take().unwrap();
        assert_eq!(
            malformed_forwarded["response_format"]["json_schema"]["name"],
            "invalid"
        );

        Arc::make_mut(&mut state.config)
            .models
            .get_mut("fast")
            .unwrap()
            .supports_tool_calls = false;
        let gated = router(state.clone())
            .oneshot(
                Request::post("/v1/chat/completions")
                    .header("authorization", format!("Bearer {}", key.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(request.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(gated.status(), StatusCode::NOT_IMPLEMENTED);
        let attempts: i64 = sqlx::query_scalar("SELECT count(*) FROM attempts")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(attempts, 3);
        assert!(captured.0.lock().unwrap().is_none());
        task.abort();
    }

    #[sqlx::test(migrations = "../../crates/storage/migrations")]
    #[ignore = "requires PostgreSQL"]
    async fn streaming_tool_deltas_preserve_wire_bytes_and_terminal_usage(pool: PgPool) {
        let captured = Captured::default();
        let upstream = Router::new()
            .route("/v1/chat/completions", post(streaming_tool_provider))
            .with_state(captured.clone());
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let task = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
        let mut state = test_state(Some(format!("http://{address}/v1")), pool);
        let route = Arc::make_mut(&mut state.config)
            .models
            .get_mut("fast")
            .unwrap();
        route.supports_tool_calls = true;
        route.supports_streaming_tool_calls = true;
        let organization = state
            .store
            .create_organization("streaming tools")
            .await
            .unwrap();
        let scope = state
            .store
            .create_project(organization, "project")
            .await
            .unwrap();
        let key = state
            .store
            .issue_key(scope, "client", &["fast".into()], 3600)
            .await
            .unwrap();
        let request = json!({
            "model":"fast","stream":true,"stream_options":{"include_usage":true},
            "messages":[{"role":"user","content":"What is the weather in Paris?"}],
            "tools":[{"type":"function","function":{
                "name":"lookup_weather","parameters":{"type":"object"}
            }}],
            "tool_choice":"required"
        });
        let response = router(state.clone())
            .oneshot(
                Request::post("/v1/chat/completions")
                    .header("authorization", format!("Bearer {}", key.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(request.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()["content-type"], "text/event-stream");
        let attempt_id: Uuid = response.headers()["x-niu-attempt-id"]
            .to_str()
            .unwrap()
            .parse()
            .unwrap();
        let output = response.into_body().collect().await.unwrap().to_bytes();
        assert_eq!(output.as_ref(), tool_stream_payload().as_slice());

        let (headers, forwarded) = captured.0.lock().unwrap().take().unwrap();
        assert_eq!(headers["authorization"], "Bearer provider-secret-token");
        assert_eq!(forwarded["model"], "provider-secret-model");
        assert_eq!(forwarded["tools"], request["tools"]);
        assert_eq!(forwarded["stream_options"]["include_usage"], true);
        let attempt = state
            .store
            .attempt(scope, attempt_id)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(attempt.execution, "confirmed_completed");
        assert_eq!(attempt.usage_confidence, "provider_reported");
        assert_eq!(
            (attempt.prompt_tokens, attempt.completion_tokens),
            (Some(19), Some(8))
        );
        task.abort();
    }

    #[sqlx::test(migrations = "../../crates/storage/migrations")]
    #[ignore = "requires PostgreSQL"]
    async fn responses_are_opt_in_text_only_and_persist_reported_usage(pool: PgPool) {
        let captured = Captured::default();
        let upstream = Router::new()
            .route("/v1/responses", post(responses_provider))
            .with_state(captured.clone());
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let task = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
        let mut state = test_state(Some(format!("http://{address}/v1")), pool.clone());
        let route = Arc::make_mut(&mut state.config)
            .models
            .get_mut("fast")
            .unwrap();
        route.supports_responses = true;
        route.pricing = Some(crate::config::RoutePricing {
            currency: "USD".into(),
            api_prompt_rate: 1_000_000,
            api_completion_rate: 1_000_000,
            cash_prompt_rate: 1_000_000,
            cash_completion_rate: 1_000_000,
            max_input_tokens: 32,
            max_output_tokens: 10,
        });
        let organization = state.store.create_organization("responses").await.unwrap();
        let scope = state
            .store
            .create_project(organization, "project")
            .await
            .unwrap();
        state.store.create_budget(scope, "USD", 100).await.unwrap();
        let key = state
            .store
            .issue_key(scope, "client", &["fast".into()], 3600)
            .await
            .unwrap();
        let request = json!({
            "model":"fast","input":"hi","instructions":"Be helpful",
            "metadata":{"source":"integration-test"}
        });
        let response = router(state.clone())
            .oneshot(
                Request::post("/v1/responses")
                    .header("authorization", format!("Bearer {}", key.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(request.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let attempt_id: Uuid = response.headers()["x-niu-attempt-id"]
            .to_str()
            .unwrap()
            .parse()
            .unwrap();
        let body: Value =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        assert_eq!(body["model"], "fast");
        assert_eq!(
            body["output"][0]["content"][0]["text"],
            "Hello from Responses"
        );
        assert_eq!(body["usage"]["input_tokens"], 4);
        let (headers, forwarded) = captured.0.lock().unwrap().take().unwrap();
        assert_eq!(headers["authorization"], "Bearer provider-secret-token");
        assert_eq!(forwarded["model"], "provider-secret-model");
        assert_eq!(forwarded["input"], "hi");
        assert_eq!(forwarded["max_output_tokens"], 10);
        let attempt = state
            .store
            .attempt(scope, attempt_id)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(attempt.execution, "confirmed_completed");
        assert_eq!(attempt.usage_confidence, "provider_reported");
        assert_eq!(
            (attempt.prompt_tokens, attempt.completion_tokens),
            (Some(4), Some(2))
        );
        let budget = state.store.budget(scope).await.unwrap().unwrap();
        assert_eq!((budget.spent_nanos, budget.reserved_nanos), (6, 0));

        let invalid_output = router(state.clone())
            .oneshot(
                Request::post("/v1/responses")
                    .header("authorization", format!("Bearer {}", key.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(
                        json!({"model":"fast","input":"broken"}).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(invalid_output.status(), StatusCode::BAD_GATEWAY);
        let malformed_attempt: Uuid = invalid_output.headers()["x-niu-attempt-id"]
            .to_str()
            .unwrap()
            .parse()
            .unwrap();
        let unresolved = state
            .store
            .attempt(scope, malformed_attempt)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(unresolved.execution, "may_have_executed");
        assert_eq!(unresolved.usage_confidence, "unknown");
        let (_, malformed_forwarded) = captured.0.lock().unwrap().take().unwrap();
        assert_eq!(malformed_forwarded["input"], "broken");

        let streaming = router(state.clone())
            .oneshot(
                Request::post("/v1/responses")
                    .header("authorization", format!("Bearer {}", key.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(
                        json!({"model":"fast","input":"hi","stream":true}).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(streaming.status(), StatusCode::NOT_IMPLEMENTED);
        Arc::make_mut(&mut state.config)
            .models
            .get_mut("fast")
            .unwrap()
            .supports_responses = false;
        let disabled = router(state.clone())
            .oneshot(
                Request::post("/v1/responses")
                    .header("authorization", format!("Bearer {}", key.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(
                        json!({"model":"fast","input":"hi"}).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(disabled.status(), StatusCode::NOT_IMPLEMENTED);
        let attempts: i64 = sqlx::query_scalar("SELECT count(*) FROM attempts")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(attempts, 2);
        task.abort();
    }

    #[test]
    fn embedding_request_validation_rejects_unsupported_shapes() {
        for body in [
            json!({"model":"fast"}),
            json!({"model":"fast","input":[]}),
            json!({"model":"fast","input":["hello",[1,2,3]]}),
            json!({"model":"fast","input":"hello","encoding_format":"binary"}),
            json!({"model":"fast","input":"hello","dimensions":0}),
            json!({"model":"fast","input":"hello","stream":true}),
        ] {
            assert!(
                validate_embedding_request(&body).is_err(),
                "accepted {body}"
            );
        }
        let bounds = validate_embedding_request(&json!({
            "model":"fast","input":["hello","你好"],"dimensions":3,"encoding_format":"float"
        }))
        .unwrap();
        assert_eq!(bounds.item_count, 2);
        assert_eq!(bounds.utf8_bytes, 11);
        assert_eq!(bounds.dimensions, Some(3));
        assert_eq!(bounds.encoding_format, "float");
    }

    #[sqlx::test(migrations = "../../crates/storage/migrations")]
    #[ignore = "requires PostgreSQL"]
    async fn embeddings_use_scoped_admission_and_settle_input_usage(pool: PgPool) {
        let captured = Captured::default();
        let upstream = Router::new()
            .route("/v1/embeddings", post(embedding_provider))
            .with_state(captured.clone());
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
            api_prompt_rate: 3_000_000,
            api_completion_rate: 4_000_000,
            cash_prompt_rate: 1_000_000,
            cash_completion_rate: 2_000_000,
            max_input_tokens: 10,
            max_output_tokens: 8,
        });
        let org = state.store.create_organization("embeddings").await.unwrap();
        let scope = state.store.create_project(org, "embeddings").await.unwrap();
        state.store.create_budget(scope, "USD", 20).await.unwrap();
        let key = state
            .store
            .issue_key(scope, "client", &["fast".into()], 3600)
            .await
            .unwrap();
        let app = router(state.clone());
        let response = app
            .clone()
            .oneshot(
                Request::post("/v1/embeddings")
                    .header("authorization", format!("Bearer {}", key.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(
                        json!({"model":"fast","input":"hello","dimensions":2}).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let attempt_id: Uuid = response.headers()["x-niu-attempt-id"]
            .to_str()
            .unwrap()
            .parse()
            .unwrap();
        let output: Value =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        assert_eq!(output["model"], "fast");
        assert_eq!(output["data"][0]["embedding"], json!([0.1, 0.1]));
        assert_eq!(output["usage"]["prompt_tokens"], 5);

        let (headers, upstream_body) = captured.0.lock().unwrap().take().unwrap();
        assert_eq!(headers["authorization"], "Bearer provider-secret-token");
        assert_eq!(upstream_body["model"], "provider-secret-model");
        assert_eq!(upstream_body["input"], "hello");
        assert_eq!(upstream_body["dimensions"], 2);

        let batch = app
            .oneshot(
                Request::post("/v1/embeddings")
                    .header("authorization", format!("Bearer {}", key.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(
                        json!({
                            "model":"fast",
                            "input":["hi", "there"],
                            "encoding_format":"base64"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(batch.status(), StatusCode::OK);
        let batch_output: Value =
            serde_json::from_slice(&batch.into_body().collect().await.unwrap().to_bytes()).unwrap();
        assert_eq!(batch_output["data"].as_array().unwrap().len(), 2);
        assert_eq!(batch_output["data"][1]["index"], 1);
        assert_eq!(batch_output["data"][1]["embedding"], "AA==");
        let (_, batch_body) = captured.0.lock().unwrap().take().unwrap();
        assert_eq!(batch_body["input"], json!(["hi", "there"]));
        assert_eq!(batch_body["encoding_format"], "base64");

        let attempt = state
            .store
            .attempt(scope, attempt_id)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(attempt.execution, "confirmed_completed");
        assert_eq!(attempt.usage_confidence, "provider_reported");
        assert_eq!(
            (attempt.prompt_tokens, attempt.completion_tokens),
            (Some(5), Some(0))
        );
        let budget = state.store.budget(scope).await.unwrap().unwrap();
        assert_eq!((budget.spent_nanos, budget.reserved_nanos), (10, 0));
        let entries = state.store.cost_entries(scope, None, 10).await.unwrap();
        assert_eq!(entries.len(), 2);
        assert!(entries.iter().all(|entry| {
            (entry.cash_nanos, entry.api_equivalent_nanos) == (5, 15)
                && (entry.usage_prompt_tokens, entry.usage_completion_tokens) == (5, 0)
        }));
        task.abort();
    }

    #[sqlx::test(migrations = "../../crates/storage/migrations")]
    #[ignore = "requires PostgreSQL"]
    async fn embeddings_require_declared_openai_capability_before_creating_attempt(pool: PgPool) {
        let mut state = test_state(None, pool.clone());
        Arc::make_mut(&mut state.config)
            .models
            .get_mut("fast")
            .unwrap()
            .supports_embeddings = false;
        let org = state
            .store
            .create_organization("unsupported embeddings")
            .await
            .unwrap();
        let scope = state
            .store
            .create_project(org, "unsupported")
            .await
            .unwrap();
        let key = state
            .store
            .issue_key(scope, "client", &["fast".into()], 3600)
            .await
            .unwrap();
        let response = router(state.clone())
            .oneshot(
                Request::post("/v1/embeddings")
                    .header("authorization", format!("Bearer {}", key.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(
                        json!({"model":"fast","input":"hello"}).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_IMPLEMENTED);
        {
            let route = Arc::make_mut(&mut state.config)
                .models
                .get_mut("fast")
                .unwrap();
            route.supports_embeddings = true;
            route.supports_embedding_dimensions = false;
        }
        let unsupported_dimensions = router(state.clone())
            .oneshot(
                Request::post("/v1/embeddings")
                    .header("authorization", format!("Bearer {}", key.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(
                        json!({"model":"fast","input":"hello","dimensions":2}).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(unsupported_dimensions.status(), StatusCode::NOT_IMPLEMENTED);
        {
            let route = Arc::make_mut(&mut state.config)
                .models
                .get_mut("fast")
                .unwrap();
            route.supports_embedding_dimensions = true;
            route.supports_embedding_base64 = false;
        }
        let unsupported_encoding = router(state.clone())
            .oneshot(
                Request::post("/v1/embeddings")
                    .header("authorization", format!("Bearer {}", key.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(
                        json!({"model":"fast","input":"hello","encoding_format":"base64"})
                            .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(unsupported_encoding.status(), StatusCode::NOT_IMPLEMENTED);
        {
            let route = Arc::make_mut(&mut state.config)
                .models
                .get_mut("fast")
                .unwrap();
            route.supports_embedding_base64 = true;
            route.provider = "anthropic".into();
        }
        let unsupported_provider = router(state.clone())
            .oneshot(
                Request::post("/v1/embeddings")
                    .header("authorization", format!("Bearer {}", key.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(
                        json!({"model":"fast","input":"hello"}).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(unsupported_provider.status(), StatusCode::NOT_IMPLEMENTED);
        assert_eq!(state.requests.load(std::sync::atomic::Ordering::Relaxed), 0);
        let operations: i64 = sqlx::query_scalar("SELECT count(*) FROM operations")
            .fetch_one(&pool)
            .await
            .unwrap();
        let attempts: i64 = sqlx::query_scalar("SELECT count(*) FROM attempts")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!((operations, attempts), (0, 0));
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

    #[tokio::test]
    async fn benchmark_analysis_is_admin_only_and_does_not_dispatch_work() {
        let app = router(test_state(
            None,
            sqlx::postgres::PgPoolOptions::new()
                .connect_lazy("postgres://localhost/unused")
                .unwrap(),
        ));
        let fixture = include_str!("../../../contracts/fixtures/paired-experiment.v1.json");
        let unauthorized = app
            .clone()
            .oneshot(
                Request::post("/admin/v1/benchmarks/compare")
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(fixture.to_owned()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(unauthorized.status(), StatusCode::UNAUTHORIZED);

        let response = app
            .clone()
            .oneshot(
                Request::post("/admin/v1/benchmarks/compare")
                    .header(
                        "authorization",
                        "Bearer niu-test-admin-token-that-is-long-1234",
                    )
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(fixture.to_owned()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let report: Value =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        assert_eq!(report["data"]["evidence_kind"], "paired_experiment");
        assert_eq!(report["data"]["total_cash_nanos"], "630");
        assert_eq!(report["data"]["pairs"].as_array().unwrap().len(), 3);

        let mut invalid: Value = serde_json::from_str(fixture).unwrap();
        invalid["opt_in"] = Value::Bool(false);
        let rejected = app
            .oneshot(
                Request::post("/admin/v1/benchmarks/compare")
                    .header(
                        "authorization",
                        "Bearer niu-test-admin-token-that-is-long-1234",
                    )
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(invalid.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(rejected.status(), StatusCode::BAD_REQUEST);
    }

    #[sqlx::test(migrations = "../../crates/storage/migrations")]
    #[ignore = "requires PostgreSQL"]
    async fn quota_import_is_authorized_idempotent_and_scoped(pool: sqlx::PgPool) {
        let state = test_state(None, pool.clone());
        let scope = state.store.default_workspace().await.unwrap();
        let other = state
            .store
            .create_project(scope.organization_id, "other")
            .await
            .unwrap();
        let account = state
            .store
            .create_account(
                scope,
                &niu_storage::AccountInput {
                    provider: "fixture".into(),
                    plan: "monthly".into(),
                    authentication_mode: niu_storage::AuthMode::ApiKey,
                    billing_mode: niu_storage::BillingMode::Subscription,
                    credential_reference: "env:FIXTURE".into(),
                    concurrency_limit: 1,
                },
            )
            .await
            .unwrap();
        let key = state
            .store
            .issue_key(scope, "client", &["fast".into()], 3600)
            .await
            .unwrap();
        let store = state.store.clone();
        let collector = store
            .issue_collector_key(scope, "collector", 3600)
            .await
            .unwrap();
        let app = router(state);
        let path = format!(
            "/admin/v1/organizations/{}/projects/{}/accounts/{account}/quota",
            scope.organization_id, scope.project_id
        );
        let wrong_path = format!(
            "/admin/v1/organizations/{}/projects/{}/accounts/{account}/quota",
            scope.organization_id, other.project_id
        );
        let body = json!({"schema_version":1, "window_key":"monthly", "unit":"tokens", "remaining":i64::MAX, "maximum":null,
            "observed_at_ms":1, "valid_until_ms":2, "resets_at_ms":3, "source":"fixture"});
        let admin = "Bearer niu-test-admin-token-that-is-long-1234".to_string();
        let mut id = None;
        for (url, auth, payload, expected) in [
            (
                path.clone(),
                format!("Bearer {}", key.token),
                body.clone(),
                StatusCode::UNAUTHORIZED,
            ),
            (
                wrong_path.clone(),
                admin.clone(),
                body.clone(),
                StatusCode::CONFLICT,
            ),
            (
                path.clone(),
                format!("Bearer {}", collector.token),
                body.clone(),
                StatusCode::CREATED,
            ),
            (
                wrong_path.clone(),
                format!("Bearer {}", collector.token),
                body.clone(),
                StatusCode::UNAUTHORIZED,
            ),
            (
                path.clone(),
                admin.clone(),
                body.clone(),
                StatusCode::CREATED,
            ),
            (
                path.clone(),
                admin.clone(),
                body.clone(),
                StatusCode::CREATED,
            ),
            (
                path.clone(),
                admin.clone(),
                {
                    let mut b = body.clone();
                    b["remaining"] = json!(0);
                    b
                },
                StatusCode::CONFLICT,
            ),
            (
                path.clone(),
                admin.clone(),
                {
                    let mut b = body.clone();
                    b["remaining"] = json!(-1);
                    b
                },
                StatusCode::BAD_REQUEST,
            ),
        ] {
            let response = app
                .clone()
                .oneshot(
                    Request::post(url)
                        .header("authorization", auth)
                        .header("content-type", "application/json")
                        .body(axum::body::Body::from(payload.to_string()))
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), expected);
            if expected == StatusCode::CREATED {
                let response: Value = serde_json::from_slice(
                    &response.into_body().collect().await.unwrap().to_bytes(),
                )
                .unwrap();
                if let Some(previous) = &id {
                    assert_eq!(previous, &response["id"]);
                }
                id = Some(response["id"].clone());
            }
        }
        for url in [
            "/v1/models".to_string(),
            "/admin/v1/organizations".to_string(),
            path.clone(),
        ] {
            let response = app
                .clone()
                .oneshot(
                    Request::get(url)
                        .header("authorization", format!("Bearer {}", collector.token))
                        .body(axum::body::Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        }
        store
            .revoke_collector_key(scope, collector.id)
            .await
            .unwrap();
        let response = app
            .clone()
            .oneshot(
                Request::post(&path)
                    .header("authorization", format!("Bearer {}", collector.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        let expired = store
            .issue_collector_key(scope, "expired", 3600)
            .await
            .unwrap();
        sqlx::query("UPDATE collector_keys SET expires_at=now()-interval '1 second' WHERE id=$1")
            .bind(expired.id)
            .execute(&pool)
            .await
            .unwrap();
        let response = app
            .clone()
            .oneshot(
                Request::post(&path)
                    .header("authorization", format!("Bearer {}", expired.token))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        let response = app
            .oneshot(
                Request::get(path)
                    .header("authorization", admin)
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let response: Value =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        assert_eq!(response["data"][0]["remaining"], i64::MAX.to_string());
        assert_eq!(response["data"][0]["fresh"], false);
        let count: i64 = sqlx::query_scalar("SELECT count(*) FROM quota_observations")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 1);
    }

    #[sqlx::test(migrations = "../../crates/storage/migrations")]
    #[ignore = "requires PostgreSQL"]
    async fn execution_import_api_is_scoped_and_read_only(pool: sqlx::PgPool) {
        let state = test_state(None, pool.clone());
        let org = state.store.create_organization("imports").await.unwrap();
        let a = state.store.create_project(org, "a").await.unwrap();
        let b = state.store.create_project(org, "b").await.unwrap();
        let key = state
            .store
            .issue_key(a, "client", &["fast".into()], 3600)
            .await
            .unwrap();
        let app = router(state);
        let base = format!(
            "/admin/v1/organizations/{org}/projects/{}/execution-imports",
            a.project_id
        );
        let fixture = include_str!("../../../contracts/fixtures/parallel-task.v1.json");
        let mut id = None;
        for (auth, expected) in [
            (format!("Bearer {}", key.token), StatusCode::UNAUTHORIZED),
            (
                "Bearer niu-test-admin-token-that-is-long-1234".into(),
                StatusCode::CREATED,
            ),
            (
                "Bearer niu-test-admin-token-that-is-long-1234".into(),
                StatusCode::OK,
            ),
        ] {
            let response = app
                .clone()
                .oneshot(
                    Request::post(&base)
                        .header("authorization", auth)
                        .header("content-type", "application/json")
                        .body(axum::body::Body::from(fixture))
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), expected);
            if matches!(expected, StatusCode::CREATED | StatusCode::OK) {
                let body: Value = serde_json::from_slice(
                    &response.into_body().collect().await.unwrap().to_bytes(),
                )
                .unwrap();
                if let Some(ref previous) = id {
                    assert_eq!(previous, &body["id"]);
                }
                id = Some(body["id"].clone());
            }
        }
        let id = id.unwrap();
        for (auth, expected) in [
            (format!("Bearer {}", key.token), StatusCode::UNAUTHORIZED),
            (
                "Bearer niu-test-admin-token-that-is-long-1234".into(),
                StatusCode::OK,
            ),
        ] {
            let response = app
                .clone()
                .oneshot(
                    Request::get(format!("{base}?limit=1"))
                        .header("authorization", auth)
                        .body(axum::body::Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), expected);
            if expected == StatusCode::OK {
                assert_eq!(response.headers()["cache-control"], "no-store");
                let body: Value = serde_json::from_slice(
                    &response.into_body().collect().await.unwrap().to_bytes(),
                )
                .unwrap();
                assert_eq!(body["data"][0]["id"], id);
                assert_eq!(body["data"][0]["coverage"], "partial");
                assert!(body["data"][0].get("spans").is_none());
                assert!(body["next_cursor"].is_null());
            }
        }
        let path = format!("{base}/{}", id.as_str().unwrap());
        for (url, expected) in [
            (path.clone(), StatusCode::OK),
            (
                format!(
                    "/admin/v1/organizations/{org}/projects/{}/execution-imports/{}",
                    b.project_id,
                    id.as_str().unwrap()
                ),
                StatusCode::NOT_FOUND,
            ),
        ] {
            let response = app
                .clone()
                .oneshot(
                    Request::get(url)
                        .header(
                            "authorization",
                            "Bearer niu-test-admin-token-that-is-long-1234",
                        )
                        .body(axum::body::Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), expected);
            if expected == StatusCode::OK {
                assert_eq!(response.headers()["cache-control"], "no-store");
                let body: Value = serde_json::from_slice(
                    &response.into_body().collect().await.unwrap().to_bytes(),
                )
                .unwrap();
                assert_eq!(body["charges"]["entries"], json!([]));
                assert_eq!(
                    body["charges"]["unresolved"],
                    json!(["charge-1", "charge-2"])
                );
                assert_eq!(body["charges"]["task_total_complete"], false);
                assert_eq!(body["charges"]["attribution"], "imported_reference");
            }
        }
        let mut conflicting: Value = serde_json::from_str(fixture).unwrap();
        conflicting["coverage"] = json!("unknown");
        let response = app
            .clone()
            .oneshot(
                Request::post(&base)
                    .header(
                        "authorization",
                        "Bearer niu-test-admin-token-that-is-long-1234",
                    )
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(conflicting.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::CONFLICT);
        let response = app
            .clone()
            .oneshot(
                Request::delete(&path)
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
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        let attempts: i64 = sqlx::query_scalar("SELECT count(*) FROM attempts")
            .fetch_one(&pool)
            .await
            .unwrap();
        let charges: i64 = sqlx::query_scalar("SELECT count(*) FROM cost_entries")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!((attempts, charges), (0, 0));
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

        let state = test_state(Some(format!("http://{address}/v1")), pool.clone());
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
        // Simple inference must not require observability imports, subscriptions,
        // or an opt-in budget/pricing setup.
        let imports: i64 = sqlx::query_scalar("SELECT count(*) FROM execution_imports")
            .fetch_one(&pool)
            .await
            .unwrap();
        let accounts: i64 = sqlx::query_scalar("SELECT count(*) FROM supplier_accounts")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!((imports, accounts), (0, 0));
        assert!(state.store.budget(scope).await.unwrap().is_none());

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
    async fn quick_setup_requires_admin_and_reuses_default(pool: sqlx::PgPool) {
        let state = test_state(None, pool.clone());
        let scope = state.store.default_workspace().await.unwrap();
        let key = state
            .store
            .issue_key(scope, "client", &["fast".into()], 3600)
            .await
            .unwrap();
        let app = router(state);
        let mut result = None;
        for authorization in [
            None,
            Some(format!("Bearer {}", key.token)),
            Some("Bearer niu-test-admin-token-that-is-long-1234".into()),
            Some("Bearer niu-test-admin-token-that-is-long-1234".into()),
        ] {
            let allowed =
                authorization.as_deref() == Some("Bearer niu-test-admin-token-that-is-long-1234");
            let mut request = Request::post("/admin/v1/setup/default-workspace");
            if let Some(value) = authorization {
                request = request.header("authorization", value);
            }
            let response = app
                .clone()
                .oneshot(request.body(axum::body::Body::empty()).unwrap())
                .await
                .unwrap();
            assert_eq!(
                response.status(),
                if allowed {
                    StatusCode::OK
                } else {
                    StatusCode::UNAUTHORIZED
                }
            );
            if allowed {
                let body: Value = serde_json::from_slice(
                    &response.into_body().collect().await.unwrap().to_bytes(),
                )
                .unwrap();
                assert_eq!(body["project_id"], scope.project_id.to_string());
                if let Some(previous) = &result {
                    assert_eq!(previous, &body);
                }
                result = Some(body);
            }
        }
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
    async fn quota_import_is_versioned_idempotent_and_read_only(pool: sqlx::PgPool) {
        let state = test_state(None, pool.clone());
        let organization = state.store.create_organization("quota").await.unwrap();
        let scope = state
            .store
            .create_project(organization, "project")
            .await
            .unwrap();
        let app = router(state.clone());
        let accounts = format!(
            "/admin/v1/organizations/{}/projects/{}/accounts",
            scope.organization_id, scope.project_id
        );
        let account = admin_call(
            &app,
            &accounts,
            json!({
                "provider": "fixture", "plan": "weekly", "authentication_mode": "oauth_refresh",
                "billing_mode": "subscription", "credential_reference": "env:FIXTURE_ACCOUNT",
                "concurrency_limit": 2
            }),
        )
        .await;
        let account_id = account["id"].as_str().unwrap();
        let quota = format!("{accounts}/{account_id}/quota");
        let now: i64 =
            sqlx::query_scalar("SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint")
                .fetch_one(&pool)
                .await
                .unwrap();
        let observation = json!({
            "schema_version": 1, "window_key": "weekly", "unit": "tokens",
            "remaining": 800, "maximum": 1000, "observed_at_ms": now - 1,
            "valid_until_ms": now + 60000, "resets_at_ms": now + 3600000,
            "source": "provider-header"
        });
        let post = |body: Value| {
            Request::post(&quota)
                .header(
                    "authorization",
                    "Bearer niu-test-admin-token-that-is-long-1234",
                )
                .header("content-type", "application/json")
                .body(axum::body::Body::from(body.to_string()))
                .unwrap()
        };
        let unauthorized = app
            .clone()
            .oneshot(
                Request::post(&quota)
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(observation.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(unauthorized.status(), StatusCode::UNAUTHORIZED);

        let first = app
            .clone()
            .oneshot(post(observation.clone()))
            .await
            .unwrap();
        assert_eq!(first.status(), StatusCode::CREATED);
        let first_body: Value =
            serde_json::from_slice(&first.into_body().collect().await.unwrap().to_bytes()).unwrap();
        let replay = app
            .clone()
            .oneshot(post(observation.clone()))
            .await
            .unwrap();
        assert_eq!(replay.status(), StatusCode::CREATED);
        let replay_body: Value =
            serde_json::from_slice(&replay.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        assert_eq!(first_body["id"], replay_body["id"]);

        let mut unsupported_version = observation.clone();
        unsupported_version["schema_version"] = json!(2);
        let invalid = app
            .clone()
            .oneshot(post(unsupported_version))
            .await
            .unwrap();
        assert_eq!(invalid.status(), StatusCode::BAD_REQUEST);

        let mut conflicting = observation.clone();
        conflicting["remaining"] = json!(700);
        let response = app.clone().oneshot(post(conflicting)).await.unwrap();
        assert_eq!(response.status(), StatusCode::CONFLICT);
        let read = app
            .clone()
            .oneshot(
                Request::get(&quota)
                    .header(
                        "authorization",
                        "Bearer niu-test-admin-token-that-is-long-1234",
                    )
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(read.status(), StatusCode::OK);
        let body: Value =
            serde_json::from_slice(&read.into_body().collect().await.unwrap().to_bytes()).unwrap();
        assert_eq!(body["data"][0]["remaining"], "800");
        assert_eq!(body["data"][0]["unit"], "tokens");
        assert_eq!(body["data"][0]["fresh"], true);
        assert!(body["data"][0].get("credential_reference").is_none());
        // Import/report operations do not dispatch inference or mutate account health.
        assert_eq!(
            state.store.accounts(scope).await.unwrap()[0].health,
            "unverified"
        );
        assert_eq!(state.usage.snapshot().attempts_total, 0);
        let reopened_pool = PgPool::connect_with((*pool.connect_options()).clone())
            .await
            .unwrap();
        let reopened = niu_storage::Store::from_pool(reopened_pool.clone());
        let persisted = reopened
            .quota(scope, Uuid::parse_str(account_id).unwrap())
            .await
            .unwrap();
        assert_eq!(persisted.len(), 1);
        assert_eq!(persisted[0].remaining.as_deref(), Some("800"));
        assert_eq!(persisted[0].previous_remaining, None);
        reopened_pool.close().await;

        let delete_path = format!("{quota}?window_key=weekly");
        let unauthorized_delete = app
            .clone()
            .oneshot(
                Request::delete(&delete_path)
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(unauthorized_delete.status(), StatusCode::UNAUTHORIZED);
        let deleted = app
            .clone()
            .oneshot(
                Request::delete(&delete_path)
                    .header(
                        "authorization",
                        "Bearer niu-test-admin-token-that-is-long-1234",
                    )
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(deleted.status(), StatusCode::OK);
        let deleted_body: Value =
            serde_json::from_slice(&deleted.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        assert_eq!(deleted_body["window_key"], "weekly");
        assert_eq!(deleted_body["deleted_count"], 1);
        let empty = app
            .clone()
            .oneshot(
                Request::get(&quota)
                    .header(
                        "authorization",
                        "Bearer niu-test-admin-token-that-is-long-1234",
                    )
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let empty_body: Value =
            serde_json::from_slice(&empty.into_body().collect().await.unwrap().to_bytes()).unwrap();
        assert!(empty_body["data"].as_array().unwrap().is_empty());
        assert_eq!(
            state.store.accounts(scope).await.unwrap()[0].health,
            "unverified"
        );
        assert_eq!(state.usage.snapshot().attempts_total, 0);
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

    #[sqlx::test(migrations = "../../crates/storage/migrations")]
    #[ignore = "requires PostgreSQL"]
    async fn execution_import_api_is_idempotent_scoped_and_deletable(pool: sqlx::PgPool) {
        let state = test_state(None, pool.clone());
        let organization = state
            .store
            .create_organization("observations")
            .await
            .unwrap();
        let scope = state
            .store
            .create_project(organization, "project")
            .await
            .unwrap();
        let other = state
            .store
            .create_project(organization, "other")
            .await
            .unwrap();
        let account = state
            .store
            .create_account(
                scope,
                &niu_storage::AccountInput {
                    provider: "fixture".into(),
                    plan: "subscription".into(),
                    authentication_mode: niu_storage::AuthMode::OAuthRefresh,
                    billing_mode: niu_storage::BillingMode::Subscription,
                    credential_reference: "env:FIXTURE_ACCOUNT".into(),
                    concurrency_limit: 2,
                },
            )
            .await
            .unwrap();
        state
            .store
            .set_account_health(scope, account, niu_storage::AccountHealth::Ready)
            .await
            .unwrap();
        let operation = state
            .store
            .create_operation(scope, "model-a")
            .await
            .unwrap();
        let attempt = state
            .store
            .prepare_account_attempt(scope, operation, "fixture-account", "v1", account)
            .await
            .unwrap();
        let base = format!(
            "/admin/v1/organizations/{}/projects/{}/executions",
            scope.organization_id, scope.project_id
        );
        let mut record: Value = serde_json::from_str(include_str!(
            "../../../contracts/fixtures/parallel-task.v1.json"
        ))
        .unwrap();
        for span in record["spans"].as_array_mut().unwrap() {
            if matches!(span["id"].as_str(), Some("model" | "attempt")) {
                span["charge_ref"] = json!(attempt.to_string());
            }
        }
        let app = router(state);
        let unauthorized = app
            .clone()
            .oneshot(Request::get(&base).body(axum::body::Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(unauthorized.status(), StatusCode::UNAUTHORIZED);

        let post = |body: Value| {
            Request::post(&base)
                .header(
                    "authorization",
                    "Bearer niu-test-admin-token-that-is-long-1234",
                )
                .header("content-type", "application/json")
                .body(axum::body::Body::from(body.to_string()))
                .unwrap()
        };
        let first = app.clone().oneshot(post(record.clone())).await.unwrap();
        assert_eq!(first.status(), StatusCode::CREATED);
        let first_body: Value =
            serde_json::from_slice(&first.into_body().collect().await.unwrap().to_bytes()).unwrap();
        assert_eq!(first_body["created"], true);
        let id = first_body["id"].as_str().unwrap().to_owned();

        let mut second_record = record.clone();
        second_record["record_id"] = json!("parallel-fixture-2");
        let second = app.clone().oneshot(post(second_record)).await.unwrap();
        assert_eq!(second.status(), StatusCode::CREATED);

        let cohort_path = format!("{base}/cohort");
        let cohort_unauthorized = app
            .clone()
            .oneshot(
                Request::get(&cohort_path)
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(cohort_unauthorized.status(), StatusCode::UNAUTHORIZED);
        let cohort_response = app
            .clone()
            .oneshot(
                Request::get(&cohort_path)
                    .header(
                        "authorization",
                        "Bearer niu-test-admin-token-that-is-long-1234",
                    )
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(cohort_response.status(), StatusCode::OK);
        let cohort_body: Value = serde_json::from_slice(
            &cohort_response
                .into_body()
                .collect()
                .await
                .unwrap()
                .to_bytes(),
        )
        .unwrap();
        assert_eq!(cohort_body["data"]["records_scanned"], 2);
        assert_eq!(cohort_body["data"]["outcomes"]["conflicting"], 2);
        assert_eq!(
            cohort_body["data"]["cost_evidence"]["unique_charge_references"],
            2
        );
        assert_eq!(
            cohort_body["data"]["cost_evidence"]["unresolved_references"],
            1
        );
        assert_eq!(
            cohort_body["data"]["cost_evidence"]["attempts_without_cost_entries"],
            1
        );
        assert_eq!(cohort_body["data"]["cost_evidence"]["complete"], false);
        assert_eq!(cohort_body["data"]["invoice_cash"]["state"], "not_imported");

        let replay = app.clone().oneshot(post(record.clone())).await.unwrap();
        assert_eq!(replay.status(), StatusCode::OK);
        let replay_body: Value =
            serde_json::from_slice(&replay.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        assert_eq!(replay_body["id"], id);
        assert_eq!(replay_body["created"], false);

        let list = app
            .clone()
            .oneshot(
                Request::get(format!("{base}?task_id=task&limit=1"))
                    .header(
                        "authorization",
                        "Bearer niu-test-admin-token-that-is-long-1234",
                    )
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(list.status(), StatusCode::OK);
        let list_body: Value =
            serde_json::from_slice(&list.into_body().collect().await.unwrap().to_bytes()).unwrap();
        assert_eq!(list_body["data"].as_array().unwrap().len(), 1);
        assert!(list_body["next_cursor"].as_str().is_some());
        assert!(list_body["data"][0].get("spans").is_none());
        let first_page_id = list_body["data"][0]["id"].clone();
        let next = app
            .clone()
            .oneshot(
                Request::get(format!(
                    "{base}?task_id=task&limit=1&after={}",
                    list_body["next_cursor"].as_str().unwrap()
                ))
                .header(
                    "authorization",
                    "Bearer niu-test-admin-token-that-is-long-1234",
                )
                .body(axum::body::Body::empty())
                .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(next.status(), StatusCode::OK);
        let next_body: Value =
            serde_json::from_slice(&next.into_body().collect().await.unwrap().to_bytes()).unwrap();
        assert_eq!(next_body["data"].as_array().unwrap().len(), 1);
        assert_ne!(next_body["data"][0]["id"], first_page_id);

        let detail_path = format!("{base}/{id}");
        let detail = app
            .clone()
            .oneshot(
                Request::get(&detail_path)
                    .header(
                        "authorization",
                        "Bearer niu-test-admin-token-that-is-long-1234",
                    )
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(detail.status(), StatusCode::OK);
        let detail_body: Value =
            serde_json::from_slice(&detail.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        assert_eq!(detail_body["record"], record);
        let account_links = detail_body["linked_accounts"].as_array().unwrap();
        assert_eq!(account_links.len(), 2);
        assert!(
            account_links
                .iter()
                .all(|link| link["account_id"] == account.to_string())
        );
        assert!(account_links.iter().any(|link| link["span_id"] == "model"));

        let account_executions_path = format!(
            "/admin/v1/organizations/{}/projects/{}/accounts/{}/executions",
            scope.organization_id, scope.project_id, account
        );
        let account_executions = app
            .clone()
            .oneshot(
                Request::get(&account_executions_path)
                    .header(
                        "authorization",
                        "Bearer niu-test-admin-token-that-is-long-1234",
                    )
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(account_executions.status(), StatusCode::OK);
        let account_execution_body: Value = serde_json::from_slice(
            &account_executions
                .into_body()
                .collect()
                .await
                .unwrap()
                .to_bytes(),
        )
        .unwrap();
        assert_eq!(account_execution_body["data"].as_array().unwrap().len(), 2);
        assert_eq!(account_execution_body["data"][0]["task_id"], "task");

        let reopened_pool = PgPool::connect_with((*pool.connect_options()).clone())
            .await
            .unwrap();
        let reopened = niu_storage::Store::from_pool(reopened_pool.clone());
        let persisted = reopened
            .execution_import(scope, Uuid::parse_str(&id).unwrap())
            .await
            .unwrap()
            .unwrap();
        assert_eq!(serde_json::to_value(persisted).unwrap(), record);
        reopened_pool.close().await;

        let other_path = format!(
            "/admin/v1/organizations/{}/projects/{}/executions/{id}",
            other.organization_id, other.project_id
        );
        let cross_scope = app
            .clone()
            .oneshot(
                Request::get(&other_path)
                    .header(
                        "authorization",
                        "Bearer niu-test-admin-token-that-is-long-1234",
                    )
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(cross_scope.status(), StatusCode::NOT_FOUND);

        let mut changed = record.clone();
        changed["coverage"] = json!("unknown");
        let conflict = app.clone().oneshot(post(changed)).await.unwrap();
        assert_eq!(conflict.status(), StatusCode::CONFLICT);
        let mut unsupported = record.clone();
        unsupported["schema_version"] = json!(2);
        let invalid = app.clone().oneshot(post(unsupported)).await.unwrap();
        assert_eq!(invalid.status(), StatusCode::BAD_REQUEST);

        let deleted = app
            .clone()
            .oneshot(
                Request::delete(&detail_path)
                    .header(
                        "authorization",
                        "Bearer niu-test-admin-token-that-is-long-1234",
                    )
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(deleted.status(), StatusCode::NO_CONTENT);
        let absent = app
            .oneshot(
                Request::get(&detail_path)
                    .header(
                        "authorization",
                        "Bearer niu-test-admin-token-that-is-long-1234",
                    )
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(absent.status(), StatusCode::NOT_FOUND);

        let attempts: i64 = sqlx::query_scalar("SELECT count(*) FROM attempts")
            .fetch_one(&pool)
            .await
            .unwrap();
        let charges: i64 = sqlx::query_scalar("SELECT count(*) FROM cost_entries")
            .fetch_one(&pool)
            .await
            .unwrap();
        // The assigned attempt was created before import; metadata import and
        // deletion must not create or charge additional work.
        assert_eq!((attempts, charges), (1, 0));
    }
}
