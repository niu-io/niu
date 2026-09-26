//! Conservative analysis for opt-in, paired task evaluations.
//!
//! This module evaluates already-collected public execution records. It does
//! not dispatch model or agent work, authorize a spend, or claim that imported
//! evidence is authentic. A future runner must enforce those boundaries before
//! recording a result here.

use std::collections::{BTreeMap, BTreeSet};

use niu_execution::observation::{Coverage, ExecutionRecord, LinkKind, SpanKind};
use serde::{Deserialize, Serialize};

const MAX_TRIALS: usize = 10_000;
const MAX_REPETITIONS: u16 = 100;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PairedExperiment {
    pub schema_version: u16,
    pub mode: EvidenceKind,
    /// Explicit user intent is required before a caller may use a future runner.
    pub opt_in: bool,
    /// Human-readable approval metadata. This is not an authorization token.
    pub authorization_ref: String,
    pub candidates: [Candidate; 2],
    pub tasks: Vec<TaskSnapshot>,
    pub repetitions: u16,
    pub acceptance: AcceptanceCriteria,
    pub cash_budget: CashBudget,
    pub trials: Vec<Trial>,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum EvidenceKind {
    Observed,
    Heuristic,
    UntestedEstimate,
    PairedExperiment,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Candidate {
    pub id: String,
    pub model_alias: String,
    pub offer_revision: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct TaskSnapshot {
    pub id: String,
    pub snapshot_sha256: String,
    pub tools_sha256: String,
    pub permissions_sha256: String,
    pub acceptance_sha256: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct AcceptanceCriteria {
    pub max_latency_ms: u64,
    pub min_quality_basis_points: u16,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CashBudget {
    pub currency: String,
    /// Exact nonnegative nanounit amount encoded as a decimal string.
    pub limit_nanos: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Trial {
    pub task_snapshot_id: String,
    pub candidate_id: String,
    pub offer_revision: String,
    pub repetition: u16,
    pub execution: ExecutionRecord,
    /// Deterministic evaluator score in basis points. Unknown stays absent.
    pub quality_basis_points: Option<u16>,
    pub costs: TrialCosts,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct TrialCosts {
    pub currency: String,
    /// API-equivalent and cash totals come from canonical settled ledger data.
    pub api_equivalent_nanos: String,
    /// Evaluation inference is attributed separately, then included in total.
    pub evaluator_api_equivalent_nanos: String,
    pub cash_nanos: String,
    /// Evaluator work is reported separately, then included in total cash.
    pub evaluator_cash_nanos: String,
    /// False means an observed liability (such as tool work) is still unknown.
    pub complete: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PairResult {
    CandidateAWins,
    CandidateBWins,
    Tie,
    BothFailAcceptance,
}

#[derive(Clone, Debug, Serialize)]
pub struct ExperimentReport {
    pub schema_version: u16,
    pub evidence_kind: EvidenceKind,
    pub authorization_ref: String,
    pub currency: String,
    pub cash_budget_nanos: String,
    pub total_cash_nanos: String,
    pub api_equivalent_nanos: String,
    pub candidates: Vec<CandidateReport>,
    pub pairs: Vec<PairReport>,
    pub paired_uncertainty_95: WilsonInterval,
    pub diagnostics: Vec<Diagnostic>,
    pub limits: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct CandidateReport {
    pub candidate_id: String,
    pub model_alias: String,
    pub offer_revision: String,
    pub runs: u64,
    pub complete_coverage_runs: u64,
    pub source_accepted_runs: u64,
    pub qualified_completions: u64,
    pub qualification_rate_basis_points: u16,
    pub api_equivalent_per_qualified_completion: Option<ExactRatio>,
    pub cash_per_qualified_completion: Option<ExactRatio>,
    pub api_equivalent_nanos: String,
    pub evaluator_api_equivalent_nanos: String,
    pub total_api_equivalent_nanos: String,
    pub cash_nanos: String,
    pub evaluator_cash_nanos: String,
    pub total_cash_nanos: String,
    pub observed_latency_p50_ms: Option<u64>,
    pub observed_latency_p95_ms: Option<u64>,
}

#[derive(Clone, Debug, Serialize)]
pub struct ExactRatio {
    pub numerator_nanos: String,
    pub denominator: u64,
}

#[derive(Clone, Debug, Serialize)]
pub struct PairReport {
    pub task_snapshot_id: String,
    pub repetition: u16,
    pub result: PairResult,
}

#[derive(Clone, Debug, Serialize)]
pub struct WilsonInterval {
    pub wins: u64,
    pub losses: u64,
    pub ties: u64,
    pub both_failed: u64,
    pub evaluated_pairs: u64,
    pub lower_95: Option<f64>,
    pub upper_95: Option<f64>,
}

#[derive(Clone, Debug, Serialize)]
pub struct Diagnostic {
    pub label: String,
    pub rule: String,
    pub summary: String,
    pub evidence: Vec<EvidenceLink>,
}

#[derive(Clone, Debug, Serialize)]
pub struct EvidenceLink {
    pub candidate_id: String,
    pub task_snapshot_id: String,
    pub record_id: String,
    pub span_ids: Vec<String>,
}

#[derive(Debug, thiserror::Error, Eq, PartialEq)]
pub enum EvaluationError {
    #[error("unsupported benchmark schema or evidence mode")]
    Schema,
    #[error("paired experiment must be explicitly opted in and have an authorization reference")]
    NotAuthorized,
    #[error("two distinct candidates are required")]
    Candidate,
    #[error("invalid task snapshot or acceptance criteria")]
    TaskSnapshot,
    #[error("invalid repetitions or trial count")]
    TrialCount,
    #[error("trial set is incomplete, duplicated, or mismatched")]
    Pairing,
    #[error("execution record is invalid")]
    Execution,
    #[error("trial is missing complete settled cost evidence")]
    IncompleteCost,
    #[error("cost evidence currency differs from the declared budget")]
    Currency,
    #[error("invalid exact monetary amount")]
    Amount,
    #[error("monetary total exceeds the supported integer range")]
    AmountOverflow,
    #[error("the experiment exceeded its declared cash budget")]
    BudgetExceeded,
}

impl PairedExperiment {
    /// Validate matched snapshots and calculate a report from fully settled
    /// costs. No estimates are silently included as experiment outcomes.
    pub fn evaluate(&self) -> Result<ExperimentReport, EvaluationError> {
        if self.schema_version != 1 || self.mode != EvidenceKind::PairedExperiment {
            return Err(EvaluationError::Schema);
        }
        if !self.opt_in || self.authorization_ref.trim().is_empty() {
            return Err(EvaluationError::NotAuthorized);
        }
        if self.candidates[0].id.trim().is_empty()
            || self.candidates[1].id.trim().is_empty()
            || self.candidates[0].id == self.candidates[1].id
            || self.candidates.iter().any(|candidate| {
                candidate.model_alias.trim().is_empty()
                    || candidate.offer_revision.trim().is_empty()
            })
        {
            return Err(EvaluationError::Candidate);
        }
        if self.tasks.is_empty()
            || self.tasks.iter().any(|task| {
                task.id.trim().is_empty()
                    || !valid_sha256(&task.snapshot_sha256)
                    || !valid_sha256(&task.tools_sha256)
                    || !valid_sha256(&task.permissions_sha256)
                    || !valid_sha256(&task.acceptance_sha256)
            })
            || self.acceptance.min_quality_basis_points > 10_000
            || self.cash_budget.currency.len() != 3
            || !self
                .cash_budget
                .currency
                .bytes()
                .all(|b| b.is_ascii_uppercase())
        {
            return Err(EvaluationError::TaskSnapshot);
        }
        let task_ids: BTreeSet<_> = self.tasks.iter().map(|task| task.id.as_str()).collect();
        if task_ids.len() != self.tasks.len() {
            return Err(EvaluationError::TaskSnapshot);
        }
        if self.repetitions == 0 || self.repetitions > MAX_REPETITIONS {
            return Err(EvaluationError::TrialCount);
        }
        let expected = self
            .tasks
            .len()
            .checked_mul(usize::from(self.repetitions))
            .and_then(|count| count.checked_mul(2))
            .ok_or(EvaluationError::TrialCount)?;
        if expected > MAX_TRIALS || self.trials.len() != expected {
            return Err(EvaluationError::TrialCount);
        }

        let budget = parse_amount(&self.cash_budget.limit_nanos)?;
        let task_by_id: BTreeMap<_, _> = self
            .tasks
            .iter()
            .map(|task| (task.id.as_str(), task))
            .collect();
        let candidate_by_id: BTreeMap<_, _> = self
            .candidates
            .iter()
            .map(|candidate| (candidate.id.as_str(), candidate))
            .collect();
        let mut trial_by_key = BTreeMap::new();
        let mut record_ids = BTreeSet::new();
        let mut total_cash = 0_u128;
        let mut total_api = 0_u128;
        for trial in &self.trials {
            let candidate = candidate_by_id
                .get(trial.candidate_id.as_str())
                .ok_or(EvaluationError::Pairing)?;
            let task = task_by_id
                .get(trial.task_snapshot_id.as_str())
                .ok_or(EvaluationError::Pairing)?;
            if trial.repetition == 0
                || trial.repetition > self.repetitions
                || trial.offer_revision != candidate.offer_revision
                || !trial.execution.spans.iter().any(|span| {
                    span.kind == SpanKind::ModelInvocation
                        && span.requested_model.as_deref() == Some(candidate.model_alias.as_str())
                })
                || trial.execution.validate().is_err()
                || trial
                    .quality_basis_points
                    .is_some_and(|score| score > 10_000)
            {
                return Err(if trial.execution.validate().is_err() {
                    EvaluationError::Execution
                } else {
                    EvaluationError::Pairing
                });
            }
            if !trial.costs.complete || trial.execution.billable_work_without_charge_refs() > 0 {
                return Err(EvaluationError::IncompleteCost);
            }
            if trial.costs.currency != self.cash_budget.currency {
                return Err(EvaluationError::Currency);
            }
            let cash = parse_amount(&trial.costs.cash_nanos)?;
            let evaluator = parse_amount(&trial.costs.evaluator_cash_nanos)?;
            let api = parse_amount(&trial.costs.api_equivalent_nanos)?;
            let evaluator_api = parse_amount(&trial.costs.evaluator_api_equivalent_nanos)?;
            let trial_cash = cash
                .checked_add(evaluator)
                .ok_or(EvaluationError::AmountOverflow)?;
            total_cash = total_cash
                .checked_add(trial_cash)
                .ok_or(EvaluationError::AmountOverflow)?;
            total_api = total_api
                .checked_add(api)
                .and_then(|amount| amount.checked_add(evaluator_api))
                .ok_or(EvaluationError::AmountOverflow)?;
            if !record_ids.insert((
                trial.execution.source.as_str(),
                trial.execution.record_id.as_str(),
            )) {
                return Err(EvaluationError::Pairing);
            }
            let key = (
                trial.task_snapshot_id.as_str(),
                trial.repetition,
                trial.candidate_id.as_str(),
            );
            if trial_by_key.insert(key, trial).is_some() {
                return Err(EvaluationError::Pairing);
            }
            // Every repetition consumes the exact same snapshot and policy hashes
            // by construction: a trial can only reference a declared snapshot ID.
            let _ = task;
        }
        if total_cash > budget {
            return Err(EvaluationError::BudgetExceeded);
        }

        let reports = self
            .candidates
            .iter()
            .map(|candidate| self.candidate_report(candidate, &trial_by_key))
            .collect::<Result<Vec<_>, _>>()?;
        let mut pairs = Vec::with_capacity(self.tasks.len() * usize::from(self.repetitions));
        let mut wins = 0_u64;
        let mut losses = 0_u64;
        let mut ties = 0_u64;
        let mut both_failed = 0_u64;
        for task in &self.tasks {
            for repetition in 1..=self.repetitions {
                let a = trial_by_key
                    .get(&(task.id.as_str(), repetition, self.candidates[0].id.as_str()))
                    .ok_or(EvaluationError::Pairing)?;
                let b = trial_by_key
                    .get(&(task.id.as_str(), repetition, self.candidates[1].id.as_str()))
                    .ok_or(EvaluationError::Pairing)?;
                let pass_a = self.passes(a);
                let pass_b = self.passes(b);
                let result = match (pass_a, pass_b) {
                    (true, false) => {
                        wins += 1;
                        PairResult::CandidateAWins
                    }
                    (false, true) => {
                        losses += 1;
                        PairResult::CandidateBWins
                    }
                    (false, false) => {
                        both_failed += 1;
                        PairResult::BothFailAcceptance
                    }
                    (true, true) => {
                        let a_total = trial_total_cash(a)?;
                        let b_total = trial_total_cash(b)?;
                        match a_total.cmp(&b_total) {
                            std::cmp::Ordering::Less => {
                                wins += 1;
                                PairResult::CandidateAWins
                            }
                            std::cmp::Ordering::Greater => {
                                losses += 1;
                                PairResult::CandidateBWins
                            }
                            std::cmp::Ordering::Equal => {
                                ties += 1;
                                PairResult::Tie
                            }
                        }
                    }
                };
                pairs.push(PairReport {
                    task_snapshot_id: task.id.clone(),
                    repetition,
                    result,
                });
            }
        }
        let evaluated_pairs = wins + losses;
        let (lower_95, upper_95) = wilson_interval(wins, evaluated_pairs);

        Ok(ExperimentReport {
            schema_version: 1,
            evidence_kind: EvidenceKind::PairedExperiment,
            authorization_ref: self.authorization_ref.clone(),
            currency: self.cash_budget.currency.clone(),
            cash_budget_nanos: self.cash_budget.limit_nanos.clone(),
            total_cash_nanos: total_cash.to_string(),
            api_equivalent_nanos: total_api.to_string(),
            candidates: reports,
            pairs,
            paired_uncertainty_95: WilsonInterval {
                wins,
                losses,
                ties,
                both_failed,
                evaluated_pairs,
                lower_95,
                upper_95,
            },
            diagnostics: self.diagnostics(),
            limits: vec![
                "This report summarizes the imported records and settled amounts supplied to the evaluator.".into(),
                "Reference diagnostics are heuristics linked to observed span IDs; they do not establish causation or savings.".into(),
                "The evaluator does not authenticate imports or dispatch, isolate, authorize, reserve, or stop experiment work.".into(),
            ],
        })
    }

    fn candidate_report(
        &self,
        candidate: &Candidate,
        trials: &BTreeMap<(&str, u16, &str), &Trial>,
    ) -> Result<CandidateReport, EvaluationError> {
        let selected: Vec<_> = trials
            .values()
            .copied()
            .filter(|trial| trial.candidate_id == candidate.id)
            .collect();
        let mut source_accepted = 0_u64;
        let mut qualified = 0_u64;
        let mut complete_coverage = 0_u64;
        let mut api = 0_u128;
        let mut evaluator_api = 0_u128;
        let mut cash = 0_u128;
        let mut evaluator = 0_u128;
        let mut latencies = Vec::new();
        for trial in &selected {
            if trial.execution.coverage == Coverage::Complete {
                complete_coverage += 1;
            }
            if trial.execution.outcome_summary().accepted_completion {
                source_accepted += 1;
            }
            if self.passes(trial) {
                qualified += 1;
            }
            if let Some(duration) = trial.execution.wall_clock_ms() {
                latencies.push(u64::try_from(duration).map_err(|_| EvaluationError::Execution)?);
            }
            api = api
                .checked_add(parse_amount(&trial.costs.api_equivalent_nanos)?)
                .ok_or(EvaluationError::AmountOverflow)?;
            evaluator_api = evaluator_api
                .checked_add(parse_amount(&trial.costs.evaluator_api_equivalent_nanos)?)
                .ok_or(EvaluationError::AmountOverflow)?;
            cash = cash
                .checked_add(parse_amount(&trial.costs.cash_nanos)?)
                .ok_or(EvaluationError::AmountOverflow)?;
            evaluator = evaluator
                .checked_add(parse_amount(&trial.costs.evaluator_cash_nanos)?)
                .ok_or(EvaluationError::AmountOverflow)?;
        }
        latencies.sort_unstable();
        let total_cash = cash
            .checked_add(evaluator)
            .ok_or(EvaluationError::AmountOverflow)?;
        let total_api = api
            .checked_add(evaluator_api)
            .ok_or(EvaluationError::AmountOverflow)?;
        let api_per_completion = (qualified > 0).then(|| ExactRatio {
            numerator_nanos: total_api.to_string(),
            denominator: qualified,
        });
        let cash_per_completion = (qualified > 0).then(|| ExactRatio {
            numerator_nanos: total_cash.to_string(),
            denominator: qualified,
        });
        let rate = if selected.is_empty() {
            0
        } else {
            u16::try_from((qualified * 10_000) / selected.len() as u64)
                .map_err(|_| EvaluationError::AmountOverflow)?
        };
        Ok(CandidateReport {
            candidate_id: candidate.id.clone(),
            model_alias: candidate.model_alias.clone(),
            offer_revision: candidate.offer_revision.clone(),
            runs: selected.len() as u64,
            complete_coverage_runs: complete_coverage,
            source_accepted_runs: source_accepted,
            qualified_completions: qualified,
            qualification_rate_basis_points: rate,
            api_equivalent_per_qualified_completion: api_per_completion,
            cash_per_qualified_completion: cash_per_completion,
            api_equivalent_nanos: api.to_string(),
            evaluator_api_equivalent_nanos: evaluator_api.to_string(),
            total_api_equivalent_nanos: total_api.to_string(),
            cash_nanos: cash.to_string(),
            evaluator_cash_nanos: evaluator.to_string(),
            total_cash_nanos: total_cash.to_string(),
            observed_latency_p50_ms: percentile(&latencies, 50),
            observed_latency_p95_ms: percentile(&latencies, 95),
        })
    }

    fn passes(&self, trial: &Trial) -> bool {
        trial.execution.outcome_summary().accepted_completion
            && trial.execution.coverage == Coverage::Complete
            && trial.execution.wall_clock_ms().is_some_and(|latency| {
                latency >= 0 && latency as u64 <= self.acceptance.max_latency_ms
            })
            && trial
                .quality_basis_points
                .is_some_and(|quality| quality >= self.acceptance.min_quality_basis_points)
    }

    fn diagnostics(&self) -> Vec<Diagnostic> {
        let mut diagnostics = Vec::new();
        for trial in &self.trials {
            let execution = &trial.execution;
            let identity = EvidenceLink {
                candidate_id: trial.candidate_id.clone(),
                task_snapshot_id: trial.task_snapshot_id.clone(),
                record_id: execution.record_id.clone(),
                span_ids: Vec::new(),
            };
            if execution.coverage != Coverage::Complete {
                let mut evidence = identity.clone();
                evidence.span_ids.push(execution.task_id.clone());
                diagnostics.push(Diagnostic {
                    label: "heuristic".into(),
                    rule: "coverage_incomplete".into(),
                    summary: "The source reports partial or unknown coverage; unobserved work may be missing.".into(),
                    evidence: vec![evidence],
                });
            }
            let retry_links: Vec<_> = execution
                .links
                .iter()
                .filter(|link| link.kind == LinkKind::Retries)
                .collect();
            if !retry_links.is_empty() {
                let mut evidence = identity.clone();
                evidence.span_ids.extend(
                    retry_links
                        .iter()
                        .flat_map(|link| [link.from.clone(), link.to.clone()]),
                );
                evidence.span_ids.sort();
                evidence.span_ids.dedup();
                diagnostics.push(Diagnostic {
                    label: "heuristic".into(),
                    rule: "retry_work_observed".into(),
                    summary: format!(
                        "{} retry link(s) were observed; their cost remains part of the run total.",
                        retry_links.len()
                    ),
                    evidence: vec![evidence],
                });
            }
            let unknown_models: Vec<_> = execution
                .spans
                .iter()
                .filter(|span| {
                    span.kind == SpanKind::ModelInvocation && span.reported_model.is_none()
                })
                .map(|span| span.id.clone())
                .collect();
            if !unknown_models.is_empty() {
                let mut evidence = identity;
                evidence.span_ids = unknown_models;
                diagnostics.push(Diagnostic {
                    label: "heuristic".into(),
                    rule: "actual_model_unknown".into(),
                    summary: "The trace does not identify the provider-reported model for one or more invocations.".into(),
                    evidence: vec![evidence],
                });
            }
        }
        diagnostics
    }
}

fn trial_total_cash(trial: &Trial) -> Result<u128, EvaluationError> {
    parse_amount(&trial.costs.cash_nanos)?
        .checked_add(parse_amount(&trial.costs.evaluator_cash_nanos)?)
        .ok_or(EvaluationError::AmountOverflow)
}

fn parse_amount(value: &str) -> Result<u128, EvaluationError> {
    if value.is_empty() || !value.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(EvaluationError::Amount);
    }
    value.parse().map_err(|_| EvaluationError::Amount)
}

fn valid_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn percentile(sorted: &[u64], percent: usize) -> Option<u64> {
    if sorted.is_empty() {
        return None;
    }
    let index = (sorted.len() * percent).div_ceil(100).saturating_sub(1);
    sorted.get(index).copied()
}

fn wilson_interval(wins: u64, trials: u64) -> (Option<f64>, Option<f64>) {
    if trials == 0 {
        return (None, None);
    }
    let n = trials as f64;
    let p = wins as f64 / n;
    let z = 1.959_963_984_540_054_f64;
    let denominator = 1.0 + z * z / n;
    let center = (p + z * z / (2.0 * n)) / denominator;
    let margin = z * ((p * (1.0 - p) / n + z * z / (4.0 * n * n)).sqrt()) / denominator;
    (
        Some((center - margin).max(0.0)),
        Some((center + margin).min(1.0)),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> PairedExperiment {
        serde_json::from_str(include_str!(
            "../../../contracts/fixtures/paired-experiment.v1.json"
        ))
        .expect("paired experiment fixture is valid")
    }

    #[test]
    fn pairs_identical_snapshots_and_reports_failures_costs_and_uncertainty() {
        let report = fixture().evaluate().unwrap();
        assert_eq!(report.evidence_kind, EvidenceKind::PairedExperiment);
        assert_eq!(report.currency, "USD");
        assert_eq!(report.total_cash_nanos, "630");
        assert_eq!(report.api_equivalent_nanos, "1320");
        assert_eq!(report.candidates[0].source_accepted_runs, 3);
        assert_eq!(report.candidates[0].qualified_completions, 3);
        assert_eq!(report.candidates[0].total_cash_nanos, "330");
        assert_eq!(
            report.candidates[0]
                .cash_per_qualified_completion
                .as_ref()
                .unwrap()
                .denominator,
            3
        );
        assert_eq!(report.candidates[0].total_api_equivalent_nanos, "690");
        assert_eq!(report.candidates[1].source_accepted_runs, 2);
        assert_eq!(report.candidates[1].qualified_completions, 2);
        assert_eq!(report.candidates[1].total_cash_nanos, "300");
        assert_eq!(
            report.candidates[1]
                .cash_per_qualified_completion
                .as_ref()
                .unwrap()
                .numerator_nanos,
            "300"
        );
        assert_eq!(report.paired_uncertainty_95.wins, 2);
        assert_eq!(report.paired_uncertainty_95.losses, 1);
        assert_eq!(report.paired_uncertainty_95.evaluated_pairs, 3);
        assert!(report.paired_uncertainty_95.lower_95.unwrap() < 0.5);
        assert!(report.paired_uncertainty_95.upper_95.unwrap() > 0.5);
        assert!(
            report
                .limits
                .iter()
                .any(|limit| limit.contains("does not authenticate"))
        );
    }

    #[test]
    fn diagnostics_are_labeled_heuristics_and_link_to_observed_spans() {
        let mut experiment = fixture();
        experiment.trials[0]
            .execution
            .links
            .push(niu_execution::observation::Link {
                from: "model".into(),
                to: "retry".into(),
                kind: LinkKind::Retries,
            });
        experiment.trials[0]
            .execution
            .spans
            .push(niu_execution::observation::Span {
                id: "retry".into(),
                kind: SpanKind::Attempt,
                status: None,
                started_at_ms: Some(50),
                ended_at_ms: Some(60),
                requested_model: None,
                reported_model: None,
                charge_ref: Some("retry-charge".into()),
            });
        let report = experiment.evaluate().unwrap();
        let diagnostic = report
            .diagnostics
            .iter()
            .find(|item| item.rule == "retry_work_observed")
            .unwrap();
        assert_eq!(diagnostic.label, "heuristic");
        assert!(
            diagnostic.evidence[0]
                .span_ids
                .contains(&"retry".to_owned())
        );
    }

    #[test]
    fn opt_in_pairing_complete_costs_and_budget_are_mandatory() {
        let mut experiment = fixture();
        experiment.opt_in = false;
        assert!(matches!(
            experiment.evaluate(),
            Err(EvaluationError::NotAuthorized)
        ));

        let mut experiment = fixture();
        experiment.trials[0].costs.complete = false;
        assert!(matches!(
            experiment.evaluate(),
            Err(EvaluationError::IncompleteCost)
        ));

        let mut experiment = fixture();
        experiment.trials[0].execution.spans[1].charge_ref = None;
        assert!(matches!(
            experiment.evaluate(),
            Err(EvaluationError::IncompleteCost)
        ));

        let mut experiment = fixture();
        experiment.cash_budget.limit_nanos = "629".into();
        assert!(matches!(
            experiment.evaluate(),
            Err(EvaluationError::BudgetExceeded)
        ));
    }

    #[test]
    fn incomplete_pairs_and_unaccepted_only_runs_are_not_filled_or_divided_by_zero() {
        let mut experiment = fixture();
        experiment.trials.pop();
        assert!(matches!(
            experiment.evaluate(),
            Err(EvaluationError::TrialCount)
        ));

        let mut experiment = fixture();
        for trial in &mut experiment.trials {
            trial.execution.outcomes.clear();
            trial.quality_basis_points = None;
        }
        let report = experiment.evaluate().unwrap();
        assert!(
            report
                .candidates
                .iter()
                .all(|candidate| candidate.source_accepted_runs == 0)
        );
        assert!(
            report
                .candidates
                .iter()
                .all(|candidate| candidate.cash_per_qualified_completion.is_none())
        );
        assert_eq!(report.paired_uncertainty_95.evaluated_pairs, 0);
        assert!(report.paired_uncertainty_95.lower_95.is_none());
    }

    #[test]
    fn candidate_revision_and_requested_model_must_match_the_pinned_plan() {
        let mut experiment = fixture();
        experiment.trials[0].offer_revision = "changed-mid-run".into();
        assert!(matches!(
            experiment.evaluate(),
            Err(EvaluationError::Pairing)
        ));

        let mut experiment = fixture();
        experiment.trials[0].execution.spans[1].requested_model = Some("other-alias".into());
        assert!(matches!(
            experiment.evaluate(),
            Err(EvaluationError::Pairing)
        ));
    }

    #[test]
    fn partial_coverage_is_reported_as_a_heuristic_and_never_qualifies() {
        let mut experiment = fixture();
        experiment.trials[0].execution.coverage = Coverage::Partial;
        let report = experiment.evaluate().unwrap();
        assert_eq!(report.candidates[0].complete_coverage_runs, 2);
        assert_eq!(report.candidates[0].qualified_completions, 2);
        let diagnostic = report
            .diagnostics
            .iter()
            .find(|item| item.rule == "coverage_incomplete")
            .unwrap();
        assert_eq!(diagnostic.label, "heuristic");
        assert!(diagnostic.evidence[0].span_ids.contains(&"task".to_owned()));
    }
}
