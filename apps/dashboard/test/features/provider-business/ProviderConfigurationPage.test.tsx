vi.mock('@/shell/platform-currency', () => ({
  usePlatformCurrency: () => ({ currency: 'USD', error: '', reload: () => {} }),
}));

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import ProvidersRoute from '@/features/providers/page';
import { emptyCapabilities } from '@/features/providers/api';
import type { DashboardContext } from '@/shell/dashboard-context';

const providerUuid = '9cc6b65a-0b19-4f18-8828-89d6038973f0';

const mockContext = vi.hoisted(() => ({ value: {} as DashboardContext }));
vi.mock('@/shell/dashboard-context', async importOriginal => {
  const actual = await importOriginal<typeof import('@/shell/dashboard-context')>();
  return {
    ...actual,
    useDashboardContext: () => mockContext.value,
  };
});

function setupUnifiedProvider(initialEntry = '/admin/providers/qiniu') {
  let profile = {
    id: providerUuid,
    slug: 'qiniu',
    name: 'Qiniu',
    description: 'Cloud inference gateway',
    website_url: 'https://qiniu.com',
    logo_url: '',
    model_access_mode: 'all' as 'all' | 'allowlist' | 'blocklist',
    default_discount_bps: 10000,
    allowlisted_models: [] as string[],
    blocklisted_models: [] as string[],
    revision: 1,
  };

  let models = [
    {
      alias: 'qiniu/deepseek-v3',
      upstream_model: 'deepseek-v3',
      vendor_id: 'conn-1',
      public_catalog: true,
      enabled: true,
      capabilities: emptyCapabilities(),
      pricing: null,
      revision: 1,
      available: true,
    },
    {
      alias: 'qiniu/qwen-max',
      upstream_model: 'qwen-max',
      vendor_id: 'conn-1',
      public_catalog: true,
      enabled: true,
      capabilities: emptyCapabilities(),
      pricing: null,
      revision: 1,
      available: true,
    },
  ];

  let offers = [
    {
      id: 'offer-1',
      model_alias: 'qiniu/deepseek-v3',
      revision: 'rev-1',
      rate_kind: 'text',
      currency: 'USD',
      prompt_rate: '2000000000',
      completion_rate: '8000000000',
      cached_prompt_rate: null,
      active: true,
      qualified: true,
      route_ready: true,
    },
    {
      id: 'offer-2',
      model_alias: 'qiniu/qwen-max',
      revision: 'rev-2',
      rate_kind: 'text',
      currency: 'USD',
      prompt_rate: '4000000000',
      completion_rate: '12000000000',
      cached_prompt_rate: null,
      active: true,
      qualified: true,
      route_ready: true,
    },
  ];

  const session = {
    kind: 'installation' as const,
    operating_mode: 'resale',
    permissions: { read: true, write: true, manage_operators: true, platform_admin: true },
  };

  mockContext.value = {
    token: `test-token-${Math.random()}`,
    session,
    providerDirectory: [
      { id: providerUuid, slug: 'qiniu', name: 'Qiniu' },
    ],
    providerDirectoryLoading: false,
    providerDirectoryError: '',
    workspace: { id: 'ws-default', slug: 'default', name: 'Default' },
    workspaces: [{ id: 'ws-default', slug: 'default', name: 'Default' }],
    organization: { id: 'org-1', name: 'Org' },
    refreshWorkspace: async () => {},
    refreshModels: async () => {},
  } as unknown as DashboardContext;

  const calls: Array<{ path: string; method: string; body?: Record<string, unknown> }> = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
      calls.push({ path, method, body });

      if (path === '/api/v1/session') {
        return Response.json({ data: session });
      }
      if (path === '/api/v1/admin/providers') {
        return Response.json({
          data: [
            {
              id: providerUuid,
              slug: 'qiniu',
              name: 'Qiniu',
              api_keys: 1,
              enabled_api_keys: 1,
              models: models.length,
              enabled_model_routes: models.filter(m => m.enabled).length,
              offers: offers.length,
              ready_offers: offers.filter(o => o.active).length,
              members: 0,
            },
          ],
        });
      }
      if (path === `/api/v1/admin/providers/${providerUuid}` || path === '/api/v1/admin/providers/qiniu') {
        if (method === 'PATCH' && body) {
          profile = {
            ...profile,
            name: String(body.name ?? profile.name),
            model_access_mode: (body.model_access_mode as typeof profile.model_access_mode) ?? profile.model_access_mode,
            default_discount_bps:
              typeof body.default_discount_bps === 'number' ? body.default_discount_bps : profile.default_discount_bps,
            allowlisted_models: Array.isArray(body.allowlisted_models)
              ? (body.allowlisted_models as string[])
              : profile.allowlisted_models,
            blocklisted_models: Array.isArray(body.blocklisted_models)
              ? (body.blocklisted_models as string[])
              : profile.blocklisted_models,
            revision: profile.revision + 1,
          };
        }
        return Response.json({ data: profile });
      }
      if (path.endsWith('/integration')) {
        return Response.json({
          data: { integration_type: 'openrouter', effective_type: 'openrouter', source: 'provider', revision: 1 },
        });
      }
      if (path.startsWith('/api/v1/admin/providers/connections') && method === 'GET' && !path.endsWith('/models')) {
        return Response.json({
          data: [
            {
              id: 'conn-1',
              name: 'Qiniu Primary Key',
              adapter: 'openai',
              api_base: 'https://api.qnaigc.com/v1',
              enabled: true,
              revision: 1,
              has_credential: true,
              owner_funded: false,
              access_scope: 'commercial',
              provider: { id: providerUuid, name: 'Qiniu' },
              supplier: { id: providerUuid, name: 'Qiniu' },
            },
          ],
        });
      }
      if (path === '/api/v1/admin/providers/connections/conn-1/models') {
        if (method === 'POST' && body) {
          models = models.map(m =>
            m.alias === body.alias ? { ...m, enabled: Boolean(body.enabled), revision: m.revision + 1 } : m,
          );
          return Response.json({ data: models.find(m => m.alias === body.alias) });
        }
        return Response.json({ data: models });
      }
      if (path.includes('/administration?days=90')) {
        return Response.json({
          data: {
            balances: [],
            consumption: [],
            settlements: [],
            offers_has_more: false,
            offers,
          },
        });
      }
      if (path.endsWith('/offers') && method === 'POST' && body) {
        const idx = offers.findIndex(o => o.model_alias === body.model_alias);
        const nextOffer = {
          id: idx >= 0 ? offers[idx].id : `offer-${offers.length + 1}`,
          model_alias: String(body.model_alias),
          revision: `rev-${Math.random()}`,
          rate_kind: 'text',
          currency: String(body.currency),
          prompt_rate: String(body.prompt_rate),
          completion_rate: String(body.completion_rate),
          cached_prompt_rate: (body.cached_prompt_rate as string | null) ?? null,
          active: true,
          qualified: true,
          route_ready: true,
        };
        if (idx >= 0) offers[idx] = nextOffer;
        else offers.push(nextOffer);
        return Response.json({ data: { id: nextOffer.id, revision: nextOffer.revision, active: true } });
      }
      if (path.includes('/offers/') && method === 'PATCH' && body) {
        const offerId = path.split('/offers/')[1];
        offers = offers.map(o => (o.id === offerId ? { ...o, active: Boolean(body.active) } : o));
        return Response.json({ data: { active: Boolean(body.active) } });
      }
      if (path.includes('/admin/pricing/standard-prices')) {
        if (method === 'POST') {
          return Response.json({ data: { price_id: 'p1', revision: 'r1', version: '1' } });
        }
        return Response.json({
          data: [
            {
              model_alias: 'qiniu/deepseek-v3',
              currency: 'USD',
              version: '1',
              schedule: { kind: 'text', prompt_rate: '2000000000', completion_rate: '8000000000' },
            },
            {
              model_alias: 'qiniu/qwen-max',
              currency: 'USD',
              version: '1',
              schedule: { kind: 'text', prompt_rate: '4000000000', completion_rate: '12000000000' },
            },
          ],
        });
      }
      return Response.json({ data: {} });
    }),
  );

  const router = createMemoryRouter(
    [
      { path: '/admin/providers/:providerId', element: <ProvidersRoute /> },
      { path: '/admin/providers/:providerId/:section', element: <ProvidersRoute /> },
    ],
    { initialEntries: [initialEntry] },
  );

  render(<RouterProvider router={router} />);
  return { router, calls };
}

