import assert from 'node:assert/strict';
import test from 'node:test';
import { NiuAdminClient, NiuAPIError } from '../dist/index.js';

const id = '12345678-1234-1234-1234-123456789abc';
const scope = { organizationId: id, projectId: id };
const observation = { window_key: 'monthly', unit: 'tokens', remaining: '9223372036854775807', maximum: null, observed_at_ms: 1, valid_until_ms: 2, resets_at_ms: 3, source: 'fixture' };

test('collector requests preserve exact quantities, scope, cancellation and explicit auth', async () => {
  const calls = [];
  const abort = new AbortController();
  const client = new NiuAdminClient({ adminToken: 'test-admin', fetch: async (url, init) => {
    calls.push({ url, init }); return Response.json({ id });
  }});
  assert.deepEqual(await client.observeQuota(scope, id, observation, { signal: abort.signal }), { id });
  await client.quota(scope, id);
  await client.listAccounts(scope);
  await client.createAccount(scope, { provider: 'fixture', plan: 'monthly', authentication_mode: 'api_key', billing_mode: 'subscription', credential_reference: 'env:FIXTURE', concurrency_limit: 1 });
  assert.equal(calls[0].url, `http://localhost:2555/admin/v1/organizations/${id}/projects/${id}/accounts/${id}/quota`);
  assert.equal(calls[0].init.headers.authorization, 'Bearer test-admin');
  assert.equal(calls[0].init.signal, abort.signal);
  assert.equal(calls[0].init.redirect, 'error');
  assert.deepEqual(JSON.parse(calls[0].init.body), observation);
  assert.deepEqual(calls.map(x => x.init.method), ['POST', 'GET', 'GET', 'POST']);
});

test('invalid quantities and scope injection are rejected before transport', () => {
  const client = new NiuAdminClient({ adminToken: 'test', fetch: () => { throw new Error('transport reached'); } });
  for (const remaining of [1, '-1', '9223372036854775808', '', '1.5']) {
    assert.throws(() => client.observeQuota(scope, id, { ...observation, remaining }), /decimal strings/);
  }
  assert.throws(() => client.observeQuota(scope, id, { ...observation, observed_at_ms: Number.MAX_SAFE_INTEGER + 1 }), /safe-integer/);
  assert.throws(() => client.quota({ ...scope, projectId: '../other' }, id), /UUID/);
});

test('conflicts propagate without automatic resubmission', async () => {
  let calls = 0;
  const client = new NiuAdminClient({ adminToken: 'test', fetch: async () => {
    calls++; return Response.json({ error: { message: 'Conflicting evidence' } }, { status: 409 });
  }});
  await assert.rejects(client.observeQuota(scope, id, observation), error => error instanceof NiuAPIError && error.status === 409);
  assert.equal(calls, 1);
});

test('collector is bound to a copied project scope and exposes only ingestion', async () => {
  const { NiuCollectorClient } = await import('../dist/index.js');
  const mutableScope = { ...scope };
  let captured;
  const collector = new NiuCollectorClient({ collectorToken: 'test-collector', scope: mutableScope, fetch: async (url, init) => {
    captured = { url, init }; return Response.json({ id });
  }});
  mutableScope.projectId = '../other';
  await collector.observeQuota(id, observation);
  assert.equal(captured.url, `http://localhost:2555/admin/v1/organizations/${id}/projects/${id}/accounts/${id}/quota`);
  assert.equal(captured.init.headers.authorization, 'Bearer test-collector');
  assert.deepEqual(Object.getOwnPropertyNames(Object.getPrototypeOf(collector)), ['constructor', 'observeQuota']);
});

test('admin credential lifecycle sends explicit creation and deletion requests', async () => {
  const calls = [];
  const admin = new NiuAdminClient({ adminToken: 'test-admin', fetch: async (url, init) => {
    calls.push({ url, init });
    return init.method === 'DELETE' ? new Response(null, { status: 204 }) : Response.json({ id, token: 'test-collector' });
  }});
  assert.equal((await admin.issueCollectorKey(scope, { name: 'collector', ttl_seconds: 3600 })).id, id);
  assert.equal(await admin.revokeCollectorKey(scope, id), undefined);
  assert.equal(calls[1].init.method, 'DELETE');
  assert.equal(calls[1].init.body, undefined);
  assert.ok(calls[1].url.endsWith(`/collector-keys/${id}`));
  assert.throws(() => admin.issueCollectorKey(scope, { name: 'collector', ttl_seconds: 0 }), /lifetime/);
  assert.equal(calls.length, 2);
});
