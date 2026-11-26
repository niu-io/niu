vi.mock('../../../app/shell/platform-currency',()=>({usePlatformCurrency:()=>({currency:'USD',error:'',reload:()=>{}})}));
import { describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider, MemoryRouter, Route, Routes } from "react-router";
import ProviderAdministration from "../../../app/features/provider-business/admin";
import type { DashboardContext } from "../../../app/shell/dashboard-context";

const fixture = vi.hoisted(() => ({ context: {} as DashboardContext }));
vi.mock("../../../app/shell/dashboard-context", () => ({
  useDashboardContext: () => fixture.context,
}));

const supplierId = "9cc6b65a-0b19-4f18-8828-89d6038973f0";
const offerId = "f31c9646-b8df-4090-aa8b-a9794dfe62bd";
const rateRevision = "7c923678-90fa-4a66-8343-a3e34975859b";

function settlementPreview(path: string, overrides: Record<string, unknown> = {}) {
  const cutoff = Number(new URL(path, "http://localhost").searchParams.get("cutoff_ms"));
  return Response.json({
    data: {
      currency: "USD",
      from_ms: null,
      cutoff_ms: cutoff,
      entry_count: 42,
      amount_nanos: "5000000000",
      remaining_unpaid_nanos: "0",
      remaining_entry_count: 0,
      ...overrides,
    },
  });
}

function setup(promptRate = "1000000000", failInitialRead = false, media = false, section = "models", cachedRate: string | null = null, mediaConsumption?: unknown[], offersHasMore = false, operatingMode = 'resale', balances = [{ currency: 'USD', earned_nanos: '5000000000', unpaid_nanos: '5000000000', paid_nanos: '0' }]) {
  fixture.context = {
    token: `installation-token-${operatingMode}`,
    session: { kind: "installation", operating_mode: operatingMode, operator: { name: "Administrator" } },
  } as unknown as DashboardContext;

  let offerQualified = false;
  let offerActive = false;
  const requests: { path: string; method: string; body?: Record<string, unknown> }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined;
    requests.push({ path, method, body });
    if (path.startsWith("/api/v1/admin/providers/connections")) return Response.json({data:[]});

    if (path === "/api/v1/admin/providers") {
      return Response.json({
        data: [{ id: supplierId, name: "Example provider", members: 0 }],
      });
    }
    if (path === `/api/v1/admin/providers/${supplierId}/administration?days=90`) {
      if (failInitialRead) {
        failInitialRead = false;
        return Response.json({ error: { message: 'Provider data temporarily unavailable' } }, { status: 503 });
      }
      return Response.json({
        data: {
          balances, consumption: [], media_consumption: mediaConsumption, settlements: [], earnings: [], offers_has_more: offersHasMore,
          offers: [{
            id: offerId,
            model_alias: "example/model",
            revision: rateRevision,
            rate_kind: media ? "media" : "text",
            currency: media ? null : "USD",
            prompt_rate: media ? null : promptRate,
            completion_rate: media ? null : "2000000000",
            cached_prompt_rate: cachedRate,
            active: offerActive,
            qualified: offerQualified,
            route_ready: offerActive,
          }],
        },
      });
    }
    if (path.includes('/media-offer-models')) return Response.json({data:[{model_alias:'example/model',api_key_name:'Video credential',vendor_id:supplierId,vendor_revision:'2',model_revision:'1',schema_revision:'private-schema',channel:'ark-direct-v1',offer_revision:rateRevision,offer_id:offerId,offer_active:false,offer_qualified:false,offer_current:true,route_ready:true,resolutions:['720p'],reference_video:false,meter:'video_tokens'}],has_more:false,next_after:null});
    if (offersHasMore && path.includes('/offers?limit=100&after=')) return Response.json({data:[{id:'later-offer',model_alias:'later/model',revision:'later-revision',rate_kind:'text',currency:'USD',prompt_rate:'3000000000',completion_rate:'4000000000',active:false,qualified:false,route_ready:false}],next_after:null});
    if (path.includes('/media-rates')) return Response.json({data:[],has_more:false,next_after:null});
    if (path === `/api/v1/admin/providers/${supplierId}/offers/${offerId}/authorization` && method === "PUT") {
      offerActive = true; offerQualified = true;
      return Response.json({data:{active:true,authorization_id:"authorization"}});
    }
    if (path === `/api/v1/admin/providers/${supplierId}/offers/${offerId}` && method === "PATCH") {
      offerActive = false;
      return Response.json({data:{active:false}});
    }
    return Response.json({ data: {} });
  });
  vi.stubGlobal("fetch", fetchMock);

  const router = createMemoryRouter([{ path: "/admin/providers/:providerId/:section", element: <ProviderAdministration /> }], { initialEntries: [`/admin/providers/${supplierId}/${section}?view=text`] });
  render(<RouterProvider router={router} />);
  return { requests, router };
}

