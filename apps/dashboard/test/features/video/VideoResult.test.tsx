import {act,render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect,it,vi} from 'vitest';
import VideoResult from '@/features/video/VideoResult';
import {fetchVideoResult,ResultReadError} from '@/features/video/result';
import type {NiuAdminClient} from '@niu-io/sdk/admin';

const scope={organizationId:'organization',projectId:'workspace'};
function makeClient(options:{
  availability?:string;
  content?:(task:string,kind:string,req?:{signal?:AbortSignal})=>Promise<Response>;
  refresh?:(scope:unknown,keyId:string,task:string,kind:string,req?:{signal?:AbortSignal})=>Promise<Response>;
  remove?:(scope:unknown,keyId:string,task:string,req?:{signal?:AbortSignal})=>Promise<unknown>;
}={}) {
  const availability=options.availability??'available';
  const retrieve=vi.fn(async()=>({data:{artifacts:[{kind:'video',availability}]}}));
  const content=vi.fn(options.content??(async()=>new Response(new Uint8Array([0,0,0,12,102,116,121,112,105,115,111,109]),{headers:{'content-type':'video/mp4'}})));
  const refresh=vi.fn(options.refresh??(async()=>new Response(new Uint8Array([0,0,0,12,102,116,121,112,105,115,111,109]),{headers:{'content-type':'video/mp4'}})));
  const remove=vi.fn(options.remove??(async()=>({deleted:true})));
  const client={generations:()=>({tasks:{retrieve},artifacts:{content}}),refreshDashboardVideoResult:refresh,deleteDashboardVideoResults:remove} as unknown as NiuAdminClient;
  return {client,retrieve,content,refresh,remove};
}

it('loads available preview, revokes previews and confirms one scoped deletion',async()=>{
 const create=vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:video-review');const revoke=vi.spyOn(URL,'revokeObjectURL');
 const f=makeClient();
 const view=render(<VideoResult client={f.client} scope={scope} task="review" keyId="key" canWrite/>);const user=userEvent.setup();
 await screen.findByRole('link',{name:'Download'});expect(create).toHaveBeenCalledTimes(1);expect(f.content).toHaveBeenCalledTimes(1);
 await user.click(screen.getByRole('button',{name:'Video actions'}));
 await user.click(screen.getByRole('menuitem',{name:'Delete saved results'}));
 await screen.findByRole('dialog');await user.click(screen.getByRole('button',{name:'Cancel',exact:true}));expect(f.remove).not.toHaveBeenCalled();
 await user.click(screen.getByRole('button',{name:'Video actions'}));
 await user.click(screen.getByRole('menuitem',{name:'Delete saved results'}));
 await user.click(screen.getByRole('button',{name:'Delete results',exact:true}));
 await waitFor(()=>expect(f.remove).toHaveBeenCalledTimes(1));expect(revoke).toHaveBeenCalledWith('blob:video-review');expect(screen.queryByRole('link',{name:'Download'})).toBeNull();view.unmount();
});
it('reader cannot delete and a missing result never creates a fake preview or retries',async()=>{
 const f=makeClient({content:async()=>Response.json({error:{message:'private upstream details'}},{status:404})});
 render(<VideoResult client={f.client} scope={scope} task="review" canWrite={false}/>);expect(screen.queryByRole('button',{name:'Delete saved results'})).toBeNull();
 await screen.findByText('No downloadable result was returned.');expect(screen.queryByRole('link',{name:'Download'})).toBeNull();expect(document.body.textContent).not.toContain('private upstream');expect(f.content).toHaveBeenCalledTimes(1);
});
it('scope changes abort outstanding reads and revoke any cached result',async()=>{
 vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:scope-preview');const revoke=vi.spyOn(URL,'revokeObjectURL');
 const f=makeClient();
 const view=render(<VideoResult client={f.client} scope={scope} task="first" keyId="key" canWrite/>);await screen.findByRole('link',{name:'Download'});
 view.rerender(<VideoResult client={f.client} scope={scope} task="second" keyId="key" canWrite/>);await waitFor(()=>expect(revoke).toHaveBeenCalledWith('blob:scope-preview'));
});
it('rejects HTML and oversized declared bodies before buffering',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('<script>private</script>',{headers:{'content-type':'text/html'}})));await expect(fetchVideoResult('member','/result','video',new AbortController().signal)).rejects.toThrow(/file type/);
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(new Uint8Array([1]),{headers:{'content-type':'video/mp4','content-length':String(65*1024*1024)}})));await expect(fetchVideoResult('member','/result','video',new AbortController().signal)).rejects.toThrow(/limit/);
});

