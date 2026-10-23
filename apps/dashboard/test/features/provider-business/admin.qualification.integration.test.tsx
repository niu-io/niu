vi.mock('../../../src/app/platform-currency',()=>({usePlatformCurrency:()=>({currency:'USD',error:'',reload:()=>{}})}));
import { describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider, MemoryRouter, Route, Routes } from "react-router";
import ProviderAdministration from "../../../src/features/provider-business/admin";
import type { DashboardContext } from "../../../src/app/dashboard-context";

const fixture = vi.hoisted(() => ({ context: {} as DashboardContext }));
vi.mock("../../../src/app/dashboard-context", () => ({
  useDashboardContext: () => fixture.context,
}));

const supplierId = "9cc6b65a-0b19-4f18-8828-89d6038973f0";
const offerId = "f31c9646-b8df-4090-aa8b-a9794dfe62bd";
const rateRevision = "7c923678-90fa-4a66-8343-a3e34975859b";
const sha256 = "a".repeat(64);

function setup(promptRate = "1000000000", failInitialRead = false, media = false, section = "models", cachedRate: string | null = null, mediaConsumption?: unknown[], offersHasMore = false) {
  fixture.context = {
    token: "installation-token",
    session: { kind: "installation", operator: { name: "Administrator" } },
  } as unknown as DashboardContext;

  let supplierQualified = false;
  let offerQualified = false;
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
        data: [{ id: supplierId, name: "Example provider", members: 0, qualification_status: supplierQualified ? "qualified" : "unqualified" }],
      });
    }
    if (path === `/api/v1/providers/${supplierId}/administration?days=90`) {
      if (failInitialRead) {
        failInitialRead = false;
        return Response.json({ error: { message: 'Provider data temporarily unavailable' } }, { status: 503 });
      }
      return Response.json({
        data: {
          balances: [], consumption: [], media_consumption: mediaConsumption, settlements: [], earnings: [], offers_has_more: offersHasMore,
          offers: [{
            id: offerId,
            model_alias: "example/model",
            revision: rateRevision,
            rate_kind: media ? "media" : "text",
            currency: media ? null : "USD",
            prompt_rate: media ? null : promptRate,
            completion_rate: media ? null : "2000000000",
            cached_prompt_rate: cachedRate,
            active: false,
            qualified: offerQualified,
            route_ready: false,
          }],
        },
      });
    }
    if (path.includes('/media-offer-models')) return Response.json({data:[{model_alias:'example/model',api_key_name:'Video credential',vendor_id:supplierId,vendor_revision:'2',model_revision:'1',schema_revision:'private-schema',channel:'ark-direct-v1',offer_revision:rateRevision}],has_more:false,next_after:null});
    if (offersHasMore && path.includes('/offers?limit=100&after=')) return Response.json({data:[{id:'later-offer',model_alias:'later/model',revision:'later-revision',rate_kind:'text',currency:'USD',prompt_rate:'3000000000',completion_rate:'4000000000',active:false,qualified:false,route_ready:false}],next_after:null});
    if (path.includes('/media-rates')) return Response.json({data:[],has_more:false,next_after:null});
    if (path === `/api/v1/providers/${supplierId}/qualification` && method === "PUT") {
      supplierQualified = true;
      return Response.json({ data: { qualification_status: "qualified" } });
    }
    if (path === `/api/v1/providers/${supplierId}/offers/${offerId}/qualification` && method === "PUT") {
      offerQualified = true;
      return Response.json({ data: { qualification_status: "qualified" } });
    }
    if (path === `/api/v1/providers/${supplierId}/offers/${offerId}/qualification/revoke` && method === "POST") {
      offerQualified = false;
      return Response.json({ data: { qualification_status: "revoked" } });
    }
    return Response.json({ data: {} });
  });
  vi.stubGlobal("fetch", fetchMock);

  const router = createMemoryRouter([{ path: "/admin/providers/:providerId/:section", element: <ProviderAdministration /> }], { initialEntries: [`/admin/providers/${supplierId}/${section}?view=text`] });
  render(<RouterProvider router={router} />);
  return { requests, router };
}

