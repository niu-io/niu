import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useSearchParams, useNavigate } from 'react-router';
import GlobalActivityRoute, {activityTotals} from '@/features/activity/global-page';
import { saveLocale } from '@/shell/locale';
vi.mock('@/shell/ConnectGate',()=>({default:({children}: {children: (value: unknown)=>unknown})=>children({token:'authorized-token',models:[]})}));
vi.mock('@/features/executions/components/GatewayActivity',()=>({default:({initialScope,statisticsOnly}: {initialScope:{projectId:string};statisticsOnly:boolean})=><p>{initialScope.projectId} scoped {statisticsOnly ? 'Overview' : 'Logs'}</p>}));
const workspaces=[{id:'a',organization_id:'first',name:'Application',organization_name:'First organization'},{id:'b',organization_id:'second',name:'Research',organization_name:'Second organization'}];
const summary=(amount='9007199254740993',currency='USD')=>({request_count:2,usage_count:1,prompt_tokens:'9007199254740993',completion_tokens:'2',customer_charges:[{currency,amount_nanos:amount}],unresolved_customer_charge_count:1,unpriced_request_count:0});
const request={attempt_id:'request-reference',reference:'run-1001',created_at:'2026-10-07T12:00:00Z',model:'model-one',execution:'confirmed_completed',prompt_tokens:'10',completion_tokens:'5',customer_charge_status:'owner_funded',customer_charge_currency:null,customer_charge_nanos:null};
function mockData(fail=false){vi.stubGlobal('fetch',vi.fn(async (input:unknown,init:RequestInit)=>{
 expect((init.headers as Record<string,string>).authorization).toBe('Bearer authorized-token');
 const path=String(input);
 if(path==='/api/v1/workspaces')return Response.json({data:workspaces});
 if(fail && path.includes('/workspaces/b/'))return new Response('',{status:403});
 return Response.json({data:[request],summary:summary(),next_cursor:null});
}));}
function CurrentQuery(){const [query]=useSearchParams();return <output aria-label="Current query">{query.toString()}</output>;}
function open(path='/activity'){render(<MemoryRouter initialEntries={[path]}><CurrentQuery/><Routes><Route path="/activity/:section?" element={<GlobalActivityRoute/>}/><Route path="/workspaces/a/executions" element={<p>Application request details</p>}/></Routes></MemoryRouter>);}
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function RequestDetail() {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate(-1)}>Back</button>;
}

