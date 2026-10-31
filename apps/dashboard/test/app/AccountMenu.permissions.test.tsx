import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { expect, it, vi } from 'vitest';
import AccountMenu from '../../app/shell/AccountMenu';
import type { AdminSession, DashboardContext } from '../../app/shell/dashboard-context';

vi.mock('@/components/ui/sidebar', () => ({ useSidebar: () => ({ isMobile: true, setOpenMobile: vi.fn() }) }));

const customer: AdminSession = {
  kind: 'operator', operator: { id: 'member', role: 'owner', organization_id: 'company', project_id: null },
  permissions: { read: true, write: true, manage_operators: true },
};

async function open(session: AdminSession | null, roleSwitch?: DashboardContext['roleSwitch']) {
  const context = {
    session, roleSwitch, token: session ? 'test-session' : '', organizations: [], organization: null,
    signOut: vi.fn(), selectOrganization: vi.fn(), workspaceLoading: false, workspaceError: null,
  } as unknown as DashboardContext;
  render(<MemoryRouter><AccountMenu context={context} workspacePath="/workspaces/demo" mobile /></MemoryRouter>);
  await userEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));
}

it('offers explicit Admin mode without exposing administrator navigation in User mode', async () => {
  const setRole = vi.fn().mockResolvedValue(true);
  await open(customer, {available: ['user','admin'], active: 'user', saving: false, error: '', setRole});
  expect(screen.queryByRole('menuitem', {name:'Admin', exact:true})).toBeNull();
  expect(screen.getByRole('menuitemradio', {name:'User', exact:true}).getAttribute('aria-checked')).toBe('true');
  expect(screen.getByRole('menuitemradio', {name:'Platform administrator'}).getAttribute('aria-checked')).toBe('false');
  await userEvent.click(screen.getByRole('menuitemradio', {name:'Platform administrator'}));
  expect(setRole).toHaveBeenCalledWith('admin');
});

it('does not offer role switching to a single-role account', async () => {
  await open(customer, {available:['user'],active:'user',saving:false,error:'',setRole:vi.fn()});
  expect(screen.queryByRole('group',{name:'Role'})).toBeNull();
  expect(screen.queryByRole('menuitemradio',{name:'Platform administrator'})).toBeNull();
});

it('keeps a failed mode change visible and allows retry', async () => {
  await open(customer, {available: ['user','admin'], active: 'user', saving: false, error: 'Could not switch role. Try again.', setRole: vi.fn().mockResolvedValue(false)});
  await userEvent.click(screen.getByRole('menuitemradio', {name:'Platform administrator'}));
  expect(screen.getByRole('alert').textContent).toBe('Could not switch role. Try again.');
  expect(screen.getByRole('menuitemradio', {name:'Platform administrator'})).toBeTruthy();
});

it.each([customer, null, { ...customer, kind: 'installation', operator: null, permissions: { read: true, write: false, manage_operators: false } } as AdminSession])('does not offer Provider administration to unauthorized sessions', async session => {
  await open(session);
  expect(screen.queryByRole('menuitem', { name: 'Providers' })).toBeNull();
  expect(screen.queryByRole('menuitem', { name: 'Admin', exact: true })).toBeNull();
  expect(screen.getByRole('menuitem', { name: 'Models' })).toBeTruthy();
});

it('does not expose a Provider portal for legacy memberships', async () => {
  await open({ ...customer, provider_memberships: [{ id: 'supplier-member', name: 'Demo provider', role: 'viewer' }] });
  expect(screen.queryByRole('menuitem', { name: 'Providers' })).toBeNull();
  expect(screen.queryByRole('menuitemradio', { name: 'Provider' })).toBeNull();
});

it('adds administration without removing customer navigation', async () => {
  await open({ ...customer, kind: 'installation', operator: null });
  expect(screen.getByRole('menuitem', { name: 'Admin', exact: true }).getAttribute('href')).toBe('/admin/providers');
  for (const name of ['Workspace', 'Generations', 'Activity', 'Models', 'Settings']) {
    expect(screen.getByRole('menuitem', { name, exact: true })).toBeTruthy();
  }
});

it('shows Admin for a user account with the platform administrator role', async () => {
  await open({ ...customer, permissions: { ...customer.permissions, platform_admin: true } });
  expect(screen.getByRole('menuitem', { name: 'Admin', exact: true }).getAttribute('href')).toBe('/admin/providers');
  expect(screen.getByRole('menuitem', { name: 'Settings', exact: true })).toBeTruthy();
});

it('shows Admin for a granted platform administrator even when customer role lacks manage_operators', async () => {
  await open({
    kind: 'operator',
    operator: { id: 'member-admin', role: 'admin', organization_id: 'company', project_id: null },
    permissions: { read: true, write: true, manage_operators: false, platform_admin: true },
  });
  expect(screen.getByRole('menuitem', { name: 'Admin', exact: true }).getAttribute('href')).toBe('/admin/providers');
});
