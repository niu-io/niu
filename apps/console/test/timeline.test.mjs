import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { timelineAxis, timelinePosition, observedInterval } from '../src/lib/timeline.ts';

test('parallel fixture retains a shared time axis and checkpoint duration', () => {
  const record = JSON.parse(readFileSync(new URL('../../../contracts/fixtures/parallel-task.v1.json', import.meta.url)));
  const axis = timelineAxis(record.spans);
  assert.deepEqual(axis, [0, 100]);
  const a = timelinePosition(record.spans.find(x => x.id === 'agent-a'), axis);
  const b = timelinePosition(record.spans.find(x => x.id === 'agent-b'), axis);
  assert.equal(a.left, b.left);
  assert.equal(a.duration, 70);
  assert.equal(b.duration, 80);
  assert.equal(timelinePosition(record.spans.find(x => x.id === 'checkpoint'), axis).duration, 0);
});

test('unknown, reversed and unsafe timestamps do not become plotted durations', () => {
  for (const span of [
    { started_at_ms: 1, ended_at_ms: null },
    { started_at_ms: 5, ended_at_ms: 4 },
    { started_at_ms: 0, ended_at_ms: Number.MAX_SAFE_INTEGER + 1 },
  ]) {
    assert.equal(observedInterval(span), null);
    assert.equal(timelinePosition(span, [0, 100]), null);
  }
  assert.equal(timelineAxis([]), null);
});
