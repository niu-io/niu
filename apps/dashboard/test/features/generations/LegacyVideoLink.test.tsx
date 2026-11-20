import {afterEach,expect,it,vi} from 'vitest';
import {render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter,useLocation} from 'react-router';
import LegacyVideoLink from '@/features/generations/LegacyVideoLink';
import type {DashboardContext} from '@/shell/dashboard-context';
vi.mock('@/features/generations/GenerationsLayout',()=>({GenerationSessionBindings:({title}:{title:string})=><h1>{title}</h1>}));
const workspace={id:'22222222-2222-4222-8222-222222222222',organization_id:'33333333-3333-4333-8333-333333333333',slug:'review',name:'Review'};
const context={token:'member',workspace,workspaces:[workspace]} as DashboardContext;
const sessionId='11111111-1111-4111-8111-111111111111';
const turnId='44444444-4444-4444-8444-444444444444';
const taskId='77777777-7777-4777-8777-777777777777';
const intentId='55555555-5555-4555-8555-555555555555';
function session(reference:string,taskReference:string){
 return {id:sessionId,reference,workspace_id:workspace.id,owner:'fixture',category:'video',title:'Saved Video',revision:'1',archived:false,created_at:'2026-10-22T00:00:00Z',updated_at:'2026-10-22T00:00:00Z',turns:[{id:turnId,sequence:'1',created_at:'2026-10-22T00:00:00Z',content_state:'retained',instruction:{kind:'video',prompt:'Retained scene'},content_expires_at:'2027-01-01T00:00:00Z',intent:null,task_id:taskId,task:{id:taskId,reference:taskReference,kind:'video',model:'video-review',status:'succeeded',artifacts:[]}}]};
}
function LocationProbe(){const location=useLocation();return <output data-testid="location">{location.pathname+location.search+location.hash}</output>;}
afterEach(()=>vi.unstubAllGlobals());
it('redirects an old intent result link to the owning session and turn',async()=>{
 const calls:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(path:string)=>{
  calls.push(path);
  if(path.includes(`/video/intents/input-1001`))return Response.json({data:{id:intentId,reference:'input-1001',revision:'1',expires_at_ms:'1800000000000',content_state:'retained',original_key_id:'99999999-9999-4999-8999-999999999999',key_id:'99999999-9999-4999-8999-999999999999',model:'video-review',funding_mode:'customer',request:null,submission_state:'dispatched',job:{id:taskId,object:'video.job',model:'video-review',status:'succeeded'},session_binding:{session_id:sessionId,turn_id:turnId}}});
  if(path.includes(`/sessions/${sessionId}`))return Response.json({data:session('video-1001','run-1019')});
  return Response.json({data:[]});
 }));
 render(<MemoryRouter initialEntries={['/generations?workspace=review&intent=input-1001&job=run-1019&key=5de8625a-63b8-4bf4-b990-ed656180e1ef']}><LocationProbe/><LegacyVideoLink context={context} fallback={<div>legacy video result</div>}/></MemoryRouter>);
 await waitFor(()=>expect(screen.getByTestId('location').textContent).toBe('/generations/video-1001#run-1019'));
 expect(calls.some(path=>path.includes('/video/intents/input-1001'))).toBe(true);
 expect(calls.some(path=>path.includes(`/sessions/${sessionId}`))).toBe(true);
 expect(screen.getByTestId('location').textContent).not.toContain('5de8625a');
});
it('redirects an old job result link using the task session binding',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(path:string)=>{
  if(path.endsWith('/tasks/run-2001'))return Response.json({data:{id:taskId,reference:'run-2001',kind:'video',model:'video-review',state:'succeeded',created_at:'2026-10-22T00:00:00Z',updated_at:'2026-10-22T00:00:00Z',session_id:sessionId,turn_id:turnId,artifacts:[]}});
  if(path.includes(`/sessions/${sessionId}`))return Response.json({data:session('video-2001','run-2001')});
  return Response.json({data:[]});
 }));
 render(<MemoryRouter initialEntries={['/generations?workspace=review&job=run-2001']}><LocationProbe/><LegacyVideoLink context={context} fallback={<div>legacy video result</div>}/></MemoryRouter>);
 await waitFor(()=>expect(screen.getByTestId('location').textContent).toBe('/generations/video-2001#run-2001'));
});
it('keeps standalone jobs on the legacy surface when no saved session owns them',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(path:string)=>{
  if(path.endsWith('/tasks/run-3001'))return Response.json({data:{id:taskId,reference:'run-3001',kind:'video',model:'video-review',state:'succeeded',created_at:'2026-10-22T00:00:00Z',updated_at:'2026-10-22T00:00:00Z',session_id:null,turn_id:null,artifacts:[]}});
  return Response.json({data:[]});
 }));
 render(<MemoryRouter initialEntries={['/generations?workspace=review&job=run-3001']}><LocationProbe/><LegacyVideoLink context={context} fallback={<div>legacy video result</div>}/></MemoryRouter>);
 await screen.findByText('legacy video result');
 expect(screen.getByTestId('location').textContent).toBe('/generations?workspace=review&job=run-3001');
});
it('does not redirect explicit composer continuation links',async()=>{
 const fetchMock=vi.fn(async()=>Response.json({data:[]}));
 vi.stubGlobal('fetch',fetchMock);
 render(<MemoryRouter initialEntries={['/generations?intent=input-1001&compose=1']}><LocationProbe/><LegacyVideoLink context={context} fallback={<div>composer</div>}/></MemoryRouter>);
 await screen.findByText('composer');
 expect(fetchMock).not.toHaveBeenCalled();
 expect(screen.getByTestId('location').textContent).toBe('/generations?intent=input-1001&compose=1');
});
it('does not resolve an old link against a different workspace scope',async()=>{
 const second={...workspace,id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',slug:'second',name:'Second'};
 const fetchMock=vi.fn(async()=>Response.json({data:[]}));
 vi.stubGlobal('fetch',fetchMock);
 render(<MemoryRouter initialEntries={['/generations?workspace=second&intent=input-1001']}><LocationProbe/><LegacyVideoLink context={{...context,workspaces:[workspace,second]} as DashboardContext} fallback={<div>legacy video result</div>}/></MemoryRouter>);
 await new Promise(resolve=>setTimeout(resolve,20));
 expect(fetchMock).not.toHaveBeenCalled();
 expect(screen.queryByText('legacy video result')).toBeNull();
 expect(screen.getByTestId('location').textContent).toBe('/generations?workspace=second&intent=input-1001');
});
it('falls back when the old result is unauthorized or no longer resolvable',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({error:{message:'Not found'}},{status:404})));
 render(<MemoryRouter initialEntries={['/generations?workspace=review&intent=input-9999']}><LocationProbe/><LegacyVideoLink context={context} fallback={<div>legacy video result</div>}/></MemoryRouter>);
 await screen.findByText('legacy video result');
 expect(screen.getByTestId('location').textContent).toBe('/generations?workspace=review&intent=input-9999');
});
