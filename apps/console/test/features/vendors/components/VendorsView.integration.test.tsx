import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AdminSession } from '../../../../src/app/console-context';
import VendorsView from '../../../../src/features/vendors/components/VendorsView';
import type { Vendor, VendorModel } from '../../../../src/features/vendors/api';

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

    if (path === '/admin/v1/vendors' && method === 'GET') return jsonResponse({ data: vendors });
    if (path === '/admin/v1/vendors' && method === 'POST') {
      const created = { ...openRouter, id: 'vendor-' + (vendors.length + 1), name: String(body?.name), adapter: body?.adapter as Vendor['adapter'], api_base: String(body?.api_base), revision: 1, enabled: true, has_credential: Boolean(body?.api_key) };
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
          pricing: body?.pricing ?? null,
          revision: Number(body?.expected_revision ?? 0) + 1,
        } as VendorModel;
        models.set(vendorId, [...previous.filter(model => model.alias !== value.alias), value]);
        return jsonResponse({ data: value });
      }
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

describe('vendor administration workflow', () => {
  it('denies scoped owners before requesting any installation vendor data', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    render(<VendorsView token="scoped-token" session={scopedOwnerSession} refreshWorkspace={async () => {}} />);

    expect(screen.getByRole('heading', { name: 'Installation access required' })).toBeTruthy();
    expect(screen.getByText(/scoped to its organization and project/)).toBeTruthy();
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
  });

  it('creates a provider and model route, rotates the credential, and confirms disabling', async () => {
    const api = stubVendorApi();
    const user = userEvent.setup();
    const refreshWorkspace = vi.fn(async () => {});
    render(<VendorsView token="installation-token" session={installationSession} refreshWorkspace={refreshWorkspace} />);

    await user.click(await screen.findByRole('button', { name: 'Add vendor' }));
    await user.type(await screen.findByLabelText('Vendor name'), 'OpenRouter primary');
    expect((screen.getByLabelText('Provider') as HTMLSelectElement).value).toBe('openrouter');
    expect((screen.getByLabelText('API base URL') as HTMLInputElement).value).toBe('https://openrouter.ai/api/v1');
    await user.type(screen.getByLabelText('Provider API key'), 'vendor-secret-once');
    await user.click(screen.getByRole('button', { name: 'Create vendor' }));

    expect(await screen.findByRole('heading', { name: 'OpenRouter primary' })).toBeTruthy();
    await waitFor(() => expect(api.calls.some(call => call.path === '/admin/v1/vendors/vendor-1/models' && call.method === 'GET')).toBe(true));
    const createVendor = api.calls.find(call => call.path === '/admin/v1/vendors' && call.method === 'POST');
    expect(createVendor?.body).toEqual({
      name: 'OpenRouter primary',
      adapter: 'openrouter',
      api_base: 'https://openrouter.ai/api/v1',
      api_key: 'vendor-secret-once',
      enabled: true,
    });
    expect(refreshWorkspace).toHaveBeenCalledTimes(1);
    expect((screen.getByLabelText('Replace provider API key (optional)') as HTMLInputElement).value).toBe('');
    expect(localStorage.length).toBe(0);

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

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getAllByRole('checkbox', { name: /Enabled for inference/ })[1]);
    await user.click(screen.getByRole('button', { name: 'Save mapping' }));
    expect(await screen.findByText('Disabled')).toBeTruthy();
    const updateModel = api.calls.filter(call => call.path === '/admin/v1/vendors/vendor-1/models' && call.method === 'POST')[1];
    expect(updateModel?.body).toMatchObject({ alias: 'team/fast', enabled: false, expected_revision: 1 });
    expect(Object.hasOwn(updateModel?.body ?? {}, 'pricing')).toBe(false);
    expect(refreshWorkspace).toHaveBeenCalledTimes(3);

    await user.type(screen.getByLabelText('Replace provider API key (optional)'), 'vendor-secret-rotation');
    await user.click(screen.getByRole('checkbox', { name: /Enabled for inference/ }));
    await user.click(screen.getByRole('button', { name: 'Review disable' }));
    expect(await screen.findByRole('alertdialog', { name: 'Disable this vendor?' })).toBeTruthy();
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
    await waitFor(() => expect((screen.getByLabelText('Replace provider API key (optional)') as HTMLInputElement).value).toBe(''));
    expect(localStorage.length).toBe(0);
  });

  it('adds another vendor from the populated directory', async () => {
    const api = stubVendorApi({ existing: [openRouter] });
    const user = userEvent.setup();
    render(<VendorsView token="installation-token" session={installationSession} refreshWorkspace={async () => {}} />);

    await screen.findByRole('heading', { name: openRouter.name });
    await user.click(screen.getByRole('button', { name: 'Add vendor' }));
    await user.type(screen.getByLabelText('Vendor name'), 'OpenAI fallback');
    await user.selectOptions(screen.getByLabelText('Provider'), 'openai');
    await user.type(screen.getByLabelText('Provider API key'), 'second-vendor-key');
    await user.click(screen.getByRole('button', { name: 'Create vendor' }));

    expect(await screen.findByRole('heading', { name: 'OpenAI fallback' })).toBeTruthy();
    expect((screen.getByLabelText('API base URL') as HTMLInputElement).value).toBe('https://api.openai.com/v1');
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
    render(<VendorsView token="installation-token" session={installationSession} refreshWorkspace={async () => {}} />);

    await screen.findByRole('heading', { name: openRouter.name });
    await waitFor(() => expect(baseApi.fetchMock.mock.calls.some(([path]) => String(path) === `/admin/v1/vendors/${openRouter.id}/models`)).toBe(true));
    await user.click(screen.getByRole('button', { name: /Second vendor/ }));
    expect(await screen.findByRole('heading', { name: vendorB.name })).toBeTruthy();
    resolveFirst(jsonResponse({ data: [staleModel] }));

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
    render(<VendorsView token="installation-token" session={installationSession} refreshWorkspace={async () => {}} />);

    await user.type(await screen.findByLabelText('Replace provider API key (optional)'), 'retry-this-credential');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect((await screen.findByRole('alert')).textContent).toContain('This record changed in another session');
    expect((screen.getByLabelText('Replace provider API key (optional)') as HTMLInputElement).value).toBe('retry-this-credential');
  });

  it('clears an unsaved credential draft when the session changes away from installation access', async () => {
    stubVendorApi({ existing: [openRouter] });
    const user = userEvent.setup();
    const view = render(<VendorsView token="installation-token" session={installationSession} refreshWorkspace={async () => {}} />);

    const credential = await screen.findByLabelText('Replace provider API key (optional)');
    await user.type(credential, 'temporary-draft-only');
    view.rerender(<VendorsView token="installation-token" session={scopedOwnerSession} refreshWorkspace={async () => {}} />);
    expect(screen.getByRole('heading', { name: 'Installation access required' })).toBeTruthy();

    view.rerender(<VendorsView token="installation-token" session={installationSession} refreshWorkspace={async () => {}} />);
    const resetInput = await screen.findByLabelText('Replace provider API key (optional)') as HTMLInputElement;
    expect(resetInput.value).toBe('');
  });
});
