use axum::{
    http::{HeaderMap, HeaderValue},
    response::{IntoResponse, Response},
};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{error::ApiError, state::AppState};

const MAX_PROVIDER_JSON_BYTES: usize = crate::customer_response::MAX_STRUCTURED_RESPONSE_BYTES;

/// Read only a bounded error envelope and classify a known regional refusal.
/// Never expose the upstream message, metadata, URLs or credentials.
pub(super) async fn provider_rejection(mut response: reqwest::Response) -> ApiError {
    let status = response.status();
    let mut body = Vec::new();
    let read = async {
        while let Some(chunk) = response.chunk().await.ok().flatten() {
            if body.len().saturating_add(chunk.len()) > 16 * 1024 {
                break;
            }
            body.extend_from_slice(&chunk);
        }
    };
    let _ = tokio::time::timeout(std::time::Duration::from_secs(2), read).await;
    let regional = status == axum::http::StatusCode::FORBIDDEN
        && serde_json::from_slice::<Value>(&body)
            .ok()
            .is_some_and(|value| {
                value.pointer("/error/message").and_then(Value::as_str)
                    == Some("This model is not available in your region.")
            });
    tracing::warn!(
        upstream_status = status.as_u16(),
        regional,
        "Provider rejected inference request"
    );
    ApiError::upstream_status(status, regional)
}

pub(super) async fn provider_json(mut response: reqwest::Response) -> Result<Value, ApiError> {
    if response
        .content_length()
        .is_some_and(|length| length > MAX_PROVIDER_JSON_BYTES as u64)
    {
        return Err(ApiError::upstream());
    }

    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| ApiError::upstream())? {
        append_provider_json_chunk(&mut body, &chunk, MAX_PROVIDER_JSON_BYTES)
            .map_err(|_| ApiError::upstream())?;
    }
    serde_json::from_slice(&body).map_err(|_| ApiError::upstream())
}

fn append_provider_json_chunk(body: &mut Vec<u8>, chunk: &[u8], limit: usize) -> Result<(), ()> {
    let next_length = body
        .len()
        .checked_add(chunk.len())
        .filter(|length| *length <= limit)
        .ok_or(())?;
    body.try_reserve(next_length - body.len()).map_err(|_| ())?;
    body.extend_from_slice(chunk);
    Ok(())
}

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
                | "niu_api_key"
                | "x_niu_api_key"
        )
    });
}

pub(super) fn provider_reported_model(value: &Value) -> Option<String> {
    let model = value.get("model")?.as_str()?.trim();
    (!model.is_empty() && model.len() <= 200 && model.chars().all(|value| !value.is_control()))
        .then(|| model.to_owned())
}

static LIVE_INPUT_SLOTS: std::sync::LazyLock<std::sync::Arc<tokio::sync::Semaphore>> =
    std::sync::LazyLock::new(|| std::sync::Arc::new(tokio::sync::Semaphore::new(4)));

pub(super) async fn inspect_request_input(
    state: &AppState,
    principal: &niu_storage::Principal,
    public_model: &str,
    model: &crate::config::ModelConfig,
    protocol: crate::guardrails::input::Protocol,
    body: &mut Value,
) -> Result<niu_storage::GuardrailSnapshot, ApiError> {
    inspect_request_input_for_provider(
        state,
        principal,
        public_model,
        &model.provider,
        protocol,
        body,
    )
    .await
}

/// Shared inspection without requiring text-inference model configuration.
pub(super) async fn inspect_request_input_for_provider(
    state: &AppState,
    principal: &niu_storage::Principal,
    public_model: &str,
    provider: &str,
    protocol: crate::guardrails::input::Protocol,
    body: &mut Value,
) -> Result<niu_storage::GuardrailSnapshot, ApiError> {
    inspect_request_input_with_image_requirements(
        state,
        principal,
        public_model,
        provider,
        protocol,
        body,
        false,
    )
    .await
}

