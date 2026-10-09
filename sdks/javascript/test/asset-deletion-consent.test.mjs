import test from 'node:test';
import assert from 'node:assert/strict';
import {NiuAdminClient} from '../dist/index.js';
const id='11111111-1111-4111-8111-111111111111';
const input={organization_id:id,project_id:id,intent_id:id,consent_id:id,authorization_id:id,valid_for_seconds:900,confirm_cascade:true};

test('deletion consent projects exact scope and confirmation and preserves cancellation without dispatch', async()=>{
  const calls=[];const abort=new AbortController();
  const client=new NiuAdminClient({adminToken:'fixture',fetch:async(url,init)=>{
    calls.push({url,init});
    if(init.method==='DELETE') return new Response(null,{status:204});
    return Response.json({data:{dispatch_available:false}});
  }});
  await client.prepareOrdinaryAssetGroupDeletionConsent(id,{...input,credential:'must be omitted'},{signal:abort.signal});
  await client.getOrdinaryAssetGroupDeletionConsent(id,{organizationId:id,projectId:id},id,{signal:abort.signal});
  await client.revokeOrdinaryAssetGroupDeletionConsent(id,{organizationId:id,projectId:id},id,{signal:abort.signal});
  assert.deepEqual(JSON.parse(calls[0].init.body),input);
  assert.deepEqual(calls.map(c=>c.init.method),['POST','GET','DELETE']);
  for(const call of calls) {assert.equal(call.init.signal,abort.signal);assert(!call.url.includes('/dispatch'));}
  assert(calls[1].url.includes(`organization_id=${id}&project_id=${id}`));
  assert.equal(calls[2].init.body,undefined);
});

test('invalid consent and identity fail before network and uncertain saves are never retried', async()=>{
  let calls=0;
  const client=new NiuAdminClient({adminToken:'fixture',fetch:async()=>{calls++;return Response.json({error:{message:'Unavailable'}},{status:503});}});
  for(const patch of [{confirm_cascade:false},{confirm_cascade:undefined},{valid_for_seconds:0},{valid_for_seconds:901},{valid_for_seconds:1.5},{authorization_id:'invalid'}]) {
    assert.throws(()=>client.prepareOrdinaryAssetGroupDeletionConsent(id,{...input,...patch}));
  }
  assert.throws(()=>client.getOrdinaryAssetGroupDeletionConsent(id,{organizationId:'invalid',projectId:id},id));
  assert.throws(()=>client.revokeOrdinaryAssetGroupDeletionConsent(id,{organizationId:id,projectId:id},'invalid'));
  assert.equal(calls,0);
  await assert.rejects(client.prepareOrdinaryAssetGroupDeletionConsent(id,input));
  assert.equal(calls,1);
});


test('explicit deletion dispatch projects scope, preserves cancellation and never retries', async()=>{
  const calls=[]; const abort=new AbortController();
  const client=new NiuAdminClient({adminToken:'fixture',fetch:async(url,init)=>{
    calls.push({url,init}); return Response.json({error:{message:'Unavailable'}},{status:503});
  }});
  assert.throws(()=>client.dispatchOrdinaryAssetGroupDeletion(id,{organizationId:id,projectId:id},'invalid'));
  assert.equal(calls.length,0);
  await assert.rejects(client.dispatchOrdinaryAssetGroupDeletion(id,{organizationId:id,projectId:id,credential:'omit'},id,{signal:abort.signal}));
  assert.equal(calls.length,1);
  assert(calls[0].url.endsWith(`/group-deletion-consents/${id}/dispatch`));
  assert.equal(calls[0].init.method,'POST');
  assert.equal(calls[0].init.signal,abort.signal);
  assert.deepEqual(JSON.parse(calls[0].init.body),{organization_id:id,project_id:id});
});
