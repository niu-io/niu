import {useEffect,useRef,useState} from 'react';
import {FolderDown,RefreshCw,Check} from 'lucide-react';
import type {GenerationArtifactCapture} from '../../../../../sdks/javascript/src/generation-artifact-capture';
import {Button} from '@/components/ui/button';
import {Dialog,DialogTrigger,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter,DialogClose} from '@/components/ui/dialog';
import {readVideoResultResponse,videoResultError} from './result';
import {NiuAdminClient,type TenantScope,type GenerationTask} from '../../../../../sdks/javascript/src/admin';

export default function VideoResult({client,scope,task,keyId,canWrite}:{client:NiuAdminClient;scope:TenantScope;task:string;keyId?:string;canWrite:boolean}) {
  const authority=Boolean(canWrite&&keyId);
  type OutputKind='video'|'last_frame';
  const [saving,setSaving]=useState<{kind:OutputKind;checking:boolean}|null>(null);
  const [uncertain,setUncertain]=useState<Partial<Record<OutputKind,boolean>>>({});
  const [saveError,setSaveError]=useState('');
  const metadataContext=useRef<{client:NiuAdminClient;identity:string}|null>(null);
  const contextIdentity=JSON.stringify([scope.organizationId,scope.projectId,task]);
  const saveInFlight=useRef(false);
  const saveController=useRef<AbortController|null>(null);
  const saveRequests=useRef<Partial<Record<OutputKind,{id:string;name:string;mode:'cached'}>>>({});
  const [artifacts,setArtifacts]=useState<GenerationTask['artifacts']>([]);
  const [preview,setPreview]=useState<{url:string;type:string;kind:'video'|'last_frame'}|null>(null);
  const [availability,setAvailability]=useState<{video:string;last_frame:string}|null>(null);const [metadataRevision,setMetadataRevision]=useState(0);
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [deleted,setDeleted]=useState(false);const [confirm,setConfirm]=useState(false);
  const controller=useRef<AbortController|null>(null);const objectURL=useRef('');
  useEffect(()=>{saveInFlight.current=false;setSaving(null);setUncertain({});setSaveError('');saveRequests.current={};setPreview(null);setError('');setDeleted(false);setConfirm(false);setBusy(false);return()=>{saveController.current?.abort();controller.current?.abort();if(objectURL.current)URL.revokeObjectURL(objectURL.current);objectURL.current='';};},[client,scope.organizationId,scope.projectId,task]);
  useEffect(()=>{
    const request=new AbortController();metadataContext.current=null;setAvailability(null);setArtifacts([]);
    void client.generations(scope).tasks.retrieve(task,{signal:request.signal}).then(({data})=>{
      if(request.signal.aborted)return;
      metadataContext.current={client,identity:contextIdentity};
      setArtifacts(data.artifacts);
      setAvailability({video:data.artifacts.find(item=>item.kind==='video')?.availability??'missing',last_frame:data.artifacts.find(item=>item.kind==='last_frame')?.availability??'missing'});
    }).catch(()=>{if(!request.signal.aborted)setError('Saved result availability could not be loaded.');});
    return()=>request.abort();
  },[client,scope.organizationId,scope.projectId,task,metadataRevision]);
  useEffect(()=>()=>{controller.current?.abort();},[keyId]);
  function clear() {if(objectURL.current)URL.revokeObjectURL(objectURL.current);objectURL.current='';setPreview(null);}
  async function load(kind:'video'|'last_frame',fresh=false) {
    if(busy)return;
    const request=new AbortController();controller.current=request;setBusy(true);setError('');
    try {
      let response:Response;
      const capture=artifacts.find(item=>item.kind===kind)?.capture;
      if(!fresh&&capture?.availability==='retained'&&capture.asset_id){
        const asset=await client.getWorkspaceAsset(scope,capture.asset_id,{signal:request.signal});
        const bytes=await client.downloadWorkspaceAsset(scope,capture.asset_id,{signal:request.signal});
        response=new Response(bytes,{headers:{'content-type':asset.data.content_type}});
      }else if(fresh){
        if(!authority||!keyId)return;
        response=await client.refreshDashboardVideoResult(scope,keyId,task,kind,{signal:request.signal});
      }else response=await client.generations(scope).artifacts.content(task,kind,{signal:request.signal});
      const blob=await readVideoResultResponse(response,kind,request.signal);
      if(request.signal.aborted)return;
      clear();const url=URL.createObjectURL(blob);objectURL.current=url;setPreview({url,type:blob.type,kind});
    }catch(caught){if(!request.signal.aborted){const error=videoResultError(caught);setError(kind==='last_frame'&&error.status===404?'No saved last frame is available.':error.message);}}
    finally{if(controller.current === request)setBusy(false);}
  }
  async function remove() {
    if(busy)return;setBusy(true);setError('');const request=new AbortController();controller.current=request;
    try {if(!authority||!keyId)return;await client.deleteDashboardVideoResults(scope,keyId,task,{signal:request.signal});if(request.signal.aborted)return;clear();setDeleted(true);setConfirm(false);setMetadataRevision(value=>value+1);}
    catch{if(!request.signal.aborted)setError('Saved results could not be deleted.');}
    finally{if(controller.current === request)setBusy(false);}
  }
  function acceptCapture(kind:OutputKind,capture:GenerationArtifactCapture) {
    setArtifacts(previous=>previous.map(artifact=>artifact.kind===kind?{...artifact,capture}:artifact));
    setUncertain(previous=>({...previous,[kind]:false}));
    if(capture.status==='stored')setMetadataRevision(value=>value+1);
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
        const {data}=await client.generations(scope).artifacts.captureStatus(task,kind,{signal:request.signal});
        if(!request.signal.aborted)acceptCapture(kind,data);
      } else {
        const input=previous??{id:crypto.randomUUID(),name:kind==='video'?'Generated video':'Generated last frame',mode:'cached' as const};
        saveRequests.current[kind]=input;
        // Freeze before sending; reconcile lost responses by a read only.
        setUncertain(previous=>({...previous,[kind]:true}));
        const {data}=await client.generations(scope).artifacts.capture(task,kind,input,{signal:request.signal});
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
    const label=kind==='video'?'Save to workspace':'Save last frame';
    if(capture?.availability==='deleted')return <Button key={kind} variant="outline" disabled>Workspace copy deleted</Button>;
    if(capture?.status==='stored')return <Button key={kind} variant="outline" disabled><Check/>Saved to workspace</Button>;
    const checkOnly=Boolean(uncertain[kind]||capture?.status==='preparing'||(capture&&saveRequests.current[kind]?.id!==capture.id));
    return <Button key={kind} variant="outline" disabled={(!canWrite&&!checkOnly)||busy||Boolean(saving)} onClick={()=>void save(kind,checkOnly)} aria-label={`${checkOnly?'Check save status':label}${kind==='last_frame'?' for last frame':''}`}>
      {checkOnly?<RefreshCw/>:<FolderDown/>}{saving?.kind===kind?(saving.checking?'Checking…':'Saving…'):checkOnly?'Check save status':capture?.status==='failed'?'Retry save':label}
    </Button>;
  }
  const retained=(kind:'video'|'last_frame')=>artifacts.find(item=>item.kind===kind)?.capture?.availability==='retained';
  const canLoad=(kind:'video'|'last_frame')=>retained(kind)||availability?.[kind]==='available';
  const extension=preview?.type === 'video/webm' ? 'webm':preview?.type === 'image/png' ? 'png':preview?.type === 'image/jpeg' ? 'jpg':'mp4';
  return <div className="video-output">
    {preview && (preview.kind === 'video' ? <video className="video-preview" controls playsInline src={preview.url} aria-label="Generated video" onError={()=>setError('This browser could not play the video. You can download the file.')}/> : <img className="video-preview" src={preview.url} alt="Generated last frame" onError={()=>setError('This browser could not display the last frame.')}/>)}
    {error && <p role={error === 'No saved last frame is available.' ? 'status':'alert'} className={error === 'No saved last frame is available.' ? 'video-muted':'video-error'}>{error}</p>}
    {deleted&&<p className="video-muted">Saved result references deleted. Status, billing and retained workspace copies are preserved.</p>}<>
      {artifacts.map(artifact=>artifact.capture&&<p className="video-muted" key={artifact.kind}>{artifact.kind==='video'?'Video':'Last frame'} workspace copy: {artifact.capture.availability}</p>)}
      {!availability ? <p role="status" className="video-muted">{error ? 'Result availability is unavailable.':'Loading result availability…'}</p> : !canLoad('video')&&!canLoad('last_frame') ? <p className="video-muted">{error?null:availability.video === 'missing' ? 'No saved video is available.':'The saved download link is unavailable. You can request a current link from the original task.'}</p> : null}
      {saveError&&<p role="alert" className="video-error">{saveError}</p>}
      <div className="video-actions">{authority && <Button variant="outline" disabled={busy||Boolean(saving)} onClick={()=>void load('video',true)}>{busy?'Fetching…':'Fetch video again'}</Button>}{canLoad('video') && <Button variant="outline" disabled={busy||Boolean(saving)} onClick={()=>void load('video')}>{busy ? 'Loading…':retained('video') ? 'Load saved copy':preview?.kind === 'video' ? 'Reload preview':'Load preview'}</Button>}{canLoad('last_frame') && <Button variant="ghost" disabled={busy||Boolean(saving)} onClick={()=>void load('last_frame')}>Last frame</Button>}
        {saveAction('video')}{saveAction('last_frame')}
        {preview && <Button asChild variant="outline"><a href={preview.url} download={`${preview.kind === 'video' ? 'video':'last-frame'}.${extension}`}>Download</a></Button>}
      </div>
      {!availability && error && <Button variant="outline" disabled={busy||Boolean(saving)} onClick={()=>{setError('');setMetadataRevision(value=>value+1);}}>Reload results</Button>}
      {authority && <Dialog open={confirm} onOpenChange={open=>{setConfirm(open);setError('');}}><DialogTrigger asChild><Button variant="ghost" disabled={busy||Boolean(saving)}>Delete saved results</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Delete saved results?</DialogTitle><DialogDescription>Removes saved video and last-frame references permanently. Status and billing stay available. Copies already downloaded are unaffected.</DialogDescription></DialogHeader>{error && <p role="alert" className="video-error">{error}</p>}<DialogFooter><DialogClose asChild><Button variant="outline" disabled={busy||Boolean(saving)}>Cancel</Button></DialogClose><Button variant="destructive" onClick={()=>void remove()} disabled={busy||Boolean(saving)}>{busy ? 'Deleting…':'Delete results'}</Button></DialogFooter></DialogContent></Dialog>}
    </>
  </div>;
}
