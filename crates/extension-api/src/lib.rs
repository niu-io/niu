//! Versioned extension contracts for Niu's public core.
//!
//! Extensions return claims, decisions, transformations, candidate IDs, task
//! evidence, or acknowledgements. The core remains the authority for tenant
//! authorization, credential resolution, dispatch, reservations, attempt
//! recording, route eligibility, settlement, and revocation.

use std::{
    collections::BTreeSet,
    future::Future,
    pin::Pin,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Instant,
};

use niu_execution::observation::ExecutionRecord;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use uuid::Uuid;

pub const EXTENSION_API_VERSION: &str = "niu.extension.v1";
pub const EXECUTION_RECORD_VERSION: u16 = 1;
pub type ExtensionFuture<'a, T> =
    Pin<Box<dyn Future<Output = Result<T, ExtensionError>> + Send + 'a>>;

#[derive(Clone, Copy, Debug, Deserialize, Eq, Ord, PartialEq, PartialOrd, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ExtensionCapability {
    IdentityFederation,
    Policy,
    ProviderAdapter,
    TaskAdapter,
    RouteSelection,
    MeteringObserver,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum FailureMode {
    FailClosed,
    FailOpen,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ExtensionManifest {
    pub id: String,
    pub version: String,
    pub api_version: String,
    pub capabilities: Vec<ExtensionCapability>,
    pub deadline_ms: u32,
    /// Used only for policy and identity hooks. Adapter errors always fail the
    /// current request; the core never skips its authorization/accounting path.
    pub failure_mode: FailureMode,
}

impl ExtensionManifest {
    pub fn validate(&self) -> Result<(), ContractError> {
        if !valid_identifier(&self.id)
            || self.version.trim().is_empty()
            || self.version.len() > 100
            || self.api_version != EXTENSION_API_VERSION
            || self.capabilities.is_empty()
            || !(1..=30_000).contains(&self.deadline_ms)
        {
            return Err(ContractError::Manifest);
        }
        if self
            .capabilities
            .iter()
            .copied()
            .collect::<BTreeSet<_>>()
            .len()
            != self.capabilities.len()
        {
            return Err(ContractError::Manifest);
        }
        // Only policy-only extensions may opt into fail-open behavior. Identity
        // and adapter failures must never bypass authentication or core work.
        if self.failure_mode == FailureMode::FailOpen
            && self
                .capabilities
                .iter()
                .any(|capability| *capability != ExtensionCapability::Policy)
        {
            return Err(ContractError::Manifest);
        }
        Ok(())
    }
}

pub trait NiuExtension: Send + Sync {
    fn manifest(&self) -> &ExtensionManifest;
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TenantContext {
    organization_id: Uuid,
    project_id: Uuid,
}

impl TenantContext {
    /// Construct this only from the core's authenticated principal. Extension
    /// data is never accepted from a client to establish this context.
    pub fn from_core(organization_id: Uuid, project_id: Uuid) -> Self {
        Self {
            organization_id,
            project_id,
        }
    }

    pub fn organization_id(&self) -> Uuid {
        self.organization_id
    }

    pub fn project_id(&self) -> Uuid {
        self.project_id
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PrincipalContext {
    principal_id: Uuid,
    model_grants: Vec<String>,
}

impl PrincipalContext {
    /// Construct this only from the core's authenticated principal.
    pub fn from_core(principal_id: Uuid, model_grants: Vec<String>) -> Self {
        Self {
            principal_id,
            model_grants,
        }
    }

    pub fn principal_id(&self) -> Uuid {
        self.principal_id
    }

    pub fn model_grants(&self) -> &[String] {
        &self.model_grants
    }
}

#[derive(Clone, Debug)]
pub struct CancellationToken(Arc<AtomicBool>);

impl CancellationToken {
    pub fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::Acquire)
    }
}

#[derive(Clone, Debug)]
pub struct CancellationSource(Arc<AtomicBool>);

impl CancellationSource {
    pub fn new() -> Self {
        Self(Arc::new(AtomicBool::new(false)))
    }

    pub fn token(&self) -> CancellationToken {
        CancellationToken(self.0.clone())
    }

    pub fn cancel(&self) {
        self.0.store(true, Ordering::Release);
    }
}

impl Default for CancellationSource {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Clone, Debug)]
pub struct ExtensionContext {
    tenant: TenantContext,
    principal: PrincipalContext,
    operation_id: Uuid,
    attempt_id: Option<Uuid>,
    deadline: Instant,
    cancellation: CancellationToken,
    idempotency_key: String,
}

impl ExtensionContext {
    /// The gateway creates this after authentication and admission checks.
    pub fn from_core(
        tenant: TenantContext,
        principal: PrincipalContext,
        operation_id: Uuid,
        attempt_id: Option<Uuid>,
        deadline: Instant,
        cancellation: CancellationToken,
        idempotency_key: String,
    ) -> Result<Self, ContractError> {
        if !valid_identifier(&idempotency_key) {
            return Err(ContractError::Identifier);
        }
        Ok(Self {
            tenant,
            principal,
            operation_id,
            attempt_id,
            deadline,
            cancellation,
            idempotency_key,
        })
    }

    pub fn tenant(&self) -> &TenantContext {
        &self.tenant
    }

    pub fn principal(&self) -> &PrincipalContext {
        &self.principal
    }

    pub fn operation_id(&self) -> Uuid {
        self.operation_id
    }

    pub fn attempt_id(&self) -> Option<Uuid> {
        self.attempt_id
    }

    pub fn deadline(&self) -> Instant {
        self.deadline
    }

    pub fn cancellation(&self) -> &CancellationToken {
        &self.cancellation
    }

    pub fn idempotency_key(&self) -> &str {
        &self.idempotency_key
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct IdentityInput {
    pub issuer: String,
    pub subject: String,
    pub groups: Vec<String>,
    pub email: Option<String>,
    pub email_verified: bool,
    pub auth_time_unix_ms: Option<i64>,
    pub assurance: IdentityAssurance,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct IdentityAssertion {
    pub issuer: String,
    pub subject: String,
    pub groups: Vec<String>,
    pub email: Option<String>,
    pub email_verified: bool,
    pub assurance: IdentityAssurance,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum IdentityAssurance {
    Unverified,
    Verified,
    MultiFactor,
}

/// The extension returns verified identity claims only. Tenant membership,
/// role mapping, key grants and session creation remain core decisions.
pub trait IdentityFederation: NiuExtension {
    fn resolve<'a>(
        &'a self,
        input: IdentityInput,
        context: &'a ExtensionContext,
    ) -> ExtensionFuture<'a, IdentityAssertion>;
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PolicyInput {
    pub protocol: Protocol,
    pub model_alias: String,
    pub binding: PolicyBinding,
    /// Content is absent unless the administrator explicitly enables it for
    /// the named hook. Credentials and server control fields are never passed.
    pub content: Option<Value>,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PolicyStage {
    Request,
    Response,
}

/// Core-owned identity, version, stage, input digest, and expiry for one policy
/// evaluation. Extensions must return this binding unchanged with their result.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PolicyBinding {
    pub policy_id: String,
    pub revision: String,
    pub stage: PolicyStage,
    pub required: bool,
    pub input_sha256: String,
    pub issued_at_unix_ms: i64,
    pub expires_at_unix_ms: i64,
}

pub struct PolicyBindingInput<'a> {
    pub policy_id: &'a str,
    pub revision: &'a str,
    pub stage: PolicyStage,
    pub required: bool,
    pub protocol: Protocol,
    pub model_alias: &'a str,
    pub content: Option<&'a Value>,
    pub issued_at_unix_ms: i64,
    pub expires_at_unix_ms: i64,
}

impl PolicyBinding {
    pub fn for_input(input: PolicyBindingInput<'_>) -> Result<Self, ContractError> {
        Ok(Self {
            policy_id: input.policy_id.into(),
            revision: input.revision.into(),
            stage: input.stage,
            required: input.required,
            input_sha256: policy_input_digest(input.protocol, input.model_alias, input.content)?,
            issued_at_unix_ms: input.issued_at_unix_ms,
            expires_at_unix_ms: input.expires_at_unix_ms,
        })
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub enum PolicyDecision {
    Allow {
        reason_code: String,
    },
    Deny {
        reason_code: String,
    },
    Redact {
        reason_code: String,
        json_pointers: Vec<String>,
    },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct BoundPolicyDecision {
    pub binding: PolicyBinding,
    pub decision: PolicyDecision,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PolicyFailureDisposition {
    Deny,
    AllowAndAudit,
}

pub fn policy_failure_disposition(
    required: bool,
    failure_mode: FailureMode,
) -> PolicyFailureDisposition {
    if required || failure_mode == FailureMode::FailClosed {
        PolicyFailureDisposition::Deny
    } else {
        PolicyFailureDisposition::AllowAndAudit
    }
}

pub trait PolicyHook: NiuExtension {
    fn evaluate<'a>(
        &'a self,
        input: PolicyInput,
        context: &'a ExtensionContext,
    ) -> ExtensionFuture<'a, BoundPolicyDecision>;
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, Ord, PartialEq, PartialOrd, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Protocol {
    OpenAiChatV1,
    OpenAiResponsesV1,
    OpenAiEmbeddingsV1,
    AnthropicMessagesV1,
    BedrockConverseV1,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ProviderCapabilities {
    pub protocols: Vec<Protocol>,
    pub streaming: bool,
    pub tools: bool,
    pub structured_output: bool,
    pub modalities: Vec<String>,
    pub reports_usage: bool,
}

#[derive(Clone, Debug)]
pub struct ProviderRequest {
    pub protocol: Protocol,
    pub upstream_model: String,
    pub body: Value,
    pub stream: bool,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum HttpMethod {
    Get,
    Post,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct EncodedProviderRequest {
    /// A relative path resolved against the core-approved provider endpoint.
    pub path: String,
    pub method: HttpMethod,
    /// Query parameters are explicit so credential-shaped names can be rejected.
    pub query: Vec<(String, String)>,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

impl EncodedProviderRequest {
    /// Reject transport controls that could override the core endpoint or
    /// credential boundary. The core adds host and authorization headers.
    pub fn validate_core_transport(&self) -> Result<(), ContractError> {
        if !self.path.starts_with('/')
            || self.path.starts_with("//")
            || self.path.len() > 8_192
            || self.path.contains(['\\', '?', '#'])
            || self.path.bytes().any(|byte| byte.is_ascii_control())
            || !safe_relative_path(&self.path)
            || self.body.len() > 1_048_576
            || self.query.len() > 100
            || self.query.iter().any(|(name, value)| {
                !valid_http_token(name)
                    || name.len() > 256
                    || value.len() > 8_192
                    || value.bytes().any(|byte| byte.is_ascii_control())
                    || credential_shaped_name(name)
            })
            || self.headers.len() > 100
            || self.headers.iter().any(|(name, value)| {
                !valid_http_token(name)
                    || name.len() > 256
                    || value.len() > 8_192
                    || value
                        .bytes()
                        .any(|byte| byte.is_ascii_control() && byte != b'\t')
                    || forbidden_request_header(name)
            })
            || self
                .headers
                .iter()
                .map(|(name, _)| name.to_ascii_lowercase())
                .collect::<BTreeSet<_>>()
                .len()
                != self.headers.len()
        {
            return Err(ContractError::TransportBoundary);
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ProviderResponse {
    pub status_code: u16,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct NormalizedResponse {
    pub status_code: u16,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
    pub prompt_tokens: Option<u64>,
    pub completion_tokens: Option<u64>,
    pub usage_confidence: UsageConfidence,
    pub terminal: bool,
}

/// One complete SSE frame parsed by the core transport. The adapter normalizes
/// its provider-specific payload while the core owns framing and cancellation.
#[derive(Clone, Debug)]
pub struct ProviderStreamFrame {
    pub event: Option<String>,
    pub data: Vec<u8>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct NormalizedStreamFrame {
    pub events: Vec<NormalizedStreamEvent>,
}

/// Stateful guard for a normalized stream. The host keeps one validator per
/// response and must reject any frame after a completion or failure event.
#[derive(Clone, Debug, Default)]
pub struct ProviderStreamValidator {
    terminal: bool,
}

impl ProviderStreamValidator {
    pub fn validate_next(&mut self, frame: &NormalizedStreamFrame) -> Result<(), ContractError> {
        if self.terminal {
            return Err(ContractError::ProviderStream);
        }
        validate_normalized_stream_frame(frame)?;
        self.terminal = frame.events.iter().any(|event| {
            matches!(
                event,
                NormalizedStreamEvent::Completed { .. } | NormalizedStreamEvent::Failed { .. }
            )
        });
        Ok(())
    }

    pub fn is_terminal(&self) -> bool {
        self.terminal
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum NormalizedStreamEvent {
    TextDelta {
        output_index: u32,
        content_index: u32,
        text: String,
    },
    ToolCallDelta {
        output_index: u32,
        content_index: u32,
        call_id: Option<String>,
        name: Option<String>,
        arguments_fragment: String,
    },
    StructuredJsonDelta {
        output_index: u32,
        content_index: u32,
        json_fragment: String,
    },
    Usage {
        prompt_tokens: Option<u64>,
        completion_tokens: Option<u64>,
        cached_prompt_tokens: Option<u64>,
        reasoning_tokens: Option<u64>,
        confidence: UsageConfidence,
    },
    Completed {
        reason_code: String,
    },
    Failed {
        code: String,
        retryable: bool,
    },
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum UsageConfidence {
    Unknown,
    ProviderReported,
}

pub trait ProviderAdapter: NiuExtension {
    fn capabilities(&self) -> ProviderCapabilities;

    fn encode<'a>(
        &'a self,
        request: ProviderRequest,
        context: &'a ExtensionContext,
    ) -> ExtensionFuture<'a, EncodedProviderRequest>;

    fn decode<'a>(
        &'a self,
        response: ProviderResponse,
        context: &'a ExtensionContext,
    ) -> ExtensionFuture<'a, NormalizedResponse>;

    fn decode_stream_frame<'a>(
        &'a self,
        frame: ProviderStreamFrame,
        context: &'a ExtensionContext,
    ) -> ExtensionFuture<'a, NormalizedStreamFrame>;
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct TaskRunInput {
    pub task_id: String,
    pub snapshot_sha256: String,
    pub tools_sha256: String,
    pub permissions_sha256: String,
    pub acceptance_sha256: String,
    pub candidate_id: String,
    pub offer_revision: String,
    pub repetition: u16,
    pub fixture: Value,
}

#[derive(Clone, Debug)]
pub struct TaskRunOutput {
    pub execution: ExecutionRecord,
    pub quality_basis_points: Option<u16>,
    /// Informational only; cost evidence is resolved from the core ledger.
    pub observed_cost_refs: Vec<String>,
}

/// Implementations must be run by a core-managed sandbox. The adapter cannot
/// choose its network access, credentials, tenant, budget, or persistence path.
pub trait TaskAdapter: NiuExtension {
    fn run<'a>(
        &'a self,
        input: TaskRunInput,
        context: &'a ExtensionContext,
    ) -> ExtensionFuture<'a, TaskRunOutput>;
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct RouteCandidate {
    pub id: Uuid,
    pub model_alias: String,
    pub offer_revision: String,
    pub max_cash_nanos: String,
    pub required_protocol: Protocol,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct RouteSelection {
    /// Ordered eligible candidate IDs only. The core rechecks every candidate
    /// against grants, health, limits, policy and reservation before dispatch.
    pub candidate_ids: Vec<Uuid>,
    pub reason_code: String,
}

pub trait RouteSelector: NiuExtension {
    fn select<'a>(
        &'a self,
        candidates: Vec<RouteCandidate>,
        context: &'a ExtensionContext,
    ) -> ExtensionFuture<'a, RouteSelection>;
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MeteringEventKind {
    AttemptDispatched,
    AttemptCompleted,
    AttemptFailed,
    CostSettled,
    ReconciliationRequired,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct MeteringEvent {
    pub event_id: Uuid,
    pub kind: MeteringEventKind,
    pub organization_id: Uuid,
    pub project_id: Uuid,
    pub operation_id: Uuid,
    pub attempt_id: Uuid,
    pub resource_id: String,
    pub offer_revision: String,
    pub currency: Option<String>,
    pub api_equivalent_nanos: Option<String>,
    pub cash_nanos: Option<String>,
    pub capacity_unit: Option<String>,
    pub capacity_quantity: Option<String>,
    pub occurred_at_unix_ms: i64,
}

/// A receipt for one immutable metering event. Hosts may redeliver an
/// unacknowledged event, so observers must deduplicate by this stable ID.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct MeteringAck {
    pub event_id: Uuid,
}

pub fn validate_metering_ack(
    event: &MeteringEvent,
    acknowledgement: &MeteringAck,
) -> Result<(), ContractError> {
    if acknowledgement.event_id != event.event_id {
        return Err(ContractError::MeteringAcknowledgement);
    }
    Ok(())
}

pub trait MeteringObserver: NiuExtension {
    /// Receives immutable evidence and returns its event ID as a receipt.
    /// Hosts may redeliver until acknowledged; observers must deduplicate by
    /// event ID. A receipt cannot replace, amend or suppress core accounting.
    fn consume<'a>(
        &'a self,
        event: &'a MeteringEvent,
        context: &'a ExtensionContext,
    ) -> ExtensionFuture<'a, MeteringAck>;
}

#[derive(Clone, Debug, Eq, PartialEq, thiserror::Error)]
pub enum ExtensionError {
    #[error("extension error: {code}")]
    Rejected { code: String, retryable: bool },
}

impl ExtensionError {
    pub fn rejected(code: impl Into<String>, retryable: bool) -> Result<Self, ContractError> {
        let code = code.into();
        if !valid_identifier(&code) {
            return Err(ContractError::Identifier);
        }
        Ok(Self::Rejected { code, retryable })
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, thiserror::Error)]
pub enum ContractError {
    #[error("invalid extension manifest")]
    Manifest,
    #[error("invalid public identifier")]
    Identifier,
    #[error("adapter attempted to override core transport or credential controls")]
    TransportBoundary,
    #[error("route selection includes an ineligible, duplicate or unknown candidate")]
    RouteSelection,
    #[error("redaction target is invalid, unavailable, duplicate, or overlapping")]
    Redaction,
    #[error("task adapter returned invalid execution evidence")]
    TaskEvidence,
    #[error("identity assertion does not match the authenticated identity input")]
    IdentityAssertion,
    #[error("policy result is unbound, expired, or contains invalid redaction evidence")]
    PolicyDecision,
    #[error("provider capabilities or request are inconsistent")]
    ProviderCapabilities,
    #[error("provider stream frame contains invalid or post-terminal events")]
    ProviderStream,
    #[error("invalid task run input")]
    TaskInput,
    #[error("invalid metering event")]
    MeteringEvent,
    #[error("metering acknowledgement does not match its event")]
    MeteringAcknowledgement,
}

impl ProviderCapabilities {
    pub fn validate(&self) -> Result<(), ContractError> {
        let protocols: BTreeSet<_> = self.protocols.iter().copied().collect();
        if protocols.is_empty()
            || protocols.len() != self.protocols.len()
            || self.modalities.is_empty()
            || self.modalities.iter().any(|mode| !valid_identifier(mode))
            || self.modalities.iter().collect::<BTreeSet<_>>().len() != self.modalities.len()
        {
            return Err(ContractError::ProviderCapabilities);
        }
        Ok(())
    }
}

impl NormalizedResponse {
    pub fn validate(&self) -> Result<(), ContractError> {
        if !(100..=599).contains(&self.status_code)
            || self.body.len() > 16_777_216
            || self.headers.len() > 100
            || self.headers.iter().any(|(name, value)| {
                !valid_http_token(name)
                    || name.len() > 256
                    || value.len() > 8_192
                    || value
                        .bytes()
                        .any(|byte| byte.is_ascii_control() && byte != b'\t')
                    || forbidden_response_header(name)
            })
            || self
                .headers
                .iter()
                .map(|(name, _)| name.to_ascii_lowercase())
                .collect::<BTreeSet<_>>()
                .len()
                != self.headers.len()
        {
            return Err(ContractError::TransportBoundary);
        }
        Ok(())
    }
}

pub fn validate_normalized_stream_frame(
    frame: &NormalizedStreamFrame,
) -> Result<(), ContractError> {
    let terminal_positions: Vec<usize> = frame
        .events
        .iter()
        .enumerate()
        .filter_map(|(index, event)| {
            matches!(
                event,
                NormalizedStreamEvent::Completed { .. } | NormalizedStreamEvent::Failed { .. }
            )
            .then_some(index)
        })
        .collect();
    if terminal_positions.len() > 1
        || terminal_positions
            .first()
            .is_some_and(|index| *index + 1 != frame.events.len())
        || frame.events.iter().any(|event| match event {
            NormalizedStreamEvent::ToolCallDelta { call_id, name, .. } => {
                call_id
                    .as_ref()
                    .is_some_and(|value| !valid_identifier(value))
                    || name.as_ref().is_some_and(|value| !valid_identifier(value))
            }
            NormalizedStreamEvent::Completed { reason_code } => !valid_identifier(reason_code),
            NormalizedStreamEvent::Failed { code, .. } => !valid_identifier(code),
            _ => false,
        })
    {
        return Err(ContractError::ProviderStream);
    }
    Ok(())
}

pub fn validate_provider_request(
    capabilities: &ProviderCapabilities,
    request: &ProviderRequest,
) -> Result<(), ContractError> {
    capabilities.validate()?;
    if !capabilities.protocols.contains(&request.protocol)
        || (request.stream && !capabilities.streaming)
        || !valid_identifier(&request.upstream_model)
        || serde_json::to_vec(&request.body).map_or(true, |body| body.len() > 1_048_576)
    {
        return Err(ContractError::ProviderCapabilities);
    }
    Ok(())
}

pub fn validate_identity_assertion(
    input: &IdentityInput,
    assertion: &IdentityAssertion,
) -> Result<(), ContractError> {
    if input.issuer != assertion.issuer
        || input.subject != assertion.subject
        || !valid_identity_value(&assertion.issuer)
        || !valid_identity_value(&assertion.subject)
        || assertion
            .groups
            .iter()
            .any(|group| !valid_identity_value(group))
        || assertion
            .email
            .as_ref()
            .is_some_and(|email| !valid_email(email))
        || (assertion.email_verified
            && (input.email.as_ref() != assertion.email.as_ref() || !input.email_verified))
        || assurance_rank(assertion.assurance) > assurance_rank(input.assurance)
        || input.auth_time_unix_ms.is_some_and(|time| time < 0)
    {
        return Err(ContractError::IdentityAssertion);
    }
    Ok(())
}

pub fn validate_policy_decision(
    input: &PolicyInput,
    decision: &BoundPolicyDecision,
    evaluated_at_unix_ms: i64,
) -> Result<(), ContractError> {
    let binding = &input.binding;
    if !valid_identifier(&input.model_alias)
        || !valid_identifier(&binding.policy_id)
        || !valid_identifier(&binding.revision)
        || binding.issued_at_unix_ms < 0
        || binding.expires_at_unix_ms <= binding.issued_at_unix_ms
        || evaluated_at_unix_ms < binding.issued_at_unix_ms
        || evaluated_at_unix_ms >= binding.expires_at_unix_ms
        || policy_input_digest(input.protocol, &input.model_alias, input.content.as_ref())?
            != binding.input_sha256
        || decision.binding != *binding
    {
        return Err(ContractError::PolicyDecision);
    }
    let (reason_code, paths) = match &decision.decision {
        PolicyDecision::Allow { reason_code } | PolicyDecision::Deny { reason_code } => {
            (reason_code, None)
        }
        PolicyDecision::Redact {
            reason_code,
            json_pointers,
        } => (reason_code, Some(json_pointers)),
    };
    if !valid_identifier(reason_code) {
        return Err(ContractError::PolicyDecision);
    }
    if let Some(paths) = paths
        && input
            .content
            .as_ref()
            .is_none_or(|content| validate_redaction_paths(content, paths).is_err())
    {
        return Err(ContractError::PolicyDecision);
    }
    Ok(())
}

/// Replaces the exact, previously validated JSON Pointer targets with `null`.
/// Targets are all resolved before mutation; unknown and overlapping paths fail
/// atomically so a partial redaction is never returned.
pub fn apply_policy_redactions(
    content: &mut Value,
    json_pointers: &[String],
) -> Result<(), ContractError> {
    validate_redaction_paths(content, json_pointers)?;
    for path in json_pointers {
        *content.pointer_mut(path).ok_or(ContractError::Redaction)? = Value::Null;
    }
    Ok(())
}

fn validate_redaction_paths(content: &Value, paths: &[String]) -> Result<(), ContractError> {
    let unique: BTreeSet<_> = paths.iter().collect();
    if paths.is_empty()
        || unique.len() != paths.len()
        || paths
            .iter()
            .any(|path| !valid_json_pointer(path) || content.pointer(path).is_none())
        || paths.iter().enumerate().any(|(index, path)| {
            paths
                .iter()
                .skip(index + 1)
                .any(|other| json_pointers_overlap(path, other))
        })
    {
        return Err(ContractError::Redaction);
    }
    Ok(())
}

fn json_pointers_overlap(left: &str, right: &str) -> bool {
    fn is_ancestor(parent: &str, child: &str) -> bool {
        parent.is_empty()
            || child
                .strip_prefix(parent)
                .is_some_and(|suffix| suffix.starts_with('/'))
    }
    is_ancestor(left, right) || is_ancestor(right, left)
}

impl TaskRunInput {
    pub fn validate(&self) -> Result<(), ContractError> {
        if !valid_identifier(&self.task_id)
            || !valid_identifier(&self.candidate_id)
            || !valid_identifier(&self.offer_revision)
            || self.repetition == 0
            || [
                self.snapshot_sha256.as_str(),
                self.tools_sha256.as_str(),
                self.permissions_sha256.as_str(),
                self.acceptance_sha256.as_str(),
            ]
            .iter()
            .any(|digest| !valid_sha256(digest))
            || serde_json::to_vec(&self.fixture).map_or(true, |fixture| fixture.len() > 1_048_576)
        {
            return Err(ContractError::TaskInput);
        }
        Ok(())
    }
}

impl MeteringEvent {
    pub fn validate(&self) -> Result<(), ContractError> {
        let amounts = [
            self.api_equivalent_nanos.as_deref(),
            self.cash_nanos.as_deref(),
            self.capacity_quantity.as_deref(),
        ];
        if !valid_identifier(&self.resource_id)
            || !valid_identifier(&self.offer_revision)
            || self.occurred_at_unix_ms < 0
            || self.currency.as_ref().is_some_and(|currency| {
                currency.len() != 3 || !currency.bytes().all(|byte| byte.is_ascii_uppercase())
            })
            || self
                .capacity_unit
                .as_ref()
                .is_some_and(|unit| !valid_identifier(unit))
            || amounts
                .into_iter()
                .flatten()
                .any(|amount| !valid_unsigned_decimal(amount))
            || self.capacity_unit.is_some() != self.capacity_quantity.is_some()
        {
            return Err(ContractError::MeteringEvent);
        }
        Ok(())
    }
}

impl RouteCandidate {
    pub fn validate(&self) -> Result<(), ContractError> {
        if !valid_identifier(&self.model_alias)
            || !valid_identifier(&self.offer_revision)
            || !valid_unsigned_decimal(&self.max_cash_nanos)
        {
            return Err(ContractError::RouteSelection);
        }
        Ok(())
    }
}

/// Core validation for route-selector output. The selector cannot introduce a
/// candidate or mutate the offer, price, tenant, or route revision.
pub fn validate_route_selection(
    candidates: &[RouteCandidate],
    selection: &RouteSelection,
) -> Result<(), ContractError> {
    if candidates.len() > 1_000
        || candidates
            .iter()
            .any(|candidate| candidate.validate().is_err())
        || !valid_identifier(&selection.reason_code)
    {
        return Err(ContractError::RouteSelection);
    }
    let eligible: BTreeSet<_> = candidates.iter().map(|candidate| candidate.id).collect();
    let selected: BTreeSet<_> = selection.candidate_ids.iter().copied().collect();
    if eligible.len() != candidates.len()
        || selected.len() != selection.candidate_ids.len()
        || selection
            .candidate_ids
            .iter()
            .any(|id| !eligible.contains(id))
    {
        return Err(ContractError::RouteSelection);
    }
    Ok(())
}

/// Core validates task evidence before persistence or cost resolution.
pub fn validate_task_output(
    manifest: &ExtensionManifest,
    input: &TaskRunInput,
    output: &TaskRunOutput,
) -> Result<(), ContractError> {
    if manifest.validate().is_err()
        || !manifest
            .capabilities
            .contains(&ExtensionCapability::TaskAdapter)
        || input.validate().is_err()
        || output.execution.schema_version != EXECUTION_RECORD_VERSION
        || output.execution.source != manifest.id
        || output.execution.task_id != input.task_id
        || output.execution.validate().is_err()
        || output
            .quality_basis_points
            .is_some_and(|score| score > 10_000)
        || output
            .observed_cost_refs
            .iter()
            .any(|reference| !valid_identifier(reference))
    {
        return Err(ContractError::TaskEvidence);
    }
    Ok(())
}

fn valid_identifier(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 200
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"._:/-".contains(&byte))
}

fn valid_email(value: &str) -> bool {
    value.len() <= 320
        && value.split_once('@').is_some_and(|(local, domain)| {
            !local.is_empty()
                && !domain.starts_with('.')
                && !domain.ends_with('.')
                && !domain.contains("..")
                && !value.chars().any(char::is_whitespace)
        })
}

fn valid_identity_value(value: &str) -> bool {
    !value.is_empty() && value.len() <= 2_048 && !value.chars().any(char::is_control)
}

fn assurance_rank(assurance: IdentityAssurance) -> u8 {
    match assurance {
        IdentityAssurance::Unverified => 0,
        IdentityAssurance::Verified => 1,
        IdentityAssurance::MultiFactor => 2,
    }
}

fn valid_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn policy_input_digest(
    protocol: Protocol,
    model_alias: &str,
    content: Option<&Value>,
) -> Result<String, ContractError> {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let bytes = serde_json::to_vec(&(protocol, model_alias, content))
        .map_err(|_| ContractError::PolicyDecision)?;
    let digest = Sha256::digest(bytes);
    let mut encoded = String::with_capacity(digest.len() * 2);
    for byte in digest {
        encoded.push(HEX[(byte >> 4) as usize] as char);
        encoded.push(HEX[(byte & 0x0f) as usize] as char);
    }
    Ok(encoded)
}

fn valid_unsigned_decimal(value: &str) -> bool {
    !value.is_empty()
        && (value == "0" || !value.starts_with('0'))
        && value.bytes().all(|byte| byte.is_ascii_digit())
}

fn valid_json_pointer(value: &str) -> bool {
    if value.is_empty() {
        return true;
    }
    value.starts_with('/')
        && value.split('/').skip(1).all(|token| {
            let mut chars = token.chars();
            while let Some(character) = chars.next() {
                if character == '~' && !matches!(chars.next(), Some('0' | '1')) {
                    return false;
                }
            }
            true
        })
}

fn safe_relative_path(path: &str) -> bool {
    path.split('/').all(|segment| {
        if segment.is_empty() {
            return true;
        }
        let mut decoded = Vec::with_capacity(segment.len());
        let bytes = segment.as_bytes();
        let mut index = 0;
        while index < bytes.len() {
            if bytes[index] == b'%' {
                if index + 2 >= bytes.len() {
                    return false;
                }
                let Some(high) = (bytes[index + 1] as char).to_digit(16) else {
                    return false;
                };
                let Some(low) = (bytes[index + 2] as char).to_digit(16) else {
                    return false;
                };
                let byte = ((high << 4) | low) as u8;
                if byte == b'/' || byte == b'\\' || byte.is_ascii_control() {
                    return false;
                }
                decoded.push(byte);
                index += 3;
            } else {
                decoded.push(bytes[index]);
                index += 1;
            }
        }
        decoded != b"." && decoded != b".."
    })
}

fn valid_http_token(value: &str) -> bool {
    !value.is_empty()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"!#$%&'*+-.^_`|~".contains(&byte))
}

fn credential_shaped_name(name: &str) -> bool {
    let name = name.to_ascii_lowercase().replace('-', "_");
    [
        "authorization",
        "api_key",
        "apikey",
        "token",
        "password",
        "secret",
    ]
    .iter()
    .any(|part| name.contains(part))
}

fn forbidden_request_header(name: &str) -> bool {
    let normalized = name.to_ascii_lowercase();
    matches!(
        normalized.as_str(),
        "authorization"
            | "proxy-authorization"
            | "x-api-key"
            | "api-key"
            | "host"
            | "cookie"
            | "connection"
            | "keep-alive"
            | "proxy-authenticate"
            | "te"
            | "trailer"
            | "transfer-encoding"
            | "upgrade"
            | "content-length"
    ) || normalized.starts_with("x-forwarded-")
        || credential_shaped_name(&normalized)
}

fn forbidden_response_header(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "connection"
            | "keep-alive"
            | "proxy-authenticate"
            | "te"
            | "trailer"
            | "transfer-encoding"
            | "upgrade"
            | "set-cookie"
            | "authorization"
            | "proxy-authorization"
            | "x-api-key"
            | "host"
            | "cookie"
            | "content-length"
    )
}
