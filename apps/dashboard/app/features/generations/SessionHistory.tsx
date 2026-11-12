import { Empty, EmptyHeader, EmptyMedia, EmptyDescription } from '@/components/ui/empty';
import { readLocale, useLocale as useUILocale } from '@/shell/ui-locale';
import { createPortal } from 'react-dom';
import { useEffect, useMemo, useState, useRef, type ReactNode, type RefObject } from 'react';
import { Link } from 'react-router';
import { IconMessageChatbot, IconVideo, IconDots, IconTrash, IconPencil, IconArchive } from '@tabler/icons-react';
import { SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarMenuAction, SidebarMenuSkeleton, useSidebar } from '@/components/ui/sidebar';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { peekQuery, primeQuery } from '@/lib/query-cache';
import { catalogTitle } from '@/lib/providers';
import type { DashboardContext } from '@/shell/dashboard-context';
import { cachedKeyGet } from '@/features/keys/api';
import type { VideoJobHistory } from '@niu-io/sdk';
import { NiuAdminClient, type GenerationTask, type TenantScope } from '@niu-io/sdk/admin';
import type { VideoGenerationsSessionSummary } from '@niu-io/sdk/generations-sessions';

type Chat = {id:string;reference?:string;title?:string;prompt:string;createdAt:number};
type Video = VideoJobHistory['data'][number] & {reference?:string;keyId?:string;sessionId?:string|null};
type SavedVideoSession = VideoGenerationsSessionSummary & {scope:TenantScope};
type HistorySnapshot = {chats:Chat[]; videos:Video[]; sessions:SavedVideoSession[]; sessionBefore:string|null; videoBefore:string|null; sessionsFailed:boolean};
type HistoryEntry =
  | {type:'video-session';id:string;reference?:string;session:SavedVideoSession;title:string;created:number;href:string}
  | {type:'chat';id:string;reference?:string;title:string;created:number;href:string}
  | {type:'video';id:string;reference?:string;title:string;created:number;href:string};
