import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useChatDraft, type ChatDraft } from '../../../src/features/playground/useChatDraft';

const empty:ChatDraft={sessionId:null,prompt:'',models:['fast'],attachments:[],settings:{systemPrompt:'',maxTokens:512,temperature:0.7,logPayloads:true}};
const args={token:'member',endpoint:'/draft',identity:'first',enabled:true};
describe('durable composer drafts',()=>{
  it('saves unsent text, models, attachments and settings and restores on a fresh mount',async()=>{
    let payload:ChatDraft|null=null,revision=0;
    const requests=vi.fn(async(_input:RequestInfo|URL,init?:RequestInit)=>{
      if(init?.method==='PUT') {const body=JSON.parse(String(init.body));expect(body.expected_revision).toBe(revision);payload=body.payload;revision++;}
      return Response.json({data:{payload,revision}});
    });vi.stubGlobal('fetch',requests);
    const restore=vi.fn();
    const view=renderHook(({value})=>useChatDraft({...args,value,restore}),{initialProps:{value:empty}});
    await waitFor(()=>expect(view.result.current.ready).toBe(true));
    const edited={...empty,prompt:'Unsent text',models:['fast','other'],attachments:[{name:'note.md',type:'text',content:'Draft context'}],settings:{...empty.settings,systemPrompt:'Be precise',temperature:0.3}};
    view.rerender({value:edited});
    await act(async()=>{expect(await view.result.current.flush()).toBe(true);});
    expect(payload).toEqual(edited);expect(view.result.current.error).toBe('');
    view.unmount();
    const fresh=renderHook(()=>useChatDraft({...args,value:empty,restore}));
    await waitFor(()=>expect(restore).toHaveBeenCalledWith(edited));
    expect(fresh.result.current.ready).toBe(true);
    expect(requests.mock.calls.filter(([,init])=>init?.method==='PUT')).toHaveLength(1);
  });
  it('keeps local edits after rejection and loads the competing draft only on explicit recovery',async()=>{
    let readCount=0;
    const remote={...empty,prompt:'Other tab draft'};
    const restore=vi.fn();
    vi.stubGlobal('fetch',vi.fn(async(_input:RequestInfo|URL,init?:RequestInit)=>init?.method==='PUT'
      ? new Response(null,{status:409}) : Response.json({data:{payload:++readCount===1?null:remote,revision:readCount===1?0:2}})));
    const view=renderHook(({value})=>useChatDraft({...args,value,restore}),{initialProps:{value:empty}});
    await waitFor(()=>expect(view.result.current.ready).toBe(true));
    const edited={...empty,prompt:'My unsent draft'};view.rerender({value:edited});
    await act(async()=>{expect(await view.result.current.flush()).toBe(false);});
    expect(view.result.current.conflict).toBe(true);expect(restore).not.toHaveBeenCalled();
    await act(async()=>view.result.current.retry());
    await waitFor(()=>expect(restore).toHaveBeenCalledWith(remote));
  });
  it('ignores another account’s late draft read',async()=>{
    let finish!:(response:Response)=>void;
    const restore=vi.fn();
    vi.stubGlobal('fetch',vi.fn((input:RequestInfo|URL)=>String(input)==='/first'
      ? new Promise<Response>(resolve=>{finish=resolve;}) : Promise.resolve(Response.json({data:{payload:null,revision:0}}))));
    const view=renderHook(({identity,endpoint})=>useChatDraft({...args,identity,endpoint,value:empty,restore}),{initialProps:{identity:'first',endpoint:'/first'}});
    view.rerender({identity:'second',endpoint:'/second'});
    await waitFor(()=>expect(view.result.current.ready).toBe(true));
    await act(async()=>finish(Response.json({data:{payload:{...empty,prompt:'Private old draft'},revision:1}})));
    expect(restore).not.toHaveBeenCalled();
  });
});
