vi.mock('@/shell/platform-currency', () => ({ usePlatformCurrency: () => ({ currency: 'USD', error: '', reload: () => {} }) }));
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { it, expect, vi } from 'vitest';
import ProviderModels from '@/features/provider-business/ProviderModels';
import { emptyCapabilities, type ProviderModelCheck } from '@/features/providers/api';

const connection = { id: 'credential-one', name: 'Production key', adapter: 'openrouter', api_base: 'https://openrouter.ai/api/v1', enabled: true, revision: 2, has_credential: true, provider: { id: 'provider-one', name: 'Provider' } };
const model = { alias: 'team/chat', upstream_model: 'upstream/chat', vendor_id: connection.id, public_catalog: false, enabled: true, capabilities: emptyCapabilities(), pricing: null, revision: 3, available: false };
const props = { token: 'token', providerId: 'provider-one', providerSlug: 'example', canManage: true, offers: [], offersComplete: true, onOffer: vi.fn(), onEnableOffer: vi.fn(), onSaved: vi.fn() };
type ModelFixture = typeof model;
type SetupOptions = {
  check?: ProviderModelCheck;
  importResult?: { imported: number; discovered: number };
  modelPatch?: Partial<ModelFixture>;
  models?: ModelFixture[];
  connectionRevision?: number;
  catalog?: Array<{ id: string; name: string; context_length: number | null }>;
  catalogFails?: boolean;
  upstreamPricing?: unknown;
  retailPrices?: unknown[];
};

function setup(personal = false, failSave = false, options: SetupOptions = {}) {
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const method = init?.method ?? 'GET';
    if (method === 'POST' && path.endsWith('/check')) {
      return Response.json({ data: options.check ?? { status: 'connected', model: 'listed', http_status: 200, duration_ms: 8, checked_at_ms: 1 } });
    }
    if (method === 'POST' && path.endsWith('/import')) {
      return Response.json({ data: options.importResult ?? { imported: 2, discovered: 3 } });
    }
    if (method === 'POST' && path.endsWith('/offers')) {
      return Response.json({ data: { id: 'offer-1', revision: 'rev-1', active: true, authorization_id: 'auth-1' } });
    }
    if (method === 'POST' && path.endsWith('/standard-prices')) {
      return Response.json({ data: { price_id: 'price-1', revision: 'price-rev-1', version: '1' } });
    }
    if (method === 'PATCH' && path.includes('/offers/')) {
      return Response.json({ data: { active: false } });
    }
    if (method === 'POST') return failSave ? Response.json({ error: { message: 'Save unavailable' } }, { status: 503 }) : Response.json({ data: model });
    if (path.includes('/admin/pricing/standard-prices')) {
      return Response.json({ data: options.retailPrices ?? [] });
    }
    if (path.endsWith('/pricing')) {
      return Response.json(options.upstreamPricing ?? { data: { status: 'available', prices: [], native_ratios: [] } });
    }
    if (path.includes('/catalog')) {
      if (options.catalogFails) return Response.json({ error: { message: 'Catalog temporarily unavailable' } }, { status: 503 });
      return Response.json({ data: options.catalog ?? [{ id: 'upstream/other', name: 'Other model', context_length: null }] });
    }
    if (path.includes('/models')) return Response.json({ data: options.models ?? [{ ...model, ...options.modelPatch, owner_funded: personal, available: personal }] });
    return Response.json({ data: [{ ...connection, revision: options.connectionRevision ?? connection.revision, owner_funded: personal }] });
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

async function openAddModel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Add model', exact: true }));
  return screen.getByRole('dialog');
}

async function openRowMenu(user: ReturnType<typeof userEvent.setup>, alias = 'team/chat') {
  await user.click(await screen.findByRole('button', { name: `More actions for ${alias}` }));
}

it('enables a model in one click with no discount (100%) using discovered upstream standard price', async () => {
  const fetcher = setup(false, false, {
    models: [{ ...model, enabled: false, public_catalog: false }],
    upstreamPricing: {
      data: {
        status: 'available',
        prices: [{
          model: 'upstream/chat',
          rates: [
            { condition: null, meter: 'input_tokens', amount: '2', currency: 'USD', per_units: 1_000_000, unit: 'token' },
            { condition: null, meter: 'output_tokens', amount: '8', currency: 'USD', per_units: 1_000_000, unit: 'token' },
          ],
        }],
      },
    },
  });
  render(<MemoryRouter><ProviderModels {...props} token="one-click-enable" /></MemoryRouter>);
  expect(await screen.findByText('$2.00 / $8.00')).toBeTruthy();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Enable', exact: true }));
  await waitFor(() => {
    const offerCall = fetcher.mock.calls.find(([url, init]) => String(url).endsWith('/offers') && init?.method === 'POST');
    expect(offerCall).toBeTruthy();
    expect(JSON.parse(String(offerCall?.[1]?.body))).toMatchObject({
      model_alias: 'team/chat',
      currency: 'USD',
      prompt_rate: '2000000000',
      completion_rate: '8000000000',
      activate: true,
    });
  });
  const retailCall = fetcher.mock.calls.find(([url, init]) => String(url).endsWith('/standard-prices') && init?.method === 'POST');
  expect(retailCall).toBeTruthy();
  expect(JSON.parse(String(retailCall?.[1]?.body))).toMatchObject({
    model_alias: 'team/chat',
    currency: 'USD',
    schedule: { kind: 'text', prompt_rate: '2000000000', completion_rate: '8000000000' },
  });
});

