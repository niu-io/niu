import { act,render,screen,waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import userEvent from '@testing-library/user-event';
import { expect,it,vi } from 'vitest';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { SidebarProvider } from '@/components/ui/sidebar';
import SessionView from '@/features/video/VideoView';
import type { DashboardContext } from '@/shell/dashboard-context';
import type { VideoModel } from '@niu-io/sdk';
import { initialControls,videoRequest } from '@/features/video/request';
import GenerationsLayout from '@/features/generations/GenerationsLayout';
import type { ComponentProps } from 'react';
function VideoView(props: ComponentProps<typeof SessionView>) { return <GenerationsLayout><SessionView {...props} /></GenerationsLayout>; }

const workspace={id:'11111111-1111-4111-8111-111111111111',organization_id:'22222222-2222-4222-8222-222222222222',name:'Review workspace',organization_name:'Review'};
const key='33333333-3333-4333-8333-333333333333';
const job='44444444-4444-4444-8444-444444444444';
const model:VideoModel={object:'video.model',id:'Video review model',mode:'customer',input_types:['text'],text:{maximum_items:1,maximum_bytes:1024},maximum_body_bytes:2048,maximum_content_items:1,controls:{resolution:{kind:'choice',values:['720p','1080p'],default:'720p'},ratio:{kind:'choice',values:['16:9','1:1'],default:'16:9'},duration:{kind:'integer',minimum:1,maximum:10,default:5},frames_per_second:{kind:'integer',minimum:24,maximum:60,default:24}},required_controls:[],exclusive_controls:[],output:{specifications:[{resolution:'720p',ratio:'16:9',width:1280,height:720},{resolution:'1080p',ratio:'1:1',width:1080,height:1080}],meter:'video_tokens',estimator:'SeedancePixelsV1'}};
const quote={object:'video.estimate',model:model.id,mode:'customer',effective_output:{specification:model.output.specifications[0],duration_seconds:5,frames_per_second:24},estimate:{amount_nanos:'1000000000',currency:'CNY'},maximum_charge_nanos:'2000000000'};
function mount(write=true,initialPath='/chat?mode=video') {
  const context={token:'member',workspace,workspaces:[workspace],session:{permissions:{write}},selectWorkspace:vi.fn()} as unknown as DashboardContext;
  render(<MemoryRouter initialEntries={[initialPath]}><SidebarProvider><VideoView context={context}/></SidebarProvider></MemoryRouter>);
}
function mockFetch(create:()=>Promise<Response>=async()=>Response.json({id:job,object:'video.job',model:model.id,status:'queued'}), lifecycle?:unknown, catalogModel:VideoModel=model) {
  const calls:Array<{path:string;body:unknown;headers?:Headers}>=[];
  const intents=new Map<string,unknown>();
  const drafts=new Map<string,{revision:number;content_state:string;expires_at_ms:string|null;payload:unknown}>();
  const sessions=new Map<string,{id:string;workspace_id:string;category:string;title:string;archived:boolean;revision:string;turns:Array<{id:string;sequence:string;created_at:string;content_expires_at:string;content_state:string;instruction:unknown;intent:unknown;task_id:string|null;task: null}>}>();
  vi.stubGlobal('fetch',vi.fn(async(path:string,init?:RequestInit)=>{
    calls.push({path,body:init?.body ? JSON.parse(String(init.body)):null,headers:new Headers(init?.headers)});
    if(path.endsWith('/video/draft')){
      const prior=drafts.get(path)??{revision:0,content_state:'empty',expires_at_ms:null,payload:null};
      if(init?.method==='PUT'){
        const body=JSON.parse(String(init.body));
        const saved={revision:body.expected_revision+1,content_state:body.payload?'retained':'empty',expires_at_ms:body.payload?'1800000000000':null,payload:body.payload};
        drafts.set(path,saved);
        return Response.json({data:saved});
      }
      return Response.json({data:prior});
    }
    if(path.includes('/sessions?'))return Response.json({data:[],has_more:false,next_before:null});
    if(/\/sessions\/[0-9a-f-]{36}(?:[/?]|$)/.test(path)){
      const match=path.match(/\/workspaces\/([^/]+)\/sessions\/([^/?]+)(?:\/turns\/([^/?]+)(\/intent)?)?/);
      if(!match)return Response.json({error:{message:'Not found'}},{status:404});
      const [,wsId,sessionId,turnId,isBind]=match;
      const sessionKey=`${wsId}:${sessionId}`;
      if(!turnId){
        if(init?.method==='PUT'){
          const body=JSON.parse(String(init.body));
          const created={id:sessionId,workspace_id:wsId,owner:'member',category:'video',title:body.title,archived:false,revision:'1',created_at:'1970-01-01T00:00:00Z',updated_at:'1970-01-01T00:00:00Z',turns:[]};
          sessions.set(sessionKey,created);
          return Response.json({data:created});
        }
        const existing=sessions.get(sessionKey);
        return existing ? Response.json({data:existing}) : Response.json({error:{message:'Not found'}},{status:404});
      }
      const existing=sessions.get(sessionKey)!;
      if(!isBind){
        const body=JSON.parse(String(init?.body));
        const nextRev=String(Number(existing.revision)+1);
        const updated={...existing,revision:nextRev,turns:[...existing.turns,{id:turnId,sequence:String(existing.turns.length+1),created_at:'1970-01-01T00:00:00Z',content_expires_at:'2026-12-31T00:00:00Z',content_state:'retained',instruction:body.instruction,intent:null,task_id:null,task:null}]};
        sessions.set(sessionKey,updated);
        return Response.json({data:updated});
      }
      const body=JSON.parse(String(init?.body));
      const intentEntry=[...intents.entries()].find(([k])=>k.endsWith(`/video/intents/${body.intent_id}`));
      const intentDoc=intentEntry?.[1] as {model:string}|undefined;
      if(intentEntry&&intentDoc)intents.set(intentEntry[0],{...intentDoc,session_binding:{session_id:sessionId,turn_id:turnId}});
      const nextRev=String(Number(existing.revision)+1);
      const updated={...existing,revision:nextRev,turns:existing.turns.map(t=>t.id===turnId?{...t,intent:{id:body.intent_id,revision:'1',model:intentDoc?.model??catalogModel.id,content_state:'retained',submission_state:'saved',task_id:null}}:t)};
      sessions.set(sessionKey,updated);
      return Response.json({data:updated});
    }
    if(path.includes('/tasks?'))return Response.json({data:[],has_more:false,next_cursor:null});
    if(path.includes('/tasks/') && path.endsWith('/diagnostics'))return Response.json({billing:{mode:'customer',charge_nanos:null,reserved_nanos:'2000000000',currency:'CNY'},timings:{data:[],has_more:false,lifecycle}});
    if(path.includes('/tasks/'))return Response.json({data:{id:path.split('/').at(-1),kind:'video',model:catalogModel.id,state:'queued',created_at:'1970-01-01T00:00:00Z',updated_at:'1970-01-01T00:00:00Z',artifacts:[]}});
    if(path.includes('/v1/media/capabilities'))return Response.json({modules:[]});
    if(path.endsWith('/video/intents') || path.includes('/video/intents?'))return Response.json({data:[],has_more:false,next_before:null});
    if(path.endsWith('/chats'))return Response.json({data:[]});
    if(path.endsWith('/keys'))return Response.json({data:[{id:key,name:'Review key',allowed_models:['*'],revoked:false,expired:false}]});
    if(path.endsWith('/models'))return Response.json({object:'list',data:[catalogModel]});
    if(path.includes('/jobs?'))return Response.json({data:[],has_more:false,next_before:null});
    if(path.endsWith('/estimate'))return Response.json(quote);
    if(path.endsWith('/submit')){
      const response=await create();
      if(response.ok){const submitted=await response.clone().json();const savedPath=path.slice(0,-'/submit'.length);const saved=intents.get(savedPath);if(saved)intents.set(savedPath,{...saved as object,submission_state:'dispatched',job:submitted});}
      return response;
    }
    if(path.includes('/video/intents/')){
      if(init?.method==='PUT'){
        const body=JSON.parse(String(init.body));
        const saved={id:path.split('/').at(-1),revision:1,expires_at_ms:'1800000000000',content_state:'retained',original_key_id:body.key_id,key_id:body.key_id,model:body.request.model,funding_mode:'customer',request:body.request,submission_state:'saved',job:null};
        intents.set(path,saved);return Response.json({data:saved});
      }
      const saved=intents.get(path);
      return saved ? Response.json({data:saved}):Response.json({error:{message:'Intent unavailable'}},{status:404});
    }
    if(path.endsWith('/jobs'))return create();
    if(path.endsWith('/billing'))return Response.json({mode:'customer',charge_nanos:null,reserved_nanos:'2000000000',currency:'CNY'});
    if(path.endsWith('/timings'))return Response.json({data:[],has_more:false,lifecycle});
    return Response.json({id:job,object:'video.job',model:model.id,status:'queued'});
  }));
  return calls;
}
it.each([
  null,
  {},
  {data:null},
  {data:{id:job,kind:'video',model:model.id,state:'invalid'}},
  {data:{id:job,kind:'video',model:model.id,state:'toString'}},
  {data:{id:key,kind:'video',model:model.id,state:'queued'}},
  {data:{id:job,kind:'video',model:null,state:'queued'}},
])('surfaces malformed saved video response %j and reloads without dispatching',async(payload)=>{
  const calls=mockFetch();const fallback=globalThis.fetch;let malformed=true;
  vi.stubGlobal('fetch',vi.fn(async(path:string,init?:RequestInit)=>{
    if(path.endsWith(`/workspaces/${workspace.id}/tasks/${job}`))return Response.json(malformed ? payload : {data:{id:job,kind:'video',model:model.id,state:'queued'}});
    if(path.endsWith(`/tasks/${job}/diagnostics`))return Response.json({error:{message:'Diagnostics unavailable'}},{status:503});
    return fallback(path,init);
  }));
  mount(true,`/generations?mode=video&job=${job}&key=${key}`);
  await screen.findByText('The server returned an invalid saved video. Reload status to try again.');
  expect(screen.queryByText('Waiting to generate')).toBeNull();
  malformed=false;
  await userEvent.setup().click(screen.getByRole('button',{name:'Reload status',exact:true}));
  await screen.findByText('Waiting to generate');
  expect(screen.queryByText('The server returned an invalid saved video. Reload status to try again.')).toBeNull();
  expect(calls.some(call=>call.path.endsWith('/submit') || call.path.endsWith('/estimate') || call.path.endsWith('/refresh'))).toBe(false);
});
it('restores original saved input after job-only navigation without submitting another generation',async()=>{
 const calls=mockFetch();const fallback=globalThis.fetch;
 const intent='55555555-5555-4555-8555-555555555555';
 const saved={id:intent,revision:1,created_at_ms:'1700000000000',expires_at_ms:'1800000000000',content_state:'retained',key_id:key,model:model.id,request:videoRequest(model,'Original saved orange ball',initialControls(model)),submission_state:'dispatched',job:{id:job,model:model.id,status:'queued'}};
 vi.stubGlobal('fetch',vi.fn(async(path:string,init?:RequestInit)=>path.includes('/video/intents?')?Response.json({data:[saved],has_more:false,next_before:null}):path.endsWith('/video/intents/'+intent)?Response.json({data:saved}):fallback(path,init)));
 mount(true,`/generations?mode=video&job=${job}&key=${key}`);
 await screen.findByRole('heading',{name:'Video · Original saved orange ball'});
 expect((screen.getByLabelText('Prompt') as HTMLTextAreaElement).value).toBe('');
 expect(screen.getByText('Original saved orange ball')).toBeTruthy();
 expect((screen.getByLabelText('Prompt') as HTMLTextAreaElement).disabled).toBe(false);
 expect(calls.some(call=>call.path.endsWith('/submit') || call.path.endsWith('/estimate'))).toBe(false);
});
it('keeps job-only lookup failure visible and restores the input after explicit reload',async()=>{
 const calls=mockFetch();const fallback=globalThis.fetch;let unavailable=true;
 const intent='55555555-5555-4555-8555-555555555555';
 const saved={id:intent,revision:1,created_at_ms:'1700000000000',expires_at_ms:'1800000000000',content_state:'retained',key_id:key,model:model.id,request:videoRequest(model,'Recovered original input',initialControls(model)),submission_state:'dispatched',job:{id:job,model:model.id,status:'queued'}};
 vi.stubGlobal('fetch',vi.fn(async(path:string,init?:RequestInit)=>path.includes('/video/intents?')?(unavailable?Response.json({error:{message:'Saved input temporarily unavailable'}},{status:503}):Response.json({data:[saved],has_more:false,next_before:null})):path.endsWith('/video/intents/'+intent)?Response.json({data:saved}):fallback(path,init)));
 mount(true,`/generations?mode=video&job=${job}&key=${key}`);
 await screen.findByText('Saved input temporarily unavailable');
 expect(screen.queryByRole('heading',{name:'Video · Recovered original input'})).toBeNull();
 unavailable=false;await userEvent.setup().click(screen.getByRole('button',{name:'Reload',exact:true}));
 await screen.findByRole('heading',{name:'Video · Recovered original input'});
 expect(screen.queryByText('Saved input temporarily unavailable')).toBeNull();
 expect(calls.some(call=>call.path.endsWith('/submit') || call.path.endsWith('/estimate'))).toBe(false);
});
it('requires a current estimate, invalidates it when input changes and submits once with defaults',async()=>{
  const calls=mockFetch();mount();const user=userEvent.setup();
  await screen.findByRole('button',{name:'Video model'});
  await user.type(screen.getByLabelText('Prompt'),'A mountain');
  await user.click(screen.getByRole('button',{name:'Additional settings'}));
  await user.clear(screen.getByLabelText('Duration (seconds)'));await user.type(screen.getByLabelText('Duration (seconds)'),'7');
  await user.click(screen.getByRole('button',{name:'Additional settings'}));
  expect(screen.getByRole('button',{name:'Generate video'})).toBeTruthy();
  await user.click(screen.getByRole('button',{name:'Estimate',exact:true}));
  await screen.findByText('Estimated ¥1.00');
  await user.type(screen.getByLabelText('Prompt'),' sunrise');
  expect(screen.getByRole('button',{name:'Generate video'})).toBeTruthy();
  await user.click(screen.getByRole('button',{name:'Estimate',exact:true}));
  await screen.findByText('Estimated ¥1.00');
  await user.dblClick(screen.getByRole('button',{name:'Generate video'}));
  await screen.findByText('Queued');
  await user.click(screen.getByRole('button',{name:'Video details'}));
  await user.click(screen.getByRole('button',{name:'Reload status'}));
  await waitFor(()=>expect(calls.filter(call=>call.path.endsWith('/models')).length).toBeGreaterThan(1));
  await user.click(screen.getByRole('button',{name:'Additional settings'}));
  expect((screen.getByLabelText('Duration (seconds)') as HTMLInputElement).value).toBe('7');
  const submits=calls.filter(call=>call.path.endsWith('/submit') || call.path.endsWith('/jobs'));
  expect(submits).toHaveLength(1);
  expect(submits[0].body).toEqual({expected_revision:1});
  const saves=calls.filter(call=>call.path.includes('/video/intents/') && (call.body as {request?:unknown})?.request);
  expect(saves).toHaveLength(1);
  expect(saves[0].body).toMatchObject({key_id:key,request:{model:model.id,duration:7,frames_per_second:24,content:[{type:'text',text:'A mountain sunrise'}]}});
  expect(document.body.textContent).not.toContain(job);
  expect(document.body.textContent).not.toContain(key);
});
it('generates from Enter with the same one-click path',async()=>{
  const calls=mockFetch();mount();const user=userEvent.setup();
  await screen.findByRole('button',{name:'Video model'});
  await user.type(screen.getByLabelText('Prompt'),'A mountain');
  await user.keyboard('{Enter}');
  await screen.findByText('Queued');
  expect(calls.filter(call=>call.path.endsWith('/submit') || call.path.endsWith('/jobs'))).toHaveLength(1);
});
it('estimates in the background after the prompt settles',async()=>{
  const calls=mockFetch();mount();const user=userEvent.setup();
  await screen.findByRole('button',{name:'Video model'});
  await user.type(screen.getByLabelText('Prompt'),'A mountain');
  expect(await screen.findByText('Estimated ¥1.00')).toBeTruthy();
  expect(calls.filter(call=>call.path.endsWith('/estimate'))).toHaveLength(1);
  expect(calls.filter(call=>call.path.endsWith('/submit') || call.path.endsWith('/jobs'))).toHaveLength(0);
});
it('generates from the first primary click by estimating and then submitting once',async()=>{
  const calls=mockFetch();mount();const user=userEvent.setup();
  await screen.findByRole('button',{name:'Video model'});
  await user.type(screen.getByLabelText('Prompt'),'A mountain');
  expect(screen.queryByRole('button',{name:'Save request'})).toBeNull();
  await user.click(screen.getByRole('button',{name:'Generate video'}));
  await screen.findByText('Queued');
  expect(calls.filter(call=>call.path.endsWith('/estimate'))).toHaveLength(1);
  expect(calls.filter(call=>call.path.endsWith('/submit') || call.path.endsWith('/jobs'))).toHaveLength(1);
});
it.each([
  ['cannot be loaded','load',503],
  ['changes in another tab','save',409],
  ['cannot be saved','save',503],
] as const)('keeps the Video composer usable when the saved draft %s and still dispatches one generation',async(_case,mode,status)=>{
  const calls=mockFetch();const delegate=globalThis.fetch;
  let draftWrites=0;
  vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const path=String(input);
    if(path.endsWith('/video/draft')){
      if(mode==='load')return Response.json({error:{message:'Draft read unavailable'}},{status});
      if(init?.method==='PUT'){draftWrites+=1;return Response.json({error:{message:'Draft write unavailable'}},{status});}
    }
    return delegate(input,init);
  }));
  mount();const user=userEvent.setup();
  const prompt=await screen.findByLabelText('Prompt');
  await waitFor(()=>expect(prompt.hasAttribute('disabled')).toBe(false));
  await screen.findByRole('button',{name:'Video model'});
  if(mode==='load')expect(await screen.findByText(/Could not load your saved Video draft/)).toBeTruthy();
  await user.type(prompt,'A mountain');
  if(mode==='save'){
    expect(await screen.findByText(status===409?/changed in another tab/:/Could not confirm your saved Video draft/)).toBeTruthy();
    expect(draftWrites).toBeGreaterThan(0);
    // The failed write must not lock the composer or discard later edits.
    await user.type(prompt,' sunrise');
    expect((prompt as HTMLTextAreaElement).value).toBe('A mountain sunrise');
    expect(prompt.hasAttribute('disabled')).toBe(false);
  }
  expect(screen.getByRole('button',{name:'Generate video'}).hasAttribute('disabled')).toBe(false);
  await user.click(screen.getByRole('button',{name:'Generate video'}));
  await screen.findByText('Queued');
  expect(calls.filter(call=>call.path.endsWith('/submit') || call.path.endsWith('/jobs'))).toHaveLength(1);
});
it('loads keys and models while the saved Video draft is slow and dispatches once',async()=>{
  const calls=mockFetch();const delegate=globalThis.fetch;let draftStarted=false;
  let releaseDraft!:(response:Response)=>void;
  const pendingDraft=new Promise<Response>(resolve=>{releaseDraft=resolve;});
  vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    if(String(input).endsWith('/video/draft') && (init?.method??'GET')==='GET'){draftStarted=true;return pendingDraft;}
    return delegate(input,init);
  }));
  mount();const user=userEvent.setup();
  const prompt=await screen.findByLabelText('Prompt');
  await waitFor(()=>expect(draftStarted).toBe(true));
  // Key and catalog bootstrap no longer waits for the saved draft.
  await waitFor(()=>expect(calls.some(call=>call.path.endsWith('/keys'))).toBe(true));
  expect(prompt.hasAttribute('disabled')).toBe(false);
  await screen.findByRole('button',{name:'Video model'});
  expect(calls.some(call=>call.path.endsWith('/models'))).toBe(true);
  await user.type(prompt,'A mountain');
  await user.click(screen.getByRole('button',{name:'Generate video'}));
  await screen.findByText('Queued');
  expect(calls.filter(call=>call.path.endsWith('/submit') || call.path.endsWith('/jobs'))).toHaveLength(1);
  // A late read after dispatch cannot rewrite the submitted composer or resubmit.
  await act(async()=>{releaseDraft(Response.json({data:{revision:1,content_state:'retained',expires_at_ms:'1800000000000',payload:{keyId:key,sessionId:null,model:model.id,prompt:'Saved draft prompt',controls:{duration:9},references:[]}}}));await pendingDraft;});
  expect(calls.filter(call=>call.path.endsWith('/submit') || call.path.endsWith('/jobs'))).toHaveLength(1);
  expect(screen.queryByText('Saved draft prompt')).toBeNull();
  expect((screen.getByLabelText('Prompt') as HTMLTextAreaElement).value).toBe('');
});
it('keeps a typed prompt and explicitly chosen model when a slow draft restore arrives',async()=>{
  const calls=mockFetch();const delegate=globalThis.fetch;
  const otherModel:VideoModel={...model,id:'Other video model'};
  let releaseDraft!:(response:Response)=>void;
  const pendingDraft=new Promise<Response>(resolve=>{releaseDraft=resolve;});
  vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    if(String(input).endsWith('/video/draft') && (init?.method??'GET')==='GET')return pendingDraft;
    if(String(input).endsWith('/models'))return Response.json({object:'list',data:[model,otherModel]});
    return delegate(input,init);
  }));
  mount();const user=userEvent.setup();
  const prompt=await screen.findByLabelText('Prompt');
  await user.type(prompt,'Typed before the draft settled');
  await user.click(await screen.findByRole('button',{name:'Video model'}));
  await user.click(await screen.findByRole('menuitemradio',{name:'Other video model'}));
  expect(screen.getByRole('button',{name:'Video model'}).textContent).toContain('Other video model');
  await act(async()=>{releaseDraft(Response.json({data:{revision:1,content_state:'retained',expires_at_ms:'1800000000000',payload:{keyId:key,sessionId:null,model:model.id,prompt:'Saved draft prompt',controls:{duration:9},references:[]}}}));await pendingDraft;});
  expect((screen.getByLabelText('Prompt') as HTMLTextAreaElement).value).toBe('Typed before the draft settled');
  expect(screen.getByRole('button',{name:'Video model'}).textContent).toContain('Other video model');
  // The saved controls belong to the saved model and must not replace the chosen one.
  await user.click(screen.getByRole('button',{name:'Additional settings'}));
  expect((screen.getByLabelText('Duration (seconds)') as HTMLInputElement).value).toBe('5');
  expect(calls.some(call=>call.path.endsWith('/submit') || call.path.endsWith('/jobs'))).toBe(false);
});
it('restores a normal saved Video draft that arrives after the catalog loads',async()=>{
  mockFetch();const delegate=globalThis.fetch;
  const otherModel:VideoModel={...model,id:'Other video model'};
  let releaseDraft!:(response:Response)=>void;
  const pendingDraft=new Promise<Response>(resolve=>{releaseDraft=resolve;});
  vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    if(String(input).endsWith('/video/draft') && (init?.method??'GET')==='GET')return pendingDraft;
    if(String(input).endsWith('/models'))return Response.json({object:'list',data:[model,otherModel]});
    return delegate(input,init);
  }));
  mount();const user=userEvent.setup();
  await screen.findByRole('button',{name:'Video model'});
  expect(screen.getByRole('button',{name:'Video model'}).textContent).toContain(model.id);
  await act(async()=>{releaseDraft(Response.json({data:{revision:1,content_state:'retained',expires_at_ms:'1800000000000',payload:{keyId:key,sessionId:null,model:'Other video model',prompt:'Restored draft prompt',controls:{duration:9},references:[]}}}));await pendingDraft;});
  expect(((await screen.findByLabelText('Prompt')) as HTMLTextAreaElement).value).toBe('Restored draft prompt');
  expect(screen.getByRole('button',{name:'Video model'}).textContent).toContain('Other video model');
  await user.click(screen.getByRole('button',{name:'Additional settings'}));
  expect((screen.getByLabelText('Duration (seconds)') as HTMLInputElement).value).toBe('9');
});
it('autosaves edits typed while a slow saved Video draft read was pending',async()=>{
  const calls=mockFetch();const delegate=globalThis.fetch;
  let draftStarted=false;
  let releaseDraft!:(response:Response)=>void;
  const pendingDraft=new Promise<Response>(resolve=>{releaseDraft=resolve;});
  vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    if(String(input).endsWith('/video/draft') && (init?.method??'GET')==='GET'){draftStarted=true;return pendingDraft;}
    return delegate(input,init);
  }));
  mount();const user=userEvent.setup();
  await screen.findByRole('button',{name:'Video model'});
  await user.type(screen.getByLabelText('Prompt'),'Kept while loading');
  await waitFor(()=>expect(draftStarted).toBe(true));
  await act(async()=>{releaseDraft(Response.json({data:{revision:0,content_state:'empty',expires_at_ms:null,payload:null}}));await pendingDraft;});
  await waitFor(()=>expect(calls.some(call=>call.path.endsWith('/video/draft') && (call.body as {payload?:{prompt?:string}}|null)?.payload?.prompt==='Kept while loading')).toBe(true));
  expect((screen.getByLabelText('Prompt') as HTMLTextAreaElement).value).toBe('Kept while loading');
  expect((screen.getByLabelText('Prompt') as HTMLTextAreaElement).hasAttribute('disabled')).toBe(false);
});
it('does not automatically retry a lost paid submission response',async()=>{
  const calls=mockFetch(async()=>{throw new TypeError('Network unavailable');});mount();const user=userEvent.setup();
  await screen.findByRole('button',{name:'Video model'});await user.type(screen.getByLabelText('Prompt'),'A mountain');
  await user.click(screen.getByRole('button',{name:'Estimate',exact:true}));await screen.findByText('Estimated ¥1.00');
  await user.click(screen.getByRole('button',{name:'Generate video'}));
  await screen.findByText('Network unavailable');
  await waitFor(()=>expect(calls.some(call=>call.path.includes('/video/intents/') && call.body===null)).toBe(true));
  expect(calls.filter(call=>call.path.endsWith('/submit') || call.path.endsWith('/jobs'))).toHaveLength(1);
});
it('shows a credential rate refusal without retrying or presenting a queued video',async()=>{
  const message='The selected upstream route has reached its rolling 60-second request limit; retry after 60 seconds';
  const calls=mockFetch(async()=>Response.json({error:{type:'upstream_request_rate_exceeded',message}},{status:429,headers:{'retry-after':'60'}}));
  mount();const user=userEvent.setup();
  await screen.findByRole('button',{name:'Video model'});
  await user.type(screen.getByLabelText('Prompt'),'A mountain');
  await user.click(screen.getByRole('button',{name:'Estimate',exact:true}));
  await screen.findByText('Estimated ¥1.00');
  await user.click(screen.getByRole('button',{name:'Generate video'}));
  await screen.findByText(message);
  await waitFor(()=>expect(calls.some(call=>call.path.includes('/video/intents/') && call.body===null)).toBe(true));
  expect(calls.filter(call=>call.path.endsWith('/submit') || call.path.endsWith('/jobs'))).toHaveLength(1);
  expect(screen.queryByText('Queued')).toBeNull();
  expect(screen.queryByText('Succeeded')).toBeNull();
  expect(calls.some(call=>call.path.includes(`/jobs/${job}`))).toBe(false);
});
it('reader can estimate but cannot submit',async()=>{
  const calls=mockFetch();mount(false);const user=userEvent.setup();
  await screen.findByRole('button',{name:'Video model'});await user.type(screen.getByLabelText('Prompt'),'A mountain');
  await user.click(screen.getByRole('button',{name:'Estimate',exact:true}));await screen.findByText('Estimated ¥1.00');
  expect(screen.getByRole('button',{name:'Generate video'}).hasAttribute('disabled')).toBe(true);
  expect(calls.filter(call=>call.path.endsWith('/submit') || call.path.endsWith('/jobs'))).toHaveLength(0);
  await waitFor(()=>expect(screen.getByText(/Read access can estimate/)).toBeDefined());
});
it.each(['77777777-7777-4777-8777-777777777777','input-1001'])('restores immutable input and original job from %s without dispatch',async(reference)=>{
  const calls=mockFetch();const delegate=globalThis.fetch;
  const intent='77777777-7777-4777-8777-777777777777';
  vi.stubGlobal('fetch',vi.fn<typeof fetch>(async(input,init)=>{
    const path=String(input);
    if(path.endsWith(`/video/intents/${intent}`)||path.endsWith(`/video/intents/input-1001`)){
      calls.push({path,body:init?.body ? JSON.parse(String(init.body)):null});
      return Response.json({data:{id:intent,reference:'input-1001',session_binding:{session_id:'88888888-8888-4888-8888-888888888888',turn_id:'99999999-9999-4999-8999-999999999999'},revision:1,expires_at_ms:'1800000000000',content_state:'retained',original_key_id:key,key_id:key,model:model.id,funding_mode:'customer',request:{model:model.id,content:[{type:'text',text:'Saved landscape'}],duration:7,resolution:'720p',ratio:'16:9',frames_per_second:24},submission_state:'dispatched',job:{id:job,object:'video.job',model:model.id,status:'queued'}}});
    }
    return delegate(input,init);
  }));
  function BookmarkProbe(){const location=useLocation();return <output data-testid="input-bookmark">{location.search+location.hash}</output>;}
  const context={token:'member',workspace,workspaces:[workspace],session:{permissions:{write:true}},selectWorkspace:vi.fn()} as unknown as DashboardContext;
  render(<MemoryRouter initialEntries={[`/generations?mode=video&intent=${reference}&session=88888888-8888-4888-8888-888888888888&turn=99999999-9999-4999-8999-999999999999&keep=1#saved`]}><SidebarProvider><BookmarkProbe/><VideoView context={context}/></SidebarProvider></MemoryRouter>);
  await screen.findByText('Queued');
  await waitFor(()=>{const address=screen.getByTestId('input-bookmark').textContent;expect(address).toContain('intent=input-1001');expect(address).toContain('keep=1');expect(address).toContain('#saved');expect(address).not.toContain('session=');expect(address).not.toContain('turn=');});
  expect(screen.getByRole('heading',{level:1,name:'Video · Saved landscape'})).toBeTruthy();
  expect((screen.getByLabelText('Prompt') as HTMLTextAreaElement).value).toBe('');
 expect(screen.getByText('Saved landscape')).toBeTruthy();
  expect(screen.getByLabelText('Prompt').hasAttribute('disabled')).toBe(false);
  expect(screen.getByRole('button',{name:'Video API key'}).hasAttribute('disabled')).toBe(false);
  expect(calls.some(call=>call.path.endsWith('/submit') || call.path.endsWith('/jobs'))).toBe(false);
  expect(calls.some(call=>call.body!==null)).toBe(false);
  expect(document.body.textContent).not.toContain(intent);
});
it('keeps a missing-intent error visible through Strict Mode restoration and catalog reload',async()=>{
  const calls=mockFetch();
  const context={token:'member',workspace,workspaces:[workspace],session:{permissions:{write:true}},selectWorkspace:vi.fn()} as unknown as DashboardContext;
  render(<StrictMode><MemoryRouter initialEntries={[`/generations?mode=video&intent=77777777-7777-4777-8777-777777777777&key=${key}`]}><SidebarProvider><VideoView context={context}/></SidebarProvider></MemoryRouter></StrictMode>);
  await screen.findByText('Intent unavailable');
  await waitFor(()=>expect(calls.some(call=>call.path.endsWith('/models'))).toBe(true));
  await userEvent.setup().click(screen.getByRole('button',{name:'Reload',exact:true}));
  await screen.findByText('Intent unavailable');
  expect(screen.queryByText(/already in progress/)).toBeNull();
  expect(calls.some(call=>call.path.endsWith('/submit') || call.path.endsWith('/jobs'))).toBe(false);
});
it('validates UTF-8, integer bounds and actual output pairs rather than assumed combinations',()=>{
  const controls=initialControls(model);
  expect(()=>videoRequest(model,'中'.repeat(400),controls)).toThrow(/text limit/);
  expect(()=>videoRequest(model,'Prompt',{...controls,duration:'1.5'})).toThrow(/integer/);
  expect(()=>videoRequest(model,'Prompt',{...controls,resolution:'1080p'})).toThrow(/together/);
  expect(videoRequest(model,'Prompt',{...controls,resolution:'1080p',ratio:'1:1'})).toMatchObject({resolution:'1080p',ratio:'1:1'});
});

