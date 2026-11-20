import { describe, expect, it } from 'vitest';
import type { WorkspaceModelPool } from '@niu-io/sdk';
import {
  buildPoolStrategy,
  strategyDraftFrom,
} from '@/features/routing/strategy';

const pool: WorkspaceModelPool = {
  slug: 'assistant',
  name: 'Assistant',
  description: '',
  enabled: true,
  revision: 1,
  candidates: [{ alias: 'fast', priority: 100, weight: 1, enabled: true }],
};

describe('workspace routing strategy draft', () => {
  it('keeps legacy and omitted configurations on version 1 priority/weight', () => {
    expect(strategyDraftFrom(pool).mode).toBe('priority_weight');
    expect(buildPoolStrategy(strategyDraftFrom(pool))).toEqual({
      strategy: { version: 1, mode: 'priority_weight' },
    });
  });

  it('round-trips an explicit customer-price strategy with its assumptions', () => {
    const draft = strategyDraftFrom({
      ...pool,
      strategy: {
        version: 1,
        mode: 'customer_price',
        customer_price: {
          currency: 'USD',
          unit: 'nanounits_per_million_tokens',
          input_tokens: 2_000_000,
          output_tokens: 250_000,
        },
      },
    });
    expect(draft).toEqual({
      mode: 'customer_price',
      currency: 'USD',
      inputTokens: '2000000',
      outputTokens: '250000',
    });
    expect(buildPoolStrategy(draft)).toEqual({
      strategy: {
        version: 1,
        mode: 'customer_price',
        customer_price: {
          currency: 'USD',
          unit: 'nanounits_per_million_tokens',
          input_tokens: 2_000_000,
          output_tokens: 250_000,
        },
      },
    });
  });

  it('preserves an existing bounded Auto policy without authoring paths', () => {
    const auto = {
      paths: [
        {
          id: 'deep',
          response_type: 'text' as const,
          candidates: ['fast'],
          task: ['architecture'],
        },
        {
          id: 'quick',
          response_type: 'text' as const,
          candidates: ['fast'],
          task: ['chat'],
        },
      ],
      decider: {
        model: 'fast',
        currency: 'USD',
        timeout_ms: 800,
        max_calls: 1 as const,
        max_input_tokens: 1024,
        max_output_tokens: 32,
        max_spend_nanos: 5_000_000,
        min_confidence: 0.6,
        on_abstain: 'fallback' as const,
        on_failure: 'fallback' as const,
      },
    };
    const draft = strategyDraftFrom({
      ...pool,
      strategy: { version: 2, mode: 'auto', auto },
    });
    expect(draft.mode).toBe('auto');
    expect(buildPoolStrategy(draft)).toEqual({
      strategy: { version: 2, mode: 'auto', auto },
    });
    expect(
      'error' in buildPoolStrategy({
        mode: 'auto',
        currency: 'USD',
        inputTokens: '1000000',
        outputTokens: '100000',
      }),
    ).toBe(true);
  });

  it('rejects incomplete currency and token assumptions before saving', () => {
    const base = strategyDraftFrom(pool, 'usd');
    expect(buildPoolStrategy({ ...base, mode: 'customer_price' })).toMatchObject({
      strategy: {
        customer_price: {
          currency: 'USD',
          input_tokens: 1_000_000,
          output_tokens: 100_000,
        },
      },
    });
    for (const draft of [
      { ...base, mode: 'customer_price' as const, currency: 'US' },
      { ...base, mode: 'customer_price' as const, inputTokens: '0' },
      { ...base, mode: 'customer_price' as const, outputTokens: '-1' },
      { ...base, mode: 'customer_price' as const, outputTokens: '10000001' },
    ]) {
      expect('error' in buildPoolStrategy(draft)).toBe(true);
    }
  });
});