describe("installation Provider commercial offer lifecycle", () => {
  it("exposes the unified commercial offer lifecycle even when legacy operating_mode is internal", async () => {
    setup("1000000000", false, false, "models", null, undefined, false, 'internal');
    expect(await screen.findByText('example/model')).toBeTruthy();
  });
  it("ignores a previous Provider settlement save failure after navigating to another Provider", async () => {
    const { router } = setup("1000000000", false, false, "settlements");
    const originalFetch = globalThis.fetch;
    let finish!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.includes("/settlements/preview?")) return Promise.resolve(settlementPreview(path));
      if (path.endsWith("/settlements") && init?.method === "POST") {
        return new Promise<Response>(resolve => { finish = resolve; });
      }
      return originalFetch(input, init);
    }));
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Record payment" }));
    const dialog = within(screen.getByRole("dialog"));
    await dialog.findByText("Unpaid earnings included: 42");
    await user.type(dialog.getByLabelText("External payment reference"), "October payout");
    await user.click(dialog.getByRole("button", { name: "Record confirmed payment" }));
    await act(async () => { await router.navigate('/admin/providers/another-supplier/settlements'); });
    await act(async () => { finish(Response.json({ error: { message: "Previous Provider save failed" } }, { status: 503 })); });
    expect(screen.queryByText("Previous Provider save failed")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("discards an open dialog when the Provider changes", async () => {
    const { router } = setup("1000000000", false, false, "settlements");
    const originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.includes("/settlements/preview?")) return Promise.resolve(settlementPreview(path));
      return originalFetch(input, init);
    }));
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Record payment" }));
    await screen.findByRole("dialog", { name: "Record a confirmed external payment" });
    await act(async () => { await router.navigate('/admin/providers/another-supplier/settlements'); });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByText("Provider configuration saved.")).toBeNull();
  });
  it("does not expose Provider member management or request Provider member endpoints", async () => {
    const { requests } = setup("1000000000", false, false, "models");
    await screen.findByText("example/model");
    expect(screen.queryByRole("button", { name: /Manage.*membership/i })).toBeNull();
    expect(screen.queryByText("No Provider members")).toBeNull();
    expect(requests.some(item => item.path.includes("/members"))).toBe(false);
  });
  it("opens media rates publisher directly from video model row actions", async () => {
    const { requests } = setup("1000000000", false, true);
    const user = userEvent.setup();
    await screen.findByText("example/model");
    await user.click(screen.getByRole("button", { name: "More actions for example/model" }));
    await user.click(screen.getByRole("menuitem", { name: "Media rates" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("example/model");
    expect(screen.queryByText("Set up media offer")).toBeNull();
    expect(requests.some(item => item.method === "POST" && item.path.endsWith("/media-offers"))).toBe(false);
    expect(document.body.textContent).not.toContain(offerId);
    expect(document.body.textContent).not.toContain(rateRevision);
    expect(document.body.textContent).not.toContain("private-schema");
  });
});

it('does not replace a failed Provider read with a false empty pricing state', async () => {
  setup('1000000000', true);
  const user = userEvent.setup();
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.queryByText('No models configured yet.')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Retry', exact: true }));
  await screen.findByText('example/model');
  expect(screen.queryByText(/Provider data temporarily unavailable/)).toBeNull();
});

it.each([false, true])('creates atomic Provider setup and handles discovery failure=%s after commit', async (discoveryFails) => {
  fixture.context = { token: 'installation-token', session: { kind: 'installation' } } as unknown as DashboardContext;
  const writes: Record<string, unknown>[] = [];
  const reads: string[] = [];
  let created = false;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    reads.push(path);
    if (path === '/api/v1/admin/providers/connections' && init?.method === 'POST') {
      created = true;
      writes.push(JSON.parse(String(init.body)));
      return Response.json({ data: { id: 'configured-api' } });
    }
    if (path.endsWith('/provider') || path.endsWith('/supplier')) return discoveryFails ? Response.json({ error: { message: 'Discovery unavailable' } }, { status: 503 }) : Response.json({ data: { id: supplierId, name: 'Test provider' } });
    if (path === '/api/v1/admin/providers') return Response.json({ data: created ? [{ id: supplierId, name: 'Test provider', members: 0 }] : [] });
    return Response.json({ data: { offers: [], balances: [], consumption: [], settlements: [], earnings: [] } });
  }));
  render(<MemoryRouter initialEntries={['/admin/providers/overview?create=provider']}><Routes><Route path='/admin/providers/:section' element={<ProviderAdministration />} /></Routes></MemoryRouter>);
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Provider name'), 'Test provider');
  await user.type(screen.getByLabelText('Provider API key'), 'fixture-credential');
  expect((screen.getByLabelText('API base URL') as HTMLInputElement).disabled).toBe(false);
  await user.click(screen.getByRole('button', { name: 'Create provider', exact: true }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(writes).toEqual([{ name: 'Test provider', adapter: 'openrouter', api_base: 'https://openrouter.ai/api/v1', api_key: 'fixture-credential', enabled: true, create_supplier: true }]);
  if (discoveryFails) expect(await screen.findByText('API key saved, but Provider details could not be opened. Refresh the Provider list.')).toBeTruthy();
  else {
    expect(await screen.findByText('Provider created. Add models and agreed rates to continue setup.')).toBeTruthy();
    await waitFor(() => expect(reads).toContain(`/api/v1/admin/providers/${supplierId}/administration?days=90`));
  }
  expect(document.body.textContent).not.toContain('fixture-credential');
});