it('unavailable saved results survive a fresh mount and missing optional frames are hidden',async()=>{
 const f=makeClient({availability:'unavailable'});
 render(<VideoResult client={f.client} scope={scope} task="review" keyId="key" canWrite/>);
 await screen.findByText('Video preview unavailable');expect(screen.queryByRole('button',{name:'Last frame'})).toBeNull();expect(f.retrieve).toHaveBeenCalledTimes(1);expect(f.content).not.toHaveBeenCalled();
});

it('shows safe retrieval diagnostics without marking an upstream failure as local deletion',async()=>{
 const f=makeClient({content:async()=>Response.json({error:{type:'media_result_timeout',message:'private signed URL'}},{status:504})});
 render(<VideoResult client={f.client} scope={scope} task="review" canWrite={false}/>);
 await screen.findByRole('alert');expect(screen.getByRole('alert').textContent).toBe('Result retrieval timed out. Try loading the preview again.');
 expect(screen.queryByRole('link',{name:'Download'})).toBeNull();expect(document.body.textContent).not.toContain('private signed URL');expect(f.content).toHaveBeenCalledTimes(1);
});
it('bounds error reads and ignores unknown or conflicting diagnostic categories',async()=>{
 for(const response of [Response.json({error:{type:'unknown',message:'private signed URL'}},{status:502}),Response.json({error:{type:'media_result_timeout',message:'private signed URL'}},{status:502}),Response.json({error:{type:'media_result_timeout',message:'x'.repeat(9000)}},{status:504}),new Response('<html>private signed URL</html>',{status:502})]) {
  vi.stubGlobal('fetch',vi.fn(async()=>response));await expect(fetchVideoResult('member','/result','video',new AbortController().signal)).rejects.toThrow('This result could not be safely retrieved.');
 }
});

it('does not erase the current preview when an old job deletion finishes after a scope change',async()=>{
 let finish!: (response:unknown)=>void;
 const pending=new Promise<unknown>(resolve=>{finish=resolve;});
 const create=vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:current-job');
 const revoke=vi.spyOn(URL,'revokeObjectURL');
 let deletionSignal:AbortSignal|undefined;
 const f=makeClient({remove:async(_s,_k,_t,req)=>{deletionSignal=req?.signal;return pending;}});
 const view=render(<VideoResult client={f.client} scope={scope} task="old" keyId="key" canWrite/>);const user=userEvent.setup();
 await screen.findByRole('link',{name:'Download'});
 await user.click(screen.getByRole('button',{name:'Video actions'}));
 await user.click(screen.getByRole('menuitem',{name:'Delete saved results'}));
 await user.click(screen.getByRole('button',{name:'Delete results',exact:true}));
 await waitFor(()=>expect(deletionSignal).toBeDefined());
 view.rerender(<VideoResult client={f.client} scope={scope} task="current" keyId="key" canWrite/>);
 expect(deletionSignal?.aborted).toBe(true);
 await screen.findByRole('link',{name:'Download'});expect(create).toHaveBeenCalledTimes(2);
 await act(async()=>{finish({deleted:true});await pending;});
 expect(screen.getByRole('link',{name:'Download'}).getAttribute('href')).toBe('blob:current-job');
 expect(screen.queryByText(/Video removed/)).toBeNull();
 expect(f.remove).toHaveBeenCalledTimes(1);
 void revoke;
 void ResultReadError;
});

it('fetches an existing result afresh only after an explicit click and never submits a generation',async()=>{
 vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:renewed-video');
 const f=makeClient({availability:'unavailable'});
 render(<VideoResult client={f.client} scope={scope} task="existing" keyId="key" canWrite/>);
 await screen.findByText(/Video preview unavailable/);expect(f.retrieve).toHaveBeenCalledTimes(1);expect(f.refresh).not.toHaveBeenCalled();
 await userEvent.setup().click(screen.getByRole('button',{name:'Restore video'}));
 await screen.findByRole('link',{name:'Download'});
 expect(f.refresh).toHaveBeenCalledTimes(1);
 expect(f.refresh).toHaveBeenCalledWith(scope,'key','existing','video',expect.objectContaining({signal:expect.any(AbortSignal)}));
});

