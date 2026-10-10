import { useState } from 'react';
import { Button } from '../../src/components/ui/button';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, Link } from 'react-router';
import { SidebarProvider } from '../../src/components/ui/sidebar';
import AccountMenu from '../../src/app/AccountMenu';
import SettingsPage, { SettingsDialog, SettingsNavigation, settingsReturnDestination } from '../../src/features/account/settings-page';
import type { DashboardContext } from '../../src/app/dashboard-context';
let current: DashboardContext;
vi.mock('../../src/app/dashboard-context',()=>({useDashboardContext:()=>current}));
const organization={id:'11111111-1111-4111-8111-111111111111',name:'Example company'};
function context(projectId:string|null=null):DashboardContext {
 return {token:'fixture',organization,organizations:[organization],workspace:null,workspaces:[],workspaceLoading:false,session:{kind:'operator',operator:{id:'member',role:'owner',project_id:projectId},permissions:{read:true,write:true,manage_operators:true}},signOut:vi.fn(),selectOrganization:vi.fn()} as unknown as DashboardContext;
}
function view(path='/settings/appearance') {return <MemoryRouter initialEntries={[path]}><SidebarProvider><SettingsNavigation context={current}/></SidebarProvider><Link to="/settings/account">Account section</Link><Link to="/settings/appearance">Appearance section</Link><Link to="/settings/billing">Billing section</Link><Routes><Route path="/settings/:section" element={<SettingsPage/>}/></Routes></MemoryRouter>;}
function mockRequests() {const fetcher=vi.fn(async(input:RequestInfo|URL)=>String(input)==='/admin/v1/auth/profile'?Response.json({data:{name:'Member',email:null,avatar_data_url:null,revision:0}}):Response.json({password_login:false,data:[]}));vi.stubGlobal('fetch',fetcher);return fetcher;}
describe('global settings routes',()=>{
 it('does not report a permission denial while an authorized billing account loads',()=>{
  current={...context(),organization:null,organizations:[],workspaceLoading:true};mockRequests();
  const rendered=render(view('/settings/billing'));
  expect(screen.getByRole('status').textContent).toContain('Loading billing account');
  expect(screen.queryByText(/billing is available to organization owners/)).toBeNull();
  const reload=vi.fn();current={...current,workspaceLoading:false,reloadWorkspaces:reload};
  rendered.rerender(view('/settings/billing'));
  expect(screen.getByRole('alert').textContent).toContain('Could not load your billing account');
  expect(screen.queryByText(/billing is available to organization owners/)).toBeNull();
 });
 it('returns focus to the visible navigation trigger when Settings closes',async()=>{
  current=context();mockRequests();
  function Fixture(){const [open,setOpen]=useState(true);return <MemoryRouter><Button aria-label="Account menu" ref={node=>{if(node)node.getClientRects=()=>[] as unknown as DOMRectList;}}>Account</Button><Button className="sidebar-toggle" aria-label="Expand workspace navigation" ref={node=>{if(node)node.getClientRects=()=>[{}] as unknown as DOMRectList;}}>Navigation</Button>{open&&<SettingsDialog context={current} section="appearance" onClose={()=>setOpen(false)}/>}</MemoryRouter>;}
  render(<Fixture/>);await userEvent.setup().keyboard('{Escape}');
  await waitFor(()=>expect(document.activeElement).toBe(screen.getByRole('button',{name:'Expand workspace navigation'})));
 });
 it('accepts only local product destinations for closing Settings',()=>{
  expect(settingsReturnDestination('/chat?workspace=demo#reply','/workspaces/default')).toBe('/chat?workspace=demo#reply');
  for(const value of ['//evil.invalid','https://evil.invalid','/settings/account','/login','/installation','/\\evil.invalid']) expect(settingsReturnDestination(value,'/workspaces/default')).toBe('/workspaces/default');
 });
 it('closes to the originating product route with its query and hash',async()=>{
  current=context();mockRequests();render(<MemoryRouter initialEntries={[{pathname:'/settings/appearance',state:{settingsReturnTo:'/chat?workspace=demo#reply'}}]}><Routes><Route path="/settings/:section" element={<SettingsPage/>}/><Route path="/chat" element={<p>Chat restored</p>}/></Routes></MemoryRouter>);
  await userEvent.setup().click(screen.getByRole('button',{name:'Close',exact:true}));
  expect(await screen.findByText('Chat restored')).toBeTruthy();
 });
 it('shows the signed-in account identity rather than its permission role',async()=>{
  current=context();current.session!.profile={name:'Demo',email:'demo@niu.io',avatar_data_url:null,revision:0};
  render(<MemoryRouter><SidebarProvider><AccountMenu context={current} workspacePath="/workspaces/default"/></SidebarProvider></MemoryRouter>);
  await userEvent.setup().click(screen.getByRole('button',{name:'Account menu'}));
  expect(screen.getByText('Demo',{exact:true})).toBeTruthy();
  expect(screen.getByText('demo@niu.io',{exact:true})).toBeTruthy();
  expect(screen.queryByText('Owner',{exact:true})).toBeNull();
  expect(screen.queryByText('Platform administrator',{exact:true})).toBeNull();
 });

 it('links to Settings over the current product page',async()=>{
  current=context();mockRequests();render(<MemoryRouter><SidebarProvider><AccountMenu context={current} workspacePath="/workspaces/default"/></SidebarProvider><Routes><Route path="/settings/:section" element={<SettingsPage/>}/><Route path="/" element={null}/></Routes></MemoryRouter>);
  const user=userEvent.setup();await user.click(screen.getByRole('button',{name:'Account menu'}));
  expect(screen.getByRole('menuitem',{name:'Settings',exact:true}).getAttribute('href')).toBe('/?settings=account');
  expect(screen.getByRole('menuitem',{name:'Settings',exact:true})).toBeTruthy();
 });
 it('opens usable appearance settings for installation administrators',async()=>{
  current={...context(),session:{kind:'installation',operator:null}} as DashboardContext;
  render(view('/settings/account'));
  expect(await screen.findByRole('button',{name:'Color mode'})).toBeTruthy();
  expect(screen.queryByRole('form',{name:'Profile'})).toBeNull();
 });
 it('changes appearance using the installed menu',async()=>{
  current=context();mockRequests();render(view());const user=userEvent.setup();
  await user.click(screen.getByRole('button',{name:'Color mode'}));await user.click(screen.getByRole('menuitemradio',{name:'Dark',exact:true}));
  expect(screen.getByRole('button',{name:'Color mode'}).textContent).toContain('Dark');
 });
 it('does not request organization funds for workspace-scoped owners',async()=>{
  current=context('scoped-workspace');const fetcher=mockRequests();render(view('/settings/billing'));
  expect(screen.getByText(/billing is available to organization owners/)).toBeTruthy();
  await waitFor(()=>expect(fetcher.mock.calls.length).toBeGreaterThan(0));
  expect(fetcher.mock.calls.some(call=>String(call[0]).includes('/billing/'))).toBe(false);
 });
 it('keeps procurement controls out of installation billing',async()=>{
  current={...context(),session:{kind:'installation',operator:null,permissions:{read:true,write:true}}} as DashboardContext;
  const fetcher=mockRequests();render(view('/settings/billing'));
  expect(await screen.findByText(/No prepaid account configured/)).toBeTruthy();
  expect(screen.queryByRole('button',{name:'Publish selling rate'})).toBeNull();
  expect(fetcher.mock.calls.some(call=>String(call[0]).includes('/media-rates'))).toBe(false);
  expect(document.body.textContent).not.toContain(organization.id);
 });
 it('preserves an unfinished profile edit across sections',async()=>{
  current=context();const fetcher=mockRequests();render(view('/settings/account'));const user=userEvent.setup();
  const name=screen.getByLabelText('Display name') as HTMLInputElement;await waitFor(()=>expect(name.disabled).toBe(false));
  await user.clear(name);await user.type(name,'Unfinished edit');await user.click(screen.getByRole('link',{name:'About',exact:true}));expect(screen.queryByRole('form',{name:'Profile'})).toBeNull();await user.click(screen.getByRole('link',{name:'Appearance',exact:true}));expect(screen.queryByRole('form',{name:'Profile'})).toBeNull();
  await user.click(screen.getByRole('link',{name:'Account',exact:true}));expect((screen.getByLabelText('Display name') as HTMLInputElement).value).toBe('Unfinished edit');
  expect(fetcher.mock.calls.filter(call=>String(call[0])==='/admin/v1/auth/profile')).toHaveLength(1);
 });
 it('clears drafts when the signed-in member changes',async()=>{
  current=context();mockRequests();const rendered=render(view('/settings/account'));const user=userEvent.setup();
  const name=screen.getByLabelText('Display name') as HTMLInputElement;await waitFor(()=>expect(name.disabled).toBe(false));await user.clear(name);await user.type(name,'Private draft');
  current={...current,session:{...current.session!,operator:{...current.session!.operator!,id:'second-member'}}};rendered.rerender(view('/settings/account'));
  await waitFor(()=>expect((screen.getByLabelText('Display name') as HTMLInputElement).value).toBe('Member'));
 });
});
