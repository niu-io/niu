import assert from 'node:assert/strict';
import test from 'node:test';
import { NiuAdminClient } from '../dist/index.js';

test('branding uses platform scope, explicit fields and exact revision without retrying writes', async () => {
  const calls = []; const controller = new AbortController();
  const settings = { display_name: 'NIU.IO', default_appearance: 'system', light: {}, dark: {} };
  const result = { data: { revision: '1', settings } };
  const client = new NiuAdminClient({ adminToken: 'test', fetch: async (url, init) => {
    calls.push({ url, init }); return Response.json(result);
  }});
  assert.deepEqual(await client.getBranding(), result);
  assert.deepEqual(await client.saveBranding('0', { ...settings, secret: 'omit' }, { signal: controller.signal }), result);
  assert.ok(calls.every(call => call.url.endsWith('/admin/v1/platform/branding')));
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.body, undefined);
  assert.equal(calls[1].init.method, 'PUT');
  assert.equal(calls[1].init.signal, controller.signal);
  assert.deepEqual(JSON.parse(calls[1].init.body), { expected_revision: '0', settings });
  for (const revision of ['01', '-1', '1.0', '9223372036854775808']) assert.throws(() => client.saveBranding(revision, settings), /revision/);
  assert.equal(calls.length, 2);
  const uncertain = new NiuAdminClient({ adminToken: 'test', fetch: async () => { calls.push('uncertain'); throw new Error('uncertain'); } });
  await assert.rejects(uncertain.saveBranding('1', settings), /uncertain/);
  assert.equal(calls.length, 3);
});

test('branding forwards both asset changes and explicit reset without extra fields', async () => {
  let body;
  const client = new NiuAdminClient({adminToken:'test', fetch:async (_url, init) => {body = JSON.parse(init.body); return Response.json({data:{}});}});
  const settings = {display_name:'NIU.IO',default_appearance:'system',light:{},dark:{},logo_data_url:'data:image/png;base64,AAAA',favicon_data_url:null};
  await client.saveBranding('2', {...settings, internal:'omit'});
  assert.deepEqual(body, {expected_revision:'2',settings});
});
