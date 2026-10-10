import { useGenerationKeys } from '@/features/generations/useGenerationKeys';
import SessionHistory from '@/features/generations/SessionHistory';
import { useBranding } from '@/app/branding';
import logo from "../../../../../branding/assets/niu-mark.png";
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router';
import { IconChevronDown as ChevronDown, IconLayoutSidebarLeftExpand as PanelLeft, IconLayoutSidebarLeftCollapse as PanelLeftClose, IconPlus as Plus, IconRefresh as RefreshCw } from '@tabler/icons-react';
import type { VideoEstimate, VideoJobBilling, VideoJobHistory, VideoJobState, VideoModelList, VideoTransportTimings } from '../../../../../sdks/javascript/src/index';
import { Button } from '@/components/ui/button';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { Sidebar, SidebarHeader, SidebarContent, useSidebar } from '@/components/ui/sidebar';
import type { DashboardContext } from '@/app/dashboard-context';
import { workspacePathSegment } from '@/app/workspace-route';
import { keyRequest, projectKeyPath, type ProjectKey } from '@/features/keys/api';
import { money } from '@/lib/money';
import { controlLabels, initialControls, videoRequest, type ControlValues } from './request';
import VideoResult from './VideoResult';
import VideoBilling from './VideoBilling';
import VideoLifecycle from './VideoLifecycle';
import ImageReferences, { type NamedImageReference } from './ImageReferences';
import './video.css';

