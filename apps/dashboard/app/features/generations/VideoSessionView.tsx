import { authenticatedFetch as fetch } from '@/lib/authenticated-fetch';
import { Empty, EmptyHeader, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { IconVideo, IconRefresh } from '@tabler/icons-react';
import { fetchQuery, isQueryFresh, peekQuery } from '@/lib/query-cache';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ListRowsSkeleton } from '@/components/PageSkeletons';
import type { DashboardContext } from '@/shell/dashboard-context';
import { resolveWorkspacePathSegment, workspacePathSegment } from '@/shell/workspace-route';
import { NiuAPIError } from '@niu-io/sdk';
import { NiuAdminClient } from '@niu-io/sdk/admin';
import type { VideoGenerationsSession } from '@niu-io/sdk/generations-sessions';
import { catalogTitle } from '@/lib/providers';
import { translateUI } from '@/shell/ui-locale';
import { GenerationSessionBindings } from './GenerationsLayout';
import GenerationKeyPicker from './GenerationKeyPicker';
import type { GenerationContextRunState, GenerationsContextPanelData } from './GenerationsContextPanel';
import VideoTurnResult from './VideoTurnResult';
import VideoSessionComposer from './VideoSessionComposer';
import { readableTurnAnchor } from './session-turn';
import { useGenerationKeys } from './useGenerationKeys';
import { VIDEO_FRESH_MS, invalidateVideoSession, primeVideoSession, videoSessionCacheKey } from './video-cache';
import { videoStatusLabel } from '../video/status';
import '../video/video.css';

function hasActiveTurn(session: VideoGenerationsSession): boolean {
  return session.turns.some(turn => Boolean(turn.task && ['queued', 'running', 'unknown', 'submission_unknown'].includes(turn.task.status)));
}

