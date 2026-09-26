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

test('forwards function-tool and structured-output request contracts', async () => {
  const captured = [];
  const client = new NiuClient({ apiKey: 'test-token', fetch: async (_input, init) => {
    const body = JSON.parse(String(init.body));
    captured.push(body);
    return Response.json(body.tools ? {
      id: 'chatcmpl_1', object: 'chat.completion', model: 'fast',
      choices: [{ index: 0, message: {
        role: 'assistant', content: null,
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'lookup_weather', arguments: '{"city":"Paris"}' } }],
      }, finish_reason: 'tool_calls' }],
      usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 },
    } : {
      id: 'chatcmpl_2', object: 'chat.completion', model: 'fast',
      choices: [{ index: 0, message: { role: 'assistant', content: '{"answer":42}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 },
    });
  }});
  const toolRequest = {
    model: 'fast', messages: [{ role: 'user', content: 'Weather in Paris?' }],
    tools: [{ type: 'function', function: { name: 'lookup_weather', parameters: { type: 'object' } } }],
    tool_choice: 'required',
  };
  const jsonRequest = {
    model: 'fast', messages: [{ role: 'user', content: 'Return a JSON object' }],
    response_format: { type: 'json_schema', json_schema: { name: 'answer', schema: { type: 'object' } } },
  };

  const toolResult = await client.chat.completions(toolRequest);
  const jsonResult = await client.chat.completions(jsonRequest);

  assert.deepEqual(captured, [toolRequest, jsonRequest]);
  assert.equal(toolResult.choices[0].message.tool_calls[0].function.name, 'lookup_weather');
  assert.equal(jsonResult.choices[0].message.content, '{"answer":42}');
  assert.equal(toolResult.usage.prompt_tokens, 4);
});

test('creates embeddings with the scoped model alias and supports cancellation', async () => {
  let captured;
  const abort = new AbortController();
  const client = new NiuClient({
    apiKey: 'test-token',
    baseURL: 'https://gateway.example.test/v1',
    fetch: async (input, init) => {
      captured = { url: String(input), body: JSON.parse(String(init.body)), headers: new Headers(init.headers), signal: init.signal };
      return Response.json({
        object: 'list',
        data: [{ object: 'embedding', index: 0, embedding: [0.1, 0.2] }],
        model: 'fast',
        usage: { prompt_tokens: 2, total_tokens: 2 },
      });
    },
  });

  const result = await client.embeddings.create({
    model: 'fast',
    input: ['hello'],
    dimensions: 2,
  }, { signal: abort.signal });

  assert.equal(captured.url, 'https://gateway.example.test/v1/embeddings');
  assert.equal(captured.headers.get('authorization'), 'Bearer test-token');
  assert.equal(captured.signal, abort.signal);
  assert.deepEqual(captured.body, { model: 'fast', input: ['hello'], dimensions: 2 });
  assert.equal(result.data[0].embedding.length, 2);
  assert.equal(result.usage.prompt_tokens, 2);
});

test('creates a text Responses request with a scoped key and cancellation', async () => {
  let captured;
  const abort = new AbortController();
  const client = new NiuClient({
    apiKey: 'test-token',
    baseURL: 'https://gateway.example.test/v1',
    fetch: async (input, init) => {
      captured = { url: String(input), body: JSON.parse(String(init.body)), headers: new Headers(init.headers), signal: init.signal };
      return Response.json({
        id: 'resp_1', object: 'response', status: 'completed', model: 'fast',
        output: [{ id: 'msg_1', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Hello' }] }],
        usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 },
      });
    },
  });
  const request = { model: 'fast', input: 'Hi', instructions: 'Be concise', max_output_tokens: 16 };

  const result = await client.responses.create(request, { signal: abort.signal });

  assert.equal(captured.url, 'https://gateway.example.test/v1/responses');
  assert.equal(captured.headers.get('authorization'), 'Bearer test-token');
  assert.equal(captured.signal, abort.signal);
  assert.deepEqual(captured.body, request);
  assert.equal(result.output[0].type, 'message');
  assert.equal(result.usage.input_tokens, 2);
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
