import {afterEach,expect,it,vi} from 'vitest';
import {render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter,useLocation} from 'react-router';
import VideoSessionView from '@/features/generations/VideoSessionView';
import type {DashboardContext} from '@/app/dashboard-context';
vi.mock('@/app/branding',()=>({useBranding:()=>({settings:{display_name:'Niu'}})}));
vi.mock('@/features/generations/GenerationsLayout',()=>({GenerationSessionBindings:({title}:{title:string})=><h1>{title}</h1>}));
const id='11111111-1111-4111-8111-111111111111';
const workspace={id:'22222222-2222-4222-8222-222222222222',organization_id:'33333333-3333-4333-8333-333333333333',slug:'review',name:'Review'};
const context={token:'member',workspace,workspaces:[workspace]} as DashboardContext;
const data={id,reference:'video-1001',workspace_id:workspace.id,owner:'fixture',category:'video',title:'Saved Video',revision:'1',archived:false,turns:[]};
afterEach(()=>vi.unstubAllGlobals());
function RouteView(){const location=useLocation();return <><output data-testid="location">{location.search+location.hash}</output><VideoSessionView context={context} id={new URLSearchParams(location.search).get('video-session')!}/></>;}
it.each([id,'video-1001'])('opens and canonicalizes an authorized Video session %s',async reference=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({data})));
 render(<MemoryRouter initialEntries={[`/generations?workspace=review&video-session=${reference}&keep=1#saved`]}><RouteView/></MemoryRouter>);
 await screen.findByRole('heading',{name:'Saved Video'});
 await waitFor(()=>expect(screen.getByTestId('location').textContent).toBe('?workspace=review&video-session=video-1001&keep=1#saved'));
 expect(screen.getByText('No instructions have been saved in this session.')).toBeTruthy();
 expect(vi.mocked(fetch).mock.calls.every(([,init])=>!init?.method||init.method==='GET')).toBe(true);
});
it('rejects a response for a different saved session',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({data:{...data,id:'44444444-4444-4444-8444-444444444444',reference:'video-9999'}})));
 render(<MemoryRouter initialEntries={['/generations?video-session=video-1001']}><RouteView/></MemoryRouter>);
 expect((await screen.findByRole('alert')).textContent).toContain('could not be loaded');
 expect(screen.queryByRole('heading',{name:'Saved Video'})).toBeNull();
});
it('links saved turns using public input/run references without redundant internal context',async()=>{
 const turn={id:'44444444-4444-4444-8444-444444444444',sequence:'1',created_at:'2026-10-22T00:00:00Z',content_state:'retained',instruction:{kind:'video',prompt:'Retained scene'},content_expires_at:'2027-01-01T00:00:00Z',task_id:null,task:null,intent:{id:'55555555-5555-4555-8555-555555555555',reference:'input-1001',revision:'1',model:'video',content_state:'retained',submission_state:'saved',task_id:null}};
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({data:{...data,turns:[turn,{...turn,id:'66666666-6666-4666-8666-666666666666',intent:null,task_id:'77777777-7777-4777-8777-777777777777',task:{id:'77777777-7777-4777-8777-777777777777',reference:'run-1001',kind:'video',model:'video',status:'succeeded',artifacts:[]}}]}})));
 render(<MemoryRouter initialEntries={['/generations?video-session=video-1001']}><RouteView/></MemoryRouter>);
 expect((await screen.findByRole('link',{name:'Open saved request'})).getAttribute('href')).toBe('/generations?workspace=review&intent=input-1001');
 expect(screen.getByRole('link',{name:'Open saved video'}).getAttribute('href')).toBe('/generations?workspace=review&job=run-1001');
});
