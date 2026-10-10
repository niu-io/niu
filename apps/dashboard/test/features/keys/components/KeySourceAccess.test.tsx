import { it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import KeySourceAccess from '@/features/keys/components/KeySourceAccess';
function setup(options:{conflict?:boolean;canWrite?:boolean;fail?:boolean}={}){
  let policy:{allowed_cidrs:string[]|null;revision:string|null}={allowed_cidrs:null,revision:null};let reads=0;
  const fetcher=vi.fn(async(_input:RequestInfo|URL,init?:RequestInit)=>{
    if(init?.method==='PUT'){
      if(options.conflict){options.conflict=false;policy={allowed_cidrs:['192.0.2.0/24'],revision:'2'};return Response.json({error:{message:'Conflict'}},{status:409});}
      const body=JSON.parse(init.body as string);policy={allowed_cidrs:body.allowed_cidrs?.map((s:string)=>s==='192.0.2.5/24'?'192.0.2.0/24':s)??null,revision:'1'};return Response.json({data:{revision:'1'}});
    }
    if(options.fail&&++reads===1)return Response.json({error:{message:'Unavailable'}},{status:503});
    return Response.json({data:policy});
  });vi.stubGlobal('fetch',fetcher);render(<KeySourceAccess token="test" endpoint="/key/ip-policy" canWrite={options.canWrite??true} active/>);return{user:userEvent.setup(),fetcher};
}
async function choose(user:ReturnType<typeof userEvent.setup>,name:string){await user.click(screen.getByRole('button',{name:'Source IP access mode'}));await user.click(screen.getByRole('menuitemradio',{name}));}
it('sends explicit listed/block/all states and reads normalized networks',async()=>{
  const{user,fetcher}=setup();await user.click(await screen.findByRole('button',{name:'Edit source IP access'}));await choose(user,'Allow listed sources');
  expect((screen.getByRole('button',{name:'Save policy'})as HTMLButtonElement).disabled).toBe(true);
  await user.type(screen.getByLabelText('Allowed addresses or CIDRs'),'192.0.2.5/24');await user.click(screen.getByRole('button',{name:'Save policy'}));await screen.findByText('192.0.2.0/24');
  expect(JSON.parse(fetcher.mock.calls.find(([,init])=>init?.method==='PUT')![1]!.body as string)).toEqual({allowed_cidrs:['192.0.2.5/24'],expected_revision:'0'});
  await user.click(screen.getByRole('button',{name:'Edit source IP access'}));await choose(user,'Block all sources');await user.click(screen.getByRole('button',{name:'Save policy'}));await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
  await user.click(screen.getByRole('button',{name:'Edit source IP access'}));await choose(user,'Allow all sources');await user.click(screen.getByRole('button',{name:'Save policy'}));await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
  const writes=fetcher.mock.calls.filter(([,init])=>init?.method==='PUT').map(([,init])=>JSON.parse(init!.body as string));expect(writes[1].allowed_cidrs).toEqual([]);expect(writes[2].allowed_cidrs).toBeNull();
});
it('retains conflict protection after closing and reopens the saved policy on reload',async()=>{
  const{user}=setup({conflict:true});await user.click(await screen.findByRole('button',{name:'Edit source IP access'}));await choose(user,'Block all sources');await user.click(screen.getByRole('button',{name:'Save policy'}));await screen.findByText('This policy changed. Reload the saved policy before trying again.');
  await user.click(screen.getByRole('button',{name:'Cancel'}));await user.click(screen.getByRole('button',{name:'Edit source IP access'}));expect((screen.getByRole('button',{name:'Source IP access mode'})as HTMLButtonElement).disabled).toBe(true);
  await user.click(screen.getByRole('button',{name:'Reload policy'}));await screen.findByLabelText('Allowed addresses or CIDRs');expect((screen.getByLabelText('Allowed addresses or CIDRs')as HTMLTextAreaElement).value).toBe('192.0.2.0/24');
});
it('discards cancelled drafts without sending a write',async()=>{
  const{user,fetcher}=setup();await user.click(await screen.findByRole('button',{name:'Edit source IP access'}));await choose(user,'Block all sources');await user.click(screen.getByRole('button',{name:'Cancel'}));await user.click(screen.getByRole('button',{name:'Edit source IP access'}));expect(screen.getByRole('button',{name:'Source IP access mode'}).textContent).toContain('Allow all sources');expect(fetcher.mock.calls.some(([,init])=>init?.method==='PUT')).toBe(false);
});
it('keeps failed reads distinct from allow all and permits retry for viewers',async()=>{
  const{user}=setup({fail:true,canWrite:false});await screen.findByText('Policy unavailable');await user.click(screen.getByRole('button',{name:'Retry source IP access'}));await screen.findByText('Allow all sources');expect(screen.queryByRole('button',{name:'Edit source IP access'})).toBeNull();expect(screen.getByRole('button',{name:'Source IP access history'})).toBeTruthy();
});
it('retains backend validation failures without claiming a policy was saved',async()=>{
  const{user,fetcher}=setup();await user.click(await screen.findByRole('button',{name:'Edit source IP access'}));await choose(user,'Allow listed sources');await user.type(screen.getByLabelText('Allowed addresses or CIDRs'),'bad-address');
  fetcher.mockImplementationOnce(async()=>Response.json({error:{message:'Invalid IP address or CIDR'}},{status:400}));await user.click(screen.getByRole('button',{name:'Save policy'}));await screen.findByText('Invalid IP address or CIDR');expect((screen.getByLabelText('Allowed addresses or CIDRs')as HTMLTextAreaElement).value).toBe('bad-address');expect(screen.queryByText('Source IP access saved.')).toBeNull();
});
it('blocks listed mode when the entry count exceeds the supported bound',async()=>{
  const{user,fetcher}=setup();await user.click(await screen.findByRole('button',{name:'Edit source IP access'}));await choose(user,'Allow listed sources');await user.type(screen.getByLabelText('Allowed addresses or CIDRs'),Array.from({length:65},()=> '192.0.2.1').join('\n'));
  expect((screen.getByRole('button',{name:'Save policy'})as HTMLButtonElement).disabled).toBe(true);expect(fetcher.mock.calls.some(([,init])=>init?.method==='PUT')).toBe(false);
});
