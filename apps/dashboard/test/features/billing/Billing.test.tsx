import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import AccountBilling from "../../../src/features/billing/AccountBilling";

it('separates balance reporting from payment actions in global Settings', async () => {
  vi.stubGlobal('fetch', vi.fn(async url => Response.json({data: String(url).endsWith('/billing/balance') ? [{currency:'USD',balance_nanos:'1000000000',available_nanos:'1000000000',reserved_nanos:'0',credit_limit_nanos:'0',warning_threshold_nanos:null,policy_revision:'0',low_balance:false}] : []})));
  const view = render(<AccountBilling token="test" organization="org" section="billing" />);
  await screen.findByText('No transactions yet.');
  expect(screen.getByRole('region', {name:'Account balance'})).toBeTruthy();
  expect(screen.queryByRole('region', {name:'Account top-ups'})).toBeNull();
  view.rerender(<AccountBilling token="test" organization="org" section="payments" />);
  expect(screen.getByRole('region', {name:'Account top-ups'})).toBeTruthy();
  expect(screen.queryByRole('region', {name:'Account balance'})).toBeNull();
  expect(screen.queryByRole('region', {name:'Recent balance transactions'})).toBeNull();
});

it('loads transaction history only when entering Billing, not Payments', async () => {
  const fetcher=vi.fn(async()=>Response.json({data:[]}));vi.stubGlobal('fetch',fetcher);
  const view=render(<AccountBilling token="test" organization="org" section="payments"/>);
  await screen.findByRole('region',{name:'Account top-ups'});
  expect(fetcher.mock.calls.filter(([url])=>String(url).includes('/billing/transactions'))).toHaveLength(0);
  view.rerender(<AccountBilling token="test" organization="org" section="billing"/>);
  await waitFor(()=>expect(fetcher.mock.calls.filter(([url])=>String(url).includes('/billing/transactions'))).toHaveLength(1));
  view.rerender(<AccountBilling token="test" organization="org" section="payments"/>);
  await screen.findByRole('region',{name:'Account top-ups'});
  expect(fetcher.mock.calls.filter(([url])=>String(url).includes('/billing/transactions'))).toHaveLength(1);
});

