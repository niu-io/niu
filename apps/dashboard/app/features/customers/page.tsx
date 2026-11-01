import { useLocale as useUILocale } from '@/shell/ui-locale';
import {useEffect,useMemo,useRef,useState,type FormEvent} from 'react';
import {Link,type LoaderFunctionArgs} from 'react-router';
import {loadCriticalRouteEndpoint,routeShouldRevalidate,useOptionalRouteLoaderData} from '@/lib/route-data';
import {IconPlus,IconRefresh} from '@tabler/icons-react';
import {useDashboardContext} from '@/shell/dashboard-context';
import {usePlatformCurrency} from '@/shell/platform-currency';
import {Button} from '@/components/ui/button';
import PageHeader from '@/components/PageHeader';
import {TableSkeleton} from '@/components/PageSkeletons';
import {fetchQuery,invalidateQueries,peekQuery} from '@/lib/query-cache';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Alert,AlertDescription,AlertTitle} from '@/components/ui/alert';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Table,TableHeader,TableHead,TableBody,TableRow,TableCell} from '@/components/ui/table';
import {NiuAdminClient,type CompanyMetadata} from '@niu-io/sdk/admin';
import CustomerSetup from './setup';
import {readPending,savePending,clearPending,type PendingCreation} from './pending';

const COMPANIES_CACHE_KEY='/api/v1/companies?limit=50';
type CompaniesPage={data:CompanyMetadata[];next_cursor:string|null};