describe("installation Provider qualification workflow", () => {
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

  it("separates media offers from text rates and preselects a named configuration for update", async () => {
    setup("1000000000", false, true);
    const user=userEvent.setup();
    await screen.findByText("No agreed model rates");
    await user.click(screen.getByRole("tab",{name:"Media rates"}));
    expect(await screen.findByText("example/model")).toBeTruthy();
    expect(screen.queryByText("$1.00")).toBeNull();
    await user.click(screen.getByRole("button",{name:"Actions for example/model"}));
    expect(screen.getByRole("menuitem",{name:"Review offer"}).getAttribute("aria-disabled")).toBe("true");
    await user.click(screen.getByRole("menuitem",{name:"Update configuration"}));
    await waitFor(()=>expect(screen.getByLabelText("Model").textContent).toContain("example/model · Video credential"));
    expect(document.body.textContent).not.toContain(offerId);
    expect(document.body.textContent).not.toContain(rateRevision);
    expect(document.body.textContent).not.toContain("private-schema");
  });

  it("requires provider review before offer review and binds the offer review to current rates", async () => {
    const { requests } = setup();
    const user = userEvent.setup();

    expect(await screen.findByText("Qualification required")).toBeTruthy();
    await user.click(await screen.findByRole("button", { name: "Actions for example/model" }));
    const offerReview = screen.getByRole("menuitem", { name: "Review offer" });
    expect(offerReview.getAttribute("aria-disabled")).toBe("true");
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "Review Provider" }));
    await user.type(screen.getByLabelText("Supply-rights evidence SHA-256"), "invalid");
    await user.click(screen.getByRole("button", { name: "Record review" }));
    expect(requests.some((request) => request.path.endsWith("/qualification") && request.method === "PUT")).toBe(false);

    await user.clear(screen.getByLabelText("Supply-rights evidence SHA-256"));
    await user.click(screen.getByLabelText("Supply-rights evidence SHA-256"));
    await user.paste(sha256);
    await user.click(screen.getByLabelText("Supply-capability evidence SHA-256"));
    await user.paste(sha256);
    await user.click(screen.getByLabelText("Data-handling evidence SHA-256"));
    await user.paste(sha256);
    await user.click(screen.getByRole("button", { name: "Record review" }));
    await waitFor(() => expect(requests.some((request) => request.path === `/api/v1/providers/${supplierId}/qualification` && request.method === "PUT")).toBe(true));

    await user.click(await screen.findByRole("button", { name: "Actions for example/model" }));
    expect(screen.getByRole("menuitem", { name: "Review offer" }).getAttribute("aria-disabled")).not.toBe("true");
    await user.click(screen.getByRole("menuitem", { name: "Review offer" }));
    await user.click(screen.getByLabelText("Model-identity evidence SHA-256"));
    await user.paste(sha256);
    await user.click(screen.getByLabelText("Protocol test-matrix SHA-256"));
    await user.paste(sha256);
    await user.type(screen.getByLabelText("Protocol matrix version"), "2026-09");
    await user.click(screen.getByLabelText("Offer data-handling evidence SHA-256"));
    await user.paste(sha256);
    await user.click(screen.getByLabelText("Availability evidence SHA-256"));
    await user.paste(sha256);
    await user.click(screen.getByLabelText("Agreed-rate evidence SHA-256"));
    await user.paste(sha256);
    await user.click(screen.getByRole("button", { name: "Record review" }));

    await waitFor(() => {
      const offerWrite = requests.find((request) => request.path === `/api/v1/providers/${supplierId}/offers/${offerId}/qualification` && request.method === "PUT");
      expect(offerWrite?.body).toMatchObject({
        rate_revision: rateRevision,
        model_identity_sha256: sha256,
        protocol_matrix_version: "2026-09",
        agreed_rates_sha256: sha256,
      });
    });
    expect(document.body.textContent).not.toContain(supplierId);
    expect(document.body.textContent).not.toContain(offerId);
    expect(document.body.textContent).not.toContain(rateRevision);
    expect(await screen.findByText("Qualification review recorded. No discount or model-equivalence claim is implied.")).toBeTruthy();

    await user.click(await screen.findByRole("button", { name: "Actions for example/model" }));
    await user.click(screen.getByRole("menuitem", { name: "Revoke review" }));
    await user.click(screen.getByLabelText("Revocation reason SHA-256"));
    await user.paste(sha256);
    await user.click(screen.getByRole("button", { name: "Revoke and pause offers" }));
    await waitFor(() => {
      const revocation = requests.find((request) => request.path === `/api/v1/providers/${supplierId}/offers/${offerId}/qualification/revoke` && request.method === "POST");
      expect(revocation?.body).toEqual({ reason_sha256: sha256 });
    });
    expect(await screen.findByText("Qualification review revoked; affected offers are paused.")).toBeTruthy();
    await user.click(await screen.findByRole("button", { name: "Actions for example/model" }));
    expect(screen.getByRole("menuitem", { name: "Review offer" })).toBeTruthy();
  }, 30_000);
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
    if (path === '/api/v1/providers') return Response.json({ data: created ? [{ id: supplierId, name: 'Test provider', members: 0, qualification_status: 'unqualified' }] : [] });
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

