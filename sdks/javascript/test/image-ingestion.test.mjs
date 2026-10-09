import assert from 'node:assert/strict';
import test from 'node:test';
import { NiuClient } from '../dist/index.js';

const id = '11111111-1111-4111-8111-111111111111';
const consent = { source_id: id, group_intent_id: id, authorization_id: id, valid_for_seconds: 60, confirm_ingestion: true };
test('image ingestion consent preserves methods, credential and empty revocation', async () => {
  const calls = [];
  const client = new NiuClient({ apiKey: 'test-key', baseURL: 'https://gateway.example.test/v1', fetch: async (url, init) => {
    calls.push({ url, ...init });
    return init.method === 'DELETE' ? new Response(null, { status: 204 }) : Response.json({ data: { consent_id: id, status: 'consented', dispatch_available: false } });
  }});
  assert.equal((await client.imageIngestions.prepare(id, consent)).data.dispatch_available, false);
  await client.imageIngestions.retrieve(id);
  await client.imageIngestions.revoke(id);
  await client.imageIngestions.dispatch(id);
  assert.deepEqual(calls.map(c => c.method), ['PUT', 'GET', 'DELETE', 'POST']);
  assert.ok(calls.slice(0,3).every(c => c.url === `https://gateway.example.test/v1/media/image-ingestions/${id}`));
  assert.ok(calls.every(c => new Headers(c.headers).get('authorization') === 'Bearer test-key'));
  assert.deepEqual(JSON.parse(calls[0].body), consent);
  assert.equal(calls[2].body, undefined);
  assert.equal(calls[3].url, `https://gateway.example.test/v1/media/image-ingestions/${id}/dispatch`);
  assert.deepEqual(JSON.parse(calls[3].body), {});
});
test('invalid image ingestion consent does not reach transport', async () => {
  const client = new NiuClient({ apiKey: 'test-key', fetch: async () => { throw new Error('unexpected transport'); } });
  for (const change of [{ valid_for_seconds: 0 }, { valid_for_seconds: 901 }, { valid_for_seconds: 1.5 }, { confirm_ingestion: false }, { source_id: '../secret' }]) {
    await assert.rejects(client.imageIngestions.prepare(id, { ...consent, ...change }), TypeError);
  }
  assert.throws(() => client.imageIngestions.retrieve('../secret'), TypeError);
});

test('source preparation and erasure use private authenticated transport', async () => {
  const calls = [];
  const client = new NiuClient({ apiKey: 'test-key', baseURL: 'https://gateway.example.test/v1', fetch: async (url, init) => {
    calls.push({url,...init});
    return init.method === 'DELETE' ? new Response(null,{status:204}) : Response.json({data:{source_id:id,retained:true,retention_seconds:60}});
  }});
  const input = {image:'data:image/png;base64,fixture',valid_for_seconds:60};
  assert.equal((await client.imageSources.prepare(input)).data.source_id,id);
  await client.imageSources.erase(id);
  assert.equal(calls[0].url,'https://gateway.example.test/v1/media/image-sources');
  assert.equal(calls[0].method,'POST');
  assert.deepEqual(JSON.parse(calls[0].body),input);
  assert.equal(calls[1].method,'DELETE');
  assert.equal(calls[1].body,undefined);
  assert.throws(()=>client.imageSources.prepare({...input,image:'https://remote.example/image.png'}),TypeError);
  assert.throws(()=>client.imageSources.prepare({...input,valid_for_seconds:901}),TypeError);
  await assert.rejects(client.imageSources.erase('../source'),TypeError);
  assert.equal(calls.length,2);
});

test('readiness refresh is explicit and persisted observation reads do not poll upstream', async () => {
  const calls=[];
  const client=new NiuClient({apiKey:'test-key',baseURL:'https://gateway.example.test/v1',fetch:async(url,init)=>{
    calls.push({url,...init});
    return Response.json({data:{read_id:id,status:'succeeded',asset_status:'Processing',reason:null,duration_ms:10,observed_at:'2026-10-09T00:00:00Z',reuse_available:false}});
  }});
  const result=await client.imageIngestions.readiness.refresh(id,id);
  assert.equal(result.data.asset_status,'Processing');
  assert.equal(result.data.reuse_available,false);
  await client.imageIngestions.readiness.retrieve(id,id);
  assert.deepEqual(calls.map(c=>c.method),['POST','GET']);
  assert.ok(calls.every(c=>c.url===`https://gateway.example.test/v1/media/image-ingestions/${id}/readiness/${id}`));
  assert.deepEqual(JSON.parse(calls[0].body),{});
  assert.equal(calls[1].body,undefined);
  assert.throws(()=>client.imageIngestions.readiness.refresh(id,'../asset'),TypeError);
  assert.throws(()=>client.imageIngestions.readiness.retrieve('../consent',id),TypeError);
});

test('ingestion history follows saved cursor with authenticated GET and no body', async () => {
  const calls = [];
  const client = new NiuClient({apiKey:'test-key', baseURL:'https://gateway.example.test/v1', fetch:async(url,init)=>{
    calls.push({url,...init});
    return Response.json({data:[],next_cursor:id});
  }});
  assert.equal((await client.imageIngestions.list()).next_cursor,id);
  await client.imageIngestions.list({before:id});
  assert.equal(calls[0].url,'https://gateway.example.test/v1/media/image-ingestions');
  assert.equal(calls[1].url,`https://gateway.example.test/v1/media/image-ingestions?before=${id}`);
  assert.ok(calls.every(c=>c.method==='GET' && c.body===undefined && new Headers(c.headers).get('authorization')==='Bearer test-key'));
  assert.throws(()=>client.imageIngestions.list({before:'../other'}),TypeError);
  assert.equal(calls.length,2);
});
