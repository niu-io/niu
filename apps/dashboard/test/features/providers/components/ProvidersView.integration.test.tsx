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

    if (path === '/api/v1/admin/providers' && method === 'GET') return jsonResponse({ data: [{ id: 'supplier-one', name: 'Existing business' }] });
    if ((path === '/api/v1/admin/providers/connections' || path.startsWith('/api/v1/admin/providers/connections?supplier=')) && method === 'GET') return jsonResponse({ data: vendors });
    if (path === '/api/v1/admin/providers/connections' && method === 'POST') {
      const created = { ...openRouter, id: 'vendor-' + (vendors.length + 1), name: String(body?.name), supplier: body?.supplier_id ? { id: String(body.supplier_id), name: 'Existing business' } : { id: 'supplier-created', name: String(body?.name) }, adapter: body?.adapter as ProviderConnection['adapter'], api_base: String(body?.api_base), revision: 1, enabled: true, has_credential: Boolean(body?.api_key) };
      vendors.push(created);
      return jsonResponse({ data: created }, 201);
    }
    if (path.startsWith('/api/v1/admin/providers/connections/') && method === 'PUT') {
      const vendorId = path.slice('/api/v1/admin/providers/connections/'.length).split('/')[0];
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

  it('keeps the keys surface focused on credentials and opens rate limit & cooldown in a dedicated dialog without inline details', async () => {
    const api = stubVendorApi({ existing: [openRouter] });
    const origImpl = api.fetchMock.getMockImplementation()!;
    api.fetchMock.mockImplementation(async (input, init) => {
      const path = String(input);
      if (path.endsWith('/request-rate-limit')) return jsonResponse({ data: { requests_per_minute: null, revision: '0' } });
      if (path.endsWith('/cooldown')) return jsonResponse({ data: { policy_revision: 'openrouter-auth-cooldown-v1', failure_threshold: 3, window_seconds: 60, cooldown_seconds: 60, active: false, qualifying_failures: 0, cooldown_until: null } });
      return origImpl(input, init);
    });
    const user = userEvent.setup();
    const { container } = renderView(<MemoryRouter initialEntries={['/providers?supplier=openrouter-primary']}><ProvidersView token="installation-token" session={installationSession} refreshWorkspace={async () => {}} providerSlug="openrouter-primary" /></MemoryRouter>);
    await screen.findByRole('heading', { name: openRouter.name });
    expect(screen.getByRole('heading', { name: 'API keys' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Select models' }).getAttribute('href')).toBe('/admin/providers/openrouter-primary');
    expect(container.querySelector('details')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Import models' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Model routes/ })).toBeNull();
    expect(api.calls.some(call => call.path.endsWith('/models') || call.path.endsWith('/check') || call.path.endsWith('/catalog'))).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Rate limit & cooldown' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Unlimited')).toBeTruthy();
    expect(await within(dialog).findByText('No active cooldown')).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Edit limit' }));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(within(dialog).getByLabelText('Limit')).toBeTruthy();
  });

  it('enables a disabled API key in one click and prompts for a new key when credential was erased', async () => {
    const disabledWithKey = { ...openRouter, id: 'vendor-disabled', name: 'BabelArk key', enabled: false, has_credential: true };
    const erasedKey = { ...openRouter, id: 'vendor-erased', name: 'Disconnected key', enabled: false, has_credential: false };
    const api = stubVendorApi({ existing: [disabledWithKey, erasedKey] });
    const user = userEvent.setup();
    renderView(<MemoryRouter initialEntries={['/providers?supplier=babelark']}><ProvidersView token="installation-token" session={installationSession} refreshWorkspace={async () => {}} providerSlug="babelark" /></MemoryRouter>);

    await screen.findByRole('heading', { name: 'BabelArk key' });
    await user.click(screen.getByRole('button', { name: 'Enable API key' }));
    await waitFor(() => {
      const enableCall = api.calls.find(c => c.path === '/api/v1/admin/providers/connections/vendor-disabled' && c.method === 'PUT');
      expect(enableCall?.body).toMatchObject({ enabled: true, expected_revision: 1 });
    });

    await user.click(screen.getByRole('button', { name: 'Enter API key & enable' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Provider API key'), 'fresh-secret-key');
    await user.click(within(dialog).getByRole('button', { name: 'Save & enable' }));
    await waitFor(() => {
      const reconnectCall = api.calls.find(c => c.path === '/api/v1/admin/providers/connections/vendor-erased' && c.method === 'PUT');
      expect(reconnectCall?.body).toMatchObject({ enabled: true, api_key: 'fresh-secret-key', expected_revision: 1 });
    });
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
    await user.type(within(dialog).getByLabelText('Provider name'), 'OpenAI primary');
    expect(within(dialog).getByLabelText('API format').textContent).toBe('OpenAI-compatible API');
    expect((within(dialog).getByLabelText('API base URL') as HTMLInputElement).value).toBe('https://api.openai.com/v1');
    await user.type(within(dialog).getByLabelText('Provider API key'), 'vendor-secret-once');
    await user.click(within(dialog).getByRole('button', { name: 'Create provider' }));

    expect(await screen.findByRole('heading', { name: 'OpenAI primary' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'OpenAI primary routes' })).toBeNull();
    const createVendor = api.calls.find(call => call.path === '/api/v1/admin/providers/connections' && call.method === 'POST');
    expect(createVendor?.body).toEqual({
      name: 'OpenAI primary',
      adapter: 'openai',
      api_base: 'https://api.openai.com/v1',
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
    await user.click(screen.getByRole('button', { name: 'Edit key' }));
    await user.type(screen.getByLabelText('Replace provider API key (optional)'), 'vendor-secret-rotation');
    await user.click(screen.getByRole('checkbox', { name: /Enabled for inference/ }));
    await user.click(screen.getByRole('button', { name: 'Review disable' }));
    expect(await screen.findByRole('alertdialog', { name: 'Disable this API key?' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Confirm disable' }));

    const updateVendor = api.calls.find(call => call.path === '/api/v1/admin/providers/connections/vendor-openrouter' && call.method === 'PUT');
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
    const creation = api.calls.find(call => call.method === 'POST' && call.path === '/api/v1/admin/providers/connections');
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
      if (created && String(input) === '/api/v1/admin/providers/connections' && (init?.method ?? 'GET') === 'GET') {
        return jsonResponse({ error: { message: 'Temporarily unavailable' } }, 503);
      }
      const response = await original(input, init);
      if (String(input) === '/api/v1/admin/providers/connections' && init?.method === 'POST') created = true;
      return response;
    });
    const user = userEvent.setup();
    render(<ProvidersView token="installation-token" session={installationSession} refreshWorkspace={async () => {}} />);
    await screen.findByRole('heading', { name: openRouter.name });
    await user.click(screen.getByRole('button', { name: 'Add provider' }));
    await user.type(screen.getByLabelText('Provider name'), 'Saved Provider');
    await user.type(screen.getByLabelText('Provider API key'), 'saved-secret');
    await user.click(screen.getByRole('button', { name: 'Create provider' }));
    expect(await screen.findByText(/API key saved/)).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(api.calls.filter(call => call.method === 'POST' && call.path === '/api/v1/admin/providers/connections')).toHaveLength(1);
  });

  it.each(['transport', 'server', 'malformed'])('reconciles an uncertain %s creation through reads without reposting', async failure => {
    const api = stubVendorApi({ existing: [openRouter] });
    const original = api.fetchMock.getMockImplementation()!;
    api.fetchMock.mockImplementation(async (input, init) => {
      const response = await original(input, init);
      if (String(input) === '/api/v1/admin/providers/connections' && init?.method === 'POST') {
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
    expect(await screen.findByRole('heading', { name: 'Possibly saved Provider' })).toBeTruthy();
    expect(api.calls.filter(call => call.method === 'POST' && call.path === '/api/v1/admin/providers/connections')).toHaveLength(1);
    expect(localStorage.length).toBe(0);
  });

  it('lists all API keys directly under one Provider with individual status and actions', async () => {
    const first = { ...openRouter, name: 'General key', supplier: { id: 'business-one', name: 'Shared business' } };
    const second = { ...first, id: 'restricted-key', name: 'Restricted key', enabled: false };
    stubVendorApi({ existing: [first, second] });
    render(<ProvidersView token="installation-token" session={installationSession} refreshWorkspace={async () => {}} />);
    expect(await screen.findByRole('heading', { name: 'General key' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Restricted key' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enable API key' })).toBeTruthy();
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
    expect(api.calls.find(call => call.path === '/api/v1/admin/providers/connections' && call.method === 'POST')?.body).toMatchObject({
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
      if (path === `/api/v1/admin/providers/connections/${openRouter.id}` && method === 'PUT') {
        return jsonResponse({ error: { message: 'Vendor revision conflict' } }, 409);
      }
      if (path === '/api/v1/admin/providers/connections') return jsonResponse({ data: [openRouter] });
      return jsonResponse({ error: { message: 'Not found' } }, 404);
    });
    const user = userEvent.setup();
    render(<ProvidersView token="installation-token" session={installationSession} refreshWorkspace={async () => {}} />);

    await user.click(await screen.findByRole('button', { name: 'Edit key' }));
    await user.type(screen.getByLabelText('Replace provider API key (optional)'), 'retry-this-credential');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText(/This record changed in another session/)).toBeTruthy();
    expect((screen.getByLabelText('Replace provider API key (optional)') as HTMLInputElement).value).toBe('retry-this-credential');
  });

  it('clears an unsaved credential draft when the session changes away from installation access', async () => {
    stubVendorApi({ existing: [openRouter] });
    const user = userEvent.setup();
    const view = render(<ProvidersView token="installation-token" session={installationSession} refreshWorkspace={async () => {}} />);

    await user.click(await screen.findByRole('button', { name: 'Edit key' }));
    const credential = await screen.findByLabelText('Replace provider API key (optional)');
    await user.type(credential, 'temporary-draft-only');
    view.rerender(<ProvidersView token="installation-token" session={scopedOwnerSession} refreshWorkspace={async () => {}} />);
    expect(screen.getByRole('heading', { name: 'Platform administrator access required' })).toBeTruthy();

    view.rerender(<ProvidersView token="installation-token" session={installationSession} refreshWorkspace={async () => {}} />);
    await user.click(await screen.findByRole('button', { name: 'Edit key' }));
    const resetInput = await screen.findByLabelText('Replace provider API key (optional)') as HTMLInputElement;
    expect(resetInput.value).toBe('');
  });

  it('reads explicitly linked configurations when returning from Provider pricing', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input); calls.push(path);
      if (path === '/api/v1/admin/providers/connections?supplier=business-fixture') return jsonResponse({ data: [openRouter] });
      if (path.startsWith('/api/v1/admin/providers/connections/') && path.endsWith('/request-rate-limit')) return jsonResponse({ data: { requests_per_minute: null, revision: '0' } });
      if (path.startsWith('/api/v1/admin/providers/connections/') && path.endsWith('/cooldown')) return jsonResponse({ data: { policy_revision: 'openrouter-auth-cooldown-v1', failure_threshold: 3, window_seconds: 60, cooldown_seconds: 60, active: false, qualifying_failures: 0, cooldown_until: null } });
      return jsonResponse({ error: { message: 'Unexpected unscoped read' } }, 400);
    }));
    renderView(<MemoryRouter initialEntries={['/providers?supplier=business-fixture']}><ProvidersView token="test-token" session={installationSession} refreshWorkspace={vi.fn()} /></MemoryRouter>);
    await screen.findByRole('heading', { name: openRouter.name });
    expect(calls).toContain('/api/v1/admin/providers/connections?supplier=business-fixture');
    expect(calls).not.toContain('/api/v1/admin/providers/connections');
    expect(screen.getByRole('heading', { name: 'API keys' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add provider' })).toBeNull();
  });

  it('scopes ModelMappingForm protocol capabilities by adapter and enforces dependencies', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => {});
    const { rerender } = render(
      <ModelMappingForm
        adapter="gemini"
        model={null}
        catalog={[]}
        catalogLoading={false}
        catalogError=""
        disabled={false}
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );
    expect(screen.getByText('Gemini API')).toBeTruthy();
    expect(screen.getByText('Gemini streaming')).toBeTruthy();
    expect(screen.queryByText('Messages API')).toBeNull();
    expect(screen.queryByText('Responses API')).toBeNull();
    expect(screen.queryByText('Embeddings')).toBeNull();

    await user.click(screen.getByLabelText('Niu model alias'));
    await user.type(screen.getByLabelText('Niu model alias'), 'google/gemini-2.5-flash');
    await user.click(screen.getByLabelText('Upstream model'));
    await user.type(screen.getByRole('textbox', { name: 'Search provider models' }), 'gemini-2.5-flash');
    await user.click(screen.getByRole('menuitem', { name: /Use model ID “/i }));

    const geminiStreaming = screen.getByRole('checkbox', { name: /Gemini streaming/i });
    expect((geminiStreaming as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getByRole('checkbox', { name: /Gemini API/i }));
    expect((screen.getByRole('checkbox', { name: /Gemini streaming/i }) as HTMLButtonElement).disabled).toBe(false);
    await user.click(screen.getByRole('checkbox', { name: /Gemini streaming/i }));
    await user.click(screen.getByRole('checkbox', { name: /Function tools/i }));
    await user.click(screen.getByRole('checkbox', { name: /Streaming tools/i }));
    expect(screen.getByRole('checkbox', { name: /Streaming tools/i }).getAttribute('data-state')).toBe('checked');

    await user.click(screen.getByRole('checkbox', { name: /Gemini API/i }));
    expect(screen.getByRole('checkbox', { name: /Gemini streaming/i }).getAttribute('data-state')).toBe('unchecked');
    expect(screen.getByRole('checkbox', { name: /Function tools/i }).getAttribute('data-state')).toBe('unchecked');
    expect(screen.getByRole('checkbox', { name: /Streaming tools/i }).getAttribute('data-state')).toBe('unchecked');

    await user.click(screen.getByRole('checkbox', { name: /Gemini API/i }));
    await user.click(screen.getByRole('checkbox', { name: /Gemini streaming/i }));
    await user.click(screen.getByRole('checkbox', { name: /Function tools/i }));
    await user.click(screen.getByRole('checkbox', { name: /Streaming tools/i }));
    await user.click(screen.getByRole('button', { name: 'Add model', exact: true }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect((onSave.mock.calls[0][0] as { capabilities: Record<string, unknown> }).capabilities).toMatchObject({
      supports_generate_content: true,
      supports_generate_content_streaming: true,
      supports_tool_calls: true,
      supports_streaming_tool_calls: true,
    });

    rerender(
      <ModelMappingForm
        adapter="anthropic"
        model={null}
        catalog={[]}
        catalogLoading={false}
        catalogError=""
        disabled={false}
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );
    expect(screen.getByText('Messages API')).toBeTruthy();
    expect(screen.getByText('Messages streaming tools')).toBeTruthy();
    expect(screen.queryByText('Gemini API')).toBeNull();
  });

  it('shows pooled status badge and pool-aware disable/disconnect warnings when sibling keys share an endpoint', async () => {
    const providerRef = { id: 'prov-pool', name: 'DeepSeek Pool' };
    const key1 = {
      ...openRouter,
      id: 'key-1',
      name: 'DeepSeek Primary',
      adapter: 'openai' as const,
      api_base: 'https://api.deepseek.com/v1',
      supplier: providerRef,
    };
    const key2 = {
      ...openRouter,
      id: 'key-2',
      name: 'DeepSeek Backup',
      adapter: 'openai' as const,
      api_base: 'https://api.deepseek.com/v1/',
      supplier: providerRef,
    };
    const keyOtherEndpoint = {
      ...openRouter,
      id: 'key-3',
      name: 'DeepSeek Beta Endpoint',
      adapter: 'openai' as const,
      api_base: 'https://beta.deepseek.com/v1',
      supplier: providerRef,
    };
    stubVendorApi({ existing: [key1, key2, keyOtherEndpoint] });
    const user = userEvent.setup();
    renderView(
      <MemoryRouter initialEntries={['/admin/providers/prov-pool/keys?supplier=prov-pool']}>
        <ProvidersView token="installation-token" session={installationSession} refreshWorkspace={async () => {}} />
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: 'DeepSeek Primary' });
    // Two keys on https://api.deepseek.com/v1 show pooled badge; different api_base does not.
    expect(screen.getAllByText('Pooled · 2 active keys')).toHaveLength(2);

    // Disable dialog on a pooled key tells the truth: 1 remaining key keeps serving traffic.
    const disableButtons = screen.getAllByRole('button', { name: 'Disable' });
    await user.click(disableButtons[0]);
    expect(
      await screen.findByText(/Other enabled API keys on this endpoint \(1 remaining\) will continue serving traffic automatically/),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    // Disable dialog on the isolated endpoint warns it is the last enabled key.
    await user.click(disableButtons[2]);
    expect(
      await screen.findByText(/This is the last enabled key for this endpoint/),
    ).toBeTruthy();
  });

  it('scopes API key forms strictly to the owning Provider: inherits endpoint, hides Provider selector & OpenRouter adapter, uses neutral key icons, and omits vendor integration overrides', async () => {
    const qiniuUuid = '9cc6b65a-0b19-4f18-8828-89d6038973f0';
    const qiniuKey: ProviderConnection = {
      id: 'qiniu-key-1',
      name: 'Qiniu Primary',
      adapter: 'openai',
      api_base: 'https://api.qnaigc.com/v1',
      enabled: true,
      revision: 1,
      has_credential: true,
      provider: { id: qiniuUuid, name: 'Qiniu' },
      supplier: { id: qiniuUuid, name: 'Qiniu' },
    };
    const api = stubVendorApi({ existing: [qiniuKey] });
    const user = userEvent.setup();
    const { container } = renderView(
      <MemoryRouter initialEntries={['/admin/providers/qiniu']}>
        <ProvidersView
          embedded
          token="installation-token-qiniu"
          session={installationSession}
          refreshWorkspace={async () => {}}
          providerId={qiniuUuid}
          providerSlug="qiniu"
        />
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: 'Qiniu Primary' });
    // Key rows render neutral key icons, never foreign brand logos
    const keyList = screen.getByRole('list', { name: 'Provider API keys' });
    expect(keyList.querySelectorAll('img')).toHaveLength(0);

    // Edit key dialog omits per-key Connection integration overrides
    await user.click(screen.getByRole('button', { name: 'Edit key' }));
    const editDialog = await screen.findByRole('dialog');
    expect(within(editDialog).queryByText('Connection integration')).toBeNull();
    expect(api.calls.some(call => call.path.endsWith('/integration'))).toBe(false);
    await user.click(within(editDialog).getByRole('button', { name: 'Close dialog' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // Add API key dialog hides Provider selector, pre-fills Qiniu's adapter + api_base, and hides OpenRouter API
    await user.click(screen.getByRole('button', { name: 'Add API key' }));
    const addDialog = await screen.findByRole('dialog');
    expect(within(addDialog).queryByLabelText('Provider')).toBeNull();
    expect(within(addDialog).getByLabelText('API format').textContent).toBe('OpenAI-compatible API');
    expect((within(addDialog).getByLabelText('API base URL') as HTMLInputElement).value).toBe('https://api.qnaigc.com/v1');

    await user.click(within(addDialog).getByLabelText('API format'));
    expect(screen.queryByRole('menuitemradio', { name: 'OpenRouter API' })).toBeNull();
    expect(screen.getByRole('menuitemradio', { name: 'OpenAI-compatible API' })).toBeTruthy();
    await user.keyboard('{Escape}');

    await user.type(within(addDialog).getByLabelText('API key name'), 'Qiniu Backup');
    await user.type(within(addDialog).getByLabelText('Provider API key'), 'qiniu-secret-2');
    await user.click(within(addDialog).getByRole('button', { name: 'Add API key' }));

    await waitFor(() => {
      const post = api.calls.find(c => c.path === '/api/v1/admin/providers/connections' && c.method === 'POST');
      expect(post?.body).toEqual({
        name: 'Qiniu Backup',
        adapter: 'openai',
        api_base: 'https://api.qnaigc.com/v1',
        api_key: 'qiniu-secret-2',
        enabled: true,
        supplier_id: qiniuUuid,
      });
    });
    expect(container).toBeTruthy();
  });

  it('prefills backend preset endpoint for a 0-key built-in Provider and leaves custom 0-key Provider api_base blank rather than OpenRouter', async () => {
    const deepseekUuid = '11111111-2222-3333-4444-555555555555';
    const customUuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const fetchMock = vi.fn<typeof fetch>(async input => {
      const path = String(input);
      if (path.startsWith('/api/v1/admin/providers/connections')) return jsonResponse({ data: [] });
      if (path === '/api/v1/admin/providers/presets') {
        return jsonResponse({
          data: [
            {
              id: 'deepseek',
              name: 'DeepSeek',
              protocol: 'openai',
              api_base: 'https://api.deepseek.com',
              website: 'https://platform.deepseek.com/api_keys',
            },
          ],
        });
      }
      return jsonResponse({ data: [] });
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    const view = renderView(
      <MemoryRouter initialEntries={['/admin/providers/deepseek']}>
        <ProvidersView
          embedded
          token="preset-token"
          session={installationSession}
          refreshWorkspace={async () => {}}
          providerId={deepseekUuid}
          providerSlug="deepseek"
        />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole('button', { name: 'Configure API key' }));
    const deepseekDialog = await screen.findByRole('dialog');
    await waitFor(() => {
      expect((within(deepseekDialog).getByLabelText('API base URL') as HTMLInputElement).value).toBe('https://api.deepseek.com');
    });
    expect(within(deepseekDialog).getByLabelText('API format').textContent).toBe('OpenAI-compatible API');
    expect(within(deepseekDialog).queryByLabelText('Provider')).toBeNull();
    view.unmount();

    renderView(
      <MemoryRouter initialEntries={['/admin/providers/custom-gateway']}>
        <ProvidersView
          embedded
          token="custom-token"
          session={installationSession}
          refreshWorkspace={async () => {}}
          providerId={customUuid}
          providerSlug="custom-gateway"
        />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole('button', { name: 'Configure API key' }));
    const customDialog = await screen.findByRole('dialog');
    expect(within(customDialog).getByLabelText('API format').textContent).toBe('OpenAI-compatible API');
    expect((within(customDialog).getByLabelText('API base URL') as HTMLInputElement).value).toBe('');
  });
});
