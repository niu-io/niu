import test from 'node:test';
import assert from 'node:assert/strict';
import {NiuClient,NiuAPIError} from '../dist/index.js';
const id='12345678-1234-1234-1234-123456789abc';
test('video result transport returns the body without JSON decoding and supports deletion and abort',async()=>{
 const calls=[];const signal=new AbortController().signal;
 const client=new NiuClient({apiKey:'workspace-key',fetch:async(url,init)=>{calls.push({url,init});return init.method==='DELETE' ? Response.json({deleted:true}):new Response(new Uint8Array([0,1,2]),{headers:{'content-type':'video/mp4'}});}});
 const response=await client.video.jobs.results.retrieve(id,'video',{signal});assert.equal(response.headers.get('content-type'),'video/mp4');assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[0,1,2]);
 assert.deepEqual(await client.video.jobs.results.delete(id),{deleted:true});assert.deepEqual(calls.map(c=>c.init.method),['GET','DELETE']);assert.equal(calls[0].init.signal,signal);assert.equal(calls[0].init.headers.get('authorization'),'Bearer workspace-key');assert.ok(calls[0].url.endsWith(`/video/jobs/${id}/results/video`));assert.equal(calls[1].init.body,undefined);
});
test('result failures make one request and reject invalid references before transport',async()=>{
 let calls=0;const client=new NiuClient({apiKey:'workspace-key',fetch:async()=>{calls++;return Response.json({error:{message:'Result unavailable'}},{status:502});}});
 assert.throws(()=>client.video.jobs.results.retrieve('invalid','video'),/reference/);assert.throws(()=>client.video.jobs.results.retrieve(id,'../../'),/kind/);await assert.rejects(client.video.jobs.results.delete('invalid'),/reference/);assert.equal(calls,0);
 await assert.rejects(client.video.jobs.results.retrieve(id,'last_frame'),e=>e instanceof NiuAPIError && e.status===502);assert.equal(calls,1);
});
test('saved result availability is a scoped metadata GET with cancellation',async()=>{
 let seen;const signal=new AbortController().signal;const client=new NiuClient({apiKey:'workspace-key',fetch:async(url,init)=>{seen={url,init};return Response.json({video:'unavailable',last_frame:'missing'});}});
 assert.deepEqual(await client.video.jobs.results.status(id,{signal}),{video:'unavailable',last_frame:'missing'});assert.ok(seen.url.endsWith(`/video/jobs/${id}/results`));assert.equal(seen.init.method,'GET');assert.equal(seen.init.signal,signal);
});
test('result failure categories and deadlines are preserved without automatic retries',async()=>{
 for(const [status,type] of [[502,'media_result_unavailable'],[502,'media_result_destination_rejected'],[502,'media_result_too_large'],[502,'media_result_invalid'],[502,'media_result_transport_error'],[503,'media_result_busy'],[503,'media_result_configuration_error'],[504,'media_result_timeout']]) {
  let calls=0;const body={error:{message:'Safe result diagnostic',type,code:status,param:null}};
  const client=new NiuClient({apiKey:'workspace-key',fetch:async()=>{calls++;return Response.json(body,{status});}});
  await assert.rejects(client.video.jobs.results.retrieve(id,'video'),error=>error instanceof NiuAPIError && error.status===status && error.responseBody.error.type===type && error.message==='Safe result diagnostic');
  assert.equal(calls,1,`${type} must not retry a result or generate a new job`);
 }
});
