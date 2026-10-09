import { act,render,screen,waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect,it,vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router';
import { SidebarProvider } from '@/components/ui/sidebar';
import VideoView from '@/features/video/VideoView';
import type { DashboardContext } from '@/app/dashboard-context';
import type { VideoModel } from '../../../../../sdks/javascript/src/index';
import { initialControls,videoRequest } from '@/features/video/request';
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
  const calls:Array<{path:string;body:unknown}>=[];
  vi.stubGlobal('fetch',vi.fn(async(path:string,init?:RequestInit)=>{
    calls.push({path,body:init?.body ? JSON.parse(String(init.body)):null});
    if(path.endsWith('/chat-sessions'))return Response.json({data:[]});
    if(path.endsWith('/keys'))return Response.json({data:[{id:key,name:'Review key',revoked:false,expired:false}]});
    if(path.endsWith('/models'))return Response.json({object:'list',data:[catalogModel]});
    if(path.includes('/jobs?'))return Response.json({data:[],has_more:false,next_before:null});
    if(path.endsWith('/estimate'))return Response.json(quote);
    if(path.endsWith('/jobs'))return create();
    if(path.endsWith('/billing'))return Response.json({mode:'customer',charge_nanos:null,reserved_nanos:'2000000000',currency:'CNY'});
    if(path.endsWith('/timings'))return Response.json({data:[],has_more:false,lifecycle});
    return Response.json({id:job,object:'video.job',model:model.id,status:'queued'});
  }));
  return calls;
}
it('requires a current estimate, invalidates it when input changes and submits once with defaults',async()=>{
  const calls=mockFetch();mount();const user=userEvent.setup();
  await screen.findByRole('button',{name:'Video model'});
  await user.type(screen.getByLabelText('Prompt'),'A mountain');
  await user.click(screen.getByRole('button',{name:'Additional settings'}));
  await user.clear(screen.getByLabelText('Duration (seconds)'));await user.type(screen.getByLabelText('Duration (seconds)'),'7');
  await user.click(screen.getByRole('button',{name:'Additional settings'}));
  expect(screen.getByRole('button',{name:'Generate video'}).hasAttribute('disabled')).toBe(true);
  await user.click(screen.getByRole('button',{name:'Estimate',exact:true}));
  await screen.findByText('Estimated CNY 1.00');
  await user.type(screen.getByLabelText('Prompt'),' sunrise');
  expect(screen.getByRole('button',{name:'Generate video'}).hasAttribute('disabled')).toBe(true);
  await user.click(screen.getByRole('button',{name:'Estimate',exact:true}));
  await screen.findByText('Estimated CNY 1.00');
  await user.dblClick(screen.getByRole('button',{name:'Generate video'}));
  await screen.findByText('Queued');
  await user.click(screen.getByRole('button',{name:'Reload status'}));
  await waitFor(()=>expect(calls.filter(call=>call.path.endsWith('/models')).length).toBeGreaterThan(1));
  await user.click(screen.getByRole('button',{name:'Additional settings'}));
  expect((screen.getByLabelText('Duration (seconds)') as HTMLInputElement).value).toBe('7');
  const submits=calls.filter(call=>call.path.endsWith('/jobs'));
  expect(submits).toHaveLength(1);
  expect(submits[0].body).toMatchObject({model:model.id,duration:7,frames_per_second:24,content:[{type:'text',text:'A mountain sunrise'}]});
  expect(document.body.textContent).not.toContain(job);
  expect(document.body.textContent).not.toContain(key);
});
it('does not automatically retry a lost paid submission response',async()=>{
  const calls=mockFetch(async()=>{throw new TypeError('Network unavailable');});mount();const user=userEvent.setup();
  await screen.findByRole('button',{name:'Video model'});await user.type(screen.getByLabelText('Prompt'),'A mountain');
  await user.click(screen.getByRole('button',{name:'Estimate',exact:true}));await screen.findByText('Estimated CNY 1.00');
  await user.click(screen.getByRole('button',{name:'Generate video'}));
  await screen.findByText(/Submission may have reached/);
  expect(screen.getByRole('button',{name:'Generate video'}).hasAttribute('disabled')).toBe(true);
  expect(calls.filter(call=>call.path.endsWith('/jobs'))).toHaveLength(1);
});
it('reader can estimate but cannot submit',async()=>{
  const calls=mockFetch();mount(false);const user=userEvent.setup();
  await screen.findByRole('button',{name:'Video model'});await user.type(screen.getByLabelText('Prompt'),'A mountain');
  await user.click(screen.getByRole('button',{name:'Estimate',exact:true}));await screen.findByText('Estimated CNY 1.00');
  expect(screen.getByRole('button',{name:'Generate video'}).hasAttribute('disabled')).toBe(true);
  expect(calls.filter(call=>call.path.endsWith('/jobs'))).toHaveLength(0);
  await waitFor(()=>expect(screen.getByText(/Read access can estimate/)).toBeDefined());
});
it('validates UTF-8, integer bounds and actual output pairs rather than assumed combinations',()=>{
  const controls=initialControls(model);
  expect(()=>videoRequest(model,'中'.repeat(400),controls)).toThrow(/text limit/);
  expect(()=>videoRequest(model,'Prompt',{...controls,duration:'1.5'})).toThrow(/integer/);
  expect(()=>videoRequest(model,'Prompt',{...controls,resolution:'1080p'})).toThrow(/together/);
  expect(videoRequest(model,'Prompt',{...controls,resolution:'1080p',ratio:'1:1'})).toMatchObject({resolution:'1080p',ratio:'1:1'});
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
  expect(screen.getByRole('button',{name:'Generate video'}).hasAttribute('disabled')).toBe(true);
});

