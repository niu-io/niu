//! Synthetic public extension used to compile and exercise every v1 contract.
//! It is not loaded by the gateway and performs no network or persistence work.

use std::time::Instant;

use niu_execution::observation::{
    Coverage, ExecutionRecord, Link, LinkKind, Outcome, OutcomeAuthority, OutcomeResult, Span,
    SpanKind,
};
use niu_extension_api::{
    BoundPolicyDecision, CancellationSource, EncodedProviderRequest, ExtensionCapability,
    ExtensionContext, ExtensionFuture, ExtensionManifest, FailureMode, HttpMethod,
    IdentityAssertion, IdentityFederation, IdentityInput, MeteringAck, MeteringEvent,
    MeteringObserver, NiuExtension, NormalizedResponse, NormalizedStreamEvent,
    NormalizedStreamFrame, PolicyBinding, PolicyBindingInput, PolicyDecision, PolicyHook,
    PolicyInput, PolicyStage, Protocol, ProviderAdapter, ProviderCapabilities, ProviderRequest,
    ProviderResponse, ProviderStreamFrame, RouteCandidate, RouteSelection, RouteSelector,
    TaskAdapter, TaskRunInput, TaskRunOutput, UsageConfidence,
};
use serde_json::{Value, json};
use uuid::Uuid;

pub struct ReferenceExtension {
    manifest: ExtensionManifest,
}

impl ReferenceExtension {
    pub fn new() -> Self {
        Self {
            manifest: ExtensionManifest {
                id: "niu.reference".into(),
                version: "0.1.0".into(),
                api_version: niu_extension_api::EXTENSION_API_VERSION.into(),
                capabilities: vec![
                    ExtensionCapability::IdentityFederation,
                    ExtensionCapability::Policy,
                    ExtensionCapability::ProviderAdapter,
                    ExtensionCapability::TaskAdapter,
                    ExtensionCapability::RouteSelection,
                    ExtensionCapability::MeteringObserver,
                ],
                deadline_ms: 1_000,
                failure_mode: FailureMode::FailClosed,
            },
        }
    }
}

impl Default for ReferenceExtension {
    fn default() -> Self {
        Self::new()
    }
}

impl NiuExtension for ReferenceExtension {
    fn manifest(&self) -> &ExtensionManifest {
        &self.manifest
    }
}

impl IdentityFederation for ReferenceExtension {
    fn resolve<'a>(
        &'a self,
        input: IdentityInput,
        _context: &'a ExtensionContext,
    ) -> ExtensionFuture<'a, IdentityAssertion> {
        Box::pin(async move {
            Ok(IdentityAssertion {
                issuer: input.issuer,
                subject: input.subject,
                groups: input.groups,
                email: input.email,
                email_verified: input.email_verified,
                assurance: input.assurance,
            })
        })
    }
}

impl PolicyHook for ReferenceExtension {
    fn evaluate<'a>(
        &'a self,
        input: PolicyInput,
        _context: &'a ExtensionContext,
    ) -> ExtensionFuture<'a, BoundPolicyDecision> {
        Box::pin(async move {
            let decision = if input.model_alias.starts_with("blocked-") {
                PolicyDecision::Deny {
                    reason_code: "model_blocked".into(),
                }
            } else if input.content.is_some() {
                PolicyDecision::Redact {
                    reason_code: "content_redacted".into(),
                    json_pointers: vec!["/messages/0/content".into()],
                }
            } else {
                PolicyDecision::Allow {
                    reason_code: "request_allowed".into(),
                }
            };
            Ok(BoundPolicyDecision {
                binding: input.binding,
                decision,
            })
        })
    }
}

impl ProviderAdapter for ReferenceExtension {
    fn capabilities(&self) -> ProviderCapabilities {
        ProviderCapabilities {
            protocols: vec![Protocol::OpenAiChatV1],
            streaming: true,
            tools: true,
            structured_output: false,
            modalities: vec!["text".into()],
            reports_usage: true,
        }
    }

    fn encode<'a>(
        &'a self,
        request: ProviderRequest,
        _context: &'a ExtensionContext,
    ) -> ExtensionFuture<'a, EncodedProviderRequest> {
        Box::pin(async move {
            Ok(EncodedProviderRequest {
                path: "/v1/chat/completions".into(),
                method: HttpMethod::Post,
                query: vec![],
                headers: vec![("content-type".into(), "application/json".into())],
                body: serde_json::to_vec(&request.body).unwrap_or_default(),
            })
        })
    }

    fn decode<'a>(
        &'a self,
        response: ProviderResponse,
        _context: &'a ExtensionContext,
    ) -> ExtensionFuture<'a, NormalizedResponse> {
        Box::pin(async move {
            let parsed: Value = serde_json::from_slice(&response.body).unwrap_or(Value::Null);
            let usage = parsed.get("usage");
            Ok(NormalizedResponse {
                status_code: response.status_code,
                headers: vec![("content-type".into(), "application/json".into())],
                body: response.body,
                prompt_tokens: usage
                    .and_then(|u| u.get("prompt_tokens"))
                    .and_then(Value::as_u64),
                completion_tokens: usage
                    .and_then(|u| u.get("completion_tokens"))
                    .and_then(Value::as_u64),
                usage_confidence: if usage.is_some() {
                    UsageConfidence::ProviderReported
                } else {
                    UsageConfidence::Unknown
                },
                terminal: true,
            })
        })
    }

    fn decode_stream_frame<'a>(
        &'a self,
        frame: ProviderStreamFrame,
        _context: &'a ExtensionContext,
    ) -> ExtensionFuture<'a, NormalizedStreamFrame> {
        Box::pin(async move {
            let events = if frame.data == b"[DONE]" {
                vec![NormalizedStreamEvent::Completed {
                    reason_code: "stop".into(),
                }]
            } else {
                let payload: Value = serde_json::from_slice(&frame.data).unwrap_or(Value::Null);
                let content = payload
                    .pointer("/choices/0/delta/content")
                    .and_then(Value::as_str)
                    .unwrap_or("");
                if content.is_empty() {
                    vec![]
                } else {
                    vec![NormalizedStreamEvent::TextDelta {
                        output_index: 0,
                        content_index: 0,
                        text: content.into(),
                    }]
                }
            };
            Ok(NormalizedStreamFrame { events })
        })
    }
}

