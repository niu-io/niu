import test from 'node:test';
import assert from 'node:assert/strict';
import { NiuAdminClient } from '../dist/index.js';
const id = '12345678-1234-1234-1234-123456789abc';
const scope = {organizationId:id, projectId:id};
test('dashboard Video preserves scope, methods, bodies and cancellation without key secrets', async () => {
  const calls=[];
  const client=new NiuAdminClient({adminToken:'member-session', fetch:async(url,init)=>{calls.push({url,init});return Response.json({status:'queued'});}});
  const input={model:'video',content:[{type:'text',text:'A landscape'}]};
  const signal=new AbortController().signal;
  await client.listDashboardVideoJobs(scope,id,{limit:2,before:id},{signal});
  await client.estimateDashboardVideo(scope,id,input);
  await client.createDashboardVideoJob(scope,id,input);
  await client.getDashboardVideoJob(scope,id,id);
  await client.getDashboardVideoBilling(scope,id,id);
  await client.getDashboardVideoTimings(scope,id,id);
  await client.refreshDashboardVideoJob(scope,id,id);
  assert.equal(calls.length,7);
  const prefix=`/admin/v1/organizations/${id}/projects/${id}/keys/${id}/video`;
  assert.ok(calls.every(c=>new URL(c.url).pathname.startsWith(prefix)));
  assert.deepEqual(calls.map(c=>c.init.method),['GET','POST','POST','GET','GET','GET','POST']);
  assert.equal(calls[0].init.signal,signal);
  assert.equal(new URL(calls[0].url).searchParams.get('limit'),'2');
  assert.deepEqual(JSON.parse(calls[2].init.body),input);
  assert.equal(calls[6].init.body,'{}');
  assert.ok(calls.every(c=>c.init.headers.authorization==='Bearer member-session'));
});
test('dashboard Video rejects invalid references and unbounded pages before transport', () => {
  const client=new NiuAdminClient({adminToken:'member-session',fetch:()=>{throw Error('unexpected transport');}});
  assert.throws(()=>client.listDashboardVideoJobs(scope,id,{limit:101}),/limit/);
  assert.throws(()=>client.listDashboardVideoJobs(scope,id,{before:'bad'}));
  assert.throws(()=>client.getDashboardVideoJob(scope,id,'bad'));
});

test('dashboard Video discovery uses a scoped session GET and carries cancellation', async () => {
  let captured;
  const client=new NiuAdminClient({adminToken:'member-session',baseURL:'https://niu.example/admin/v1',fetch:async(url,init)=>{captured={url,init};return Response.json({object:'list',data:[]});}});
  const signal=new AbortController().signal;
  assert.deepEqual(await client.listDashboardVideoModels(scope,id,{signal}),{object:'list',data:[]});
  assert.equal(captured.url,`https://niu.example/admin/v1/organizations/${id}/projects/${id}/keys/${id}/video/models`);
  assert.equal(captured.init.method,'GET');
  assert.equal(captured.init.body,undefined);
  assert.equal(captured.init.signal,signal);
});

test('dashboard saved media preserves binary bodies, session scope and deletion method',async()=>{
 const calls=[];const signal=new AbortController().signal;
 const client=new NiuAdminClient({adminToken:'member-session',fetch:async(url,init)=>{calls.push({url,init});return init.method==='DELETE' ? Response.json({deleted:true}):new Response(new Uint8Array([0,1,2]),{headers:{'content-type':'video/mp4'}});}});
 const response=await client.getDashboardVideoResult(scope,id,id,'video',{signal});assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[0,1,2]);assert.deepEqual(await client.deleteDashboardVideoResults(scope,id,id),{deleted:true});
 assert.equal(calls[0].init.signal,signal);assert.equal(calls[0].init.headers.authorization,'Bearer member-session');assert.ok(calls[0].url.endsWith(`/keys/${id}/video/jobs/${id}/results/video`));assert.deepEqual(calls.map(c=>c.init.method),['GET','DELETE']);assert.throws(()=>client.getDashboardVideoResult(scope,id,id,'../'),/kind/);
});
test('dashboard result availability uses the selected-key session scope',async()=>{
 let seen;const client=new NiuAdminClient({adminToken:'member-session',fetch:async(url,init)=>{seen={url,init};return Response.json({video:'unavailable',last_frame:'unavailable'});}});
 assert.deepEqual(await client.getDashboardVideoResultsStatus(scope,id,id),{video:'unavailable',last_frame:'unavailable'});assert.ok(seen.url.endsWith(`/keys/${id}/video/jobs/${id}/results`));assert.equal(seen.init.method,'GET');assert.equal(seen.init.headers.authorization,'Bearer member-session');
});
