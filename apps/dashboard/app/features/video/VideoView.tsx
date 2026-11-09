import { translateUI } from '@/shell/ui-locale';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { validateSavedVideoReferences } from './request';
import { useGenerationKeys } from '@/features/generations/useGenerationKeys';
import { GenerationSessionBindings } from '@/features/generations/GenerationsLayout';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams, useNavigate, useLocation } from 'react-router';
import { IconLoader2 as Loader, IconInfoCircle as InfoCircle, IconChevronDown as ChevronDown, IconArrowUp as ArrowUp, IconAdjustmentsHorizontal as Settings, IconKey as KeyIcon, IconRefresh as RefreshCw } from '@tabler/icons-react';
import { ScanFace } from 'lucide-react';
import type { VideoEstimate, VideoJobBilling, VideoJobState, VideoModelList, VideoTransportTimings } from '@niu-io/sdk';
import { NiuAdminClient, type VideoIntentRequest, type VideoSubmissionIntent, type NativeProviderModule, type GenerationTask, type VideoComposerDraftPayload } from '@niu-io/sdk/admin';
import { useVideoDraft, type VideoDraftTicket } from './useVideoDraft';
import { VideoIntent } from './intent';
import { prepareVideoSessionIntent } from './session-intent';
import { findVideoIntent, videoSessionTitle } from './intent-history';
import { Button } from '@/components/ui/button';
import { FormSectionSkeleton, ListRowsSkeleton } from '@/components/PageSkeletons';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { useSidebar } from '@/components/ui/sidebar';
import type { DashboardContext } from '@/shell/dashboard-context';
import { workspaceDisplayName, workspacePathSegment } from '@/shell/workspace-route';
import { keyRequest, workspaceKeyPath, type ProjectKey } from '@/features/keys/api';
import { formatUnitAtoms, money } from '@/lib/money';
import { formatDurationMs, formatDurationSeconds } from '@/lib/duration';
import { usePlatformCurrency } from '@/shell/platform-currency';
import { controlLabels, initialControls, videoRequest, type ControlValues } from './request';
import VideoResult from './VideoResult';
import VideoBilling from './VideoBilling';
import VideoLifecycle from './VideoLifecycle';
import ImageReferences, { type NamedImageReference } from './ImageReferences';
import './video.css';
import { findSupportedProviderModule, ProviderGenerationTools } from '@/features/provider-modules/registry';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

const statusLabel: Record<string,string> = {submission_unknown:'Submission uncertain',queued:'Queued',running:'Running',succeeded:'Succeeded',failed:'Failed',unknown:'Status unavailable',reconciliation_required:'Needs reconciliation'};
function message(error: unknown) { return error instanceof Error ? error.message : 'The request could not be completed.'; }
function boundedVideoTitle(promptText: string, modelName: string) {
  const line = promptText.split('\n').map(item => item.trim()).find(Boolean) ?? '';
  let title = line || (modelName.trim() ? `Video · ${modelName.trim()}` : 'Video request');
  const bytes = new TextEncoder();
  while (bytes.encode(title).length > 200) title = title.slice(0, -1);
  return title.trim() || 'Video request';
}
class VideoHTTPError extends Error { constructor(readonly status:number, text:string) { super(text); } }
type SavedVideoTask = Pick<GenerationTask, 'id' | 'model' | 'state' | 'reference'> & {session_id?: string};
class VideoTaskResponseError extends Error {
  constructor() { super('The server returned an invalid saved video. Reload status to try again.'); this.name='VideoTaskResponseError'; }
}
function savedVideoTask(response: unknown, selected: string): SavedVideoTask {
  const task = response && typeof response === 'object' && 'data' in response ? response.data : null;
  if (!task || typeof task !== 'object' || !('id' in task) || typeof task.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(task.id) || (task.id !== selected && (!/^run-[1-9][0-9]{0,18}$/.test(selected) || !('reference' in task) || task.reference !== selected))
    || !('kind' in task) || task.kind !== 'video'
    || !('model' in task) || typeof task.model !== 'string' || !task.model.trim()
    || !('state' in task) || typeof task.state !== 'string' || !Object.hasOwn(statusLabel,task.state)) {
    throw new VideoTaskResponseError();
  }
  return {...('session_id' in task && typeof task.session_id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(task.session_id) ? {session_id:task.session_id}:{}), id: task.id, model: task.model, state: task.state as GenerationTask['state'], ...('reference' in task && typeof task.reference==='string' && /^run-[1-9][0-9]{0,18}$/.test(task.reference) ? {reference:task.reference}:{})};
}
async function request<T>(token:string,keyId:string,path:string,body?:unknown,signal?:AbortSignal):Promise<T> {
  const response=await fetch(path,{method:body === undefined ? 'GET':'POST',headers:{authorization:`Bearer ${token}`,'x-niu-key-id':keyId,...(body === undefined ? {}:{'content-type':'application/json'})},body:body === undefined ? undefined:JSON.stringify(body),signal});
  const payload=await response.json().catch(()=>{throw new VideoHTTPError(response.status,'The server returned an unreadable response.');});
  if (!response.ok) throw new VideoHTTPError(response.status,payload?.error?.message ?? 'The request could not be completed.');
  return payload;
}
type ExtendedVideoEstimate = VideoEstimate & {
  unit_code?: string | null;
  maximum_charge_atoms?: string | null;
  estimate: VideoEstimate['estimate'] & {
    unit_code?: string | null;
    amount_atoms?: string | null;
  };
};

