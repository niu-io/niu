import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSessionCache } from '@/lib/query-cache';
import ModelMappingForm from '@/features/providers/components/ModelMappingForm';
import LoginRoute from '@/features/login/page';
import PublicModelsRoute from '@/features/models/public-page';
import AppLayout from '@/shell/AppLayout';

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));

const SAMPLE_CATALOG_MODELS = [
  {
    id: 'openai/gpt-5',
    object: 'model',
    owned_by: 'niu',
    public_catalog: true,
    billing_mode: 'currency',
    billing_source: 'niu_credits',
    customer_pricing: {
      currency: 'USD',
      unit: 'nanounits_per_million_tokens',
      prompt_rate: '1500000000',
      completion_rate: '6000000000',
    },
    catalog: {
      name: 'GPT-5',
      description: 'Flagship reasoning model',
      context_length: 256000,
      input_modalities: ['text'],
      output_modalities: ['text'],
    },
    capabilities: {
      chat_completions: true,
      streaming: true,
      tool_calls: true,
    },
  },
  {
    id: 'anthropic/claude-sonnet',
    object: 'model',
    owned_by: 'niu',
    public_catalog: true,
    billing_mode: 'currency',
    billing_source: 'own_api_key',
    customer_pricing: null,
    catalog: {
      name: 'Claude Sonnet',
      description: 'Shared upstream-funded model',
      context_length: 200000,
      input_modalities: ['text'],
      output_modalities: ['text'],
    },
    capabilities: {
      chat_completions: true,
      streaming: true,
    },
  },
];