it('renders declared ratio choices when a personal model has no output estimator',async()=>{
  const calls=mockFetch(undefined,undefined,{...model,mode:'owner_funded',output:null});
  mount();
  const user=userEvent.setup();
  await screen.findByText(model.id);
  await user.click(screen.getByRole('button',{name:'Additional settings'}));
  await user.click(screen.getByRole('button',{name:'Aspect ratio',exact:true}));
  expect(await screen.findByRole('menuitemradio',{name:'1:1',exact:true})).toBeTruthy();
  await user.click(screen.getByRole('menuitemradio',{name:'1:1',exact:true}));
  expect(screen.getByRole('button',{name:'Aspect ratio',exact:true}).textContent).toContain('1:1');
  expect(calls.some(call=>call.path.endsWith('/estimate')||call.path.endsWith('/submit'))).toBe(false);
});

it('preserves discovered controls without inventing output pairs for personal models',()=>{
  const personal:VideoModel={...model,mode:'owner_funded',output:null};
  expect(videoRequest(personal,'Prompt',{...initialControls(personal),resolution:'1080p',ratio:'16:9'})).toMatchObject({resolution:'1080p',ratio:'16:9'});
  expect(()=>videoRequest(personal,'Prompt',{...initialControls(personal),resolution:'unsupported'})).toThrow(/supported/);
});

