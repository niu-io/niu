import { readLocale as readUILocale } from '@/shell/ui-locale';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useEffect, useRef, useState } from 'react';
import { IconPaperclip, IconX, IconChevronDown, IconLoader2, IconPhoto } from '@tabler/icons-react';
import type { VideoModel } from '@niu-io/sdk';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {NiuAdminClient,type TenantScope} from '@niu-io/sdk/admin';
import type {WorkspaceAsset} from '@niu-io/sdk/workspace-assets';
import {NiuAPIError} from '@niu-io/sdk';
import { DropdownMenuItem, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import type { ImageReference,SavedVideoReferences } from './request';
export type NamedImageReference = ImageReference & { name: string };

/** Pending request attachments. Saved video data remains owned by the backend. */
export type ImageReferencesProps={model:VideoModel;images:NamedImageReference[];onChange:(images:NamedImageReference[])=>void;disabled:boolean;onReadingChange?:(reading:boolean,failed?:boolean)=>void;client?:NiuAdminClient;scope?:TenantScope;references?:SavedVideoReferences;onReferencesChange?:(references:SavedVideoReferences)=>void};
export default function ImageReferences(props:ImageReferencesProps) {
  const { t: uiT } = useUILocale();
  if(props.model.workspace_asset){
    if(!props.client||!props.scope||!props.references||!props.onReferencesChange)return <p className="video-muted">{uiT("Saved image attachments are not configured for this workspace.")}</p>;
    return <SavedImageReferences {...props} client={props.client} scope={props.scope} references={props.references} onReferencesChange={props.onReferencesChange}/>;
  }
  return <InlineImageReferences {...props}/>;
}
function InlineImageReferences({model,images,onChange,disabled,onReadingChange}:ImageReferencesProps) {
  const { t: uiT, format: uiF } = useUILocale();
  const input=useRef<HTMLInputElement>(null);
  const sequence=useRef(0);
  const current=useRef({model,images,disabled,onReadingChange}); current.current={model,images,disabled,onReadingChange};
  const readers=useRef(new Set<FileReader>());
  const [reading,setReading]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{
    setReading(false);setError('');
    return()=>{
      ++sequence.current;
      for(const reader of readers.current)reader.abort();
      readers.current.clear();
      current.current.onReadingChange?.(false);
    };
  },[model]);
  const rule=model.image_url;
  if (!rule) return null;
  async function attach(files:FileList|null) {
    if (!files?.length || !rule || disabled || reading) return;
    const ticket=++sequence.current; const selectedModel=model; const selectedImages=images;
    setReading(true);onReadingChange?.(true);setError('');
    let failed=false;
    try {
      if (files.length+images.length > rule.maximum_items) throw new Error(`Choose up to ${rule.maximum_items} reference images.`);
      const added:NamedImageReference[]=[];
      for (const file of Array.from(files)) {
        if (!rule.data_mime_types.some(mime=>mime === file.type)) throw new Error('Choose a supported PNG, JPEG or WebP image.');
        if (Math.ceil(file.size/3)*4+`data:${file.type};base64,`.length > rule.maximum_bytes) throw new Error(`${file.name} exceeds the reference size limit.`);
        const url=await new Promise<string>((resolve,reject)=>{
          const reader=new FileReader();readers.current.add(reader);
          reader.onload=()=>{readers.current.delete(reader);resolve(String(reader.result));};
          reader.onerror=()=>{readers.current.delete(reader);reject(new Error('Could not read the image.'));};
          reader.onabort=()=>{readers.current.delete(reader);reject(new Error('Image reading cancelled.'));};
          reader.readAsDataURL(file);
        });
        added.push({name:file.name,url});
      }
      if(ticket === sequence.current && current.current.model === selectedModel && current.current.images === selectedImages && !current.current.disabled) onChange([...images,...added]);
    } catch(error) {failed=true;if(ticket === sequence.current && current.current.model === selectedModel)setError(error instanceof Error ? error.message:'Could not attach the image.');}
    finally {if(ticket === sequence.current){setReading(false);onReadingChange?.(false,failed);}if(input.current)input.current.value='';}
  }
  return <div className="video-references">
    <Input ref={input} type="file" className="hidden" aria-label={uiT("Upload video reference images")} multiple={rule.maximum_items>1} accept={rule.data_mime_types.join(',')} onChange={event=>void attach(event.target.files)} disabled={disabled || reading}/>
    {images.map((image,index)=><div className="video-reference" key={index}>
      <img src={image.url} alt=""/><span className="video-reference-name">{image.name}</span>
      {rule.roles.length>0 && <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" aria-label={uiF("Role for {0}", [image.name])} disabled={disabled || reading}>{image.role ? image.role.replaceAll('_',' '):uiT("Choose role")}<IconChevronDown size={14}/></Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuRadioGroup value={image.role ?? ''} onValueChange={role=>onChange(images.map((item,i)=>i === index ? {...item,role}:item))}>{!rule.role_required && <DropdownMenuRadioItem value="">{uiT("No role")}</DropdownMenuRadioItem>}{rule.roles.map(role=><DropdownMenuRadioItem key={role} value={role}>{role.replaceAll('_',' ')}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>}
      <Button type="button" variant="ghost" size="icon" aria-label={uiF("Remove {0}", [image.name])} disabled={disabled || reading} onClick={()=>onChange(images.filter((_,i)=>i !== index))}><IconX size={16}/></Button>
    </div>)}
    <Button type="button" variant="ghost" onClick={()=>input.current?.click()} disabled={disabled || reading || images.length>=rule.maximum_items}><IconPaperclip size={16}/>{reading ? uiT("Reading image…"):uiT("Attach image")}</Button>
    {error && <p role="alert" className="video-error">{uiT(error)}</p>}
  </div>;
}

type SavedProps=ImageReferencesProps&{client:NiuAdminClient;scope:TenantScope;references:SavedVideoReferences;onReferencesChange:(references:SavedVideoReferences)=>void};
/** Use the first unused schema role; a required role falls back to the first. */
function defaultImageRole(roles:string[],used:readonly string[],required:boolean):string|undefined{
 if(!roles.length)return undefined;
 const unused=roles.find(role=>!used.includes(role));
 if(unused)return unused;
 return required?roles[0]:undefined;
}
/**
 * Upload storage, model-processing consent and role selection stay separate.
 * Adding an image is the single processing-consent action; the saved request
 * still carries explicit `consent_to_process: true`, which the server validates.
 */
function SavedImageReferences({model,client,scope,references,onReferencesChange,disabled,onReadingChange}:SavedProps){
 const { t: uiT, format: uiF } = useUILocale();
 const input=useRef<HTMLInputElement>(null);
 const [uploading,setUploading]=useState(false),[uploadFailed,setUploadFailed]=useState(false),[progress,setProgress]=useState<{done:number;total:number}|null>(null),[uncertain,setUncertain]=useState(false),[error,setError]=useState('');
 const [metadata,setMetadata]=useState<Record<string,WorkspaceAsset>>({}),[metadataErrors,setMetadataErrors]=useState<Record<string,string>>({});
 const [library,setLibrary]=useState<WorkspaceAsset[]>([]),[libraryLoading,setLibraryLoading]=useState(false),[libraryOpen,setLibraryOpen]=useState(false);
 const [previews,setPreviews]=useState<Record<string,string>>({}),[previewErrors,setPreviewErrors]=useState<Record<string,string>>({}),[previewing,setPreviewing]=useState<Record<string,boolean>>({});
 const sequence=useRef(0),requests=useRef(new Set<AbortController>()),urls=useRef(new Set<string>()),previewingIds=useRef(new Set<string>());
 const current=useRef({references,onReferencesChange,disabled});current.current={references,onReferencesChange,disabled};
 const latest=useRef(references);latest.current=references;
 const metadataCurrent=useRef(metadata);metadataCurrent.current=metadata;
 const previewUrls=useRef(previews);previewUrls.current=previews;
 const previewFailures=useRef(previewErrors);previewFailures.current=previewErrors;
 const identity=JSON.stringify([scope.organizationId,scope.projectId,model.id]);
 const rule=model.image_url,maximum=model.workspace_asset!.maximum_items;
 const workspaceReferences=references.filter(reference=>reference.type==='workspace_asset');
 const ids=JSON.stringify(workspaceReferences.map(reference=>reference.workspace_asset.asset_id));
 const hasProvider=references.some(reference=>reference.type==='provider_asset');
 useEffect(()=>{onReadingChange?.(uploading,uploadFailed&&!uploading);},[uploading,uploadFailed,onReadingChange]);
 useEffect(()=>{
  setUploading(false);setUploadFailed(false);setProgress(null);setUncertain(false);setError('');setMetadata({});setMetadataErrors({});setLibrary([]);setLibraryLoading(false);setLibraryOpen(false);setPreviews({});setPreviewErrors({});setPreviewing({});previewingIds.current.clear();
  return()=>{sequence.current++;for(const request of requests.current)request.abort();requests.current.clear();for(const url of urls.current)URL.revokeObjectURL(url);urls.current.clear();previewingIds.current.clear();onReadingChange?.(false);};
 },[client,identity]);
 useEffect(()=>{
  const missing=workspaceReferences.filter(reference=>!metadataCurrent.current[reference.workspace_asset.asset_id]);
  if(!missing.length)return;
  const controller=new AbortController();requests.current.add(controller);
  void Promise.all(missing.map(async reference=>{
   const id=reference.workspace_asset.asset_id;
   try{
    const result=await client.getWorkspaceAsset(scope,id,{signal:controller.signal});
    if(controller.signal.aborted)return;
    setMetadata(old=>({...old,[id]:result.data}));
    void loadPreview(result.data);
   }catch{if(!controller.signal.aborted)setMetadataErrors(old=>({...old,[id]:'Saved image metadata is unavailable. Reload the request or check workspace materials.'}));}
  })).finally(()=>requests.current.delete(controller));
  return()=>controller.abort();
 },[client,identity,ids]);
 function start(){const controller=new AbortController();requests.current.add(controller);return controller;}
 function commit(next:SavedVideoReferences){latest.current=next;current.current.onReferencesChange(next);}
 function addAsset(asset:WorkspaceAsset){
  const base=latest.current,count=base.filter(reference=>reference.type==='workspace_asset').length;
  if(count>=maximum||base.some(reference=>reference.type==='workspace_asset'&&reference.workspace_asset.asset_id===asset.id))return;
  const used=base.flatMap(reference=>reference.type==='workspace_asset'&&reference.role?[reference.role]:[]);
  const role=defaultImageRole(rule?.roles??[],used,Boolean(rule?.role_required));
  commit([...base,{type:'workspace_asset',workspace_asset:{asset_id:asset.id,consent_to_process:true},...(role?{role}:{})}]);
 }
 async function upload(files:FileList|null){
  const chosen=files?[...files]:[];
  if(!chosen.length||!rule||disabled||uploading||uncertain)return;
  setError('');setProgress(null);
  const available=maximum-latest.current.filter(reference=>reference.type==='workspace_asset').length;
  if(chosen.length>available){setError(`Choose up to ${maximum} saved reference images.`);if(input.current)input.current.value='';return;}
  for(const file of chosen){
   if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size<1||file.size>8*1024*1024){setError('Choose a PNG, JPEG or WebP image up to 8 MiB.');if(input.current)input.current.value='';return;}
  }
  const ticket=sequence.current,total=chosen.length;
  setUploadFailed(false);setUploading(true);
  try{
   for(let index=0;index<chosen.length;index++){
    const file=chosen[index],controller=start();
    setProgress({done:index+1,total});
    try{
     const bytes=new Uint8Array(await file.arrayBuffer());controller.signal.throwIfAborted();
     const result=await client.uploadWorkspaceAsset(scope,{name:file.name,contentType:file.type,bytes},{signal:controller.signal});
     if(controller.signal.aborted||sequence.current!==ticket)return;
     const asset=result.data;
     const url=URL.createObjectURL(file);urls.current.add(url);
     setPreviews(old=>{const previous=old[asset.id];if(previous){URL.revokeObjectURL(previous);urls.current.delete(previous);}return {...old,[asset.id]:url};});
     setMetadata(old=>({...old,[asset.id]:asset}));
     setMetadataErrors(old=>{if(!old[asset.id])return old;const next={...old};delete next[asset.id];return next;});
     addAsset(asset);
    }finally{requests.current.delete(controller);}
   }
  }catch(caught){
   if(sequence.current!==ticket)return;
   setUploadFailed(true);
   const known=caught instanceof NiuAPIError&&[400,401,403,404,409,413,415,429].includes(caught.status);
   if(caught instanceof NiuAPIError&&!known||!(caught instanceof NiuAPIError)&&!(caught instanceof Error&&caught.message.startsWith('Choose '))){setUncertain(true);setError('Upload confirmation was lost. A file may have been saved. Review saved images before uploading it again.');}
   else setError(caught instanceof Error?caught.message:'The image could not be uploaded.');
  }finally{if(sequence.current===ticket){setUploading(false);setProgress(null);if(input.current)input.current.value='';}}
 }
 async function loadPreview(asset:WorkspaceAsset,retry=false){
  const id=asset.id;
  if(!['image/png','image/jpeg','image/webp'].includes(asset.content_type)||previewingIds.current.has(id))return;
  if(!retry&&(previewUrls.current[id]||previewFailures.current[id]))return;
  previewingIds.current.add(id);
  const controller=start(),ticket=sequence.current;
  setPreviewing(old=>({...old,[id]:true}));
  if(retry)setPreviewErrors(old=>{if(!old[id])return old;const next={...old};delete next[id];return next;});
  try{
   const bytes=await client.downloadWorkspaceAsset(scope,id,{signal:controller.signal});
   if(controller.signal.aborted||sequence.current!==ticket)return;
   if(bytes.byteLength<1||bytes.byteLength>8*1024*1024||!['image/png','image/jpeg','image/webp'].includes(asset.content_type))throw new Error('Unsupported saved image.');
   const url=URL.createObjectURL(new Blob([bytes],{type:asset.content_type}));urls.current.add(url);
   setPreviews(old=>{const previous=old[id];if(previous){URL.revokeObjectURL(previous);urls.current.delete(previous);}return {...old,[id]:url};});
  }catch{if(!controller.signal.aborted&&sequence.current===ticket)setPreviewErrors(old=>({...old,[id]:'The saved image preview could not be loaded.'}));}
  finally{requests.current.delete(controller);previewingIds.current.delete(id);if(sequence.current===ticket)setPreviewing(old=>{if(!old[id])return old;const next={...old};delete next[id];return next;});}
 }
 function remove(reference:SavedVideoReferences[number]){
  if(reference.type==='workspace_asset'){
   const id=reference.workspace_asset.asset_id,url=previews[id];
   if(url){URL.revokeObjectURL(url);urls.current.delete(url);setPreviews(old=>{if(!old[id])return old;const next={...old};delete next[id];return next;});}
  }
  commit(references.filter(item=>item!==reference));
 }
 function choose(asset:WorkspaceAsset){
  if(disabled)return;
  if(latest.current.some(reference=>reference.type==='workspace_asset'&&reference.workspace_asset.asset_id===asset.id)){setUncertain(false);setError('');return;}
  setUncertain(false);setError('');
  setMetadata(old=>({...old,[asset.id]:asset}));
  void loadPreview(asset);
  addAsset(asset);
 }
 async function review(){
  if(libraryLoading)return;const controller=start(),ticket=sequence.current;setLibraryLoading(true);setError('');
  try{const rows:WorkspaceAsset[]=[];let after:string|undefined;const seen=new Set<string>();
   do{const page=await client.listWorkspaceAssets(scope,{kind:'image',limit:100,...(after?{after}:{})},{signal:controller.signal});rows.push(...page.data);after=page.next_cursor??undefined;if(after&&seen.has(after))throw new Error('Saved image pagination did not advance.');if(after)seen.add(after);}while(after&&rows.length<=256);
   if(controller.signal.aborted||sequence.current!==ticket)return;if(after)throw new Error('Saved image discovery is incomplete.');setLibrary(rows);
  }catch{if(!controller.signal.aborted)setError('Saved images could not be reviewed. Uploads remain unconfirmed.');}finally{requests.current.delete(controller);if(sequence.current===ticket)setLibraryLoading(false);}
 }
 return <div className="video-references">
  <Input ref={input} type="file" className="hidden" aria-label={uiT("Upload saved video reference images")} multiple={maximum>1} accept="image/png,image/jpeg,image/webp" onChange={event=>void upload(event.target.files)} disabled={disabled||uploading||uncertain||hasProvider}/>
  {workspaceReferences.map(reference=>{const id=reference.workspace_asset.asset_id,asset=metadata[id],name=asset?.name??uiT("Saved image");return <div className="video-reference" key={id}>
   <span className="video-reference-preview" aria-hidden="true">{previews[id]?<img src={previews[id]} alt=""/>:previewing[id]?<IconLoader2 size={16} className="animate-spin"/>:<IconPhoto size={16}/>}</span>
   <span className="video-reference-name" style={{minWidth:"min(100%, 10rem)"}}>{name}</span>
   {rule&&rule.roles.length>0&&<DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" aria-label={uiF("Role for {0}", [name])} disabled={disabled}>{reference.role?reference.role.replaceAll('_',' '):uiT("Choose role")}<IconChevronDown size={14}/></Button></DropdownMenuTrigger><DropdownMenuContent align="start" collisionPadding={16} className="max-w-[calc(100vw-2rem)]"><DropdownMenuRadioGroup value={reference.role??''} onValueChange={role=>commit(references.map(item=>item===reference?{...item,...(role?{role}:{role:undefined})}:item))}>{!rule.role_required&&<DropdownMenuRadioItem value="">{uiT("No role")}</DropdownMenuRadioItem>}{rule.roles.map(role=><DropdownMenuRadioItem key={role} value={role}>{role.replaceAll('_',' ')}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>}
   {previewErrors[id]&&asset&&<Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={()=>void loadPreview(asset,true)}>{uiT("Retry preview")}</Button>}
   <Button type="button" variant="ghost" size="icon" aria-label={uiF("Remove {0}", [name])} disabled={disabled} onClick={()=>remove(reference)}><IconX size={16}/></Button>
   {metadataErrors[id]&&<p role="alert" className="video-error">{uiT(metadataErrors[id])}</p>}
  </div>;})}
  {progress&&<p role="status" className="video-muted">{uiF("Saving image {0} of {1}…",[progress.done,progress.total])}</p>}
  <Button type="button" variant="ghost" disabled={disabled||uploading||uncertain||hasProvider||workspaceReferences.length>=maximum} onClick={()=>input.current?.click()}><IconPaperclip size={16}/>{uploading?uiT("Saving image…"):uiT("Attach image")}</Button>
  <DropdownMenu open={libraryOpen} onOpenChange={open=>{setLibraryOpen(open);if(open)void review();}}><DropdownMenuTrigger asChild><Button type="button" variant="ghost" disabled={disabled||uploading||hasProvider||workspaceReferences.length>=maximum}>{libraryLoading?uiT("Loading saved images…"):uncertain?uiT("Review saved images"):uiT("Use saved image")}</Button></DropdownMenuTrigger><DropdownMenuContent align="start" collisionPadding={16} className="max-w-[calc(100vw-2rem)]">{libraryLoading&&<DropdownMenuItem disabled>{uiT("Loading saved images…")}</DropdownMenuItem>}{!libraryLoading&&!library.length&&<DropdownMenuItem disabled>{error?uiT("Saved images unavailable. Close and retry."):uiT("No saved images")}</DropdownMenuItem>}{library.map(asset=><DropdownMenuItem key={asset.id} onSelect={()=>choose(asset)}><span className="min-w-0 whitespace-normal break-words">{asset.name} · {new Date(asset.created_at_ms).toLocaleString(readUILocale())}</span></DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
  <p className="video-muted">{uiT("Adding an image allows Niu to inspect and process it for this video request.")}</p>
  {hasProvider&&<p className="video-muted">{uiT("Provider materials and workspace images cannot be mixed in one request.")}</p>}
  {error&&<p role="alert" className="video-error">{uiT(error)}</p>}
 </div>;
}
