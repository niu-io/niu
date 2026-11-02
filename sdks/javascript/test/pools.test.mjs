import assert from 'node:assert/strict';
import test from 'node:test';
import { NiuClient } from '../dist/index.js';
const config = { slug: 'assistant', name: 'Assistant', description: '', enabled: true, revision: 0, candidates: [{ alias: 'fast', priority: 100, weight: 1000, enabled: true }] };
test('workspace pool SDK preserves revision, uses scoped routes and never retries conflicts', async () => {
  const calls = [];
  const client = new NiuClient({ apiKey: 'fixture', baseURL: 'https://niu.example/v1', fetch: async (url, init) => {
    calls.push({ url, ...init });
    return Response.json({ data: config });
  } });
  await client.listPools('assistant'); await client.getPool('assistant'); await client.previewPool(config); await client.setPool(config); await client.getPoolHistory('assistant', 2); await client.getPoolSelections('assistant');
  assert.deepEqual(calls.map(c => [new URL(c.url).pathname + new URL(c.url).search, c.method]), [
    ['/v1/routing?after=assistant', 'GET'], ['/v1/routing/assistant', 'GET'], ['/v1/routing/preview', 'POST'], ['/v1/routing/assistant', 'PUT'], ['/v1/routing/assistant/history?before=2', 'GET'], ['/v1/routing/assistant/selections', 'GET'],
  ]);
  assert.deepEqual(JSON.parse(calls[3].body), config);
  let failures = 0;
  const conflict = new NiuClient({ apiKey: 'fixture', fetch: async () => { failures++; return Response.json({ error: { message: 'Revision conflict' } }, { status: 409 }); } });
  await assert.rejects(() => conflict.setPool(config));
  assert.equal(failures, 1);
  assert.throws(() => client.getPool('../admin'));
  await assert.rejects(() => client.setPool({ ...config, revision: -1 }));
});
test('SDK exposes pool response evidence before body consumption', async () => {
  let observed;
  const client = new NiuClient({ apiKey: 'fixture', fetch: async () => Response.json({ data: [] }, { headers: { 'x-niu-pool': 'assistant', 'x-niu-pool-revision': '3', 'x-niu-selected-model': 'fast', 'x-niu-pool-evidence': 'incomplete' } }) });
  await client.listPools(undefined, { onResponse: metadata => { observed = metadata.pool; } });
  assert.deepEqual(observed, { slug: 'assistant', revision: '3', selectedModel: 'fast', evidence: 'incomplete' });
});
test('SDK contextual preview keeps request traits separate from saved configuration', async () => {
  let proposal;
  const client = new NiuClient({ apiKey: 'fixture', fetch: async (_url, init) => { proposal = JSON.parse(init.body); return Response.json({ data: { persisted: false } }); } });
  const context = { protocol: 'chat', tools: true };
  await client.previewPool(config, context);
  assert.deepEqual(proposal, { configuration: config, context });
});