it('validates discovered reference requirements before constructing estimates or submissions',()=>{
  const imageModel:VideoModel={...model,input_types:['text','image_url'],requires_image:true,maximum_content_items:3,
    image_url:{maximum_items:2,maximum_bytes:128,https:false,data_mime_types:['image/png'],roles:['first_frame','last_frame'],role_required:true,requires_text:true,maximum_width:32,maximum_height:32,maximum_decoded_bytes:4096}};
  const controls=initialControls(imageModel);
  const image={url:'data:image/png;base64,iVBORw==',role:'first_frame'};
  expect(()=>videoRequest(imageModel,'Prompt',controls)).toThrow(/requires a reference/);
  expect(()=>videoRequest(model,'Prompt',controls,[image])).toThrow(/does not support/);
  expect(()=>videoRequest(imageModel,'Prompt',controls,[{...image,url:'https://example.com/image.png'}])).toThrow(/supported PNG/);
  expect(()=>videoRequest(imageModel,'Prompt',controls,[{...image,url:'data:image/jpeg;base64,/9j/2Q=='}])).toThrow(/supported PNG/);
  expect(()=>videoRequest(imageModel,'Prompt',controls,[{url:image.url}])).toThrow(/role/);
  expect(()=>videoRequest(imageModel,'Prompt',controls,[{...image,role:'unsupported'}])).toThrow(/role/);
  expect(()=>videoRequest(imageModel,'Prompt',controls,[image,image,image])).toThrow(/Too many/);
  expect(()=>videoRequest(imageModel,'Prompt',controls,[{...image,url:`data:image/png;base64,${'AAAA'.repeat(40)}`}])).toThrow(/size limit/);
  expect(videoRequest(imageModel,'Prompt',controls,[image,{...image,role:'last_frame'}]).content).toEqual([
    {type:'text',text:'Prompt'}, {type:'image_url',image_url:{url:image.url},role:'first_frame'},
    {type:'image_url',image_url:{url:image.url},role:'last_frame'}]);
});

