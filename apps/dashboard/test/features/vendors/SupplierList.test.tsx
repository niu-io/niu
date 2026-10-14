import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { expect, it, vi } from 'vitest';
import { request, VendorRequestError } from '../../../src/features/vendors/api';
import SupplierList from '../../../src/features/vendors/SupplierList';
vi.mock('../../../src/app/dashboard-context', () => ({ useDashboardContext: () => ({ token: 'fixture' }) }));
vi.mock('../../../src/features/vendors/api', async importOriginal => ({ ...await importOriginal<typeof import('../../../src/features/vendors/api')>(), request: vi.fn(async () => ({ data: [{ id: 'fixture', name: 'Example', members: 0, api_keys: 0, models: 0 }, { id: 'active', name: 'Active provider', members: 0, api_keys: 1, models: 25 }] })) }));

it('restores the opening control after cancelling creation and deletion', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><SupplierList /></MemoryRouter>);
  await screen.findByRole('link', { name: 'Example' });
  const add = screen.getByRole('button', { name: 'Add Provider' });
  await user.click(add);
  let dialog = screen.getByRole('dialog');
  expect(document.activeElement).toBe(within(dialog).getByRole('textbox', { name: 'Provider name' }));
  await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(document.activeElement).toBe(add));
  const actions = screen.getByRole('button', { name: 'Actions for Example' });
  await user.click(actions);
  await user.click(screen.getByRole('menuitem', { name: 'Delete Provider' }));
  dialog = screen.getByRole('dialog');
  await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(document.activeElement).toBe(actions));
});

it('explains why a populated provider cannot be deleted before submission', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><SupplierList /></MemoryRouter>);
  await user.click(await screen.findByRole('button', { name: 'Actions for Active provider' }));
  await user.click(screen.getByRole('menuitem', { name: 'Delete Provider' }));
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByText(/has API keys, models, or members and cannot be deleted/)).toBeTruthy();
  expect((within(dialog).getByRole('button', { name: 'Delete Provider' }) as HTMLButtonElement).disabled).toBe(true);
});


it.each(['transport','server','timeout'])('reconciles uncertain Provider creation (%s) without a second write', async failure => {
  let writes=0;
  let saved=false;
  vi.mocked(request).mockImplementation(async (_token,path,method='GET') => {
    if (method==='POST') {
      writes+=1; saved=true;
      if (failure==='transport') throw new TypeError('Connection lost');
      throw new VendorRequestError('Unavailable',failure==='timeout'?408:503);
    }
    expect(path).toBe('/admin/v1/providers');
    return {data:saved?[{id:'created',name:'Saved business',members:0,api_keys:0,models:0}]:[]};
  });
  const user=userEvent.setup();
  render(<MemoryRouter><SupplierList/></MemoryRouter>);
  await screen.findByText(/No Providers yet/);
  await user.click(screen.getByRole('button',{name:'Add Provider'}));
  await user.type(screen.getByLabelText('Provider name'),'Saved business');
  await user.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Add Provider'}));
  expect(await screen.findByText(/Provider creation could not be confirmed/)).toBeTruthy();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(writes).toBe(1);
  await user.click(screen.getByRole('button',{name:'Retry'}));
  await screen.findByRole('link',{name:'Saved business'});
  expect(writes).toBe(1);
});

it('keeps a rejected Provider name editable without read recovery',async()=>{
  let writes=0;
  vi.mocked(request).mockImplementation(async (_token,_path,method='GET')=>{
    if(method==='POST'){writes+=1;throw new VendorRequestError('Provider name is already used.',409);}
    return {data:[]};
  });
  const user=userEvent.setup();
  render(<MemoryRouter><SupplierList/></MemoryRouter>);
  await screen.findByText(/No Providers yet/);
  await user.click(screen.getByRole('button',{name:'Add Provider'}));
  await user.type(screen.getByLabelText('Provider name'),'Existing business');
  await user.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Add Provider'}));
  expect(await screen.findByText('Provider name is already used.')).toBeTruthy();
  expect((screen.getByLabelText('Provider name') as HTMLInputElement).value).toBe('Existing business');
  expect(writes).toBe(1);
});


it('shows saved logos and default fallbacks without a redundant configuration status column', async () => {
  const { supplierLogoPresets } = await import('@/features/vendors/supplier-logos');
  const preset = supplierLogoPresets[0];
  vi.mocked(request).mockResolvedValue({ data: [
    { id: 'preset', name: 'Preset provider', logo_url: preset.url, members: 0 },
    { id: 'custom', name: 'Custom provider', logo_url: 'https://example.com/logo.png', members: 0 },
    { id: 'default', name: 'Default provider', logo_url: '', members: 0 },
  ] });
  render(<MemoryRouter><SupplierList /></MemoryRouter>);
  const presetLink = await screen.findByRole('link', { name: 'Preset provider', exact: true });
  expect(presetLink.closest('td')?.querySelector('img')?.getAttribute('src')).toBe(preset.src);
  const customCell = screen.getByRole('link', { name: 'Custom provider', exact: true }).closest('td')!;
  expect(customCell.querySelector('img')?.getAttribute('src')).toBe('https://example.com/logo.png');
  fireEvent.error(customCell.querySelector('img')!);
  expect(customCell.querySelector('img')).toBeNull();
  expect(customCell.querySelector('svg')).toBeTruthy();
  const defaultCell = screen.getByRole('link', { name: 'Default provider', exact: true }).closest('td')!;
  expect(defaultCell.querySelector('svg')).toBeTruthy();
  expect(screen.queryByRole('columnheader', { name: 'Configuration', exact: true })).toBeNull();
  expect(screen.queryByText('Configuration saved')).toBeNull();
});


it('distinguishes commercial supply readiness from simply having an API key', async () => {
  const { supplierAvailability } = await import('@/features/vendors/supplier-setup');
  const configured = { api_keys: 1, enabled_api_keys: 1, models: 2, enabled_model_routes: 2, offers: 1, ready_offers: 0 };
  expect(supplierAvailability({ ...configured, qualification_status: 'unqualified' }).label).toBe('Not qualified');
  expect(supplierAvailability({ ...configured, qualification_status: 'qualified' }).label).toBe('Not ready');
  expect(supplierAvailability({ ...configured, qualification_status: 'qualified', ready_offers: 1 }).label).toBe('Ready to supply');
  expect(supplierAvailability({ ...configured, ready_offers: undefined }).label).toBe('Status unavailable');
});


it('refreshes missing readiness data instead of sending users to edit offers', async () => {
  vi.mocked(request).mockResolvedValueOnce({ data: [{ id: 'supplier', name: 'Provider', api_keys: 1, models: 2 }] });
  render(<MemoryRouter><SupplierList /></MemoryRouter>);
  await screen.findByText('Status unavailable');
  vi.mocked(request).mockResolvedValue({ data: [{ id: 'supplier', name: 'Provider', api_keys: 1, models: 2, enabled_api_keys: 1, enabled_model_routes: 2, qualification_status: 'unqualified', offers: 2, ready_offers: 0 }] });
  await userEvent.setup().click(screen.getAllByRole('button', { name: 'Refresh status' })[0]);
  await screen.findByText('Not qualified');
  expect(screen.queryByText('Status unavailable')).toBeNull();
});
