import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import CustomerPricingRoute from '../../../src/features/customer-pricing/page';

vi.mock('../../../src/app/dashboard-context', () => ({useDashboardContext: () => ({token:'test-session',models:[{id:'example/model'}]})}));
const target = {organization_id:'internal-company',organization_name:'Example company',workspace_id:'internal-workspace',workspace_name:'Application'};
const price = {model_alias:'example/model',revision:'internal-revision',currency:'USD',prompt_rate:'1',completion_rate:'1600000000',cached_prompt_rate:'0',reasoning_completion_rate:'2500000000',request_fee_nanos:'7',minimum_charge_nanos:'9',created_at:'2026-10-11T00:00:00Z'};
const base='/admin/v1/pricing/organizations/internal-company/workspaces/internal-workspace/tariffs';
function setup(handle: (path:string, init?:RequestInit)=>Response|Promise<Response>, selected=true) {
  const requests:{path:string;init?:RequestInit}[]=[];
  vi.stubGlobal('fetch',vi.fn((input:RequestInfo|URL,init?:RequestInit)=>{const path=String(input);requests.push({path,init});return Promise.resolve(path==='/admin/v1/vendors'?Response.json({data:[{id:'route',enabled:true}]}):path==='/admin/v1/vendors/route/models'?Response.json({data:[{alias:'example/model',enabled:true,capabilities:{}}]}):handle(path,init));}));
  render(<MemoryRouter initialEntries={[selected?'/admin/pricing?target=internal-workspace':'/admin/pricing']}><CustomerPricingRoute/></MemoryRouter>);
  return requests;
}
const targets=()=>Response.json({data:[target],next_after:null});
const prices=()=>Response.json({data:[price],next_after:null});

