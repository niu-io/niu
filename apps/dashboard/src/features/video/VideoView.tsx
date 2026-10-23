import { validateSavedVideoReferences } from './request';
import { useGenerationKeys } from '@/features/generations/useGenerationKeys';
import { GenerationSessionBindings } from '@/features/generations/GenerationsLayout';
import { useBranding } from '@/app/branding';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams, useNavigate, useLocation } from 'react-router';
import { IconLoader2 as Loader, IconInfoCircle as InfoCircle, IconChevronDown as ChevronDown, IconArrowUp as ArrowUp, IconAdjustmentsHorizontal as Settings, IconKey as KeyIcon, IconRefresh as RefreshCw } from '@tabler/icons-react';
import type { VideoEstimate, VideoJobBilling, VideoJobState, VideoModelList, VideoTransportTimings } from '@niu-io/sdk';
import { NiuAdminClient, type VideoIntentRequest, type VideoSubmissionIntent, type NativeProviderModule, type GenerationTask, type VideoComposerDraftPayload } from '@niu-io/sdk/admin';
import { useVideoDraft, type VideoDraftTicket } from './useVideoDraft';
import { VideoIntent } from './intent';
import { prepareVideoSessionIntent } from './session-intent';
import { findVideoIntent, videoSessionTitle } from './intent-history';
import { Button } from '@/components/ui/button';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { useSidebar } from '@/components/ui/sidebar';
import type { DashboardContext } from '@/app/dashboard-context';
import { workspaceDisplayName, workspacePathSegment } from '@/app/workspace-route';
import { keyRequest, workspaceKeyPath, type ProjectKey } from '@/features/keys/api';
import { money } from '@/lib/money';
import { controlLabels, initialControls, videoRequest, type ControlValues } from './request';
import VideoResult from './VideoResult';
import VideoBilling from './VideoBilling';
import VideoLifecycle from './VideoLifecycle';
import ImageReferences, { type NamedImageReference } from './ImageReferences';
import './video.css';
import VolcengineView from '@/features/provider-modules/volcengine/VolcengineView';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