it('requires a reference role before estimation and invalidates the estimate when an image is removed',async()=>{
  const imageModel:VideoModel={...model,input_types:['text','image_url'],requires_image:true,maximum_content_items:2,
    image_url:{maximum_items:1,maximum_bytes:512,https:false,data_mime_types:['image/png'],roles:['first_frame'],role_required:true,requires_text:true,maximum_width:32,maximum_height:32,maximum_decoded_bytes:4096}};
  const calls=mockFetch(undefined,undefined,imageModel);mount();const user=userEvent.setup();
  await screen.findByRole('button',{name:'Video model'});
  await user.type(screen.getByLabelText('Prompt'),'A mountain');
  expect(screen.getByRole('button',{name:'Estimate',exact:true}).hasAttribute('disabled')).toBe(true);
  await user.upload(screen.getByLabelText('Upload video reference images'),new File(['fixture-image'],'frame.png',{type:'image/png'}));
  await screen.findByText('frame.png');
  expect(screen.getByRole('button',{name:'Estimate',exact:true}).hasAttribute('disabled')).toBe(true);
  await user.click(screen.getByRole('button',{name:'Role for frame.png'}));
  await user.click(screen.getByRole('menuitemradio',{name:'first frame'}));
  await user.click(screen.getByRole('button',{name:'Estimate',exact:true}));
  await screen.findByText('Estimated ¥1.00');
  expect(calls.find(call=>call.path.endsWith('/estimate'))?.body).toMatchObject({content:[{type:'text',text:'A mountain'},{type:'image_url',role:'first_frame'}]});
  await user.click(screen.getByRole('button',{name:'Remove frame.png'}));
  expect(screen.queryByText('Estimated ¥1.00')).toBeNull();
  expect(screen.getByRole('button',{name:'Estimate',exact:true}).hasAttribute('disabled')).toBe(true);
});