it('records every unpaid earning through a cutoff without request checkboxes', async () => {
  setup('1000000000', false, false, 'settlements');
  const originalFetch = globalThis.fetch;
  const submitted: Record<string, unknown>[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path.includes('/settlements/preview?')) return settlementPreview(path);
    if (path.endsWith('/settlements') && init?.method === 'POST') {
      submitted.push(JSON.parse(String(init.body)));
      return Response.json({data:{id:'settlement',currency:'USD',amount_nanos:'5000000000',entry_count:42,remaining_unpaid_nanos:'0',remaining_entry_count:0}});
    }
    return originalFetch(input, init);
  }));
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', {name:'Record payment'}));
  const dialog = within(screen.getByRole('dialog'));
  await dialog.findByText('Unpaid earnings included: 42');
  expect(dialog.getByText('$5.00', {selector:'strong'})).toBeTruthy();
  expect(dialog.getByText('No unpaid earnings remain in USD.')).toBeTruthy();
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.queryByText(/1,000/)).toBeNull();
  expect(dialog.getByLabelText('Earnings through')).toBeTruthy();
  await user.type(dialog.getByLabelText('External payment reference'), 'October payout');
  await user.click(dialog.getByRole('button', {name:'Record confirmed payment'}));
  await waitFor(() => expect(submitted).toHaveLength(1));
  expect(submitted[0]).toMatchObject({payment_reference:'October payout', currency:'USD'});
  expect(typeof submitted[0].cutoff_ms).toBe('number');
  expect(submitted[0].attempt_ids).toBeUndefined();
  expect(await screen.findByText('Recorded $5.00 across 42 unpaid earnings. $0.00 remains unpaid in USD. No funds were transferred.')).toBeTruthy();
});

