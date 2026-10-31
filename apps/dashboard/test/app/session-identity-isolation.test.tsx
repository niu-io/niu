import { act, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { peekQuery, primeQuery, syncCacheAuthority } from '../../app/lib/query-cache';
import AppLayout from '../../app/shell/AppLayout';
import { useDashboardContext, type AdminSession } from '../../app/shell/dashboard-context';
import { buildSessionAuthorityKey } from '../../app/shell/router-context';

describe('session identity and effective authority isolation (niu-8hv.1)', () => {
  it('purges prior-user workspaces and reloads authorized workspaces on returning-tab cookie identity change without 1-frame leak', async () => {
    let who = 'alice';
    let workspaceReads = 0;
    const observedSnapshots: string[] = [];

    function IdentityProbe() {
      const c = useDashboardContext();
      const snap = `${c.session?.operator?.id}|${c.workspace?.name ?? ''}|${c.workspaces.map(w => w.name).join(',')}`;
      observedSnapshots.push(snap);
      return <div data-testid="identity-probe">{snap}</div>;
    }

    vi.stubGlobal(
      'fetch',
      vi.fn(async input => {
        const p = String(input);
        if (p === '/api/v1/auth/config') return Response.json({ password_login: true });
        if (p === '/healthz') return Response.json({ status: 'ok', model_count: 0 });
        if (p === '/api/v1/session') {
          return Response.json({
            data: {
              kind: 'operator',
              operator: {
                id: who,
                role: 'viewer',
                organization_id: 'org-' + who,
                project_id: 'ws-' + who,
              },
              permissions: { read: true, write: false, manage_operators: false },
              provider_memberships: [],
            },
          });
        }
        if (p === '/api/v1/workspaces') {
          workspaceReads += 1;
          return Response.json({
            data: [
              {
                id: 'ws-' + who,
                slug: 'space-' + who,
                name: 'Private ' + who,
                organization_id: 'org-' + who,
                organization_name: who,
              },
            ],
          });
        }
        if (p === '/api/v1/organizations') {
          return Response.json({ data: [{ id: 'org-' + who, name: who }] });
        }
        if (p.startsWith('/api/v1/payments/readiness')) {
          return Response.json({ data: { ready: true, reason: null } });
        }
        return Response.json({ data: [] });
      }),
    );

    const router = createMemoryRouter(
      [
        {
          element: <AppLayout />,
          children: [{ path: 'workspaces/:workspace', element: <IdentityProbe /> }],
        },
      ],
      { initialEntries: ['/workspaces/default'] },
    );

    render(<RouterProvider router={router} />);
    await waitFor(() =>
      expect(screen.getByTestId('identity-probe').textContent).toBe('alice|Private alice|Private alice'),
    );
    expect(router.state.location.pathname).toBe('/workspaces/space-alice');
    expect(workspaceReads).toBe(1);

    // Cookie principal changes from Alice to Bob in another tab; returning tab fires focus:
    who = 'bob';
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    await waitFor(() =>
      expect(screen.getByTestId('identity-probe').textContent).toBe('bob|Private bob|Private bob'),
    );

    expect(workspaceReads).toBe(2);
    expect(router.state.location.pathname).toBe('/workspaces/space-bob');
    // Verify Bob NEVER saw Alice's private workspace on ANY intermediate render frame!
    const bobFrames = observedSnapshots.filter(entry => entry.startsWith('bob|'));
    expect(bobFrames.length).toBeGreaterThan(0);
    for (const frame of bobFrames) {
      expect(frame).not.toContain('Private alice');
      expect(frame).not.toContain('alice');
    }
  });

  it('reloads authorized workspace scope and invalidates cached views when effective permissions are reduced for the same operator', async () => {
    let role: 'owner' | 'viewer' = 'owner';
    let writePerm = true;
    let allowedWorkspaces = [
      {
        id: 'ws-team',
        slug: 'team-prod',
        name: 'Team Production',
        organization_id: 'org-acme',
        organization_name: 'Acme',
      },
      {
        id: 'ws-sandbox',
        slug: 'dev-sandbox',
        name: 'Dev Sandbox',
        organization_id: 'org-acme',
        organization_name: 'Acme',
      },
    ];
    let workspaceFetches = 0;
    const renderedFrames: string[] = [];

    function AuthorityProbe() {
      const c = useDashboardContext();
      const snap = `${c.session?.operator?.role}:${c.session?.permissions.write}|${c.workspaces.map(w => w.slug).join(',')}`;
      renderedFrames.push(snap);
      return <div data-testid="authority-probe">{snap}</div>;
    }

    vi.stubGlobal(
      'fetch',
      vi.fn(async input => {
        const p = String(input);
        if (p === '/api/v1/auth/config') return Response.json({ password_login: true });
        if (p === '/healthz') return Response.json({ status: 'ok', model_count: 1 });
        if (p === '/api/v1/session') {
          return Response.json({
            data: {
              kind: 'operator',
              operator: {
                id: 'alice',
                role,
                organization_id: 'org-acme',
                project_id: role === 'viewer' ? 'ws-sandbox' : null,
              },
              permissions: { read: true, write: writePerm, manage_operators: role === 'owner' },
              provider_memberships: [],
            },
          });
        }
        if (p === '/api/v1/workspaces') {
          workspaceFetches += 1;
          return Response.json({ data: allowedWorkspaces });
        }
        if (p === '/api/v1/organizations') {
          return Response.json({ data: [{ id: 'org-acme', name: 'Acme' }] });
        }
        if (p.startsWith('/api/v1/payments/readiness')) {
          return Response.json({ data: { ready: true, reason: null } });
        }
        return Response.json({ data: [] });
      }),
    );

    const router = createMemoryRouter(
      [
        {
          element: <AppLayout />,
          children: [{ path: 'workspaces/:workspace', element: <AuthorityProbe /> }],
        },
      ],
      { initialEntries: ['/workspaces/dev-sandbox'] },
    );

    render(<RouterProvider router={router} />);
    await waitFor(() =>
      expect(screen.getByTestId('authority-probe').textContent).toBe('owner:true|team-prod,dev-sandbox'),
    );
    expect(workspaceFetches).toBe(1);

    // Seed a workspace-scoped cached resource under Alice's owner authority
    primeQuery('niu-browser-member-session', '/api/v1/organizations/org-acme/projects/ws-team/keys', {
      data: [{ id: 'secret-owner-key' }],
    });
    expect(
      peekQuery('niu-browser-member-session', '/api/v1/organizations/org-acme/projects/ws-team/keys'),
    ).toBeDefined();

    // Admin downgrades Alice to viewer restricted to dev-sandbox only:
    role = 'viewer';
    writePerm = false;
    allowedWorkspaces = [
      {
        id: 'ws-sandbox',
        slug: 'dev-sandbox',
        name: 'Dev Sandbox',
        organization_id: 'org-acme',
        organization_name: 'Acme',
      },
    ];

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    await waitFor(() =>
      expect(screen.getByTestId('authority-probe').textContent).toBe('viewer:false|dev-sandbox'),
    );
    expect(workspaceFetches).toBe(2);
    expect(
      peekQuery('niu-browser-member-session', '/api/v1/organizations/org-acme/projects/ws-team/keys'),
    ).toBeUndefined();

    // Reduced viewer authority must NEVER render with the stale owner workspace list
    const viewerFrames = renderedFrames.filter(f => f.startsWith('viewer:'));
    for (const frame of viewerFrames) {
      expect(frame).not.toContain('team-prod');
    }
  });

  it('rejects and purges restored persistent sessionStorage snapshots from a previous user on cold boot', async () => {
    const aliceSession: AdminSession = {
      kind: 'operator',
      operator: { id: 'alice', role: 'owner', organization_id: 'org-alice', project_id: null },
      permissions: { read: true, write: true, manage_operators: true },
      provider_memberships: [],
    };
    const aliceAuthority = buildSessionAuthorityKey('niu-browser-member-session', aliceSession);

    // Pre-populate sessionStorage with Alice's persisted workspace and org snapshots as if left from an earlier session
    syncCacheAuthority(aliceAuthority);
    primeQuery(
      'niu-browser-member-session',
      '/api/v1/workspaces',
      {
        data: [
          {
            id: 'ws-alice',
            slug: 'space-alice',
            name: 'Persisted Private Alice',
            organization_id: 'org-alice',
            organization_name: 'Alice Org',
          },
        ],
      },
      { persist: true },
    );
    primeQuery(
      'niu-browser-member-session',
      '/api/v1/organizations',
      { data: [{ id: 'org-alice', name: 'Alice Org' }] },
      { persist: true },
    );

    const renderedWorkspaces: string[] = [];
    function ColdBootProbe() {
      const c = useDashboardContext();
      const snap = `${c.session?.operator?.id}|${c.workspaces.map(w => w.name).join(',')}`;
      renderedWorkspaces.push(snap);
      return <div data-testid="cold-boot-probe">{snap}</div>;
    }

    // Browser cookie now authenticates Bob on cold boot:
    vi.stubGlobal(
      'fetch',
      vi.fn(async input => {
        const p = String(input);
        if (p === '/api/v1/auth/config') return Response.json({ password_login: true });
        if (p === '/healthz') return Response.json({ status: 'ok', model_count: 0 });
        if (p === '/api/v1/session') {
          return Response.json({
            data: {
              kind: 'operator',
              operator: { id: 'bob', role: 'viewer', organization_id: 'org-bob', project_id: 'ws-bob' },
              permissions: { read: true, write: false, manage_operators: false },
              provider_memberships: [],
            },
          });
        }
        if (p === '/api/v1/workspaces') {
          return Response.json({
            data: [
              {
                id: 'ws-bob',
                slug: 'space-bob',
                name: 'Fresh Bob Workspace',
                organization_id: 'org-bob',
                organization_name: 'Bob Org',
              },
            ],
          });
        }
        if (p === '/api/v1/organizations') {
          return Response.json({ data: [{ id: 'org-bob', name: 'Bob Org' }] });
        }
        if (p.startsWith('/api/v1/payments/readiness')) {
          return Response.json({ data: { ready: true, reason: null } });
        }
        return Response.json({ data: [] });
      }),
    );

    const router = createMemoryRouter(
      [
        {
          element: <AppLayout />,
          children: [{ path: 'workspaces/:workspace', element: <ColdBootProbe /> }],
        },
      ],
      { initialEntries: ['/workspaces/default'] },
    );

    render(<RouterProvider router={router} />);
    await waitFor(() =>
      expect(screen.getByTestId('cold-boot-probe').textContent).toBe('bob|Fresh Bob Workspace'),
    );

    for (const snap of renderedWorkspaces) {
      expect(snap).not.toContain('Persisted Private Alice');
    }
  });
});
