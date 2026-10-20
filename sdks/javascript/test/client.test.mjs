import assert from 'node:assert/strict';
import test from 'node:test';
import { NiuAPIError, NiuClient } from '../dist/index.js';

test('a completion exposes the attempt reference needed to read its customer charge', async () => {
  const attemptId = '12345678-1234-1234-1234-123456789abc';
  const calls = [];
  const client = new NiuClient({apiKey: 'test', fetch: async (url, init) => {
    calls.push({url, method: init.method});
    if (init.method === 'POST') return Response.json({id: 'upstream-completion', choices: []}, {
      headers: {'x-niu-attempt-id': attemptId, 'x-request-id': 'request-reference'},
    });
    return Response.json({data: {
      id: attemptId, model: 'fast', provider_model: null, request_kind: 'inference',
      created_at: '2026-10-20T00:00:00Z', dispatched_at: null, completed_at: null,
      duration_ms: null, execution: 'confirmed_completed', usage_confidence: 'reported',
      usage: {prompt_tokens: '10', completion_tokens: '20', cached_input_tokens: null, cache_write_input_tokens: null, reasoning_output_tokens: null},
      customer_charge: {status: 'charged', currency: 'USD', amount_nanos: '1000'},
      timing: null, finish_reasons: null, failure: null, output_guardrail_outcome: null,
    }});
  }});
  let metadata;
  const completion = await client.chat.completions({model: 'fast', messages: [{role: 'user', content: 'Hi'}]}, {
    onResponse: value => {metadata = value;},
  });
  assert.equal(completion.id, 'upstream-completion');
  assert.deepEqual(metadata, {status: 200, attemptId, requestId: 'request-reference', operationId: null});
  const generation = await client.getGeneration(metadata.attemptId);
  assert.equal(generation.data.customer_charge.amount_nanos, '1000');
  assert.deepEqual(calls, [
    {url: 'http://localhost:2555/v1/chat/completions', method: 'POST'},
    {url: `http://localhost:2555/v1/generations/${attemptId}`, method: 'GET'},
  ]);
});

test('response metadata arrives before streaming content and preserves HTTP errors', async () => {
  const seen = [];
  const client = new NiuClient({apiKey: 'test', fetch: async (_url, init) => {
    if (JSON.parse(init.body).stream) return new Response('data: {"id":"chunk","choices":[]}\n\ndata: [DONE]\n\n', {headers: {'content-type': 'text/event-stream'}});
    return Response.json({error: {message: 'Denied'}}, {status: 403, headers: {'x-niu-attempt-id': 'attempt-reference'}});
  }});
  for await (const _chunk of client.chat.stream({model: 'fast', messages: []}, {onResponse: metadata => seen.push(metadata.status)})) seen.push('chunk');
  assert.deepEqual(seen, [200, 'chunk']);
  await assert.rejects(client.chat.completions({model: 'fast', messages: []}, {onResponse: metadata => seen.push(metadata.attemptId)}), error => error instanceof NiuAPIError && error.status === 403);
  assert.equal(seen.at(-1), 'attempt-reference');
});

test('a response observer failure cancels the body without retrying the request', async () => {
  let calls = 0;
  let cancelled = false;
  const client = new NiuClient({apiKey: 'test', fetch: async () => {
    calls++;
    return new Response(new ReadableStream({cancel() {cancelled = true;}}));
  }});
  await assert.rejects(client.models.list({onResponse() {throw new Error('Observer failed');}}), /Observer failed/);
  assert.equal(calls, 1);
  assert.equal(cancelled, true);
});

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

