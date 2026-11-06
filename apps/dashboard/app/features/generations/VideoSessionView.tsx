import { Empty, EmptyHeader, EmptyDescription } from '@/components/ui/empty';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ListRowsSkeleton } from '@/components/PageSkeletons';
import type { DashboardContext } from '@/shell/dashboard-context';
import { resolveWorkspacePathSegment, workspacePathSegment } from '@/shell/workspace-route';
import { NiuAdminClient } from '@niu-io/sdk/admin';
import type { VideoGenerationsSession } from '@niu-io/sdk/generations-sessions';
import { GenerationSessionBindings } from './GenerationsLayout';
import VideoTurnResult from './VideoTurnResult';
import { readableTurnAnchor } from './session-turn';
import { useGenerationKeys } from './useGenerationKeys';
import '../video/video.css';

/** Saved instructions and their results only. Opening a session never dispatches. */
export default function VideoSessionView({context,id}:{context:DashboardContext;id:string}) {
  const { t: uiT } = useUILocale();
  const {token,workspace}=context;
  const route=useLocation();
  const navigate=useNavigate();
  const client=useMemo(()=>new NiuAdminClient({adminToken:token,baseURL:new URL('/api/v1',location.origin).href}),[token]);
  // Recovery reads use an active key from this session's workspace, never a URL
  // identifier. The server still rechecks ownership, model access and the
  // original task before it returns a result.
  // Keys are a recovery hint only; the server rechecks access. A partial
  // key-list failure must not block an already loaded Video session.
  const {keys}=useGenerationKeys(workspace ? {...context, workspaces:[workspace]} : context, Boolean(token&&workspace&&context.session?.permissions.write));
  const [session,setSession]=useState<VideoGenerationsSession|null>(null);
  const [error,setError]=useState('');
  const [revision,setRevision]=useState(0);
  const [activeAnchor,setActiveAnchor]=useState('');
  const trigger=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    const refresh=()=>setRevision(value=>value+1);
    window.addEventListener('niu:video-session-changed',refresh);
    return()=>window.removeEventListener('niu:video-session-changed',refresh);
  },[]);
  useEffect(()=>{
    const request=new AbortController();setSession(null);setError('');setActiveAnchor('');
    if(!workspace){setError('Select a workspace to open this Video session.');return;}
    if(!/^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|video-[1-9][0-9]{0,18})$/.test(id)){setError('This Video session link is invalid.');return;}
    const requested=new URLSearchParams(route.search).get('workspace');
    if(requested){
      const target=resolveWorkspacePathSegment(requested,context.workspaces??[workspace]);
      if(target&&target.id!==workspace.id)return;
    }
    void client.generations({organizationId:workspace.organization_id,projectId:workspace.id}).sessions.retrieve(id,{signal:request.signal})
      .then(value=>{if(!request.signal.aborted){
        if(value.data.id!==id&&value.data.reference!==id)throw new Error('Unexpected Video session');
        setSession(value.data);
        if(value.data.reference){
          // Readable session identity is canonical. Drop per-turn identifiers,
          // key hints and session already supplied by this route.
          const query=new URLSearchParams(route.search);
          query.delete('video-session');query.delete('intent');query.delete('job');query.delete('key');
          query.delete('session');query.delete('turn');query.delete('compose');
          const wsSegment=workspace ? workspacePathSegment(workspace, context.workspaces ?? [workspace]) : '';
          if(wsSegment && (query.get('workspace')===wsSegment || query.get('workspace')===workspace.id)){
            query.delete('workspace');
          }
          const nextSearch=query.size?`?${query}`:'';
          const nextUrl=`/generations/${encodeURIComponent(value.data.reference)}${nextSearch}${route.hash}`;
          if(`${route.pathname}${route.search}${route.hash}`!==nextUrl){
            navigate(nextUrl,{replace:true});
          }
        }
      }})
      .catch(()=>{if(!request.signal.aborted)setError('This Video session could not be loaded. Check workspace access and reload.');});
    return()=>request.abort();
  },[client,workspace?.organization_id,workspace?.id,id,revision]);
  useEffect(()=>{
    if(!session||!route.hash)return;
    const raw=route.hash.slice(1);
    let anchor=raw;
    try{anchor=decodeURIComponent(raw);}catch{/* keep the literal fragment */}
    const target=document.getElementById(anchor);
    if(!target)return;
    setActiveAnchor(anchor);
    if(typeof target.scrollIntoView==='function')target.scrollIntoView({block:'start'});
    target.focus({preventScroll:true});
  },[session,route.hash]);
  function keyFor(model?:string){
    if(!workspace)return undefined;
    return keys.find(key=>key.workspace.id===workspace.id && (!key.allowed_models?.length || key.allowed_models.includes('*') || Boolean(model&&key.allowed_models.includes(model))))?.id;
  }
  return <div className="video-shell">
    <GenerationSessionBindings trigger={trigger} title={session?.title??uiT("Video session")} actions={<Button variant="ghost" onClick={()=>setRevision(value=>value+1)}>{uiT("Refresh session")}</Button>} history={{context,activeVideoSession:session?.reference??session?.id??id}}/>
    <section className="video-main" aria-label={uiT("Saved Video session")}><div className="video-content"><div className="video-conversation">
      {error?<p role="alert" className="video-error">{uiT(error)}</p>:!session?<ListRowsSkeleton rows={3} label={uiT("Loading Video session…")}/>:<>
        {session.archived&&<p className="video-muted"><Badge variant="secondary">{uiT("Archived")}</Badge>{" "}{uiT("Restore this session from Archived sessions to return it to history.")}</p>}
        {!session.turns.length&&<Empty><EmptyHeader><EmptyDescription>{uiT("No instructions have been saved in this session.")}</EmptyDescription></EmptyHeader></Empty>}
        {session.turns.map(turn=>{
          const anchor=readableTurnAnchor(turn);
          return <div key={turn.id} id={anchor} tabIndex={-1} className={`video-turn video-session-turn${activeAnchor===anchor?' video-turn-target':''}`}>
            {turn.instruction?<div className="video-user-message"><p>{turn.instruction.prompt}</p></div>:<p className="video-muted">{uiT("The saved instruction has expired or was deleted.")}</p>}
            <VideoTurnResult context={context} sessionId={session.id} turn={turn} keyId={keyFor(turn.task?.model??turn.intent?.model)} refreshKey={revision}/>
          </div>;
        })}
      </>}
    </div></div></section>
  </div>;
}
