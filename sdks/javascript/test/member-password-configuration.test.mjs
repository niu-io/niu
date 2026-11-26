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
    assert.ok(url.endsWith(`/api/v1/members/${member}/password`));
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
  assert.equal(url.pathname,'/api/v1/members');
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
    assert.ok(url.endsWith('/api/v1/members'));
    assert.equal(new Headers(init.headers).get('Idempotency-Key'),options.idempotencyKey);
    assert.deepEqual(JSON.parse(init.body),{...input,project_id:null,issue_session:false});
  }
  assert.throws(()=>client.createOperatorIdentity(input,{idempotencyKey:''}),/idempotency key/);
  assert.equal(calls.length,2);
});

test('atomic customer onboarding and inline member credentials forward idempotency keys and 8-char passwords', async () => {
  const calls=[];
  const onboarded={
    data:{
      id:member,
      slug:'tiwater',
      name:'Tiwater',
      account_kind:'organization',
      currency:'USD',
      workspace_id:member,
      workspace_name:'Default',
      workspace_slug:'default',
      owner_id:member,
      owner_name:'Tiwater Owner',
      owner_email:'owner@tiwater.test',
      trial_credit_nanos:'5000000000',
    },
  };
  const client=new NiuAdminClient({adminToken:'test',fetch:async(url,init)=>{
    calls.push({url,init});
    if(url.endsWith('/api/v1/admin/customers')) return Response.json(onboarded,{status:201});
    if(url.endsWith('/api/v1/members')) return Response.json({operator:{id:member,name:'Teammate',role:'admin'},session:null,token:null},{status:201});
    return Response.json({revision:1},{status:200});
  }});

  const customerInput={
    name:'Tiwater',
    account_kind:'organization',
    create_default_workspace:true,
    owner:{name:'Tiwater Owner',email:'owner@tiwater.test',password:'Secret88'},
    trial_credit_nanos:'5000000000',
  };
  assert.deepEqual(await client.onboardPlatformCustomer(customerInput,{idempotencyKey:'onboard-tiwater-1'}),onboarded);
  assert.ok(calls[0].url.endsWith('/api/v1/admin/customers'));
  assert.equal(new Headers(calls[0].init.headers).get('Idempotency-Key'),'onboard-tiwater-1');
  assert.deepEqual(JSON.parse(calls[0].init.body),customerInput);
  await assert.rejects(()=>client.onboardPlatformCustomer(customerInput,{idempotencyKey:''}),/idempotencyKey/);

  await client.createOperatorIdentity(
    {organization_id:member,name:'Teammate',role:'admin',email:'team@tiwater.test',password:'TeamPass'},
    {idempotencyKey:'member-with-pw-1'},
  );
  assert.ok(calls[1].url.endsWith('/api/v1/members'));
  assert.equal(new Headers(calls[1].init.headers).get('Idempotency-Key'),'member-with-pw-1');
  assert.deepEqual(JSON.parse(calls[1].init.body),{
    organization_id:member,
    project_id:null,
    name:'Teammate',
    role:'admin',
    issue_session:false,
    email:'team@tiwater.test',
    password:'TeamPass',
  });

  assert.deepEqual(
    await client.setMemberPassword(member,{email:'retry@tiwater.test',password:'Retry888',expected_revision:0}),
    {revision:1},
  );
  assert.deepEqual(JSON.parse(calls[2].init.body),{email:'retry@tiwater.test',password:'Retry888',expected_revision:0});
});
