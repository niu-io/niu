import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { appRoutes } from '../../src/app/routes';

describe('organization switching', () => {
  it('scopes workspace choices and creation to the organization selected in the account menu', async () => {
    const json = (body: unknown) => new Response(JSON.stringify(body));
    const requests: { path: string; body: unknown }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      requests.push({ path, body: init?.body });
      if (path === '/healthz') return json({ status: 'ok' });
      if (path === '/admin/v1/session') return json({ data: { kind: 'installation', operator: null, permissions: { read: true, write: true, manage_operators: true } } });
      if (path === '/admin/v1/models') return json({ data: [] });
      if (path === '/admin/v1/organizations') return json({ data: [
        { id: 'org-1', name: 'Acme' }, { id: 'org-2', name: 'Research' }, { id: 'org-3', name: 'New organization' },
      ] });
      if (path === '/admin/v1/workspaces' && init?.method === 'POST') return json({
        id: 'project-3', name: 'First workspace', organization_id: 'org-3', organization_name: 'New organization',
      });
      if (path === '/admin/v1/workspaces') return json({ data: [
        { id: 'project-1', name: 'Shared name', organization_id: 'org-1', organization_name: 'Acme' },
        { id: 'project-2', name: 'Shared name', organization_id: 'org-2', organization_name: 'Research' },
      ] });
      if (path.endsWith('/keys')) return json({ data: [] });
      return json({ data: [] });
    }));
    const user = userEvent.setup();
    const router = createMemoryRouter(appRoutes, { initialEntries: ['/login'] });
    render(<RouterProvider router={router} />);
    await user.type(await screen.findByLabelText('Administrator token'), 'admin-token');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => { expect(router.state.location.pathname).not.toBe('/login'); expect(router.state.navigation.state).toBe('idle'); });
    await screen.findByRole('button', { name: 'Switch workspace' });
    await act(async () => { await router.navigate('/workspaces/project-2/keys'); });
    await screen.findByRole('heading', { name: 'API keys' });
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(screen.getByRole('menuitem', { name: 'Organization settings' }));
    await screen.findByRole('heading', { name: 'Organization settings' });
    expect(screen.getByText('org-2', { exact: true })).toBeTruthy();
    expect(screen.queryByText('org-1', { exact: true })).toBeNull();
    expect(screen.getByRole('link', { name: 'Manage access' }).getAttribute('href')).toBe('/workspaces/shared-name-project2/operators');
    await user.click(screen.getByRole('link', { name: 'Shared name', exact: true }));
    await screen.findByRole('heading', { name: 'Overview' });
    await user.click(within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('link', { name: 'API keys', exact: true }));
    await screen.findByRole('heading', { name: 'API keys' });
    await user.click(screen.getByRole('button', { name: 'Switch workspace' }));
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(1);
    expect(screen.queryByText('Research', { exact: true })).toBeNull();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    expect(screen.getByRole('menuitemradio', { name: 'Research' }).getAttribute('aria-checked')).toBe('true');
    await user.click(screen.getByRole('menuitemradio', { name: 'Acme' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/workspaces/shared-name-project1/keys'));
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'New organization' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/workspaces/default/'));
    await user.click(screen.getByRole('button', { name: 'Switch workspace' }));
    expect(screen.getByText('No workspaces yet.')).toBeTruthy();
    expect(screen.queryByRole('menuitemradio')).toBeNull();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(screen.getByRole('menuitem', { name: 'Organization settings' }));
    await screen.findByRole('heading', { name: 'Organization settings' });
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create a workspace' });
    expect(within(dialog).getByText('In New organization')).toBeTruthy();
    await user.type(within(dialog).getByLabelText('Workspace name'), 'First workspace');
    await user.click(within(dialog).getByRole('button', { name: 'Create workspace' }));
    await waitFor(() => expect(requests.some(item => item.body === JSON.stringify({ name: 'First workspace', organization_id: 'org-3' }))).toBe(true));
    await waitFor(() => expect(router.state.location.pathname).toBe('/workspaces/first-workspace/organization'));
  });
});
