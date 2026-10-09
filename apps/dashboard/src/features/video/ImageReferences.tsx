import { useEffect, useRef, useState } from 'react';
import { IconPaperclip, IconX, IconChevronDown } from '@tabler/icons-react';
import type { VideoModel } from '../../../../../sdks/javascript/src/index';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import type { ImageReference } from './request';
export type NamedImageReference = ImageReference & { name: string };

/** Pending request attachments. Saved video data remains owned by the backend. */
export default function ImageReferences({model,images,onChange,disabled,onReadingChange}:{model:VideoModel;images:NamedImageReference[];onChange:(images:NamedImageReference[])=>void;disabled:boolean;onReadingChange?:(reading:boolean)=>void}) {
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
      {rule.roles.length>0 && <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" aria-label={`Role for ${image.name}`} disabled={disabled || reading}>{image.role ? image.role.replaceAll('_',' '):'Choose role'}<IconChevronDown size={14}/></Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuRadioGroup value={image.role ?? ''} onValueChange={role=>onChange(images.map((item,i)=>i === index ? {...item,role}:item))}>{!rule.role_required && <DropdownMenuRadioItem value="">No role</DropdownMenuRadioItem>}{rule.roles.map(role=><DropdownMenuRadioItem key={role} value={role}>{role.replaceAll('_',' ')}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>}
      <Button variant="ghost" size="icon" aria-label={`Remove ${image.name}`} disabled={disabled || reading} onClick={()=>onChange(images.filter((_,i)=>i !== index))}><IconX size={16}/></Button>
    </div>)}
    <Button variant="ghost" onClick={()=>input.current?.click()} disabled={disabled || reading || images.length>=rule.maximum_items}><IconPaperclip size={16}/>{reading ? 'Reading image…':'Attach image'}</Button>
    {error && <p role="alert" className="video-error">{error}</p>}
  </div>;
}
