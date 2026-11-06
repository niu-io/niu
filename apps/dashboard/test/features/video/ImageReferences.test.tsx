import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import ImageReferences, {type NamedImageReference} from '@/features/video/ImageReferences';
import { saveLocale } from '@/shell/locale';
import type {VideoModel} from '@niu-io/sdk';
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
it('renders a zh-CN interpolated reference error without translating the file name',async()=>{
 saveLocale('zh-CN');
 render(<Harness/>);const user=userEvent.setup();
 await user.upload(screen.getByLabelText('上传视频参考图片'),new File(['x'.repeat(128)],'large.png',{type:'image/png'}));
 expect((await screen.findByRole('alert')).textContent).toBe('large.png 超过参考图片大小上限。');
 saveLocale('en');
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

const savedModel={...model,workspace_asset:{media_kind:'image' as const,requires_consent:true as const,requires_current_inspection:false,maximum_items:2,requires_text:true as const}} as VideoModel;
const workspaceAsset={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'frame.png',media_kind:'image' as const,content_type:'image/png',content_sha256:'a'.repeat(64),byte_length:8,revision:'1',created_at_ms:0,updated_at_ms:0};
function savedClient(){
 return {
  getWorkspaceAsset:vi.fn(async()=>({data:workspaceAsset})),
  downloadWorkspaceAsset:vi.fn(async()=>new Uint8Array([137,80,78,71]).buffer),
  uploadWorkspaceAsset:vi.fn(async(_scope:unknown,input:{name:string;contentType:string;bytes:Uint8Array})=>({data:{...workspaceAsset,id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',name:input.name}})),
  listWorkspaceAssets:vi.fn(async()=>({data:[workspaceAsset],next_cursor:null})),
 };
}
function SavedHarness({client,initial=[]}:{client:ReturnType<typeof savedClient>;initial?:Array<{type:'workspace_asset';role?:string;workspace_asset:{asset_id:string;consent_to_process:true}}>}){
 const [references,setReferences]=useState(initial);
 return <><ImageReferences model={savedModel} images={[]} onChange={()=>{}} disabled={false} client={client as unknown as import('@niu-io/sdk/admin').NiuAdminClient} scope={{organizationId:'11111111-1111-4111-8111-111111111111',projectId:'22222222-2222-4222-8222-222222222222'}} references={references} onReferencesChange={setReferences}/><output>{JSON.stringify(references)}</output></>;
}
it('adds an uploaded workspace image immediately with processing consent and a default role',async()=>{
 vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:uploaded-frame');
 vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
 const client=savedClient();const {container}=render(<SavedHarness client={client}/>);const user=userEvent.setup();
 await user.upload(screen.getByLabelText('Upload saved video reference images'),new File(['image'],'upload.png',{type:'image/png'}));
 const output=await screen.findByRole('status');
 expect(output.textContent).toContain('"asset_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"');
 expect(output.textContent).toContain('"consent_to_process":true');
 expect(output.textContent).toContain('"role":"first_frame"');
 expect(screen.queryByRole('checkbox')).toBeNull();
 expect(container.querySelector('.video-reference-preview img')?.getAttribute('src')).toBe('blob:uploaded-frame');
 expect(client.uploadWorkspaceAsset).toHaveBeenCalledOnce();
 await user.click(screen.getByRole('button',{name:'Remove upload.png'}));
 expect(screen.getByRole('status').textContent).toBe('[]');
 expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:uploaded-frame');
});

it('rejects an invalid saved-image file before uploading anything',async()=>{
 const client=savedClient();
 render(<SavedHarness client={client}/>);
 await userEvent.setup().upload(screen.getByLabelText('Upload saved video reference images'),new File([],'empty.png',{type:'image/png'}));
 expect((await screen.findByRole('alert')).textContent).toContain('PNG, JPEG or WebP');
 expect(screen.getByRole('status').textContent).toBe('[]');
 expect(client.uploadWorkspaceAsset).not.toHaveBeenCalled();
});

it('adds a library image immediately and loads its preview automatically',async()=>{
 vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:library-frame');
 vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
 const client=savedClient();const {container}=render(<SavedHarness client={client}/>);
 const user=userEvent.setup();
 await user.click(screen.getByRole('button',{name:'Use saved image'}));
 await user.click(await screen.findByRole('menuitem',{name:/frame\.png/}));
 const output=screen.getByRole('status');
 expect(output.textContent).toContain('"asset_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"');
 expect(output.textContent).toContain('"consent_to_process":true');
 expect(output.textContent).toContain('"role":"first_frame"');
 await vi.waitFor(()=>expect(client.downloadWorkspaceAsset).toHaveBeenCalledOnce());
 await vi.waitFor(()=>expect(container.querySelector('.video-reference-preview img')?.getAttribute('src')).toBe('blob:library-frame'));
 expect(screen.queryByRole('button',{name:'Preview'})).toBeNull();
});

it('previews a restored saved reference without a Preview action',async()=>{
 vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:restored-frame');
 vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
 const client=savedClient();const {container}=render(<SavedHarness client={client} initial={[{type:'workspace_asset',role:'first_frame',workspace_asset:{asset_id:workspaceAsset.id,consent_to_process:true}}]}/>);
 await vi.waitFor(()=>expect(client.downloadWorkspaceAsset).toHaveBeenCalledOnce());
 await vi.waitFor(()=>expect(container.querySelector('.video-reference-preview img')?.getAttribute('src')).toBe('blob:restored-frame'));
 expect(screen.queryByRole('button',{name:'Preview'})).toBeNull();
});

it('retries an automatic preview after its first load fails',async()=>{
 vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:retry-frame');
 vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
 const client=savedClient();client.downloadWorkspaceAsset.mockRejectedValueOnce(new Error('offline'));
 const {container}=render(<SavedHarness client={client} initial={[{type:'workspace_asset',role:'first_frame',workspace_asset:{asset_id:workspaceAsset.id,consent_to_process:true}}]}/>);
 const retry=await screen.findByRole('button',{name:'Retry preview'});
 expect(client.downloadWorkspaceAsset).toHaveBeenCalledOnce();
 await userEvent.setup().click(retry);
 await vi.waitFor(()=>expect(client.downloadWorkspaceAsset).toHaveBeenCalledTimes(2));
 await vi.waitFor(()=>expect(container.querySelector('.video-reference-preview img')?.getAttribute('src')).toBe('blob:retry-frame'));
});

it('reports a lost upload confirmation and lets the user review saved images',async()=>{
 vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:reviewed-frame');
 vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
 const client=savedClient();client.uploadWorkspaceAsset.mockRejectedValue(new Error('connection lost'));
 render(<SavedHarness client={client}/>);const user=userEvent.setup();
 await user.upload(screen.getByLabelText('Upload saved video reference images'),new File(['image'],'lost.png',{type:'image/png'}));
 expect((await screen.findByRole('alert')).textContent).toContain('Upload confirmation was lost');
 const review=screen.getByRole('button',{name:'Review saved images'});
 expect(review.hasAttribute('disabled')).toBe(false);
 await user.click(review);
 await vi.waitFor(()=>expect(client.listWorkspaceAssets).toHaveBeenCalledOnce());
 await user.click(await screen.findByRole('menuitem',{name:/frame\.png/}));
 expect(screen.getByRole('button',{name:'Attach image'}).hasAttribute('disabled')).toBe(false);
 expect(screen.getByRole('status').textContent).toContain(workspaceAsset.id);
});
