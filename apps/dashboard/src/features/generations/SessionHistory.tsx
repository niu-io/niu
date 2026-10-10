import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { useEffect, useMemo, useState, useRef, type ReactNode } from 'react';
import { Link } from 'react-router';
import { IconMessageChatbot, IconVideo, IconSearch, IconDots, IconTrash } from '@tabler/icons-react';
import { SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarMenuAction, useSidebar } from '@/components/ui/sidebar';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { DashboardContext } from '@/app/dashboard-context';
import { keyRequest, projectKeyPath, type ProjectKey } from '@/features/keys/api';
import type { VideoJobHistory } from '../../../../../sdks/javascript/src/index';
import { NiuAdminClient } from '../../../../../sdks/javascript/src/admin';
import { videoIntentHistory, type VideoIntentHistoryRow } from '@/features/video/intent-history';

type Chat = {id:string;title?:string;prompt:string;createdAt:number};
type Video = VideoJobHistory['data'][number] & {keyId:string;workspaceId?:string};
export default function SessionHistory({context,chats, activeChat, onChat, chatActions, videos, videoKeyId, currentKeys, activeVideo, activeIntent, onIntentDeleted, pending=false, failed=false, disabled=false}: {
  context:DashboardContext; chats?:Chat[]; activeChat?:string|null; onChat?:(id:string)=>void; chatActions?:(id:string)=>ReactNode;
  currentKeys?:Array<{id:string;revoked:boolean;expired:boolean}>;videoKeyId?:string;videos?:Video[]; activeVideo?:string;activeIntent?:string;onIntentDeleted?:(id:string)=>void; disabled?:boolean;pending?:boolean;failed?:boolean;
}) {
  const {token,workspace}=context;
  const {isMobile,setOpenMobile}=useSidebar();
  const identity=useRef('');
  const generation=useRef(0);
  const pagination=useRef<AbortController|null>(null);
  const scopeIdentity=JSON.stringify([token,workspace?.id,context.workspaces?.map(item=>[item.organization_id,item.id]),currentKeys,videoKeyId]);
  if(identity.current!==scopeIdentity){identity.current=scopeIdentity;generation.current+=1;}
  const [savedChats,setSavedChats]=useState<Array<Chat & {workspaceId:string}>>([]);
  const [savedVideos,setSavedVideos]=useState<Video[]>([]);
  const [savedIntents,setSavedIntents]=useState<VideoIntentHistoryRow[]>([]);
  const [intentCursors,setIntentCursors]=useState<Array<{scope:VideoIntentHistoryRow['scope'];before:string}>>([]);
  const [deleting,setDeleting]=useState<VideoIntentHistoryRow|null>(null);
  const [deleteBusy,setDeleteBusy]=useState(false);
  const [deleteError,setDeleteError]=useState('');
  const actionButtons=useRef(new Map<string,HTMLButtonElement>());
  const deleteOpener=useRef<HTMLButtonElement|null>(null);
  const searchButton=useRef<HTMLButtonElement|null>(null);
  const client=useMemo(()=>token ? new NiuAdminClient({adminToken:token,baseURL:new URL('/admin/v1',window.location.origin).href}):null,[token]);
  const [query,setQuery]=useState('');
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  const [revision,setRevision]=useState(0);
  const [cursors,setCursors]=useState<Array<{keyId:string;before:string;scope:string;workspaceId:string}>>([]);
  const scope=workspace ? `/admin/v1/organizations/${workspace.organization_id}/projects/${workspace.id}` : '';
  useEffect(()=>{
    const controller=new AbortController();setSavedChats([]);setSavedVideos([]);setSavedIntents([]);setIntentCursors([]);setCursors([]);setError('');setLoading(false);setDeleting(null);setDeleteError('');
    if(!scope || !token)return;
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
      const intentRows:VideoIntentHistoryRow[]=[];
      const nextIntents:Array<{scope:VideoIntentHistoryRow['scope'];before:string}>=[];
      const next:Array<{keyId:string;before:string;scope:string;workspaceId:string}>=[];
      const pending=Array.from({length:Math.min(4,queue.length)},async()=>{
        while(queue.length && !controller.signal.aborted){
          const item=queue.shift()!;
          const currentScope=`/admin/v1/organizations/${item.organization_id}/projects/${item.id}`;
          const tenant={organizationId:item.organization_id,projectId:item.id};
          try{
            const page=await videoIntentHistory(client!,tenant,{limit:25},{signal:controller.signal});
            intentRows.push(...page.data);
            if(page.incomplete)failedRead=true;
            if(page.has_more&&page.next_before)nextIntents.push({scope:tenant,before:page.next_before});
          }catch{if(!controller.signal.aborted)failedRead=true;}
          if(chats===undefined || item.id!==workspace?.id){
            const page=await read<{data:Chat[]}>(`${currentScope}/chat-sessions`);
            if(page)chatRows.push(...page.data.map(chat=>({...chat,workspaceId:item.id})));
          }
          const keys=currentKeys!==undefined && item.id===workspace?.id ? {data:currentKeys} : await read<{data:ProjectKey[]}>(projectKeyPath(item.organization_id,item.id));
          for(const key of (keys?.data??[]).filter(key=>!key.revoked&&!key.expired&&!(item.id===workspace?.id&&key.id===videoKeyId))){
            if(controller.signal.aborted)return;
            const page=await read<VideoJobHistory>(`${currentScope}/keys/${key.id}/video/jobs?limit=25`);
            if(!page)continue;
            videoRows.push(...page.data.map(video=>({...video,keyId:key.id,workspaceId:item.id})));
            if(page.has_more&&page.next_before)next.push({keyId:key.id,before:page.next_before,scope:currentScope,workspaceId:item.id});
          }
        }
      });
      const outcomes=await Promise.allSettled(pending);
      if(!controller.signal.aborted){setSavedChats(chatRows);setSavedVideos(videoRows);setSavedIntents(intentRows);setIntentCursors(nextIntents);setCursors(next);}
      if(!controller.signal.aborted && (failedRead||outcomes.some(item=>item.status==='rejected')))setError('Some sessions could not be loaded.');
    })().finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>{controller.abort();pagination.current?.abort();pagination.current=null;generation.current+=1;};
  },[token,scope,chats===undefined,revision,JSON.stringify(context.workspaces?.map(item=>item.id)),JSON.stringify(currentKeys),videoKeyId]);
  const entries=useMemo(()=>{
    const merged=new Map(savedVideos.map(item=>[item.id,item]));
    for(const item of videos??[])merged.set(item.id,{...item,workspaceId:workspace?.id});
    const intentsByJob=new Map(savedIntents.filter(item=>item.jobId).map(item=>[item.jobId,item]));
    const intentHref=(item:VideoIntentHistoryRow)=>`/generations?mode=video&workspace=${encodeURIComponent(item.scope.projectId)}&intent=${encodeURIComponent(item.id)}${item.keyId ? `&key=${encodeURIComponent(item.keyId)}`:''}`;
    return [
      ...[...savedChats,...(chats??[]).map(item=>({...item,workspaceId:workspace?.id??''}))].map(item=>({id:item.id,type:'chat' as const,workspaceId:item.workspaceId,title:item.title||item.prompt.split('\n')[0]||'Chat session',created:item.createdAt,href:`/generations?workspace=${encodeURIComponent(item.workspaceId??'')}&session=${encodeURIComponent(item.id)}`})),
      ...[...merged.values()].map(item=>{const intent=intentsByJob.get(item.id);return {id:item.id,type:'video' as const,intent,workspaceId:item.workspaceId,title:intent?.title??`Video · ${item.model}`,created:Number(item.created_at_ms),href:intent ? intentHref(intent):`/generations?mode=video&workspace=${encodeURIComponent(item.workspaceId??'')}&key=${encodeURIComponent(item.keyId)}&job=${encodeURIComponent(item.id)}`};}),
      ...savedIntents.filter(item=>!item.jobId || !merged.has(item.jobId)).map(item=>({id:item.id,type:'video' as const,intent:item,workspaceId:item.scope.projectId,title:item.title,created:Number(item.expires_at_ms),href:intentHref(item)})),
    ].filter(item=>item.title.toLowerCase().includes(query.trim().toLowerCase())).sort((a,b)=>b.created-a.created||a.id.localeCompare(b.id));
  },[chats,savedChats,savedVideos,savedIntents,videos,workspace?.id,query]);
  async function more(){
    if(loading||(!cursors.length&&!intentCursors.length)||pagination.current)return;setLoading(true);setError('');
    const request=new AbortController();pagination.current=request;
    const currentGeneration=generation.current;
    try{
      const next:Array<{keyId:string;before:string;scope:string;workspaceId:string}>=[];const rows:Video[]=[];
      const nextIntents:Array<{scope:VideoIntentHistoryRow['scope'];before:string}>=[];const intentRows:VideoIntentHistoryRow[]=[];let incomplete=false;
      for(const cursor of intentCursors){
        const page=await videoIntentHistory(client!,cursor.scope,{limit:25,before:cursor.before},{signal:request.signal});
        intentRows.push(...page.data);if(page.incomplete)incomplete=true;
        if(page.has_more&&page.next_before)nextIntents.push({...cursor,before:page.next_before});
      }
      // Sequential page reads bound both concurrency and retained response memory.
      for(const cursor of cursors){
        if(request.signal.aborted)return;
        const page=await keyRequest<VideoJobHistory>(token,`${cursor.scope}/keys/${cursor.keyId}/video/jobs?limit=25&before=${encodeURIComponent(cursor.before)}`,'GET',undefined,request.signal);
        rows.push(...page.data.map(item=>({...item,keyId:cursor.keyId,workspaceId:cursor.workspaceId})));
        if(page.has_more&&page.next_before)next.push({...cursor,before:page.next_before});
      }
      if(request.signal.aborted||currentGeneration!==generation.current)return;
      if(incomplete)setError('Some saved inputs could not be read.');
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
  return <>
    <Popover><PopoverTrigger asChild><Button ref={searchButton} type="button" variant="ghost" size="icon" aria-label="Search sessions" title="Search sessions" className={query ? "text-primary bg-accent" : undefined}><IconSearch size={17}/></Button></PopoverTrigger><PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] space-y-2"><Input autoFocus aria-label="Search sessions" placeholder="Search sessions" value={query} onChange={event=>setQuery(event.target.value)}/>{query && <Button variant="ghost" size="sm" onClick={()=>setQuery('')}>Reset search</Button>}</PopoverContent></Popover>
    {error&&<div className="px-3"><p role="alert" className="text-sm text-destructive">{error}</p><Button variant="ghost" size="sm" onClick={()=>setRevision(value=>value+1)}>Retry sessions</Button></div>}
    <SidebarMenu aria-label="Generation sessions">{entries.map(item=><SidebarMenuItem key={`${item.type}:${item.id}`}>
      {item.type==='chat'&&item.workspaceId===workspace?.id&&onChat ? <SidebarMenuButton disabled={disabled} isActive={activeChat===item.id} onClick={()=>onChat(item.id)} title={item.title}><IconMessageChatbot/><span>{item.title}</span></SidebarMenuButton> : <SidebarMenuButton asChild isActive={item.type==='video'&&(activeVideo===item.id || Boolean(item.intent&&activeIntent===item.intent.id))} disabled={disabled}><Link to={item.href} onClick={()=>{if(isMobile)setOpenMobile(false);}}><>{item.type==='chat'?<IconMessageChatbot/>:<IconVideo/>}<span>{item.title}</span></></Link></SidebarMenuButton>}
      {item.type==='chat'&&item.workspaceId===workspace?.id&&chatActions&&chatActions(item.id)}
      {item.type==='video'&&item.intent&&item.workspaceId===workspace?.id&&context.session?.permissions.write&&<DropdownMenu><DropdownMenuTrigger asChild><SidebarMenuAction ref={element=>{if(element)actionButtons.current.set(item.intent!.id,element);else actionButtons.current.delete(item.intent!.id);}} showOnHover disabled={disabled||deleteBusy} aria-label={`Actions for ${item.title}`}><IconDots/></SidebarMenuAction></DropdownMenuTrigger><DropdownMenuContent side="right" align="start"><DropdownMenuItem onSelect={()=>{deleteOpener.current=actionButtons.current.get(item.intent!.id)??null;setDeleting(item.intent!);setDeleteError('');}}><IconTrash/>Delete saved input</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}
    </SidebarMenuItem>)}</SidebarMenu>
    {!entries.length&&!loading&&!pending&&!error&&!failed&&<p className="px-3 py-4 text-sm text-muted-foreground">{query?'No matching sessions':'No sessions yet'}</p>}
    {(loading||pending)&&<p role="status" className="px-3 text-sm text-muted-foreground">Loading sessions…</p>}
    {(cursors.length>0||intentCursors.length>0)&&<Button variant="ghost" disabled={loading||disabled} onClick={()=>void more()}>Load more sessions</Button>}
    <Dialog open={Boolean(deleting)} onOpenChange={open=>{if(!open&&!deleteBusy)setDeleting(null);}}><DialogContent showCloseButton={!deleteBusy} onCloseAutoFocus={event=>{const target=deleteOpener.current?.isConnected ? deleteOpener.current:searchButton.current;if(target?.isConnected){event.preventDefault();target.focus();}}}><DialogHeader><DialogTitle>Delete saved video input</DialogTitle><DialogDescription>This permanently removes the saved prompt and settings. It does not cancel the generation, delete its result, or refund charges.</DialogDescription></DialogHeader><p className="break-words text-sm">{deleting?.title}</p>{deleteError&&<p role="alert" className="text-sm text-destructive">{deleteError}</p>}<DialogFooter><Button variant="outline" onClick={()=>setDeleting(null)} disabled={deleteBusy}>Cancel</Button><Button variant="destructive" onClick={()=>void eraseInput()} disabled={deleteBusy}>{deleteBusy?'Deleting…':'Delete input'}</Button></DialogFooter></DialogContent></Dialog>
  </>;
}
