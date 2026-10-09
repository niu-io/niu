import { expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { appRoutes } from '../../src/app/routes';

it('shows the seeded default project as a workspace without changing its existing URL', async () => {
  const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
  let signedIn = false;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    
    if (path === '/admin/v1/auth/config') return json({ password_login: true });
    if (path === '/admin/v1/auth/browser/login' && init?.method === 'POST') { signedIn = true; return json({ session: {} }); }
      if (path === '/admin/v1/session' && !signedIn) return Response.json({ error: { message: 'Unauthorized' } }, { status: 401 });
    if (path === '/healthz') return json({ status: 'ok' });
    if (path === '/admin/v1/session') return json({ data: { kind: 'installation', operator: null, permissions: { read: true, write: true, manage_operators: true } } });
    if (path.startsWith('/admin/v1/models')) return json({ data: [] });
    if (path === '/admin/v1/organizations') return json({ data: [{ id: 'org-default', name: 'Personal workspace' }] });
    if (path === '/admin/v1/workspaces') return json({ data: [
      { id: 'workspace-default', name: 'Default project', organization_id: 'org-default', organization_name: 'Personal workspace' },
    ] });
    if (path.endsWith('/keys')) return json({ data: [] });
    throw new Error(`Unexpected request: ${path}`);
  }));

  const router = createMemoryRouter(appRoutes, { initialEntries: ['/workspaces/default-project/keys'] });
  const user = userEvent.setup();
  render(<RouterProvider router={router} />);

  await user.type(await screen.findByLabelText('Email'), 'demo@example.test');
    await user.type(await screen.findByLabelText('Password'), 'fixture-password');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByRole('heading', { name: 'API keys' })).toBeTruthy();
  expect(router.state.location.pathname).toBe('/workspaces/default-project/keys');
  expect(screen.getByRole('button', { name: 'Switch workspace' }).textContent).toContain('Default workspace');

  await user.click(screen.getByRole('button', { name: 'Switch workspace' }));
  expect(await screen.findByRole('menuitemradio', { name: 'Default workspace' })).toBeTruthy();
  await waitFor(() => expect(router.state.location.pathname).toBe('/workspaces/default-project/keys'));
});