/// Only the video admission pipeline may retain image requirements while it
/// inspects a text projection. Images still require separate runtime approvals.
pub(super) async fn inspect_request_input_with_image_requirements(
    state: &AppState,
    principal: &niu_storage::Principal,
    public_model: &str,
    provider: &str,
    protocol: crate::guardrails::input::Protocol,
    body: &mut Value,
    allow_image_requirements: bool,
) -> Result<niu_storage::GuardrailSnapshot, ApiError> {
    if allow_image_requirements && protocol != crate::guardrails::input::Protocol::VideoText {
        return Err(ApiError::forbidden());
    }
    let scope = principal.scope();
    let mut snapshot = state
        .store
        .guardrail_snapshot(scope, principal.key_id())
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::forbidden)?;
    let mut rules = Vec::new();
    let mut detectors = Vec::new();
    let mut output_rule_count = 0usize;
    for stored in [&snapshot.workspace_policy, &snapshot.key_policy]
        .into_iter()
        .flatten()
    {
        let policy = serde_json::from_value::<crate::guardrails::PolicyDraft>(stored.clone());
        let reason = match policy {
            Ok(policy)
                if policy.validate_shape().is_ok()
                    && (policy.image_detectors.is_empty() || allow_image_requirements)
                    && !(matches!(protocol, crate::guardrails::input::Protocol::VideoText)
                        && (!policy.input_detectors.is_empty() || policy.output.is_some())) =>
            {
                rules.extend(policy.input_rules);
                detectors.extend(policy.input_detectors);
                output_rule_count += policy
                    .output
                    .as_ref()
                    .map_or(0, |output| output.rules.len());
                if !crate::guardrails::EffectiveAccess::compose([policy.models])
                    .permits(public_model)
                {
                    Some("model_denied")
                } else if !crate::guardrails::EffectiveAccess::compose([policy.providers])
                    .permits(provider)
                {
                    Some("provider_denied")
                } else {
                    None
                }
            }
            _ => Some("unsupported_policy"),
        };
        if let Some(reason) = reason {
            state
                .store
                .record_guardrail_preparation_denial(scope, principal.key_id(), &snapshot, reason)
                .await
                .map_err(ApiError::from_store)?;
            return Err(ApiError::guardrail_denied());
        }
    }
    if output_rule_count > 0
        && (output_rule_count > 32
            || matches!(
                protocol,
                crate::guardrails::input::Protocol::Embeddings
                    | crate::guardrails::input::Protocol::VideoText
            )
            || body.get("stream").and_then(Value::as_bool) == Some(true)
            || body.get("tools").is_some()
            || body.get("functions").is_some()
            || body.get("response_format").is_some())
    {
        state
            .store
            .record_guardrail_preparation_denial(
                scope,
                principal.key_id(),
                &snapshot,
                "output_incompatible",
            )
            .await
            .map_err(ApiError::from_store)?;
        return Err(ApiError::guardrail_denied());
    }
    if !rules.is_empty() {
        let started = std::time::Instant::now();
        let original = body.clone();
        let inspected =
            crate::guardrails::input::run_bounded(LIVE_INPUT_SLOTS.clone(), move || {
                crate::guardrails::input::CompiledInputPolicy::compile(&rules)
                    .and_then(|policy| policy.inspect(protocol, &original))
            })
            .await;
        let reason = match inspected {
            Ok(Ok(transformed)) => {
                snapshot.input_outcome = Some(
                    if transformed == *body {
                        "allowed"
                    } else {
                        "redacted"
                    }
                    .to_owned(),
                );
                snapshot.input_elapsed_ms =
                    Some(i64::try_from(started.elapsed().as_millis()).unwrap_or(i64::MAX));
                *body = transformed;
                None
            }
            Ok(Err(crate::guardrails::input::InspectionError::Blocked)) => Some("input_blocked"),
            Ok(Err(crate::guardrails::input::InspectionError::UnsupportedContent)) => {
                Some("input_unsupported")
            }
            Ok(Err(_)) => Some("input_resource_limit"),
            Err(_) => Some("input_unavailable"),
        };
        if let Some(reason) = reason {
            state
                .store
                .record_guardrail_preparation_denial(scope, principal.key_id(), &snapshot, reason)
                .await
                .map_err(ApiError::from_store)?;
            return Err(ApiError::guardrail_denied());
        }
    }
    if !detectors.is_empty() {
        if detectors.len() > 8 {
            return Err(ApiError::forbidden());
        }
        let text = crate::guardrails::input::detector_text(protocol, body);
        for binding in detectors {
            let started = std::time::Instant::now();
            let result = match &text {
                Err(crate::guardrails::input::InspectionError::ResourceLimit) => {
                    crate::guardrails::detector::InspectionResult {
                        outcome: crate::guardrails::detector::Outcome::Indeterminate,
                        reason: "resource_limit",
                    }
                }
                Err(_) => crate::guardrails::detector::InspectionResult {
                    outcome: crate::guardrails::detector::Outcome::Indeterminate,
                    reason: "unsupported_content",
                },
                Ok(text) => match state.detectors.get(&binding.detector) {
                    Some(runtime) if runtime.permits_live(scope.project_id, &binding) => {
                        runtime.inspect(text).await
                    }
                    _ => crate::guardrails::detector::InspectionResult {
                        outcome: crate::guardrails::detector::Outcome::Indeterminate,
                        reason: "configuration_unavailable",
                    },
                },
            };
            let decision = json!({"detector":binding.detector,"configuration_fingerprint":binding.configuration_fingerprint,"outcome":result.outcome,"reason":result.reason,"elapsed_ms":i64::try_from(started.elapsed().as_millis()).unwrap_or(i64::MAX)});
            let id = state
                .store
                .record_input_detector_decision(scope, principal.key_id(), &snapshot, &decision)
                .await
                .map_err(ApiError::from_store)?;
            snapshot.input_detector_decision_ids.push(id);
            if result.outcome != crate::guardrails::detector::Outcome::Clear {
                let reason = if result.outcome == crate::guardrails::detector::Outcome::Matched {
                    "detector_blocked"
                } else if result.reason == "unsupported_content" {
                    "detector_unsupported"
                } else {
                    "detector_unavailable"
                };
                state
                    .store
                    .record_guardrail_preparation_denial(
                        scope,
                        principal.key_id(),
                        &snapshot,
                        reason,
                    )
                    .await
                    .map_err(ApiError::from_store)?;
                return Err(ApiError::guardrail_denied());
            }
        }
    }
    Ok(snapshot)
}

