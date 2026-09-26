export type Coverage = 'complete' | 'partial' | 'unknown';

export type ExecutionSpan = {
  id: string;
  kind: string;
  status?: string | null;
  started_at_ms?: number | null;
  ended_at_ms?: number | null;
  requested_model?: string | null;
  reported_model?: string | null;
  charge_ref?: string | null;
};

export type ExecutionLink = {
  from: string;
  to: string;
  kind: string;
};

export type ExecutionOutcome = {
  span_id: string;
  evidence_id: string;
  authority: string;
  result: string;
};

export type ExecutionRecordV1 = {
  schema_version: 1;
  source: string;
  record_id: string;
  task_id: string;
  coverage: Coverage;
  spans: ExecutionSpan[];
  links: ExecutionLink[];
  outcomes: ExecutionOutcome[];
};

export type ExecutionAccountLink = {
  span_id: string;
  attempt_id: string;
  account_id: string;
  provider: string;
  plan: string;
};

export type ExecutionCohort = {
  records_scanned: number;
  record_limit: number;
  truncated: boolean;
  coverage: { complete: number; partial: number; unknown: number };
  outcomes: { accepted: number; rejected: number; inconclusive: number; conflicting: number; unverified: number };
  outcome_evidence: {
    agent_claim: { absent: number; accepted: number; rejected: number; inconclusive: number; conflicting: number; evidence_events: number };
    deterministic_validator: { absent: number; accepted: number; rejected: number; inconclusive: number; conflicting: number; evidence_events: number };
    human_acceptance: { absent: number; accepted: number; rejected: number; inconclusive: number; conflicting: number; evidence_events: number };
  };
  accepted_completions: number;
  work: {
    model_invocations: number; tool_invocations: number; attempts: number;
    validation_spans: number; human_interventions: number; failed_spans: number;
    cancelled_spans: number; retry_links: number; billable_roots_without_charge_references: number;
  };
  cost_evidence: {
    unique_charge_references: number; unique_attempt_references: number; resolved_attempts: number;
    unresolved_references: number; attempts_without_cost_entries: number;
    settled_cost_entries: number; complete: boolean;
  };
  api_equivalent_by_currency: Array<{ currency: string; amount_nanos: string }>;
  configured_rate_cash_by_currency: Array<{ currency: string; amount_nanos: string }>;
  api_equivalent_per_accepted_completion: Array<{ currency: string; numerator_nanos: string; denominator: number; evidence_complete: boolean }>;
  configured_rate_cash_per_accepted_completion: Array<{ currency: string; numerator_nanos: string; denominator: number; evidence_complete: boolean }>;
  invoice_cash: { state: 'not_imported'; totals_by_currency: [] };
  subscription_allocation_cash: { state: 'not_imported'; totals_by_currency: [] };
  capacity: { quota_observations: number; task_attribution: 'unavailable' };
};

export type ExecutionMetrics = {
  wallClockMs: number | null;
  invocationWorkMs: number | null;
  timedInvocationSpans: number;
  untimedInvocationSpans: number;
  agents: number;
  modelCalls: number;
  toolCalls: number;
  retries: number;
  chargeReferences: number;
  hasConflictingResults: boolean;
};

export type TimelineRow = {
  span: ExecutionSpan;
  depth: number;
  structurallyLinked: boolean;
  durationMs: number | null;
  startPercent: number | null;
  widthPercent: number | null;
  clipped: boolean;
};

export function spanDuration(span: ExecutionSpan): number | null {
  const { started_at_ms: start, ended_at_ms: end } = span;
  return start != null && end != null && end >= start ? end - start : null;
}

export function taskSpan(record: ExecutionRecordV1): ExecutionSpan | undefined {
  return record.spans.find(span => span.id === record.task_id && span.kind === 'task');
}

export function executionMetrics(record: ExecutionRecordV1): ExecutionMetrics {
  const duration = taskSpan(record);
  const results = new Set(record.outcomes.map(outcome => outcome.result));
  const invocationSpans = record.spans.filter(span => span.kind === 'model_invocation' || span.kind === 'tool_invocation');
  const invocationDurations = invocationSpans.map(spanDuration).filter((value): value is number => value !== null);
  return {
    wallClockMs: duration ? spanDuration(duration) : null,
    invocationWorkMs: invocationDurations.length ? invocationDurations.reduce((sum, value) => sum + value, 0) : null,
    timedInvocationSpans: invocationDurations.length,
    untimedInvocationSpans: invocationSpans.length - invocationDurations.length,
    agents: record.spans.filter(span => span.kind === 'agent').length,
    modelCalls: record.spans.filter(span => span.kind === 'model_invocation').length,
    toolCalls: record.spans.filter(span => span.kind === 'tool_invocation').length,
    retries: record.links.filter(link => link.kind === 'retries').length,
    chargeReferences: new Set(record.spans.flatMap(span => span.charge_ref ? [span.charge_ref] : [])).size,
    hasConflictingResults: results.has('accepted') && results.has('rejected'),
  };
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function timelineRows(record: ExecutionRecordV1): TimelineRow[] {
  const root = taskSpan(record);
  const start = root?.started_at_ms;
  const end = root?.ended_at_ms;
  const wallClock = root ? spanDuration(root) : null;
  const structural = new Map<string, string[]>();
  for (const link of record.links) {
    if (link.kind === 'contains' || link.kind === 'delegates') {
      structural.set(link.from, [...(structural.get(link.from) ?? []), link.to]);
    }
  }

  const depths = new Map<string, number>();
  if (root) {
    depths.set(root.id, 0);
    const queue = [root.id];
    for (let index = 0; index < queue.length; index += 1) {
      const parent = queue[index];
      for (const child of structural.get(parent) ?? []) {
        if (!depths.has(child)) {
          depths.set(child, (depths.get(parent) ?? 0) + 1);
          queue.push(child);
        }
      }
    }
  }

  return [...record.spans]
    .sort((left, right) => {
      const leftStart = left.started_at_ms;
      const rightStart = right.started_at_ms;
      if (leftStart == null && rightStart != null) return 1;
      if (leftStart != null && rightStart == null) return -1;
      if (leftStart != null && rightStart != null && leftStart !== rightStart) return leftStart - rightStart;
      return left.id.localeCompare(right.id);
    })
    .map(span => {
      const durationMs = spanDuration(span);
      const hasInterval = wallClock != null && wallClock > 0
        && start != null && end != null
        && span.started_at_ms != null && span.ended_at_ms != null;
      if (!hasInterval) {
        return {
          span,
          depth: depths.get(span.id) ?? 0,
          structurallyLinked: depths.has(span.id),
          durationMs,
          startPercent: null,
          widthPercent: null,
          clipped: false,
        };
      }
      const rawStart = ((span.started_at_ms! - start!) / wallClock) * 100;
      const rawEnd = ((span.ended_at_ms! - start!) / wallClock) * 100;
      const clippedStart = clampPercent(rawStart);
      const clippedEnd = clampPercent(rawEnd);
      return {
        span,
        depth: depths.get(span.id) ?? 0,
        structurallyLinked: depths.has(span.id),
        durationMs,
        startPercent: clippedStart,
        widthPercent: Math.max(0, clippedEnd - clippedStart),
        clipped: rawStart < 0 || rawEnd > 100,
      };
    });
}