it('shows a recoverable Payments error when shared account data cannot load', async () => {
  let failed = true;
  const fetcher = vi.fn(async url => String(url).endsWith('/billing/balance') && failed ? Response.json({error:{message:'Unavailable'}},{status:503}) : Response.json({data:[]}));
  vi.stubGlobal('fetch', fetcher);
  render(<AccountBilling token="test" organization="org" section="payments" />);
  expect(screen.getByText('Loading payment options…')).toBeTruthy();
  expect(await screen.findByText('Payment options unavailable')).toBeTruthy();
  expect(screen.queryByRole('region', {name:'Account balance'})).toBeNull();
  failed = false;
  await userEvent.click(screen.getByRole('button',{name:'Retry payment options'}));
  await screen.findByRole('region', {name:'Account top-ups'});
  expect(screen.queryByText('Payment options unavailable')).toBeNull();
  expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/billing/balance'))).toHaveLength(2);
});
import BillingRoute from "../../../src/features/billing/page";
import type { DashboardContext } from "../../../src/app/dashboard-context";
const fixture = vi.hoisted(() => ({ context: {} as DashboardContext }));
vi.mock("../../../src/app/dashboard-context", () => ({
  useDashboardContext: () => fixture.context,
}));
const data = {
  balances: [
    {
      currency: "USD",
      charged_nanos: "6500011000",
      unbilled_nanos: "11000",
      due_nanos: "6500000000",
      paid_nanos: "0",
    },
  ],
  unresolved: "2",
  unpriced: "3",
  tariffs: [],
  invoices: [
    {
      id: "invoice-1",
      from_ms: 1700000000000,
      to_ms: 1700086400000,
      currency: "USD",
      amount_nanos: "6500000000",
      status: "issued",
      payment_reference: null,
    },
  ],
};
function setup(kind = "operator", initialEntry = "/billing") {
  fixture.context = {
    token: "test",
    workspace: { id: "project", organization_id: "org" },
    session: { kind },
    models: [{ id: "qwen/text" }],
  } as unknown as DashboardContext;
  return render(<MemoryRouter initialEntries={[initialEntry]}><BillingRoute /></MemoryRouter>);
}
describe("customer billing", () => {
  it("opens a directly linked billing tab", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data })));
    setup("operator", "/billing?tab=rates");
    await screen.findByRole("tabpanel", { name: "Rates" });
    expect(screen.getByRole("tab", { name: "Rates" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByRole("region", { name: "Workspace spending" })).toBeNull();
  });
  it("shows independent exact balances and excludes unpriced usage without exposing financial writes", async () => {
    const fetch = vi.fn(async (url) => new Response(JSON.stringify({ data: (/\/billing\/(balance|transactions)$|\/spending-limit$/).test(String(url)) ? [] : data })));
    vi.stubGlobal("fetch", fetch);
    setup();
    await screen.findByText("USD 6.500011");
    expect(screen.getByText(/requests without a customer rate/)).toBeTruthy();
    expect(screen.queryByText(/priced requests await/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Issue invoice" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Record payment" })).toBeNull();
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      "/admin/v1/organizations/org/projects/project/billing",
      "/admin/v1/organizations/org/projects/project/spending-limit",
    ]);
  });
  it("loads only the selected workspace invoice details", async () => {
    const fetch = vi.fn(
      async (url: unknown) =>
        new Response(
          JSON.stringify({
            data: String(url).endsWith("/invoice-1") ? [{
              model_alias: "qwen/text", revision: "11111111-1111-4111-8111-111111111111",
              currency: "USD", requests: "1", prompt_tokens: "7", completion_tokens: "1",
              prompt_rate: "300000000", completion_rate: "2500000000", amount_nanos: "4600",
            }] : data,
          }),
        ),
    );
    vi.stubGlobal("fetch", fetch);
    setup();
    await userEvent.setup().click(await screen.findByRole("tab", { name: "Statements" }));
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: "View details" }));
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(
          ([url]) =>
            url ===
            "/admin/v1/organizations/org/projects/project/billing/invoices/invoice-1",
        ),
      ).toBe(true),
    );
    expect(await screen.findByText(/^Billing period:/)).toBeTruthy();
    expect(screen.queryByText("invoice-1")).toBeNull();
    expect(screen.queryByText("invoice-")).toBeNull();
    expect(await screen.findByText("qwen/text")).toBeTruthy();
    expect(screen.queryByText("11111111-1111-4111-8111-111111111111")).toBeNull();
    expect(screen.getByText("USD 0.0000046")).toBeTruthy();
  });
  it('retries failed statement details without losing the selected billing period', async () => {
    let failed = true;
    let detailReads = 0;
    vi.stubGlobal('fetch',vi.fn(async (input) => {
      if (String(input).endsWith('/invoice-1')) {
        detailReads++;
        return failed ? Response.json({error:{message:'Service unavailable'}},{status:503}) : Response.json({data:[]});
      }
      return Response.json({data});
    }));
    const user = userEvent.setup(); setup('operator','/billing?tab=statements');
    await user.click(await screen.findByRole('button',{name:'View details'}));
    await screen.findByRole('button',{name:'Retry details'});
    const dialog = screen.getByRole('dialog');
    failed = false;
    await user.click(screen.getByRole('button',{name:'Retry details'}));
    await waitFor(()=>expect(screen.queryByText('Loading line items…')).toBeNull());
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(screen.getByText(/^Billing period:/)).toBeTruthy();
    expect(screen.queryByRole('button',{name:'Retry details'})).toBeNull();
    expect(screen.getByText('No line items available.')).toBeTruthy();
    expect(detailReads).toBe(2);
  });
  it("keeps platform financial controls out of workspace billing even for administrators", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url) => new Response(JSON.stringify({ data: (/\/billing\/(balance|transactions)$/).test(String(url)) ? [] : data }))));
    setup("installation");
    await screen.findByText("USD 6.500011");
    for (const name of ["Set selling rates", "Issue invoice", "Record payment"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect(screen.queryByText(/provider payout rates/)).toBeNull();
  });
});

