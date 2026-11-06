import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { render as renderView, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AdminSession } from '../../../../app/shell/dashboard-context';
import ModelMappingForm from '../../../../app/features/providers/components/ModelMappingForm';
import ProvidersView from '../../../../app/features/providers/components/ProvidersView';
import type { ProviderConnection } from '../../../../app/features/providers/api';

const render = (ui: Parameters<typeof renderView>[0]) => renderView(ui, { wrapper: MemoryRouter });

const installationSession: AdminSession = {
  kind: 'installation',
  operator: null,
  permissions: { read: true, write: true, manage_operators: true },
};

const scopedOwnerSession: AdminSession = {
  kind: 'operator',
  operator: { id: 'operator-1', role: 'owner', organization_id: 'org-1', project_id: null },
  permissions: { read: true, write: true, manage_operators: true },
};

const openRouter: ProviderConnection = {
  id: 'vendor-openrouter',
  name: 'OpenRouter primary',
  adapter: 'openrouter',
  api_base: 'https://openrouter.ai/api/v1',
  enabled: true,
  revision: 1,
  has_credential: true,
};

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

function stubVendorApi({ existing = [] }: { existing?: ProviderConnection[] } = {}) {
  const vendors = [...existing];
  const calls: Array<{ path: string; method: string; body?: Record<string, unknown>; signal?: AbortSignal }> = [];
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const path = String(input);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : undefined;
    calls.push({ path, method, body, signal: init?.signal ?? undefined });

    if (path === '/api/v1/providers' && method === 'GET') return jsonResponse({ data: [{ id: 'supplier-one', name: 'Existing business' }] });
    if ((path === '/api/v1/vendors' || path.startsWith('/api/v1/vendors?supplier=')) && method === 'GET') return jsonResponse({ data: vendors });
    if (path === '/api/v1/vendors' && method === 'POST') {
      const created = { ...openRouter, id: 'vendor-' + (vendors.length + 1), name: String(body?.name), supplier: body?.supplier_id ? { id: String(body.supplier_id), name: 'Existing business' } : { id: 'supplier-created', name: String(body?.name) }, adapter: body?.adapter as ProviderConnection['adapter'], api_base: String(body?.api_base), revision: 1, enabled: true, has_credential: Boolean(body?.api_key) };
      vendors.push(created);
      return jsonResponse({ data: created }, 201);
    }
    if (path.startsWith('/api/v1/vendors/') && method === 'PUT') {
      const vendorId = path.split('/')[4];
      const index = vendors.findIndex(vendor => vendor.id === vendorId);
      if (index < 0) return jsonResponse({ error: { message: 'Vendor not found' } }, 404);
      const previous = vendors[index];
      const updated: ProviderConnection = {
        ...previous,
        name: String(body?.name),
        api_base: String(body?.api_base),
        enabled: Boolean(body?.enabled),
        revision: previous.revision + 1,
        has_credential: previous.has_credential || Boolean(body?.api_key),
      };
      vendors[index] = updated;
      return jsonResponse({ data: updated });
    }
    return jsonResponse({ error: { message: `Not found: ${method} ${path}` } }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

async function openNewKeyDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click((await screen.findAllByRole('button', { name: 'Add provider' }))[0]);
  return screen.findByRole('dialog');
}

describe('provider API key administration workflow', () => {
  it('searches the Provider catalog and fills a mapping through the standard choice menu', async () => {
    const user = userEvent.setup();
    render(<ModelMappingForm model={null} catalog={[
      {id:'provider/first',name:'First model',context_length:null},
      {id:'provider/second',name:'Second model',context_length:null},
    ]} catalogLoading={false} catalogError="" disabled={false} onCancel={() => {}} onSave={async () => {}} />);
    await user.click(screen.getByLabelText('Upstream model'));
    await user.type(screen.getByRole('textbox', {name:'Search provider models'}), 'Second');
    expect(screen.queryByRole('menuitemradio', {name:/First model/})).toBeNull();
    await user.click(screen.getByRole('menuitemradio', {name:/Second model/}));
    expect((screen.getByLabelText('Niu model alias') as HTMLInputElement).value).toBe('provider/second');
    expect(screen.getByLabelText('Upstream model').textContent).toContain('provider/second');
    expect(screen.queryByRole('menu')).toBeNull();
    await user.clear(screen.getByLabelText('Niu model alias'));
    await user.type(screen.getByLabelText('Niu model alias'), 'team/custom');
    await user.click(screen.getByLabelText('Upstream model'));
    await user.type(screen.getByRole('textbox', {name:'Search provider models'}), 'First');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(screen.getByLabelText('Upstream model').textContent).toContain('provider/first');
    expect((screen.getByLabelText('Niu model alias') as HTMLInputElement).value).toBe('team/custom');
  });

  it('clears the previous model facts when the upstream mapping changes', async () => {
    const user=userEvent.setup();
    const saved=vi.fn(async (_input: import('@/features/providers/api').ModelWrite)=>{});
    render(<ModelMappingForm model={null} catalog={[{id:'provider/first',name:'First model',context_length:128000,
      catalog:{name:'First model',description:'First model description',context_length:128000,input_price:'0.000001'}}]}
      catalogLoading={false} catalogError="" disabled={false} onCancel={()=>{}} onSave={saved}/>);
    await user.click(screen.getByLabelText('Upstream model'));
    await user.click(screen.getByRole('menuitemradio',{name:/First model/}));
    await user.click(screen.getByLabelText('Upstream model'));
    await user.type(screen.getByRole('textbox', {name:'Search provider models'}), 'provider/different');
    await user.click(screen.getByRole('menuitem',{name:'Use model ID “provider/different”'}));
    await user.click(screen.getByRole('button',{name:'Add model',exact:true}));
    expect(saved).toHaveBeenCalledTimes(1);
    const input=saved.mock.calls[0][0];
    expect(input.upstream_model).toBe('provider/different');
    expect(input.capabilities.catalog).toBeUndefined();
  });

  it('keeps the keys surface focused on credentials and links to the canonical Models view', async () => {
    const api = stubVendorApi({ existing: [openRouter] });
    renderView(<MemoryRouter initialEntries={['/providers?supplier=openrouter-primary']}><ProvidersView token="installation-token" session={installationSession} refreshWorkspace={async () => {}} providerSlug="openrouter-primary" /></MemoryRouter>);
    await screen.findByRole('heading', { name: openRouter.name });
    expect(screen.getByRole('heading', { name: 'API keys' })).toBeTruthy();
    expect(screen.getByText(/Manage upstream API keys, request limits and cooldowns/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Models' }).getAttribute('href')).toBe('/admin/providers/openrouter-primary/models');
    expect(screen.queryByRole('button', { name: 'Import models' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Model routes/ })).toBeNull();
    expect(api.calls.some(call => call.path.endsWith('/models') || call.path.endsWith('/check') || call.path.endsWith('/catalog'))).toBe(false);
  });

  it('denies scoped owners before requesting any installation vendor data', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    render(<ProvidersView token="scoped-token" session={scopedOwnerSession} refreshWorkspace={async () => {}} />);

    expect(screen.getByRole('heading', { name: 'Platform administrator access required' })).toBeTruthy();
    expect(screen.getByText(/does not have permission to manage Providers/)).toBeTruthy();
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
  });

  it('creates a provider API key and stays on the credential surface', async () => {
    const api = stubVendorApi();
    const user = userEvent.setup();
    const refreshWorkspace = vi.fn(async () => {});
    render(<ProvidersView token="installation-token" session={installationSession} refreshWorkspace={refreshWorkspace} />);

    const dialog = await openNewKeyDialog(user);
    await user.type(within(dialog).getByLabelText('Provider name'), 'OpenRouter primary');
    expect(within(dialog).getByLabelText('API format').textContent).toBe('OpenRouter API');
    expect((within(dialog).getByLabelText('API base URL') as HTMLInputElement).value).toBe('https://openrouter.ai/api/v1');
    await user.type(within(dialog).getByLabelText('Provider API key'), 'vendor-secret-once');
    await user.click(within(dialog).getByRole('button', { name: 'Create provider' }));

    expect(await screen.findByRole('heading', { name: 'OpenRouter primary' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'OpenRouter primary routes' })).toBeNull();
    const createVendor = api.calls.find(call => call.path === '/api/v1/vendors' && call.method === 'POST');
    expect(createVendor?.body).toEqual({
      name: 'OpenRouter primary',
      adapter: 'openrouter',
      api_base: 'https://openrouter.ai/api/v1',
      api_key: 'vendor-secret-once',
      enabled: true,
      create_supplier: true,
    });
    expect(refreshWorkspace).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('Replace provider API key (optional)')).toBeNull();
    expect(localStorage.length).toBe(0);
    expect(api.calls.some(call => call.path.endsWith('/models'))).toBe(false);
  });

  it('rotates the credential and confirms disabling', async () => {
    const api = stubVendorApi({ existing: [openRouter] });
    const user = userEvent.setup();
    const refreshWorkspace = vi.fn(async () => {});
    render(<ProvidersView token="installation-token" session={installationSession} refreshWorkspace={refreshWorkspace} />);

    await screen.findByRole('heading', { name: openRouter.name });
    await user.click(screen.getByRole('button', { name: 'Edit API key' }));
    await user.type(screen.getByLabelText('Replace provider API key (optional)'), 'vendor-secret-rotation');
    await user.click(screen.getByRole('checkbox', { name: /Enabled for inference/ }));
    await user.click(screen.getByRole('button', { name: 'Review disable' }));
    expect(await screen.findByRole('alertdialog', { name: 'Disable this API key?' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Confirm disable' }));

    const updateVendor = api.calls.find(call => call.path === '/api/v1/vendors/vendor-openrouter' && call.method === 'PUT');
    expect(updateVendor?.body).toMatchObject({
      name: 'OpenRouter primary',
      api_base: 'https://openrouter.ai/api/v1',
      enabled: false,
      api_key: 'vendor-secret-rotation',
      expected_revision: 1,
    });
    expect(refreshWorkspace).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(localStorage.length).toBe(0);
  }, 20_000);

  it('adds an independently named key to an existing Provider without creating a business', async () => {
    const api = stubVendorApi({ existing: [openRouter] });
    const user = userEvent.setup();
    render(<ProvidersView token="installation-token" session={installationSession} refreshWorkspace={async () => {}} />);
    await screen.findByRole('heading', { name: openRouter.name });
    await user.click(screen.getByRole('button', { name: 'Add provider' }));
    await waitFor(() => expect(screen.getByLabelText('Provider').hasAttribute('disabled')).toBe(false));
    await user.click(screen.getByLabelText('Provider'));
    await user.click(screen.getByRole('menuitemradio', { name: 'Existing business' }));
    await user.type(screen.getByLabelText('API key name'), 'Specialized models');
    await user.type(screen.getByLabelText('Provider API key'), 'independent-secret');
    await user.click(screen.getByRole('button', { name: 'Add API key' }));
    expect(await screen.findByRole('heading', { name: 'Specialized models' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Select Provider API key' }).textContent).toContain('Specialized models');
    const creation = api.calls.find(call => call.method === 'POST' && call.path === '/api/v1/vendors');
    expect(creation?.body).toMatchObject({ supplier_id: 'supplier-one', name: 'Specialized models', api_key: 'independent-secret' });
    expect(creation?.body).not.toHaveProperty('create_supplier');
    expect(api.calls.some(call => call.method === 'PUT')).toBe(false);
    expect(localStorage.length).toBe(0);
  });

  it('closes the form after a committed key even when ownership discovery fails', async () => {
    const api = stubVendorApi({ existing: [openRouter] });
    const original = api.fetchMock.getMockImplementation()!;
    let created = false;
    api.fetchMock.mockImplementation(async (input, init) => {
      if (created && String(input) === '/api/v1/vendors' && (init?.method ?? 'GET') === 'GET') {
        return jsonResponse({ error: { message: 'Temporarily unavailable' } }, 503);
      }
      const response = await original(input, init);
      if (String(input) === '/api/v1/vendors' && init?.method === 'POST') created = true;
      return response;
    });
    const user = userEvent.setup();
    render(<ProvidersView token="installation-token" session={installationSession} refreshWorkspace={async () => {}} />);
    await screen.findByRole('heading', { name: openRouter.name });
    await user.click(screen.getByRole('button', { name: 'Add provider' }));
    await user.type(screen.getByLabelText('Provider name'), 'Saved Provider');
    await user.type(screen.getByLabelText('Provider API key'), 'saved-secret');
    await user.click(screen.getByRole('button', { name: 'Create provider' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('API key saved'));
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(api.calls.filter(call => call.method === 'POST' && call.path === '/api/v1/vendors')).toHaveLength(1);
  });

  it.each(['transport', 'server', 'malformed'])('reconciles an uncertain %s creation through reads without reposting', async failure => {
    const api = stubVendorApi({ existing: [openRouter] });
    const original = api.fetchMock.getMockImplementation()!;
    api.fetchMock.mockImplementation(async (input, init) => {
      const response = await original(input, init);
      if (String(input) === '/api/v1/vendors' && init?.method === 'POST') {
        if (failure === 'transport') throw new TypeError('Connection lost');
        if (failure === 'server') return jsonResponse({ error: { message: 'Unavailable' } }, 503);
        return jsonResponse({ data: null }, 201);
      }
      return response;
    });
    const user = userEvent.setup();
    render(<ProvidersView token="installation-token" session={installationSession} refreshWorkspace={async () => {}} />);
    await screen.findByRole('heading', { name: openRouter.name });
    await user.click(screen.getByRole('button', { name: 'Add provider' }));
    await user.type(screen.getByLabelText('Provider name'), 'Possibly saved Provider');
    await user.type(screen.getByLabelText('Provider API key'), 'test-secret');
    await user.click(screen.getByRole('button', { name: 'Create provider' }));
    expect(await screen.findByText(/API key creation could not be confirmed/)).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByLabelText('Provider API key')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await user.click(await screen.findByRole('button', { name: 'Select Provider API key' }));
    expect(await screen.findByRole('menuitemradio', { name: /Possibly saved Provider/ })).toBeTruthy();
    expect(api.calls.filter(call => call.method === 'POST' && call.path === '/api/v1/vendors')).toHaveLength(1);
    expect(localStorage.length).toBe(0);
  });

  it('switches between API keys grouped under one Provider', async () => {
    const first = { ...openRouter, name: 'General key', supplier: { id: 'business-one', name: 'Shared business' } };
    const second = { ...first, id: 'restricted-key', name: 'Restricted key', enabled: false };
    stubVendorApi({ existing: [first, second] });
    const user = userEvent.setup();
    render(<ProvidersView token="installation-token" session={installationSession} refreshWorkspace={async () => {}} />);
    expect(await screen.findByRole('heading', { name: 'General key' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Select Provider API key' }));
    expect(screen.getByRole('menuitemradio', { name: 'General key' }).getAttribute('aria-checked')).toBe('true');
    await user.click(screen.getByRole('menuitemradio', { name: 'Restricted key · Disabled' }));
    expect(await screen.findByRole('heading', { name: 'Restricted key' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Select Provider API key' }));
    expect(screen.getByRole('menuitemradio', { name: 'Restricted key · Disabled' }).getAttribute('aria-checked')).toBe('true');
    await user.keyboard('{Escape}');
    expect(screen.queryByText('business-one')).toBeNull();
  });

  it('adds another vendor from the populated directory', async () => {
    const api = stubVendorApi({ existing: [openRouter] });
    const user = userEvent.setup();
    render(<ProvidersView token="installation-token" session={installationSession} refreshWorkspace={async () => {}} />);

    await screen.findByRole('heading', { name: openRouter.name });
    await user.click(screen.getByRole('button', { name: 'Add provider' }));
    await user.type(screen.getByLabelText('Provider name'), 'OpenAI fallback');
    await user.click(screen.getByLabelText('API format'));
    await user.click(screen.getByRole('menuitemradio', { name: 'OpenAI-compatible API' }));
    await user.type(screen.getByLabelText('Provider API key'), 'second-vendor-key');
    await user.click(screen.getByRole('button', { name: 'Create provider' }));

    expect(await screen.findByRole('heading', { name: 'OpenAI fallback' })).toBeTruthy();
    expect(screen.getByText('https://api.openai.com/v1')).toBeTruthy();
    expect(api.calls.find(call => call.path === '/api/v1/vendors' && call.method === 'POST')?.body).toMatchObject({
      name: 'OpenAI fallback',
      adapter: 'openai',
      api_base: 'https://api.openai.com/v1',
      api_key: 'second-vendor-key',
      enabled: true,
    });
  });

  it('keeps a rejected vendor credential update visible for correction and retry', async () => {
    const api = stubVendorApi({ existing: [openRouter] });
    api.fetchMock.mockImplementation(async (input, init) => {
      const path = String(input);
      const method = init?.method ?? 'GET';
      if (path === `/api/v1/vendors/${openRouter.id}` && method === 'PUT') {
        return jsonResponse({ error: { message: 'Vendor revision conflict' } }, 409);
      }
      if (path === '/api/v1/vendors') return jsonResponse({ data: [openRouter] });
      return jsonResponse({ error: { message: 'Not found' } }, 404);
    });
    const user = userEvent.setup();
    render(<ProvidersView token="installation-token" session={installationSession} refreshWorkspace={async () => {}} />);

    await user.click(await screen.findByRole('button', { name: 'Edit API key' }));
    await user.type(screen.getByLabelText('Replace provider API key (optional)'), 'retry-this-credential');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText(/This record changed in another session/)).toBeTruthy();
    expect((screen.getByLabelText('Replace provider API key (optional)') as HTMLInputElement).value).toBe('retry-this-credential');
  });

  it('clears an unsaved credential draft when the session changes away from installation access', async () => {
    stubVendorApi({ existing: [openRouter] });
    const user = userEvent.setup();
    const view = render(<ProvidersView token="installation-token" session={installationSession} refreshWorkspace={async () => {}} />);

    await user.click(await screen.findByRole('button', { name: 'Edit API key' }));
    const credential = await screen.findByLabelText('Replace provider API key (optional)');
    await user.type(credential, 'temporary-draft-only');
    view.rerender(<ProvidersView token="installation-token" session={scopedOwnerSession} refreshWorkspace={async () => {}} />);
    expect(screen.getByRole('heading', { name: 'Platform administrator access required' })).toBeTruthy();

    view.rerender(<ProvidersView token="installation-token" session={installationSession} refreshWorkspace={async () => {}} />);
    await user.click(await screen.findByRole('button', { name: 'Edit API key' }));
    const resetInput = await screen.findByLabelText('Replace provider API key (optional)') as HTMLInputElement;
    expect(resetInput.value).toBe('');
  });

  it('reads explicitly linked configurations when returning from Provider pricing', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input); calls.push(path);
      if (path === '/api/v1/vendors?supplier=business-fixture') return jsonResponse({ data: [openRouter] });
      if (path.startsWith('/api/v1/vendors/') && path.endsWith('/request-rate-limit')) return jsonResponse({ data: { requests_per_minute: null, revision: '0' } });
      if (path.startsWith('/api/v1/vendors/') && path.endsWith('/cooldown')) return jsonResponse({ data: { policy_revision: 'openrouter-auth-cooldown-v1', failure_threshold: 3, window_seconds: 60, cooldown_seconds: 60, active: false, qualifying_failures: 0, cooldown_until: null } });
      return jsonResponse({ error: { message: 'Unexpected unscoped read' } }, 400);
    }));
    renderView(<MemoryRouter initialEntries={['/providers?supplier=business-fixture']}><ProvidersView token="test-token" session={installationSession} refreshWorkspace={vi.fn()} /></MemoryRouter>);
    await screen.findByRole('heading', { name: openRouter.name });
    expect(calls).toContain('/api/v1/vendors?supplier=business-fixture');
    expect(calls).not.toContain('/api/v1/vendors');
    expect(screen.getByRole('heading', { name: 'API keys' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add provider' })).toBeNull();
  });
});
