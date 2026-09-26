import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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
  it('blocks unavailable gateway content and recovers on retry', async () => {
    const user = userEvent.setup();
    let online = false;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({status: online ? 'ok' : 'down'}), {status: online ? 200 : 503})));
    renderAt('/workspaces/default/models');
    expect(await screen.findByRole('heading', {name: 'Restore your gateway connection'})).toBeTruthy();
    expect(screen.queryByRole('heading', {name: 'Models'})).toBeNull();
    online = true;
    await user.click(screen.getByRole('button', {name: 'Retry connection'}));
    expect(await screen.findByRole('heading', {name: 'Models'})).toBeTruthy();
    expect(screen.queryByText('Gateway online')).toBeNull();
  });
  it('renders the workspace overview and connects the sidebar to real routes', async () => {
    mockHealth();
    const user = userEvent.setup();
    const router = renderAt('/workspaces/default/');

    expect(await screen.findByRole('heading', { name: /Better outcomes/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Compare the outcomes' })).toBeTruthy();
    expect(screen.getByText('Production traces stay out of the report unless you import them. Savings require a measured comparison.')).toBeTruthy();
    expect(await screen.findByText(/2 configured routes/)).toBeTruthy();
    expect(screen.getByLabelText('Installation admin token')).toBeTruthy();
    expect(screen.queryByText('Requests today')).toBeNull();

    await user.click(screen.getByRole('link', { name: /Inspect tasks/ }));
    expect(await screen.findByRole('heading', { name: 'Tasks' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Tasks' }).getAttribute('aria-current')).toBe('page');
    expect(router.state.location.pathname).toBe('/workspaces/default/executions');
  });

  it('separates global destinations from workspace navigation', async () => {
    mockHealth();
    const user = userEvent.setup();
    const router = renderAt('/workspaces/default/');
    await screen.findByRole('heading', { name: /Better outcomes/ });
    const rail = within(screen.getByRole('navigation', { name: 'Product navigation' }));
    let sidebar = within(screen.getByRole('navigation', { name: 'Main navigation' }));
    expect(sidebar.getByRole('link', { name: 'Usage & cost' })).toBeTruthy();
    expect(sidebar.queryByRole('link', { name: 'Benchmarks' })).toBeNull();
    expect(rail.queryByRole('link', { name: 'Platform settings' })).toBeNull();

    await user.click(rail.getByRole('link', { name: 'Models', exact: true }));
    await screen.findByRole('heading', { name: 'Models' });
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Toggle navigation' })).toBeNull();
    sidebar = within(screen.getByRole('navigation', { name: 'Model views' }));
    expect(sidebar.getByRole('link', { name: 'Browse catalog' }).getAttribute('href')).toBe('/models/');
    expect(sidebar.getByRole('link', { name: 'Configured models' })).toBeTruthy();
    expect(sidebar.queryByRole('link', { name: 'Usage & cost' })).toBeNull();
    expect(rail.getByRole('link', { name: 'Models', exact: true }).className).toContain('selected');
    expect(rail.getByRole('link', { name: 'Workspace' }).className).not.toContain('selected');

    await user.click(rail.getByRole('link', { name: 'Benchmarks' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/workspaces/default/benchmarks'));
    expect(rail.getByRole('link', { name: 'Benchmarks' }).className).toContain('selected');
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Model views' })).toBeNull();
    await user.click(rail.getByRole('link', { name: 'Workspace' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/workspaces/default'));
    expect(within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('link', { name: 'Overview' })).toBeTruthy();
  });

  it('opens account actions and a keyboard-dismissable connection dialog', async () => {
    mockHealth();
    const user = userEvent.setup();
    renderAt('/workspaces/default/benchmarks');
    await screen.findByRole('heading', { name: 'Benchmarks' });
    const trigger = screen.getByRole('button', { name: 'Account menu' });
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('menuitem', { name: 'Usage & cost' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Administration' })).toBeNull();
    await user.click(screen.getByRole('menuitem', { name: 'Administrator sign-in' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('loads a feature route directly and shows a route-specific connection state', async () => {
    mockHealth();
    renderAt('/workspaces/production/usage');

    expect(await screen.findByRole('heading', { name: 'Usage & cost' })).toBeTruthy();
    expect(screen.getByText('Administrator access required')).toBeTruthy();
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
    await user.type(await screen.findByLabelText('Installation admin token'), 'owner-session-token');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'Directory' })).toBeTruthy();
    expect(calls[0]).toEqual({ path: '/healthz', authorization: undefined });
    expect(calls.find(call => call.path === '/admin/v1/session')).toEqual({
      path: '/admin/v1/session',
      authorization: 'Bearer owner-session-token',
    });
    expect(calls.some(call => call.path === '/admin/v1/operators')).toBe(true);
    expect(screen.getByText('Organization owner')).toBeTruthy();
  });

  it('clears the operator session after the server revokes it', async () => {
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
    await user.type(await screen.findByLabelText('Installation admin token'), 'owner-session-token');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await user.click(await screen.findByRole('button', { name: /Current owner/ }));
    await user.click(await screen.findByRole('button', { name: 'Revoke' }));
    await user.click(await screen.findByRole('button', { name: 'Confirm revoke' }));

    expect(await screen.findByText('Administrator access required')).toBeTruthy();
    expect((await screen.findByRole('alert')).textContent).toContain('This admin session has expired or been revoked.');
  });

  it('renders an intentional not-found view for unknown paths', async () => {
    mockHealth();
    renderAt('/workspaces/default/not-a-console-route');

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Return to overview' })).toBeTruthy();
  });
});
