import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, MemoryRouter, Outlet, RouterProvider } from 'react-router';
import { expect, it, vi } from 'vitest';
import SettingsPage, { SettingsNavigation } from '../../src/features/account/settings-page';
import { SidebarProvider } from '../../src/components/ui/sidebar';
import type { DashboardContext } from '../../src/app/dashboard-context';

function mount() {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  const context = { token: 'fixture', session: {kind:'installation',operator:null,permissions:{read:true,write:true,manage_operators:true}}, appearance:{ready:true}, organization:null } as unknown as DashboardContext;
  const router = createMemoryRouter([{ element: <SidebarProvider><SettingsNavigation context={context}/><Outlet context={context}/></SidebarProvider>, children: [
    {path:'/settings/:section?',Component:SettingsPage},
    {path:'/admin/suppliers/models',element:<p>Supplier models</p>},
    {path:'/workspaces/default',element:<p>Workspace</p>},
  ]}], {initialEntries:[{pathname:'/settings/appearance',state:null}]});
  render(<RouterProvider router={router}/>);
  return router;
}

it('renders routed Settings in a dialog and switches sections', async () => {
  const router = mount();
  expect(screen.getByRole('dialog',{name:'Settings'})).toBeTruthy();
  await userEvent.click(screen.getByRole('button', {name:'Toggle Settings navigation'}));
  expect(screen.getByRole('dialog', {name:'Settings'}).querySelector('[data-collapsible="icon"]')).toBeTruthy();
  await userEvent.click(screen.getByRole('button', {name:'Toggle Settings navigation'}));
  expect(screen.getByRole('navigation', { name: 'Settings navigation' })).toBeTruthy();
  await userEvent.click(screen.getByRole('link',{name:'Billing'}));
  expect(router.state.location.pathname).toBe('/settings/billing');
  await userEvent.click(screen.getByRole('link',{name:'Appearance'}));
  expect(router.state.location.pathname).toBe('/settings/appearance');
  expect(screen.getByRole('button', { name: 'Color mode' })).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Account', exact: true })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Workspaces', exact: true })).toBeNull();
  await userEvent.click(screen.getByRole('link', {name:'About',exact:true}));
  expect(screen.getByRole('region', {name:'About Niu'})).toBeTruthy();
  expect(screen.getByText('Development build')).toBeTruthy();
  expect(screen.getByRole('link', {name:'Third-party notices'})).toBeTruthy();
});

 it('marks only the selected query-based Settings section as current', () => {
  const context = {session:{kind:'operator',operator:{project_id:null,role:'owner'}}} as unknown as DashboardContext;
  render(<MemoryRouter initialEntries={['/workspaces/default?settings=account']}><SidebarProvider><SettingsNavigation context={context} section="account" href={section=>`/workspaces/default?settings=${section}`}/></SidebarProvider></MemoryRouter>);
  expect(screen.getByRole('link', {name:'Account'}).getAttribute('aria-current')).toBe('page');
  for (const name of ['Appearance','Billing','Payments','About']) expect(screen.getByRole('link',{name}).hasAttribute('aria-current')).toBe(false);
 });