test('uses the separate Niu credential header without replacing provider authorization', async () => {
  let captured;
  const client = new NiuClient({
    apiKey: 'niu-project-key',
    credentialHeader: 'x-niu-api-key',
    defaultHeaders: { authorization: 'Bearer provider-session' },
    fetch: async (_input, init) => {
      captured = new Headers(init.headers);
      return Response.json({ object: 'list', data: [] });
    },
  });
  await client.models.list();
  assert.equal(captured.get('x-niu-api-key'), 'niu-project-key');
  assert.equal(captured.get('authorization'), 'Bearer provider-session');
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

test('abort stops already-buffered events and cancels the body', async () => {
  const controller = new AbortController();
  let cancelled = false;
  const client = new NiuClient({ apiKey: 'test-token', fetch: async () => new Response(
    new ReadableStream({ start(stream) {
      stream.enqueue(new TextEncoder().encode(
        'data: {"choices":[{"delta":{"content":"first"}}]}\n\n' +
        'data: {"choices":[{"delta":{"content":"stale"}}]}\n\n' +
        'data: [DONE]\n\n'));
    }, cancel() { cancelled = true; } }), { headers: { 'content-type': 'text/event-stream' } }) });
  const stream = client.chat.stream({ model: 'fast', messages: [] }, { signal: controller.signal });
  assert.equal((await stream.next()).value.choices[0].delta.content, 'first');
  controller.abort();
  await assert.rejects(stream.next(), error => error.name === 'AbortError');
  assert.equal(cancelled, true);
});

test('abort releases a pending body read even when custom fetch ignores its signal', async () => {
  const controller = new AbortController();
  let cancelled = false;
  const client = new NiuClient({ apiKey: 'test-token', fetch: async () => new Response(
    new ReadableStream({ start(stream) {
      stream.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"first"}}]}\n\n'));
    }, cancel() { cancelled = true; } }), { headers: { 'content-type': 'text/event-stream' } }) });
  const stream = client.chat.stream({ model: 'fast', messages: [] }, { signal: controller.signal });
  await stream.next();
  const pending = stream.next();
  controller.abort();
  await assert.rejects(pending, error => error.name === 'AbortError');
  assert.equal(cancelled, true);
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


