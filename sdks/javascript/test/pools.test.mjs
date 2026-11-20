import assert from 'node:assert/strict';
import test from 'node:test';
import { NiuClient } from '../dist/index.js';
const strategy = { version: 1, mode: 'customer_price', customer_price: { currency: 'USD', unit: 'nanounits_per_million_tokens', input_tokens: 1000000, output_tokens: 100000 } };
const config = { slug: 'assistant', name: 'Assistant', description: '', enabled: true, revision: 0, candidates: [{ alias: 'fast', priority: 100, weight: 1000, enabled: true }], strategy };
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
test('SDK preserves versioned customer-price strategy and exposes unknown-price evidence', async () => {
  let proposal;
  const client = new NiuClient({ apiKey: 'fixture', fetch: async (_url, init) => {
    proposal = JSON.parse(init.body);
    return Response.json({ data: { configuration_valid: true, persisted: false, candidate_count: 1, rule_count: 0, strategy, simulation: {
      protocol: 'chat', matched_rule: null, outcome: 'candidates', strategy,
      selection_basis: 'priority_weight_fallback', selected_candidate: null,
      fallback_reason: 'no_comparable_customer_price',
      price_evaluation: { source: 'customer_selling_price', billing_mode: 'currency', currency: 'USD', unit: 'nanounits_per_million_tokens', input_tokens: 1000000, output_tokens: 100000, basis: 'priority_weight_fallback', fallback_reason: 'no_comparable_customer_price', selected_candidate: null, candidates: [{ alias: 'fast', estimated_customer_charge_nanos: null, price_unknown_reason: 'missing_customer_price' }] },
      live_dispatch: false,
      candidates: [{ alias: 'fast', priority: 100, weight: 1000, eligible: true, exclusion_reason: null, selection_weight: { numerator: 1000, denominator: 1000 }, estimated_customer_charge_nanos: null, price_unknown_reason: 'missing_customer_price' }],
    } } });
  } });
  const result = await client.previewPool(config, { protocol: 'chat' });
  assert.deepEqual(proposal.configuration.strategy, strategy);
  assert.equal(result.data.simulation.selected_candidate, null);
  assert.equal(result.data.simulation.selection_basis, 'priority_weight_fallback');
  assert.equal(result.data.simulation.price_evaluation.candidates[0].price_unknown_reason, 'missing_customer_price');
});
test('SDK contextual preview keeps request traits separate from saved configuration', async () => {
  let proposal;
  const client = new NiuClient({ apiKey: 'fixture', fetch: async (_url, init) => { proposal = JSON.parse(init.body); return Response.json({ data: { persisted: false } }); } });
  const context = { protocol: 'chat', tools: true };
  await client.previewPool(config, context);
  assert.deepEqual(proposal, { configuration: config, context });
});

test('SDK preserves version 2 Auto strategy and bounded task context', async () => {
  const autoStrategy = {
    version: 2,
    mode: 'auto',
    auto: {
      paths: [
        { id: 'deep', response_type: 'text', candidates: ['fast'], task: ['architecture'] },
        { id: 'quick', response_type: 'text', candidates: ['fast'], task: ['chat'] },
      ],
      decider: {
        model: 'fast', currency: 'USD', timeout_ms: 800, max_calls: 1,
        max_input_tokens: 1024, max_output_tokens: 32, max_spend_nanos: 5000000,
        min_confidence: 0.6, on_abstain: 'fallback', on_failure: 'fallback',
      },
    },
  };
  const autoConfig = { ...config, strategy: autoStrategy };
  let proposal;
  const client = new NiuClient({ apiKey: 'fixture', fetch: async (_url, init) => {
    proposal = JSON.parse(init.body);
    return Response.json({ data: { configuration_valid: true, persisted: false, strategy: autoStrategy, simulation: {
      protocol: 'chat', outcome: 'candidates', strategy: autoStrategy,
      selection_basis: 'auto_context', selected_path: 'quick', selected_candidate: null,
      decision: { outcome: 'context_match', path: 'quick', fallback_reason: null, failure: null,
        calls: 0, input_tokens: null, output_tokens: null, latency_ms: 0,
        tokens_estimated: false, estimated_customer_charge_nanos: null, live_dispatch: false },
      live_dispatch: false, candidates: [],
    } } });
  } });
  const context = { protocol: 'chat', task: 'chat' };
  const result = await client.previewPool(autoConfig, context);
  assert.deepEqual(proposal, { configuration: autoConfig, context });
  assert.deepEqual(proposal.configuration.strategy, autoStrategy);
  assert.equal(result.data.simulation.selection_basis, 'auto_context');
  assert.equal(result.data.simulation.selected_path, 'quick');
  assert.equal(result.data.simulation.decision.calls, 0);
  assert.equal(result.data.simulation.decision.live_dispatch, false);
});