describe('prepaid balance', () => {
  it('waits for transaction history before showing an empty state', async () => {
    let completeTransactions!: (response: Response) => void;
    const pendingTransactions = new Promise<Response>(resolve => { completeTransactions = resolve; });
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).endsWith('/billing/transactions')) return pendingTransactions;
      return new Response(JSON.stringify({data: String(url).endsWith('/billing/balance') ? [{currency:'USD',balance_nanos:'1000000000',available_nanos:'1000000000',reserved_nanos:'0',credit_limit_nanos:'0',warning_threshold_nanos:null,policy_revision:'0',low_balance:false}] : []}));
    }));
    render(<AccountBilling token="test" organization="org" />);
    expect(await screen.findByText('Loading transactions…')).toBeTruthy();
    expect(screen.queryByText('No transactions yet.')).toBeNull();
    completeTransactions(new Response(JSON.stringify({data:[]})));
    expect(await screen.findByText('No transactions yet.')).toBeTruthy();
    expect(screen.queryByText('Loading transactions…')).toBeNull();
  });

  it('retries malformed balances and history instead of rendering false empty states', async () => {
    let failed=true;
    vi.stubGlobal('fetch',vi.fn(async url=> {
      const path=String(url);
      if (path.endsWith('/balance')) return Response.json({data:failed
        ? [{currency:'USD',available_nanos:'invalid'}]
        : [{currency:'USD',balance_nanos:'1000000000',available_nanos:'1000000000',reserved_nanos:'0',credit_limit_nanos:'0',warning_threshold_nanos:null,policy_revision:'0',low_balance:false}]});
      if (path.endsWith('/transactions')) return Response.json(failed ? {} : {data:[]});
      return Response.json({data:[]});
    }));
    render(<AccountBilling token="test" organization="org"/>);
    await screen.findByRole('button',{name:'Retry account balance'});
    await screen.findByRole('button',{name:'Retry transactions'});
    expect(screen.queryByText('No transactions yet.')).toBeNull();
    expect(screen.queryByText('No prepaid account configured.')).toBeNull();
    failed=false;
    await userEvent.click(screen.getByRole('button',{name:'Retry account balance'}));
    await screen.findAllByText('USD 1.00');
    await screen.findByText('No transactions yet.');
    expect(screen.queryByRole('button',{name:'Retry transactions'})).toBeNull();
  });

  it('refreshes available funds after an external balance change', async () => {
    let reads = 0;
    vi.stubGlobal('fetch', vi.fn(async (url) => new Response(JSON.stringify({data: String(url).endsWith('/billing/balance') ? [{currency:'USD', balance_nanos:'1000000000', available_nanos:++reads === 1 ? '1000000000' : '2000000000', reserved_nanos:'0', credit_limit_nanos:'0', warning_threshold_nanos:null, policy_revision:'0', low_balance:false}] : []}))));
    render(<AccountBilling token="test" organization="org" />);
    await screen.findAllByText('USD 1.00');
    await userEvent.click(screen.getByRole('button', {name:'Refresh account balance'}));
    expect(await screen.findByText('USD 2.00')).toBeTruthy();
    expect(reads).toBe(2);
  });
  function companySetup(balance: Record<string, unknown>, transactions: Record<string, unknown>[] = []) {
    fixture.context = {
      token: 'test', workspace: {id: 'project', organization_id: 'org'},
      session: {kind: 'operator', operator: {role: 'owner', organization_id: 'org', project_id: null}},
      models: [],
    } as unknown as DashboardContext;
    vi.stubGlobal('fetch', vi.fn(async (url) => new Response(JSON.stringify({data: String(url).endsWith('/billing/balance') ? [{warning_threshold_nanos:null,policy_revision:'0',...balance}] : String(url).endsWith('/billing/transactions') ? transactions : data}))));
    return render(<AccountBilling token="test" organization="org" />);
  }
  it('shows available funds with credit and holds, then warns on low balance', async () => {
    companySetup({currency:'CNY',balance_nanos:'-1000000000',credit_limit_nanos:'3000000000',reserved_nanos:'500000000',available_nanos:'1500000000',low_balance:true});
    expect(await screen.findByText('CNY 1.5')).toBeTruthy();
    expect(screen.getByText('CNY -1.00')).toBeTruthy();
    expect(screen.getByText('Approved credit')).toBeTruthy();
    expect(screen.getByText('Reserved for requests')).toBeTruthy();
    expect(screen.getByText('Low balance')).toBeTruthy();
    expect(screen.queryByText('Insufficient funds')).toBeNull();
    expect(screen.queryByRole('button',{name:/Record|Issue|Publish/})).toBeNull();
  });
  it('renders signed ledger changes without exposing internal references', async () => {
    const id = 'aabbaa00-1111-4111-8111-123456789abc';
    companySetup({currency:'CNY',balance_nanos:'900000000',credit_limit_nanos:'0',reserved_nanos:'0',available_nanos:'900000000',low_balance:false},[
      {id,kind:'funding',currency:'CNY',amount_nanos:'1000000000',created_at:'2026-10-04T10:00:00Z'},
      {id:id.replace('aabbaa00','aabbaa01'),kind:'funding_reversal',currency:'CNY',amount_nanos:'-100000000',created_at:'2026-10-04T10:01:00Z'},
    ]);
    expect(await screen.findByText('Top-up')).toBeTruthy();
    expect(screen.getByText('Payment reversal')).toBeTruthy();
    expect(screen.getByText('CNY -0.1')).toBeTruthy();
    expect(screen.queryByText(id)).toBeNull();
  });
  it('shows exhausted funds without claiming to collect a payment', async () => {
    companySetup({currency:'CNY',balance_nanos:'0',credit_limit_nanos:'0',reserved_nanos:'0',available_nanos:'0',low_balance:true});
    expect(await screen.findByText('Insufficient funds')).toBeTruthy();
    expect(screen.queryByText('Low balance')).toBeNull();
    expect(screen.queryByRole('button',{name:/Pay|Top up|Add funds/})).toBeNull();
  });
});

