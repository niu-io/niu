import assert from 'node:assert/strict';
import test from 'node:test';
import { NiuAPIError, NiuClient } from '../dist/index.js';

const schema = {
  type: 'object',
  properties: {
    label: { type: 'string', enum: ['billing', 'technical'] },
    urgent: { type: 'boolean' },
  },
  required: ['label'],
  additionalProperties: false,
};

test('SDK invokes the explicit decision endpoint with bounded input and evidence', async () => {
  const calls = [];
  const client = new NiuClient({
    apiKey: 'fixture',
    baseURL: 'https://niu.example/v1',
    fetch: async (url, init) => {
      calls.push({ url, ...init });
      return Response.json({
        decision: { label: 'billing' },
        evidence: {
          outcome: 'decided', model: 'fast', calls: 1, input_tokens: 11,
          output_tokens: 3, tokens_estimated: false, latency_ms: 12,
          timeout_ms: 800, max_output_tokens: 32,
        },
      });
    },
  });
  const result = await client.createDecision({
    model: 'fast',
    input: { message: 'The invoice total is wrong' },
    output_schema: schema,
    timeout_ms: 800,
    max_output_tokens: 32,
  });
  assert.deepEqual(result.decision, { label: 'billing' });
  assert.equal(result.evidence.outcome, 'decided');
  assert.equal(result.evidence.tokens_estimated, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://niu.example/v1/decisions');
  assert.equal(calls[0].method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].body), {
    model: 'fast',
    input: { message: 'The invoice total is wrong' },
    output_schema: schema,
    timeout_ms: 800,
    max_output_tokens: 32,
  });
});

test('SDK preserves explicit abstention instead of inventing a decision', async () => {
  const client = new NiuClient({
    apiKey: 'fixture',
    baseURL: 'https://niu.example/v1',
    fetch: async () => Response.json({
      decision: null,
      evidence: {
        outcome: 'abstained', model: 'fast', calls: 1, input_tokens: 10,
        output_tokens: 2, tokens_estimated: false, latency_ms: 8,
        timeout_ms: 2000, max_output_tokens: 128,
      },
    }),
  });
  const result = await client.createDecision({ model: 'fast', input: 'ambiguous', output_schema: schema });
  assert.equal(result.decision, null);
  assert.equal(result.evidence.outcome, 'abstained');
});

test('SDK rejects pool routing, incompatible schemas and unbounded limits locally', async () => {
  let called = 0;
  const client = new NiuClient({
    apiKey: 'fixture',
    fetch: async () => {
      called++;
      return Response.json({ decision: null, evidence: {} });
    },
  });
  const valid = { model: 'fast', input: 'x', output_schema: schema };
  assert.throws(() => client.createDecision({ ...valid, model: 'pool/assistant' }), /pools and Auto are not accepted/);
  assert.throws(() => client.createDecision({ ...valid, model: 'codex/session' }), /pools and Auto are not accepted/);
  assert.throws(() => client.createDecision({ ...valid, timeout_ms: 10 }), /timeout_ms/);
  assert.throws(() => client.createDecision({ ...valid, max_output_tokens: 2048 }), /max_output_tokens/);
  assert.throws(
    () => client.createDecision({ ...valid, output_schema: { ...schema, additionalProperties: true } }),
    /additionalProperties false/,
  );
  assert.throws(
    () => client.createDecision({ ...valid, output_schema: { type: 'object', properties: { abstain: { type: 'boolean' } }, required: ['abstain'], additionalProperties: false } }),
    /abstain is reserved/,
  );
  assert.equal(called, 0);
});

test('SDK exposes gateway decision error evidence without retrying', async () => {
  let calls = 0;
  const client = new NiuClient({
    apiKey: 'fixture',
    baseURL: 'https://niu.example/v1',
    fetch: async () => {
      calls++;
      return Response.json(
        { error: { message: 'invalid decision', type: 'decision_invalid_output' } },
        { status: 502, headers: { 'x-niu-error-code': 'decision_invalid_output', 'x-niu-decision-outcome': 'invalid' } },
      );
    },
  });
  await assert.rejects(
    () => client.createDecision({ model: 'fast', input: 'x', output_schema: schema }),
    (error) => {
      assert.ok(error instanceof NiuAPIError);
      assert.equal(error.status, 502);
      assert.equal(error.gatewayCode, 'decision_invalid_output');
      return true;
    },
  );
  assert.equal(calls, 1);
});
