import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import test from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ClaudeCollectionReceiver } from '../bin/claude-collection.mjs';

const organizationId = '00000000-0000-4000-8000-000000000001';
const projectId = '00000000-0000-4000-8000-000000000002';
const collectorKey = 'niu_collector_' + 'c'.repeat(64);

function payload() {
  return {
    resourceLogs: [{
      resource: { attributes: [
        { key: 'service.version', value: { stringValue: '2.1.211' } },
        { key: 'session.id', value: { stringValue: 'session-123' } },
      ] },
      scopeLogs: [{ logRecords: [{
        body: { stringValue: 'claude_code.api_request' },
        timeUnixNano: '1790557323000000000',
        attributes: [
          { key: 'event.name', value: { stringValue: 'api_request' } },
          { key: 'event.sequence', value: { intValue: '2' } },
          { key: 'prompt.id', value: { stringValue: 'prompt-456' } },
          { key: 'model', value: { stringValue: 'claude-sonnet-5' } },
          { key: 'input_tokens', value: { intValue: '120' } },
          { key: 'output_tokens', value: { intValue: '25' } },
          { key: 'prompt', value: { stringValue: 'private prompt' } },
        ],
      }] }],
    }],
  };
}

async function postLogs(receiver, local, document = payload(), authorization = local.authorization) {
  return fetch(local.url, {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify(document),
  });
}

test('Claude OTLP receiver authenticates locally, strips content, and writes scoped events to Niu', async () => {
  const stateDirectory = await mkdtemp(join(tmpdir(), 'niu-agent-connect-'));
  const requests = [];
  const receiver = new ClaudeCollectionReceiver({
    gatewayBaseURL: 'https://gateway.example.test/niu/v1',
    organizationId,
    projectId,
    collectorKey,
    stateDirectory,
    fetch: async (url, init) => {
      requests.push({ url: String(url), init });
      return new Response(JSON.stringify({ id: 'record-id', created: true }), { status: 201 });
    },
  });
  try {
    const local = await receiver.listen();
    const unauthorized = await postLogs(receiver, local, payload(), 'Bearer wrong-local-secret');
    assert.equal(unauthorized.status, 401);

    const accepted = await postLogs(receiver, local);
    assert.equal(accepted.status, 200);
    assert.deepEqual(await accepted.json(), { partialSuccess: {} });
    await receiver.flush();

    assert.equal(requests.length, 1);
    assert.equal(requests[0].url,
      `https://gateway.example.test/admin/v1/organizations/${organizationId}/projects/${projectId}/executions`);
    assert.equal(requests[0].init.headers.authorization, `Bearer ${collectorKey}`);
    assert.equal(requests[0].init.redirect, 'error');
    const sent = JSON.parse(requests[0].init.body);
    assert.equal(sent.source, 'claude-code-otel');
    assert.equal(sent.coverage, 'partial');
    assert.equal(sent.external_usage.authority, 'agent_reported_estimate');
    assert.equal(sent.spans.find(span => span.kind === 'model_invocation').charge_ref, null);
    assert.equal(JSON.stringify(sent).includes('private prompt'), false);
    assert.equal(await receiver.queueLength(), 0);
  } finally {
    await receiver.close();
    await rm(stateDirectory, { recursive: true, force: true });
  }
});

test('unsent metadata survives process restart in a private queue and retries idempotently', async () => {
  const stateDirectory = await mkdtemp(join(tmpdir(), 'niu-agent-connect-'));
  let delivered = 0;
  const options = {
    gatewayBaseURL: 'https://gateway.example.test/v1',
    organizationId,
    projectId,
    collectorKey,
    stateDirectory,
  };
  const first = new ClaudeCollectionReceiver({ ...options, fetch: async () => new Response('', { status: 503 }) });
  try {
    const local = await first.listen();
    assert.equal((await postLogs(first, local)).status, 200);
    await first.flush();
    assert.equal(await first.queueLength(), 1);
    const [file] = (await readdir(join(stateDirectory, (await readdir(stateDirectory))[0]))).filter(name => name.endsWith('.json'));
    const queueDirectory = join(stateDirectory, (await readdir(stateDirectory))[0]);
    assert.equal((await stat(join(queueDirectory, file))).mode & 0o777, 0o600);
    assert.equal((await readFile(join(queueDirectory, file), 'utf8')).includes('private prompt'), false);
  } finally {
    await first.close();
  }

  const second = new ClaudeCollectionReceiver({
    ...options,
    fetch: async () => { delivered += 1; return new Response('', { status: 200 }); },
  });
  try {
    await second.listen();
    await second.flush();
    assert.equal(delivered, 1);
    assert.equal(await second.queueLength(), 0);
  } finally {
    await second.close();
    await rm(stateDirectory, { recursive: true, force: true });
  }
});
