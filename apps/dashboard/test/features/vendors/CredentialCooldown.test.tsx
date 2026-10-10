import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {it,expect,vi} from 'vitest';
import CredentialCooldown from '@/features/vendors/components/CredentialCooldown';
const state={policy_revision:'openrouter-auth-cooldown-v1',failure_threshold:3,window_seconds:60,cooldown_seconds:60,active:false,cooldown_until:null,qualifying_failures:0};
it('uses the returned active state rather than treating an expired stored deadline as cooling',async()=>{
  let reads=0;
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json({data:{...state,active:++reads===1,cooldown_until:'2000-01-01T00:00:00Z',qualifying_failures:3}})));
  render(<CredentialCooldown token="member" vendorId="credential"/>);
  await screen.findByText('New requests temporarily unavailable');
  expect(screen.getByText(/Previously dispatched/)).toBeTruthy();
  await userEvent.setup().click(screen.getByRole('button',{name:'Refresh cooldown status'}));
  await screen.findByText('No active cooldown');
  expect(screen.queryByText(/Cooldown until/)).toBeNull();
});
it('rejects malformed state and recovers through an explicit read without any writes',async()=>{
  let reads=0;
  const fetch=vi.fn(async()=>Response.json({data:++reads===1?{...state,active:true}:state}));vi.stubGlobal('fetch',fetch);
  render(<CredentialCooldown token="member" vendorId="credential"/>);
  await screen.findByRole('alert');expect(screen.queryByText('No active cooldown')).toBeNull();
  await userEvent.setup().click(screen.getByRole('button',{name:'Retry cooldown status'}));
  await screen.findByText('No active cooldown');
  expect(fetch.mock.calls).toHaveLength(2);
});
it('does not apply a late response from the previous credential',async()=>{
  let finish!:(value:Response)=>void;
  vi.stubGlobal('fetch',vi.fn((path)=>String(path).includes('/old/')?new Promise<Response>(resolve=>{finish=resolve;}):Promise.resolve(Response.json({data:state}))));
  const view=render(<CredentialCooldown token="member" vendorId="old"/>);
  view.rerender(<CredentialCooldown token="member" vendorId="new"/>);
  await screen.findByText('No active cooldown');finish(Response.json({data:{...state,active:true,cooldown_until:'2099-01-01T00:00:00Z'}}));
  await waitFor(()=>expect(screen.queryByText('New requests temporarily unavailable')).toBeNull());
});
