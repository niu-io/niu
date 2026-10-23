import { useEffect, useId, useRef, useState } from 'react';
import { IconPaperclip, IconX, IconChevronDown } from '@tabler/icons-react';
import type { VideoModel } from '@niu-io/sdk';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {Checkbox} from '@/components/ui/checkbox';
import {Label} from '@/components/ui/label';
import {NiuAdminClient,type TenantScope} from '@niu-io/sdk/admin';
import type {WorkspaceAsset} from '@niu-io/sdk/workspace-assets';
import {NiuAPIError} from '@niu-io/sdk';
import { DropdownMenuItem, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import type { ImageReference,SavedVideoReferences } from './request';
export type NamedImageReference = ImageReference & { name: string };

/** Pending request attachments. Saved video data remains owned by the backend. */
export type ImageReferencesProps={model:VideoModel;images:NamedImageReference[];onChange:(images:NamedImageReference[])=>void;disabled:boolean;onReadingChange?:(reading:boolean)=>void;client?:NiuAdminClient;scope?:TenantScope;references?:SavedVideoReferences;onReferencesChange?:(references:SavedVideoReferences)=>void};
export default function ImageReferences(props:ImageReferencesProps) {
  if(props.model.workspace_asset){
    if(!props.client||!props.scope||!props.references||!props.onReferencesChange)return <p className="video-muted">Saved image attachments are not configured for this workspace.</p>;
    return <SavedImageReferences {...props} client={props.client} scope={props.scope} references={props.references} onReferencesChange={props.onReferencesChange}/>;
  }
  return <InlineImageReferences {...props}/>;
}
function InlineImageReferences({model,images,onChange,disabled,onReadingChange}:ImageReferencesProps) {
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
    } catch(error) {if(ticket === sequence.current && current.current.model === selectedModel)setError(error instanceof Error ? error.message:'Could not attach the image.');}
    finally {if(ticket === sequence.current){setReading(false);onReadingChange?.(false);}if(input.current)input.current.value='';}
  }
  return <div className="video-references">
    <Input ref={input} type="file" className="hidden" aria-label="Upload video reference images" multiple={rule.maximum_items>1} accept={rule.data_mime_types.join(',')} onChange={event=>void attach(event.target.files)} disabled={disabled || reading}/>
    {images.map((image,index)=><div className="video-reference" key={index}>
      <img src={image.url} alt=""/><span className="video-reference-name">{image.name}</span>
      {rule.roles.length>0 && <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" aria-label={`Role for ${image.name}`} disabled={disabled || reading}>{image.role ? image.role.replaceAll('_',' '):'Choose role'}<IconChevronDown size={14}/></Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuRadioGroup value={image.role ?? ''} onValueChange={role=>onChange(images.map((item,i)=>i === index ? {...item,role}:item))}>{!rule.role_required && <DropdownMenuRadioItem value="">No role</DropdownMenuRadioItem>}{rule.roles.map(role=><DropdownMenuRadioItem key={role} value={role}>{role.replaceAll('_',' ')}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>}
      <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${image.name}`} disabled={disabled || reading} onClick={()=>onChange(images.filter((_,i)=>i !== index))}><IconX size={16}/></Button>
    </div>)}
    <Button type="button" variant="ghost" onClick={()=>input.current?.click()} disabled={disabled || reading || images.length>=rule.maximum_items}><IconPaperclip size={16}/>{reading ? 'Reading image…':'Attach image'}</Button>
    {error && <p role="alert" className="video-error">{error}</p>}
  </div>;
}

type SavedProps=ImageReferencesProps&{client:NiuAdminClient;scope:TenantScope;references:SavedVideoReferences;onReferencesChange:(references:SavedVideoReferences)=>void};
type PendingImage={asset:WorkspaceAsset;consent:boolean;role?:string};
/** Upload storage and model-processing permission remain separate explicit actions. */
function SavedImageReferences({model,client,scope,references,onReferencesChange,disabled,onReadingChange}:SavedProps){
 const input=useRef<HTMLInputElement>(null),labelId=useId();
 const [pending,setPending]=useState<PendingImage[]>([]),[uploading,setUploading]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState('');
 const [metadata,setMetadata]=useState<Record<string,WorkspaceAsset>>({}),[metadataErrors,setMetadataErrors]=useState<Record<string,string>>({});
 const [library,setLibrary]=useState<WorkspaceAsset[]>([]),[libraryLoading,setLibraryLoading]=useState(false),[libraryOpen,setLibraryOpen]=useState(false);
 const [previews,setPreviews]=useState<Record<string,string>>({});
 const sequence=useRef(0),requests=useRef(new Set<AbortController>()),urls=useRef(new Set<string>());
 const current=useRef({references,onReferencesChange,disabled});current.current={references,onReferencesChange,disabled};
 const identity=JSON.stringify([scope.organizationId,scope.projectId,model.id]);
 const rule=model.image_url,maximum=model.workspace_asset!.maximum_items;
 const workspaceReferences=references.filter(reference=>reference.type==='workspace_asset');
 const blocked=uploading||uncertain||pending.length>0;
 useEffect(()=>{onReadingChange?.(blocked);},[blocked,onReadingChange]);
 useEffect(()=>{
  setPending([]);setUploading(false);setUncertain(false);setError('');setMetadata({});setMetadataErrors({});setLibrary([]);setLibraryLoading(false);setLibraryOpen(false);setPreviews({});
  return()=>{sequence.current++;for(const request of requests.current)request.abort();requests.current.clear();for(const url of urls.current)URL.revokeObjectURL(url);urls.current.clear();onReadingChange?.(false);};
 },[client,identity]);
 const ids=JSON.stringify(workspaceReferences.map(reference=>reference.workspace_asset.asset_id));
 useEffect(()=>{
  const controller=new AbortController();requests.current.add(controller);
  void Promise.all(workspaceReferences.map(async reference=>{
   const id=reference.workspace_asset.asset_id;
   try{const result=await client.getWorkspaceAsset(scope,id,{signal:controller.signal});if(!controller.signal.aborted)setMetadata(old=>({...old,[id]:result.data}));}
   catch{if(!controller.signal.aborted)setMetadataErrors(old=>({...old,[id]:'Saved image metadata is unavailable. Reload the request or check workspace materials.'}));}
  })).finally(()=>requests.current.delete(controller));
  return()=>controller.abort();
 },[client,identity,ids]);
 function start(){const controller=new AbortController();requests.current.add(controller);return controller;}
 async function upload(files:FileList|null){
  if(!files?.length||disabled||blocked)return;
  const chosen=[...files],ticket=sequence.current,controller=start();
  setUploading(true);onReadingChange?.(true);setError('');
  try{
   if(chosen.length+references.length+pending.length>maximum)throw new Error(`Choose up to ${maximum} saved reference images.`);
   for(const file of chosen){
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size<1||file.size>8*1024*1024)throw new Error('Choose a PNG, JPEG or WebP image up to 8 MiB.');
    const bytes=new Uint8Array(await file.arrayBuffer());controller.signal.throwIfAborted();
    const result=await client.uploadWorkspaceAsset(scope,{name:file.name,contentType:file.type,bytes},{signal:controller.signal});
    if(controller.signal.aborted||sequence.current!==ticket)return;
    setPending(old=>[...old,{asset:result.data,consent:false}]);
   }
  }catch(caught){
   if(controller.signal.aborted||sequence.current!==ticket)return;
   const known=caught instanceof NiuAPIError&&[400,401,403,404,409,413,415,429].includes(caught.status);
   if(caught instanceof NiuAPIError&&!known||!(caught instanceof NiuAPIError)&&!(caught instanceof Error&&caught.message.startsWith('Choose '))){setUncertain(true);setError('Upload confirmation was lost. A file may have been saved. Review saved images before uploading it again.');}
   else setError(caught instanceof Error?caught.message:'The image could not be uploaded.');
  }finally{requests.current.delete(controller);if(sequence.current===ticket){setUploading(false);if(input.current)input.current.value='';}}
 }
 function changePending(index:number,patch:Partial<Pick<PendingImage,'consent'|'role'>>){
  const selected={...pending[index],...patch};
  const validRole=rule&&!((rule.role_required&&!selected.role)||(selected.role&&!rule.roles.includes(selected.role)));
  if(selected.consent&&validRole){
   current.current.onReferencesChange([...current.current.references,{type:'workspace_asset',workspace_asset:{asset_id:selected.asset.id,consent_to_process:true},...(selected.role?{role:selected.role}:{})}]);
   setMetadata(old=>({...old,[selected.asset.id]:selected.asset}));setPending(old=>old.filter((_,i)=>i!==index));
  }else setPending(old=>old.map((item,i)=>i===index?selected:item));
 }
 async function preview(asset:WorkspaceAsset){
  const controller=start(),ticket=sequence.current;setError('');
  try{const bytes=await client.downloadWorkspaceAsset(scope,asset.id,{signal:controller.signal});if(controller.signal.aborted||sequence.current!==ticket)return;if(bytes.byteLength>8*1024*1024||!['image/png','image/jpeg','image/webp'].includes(asset.content_type))throw new Error('Unsupported saved image.');const url=URL.createObjectURL(new Blob([bytes],{type:asset.content_type}));urls.current.add(url);setPreviews(old=>{const previous=old[asset.id];if(previous){URL.revokeObjectURL(previous);urls.current.delete(previous);}return {...old,[asset.id]:url};});}
  catch{if(!controller.signal.aborted)setError('The saved image preview could not be loaded.');}finally{requests.current.delete(controller);}
 }
 async function review(){
  if(libraryLoading)return;const controller=start(),ticket=sequence.current;setLibraryLoading(true);setError('');
  try{const rows:WorkspaceAsset[]=[];let after:string|undefined;const seen=new Set<string>();
   do{const page=await client.listWorkspaceAssets(scope,{kind:'image',limit:100,...(after?{after}:{})},{signal:controller.signal});rows.push(...page.data);after=page.next_cursor??undefined;if(after&&seen.has(after))throw new Error('Saved image pagination did not advance.');if(after)seen.add(after);}while(after&&rows.length<=256);
   if(controller.signal.aborted||sequence.current!==ticket)return;if(after)throw new Error('Saved image discovery is incomplete.');setLibrary(rows);
  }catch{if(!controller.signal.aborted)setError('Saved images could not be reviewed. Uploads remain unconfirmed.');}finally{requests.current.delete(controller);if(sequence.current===ticket)setLibraryLoading(false);}
 }
 const hasProvider=references.some(reference=>reference.type==='provider_asset');

 return <div className="video-references">
  <Input ref={input} type="file" className="hidden" aria-label="Upload saved video reference images" multiple={maximum>1} accept="image/png,image/jpeg,image/webp" onChange={event=>void upload(event.target.files)} disabled={disabled||blocked||hasProvider}/>
  {workspaceReferences.map(reference=>{const id=reference.workspace_asset.asset_id,asset=metadata[id],name=asset?.name??'Saved image';return <div className="video-reference" key={id}>
   {previews[id]&&<img src={previews[id]} alt=""/>}<span className="video-reference-name" style={{minWidth:"min(100%, 10rem)"}}>{name}</span>
   {asset&&<Button type="button" variant="ghost" disabled={uploading} onClick={()=>void preview(asset)}>Preview</Button>}
   {rule&&rule.roles.length>0&&<DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" aria-label={`Role for ${name}`} disabled={disabled||blocked}>{reference.role?reference.role.replaceAll('_',' '):'Choose role'}<IconChevronDown size={14}/></Button></DropdownMenuTrigger><DropdownMenuContent align="start" collisionPadding={16} className="max-w-[calc(100vw-2rem)]"><DropdownMenuRadioGroup value={reference.role??''} onValueChange={role=>onReferencesChange(references.map(item=>item===reference?{...item,...(role?{role}:{role:undefined})}:item))}>{!rule.role_required&&<DropdownMenuRadioItem value="">No role</DropdownMenuRadioItem>}{rule.roles.map(role=><DropdownMenuRadioItem key={role} value={role}>{role.replaceAll('_',' ')}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>}
   <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${name}`} disabled={disabled||uploading} onClick={()=>onReferencesChange(references.filter(item=>item!==reference))}><IconX size={16}/></Button>
   {metadataErrors[id]&&<p role="alert" className="video-error">{metadataErrors[id]}</p>}
  </div>;})}
  {pending.map((item,index)=>{const consentId=`${labelId}-${index}`;return <div key={item.asset.id}>
   <div className="video-reference">{previews[item.asset.id]&&<img src={previews[item.asset.id]} alt=""/>}<span className="video-reference-name" style={{minWidth:"min(100%, 10rem)"}}>{item.asset.name}</span><Button type="button" variant="ghost" disabled={uploading} onClick={()=>void preview(item.asset)}>Preview</Button>{rule&&rule.roles.length>0&&<DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" aria-label={`Role for ${item.asset.name}`} disabled={disabled||uploading||uncertain}>{item.role?item.role.replaceAll('_',' '):'Choose role'}<IconChevronDown size={14}/></Button></DropdownMenuTrigger><DropdownMenuContent align="start" collisionPadding={16} className="max-w-[calc(100vw-2rem)]"><DropdownMenuRadioGroup value={item.role??''} onValueChange={role=>changePending(index,{role:role||undefined})}>{!rule.role_required&&<DropdownMenuRadioItem value="">No role</DropdownMenuRadioItem>}{rule.roles.map(role=><DropdownMenuRadioItem key={role} value={role}>{role.replaceAll('_',' ')}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>}<Button type="button" variant="ghost" size="icon" aria-label={`Remove pending ${item.asset.name}`} disabled={disabled||uploading} onClick={()=>setPending(old=>old.filter((_,i)=>i!==index))}><IconX size={16}/></Button></div>
   <div className="flex items-start gap-2"><Checkbox id={consentId} checked={item.consent} disabled={disabled||uploading||uncertain} onCheckedChange={checked=>changePending(index,{consent:checked===true})}/><Label htmlFor={consentId}>Allow NIU.IO to inspect and process this image for video generation.</Label></div>
   <p className="video-muted">Saved to workspace materials. Allow processing and choose a role to add it to this request.</p>
  </div>;})}
  <Button type="button" variant="ghost" disabled={disabled||blocked||hasProvider||references.length>=maximum} onClick={()=>input.current?.click()}><IconPaperclip size={16}/>{uploading?'Saving image…':'Attach image'}</Button>
  <DropdownMenu open={libraryOpen} onOpenChange={open=>{setLibraryOpen(open);if(open)void review();}}><DropdownMenuTrigger asChild><Button type="button" variant="ghost" disabled={disabled||uploading||hasProvider||references.length+pending.length>=maximum}>{libraryLoading?'Loading saved images…':uncertain?'Review saved images':'Use saved image'}</Button></DropdownMenuTrigger><DropdownMenuContent align="start" collisionPadding={16} className="max-w-[calc(100vw-2rem)]">{libraryLoading&&<DropdownMenuItem disabled>Loading saved images…</DropdownMenuItem>}{!libraryLoading&&!library.length&&<DropdownMenuItem disabled>{error?"Saved images unavailable. Close and retry.":"No saved images"}</DropdownMenuItem>}{library.map(asset=><DropdownMenuItem key={asset.id} onSelect={()=>{setUncertain(false);setError('');if(current.current.references.some(reference=>reference.type==='workspace_asset'&&reference.workspace_asset.asset_id===asset.id)||pending.some(item=>item.asset.id===asset.id))return;setPending(old=>[...old,{asset,consent:false}]);}}><span className="min-w-0 whitespace-normal break-words">{asset.name} · {new Date(asset.created_at_ms).toLocaleString()}</span></DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
  {hasProvider&&<p className="video-muted">Provider materials and workspace images cannot be mixed in one request.</p>}
  {error&&<p role="alert" className="video-error">{error}</p>}
 </div>;
}