it('retries a failed settlement preview without enabling a financial action', async () => {
  setup('1000000000', false, false, 'settlements');
  const originalFetch = globalThis.fetch;
  let reads = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path.includes('/settlements/preview?')) {
      reads++;
      return reads === 1
        ? Response.json({error:{message:'Preview unavailable'}}, {status:503})
        : settlementPreview(path);
    }
    return originalFetch(input, init);
  }));
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', {name:'Record payment'}));
  await screen.findByText('Preview unavailable');
  expect(screen.getByRole('button', {name:'Record confirmed payment'}).hasAttribute('disabled')).toBe(true);
  await user.click(screen.getByRole('button', {name:'Retry preview'}));
  await screen.findByText('Unpaid earnings included: 42');
  expect(screen.getByRole('button', {name:'Record confirmed payment'}).hasAttribute('disabled')).toBe(false);
  expect(reads).toBe(2);
});

it('switches currency without conversion and reports the unpaid balance left after the cutoff', async () => {
  setup('1000000000', false, false, 'settlements', null, undefined, false, 'resale', [
    {currency:'USD', earned_nanos:'5000000000', unpaid_nanos:'5000000000', paid_nanos:'0'},
    {currency:'EUR', earned_nanos:'3000000000', unpaid_nanos:'3000000000', paid_nanos:'0'},
  ]);
  const originalFetch = globalThis.fetch;
  const previews: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path.includes('/settlements/preview?')) {
      previews.push(path);
      const currency = new URL(path, 'http://localhost').searchParams.get('currency');
      return currency === 'EUR'
        ? settlementPreview(path, {currency:'EUR', entry_count:7, amount_nanos:'3000000000', remaining_unpaid_nanos:'2000000000', remaining_entry_count:2})
        : settlementPreview(path);
    }
    return originalFetch(input, init);
  }));
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', {name:'Record payment'}));
  const dialog = within(screen.getByRole('dialog'));
  await dialog.findByText('Unpaid earnings included: 42');
  await user.click(dialog.getByLabelText('Currency'));
  await user.click(screen.getByRole('menuitemradio', {name:/EUR/}));
  await dialog.findByText('Unpaid earnings included: 7');
  expect(dialog.getByText('€2.00 remains unpaid in EUR across 2 earnings.')).toBeTruthy();
  expect(previews.at(-1)).toContain('currency=EUR');
});

it('locks the currency, cutoff and reference after an ambiguous settlement write', async () => {
  setup('1000000000', false, false, 'settlements');
  const originalFetch = globalThis.fetch;
  const submitted: Record<string, unknown>[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path.includes('/settlements/preview?')) return settlementPreview(path);
    if (path.endsWith('/settlements') && init?.method === 'POST') {
      submitted.push(JSON.parse(String(init.body)));
      throw new TypeError('Connection lost');
    }
    return originalFetch(input, init);
  }));
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', {name:'Record payment'}));
  const dialog = within(screen.getByRole('dialog'));
  await dialog.findByText('Unpaid earnings included: 42');
  await user.type(dialog.getByLabelText('External payment reference'), 'Confirmed transfer');
  await user.click(dialog.getByRole('button', {name:'Record confirmed payment'}));
  await screen.findByText('Connection lost');
  expect((dialog.getByLabelText('Currency') as HTMLButtonElement).disabled).toBe(true);
  expect((dialog.getByLabelText('Earnings through') as HTMLInputElement).disabled).toBe(true);
  expect((dialog.getByLabelText('External payment reference') as HTMLInputElement).disabled).toBe(true);
  await user.click(dialog.getByRole('button', {name:'Record confirmed payment'}));
  await waitFor(() => expect(submitted).toHaveLength(2));
  expect(submitted[1]).toEqual(submitted[0]);
});

