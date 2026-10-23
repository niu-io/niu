import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { DashboardContext } from '@/app/dashboard-context';
import { workspacePathSegment } from '@/app/workspace-route';
import { useBranding } from '@/app/branding';
import { NiuAdminClient } from '../../../../../sdks/javascript/src/admin';
import type { VideoGenerationsSession } from '../../../../../sdks/javascript/src/generations-sessions';
import { GenerationSessionBindings } from './GenerationsLayout';
import '../video/video.css';

/** Saved instructions and associations only. Opening a session never dispatches. */
export default function VideoSessionView({context,id}:{context:DashboardContext;id:string}) {
  const {token,workspace}=context;
  const route=useLocation();
  const navigate=useNavigate();
  const {settings:branding}=useBranding();
  const client=useMemo(()=>new NiuAdminClient({adminToken:token,baseURL:new URL('/api/v1',location.origin).href}),[token]);
  const [session,setSession]=useState<VideoGenerationsSession|null>(null);
  const [error,setError]=useState('');
  const [revision,setRevision]=useState(0);
  const trigger=useRef<HTMLButtonElement>(null);
  useEffect(()=>{document.title=`Video session · Generations · ${branding.display_name}`;return()=>{document.title=`Generations · ${branding.display_name}`;};},[branding.display_name]);
  useEffect(()=>{
    const refresh=()=>setRevision(value=>value+1);
    window.addEventListener('niu:video-session-changed',refresh);
    return()=>window.removeEventListener('niu:video-session-changed',refresh);
  },[]);
  useEffect(()=>{
    const request=new AbortController();setSession(null);setError('');
    if(!workspace)return;
    if(!/^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|video-[1-9][0-9]{0,18})$/.test(id)){setError('This Video session link is invalid.');return;}
    void client.generations({organizationId:workspace.organization_id,projectId:workspace.id}).sessions.retrieve(id,{signal:request.signal})
      .then(value=>{if(!request.signal.aborted){
        if(value.data.id!==id&&value.data.reference!==id)throw new Error('Unexpected Video session');
        setSession(value.data);
        if(value.data.reference&&id!==value.data.reference){
          const query=new URLSearchParams(route.search);query.set('video-session',value.data.reference);
          navigate(`${route.pathname}?${query}${route.hash}`,{replace:true});
        }
      }})
      .catch(()=>{if(!request.signal.aborted)setError('This Video session could not be loaded. Check workspace access and reload.');});
    return()=>request.abort();
  },[client,workspace?.organization_id,workspace?.id,id,revision]);
  const workspaceSegment=workspace ? workspacePathSegment(workspace, context.workspaces ?? [workspace]) : '';
  const query=new URLSearchParams({workspace:workspaceSegment});
  return <div className="video-shell">
    <GenerationSessionBindings trigger={trigger} title={session?.title??'Video session'} actions={<Button variant="ghost" onClick={()=>setRevision(value=>value+1)}>Refresh session</Button>} history={{context,activeVideoSession:session?.id??id}}/>
    <section className="video-main" aria-label="Saved Video session"><div className="video-content"><div className="video-conversation">
      {error?<p role="alert" className="video-error">{error}</p>:!session?<p role="status">Loading Video session…</p>:<>
        {session.archived&&<p className="video-muted"><Badge variant="secondary">Archived</Badge> Restore this session from Archived sessions to return it to history.</p>}
        {!session.turns.length&&<p className="video-muted">No instructions have been saved in this session.</p>}
        {session.turns.map(turn=>{
          const next=new URLSearchParams(query);
          if(turn.intent)next.set('intent',turn.intent.reference??turn.intent.id);else if(turn.task_id)next.set('job',turn.task?.reference??turn.task_id);
          return <div key={turn.id} className="video-turn">
            {turn.instruction?<div className="video-user-message"><p>{turn.instruction.prompt}</p></div>:<p className="video-muted">The saved instruction has expired or was deleted.</p>}
            <article className="video-response">
              {turn.intent?.submission_state==='not_dispatched'?<Badge variant="secondary">Not dispatched</Badge>:turn.task?<Badge variant="secondary">{turn.task.status.replaceAll('_',' ')}</Badge>:null}
              {turn.intent||turn.task_id?<Button asChild variant="outline"><Link to={`/generations?${next}`}>{turn.intent?'Open saved request':'Open saved video'}</Link></Button>:<p className="video-muted">No request or task is linked to this instruction.</p>}
            </article>
          </div>;
        })}
      </>}
    </div></div></section>
  </div>;
}
