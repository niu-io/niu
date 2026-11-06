import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { PlatformUnitsSetting } from '@/features/platform-settings/platform-units';
import { saveLocale } from '@/shell/locale';

vi.mock('@/shell/platform-currency', () => ({
  usePlatformCurrency: () => ({ currency: 'USD', billingMode: 'currency', unit: null, error: '', reload: vi.fn() }),
}));

it('shows a clean purchase rate and one billing-mode switch without atom or scale controls', async () => {
  saveLocale('en');
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  const configuration = {
    revision: '7',
    billing_mode: 'currency',
    definition: { revision: '3', name: 'Credits', display_precision: 2, atoms_per_unit: '1000000000' },
    purchase_rules: [{ revision: '4', definition_revision: '3', payment_currency: 'USD', numerator: '100', denominator: '1' }],
  };
  const mode = {
    revision: '7', billing_mode: 'currency', target_mode: 'credits', change_required: false,
    blockers_empty: true, observed_at: '2026-11-05T00:00:00Z', blockers: [],
    preserved_configuration: {
      monetary_workspace_limits: '0', monetary_key_limits: '0', monetary_text_tariffs: '0',
      credits_text_tariffs: '0', monetary_retail_prices: '0', monetary_media_rate_history: '0',
    },
  };
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    if (path === '/api/v1/platform/units') return Response.json({ data: configuration });
    if (path.startsWith('/api/v1/platform/units/mode')) return Response.json({ data: mode });
    return Response.json({ error: { message: `Unexpected ${path}` } }, { status: 404 });
  }));
  render(<PlatformUnitsSetting token="units-test-token" />);

  expect(await screen.findByText(/100\.00 Credits = 1 USD/)).toBeTruthy();
  expect(screen.queryByText(/1,000,000,000/)).toBeNull();
  expect(screen.queryByText(/exact atoms/i)).toBeNull();
  expect(screen.queryByText(/1\.00 Credits/)).toBeNull();
  expect(screen.queryByText(/per unit/)).toBeNull();
  expect(screen.queryByLabelText(/decimal scale/i)).toBeNull();
  expect(screen.queryByLabelText(/^rounding$/i)).toBeNull();
  expect(screen.getByRole('button', { name: 'Switch billing mode' })).toBeTruthy();
});
