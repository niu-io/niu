import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import RoutePoolsPage from '../../../app/features/route-pools/page';
import { request, VendorRequestError } from '../../../app/features/providers/api';

vi.mock('../../../app/shell/dashboard-context', () => ({
  useDashboardContext: () => ({
    token: 'admin-token',
    organizations: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Acme Production' }],
  }),
}));

vi.mock('../../../app/features/providers/api', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../app/features/providers/api')>()),
  request: vi.fn(),
}));

describe('RoutePoolsPage', () => {
  it('lists pools without exposing organization UUIDs, filters via secondary popover, and edits candidates', async () => {
    const user = userEvent.setup();
    const writes: Array<Record<string, unknown>> = [];
    vi.mocked(request).mockImplementation(async (_token, path, method = 'GET', body) => {
      if (path.startsWith('/api/v1/routing/index')) {
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
      if (path === '/api/v1/routing' && method === 'PUT') {
        writes.push(body as Record<string, unknown>);
        return { data: { revision: 5 } };
      }
      if (path.startsWith('/api/v1/routing/history')) {
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
    await user.click(screen.getByRole('button', { name: 'Filter custom models' }));
    const searchInput = await screen.findByRole('searchbox', { name: 'Filter custom models' });
    await user.type(searchInput, 'claude-sonnet-4');
    expect(screen.queryByText('acme-private-sonnet')).toBeNull();
    expect(within(screen.getByRole('table', { name: 'Custom models' })).getByText('claude-sonnet-4')).toBeTruthy();

    // Edit custom model
    await user.click(screen.getByRole('button', { name: 'Edit custom model' }));
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
      public_catalog: false,
      candidates: [
        { alias: 'direct-sonnet-v2', priority: 100, weight: 800, enabled: true },
        { alias: 'openrouter-sonnet-4', priority: 50, weight: 1000, enabled: true },
      ],
    });
  });

  it('discovers candidate models beyond the first twelve Provider connections', async () => {
    const user = userEvent.setup();
    vi.mocked(request).mockImplementation(async (_token, path) => {
      if (path.startsWith('/api/v1/routing/index')) return { data: [], has_more: false, next_after: null };
      if (path === '/api/v1/vendors') return { data: Array.from({length: 13}, (_, i) => ({id: `provider-${i}`, name: `Provider ${i}`})) };
      if (path.startsWith('/api/v1/vendors/') && path.endsWith('/models')) return {data: path.includes('provider-12/') ? [{alias: 'last-provider-model', upstream_model: 'model', pricing: {}}] : []};
      throw new Error(`Unexpected request: ${path}`);
    });
    render(<MemoryRouter><RoutePoolsPage /></MemoryRouter>);
    await screen.findByText('No custom models configured yet.');
    await user.click(screen.getAllByRole('button', {name:'Create custom model'})[0]);
    await user.click(within(await screen.findByRole('dialog')).getByLabelText('Candidate model #1'));
    await user.type(screen.getByLabelText('Search candidate models 1'), 'last-provider-model');
    expect(await screen.findByRole('menuitemradio', {name:/last-provider-model/})).toBeTruthy();
  });

  it('warns when a Provider model list could not be loaded', async () => {
    const user = userEvent.setup();
    let attempts = 0;
    vi.mocked(request).mockImplementation(async (_token, path) => {
      if (path.startsWith('/api/v1/routing/index')) return { data: [], has_more: false, next_after: null };
      if (path === '/api/v1/vendors') return { data: [{id:'unavailable', name:'Provider'}] };
      if (path === '/api/v1/vendors/unavailable/models') {
        if (++attempts === 1) throw new Error('unavailable');
        return { data: [{alias:'recovered-model', upstream_model:'model', pricing:{}}] };
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    render(<MemoryRouter><RoutePoolsPage /></MemoryRouter>);
    await screen.findByText('No custom models configured yet.');
    await user.click(screen.getAllByRole('button', {name:'Create custom model'})[0]);
    expect(await screen.findByText(/Some Provider models could not be loaded/)).toBeTruthy();
    await user.type(screen.getByLabelText('Model alias'), 'draft-pool');
    await user.click(screen.getByRole('button', {name:'Retry loading models'}));
    await waitFor(() => expect(screen.queryByText(/Some Provider models could not be loaded/)).toBeNull());
    expect((screen.getByLabelText('Model alias') as HTMLInputElement).value).toBe('draft-pool');
    await user.click(screen.getByLabelText('Candidate model #1'));
    expect(await screen.findByRole('menuitemradio', {name:/recovered-model/})).toBeTruthy();
  });

  it('checks uncertain writes and preserves the draft through read failures and concurrent changes', async () => {
    const user = userEvent.setup();
    let checks = 0;
    const writes: Array<Record<string, unknown>> = [];
    vi.mocked(request).mockImplementation(async (_token, path, method = 'GET', body) => {
      if (path.startsWith('/api/v1/routing/index')) {
        return { data: [], has_more: false, next_after: null };
      }
      if (path === '/api/v1/vendors') return { data: [] };
      if (path === '/api/v1/routing' && method === 'PUT') {
        writes.push(body as Record<string, unknown>);
        if (writes.length === 1) throw new VendorRequestError('Service unavailable', 503);
        if (writes.length === 2) throw new VendorRequestError('Conflict', 409);
        return {data:{revision:2}};
      }
      if (path.startsWith('/api/v1/routing/') && method === 'GET') {
        if (++checks === 1) throw new VendorRequestError('Unavailable', 503);
        if (checks === 2) throw new VendorRequestError('Not found', 404);
        return {data:{alias:'gpt-5',revision:1, organization_id:null, enabled:true, candidates:[{alias:'other-model',priority:10,weight:100,enabled:true}], rules:[]}};
      }
      throw new Error(`Unexpected request: ${method} ${path}`);
    });

    render(
      <MemoryRouter>
        <RoutePoolsPage />
      </MemoryRouter>,
    );

    await screen.findByText('No custom models configured yet.');
    await user.click(screen.getAllByRole('button', { name: 'Create custom model' })[0]);
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Model alias'), 'gpt-5');
    await user.click(within(dialog).getByLabelText('Candidate model #1'));
    await user.type(screen.getByLabelText('Search candidate models 1'), 'openai-gpt-5');
    await user.click(screen.getByRole('menuitem', { name: 'Use existing alias “openai-gpt-5”' }));
    await user.click(within(dialog).getByRole('button', { name: 'Create custom model' }));

    expect(await screen.findByText(/write could not be confirmed/i)).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect((within(dialog).getByLabelText('Model alias') as HTMLInputElement).value).toBe('gpt-5');
    expect((within(dialog).getByRole('button', {name: 'Create custom model'}) as HTMLButtonElement).disabled).toBe(true);
    await user.click(within(dialog).getByRole('button', {name:'Check saved state'}));
    await screen.findByText(/saved state could not be checked/);
    expect(writes.length).toBe(1);
    await user.click(within(dialog).getByRole('button', {name:'Check saved state'}));
    await screen.findByText(/No newer saved changes were found/);
    expect((within(dialog).getByLabelText('Model alias') as HTMLInputElement).value).toBe('gpt-5');
    expect((within(dialog).getByLabelText('Model alias') as HTMLInputElement).disabled).toBe(true);
    expect((within(dialog).getByRole('button', {name:'Ownership scope'}) as HTMLButtonElement).disabled).toBe(true);
    await user.click(within(dialog).getByRole('button', {name:'Create custom model'}));
    await screen.findByText(/changed in another session/);
    await user.click(within(dialog).getByRole('button', {name:'Check saved state'}));
    await screen.findByText(/saved custom model has changed/);
    expect((within(dialog).getByRole('button', {name:'Create custom model'}) as HTMLButtonElement).disabled).toBe(true);
    const saved = within(dialog).getByRole('region', {name:'Saved custom model'});
    expect(within(saved).getByText(/other-model/)).toBeTruthy();
    await user.click(within(saved).getByRole('button', {name:'Continue with my draft'}));
    expect((within(dialog).getByRole('button', {name:'Save changes'}) as HTMLButtonElement).disabled).toBe(false);
    expect((within(dialog).getByLabelText('Model alias') as HTMLInputElement).value).toBe('gpt-5');
    expect(writes.length).toBe(2);
    await user.click(within(dialog).getByRole('button', {name:'Save changes'}));
    await waitFor(() => expect(writes.length).toBe(3));
    expect(writes[2].expected_revision).toBe(1);
    expect(writes[2].candidates).toEqual([{alias:'openai-gpt-5', priority:100, weight:1000, enabled:true}]);
  });

  it('recognizes an interrupted save that reached the server and keeps subsequent edits', async () => {
    const user = userEvent.setup();
    let attempted: Record<string, unknown> | undefined;
    vi.mocked(request).mockImplementation(async (_token, path, method = 'GET', body) => {
      if (path.startsWith('/api/v1/routing/index')) return {data:[], has_more:false, next_after:null};
      if (path === '/api/v1/vendors') return {data:[]};
      if (path === '/api/v1/routing' && method === 'PUT') {attempted = body as Record<string, unknown>; throw new VendorRequestError('Unavailable',503);}
      if (path.startsWith('/api/v1/routing/') && method === 'GET') return {data:{...attempted, revision:1, display_name:null, description:null, project_id:null, public_catalog:false, billing_mode:'pool_tariff', rules:[], default_action:'candidates'}};
      throw new Error(`Unexpected request: ${method} ${path}`);
    });
    render(<MemoryRouter><RoutePoolsPage /></MemoryRouter>);
    await screen.findByText('No custom models configured yet.');
    await user.click(screen.getAllByRole('button',{name:'Create custom model'})[0]);
    const dialog=await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Model alias'),'gpt-5');
    await user.click(within(dialog).getByLabelText('Candidate model #1'));
    await user.type(screen.getByLabelText('Search candidate models 1'),'model-one');
    await user.click(screen.getByRole('menuitem',{name:'Use existing alias “model-one”'}));
    await user.click(within(dialog).getByRole('button',{name:'Create custom model'}));
    await screen.findByText(/write could not be confirmed/);
    await user.type(within(dialog).getByLabelText('Display name (optional)'),'Later draft');
    await user.click(within(dialog).getByRole('button',{name:'Check saved state'}));
    await screen.findByText(/previous save matches the saved custom model/);
    expect((within(dialog).getByLabelText('Display name (optional)') as HTMLInputElement).value).toBe('Later draft');
    expect((within(dialog).getByLabelText('Model alias') as HTMLInputElement).disabled).toBe(true);
    expect((within(dialog).getByRole('button',{name:'Save changes'}) as HTMLButtonElement).disabled).toBe(false);
  });

  it('configures custom model identity, billing mode, preset routing rules, preview, and strategy audit', async () => {
    const user = userEvent.setup();
    const writes: Array<Record<string, unknown>> = [];
    vi.mocked(request).mockImplementation(async (_token, path, method = 'GET', body) => {
      if (path.startsWith('/api/v1/routing/index')) {
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
      if (path === '/api/v1/routing' && method === 'PUT') {
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
    expect(screen.queryByText('Public catalog')).toBeNull();
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