it('retains selected earnings across an older-page failure and retry, using the full history total', async () => {
  setup('1000000000', false, false, 'settlements');
  const originalFetch = globalThis.fetch;
  let olderReads = 0;
  const earning = (id: string, amount: string) => ({id, model_alias: `model-${id}`, amount_nanos: amount, currency: 'USD', status: 'accrued', created_at: '2026-10-10T12:00:00Z'});
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path.includes('/earnings?')) {
      if (path.includes('before=')) {
        olderReads++;
        if (olderReads === 1) return Response.json({error:{message:'History unavailable'}}, {status:503});
        return Response.json({data:[earning('first','1000000000'), earning('older','2000000000')], next_cursor:null});
      }
      return Response.json({data:[earning('first','1000000000')], next_cursor:'older-cursor'});
    }
    return originalFetch(input, init);
  }));
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', {name:'Record payment'}));
  await user.click(await screen.findByRole('checkbox'));
  await user.click(screen.getByRole('button', {name:'Older earnings'}));
  await screen.findByText('History unavailable');
  expect(screen.getByRole('checkbox').getAttribute('data-state')).toBe('checked');
  await user.click(screen.getByRole('button', {name:'Retry earnings'}));
  await screen.findByText('model-older');
  expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  await user.click(screen.getAllByRole('checkbox')[1]);
  expect(screen.getByText('$3.00')).toBeTruthy();
  expect(olderReads).toBe(2);
  expect(screen.queryByText('older-cursor')).toBeNull();
});

it('retries a failed initial earning read without falling back to overview rows', async () => {
  setup('1000000000', false, false, 'settlements');
  const originalFetch = globalThis.fetch;
  let reads = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes('/earnings?')) {
      reads++;
      return reads === 1 ? Response.json({error:{message:'History unavailable'}}, {status:503}) : Response.json({data:[],next_cursor:null});
    }
    return originalFetch(input, init);
  }));
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', {name:'Record payment'}));
  await screen.findByText('History unavailable');
  expect(screen.queryByText('No unpaid earnings in the loaded history.')).toBeNull();
  await user.click(screen.getByRole('button', {name:'Retry earnings'}));
  await screen.findByText('No unpaid earnings in the loaded history.');
  expect(screen.getByRole('button', {name:'Record confirmed payment'}).hasAttribute('disabled')).toBe(true);
  expect(reads).toBe(2);
});

