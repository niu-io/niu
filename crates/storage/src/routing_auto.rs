//! Optional semantic Auto routing for customer-owned workspace policies.
//!
//! Auto is an explicitly selected workspace strategy. It evaluates a
//! caller-supplied task context before considering an optional, bounded model
//! decider. The decider never chooses models directly: it may only return one
//! of the declared, request-compatible path identifiers. Invalid, unknown or
//! incompatible decisions are failures, never silent substitutions.
//!
//! The pure decision function in this module is used by both preview and
//! runtime selection. Preview never invokes the decider; runtime supplies a
//! validated [`AutoDecisionAttempt`] produced by the gateway's bounded model
//! call.

use crate::StoreError;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeSet;

/// Auto is only defined for workspace routing strategy schema version 2.
pub const AUTO_STRATEGY_VERSION: u8 = 2;
/// Bounded number of declared execution paths.
pub const MAX_AUTO_PATHS: usize = 8;
/// Bounded caller context header body.
pub const MAX_AUTO_CONTEXT_BYTES: usize = 512;
/// Bounded task/stage token length.
pub const MAX_AUTO_TOKEN_LEN: usize = 64;
/// Bounded task/stage keyword count per path.
pub const MAX_AUTO_PATH_KEYWORDS: usize = 16;
/// Bounded path name and description lengths.
pub const MAX_AUTO_PATH_NAME_LEN: usize = 120;
pub const MAX_AUTO_PATH_DESCRIPTION_LEN: usize = 280;
/// Decider timeout bounds in milliseconds.
pub const MIN_AUTO_DECIDER_TIMEOUT_MS: u32 = 50;
pub const MAX_AUTO_DECIDER_TIMEOUT_MS: u32 = 5_000;
/// Decision prompt bounds; these are configured allowances, not tokenization.
pub const MAX_AUTO_DECIDER_INPUT_TOKENS: u32 = 4_096;
pub const MAX_AUTO_DECIDER_OUTPUT_TOKENS: u32 = 1_024;
/// Maximum customer-charge allowance for one decision call, in currency
/// nanounits. The gateway verifies a comparable customer price before calling.
pub const MAX_AUTO_DECIDER_SPEND_NANOS: i64 = 100_000_000;

/// The response contract an execution path can satisfy. Auto may only select a
/// path with the response type required by the incoming request.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AutoResponseType {
    Text,
    Structured,
    Embedding,
}

impl AutoResponseType {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Text => "text",
            Self::Structured => "structured",
            Self::Embedding => "embedding",
        }
    }
}

/// Policy applied when the decider abstains, fails or returns an incompatible
/// decision. `fallback` keeps the existing deterministic priority/weight
/// selection; `reject` fails the request before dispatch.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AutoDecisionAction {
    #[default]
    Fallback,
    Reject,
}

impl AutoDecisionAction {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Fallback => "fallback",
            Self::Reject => "reject",
        }
    }
}

/// One declared execution path. Candidates reference top-level policy aliases,
/// so grants, capability filtering, priority and weight keep one source of
/// truth. `task` and `stage` are the only deterministic caller-context matches;
/// a path without keywords is never selected from context alone.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct AutoPath {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub response_type: AutoResponseType,
    pub candidates: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub task: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub stage: Vec<String>,
}

/// Optional model decider. The model is a concrete, workspace-visible alias;
/// it cannot be another pool and it is invoked with the caller's key and
/// spending authority. Every dimension is explicit and bounded.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct AutoDecider {
    pub model: String,
    /// Explicit currency for `max_spend_nanos`. The decider's customer price
    /// must be denominated in this currency and in the supported nanounit unit;
    /// otherwise the spend bound cannot be verified and no call is made.
    pub currency: String,
    pub timeout_ms: u32,
    /// Only one decision round is supported in this schema version. The field
    /// is explicit so a request can never grow an unbounded decision loop.
    pub max_calls: u8,
    pub max_input_tokens: u32,
    pub max_output_tokens: u32,
    pub max_spend_nanos: i64,
    /// Required confidence in the closed interval [0, 1]. A lower value is an
    /// abstention, not a lower-ranked path.
    pub min_confidence: f64,
    #[serde(default)]
    pub on_abstain: AutoDecisionAction,
    #[serde(default)]
    pub on_failure: AutoDecisionAction,
}

