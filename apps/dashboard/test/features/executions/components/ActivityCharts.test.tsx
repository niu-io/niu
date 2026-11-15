import { describe, expect, it } from 'vitest';
import { buildTokenSeries, integerAxis } from '../../../../app/features/executions/components/ActivityCharts';

describe('ActivityCharts helpers', () => {
  it('generates strictly increasing unique integer axis ticks for small and larger counts', () => {
    for (const max of [0, 1, 2, 3, 4, 5, 6, 9, 12, 26, 100]) {
      const axis = integerAxis(max);
      expect(axis.domain[0]).toBe(0);
      expect(axis.domain[1]).toBeGreaterThanOrEqual(Math.max(1, max));
      expect(axis.ticks[0]).toBe(0);
      expect(axis.ticks.at(-1)).toBe(axis.domain[1]);
      for (let i = 1; i < axis.ticks.length; i += 1) {
        expect(Number.isInteger(axis.ticks[i])).toBe(true);
        expect(axis.ticks[i]).toBeGreaterThan(axis.ticks[i - 1]);
      }
      expect(new Set(axis.ticks).size).toBe(axis.ticks.length);
    }
  });

  it('uses sqrt scaling with raw values preserved when token volumes differ by 25x or more', () => {
    const result = buildTokenSeries([
      {
        model_alias: 'tiny-model',
        request_count: 1,
        usage_count: 1,
        prompt_tokens: '100',
        completion_tokens: '25',
      },
      {
        model_alias: 'heavy-model',
        request_count: 100,
        usage_count: 100,
        prompt_tokens: '800000',
        completion_tokens: '200000',
      },
    ]);

    expect(result.useSqrtTokens).toBe(true);
    expect(result.tokenModels.map(item => item.model_alias)).toEqual(['heavy-model', 'tiny-model']);
    const [heavy, tiny] = result.tokenModels;
    expect(heavy.rawInput).toBe(800000);
    expect(heavy.rawOutput).toBe(200000);
    expect(tiny.rawInput).toBe(100);
    expect(tiny.rawOutput).toBe(25);
    expect(heavy.input + heavy.output).toBeCloseTo(1000, 4);
    expect(tiny.input + tiny.output).toBeCloseTo(Math.sqrt(125), 4);
    expect(heavy.input / (heavy.input + heavy.output)).toBeCloseTo(0.8, 6);
    expect(result.tokenAxis.ticks.map(v => Math.round(v * v))).toEqual([0, 62500, 250000, 562500, 1000000]);
  });

  it('keeps linear scaling when token volumes stay within 25x', () => {
    const result = buildTokenSeries([
      {
        model_alias: 'small-model',
        request_count: 1,
        usage_count: 1,
        prompt_tokens: '20',
        completion_tokens: '10',
      },
      {
        model_alias: 'main-model',
        request_count: 2,
        usage_count: 2,
        prompt_tokens: '40',
        completion_tokens: '20',
      },
    ]);

    expect(result.useSqrtTokens).toBe(false);
    expect(result.tokenModels[0].input).toBe(40);
    expect(result.tokenModels[0].output).toBe(20);
  });
});
