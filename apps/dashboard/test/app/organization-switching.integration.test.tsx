import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { appRoutes } from '../../app/routes';

describe('organization switching', () => {
  it('scopes workspace choices and creation to the organization selected in the account menu', async () => {
    const json = (body: unknown) => new Response(JSON.stringify(body));
    const requests: { path: string; body: unknown }[] = [];
    let signedIn = false;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.split('?')[0] === '/api/v1/payments/readiness') return json({data:{ready:true,reason:null}});
      requests.push({ path, body: init?.body });
      if (path === '/api/v1/auth/config') return json({ password_login: true });
      if (path === '/api/v1/auth/browser/login' && init?.method === 'POST') { signedIn = true; return json({ session: {} }); }
      if (path === '/api/v1/session' && !signedIn) return Response.json({ error: { message: 'Unauthorized' } }, { status: 401 });
      if (path.endsWith('/healthz')) return json({ status: 'ok' });
      if (path === '/api/v1/session') return json({ data: { kind: 'installation', operator: null, permissions: { read: true, write: true, manage_operators: true } } });
      if (path.startsWith('/api/v1/models')) return json({ data: [] });
      if (path === '/api/v1/organizations') return json({ data: [
        { id: 'org-1', name: 'Acme' }, { id: 'org-2', name: 'Research' }, { id: 'org-3', name: 'New organization' },
      ] });
      if (path === '/api/v1/workspaces' && init?.method === 'POST') return json({
        id: 'project-3', name: 'First workspace', organization_id: 'org-3', organization_name: 'New organization',
      });
      if (path === '/api/v1/workspaces') return json({ data: [
        { id: 'project-1', name: 'Shared name', organization_id: 'org-1', organization_name: 'Acme' },
        { id: 'project-2', name: 'Shared name', organization_id: 'org-2', organization_name: 'Research' },
      ] });
      if (path.endsWith('/keys')) return json({ data: [] });
      return json({ data: [] });
    }));
    const user = userEvent.setup();
    const router = createMemoryRouter(appRoutes, { initialEntries: ['/login?returnTo=%2Fworkspaces%2Fproject-2%2Fkeys'] });
    render(<RouterProvider router={router} />);
    await user.type(await screen.findByLabelText('Email'), 'demo@example.test');
    await user.type(await screen.findByLabelText('Password'), 'fixture-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => { expect(router.state.location.pathname).not.toBe('/login'); expect(router.state.navigation.state).toBe('idle'); });
    await screen.findByRole('heading', { name: 'API keys' });
    await waitFor(() => expect(requests.some(item => item.path === '/api/v1/models?organization_id=org-2&project_id=project-2')).toBe(true));
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(screen.getByRole('menuitem', { name: 'Manage organizations' }));
    await screen.findByRole('heading', { name: 'Organization settings' });
    expect(screen.getByText('Research', { exact: true })).toBeTruthy();
    expect(screen.queryByText('Acme', { exact: true })).toBeNull();
    expect(screen.getByRole('link', { name: 'Users for Shared name' }).getAttribute('href')).toBe('/workspaces/shared-name-project2/users');
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
    await waitFor(() => expect(requests.some(item => item.path === '/api/v1/models?organization_id=org-1&project_id=project-1')).toBe(true));
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'New organization' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/workspaces/default/'));
    await waitFor(() => expect(requests.some(item => item.path === '/api/v1/models?organization_id=org-3')).toBe(true));
    await user.click(screen.getByRole('button', { name: 'Switch workspace' }));
    expect(screen.getByText('No workspaces yet.')).toBeTruthy();
    expect(screen.queryByRole('menuitemradio')).toBeNull();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(screen.getByRole('menuitem', { name: 'Manage organizations' }));
    await screen.findByRole('heading', { name: 'Organization settings' });
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create workspace' });
    expect(within(dialog).getByText(/In New organization/)).toBeTruthy();
    await user.type(within(dialog).getByLabelText('Workspace name'), 'First workspace');
    await user.click(within(dialog).getByRole('button', { name: 'Create workspace' }));
    await waitFor(() => expect(requests.some(item => item.body === JSON.stringify({ name: 'First workspace', slug: 'first-workspace', organization_id: 'org-3' }))).toBe(true));
    await waitFor(() => expect(router.state.location.pathname).toBe('/workspaces/first-workspace/organization'));
  });

  it('creates an organization from the account menu, switches operator sessions by slug, renames, claims memberships, and handles revoked access', async () => {
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    const requests: { path: string; method: string; headers: Headers; body: unknown }[] = [];
    let signedIn = false;
    let activeOrgId = 'org-1';
    let revokeOrg2 = false;
    const organizations: Array<{ id: string; slug: string; name: string }> = [
      { id: 'org-1', slug: 'acme', name: 'Acme' },
      { id: 'org-2', slug: 'research-labs', name: 'Research Labs' },
    ];
    const workspaces: Array<{ id: string; slug: string; name: string; organization_id: string; organization_name: string }> = [
      { id: 'project-1', slug: 'acme-core', name: 'Acme Core', organization_id: 'org-1', organization_name: 'Acme' },
      { id: 'project-2', slug: 'lab-notes', name: 'Lab Notes', organization_id: 'org-2', organization_name: 'Research Labs' },
    ];

    const sessionPayload = () => {
      const org = organizations.find(item => item.id === activeOrgId) ?? organizations[0];
      return {
        data: {
          kind: 'operator',
          operating_mode: 'resale',
          operator: {
            id: `op-${org.id}`,
            name: 'Alice Founder',
            role: 'owner',
            organization_id: org.id,
            project_id: null,
          },
          permissions: { read: true, write: true, manage_operators: true },
        },
      };
    };

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      const headers = new Headers(init?.headers);
      if (path.split('?')[0] === '/api/v1/payments/readiness') return json({ data: { ready: true, reason: null } });
      requests.push({ path, method, headers, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (path === '/api/v1/auth/config') return json({ password_login: true });
      if (path === '/api/v1/auth/browser/login' && method === 'POST') {
        signedIn = true;
        return json({ session: sessionPayload().data });
      }
      if (path === '/api/v1/session' && !signedIn) return json({ error: { message: 'Unauthorized' } }, 401);
      if (path.endsWith('/healthz')) return json({ status: 'ok' });
      if (path === '/api/v1/session') return json(sessionPayload());
      if (path === '/api/v1/session/organization' && method === 'PUT') {
        const body = JSON.parse(String(init?.body ?? '{}')) as { organization?: string };
        if (revokeOrg2 && (body.organization === 'research-labs' || body.organization === 'org-2')) {
          return json({ error: { message: 'Organization membership not found' } }, 404);
        }
        const matched = organizations.find(item => item.slug === body.organization || item.id === body.organization);
        if (!matched) return json({ error: { message: 'Not found' } }, 404);
        activeOrgId = matched.id;
        return json(sessionPayload());
      }
      if (path === '/api/v1/session/memberships' && method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}')) as { token?: string };
        if (body.token !== 'niu-invite-partner-token') {
          return json({ error: { message: 'Invalid member access token' } }, 401);
        }
        const partner = { id: 'org-4', slug: 'partner-guild', name: 'Partner Guild' };
        if (!organizations.some(item => item.id === partner.id)) organizations.push(partner);
        activeOrgId = partner.id;
        return json(sessionPayload());
      }
      if (path === '/api/v1/organizations' && method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}')) as { name: string; slug?: string };
        const created = {
          id: 'org-3',
          slug: body.slug || 'studio-alpha',
          name: body.name,
          currency: 'USD',
        };
        if (!organizations.some(item => item.id === created.id)) {
          organizations.push({ id: created.id, slug: created.slug, name: created.name });
        }
        return json(created, 201);
      }
      if (path.startsWith('/api/v1/organizations/') && method === 'PATCH') {
        const orgId = path.split('/').pop()!;
        const body = JSON.parse(String(init?.body ?? '{}')) as { name: string };
        const target = organizations.find(item => item.id === orgId);
        if (!target) return json({ error: { message: 'Not found' } }, 404);
        target.name = body.name;
        for (const ws of workspaces) {
          if (ws.organization_id === orgId) ws.organization_name = body.name;
        }
        return json({ id: target.id, slug: target.slug, name: target.name });
      }
      if (path === '/api/v1/organizations') {
        return json({ data: revokeOrg2 ? organizations.filter(item => item.id !== 'org-2') : organizations });
      }
      if (path === '/api/v1/workspaces') {
        return json({ data: workspaces.filter(item => item.organization_id === activeOrgId) });
      }
      if (path.startsWith('/api/v1/models')) return json({ data: [] });
      if (path.startsWith('/api/v1/operators')) return json({ data: [] });
      if (path.endsWith('/keys')) return json({ data: [] });
      return json({ data: [] });
    }));

    const user = userEvent.setup();
    const router = createMemoryRouter(appRoutes, { initialEntries: ['/login?returnTo=%2Fworkspaces%2Facme-core%2Fkeys'] });
    render(<RouterProvider router={router} />);
    await user.type(await screen.findByLabelText('Email'), 'alice@example.test');
    await user.type(await screen.findByLabelText('Password'), 'fixture-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('heading', { name: 'API keys' });

    // Switch organization via AccountMenu using operator session endpoint + slug
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    expect(screen.getByRole('menuitemradio', { name: 'Acme' }).getAttribute('aria-checked')).toBe('true');
    await user.click(screen.getByRole('menuitemradio', { name: 'Research Labs' }));
    await waitFor(() =>
      expect(requests.some(req => req.path === '/api/v1/session/organization' && req.method === 'PUT' && JSON.stringify(req.body) === JSON.stringify({ organization: 'research-labs' }))).toBe(true),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/workspaces/lab-notes/keys'));

    // Self-service organization creation is available from organization settings.
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    expect(screen.queryByRole('menuitem', { name: 'Create organization' })).toBeNull();
    await user.click(screen.getByRole('menuitem', { name: 'Manage organizations' }));
    await user.click(await screen.findByRole('button', { name: 'Create organization' }));
    const createDialog = await screen.findByRole('dialog', { name: 'Create organization' });
    expect(within(createDialog).getByText(/New organizations start with 0 credits/)).toBeTruthy();
    await user.type(within(createDialog).getByLabelText('Organization name'), 'Studio Alpha');
    expect((within(createDialog).getByLabelText('Slug') as HTMLInputElement).value).toBe('studio-alpha');
    await user.clear(within(createDialog).getByLabelText(/Initial workspace/));
    await user.click(within(createDialog).getByRole('button', { name: 'Create organization' }));

    await waitFor(() => {
      const createReq = requests.find(req => req.path === '/api/v1/organizations' && req.method === 'POST');
      expect(createReq).toBeTruthy();
      expect(createReq?.headers.get('idempotency-key')).toBeTruthy();
      expect(createReq?.body).toEqual({ name: 'Studio Alpha', slug: 'studio-alpha' });
    });
    await screen.findByRole('heading', { name: 'Organization settings' });
    expect(router.state.location.search).toContain('organization=studio-alpha');
    expect(await screen.findByText('Studio Alpha', { exact: true })).toBeTruthy();
    expect(screen.getByText('studio-alpha', { exact: true })).toBeTruthy();

    // Rename the organization in Organization settings
    const renameInput = screen.getByLabelText('Update organization name');
    await user.clear(renameInput);
    await user.type(renameInput, 'Studio Alpha Prime');
    await user.click(screen.getByRole('button', { name: 'Save name' }));
    await screen.findByText('Organization name saved.');
    expect(screen.getByText('Studio Alpha Prime', { exact: true })).toBeTruthy();

    // Claim membership in another organization using an issued access token
    await user.type(screen.getByLabelText('Member access token'), 'niu-invite-partner-token');
    await user.click(screen.getByRole('button', { name: 'Join organization' }));
    await waitFor(() =>
      expect(requests.some(req => req.path === '/api/v1/session/memberships' && req.method === 'POST' && JSON.stringify(req.body) === JSON.stringify({ token: 'niu-invite-partner-token' }))).toBe(true),
    );

    // Simulate revoked access to Research Labs when attempting to switch
    revokeOrg2 = true;
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Research Labs' }));
    await waitFor(() =>
      expect(requests.some(req => req.path === '/api/v1/session/organization' && JSON.stringify(req.body) === JSON.stringify({ organization: 'research-labs' }))).toBe(true),
    );
  });
});