impl AutoDecider {
    fn validate(&self) -> Result<(), StoreError> {
        if self.model.is_empty()
            || self.model.len() > 200
            || self.model.starts_with("pool/")
            || self.model.starts_with("codex/")
            || self.model.trim() != self.model
            || self.currency.len() != 3
            || !self.currency.bytes().all(|byte| byte.is_ascii_uppercase())
            || !(MIN_AUTO_DECIDER_TIMEOUT_MS..=MAX_AUTO_DECIDER_TIMEOUT_MS)
                .contains(&self.timeout_ms)
            || self.max_calls != 1
            || !(1..=MAX_AUTO_DECIDER_INPUT_TOKENS).contains(&self.max_input_tokens)
            || !(1..=MAX_AUTO_DECIDER_OUTPUT_TOKENS).contains(&self.max_output_tokens)
            || !(1..=MAX_AUTO_DECIDER_SPEND_NANOS).contains(&self.max_spend_nanos)
            || !self.min_confidence.is_finite()
            || !(0.0..=1.0).contains(&self.min_confidence)
        {
            return Err(StoreError::InvalidVendor);
        }
        Ok(())
    }
}

/// Declared paths and the optional bounded decider.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct AutoStrategy {
    pub paths: Vec<AutoPath>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub decider: Option<AutoDecider>,
}

impl AutoStrategy {
    /// Validate the strategy shape without checking candidate references.
    pub fn validate(&self) -> Result<(), StoreError> {
        self.validate_against(None)
    }

    /// Validate the strategy and require every path candidate to be declared
    /// by the top-level policy. This prevents Auto paths from expanding the
    /// saved policy's model inventory or grants.
    pub fn validate_against_candidates(
        &self,
        top_level_aliases: &BTreeSet<String>,
    ) -> Result<(), StoreError> {
        self.validate_against(Some(top_level_aliases))
    }

    fn validate_against(
        &self,
        top_level_aliases: Option<&BTreeSet<String>>,
    ) -> Result<(), StoreError> {
        if !(2..=MAX_AUTO_PATHS).contains(&self.paths.len()) {
            return Err(StoreError::InvalidVendor);
        }
        let mut path_ids = BTreeSet::new();
        for path in &self.paths {
            if !is_valid_auto_path_id(&path.id) || !path_ids.insert(path.id.clone()) {
                return Err(StoreError::InvalidVendor);
            }
            if path.candidates.is_empty()
                || path.candidates.len() > 64
                || path.candidates.iter().collect::<BTreeSet<_>>().len() != path.candidates.len()
            {
                return Err(StoreError::InvalidVendor);
            }
            if let Some(aliases) = top_level_aliases
                && path.candidates.iter().any(|alias| !aliases.contains(alias))
            {
                return Err(StoreError::InvalidVendor);
            }
            if path.task.len() > MAX_AUTO_PATH_KEYWORDS
                || path.stage.len() > MAX_AUTO_PATH_KEYWORDS
                || has_duplicate_normalized(&path.task)
                || has_duplicate_normalized(&path.stage)
                || path.task.iter().chain(&path.stage).any(|keyword| {
                    normalize_auto_token(keyword).as_deref() != Some(keyword.as_str())
                })
            {
                return Err(StoreError::InvalidVendor);
            }
            if let Some(name) = &path.name
                && (name.trim().is_empty()
                    || name.len() > MAX_AUTO_PATH_NAME_LEN
                    || name.trim() != name)
            {
                return Err(StoreError::InvalidVendor);
            }
            if let Some(description) = &path.description
                && (description.trim().is_empty()
                    || description.len() > MAX_AUTO_PATH_DESCRIPTION_LEN
                    || description.trim() != description)
            {
                return Err(StoreError::InvalidVendor);
            }
        }
        if let Some(decider) = &self.decider {
            decider.validate()?;
        }
        Ok(())
    }

    pub fn path(&self, id: &str) -> Option<&AutoPath> {
        self.paths.iter().find(|path| path.id == id)
    }
}

fn is_valid_auto_path_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && !matches!(value, "index" | "history" | "preview" | "audit" | "new")
        && value
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
        && !value.starts_with('-')
        && !value.ends_with('-')
        && !value.contains("--")
}

