import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import GlobalActivityRoute, {activityTotals} from '@/features/activity/global-page';
vi.mock('@/app/ConnectGate',()=>({default:({children}: {children: (value: unknown)=>unknown})=>children({token:'authorized-token',models:[]})}));
vi.mock('@/features/executions/components/GatewayActivity',()=>({default:({initialScope,statisticsOnly}: {initialScope:{projectId:string};statisticsOnly:boolean})=><p>{initialScope.projectId} scoped {statisticsOnly ? 'Overview' : 'Logs'}</p>}));
const workspaces=[{id:'a',organization_id:'first',name:'Application',organization_name:'First organization'},{id:'b',organization_id:'second',name:'Research',organization_name:'Second organization'}];
const summary=(amount='9007199254740993',currency='USD')=>({request_count:2,usage_count:1,prompt_tokens:'9007199254740993',completion_tokens:'2',customer_charges:[{currency,amount_nanos:amount}],unresolved_customer_charge_count:1,unpriced_request_count:0});
const request={attempt_id:'request-reference',created_at:'2026-10-07T12:00:00Z',model:'model-one',execution:'confirmed_completed',prompt_tokens:'10',completion_tokens:'5',customer_charge_status:'owner_funded',customer_charge_currency:null,customer_charge_nanos:null};
function mockData(fail=false){vi.stubGlobal('fetch',vi.fn(async (input:unknown,init:RequestInit)=>{
 expect((init.headers as Record<string,string>).authorization).toBe('Bearer authorized-token');
 const path=String(input);
 if(path==='/admin/v1/workspaces')return Response.json({data:workspaces});
 if(fail && path.includes('/projects/b/'))return new Response('',{status:403});
 return Response.json({data:[request],summary:summary(),next_cursor:null});
}));}
function open(path='/activity'){render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/activity/:section?" element={<GlobalActivityRoute/>}/><Route path="/workspaces/a/executions" element={<p>Application request details</p>}/></Routes></MemoryRouter>);}
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('Global Activity',()=>{
 it('adds exact usage and charges without combining currencies',()=>{
  const totals=activityTotals([{page:{summary:summary()}},{page:{summary:summary('5','CNY')}}]);
  expect(totals.tokens).toBe(18014398509481990n);
  expect(totals.charges.get('USD')).toBe(9007199254740993n);
  expect(totals.charges.get('CNY')).toBe(5n);
  expect(totals.unresolved).toBe(2);
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
 it('loads scoped logs from its sidebar destination',async()=>{mockData();open('/activity/logs?workspace=b');expect(await screen.findByText('b scoped Logs')).toBeTruthy();});
 it('links global requests to diagnostics in their own workspace',async()=>{
  mockData();open('/activity/logs');
  const links=await screen.findAllByRole('link',{name:/Open model-one request/});
  expect(links.map(link=>link.getAttribute('href')).sort()).toEqual(['/workspaces/a/executions#gateway-attempt-request-reference','/workspaces/b/executions#gateway-attempt-request-reference']);
  expect(screen.getAllByText('Own API key').length).toBeGreaterThanOrEqual(2);
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
});
