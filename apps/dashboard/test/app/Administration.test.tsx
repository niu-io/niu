import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { expect, it } from 'vitest';
import Administration from '../../src/app/Administration';
import type { AdminSession, DashboardContext } from '../../src/app/dashboard-context';
import { Outlet } from 'react-router';

const administrator: AdminSession = { kind: 'installation', operator: null, permissions: { read: true, write: true, manage_operators: true } };
function mount(session: AdminSession | null, initialEntry = '/admin/providers') {
  const context = { session } as DashboardContext;
  const router = createMemoryRouter([{ element: <Outlet context={context} />, children: [{ path: '/admin', Component: Administration, children: [{ path: 'providers', element: <p>Provider directory loaded</p> }, { path: 'providers/:provider/:section?', element: <p>Provider configuration loaded</p> }] }] }], { initialEntries: [initialEntry] });
  render(<RouterProvider router={router} />);
  return router;
}

it.each([null, { ...administrator, kind: 'operator' } as AdminSession, { ...administrator, permissions: { ...administrator.permissions, manage_operators: false } }])('never mounts configuration for an unauthorized or unchecked session', session => {
  mount(session);
  expect(screen.queryByText('Provider configuration loaded')).toBeNull();
  expect(screen.queryByText('Provider directory loaded')).toBeNull();
  expect(screen.queryByRole('tablist')).toBeNull();
});

it('permits a named Provider destination without rewriting it or adding a Provider switcher', () => {
  const router = mount(administrator, '/admin/providers/demo/models?review=current');
  expect(screen.getByText('Provider configuration loaded')).toBeTruthy();
  expect(router.state.location.pathname).toBe('/admin/providers/demo/models');
  expect(router.state.location.search).toBe('?review=current');
  expect(screen.queryByRole('tablist')).toBeNull();
  expect(screen.queryByRole('button', { name: /switch supplier/i })).toBeNull();
});

it.each([
  ['installation', administrator, true],
  ['granted-platform-admin-admin-role', {
    kind: 'operator',
    operator: { id: 'op-admin', role: 'admin', organization_id: 'org-1', project_id: null },
    permissions: { read: true, write: true, manage_operators: false, platform_admin: true },
  } as AdminSession, true],
  ['granted-platform-admin-viewer-role', {
    kind: 'operator',
    operator: { id: 'op-viewer', role: 'viewer', organization_id: 'org-1', project_id: null },
    permissions: { read: true, write: false, manage_operators: false, platform_admin: true },
  } as AdminSession, true],
  ['customer-owner', {
    kind: 'operator',
    operator: { id: 'op-owner', role: 'owner', organization_id: 'org-1', project_id: null },
    permissions: { read: true, write: true, manage_operators: true, platform_admin: false },
  } as AdminSession, false],
  ['customer-admin', {
    kind: 'operator',
    operator: { id: 'op-admin-2', role: 'admin', organization_id: 'org-1', project_id: null },
    permissions: { read: true, write: true, manage_operators: false, platform_admin: false },
  } as AdminSession, false],
  ['customer-viewer', {
    kind: 'operator',
    operator: { id: 'op-viewer-2', role: 'viewer', organization_id: 'org-1', project_id: null },
    permissions: { read: true, write: false, manage_operators: false, platform_admin: false },
  } as AdminSession, false],
])('enforces the platform administration persona matrix for %s', (_persona, session, allowed) => {
  mount(session, '/admin/providers');
  if (allowed) {
    expect(screen.getByText('Provider directory loaded')).toBeTruthy();
  } else {
    expect(screen.queryByText('Provider directory loaded')).toBeNull();
    expect(screen.getByText('Administrator access required')).toBeTruthy();
  }
});
