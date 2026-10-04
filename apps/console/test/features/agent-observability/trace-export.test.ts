import { expect, it } from 'vitest';
import { traceExport, type Trace } from '../../../src/features/agent-observability/data';

it('exports distinct event references and reported outcomes without internal identifiers', () => {
  const id = 'b8ae9cd0-0d6e-49da-a12b-5c5b39fc2c11', child = '987f2b32-1bbc-4f41-9320-bc4bb6ce61e2';
  const trace: Trace = { id, name: 'Run', source: 'coding-agent', occurred_at: '2026-10-02T00:00:00Z', time_basis: 'observed', status: 'completed', coverage: 'partial', duration_ms: 1, span_count: 2, error_count: 0, model_calls: 0, tool_calls: 1, span_names: { [id]: 'Repeated name', [child]: 'Repeated name' },
    record: { task_id: id, spans: [{ id, kind: 'task', status: 'completed', started_at_ms: 0, ended_at_ms: 1, requested_model: null, reported_model: null }, { id: child, kind: 'tool_invocation', status: 'completed', started_at_ms: null, ended_at_ms: null, requested_model: null, reported_model: null }], links: [{ from: id, to: child, kind: 'contains' }], outcomes: [{ span_id: child, authority: 'agent_claim', result: 'inconclusive' }], external_usage: { input_tokens: null, output_tokens: null, cost_nanos: null, currency: id } } };
  const exported = traceExport(trace);
  expect(exported.relationships).toEqual([{ from: 'Event 1', to: 'Event 2', kind: 'contains' }]);
  expect(exported.outcomes?.[0].event).toBe('Event 2');
  expect(exported.usage?.currency).toBe('Unknown');
  expect(JSON.stringify(exported)).not.toContain(id); expect(JSON.stringify(exported)).not.toContain(child);
});
