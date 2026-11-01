import { readLocale as readUILocale } from '@/shell/ui-locale';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { usePlatformCurrency } from '@/shell/platform-currency';
import { PricingHealthNotice } from '@/features/retail-pricing/pricing-health';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { IconChevronDown, IconRefresh, IconSearch } from '@tabler/icons-react';
import { useDashboardContext } from '@/shell/dashboard-context';
import { workspaceDisplayName } from '@/shell/workspace-route';
import PageHeader from '@/components/PageHeader';
import { ListRowsSkeleton, TableSkeleton } from '@/components/PageSkeletons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { money } from '@/lib/money';
import { VendorRequestError } from '@/features/providers/api';
import type { CustomerTariffHistoryEntry } from '@niu-io/sdk/admin';
import { PublicationUnconfirmedError, listPricingModels, listPricingTargets, listCustomerPrices, peekCustomerPrices, peekPricingTargets, readPriceHistory, publishCustomerPrice, priceFromNanos, priceToNanos, type PricingTarget, type CurrentTariff } from './api';

export default function CustomerPricingRoute() {
  const { token } = useDashboardContext();
  return <PricingTargets key={token} token={token} />;
}
function PricingTargets({ token }: { token: string }) {
  const { t: uiT } = useUILocale();
  const [search, setSearch] = useSearchParams();
  const selectedId = search.get('target');
  const initialTargets = peekPricingTargets(token);
  const [targets, setTargets] = useState<PricingTarget[]>(() => initialTargets?.data ?? []);
  const [cursor, setCursor] = useState<string | null>(() => initialTargets?.next_after ?? null);
  const [loading, setLoading] = useState(() => Boolean(token && !initialTargets));
  const [error, setError] = useState('');
  const [failedCursor, setFailedCursor] = useState<string | undefined>();
  const activeRequest = useRef<AbortController | null>(null);
  async function load(after?: string, force = true) {
    activeRequest.current?.abort();
    const controller = new AbortController(); activeRequest.current = controller;
    if (after || force || !initialTargets) setLoading(true);
    setError(''); setFailedCursor(undefined);
    try {
      const page = await listPricingTargets(token, after, controller.signal, force);
      if (controller.signal.aborted) return;
      setTargets(current => after ? [...current, ...page.data.filter(row => !current.some(saved => saved.workspace_id === row.workspace_id))] : page.data);
      setCursor(page.next_after);
    } catch (reason) { if (!controller.signal.aborted) { setFailedCursor(after); setError(reason instanceof Error ? reason.message : 'Pricing targets unavailable.'); } }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  useEffect(() => { void load(undefined, false); return () => activeRequest.current?.abort(); }, [token]);
  const selected = targets.find(row => row.workspace_id === selectedId);
  useEffect(() => { if (selectedId && !selected && cursor && !loading && !error) void load(cursor); }, [selectedId, selected, cursor, loading, error]);
  return <div className="space-y-6 pt-4">
    <div className="flex flex-wrap items-center gap-3">
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="max-w-full" disabled={loading && !targets.length}><span className="truncate">{selected ? `${selected.organization_name} · ${workspaceDisplayName(selected.workspace_name)}` : uiT("Choose company and workspace")}</span><IconChevronDown size={16} className="shrink-0"/></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 max-w-[calc(100vw-2rem)] overflow-y-auto"><DropdownMenuRadioGroup value={selectedId ?? ''} onValueChange={value => setSearch(current => { current.set('target', value); return current; })}>
          {targets.map(row => <DropdownMenuRadioItem key={row.workspace_id} value={row.workspace_id}>{row.organization_name} · {workspaceDisplayName(row.workspace_name)}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>{cursor && <DropdownMenuItem disabled={loading} onSelect={event => { event.preventDefault(); void load(cursor); }}>{loading ? uiT("Loading…") : uiT("More workspaces")}</DropdownMenuItem>}</DropdownMenuContent>
      </DropdownMenu>
      <Button variant="ghost" aria-label={uiT("Refresh pricing targets")} disabled={loading} onClick={() => void load()}><IconRefresh size={16}/></Button>
    </div>
    {error && <Alert variant="destructive"><AlertDescription>{error}<Button variant="outline" disabled={loading} onClick={() => void load(failedCursor)}>{uiT("Retry targets")}</Button></AlertDescription></Alert>}
    {loading && !targets.length && <ListRowsSkeleton rows={3} label={uiT("Loading pricing targets…")} />}
    {selected ? <Prices key={`${token}:${selected.workspace_id}`} token={token} target={selected}/> : !loading && !error && <p className="text-muted-foreground">{selectedId ? uiT("This pricing target is unavailable. Choose another workspace.") : targets.length ? uiT("Select a company and workspace to manage customer selling prices.") : uiT("No pricing targets are available.")}</p>}
  </div>;
}
function Prices({ token, target }: { token: string; target: PricingTarget }) {
  const { t: uiT, format: uiF } = useUILocale();
  const initialPrices = peekCustomerPrices(token, target);
  const [modelNames, setModelNames] = useState<string[]>([]);
  const [modelsError, setModelsError] = useState('');
  const [modelsReady, setModelsReady] = useState(false);
  const [modelReload, setModelReload] = useState(0);
  const lastModelReload = useRef(0);
  const [rows, setRows] = useState<CurrentTariff[]>(() => initialPrices?.data ?? []);
  const [cursor, setCursor] = useState<string | null>(() => initialPrices?.next_after ?? null);
  const [loading, setLoading] = useState(() => !initialPrices);
  const [loaded, setLoaded] = useState(() => Boolean(initialPrices));
  const [error, setError] = useState('');
  const [failedCursor, setFailedCursor] = useState<string | undefined>();
  const [filter, setFilter] = useState('');
  const [editor, setEditor] = useState<{previous: CurrentTariff | null} | null>(null);
  const [history, setHistory] = useState<CurrentTariff | null>(null);
  const [notice, setNotice] = useState('');
  const activeRequest = useRef<AbortController | null>(null);
  async function load(after?: string, force = true) {
    activeRequest.current?.abort(); const controller = new AbortController(); activeRequest.current = controller;
    if (after || force || !initialPrices) setLoading(true);
    setError(''); setFailedCursor(undefined);
    try {
      const page = await listCustomerPrices(token, target, after, controller.signal, force);
      if (controller.signal.aborted) return;
      setRows(current => after ? [...current, ...page.data.filter(row => !current.some(saved => saved.model_alias === row.model_alias))] : page.data);
      setCursor(page.next_after); setLoaded(true);
    } catch (reason) { if (!controller.signal.aborted) { setFailedCursor(after); setError(reason instanceof Error ? reason.message : 'Prices unavailable.'); } }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  useEffect(() => { void load(undefined, false); return () => activeRequest.current?.abort(); }, [token, target]);
  useEffect(() => {
    const request = new AbortController(); setModelsReady(false); setModelsError('');
    const force = lastModelReload.current !== modelReload;
    lastModelReload.current = modelReload;
    listPricingModels(token, request.signal, force).then(names => { if (!request.signal.aborted) { setModelNames(names); setModelsReady(true); } })
      .catch(reason => { if (!request.signal.aborted) setModelsError(reason instanceof Error ? reason.message : 'Pricing models unavailable.'); });
    return () => request.abort();
  }, [token, modelReload]);
  return <>
    <PageHeader title={uiT("Pricing")} action={<Button disabled={!loaded || loading || !modelsReady || !modelNames.length} onClick={() => { setNotice(''); setEditor({previous:null}); }}>{uiT("Publish price")}</Button>}/>
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex w-full min-w-0 items-center gap-2 sm:max-w-sm">
        <IconSearch size={16} className="shrink-0" aria-hidden="true" />
        <Input type="search" aria-label={uiT("Filter customer models")} placeholder={uiT("Filter by model name…")} value={filter} onChange={event => setFilter(event.target.value)} />
      </div>
      <Button variant="outline" disabled={loading} onClick={() => void load()}>{uiT("Refresh prices")}</Button>
    </div>
    {notice && <p role="status">{notice}</p>}
    {modelsError && <Alert variant="destructive"><AlertDescription>{modelsError}<Button variant="outline" onClick={() => setModelReload(value => value + 1)}>{uiT("Retry models")}</Button></AlertDescription></Alert>}
    {error && <Alert variant="destructive"><AlertDescription>{error}<Button variant="outline" disabled={loading} onClick={() => void load(failedCursor)}>{uiT("Retry prices")}</Button></AlertDescription></Alert>}
    {loading && <TableSkeleton columns={7} rows={rows.length ? 2 : 5} label={uiT("Loading prices…")} />}
    {loaded && !rows.length ? <p className="text-muted-foreground">{uiT("No customer prices published for this workspace.")}</p> : rows.length > 0 && <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>{uiT("Model")}</TableHead><TableHead>{uiT("Currency")}</TableHead><TableHead>{uiT("Input / 1M")}</TableHead><TableHead>{uiT("Output / 1M")}</TableHead><TableHead>{uiT("Cache read / 1M")}</TableHead><TableHead>{uiT("Price checks")}</TableHead><TableHead>{uiT("Actions")}</TableHead></TableRow></TableHeader><TableBody>
      {rows.filter(row => row.model_alias.toLowerCase().includes(filter.toLowerCase().trim())).map(row => <TableRow key={row.model_alias}><TableCell>{row.model_alias}</TableCell><TableCell>{row.currency}</TableCell><TableCell>{priceFromNanos(row.prompt_rate)}</TableCell><TableCell>{priceFromNanos(row.completion_rate)}</TableCell><TableCell>{row.cached_prompt_rate == null ? uiT("Input rate") : priceFromNanos(row.cached_prompt_rate)}</TableCell><TableCell><PricingHealthNotice health={row.pricing_health} /></TableCell><TableCell><div className="flex gap-2"><Button variant="ghost" onClick={() => setEditor({previous:row})} aria-label={uiF("Edit {0}", [row.model_alias])}>{uiT("Edit")}</Button><Button variant="ghost" onClick={() => setHistory(row)} aria-label={uiF("History for {0}", [row.model_alias])}>{uiT("History")}</Button></div></TableCell></TableRow>)}
    </TableBody></Table></div>}
    {loaded && rows.length > 0 && !rows.some(row => row.model_alias.toLowerCase().includes(filter.toLowerCase().trim())) && <p>{uiT("No loaded prices match this filter.")}</p>}
    {cursor && <Button variant="outline" disabled={loading} onClick={() => void load(cursor)}>{uiT("More prices")}</Button>}
    {editor && <PriceEditor token={token} target={target} previous={editor.previous} modelNames={modelNames} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); setNotice('Customer price published. Future requests use the new price.'); void load(); }}/>} 
    {history && <PriceHistory token={token} target={target} price={history} onClose={() => setHistory(null)}/>}
  </>;
}
function PriceEditor({token,target,previous,modelNames,onClose,onSaved}: {token:string;target:PricingTarget;previous:CurrentTariff|null;modelNames:string[];onClose:()=>void;onSaved:()=>void}) {
  const { t: uiT } = useUILocale();
  const [current,setCurrent]=useState(previous);
  const [model,setModel]=useState(previous?.model_alias ?? '');
  const {currency:platformCurrency}=usePlatformCurrency();
  const currency=previous?.currency ?? platformCurrency;
  const [input,setInput]=useState(previous ? priceFromNanos(previous.prompt_rate) : '');
  const [output,setOutput]=useState(previous ? priceFromNanos(previous.completion_rate) : '');
  const [cache,setCache]=useState(previous?.cached_prompt_rate != null ? priceFromNanos(previous.cached_prompt_rate) : '');
  const [reasoning,setReasoning]=useState(previous?.reasoning_completion_rate != null ? priceFromNanos(previous.reasoning_completion_rate) : '');
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
      setCurrent(row);setInput(priceFromNanos(row.prompt_rate));setOutput(priceFromNanos(row.completion_rate));setCache(row.cached_prompt_rate == null ? '' : priceFromNanos(row.cached_prompt_rate));setReasoning(row.reasoning_completion_rate == null ? '' : priceFromNanos(row.reasoning_completion_rate));setFee(priceFromNanos(row.request_fee_nanos ?? '0'));setMinimum(priceFromNanos(row.minimum_charge_nanos ?? '0'));setConflict(false);
    }catch(reason){if(!request.signal.aborted)setError(reason instanceof Error?reason.message:'Current price unavailable.');}
    finally{if(!request.signal.aborted)setBusy(false);}
  }
  async function save(event:FormEvent) {
    event.preventDefault();if(busy || conflict)return;
    const request=new AbortController();controller.current=request;setError('');setBusy(true);
    try {
      if(!model || !/^[A-Z]{3}$/.test(currency))throw new Error('Choose a model and enter a three-letter uppercase currency.');
      await publishCustomerPrice(token,target,{model_alias:model,currency,prompt_rate:priceToNanos(input),completion_rate:priceToNanos(output),cached_prompt_rate:cache.trim()?priceToNanos(cache):null,reasoning_completion_rate:reasoning.trim()?priceToNanos(reasoning):null,request_fee_nanos:fee.trim()?priceToNanos(fee):'0',minimum_charge_nanos:minimum.trim()?priceToNanos(minimum):'0',expected_revision:current?.revision ?? null},request.signal);
      if(!request.signal.aborted)onSaved();
    }catch(reason){if(!request.signal.aborted){if(reason instanceof PublicationUnconfirmedError){setConflict(true);setError(reason.message);}else if(reason instanceof VendorRequestError && reason.status===409){setConflict(true);setError('This price changed or could not be published. Your draft is preserved. Load the current price before trying again.');}else setError(reason instanceof Error?reason.message:'Price could not be saved.');}}
    finally{if(!request.signal.aborted)setBusy(false);}
  }
  return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose();}}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{previous?uiT("Edit customer price"):uiT("Publish customer price")}</DialogTitle><DialogDescription>{target.organization_name} · {workspaceDisplayName(target.workspace_name)}{uiT(". Changes apply to future admitted requests.")}</DialogDescription></DialogHeader>
    <form className="grid gap-4" onSubmit={save}>
      <div className="grid gap-2"><Label>{uiT("Model")}</Label><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" disabled={!!previous||busy||conflict} className="justify-between">{model||uiT("Choose model")}<IconChevronDown size={16}/></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="max-h-72 max-w-[calc(100vw-2rem)] overflow-y-auto"><DropdownMenuRadioGroup value={model} onValueChange={setModel}>{modelNames.map(name=><DropdownMenuRadioItem key={name} value={name}>{name}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div>
      <p className="text-sm text-muted-foreground">{uiT("Currency:")}{" "}{currency || uiT("configure in Admin")}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2"><Label htmlFor="price-input">{uiT("Input per million tokens")}</Label><Input id="price-input" required inputMode="decimal" value={input} disabled={busy} onChange={event=>setInput(event.target.value)}/></div>
        <div className="grid gap-2"><Label htmlFor="price-output">{uiT("Output per million tokens")}</Label><Input id="price-output" required inputMode="decimal" value={output} disabled={busy} onChange={event=>setOutput(event.target.value)}/></div>
      </div>
      <div className="grid gap-2"><Label htmlFor="price-cache">{uiT("Cache read per million tokens")}</Label><Input id="price-cache" inputMode="decimal" value={cache} disabled={busy} onChange={event=>setCache(event.target.value)} aria-describedby="price-cache-help"/><p id="price-cache-help" className="text-sm text-muted-foreground">{uiT("Blank uses the input rate. Zero is a valid price.")}</p></div>
      <div className="grid gap-2"><Label htmlFor="price-reasoning">{uiT("Reasoning output per million tokens")}</Label><Input id="price-reasoning" inputMode="decimal" value={reasoning} disabled={busy} onChange={event=>setReasoning(event.target.value)} aria-describedby="price-reasoning-help"/><p id="price-reasoning-help" className="text-sm text-muted-foreground">{uiT("Blank uses the output rate. Zero is a valid price. A separate rate requires reported reasoning token usage.")}</p></div>
      <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="price-fee">{uiT("Fixed fee per completed request")}</Label><Input id="price-fee" inputMode="decimal" value={fee} disabled={busy} onChange={event=>setFee(event.target.value)}/></div><div className="grid gap-2"><Label htmlFor="price-minimum">{uiT("Minimum per completed request")}</Label><Input id="price-minimum" inputMode="decimal" value={minimum} disabled={busy} onChange={event=>setMinimum(event.target.value)}/></div></div>
      {error&&<Alert variant="destructive"><AlertDescription>{error}{conflict&&<Button type="button" variant="outline" disabled={busy} onClick={()=>void reload()}>{uiT("Load current price")}</Button>}</AlertDescription></Alert>}
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={busy} onClick={onClose}>{uiT("Cancel")}</Button><Button type="submit" disabled={busy||conflict||!model}>{busy?uiT("Saving…"):uiT("Publish price")}</Button></div>
    </form>
  </DialogContent></Dialog>;
}
function PriceHistory({token,target,price,onClose}:{token:string;target:PricingTarget;price:CurrentTariff;onClose:()=>void}) {
  const { t: uiT } = useUILocale();
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
  return <Dialog open onOpenChange={open=>{if(!open)onClose();}}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{uiT("Price history")}</DialogTitle><DialogDescription>{price.model_alias} · {workspaceDisplayName(target.workspace_name)}</DialogDescription></DialogHeader>
    {error&&<Alert variant="destructive"><AlertDescription>{error}<Button variant="outline" disabled={busy} onClick={()=>void load(failed)}>{uiT("Retry history")}</Button></AlertDescription></Alert>}{busy&&<ListRowsSkeleton rows={3} label={uiT("Loading price revisions…")}/>}
    {rows.map(row=><section key={row.revision} className="space-y-2 border-b py-3"><div className="flex flex-wrap items-center gap-2"><span>{new Date(row.created_at).toLocaleString(readUILocale())}</span>{row.is_current&&<Badge variant="secondary">{uiT("Current")}</Badge>}</div><dl className="grid grid-cols-2 gap-2 text-sm"><dt>{uiT("Input / 1M")}</dt><dd>{money(row.prompt_rate,row.currency)}</dd><dt>{uiT("Output / 1M")}</dt><dd>{money(row.completion_rate,row.currency)}</dd><dt>{uiT("Cache read / 1M")}</dt><dd>{row.cached_prompt_rate==null?uiT("Input rate"):money(row.cached_prompt_rate,row.currency)}</dd><dt>{uiT("Reasoning output / 1M")}</dt><dd>{row.reasoning_completion_rate==null?uiT("Output rate"):money(row.reasoning_completion_rate,row.currency)}</dd><dt>{uiT("Fixed request fee")}</dt><dd>{money(row.request_fee_nanos??'0',row.currency)}</dd><dt>{uiT("Minimum charge")}</dt><dd>{money(row.minimum_charge_nanos??'0',row.currency)}</dd></dl></section>)}
    {cursor&&<Button variant="outline" disabled={busy} onClick={()=>void load(cursor)}>{uiT("Older revisions")}</Button>}
  </DialogContent></Dialog>;
}
