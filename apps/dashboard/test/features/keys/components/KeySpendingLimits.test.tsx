import { it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import KeySpendingLimits from '@/features/keys/components/KeySpendingLimits';
const initial = {currency:'USD',limit_nanos:null as string|null,committed_nanos:'1',remaining_nanos:null as string|null,revision:null as string|null};
function setup(options:{conflict?:boolean;liability?:boolean;canWrite?:boolean;fail?:boolean;empty?:boolean}={}) {
  let row={...initial};let reads=0;
  const fetcher=vi.fn(async(_url:RequestInfo|URL,init?:RequestInit)=>{
    if(init?.method==='PUT') {
      if(options.conflict || options.liability) {const status=options.liability?402:409;options.conflict=false;options.liability=false;row={...row,limit_nanos:'2000000000',remaining_nanos:'1999999999',revision:'9007199254740993'};return Response.json({error:{message:'Changed'}},{status});}
      const body=JSON.parse(init.body as string);row={...row,limit_nanos:body.limit_nanos,revision:'9007199254740994',remaining_nanos:body.limit_nanos===null?null:(BigInt(body.limit_nanos)-1n).toString()};return Response.json({data:{revision:row.revision}});
    }
    if(options.fail&&++reads===1)return Response.json({error:{message:'Storage unavailable'}},{status:503});
    return Response.json({data:options.empty?[]:[row]});
  });vi.stubGlobal('fetch',fetcher);render(<KeySpendingLimits token="test" endpoint="/key/spending-limit" canWrite={options.canWrite??true} active/>);return{fetcher,user:userEvent.setup()};
}
it('preserves nanounits, exact revisions and explicit unlimited without funding a balance',async()=>{
  const{user,fetcher}=setup({conflict:true});await user.click(await screen.findByRole('button',{name:'Edit USD key spending limit'}));
  await user.type(screen.getByLabelText('Lifetime limit (USD)'),'1.000000001');await user.click(screen.getByRole('button',{name:'Save limit'}));await screen.findByRole('button',{name:'Reload limits'});
  await user.click(screen.getByRole('button',{name:'Reload limits'}));await waitFor(()=>expect((screen.getByLabelText('Lifetime limit (USD)')as HTMLInputElement).value).toBe('2.00'));
  await user.clear(screen.getByLabelText('Lifetime limit (USD)'));await user.type(screen.getByLabelText('Lifetime limit (USD)'),'9223372036.854775807');await user.click(screen.getByRole('button',{name:'Save limit'}));await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
  const writes=()=>fetcher.mock.calls.filter(([,init])=>init?.method==='PUT').map(([url,init])=>({url,body:JSON.parse(init!.body as string)}));
  expect(writes()[1]).toEqual({url:'/key/spending-limit/USD',body:{limit_nanos:'9223372036854775807',expected_revision:'9007199254740993'}});
  await user.click(screen.getByRole('button',{name:'Edit USD key spending limit'}));await user.clear(screen.getByLabelText('Lifetime limit (USD)'));await user.click(screen.getByRole('button',{name:'Save limit'}));await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());expect(writes()[2].body.limit_nanos).toBeNull();
});
it('blocks amounts below committed liability and invalid or overflowing decimals',async()=>{
  const{user,fetcher}=setup();await user.click(await screen.findByRole('button',{name:'Edit USD key spending limit'}));
  for(const value of ['0','-1','1e3','0.0000000001','9223372036.854775808']){await user.clear(screen.getByLabelText('Lifetime limit (USD)'));await user.type(screen.getByLabelText('Lifetime limit (USD)'),value);expect((screen.getByRole('button',{name:'Save limit'})as HTMLButtonElement).disabled).toBe(true);}
  expect(fetcher.mock.calls.some(([,init])=>init?.method==='PUT')).toBe(false);
});
it('requires fresh commitments after a 402 even if the dialog is closed',async()=>{
  const{user}=setup({liability:true});await user.click(await screen.findByRole('button',{name:'Edit USD key spending limit'}));await user.type(screen.getByLabelText('Lifetime limit (USD)'),'1');await user.click(screen.getByRole('button',{name:'Save limit'}));await screen.findByText('Committed spending changed. Reload the saved limits before trying again.');
  await user.click(screen.getByRole('button',{name:'Cancel'}));await user.click(screen.getByRole('button',{name:'Edit USD key spending limit'}));expect((screen.getByLabelText('Lifetime limit (USD)')as HTMLInputElement).disabled).toBe(true);expect(screen.queryByRole('button',{name:'Save limit'})).toBeNull();
});
it('does not fabricate currencies and distinguishes failure from an actual empty result',async()=>{
  const{user}=setup({empty:true,fail:true});await screen.findByText('Storage unavailable');expect(screen.queryByText('No billing currency is available for this key yet.')).toBeNull();await user.click(screen.getByRole('button',{name:'Retry spending limits'}));await screen.findByText('No billing currency is available for this key yet.');expect(screen.queryByText('USD')).toBeNull();
});
it('permits read-only history while hiding editing for viewers',async()=>{
  setup({canWrite:false});await screen.findByText('USD 0.000000001');expect(screen.queryByRole('button',{name:'Edit USD key spending limit'})).toBeNull();expect(screen.getByRole('button',{name:'USD spending limit history'})).toBeTruthy();
});
it('retains a failed write draft and restores the saved amount after cancel',async()=>{
  const{user,fetcher}=setup();await user.click(await screen.findByRole('button',{name:'Edit USD key spending limit'}));await user.type(screen.getByLabelText('Lifetime limit (USD)'),'2.123456789');fetcher.mockImplementationOnce(async()=>Response.json({error:{message:'Storage write unavailable'}},{status:503}));await user.click(screen.getByRole('button',{name:'Save limit'}));await screen.findByText('Storage write unavailable');expect((screen.getByLabelText('Lifetime limit (USD)')as HTMLInputElement).value).toBe('2.123456789');await user.click(screen.getByRole('button',{name:'Cancel'}));await user.click(screen.getByRole('button',{name:'Edit USD key spending limit'}));expect((screen.getByLabelText('Lifetime limit (USD)')as HTMLInputElement).value).toBe('');
});

it('writes explicit zero for an unused key',async()=>{
  let row={...initial,committed_nanos:'0'};const fetcher=vi.fn(async(_url:RequestInfo|URL,init?:RequestInit)=>{if(init?.method==='PUT'){row={...row,limit_nanos:'0',remaining_nanos:'0',revision:'1'};return Response.json({data:{revision:'1'}});}return Response.json({data:[row]});});vi.stubGlobal('fetch',fetcher);render(<KeySpendingLimits token="test" endpoint="/key/spending-limit" canWrite active/>);const user=userEvent.setup();await user.click(await screen.findByRole('button',{name:'Edit USD key spending limit'}));await user.type(screen.getByLabelText('Lifetime limit (USD)'),'0');await user.click(screen.getByRole('button',{name:'Save limit'}));await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());expect(JSON.parse(fetcher.mock.calls.find(([,init])=>init?.method==='PUT')![1]!.body as string)).toEqual({limit_nanos:'0',expected_revision:'0'});
});
