import {afterEach,expect,it,vi} from 'vitest';
import {render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter,useLocation} from 'react-router';
import VideoSessionView from '@/features/generations/VideoSessionView';
import type {DashboardContext} from '@/shell/dashboard-context';
vi.mock('@/shell/branding',()=>({useBranding:()=>({settings:{display_name:'Niu'}})}));
vi.mock('@/features/generations/GenerationsLayout',()=>({GenerationSessionBindings:({title}:{title:string})=><h1>{title}</h1>}));
const id='11111111-1111-4111-8111-111111111111';
const workspace={id:'22222222-2222-4222-8222-222222222222',organization_id:'33333333-3333-4333-8333-333333333333',slug:'review',name:'Review'};
const context={token:'member',workspace,workspaces:[workspace]} as DashboardContext;
const data={id,reference:'video-1001',workspace_id:workspace.id,owner:'fixture',category:'video',title:'Saved Video',revision:'1',archived:false,turns:[]};
const taskId='77777777-7777-4777-8777-777777777777';
const turnId='44444444-4444-4444-8444-444444444444';
const intentId='55555555-5555-4555-8555-555555555555';
const task={id:taskId,reference:'run-1001',kind:'video',model:'video-review',model_display_name:null,execution_context:{submitted_model:'video-review',dispatched_model:null,provider:null,channel:null,dispatched_at:'2026-10-22T00:00:00Z',source:'saved_execution',parameters:null,parameters_source:'unknown',references_state:'not_in_execution_snapshot'},created_at:'2026-10-22T00:00:00Z',updated_at:'2026-10-22T00:01:00Z',state:'succeeded',source:'generations',session_id:id,turn_id:turnId,artifacts:[{kind:'video',availability:'available',capture:null}]};
const taskTurn={id:turnId,sequence:'1',created_at:'2026-10-22T00:00:00Z',content_state:'retained',instruction:{kind:'video',prompt:'Retained scene'},content_expires_at:'2027-01-01T00:00:00Z',task_id:taskId,task:{id:taskId,reference:'run-1001',kind:'video',model:'video-review',status:'succeeded',artifacts:[]},intent:{id:intentId,reference:'input-1001',revision:'1',model:'video-review',content_state:'retained',submission_state:'dispatched',task_id:taskId}};
const savedTurn={id:'66666666-6666-4666-8666-666666666666',sequence:'2',created_at:'2026-10-22T00:02:00Z',content_state:'retained',instruction:{kind:'video',prompt:'Waiting request'},content_expires_at:'2027-01-01T00:00:00Z',task_id:null,task:null,intent:{id:'88888888-8888-4888-8888-888888888888',reference:'input-1002',revision:'1',model:'video-review',content_state:'retained',submission_state:'saved',task_id:null}};
afterEach(()=>vi.unstubAllGlobals());
function RouteView(){
  const location=useLocation();
  const pathSession=/^\/generations\/([^/?#]+)\/?$/.exec(location.pathname)?.[1];
  const sessionId=(pathSession ? decodeURIComponent(pathSession) : null) ?? new URLSearchParams(location.search).get('video-session')!;
  return <><output data-testid="location">{location.pathname+location.search+location.hash}</output><VideoSessionView context={context} id={sessionId}/></>;
}
function savedFetch(session:unknown= data, options:{sessionStatus?:number}={}){
 const calls:Array<{path:string;method:string}>=[];
 vi.stubGlobal('fetch',vi.fn(async(path:string,init?:RequestInit)=>{
  const method=init?.method??'GET';calls.push({path,method});
  if(path.endsWith('/keys'))return Response.json({data:[{id:'99999999-9999-4999-8999-999999999999',name:'Review key',allowed_models:['*'],revoked:false,expired:false}]});
  if(path.includes('/sessions/'))return options.sessionStatus&&options.sessionStatus!==200 ? Response.json({error:{message:'Not found'}},{status:options.sessionStatus}):Response.json({data:session});
  if(path.endsWith(`/tasks/${taskId}`))return Response.json({data:task});
  if(path.endsWith('/tasks/run-1001'))return Response.json({data:task});
  if(path.endsWith(`/tasks/${taskId}/diagnostics`))return Response.json({billing:{mode:'customer',state:'settled',currency:null,reserved_nanos:null,charge_nanos:null,usage:null,settled_usage:null,bound_exceeded:null,effective_output:null,estimate:null,price:null},timings:{data:[],has_more:false}});
  if(path.endsWith(`/artifacts/${taskId}/video/content`))return new Response(new Uint8Array([0,0,0,12,102,116,121,112,105,115,111,109]),{headers:{'content-type':'video/mp4'}});
  return Response.json({data:[]});
 }));
 return calls;
}
it.each([id,'video-1001'])('opens and canonicalizes an authorized Video session %s',async reference=>{
 vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:session');
 const calls=savedFetch();
 render(<MemoryRouter initialEntries={[`/generations?workspace=review&video-session=${reference}&keep=1#saved`]}><RouteView/></MemoryRouter>);
 await screen.findByRole('heading',{name:'Saved Video'});
 await waitFor(()=>expect(screen.getByTestId('location').textContent).toBe('/generations/video-1001?keep=1#saved'));
 expect(screen.getByText('No instructions have been saved in this session.')).toBeTruthy();
 expect(calls.every(call=>call.method==='GET')).toBe(true);
});
it('rejects a response for a different saved session',async()=>{
 savedFetch({...data,id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',reference:'video-9999'});
 render(<MemoryRouter initialEntries={['/generations?video-session=video-1001']}><RouteView/></MemoryRouter>);
 expect((await screen.findByRole('alert')).textContent).toContain('could not be loaded');
 expect(screen.queryByRole('heading',{name:'Saved Video'})).toBeNull();
});
it('renders each saved turn and its video result without a per-turn hop',async()=>{
 vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:saved-video');
 const calls=savedFetch({...data,turns:[taskTurn,savedTurn]});
 render(<MemoryRouter initialEntries={['/generations?video-session=video-1001']}><RouteView/></MemoryRouter>);
 await screen.findByRole('heading',{name:'Saved Video'});
 expect((await screen.findAllByText('Retained scene')).length).toBeGreaterThan(0);
 await screen.findByRole('link',{name:'Download'});
 expect(screen.getByLabelText('Generated video')).toBeTruthy();
 expect(screen.getByText('Succeeded')).toBeTruthy();
 expect(document.getElementById('run-1001')).toBeTruthy();
 expect(document.getElementById('input-1002')).toBeTruthy();
 expect(screen.queryByRole('link',{name:'Open saved video'})).toBeNull();
 expect(screen.queryByRole('link',{name:'Open saved request'})).toBeNull();
 const resume=screen.getByRole('link',{name:'Continue saved request'});
 expect(resume.getAttribute('href')).toBe('/generations?intent=input-1002&compose=1');
 expect(screen.getByRole('link',{name:'Edit request'}).getAttribute('href')).toBe('/generations?intent=input-1001&compose=1');
 expect(screen.getByText('This saved request has not been submitted.')).toBeTruthy();
 expect(calls.some(call=>call.path.endsWith('/tasks/run-1001'))).toBe(true);
 expect(calls.some(call=>call.path.includes(taskId)&&call.path.endsWith('/video/content'))).toBe(true);
});
it('focuses and marks the referenced turn when navigating to a session anchor',async()=>{
 vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:anchored-video');
 savedFetch({...data,turns:[taskTurn]});
 render(<MemoryRouter initialEntries={['/generations/video-1001#run-1001']}><RouteView/></MemoryRouter>);
 const result=await screen.findByRole('article',{name:'Video result'});
 const target=result.closest('.video-turn')!;
 await waitFor(()=>expect(document.activeElement).toBe(target));
 expect(target.className).toContain('video-turn-target');
});
it('keeps workspace authorization failures on the session surface',async()=>{
 savedFetch(data,{sessionStatus:403});
 render(<MemoryRouter initialEntries={['/generations/video-1001']}><RouteView/></MemoryRouter>);
 expect((await screen.findByRole('alert')).textContent).toContain('Check workspace access');
});
it('asks for a workspace instead of loading a session without one',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({data:[]})));
 render(<MemoryRouter initialEntries={['/generations/video-1001']}><VideoSessionView context={{...context,workspace:null,workspaces:[]} as DashboardContext} id="video-1001"/></MemoryRouter>);
 expect((await screen.findByRole('alert')).textContent).toContain('Select a workspace');
});
