import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, RouterProvider, createMemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import { request, ProviderRequestError } from '../../../app/features/providers/api';
import ProviderList from '../../../app/features/providers/ProviderList';
vi.mock('../../../app/shell/dashboard-context', () => ({ useDashboardContext: () => ({ token: 'fixture', organization: {id:'org',name:'Example organization'}, refreshWorkspace: async () => {} }) }));
vi.mock('../../../app/features/providers/api', async importOriginal => ({ ...await importOriginal<typeof import('../../../app/features/providers/api')>(), request: vi.fn(async () => ({ data: [{ id: 'fixture', name: 'Example', members: 0, api_keys: 0, models: 0 }, { id: 'active', name: 'Active provider', members: 0, api_keys: 1, models: 25 }] })) }));
beforeEach(() => {
  vi.mocked(request).mockReset().mockResolvedValue({ data: [{ id: 'fixture', name: 'Example', members: 0, api_keys: 0, models: 0 }, { id: 'active', name: 'Active provider', members: 0, api_keys: 1, models: 25 }] });
});

it('keeps the connection dialog and saved key recovery visible when discovery fails during a directory refresh', async () => {
  let writes = 0;
  vi.mocked(request).mockImplementation(async (_token, path, method = 'GET') => {
    if (path === '/api/v1/providers/presets') return {data:[{id:'babelark',name:'BabelArk',protocol:'openai',api_base:'https://api.babelark.ai/v1',website:'https://api.babelark.ai'}]};
    if (path === '/api/v1/providers') return {data:[]};
    if (path === '/api/v1/vendors' && method === 'POST') { writes++; return {data:{id:'saved-key',revision:1}}; }
    if (path.endsWith('/supplier')) return {data:{id:'provider'}};
    if (path.endsWith('/integration')) return {data:{effective_type:'babelark',revision:0}};
    if (path.endsWith('/import')) throw new ProviderRequestError('Catalog unavailable.', 502);
    throw new Error('Unexpected request');
  });
  const user = userEvent.setup();
  render(<MemoryRouter><ProviderList /></MemoryRouter>);
  await user.click(await screen.findByRole('button', {name:'Connect BabelArk'}));
  await user.type(screen.getByLabelText('Provider API key'), 'fixture-key');
  await user.click(screen.getByRole('button', {name:'Connect and import models'}));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Catalog unavailable.');
  expect(screen.getByRole('dialog', {name:'Connect BabelArk'})).toBeTruthy();
  expect(screen.getByRole('button', {name:'Retry model import'})).toBeTruthy();
  expect(screen.queryByLabelText('Provider API key')).toBeNull();
  expect(writes).toBe(1);
});

it('opens the newly created Provider directly without refreshing the directory', async () => {
  vi.mocked(request).mockImplementation(async (_token, _path, method = 'GET') => method === 'POST' ? { data: { id: 'new-provider' } } : { data: [] });
  const router = createMemoryRouter([
    { path: '/admin/providers', element: <ProviderList /> },
    { path: '/admin/providers/:providerId', element: <h1>New Provider overview</h1> },
  ], { initialEntries: ['/admin/providers'] });
  render(<RouterProvider router={router} />);
  const user = userEvent.setup();
  await screen.findByText(/No Providers yet/);
  await user.click(screen.getByRole('button', { name: 'Add Provider' }));
  await user.type(screen.getByLabelText('Provider name'), 'New Provider');
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add Provider' }));
  await screen.findByRole('heading', { name: 'New Provider overview' });
  expect(router.state.location.pathname).toBe('/admin/providers/new-provider');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(vi.mocked(request).mock.calls.filter(([, , method]) => method === 'POST')).toHaveLength(1);
  expect(vi.mocked(request).mock.calls.filter(([, , method]) => method === 'GET')).toHaveLength(2);
  expect(vi.mocked(request).mock.calls.find(([, , method]) => method === 'POST')?.[3]).toEqual({ name: 'New Provider' });
});

