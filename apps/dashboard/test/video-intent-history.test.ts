import { expect, it, vi } from 'vitest';
import { videoIntentHistory } from '../src/features/video/intent-history';
import type { VideoSubmissionIntent } from '../../../sdks/javascript/src/admin';
import { NiuAPIError } from '../../../sdks/javascript/src/index';
const scope={organizationId:'company',projectId:'workspace'};
const entry={id:'intent',revision:1,expires_at_ms:'1800000000000',content_state:'retained' as const};
const document:VideoSubmissionIntent={...entry,original_key_id:'key',key_id:'rotated-key',model:'Video model',funding_mode:'owner_funded',request:{model:'Video model',content:[{type:'text',text:'A landscape\nwith sunset'}]},submission_state:'dispatched',job:{id:'original-job',object:'video.job',model:'Video model',status:'queued'}};
it('discovers retained input and its original job using reads only',async()=>{
  const client={listVideoIntents:vi.fn().mockResolvedValue({data:[entry],has_more:true,next_before:'next'}),getVideoIntent:vi.fn().mockResolvedValue({data:document})};
  const options={signal:new AbortController().signal};
  const page=await videoIntentHistory(client,scope,{limit:25},options);
  expect(page).toMatchObject({data:[{title:'Video · A landscape',jobId:'original-job',keyId:'rotated-key',scope}],has_more:true,next_before:'next',incomplete:false});
  expect(client.listVideoIntents).toHaveBeenCalledWith(scope,{limit:25},options);
  expect(client.getVideoIntent).toHaveBeenCalledWith(scope,'intent',options);
});
it('keeps owner metadata discoverable after key revocation without showing IDs as labels',async()=>{
  const client={listVideoIntents:vi.fn().mockResolvedValue({data:[entry],has_more:false,next_before:null}),getVideoIntent:vi.fn().mockRejectedValue(new NiuAPIError(403,{error:{message:'Denied'}}))};
  const page=await videoIntentHistory(client,scope);
  expect(page.data[0].title).toMatch(/^Saved video request · Expires /);expect(page.data[0].revision).toBe(1);
  expect(page.incomplete).toBe(false);
  expect(page.data[0].title).not.toContain(entry.id);
});
it('removes deleted inputs and flags partial content failures',async()=>{
  const client={listVideoIntents:vi.fn().mockResolvedValue({data:[{...entry,id:'deleted',content_state:'deleted'},entry],has_more:false,next_before:null}),getVideoIntent:vi.fn().mockRejectedValue(new Error('Network failed'))};
  const page=await videoIntentHistory(client,scope);
  expect(page.data).toHaveLength(1);expect(page.incomplete).toBe(true);
  expect(client.getVideoIntent).toHaveBeenCalledTimes(1);
});
it('bounds parallel reads and keeps index order',async()=>{
  let active=0,maximum=0;
  const releases:Array<()=>void>=[];
  const entries=Array.from({length:7},(_,i)=>({...entry,id:`intent-${i}`}));
  const client={listVideoIntents:vi.fn().mockResolvedValue({data:entries,has_more:false,next_before:null}),getVideoIntent:vi.fn(async(_scope:typeof scope,id:string)=>{active++;maximum=Math.max(active,maximum);await new Promise<void>(resolve=>releases.push(resolve));active--;return {data:{...document,id}};})};
  const pending=videoIntentHistory(client,scope);
  await vi.waitFor(()=>expect(releases).toHaveLength(4));
  releases.splice(0).reverse().forEach(release=>release());
  await vi.waitFor(()=>expect(releases).toHaveLength(3));
  releases.splice(0).forEach(release=>release());
  const page=await pending;
  expect(maximum).toBe(4);expect(page.data.map(row=>row.id)).toEqual(entries.map(row=>row.id));
});
it('does not turn cancellation into a recoverable metadata fallback',async()=>{
  const controller=new AbortController();
  const client={listVideoIntents:vi.fn().mockResolvedValue({data:[entry],has_more:false,next_before:null}),getVideoIntent:vi.fn(async()=>{controller.abort();throw new Error('Stopped');})};
  await expect(videoIntentHistory(client,scope,{}, {signal:controller.signal})).rejects.toMatchObject({name:'AbortError'});
});
