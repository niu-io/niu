import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter} from 'react-router';
import {Customers} from '../../../app/features/customers/page';
import {clearSessionCache} from '../../../app/lib/query-cache';

vi.mock('@/shell/platform-currency',()=>({usePlatformCurrency:()=>({currency:'USD',ready:true,error:null})}));
afterEach(()=>{cleanup();clearSessionCache();sessionStorage.clear();vi.restoreAllMocks();vi.unstubAllGlobals();});

const acme='10000000-0000-4000-8000-000000000001';
const beta='10000000-0000-4000-8000-000000000002';
const workspaceId='20000000-0000-4000-8000-000000000001';
const ownerId='30000000-0000-4000-8000-000000000001';
const cursor='90000000-0000-4000-8000-000000000001';
const usdAccount={currency:'USD',balance_nanos:'12000000000',reserved_nanos:'0',available_nanos:'12500000000',outstanding_nanos:'2500000000',credit_limit_nanos:'3000000000',warning_threshold_nanos:null,policy_revision:'2',low_balance:false,posted_credit_exhausted:false};
const credits={name:'Niu Credits',display_precision:2,available:'7.50',additional_units:0};
const firstPage={data:[{organization_id:acme,organization_name:'Acme',accounts:[usdAccount],credits}],next_after:null};
const workspace={id:workspaceId,name:'Acme Team',slug:'acme-team',organization_id:acme,organization_name:'Acme'};
const owner={id:ownerId,name:'Alex Chen',role:'owner',organization_id:acme,project_id:null,revoked:false};

type ApiOptions={accounts?:unknown;accountsAfter?:unknown;workspaces?:unknown;workspacesError?:boolean;operators?:unknown};
function stubApi(options:ApiOptions={}){
 const calls:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async input=>{
  const url=String(input);calls.push(url);
  if(url.includes('/platform/customer-accounts')){
   if(url.includes('after=')&&options.accountsAfter)return Response.json(options.accountsAfter);
   return Response.json(options.accounts??firstPage);
  }
  if(url.includes('/workspaces')){
   if(options.workspacesError)throw new Error('Directory unavailable');
   return Response.json(options.workspaces??{data:[workspace],next_cursor:null});
  }
  if(url.includes('/operators'))return Response.json(options.operators??{data:[owner],next_cursor:null});
  if(url.includes('/auth/config'))return Response.json({password_login:true});
  throw new Error('Unexpected '+url);
 }));
 return calls;
}
function show(canSetup=true){return render(<MemoryRouter><Customers token={'customers-directory-'+Math.random()} canSetup={canSetup} onWorkspaceCreated={()=>{}}/></MemoryRouter>);}

it('renders one directory with identity, setup status, Credits, exact balances, and row actions',async()=>{
 stubApi();show();
 expect(await screen.findByText('Acme')).toBeTruthy();
 expect(await screen.findByText('1 workspace · Owner: Alex Chen')).toBeTruthy();
 expect(screen.getByText('7.50 Niu Credits')).toBeTruthy();
 expect(screen.getByText('$12.00')).toBeTruthy();
 expect(screen.getByText('$3.00')).toBeTruthy();
 expect(screen.getByText('$2.5')).toBeTruthy();
 expect(screen.getByText('$12.5')).toBeTruthy();
 expect(screen.getAllByRole('table')).toHaveLength(1);
 expect(screen.queryByText(acme)).toBeNull();
 const trigger=screen.getByRole('button',{name:'Account actions for Acme in USD'});
 await userEvent.setup().click(trigger);
 expect(await screen.findByRole('menuitem',{name:'Set up'})).toBeTruthy();
 for(const name of ['Manage Branded Credits','Set credit','Grant noncash balance','Noncash grants'])expect(screen.getByRole('menuitem',{name})).toBeTruthy();
});

it('keeps the financial directory usable for platform administrators without installation setup authority',async()=>{
 stubApi();show(false);
 expect(await screen.findByText('Acme')).toBeTruthy();
 expect(screen.queryByRole('button',{name:'New customer'})).toBeNull();
 expect(screen.queryByText('Workspace and owner status unavailable')).toBeNull();
 expect(screen.queryByText(/Owner:/)).toBeNull();
 await userEvent.setup().click(screen.getByRole('button',{name:'Account actions for Acme in USD'}));
 expect(await screen.findByRole('menuitem',{name:'Set credit'})).toBeTruthy();
 expect(screen.queryByRole('menuitem',{name:'Set up'})).toBeNull();
});

it('keeps balances visible and explains an unavailable workspace and owner status read',async()=>{
 stubApi({workspacesError:true});show();
 expect(await screen.findByText('Acme')).toBeTruthy();
 expect(await screen.findByText('Workspace and owner status unavailable')).toBeTruthy();
 expect(screen.getByText('$12.5')).toBeTruthy();
});

it('follows the unchanged next_after cursor and never duplicates a company',async()=>{
 stubApi({accounts:{...firstPage,next_after:cursor},accountsAfter:{data:[{organization_id:beta,organization_name:'Beta',accounts:[],credits:null}],next_after:null}});
 const user=userEvent.setup();show();
 await user.click(await screen.findByRole('button',{name:'More companies'}));
 expect(await screen.findByText('Beta')).toBeTruthy();
 expect(screen.getAllByText('Acme')).toHaveLength(1);
 expect(screen.getByText('No currency accounts')).toBeTruthy();
});

it('shows a retryable error and recovers without losing the financial directory',async()=>{
 let fail=true;
 vi.stubGlobal('fetch',vi.fn(async input=>{
  const url=String(input);
  if(url.includes('/platform/customer-accounts')){
   if(fail){fail=false;throw new Error('Customer directory unavailable');}
   return Response.json(firstPage);
  }
  if(url.includes('/workspaces'))return Response.json({data:[workspace],next_cursor:null});
  if(url.includes('/operators'))return Response.json({data:[owner],next_cursor:null});
  throw new Error('Unexpected '+url);
 }));
 show();
 expect(await screen.findByText(/Customer directory unavailable/)).toBeTruthy();
 await userEvent.setup().click(screen.getByRole('button',{name:'Retry'}));
 await waitFor(()=>expect(screen.getByText('Acme')).toBeTruthy());
 expect(screen.getByText('$12.5')).toBeTruthy();
});

it('shows the customer directory empty state without an empty table',async()=>{
 stubApi({accounts:{data:[],next_after:null}});show();
 expect(await screen.findByText('No customers yet. Create a company to start setting up independent customer access.')).toBeTruthy();
 expect(screen.queryByRole('table')).toBeNull();
 expect(screen.getAllByRole('button',{name:'New customer'})).toHaveLength(2);
});
