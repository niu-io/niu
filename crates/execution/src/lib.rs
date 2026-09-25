pub mod observation;

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

/// A resource can expose a model protocol or execute a longer-running task.
/// These kinds stay distinct even when a resource supports both.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResourceKind {
    ModelProvider,
    AgentRuntime,
}

/// Protocol and execution features that an offer may advertise.
#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Capability {
    ChatCompletions,
    Streaming,
    ToolCalls,
    StructuredOutput,
    ImageInput,
    AudioInput,
    AudioOutput,
    ConversationResume,
    Cancellation,
    UsageReporting,
    WorkspaceIsolation,
    ShellExecution,
}

/// Describes how an offer implements a capability. Limited behavior is never
/// silently treated as full support; callers must explicitly accept its limit.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum CapabilitySupport {
    Native,
    Translated,
    Limited { description: String },
    Unsupported,
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
pub struct CapabilityProfile {
    capabilities: BTreeMap<Capability, CapabilitySupport>,
}

impl CapabilityProfile {
    pub fn set(&mut self, capability: Capability, support: CapabilitySupport) {
        self.capabilities.insert(capability, support);
    }

    pub fn get(&self, capability: Capability) -> CapabilitySupport {
        self.capabilities
            .get(&capability)
            .cloned()
            .unwrap_or(CapabilitySupport::Unsupported)
    }

    pub fn supports(&self, capability: Capability, accept_limited: bool) -> bool {
        match self.get(capability) {
            CapabilitySupport::Native | CapabilitySupport::Translated => true,
            CapabilitySupport::Limited { .. } => accept_limited,
            CapabilitySupport::Unsupported => false,
        }
    }
}