function stubGatewayFetch(options: {
  catalogData: unknown[];
  authenticated?: boolean;
  workspaceSlug?: string;
}) {
  const { catalogData, authenticated = false, workspaceSlug = 'alpha' } = options;
  vi.stubGlobal(
    'fetch',
    vi.fn(async input => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const pathname = new URL(url, 'http://localhost').pathname;
      if (pathname === '/healthz') {
        return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
      }
      if (pathname === '/api/v1/public/branding') {
        return new Response(
          JSON.stringify({
            data: {
              revision: '1',
              settings: {
                display_name: 'Niu',
                default_appearance: 'system',
                logo_data_url: null,
                favicon_data_url: null,
                light: {},
                dark: {},
              },
            },
          }),
          { status: 200 },
        );
      }
      if (pathname === '/api/v1/auth/config') {
        return new Response(
          JSON.stringify({ password_login: true, browser_token_login: false, demo_login: false }),
          { status: 200 },
        );
      }
      if (pathname === '/api/v1/session') {
        if (!authenticated) {
          return new Response(JSON.stringify({ error: { message: 'Unauthorized' } }), { status: 401 });
        }
        return new Response(
          JSON.stringify({
            data: {
              kind: 'operator',
              operator: { id: 'op-1', email: 'dev@example.com', name: 'Developer' },
              permissions: { read: true, write: true },
            },
          }),
          { status: 200 },
        );
      }
      if (pathname === '/api/v1/workspaces') {
        return new Response(
          JSON.stringify({
            data: authenticated
              ? [{ id: 'ws-1', organization_id: 'org-1', name: 'Alpha', slug: workspaceSlug, role: 'owner' }]
              : [],
          }),
          { status: 200 },
        );
      }
      if (pathname === '/catalog/v1/models') {
        return new Response(
          JSON.stringify({ object: 'list', billing_mode: 'currency', data: catalogData }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }),
  );
}

beforeEach(() => {
  clearSessionCache();
});

afterEach(() => {
  cleanup();
  clearSessionCache();
  vi.unstubAllGlobals();
});

describe('PublicModelsRoute & conditional Models links', () => {
  it('redirects unauthenticated /models to /login when the public catalog is empty', async () => {
    stubGatewayFetch({ catalogData: [] });
    const router = createMemoryRouter(
      [
        {
          element: <AppLayout />,
          children: [
            { path: '/login', element: <LoginRoute /> },
            { path: '/models/*', element: <PublicModelsRoute /> },
          ],
        },
      ],
      { initialEntries: ['/models'] },
    );

    render(<RouterProvider router={router} />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Sign in' })).toBeTruthy());
    expect(router.state.location.pathname).toBe('/login');
    expect(screen.queryByRole('heading', { name: 'Models' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Models' })).toBeNull();
  });

  it('renders the full public catalog and detail view with /login?returnTo= actions when models exist', async () => {
    const user = userEvent.setup();
    stubGatewayFetch({ catalogData: SAMPLE_CATALOG_MODELS });
    const router = createMemoryRouter(
      [
        {
          element: <AppLayout />,
          children: [
            { path: '/login', element: <LoginRoute /> },
            { path: '/models/*', element: <PublicModelsRoute /> },
          ],
        },
      ],
      { initialEntries: ['/models'] },
    );

    render(<RouterProvider router={router} />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Models' })).toBeTruthy());
    expect(screen.getByRole('link', { name: 'Models' }).getAttribute('href')).toBe('/models');
    expect(screen.getByRole('link', { name: 'Docs' }).getAttribute('href')).toBe('/docs/');
    expect(screen.getByRole('button', { name: 'Language' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Color mode' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe(
      '/login?returnTo=%2Fmodels',
    );

    expect(screen.getByText('$1.5/M input tokens')).toBeTruthy();
    expect(screen.getByText('$6.00/M output tokens')).toBeTruthy();
    expect(screen.getByText('Upstream-funded · no Niu charge')).toBeTruthy();

    await user.click(screen.getByRole('link', { name: 'GPT-5', exact: true }));

    await waitFor(() =>
      expect(screen.getByRole('complementary', { name: 'openai/gpt-5 route details' })).toBeTruthy(),
    );
    expect(screen.getByRole('link', { name: 'Open Generations' }).getAttribute('href')).toBe(
      '/login?returnTo=%2Fgenerations%3Fnew%3D1%26model%3Dopenai%252Fgpt-5',
    );
    expect(
      screen.getByRole('link', { name: 'Sign in to get an API key' }).getAttribute('href'),
    ).toBe('/login?returnTo=%2Fworkspaces%2Fdefault%2Fkeys%2Fnew');
    expect(screen.queryByRole('link', { name: 'View requests for this model' })).toBeNull();
  });

  it('redirects signed-in visits from /models to the active workspace catalog', async () => {
    stubGatewayFetch({ catalogData: SAMPLE_CATALOG_MODELS, authenticated: true, workspaceSlug: 'alpha' });
    const router = createMemoryRouter(
      [
        {
          element: <AppLayout />,
          children: [
            { path: '/login', element: <LoginRoute /> },
            { path: '/models/*', element: <PublicModelsRoute /> },
            { path: '/workspaces/:workspace/models/*', element: <p>Workspace catalog</p> },
          ],
        },
      ],
      { initialEntries: ['/models/openai/gpt-5?sort=name'] },
    );

    render(<RouterProvider router={router} />);

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/workspaces/alpha/models/openai/gpt-5'),
    );
    expect(router.state.location.search).toBe('?sort=name');
  });

  it('shows the Models link on /login when /catalog/v1/models is populated and hides it when empty', async () => {
    stubGatewayFetch({ catalogData: [] });
    const emptyRouter = createMemoryRouter(
      [{ element: <AppLayout />, children: [{ path: '/login', element: <LoginRoute /> }] }],
      { initialEntries: ['/login'] },
    );
    const emptyView = render(<RouterProvider router={emptyRouter} />);
    await waitFor(() => expect(screen.getByRole('link', { name: 'Docs' })).toBeTruthy());
    expect(screen.queryByRole('link', { name: 'Models' })).toBeNull();
    emptyView.unmount();

    clearSessionCache();
    stubGatewayFetch({ catalogData: SAMPLE_CATALOG_MODELS });
    const populatedRouter = createMemoryRouter(
      [{ element: <AppLayout />, children: [{ path: '/login', element: <LoginRoute /> }] }],
      { initialEntries: ['/login'] },
    );
    render(<RouterProvider router={populatedRouter} />);
    await waitFor(() => expect(screen.getByRole('link', { name: 'Models' })).toBeTruthy());
    expect(screen.getByRole('link', { name: 'Models' }).getAttribute('href')).toBe('/models');
  });

  it('defaults public_catalog to true for internal models and false for commercial and personal models', async () => {
    const user = userEvent.setup();
    const onSaveShared = vi.fn(async () => {});
    const sharedView = render(
      <ModelMappingForm
        accessScope="internal"
        model={null}
        catalog={[]}
        catalogLoading={false}
        catalogError=""
        disabled={false}
        onCancel={() => {}}
        onSave={onSaveShared}
      />,
    );

    const checkbox = screen.getByRole('checkbox', { name: /Show in public catalog/i });
    expect(checkbox.getAttribute('aria-checked')).toBe('true');

    await user.click(screen.getByRole('button', { name: 'Upstream model' }));
    await user.type(screen.getByRole('textbox', { name: 'Search provider models' }), 'gpt-5');
    await user.click(screen.getByRole('menuitem', { name: /Use model ID “gpt-5”/i }));
    fireEvent.change(screen.getByLabelText('Niu model alias'), { target: { value: 'openai/gpt-5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add model' }));
    await waitFor(() => expect(onSaveShared).toHaveBeenCalledTimes(1));
    expect(onSaveShared.mock.calls[0][0].public_catalog).toBe(true);
    sharedView.unmount();

    const onSaveCommercial = vi.fn(async () => {});
    const commercialView = render(
      <ModelMappingForm
        accessScope="commercial"
        model={null}
        catalog={[]}
        catalogLoading={false}
        catalogError=""
        disabled={false}
        onCancel={() => {}}
        onSave={onSaveCommercial}
      />,
    );

    const commercialCheckbox = screen.getByRole('checkbox', { name: /Show in public catalog/i });
    expect(commercialCheckbox.getAttribute('aria-checked')).toBe('false');
    await user.click(screen.getByRole('button', { name: 'Upstream model' }));
    await user.type(screen.getByRole('textbox', { name: 'Search provider models' }), 'gpt-5-pro');
    await user.click(screen.getByRole('menuitem', { name: /Use model ID “gpt-5-pro”/i }));
    fireEvent.change(screen.getByLabelText('Niu model alias'), { target: { value: 'openai/gpt-5-pro' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add model' }));
    await waitFor(() => expect(onSaveCommercial).toHaveBeenCalledTimes(1));
    expect(onSaveCommercial.mock.calls[0][0].public_catalog).toBe(false);
    commercialView.unmount();

    const onSavePersonal = vi.fn(async () => {});
    render(
      <ModelMappingForm
        accessScope="personal"
        model={null}
        catalog={[]}
        catalogLoading={false}
        catalogError=""
        disabled={false}
        onCancel={() => {}}
        onSave={onSavePersonal}
      />,
    );

    expect(screen.queryByRole('checkbox', { name: /Show in public catalog/i })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Upstream model' }));
    await user.type(screen.getByRole('textbox', { name: 'Search provider models' }), 'gpt-5-mini');
    await user.click(screen.getByRole('menuitem', { name: /Use model ID “gpt-5-mini”/i }));
    fireEvent.change(screen.getByLabelText('Niu model alias'), { target: { value: 'openai/gpt-5-mini' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add model' }));
    await waitFor(() => expect(onSavePersonal).toHaveBeenCalledTimes(1));
    expect(onSavePersonal.mock.calls[0][0].public_catalog).toBe(false);
  });
});
