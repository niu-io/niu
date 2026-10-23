import {afterEach,expect,it,vi} from 'vitest';
import {listOperators} from '../../../src/features/operators/api';
afterEach(()=>vi.unstubAllGlobals());
const row=(id:string)=>({id,name:'Same name',role:'owner',organization_id:'company',project_id:null,revoked:false});
it('reads every scoped page without conflating matching names',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(Response.json({data:[row('a')],next_cursor:'a'})).mockResolvedValueOnce(Response.json({data:[row('b')],next_cursor:null}));vi.stubGlobal('fetch',fetcher);
 const controller=new AbortController();const result=await listOperators('token','company',controller.signal);
 expect(result.data.map(row=>row.id)).toEqual(['a','b']);
 expect(fetcher.mock.calls[1][0]).toContain('organization_id=company&after=a');
 expect(fetcher.mock.calls[1][1].signal).toBe(controller.signal);
});
it('rejects partial inventory when a later page fails',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(Response.json({data:[row('a')],next_cursor:'a'})).mockResolvedValueOnce(Response.json({error:{message:'Unavailable'}},{status:503})));
 await expect(listOperators('token','company')).rejects.toThrow('Unavailable');
});
it('rejects repeated cursors and foreign-company records',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockImplementation(async()=>Response.json({data:[row('a')],next_cursor:'a'})));
 await expect(listOperators('token','company')).rejects.toThrow('did not advance');
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({data:[row('a')],next_cursor:null})));
 await expect(listOperators('token','another-company')).rejects.toThrow('unexpected company');
});