it('restores the result pane when opening a saved job URL',async()=>{
 mockFetch();mount(true,`/chat?mode=video&job=${job}`);
 await screen.findByText('Queued');
 expect(screen.getByRole('tab',{name:'Result',exact:true}).getAttribute('aria-selected')).toBe('true');
});

it('connects saved lifecycle observations to the result waterfall without new generation',async()=>{
 const calls=mockFetch(undefined,{source:'gateway_observation',submitted_unix_ms:1000,observations:[{status:'running',observed_unix_ms:3000},{status:'succeeded',observed_unix_ms:9000}],conflicting_terminal:false});
 mount(true,`/chat?mode=video&job=${job}`);
 await screen.findByLabelText('Running observed: 6.0 s');
 expect(screen.getByText('Observed completion: 8.0 s')).toBeDefined();
 expect(calls.filter(call=>call.path.endsWith('/jobs'))).toHaveLength(0);
});

it('retries a failed API-key read before loading models without submitting a video',async()=>{
 let keyReads=0;
 const calls:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(path:string)=>{
   calls.push(path);
   if(path.endsWith('/chat-sessions'))return Response.json({data:[]});
   if(path.endsWith('/keys')) {
     if(++keyReads === 1)return Response.json({error:{message:'API keys temporarily unavailable'}},{status:503});
     return Response.json({data:[{id:key,name:'Review key',revoked:false,expired:false}]});
   }
   if(path.endsWith('/models'))return Response.json({object:'list',data:[model]});
   if(path.includes('/jobs?'))return Response.json({data:[],has_more:false,next_before:null});
   throw new Error('Unexpected request');
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
  await waitFor(()=>expect(calls.filter(call=>call.path.endsWith('/jobs'))).toHaveLength(1));
  view.rerender(tree(other));
  await waitFor(()=>expect(calls.some(call=>call.path.includes(other.id)&&call.path.endsWith('/models'))).toBe(true));
  view.rerender(tree(workspace));
  await screen.findByRole('button',{name:'Video model'});
  await act(async()=>{if(outcome==='accepted')finish(Response.json({id:job,object:'video.job',model:model.id,status:'queued'}));else fail(new TypeError('Late original workspace error'));await pending.catch(()=>{});});
  expect(screen.queryByText('Queued')).toBeNull();
  expect(screen.queryByText('Late original workspace error')).toBeNull();
  expect(screen.queryByText(/Submission may have reached/)).toBeNull();
  expect(calls.filter(call=>call.path.endsWith('/jobs'))).toHaveLength(1);
  expect(calls.some(call=>call.path.includes(`/jobs/${job}`))).toBe(false);
  expect(screen.getByRole('tab',{name:'Input',exact:true}).getAttribute('aria-selected')).toBe('true');
});

it('keeps paginated history from an old workspace out of the current workspace',async()=>{
  const ordinaryFetch=mockFetch();
  const delegate=globalThis.fetch;
  let finish!: (response:Response)=>void;
  const pending=new Promise<Response>(resolve=>{finish=resolve;});
  const other={...workspace,id:'55555555-5555-4555-8555-555555555555',name:'Other workspace'};
  vi.stubGlobal('fetch',vi.fn<typeof fetch>(async(input,init)=>{
    const path=String(input);
    if(path.includes(workspace.id)&&path.includes('/jobs?')) {
      if(path.includes('&before='))return pending;
      return Response.json({data:[],has_more:true,next_before:'2026-10-01T00:00:00Z'});
    }
    return delegate(input,init);
  }));
  const context={token:'member',workspace,workspaces:[workspace,other],session:{permissions:{write:true}},selectWorkspace:vi.fn()} as unknown as DashboardContext;
  const tree=(scope:typeof workspace)=><MemoryRouter><SidebarProvider><VideoView context={{...context,workspace:scope}}/></SidebarProvider></MemoryRouter>;
  const view=render(tree(workspace));const user=userEvent.setup();
  await user.click(await screen.findByRole('button',{name:'Load more',exact:true}));
  view.rerender(tree(other));
  await waitFor(()=>expect(ordinaryFetch.some(call=>call.path.includes(other.id)&&call.path.endsWith('/models'))).toBe(true));
  await act(async()=>{finish(Response.json({data:[{id:job,object:'video.job',model:'Old workspace video',status:'queued',created_at:'2026-10-01T00:00:00Z'}],has_more:true,next_before:'stale'}));await pending;});
  expect(screen.queryByText('Old workspace video')).toBeNull();
  expect(screen.queryByRole('button',{name:'Load more',exact:true})).toBeNull();
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
  view.rerender(tree(other));await screen.findByRole('button',{name:'Video model'});
  await act(async()=>{finish(Response.json({id:job,object:'video.job',model:model.id,status:'queued'}));await pending;});
  expect(screen.getByLabelText('Current route').textContent).toBe('?mode=video');
  expect(screen.queryByText('Queued')).toBeNull();
});