export default function VideoView({context}:{context:DashboardContext}) {
  const { t: uiT, format: uiF } = useUILocale();
  const {unit:platformUnit} = usePlatformCurrency();
  const {token,workspace,workspaces,session}=context;
  const canWrite=Boolean(session?.permissions.write);
  const [keyPickerOpen,setKeyPickerOpen]=useState(false);
  const [providerToolsOpen,setProviderToolsOpen]=useState(false);
  const availableKeys=useGenerationKeys(context,keyPickerOpen);
  const [search,setSearch]=useSearchParams();
  const location=useLocation();
  const {isMobile,setOpenMobile}=useSidebar();
  const [keys,setKeys]=useState<ProjectKey[]>([]);
  const [allKeys,setAllKeys]=useState<ProjectKey[]>([]);
  const keyReference=(id:string)=>allKeys.find(key=>key.id===id)?.slug || id;
  const [keysScope,setKeysScope]=useState('');
  const [keysError,setKeysError]=useState('');
  const [keysRevision,setKeysRevision]=useState(0);
  const [keyId,setKeyId]=useState('');
  const [models,setModels]=useState<VideoModelList['data']>([]);
  const [modelId,setModelId]=useState('');
  const [controls,setControls]=useState<ControlValues>({});
  const [prompt,setPrompt]=useState('');
  const [images,setImages]=useState<NamedImageReference[]>([]);
  const [draftReferences,setDraftReferences]=useState<VideoComposerDraftPayload['references']>([]);
  const [draftSessionId,setDraftSessionId]=useState<string|null>(null);
  const [composerEdited,setComposerEdited]=useState(false);
  const restoredComposer=useRef<{identity:string;keyId:string|null;model:string|null}|null>(null);
  // Composer fields the user changed before a slow saved-draft read settled.
  // A late restore may fill untouched fields but must never revert these.
  const composerEdits=useRef({prompt:false,key:false,model:false,controls:false,references:false,images:false});
  const acceptDraft=useRef(false);
  const dispatchAttempted=useRef(false);
  const [readingImages,setReadingImages]=useState(false);
  const [job,setJob]=useState<VideoJobState|null>(null);
  const [savedTask,setSavedTask]=useState<SavedVideoTask|null>(null);
  const [billing,setBilling]=useState<VideoJobBilling|null>(null);
  const [diagnosticsLoading,setDiagnosticsLoading]=useState(false);
  const [timings,setTimings]=useState<VideoTransportTimings|null>(null);
  const [quote,setQuote]=useState<ExtendedVideoEstimate|null>(null);
  const [quotedBody,setQuotedBody]=useState('');
  const [pendingSubmit,setPendingSubmit]=useState(false);
  const [waitingForImages,setWaitingForImages]=useState(false);
  const [unquotedConfirmation,setUnquotedConfirmation]=useState<{body:string;generation:number;job:string;intent:string}|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const [catalogError,setCatalogError]=useState('');
  const [detailError,setDetailError]=useState('');
  const [revision,setRevision]=useState(0);
  const [uncertain,setUncertain]=useState(false);
  const [intentDocument,setIntentDocument]=useState<VideoSubmissionIntent|null>(null);
  const [restoringIntent,setRestoringIntent]=useState(false);
  const [intentError,setIntentError]=useState('');
  const loadedIntent=useRef<VideoIntent|null>(null);
  const restoredDraftIdentity=useRef('');
  const [submittedPrompt,setSubmittedPrompt]=useState('');
  const lock=useRef(false);
  const historyTriggerRef=useRef<HTMLButtonElement>(null);
  const loadedBase=useRef('');
  const estimateController=useRef<AbortController|null>(null);
  const submitPending=useRef(false);
  const navigate=useNavigate();
  const selectedReference=search.get('job') ?? '';
  const selected=savedTask?.reference===selectedReference ? savedTask.id : selectedReference;
  const intentReference=search.get('intent') ?? '';
  const intentId=intentDocument?.reference===intentReference ? intentDocument.id : intentReference;
  const routeIntent=useRef(intentId);
  routeIntent.current=intentId;
  const intentClient=useMemo(()=>token ? new NiuAdminClient({adminToken:token,baseURL:new URL('/api/v1',window.location.origin).href}):null,[token]);
  const [nativeTools,setNativeTools]=useState<{identity:string;state:'loading'|'supported'|'unsupported'|'error';module?:NativeProviderModule;error?:string}>({identity:'',state:'loading'});
  const toolsIdentity=JSON.stringify([token,workspace?.organization_id,workspace?.id,keyId,modelId]);
  const toolsState=nativeTools.identity===toolsIdentity ? nativeTools.state : 'loading';
  const toolsModule=toolsState==='supported' ? nativeTools.module : undefined;
  useEffect(()=>{
    const controller=new AbortController();setProviderToolsOpen(false);
    setNativeTools({identity:toolsIdentity,state:'loading'});
    if(!intentClient||!workspace||!keyId||!modelId||!keys.some(key=>key.id===keyId&&(!key.allowed_models||key.allowed_models.includes('*')||key.allowed_models.includes(modelId)))){setNativeTools({identity:toolsIdentity,state:'unsupported'});return()=>controller.abort();}
    const media=intentClient.dashboardMedia({organizationId:workspace.organization_id,projectId:workspace.id},keyId);
    void media.capabilities(modelId,{signal:controller.signal}).then(capabilities=>{
      if(controller.signal.aborted)return;
      const module=findSupportedProviderModule(capabilities.modules,modelId);
      setNativeTools(module ? {identity:toolsIdentity,state:'supported',module}:{identity:toolsIdentity,state:'unsupported'});
    }).catch(error=>{if(!controller.signal.aborted)setNativeTools({identity:toolsIdentity,state:'error',error:message(error)});});
    return()=>controller.abort();
  },[intentClient,workspace?.organization_id,workspace?.id,keyId,modelId,keys,toolsIdentity]);
  const retainedIntent=useMemo(()=>intentClient && workspace && intentReference ? new VideoIntent(intentClient,{organizationId:workspace.organization_id,projectId:workspace.id},intentReference):null,[intentClient,workspace?.organization_id,workspace?.id,intentReference]);
  useEffect(()=>{
    if(!intentClient || !workspace || !selected || selected.startsWith('run-') || intentId || busy==='create')return;
    const request=new AbortController();setIntentError('');
    void findVideoIntent(intentClient,{organizationId:workspace.organization_id,projectId:workspace.id},selected,{signal:request.signal}).then(row=>{
      if(request.signal.aborted || !row)return;
      setSearch(previous=>{if(previous.get('intent') || previous.get('job')!==selectedReference)return previous;const next=new URLSearchParams(previous);next.set('intent',row.id);if(row.keyId)next.set('key',keyReference(row.keyId));return next;},{replace:true});
    }).catch(error=>{if(!request.signal.aborted)setIntentError(message(error));});
    return()=>request.abort();
  },[intentClient,workspace?.organization_id,workspace?.id,selected,intentId,busy==='create',revision]);
  const scopePath=workspace ? workspaceKeyPath(workspace.id) : '';
  const composerIdentity=JSON.stringify([token,scopePath,session?.operator?.id??session?.kind]);
  const mutableComposer=!selected&&!intentId;
  const composerControls=Object.fromEntries(Object.entries(controls).filter(([name])=>['duration','seed','frames_per_second','resolution','ratio','omni_reference_task_type','watermark','camera_fixed','return_last_frame'].includes(name))) as VideoComposerDraftPayload['controls'];
  const composerValue:VideoComposerDraftPayload={keyId:keyId||null,sessionId:draftSessionId,model:modelId||null,prompt,controls:composerControls,references:draftReferences};
  const draft=useVideoDraft({client:intentClient,scope:workspace?{organizationId:workspace.organization_id,projectId:workspace.id}:null,
    identity:composerIdentity,contextIdentity:JSON.stringify([composerIdentity,keyId,modelId]),enabled:Boolean(token&&workspace&&mutableComposer),canWrite,edited:composerEdited,paused:loading||Boolean(busy)||restoringIntent,value:composerValue,
    restore:saved=>{
      const force=acceptDraft.current;acceptDraft.current=false;
      // A late read may only fill composer fields the user has not edited. A
      // dispatch that already started, or an uncertain outcome, keeps the
      // current input and context untouched.
      if(lock.current||submitPending.current||uncertain||dispatchAttempted.current)return;
      if(!saved)return;
      const edits=composerEdits.current;
      const requestedKey=search.get('key');
      const requestedModel=search.get('model');
      const savedKey=saved.keyId??null;
      const savedModel=saved.model??null;
      // A key and a model chosen in the composer form one context. If the user
      // changed either (or attached media), a late draft must not move that
      // context out from under the choice.
      const userPickedContext=edits.key||edits.model;
      const applyKey=Boolean(savedKey)&&(force||(!userPickedContext&&!edits.images&&!requestedKey));
      const keyCompatible=!savedKey||applyKey||savedKey===keyId;
      const applyModel=Boolean(savedModel)&&(force||(!userPickedContext&&!edits.images&&!requestedModel))&&keyCompatible;
      const savedModelActive=Boolean(savedModel)&&(applyModel||(keyCompatible&&(requestedModel?savedModel===requestedModel:savedModel===modelId)));
      if(applyKey&&savedKey)setKeyId(savedKey);
      if(applyModel&&savedModel)setModelId(savedModel);
      if(force||!edits.prompt)setPrompt(saved.prompt);
      if(savedModelActive&&(force||!edits.controls))setControls(Object.fromEntries(Object.entries(saved.controls).map(([name,value])=>[name,typeof value==='number'?String(value):value])) as ControlValues);
      if(savedModelActive&&(force||!edits.references))setDraftReferences(saved.references);
      if(saved.sessionId)setDraftSessionId(saved.sessionId);
      if(applyKey||applyModel)restoredComposer.current={identity:composerIdentity,keyId:applyKey?savedKey:null,model:applyModel?savedModel:null};
      setComposerEdited(force?false:Object.values(composerEdits.current).some(Boolean));
      if(force)composerEdits.current={prompt:false,key:false,model:false,controls:false,references:false,images:false};
    }});
  useEffect(()=>{setSubmittedPrompt('');setPrompt('');setDraftReferences([]);setDraftSessionId(null);setComposerEdited(false);restoredComposer.current=null;composerEdits.current={prompt:false,key:false,model:false,controls:false,references:false,images:false};acceptDraft.current=false;dispatchAttempted.current=false;},[composerIdentity]);
  const keyScopeIdentity=JSON.stringify([token,scopePath]);
  const savedModel=intentDocument?.model??savedTask?.model;
  const submissionStopped=intentDocument?.submission_state==='not_dispatched';
  const originalKey=allKeys.find(key=>key.id===keyId);
  const keyCanReadModel=keys.some(key=>key.id===keyId&&(!savedModel||!key.allowed_models||key.allowed_models.includes('*')||key.allowed_models.includes(savedModel)));
  const base=keyId && keysScope===keyScopeIdentity && keyCanReadModel ? keyId : '';
  const historicalReadOnly=Boolean((intentDocument||savedTask)&&!base&&!loading);
  const responseScope = useRef({ identity: '', generation: 0 });
  const responseIdentity = JSON.stringify([token, base]);
  if (responseScope.current.identity !== responseIdentity) responseScope.current = { identity: responseIdentity, generation: responseScope.current.generation + 1 };
  const currentGeneration = () => responseScope.current.generation;
  useEffect(() => {
    lock.current=false;setBusy('');setUncertain(false);
    return () => { responseScope.current.generation += 1; };
  }, [token, base]);
  useEffect(()=>{setError('');},[token,keyId,scopePath]);
  const model=models.find(item=>item.id === modelId);
  const canManageSuppliers=session?.kind === 'installation' || Boolean(session?.permissions.platform_admin);
  const workspacePath=workspace ? `/workspaces/${workspacePathSegment(workspace,workspaces)}` : '/workspaces/default';
  const form=useMemo(()=>{if(intentId && !intentDocument?.job)return {body:intentDocument?.request ?? null,error:''};try{
    if(images.length&&draftReferences.length)throw new Error('Inline images cannot be combined with saved material references in this composer.');
    if(model&&(draftReferences.length||model.workspace_asset))validateSavedVideoReferences(model,draftReferences);
    const body=model?videoRequest(draftReferences.length||model.workspace_asset?{...model,requires_image:false}:model,prompt,controls,images):null;
    if(body&&draftReferences.length)body.content.push(...draftReferences);
    if(body&&model&&new TextEncoder().encode(JSON.stringify(body)).length>model.maximum_body_bytes)throw new Error('The request exceeds this model’s size limit.');
    return {body,error:''};
  }catch(error){return {body:null,error:message(error)};}},[model,prompt,controls,images,draftReferences,intentId,intentDocument]);
  useEffect(()=>{setImages([]);setWaitingForImages(false);},[base,modelId]);

  const quoteMatches = Boolean(quote && quotedBody === JSON.stringify(form.body));
  const unquotedOwnerFunded = model?.mode === 'owner_funded' && model.output === null;
  const confirmationMatches = Boolean(unquotedConfirmation && unquotedOwnerFunded && unquotedConfirmation.body === JSON.stringify(form.body) && unquotedConfirmation.generation === currentGeneration() && unquotedConfirmation.job === selected && unquotedConfirmation.intent === intentId);


  useEffect(()=>{
    // Preparing an intent changes the URL before its writes finish. Rechecking
    // the key then would clear base and invalidate our own in-flight operation.
    if(busy==='create')return;
    const controller=new AbortController();
    setLoading(true); setKeysError('');setKeys([]);setAllKeys([]);setKeysScope('');
    if (!scopePath) {setLoading(false);return;}
    void keyRequest<{data:ProjectKey[]}>(token,scopePath,'GET',undefined,controller.signal).then(payload=>{
      if(controller.signal.aborted)return;
      const active=payload.data.filter(key=>!key.revoked && !key.expired); setKeys(active);setAllKeys(payload.data);setKeysScope(keyScopeIdentity);
      setKeyId(current=>{
        const requested=search.get('key');
        if(requested)return payload.data.find(key=>key.slug===requested||key.id===requested)?.id ?? requested;
        const restored=restoredComposer.current;
        if(restored?.identity===composerIdentity&&restored.keyId)return restored.keyId;
        if(search.get('job')||search.get('intent'))return current;
        const preferredDefault=active.find(key=>(key.ip_policy?key.ip_policy.allowed_cidrs:key.allowed_cidrs)==null)??active[0];
        return active.some(key=>key.id===current)?current:preferredDefault?.id??'';
      });
    }).catch(error=>{if(!controller.signal.aborted)setKeysError(message(error));}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
    // URL key restoration applies only when loading this workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[token,scopePath,keysRevision,composerIdentity,selected,intentId,busy==='create']);

  const requestedKey=search.get('key');
  useEffect(()=>{
    if(!requestedKey || keysScope!==keyScopeIdentity)return;
    const resolved=allKeys.find(key=>key.slug===requestedKey||key.id===requestedKey);
    if(selected||intentId)setKeyId(resolved?.id ?? requestedKey);
    if(resolved?.slug && requestedKey!==resolved.slug)setSearch(previous=>{
      if(previous.get('key')!==requestedKey)return previous;
      const next=new URLSearchParams(previous);next.set('key',resolved.slug!);return next;
    },{replace:true});
  },[requestedKey,allKeys,keysScope,keyScopeIdentity,selected,intentId,setSearch]);
  useEffect(()=>{
    const controller=new AbortController(); const changedScope=loadedBase.current !== base;
    if(changedScope)setModels([]);
    setQuote(null);
    setCatalogError('');
    if (!base) return;
    setLoading(changedScope);
    void Promise.allSettled([
      request<VideoModelList>(token,base,'/v1/video/models',undefined,controller.signal),
    ]).then(([catalog])=>{
      if(controller.signal.aborted)return;
      if(catalog.status === 'fulfilled') {
        // A saved model restored from the draft outranks the deterministic
        // default. URL model selection still wins over a saved model.
        const restored=mutableComposer&&restoredComposer.current?.identity===composerIdentity&&restoredComposer.current.model===modelId;
        const requested=mutableComposer?search.get('model'):null;
        const selectedModel=requested?catalog.value.data.find(model=>model.id===requested):catalog.value.data.find(model=>model.id===modelId)??(restored?undefined:catalog.value.data.find(model=>model.id==='fastrouter/seedance-2.0-mini')??catalog.value.data[0]);
        const reset=changedScope||selectedModel?.id!==modelId;
        setModels(catalog.value.data);
        if(!intentId&&!restored)setModelId(selectedModel?.id??requested??'');
        if(reset&&!intentId&&!restored)setControls(selectedModel?initialControls(selectedModel):{});
        loadedBase.current=base;
      }
      else setCatalogError(message(catalog.reason));
    }).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[token,base,revision]);
  const requestedModel=search.get('model');
  // A restored draft can name a model this key no longer offers. Keep the
  // composer usable by selecting a deterministic capable default once the
  // catalog for the current key has loaded. Explicit URL models are kept.
  useEffect(()=>{
    if(!mutableComposer||intentId||loading||loadedBase.current!==base||!models.length)return;
    if(requestedModel&&requestedModel===modelId)return;
    if(modelId&&models.some(item=>item.id===modelId))return;
    const fallback=models.find(item=>item.id==='fastrouter/seedance-2.0-mini')??models[0];
    if(!fallback)return;
    setModelId(fallback.id);
    setControls(initialControls(fallback));
  },[mutableComposer,intentId,loading,base,models,modelId,requestedModel]);
  useEffect(()=>{
    if(!mutableComposer||!requestedModel||requestedModel===modelId)return;
    restoredComposer.current=null;
    setModelId(requestedModel);
    const requested=models.find(model=>model.id===requestedModel);
    setControls(requested?initialControls(requested):{});
  },[requestedModel,mutableComposer,models,modelId]);
  useEffect(()=>{estimateController.current?.abort();setQuote(null);return()=>estimateController.current?.abort();},[prompt,controls,images,draftReferences,base,modelId]);
  useEffect(()=>{
    const controller=new AbortController();
    loadedIntent.current=null;setIntentDocument(null);setIntentError('');setRestoringIntent(false);setSubmittedPrompt('');
    if(!retainedIntent){restoredDraftIdentity.current='';return;}
    if(busy === 'create')return;
    setRestoringIntent(true);setUncertain(true);
    const restoring=new VideoIntent(intentClient!,{organizationId:workspace!.organization_id,projectId:workspace!.id},intentReference);
    void restoring.restore({signal:controller.signal}).then(document=>{
      if(controller.signal.aborted)return;
      loadedIntent.current=restoring;
      setIntentDocument(document);
      const restoredQuery=new URLSearchParams(search);
      if(document.reference)restoredQuery.set('intent',document.reference);
      const draftIdentity=JSON.stringify([token,scopePath,document.id]);
      setSubmittedPrompt(document.request ? document.request.content.flatMap(item=>item.type==='text' ? [item.text] : []).join('\n'):'');
      if(restoredDraftIdentity.current!==draftIdentity || !document.job){
        restoredDraftIdentity.current=draftIdentity;
        setPrompt('');setControls({});setImages([]);setDraftReferences([]);setDraftSessionId(null);setModelId(document.model);
        if(document.request){
          setPrompt(document.job ? '' : document.request.content.flatMap(item=>item.type==='text' ? [item.text] : []).join('\n'));
          setDraftReferences(document.request.content.filter((item):item is VideoComposerDraftPayload['references'][number]=>item.type==='workspace_asset'||item.type==='provider_asset'));
          setDraftSessionId(document.session_binding?.session_id??search.get('session'));
          if(document.session_binding){restoredQuery.delete('session');restoredQuery.delete('turn');}
          const restored:ControlValues={};
          for(const [name,value] of Object.entries(document.request))if(name!=='model' && name!=='content' && (typeof value==='boolean' || typeof value==='string' || typeof value==='number'))restored[name]=typeof value==='boolean' ? value:String(value);
          setControls(restored);
        }
      }
      if(document.key_id && document.key_id!==keyId)setKeyId(document.key_id);
      setUncertain(document.content_state!=='retained' || (document.submission_state!=='saved' && !document.job));
      if(document.job&&document.submission_state!=='not_dispatched'){restoredQuery.set('job',document.job.id);restoredQuery.set('key',keyReference(document.key_id));}
      if(restoredQuery.toString()!==search.toString())navigate({pathname:location.pathname,search:`?${restoredQuery}`,hash:location.hash},{replace:true});
    }).catch(error=>{if(!controller.signal.aborted)setIntentError(message(error));}).finally(()=>{if(!controller.signal.aborted)setRestoringIntent(false);});
    return()=>controller.abort();
  },[retainedIntent,revision,busy === 'create']);
  // Reopening the same history intent can remove job from the URL without
  // changing the intent identity. Recover only its server-associated job.
  useEffect(()=>{
    const restoredJob=intentDocument?.job;
    if(intentDocument?.id===intentId&&intentDocument.submission_state==='not_dispatched'){
      if(selected&&selected===restoredJob?.id){const next=new URLSearchParams(search);next.delete('job');navigate({pathname:location.pathname,search:`?${next}`,hash:location.hash},{replace:true});}
      return;
    }
    if(!intentId || intentDocument?.id!==intentId || !restoredJob || selectedReference.startsWith('run-') || selected===restoredJob.id)return;
    const next=new URLSearchParams(search);
    next.set('job',restoredJob.id);next.set('key',keyReference(intentDocument.key_id));
    if(intentDocument.reference)next.set('intent',intentDocument.reference);
    if(intentDocument.session_binding){next.delete('session');next.delete('turn');}
    navigate({pathname:location.pathname,search:`?${next}`,hash:location.hash},{replace:true});
  },[intentId,intentDocument,selected,setSearch]);
  useEffect(()=>{
    const controller=new AbortController();setJob(null);setSavedTask(null);setBilling(null);setTimings(null);setDetailError('');setDiagnosticsLoading(false);
    if(!intentClient||!workspace||!selectedReference)return;
    const history=intentClient.generations({organizationId:workspace.organization_id,projectId:workspace.id});
    setDiagnosticsLoading(true);
    void history.tasks.retrieve(selectedReference,{signal:controller.signal}).then(response=>savedVideoTask(response,selectedReference)).then(async task=>{
      if(controller.signal.aborted)return;
      if(task.session_id)setDraftSessionId(task.session_id);
      setSavedTask(task);setJob({id:task.id,object:'video.job',model:task.model,status:task.state});
      try {
        const diagnostics=await history.tasks.diagnostics(task.id,{signal:controller.signal});
        if(!controller.signal.aborted){setBilling(diagnostics.billing);setTimings(diagnostics.timings);}
      } catch(error) {if(!controller.signal.aborted)setDetailError(message(error));}
    }).catch(error=>{if(!controller.signal.aborted)setDetailError(message(error));}).finally(()=>{if(!controller.signal.aborted)setDiagnosticsLoading(false);});
    return()=>controller.abort();
  },[intentClient,token,workspace?.organization_id,workspace?.id,selectedReference,revision]);
  useEffect(()=>{
    if(!savedTask?.reference || selectedReference!==savedTask.id)return;
    const next=new URLSearchParams(location.search);next.set('job',savedTask.reference);
    if(savedTask.session_id){next.delete('session');next.delete('turn');}
    navigate({pathname:location.pathname,search:`?${next}`,hash:location.hash},{replace:true});
  },[savedTask,selectedReference,location.pathname,location.search,location.hash,navigate]);

  // Only reconcile an existing job. Polling never creates or retries a submission.
  useEffect(()=>{
    if(!base || !selected || !job || !['queued','running'].includes(job.status))return;
    const controller=new AbortController();let pending=false;
    const timer=window.setInterval(async()=>{
      if(pending || lock.current || (typeof document !== 'undefined' && document.visibilityState === 'hidden'))return;pending=true;
      try {
        if(canWrite)await request(token,base,`/v1/video/jobs/${encodeURIComponent(job?.id ?? selected)}/refresh`,{},controller.signal);
        const status=await request<VideoJobState>(token,base,`/v1/video/jobs/${encodeURIComponent(job.id)}`,undefined,controller.signal);
        if(!controller.signal.aborted){
          setJob(status);setDetailError('');
          if(!['queued','running'].includes(status.status))setRevision(value=>value+1);
        }
      }catch(error){if(!controller.signal.aborted)setDetailError(message(error));}
      finally{pending=false;}
    },5000);
    return()=>{window.clearInterval(timer);controller.abort();};
  },[token,base,selected,job?.status,canWrite]);

  function openJob(id:string) {const next=new URLSearchParams(search);next.set('job',id);next.set('key',keyReference(keyId));setSearch(next);if(isMobile)setOpenMobile(false);}

  function chooseKey(id:string) {composerEdits.current.key=true;restoredComposer.current=null;setComposerEdited(true);setKeyId(id);const next=new URLSearchParams(search);next.set('key',keyReference(id));next.delete('job');next.delete('intent');next.set('new','video');setSearch(next);setQuote(null);setUncertain(false);}
  async function estimate(): Promise<boolean> {
    if(!form.body || !base || lock.current || uncertain || readingImages)return false;
    const controller=new AbortController();estimateController.current?.abort();estimateController.current=controller;
    setBusy('estimate');setError('');
    let ok=false;
    try {if(mutableComposer&&canWrite)await draft.flush();const result=await request<ExtendedVideoEstimate>(token,base,'/v1/video/estimate',form.body,controller.signal);if(!controller.signal.aborted){setQuote(result);setQuotedBody(JSON.stringify(form.body));ok=true;}}
    catch(error){if(!controller.signal.aborted)setError(message(error));}
    finally{if(estimateController.current === controller)setBusy('');}
    return ok;
  }
  async function submitComposer() {
    if (!canWrite) { void estimate(); return; }
    if (!form.body || !base || uncertain || restoringIntent || submissionStopped || submitPending.current) return;
    if (readingImages) { setWaitingForImages(true); return; }
    if (busy === 'estimate') { submitPending.current = true; setPendingSubmit(true); return; }
    if (busy) return;
    if (unquotedOwnerFunded) {
      setUnquotedConfirmation({body:JSON.stringify(form.body),generation:currentGeneration(),job:selected,intent:intentId});
      return;
    }
    if (quoteMatches) { await saveOrSubmitRequest('submit'); return; }
    submitPending.current = true;
    setPendingSubmit(true);
    const ok = await estimate();
    if (!ok) { submitPending.current = false; setPendingSubmit(false); }
  }
  const submitComposerRef = useRef(submitComposer);
  submitComposerRef.current = submitComposer;
  useEffect(() => {
    if (!waitingForImages || readingImages || busy) return;
    setWaitingForImages(false);
    if (!uncertain) void submitComposerRef.current();
  }, [waitingForImages, readingImages, busy, uncertain]);
  useEffect(() => {
    if (!pendingSubmit) return;
    if (busy || !quoteMatches) return;
    submitPending.current = false;
    setPendingSubmit(false);
    void saveOrSubmitRequest('submit');
  }, [pendingSubmit, busy, quoteMatches]);
  const autoEstimateBody = JSON.stringify(form.body);
  useEffect(() => {
    if (!mutableComposer || !canWrite || !autoEstimateBody || !base || busy || uncertain || readingImages || restoringIntent || quoteMatches) return;
    const timer = window.setTimeout(() => { void estimate(); }, 900);
    return () => window.clearTimeout(timer);
  }, [autoEstimateBody, canWrite, base, busy, uncertain, readingImages, restoringIntent, quoteMatches]);
  async function saveOrSubmitRequest(action:'save'|'submit',confirmedOwnerFunded=false) {
    const submit=action==='submit';
    if(!form.body || (submit&&(submissionStopped||(!quoteMatches&&!(confirmedOwnerFunded&&unquotedOwnerFunded)))) || !base || !canWrite || lock.current || uncertain || readingImages || restoringIntent)return;
    const generation=currentGeneration();
    let ownedIntentId='';
    let draftTicket:VideoDraftTicket|null=null;
    const currentOperation=()=>generation===currentGeneration() && (!ownedIntentId || routeIntent.current===ownedIntentId);
    dispatchAttempted.current=true;
    lock.current=true;setBusy('create');setSubmittedPrompt(prompt);setError('');
    try {
      // Draft persistence is best-effort. A conflict, save failure or failed
      // initial read must not stop an explicitly requested dispatch.
      if(mutableComposer){draftTicket=await draft.flush();if(!currentOperation())return;}
      let result:VideoJobState;
      if(form.body.content.every(item=>['text','provider_asset','workspace_asset'].includes(item.type)) && intentClient && workspace){
        const intent=retainedIntent && !intentDocument?.job ? loadedIntent.current : new VideoIntent(intentClient,{organizationId:workspace.organization_id,projectId:workspace.id},crypto.randomUUID());
        if(!intent)throw new Error('Restore the saved video request before submitting.');
        if(retainedIntent&&intentDocument?.session_binding===undefined)throw new Error('The saved session context could not be confirmed. Reload before continuing.');
        ownedIntentId=intent.id;routeIntent.current=intent.id;
        const originalBinding=intentDocument?.id===intent.id?intentDocument.session_binding:null;
        const sessionId=originalBinding?.session_id??search.get('session')??draftSessionId??crypto.randomUUID();
        const turnId=originalBinding?.turn_id??search.get('turn')??crypto.randomUUID();
        const next=new URLSearchParams(search);next.set('intent',intent.id);next.set('session',sessionId);next.set('turn',turnId);next.delete('new');if(!next.get('workspace'))next.set('workspace',workspacePathSegment(workspace,context.workspaces??[workspace]));next.set('key',keyReference(keyId));setSearch(next,{replace:true});
        await prepareVideoSessionIntent(intentClient,{organizationId:workspace.organization_id,projectId:workspace.id},{sessionId,turnId,intentId:intent.id,keyId,title:boundedVideoTitle(prompt, model?.id ?? ''),request:form.body as VideoIntentRequest});
        if(!currentOperation())return;
        await intent.restore();
        window.dispatchEvent(new Event('niu:video-intent-saved'));
        if(!submit){
          if(draftTicket&&!await draft.clearMatching(draftTicket))setError('The request was saved, but its unfinished draft remains. Open the saved request before submitting.');
          setQuote(null);setRevision(value=>value+1);return;
        }
        if(!currentOperation())return;
        result=await intent.submit();
        if(!currentOperation())return;
        next.set('job',result.id);setSearch(next,{replace:true});
      }else{
        if(!submit)throw new Error('Inline image attachments cannot be saved as requests yet.');
        result=await request<VideoJobState>(token,base,'/v1/video/jobs',form.body);
        if(generation !== currentGeneration())return;
        openJob(result.id);
      }
      if(!currentOperation())return;
      if(draftTicket&&!await draft.clearMatching(draftTicket))setError('Video submission was confirmed, but its draft could not be cleared. The saved draft may remain; do not resubmit it.');
      if(!currentOperation())return;
      setSubmittedPrompt(prompt);setPrompt('');setImages([]);setDraftReferences([]);setComposerEdited(false);setQuote(null);setRevision(value=>value+1);
    } catch(error) {
      if(!currentOperation())return;
      setError(message(error));
      // A lost create response may already represent a paid dispatch. Do not retry it.
      if(submit&&(!(error instanceof VideoHTTPError) || ![400,401,402,403,404,501].includes(error.status)))setUncertain(true);
    } finally {if(generation === currentGeneration()){lock.current=false;setBusy('');}}
  }
  async function refresh() {
    if(!base || !selected || lock.current || !canWrite)return;
    const generation=currentGeneration();
    lock.current=true;setBusy('refresh');setDetailError('');
    try {await request(token,base,`/v1/video/jobs/${encodeURIComponent(job?.id ?? selected)}/refresh`,{});if(generation === currentGeneration())setRevision(value=>value+1);}
    catch(error){if(generation === currentGeneration())setDetailError(message(error));}
    finally{if(generation === currentGeneration()){lock.current=false;setBusy('');}}
  }


  function reloadSaved() {setKeysRevision(value=>value+1);setRevision(value=>value+1);}
  const keyIpRestricted=/does not allow the request source address/i.test(catalogError);
  const originalKeyAllowedCidrs=originalKey?(originalKey.ip_policy?originalKey.ip_policy.allowed_cidrs:originalKey.allowed_cidrs):undefined;
  const fallbackActiveKey=keys.find(k=>k.id!==keyId&&(k.ip_policy?k.ip_policy.allowed_cidrs:k.allowed_cidrs)==null)??keys.find(k=>k.id!==keyId);
  const savedPromptText=submittedPrompt.trim() || intentDocument?.request?.content.flatMap(item=>item.type==='text' ? [item.text] : []).join('\n').trim() || '';
  const promptTitle=savedPromptText.split('\n').map(line=>line.trim()).find(Boolean)?.slice(0,120);
  const noActiveKey=!loading && !keysError && !keys.length && !selected && !intentId;
  const generationTitle=intentDocument?.id===intentId ? videoSessionTitle(intentDocument) : (promptTitle ?? (selected ? (job?.model ? uiF("Video · {0}", [job.model]) : uiT("Video session")) : uiT("New generation")));
  const epoch=timings?.data[0]?.started_unix_ms ?? 0;
  const total=Math.max(1,...(timings?.data.map(span=>span.started_unix_ms-epoch+span.elapsed_ms) ?? []));
  return <div className="video-shell">
    <GenerationSessionBindings trigger={historyTriggerRef} title={generationTitle} actions={<DropdownMenu open={keyPickerOpen} onOpenChange={setKeyPickerOpen}><DropdownMenuTrigger asChild><Button variant="outline" className="video-key-choice" aria-label={uiT("Video API key")} disabled={Boolean(busy) || loading || Boolean(intentId && !intentDocument?.job)}><KeyIcon size={16}/><span className="truncate">{originalKey ? `${originalKey.name}${originalKey.revoked ? ` ${uiT("· Revoked")}`:originalKey.expired ? ` ${uiT("· Expired")}`:keyIpRestricted ? ` ${uiT("· Source IP restricted")}`:''}` : (loading ? uiT("Loading keys…") : keysError ? uiT("API keys unavailable") : uiT("No active API key"))}</span></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuRadioGroup value={keyId} onValueChange={id=>{const chosen=availableKeys.keys.find(key=>key.id===id);if(chosen&&chosen.workspace.id!==workspace?.id){navigate(`/generations?new=video&workspace=${encodeURIComponent(workspacePathSegment(chosen.workspace,context.workspaces??[chosen.workspace]))}&key=${encodeURIComponent(chosen.slug || id)}`);}else chooseKey(id);}}>{(availableKeys.keys.length?availableKeys.keys:keys.map(key=>({...key,workspace}))).map(key=><DropdownMenuRadioItem key={key.id} value={key.id}>{key.name}{key.workspace && key.workspace.id!==workspace?.id ? ` · ${workspaceDisplayName(key.workspace.name)}`:''}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup>{availableKeys.loading && !availableKeys.keys.length && !keys.length && <DropdownMenuLabel>{uiT("Loading keys…")}</DropdownMenuLabel>}{(availableKeys.error || keysError) && <DropdownMenuLabel>{uiT("Some API keys could not be loaded.")}</DropdownMenuLabel>}{!availableKeys.loading && !availableKeys.error && !keysError && !availableKeys.keys.length && !keys.length && <DropdownMenuLabel>{uiT("No active API key")}</DropdownMenuLabel>}<DropdownMenuItem asChild><Link to={`${workspacePath}/keys`}><KeyIcon />{uiT("Manage API keys")}</Link></DropdownMenuItem></DropdownMenuContent></DropdownMenu>} history={{context: (context), currentKeys: (allKeys), activeVideo: (selected), activeVideoSession: (search.get('session') || (search.get('new') === 'video' ? 'new-video' : '')), disabled: (Boolean(busy))}} />
    <section className="video-main" aria-label={uiT("Video generation")}>

      <div className="video-content">
        {(keysError || intentError || error || (catalogError && !keyIpRestricted)) && <div role="alert" className="video-error">{uiT(keysError || intentError || error || catalogError)}<Button variant="ghost" onClick={reloadSaved} disabled={Boolean(busy) || loading}>{uiT("Reload")}</Button></div>}
        {!workspace ? <p>{uiT("Add an API key to generate videos.")}</p> : <>
        <div className="video-conversation" aria-label={uiT("Video conversation")}>
          {!selected && !intentId ? (noActiveKey ? <Empty className="video-welcome"><EmptyHeader><EmptyTitle>{uiT("No active API key")}</EmptyTitle><EmptyDescription>{uiT("Create a key that can run a video model, then return here to describe the video.")}</EmptyDescription></EmptyHeader><EmptyContent><Button asChild><Link to={`${workspacePath}/keys`} state={{createKey:true,returnTo:`${location.pathname}${location.search}`}}>{uiT("Create API key")}</Link></Button></EmptyContent></Empty> : <Empty className="video-welcome"><EmptyHeader><EmptyTitle>{uiT("Create a video")}</EmptyTitle><EmptyDescription>{uiT("Describe the scene you want to bring to life.")}</EmptyDescription></EmptyHeader></Empty>) : <div className="video-turn">
            {savedPromptText && <div className="video-user-message"><p>{savedPromptText}</p></div>}
            <article className="video-response" aria-label={uiT("Video result")}>
              <div className="video-result-heading"><span className="video-response-model">{job?.model ?? intentDocument?.model ?? uiT("Video")}</span>{job && <Badge variant="secondary">{translateUI(statusLabel[job.status])}</Badge>}</div>
            {detailError && <p role="alert" className="video-error">{uiT(detailError)}</p>}
            {selected && !job && detailError && <Button variant="outline" onClick={reloadSaved} disabled={Boolean(busy)}>{uiT("Reload status")}</Button>}
            {historicalReadOnly&&<p role="status" className="video-muted">{uiT("Saved history is available. The original API key is revoked, expired, missing or no longer grants this model; generation and Provider checks are disabled.")}</p>}
            {!selected ? <p className="video-muted">{submissionStopped ? uiT("This request was not dispatched. Resolve the admission error before starting a new generation.") : intentDocument?.submission_state==='saved' ? uiT("This saved request has not been submitted."):uiT("Submit a video or select a saved job.")}</p> : !job && !detailError ? <FormSectionSkeleton fields={2} label={uiT("Loading saved video…")} /> : job && <>
              {(job.status === 'submission_unknown' || job.status === 'reconciliation_required') && <p>{uiT("The outcome is unresolved. Do not resubmit this generation.")}</p>}
                  {job.status === 'succeeded' && intentClient && workspace && <VideoResult key={`${workspace.id}/${selected}`} client={intentClient} scope={{organizationId:workspace.organization_id,projectId:workspace.id}} task={job.id} keyId={base ? keyId:undefined} canWrite={canWrite} libraryHref={`${workspacePath}/library`}/>}

              {job.status !== 'succeeded' && <div className="video-artifact-placeholder">{(job.status==='queued'||job.status==='running')&&<Loader className="animate-spin"/>}<h3 role="status">{job.status==='queued'?uiT("Waiting to generate"):job.status==='running'?uiT("Generating your video…"):job.status==='failed'?uiT("Video generation failed"):uiT("Waiting for a confirmed status")}</h3><p>{job.status==='queued'?uiT("Your request is queued. This conversation updates automatically."):job.status==='running'?uiT("Your video will appear here when it is ready."):job.status==='failed'?uiT("Open video details to inspect the recorded failure."):uiT("The original task is being checked. Do not submit it again.")}</p></div>}
              <Sheet><SheetTrigger asChild><Button variant="ghost" size="icon" className="video-details-trigger" aria-label={uiT("Video details")}><InfoCircle size={18}/></Button></SheetTrigger><SheetContent className="overflow-y-auto"><SheetHeader><SheetTitle>{uiT("Video details")}</SheetTitle><SheetDescription>{uiT("Generation status, timing and customer charges.")}</SheetDescription></SheetHeader><div className="video-details p-4">
                  <div className="video-actions"><Button variant="outline" onClick={reloadSaved} disabled={Boolean(busy)}>{uiT("Reload status")}</Button><Button variant="ghost" onClick={()=>void refresh()} disabled={!canWrite || !base || Boolean(busy) || job.status === 'submission_unknown'}><RefreshCw size={14}/>{busy === 'refresh' ? uiT("Checking…"):uiT("Check Provider")}</Button></div>
                  {timings?.lifecycle && <VideoLifecycle timing={timings.lifecycle}/>}
                  {timings?.data.length ? <div className="video-timings"><h3>{uiT("Transport time")}</h3><p className="video-muted">{uiT("Submission, status queries and result transfers; Provider queue and generation time are not measured here.")}</p>{timings.data.map((span,index)=><div className="video-span" key={index}><span>{span.phase === 'submission' ? uiT("Submission") : span.phase === 'query' ? uiT("Status query") : span.phase === 'result' ? uiT("Result transfer") : uiT("Other transport")}</span><div className="video-span-track"><i style={{marginLeft:`${(span.started_unix_ms-epoch)/total*100}%`,width:`${Math.max(.5,span.elapsed_ms/total*100)}%`}}/></div><small>{formatDurationMs(span.elapsed_ms)}</small></div>)}{timings.has_more && <small>{uiT("Showing the latest recorded requests.")}</small>}</div> : null}
                  <h3>{uiT("Billing")}</h3>{billing ? <VideoBilling billing={billing}/> : diagnosticsLoading ? <ListRowsSkeleton rows={1} label={uiT("Loading billing…")} /> : <p>{uiT("Billing is unavailable.")}</p>}              <Button asChild variant="link"><Link to={`${workspacePath}/executions?modelAlias=${encodeURIComponent(job.model)}#gateway-attempt-${encodeURIComponent(savedTask?.reference??job.id)}`}>{uiT("View in Logs")}</Link></Button>
              </div></SheetContent></Sheet>

            </>}

            </article>
          </div>}
        </div>
        {historicalReadOnly ? <div className="video-composer"><Button asChild variant="outline"><Link to={`${workspacePath}/keys`}>{uiT("Manage API keys")}</Link></Button></div> : noActiveKey ? null : <form className="video-composer" onSubmit={event=>{event.preventDefault();void submitComposer();}}>
          <div className="video-composer-surface">
            {mutableComposer&&!draft.ready&&!draft.error&&<p role="status" className="video-muted">{uiT("Loading saved Video draft…")}</p>}
            {mutableComposer&&draft.error&&<div role="alert" className="video-error">{uiT(draft.error)}<Button type="button" variant="ghost" onClick={()=>{acceptDraft.current=true;draft.reload();}} disabled={Boolean(busy)}>{uiT("Load saved draft")}</Button></div>}
            {mutableComposer&&draft.ready&&<p role="status" className="video-muted">{draft.saving?uiT("Saving draft…"):draft.dirty?canWrite?uiT("Unsaved changes"):uiT("Your changes are not saved with read access."):composerEdited||draft.confirmed?uiT("Draft saved"):''}</p>}
            {images.length>0&&<p className="video-muted">{uiT("Inline image attachments are not saved in your draft. Reattach them after reloading.")}</p>}
            {draftReferences.length>0&&<p className="video-muted">{draftReferences.length}{" "}{uiT("saved material reference")}{draftReferences.length===1?'':'s'}{uiT(". Current access and inspection are checked when submitting.")}</p>}
            {mutableComposer&&draft.ready&&restoredComposer.current&&!base&&!loading&&<p className="video-muted">{uiT("The saved API key is unavailable for generation. Your draft is retained. Choose an active API key to continue.")}</p>}
            {loading ? <ListRowsSkeleton rows={2} label={uiT("Loading video models…")} /> : keyIpRestricted ? <Empty className="min-h-40"><EmptyHeader><EmptyTitle>{uiF("{0} is restricted to allowed source IP addresses",[originalKey?.name??uiT("This API key")])}</EmptyTitle><EmptyDescription>{originalKeyAllowedCidrs!==undefined&&originalKeyAllowedCidrs!==null?(originalKeyAllowedCidrs.length>0?`${uiF("Allowed source networks: {0}",[originalKeyAllowedCidrs.join(', ')])} · `:`${uiT("Current policy: Block all source IP addresses")} · `):''}{uiT("Your current network is not in this key’s source IP allowlist. Choose another API key, or add your current IP address to this key’s source IP policy.")}</EmptyDescription></EmptyHeader><EmptyContent><div className="flex flex-wrap items-center justify-center gap-2">{fallbackActiveKey&&<Button type="button" variant="default" onClick={()=>chooseKey(fallbackActiveKey.id)}>{uiF("Use {0}",[fallbackActiveKey.name])}</Button>}{originalKey&&<Button asChild variant="outline"><Link to={`${workspacePath}/keys/${encodeURIComponent(originalKey.slug||originalKey.id)}`}>{uiT("Configure source IP access")}</Link></Button>}<Button asChild variant="outline"><Link to={`${workspacePath}/keys`}>{uiT("Manage API keys")}</Link></Button><Button type="button" variant="ghost" onClick={reloadSaved}>{uiT("Recheck access")}</Button></div></EmptyContent></Empty> : keys.length > 0 && !model && !error && !keysError && !catalogError ? <Empty className="min-h-40"><EmptyHeader><EmptyTitle>{uiT("No video model available")}</EmptyTitle><EmptyDescription>{uiT("This API key has no supported video route.")}</EmptyDescription></EmptyHeader><EmptyContent><Button asChild variant="outline"><Link to={canManageSuppliers ? '/admin/providers':'/models'}>{canManageSuppliers ? uiT("Manage Providers"):uiT("View models")}</Link></Button></EmptyContent></Empty> : null}
            <>
              {model&&intentClient&&workspace&&<ImageReferences model={model} client={intentClient} scope={{organizationId:workspace.organization_id,projectId:workspace.id}} references={draftReferences} onReferencesChange={references=>{composerEdits.current.references=true;setComposerEdited(true);setDraftReferences(references);}} images={images} onChange={next=>{composerEdits.current.images=true;setImages(next);}} disabled={Boolean(busy) || uncertain || (!model.workspace_asset&&draftReferences.length>0) || Boolean(intentId && !intentDocument?.job)} onReadingChange={(reading,failed)=>{setReadingImages(reading);if(reading){estimateController.current?.abort();setQuote(null);}else if(failed)setWaitingForImages(false);}}/>}

              <Label htmlFor="video-prompt" className="sr-only">{uiT("Prompt")}</Label><Textarea id="video-prompt" placeholder={uiT("Describe your video…")} rows={2} value={prompt} onChange={event=>{composerEdits.current.prompt=true;setComposerEdited(true);setPrompt(event.target.value);}} disabled={busy === 'create' || restoringIntent || Boolean(intentId && !intentDocument?.job)} onKeyDown={event=>{if(event.key==='Enter' && !event.shiftKey && !event.nativeEvent.isComposing){event.preventDefault();void submitComposer();}}}/>
              {prompt && form.error && <p role="alert" className="video-error">{uiT(form.error)}</p>}
              {quoteMatches && quote && <div className="video-estimate"><span>{quote.effective_output.specification.resolution} · {quote.effective_output.specification.ratio} · {formatDurationSeconds(quote.effective_output.duration_seconds)}{quote.effective_output.frames_per_second != null && uiF(" · {0} FPS", [quote.effective_output.frames_per_second])}</span><strong>{quote.estimate.amount_atoms != null && (quote.estimate.unit_code || quote.unit_code) ? uiF("Estimated {0}", [formatUnitAtoms(quote.estimate.amount_atoms, quote.estimate.unit_code ?? quote.unit_code ?? platformUnit?.name ?? 'Credits', platformUnit?.display_precision ?? 2)]) : quote.estimate.amount_nanos != null && quote.estimate.currency ? uiF("Estimated {0}", [money(quote.estimate.amount_nanos,quote.estimate.currency)]):uiT("Charged to your Provider account")}</strong>{quote.maximum_charge_atoms != null && (quote.unit_code || quote.estimate.unit_code) ? <small>{uiT("Reserves up to")}{" "}{formatUnitAtoms(quote.maximum_charge_atoms, quote.unit_code ?? quote.estimate.unit_code ?? platformUnit?.name ?? 'Credits', platformUnit?.display_precision ?? 2)}{uiT(". Final charge follows reported usage.")}</small> : quote.maximum_charge_nanos != null && quote.estimate.currency && <small>{uiT("Reserves up to")}{" "}{money(quote.maximum_charge_nanos,quote.estimate.currency)}{uiT(". Final charge follows reported usage.")}</small>}</div>}

              {unquotedOwnerFunded && <p role="status" className="video-muted">{uiT("Estimate unavailable. Your Provider may charge your account.")}</p>}
              {uncertain && <p role="alert">{intentDocument&&intentDocument.content_state!=='retained' ? uiT("The saved input has expired or been deleted. Task history remains available."):uiT("Reload this saved request to confirm its input and original submission status before continuing.")}</p>}
              {waitingForImages && <p role="status" className="video-muted">{uiT("Waiting for image upload to finish…")}</p>}
            </>
            <div className="video-composer-toolbar"><div className="video-composer-options">

              {models.length>0&&<DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" className="video-model-choice" aria-label={uiT("Video model")} disabled={Boolean(busy) || Boolean(intentId && !intentDocument?.job)}><span className="truncate">{model?.id||modelId||uiT("Choose video model")}</span><ChevronDown size={14}/></Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuRadioGroup value={modelId} onValueChange={id=>{composerEdits.current.model=true;restoredComposer.current=null;setComposerEdited(true);setModelId(id);const query=new URLSearchParams(search);query.set('model',id);setSearch(query);const next=models.find(model=>model.id === id);setControls(next ? initialControls(next):{});}}>{models.map(item=><DropdownMenuRadioItem key={item.id} value={item.id}>{item.id}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>}
              {model&&toolsState==='supported'&&<Button type="button" variant="ghost" onClick={()=>setProviderToolsOpen(true)}><ScanFace size={16}/><span>{uiT("Materials")}</span></Button>}

              {model&&<>
                <Popover><PopoverTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label={uiT("Additional settings")}><Settings size={18}/></Button></PopoverTrigger><PopoverContent side="top" align="end" aria-label={uiT("Video settings")} className="video-settings-popover"><h2>{uiT("Video settings")}</h2><div className="video-controls">
                {Object.entries(model.controls).map(([name,rule])=><div key={name} className="video-field"><Label htmlFor={`video-${name}`}>{translateUI(controlLabels[name] ?? name)}</Label>
                  {rule.kind === 'choice' ? <DropdownMenu><DropdownMenuTrigger asChild><Button id={`video-${name}`} variant="outline" className="video-choice" disabled={busy === 'create' || Boolean(intentId && !intentDocument?.job)}>{controls[name] !== undefined ? String(controls[name]) : uiT("Choose…")}<ChevronDown size={14}/></Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuRadioGroup value={String(controls[name] ?? '')} onValueChange={value=>{composerEdits.current.controls=true;setComposerEdited(true);setControls(current=>{const next={...current,[name]:value};if(name === 'resolution' && model.output && !model.output.specifications.some(spec=>spec.resolution === value && spec.ratio === current.ratio)){const spec=model.output.specifications.find(spec=>spec.resolution === value);if(spec)next.ratio=spec.ratio;}return next;});}}>{rule.values.filter(value=>name !== 'ratio' || !model.output || model.output.specifications.some(spec=>spec.resolution === controls.resolution && spec.ratio === value)).map(value=><DropdownMenuRadioItem key={value} value={value}>{value}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
                  : rule.kind === 'integer' ? <><Input id={`video-${name}`} type="number" min={rule.minimum} max={rule.maximum} step={1} value={String(controls[name] ?? '')} onChange={event=>{composerEdits.current.controls=true;setComposerEdited(true);setControls(current=>({...current,[name]:event.target.value}));}} disabled={busy === 'create' || Boolean(intentId && !intentDocument?.job)}/><small className="video-muted">{rule.minimum}–{rule.maximum}</small></>
                  : <Checkbox id={`video-${name}`} checked={controls[name] === true} onCheckedChange={checked=>{composerEdits.current.controls=true;setComposerEdited(true);setControls(current=>({...current,[name]:checked === true}));}} disabled={busy === 'create' || Boolean(intentId && !intentDocument?.job)}/>}</div>)}
              <Button type="button" variant="ghost" onClick={()=>{composerEdits.current.controls=true;setComposerEdited(true);setControls(initialControls(model));}} disabled={busy === 'create' || Boolean(intentId && !intentDocument?.job)}>{uiT("Reset settings")}</Button>

                </div>{toolsModule&&<Button type="button" variant="ghost" onClick={()=>setProviderToolsOpen(true)}>{uiT("Reference materials & verification")}</Button>}</PopoverContent></Popover>
              </>}
            </div>
            {model && canWrite && <Button type="button" variant="ghost" size="sm" disabled={!base || !form.body || Boolean(busy) || uncertain || readingImages || restoringIntent || submissionStopped} onClick={() => void estimate()}>{uiT("Estimate")}</Button>}
            {model && <Button type="submit" size="icon" aria-label={waitingForImages ? uiT("Waiting for image upload to finish…") : quoteMatches || unquotedOwnerFunded || canWrite ? uiT("Generate video") : uiT("Estimate")} title={waitingForImages ? uiT("Waiting for image upload to finish…") : quoteMatches || unquotedOwnerFunded || canWrite ? uiT("Generate video") : uiT("Estimate generation cost")} disabled={!base || !form.body || (Boolean(busy) && busy !== 'estimate') || uncertain || restoringIntent || ((quoteMatches || unquotedOwnerFunded) && !canWrite) || submissionStopped}><ArrowUp size={20}/></Button>}
            </div>
            {!canWrite && <small className="video-muted">{unquotedOwnerFunded ? uiT("Generation needs write access.") : uiT("Read access can estimate; generation needs write access.")}</small>}
          </div>
        </form>}
        <Dialog open={Boolean(unquotedConfirmation)} onOpenChange={open=>{if(!open)setUnquotedConfirmation(null);}}><DialogContent><DialogHeader><DialogTitle>{uiT("Generate video with your Provider account")}</DialogTitle><DialogDescription>{uiT("No output estimate is configured for this model. Your Provider may charge your account. This sends the request once; an uncertain outcome must be checked before another submission.")}</DialogDescription></DialogHeader><p className="break-words text-sm">{model?.id}</p>{!confirmationMatches&&<p role="alert" className="text-sm text-destructive">{uiT("The request or access changed. Close this dialog and review the current request.")}</p>}<DialogFooter><Button variant="outline" onClick={()=>setUnquotedConfirmation(null)}>{uiT("Cancel")}</Button><Button disabled={!confirmationMatches||submissionStopped||!canWrite||!base||Boolean(busy)||uncertain||readingImages||restoringIntent} onClick={()=>{if(!confirmationMatches)return;setUnquotedConfirmation(null);void saveOrSubmitRequest('submit',true);}}>{uiT("Generate video")}</Button></DialogFooter></DialogContent></Dialog>
        <Dialog open={providerToolsOpen&&Boolean(toolsModule)} onOpenChange={setProviderToolsOpen}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>{uiT("Reference materials & verification")}</DialogTitle><DialogDescription>{uiT("Manage reference materials and human verification required by this video model.")}</DialogDescription></DialogHeader>{toolsModule&&<ProviderGenerationTools toolsKey={toolsIdentity} workspaceName={workspace ? workspaceDisplayName(workspace.name) : 'Current workspace'} modelId={modelId} keyId={keyId} module={toolsModule}/>}</DialogContent></Dialog>
        </>}
      </div>
    </section>
  </div>;
}