const statusLabel: Record<string,string> = {submission_unknown:'Submission uncertain',queued:'Queued',running:'Running',succeeded:'Succeeded',failed:'Failed',unknown:'Status unavailable',reconciliation_required:'Needs reconciliation'};
function message(error: unknown) { return error instanceof Error ? error.message : 'The request could not be completed.'; }
class VideoHTTPError extends Error { constructor(readonly status:number, text:string) { super(text); } }
async function request<T>(token:string,path:string,body?:unknown,signal?:AbortSignal):Promise<T> {
  const response=await fetch(path,{method:body === undefined ? 'GET':'POST',headers:{authorization:`Bearer ${token}`,...(body === undefined ? {}:{'content-type':'application/json'})},body:body === undefined ? undefined:JSON.stringify(body),signal});
  const payload=await response.json().catch(()=>{throw new VideoHTTPError(response.status,'The server returned an unreadable response.');});
  if (!response.ok) throw new VideoHTTPError(response.status,payload?.error?.message ?? 'The request could not be completed.');
  return payload;
}
export default function VideoView({context}:{context:DashboardContext}) {
  const {settings:branding} = useBranding();
  const {token,workspace,workspaces,session}=context;
  const [keyPickerOpen,setKeyPickerOpen]=useState(false);
  const availableKeys=useGenerationKeys(context,keyPickerOpen);
  const [search,setSearch]=useSearchParams();
  const {toggleSidebar,isMobile,setOpenMobile,open,openMobile}=useSidebar();
  const [keys,setKeys]=useState<ProjectKey[]>([]);
  const [keysScope,setKeysScope]=useState('');
  const [keysError,setKeysError]=useState('');
  const [keysRevision,setKeysRevision]=useState(0);
  const [keyId,setKeyId]=useState('');
  const [models,setModels]=useState<VideoModelList['data']>([]);
  const [modelId,setModelId]=useState('');
  const [controls,setControls]=useState<ControlValues>({});
  const [prompt,setPrompt]=useState('');
  const [images,setImages]=useState<NamedImageReference[]>([]);
  const [readingImages,setReadingImages]=useState(false);
  const [jobs,setJobs]=useState<VideoJobHistory['data']>([]);
  const [nextBefore,setNextBefore]=useState<string|null>(null);
  const [job,setJob]=useState<VideoJobState|null>(null);
  const [billing,setBilling]=useState<VideoJobBilling|null>(null);
  const [timings,setTimings]=useState<VideoTransportTimings|null>(null);
  const [quote,setQuote]=useState<VideoEstimate|null>(null);
  const [quotedBody,setQuotedBody]=useState('');
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const [historyError,setHistoryError]=useState('');
  const [detailError,setDetailError]=useState('');
  const [revision,setRevision]=useState(0);
  const [uncertain,setUncertain]=useState(false);
  const [pane,setPane]=useState(search.get('job') ? 'result':'input');
  const lock=useRef(false);
  const historyTriggerRef=useRef<HTMLButtonElement>(null);
  const loadedBase=useRef('');
  const estimateController=useRef<AbortController|null>(null);
  const navigate=useNavigate();
  const selected=search.get('job') ?? '';
  const scopePath=workspace ? projectKeyPath(workspace.organization_id,workspace.id) : '';
  const keyScopeIdentity=JSON.stringify([token,scopePath]);
  const base=keyId && keysScope===keyScopeIdentity && keys.some(key=>key.id===keyId) ? `${scopePath}/${encodeURIComponent(keyId)}/video` : '';
  const responseScope = useRef({ identity: '', generation: 0 });
  const responseIdentity = JSON.stringify([token, base]);
  if (responseScope.current.identity !== responseIdentity) responseScope.current = { identity: responseIdentity, generation: responseScope.current.generation + 1 };
  const currentGeneration = () => responseScope.current.generation;
  useEffect(() => {
    lock.current=false;setBusy('');setUncertain(false);
    return () => { responseScope.current.generation += 1; };
  }, [token, base]);
  const model=models.find(item=>item.id === modelId);
  const canWrite=Boolean(session?.permissions.write);
  const canManageSuppliers=session?.kind === 'installation' || Boolean(session?.permissions.platform_admin);
  const workspacePath=workspace ? `/workspaces/${workspacePathSegment(workspace,workspaces)}` : '/workspaces/default';
  const form=useMemo(()=>{try{return {body:model ? videoRequest(model,prompt,controls,images):null,error:''};}catch(error){return {body:null,error:message(error)};}},[model,prompt,controls,images]);
  useEffect(()=>{setImages([]);},[base,modelId]);

  const quoteMatches = Boolean(quote && quotedBody === JSON.stringify(form.body));

  useEffect(()=>{document.title=`Video · Generations · ${branding.display_name}`;return()=>{document.title=`Generations · ${branding.display_name}`;};},[branding.display_name]);

  useEffect(()=>{
    const controller=new AbortController();
    setLoading(true); setKeysError('');setKeys([]);setKeysScope('');
    if (!scopePath) {setLoading(false);return;}
    void keyRequest<{data:ProjectKey[]}>(token,scopePath,'GET',undefined,controller.signal).then(payload=>{
      if(controller.signal.aborted)return;
      const active=payload.data.filter(key=>!key.revoked && !key.expired); setKeys(active);setKeysScope(keyScopeIdentity);
      setKeyId(current=>active.some(key=>key.id === current) ? current : active.find(key=>key.id === search.get('key'))?.id ?? active[0]?.id ?? '');
    }).catch(error=>{if(!controller.signal.aborted)setKeysError(message(error));}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
    // URL key restoration applies only when loading this workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[token,scopePath,keysRevision]);

  const requestedKey=search.get('key');
  useEffect(()=>{if(requestedKey && keys.some(key=>key.id===requestedKey))setKeyId(requestedKey);},[requestedKey,keys]);
  useEffect(()=>{
    const controller=new AbortController(); const changedScope=loadedBase.current !== base;
    if(changedScope){setModels([]);setJobs([]);setNextBefore(null);}
    setQuote(null);setHistoryError('');
    if (!base) return;
    setLoading(changedScope);setError('');
    void Promise.allSettled([
      request<VideoModelList>(token,`${base}/models`,undefined,controller.signal),
      request<VideoJobHistory>(token,`${base}/jobs?limit=25`,undefined,controller.signal),
    ]).then(([catalog,history])=>{
      if(controller.signal.aborted)return;
      if(catalog.status === 'fulfilled') {const selectedModel=catalog.value.data.find(model=>model.id === modelId) ?? catalog.value.data[0];const reset=changedScope || selectedModel?.id !== modelId;setModels(catalog.value.data);setModelId(selectedModel?.id ?? '');if(reset)setControls(selectedModel ? initialControls(selectedModel):{});loadedBase.current=base;}
      else setError(message(catalog.reason));
      if(history.status === 'fulfilled') {setJobs(history.value.data);setNextBefore(history.value.has_more ? history.value.next_before : null);}
      else setHistoryError(message(history.reason));
    }).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[token,base,revision]);
  useEffect(()=>{estimateController.current?.abort();setQuote(null);return()=>estimateController.current?.abort();},[prompt,controls,images,base,modelId]);
  useEffect(()=>{
    const controller=new AbortController();setJob(null);setBilling(null);setTimings(null);setDetailError('');
    if(!base || !selected)return;
    void Promise.allSettled([
      request<VideoJobState>(token,`${base}/jobs/${encodeURIComponent(selected)}`,undefined,controller.signal),
      request<VideoJobBilling>(token,`${base}/jobs/${encodeURIComponent(selected)}/billing`,undefined,controller.signal),
      request<VideoTransportTimings>(token,`${base}/jobs/${encodeURIComponent(selected)}/timings`,undefined,controller.signal),
    ]).then(([status,charges,spans])=>{
      if(controller.signal.aborted)return;
      if(status.status === 'fulfilled')setJob(status.value);else setDetailError(message(status.reason));
      if(charges.status === 'fulfilled')setBilling(charges.value);else setDetailError(message(charges.reason));
      if(spans.status === 'fulfilled')setTimings(spans.value);else setDetailError(message(spans.reason));
    });
    return()=>controller.abort();
  },[token,base,selected,revision]);

  function openJob(id:string) {setPane('result');const next=new URLSearchParams(search);next.set('job',id);next.set('key',keyId);setSearch(next);if(isMobile)setOpenMobile(false);}

  function chooseKey(id:string) {setPane('input');setKeyId(id);const next=new URLSearchParams(search);next.set('key',id);next.delete('job');setSearch(next);setPrompt('');setQuote(null);setUncertain(false);}
  async function estimate() {
    if(!form.body || !base || lock.current || readingImages)return;
    const controller=new AbortController();estimateController.current?.abort();estimateController.current=controller;
    setBusy('estimate');setError('');
    try {const result=await request<VideoEstimate>(token,`${base}/estimate`,form.body,controller.signal);if(!controller.signal.aborted){setQuote(result);setQuotedBody(JSON.stringify(form.body));}}
    catch(error){if(!controller.signal.aborted)setError(message(error));}
    finally{if(estimateController.current === controller)setBusy('');}
  }
  async function generate() {
    if(!form.body || !quoteMatches || !base || !canWrite || lock.current || uncertain || readingImages)return;
    const generation=currentGeneration();
    lock.current=true;setBusy('create');setError('');
    try {
      const result=await request<VideoJobState>(token,`${base}/jobs`,form.body);
      if(generation !== currentGeneration())return;
      setQuote(null);openJob(result.id);setRevision(value=>value+1);
    } catch(error) {
      if(generation !== currentGeneration())return;
      setError(message(error));
      // A lost create response may already represent a paid dispatch. Do not retry it.
      if(!(error instanceof VideoHTTPError) || ![400,401,402,403,404,501].includes(error.status))setUncertain(true);
    } finally {if(generation === currentGeneration()){lock.current=false;setBusy('');}}
  }
  async function refresh() {
    if(!base || !selected || lock.current || !canWrite)return;
    const generation=currentGeneration();
    lock.current=true;setBusy('refresh');setDetailError('');
    try {await request(token,`${base}/jobs/${encodeURIComponent(selected)}/refresh`,{});if(generation === currentGeneration())setRevision(value=>value+1);}
    catch(error){if(generation === currentGeneration())setDetailError(message(error));}
    finally{if(generation === currentGeneration()){lock.current=false;setBusy('');}}
  }
  async function more() {
    if(!nextBefore || !base || busy)return;const generation=currentGeneration();setBusy('history');setHistoryError('');
    try {const page=await request<VideoJobHistory>(token,`${base}/jobs?limit=25&before=${encodeURIComponent(nextBefore)}`);if(generation !== currentGeneration())return;setJobs(current=>[...current,...page.data.filter(job=>!current.some(existing=>existing.id === job.id))]);setNextBefore(page.has_more ? page.next_before:null);}
    catch(error){if(generation === currentGeneration())setHistoryError(message(error));}finally{if(generation === currentGeneration())setBusy('');}
  }

  const epoch=timings?.data[0]?.started_unix_ms ?? 0;
  const total=Math.max(1,...(timings?.data.map(span=>span.started_unix_ms-epoch+span.elapsed_ms) ?? []));
  return <div className="video-shell">
    <Sidebar id="video-history" className="niu-workspace-sidebar" mobileClassName="niu-workspace-sidebar-mobile" mobileStyle={{left:'var(--rail)',top:0,bottom:0,height:'100dvh',width:'min(var(--context), calc(100vw - var(--rail)))'}} mobileContentProps={{onCloseAutoFocus:event=>{if(historyTriggerRef.current?.isConnected){event.preventDefault();historyTriggerRef.current.focus();}},onInteractOutside:event=>{const target=event.detail.originalEvent.target;if(target instanceof Element && target.closest('.app-rail, .account-menu, [data-slot="dropdown-menu-sub-content"]')) event.preventDefault();}}} aria-label="Video history">
      <SidebarHeader className="sidebar-heading">
        <h2 className="sidebar-heading-row">Generations</h2>
      </SidebarHeader>
      <SidebarContent className="video-history">
        <div className="video-history-controls">

        <Button asChild variant="outline" disabled={Boolean(busy)}><Link to={`/generations?new=1${workspace ? `&workspace=${encodeURIComponent(workspace.id)}`:''}`}><Plus size={16}/>New generation</Link></Button>
        </div>
        {historyError && <p role="alert">{historyError}</p>}
        <SessionHistory context={context} currentKeys={keys} videoKeyId={keyId} videos={jobs.map(item=>({...item,keyId}))} activeVideo={selected} disabled={Boolean(busy)}/>
        {nextBefore && <Button variant="ghost" onClick={()=>void more()} disabled={Boolean(busy)}>Load more</Button>}
      </SidebarContent>
    </Sidebar>
    <section className="video-main" aria-label="Video generation">
      <header className="video-toolbar"><Button ref={historyTriggerRef} variant="ghost" size="icon" onClick={toggleSidebar} aria-label="Toggle video history" aria-controls="video-history" aria-expanded={isMobile ? openMobile : open}>{(isMobile ? openMobile : open) ? <PanelLeftClose size={18}/> : <PanelLeft size={18}/>}</Button><a className="mobile-header-brand" href={import.meta.env.BASE_URL} aria-label="niu.io home"><img src={logo} alt="" /></a><h1>{selected ? job?.model ? `Video · ${job.model}` : 'Video session' : 'New generation'}</h1></header>
      <div className="video-content">
        {(keysError || error) && <div role="alert" className="video-error">{keysError || error}<Button variant="ghost" onClick={()=>keysError ? setKeysRevision(value=>value+1) : setRevision(value=>value+1)} disabled={Boolean(busy) || loading}>Reload</Button></div>}
        {!workspace ? <p>Add an API key to generate videos.</p> : <>
        <Tabs value={pane} onValueChange={setPane} className="video-panes"><TabsList className="video-pane-tabs" aria-label="Video panels"><TabsTrigger value="input">Input</TabsTrigger><TabsTrigger value="result" disabled={!model && !selected}>Result</TabsTrigger></TabsList><div className="video-input-result" data-empty={!model && !selected ? 'true':undefined}>
          <TabsContent value="input" forceMount className="video-input" aria-label="Video input">
            <div className="flex items-center justify-between gap-3"><h2>Video generation</h2>{!selected&&<Button asChild variant="ghost" size="sm" disabled={Boolean(busy)}><Link to={`/generations?new=1${workspace ? `&workspace=${encodeURIComponent(workspace.id)}`:''}`}>Change task</Link></Button>}</div>
            <Label>API key</Label>
            <DropdownMenu open={keyPickerOpen} onOpenChange={setKeyPickerOpen}><DropdownMenuTrigger asChild><Button variant="outline" className="video-choice" aria-label="Video API key" disabled={Boolean(busy) || loading}>{keys.find(key=>key.id === keyId)?.name ?? (loading ? 'Loading keys…':'No active API key')}<ChevronDown size={14}/></Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuRadioGroup value={keyId} onValueChange={id=>{const chosen=availableKeys.keys.find(key=>key.id===id);if(chosen&&chosen.workspace.id!==workspace?.id){navigate(`/generations?mode=video&new=1&workspace=${encodeURIComponent(chosen.workspace.id)}&key=${encodeURIComponent(id)}`);}else chooseKey(id);}}>{(availableKeys.keys.length?availableKeys.keys:keys.map(key=>({...key,workspace}))).map(key=><DropdownMenuRadioItem key={key.id} value={key.id}>{key.name}{key.workspace && key.workspace.id!==workspace?.id ? ` · ${key.workspace.name}`:''}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
            {!loading && !keys.length && <Button asChild variant="outline"><Link to={`${workspacePath}/keys`}>Manage API keys</Link></Button>}
            {loading ? <p role="status" className="video-muted">Loading video models…</p> : keys.length > 0 && !model && !error && !keysError ? <Empty className="min-h-60"><EmptyHeader><EmptyTitle role="heading" aria-level={3}>No video model available</EmptyTitle><EmptyDescription>This API key has no supported video route.</EmptyDescription></EmptyHeader><EmptyContent><Button asChild variant="outline"><Link to={canManageSuppliers ? '/admin/suppliers':`/models?workspace=${encodeURIComponent(workspace.id)}`}>{canManageSuppliers ? 'Manage Suppliers':'View models'}</Link></Button></EmptyContent></Empty> : model && <>
              <Label>Model</Label>
              <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="video-choice" aria-label="Video model" disabled={Boolean(busy)}>{model.id}<ChevronDown size={14}/></Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuRadioGroup value={modelId} onValueChange={id=>{setModelId(id);const next=models.find(model=>model.id === id);setControls(next ? initialControls(next):{});}}>{models.map(item=><DropdownMenuRadioItem key={item.id} value={item.id}>{item.id}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
              <Label htmlFor="video-prompt">Prompt</Label><Textarea id="video-prompt" placeholder="Describe your video…" rows={5} value={prompt} onChange={event=>setPrompt(event.target.value)} disabled={busy === 'create'}/>
              <ImageReferences model={model} images={images} onChange={setImages} disabled={Boolean(busy) || uncertain} onReadingChange={reading=>{setReadingImages(reading);if(reading){estimateController.current?.abort();setQuote(null);}}}/>
              <Collapsible><CollapsibleTrigger asChild><Button variant="ghost" className="video-choice">Additional settings<ChevronDown size={14}/></Button></CollapsibleTrigger><CollapsibleContent className="video-controls">
                {Object.entries(model.controls).map(([name,rule])=><div key={name} className="video-field"><Label htmlFor={`video-${name}`}>{controlLabels[name] ?? name}</Label>
                  {rule.kind === 'choice' ? <DropdownMenu><DropdownMenuTrigger asChild><Button id={`video-${name}`} variant="outline" className="video-choice" disabled={busy === 'create'}>{String(controls[name] ?? 'Choose…')}<ChevronDown size={14}/></Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuRadioGroup value={String(controls[name] ?? '')} onValueChange={value=>setControls(current=>{const next={...current,[name]:value};if(name === 'resolution' && !model.output.specifications.some(spec=>spec.resolution === value && spec.ratio === current.ratio)){const spec=model.output.specifications.find(spec=>spec.resolution === value);if(spec)next.ratio=spec.ratio;}return next;})}>{rule.values.filter(value=>name !== 'ratio' || model.output.specifications.some(spec=>spec.resolution === controls.resolution && spec.ratio === value)).map(value=><DropdownMenuRadioItem key={value} value={value}>{value}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
                  : rule.kind === 'integer' ? <><Input id={`video-${name}`} type="number" min={rule.minimum} max={rule.maximum} step={1} value={String(controls[name] ?? '')} onChange={event=>setControls(current=>({...current,[name]:event.target.value}))} disabled={busy === 'create'}/><small className="video-muted">{rule.minimum}–{rule.maximum}</small></>
                  : <Checkbox id={`video-${name}`} checked={controls[name] === true} onCheckedChange={checked=>setControls(current=>({...current,[name]:checked === true}))} disabled={busy === 'create'}/>}</div>)}
              <Button variant="ghost" onClick={()=>setControls(initialControls(model))} disabled={busy === 'create'}>Reset settings</Button>
              </CollapsibleContent></Collapsible>
              {prompt && form.error && <p role="alert" className="video-error">{form.error}</p>}
              {quoteMatches && quote && <div className="video-estimate"><span>{quote.effective_output.specification.resolution} · {quote.effective_output.specification.ratio} · {quote.effective_output.duration_seconds}s · {quote.effective_output.frames_per_second} FPS</span><strong>{quote.estimate.amount_nanos != null && quote.estimate.currency ? `Estimated ${money(quote.estimate.amount_nanos,quote.estimate.currency)}`:'Charged by your Supplier account'}</strong>{quote.maximum_charge_nanos != null && quote.estimate.currency && <small>Reserves up to {money(quote.maximum_charge_nanos,quote.estimate.currency)}. Final charge follows reported usage.</small>}</div>}
              {uncertain && <p role="alert">Submission may have reached the Supplier. Check saved jobs before starting another video.</p>}
              <div className="video-actions"><Button variant="outline" onClick={()=>void estimate()} disabled={!form.body || Boolean(busy) || uncertain || readingImages}>{busy === 'estimate' ? 'Estimating…':'Estimate'}</Button><Button onClick={()=>void generate()} disabled={!quoteMatches || !canWrite || !form.body || Boolean(busy) || uncertain || readingImages}>{busy === 'create' ? 'Submitting…':'Generate video'}</Button></div>
              {!canWrite && <small className="video-muted">Read access can estimate; generation needs write access.</small>}
            </>}
          </TabsContent>
          {(model || selected) && <TabsContent value="result" forceMount className="video-result" aria-label="Video result">
            <div className="video-result-heading"><h2>{job?.model ?? 'Result'}</h2>{job && <Badge variant="secondary">{statusLabel[job.status]}</Badge>}</div>
            {detailError && <p role="alert" className="video-error">{detailError}</p>}
            {selected && !job && detailError && <Button variant="outline" onClick={()=>setRevision(value=>value+1)} disabled={Boolean(busy)}>Reload status</Button>}
            {!selected ? <p className="video-muted">Submit a video or select a saved job.</p> : !base && !loading ? <p className="video-muted">Choose an active API key to load this saved video.</p> : !job && !detailError ? <p role="status">Loading saved video…</p> : job && <>
              {(job.status === 'submission_unknown' || job.status === 'reconciliation_required') && <p>The outcome is unresolved. Do not resubmit this generation.</p>}
              <Tabs defaultValue="status"><TabsList><TabsTrigger value="status">Status</TabsTrigger><TabsTrigger value="billing">Billing</TabsTrigger></TabsList>
                <TabsContent value="status" className="video-details">
                  {job.status === 'succeeded' && <VideoResult key={`${base}/${selected}`} token={token} path={`${base}/jobs/${encodeURIComponent(selected)}/results`} canWrite={canWrite}/>} 
                  <div className="video-actions"><Button variant="outline" onClick={()=>setRevision(value=>value+1)} disabled={Boolean(busy)}>Reload status</Button><Button variant="ghost" onClick={()=>void refresh()} disabled={!canWrite || Boolean(busy) || job.status === 'submission_unknown'}><RefreshCw size={14}/>{busy === 'refresh' ? 'Checking…':'Check Supplier'}</Button></div>
                  {timings?.lifecycle && <VideoLifecycle timing={timings.lifecycle}/>}
                  {timings?.data.length ? <div className="video-timings"><h3>Transport time</h3><p className="video-muted">Submission and status requests; Supplier queue and generation time are not measured here.</p>{timings.data.map((span,index)=><div className="video-span" key={index}><span>{span.phase === 'submission' ? 'Submission':'Status query'}</span><div className="video-span-track"><i style={{marginLeft:`${(span.started_unix_ms-epoch)/total*100}%`,width:`${Math.max(.5,span.elapsed_ms/total*100)}%`}}/></div><small>{span.elapsed_ms} ms</small></div>)}{timings.has_more && <small>Showing the latest recorded requests.</small>}</div> : null}
                </TabsContent>
                <TabsContent value="billing" className="video-details">{billing ? <VideoBilling billing={billing}/> : <p>Billing is unavailable.</p>}</TabsContent>
              </Tabs>
              <Button asChild variant="link"><Link to={`${workspacePath}/executions?modelAlias=${encodeURIComponent(job.model)}#gateway-attempt-${encodeURIComponent(job.id)}`}>View in Logs</Link></Button>
            </>}
          </TabsContent>}
        </div></Tabs></>}
      </div>
    </section>
  </div>;
}
