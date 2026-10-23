import { MemoryRouter } from 'react-router';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { WorkspaceLibrary } from '@/features/library/page';
const scope={organizationId:'10000000-0000-4000-8000-000000000001',projectId:'20000000-0000-4000-8000-000000000001'};
const asset={id:'30000000-0000-4000-8000-000000000001',name:'Saved scene',media_kind:'video',content_type:'video/mp4',byte_length:2048,revision:'1',content_sha256:'a'.repeat(64),created_at_ms:1000,updated_at_ms:1000};
const props={token:'fixture-token',scope,canWrite:true};
it('discovers retained videos independently of the source conversation',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({data:[asset],next_cursor:null})));
 render(<WorkspaceLibrary {...props}/>);
 expect(await screen.findByRole('button',{name:'Saved scene'})).toBeTruthy();
 expect(screen.queryByText(asset.id)).toBeNull();
 expect(screen.getByText(/independently of the Provider/)).toBeTruthy();
});
it('renames with the current revision and shows the saved result',async()=>{
 const fetcher=vi.fn(async(_input:RequestInfo|URL,init?:RequestInit)=>Response.json(init?.method==='PATCH'?{data:{...asset,name:'Named scene',revision:'2'}}:{data:[asset],next_cursor:null}));
 vi.stubGlobal('fetch',fetcher);render(<WorkspaceLibrary {...props}/>);
 const user=userEvent.setup();await user.click(await screen.findByRole('button',{name:'Actions for Saved scene'}));await user.click(screen.getByRole('menuitem',{name:'Rename'}));
 await user.clear(screen.getByLabelText('File name'));await user.type(screen.getByLabelText('File name'),'Named scene');await user.click(screen.getByRole('button',{name:'Save name'}));
 expect(await screen.findByRole('button',{name:'Named scene'})).toBeTruthy();
 expect(JSON.parse(fetcher.mock.calls.find(([,init])=>init?.method==='PATCH')?.[1]?.body as string)).toEqual({name:'Named scene',expected_revision:'1'});
});
it('previews retained bytes through the authenticated workspace API and releases the object URL',async()=>{
 vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:saved-scene');const revoke=vi.spyOn(URL,'revokeObjectURL');
 const fetcher=vi.fn(async(input:RequestInfo|URL)=>String(input).endsWith('/content')?new Response(new Uint8Array([1,2,3])):Response.json({data:[asset],next_cursor:null}));
 vi.stubGlobal('fetch',fetcher);render(<WorkspaceLibrary {...props}/>);
 const user=userEvent.setup();await user.click(await screen.findByRole('button',{name:'Saved scene'}));
 expect(await screen.findByRole('link',{name:'Download file'})).toHaveProperty('href','blob:saved-scene');
 const read=fetcher.mock.calls.find(([url])=>String(url).endsWith('/content'));
 expect(String(read?.[0])).toContain(`/workspaces/${scope.projectId}/assets/${asset.id}/content`);
 await user.keyboard('{Escape}');await waitFor(()=>expect(revoke).toHaveBeenCalledWith('blob:saved-scene'));
 expect(document.activeElement).toBe(screen.getByRole('button',{name:'Saved scene'}));
});
it('keeps read-only members from renaming or deleting copies',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({data:[asset],next_cursor:null})));render(<WorkspaceLibrary {...props} canWrite={false}/>);
 await userEvent.setup().click(await screen.findByRole('button',{name:'Actions for Saved scene'}));
 expect(screen.getByRole('menuitem',{name:'Rename'}).getAttribute('aria-disabled')).toBe('true');
 expect(screen.getByRole('menuitem',{name:'Delete workspace copy'}).getAttribute('aria-disabled')).toBe('true');
});
it('reports a failed library read without inventing an empty state',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({error:{message:'Unavailable'}},{status:503})));render(<WorkspaceLibrary {...props}/>);
 expect(await screen.findByRole('alert')).toBeTruthy();expect(screen.queryByText('No saved media yet')).toBeNull();
});
it('rejects overlong multibyte names without discarding the draft',async()=>{
 const fetcher=vi.fn(async()=>Response.json({data:[asset],next_cursor:null}));vi.stubGlobal('fetch',fetcher);render(<WorkspaceLibrary {...props}/>);
 const user=userEvent.setup();await user.click(await screen.findByRole('button',{name:'Actions for Saved scene'}));await user.click(screen.getByRole('menuitem',{name:'Rename'}));
 await user.clear(screen.getByLabelText('File name'));await user.click(screen.getByLabelText('File name'));await user.paste('山'.repeat(80));await user.click(screen.getByRole('button',{name:'Save name'}));
 expect(await screen.findByRole('alert')).toHaveProperty('textContent','Use a shorter file name on one line.');
 expect((screen.getByLabelText('File name') as HTMLInputElement).value).toBe('山'.repeat(80));expect(fetcher).toHaveBeenCalledTimes(1);
});
it('reconciles an uncertain deletion rather than retaining a blind delete button',async()=>{
 const fetcher=vi.fn(async(_input:RequestInfo|URL,init?:RequestInit)=>init?.method==='DELETE'?Response.json({error:{message:'Unavailable'}},{status:503}):Response.json({data:[asset],next_cursor:null}));vi.stubGlobal('fetch',fetcher);render(<WorkspaceLibrary {...props}/>);
 const user=userEvent.setup();await user.click(await screen.findByRole('button',{name:'Actions for Saved scene'}));await user.click(screen.getByRole('menuitem',{name:'Delete workspace copy'}));
 expect(screen.getByText(/does not delete the source generation/)).toBeTruthy();await user.click(screen.getByRole('button',{name:'Delete copy'}));
 expect(await screen.findByText(/change could not be confirmed/)).toBeTruthy();expect(screen.queryByRole('dialog')).toBeNull();
 const deletion=fetcher.mock.calls.find(([,init])=>init?.method==='DELETE');expect(String(deletion?.[0])).toContain('expected_revision=1');
});
it('returns focus to the file menu after cancelling rename',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({data:[asset],next_cursor:null})));render(<WorkspaceLibrary {...props}/>);
 const user=userEvent.setup(), trigger=await screen.findByRole('button',{name:'Actions for Saved scene'});await user.click(trigger);await user.click(screen.getByRole('menuitem',{name:'Rename'}));await user.keyboard('{Escape}');await waitFor(()=>expect(document.activeElement).toBe(trigger));
});
it('handles a malformed library response as a recoverable read failure',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({data:{},next_cursor:null})));render(<WorkspaceLibrary {...props}/>);
 expect(await screen.findByRole('button',{name:'Retry library'})).toBeTruthy();expect(screen.queryByText('No saved media yet')).toBeNull();
});
it('returns to an authorized source using its public reference and workspace slug',async()=>{
 vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:saved-scene');
 vi.stubGlobal('fetch',vi.fn(async(input)=>String(input).endsWith('/content')?new Response(new Uint8Array([1])):Response.json({data:[{...asset,source:{reference:'run-1000',kind:'video',output:'video',model:'Example',created_at:'2026-10-22T00:00:00Z'}}],next_cursor:null})));
 render(<MemoryRouter><WorkspaceLibrary {...props} workspaceSlug="my-workspace"/></MemoryRouter>);
 await userEvent.click(await screen.findByRole('button',{name:'Saved scene'}));
 expect(screen.getByRole('link',{name:'View original generation'}).getAttribute('href')).toBe('/generations?workspace=my-workspace&job=run-1000');
});
