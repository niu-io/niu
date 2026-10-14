import { it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import SupplierSettings from '@/features/provider-business/SupplierSettings';
vi.mock('@/app/dashboard-context', () => ({ useDashboardContext: () => ({ token: 'test' }) }));
it('loads saved supplier identity, saves with revision and refreshes navigation', async () => {
  let profile = { name: 'Supplier', description: 'Existing description', website_url: 'https://example.com', logo_url: '', revision: 2 };
  const fetch = vi.fn(async (_url: string, init: RequestInit) => {
    if (init.method === 'PATCH') { const body = JSON.parse(init.body as string); expect(body.expected_revision).toBe(2); profile = { ...body, revision: 3 }; }
    return Response.json({ data: profile });
  });
  vi.stubGlobal('fetch', fetch);
  const updated = vi.fn(); window.addEventListener('niu:supplier-profile-updated', updated);
  const view = render(<MemoryRouter initialEntries={['/admin/suppliers/a/settings']}><Routes><Route path="/admin/suppliers/:supplierId/settings" element={<SupplierSettings />} /></Routes></MemoryRouter>);
  const user = userEvent.setup();
  const name = await screen.findByLabelText('Name');
  expect((name as HTMLInputElement).value).toBe('Supplier');
  expect((screen.getByRole('button', { name: 'Save changes' }) as HTMLButtonElement).disabled).toBe(true);
  await user.clear(name); await user.type(name, 'Updated supplier');
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  await screen.findByText('Supplier details saved.');
  expect(updated).toHaveBeenCalledOnce();
  expect(profile.description).toBe('Existing description');
  view.unmount();
  render(<MemoryRouter initialEntries={['/admin/suppliers/a/settings']}><Routes><Route path="/admin/suppliers/:supplierId/settings" element={<SupplierSettings />} /></Routes></MemoryRouter>);
  await waitFor(() => expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Updated supplier'));
  window.removeEventListener('niu:supplier-profile-updated', updated);
});

it('keeps the draft after a conflicting save and allows reloading the latest profile', async () => {
  let reads = 0;
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => init.method === 'PATCH'
    ? Response.json({error:{message:'Conflict'}}, {status:409})
    : Response.json({data:{name:++reads === 1 ? 'Original supplier' : 'Other administrator’s change', description:'', website_url:'', logo_url:'', revision:reads}})));
  render(<MemoryRouter initialEntries={['/admin/suppliers/a/settings']}><Routes><Route path="/admin/suppliers/:supplierId/settings" element={<SupplierSettings />} /></Routes></MemoryRouter>);
  const user = userEvent.setup();
  const name = await screen.findByLabelText('Name');
  await user.clear(name); await user.type(name, 'My draft');
  await user.click(screen.getByRole('button', {name:'Save changes'}));
  await screen.findByText('These details changed since you opened this page. Reload the saved details before saving again.');
  expect((name as HTMLInputElement).value).toBe('My draft');
  await user.click(screen.getByRole('button', {name:'Reload saved details'}));
  await waitFor(() => expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Other administrator’s change'));
});

it('cancels all profile drafts without submitting an update and restores name focus', async () => {
  const profile = { name: 'Saved supplier', description: 'Saved description', website_url: 'https://example.com', logo_url: '', revision: 1 };
  const fetcher = vi.fn(async () => Response.json({ data: profile }));
  vi.stubGlobal('fetch', fetcher);
  render(<MemoryRouter initialEntries={['/admin/suppliers/a/settings']}><Routes><Route path="/admin/suppliers/:supplierId/settings" element={<SupplierSettings />} /></Routes></MemoryRouter>);
  const user = userEvent.setup();
  const name = await screen.findByLabelText('Name');
  await user.clear(name); await user.type(name, 'Draft supplier');
  const description = screen.getByLabelText('Description');
  await user.clear(description); await user.type(description, 'Draft description');
  const website = screen.getByLabelText('Website URL');
  await user.clear(website); await user.type(website, 'https://draft.example');
  await user.type(screen.getByLabelText('Logo URL'), 'https://draft.example/logo.png');
  await user.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
  expect((name as HTMLInputElement).value).toBe(profile.name);
  expect((description as HTMLTextAreaElement).value).toBe(profile.description);
  expect((website as HTMLInputElement).value).toBe(profile.website_url);
  expect((screen.getByLabelText('Logo URL') as HTMLInputElement).value).toBe(profile.logo_url);
  expect(document.activeElement).toBe(name);
  expect((screen.getByRole('button', { name: 'Save changes' }) as HTMLButtonElement).disabled).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('persists each preset, restores it after reload, and can return to the default or a custom URL', async () => {
  const { supplierLogoPresets } = await import('@/features/vendors/supplier-logos');
  let profile = { name: 'Supplier', description: '', website_url: '', logo_url: '', revision: 1 };
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    if (init.method === 'PATCH') {
      const body = JSON.parse(init.body as string);
      expect(body.expected_revision).toBe(profile.revision);
      profile = { ...body, revision: profile.revision + 1 };
    }
    return Response.json({ data: profile });
  }));
  const mount = () => render(<MemoryRouter initialEntries={['/admin/suppliers/a/settings']}><Routes><Route path="/admin/suppliers/:supplierId/settings" element={<SupplierSettings />} /></Routes></MemoryRouter>);
  let view = mount();
  const user = userEvent.setup();
  await screen.findByLabelText('Name');
  expect(screen.queryByAltText('Supplier logo')).toBeNull();
  for (const preset of supplierLogoPresets) {
    await user.click(screen.getByRole('button', { name: profile.logo_url ? supplierLogoPresets.find(item => item.url === profile.logo_url)!.name : 'Default logo', exact: true }));
    await user.click(screen.getByRole('menuitemradio', { name: preset.name, exact: true }));
    expect(screen.getByAltText('Supplier logo').getAttribute('src')).toBe(preset.src);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('Supplier details saved.');
    expect(profile.logo_url).toBe(preset.url);
  }
  view.unmount(); view = mount();
  await screen.findByLabelText('Name');
  expect(screen.getByRole('button', { name: 'Google Cloud', exact: true })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Google Cloud', exact: true }));
  await user.click(screen.getByRole('menuitemradio', { name: 'Default logo' }));
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  await screen.findByText('Supplier details saved.');
  expect(profile.logo_url).toBe('');
  expect(screen.queryByAltText('Supplier logo')).toBeNull();
  await user.type(screen.getByLabelText('Logo URL'), 'https://example.com/custom.png');
  expect(screen.getByRole('button', { name: 'Custom logo' })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  await screen.findByText('Supplier details saved.');
  expect(profile.logo_url).toBe('https://example.com/custom.png');
  view.unmount();
});
