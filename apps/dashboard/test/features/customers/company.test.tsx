import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter} from 'react-router';
import {NiuAdminClient} from '@niu-io/sdk/admin';
import {Customers} from '../../../app/features/customers/page';
import {clearSessionCache} from '../../../app/lib/query-cache';

vi.mock('@/shell/platform-currency',()=>({usePlatformCurrency:()=>({currency:'USD',ready:true,error:null})}));
afterEach(()=>{cleanup();clearSessionCache();sessionStorage.clear();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('preserves the original request on retry and requires explicit acknowledgement before creating with an edited name',async()=>{
 const create=vi.spyOn(NiuAdminClient.prototype,'createCompany').mockRejectedValueOnce(new Error('Lost response')).mockRejectedValueOnce(new Error('Lost response again')).mockResolvedValueOnce({id:'10000000-0000-4000-8000-000000000001',name:'Acme revised'} as never);
 vi.stubGlobal('fetch',vi.fn(async input=>{
  const url=String(input);
  if(url.includes('/platform/customer-accounts'))return Response.json({data:[],next_after:null});
  if(url.includes('/workspaces'))return Response.json({data:[],next_cursor:null});
  if(url.includes('/operators'))return Response.json({data:[],next_cursor:null});
  if(url.includes('/auth/config'))return Response.json({password_login:true});
  throw new Error('Unexpected '+url);
 }));
 const user=userEvent.setup();render(<MemoryRouter><Customers token="company-create-test" canSetup onWorkspaceCreated={()=>{}}/></MemoryRouter>);
 await user.click((await screen.findAllByRole('button',{name:'New customer'}))[0]);
 await user.type(screen.getByLabelText('Company name'),'Acme');await user.click(screen.getByRole('button',{name:'Create company'}));
 await screen.findByText(/Creation could not be confirmed/);await user.click(screen.getByRole('button',{name:'Retry creation'}));
 await screen.findByText(/Creation could not be confirmed/);expect(create.mock.calls[1]).toEqual(create.mock.calls[0]);
 await user.type(screen.getByLabelText('Company name'),' revised');expect((screen.getByRole('button',{name:'Retry creation'}) as HTMLButtonElement).disabled).toBe(true);
 expect(screen.getByText(/previous request may have succeeded/)).toBeTruthy();await user.click(screen.getByRole('button',{name:'Start a new request'}));await user.click(screen.getByRole('button',{name:'Create company'}));
 await screen.findByText('Acme revised');expect(create.mock.calls[2][0]).toEqual({name:'Acme revised'});expect(create.mock.calls[2][1]?.idempotencyKey).not.toBe(create.mock.calls[0][1]?.idempotencyKey);
});

it('creates a customer, workspace, login credentials, and optional trial credit in one step', async () => {
  const createCompany = vi.spyOn(NiuAdminClient.prototype, 'createCompany').mockResolvedValueOnce({
    id: '20000000-0000-4000-8000-000000000002',
    name: 'Trial Org',
  } as never);
  const createWorkspace = vi.spyOn(NiuAdminClient.prototype, 'createWorkspace').mockResolvedValueOnce({
    id: 'ws-trial',
    organization_id: '20000000-0000-4000-8000-000000000002',
    name: 'Trial Org',
    slug: 'trial-org',
  } as never);
  const createOwner = vi.spyOn(NiuAdminClient.prototype, 'createOperatorIdentity').mockResolvedValueOnce({
    operator: {
      id: 'op-trial',
      organization_id: '20000000-0000-4000-8000-000000000002',
      project_id: null,
      name: 'Trial Org',
      role: 'owner',
      revoked: false,
    },
  } as never);
  const setPassword = vi.spyOn(NiuAdminClient.prototype, 'setMemberPassword').mockResolvedValueOnce({ revision: 1 } as never);
  const grantCalls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async input => {
    const url = String(input);
    if (url.includes('/grants/prepare') || url.endsWith('/grants')) {
      grantCalls.push(url);
      return Response.json({ data: { id: 'grant-1' } });
    }
    if (url.includes('/admin/customers') || url.includes('/platform/customer-accounts')) return Response.json({ data: [], next_after: null });
    if (url.includes('/admin/registrations')) return Response.json({ data: [], next_after: null });
    return Response.json({ data: [] });
  }));

  const user = userEvent.setup();
  render(<MemoryRouter><Customers token="one-step-token" canSetup onWorkspaceCreated={() => {}} /></MemoryRouter>);
  await user.click((await screen.findAllByRole('button', { name: 'New customer' }))[0]);
  await user.type(screen.getByLabelText('Company name'), 'Trial Org');
  await user.type(screen.getByLabelText('Login email'), 'trial@acme.com');
  await user.click(screen.getByRole('button', { name: 'Generate' }));
  await user.click(screen.getByRole('button', { name: '$10' }));
  await user.click(screen.getByRole('button', { name: 'Create company' }));

  expect(await screen.findByText('Customer ready')).toBeTruthy();
  expect(screen.getByText('trial@acme.com')).toBeTruthy();
  expect(screen.getByText('$10.00')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Copy sign-in details' })).toBeTruthy();
  expect(createCompany).toHaveBeenCalledTimes(1);
  expect(createWorkspace).toHaveBeenCalledWith(
    { organization_id: '20000000-0000-4000-8000-000000000002', name: 'Trial Org', slug: 'trial-org' },
    expect.objectContaining({ idempotencyKey: expect.any(String) }),
  );
  expect(createOwner).toHaveBeenCalledTimes(1);
  expect(setPassword).toHaveBeenCalledWith(
    'op-trial',
    expect.objectContaining({ email: 'trial@acme.com', expected_revision: 0 }),
  );
  expect(grantCalls).toHaveLength(2);
});