const statusLabel: Record<string,string> = {submission_unknown:'Submission uncertain',queued:'Queued',running:'Running',succeeded:'Succeeded',failed:'Failed',unknown:'Status unavailable',reconciliation_required:'Needs reconciliation'};
function message(error: unknown) { return error instanceof Error ? error.message : 'The request could not be completed.'; }
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
export default function VideoView({context}:{context:DashboardContext}) {
  const {settings:branding} = useBranding();
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
  const [readingImages,setReadingImages]=useState(false);
  const [job,setJob]=useState<VideoJobState|null>(null);
  const [savedTask,setSavedTask]=useState<SavedVideoTask|null>(null);
  const [billing,setBilling]=useState<VideoJobBilling|null>(null);
  const [diagnosticsLoading,setDiagnosticsLoading]=useState(false);
  const [timings,setTimings]=useState<VideoTransportTimings|null>(null);
  const [quote,setQuote]=useState<VideoEstimate|null>(null);
  const [quotedBody,setQuotedBody]=useState('');
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
  const navigate=useNavigate();
  const selectedReference=search.get('job') ?? '';
  const selected=savedTask?.reference===selectedReference ? savedTask.id : selectedReference;
  const intentReference=search.get('intent') ?? '';
  const intentId=intentDocument?.reference===intentReference ? intentDocument.id : intentReference;
  const routeIntent=useRef(intentId);
  routeIntent.current=intentId;
  const intentClient=useMemo(()=>token ? new NiuAdminClient({adminToken:token,baseURL:new URL('/api/v1',window.location.origin).href}):null,[token]);
  const [toolsRevision,setToolsRevision]=useState(0);
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
      const module=capabilities.modules.find(module=>module.module==='volcengine'&&module.model_alias===modelId);
      setNativeTools(module ? {identity:toolsIdentity,state:'supported',module}:{identity:toolsIdentity,state:'unsupported'});
    }).catch(error=>{if(!controller.signal.aborted)setNativeTools({identity:toolsIdentity,state:'error',error:message(error)});});
    return()=>controller.abort();
  },[intentClient,workspace?.organization_id,workspace?.id,keyId,modelId,keys,toolsIdentity,toolsRevision]);
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
      const selectedKey=search.get('key')??saved?.keyId??'';
      const selectedModel=search.get('model')??saved?.model??'';
      restoredComposer.current=saved?{identity:composerIdentity,keyId:selectedKey||null,model:selectedModel===saved.model?saved.model:null}:null;
      setComposerEdited(false);setPrompt(saved?.prompt??'');setDraftSessionId(saved?.sessionId??null);setDraftReferences(saved?.references??[]);setImages([]);
      setKeyId(selectedKey);setModelId(selectedModel);
      setControls(Object.fromEntries(Object.entries(selectedModel===saved?.model?saved.controls:{}).map(([name,value])=>[name,typeof value==='number'?String(value):value])) as ControlValues);
    }});
  const composerReady=!mutableComposer||draft.ready;
  const draftBlocked=mutableComposer&&(!draft.ready||Boolean(draft.error));
  useEffect(()=>{setSubmittedPrompt('');setPrompt('');setDraftReferences([]);setDraftSessionId(null);setComposerEdited(false);restoredComposer.current=null;},[composerIdentity]);
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
  useEffect(()=>{setImages([]);},[base,modelId]);

  const quoteMatches = Boolean(quote && quotedBody === JSON.stringify(form.body));
  const unquotedOwnerFunded = model?.mode === 'owner_funded' && model.output === null;
  const confirmationMatches = Boolean(unquotedConfirmation && unquotedOwnerFunded && unquotedConfirmation.body === JSON.stringify(form.body) && unquotedConfirmation.generation === currentGeneration() && unquotedConfirmation.job === selected && unquotedConfirmation.intent === intentId);

  useEffect(()=>{document.title=`Video · Generations · ${branding.display_name}`;return()=>{document.title=`Generations · ${branding.display_name}`;};},[branding.display_name]);

  useEffect(()=>{
    // Preparing an intent changes the URL before its writes finish. Rechecking
    // the key then would clear base and invalidate our own in-flight operation.
    if(busy==='create')return;
    const controller=new AbortController();
    setLoading(true); setKeysError('');setKeys([]);setAllKeys([]);setKeysScope('');
    if (!scopePath || !composerReady) {setLoading(false);return;}
    void keyRequest<{data:ProjectKey[]}>(token,scopePath,'GET',undefined,controller.signal).then(payload=>{
      if(controller.signal.aborted)return;
      const active=payload.data.filter(key=>!key.revoked && !key.expired); setKeys(active);setAllKeys(payload.data);setKeysScope(keyScopeIdentity);
      setKeyId(current=>{
        const requested=search.get('key');
        if(requested)return payload.data.find(key=>key.slug===requested||key.id===requested)?.id ?? requested;
        const restored=restoredComposer.current;
        if(restored?.identity===composerIdentity&&restored.keyId)return restored.keyId;
        if(search.get('job')||search.get('intent'))return current;
        return active.some(key=>key.id===current)?current:active[0]?.id??'';
      });
    }).catch(error=>{if(!controller.signal.aborted)setKeysError(message(error));}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
    // URL key restoration applies only when loading this workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[token,scopePath,keysRevision,composerReady,composerIdentity,selected,intentId,busy==='create']);

  const requestedKey=search.get('key');
  useEffect(()=>{
    if(!requestedKey || keysScope!==keyScopeIdentity)return;
    const resolved=allKeys.find(key=>key.slug===requestedKey||key.id===requestedKey);
    if(selected||intentId||composerReady)setKeyId(resolved?.id ?? requestedKey);
    if(resolved?.slug && requestedKey!==resolved.slug)setSearch(previous=>{
      if(previous.get('key')!==requestedKey)return previous;
      const next=new URLSearchParams(previous);next.set('key',resolved.slug!);return next;
    },{replace:true});
  },[requestedKey,allKeys,keysScope,keyScopeIdentity,selected,intentId,composerReady,setSearch]);
  useEffect(()=>{
    const controller=new AbortController(); const changedScope=loadedBase.current !== base;
    if(changedScope)setModels([]);
    setQuote(null);
    setCatalogError('');
    if (!base || !composerReady) return;
    setLoading(changedScope);
    void Promise.allSettled([
      request<VideoModelList>(token,base,'/v1/video/models',undefined,controller.signal),
    ]).then(([catalog])=>{
      if(controller.signal.aborted)return;
      if(catalog.status === 'fulfilled') {
        const restored=mutableComposer&&restoredComposer.current?.identity===composerIdentity&&restoredComposer.current.keyId===keyId&&restoredComposer.current.model===modelId;
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
  },[token,base,revision,composerReady]);
  const requestedModel=search.get('model');
  useEffect(()=>{
    if(!mutableComposer||!composerReady||!requestedModel||requestedModel===modelId)return;
    restoredComposer.current=null;
    setModelId(requestedModel);
    const requested=models.find(model=>model.id===requestedModel);
    setControls(requested?initialControls(requested):{});
  },[requestedModel,mutableComposer,composerReady,models,modelId]);
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

  function chooseKey(id:string) {restoredComposer.current=null;setComposerEdited(true);setKeyId(id);const next=new URLSearchParams(search);next.set('key',keyReference(id));next.delete('job');next.delete('intent');next.set('new','video');setSearch(next);setQuote(null);setUncertain(false);}
  async function estimate() {
    if(!form.body || !base || lock.current || uncertain || readingImages || draftBlocked)return;
    const controller=new AbortController();estimateController.current?.abort();estimateController.current=controller;
    setBusy('estimate');setError('');
    try {if(mutableComposer&&canWrite&&!await draft.flush())return;const result=await request<VideoEstimate>(token,base,'/v1/video/estimate',form.body,controller.signal);if(!controller.signal.aborted){setQuote(result);setQuotedBody(JSON.stringify(form.body));}}
    catch(error){if(!controller.signal.aborted)setError(message(error));}
    finally{if(estimateController.current === controller)setBusy('');}
  }
  async function saveOrSubmitRequest(action:'save'|'submit',confirmedOwnerFunded=false) {
    const submit=action==='submit';
    if(!form.body || (submit&&(submissionStopped||(!quoteMatches&&!(confirmedOwnerFunded&&unquotedOwnerFunded)))) || !base || !canWrite || lock.current || uncertain || readingImages || restoringIntent || draftBlocked)return;
    const generation=currentGeneration();
    let ownedIntentId='';
    let draftTicket:VideoDraftTicket|null=null;
    const currentOperation=()=>generation===currentGeneration() && (!ownedIntentId || routeIntent.current===ownedIntentId);
    lock.current=true;setBusy('create');setSubmittedPrompt(prompt);setError('');
    try {
      if(mutableComposer){draftTicket=await draft.flush();if(!draftTicket||!currentOperation())return;}
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
        await prepareVideoSessionIntent(intentClient,{organizationId:workspace.organization_id,projectId:workspace.id},{sessionId,turnId,intentId:intent.id,keyId,title:'Video request',request:form.body as VideoIntentRequest});
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
  const epoch=timings?.data[0]?.started_unix_ms ?? 0;
  const total=Math.max(1,...(timings?.data.map(span=>span.started_unix_ms-epoch+span.elapsed_ms) ?? []));
  return <div className="video-shell">
    <GenerationSessionBindings trigger={historyTriggerRef} title={intentDocument?.id===intentId ? videoSessionTitle(intentDocument) : selected ? job?.model ? `Video · ${job.model}` : 'Video session' : 'New generation'} actions={<DropdownMenu open={keyPickerOpen} onOpenChange={setKeyPickerOpen}><DropdownMenuTrigger asChild><Button variant="outline" className="video-key-choice" aria-label="Video API key" disabled={Boolean(busy) || loading || readingImages || draftBlocked || Boolean(intentId && !intentDocument?.job)}><KeyIcon size={16}/><span className="truncate">{originalKey ? `${originalKey.name}${originalKey.revoked ? ' · Revoked':originalKey.expired ? ' · Expired':''}` : (loading ? 'Loading keys…':'No active API key')}</span></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuRadioGroup value={keyId} onValueChange={id=>{const chosen=availableKeys.keys.find(key=>key.id===id);if(chosen&&chosen.workspace.id!==workspace?.id){navigate(`/generations?new=video&workspace=${encodeURIComponent(workspacePathSegment(chosen.workspace,context.workspaces??[chosen.workspace]))}&key=${encodeURIComponent(chosen.slug || id)}`);}else chooseKey(id);}}>{(availableKeys.keys.length?availableKeys.keys:keys.map(key=>({...key,workspace}))).map(key=><DropdownMenuRadioItem key={key.id} value={key.id}>{key.name}{key.workspace && key.workspace.id!==workspace?.id ? ` · ${workspaceDisplayName(key.workspace.name)}`:''}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>} history={{context: (context), currentKeys: (allKeys), videoKeyId: (keyId), activeVideo: (selected), activeIntent: (intentId), activeVideoSession: (search.get('session')??''), onIntentDeleted: (id=>{if(id===intentId)setRevision(value=>value+1);}), disabled: (Boolean(busy))}} />
    <section className="video-main" aria-label="Video generation">

      <div className="video-content">
        {(keysError || intentError || error || catalogError) && <div role="alert" className="video-error">{keysError || intentError || error || catalogError}<Button variant="ghost" onClick={reloadSaved} disabled={Boolean(busy) || loading}>Reload</Button></div>}
        {!workspace ? <p>Add an API key to generate videos.</p> : <>
        <div className="video-conversation" aria-label="Video conversation">
          {!selected && !intentId ? <Empty className="video-welcome"><EmptyHeader><EmptyTitle>Create a video</EmptyTitle><EmptyDescription>Describe the scene you want to bring to life.</EmptyDescription></EmptyHeader></Empty> : <div className="video-turn">
            {submittedPrompt && <div className="video-user-message"><p>{submittedPrompt}</p></div>}
            <article className="video-response" aria-label="Video result">
              <div className="video-result-heading"><span className="video-response-model">{job?.model ?? intentDocument?.model ?? 'Video'}</span>{job && <Badge variant="secondary">{statusLabel[job.status]}</Badge>}</div>
            {detailError && <p role="alert" className="video-error">{detailError}</p>}
            {selected && !job && detailError && <Button variant="outline" onClick={reloadSaved} disabled={Boolean(busy)}>Reload status</Button>}
            {historicalReadOnly&&<p role="status" className="video-muted">Saved history is available. The original API key is revoked, expired, missing or no longer grants this model; generation and Provider checks are disabled.</p>}
            {!selected ? <p className="video-muted">{submissionStopped ? 'This request was not dispatched. Resolve the admission error before starting a new generation.' : intentDocument?.submission_state==='saved' ? 'This saved request has not been submitted.':'Submit a video or select a saved job.'}</p> : !job && !detailError ? <p role="status">Loading saved video…</p> : job && <>
              {(job.status === 'submission_unknown' || job.status === 'reconciliation_required') && <p>The outcome is unresolved. Do not resubmit this generation.</p>}
                  {job.status === 'succeeded' && intentClient && workspace && <VideoResult key={`${workspace.id}/${selected}`} client={intentClient} scope={{organizationId:workspace.organization_id,projectId:workspace.id}} task={job.id} keyId={base ? keyId:undefined} canWrite={canWrite} libraryHref={`${workspacePath}/library`}/>}

              {job.status !== 'succeeded' && <div className="video-artifact-placeholder">{(job.status==='queued'||job.status==='running')&&<Loader className="animate-spin"/>}<h3 role="status">{job.status==='queued'?'Waiting to generate':job.status==='running'?'Generating your video…':job.status==='failed'?'Video generation failed':'Waiting for a confirmed status'}</h3><p>{job.status==='queued'?'Your request is queued. This conversation updates automatically.':job.status==='running'?'Your video will appear here when it is ready.':job.status==='failed'?'Open video details to inspect the recorded failure.':'The original task is being checked. Do not submit it again.'}</p></div>}
              <Sheet><SheetTrigger asChild><Button variant="ghost" size="icon" className="video-details-trigger" aria-label="Video details"><InfoCircle size={18}/></Button></SheetTrigger><SheetContent className="overflow-y-auto"><SheetHeader><SheetTitle>Video details</SheetTitle><SheetDescription>Generation status, timing and customer charges.</SheetDescription></SheetHeader><div className="video-details p-4">
                  <div className="video-actions"><Button variant="outline" onClick={reloadSaved} disabled={Boolean(busy)}>Reload status</Button><Button variant="ghost" onClick={()=>void refresh()} disabled={!canWrite || !base || Boolean(busy) || job.status === 'submission_unknown'}><RefreshCw size={14}/>{busy === 'refresh' ? 'Checking…':'Check Provider'}</Button></div>
                  {timings?.lifecycle && <VideoLifecycle timing={timings.lifecycle}/>}
                  {timings?.data.length ? <div className="video-timings"><h3>Transport time</h3><p className="video-muted">Submission, status queries and result transfers; Provider queue and generation time are not measured here.</p>{timings.data.map((span,index)=><div className="video-span" key={index}><span>{span.phase === 'submission' ? 'Submission' : span.phase === 'query' ? 'Status query' : span.phase === 'result' ? 'Result transfer' : 'Other transport'}</span><div className="video-span-track"><i style={{marginLeft:`${(span.started_unix_ms-epoch)/total*100}%`,width:`${Math.max(.5,span.elapsed_ms/total*100)}%`}}/></div><small>{span.elapsed_ms} ms</small></div>)}{timings.has_more && <small>Showing the latest recorded requests.</small>}</div> : null}
                  <h3>Billing</h3>{billing ? <VideoBilling billing={billing}/> : <p role={diagnosticsLoading?'status':undefined}>{diagnosticsLoading?'Loading billing…':'Billing is unavailable.'}</p>}              <Button asChild variant="link"><Link to={`${workspacePath}/executions?modelAlias=${encodeURIComponent(job.model)}#gateway-attempt-${encodeURIComponent(savedTask?.reference??job.id)}`}>View in Logs</Link></Button>
              </div></SheetContent></Sheet>

            </>}

            </article>
          </div>}
        </div>
        {historicalReadOnly ? <div className="video-composer"><Button asChild variant="outline"><Link to={`${workspacePath}/keys`}>Manage API keys</Link></Button></div> : <form className="video-composer" onSubmit={event=>{event.preventDefault();if(unquotedOwnerFunded){if(form.body&&base&&canWrite&&!busy&&!uncertain&&!draftBlocked&&!readingImages&&!restoringIntent&&!submissionStopped)setUnquotedConfirmation({body:JSON.stringify(form.body),generation:currentGeneration(),job:selected,intent:intentId});return;}void (quoteMatches ? saveOrSubmitRequest('submit') : estimate());}}>
          <div className="video-composer-surface">
            {mutableComposer&&!draft.ready&&!draft.error&&<p role="status" className="video-muted">Loading saved Video draft…</p>}
            {mutableComposer&&draft.error&&<div role="alert" className="video-error">{draft.error}<Button type="button" variant="ghost" onClick={draft.reload} disabled={Boolean(busy)}>Load saved draft</Button></div>}
            {mutableComposer&&draft.ready&&<p role="status" className="video-muted">{draft.saving?'Saving draft…':draft.dirty?canWrite?'Unsaved changes':'Your changes are not saved with read access.':composerEdited||draft.confirmed?'Draft saved':''}</p>}
            {images.length>0&&<p className="video-muted">Inline image attachments are not saved in your draft. Reattach them after reloading.</p>}
            {draftReferences.length>0&&<p className="video-muted">{draftReferences.length} saved material reference{draftReferences.length===1?'':'s'}. Current access and inspection are checked when submitting.</p>}
            {mutableComposer&&draft.ready&&restoredComposer.current&&!base&&!loading&&<p className="video-muted">The saved API key is unavailable for generation. Your draft is retained. Choose an active API key to continue.</p>}
            {loading ? <p role="status" className="video-muted">Loading video models…</p> : keys.length > 0 && !model && !error && !keysError ? <Empty className="min-h-40"><EmptyHeader><EmptyTitle>No video model available</EmptyTitle><EmptyDescription>This API key has no supported video route.</EmptyDescription></EmptyHeader><EmptyContent><Button asChild variant="outline"><Link to={canManageSuppliers ? '/admin/providers':'/models'}>{canManageSuppliers ? 'Manage Providers':'View models'}</Link></Button></EmptyContent></Empty> : null}
            <>
              {model&&intentClient&&workspace&&<ImageReferences model={model} client={intentClient} scope={{organizationId:workspace.organization_id,projectId:workspace.id}} references={draftReferences} onReferencesChange={references=>{setComposerEdited(true);setDraftReferences(references);}} images={images} onChange={setImages} disabled={Boolean(busy) || uncertain || draftBlocked || (!model.workspace_asset&&draftReferences.length>0) || Boolean(intentId && !intentDocument?.job)} onReadingChange={reading=>{setReadingImages(reading);if(reading){estimateController.current?.abort();setQuote(null);}}}/>}

              <Label htmlFor="video-prompt" className="sr-only">Prompt</Label><Textarea id="video-prompt" placeholder="Describe your video…" rows={2} value={prompt} onChange={event=>{setComposerEdited(true);setPrompt(event.target.value);}} disabled={draftBlocked || busy === 'create' || restoringIntent || Boolean(intentId && !intentDocument?.job)} onKeyDown={event=>{if(event.key==='Enter' && !event.shiftKey && !event.nativeEvent.isComposing){event.preventDefault();if(!form.body || !base || busy || uncertain || draftBlocked || readingImages || restoringIntent || submissionStopped)return;if(unquotedOwnerFunded){if(canWrite)setUnquotedConfirmation({body:JSON.stringify(form.body),generation:currentGeneration(),job:selected,intent:intentId});return;}if(!quoteMatches || canWrite)void (quoteMatches ? saveOrSubmitRequest('submit') : estimate());}}}/>
              {prompt && form.error && <p role="alert" className="video-error">{form.error}</p>}
              {quoteMatches && quote && <div className="video-estimate"><span>{quote.effective_output.specification.resolution} · {quote.effective_output.specification.ratio} · {quote.effective_output.duration_seconds}s{quote.effective_output.frames_per_second != null && ` · ${quote.effective_output.frames_per_second} FPS`}</span><strong>{quote.estimate.amount_nanos != null && quote.estimate.currency ? `Estimated ${money(quote.estimate.amount_nanos,quote.estimate.currency)}`:'Charged to your Provider account'}</strong>{quote.maximum_charge_nanos != null && quote.estimate.currency && <small>Reserves up to {money(quote.maximum_charge_nanos,quote.estimate.currency)}. Final charge follows reported usage.</small>}</div>}

              {unquotedOwnerFunded && <p role="status" className="video-muted">Estimate unavailable. Your Provider may charge your account.</p>}
              {uncertain && <p role="alert">{intentDocument&&intentDocument.content_state!=='retained' ? 'The saved input has expired or been deleted. Task history remains available.':'Reload this saved request to confirm its input and original submission status before continuing.'}</p>}
            </>
            <div className="video-composer-toolbar"><div className="video-composer-options">
              {!selected&&<Button type="button" variant="ghost" disabled={!base||!form.body||!canWrite||Boolean(busy)||uncertain||readingImages||draftBlocked||images.length>0||Boolean(intentDocument?.session_binding)} onClick={()=>void saveOrSubmitRequest('save')}>{intentDocument?.session_binding?'Request saved':intentId?'Save to session':'Save request'}</Button>}


              {models.length>0&&<DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" className="video-model-choice" aria-label="Video model" disabled={Boolean(busy) || readingImages || draftBlocked || Boolean(intentId && !intentDocument?.job)}><span className="truncate">{model?.id||modelId||'Choose video model'}</span><ChevronDown size={14}/></Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuRadioGroup value={modelId} onValueChange={id=>{restoredComposer.current=null;setComposerEdited(true);setModelId(id);const query=new URLSearchParams(search);query.set('model',id);setSearch(query);const next=models.find(model=>model.id === id);setControls(next ? initialControls(next):{});}}>{models.map(item=><DropdownMenuRadioItem key={item.id} value={item.id}>{item.id}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>}

              {model&&<>
                <Popover><PopoverTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label="Additional settings"><Settings size={18}/></Button></PopoverTrigger><PopoverContent side="top" align="end" aria-label="Video settings" className="video-settings-popover"><h2>Video settings</h2><div className="video-controls">
                {Object.entries(model.controls).map(([name,rule])=><div key={name} className="video-field"><Label htmlFor={`video-${name}`}>{controlLabels[name] ?? name}</Label>
                  {rule.kind === 'choice' ? <DropdownMenu><DropdownMenuTrigger asChild><Button id={`video-${name}`} variant="outline" className="video-choice" disabled={draftBlocked || busy === 'create' || Boolean(intentId && !intentDocument?.job)}>{String(controls[name] ?? 'Choose…')}<ChevronDown size={14}/></Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuRadioGroup value={String(controls[name] ?? '')} onValueChange={value=>{setComposerEdited(true);setControls(current=>{const next={...current,[name]:value};if(name === 'resolution' && model.output && !model.output.specifications.some(spec=>spec.resolution === value && spec.ratio === current.ratio)){const spec=model.output.specifications.find(spec=>spec.resolution === value);if(spec)next.ratio=spec.ratio;}return next;});}}>{rule.values.filter(value=>name !== 'ratio' || !model.output || model.output.specifications.some(spec=>spec.resolution === controls.resolution && spec.ratio === value)).map(value=><DropdownMenuRadioItem key={value} value={value}>{value}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
                  : rule.kind === 'integer' ? <><Input id={`video-${name}`} type="number" min={rule.minimum} max={rule.maximum} step={1} value={String(controls[name] ?? '')} onChange={event=>{setComposerEdited(true);setControls(current=>({...current,[name]:event.target.value}));}} disabled={draftBlocked || busy === 'create' || Boolean(intentId && !intentDocument?.job)}/><small className="video-muted">{rule.minimum}–{rule.maximum}</small></>
                  : <Checkbox id={`video-${name}`} checked={controls[name] === true} onCheckedChange={checked=>{setComposerEdited(true);setControls(current=>({...current,[name]:checked === true}));}} disabled={draftBlocked || busy === 'create' || Boolean(intentId && !intentDocument?.job)}/>}</div>)}
              <Button type="button" variant="ghost" onClick={()=>{setComposerEdited(true);setControls(initialControls(model));}} disabled={draftBlocked || busy === 'create' || Boolean(intentId && !intentDocument?.job)}>Reset settings</Button>

                </div><Button type="button" variant="ghost" disabled={toolsState==='loading'||toolsState==='unsupported'} onClick={()=>toolsState==='error' ? setToolsRevision(value=>value+1) : setProviderToolsOpen(true)}>{toolsState==='loading'?'Checking Provider tools…':toolsState==='error'?'Retry Provider tools':'Provider tools'}</Button>{toolsState==='unsupported'&&<p className="video-muted">This model has no native Provider tools.</p>}{toolsState==='error'&&<p role="alert" className="video-error">{nativeTools.error}</p>}</PopoverContent></Popover>
              </>}
            </div>
            {model && <Button type="submit" size="icon" aria-label={quoteMatches || unquotedOwnerFunded ? 'Generate video':'Estimate'} title={quoteMatches || unquotedOwnerFunded ? 'Generate video':'Estimate generation cost'} disabled={!base || !form.body || Boolean(busy) || uncertain || readingImages || restoringIntent || draftBlocked || ((quoteMatches || unquotedOwnerFunded) && !canWrite) || submissionStopped}><ArrowUp size={20}/></Button>}
            </div>
            {!loading && !keys.length && <Button asChild variant="outline"><Link to={`${workspacePath}/keys`}>Manage API keys</Link></Button>}
            {!canWrite && <small className="video-muted">{unquotedOwnerFunded ? 'Generation needs write access.' : 'Read access can estimate; generation needs write access.'}</small>}
          </div>
        </form>}
        <Dialog open={Boolean(unquotedConfirmation)} onOpenChange={open=>{if(!open)setUnquotedConfirmation(null);}}><DialogContent><DialogHeader><DialogTitle>Generate video with your Provider account</DialogTitle><DialogDescription>No output estimate is configured for this model. Your Provider may charge your account. This sends the request once; an uncertain outcome must be checked before another submission.</DialogDescription></DialogHeader><p className="break-words text-sm">{model?.id}</p>{!confirmationMatches&&<p role="alert" className="text-sm text-destructive">The request or access changed. Close this dialog and review the current request.</p>}<DialogFooter><Button variant="outline" onClick={()=>setUnquotedConfirmation(null)}>Cancel</Button><Button disabled={!confirmationMatches||submissionStopped||!canWrite||!base||Boolean(busy)||uncertain||readingImages||restoringIntent||draftBlocked} onClick={()=>{if(!confirmationMatches)return;setUnquotedConfirmation(null);void saveOrSubmitRequest('submit',true);}}>Generate video</Button></DialogFooter></DialogContent></Dialog>
        <Dialog open={providerToolsOpen&&Boolean(toolsModule)} onOpenChange={setProviderToolsOpen}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>Provider tools</DialogTitle><DialogDescription>Tools available for the selected video model.</DialogDescription></DialogHeader>{toolsModule&&<VolcengineView key={toolsIdentity} workspaceName={workspace ? workspaceDisplayName(workspace.name) : 'Current workspace'} model={modelId} nativeContext={{keyId,model:modelId}}/>}</DialogContent></Dialog>
        </>}
      </div>
    </section>
  </div>;
}