fn normalize_auto_token(value: &str) -> Option<String> {
    let normalized = value.trim().to_ascii_lowercase();
    if normalized.is_empty()
        || normalized.len() > MAX_AUTO_TOKEN_LEN
        || normalized.chars().any(|character| character.is_control())
        || !normalized.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || matches!(byte, b'.' | b'_' | b'-')
        })
        || normalized.starts_with('-')
        || normalized.ends_with('-')
    {
        return None;
    }
    Some(normalized)
}

fn has_duplicate_normalized(values: &[String]) -> bool {
    let mut seen = BTreeSet::new();
    values
        .iter()
        .filter_map(|value| normalize_auto_token(value))
        .any(|value| !seen.insert(value))
}

/// Bounded caller-supplied task context. This is data, never instructions.
/// Unknown fields and oversized values are rejected.
#[derive(Clone, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct AutoTaskContext {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub task: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stage: Option<String>,
}

impl AutoTaskContext {
    pub fn from_json(raw: &str) -> Result<Self, StoreError> {
        if raw.len() > MAX_AUTO_CONTEXT_BYTES {
            return Err(StoreError::InvalidVendor);
        }
        let context: Self = serde_json::from_str(raw).map_err(|_| StoreError::InvalidVendor)?;
        context.normalized()
    }

    pub fn normalized(&self) -> Result<Self, StoreError> {
        let task = self
            .task
            .as_deref()
            .map(|value| normalize_auto_token(value).ok_or(StoreError::InvalidVendor))
            .transpose()?;
        let stage = self
            .stage
            .as_deref()
            .map(|value| normalize_auto_token(value).ok_or(StoreError::InvalidVendor))
            .transpose()?;
        if task.is_none() && stage.is_none() {
            return Err(StoreError::InvalidVendor);
        }
        Ok(Self { task, stage })
    }
}

/// Closed decision document the decider must return. Confidence is a
/// number in [0, 1]; it is not a calibrated task-quality probability.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct AutoDecisionDocument {
    pub path: Option<String>,
    pub confidence: f64,
}

impl AutoDecisionDocument {
    pub fn from_json(raw: &str) -> Result<Self, StoreError> {
        if raw.len() > 4_096 {
            return Err(StoreError::InvalidVendor);
        }
        let document: Self = serde_json::from_str(raw).map_err(|_| StoreError::InvalidVendor)?;
        if !document.confidence.is_finite()
            || !(0.0..=1.0).contains(&document.confidence)
            || document.path.as_deref().is_some_and(|path| {
                path.is_empty() || path.len() > 64 || !is_valid_auto_path_id(path)
            })
        {
            return Err(StoreError::InvalidVendor);
        }
        Ok(document)
    }
}

/// Actually incurred decision overhead. `None` token counts mean the upstream
/// usage was unavailable; they are never fabricated from zero.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
pub struct AutoDecisionUsage {
    pub calls: u8,
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    /// True exactly when token counts were conservatively estimated because the
    /// upstream did not report usage. Estimates are never shown as reported.
    pub tokens_estimated: bool,
    pub latency_ms: u64,
    pub estimated_customer_charge_nanos: Option<i64>,
}

/// The bounded outcome of one decision attempt supplied by the gateway.
#[derive(Clone, Debug, PartialEq)]
pub enum AutoDecisionAttempt {
    Decided {
        document: AutoDecisionDocument,
        usage: AutoDecisionUsage,
    },
    Abstained {
        usage: AutoDecisionUsage,
    },
    Failed {
        reason: AutoDecisionFailure,
        usage: AutoDecisionUsage,
    },
    Cancelled {
        usage: AutoDecisionUsage,
    },
}

/// Specific decision failure. These are evidence, not request errors by
/// themselves: the configured failure policy decides between fallback and
/// rejection.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AutoDecisionFailure {
    Timeout,
    Transport,
    InvalidDecision,
    IncompatiblePath,
    ModelNotGranted,
    InputBoundExceeded,
    OutputBoundExceeded,
    SpendBoundExceeded,
    SpendUnknown,
    CallBoundExceeded,
}

