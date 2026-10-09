import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogTrigger,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter,DialogClose} from '@/components/ui/dialog';
import {fetchVideoResult,ResultReadError} from './result';

export default function VideoResult({token,path,canWrite}:{token:string;path:string;canWrite:boolean}) {
  const [preview,setPreview]=useState<{url:string;type:string;kind:'video'|'last_frame'}|null>(null);
  const [availability,setAvailability]=useState<{video:string;last_frame:string}|null>(null);const [metadataRevision,setMetadataRevision]=useState(0);
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [deleted,setDeleted]=useState(false);const [confirm,setConfirm]=useState(false);
  const controller=useRef<AbortController|null>(null);const objectURL=useRef('');
  useEffect(()=>{setPreview(null);setError('');setDeleted(false);setConfirm(false);setBusy(false);return()=>{controller.current?.abort();if(objectURL.current)URL.revokeObjectURL(objectURL.current);objectURL.current='';};},[token,path]);
  useEffect(()=>{
    const request=new AbortController();setAvailability(null);
    void fetch(path,{headers:{authorization:`Bearer ${token}`},signal:request.signal,redirect:'error'}).then(async response=>{
      if(!response.ok)throw new Error('Saved result availability could not be loaded.');
      const data=await response.json();if(!['available','missing','unavailable'].includes(data.video) || !['available','missing','unavailable'].includes(data.last_frame))throw new Error('Saved result availability could not be loaded.');
      if(!request.signal.aborted)setAvailability(data);
    }).catch(()=>{if(!request.signal.aborted)setError('Saved result availability could not be loaded.');});
    return()=>request.abort();
  },[token,path,metadataRevision]);
  function clear() {if(objectURL.current)URL.revokeObjectURL(objectURL.current);objectURL.current='';setPreview(null);}
  async function load(kind:'video'|'last_frame') {
    if(busy || deleted)return;
    const request=new AbortController();controller.current=request;setBusy(true);setError('');
    try {const blob=await fetchVideoResult(token,path,kind,request.signal);if(request.signal.aborted)return;clear();const url=URL.createObjectURL(blob);objectURL.current=url;setPreview({url,type:blob.type,kind});}
    catch(error){if(!request.signal.aborted){if(error instanceof ResultReadError && error.status === 404){setAvailability(current=>current ? {...current,[kind]:'unavailable'}:current);}setError(kind === 'last_frame' && error instanceof ResultReadError && error.status === 404 ? 'No saved last frame is available.':error instanceof ResultReadError ? error.message:'The result could not be loaded.');}}
    finally{if(controller.current === request)setBusy(false);}
  }
  async function remove() {
    if(busy)return;setBusy(true);setError('');const request=new AbortController();controller.current=request;
    try {const response=await fetch(path,{method:'DELETE',headers:{authorization:`Bearer ${token}`},signal:request.signal,redirect:'error'});if(request.signal.aborted)return;if(!response.ok)throw new Error('Saved results could not be deleted.');clear();setDeleted(true);setConfirm(false);}
    catch{if(!request.signal.aborted)setError('Saved results could not be deleted.');}
    finally{if(controller.current === request)setBusy(false);}
  }
  const extension=preview?.type === 'video/webm' ? 'webm':preview?.type === 'image/png' ? 'png':preview?.type === 'image/jpeg' ? 'jpg':'mp4';
  return <div className="video-output">
    {preview && (preview.kind === 'video' ? <video className="video-preview" controls playsInline src={preview.url} aria-label="Generated video" onError={()=>setError('This browser could not play the video. You can download the file.')}/> : <img className="video-preview" src={preview.url} alt="Generated last frame" onError={()=>setError('This browser could not display the last frame.')}/>)}
    {error && <p role={error === 'No saved last frame is available.' ? 'status':'alert'} className={error === 'No saved last frame is available.' ? 'video-muted':'video-error'}>{error}</p>}
    {deleted ? <p className="video-muted">Saved results deleted. Status and billing are preserved.</p> : <>
      {!availability ? <p role="status" className="video-muted">{error ? 'Result availability is unavailable.':'Loading result availability…'}</p> : availability.video !== 'available' && availability.last_frame !== 'available' ? <p className="video-muted">{availability.video === 'missing' ? 'No saved video is available.':'Saved results are no longer available.'}</p> : null}
      <div className="video-actions">{availability?.video === 'available' && <Button variant="outline" disabled={busy} onClick={()=>void load('video')}>{busy ? 'Loading…':preview?.kind === 'video' ? 'Reload preview':'Load preview'}</Button>}{availability?.last_frame === 'available' && <Button variant="ghost" disabled={busy} onClick={()=>void load('last_frame')}>Last frame</Button>}
        {preview && <Button asChild variant="outline"><a href={preview.url} download={`${preview.kind === 'video' ? 'video':'last-frame'}.${extension}`}>Download</a></Button>}
      </div>
      {!availability && error && <Button variant="outline" disabled={busy} onClick={()=>{setError('');setMetadataRevision(value=>value+1);}}>Reload results</Button>}
      <small className="video-muted">Saved for 24 hours after capture. Supplier links may expire sooner.</small>
      {canWrite && <Dialog open={confirm} onOpenChange={open=>{setConfirm(open);setError('');}}><DialogTrigger asChild><Button variant="ghost" disabled={busy}>Delete saved results</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Delete saved results?</DialogTitle><DialogDescription>Removes saved video and last-frame references permanently. Status and billing stay available. Copies already downloaded are unaffected.</DialogDescription></DialogHeader>{error && <p role="alert" className="video-error">{error}</p>}<DialogFooter><DialogClose asChild><Button variant="outline" disabled={busy}>Cancel</Button></DialogClose><Button variant="destructive" onClick={()=>void remove()} disabled={busy}>{busy ? 'Deleting…':'Delete results'}</Button></DialogFooter></DialogContent></Dialog>}
    </>}
  </div>;
}
