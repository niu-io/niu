import { describe, expect, it } from 'vitest';
import { timelineAxis, timelinePosition, observedInterval } from '../src/lib/timeline.ts';
import record from '../../../contracts/fixtures/parallel-task.v1.json';

describe('execution timeline', () => {
  it('retains a shared time axis and checkpoint duration', () => {
    const axis = timelineAxis(record.spans);
    expect(axis).toEqual([0, 100]);
    const a = timelinePosition(record.spans.find(x => x.id === 'agent-a'), axis);
    const b = timelinePosition(record.spans.find(x => x.id === 'agent-b'), axis);
    expect(a?.left).toBe(b?.left);
    expect(a?.duration).toBe(70);
    expect(b?.duration).toBe(80);
    expect(timelinePosition(record.spans.find(x => x.id === 'checkpoint'), axis)?.duration).toBe(0);
  });

  it('does not plot unknown, reversed, or unsafe timestamps as durations', () => {
    for (const span of [
      { started_at_ms: 1, ended_at_ms: null },
      { started_at_ms: 5, ended_at_ms: 4 },
      { started_at_ms: 0, ended_at_ms: Number.MAX_SAFE_INTEGER + 1 },
    ]) {
      expect(observedInterval(span)).toBeNull();
      expect(timelinePosition(span, [0, 100])).toBeNull();
    }
    expect(timelineAxis([])).toBeNull();
  });
});