impl AutoDecisionFailure {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Timeout => "timeout",
            Self::Transport => "transport",
            Self::InvalidDecision => "invalid_decision",
            Self::IncompatiblePath => "incompatible_path",
            Self::ModelNotGranted => "model_not_granted",
            Self::InputBoundExceeded => "input_bound_exceeded",
            Self::OutputBoundExceeded => "output_bound_exceeded",
            Self::SpendBoundExceeded => "spend_bound_exceeded",
            Self::SpendUnknown => "spend_unknown",
            Self::CallBoundExceeded => "call_bound_exceeded",
        }
    }
}

/// Final effect of Auto evaluation. The request still applies ordinary
/// candidate eligibility and billing admission after this decision.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AutoDecisionOutcome {
    ContextMatch,
    DeciderSelected,
    PriorityWeightFallback,
    Rejected,
    Cancelled,
}

impl AutoDecisionOutcome {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ContextMatch => "context_match",
            Self::DeciderSelected => "decider_selected",
            Self::PriorityWeightFallback => "priority_weight_fallback",
            Self::Rejected => "rejected",
            Self::Cancelled => "cancelled",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AutoFallbackReason {
    NoCompatiblePath,
    NoDecider,
    DeciderAbstained,
    DeciderFailed,
    DeciderCancelled,
}

impl AutoFallbackReason {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::NoCompatiblePath => "no_compatible_path",
            Self::NoDecider => "no_decider",
            Self::DeciderAbstained => "decider_abstained",
            Self::DeciderFailed => "decider_failed",
            Self::DeciderCancelled => "decider_cancelled",
        }
    }
}

/// Final Auto decision plus bounded overhead evidence.
#[derive(Clone, Debug, PartialEq)]
pub struct AutoDecision {
    pub outcome: AutoDecisionOutcome,
    pub selected_path: Option<String>,
    pub fallback_reason: Option<AutoFallbackReason>,
    pub failure: Option<AutoDecisionFailure>,
    pub usage: AutoDecisionUsage,
}

impl AutoDecision {
    /// Observable evidence. Estimated charges are decimal strings because they
    /// are currency nanounits, not JavaScript-safe integers.
    pub fn evidence(&self) -> Value {
        json!({
            "outcome": self.outcome.as_str(),
            "path": self.selected_path,
            "fallback_reason": self.fallback_reason.map(AutoFallbackReason::as_str),
            "failure": self.failure.map(AutoDecisionFailure::as_str),
            "calls": self.usage.calls,
            "input_tokens": self.usage.input_tokens,
            "output_tokens": self.usage.output_tokens,
            "latency_ms": self.usage.latency_ms,
            "tokens_estimated": self.usage.tokens_estimated,
            "estimated_customer_charge_nanos": self
                .usage
                .estimated_customer_charge_nanos
                .map(|value| value.to_string()),
        })
    }

    pub fn selected(
        selected_path: Option<String>,
        outcome: AutoDecisionOutcome,
        usage: AutoDecisionUsage,
    ) -> Self {
        Self {
            outcome,
            selected_path,
            fallback_reason: None,
            failure: None,
            usage,
        }
    }

    fn fallback(
        reason: AutoFallbackReason,
        failure: Option<AutoDecisionFailure>,
        usage: AutoDecisionUsage,
        action: AutoDecisionAction,
    ) -> Self {
        let outcome = if action == AutoDecisionAction::Reject {
            AutoDecisionOutcome::Rejected
        } else {
            AutoDecisionOutcome::PriorityWeightFallback
        };
        Self {
            outcome,
            selected_path: None,
            fallback_reason: Some(reason),
            failure,
            usage,
        }
    }
}

fn context_matches(path: &AutoPath, context: &AutoTaskContext) -> bool {
    if path.task.is_empty() && path.stage.is_empty() {
        return false;
    }
    let task_matches = path.task.is_empty()
        || context
            .task
            .as_deref()
            .is_some_and(|task| path.task.iter().any(|keyword| keyword == task));
    let stage_matches = path.stage.is_empty()
        || context
            .stage
            .as_deref()
            .is_some_and(|stage| path.stage.iter().any(|keyword| keyword == stage));
    task_matches && stage_matches
}

