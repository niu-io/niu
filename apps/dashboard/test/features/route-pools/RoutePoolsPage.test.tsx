import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import RoutePoolsPage from '../../../src/features/route-pools/page';
import { request, VendorRequestError } from '../../../src/features/providers/api';

vi.mock('../../../src/app/dashboard-context', () => ({
  useDashboardContext: () => ({
    token: 'admin-token',
    organizations: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Acme Production' }],
  }),
}));

vi.mock('../../../src/features/providers/api', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../src/features/providers/api')>()),
  request: vi.fn(),
}));

describe('RoutePoolsPage', () => {
  it('lists pools without exposing organization UUIDs, filters via secondary popover, and edits candidates', async () => {
    const user = userEvent.setup();
    const writes: Array<Record<string, unknown>> = [];
    vi.mocked(request).mockImplementation(async (_token, path, method = 'GET', body) => {
      if (path.startsWith('/api/v1/pools/index')) {
        return {
          data: [
            {
              alias: 'claude-sonnet-4',
              organization_id: null,
              enabled: true,
              revision: 4,
              candidates: [
                { alias: 'anthropic-direct-sonnet-4', priority: 100, weight: 800, enabled: true },
                { alias: 'openrouter-sonnet-4', priority: 50, weight: 1000, enabled: true },
              ],
            },
            {
              alias: 'acme-private-sonnet',
              organization_id: '11111111-1111-4111-8111-111111111111',
              enabled: true,
              revision: 2,
              candidates: [{ alias: 'acme-byok-sonnet', priority: 100, weight: 1000, enabled: true }],
            },
          ],
          has_more: false,
          next_after: null,
        };
      }
      if (path === '/api/v1/vendors') return { data: [{ id: 'test-provider', name: 'Direct Provider' }] };
      if (path === '/api/v1/vendors/test-provider/models') return { data: [{ alias: 'direct-sonnet-v2', upstream_model: 'claude-sonnet-4', pricing: {} }] };
      if (path === '/api/v1/pools' && method === 'PUT') {
        writes.push(body as Record<string, unknown>);
        return { data: { revision: 5 } };
      }
      if (path.startsWith('/api/v1/pools/history')) {
        return {
          data: [
            {
              alias: 'claude-sonnet-4',
              organization_id: null,
              enabled: true,
              revision: 4,
              recorded_at: '2026-10-19T05:00:00Z',
              candidates: [{ alias: 'anthropic-direct-sonnet-4', priority: 100, weight: 800, enabled: true }],
            },
          ],
        };
      }
      throw new Error(`Unexpected request: ${method} ${path}`);
    });

    const { container } = render(
      <MemoryRouter>
        <RoutePoolsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('claude-sonnet-4')).toBeTruthy();
    expect(screen.getByText('acme-private-sonnet')).toBeTruthy();
    expect(screen.getAllByText('Acme Production').length).toBeGreaterThan(0);
    // Must never expose raw organization UUIDs in product UI
    expect(container.textContent).not.toContain('11111111-1111-4111-8111-111111111111');

    // Secondary search popover filter
    await user.click(screen.getByRole('button', { name: 'Filter model pools' }));
    const searchInput = await screen.findByRole('searchbox', { name: 'Filter model pools' });
    await user.type(searchInput, 'claude-sonnet-4');
    expect(screen.queryByText('acme-private-sonnet')).toBeNull();
    expect(within(screen.getByRole('table', { name: 'Model pools' })).getByText('claude-sonnet-4')).toBeTruthy();

    // Edit pool
    await user.click(screen.getByRole('button', { name: 'Edit pool' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Edit claude-sonnet-4' })).toBeTruthy();
    await user.click(within(dialog).getByLabelText('Candidate model #1'));
    const modelSearch = await screen.findByLabelText('Search candidate models 1');
    await user.type(modelSearch, 'Direct Provider');
    await screen.findByRole('menuitemradio', { name: /direct-sonnet-v2/ });
    await user.keyboard('{ArrowDown}{Enter}');
    expect(within(dialog).getByLabelText('Candidate model #1').textContent).toContain('direct-sonnet-v2');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(writes.length).toBe(1));
    expect(writes[0]).toEqual({
      alias: 'claude-sonnet-4',
      organization_id: null,
      enabled: true,
      expected_revision: 4,
      candidates: [
        { alias: 'direct-sonnet-v2', priority: 100, weight: 800, enabled: true },
        { alias: 'openrouter-sonnet-4', priority: 50, weight: 1000, enabled: true },
      ],
    });
  });

  it('reconciles uncertain pool writes without reposting', async () => {
    const user = userEvent.setup();
    vi.mocked(request).mockImplementation(async (_token, path, method = 'GET') => {
      if (path.startsWith('/api/v1/pools/index')) {
        return { data: [], has_more: false, next_after: null };
      }
      if (path === '/api/v1/vendors') return { data: [] };
      if (path === '/api/v1/pools' && method === 'PUT') {
        throw new VendorRequestError('Service unavailable', 503);
      }
      throw new Error(`Unexpected request: ${method} ${path}`);
    });

    render(
      <MemoryRouter>
        <RoutePoolsPage />
      </MemoryRouter>,
    );

    await screen.findByText('No model pools configured yet.');
    await user.click(screen.getAllByRole('button', { name: 'Create model pool' })[0]);
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Pool alias'), 'gpt-5');
    await user.click(within(dialog).getByLabelText('Candidate model #1'));
    await user.type(screen.getByLabelText('Search candidate models 1'), 'openai-gpt-5');
    await user.click(screen.getByRole('menuitem', { name: 'Use existing alias “openai-gpt-5”' }));
    await user.click(within(dialog).getByRole('button', { name: 'Create model pool' }));

    expect(await screen.findByText(/write could not be confirmed/i)).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('configures custom model identity, billing mode, preset routing rules, preview, and strategy audit', async () => {
    const user = userEvent.setup();
    const writes: Array<Record<string, unknown>> = [];
    vi.mocked(request).mockImplementation(async (_token, path, method = 'GET', body) => {
      if (path.startsWith('/api/v1/pools/index')) {
        return {
          data: [
            {
              alias: 'smart-router',
              display_name: 'Smart Router',
              description: 'Multimodal model pool',
              organization_id: null,
              enabled: true,
              public_catalog: true,
              billing_mode: 'candidate_tariff',
              revision: 2,
              candidates: [
                { alias: 'fast-text', priority: 0, weight: 80, enabled: true },
                { alias: 'vision-pro', priority: 0, weight: 20, enabled: true },
              ],
              rules: [
                {
                  id: 'vision-rule',
                  name: 'Vision split',
                  enabled: true,
                  conditions: { vision: true },
                  candidates: [{ alias: 'vision-pro', priority: 0, weight: 100, enabled: true }],
                },
              ],
              default_action: 'candidates',
            },
          ],
          has_more: false,
          next_after: null,
        };
      }
      if (path === '/api/v1/vendors') return { data: [] };
      if (path === '/api/v1/pools' && method === 'PUT') {
        writes.push(body as Record<string, unknown>);
        return { data: { revision: 3 } };
      }
      if (path.endsWith('/preview') && method === 'POST') {
        return {
          data: {
            pool_alias: 'smart-router',
            pool_slug: 'smart-router',
            billing_mode: 'candidate_tariff',
            matched_rule: { id: 'vision-rule', name: 'Vision split' },
            used_default_action: null,
            eligible_candidates: [
              {
                alias: 'vision-pro',
                priority: 0,
                weight: 100,
                winning_tier: true,
                traffic_share_percent: 100,
              },
            ],
            ineligible_candidates: [],
          },
        };
      }
      if (path.includes('/audit') && method === 'GET') {
        return {
          data: {
            alias: 'smart-router',
            display_name: 'Smart Router',
            slug: 'smart-router',
            billing_mode: 'candidate_tariff',
            public_catalog: true,
            enabled: true,
            revision: 2,
            days: 30,
            from: '2026-09-28T00:00:00Z',
            until: '2026-10-28T00:00:00Z',
            pool_tariff: {
              has_retail_tariff: false,
              currency: 'USD',
              prompt_rate: null,
              completion_rate: null,
              has_credits_tariff: false,
            },
            totals: {
              observed_attempts: 120,
              completed_attempts: 118,
              failed_attempts: 2,
              customer_charge_nanos: '200000000',
              supplier_cost_nanos: '145000000',
              net_margin_nanos: '55000000',
            },
            findings: [
              {
                severity: 'healthy',
                code: 'strategy_healthy',
                message: 'Pool routing and billing configuration passed all checks.',
              },
            ],
            candidates: [
              {
                alias: 'fast-text',
                priority: 0,
                weight: 80,
                enabled: true,
                winning_tier: true,
                configured_share_percent: 80,
                has_retail_tariff: true,
                retail_currency: 'USD',
                retail_prompt_rate: '500',
                retail_completion_rate: '1500',
                has_credits_tariff: false,
                qualified_offer_count: 1,
                min_supplier_prompt_rate: '400',
                min_supplier_completion_rate: '1200',
                margin_status: 'healthy',
                observed_attempts: 96,
                observed_share_percent: 80,
                completed_attempts: 95,
                failed_attempts: 1,
                avg_duration_ms: 420,
                p95_duration_ms: 810,
                customer_charge_nanos: '120000000',
                supplier_cost_nanos: '90000000',
                net_margin_nanos: '30000000',
              },
              {
                alias: 'vision-pro',
                priority: 0,
                weight: 20,
                enabled: true,
                winning_tier: true,
                configured_share_percent: 20,
                has_retail_tariff: true,
                retail_currency: 'USD',
                retail_prompt_rate: '2000',
                retail_completion_rate: '6000',
                has_credits_tariff: false,
                qualified_offer_count: 1,
                min_supplier_prompt_rate: '1500',
                min_supplier_completion_rate: '4500',
                margin_status: 'healthy',
                observed_attempts: 24,
                observed_share_percent: 20,
                completed_attempts: 23,
                failed_attempts: 1,
                avg_duration_ms: 690,
                p95_duration_ms: 1150,
                customer_charge_nanos: '80000000',
                supplier_cost_nanos: '55000000',
                net_margin_nanos: '25000000',
              },
            ],
          },
        };
      }
      throw new Error(`Unexpected request: ${method} ${path}`);
    });

    render(
      <MemoryRouter>
        <RoutePoolsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Smart Router')).toBeTruthy();
    expect(screen.getByText('Public catalog')).toBeTruthy();
    expect(screen.getByText('Per-candidate billing')).toBeTruthy();

    // Open Strategy & billing audit dialog
    await user.click(screen.getByRole('button', { name: 'Audit smart-router' }));
    const auditDialog = await screen.findByRole('dialog');
    expect(within(auditDialog).getByText(/Strategy & billing audit/i)).toBeTruthy();
    expect(await within(auditDialog).findByText('120 requests')).toBeTruthy();
    expect(within(auditDialog).getByText(/Pool routing and billing configuration passed all checks/i)).toBeTruthy();
    await user.click(within(auditDialog).getAllByRole('button', { name: 'Close' })[0]);

    // Open Routing preview dialog and run dry-run preview
    await user.click(screen.getByRole('button', { name: 'Preview smart-router' }));
    const previewDialog = await screen.findByRole('dialog');
    await user.click(within(previewDialog).getByLabelText('Vision / image input'));
    await user.click(within(previewDialog).getByRole('button', { name: 'Run preview' }));
    expect(await within(previewDialog).findByText(/Matched rule: Vision split/i)).toBeTruthy();
    expect(within(previewDialog).getByText('vision-pro')).toBeTruthy();
  });
});