describe('platform customer price workflow',()=>{
  it('locks publication after an ambiguous transport failure until the current price is read',async()=>{
    let writes=0;
    setup((path,init)=>path.includes('/targets?')?targets():init?.method==='POST'?(writes++,Promise.reject(new TypeError('Connection lost'))):prices());
    const user=userEvent.setup();
    await user.click(await screen.findByRole('button',{name:'Edit example/model'}));
    await user.click(screen.getAllByRole('button',{name:'Publish price'}).at(-1)!);
    await screen.findByText('Publication could not be confirmed. Load the current price before trying again.');
    expect((screen.getAllByRole('button',{name:'Publish price'}).at(-1) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText('Customer price published. Future requests use the new price.')).toBeNull();
    expect(writes).toBe(1);
  });
  it('retains revision history when an older page fails and retries that boundary',async()=>{
    let olderReads=0;
    const requests=setup(path=>path.includes('/targets?')?targets():path.includes('/history?')?(path.includes('&before=older')?(++olderReads===1?Response.json({error:{message:'History temporarily unavailable'}},{status:503}):Response.json({data:[{...price,revision:'previous-revision',created_at:'2026-10-10T00:00:00Z',is_current:false}],current_revision:price.revision,has_more:false,next_before:null})):Response.json({data:[{...price,is_current:true}],current_revision:price.revision,has_more:true,next_before:'older'})):prices());
    const user=userEvent.setup();
    await user.click(await screen.findByRole('button',{name:'History for example/model'}));
    await user.click(await screen.findByRole('button',{name:'Older revisions'}));
    await user.click(await screen.findByRole('button',{name:'Retry history'}));
    await waitFor(()=>expect(screen.queryByRole('button',{name:'Older revisions'})).toBeNull());
    expect(screen.getByText('Current')).toBeTruthy();
    expect(requests.filter(row=>row.path.includes('&before=older'))).toHaveLength(2);
    expect(screen.queryByText('previous-revision')).toBeNull();
  });
  it('sends exact prices with the observed revision and preserves zero cache pricing',async()=>{
    const requests=setup((path,init)=>path.includes('/targets?')?targets():init?.method==='POST'?Response.json({data:{revision:'next-revision'}}):prices());
    const user=userEvent.setup();
    await user.click(await screen.findByRole('button',{name:'Edit example/model'}));
    expect((screen.getByLabelText('Input per million tokens') as HTMLInputElement).value).toBe('0.000000001');
    await user.click(screen.getAllByRole('button',{name:'Publish price'}).at(-1)!);
    await screen.findByText('Customer price published. Future requests use the new price.');
    const write=requests.find(row=>row.init?.method==='POST')!;
    expect(JSON.parse(String(write.init?.body))).toMatchObject({expected_revision:price.revision,prompt_rate:'1',cached_prompt_rate:'0',reasoning_completion_rate:'2500000000',request_fee_nanos:'7',minimum_charge_nanos:'9'});
    expect(screen.queryByText(target.organization_id)).toBeNull();
    expect(screen.queryByText(price.revision)).toBeNull();
    expect(requests.every(row=>!row.path.includes('/providers')&&!row.path.includes('/billing/overview'))).toBe(true);
  });
  it('preserves a conflicting draft until an explicit reload and then uses the new revision',async()=>{
    let writes=0;
    const requests=setup((path,init)=>path.includes('/targets?')?targets():init?.method==='POST'?(++writes===1?Response.json({error:{message:'Concurrent change'}},{status:409}):Response.json({data:{revision:'third'}})):path.includes('/history?')?Response.json({data:[{...price,revision:'second',prompt_rate:'2000000000',reasoning_completion_rate:'3100000000',is_current:true}],current_revision:'second',has_more:false,next_before:null}):prices());
    const user=userEvent.setup();
    await user.click(await screen.findByRole('button',{name:'Edit example/model'}));
    await user.clear(screen.getByLabelText('Input per million tokens'));await user.type(screen.getByLabelText('Input per million tokens'),'3');
    await user.click(screen.getAllByRole('button',{name:'Publish price'}).at(-1)!);
    await screen.findByRole('button',{name:'Load current price'});
    expect((screen.getByLabelText('Input per million tokens') as HTMLInputElement).value).toBe('3');
    expect(writes).toBe(1);
    await user.click(screen.getByRole('button',{name:'Load current price'}));
    await waitFor(()=>expect((screen.getByLabelText('Input per million tokens') as HTMLInputElement).value).toBe('2'));
    await user.click(screen.getAllByRole('button',{name:'Publish price'}).at(-1)!);
    await screen.findByText('Customer price published. Future requests use the new price.');
    expect(JSON.parse(String(requests.filter(row=>row.init?.method==='POST')[1].init?.body))).toMatchObject({expected_revision:'second',reasoning_completion_rate:'3100000000'});
  });
  it('retries a failed target refresh from the first page rather than the retained continuation',async()=>{
    let reads=0;
    const requests=setup(path=>path.includes('/targets?')?(++reads===2?Response.json({error:{message:'Temporary target failure'}},{status:503}):Response.json({data:[target],next_after:'older-targets'})):prices());
    const user=userEvent.setup();
    await screen.findByRole('button',{name:'Edit example/model'});
    await user.click(screen.getByRole('button',{name:'Refresh pricing targets'}));
    await user.click(await screen.findByRole('button',{name:'Retry targets'}));
    await waitFor(()=>expect(reads).toBe(3));
    expect(requests.filter(row=>row.path.includes('/targets?')).map(row=>row.path)).toEqual(Array(3).fill('/admin/v1/pricing/targets?limit=50'));
  });
  it('retains current prices when continuation fails and retries the same cursor',async()=>{
    let continuations=0;
    const requests=setup(path=>path.includes('/targets?')?targets():path.includes('&after=next')?(++continuations===1?Response.json({error:{message:'Temporary price failure'}},{status:503}):Response.json({data:[{...price,model_alias:'example/other'}],next_after:null})):Response.json({data:[price],next_after:'next'}));
    const user=userEvent.setup();
    await user.click(await screen.findByRole('button',{name:'More prices'}));
    await screen.findByRole('button',{name:'Retry prices'});
    expect(screen.getByRole('button',{name:'Edit example/model'})).toBeTruthy();
    await user.click(screen.getByRole('button',{name:'Retry prices'}));
    await screen.findByRole('button',{name:'Edit example/other'});
    expect(requests.filter(row=>row.path.includes('&after=next'))).toHaveLength(2);
  });
});
