import { describe, expect, it } from 'vitest';
import { executionMetrics, spanDuration, timelineRows } from '../../src/features/executions/utils.ts';

const record = {
  schema_version: 1,
  source: 'test-harness',
  record_id: 'run-42',
  task_id: 'task-42',
  coverage: 'partial',
  spans: [
    { id: 'task-42', kind: 'task', started_at_ms: 1000, ended_at_ms: 2000 },
    { id: 'agent-1', kind: 'agent', started_at_ms: 1000, ended_at_ms: 1900 },
    { id: 'model-1', kind: 'model_invocation', started_at_ms: 1100, ended_at_ms: 1300, charge_ref: 'charge-1' },
    { id: 'model-2', kind: 'model_invocation', started_at_ms: 1450, ended_at_ms: 1550, charge_ref: 'charge-1' },
    { id: 'tool-1', kind: 'tool_invocation', started_at_ms: 1320, ended_at_ms: 1400, charge_ref: 'charge-2' },
    { id: 'untimed', kind: 'tool_invocation' },
    { id: 'late', kind: 'agent', started_at_ms: 1900, ended_at_ms: 2100 },
  ],
  links: [
    { from: 'task-42', to: 'agent-1', kind: 'delegates' },
    { from: 'agent-1', to: 'model-1', kind: 'contains' },
    { from: 'agent-1', to: 'tool-1', kind: 'contains' },
    { from: 'model-1', to: 'model-2', kind: 'retries' },
  ],
  outcomes: [
    { span_id: 'model-2', evidence_id: 'provider', authority: 'provider', result: 'accepted' },
    { span_id: 'task-42', evidence_id: 'validator', authority: 'validator', result: 'rejected' },
  ],
};

describe('execution investigation calculations', () => {
  it('counts task, agent, model, tool, retries, unique charges, and conflicting evidence', () => {
    expect(executionMetrics(record)).toEqual({
      wallClockMs: 1000,
      invocationWorkMs: 380,
      timedInvocationSpans: 3,
      untimedInvocationSpans: 1,
      agents: 2,
      modelCalls: 2,
      toolCalls: 2,
      retries: 1,
      chargeReferences: 2,
      hasConflictingResults: true,
    });
  });

  it('keeps task wall-clock distinct from parallel child spans and clips outliers', () => {
    const rows = timelineRows(record);
    const task = rows.find(row => row.span.id === 'task-42');
    const model = rows.find(row => row.span.id === 'model-1');
    const late = rows.find(row => row.span.id === 'late');
    const untimed = rows.find(row => row.span.id === 'untimed');

    expect(task).toMatchObject({ depth: 0, structurallyLinked: true, startPercent: 0, widthPercent: 100 });
    expect(model).toMatchObject({ depth: 2, structurallyLinked: true, durationMs: 200, startPercent: 10, widthPercent: 20 });
    expect(late).toMatchObject({ startPercent: 90, widthPercent: 10, clipped: true });
    expect(untimed).toMatchObject({ startPercent: null, widthPercent: null, durationMs: null });
    expect(rows.map(row => row.span.id)).toEqual(['agent-1', 'task-42', 'model-1', 'tool-1', 'model-2', 'late', 'untimed']);
  });

  it('does not invent durations for invalid or missing intervals', () => {
    expect(spanDuration({ id: 'missing', kind: 'tool_invocation', started_at_ms: 4 })).toBeNull();
    expect(spanDuration({ id: 'invalid', kind: 'tool_invocation', started_at_ms: 8, ended_at_ms: 7 })).toBeNull();
    expect(spanDuration({ id: 'instant', kind: 'tool_invocation', started_at_ms: 8, ended_at_ms: 8 })).toBe(0);
    const onlyUntimedWork = executionMetrics({ ...record, spans: [
      { id: 'task-42', kind: 'task', started_at_ms: 1000, ended_at_ms: 2000 },
      { id: 'untimed', kind: 'model_invocation' },
      { id: 'invalid', kind: 'tool_invocation', started_at_ms: 8, ended_at_ms: 7 },
    ] });
    expect(onlyUntimedWork).toMatchObject({ invocationWorkMs: null, timedInvocationSpans: 0, untimedInvocationSpans: 2 });
  });
});