it('aborts earning history when its dialog closes and ignores the late result', async () => {
  setup('1000000000', false, false, 'settlements');
  const originalFetch = globalThis.fetch;
  let finish!: (response: Response) => void;
  let signal: AbortSignal | null | undefined;
  let reads = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes('/earnings?')) {
      reads++;
      if (reads === 1) {
        signal = init?.signal;
        return new Promise<Response>(resolve => {finish = resolve;});
      }
      return Response.json({data:[],next_cursor:null});
    }
    return originalFetch(input, init);
  }));
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', {name:'Record payment'}));
  await screen.findByText('Loading earnings…');
  await user.click(screen.getByRole('button', {name:'Close dialog'}));
  expect(signal?.aborted).toBe(true);
  await act(async () => finish(Response.json({data:[{id:'late',model_alias:'Late model',amount_nanos:'1000000000',currency:'USD',status:'accrued',created_at:'2026-10-10T12:00:00Z'}],next_cursor:null})));
  await user.click(screen.getByRole('button', {name:'Record payment'}));
  await screen.findByText('No unpaid earnings in the loaded history.');
  expect(screen.queryByText('Late model')).toBeNull();
});

it('locks a submitted payment selection and reference so an ambiguous retry preserves the original request', async () => {
  setup('1000000000', false, false, 'settlements');
  const originalFetch = globalThis.fetch;
  const submitted: unknown[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes('/earnings?')) return Response.json({data:[{id:'earning',model_alias:'Selected model',amount_nanos:'1000000000',currency:'USD',status:'accrued',created_at:'2026-10-10T12:00:00Z'}],next_cursor:null});
    if (String(input).endsWith('/settlements') && init?.method === 'POST') {
      submitted.push(JSON.parse(String(init.body)));
      throw new TypeError('Connection lost');
    }
    return originalFetch(input, init);
  }));
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', {name:'Record payment'}));
  await user.click(await screen.findByRole('checkbox'));
  await user.type(screen.getByRole('textbox', {name:'External payment reference'}), 'Confirmed transfer');
  await user.click(screen.getByRole('button', {name:'Record confirmed payment'}));
  await screen.findByText('Connection lost');
  expect(screen.getByRole('checkbox').hasAttribute('disabled')).toBe(true);
  expect(screen.getByRole('textbox', {name:'External payment reference'}).hasAttribute('disabled')).toBe(true);
  await user.click(screen.getByRole('button', {name:'Record confirmed payment'}));
  await waitFor(() => expect(submitted).toHaveLength(2));
  expect(submitted[1]).toEqual(submitted[0]);
});

it('removes a selected earning when a continuation reports that it has already been paid', async () => {
  setup('1000000000', false, false, 'settlements');
  const originalFetch = globalThis.fetch;
  const row = {id:'earning',model_alias:'Previously unpaid',amount_nanos:'1000000000',currency:'USD',status:'accrued',created_at:'2026-10-10T12:00:00Z'};
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes('/earnings?')) return Response.json(String(input).includes('before=') ? {data:[{...row,status:'paid'}],next_cursor:null} : {data:[row],next_cursor:'older'});
    return originalFetch(input, init);
  }));
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', {name:'Record payment'}));
  await user.click(await screen.findByRole('checkbox'));
  await user.click(screen.getByRole('button', {name:'Older earnings'}));
  await screen.findByText('No unpaid earnings in the loaded history.');
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.getByText(/0 requests selected/)).toBeTruthy();
  expect(screen.getByRole('button', {name:'Record confirmed payment'}).hasAttribute('disabled')).toBe(true);
});

it.each(['duplicate', 'overflow', 'invalid-currency', 'empty-cursor'])('refuses malformed %s earning pages instead of enabling a financial action', async kind => {
  setup('1000000000', false, false, 'settlements');
  const originalFetch = globalThis.fetch;
  const row = {id:'earning',model_alias:'Invalid financial record',amount_nanos:kind === 'overflow' ? '9223372036854775808' : '1000000000',currency:kind === 'invalid-currency' ? 'bad' : 'USD',status:'accrued',created_at:'2026-10-10T12:00:00Z'};
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => String(input).includes('/earnings?') ? Response.json({data:kind === 'duplicate' ? [row,row] : [row],next_cursor:kind === 'empty-cursor' ? '' : null}) : originalFetch(input, init)));
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', {name:'Record payment'}));
  await screen.findByText('Earning history could not be read. Please retry.');
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.getByRole('button', {name:'Record confirmed payment'}).hasAttribute('disabled')).toBe(true);
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
