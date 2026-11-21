import userEvent from '@testing-library/user-event';
import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { SidebarProvider } from '@/components/ui/sidebar';
import { ProviderNav } from '@/shell/AppLayout';
import type { DashboardContext } from '@/shell/dashboard-context';

it('keeps Admin sections independent of the Provider directory', () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({data:[{id:'supplier-a',name:'OpenRouter'}]})));
  const context = {token:'test',session:{kind:'installation',operator:null}} as unknown as DashboardContext;
  render(<MemoryRouter initialEntries={['/admin/providers']}><SidebarProvider><ProviderNav context={context}/></SidebarProvider></MemoryRouter>);
  expect(screen.queryByRole('button', {name:'Switch provider'})).toBeNull();
  for (const [name, href] of [
    ['Overview', '/admin'],
    ['Providers', '/admin/providers'],
    ['Custom models', '/admin/routing'],
    ['Pricing', '/admin/pricing'],
    ['Customers', '/admin/customers'],
    ['Registrations', '/admin/registrations'],
    ['Payments', '/admin/payments'],
    ['Financial reports', '/admin/reports'],
    ['Incidents', '/admin/incidents'],
    ['Audit logs', '/admin/audit'],
    ['Branding', '/admin/branding'],
    ['Registration policy', '/admin/settings/registration'],
    ['General & billing', '/admin/settings'],
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
  expect(screen.getByRole('link', {name:'Payments'}).getAttribute('href')).toBe('/admin/payments');
  expect(screen.getByRole('link', {name:'Payments'}).hasAttribute('aria-current')).toBe(false);
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

it('expands and collapses two-level Admin sidebar groups and auto-expands active groups', async () => {
  window.localStorage.removeItem('niu.admin.nav.collapsed');
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({data:[]})));
  const context = {token:'test',session:{kind:'installation',operator:null}} as unknown as DashboardContext;
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/admin/providers']}>
      <SidebarProvider>
        <ProviderNav context={context}/>
      </SidebarProvider>
    </MemoryRouter>
  );

  const commerceButton = screen.getByRole('button', { name: 'Commerce' });
  expect(commerceButton.getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByRole('link', { name: 'Pricing' })).toBeTruthy();

  await user.click(commerceButton);
  expect(commerceButton.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByRole('link', { name: 'Pricing' })).toBeNull();

  await user.click(commerceButton);
  expect(commerceButton.getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByRole('link', { name: 'Pricing' })).toBeTruthy();
});

it('opens a two-level flyout menu for Admin groups when the sidebar is collapsed to icon mode', async () => {
  window.localStorage.removeItem('niu.admin.nav.collapsed');
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({data:[]})));
  const context = {token:'test',session:{kind:'installation',operator:null}} as unknown as DashboardContext;
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/admin/providers']}>
      <SidebarProvider defaultOpen={false}>
        <ProviderNav context={context}/>
      </SidebarProvider>
    </MemoryRouter>
  );

  const commerceTrigger = screen.getByRole('button', { name: 'Commerce' });
  expect(screen.queryByRole('link', { name: 'Payments' })).toBeNull();
  await user.click(commerceTrigger);
  const paymentsItem = await screen.findByRole('menuitem', { name: 'Payments' });
  expect(paymentsItem.getAttribute('href')).toBe('/admin/payments');
});