test('per-request payload retention overrides defaults across inference protocols', async () => {
  const observed = [];
  const client = new NiuClient({ apiKey: 'test-token',
    defaultHeaders: { 'x-niu-log-payloads': 'true' },
    fetch: async (url, init) => {
      observed.push(new Headers(init.headers).get('x-niu-log-payloads'));
      if (new Headers(init.headers).get('accept') === 'text/event-stream') {
        return new Response('data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
      }
      return Response.json({});
    },
  });
  const chat = { model: 'fast', messages: [{role: 'user', content: 'private'}] };
  await client.chat.completions(chat, { logPayloads: false });
  for await (const chunk of client.chat.stream(chat, { logPayloads: false })) {}
  await client.responses.create({ model: 'fast', input: 'private' }, { logPayloads: false });
  await client.embeddings.create({ model: 'fast', input: 'private' }, { logPayloads: false });
  await client.chat.completions(chat);
  await client.chat.completions(chat, { logPayloads: true });
  assert.deepEqual(observed, ['false', 'false', 'false', 'false', 'true', 'true']);
  await assert.rejects(client.chat.completions(chat, { logPayloads: 'false' }), /must be a boolean/);
  assert.equal(observed.length, 6);
});

test('video job reads preserve authorization, abort and unresolved state without retry', async () => {
  const controller = new AbortController();
  let calls = 0;
  const reference = '8fb4abdd-06a4-4d33-9bed-3ca6d3a5caa1';
  const client = new NiuClient({ apiKey: 'fixture-key', baseURL: 'https://gateway.example/v1', fetch: async (url, init) => {
    calls++;
    assert.equal(url, `https://gateway.example/v1/video/jobs/${reference}`);
    assert.equal(init.method, 'GET');
    assert.equal(init.body, undefined);
    assert.equal(init.signal, controller.signal);
    assert.equal(new Headers(init.headers).get('authorization'), 'Bearer fixture-key');
    return Response.json({ id: reference, object: 'video.job', model: 'video', status: 'submission_unknown' });
  }});
  const state = await client.video.jobs.retrieve(reference, { signal: controller.signal });
  assert.equal(state.status, 'submission_unknown');
  assert.equal(calls, 1);
  assert.throws(() => client.video.jobs.retrieve('../models'), TypeError);
  assert.equal(calls, 1);
});

test('video create sends one request and preserves an uncertain job reference', async () => {
  let calls = 0;
  const body = { model: 'configured-video', content: [{ type: 'text', text: 'A calm sea' }], duration: 5 };
  const client = new NiuClient({ apiKey: 'fixture-key', fetch: async (url, init) => {
    calls++;
    assert.ok(String(url).endsWith('/v1/video/jobs'));
    assert.equal(init.method, 'POST');
    assert.deepEqual(JSON.parse(init.body), body);
    return Response.json({ id: 'reference', object: 'video.job', model: body.model, status: 'submission_unknown' }, { status: 202 });
  }});
  assert.equal((await client.video.jobs.create(body)).status, 'submission_unknown');
  assert.equal(calls, 1);
});

test('video refresh is one explicit query operation and never replays creation', async () => {
  let calls = 0;
  const id = '8fb4abdd-06a4-4d33-9bed-3ca6d3a5caa1';
  const client = new NiuClient({ apiKey: 'fixture-key', fetch: async (url, init) => {
    calls++;
    assert.ok(String(url).endsWith(`/video/jobs/${id}/refresh`));
    assert.equal(init.method, 'POST');
    return Response.json({ error: { message: 'Reconciliation required' } }, { status: 409 });
  }});
  await assert.rejects(client.video.jobs.refresh(id), error => error instanceof NiuAPIError && error.status === 409);
  assert.equal(calls, 1);
});

test('video timings preserve measured spans and truncation without generation requests', async () => {
  const id = '8fb4abdd-06a4-4d33-9bed-3ca6d3a5caa1';
  const client = new NiuClient({ apiKey: 'fixture-key', fetch: async (url, init) => {
    assert.ok(String(url).endsWith(`/video/jobs/${id}/timings`));
    assert.equal(init.method, 'GET');
    return Response.json({ data: [{ phase: 'query', started_unix_ms: 1000, elapsed_ms: 45, outcome: 'received' }], has_more: true, lifecycle: { source: 'gateway_observation', submitted_unix_ms: 900, observations: [{ status: 'running', observed_unix_ms: 1045 }], conflicting_terminal: false } });
  }});
  const timings = await client.video.jobs.timings(id);
  assert.equal(timings.data[0].elapsed_ms, 45);
  assert.equal(timings.has_more, true);
  assert.equal(timings.lifecycle.source, 'gateway_observation');
  assert.equal(timings.lifecycle.observations[0].observed_unix_ms, 1045);
  assert.equal(timings.lifecycle.conflicting_terminal, false);
});


test('video billing reads exact customer amounts with no generation or retry', async () => {
  const id = '5ba41dcb-827e-4cc7-b8e7-2d3442e767c1';
  let calls = 0;
  const controller = new AbortController();
  const client = new NiuClient({ baseURL: 'https://gateway.example/v1', apiKey: 'fixture', fetch: async (url, init) => {
    calls++;
    assert.ok(String(url).endsWith(`/video/jobs/${id}/billing`));
    assert.equal(init.method, 'GET');
    assert.equal(init.body, undefined);
    assert.equal(init.signal, controller.signal);
    return new Response(JSON.stringify({ mode: 'customer', state: 'settled', currency: 'CNY', reserved_nanos: '0', charge_nanos: '9007199254740993', settled_usage: { meter: 'video_tokens', quantity: { numerator: '9007199254740995', denominator: '1' }, billable_quantity: { numerator: '9007199254740995', denominator: '1' }, provenance: 'Reported' }, usage: null, price: null, bound_exceeded: false, effective_output: null, estimate: { meter: 'video_tokens', quantity: { numerator: '108000', denominator: '1' }, provenance: 'Estimate', currency: 'CNY', amount_nanos: '9007199254740994' } }), { headers: { 'content-type': 'application/json' } });
  }});
  const billing = await client.video.jobs.billing(id, { signal: controller.signal });
  assert.equal(billing.charge_nanos, '9007199254740993');
  assert.equal(billing.settled_usage.quantity.numerator, '9007199254740995');
  assert.equal(billing.settled_usage.provenance, 'Reported');
  assert.equal(billing.estimate.amount_nanos, '9007199254740994');
  assert.equal(billing.estimate.provenance, 'Estimate');
  assert.equal(billing.effective_output, null);
  assert.equal(calls, 1);
  assert.throws(() => client.video.jobs.billing('../models'), TypeError);
});


test('video estimates use one bounded POST without creating a job or retrying', async () => {
  const body = { model: 'video-model', content: [{ type: 'text', text: 'A landscape' }] };
  let calls = 0;
  const client = new NiuClient({ baseURL: 'https://gateway.example/v1', apiKey: 'fixture', fetch: async (url, init) => {
    calls++;
    assert.ok(String(url).endsWith('/video/estimate'));
    assert.equal(init.method, 'POST');
    assert.deepEqual(JSON.parse(init.body), body);
    return new Response(JSON.stringify({ object: 'video.estimate', model: 'video-model', mode: 'customer', effective_output: { specification: { resolution: '720p', ratio: '16:9', width: 1280, height: 720 }, duration_seconds: 5, frames_per_second: 24, schema_revision: 'schema-1', estimator: 'SeedancePixelsV1', estimator_revision: 'pixels-1' }, estimate: { meter: 'video_tokens', quantity: { numerator: '108000', denominator: '1' }, currency: 'CNY', amount_nanos: '9007199254740993', provenance: 'Estimate' }, maximum_charge_nanos: '9007199254740994', selected_at: '10' }), { headers: { 'content-type': 'application/json' } });
  }});
  const quote = await client.video.estimate(body);
  assert.equal(quote.estimate.amount_nanos, '9007199254740993');
  assert.equal(quote.maximum_charge_nanos, '9007199254740994');
  assert.equal(calls, 1);
});


test('video history traverses bounded saved pages without polling or unsafe cursor coercion', async () => {
  const cursor = '5ba41dcb-827e-4cc7-b8e7-2d3442e767c1';
  let calls = 0;
  const client = new NiuClient({ baseURL: 'https://gateway.example/v1', apiKey: 'fixture', fetch: async (url, init) => {
    calls++;
    assert.equal(init.method, 'GET'); assert.equal(init.body, undefined);
    assert.equal(new URL(url).searchParams.get('limit'), '2');
    assert.equal(new URL(url).searchParams.get('before'), calls === 1 ? null : cursor);
    return new Response(JSON.stringify({ data: [{ id: cursor, object: 'video.job', model: 'video-model', status: 'submission_unknown', created_at_ms: '9007199254740993' }], has_more: calls === 1, next_before: calls === 1 ? cursor : null }), { headers: { 'content-type': 'application/json' } });
  }});
  const first = await client.video.jobs.list({ limit: 2 });
  assert.equal(first.data[0].created_at_ms, '9007199254740993');
  assert.equal((await client.video.jobs.list({ limit: 2, before: first.next_before })).has_more, false);
  for (const limit of [0, 101, 1.5, NaN]) assert.throws(() => client.video.jobs.list({ limit }), TypeError);
  assert.throws(() => client.video.jobs.list({ before: '../models' }), TypeError);
  assert.equal(calls, 2);
});

test('lists configured Video models without submission or retries', async () => {
  const calls=[];
  const client=new NiuClient({apiKey:'selected-key',baseURL:'https://niu.example/v1',fetch:async(url,init)=>{calls.push({url,init});return Response.json({object:'list',data:[]});}});
  const signal=new AbortController().signal;
  assert.deepEqual(await client.video.models.list({signal}),{object:'list',data:[]});
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,'https://niu.example/v1/video/models');
  assert.equal(calls[0].init.method,'GET');
  assert.equal(calls[0].init.body,undefined);
  assert.equal(calls[0].init.signal,signal);
  assert.equal(new Headers(calls[0].init.headers).get('authorization'),'Bearer selected-key');
});

