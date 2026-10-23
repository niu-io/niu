import test from 'node:test';
import assert from 'node:assert/strict';
import { NiuAdminClient } from '../dist/index.js';

const member = '10000000-0000-4000-8000-000000000001';
test('member password recovery reads metadata and sends an explicit expected revision without retries', async () => {
  const calls = []; const controller = new AbortController();
  const client = new NiuAdminClient({adminToken:'test',fetch:async(url,init)=>{
    calls.push({url,init});
    if(init.method === 'PUT') return Response.json({error:{message:'Revision changed'}},{status:409});
    return Response.json({configured:true,email:'owner@example.test',revision:2});
  }});
  assert.deepEqual(await client.getMemberPasswordConfiguration(member,{signal:controller.signal}), {configured:true,email:'owner@example.test',revision:2});
  const input={email:'owner@example.test',password:' synthetic replacement passphrase ',expected_revision:2};
  await assert.rejects(client.setMemberPassword(member,input,{signal:controller.signal}), error=>error.status===409);
  assert.equal(calls.length,2);
  assert.equal(calls[0].init.body,undefined);
  assert.equal(calls[1].init.method,'PUT');
  assert.deepEqual(JSON.parse(calls[1].init.body),input);
  for(const {url,init} of calls) {
    assert.ok(url.endsWith(`/api/v1/operators/${member}/password`));
    assert.equal(init.signal,controller.signal);
  }
});

test('user-directory continuation preserves company scope and abort signal', async () => {
  const calls=[]; const controller=new AbortController();
  const client=new NiuAdminClient({adminToken:'test',fetch:async(url,init)=>{
    calls.push({url,init}); return Response.json({data:[],next_cursor:null});
  }});
  assert.deepEqual(await client.listOperatorsPage({organizationId:member,after:member,limit:50},{signal:controller.signal}),{data:[],next_cursor:null});
  const url=new URL(calls[0].url);
  assert.equal(url.pathname,'/api/v1/operators');
  assert.equal(url.searchParams.get('organization_id'),member);
  assert.equal(url.searchParams.get('after'),member);
  assert.equal(url.searchParams.get('limit'),'50');
  assert.equal(calls[0].init.signal,controller.signal);
  for(const limit of [0,1001,1.5]) assert.throws(()=>client.listOperatorsPage({limit}),/limit/);
  assert.equal(calls.length,1);
});

test('identity creation sends a stable retry key without requesting credentials', async () => {
  const calls=[];
  const response={operator:{id:member,name:'Customer owner',role:'owner'},session:null,token:null};
  const client=new NiuAdminClient({adminToken:'test',fetch:async(url,init)=>{
    calls.push({url,init}); return Response.json(response,{status:201});
  }});
  const input={organization_id:member,name:'Customer owner',role:'owner'};
  const options={idempotencyKey:'customer-owner-creation'};
  assert.deepEqual(await client.createOperatorIdentity(input,options),response);
  assert.deepEqual(await client.createOperatorIdentity(input,options),response);
  for(const {url,init} of calls){
    assert.ok(url.endsWith('/api/v1/operators'));
    assert.equal(new Headers(init.headers).get('Idempotency-Key'),options.idempotencyKey);
    assert.deepEqual(JSON.parse(init.body),{...input,project_id:null,issue_session:false});
  }
  assert.throws(()=>client.createOperatorIdentity(input,{idempotencyKey:''}),/idempotency key/);
  assert.equal(calls.length,2);
});