it.each(['overflow', 'wrong-currency', 'negative-count'])('refuses a malformed %s settlement preview instead of enabling a financial action', async kind => {
  setup('1000000000', false, false, 'settlements');
  const originalFetch = globalThis.fetch;
  const overrides = kind === 'overflow' ? {amount_nanos:'9223372036854775808'}
    : kind === 'wrong-currency' ? {currency:'EUR'}
      : {entry_count:-1};
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    return path.includes('/settlements/preview?') ? settlementPreview(path, overrides) : originalFetch(input, init);
  }));
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', {name:'Record payment'}));
  await screen.findByText('Settlement preview could not be read. Please retry.');
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.getByRole('button', {name:'Record confirmed payment'}).hasAttribute('disabled')).toBe(true);
});

it('shows no settlement form when no unpaid balance exists', async () => {
  setup('1000000000', false, false, 'settlements', null, undefined, false, 'resale', [
    {currency:'USD', earned_nanos:'5000000000', unpaid_nanos:'0', paid_nanos:'5000000000'},
  ]);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', {name:'Record payment'}));
  await screen.findByText('No unpaid earnings are available to settle.');
  expect(screen.queryByLabelText('Earnings through')).toBeNull();
  expect(screen.getByRole('button', {name:'Record confirmed payment'}).hasAttribute('disabled')).toBe(true);
});

it('aborts a settlement preview when its dialog closes and ignores the late result', async () => {
  setup('1000000000', false, false, 'settlements');
  const originalFetch = globalThis.fetch;
  let finish!: (response: Response) => void;
  let signal: AbortSignal | null | undefined;
  let reads = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path.includes('/settlements/preview?')) {
      reads++;
      if (reads === 1) {
        signal = init?.signal;
        return new Promise<Response>(resolve => {finish = resolve;});
      }
      return settlementPreview(path, {entry_count:0, amount_nanos:'0'});
    }
    return originalFetch(input, init);
  }));
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', {name:'Record payment'}));
  await screen.findByText('Calculating unpaid earnings…');
  await user.click(screen.getByRole('button', {name:'Close dialog'}));
  expect(signal?.aborted).toBe(true);
  await act(async () => finish(settlementPreview('/settlements/preview?currency=USD&cutoff_ms=1')));
  await user.click(screen.getByRole('button', {name:'Record payment'}));
  await screen.findByText('No unpaid earnings match this cutoff.');
  expect(screen.queryByText('Unpaid earnings included: 42')).toBeNull();
  expect(reads).toBe(2);
});

it('shows media-only administrator consumption with exact fractional usage and recorded payouts', async () => {
  setup('1000000000', false, true, 'usage', null, [{model_alias:'video/model',meter:'seconds',currency:'USD',rate_revision:'hidden-revision',resolution:'720p',reference_video:false,amount_units:'125',decimal_places:3,per_quantity:{numerator:'1',denominator:'1'},requests:'2',quantity:'3',quantity_denominator:'2',amount_nanos:'750000000',unpaid_nanos:'500000000'}]);
  await screen.findByRole('table',{name:'Media consumption'});
  expect(screen.getByText('3/2 seconds')).toBeTruthy();
  expect(screen.getByText('$0.125')).toBeTruthy();
  expect(screen.getByText('$0.75')).toBeTruthy();
  expect(screen.getByText('$0.5')).toBeTruthy();
  expect(screen.queryByText('No consumption in the last 90 days')).toBeNull();
  expect(screen.queryByText('hidden-revision')).toBeNull();
});

it('continues the admin offer collection beyond its summary cap', async () => {
  const { requests } = setup('1000000000', false, false, 'models', null, [], true);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Load more offers' }));
  await screen.findByText('later/model');
  expect(screen.queryByRole('button', { name: 'Load more offers' })).toBeNull();
  expect(requests.filter(row => row.path.includes('/offers?limit=100&after='))).toHaveLength(1);
});