describe('Global Activity',()=>{
 it('adds exact usage and charges without combining currencies',()=>{
  const totals=activityTotals([{page:{summary:summary()}},{page:{summary:summary('5','CNY')}}]);
  expect(totals.tokens).toBe(18014398509481990n);
  expect(totals.charges.get('USD')).toBe(9007199254740993n);
  expect(totals.charges.get('CNY')).toBe(5n);
  expect(totals.unresolved).toBe(2);
 });
 it('aggregates customer unit charges alongside currency charges',()=>{
  const withUnits={...summary('7','USD'),customer_unit_charges:[{unit_name:'Credits',display_precision:2,net_atoms:'12300000000'}]};
  const totals=activityTotals([{page:{summary:withUnits}}]);
  expect(totals.charges.get('USD')).toBe(7n);
  expect(totals.units.get('Credits')?.amount).toBe(12300000000n);
  expect(totals.units.get('Credits')?.precision).toBe(2);
 });
 it('loads all authorized organizations and switches workspace scope',async()=>{
  mockData();open();const user=userEvent.setup();
  expect(await screen.findByRole('link',{name:'Research'})).toBeTruthy();
  expect(screen.getByRole('link',{name:'Application'})).toBeTruthy();
  await user.click(screen.getByRole('button',{name:'Filter Activity by workspace'}));
  await user.click(screen.getByRole('menuitemradio',{name:'Research · Second organization'}));
  expect(await screen.findByText('b scoped Overview')).toBeTruthy();
  expect(screen.queryByRole('button',{name:'Refresh Activity'})).toBeNull();

 });
 it('keeps the reporting period when comparing two workspaces',async()=>{
  mockData();open('/activity/logs?workspace=a&from=2026-11-01&to=2026-11-24&settlement=pending&keyId=only-a');
  const user=userEvent.setup();
  await screen.findByText('a scoped Logs');
  await user.click(screen.getByRole('button',{name:'Filter Activity by workspace'}));
  await user.click(screen.getByRole('menuitemradio',{name:'Research · Second organization'}));
  await screen.findByText('b scoped Logs');
  const query = new URLSearchParams(screen.getByLabelText('Current query').textContent ?? '');
  expect(Object.fromEntries(query)).toEqual({workspace:'b', from:'2026-11-01', to:'2026-11-24', settlement:'pending'});
 });
 it('loads scoped logs from its sidebar destination',async()=>{mockData();open('/activity/logs?workspace=b');expect(await screen.findByText('b scoped Logs')).toBeTruthy();});
 it('links global requests to diagnostics in their own workspace',async()=>{
  mockData();open('/activity/logs');
  const links=await screen.findAllByRole('link',{name:/Open model-one request/});
  expect(links.map(link=>link.getAttribute('href')).sort()).toEqual(['/workspaces/a/executions#gateway-attempt-run-1001','/workspaces/b/executions#gateway-attempt-run-1001']);
  expect(screen.getAllByText('No Niu charge').length).toBeGreaterThanOrEqual(2);
 });
 it.each(['click','Enter',' '])('opens request details from the whole row using %s',async action=>{
  mockData();open('/activity/logs');const user=userEvent.setup();
  const row=await screen.findByRole('row',{name:/Open model-one request in Application at/});
  if(action==='click')await user.click(row);else {row.focus();await user.keyboard(action==='Enter' ? '{Enter}' : ' ');}
  expect(await screen.findByText('Application request details')).toBeTruthy();
 });
 it('does not present partial totals when a workspace request fails',async()=>{
  mockData(true);open();expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.queryByRole('region',{name:'All workspace totals'})).toBeNull();
  expect(screen.queryByText('Usage by workspace')).toBeNull();
 });
 it('renders a zh-CN status-bearing activity failure without translating identifiers',async()=>{
  saveLocale('zh-CN');mockData(true);open();
  expect((await screen.findByRole('alert')).textContent).toContain('无法加载活动记录（403）。请重试。');
  saveLocale('en');
 });
 it('recovers from an unavailable workspace by clearing the scope',async()=>{
  mockData();open('/activity?workspace=outside');const user=userEvent.setup();
  await user.click(await screen.findByRole('button',{name:'Show all workspaces'}));
  expect(await screen.findByRole('region',{name:'All workspace totals'})).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
 });
 it('retries failed activity without showing partial totals',async()=>{
  mockData(true);open();const user=userEvent.setup();
  await screen.findByRole('alert');mockData();
  await user.click(screen.getByRole('button',{name:'Try again'}));
  expect(await screen.findByRole('region',{name:'All workspace totals'})).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
 });
 it('rejects a workspace outside the authorized list before requesting its activity',async()=>{
  mockData();open('/activity?workspace=outside');
  expect((await screen.findByRole('alert')).textContent).toContain('This workspace is unavailable or you do not have access.');
  await waitFor(()=>expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1));
 });
 it.each(['tokens','count','date','duplicate','cursor'])('shows recoverable errors for malformed %s data without partial totals',async kind=>{
  vi.stubGlobal('fetch',vi.fn(async (input:unknown)=>{
    if(String(input)==='/api/v1/workspaces')return Response.json({data:[workspaces[0]]});
    const page={data:[request],summary:summary(),next_cursor:null as string|null};
    if(kind==='tokens')page.summary.prompt_tokens='not a number';
    if(kind==='count')page.summary.request_count=-1;
    if(kind==='date')page.data=[{...request,created_at:'invalid date'}];
    if(kind==='duplicate')page.data=[request,request];
    if(kind==='cursor')page.next_cursor='';
    return Response.json(page);
  }));
  open();
  expect((await screen.findByRole('alert')).textContent).toContain('Activity returned invalid request data');
  expect(screen.queryByRole('region',{name:'All workspace totals'})).toBeNull();
  mockData();
  await userEvent.setup().click(screen.getByRole('button',{name:'Try again'}));
  expect(await screen.findByRole('region',{name:'All workspace totals'})).toBeTruthy();
 });
 it('deduplicates overlapping pages within each workspace',async()=>{
  vi.stubGlobal('fetch',vi.fn(async (input:unknown)=>{
    const path=String(input);
    if(path==='/api/v1/workspaces')return Response.json({data:[workspaces[0]]});
    return Response.json({data:path.includes('after=')?[request,{...request,attempt_id:'older',model:'older-model'}]:[request],summary:summary(),next_cursor:path.includes('after=')?null:'older-page'});
  }));
  open('/activity/logs');const user=userEvent.setup();
  await user.click(await screen.findByRole('button',{name:'Load older requests'}));
  await screen.findByRole('link',{name:/Open older-model request/});
  expect(screen.getAllByRole('row',{name:/Open model-one request/})).toHaveLength(1);
  expect(screen.getByText('2 loaded · newest first · all time')).toBeTruthy();
  expect(screen.queryByRole('button',{name:'Load older requests'})).toBeNull();
 });
 it('restores a later page and the opened link when navigating back', async () => {
  vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
    const path = String(input);
    if (path === '/api/v1/workspaces') return Response.json({data: [workspaces[0]]});
    const older = path.includes('after=');
    return Response.json({data: [older ? {...request, attempt_id: 'older', reference: 'run-1002', model: 'older-model'} : request], summary: summary(), next_cursor: older ? null : 'page-two'});
  }));
  render(<MemoryRouter initialEntries={['/activity/logs']}><Routes>
    <Route path="/activity/logs" element={<GlobalActivityRoute/>}/>
    <Route path="/workspaces/a/executions" element={<RequestDetail/>}/>
  </Routes></MemoryRouter>);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', {name: 'Load older requests'}));
  await user.click(await screen.findByRole('link', {name: /Open older-model request/}));
  await user.click(await screen.findByRole('button', {name: 'Back'}));
  const restored = await screen.findByRole('link', {name: /Open older-model request/});
  await waitFor(() => expect(document.activeElement).toBe(restored));
 });
 it('rejects a cursor cycle across older pages and recovers only by explicit refresh',async()=>{
  let olderReads=0;
  vi.stubGlobal('fetch',vi.fn(async (input:unknown)=>{
    const path=String(input);
    if(path==='/api/v1/workspaces')return Response.json({data:[workspaces[0]]});
    if(path.includes('after='))olderReads+=1;
    const cursor=path.includes('after=second')?'first':path.includes('after=first')?'second':'first';
    return Response.json({data:[{...request,attempt_id:`request-${olderReads}`}],summary:summary(),next_cursor:cursor});
  }));
  open('/activity/logs');const user=userEvent.setup();
  await user.click(await screen.findByRole('button',{name:'Load older requests'}));
  await screen.findByText('2 loaded · newest first · all time');
  await user.click(screen.getByRole('button',{name:'Load older requests'}));
  expect((await screen.findByRole('alert')).textContent).toContain('Activity history could not advance');
  expect(olderReads).toBe(2);
  mockData();
  await user.click(screen.getByRole('button',{name:'Try again'}));
  expect(await screen.findAllByRole('link',{name:/Open model-one request/})).toHaveLength(2);
  expect(screen.queryByRole('alert')).toBeNull();
 });

 it('displays Credits unit charges instead of Unknown on cross-workspace logs',async()=>{
  vi.stubGlobal('fetch',vi.fn(async (input:unknown)=>{
    const path=String(input);
    if(path==='/api/v1/workspaces')return Response.json({data:[workspaces[0]]});
    return Response.json({
      data:[{
        ...request,
        attempt_id:'unit-charged-attempt',
        customer_charge_status:'charged',
        customer_charge_currency:null,
        customer_charge_nanos:null,
        customer_unit_charge:{unit_name:'Credits',display_precision:2,net_atoms:'1250000000'},
      }],
      summary:{...summary('0','USD'),customer_charges:[],customer_unit_charges:[{unit_name:'Credits',display_precision:2,net_atoms:'1250000000'}]},
      next_cursor:null,
    });
  }));
  open('/activity/logs');
  expect((await screen.findAllByText('1.25 Credits')).length).toBeGreaterThanOrEqual(1);
  expect(screen.queryByText('Unknown')).toBeNull();
 });

 it('renders shared Niu charges card and workspace charge states cleanly across workspaces',async()=>{
  vi.stubGlobal('fetch',vi.fn(async (input:unknown)=>{
    const path=String(input);
    if(path==='/api/v1/workspaces')return Response.json({data:workspaces});
    if(path.includes('/workspaces/a/'))return Response.json({
      data:[],
      summary:{request_count:5,usage_count:5,prompt_tokens:'100',completion_tokens:'50',customer_charges:[],unresolved_customer_charge_count:2,unpriced_request_count:0,owner_funded_request_count:3},
      next_cursor:null,
    });
    return Response.json({
      data:[],
      summary:{request_count:4,usage_count:4,prompt_tokens:'80',completion_tokens:'40',customer_charges:[],unresolved_customer_charge_count:0,unpriced_request_count:1,owner_funded_request_count:3},
      next_cursor:null,
    });
  }));
  open();
  const totals=await screen.findByRole('region',{name:'All workspace totals'});
  expect(totals.textContent).toContain('Niu charges');
  expect(totals.textContent).toContain('Pending settlement');
  expect(totals.textContent).toContain('2 requests awaiting settlement');
  expect(totals.textContent).toContain('1 request without a customer rate');
  expect(totals.textContent).toContain('6 with own API keys (not billed by Niu; Provider charges may still apply)');
  const inspectLink=await screen.findByRole('link',{name:'Inspect'});
  expect(inspectLink.getAttribute('href')).toBe('/activity/logs');
  expect(await screen.findByRole('cell',{name:'No rate set'})).toBeTruthy();
 });

 it('preserves settled $0.00 charges when all requests are settled with zero charge', async () => {
  vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
    const path = String(input);
    if (path === '/api/v1/workspaces') return Response.json({data: [workspaces[0]]});
    return Response.json({
      data: [],
      summary: {
        ...summary('0', 'USD'),
        customer_charges: [{currency: 'USD', amount_nanos: '0', charged_requests: 3}],
        unresolved_customer_charge_count: 0,
        unpriced_request_count: 0,
        owner_funded_request_count: 0,
      },
      next_cursor: null,
    });
  }));
  open('/activity');
  expect((await screen.findAllByText('$0.00')).length).toBeGreaterThanOrEqual(2);
 });

});
