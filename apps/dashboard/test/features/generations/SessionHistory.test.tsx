import {afterEach,expect,it,vi} from 'vitest';
import {act,render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter} from 'react-router';
import {SidebarProvider} from '@/components/ui/sidebar';
import SessionHistory from '@/features/generations/SessionHistory';
import {clearSessionCache} from '@/lib/query-cache';
import type {DashboardContext} from '@/shell/dashboard-context';
const a={id:'11111111-1111-4111-8111-111111111111',organization_id:'22222222-2222-4222-8222-222222222222',name:'A',organization_name:'Company'};
const b={...a,id:'33333333-3333-4333-8333-333333333333',name:'B'};
const context={token:'member',workspace:a,workspaces:[a,b]} as DashboardContext;
const sessionCursor='99999999-9999-4999-8999-999999999999';
const sessionId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const chatPath=(workspace:typeof a)=>`/organizations/${workspace.organization_id}/projects/${workspace.id}/chats`;
const sessionPath=(workspace:typeof a)=>`/workspaces/${workspace.id}/sessions`;
const taskPath=(workspace:typeof a)=>`/workspaces/${workspace.id}/tasks`;
const sessionRow=(workspace:typeof a)=>({id:sessionId,reference:'video-1001',workspace_id:workspace.id,owner:'member',category:'video' as const,title:'Active video session',revision:'1',archived:false,created_at:new Date(100).toISOString(),updated_at:new Date(300).toISOString()});
const taskRow=(workspace:typeof a)=>({id:'task-a',reference:'run-1001',kind:'video' as const,model:'Video model',state:'succeeded' as const,created_at:new Date(200).toISOString(),updated_at:new Date(200).toISOString(),session_id:null,workspace_id:workspace.id});
function respond(data:unknown,extra:Record<string,unknown>={}){return Response.json({data,...extra});}
afterEach(()=>{vi.unstubAllGlobals();clearSessionCache();});
it('loads only the active workspace with no cross-workspace or per-intent reads',async()=>{
 const calls:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(input:string)=>{
  const path=String(input);calls.push(path);
  if(path.includes(chatPath(a)))return respond([{id:'chat-a',title:'Active conversation',prompt:'A',createdAt:100}]);
  if(path.includes(sessionPath(a)))return respond([sessionRow(a)],{has_more:false,next_before:null});
  if(path.includes(taskPath(a)))return respond([taskRow(a)],{has_more:false,next_cursor:null});
  throw new Error(`Unexpected request: ${path}`);
 }));
 render(<MemoryRouter><SidebarProvider><SessionHistory context={context}/></SidebarProvider></MemoryRouter>);
 expect(await screen.findByRole('link',{name:'Active video session'})).toBeDefined();
 expect(screen.getByRole('link',{name:'Active conversation'})).toBeDefined();
 expect(screen.getByRole('link',{name:'Video · Video model'}).getAttribute('href')).toContain('/generations/runs/run-1001');
 expect(calls).toHaveLength(3);
 expect(calls.every(path=>!path.includes(b.id))).toBe(true);
 expect(calls.every(path=>!path.includes('/video/intents'))).toBe(true);
});
it('keeps a session-bound job under its saved session and falls back to the job when sessions fail',async()=>{
 let failSessions=false;
 vi.stubGlobal('fetch',vi.fn(async(input:string)=>{
  const path=String(input);
  if(path.includes(chatPath(a)))return respond([]);
  if(path.includes(sessionPath(a)))return failSessions?Response.json({error:{message:'Unavailable'}},{status:503}):respond([sessionRow(a)],{has_more:false,next_before:null});
  if(path.includes(taskPath(a)))return respond([{...taskRow(a),session_id:sessionId}],{has_more:false,next_cursor:null});
  throw new Error(`Unexpected request: ${path}`);
 }));
 const view=render(<MemoryRouter><SidebarProvider><SessionHistory context={context}/></SidebarProvider></MemoryRouter>);
 await screen.findByRole('link',{name:'Active video session'});
 expect(screen.queryByRole('link',{name:'Video · Video model'})).toBeNull();
 view.unmount();failSessions=true;
 render(<MemoryRouter><SidebarProvider><SessionHistory context={context}/></SidebarProvider></MemoryRouter>);
 expect(await screen.findByRole('link',{name:'Video · Video model'})).toBeDefined();
 expect(screen.getByRole('link',{name:'Video · Video model'}).getAttribute('href')).toContain('/generations/runs/run-1001');
});
it('switches history with the explicit active workspace instead of merging workspaces',async()=>{
 const calls:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(input:string)=>{
  const path=String(input);calls.push(path);
  if(path.includes(chatPath(a)))return respond([{id:'chat-a',title:'Workspace A conversation',prompt:'',createdAt:100}]);
  if(path.includes(chatPath(b)))return respond([{id:'chat-b',title:'Workspace B conversation',prompt:'',createdAt:200}]);
  if(path.includes(sessionPath(a))||path.includes(sessionPath(b)))return respond([],{has_more:false,next_before:null});
  if(path.includes(taskPath(a))||path.includes(taskPath(b)))return respond([],{has_more:false,next_cursor:null});
  throw new Error(`Unexpected request: ${path}`);
 }));
 const tree=(workspace:typeof a)=><MemoryRouter><SidebarProvider><SessionHistory context={{...context,workspace,workspaces:[a,b]}}/></SidebarProvider></MemoryRouter>;
 const view=render(tree(a));
 await screen.findByRole('link',{name:'Workspace A conversation'});
 expect(screen.queryByRole('link',{name:'Workspace B conversation'})).toBeNull();
 const beforeSwitch=calls.length;
 view.rerender(tree(b));
 await screen.findByRole('link',{name:'Workspace B conversation'});
 expect(screen.queryByRole('link',{name:'Workspace A conversation'})).toBeNull();
 expect(calls.slice(beforeSwitch).every(path=>!path.includes(a.id))).toBe(true);
});
it('paginates sessions and video jobs inside the active workspace',async()=>{
 const calls:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(input:string)=>{
  const path=String(input);calls.push(path);
  if(path.includes(chatPath(a)))return respond([]);
  if(path.includes(sessionPath(a))&&path.includes(`before=${sessionCursor}`))return respond([{...sessionRow(a),id:'session-old',reference:'video-1000',title:'Older video session',updated_at:new Date(50).toISOString()}],{has_more:false,next_before:null});
  if(path.includes(sessionPath(a)))return respond([sessionRow(a)],{has_more:true,next_before:sessionCursor});
  if(path.includes(taskPath(a))&&path.includes('cursor=video-next'))return respond([{...taskRow(a),id:'task-old',reference:'run-1000',model:'Older model',created_at:new Date(50).toISOString()}],{has_more:false,next_cursor:null});
  if(path.includes(taskPath(a)))return respond([taskRow(a)],{has_more:true,next_cursor:'video-next'});
  throw new Error(`Unexpected request: ${path}`);
 }));
 render(<MemoryRouter><SidebarProvider><SessionHistory context={context}/></SidebarProvider></MemoryRouter>);
 await screen.findByRole('link',{name:'Active video session'});
 await userEvent.click(screen.getByRole('button',{name:'Load more sessions'}));
 expect(await screen.findByRole('link',{name:'Older video session'})).toBeDefined();
 expect(screen.getByRole('link',{name:'Video · Older model'}).getAttribute('href')).toContain('/generations/runs/run-1000');
 expect(calls.some(path=>path.includes(sessionPath(a))&&path.includes(`before=${sessionCursor}`))).toBe(true);
 expect(calls.some(path=>path.includes(taskPath(a))&&path.includes('cursor=video-next'))).toBe(true);
 expect(calls.every(path=>!path.includes(b.id))).toBe(true);
 expect(screen.queryByRole('button',{name:'Load more sessions'})).toBeNull();
 expect(screen.queryByRole('alert')).toBeNull();
});
it('discards history that resolves after the account and workspace change',async()=>{
 let finish!:(value:Response)=>void;
 vi.stubGlobal('fetch',vi.fn(async(input:string)=>{
  const path=String(input);
  if(path.includes(chatPath(a)))return new Promise<Response>(resolve=>{finish=resolve;});
  if(path.includes(sessionPath(b)))return respond([],{has_more:false,next_before:null});
  if(path.includes(taskPath(b)))return respond([],{has_more:false,next_cursor:null});
  if(path.includes(chatPath(b)))return respond([{id:'current',title:'Current account session',prompt:'',createdAt:100}]);
  if(path.includes(sessionPath(a))||path.includes(taskPath(a)))return respond([],{has_more:false,next_before:null,next_cursor:null});
  throw new Error(`Unexpected request: ${path}`);
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
it('keeps available history when one active-workspace read fails',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(input:string)=>{
  const path=String(input);
  if(path.includes(chatPath(a)))return Response.json({error:{message:'Unavailable'}},{status:403});
  if(path.includes(sessionPath(a)))return respond([sessionRow(a)],{has_more:false,next_before:null});
  if(path.includes(taskPath(a)))return respond([taskRow(a)],{has_more:false,next_cursor:null});
  throw new Error(`Unexpected request: ${path}`);
 }));
 render(<MemoryRouter><SidebarProvider><SessionHistory context={context}/></SidebarProvider></MemoryRouter>);
 await screen.findByRole('link',{name:'Active video session'});
 expect(screen.getByRole('link',{name:'Video · Video model'}).getAttribute('href')).toContain('/generations/runs/run-1001');
 expect(screen.getByRole('alert').textContent).toBe('Some sessions could not be loaded.');
 expect(screen.queryByText('No sessions yet')).toBeNull();
});
it('aborts pagination and rejects an old page after leaving and returning to the same workspace',async()=>{
 let finish!:(value:Response)=>void;
 let signal:AbortSignal|undefined;
 vi.stubGlobal('fetch',vi.fn(async(input:string,init?:RequestInit)=>{
  const path=String(input);
  if(path.includes('before=')){signal=init?.signal??undefined;return new Promise<Response>(resolve=>{finish=resolve;});}
  if(path.includes(chatPath(a))||path.includes(chatPath(b)))return respond([]);
  if(path.includes(sessionPath(a)))return respond([],{has_more:true,next_before:sessionCursor});
  if(path.includes(sessionPath(b)))return respond([],{has_more:false,next_before:null});
  if(path.includes(taskPath(a))||path.includes(taskPath(b)))return respond([],{has_more:false,next_cursor:null});
  throw new Error(`Unexpected request: ${path}`);
 }));
 const tree=(workspace:typeof a)=><MemoryRouter><SidebarProvider><SessionHistory context={{...context,workspace,workspaces:[workspace]}}/></SidebarProvider></MemoryRouter>;
 const view=render(tree(a));
 await userEvent.click(await screen.findByRole('button',{name:'Load more sessions'}));
 await waitFor(()=>expect(finish).toBeTypeOf('function'));
 view.rerender(tree(b));expect(signal?.aborted).toBe(true);
 await waitFor(()=>expect(screen.getByText('No sessions yet')).toBeTruthy());
 view.rerender(tree(a));await screen.findByRole('button',{name:'Load more sessions'});
 await act(async()=>finish(Response.json({data:[{...sessionRow(a),id:'old-page',reference:'video-1002',title:'Outdated video session'}],has_more:false,next_before:null})));
 expect(screen.queryByRole('link',{name:'Outdated video session'})).toBeNull();
 expect(screen.getByRole('button',{name:'Load more sessions'})).toBeTruthy();
});
it('deletes a session saved input only on explicit request and restores focus',async()=>{
 const intent='55555555-5555-4555-8555-555555555555';
 const calls:Array<{path:string;method:string;body:unknown}>=[];
 vi.stubGlobal('fetch',vi.fn(async(input:string,init?:RequestInit)=>{
  const path=String(input);calls.push({path,method:init?.method??'GET',body:init?.body?JSON.parse(String(init.body)):null});
  if(init?.method==='DELETE')return Response.json({data:{id:intent,revision:2,deleted:true}});
  if(path.includes(`${sessionPath(a)}/${sessionId}`))return Response.json({data:{...sessionRow(a),turns:[{id:'turn-a',sequence:'1',created_at:new Date(100).toISOString(),content_state:'retained',instruction:{kind:'video',prompt:'Sunset prompt'},content_expires_at:new Date(200).toISOString(),intent:{id:intent,revision:'3',model:'Video model',content_state:'retained',submission_state:'dispatched',task_id:'task-a'},task_id:'task-a',task:null}]}});
  if(path.includes(chatPath(a)))return respond([]);
  if(path.includes(sessionPath(a)))return respond([sessionRow(a)],{has_more:false,next_before:null});
  if(path.includes(taskPath(a)))return respond([],{has_more:false,next_cursor:null});
  throw new Error(`Unexpected request: ${path}`);
 }));
 render(<MemoryRouter><SidebarProvider><SessionHistory context={{...context,session:{permissions:{write:true}}} as DashboardContext} currentKeys={[]}/></SidebarProvider></MemoryRouter>);
 const user=userEvent.setup();
 await screen.findByRole('link',{name:'Active video session'});
 expect(calls.some(call=>call.path.includes(`/sessions/${sessionId}`))).toBe(false);
 const actions=screen.getByRole('button',{name:'Actions for Active video session'});
 await user.click(actions);
 await user.click(screen.getByRole('menuitem',{name:'Delete saved input'}));
  await screen.findByText('Sunset prompt');
 expect(calls.filter(call=>call.path.includes(`/sessions/${sessionId}`))).toHaveLength(1);
 expect(calls.some(call=>call.path.includes('/video/intents/'))).toBe(false);
 await user.click(screen.getByRole('button',{name:'Delete input',exact:true}));
 await waitFor(()=>expect(screen.queryByRole('dialog',{name:'Delete saved video inputs'})).toBeNull());
 expect(calls.filter(call=>call.method==='DELETE')).toEqual([{path:expect.stringContaining(`/video/intents/${intent}`),method:'DELETE',body:{expected_revision:3}}]);
 expect(document.body.textContent).not.toContain(intent);
});
it('shows cached history immediately on remount and retains it if background refresh fails',async()=>{
 let fail=false;
 vi.stubGlobal('fetch',vi.fn(async(input:string)=>{
  const path=String(input);
  if(fail)return Response.json({error:{message:'Unavailable'}},{status:503});
  if(path.includes(chatPath(a)))return respond([{id:'warm-chat',title:'Cached conversation',prompt:'Saved on server',createdAt:100}]);
  if(path.includes(sessionPath(a)))return respond([],{has_more:false,next_before:null});
  if(path.includes(taskPath(a)))return respond([],{has_more:false,next_cursor:null});
  throw new Error(`Unexpected request: ${path}`);
 }));
 const show=()=>render(<MemoryRouter><SidebarProvider><SessionHistory context={{...context,workspaces:[a]}}/></SidebarProvider></MemoryRouter>);
 const first=show();await screen.findByRole('link',{name:'Cached conversation'});first.unmount();fail=true;
 const second=show();expect(screen.getByRole('link',{name:'Cached conversation'})).toBeTruthy();
 expect(screen.queryByRole('status',{name:'Loading sessions…'})).toBeNull();
 await screen.findByRole('alert');expect(screen.getByRole('link',{name:'Cached conversation'})).toBeTruthy();second.unmount();
});
it('uses compact SidebarMenuSkeleton rows for a cold history read',()=>{
 vi.stubGlobal('fetch',vi.fn(()=>new Promise(()=>{})));
 const view=render(<MemoryRouter><SidebarProvider><SessionHistory context={{...context,token:'cold-history',workspaces:[a]}}/></SidebarProvider></MemoryRouter>);
 expect(screen.getByRole('status',{name:'Loading sessions…'})).toBeTruthy();
 expect(view.container.querySelectorAll('[data-slot="sidebar-menu-skeleton"]')).toHaveLength(4);
 expect(view.container.querySelectorAll('[data-sidebar="menu-skeleton-icon"]')).toHaveLength(4);
});
it('uses a known key slug for a legacy job without publishing an unknown key reference',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(input:string)=>{
  const path=String(input);
  if(path.includes(chatPath(a)))return respond([]);
  if(path.includes(sessionPath(a)))return respond([],{has_more:false,next_before:null});
  if(path.includes(taskPath(a)))return respond([],{has_more:false,next_cursor:null});
  throw new Error(`Unexpected request: ${path}`);
 }));
 const videos=[{id:'saved-one',object:'video.job' as const,model:'Known key result',status:'succeeded' as const,created_at_ms:'300',keyId:'internal-known'}, {id:'saved-two',object:'video.job' as const,model:'Unknown key result',status:'succeeded' as const,created_at_ms:'200',keyId:'internal-unknown'}];
 render(<MemoryRouter><SidebarProvider><SessionHistory context={{...context,workspaces:[a]}} currentKeys={[{id:'internal-known',slug:'retired-review-key',revoked:true,expired:false}]} videos={videos}/></SidebarProvider></MemoryRouter>);
 const known=await screen.findByRole('link',{name:'Video · Known key result'});
 const unknown=screen.getByRole('link',{name:'Video · Unknown key result'});
 expect(new URL(known.getAttribute('href')!,'https://example.test').searchParams.get('key')).toBe('retired-review-key');
 expect(new URL(unknown.getAttribute('href')!,'https://example.test').searchParams.has('key')).toBe(false);
});
it('matches active chat and video entries by readable reference as well as internal id',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(input:string)=>{
  const path=String(input);
  if(path.includes(chatPath(a)))return respond([]);
  if(path.includes(sessionPath(a)))return respond([{id:'video-session-uuid',reference:'video-1001',workspace_id:a.id,owner:'member',category:'video',title:'Readable video session',revision:'1',archived:false,created_at:new Date(200).toISOString(),updated_at:new Date(200).toISOString()}],{has_more:false,next_before:null});
  if(path.includes(taskPath(a)))return respond([],{has_more:false,next_cursor:null});
  throw new Error(`Unexpected request: ${path}`);
 }));
 render(<MemoryRouter><SidebarProvider><SessionHistory
  context={{...context,workspaces:[a]}}
  chats={[{id:'chat-uuid',reference:'chat-1001',title:'Readable chat',prompt:'Prompt',createdAt:300}]}
  videos={[{id:'job-uuid',reference:'run-1001',object:'video.job',model:'Video model',status:'succeeded',created_at_ms:'100'}]}
  activeChat="chat-1001"
  activeVideoSession="video-1001"
  activeVideo="run-1001"
 /></SidebarProvider></MemoryRouter>);
 expect((await screen.findByRole('link',{name:'Readable video session'})).getAttribute('data-active')).toBe('true');
 expect(screen.getByRole('link',{name:'Readable chat'}).getAttribute('data-active')).toBe('true');
 expect(screen.getByRole('link',{name:'Video · Video model'}).getAttribute('data-active')).toBe('true');
});
