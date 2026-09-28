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
  it('opens the workspace when the console root is requested', async () => {
    mockHealth();
    const router = renderAt('/');

    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/workspaces/default/');
  });

  it('shows a branded recovery page for an unknown console URL', async () => {
    renderAt('/not-a-console-route');

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open workspace' })).toBeTruthy();
    expect(screen.queryByText('Unexpected Application Error!')).toBeNull();
  });

  it('blocks unavailable gateway content and recovers on retry', async () => {
    const user = userEvent.setup();
    let online = false;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({status: online ? 'ok' : 'down'}), {status: online ? 200 : 503})));
    renderAt('/workspaces/default/models');
    expect(await screen.findByRole('heading', {name: 'Restore your gateway connection'})).toBeTruthy();
    expect(screen.queryByRole('heading', {name: 'Models'})).toBeNull();
    online = true;
    await user.click(screen.getByRole('button', {name: 'Retry connection'}));
    expect(await screen.findByText('Administrator access required')).toBeTruthy();
    await waitFor(() => expect(within(screen.getByLabelText('Breadcrumb')).getByText('Models')).toBeTruthy());
    expect(screen.queryByText('Gateway online')).toBeNull();
  });
  it('explains a workspace API version mismatch and retries the real request', async () => {
    const user = userEvent.setup();
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      calls.push(path);
      if (path === '/healthz') return new Response(JSON.stringify({ status: 'ok' }));
      if (path === '/admin/v1/session') return new Response(JSON.stringify({ data: { kind: 'installation', operator: null, permissions: { read: true, write: true, manage_operators: true } } }));
      if (path === '/admin/v1/models') return new Response(JSON.stringify({ data: [] }));
      if (path === '/admin/v1/organizations') return new Response(JSON.stringify({ data: [] }));
      if (path === '/admin/v1/workspaces') return new Response(JSON.stringify({ error: { message: 'Not found' } }), { status: 404 });
      throw new Error(`Unexpected request: ${path}`);
    }));
    renderAt('/workspaces/default/');
    await user.type(await screen.findByLabelText('Installation admin token'), 'admin-token');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'This console and gateway are out of sync' })).toBeTruthy();
    expect(screen.getByText('GET /admin/v1/workspaces')).toBeTruthy();
    expect(screen.getByText('HTTP 404')).toBeTruthy();
    const callsBeforeRetry = calls.filter(path => path === '/admin/v1/workspaces').length;
    await user.click(screen.getByRole('button', { name: 'Retry workspace access' }));
    await waitFor(() => expect(calls.filter(path => path === '/admin/v1/workspaces').length).toBe(callsBeforeRetry + 1));
  });
  it('renders the workspace overview and connects the sidebar to real routes', async () => {
    mockHealth();
    const user = userEvent.setup();
    const router = renderAt('/workspaces/default/');

    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeTruthy();
    expect(screen.getAllByRole('link', { name: /Explore models/ }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Connect a provider' })).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Gateway workflow' })).toBeTruthy();
    expect(screen.getByLabelText('Installation admin token')).toBeTruthy();
    expect(screen.queryByText('Requests today')).toBeNull();

    await user.click(screen.getByRole('link', { name: 'Usage', exact: true }));
    expect(await screen.findByText('Administrator access required')).toBeTruthy();
    await waitFor(() => expect(within(screen.getByLabelText('Breadcrumb')).getByText('Usage')).toBeTruthy());
    expect(screen.getByRole('link', { name: 'Usage' }).getAttribute('aria-current')).toBe('page');
    expect(router.state.location.pathname).toBe('/workspaces/default/usage');
  });

  it('closes the expanded workspace navigation when resizing into the compact layout', async () => {
    const originalWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
    mockHealth();
    renderAt('/workspaces/default/');

    try {
      expect(await screen.findByRole('heading', { name: 'Overview' })).toBeTruthy();
      expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeTruthy();
      screen.getByRole('link', { name: 'Overview', exact: true }).focus();

      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
      window.dispatchEvent(new Event('resize'));

      await waitFor(() => expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull());
      const toggle = screen.getByRole('button', { name: 'Expand workspace navigation' });
      expect(toggle).toBeTruthy();
      expect(document.activeElement).toBe(toggle);
    } finally {
      if (originalWidth) Object.defineProperty(window, 'innerWidth', originalWidth);
    }
  });

  it('separates global destinations from workspace navigation', async () => {
    mockHealth();
    const user = userEvent.setup();
    const router = renderAt('/workspaces/default/');
    await screen.findByRole('heading', { name: 'Overview' });
    const rail = within(screen.getByRole('navigation', { name: 'Product navigation' }));
    const sidebar = within(screen.getByRole('navigation', { name: 'Main navigation' }));
    expect(screen.getByRole('banner')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Switch workspace' })).toBeTruthy();
    expect(sidebar.getByRole('link', { name: 'Usage' })).toBeTruthy();
    expect(sidebar.queryByRole('link', { name: 'Agent Connect' })).toBeNull();
    expect(sidebar.queryByRole('link', { name: 'Benchmarks' })).toBeNull();
    expect(rail.queryByRole('link', { name: 'Platform settings' })).toBeNull();
    expect(rail.getByRole('link', { name: 'Workspace' }).className).toContain('selected');
    await user.click(screen.getByRole('button', { name: 'Collapse workspace navigation' }));
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull();
    expect(rail.getByRole('link', { name: 'Workspace' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/workspaces/default/');
    await user.click(screen.getByRole('button', { name: 'Expand workspace navigation' }));
    expect(await screen.findByRole('navigation', { name: 'Main navigation' })).toBeTruthy();

    await user.click(rail.getByRole('link', { name: 'Models', exact: true }));
    expect(await screen.findByText('Administrator access required')).toBeTruthy();
    await waitFor(() => expect(within(screen.getByLabelText('Breadcrumb')).getByText('Models')).toBeTruthy());
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(screen.getByRole('banner')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /workspace navigation/ })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Model views' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Configured models' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Usage' })).toBeNull();
    expect(rail.getByRole('link', { name: 'Models', exact: true }).className).toContain('selected');
    expect(rail.getByRole('link', { name: 'Workspace' }).className).not.toContain('selected');

    await user.click(rail.getByRole('link', { name: 'Chat · compare model responses' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/chat'));
    expect(rail.getByRole('link', { name: 'Chat · compare model responses' }).className).toContain('selected');
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Model views' })).toBeNull();
    await user.click(rail.getByRole('link', { name: 'Workspace' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/workspaces/default'));
    expect(rail.getByRole('link', { name: 'Workspace' }).className).toContain('selected');
    expect(within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('link', { name: 'Overview' })).toBeTruthy();
  });

  it('opens account actions and a keyboard-dismissable connection dialog', async () => {
    mockHealth();
    const user = userEvent.setup();
    renderAt('/workspaces/default/benchmarks');
    expect(await screen.findByText('Administrator access required')).toBeTruthy();
    const trigger = screen.getByRole('button', { name: 'Account menu' });
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('menuitem', { name: 'Usage' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Administration' })).toBeNull();
    await user.click(screen.getByRole('menuitem', { name: 'Administrator sign-in' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('loads a feature route directly and shows a route-specific connection state', async () => {
    mockHealth();
    renderAt('/workspaces/production/usage');

    expect(await screen.findByText('Administrator access required')).toBeTruthy();
    expect(screen.getByText('Administrator access required')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Usage' }).getAttribute('aria-current')).toBe('page');
  });

  it('keeps coding-agent setup out of the platform release routes', async () => {
    mockHealth();
    renderAt('/workspaces/default/agent-connect');

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Agent Connect' })).toBeNull();
  });

  it.each(['project-2', 'default', 'missing'])('preserves deep links while resolving workspace %s', async workspaceId => {
    const calls: string[] = [];
    const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    let finishLoading!: (response: Response) => void;
    const workspaceResponse = new Promise<Response>(resolve => { finishLoading = resolve; });
    localStorage.setItem('niu.active-workspace', 'project-2');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      calls.push(path);
      if (path === '/healthz') return json({ status: 'ok' });
      if (path === '/admin/v1/session') return json({ data: { kind: 'installation', operator: null, permissions: { read: true, write: true, manage_operators: true } } });
      if (path === '/admin/v1/models') return json({ data: [{ id: 'fast', public_catalog: false }] });
      if (path === '/admin/v1/organizations') return json({ data: [{ id: 'org-1', name: 'Acme' }] });
      if (path === '/admin/v1/workspaces') return workspaceResponse;
      if (path.endsWith('/keys')) return json({ data: [] });
      throw new Error(`Unexpected request: ${path}`);
    }));
    const user = userEvent.setup();
    const originalPath = `/workspaces/${workspaceId}/keys`;
    const router = renderAt(`${originalPath}?tab=active#list`);
    await user.type(await screen.findByLabelText('Installation admin token'), 'admin-token');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(calls).toContain('/admin/v1/workspaces'));
    expect(router.state.location.pathname).toBe(originalPath);
    expect(calls.filter(path => path.endsWith('/keys'))).toEqual([]);

    finishLoading(json({ data: [
      { id: 'project-1', name: 'First project', organization_id: 'org-1', organization_name: 'Acme' },
      { id: 'project-2', name: 'Second project', organization_id: 'org-1', organization_name: 'Acme' },
    ] }));
    if (workspaceId === 'missing') {
      expect(await screen.findByRole('heading', { name: 'This workspace link can’t be opened' })).toBeTruthy();
      expect(router.state.location.pathname).toBe(originalPath);
      expect(calls.filter(path => path.endsWith('/keys'))).toEqual([]);
    } else {
      expect(await screen.findByRole('heading', { name: 'API keys' })).toBeTruthy();
      expect(router.state.location.pathname).toBe('/workspaces/second-project/keys');
      await waitFor(() => expect(calls.filter(path => path.endsWith('/keys'))).toContain('/admin/v1/organizations/org-1/projects/project-2/keys'));
    }
    expect(router.state.location.search).toBe('?tab=active');
    expect(router.state.location.hash).toBe('#list');
    localStorage.removeItem('niu.active-workspace');
  });

  it('keeps the current page and URL state when switching workspaces', async () => {
    const calls: string[] = [];
    const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      calls.push(path);
      if (path === '/healthz') return json({ status: 'ok' });
      if (path === '/admin/v1/session') return json({ data: { kind: 'installation', operator: null, permissions: { read: true, write: true, manage_operators: true } } });
      if (path === '/admin/v1/models') return json({ data: [{ id: 'fast', public_catalog: false }] });
      if (path === '/admin/v1/organizations') return json({ data: [{ id: 'org-1', name: 'Acme' }] });
      if (path === '/admin/v1/workspaces') return json({ data: [
        { id: 'project-1', name: 'First project', organization_id: 'org-1', organization_name: 'Acme' },
        { id: 'project-2', name: 'Second project', organization_id: 'org-1', organization_name: 'Acme' },
      ] });
      if (path.endsWith('/keys')) return json({ data: [] });
      throw new Error(`Unexpected request: ${path}`);
    }));
    const user = userEvent.setup();
    const router = renderAt('/workspaces/project-1/keys?tab=active#list');
    await user.type(await screen.findByLabelText('Installation admin token'), 'admin-token');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('heading', { name: 'API keys' });

    await user.click(screen.getByRole('button', { name: 'Switch workspace' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Second project' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/workspaces/second-project/keys'));
    expect(router.state.location.search).toBe('?tab=active');
    expect(router.state.location.hash).toBe('#list');
    expect(within(screen.getByRole('button', { name: 'Switch workspace' })).getByText('Second project')).toBeTruthy();
    expect([...new Set(calls.filter(path => path.endsWith('/keys')))]).toEqual([
      '/admin/v1/organizations/org-1/projects/project-1/keys',
      '/admin/v1/organizations/org-1/projects/project-2/keys',
    ]);
  });

  it('opens and dismisses the workspace switcher from the keyboard', async () => {
    const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === '/healthz') return json({ status: 'ok' });
      if (path === '/admin/v1/session') return json({ data: { kind: 'installation', operator: null, permissions: { read: true, write: true, manage_operators: true } } });
      if (path === '/admin/v1/models') return json({ data: [{ id: 'fast', public_catalog: false }] });
      if (path === '/admin/v1/organizations') return json({ data: [{ id: 'org-1', name: 'Acme' }] });
      if (path === '/admin/v1/workspaces') return json({ data: [
        { id: 'project-1', name: 'First project', organization_id: 'org-1', organization_name: 'Acme' },
        { id: 'project-2', name: 'Second project', organization_id: 'org-1', organization_name: 'Acme' },
      ] });
      if (path.endsWith('/keys')) return json({ data: [] });
      throw new Error(`Unexpected request: ${path}`);
    }));
    const user = userEvent.setup();
    renderAt('/workspaces/project-1/keys');
    await user.type(await screen.findByLabelText('Installation admin token'), 'admin-token');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('heading', { name: 'API keys' });

    const trigger = screen.getByRole('button', { name: 'Switch workspace' });
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('menuitemradio', { name: 'First project' })).toBeTruthy();
    expect(screen.getByRole('menuitemradio', { name: 'Second project' })).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menuitemradio', { name: 'First project' })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('does not show a delayed key response from the workspace it just left', async () => {
    const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    let finishFirstKeys!: (response: Response) => void;
    let firstKeyRequestSignal: AbortSignal | null = null;
    const firstKeys = new Promise<Response>(resolve => { finishFirstKeys = resolve; });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === '/healthz') return json({ status: 'ok' });
      if (path === '/admin/v1/session') return json({ data: { kind: 'installation', operator: null, permissions: { read: true, write: true, manage_operators: true } } });
      if (path === '/admin/v1/models') return json({ data: [{ id: 'fast', public_catalog: false }] });
      if (path === '/admin/v1/organizations') return json({ data: [{ id: 'org-1', name: 'Acme' }] });
      if (path === '/admin/v1/workspaces') return json({ data: [
        { id: 'project-1', name: 'First project', organization_id: 'org-1', organization_name: 'Acme' },
        { id: 'project-2', name: 'Second project', organization_id: 'org-1', organization_name: 'Acme' },
      ] });
      if (path === '/admin/v1/organizations/org-1/projects/project-1/keys') { firstKeyRequestSignal = init?.signal as AbortSignal; return firstKeys; }
      if (path === '/admin/v1/organizations/org-1/projects/project-2/keys') return json({ data: [
        { id: 'second-key', name: 'Second workspace key', allowed_models: ['fast'], expires_at_ms: 2_000_000_000_000, revoked: false, expired: false },
      ] });
      throw new Error(`Unexpected request: ${path}`);
    }));

    const user = userEvent.setup();
    renderAt('/workspaces/project-1/keys');
    await user.type(await screen.findByLabelText('Installation admin token'), 'admin-token');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(firstKeyRequestSignal).not.toBeNull());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Switch workspace' })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Switch workspace' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Second project' }));

    expect(await screen.findByText('Second workspace key')).toBeTruthy();
    expect(firstKeyRequestSignal?.aborted).toBe(true);
    finishFirstKeys(json({ data: [
      { id: 'first-key', name: 'Stale first workspace key', allowed_models: ['fast'], expires_at_ms: 2_000_000_000_000, revoked: false, expired: false },
    ] }));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(screen.queryByText('Stale first workspace key')).toBeNull();
    expect(screen.getByText('Second workspace key')).toBeTruthy();
  });

  it('creates a workspace from the switcher and keeps the current page', async () => {
    const calls: Array<{ path: string; method: string; body?: string }> = [];
    const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ path, method, body: typeof init?.body === 'string' ? init.body : undefined });
      if (path === '/healthz') return json({ status: 'ok' });
      if (path === '/admin/v1/session') return json({ data: { kind: 'installation', operator: null, permissions: { read: true, write: true, manage_operators: true } } });
      if (path === '/admin/v1/models') return json({ data: [{ id: 'fast', public_catalog: false }] });
      if (path === '/admin/v1/organizations') return json({ data: [{ id: 'org-1', name: 'Acme' }] });
      if (path === '/admin/v1/workspaces' && method === 'GET') return json({ data: [
        { id: 'project-1', name: 'First project', organization_id: 'org-1', organization_name: 'Acme' },
      ] });
      if (path === '/admin/v1/workspaces' && method === 'POST') return json({
        id: 'project-2', name: 'Research project', organization_id: 'org-1', organization_name: 'Acme',
      });
      if (path.endsWith('/keys')) return json({ data: [] });
      throw new Error(`Unexpected request: ${method} ${path}`);
    }));

    const user = userEvent.setup();
    const router = renderAt('/workspaces/project-1/keys?tab=active#list');
    await user.type(await screen.findByLabelText('Installation admin token'), 'admin-token');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('heading', { name: 'API keys' });

    await user.click(screen.getByRole('button', { name: 'Switch workspace' }));
    await user.click(screen.getByRole('menuitem', { name: 'Create workspace' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create a workspace' });
    await user.type(within(dialog).getByLabelText('Workspace name'), 'Research project');
    await user.click(within(dialog).getByRole('button', { name: 'Create workspace' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/workspaces/research-project/keys'));
    expect(router.state.location.search).toBe('?tab=active');
    expect(router.state.location.hash).toBe('#list');
    await waitFor(() => expect(within(screen.getByRole('button', { name: 'Switch workspace' })).getByText('Research project')).toBeTruthy());
    expect(calls.find(call => call.path === '/admin/v1/workspaces' && call.method === 'POST')?.body).toBe(JSON.stringify({ name: 'Research project', organization_id: 'org-1' }));
    const keyRequests = calls.filter(call => call.path.endsWith('/keys')).map(call => call.path);
    expect(keyRequests).toContain('/admin/v1/organizations/org-1/projects/project-1/keys');
    expect(keyRequests.at(-1)).toBe('/admin/v1/organizations/org-1/projects/project-2/keys');
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
