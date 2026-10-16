import { act,render,screen,waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import userEvent from '@testing-library/user-event';
import { expect,it,vi } from 'vitest';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { SidebarProvider } from '@/components/ui/sidebar';
import SessionView from '@/features/video/VideoView';
import type { DashboardContext } from '@/app/dashboard-context';
import type { VideoModel } from '../../../../../sdks/javascript/src/index';
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
    if(path.endsWith('/video-draft')){
      const prior=drafts.get(path)??{revision:0,content_state:'empty',expires_at_ms:null,payload:null};
      if(init?.method==='PUT'){
        const body=JSON.parse(String(init.body));
        const saved={revision:body.expected_revision+1,content_state:body.payload?'retained':'empty',expires_at_ms:body.payload?'1800000000000':null,payload:body.payload};
        drafts.set(path,saved);
        return Response.json({data:saved});
      }
      return Response.json({data:prior});
    }
    if(path.includes('/generations-sessions?'))return Response.json({data:[],has_more:false,next_before:null});
    if(path.includes('/generations-sessions/')){
      const match=path.match(/\/organizations\/[^/]+\/projects\/([^/]+)\/generations-sessions\/([^/?]+)(?:\/turns\/([^/?]+)(\/intent)?)?/);
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
      const intentEntry=[...intents.entries()].find(([k])=>k.endsWith(`/video-intents/${body.intent_id}`));
      const intentDoc=intentEntry?.[1] as {model:string}|undefined;
      if(intentEntry&&intentDoc)intents.set(intentEntry[0],{...intentDoc,session_binding:{session_id:sessionId,turn_id:turnId}});
      const nextRev=String(Number(existing.revision)+1);
      const updated={...existing,revision:nextRev,turns:existing.turns.map(t=>t.id===turnId?{...t,intent:{id:body.intent_id,revision:'1',model:intentDoc?.model??catalogModel.id,content_state:'retained',submission_state:'saved',task_id:null}}:t)};
      sessions.set(sessionKey,updated);
      return Response.json({data:updated});
    }
    if(path.includes('/generations/tasks?'))return Response.json({data:[],has_more:false,next_cursor:null});
    if(path.includes('/generations/tasks/') && path.endsWith('/diagnostics'))return Response.json({billing:{mode:'customer',charge_nanos:null,reserved_nanos:'2000000000',currency:'CNY'},timings:{data:[],has_more:false,lifecycle}});
    if(path.includes('/generations/tasks/'))return Response.json({data:{id:path.split('/').at(-1),kind:'video',model:catalogModel.id,state:'queued',created_at:'1970-01-01T00:00:00Z',updated_at:'1970-01-01T00:00:00Z',artifacts:[]}});
    if(path.includes('/v1/media/capabilities'))return Response.json({modules:[]});
    if(path.endsWith('/video-intents') || path.includes('/video-intents?'))return Response.json({data:[],has_more:false,next_before:null});
    if(path.endsWith('/chat-sessions'))return Response.json({data:[]});
    if(path.endsWith('/keys'))return Response.json({data:[{id:key,name:'Review key',allowed_models:['*'],revoked:false,expired:false}]});
    if(path.endsWith('/models'))return Response.json({object:'list',data:[catalogModel]});
    if(path.includes('/jobs?'))return Response.json({data:[],has_more:false,next_before:null});
    if(path.endsWith('/estimate'))return Response.json(quote);
    if(path.endsWith('/submit')){
      const response=await create();
      if(response.ok){const submitted=await response.clone().json();const savedPath=path.slice(0,-'/submit'.length);const saved=intents.get(savedPath);if(saved)intents.set(savedPath,{...saved as object,submission_state:'dispatched',job:submitted});}
      return response;
    }
    if(path.includes('/video-intents/')){
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
it('restores original saved input after job-only navigation without submitting another generation',async()=>{
 const calls=mockFetch();const fallback=globalThis.fetch;
 const intent='55555555-5555-4555-8555-555555555555';
 const saved={id:intent,revision:1,created_at_ms:'1700000000000',expires_at_ms:'1800000000000',content_state:'retained',key_id:key,model:model.id,request:videoRequest(model,'Original saved orange ball',initialControls(model)),submission_state:'dispatched',job:{id:job,model:model.id,status:'queued'}};
 vi.stubGlobal('fetch',vi.fn(async(path:string,init?:RequestInit)=>path.includes('/video-intents?')?Response.json({data:[saved],has_more:false,next_before:null}):path.endsWith('/video-intents/'+intent)?Response.json({data:saved}):fallback(path,init)));
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
 vi.stubGlobal('fetch',vi.fn(async(path:string,init?:RequestInit)=>path.includes('/video-intents?')?(unavailable?Response.json({error:{message:'Saved input temporarily unavailable'}},{status:503}):Response.json({data:[saved],has_more:false,next_before:null})):path.endsWith('/video-intents/'+intent)?Response.json({data:saved}):fallback(path,init)));
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
  expect(screen.queryByRole('button',{name:'Generate video'})).toBeNull();
  await user.click(screen.getByRole('button',{name:'Estimate',exact:true}));
  await screen.findByText('Estimated CNY 1.00');
  await user.type(screen.getByLabelText('Prompt'),' sunrise');
  expect(screen.queryByRole('button',{name:'Generate video'})).toBeNull();
  await user.click(screen.getByRole('button',{name:'Estimate',exact:true}));
  await screen.findByText('Estimated CNY 1.00');
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
  const saves=calls.filter(call=>call.path.includes('/video-intents/') && (call.body as {request?:unknown})?.request);
  expect(saves).toHaveLength(1);
  expect(saves[0].body).toMatchObject({key_id:key,request:{model:model.id,duration:7,frames_per_second:24,content:[{type:'text',text:'A mountain sunrise'}]}});
  expect(document.body.textContent).not.toContain(job);
  expect(document.body.textContent).not.toContain(key);
});
it('does not automatically retry a lost paid submission response',async()=>{
  const calls=mockFetch(async()=>{throw new TypeError('Network unavailable');});mount();const user=userEvent.setup();
  await screen.findByRole('button',{name:'Video model'});await user.type(screen.getByLabelText('Prompt'),'A mountain');
  await user.click(screen.getByRole('button',{name:'Estimate',exact:true}));await screen.findByText('Estimated CNY 1.00');
  await user.click(screen.getByRole('button',{name:'Generate video'}));
  await screen.findByText('Network unavailable');
  await waitFor(()=>expect(calls.some(call=>call.path.includes('/video-intents/') && call.body===null)).toBe(true));
  expect(calls.filter(call=>call.path.endsWith('/submit') || call.path.endsWith('/jobs'))).toHaveLength(1);
});
it('shows a credential rate refusal without retrying or presenting a queued video',async()=>{
  const message='The selected upstream route has reached its rolling 60-second request limit; retry after 60 seconds';
  const calls=mockFetch(async()=>Response.json({error:{type:'upstream_request_rate_exceeded',message}},{status:429,headers:{'retry-after':'60'}}));
  mount();const user=userEvent.setup();
  await screen.findByRole('button',{name:'Video model'});
  await user.type(screen.getByLabelText('Prompt'),'A mountain');
  await user.click(screen.getByRole('button',{name:'Estimate',exact:true}));
  await screen.findByText('Estimated CNY 1.00');
  await user.click(screen.getByRole('button',{name:'Generate video'}));
  await screen.findByText(message);
  await waitFor(()=>expect(calls.some(call=>call.path.includes('/video-intents/') && call.body===null)).toBe(true));
  expect(calls.filter(call=>call.path.endsWith('/submit') || call.path.endsWith('/jobs'))).toHaveLength(1);
  expect(screen.queryByText('Queued')).toBeNull();
  expect(screen.queryByText('Succeeded')).toBeNull();
  expect(calls.some(call=>call.path.includes(`/jobs/${job}`))).toBe(false);
});
it('reader can estimate but cannot submit',async()=>{
  const calls=mockFetch();mount(false);const user=userEvent.setup();
  await screen.findByRole('button',{name:'Video model'});await user.type(screen.getByLabelText('Prompt'),'A mountain');
  await user.click(screen.getByRole('button',{name:'Estimate',exact:true}));await screen.findByText('Estimated CNY 1.00');
  expect(screen.getByRole('button',{name:'Generate video'}).hasAttribute('disabled')).toBe(true);
  expect(calls.filter(call=>call.path.endsWith('/submit') || call.path.endsWith('/jobs'))).toHaveLength(0);
  await waitFor(()=>expect(screen.getByText(/Read access can estimate/)).toBeDefined());
});
it('restores immutable input and the original job from an intent URL without dispatch',async()=>{
  const calls=mockFetch();const delegate=globalThis.fetch;
  const intent='77777777-7777-4777-8777-777777777777';
  vi.stubGlobal('fetch',vi.fn<typeof fetch>(async(input,init)=>{
    const path=String(input);
    if(path.endsWith(`/video-intents/${intent}`)){
      calls.push({path,body:init?.body ? JSON.parse(String(init.body)):null});
      return Response.json({data:{id:intent,revision:1,expires_at_ms:'1800000000000',content_state:'retained',original_key_id:key,key_id:key,model:model.id,funding_mode:'customer',request:{model:model.id,content:[{type:'text',text:'Saved landscape'}],duration:7,resolution:'720p',ratio:'16:9',frames_per_second:24},submission_state:'dispatched',job:{id:job,object:'video.job',model:model.id,status:'queued'}}});
    }
    return delegate(input,init);
  }));
  mount(true,`/generations?mode=video&intent=${intent}`);
  await screen.findByText('Queued');
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
  await screen.findByText('Estimated CNY 1.00');
  expect(calls.find(call=>call.path.endsWith('/estimate'))?.body).toMatchObject({content:[{type:'text',text:'A mountain'},{type:'image_url',role:'first_frame'}]});
  await user.click(screen.getByRole('button',{name:'Remove frame.png'}));
  expect(screen.queryByText('Estimated CNY 1.00')).toBeNull();
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
    if(path.endsWith('/video-draft'))return Response.json({data:{revision:0,content_state:'empty',expires_at_ms:null,payload:null}});
    if(path.endsWith('/video-intents') || path.includes('/video-intents?'))return Response.json({data:[],has_more:false,next_before:null});
    if(path.endsWith('/chat-sessions'))return Response.json({data:[]});
    if(path.endsWith('/keys'))return Response.json({data:[{id:key,name:'Review key',allowed_models:['*'],revoked:false,expired:false}]});
    if(path.includes('/v1/media/capabilities'))return Response.json({modules:[]});
    if(path.endsWith('/models'))return Response.json({object:'list',data:[model]});
    if(path.includes('/generations/tasks?'))return Response.json({data:[],has_more:false,next_cursor:null});
    if(path.endsWith(`/generations/tasks/${job}/diagnostics`))return Response.json({billing:{mode:'customer',charge_nanos:null,reserved_nanos:'2000000000',currency:'CNY'},timings:{data:[],has_more:false}});
    if(path.endsWith(`/generations/tasks/${job}`)){
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

it('does not leave a saved job loading forever when no active API key remains',async()=>{
  const calls:string[]=[];
  vi.stubGlobal('fetch',vi.fn(async(path:string)=>{
    calls.push(path);
    if(path.endsWith('/video-draft'))return Response.json({data:{revision:0,content_state:'empty',expires_at_ms:null,payload:null}});
    if(path.endsWith('/video-intents') || path.includes('/video-intents?'))return Response.json({data:[],has_more:false,next_before:null});
    if(path.endsWith('/chat-sessions'))return Response.json({data:[]});
    if(path.includes('/generations/tasks?'))return Response.json({data:[],has_more:false,next_cursor:null});
    if(path.endsWith(`/generations/tasks/${job}/diagnostics`))return Response.json({billing:{mode:'customer',charge_nanos:null,reserved_nanos:'2000000000',currency:'CNY'},timings:{data:[],has_more:false}});
    if(path.endsWith(`/generations/tasks/${job}`))return Response.json({data:{id:job,kind:'video',model:model.id,state:'queued',created_at:'1970-01-01T00:00:00Z',updated_at:'1970-01-01T00:00:00Z',artifacts:[]}});
    if(path.endsWith('/keys'))return Response.json({data:[{id:key,name:'Old key',allowed_models:['*'],revoked:true,expired:false}]});
    throw new Error(`No video API should be read without an active key: ${path}`);
  }));
  mount(true,`/generations?mode=video&key=${key}&job=${job}`);
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
   if(path.endsWith('/video-draft'))return Response.json({data:{revision:0,content_state:'empty',expires_at_ms:null,payload:null}});
   if(path.includes('/generations-sessions?'))return Response.json({data:[],has_more:false,next_before:null});
   if(path.endsWith('/video-intents') || path.includes('/video-intents?'))return Response.json({data:[],has_more:false,next_before:null});
   if(path.endsWith('/chat-sessions'))return Response.json({data:[]});
   if(path.includes('/generations/tasks?'))return Response.json({data:[],has_more:false,next_cursor:null});
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
  await user.click(screen.getByRole('button',{name:'Estimate',exact:true}));await screen.findByText('Estimated CNY 1.00');
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
    if(path.includes(workspace.id)&&path.includes('/generations/tasks?')) {
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
  await user.click(screen.getByRole('button',{name:'Estimate',exact:true}));await screen.findByText('Estimated CNY 1.00');
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
  await user.click(screen.getByRole('button',{name:'Estimate',exact:true}));await screen.findByText('Estimated CNY 1.00');
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
    if(input.endsWith('/video-draft'))return Response.json({data:{revision:0,content_state:'empty',expires_at_ms:null,payload:null}});
    if(input.endsWith('/video-intents') || input.includes('/video-intents?'))return Response.json({data:[],has_more:false,next_before:null});
    if(input.endsWith('/chat-sessions'))return Response.json({data:[]});
    if(input.includes('/generations/tasks?'))return Response.json({data:[],has_more:false,next_cursor:null});
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
    if(path.endsWith(`/video-intents/${intent}`)){
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
    if(String(input).endsWith(`/video-intents/${intent}`))return Response.json({data:{id:intent,revision:1,expires_at_ms:'1800000000000',content_state:'retained',key_id:key,model:model.id,session_binding:{session_id:'88888888-8888-4888-8888-888888888888',turn_id:'99999999-9999-4999-8999-999999999999'},request:{model:model.id,content:[{type:'text',text:'Original video scene'}],duration:5,resolution:'720p',ratio:'16:9'},submission_state:'dispatched',job:{id:job,object:'video.job',model:model.id,status:'succeeded'}}});
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
  await screen.findByText('Estimated CNY 1.00');
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
