import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { NiuExecutionRecorder } from '../dist/index.js';

function recorder() {
  let now = 0;
  return new NiuExecutionRecorder({
    source: 'sample-agent',
    recordId: 'run-1',
    taskId: 'task-1',
    coverage: 'complete',
    now: () => now++,
    createId: () => 'generated',
  });
}

test('records a parallel task DAG and authoritative acceptance as metadata only', async () => {
  const trace = recorder();
  const agent = trace.startSpan('agent');
  const step = trace.startSpan('step', { parentId: agent });
  const slow = trace.startSpan('model_invocation', {
    parentId: step,
    requestedModel: 'fast',
    reportedModel: 'provider-fast',
    chargeRef: 'attempt-01',
  });
  const tool = trace.startSpan('tool_invocation', { parentId: step });
  trace.addLink(slow, tool, 'depends_on');
  trace.endSpan(slow);
  trace.endSpan(tool);
  trace.endSpan(step);
  trace.endSpan(agent);
  trace.addOutcome({
    span_id: 'task-1',
    evidence_id: 'validator-1',
    authority: 'deterministic_validator',
    result: 'accepted',
  });
  trace.finish();

  const record = trace.export();
  const contractFixture = JSON.parse(await readFile(new URL('../../../contracts/fixtures/execution-recorder.v1.json', import.meta.url), 'utf8'));
  assert.deepEqual(record, contractFixture);
  assert.equal(record.schema_version, 1);
  assert.equal(record.coverage, 'complete');
  assert.equal(record.spans.find(span => span.id === slow).requested_model, 'fast');
  assert.ok(record.links.some(link => link.from === slow && link.to === tool && link.kind === 'depends_on'));
  assert.deepEqual(record.outcomes[0], {
    span_id: 'task-1', evidence_id: 'validator-1', authority: 'deterministic_validator', result: 'accepted',
  });
  for (const span of record.spans) {
    assert.deepEqual(Object.keys(span).sort(), ['charge_ref', 'ended_at_ms', 'id', 'kind', 'reported_model', 'requested_model', 'started_at_ms', 'status']);
    assert.equal('prompt' in span, false);
    assert.equal('response' in span, false);
    assert.equal('tool_output' in span, false);
  }
});

test('withSpan records completion, failure and cancellation without swallowing errors', async () => {
  const trace = recorder();
  const value = await trace.withSpan('step', {}, async () => 'ok');
  assert.equal(value, 'ok');
  await assert.rejects(trace.withSpan('tool_invocation', {}, async () => { throw new Error('tool failed'); }), /tool failed/);
  const abort = new Error('cancelled');
  abort.name = 'AbortError';
  await assert.rejects(trace.withSpan('model_invocation', { requestedModel: 'fast' }, async () => { throw abort; }));

  const record = trace.export();
  assert.deepEqual(record.spans.slice(1).map(span => span.status), ['completed', 'failed', 'cancelled']);
  assert.equal(record.coverage, 'complete');
});

test('rejects invalid causal graphs and prevents finishing with open work', () => {
  const trace = recorder();
  const first = trace.startSpan('agent');
  const second = trace.startSpan('step', { parentId: first });
  assert.throws(() => trace.addLink(second, first, 'depends_on'), /acyclic/);
  assert.throws(() => trace.addLink(first, second, 'contains'), /already exists/);
  assert.throws(() => trace.finish(), /every open span/);
  trace.endSpan(second);
  trace.endSpan(first);
  trace.finish('cancelled');
  assert.throws(() => trace.setCoverage('partial'), /already finished/);
});

test('defaults coverage to unknown and leaves no orphan span after a bad causal reference', () => {
  const trace = new NiuExecutionRecorder({ source: 'sample-agent', now: () => 0, createId: () => 'generated' });
  assert.equal(trace.export().coverage, 'unknown');
  assert.throws(() => trace.startSpan('attempt', { cause: { from: 'missing-span', kind: 'retries' } }), /Unknown causal span/);
  assert.equal(trace.export().spans.length, 1);
});
