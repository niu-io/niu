import assert from 'node:assert/strict';
import test from 'node:test';
import { NiuAPIError, NiuClient } from '../dist/index.js';

test('lists models with bearer authorization', async () => {
  let captured;
  const client = new NiuClient({
    apiKey: 'test-token',
    baseURL: 'https://gateway.example.test/v1/',
    fetch: async (input, init) => {
      captured = { url: String(input), authorization: new Headers(init?.headers).get('authorization') };
      return Response.json({ data: [{ id: 'fast', object: 'model' }] });
    },
  });

  const result = await client.models.list();

  assert.equal(captured.url, 'https://gateway.example.test/v1/models');
  assert.equal(captured.authorization, 'Bearer test-token');
  assert.equal(result.data[0].id, 'fast');
});

test('posts chat requests and returns a typed API error for failures', async () => {
  let capturedBody;
  const client = new NiuClient({
    apiKey: 'test-token',
    fetch: async (_input, init) => {
      capturedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ error: { message: 'Unknown model' } }), {
        status: 404,
        headers: { 'content-type': 'application/json', 'x-request-id': 'req_123' },
      });
    },
  });

  await assert.rejects(
    client.chat.completions({ model: 'missing', messages: [{ role: 'user', content: 'Hi' }] }),
    (error) => {
      assert.ok(error instanceof NiuAPIError);
      assert.equal(error.status, 404);
      assert.equal(error.message, 'Unknown model');
      assert.equal(error.requestId, 'req_123');
      return true;
    },
  );
  assert.equal(capturedBody.model, 'missing');
});


test('directs streaming calls to the iterator API', async () => {
  let calls = 0;
  const client = new NiuClient({ apiKey: 'test', fetch: async () => {
    calls += 1;
    return Response.json({});
  }});
  await assert.rejects(client.chat.completions({ model: 'fast', messages: [], stream: true }), /Use chat.stream/);
  assert.equal(calls, 0);
});


test('stream iterator preserves fragmented Unicode, multiline data and requests usage', async () => {
  const wire = new TextEncoder().encode('data: {\r\ndata: "choices":[{"delta":{"content":"你好"}}]}\r\n\r\ndata: [DONE]\r\n\r\n');
  let position = 0;
  let cancelled = false;
  const abort = new AbortController();
  const client = new NiuClient({ apiKey: 'test', fetch: async (_url, init) => {
    assert.equal(init.signal, abort.signal);
    assert.equal(JSON.parse(init.body).stream_options.include_usage, true);
    assert.equal(new Headers(init.headers).get('accept'), 'text/event-stream');
    return new Response(new ReadableStream({ pull(controller) {
      if (position === wire.length) { controller.close(); return; }
      controller.enqueue(wire.slice(position, ++position));
    }, cancel() { cancelled = true; } }), { headers: { 'content-type': 'text/event-stream' } });
  }});
  const chunks = [];
  for await (const chunk of client.chat.stream({ model: 'fast', messages: [] }, { signal: abort.signal })) chunks.push(chunk);
  assert.equal(chunks[0].choices[0].delta.content, '你好');
  assert.equal(chunks.length, 1);
});

test('breaking iteration cancels the response body', async () => {
  let cancelled = false;
  const client = new NiuClient({ apiKey: 'test', fetch: async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('data: {"choices":[]}\n\n')); },
    cancel() { cancelled = true; },
  }), { headers: { 'content-type': 'text/event-stream' } }) });
  for await (const _chunk of client.chat.stream({ model: 'fast', messages: [] })) break;
  assert.equal(cancelled, true);
});

test('truncated, malformed and oversized streams fail explicitly', async () => {
  for (const wire of ['data: {}\n\n', 'data: broken\n\n', 'x'.repeat(65_537), 'event: error\ndata: {}\n\n']) {
    const client = new NiuClient({ apiKey: 'test', fetch: async () => new Response(wire, { headers: { 'content-type': 'text/event-stream' } }) });
    await assert.rejects(async () => { for await (const _chunk of client.chat.stream({ model: 'fast', messages: [] })) {} });
  }
});
