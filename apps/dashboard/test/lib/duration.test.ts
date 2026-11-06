import {describe,expect,it} from 'vitest';
import {formatDurationMs,formatDurationSeconds} from '../../app/lib/duration';

describe('human-readable durations', () => {
 it('keeps sub-second and second values precise enough for measured intervals',()=>{
  expect(formatDurationMs(0)).toBe('0 ms');
  expect(formatDurationMs(500)).toBe('500 ms');
  expect(formatDurationMs(8000)).toBe('8.0 s');
 });
 it('uses minutes and hours for longer observations without raw milliseconds',()=>{
  expect(formatDurationMs(61000)).toBe('1 min 1 s');
  expect(formatDurationMs(60000)).toBe('1 min');
  expect(formatDurationMs(3661000)).toBe('1 h 1 min 1 s');
  expect(formatDurationSeconds(90)).toBe('1 min 30 s');
 });
 it('does not invent a duration for invalid input',()=>{
  expect(formatDurationMs(-1)).toBe('—');
  expect(formatDurationSeconds(Number.NaN)).toBe('—');
 });
});