describe('Unified single-page Provider configuration', () => {
  it('consolidates profile, API keys, and default-collapsed model policy on one page and opens the model browser without nested dialogs', async () => {
    const { calls } = setupUnifiedProvider('/admin/providers/qiniu');
    const user = userEvent.setup();

    await screen.findByRole('heading', { name: 'Business profile' });
    await screen.findByText('Qiniu Primary Key');
    await screen.findByRole('heading', { name: 'Models & discounts' });

    // Models are NOT listed on the page by default when All models is selected
    expect(screen.queryByText('qiniu/deepseek-v3')).toBeNull();
    expect(screen.queryByText('qiniu/qwen-max')).toBeNull();
    expect(screen.getByText('No discount')).toBeTruthy();
    expect(calls.some(c => c.path.includes('/members'))).toBe(false);

    // Browse models opens the catalog dialog and transitions inline without nested dialogs
    await user.click(await screen.findByRole('button', { name: 'Browse models (2)' }));
    const browserDialog = await screen.findByRole('dialog', { name: 'Browse Provider models' });
    expect(await within(browserDialog).findByText('qiniu/deepseek-v3')).toBeTruthy();
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);

    await user.click(within(browserDialog).getAllByRole('button', { name: 'Discount' })[0]);
    expect(await within(browserDialog).findByRole('button', { name: /Back to models/ })).toBeTruthy();
    // Strictly one dialog in the DOM (zero nested modals)
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    await user.click(within(browserDialog).getByRole('button', { name: /Back to models/ }));
    expect(await within(browserDialog).findByText('qiniu/qwen-max')).toBeTruthy();
    await user.click(within(browserDialog).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('supports switching to blocklist, adding a blocked model, and updating default purchase discount', async () => {
    const { calls } = setupUnifiedProvider('/admin/providers/qiniu');
    const user = userEvent.setup();

    await screen.findByRole('heading', { name: 'Models & discounts' });
    await user.click(screen.getByLabelText('Model access'));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Blocklist (exclude selected)' }));

    await screen.findByText('No blocked models. All available models are currently enabled.');
    await user.click(screen.getByRole('button', { name: 'Add blocked models' }));
    const picker = await screen.findByRole('dialog', { name: 'Add blocked models' });
    await user.click(within(picker).getByText('qiniu/qwen-max'));
    await user.click(within(picker).getByRole('button', { name: 'Add (1)' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // Only the blocked model appears inline on the page
    expect(await screen.findByText('qiniu/qwen-max')).toBeTruthy();
    expect(screen.queryByText('qiniu/deepseek-v3')).toBeNull();

    // Update default purchase discount to 80%
    await user.click(screen.getByRole('button', { name: 'Edit discount' }));
    const discountModal = await screen.findByRole('dialog', { name: 'Default purchase discount' });
    await user.click(within(discountModal).getByRole('button', { name: '80%' }));
    await user.click(within(discountModal).getByRole('button', { name: 'Save & apply' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    expect(
      calls.some(
        c =>
          c.method === 'PATCH' &&
          c.path.includes('/api/v1/admin/providers/') &&
          c.body?.default_discount_bps === 8000,
      ),
    ).toBe(true);
  });

  it.each([
    ['/admin/providers/qiniu/members', '/admin/providers/qiniu'],
    ['/admin/providers/qiniu/keys', '/admin/providers/qiniu'],
    ['/admin/providers/qiniu/models', '/admin/providers/qiniu'],
    ['/admin/providers/qiniu/settings', '/admin/providers/qiniu'],
    ['/admin/providers/qiniu/settlements', '/admin/providers/qiniu/usage'],
  ])('redirects legacy subroute %s to %s', async (from, expected) => {
    const { router } = setupUnifiedProvider(from);
    await waitFor(() => expect(router.state.location.pathname).toBe(expected));
  });
});