it('restores the result pane when opening a saved job URL',async()=>{
 mockFetch();mount(true,`/chat?mode=video&job=${job}`);
 await screen.findByText('Queued');
 expect(screen.getByRole('article',{name:'Video result'})).toBeTruthy();
 expect(screen.queryByRole('tab',{name:'Result',exact:true})).toBeNull();
});

it('recovers a failed saved-job read without submitting another generation',async()=>{
  let statusReads=0;
  const reads:string[]=[];
  vi.stubGlobal('fetch',vi.fn(async(path:string,init?:RequestInit)=>{
    reads.push(path);
    if(path.endsWith('/video/draft'))return Response.json({data:{revision:0,content_state:'empty',expires_at_ms:null,payload:null}});
    if(path.endsWith('/video/intents') || path.includes('/video/intents?'))return Response.json({data:[],has_more:false,next_before:null});
    if(path.endsWith('/chats'))return Response.json({data:[]});
    if(path.endsWith('/keys'))return Response.json({data:[{id:key,name:'Review key',allowed_models:['*'],revoked:false,expired:false}]});
    if(path.includes('/v1/media/capabilities'))return Response.json({modules:[]});
    if(path.endsWith('/models'))return Response.json({object:'list',data:[model]});
    if(path.includes('/tasks?'))return Response.json({data:[],has_more:false,next_cursor:null});
    if(path.endsWith(`/tasks/${job}/diagnostics`))return Response.json({billing:{mode:'customer',charge_nanos:null,reserved_nanos:'2000000000',currency:'CNY'},timings:{data:[],has_more:false}});
    if(path.endsWith(`/tasks/${job}`)){
      expect(init?.method ?? 'GET').toBe('GET');
      if(++statusReads===1)return Response.json({error:{message:'Saved status temporarily unavailable'}},{status:503});
      return Response.json({data:{id:job,kind:'video',model:model.id,state:'queued',created_at:'1970-01-01T00:00:00Z',updated_at:'1970-01-01T00:00:00Z',artifacts:[]}});
    }
    throw new Error(`Unexpected request: ${path}`);
  }));
  mount(true,`/generations?mode=video&key=${key}&job=${job}`);
  await screen.findByText('Saved status temporarily unavailable');
  await userEvent.setup().click(screen.getByRole('button',{name:'Reload status',exact:true}));
  await screen.findByText('Queued');
  expect(statusReads).toBe(2);
  expect(screen.queryByText('Saved status temporarily unavailable')).toBeNull();
  expect(reads.some(path=>path.endsWith('/jobs'))).toBe(false);
});

it.each([key,'old-key'])('restores saved history with a revoked key reference %s',async(reference)=>{
  const calls:string[]=[];
  vi.stubGlobal('fetch',vi.fn(async(path:string)=>{
    calls.push(path);
    if(path.endsWith('/video/draft'))return Response.json({data:{revision:0,content_state:'empty',expires_at_ms:null,payload:null}});
    if(path.endsWith('/video/intents') || path.includes('/video/intents?'))return Response.json({data:[],has_more:false,next_before:null});
    if(path.endsWith('/chats'))return Response.json({data:[]});
    if(path.includes('/tasks?'))return Response.json({data:[],has_more:false,next_cursor:null});
    if(path.endsWith(`/tasks/${job}/diagnostics`))return Response.json({billing:{mode:'customer',charge_nanos:null,reserved_nanos:'2000000000',currency:'CNY'},timings:{data:[],has_more:false}});
    if(path.endsWith(`/tasks/${job}`))return Response.json({data:{id:job,kind:'video',model:model.id,state:'queued',created_at:'1970-01-01T00:00:00Z',updated_at:'1970-01-01T00:00:00Z',artifacts:[]}});
    if(path.endsWith('/keys'))return Response.json({data:[{id:key,slug:'old-key',name:'Old key',allowed_models:['*'],revoked:true,expired:false}]});
    throw new Error(`No video API should be read without an active key: ${path}`);
  }));
  function Route(){return <output aria-label="Current route">{useLocation().search}</output>;}
  const context={token:'member',workspace,workspaces:[workspace],session:{permissions:{write:true}},selectWorkspace:vi.fn()} as unknown as DashboardContext;
  render(<MemoryRouter initialEntries={[`/generations?mode=video&key=${reference}&job=${job}`]}><SidebarProvider><Route/><VideoView context={context}/></SidebarProvider></MemoryRouter>);
  await waitFor(()=>expect(new URLSearchParams(screen.getByLabelText('Current route').textContent??'').get('key')).toBe('old-key'));
  await screen.findByText(/Saved history is available\. The original API key is revoked/);
  expect(screen.queryByText('Loading saved video…')).toBeNull();
  expect(calls.some(path=>path.includes('/v1/video/'))).toBe(false);
  expect(screen.getByRole('link',{name:'Manage API keys'})).toBeTruthy();
});

it('connects saved lifecycle observations to the result waterfall without new generation',async()=>{
 const calls=mockFetch(undefined,{source:'gateway_observation',submitted_unix_ms:1000,observations:[{status:'running',observed_unix_ms:3000},{status:'succeeded',observed_unix_ms:9000}],conflicting_terminal:false});
 mount(true,`/chat?mode=video&job=${job}`);
 await screen.findByText('Queued');
 await userEvent.click(screen.getByRole('button',{name:'Video details'}));
 await screen.findByLabelText('Running observed: 6.0 s');
 expect(screen.getByText('Observed completion: 8.0 s')).toBeDefined();
 expect(calls.filter(call=>call.path.endsWith('/submit') || call.path.endsWith('/jobs'))).toHaveLength(0);
});

it('retries a failed API-key read before loading models without submitting a video',async()=>{
 let keyReads=0;
 const calls:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(path:string)=>{
   calls.push(path);
   if(path.endsWith('/video/draft'))return Response.json({data:{revision:0,content_state:'empty',expires_at_ms:null,payload:null}});
   if(path.includes('/sessions?'))return Response.json({data:[],has_more:false,next_before:null});
   if(path.endsWith('/video/intents') || path.includes('/video/intents?'))return Response.json({data:[],has_more:false,next_before:null});
   if(path.endsWith('/chats'))return Response.json({data:[]});
   if(path.includes('/tasks?'))return Response.json({data:[],has_more:false,next_cursor:null});
   if(path.includes('/v1/media/capabilities'))return Response.json({modules:[]});
   if(path.endsWith('/keys')) {
     if(++keyReads === 1)return Response.json({error:{message:'API keys temporarily unavailable'}},{status:503});
     return Response.json({data:[{id:key,name:'Review key',allowed_models:['*'],revoked:false,expired:false}]});
   }
   if(path.endsWith('/models'))return Response.json({object:'list',data:[model]});
   if(path.includes('/jobs?'))return Response.json({data:[],has_more:false,next_before:null});
   throw new Error(`Unexpected request: ${path}`);
 }));
 mount();const user=userEvent.setup();
 expect((await screen.findByRole('alert')).textContent).toContain('API keys temporarily unavailable');
 expect(screen.queryByText('No video model available')).toBeNull();
 expect(calls.some(path=>path.endsWith('/models'))).toBe(false);
 await user.click(screen.getByRole('button',{name:'Reload',exact:true}));
 await screen.findByRole('button',{name:'Video model',exact:true});
 expect(keyReads).toBe(2);
 expect(screen.queryByRole('alert')).toBeNull();
 expect(calls.filter(path=>path.endsWith('/jobs'))).toHaveLength(0);
});

