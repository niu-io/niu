//! One bounded retry driver shared by supported text protocols.
use super::common::finalize_response;
use crate::{error::ApiError, state::AppState};
use axum::{
    http::HeaderMap,
    response::{IntoResponse, Response},
};
use serde_json::Value;
use std::{sync::atomic::Ordering, time::Duration};
use uuid::Uuid;

pub(super) async fn execute(
    state: AppState,
    principal: niu_storage::Principal,
    headers: HeaderMap,
    body: Value,
    public_model: String,
    protocol: crate::guardrails::input::Protocol,
    requirements: Option<crate::config::ModelRequirements>,
) -> Result<Response, ApiError> {
    let retry_protocol = match protocol {
        crate::guardrails::input::Protocol::Chat => niu_storage::GatewayRetryProtocol::Chat,
        crate::guardrails::input::Protocol::Responses => {
            niu_storage::GatewayRetryProtocol::Responses
        }
        _ => return Err(ApiError::unavailable()),
    };
    let deadline = std::time::Instant::now()
        + Duration::from_secs(state.config.server.request_timeout_seconds);
    state.requests.fetch_add(1, Ordering::Relaxed);
    let mut excluded = Vec::new();
    let mut continuation = None;
    let mut previous_response = None;
    loop {
        let resolved = match crate::vendors::resolve_scoped_model_excluding(
            &state,
            principal.scope().organization_id,
            &public_model,
            protocol,
            requirements.as_ref(),
            &excluded,
        )
        .await
        {
            Ok(resolved) => resolved,
            Err(error) => return previous_response.map_or_else(|| Err(error), Ok),
        };
        let qualified = resolved.model.provider == "openrouter"
            && resolved
                .model
                .endpoint_base()
                .is_some_and(|base| base.trim_end_matches('/') == "https://openrouter.ai/api/v1")
            && resolved
                .managed_route
                .as_ref()
                .is_some_and(|route| route.pool_alias.is_some());
        let vendor = resolved.managed_route.as_ref().map(|route| route.vendor_id);
        let timeout = deadline.saturating_duration_since(std::time::Instant::now());
        if timeout.is_zero() {
            return previous_response.map_or_else(|| Err(ApiError::upstream()), Ok);
        }
        let retry = continuation.or_else(|| {
            qualified.then(|| {
                (
                    Uuid::new_v4(),
                    niu_storage::GatewayRetryAdmission::First {
                        protocol: retry_protocol,
                        deadline,
                    },
                )
            })
        });
        let request = ProtocolAttempt {
            public_model: &public_model,
            headers: &headers,
            body: body.clone(),
            stream: body["stream"] == true,
            timeout,
            deadline,
            retry,
            resolved,
        };
        let outcome = match protocol {
            crate::guardrails::input::Protocol::Chat => {
                super::chat::execute_chat_attempt(&state, &principal, request).await
            }
            crate::guardrails::input::Protocol::Responses => {
                super::responses::execute_responses_attempt(&state, &principal, request).await
            }
            _ => return Err(ApiError::unavailable()),
        };
        let (dispatch, result) = match outcome {
            Ok(outcome) => outcome,
            Err(error) => {
                if let Some(previous) = previous_response {
                    let mut response = error.into_response();
                    for name in ["x-niu-operation-id", "x-niu-attempt-id"] {
                        if let Some(value) = previous.headers().get(name) {
                            response.headers_mut().insert(name, value.clone());
                        }
                    }
                    return Ok(response);
                }
                return Err(error);
            }
        };
        let operation = dispatch.operation;
        let attempt = dispatch.attempt;
        let response = finalize_response(&state, dispatch, result).await;
        // Only an immediate qualified rejection is eligible. A returned stream
        // (including any later SSE/transport failure) never reaches this branch.
        let rejected = response
            .extensions()
            .get::<niu_storage::RequestFailure>()
            .is_some_and(|failure| {
                failure.kind == niu_storage::RequestFailureKind::UpstreamHttpError
                    && failure.upstream_http_status == Some(401)
            });
        if !qualified || continuation.is_some() || !rejected {
            return Ok(response);
        }
        excluded.push(vendor.ok_or_else(ApiError::unavailable)?);
        continuation = Some((
            operation,
            niu_storage::GatewayRetryAdmission::Successor {
                protocol: retry_protocol,
                predecessor_id: attempt,
            },
        ));
        previous_response = Some(response);
    }
}

pub(super) struct ProtocolAttempt<'a> {
    pub(super) public_model: &'a str,
    pub(super) headers: &'a HeaderMap,
    pub(super) body: Value,
    pub(super) stream: bool,
    pub(super) timeout: Duration,
    pub(super) deadline: std::time::Instant,
    pub(super) retry: Option<(Uuid, niu_storage::GatewayRetryAdmission)>,
    pub(super) resolved: crate::vendors::ResolvedModel,
}