it('applies a 70% discount off upstream standard price and activates atomically', async () => {
  const fetcher = setup(false, false, {
    upstreamPricing: {
      data: {
        status: 'available',
        prices: [{
          model: 'upstream/chat',
          rates: [
            { condition: null, meter: 'input_tokens', amount: '2', currency: 'USD', per_units: 1_000_000, unit: 'token' },
            { condition: null, meter: 'output_tokens', amount: '8', currency: 'USD', per_units: 1_000_000, unit: 'token' },
          ],
        }],
      },
    },
  });
  render(<MemoryRouter><ProviderModels {...props} token="discount-70" /></MemoryRouter>);
  await screen.findByText('$2.00 / $8.00');
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Discount', exact: true }));
  const dialog = await screen.findByRole('dialog');
  await user.click(within(dialog).getByRole('button', { name: '70%' }));
  await user.click(within(dialog).getByRole('button', { name: 'Save & enable' }));
  await waitFor(() => {
    const offerCall = fetcher.mock.calls.find(([url, init]) => String(url).endsWith('/offers') && init?.method === 'POST');
    expect(offerCall).toBeTruthy();
    expect(JSON.parse(String(offerCall?.[1]?.body))).toMatchObject({
      model_alias: 'team/chat',
      currency: 'USD',
      prompt_rate: '1400000000',
      completion_rate: '5600000000',
      activate: true,
    });
  });
});

it('prompts for upstream standard price when provider catalog does not publish USD rates', async () => {
  const fetcher = setup(false, false, {
    models: [{ ...model, enabled: false }],
    upstreamPricing: {
      data: {
        status: 'available',
        prices: [{
          model: 'upstream/chat',
          rates: [
            { condition: null, meter: 'input_tokens', amount: '4', currency: 'CNY', per_units: 1_000_000, unit: 'token' },
            { condition: null, meter: 'output_tokens', amount: '16', currency: 'CNY', per_units: 1_000_000, unit: 'token' },
          ],
        }],
      },
    },
  });
  render(<MemoryRouter><ProviderModels {...props} token="cny-hint" /></MemoryRouter>);
  await screen.findByText(/¥4\.00 \/ ¥16\.00/);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Enable', exact: true }));
  const dialog = await screen.findByRole('dialog');
  expect(dialog.textContent).toContain('CNY');
  await user.type(within(dialog).getByLabelText('Input price'), '1.00');
  await user.type(within(dialog).getByLabelText('Output price'), '4.00');
  await user.click(within(dialog).getByRole('button', { name: 'Save & enable' }));
  await waitFor(() => {
    const offerCall = fetcher.mock.calls.find(([url, init]) => String(url).endsWith('/offers') && init?.method === 'POST');
    expect(JSON.parse(String(offerCall?.[1]?.body))).toMatchObject({
      prompt_rate: '1000000000',
      completion_rate: '4000000000',
      activate: true,
    });
  });
});

it('applies a batch discount to multiple selected models', async () => {
  const m1 = { ...model, alias: 'team/one', upstream_model: 'up/one' };
  const m2 = { ...model, alias: 'team/two', upstream_model: 'up/two' };
  const fetcher = setup(false, false, {
    models: [m1, m2],
    upstreamPricing: {
      data: {
        status: 'available',
        prices: [
          { model: 'up/one', rates: [{ meter: 'input_tokens', amount: '1', currency: 'USD', per_units: 1_000_000 }, { meter: 'output_tokens', amount: '2', currency: 'USD', per_units: 1_000_000 }] },
          { model: 'up/two', rates: [{ meter: 'input_tokens', amount: '10', currency: 'USD', per_units: 1_000_000 }, { meter: 'output_tokens', amount: '20', currency: 'USD', per_units: 1_000_000 }] },
        ],
      },
    },
  });
  render(<MemoryRouter><ProviderModels {...props} token="batch-discount" /></MemoryRouter>);
  await screen.findByText('team/one');
  const user = userEvent.setup();
  await user.click(screen.getByRole('checkbox', { name: 'Select all visible models' }));
  await user.click(screen.getByRole('button', { name: 'Set discount (2)' }));
  const dialog = await screen.findByRole('dialog');
  await user.click(within(dialog).getByRole('button', { name: '80%' }));
  await user.click(within(dialog).getByRole('button', { name: 'Apply to 2 models' }));
  await waitFor(() => {
    const offerCalls = fetcher.mock.calls.filter(([url, init]) => String(url).endsWith('/offers') && init?.method === 'POST');
    expect(offerCalls).toHaveLength(2);
    expect(JSON.parse(String(offerCalls[0][1]?.body))).toMatchObject({ model_alias: 'team/one', prompt_rate: '800000000', activate: true });
    expect(JSON.parse(String(offerCalls[1][1]?.body))).toMatchObject({ model_alias: 'team/two', prompt_rate: '8000000000', activate: true });
  });
});

