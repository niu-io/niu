export type Interval = { started_at_ms: number | null; ended_at_ms: number | null };

export function observedInterval(span: Interval): [number, number] | null {
  const { started_at_ms: start, ended_at_ms: end } = span;
  return start !== null && end !== null && Number.isSafeInteger(start) && Number.isSafeInteger(end)
    && start >= 0 && end >= start ? [start, end] : null;
}

// One common observed axis, not a sequential layout. Incomplete spans do not
// contribute invented endpoints or imply that their duration was zero.
export function timelineAxis(spans: Interval[]): [number, number] | null {
  const intervals = spans.map(observedInterval).filter(x => x !== null);
  if (!intervals.length) return null;
  return intervals.reduce<[number, number]>((axis, x) => [Math.min(axis[0], x[0]), Math.max(axis[1], x[1])], intervals[0]);
}

export function timelinePosition(span: Interval, axis: [number, number] | null) {
  const interval = observedInterval(span);
  if (!interval || !axis) return null;
  const width = axis[1] - axis[0];
  return { left: width ? (interval[0] - axis[0]) / width * 100 : 0,
    width: width ? (interval[1] - interval[0]) / width * 100 : 0,
    duration: interval[1] - interval[0] };
}
