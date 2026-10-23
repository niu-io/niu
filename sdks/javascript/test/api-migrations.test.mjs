import test from 'node:test';
import assert from 'node:assert/strict';
import { NiuAdminClient } from '../dist/index.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
test('workspace-only scopes work for saved content without an organization lookup', async () => {
  const calls = [];
  const client = new NiuAdminClient({ adminToken: 'test', baseURL: 'https://example.test/admin/v1', fetch: async (url, init) => {
    calls.push({url: new URL(url), init});
    return Response.json({data: [], has_more: false, next_before: null});
  }});
  await client.sessions(workspaceId).list();
  await client.getChatSession({workspaceId}, workspaceId);
  await client.listWorkspaceAssets({workspaceId});
  await client.listVideoIntents({workspaceId});
  assert.equal(calls.length, 4);
  for (const {url} of calls) {
    assert.ok(url.pathname.startsWith(`/api/v1/workspaces/${workspaceId}/`));
    assert.ok(!url.pathname.includes('/organizations/'));
  }
  assert.equal(calls[0].url.searchParams.get('category'), 'video');
});

test('pool members encode slashes and punctuation once; collection listing uses the collection', async () => {
  const calls = [];
  const client = new NiuAdminClient({adminToken: 'test', baseURL: 'https://example.test/admin/v1', fetch: async url => {
    calls.push(new URL(url)); return Response.json({data: []});
  }});
  for (const alias of ['vendor/model', 'a%2Fb?x=#&+', 'history', 'index']) {
    await client.getModelRoutePool(alias);
    await client.listModelRoutePoolHistory(alias, 3);
    const encoded = Buffer.from(alias).toString('base64url');
    assert.equal(calls.at(-2).pathname, `/api/v1/pools/${encoded}`);
    assert.equal(calls.at(-1).pathname, `/api/v1/pools/${encoded}/history`);
    assert.equal(calls.at(-1).searchParams.get('before_revision'), '3');
  }
  await client.listModelRoutePools({limit: 1, after: 'vendor/model'});
  assert.equal(calls.at(-1).pathname, '/api/v1/pools');
  assert.equal(calls.at(-1).searchParams.get('after'), 'vendor/model');
  assert.throws(() => client.getModelRoutePool('has space'), TypeError);
});

test('saved session reads accept category-specific public references while writes retain UUID contracts', async () => {
  const calls=[];
  const client=new NiuAdminClient({adminToken:'test',baseURL:'https://example.test/api/v1',fetch:async url=>{
    calls.push(new URL(url));return Response.json({data:{}});
  }});
  const sessions=client.sessions(workspaceId);
  await sessions.retrieve('video-1001');
  await sessions.retrieveChat('chat-1002');
  assert.equal(calls[0].pathname,`/api/v1/workspaces/${workspaceId}/sessions/video-1001`);
  assert.equal(calls[1].searchParams.get('category'),'chat');
  assert.throws(()=>sessions.retrieve('chat-1002'),/UUID/);
  assert.throws(()=>sessions.update('video-1001',{expected_revision:'1',title:'Title',archived:false}),/UUID/);
  assert.equal(calls.length,2);
});

test('saved Video input references are accepted only for reads', async()=>{
  const calls=[];
  const client=new NiuAdminClient({adminToken:'test',baseURL:'https://example.test/api/v1',fetch:async url=>{calls.push(new URL(url));return Response.json({data:{}});}});
  await client.getVideoIntent({workspaceId},'input-1001');
  assert.equal(calls[0].pathname,`/api/v1/workspaces/${workspaceId}/video/intents/input-1001`);
  assert.throws(()=>client.submitVideoIntent({workspaceId},'input-1001',1),/UUID/);
  assert.equal(calls.length,1);
});
