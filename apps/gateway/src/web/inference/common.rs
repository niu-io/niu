use axum::{
    http::{HeaderMap, HeaderValue, header},
    response::{IntoResponse, Response},
};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{error::ApiError, state::AppState};

pub(super) fn strip_server_control_fields(body: &mut serde_json::Map<String, Value>) {
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

pub(super) async fn begin_attempt(
    state: &AppState,
    principal: &niu_storage::Principal,
    public_model: &str,
    model: &crate::config::ModelConfig,
    completion_bound: Option<i64>,
    task_id: Option<&str>,
) -> Result<DispatchContext, ApiError> {
    let scope = principal.scope();
    let operation = state
        .store
        .create_operation_for_task(scope, public_model, task_id)
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

/// An optional opaque correlation key lets an agent group all of its model
/// requests for one task. It is metadata only and is never forwarded upstream.
pub(super) fn request_task_id(headers: &HeaderMap) -> Result<Option<String>, ApiError> {
    let Some(value) = headers.get("x-niu-task-id") else {
        return Ok(None);
    };
    let value = value
        .to_str()
        .map_err(|_| ApiError::invalid_request("x-niu-task-id must be printable ASCII"))?;
    if value.is_empty() || value.len() > 200 || !value.bytes().all(|byte| byte.is_ascii_graphic()) {
        return Err(ApiError::invalid_request(
            "x-niu-task-id must contain 1 to 200 printable ASCII characters",
        ));
    }
    Ok(Some(value.to_owned()))
}

pub(super) fn route_revision(model: &crate::config::ModelConfig) -> String {
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

pub(super) async fn finalize_response(
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

pub(super) fn validate_priced_request(
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

#[derive(Clone, Copy)]
pub(super) struct DispatchContext {
    pub(super) scope: niu_storage::TenantScope,
    pub(super) operation: Uuid,
    pub(super) attempt: Uuid,
}

pub(super) struct ProviderResponse {
    pub(super) response: Response,
    pub(super) completed: bool,
    pub(super) usage: Option<(u64, u64)>,
}

pub(in crate::web) fn bearer(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
}
