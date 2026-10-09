import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAccountAppearance } from '../../src/app/useAccountAppearance';
import { readTheme, saveTheme } from '../../src/app/theme';

describe('saved account appearance', () => {
  it('retains the same member cache while refreshing the authoritative preference', async () => {
    vi.stubGlobal('matchMedia',vi.fn(()=>({matches:false})));
    localStorage.setItem('niu-dashboard-theme','dark');
    localStorage.setItem('niu-dashboard-theme-owner','first');
    let complete!: (response:Response)=>void;
    const fetcher=vi.fn(()=>new Promise<Response>(resolve=>{complete=resolve;}));
    vi.stubGlobal('fetch',fetcher);
    const view=renderHook(()=>useAccountAppearance('member','first',true));
    expect(view.result.current.ready).toBe(false);
    expect(readTheme()).toBe('dark');
    await act(async()=>{complete(Response.json({data:{color_mode:'light'}}));});
    await waitFor(()=>expect(view.result.current.ready).toBe(true));
    expect(readTheme()).toBe('light');
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('hydrates the account preference and restores it after cache clearing', async () => {
    vi.stubGlobal('matchMedia',vi.fn(()=>({matches:false})));
    localStorage.setItem('niu-dashboard-theme','light');
    const fetcher=vi.fn(async()=>Response.json({data:{color_mode:'dark'}}));
    vi.stubGlobal('fetch',fetcher);
    const first=renderHook(()=>useAccountAppearance('member','first',true));
    await waitFor(()=>expect(first.result.current.ready).toBe(true));
    expect(readTheme()).toBe('dark');
    act(()=>{localStorage.clear();window.dispatchEvent(new StorageEvent('storage',{key:null}));});
    expect(readTheme()).toBe('dark');
    expect(fetcher).toHaveBeenCalledOnce();
    first.unmount();
    localStorage.clear();
    const second=renderHook(()=>useAccountAppearance('member','first',true));
    await waitFor(()=>expect(second.result.current.ready).toBe(true));
    expect(readTheme()).toBe('dark');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('serializes rapid changes and restores the last confirmed mode on failure', async () => {
    vi.stubGlobal('matchMedia',vi.fn(()=>({matches:false})));
    let complete!: (response:Response)=>void;
    let writes=0;
    const fetcher=vi.fn<typeof fetch>(async(_url,init)=>{
      if (init?.method !== 'PUT') return Response.json({data:{color_mode:'system'}});
      writes++;
      if (writes===1) return new Promise(resolve=>{complete=resolve;});
      return Response.json({}, {status:503});
    });
    vi.stubGlobal('fetch',fetcher);
    const view=renderHook(()=>useAccountAppearance('member','first',true));
    await waitFor(()=>expect(view.result.current.ready).toBe(true));
    act(()=>{saveTheme('dark');saveTheme('light');});
    expect(writes).toBe(1);
    await act(async()=>{complete(Response.json({data:{color_mode:'dark'}}));});
    await waitFor(()=>expect(view.result.current.error).toContain('previous mode'));
    expect(writes).toBe(2);
    expect(readTheme()).toBe('dark');
    expect(JSON.parse(String(fetcher.mock.calls[2][1]?.body))).toEqual({color_mode:'light'});
  });

  it('ignores an old account response after switching accounts', async () => {
    vi.stubGlobal('matchMedia',vi.fn(()=>({matches:false})));
    let old!: (response:Response)=>void;
    vi.stubGlobal('fetch',vi.fn<typeof fetch>(async(_url,init)=>init?.headers && new Headers(init.headers).get('authorization')==='Bearer old'
      ? new Promise(resolve=>{old=resolve;})
      : Response.json({data:{color_mode:'light'}})));
    const view=renderHook(({token})=>useAccountAppearance(token,token,true),{initialProps:{token:'old'}});
    view.rerender({token:'new'});
    await waitFor(()=>expect(view.result.current.ready).toBe(true));
    await act(async()=>{old(Response.json({data:{color_mode:'dark'}}));});
    expect(readTheme()).toBe('light');
  });

  it('persists docs choices and never treats cache removal as a preference change', async () => {
    vi.stubGlobal('matchMedia',vi.fn(()=>({matches:false})));
    const fetcher=vi.fn<typeof fetch>(async(_url,init)=>Response.json({data:{color_mode:init?.method==='PUT'?JSON.parse(String(init.body)).color_mode:'system'}}));
    vi.stubGlobal('fetch',fetcher);
    const view=renderHook(()=>useAccountAppearance('member','first',true));
    await waitFor(()=>expect(view.result.current.ready).toBe(true));
    act(()=>{localStorage.setItem('niu-dashboard-theme','dark');window.dispatchEvent(new StorageEvent('storage',{key:'niu-dashboard-theme-intent',newValue:JSON.stringify({theme:'dark',owner:'first'})}));});
    await waitFor(()=>expect(view.result.current.saving).toBe(false));
    expect(fetcher.mock.calls.filter(([,init])=>init?.method==='PUT')).toHaveLength(1);
    act(()=>{localStorage.removeItem('niu-dashboard-theme');window.dispatchEvent(new StorageEvent('storage',{key:'niu-dashboard-theme',newValue:null}));});
    expect(readTheme()).toBe('dark');
    expect(fetcher.mock.calls.filter(([,init])=>init?.method==='PUT')).toHaveLength(1);
  });

  it('does not save cache hydration or another member’s document choice', async () => {
    vi.stubGlobal('matchMedia',vi.fn(()=>({matches:false})));
    const fetcher=vi.fn(async()=>Response.json({data:{color_mode:'system'}}));
    vi.stubGlobal('fetch',fetcher);
    const view=renderHook(()=>useAccountAppearance('member','first',true));
    await waitFor(()=>expect(view.result.current.ready).toBe(true));
    act(()=>{
      window.dispatchEvent(new StorageEvent('storage',{key:'niu-dashboard-theme',newValue:'dark'}));
      window.dispatchEvent(new StorageEvent('storage',{key:'niu-dashboard-theme-intent',newValue:JSON.stringify({theme:'dark',owner:'other'})}));
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('offers a reload after the preference read fails', async () => {
    vi.stubGlobal('matchMedia',vi.fn(()=>({matches:false})));
    let fail=true;
    vi.stubGlobal('fetch',vi.fn(async()=>fail?Response.json({}, {status:503}):Response.json({data:{color_mode:'dark'}})));
    const view=renderHook(()=>useAccountAppearance('member','first',true));
    await waitFor(()=>expect(view.result.current.error).toContain('load'));
    expect(view.result.current.ready).toBe(false);
    fail=false;act(()=>view.result.current.reload());
    await waitFor(()=>expect(view.result.current.ready).toBe(true));
    expect(readTheme()).toBe('dark');
    expect(view.result.current.error).toBe('');
  });
});
