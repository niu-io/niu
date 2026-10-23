vi.mock('../../../src/app/platform-currency', () => ({usePlatformCurrency:()=>({currency:'USD',error:'',reload:()=>{}})}));
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, Link } from "react-router";
import ProviderBusinessRoute from "../../../src/features/provider-business/page";
import type { DashboardContext } from "../../../src/app/dashboard-context";
const fixture = vi.hoisted(() => ({ context: {} as DashboardContext }));
vi.mock("../../../src/app/dashboard-context", () => ({
  useDashboardContext: () => fixture.context,
}));
const response = {
  id: "supplier",
  name: "Example provider",
  days: 30,
  balances: [
    {
      currency: "USD",
      earned_nanos: "1200000000",
      unpaid_nanos: "1000000000",
      paid_nanos: "200000000",
      period_nanos: "1200000000",
    },
  ],
  traffic: {
    requests: "12",
    completed: "10",
    unresolved: "2",
    prompt_tokens: "1000000",
    completion_tokens: "200000",
  },
  daily: [],
  offers: [
    {
      id: "offer",
      model_alias: "qwen/qwen3",
      active: true,
      route_ready: true,
      revision: "v1",
      currency: "USD",
      prompt_rate: "1000000000",
      completion_rate: "2000000000",
    },
  ],
  media_consumption: [],
  consumption: [],
  settlements: [],
};
function setup(role?: "manager" | "viewer") {
  fixture.context = {
    token: "test",
    session: {
      kind: "operator",
      operator: null,
      permissions: { read: true, write: true, manage_operators: true },
      provider_memberships: role
        ? [{ id: "supplier", name: "Example provider", role }]
        : [],
    },
    refreshWorkspace: vi.fn().mockResolvedValue(undefined),
  } as unknown as DashboardContext;
  return render(
    <MemoryRouter initialEntries={["/suppliers/supplier"]}>
      <Link to="/suppliers/supplier/models">Model offers</Link><Link to="/suppliers/supplier/usage">Consumption</Link><Routes>
        <Route
          path="/suppliers/:supplier/:section?"
          element={<ProviderBusinessRoute />}
        />
      </Routes>
    </MemoryRouter>,
  );
}
describe("provider business access and earnings", () => {
  it("renders media offers without text-price placeholders or a null currency choice", async () => {
    vi.stubGlobal("fetch", vi.fn(async input => String(input).includes("/media-rates") ? Response.json({data:[],has_more:false,next_after:null}) : Response.json({data:{...response,offers:[{...response.offers[0],rate_kind:"media",currency:null,prompt_rate:null,completion_rate:null}]}})));
    setup("viewer");
    await screen.findByText("$1.2");
    await userEvent.setup().click(screen.getByRole("link", {name:"Model offers",exact:true}));
    expect(screen.getByText("See agreed media rates below.")).toBeTruthy();
    expect(screen.queryByText("Input")).toBeNull();
    expect(screen.queryByText("Output")).toBeNull();
  });

  it.each([['100000000', '$0.1', false], ['0', '$0.00', false], [null, '$1.00', true]])('shows a supplier-owned cache rate, including zero and input-rate fallback', async (cachedRate, expected, fallback) => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({data:{...response,offers:[{...response.offers[0],cached_prompt_rate:cachedRate}]}})));
    setup('viewer');
    await screen.findByText('$1.2');
    await userEvent.setup().click(screen.getByRole('link', {name:'Model offers',exact:true}));
    const label = screen.getByText('Cache read');
    expect(label.textContent).toContain(expected);
    expect(label.textContent?.includes('(Input rate)')).toBe(fallback);
    expect(screen.queryByRole('button', {name:'Pause'})).toBeNull();
  });

  it.each([['0', '0'], [null, 'Unknown']])('keeps the cache token subset separate from input/output totals', async (cachedTokens, expected) => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({data:{...response,consumption:[{model_alias:'qwen/qwen3',revision:'private-revision',currency:'USD',prompt_rate:'1000000000',completion_rate:'2000000000',cached_prompt_rate:'0',cached_prompt_tokens:cachedTokens,requests:'1',prompt_tokens:'12',completion_tokens:'6',amount_nanos:'100',unpaid_nanos:'100'}]}})));
    setup('viewer');
    await screen.findByText('$1.2');
    await userEvent.setup().click(screen.getByRole('link', {name:'Consumption',exact:true}));
    expect(screen.getByText(`Cached: ${expected}`).parentElement?.textContent).toContain('12 / 6');
    expect(screen.getByText('Cache read: $0.00')).toBeTruthy();
    expect(document.body.textContent).not.toContain('private-revision');
  });

  it("denies a customer even when they manage workspace operators, without fetching earnings", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    setup();
    expect(screen.getByText("Provider access required")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("shows earnings independently from unresolved usage and does not give viewers offer controls", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ data: response }))),
    );
    setup("viewer");
    expect(await screen.findByText("$1.2")).toBeTruthy();
    expect(screen.getByText("Awaiting earnings reconciliation")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    await userEvent
      .setup()
      .click(screen.getByRole("link", { name: "Model offers", exact: true }));
    expect(screen.getByText("qwen/qwen3")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Pause" })).toBeNull();
  });
  it("allows explicit provider managers to pause an offer with a scoped API mutation", async () => {
    const fetch = vi.fn(
      async (_url: unknown, init?: RequestInit) =>
        new Response(
          JSON.stringify({
            data: init?.method === "PATCH" ? { active: false } : response,
          }),
        ),
    );
    vi.stubGlobal("fetch", fetch);
    setup("manager");
    await screen.findByText("$1.2");
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("link", { name: "Model offers", exact: true }),
    );
    await user.click(screen.getByRole("button", { name: "Pause" }));
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(
          ([url, init]) =>
            url === "/api/v1/providers/supplier/offers/offer" &&
            init?.method === "PATCH" &&
            init.body === '{"active":false}',
        ),
      ).toBe(true),
    );
  });
  it("clears financial data and rechecks session after membership revocation", async () => {
    let revoked = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        revoked
          ? new Response(
              JSON.stringify({ error: { message: "Access revoked" } }),
              { status: 404 },
            )
          : new Response(JSON.stringify({ data: response })),
      ),
    );
    setup("viewer");
    await screen.findByText("$1.2");
    revoked = true;
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Refresh provider data" }));
    await screen.findByText("Access revoked");
    expect(screen.queryByText("$1.2")).toBeNull();
    expect(fixture.context.refreshWorkspace).toHaveBeenCalled();
  });
});