/// Return the compatible request list and the caller-context match, if any.
/// This is the deterministic first stage shared by preview and runtime, and it
/// never invokes a model.
pub fn match_auto_context(
    strategy: &AutoStrategy,
    response_type: AutoResponseType,
    context: Option<&AutoTaskContext>,
    compatible_path_ids: &[String],
) -> Option<AutoDecision> {
    let context = context?;
    let path = strategy.paths.iter().find(|path| {
        path.response_type == response_type
            && compatible_path_ids.contains(&path.id)
            && context_matches(path, context)
    })?;
    Some(AutoDecision::selected(
        Some(path.id.clone()),
        AutoDecisionOutcome::ContextMatch,
        AutoDecisionUsage::default(),
    ))
}

/// Evaluate Auto without any model call. The caller passes only paths that are
/// already compatible with the request's response type, protocol, capability
/// filters, grants and supply eligibility.
///
/// Caller-supplied context is evaluated first. Without a match, an explicitly
/// configured decider may select one compatible path. Its decision is checked
/// against the same compatible set; an unknown or incompatible path is a
/// failure. Abstention and failure apply the configured policy and otherwise
/// fall back deterministically to the caller's priority/weight selection.
pub fn evaluate_auto_decision(
    strategy: &AutoStrategy,
    response_type: AutoResponseType,
    context: Option<&AutoTaskContext>,
    compatible_path_ids: &[String],
    attempt: Option<AutoDecisionAttempt>,
) -> AutoDecision {
    let compatible: Vec<&AutoPath> = strategy
        .paths
        .iter()
        .filter(|path| {
            path.response_type == response_type && compatible_path_ids.contains(&path.id)
        })
        .collect();
    if compatible.is_empty() {
        return AutoDecision::fallback(
            AutoFallbackReason::NoCompatiblePath,
            None,
            AutoDecisionUsage::default(),
            AutoDecisionAction::Fallback,
        );
    }
    if let Some(decision) =
        match_auto_context(strategy, response_type, context, compatible_path_ids)
    {
        return decision;
    }
    let Some(decider) = &strategy.decider else {
        return AutoDecision::fallback(
            AutoFallbackReason::NoDecider,
            None,
            AutoDecisionUsage::default(),
            AutoDecisionAction::Fallback,
        );
    };
    let Some(attempt) = attempt else {
        return AutoDecision::fallback(
            AutoFallbackReason::DeciderFailed,
            Some(AutoDecisionFailure::Transport),
            AutoDecisionUsage::default(),
            decider.on_failure,
        );
    };
    match attempt {
        AutoDecisionAttempt::Cancelled { usage } => AutoDecision {
            outcome: AutoDecisionOutcome::Cancelled,
            selected_path: None,
            fallback_reason: Some(AutoFallbackReason::DeciderCancelled),
            failure: None,
            usage,
        },
        AutoDecisionAttempt::Abstained { usage } => AutoDecision::fallback(
            AutoFallbackReason::DeciderAbstained,
            None,
            usage,
            decider.on_abstain,
        ),
        AutoDecisionAttempt::Failed { reason, usage } => AutoDecision::fallback(
            AutoFallbackReason::DeciderFailed,
            Some(reason),
            usage,
            decider.on_failure,
        ),
        AutoDecisionAttempt::Decided { document, usage } => {
            let Some(path_id) = document.path else {
                return AutoDecision::fallback(
                    AutoFallbackReason::DeciderAbstained,
                    None,
                    usage,
                    decider.on_abstain,
                );
            };
            if document.confidence < decider.min_confidence {
                return AutoDecision::fallback(
                    AutoFallbackReason::DeciderAbstained,
                    None,
                    usage,
                    decider.on_abstain,
                );
            }
            if !compatible.iter().any(|path| path.id == path_id) {
                return AutoDecision::fallback(
                    AutoFallbackReason::DeciderFailed,
                    Some(AutoDecisionFailure::IncompatiblePath),
                    usage,
                    decider.on_failure,
                );
            }
            AutoDecision::selected(Some(path_id), AutoDecisionOutcome::DeciderSelected, usage)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn decider(action: AutoDecisionAction) -> AutoDecider {
        AutoDecider {
            model: "fast".into(),
            currency: "USD".into(),
            timeout_ms: 800,
            max_calls: 1,
            max_input_tokens: 1_024,
            max_output_tokens: 32,
            max_spend_nanos: 5_000_000,
            min_confidence: 0.6,
            on_abstain: action,
            on_failure: action,
        }
    }

    fn strategy() -> AutoStrategy {
        AutoStrategy {
            paths: vec![
                AutoPath {
                    id: "deep".into(),
                    name: Some("Deep reasoning".into()),
                    description: Some("Multi-step reasoning and architecture work".into()),
                    response_type: AutoResponseType::Text,
                    candidates: vec!["deep-model".into()],
                    task: vec!["architecture".into(), "debugging".into()],
                    stage: vec![],
                },
                AutoPath {
                    id: "quick".into(),
                    name: Some("Quick answers".into()),
                    description: None,
                    response_type: AutoResponseType::Text,
                    candidates: vec!["fast".into()],
                    task: vec!["chat".into()],
                    stage: vec!["draft".into()],
                },
            ],
            decider: Some(decider(AutoDecisionAction::Fallback)),
        }
    }

    fn compatible() -> Vec<String> {
        vec!["deep".into(), "quick".into()]
    }

    fn usage() -> AutoDecisionUsage {
        AutoDecisionUsage {
            calls: 1,
            input_tokens: Some(120),
            output_tokens: Some(12),
            tokens_estimated: false,
            latency_ms: 87,
            estimated_customer_charge_nanos: Some(42),
        }
    }

    #[test]
    fn schema_round_trips_and_rejects_unbounded_deciders() {
        let value = serde_json::to_value(strategy()).unwrap();
        let parsed: AutoStrategy = serde_json::from_value(value.clone()).unwrap();
        assert_eq!(parsed, strategy());
        assert!(strategy().validate().is_ok());

        for invalid in [
            json!({"paths": []}),
            json!({"paths": [{"id": "only", "response_type": "text", "candidates": ["fast"]}]}),
            json!({"paths": [
                {"id": "a", "response_type": "text", "candidates": ["fast"]},
                {"id": "a", "response_type": "text", "candidates": ["fast"]}
            ]}),
            json!({"paths": [
                {"id": "a", "response_type": "text", "candidates": ["fast"]},
                {"id": "b", "response_type": "text", "candidates": ["fast"], "task": ["Bad Token"]}
            ]}),
            json!({"paths": [
                {"id": "a", "response_type": "text", "candidates": ["fast"]},
                {"id": "b", "response_type": "text", "candidates": ["fast"], "task": ["Coding"]}
            ]}),
            json!({"paths": [
                {"id": "a", "response_type": "text", "candidates": ["fast"]},
                {"id": "b", "response_type": "text", "candidates": ["fast"]}
            ], "decider": {"model": "pool/other", "currency": "USD", "timeout_ms": 800, "max_calls": 1,
                "max_input_tokens": 1024, "max_output_tokens": 32, "max_spend_nanos": 1,
                "min_confidence": 0.5}}),
            json!({"paths": [
                {"id": "a", "response_type": "text", "candidates": ["fast"]},
                {"id": "b", "response_type": "text", "candidates": ["fast"]}
            ], "decider": {"model": "fast", "currency": "USD", "timeout_ms": 800, "max_calls": 2,
                "max_input_tokens": 1024, "max_output_tokens": 32, "max_spend_nanos": 1,
                "min_confidence": 0.5}}),
            json!({"paths": [
                {"id": "a", "response_type": "text", "candidates": ["fast"]},
                {"id": "b", "response_type": "text", "candidates": ["fast"]}
            ], "decider": {"model": "fast", "currency": "USD", "timeout_ms": 10, "max_calls": 1,
                "max_input_tokens": 1024, "max_output_tokens": 32, "max_spend_nanos": 1,
                "min_confidence": 0.5}}),
            json!({"paths": [
                {"id": "a", "response_type": "text", "candidates": ["fast"]},
                {"id": "b", "response_type": "text", "candidates": ["fast"]}
            ], "decider": {"model": "fast", "currency": "USD", "timeout_ms": 800, "max_calls": 1,
                "max_input_tokens": 1024, "max_output_tokens": 32, "max_spend_nanos": 0,
                "min_confidence": 0.5}}),
            json!({"paths": [
                {"id": "a", "response_type": "text", "candidates": ["fast"]},
                {"id": "b", "response_type": "text", "candidates": ["fast"]}
            ], "decider": {"model": "fast", "currency": "USD", "timeout_ms": 800, "max_calls": 1,
                "max_input_tokens": 1024, "max_output_tokens": 32, "max_spend_nanos": 1,
                "min_confidence": 1.5}}),
        ] {
            let parsed: AutoStrategy = serde_json::from_value(invalid).unwrap();
            assert!(parsed.validate().is_err());
        }
    }

    #[test]
    fn path_candidates_must_not_expand_the_top_level_policy() {
        let aliases: BTreeSet<String> = ["fast".to_owned()].into();
        let mut value = strategy();
        value.paths[0].candidates = vec!["not-in-policy".into()];
        assert!(value.validate().is_ok());
        assert!(value.validate_against_candidates(&aliases).is_err());
    }

    #[test]
    fn caller_context_is_bounded_and_normalized() {
        let context =
            AutoTaskContext::from_json(r#"{"task":"  Architecture ","stage":"Draft"}"#).unwrap();
        assert_eq!(context.task.as_deref(), Some("architecture"));
        assert_eq!(context.stage.as_deref(), Some("draft"));
        for invalid in [
            "{}",
            r#"{"task":"a","extra":true}"#,
            r#"{"task":""}"#,
            r#"{"task":"bad token"}"#,
            r#"{"task":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}"#,
            r#"{"task":"a","task":"b"}"#,
            r#"not json"#,
        ] {
            assert!(AutoTaskContext::from_json(invalid).is_err(), "{invalid}");
        }
        assert!(
            AutoTaskContext::from_json(&format!(
                r#"{{"task":"{}"}}"#,
                "a".repeat(MAX_AUTO_CONTEXT_BYTES)
            ))
            .is_err()
        );
    }

    #[test]
    fn context_match_wins_before_any_decider_call() {
        let context = AutoTaskContext {
            task: Some("architecture".into()),
            stage: None,
        };
        let decision = evaluate_auto_decision(
            &strategy(),
            AutoResponseType::Text,
            Some(&context),
            &compatible(),
            None,
        );
        assert_eq!(decision.outcome, AutoDecisionOutcome::ContextMatch);
        assert_eq!(decision.selected_path.as_deref(), Some("deep"));
        assert_eq!(decision.usage.calls, 0);
        assert_eq!(decision.usage.latency_ms, 0);
    }

    #[test]
    fn response_type_and_compatible_ids_are_enforced() {
        let context = AutoTaskContext {
            task: Some("architecture".into()),
            stage: None,
        };
        let decision = evaluate_auto_decision(
            &strategy(),
            AutoResponseType::Embedding,
            Some(&context),
            &compatible(),
            None,
        );
        assert_eq!(
            decision.outcome,
            AutoDecisionOutcome::PriorityWeightFallback
        );
        assert_eq!(
            decision.fallback_reason,
            Some(AutoFallbackReason::NoCompatiblePath)
        );

        let decision = evaluate_auto_decision(
            &strategy(),
            AutoResponseType::Text,
            Some(&context),
            &["quick".into()],
            None,
        );
        assert_eq!(
            decision.fallback_reason,
            Some(AutoFallbackReason::DeciderFailed)
        );

        let mut context_only = strategy();
        context_only.decider = None;
        let unmatched = AutoTaskContext {
            task: Some("unmatched".into()),
            stage: None,
        };
        let decision = evaluate_auto_decision(
            &context_only,
            AutoResponseType::Text,
            Some(&unmatched),
            &compatible(),
            None,
        );
        assert_eq!(
            decision.fallback_reason,
            Some(AutoFallbackReason::NoDecider)
        );
    }

    #[test]
    fn abstention_confidence_and_failure_follow_policy() {
        let context = AutoTaskContext {
            task: Some("unmatched".into()),
            stage: None,
        };
        let decided = |path: Option<&str>, confidence: f64| AutoDecisionAttempt::Decided {
            document: AutoDecisionDocument {
                path: path.map(str::to_owned),
                confidence,
            },
            usage: usage(),
        };
        let decision = evaluate_auto_decision(
            &strategy(),
            AutoResponseType::Text,
            Some(&context),
            &compatible(),
            Some(decided(Some("quick"), 0.9)),
        );
        assert_eq!(decision.outcome, AutoDecisionOutcome::DeciderSelected);
        assert_eq!(decision.selected_path.as_deref(), Some("quick"));
        assert_eq!(decision.usage.calls, 1);

        for attempt in [
            decided(None, 0.99),
            decided(Some("quick"), 0.59),
            AutoDecisionAttempt::Abstained { usage: usage() },
        ] {
            let decision = evaluate_auto_decision(
                &strategy(),
                AutoResponseType::Text,
                Some(&context),
                &compatible(),
                Some(attempt),
            );
            assert_eq!(
                decision.outcome,
                AutoDecisionOutcome::PriorityWeightFallback
            );
            assert_eq!(
                decision.fallback_reason,
                Some(AutoFallbackReason::DeciderAbstained)
            );
            assert_eq!(decision.usage.calls, 1);
        }

        let mut rejecting = strategy();
        rejecting.decider.as_mut().unwrap().on_abstain = AutoDecisionAction::Reject;
        let decision = evaluate_auto_decision(
            &rejecting,
            AutoResponseType::Text,
            Some(&context),
            &compatible(),
            Some(AutoDecisionAttempt::Abstained { usage: usage() }),
        );
        assert_eq!(decision.outcome, AutoDecisionOutcome::Rejected);
        assert_eq!(
            decision.fallback_reason,
            Some(AutoFallbackReason::DeciderAbstained)
        );
    }

    #[test]
    fn incompatible_decision_is_a_failure_never_a_substitution() {
        let context = AutoTaskContext {
            task: Some("unmatched".into()),
            stage: None,
        };
        for path in ["missing", "deep"] {
            let mut decider = strategy();
            decider.decider.as_mut().unwrap().on_failure = AutoDecisionAction::Fallback;
            let decision = evaluate_auto_decision(
                &decider,
                AutoResponseType::Text,
                Some(&context),
                &["quick".into()],
                Some(AutoDecisionAttempt::Decided {
                    document: AutoDecisionDocument {
                        path: Some(path.into()),
                        confidence: 0.9,
                    },
                    usage: usage(),
                }),
            );
            assert_eq!(
                decision.outcome,
                AutoDecisionOutcome::PriorityWeightFallback
            );
            assert_eq!(
                decision.failure,
                Some(AutoDecisionFailure::IncompatiblePath)
            );
            assert_eq!(decision.selected_path, None);
        }

        let mut failing = strategy();
        failing.decider.as_mut().unwrap().on_failure = AutoDecisionAction::Reject;
        let decision = evaluate_auto_decision(
            &failing,
            AutoResponseType::Text,
            Some(&context),
            &compatible(),
            Some(AutoDecisionAttempt::Failed {
                reason: AutoDecisionFailure::Timeout,
                usage: usage(),
            }),
        );
        assert_eq!(decision.outcome, AutoDecisionOutcome::Rejected);
        assert_eq!(decision.failure, Some(AutoDecisionFailure::Timeout));
    }

    #[test]
    fn cancellation_is_not_a_fallback() {
        let context = AutoTaskContext {
            task: Some("unmatched".into()),
            stage: None,
        };
        let decision = evaluate_auto_decision(
            &strategy(),
            AutoResponseType::Text,
            Some(&context),
            &compatible(),
            Some(AutoDecisionAttempt::Cancelled { usage: usage() }),
        );
        assert_eq!(decision.outcome, AutoDecisionOutcome::Cancelled);
        assert_eq!(
            decision.fallback_reason,
            Some(AutoFallbackReason::DeciderCancelled)
        );
        assert_eq!(decision.selected_path, None);
    }

    #[test]
    fn evidence_keeps_tokens_latency_and_charge_separate() {
        let decision = AutoDecision {
            outcome: AutoDecisionOutcome::DeciderSelected,
            selected_path: Some("deep".into()),
            fallback_reason: None,
            failure: None,
            usage: usage(),
        };
        assert_eq!(
            decision.evidence(),
            json!({
                "outcome": "decider_selected",
                "path": "deep",
                "fallback_reason": null,
                "failure": null,
                "calls": 1,
                "input_tokens": 120,
                "output_tokens": 12,
                "latency_ms": 87,
                "tokens_estimated": false,
                "estimated_customer_charge_nanos": "42",
            })
        );
    }
}
