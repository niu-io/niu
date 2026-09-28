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

export type ExternalUsage = {
  authority: 'agent_reported_estimate';
  agent_version: string | null;
  request_count: number | null;
  retry_count: number | null;
  input_tokens: string | null;
  output_tokens: string | null;
  cache_read_tokens: string | null;
  cache_creation_tokens: string | null;
  cost_nanos: string | null;
  currency: string | null;
};

export type AgentUsageSummary = ExternalUsage & { complete: boolean };

export type ExecutionRecordV1 = {
  schema_version: 1;
  source: string;
  record_id: string;
  task_id: string;
  coverage: Coverage;
  spans: ExecutionSpan[];
  links: ExecutionLink[];
  outcomes: ExecutionOutcome[];
  external_usage?: ExternalUsage;
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
  tasks_scanned: number;
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

function sumKnown(values: Array<string | null | undefined>, complete: boolean): string | null {
  if (!complete || values.length === 0 || values.some(value => value == null)) return null;
  return values.reduce((sum, value) => sum + BigInt(value!), 0n).toString();
}

export function aggregateExternalUsage(records: ExecutionRecordV1[]): AgentUsageSummary | null {
  const reported = records.filter(record => record.external_usage);
  if (reported.length === 0) return null;
  const modelRecords = records.filter(record => record.spans.some(span => span.kind === 'model_invocation'));
  const telemetryComplete = modelRecords.every(record => record.external_usage != null)
    && reported.length === records.length;
  const requestUsages = modelRecords.map(record => record.external_usage);
  const versions = new Set(requestUsages.flatMap(usage => usage?.agent_version ? [usage.agent_version] : []));
  const costValues = requestUsages.map(usage => usage?.cost_nanos);
  const currencies = new Set(requestUsages.flatMap(usage => usage?.currency ? [usage.currency] : []));
  const costComplete = telemetryComplete && costValues.length > 0 && costValues.every(value => value != null)
    && currencies.size === 1;
  const sumCount = (field: 'request_count' | 'retry_count') => {
    if (!telemetryComplete || requestUsages.some(usage => usage?.[field] == null)) return null;
    return requestUsages.reduce((sum, usage) => sum + (usage?.[field] ?? 0), 0);
  };
  const sumTokens = (field: 'input_tokens' | 'output_tokens' | 'cache_read_tokens' | 'cache_creation_tokens') =>
    sumKnown(requestUsages.map(usage => usage?.[field]), telemetryComplete);
  return {
    authority: 'agent_reported_estimate',
    agent_version: versions.size === 1 ? [...versions][0] : null,
    request_count: sumCount('request_count'),
    retry_count: sumCount('retry_count'),
    input_tokens: sumTokens('input_tokens'),
    output_tokens: sumTokens('output_tokens'),
    cache_read_tokens: sumTokens('cache_read_tokens'),
    cache_creation_tokens: sumTokens('cache_creation_tokens'),
    cost_nanos: costComplete ? sumKnown(costValues, true) : null,
    currency: costComplete ? [...currencies][0] : null,
    complete: telemetryComplete,
  };
}

export function mergeExecutionRecords(records: ExecutionRecordV1[]): ExecutionRecordV1 {
  if (records.length === 0) throw new Error('At least one task record is required.');
  const first = records[0];
  if (records.some(record => record.source !== first.source || record.task_id !== first.task_id)) {
    throw new Error('Task records must share a source and task ID.');
  }
  const spans = new Map<string, ExecutionSpan>();
  for (const record of records) {
    for (const span of record.spans) {
      const previous = spans.get(span.id);
      if (!previous) {
        spans.set(span.id, { ...span });
        continue;
      }
      spans.set(span.id, {
        ...previous,
        started_at_ms: previous.started_at_ms == null || span.started_at_ms == null
          ? null : Math.min(previous.started_at_ms, span.started_at_ms),
        ended_at_ms: previous.ended_at_ms == null || span.ended_at_ms == null
          ? null : Math.max(previous.ended_at_ms, span.ended_at_ms),
        status: previous.status === span.status ? previous.status : 'unknown',
      });
    }
  }
  const links = new Map<string, ExecutionLink>();
  const outcomes = new Map<string, ExecutionOutcome>();
  for (const record of records) {
    for (const link of record.links) links.set([link.from, link.to, link.kind].join('\0'), link);
    for (const outcome of record.outcomes) {
      outcomes.set([outcome.span_id, outcome.evidence_id, outcome.authority, outcome.result].join('\0'), outcome);
    }
  }
  const usage = aggregateExternalUsage(records);
  const coverage: Coverage = records.some(record => record.coverage === 'unknown')
    ? 'unknown' : records.some(record => record.coverage === 'partial') ? 'partial' : 'complete';
  return {
    ...first,
    coverage,
    spans: [...spans.values()],
    links: [...links.values()],
    outcomes: [...outcomes.values()],
    ...(usage ? { external_usage: usage } : { external_usage: undefined }),
  };
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