it('creates the optional profile in one request and opens the returned Provider slug', async () => {
  const { providerLogoPresets } = await import('@/features/providers/provider-logos');
  vi.mocked(request).mockImplementation(async (_token, _path, method = 'GET') => method === 'POST' ? { data: { id: 'new-provider', slug: 'complete-provider' } } : { data: [] });
  const router = createMemoryRouter([
    { path: '/admin/providers', element: <ProviderList /> },
    { path: '/admin/providers/:providerId', element: <h1>Provider profile created</h1> },
  ], { initialEntries: ['/admin/providers'] });
  render(<RouterProvider router={router} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Add Provider' }));
  await user.click(screen.getByLabelText('Provider name'));
  await user.paste(' Complete Provider ');
  await user.click(screen.getByLabelText('Website (optional)'));
  await user.paste('https://example.com');
  await user.click(screen.getByLabelText('Description (optional)'));
  await user.paste(' Model services ');
  await user.click(screen.getByRole('button', { name: 'Choose Provider logo' }));
  await user.click(screen.getByRole('menuitemradio', { name: 'OpenRouter', exact: true }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add Provider' }));
  await screen.findByRole('heading', { name: 'Provider profile created' });
  expect(router.state.location.pathname).toBe('/admin/providers/complete-provider');
  const writes = vi.mocked(request).mock.calls.filter(([, , method]) => method !== 'GET');
  expect(writes).toHaveLength(1);
  expect(writes[0][3]).toEqual({ name: 'Complete Provider', website_url: 'https://example.com', description: 'Model services', logo_url: providerLogoPresets[0].url });
});

it('retains all profile fields after a rejected submission and resets them when reopening', async () => {
  vi.mocked(request).mockImplementation(async (_token, _path, method = 'GET') => {
    if (method === 'POST') throw new ProviderRequestError('Invalid logo URL.', 400);
    return { data: [] };
  });
  render(<MemoryRouter><ProviderList /></MemoryRouter>);
  const user = userEvent.setup();
  const open = () => user.click(screen.getByRole('button', { name: 'Add Provider', exact: true }));
  await open();
  await user.type(screen.getByLabelText('Provider name'), 'Provider draft');
  await user.type(screen.getByLabelText('Website (optional)'), 'https://example.com');
  await user.type(screen.getByLabelText('Description (optional)'), 'Keep this description');
  await user.type(screen.getByLabelText('Logo URL (optional)'), 'https://example.com/logo.svg');
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add Provider' }));
  await screen.findByText('Invalid logo URL.');
  expect((screen.getByLabelText('Website (optional)') as HTMLInputElement).value).toBe('https://example.com');
  expect((screen.getByLabelText('Description (optional)') as HTMLTextAreaElement).value).toBe('Keep this description');
  expect((screen.getByLabelText('Logo URL (optional)') as HTMLInputElement).value).toBe('https://example.com/logo.svg');
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  await open();
  for (const label of ['Provider name', 'Website (optional)', 'Description (optional)', 'Logo URL (optional)']) {
    expect((screen.getByLabelText(label) as HTMLInputElement).value).toBe('');
  }
});

it('does not invite duplicate creation when a successful response omits the new identity', async () => {
  let writes = 0;
  vi.mocked(request).mockImplementation(async (_token, _path, method = 'GET') => {
    if (method === 'POST') { writes += 1; return { data: {} }; }
    return { data: writes ? [{ id: 'saved-provider', name: 'Saved Provider', members: 0, api_keys: 0, models: 0 }] : [] };
  });
  render(<MemoryRouter><ProviderList /></MemoryRouter>);
  const user = userEvent.setup();
  await screen.findByText(/No Providers yet/);
  await user.click(screen.getByRole('button', { name: 'Add Provider' }));
  await user.type(screen.getByLabelText('Provider name'), 'Saved Provider');
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add Provider' }));
  await screen.findByText(/Provider was created, but its page could not be opened/);
  await user.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByRole('link', { name: 'Saved Provider' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(writes).toBe(1);
});

it('restores the opening control after cancelling creation and deletion', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><ProviderList /></MemoryRouter>);
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
  render(<MemoryRouter><ProviderList /></MemoryRouter>);
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
      throw new ProviderRequestError('Unavailable',failure==='timeout'?408:503);
    }
    if(path==='/api/v1/providers/presets') return {data:[]};
    expect(path).toBe('/api/v1/providers');
    return {data:saved?[{id:'created',name:'Saved business',members:0,api_keys:0,models:0}]:[]};
  });
  const user=userEvent.setup();
  render(<MemoryRouter><ProviderList/></MemoryRouter>);
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
    if(method==='POST'){writes+=1;throw new ProviderRequestError('Provider name is already used.',409);}
    return {data:[]};
  });
  const user=userEvent.setup();
  render(<MemoryRouter><ProviderList/></MemoryRouter>);
  await screen.findByText(/No Providers yet/);
  await user.click(screen.getByRole('button',{name:'Add Provider'}));
  await user.type(screen.getByLabelText('Provider name'),'Existing business');
  await user.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Add Provider'}));
  expect(await screen.findByText('Provider name is already used.')).toBeTruthy();
  expect((screen.getByLabelText('Provider name') as HTMLInputElement).value).toBe('Existing business');
  expect(writes).toBe(1);
});


