import test from 'node:test';
import assert from 'node:assert/strict';
import { NiuClient, NiuAdminClient, NiuAuthClient, NiuAPIError, NiuStreamError } from '../dist/index.js';

const id = '11111111-1111-4111-8111-111111111111';
const scope = { organizationId: id, projectId: id };
const headers = {
  'x-request-id': 'request', 'x-niu-attempt-id': id, 'x-niu-operation-id': 'operation',
};
const transports = [
  ['inference', fetch => new NiuClient({ apiKey: 'fixture', fetch }), (c, o) => c.models.list(o)],
  ['admin raw', fetch => new NiuAdminClient({ adminToken: 'fixture', fetch }), (c, o) => c.listWorkspacesPage({}, o)],
  ['admin api', fetch => new NiuAdminClient({ adminToken: 'fixture', fetch }), (c, o) => c.listWorkspaceKeys(id, o)],
  ['admin v1', fetch => new NiuAdminClient({ adminToken: 'fixture', fetch }), (c, o) => c.listDashboardVideoModels(scope, id, o)],
  ['asset binary', fetch => new NiuAdminClient({ adminToken: 'fixture', fetch }), (c, o) => c.downloadWorkspaceAsset(scope, id, o)],
  ['auth', fetch => new NiuAuthClient({ fetch }), (c, o) => c.getMemberAuthenticationConfiguration(o)],
];

for (const [name, create, call] of transports) {
  test(`${name}: metadata precedes body handling on success/error and callback failure cancels without retry`, async () => {
    for (const status of [200, 403]) {
      let requests = 0, observed = 0, response;
      const client = create(async () => {
        requests++;
        response = Response.json({ data: [], error: { message: 'Denied' } }, { status, headers });
        return response;
      });
      const result = call(client, { onResponse(metadata) {
        observed++;
        assert.equal(response.bodyUsed, false);
        assert.deepEqual(metadata, { status, requestId: 'request', attemptId: id, operationId: 'operation' });
      } });
      if (status === 403) await assert.rejects(result, error => error instanceof NiuAPIError && error.status === status);
      else await result;
      assert.equal(requests, 1); assert.equal(observed, 1);
    }
    let cancelled = 0, requests = 0;
    const client = create(async () => {
      requests++;
      return new Response(new ReadableStream({ cancel() { cancelled++; } }));
    });
    const failure = new Error('Observer failure');
    await assert.rejects(call(client, { onResponse() { throw failure; } }), error => error === failure);
    assert.equal(cancelled, 1); assert.equal(requests, 1);
  });
}

test('auth 204 notifies once with absent references represented as null', async () => {
  let calls = 0;
  await new NiuAuthClient({ fetch: async () => new Response(null, { status: 204 }) })
    .signOut('fixture', { onResponse(metadata) {
      calls++;
      assert.deepEqual(metadata, { status: 204, requestId: null, attemptId: null, operationId: null });
    } });
  assert.equal(calls, 1);
});

test('stream API errors retain protocol data, actual HTTP status and correlation references', async () => {
  const failures = [
    ['chat', { error: { message: 'Chat failed', type: 'upstream_error' } }, ''],
    ['messages', { type: 'error', error: { message: 'Messages failed', type: 'overloaded_error' } }, 'event: error\n'],
    ['responses', { type: 'response.failed', response: { error: { message: 'Responses failed', code: 'server_error' } } }, 'event: response.failed\n'],
  ];
  for (const [protocol, payload, prefix] of failures) for (const afterContent of [false, true]) {
    let requests = 0;
    const client = new NiuClient({ apiKey: 'fixture', fetch: async () => {
      requests++;
      return new Response((afterContent ? 'data: {"type":"content","text":"partial"}\n\n' : '')
        + prefix + `data: ${JSON.stringify(payload)}\n\n`,
      { headers: { ...headers, 'content-type': 'text/event-stream' } });
    } });
    const events = [];
    await assert.rejects(async () => {
      for await (const chunk of client[protocol].stream({ model: 'fixture', messages: [] })) events.push(chunk);
    }, error => {
      assert.ok(error instanceof NiuStreamError);
      assert.ok(error instanceof NiuAPIError);
      assert.equal(error.kind, 'api'); assert.equal(error.status, 200);
      assert.equal(error.attemptId, id); assert.equal(error.requestId, 'request');
      assert.equal(error.operationId, 'operation');
      assert.deepEqual(error.responseBody, payload);
      assert.match(error.message, /failed/);
      return true;
    });
    assert.equal(events.length, Number(afterContent)); assert.equal(requests, 1);
  }
});

test('stream framing, truncation, transport and cancellation remain distinguishable', async () => {
  for (const [body, kind] of [
    ['data: broken\n\n', 'invalid_stream'],
    ['data: []\n\n', 'invalid_stream'],
    ['data: {"text":"partial"}\n\n', 'incomplete_stream'],
    ['event: error\ndata: not-json\n\n', 'api'],
    [new Uint8Array([0xff]), 'invalid_stream'],
  ]) {
    const client = new NiuClient({ apiKey: 'fixture', fetch: async () => new Response(body, { headers: { ...headers, 'content-type': 'text/event-stream' } }) });
    await assert.rejects(async () => { for await (const chunk of client.chat.stream({ model: 'fixture', messages: [] })) {} },
      error => error instanceof NiuStreamError && error.kind === kind && error.attemptId === id);
  }
  const failure = new Error('Socket closed');
  const client = new NiuClient({ apiKey: 'fixture', fetch: async () => new Response(
    new ReadableStream({ start(controller) { controller.error(failure); } }),
    { headers: { ...headers, 'content-type': 'text/event-stream' } },
  ) });
  await assert.rejects(async () => { for await (const chunk of client.chat.stream({ model: 'fixture', messages: [] })) {} },
    error => error instanceof NiuStreamError && error.kind === 'transport' && error.cause === failure);
  const controller = new AbortController();
  const cancelled = new Error('Caller stopped');
  controller.abort(cancelled);
  await assert.rejects(async () => { for await (const chunk of client.chat.stream({ model: 'fixture', messages: [] }, { signal: controller.signal })) {} },
    error => error === cancelled);
});
