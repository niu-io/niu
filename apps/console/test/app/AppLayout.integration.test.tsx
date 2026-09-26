import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { appRoutes } from '../../src/app/routes';

function renderAt(path: string) {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

function mockHealth() {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => ({
    ok: true,
    json: async () => ({ status: 'ok', model_count: 2 }),
  }) as Response));
}

describe('console route layout', () => {
  it('renders the workspace overview and connects the sidebar to real routes', async () => {
    mockHealth();
    const user = userEvent.setup();
    const router = renderAt('/workspaces/default/');

    expect(await screen.findByRole('heading', { name: 'See the work behind agent runs.' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Follow a run from intent to outcome' })).toBeTruthy();
    expect(screen.getByText('Illustrative structure. Imported records keep unknown activity and cost visible instead of filling gaps.')).toBeTruthy();
    expect(await screen.findByText('2')).toBeTruthy();
    expect(screen.getByLabelText('Admin token')).toBeTruthy();
    expect(screen.queryByText('Requests today')).toBeNull();

    await user.click(screen.getByRole('link', { name: /Open executions/ }));
    expect(await screen.findByRole('heading', { name: 'Executions' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Executions' }).getAttribute('aria-current')).toBe('page');
    expect(router.state.location.pathname).toBe('/workspaces/default/executions');
  });

  it('loads a feature route directly and shows a route-specific connection state', async () => {
    mockHealth();
    renderAt('/workspaces/production/usage');

    expect(await screen.findByRole('heading', { name: 'Usage & cost' })).toBeTruthy();
    expect(screen.getByText('Connect to the gateway admin API')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Usage & cost' }).getAttribute('aria-current')).toBe('page');
  });

  it('verifies session permissions before loading operator administration', async () => {
    const calls: Array<{ path: string; authorization?: string }> = [];
    const json = (body: unknown) => new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const authorization = new Headers(init?.headers).get('authorization') ?? undefined;
      calls.push({ path, authorization });
      if (path === '/healthz') return json({ status: 'ok', model_count: 1 });
      if (path === '/admin/v1/session') return json({ data: {
        kind: 'operator',
        operator: { id: 'owner-1', role: 'owner', organization_id: 'org-1', project_id: null },
        permissions: { read: true, write: true, manage_operators: true },
      } });
      if (path === '/admin/v1/models') return json({ data: [] });
      if (path === '/admin/v1/organizations') return json({ data: [{ id: 'org-1', name: 'Niu Labs' }] });
      if (path === '/admin/v1/operators') return json({ data: [] });
      if (path === '/admin/v1/organizations/org-1/projects') return json({ data: [] });
      return json({ data: [] });
    }));

    const user = userEvent.setup();
    renderAt('/workspaces/default/operators');
    await user.type(await screen.findByLabelText('Admin token'), 'owner-session-token');
    await user.click(screen.getByRole('button', { name: 'Connect' }));

    expect(await screen.findByRole('heading', { name: 'Directory' })).toBeTruthy();
    expect(calls[0]).toEqual({ path: '/healthz', authorization: undefined });
    expect(calls.find(call => call.path === '/admin/v1/session')).toEqual({
      path: '/admin/v1/session',
      authorization: 'Bearer owner-session-token',
    });
    expect(calls.some(call => call.path === '/admin/v1/operators')).toBe(true);
    expect(screen.getByText('Organization owner')).toBeTruthy();
  });

  it('disconnects the console after revoking its active operator session', async () => {
    let currentSessionRevoked = false;
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === '/healthz') return json({ status: 'ok', model_count: 1 });
      if (path === '/admin/v1/session') {
        return currentSessionRevoked
          ? json({ error: { message: 'Unauthorized' } }, 401)
          : json({ data: {
            kind: 'operator',
            operator: { id: 'owner-1', role: 'owner', organization_id: 'org-1', project_id: null },
            permissions: { read: true, write: true, manage_operators: true },
          } });
      }
      if (path === '/admin/v1/models') return json({ data: [] });
      if (path === '/admin/v1/organizations') return json({ data: [{ id: 'org-1', name: 'Niu Labs' }] });
      if (path === '/admin/v1/operators') return json({ data: [{
        id: 'owner-1', name: 'Current owner', role: 'owner', organization_id: 'org-1', project_id: null, revoked: false,
      }] });
      if (path === '/admin/v1/organizations/org-1/projects') return json({ data: [] });
      if (path === '/admin/v1/operators/owner-1/sessions') return json({ data: [{
        id: 'active-session', operator_id: 'owner-1', expires_at_unix: 2_000_000_000, revoked: false,
      }] });
      if (path.includes('/events?')) return currentSessionRevoked
        ? json({ error: { message: 'Unauthorized' } }, 401)
        : json({ data: [], next_cursor: null });
      if (path === '/admin/v1/operators/owner-1/sessions/active-session' && init?.method === 'DELETE') {
        currentSessionRevoked = true;
        return new Response(null, { status: 204 });
      }
      return json({ data: [] });
    }));

    const user = userEvent.setup();
    renderAt('/workspaces/default/operators');
    await user.type(await screen.findByLabelText('Admin token'), 'owner-session-token');
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await user.click(await screen.findByRole('button', { name: /Current owner/ }));
    await user.click(await screen.findByRole('button', { name: 'Revoke' }));
    await user.click(await screen.findByRole('button', { name: 'Confirm revoke' }));

    expect(await screen.findByText('Connect to the gateway admin API')).toBeTruthy();
    expect((await screen.findByRole('alert')).textContent).toContain('This admin session has expired or been revoked.');
  });

  it('does not start a follow-up auth request when disconnected during workspace refresh', async () => {
    let currentSessionRevoked = false;
    let healthCalls = 0;
    let sessionCalls = 0;
    let resolveRefreshHealth!: (response: Response) => void;
    const delayedHealth = new Promise<Response>(resolve => { resolveRefreshHealth = resolve; });
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === '/healthz') {
        healthCalls += 1;
        return healthCalls === 1 ? json({ status: 'ok', model_count: 1 }) : delayedHealth;
      }
      if (path === '/admin/v1/session') {
        sessionCalls += 1;
        return currentSessionRevoked
          ? json({ error: { message: 'Unauthorized' } }, 401)
          : json({ data: {
            kind: 'operator',
            operator: { id: 'owner-1', role: 'owner', organization_id: 'org-1', project_id: null },
            permissions: { read: true, write: true, manage_operators: true },
          } });
      }
      if (path === '/admin/v1/models') return json({ data: [] });
      if (path === '/admin/v1/organizations') return json({ data: [{ id: 'org-1', name: 'Niu Labs' }] });
      if (path === '/admin/v1/operators') return json({ data: [{
        id: 'owner-1', name: 'Current owner', role: 'owner', organization_id: 'org-1', project_id: null, revoked: false,
      }] });
      if (path === '/admin/v1/organizations/org-1/projects') return json({ data: [] });
      if (path === '/admin/v1/operators/owner-1/sessions') return json({ data: [{
        id: 'active-session', operator_id: 'owner-1', expires_at_unix: 2_000_000_000, revoked: false,
      }] });
      if (path.includes('/events?')) return json({ data: [], next_cursor: null });
      if (path === '/admin/v1/operators/owner-1/sessions/active-session' && init?.method === 'DELETE') {
        currentSessionRevoked = true;
        return new Response(null, { status: 204 });
      }
      return json({ data: [] });
    }));

    const user = userEvent.setup();
    renderAt('/workspaces/default/operators');
    await user.type(await screen.findByLabelText('Admin token'), 'owner-session-token');
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await user.click(await screen.findByRole('button', { name: /Current owner/ }));
    await user.click(await screen.findByRole('button', { name: 'Revoke' }));
    await user.click(await screen.findByRole('button', { name: 'Confirm revoke' }));
    await waitFor(() => expect(healthCalls).toBe(2));

    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
    resolveRefreshHealth(json({ status: 'ok', model_count: 1 }));

    expect(await screen.findByText('Connect to the gateway admin API')).toBeTruthy();
    await waitFor(() => expect(sessionCalls).toBe(1));
    expect(screen.getByRole('button', { name: 'Connect' })).toBeTruthy();
  });

  it('renders an intentional not-found view for unknown paths', async () => {
    mockHealth();
    renderAt('/workspaces/default/not-a-console-route');

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Return to overview' })).toBeTruthy();
  });
});
