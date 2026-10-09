import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { expect, it, vi } from 'vitest';
import AccountMenu from '../../src/app/AccountMenu';
import type { AdminSession, DashboardContext } from '../../src/app/dashboard-context';

vi.mock('@/components/ui/sidebar', () => ({ useSidebar: () => ({ isMobile: true, setOpenMobile: vi.fn() }) }));

const customer: AdminSession = {
  kind: 'operator', operator: { id: 'member', role: 'owner', organization_id: 'company', project_id: null },
  permissions: { read: true, write: true, manage_operators: true },
};

async function open(session: AdminSession | null) {
  const context = {
    session, token: session ? 'test-session' : '', organizations: [], organization: null,
    signOut: vi.fn(), selectOrganization: vi.fn(), workspaceLoading: false, workspaceError: null,
  } as unknown as DashboardContext;
  render(<MemoryRouter><AccountMenu context={context} workspacePath="/workspaces/demo" mobile /></MemoryRouter>);
  await userEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));
}

it.each([customer, null, { ...customer, kind: 'installation', operator: null, permissions: { read: true, write: false, manage_operators: false } } as AdminSession])('does not offer Supplier administration to unauthorized sessions', async session => {
  await open(session);
  expect(screen.queryByRole('menuitem', { name: 'Suppliers' })).toBeNull();
  expect(screen.queryByRole('menuitem', { name: 'Admin', exact: true })).toBeNull();
  expect(screen.getByRole('menuitem', { name: 'Models' })).toBeTruthy();
});

it('keeps a Supplier member linked to their own business', async () => {
  await open({ ...customer, provider_memberships: [{ id: 'supplier-member', name: 'Demo supplier', role: 'viewer' }] });
  expect(screen.getByRole('menuitem', { name: 'Suppliers' }).getAttribute('href')).toBe('/suppliers/supplier-member');
});

it('adds administration without removing customer navigation', async () => {
  await open({ ...customer, kind: 'installation', operator: null });
  expect(screen.getByRole('menuitem', { name: 'Admin', exact: true }).getAttribute('href')).toBe('/admin/suppliers');
  for (const name of ['Workspace', 'Generations', 'Activity', 'Models', 'Settings']) {
    expect(screen.getByRole('menuitem', { name, exact: true })).toBeTruthy();
  }
});

it('shows Admin for a user account with the platform administrator role', async () => {
  await open({ ...customer, permissions: { ...customer.permissions, platform_admin: true } });
  expect(screen.getByRole('menuitem', { name: 'Admin', exact: true }).getAttribute('href')).toBe('/admin/suppliers');
  expect(screen.getByRole('menuitem', { name: 'Settings', exact: true })).toBeTruthy();
});