export function loader(args:LoaderFunctionArgs){
 return loadCriticalRouteEndpoint(args,({snapshot,url})=>({
  authorized:snapshot.session?.kind==='installation',
  endpoint:COMPANIES_CACHE_KEY,
  fetcher:(signal,snap)=>new NiuAdminClient({adminToken:snap.token,baseURL:new URL('/api/v1',url.origin).href}).listCompaniesPage({limit:50},{signal}),
 }));
}
export const shouldRevalidate=routeShouldRevalidate;
export default function CustomersRoute(){
  const { t: uiT } = useUILocale();
 useOptionalRouteLoaderData();
 const context=useDashboardContext();
 if(context.session?.kind!=='installation')return <Alert><AlertTitle>{uiT("Installation administrator access required")}</AlertTitle><AlertDescription><p>{uiT("Creating a separately funded customer company requires the installation administrator credential. Your current account retains its existing company access.")}</p><Button asChild variant="outline" className="mt-3"><Link to="/installation">{uiT("Open installation administration")}</Link></Button></AlertDescription></Alert>;
 return <Customers key={context.token} token={context.token} onWorkspaceCreated={context.reloadWorkspaces}/>;
}
export function Customers({token,onWorkspaceCreated}:{token:string;onWorkspaceCreated:()=>void}){
  const { t: uiT, format: uiF } = useUILocale();
 const client=useMemo(()=>new NiuAdminClient({adminToken:token,baseURL:new URL('/api/v1',location.origin).href}),[token]);
 const scope=token||'public';
 const initialPage=token?peekQuery<CompaniesPage>(scope,COMPANIES_CACHE_KEY):undefined;
 const initialValid=initialPage&&Array.isArray(initialPage.data)?initialPage:undefined;
 const [companies,setCompanies]=useState<CompanyMetadata[]>(()=>initialValid?.data??[]);const [cursor,setCursor]=useState<string|null>(()=>initialValid?.next_cursor??null);
 const [loading,setLoading]=useState(()=>Boolean(token&&!initialValid));const [error,setError]=useState('');const [failedCursor,setFailedCursor]=useState<string>();
 const [create,setCreate]=useState(false);const [selected,setSelected]=useState<CompanyMetadata|null>(null);
 const controller=useRef<AbortController|null>(null);
 const returnFocus=useRef<HTMLElement|null>(null);
 const restoreFocus=()=>returnFocus.current?.focus();
 async function load(after?:string,force=true){
  controller.current?.abort();const active=new AbortController();controller.current=active;
  if(after||force||!initialValid)setLoading(true);
  setError('');setFailedCursor(undefined);
  try{
   const page=after
    ?await client.listCompaniesPage({limit:50,after},{signal:active.signal})
    :await fetchQuery<CompaniesPage>(scope,COMPANIES_CACHE_KEY,signal=>client.listCompaniesPage({limit:50},{signal}),{signal:active.signal,force,awaitRevalidate:true});
   if(active.signal.aborted)return;
   if(!Array.isArray(page.data)||page.next_cursor===after)throw new Error('The customer directory did not advance. Refresh customers.');
   setCompanies(old=>after?[...old,...page.data.filter(row=>!old.some(saved=>saved.id===row.id))]:page.data);setCursor(page.next_cursor);
  }catch(reason){if(!after)invalidateQueries(COMPANIES_CACHE_KEY);if(!active.signal.aborted){setError(reason instanceof Error?reason.message:'Could not load customers.');setFailedCursor(after);}}
  finally{if(!active.signal.aborted)setLoading(false);}
 }
 useEffect(()=>{void load(undefined,false);return()=>controller.current?.abort();},[client]);
 return <section className="min-w-0 space-y-5" aria-label={uiT("Customers")}>
  <PageHeader title={uiT("Customers")} action={<><Button variant="outline" disabled={loading} aria-label={uiT("Refresh customers")} title={uiT("Refresh customers")} onClick={()=>void load()}><IconRefresh size={16}/><span className="hidden sm:inline">{uiT("Refresh")}</span></Button><Button aria-label={uiT("New customer")} onClick={event=>{returnFocus.current=event.currentTarget;setCreate(true);}}><IconPlus size={16}/><span className="hidden sm:inline">{uiT("New customer")}</span></Button></>}/>
  <p className="text-sm text-muted-foreground">{uiT("Each customer company has its own funds, users, and workspaces. Workspaces within a company share its funds.")}</p>
  {error&&<Alert variant="destructive"><AlertDescription>{error}<Button variant="outline" onClick={()=>void load(failedCursor)} disabled={loading}>{uiT("Retry")}</Button></AlertDescription></Alert>}
  {loading&&!companies.length&&<TableSkeleton columns={2} rows={5} label={uiT("Loading customers…")}/>}
  {!loading&&!error&&!companies.length&&<p>{uiT("No customers yet. Create a company to start setting up independent customer access.")}</p>}
  {!!companies.length&&<Table className="table-fixed" aria-label={uiT("Customer companies")}><TableHeader><TableRow><TableHead>{uiT("Company")}</TableHead><TableHead className="w-28 text-right">{uiT("Actions")}</TableHead></TableRow></TableHeader><TableBody>{companies.map(company=><TableRow key={company.id}><TableCell className="whitespace-normal [overflow-wrap:anywhere]">{company.name}</TableCell><TableCell className="text-right"><Button variant="outline" onClick={event=>{returnFocus.current=event.currentTarget;setSelected(company);}} aria-label={uiF("Set up {0}", [company.name])}>{uiT("Set up")}</Button></TableCell></TableRow>)}</TableBody></Table>}
  {cursor&&<Button variant="outline" disabled={loading} onClick={()=>void load(cursor)}>{loading?uiT("Loading…"):uiT("More customers")}</Button>}
  <CreateCompany onRestoreFocus={restoreFocus} open={create} onOpenChange={setCreate} client={client} onCreated={company=>{invalidateQueries(COMPANIES_CACHE_KEY);setCompanies(old=>[company,...old.filter(row=>row.id!==company.id)]);setCreate(false);setSelected(company);}}/>
  {selected&&<CustomerSetup onRestoreFocus={restoreFocus} key={selected.id} company={selected} token={token} client={client} onClose={()=>setSelected(null)} onWorkspaceCreated={onWorkspaceCreated}/>}
 </section>;
}
function CreateCompany({open,onOpenChange,client,onCreated,onRestoreFocus}:{onRestoreFocus:()=>void;open:boolean;onOpenChange:(open:boolean)=>void;client:NiuAdminClient;onCreated:(company:CompanyMetadata)=>void}){
  const { t: uiT } = useUILocale();
 const {currency,ready,error:currencyError}=usePlatformCurrency();const pending=useRef<PendingCreation|null>(readPending('company'));const [name,setName]=useState(pending.current?.name??'');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 async function submit(event:FormEvent){event.preventDefault();if(busy||!currency||!name.trim())return;
  pending.current??={name:name.trim(),key:crypto.randomUUID()};setBusy(true);setError('');
  try{savePending('company',pending.current);const saved=await client.createCompany({name:pending.current.name},{idempotencyKey:pending.current.key});if(!saved?.id||!saved.name)throw new Error('Creation could not be confirmed.');clearPending('company');pending.current=null;setName('');onCreated(saved);}
  catch(reason){const status=(reason as {status?:number})?.status;if(status===400||status===422){clearPending('company');pending.current=null;setError(reason instanceof Error?reason.message:'Check the company name.');}else setError('Creation could not be confirmed. Retry uses the same request and cannot create a second company. You can also close this dialog and refresh the customer list.');}
  finally{setBusy(false);}
 }
 return <Dialog open={open} onOpenChange={value=>{if(!busy)onOpenChange(value);}}><DialogContent onCloseAutoFocus={event=>{event.preventDefault();onRestoreFocus();}}><DialogHeader><DialogTitle>{uiT("New customer")}</DialogTitle><DialogDescription>{uiT("Create a separately funded company. You will set up its workspace and owner next.")}</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-4"><div className="space-y-2"><Label htmlFor="customer-name">{uiT("Company name")}</Label><Input id="customer-name" required maxLength={200} value={name} disabled={busy||!!pending.current} onChange={event=>setName(event.target.value)}/></div><p className="text-sm text-muted-foreground">{uiT("Uses the platform currency")}{currency?` (${currency})`:''}{uiT(". New companies start with no funds or approved credit.")}</p>{currencyError&&<Alert><AlertDescription>{currencyError} <Link to="/admin/settings" className="underline">{uiT("Open Settings")}</Link></AlertDescription></Alert>}{error&&<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={()=>onOpenChange(false)}>{uiT("Close")}</Button><Button disabled={busy||!ready||!currency||!name.trim()}>{busy?uiT("Creating…"):pending.current?uiT("Retry creation"):uiT("Create company")}</Button></div></form></DialogContent></Dialog>;
}
