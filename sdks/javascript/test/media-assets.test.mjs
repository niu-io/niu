import test from 'node:test';
import assert from 'node:assert/strict';
import {NiuAdminClient} from '../dist/index.js';

const organizationId='11111111-1111-4111-8111-111111111111';
const projectId='22222222-2222-4222-8222-222222222222';
const keyId='33333333-3333-4333-8333-333333333333';
const groupId='44444444-4444-4444-8444-444444444444';
const assetId='55555555-5555-4555-8555-555555555555';
const mutation={data:{id:'66666666-6666-4666-8666-666666666666',group_id:groupId,asset_id:null,model:'model',action:'create_asset',status:'acknowledged',http_status:200,request_id:null,created_at_ms:1,updated_at_ms:2},group:null,asset:null};

function client(calls) {
  return new NiuAdminClient({adminToken:'fixture',fetch:async(url,init)=>{
    calls.push({url:String(url),init});
    return Response.json(mutation);
  }}).dashboardMedia({organizationId,projectId},keyId);
}

test('create-asset sends exactly one source and a canonical workspace reference', async()=>{
  const calls=[];
  await client(calls).assets.create({model:'model',group_id:groupId,workspace_asset_id:assetId,name:'Frame',kind:'image'},{idempotencyKey:assetId});
  const body=JSON.parse(calls[0].init.body);
  assert.deepEqual(body,{model:'model',group_id:groupId,workspace_asset_id:assetId,name:'Frame',kind:'image'});
  assert.equal(body.url,undefined);
  assert.equal(new Headers(calls[0].init.headers).get('idempotency-key'),assetId);
  assert.equal(calls[0].init.method,'POST');
});

test('create-asset preserves the public URL source and rejects ambiguous input before network', async()=>{
  const calls=[];
  await client(calls).assets.create({model:'model',group_id:groupId,url:'https://media.example.test/a.png',kind:'image'});
  assert.deepEqual(JSON.parse(calls[0].init.body),{model:'model',group_id:groupId,url:'https://media.example.test/a.png',kind:'image'});
  const before=calls.length;
  assert.throws(()=>client(calls).assets.create({model:'model',group_id:groupId,url:'https://media.example.test/a.png',workspace_asset_id:assetId,kind:'image'}));
  assert.throws(()=>client(calls).assets.create({model:'model',group_id:groupId,kind:'image'}));
  assert.throws(()=>client(calls).assets.create({model:'model',group_id:groupId,workspace_asset_id:'not-a-uuid',kind:'image'}));
  assert.equal(calls.length,before);
});
