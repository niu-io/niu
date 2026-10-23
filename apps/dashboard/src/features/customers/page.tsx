import {useEffect,useMemo,useRef,useState,type FormEvent} from 'react';
import {Link} from 'react-router';
import {IconPlus,IconRefresh} from '@tabler/icons-react';
import {useDashboardContext} from '@/app/dashboard-context';
import {usePlatformCurrency} from '@/app/platform-currency';
import {Button} from '@/components/ui/button';
import PageHeader from '@/components/PageHeader';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Alert,AlertDescription,AlertTitle} from '@/components/ui/alert';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Table,TableHeader,TableHead,TableBody,TableRow,TableCell} from '@/components/ui/table';
import {NiuAdminClient,type CompanyMetadata} from '@niu-io/sdk/admin';
import CustomerSetup from './setup';
import {readPending,savePending,clearPending,type PendingCreation} from './pending';

export default function CustomersRoute(){
 const context=useDashboardContext();
 if(context.session?.kind!=='installation')return <Alert><AlertTitle>Installation administrator access required</AlertTitle><AlertDescription><p>Creating a separately funded customer company requires the installation administrator credential. Your current account retains its existing company access.</p><Button asChild variant="outline" className="mt-3"><Link to="/installation">Open installation administration</Link></Button></AlertDescription></Alert>;
 return <Customers key={context.token} token={context.token} onWorkspaceCreated={context.reloadWorkspaces}/>;
}
export function Customers({token,onWorkspaceCreated}:{token:string;onWorkspaceCreated:()=>void}){
 const client=useMemo(()=>new NiuAdminClient({adminToken:token,baseURL:new URL('/api/v1',location.origin).href}),[token]);
 const [companies,setCompanies]=useState<CompanyMetadata[]>([]);const [cursor,setCursor]=useState<string|null>(null);
 const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [failedCursor,setFailedCursor]=useState<string>();
 const [create,setCreate]=useState(false);const [selected,setSelected]=useState<CompanyMetadata|null>(null);
 const controller=useRef<AbortController|null>(null);
 const returnFocus=useRef<HTMLElement|null>(null);
 const restoreFocus=()=>returnFocus.current?.focus();
 async function load(after?:string){
  controller.current?.abort();const active=new AbortController();controller.current=active;setLoading(true);setError('');setFailedCursor(undefined);
  try{const page=await client.listCompaniesPage({limit:50,after},{signal:active.signal});if(active.signal.aborted)return;
   if(!Array.isArray(page.data)||page.next_cursor===after)throw new Error('The customer directory did not advance. Refresh customers.');
   setCompanies(old=>after?[...old,...page.data.filter(row=>!old.some(saved=>saved.id===row.id))]:page.data);setCursor(page.next_cursor);
  }catch(reason){if(!active.signal.aborted){setError(reason instanceof Error?reason.message:'Could not load customers.');setFailedCursor(after);}}
  finally{if(!active.signal.aborted)setLoading(false);}
 }
 useEffect(()=>{void load();return()=>controller.current?.abort();},[client]);
 return <section className="min-w-0 space-y-5" aria-label="Customers">
  <PageHeader title="Customers" action={<><Button variant="outline" disabled={loading} aria-label="Refresh customers" title="Refresh customers" onClick={()=>void load()}><IconRefresh size={16}/><span className="hidden sm:inline">Refresh</span></Button><Button aria-label="New customer" onClick={event=>{returnFocus.current=event.currentTarget;setCreate(true);}}><IconPlus size={16}/><span className="hidden sm:inline">New customer</span></Button></>}/>
  <p className="text-sm text-muted-foreground">Each customer company has its own funds, users, and workspaces. Workspaces within a company share its funds.</p>
  {error&&<Alert variant="destructive"><AlertDescription>{error}<Button variant="outline" onClick={()=>void load(failedCursor)} disabled={loading}>Retry</Button></AlertDescription></Alert>}
  {loading&&!companies.length&&<p role="status">Loading customers…</p>}
  {!loading&&!error&&!companies.length&&<p>No customers yet. Create a company to start setting up independent customer access.</p>}
  {!!companies.length&&<Table className="table-fixed" aria-label="Customer companies"><TableHeader><TableRow><TableHead>Company</TableHead><TableHead className="w-28 text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{companies.map(company=><TableRow key={company.id}><TableCell className="whitespace-normal [overflow-wrap:anywhere]">{company.name}</TableCell><TableCell className="text-right"><Button variant="outline" onClick={event=>{returnFocus.current=event.currentTarget;setSelected(company);}} aria-label={`Set up ${company.name}`}>Set up</Button></TableCell></TableRow>)}</TableBody></Table>}
  {cursor&&<Button variant="outline" disabled={loading} onClick={()=>void load(cursor)}>{loading?'Loading…':'More customers'}</Button>}
  <CreateCompany onRestoreFocus={restoreFocus} open={create} onOpenChange={setCreate} client={client} onCreated={company=>{setCompanies(old=>[company,...old.filter(row=>row.id!==company.id)]);setCreate(false);setSelected(company);}}/>
  {selected&&<CustomerSetup onRestoreFocus={restoreFocus} key={selected.id} company={selected} token={token} client={client} onClose={()=>setSelected(null)} onWorkspaceCreated={onWorkspaceCreated}/>}
 </section>;
}
function CreateCompany({open,onOpenChange,client,onCreated,onRestoreFocus}:{onRestoreFocus:()=>void;open:boolean;onOpenChange:(open:boolean)=>void;client:NiuAdminClient;onCreated:(company:CompanyMetadata)=>void}){
 const {currency,ready,error:currencyError}=usePlatformCurrency();const pending=useRef<PendingCreation|null>(readPending('company'));const [name,setName]=useState(pending.current?.name??'');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 async function submit(event:FormEvent){event.preventDefault();if(busy||!currency||!name.trim())return;
  pending.current??={name:name.trim(),key:crypto.randomUUID()};setBusy(true);setError('');
  try{savePending('company',pending.current);const saved=await client.createCompany({name:pending.current.name},{idempotencyKey:pending.current.key});if(!saved?.id||!saved.name)throw new Error('Creation could not be confirmed.');clearPending('company');pending.current=null;setName('');onCreated(saved);}
  catch(reason){const status=(reason as {status?:number})?.status;if(status===400||status===422){clearPending('company');pending.current=null;setError(reason instanceof Error?reason.message:'Check the company name.');}else setError('Creation could not be confirmed. Retry uses the same request and cannot create a second company. You can also close this dialog and refresh the customer list.');}
  finally{setBusy(false);}
 }
 return <Dialog open={open} onOpenChange={value=>{if(!busy)onOpenChange(value);}}><DialogContent onCloseAutoFocus={event=>{event.preventDefault();onRestoreFocus();}}><DialogHeader><DialogTitle>New customer</DialogTitle><DialogDescription>Create a separately funded company. You will set up its workspace and owner next.</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-4"><div className="space-y-2"><Label htmlFor="customer-name">Company name</Label><Input id="customer-name" required maxLength={200} value={name} disabled={busy||!!pending.current} onChange={event=>setName(event.target.value)}/></div><p className="text-sm text-muted-foreground">Uses the platform currency{currency?` (${currency})`:''}. New companies start with no funds or approved credit.</p>{currencyError&&<Alert><AlertDescription>{currencyError} <Link to="/admin/settings" className="underline">Open Settings</Link></AlertDescription></Alert>}{error&&<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={()=>onOpenChange(false)}>Close</Button><Button disabled={busy||!ready||!currency||!name.trim()}>{busy?'Creating…':pending.current?'Retry creation':'Create company'}</Button></div></form></DialogContent></Dialog>;
}