it('keeps loaded admin offers when continuation fails and retries the same cursor',async()=>{
  const {requests}=setup('1000000000',false,false,'models',null,[],true);
  const user=userEvent.setup();
  await screen.findByRole('button',{name:'Load more offers'});
  const originalFetch=globalThis.fetch;
  let failed=false;
  vi.stubGlobal('fetch',vi.fn((input:RequestInfo|URL,init?:RequestInit)=>{
    if(String(input).includes('/offers?limit=100&after=') && !failed){failed=true;return Promise.resolve(Response.json({error:{message:'Temporarily unavailable'}},{status:503}));}
    return originalFetch(input,init);
  }));
  await user.click(screen.getByRole('button',{name:'Load more offers'}));
  await screen.findByRole('button',{name:'Retry loading offers'});
  expect(screen.getByText('example/model')).toBeTruthy();
  await user.click(screen.getByRole('button',{name:'Retry loading offers'}));
  await screen.findByText('later/model');
  expect(requests.find(row=>row.path.includes('/offers?limit=100&after='))?.path).toContain('after=example%2Fmodel');
});

it('creates a new Provider in Provider Administration, resolves ownership via /supplier (never /provider), and opens it without 404', async () => {
  const createdVendorId = '11111111-1111-4111-8111-111111111111';
  const createdSupplierId = '22222222-2222-4222-8222-222222222222';
  fixture.context = {
    token: 'installation-token-create-provider',
    session: { kind: 'installation', operating_mode: 'resale', operator: { name: 'Administrator' } },
  } as unknown as DashboardContext;

  const providers = [{ id: supplierId, name: 'Example provider', slug: 'example-provider', members: 0 }];
  const requests: { path: string; method: string }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const method = init?.method ?? 'GET';
    requests.push({ path, method });
    if (path === `/api/v1/admin/providers/connections/${createdVendorId}/provider`) {
      return Response.json({ error: { message: 'Not found' } }, { status: 404 });
    }
    if (path === '/api/v1/admin/providers/connections' && method === 'POST') {
      providers.push({ id: createdSupplierId, name: 'New Supply Co', slug: 'new-supply-co', members: 0 });
      return Response.json({ data: { id: createdVendorId } }, { status: 201 });
    }
    if (path === `/api/v1/admin/providers/connections/${createdVendorId}/supplier` && method === 'GET') {
      return Response.json({ data: { id: createdSupplierId, name: 'New Supply Co' } });
    }
    if (path === '/api/v1/admin/providers') {
      return Response.json({ data: providers });
    }
    if (path.startsWith('/api/v1/admin/providers/connections')) {
      return Response.json({ data: [] });
    }
    if (path.includes('/administration?')) {
      return Response.json({
        data: { balances: [], consumption: [], settlements: [], earnings: [], offers_has_more: false, offers: [] },
      });
    }
    if (path.includes('/members')) {
      return Response.json({ data: [] });
    }
    return Response.json({ data: [] });
  }));

  const router = createMemoryRouter(
    [
      { path: '/admin/providers', element: <ProviderAdministration /> },
      { path: '/admin/providers/:providerId/:section?', element: <ProviderAdministration /> },
    ],
    { initialEntries: ['/admin/providers?create=provider'] },
  );
  render(<RouterProvider router={router} />);
  const user = userEvent.setup();
  const dialog = await screen.findByRole('dialog');
  await user.type(within(dialog).getByLabelText('Provider name'), 'New Supply Co');
  await user.type(within(dialog).getByLabelText('Provider API key'), 'sk-test-new-supply');
  await user.click(within(dialog).getByRole('button', { name: 'Create provider' }));

  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await screen.findByText('Provider created. Add models and agreed rates to continue setup.');
  expect(screen.queryByText(/Provider details could not be opened/)).toBeNull();
  expect(requests.some(req => req.path === `/api/v1/admin/providers/connections/${createdVendorId}/supplier` && req.method === 'GET')).toBe(true);
  expect(requests.some(req => req.path.endsWith('/provider'))).toBe(false);
  await waitFor(() => expect(requests.some(req => req.path.includes(`/api/v1/admin/providers/${createdSupplierId}/administration`))).toBe(true));
});
