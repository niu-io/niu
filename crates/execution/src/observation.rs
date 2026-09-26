//! Metadata-only execution interchange. Tenant scope comes from authenticated
//! ingestion, never from an imported payload. This module does not execute work.
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet, VecDeque};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ExecutionRecord {
    pub schema_version: u16,
    pub source: String,
    pub record_id: String,
    pub task_id: String,
    pub coverage: Coverage,
    pub spans: Vec<Span>,
    pub links: Vec<Link>,
    pub outcomes: Vec<Outcome>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Coverage {
    Complete,
    Partial,
    Unknown,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Span {
    pub id: String,
    pub kind: SpanKind,
    /// Absent means the source did not report a lifecycle state.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<SpanStatus>,
    pub started_at_ms: Option<i64>,
    pub ended_at_ms: Option<i64>,
    pub requested_model: Option<String>,
    /// Absent unless the source provides actual-model evidence.
    pub reported_model: Option<String>,
    /// Reference to the canonical accounting event, not an additional charge.
    pub charge_ref: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SpanStatus {
    Running,
    Completed,
    Failed,
    Cancelled,
    Unknown,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SpanKind {
    Task,
    Agent,
    Step,
    ModelInvocation,
    ToolInvocation,
    Attempt,
    Validation,
    HumanIntervention,
    Checkpoint,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Link {
    pub from: String,
    pub to: String,
    pub kind: LinkKind,
}
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LinkKind {
    Contains,
    Delegates,
    DependsOn,
    Retries,
    Resumes,
}
/// All edges point from prerequisite/parent to dependent/child.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Outcome {
    pub span_id: String,
    pub evidence_id: String,
    pub authority: OutcomeAuthority,
    pub result: OutcomeResult,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OutcomeAuthority {
    AgentClaim,
    DeterministicValidator,
    HumanAcceptance,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OutcomeResult {
    Accepted,
    Rejected,
    Inconclusive,
}

/// A per-authority rollup keeps self-reported claims distinct from validation
/// and human acceptance evidence. Conflicting evidence from one authority is
/// preserved rather than collapsed to the last event.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum EvidenceState {
    Absent,
    Accepted,
    Rejected,
    Inconclusive,
    Conflicting,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub struct AuthorityOutcomeSummary {
    pub state: EvidenceState,
    pub evidence_count: u64,
}

/// Task-level classification derived only from deterministic validation and
/// human acceptance. An agent claim by itself is never an accepted completion.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionOutcomeClassification {
    Accepted,
    Rejected,
    Inconclusive,
    Conflicting,
    Unverified,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub struct OutcomeSummary {
    pub classification: ExecutionOutcomeClassification,
    pub accepted_completion: bool,
    pub agent_claim: AuthorityOutcomeSummary,
    pub deterministic_validator: AuthorityOutcomeSummary,
    pub human_acceptance: AuthorityOutcomeSummary,
}

#[derive(Debug, PartialEq, Eq)]
pub enum InvalidRecord {
    Version,
    Identifier,
    Size,
    Duplicate,
    Reference,
    Interval,
    Cycle,
    TaskRoot,
}

fn identifier(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 200
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._:/-".contains(&b))
}

impl ExecutionRecord {
    pub fn validate(&self) -> Result<(), InvalidRecord> {
        if self.schema_version != 1 {
            return Err(InvalidRecord::Version);
        }
        if [&self.source, &self.record_id, &self.task_id]
            .into_iter()
            .any(|s| !identifier(s))
        {
            return Err(InvalidRecord::Identifier);
        }
        if self.spans.is_empty()
            || self.spans.len() > 10_000
            || self.links.len() > 50_000
            || self.outcomes.len() > 10_000
        {
            return Err(InvalidRecord::Size);
        }
        let mut nodes = BTreeMap::new();
        for span in &self.spans {
            if !identifier(&span.id)
                || [
                    &span.requested_model,
                    &span.reported_model,
                    &span.charge_ref,
                ]
                .into_iter()
                .flatten()
                .any(|s| !identifier(s))
            {
                return Err(InvalidRecord::Identifier);
            }
            if nodes.insert(span.id.as_str(), span).is_some() {
                return Err(InvalidRecord::Duplicate);
            }
            if span.started_at_ms.is_some_and(|n| n < 0)
                || span.ended_at_ms.is_some_and(|n| n < 0)
                || matches!((span.started_at_ms, span.ended_at_ms), (Some(a), Some(b)) if b < a)
            {
                return Err(InvalidRecord::Interval);
            }
        }
        if nodes
            .get(self.task_id.as_str())
            .is_none_or(|s| s.kind != SpanKind::Task)
        {
            return Err(InvalidRecord::TaskRoot);
        }
        let mut indegree: BTreeMap<&str, usize> = nodes.keys().map(|&id| (id, 0)).collect();
        let mut outgoing: BTreeMap<&str, Vec<&str>> = BTreeMap::new();
        let mut edges = BTreeSet::new();
        for link in &self.links {
            if !nodes.contains_key(link.from.as_str()) || !nodes.contains_key(link.to.as_str()) {
                return Err(InvalidRecord::Reference);
            }
            if !edges.insert((&link.from, &link.to, &link.kind)) {
                return Err(InvalidRecord::Duplicate);
            }
            *indegree.get_mut(link.to.as_str()).unwrap() += 1;
            outgoing.entry(&link.from).or_default().push(&link.to);
        }
        // Iterative traversal bounds stack usage even for a deeply nested trace.
        let mut ready: Vec<&str> = indegree
            .iter()
            .filter_map(|(&id, &degree)| (degree == 0).then_some(id))
            .collect();
        let mut visited = 0;
        while let Some(id) = ready.pop() {
            visited += 1;
            for &next in outgoing.get(id).into_iter().flatten() {
                let degree = indegree.get_mut(next).unwrap();
                *degree -= 1;
                if *degree == 0 {
                    ready.push(next);
                }
            }
        }
        if visited != nodes.len() {
            return Err(InvalidRecord::Cycle);
        }
        let mut evidence = BTreeSet::new();
        for outcome in &self.outcomes {
            if !nodes.contains_key(outcome.span_id.as_str()) {
                return Err(InvalidRecord::Reference);
            }
            if !identifier(&outcome.evidence_id) {
                return Err(InvalidRecord::Identifier);
            }
            if !evidence.insert(&outcome.evidence_id) {
                return Err(InvalidRecord::Duplicate);
            }
        }
        Ok(())
    }

    /// Task interval only. Parallel work durations must not be summed as latency.
    pub fn wall_clock_ms(&self) -> Option<i64> {
        let task = self
            .spans
            .iter()
            .find(|s| s.id == self.task_id && s.kind == SpanKind::Task)?;
        task.ended_at_ms?
            .checked_sub(task.started_at_ms?)
            .filter(|n| *n >= 0)
    }

    /// Referenced charges are deduplicated, but unresolved references remain unknown.
    /// A consumer must resolve them through the scoped canonical ledger.
    pub fn charge_references(&self) -> BTreeSet<&str> {
        self.spans
            .iter()
            .filter_map(|s| s.charge_ref.as_deref())
            .collect()
    }

    /// Roll up all evidence attached to this execution. Accepted completions
    /// require accepted validator or human evidence and no trusted rejection.
    pub fn outcome_summary(&self) -> OutcomeSummary {
        fn authority_summary(
            outcomes: &[Outcome],
            authority: OutcomeAuthority,
        ) -> AuthorityOutcomeSummary {
            let mut accepted = false;
            let mut rejected = false;
            let mut inconclusive = false;
            let mut evidence_count = 0;
            for outcome in outcomes.iter().filter(|item| item.authority == authority) {
                evidence_count += 1;
                match outcome.result {
                    OutcomeResult::Accepted => accepted = true,
                    OutcomeResult::Rejected => rejected = true,
                    OutcomeResult::Inconclusive => inconclusive = true,
                }
            }
            let state = match (accepted, rejected, inconclusive) {
                (false, false, false) => EvidenceState::Absent,
                (true, false, false) => EvidenceState::Accepted,
                (false, true, false) => EvidenceState::Rejected,
                (false, false, true) => EvidenceState::Inconclusive,
                _ => EvidenceState::Conflicting,
            };
            AuthorityOutcomeSummary {
                state,
                evidence_count,
            }
        }

        let agent_claim = authority_summary(&self.outcomes, OutcomeAuthority::AgentClaim);
        let deterministic_validator =
            authority_summary(&self.outcomes, OutcomeAuthority::DeterministicValidator);
        let human_acceptance = authority_summary(&self.outcomes, OutcomeAuthority::HumanAcceptance);
        let trusted = [deterministic_validator.state, human_acceptance.state];
        let all_authorities = [
            agent_claim.state,
            deterministic_validator.state,
            human_acceptance.state,
        ];
        let has_accepted = all_authorities.contains(&EvidenceState::Accepted);
        let has_rejected = all_authorities.contains(&EvidenceState::Rejected);
        let has_trusted_accepted = trusted.contains(&EvidenceState::Accepted);
        let has_trusted_rejected = trusted.contains(&EvidenceState::Rejected);
        let has_conflict = all_authorities.contains(&EvidenceState::Conflicting);
        let has_inconclusive = trusted.contains(&EvidenceState::Inconclusive);
        let classification = if has_conflict || (has_accepted && has_rejected) {
            ExecutionOutcomeClassification::Conflicting
        } else if has_trusted_rejected {
            ExecutionOutcomeClassification::Rejected
        } else if has_trusted_accepted {
            ExecutionOutcomeClassification::Accepted
        } else if has_inconclusive {
            ExecutionOutcomeClassification::Inconclusive
        } else {
            ExecutionOutcomeClassification::Unverified
        };

        OutcomeSummary {
            classification,
            accepted_completion: classification == ExecutionOutcomeClassification::Accepted,
            agent_claim,
            deterministic_validator,
            human_acceptance,
        }
    }

    /// Count model/tool work roots and orphan attempts whose whole contained
    /// subtree has no canonical charge reference. Unknown costs stay unknown.
    pub fn billable_work_without_charge_refs(&self) -> u64 {
        let mut parents: HashMap<&str, Vec<&str>> = HashMap::new();
        let mut children: HashMap<&str, Vec<&str>> = HashMap::new();
        for link in self
            .links
            .iter()
            .filter(|link| link.kind == LinkKind::Contains)
        {
            parents.entry(&link.to).or_default().push(&link.from);
            children.entry(&link.from).or_default().push(&link.to);
        }

        let mut has_charge = HashSet::new();
        let mut pending: VecDeque<&str> = self
            .spans
            .iter()
            .filter(|span| span.charge_ref.is_some())
            .map(|span| span.id.as_str())
            .collect();
        while let Some(id) = pending.pop_front() {
            if !has_charge.insert(id) {
                continue;
            }
            pending.extend(parents.get(id).into_iter().flatten().copied());
        }

        let mut invocation_subtree = HashSet::new();
        let mut pending: VecDeque<&str> = self
            .spans
            .iter()
            .filter(|span| {
                matches!(
                    span.kind,
                    SpanKind::ModelInvocation | SpanKind::ToolInvocation
                )
            })
            .map(|span| span.id.as_str())
            .collect();
        while let Some(id) = pending.pop_front() {
            if !invocation_subtree.insert(id) {
                continue;
            }
            pending.extend(children.get(id).into_iter().flatten().copied());
        }

        let invocation_count = self
            .spans
            .iter()
            .filter(|span| {
                matches!(
                    span.kind,
                    SpanKind::ModelInvocation | SpanKind::ToolInvocation
                ) && !has_charge.contains(span.id.as_str())
            })
            .count() as u64;
        let orphan_attempt_count = self
            .spans
            .iter()
            .filter(|span| {
                span.kind == SpanKind::Attempt
                    && !invocation_subtree.contains(span.id.as_str())
                    && !has_charge.contains(span.id.as_str())
            })
            .count() as u64;
        invocation_count + orphan_attempt_count
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> ExecutionRecord {
        serde_json::from_str(include_str!(
            "../../../contracts/fixtures/parallel-task.v1.json"
        ))
        .unwrap()
    }
    #[test]
    fn parallel_retry_resume_and_outcome_provenance() {
        let record = fixture();
        record.validate().unwrap();
        assert_eq!(record.wall_clock_ms(), Some(100));
        assert_eq!(record.charge_references().len(), 2);
        assert_ne!(record.outcomes[0].authority, record.outcomes[1].authority);
        assert!(
            record
                .spans
                .iter()
                .any(|s| s.requested_model.is_some() && s.reported_model.is_none())
        );
        assert_eq!(
            record
                .spans
                .iter()
                .find(|span| span.id == "attempt-retry")
                .unwrap()
                .status,
            Some(SpanStatus::Cancelled)
        );
    }
    #[test]
    fn javascript_recorder_fixture_matches_the_public_rust_contract() {
        let record: ExecutionRecord = serde_json::from_str(include_str!(
            "../../../contracts/fixtures/execution-recorder.v1.json"
        ))
        .unwrap();
        record.validate().unwrap();
        assert_eq!(record.wall_clock_ms(), Some(9));
        assert_eq!(record.billable_work_without_charge_refs(), 1);
        assert!(record.outcome_summary().accepted_completion);
    }
    #[test]
    fn rejects_cycles_conflicts_and_unknown_content_fields() {
        let mut record = fixture();
        record.links.push(Link {
            from: "attempt-retry".into(),
            to: "task".into(),
            kind: LinkKind::DependsOn,
        });
        assert_eq!(record.validate(), Err(InvalidRecord::Cycle));
        let mut record = fixture();
        record.spans.push(record.spans[0].clone());
        assert_eq!(record.validate(), Err(InvalidRecord::Duplicate));
        let mut json = serde_json::to_value(fixture()).unwrap();
        json["spans"][0]["prompt"] = serde_json::json!("raw content");
        assert!(serde_json::from_value::<ExecutionRecord>(json).is_err());
        let mut record = fixture();
        record.spans[0].ended_at_ms = None;
        assert_eq!(record.wall_clock_ms(), None);
        record.schema_version = 2;
        assert_eq!(record.validate(), Err(InvalidRecord::Version));
    }

    #[test]
    fn task_acceptance_requires_validator_or_human_evidence() {
        let mut record = fixture();
        let summary = record.outcome_summary();
        assert_eq!(
            summary.classification,
            ExecutionOutcomeClassification::Conflicting
        );
        assert_eq!(summary.agent_claim.state, EvidenceState::Accepted);
        assert_eq!(
            summary.deterministic_validator.state,
            EvidenceState::Rejected
        );
        assert!(!summary.accepted_completion);

        record
            .outcomes
            .retain(|outcome| outcome.authority == OutcomeAuthority::AgentClaim);
        let summary = record.outcome_summary();
        assert_eq!(
            summary.classification,
            ExecutionOutcomeClassification::Unverified
        );
        assert_eq!(summary.agent_claim.state, EvidenceState::Accepted);
    }

    #[test]
    fn trusted_authority_disagreement_stays_conflicting() {
        let mut record = fixture();
        record.outcomes.push(Outcome {
            span_id: "task".into(),
            evidence_id: "human-accepted".into(),
            authority: OutcomeAuthority::HumanAcceptance,
            result: OutcomeResult::Accepted,
        });
        assert_eq!(
            record.outcome_summary().classification,
            ExecutionOutcomeClassification::Conflicting
        );

        let mut record = fixture();
        record
            .outcomes
            .retain(|outcome| outcome.authority != OutcomeAuthority::DeterministicValidator);
        record.outcomes.push(Outcome {
            span_id: "task".into(),
            evidence_id: "human-accepted".into(),
            authority: OutcomeAuthority::HumanAcceptance,
            result: OutcomeResult::Accepted,
        });
        let summary = record.outcome_summary();
        assert_eq!(
            summary.classification,
            ExecutionOutcomeClassification::Accepted
        );
        assert!(summary.accepted_completion);
    }

    #[test]
    fn contradictory_evidence_from_one_authority_stays_conflicting() {
        let mut record = fixture();
        record.outcomes.push(Outcome {
            span_id: "task".into(),
            evidence_id: "validator-accepted".into(),
            authority: OutcomeAuthority::DeterministicValidator,
            result: OutcomeResult::Accepted,
        });
        let summary = record.outcome_summary();
        assert_eq!(
            summary.deterministic_validator.state,
            EvidenceState::Conflicting
        );
        assert_eq!(
            summary.classification,
            ExecutionOutcomeClassification::Conflicting
        );
        assert!(!summary.accepted_completion);
    }

    #[test]
    fn charge_reference_on_a_contained_attempt_covers_its_invocation() {
        let mut record = fixture();
        record
            .spans
            .iter_mut()
            .find(|span| span.id == "model")
            .unwrap()
            .charge_ref = None;
        record.links.push(Link {
            from: "model".into(),
            to: "attempt".into(),
            kind: LinkKind::Contains,
        });
        assert_eq!(record.billable_work_without_charge_refs(), 1);
        record
            .spans
            .iter_mut()
            .find(|span| span.id == "tool")
            .unwrap()
            .charge_ref = Some("charge-tool".into());
        assert_eq!(record.billable_work_without_charge_refs(), 0);
    }
}
