import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { workspacePathSegment } from '@/app/workspace-route';
import { IconSearch, IconChevronDown, IconDots, IconPhoto, IconVideo, IconMusic } from '@tabler/icons-react';
import { useDashboardContext } from '@/app/dashboard-context';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { NiuAdminClient, type TenantScope } from '../../../../../sdks/javascript/src/admin';
import { NiuAPIError } from '../../../../../sdks/javascript/src/index';
import type { WorkspaceAsset, WorkspaceAssetKind, WorkspaceAssetPage } from '../../../../../sdks/javascript/src/workspace-assets';

const kinds = {all:'All media',image:'Images',video:'Videos',audio:'Audio'};
function checkedPage(page:WorkspaceAssetPage) {
  if(!page || !Array.isArray(page.data) || (page.next_cursor!==null && (typeof page.next_cursor!=='string' || !page.next_cursor))) throw new Error('Invalid library page');
  for(const asset of page.data) {
    if(!asset || typeof asset.id!=='string' || !asset.id || typeof asset.name!=='string' || !['image','video','audio'].includes(asset.media_kind) || typeof asset.content_type!=='string' || !Number.isSafeInteger(asset.byte_length) || asset.byte_length<0 || !Number.isFinite(asset.created_at_ms) || typeof asset.revision!=='string' || !asset.revision) throw new Error('Invalid library file');
  }
  return page;
}
const size = (bytes:number) => bytes < 1024 * 1024 ? `${Math.ceil(bytes/1024)} KB` : `${(bytes/1024/1024).toFixed(1)} MB`;
export default function LibraryRoute() {
  const {token, workspace, session, workspaces} = useDashboardContext();
  if (!token || !workspace) return <><PageHeader title="Library"/><p>Select a workspace to see saved media.</p></>;
  return <WorkspaceLibrary key={`${token}:${workspace.id}:${session?.permissions.write}`} token={token} scope={{organizationId:workspace.organization_id,projectId:workspace.id}} canWrite={!!session?.permissions.write} workspaceSlug={workspacePathSegment(workspace,workspaces??[workspace])}/>;
}
export function WorkspaceLibrary({token,scope,canWrite,workspaceSlug}:{token:string;scope:TenantScope;canWrite:boolean;workspaceSlug?:string}) {
  const client=useMemo(()=>new NiuAdminClient({baseURL:`${window.location.origin}/api/v1`,adminToken:token}),[token]);
  const [assets,setAssets]=useState<WorkspaceAsset[]>([]), [kind,setKind]=useState<keyof typeof kinds>('all'), [query,setQuery]=useState('');
  const [cursor,setCursor]=useState<string|null>(null), [loading,setLoading]=useState(true), [loadingMore,setLoadingMore]=useState(false), [error,setError]=useState(''), [moreError,setMoreError]=useState(''), [notice,setNotice]=useState(''), [revision,setRevision]=useState(0);
  const [selected,setSelected]=useState<{asset:WorkspaceAsset;action:'preview'|'rename'|'delete'}|null>(null), [name,setName]=useState(''), [busy,setBusy]=useState(false), [actionError,setActionError]=useState('');
  const [preview,setPreview]=useState(''), [previewLoading,setPreviewLoading]=useState(false);
  const menuButtons=useRef(new Map<string,HTMLButtonElement>()), searchButton=useRef<HTMLButtonElement|null>(null);
  const moreRequest=useRef<AbortController|null>(null), mutation=useRef<AbortController|null>(null), opener=useRef<HTMLElement|null>(null), active=useRef(true);
  useEffect(()=>{active.current=true;return()=>{active.current=false;moreRequest.current?.abort();mutation.current?.abort();};},[]);
  useEffect(()=>{
    const request=new AbortController(); moreRequest.current?.abort(); setLoading(true);setAssets([]);setCursor(null);setError('');setMoreError('');setLoadingMore(false);
    void client.listWorkspaceAssets(scope,{...(kind==='all'?{}:{kind:kind as WorkspaceAssetKind}),limit:50},{signal:request.signal})
      .then(checkedPage).then(page=>{if(!request.signal.aborted){setAssets(page.data);setCursor(page.next_cursor);}})
      .catch(()=>{if(!request.signal.aborted)setError('The workspace library could not be loaded. Check your access and try again.');})
      .finally(()=>{if(!request.signal.aborted)setLoading(false);});
    return()=>request.abort();
  },[client,scope.organizationId,scope.projectId,kind,revision]);
  useEffect(()=>{
    setPreview('');setActionError('');
    if(selected?.action!=='preview')return;
    const request=new AbortController(); let url='';setPreviewLoading(true);
    void client.downloadWorkspaceAsset(scope,selected.asset.id,{signal:request.signal}).then(bytes=>{
      if(request.signal.aborted)return;
      url=URL.createObjectURL(new Blob([bytes],{type:selected.asset.content_type}));setPreview(url);
    }).catch(()=>{if(!request.signal.aborted)setActionError('This saved file could not be loaded. It may have been removed or your access may have changed.');})
      .finally(()=>{if(!request.signal.aborted)setPreviewLoading(false);});
    return()=>{request.abort();if(url)URL.revokeObjectURL(url);};
  },[client,scope.organizationId,scope.projectId,selected]);
  async function more(){
    if(!cursor||loadingMore)return;
    const after=cursor, request=new AbortController();moreRequest.current=request;setLoadingMore(true);setMoreError('');
    try{
      const page=checkedPage(await client.listWorkspaceAssets(scope,{...(kind==='all'?{}:{kind:kind as WorkspaceAssetKind}),limit:50,after},{signal:request.signal}));
      if(request.signal.aborted)return;
      if(page.next_cursor===after)throw new Error('Cursor did not advance');
      setAssets(old=>[...old,...page.data.filter(asset=>!old.some(item=>item.id===asset.id))]);setCursor(page.next_cursor);
    }catch{if(!request.signal.aborted)setMoreError('More files could not be loaded. Your current list is unchanged.');}
    finally{if(!request.signal.aborted)setLoadingMore(false);}
  }
  function open(asset:WorkspaceAsset,action:'preview'|'rename'|'delete',trigger?:HTMLElement){
    opener.current=trigger??menuButtons.current.get(asset.id)??(document.activeElement instanceof HTMLElement?document.activeElement:null);setActionError('');setName(asset.name);setSelected({asset,action});
  }
  async function save(){
    if(!selected||!canWrite||mutation.current)return;
    if(selected.action==='rename' && (new TextEncoder().encode(name.trim()).length>200 || /[\u0000-\u001f\u007f]/.test(name))) {setActionError('Use a shorter file name on one line.');return;}
    const request=new AbortController();mutation.current=request;setBusy(true);setActionError('');
    try{
      if(selected.action==='rename'){
        const result=await client.renameWorkspaceAsset(scope,selected.asset.id,{name:name.trim(),expected_revision:selected.asset.revision},{signal:request.signal});
        if(!active.current||request.signal.aborted)return;
        setAssets(old=>old.map(asset=>asset.id===result.data.id?result.data:asset));setNotice('File renamed.');
      }else if(selected.action==='delete'){
        await client.deleteWorkspaceAsset(scope,selected.asset.id,selected.asset.revision,{signal:request.signal});
        if(!active.current||request.signal.aborted)return;
        setNotice('Workspace copy deleted.');setRevision(value=>value+1);
      }
      setSelected(null);
    }catch(reason){if(active.current&&!request.signal.aborted){
      if(reason instanceof NiuAPIError && reason.status===400){setActionError('The file name was not accepted. Check the name and try again.');}
      else {setSelected(null);setNotice(reason instanceof NiuAPIError && reason.status===409?'This file changed since it was opened. Review the refreshed library before editing again.':'The change could not be confirmed. Review the refreshed library before trying again.');setRevision(value=>value+1);}
    }}
    finally{if(active.current){setBusy(false);mutation.current=null;}}
  }
  const visible=assets.filter(asset=>asset.name.toLowerCase().includes(query.trim().toLowerCase()));
  return <section className="space-y-4">
    <p className="text-sm text-muted-foreground">Media saved in this workspace, accessible to its members. Saved copies remain available independently of the Provider’s temporary download links, until deleted.</p>
    <div className="flex flex-wrap items-center gap-2">
      <Popover><PopoverTrigger asChild><Button ref={searchButton} variant={query?'secondary':'outline'} size="icon" aria-label={query?`Search library: ${query}`:'Search library'}><IconSearch size={18}/></Button></PopoverTrigger><PopoverContent align="start"><Label htmlFor="library-search">Search loaded files</Label><Input id="library-search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="File name…"/></PopoverContent></Popover>
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline">{kinds[kind]}<IconChevronDown size={16}/></Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuRadioGroup value={kind} onValueChange={value=>setKind(value as keyof typeof kinds)}>{Object.entries(kinds).map(([value,label])=><DropdownMenuRadioItem key={value} value={value}>{label}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
      <Button variant="outline" disabled={loading} onClick={()=>setRevision(value=>value+1)}>Refresh</Button>
      {query&&<Button className="min-w-0 max-w-full" variant="ghost" onClick={()=>setQuery('')}>Clear search: <span className="truncate">{query}</span></Button>}
    </div>
    {notice&&<p role="status">{notice}</p>}
    {loading?<p role="status">Loading library…</p>:error?<div role="alert"><p>{error}</p><Button variant="outline" onClick={()=>setRevision(value=>value+1)}>Retry library</Button></div>:<>
      {!visible.length?<div className="py-12 text-center"><h2 className="font-semibold">{query?'No matching loaded files':'No saved media yet'}</h2><p className="text-sm text-muted-foreground">{query?'Try another name or load more files.':'Use Save to workspace on a generation result to keep a copy here.'}</p></div>:<Table className="table-fixed"><TableHeader><TableRow><TableHead>File</TableHead><TableHead className="hidden w-36 sm:table-cell">Saved</TableHead><TableHead className="w-20"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader><TableBody>{visible.map(asset=>{
        const Icon=asset.media_kind==='video'?IconVideo:asset.media_kind==='audio'?IconMusic:IconPhoto;
        return <TableRow key={asset.id}><TableCell className="whitespace-normal"><Button variant="link" className="h-auto max-w-full justify-start gap-2 p-0 text-left whitespace-normal" onClick={event=>open(asset,'preview',event.currentTarget)}><Icon className="size-4 shrink-0"/><span className="min-w-0 [overflow-wrap:anywhere]">{asset.name||'Untitled file'}</span></Button><p className="text-xs text-muted-foreground">{asset.media_kind} · {size(asset.byte_length)}</p></TableCell><TableCell className="hidden text-sm sm:table-cell">{new Date(asset.created_at_ms).toLocaleDateString()}</TableCell><TableCell><DropdownMenu><DropdownMenuTrigger asChild><Button ref={element=>{if(element)menuButtons.current.set(asset.id,element);else menuButtons.current.delete(asset.id);}} size="icon" variant="ghost" aria-label={`Actions for ${asset.name||'file'}`}><IconDots size={18}/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={()=>open(asset,'preview')}>Preview and download</DropdownMenuItem><DropdownMenuItem disabled={!canWrite} onSelect={()=>open(asset,'rename')}>Rename</DropdownMenuItem><DropdownMenuItem disabled={!canWrite} onSelect={()=>open(asset,'delete')}>Delete workspace copy</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell></TableRow>;
      })}</TableBody></Table>}
      <p className="text-xs text-muted-foreground">{assets.length} files loaded{cursor?' · Search covers loaded files only.':''}</p>
      {moreError&&<p role="alert">{moreError}</p>}{cursor&&<Button variant="outline" disabled={loadingMore} onClick={()=>void more()}>{loadingMore?'Loading…':moreError?'Retry loading more':'Load more files'}</Button>}
    </>}
    <Dialog open={!!selected} onOpenChange={value=>{if(!value&&!busy)setSelected(null);}}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" onCloseAutoFocus={event=>{event.preventDefault();(opener.current?.isConnected?opener.current:searchButton.current)?.focus();}}><DialogHeader className="text-left"><DialogTitle className="min-w-0 pr-6 [overflow-wrap:anywhere]">{selected?.action==='rename'?'Rename file':selected?.action==='delete'?'Delete workspace copy':selected?.asset.name||'Saved file'}</DialogTitle><DialogDescription>{selected?.action==='delete'?'This permanently removes the saved copy from this workspace. It does not delete the source generation or its Provider copy.':selected?.action==='rename'?'Change the display name without changing the saved file.':'Saved workspace copy. Downloading does not contact the upstream Provider.'}</DialogDescription></DialogHeader>
      {selected?.action==='preview'&&<p className="text-sm text-muted-foreground">{size(selected.asset.byte_length)} · Saved {new Date(selected.asset.created_at_ms).toLocaleString()}</p>}{actionError&&<div role="alert"><p>{actionError}</p>{selected?.action==='preview'&&<Button variant="outline" onClick={()=>setSelected({...selected})}>Retry preview</Button>}</div>}
      {selected?.action==='preview'&&workspaceSlug&&selected.asset.source&&/^run-[1-9][0-9]{0,18}$/.test(selected.asset.source.reference)&&<Button asChild variant="outline" className="justify-self-start"><Link to={`/generations?workspace=${encodeURIComponent(workspaceSlug)}&job=${encodeURIComponent(selected.asset.source.reference)}`}>View original generation</Link></Button>}
      {selected?.action==='preview'?<>{previewLoading&&<p role="status">Loading saved file…</p>}{preview&&<>{selected.asset.media_kind==='image'?<img onError={()=>setActionError('This file cannot be previewed in this browser. You can still download the saved copy.')} className="max-h-[55dvh] w-full object-contain" src={preview} alt={selected.asset.name}/>:selected.asset.media_kind==='video'?<video onError={()=>setActionError('This file cannot be previewed in this browser. You can still download the saved copy.')} className="max-h-[55dvh] w-full" src={preview} controls/>:<audio onError={()=>setActionError('This file cannot be previewed in this browser. You can still download the saved copy.')} className="w-full" src={preview} controls/>}<Button asChild><a href={preview} download={selected.asset.name}>Download file</a></Button></>}</>:selected&&<form onSubmit={event=>{event.preventDefault();void save();}} className="space-y-4">{selected.action==='rename'?<div className="space-y-2"><Label htmlFor="library-name">File name</Label><Input id="library-name" value={name} maxLength={200} disabled={busy} onChange={event=>setName(event.target.value)}/></div>:<p className="break-words font-medium">{selected.asset.name}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={()=>setSelected(null)}>Cancel</Button><Button type="submit" variant={selected.action==='delete'?'destructive':'default'} disabled={busy||!canWrite||(selected.action==='rename'&&!name.trim())}>{busy?'Saving…':selected.action==='delete'?'Delete copy':'Save name'}</Button></div></form>}
    </DialogContent></Dialog>
  </section>;
}
