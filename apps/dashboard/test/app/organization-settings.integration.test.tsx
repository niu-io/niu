import { render, screen, waitFor, within, configure } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { appRoutes } from '../../app/routes';

configure({ asyncUtilTimeout: 5000 });

const organization = { id: 'org', slug: 'acme', name: 'Acme' };
const workspaces = [
  { id: 'default', name: 'Default', organization_id: organization.id, organization_name: organization.name },
  { id: 'production', name: 'Production', organization_id: organization.id, organization_name: organization.name },
];
const operators = [
  { id: 'workspace-owner', name: 'Workspace owner', role: 'owner', organization_id: organization.id, project_id: 'production', revoked: false },
  { id: 'organization-owner', name: 'Organization owner', role: 'owner', organization_id: organization.id, project_id: null, revoked: false },
];

function json(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
}

function renderAt(path: string) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const requestPath = String(input);
    if (requestPath === '/api/v1/auth/config') return json({ password_login: true });
    if (requestPath === '/api/v1/session') return json({ data: {
      kind: 'installation',
      operator: null,
      permissions: { read: true, write: true, manage_operators: true },
    } });
    if (requestPath.endsWith('/healthz')) return json({ status: 'ok', model_count: 0 });
    if (requestPath.split('?')[0] === '/api/v1/payments/readiness') return json({ data: { ready: true, reason: null } });
    if (requestPath === '/api/v1/organizations') return json({ data: [organization] });
    if (requestPath === '/api/v1/workspaces') return json({ data: workspaces });
    if (requestPath.split('?')[0] === '/api/v1/operators') return json({ data: operators });
    if (requestPath.endsWith('/projects')) return json({ data: workspaces });
    return json({ data: [] });
  }));
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

describe('canonical organization settings', () => {
  it('renders organization general details and links to the dedicated members and credits sections', async () => {
    const router = renderAt('/settings/organization');

    expect(await screen.findByRole('heading', { name: 'Organization', level: 1 })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'General' })).toBeTruthy();
    expect(screen.getByText('Acme', { exact: true })).toBeTruthy();
    expect(screen.getByText('acme', { exact: true })).toBeTruthy();
    expect(screen.getByLabelText('Update organization name')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Manage members' }).getAttribute('href')).toBe('/settings/members');
    expect(screen.getByRole('link', { name: 'Manage credits' }).getAttribute('href')).toBe('/settings/billing');
    expect(screen.queryByRole('table')).toBeNull();
    expect(router.state.location.pathname).toBe('/settings/organization');
    const settingsNav = screen.getByRole('navigation', { name: 'Settings navigation' });
    expect(within(settingsNav).getByRole('link', { name: 'Organization' }).getAttribute('aria-current')).toBe('page');
  });

  it('redirects the workspace organization page to the canonical Settings destination', async () => {
    const router = renderAt('/workspaces/default/organization?filter=active#members');

    await waitFor(() => expect(router.state.location.pathname).toBe('/settings/organization'));
    expect(new URLSearchParams(router.state.location.search).get('filter')).toBe('active');
    expect(new URLSearchParams(router.state.location.search).get('organization')).toBe('acme');
    expect(router.state.location.hash).toBe('#members');
    expect((router.state.location.state as { settingsReturnTo?: string } | null)?.settingsReturnTo).toBe('/workspaces/default/organization?filter=active#members');
    expect(await screen.findByRole('heading', { name: 'Organization', level: 1 })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'General' })).toBeTruthy();
  });

  it('redirects workspace Users to a workspace-scoped Members section without widening the scope', async () => {
    const router = renderAt('/workspaces/production/users?filter=owner#access');

    await waitFor(() => expect(router.state.location.pathname).toBe('/settings/members'));
    expect(new URLSearchParams(router.state.location.search).get('workspace')).toBe('production');
    expect(new URLSearchParams(router.state.location.search).get('filter')).toBe('owner');
    expect(router.state.location.hash).toBe('#access');
    expect((router.state.location.state as { settingsReturnTo?: string } | null)?.settingsReturnTo).toBe('/workspaces/production/users?filter=owner#access');
    expect(await screen.findByRole('heading', { name: 'Workspace members' })).toBeTruthy();
    expect(screen.getByText('Showing members with access to this workspace.')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Workspace owner', exact: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Organization owner', exact: true })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'View all organization members' }).getAttribute('href')).toBe('/settings/members');
  });

  it('keeps Members organization-wide by default', async () => {
    renderAt('/settings/members');

    expect(await screen.findByRole('heading', { name: 'Members', level: 2, exact: true })).toBeTruthy();
    expect(screen.queryByText('Showing members with access to this workspace.')).toBeNull();
    expect(await screen.findByRole('button', { name: 'Workspace owner', exact: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Organization owner', exact: true })).toBeTruthy();
  });

  it('refuses to widen an unavailable workspace membership scope', async () => {
    renderAt('/settings/members?workspace=missing');

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('This workspace membership scope is unavailable. Choose organization-wide members instead.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'View all organization members' }).getAttribute('href')).toBe('/settings/members');
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Organization owner', exact: true })).toBeNull();
  });
});
