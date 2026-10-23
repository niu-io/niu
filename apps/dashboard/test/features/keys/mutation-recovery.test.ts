import { beforeEach, expect, it, vi } from 'vitest';
import { KeyRequestError } from '../../../src/features/keys/api';
import { confirmedKeyValidationFailure, forgetPendingKeyMutation, readPendingKeyMutation, reconcileKeyMutation, recoveryCacheKey, savePendingKeyMutation, submitKeyMutation, type PendingKeyMutation } from '../../../src/features/keys/mutation-recovery';

const requestId='12345678-1234-4234-8234-123456789abc';
const pending: PendingKeyMutation={version:1,requestId,action:'create',label:'App',body:{name:'App',ttl_seconds:3600}};
const key={id:'key',name:'App',allowed_models:['fast'],revoked:false,expired:false,expires_at_ms:null};
const cacheKey=recoveryCacheKey('member','workspace');
beforeEach(()=>{localStorage.clear();});

it('retains a secret-free pending hint across navigation and isolates actors/workspaces',()=>{
 savePendingKeyMutation(localStorage,cacheKey,pending);
 expect(readPendingKeyMutation(localStorage,cacheKey)).toEqual(pending);
 expect(readPendingKeyMutation(localStorage,recoveryCacheKey('other','workspace'))).toBeNull();
 expect(readPendingKeyMutation(localStorage,recoveryCacheKey('member','other'))).toBeNull();
 forgetPendingKeyMutation(localStorage,cacheKey,'different-request');
 expect(readPendingKeyMutation(localStorage,cacheKey)).toEqual(pending);
 forgetPendingKeyMutation(localStorage,cacheKey,requestId);
 expect(readPendingKeyMutation(localStorage,cacheKey)).toBeNull();
});
it('does not erase an unreadable pending request or permit an untracked submission',()=>{
 localStorage.setItem(cacheKey,'broken');
 expect(()=>readPendingKeyMutation(localStorage,cacheKey)).toThrow(/cannot be read/);
 expect(localStorage.getItem(cacheKey)).toBe('broken');
 expect(()=>savePendingKeyMutation({setItem(){throw new Error('denied');}} as unknown as Storage,cacheKey,pending)).toThrow(/has not been sent/);
});
it('retries the original request after a pre-commit response loss rather than changing identity',async()=>{
 const calls: RequestInit[]=[];
 vi.stubGlobal('fetch',vi.fn(async(_input,init)=>{calls.push(init);if(calls.length===1)throw new TypeError('offline');return Response.json({id:'key',token:'one-time-secret',secret_available:true});}));
 await expect(submitKeyMutation('session','/keys',pending)).rejects.toThrow('offline');
 expect(await submitKeyMutation('session','/keys',pending)).toEqual({kind:'issued',issued:{id:'key',token:'one-time-secret',secret_available:true}});
 expect(calls.map(c=>new Headers(c.headers).get('idempotency-key'))).toEqual([requestId,requestId]);
 expect(calls[0].body).toBe(calls[1].body);
});
it('reconciles a committed replay without inventing or caching a secret',async()=>{
 const paths:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(input,init)=>{paths.push(String(input));return Response.json(init?.method==='POST'?{id:'key',secret_available:false,key}:{data:{action:'create',key}});}));
 expect(await submitKeyMutation('session','/keys',pending)).toEqual({kind:'recovered',key});
 expect(paths).toEqual(['/keys',`/keys/requests/${requestId}`]);
});
it('does not treat an absent observation as proof of failure',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({data:null})));
 expect(await reconcileKeyMutation('session','/keys',pending)).toEqual({kind:'unconfirmed'});
 expect(fetch).toHaveBeenCalledTimes(1);
});
it('preserves rotation target and stops on role loss',async()=>{
 const calls: Array<{path:string;init:RequestInit}>=[];
 vi.stubGlobal('fetch',vi.fn(async(input,init)=>{calls.push({path:String(input),init});return Response.json({error:{message:'Access removed'}},{status:403});}));
 await expect(submitKeyMutation('session','/keys',{...pending,action:'rotate',keyId:'original'})).rejects.toThrow('Access removed');
 expect(calls).toHaveLength(1);
 expect(calls[0].path).toBe('/keys/original/rotate');
 expect(calls[0].init.body).toBeUndefined();
 expect(confirmedKeyValidationFailure(new KeyRequestError('Access removed',403))).toBe(false);
});
it.each([400,422])('allows confirmed validation failure %s to be corrected',status=>{
 expect(confirmedKeyValidationFailure(new KeyRequestError('Invalid input',status))).toBe(true);
});
it.each([401,403,404,409,429,500,503])('retains recovery identity for uncertain or access error %s',status=>{
 expect(confirmedKeyValidationFailure(new KeyRequestError('Failure',status))).toBe(false);
});