test('introspects current API key and generation details via /v1/key and /v1/generations/{id}', async () => {
  const calls = [];
  const generationId = '12345678-1234-1234-1234-123456789abc';
  const client = new NiuClient({
    apiKey: 'session-token',
    keyId: generationId,
    baseURL: 'https://niu.example/v1',
    fetch: async (url, init) => {
      calls.push({ url: String(url), headers: new Headers(init?.headers), method: init?.method });
      if (String(url).endsWith('/key')) {
        return Response.json({
          data: {
            label: 'Production key',
            allowed_models: ['*'],
            expires_at_ms: null,
            revoked: false,
            expired: false,
            spending_limits: [],
            requests_per_minute: 120,
            tokens_per_minute: null,
            max_concurrent_requests: 10,
            token_usage_window: { window_seconds: 60, prompt_tokens: '10', completion_tokens: '20', total_tokens: '30', unknown_usage_requests: '0' },
            allowed_cidrs: null,
          },
        });
      }
      return Response.json({
        data: {
          id: generationId,
          model: 'openai/gpt-5',
          provider_model: null,
          request_kind: 'inference',
          execution: 'confirmed_completed',
          usage_confidence: 'reported',
          usage: {prompt_tokens: '10', completion_tokens: '20', cached_input_tokens: null, cache_write_input_tokens: null, reasoning_output_tokens: null},
          customer_charge: {status: 'charged', amount_nanos: '1000', currency: 'USD'},
          duration_ms: 420,
          dispatched_at: '2026-10-15T00:00:00Z',
          created_at: '2026-10-15T00:00:00Z',
          completed_at: '2026-10-15T00:00:01Z',
          timing: null,
          finish_reasons: null,
          failure: null,
          output_guardrail_outcome: null,
        },
      });
    },
  });
  const key = await client.getKey();
  assert.equal(key.data.label, 'Production key');
  assert.equal(calls[0].url, 'https://niu.example/v1/key');
  assert.equal(calls[0].headers.get('x-niu-key-id'), generationId);

  const gen = await client.getGeneration(generationId);
  assert.equal(gen.data.model, 'openai/gpt-5');
  assert.equal(gen.data.usage.completion_tokens, '20');
  assert.equal(gen.data.customer_charge.amount_nanos, '1000');
  assert.equal(calls[1].url, `https://niu.example/v1/generations/${generationId}`);
  assert.throws(() => client.getGeneration('../invalid'), TypeError);
});

test('encodes model parameter in generateContent and rejects empty, untrimmed, or traversal models', async () => {
  const urls = [];
  const client = new NiuClient({
    apiKey: 'test-token',
    baseURL: 'https://niu.example/v1',
    fetch: async (url) => {
      urls.push(String(url));
      return Response.json({ candidates: [] });
    },
  });
  await client.generateContent('google/gemini-2.5-pro', {
    contents: [{ parts: [{ text: 'hello' }] }],
  });
  assert.equal(urls[0], 'https://niu.example/v1beta/models/google%2Fgemini-2.5-pro:generateContent');
  assert.throws(() => client.generateContent('  ', { contents: [] }), TypeError);
  assert.throws(() => client.generateContent(' model ', { contents: [] }), TypeError);
  assert.throws(() => client.generateContent('../escape', { contents: [] }), TypeError);
});


