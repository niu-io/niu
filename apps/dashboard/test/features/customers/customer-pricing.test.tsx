import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { RetailSchedule } from '@niu-io/sdk/admin';
import {
  CustomerPricingPanel,
  discountRetailSchedule,
  inferCustomerDiscountPercent,
} from '@/features/customers/customer-pricing';
import type { CustomerActivePromotion, CustomerModelPriceRow } from '@/features/customers/customer-pricing-model';
import { CustomerDetail } from '@/features/customers/detail-page';
import { saveLocale } from '@/shell/locale';

vi.mock('@/shell/platform-currency', () => ({
  usePlatformCurrency: () => ({ currency: 'USD', billingMode: 'currency', unit: null, error: '', reload: vi.fn(), ready: true, failed: false }),
}));

const GPT_SCHEDULE: RetailSchedule = {
  kind: 'text',
  prompt_rate: '2000000000',
  completion_rate: '8000000000',
  cached_prompt_rate: '1000000000',
  cache_write_prompt_rate: null,
  reasoning_completion_rate: null,
  minimum_charge_nanos: '0',
  request_fee_nanos: '0',
  context_tiers: [
    {
      minimum_input_tokens: 128000,
      prompt_rate: '4000000000',
      completion_rate: '16000000000',
      cached_prompt_rate: '2000000000',
      cache_write_prompt_rate: null,
      reasoning_completion_rate: null,
    },
  ],
};

const CLAUDE_SCHEDULE: RetailSchedule = {
  kind: 'text',
  prompt_rate: '3000000000',
  completion_rate: '15000000000',
  cached_prompt_rate: null,
  cache_write_prompt_rate: null,
  reasoning_completion_rate: null,
  minimum_charge_nanos: '0',
  request_fee_nanos: '0',
  context_tiers: [],
};

describe('discountRetailSchedule', () => {
  it('discounts every non-null text rate and context tier without exceeding standard rates', () => {
    const discounted = discountRetailSchedule(GPT_SCHEDULE, 85);
    expect(discounted.kind).toBe('text');
    if (discounted.kind !== 'text') return;
    expect(discounted.prompt_rate).toBe('1700000000');
    expect(discounted.completion_rate).toBe('6800000000');
    expect(discounted.cached_prompt_rate).toBe('850000000');
    expect(discounted.cache_write_prompt_rate).toBeNull();
    expect(discounted.context_tiers[0]?.prompt_rate).toBe('3400000000');
    expect(discounted.context_tiers[0]?.completion_rate).toBe('13600000000');
    expect(inferCustomerDiscountPercent(GPT_SCHEDULE, discounted)).toBe(85);
  });
});

