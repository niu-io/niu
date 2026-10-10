import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { expect, it, vi } from 'vitest';
import { request, VendorRequestError } from '../../../src/features/vendors/api';
import SupplierList from '../../../src/features/vendors/SupplierList';
vi.mock('../../../src/app/dashboard-context', () => ({ useDashboardContext: () => ({ token: 'fixture' }) }));
vi.mock('../../../src/features/vendors/api', async importOriginal => ({ ...await importOriginal<typeof import('../../../src/features/vendors/api')>(), request: vi.fn(async () => ({ data: [{ id: 'fixture', name: 'Example', members: 0, api_keys: 0, models: 0 }, { id: 'active', name: 'Active supplier', members: 0, api_keys: 1, models: 25 }] })) }));

it('restores the opening control after cancelling creation and deletion', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><SupplierList /></MemoryRouter>);
  await screen.findByRole('link', { name: 'Example' });
  const add = screen.getByRole('button', { name: 'Add Supplier' });
  await user.click(add);
  let dialog = screen.getByRole('dialog');
  expect(document.activeElement).toBe(within(dialog).getByRole('textbox', { name: 'Supplier name' }));
  await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(document.activeElement).toBe(add));
  const actions = screen.getByRole('button', { name: 'Actions for Example' });
  await user.click(actions);
  await user.click(screen.getByRole('menuitem', { name: 'Delete Supplier' }));
  dialog = screen.getByRole('dialog');
  await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(document.activeElement).toBe(actions));
});

it('explains why a populated supplier cannot be deleted before submission', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><SupplierList /></MemoryRouter>);
  await user.click(await screen.findByRole('button', { name: 'Actions for Active supplier' }));
  await user.click(screen.getByRole('menuitem', { name: 'Delete Supplier' }));
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByText(/has API keys, models, or members and cannot be deleted/)).toBeTruthy();
  expect((within(dialog).getByRole('button', { name: 'Delete Supplier' }) as HTMLButtonElement).disabled).toBe(true);
});


it.each(['transport','server','timeout'])('reconciles uncertain Supplier creation (%s) without a second write', async failure => {
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
  await screen.findByText(/No Suppliers yet/);
  await user.click(screen.getByRole('button',{name:'Add Supplier'}));
  await user.type(screen.getByLabelText('Supplier name'),'Saved business');
  await user.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Add Supplier'}));
  expect(await screen.findByText(/Supplier creation could not be confirmed/)).toBeTruthy();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(writes).toBe(1);
  await user.click(screen.getByRole('button',{name:'Retry'}));
  await screen.findByRole('link',{name:'Saved business'});
  expect(writes).toBe(1);
});

it('keeps a rejected Supplier name editable without read recovery',async()=>{
  let writes=0;
  vi.mocked(request).mockImplementation(async (_token,_path,method='GET')=>{
    if(method==='POST'){writes+=1;throw new VendorRequestError('Supplier name is already used.',409);}
    return {data:[]};
  });
  const user=userEvent.setup();
  render(<MemoryRouter><SupplierList/></MemoryRouter>);
  await screen.findByText(/No Suppliers yet/);
  await user.click(screen.getByRole('button',{name:'Add Supplier'}));
  await user.type(screen.getByLabelText('Supplier name'),'Existing business');
  await user.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Add Supplier'}));
  expect(await screen.findByText('Supplier name is already used.')).toBeTruthy();
  expect((screen.getByLabelText('Supplier name') as HTMLInputElement).value).toBe('Existing business');
  expect(writes).toBe(1);
});
