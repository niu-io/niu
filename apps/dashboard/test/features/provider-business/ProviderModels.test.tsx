import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { it, expect, vi } from 'vitest';
import ProviderModels from '@/features/provider-business/ProviderModels';
import { emptyCapabilities, type ProviderModelCheck } from '@/features/providers/api';

const connection = { id: 'credential-one', name: 'Production key', adapter: 'openrouter', api_base: 'https://openrouter.ai/api/v1', enabled: true, revision: 2, has_credential: true, provider: {id:'provider-one',name:'Provider'} };
const model = {alias:'team/chat',upstream_model:'upstream/chat',vendor_id:connection.id,public_catalog:false,enabled:true,capabilities:emptyCapabilities(),pricing:null,revision:3,available:false};
const props = {token:'token',providerId:'provider-one',providerSlug:'example',canManage:true,offers:[],offersComplete:true,onOffer:vi.fn(),onEnableOffer:vi.fn(),onSaved:vi.fn()};
type ModelFixture = typeof model;
type SetupOptions = {
  check?: ProviderModelCheck;
  importResult?: { imported: number; discovered: number };
  modelPatch?: Partial<ModelFixture>;
  models?: ModelFixture[];
  connectionRevision?: number;
  catalog?: Array<{id:string;name:string;context_length:number|null}>;
  catalogFails?: boolean;
};
function setup(personal=false, failSave=false, options: SetupOptions = {}) {
 const fetcher=vi.fn(async (input: RequestInfo | URL, init?:RequestInit) => {
   const path=String(input);
   const method=init?.method ?? 'GET';
   if (method==='POST' && path.endsWith('/check')) {
     return Response.json({data: options.check ?? {status:'connected',model:'listed',http_status:200,duration_ms:8,checked_at_ms:1}});
   }
   if (method==='POST' && path.endsWith('/import')) {
     return Response.json({data: options.importResult ?? {imported:2,discovered:3}});
   }
   if (method==='POST') return failSave ? Response.json({error:{message:'Save unavailable'}},{status:503}) : Response.json({data:model});
   if (path.includes('/catalog')) {
     if (options.catalogFails) return Response.json({error:{message:'Catalog temporarily unavailable'}},{status:503});
     return Response.json({data: options.catalog ?? [{id:'upstream/other',name:'Other model',context_length:null}]});
   }
   if (path.includes('/models')) return Response.json({data: options.models ?? [{...model,...options.modelPatch,owner_funded:personal,available:personal}]});
   return Response.json({data:[{...connection,revision:options.connectionRevision ?? connection.revision,owner_funded:personal}]});
 });
 vi.stubGlobal('fetch',fetcher);
 return fetcher;
}
async function openAddModel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button',{name:'Add model',exact:true}));
  return screen.getByRole('dialog');
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
 expect(screen.getByText(/Personal use · billed by Provider · Route configured · Provider access not verified/)).toBeTruthy();
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
it('preserves existing procurement pricing when editing a model capability',async()=>{
 const pricing={currency:'USD',input_per_million:'1000000000',output_per_million:'2000000000'};
 const fetcher=setup(false,false,{models:[{...model,pricing,revision:7}]});
 render(<MemoryRouter><ProviderModels {...props}/></MemoryRouter>);
 const user=userEvent.setup();
 await user.click(await screen.findByRole('button',{name:'Edit model',exact:true}));
 await user.click(screen.getByRole('checkbox',{name:/Function tools/}));
 await user.click(screen.getByRole('button',{name:'Save changes'}));
 await waitFor(()=>expect(screen.queryByRole('button',{name:'Save changes'})).toBeNull());
 const write=JSON.parse(fetcher.mock.calls.find(([,init])=>init?.method==='POST')?.[1]?.body as string);
 expect(write).toMatchObject({expected_revision:7,capabilities:{supports_tool_calls:true}});
 expect(write).not.toHaveProperty('pricing');
});
it('does not leave a blind resubmit form after an uncertain save',async()=>{
 setup(false,true); render(<MemoryRouter><ProviderModels {...props}/></MemoryRouter>);
 const user=userEvent.setup(); await user.click(await screen.findByRole('button',{name:'Edit model',exact:true}));
 await user.click(screen.getByRole('button',{name:'Save changes'}));
 expect(await screen.findByText(/save could not be confirmed/)).toBeTruthy();
 expect(screen.queryByRole('dialog')).toBeNull();
});
it('keeps a rejected model save inside its dialog and preserves the draft',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
   const path=String(input);
   if (init?.method==='POST' && path.endsWith('/models')) return Response.json({error:{message:'Model alias already exists'}},{status:409});
   if (path.includes('/models')) return Response.json({data:[]});
   return Response.json({data:[connection]});
 }));
 render(<MemoryRouter><ProviderModels {...props}/></MemoryRouter>);
 const user=userEvent.setup();
 await openAddModel(user);
 await user.type(screen.getByLabelText('Niu model alias'),'team/fast');
 await user.click(screen.getByLabelText('Upstream model'));
 await user.type(screen.getByRole('textbox',{name:'Search provider models'}),'upstream-model');
 await user.click(screen.getByRole('menuitem',{name:'Use model ID “upstream-model”'}));
 await user.click(screen.getByRole('button',{name:'Add model'}));
 expect((await screen.findByRole('alert')).textContent).toContain('Model alias already exists');
 expect((screen.getByLabelText('Niu model alias') as HTMLInputElement).value).toBe('team/fast');
});
it('removes editing context when permissions are lost',async()=>{
 setup(); const view=render(<MemoryRouter><ProviderModels {...props}/></MemoryRouter>);
 const user=userEvent.setup();
 await user.click(await screen.findByRole('button',{name:'Edit model',exact:true}));
 expect(screen.getByRole('dialog')).toBeTruthy();
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
 expect(await screen.findByText(/Commercial connection · Route configured · Provider access not verified/)).toBeTruthy();
 expect(screen.getByText('No purchase offer')).toBeTruthy();
 expect(screen.queryByText('Ready for commercial supply')).toBeNull();
});
it('refreshes route availability when offer activation changes',async()=>{
 let available=false;
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL)=>Response.json({data:String(input).includes('/models') ? [{...model,available}] : [connection]})));
 const offer={id:'offer-one',model_alias:'team/chat',revision:'revision-one',active:false,qualified:false,route_ready:false,rate_kind:'text' as const,currency:'USD',prompt_rate:'1',completion_rate:'1'};
 const view=render(<MemoryRouter><ProviderModels {...props} token="offer-refresh-test" offers={[offer]}/></MemoryRouter>);
 expect(await screen.findByText(/Commercial connection · Route unavailable/)).toBeTruthy();
 available=true;
 view.rerender(<MemoryRouter><ProviderModels {...props} token="offer-refresh-test" offers={[{...offer,active:true,qualified:true,route_ready:true}]}/></MemoryRouter>);
 expect(await screen.findByText(/Commercial connection · Route configured · Provider access not verified/)).toBeTruthy();
});
it('checks reachability from the models surface and explains a Qiniu restriction',async()=>{
 const fetcher=setup(false,false,{check:{status:'account_chat_banned',model:'unknown',http_status:403,duration_ms:1,checked_at_ms:1}});
 render(<MemoryRouter><ProviderModels {...props}/></MemoryRouter>);
 await screen.findByText('team/chat');
 await userEvent.setup().click(screen.getByRole('button',{name:'Check',exact:true}));
 expect(await screen.findByText(/Qiniu account is not permitted to use chat services/)).toBeTruthy();
 expect(screen.queryByText('Key rejected. Check the saved provider key.')).toBeNull();
 const check=fetcher.mock.calls.find(([,init])=>init?.method==='POST');
 expect(check?.[0]).toBe('/api/v1/vendors/credential-one/check');
 expect(JSON.parse(check?.[1]?.body as string)).toEqual({alias:'team/chat'});
});
it('keeps each concurrent model check pending until its own response arrives',async()=>{
 const first={...model,alias:'first',upstream_model:'first'};
 const second={...model,alias:'second',upstream_model:'second'};
 let finishFirst!: (result: ProviderModelCheck) => void;
 let finishSecond!: (result: ProviderModelCheck) => void;
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
   const path=String(input);
   if (init?.method==='POST' && path.endsWith('/check')) {
     const {alias}=JSON.parse(init.body as string);
     return new Promise<Response>(resolve => {
       const finish=(result:ProviderModelCheck)=>resolve(Response.json({data:result}));
       if (alias==='first') finishFirst=finish; else finishSecond=finish;
     });
   }
   if (path.includes('/models')) return Response.json({data:[first,second]});
   return Response.json({data:[connection]});
 }));
 render(<MemoryRouter><ProviderModels {...props}/></MemoryRouter>);
 const user=userEvent.setup();
 const firstRow=(await screen.findByRole('cell',{name:'first'})).closest('tr')!;
 const secondRow=screen.getByRole('cell',{name:'second'}).closest('tr')!;
 await user.click(within(firstRow).getByRole('button',{name:'Check',exact:true}));
 await user.click(within(secondRow).getByRole('button',{name:'Check',exact:true}));
 expect((within(firstRow).getByRole('button',{name:'Checking…'}) as HTMLButtonElement).disabled).toBe(true);
 expect((within(secondRow).getByRole('button',{name:'Checking…'}) as HTMLButtonElement).disabled).toBe(true);
 finishSecond({status:'connected',model:'listed',http_status:200,duration_ms:1,checked_at_ms:1});
 await waitFor(()=>expect(within(secondRow).getByRole('button',{name:'Check',exact:true})).toBeTruthy());
 expect(within(firstRow).getByRole('button',{name:'Checking…'})).toBeTruthy();
 finishFirst({status:'connected',model:'listed',http_status:200,duration_ms:1,checked_at_ms:1});
 await waitFor(()=>expect(within(firstRow).getByRole('button',{name:'Check',exact:true})).toBeTruthy());
});
it('does not attribute an old check to a revised route or credential, or replace a newer check',async()=>{
 let current=[{...model,alias:'same-alias',upstream_model:'first-upstream'}];
 let credentialRevision=1;
 const completions:Array<(result:ProviderModelCheck)=>void>=[];
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
   const path=String(input);
   if (init?.method==='POST' && path.endsWith('/check')) return new Promise<Response>(resolve=>completions.push(result=>resolve(Response.json({data:result}))));
   if (path.includes('/models')) return Response.json({data:current});
   return Response.json({data:[{...connection,revision:credentialRevision}]});
 }));
 render(<MemoryRouter><ProviderModels {...props}/></MemoryRouter>);
 const user=userEvent.setup();
 await user.click(await screen.findByRole('button',{name:'Check',exact:true}));
 current=[{...current[0],revision:4,upstream_model:'second-upstream'}];
 await user.click(screen.getByRole('button',{name:'Refresh'}));
 await waitFor(()=>expect(screen.queryByRole('button',{name:'Checking…'})).toBeNull());
 await user.click(screen.getByRole('button',{name:'Check',exact:true}));
 completions[0]({status:'credentials_rejected',model:'unknown',http_status:401,duration_ms:1,checked_at_ms:1});
 await waitFor(()=>expect(screen.getByRole('button',{name:'Checking…'})).toBeTruthy());
 expect(screen.queryByText('Key rejected. Check the saved provider key.')).toBeNull();
 completions[1]({status:'connected',model:'listed',http_status:200,duration_ms:1,checked_at_ms:1});
 await screen.findByText('Reachable · model listed. Try Chat to verify access.');
 credentialRevision=2;
 await user.click(screen.getByRole('button',{name:'Refresh'}));
 await waitFor(()=>expect(screen.queryByText('Reachable · model listed. Try Chat to verify access.')).toBeNull());
 expect(screen.getByRole('button',{name:'Check',exact:true})).toBeTruthy();
});
it('shows declared capability badges without presenting them as verified behavior',async()=>{
 setup(false,false,{modelPatch:{capabilities:{...emptyCapabilities(),supports_tool_calls:true,supports_streaming_tool_calls:true,supports_structured_output:true}}});
 render(<MemoryRouter><ProviderModels {...props}/></MemoryRouter>);
 await screen.findByText('team/chat');
 expect(screen.getByText('Tools · streaming')).toBeTruthy();
 expect(screen.getByText('Structured output')).toBeTruthy();
 expect(screen.getByLabelText('Optional capabilities')).toBeTruthy();
});
it('imports discovered models from the models surface and reports the result',async()=>{
 const fetcher=setup(false,false,{importResult:{imported:2,discovered:3}});
 render(<MemoryRouter><ProviderModels {...props}/></MemoryRouter>);
 await screen.findByText('team/chat');
 await userEvent.setup().click(screen.getByRole('button',{name:'Import models',exact:true}));
 expect(await screen.findByText('Imported 2 of 3 discovered models.')).toBeTruthy();
 const importCall=fetcher.mock.calls.find(([,init])=>init?.method==='POST');
 expect(importCall?.[0]).toBe('/api/v1/vendors/credential-one/import');
 expect(props.onSaved).toHaveBeenCalled();
});
it('keeps imported commercial routes disabled and unpriced until an offer qualifies them',async()=>{
 let imported=false;
 const disabledModel={...model,enabled:false,available:false,pricing:null};
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
   const path=String(input);
   if (init?.method==='POST' && path.endsWith('/import')) { imported=true; return Response.json({data:{imported:1,discovered:1}}); }
   if (path.includes('/models')) return Response.json({data:imported ? [disabledModel] : []});
   return Response.json({data:[connection]});
 }));
 render(<MemoryRouter><ProviderModels {...props}/></MemoryRouter>);
 expect(await screen.findByText('No models configured yet.')).toBeTruthy();
 const user=userEvent.setup();
 await user.click(screen.getByRole('button',{name:'Import models',exact:true}));
 expect(await screen.findByText('Imported 1 of 1 discovered models.')).toBeTruthy();
 expect(await screen.findByText(/Commercial connection · Model disabled/)).toBeTruthy();
 expect(screen.getByText('No purchase offer')).toBeTruthy();
 expect(screen.queryByText('Ready for commercial supply')).toBeNull();
 expect((screen.getByRole('button',{name:'Add model',exact:true}) as HTMLButtonElement).disabled).toBe(false);
 expect(screen.getByRole('button',{name:'Import models',exact:true})).toBeTruthy();
});
it('links to API key management instead of embedding a second credential editor',async()=>{
 setup(); render(<MemoryRouter><ProviderModels {...props}/></MemoryRouter>);
 await screen.findByText('team/chat');
 const link=screen.getByRole('link',{name:'Manage API keys'});
 expect(link.getAttribute('href')).toBe('/admin/providers/example/keys');
 expect(screen.queryByRole('button',{name:'Edit API key'})).toBeNull();
});
it('keeps the first model on an owner-funded credential private',async()=>{
 setup(true); render(<MemoryRouter><ProviderModels {...props}/></MemoryRouter>);
 const user=userEvent.setup();
 await openAddModel(user);
 expect(screen.getByText('Private model. Available only to the account that owns this API key.')).toBeTruthy();
 expect(screen.queryByRole('checkbox',{name:/Show in public catalog/})).toBeNull();
 await user.type(screen.getByLabelText('Niu model alias'),'private/first');
 await user.click(screen.getByLabelText('Upstream model'));
 await user.type(screen.getByRole('textbox',{name:'Search provider models'}),'model-first');
 await user.click(screen.getByRole('menuitem',{name:'Use model ID “model-first”'}));
 await user.click(screen.getByRole('button',{name:'Add model'}));
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
});
it('retries catalog discovery inside the model editor without losing its draft',async()=>{
 let reads=0;
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL)=>{
   const path=String(input);
   if (path.includes('/catalog')) {
     reads+=1;
     return reads===1 ? Response.json({error:{message:'Catalog temporarily unavailable'}},{status:503}) : Response.json({data:[{id:'upstream/available',name:'Available model',context_length:null}]});
   }
   return Response.json({data:path.includes('/models') ? [] : [connection]});
 }));
 render(<MemoryRouter><ProviderModels {...props}/></MemoryRouter>);
 const user=userEvent.setup();
 await openAddModel(user);
 await user.click(screen.getByLabelText('Upstream model'));
 await user.keyboard('{Escape}');
 await user.type(screen.getByLabelText('Niu model alias'),'team/custom');
 await screen.findByRole('button',{name:'Retry model catalog'});
 await user.click(screen.getByLabelText('Upstream model'));
 await user.type(screen.getByRole('textbox',{name:'Search provider models'}),'custom-model');
 await user.click(screen.getByRole('menuitem',{name:'Use model ID “custom-model”'}));
 await user.click(screen.getByRole('button',{name:'Retry model catalog'}));
 await screen.findByText('1 model reported by the upstream catalog');
 expect((screen.getByLabelText('Niu model alias') as HTMLInputElement).value).toBe('team/custom');
});