it('shows saved logos and default fallbacks without a redundant configuration status column', async () => {
  const { supplierLogoPresets } = await import('@/features/providers/provider-logos');
  const preset = supplierLogoPresets[0];
  vi.mocked(request).mockResolvedValue({ data: [
    { id: 'preset', name: 'Preset provider', logo_url: preset.url, members: 0 },
    { id: 'custom', name: 'Custom provider', logo_url: 'https://example.com/logo.png', members: 0 },
    { id: 'default', name: 'Default provider', logo_url: '', members: 0 },
  ] });
  render(<MemoryRouter><ProviderList /></MemoryRouter>);
  const presetLink = await screen.findByRole('link', { name: 'Preset provider', exact: true });
  expect(presetLink.closest('li')?.querySelector('img')?.getAttribute('src')).toBe(preset.src);
  const customCell = screen.getByRole('link', { name: 'Custom provider', exact: true }).closest('li')!;
  expect(customCell.querySelector('img')?.getAttribute('src')).toBe('https://example.com/logo.png');
  fireEvent.error(customCell.querySelector('img')!);
  expect(customCell.querySelector('img')).toBeNull();
  expect(customCell.querySelector('svg')).toBeTruthy();
  const defaultCell = screen.getByRole('link', { name: 'Default provider', exact: true }).closest('li')!;
  expect(defaultCell.querySelector('svg')).toBeTruthy();
  expect(screen.queryByRole('columnheader', { name: 'Configuration', exact: true })).toBeNull();
  expect(screen.queryByText('Configuration saved')).toBeNull();
});


it('derives commercial supply readiness only from explicitly authorized active offers', async () => {
  const { supplierAvailability } = await import('@/features/providers/provider-setup');
  const configured = { api_keys: 1, enabled_api_keys: 1, models: 2, enabled_model_routes: 2, offers: 1, ready_offers: 0 };
  expect(supplierAvailability({ ...configured }).label).toBe('Not ready');
  expect(supplierAvailability({ ...configured, ready_offers: 1 }).label).toBe('Ready to supply');
  expect(supplierAvailability({ ...configured, ready_offers: undefined }).label).toBe('Status unavailable');
});


it('refreshes missing readiness data instead of sending users to edit offers', async () => {
  vi.mocked(request).mockResolvedValueOnce({ data: [{ id: 'supplier', name: 'Provider', api_keys: 1, models: 2 }] });
  render(<MemoryRouter><ProviderList /></MemoryRouter>);
  await screen.findByText('Status unavailable');
  vi.mocked(request).mockResolvedValue({ data: [{ id: 'supplier', name: 'Provider', api_keys: 1, models: 2, enabled_api_keys: 1, enabled_model_routes: 2, offers: 2, ready_offers: 0 }] });
  await userEvent.setup().click(screen.getAllByRole('button', { name: 'Refresh status' })[0]);
  await screen.findByText('Not ready');
  expect(screen.queryByText('Status unavailable')).toBeNull();
});