/** Saved instructions and their results only. Opening a session never dispatches. */
export default function VideoSessionView({context,id,run}:{context:DashboardContext;id:string;run?:string}) {
  const { t: uiT } = useUILocale();
  const {token,workspace}=context;
  const route=useLocation();
  const navigate=useNavigate();
  const client=useMemo(()=>new NiuAdminClient({ fetch,adminToken:token,baseURL:new URL('/api/v1',location.origin).href}),[token]);
  // Recovery reads use an active key from this session's workspace, never a URL
  // identifier. The server still rechecks ownership, model access and the
  // original task before it returns a result.
  // Keys are a recovery hint only; the server rechecks access. A partial
  // key-list failure must not block an already loaded Video session.
  const availableKeys=useGenerationKeys(workspace ? {...context, workspaces:[workspace]} : context, Boolean(token&&workspace&&context.session?.permissions.write));
  const {keys}=availableKeys;
  const composerScope=JSON.stringify([token,workspace?.id,id]);
  const [composerSelection,setComposerSelection]=useState({scope:composerScope,key:''});
  const composerKey=composerSelection.scope===composerScope?composerSelection.key:'';
  const setComposerKey=(key:string)=>setComposerSelection({scope:composerScope,key});
  const [keyEditRevision,setKeyEditRevision]=useState(0);
  const [keySelectionReady,setKeySelectionReady]=useState(false);
  const activeComposerKey=composerKey || keys[0]?.id || '';
  const sessionCacheKey=workspace?videoSessionCacheKey(workspace.id,id):'';
  const viewKey=`${workspace?.id??''}:${id}`;
  const [session,setSession]=useState<VideoGenerationsSession|null>(()=>token&&sessionCacheKey?peekQuery<VideoGenerationsSession>(token,sessionCacheKey,{persist:true})??null:null);
  const [error,setError]=useState('');
  const [revisionState,setRevisionState]=useState({viewKey,count:0});
  const revision=revisionState.viewKey===viewKey?revisionState.count:0;
  const bumpRevision=useCallback(()=>setRevisionState(current=>({viewKey,count:(current.viewKey===viewKey?current.count:0)+1})),[viewKey]);
  const lastHandledRef=useRef({viewKey,revision:0});
  const activeAnchorInit = '';
  const [activeAnchor,setActiveAnchor]=useState(activeAnchorInit);
  const trigger=useRef<HTMLButtonElement>(null);
  const routeRef=useRef(route);routeRef.current=route;
  const workspacesRef=useRef(context.workspaces);workspacesRef.current=context.workspaces;
  const workspaceRef=useRef(workspace);workspaceRef.current=workspace;
  const orgId=workspace?.organization_id??'';
  const wsId=workspace?.id??'';
  useEffect(()=>{
    window.addEventListener('niu:video-session-changed',bumpRevision);
    return()=>window.removeEventListener('niu:video-session-changed',bumpRevision);
  },[bumpRevision]);
  useEffect(()=>{
    const cached=token&&sessionCacheKey?peekQuery<VideoGenerationsSession>(token,sessionCacheKey,{persist:true}):undefined;
    const forceRefresh=lastHandledRef.current.viewKey===viewKey&&lastHandledRef.current.revision!==revision;
    lastHandledRef.current={viewKey,revision};
    const request=new AbortController();setSession(cached??null);setError('');setActiveAnchor('');
    const currentWorkspace=workspaceRef.current;
    if(!currentWorkspace||!orgId||!wsId){setError('Select a workspace to open this Video session.');return;}
    if(!/^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|video-[1-9][0-9]{0,18})$/.test(id)){setError('This Video session link is invalid.');return;}
    const requested=new URLSearchParams(routeRef.current.search).get('workspace');
    if(requested){
      const target=resolveWorkspacePathSegment(requested,workspacesRef.current??[currentWorkspace]);
      if(target&&target.id!==wsId)return;
    }
    const canonicalize=(value:VideoGenerationsSession)=>{
      if(!value.reference)return;
      // Readable session identity is canonical. Drop per-turn identifiers,
      // key hints and session already supplied by this route.
      const currentRoute=routeRef.current;
      const query=new URLSearchParams(currentRoute.search);
      query.delete('video-session');query.delete('intent');query.delete('job');query.delete('key');
      query.delete('session');query.delete('turn');query.delete('compose');
      const wsSegment=workspacePathSegment(currentWorkspace, workspacesRef.current ?? [currentWorkspace]);
      if(wsSegment && (query.get('workspace')===wsSegment || query.get('workspace')===wsId)){
        query.delete('workspace');
      }
      const nextSearch=query.size?`?${query}`:'';
      const runPath=run?`/runs/${encodeURIComponent(run)}`:'';
      const nextUrl=`/generations/${encodeURIComponent(value.reference)}${runPath}${nextSearch}${currentRoute.hash}`;
      if(`${currentRoute.pathname}${currentRoute.search}${currentRoute.hash}`!==nextUrl){
        navigate(nextUrl,{replace:true});
      }
    };
    if(forceRefresh&&token)invalidateVideoSession(token,wsId,id,cached?.reference);
    if(cached)canonicalize(cached);
    const fresh=Boolean(!forceRefresh&&cached&&token&&isQueryFresh(token,sessionCacheKey,VIDEO_FRESH_MS)&&!hasActiveTurn(cached));
    if(fresh)return()=>request.abort();
    const retrieve=async(signal:AbortSignal)=>{
      const value=await client.generations({organizationId:orgId,projectId:wsId}).sessions.retrieve(id,{signal});
      if(value.data.id!==id&&value.data.reference!==id)throw new Error('Unexpected Video session');
      return value.data;
    };
    void (token
      ? fetchQuery(token,sessionCacheKey,retrieve,{freshMs:VIDEO_FRESH_MS,persist:true,awaitRevalidate:true,force:forceRefresh||Boolean(cached&&hasActiveTurn(cached)),signal:request.signal})
      : retrieve(request.signal))
      .then(data=>{if(!request.signal.aborted){
        primeVideoSession(token,wsId,data);
        setSession(data);
        canonicalize(data);
      }})
      .catch(caught=>{if(!request.signal.aborted){
        if(token&&caught instanceof NiuAPIError&&(caught.status===403||caught.status===404)){
          invalidateVideoSession(token,wsId,id,cached?.reference);
          setSession(null);
        }
        setError('This Video session could not be loaded. Check workspace access and reload.');
      }});
    return()=>request.abort();
  },[client,orgId,wsId,id,viewKey,revision,run,sessionCacheKey,token,navigate]);
  useEffect(()=>{
    const targetAnchor=run || (route.hash ? route.hash.slice(1) : '');
    if(!session||!targetAnchor)return;
    let anchor=targetAnchor;
    try{anchor=decodeURIComponent(targetAnchor);}catch{/* keep the literal fragment */}
    const target=document.getElementById(anchor);
    if(!target)return;
    setActiveAnchor(anchor);
    if(typeof target.scrollIntoView==='function')target.scrollIntoView({block:'start'});
    target.focus({preventScroll:true});
  },[session,route.hash,run]);
  function keyFor(model?:string){
    if(!workspace)return undefined;
    return keys.find(key=>key.workspace.id===workspace.id && (!key.allowed_models?.length || key.allowed_models.includes('*') || Boolean(model&&key.allowed_models.includes(model))))?.id;
  }
  const contextPanel: GenerationsContextPanelData = !session ? { runs: [], deliverables: [], initialRunId: run ?? null } : {
    runs: session.turns.map((turn, index) => {
      const anchor = readableTurnAnchor(turn);
      const model = turn.task?.model ?? turn.intent?.model ?? 'video';
      const rawStatus = turn.task?.status;
      const statusLabel = rawStatus && Object.hasOwn(videoStatusLabel, rawStatus)
        ? translateUI(videoStatusLabel[rawStatus as keyof typeof videoStatusLabel])
        : turn.intent?.submission_state === 'not_dispatched'
          ? uiT('Not dispatched')
          : uiT('Saved request');
      return {
        id: turn.id,
        reference: turn.task?.reference ?? turn.intent?.reference ?? undefined,
        turnIndex: index + 1,
        turnAnchor: anchor,
        prompt: turn.instruction?.prompt ?? uiT('Saved video request'),
        model,
        modelTitle: catalogTitle({ id: model }),
        kind: 'video' as const,
        state: (rawStatus ?? 'saved') as GenerationContextRunState,
        statusLabel,
      };
    }),
    deliverables: session.turns.flatMap((turn, index) => {
      if (turn.task?.status !== 'succeeded') return [];
      const anchor = readableTurnAnchor(turn);
      const model = turn.task?.model ?? turn.intent?.model ?? 'video';
      return [{
        id: `${turn.id}:video`,
        turnIndex: index + 1,
        turnAnchor: anchor,
        runId: turn.id,
        title: turn.instruction?.prompt.split('\n')[0]?.slice(0, 60) || catalogTitle({ id: model }),
        subtitle: `${uiT('Turn')} ${index + 1} · ${catalogTitle({ id: model })}`,
        kind: 'video' as const,
        language: 'mp4',
      }];
    }),
    initialRunId: run ?? null,
  };
  const selectedSessionKey = keys.find(key => key.id === activeComposerKey);
  const workspacePath = workspace ? `/workspaces/${workspacePathSegment(workspace, context.workspaces ?? [workspace])}` : undefined;
  return <div className="video-shell">
    <GenerationSessionBindings trigger={trigger} sessionKey={session?.id ?? id} contextPanel={contextPanel} title={session?.title??uiT("Video session")} actions={<div className="playground-toolbar-actions"><GenerationKeyPicker ariaLabel={uiT("Video API key")} className="video-key-choice" hasSelection={Boolean(selectedSessionKey)} emphasizeMissing={false} loading={availableKeys.loading} disabled={Boolean(session?.archived)||!keySelectionReady} triggerLabel={selectedSessionKey?.name ?? (availableKeys.loading ? uiT("Loading keys…") : uiT("Choose API key"))} selectedKeyId={activeComposerKey} keyOptions={keys} currentWorkspaceId={workspace?.id} errorText={availableKeys.error ? uiT("Some API keys could not be loaded.") : ''} manageKeysHref={workspacePath ? `${workspacePath}/keys` : undefined} onSelectKey={value=>{if(!keySelectionReady)return;setComposerKey(value);setKeyEditRevision(revision=>revision+1);}} /><Button variant="ghost" size="icon" aria-label={uiT("Refresh session")} onClick={bumpRevision}><IconRefresh size={16}/></Button></div>} history={{context,activeVideoSession:session?.reference??session?.id??id}}/>
    <section className="video-main playground-chat-main" aria-label={uiT("Saved Video session")}><div className="video-content"><div className="video-conversation playground-transcript">
      {error?<p role="alert" className="video-error">{uiT(error)}</p>:!session?<ListRowsSkeleton rows={3} label={uiT("Loading Video session…")}/>:<>
        {session.archived&&<p className="video-muted"><Badge variant="secondary">{uiT("Archived")}</Badge>{" "}{uiT("Restore this session from Archived sessions to return it to history.")}</p>}
        {!session.turns.length&&<Empty><EmptyHeader><EmptyMedia variant="icon"><IconVideo size={20}/></EmptyMedia><EmptyTitle>{uiT("No video turns yet")}</EmptyTitle><EmptyDescription>{uiT("No instructions have been saved in this session.")}</EmptyDescription></EmptyHeader></Empty>}
        {session.turns.map((turn, index)=>{
          const anchor=readableTurnAnchor(turn);
          return <div key={turn.id} id={anchor} tabIndex={-1} className={`video-turn video-session-turn${activeAnchor===anchor?' video-turn-target':''}`}>
            {turn.instruction?<div className="playground-user-prompt"><p>{turn.instruction.prompt}</p></div>:<p className="video-muted">{uiT("The saved instruction has expired or was deleted.")}</p>}
            <VideoTurnResult context={context} sessionId={session.id} turn={turn} turnIndex={index + 1} turnAnchor={anchor} keyId={keyFor(turn.task?.model??turn.intent?.model)} refreshKey={revision}/>
          </div>;
        })}
      </>}
    </div>
    {session && <VideoSessionComposer key={session.id} context={context} session={session} onSubmitted={bumpRevision} available={availableKeys} keyId={activeComposerKey} onRestoreKey={setComposerKey} keyEditRevision={keyEditRevision} onKeySelectionReadyChange={setKeySelectionReady} />}
    </div></section>
  </div>;
}
