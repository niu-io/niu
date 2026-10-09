import userEvent from '@testing-library/user-event';
import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { SidebarProvider } from '@/components/ui/sidebar';
import { SupplierNav } from '@/app/AppLayout';
import type { DashboardContext } from '@/app/dashboard-context';

it('keeps Admin sections independent of the Supplier directory', () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({data:[{id:'supplier-a',name:'OpenRouter'}]})));
  const context = {token:'test',session:{kind:'installation',operator:null}} as unknown as DashboardContext;
  render(<MemoryRouter initialEntries={['/admin/suppliers']}><SidebarProvider><SupplierNav context={context}/></SidebarProvider></MemoryRouter>);
  expect(screen.queryByRole('button', {name:'Switch supplier'})).toBeNull();
  for (const [name, href] of [['Suppliers','/admin/suppliers'],['Payment gateways','/admin/payments']]) {
    expect(screen.getByRole('link', {name}).getAttribute('href')).toBe(href);
  }
});


it('keeps Admin navigation available on Supplier detail routes', () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({data:[{id:'supplier-a',name:'Example supplier'}]})));
  const context = {token:'test',session:{kind:'installation',operator:null}} as unknown as DashboardContext;
  render(<MemoryRouter initialEntries={['/admin/suppliers/supplier-a/models']}><SidebarProvider><Routes><Route path="/admin/suppliers/:supplierId/:section" element={<SupplierNav context={context}/>} /></Routes></SidebarProvider></MemoryRouter>);
  expect(screen.getByRole('navigation', {name:'Admin navigation'})).toBeTruthy();
  expect(screen.queryByRole('button', {name:'Switch supplier'})).toBeNull();
  expect(screen.queryByText('Example supplier')).toBeNull();
  expect(screen.getByRole('link', {name:'Suppliers'}).getAttribute('href')).toBe('/admin/suppliers');
  expect(screen.getByRole('link', {name:'Suppliers'}).getAttribute('aria-current')).toBe('page');
  expect(screen.getByRole('link', {name:'Payment gateways'}).getAttribute('href')).toBe('/admin/payments');
  expect(screen.getByRole('link', {name:'Payment gateways'}).hasAttribute('aria-current')).toBe(false);
  for (const name of ['All suppliers','Overview','API keys & routes','Models & pricing','Usage','Settlements','Portal access','Settings']) {
    expect(screen.queryByRole('link', {name})).toBeNull();
  }
});


it('lets Supplier members switch supplier without losing the section or carrying supplier dialogs', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({data:[{id:'supplier-a',name:'First supplier'},{id:'supplier-b',name:'Second supplier'}]})));
  const context = {token:'test',session:{kind:'member',operator:null,permissions:{platform_admin:false},provider_memberships:[{id:'supplier-a',name:'First supplier'},{id:'supplier-b',name:'Second supplier'}]}} as unknown as DashboardContext;
  function ScopedNavigation() { const location = useLocation(); return <><SupplierNav context={context}/><output aria-label="Current route">{location.pathname + location.search}</output></>; }
  render(<MemoryRouter initialEntries={['/suppliers/supplier-a/models?sort=name&properties=supplier']}><SidebarProvider><Routes><Route path="/suppliers/:provider/:section" element={<ScopedNavigation/>}/></Routes></SidebarProvider></MemoryRouter>);
  const user = userEvent.setup();
  await screen.findByText('First supplier');
  await user.click(screen.getByRole('button', {name:'Switch supplier'}));
  expect(screen.getByRole('menuitemradio', {name:'First supplier'}).getAttribute('aria-checked')).toBe('true');
  await user.click(screen.getByRole('menuitemradio', {name:'Second supplier'}));
  expect(screen.getByLabelText('Current route').textContent).toBe('/suppliers/supplier-b/models?sort=name');
  expect(screen.getByRole('button', {name:'Switch supplier'}).textContent).toContain('Second supplier');
  expect(screen.getByRole('link', {name:'Overview'}).getAttribute('href')).toBe('/suppliers/supplier-b');
  expect(screen.queryByRole('menu')).toBeNull();
});
