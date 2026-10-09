import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import ImageReferences, {type NamedImageReference} from '@/features/video/ImageReferences';
import type {VideoModel} from '../../../../../sdks/javascript/src/index';
const model={image_url:{maximum_items:2,maximum_bytes:128,https:false,data_mime_types:['image/png'],roles:['first_frame','last_frame'],role_required:true,requires_text:true,maximum_width:32,maximum_height:32,maximum_decoded_bytes:4096}} as VideoModel;
function Harness(){const [images,setImages]=useState<NamedImageReference[]>([]);return <><ImageReferences model={model} images={images} onChange={setImages} disabled={false}/><output>{JSON.stringify(images)}</output></>;}
it('reads a pending image, assigns a schema role and removes it',async()=>{
 render(<Harness/>);const user=userEvent.setup();
 await user.upload(screen.getByLabelText('Upload video reference images'),new File(['fixture-image'],'frame.png',{type:'image/png'}));
 await screen.findByText('frame.png');
 await user.click(screen.getByRole('button',{name:'Role for frame.png'}));
 await user.click(screen.getByRole('menuitemradio',{name:'first frame'}));
 expect(screen.getByRole('status').textContent).toContain('"role":"first_frame"');
 expect(screen.getByRole('status').textContent).toContain('data:image/png;base64,');
 await user.click(screen.getByRole('button',{name:'Remove frame.png'}));
 expect(screen.queryByText('frame.png')).toBeNull();
});
it('rejects oversize files before adding partial attachments',async()=>{
 render(<Harness/>);const user=userEvent.setup();
 await user.upload(screen.getByLabelText('Upload video reference images'),[new File(['small'],'first.png',{type:'image/png'}),new File(['x'.repeat(128)],'large.png',{type:'image/png'})]);
 expect((await screen.findByRole('alert')).textContent).toContain('exceeds the reference size limit');
 expect(screen.getByRole('status').textContent).toBe('[]');
});
it('keeps attachments unavailable during submission',()=>{
 render(<ImageReferences model={model} images={[]} onChange={()=>{throw new Error('cannot change during submission');}} disabled/>);
 expect(screen.getByRole('button',{name:'Attach image'}).hasAttribute('disabled')).toBe(true);
 expect(screen.getByLabelText('Upload video reference images').hasAttribute('disabled')).toBe(true);
});

it('aborts a pending file read on model change and clears the parent reading state',async()=>{
 const pending:Array<{abort:()=>void;onload:(()=>void)|null;result:string}>=[];
 vi.stubGlobal('FileReader',class {
   result='data:image/png;base64,aW1hZ2U=';
   onload:(()=>void)|null=null;onabort:(()=>void)|null=null;
   readAsDataURL(){pending.push(this);}
   abort=vi.fn(()=>this.onabort?.());
 });
 const change=vi.fn();const reading=vi.fn();
 const view=render(<ImageReferences model={model} images={[]} onChange={change} disabled={false} onReadingChange={reading}/>);
 await userEvent.setup().upload(screen.getByLabelText('Upload video reference images'),new File(['image'],'frame.png',{type:'image/png'}));
 expect(screen.getByRole('button',{name:'Reading image…'}).hasAttribute('disabled')).toBe(true);
 view.rerender(<ImageReferences model={{...model}} images={[]} onChange={change} disabled={false} onReadingChange={reading}/>);
 expect(pending[0].abort).toHaveBeenCalledOnce();
 expect(reading).toHaveBeenLastCalledWith(false);
 expect(screen.getByRole('button',{name:'Attach image'}).hasAttribute('disabled')).toBe(false);
 pending[0].onload?.();
 expect(change).not.toHaveBeenCalled();
});