pub(super) struct AttemptRequest<'a> {
    pub managed_route: Option<&'a niu_storage::ManagedRouteSnapshot>,
    pub personal_route: Option<&'a niu_storage::VendorRoute>,
    pub public_model: &'a str,
    pub model: &'a crate::config::ModelConfig,
    pub completion_bound: Option<i64>,
    pub task_id: Option<&'a str>,
    pub snapshot: niu_storage::GuardrailSnapshot,
    pub request_body: &'a Value,
    pub protocol: crate::guardrails::input::Protocol,
}

fn request_token_bound(body: &Value, protocol: &crate::guardrails::input::Protocol) -> Option<i64> {
    use crate::guardrails::input::Protocol;
    let output = match protocol {
        Protocol::VideoText => return None,
        Protocol::Messages => body.get("max_tokens")?.as_i64()?,
        Protocol::Chat => {
            if body.get("n").is_some_and(|n| n.as_u64() != Some(1))
                || [
                    "tools",
                    "functions",
                    "function_call",
                    "tool_choice",
                    "modalities",
                    "audio",
                ]
                .iter()
                .any(|field| body.get(*field).is_some())
                || body.get("messages")?.as_array()?.iter().any(|m| {
                    !m.get("content")
                        .is_some_and(super::priced_chat::text_content)
                })
                || (body.get("max_tokens").is_some() && body.get("max_completion_tokens").is_some())
            {
                return None;
            }
            body.get("max_completion_tokens")
                .or_else(|| body.get("max_tokens"))?
                .as_i64()?
        }
        Protocol::Responses => {
            body.get("input")?.as_str()?;
            body.get("max_output_tokens")?.as_i64()?
        }
        Protocol::Embeddings => {
            let input = body.get("input")?;
            if !input.is_string()
                && !input
                    .as_array()
                    .is_some_and(|items| !items.is_empty() && items.iter().all(Value::is_string))
            {
                return None;
            }
            0
        }
    };
    if !(0..=1_000_000).contains(&output) {
        return None;
    }
    i64::try_from(serde_json::to_vec(body).ok()?.len())
        .ok()?
        .checked_add(output)
}

