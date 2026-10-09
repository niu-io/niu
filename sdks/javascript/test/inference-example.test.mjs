import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import test from 'node:test';

const example = new URL('../examples/verify-inference.mjs', import.meta.url);
async function run(t, { denied = false, missingModel = false, missingTerminal = false } = {}) {
  const calls = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    calls.push({ path: req.url, method: req.method, authorization: req.headers.authorization, retention: req.headers['x-niu-log-payloads'], body: body ? JSON.parse(body) : null });
    if (denied) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'example-private-key' } }));
    } else if (req.url === '/v1/models') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: missingModel ? [] : [{ id: 'demo/model' }] }));
    } else if (calls.at(-1).body.stream) {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end('data: {"choices":[{"delta":{"content":"OK"},"finish_reason":null}]}\n\n' +
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n' + (missingTerminal ? '' : 'data: [DONE]\n\n'));
    } else {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }] }));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const child = spawn(process.execPath, [example.pathname], { env: { ...process.env,
    NIU_API_KEY: 'example-private-key', NIU_BASE_URL: `http://127.0.0.1:${server.address().port}/v1`, NIU_MODEL_ALIAS: 'demo/model' } });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
  assert(!stdout.includes('example-private-key')); assert(!stderr.includes('example-private-key'));
  return { code, stdout, stderr, calls };
}

test('inference example uses a scoped key, bounded calls and payload opt-out while preserving unknown usage', async t => {
  const result = await run(t);
  assert.equal(result.code, 0);
  assert.equal(result.calls.length, 3);
  assert(result.calls.every(call => call.authorization === 'Bearer example-private-key' && call.retention === 'false'));
  for (const call of result.calls.slice(1)) { assert.equal(call.body.model, 'demo/model'); assert.equal(call.body.max_tokens, 64); }
  assert.equal(result.calls[2].body.stream_options.include_usage, true);
  const report = JSON.parse(result.stdout);
  assert.equal(report.nonstreaming.reportedUsage, null);
  assert.equal(report.streaming.reportedUsage, null);
  assert.equal(report.streaming.completed, true);
});
test('inference example stops on unauthorized discovery without retries or inference calls', async t => {
  const result = await run(t, { denied: true });
  assert.equal(result.code, 1); assert.equal(result.calls.length, 1);
  assert.match(result.stderr, /model discovery \(HTTP 401\)/);
});
test('inference example never dispatches an unavailable model', async t => {
  const result = await run(t, { missingModel: true });
  assert.equal(result.code, 1); assert.equal(result.calls.length, 1);
});
test('inference example rejects a truncated stream instead of claiming completion', async t => {
  const result = await run(t, { missingTerminal: true });
  assert.equal(result.code, 1); assert.equal(result.calls.length, 3);
  assert.match(result.stderr, /streaming Chat/);
});
