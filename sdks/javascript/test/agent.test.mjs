import assert from 'node:assert/strict';
import test from 'node:test';
import { NiuAgentAdapter } from '../dist/index.js';

const scope = {
  organizationId: '11111111-1111-4111-8111-111111111111',
  projectId: '22222222-2222-4222-8222-222222222222',
};

test('agent adapter correlates gateway attempts and reports tool, retry and acceptance evidence', async () => {
  let id = 0;
  let now = 1790438400000;
  let inferenceCount = 0;
  const submissions = [];
  const fetcher = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    if (url.endsWith('/chat/completions')) {
      assert.equal(headers.get('authorization'), 'Bearer project-test-key');
      assert.equal(headers.get('x-niu-task-id'), 'task-adapter-1');
      const request = JSON.parse(String(init.body));
      assert.equal(request.model, 'fast');
      inferenceCount += 1;
      if (inferenceCount === 1) {
        return Response.json({ error: { message: 'temporary upstream error' } }, {
          status: 503,
          headers: { 'x-niu-attempt-id': '00000000-0000-4000-8000-000000000001' },
        });
      }
      return Response.json({
        id: 'chatcmpl-test', object: 'chat.completion', model: 'provider/fast',
        choices: [{ index: 0, message: { role: 'assistant', content: 'private-answer-must-not-be-recorded' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
      }, { headers: { 'x-niu-attempt-id': '00000000-0000-4000-8000-000000000002' } });
    }
    if (url.endsWith('/executions')) {
      assert.equal(headers.get('authorization'), 'Bearer execution-collector-key');
      assert.equal(url, `https://gateway.example.test/admin/v1/organizations/${scope.organizationId}/projects/${scope.projectId}/executions`);
      const record = JSON.parse(String(init.body));
      submissions.push(record);
      return Response.json({ id: '33333333-3333-4333-8333-333333333333', created: true }, { status: 201 });
    }
    throw new Error(`Unexpected adapter request: ${url}`);
  };

  const adapter = new NiuAgentAdapter({
    apiKey: 'project-test-key',
    collectorToken: 'execution-collector-key',
    scope,
    apiBaseURL: 'https://gateway.example.test/v1',
    adminBaseURL: 'https://gateway.example.test/admin/v1',
    source: 'sample-agent',
    fetch: fetcher,
    now: () => { now += 10; return now; },
    createId: () => `generated-${++id}`,
  });
  const task = adapter.createTask({ taskId: 'task-adapter-1', recordId: 'record-adapter-1', coverage: 'complete' });

  const completion = await task.retry(({ spanId }) => task.chatCompletions({
    model: 'fast',
    messages: [{ role: 'user', content: 'private-prompt-must-not-be-recorded' }],
  }, { parentSpanId: spanId }), { maxAttempts: 2 });
  assert.equal(completion.model, 'provider/fast');

  await task.withAgent(async agentSpan => {
    await task.withTool(async () => 'private-tool-output-must-not-be-recorded', agentSpan);
  });
  assert.equal(await task.validate(() => true), true);
  task.agentClaim('accepted');
  task.humanAcceptance('accepted');

  const receipt = await task.finish();
  assert.equal(receipt.created, true);
  await task.report();
  assert.equal(submissions.length, 2);
  assert.deepEqual(submissions[1], submissions[0]);

  const record = submissions[0];
  assert.equal(record.task_id, 'task-adapter-1');
  assert.equal(record.coverage, 'complete');
  assert.ok(record.spans.every(span => span.started_at_ms > 1700000000000 && span.ended_at_ms >= span.started_at_ms));
  const attempts = record.spans.filter(span => span.kind === 'attempt');
  assert.deepEqual(attempts.map(span => span.status), ['failed', 'completed']);
  assert.ok(record.links.some(link => link.from === attempts[0].id && link.to === attempts[1].id && link.kind === 'retries'));
  const models = record.spans.filter(span => span.kind === 'model_invocation');
  assert.deepEqual(models.map(span => span.charge_ref), [
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
  ]);
  assert.equal(models[1].requested_model, 'fast');
  assert.equal(models[1].reported_model, 'provider/fast');
  assert.ok(record.spans.some(span => span.kind === 'tool_invocation' && span.status === 'completed'));
  assert.ok(record.spans.some(span => span.kind === 'validation'));
  assert.deepEqual(new Set(record.outcomes.map(outcome => outcome.authority)), new Set([
    'agent_claim', 'deterministic_validator', 'human_acceptance',
  ]));
  const serialized = JSON.stringify(record);
  for (const privateValue of ['private-prompt-must-not-be-recorded', 'private-answer-must-not-be-recorded', 'private-tool-output-must-not-be-recorded']) {
    assert.equal(serialized.includes(privateValue), false);
  }
});

test('agent adapter leaves missing attempt references and pricing unknown', async () => {
  let submitted;
  const adapter = new NiuAgentAdapter({
    apiKey: 'project-test-key', collectorToken: 'execution-collector-key', scope,
    apiBaseURL: 'https://gateway.example.test/v1', adminBaseURL: 'https://gateway.example.test/admin/v1',
    fetch: async (input, init) => {
      if (String(input).endsWith('/chat/completions')) {
        assert.equal(new Headers(init.headers).get('x-niu-task-id'), 'task-unknown-cost');
        return Response.json({ model: 'fast', choices: [], usage: undefined });
      }
      submitted = JSON.parse(String(init.body));
      return Response.json({ id: 'record-id', created: true }, { status: 201 });
    },
  });
  const task = adapter.createTask({ taskId: 'task-unknown-cost', recordId: 'record-unknown-cost' });
  await task.chatCompletions({ model: 'fast', messages: [{ role: 'user', content: 'hello' }] });
  await task.finish();
  const model = submitted.spans.find(span => span.kind === 'model_invocation');
  assert.equal(model.charge_ref, null);
  assert.equal(submitted.coverage, 'partial');
  assert.equal('cash_nanos' in submitted, false);
});

test('agent adapter records an explicitly selected model fallback as a causal edge', async () => {
  let submitted;
  const adapter = new NiuAgentAdapter({
    apiKey: 'project-test-key', collectorToken: 'execution-collector-key', scope,
    apiBaseURL: 'https://gateway.example.test/v1', adminBaseURL: 'https://gateway.example.test/admin/v1',
    fetch: async (input, init) => {
      const url = String(input);
      if (url.endsWith('/chat/completions')) {
        const request = JSON.parse(String(init.body));
        if (request.model === 'strong') {
          return Response.json({ error: { message: 'unavailable' } }, {
            status: 503,
            headers: { 'x-niu-attempt-id': '00000000-0000-4000-8000-000000000011' },
          });
        }
        return Response.json({ model: 'provider/cheap', choices: [] }, {
          headers: { 'x-niu-attempt-id': '00000000-0000-4000-8000-000000000012' },
        });
      }
      if (url.endsWith('/executions')) {
        submitted = JSON.parse(String(init.body));
        return Response.json({ id: 'execution-id', created: true }, { status: 201 });
      }
      throw new Error(`Unexpected adapter request: ${url}`);
    },
  });
  const task = adapter.createTask({ taskId: 'fallback-task', recordId: 'fallback-record' });
  await assert.rejects(task.chatCompletions({ model: 'strong', messages: [] }, { executionSpanId: 'primary-call' }));
  await task.chatCompletions({ model: 'cheap', messages: [] }, {
    executionSpanId: 'fallback-call', fallbackFromSpanId: 'primary-call',
  });
  await task.finish();

  const primary = submitted.spans.find(span => span.id === 'primary-call');
  const fallback = submitted.spans.find(span => span.id === 'fallback-call');
  assert.equal(primary.status, 'failed');
  assert.equal(primary.requested_model, 'strong');
  assert.equal(primary.reported_model, null);
  assert.equal(fallback.requested_model, 'cheap');
  assert.equal(fallback.reported_model, 'provider/cheap');
  assert.ok(submitted.links.some(link => link.from === primary.id && link.to === fallback.id && link.kind === 'fallbacks'));
});