pub(super) async fn begin_attempt(
    state: &AppState,
    principal: &niu_storage::Principal,
    request: AttemptRequest<'_>,
) -> Result<DispatchContext, ApiError> {
    begin_retry_attempt(state, principal, request, None).await
}

pub(super) async fn begin_retry_attempt(
    state: &AppState,
    principal: &niu_storage::Principal,
    request: AttemptRequest<'_>,
    retry: Option<(Uuid, niu_storage::GatewayRetryAdmission)>,
) -> Result<DispatchContext, ApiError> {
    let AttemptRequest {
        managed_route,
        personal_route,
        public_model,
        model,
        completion_bound,
        task_id,
        snapshot,
        request_body,
        protocol,
    } = request;
    if retry.is_some() && personal_route.is_none() && model.pricing.is_none() {
        return Err(ApiError::unavailable());
    }
    let token_bound = request_token_bound(request_body, &protocol);
    let scope = principal.scope();
    if personal_route.is_none()
        && model.pricing.is_none()
        && state
            .store
            .customer_balance_enabled(scope.organization_id)
            .await
            .map_err(ApiError::from_store)?
    {
        return Err(ApiError::invalid_request(
            "This model has no qualified cost bound for prepaid billing. Choose a priced model.",
        ));
    }
    let retained_input = [&snapshot.workspace_policy, &snapshot.key_policy]
        .into_iter()
        .flatten()
        .any(|policy| {
            policy
                .get("input_rules")
                .and_then(Value::as_array)
                .is_some_and(|rules| !rules.is_empty())
        })
        .then(|| request_body.clone());
    let mut output_rules = Vec::new();
    let mut output_observe_rules = Vec::new();
    for policy in [&snapshot.workspace_policy, &snapshot.key_policy]
        .into_iter()
        .flatten()
    {
        let policy: crate::guardrails::PolicyDraft =
            serde_json::from_value(policy.clone()).map_err(|_| ApiError::forbidden())?;
        if let Some(output) = policy.output {
            match output.mode {
                crate::guardrails::OutputMode::BufferedFull => output_rules.extend(output.rules),
                crate::guardrails::OutputMode::ObserveOnly => {
                    output_observe_rules.extend(output.rules)
                }
            }
        }
    }
    let revision = route_revision(model);
    let (operation, attempt) = if let Some(route) = personal_route {
        if model.pricing.is_some() {
            return Err(ApiError::invalid_request(
                "Personal routes cannot use commercial pricing",
            ));
        }
        let (operation, attempt) = state
            .store
            .prepare_personal_gateway_attempt_with_retry(
                principal,
                niu_storage::GatewayAdmission {
                    managed_route: managed_route.cloned(),
                    token_bound,
                    inspected_guardrails: Some(snapshot),
                    operation_id: retry.map_or_else(Uuid::new_v4, |(operation, _)| operation),
                    attempt_id: Uuid::new_v4(),
                    scope,
                    key_id: principal.key_id(),
                    model: public_model.to_owned(),
                    upstream_model: model.upstream_model.clone(),
                    dispatch_provider: model.provider.clone(),
                    api_base: model.api_base.clone(),
                    task_id: task_id.map(str::to_owned),
                    revision: revision.clone(),
                },
                route,
                retry.map(|(_, policy)| policy),
            )
            .await
            .map_err(ApiError::from_store)?;
        state
            .store
            .mark_dispatched(principal, attempt)
            .await
            .map_err(ApiError::from_store)?;
        (operation, attempt)
    } else if let Some(price) = &model.pricing {
        let price_id = state
            .publish_price_revision(
                scope,
                public_model,
                &revision,
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
            .admit_priced_gateway_with_retry(
                principal,
                niu_storage::GatewayAdmission {
                    managed_route: managed_route.cloned(),
                    token_bound,
                    inspected_guardrails: Some(snapshot),
                    operation_id: retry.map_or_else(Uuid::new_v4, |(operation, _)| operation),
                    attempt_id: Uuid::new_v4(),
                    scope,
                    key_id: principal.key_id(),
                    model: public_model.to_owned(),
                    upstream_model: model.upstream_model.clone(),
                    dispatch_provider: model.provider.clone(),
                    api_base: model.api_base.clone(),
                    task_id: task_id.map(str::to_owned),
                    revision: revision.clone(),
                },
                &niu_storage::GatewayReservation {
                    price_revision_id: price_id,
                    resource_id: public_model.to_owned(),
                    offer_revision: revision.clone(),
                    prompt_bound: price.max_input_tokens,
                    completion_bound: completion_bound.unwrap_or(price.max_output_tokens),
                    token_usage: niu_storage::GatewayTokenUsageCapabilities {
                        cached_input: !matches!(
                            protocol,
                            crate::guardrails::input::Protocol::Embeddings
                        ),
                        cache_write_input: !matches!(
                            protocol,
                            crate::guardrails::input::Protocol::Embeddings
                                | crate::guardrails::input::Protocol::VideoText
                        ),
                        reasoning_output: matches!(
                            protocol,
                            crate::guardrails::input::Protocol::Chat
                                | crate::guardrails::input::Protocol::Responses
                        ),
                    },
                },
                retry.map(|(_, policy)| policy),
            )
            .await
            .map_err(ApiError::from_store)?
    } else {
        state
            .gateway_writes
            .admit_unpriced(
                principal,
                crate::admission::UnpricedAdmissionRequest {
                    managed_route: managed_route.cloned(),
                    token_bound,
                    inspected_guardrails: snapshot,
                    scope,
                    model: public_model,
                    upstream_model: &model.upstream_model,
                    provider: &model.provider,
                    api_base: model.api_base.as_deref(),
                    task_id,
                    revision: &revision,
                },
            )
            .await
            .map_err(|error| match error {
                crate::admission::AdmissionError::TokenRateExceeded => {
                    ApiError::from_store(niu_storage::StoreError::KeyTokenRateExceeded)
                }
                crate::admission::AdmissionError::TokenBoundRequired => {
                    ApiError::from_store(niu_storage::StoreError::KeyTokenBoundRequired)
                }
                crate::admission::AdmissionError::ConcurrencyExceeded => {
                    ApiError::from_store(niu_storage::StoreError::KeyConcurrencyExceeded)
                }
                crate::admission::AdmissionError::VendorRequestRateExceeded => {
                    ApiError::from_store(niu_storage::StoreError::VendorRequestRateExceeded)
                }
                crate::admission::AdmissionError::RequestRateExceeded => {
                    ApiError::from_store(niu_storage::StoreError::KeyRequestRateExceeded)
                }
                crate::admission::AdmissionError::Unauthorized => ApiError::unauthorized(),
                crate::admission::AdmissionError::ManagedRouteChanged => {
                    ApiError::from_store(niu_storage::StoreError::ManagedRouteChanged)
                }
                crate::admission::AdmissionError::Conflict => {
                    ApiError::from_store(niu_storage::StoreError::Conflict)
                }
                crate::admission::AdmissionError::AccountUnavailable => {
                    ApiError::from_store(niu_storage::StoreError::AccountUnavailable)
                }
                crate::admission::AdmissionError::StorageUnavailable => {
                    ApiError::storage_unavailable()
                }
            })?
    };
    crate::request_timings::dispatched(&state.store, attempt);
    Ok(DispatchContext {
        retained_input,
        output_rules,
        output_observe_rules,
        protocol,
        scope,
        operation,
        attempt,
        priced: model.pricing.is_some(),
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
                "supports_messages": model.supports_messages,
                "supports_responses": model.supports_responses,
                "pricing": model.pricing
            }))
            .expect("route serialization")
        )
    )
}