it.each(['accepted','uncertain'])('ignores a late %s submission after leaving and returning to its workspace',async(outcome)=>{
  let finish!: (response:Response)=>void;
  let fail!: (error:Error)=>void;
  const pending = new Promise<Response>((resolve,reject)=>{finish=resolve;fail=reject;});
  const calls=mockFetch(()=>pending);
  const other={...workspace,id:'55555555-5555-4555-8555-555555555555',name:'Other workspace'};
  const context={token:'member',workspace,workspaces:[workspace,other],session:{permissions:{write:true}},selectWorkspace:vi.fn()} as unknown as DashboardContext;
  const tree=(scope:typeof workspace)=><MemoryRouter><SidebarProvider><VideoView context={{...context,workspace:scope}}/></SidebarProvider></MemoryRouter>;
  const view=render(tree(workspace));const user=userEvent.setup();
  await screen.findByRole('button',{name:'Video model'});
  await user.type(screen.getByLabelText('Prompt'),'Original request');
  await user.click(screen.getByRole('button',{name:'Estimate',exact:true}));await screen.findByText('Estimated ¥1.00');
  await user.click(screen.getByRole('button',{name:'Generate video'}));
  await waitFor(()=>expect(calls.filter(call=>call.path.endsWith('/submit') || call.path.endsWith('/jobs'))).toHaveLength(1));
  view.rerender(tree(other));
  await waitFor(()=>expect(calls.some(call=>call.path.includes(other.id)&&call.path.endsWith('/keys'))).toBe(true));
  view.rerender(tree(workspace));
  await screen.findByRole('button',{name:'Video model'});
  await act(async()=>{if(outcome==='accepted')finish(Response.json({id:job,object:'video.job',model:model.id,status:'queued'}));else fail(new TypeError('Late original workspace error'));await pending.catch(()=>{});});
  expect(screen.queryByText('Queued')).toBeNull();
  expect(screen.queryByText('Late original workspace error')).toBeNull();
  expect(screen.queryByText(/Submission may have reached/)).toBeNull();
  expect(calls.filter(call=>call.path.endsWith('/submit') || call.path.endsWith('/jobs'))).toHaveLength(1);
  expect(calls.some(call=>call.path.includes(`/jobs/${job}`))).toBe(false);
  expect(screen.getByLabelText('Video conversation')).toBeTruthy();
});

it('keeps paginated history from an old workspace out of the current workspace',async()=>{
  const ordinaryFetch=mockFetch();
  const delegate=globalThis.fetch;
  let finish!: (response:Response)=>void;
  const pending=new Promise<Response>(resolve=>{finish=resolve;});
  const other={...workspace,id:'55555555-5555-4555-8555-555555555555',name:'Other workspace'};
  vi.stubGlobal('fetch',vi.fn<typeof fetch>(async(input,init)=>{
    const path=String(input);
    if(path.includes(workspace.id)&&path.includes('/tasks?')) {
      if(path.includes('cursor='))return pending;
      return Response.json({data:[],has_more:true,next_cursor:'2026-10-01T00:00:00Z'});
    }
    return delegate(input,init);
  }));
  const context={token:'member',workspace,workspaces:[workspace,other],session:{permissions:{write:true}},selectWorkspace:vi.fn()} as unknown as DashboardContext;
  const tree=(scope:typeof workspace)=><MemoryRouter><SidebarProvider><VideoView context={{...context,workspace:scope,workspaces:[scope]}}/></SidebarProvider></MemoryRouter>;
  const view=render(tree(workspace));const user=userEvent.setup();
  await user.click(await screen.findByRole('button',{name:'Load more sessions',exact:true}));
  view.rerender(tree(other));
  await waitFor(()=>expect(ordinaryFetch.some(call=>call.path.includes(other.id)&&call.path.endsWith('/keys'))).toBe(true));
  await act(async()=>{finish(Response.json({data:[{id:job,kind:'video',model:'Old workspace video',state:'queued',created_at:'2026-10-01T00:00:00Z',updated_at:'2026-10-01T00:00:00Z'}],has_more:true,next_cursor:'stale'}));await pending;});
  expect(screen.queryByText('Video · Old workspace video')).toBeNull();
  expect(screen.queryByRole('button',{name:'Load more sessions',exact:true})).toBeNull();
});

it('does not navigate from an unmounted Video workspace when its create response arrives',async()=>{
  let finish!: (response:Response)=>void;
  const pending=new Promise<Response>(resolve=>{finish=resolve;});mockFetch(()=>pending);
  const other={...workspace,id:'55555555-5555-4555-8555-555555555555',name:'Other workspace'};
  const context={token:'member',workspace,workspaces:[workspace,other],session:{permissions:{write:true}},selectWorkspace:vi.fn()} as unknown as DashboardContext;
  function LocationProbe(){return <output aria-label="Current route">{useLocation().search}</output>;}
  const tree=(scope:typeof workspace)=><MemoryRouter initialEntries={['/chat?mode=video']}><SidebarProvider><LocationProbe/><VideoView key={scope.id} context={{...context,workspace:scope}}/></SidebarProvider></MemoryRouter>;
  const view=render(tree(workspace));const user=userEvent.setup();
  await screen.findByRole('button',{name:'Video model'});await user.type(screen.getByLabelText('Prompt'),'Original request');
  await user.click(screen.getByRole('button',{name:'Estimate',exact:true}));await screen.findByText('Estimated ¥1.00');
  await user.click(screen.getByRole('button',{name:'Generate video'}));
  await waitFor(()=>{expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.some(([path])=>String(path).endsWith('/submit'))).toBe(true);expect(screen.getByLabelText('Current route').textContent).toContain('intent=');});
  const savedRoute=screen.getByLabelText('Current route').textContent;
  view.rerender(tree(other));await screen.findByText('Intent unavailable');
  await act(async()=>{finish(Response.json({id:job,object:'video.job',model:model.id,status:'queued'}));await pending;});
  expect(screen.getByLabelText('Current route').textContent).toBe(savedRoute);
  expect(screen.queryByText('Queued')).toBeNull();
});

it('keeps a late submission from replacing another intent in the same workspace',async()=>{
  let finish!:(response:Response)=>void;
  const pending=new Promise<Response>(resolve=>{finish=resolve;});
  const calls=mockFetch(()=>pending);
  const otherIntent='77777777-7777-4777-8777-777777777777';
  const context={token:'member',workspace,workspaces:[workspace],session:{permissions:{write:true}},selectWorkspace:vi.fn()} as unknown as DashboardContext;
  function RouteProbe(){const navigate=useNavigate();const location=useLocation();return <><button onClick={()=>navigate(`?mode=video&intent=${otherIntent}`)}>Open another intent</button><output aria-label="Current route">{location.search}</output></>;}
  render(<MemoryRouter><SidebarProvider><RouteProbe/><VideoView context={context}/></SidebarProvider></MemoryRouter>);
  const user=userEvent.setup();
  await screen.findByRole('button',{name:'Video model'});await user.type(screen.getByLabelText('Prompt'),'Original request');
  await user.click(screen.getByRole('button',{name:'Estimate',exact:true}));await screen.findByText('Estimated ¥1.00');
  await user.click(screen.getByRole('button',{name:'Generate video'}));
  await waitFor(()=>expect(calls.filter(call=>call.path.endsWith('/submit'))).toHaveLength(1));
  await user.click(screen.getByRole('button',{name:'Open another intent'}));
  await act(async()=>{finish(Response.json({id:job,object:'video.job',model:model.id,status:'queued'}));await pending;});
  expect(screen.getByLabelText('Current route').textContent).toBe(`?mode=video&intent=${otherIntent}`);
  expect(screen.queryByText('Queued')).toBeNull();
  expect(calls.some(call=>call.path.includes(`/jobs/${job}`))).toBe(false);
});

