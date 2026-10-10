import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { render as renderView, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AdminSession } from '../../../../src/app/dashboard-context';
import ModelMappingForm from '../../../../src/features/vendors/components/ModelMappingForm';
import SuppliersView from '../../../../src/features/vendors/components/SuppliersView';
import type { Vendor, VendorModel } from '../../../../src/features/vendors/api';

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

const openRouter: Vendor = {
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

function stubVendorApi({ existing = [], models: modelFixtures = {} }: {
  existing?: Vendor[];
  models?: Record<string, VendorModel[]>;
} = {}) {
  const vendors = [...existing];
  const models = new Map(Object.entries(modelFixtures));
  const calls: Array<{ path: string; method: string; body?: Record<string, unknown>; signal?: AbortSignal }> = [];
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const path = String(input);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : undefined;
    calls.push({ path, method, body, signal: init?.signal ?? undefined });

    if (path === '/admin/v1/providers' && method === 'GET') return jsonResponse({ data: [{ id: 'supplier-one', name: 'Existing business' }] });
    if (path === '/admin/v1/vendors' && method === 'GET') return jsonResponse({ data: vendors });
    if (path === '/admin/v1/vendors' && method === 'POST') {
      const created = { ...openRouter, id: 'vendor-' + (vendors.length + 1), name: String(body?.name), supplier: body?.supplier_id ? { id: String(body.supplier_id), name: 'Existing business' } : { id: 'supplier-created', name: String(body?.name) }, adapter: body?.adapter as Vendor['adapter'], api_base: String(body?.api_base), revision: 1, enabled: true, has_credential: Boolean(body?.api_key) };
      vendors.push(created);
      models.set(created.id, []);
      return jsonResponse({ data: created }, 201);
    }
    if (path.startsWith('/admin/v1/vendors/') && path.endsWith('/models')) {
      const vendorId = path.split('/')[4];
      if (method === 'GET') return jsonResponse({ data: models.get(vendorId) ?? [] });
      if (method === 'POST') {
        const previous = models.get(vendorId) ?? [];
        const value = {
          alias: String(body?.alias),
          vendor_id: vendorId,
          upstream_model: String(body?.upstream_model),
          public_catalog: Boolean(body?.public_catalog),
          enabled: Boolean(body?.enabled),
          capabilities: body?.capabilities,
          pricing: Object.hasOwn(body ?? {}, 'pricing') ? body!.pricing : previous.find(model => model.alias === body?.alias)?.pricing ?? null,
          revision: Number(body?.expected_revision ?? 0) + 1,
        } as VendorModel;
        models.set(vendorId, [...previous.filter(model => model.alias !== value.alias), value]);
        return jsonResponse({ data: value });
      }
    }
    if (path.startsWith('/admin/v1/vendors/') && path.endsWith('/check') && method === 'POST') {
      return jsonResponse({ data: { status: 'connected', model: 'listed', http_status: 200, duration_ms: 8, checked_at_ms: 1 } });
    }
    if (path.startsWith('/admin/v1/vendors/') && method === 'PUT') {
      const vendorId = path.split('/')[4];
      const index = vendors.findIndex(vendor => vendor.id === vendorId);
      if (index < 0) return jsonResponse({ error: { message: 'Vendor not found' } }, 404);
      const previous = vendors[index];
      const updated: Vendor = {
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

async function openModels(user: ReturnType<typeof userEvent.setup>) {
  const button = await screen.findByRole('button', { name: /^Model routes/ });
  await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
  await user.click(button);
}

describe('vendor administration workflow', () => {
  it('searches the Supplier catalog and fills a mapping through the standard choice menu', async () => {
    const user = userEvent.setup();
    render(<ModelMappingForm model={null} catalog={[
      {id:'supplier/first',name:'First model',context_length:null},
      {id:'supplier/second',name:'Second model',context_length:null},
    ]} catalogLoading={false} catalogError="" disabled={false} onCancel={() => {}} onSave={async () => {}} />);
    await user.click(screen.getByLabelText('Find a provider model'));
    await user.type(screen.getByRole('textbox', {name:'Search supplier models'}), 'Second');
    expect(screen.queryByRole('menuitemradio', {name:/First model/})).toBeNull();
    await user.click(screen.getByRole('menuitemradio', {name:/Second model/}));
    expect((screen.getByLabelText('Niu model alias') as HTMLInputElement).value).toBe('supplier/second');
    expect((screen.getByLabelText('Upstream model ID') as HTMLInputElement).value).toBe('supplier/second');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('clears the previous model facts when the upstream mapping changes', async () => {
    const user=userEvent.setup();
    const saved=vi.fn(async (_input: import('@/features/vendors/api').ModelWrite)=>{});
    render(<ModelMappingForm model={null} catalog={[{id:'supplier/first',name:'First model',context_length:128000,
      catalog:{name:'First model',description:'First model description',context_length:128000,input_price:'0.000001'}}]}
      catalogLoading={false} catalogError="" disabled={false} onCancel={()=>{}} onSave={saved}/>);
    await user.click(screen.getByLabelText('Find a provider model'));
    await user.click(screen.getByRole('menuitemradio',{name:/First model/}));
    await user.clear(screen.getByLabelText('Upstream model ID'));
    await user.type(screen.getByLabelText('Upstream model ID'),'supplier/different');
    await user.click(screen.getByRole('button',{name:'Add mapping',exact:true}));
    expect(saved).toHaveBeenCalledTimes(1);
    const input=saved.mock.calls[0][0];
    expect(input.upstream_model).toBe('supplier/different');
    expect(input.capabilities.catalog).toBeUndefined();
  });

  it('keeps the first model on an owner-funded credential private', async () => {
    const api = stubVendorApi({ existing: [{ ...openRouter, owner_funded: true }] });
    const user = userEvent.setup();
    render(<SuppliersView token="installation-token" session={installationSession} refreshWorkspace={async () => {}} />);
    await openModels(user);
    await user.click(screen.getByRole('button', { name: 'Add model' }));
    expect(screen.getByText('Private model. Available only to the account that owns this API key.')).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: /Show in public catalog/ })).toBeNull();
    await user.type(screen.getByLabelText('Niu model alias'), 'private/first');
    await user.type(screen.getByLabelText('Upstream model ID'), 'model-first');
    await user.click(screen.getByRole('button', { name: 'Add mapping' }));
    await waitFor(() => expect(api.calls.some(call => call.method === 'POST' && call.path.endsWith('/models'))).toBe(true));
    const saved = api.calls.find(call => call.method === 'POST' && call.path.endsWith('/models'))?.body;
    expect(saved?.public_catalog).toBe(false);
    expect(saved).not.toHaveProperty('owner_funded');
  });

  it('preserves existing procurement pricing when editing a model capability', async () => {
    const pricing = { currency: 'USD', input_per_million: '1000000000', output_per_million: '2000000000' };
    const model: VendorModel = { alias: 'team/priced', upstream_model: 'upstream/model', vendor_id: openRouter.id,
      public_catalog: false, enabled: true, pricing, revision: 7,
      capabilities: { supports_tool_calls: false, supports_streaming_tool_calls: false, supports_structured_output: false,
        supports_embeddings: false, supports_embedding_dimensions: false, supports_embedding_base64: false, supports_responses: false } };
    const api = stubVendorApi({ existing: [openRouter], models: { [openRouter.id]: [model] } });
    const user = userEvent.setup();
    render(<SuppliersView token="installation-token" session={installationSession} refreshWorkspace={async () => {}} />);
    await openModels(user);
    await user.click(await screen.findByRole('button', { name: 'Edit', exact: true }));
    await user.click(screen.getByRole('checkbox', { name: /Function tools/ }));
    await user.click(screen.getByRole('button', { name: 'Save mapping' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save mapping' })).toBeNull());
    const write = api.calls.find(call => call.method === 'POST' && call.path.endsWith('/models'))?.body;
    expect(write).toMatchObject({ expected_revision: 7, capabilities: { supports_tool_calls: true } });
    expect(write).not.toHaveProperty('pricing');
    const response = await api.fetchMock(`/admin/v1/vendors/${openRouter.id}/models`);
    expect((await response.json()).data[0]).toMatchObject({ pricing, revision: 8, capabilities: { supports_tool_calls: true } });
  });

  it('denies scoped owners before requesting any installation vendor data', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    render(<SuppliersView token="scoped-token" session={scopedOwnerSession} refreshWorkspace={async () => {}} />);

    expect(screen.getByRole('heading', { name: 'Platform administrator access required' })).toBeTruthy();
    expect(screen.getByText(/does not have permission to manage Suppliers/)).toBeTruthy();
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
  });

  it('creates a supplier and model route, rotates the credential, and confirms disabling', async () => {
    const api = stubVendorApi();
    const user = userEvent.setup();
    const refreshWorkspace = vi.fn(async () => {});
    render(<SuppliersView token="installation-token" session={installationSession} refreshWorkspace={refreshWorkspace} />);

    expect(await screen.findByRole('button', { name: 'Add supplier' })).toBeTruthy();
    await user.click((await screen.findAllByRole('button', { name: 'Add supplier' }))[0]);
    await user.type(await screen.findByLabelText('Supplier name'), 'OpenRouter primary');
    expect(screen.getByLabelText('Upstream API service').textContent).toBe('OpenRouter');
    expect((screen.getByLabelText('API base URL') as HTMLInputElement).value).toBe('https://openrouter.ai/api/v1');
    await user.type(screen.getByLabelText('Supplier API key'), 'vendor-secret-once');
    await user.click(screen.getByRole('button', { name: 'Create supplier' }));

    expect(await screen.findByRole('heading', { name: 'OpenRouter primary' })).toBeTruthy();
    await waitFor(() => expect(api.calls.some(call => call.path === '/admin/v1/vendors/vendor-1/models' && call.method === 'GET')).toBe(true));
    const createVendor = api.calls.find(call => call.path === '/admin/v1/vendors' && call.method === 'POST');
    expect(createVendor?.body).toEqual({
      name: 'OpenRouter primary',
      adapter: 'openrouter',
      api_base: 'https://openrouter.ai/api/v1',
      api_key: 'vendor-secret-once',
      enabled: true,
      create_supplier: true,
    });
    expect(refreshWorkspace).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('Replace supplier API key (optional)')).toBeNull();
    expect(localStorage.length).toBe(0);

    await openModels(user);
    await user.click(screen.getByRole('button', { name: 'Add model' }));
    await user.type(screen.getByLabelText('Niu model alias'), 'team/fast');
    await user.type(screen.getByLabelText('Upstream model ID'), 'openai/gpt-4.1-mini');
    await user.click(screen.getByRole('checkbox', { name: /Show in public catalog/ }));
    await user.click(screen.getByRole('checkbox', { name: /Function tools/ }));
    await user.click(screen.getByRole('checkbox', { name: /Streaming tools/ }));
    await user.click(screen.getByRole('button', { name: 'Add mapping' }));

    expect(await screen.findByText('team/fast')).toBeTruthy();
    const createModel = api.calls.find(call => call.path === '/admin/v1/vendors/vendor-1/models' && call.method === 'POST');
    expect(createModel?.body).toMatchObject({
      alias: 'team/fast',
      upstream_model: 'openai/gpt-4.1-mini',
      public_catalog: true,
      enabled: true,
      expected_revision: null,
      pricing: null,
      capabilities: { supports_tool_calls: true, supports_streaming_tool_calls: true, supports_embeddings: false, supports_responses: false },
    });
    expect(refreshWorkspace).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText('Reachable · model listed. Try Chat to verify access.')).toBeTruthy();
    expect(api.calls.find(call => call.path === '/admin/v1/vendors/vendor-1/check')?.body).toEqual({ alias: 'team/fast' });

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('checkbox', { name: /Enabled for inference/ }));
    await user.click(screen.getByRole('button', { name: 'Save mapping' }));
    expect(await screen.findByText('Disabled')).toBeTruthy();
    const updateModel = api.calls.filter(call => call.path === '/admin/v1/vendors/vendor-1/models' && call.method === 'POST')[1];
    expect(updateModel?.body).toMatchObject({ alias: 'team/fast', enabled: false, expected_revision: 1 });
    expect(Object.hasOwn(updateModel?.body ?? {}, 'pricing')).toBe(false);
    expect(refreshWorkspace).toHaveBeenCalledTimes(3);

    await user.click(screen.getByRole('button', { name: 'Close model management' }));
    await user.click(screen.getByRole('button', { name: 'Edit API key' }));
    await user.type(screen.getByLabelText('Replace supplier API key (optional)'), 'vendor-secret-rotation');
    await user.click(screen.getByRole('checkbox', { name: /Enabled for inference/ }));
    await user.click(screen.getByRole('button', { name: 'Review disable' }));
    expect(await screen.findByRole('alertdialog', { name: 'Disable this API key?' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Confirm disable' }));

    const updateVendor = api.calls.find(call => call.path === '/admin/v1/vendors/vendor-1' && call.method === 'PUT');
    expect(updateVendor?.body).toMatchObject({
      name: 'OpenRouter primary',
      api_base: 'https://openrouter.ai/api/v1',
      enabled: false,
      api_key: 'vendor-secret-rotation',
      expected_revision: 1,
    });
    expect(refreshWorkspace).toHaveBeenCalledTimes(4);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(localStorage.length).toBe(0);
  }, 20_000);

  it('adds an independently named key to an existing Supplier without creating a business', async () => {
    const api = stubVendorApi({ existing: [openRouter] });
    const user = userEvent.setup();
    render(<SuppliersView token="installation-token" session={installationSession} refreshWorkspace={async () => {}} />);
    await screen.findByRole('heading', { name: openRouter.name });
    await user.click(screen.getByRole('button', { name: 'Add supplier' }));
    await waitFor(() => expect(screen.getByLabelText('Supplier').hasAttribute('disabled')).toBe(false));
    await user.click(screen.getByLabelText('Supplier'));
    await user.click(screen.getByRole('menuitemradio', { name: 'Existing business' }));
    await user.type(screen.getByLabelText('API key name'), 'Specialized models');
    await user.type(screen.getByLabelText('Supplier API key'), 'independent-secret');
    await user.click(screen.getByRole('button', { name: 'Add API key' }));
    expect(await screen.findByRole('heading', { name: 'Specialized models' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Select Supplier API key' }).textContent).toContain('Specialized models');
    const creation = api.calls.find(call => call.method === 'POST' && call.path === '/admin/v1/vendors');
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
      if (created && String(input) === '/admin/v1/vendors' && (init?.method ?? 'GET') === 'GET') {
        return jsonResponse({ error: { message: 'Temporarily unavailable' } }, 503);
      }
      const response = await original(input, init);
      if (String(input) === '/admin/v1/vendors' && init?.method === 'POST') created = true;
      return response;
    });
    const user = userEvent.setup();
    render(<SuppliersView token="installation-token" session={installationSession} refreshWorkspace={async () => {}} />);
    await screen.findByRole('heading', { name: openRouter.name });
    await user.click(screen.getByRole('button', { name: 'Add supplier' }));
    await user.type(screen.getByLabelText('Supplier name'), 'Saved Supplier');
    await user.type(screen.getByLabelText('Supplier API key'), 'saved-secret');
    await user.click(screen.getByRole('button', { name: 'Create supplier' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('API key saved'));
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(api.calls.filter(call => call.method === 'POST' && call.path === '/admin/v1/vendors')).toHaveLength(1);
  });

  it.each(['transport', 'server', 'malformed'])('reconciles an uncertain %s creation through reads without reposting', async failure => {
    const api = stubVendorApi({ existing: [openRouter] });
    const original = api.fetchMock.getMockImplementation()!;
    api.fetchMock.mockImplementation(async (input, init) => {
      const response = await original(input, init);
      if (String(input) === '/admin/v1/vendors' && init?.method === 'POST') {
        if (failure === 'transport') throw new TypeError('Connection lost');
        if (failure === 'server') return jsonResponse({ error: { message: 'Unavailable' } }, 503);
        return jsonResponse({ data: null }, 201);
      }
      return response;
    });
    const user = userEvent.setup();
    render(<SuppliersView token="installation-token" session={installationSession} refreshWorkspace={async () => {}} />);
    await screen.findByRole('heading', { name: openRouter.name });
    await user.click(screen.getByRole('button', { name: 'Add supplier' }));
    await user.type(screen.getByLabelText('Supplier name'), 'Possibly saved Supplier');
    await user.type(screen.getByLabelText('Supplier API key'), 'test-secret');
    await user.click(screen.getByRole('button', { name: 'Create supplier' }));
    expect(await screen.findByText(/API key creation could not be confirmed/)).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByLabelText('Supplier API key')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await user.click(await screen.findByRole('button', { name: 'Select Supplier API key' }));
    expect(await screen.findByRole('menuitemradio', { name: /Possibly saved Supplier/ })).toBeTruthy();
    expect(api.calls.filter(call => call.method === 'POST' && call.path === '/admin/v1/vendors')).toHaveLength(1);
    expect(localStorage.length).toBe(0);
  });

  it('groups two keys under one Supplier and switches their independent model mappings', async () => {
    const first = { ...openRouter, name: 'General key', supplier: { id: 'business-one', name: 'Shared business' } };
    const second = { ...first, id: 'restricted-key', name: 'Restricted key', enabled: false };
    const model = (vendor: Vendor, alias: string): VendorModel => ({ alias, vendor_id: vendor.id, upstream_model: alias, public_catalog: false, enabled: true, capabilities: { supports_tool_calls: false, supports_streaming_tool_calls: false, supports_structured_output: false, supports_embeddings: false, supports_embedding_dimensions: false, supports_embedding_base64: false, supports_responses: false }, pricing: null, revision: 1 });
    stubVendorApi({ existing: [first, second], models: { [first.id]: [model(first, 'general/model')], [second.id]: [model(second, 'restricted/model')] } });
    const user = userEvent.setup();
    render(<SuppliersView token="installation-token" session={installationSession} refreshWorkspace={async () => {}} />);
    await openModels(user);
    await screen.findByText('general/model', { selector: 'strong' });
    await user.click(screen.getByRole('button', { name: 'Close model management' }));
    expect(screen.getByRole('heading', { name: 'General key' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Select Supplier API key' }));
    expect(screen.getByRole('menuitemradio', { name: 'General key' }).getAttribute('aria-checked')).toBe('true');
    await user.click(screen.getByRole('menuitemradio', { name: 'Restricted key · Disabled' }));
    await openModels(user);
    expect(await screen.findByText('restricted/model', { selector: 'strong' })).toBeTruthy();
    expect(screen.queryByText('general/model', { selector: 'strong' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Close model management' }));
    await user.click(screen.getByRole('button', { name: 'Select Supplier API key' }));
    expect(screen.getByRole('menuitemradio', { name: 'Restricted key · Disabled' }).getAttribute('aria-checked')).toBe('true');
    await user.keyboard('{Escape}');
    expect(screen.queryByText('business-one')).toBeNull();
  });

  it('adds another vendor from the populated directory', async () => {
    const api = stubVendorApi({ existing: [openRouter] });
    const user = userEvent.setup();
    render(<SuppliersView token="installation-token" session={installationSession} refreshWorkspace={async () => {}} />);

    await screen.findByRole('heading', { name: openRouter.name });
    await user.click(screen.getByRole('button', { name: 'Add supplier' }));
    await user.type(screen.getByLabelText('Supplier name'), 'OpenAI fallback');
    await user.click(screen.getByLabelText('Upstream API service'));
    await user.click(screen.getByRole('menuitemradio', { name: 'OpenAI' }));
    await user.type(screen.getByLabelText('Supplier API key'), 'second-vendor-key');
    await user.click(screen.getByRole('button', { name: 'Create supplier' }));

    expect(await screen.findByRole('heading', { name: 'OpenAI fallback' })).toBeTruthy();
    expect(screen.getByText('https://api.openai.com/v1')).toBeTruthy();
    expect(api.calls.find(call => call.path === '/admin/v1/vendors' && call.method === 'POST')?.body).toMatchObject({
      name: 'OpenAI fallback',
      adapter: 'openai',
      api_base: 'https://api.openai.com/v1',
      api_key: 'second-vendor-key',
      enabled: true,
    });
  });

  it('discards a model-list response that arrives after the vendor selection changes', async () => {
    const vendorB: Vendor = { ...openRouter, id: 'vendor-b', name: 'Second vendor', adapter: 'openai', api_base: 'https://api.openai.com/v1' };
    const staleModel: VendorModel = {
      alias: 'stale/model',
      vendor_id: openRouter.id,
      upstream_model: 'stale-upstream',
      public_catalog: false,
      enabled: true,
      capabilities: { supports_tool_calls: false, supports_streaming_tool_calls: false, supports_structured_output: false, supports_embeddings: false, supports_embedding_dimensions: false, supports_embedding_base64: false, supports_responses: false },
      pricing: null,
      revision: 1,
    };
    let resolveFirst!: (response: Response) => void;
    const delayed = new Promise<Response>(resolve => { resolveFirst = resolve; });
    const baseApi = stubVendorApi({ existing: [openRouter, vendorB] });
    baseApi.fetchMock.mockImplementation(async (input, init) => {
      const path = String(input);
      const method = init?.method ?? 'GET';
      if (path === '/admin/v1/vendors' && method === 'GET') return jsonResponse({ data: [openRouter, vendorB] });
      if (path === `/admin/v1/vendors/${openRouter.id}/models` && method === 'GET') return delayed;
      if (path === `/admin/v1/vendors/${vendorB.id}/models` && method === 'GET') return jsonResponse({ data: [] });
      return jsonResponse({ data: [] });
    });
    const user = userEvent.setup();
    render(<SuppliersView token="installation-token" session={installationSession} refreshWorkspace={async () => {}} />);

    await screen.findByRole('heading', { name: openRouter.name });
    await waitFor(() => expect(baseApi.fetchMock.mock.calls.some(([path]) => String(path) === `/admin/v1/vendors/${openRouter.id}/models`)).toBe(true));
    await user.click(screen.getByRole('button', { name: 'Select Supplier API key' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Second vendor' }));
    expect(await screen.findByRole('heading', { name: vendorB.name })).toBeTruthy();
    resolveFirst(jsonResponse({ data: [staleModel] }));

    await openModels(user);
    await waitFor(() => expect(screen.getByText('No model mappings yet')).toBeTruthy());
    expect(screen.queryByText('stale/model')).toBeNull();
  });

  it('keeps a rejected vendor credential update visible for correction and retry', async () => {
    const api = stubVendorApi({ existing: [openRouter] });
    api.fetchMock.mockImplementation(async (input, init) => {
      const path = String(input);
      const method = init?.method ?? 'GET';
      if (path === `/admin/v1/vendors/${openRouter.id}` && method === 'PUT') {
        return jsonResponse({ error: { message: 'Vendor revision conflict' } }, 409);
      }
      if (path === `/admin/v1/vendors/${openRouter.id}/models`) return jsonResponse({ data: [] });
      if (path === '/admin/v1/vendors') return jsonResponse({ data: [openRouter] });
      return jsonResponse({ error: { message: 'Not found' } }, 404);
    });
    const user = userEvent.setup();
    render(<SuppliersView token="installation-token" session={installationSession} refreshWorkspace={async () => {}} />);

    await user.click(await screen.findByRole('button', { name: 'Edit API key' }));
    await user.type(screen.getByLabelText('Replace supplier API key (optional)'), 'retry-this-credential');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect((await screen.findByRole('alert')).textContent).toContain('This record changed in another session');
    expect((screen.getByLabelText('Replace supplier API key (optional)') as HTMLInputElement).value).toBe('retry-this-credential');
  });

  it('clears an unsaved credential draft when the session changes away from installation access', async () => {
    stubVendorApi({ existing: [openRouter] });
    const user = userEvent.setup();
    const view = render(<SuppliersView token="installation-token" session={installationSession} refreshWorkspace={async () => {}} />);

    await user.click(await screen.findByRole('button', { name: 'Edit API key' }));
    const credential = await screen.findByLabelText('Replace supplier API key (optional)');
    await user.type(credential, 'temporary-draft-only');
    view.rerender(<SuppliersView token="installation-token" session={scopedOwnerSession} refreshWorkspace={async () => {}} />);
    expect(screen.getByRole('heading', { name: 'Platform administrator access required' })).toBeTruthy();

    view.rerender(<SuppliersView token="installation-token" session={installationSession} refreshWorkspace={async () => {}} />);
    await user.click(await screen.findByRole('button', { name: 'Edit API key' }));
    const resetInput = await screen.findByLabelText('Replace supplier API key (optional)') as HTMLInputElement;
    expect(resetInput.value).toBe('');
  });
});

it('shows a rejected model-route save inside its dialog and preserves the draft', async () => {
  const api = stubVendorApi({ existing: [openRouter] });
  api.fetchMock.mockImplementation(async (input, init) => {
    const path = String(input);
    if (path.endsWith('/models') && init?.method === 'POST') return jsonResponse({ error: { message: 'Model alias already exists' } }, 409);
    if (path === '/admin/v1/vendors') return jsonResponse({ data: [openRouter] });
    return jsonResponse({ data: [] });
  });
  const user = userEvent.setup();
  render(<SuppliersView token="installation-token" session={installationSession} refreshWorkspace={async () => {}} />);
  await openModels(user);
  await user.click(await screen.findByRole('button', { name: 'Add model', exact: true }));
  await user.type(screen.getByLabelText('Niu model alias'), 'team/fast');
  await user.type(screen.getByLabelText('Upstream model ID'), 'upstream-model');
  await user.click(screen.getByRole('button', { name: 'Add mapping' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Model alias already exists');
  expect((screen.getByLabelText('Niu model alias') as HTMLInputElement).value).toBe('team/fast');
});

it('reads explicitly linked configurations when returning from Supplier pricing', async () => {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input); calls.push(path);
    if (path === '/admin/v1/vendors?supplier=business-fixture') return jsonResponse({ data: [openRouter] });
    if (path.endsWith('/models')) return jsonResponse({ data: [] });
    return jsonResponse({ error: { message: 'Unexpected unscoped read' } }, 400);
  }));
  renderView(<MemoryRouter initialEntries={['/suppliers?supplier=business-fixture']}><SuppliersView token="test-token" session={installationSession} refreshWorkspace={vi.fn()} /></MemoryRouter>);
  await screen.findByRole('heading', { name: openRouter.name });
  expect(calls).toContain('/admin/v1/vendors?supplier=business-fixture');
  expect(calls).not.toContain('/admin/v1/vendors');
  expect(screen.getByRole('heading', { name: 'API keys & routes' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Add supplier' })).toBeNull();
});

it('retries catalog discovery inside the model editor without losing its draft', async () => {
  const api=stubVendorApi({existing:[openRouter]});
  let reads=0;
  api.fetchMock.mockImplementation(async input => {
    const path=String(input);
    if(path==='/admin/v1/vendors') return jsonResponse({data:[openRouter]});
    if(path.endsWith('/catalog')) return ++reads===1 ? jsonResponse({error:{message:'Catalog temporarily unavailable'}},503) : jsonResponse({data:[{id:'upstream/available',name:'Available model',context_length:null}]});
    return jsonResponse({data:[]});
  });
  const user=userEvent.setup();
  render(<SuppliersView token="installation-token" session={installationSession} refreshWorkspace={async()=>{}}/>);
  await openModels(user);
  await user.click(screen.getByRole('button',{name:'Add model',exact:true}));
  await screen.findByRole('button',{name:'Retry model catalog'});
  await user.type(screen.getByLabelText('Niu model alias'),'team/custom');
  await user.type(screen.getByLabelText('Upstream model ID'),'custom-model');
  await user.click(screen.getByRole('button',{name:'Retry model catalog'}));
  await screen.findByText('1 model available');
  expect((screen.getByLabelText('Niu model alias') as HTMLInputElement).value).toBe('team/custom');
  expect((screen.getByLabelText('Upstream model ID') as HTMLInputElement).value).toBe('custom-model');
  expect(reads).toBe(2);
});
