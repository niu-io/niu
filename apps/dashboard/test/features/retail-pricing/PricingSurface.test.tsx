import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RetailPricingRoute from '../../../app/features/retail-pricing/page';

const state = vi.hoisted(() => ({ token: 'pricing-surface-currency', mode: 'currency' as 'currency' | 'credits' }));

vi.mock('../../../app/shell/dashboard-context', () => ({ useDashboardContext: () => ({ token: state.token }) }));
vi.mock('../../../app/shell/platform-currency', () => ({
  usePlatformCurrency: () => ({
    currency: 'USD',
    billingMode: state.mode,
    unit: { revision: '3', name: 'Niu Credits', display_precision: 2, atoms_per_unit: '1000000000' },
    error: '',
    ready: true,
    reload: vi.fn(),
  }),
}));

const currencyRow = {
  price_id: 'currency-price',
  model_alias: 'shared-model',
  currency: 'USD',
  version: '1',
  published_at: '2026-11-01T00:00:00Z',
  schedule: {
    kind: 'text',
    prompt_rate: '1000000000',
    completion_rate: '2000000000',
    cached_prompt_rate: null,
    cache_write_prompt_rate: null,
    reasoning_completion_rate: null,
    request_fee_nanos: '0',
    minimum_charge_nanos: '0',
    context_tiers: [],
  },
};
const unitConfiguration = {
  revision: '4',
  billing_mode: 'credits',
  definition: { revision: '3', name: 'Niu Credits', display_precision: 2, atoms_per_unit: '1000000000' },
  purchase_rules: [],
  text_tariffs: [{
    revision: '5',
    definition_revision: '3',
    model_alias: 'credits-model',
    price: {
      prompt_rate: '15000000000',
      completion_rate: '30000000000',
      cached_prompt_rate: null,
      cache_write_prompt_rate: null,
      reasoning_completion_rate: null,
      request_fee_atoms: '0',
      minimum_charge_atoms: '0',
      context_tiers: [],
    },
  }],
};

function mockPricingFetch() {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    if (path.startsWith('/api/v1/pricing/standard-prices?')) return Response.json({ data: [currencyRow], next_after: null });
    if (path === '/api/v1/platform/units') return Response.json({ data: unitConfiguration });
    if (path === '/api/v1/platform/units/media/tariffs') return Response.json({ data: [] });
    if (path.includes('/api/v1/pricing/standard-prices/models?')) return Response.json({ data: [{ model_alias: 'shared-model', media: null }], next_after: null });
    return Response.json({ error: { message: 'Unexpected ' + path } }, { status: 404 });
  }));
}

afterEach(() => {
  cleanup();
  state.mode = 'currency';
  state.token = 'pricing-surface-currency';
});

describe('unified pricing surface', () => {
  it('opens on the active currency mode and lets an administrator prepare Credits prices without stacking both tables', async () => {
    mockPricingFetch();
    render(<MemoryRouter><RetailPricingRoute /></MemoryRouter>);
    const user = userEvent.setup();

    expect(await screen.findByRole('table', { name: 'Platform standard selling prices' })).toBeTruthy();
    expect(screen.getByText('shared-model')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Settlement Currency' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Active billing mode: Settlement Currency')).toBeTruthy();
    expect(screen.queryByRole('table', { name: 'Branded Credits text tariffs' })).toBeNull();

    await user.click(screen.getByRole('tab', { name: 'Branded Credits' }));
    expect(await screen.findByRole('table', { name: 'Branded Credits text tariffs' })).toBeTruthy();
    expect(screen.getByText('credits-model')).toBeTruthy();
    expect(screen.getByText('Preparing prices for Branded Credits')).toBeTruthy();
    expect(screen.queryByRole('table', { name: 'Platform standard selling prices' })).toBeNull();
    expect(screen.queryByText(/Tariff v/)).toBeNull();
    expect(screen.queryByText(/1,000,000,000/)).toBeNull();
    expect(screen.queryByText(/exact atoms/i)).toBeNull();
    expect(screen.queryByText(/seedance-2\.0/)).toBeNull();
  });

  it('opens on the active Credits mode while keeping settlement-currency preparation accessible', async () => {
    state.mode = 'credits';
    state.token = 'pricing-surface-credits';
    mockPricingFetch();
    render(<MemoryRouter><RetailPricingRoute /></MemoryRouter>);
    const user = userEvent.setup();

    expect(await screen.findByRole('table', { name: 'Branded Credits text tariffs' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Branded Credits' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Active billing mode: Branded Credits')).toBeTruthy();
    expect(screen.queryByRole('table', { name: 'Platform standard selling prices' })).toBeNull();

    await user.click(screen.getByRole('tab', { name: 'Settlement Currency' }));
    expect(await screen.findByRole('table', { name: 'Platform standard selling prices' })).toBeTruthy();
    expect(screen.getByText('Preparing prices for Settlement Currency')).toBeTruthy();
    expect(screen.queryByRole('table', { name: 'Branded Credits text tariffs' })).toBeNull();
  });
});
