import { act, render, screen, waitFor } from '@testing-library/react';
import { RouterProvider, type RouteObject } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { request } from '../../app/lib/api-client';
import { peekQuery } from '../../app/lib/query-cache';
import { loadCriticalRouteEndpoint, routeShouldRevalidate } from '../../app/lib/route-data';
import { bindLazy, buildAppRoutes, createDashboardMemoryRouter } from '../../app/routes';
import AppLayout from '../../app/shell/AppLayout';
import AppError from '../../app/shell/route-error';
import { dashboardRouterContext, type RouterSessionSnapshot } from '../../app/shell/router-context';

function createBaseFetchMock(extra?: (url: string, init?: RequestInit) => Promise<Response | null> | Response | null) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const custom = await extra?.(url, init);
    if (custom) return custom;

    if (url === '/api/v1/auth/config') return Response.json({ password_login: true });
    if (url === '/healthz') return Response.json({ status: 'ok', model_count: 1 });
    if (url === '/api/v1/session') {
      return Response.json({
        data: {
          kind: 'operator',
          operator: { id: 'op-1', role: 'owner', organization_id: 'org-1', project_id: null },
          permissions: { read: true, write: true, manage_operators: true },
          provider_memberships: [],
        },
      });
    }
    if (url === '/api/v1/organizations') {
      return Response.json({ data: [{ id: 'org-1', name: 'Acme Org' }] });
    }
    if (url === '/api/v1/workspaces') {
      return Response.json({
        data: [
          {
            id: 'ws-alpha',
            slug: 'alpha',
            name: 'Alpha Workspace',
            organization_id: 'org-1',
            organization_name: 'Acme Org',
          },
          {
            id: 'ws-beta',
            slug: 'beta',
            name: 'Beta Workspace',
            organization_id: 'org-1',
            organization_name: 'Acme Org',
          },
        ],
      });
    }
    if (url.startsWith('/api/v1/payments/readiness')) {
      return Response.json({ data: { ready: true, reason: null } });
    }
    if (url.startsWith('/api/v1/models')) {
      return Response.json({
        data: [{ id: 'gpt-5', provider: 'openai', public_catalog: true }],
      });
    }
    if (url.includes('/requests?')) {
      return Response.json({
        data: [],
        summary: {
          request_count: 0,
          usage_count: 0,
          prompt_tokens: '0',
          completion_tokens: '0',
          customer_charges: [],
          unresolved_customer_charge_count: 0,
          unpriced_request_count: 0,
        },
        next_cursor: null,
      });
    }
    return Response.json({ data: [] });
  });
}

