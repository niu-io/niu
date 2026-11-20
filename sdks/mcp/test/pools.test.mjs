import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { callTool, toolDefinitions } from '../dist/index.js';

const configuration = { slug: 'assistant', name: 'Assistant', description: '', enabled: true, revision: 0, candidates: [{ alias: 'fast', priority: 100, weight: 1000, enabled: true }], rules: [], default_action: 'candidates' };
test('pool tools use only scoped routes and preserve explicit revision without retry', async () => {
  const calls = [];
  const client = { baseURL: 'https://niu.example/v1', apiKey: 'fixture', fetch: async (url, init) => {
    calls.push({ url, ...init });
    return { ok: true, status: 200, text: async () => JSON.stringify({ data: { ...configuration, revision: 1 } }) };
  } };
  for (const [name, args, method, suffix] of [
    ['list_pools', { after: 'assistant' }, 'GET', '/routing?after=assistant'],
    ['get_pool', { slug: 'assistant' }, 'GET', '/routing/assistant'],
    ['preview_pool', { configuration }, 'POST', '/routing/preview'],
    ['set_pool', { configuration }, 'PUT', '/routing/assistant'],
    ['get_pool_history', { slug: 'assistant', before: 2 }, 'GET', '/routing/assistant/history?before=2'],
    ['get_pool_selections', { slug: 'assistant' }, 'GET', '/routing/assistant/selections'],
  ]) {
    const result = await callTool(client, name, args);
    assert.equal(result.isError, undefined);
    assert.equal(calls.at(-1).url, `https://niu.example/v1${suffix}`);
    assert.equal(calls.at(-1).method, method);
    assert.equal(calls.at(-1).headers.authorization, 'Bearer fixture');
    if (method !== 'GET') assert.deepEqual(JSON.parse(calls.at(-1).body), name === 'preview_pool' ? { configuration } : configuration);
  }
  assert.equal(calls.length, 6);
  const conflict = { ...client, fetch: async () => { calls.push('conflict'); return { ok: false, status: 409, text: async () => JSON.stringify({ error: { message: 'Revision conflict' } }) }; } };
  assert.equal((await callTool(conflict, 'set_pool', { configuration })).isError, true);
  assert.equal(calls.length, 7, 'a revision conflict must not trigger automatic mutation replay');
  assert.equal(toolDefinitions.find(tool => tool.name === 'set_pool').annotations.readOnlyHint, false);
});
test('pool tools refuse traversal, invalid revisions and unexpected authority arguments before transport', async () => {
  let calls = 0;
  const client = { baseURL: 'https://niu.example/v1', apiKey: 'fixture', fetch: async () => { calls++; throw new Error('must not dispatch'); } };
  for (const [name, input] of [
    ['get_pool', { slug: '../admin' }], ['get_pool', { slug: 'preview' }],
    ['get_pool_history', { slug: 'assistant', before: 0 }],
    ['set_pool', { configuration: { ...configuration, revision: -1 } }],
    ['set_pool', { configuration, administrator: true }],
  ]) assert.equal((await callTool(client, name, input)).isError, true);
  assert.equal(calls, 0);
});

