import { beforeEach, expect, it, vi } from 'vitest';
import { KeyRequestError } from '../../../app/features/keys/api';
import { confirmedKeyValidationFailure, forgetKeyMutationHint, keyMutationHintKey, readKeyMutationHint, reconcileKeyMutation, rememberKeyMutationHint, submitKeyMutation, type PendingKeyMutation } from '../../../app/features/keys/mutation-recovery';

const requestId='12345678-1234-4234-8234-123456789abc';
const pending: PendingKeyMutation={version:1,requestId,action:'create',label:'App',body:{name:'App',ttl_seconds:3600}};
const key={id:'key',name:'App',allowed_models:['fast'],revoked:false,expired:false,expires_at_ms:null};
const cacheKey=keyMutationHintKey('member','workspace');
beforeEach(()=>{localStorage.clear();});

it('retains a secret-free hint across navigation and isolates actors/workspaces',()=>{
 rememberKeyMutationHint(cacheKey,pending);
 expect(readKeyMutationHint(cacheKey)).toEqual(pending);
 expect(readKeyMutationHint(keyMutationHintKey('other','workspace'))).toBeNull();
 expect(readKeyMutationHint(keyMutationHintKey('member','other'))).toBeNull();
 forgetKeyMutationHint(cacheKey,'different-request');
 expect(readKeyMutationHint(cacheKey)).toEqual(pending);
 forgetKeyMutationHint(cacheKey,requestId);
 expect(readKeyMutationHint(cacheKey)).toBeNull();
});
it('treats a corrupt hint or unavailable browser storage as no hint',()=>{
 localStorage.setItem(cacheKey,'broken');
 expect(readKeyMutationHint(cacheKey)).toBeNull();
 localStorage.setItem(cacheKey,JSON.stringify({version:1,requestId:'not-a-uuid',action:'create',label:'App',body:{}}));
 expect(readKeyMutationHint(cacheKey)).toBeNull();
 const getItem=vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('denied');});
 expect(readKeyMutationHint(cacheKey)).toBeNull();
 expect(()=>rememberKeyMutationHint(cacheKey,pending)).not.toThrow();
 getItem.mockRestore();
 const setItem=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('denied');});
 expect(()=>rememberKeyMutationHint(cacheKey,pending)).not.toThrow();
 expect(()=>forgetKeyMutationHint(cacheKey,requestId)).not.toThrow();
 setItem.mockRestore();
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
it('keeps server conflict visible without authorizing a fresh mutation',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({error:{message:'Idempotency-Key was already used'}},{status:409})));
 await expect(submitKeyMutation('session','/keys',pending)).rejects.toThrow('Idempotency-Key was already used');
 expect(confirmedKeyValidationFailure(new KeyRequestError('Idempotency-Key was already used',409))).toBe(false);
});
it.each([400,422])('allows confirmed validation failure %s to be corrected',status=>{
 expect(confirmedKeyValidationFailure(new KeyRequestError('Invalid input',status))).toBe(true);
});
it.each([401,403,404,409,429,500,503])('retains recovery identity for uncertain or access error %s',status=>{
 expect(confirmedKeyValidationFailure(new KeyRequestError('Failure',status))).toBe(false);
});