describe('company history pagination', () => {
 it('retries the latest history after a refresh fails despite an existing older cursor', async () => {
  const first={id:'first',kind:'funding',currency:'USD',amount_nanos:'1000000000',created_at:'2026-10-04T10:00:00Z'};
  let latestReads=0;
  let olderReads=0;
  vi.stubGlobal('fetch',vi.fn(async url => {
   const path=String(url);
   if (path.includes('?before=')) {olderReads++;return Response.json({data:[],next_cursor:null});}
   if (path.endsWith('/transactions')) {
    latestReads++;
    if (latestReads===2) return new Response('{}',{status:503});
    return Response.json({data:[first],next_cursor:'older-cursor'});
   }
   return Response.json({data:[]});
  }));
  render(<AccountBilling token="test" organization="org" />);
  const user=userEvent.setup();
  await screen.findByText('Top-up');
  await user.click(screen.getByRole('button',{name:'Refresh account balance'}));
  await screen.findByRole('button',{name:'Retry transactions'});
  expect(screen.getByText('Top-up')).toBeTruthy();
  expect((screen.getByRole('button',{name:'History'}) as HTMLButtonElement).disabled).toBe(true);
  await user.click(screen.getByRole('button',{name:'Retry transactions'}));
  await waitFor(()=>expect(screen.queryByRole('button',{name:'Retry transactions'})).toBeNull());
  expect(latestReads).toBe(3);
  expect(olderReads).toBe(0);
  expect(screen.getByText('Top-up')).toBeTruthy();
 });

 it('keeps current entries on failure and retries the same page without duplicates', async () => {
  const cursor='aabbaa00-1111-4111-8111-123456789abc';
  const first={id:cursor,kind:'funding',currency:'CNY',amount_nanos:'1000000000',created_at:'2026-10-04T10:00:00Z'};
  let olderReads=0;
  vi.stubGlobal('fetch',vi.fn(async url => {
   const path=String(url);
   if (path.includes('?before=')) {
    olderReads++;
    return olderReads===1 ? new Response('{}',{status:503}) : Response.json({data:[first,{...first,id:cursor.replace('aabbaa00','aabbaa01'),kind:'refund',amount_nanos:'100000000'}],next_cursor:null});
   }
   return Response.json({data:path.endsWith('/balance')?[]:[first],next_cursor:cursor});
  }));
  render(<AccountBilling token="test" organization="org" />);
  const user=userEvent.setup();
  await user.click(await screen.findByRole('button',{name:'History'}));
  await screen.findByRole('button',{name:'Retry transactions'});
  expect(screen.getByText('Top-up')).toBeTruthy();
  await user.click(screen.getByRole('button',{name:'Retry transactions'}));
  await screen.findByText('Refund');
  expect(screen.getAllByText('Top-up').length).toBe(1);
  expect(olderReads).toBe(2);
  expect(screen.queryByRole('button',{name:'History'})).toBeNull();
  expect(screen.queryByText(cursor)).toBeNull();
 });
});