#[cfg(test)]
mod tests {
    use super::append_provider_json_chunk;

    #[test]
    fn provider_json_limit_is_enforced_across_chunks() {
        let mut body = Vec::new();
        append_provider_json_chunk(&mut body, b"{\"ok\":", 11).unwrap();
        append_provider_json_chunk(&mut body, b"true}", 11).unwrap();
        assert_eq!(body, b"{\"ok\":true}");

        assert!(append_provider_json_chunk(&mut body, b" ", 11).is_err());
        assert_eq!(body, b"{\"ok\":true}");
    }

    #[test]
    fn provider_json_limit_rejects_length_overflow() {
        let mut body = vec![b'x'; 8];
        assert!(append_provider_json_chunk(&mut body, b"xx", 9).is_err());
        assert_eq!(body.len(), 8);
    }
}

async fn inspect_output_rules(
    protocol: crate::guardrails::input::Protocol,
    original: &Value,
    rules: &[crate::guardrails::input::RuleConfig],
) -> Result<(Value, bool), crate::guardrails::input::InspectionError> {
    use crate::guardrails::input::{CompiledInputPolicy, InspectionError};
    let original = original.clone();
    let rules = rules.to_vec();
    crate::guardrails::input::run_bounded(LIVE_INPUT_SLOTS.clone(), move || {
        CompiledInputPolicy::compile(&rules)
            .and_then(|policy| policy.inspect_output(protocol, &original))
            .map(|transformed| {
                let changed = transformed != original;
                (transformed, changed)
            })
    })
    .await
    .unwrap_or(Err(InspectionError::InvalidPattern))
}