describe('production router & query-cache data lifecycle (niu-8hv.3)', () => {
  it('populates dashboardRouterContext via getContext and skips redundant revalidation on transient hash/modal params', async () => {
    const observedContexts: Array<RouterSessionSnapshot | null> = [];
    let loaderRuns = 0;

    vi.stubGlobal('fetch', createBaseFetchMock());

    const customRoutes: RouteObject[] = [
      {
        path: '/',
        element: <AppLayout />,
        children: [
          {
            errorElement: <AppError />,
            children: [
              {
                path: 'workspaces/:workspace',
                element: <div data-testid="ws-overview">Overview Ready</div>,
              },
              {
                path: 'workspaces/:workspace/probe',
                shouldRevalidate: routeShouldRevalidate,
                loader: ({ context }) => {
                  loaderRuns += 1;
                  observedContexts.push(context.get(dashboardRouterContext));
                  return { run: loaderRuns };
                },
                element: <div data-testid="ws-probe">Probe Ready</div>,
              },
            ],
          },
        ],
      },
    ];

    const router = createDashboardMemoryRouter(['/workspaces/alpha'], customRoutes);
    render(<RouterProvider router={router} />);

    await screen.findByTestId('ws-overview');

    await act(async () => {
      await router.navigate('/workspaces/alpha/probe');
    });
    await screen.findByTestId('ws-probe');

    expect(loaderRuns).toBe(1);
    expect(observedContexts[0]?.token).toBe('niu-browser-member-session');
    expect(observedContexts[0]?.session?.operator?.id).toBe('op-1');
    expect(observedContexts[0]?.activeWorkspace?.slug).toBe('alpha');

    // Hash-only changes must NOT re-run the page route loader. The former
    // ?settings= modal was replaced by a canonical Settings route navigation.
    await act(async () => {
      await router.navigate('/workspaces/alpha/probe#details');
    });
    expect(loaderRuns).toBe(1);

    // Switching workspace scope MUST run the route loader with updated context
    await act(async () => {
      await router.navigate('/workspaces/beta/probe');
    });
    expect(loaderRuns).toBe(2);
  });

  it('aborts slow superseded route loader fetches via request.signal and never commits obsolete data', async () => {
    let guardrailsAborted = false;
    let resolveSlowGuardrails: ((res: Response) => void) | undefined;

    vi.stubGlobal(
      'fetch',
      createBaseFetchMock((url, init) => {
        if (url === '/api/v1/organizations/org-1/projects/ws-alpha/guardrails') {
          return new Promise<Response>((resolve, reject) => {
            resolveSlowGuardrails = resolve;
            init?.signal?.addEventListener(
              'abort',
              () => {
                guardrailsAborted = true;
                reject(new DOMException('The operation was aborted.', 'AbortError'));
              },
              { once: true },
            );
          });
        }
        if (url === '/api/v1/workspaces/ws-alpha/keys') {
          return Response.json({
            data: [
              {
                id: 'key-1',
                slug: 'prod-agent-key',
                name: 'Prod Agent Key',
                allowed_models: ['*'],
                expires_at_ms: null,
                last_used_at_ms: null,
                revoked: false,
                expired: false,
              },
            ],
          });
        }
        return null;
      }),
    );

    const router = createDashboardMemoryRouter(['/workspaces/alpha'], buildAppRoutes());
    render(<RouterProvider router={router} />);

    // Wait for authenticated Overview shell to finish mounting
    await screen.findByRole('heading', { name: 'Overview' }, { timeout: 5000 });

    // Navigate to slow Guardrails route -> non-blocking loader starts deduplicated fetch & renders 1:1 route skeleton immediately
    await act(async () => {
      await router.navigate('/workspaces/alpha/guardrails');
    });

    await waitFor(() => expect(resolveSlowGuardrails).toBeDefined());
    expect(guardrailsAborted).toBe(false);

    // Supersede slow Guardrails route read by navigating to API Keys
    await act(async () => {
      await router.navigate('/workspaces/alpha/keys');
    });

    expect(guardrailsAborted).toBe(true);
    expect(router.state.location.pathname).toBe('/workspaces/alpha/keys');
    expect(await screen.findByText('Prod Agent Key')).toBeTruthy();

    // Even if the slow server response tried to resolve late, aborted loader read never entered cache
    resolveSlowGuardrails?.(
      Response.json({
        data: {
          revision: 1,
          policy: {
            schema_version: 1,
            name: 'Obsolete Slow Policy',
            models: { mode: 'inherit' },
            providers: { mode: 'inherit' },
          },
        },
      }),
    );
    await Promise.resolve();

    expect(
      peekQuery(
        'niu-browser-member-session',
        '/api/v1/organizations/org-1/projects/ws-alpha/guardrails',
      ),
    ).toBeUndefined();
  });

  it('revalidates active route loader data on mutation invalidation through AppLayout revalidator bridge', async () => {
    let keyVersion = 1;
    let keysEndpointCalls = 0;

    vi.stubGlobal(
      'fetch',
      createBaseFetchMock((url, init) => {
        if (url === '/api/v1/workspaces/ws-alpha/keys' && (!init?.method || init.method === 'GET')) {
          keysEndpointCalls += 1;
          return Response.json({
            data: [
              {
                id: 'key-1',
                slug: 'agent-key',
                name: `Agent Key v${keyVersion}`,
                allowed_models: ['*'],
                expires_at_ms: null,
                last_used_at_ms: null,
                revoked: false,
                expired: false,
              },
            ],
          });
        }
        if (url === '/api/v1/workspaces/ws-alpha/keys/key-1' && init?.method === 'PATCH') {
          keyVersion = 2;
          return Response.json({ ok: true });
        }
        return null;
      }),
    );

    const router = createDashboardMemoryRouter(['/workspaces/alpha'], buildAppRoutes());
    render(<RouterProvider router={router} />);
    await screen.findByRole('heading', { name: 'Overview' }, { timeout: 5000 });

    await act(async () => {
      await router.navigate('/workspaces/alpha/keys');
    });
    expect(await screen.findByText('Agent Key v1')).toBeTruthy();
    const callsBeforeMutation = keysEndpointCalls;

    // Perform an API mutation through the shared client -> triggers invalidateForMutation + router revalidation!
    await act(async () => {
      await request('niu-browser-member-session', '/api/v1/workspaces/ws-alpha/keys/key-1', 'PATCH', {
        name: 'Agent Key v2',
      });
    });

    await waitFor(() => expect(keysEndpointCalls).toBeGreaterThan(callsBeforeMutation));
    expect(await screen.findByText('Agent Key v2')).toBeTruthy();
    expect(
      peekQuery<{ data: Array<{ name: string }> }>(
        'niu-browser-member-session',
        '/api/v1/workspaces/ws-alpha/keys',
      )?.data[0]?.name,
    ).toBe('Agent Key v2');
  });

  it('isolates unhandled route loader/render errors inside the outlet AppError boundary while preserving AppLayout navigation for recovery', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', createBaseFetchMock());

    const routesWithBrokenChild: RouteObject[] = [
      {
        path: '/',
        element: <AppLayout />,
        errorElement: <AppError />,
        children: [
          {
            errorElement: <AppError />,
            children: [
              {
                path: 'workspaces/:workspace',
                element: <div data-testid="healthy-overview">Healthy Overview</div>,
              },
              {
                path: 'workspaces/:workspace/broken',
                loader: () => {
                  throw new Error('Synthetic route loader failure');
                },
                element: <div>Unreachable</div>,
              },
            ],
          },
        ],
      },
    ];

    const router = createDashboardMemoryRouter(['/workspaces/alpha'], routesWithBrokenChild);
    render(<RouterProvider router={router} />);
    await screen.findByTestId('healthy-overview');

    // Navigate to failing route -> outlet boundary catches error while AppLayout rail/sidebar stay alive!
    await act(async () => {
      await router.navigate('/workspaces/alpha/broken');
    });

    expect(await screen.findByRole('heading', { name: 'Application error' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Product navigation' })).toBeTruthy();

    // Recover zero-refresh by navigating back to a healthy sibling route without full document reload
    await act(async () => {
      await router.navigate('/workspaces/alpha');
    });

    expect(await screen.findByTestId('healthy-overview')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Application error' })).toBeNull();
    consoleSpy.mockRestore();
  });

  it('preserves ErrorBoundary, HydrateFallback, clientAction/action, and handle in bindLazy and rejects dual loader + clientLoader (niu-wnr.6, niu-wnr.8)', async () => {
    const DummyComponent = () => null;
    const DummyBoundary = () => null;
    const DummyHydrate = () => null;
    const dummyClientAction = async () => null;

    const bound = bindLazy(
      async () => ({
        default: DummyComponent,
        ErrorBoundary: DummyBoundary,
        HydrateFallback: DummyHydrate,
        clientAction: dummyClientAction,
        handle: { section: 'custom' },
      }),
      { destination: 'Workspace', navTo: 'routing' },
    );

    const resolved = await bound();
    expect(resolved.Component).toBe(DummyComponent);
    expect(resolved.ErrorBoundary).toBe(DummyBoundary);
    expect(resolved.HydrateFallback).toBe(DummyHydrate);
    expect(resolved.clientAction).toBe(dummyClientAction);
    // Data Mode has no server action; bindLazy must expose clientAction to the
    // action slot so fetcher submissions work outside framework mode.
    expect(resolved.action).toBe(dummyClientAction);
    expect(resolved.handle).toEqual({
      destination: 'Workspace',
      navTo: 'routing',
      section: 'custom',
    });

    const invalidBound = bindLazy(async () => ({
      default: DummyComponent,
      loader: async () => null,
      clientLoader: async () => null,
    }));
    await expect(invalidBound()).rejects.toThrow(/both loader and clientLoader/i);
  });

  it('supports concurrent parent and child route loaders on the same navigation without aborting each other (niu-wnr.11)', async () => {
    let parentAborted = false;
    let childAborted = false;

    vi.stubGlobal(
      'fetch',
      createBaseFetchMock((url, init) => {
        if (url === '/api/v1/workspaces/ws-alpha/parent-resource') {
          init?.signal?.addEventListener('abort', () => {
            parentAborted = true;
          });
          return Response.json({ data: [{ id: 'parent-ok' }] });
        }
        if (url === '/api/v1/workspaces/ws-alpha/child-resource') {
          init?.signal?.addEventListener('abort', () => {
            childAborted = true;
          });
          return Response.json({ data: [{ id: 'child-ok' }] });
        }
        return null;
      }),
    );

    const concurrentRoutes: RouteObject[] = [
      {
        path: '/',
        element: <AppLayout />,
        children: [
          {
            path: 'workspaces/:workspace/parent',
            loader: args =>
              loadCriticalRouteEndpoint(args, ({ workspace }) =>
                workspace ? `/api/v1/workspaces/${workspace.id}/parent-resource` : null,
              ),
            children: [
              {
                path: 'child',
                loader: args =>
                  loadCriticalRouteEndpoint(args, ({ workspace }) =>
                    workspace ? `/api/v1/workspaces/${workspace.id}/child-resource` : null,
                  ),
                element: <div data-testid="concurrent-child">Concurrent Child Ready</div>,
              },
            ],
          },
          {
            path: 'workspaces/:workspace',
            element: <div data-testid="ws-root">Root Ready</div>,
          },
        ],
      },
    ];

    const router = createDashboardMemoryRouter(['/workspaces/alpha'], concurrentRoutes);
    render(<RouterProvider router={router} />);
    await screen.findByTestId('ws-root');

    await act(async () => {
      await router.navigate('/workspaces/alpha/parent/child');
    });

    await screen.findByTestId('concurrent-child');
    expect(parentAborted).toBe(false);
    expect(childAborted).toBe(false);
  });

  it('executes loader redirect() on legacy routes preserving search and hash (niu-wnr.10)', async () => {
    vi.stubGlobal('fetch', createBaseFetchMock());
    const router = createDashboardMemoryRouter(
      ['/workspaces/alpha/costs?period=30d#breakdown'],
      buildAppRoutes(),
    );
    render(<RouterProvider router={router} />);
    await waitFor(() => expect(router.state.location.pathname).toBe('/workspaces/alpha/billing'));
    expect(router.state.location.search).toBe('?period=30d');
    expect(router.state.location.hash).toBe('#breakdown');
  });
});
