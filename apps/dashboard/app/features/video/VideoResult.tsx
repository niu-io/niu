import { useLocale as useUILocale } from '@/shell/ui-locale';
import {Link} from 'react-router';
import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {FolderDown,RefreshCw,Check,MoreHorizontal,Download,Film,LoaderCircle,Trash2} from 'lucide-react';
import type {GenerationArtifactCapture} from '@niu-io/sdk/generation-artifact-capture';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter,DialogClose} from '@/components/ui/dialog';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem,DropdownMenuSeparator} from '@/components/ui/dropdown-menu';
import {evictMediaBlob,fetchMediaBlob,peekMediaBlob,primeMediaBlob} from '@/lib/media-cache';
import {downloadMedia} from '@/lib/media-download';
import {assetMediaCacheKey,taskMediaCacheKey} from '@/features/generations/video-cache';
import {readVideoResultResponse,videoResultError} from './result';
import {NiuAdminClient,type TenantScope,type GenerationTask} from '@niu-io/sdk/admin';

function availabilityFrom(list:GenerationTask['artifacts']) {
  return {
    video:list.find(item=>item.kind==='video')?.availability??'missing',
    last_frame:list.find(item=>item.kind==='last_frame')?.availability??'missing',
  };
}

export default function VideoResult({client,scope,task,keyId,canWrite,libraryHref,onOpenLibrary,initialArtifacts,cacheScope,onArtifactsDeleted}:{client:NiuAdminClient;scope:TenantScope;task:string;keyId?:string;canWrite:boolean;libraryHref?:string;onOpenLibrary?:()=>void;initialArtifacts?:GenerationTask['artifacts'];cacheScope?:string;onArtifactsDeleted?:()=>void}) {
  const { t: uiT } = useUILocale();
  const authority=Boolean(canWrite&&keyId);
  type OutputKind='video'|'last_frame';
  const tenantScope=useMemo(()=>({organizationId:scope.organizationId,projectId:scope.projectId}),[scope.organizationId,scope.projectId]);
  const contextIdentity=JSON.stringify([tenantScope.organizationId,tenantScope.projectId,task]);
  const mediaScope=cacheScope||client;
  const hasInitialArtifacts=initialArtifacts!==undefined;
  const [saving,setSaving]=useState<{kind:OutputKind;checking:boolean}|null>(null);
  const [uncertain,setUncertain]=useState<Partial<Record<OutputKind,boolean>>>({});
  const [saveError,setSaveError]=useState('');
  const metadataContext=useRef<{client:NiuAdminClient;identity:string}|null>(hasInitialArtifacts?{client,identity:contextIdentity}:null);
  const saveInFlight=useRef(false);
  const saveController=useRef<AbortController|null>(null);
  const saveRequests=useRef<Partial<Record<OutputKind,{id:string;name:string;mode:'cached'}>>>({});
  const [artifacts,setArtifacts]=useState<GenerationTask['artifacts']>(()=>initialArtifacts??[]);
  const [previewState,setPreviewState]=useState<{identity:string;url:string;type:string;kind:'video'|'last_frame'}|null>(null);
  const preview=previewState&&previewState.identity===contextIdentity?previewState:null;
  const [availability,setAvailability]=useState<{video:string;last_frame:string}|null>(()=>initialArtifacts!==undefined?availabilityFrom(initialArtifacts):null);
  const [metadataRev,setMetadataRev]=useState({identity:contextIdentity,value:0});
  const metadataRevision=metadataRev.identity===contextIdentity?metadataRev.value:0;
  const bumpMetadataRevision=()=>setMetadataRev({identity:contextIdentity,value:metadataRevision+1});
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [deleted,setDeleted]=useState(false);const [confirm,setConfirm]=useState(false);
  const attemptedPreview=useRef('');
  const controller=useRef<AbortController|null>(null);const refreshOnly=useRef(false);const objectURL=useRef('');
  useLayoutEffect(()=>{
    attemptedPreview.current='';refreshOnly.current=false;saveInFlight.current=false;setSaving(null);setUncertain({});setSaveError('');saveRequests.current={};setPreviewState(null);setError('');setDeleted(false);setConfirm(false);setBusy(false);setMetadataRev({identity:contextIdentity,value:0});
    return()=>{saveController.current?.abort();controller.current?.abort();attemptedPreview.current='';if(objectURL.current)URL.revokeObjectURL(objectURL.current);objectURL.current='';};
  },[client,contextIdentity]);
  useLayoutEffect(()=>{
    if(initialArtifacts===undefined||metadataRevision>0)return;
    const sameContext=metadataContext.current?.client===client&&metadataContext.current?.identity===contextIdentity;
    metadataContext.current={client,identity:contextIdentity};
    setArtifacts(previous=>!sameContext||previous.length===0?initialArtifacts:initialArtifacts.map(item=>{
      const local=previous.find(entry=>entry.kind===item.kind);
      if(!item.capture&&local?.capture&&saveRequests.current[item.kind]?.id===local.capture.id)return{...item,capture:local.capture};
      return item;
    }));
    setAvailability(availabilityFrom(initialArtifacts));
  },[client,contextIdentity,initialArtifacts,metadataRevision]);
  useEffect(()=>{
    if(!hasInitialArtifacts||metadataRevision>0){
      const request=new AbortController();metadataContext.current=null;setAvailability(null);setArtifacts([]);
      void client.generations(tenantScope).tasks.retrieve(task,{signal:request.signal}).then(({data})=>{
        if(request.signal.aborted)return;
        metadataContext.current={client,identity:contextIdentity};
        setArtifacts(data.artifacts);
        setAvailability(availabilityFrom(data.artifacts));
      }).catch(()=>{if(!request.signal.aborted)setError('Saved result availability could not be loaded.');});
      return()=>request.abort();
    }
  },[client,tenantScope,task,contextIdentity,metadataRevision,hasInitialArtifacts]);
  useEffect(()=>()=>{if(refreshOnly.current)controller.current?.abort();},[keyId]);
  const retained=(kind:'video'|'last_frame')=>artifacts.find(item=>item.kind===kind)?.capture?.availability==='retained';
  const canLoad=(kind:'video'|'last_frame')=>retained(kind)||availability?.[kind]==='available';
  const videoCanLoad=canLoad('video');
  const lastFrameCanLoad=canLoad('last_frame');
  function mediaKeyFor(kind:OutputKind,fresh=false) {
    const capture=artifacts.find(item=>item.kind===kind)?.capture;
    if(!fresh&&capture?.availability==='retained'&&capture.asset_id)return assetMediaCacheKey(tenantScope,capture.asset_id);
    return taskMediaCacheKey(tenantScope,task,kind);
  }
  const videoMediaKey=mediaKeyFor('video');
  useEffect(()=>{
    if(metadataContext.current?.identity!==contextIdentity||!availability)return;
    if(availability.video==='deleted'||availability.video==='expired'){
      if(!videoCanLoad)evictMediaBlob(mediaScope,`task:${tenantScope.organizationId}:${tenantScope.projectId}:${task}:`,{prefix:true});
      else evictMediaBlob(mediaScope,taskMediaCacheKey(tenantScope,task,'video'));
    }
    if(!lastFrameCanLoad&&(availability.last_frame==='deleted'||availability.last_frame==='expired')){
      evictMediaBlob(mediaScope,taskMediaCacheKey(tenantScope,task,'last_frame'));
    }
  },[availability,contextIdentity,mediaScope,tenantScope,task,videoCanLoad,lastFrameCanLoad]);
  function clear() {if(objectURL.current)URL.revokeObjectURL(objectURL.current);objectURL.current='';setPreviewState(null);}
  async function load(kind:'video'|'last_frame',fresh=false,forceReload=false) {
    if(busy)return;
    const request=new AbortController();controller.current=request;refreshOnly.current=fresh;setBusy(true);setError('');
    try {
      let blob:Blob;
      if(fresh){
        if(!authority||!keyId)return;
        blob=await downloadMedia(request.signal,async()=>{
          const response=await client.refreshDashboardVideoResult(tenantScope,keyId,task,kind,{signal:request.signal});
          return readVideoResultResponse(response,kind,request.signal);
        });
        if(!request.signal.aborted&&availability?.[kind]==='available')primeMediaBlob(mediaScope,taskMediaCacheKey(tenantScope,task,kind),blob);
      }else{
        blob=await fetchMediaBlob(
          mediaScope,
          mediaKeyFor(kind),
          async signal=>{
            let response:Response;
            const capture=artifacts.find(item=>item.kind===kind)?.capture;
            if(capture?.availability==='retained'&&capture.asset_id){
              const asset=await client.getWorkspaceAsset(tenantScope,capture.asset_id,{signal});
              const bytes=await client.downloadWorkspaceAsset(tenantScope,capture.asset_id,{signal});
              response=new Response(bytes,{headers:{'content-type':asset.data.content_type}});
            }else response=await client.generations(tenantScope).artifacts.content(task,kind,{signal});
            return readVideoResultResponse(response,kind,signal);
          },
          {force:forceReload,signal:request.signal},
        );
      }
      if(request.signal.aborted)return;
      clear();const url=URL.createObjectURL(blob);objectURL.current=url;setPreviewState({identity:contextIdentity,url,type:blob.type,kind});
    }catch(caught){if(!request.signal.aborted){const err=videoResultError(caught);setError(kind==='last_frame'&&err.status===404?'No saved last frame is available.':err.message);}}
    finally{if(controller.current === request)setBusy(false);}
  }
  const loadVideoRef=useRef(()=>void load('video'));
  loadVideoRef.current=()=>void load('video');
  async function remove() {
    if(busy)return;setBusy(true);setError('');const request=new AbortController();controller.current=request;
    try {
      if(!authority||!keyId)return;
      await client.deleteDashboardVideoResults(tenantScope,keyId,task,{signal:request.signal});
      if(request.signal.aborted)return;
      evictMediaBlob(mediaScope,`task:${tenantScope.organizationId}:${tenantScope.projectId}:${task}:`,{prefix:true});
      clear();setDeleted(true);setConfirm(false);bumpMetadataRevision();onArtifactsDeleted?.();
    }
    catch{if(!request.signal.aborted)setError('Saved results could not be deleted.');}
    finally{if(controller.current === request)setBusy(false);}
  }
  function acceptCapture(kind:OutputKind,capture:GenerationArtifactCapture) {
    setArtifacts(previous=>previous.map(artifact=>artifact.kind===kind?{...artifact,capture}:artifact));
    setUncertain(previous=>({...previous,[kind]:false}));
    if(capture.status==='stored')bumpMetadataRevision();
    if(capture.status==='failed') {
      const messages:Record<string,string>={
        capacity_exceeded:'The output exceeds the workspace material size or storage limit.',
        authorization_changed:'Workspace access changed before the output was saved.',
        invalid_media:'The output could not be validated as a supported media file.',
        delivery_failed:'The cached output could not be delivered. No generation was submitted.',
        storage_unavailable:'Workspace material storage is unavailable.',
        encryption_unavailable:'Encrypted workspace material storage is unavailable.',
      };
      setSaveError(messages[capture.failure_code??'']??'The output was not saved.');
    }
  }
  async function save(kind:OutputKind,checkOnly=false) {
    if((!checkOnly&&!canWrite)||saveInFlight.current||busy||metadataContext.current?.client!==client||metadataContext.current.identity!==contextIdentity)return;
    const current=artifacts.find(artifact=>artifact.kind===kind)?.capture;
    const previous=saveRequests.current[kind];
    if(!checkOnly&&(uncertain[kind]||current?.status==='preparing'||current?.availability==='deleted'||current?.status==='stored'))return;
    // Historical capture reads omit immutable name/mode. Do not invent a retry.
    if(!checkOnly&&current&&(!previous||previous.id!==current.id))return;
    const request=new AbortController();saveController.current=request;saveInFlight.current=true;setSaving({kind,checking:checkOnly});setSaveError('');
    try {
      if(checkOnly) {
        const {data}=await client.generations(tenantScope).artifacts.captureStatus(task,kind,{signal:request.signal});
        if(!request.signal.aborted)acceptCapture(kind,data);
      } else {
        const input=previous??{id:crypto.randomUUID(),name:kind==='video'?'Generated video':'Generated last frame',mode:'cached' as const};
        saveRequests.current[kind]=input;
        // Freeze before sending; reconcile lost responses by a read only.
        setUncertain(previous=>({...previous,[kind]:true}));
        const {data}=await client.generations(tenantScope).artifacts.capture(task,kind,input,{signal:request.signal});
        if(!request.signal.aborted)acceptCapture(kind,data);
      }
    }catch {
      if(!request.signal.aborted)setSaveError(checkOnly?'Saved copy status could not be confirmed. Check again before saving.':'Saving could not be confirmed. Check save status before continuing.');
    }finally {
      if(saveController.current===request){saveInFlight.current=false;if(!request.signal.aborted)setSaving(null);}
    }
  }
  function saveAction(kind:OutputKind) {
    const artifact=artifacts.find(item=>item.kind===kind);
    if(metadataContext.current?.client!==client||metadataContext.current.identity!==contextIdentity||!artifact||(!canLoad(kind)&&!artifact.capture&&!uncertain[kind]))return null;
    const capture=artifact.capture;
    const label=kind==='video'?uiT("Save to workspace"):uiT("Save last frame");
    if(capture?.availability==='deleted')return <DropdownMenuItem key={kind} disabled>{uiT("Workspace copy deleted")}</DropdownMenuItem>;
    if(capture?.status==='stored')return libraryHref?<DropdownMenuItem key={kind} asChild><Link to={libraryHref} onClick={event=>{if(onOpenLibrary){event.preventDefault();onOpenLibrary();}}}><Check/>{uiT("View in workspace library")}</Link></DropdownMenuItem>:<DropdownMenuItem key={kind} disabled><Check/>{uiT("Saved to workspace")}</DropdownMenuItem>;
    const checkOnly=Boolean(uncertain[kind]||capture?.status==='preparing'||(capture&&saveRequests.current[kind]?.id!==capture.id));
    return <DropdownMenuItem key={kind} disabled={(!canWrite&&!checkOnly)||busy||Boolean(saving)} onSelect={()=>void save(kind,checkOnly)} aria-label={`${checkOnly?uiT("Check save status"):label}${kind==='last_frame'?uiT("for last frame"):''}`}>
      {checkOnly?<RefreshCw/>:<FolderDown/>}{saving?.kind===kind?(saving.checking?uiT("Checking…"):uiT("Saving…")):checkOnly?uiT("Check save status"):capture?.status==='failed'?uiT("Retry save"):label}
    </DropdownMenuItem>;
  }
  const extension=preview?.type === 'video/webm' ? 'webm':preview?.type === 'image/png' ? 'png':preview?.type === 'image/jpeg' ? 'jpg':'mp4';
  useLayoutEffect(()=>{
    if((preview&&objectURL.current)||busy||metadataContext.current?.identity!==contextIdentity||!availability||!videoCanLoad||attemptedPreview.current===contextIdentity)return;
    const cached=peekMediaBlob(mediaScope,videoMediaKey);
    if(!cached)return;
    attemptedPreview.current=contextIdentity;
    if(objectURL.current)URL.revokeObjectURL(objectURL.current);
    const url=URL.createObjectURL(cached);
    objectURL.current=url;
    setPreviewState({identity:contextIdentity,url,type:cached.type,kind:'video'});
  },[preview,busy,availability,videoCanLoad,contextIdentity,mediaScope,videoMediaKey]);
  useEffect(()=>{
    if(busy||metadataContext.current?.identity!==contextIdentity||!availability||!videoCanLoad||attemptedPreview.current===contextIdentity)return;
    attemptedPreview.current=contextIdentity;
    loadVideoRef.current();
  },[busy,availability,videoCanLoad,contextIdentity]);
  return <div className="video-output">
    {preview ? (preview.kind === 'video' ? <video className="video-preview" controls playsInline preload="metadata" src={preview.url} aria-label={uiT("Generated video")} onError={()=>setError('This browser could not play the video. You can download the file.')}/> : <img className="video-preview" src={preview.url} alt={uiT("Generated last frame")}/>) : <div className="video-artifact-placeholder">
      {busy||!availability&&!error ? <><LoaderCircle className="animate-spin"/><p role="status">{uiT("Loading video…")}</p></> : <><Film/><h3>{deleted||availability?.video==='deleted'?uiT("Video removed"):availability?.video==='expired'?uiT("Video preview expired"):uiT("Video preview unavailable")}</h3><p>{uiT("The generation completed, but its video is not currently available to view.")}</p>
      {authority&&availability&&<Button variant="secondary" disabled={busy} onClick={()=>void load('video',true)}><RefreshCw/>{uiT("Restore video")}</Button>}
      {!authority&&availability&&<p>{uiT("A retained workspace copy or access to the original task is needed to restore this video.")}</p>}{libraryHref && <Button asChild variant="outline"><Link to={libraryHref} onClick={event=>{if(onOpenLibrary){event.preventDefault();onOpenLibrary();}}}>{uiT("View Assets")}</Link></Button>}
      {!availability&&error&&<Button variant="secondary" onClick={()=>{setError('');bumpMetadataRevision();}}>{uiT("Try again")}</Button>}</>}
    </div>}
    {error&&<p role="alert" className="video-error">{uiT(error)}</p>}
    {saveError&&<p role="alert" className="video-error">{uiT(saveError)}</p>}
    <div className="video-artifact-toolbar">
      {preview&&<Button asChild variant="ghost" size="sm"><a href={preview.url} download={`${preview.kind==='video'?'video':'last-frame'}.${extension}`}><Download/>{uiT("Download")}</a></Button>}
      {lastFrameCanLoad&&<Button variant="ghost" size="sm" disabled={busy} onClick={()=>void load(preview?.kind==='last_frame'?'video':'last_frame')}>{preview?.kind==='last_frame'?'Video':uiT("Last frame")}</Button>}
      {(authority||videoCanLoad||artifacts.some(artifact=>artifact.capture))&&<DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={uiT("Video actions")} disabled={busy||Boolean(saving)}><MoreHorizontal/></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
        {videoCanLoad&&<DropdownMenuItem onSelect={()=>void load('video',false,true)}><RefreshCw/>{uiT("Reload preview")}</DropdownMenuItem>}
        {authority&&<DropdownMenuItem onSelect={()=>void load('video',true)}><RefreshCw/>{uiT("Restore from original task")}</DropdownMenuItem>}
        {saveAction('video')}{saveAction('last_frame')}
        {authority&&<><DropdownMenuSeparator/><DropdownMenuItem variant="destructive" onSelect={()=>setConfirm(true)}><Trash2/>{uiT("Delete saved results")}</DropdownMenuItem></>}
      </DropdownMenuContent></DropdownMenu>}
    </div>
    {authority&&<Dialog open={confirm} onOpenChange={setConfirm}><DialogContent><DialogHeader><DialogTitle>{uiT("Delete saved results?")}</DialogTitle><DialogDescription>{uiT("Removes saved video and last-frame references permanently. Status, billing and retained workspace copies are preserved.")}</DialogDescription></DialogHeader><DialogFooter><DialogClose asChild><Button variant="outline" disabled={busy}>{uiT("Cancel")}</Button></DialogClose><Button variant="destructive" onClick={()=>void remove()} disabled={busy}>{busy?uiT("Deleting…"):uiT("Delete results")}</Button></DialogFooter></DialogContent></Dialog>}
  </div>;
}
