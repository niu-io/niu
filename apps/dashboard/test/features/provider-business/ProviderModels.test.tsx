import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { it, expect, vi } from 'vitest';
import ProviderModels from '@/features/provider-business/ProviderModels';
import { emptyCapabilities } from '@/features/providers/api';

const connection = { id: 'credential-one', name: 'Production key', adapter: 'openrouter', api_base: 'https://openrouter.ai/api/v1', enabled: true, revision: 2, has_credential: true, provider: {id:'provider-one',name:'Provider'} };
const model = {alias:'team/chat',upstream_model:'upstream/chat',vendor_id:connection.id,public_catalog:false,enabled:true,capabilities:emptyCapabilities(),pricing:null,revision:3,available:false};
const props = {token:'token',providerId:'provider-one',providerSlug:'example',canManage:true,offers:[],offersComplete:true,qualified:false,onOffer:vi.fn(),onQualification:vi.fn(),onReviewOffer:vi.fn(),onSaved:vi.fn()};
function setup(personal=false, failSave=false) {
 const fetcher=vi.fn(async (input: RequestInfo | URL, init?:RequestInit) => {
   const path=String(input);
   if (init?.method==='POST') return failSave ? Response.json({error:{message:'Save unavailable'}},{status:503}) : Response.json({data:model});
   if (path.includes('/catalog')) return Response.json({data:[{id:'upstream/other',name:'Other model',context_length:null}]});
   if (path.includes('/models')) return Response.json({data:[{...model,owner_funded:personal,available:personal}]});
   return Response.json({data:[{...connection,owner_funded:personal}]});
 });
 vi.stubGlobal('fetch',fetcher);
 return fetcher;
}
it('includes unpriced models and exposes commercial prerequisites without declaring them ready',async()=>{
 setup(); render(<MemoryRouter><ProviderModels {...props}/></MemoryRouter>);
 await screen.findByText('team/chat');
 expect(screen.getByText('No purchase offer')).toBeTruthy();
 expect(screen.queryByText('Ready for commercial supply')).toBeNull();
 await userEvent.setup().click(screen.getByRole('button',{name:'Manage offer'}));
 expect(props.onOffer).toHaveBeenCalledWith('team/chat',false);
});
it('does not require commercial offers for a personal connection',async()=>{
 setup(true); render(<MemoryRouter><ProviderModels {...props}/></MemoryRouter>);
 await screen.findByText('team/chat');
 expect(screen.getByText(/Personal use · billed by Provider · Connection available/)).toBeTruthy();
 expect(screen.queryByRole('button',{name:'Manage offer'})).toBeNull();
});
it('keeps missing paginated offers unknown',async()=>{
 setup(); render(<MemoryRouter><ProviderModels {...props} offersComplete={false}/></MemoryRouter>);
 expect(await screen.findByText('Offer status not loaded')).toBeTruthy();
 expect(screen.queryByText('No purchase offer')).toBeNull();
});
it('edits a model in context with its revision and refreshes readiness after saving',async()=>{
 const fetcher=setup(); render(<MemoryRouter><ProviderModels {...props}/></MemoryRouter>);
 const user=userEvent.setup(); await user.click(await screen.findByRole('button',{name:'Edit model',exact:true}));
 expect(within(screen.getByRole('dialog')).getByText('Production key')).toBeTruthy();
 await user.click(screen.getByRole('button',{name:'Save changes'}));
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
 const saved=fetcher.mock.calls.find(([,init])=>init?.method==='POST');
 expect(saved?.[0]).toBe('/api/v1/vendors/credential-one/models');
 expect(JSON.parse(saved?.[1]?.body as string)).toMatchObject({alias:'team/chat',expected_revision:3});
 expect(screen.getByRole('status').textContent).toContain('Model saved');
});
it('does not leave a blind resubmit form after an uncertain save',async()=>{
 setup(false,true); render(<MemoryRouter><ProviderModels {...props}/></MemoryRouter>);
 const user=userEvent.setup(); await user.click(await screen.findByRole('button',{name:'Edit model',exact:true}));
 await user.click(screen.getByRole('button',{name:'Save changes'}));
 expect(await screen.findByText(/save could not be confirmed/)).toBeTruthy();
 expect(screen.queryByRole('dialog')).toBeNull();
});
it('removes editing context when permissions are lost',async()=>{
 setup(); const view=render(<MemoryRouter><ProviderModels {...props}/></MemoryRouter>);
 await userEvent.setup().click(await screen.findByRole('button',{name:'Edit API key'}));
 expect(screen.getByText('Changes to this API key apply to every model using it.')).toBeTruthy();
 view.rerender(<MemoryRouter><ProviderModels {...props} canManage={false}/></MemoryRouter>);
 expect(screen.queryByRole('dialog')).toBeNull();
 expect((await screen.findByRole('button',{name:'Edit model',exact:true}) as HTMLButtonElement).disabled).toBe(true);
});
it('starts an offer-only model connection with its existing alias',async()=>{
 setup();
 const offer={id:'offer-one',model_alias:'team/new',active:false,qualified:false,route_ready:false,rate_kind:'text' as const,currency:'USD',prompt_rate:'0',completion_rate:'0'};
 render(<MemoryRouter><ProviderModels {...props} offers={[offer as never]}/></MemoryRouter>);
 await userEvent.setup().click(await screen.findByRole('button',{name:'Add model connection'}));
 expect((screen.getByLabelText('Niu model alias') as HTMLInputElement).value).toBe('team/new');
});
it('loads recognized upstream choices and returns focus when the editor closes',async()=>{
 setup(); render(<MemoryRouter><ProviderModels {...props}/></MemoryRouter>);
 const user=userEvent.setup(); const opener=await screen.findByRole('button',{name:'Edit model',exact:true});
 await user.click(opener); await user.click(screen.getByRole('button',{name:'Upstream model'}));
 expect(await screen.findByRole('menuitemradio',{name:/Other model/})).toBeTruthy();
 await user.keyboard('{Escape}'); await user.keyboard('{Escape}');
 await waitFor(()=>expect(document.activeElement).toBe(opener));
});
it('does not present a failed route inventory as an empty model list',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL)=>String(input).includes('/models') ? Response.json({error:{message:'Temporarily unavailable'}},{status:503}) : Response.json({data:[connection]})));
 render(<MemoryRouter><ProviderModels {...props}/></MemoryRouter>);
 expect(await screen.findByRole('alert')).toBeTruthy();
 expect(screen.queryByText('No models configured yet.')).toBeNull();
 expect((screen.getByRole('button',{name:'Add model',exact:true}) as HTMLButtonElement).disabled).toBe(true);
});
it('keeps route availability separate from commercial qualification',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL)=>Response.json({data:String(input).includes('/models') ? [{...model,available:true}] : [connection]})));
 render(<MemoryRouter><ProviderModels {...props}/></MemoryRouter>);
 expect(await screen.findByText(/Commercial connection · Connection available/)).toBeTruthy();
 expect(screen.getByText('No purchase offer')).toBeTruthy();
 expect(screen.queryByText('Ready for commercial supply')).toBeNull();
});
