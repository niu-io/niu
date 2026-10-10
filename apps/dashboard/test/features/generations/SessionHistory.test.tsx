import {afterEach,expect,it,vi} from 'vitest';
import {act,render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter} from 'react-router';
import {SidebarProvider} from '@/components/ui/sidebar';
import SessionHistory from '@/features/generations/SessionHistory';
import type {DashboardContext} from '@/app/dashboard-context';
const a={id:'11111111-1111-4111-8111-111111111111',organization_id:'22222222-2222-4222-8222-222222222222',name:'A',organization_name:'Company'};
const b={...a,id:'33333333-3333-4333-8333-333333333333',name:'B'};
const context={token:'member',workspace:a,workspaces:[a,b]} as DashboardContext;
afterEach(()=>vi.unstubAllGlobals());
it('merges saved chat and video sessions across accessible workspaces and preserves original key links and pagination',async()=>{
 const calls:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(path:string)=>{
  calls.push(path);
  if(path.endsWith('/video-intents') || path.includes('/video-intents?'))return Response.json({data:[],has_more:false,next_before:null});
  if(path.endsWith('/chat-sessions'))return Response.json({data:[{id:'chat-b',title:'Other workspace conversation',prompt:'B',createdAt:200}]});
  if(path.endsWith('/keys'))return Response.json({data:[{id:path.includes(a.id)?'key-a':'key-b',revoked:false,expired:false}]});
  if(path.includes('key-b/video/jobs'))return Response.json({data:[],has_more:false,next_before:null});
  if(path.includes('before='))return Response.json({data:[{id:'older-video',model:'Older model',status:'succeeded',created_at_ms:'50'}],has_more:false,next_before:null});
  return Response.json({data:[{id:'video-a',model:'Video model',status:'succeeded',created_at_ms:'300'}],has_more:true,next_before:'cursor'});
 }));
 const open=vi.fn();
 render(<MemoryRouter><SidebarProvider><SessionHistory context={context} chats={[{id:'chat-a',title:'Current conversation',prompt:'A',createdAt:100}]} onChat={open}/></SidebarProvider></MemoryRouter>);
 const video=await screen.findByRole('link',{name:'Video · Video model'});
 expect(screen.queryByRole('textbox',{name:'Search sessions'})).toBeNull();
 await userEvent.click(screen.getByRole('button',{name:'Search sessions'}));
 await userEvent.type(screen.getByRole('textbox',{name:'Search sessions'}),'Current conversation');
 expect(screen.queryByRole('link',{name:'Video · Video model'})).toBeNull();
 await userEvent.keyboard('{Escape}');
 expect(screen.queryByRole('textbox',{name:'Search sessions'})).toBeNull();
 await userEvent.click(screen.getByRole('button',{name:'Search sessions'}));
 expect((screen.getByRole('textbox',{name:'Search sessions'}) as HTMLInputElement).value).toBe('Current conversation');
 await userEvent.click(screen.getByRole('button',{name:'Reset search'}));
 await userEvent.keyboard('{Escape}');
 expect(video.getAttribute('href')).toContain('key=key-a');
 expect(video.getAttribute('href')).toContain(`workspace=${a.id}`);
 expect(screen.getByRole('link',{name:'Other workspace conversation'}).getAttribute('href')).toContain(`workspace=${b.id}`);
 await userEvent.click(screen.getByRole('button',{name:'Current conversation'}));expect(open).toHaveBeenCalledWith('chat-a');
 await userEvent.click(screen.getByRole('button',{name:'Load more sessions'}));
 await screen.findByRole('link',{name:'Video · Older model'});
 expect(calls.some(path=>path.includes('key-a/video/jobs?limit=25&before=cursor'))).toBe(true);
 expect(screen.queryByRole('button',{name:'Load more sessions'})).toBeNull();
 expect(screen.queryByRole('alert')).toBeNull();
} );
it('discards history that resolves after the account and workspace change',async()=>{
 let finish!:(value:Response)=>void;
 vi.stubGlobal('fetch',vi.fn(async(path:string)=>{
  if(path.includes(a.id)&&path.endsWith('/chat-sessions'))return new Promise<Response>(resolve=>{finish=resolve;});
  if(path.endsWith('/video-intents') || path.includes('/video-intents?'))return Response.json({data:[],has_more:false,next_before:null});
  if(path.endsWith('/chat-sessions'))return Response.json({data:[{id:'current',title:'Current account session',prompt:'',createdAt:100}]});
  if(path.endsWith('/keys'))return Response.json({data:[]});
  throw new Error('Unexpected request');
 }));
 const tree=(ctx:DashboardContext)=><MemoryRouter><SidebarProvider><SessionHistory context={ctx}/></SidebarProvider></MemoryRouter>;
 const mounted=render(tree({...context,workspaces:[a]}));
 await waitFor(()=>expect(finish).toBeTypeOf('function'));
 mounted.rerender(tree({...context,token:'different-member',workspace:b,workspaces:[b]}));
 await screen.findByRole('link',{name:'Current account session'});
 await act(async()=>finish(Response.json({data:[{id:'old',title:'Previous account session',prompt:'',createdAt:200}]})));
 expect(screen.queryByText('Previous account session')).toBeNull();
 expect(screen.getByRole('link',{name:'Current account session'})).toBeTruthy();
});
it('keeps available chat and video history when earlier workspaces or individual keys fail',async()=>{
 const workspaces=['bad1','bad2','bad3','bad4','good'].map((name,index)=>({...a,id:`00000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,name}));
 vi.stubGlobal('fetch',vi.fn(async(path:string)=>{
  if(!path.includes(workspaces[4].id))return Response.json({error:{message:'Unavailable'}},{status:403});
  if(path.endsWith('/video-intents') || path.includes('/video-intents?'))return Response.json({data:[],has_more:false,next_before:null});
  if(path.endsWith('/chat-sessions'))return Response.json({data:[{id:'available-chat',title:'Available conversation',prompt:'',createdAt:100}]});
  if(path.endsWith('/keys'))return Response.json({data:[{id:'bad-key',revoked:false,expired:false},{id:'good-key',revoked:false,expired:false}]});
  if(path.includes('/bad-key/'))return Response.json({error:{message:'Unavailable'}},{status:403});
  return Response.json({data:[{id:'available-video',model:'Available video',status:'succeeded',created_at_ms:'200'}],has_more:false});
 }));
 render(<MemoryRouter><SidebarProvider><SessionHistory context={{...context,workspace:workspaces[0],workspaces}}/></SidebarProvider></MemoryRouter>);
 await screen.findByRole('link',{name:'Available conversation'});
 expect(screen.getByRole('link',{name:'Video · Available video'}).getAttribute('href')).toContain('key=good-key');
 expect(screen.getByRole('alert').textContent).toBe('Some sessions could not be loaded.');
 expect(screen.queryByText('No sessions yet')).toBeNull();
});

it('aborts pagination and rejects an old page after leaving and returning to the same workspace',async()=>{
 let finish!:(value:Response)=>void;
 let signal:AbortSignal|undefined;
 vi.stubGlobal('fetch',vi.fn(async(path:string,init?:RequestInit)=>{
  if(path.includes('before=')){signal=init?.signal??undefined;return new Promise<Response>(resolve=>{finish=resolve;});}
  if(path.endsWith('/video-intents') || path.includes('/video-intents?'))return Response.json({data:[],has_more:false,next_before:null});
  if(path.endsWith('/chat-sessions'))return Response.json({data:[]});
  if(path.endsWith('/keys'))return Response.json({data:[{id:'history-key',revoked:false,expired:false}]});
  return Response.json({data:[],has_more:path.includes(a.id),next_before:'cursor'});
 }));
 const tree=(workspace:typeof a)=><MemoryRouter><SidebarProvider><SessionHistory context={{...context,workspace,workspaces:[workspace]}}/></SidebarProvider></MemoryRouter>;
 const view=render(tree(a));
 await userEvent.click(await screen.findByRole('button',{name:'Load more sessions'}));
 await waitFor(()=>expect(finish).toBeTypeOf('function'));
 view.rerender(tree(b));expect(signal?.aborted).toBe(true);
 await waitFor(()=>expect(screen.getByText('No sessions yet')).toBeTruthy());
 view.rerender(tree(a));await screen.findByRole('button',{name:'Load more sessions'});
 await act(async()=>finish(Response.json({data:[{id:'old-page',model:'Outdated video',status:'queued',created_at_ms:'200'}],has_more:false})));
 expect(screen.queryByRole('link',{name:'Video · Outdated video'})).toBeNull();
 expect(screen.getByRole('button',{name:'Load more sessions'})).toBeTruthy();
});

it('discovers a saved input, confirms deletion and preserves its original job',async()=>{
 const intent='55555555-5555-4555-8555-555555555555',key='66666666-6666-4666-8666-666666666666',job='77777777-7777-4777-8777-777777777777';
 const calls:Array<{path:string;method:string;body:unknown}>=[];
 vi.stubGlobal('fetch',vi.fn(async(path:string,init?:RequestInit)=>{
  calls.push({path,method:init?.method??'GET',body:init?.body ? JSON.parse(String(init.body)):null});
  if(init?.method==='DELETE')return Response.json({data:{id:intent,revision:2,deleted:true}});
  if(path.includes('/video-intents?'))return Response.json({data:[{id:intent,revision:1,expires_at_ms:'1800000000000',content_state:'retained'}],has_more:false,next_before:null});
  if(path.endsWith(`/video-intents/${intent}`))return Response.json({data:{id:intent,revision:1,expires_at_ms:'1800000000000',content_state:'retained',original_key_id:key,key_id:key,model:'Actual video model',funding_mode:'owner_funded',request:{model:'Actual video model',content:[{type:'text',text:'Sunset landscape'}]},submission_state:'dispatched',job:{id:job,object:'video.job',model:'Actual video model',status:'succeeded'}}});
  return Response.json({data:[]});
 }));
 render(<MemoryRouter><SidebarProvider><SessionHistory context={{...context,workspaces:[a],session:{permissions:{write:true}}} as DashboardContext} currentKeys={[]} videos={[{id:job,object:'video.job',model:'Actual video model',status:'succeeded',created_at_ms:'1790000000000',keyId:key}]}/></SidebarProvider></MemoryRouter>);
 const user=userEvent.setup();
 const row=await screen.findByRole('link',{name:'Video · Sunset landscape'});
 expect(row.getAttribute('href')).toContain(`intent=${intent}`);
 expect(screen.queryByRole('link',{name:'Video · Actual video model'})).toBeNull();
 const actions=screen.getByRole('button',{name:'Actions for Video · Sunset landscape'});
 await user.click(actions);await user.click(screen.getByRole('menuitem',{name:'Delete saved input'}));
 await screen.findByRole('dialog',{name:'Delete saved video input'});
 expect(screen.getByText(/does not cancel the generation/)).toBeTruthy();
 await user.click(screen.getByRole('button',{name:'Cancel',exact:true}));
 await waitFor(()=>expect(document.activeElement).toBe(actions));
 expect(calls.some(call=>call.method==='DELETE')).toBe(false);
 await user.click(actions);await user.click(screen.getByRole('menuitem',{name:'Delete saved input'}));
 await user.click(screen.getByRole('button',{name:'Delete input',exact:true}));
 await screen.findByRole('link',{name:'Video · Actual video model'});
 expect(screen.queryByRole('link',{name:'Video · Sunset landscape'})).toBeNull();
 expect(calls.filter(call=>call.method==='DELETE')).toEqual([{path:expect.stringContaining(`/video-intents/${intent}`),method:'DELETE',body:{expected_revision:1}}]);
 expect(calls.some(call=>call.method==='POST')).toBe(false);
 expect(document.body.textContent).not.toContain(intent);
});

it('keeps an erasable row after revoked-key denial and keeps failed deletion in its dialog',async()=>{
 const intent='55555555-5555-4555-8555-555555555555';
 vi.stubGlobal('fetch',vi.fn(async(path:string,init?:RequestInit)=>{
  if(init?.method==='DELETE')return Response.json({error:{message:'Storage unavailable'}},{status:503});
  if(path.includes('/video-intents?'))return Response.json({data:[{id:intent,revision:1,expires_at_ms:'1800000000000',content_state:'retained'}],has_more:false,next_before:null});
  if(path.includes('/video-intents/'))return Response.json({error:{message:'Key revoked'}},{status:403});
  return Response.json({data:[]});
 }));
 render(<MemoryRouter><SidebarProvider><SessionHistory context={{...context,workspaces:[a],session:{permissions:{write:true}}} as DashboardContext} currentKeys={[]}/></SidebarProvider></MemoryRouter>);
 const user=userEvent.setup();
 await user.click(await screen.findByRole('button',{name:/Actions for Saved video request/}));
 await user.click(screen.getByRole('menuitem',{name:'Delete saved input'}));
 await user.click(screen.getByRole('button',{name:'Delete input',exact:true}));
 await screen.findByText('Storage unavailable');
 expect(screen.getByRole('dialog',{name:'Delete saved video input'})).toBeTruthy();
 await user.click(screen.getByRole('button',{name:'Cancel',exact:true}));
 expect(await screen.findByRole('link',{name:/Saved video request/})).toBeTruthy();
 expect(document.body.textContent).not.toContain(intent);
});