it('edits a model route from the row menu and preserves existing pricing', async () => {
  const pricing = { currency: 'USD', input_per_million: '1000000000', output_per_million: '2000000000' };
  const fetcher = setup(false, false, { models: [{ ...model, pricing, revision: 7 }] });
  render(<MemoryRouter><ProviderModels {...props} token="edit-route" /></MemoryRouter>);
  const user = userEvent.setup();
  await openRowMenu(user);
  await user.click(screen.getByRole('menuitem', { name: 'Edit model' }));
  await user.click(screen.getByRole('checkbox', { name: /Function tools/ }));
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  const write = JSON.parse(fetcher.mock.calls.find(([url, init]) => String(url).endsWith('/models') && init?.method === 'POST')?.[1]?.body as string);
  expect(write).toMatchObject({ expected_revision: 7, capabilities: { supports_tool_calls: true } });
  expect(write).not.toHaveProperty('pricing');
});

it('checks reachability from the row menu and explains a Qiniu restriction', async () => {
  const fetcher = setup(false, false, { check: { status: 'account_chat_banned', model: 'unknown', http_status: 403, duration_ms: 1, checked_at_ms: 1 } });
  render(<MemoryRouter><ProviderModels {...props} token="check-qiniu" /></MemoryRouter>);
  await screen.findByText('team/chat');
  const user = userEvent.setup();
  await openRowMenu(user);
  await user.click(screen.getByRole('menuitem', { name: 'Check connection' }));
  expect(await screen.findByText(/Qiniu account is not permitted to use chat services/)).toBeTruthy();
  const check = fetcher.mock.calls.find(([url, init]) => String(url).endsWith('/check') && init?.method === 'POST');
  expect(check?.[0]).toBe('/api/v1/admin/providers/connections/credential-one/check');
  expect(JSON.parse(check?.[1]?.body as string)).toEqual({ alias: 'team/chat' });
});

it('imports discovered models and shows a clear alert when all API keys are disabled', async () => {
  const fetcher = setup(false, false, { importResult: { imported: 2, discovered: 3 } });
  render(<MemoryRouter><ProviderModels {...props} token="import-ok" /></MemoryRouter>);
  await screen.findByText('team/chat');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Import models', exact: true }));
  expect(await screen.findByText('Imported 2 of 3 discovered models.')).toBeTruthy();
  expect(fetcher.mock.calls.some(([url, init]) => String(url).endsWith('/import') && init?.method === 'POST')).toBe(true);
});

it('renders video configuration as an inline in-dialog subview without nesting dialogs and handles Escape back', async () => {
  setup();
  render(<MemoryRouter><ProviderModels {...props} token="video-subview" /></MemoryRouter>);
  const user = userEvent.setup();
  await openRowMenu(user);
  await user.click(screen.getByRole('menuitem', { name: 'Edit model' }));
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  const configureVideo = screen.getByRole('button', { name: 'Configure video' });
  await user.click(configureVideo);
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  const subview = screen.getByRole('region', { name: 'Video configuration' });
  expect(within(subview).getByRole('button', { name: 'Back to model' }).hasAttribute('data-dialog-back')).toBe(true);
  await user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('region', { name: 'Video configuration' })).toBeNull());
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  await waitFor(() => expect(document.activeElement).toBe(configureVideo));
});

it('keeps the first model on an owner-funded credential private', async () => {
  setup(true);
  render(<MemoryRouter><ProviderModels {...props} token="private-model" commercialEnabled={false} /></MemoryRouter>);
  const user = userEvent.setup();
  await openAddModel(user);
  expect(screen.getByText('Private model. Available only to the account that owns this API key.')).toBeTruthy();
  expect(screen.queryByRole('checkbox', { name: /Show in public catalog/ })).toBeNull();
  await user.type(screen.getByLabelText('Niu model alias'), 'private/first');
  await user.click(screen.getByLabelText('Upstream model'));
  await user.type(screen.getByRole('textbox', { name: 'Search provider models' }), 'model-first');
  await user.click(screen.getByRole('menuitem', { name: 'Use model ID “model-first”' }));
  await user.click(screen.getByRole('button', { name: 'Add model' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

it('prompts to enable API key when no enabled connection exists', async () => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    if (path.includes('/models')) return Response.json({ data: [model] });
    if (path.includes('/connections')) return Response.json({ data: [{ ...connection, enabled: false }] });
    return Response.json({ data: [] });
  }));
  render(<MemoryRouter><ProviderModels {...props} token="disabled-key-alert" /></MemoryRouter>);
  const link = await screen.findByRole('link', { name: 'Enable API key' });
  expect(link.getAttribute('href')).toBe('/admin/providers/example/keys');
});