it('waits for the new workspace key list instead of querying it with the old key',async()=>{
  const other={...workspace,id:'55555555-5555-4555-8555-555555555555',name:'Other workspace'};
  const otherKey='66666666-6666-4666-8666-666666666666';
  let finish!:(response:Response)=>void;
  const requests:Array<{path:string;keyId:string|null}>=[];
  vi.stubGlobal('fetch',vi.fn(async(input:string,init?:RequestInit)=>{
    const headers=new Headers(init?.headers);
    requests.push({path:input,keyId:headers.get('x-niu-key-id')});
    if(input.endsWith('/video/draft'))return Response.json({data:{revision:0,content_state:'empty',expires_at_ms:null,payload:null}});
    if(input.endsWith('/video/intents') || input.includes('/video/intents?'))return Response.json({data:[],has_more:false,next_before:null});
    if(input.endsWith('/chats'))return Response.json({data:[]});
    if(input.includes('/tasks?'))return Response.json({data:[],has_more:false,next_cursor:null});
    if(input.includes('/v1/media/capabilities'))return Response.json({modules:[]});
    if(input.endsWith('/keys'))return input.includes(other.id) ? new Promise<Response>(resolve=>{finish=resolve;}) : Response.json({data:[{id:key,name:'Original key',allowed_models:['*'],revoked:false,expired:false}]});
    if(input.endsWith('/models'))return Response.json({data:[model]});
    if(input.includes('/jobs?'))return Response.json({data:[],has_more:false,next_before:null});
    throw new Error(`Unexpected request: ${input}`);
  }));
  const context={token:'member',workspace,workspaces:[workspace],session:{permissions:{write:true}}} as DashboardContext;
  const tree=(scope:typeof workspace)=><MemoryRouter><SidebarProvider><VideoView context={{...context,workspace:scope,workspaces:[scope]}}/></SidebarProvider></MemoryRouter>;
  const view=render(tree(workspace));await screen.findByRole('button',{name:'Video model'});
  const initialModelCalls=requests.filter(r=>r.path.endsWith('/models')).length;
  view.rerender(tree(other));await waitFor(()=>expect(finish).toBeTypeOf('function'));
  expect(requests.filter(r=>r.path.endsWith('/models'))).toHaveLength(initialModelCalls);
  expect(screen.queryByRole('button',{name:'Video model'})).toBeNull();
  await act(async()=>finish(Response.json({data:[{id:otherKey,name:'New workspace key',allowed_models:['*'],revoked:false,expired:false}]})));
  await screen.findByRole('button',{name:'Video model'});
  expect(screen.getByRole('button',{name:'Video API key'}).textContent).toContain('New workspace key');
  expect(requests.some(r=>r.path==='/v1/video/models'&&r.keyId===otherKey)).toBe(true);
});
it('restores the original job when reopening the same intent without dispatch',async()=>{
  const calls=mockFetch();const delegate=globalThis.fetch;
  const intent='77777777-7777-4777-8777-777777777777';
  vi.stubGlobal('fetch',vi.fn<typeof fetch>(async(input,init)=>{
    const path=String(input);
    if(path.endsWith(`/video/intents/${intent}`)){
      calls.push({path,body:init?.body ? JSON.parse(String(init.body)):null});
      return Response.json({data:{id:intent,revision:1,expires_at_ms:'1800000000000',content_state:'retained',original_key_id:key,key_id:key,model:model.id,funding_mode:'customer',session_binding:{session_id:'88888888-8888-4888-8888-888888888888',turn_id:'99999999-9999-4999-8999-999999999999'},request:{model:model.id,content:[{type:'text',text:'Saved landscape'}],duration:7,resolution:'720p',ratio:'16:9',frames_per_second:24},submission_state:'dispatched',job:{id:job,object:'video.job',model:model.id,status:'queued'}}});
    }
    return delegate(input,init);
  }));
  function Reopen(){const navigate=useNavigate();return <button onClick={()=>navigate(`?mode=video&intent=${intent}`)}>Reopen same intent</button>;}
  const context={token:'member',workspace,workspaces:[workspace],session:{permissions:{write:true}},selectWorkspace:vi.fn()} as unknown as DashboardContext;
  render(<MemoryRouter initialEntries={[`/generations?mode=video&intent=${intent}`]}><SidebarProvider><Reopen/><VideoView context={context}/></SidebarProvider></MemoryRouter>);
  await screen.findByText('Queued');
  expect(screen.getByRole('heading',{level:1,name:'Video · Saved landscape'})).toBeTruthy();
  expect((screen.getByLabelText('Prompt') as HTMLTextAreaElement).value).toBe('');
 expect(screen.getByText('Saved landscape')).toBeTruthy();
  expect(screen.getByLabelText('Prompt').hasAttribute('disabled')).toBe(false);
  expect(screen.getByRole('button',{name:'Video API key'}).hasAttribute('disabled')).toBe(false);
  expect(calls.some(call=>call.path.endsWith('/submit') || call.path.endsWith('/jobs'))).toBe(false);
  expect(calls.some(call=>call.body!==null)).toBe(false);
  await userEvent.click(screen.getByRole('button',{name:'Reopen same intent'}));
  await screen.findByText('Queued');
  expect(calls.some(call=>call.body!==null)).toBe(false);
});

it('keeps saved prompt in the conversation and submits a fresh draft with a new intent',async()=>{
  const calls=mockFetch();const delegate=globalThis.fetch;
  const intent='77777777-7777-4777-8777-777777777777';
  vi.stubGlobal('fetch',vi.fn(async(input,init)=>{
    if(String(input).endsWith(`/video/intents/${intent}`))return Response.json({data:{id:intent,revision:1,expires_at_ms:'1800000000000',content_state:'retained',key_id:key,model:model.id,session_binding:{session_id:'88888888-8888-4888-8888-888888888888',turn_id:'99999999-9999-4999-8999-999999999999'},request:{model:model.id,content:[{type:'text',text:'Original video scene'}],duration:5,resolution:'720p',ratio:'16:9'},submission_state:'dispatched',job:{id:job,object:'video.job',model:model.id,status:'succeeded'}}});
    return delegate(input,init);
  }));
  mount(true,`/generations?mode=video&intent=${intent}`);const user=userEvent.setup();
  await screen.findByText('Original video scene');
  await screen.findByLabelText('Prompt');
  await waitFor(()=>expect((screen.getByLabelText('Prompt') as HTMLTextAreaElement).disabled).toBe(false));
  expect((screen.getByLabelText('Prompt') as HTMLTextAreaElement).value).toBe('');
  expect(screen.queryByRole('tab',{name:'Input'})).toBeNull();
  await user.type(screen.getByLabelText('Prompt'),'A fresh sunrise scene');
  await user.click(screen.getByRole('button',{name:'Estimate',exact:true}));
  await screen.findByText('Estimated ¥1.00');
  expect(calls.find(call=>call.path.endsWith('/estimate'))?.body).toMatchObject({content:[{type:'text',text:'A fresh sunrise scene'}]});
  await user.click(screen.getByRole('button',{name:'Generate video'}));
  await screen.findByText('Queued');
  expect(calls.filter(call=>call.path.endsWith('/submit'))).toHaveLength(1);
  expect(calls.find(call=>call.path.endsWith('/submit'))!.path).not.toContain(intent);
  await waitFor(()=>expect((screen.getByLabelText('Prompt') as HTMLTextAreaElement).value).toBe(''));
  expect(screen.getByText('A fresh sunrise scene')).toBeTruthy();
});

it('places video API key in the header consistently with Chat',async()=>{
  mockFetch();mount();
  const keyPicker=await screen.findByRole('button',{name:'Video API key'});
  expect(keyPicker.closest('header')).toBeTruthy();
  expect(keyPicker.closest('form')).toBeNull();
  await userEvent.click(keyPicker);
  expect(await screen.findByRole('menuitemradio',{name:'Review key'})).toBeTruthy();
});

it('offers a recovery path when no video API key is available',async()=>{
  mockFetch();
  const delegate=globalThis.fetch;
  vi.stubGlobal('fetch',vi.fn(async(input,init)=>String(input).endsWith('/keys') ? Response.json({data:[]}) : delegate(input,init)));
  mount();
  const picker=await screen.findByRole('button',{name:'Video API key'});
  await waitFor(()=>expect(picker.hasAttribute('disabled')).toBe(false));
  await userEvent.click(picker);
  const menu=await screen.findByRole('menu',{name:'Video API key'});
  await waitFor(()=>expect(menu.textContent).toContain('No active API key'));
  expect(menu.querySelector('a')?.getAttribute('href')).toBe('/workspaces/review-workspace/keys');
});

it('does not claim the key list is empty when loading it fails',async()=>{
  mockFetch();
  const delegate=globalThis.fetch;
  vi.stubGlobal('fetch',vi.fn(async(input,init)=>String(input).endsWith('/keys') ? Response.json({error:{message:'Key service unavailable'}},{status:503}) : delegate(input,init)));
  mount();
  const picker=await screen.findByRole('button',{name:'Video API key'});
  await waitFor(()=>expect(picker.hasAttribute('disabled')).toBe(false));
  await userEvent.click(picker);
  const menu=await screen.findByRole('menu',{name:'Video API key'});
  await waitFor(()=>expect(menu.textContent).toContain('Some API keys could not be loaded.'));
  expect(menu.textContent).not.toContain('No active API key');
});

