import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { IconChevronDown, IconRefresh } from '@tabler/icons-react';
import { useDashboardContext } from '@/app/dashboard-context';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { money } from '@/lib/money';
import { VendorRequestError } from '@/features/vendors/api';
import type { CustomerTariffHistoryEntry } from '../../../../../sdks/javascript/src/admin';
import { PublicationUnconfirmedError, listPricingModels, listPricingTargets, listCustomerPrices, readPriceHistory, publishCustomerPrice, priceFromNanos, priceToNanos, type PricingTarget, type CurrentTariff } from './api';

export default function CustomerPricingRoute() {
  const { token } = useDashboardContext();
  return <PricingTargets key={token} token={token} />;
}
function PricingTargets({ token }: { token: string }) {
  const [search, setSearch] = useSearchParams();
  const selectedId = search.get('target');
  const [targets, setTargets] = useState<PricingTarget[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [failedCursor, setFailedCursor] = useState<string | undefined>();
  const activeRequest = useRef<AbortController | null>(null);
  async function load(after?: string) {
    activeRequest.current?.abort();
    const controller = new AbortController(); activeRequest.current = controller;
    setLoading(true); setError(''); setFailedCursor(undefined);
    try {
      const page = await listPricingTargets(token, after, controller.signal);
      if (controller.signal.aborted) return;
      setTargets(current => after ? [...current, ...page.data.filter(row => !current.some(saved => saved.workspace_id === row.workspace_id))] : page.data);
      setCursor(page.next_after);
    } catch (reason) { if (!controller.signal.aborted) { setFailedCursor(after); setError(reason instanceof Error ? reason.message : 'Pricing targets unavailable.'); } }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  useEffect(() => { void load(); return () => activeRequest.current?.abort(); }, [token]);
  const selected = targets.find(row => row.workspace_id === selectedId);
  useEffect(() => { if (selectedId && !selected && cursor && !loading && !error) void load(cursor); }, [selectedId, selected, cursor, loading, error]);
  return <div className="space-y-6 p-6">
    <div className="flex flex-wrap items-center gap-3">
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" disabled={loading && !targets.length}>{selected ? `${selected.organization_name} · ${selected.workspace_name}` : 'Choose company and workspace'}<IconChevronDown size={16}/></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 max-w-[calc(100vw-2rem)] overflow-y-auto"><DropdownMenuRadioGroup value={selectedId ?? ''} onValueChange={value => setSearch(current => { current.set('target', value); return current; })}>
          {targets.map(row => <DropdownMenuRadioItem key={row.workspace_id} value={row.workspace_id}>{row.organization_name} · {row.workspace_name}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>{cursor && <DropdownMenuItem disabled={loading} onSelect={event => { event.preventDefault(); void load(cursor); }}>{loading ? 'Loading…' : 'More workspaces'}</DropdownMenuItem>}</DropdownMenuContent>
      </DropdownMenu>
      <Button variant="ghost" aria-label="Refresh pricing targets" disabled={loading} onClick={() => void load()}><IconRefresh size={16}/></Button>
    </div>
    {error && <Alert variant="destructive"><AlertDescription>{error}<Button variant="outline" disabled={loading} onClick={() => void load(failedCursor)}>Retry targets</Button></AlertDescription></Alert>}
    {loading && !targets.length && <p role="status">Loading pricing targets…</p>}
    {selected ? <Prices key={`${token}:${selected.workspace_id}`} token={token} target={selected}/> : !loading && !error && <p className="text-muted-foreground">{selectedId ? 'This pricing target is unavailable. Choose another workspace.' : targets.length ? 'Select a company and workspace to manage customer selling prices.' : 'No pricing targets are available.'}</p>}
  </div>;
}
function Prices({ token, target }: { token: string; target: PricingTarget }) {
  const [modelNames, setModelNames] = useState<string[]>([]);
  const [modelsError, setModelsError] = useState('');
  const [modelsReady, setModelsReady] = useState(false);
  const [modelReload, setModelReload] = useState(0);
  const [rows, setRows] = useState<CurrentTariff[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [failedCursor, setFailedCursor] = useState<string | undefined>();
  const [filter, setFilter] = useState('');
  const [editor, setEditor] = useState<{previous: CurrentTariff | null} | null>(null);
  const [history, setHistory] = useState<CurrentTariff | null>(null);
  const [notice, setNotice] = useState('');
  const activeRequest = useRef<AbortController | null>(null);
  async function load(after?: string) {
    activeRequest.current?.abort(); const controller = new AbortController(); activeRequest.current = controller;
    setLoading(true); setError(''); setFailedCursor(undefined);
    try {
      const page = await listCustomerPrices(token, target, after, controller.signal);
      if (controller.signal.aborted) return;
      setRows(current => after ? [...current, ...page.data.filter(row => !current.some(saved => saved.model_alias === row.model_alias))] : page.data);
      setCursor(page.next_after); setLoaded(true);
    } catch (reason) { if (!controller.signal.aborted) { setFailedCursor(after); setError(reason instanceof Error ? reason.message : 'Prices unavailable.'); } }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  useEffect(() => { void load(); return () => activeRequest.current?.abort(); }, [token, target]);
  useEffect(() => {
    const request = new AbortController(); setModelsReady(false); setModelsError('');
    listPricingModels(token, request.signal).then(names => { if (!request.signal.aborted) { setModelNames(names); setModelsReady(true); } })
      .catch(reason => { if (!request.signal.aborted) setModelsError(reason instanceof Error ? reason.message : 'Pricing models unavailable.'); });
    return () => request.abort();
  }, [token, modelReload]);
  return <>
    <PageHeader title="Customer pricing" action={<Button disabled={!loaded || loading || !modelsReady || !modelNames.length} onClick={() => { setNotice(''); setEditor({previous:null}); }}>Publish price</Button>}/>
    <div className="flex flex-wrap items-center gap-3"><Input aria-label="Filter customer models" placeholder="Filter models" className="max-w-sm" value={filter} onChange={event => setFilter(event.target.value)}/><Button variant="outline" disabled={loading} onClick={() => void load()}>Refresh prices</Button></div>
    {notice && <p role="status">{notice}</p>}
    {modelsError && <Alert variant="destructive"><AlertDescription>{modelsError}<Button variant="outline" onClick={() => setModelReload(value => value + 1)}>Retry models</Button></AlertDescription></Alert>}
    {error && <Alert variant="destructive"><AlertDescription>{error}<Button variant="outline" disabled={loading} onClick={() => void load(failedCursor)}>Retry prices</Button></AlertDescription></Alert>}
    {loading && <p role="status">Loading prices…</p>}
    {loaded && !rows.length ? <p className="text-muted-foreground">No customer prices published for this workspace.</p> : rows.length > 0 && <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Model</TableHead><TableHead>Currency</TableHead><TableHead>Input / 1M</TableHead><TableHead>Output / 1M</TableHead><TableHead>Cache read / 1M</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader><TableBody>
      {rows.filter(row => row.model_alias.toLowerCase().includes(filter.toLowerCase().trim())).map(row => <TableRow key={row.model_alias}><TableCell>{row.model_alias}</TableCell><TableCell>{row.currency}</TableCell><TableCell>{priceFromNanos(row.prompt_rate)}</TableCell><TableCell>{priceFromNanos(row.completion_rate)}</TableCell><TableCell>{row.cached_prompt_rate == null ? 'Input rate' : priceFromNanos(row.cached_prompt_rate)}</TableCell><TableCell><div className="flex gap-2"><Button variant="ghost" onClick={() => setEditor({previous:row})} aria-label={`Edit ${row.model_alias}`}>Edit</Button><Button variant="ghost" onClick={() => setHistory(row)} aria-label={`History for ${row.model_alias}`}>History</Button></div></TableCell></TableRow>)}
    </TableBody></Table></div>}
    {loaded && rows.length > 0 && !rows.some(row => row.model_alias.toLowerCase().includes(filter.toLowerCase().trim())) && <p>No loaded prices match this filter.</p>}
    {cursor && <Button variant="outline" disabled={loading} onClick={() => void load(cursor)}>More prices</Button>}
    {editor && <PriceEditor token={token} target={target} previous={editor.previous} modelNames={modelNames} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); setNotice('Customer price published. Future requests use the new price.'); void load(); }}/>} 
    {history && <PriceHistory token={token} target={target} price={history} onClose={() => setHistory(null)}/>}
  </>;
}
function PriceEditor({token,target,previous,modelNames,onClose,onSaved}: {token:string;target:PricingTarget;previous:CurrentTariff|null;modelNames:string[];onClose:()=>void;onSaved:()=>void}) {
  const [current,setCurrent]=useState(previous);
  const [model,setModel]=useState(previous?.model_alias ?? '');
  const [currency,setCurrency]=useState(previous?.currency ?? 'USD');
  const [input,setInput]=useState(previous ? priceFromNanos(previous.prompt_rate) : '');
  const [output,setOutput]=useState(previous ? priceFromNanos(previous.completion_rate) : '');
  const [cache,setCache]=useState(previous?.cached_prompt_rate != null ? priceFromNanos(previous.cached_prompt_rate) : '');
  const [fee,setFee]=useState(previous ? priceFromNanos(previous.request_fee_nanos ?? '0') : '');
  const [minimum,setMinimum]=useState(previous ? priceFromNanos(previous.minimum_charge_nanos ?? '0') : '');
  const [busy,setBusy]=useState(false);
  const [conflict,setConflict]=useState(false);
  const [error,setError]=useState('');
  const controller=useRef<AbortController|null>(null);
  useEffect(()=>()=>controller.current?.abort(),[]);
  async function reload() {
    const request = new AbortController(); controller.current=request; setBusy(true);setError('');
    try {
      const result=await readPriceHistory(token,target,model,undefined,request.signal);
      if(request.signal.aborted)return;
      const row=result.data.find(item=>item.is_current);
      if(!row)throw new Error('The current price is unavailable. Close and refresh before continuing.');
      setCurrent(row);setCurrency(row.currency);setInput(priceFromNanos(row.prompt_rate));setOutput(priceFromNanos(row.completion_rate));setCache(row.cached_prompt_rate == null ? '' : priceFromNanos(row.cached_prompt_rate));setFee(priceFromNanos(row.request_fee_nanos ?? '0'));setMinimum(priceFromNanos(row.minimum_charge_nanos ?? '0'));setConflict(false);
    }catch(reason){if(!request.signal.aborted)setError(reason instanceof Error?reason.message:'Current price unavailable.');}
    finally{if(!request.signal.aborted)setBusy(false);}
  }
  async function save(event:FormEvent) {
    event.preventDefault();if(busy || conflict)return;
    const request=new AbortController();controller.current=request;setError('');setBusy(true);
    try {
      if(!model || !/^[A-Z]{3}$/.test(currency))throw new Error('Choose a model and enter a three-letter uppercase currency.');
      await publishCustomerPrice(token,target,{model_alias:model,currency,prompt_rate:priceToNanos(input),completion_rate:priceToNanos(output),cached_prompt_rate:cache.trim()?priceToNanos(cache):null,reasoning_completion_rate:current?.reasoning_completion_rate ?? null,request_fee_nanos:fee.trim()?priceToNanos(fee):'0',minimum_charge_nanos:minimum.trim()?priceToNanos(minimum):'0',expected_revision:current?.revision ?? null},request.signal);
      if(!request.signal.aborted)onSaved();
    }catch(reason){if(!request.signal.aborted){if(reason instanceof PublicationUnconfirmedError){setConflict(true);setError(reason.message);}else if(reason instanceof VendorRequestError && reason.status===409){setConflict(true);setError('This price changed or could not be published. Your draft is preserved. Load the current price before trying again.');}else setError(reason instanceof Error?reason.message:'Price could not be saved.');}}
    finally{if(!request.signal.aborted)setBusy(false);}
  }
  return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose();}}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{previous?'Edit customer price':'Publish customer price'}</DialogTitle><DialogDescription>{target.organization_name} · {target.workspace_name}. Changes apply to future admitted requests.</DialogDescription></DialogHeader>
    <form className="grid gap-4" onSubmit={save}>
      <div className="grid gap-2"><Label>Model</Label><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" disabled={!!previous||busy||conflict} className="justify-between">{model||'Choose model'}<IconChevronDown size={16}/></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="max-h-72 max-w-[calc(100vw-2rem)] overflow-y-auto"><DropdownMenuRadioGroup value={model} onValueChange={setModel}>{modelNames.map(name=><DropdownMenuRadioItem key={name} value={name}>{name}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div>
      <div className="grid gap-2"><Label htmlFor="price-currency">Currency</Label><Input id="price-currency" required maxLength={3} pattern="[A-Z]{3}" value={currency} disabled={busy} onChange={event=>setCurrency(event.target.value.toUpperCase())}/></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2"><Label htmlFor="price-input">Input per million tokens</Label><Input id="price-input" required inputMode="decimal" value={input} disabled={busy} onChange={event=>setInput(event.target.value)}/></div>
        <div className="grid gap-2"><Label htmlFor="price-output">Output per million tokens</Label><Input id="price-output" required inputMode="decimal" value={output} disabled={busy} onChange={event=>setOutput(event.target.value)}/></div>
      </div>
      <div className="grid gap-2"><Label htmlFor="price-cache">Cache read per million tokens</Label><Input id="price-cache" inputMode="decimal" value={cache} disabled={busy} onChange={event=>setCache(event.target.value)} aria-describedby="price-cache-help"/><p id="price-cache-help" className="text-sm text-muted-foreground">Blank uses the input rate. Zero is a valid price.</p></div>
      <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="price-fee">Fixed fee per completed request</Label><Input id="price-fee" inputMode="decimal" value={fee} disabled={busy} onChange={event=>setFee(event.target.value)}/></div><div className="grid gap-2"><Label htmlFor="price-minimum">Minimum per completed request</Label><Input id="price-minimum" inputMode="decimal" value={minimum} disabled={busy} onChange={event=>setMinimum(event.target.value)}/></div></div>
      {error&&<Alert variant="destructive"><AlertDescription>{error}{conflict&&<Button type="button" variant="outline" disabled={busy} onClick={()=>void reload()}>Load current price</Button>}</AlertDescription></Alert>}
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy||conflict||!model}>{busy?'Saving…':'Publish price'}</Button></div>
    </form>
  </DialogContent></Dialog>;
}
function PriceHistory({token,target,price,onClose}:{token:string;target:PricingTarget;price:CurrentTariff;onClose:()=>void}) {
  const [rows,setRows]=useState<CustomerTariffHistoryEntry[]>([]);
  const [cursor,setCursor]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [failed,setFailed]=useState<string|undefined>();
  const controller=useRef<AbortController|null>(null);
  async function load(before?:string){
    controller.current?.abort();const request=new AbortController();controller.current=request;setBusy(true);setError('');setFailed(undefined);
    try{const page=await readPriceHistory(token,target,price.model_alias,before,request.signal);if(request.signal.aborted)return;setRows(current=>before?[...current,...page.data.filter(item=>!current.some(saved=>saved.revision===item.revision))]:page.data);setCursor(page.next_before);}
    catch(reason){if(!request.signal.aborted){setFailed(before);setError(reason instanceof Error?reason.message:'Price history unavailable.');}}
    finally{if(!request.signal.aborted)setBusy(false);}
  }
  useEffect(()=>{void load();return()=>controller.current?.abort();},[token,target,price]);
  return <Dialog open onOpenChange={open=>{if(!open)onClose();}}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Price history</DialogTitle><DialogDescription>{price.model_alias} · {target.workspace_name}</DialogDescription></DialogHeader>
    {error&&<Alert variant="destructive"><AlertDescription>{error}<Button variant="outline" disabled={busy} onClick={()=>void load(failed)}>Retry history</Button></AlertDescription></Alert>}{busy&&<p role="status">Loading price revisions…</p>}
    {rows.map(row=><section key={row.revision} className="space-y-2 border-b py-3"><div className="flex flex-wrap items-center gap-2"><span>{new Date(row.created_at).toLocaleString()}</span>{row.is_current&&<Badge variant="secondary">Current</Badge>}</div><dl className="grid grid-cols-2 gap-2 text-sm"><dt>Input / 1M</dt><dd>{money(row.prompt_rate,row.currency)}</dd><dt>Output / 1M</dt><dd>{money(row.completion_rate,row.currency)}</dd><dt>Cache read / 1M</dt><dd>{row.cached_prompt_rate==null?'Input rate':money(row.cached_prompt_rate,row.currency)}</dd><dt>Fixed request fee</dt><dd>{money(row.request_fee_nanos??'0',row.currency)}</dd><dt>Minimum charge</dt><dd>{money(row.minimum_charge_nanos??'0',row.currency)}</dd></dl></section>)}
    {cursor&&<Button variant="outline" disabled={busy} onClick={()=>void load(cursor)}>Older revisions</Button>}
  </DialogContent></Dialog>;
}