async fn inspect_complete_output(
    state: &AppState,
    dispatch: &DispatchContext,
    response: Response,
) -> Response {
    use crate::guardrails::input::InspectionError;
    let started = std::time::Instant::now();
    let (mut parts, body) = response.into_parts();
    parts.headers.remove(axum::http::header::CONTENT_LENGTH);
    // Provider JSON is already bounded at 16 MiB. Allow serialization overhead
    // here, while inspection itself retains its separate 1 MiB bound.
    let bytes = axum::body::to_bytes(body, MAX_PROVIDER_JSON_BYTES + 64 * 1024).await;
    let original = bytes
        .as_ref()
        .map_err(|_| InspectionError::ResourceLimit)
        .and_then(|bytes| {
            serde_json::from_slice::<Value>(bytes).map_err(|_| InspectionError::UnsupportedContent)
        });
    if !dispatch.output_observe_rules.is_empty() {
        let observation = match &original {
            Ok(original) => {
                inspect_output_rules(dispatch.protocol, original, &dispatch.output_observe_rules)
                    .await
            }
            Err(InspectionError::ResourceLimit) => Err(InspectionError::ResourceLimit),
            Err(_) => Err(InspectionError::UnsupportedContent),
        };
        let (outcome, reason) = match observation {
            Ok((_, false)) => ("clear", "inspected_text"),
            Ok((_, true)) | Err(InspectionError::Blocked) => ("matched", "pattern_match"),
            Err(InspectionError::UnsupportedContent) => ("indeterminate", "unsupported_content"),
            Err(InspectionError::ResourceLimit) => ("indeterminate", "resource_limit"),
            Err(InspectionError::InvalidPattern) => ("indeterminate", "inspection_unavailable"),
        };
        let elapsed = i64::try_from(started.elapsed().as_millis()).unwrap_or(i64::MAX);
        if state
            .store
            .record_output_guardrail_observation(
                dispatch.scope,
                dispatch.attempt,
                outcome,
                reason,
                elapsed,
            )
            .await
            .is_err()
        {
            // Observation must never become an implicit output blocking rule.
            tracing::error!(attempt_id = %dispatch.attempt, "output observation could not be saved");
        }
    }
    if dispatch.output_rules.is_empty() {
        return match bytes {
            Ok(bytes) => Response::from_parts(parts, axum::body::Body::from(bytes)),
            Err(_) => ApiError::upstream().into_response(),
        };
    }
    let inspected = match original {
        Ok(original) => {
            inspect_output_rules(dispatch.protocol, &original, &dispatch.output_rules).await
        }
        Err(error) => Err(error),
    };
    let (outcome, reason) = match &inspected {
        Ok((_, false)) => ("allowed", "inspected_text"),
        Ok((_, true)) => ("redacted", "inspected_text"),
        Err(InspectionError::Blocked) => ("blocked", "pattern_denial"),
        Err(InspectionError::UnsupportedContent) => ("indeterminate", "unsupported_content"),
        Err(InspectionError::ResourceLimit) => ("indeterminate", "resource_limit"),
        Err(InspectionError::InvalidPattern) => ("indeterminate", "inspection_unavailable"),
    };
    let elapsed = i64::try_from(started.elapsed().as_millis()).unwrap_or(i64::MAX);
    if state
        .store
        .record_output_guardrail_decision(
            dispatch.scope,
            dispatch.attempt,
            outcome,
            reason,
            elapsed,
        )
        .await
        .is_err()
    {
        return ApiError::guardrail_output_withheld().into_response();
    }
    match inspected {
        Ok((value, _)) => {
            let (_, body) = axum::Json(value).into_response().into_parts();
            Response::from_parts(parts, body)
        }
        Err(_) => ApiError::guardrail_output_withheld().into_response(),
    }
}