it('does not require commercial authorization for administrator-managed internal models', async () => {
  const { providerAvailability } = await import('@/features/providers/provider-setup');
  expect(providerAvailability({api_keys:1,internal_api_keys:1,internal_model_routes:2})).toMatchObject({label:'Models configured',section:'models',usable:false});
  expect(providerAvailability({api_keys:1,internal_api_keys:1,internal_model_routes:0})).toMatchObject({label:'API key saved',action:'Import models',section:'models'});
});

it('uses backend connection instructions rather than a bundled endpoint list', async () => {
  vi.mocked(request).mockImplementation(async (_token,path) => ({data:path.endsWith('/presets') ? [{id:'deepseek',name:'DeepSeek',protocol:'openai',api_base:'https://api.deepseek.com/v1',website:'https://platform.deepseek.com/api_keys',price_support:'official_catalog_unqualified',price_source:'https://api-docs.deepseek.com/quick_start/pricing/'}] : []}));
  render(<MemoryRouter><ProviderList/></MemoryRouter>);
  const user=userEvent.setup();await user.click(await screen.findByRole('button',{name:'Connect DeepSeek'}));
  await user.click(screen.getByText('Connection settings'));
  expect((screen.getByLabelText('API base URL') as HTMLInputElement).value).toBe('https://api.deepseek.com/v1');
  expect(screen.queryByRole('button',{name:'Connect OpenRouter'})).toBeNull();
});

it('presents Provider identity and actions without exposing preset endpoints in the directory', async () => {
  vi.mocked(request).mockImplementation(async (_token, path) => ({ data: path.endsWith('/presets')
    ? [{ id: 'deepseek', name: 'DeepSeek', protocol: 'openai', api_base: 'https://api.deepseek.com/v1', website: 'https://platform.deepseek.com/api_keys' }]
    : [{ id: 'connected', name: 'Connected Provider', members: 0, api_keys: 1, internal_api_keys: 1, internal_model_routes: 1 }] }));
  render(<MemoryRouter><ProviderList /></MemoryRouter>);
  expect(await screen.findByRole('link', { name: 'Connected Provider' })).toBeTruthy();
  expect(await screen.findByRole('button', { name: 'Connect DeepSeek' })).toBeTruthy();
  expect(screen.queryByText('https://api.deepseek.com/v1')).toBeNull();
  expect(screen.queryByRole('table')).toBeNull();
  expect(screen.getByRole('link', { name: 'Manage models' })).toBeTruthy();
});

it('replaces Connect with an Open Provider link when a preset is already configured', async () => {
  vi.mocked(request).mockImplementation(async (_token, path) => ({ data: path.endsWith('/presets')
    ? [
        { id: 'openrouter', name: 'OpenRouter', protocol: 'openai', api_base: 'https://openrouter.ai/api/v1', website: 'https://openrouter.ai/keys' },
        { id: 'deepseek', name: 'DeepSeek', protocol: 'openai', api_base: 'https://api.deepseek.com/v1', website: 'https://platform.deepseek.com/api_keys' },
      ]
    : [{ id: 'prov-or', slug: 'openrouter', name: 'OpenRouter', members: 0, api_keys: 1, internal_api_keys: 1, internal_model_routes: 12 }] }));
  render(<MemoryRouter><ProviderList /></MemoryRouter>);
  const availableList = await screen.findByRole('list', { name: 'Available Providers' });
  expect(within(availableList).getByText('Configured')).toBeTruthy();
  const openLink = within(availableList).getByRole('link', { name: 'Open OpenRouter' });
  expect(openLink.getAttribute('href')).toBe('/admin/providers/openrouter');
  expect(within(availableList).queryByRole('button', { name: 'Connect OpenRouter' })).toBeNull();
  expect(within(availableList).getByRole('button', { name: 'Connect DeepSeek' })).toBeTruthy();
});