impl TaskAdapter for ReferenceExtension {
    fn run<'a>(
        &'a self,
        input: TaskRunInput,
        _context: &'a ExtensionContext,
    ) -> ExtensionFuture<'a, TaskRunOutput> {
        Box::pin(async move {
            let task_id = input.task_id;
            let execution = ExecutionRecord {
                schema_version: 1,
                source: "niu.reference".into(),
                record_id: Uuid::new_v4().to_string(),
                task_id: task_id.clone(),
                coverage: Coverage::Complete,
                spans: vec![
                    Span {
                        id: task_id.clone(),
                        kind: SpanKind::Task,
                        status: None,
                        started_at_ms: Some(1),
                        ended_at_ms: Some(2),
                        requested_model: None,
                        reported_model: None,
                        charge_ref: None,
                    },
                    Span {
                        id: "agent-1".into(),
                        kind: SpanKind::Agent,
                        status: None,
                        started_at_ms: None,
                        ended_at_ms: None,
                        requested_model: None,
                        reported_model: None,
                        charge_ref: None,
                    },
                ],
                links: vec![Link {
                    from: task_id,
                    to: "agent-1".into(),
                    kind: LinkKind::Contains,
                }],
                outcomes: vec![Outcome {
                    span_id: "agent-1".into(),
                    evidence_id: "validator:sample".into(),
                    authority: OutcomeAuthority::DeterministicValidator,
                    result: OutcomeResult::Accepted,
                }],
            };
            Ok(TaskRunOutput {
                execution,
                quality_basis_points: Some(10_000),
                observed_cost_refs: vec![],
            })
        })
    }
}

impl RouteSelector for ReferenceExtension {
    fn select<'a>(
        &'a self,
        candidates: Vec<RouteCandidate>,
        _context: &'a ExtensionContext,
    ) -> ExtensionFuture<'a, RouteSelection> {
        Box::pin(async move {
            let mut sorted = candidates;
            sorted.sort_by(|a, b| a.max_cash_nanos.cmp(&b.max_cash_nanos));
            Ok(RouteSelection {
                candidate_ids: sorted.into_iter().map(|candidate| candidate.id).collect(),
                reason_code: "lowest_cash_first".into(),
            })
        })
    }
}

impl MeteringObserver for ReferenceExtension {
    fn consume<'a>(
        &'a self,
        event: &'a MeteringEvent,
        _context: &'a ExtensionContext,
    ) -> ExtensionFuture<'a, MeteringAck> {
        Box::pin(async move {
            Ok(MeteringAck {
                event_id: event.event_id,
            })
        })
    }
}

pub fn test_context() -> ExtensionContext {
    let cancellation = CancellationSource::new();
    ExtensionContext::from_core(
        niu_extension_api::TenantContext::from_core(Uuid::new_v4(), Uuid::new_v4()),
        niu_extension_api::PrincipalContext::from_core(Uuid::new_v4(), vec!["chat".into()]),
        Uuid::new_v4(),
        Some(Uuid::new_v4()),
        Instant::now() + std::time::Duration::from_secs(1),
        cancellation.token(),
        "idempotency-1".into(),
    )
    .expect("valid core context")
}

pub fn valid_task_input() -> TaskRunInput {
    TaskRunInput {
        task_id: "task-1".into(),
        snapshot_sha256: "a".repeat(64),
        tools_sha256: "b".repeat(64),
        permissions_sha256: "c".repeat(64),
        acceptance_sha256: "d".repeat(64),
        candidate_id: "provider-a".into(),
        offer_revision: "rev-1".into(),
        repetition: 1,
        fixture: json!({"input":"sample"}),
    }
}

pub fn sample_policy_input(content: Option<Value>) -> PolicyInput {
    let binding = PolicyBinding::for_input(PolicyBindingInput {
        policy_id: "default-policy",
        revision: "revision-1",
        stage: PolicyStage::Request,
        required: true,
        protocol: Protocol::OpenAiChatV1,
        model_alias: "model-a",
        content: content.as_ref(),
        issued_at_unix_ms: 1,
        expires_at_unix_ms: 30_000,
    })
    .expect("static sample policy binding");
    PolicyInput {
        protocol: Protocol::OpenAiChatV1,
        model_alias: "model-a".into(),
        binding,
        content,
    }
}
