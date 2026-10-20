import { expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import CommercialPositionPage from '../../../src/features/commercial-position/page';

vi.mock('../../../src/app/dashboard-context', () => ({
  useDashboardContext: () => ({
    token: 'platform-admin-token',
  }),
}));

const samplePosition = {
  currency: 'USD',
  days: 15,
  from: '2026-10-01T00:00:00Z',
  until: '2026-10-15T12:00:00Z',
  data: [
    {
      supplier_id: '5552ad0f-09df-45ff-a233-30c18afe868a',
      supplier_name: 'OpenRouter',
      model_alias: 'anthropic/claude-fable-5',
      currency: 'USD',
      offers: [
        {
          offer_id: '11111111-1111-4111-8111-111111111111',
          route_alias: 'anthropic/claude-fable-5',
          revision: '22222222-2222-4222-8222-222222222222',
          rate_kind: 'text' as const,
          prompt_rate: '10000000000',
          completion_rate: '50000000000',
          state: 'qualified' as const,
          media_rates: [],
        },
      ],
      customer_charge_nanos: null,
      earning_nanos: null,
      customer_cash_applied_nanos: null,
      customer_outstanding_credit_nanos: null,
      cash_source_uncovered_attempts: '0',
      settled_earning_nanos: null,
      unsettled_earning_nanos: null,
      cost_nanos: null,
      known_upstream_cost_subtotal_nanos: null,
      upstream_cost_recorded_attempts: '0',
      margin_nanos: null,
      customer_refunds_nanos: null,
      net_customer_revenue_nanos: null,
      consumed_gift_allowance_nanos: null,
      net_contribution_nanos: null,
      revenue_uncovered_attempts: '0',
      unresolved_attempts: '0',
      matched_attempts: '0',
      cost_known_attempts: '0',
    },
    {
      supplier_id: '5552ad0f-09df-45ff-a233-30c18afe868a',
      supplier_name: 'OpenRouter',
      model_alias: 'deepseek/deepseek-v4.1-flash',
      currency: 'USD',
      offers: [
        {
          offer_id: '33333333-3333-4333-8333-333333333333',
          route_alias: 'deepseek/deepseek-v4.1-flash',
          revision: '44444444-4444-4444-8444-444444444444',
          rate_kind: 'text' as const,
          prompt_rate: '3000000',
          completion_rate: '2400000000',
          state: 'qualified' as const,
          media_rates: [],
        },
      ],
      customer_charge_nanos: '800000000',
      earning_nanos: '600000000',
      customer_cash_applied_nanos: '800000000',
      customer_outstanding_credit_nanos: '0',
      cash_source_uncovered_attempts: '0',
      settled_earning_nanos: '400000000',
      unsettled_earning_nanos: '200000000',
      cost_nanos: '600000000',
      known_upstream_cost_subtotal_nanos: '600000000',
      upstream_cost_recorded_attempts: '3',
      margin_nanos: '200000000',
      customer_refunds_nanos: '0',
      net_customer_revenue_nanos: '800000000',
      consumed_gift_allowance_nanos: '0',
      net_contribution_nanos: '200000000',
      revenue_uncovered_attempts: '0',
      unresolved_attempts: '0',
      matched_attempts: '3',
      cost_known_attempts: '3',
    },
  ],
};

const sampleSummary = {
  currency: 'USD',
  days: 15,
  from: '2026-10-01T00:00:00Z',
  until: '2026-10-15T12:00:00Z',
  nominal_consumption_nanos: '850000000',
  customer_refunds_nanos: '0',
  known_revenue_subtotal_nanos: '800000000',
  known_gift_allowance_subtotal_nanos: '50000000',
  uncovered_entries: '0',
  uncovered_nominal_nanos: '0',
  balance_funding_receipts_nanos: '100000000000',
  external_invoice_receipts_nanos: '0',
  cash_receipt_reference_conflicts: '0',
  recorded_funding_reversals_nanos: '0',
  issued_gifts_nanos: '50000000',
  recognized_revenue_nanos: '800000000',
  consumed_gift_allowance_nanos: '50000000',
  verified_cash_receipts_nanos: '100000000000',
  balance_credit_sources: {
    as_of: '2026-10-15T12:00:00Z',
    uncovered_accounts: '0',
    prepaid_cash_nanos: '99200000000',
    outstanding_credit_nanos: '0',
    known_prepaid_cash_subtotal_nanos: '99200000000',
    known_outstanding_credit_subtotal_nanos: '0',
  },
};

it('renders a structured financial statement with period comparisons, active model filtering, and PDF export', async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/v1/commercial-position')) {
      return Response.json(samplePosition);
    }
    return Response.json(sampleSummary);
  });
  vi.stubGlobal('fetch', fetchMock);
  const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
  const user = userEvent.setup();

  render(
    <MemoryRouter initialEntries={['/admin/reports']}>
      <CommercialPositionPage />
    </MemoryRouter>,
  );

  // Executive KPI cards and Statement of Operations load under Financial statements
  expect(await screen.findByRole('region', { name: 'Financial statements' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Statement of operations (P&L)' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Cash receipts, payables & wallet position' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Unit economics by Provider & model' })).toBeTruthy();
  expect(screen.getByText('25.0% margin')).toBeTruthy();

  // Financial figures are formatted to 4 decimal places with $ symbol
  expect(screen.getAllByText('$0.8000').length).toBeGreaterThan(0);
  expect(screen.getAllByText('$100.0000').length).toBeGreaterThan(0);
  expect(screen.getAllByText('$99.2000').length).toBeGreaterThan(0);

  // Active model is shown by default with full-precision offer quote (In $0.003 · Out $2.40 / 1M)
  const unitTable = screen.getByRole('table', { name: 'Provider commercial positions' });
  expect(within(unitTable).getByColumnHeader ? true : within(unitTable).getByText('Customer cash applied')).toBeTruthy();
  expect(within(unitTable).getByText('Customer unpaid credit')).toBeTruthy();
  expect(within(unitTable).getByText('Recorded upstream cost')).toBeTruthy();
  expect(within(unitTable).getByText('deepseek/deepseek-v4.1-flash')).toBeTruthy();
  expect(within(unitTable).getByText('In $0.003 · Out $2.40 / 1M')).toBeTruthy();
  expect(within(unitTable).getByText('0 uncovered cash requests')).toBeTruthy();
  expect(within(unitTable).getByText('3 recorded · 3/3 matched covered')).toBeTruthy();
  expect(within(unitTable).queryByText('anthropic/claude-fable-5')).toBeNull();

  await user.click(screen.getByRole('button', { name: 'All configured (2)' }));
  expect(within(unitTable).getByText('anthropic/claude-fable-5')).toBeTruthy();

  // Currency selector only offers $ USD and ¥ CNY
  await user.click(screen.getByRole('button', { name: 'Statement currency' }));
  expect(screen.getByRole('menuitemradio', { name: '$ USD' })).toBeTruthy();
  expect(screen.getByRole('menuitemradio', { name: '¥ CNY' })).toBeTruthy();
  expect(screen.queryByRole('menuitemradio', { name: /EUR/i })).toBeNull();
  await user.keyboard('{Escape}');

  // Formal branded PDF print header and footer are rendered in the statement DOM
  expect(screen.getByText(/PLATFORM FINANCIAL REPORTING/)).toBeTruthy();
  expect(screen.getByText('CONFIDENTIAL · PLATFORM ADMIN')).toBeTruthy();
  expect(screen.getByText('Accounting & Attribution Notes:')).toBeTruthy();
  expect(screen.getByText('Financial Statements ($ USD)')).toBeTruthy();

  // Export PDF button triggers window.print()
  await user.click(screen.getByRole('button', { name: 'Export PDF statement' }));
  expect(printSpy).toHaveBeenCalledTimes(1);

  // Can switch period mode to Single calendar month
  await user.click(screen.getByRole('button', { name: 'Reporting period mode' }));
  await user.click(screen.getByRole('menuitemradio', { name: 'Single calendar month' }));
  expect(await screen.findByRole('button', { name: 'Select calendar month' })).toBeTruthy();

  printSpy.mockRestore();
});
