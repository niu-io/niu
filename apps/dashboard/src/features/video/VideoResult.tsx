import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogTrigger,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter,DialogClose} from '@/components/ui/dialog';
import {readVideoResultResponse,videoResultError} from './result';
import {NiuAdminClient,type TenantScope,type GenerationTask} from '../../../../../sdks/javascript/src/admin';

export default function VideoResult({client,scope,task,keyId,canWrite}:{client:NiuAdminClient;scope:TenantScope;task:string;keyId?:string;canWrite:boolean}) {
  const authority=Boolean(canWrite&&keyId);
  const [artifacts,setArtifacts]=useState<GenerationTask['artifacts']>([]);
  const [preview,setPreview]=useState<{url:string;type:string;kind:'video'|'last_frame'}|null>(null);
  const [availability,setAvailability]=useState<{video:string;last_frame:string}|null>(null);const [metadataRevision,setMetadataRevision]=useState(0);
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [deleted,setDeleted]=useState(false);const [confirm,setConfirm]=useState(false);
  const controller=useRef<AbortController|null>(null);const objectURL=useRef('');
  useEffect(()=>{setPreview(null);setError('');setDeleted(false);setConfirm(false);setBusy(false);return()=>{controller.current?.abort();if(objectURL.current)URL.revokeObjectURL(objectURL.current);objectURL.current='';};},[client,scope.organizationId,scope.projectId,task]);
  useEffect(()=>{
    const request=new AbortController();setAvailability(null);setArtifacts([]);
    void client.generations(scope).tasks.retrieve(task,{signal:request.signal}).then(({data})=>{
      if(request.signal.aborted)return;
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
  const retained=(kind:'video'|'last_frame')=>artifacts.find(item=>item.kind===kind)?.capture?.availability==='retained';
  const canLoad=(kind:'video'|'last_frame')=>retained(kind)||availability?.[kind]==='available';
  const extension=preview?.type === 'video/webm' ? 'webm':preview?.type === 'image/png' ? 'png':preview?.type === 'image/jpeg' ? 'jpg':'mp4';
  return <div className="video-output">
    {preview && (preview.kind === 'video' ? <video className="video-preview" controls playsInline src={preview.url} aria-label="Generated video" onError={()=>setError('This browser could not play the video. You can download the file.')}/> : <img className="video-preview" src={preview.url} alt="Generated last frame" onError={()=>setError('This browser could not display the last frame.')}/>)}
    {error && <p role={error === 'No saved last frame is available.' ? 'status':'alert'} className={error === 'No saved last frame is available.' ? 'video-muted':'video-error'}>{error}</p>}
    {deleted&&<p className="video-muted">Saved result references deleted. Status, billing and retained workspace copies are preserved.</p>}<>
      {artifacts.map(artifact=>artifact.capture&&<p className="video-muted" key={artifact.kind}>{artifact.kind==='video'?'Video':'Last frame'} workspace copy: {artifact.capture.availability}</p>)}
      {!availability ? <p role="status" className="video-muted">{error ? 'Result availability is unavailable.':'Loading result availability…'}</p> : !canLoad('video')&&!canLoad('last_frame') ? <p className="video-muted">{error?null:availability.video === 'missing' ? 'No saved video is available.':'The saved download link is unavailable. You can request a current link from the original task.'}</p> : null}
      <div className="video-actions">{authority && <Button variant="outline" disabled={busy} onClick={()=>void load('video',true)}>{busy?'Fetching…':'Fetch video again'}</Button>}{canLoad('video') && <Button variant="outline" disabled={busy} onClick={()=>void load('video')}>{busy ? 'Loading…':retained('video') ? 'Load saved copy':preview?.kind === 'video' ? 'Reload preview':'Load preview'}</Button>}{canLoad('last_frame') && <Button variant="ghost" disabled={busy} onClick={()=>void load('last_frame')}>Last frame</Button>}
        {preview && <Button asChild variant="outline"><a href={preview.url} download={`${preview.kind === 'video' ? 'video':'last-frame'}.${extension}`}>Download</a></Button>}
      </div>
      {!availability && error && <Button variant="outline" disabled={busy} onClick={()=>{setError('');setMetadataRevision(value=>value+1);}}>Reload results</Button>}
      {authority && <Dialog open={confirm} onOpenChange={open=>{setConfirm(open);setError('');}}><DialogTrigger asChild><Button variant="ghost" disabled={busy}>Delete saved results</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Delete saved results?</DialogTitle><DialogDescription>Removes saved video and last-frame references permanently. Status and billing stay available. Copies already downloaded are unaffected.</DialogDescription></DialogHeader>{error && <p role="alert" className="video-error">{error}</p>}<DialogFooter><DialogClose asChild><Button variant="outline" disabled={busy}>Cancel</Button></DialogClose><Button variant="destructive" onClick={()=>void remove()} disabled={busy}>{busy ? 'Deleting…':'Delete results'}</Button></DialogFooter></DialogContent></Dialog>}
    </>
  </div>;
}
