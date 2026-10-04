import test from 'node:test';
import assert from 'node:assert/strict';
import { codexRecords, startCodexReceiver } from '../src/codex.mjs';
const config = { source: 'codex' };
const input = (extra = {}) => ({ resourceLogs: [{ resource: { attributes: [{ key: 'user.email', value: { stringValue: 'private@example.com' } }] }, scopeLogs: [{ logRecords: [{ timeUnixNano: '1700000000000000000', body: { stringValue: 'codex.sse_event' }, attributes: Object.entries({ kind: 'response.completed', input_token_count: '12', output_token_count: '3', cached_input_token_count: '4', model: 'gpt-test', success: true, prompt: 'PRIVATE PROMPT', output: 'PRIVATE OUTPUT', ...extra }).map(([key, value]) => ({ key, value: typeof value === 'boolean' ? { boolValue: value } : { stringValue: value } })) }] }] }] });
test('completion metadata excludes content and produces stable duplicate identity', () => {
  const [value] = codexRecords(config, input());
  assert.equal(value.record.external_usage.input_tokens, '12');
  assert.equal(value.record.external_usage.cache_read_tokens, '4');
  assert.equal(value.record.spans[0].status, 'unknown');
  assert.equal(value.record.spans[1].requested_model, 'gpt-test');
  assert.equal(value.record.spans[0].started_at_ms, null);
  assert.equal(value.record.record_id, codexRecords(config, input({ prompt: 'OTHER SECRET' }))[0].record.record_id);
  assert.doesNotMatch(JSON.stringify(value), /PRIVATE|private@example|prompt|output snippet/);
});
test('unknown fields and missing counters remain unknown; streaming events are excluded', () => {
  assert.equal(codexRecords(config, input({ kind: 'response.delta' })).length, 0);
  const [value] = codexRecords(config, input({ input_token_count: '-1', model: '/private path', cached_input_token_count: 'oops' }));
  assert.equal(value.record.external_usage.input_tokens, null);
  assert.equal(value.record.external_usage.cache_read_tokens, null);
  assert.equal(value.record.spans[1].requested_model, null);
});
test('receiver authenticates, rejects unsupported formats, and acknowledges only durable delivery', async () => {
  const saved = [];
  const receiver = await startCodexReceiver(config, { deliverRecord: async (_, value) => saved.push(value) });
  try {
    const post = (body, headers = {}) => fetch(receiver.endpoint, { method: 'POST', body, headers });
    assert.equal((await post('{}')).status, 401);
    const headers = { authorization: `Bearer ${receiver.secret}`, 'content-type': 'application/json' };
    assert.equal((await post(JSON.stringify(input()), headers)).status, 200);
    assert.equal(saved.length, 1);
    assert.equal((await post('{}', { ...headers, 'content-type': 'application/x-protobuf' })).status, 415);
    assert.equal((await post('not json', headers)).status, 503);
  } finally { await receiver.close(); }
  const failing = await startCodexReceiver(config, { deliverRecord: async () => { throw new Error('disk full'); } });
  try {
    assert.equal((await fetch(failing.endpoint, { method: 'POST', body: JSON.stringify(input()), headers: { authorization: `Bearer ${failing.secret}`, 'content-type': 'application/json' } })).status, 503);
  } finally { await failing.close(); }
});

test('timing-only completion is omitted and native cache field is retained', () => {
  const value = input();
  const log = value.resourceLogs[0].scopeLogs[0].logRecords[0];
  log.attributes = log.attributes.filter(item => !['input_token_count', 'output_token_count'].includes(item.key));
  assert.equal(codexRecords(config, value).length, 0);
  const [record] = codexRecords(config, input({ cached_token_count: '7', cache_write_token_count: '2', 'app.version': '0.154.0' }));
  assert.equal(record.record.external_usage.cache_read_tokens, '7');
  assert.equal(record.record.external_usage.cache_creation_tokens, '2');
  assert.equal(record.record.external_usage.agent_version, '0.154.0');
  assert.equal(record.record.spans[1].reported_model, null);
  assert.equal(record.record.spans[1].status, 'completed');
});
