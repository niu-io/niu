import {expect,it,vi} from 'vitest';
import {findVideoIntent} from '@/features/video/intent-history';
const scope={organizationId:'company',projectId:'workspace'};
it('resolves an older job only through the authorized workspace history',async()=>{
 const listVideoIntents=vi.fn(async(_scope:unknown,query?:{before?:string})=>({data:[{id:query?.before?'older':'recent',revision:1,content_state:'retained',expires_at_ms:'1800000000000'}],has_more:!query?.before,next_before:query?.before?null:'next'}));
 const getVideoIntent=vi.fn(async(_scope:unknown,id:string)=>({data:{id,revision:1,model:'Example video',key_id:'saved-key',content_state:'retained',expires_at_ms:'1800000000000',job:{id:id==='older'?'requested-job':'different-job'}}}));
 const client={listVideoIntents,getVideoIntent};
 expect(await findVideoIntent(client as never,scope,'requested-job')).toMatchObject({id:'older',jobId:'requested-job',keyId:'saved-key',scope});
 expect(listVideoIntents.mock.calls.map(call=>call[0])).toEqual([scope,scope]);
 expect(listVideoIntents.mock.calls[1][1]).toMatchObject({before:'next'});
});
it('refuses a repeated cursor instead of looping or inventing an association',async()=>{
 const listVideoIntents=vi.fn(async()=>({data:[],has_more:true,next_before:'same'}));
 await expect(findVideoIntent({listVideoIntents,getVideoIntent:vi.fn()} as never,scope,'job')).rejects.toThrow('did not advance');
 expect(listVideoIntents).toHaveBeenCalledTimes(2);
});
it('aborts discovery when the selected job or account changes',async()=>{
 const controller=new AbortController();
 const listVideoIntents=vi.fn(async()=>{controller.abort();return {data:[],has_more:false,next_before:null};});
 await expect(findVideoIntent({listVideoIntents,getVideoIntent:vi.fn()} as never,scope,'job',{signal:controller.signal})).rejects.toThrow();
 expect(listVideoIntents).toHaveBeenCalledTimes(1);
});
