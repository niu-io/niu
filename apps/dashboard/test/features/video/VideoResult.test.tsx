import {act,render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect,it,vi} from 'vitest';
import VideoResult from '@/features/video/VideoResult';
import {fetchVideoResult} from '@/features/video/result';

it('loads only on demand, revokes previews and confirms one scoped deletion',async()=>{
 const create=vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:video-review');const revoke=vi.spyOn(URL,'revokeObjectURL');
 const fetch=vi.fn(async(_path:string,init?:RequestInit)=>init?.method==='DELETE' ? Response.json({deleted:true}):_path.endsWith('/results') ? Response.json({video:'available',last_frame:'missing'}):new Response(new Uint8Array([0,0,0,12,102,116,121,112,105,115,111,109]),{headers:{'content-type':'video/mp4'}}));vi.stubGlobal('fetch',fetch);
 const view=render(<VideoResult token="member" path="/scoped/jobs/review/results" canWrite/>);const user=userEvent.setup();await screen.findByRole('button',{name:'Load preview'});expect(fetch).toHaveBeenCalledTimes(1);
 await user.click(screen.getByRole('button',{name:'Load preview'}));await screen.findByRole('link',{name:'Download'});expect(create).toHaveBeenCalledTimes(1);expect(fetch.mock.calls[1][0]).toBe('/scoped/jobs/review/results/video');expect(fetch.mock.calls[1][1]?.headers).toEqual(expect.objectContaining({authorization:'Bearer member'}));
 await user.click(screen.getByRole('button',{name:'Delete saved results'}));await screen.findByRole('dialog');await user.click(screen.getByRole('button',{name:'Cancel',exact:true}));expect(fetch).toHaveBeenCalledTimes(2);
 await user.click(screen.getByRole('button',{name:'Delete saved results'}));await user.click(screen.getByRole('button',{name:'Delete results',exact:true}));await screen.findByText(/Saved results deleted/);expect(fetch).toHaveBeenCalledTimes(3);expect(fetch.mock.calls[2][1]?.method).toBe('DELETE');expect(revoke).toHaveBeenCalledWith('blob:video-review');expect(screen.queryByRole('link',{name:'Download'})).toBeNull();view.unmount();
});
it('reader cannot delete and a missing result never creates a fake preview or retries',async()=>{
 const fetch=vi.fn(async(path:string)=>path.endsWith('/results') ? Response.json({video:'available',last_frame:'missing'}):Response.json({error:{message:'private upstream details'}},{status:404}));vi.stubGlobal('fetch',fetch);
 render(<VideoResult token="member" path="/scoped/results" canWrite={false}/>);expect(screen.queryByRole('button',{name:'Delete saved results'})).toBeNull();
 await userEvent.setup().click(await screen.findByRole('button',{name:'Load preview'}));await screen.findByText('This result is missing, expired or deleted.');expect(screen.queryByRole('link',{name:'Download'})).toBeNull();expect(document.body.textContent).not.toContain('private upstream');expect(fetch).toHaveBeenCalledTimes(2);
});
it('scope changes abort outstanding reads and revoke any cached result',async()=>{
 vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:scope-preview');const revoke=vi.spyOn(URL,'revokeObjectURL');vi.stubGlobal('fetch',vi.fn(async(path:string)=>path.endsWith('/results') ? Response.json({video:'available',last_frame:'missing'}):new Response(new Uint8Array([1]),{headers:{'content-type':'video/mp4'}})));
 const view=render(<VideoResult token="member" path="/first/results" canWrite/>);await userEvent.setup().click(await screen.findByRole('button',{name:'Load preview'}));await screen.findByRole('link',{name:'Download'});
 view.rerender(<VideoResult token="member" path="/second/results" canWrite/>);await waitFor(()=>expect(revoke).toHaveBeenCalledWith('blob:scope-preview'));expect(screen.queryByRole('link',{name:'Download'})).toBeNull();
});
it('rejects HTML and oversized declared bodies before buffering',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('<script>private</script>',{headers:{'content-type':'text/html'}})));await expect(fetchVideoResult('member','/result','video',new AbortController().signal)).rejects.toThrow(/file type/);
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(new Uint8Array([1]),{headers:{'content-type':'video/mp4','content-length':String(65*1024*1024)}})));await expect(fetchVideoResult('member','/result','video',new AbortController().signal)).rejects.toThrow(/limit/);
});

