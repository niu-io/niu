import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { useEffect, useMemo, useState, useRef, type ReactNode } from 'react';
import { Link } from 'react-router';
import { IconMessageChatbot, IconVideo, IconSearch } from '@tabler/icons-react';
import { SidebarMenu, SidebarMenuItem, SidebarMenuButton, useSidebar } from '@/components/ui/sidebar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { DashboardContext } from '@/app/dashboard-context';
import { keyRequest, projectKeyPath, type ProjectKey } from '@/features/keys/api';
import type { VideoJobHistory } from '../../../../../sdks/javascript/src/index';

type Chat = {id:string;title?:string;prompt:string;createdAt:number};
type Video = VideoJobHistory['data'][number] & {keyId:string;workspaceId?:string};
export default function SessionHistory({context,chats, activeChat, onChat, chatActions, videos, videoKeyId, currentKeys, activeVideo, pending=false, failed=false, disabled=false}: {
  context:DashboardContext; chats?:Chat[]; activeChat?:string|null; onChat?:(id:string)=>void; chatActions?:(id:string)=>ReactNode;
  currentKeys?:Array<{id:string;revoked:boolean;expired:boolean}>;videoKeyId?:string;videos?:Video[]; activeVideo?:string; disabled?:boolean;pending?:boolean;failed?:boolean;
}) {
  const {token,workspace}=context;
  const {isMobile,setOpenMobile}=useSidebar();
  const identity=useRef('');
  identity.current=JSON.stringify([token,workspace?.id]);
  const [savedChats,setSavedChats]=useState<Array<Chat & {workspaceId:string}>>([]);
  const [savedVideos,setSavedVideos]=useState<Video[]>([]);
  const [query,setQuery]=useState('');
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  const [revision,setRevision]=useState(0);
  const [cursors,setCursors]=useState<Array<{keyId:string;before:string;scope:string;workspaceId:string}>>([]);
  const scope=workspace ? `/admin/v1/organizations/${workspace.organization_id}/projects/${workspace.id}` : '';
  useEffect(()=>{
    const controller=new AbortController();setSavedChats([]);setSavedVideos([]);setCursors([]);setError('');
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
      const next:Array<{keyId:string;before:string;scope:string;workspaceId:string}>=[];
      const pending=Array.from({length:Math.min(4,queue.length)},async()=>{
        while(queue.length && !controller.signal.aborted){
          const item=queue.shift()!;
          const currentScope=`/admin/v1/organizations/${item.organization_id}/projects/${item.id}`;
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
      if(!controller.signal.aborted){setSavedChats(chatRows);setSavedVideos(videoRows);setCursors(next);}
      if(!controller.signal.aborted && (failedRead||outcomes.some(item=>item.status==='rejected')))setError('Some sessions could not be loaded.');
    })().finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[token,scope,chats===undefined,revision,JSON.stringify(context.workspaces?.map(item=>item.id)),JSON.stringify(currentKeys),videoKeyId]);
  const entries=useMemo(()=>{
    const merged=new Map(savedVideos.map(item=>[item.id,item]));
    for(const item of videos??[])merged.set(item.id,{...item,workspaceId:workspace?.id});
    return [
      ...[...savedChats,...(chats??[]).map(item=>({...item,workspaceId:workspace?.id??''}))].map(item=>({id:item.id,type:'chat' as const,workspaceId:item.workspaceId,title:item.title||item.prompt.split('\n')[0]||'Chat session',created:item.createdAt,href:`/generations?workspace=${encodeURIComponent(item.workspaceId??'')}&session=${encodeURIComponent(item.id)}`})),
      ...[...merged.values()].map(item=>({id:item.id,type:'video' as const,workspaceId:item.workspaceId,title:`Video · ${item.model}`,created:Number(item.created_at_ms),href:`/generations?mode=video&workspace=${encodeURIComponent(item.workspaceId??'')}&key=${encodeURIComponent(item.keyId)}&job=${encodeURIComponent(item.id)}`})),
    ].filter(item=>item.title.toLowerCase().includes(query.trim().toLowerCase())).sort((a,b)=>b.created-a.created||a.id.localeCompare(b.id));
  },[chats,savedChats,savedVideos,videos,workspace?.id,query]);
  async function more(){
    if(loading||!cursors.length)return;setLoading(true);setError('');
    const currentIdentity=identity.current;
    try{
      const next:Array<{keyId:string;before:string;scope:string;workspaceId:string}>=[];const rows:Video[]=[];
      // Sequential page reads bound both concurrency and retained response memory.
      for(const cursor of cursors){
        const page=await keyRequest<VideoJobHistory>(token,`${cursor.scope}/keys/${cursor.keyId}/video/jobs?limit=25&before=${encodeURIComponent(cursor.before)}`,'GET');
        rows.push(...page.data.map(item=>({...item,keyId:cursor.keyId,workspaceId:cursor.workspaceId})));
        if(page.has_more&&page.next_before)next.push({...cursor,before:page.next_before});
      }
      if(currentIdentity!==identity.current)return;
      setSavedVideos(current=>[...current,...rows]);setCursors(next);
    }catch{if(currentIdentity===identity.current)setError('Could not load more sessions.');}finally{if(currentIdentity===identity.current)setLoading(false);}
  }
  return <>
    <Popover><PopoverTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label="Search sessions" title="Search sessions" className={query ? "text-primary bg-accent" : undefined}><IconSearch size={17}/></Button></PopoverTrigger><PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] space-y-2"><Input autoFocus aria-label="Search sessions" placeholder="Search sessions" value={query} onChange={event=>setQuery(event.target.value)}/>{query && <Button variant="ghost" size="sm" onClick={()=>setQuery('')}>Reset search</Button>}</PopoverContent></Popover>
    {error&&<div className="px-3"><p role="alert" className="text-sm text-destructive">{error}</p><Button variant="ghost" size="sm" onClick={()=>setRevision(value=>value+1)}>Retry sessions</Button></div>}
    <SidebarMenu aria-label="Generation sessions">{entries.map(item=><SidebarMenuItem key={`${item.type}:${item.id}`}>
      {item.type==='chat'&&item.workspaceId===workspace?.id&&onChat ? <SidebarMenuButton disabled={disabled} isActive={activeChat===item.id} onClick={()=>onChat(item.id)} title={item.title}><IconMessageChatbot/><span>{item.title}</span></SidebarMenuButton> : <SidebarMenuButton asChild isActive={item.type==='video'&&activeVideo===item.id} disabled={disabled}><Link to={item.href} onClick={()=>{if(isMobile)setOpenMobile(false);}}><>{item.type==='chat'?<IconMessageChatbot/>:<IconVideo/>}<span>{item.title}</span></></Link></SidebarMenuButton>}
      {item.type==='chat'&&item.workspaceId===workspace?.id&&chatActions&&chatActions(item.id)}
    </SidebarMenuItem>)}</SidebarMenu>
    {!entries.length&&!loading&&!pending&&!error&&!failed&&<p className="px-3 py-4 text-sm text-muted-foreground">{query?'No matching sessions':'No sessions yet'}</p>}
    {(loading||pending)&&<p role="status" className="px-3 text-sm text-muted-foreground">Loading sessions…</p>}
    {cursors.length>0&&<Button variant="ghost" disabled={loading||disabled} onClick={()=>void more()}>Load more sessions</Button>}
  </>;
}
