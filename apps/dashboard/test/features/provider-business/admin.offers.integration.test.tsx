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
    if (path.startsWith("/api/v1/vendors")) return Response.json({data:[]});
    if (path === "/api/v1/operators") return Response.json({ data: [
      { id: "account-demo", name: "Demo", revoked: false },
      { id: "account-revoked", name: "Revoked account", revoked: true },
    ] });
    if (path === `/api/v1/providers/${supplierId}/members`) return Response.json({ data: [
      { operator_id: "account-demo", name: "Demo", role: "manager", active: true, revoked: false },
      { operator_id: "account-revoked", name: "Revoked account", role: "viewer", active: false, revoked: true },
    ] });

    if (path === "/api/v1/providers") {
      return Response.json({
        data: [{ id: supplierId, name: "Example provider", members: 0 }],
      });
    }
    if (path === `/api/v1/providers/${supplierId}/administration?days=90`) {
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
    if (path === `/api/v1/providers/${supplierId}/offers/${offerId}/authorization` && method === "PUT") {
      offerActive = true; offerQualified = true;
      return Response.json({data:{active:true,authorization_id:"authorization"}});
    }
    if (path === `/api/v1/providers/${supplierId}/offers/${offerId}` && method === "PATCH") {
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
  it("does not present commercial setup as required for internal Provider overview", async () => {
    setup("1000000000", false, false, "overview", null, undefined, false, 'internal');
    await screen.findByText('Connect an API key and discover models for internal use.');
    await screen.findByText('1. Connect upstream API key');
    expect(screen.queryByText('3. Set customer selling prices')).toBeNull();
    expect(screen.queryByText('Model offers')).toBeNull();
    expect(screen.queryByText('Provider qualification')).toBeNull();
    expect(screen.queryByText('Provider payables')).toBeNull();
  });

  it("ignores a commercial rates deep link in internal mode", async () => {
    setup("1000000000", false, false, "models", null, undefined, false, 'internal');
    await screen.findByText('Manage model connections and availability.');
    await screen.findByText('No models configured yet.');
    expect(screen.queryByRole('tab', {name: 'Text rates'})).toBeNull();
    expect(screen.queryByRole('tab', {name: 'Media rates'})).toBeNull();
    expect(screen.queryByText('Provider qualification')).toBeNull();
    expect(screen.queryByRole('button', {name: 'Set agreed rates'})).toBeNull();
    expect(screen.queryByText('example/model')).toBeNull();
  });
  it("ignores a previous Provider save failure after navigation", async () => {
    const { router } = setup("1000000000", false, false, "members");
    const originalFetch = globalThis.fetch;
    let finish!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => init?.method === "PUT"
      ? new Promise<Response>(resolve => { finish = resolve; })
      : originalFetch(input, init)));
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Edit access for Demo" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save", exact: true }).hasAttribute("disabled")).toBe(false));
    await user.click(screen.getByRole("button", { name: "Save", exact: true }));
    await act(async () => { await router.navigate('/admin/providers/another-supplier/members'); });
    await act(async () => { finish(Response.json({ error: { message: "Previous Provider save failed" } }, { status: 503 })); });
    expect(screen.queryByText("Previous Provider save failed")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("discards an open membership draft when the Provider changes", async () => {
    const { router } = setup("1000000000", false, false, "members");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Edit access for Demo" }));
    await screen.findByRole("dialog", { name: "Manage provider portal access" });
    await act(async () => { await router.navigate('/admin/providers/another-supplier/members'); });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByText("Provider configuration saved.")).toBeNull();
  });
  it("shows named memberships and prefills existing access without exposing identifiers", async () => {
    setup("1000000000", false, false, "members");
    const user = userEvent.setup();
    await screen.findByRole("button", { name: "Edit access for Demo" });
    expect(screen.queryByText("account-demo")).toBeNull();
    expect(screen.getByRole("button", { name: "Edit access for Revoked account" }).hasAttribute("disabled")).toBe(true);
    await user.click(screen.getByRole("button", { name: "Edit access for Demo" }));
    await waitFor(() => expect(screen.getByLabelText("Account").textContent).toContain("Demo"));
    expect(screen.getByLabelText("Provider role").textContent).toContain("Manager");
    expect(screen.getByLabelText("Access").textContent).toContain("Grant access");
  });
  it("selects an active account by name while retaining its identifier only in the request", async () => {
    const { requests } = setup("1000000000", false, false, "members");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Manage portal access" }));
    await waitFor(() => expect(screen.getByLabelText("Account").hasAttribute("disabled")).toBe(false));
    expect(screen.getByRole("button", { name: "Save", exact: true }).hasAttribute("disabled")).toBe(true);
    await user.click(screen.getByLabelText("Account"));
    expect(screen.queryByRole("menuitemradio", { name: "Revoked account" })).toBeNull();
    expect(screen.queryByText("account-demo")).toBeNull();
    await user.click(screen.getByRole("menuitemradio", { name: "Demo" }));
    await user.click(screen.getByRole("button", { name: "Save", exact: true }));
    await waitFor(() => expect(requests.some(item => item.path === `/api/v1/providers/${supplierId}/members/account-demo` && item.method === "PUT")).toBe(true));
  });
  it("summarizes media offers on Overview and links to dedicated pricing without repeating rates", async () => {
    setup("1000000000", false, true, "overview");
    const link=await screen.findByRole("link",{name:"Models"});
    expect(link.getAttribute("href")).toBe(`/admin/providers/${supplierId}/models`);
    expect(screen.getByText("Media offers").parentElement?.textContent).toBe("Media offers1");
    expect(screen.getByText("Text offers").parentElement?.textContent).toBe("Text offers0");
    expect(screen.getByText("Active offers").parentElement?.textContent).toBe("Active offers0");
    expect(screen.queryByRole("columnheader", { name: "Purchase rate" })).toBeNull();
    expect(screen.queryByText("Configuration saved")).toBeNull();
    await userEvent.setup().click(link);
    expect(await screen.findByRole("tab",{name:"Media rates"})).toBeTruthy();
    expect(screen.getByRole("tab",{name:"Models",exact:true}).getAttribute("aria-selected")).toBe("true");
  });

  it("lists every configured video model in Media rates and opens one rate action without a pinning step", async () => {
    const { requests } = setup("1000000000", false, true);
    const user=userEvent.setup();
    await screen.findByText("No agreed model rates");
    await user.click(screen.getByRole("tab",{name:"Media rates"}));
    expect(await screen.findByRole("heading",{name:"Configured video models"})).toBeTruthy();
    expect(await screen.findByText("example/model")).toBeTruthy();
    expect(screen.getByText("Offer paused")).toBeTruthy();
    expect(screen.queryByText("$1.00")).toBeNull();
    expect(screen.queryByText("Set up media offer")).toBeNull();
    expect(requests.some(item => item.method === "POST" && item.path.endsWith("/media-offers"))).toBe(false);
    await user.click(screen.getByRole("button",{name:"Set rate for example/model"}));
    await waitFor(()=>expect(screen.getByLabelText("Model").textContent).toContain("example/model · Video credential"));
    expect(screen.getByText(/creates the offer binding/)).toBeTruthy();
    expect(document.body.textContent).not.toContain(offerId);
    expect(document.body.textContent).not.toContain(rateRevision);
    expect(document.body.textContent).not.toContain("private-schema");
  });

  it("enables the confirmed offer revision without requesting evidence hashes and can pause it", async () => {
    const {requests}=setup(); const user=userEvent.setup();
    await user.click(await screen.findByRole("button",{name:"Actions for example/model"}));
    await user.click(screen.getByRole("menuitem",{name:"Enable offer"}));
    expect(screen.queryByText(/SHA-256/)).toBeNull();
    expect(screen.getByText(/Provider connection, customer selling price/)).toBeTruthy();
    await user.click(screen.getByRole("button",{name:"Enable offer",exact:true}));
    await waitFor(()=>expect(requests.find(item=>item.path.endsWith("/authorization") && item.method==="PUT")?.body).toEqual({rate_revision:rateRevision}));
    await screen.findByText("Offer enabled. Provider access and customer selling prices remain separate.");
    await user.click(await screen.findByRole("button",{name:"Actions for example/model"}));
    await user.click(await screen.findByRole("menuitem",{name:"Pause offer"}));
    await user.click(screen.getByRole("button",{name:"Pause offer",exact:true}));
    await waitFor(()=>expect(requests.find(item=>item.path===`/api/v1/providers/${supplierId}/offers/${offerId}` && item.method==="PATCH")?.body).toEqual({active:false}));
    expect(document.body.textContent).not.toContain(offerId);
    expect(document.body.textContent).not.toContain(rateRevision);
  });

});

