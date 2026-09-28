import assert from 'node:assert/strict';
import test from 'node:test';
import { ClaudeCodeOtelCollector } from '../dist/index.js';

function otlp(...records) {
  return {
    resourceLogs: [{
      resource: { attributes: [
        { key: 'service.version', value: { stringValue: '2.1.211' } },
        { key: 'session.id', value: { stringValue: 'session-123' } },
      ] },
      scopeLogs: [{ logRecords: records }],
    }],
  };
}

function log(eventName, sequence, attributes = {}) {
  return {
    body: { stringValue: `claude_code.${eventName}` },
    timeUnixNano: String(Date.parse('2026-09-28T01:02:03.000Z') * 1_000_000),
    attributes: Object.entries({
      'event.name': eventName,
      'event.sequence': String(sequence),
      'event.timestamp': '2026-09-28T01:02:03.000Z',
      'prompt.id': 'prompt-456',
      ...attributes,
    }).map(([key, value]) => ({ key, value: { stringValue: String(value) } })),
  };
}

test('Claude Code collection emits idempotent, immutable metadata records per event', () => {
  const payload = otlp(
    log('user_prompt', 1, { prompt: 'private prompt text', prompt_length: 27 }),
    log('api_request', 2, {
      request_id: 'req_123',
      model: 'claude-sonnet-5',
      input_tokens: 120,
      output_tokens: 24,
      cache_read_tokens: 16,
      cache_creation_tokens: 0,
      cost_usd_micros: 100,
      response: 'private response text',
    }),
    log('tool_result', 3, {
      tool_use_id: 'tool-789',
      tool_name: 'Bash',
      tool_parameters: 'private command',
      success: true,
      duration_ms: 75,
      output: 'private tool output',
    }),
    log('api_error', 4, {
      client_request_id: 'client-012',
      model: 'claude-sonnet-5',
      attempt: 3,
      error: 'private provider error',
      duration_ms: 900,
    }),
  );
  const collector = new ClaudeCodeOtelCollector();
  assert.deepEqual(collector.ingest(payload), { accepted: 4, skipped: 0 });
  const records = collector.takeRecords();

  assert.equal(records.length, 4);
  assert.equal(new Set(records.map(record => record.record_id)).size, 4);
  assert.equal(new Set(records.map(record => record.task_id)).size, 1);
  assert.ok(records.every(record => record.coverage === 'partial' && record.outcomes.length === 0));

  const apiRequest = records.find(record => record.external_usage.request_count === 1 && record.external_usage.cost_nanos !== null);
  assert.ok(apiRequest);
  assert.equal(apiRequest.external_usage.authority, 'agent_reported_estimate');
  assert.equal(apiRequest.external_usage.input_tokens, '120');
  assert.equal(apiRequest.external_usage.output_tokens, '24');
  assert.equal(apiRequest.external_usage.cost_nanos, '100000');
  assert.equal(apiRequest.external_usage.currency, 'USD');
  assert.equal(apiRequest.spans.find(span => span.kind === 'model_invocation').reported_model, 'claude-sonnet-5');
  assert.equal(apiRequest.spans.find(span => span.kind === 'model_invocation').charge_ref, null);

  const tool = records.find(record => record.spans.some(span => span.kind === 'tool_invocation'));
  assert.equal(tool.spans.find(span => span.kind === 'tool_invocation').status, 'completed');
  const error = records.find(record => record.spans.some(span => span.kind === 'model_invocation' && span.status === 'failed'));
  assert.equal(error.external_usage.retry_count, 2);
  assert.equal(error.external_usage.cost_nanos, null);

  const serialized = JSON.stringify(records);
  for (const privateValue of [
    'private prompt text', 'private response text', 'private command',
    'private tool output', 'private provider error', 'tool_parameters',
  ]) assert.equal(serialized.includes(privateValue), false);

  assert.deepEqual(collector.ingest(payload), { accepted: 4, skipped: 4 });
  assert.deepEqual(collector.takeRecords(), []);
});

test('unsupported and identity-free OTLP log records are skipped', () => {
  const collector = new ClaudeCodeOtelCollector();
  const payload = otlp(
    log('api_request', 1),
    log('internal_error', 2),
  );
  delete payload.resourceLogs[0].resource.attributes[1];
  assert.deepEqual(collector.ingest(payload), { accepted: 0, skipped: 2 });
  assert.deepEqual(collector.takeRecords(), []);
});
