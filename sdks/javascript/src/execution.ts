/** Metadata-only task execution recording for the public Niu execution contract. */

export type ExecutionCoverage = 'complete' | 'partial' | 'unknown';
export type ExecutionSpanKind = 'task' | 'agent' | 'step' | 'model_invocation' | 'tool_invocation' | 'attempt' | 'validation' | 'human_intervention' | 'checkpoint';
export type ExecutionSpanStatus = 'running' | 'completed' | 'failed' | 'cancelled' | 'unknown';
export type ExecutionLinkKind = 'contains' | 'delegates' | 'depends_on' | 'retries' | 'resumes';
export type ExecutionOutcomeAuthority = 'agent_claim' | 'deterministic_validator' | 'human_acceptance';
export type ExecutionOutcomeResult = 'accepted' | 'rejected' | 'inconclusive';

export type ExecutionSpanV1 = {
  id: string;
  kind: ExecutionSpanKind;
  status?: ExecutionSpanStatus;
  started_at_ms: number | null;
  ended_at_ms: number | null;
  requested_model: string | null;
  reported_model: string | null;
  charge_ref: string | null;
};

export type ExecutionLinkV1 = { from: string; to: string; kind: ExecutionLinkKind };
export type ExecutionOutcomeV1 = {
  span_id: string;
  evidence_id: string;
  authority: ExecutionOutcomeAuthority;
  result: ExecutionOutcomeResult;
};

export type ExecutionRecordV1 = {
  schema_version: 1;
  source: string;
  record_id: string;
  task_id: string;
  coverage: ExecutionCoverage;
  spans: ExecutionSpanV1[];
  links: ExecutionLinkV1[];
  outcomes: ExecutionOutcomeV1[];
};

export type ExecutionRecorderOptions = {
  source: string;
  recordId?: string;
  taskId?: string;
  coverage?: ExecutionCoverage;
  /** Injected clock and ID source make collectors deterministic in tests. */
  now?: () => number;
  createId?: () => string;
};

export type StartExecutionSpanOptions = {
  parentId?: string;
  requestedModel?: string;
  reportedModel?: string;
  /** A canonical ledger reference. The recorder never estimates or creates charges. */
  chargeRef?: string;
  cause?: { from: string; kind: Exclude<ExecutionLinkKind, 'contains'> };
};

const spanKinds = new Set<Exclude<ExecutionSpanKind, 'task'>>([
  'agent', 'step', 'model_invocation', 'tool_invocation', 'attempt', 'validation', 'human_intervention', 'checkpoint',
]);
const linkKinds = new Set<ExecutionLinkKind>(['contains', 'delegates', 'depends_on', 'retries', 'resumes']);
const causalLinkKinds = new Set<Exclude<ExecutionLinkKind, 'contains'>>(['delegates', 'depends_on', 'retries', 'resumes']);
const coverageKinds = new Set<ExecutionCoverage>(['complete', 'partial', 'unknown']);
const outcomeAuthorities = new Set<ExecutionOutcomeAuthority>(['agent_claim', 'deterministic_validator', 'human_acceptance']);
const outcomeResults = new Set<ExecutionOutcomeResult>(['accepted', 'rejected', 'inconclusive']);

export class NiuExecutionRecorder {
  private readonly record: ExecutionRecordV1;
  private readonly nowSource: () => number;
  private readonly createId: () => string;
  private sequence = 0;
  private lastNow = 0;
  private finished = false;

  constructor(options: ExecutionRecorderOptions) {
    this.nowSource = options.now ?? (() => globalThis.performance?.now() ?? Date.now());
    this.createId = options.createId ?? defaultId;
    const taskId = options.taskId ?? this.uniqueId('task');
    const recordId = options.recordId ?? this.uniqueId('record');
    assertIdentifier(options.source, 'source');
    assertIdentifier(taskId, 'taskId');
    assertIdentifier(recordId, 'recordId');
    assertCoverage(options.coverage ?? 'unknown');
    const startedAt = this.timestamp();
    this.record = {
      schema_version: 1,
      source: options.source,
      record_id: recordId,
      task_id: taskId,
      coverage: options.coverage ?? 'unknown',
      spans: [{
        id: taskId,
        kind: 'task',
        status: 'running',
        started_at_ms: startedAt,
        ended_at_ms: null,
        requested_model: null,
        reported_model: null,
        charge_ref: null,
      }],
      links: [],
      outcomes: [],
    };
  }

  setCoverage(coverage: ExecutionCoverage): void {
    this.assertOpen();
    assertCoverage(coverage);
    this.record.coverage = coverage;
  }

  startSpan(kind: Exclude<ExecutionSpanKind, 'task'>, options: StartExecutionSpanOptions = {}): string {
    this.assertOpen();
    if (!spanKinds.has(kind)) throw new Error('Unsupported execution span kind');
    if (this.record.spans.length >= 10_000) throw new RangeError('Execution record span limit exceeded');
    const parentId = options.parentId ?? this.record.task_id;
    if (!this.record.spans.some(span => span.id === parentId)) throw new Error(`Unknown parent span: ${parentId}`);
    if (options.cause && !causalLinkKinds.has(options.cause.kind)) throw new Error('Causal links cannot use containment');
    if (options.cause && !this.hasSpan(options.cause.from)) throw new Error(`Unknown causal span: ${options.cause.from}`);
    if (kind !== 'model_invocation' && (options.requestedModel !== undefined || options.reportedModel !== undefined)) {
      throw new Error('Model identity can only be attached to a model invocation');
    }
    if (options.requestedModel !== undefined) assertIdentifier(options.requestedModel, 'requestedModel');
    if (options.reportedModel !== undefined) assertIdentifier(options.reportedModel, 'reportedModel');
    if (options.chargeRef !== undefined) assertIdentifier(options.chargeRef, 'chargeRef');
    const id = this.uniqueId(kind.replaceAll('_', '-'));
    const startedAt = this.timestamp();
    this.record.spans.push({
      id,
      kind,
      status: 'running',
      started_at_ms: startedAt,
      ended_at_ms: null,
      requested_model: options.requestedModel ?? null,
      reported_model: options.reportedModel ?? null,
      charge_ref: options.chargeRef ?? null,
    });
    this.addLink(parentId, id, 'contains');
    if (options.cause) this.addLink(options.cause.from, id, options.cause.kind);
    return id;
  }