it('edits current agreed rates with exact decimal values and the saved revision', async () => {
  const { requests } = setup('1234567891');
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Actions for example/model' }));
  await user.click(screen.getByRole('menuitem', { name: 'Edit rates', exact: true }));
  const alias = screen.getByLabelText('Existing upstream model alias') as HTMLInputElement;
  expect(alias.value).toBe('example/model');
  expect(alias.readOnly).toBe(true);
  expect((screen.getByLabelText('Input payout per million tokens') as HTMLInputElement).value).toBe('1.234567891');
  expect((screen.getByLabelText('Output payout per million tokens') as HTMLInputElement).value).toBe('2');
  await user.clear(screen.getByLabelText('Output payout per million tokens'));
  await user.click(screen.getByLabelText('Output payout per million tokens'));
  await user.paste('2.000000001');
  await user.click(screen.getByRole('button', { name: 'Save', exact: true }));
  await waitFor(() => expect(requests.find(item => item.method === 'POST' && item.path.endsWith('/offers'))?.body).toEqual({
    model_alias: 'example/model', currency: 'USD', prompt_rate: '1234567891',
    completion_rate: '2000000001', cached_prompt_rate: null, expected_revision: rateRevision,
  }));
});

it('does not replace a failed Provider read with a false empty pricing state', async () => {
  setup('1000000000', true);
  const user = userEvent.setup();
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.queryByText('No agreed model rates')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Retry', exact: true }));
  await user.click(await screen.findByRole('button', { name: 'Actions for example/model' }));
  expect(screen.getByRole('menuitem', { name: 'Edit rates', exact: true })).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
});