pub(super) async fn finalize_response(
    state: &AppState,
    dispatch: DispatchContext,
    result: Result<ProviderResponse, ApiError>,
) -> Response {
    let mut response = match result {
        Ok(mut result) if result.completed => {
            if !dispatch.output_rules.is_empty() || !dispatch.output_observe_rules.is_empty() {
                result.response = inspect_complete_output(state, &dispatch, result.response).await;
            }
            if dispatch.priced {
                if state
                    .gateway_writes
                    .complete_priced(crate::admission::PricedGatewayCompletion {
                        token_categories: result.token_categories,
                        scope: dispatch.scope,
                        attempt_id: dispatch.attempt,
                        usage: result.usage,
                        provider_model: result.provider_model,
                    })
                    .await
                    .is_err()
                {
                    tracing::error!(
                        attempt_id = %dispatch.attempt,
                        "priced gateway completion writer is unavailable; the durable reservation remains unresolved"
                    );
                }
                if let Some(choices) = result.finish_reasons.take()
                    && state
                        .store
                        .save_request_finish_reasons(dispatch.scope, dispatch.attempt, choices)
                        .await
                        .is_err()
                {
                    tracing::error!(attempt_id = %dispatch.attempt, "finish-reason observation could not be saved");
                }
                result.response
            } else {
                let completion = niu_storage::GatewayCompletion {
                    token_categories: result.token_categories,
                    scope: dispatch.scope,
                    attempt_id: dispatch.attempt,
                    usage: result.usage,
                    provider_model: result.provider_model,
                };
                if state
                    .gateway_writes
                    .complete_unpriced(completion)
                    .await
                    .is_err()
                {
                    tracing::error!(
                        attempt_id = %dispatch.attempt,
                        "unpriced completion writer is unavailable; the durable request remains unresolved"
                    );
                }
                if let Some(choices) = result.finish_reasons.take()
                    && state
                        .store
                        .save_request_finish_reasons(dispatch.scope, dispatch.attempt, choices)
                        .await
                        .is_err()
                {
                    tracing::error!(attempt_id = %dispatch.attempt, "finish-reason observation could not be saved");
                }
                result.response
            }
        }
        Ok(result) => result.response,
        Err(error) => error.into_response(),
    };
    if let Some(failure) = response
        .extensions()
        .get::<niu_storage::RequestFailure>()
        .copied()
        && state
            .store
            .save_request_failure(dispatch.scope, dispatch.attempt, failure)
            .await
            .is_err()
    {
        tracing::error!(attempt_id = %dispatch.attempt, "request failure persistence or reservation release requires retry");
    }
    if let Some(input) = dispatch.retained_input {
        response
            .extensions_mut()
            .insert(crate::request_payloads::InspectedRequestPayload(input));
    }
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

#[derive(Clone)]
pub(super) struct DispatchContext {
    output_rules: Vec<crate::guardrails::input::RuleConfig>,
    output_observe_rules: Vec<crate::guardrails::input::RuleConfig>,
    protocol: crate::guardrails::input::Protocol,
    retained_input: Option<Value>,
    pub(super) scope: niu_storage::TenantScope,
    pub(super) operation: Uuid,
    pub(super) attempt: Uuid,
    pub(super) priced: bool,
}

pub(super) struct ProviderResponse {
    pub(super) finish_reasons: Option<Vec<niu_storage::RequestChoiceFinish>>,
    pub(super) token_categories: Option<niu_storage::RequestTokenCategories>,
    pub(super) response: Response,
    pub(super) completed: bool,
    pub(super) usage: Option<(u64, u64)>,
    pub(super) provider_model: Option<String>,
}
