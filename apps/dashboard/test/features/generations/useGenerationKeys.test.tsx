import {afterEach,expect,it,vi} from 'vitest';
import {act,renderHook,waitFor} from '@testing-library/react';
import {useGenerationKeys} from '@/features/generations/useGenerationKeys';
import type {DashboardContext} from '@/app/dashboard-context';
const workspace=(id:string)=>({id,organization_id:'company',name:id,organization_name:'Company'});
const context=(ids:string[])=>({token:'member',workspace:workspace(ids[0]),workspaces:ids.map(workspace)}) as DashboardContext;
afterEach(()=>vi.unstubAllGlobals());
it('continues queued workspaces after read failures and excludes inactive keys',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(path:string)=>path.includes('/good/')
  ? Response.json({data:[{id:'active',name:'Active',revoked:false,expired:false},{id:'revoked',name:'Revoked',revoked:true},{id:'expired',name:'Expired',expired:true}]})
  : Response.json({error:{message:'Unavailable'}},{status:403})));
 const {result}=renderHook(()=>useGenerationKeys(context(['bad1','bad2','bad3','bad4','good']),true));
 await waitFor(()=>expect(result.current.loading).toBe(false));
 expect(result.current.keys.map(key=>key.id)).toEqual(['active']);
 expect(result.current.keys[0].workspace.id).toBe('good');
 expect(result.current.error).toBe('Some API keys could not be loaded.');
});
it('reloads fallback workspace scope and ignores a late prior response',async()=>{
 let finish!:(value:Response)=>void;
 vi.stubGlobal('fetch',vi.fn(async(path:string)=>path.includes('/old/')?new Promise<Response>(resolve=>{finish=resolve;}):Response.json({data:[{id:'new',name:'New',revoked:false,expired:false}]})));
 const fallback=(id:string)=>({...context([id]),workspaces:[]});
 const {result,rerender}=renderHook(({ctx})=>useGenerationKeys(ctx,true),{initialProps:{ctx:fallback('old')}});
 await waitFor(()=>expect(finish).toBeTypeOf('function'));
 rerender({ctx:fallback('new')});
 await waitFor(()=>expect(result.current.keys.map(key=>key.id)).toEqual(['new']));
 await act(async()=>finish(Response.json({data:[{id:'old',name:'Old',revoked:false,expired:false}]})));
 expect(result.current.keys.map(key=>key.id)).toEqual(['new']);
});
