import { useGenerationKeys } from '@/features/generations/useGenerationKeys';
import { GenerationSessionBindings } from '@/features/generations/GenerationsLayout';
import { useBranding } from '@/app/branding';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router';
import { IconChevronDown as ChevronDown, IconArrowUp as ArrowUp, IconAdjustmentsHorizontal as Settings, IconKey as KeyIcon, IconRefresh as RefreshCw } from '@tabler/icons-react';
import type { VideoEstimate, VideoJobBilling, VideoJobState, VideoModelList, VideoTransportTimings } from '../../../../../sdks/javascript/src/index';
import { NiuAdminClient, type VideoIntentRequest, type VideoSubmissionIntent, type NativeProviderModule, type GenerationTask, type VideoComposerDraftPayload } from '../../../../../sdks/javascript/src/admin';
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
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { useSidebar } from '@/components/ui/sidebar';
import type { DashboardContext } from '@/app/dashboard-context';
import { workspaceDisplayName, workspacePathSegment } from '@/app/workspace-route';
import { keyRequest, projectKeyPath, type ProjectKey } from '@/features/keys/api';
import { money } from '@/lib/money';
import { controlLabels, initialControls, videoRequest, type ControlValues } from './request';
import VideoResult from './VideoResult';
import VideoBilling from './VideoBilling';
import VideoLifecycle from './VideoLifecycle';
import ImageReferences, { type NamedImageReference } from './ImageReferences';
import './video.css';
import VolcengineView from '@/features/provider-modules/volcengine/VolcengineView';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

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
  const canWrite=Boolean(session?.permissions.write);
  const [keyPickerOpen,setKeyPickerOpen]=useState(false);
  const [providerToolsOpen,setProviderToolsOpen]=useState(false);
  const availableKeys=useGenerationKeys(context,keyPickerOpen);
  const [search,setSearch]=useSearchParams();
  const {isMobile,setOpenMobile}=useSidebar();
  const [keys,setKeys]=useState<ProjectKey[]>([]);
  const [allKeys,setAllKeys]=useState<ProjectKey[]>([]);
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
  const [savedTask,setSavedTask]=useState<GenerationTask|null>(null);
  const [billing,setBilling]=useState<VideoJobBilling|null>(null);
  const [timings,setTimings]=useState<VideoTransportTimings|null>(null);
  const [quote,setQuote]=useState<VideoEstimate|null>(null);
  const [quotedBody,setQuotedBody]=useState('');
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
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
  const selected=search.get('job') ?? '';
  const intentId=search.get('intent') ?? '';
  const routeIntent=useRef(intentId);
  routeIntent.current=intentId;
  const intentClient=useMemo(()=>token ? new NiuAdminClient({adminToken:token,baseURL:new URL('/admin/v1',window.location.origin).href}):null,[token]);
  const [toolsRevision,setToolsRevision]=useState(0);
  const [nativeTools,setNativeTools]=useState<{identity:string;state:'loading'|'supported'|'unsupported'|'error';module?:NativeProviderModule;error?:string}>({identity:'',state:'loading'});
  const toolsIdentity=JSON.stringify([token,workspace?.organization_id,workspace?.id,keyId,modelId]);
  const toolsState=nativeTools.identity===toolsIdentity ? nativeTools.state : 'loading';
  const toolsModule=toolsState==='supported' ? nativeTools.module : undefined;
  useEffect(()=>{
    const controller=new AbortController();setProviderToolsOpen(false);
    setNativeTools({identity:toolsIdentity,state:'loading'});
    if(!intentClient||!workspace||!keyId||!modelId||!keys.some(key=>key.id===keyId&&(key.allowed_models.includes('*')||key.allowed_models.includes(modelId)))){setNativeTools({identity:toolsIdentity,state:'unsupported'});return()=>controller.abort();}
    const media=intentClient.dashboardMedia({organizationId:workspace.organization_id,projectId:workspace.id},keyId);
    void media.capabilities(modelId,{signal:controller.signal}).then(capabilities=>{
      if(controller.signal.aborted)return;
      const module=capabilities.modules.find(module=>module.module==='volcengine'&&module.model_alias===modelId);
      setNativeTools(module ? {identity:toolsIdentity,state:'supported',module}:{identity:toolsIdentity,state:'unsupported'});
    }).catch(error=>{if(!controller.signal.aborted)setNativeTools({identity:toolsIdentity,state:'error',error:message(error)});});
    return()=>controller.abort();
  },[intentClient,workspace?.organization_id,workspace?.id,keyId,modelId,keys,toolsIdentity,toolsRevision]);
  const retainedIntent=useMemo(()=>intentClient && workspace && intentId ? new VideoIntent(intentClient,{organizationId:workspace.organization_id,projectId:workspace.id},intentId):null,[intentClient,workspace?.organization_id,workspace?.id,intentId]);
  useEffect(()=>{
    if(!intentClient || !workspace || !selected || intentId || busy==='create')return;
    const request=new AbortController();setIntentError('');
    void findVideoIntent(intentClient,{organizationId:workspace.organization_id,projectId:workspace.id},selected,{signal:request.signal}).then(row=>{
      if(request.signal.aborted || !row)return;
      setSearch(previous=>{if(previous.get('intent') || previous.get('job')!==selected)return previous;const next=new URLSearchParams(previous);next.set('intent',row.id);if(row.keyId)next.set('key',row.keyId);return next;},{replace:true});
    }).catch(error=>{if(!request.signal.aborted)setIntentError(message(error));});
    return()=>request.abort();
  },[intentClient,workspace?.organization_id,workspace?.id,selected,intentId,busy==='create',revision]);
  const scopePath=workspace ? projectKeyPath(workspace.organization_id,workspace.id) : '';
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
  const originalKey=allKeys.find(key=>key.id===keyId);
  const keyCanReadModel=keys.some(key=>key.id===keyId&&(!savedModel||key.allowed_models.includes('*')||key.allowed_models.includes(savedModel)));
  const base=keyId && keysScope===keyScopeIdentity && keyCanReadModel ? `${scopePath}/${encodeURIComponent(keyId)}/video` : '';
  const historicalReadOnly=Boolean((intentDocument||savedTask)&&!base&&!loading);
  const responseScope = useRef({ identity: '', generation: 0 });
  const responseIdentity = JSON.stringify([token, base]);
  if (responseScope.current.identity !== responseIdentity) responseScope.current = { identity: responseIdentity, generation: responseScope.current.generation + 1 };
  const currentGeneration = () => responseScope.current.generation;
  useEffect(() => {
    lock.current=false;setBusy('');setUncertain(false);
    return () => { responseScope.current.generation += 1; };
  }, [token, base]);
  const model=models.find(item=>item.id === modelId);
  const canManageSuppliers=session?.kind === 'installation' || Boolean(session?.permissions.platform_admin);
  const workspacePath=workspace ? `/workspaces/${workspacePathSegment(workspace,workspaces)}` : '/workspaces/default';
  const form=useMemo(()=>{if(intentId && !intentDocument?.job)return {body:intentDocument?.request ?? null,error:''};try{
    if(images.length&&draftReferences.length)throw new Error('Inline images cannot be combined with saved material references in this composer.');
    const body=model?videoRequest(draftReferences.length?{...model,requires_image:false}:model,prompt,controls,images):null;
    if(body&&draftReferences.length)body.content.push(...draftReferences);
    return {body,error:''};
  }catch(error){return {body:null,error:message(error)};}},[model,prompt,controls,images,draftReferences,intentId,intentDocument]);
  useEffect(()=>{setImages([]);},[base,modelId]);

  const quoteMatches = Boolean(quote && quotedBody === JSON.stringify(form.body));

  useEffect(()=>{document.title=`Video · Generations · ${branding.display_name}`;return()=>{document.title=`Generations · ${branding.display_name}`;};},[branding.display_name]);

  useEffect(()=>{
    const controller=new AbortController();
    setLoading(true); setKeysError('');setKeys([]);setAllKeys([]);setKeysScope('');
    if (!scopePath || !composerReady) {setLoading(false);return;}
    void keyRequest<{data:ProjectKey[]}>(token,scopePath,'GET',undefined,controller.signal).then(payload=>{
      if(controller.signal.aborted)return;
      const active=payload.data.filter(key=>!key.revoked && !key.expired); setKeys(active);setAllKeys(payload.data);setKeysScope(keyScopeIdentity);
      setKeyId(current=>{
        const requested=search.get('key');
        if(requested)return requested;
        const restored=restoredComposer.current;
        if(restored?.identity===composerIdentity&&restored.keyId)return restored.keyId;
        if(search.get('job')||search.get('intent'))return current;
        return active.some(key=>key.id===current)?current:active[0]?.id??'';
      });
    }).catch(error=>{if(!controller.signal.aborted)setKeysError(message(error));}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
    // URL key restoration applies only when loading this workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[token,scopePath,keysRevision,composerReady,composerIdentity]);

  const requestedKey=search.get('key');
  useEffect(()=>{if(requestedKey && (selected||intentId||(composerReady&&keys.some(key=>key.id===requestedKey))))setKeyId(requestedKey);},[requestedKey,keys,selected,intentId,composerReady]);
  useEffect(()=>{
    const controller=new AbortController(); const changedScope=loadedBase.current !== base;
    if(changedScope)setModels([]);
    setQuote(null);
    if (!base || !composerReady) return;
    setLoading(changedScope);setError('');
    void Promise.allSettled([
      request<VideoModelList>(token,`${base}/models`,undefined,controller.signal),
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
      else setError(message(catalog.reason));
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
    const restoring=new VideoIntent(intentClient!,{organizationId:workspace!.organization_id,projectId:workspace!.id},intentId);
    void restoring.restore({signal:controller.signal}).then(document=>{
      if(controller.signal.aborted)return;
      loadedIntent.current=restoring;
      setIntentDocument(document);
      const draftIdentity=JSON.stringify([token,scopePath,document.id]);
      setSubmittedPrompt(document.request ? document.request.content.flatMap(item=>item.type==='text' ? [item.text] : []).join('\n'):'');
      if(restoredDraftIdentity.current!==draftIdentity || !document.job){
        restoredDraftIdentity.current=draftIdentity;
        setPrompt('');setControls({});setImages([]);setDraftReferences([]);setDraftSessionId(null);setModelId(document.model);
        if(document.request){
          setPrompt(document.job ? '' : document.request.content.flatMap(item=>item.type==='text' ? [item.text] : []).join('\n'));
          setDraftReferences(document.request.content.filter((item):item is VideoComposerDraftPayload['references'][number]=>item.type==='workspace_asset'||item.type==='provider_asset'));
          setDraftSessionId(document.session_binding?.session_id??search.get('session'));
          if(document.session_binding)setSearch(previous=>{const next=new URLSearchParams(previous);next.set('session',document.session_binding!.session_id);next.set('turn',document.session_binding!.turn_id);return next;},{replace:true});
          const restored:ControlValues={};
          for(const [name,value] of Object.entries(document.request))if(name!=='model' && name!=='content' && (typeof value==='boolean' || typeof value==='string' || typeof value==='number'))restored[name]=typeof value==='boolean' ? value:String(value);
          setControls(restored);
        }
      }
      if(document.key_id && document.key_id!==keyId)setKeyId(document.key_id);
      setUncertain(document.content_state!=='retained' || (document.submission_state!=='saved' && !document.job));
      if(document.job){setSearch(previous=>{const next=new URLSearchParams(previous);next.set('job',document.job!.id);next.set('key',document.key_id);return next;},{replace:true});}
    }).catch(error=>{if(!controller.signal.aborted)setIntentError(message(error));}).finally(()=>{if(!controller.signal.aborted)setRestoringIntent(false);});
    return()=>controller.abort();
  },[retainedIntent,revision,busy === 'create']);
  // Reopening the same history intent can remove job from the URL without
  // changing the intent identity. Recover only its server-associated job.
  useEffect(()=>{
    const restoredJob=intentDocument?.job;
    if(!intentId || intentDocument?.id!==intentId || !restoredJob || selected===restoredJob.id)return;
    setSearch(previous=>{const next=new URLSearchParams(previous);next.set('job',restoredJob.id);next.set('key',intentDocument.key_id);return next;},{replace:true});
  },[intentId,intentDocument,selected,setSearch]);
  useEffect(()=>{
    const controller=new AbortController();setJob(null);setSavedTask(null);setBilling(null);setTimings(null);setDetailError('');
    if(!intentClient||!workspace||!selected)return;
    const history=intentClient.generations({organizationId:workspace.organization_id,projectId:workspace.id});
    void Promise.allSettled([
      history.tasks.retrieve(selected,{signal:controller.signal}),
      base ? request<VideoJobBilling>(token,`${base}/jobs/${encodeURIComponent(selected)}/billing`,undefined,controller.signal) : Promise.resolve(null),
      base ? request<VideoTransportTimings>(token,`${base}/jobs/${encodeURIComponent(selected)}/timings`,undefined,controller.signal) : Promise.resolve(null),
    ]).then(([status,charges,spans])=>{
      if(controller.signal.aborted)return;
      if(status.status === 'fulfilled'){const task=status.value.data;setSavedTask(task);setJob({id:task.id,object:'video.job',model:task.model,status:task.state});}else setDetailError(message(status.reason));
      if(charges.status === 'fulfilled')setBilling(charges.value);else setDetailError(message(charges.reason));
      if(spans.status === 'fulfilled')setTimings(spans.value);else setDetailError(message(spans.reason));
    });
    return()=>controller.abort();
  },[intentClient,token,workspace?.organization_id,workspace?.id,base,selected,revision]);

  // Only reconcile an existing job. Polling never creates or retries a submission.
  useEffect(()=>{
    if(!base || !selected || !job || !['queued','running'].includes(job.status))return;
    const controller=new AbortController();let pending=false;
    const timer=window.setInterval(async()=>{
      if(pending || lock.current)return;pending=true;
      try {
        if(canWrite)await request(token,`${base}/jobs/${encodeURIComponent(selected)}/refresh`,{},controller.signal);
        const status=await request<VideoJobState>(token,`${base}/jobs/${encodeURIComponent(selected)}`,undefined,controller.signal);
        if(!controller.signal.aborted){setJob(status);setDetailError('');}
      }catch(error){if(!controller.signal.aborted)setDetailError(message(error));}
      finally{pending=false;}
    },5000);
    return()=>{window.clearInterval(timer);controller.abort();};
  },[token,base,selected,job?.status,canWrite]);

  function openJob(id:string) {const next=new URLSearchParams(search);next.set('job',id);next.set('key',keyId);setSearch(next);if(isMobile)setOpenMobile(false);}

  function chooseKey(id:string) {restoredComposer.current=null;setComposerEdited(true);setKeyId(id);const next=new URLSearchParams(search);next.set('key',id);next.delete('job');next.delete('intent');next.set('new','video');setSearch(next);setQuote(null);setUncertain(false);}
  async function estimate() {
    if(!form.body || !base || lock.current || readingImages || draftBlocked)return;
    const controller=new AbortController();estimateController.current?.abort();estimateController.current=controller;
    setBusy('estimate');setError('');
    try {if(mutableComposer&&canWrite&&!await draft.flush())return;const result=await request<VideoEstimate>(token,`${base}/estimate`,form.body,controller.signal);if(!controller.signal.aborted){setQuote(result);setQuotedBody(JSON.stringify(form.body));}}
    catch(error){if(!controller.signal.aborted)setError(message(error));}
    finally{if(estimateController.current === controller)setBusy('');}
  }
  async function saveOrSubmitRequest(action:'save'|'submit') {
    const submit=action==='submit';
    if(!form.body || (submit&&!quoteMatches) || !base || !canWrite || lock.current || uncertain || readingImages || restoringIntent || draftBlocked)return;
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
        const next=new URLSearchParams(search);next.set('intent',intent.id);next.set('session',sessionId);next.set('turn',turnId);next.delete('new');next.set('workspace',workspace.id);next.set('key',keyId);setSearch(next,{replace:true});
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
        result=await request<VideoJobState>(token,`${base}/jobs`,form.body);
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
    try {await request(token,`${base}/jobs/${encodeURIComponent(selected)}/refresh`,{});if(generation === currentGeneration())setRevision(value=>value+1);}
    catch(error){if(generation === currentGeneration())setDetailError(message(error));}
    finally{if(generation === currentGeneration()){lock.current=false;setBusy('');}}
  }


  const epoch=timings?.data[0]?.started_unix_ms ?? 0;
  const total=Math.max(1,...(timings?.data.map(span=>span.started_unix_ms-epoch+span.elapsed_ms) ?? []));
  return <div className="video-shell">
    <GenerationSessionBindings trigger={historyTriggerRef} title={intentDocument?.id===intentId ? videoSessionTitle(intentDocument) : selected ? job?.model ? `Video · ${job.model}` : 'Video session' : 'New generation'} actions={<DropdownMenu open={keyPickerOpen} onOpenChange={setKeyPickerOpen}><DropdownMenuTrigger asChild><Button variant="outline" className="video-key-choice" aria-label="Video API key" disabled={Boolean(busy) || loading || draftBlocked || Boolean(intentId && !intentDocument?.job)}><KeyIcon size={16}/><span className="truncate">{originalKey ? `${originalKey.name}${originalKey.revoked ? ' · Revoked':originalKey.expired ? ' · Expired':''}` : (loading ? 'Loading keys…':'No active API key')}</span></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuRadioGroup value={keyId} onValueChange={id=>{const chosen=availableKeys.keys.find(key=>key.id===id);if(chosen&&chosen.workspace.id!==workspace?.id){navigate(`/generations?new=video&workspace=${encodeURIComponent(chosen.workspace.id)}&key=${encodeURIComponent(id)}`);}else chooseKey(id);}}>{(availableKeys.keys.length?availableKeys.keys:keys.map(key=>({...key,workspace}))).map(key=><DropdownMenuRadioItem key={key.id} value={key.id}>{key.name}{key.workspace && key.workspace.id!==workspace?.id ? ` · ${key.workspace.name}`:''}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>} history={{context: (context), currentKeys: (keys), videoKeyId: (keyId), activeVideo: (selected), activeIntent: (intentId), onIntentDeleted: (id=>{if(id===intentId)setRevision(value=>value+1);}), disabled: (Boolean(busy))}} />
    <section className="video-main" aria-label="Video generation">

      <div className="video-content">
        {(keysError || intentError || error) && <div role="alert" className="video-error">{keysError || intentError || error}<Button variant="ghost" onClick={()=>keysError ? setKeysRevision(value=>value+1) : setRevision(value=>value+1)} disabled={Boolean(busy) || loading}>Reload</Button></div>}
        {!workspace ? <p>Add an API key to generate videos.</p> : <>
        <div className="video-conversation" aria-label="Video conversation">
          {!selected && !intentId ? <Empty className="video-welcome"><EmptyHeader><EmptyTitle>Create a video</EmptyTitle><EmptyDescription>Describe the scene you want to bring to life.</EmptyDescription></EmptyHeader></Empty> : <div className="video-turn">
            {submittedPrompt && <div className="video-user-message"><p>{submittedPrompt}</p></div>}
            <article className="video-response" aria-label="Video result">
              <div className="video-result-heading"><span className="video-response-model">{job?.model ?? intentDocument?.model ?? 'Video'}</span>{job && <Badge variant="secondary">{statusLabel[job.status]}</Badge>}</div>
            {detailError && <p role="alert" className="video-error">{detailError}</p>}
            {selected && !job && detailError && <Button variant="outline" onClick={()=>setRevision(value=>value+1)} disabled={Boolean(busy)}>Reload status</Button>}
            {historicalReadOnly&&<p role="status" className="video-muted">Saved history is available. The original API key is revoked, expired, missing or no longer grants this model; generation and Supplier checks are disabled.</p>}
            {!selected ? <p className="video-muted">{intentDocument?.submission_state==='saved' ? 'This saved request has not been submitted.':'Submit a video or select a saved job.'}</p> : !job && !detailError ? <p role="status">Loading saved video…</p> : job && <>
              {(job.status === 'submission_unknown' || job.status === 'reconciliation_required') && <p>The outcome is unresolved. Do not resubmit this generation.</p>}
                  {job.status === 'succeeded' && intentClient && workspace && <VideoResult key={`${workspace.id}/${selected}`} client={intentClient} scope={{organizationId:workspace.organization_id,projectId:workspace.id}} task={selected} keyId={base ? keyId:undefined} canWrite={canWrite}/>}

              {job.status !== 'succeeded' && <p role="status" className="video-muted">{job.status === 'queued' ? 'Your video is queued.' : job.status === 'running' ? 'Generating your video…' : job.status === 'failed' ? 'Video generation failed. Open generation details for the recorded status.' : 'Waiting for a confirmed generation status.'}</p>}
              <Collapsible className="video-generation-details"><CollapsibleTrigger asChild><Button variant="ghost" size="sm">Generation details<ChevronDown size={14}/></Button></CollapsibleTrigger><CollapsibleContent className="video-details">
                  <div className="video-actions"><Button variant="outline" onClick={()=>setRevision(value=>value+1)} disabled={Boolean(busy)}>Reload status</Button><Button variant="ghost" onClick={()=>void refresh()} disabled={!canWrite || !base || Boolean(busy) || job.status === 'submission_unknown'}><RefreshCw size={14}/>{busy === 'refresh' ? 'Checking…':'Check Supplier'}</Button></div>
                  {timings?.lifecycle && <VideoLifecycle timing={timings.lifecycle}/>}
                  {timings?.data.length ? <div className="video-timings"><h3>Transport time</h3><p className="video-muted">Submission and status requests; Supplier queue and generation time are not measured here.</p>{timings.data.map((span,index)=><div className="video-span" key={index}><span>{span.phase === 'submission' ? 'Submission':'Status query'}</span><div className="video-span-track"><i style={{marginLeft:`${(span.started_unix_ms-epoch)/total*100}%`,width:`${Math.max(.5,span.elapsed_ms/total*100)}%`}}/></div><small>{span.elapsed_ms} ms</small></div>)}{timings.has_more && <small>Showing the latest recorded requests.</small>}</div> : null}
                  {!base&&<p className="video-muted">Billing and transport details require current access through the original API key.</p>}<h3>Billing</h3>{billing ? <VideoBilling billing={billing}/> : <p>Billing is unavailable.</p>}              <Button asChild variant="link"><Link to={`${workspacePath}/executions?modelAlias=${encodeURIComponent(job.model)}#gateway-attempt-${encodeURIComponent(job.id)}`}>View in Logs</Link></Button>
              </CollapsibleContent></Collapsible>

            </>}

            </article>
          </div>}
        </div>
        {historicalReadOnly ? <div className="video-composer"><Button asChild variant="outline"><Link to={`${workspacePath}/keys`}>Manage API keys</Link></Button></div> : <form className="video-composer" onSubmit={event=>{event.preventDefault();void (quoteMatches ? saveOrSubmitRequest('submit') : estimate());}}>
          <div className="video-composer-surface">
            {mutableComposer&&!draft.ready&&!draft.error&&<p role="status" className="video-muted">Loading saved Video draft…</p>}
            {mutableComposer&&draft.error&&<div role="alert" className="video-error">{draft.error}<Button type="button" variant="ghost" onClick={draft.reload} disabled={Boolean(busy)}>Load saved draft</Button></div>}
            {mutableComposer&&draft.ready&&<p role="status" className="video-muted">{draft.saving?'Saving draft…':draft.dirty?canWrite?'Unsaved changes':'Your changes are not saved with read access.':composerEdited||draft.confirmed?'Draft saved':''}</p>}
            {images.length>0&&<p className="video-muted">Inline image attachments are not saved in your draft. Reattach them after reloading.</p>}
            {draftReferences.length>0&&<p className="video-muted">{draftReferences.length} saved material reference{draftReferences.length===1?'':'s'}. Current access and inspection are checked when submitting.</p>}
            {mutableComposer&&draft.ready&&restoredComposer.current&&!base&&!loading&&<p className="video-muted">The saved API key is unavailable for generation. Your draft is retained. Choose an active API key to continue.</p>}
            {loading ? <p role="status" className="video-muted">Loading video models…</p> : keys.length > 0 && !model && !error && !keysError ? <Empty className="min-h-40"><EmptyHeader><EmptyTitle>No video model available</EmptyTitle><EmptyDescription>This API key has no supported video route.</EmptyDescription></EmptyHeader><EmptyContent><Button asChild variant="outline"><Link to={canManageSuppliers ? '/admin/suppliers':'/models'}>{canManageSuppliers ? 'Manage Suppliers':'View models'}</Link></Button></EmptyContent></Empty> : null}
            <>
              {model&&<ImageReferences model={model} images={images} onChange={setImages} disabled={Boolean(busy) || uncertain || draftBlocked || draftReferences.length>0 || Boolean(intentId && !intentDocument?.job)} onReadingChange={reading=>{setReadingImages(reading);if(reading){estimateController.current?.abort();setQuote(null);}}}/>}

              <Label htmlFor="video-prompt" className="sr-only">Prompt</Label><Textarea id="video-prompt" placeholder="Describe your video…" rows={2} value={prompt} onChange={event=>{setComposerEdited(true);setPrompt(event.target.value);}} disabled={draftBlocked || busy === 'create' || restoringIntent || Boolean(intentId && !intentDocument?.job)} onKeyDown={event=>{if(event.key==='Enter' && !event.shiftKey && !event.nativeEvent.isComposing){event.preventDefault();if(!busy && !uncertain && !draftBlocked && form.body)void (quoteMatches ? saveOrSubmitRequest('submit') : estimate());}}}/>
              {prompt && form.error && <p role="alert" className="video-error">{form.error}</p>}
              {quoteMatches && quote && <div className="video-estimate"><span>{quote.effective_output.specification.resolution} · {quote.effective_output.specification.ratio} · {quote.effective_output.duration_seconds}s{quote.effective_output.frames_per_second != null && ` · ${quote.effective_output.frames_per_second} FPS`}</span><strong>{quote.estimate.amount_nanos != null && quote.estimate.currency ? `Estimated ${money(quote.estimate.amount_nanos,quote.estimate.currency)}`:'Charged to your Supplier account'}</strong>{quote.maximum_charge_nanos != null && quote.estimate.currency && <small>Reserves up to {money(quote.maximum_charge_nanos,quote.estimate.currency)}. Final charge follows reported usage.</small>}</div>}

              {uncertain && <p role="alert">{intentDocument&&intentDocument.content_state!=='retained' ? 'The saved input has expired or been deleted. Task history remains available.':'Reload this saved request to confirm its input and original submission status before continuing.'}</p>}
            </>
            <div className="video-composer-toolbar"><div className="video-composer-options">
              {!selected&&<Button type="button" variant="ghost" disabled={!base||!form.body||!canWrite||Boolean(busy)||uncertain||readingImages||draftBlocked||images.length>0||Boolean(intentDocument?.session_binding)} onClick={()=>void saveOrSubmitRequest('save')}>{intentDocument?.session_binding?'Request saved':intentId?'Save to session':'Save request'}</Button>}


              {models.length>0&&<DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" className="video-model-choice" aria-label="Video model" disabled={Boolean(busy) || draftBlocked || Boolean(intentId && !intentDocument?.job)}><span className="truncate">{model?.id||modelId||'Choose video model'}</span><ChevronDown size={14}/></Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuRadioGroup value={modelId} onValueChange={id=>{restoredComposer.current=null;setComposerEdited(true);setModelId(id);const query=new URLSearchParams(search);query.set('model',id);setSearch(query);const next=models.find(model=>model.id === id);setControls(next ? initialControls(next):{});}}>{models.map(item=><DropdownMenuRadioItem key={item.id} value={item.id}>{item.id}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>}

              {model&&<>
                <Popover><PopoverTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label="Additional settings"><Settings size={18}/></Button></PopoverTrigger><PopoverContent side="top" align="end" className="video-settings-popover"><h2>Video settings</h2><div className="video-controls">
                {Object.entries(model.controls).map(([name,rule])=><div key={name} className="video-field"><Label htmlFor={`video-${name}`}>{controlLabels[name] ?? name}</Label>
                  {rule.kind === 'choice' ? <DropdownMenu><DropdownMenuTrigger asChild><Button id={`video-${name}`} variant="outline" className="video-choice" disabled={draftBlocked || busy === 'create' || Boolean(intentId && !intentDocument?.job)}>{String(controls[name] ?? 'Choose…')}<ChevronDown size={14}/></Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuRadioGroup value={String(controls[name] ?? '')} onValueChange={value=>{setComposerEdited(true);setControls(current=>{const next={...current,[name]:value};if(name === 'resolution' && model.output && !model.output.specifications.some(spec=>spec.resolution === value && spec.ratio === current.ratio)){const spec=model.output.specifications.find(spec=>spec.resolution === value);if(spec)next.ratio=spec.ratio;}return next;});}}>{rule.values.filter(value=>name !== 'ratio' || !model.output || model.output.specifications.some(spec=>spec.resolution === controls.resolution && spec.ratio === value)).map(value=><DropdownMenuRadioItem key={value} value={value}>{value}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
                  : rule.kind === 'integer' ? <><Input id={`video-${name}`} type="number" min={rule.minimum} max={rule.maximum} step={1} value={String(controls[name] ?? '')} onChange={event=>{setComposerEdited(true);setControls(current=>({...current,[name]:event.target.value}));}} disabled={draftBlocked || busy === 'create' || Boolean(intentId && !intentDocument?.job)}/><small className="video-muted">{rule.minimum}–{rule.maximum}</small></>
                  : <Checkbox id={`video-${name}`} checked={controls[name] === true} onCheckedChange={checked=>{setComposerEdited(true);setControls(current=>({...current,[name]:checked === true}));}} disabled={draftBlocked || busy === 'create' || Boolean(intentId && !intentDocument?.job)}/>}</div>)}
              <Button type="button" variant="ghost" onClick={()=>{setComposerEdited(true);setControls(initialControls(model));}} disabled={draftBlocked || busy === 'create' || Boolean(intentId && !intentDocument?.job)}>Reset settings</Button>

                </div><Button type="button" variant="ghost" disabled={toolsState==='loading'||toolsState==='unsupported'} onClick={()=>toolsState==='error' ? setToolsRevision(value=>value+1) : setProviderToolsOpen(true)}>{toolsState==='loading'?'Checking Supplier tools…':toolsState==='error'?'Retry Supplier tools':'Supplier tools'}</Button>{toolsState==='unsupported'&&<p className="video-muted">This model has no native Supplier tools.</p>}{toolsState==='error'&&<p role="alert" className="video-error">{nativeTools.error}</p>}</PopoverContent></Popover>
              </>}
            </div>
            {model && <Button type="submit" size="icon" aria-label={quoteMatches ? 'Generate video':'Estimate'} title={quoteMatches ? 'Generate video':'Estimate generation cost'} disabled={!base || !form.body || Boolean(busy) || uncertain || readingImages || restoringIntent || draftBlocked || (quoteMatches && !canWrite)}><ArrowUp size={20}/></Button>}
            </div>
            {!loading && !keys.length && <Button asChild variant="outline"><Link to={`${workspacePath}/keys`}>Manage API keys</Link></Button>}
            {!canWrite && <small className="video-muted">Read access can estimate; generation needs write access.</small>}
          </div>
        </form>}
        <Dialog open={providerToolsOpen&&Boolean(toolsModule)} onOpenChange={setProviderToolsOpen}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>Supplier tools</DialogTitle><DialogDescription>Tools available for the selected video model.</DialogDescription></DialogHeader>{toolsModule&&<VolcengineView key={toolsIdentity} workspaceName={workspace ? workspaceDisplayName(workspace.name) : 'Current workspace'} model={modelId} nativeContext={{keyId,model:modelId}}/>}</DialogContent></Dialog>
        </>}
      </div>
    </section>
  </div>;
}
