//! Metadata-only execution interchange. Tenant scope comes from authenticated
//! ingestion, never from an imported payload. This module does not execute work.
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

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
}