it('unavailable saved results survive a fresh mount and missing optional frames are hidden',async()=>{
 const fetch=vi.fn(async()=>Response.json({video:'unavailable',last_frame:'missing'}));vi.stubGlobal('fetch',fetch);
 render(<VideoResult token="member" path="/scoped/results" canWrite/>);
 await screen.findByText('Saved results are no longer available.');expect(screen.queryByRole('button',{name:'Load preview'})).toBeNull();expect(screen.queryByRole('button',{name:'Last frame'})).toBeNull();expect(fetch).toHaveBeenCalledTimes(1);
});

it('shows safe retrieval diagnostics without marking an upstream failure as local deletion',async()=>{
 const fetch=vi.fn(async(path:string)=>path.endsWith('/results') ? Response.json({video:'available',last_frame:'missing'}):Response.json({error:{type:'media_result_timeout',message:'private signed URL'}},{status:504}));vi.stubGlobal('fetch',fetch);
 render(<VideoResult token="member" path="/scoped/results" canWrite={false}/>);
 const user=userEvent.setup();await user.click(await screen.findByRole('button',{name:'Load preview'}));
 await screen.findByRole('alert');expect(screen.getByRole('alert').textContent).toBe('Result retrieval timed out. Try loading the preview again.');
 expect((screen.getByRole('button',{name:'Load preview'}) as HTMLButtonElement).disabled).toBe(false);expect(screen.queryByRole('link',{name:'Download'})).toBeNull();expect(document.body.textContent).not.toContain('private signed URL');expect(fetch).toHaveBeenCalledTimes(2);
});
it('bounds error reads and ignores unknown or conflicting diagnostic categories',async()=>{
 for(const response of [Response.json({error:{type:'unknown',message:'private signed URL'}},{status:502}),Response.json({error:{type:'media_result_timeout',message:'private signed URL'}},{status:502}),Response.json({error:{type:'media_result_timeout',message:'x'.repeat(9000)}},{status:504}),new Response('<html>private signed URL</html>',{status:502})]) {
  vi.stubGlobal('fetch',vi.fn(async()=>response));await expect(fetchVideoResult('member','/result','video',new AbortController().signal)).rejects.toThrow('This result could not be safely retrieved.');
 }
});

it('does not erase the current preview when an old job deletion finishes after a scope change',async()=>{
 let finish!: (response:Response)=>void;
 const pending=new Promise<Response>(resolve=>{finish=resolve;});
 const create=vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:current-job');
 const revoke=vi.spyOn(URL,'revokeObjectURL');
 let deletionSignal:AbortSignal|undefined;
 const fetch=vi.fn(async(path:string,init?:RequestInit)=>{
  if(init?.method==='DELETE'){deletionSignal=init.signal as AbortSignal;return pending;}
  if(path.endsWith('/results'))return Response.json({video:'available',last_frame:'missing'});
  return new Response(new Uint8Array([1]),{headers:{'content-type':'video/mp4'}});
 });vi.stubGlobal('fetch',fetch);
 const view=render(<VideoResult token="member" path="/old/results" canWrite/>);const user=userEvent.setup();
 await user.click(await screen.findByRole('button',{name:'Delete saved results'}));
 await user.click(screen.getByRole('button',{name:'Delete results',exact:true}));
 await waitFor(()=>expect(deletionSignal).toBeDefined());
 view.rerender(<VideoResult token="member" path="/current/results" canWrite/>);
 expect(deletionSignal?.aborted).toBe(true);
 await user.click(await screen.findByRole('button',{name:'Load preview'}));
 await screen.findByRole('link',{name:'Download'});expect(create).toHaveBeenCalledTimes(1);
 await act(async()=>{finish(Response.json({deleted:true}));await pending;});
 expect(screen.getByRole('link',{name:'Download'}).getAttribute('href')).toBe('blob:current-job');
 expect(screen.queryByText(/Saved results deleted/)).toBeNull();
 expect(revoke).not.toHaveBeenCalledWith('blob:current-job');
 expect(fetch.mock.calls.filter(call=>call[1]?.method==='DELETE')).toHaveLength(1);
});