describe('CustomerPricingPanel', () => {
  it('loads customer pricing in 1 request, edits via Dialogs (never inline), applies atomic batch PUT, and resets via DELETE', async () => {
    saveLocale('en');
    const orgId = '00000000-0000-4000-8000-000000000101';
    let gptPromo: CustomerActivePromotion | null = {
      revision: 'promo-gpt-old',
      version: '3',
      created_at: '2026-11-21T00:00:00Z',
      reason: 'Customer discount (90%)',
      baseline_revision: 'rev-gpt-3',
      schedule: discountRetailSchedule(GPT_SCHEDULE, 90),
      effective_from: '1700000000',
      effective_until: '1900000000',
      eligibility_until: '1900000000',
      state: 'within_period',
    };
    let claudePromo: CustomerActivePromotion | null = null;
    const calls: Array<{ method: string; path: string; body: Record<string, unknown> | null }> = [];

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
        calls.push({ method, path: url, body });

        if (method === 'GET' && url === `/api/v1/admin/customers/${orgId}/pricing`) {
          const items: CustomerModelPriceRow[] = [
            {
              price_id: 'price-gpt',
              model_alias: 'gpt-4o',
              currency: 'USD',
              version: '3',
              revision: 'rev-gpt-3',
              published_at: '2026-11-20T00:00:00Z',
              standard_schedule: GPT_SCHEDULE,
              active_promotion: gptPromo,
            },
            {
              price_id: 'price-claude',
              model_alias: 'claude-3-7-sonnet',
              currency: 'USD',
              version: '2',
              revision: 'rev-claude-2',
              published_at: '2026-11-20T00:00:00Z',
              standard_schedule: CLAUDE_SCHEDULE,
              active_promotion: claudePromo,
            },
          ];
          return Response.json({
            data: { organization_id: orgId, organization_name: 'Acme AI', as_of: '1763800000', items },
          });
        }
        if (method === 'PUT' && url === `/api/v1/admin/customers/${orgId}/pricing`) {
          const items = (body?.items as Array<{ price_id: string; schedule: RetailSchedule | null }>) ?? [];
          for (const item of items) {
            if (item.price_id === 'price-gpt' && item.schedule) {
              gptPromo = {
                revision: 'promo-gpt-new',
                version: '5',
                created_at: '2026-11-22T00:00:00Z',
                reason: 'Customer price',
                baseline_revision: 'rev-gpt-3',
                schedule: item.schedule,
                effective_from: '1763800000',
                effective_until: '1921480000',
                eligibility_until: '1921480000',
                state: 'within_period',
              };
            }
            if (item.price_id === 'price-claude' && item.schedule) {
              claudePromo = {
                revision: 'promo-claude-new',
                version: '3',
                created_at: '2026-11-22T00:00:00Z',
                reason: 'Customer price',
                baseline_revision: 'rev-claude-2',
                schedule: item.schedule,
                effective_from: '1763800000',
                effective_until: '1921480000',
                eligibility_until: '1921480000',
                state: 'within_period',
              };
            }
          }
          return Response.json({ data: { organization_id: orgId, updated: [] } });
        }
        if (method === 'DELETE' && url === `/api/v1/admin/customers/${orgId}/pricing/price-gpt`) {
          gptPromo = null;
          return Response.json({ data: { organization_id: orgId, updated: [{ price_id: 'price-gpt', version: '6', active_revision: null }] } });
        }
        return Response.json({ error: { message: `Unexpected ${method} ${url}` } }, { status: 404 });
      }),
    );

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <CustomerPricingPanel token="admin-token" organizationId={orgId} />
      </MemoryRouter>,
    );

    expect(await screen.findByText('gpt-4o')).toBeTruthy();
    expect(screen.getByText('claude-3-7-sonnet')).toBeTruthy();
    expect(screen.getByText('$1.80 / $7.20')).toBeTruthy();
    // No permanent batch form sprawled on the page
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByLabelText('Batch discount percentage')).toBeNull();

    // Open Batch pricing dialog and apply 80% to all models in 1 atomic PUT
    await user.click(screen.getByRole('button', { name: 'Batch pricing' }));
    const batchDialog = await screen.findByRole('dialog');
    await user.click(within(batchDialog).getByRole('button', { name: '80%' }));
    await user.click(within(batchDialog).getByRole('button', { name: 'Apply to all (2)' }));

    expect(await screen.findByText('Applied 80% to 2 models.')).toBeTruthy();
    expect(screen.getByText('$1.60 / $6.40')).toBeTruthy();
    expect(screen.getByText('$2.40 / $12.00')).toBeTruthy();

    const putCall = calls.find(c => c.method === 'PUT' && c.path === `/api/v1/admin/customers/${orgId}/pricing`);
    const sentItems = (putCall?.body?.items as Array<Record<string, unknown>>) ?? [];
    expect(sentItems).toHaveLength(2);
    expect(sentItems.every(item => 'schedule' in item && !('discount_percent' in item))).toBe(true);

    // Reset gpt-4o via 1 DELETE call
    const gptRow = screen.getByText('gpt-4o').closest('tr');
    expect(gptRow).toBeTruthy();
    if (gptRow) {
      await user.click(within(gptRow).getByRole('button', { name: 'Reset' }));
    }
    await waitFor(() => expect(screen.getByText('Reset gpt-4o to platform standard pricing.')).toBeTruthy());
    expect(calls.some(c => c.method === 'DELETE' && c.path === `/api/v1/admin/customers/${orgId}/pricing/price-gpt`)).toBe(true);

    // Single-row edit opens a Dialog instead of expanding inline inside the table cell
    const refreshedGptRow = screen.getByText('gpt-4o').closest('tr');
    expect(refreshedGptRow).toBeTruthy();
    if (refreshedGptRow) {
      await user.click(within(refreshedGptRow).getByRole('button', { name: 'Set price' }));
    }
    const singleDialog = await screen.findByRole('dialog');
    expect(within(singleDialog).getByRole('heading', { name: 'Set custom price' })).toBeTruthy();
    expect(within(refreshedGptRow!).queryByLabelText(/Discount percentage/)).toBeNull();
    await user.click(within(singleDialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('CustomerDetail', () => {
  it('loads one enriched customer snapshot without cross-org calls and renders Overview, Pricing, and Workspaces & members', async () => {
    saveLocale('en');
    const orgId = '00000000-0000-4000-8000-000000000202';
    const workspaceId = '20000000-0000-4000-8000-000000000202';
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        if (url === `/api/v1/admin/customers/${orgId}`) {
          return Response.json({
            data: {
              organization_id: orgId,
              organization_name: 'Orbit Labs',
              created_at: '2026-11-15T10:00:00Z',
              owner: { name: 'Alice Lin', email: 'alice@orbit.ai' },
              workspace_count: 1,
              member_count: 2,
              custom_price_count: 0,
              workspaces: [
                { id: workspaceId, name: 'Production', slug: 'orbit-prod', created_at: '2026-11-15T10:05:00Z' },
              ],
              members: [
                {
                  id: '30000000-0000-4000-8000-000000000202',
                  name: 'Alice Lin',
                  email: 'alice@orbit.ai',
                  role: 'owner',
                  project_id: null,
                  created_at: '2026-11-15T10:01:00Z',
                },
                {
                  id: '30000000-0000-4000-8000-000000000203',
                  name: 'Bob Wu',
                  email: 'bob@orbit.ai',
                  role: 'admin',
                  project_id: workspaceId,
                  created_at: '2026-11-16T09:00:00Z',
                },
              ],
              recent_transactions: [
                {
                  id: '40000000-0000-4000-8000-000000000001',
                  kind: 'funding',
                  currency: 'USD',
                  amount_nanos: '300000000000',
                  created_at: '2026-11-20T12:00:00Z',
                  reverses_entry_id: null,
                },
                {
                  id: '40000000-0000-4000-8000-000000000002',
                  kind: 'charge',
                  currency: 'USD',
                  amount_nanos: '-50000000000',
                  created_at: '2026-11-21T14:30:00Z',
                  reverses_entry_id: null,
                },
              ],
              accounts: [
                {
                  currency: 'USD',
                  balance_nanos: '250000000000',
                  credit_limit_nanos: '50000000000',
                  outstanding_nanos: '0',
                  available_nanos: '300000000000',
                  policy_revision: '1',
                  warning_threshold_nanos: null,
                },
              ],
              credits: null,
            },
          });
        }
        if (url === `/api/v1/admin/customers/${orgId}/pricing`) {
          return Response.json({
            data: {
              organization_id: orgId,
              organization_name: 'Orbit Labs',
              as_of: '1763800000',
              items: [
                {
                  price_id: 'price-gpt',
                  model_alias: 'gpt-4o',
                  currency: 'USD',
                  version: '3',
                  revision: 'rev-gpt-3',
                  published_at: '2026-11-20T00:00:00Z',
                  standard_schedule: GPT_SCHEDULE,
                  active_promotion: null,
                },
              ],
            },
          });
        }
        return Response.json({ data: [] });
      }),
    );

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={[`/admin/customers/${orgId}`]}>
        <CustomerDetail token="admin-token" customerId={orgId} onWorkspaceCreated={vi.fn()} />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('region', { name: 'Orbit Labs' })).toBeTruthy();
    expect(screen.getByText('$250.00')).toBeTruthy();
    expect(screen.getByText('Available to spend: $300.00')).toBeTruthy();
    expect(screen.getByText('Alice Lin')).toBeTruthy();
    expect(screen.getByText('alice@orbit.ai')).toBeTruthy();
    expect(screen.getByText('Top-up')).toBeTruthy();
    expect(screen.getByText('+$300.00')).toBeTruthy();
    expect(screen.getByText('Usage charge')).toBeTruthy();
    expect(screen.getByText('-$50.00')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Top up' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Credit limit' })).toBeTruthy();
    expect(screen.queryByText(orgId)).toBeNull();
    expect(calls.some(url => url.includes('/workspaces') || url.includes('/members'))).toBe(false);

    await user.click(screen.getByRole('tab', { name: 'Pricing' }));
    expect(await screen.findByText('gpt-4o')).toBeTruthy();

    await user.click(screen.getByRole('tab', { name: 'Workspaces & members' }));
    expect((await screen.findByRole('table', { name: 'Customer workspaces' })).classList.contains('customer-access-table')).toBe(true);
    expect(await screen.findByRole('link', { name: 'Production' })).toBeTruthy();
    expect(screen.getByText('/orbit-prod')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Set up access' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Manage login & password' })).toBeNull();
    expect(screen.getAllByText('alice@orbit.ai').some(node => !node.closest('[hidden]'))).toBe(true);
    expect(screen.getByText('bob@orbit.ai')).toBeTruthy();
    expect(screen.getByText('All workspaces')).toBeTruthy();
  });
});