test('MCP pool configuration schema stays aligned with the handler contract', () => {
  const contract = JSON.parse(readFileSync(new URL('../../../contracts/generated/handler-operations.json', import.meta.url), 'utf8'));
  const tool = toolDefinitions.find(tool => tool.name === 'set_pool');
  assert.deepEqual(tool.inputSchema.properties.configuration, contract.components.schemas.WorkspaceModelPool);
});
test('inference tools retain pool revision and incomplete-evidence headers', async () => {
  const client = { baseURL: 'https://niu.example/v1', apiKey: 'fixture', fetch: async () => ({ ok: true, status: 200,
    headers: new Headers({ 'x-niu-pool': 'assistant', 'x-niu-pool-revision': '3', 'x-niu-selected-model': 'fast', 'x-niu-pool-evidence': 'incomplete' }),
    text: async () => JSON.stringify({ model: 'fast', choices: [], usage: null }),
  }) };
  const result = await callTool(client, 'create_chat_completion', { model: 'pool/assistant', messages: [{ role: 'user', content: 'hi' }] });
  const data = JSON.parse(result.content[0].text);
  assert.equal(data.pool_slug, 'assistant'); assert.equal(data.pool_revision, '3'); assert.equal(data.selected_model, 'fast'); assert.equal(data.pool_evidence, 'incomplete');
});
test('contextual pool preview schema matches the handler and sends only a non-dispatching proposal', async () => {
  const contract = JSON.parse(readFileSync(new URL('../../../contracts/generated/handler-operations.json', import.meta.url), 'utf8'));
  const schema = structuredClone(contract.components.schemas.WorkspacePoolPreviewRequest);
  schema.properties.configuration = contract.components.schemas.WorkspaceModelPool;
  assert.deepEqual(toolDefinitions.find(tool => tool.name === 'preview_pool').inputSchema, schema);
  let proposal;
  const context = { protocol: 'chat', tools: true, requested_output_tokens: 128 };
  const client = { baseURL: 'https://niu.example/v1', apiKey: 'fixture', fetch: async (url, init) => {
    assert.equal(url, 'https://niu.example/v1/routing/preview'); assert.equal(init.method, 'POST');
    proposal = JSON.parse(init.body);
    return { ok: true, status: 200, text: async () => JSON.stringify({ data: { persisted: false, live_model_verification: 'not_performed' } }) };
  } };
  assert.equal((await callTool(client, 'preview_pool', { configuration, context })).isError, undefined);
  assert.deepEqual(proposal, { configuration, context });
});

test('MCP inference tools validate and forward routing_context as x-niu-routing-context', async () => {
  const sentHeaders = [];
  const client = {
    baseURL: 'https://niu.example/v1',
    apiKey: 'fixture',
    fetch: async (_url, init) => {
      sentHeaders.push(init.headers);
      return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [], output: [], content: [], candidates: [], data: [] }) };
    },
  };
  const routing_context = { task: 'code-review', stage: 'final_check' };
  const calls = [
    ['create_chat_completion', { model: 'pool/assistant', messages: [{ role: 'user', content: 'hi' }], routing_context }],
    ['compare_models', { models: ['pool/assistant'], messages: [{ role: 'user', content: 'hi' }], routing_context }],
    ['create_response', { model: 'pool/assistant', input: 'hi', routing_context }],
    ['create_message', { model: 'pool/assistant', max_tokens: 16, messages: [{ role: 'user', content: 'hi' }], routing_context }],
    ['generate_content', { model: 'pool/assistant', contents: [{ role: 'user', parts: [{ text: 'hi' }] }], routing_context }],
    ['create_embeddings', { model: 'pool/assistant', input: 'hi', routing_context }],
  ];
  for (const [tool, args] of calls) {
    const result = await callTool(client, tool, args);
    assert.equal(result.isError, undefined, `${tool} failed: ${JSON.stringify(result)}`);
    assert.equal(sentHeaders.at(-1)['x-niu-routing-context'], JSON.stringify(routing_context), `${tool} missing header`);
  }
  assert.equal(sentHeaders.length, 6);

  // Reject invalid routing_context before transport
  let rejectedCalls = 0;
  const strictClient = { ...client, fetch: async () => { rejectedCalls++; throw new Error('must not dispatch'); } };
  for (const bad of [{}, { task: 'UPPER' }, { stage: '-bad' }, { task: 'a'.repeat(65) }, { unknown: 'x' }, 'string', []]) {
    const result = await callTool(strictClient, 'create_chat_completion', {
      model: 'pool/assistant',
      messages: [{ role: 'user', content: 'hi' }],
      routing_context: bad,
    });
    assert.equal(result.isError, true, `expected error for routing_context=${JSON.stringify(bad)}`);
  }
  assert.equal(rejectedCalls, 0);
});
