import {afterEach,expect,it,vi} from 'vitest';
import {render,screen,waitFor,cleanup} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter} from 'react-router';
import CustomerSetup from '../../../src/features/customers/setup';
import type {NiuAdminClient} from '@niu-io/sdk/admin';
const company={id:'10000000-0000-4000-8000-000000000001',name:'Example customer'};
const owner={id:'30000000-0000-4000-8000-000000000001',name:'Alex',organization_id:company.id,project_id:null,role:'owner',revoked:false};
function fixture(owners:unknown[]=[]){vi.stubGlobal('fetch',vi.fn(async(input)=>String(input).startsWith('/api/v1/operators?')?Response.json({data:owners,next_cursor:null}):Response.json({password_login:true})));}
function client(){return {listWorkspaces:vi.fn().mockResolvedValue({data:[]}),createOperatorIdentity:vi.fn(),createWorkspace:vi.fn(),getMemberPasswordConfiguration:vi.fn().mockResolvedValue({configured:false,email:null,revision:null}),setMemberPassword:vi.fn()};}
function show(api:ReturnType<typeof client>){return render(<MemoryRouter><CustomerSetup company={company} token="test" client={api as unknown as NiuAdminClient} onClose={()=>{}} onWorkspaceCreated={()=>{}}/></MemoryRouter>);}
afterEach(()=>{cleanup();sessionStorage.clear();vi.unstubAllGlobals();});
it('recovers owner creation after reopening with the same request and no temporary credential',async()=>{
 fixture();const api=client();api.createOperatorIdentity.mockRejectedValueOnce(new Error('Lost response')).mockResolvedValueOnce({operator:owner,session:null,token:null});const user=userEvent.setup();
 const first=show(api);await user.type(await screen.findByLabelText('Owner name'),'Alex');await user.click(screen.getByRole('button',{name:'Create owner'}));await screen.findByText(/Owner creation could not be confirmed/);
 const original=api.createOperatorIdentity.mock.calls[0];first.unmount();show(api);
 await user.click(await screen.findByRole('button',{name:'Retry owner creation'}));await screen.findByText('Password sign-in is not configured yet.');
 expect(api.createOperatorIdentity.mock.calls[1]).toEqual(original);expect(original[0]).toMatchObject({organization_id:company.id,project_id:null,role:'owner',name:'Alex'});
 expect(sessionStorage.getItem('niu:customer-setup:owner:'+company.id)).toBeNull();expect(screen.queryByText(owner.id)).toBeNull();
});
it('preserves an edited slug and reuses the workspace creation key after uncertainty',async()=>{
 fixture();const api=client();api.createWorkspace.mockRejectedValueOnce(new Error('Lost response')).mockResolvedValueOnce({id:'20000000-0000-4000-8000-000000000001',organization_id:company.id,name:'客户测试',slug:'customer-api'});show(api);const user=userEvent.setup();
 await user.type(await screen.findByLabelText('Workspace name'),'客户');expect((screen.getByLabelText('Slug') as HTMLInputElement).value).toBe('ke-hu');await user.clear(screen.getByLabelText('Slug'));await user.type(screen.getByLabelText('Slug'),'customer-api');await user.type(screen.getByLabelText('Workspace name'),'测试');expect((screen.getByLabelText('Slug') as HTMLInputElement).value).toBe('customer-api');
 await user.click(screen.getByRole('button',{name:'Create workspace'}));await screen.findByText(/Creation is unconfirmed/);await user.click(screen.getByRole('button',{name:'Retry creation'}));await screen.findByRole('link',{name:'客户测试'});expect(api.createWorkspace.mock.calls[1]).toEqual(api.createWorkspace.mock.calls[0]);
});
it('requires refreshed saved revision and a new explicit password after an uncertain reset',async()=>{
 fixture([owner]);const api=client();api.getMemberPasswordConfiguration.mockResolvedValueOnce({configured:true,email:'alex@example.test',revision:1}).mockResolvedValueOnce({configured:true,email:'alex@example.test',revision:2});api.setMemberPassword.mockRejectedValueOnce(new Error('Lost response')).mockResolvedValueOnce({revision:3});show(api);const user=userEvent.setup();
 await user.click(await screen.findByRole('button',{name:'Reset password'}));await user.type(await screen.findByLabelText('New password'),'synthetic first password');await user.click(screen.getByRole('button',{name:'Reset password'}));await screen.findByText(/The password save could not be confirmed/);expect((screen.getByRole('button',{name:'Reset password'}) as HTMLButtonElement).disabled).toBe(true);expect(api.setMemberPassword).toHaveBeenCalledTimes(1);
 await user.click(screen.getByRole('button',{name:'Reload configuration'}));await user.click(await screen.findByRole('button',{name:'Reset password'}));await waitFor(()=>expect((screen.getByLabelText('New password') as HTMLInputElement).disabled).toBe(false));expect((screen.getByLabelText('New password') as HTMLInputElement).value).toBe('');await user.type(screen.getByLabelText('New password'),'synthetic second password');await user.click(screen.getByRole('button',{name:'Reset password'}));await screen.findByRole('status');expect(api.setMemberPassword.mock.calls.map(call=>call[1].expected_revision)).toEqual([1,2]);expect(JSON.stringify(sessionStorage)).not.toContain('synthetic');
});
it('routes a payment prerequisite failure to setup without showing empty customer forms',async()=>{
 fixture();const api=client();api.listWorkspaces.mockRejectedValue(Object.assign(new Error('Payment setup required'),{responseBody:{error:{type:'payment_setup_required',code:'currency_required'}}}));show(api);
 const link=await screen.findByRole('link',{name:'Configure platform currency'});expect(link.getAttribute('href')).toBe('/admin/settings');expect(screen.queryByLabelText('Workspace name')).toBeNull();expect(screen.queryByLabelText('Owner name')).toBeNull();
});
it('allows correcting a taken slug without replaying a definitively rejected creation',async()=>{
 fixture();const api=client();api.createWorkspace.mockRejectedValueOnce(Object.assign(new Error('This slug is already in use. Choose a different slug.'),{status:409,responseBody:{error:{type:'workspace_slug_taken'}}})).mockResolvedValueOnce({id:'20000000-0000-4000-8000-000000000001',organization_id:company.id,name:'Customer',slug:'customer-team'});show(api);const user=userEvent.setup();
 await user.type(await screen.findByLabelText('Workspace name'),'Customer');await user.click(screen.getByRole('button',{name:'Create workspace'}));await screen.findByText(/This slug is already in use/);expect((screen.getByLabelText('Slug') as HTMLInputElement).disabled).toBe(false);await user.clear(screen.getByLabelText('Slug'));await user.type(screen.getByLabelText('Slug'),'customer-team');expect(screen.queryByText(/This slug is already in use/)).toBeNull();await user.click(screen.getByRole('button',{name:'Create workspace'}));await screen.findByRole('link',{name:'Customer'});expect(api.createWorkspace.mock.calls[1][1].idempotencyKey).not.toBe(api.createWorkspace.mock.calls[0][1].idempotencyKey);expect(api.createWorkspace.mock.calls[1][0].slug).toBe('customer-team');
});