it("reports model consumption without customer request identifiers", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              ...response,
              consumption: [
                {
                  model_alias: "qwen/qwen3",
                  revision: "rate-1",
                  currency: "USD",
                  prompt_rate: "1000000000",
                  completion_rate: "2000000000",
                  requests: "12",
                  prompt_tokens: "1000000",
                  completion_tokens: "200000",
                  amount_nanos: "1400000000",
                  unpaid_nanos: "1400000000",
                },
              ],
            },
          }),
        ),
    ),
  );
  setup("viewer");
  await screen.findByText("$1.2");
    await userEvent
      .setup()
      .click(screen.getByRole("link", { name: "Consumption", exact: true }));
    expect(
      await screen.findByRole("heading", { name: "Model usage" }),
    ).toBeTruthy();
  expect(screen.getAllByText("$1.4").length).toBe(2);
  expect(screen.queryByRole("columnheader", { name: "Customer" })).toBeNull();
  expect(screen.queryByRole("columnheader", { name: "Task" })).toBeNull();
  expect(screen.queryByText("rate-1")).toBeNull();
});

it('continues beyond a truncated offer preview and retains loaded rows after retry', async () => {
  let fail=true;
  const calls:string[]=[];
  vi.stubGlobal('fetch',vi.fn(async input=>{
    const url=String(input);calls.push(url);
    if(url.includes('/offers?')) {
      if(fail)throw new TypeError('Offline');
      return Response.json({data:[{...response.offers[0],id:'second',model_alias:'vendor/second'}],next_after:null});
    }
    return Response.json({data:{...response,offers_has_more:true}});
  }));
  setup('viewer');
  await screen.findByText('$1.2');
  const user=userEvent.setup();await user.click(screen.getByRole('link',{name:'Model offers'}));
  await screen.findByText('1 offer loaded · more available');
  await user.click(screen.getByRole('button',{name:'Load more offers'}));
  await screen.findByRole('button',{name:'Retry loading offers'});
  expect(screen.getByText('qwen/qwen3')).toBeTruthy();
  fail=false;await user.click(screen.getByRole('button',{name:'Retry loading offers'}));
  await screen.findByText('vendor/second');
  expect(screen.getByText('2 offers')).toBeTruthy();
  expect(screen.queryByRole('button',{name:'Load more offers'})).toBeNull();
  expect(calls.filter(url=>url.includes('/offers?'))).toEqual(Array(2).fill('/api/v1/providers/supplier/offers?limit=100&after=qwen%2Fqwen3'));
});

it.each([false,true])('shows media earnings alongside optional text usage without an empty state (mixed=%s)',async mixed=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({data:{...response,consumption:mixed?[{model_alias:'text/model',revision:'private-text-rate',currency:'USD',prompt_rate:'1000000000',completion_rate:'2000000000',requests:'1',prompt_tokens:'100',completion_tokens:'50',amount_nanos:'100000000',unpaid_nanos:'100000000'}]:[],media_consumption:[{model_alias:'video/model',meter:'seconds',currency:'USD',rate_revision:'private-rate-id',resolution:'720p',reference_video:false,amount_units:'125',decimal_places:3,per_quantity:{numerator:'1',denominator:'1'},requests:'2',quantity:'6',quantity_denominator:'1',amount_nanos:'750000000',unpaid_nanos:'500000000'}]}})));
 setup('viewer');await screen.findByText('$1.2');
 await userEvent.click(screen.getByRole('link',{name:'Consumption'}));
 await screen.findByRole('heading',{name:'Media usage'});
 expect(screen.getByText('$0.125')).toBeTruthy();
 expect(screen.getByText('6 seconds')).toBeTruthy();
 expect(screen.getByText('$0.75')).toBeTruthy();
 expect(screen.queryByText('No model consumption yet')).toBeNull();
 expect(screen.queryByText('private-rate-id')).toBeNull();
 expect(screen.queryByText('private-text-rate')).toBeNull();
 if(mixed)expect(screen.getByText('text/model')).toBeTruthy();
});

it.each([undefined,[]])('distinguishes missing media usage from a verified empty result: %s',async media=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({data:{...response,media_consumption:media}})));
 setup('viewer');await screen.findByText('$1.2');
 await userEvent.click(screen.getByRole('link',{name:'Consumption'}));
 if(media)expect(await screen.findByText('No model consumption yet')).toBeTruthy();
 else {
  expect(await screen.findByText(/Media usage is unavailable/)).toBeTruthy();
  expect(screen.queryByText('No model consumption yet')).toBeNull();
 }
});