it('skips duplicate tasks.retrieve with initialArtifacts, renders cached video on Frame 0 across remounts, and refreshes or evicts on user action',async()=>{
 let seq=0;
 const create=vi.spyOn(URL,'createObjectURL').mockImplementation(()=>`blob:cached-${++seq}`);
 const revoke=vi.spyOn(URL,'revokeObjectURL');
 const f=makeClient();
 const initial=[{kind:'video' as const,availability:'available' as const,capture:null}];
 const first=render(<VideoResult client={f.client} scope={scope} task="cached-task" keyId="key" canWrite initialArtifacts={initial} cacheScope="tok"/>);
 await screen.findByRole('link',{name:'Download'});
 expect(f.retrieve).not.toHaveBeenCalled();
 expect(f.content).toHaveBeenCalledTimes(1);
 expect(create).toHaveBeenCalledTimes(1);

 first.unmount();
 expect(revoke).toHaveBeenCalledWith('blob:cached-1');

 const second=render(<VideoResult client={f.client} scope={scope} task="cached-task" keyId="key" canWrite initialArtifacts={initial} cacheScope="tok"/>);
 expect(screen.getByLabelText('Generated video').getAttribute('src')).toBe('blob:cached-2');
 expect(screen.queryByText('Loading video…')).toBeNull();
 expect(f.content).toHaveBeenCalledTimes(1);
 expect(f.retrieve).not.toHaveBeenCalled();
 expect(create).toHaveBeenCalledTimes(2);

 const user=userEvent.setup();
 await user.click(screen.getByRole('button',{name:'Video actions'}));
 await user.click(screen.getByRole('menuitem',{name:'Reload preview'}));
 await waitFor(()=>expect(f.content).toHaveBeenCalledTimes(2));

 await user.click(screen.getByRole('button',{name:'Video actions'}));
 await user.click(screen.getByRole('menuitem',{name:'Delete saved results'}));
 await user.click(screen.getByRole('button',{name:'Delete results',exact:true}));
 await waitFor(()=>expect(f.remove).toHaveBeenCalledTimes(1));
 second.unmount();

 render(<VideoResult client={f.client} scope={scope} task="cached-task" keyId="key" canWrite initialArtifacts={initial} cacheScope="tok"/>);
 await waitFor(()=>expect(f.content).toHaveBeenCalledTimes(3));
});

it('caches both video and last_frame outputs without re-downloading when toggling',async()=>{
 let seq=0;
 vi.spyOn(URL,'createObjectURL').mockImplementation(()=>`blob:media-${++seq}`);
 const f=makeClient({
  content:async(_task,kind)=>new Response(
   new Uint8Array([1,2,3,4]),
   {headers:{'content-type':kind==='last_frame'?'image/png':'video/mp4'}},
  ),
 });
 const initial=[
  {kind:'video' as const,availability:'available' as const,capture:null},
  {kind:'last_frame' as const,availability:'available' as const,capture:null},
 ];
 render(<VideoResult client={f.client} scope={scope} task="multi-output" keyId="key" canWrite initialArtifacts={initial} cacheScope="tok"/>);
 await screen.findByLabelText('Generated video');
 expect(f.content).toHaveBeenCalledTimes(1);

 const user=userEvent.setup();
 await user.click(screen.getByRole('button',{name:'Last frame'}));
 await screen.findByAltText('Generated last frame');
 expect(f.content).toHaveBeenCalledTimes(2);

 await user.click(screen.getByRole('button',{name:'Video'}));
 await screen.findByLabelText('Generated video');
 expect(f.content).toHaveBeenCalledTimes(2);

 await user.click(screen.getByRole('button',{name:'Last frame'}));
 await screen.findByAltText('Generated last frame');
 expect(f.content).toHaveBeenCalledTimes(2);
});

it('does not abort initial preview download when keyId resolves from undefined to a key',async()=>{
 vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:async-key');
 let resolveContent!:(r:Response)=>void;
 const f=makeClient({content:()=>new Promise<Response>(r=>{resolveContent=r;})});
 const initial=[{kind:'video' as const,availability:'available' as const,capture:null}];
 const view=render(<VideoResult client={f.client} scope={scope} task="async-key-task" canWrite initialArtifacts={initial} cacheScope="tok"/>);
 await waitFor(()=>expect(f.content).toHaveBeenCalledTimes(1));
 view.rerender(<VideoResult client={f.client} scope={scope} task="async-key-task" keyId="key" canWrite initialArtifacts={initial} cacheScope="tok"/>);
 resolveContent(new Response(new Uint8Array([0,0,0,12,102,116,121,112,105,115,111,109]),{headers:{'content-type':'video/mp4'}}));
 await screen.findByLabelText('Generated video');
 expect(f.content).toHaveBeenCalledTimes(1);
});
