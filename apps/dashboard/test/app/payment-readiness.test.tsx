import {act,renderHook,waitFor} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {usePaymentReadiness} from '@/app/payment-readiness';

it('fails closed for missing, malformed and failed readiness, then recovers after setup',async()=>{
 let body:unknown={data:{ready:false,reason:'payment_setup_required'}};
 const fetcher=vi.fn(async()=>Response.json(body));vi.stubGlobal('fetch',fetcher);
 const {result}=renderHook(()=>usePaymentReadiness('fixture-session'));
 await waitFor(()=>expect(result.current.status).toBe('blocked'));
 body={data:[]};act(()=>result.current.retry());
 await waitFor(()=>expect(result.current.status).toBe('error'));
 fetcher.mockRejectedValueOnce(new TypeError('Network unavailable'));act(()=>result.current.retry());
 await waitFor(()=>expect(result.current.status).toBe('error'));
 body={data:{ready:true,reason:null}};act(()=>window.dispatchEvent(new Event('niu:payment-mode')));
 await waitFor(()=>expect(result.current.status).toBe('ready'));
 fetcher.mockRejectedValueOnce(new TypeError('Disconnected'));act(()=>window.dispatchEvent(new Event('focus')));
 await waitFor(()=>expect(result.current.status).toBe('error'));
});

it('does not let an older response reopen features after setup becomes unavailable',async()=>{
 let resolve:(value:Response)=>void=()=>{};
 const fetcher=vi.fn().mockImplementationOnce(()=>new Promise<Response>(done=>{resolve=done;})).mockResolvedValue(Response.json({data:{ready:false,reason:'payment_setup_required'}}));
 vi.stubGlobal('fetch',fetcher);
 const {result}=renderHook(()=>usePaymentReadiness('fixture-session'));
 act(()=>window.dispatchEvent(new Event('niu:payment-mode')));
 await waitFor(()=>expect(result.current.status).toBe('blocked'));
 await act(async()=>resolve(Response.json({data:{ready:true,reason:null}})));
 expect(result.current.status).toBe('blocked');
});

it('does not check authenticated feature readiness before sign in',()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 renderHook(()=>usePaymentReadiness(''));expect(fetcher).not.toHaveBeenCalled();
});

it('binds readiness to the authenticated company and clears it immediately on scope changes',async()=>{
 let complete:(value:Response)=>void=()=>{};
 const fetcher=vi.fn().mockResolvedValueOnce(Response.json({data:{ready:true,reason:null}})).mockImplementationOnce(()=>new Promise<Response>(resolve=>{complete=resolve;})).mockResolvedValue(Response.json({data:{ready:false,reason:'payment_setup_required'}}));
 vi.stubGlobal('fetch',fetcher);
 const {result,rerender}=renderHook(({token,company})=>usePaymentReadiness(token,company),{initialProps:{token:'first-session',company:'funded-company'}});
 await waitFor(()=>expect(result.current.status).toBe('ready'));
 expect(fetcher.mock.calls[0][0]).toBe('/api/v1/payments/readiness?organization=funded-company');
 expect(fetcher.mock.calls[0][1].headers).toEqual({Authorization:'Bearer first-session'});
 rerender({token:'first-session',company:'other-company'});
 expect(result.current.status).toBe('loading');
 const pendingSignal=fetcher.mock.calls[1][1].signal as AbortSignal;
 rerender({token:'second-session',company:'other-company'});
 expect(pendingSignal.aborted).toBe(true);
 await waitFor(()=>expect(result.current.status).toBe('blocked'));
 await act(async()=>complete(Response.json({data:{ready:true,reason:null}})));
 expect(result.current.status).toBe('blocked');
 expect(fetcher.mock.calls.at(-1)?.[1].headers).toEqual({Authorization:'Bearer second-session'});
});

it('retains hidden same-company drafts through an outage but discards them on a confirmed block',async()=>{
 let body={data:{ready:true,reason:null as string|null}};
 const fetcher=vi.fn(async()=>Response.json(body));vi.stubGlobal('fetch',fetcher);
 const {result}=renderHook(()=>usePaymentReadiness('fixture-session','company'));
 await waitFor(()=>expect(result.current.status).toBe('ready'));
 fetcher.mockRejectedValueOnce(new TypeError('Offline'));
 act(()=>window.dispatchEvent(new Event('focus')));
 await waitFor(()=>expect(result.current.status).toBe('error'));
 expect(result.current.retainContent).toBe(true);
 act(()=>window.dispatchEvent(new Event('online')));
 await waitFor(()=>expect(result.current.status).toBe('ready'));
 body={data:{ready:false,reason:'payment_setup_required'}};
 act(()=>window.dispatchEvent(new Event('niu:payment-mode')));
 await waitFor(()=>expect(result.current.status).toBe('blocked'));
 expect(result.current.retainContent).toBe(false);
});
