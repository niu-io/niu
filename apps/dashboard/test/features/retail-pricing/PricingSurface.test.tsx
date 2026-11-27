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
  catalog: { description: 'Catalog usage instructions for this model.' },
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
    if (path.startsWith('/api/v1/admin/pricing/standard-prices?')) return Response.json({ data: [currencyRow], next_after: null });
    if (path === '/api/v1/admin/units') return Response.json({ data: unitConfiguration });
    if (path === '/api/v1/admin/units/media/tariffs') return Response.json({ data: [] });
    if (path.includes('/api/v1/admin/pricing/standard-prices/models?')) return Response.json({ data: [{ model_alias: 'shared-model', media: null }], next_after: null });
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
    expect(screen.queryByText(currencyRow.catalog.description)).toBeNull();
    expect(screen.getByRole('tab', { name: /^Currency/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: /Currency.*Used for billing/ })).toBeTruthy();
    expect(screen.queryByRole('table', { name: 'Branded Credits text tariffs' })).toBeNull();

    await user.click(screen.getByRole('tab', { name: /^Credits/ }));
    expect(await screen.findByRole('table', { name: 'Branded Credits text tariffs' })).toBeTruthy();
    expect(screen.getByText('credits-model')).toBeTruthy();
    expect(screen.queryByText(/Preparing prices for/)).toBeNull();
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
    expect(screen.getByRole('tab', { name: /^Credits/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: /Credits.*Used for billing/ })).toBeTruthy();
    expect(screen.queryByRole('table', { name: 'Platform standard selling prices' })).toBeNull();

    await user.click(screen.getByRole('tab', { name: /^Currency/ }));
    expect(await screen.findByRole('table', { name: 'Platform standard selling prices' })).toBeTruthy();
    expect(screen.queryByText(/Preparing prices for/)).toBeNull();
    expect(screen.queryByRole('table', { name: 'Branded Credits text tariffs' })).toBeNull();
  });

  it('distinguishes active-supply models from inactive/historical standard prices and filters by supply status', async () => {
    state.token = 'pricing-surface-supply';
    const inactiveRow = {
      ...currencyRow,
      price_id: 'inactive-price',
      model_alias: 'qiniu/deepseek-v4.1-flash',
      pricing_health: {
        advisory: true,
        supply_status: 'inactive' as const,
        active_supply_routes: 0,
        active_providers: [],
        checks: [{ status: 'comparison_unavailable' as const, dimensions: [], message: 'No managed Provider price is available for comparison.' }],
      },
    };
    const activeRow = {
      ...currencyRow,
      price_id: 'active-price',
      model_alias: 'qiniu/conatus-free',
      pricing_health: {
        advisory: true,
        supply_status: 'active' as const,
        active_supply_routes: 1,
        active_providers: ['Qiniu'],
        checks: [{ route: 'qiniu/conatus-free', provider: 'Qiniu', status: 'no_lower_unit_rates' as const, dimensions: [] }],
      },
    };
    const unconfiguredRow = {
      ...currencyRow,
      price_id: 'unconfigured-price',
      model_alias: 'legacy/retired-model',
      pricing_health: {
        advisory: true,
        supply_status: 'unconfigured' as const,
        active_supply_routes: 0,
        active_providers: [],
        checks: [{ status: 'comparison_unavailable' as const, dimensions: [] }],
      },
    };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.startsWith('/api/v1/admin/pricing/standard-prices?')) {
        return Response.json({ data: [inactiveRow, unconfiguredRow, activeRow], next_after: null });
      }
      if (path === '/api/v1/admin/units') return Response.json({ data: unitConfiguration });
      if (path === '/api/v1/admin/units/media/tariffs') return Response.json({ data: [] });
      return Response.json({ error: { message: 'Unexpected ' + path } }, { status: 404 });
    }));

    render(<MemoryRouter><RetailPricingRoute /></MemoryRouter>);
    const user = userEvent.setup();

    expect(await screen.findByText('qiniu/conatus-free')).toBeTruthy();
    expect(screen.getByText('Active supply · Qiniu')).toBeTruthy();
    expect(screen.getAllByText('Supply inactive').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('No active supply').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('1 active · 2 without active supply')).toBeTruthy();

    // Active supply row is sorted first before inactive/unconfigured rows.
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0].textContent).toContain('qiniu/conatus-free');

    // Filter down to only active-supply models via shadcn DropdownMenu.
    await user.click(screen.getByRole('button', { name: 'Filter by supply status' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Active supply (1)' }));
    expect(screen.getByText('qiniu/conatus-free')).toBeTruthy();
    expect(screen.queryByText('qiniu/deepseek-v4.1-flash')).toBeNull();
    expect(screen.queryByText('legacy/retired-model')).toBeNull();
  });
});