it('opens a public run reference and uses the resolved identity for diagnostics',async()=>{
  const calls=mockFetch();const delegate=globalThis.fetch;
  vi.stubGlobal('fetch',vi.fn(async(input,init)=>String(input).endsWith('/tasks/run-1000') ? Response.json({data:{id:job,reference:'run-1000',kind:'video',model:model.id,state:'failed'}}) : delegate(input,init)));
  mount(false,'/generations?job=run-1000');
  await screen.findByText('Failed');
  await waitFor(()=>expect(calls.some(call=>call.path.endsWith(`/tasks/${job}/diagnostics`))).toBe(true));
  expect(calls.some(call=>call.path.includes('/run-1000/diagnostics'))).toBe(false);
  expect(calls.some(call=>call.body!==null)).toBe(false);
});
it('rejects a mismatched public run reference before reading diagnostics',async()=>{
  const calls=mockFetch();const delegate=globalThis.fetch;
  vi.stubGlobal('fetch',vi.fn(async(input,init)=>String(input).endsWith('/tasks/run-1000') ? Response.json({data:{id:job,reference:'run-1001',kind:'video',model:model.id,state:'failed'}}) : delegate(input,init)));
  mount(false,'/generations?job=run-1000');
  await screen.findByText(/invalid saved video/);
  expect(calls.some(call=>call.path.endsWith('/diagnostics'))).toBe(false);
});
it('canonicalizes legacy job bookmarks without dropping other query state or the fragment',async()=>{
 mockFetch();const delegate=globalThis.fetch;
 vi.stubGlobal('fetch',vi.fn(async(input,init)=>String(input).endsWith(`/tasks/${job}`)||String(input).endsWith('/tasks/run-1000')?Response.json({data:{id:job,reference:'run-1000',kind:'video',model:model.id,state:'failed',session_id:'66666666-6666-4666-8666-666666666666'}}):delegate(input,init)));
 function Location(){const value=useLocation();return <output aria-label="Public route">{value.search+value.hash}</output>;}
 const context={token:'member',workspace,workspaces:[workspace],session:{permissions:{write:false}}} as DashboardContext;
 render(<MemoryRouter initialEntries={[`/generations?job=${job}&workspace=review-workspace&view=detail&session=66666666-6666-4666-8666-666666666666&turn=77777777-7777-4777-8777-777777777777#output`]}><SidebarProvider><Location/><VideoView context={context}/></SidebarProvider></MemoryRouter>);
 await waitFor(()=>expect(screen.getByLabelText('Public route').textContent).toBe('?job=run-1000&workspace=review-workspace&view=detail#output'));
 await screen.findByText('Failed');
});
it('keeps pending diagnostics distinct from unavailable billing',async()=>{
 mockFetch();const delegate=globalThis.fetch;let complete!: (response:Response)=>void;
 vi.stubGlobal('fetch',vi.fn(async(input,init)=>String(input).endsWith(`/tasks/${job}/diagnostics`)?new Promise<Response>(resolve=>{complete=resolve;}):delegate(input,init)));
 mount(false,`/generations?job=${job}`);
 await screen.findByText('Queued');await userEvent.click(screen.getByRole('button',{name:'Video details'}));
 expect(screen.getByText('Loading billing…')).toBeTruthy();expect(screen.queryByText('Billing is unavailable.')).toBeNull();
 await act(async()=>complete(Response.json({billing:{mode:'customer',charge_nanos:'1000000000',currency:'USD'},timings:{data:[],has_more:false}})));
 await screen.findByText('$1.00');expect(screen.queryByText('Loading billing…')).toBeNull();
});
it('hides native material tools when unsupported and shows them only for supported models',async()=>{
 mockFetch();mount();const user=userEvent.setup();
 await screen.findByRole('button',{name:'Video model'});
 await user.click(screen.getByRole('button',{name:'Additional settings'}));
 expect(screen.queryByText('This model has no native Provider tools.')).toBeNull();
 expect(screen.queryByRole('button',{name:'Provider tools'})).toBeNull();
 expect(screen.queryByRole('button',{name:'Reference materials & verification'})).toBeNull();

 const delegate=globalThis.fetch;
 vi.stubGlobal('fetch',vi.fn(async(input,init)=>String(input).includes('/v1/media/capabilities')?Response.json({complete:true,modules:[{module:'volcengine',model_alias:model.id,display_name:model.id,context_label:'Volcengine'}]}):delegate(input,init)));
 window.localStorage.setItem('niu-dashboard-locale','zh-CN');
 try{
  mount();
  await user.click((await screen.findAllByRole('button',{name:'更多设置'}))[0]);
  expect(await screen.findByLabelText('时长（秒）')).toBeTruthy();
  expect(screen.getByLabelText('宽高比')).toBeTruthy();
  expect(screen.getByLabelText('分辨率')).toBeTruthy();
  expect(await screen.findByRole('button',{name:'参考素材与真人核验'})).toBeTruthy();
  expect(screen.queryByText('此模型没有原生 Provider 工具。')).toBeNull();
 }finally{
  window.localStorage.removeItem('niu-dashboard-locale');
 }
});

it('shows source IP policy guidance and key-switching remedies when the selected key blocks the current source IP',async()=>{
  const restrictedKey='88888888-8888-4888-8888-888888888888';
  mockFetch();
  const delegate=globalThis.fetch;
  vi.stubGlobal('fetch',vi.fn(async(input,init)=>{
    const path=String(input);
    const headers=new Headers(init?.headers);
    const requestedKey=headers.get('x-niu-key-id');
    if(path.endsWith('/keys')){
      return Response.json({data:[
        {id:restrictedKey,slug:'production-gateway-key-2',name:'Production Gateway Key',allowed_models:['*'],allowed_cidrs:['10.0.0.0/8','192.168.1.0/24'],revoked:false,expired:false},
        {id:key,slug:'demo-api-key',name:'Demo API key',allowed_models:['*'],allowed_cidrs:null,revoked:false,expired:false},
      ]});
    }
    if(path.endsWith('/models') && requestedKey===restrictedKey){
      return Response.json({error:{type:'key_ip_not_allowed',message:'This API key does not allow the request source address'}},{status:403});
    }
    return delegate(input,init);
  }));
  mount(true,`/generations?new=video&key=production-gateway-key-2`);
  const user=userEvent.setup();
  expect(await screen.findByText('Production Gateway Key is restricted to allowed source IP addresses')).toBeTruthy();
  expect(screen.getByText(/Allowed source networks: 10\.0\.0\.0\/8, 192\.168\.1\.0\/24/)).toBeTruthy();
  expect(screen.queryByText('No video model available')).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole('button',{name:'Video API key'}).textContent).toContain('Production Gateway Key · Source IP restricted');
  expect(screen.getByRole('link',{name:'Configure source IP access'}).getAttribute('href')).toBe('/workspaces/review-workspace/keys/production-gateway-key-2');
  await user.click(screen.getByRole('button',{name:'Use Demo API key'}));
  expect(await screen.findByRole('button',{name:'Video model'})).toBeTruthy();
  expect(screen.getByRole('button',{name:'Video API key'}).textContent).toContain('Demo API key');
});


it('keeps typing and model choice available while an image uploads, then waits before generating with the image',async()=>{
 const savedModel:VideoModel={...model,input_types:['text','image_url'],maximum_content_items:2,
  workspace_asset:{media_kind:'image',requires_consent:true,requires_current_inspection:false,maximum_items:1,requires_text:true},
  image_url:{maximum_items:1,maximum_bytes:4096,https:false,data_mime_types:['image/png'],roles:['first_frame'],role_required:false,requires_text:true}};
 const calls=mockFetch(undefined,undefined,savedModel);const fallback=globalThis.fetch;
 const asset={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'frame.png',media_kind:'image' as const,content_type:'image/png',content_sha256:'a'.repeat(64),byte_length:4,revision:'1',created_at_ms:0,updated_at_ms:0};
 let resolveUpload!:(response:Response)=>void;const upload=new Promise<Response>(resolve=>{resolveUpload=resolve;});
 vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:upload-wait');
 vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
 vi.stubGlobal('fetch',vi.fn(async(path:string,init?:RequestInit)=>{
  if(path.includes('/assets?')&&init?.method==='POST')return upload;
  if(path.endsWith(`/assets/${asset.id}/content`))return new Response(new Uint8Array([137,80,78,71]));
  if(path.endsWith(`/assets/${asset.id}`))return Response.json({data:asset});
  return fallback(path,init);
 }));
 mount(true,`/generations?mode=video&key=${key}`);const user=userEvent.setup();
 await screen.findByRole('button',{name:'Video model'});
 await user.type(screen.getByLabelText('Prompt'),'Animate this frame');
 await user.upload(screen.getByLabelText('Upload saved video reference images'),new File(['image'],'frame.png',{type:'image/png'}));
 await screen.findByText('Saving image 1 of 1…');
 await waitFor(()=>expect(screen.getByRole('button',{name:'Video model'}).hasAttribute('disabled')).toBe(false));
 await user.type(screen.getByLabelText('Prompt'),' now');
 expect((screen.getByLabelText('Prompt') as HTMLTextAreaElement).value).toContain('now');
 await user.click(screen.getByRole('button',{name:'Generate video'}));
 await screen.findByText('Waiting for image upload to finish…');
 expect(calls.some(call=>call.path.endsWith('/jobs') || call.path.endsWith('/submit'))).toBe(false);
 resolveUpload(Response.json({data:asset}));
 await screen.findByRole('button',{name:'Role for frame.png'});
 await waitFor(()=>expect(calls.some(call=>call.path.endsWith('/submit'))).toBe(true));
 const saves=calls.filter(call=>call.path.includes('/video/intents/')&&(call.body as {request?:{content?:unknown[]}})?.request);
 expect(saves).toHaveLength(1);
 expect((saves[0].body as {request:{content:unknown[]}}).request.content).toContainEqual({type:'workspace_asset',workspace_asset:{asset_id:asset.id,consent_to_process:true},role:'first_frame'});
});
