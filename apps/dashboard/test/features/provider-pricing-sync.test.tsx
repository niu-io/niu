import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { extractUpstreamStandardPrices } from '@/features/provider-business/upstream-pricing';
import {
  buildResolvedModelRow,
  buildStandardAndPurchaseSchedules,
  isRetailBelowPurchaseSchedule,
  shouldAutoSyncCustomerPrice,
} from '@/features/provider-business/provider-model-actions';
import { PriceComparison } from '@/features/retail-pricing/pricing-health';
import type { ProviderOffer, RetailPriceRecord } from '@niu-io/sdk/admin';

describe('Provider standard pricing alignment & below_cost prevention', () => {
  it('extracts cache_write_tokens and reasoning_tokens alongside input/output/cached rates', () => {
    const map = extractUpstreamStandardPrices({
      data: {
        status: 'ok',
        prices: [
          {
            model: 'anthropic/claude-sonnet-4',
            rates: [
              { meter: 'input_tokens', amount: '3', currency: 'USD', per_units: 1_000_000 },
              { meter: 'output_tokens', amount: '15', currency: 'USD', per_units: 1_000_000 },
              { meter: 'cached_input_tokens', amount: '0.3', currency: 'USD', per_units: 1_000_000 },
              { meter: 'cache_write_tokens', amount: '3.75', currency: 'USD', per_units: 1_000_000 },
              { meter: 'cache_write_tokens', amount: '6', currency: 'USD', per_units: 1_000_000, condition: '1h' },
            ],
          },
        ],
      },
    });
    const entry = map.get('anthropic/claude-sonnet-4');
    expect(entry).toBeDefined();
    expect(entry?.inputPer1MNanos).toBe('3000000000');
    expect(entry?.outputPer1MNanos).toBe('15000000000');
    expect(entry?.cachedInputPer1MNanos).toBe('300000000');
    expect(entry?.cacheWriteInputPer1MNanos).toBe('3750000000');
  });

  it('keeps standard and purchase schedules identical across all dimensions at 100% (no discount) and flags stale below-cost retail schedules for repair', () => {
    const staleRetail: RetailPriceRecord = {
      price_id: '00000000-0000-0000-0000-000000000001',
      model_alias: 'openrouter/claude-sonnet-4',
      currency: 'USD',
      version: '1',
      revision: '00000000-0000-0000-0000-000000000002',
      published_at: '2026-11-26T00:00:00Z',
      schedule: {
        kind: 'text',
        prompt_rate: '3000000000',
        completion_rate: '15000000000',
        cached_prompt_rate: '300000000',
        // Previously hardcoded to null, falling back to 3.00 < 3.75 cache write!
        cache_write_prompt_rate: null,
        reasoning_completion_rate: null,
        request_fee_nanos: '0',
        minimum_charge_nanos: '0',
        context_tiers: [],
      },
    };
    const offer: ProviderOffer = {
      id: '00000000-0000-0000-0000-000000000003',
      model_alias: 'openrouter/claude-sonnet-4',
      revision: '00000000-0000-0000-0000-000000000004',
      active: true,
      qualified: true,
      route_ready: true,
      currency: 'USD',
      prompt_rate: '3000000000',
      completion_rate: '15000000000',
      cached_prompt_rate: '300000000',
      cache_write_prompt_rate: '3750000000',
      reasoning_completion_rate: null,
      context_tiers: [
        {
          minimum_input_tokens: '200000',
          prompt_rate: '6000000000',
          completion_rate: '22500000000',
          cached_prompt_rate: '600000000',
          cache_write_prompt_rate: '7500000000',
          reasoning_completion_rate: null,
        },
      ],
    };

    const upstreamMap = extractUpstreamStandardPrices({
      data: {
        status: 'ok',
        prices: [
          {
            model: 'anthropic/claude-sonnet-4',
            rates: [
              { meter: 'input_tokens', amount: '3', currency: 'USD', per_units: 1_000_000 },
              { meter: 'output_tokens', amount: '15', currency: 'USD', per_units: 1_000_000 },
              { meter: 'cached_input_tokens', amount: '0.3', currency: 'USD', per_units: 1_000_000 },
              { meter: 'cache_write_tokens', amount: '3.75', currency: 'USD', per_units: 1_000_000 },
            ],
          },
        ],
      },
    });

    const row = buildResolvedModelRow({
      alias: 'openrouter/claude-sonnet-4',
      entriesByAlias: new Map(),
      offerByAlias: new Map([['openrouter/claude-sonnet-4', offer]]),
      retailPrices: new Map([['openrouter/claude-sonnet-4', staleRetail]]),
      upstreamPrices: upstreamMap,
      commercialEnabled: true,
      platformCurrency: 'USD',
      connections: [],
    });

    const pricingBase = {
      standardInputNanos: row.stdInputNanos ?? '0',
      standardOutputNanos: row.stdOutputNanos ?? '0',
      standardCachedInputNanos: row.stdCachedNanos,
      discountPercent: 100,
      purchaseInputNanos: row.stdInputNanos ?? '0',
      purchaseOutputNanos: row.stdOutputNanos ?? '0',
      purchaseCachedInputNanos: row.stdCachedNanos,
    };

    // Stale retail record missing cache_write_prompt_rate and context_tiers IS detected as below purchase
    expect(shouldAutoSyncCustomerPrice(row, pricingBase, 'USD')).toBe(true);

    const { standard, purchase } = buildStandardAndPurchaseSchedules(row, pricingBase);
    expect(standard).toEqual(purchase);
    expect(standard.cache_write_prompt_rate).toBe('3750000000');
    expect(standard.context_tiers).toHaveLength(1);
    expect(standard.context_tiers?.[0]?.prompt_rate).toBe('6000000000');

    // Once aligned 1:1 with Provider (100% no discount), it is NOT below purchase schedule
    const alignedRetail: RetailPriceRecord = {
      ...staleRetail,
      schedule: {
        ...staleRetail.schedule,
        kind: 'text',
        cache_write_prompt_rate: standard.cache_write_prompt_rate ?? null,
        reasoning_completion_rate: standard.reasoning_completion_rate ?? null,
        context_tiers: standard.context_tiers ?? [],
      },
    };
    expect(isRetailBelowPurchaseSchedule(alignedRetail, purchase, 'USD')).toBe(false);
    expect(shouldAutoSyncCustomerPrice({ ...row, retail: alignedRetail }, pricingBase, 'USD')).toBe(false);
  });

  it('never renders Below Provider cost warning when rates match (no_lower_unit_rates) or when supply is inactive', () => {
    const equalRender = render(
      <PriceComparison currency="USD"
        health={{
          advisory: true,
          supply_status: 'active',
          active_supply_routes: 1,
          active_providers: ['OpenRouter'],
          checks: [
            {
              route: 'openrouter/gpt-4o',
              provider: 'OpenRouter',
              status: 'no_lower_unit_rates',
              dimensions: [],
              message: 'Unit-rate comparison only.',
              rates: [{ dimension: 'Input', minimum_input_tokens: '0', selling: '1200000000', purchase: '1200000000' }],
            },
          ],
        }}
      />,
    );
    expect(equalRender.container.textContent).not.toContain('Below Provider cost');
    expect(equalRender.container.textContent).not.toContain('低于 Provider 成本');
    expect(equalRender.container.textContent).toContain('$1.2');
    equalRender.unmount();

    render(
      <PriceComparison currency="USD"
        health={{
          advisory: true,
          supply_status: 'inactive',
          active_supply_routes: 0,
          active_providers: [],
          checks: [
            {
              route: 'openrouter/gpt-4o',
              provider: 'OpenRouter',
              status: 'below_cost',
              dimensions: [{ dimension: 'Input', minimum_input_tokens: '0' }],
              message: 'Disabled route.',
            },
          ],
        }}
      />,
    );
    expect(screen.queryByText(/Below Provider cost|低于 Provider 成本/)).toBeNull();
    expect(screen.getByText(/No active purchase quote|暂无生效采购报价/)).toBeTruthy();
  });
});
