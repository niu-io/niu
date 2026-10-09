import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import test from 'node:test';

async function run(t, respond) {
  const calls = [];
  const server = createServer((req, res) => {
    calls.push(req.url);
    const result = respond(calls.length);
    res.writeHead(result.status ?? 200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(result.body));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const child = spawn(process.execPath, [new URL('../examples/inspect-usage.mjs', import.meta.url).pathname], {
    env: { ...process.env, NIU_ADMIN_TOKEN: 'usage-test-secret',
      NIU_ADMIN_BASE_URL: `http://127.0.0.1:${server.address().port}/admin/v1`,
      NIU_ORGANIZATION_ID: '12345678-1234-1234-1234-123456789abc', NIU_WORKSPACE_ID: '12345678-1234-1234-1234-123456789abc',
      NIU_MODEL_ALIAS: 'test-model', NIU_REQUEST_STATUS: 'output_withheld' },
  });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const code = await new Promise((resolve, reject) => {
    child.on('error', reject); child.on('close', resolve);
  });
  return { code, stdout, stderr, calls };
}

test('usage example preserves first-page exact charges and unknown timing across pagination', async t => {
  const summary = { request_count: 2, usage_count: 1, prompt_tokens: '9', completion_tokens: '2',
    customer_charges: [{ currency: 'USD', amount_nanos: '9007199254740993' }],
    unpriced_request_count: 1, unresolved_customer_charge_count: 0,
    delivery_statuses: [{ http_status: null, requests: 2 }],
    latency_percentiles: { boundary: 'gateway_body_ms', sample_count: 0, p50_ms: null, p95_ms: null, p99_ms: null },
    token_categories: { cached_input_tokens: '0', cached_input_requests: 1, cached_input_unknown_requests: 1,
      reasoning_output_tokens: null, reasoning_output_requests: 0, reasoning_output_unknown_requests: 2 } };
  const result = await run(t, n => ({ body: { data: [{ internal_id: 'hidden', payload: 'private-content' }],
    next_cursor: n === 1 ? '22345678-1234-1234-1234-123456789abc' : null, summary: n === 1 ? summary : {} } }));
  assert.equal(result.code, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.requestsTraversed, 2);
  assert.deepEqual(output.customerCharges, summary.customer_charges);
  assert.deepEqual(output.gatewayLatency, summary.latency_percentiles);
  assert.deepEqual(output.deliveryStatuses, summary.delivery_statuses);
  assert.deepEqual(output.tokenCategories, summary.token_categories);
  assert.ok(result.calls.every(url => url.includes('model_alias=test-model') && url.includes('status=output_withheld')));
  assert.ok(result.calls[1].includes('after=22345678-1234-1234-1234-123456789abc'));
  for (const privateValue of ['usage-test-secret', 'hidden', 'private-content']) assert.ok(!result.stdout.includes(privateValue));
});

test('usage example rejects looping pagination without printing a successful partial summary', async t => {
  const result = await run(t, () => ({ body: { data: [], summary: {}, next_cursor: '32345678-1234-1234-1234-123456789abc' } }));
  assert.notEqual(result.code, 0);
  assert.equal(result.calls.length, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /repeated cursor/);
});

test('usage example preserves authorization failure instead of reporting empty usage', async t => {
  const result = await run(t, () => ({ status: 403, body: { error: { message: 'Denied' } } }));
  assert.notEqual(result.code, 0);
  assert.equal(result.calls.length, 1);
  assert.equal(result.stdout, '');
});