it.each([false, true])('creates atomic Provider setup and handles discovery failure=%s after commit', async (discoveryFails) => {
  fixture.context = { token: 'installation-token', session: { kind: 'installation' } } as unknown as DashboardContext;
  const writes: Record<string, unknown>[] = [];
  const reads: string[] = [];
  let created = false;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    reads.push(path);
    if (path === '/api/v1/vendors' && init?.method === 'POST') {
      created = true;
      writes.push(JSON.parse(String(init.body)));
      return Response.json({ data: { id: 'configured-api' } });
    }
    if (path.endsWith('/provider') || path.endsWith('/supplier')) return discoveryFails ? Response.json({ error: { message: 'Discovery unavailable' } }, { status: 503 }) : Response.json({ data: { id: supplierId, name: 'Test provider' } });
    if (path === '/api/v1/providers') return Response.json({ data: created ? [{ id: supplierId, name: 'Test provider', members: 0 }] : [] });
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
    await waitFor(() => expect(reads).toContain(`/api/v1/providers/${supplierId}/administration?days=90`));
  }
  expect(document.body.textContent).not.toContain('fixture-credential');
});


describe('Provider cached-input rates', () => {
  it.each([
    ['preserve', '0.123456789', '123456789'],
    ['clear', '', null],
    ['zero', '0', '0'],
  ])('%s an existing cached rate explicitly when replacing an offer', async (_action, value, expected) => {
    const { requests } = setup('1000000000', false, false, 'models', '123456789');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Actions for example/model' }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit rates' }));
    const cached = screen.getByLabelText('Cache read payout per million tokens') as HTMLInputElement;
    expect(cached.value).toBe('0.123456789');
    await user.clear(cached);
    if (value) await user.type(cached, value);
    await user.click(screen.getByRole('button', { name: 'Save', exact: true }));
    await waitFor(() => expect(requests.find(item => item.method === 'POST' && item.path.endsWith('/offers'))?.body).toEqual({
      model_alias: 'example/model', currency: 'USD', prompt_rate: '1000000000',
      completion_rate: '2000000000', cached_prompt_rate: expected, expected_revision: rateRevision,
    }));
  });
  it('rejects an invalid cache rate before publishing a new revision', async () => {
    const { requests } = setup();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Actions for example/model' }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit rates' }));
    await user.type(screen.getByLabelText('Cache read payout per million tokens'), '0.0000000001');
    await user.click(screen.getByRole('button', { name: 'Save', exact: true }));
    expect(await screen.findByText('Rates require a nonnegative amount with at most 9 decimal places.')).toBeTruthy();
    expect(requests.some(item => item.method === 'POST' && item.path.endsWith('/offers'))).toBe(false);
  });
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

it('continues the admin offer collection and reloads current terms beyond its summary cap', async () => {
  const {requests}=setup('1000000000',false,false,'models',null,[],true);
  const user=userEvent.setup();
  await user.click(await screen.findByRole('button',{name:'Load more offers'}));
  await screen.findByText('later/model');
  expect(screen.queryByRole('button',{name:'Load more offers'})).toBeNull();
  await user.click(screen.getByRole('button',{name:'Actions for later/model'}));
  await user.click(screen.getByRole('menuitem',{name:'Edit rates'}));
  await waitFor(()=>expect(screen.getByLabelText('Input payout per million tokens')).toHaveProperty('value','3'));
  expect(requests.filter(row=>row.path.includes('/offers?limit=100&after='))).toHaveLength(2);
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
