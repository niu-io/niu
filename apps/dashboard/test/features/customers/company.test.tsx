import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter} from 'react-router';
import {NiuAdminClient} from '@niu-io/sdk/admin';
import {Customers} from '../../../app/features/customers/page';

vi.mock('@/shell/platform-currency',()=>({usePlatformCurrency:()=>({currency:'USD',ready:true,error:null})}));
afterEach(()=>{cleanup();sessionStorage.clear();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('preserves the original request on retry and requires explicit acknowledgement before creating with an edited name',async()=>{
 vi.spyOn(NiuAdminClient.prototype,'listCompaniesPage').mockResolvedValue({data:[],next_cursor:null});
 const create=vi.spyOn(NiuAdminClient.prototype,'createCompany').mockRejectedValueOnce(new Error('Lost response')).mockRejectedValueOnce(new Error('Lost response again')).mockResolvedValueOnce({id:'10000000-0000-4000-8000-000000000001',name:'Acme revised'} as never);
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({data:[],next_cursor:null})));
 const user=userEvent.setup();render(<MemoryRouter><Customers token="company-test" onWorkspaceCreated={()=>{}}/></MemoryRouter>);
 await user.click(await screen.findByRole('button',{name:'New customer'}));
 await user.type(screen.getByLabelText('Company name'),'Acme');await user.click(screen.getByRole('button',{name:'Create company'}));
 await screen.findByText(/Creation could not be confirmed/);await user.click(screen.getByRole('button',{name:'Retry creation'}));
 await screen.findByText(/Creation could not be confirmed/);expect(create.mock.calls[1]).toEqual(create.mock.calls[0]);
 await user.type(screen.getByLabelText('Company name'),' revised');expect((screen.getByRole('button',{name:'Retry creation'}) as HTMLButtonElement).disabled).toBe(true);
 expect(screen.getByText(/previous request may have succeeded/)).toBeTruthy();await user.click(screen.getByRole('button',{name:'Start a new request'}));await user.click(screen.getByRole('button',{name:'Create company'}));
 await screen.findByText('Acme revised');expect(create.mock.calls[2][0]).toEqual({name:'Acme revised'});expect(create.mock.calls[2][1]?.idempotencyKey).not.toBe(create.mock.calls[0][1]?.idempotencyKey);
});
