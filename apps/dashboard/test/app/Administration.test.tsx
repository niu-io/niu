import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { expect, it } from 'vitest';
import Administration from '../../src/app/Administration';
import type { AdminSession, DashboardContext } from '../../src/app/dashboard-context';
import { Outlet } from 'react-router';

const administrator: AdminSession = { kind: 'installation', operator: null, permissions: { read: true, write: true, manage_operators: true } };
function mount(session: AdminSession | null, initialEntry = '/admin/suppliers') {
  const context = { session } as DashboardContext;
  const router = createMemoryRouter([{ element: <Outlet context={context} />, children: [{ path: '/admin', Component: Administration, children: [{ path: 'suppliers', element: <p>Supplier directory loaded</p> }, { path: 'suppliers/:supplier/:section?', element: <p>Supplier configuration loaded</p> }] }] }], { initialEntries: [initialEntry] });
  render(<RouterProvider router={router} />);
  return router;
}

it.each([null, { ...administrator, kind: 'operator' } as AdminSession, { ...administrator, permissions: { ...administrator.permissions, manage_operators: false } }])('never mounts configuration for an unauthorized or unchecked session', session => {
  mount(session);
  expect(screen.queryByText('Supplier configuration loaded')).toBeNull();
  expect(screen.queryByText('Supplier directory loaded')).toBeNull();
  expect(screen.queryByRole('tablist')).toBeNull();
});

it('permits a named Supplier destination without rewriting it or adding a Supplier switcher', () => {
  const router = mount(administrator, '/admin/suppliers/demo/models?review=current');
  expect(screen.getByText('Supplier configuration loaded')).toBeTruthy();
  expect(router.state.location.pathname).toBe('/admin/suppliers/demo/models');
  expect(router.state.location.search).toBe('?review=current');
  expect(screen.queryByRole('tablist')).toBeNull();
  expect(screen.queryByRole('button', { name: /switch supplier/i })).toBeNull();
});