type SavedInput = {id:string;revision:number;title:string};
function historyTime(created: number) {
  if (!Number.isFinite(created) || created <= 0) return '';
  return new Intl.DateTimeFormat(readLocale(), { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(created));
}
function savedVideo(task:GenerationTask):Video {
  return {id:task.id,reference:task.reference,object:'video.job',model:task.model,status:task.state,created_at_ms:String(Date.parse(task.created_at)),sessionId:task.session_id};
}
/** History is always the active workspace. Switching the workspace is an explicit shell action. */
export default function SessionHistory({context,chats, activeChat, onChat, chatActions, videos, currentKeys, activeVideo, activeVideoSession, pending=false, failed=false, disabled=false, listTarget, focusFallback}: {
  focusFallback?: RefObject<HTMLButtonElement|null>; listTarget?: HTMLElement | null; context:DashboardContext; chats?:Chat[]; activeChat?:string|null; onChat?:(id:string)=>void; chatActions?:(id:string)=>ReactNode;
  currentKeys?:Array<{id:string;slug?:string;revoked:boolean;expired:boolean}>;videos?:Video[]; activeVideo?:string;activeVideoSession?:string; disabled?:boolean;pending?:boolean;failed?:boolean;
}) {
  const { t: uiT, format: uiF } = useUILocale();
  const {token,workspace}=context;
  const {isMobile,setOpenMobile}=useSidebar();
  const generation=useRef(0);
  const metadataIdentity=JSON.stringify([token,workspace?.id,context.session?.permissions.write]);
  const metadataScope=useRef(metadataIdentity);metadataScope.current=metadataIdentity;
  const pagination=useRef<AbortController|null>(null);
  const scopeKey=workspace ? `${workspace.organization_id}:${workspace.id}` : '';
  const scopeIdentity=JSON.stringify([token,scopeKey]);
  const identity=useRef(scopeIdentity);
  if(identity.current!==scopeIdentity){identity.current=scopeIdentity;generation.current+=1;}
  const historyKey='/api/v1/generation-history?v=2&workspace='+encodeURIComponent(scopeKey);
  const cached=token&&scopeKey ? peekQuery<HistorySnapshot>(token,historyKey,{persist:true}) : undefined;
  const [savedChats,setSavedChats]=useState<Chat[]>(cached?.chats??[]);
  const [savedVideos,setSavedVideos]=useState<Video[]>(cached?.videos??[]);
  const [savedSessions,setSavedSessions]=useState<SavedVideoSession[]>(cached?.sessions??[]);
  const [sessionsFailed,setSessionsFailed]=useState(Boolean(cached?.sessionsFailed));
  const [sessionBefore,setSessionBefore]=useState<string|null>(cached?.sessionBefore??null);
  const [videoBefore,setVideoBefore]=useState<string|null>(cached?.videoBefore??null);
  const [editingSession,setEditingSession]=useState<SavedVideoSession|null>(null);
  const [sessionTitle,setSessionTitle]=useState('');
  const [sessionBusy,setSessionBusy]=useState(false);
  const [sessionError,setSessionError]=useState('');
  const [deletingSession,setDeletingSession]=useState<{session:SavedVideoSession;inputs:SavedInput[];loading:boolean}|null>(null);
  const [deleteBusy,setDeleteBusy]=useState(false);
  const [deleteError,setDeleteError]=useState('');
  const actionButtons=useRef(new Map<string,HTMLButtonElement>());
  const menuOpener=useRef<HTMLButtonElement|null>(null);
  const client=useMemo(()=>token ? new NiuAdminClient({adminToken:token,baseURL:new URL('/api/v1',window.location.origin).href}):null,[token]);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  const [revision,setRevision]=useState(0);
  useEffect(()=>{const refresh=()=>setRevision(value=>value+1);window.addEventListener('niu:video-intent-saved',refresh);window.addEventListener('niu:video-session-changed',refresh);return()=>{window.removeEventListener('niu:video-intent-saved',refresh);window.removeEventListener('niu:video-session-changed',refresh);};},[]);
  useEffect(()=>{setEditingSession(null);setSessionError('');setSessionBusy(false);},[token,workspace?.id]);
  useEffect(()=>{setDeletingSession(null);setDeleteError('');setDeleteBusy(false);},[token,workspace?.id]);
  const loadedScope=useRef(JSON.stringify([token,scopeKey]));
  useEffect(()=>{
    const controller=new AbortController();
    const nextScope=JSON.stringify([token,scopeKey]);
    const previous=token&&scopeKey ? peekQuery<HistorySnapshot>(token,historyKey,{persist:true}) : undefined;
    if(loadedScope.current!==nextScope){
      loadedScope.current=nextScope;
      setSavedChats(previous?.chats??[]);setSavedVideos(previous?.videos??[]);setSavedSessions(previous?.sessions??[]);
      setSessionsFailed(Boolean(previous?.sessionsFailed));setSessionBefore(previous?.sessionBefore??null);setVideoBefore(previous?.videoBefore??null);
    }
    setError('');setLoading(false);setDeletingSession(null);setDeleteError('');
    if(!workspace || !scopeKey || !token || !client)return;
    setLoading(true);
    const tenant={organizationId:workspace.organization_id,projectId:workspace.id};
    let chatsFailed=false;
    let sessionFailures=false;
    let videosFailed=false;
    let sessionRows:SavedVideoSession[]=[];
    let nextSessionBefore:string|null=null;
    let videoRows:Video[]=[];
    let nextVideoBefore:string|null=null;
    const chatRows:Chat[]=[];
    void Promise.allSettled([
      (async()=>{
        try{const page=await cachedKeyGet<{data:Chat[]}>(token,`/api/v1/organizations/${workspace.organization_id}/projects/${workspace.id}/chats`,{signal:controller.signal,persist:true});chatRows.push(...page.data);}
        catch{if(!controller.signal.aborted)chatsFailed=true;}
      })(),
      (async()=>{
        try{
          const page=await client.generations(tenant).sessions.list({limit:25},{signal:controller.signal});
          sessionRows=page.data.map(session=>({...session,scope:tenant}));
          nextSessionBefore=page.has_more ? page.next_before : null;
        }catch{if(!controller.signal.aborted)sessionFailures=true;}
      })(),
      (async()=>{
        try{
          const page=await client.generations(tenant).tasks.list({kind:'video',limit:25},{signal:controller.signal});
          videoRows=page.data.map(savedVideo);
          nextVideoBefore=page.has_more ? page.next_cursor : null;
        }catch{if(!controller.signal.aborted)videosFailed=true;}
      })(),
    ]).then(()=>{
      if(controller.signal.aborted)return;
      const incomplete=chatsFailed||sessionFailures||videosFailed;
      const snapshot:HistorySnapshot={
        chats:chatsFailed&&!chatRows.length ? previous?.chats??[] : chatRows,
        videos:videosFailed&&!videoRows.length ? previous?.videos??[] : videoRows,
        sessions:sessionFailures&&!sessionRows.length ? previous?.sessions??[] : sessionRows,
        sessionBefore:sessionFailures ? previous?.sessionBefore??null : nextSessionBefore,
        videoBefore:videosFailed ? previous?.videoBefore??null : nextVideoBefore,
        sessionsFailed:sessionFailures&&!sessionRows.length,
      };
      setSavedChats(snapshot.chats);setSavedVideos(snapshot.videos);setSavedSessions(snapshot.sessions);
      setSessionsFailed(snapshot.sessionsFailed);setSessionBefore(snapshot.sessionBefore);setVideoBefore(snapshot.videoBefore);
      if(!incomplete)primeQuery(token,historyKey,snapshot,{persist:true});
      else setError('Some sessions could not be loaded.');
    }).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>{controller.abort();pagination.current?.abort();pagination.current=null;generation.current+=1;};
  },[token,scopeKey,revision]);
  const entries=useMemo(()=>{
    const merged=new Map(savedVideos.filter(item=>!item.sessionId||sessionsFailed).map(item=>[item.id,item]));
    for(const item of videos??[])if(!item.sessionId||sessionsFailed)merged.set(item.id,{...item,reference:item.reference??merged.get(item.id)?.reference});
    const keyQuery=(item:Video)=>{
      const slug=currentKeys?.find(key=>key.id===item.keyId)?.slug;
      return slug ? `?key=${encodeURIComponent(slug)}` : '';
    };
    const rows:HistoryEntry[]=[
      ...savedSessions.map(session=>({type:'video-session' as const,id:session.id,reference:session.reference,session,title:session.title,created:Date.parse(session.updated_at),href:session.reference || /^video-[1-9][0-9]{0,18}$/.test(session.id) ? `/generations/${encodeURIComponent(session.reference??session.id)}` : `/generations?video-session=${encodeURIComponent(session.id)}`})),
      ...[...new Map([...savedChats,...(chats??[])].map(item=>[item.id,item])).values()].map(item=>({type:'chat' as const,id:item.id,reference:item.reference,title:item.title||item.prompt.split('\n')[0]||'Chat session',created:item.createdAt,href:`/generations/${encodeURIComponent(item.reference??item.id)}`})),
      ...[...merged.values()].map(item=>{
        // Session-bound results belong to the session surface, which renders
        // the turn in place. Standalone jobs use the runs path.
        const sessionReference=!sessionsFailed&&item.sessionId ? savedSessions.find(session=>session.id===item.sessionId)?.reference : undefined;
        const readableReference=item.reference&&/^run-[1-9][0-9]{0,18}$/.test(item.reference) ? item.reference : undefined;
        return {type:'video' as const,id:item.id,reference:item.reference,title:`Video · ${catalogTitle(item.model)}`,created:Number(item.created_at_ms),href:sessionReference ? `/generations/${encodeURIComponent(sessionReference)}${readableReference?`#${encodeURIComponent(readableReference)}`:''}` : `/generations/runs/${encodeURIComponent(item.reference??item.id)}${keyQuery(item)}`};
      }),
    ];
    return rows.sort((a,b)=>b.created-a.created||a.id.localeCompare(b.id));
  },[chats,savedChats,savedVideos,savedSessions,sessionsFailed,videos,currentKeys]);
  async function more(){
    if(loading||(!sessionBefore&&!videoBefore)||pagination.current||!workspace||!client)return;setLoading(true);setError('');
    const request=new AbortController();pagination.current=request;
    const currentGeneration=generation.current;
    const tenant={organizationId:workspace.organization_id,projectId:workspace.id};
    try{
      const sessionCursor=sessionBefore;
      const videoCursor=videoBefore;
      const [sessionPage,videoPage]=await Promise.all([
        sessionCursor ? client.generations(tenant).sessions.list({limit:25,before:sessionCursor},{signal:request.signal}) : Promise.resolve(null),
        videoCursor ? client.generations(tenant).tasks.list({kind:'video',limit:25,cursor:videoCursor},{signal:request.signal}) : Promise.resolve(null),
      ]);
      if(request.signal.aborted||currentGeneration!==generation.current)return;
      if(sessionPage){
        if(sessionPage.has_more&&(!sessionPage.next_before||sessionPage.next_before===sessionCursor))throw new Error('Video session history did not advance.');
        const rows=sessionPage.data.map(session=>({...session,scope:tenant}));
        setSavedSessions(current=>[...new Map([...current,...rows].map(item=>[item.id,item])).values()]);
        setSessionBefore(sessionPage.has_more ? sessionPage.next_before : null);
        setSessionsFailed(false);
      }
      if(videoPage){
        if(videoPage.has_more&&(!videoPage.next_cursor||videoPage.next_cursor===videoCursor))throw new Error('Video job history did not advance.');
        const rows=videoPage.data.map(savedVideo);
        setSavedVideos(current=>[...new Map([...current,...rows].map(item=>[item.id,item])).values()]);
        setVideoBefore(videoPage.has_more ? videoPage.next_cursor : null);
      }
    }catch{if(!request.signal.aborted&&currentGeneration===generation.current)setError('Could not load more sessions.');}
    finally{if(pagination.current===request)pagination.current=null;if(!request.signal.aborted&&currentGeneration===generation.current)setLoading(false);}
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
  async function prepareDeleteSavedInput(item:SavedVideoSession){
    if(!client||deleteBusy||disabled||!context.session?.permissions.write)return;
    const currentScope=metadataScope.current;
    menuOpener.current=actionButtons.current.get(`session:${item.id}`)??null;
    setDeletingSession({session:item,inputs:[],loading:true});setDeleteError('');
    try{
      // Read turns only when the user explicitly asks to delete saved input; listing never hydrates them.
      const value=await client.generations(item.scope).sessions.retrieve(item.id);
      if(currentScope!==metadataScope.current)return;
      const inputs=value.data.turns.flatMap(turn=>{
        const intent=turn.intent;
        if(!intent||intent.content_state!=='retained')return [];
        const revisionNumber=Number(intent.revision);
        if(!Number.isSafeInteger(revisionNumber)||revisionNumber<1)return [];
        const title=turn.instruction?.prompt.trim().split('\n')[0]?.slice(0,120)||'Saved video request';
        return [{id:intent.id,revision:revisionNumber,title}];
      });
      setDeletingSession(current=>current&&current.session.id===item.id ? {...current,inputs,loading:false}:current);
    }catch(error){
      if(currentScope!==metadataScope.current)return;
      setDeletingSession(null);
      setError(error instanceof Error ? error.message : 'The saved input could not be loaded.');
    }
  }
  async function deleteSavedInput(){
    if(!deletingSession||deletingSession.loading||!deletingSession.inputs.length||deleteBusy||!client)return;
    const target=deletingSession;const currentScope=metadataScope.current;
    setDeleteBusy(true);setDeleteError('');
    try{
      for(const input of target.inputs)await client.deleteVideoIntent(target.session.scope,input.id,input.revision);
      if(currentScope!==metadataScope.current)return;
      setDeletingSession(null);
      window.dispatchEvent(new Event('niu:video-intent-saved'));
    }catch(error){if(currentScope===metadataScope.current)setDeleteError(error instanceof Error ? error.message : 'The saved input could not be deleted.');}
    finally{if(currentScope===metadataScope.current)setDeleteBusy(false);}
  }
  const content = <>
    {error&&<div className="px-3"><p role="alert" className="text-sm text-destructive">{uiT(error)}</p><Button variant="ghost" size="sm" onClick={()=>setRevision(value=>value+1)}>{uiT("Retry sessions")}</Button></div>}
    <SidebarMenu aria-label={uiT("Generation sessions")}>{entries.map(item=>{const when=historyTime(item.created);const runTag=item.type==='video'&&item.reference&&/^run-[1-9][0-9]{0,18}$/.test(item.reference)?item.reference:'';return (<SidebarMenuItem key={`${item.type}:${item.id}`}>
      <SidebarMenuButton asChild className="h-auto min-h-8 items-start py-1.5 [&>span:last-child]:whitespace-normal" isActive={item.type==='chat' ? (activeChat===item.id || Boolean(item.reference&&activeChat===item.reference)) : item.type==='video-session' ? (activeVideoSession===item.id || Boolean(item.reference&&activeVideoSession===item.reference)) : (activeVideo===item.id || Boolean(item.reference&&activeVideo===item.reference))} disabled={disabled} title={item.title}><Link to={item.href} onClick={event=>{if(disabled){event.preventDefault();return;}if(item.type==='chat'&&onChat){event.preventDefault();onChat(item.id);}if(isMobile)window.requestAnimationFrame(()=>setOpenMobile(false));}}>{item.type==='chat'?<IconMessageChatbot/>:<IconVideo/>}<span className="flex min-w-0 flex-col leading-tight"><span className="truncate">{uiT(item.title)}</span>{(when||runTag)&&<span aria-hidden="true" className="truncate text-xs font-normal text-muted-foreground">{runTag?`${runTag}${when?` · ${when}`:''}`:when}</span>}</span></Link></SidebarMenuButton>
      {item.type==='chat'&&chatActions&&chatActions(item.id)}
      {item.type==='video-session'&&context.session?.permissions.write&&<DropdownMenu><DropdownMenuTrigger asChild><SidebarMenuAction ref={element=>{if(element)actionButtons.current.set(`session:${item.id}`,element);else actionButtons.current.delete(`session:${item.id}`);}} showOnHover disabled={disabled||sessionBusy||deleteBusy} aria-label={uiF("Actions for {0}", [item.title])}><IconDots/></SidebarMenuAction></DropdownMenuTrigger><DropdownMenuContent side="right" align="start"><DropdownMenuItem onSelect={()=>{menuOpener.current=actionButtons.current.get(`session:${item.id}`)??null;setEditingSession(item.session);setSessionTitle(item.title);setSessionError('');if(isMobile)setOpenMobile(false);}}><IconPencil/>{uiT("Rename")}</DropdownMenuItem><DropdownMenuItem onSelect={()=>void updateSession(item.session,item.title,true)}><IconArchive/>{uiT("Archive")}</DropdownMenuItem><DropdownMenuItem onSelect={()=>void prepareDeleteSavedInput(item.session)}><IconTrash/>{uiT("Delete saved input")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}
    </SidebarMenuItem>);})}</SidebarMenu>
    {!entries.length&&!loading&&!pending&&!error&&!failed&&<Empty className="p-3 md:p-3"><EmptyHeader><EmptyMedia variant="icon"><IconMessageChatbot size={16} aria-hidden="true" /></EmptyMedia><EmptyDescription>{uiT("No sessions yet")}</EmptyDescription></EmptyHeader></Empty>}
    {(loading||pending)&&!entries.length&&<SidebarMenu role="status" aria-busy="true" aria-label={uiT("Loading sessions…")}>
      {Array.from({length:4},(_,index)=><SidebarMenuItem key={index}><SidebarMenuSkeleton showIcon/></SidebarMenuItem>)}
    </SidebarMenu>}
    {(sessionBefore||videoBefore)&&<Button variant="ghost" disabled={loading||disabled} onClick={()=>void more()}>{uiT("Load more sessions")}</Button>}
  </>;
  const dialogs=<>
    <Dialog open={Boolean(editingSession)} onOpenChange={open=>{if(!open&&!sessionBusy)setEditingSession(null);}}><DialogContent showCloseButton={!sessionBusy} onCloseAutoFocus={event=>{const target=menuOpener.current?.isConnected?menuOpener.current:focusFallback?.current;if(target?.isConnected){event.preventDefault();target.focus();}}}><DialogHeader><DialogTitle>{uiT("Rename Video session")}</DialogTitle><DialogDescription>{uiT("Change the title shown in Generations history.")}</DialogDescription></DialogHeader><form onSubmit={event=>{event.preventDefault();if(editingSession)void updateSession(editingSession,sessionTitle,editingSession.archived);}}><Label htmlFor="video-session-title">{uiT("Title")}</Label><Input id="video-session-title" value={sessionTitle} onChange={event=>setSessionTitle(event.target.value)} maxLength={200} disabled={sessionBusy}/>{sessionError&&<div className="mt-3"><p role="alert" className="text-sm text-destructive">{uiT(sessionError)}</p><Button type="button" variant="ghost" disabled={sessionBusy} onClick={()=>void reloadEditingSession()}>{uiT("Reload session")}</Button></div>}<DialogFooter className="mt-4"><Button type="button" variant="outline" disabled={sessionBusy} onClick={()=>setEditingSession(null)}>{uiT("Cancel")}</Button><Button type="submit" disabled={sessionBusy||!sessionTitle.trim()}>{sessionBusy?uiT("Saving…"):uiT("Save")}</Button></DialogFooter></form></DialogContent></Dialog>
    <Dialog open={Boolean(deletingSession)} onOpenChange={open=>{if(!open&&!deleteBusy)setDeletingSession(null);}}><DialogContent showCloseButton={!deleteBusy} onCloseAutoFocus={event=>{const target=menuOpener.current?.isConnected?menuOpener.current:focusFallback?.current;if(target?.isConnected){event.preventDefault();target.focus();}}}><DialogHeader><DialogTitle>{uiT("Delete saved video inputs")}</DialogTitle><DialogDescription>{uiT("This permanently removes the saved prompts and settings in this session. It does not cancel generations, delete results, or refund charges.")}</DialogDescription></DialogHeader>
      {deletingSession?.loading ? <p role="status">{uiT("Loading saved inputs…")}</p> : deletingSession&&deletingSession.inputs.length>0 ? <ul className="list-inside list-disc space-y-1 text-sm">{deletingSession.inputs.map(input=><li className="break-words" key={input.id}>{input.title}</li>)}</ul> : <p className="text-sm">{uiT("No retained saved input remains in this session.")}</p>}
      {deleteError&&<p role="alert" className="text-sm text-destructive">{uiT(deleteError)}</p>}
      <DialogFooter><Button variant="outline" onClick={()=>setDeletingSession(null)} disabled={deleteBusy}>{uiT("Cancel")}</Button><Button variant="destructive" onClick={()=>void deleteSavedInput()} disabled={deleteBusy||Boolean(deletingSession?.loading)||!deletingSession?.inputs.length}>{deleteBusy?uiT("Deleting…"):uiT("Delete input")}</Button></DialogFooter></DialogContent></Dialog>
  </>;
  return <>
    {listTarget ? createPortal(content, listTarget) : listTarget === undefined ? content : null}
    {dialogs}
  </>;
}
