import test from 'node:test';
import assert from 'node:assert/strict';
import { NiuAuthClient, NiuAPIError } from '../dist/index.js';

test('member sign-in preserves password bytes and sign-out sends only the supplied bearer', async () => {
  const calls = []; const abort = new AbortController();
  const result = {token:'member-session',session:{id:'routing-reference',operator_id:'member-reference',expires_at_unix:123,revoked:false}};
  const client = new NiuAuthClient({baseURL:'https://niu.example/admin/v1/',fetch:async(url,init)=>{
    calls.push({url,init}); return calls.length === 1 ? Response.json(result) : new Response(null,{status:204});
  }});
  assert.deepEqual(await client.signIn({email:'Member@example.test',password:'  密码 unchanged  ',ignored:'never sent'},{signal:abort.signal}),result);
  await client.signOut(result.token,{signal:abort.signal});
  assert.equal(calls[0].url,'https://niu.example/admin/v1/auth/login');
  assert.deepEqual(JSON.parse(calls[0].init.body),{email:'Member@example.test',password:'  密码 unchanged  '});
  assert.equal(calls[0].init.headers.authorization,undefined);
  assert.equal(calls[1].url,'https://niu.example/admin/v1/auth/logout');
  assert.equal(calls[1].init.headers.authorization,'Bearer member-session');
  assert.equal(calls[1].init.body,undefined);
  for (const {init} of calls) {
    assert.equal(init.method,'POST'); assert.equal(init.signal,abort.signal);
    assert.equal(init.redirect,'error'); assert.equal(init.credentials,'omit'); assert.equal(init.cache,'no-store');
  }
  assert.ok(!JSON.stringify(client).includes(result.token));
});

test('authentication errors preserve status and do not retry uncertain writes', async () => {
  let calls = 0;
  const client = new NiuAuthClient({fetch:async()=>{calls++; return Response.json({error:{message:'Try again later'}},{status:429,headers:{'x-request-id':'public-reference'}});}});
  await assert.rejects(client.signIn({email:'a@example.test',password:'password'}),error=>error instanceof NiuAPIError && error.status === 429 && error.requestId === 'public-reference');
  assert.equal(calls,1);
  await assert.rejects(client.signOut('session'),error=>error.status === 429);
  assert.equal(calls,2);
  const uncertain = new NiuAuthClient({fetch:async()=>{calls++;throw new Error('Network uncertain');}});
  await assert.rejects(uncertain.signOut('session'),/Network uncertain/);
  assert.equal(calls,3);
});

test('invalid inputs are rejected before fetching, including oversized serialized JSON', () => {
  let calls = 0; const client = new NiuAuthClient({fetch:async()=>{calls++;throw new Error('Unexpected fetch');}});
  for (const token of ['', 'with spaces', 'x\nheader', 'x'.repeat(257)]) assert.throws(()=>client.signOut(token),/bearer/);
  assert.throws(()=>client.signIn({email:'a'.repeat(255),password:'x'}),/bounded/);
  assert.throws(()=>client.signIn({email:'a@example.test',password:'密'.repeat(342)}),/bounded/);
  assert.throws(()=>client.signIn({email:'a@example.test',password:'\u0000'.repeat(1024)}),/4096/);
  for (const baseURL of ['https://user:secret@example.test/admin/v1','https://example.test/admin/v1?secret=1','file:///tmp/api']) assert.throws(()=>new NiuAuthClient({baseURL}),/HTTP/);
  assert.equal(calls,0);
});


test('self password change targets no other member and preserves password bytes and cancellation', async () => {
  const abort = new AbortController(); const calls = [];
  const client = new NiuAuthClient({fetch:async(url,init)=>{calls.push({url,init});return Response.json({revision:2,sign_in_required:true});}});
  const input = {current_password:' original password ',password:'  replacement password  ',operator_id:'ignored',email:'ignored@example.test'};
  assert.deepEqual(await client.changePassword('own-session',input,{signal:abort.signal}),{revision:2,sign_in_required:true});
  assert.ok(calls[0].url.endsWith('/admin/v1/auth/password'));
  assert.equal(calls[0].init.method,'PUT'); assert.equal(calls[0].init.headers.authorization,'Bearer own-session');
  assert.deepEqual(JSON.parse(calls[0].init.body),{current_password:input.current_password,password:input.password});
  assert.equal(calls[0].init.signal,abort.signal); assert.equal(calls[0].init.credentials,'omit');
  assert.equal(calls[0].init.redirect,'error'); assert.equal(calls[0].init.cache,'no-store');
});

test('self password change rejects invalid credentials before dispatch and preserves reset conflicts without retry', async () => {
  let calls = 0;
  const client = new NiuAuthClient({fetch:async()=>{calls++;return Response.json({error:{message:'Changed during verification'}},{status:409});}});
  const good = {current_password:'current',password:'synthetic replacement passphrase'};
  assert.throws(()=>client.changePassword('',good),/bearer/);
  assert.throws(()=>client.changePassword('session',{...good,password:'short'}),/15 characters/);
  assert.throws(()=>client.changePassword('session',{...good,current_password:'密'.repeat(342)}),/bounded/);
  assert.throws(()=>client.changePassword('session',{...good,password:'\u0000'.repeat(1024)}),/4096/);
  assert.equal(calls,0);
  await assert.rejects(client.changePassword('session',good),error=>error instanceof NiuAPIError && error.status===409);
  assert.equal(calls,1);
});
