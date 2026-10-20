import { createPortal } from 'react-dom';
import { useEffect, useMemo, useState, useRef, type ReactNode, type RefObject } from 'react';
import { Link } from 'react-router';
import { IconMessageChatbot, IconVideo, IconDots, IconTrash, IconPencil, IconArchive } from '@tabler/icons-react';
import { SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarMenuAction, useSidebar } from '@/components/ui/sidebar';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { DashboardContext } from '@/app/dashboard-context';
import { workspacePathSegment } from '@/app/workspace-route';
import { keyRequest } from '@/features/keys/api';
import type { VideoJobHistory } from '../../../../../sdks/javascript/src/index';
import { NiuAdminClient, type GenerationTask, type TenantScope } from '../../../../../sdks/javascript/src/admin';
import { videoIntentHistory, type VideoIntentHistoryRow } from '@/features/video/intent-history';
import type { VideoGenerationsSessionSummary } from '../../../../../sdks/javascript/src/generations-sessions';

type Chat = {id:string;title?:string;prompt:string;createdAt:number};
type Video = VideoJobHistory['data'][number] & {keyId?:string;workspaceId?:string;sessionId?:string|null};
type VideoCursor = {scope:TenantScope;before:string};
type SavedVideoSession = VideoGenerationsSessionSummary & {scope:TenantScope};
function savedVideo(task:GenerationTask,workspaceId:string):Video {
  return {id:task.id,object:'video.job',model:task.model,status:task.state,created_at_ms:String(Date.parse(task.created_at)),workspaceId,sessionId:task.session_id};
}
export default function SessionHistory({context,chats, activeChat, onChat, chatActions, videos, videoKeyId, currentKeys, activeVideo, activeIntent, activeVideoSession, onIntentDeleted, pending=false, failed=false, disabled=false, listTarget, focusFallback}: {
  focusFallback?: RefObject<HTMLButtonElement|null>; listTarget?: HTMLElement | null; context:DashboardContext; chats?:Chat[]; activeChat?:string|null; onChat?:(id:string)=>void; chatActions?:(id:string)=>ReactNode;
  currentKeys?:Array<{id:string;revoked:boolean;expired:boolean}>;videoKeyId?:string;videos?:Video[]; activeVideo?:string;activeIntent?:string;activeVideoSession?:string;onIntentDeleted?:(id:string)=>void; disabled?:boolean;pending?:boolean;failed?:boolean;
}) {
  const {token,workspace}=context;
  const {isMobile,setOpenMobile}=useSidebar();
  const identity=useRef('');
  const generation=useRef(0);
  const metadataIdentity=JSON.stringify([token,workspace?.id,context.session?.permissions.write]);
  const metadataScope=useRef(metadataIdentity);metadataScope.current=metadataIdentity;
  const pagination=useRef<AbortController|null>(null);
  const availableWorkspaces=context.workspaces?.length ? context.workspaces : workspace ? [workspace] : [];
  const workspaceListScope=availableWorkspaces.map(item=>`${item.organization_id}:${item.id}`).join(',');
  const scopeIdentity=JSON.stringify([token,workspaceListScope,currentKeys,videoKeyId]);
  if(identity.current!==scopeIdentity){identity.current=scopeIdentity;generation.current+=1;}
  const [savedChats,setSavedChats]=useState<Array<Chat & {workspaceId:string}>>([]);
  const [savedVideos,setSavedVideos]=useState<Video[]>([]);
  const [savedIntents,setSavedIntents]=useState<VideoIntentHistoryRow[]>([]);
  const [savedSessions,setSavedSessions]=useState<SavedVideoSession[]>([]);
  const [unavailableSessionWorkspaces,setUnavailableSessionWorkspaces]=useState<Set<string>>(new Set());
  const [sessionCursors,setSessionCursors]=useState<VideoCursor[]>([]);
  const [editingSession,setEditingSession]=useState<SavedVideoSession|null>(null);
  const [sessionTitle,setSessionTitle]=useState('');
  const [sessionBusy,setSessionBusy]=useState(false);
  const [sessionError,setSessionError]=useState('');
  const [intentCursors,setIntentCursors]=useState<Array<{scope:VideoIntentHistoryRow['scope'];before:string}>>([]);
  const [deleting,setDeleting]=useState<VideoIntentHistoryRow|null>(null);
  const [deleteBusy,setDeleteBusy]=useState(false);
  const [deleteError,setDeleteError]=useState('');
  const actionButtons=useRef(new Map<string,HTMLButtonElement>());
  const deleteOpener=useRef<HTMLButtonElement|null>(null);
  const client=useMemo(()=>token ? new NiuAdminClient({adminToken:token,baseURL:new URL('/api/v1',window.location.origin).href}):null,[token]);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  const [revision,setRevision]=useState(0);
  useEffect(()=>{const refresh=()=>setRevision(value=>value+1);window.addEventListener('niu:video-intent-saved',refresh);window.addEventListener('niu:video-session-changed',refresh);return()=>{window.removeEventListener('niu:video-intent-saved',refresh);window.removeEventListener('niu:video-session-changed',refresh);};},[]);
  useEffect(()=>{setEditingSession(null);setSessionError('');setSessionBusy(false);},[token,workspace?.id]);
  const [cursors,setCursors]=useState<VideoCursor[]>([]);
  const loadedScope=useRef('');
  useEffect(()=>{
    const controller=new AbortController();
    const nextScope=JSON.stringify([token,workspaceListScope]);
    if(loadedScope.current!==nextScope){loadedScope.current=nextScope;setSavedChats([]);setSavedVideos([]);setSavedIntents([]);setSavedSessions([]);}
    setSessionCursors([]);setIntentCursors([]);setCursors([]);setError('');setLoading(false);setDeleting(null);setDeleteError('');
    if(!workspaceListScope || !token)return;
    setLoading(true);
    let failedRead=false;
    const read=async<T,>(path:string):Promise<T|null>=>{
      try{return await keyRequest<T>(token,path,'GET',undefined,controller.signal);}
      catch {failedRead=true;return null;}
    };
    void (async()=>{
      const available=context.workspaces?.length ? context.workspaces : workspace ? [workspace] : [];
      const queue=[...available];
      const chatRows:Array<Chat & {workspaceId:string}>=[];
      const videoRows:Video[]=[];
      const sessionRows:SavedVideoSession[]=[];
      const sessionFailures=new Set<string>();
      const nextSessions:VideoCursor[]=[];
      const intentRows:VideoIntentHistoryRow[]=[];
      const nextIntents:Array<{scope:VideoIntentHistoryRow['scope'];before:string}>=[];
      const next:VideoCursor[]=[];
      const pending=Array.from({length:Math.min(4,queue.length)},async()=>{
        while(queue.length && !controller.signal.aborted){
          const item=queue.shift()!;
          const currentScope=`/api/v1/organizations/${item.organization_id}/projects/${item.id}`;
          const tenant={organizationId:item.organization_id,projectId:item.id};
          try{
            const page=await client!.generations(tenant).sessions.list({limit:25},{signal:controller.signal});
            sessionRows.push(...page.data.map(session=>({...session,scope:tenant})));
            if(page.has_more&&page.next_before)nextSessions.push({scope:tenant,before:page.next_before});
          }catch{if(!controller.signal.aborted){failedRead=true;sessionFailures.add(item.id);}}
          try{
            const page=await videoIntentHistory(client!,tenant,{limit:25},{signal:controller.signal});
            intentRows.push(...page.data);
            if(page.incomplete)failedRead=true;
            if(page.has_more&&page.next_before)nextIntents.push({scope:tenant,before:page.next_before});
          }catch{if(!controller.signal.aborted)failedRead=true;}
          {
            const page=await read<{data:Chat[]}>(`${currentScope}/chats`);
            if(page)chatRows.push(...page.data.map(chat=>({...chat,workspaceId:item.id})));
          }
          try {
            const page=await client!.generations(tenant).tasks.list({kind:'video',limit:25},{signal:controller.signal});
            videoRows.push(...page.data.map(task=>savedVideo(task,item.id)));
            if(page.has_more&&page.next_cursor)next.push({scope:tenant,before:page.next_cursor});
          }catch{if(!controller.signal.aborted)failedRead=true;}
        }
      });
      const outcomes=await Promise.allSettled(pending);
      if(!controller.signal.aborted){setUnavailableSessionWorkspaces(sessionFailures);setSavedSessions(sessionRows);setSessionCursors(nextSessions);setSavedChats(chatRows);setSavedVideos(videoRows);setSavedIntents(intentRows);setIntentCursors(nextIntents);setCursors(next);}
      if(!controller.signal.aborted && (failedRead||outcomes.some(item=>item.status==='rejected')))setError('Some sessions could not be loaded.');
    })().finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>{controller.abort();pagination.current?.abort();pagination.current=null;generation.current+=1;};
  },[token,workspaceListScope,revision,JSON.stringify(currentKeys)]);
  const entries=useMemo(()=>{
    const knownWorkspaces=context.workspaces?.length ? context.workspaces : workspace ? [workspace] : [];
    const workspaceSegment=(id?:string)=>{
      if(!id)return '';
      const found=knownWorkspaces.find(item=>item.id===id);
      if(!found)return id;
      if(!found.slug && !found.route_slug && found.name.length<=1)return found.id;
      return workspacePathSegment(found,knownWorkspaces);
    };
    const merged=new Map(savedVideos.filter(item=>!item.sessionId||unavailableSessionWorkspaces.has(item.workspaceId??'')).map(item=>[item.id,item]));
    for(const item of videos??[])if(!item.sessionId||unavailableSessionWorkspaces.has(workspace?.id??''))merged.set(item.id,{...item,workspaceId:workspace?.id});
    const legacyIntents=savedIntents.filter(item=>!item.sessionId||unavailableSessionWorkspaces.has(item.scope.projectId));
    const intentsByJob=new Map(legacyIntents.filter(item=>item.jobId).map(item=>[item.jobId,item]));
    const intentHref=(item:VideoIntentHistoryRow)=>`/generations?workspace=${encodeURIComponent(workspaceSegment(item.scope.projectId))}&intent=${encodeURIComponent(item.id)}${item.keyId ? `&key=${encodeURIComponent(item.keyId)}`:''}`;
    return [
      ...savedSessions.map(session=>({id:session.id,type:'video-session' as const,session,workspaceId:session.workspace_id,title:session.title,created:Date.parse(session.updated_at),href:`/generations?workspace=${encodeURIComponent(workspaceSegment(session.workspace_id))}&video-session=${encodeURIComponent(session.id)}`})),
      ...[...new Map([...savedChats.filter(item => chats === undefined || pending || item.workspaceId !== workspace?.id),...(chats??[]).map(item=>({...item,workspaceId:workspace?.id??''}))].map(item=>[`${item.workspaceId}:${item.id}`,item])).values()].map(item=>({id:item.id,type:'chat' as const,workspaceId:item.workspaceId,title:item.title||item.prompt.split('\n')[0]||'Chat session',created:item.createdAt,href:`/generations?workspace=${encodeURIComponent(workspaceSegment(item.workspaceId))}&session=${encodeURIComponent(item.id)}`})),
      ...[...merged.values()].map(item=>{const intent=intentsByJob.get(item.id);return {id:item.id,type:'video' as const,intent,workspaceId:item.workspaceId,title:intent?.title??`Video · ${item.model}`,created:Number(item.created_at_ms),href:intent ? intentHref(intent):`/generations?workspace=${encodeURIComponent(workspaceSegment(item.workspaceId))}${item.keyId ? `&key=${encodeURIComponent(item.keyId)}`:''}&job=${encodeURIComponent(item.id)}`};}),
      ...legacyIntents.filter(item=>!item.jobId || !merged.has(item.jobId)).map(item=>({id:item.id,type:'video' as const,intent:item,workspaceId:item.scope.projectId,title:item.title,created:Number(item.expires_at_ms),href:intentHref(item)})),
    ].sort((a,b)=>b.created-a.created||a.id.localeCompare(b.id));
  },[chats,savedChats,savedVideos,savedIntents,savedSessions,unavailableSessionWorkspaces,videos,workspace,context.workspaces,pending]);
  async function more(){
    if(loading||(!cursors.length&&!intentCursors.length&&!sessionCursors.length)||pagination.current)return;setLoading(true);setError('');
    const request=new AbortController();pagination.current=request;
    const currentGeneration=generation.current;
    try{
      const next:VideoCursor[]=[];const rows:Video[]=[];
      const nextSessions:VideoCursor[]=[];const sessionRows:SavedVideoSession[]=[];
      for(const cursor of sessionCursors){
        const page=await client!.generations(cursor.scope).sessions.list({limit:25,before:cursor.before},{signal:request.signal});
        if(page.has_more&&(!page.next_before||page.next_before===cursor.before))throw new Error('Video session history did not advance.');
        sessionRows.push(...page.data.map(session=>({...session,scope:cursor.scope})));
        if(page.has_more&&page.next_before)nextSessions.push({...cursor,before:page.next_before});
      }
      const nextIntents:Array<{scope:VideoIntentHistoryRow['scope'];before:string}>=[];const intentRows:VideoIntentHistoryRow[]=[];let incomplete=false;
      for(const cursor of intentCursors){
        const page=await videoIntentHistory(client!,cursor.scope,{limit:25,before:cursor.before},{signal:request.signal});
        intentRows.push(...page.data);if(page.incomplete)incomplete=true;
        if(page.has_more&&page.next_before)nextIntents.push({...cursor,before:page.next_before});
      }
      // Sequential page reads bound both concurrency and retained response memory.
      for(const cursor of cursors){
        if(request.signal.aborted)return;
        const page=await client!.generations(cursor.scope).tasks.list({kind:'video',limit:25,cursor:cursor.before},{signal:request.signal});
        rows.push(...page.data.map(task=>savedVideo(task,cursor.scope.projectId)));
        if(page.has_more&&page.next_cursor)next.push({...cursor,before:page.next_cursor});
      }
      if(request.signal.aborted||currentGeneration!==generation.current)return;
      if(incomplete)setError('Some saved inputs could not be read.');
      setSavedSessions(current=>[...new Map([...current,...sessionRows].map(item=>[`${item.scope.projectId}:${item.id}`,item])).values()]);setSessionCursors(nextSessions);
      setSavedVideos(current=>[...current,...rows]);setSavedIntents(current=>[...new Map([...current,...intentRows].map(item=>[`${item.scope.projectId}:${item.id}`,item])).values()]);setIntentCursors(nextIntents);setCursors(next);
    }catch{if(!request.signal.aborted&&currentGeneration===generation.current)setError('Could not load more sessions.');}finally{if(pagination.current===request)pagination.current=null;if(!request.signal.aborted&&currentGeneration===generation.current)setLoading(false);}
  }
  async function eraseInput(){
    if(!deleting || deleteBusy || !client)return;
    const target=deleting;const currentGeneration=generation.current;
    setDeleteBusy(true);setDeleteError('');
    try{
      await client.deleteVideoIntent(target.scope,target.id,target.revision);
      if(currentGeneration!==generation.current)return;
      setSavedIntents(current=>current.filter(item=>item.id!==target.id || item.scope.projectId!==target.scope.projectId));setDeleting(null);onIntentDeleted?.(target.id);
    }catch(error){if(currentGeneration===generation.current)setDeleteError(error instanceof Error ? error.message:'The saved input could not be deleted.');}
    finally{setDeleteBusy(false);}
  }
  async function updateSession(item:SavedVideoSession,title:string,archived:boolean){
    if(!client||sessionBusy||disabled||!context.session?.permissions.write)return;
    if(!title.trim()||new TextEncoder().encode(title.trim()).length>200){setSessionError('Use a title of 1 to 200 bytes.');return;}
    const currentScope=metadataScope.current;
    setSessionBusy(true);setSessionError('');
    try{
      await client.generations(item.scope).sessions.update(item.id,{expected_revision:item.revision,title:title.trim(),archived});
      if(currentScope!==metadataScope.current)return;
      setEditingSession(null);
      setSessionBusy(false);
      window.dispatchEvent(new Event('niu:video-session-changed'));
    }catch{
      if(currentScope===metadataScope.current){
        const message='The Video session could not be updated. Reload before trying again; another change may have been saved.';
        if(editingSession)setSessionError(message);else setError(message);
      }
    }finally{if(currentScope===metadataScope.current)setSessionBusy(false);}
  }
  async function reloadEditingSession(){
    if(!client||!editingSession||sessionBusy)return;
    const item=editingSession;const currentScope=metadataScope.current;
    setSessionBusy(true);
    try{
      const value=await client.generations(item.scope).sessions.retrieve(item.id);
      if(currentScope!==metadataScope.current)return;
      setEditingSession({...value.data,scope:item.scope});setSessionTitle(value.data.title);setSessionError('');
      window.dispatchEvent(new Event('niu:video-session-changed'));
    }catch{if(currentScope===metadataScope.current)setSessionError('The saved session could not be reloaded. Check access before trying again.');}
    finally{if(currentScope===metadataScope.current)setSessionBusy(false);}
  }
  const content = <>
    {error&&<div className="px-3"><p role="alert" className="text-sm text-destructive">{error}</p><Button variant="ghost" size="sm" onClick={()=>setRevision(value=>value+1)}>Retry sessions</Button></div>}
    <SidebarMenu aria-label="Generation sessions">{entries.map(item=><SidebarMenuItem key={`${item.type}:${item.id}`}>
      <SidebarMenuButton asChild isActive={item.type==='chat' ? activeChat===item.id : item.type==='video-session' ? activeVideoSession===item.id : activeVideo===item.id || Boolean(item.intent&&activeIntent===item.intent.id)} disabled={disabled} title={item.title}><Link to={item.href} onClick={event=>{if(disabled){event.preventDefault();return;}if(item.type==='chat'&&item.workspaceId===workspace?.id&&onChat){event.preventDefault();onChat(item.id);}if(isMobile)setOpenMobile(false);}}>{item.type==='chat'?<IconMessageChatbot/>:<IconVideo/>}<span>{item.title}</span></Link></SidebarMenuButton>
      {item.type==='chat'&&item.workspaceId===workspace?.id&&chatActions&&chatActions(item.id)}
      {item.type==='video'&&item.intent&&item.workspaceId===workspace?.id&&context.session?.permissions.write&&<DropdownMenu><DropdownMenuTrigger asChild><SidebarMenuAction ref={element=>{if(element)actionButtons.current.set(item.intent!.id,element);else actionButtons.current.delete(item.intent!.id);}} showOnHover disabled={disabled||deleteBusy} aria-label={`Actions for ${item.title}`}><IconDots/></SidebarMenuAction></DropdownMenuTrigger><DropdownMenuContent side="right" align="start"><DropdownMenuItem onSelect={()=>{deleteOpener.current=actionButtons.current.get(item.intent!.id)??null;setDeleting(item.intent!);setDeleteError('');}}><IconTrash/>Delete saved input</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}
      {item.type==='video-session'&&item.workspaceId===workspace?.id&&context.session?.permissions.write&&<DropdownMenu><DropdownMenuTrigger asChild><SidebarMenuAction ref={element=>{if(element)actionButtons.current.set(`session:${item.id}`,element);else actionButtons.current.delete(`session:${item.id}`);}} showOnHover disabled={disabled||sessionBusy} aria-label={`Actions for ${item.title}`}><IconDots/></SidebarMenuAction></DropdownMenuTrigger><DropdownMenuContent side="right" align="start"><DropdownMenuItem onSelect={()=>{deleteOpener.current=actionButtons.current.get(`session:${item.id}`)??null;setEditingSession(item.session);setSessionTitle(item.title);setSessionError('');if(isMobile)setOpenMobile(false);}}><IconPencil/>Rename</DropdownMenuItem><DropdownMenuItem onSelect={()=>void updateSession(item.session,item.title,true)}><IconArchive/>Archive</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}
    </SidebarMenuItem>)}</SidebarMenu>
    {!entries.length&&!loading&&!pending&&!error&&!failed&&<p className="px-3 py-4 text-sm text-muted-foreground">No sessions yet</p>}
    {(loading||pending)&&!entries.length&&<p role="status" className="px-3 text-sm text-muted-foreground">Loading sessions…</p>}
    {(cursors.length>0||intentCursors.length>0||sessionCursors.length>0)&&<Button variant="ghost" disabled={loading||disabled} onClick={()=>void more()}>Load more sessions</Button>}
  </>;
  const dialogs=<>
    <Dialog open={Boolean(editingSession)} onOpenChange={open=>{if(!open&&!sessionBusy)setEditingSession(null);}}><DialogContent showCloseButton={!sessionBusy} onCloseAutoFocus={event=>{const target=deleteOpener.current?.isConnected?deleteOpener.current:focusFallback?.current;if(target?.isConnected){event.preventDefault();target.focus();}}}><DialogHeader><DialogTitle>Rename Video session</DialogTitle><DialogDescription>Change the title shown in Generations history.</DialogDescription></DialogHeader><form onSubmit={event=>{event.preventDefault();if(editingSession)void updateSession(editingSession,sessionTitle,editingSession.archived);}}><Label htmlFor="video-session-title">Title</Label><Input id="video-session-title" value={sessionTitle} onChange={event=>setSessionTitle(event.target.value)} maxLength={200} disabled={sessionBusy}/>{sessionError&&<div className="mt-3"><p role="alert" className="text-sm text-destructive">{sessionError}</p><Button type="button" variant="ghost" disabled={sessionBusy} onClick={()=>void reloadEditingSession()}>Reload session</Button></div>}<DialogFooter className="mt-4"><Button type="button" variant="outline" disabled={sessionBusy} onClick={()=>setEditingSession(null)}>Cancel</Button><Button type="submit" disabled={sessionBusy||!sessionTitle.trim()}>{sessionBusy?'Saving…':'Save'}</Button></DialogFooter></form></DialogContent></Dialog>
    <Dialog open={Boolean(deleting)} onOpenChange={open=>{if(!open&&!deleteBusy)setDeleting(null);}}><DialogContent showCloseButton={!deleteBusy} onCloseAutoFocus={event=>{const target=deleteOpener.current?.isConnected ? deleteOpener.current:focusFallback?.current;if(target?.isConnected){event.preventDefault();target.focus();}}}><DialogHeader><DialogTitle>Delete saved video input</DialogTitle><DialogDescription>This permanently removes the saved prompt and settings. It does not cancel the generation, delete its result, or refund charges.</DialogDescription></DialogHeader><p className="break-words text-sm">{deleting?.title}</p>{deleteError&&<p role="alert" className="text-sm text-destructive">{deleteError}</p>}<DialogFooter><Button variant="outline" onClick={()=>setDeleting(null)} disabled={deleteBusy}>Cancel</Button><Button variant="destructive" onClick={()=>void eraseInput()} disabled={deleteBusy}>{deleteBusy?'Deleting…':'Delete input'}</Button></DialogFooter></DialogContent></Dialog>
  </>;
  return <>
    {listTarget ? createPortal(content, listTarget) : listTarget === undefined ? content : null}
    {dialogs}
  </>;
}