  endSpan(spanId: string, status: Exclude<ExecutionSpanStatus, 'running'> = 'completed'): void {
    this.assertOpen();
    if (!['completed', 'failed', 'cancelled', 'unknown'].includes(status)) throw new Error('Unsupported execution span status');
    if (spanId === this.record.task_id) throw new Error('Finish the task with finish()');
    const span = this.record.spans.find(item => item.id === spanId);
    if (!span) throw new Error(`Unknown span: ${spanId}`);
    if (span.status !== 'running') throw new Error(`Span is already finished: ${spanId}`);
    span.status = status;
    span.ended_at_ms = Math.max(span.started_at_ms ?? 0, this.timestamp());
  }

  async withSpan<T>(
    kind: Exclude<ExecutionSpanKind, 'task'>,
    options: StartExecutionSpanOptions,
    operation: (spanId: string) => T | Promise<T>,
  ): Promise<T> {
    const spanId = this.startSpan(kind, options);
    try {
      const result = await operation(spanId);
      this.endSpan(spanId, 'completed');
      return result;
    } catch (error) {
      this.endSpan(spanId, isAbortError(error) ? 'cancelled' : 'failed');
      throw error;
    }
  }

  addLink(from: string, to: string, kind: ExecutionLinkKind): void {
    this.assertOpen();
    if (!linkKinds.has(kind)) throw new Error('Unsupported execution link kind');
    if (this.record.links.length >= 50_000) throw new RangeError('Execution record link limit exceeded');
    if (from === to || !this.hasSpan(from) || !this.hasSpan(to)) throw new Error('Execution link must reference two distinct known spans');
    if (this.record.links.some(link => link.from === from && link.to === to && link.kind === kind)) {
      throw new Error('Execution link already exists');
    }
    if (this.reaches(to, from)) throw new Error('Execution links must remain acyclic');
    this.record.links.push({ from, to, kind });
  }

  addOutcome(outcome: ExecutionOutcomeV1): void {
    this.assertOpen();
    if (this.record.outcomes.length >= 10_000) throw new RangeError('Execution record outcome limit exceeded');
    if (!this.hasSpan(outcome.span_id)) throw new Error(`Unknown outcome span: ${outcome.span_id}`);
    if (!outcomeAuthorities.has(outcome.authority) || !outcomeResults.has(outcome.result)) throw new Error('Unsupported outcome authority or result');
    assertIdentifier(outcome.evidence_id, 'evidenceId');
    if (this.record.outcomes.some(item => item.evidence_id === outcome.evidence_id)) throw new Error('Outcome evidence ID already exists');
    this.record.outcomes.push({ ...outcome });
  }

  finish(status: Exclude<ExecutionSpanStatus, 'running'> = 'completed'): void {
    this.assertOpen();
    if (!['completed', 'failed', 'cancelled', 'unknown'].includes(status)) throw new Error('Unsupported task status');
    if (this.record.spans.some(span => span.id !== this.record.task_id && span.status === 'running')) {
      throw new Error('Finish or cancel every open span before finishing the task');
    }
    const task = this.record.spans[0];
    task.status = status;
    task.ended_at_ms = Math.max(task.started_at_ms ?? 0, this.timestamp());
    this.finished = true;
  }

  /** Returns a defensive copy ready for metadata-only import. */
  export(): ExecutionRecordV1 {
    return {
      ...this.record,
      spans: this.record.spans.map(span => ({ ...span })),
      links: this.record.links.map(link => ({ ...link })),
      outcomes: this.record.outcomes.map(outcome => ({ ...outcome })),
    };
  }

  private hasSpan(spanId: string): boolean {
    return this.record.spans.some(span => span.id === spanId);
  }

  private reaches(from: string, target: string): boolean {
    const children = new Map<string, string[]>();
    for (const link of this.record.links) children.set(link.from, [...(children.get(link.from) ?? []), link.to]);
    const visited = new Set<string>();
    const pending = [from];
    while (pending.length > 0) {
      const node = pending.pop()!;
      if (node === target) return true;
      if (visited.has(node)) continue;
      visited.add(node);
      pending.push(...(children.get(node) ?? []));
    }
    return false;
  }

  private uniqueId(prefix: string): string {
    const value = `${prefix}-${this.createId()}-${++this.sequence}`;
    assertIdentifier(value, 'generated ID');
    return value;
  }

  private timestamp(): number {
    const value = this.nowSource();
    if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) throw new RangeError('Execution clock must return a finite nonnegative millisecond value');
    this.lastNow = Math.max(this.lastNow, Math.trunc(value));
    return this.lastNow;
  }

  private assertOpen(): void {
    if (this.finished) throw new Error('Execution record is already finished');
  }
}

function assertIdentifier(value: string, label: string): void {
  if (!/^[A-Za-z0-9.:/-]{1,200}$/.test(value)) throw new Error(`${label} must use the public execution identifier format`);
}

function assertCoverage(coverage: ExecutionCoverage): void {
  if (!coverageKinds.has(coverage)) throw new Error('Unsupported execution coverage value');
}

function defaultId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
