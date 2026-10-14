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
