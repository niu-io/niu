import { it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import KeyPolicyHistory from '@/features/keys/components/KeyPolicyHistory';
const row=(revision:string,value:number|null=10)=>({revision,requests_per_minute:value,actor_name:'Workspace owner',actor_kind:'member',recorded_at:'2026-10-10T08:00:00Z'});
function mount(){render(<KeyPolicyHistory token="reader" endpoint="/key/request-rate-limit" label="Requests per minute" field="requests_per_minute"/>);return userEvent.setup();}
it('uses an exact descending cursor and retains rows when an older page fails',async()=>{
  const rows=Array.from({length:20},(_,i)=>row(String(9007199254741015n-BigInt(i))));let tries=0;
  const fetcher=vi.fn(async(input:RequestInfo|URL)=>String(input).includes('before_revision') ? ++tries===1 ? Response.json({error:{message:'Temporary failure'}},{status:503}) : Response.json({data:[row('9007199254740995',null)]}) : Response.json({data:rows}));
  vi.stubGlobal('fetch',fetcher);const user=mount();await user.click(screen.getByRole('button',{name:'Requests per minute history'}));await screen.findByRole('button',{name:'Load older changes'});
  await user.click(screen.getByRole('button',{name:'Load older changes'}));await screen.findByText('Temporary failure');expect(screen.getAllByText('Workspace owner')).toHaveLength(20);
  expect(String(fetcher.mock.calls[1][0])).toContain('before_revision=9007199254740996');
  await user.click(screen.getByRole('button',{name:'Retry history'}));await screen.findByText('Unlimited');expect(screen.getAllByText('Workspace owner')).toHaveLength(21);expect(screen.queryByRole('button',{name:'Load older changes'})).toBeNull();
  expect(screen.queryByText('9007199254740995')).toBeNull();
});
it('does not call a failed initial page empty and allows retry',async()=>{
  let reads=0;vi.stubGlobal('fetch',vi.fn(async()=>++reads===1 ? Response.json({error:{message:'Unavailable'}},{status:503}) : Response.json({data:[]})));
  const user=mount();await user.click(screen.getByRole('button',{name:'Requests per minute history'}));await screen.findByText('Unavailable');expect(screen.queryByText('No limit changes recorded.')).toBeNull();
  await user.click(screen.getByRole('button',{name:'Retry history'}));await screen.findByText('No limit changes recorded.');
});
it('rejects duplicate or non-descending revisions without appending misleading rows',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json({data:[row('2'),row('2')]})));const user=mount();await user.click(screen.getByRole('button',{name:'Requests per minute history'}));await screen.findByText('The history response could not be read.');expect(screen.queryByRole('table')).toBeNull();
});
it('aborts history on close and ignores a late result',async()=>{
  let resolve!:(value:Response)=>void;let signal:AbortSignal|undefined;
  vi.stubGlobal('fetch',vi.fn((_input:RequestInfo|URL,init?:RequestInit)=>{signal=init?.signal as AbortSignal;return new Promise<Response>(r=>{resolve=r;});}));
  const user=mount();await user.click(screen.getByRole('button',{name:'Requests per minute history'}));await screen.findByText('Loading limit history…');await user.keyboard('{Escape}');expect(signal?.aborted).toBe(true);resolve(Response.json({data:[row('1')]}));await waitFor(()=>expect(screen.queryByText('Workspace owner')).toBeNull());
});

it('distinguishes unrestricted, blocked and listed source policy history',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json({data:[{revision:'3',allowed_cidrs:null,actor_name:'Owner',recorded_at:'2026-10-10T08:00:00Z'},{revision:'2',allowed_cidrs:[],actor_name:'Owner',recorded_at:'2026-10-10T08:00:00Z'},{revision:'1',allowed_cidrs:['2001:db8::/32'],actor_name:'Owner',recorded_at:'2026-10-10T08:00:00Z'}]})));
  render(<KeyPolicyHistory token="reader" endpoint="/key/ip-policy" label="Source IP access" field="allowed_cidrs"/>);const user=userEvent.setup();await user.click(screen.getByRole('button',{name:'Source IP access history'}));await screen.findByText('Allow all sources');expect(screen.getByText('Block all sources')).toBeTruthy();expect(screen.getByText('2001:db8::/32')).toBeTruthy();
});

it('renders spending history with exact currency amounts and rejects mismatched currencies',async()=>{
  const data=[{revision:'3',currency:'USD',limit_nanos:'9223372036854775807',actor_name:'Owner',recorded_at:'2026-10-10T08:00:00Z'},{revision:'2',currency:'USD',limit_nanos:'0',actor_name:'Owner',recorded_at:'2026-10-10T08:00:00Z'},{revision:'1',currency:'USD',limit_nanos:null,actor_name:'Owner',recorded_at:'2026-10-10T08:00:00Z'}];
  const fetcher=vi.fn(async()=>Response.json({data}));vi.stubGlobal('fetch',fetcher);render(<KeyPolicyHistory token="reader" endpoint="/key/spending-limit/USD" label="USD spending limit" field="limit_nanos" currency="USD"/>);const user=userEvent.setup();await user.click(screen.getByRole('button',{name:'USD spending limit history'}));await screen.findByText('USD 9223372036.854775807');expect(screen.getByText('USD 0.00')).toBeTruthy();expect(screen.getByText('Unlimited')).toBeTruthy();await user.keyboard('{Escape}');
  fetcher.mockImplementationOnce(async()=>Response.json({data:[{...data[0],currency:'CNY'}]}));await user.click(screen.getByRole('button',{name:'USD spending limit history'}));await screen.findByText('The history response could not be read.');expect(screen.queryByRole('table')).toBeNull();
});
