import GenerationsLayout from '@/features/generations/GenerationsLayout';
import { beforeEach, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, createMemoryRouter, RouterProvider } from 'react-router';
import { SidebarProvider } from '@/components/ui/sidebar';
import GenerationsRouteLayout from '@/features/generations/layout';
import PlaygroundRoute from '@/features/playground/page';
const catalog=vi.hoisted(()=>({models:[] as Array<{id:string;public_catalog:boolean;catalog?:{output_modalities:string[]};generation_capabilities?:{chat:boolean|null;video:boolean|null}}> }));
beforeEach(()=>{catalog.models=[];});
vi.mock('@/app/dashboard-context', () => ({ useDashboardContext: () => ({ token: 'member', models: catalog.models, workspace: { id: 'workspace', slug:'review-workspace', name:'Review workspace', organization_id: 'organization' } }) }));
vi.mock('@/app/useModelPopularity', () => ({ useModelPopularity: () => ({ models: catalog.models }) }));
vi.mock('@/features/generations/SessionHistory',()=>({default:()=>null}));
vi.mock('@/features/video/VideoView', () => ({ default: () => <h1>Video session</h1> }));
vi.mock('@/features/playground/components/PlaygroundView', () => ({ default: ({models,unverifiedModels}:{models:string[];unverifiedModels:string[]}) => <><h1>Chat session</h1><output aria-label="Chat choices">{models.join(',')}</output><output aria-label="Unverified choices">{unverifiedModels.join(',')}</output></> }));
it.each([
  ['/generations?session=chat', 'Chat session'],
  ['/generations?intent=saved-input', 'Video session'],
  ['/generations?job=saved-result', 'Video session'],
  ['/generations?new=video', 'Video session'],
  ['/generations?mode=video&session=chat', 'Chat session'],
])('resolves %s by the session reference or new session type', (url, heading) => {
  render(<MemoryRouter initialEntries={[url]}><SidebarProvider><PlaygroundRoute /></SidebarProvider></MemoryRouter>);
  expect(screen.getByRole('heading', { name: heading })).toBeTruthy();
});

it('keeps the parent route sidebar and title region mounted while the session type changes', async () => {
  const router = createMemoryRouter([{ path: '/generations', Component: GenerationsRouteLayout, children: [{ index: true, Component: PlaygroundRoute }] }], { initialEntries: ['/generations?session=chat'] });
  const { container } = render(<SidebarProvider><RouterProvider router={router} /></SidebarProvider>);
  await screen.findByRole('heading', { name: 'Chat session' });
  const sidebar = container.querySelector('#generation-history');
  const toolbar = container.querySelector('.generations-toolbar');
  const newButton = screen.getByRole('button', { name: 'New generation' });
  await act(() => router.navigate('/generations?intent=video'));
  await screen.findByRole('heading', { name: 'Video session' });
  expect(container.querySelector('#generation-history')).toBe(sidebar);
  expect(container.querySelector('.generations-toolbar')).toBe(toolbar);
  expect(screen.getByRole('button', { name: 'New generation' })).toBe(newButton);
  expect(container.querySelectorAll('#generation-history')).toHaveLength(1);
  await act(() => router.navigate('/generations?session=chat'));
  expect(container.querySelector('#generation-history')).toBe(sidebar);
  expect(container.querySelector('.generations-toolbar')).toBe(toolbar);
});

it('keeps catalog and Chat choices aligned with current configuration while retaining unknown legacy choices explicitly',()=>{
 catalog.models=[
  {id:'actual-video',public_catalog:false,catalog:{output_modalities:['text']},generation_capabilities:{chat:false,video:true}},
  {id:'actual-text',public_catalog:false,catalog:{output_modalities:['video']},generation_capabilities:{chat:true,video:false}},
  {id:'legacy',public_catalog:false,catalog:{output_modalities:['text']},generation_capabilities:{chat:null,video:false}},
 ];
 render(<MemoryRouter><SidebarProvider><PlaygroundRoute/></SidebarProvider></MemoryRouter>);
 expect(screen.getByLabelText('Chat choices').textContent).toBe('actual-text,legacy');
 expect(screen.getByLabelText('Unverified choices').textContent).toBe('legacy');
});

it('does not silently substitute another Chat model for an old Video-model link',()=>{
 catalog.models=[{id:'example/video',public_catalog:false,catalog:{output_modalities:['text']},generation_capabilities:{chat:false,video:true}},{id:'other-text',public_catalog:false,generation_capabilities:{chat:true,video:false}}];
 render(<MemoryRouter initialEntries={['/generations?model=example%2Fvideo']}><SidebarProvider><GenerationsLayout><PlaygroundRoute/></GenerationsLayout></SidebarProvider></MemoryRouter>);
 expect(screen.queryByRole('heading',{name:'Chat session'})).toBeNull();
 expect(screen.getByRole('link',{name:'Open in Video'}).getAttribute('href')).toContain('new=video&model=example%2Fvideo');
 expect(screen.getByRole('link',{name:'Choose a model'})).toBeTruthy();
 expect(screen.getByRole('heading',{name:'Video model'})).toBeTruthy();
});
it('does not silently substitute another model when a bookmarked model is no longer available',()=>{
 catalog.models=[{id:'other-text',public_catalog:false,generation_capabilities:{chat:true,video:false}}];
 render(<MemoryRouter initialEntries={['/generations?model=retired']}><SidebarProvider><GenerationsLayout><PlaygroundRoute/></GenerationsLayout></SidebarProvider></MemoryRouter>);
 expect(screen.queryByRole('heading',{name:'Chat session'})).toBeNull();
 expect(screen.queryByRole('link',{name:'Open in Video'})).toBeNull();
 expect(screen.getByText('This model is unavailable in Chat')).toBeTruthy();
});

it('keeps saved Chat history readable when an old URL also names an unavailable model',()=>{
 render(<MemoryRouter initialEntries={['/generations?session=saved-chat&model=retired']}><SidebarProvider><PlaygroundRoute/></SidebarProvider></MemoryRouter>);
 expect(screen.getByRole('heading',{name:'Chat session'})).toBeTruthy();
 expect(screen.queryByText('This model is unavailable in Chat')).toBeNull();
});
