import userEvent from '@testing-library/user-event';
import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { SidebarProvider } from '@/components/ui/sidebar';
import { ProviderNav } from '@/shell/AppLayout';
import { ShellAccount, ShellNavigationContext } from '@/shell/ShellNavigation';
import type { DashboardContext } from '@/shell/dashboard-context';

it('keeps Admin sections independent of the Provider directory', () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({data:[{id:'supplier-a',name:'OpenRouter'}]})));
  const context = {token:'test',session:{kind:'installation',operator:null}} as unknown as DashboardContext;
  render(<MemoryRouter initialEntries={['/admin/providers']}><SidebarProvider><ProviderNav context={context}/></SidebarProvider></MemoryRouter>);
  expect(screen.queryByRole('button', {name:'Switch provider'})).toBeNull();
  for (const [name, href] of [
    ['Providers', '/admin/providers'],
    ['Standard pricing', '/admin/pricing'],
    ['Customers', '/admin/customers'],
    ['Reports', '/admin/reports'],
    ['Audit logs', '/admin/audit'],
    ['Settings', '/admin/settings'],
  ]) {
    expect(screen.getByRole('link', {name}).getAttribute('href')).toBe(href);
  }
});


it('keeps Admin navigation available on Provider detail routes', () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({data:[{id:'supplier-a',name:'Example provider'}]})));
  const context = {token:'test',session:{kind:'installation',operator:null}} as unknown as DashboardContext;
  render(<MemoryRouter initialEntries={['/admin/providers/supplier-a/models']}><SidebarProvider><Routes><Route path="/admin/providers/:providerId/:section" element={<ProviderNav context={context}/>} /></Routes></SidebarProvider></MemoryRouter>);
  expect(screen.getByRole('navigation', {name:'Admin navigation'})).toBeTruthy();
  expect(screen.queryByRole('button', {name:'Switch provider'})).toBeNull();
  expect(screen.queryByText('Example provider')).toBeNull();
  expect(screen.getByRole('link', {name:'Providers'}).getAttribute('href')).toBe('/admin/providers');
  expect(screen.getByRole('link', {name:'Providers'}).getAttribute('aria-current')).toBe('page');
  expect(screen.getByRole('link', {name:'Standard pricing'}).getAttribute('href')).toBe('/admin/pricing');
  expect(screen.getByRole('link', {name:'Standard pricing'}).hasAttribute('aria-current')).toBe(false);
  const adminLinks=screen.getByRole('navigation',{name:'Admin navigation'}).querySelectorAll('a');
  expect(adminLinks[adminLinks.length-1].getAttribute('href')).toBe('/admin/settings');
  for (const name of ['All providers','Connections','Keys','Models','Usage','Settlements','Members']) {
    expect(screen.queryByRole('link', {name})).toBeNull();
  }
});


it('lets Provider members switch provider without losing the section or carrying provider dialogs', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({data:[{id:'supplier-a',name:'First provider'},{id:'supplier-b',name:'Second provider'}]})));
  const context = {token:'test',session:{kind:'member',operator:null,permissions:{platform_admin:false},provider_memberships:[{id:'supplier-a',name:'First provider'},{id:'supplier-b',name:'Second provider'}]}} as unknown as DashboardContext;
  function ScopedNavigation() { const location = useLocation(); return <><ProviderNav context={context}/><output aria-label="Current route">{location.pathname + location.search}</output></>; }
  render(<MemoryRouter initialEntries={['/providers/supplier-a/models?sort=name&properties=supplier']}><SidebarProvider><Routes><Route path="/providers/:provider/:section" element={<ScopedNavigation/>}/></Routes></SidebarProvider></MemoryRouter>);
  const user = userEvent.setup();
  await screen.findByText('First provider');
  await user.click(screen.getByRole('button', {name:'Switch provider'}));
  expect(screen.getByRole('menuitemradio', {name:'First provider'}).getAttribute('aria-checked')).toBe('true');
  await user.click(screen.getByRole('menuitemradio', {name:'Second provider'}));
  expect(screen.getByLabelText('Current route').textContent).toBe('/providers/supplier-b/models?sort=name');
  expect(screen.getByRole('button', {name:'Switch provider'}).textContent).toContain('Second provider');
  expect(screen.getByRole('link', {name:'Overview'}).getAttribute('href')).toBe('/providers/supplier-b');
  expect(screen.queryByRole('menu')).toBeNull();
});

it('keeps Settings as the final Admin navigation link in both resale and internal modes', () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({data:[]})));
  const internalContext = {token:'test',session:{kind:'installation',operating_mode:'internal',operator:null}} as unknown as DashboardContext;
  render(
    <MemoryRouter initialEntries={['/admin/providers']}>
      <SidebarProvider>
        <ProviderNav context={internalContext}/>
      </SidebarProvider>
    </MemoryRouter>
  );
  const links = screen.getByRole('navigation', { name: 'Admin navigation' }).querySelectorAll('a');
  expect([...links].map(a => a.getAttribute('href'))).toEqual(['/admin/providers', '/admin/audit', '/admin/settings']);
});

function PathEcho() {
  const { pathname } = useLocation();
  return <div data-testid="path-echo">{pathname}</div>;
}

it('lets a platform administrator signed in as a normal user activate Admin from the sidebar footer in one click', async () => {
  const setRole = vi.fn(async () => true);
  const context = {
    token: 'niu-browser-member-session',
    session: {
      kind: 'operator',
      operator: { id: 'op-1', name: 'Founder', role: 'owner', organization_id: 'org-1', project_id: null },
      permissions: { read: true, write: true, manage_operators: true, platform_admin: false },
      admin_mode: { available: true, enabled: false },
      roles: { active: 'user', available: ['user', 'admin'], switchable: true },
      profile: { name: 'Founder', email: 'founder@example.test', avatar_data_url: null, revision: 0 },
    },
    workspace: { id: 'ws-1', name: 'Default' },
    workspaces: [{ id: 'ws-1', name: 'Default' }],
    organizations: [],
    organization: null,
    roleSwitch: { available: ['user', 'admin'], active: 'user', saving: false, error: '', setRole },
    signOut: vi.fn(),
    selectOrganization: vi.fn(),
  } as unknown as DashboardContext;
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/workspaces/default/']}>
      <SidebarProvider>
        <ShellNavigationContext.Provider value={{ context, workspacePath: '/workspaces/default/', modelsHref: '/workspaces/default/models', generationsHref: '/generations' }}>
          <ShellAccount />
          <Routes>
            <Route path="*" element={<PathEcho />} />
          </Routes>
        </ShellNavigationContext.Provider>
      </SidebarProvider>
    </MemoryRouter>,
  );

  const adminButton = screen.getByRole('button', { name: 'Admin' });
  await user.click(adminButton);
  expect(setRole).toHaveBeenCalledWith('admin');
  expect(await screen.findByText('/admin')).toBeTruthy();
});