describe('company warning preferences', () => {
 const account={currency:'CNY',balance_nanos:'1000000000',credit_limit_nanos:'5000000000',reserved_nanos:'0',available_nanos:'6000000000',low_balance:false,warning_threshold_nanos:null,policy_revision:'7'};
 it('submits an exact threshold with Enter and supports disabling it', async () => {
  const writes:unknown[]=[];
  vi.stubGlobal('fetch',vi.fn(async (url,init) => {
   if (init?.method==='PUT') {writes.push(JSON.parse(init.body));return Response.json({data:{revision:'8'}});}
   return Response.json({data:String(url).endsWith('/balance')?[{...account,warning_threshold_nanos:writes.length ? (writes[writes.length-1] as {warning_threshold_nanos:string|null}).warning_threshold_nanos : null}]:[]});
  }));
  render(<AccountBilling token="test" organization="org" canConfigure/>);
  const user=userEvent.setup();
  await user.click(await screen.findByRole('button',{name:'Configure CNY low balance warning'}));
  await user.click(screen.getByRole('checkbox',{name:'Enabled'}));
  await user.type(screen.getByLabelText('Threshold (CNY)'),'9007199.254740993{Enter}');
  await waitFor(()=>expect(writes).toEqual([{warning_threshold_nanos:'9007199254740993',expected_revision:'7'}]));
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
  await user.click(screen.getByRole('button',{name:'Configure CNY low balance warning'}));
  expect((screen.getByRole('button',{name:'Save'}) as HTMLButtonElement).disabled).toBe(true);
  await user.click(screen.getByRole('checkbox',{name:'Enabled'}));
  await user.click(screen.getByRole('button',{name:'Save'}));
  await waitFor(()=>expect(writes[1]).toEqual({warning_threshold_nanos:null,expected_revision:'7'}));
 });
 it('retains edits on a policy conflict and reloads before allowing a retry', async () => {
  let reads=0;
  vi.stubGlobal('fetch',vi.fn(async (url,init)=>{
   if (init?.method==='PUT') return Response.json({error:{message:'Conflict'}},{status:409});
   return Response.json({data:String(url).endsWith('/balance')?[{...account,policy_revision:String(7+reads++),warning_threshold_nanos:'2000000000'}]:[]});
  }));
  render(<AccountBilling token="test" organization="org" canConfigure/>);
  const user=userEvent.setup();
  await user.click(await screen.findByRole('button',{name:'Configure CNY low balance warning'}));
  await user.clear(screen.getByLabelText('Threshold (CNY)'));await user.type(screen.getByLabelText('Threshold (CNY)'),'3');
  await user.click(screen.getByRole('button',{name:'Save'}));
  await screen.findByText(/account policy changed/);
  expect((screen.getByLabelText('Threshold (CNY)') as HTMLInputElement).value).toBe('3');
  expect((screen.getByRole('button',{name:'Save'}) as HTMLButtonElement).disabled).toBe(true);
  await user.click(screen.getByRole('button',{name:'Reload current settings'}));
  await waitFor(()=>expect((screen.getByLabelText('Threshold (CNY)') as HTMLInputElement).value).toBe('2.00'));
  expect((screen.getByRole('button',{name:'Save'}) as HTMLButtonElement).disabled).toBe(true);
  await user.clear(screen.getByLabelText('Threshold (CNY)'));await user.type(screen.getByLabelText('Threshold (CNY)'),'3');
  expect((screen.getByRole('button',{name:'Save'}) as HTMLButtonElement).disabled).toBe(false);
 });
 it('rejects malformed thresholds and accepts an exact zero', async () => {
  const writes:unknown[]=[];
  vi.stubGlobal('fetch',vi.fn(async (url,init)=>{
   if (init?.method==='PUT') {writes.push(JSON.parse(init.body));return Response.json({data:{revision:'8'}});}
   return Response.json({data:String(url).endsWith('/balance')?[account]:[]});
  }));
  render(<AccountBilling token="test" organization="org" canConfigure/>);
  const user=userEvent.setup();
  await user.click(await screen.findByRole('button',{name:'Configure CNY low balance warning'}));
  await user.click(screen.getByRole('checkbox',{name:'Enabled'}));
  await user.type(screen.getByLabelText('Threshold (CNY)'),'-1');
  await user.click(screen.getByRole('button',{name:'Save'}));
  await screen.findByText('Enter a threshold of zero or greater.');
  expect(writes).toEqual([]);
  await user.clear(screen.getByLabelText('Threshold (CNY)'));await user.type(screen.getByLabelText('Threshold (CNY)'),'0.000000000');
  await user.click(screen.getByRole('button',{name:'Save'}));
  await waitFor(()=>expect(writes).toEqual([{warning_threshold_nanos:'0',expected_revision:'7'}]));
 });
 it('does not expose warning writes to read-only sessions', async () => {
  vi.stubGlobal('fetch',vi.fn(async url=>Response.json({data:String(url).endsWith('/balance')?[account]:[]})));
  render(<AccountBilling token="test" organization="org"/>);
  await screen.findByText('Low balance warning');
  expect(screen.queryByRole('button',{name:/Configure/})).toBeNull();
 });
});