/// A versioned, independently evaluated resource offer. Credentials and
/// private account details are intentionally outside this public contract.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct ResourceOffer {
    pub resource_id: String,
    pub offer_revision: String,
    pub kind: ResourceKind,
    pub capabilities: CapabilityProfile,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionCertainty {
    NotSent,
    MayHaveExecuted,
    ConfirmedCompleted,
    ConfirmedNotExecuted,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResponseProgress {
    NotCommitted,
    HeadersCommitted,
    BodyComplete,
    Interrupted,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UsageConfidence {
    Unknown,
    Estimated,
    ProviderReported,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SettlementState {
    Unresolved,
    Estimated,
    Settled,
    ReconciliationRequired,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct AttemptStatus {
    pub execution: ExecutionCertainty,
    pub response: ResponseProgress,
    pub usage: UsageConfidence,
    pub settlement: SettlementState,
}

impl Default for AttemptStatus {
    fn default() -> Self {
        Self {
            execution: ExecutionCertainty::NotSent,
            response: ResponseProgress::NotCommitted,
            usage: UsageConfidence::Unknown,
            settlement: SettlementState::Unresolved,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct AttemptRecord {
    pub attempt_id: String,
    pub operation_id: String,
    pub resource_id: String,
    pub offer_revision: String,
    pub status: AttemptStatus,
}

impl AttemptRecord {
    pub fn new(
        attempt_id: impl Into<String>,
        operation_id: impl Into<String>,
        resource_id: impl Into<String>,
        offer_revision: impl Into<String>,
    ) -> Self {
        Self {
            attempt_id: attempt_id.into(),
            operation_id: operation_id.into(),
            resource_id: resource_id.into(),
            offer_revision: offer_revision.into(),
            status: AttemptStatus::default(),
        }
    }

    /// Call before handing bytes to the upstream transport. From this point,
    /// absence of a response does not prove that execution failed to occur.
    pub fn mark_dispatched(&mut self) -> Result<(), TransitionError> {
        if self.status.execution != ExecutionCertainty::NotSent {
            return Err(TransitionError::AlreadyDispatched);
        }
        self.status.execution = ExecutionCertainty::MayHaveExecuted;
        Ok(())
    }

    pub fn mark_execution_confirmed(&mut self) -> Result<(), TransitionError> {
        if self.status.execution != ExecutionCertainty::MayHaveExecuted {
            return Err(TransitionError::NotInFlight);
        }
        self.status.execution = ExecutionCertainty::ConfirmedCompleted;
        Ok(())
    }

    pub fn mark_not_executed(&mut self) -> Result<(), TransitionError> {
        if self.status.execution != ExecutionCertainty::MayHaveExecuted {
            return Err(TransitionError::NotInFlight);
        }
        self.status.execution = ExecutionCertainty::ConfirmedNotExecuted;
        Ok(())
    }

    pub fn mark_headers_committed(&mut self) -> Result<(), TransitionError> {
        if self.status.execution == ExecutionCertainty::NotSent
            || self.status.response != ResponseProgress::NotCommitted
        {
            return Err(TransitionError::InvalidResponseProgress);
        }
        self.status.response = ResponseProgress::HeadersCommitted;
        Ok(())
    }

    pub fn mark_body_complete(&mut self) -> Result<(), TransitionError> {
        if self.status.response != ResponseProgress::HeadersCommitted {
            return Err(TransitionError::InvalidResponseProgress);
        }
        self.status.response = ResponseProgress::BodyComplete;
        Ok(())
    }

    pub fn mark_response_interrupted(&mut self) -> Result<(), TransitionError> {
        if self.status.response == ResponseProgress::NotCommitted
            || self.status.response == ResponseProgress::BodyComplete
        {
            return Err(TransitionError::InvalidResponseProgress);
        }
        self.status.response = ResponseProgress::Interrupted;
        Ok(())
    }

    pub fn mark_usage_reported(&mut self) -> Result<(), TransitionError> {
        self.ensure_dispatched()?;
        self.status.usage = UsageConfidence::ProviderReported;
        Ok(())
    }

    pub fn mark_usage_estimated(&mut self) -> Result<(), TransitionError> {
        self.ensure_dispatched()?;
        if self.status.usage != UsageConfidence::ProviderReported {
            self.status.usage = UsageConfidence::Estimated;
        }
        Ok(())
    }

    pub fn require_reconciliation(&mut self) -> Result<(), TransitionError> {
        self.ensure_dispatched()?;
        self.status.settlement = SettlementState::ReconciliationRequired;
        Ok(())
    }

    pub fn mark_estimated_settlement(&mut self) -> Result<(), TransitionError> {
        self.ensure_dispatched()?;
        if self.status.settlement == SettlementState::ReconciliationRequired {
            return Err(TransitionError::ReconciliationPending);
        }
        if self.status.settlement == SettlementState::Settled {
            return Err(TransitionError::AlreadySettled);
        }
        self.status.settlement = SettlementState::Estimated;
        Ok(())
    }

    pub fn mark_settled(&mut self) -> Result<(), TransitionError> {
        if !matches!(
            self.status.execution,
            ExecutionCertainty::ConfirmedCompleted | ExecutionCertainty::ConfirmedNotExecuted
        ) {
            return Err(TransitionError::ExecutionUnresolved);
        }
        if self.status.settlement == SettlementState::ReconciliationRequired {
            return Err(TransitionError::ReconciliationPending);
        }
        self.status.settlement = SettlementState::Settled;
        Ok(())
    }

    pub fn can_retry(&self, gates: RetryGates) -> bool {
        self.status.response == ResponseProgress::NotCommitted
            && gates.body_replayable
            && gates.semantics_allow_replay
            && gates.permission_current
            && gates.within_deadline
            && gates.attempt_budget_available
            && gates.cost_exposure_reserved
    }

    fn ensure_dispatched(&self) -> Result<(), TransitionError> {
        if self.status.execution == ExecutionCertainty::NotSent {
            Err(TransitionError::NotDispatched)
        } else {
            Ok(())
        }
    }
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct RetryGates {
    pub body_replayable: bool,
    pub semantics_allow_replay: bool,
    pub permission_current: bool,
    pub within_deadline: bool,
    pub attempt_budget_available: bool,
    pub cost_exposure_reserved: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TransitionError {
    AlreadyDispatched,
    NotDispatched,
    NotInFlight,
    InvalidResponseProgress,
    ExecutionUnresolved,
    ReconciliationPending,
    AlreadySettled,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn retry_gates() -> RetryGates {
        RetryGates {
            body_replayable: true,
            semantics_allow_replay: true,
            permission_current: true,
            within_deadline: true,
            attempt_budget_available: true,
            cost_exposure_reserved: true,
        }
    }

    #[test]
    fn limited_capabilities_require_explicit_acceptance() {
        let mut capabilities = CapabilityProfile::default();
        capabilities.set(
            Capability::Cancellation,
            CapabilitySupport::Limited {
                description: "cancellation stops delivery but may not stop upstream work".into(),
            },
        );
        assert!(!capabilities.supports(Capability::Cancellation, false));
        assert!(capabilities.supports(Capability::Cancellation, true));
        assert!(!capabilities.supports(Capability::UsageReporting, true));
    }

    #[test]
    fn unknown_usage_stays_unknown_until_evidence_is_recorded() {
        let mut attempt = AttemptRecord::new("a1", "op1", "resource1", "offer-r4");
        assert_eq!(attempt.status.usage, UsageConfidence::Unknown);
        assert_eq!(attempt.status.settlement, SettlementState::Unresolved);
        attempt.mark_dispatched().unwrap();
        assert_eq!(
            attempt.mark_settled(),
            Err(TransitionError::ExecutionUnresolved)
        );
        attempt.mark_execution_confirmed().unwrap();
        attempt.require_reconciliation().unwrap();
        assert_eq!(attempt.status.usage, UsageConfidence::Unknown);
        assert_eq!(
            attempt.mark_settled(),
            Err(TransitionError::ReconciliationPending)
        );
    }

    #[test]
    fn estimates_cannot_clear_reconciliation_or_replace_settlement() {
        let mut attempt = AttemptRecord::new("a", "op", "r", "v1");
        attempt.mark_dispatched().unwrap();
        attempt.mark_execution_confirmed().unwrap();
        attempt.mark_settled().unwrap();
        assert_eq!(
            attempt.mark_estimated_settlement(),
            Err(TransitionError::AlreadySettled)
        );
        attempt.require_reconciliation().unwrap();
        assert_eq!(
            attempt.mark_estimated_settlement(),
            Err(TransitionError::ReconciliationPending)
        );
    }

    #[test]
    fn retry_needs_every_gate_and_stops_at_committed_response_headers() {
        let mut attempt = AttemptRecord::new("a1", "op1", "resource1", "offer-r4");
        attempt.mark_dispatched().unwrap();
        assert!(attempt.can_retry(retry_gates()));

        let mut unsafe_retry = retry_gates();
        unsafe_retry.cost_exposure_reserved = false;
        assert!(!attempt.can_retry(unsafe_retry));

        attempt.mark_headers_committed().unwrap();
        assert!(!attempt.can_retry(retry_gates()));
    }

    #[test]
    fn report_tracks_execution_and_response_independently() {
        let mut attempt = AttemptRecord::new("a1", "op1", "resource1", "offer-r4");
        attempt.mark_dispatched().unwrap();
        attempt.mark_execution_confirmed().unwrap();
        assert_eq!(attempt.status.response, ResponseProgress::NotCommitted);
        attempt.mark_headers_committed().unwrap();
        attempt.mark_response_interrupted().unwrap();
        assert_eq!(
            attempt.status.execution,
            ExecutionCertainty::ConfirmedCompleted
        );
        assert_eq!(attempt.status.response, ResponseProgress::Interrupted);
    }
}
