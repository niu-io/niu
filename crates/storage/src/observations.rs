use crate::{CostEntry, Store, StoreError, TenantScope};
use niu_execution::observation::ExecutionRecord;
use serde::Serialize;
use sqlx::FromRow;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use uuid::Uuid;

const COHORT_RECORD_LIMIT: usize = 10_000;
const COHORT_PAGE_SIZE: i64 = 25;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct ExecutionImportSummary {
    pub id: Uuid,
    pub source: String,
    pub record_id: String,
    pub task_id: String,
    pub coverage: String,
    pub imported_at: String,
}

/// Ledger evidence only: these entries are not a complete task cost estimate.
#[derive(Debug)]
pub struct ExecutionCharges {
    pub entries: Vec<CostEntry>,
    pub unresolved: Vec<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ImportReceipt {
    pub id: Uuid,
    pub created: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct ExecutionAccountLink {
    pub span_id: String,
    pub attempt_id: Uuid,
    pub account_id: Uuid,
    pub provider: String,
    pub plan: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, FromRow)]
pub struct ExecutionTaskLink {
    pub id: Uuid,
    pub task_id: String,
    pub source: String,
    pub record_id: String,
    pub imported_at: String,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
pub struct ExecutionCoverageCounts {
    pub complete: u64,
    pub partial: u64,
    pub unknown: u64,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
pub struct ExecutionOutcomeCounts {
    pub accepted: u64,
    pub rejected: u64,
    pub inconclusive: u64,
    pub conflicting: u64,
    pub unverified: u64,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
pub struct AuthorityEvidenceCounts {
    pub absent: u64,
    pub accepted: u64,
    pub rejected: u64,
    pub inconclusive: u64,
    pub conflicting: u64,
    pub evidence_events: u64,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
pub struct ExecutionOutcomeEvidenceCounts {
    pub agent_claim: AuthorityEvidenceCounts,
    pub deterministic_validator: AuthorityEvidenceCounts,
    pub human_acceptance: AuthorityEvidenceCounts,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
pub struct ExecutionWorkCounts {
    pub model_invocations: u64,
    pub tool_invocations: u64,
    pub attempts: u64,
    pub validation_spans: u64,
    pub human_interventions: u64,
    pub failed_spans: u64,
    pub cancelled_spans: u64,
    pub retry_links: u64,
    pub billable_roots_without_charge_references: u64,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
pub struct CostEvidenceCounts {
    pub unique_charge_references: u64,
    pub unique_attempt_references: u64,
    pub resolved_attempts: u64,
    pub unresolved_references: u64,
    pub attempts_without_cost_entries: u64,
    pub settled_cost_entries: u64,
    pub complete: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct CurrencyAmount {
    pub currency: String,
    /// Integer billionths of the named currency, encoded as a decimal string.
    pub amount_nanos: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct CostPerAcceptedCompletion {
    pub currency: String,
    pub numerator_nanos: String,
    pub denominator: u64,
    /// Exact rational amount; no floating point rounding is applied.
    pub evidence_complete: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct NotImportedAccounting {
    pub state: &'static str,
    pub totals_by_currency: Vec<CurrencyAmount>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct ExecutionCohortReport {
    pub records_scanned: u64,
    pub record_limit: u64,
    pub truncated: bool,
    pub coverage: ExecutionCoverageCounts,
    pub outcomes: ExecutionOutcomeCounts,
    pub outcome_evidence: ExecutionOutcomeEvidenceCounts,
    pub accepted_completions: u64,
    pub work: ExecutionWorkCounts,
    pub cost_evidence: CostEvidenceCounts,
    pub api_equivalent_by_currency: Vec<CurrencyAmount>,
    /// This reflects configured cash rates in Niu's ledger, not supplier invoices.
    pub configured_rate_cash_by_currency: Vec<CurrencyAmount>,
    pub api_equivalent_per_accepted_completion: Vec<CostPerAcceptedCompletion>,
    pub configured_rate_cash_per_accepted_completion: Vec<CostPerAcceptedCompletion>,
    pub invoice_cash: NotImportedAccounting,
    pub subscription_allocation_cash: NotImportedAccounting,
    pub capacity: ExecutionCapacitySummary,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct ExecutionCapacitySummary {
    pub quota_observations: u64,
    pub task_attribution: &'static str,
}

#[derive(FromRow)]
struct AssignedAccount {
    attempt_id: Uuid,
    account_id: Uuid,
    provider: String,
    plan: String,
}

impl Store {
    /// Resolve explicit Niu attempt references only, with tenant isolation and
    /// canonical UUID deduplication. External IDs never implicitly match ours.
    pub async fn execution_charges(
        &self,
        scope: TenantScope,
        record: &ExecutionRecord,
    ) -> Result<ExecutionCharges, StoreError> {
        record
            .validate()
            .map_err(|_| StoreError::InvalidObservation)?;
        let refs = record.charge_references();
        let parse = |reference: &str| {
            reference
                .strip_prefix("niu:attempt:")
                .and_then(|id| Uuid::parse_str(id).ok())
        };
        let ids: Vec<Uuid> = refs
            .iter()
            .filter_map(|r| parse(r))
            .collect::<std::collections::BTreeSet<_>>()
            .into_iter()
            .collect();
        let entries: Vec<CostEntry> = sqlx::query_as("SELECT attempt_id, price_revision_id, currency, api_equivalent_nanos, cash_nanos, usage_prompt_tokens, usage_completion_tokens, bound_exceeded FROM cost_entries WHERE organization_id=$1 AND project_id=$2 AND attempt_id=ANY($3) ORDER BY attempt_id")
            .bind(scope.organization_id).bind(scope.project_id).bind(&ids)
            .fetch_all(&self.pool).await?;
        let resolved: std::collections::BTreeSet<_> =
            entries.iter().map(|e| e.attempt_id).collect();
        let unresolved = refs
            .into_iter()
            .filter(|r| parse(r).is_none_or(|id| !resolved.contains(&id)))
            .map(str::to_owned)
            .collect();
        Ok(ExecutionCharges {
            entries,
            unresolved,
        })
    }

    /// Authenticated callers supply tenant scope. Imported metadata cannot
    /// create attempts, execute work, or post financial entries.
    pub async fn import_execution(
        &self,
        scope: TenantScope,
        record: &ExecutionRecord,
    ) -> Result<ImportReceipt, StoreError> {
        record
            .validate()
            .map_err(|_| StoreError::InvalidObservation)?;
        let payload = serde_json::to_string(record).map_err(|_| StoreError::InvalidObservation)?;
        if payload.len() > 1_048_576 {
            return Err(StoreError::InvalidObservation);
        }
        let mut tx = self.pool.begin().await?;
        let id = Uuid::new_v4();
        let inserted: Option<Uuid> = sqlx::query_scalar("INSERT INTO execution_imports (id, organization_id, project_id, source, record_id, task_id, schema_version, payload) VALUES ($1,$2,$3,$4,$5,$6,1,$7::jsonb) ON CONFLICT (organization_id, project_id, source, record_id) DO NOTHING RETURNING id")
            .bind(id).bind(scope.organization_id).bind(scope.project_id).bind(&record.source).bind(&record.record_id).bind(&record.task_id).bind(&payload)
            .fetch_optional(&mut *tx).await?;
        let (id, created) = match inserted {
            Some(id) => (id, true),
            None => (sqlx::query_scalar("SELECT id FROM execution_imports WHERE organization_id=$1 AND project_id=$2 AND source=$3 AND record_id=$4 AND payload=$5::jsonb")
                .bind(scope.organization_id).bind(scope.project_id).bind(&record.source).bind(&record.record_id).bind(&payload)
                .fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?, false),
        };
        tx.commit().await?;
        Ok(ImportReceipt { id, created })
    }

    pub async fn execution_import(
        &self,
        scope: TenantScope,
        id: Uuid,
    ) -> Result<Option<ExecutionRecord>, StoreError> {
        let payload: Option<String> = sqlx::query_scalar("SELECT payload::text FROM execution_imports WHERE organization_id=$1 AND project_id=$2 AND id=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(id).fetch_optional(&self.pool).await?;
        payload
            .map(|s| serde_json::from_str(&s).map_err(|_| StoreError::InvalidObservation))
            .transpose()
    }

    /// Resolve canonical charge references that are attempt UUIDs to their
    /// scoped supplier-account assignment. Other reference namespaces remain
    /// unresolved instead of being guessed.
    pub async fn execution_account_links(
        &self,
        scope: TenantScope,
        record: &ExecutionRecord,
    ) -> Result<Vec<ExecutionAccountLink>, StoreError> {
        let attempts: Vec<Uuid> = record
            .spans
            .iter()
            .filter_map(|span| span.charge_ref.as_deref()?.parse().ok())
            .collect();
        if attempts.is_empty() {
            return Ok(Vec::new());
        }
        let assigned: Vec<AssignedAccount> = sqlx::query_as("SELECT aa.attempt_id, sa.id AS account_id, sa.provider, sa.plan FROM account_assignments aa JOIN supplier_accounts sa ON sa.organization_id=aa.organization_id AND sa.project_id=aa.project_id AND sa.id=aa.account_id WHERE aa.organization_id=$1 AND aa.project_id=$2 AND aa.attempt_id=ANY($3)")
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .bind(&attempts)
            .fetch_all(&self.pool)
            .await?;
        let by_attempt: HashMap<Uuid, AssignedAccount> = assigned
            .into_iter()
            .map(|link| (link.attempt_id, link))
            .collect();
        Ok(record
            .spans
            .iter()
            .filter_map(|span| {
                let attempt_id = span.charge_ref.as_deref()?.parse::<Uuid>().ok()?;
                let link = by_attempt.get(&attempt_id)?;
                Some(ExecutionAccountLink {
                    span_id: span.id.clone(),
                    attempt_id,
                    account_id: link.account_id,
                    provider: link.provider.clone(),
                    plan: link.plan.clone(),
                })
            })
            .collect())
    }

    /// Find imported task metadata that references attempts assigned to an
    /// account. Payload content is never returned through this index.
    pub async fn executions_for_account(
        &self,
        scope: TenantScope,
        account_id: Uuid,
    ) -> Result<Vec<ExecutionTaskLink>, StoreError> {
        let owned: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM supplier_accounts WHERE organization_id=$1 AND project_id=$2 AND id=$3)")
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .bind(account_id)
            .fetch_one(&self.pool)
            .await?;
        if !owned {
            return Err(StoreError::Conflict);
        }
        Ok(sqlx::query_as("SELECT e.id, e.task_id, e.source, e.record_id, to_char(e.imported_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS imported_at FROM execution_imports e WHERE e.organization_id=$1 AND e.project_id=$2 AND EXISTS (SELECT 1 FROM jsonb_array_elements(e.payload->'spans') AS sp(span) JOIN account_assignments aa ON aa.organization_id=e.organization_id AND aa.project_id=e.project_id AND aa.account_id=$3 AND aa.attempt_id::text=sp.span->>'charge_ref') ORDER BY e.imported_at DESC, e.id LIMIT 100")
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .bind(account_id)
            .fetch_all(&self.pool)
            .await?)
    }

    /// Aggregate a bounded live project cohort from imported metadata and the
    /// canonical attempt ledger. References are deduplicated across records;
    /// arbitrary identifiers are never guessed to be money.
    pub async fn execution_cohort(
        &self,
        scope: TenantScope,
    ) -> Result<ExecutionCohortReport, StoreError> {
        use niu_execution::observation::{
            Coverage, EvidenceState, ExecutionOutcomeClassification, LinkKind, SpanKind, SpanStatus,
        };
        use sqlx::Row;

        let mut report = ExecutionCohortReport {
            records_scanned: 0,
            record_limit: COHORT_RECORD_LIMIT as u64,
            truncated: false,
            coverage: ExecutionCoverageCounts::default(),
            outcomes: ExecutionOutcomeCounts::default(),
            outcome_evidence: ExecutionOutcomeEvidenceCounts::default(),
            accepted_completions: 0,
            work: ExecutionWorkCounts::default(),
            cost_evidence: CostEvidenceCounts::default(),
            api_equivalent_by_currency: Vec::new(),
            configured_rate_cash_by_currency: Vec::new(),
            api_equivalent_per_accepted_completion: Vec::new(),
            configured_rate_cash_per_accepted_completion: Vec::new(),
            invoice_cash: NotImportedAccounting {
                state: "not_imported",
                totals_by_currency: Vec::new(),
            },
            subscription_allocation_cash: NotImportedAccounting {
                state: "not_imported",
                totals_by_currency: Vec::new(),
            },
            capacity: ExecutionCapacitySummary {
                quota_observations: 0,
                task_attribution: "unavailable",
            },
        };

        let mut after: Option<Uuid> = None;
        let mut references = BTreeSet::<String>::new();
        let mut attempt_references = BTreeSet::<Uuid>::new();
        let mut untyped_references = BTreeSet::<String>::new();

        loop {
            let rows = sqlx::query("SELECT id, payload::text AS payload FROM execution_imports WHERE organization_id=$1 AND project_id=$2 AND ($3::uuid IS NULL OR id > $3) ORDER BY id LIMIT $4")
                .bind(scope.organization_id)
                .bind(scope.project_id)
                .bind(after)
                .bind(COHORT_PAGE_SIZE)
                .fetch_all(&self.pool)
                .await?;

            if rows.is_empty() {
                break;
            }

            for row in &rows {
                let id: Uuid = row.try_get("id")?;
                let payload: String = row.try_get("payload")?;
                let record: ExecutionRecord =
                    serde_json::from_str(&payload).map_err(|_| StoreError::InvalidObservation)?;
                record
                    .validate()
                    .map_err(|_| StoreError::InvalidObservation)?;
                after = Some(id);
                report.records_scanned += 1;

                match record.coverage {
                    Coverage::Complete => report.coverage.complete += 1,
                    Coverage::Partial => report.coverage.partial += 1,
                    Coverage::Unknown => report.coverage.unknown += 1,
                }
                let outcome = record.outcome_summary();
                fn evidence_count(
                    target: &mut AuthorityEvidenceCounts,
                    state: EvidenceState,
                    events: u64,
                ) {
                    target.evidence_events += events;
                    match state {
                        EvidenceState::Absent => target.absent += 1,
                        EvidenceState::Accepted => target.accepted += 1,
                        EvidenceState::Rejected => target.rejected += 1,
                        EvidenceState::Inconclusive => target.inconclusive += 1,
                        EvidenceState::Conflicting => target.conflicting += 1,
                    }
                }
                evidence_count(
                    &mut report.outcome_evidence.agent_claim,
                    outcome.agent_claim.state,
                    outcome.agent_claim.evidence_count,
                );
                evidence_count(
                    &mut report.outcome_evidence.deterministic_validator,
                    outcome.deterministic_validator.state,
                    outcome.deterministic_validator.evidence_count,
                );
                evidence_count(
                    &mut report.outcome_evidence.human_acceptance,
                    outcome.human_acceptance.state,
                    outcome.human_acceptance.evidence_count,
                );
                match outcome.classification {
                    ExecutionOutcomeClassification::Accepted => {
                        report.outcomes.accepted += 1;
                        report.accepted_completions += 1;
                    }
                    ExecutionOutcomeClassification::Rejected => report.outcomes.rejected += 1,
                    ExecutionOutcomeClassification::Inconclusive => {
                        report.outcomes.inconclusive += 1
                    }
                    ExecutionOutcomeClassification::Conflicting => report.outcomes.conflicting += 1,
                    ExecutionOutcomeClassification::Unverified => report.outcomes.unverified += 1,
                }

                for span in &record.spans {
                    match span.kind {
                        SpanKind::ModelInvocation => report.work.model_invocations += 1,
                        SpanKind::ToolInvocation => report.work.tool_invocations += 1,
                        SpanKind::Attempt => report.work.attempts += 1,
                        SpanKind::Validation => report.work.validation_spans += 1,
                        SpanKind::HumanIntervention => report.work.human_interventions += 1,
                        _ => {}
                    }
                    match span.status {
                        Some(SpanStatus::Failed) => report.work.failed_spans += 1,
                        Some(SpanStatus::Cancelled) => report.work.cancelled_spans += 1,
                        _ => {}
                    }
                }
                report.work.retry_links += record
                    .links
                    .iter()
                    .filter(|link| link.kind == LinkKind::Retries)
                    .count() as u64;
                report.work.billable_roots_without_charge_references +=
                    record.billable_work_without_charge_refs();

                for reference in record.charge_references() {
                    references.insert(reference.to_owned());
                    match reference.parse::<Uuid>() {
                        Ok(id) => {
                            attempt_references.insert(id);
                        }
                        Err(_) => {
                            untyped_references.insert(reference.to_owned());
                        }
                    }
                }
            }

            if report.records_scanned as usize >= COHORT_RECORD_LIMIT {
                let has_more: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM execution_imports WHERE organization_id=$1 AND project_id=$2 AND id > $3)")
                    .bind(scope.organization_id)
                    .bind(scope.project_id)
                    .bind(after)
                    .fetch_one(&self.pool)
                    .await?;
                report.truncated = has_more;
                break;
            }
            if rows.len() < COHORT_PAGE_SIZE as usize {
                break;
            }
        }

        report.cost_evidence.unique_charge_references = references.len() as u64;
        report.cost_evidence.unique_attempt_references = attempt_references.len() as u64;
        report.cost_evidence.unresolved_references = untyped_references.len() as u64;
        let ids: Vec<Uuid> = attempt_references.iter().copied().collect();
        let mut api_totals = BTreeMap::<String, i128>::new();
        let mut configured_cash_totals = BTreeMap::<String, i128>::new();

        if !ids.is_empty() {
            let rows = sqlx::query("SELECT requested.attempt_id, (a.id IS NOT NULL) AS attempt_found, c.currency, c.api_equivalent_nanos, c.cash_nanos FROM unnest($3::uuid[]) AS requested(attempt_id) LEFT JOIN attempts a ON a.organization_id=$1 AND a.project_id=$2 AND a.id=requested.attempt_id LEFT JOIN cost_entries c ON c.organization_id=$1 AND c.project_id=$2 AND c.attempt_id=requested.attempt_id ORDER BY requested.attempt_id")
                .bind(scope.organization_id)
                .bind(scope.project_id)
                .bind(&ids)
                .fetch_all(&self.pool)
                .await?;
            for row in rows {
                let attempt_found: bool = row.try_get("attempt_found")?;
                if !attempt_found {
                    report.cost_evidence.unresolved_references += 1;
                    continue;
                }
                report.cost_evidence.resolved_attempts += 1;
                let currency: Option<String> = row.try_get("currency")?;
                let Some(currency) = currency else {
                    report.cost_evidence.attempts_without_cost_entries += 1;
                    continue;
                };
                let api: i64 = row.try_get("api_equivalent_nanos")?;
                let cash: i64 = row.try_get("cash_nanos")?;
                let api_total = api_totals.entry(currency.clone()).or_default();
                *api_total = api_total
                    .checked_add(i128::from(api))
                    .ok_or(StoreError::AggregateOverflow)?;
                let cash_total = configured_cash_totals.entry(currency).or_default();
                *cash_total = cash_total
                    .checked_add(i128::from(cash))
                    .ok_or(StoreError::AggregateOverflow)?;
                report.cost_evidence.settled_cost_entries += 1;
            }
        }

        report.api_equivalent_by_currency = currency_amounts(api_totals.clone());
        report.configured_rate_cash_by_currency = currency_amounts(configured_cash_totals.clone());
        let all_imports_complete = report.records_scanned > 0
            && !report.truncated
            && report.coverage.partial == 0
            && report.coverage.unknown == 0;
        report.cost_evidence.complete = all_imports_complete
            && report.work.billable_roots_without_charge_references == 0
            && report.cost_evidence.unresolved_references == 0
            && report.cost_evidence.attempts_without_cost_entries == 0;

        if report.cost_evidence.complete && report.accepted_completions > 0 {
            report.api_equivalent_per_accepted_completion =
                per_completion_amounts(api_totals, report.accepted_completions);
            report.configured_rate_cash_per_accepted_completion =
                per_completion_amounts(configured_cash_totals, report.accepted_completions);
        }

        let quota_observations: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM quota_observations WHERE organization_id=$1 AND project_id=$2",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .fetch_one(&self.pool)
        .await?;
        report.capacity.quota_observations =
            u64::try_from(quota_observations).map_err(|_| StoreError::AggregateOverflow)?;
        Ok(report)
    }

    /// Return metadata-only index rows for task investigation. The payload is
    /// fetched separately so listing imports stays bounded in response size.
    /// UUID ordering is a stable cursor, not chronological ordering.
    pub async fn execution_imports(
        &self,
        scope: TenantScope,
        after: Option<Uuid>,
        task_id: Option<&str>,
        limit: i64,
    ) -> Result<Vec<ExecutionImportSummary>, StoreError> {
        if !(1..=101).contains(&limit) {
            return Err(StoreError::InvalidObservation);
        }
        let rows = sqlx::query("SELECT id, source, record_id, task_id, payload->>'coverage' AS coverage, to_char(imported_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS imported_at FROM execution_imports WHERE organization_id=$1 AND project_id=$2 AND ($3::uuid IS NULL OR id > $3) AND ($4::text IS NULL OR task_id=$4) ORDER BY id LIMIT $5")
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .bind(after)
            .bind(task_id)
            .bind(limit)
            .fetch_all(&self.pool)
            .await?;
        rows.into_iter()
            .map(|row| {
                use sqlx::Row;
                Ok(ExecutionImportSummary {
                    id: row.try_get("id")?,
                    source: row.try_get("source")?,
                    record_id: row.try_get("record_id")?,
                    task_id: row.try_get("task_id")?,
                    coverage: row.try_get("coverage")?,
                    imported_at: row.try_get("imported_at")?,
                })
            })
            .collect()
    }

    /// Remove an imported metadata record only; canonical inference and
    /// financial records are independently retained under their own policy.
    pub async fn delete_execution_import(
        &self,
        scope: TenantScope,
        id: Uuid,
    ) -> Result<bool, StoreError> {
        Ok(sqlx::query(
            "DELETE FROM execution_imports WHERE organization_id=$1 AND project_id=$2 AND id=$3",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(id)
        .execute(&self.pool)
        .await?
        .rows_affected()
            == 1)
    }
}

fn currency_amounts(values: BTreeMap<String, i128>) -> Vec<CurrencyAmount> {
    values
        .into_iter()
        .map(|(currency, value)| CurrencyAmount {
            currency,
            amount_nanos: value.to_string(),
        })
        .collect()
}

fn per_completion_amounts(
    values: BTreeMap<String, i128>,
    denominator: u64,
) -> Vec<CostPerAcceptedCompletion> {
    values
        .into_iter()
        .map(|(currency, value)| CostPerAcceptedCompletion {
            currency,
            numerator_nanos: value.to_string(),
            denominator,
            evidence_complete: true,
        })
        .collect()
}
