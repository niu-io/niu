import { translateUI } from '@/shell/ui-locale';
import { readLocale as readUILocale } from '@/shell/ui-locale';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { workspacePathSegment } from '@/shell/workspace-route';
import { IconSearch, IconSearchOff, IconChevronDown, IconDots, IconPhoto, IconVideo, IconMusic, IconUpload } from '@tabler/icons-react';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { useDashboardContext } from '@/shell/dashboard-context';
import PageHeader from '@/components/PageHeader';
import { FormSectionSkeleton, TableSkeleton } from '@/components/PageSkeletons';
import { fetchQuery, invalidateQueries, peekQuery } from '@/lib/query-cache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { NiuAdminClient, type TenantScope } from '@niu-io/sdk/admin';
import { NiuAPIError } from '@niu-io/sdk';
import type { WorkspaceAsset, WorkspaceAssetKind, WorkspaceAssetPage } from '@niu-io/sdk/workspace-assets';

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
  const { t: uiT } = useUILocale();
  const {token, workspace, session, workspaces} = useDashboardContext();
  if (!token || !workspace) return <><PageHeader title={uiT("Library")}/><p>{uiT("Select a workspace to see saved media.")}</p></>;
  return <WorkspaceLibrary key={`${token}:${workspace.id}:${session?.permissions.write}`} token={token} scope={{organizationId:workspace.organization_id,projectId:workspace.id}} canWrite={!!session?.permissions.write} workspaceSlug={workspacePathSegment(workspace,workspaces??[workspace])}/>;
}
export function WorkspaceLibrary({token,scope,canWrite,workspaceSlug}:{token:string;scope:TenantScope;canWrite:boolean;workspaceSlug?:string}) {
  const { t: uiT, format: uiF } = useUILocale();
  const client=useMemo(()=>new NiuAdminClient({baseURL:`${window.location.origin}/api/v1`,adminToken:token}),[token]);
  const [kind,setKind]=useState<keyof typeof kinds>('all'), [query,setQuery]=useState('');
  const cacheKey=`library:${scope.organizationId}:${scope.projectId}:${kind}`;
  // Cached pages are optional hydration; a failed refresh is surfaced below.
  const initialPage=(()=>{try{const c=peekQuery<WorkspaceAssetPage>(token||'public',cacheKey);return c?checkedPage(c):null;}catch{return null;}})();
  const [assets,setAssets]=useState<WorkspaceAsset[]>(()=>initialPage?.data??[]);
  const [cursor,setCursor]=useState<string|null>(()=>initialPage?.next_cursor??null), [loading,setLoading]=useState(()=>!initialPage), [loadingMore,setLoadingMore]=useState(false), [error,setError]=useState(''), [moreError,setMoreError]=useState(''), [notice,setNotice]=useState(''), [revision,setRevision]=useState(0);
  const [selected,setSelected]=useState<{asset:WorkspaceAsset;action:'preview'|'rename'|'delete'}|null>(null), [name,setName]=useState(''), [busy,setBusy]=useState(false), [actionError,setActionError]=useState('');
  const [uploading,setUploading]=useState(false);
  const uploadInput=useRef<HTMLInputElement|null>(null);
  const [preview,setPreview]=useState(''), [previewLoading,setPreviewLoading]=useState(false);
  const menuButtons=useRef(new Map<string,HTMLButtonElement>()), searchButton=useRef<HTMLButtonElement|null>(null);
  const moreRequest=useRef<AbortController|null>(null), mutation=useRef<AbortController|null>(null), opener=useRef<HTMLElement|null>(null), active=useRef(true);
  const lastRevision=useRef(0);
  useEffect(()=>{active.current=true;return()=>{active.current=false;moreRequest.current?.abort();mutation.current?.abort();};},[]);
  useEffect(()=>{
    const request=new AbortController(); moreRequest.current?.abort();
    const force=lastRevision.current!==revision; lastRevision.current=revision;
    // A corrupt cache entry is ignored; the fetch below replaces it or reports the failure.
    const cached=!force?(()=>{try{const c=peekQuery<WorkspaceAssetPage>(token||'public',cacheKey);return c?checkedPage(c):null;}catch{return null;}})():null;
    if(cached){setAssets(cached.data);setCursor(cached.next_cursor);}
    else if(force){setAssets([]);setCursor(null);}
    setLoading(!cached);setError('');setMoreError('');setLoadingMore(false);
    void fetchQuery<WorkspaceAssetPage>(
      token||'public',
      cacheKey,
      async signal=>checkedPage(await client.listWorkspaceAssets(scope,{...(kind==='all'?{}:{kind:kind as WorkspaceAssetKind}),limit:50},{signal})),
      {signal:request.signal,force,awaitRevalidate:true},
    )
      .then(page=>{if(!request.signal.aborted){setAssets(page.data);setCursor(page.next_cursor);}})
      .catch(()=>{invalidateQueries(key=>key.startsWith(`${token||'public'}::${cacheKey}`));if(!request.signal.aborted){setAssets([]);setCursor(null);setError('The workspace library could not be loaded. Check your access and try again.');}})
      .finally(()=>{if(!request.signal.aborted)setLoading(false);});
    return()=>request.abort();
  },[client,token,cacheKey,scope.organizationId,scope.projectId,kind,revision]);
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
        invalidateQueries(key=>key.startsWith(`${token||'public'}::library:${scope.organizationId}:${scope.projectId}:`));
        if(!active.current||request.signal.aborted)return;
        setAssets(old=>old.map(asset=>asset.id===result.data.id?result.data:asset));setNotice('File renamed.');
      }else if(selected.action==='delete'){
        await client.deleteWorkspaceAsset(scope,selected.asset.id,selected.asset.revision,{signal:request.signal});
        invalidateQueries(key=>key.startsWith(`${token||'public'}::library:${scope.organizationId}:${scope.projectId}:`));
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
  async function uploadFiles(files:FileList|null){
    if(!files?.length||!canWrite||uploading||busy)return;
    setUploading(true);setError('');setNotice('');
    try{
      for(const file of Array.from(files)){
        if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size<1||file.size>8*1024*1024){
          throw new Error(uiT('Choose a PNG, JPEG or WebP image up to 8 MiB.', '请选择 8 MiB 以内的 PNG、JPEG 或 WebP 图片。'));
        }
        const bytes=new Uint8Array(await file.arrayBuffer());
        await client.uploadWorkspaceAsset(scope,{name:file.name,contentType:file.type,bytes});
      }
      invalidateQueries(key=>key.startsWith(`${token||'public'}::library:${scope.organizationId}:${scope.projectId}:`));
      if(active.current){setNotice(uiT('File uploaded to workspace.', '文件已上传至工作空间。'));setRevision(value=>value+1);}
    }catch(cause){
      if(active.current)setError(cause instanceof Error?cause.message:uiT('The image could not be uploaded.', '图片上传失败。'));
    }finally{
      if(active.current){setUploading(false);if(uploadInput.current)uploadInput.current.value='';}
    }
  }
  const visible=assets.filter(asset=>asset.name.toLowerCase().includes(query.trim().toLowerCase()));
  return <section className="empty-region space-y-4">
    <p className="text-sm text-muted-foreground">{uiT("Media saved in this workspace, accessible to its members. Saved copies remain available independently of the Provider’s temporary download links, until deleted.")}</p>
    <div className="flex flex-wrap items-center gap-2">
      <Input ref={uploadInput} type="file" className="hidden" aria-label={uiT("Upload workspace reference image", "上传工作空间参考图")} accept="image/png,image/jpeg,image/webp" multiple onChange={event=>void uploadFiles(event.target.files)} disabled={!canWrite||uploading||busy}/>
      <Popover><PopoverTrigger asChild><Button ref={searchButton} variant={query?'secondary':'outline'} size="icon" aria-label={query?uiF("Search library: {0}", [query]):uiT("Search library")}><IconSearch size={18}/></Button></PopoverTrigger><PopoverContent align="start"><Label htmlFor="library-search">{uiT("Search loaded files")}</Label><Input id="library-search" value={query} onChange={event=>setQuery(event.target.value)} placeholder={uiT("File name…")}/></PopoverContent></Popover>
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline">{translateUI(kinds[kind])}<IconChevronDown size={16}/></Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuRadioGroup value={kind} onValueChange={value=>setKind(value as keyof typeof kinds)}>{Object.entries(kinds).map(([value,label])=><DropdownMenuRadioItem key={value} value={value}>{translateUI(label)}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
      <Button variant="outline" disabled={loading} onClick={()=>setRevision(value=>value+1)}>{uiT("Refresh")}</Button>
      {canWrite&&<Button variant="outline" disabled={uploading||busy} onClick={()=>uploadInput.current?.click()}><IconUpload size={16}/>{uploading?uiT("Saving image…"):uiT("Attach image")}</Button>}
      {query&&<Button className="min-w-0 max-w-full" variant="ghost" onClick={()=>setQuery('')}>{uiT("Clear search:")}{" "}<span className="truncate">{query}</span></Button>}
    </div>
    {notice&&<p role="status">{notice}</p>}
    {loading&&!assets.length&&!error?<TableSkeleton columns={5} rows={5} label={uiT("Loading library…")}/>:error?<div role="alert"><p>{error}</p><Button variant="outline" onClick={()=>setRevision(value=>value+1)}>{uiT("Retry library")}</Button></div>:<>
      {!visible.length?<Empty className="min-h-64"><EmptyHeader><EmptyMedia variant="icon">{query?<IconSearchOff aria-hidden="true" />:<IconPhoto aria-hidden="true" />}</EmptyMedia><EmptyTitle>{query?uiT("No matching loaded files"):uiT("No saved media yet")}</EmptyTitle><EmptyDescription>{query?uiT("Try another name or load more files."):uiT("Use Save to workspace on a generation result to keep a copy here.")}</EmptyDescription></EmptyHeader>{(query||canWrite)&&<EmptyContent className="flex-row flex-wrap justify-center gap-2">{query?<Button variant="outline" onClick={()=>{setQuery('');searchButton.current?.focus();}}>{uiT("Clear search")}</Button>:<Button variant="outline" disabled={uploading||busy} onClick={()=>uploadInput.current?.click()}><IconUpload size={16}/>{uploading?uiT("Saving image…"):uiT("Attach image")}</Button>}</EmptyContent>}</Empty>:<Table className="table-fixed"><TableHeader><TableRow><TableHead>{uiT("File")}</TableHead><TableHead className="w-24 sm:w-28">{uiT("Type")}</TableHead><TableHead className="w-24 text-right sm:w-28">{uiT("Size", "大小")}</TableHead><TableHead className="hidden w-36 sm:table-cell">{uiT("Saved")}</TableHead><TableHead className="w-12 text-right"><span className="sr-only">{uiT("Actions")}</span></TableHead></TableRow></TableHeader><TableBody>{visible.map(asset=>{
        const Icon=asset.media_kind==='video'?IconVideo:asset.media_kind==='audio'?IconMusic:IconPhoto;
        const kindLabel=asset.media_kind==='video'?uiT("Video"):asset.media_kind==='audio'?uiT("Audio"):uiT("Image");
        return <TableRow key={asset.id}><TableCell className="whitespace-normal"><Button variant="link" className="h-auto max-w-full justify-start gap-2 p-0 has-[>svg]:px-0 text-left font-medium whitespace-normal" onClick={event=>open(asset,'preview',event.currentTarget)}><Icon className="size-4 shrink-0 text-muted-foreground"/><span className="min-w-0 [overflow-wrap:anywhere]">{asset.name||uiT("Untitled file")}</span></Button></TableCell><TableCell className="text-sm text-muted-foreground">{kindLabel}</TableCell><TableCell className="text-right text-sm tabular-nums text-muted-foreground">{size(asset.byte_length)}</TableCell><TableCell className="hidden text-sm text-muted-foreground sm:table-cell">{new Intl.DateTimeFormat(readUILocale(), { dateStyle: 'medium' }).format(new Date(asset.created_at_ms))}</TableCell><TableCell className="text-right"><DropdownMenu><DropdownMenuTrigger asChild><Button ref={element=>{if(element)menuButtons.current.set(asset.id,element);else menuButtons.current.delete(asset.id);}} size="icon" variant="ghost" aria-label={uiF("Actions for {0}", [asset.name||uiT("file")])}><IconDots size={18}/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={()=>open(asset,'preview')}>{uiT("Preview and download")}</DropdownMenuItem><DropdownMenuItem disabled={!canWrite} onSelect={()=>open(asset,'rename')}>{uiT("Rename")}</DropdownMenuItem><DropdownMenuItem disabled={!canWrite} onSelect={()=>open(asset,'delete')}>{uiT("Delete workspace copy")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell></TableRow>;
      })}</TableBody></Table>}
      {(Boolean(cursor) || assets.length > 1) && <p className="text-xs text-muted-foreground">{assets.length === 1 ? uiT("1 file loaded") : uiF("{0} files loaded", [assets.length.toLocaleString(readUILocale())])}{cursor?uiT("· Search covers loaded files only."):''}</p>}
      {moreError&&<p role="alert">{moreError}</p>}{cursor&&<Button variant="outline" disabled={loadingMore} onClick={()=>void more()}>{loadingMore?uiT("Loading…"):moreError?uiT("Retry loading more"):uiT("Load more files")}</Button>}
    </>}
    <Dialog open={!!selected} onOpenChange={value=>{if(!value&&!busy)setSelected(null);}}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" onCloseAutoFocus={event=>{event.preventDefault();(opener.current?.isConnected?opener.current:searchButton.current)?.focus();}}><DialogHeader className="text-left"><DialogTitle className="min-w-0 pr-6 [overflow-wrap:anywhere]">{selected?.action==='rename'?uiT("Rename file"):selected?.action==='delete'?uiT("Delete workspace copy"):selected?.asset.name||uiT("Saved file")}</DialogTitle><DialogDescription>{selected?.action==='delete'?uiT("This permanently removes the saved copy from this workspace. It does not delete the source generation or its Provider copy."):selected?.action==='rename'?uiT("Change the display name without changing the saved file."):uiT("Saved workspace copy. Downloading does not contact the upstream Provider.")}</DialogDescription></DialogHeader>
      {selected?.action==='preview'&&<p className="text-sm text-muted-foreground">{size(selected.asset.byte_length)}{" "}{uiT("· Saved")}{" "}{new Date(selected.asset.created_at_ms).toLocaleString(readUILocale())}</p>}{actionError&&<div role="alert"><p>{actionError}</p>{selected?.action==='preview'&&<Button variant="outline" onClick={()=>setSelected({...selected})}>{uiT("Retry preview")}</Button>}</div>}
      {selected?.action==='preview'&&workspaceSlug&&selected.asset.source&&/^run-[1-9][0-9]{0,18}$/.test(selected.asset.source.reference)&&<Button asChild variant="outline" className="justify-self-start"><Link to={`/generations?workspace=${encodeURIComponent(workspaceSlug)}&job=${encodeURIComponent(selected.asset.source.reference)}`}>{uiT("View original generation")}</Link></Button>}
      {selected?.action==='preview'?<>{previewLoading&&<FormSectionSkeleton fields={1} label={uiT("Loading saved file…")}/>}{preview&&<>{selected.asset.media_kind==='image'?<img onError={()=>setActionError('This file cannot be previewed in this browser. You can still download the saved copy.')} className="max-h-[55dvh] w-full object-contain" src={preview} alt={selected.asset.name}/>:selected.asset.media_kind==='video'?<video onError={()=>setActionError('This file cannot be previewed in this browser. You can still download the saved copy.')} className="max-h-[55dvh] w-full" src={preview} controls/>:<audio onError={()=>setActionError('This file cannot be previewed in this browser. You can still download the saved copy.')} className="w-full" src={preview} controls/>}<Button asChild><a href={preview} download={selected.asset.name}>{uiT("Download file")}</a></Button></>}</>:selected&&<form onSubmit={event=>{event.preventDefault();void save();}} className="space-y-4">{selected.action==='rename'?<div className="space-y-2"><Label htmlFor="library-name">{uiT("File name")}</Label><Input id="library-name" value={name} maxLength={200} disabled={busy} onChange={event=>setName(event.target.value)}/></div>:<p className="break-words font-medium">{selected.asset.name}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={()=>setSelected(null)}>{uiT("Cancel")}</Button><Button type="submit" variant={selected.action==='delete'?'destructive':'default'} disabled={busy||!canWrite||(selected.action==='rename'&&!name.trim())}>{busy?uiT("Saving…"):selected.action==='delete'?uiT("Delete copy"):uiT("Save name")}</Button></div></form>}
    </DialogContent></Dialog>
  </section>;
}
