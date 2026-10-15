import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  dispatch,
  HOSTED_BASE_URL,
  promptDefinitions,
  resourceDefinitions,
  resourceTemplates,
  resolveConfig,
  toolDefinitions,
} from '../dist/index.js';

const SAMPLE_UUID = '11111111-2222-4333-8444-555555555555';
const SAMPLE_UUID_2 = '22222222-3333-4444-8555-666666666666';
const SAMPLE_UUID_3 = '33333333-4444-4555-8666-777777777777';

test('custom configuration requires a workspace key and a /v1 base URL and validates optional env headers', () => {
  assert.throws(() => resolveConfig({}, []), /NIU_API_KEY/);
  assert.throws(() => resolveConfig({ NIU_API_KEY: 'secret' }, []), /NIU_BASE_URL/);
  assert.throws(
    () => resolveConfig({ NIU_API_KEY: 'secret', NIU_BASE_URL: 'https://user:pw@niu.io/v1' }, []),
    /credentials/,
  );
  assert.throws(
    () => resolveConfig({ NIU_API_KEY: 'secret', NIU_BASE_URL: 'https://niu.io/v1', NIU_KEY_ID: 'not-a-uuid' }, []),
    /NIU_KEY_ID/,
  );
  assert.throws(
    () => resolveConfig({ NIU_API_KEY: 'secret', NIU_BASE_URL: 'https://niu.io/v1', NIU_CREDENTIAL_HEADER: 'cookie' }, []),
    /NIU_CREDENTIAL_HEADER/,
  );
  assert.throws(
    () => resolveConfig({ NIU_API_KEY: 'secret', NIU_BASE_URL: 'https://niu.io/v1', NIU_LOG_PAYLOADS: 'maybe' }, []),
    /NIU_LOG_PAYLOADS/,
  );
  const custom = resolveConfig(
    {
      NIU_API_KEY: 'secret',
      NIU_BASE_URL: 'http://127.0.0.1:2555/v1/',
      NIU_KEY_ID: SAMPLE_UUID,
      NIU_CREDENTIAL_HEADER: 'x-niu-api-key',
      NIU_LOG_PAYLOADS: 'false',
      NIU_TASK_ID: 'agent-session-42',
    },
    [],
  );
  assert.equal(custom.baseURL, 'http://127.0.0.1:2555/v1');
  assert.equal(custom.keyId, SAMPLE_UUID);
  assert.equal(custom.credentialHeader, 'x-niu-api-key');
  assert.equal(custom.logPayloads, false);
  assert.equal(custom.taskId, 'agent-session-42');
});

test('the niu.io deployment file pins the hosted origin', () => {
  const pin = JSON.parse(readFileSync(new URL('../hosted/niu.io.json', import.meta.url), 'utf8'));
  assert.equal(pin.deployment, 'niu.io');
  assert.equal(pin.baseURL, HOSTED_BASE_URL);
});

test('hosted configuration pins https://niu.io/v1 and rejects another origin', () => {
  const hosted = resolveConfig({ NIU_API_KEY: 'secret' }, ['--hosted']);
  assert.equal(hosted.baseURL, 'https://niu.io/v1');
  assert.equal(hosted.deployment, 'hosted');
  assert.throws(
    () => resolveConfig({ NIU_API_KEY: 'secret', NIU_BASE_URL: 'http://127.0.0.1:2555/v1' }, ['--hosted']),
    /https:\/\/niu\.io\/v1/,
  );
});

test('tools list models and send the requested model without choosing another', async () => {
  const calls = [];
  const client = {
    baseURL: 'https://niu.io/v1',
    apiKey: 'workspace-key',
    fetch: async (url, init) => {
      calls.push({ url, authorization: init.headers.authorization, headers: init.headers, body: init.body });
      if (url.endsWith('/v1/models')) {
        return json({
          object: 'list',
          data: [
            { id: 'fast', customer_pricing: { currency: 'USD', prompt_rate: '1' } },
            { id: 'unpriced-dev', customer_pricing: null },
          ],
        });
      }
      return json(
        {
          id: 'attempt',
          model: JSON.parse(init.body).model,
          choices: [{ message: { role: 'assistant', content: 'Hello' }, finish_reason: 'stop' }],
          usage: null,
        },
        { 'x-niu-attempt-id': SAMPLE_UUID },
      );
    },
  };
  const models = await dispatch(client, rpc('tools/call', { name: 'list_models', arguments: {} }));
  assert.equal(JSON.parse(models).result.isError, undefined);
  assert.match(JSON.parse(models).result.content[0].text, /"id":"fast"/);

  const filtered = await dispatch(
    client,
    rpc('tools/call', { name: 'list_models', arguments: { search: 'FAST', priced_only: true } }),
  );
  const filteredData = JSON.parse(JSON.parse(filtered).result.content[0].text);
  assert.equal(filteredData.data.length, 1);
  assert.equal(filteredData.data[0].id, 'fast');

  const missing = await dispatch(
    client,
    rpc('tools/call', { name: 'create_chat_completion', arguments: { messages: [{ role: 'user', content: 'Hi' }] } }),
  );
  assert.equal(JSON.parse(missing).result.isError, true);
  assert.match(JSON.parse(missing).result.content[0].text, /model is required/);

  const chat = await dispatch(
    client,
    rpc('tools/call', {
      name: 'create_chat_completion',
      arguments: {
        model: 'fast',
        messages: [{ role: 'user', content: 'Hi' }],
        temperature: 0.2,
        max_tokens: 128,
        response_format: { type: 'json_object' },
        log_payloads: false,
        task_id: 'review-1',
      },
    }),
  );
  const body = JSON.parse(JSON.parse(chat).result.content[0].text);
  assert.equal(body.model, 'fast');
  assert.equal(body.choices[0].message.content, 'Hello');
  assert.equal(body.usage, null);
  assert.equal(body.attempt_id, SAMPLE_UUID);
  assert.equal(calls[0].authorization, 'Bearer workspace-key');
  const sentChat = JSON.parse(calls[2].body);
  assert.equal(sentChat.model, 'fast');
  assert.equal(sentChat.temperature, 0.2);
  assert.equal(sentChat.max_tokens, 128);
  assert.deepEqual(sentChat.response_format, { type: 'json_object' });
  assert.equal(calls[2].headers['x-niu-log-payloads'], 'false');
  assert.equal(calls[2].headers['x-niu-task-id'], 'review-1');
});

test('inspect_key, list_catalog_models, get_generation, compare_models, and multi-protocol inference tools work end-to-end', async () => {
  const seen = [];
  const client = {
    baseURL: 'https://niu.io/v1',
    apiKey: 'workspace-key',
    fetch: async (url, init) => {
      seen.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : undefined });
      if (url === 'https://niu.io/v1/key') {
        return json({
          data: {
            label: 'ci-agent',
            allowed_models: ['fast', 'reasoner'],
            spending_limits: [{ currency: 'USD', remaining_allowance_nanos: '5000000000' }],
          },
        });
      }
      if (url === 'https://niu.io/catalog/v1/models') {
        return json({
          object: 'list',
          data: [
            { id: 'fast', capabilities: { chat_completions: true, responses: true, embeddings: false } },
            { id: 'embed-1', capabilities: { chat_completions: false, responses: false, embeddings: true } },
          ],
        });
      }
      if (url === `https://niu.io/v1/generations/${SAMPLE_UUID}`) {
        return json({
          data: {
            id: SAMPLE_UUID,
            model: 'fast',
            customer_charge: { status: 'charged', currency: 'USD', amount_nanos: '1200' },
          },
        });
      }
      if (url === 'https://niu.io/v1/chat/completions') {
        const req = JSON.parse(init.body);
        if (req.model === 'broken') {
          return {
            ok: false,
            status: 429,
            headers: headerMap({ 'x-niu-error-code': 'key_request_rate_exceeded', 'retry-after': '60' }),
            text: async () => JSON.stringify({ error: { message: 'Rate limit exceeded' } }),
          };
        }
        return json(
          {
            id: `chat-${req.model}`,
            model: req.model,
            choices: [{ index: 0, message: { role: 'assistant', content: `Reply from ${req.model}` }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 4, completion_tokens: 6 },
          },
          { 'x-niu-attempt-id': SAMPLE_UUID },
        );
      }
      if (url === 'https://niu.io/v1/responses') {
        return json(
          {
            id: 'resp_1',
            object: 'response',
            status: 'completed',
            model: 'fast',
            output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Responses output' }] }],
          },
          { 'x-niu-attempt-id': SAMPLE_UUID_2 },
        );
      }
      if (url === 'https://niu.io/v1/messages') {
        return json({
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'claude-sonnet',
          content: [{ type: 'text', text: 'Anthropic output' }],
          stop_reason: 'end_turn',
        });
      }
      if (url === 'https://niu.io/v1beta/models/gemini-2.5-flash:generateContent') {
        return json({
          candidates: [{ index: 0, content: { role: 'model', parts: [{ text: 'Gemini output' }] }, finishReason: 'STOP' }],
          modelVersion: 'gemini-2.5-flash',
        });
      }
      if (url === 'https://niu.io/v1/embeddings') {
        return json({
          object: 'list',
          model: 'embed-1',
          data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }],
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    },
  };

  const keyRes = JSON.parse(await dispatch(client, rpc('tools/call', { name: 'inspect_key', arguments: {} })));
  assert.equal(JSON.parse(keyRes.result.content[0].text).data.label, 'ci-agent');

  const catalogRes = JSON.parse(
    await dispatch(client, rpc('tools/call', { name: 'list_catalog_models', arguments: { capability: 'embeddings' } })),
  );
  const catalogData = JSON.parse(catalogRes.result.content[0].text);
  assert.equal(catalogData.data.length, 1);
  assert.equal(catalogData.data[0].id, 'embed-1');

  const genRes = JSON.parse(
    await dispatch(client, rpc('tools/call', { name: 'get_generation', arguments: { id: SAMPLE_UUID } })),
  );
  assert.equal(JSON.parse(genRes.result.content[0].text).data.customer_charge.amount_nanos, '1200');

  const compareRes = JSON.parse(
    await dispatch(
      client,
      rpc('tools/call', {
        name: 'compare_models',
        arguments: {
          models: ['fast', 'broken'],
          messages: [{ role: 'user', content: 'Review this' }],
        },
      }),
    ),
  );
  const compared = JSON.parse(compareRes.result.content[0].text).results;
  assert.equal(compared.length, 2);
  assert.equal(compared[0].ok, true);
  assert.equal(compared[0].response.choices[0].message.content, 'Reply from fast');
  assert.equal(compared[0].response.attempt_id, SAMPLE_UUID);
  assert.equal(compared[1].ok, false);
  assert.equal(compared[1].gateway_code, 'key_request_rate_exceeded');
  assert.match(compared[1].error, /retry_after=60/);

  const respTool = JSON.parse(
    await dispatch(
      client,
      rpc('tools/call', {
        name: 'create_response',
        arguments: { model: 'fast', input: 'Hello Responses', instructions: 'Be concise' },
      }),
    ),
  );
  const respBody = JSON.parse(respTool.result.content[0].text);
  assert.equal(respBody.output_text, 'Responses output');
  assert.equal(respBody.attempt_id, SAMPLE_UUID_2);

  const msgTool = JSON.parse(
    await dispatch(
      client,
      rpc('tools/call', {
        name: 'create_message',
        arguments: { model: 'claude-sonnet', max_tokens: 256, messages: [{ role: 'user', content: 'Hi' }] },
      }),
    ),
  );
  assert.equal(JSON.parse(msgTool.result.content[0].text).content[0].text, 'Anthropic output');

  const geminiTool = JSON.parse(
    await dispatch(
      client,
      rpc('tools/call', {
        name: 'generate_content',
        arguments: {
          model: 'gemini-2.5-flash',
          contents: [{ role: 'user', parts: [{ text: 'Hello Gemini' }] }],
          generationConfig: { maxOutputTokens: 128 },
        },
      }),
    ),
  );
  assert.equal(JSON.parse(geminiTool.result.content[0].text).modelVersion, 'gemini-2.5-flash');

  const embTool = JSON.parse(
    await dispatch(
      client,
      rpc('tools/call', {
        name: 'create_embeddings',
        arguments: { model: 'embed-1', input: ['hello world'] },
      }),
    ),
  );
  assert.deepEqual(JSON.parse(embTool.result.content[0].text).data[0].embedding, [0.1, 0.2, 0.3]);
});

test('video generation, estimation, waiting, diagnostics, and result downloads work end-to-end', async () => {
  let jobPolls = 0;
  const savedFiles = new Map();
  const client = {
    baseURL: 'https://niu.io/v1',
    apiKey: 'workspace-key',
    sleep: async () => {},
    writeBinaryFile: async (path, bytes) => {
      savedFiles.set(path, bytes);
      return `/abs/${path}`;
    },
    fetch: async (url, init) => {
      if (url === 'https://niu.io/v1/video/models') {
        return json({ object: 'list', data: [{ id: 'seedance-v1', object: 'video.model', mode: 'customer' }] });
      }
      if (url === 'https://niu.io/v1/video/estimate') {
        const body = JSON.parse(init.body);
        assert.equal(body.model, 'seedance-v1');
        assert.equal(body.duration, 5);
        assert.equal(body.resolution, '720p');
        return json({
          object: 'video.estimate',
          model: 'seedance-v1',
          estimate: { meter: 'video_tokens', amount_nanos: '250000000' },
        });
      }
      if (url === 'https://niu.io/v1/video/jobs' && init.method === 'POST') {
        assert.equal(init.headers['idempotency-key'], 'vid-idem-1');
        return json({ id: SAMPLE_UUID, object: 'video.job', model: 'seedance-v1', status: 'queued' });
      }
      if (url === `https://niu.io/v1/video/jobs/${SAMPLE_UUID}` && init.method === 'GET') {
        return json({ id: SAMPLE_UUID, object: 'video.job', model: 'seedance-v1', status: 'queued' });
      }
      if (url === `https://niu.io/v1/video/jobs/${SAMPLE_UUID}/refresh` && init.method === 'POST') {
        jobPolls += 1;
        return json({
          id: SAMPLE_UUID,
          object: 'video.job',
          model: 'seedance-v1',
          status: jobPolls >= 2 ? 'succeeded' : 'running',
        });
      }
      if (url === `https://niu.io/v1/video/jobs/${SAMPLE_UUID}/billing`) {
        return json({ mode: 'customer', state: 'settled', currency: 'USD', charge_nanos: '250000000' });
      }
      if (url === `https://niu.io/v1/video/jobs/${SAMPLE_UUID}/timings`) {
        return json({ data: [{ phase: 'submission', elapsed_ms: 120, outcome: 'received' }], has_more: false });
      }
      if (url === `https://niu.io/v1/video/jobs/${SAMPLE_UUID}/observations`) {
        return json({ data: [{ status: 'succeeded' }], has_more: false });
      }
      if (url === `https://niu.io/v1/video/jobs/${SAMPLE_UUID}/results` && init.method === 'GET') {
        return json({ video: 'available', last_frame: 'available' });
      }
      if (url === `https://niu.io/v1/video/jobs/${SAMPLE_UUID}/results/video` && init.method === 'GET') {
        return {
          ok: true,
          status: 200,
          headers: headerMap({ 'content-type': 'video/mp4' }),
          text: async () => '',
          arrayBuffer: async () => new Uint8Array([0x00, 0x00, 0x00, 0x18]).buffer,
        };
      }
      if (url === `https://niu.io/v1/video/jobs/${SAMPLE_UUID}/results/last_frame` && init.method === 'GET') {
        return {
          ok: true,
          status: 200,
          headers: headerMap({ 'content-type': 'image/png' }),
          text: async () => '',
          arrayBuffer: async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer,
        };
      }
      if (url === `https://niu.io/v1/video/jobs/${SAMPLE_UUID}/results` && init.method === 'DELETE') {
        return json({ deleted: true });
      }
      throw new Error(`Unexpected video URL: ${init.method} ${url}`);
    },
  };

  const estimate = JSON.parse(
    await dispatch(
      client,
      rpc('tools/call', {
        name: 'estimate_video',
        arguments: { model: 'seedance-v1', prompt: 'Ocean waves at dusk', duration_seconds: 5, resolution: '720p' },
      }),
    ),
  );
  assert.equal(JSON.parse(estimate.result.content[0].text).estimate.amount_nanos, '250000000');

  const created = JSON.parse(
    await dispatch(
      client,
      rpc('tools/call', {
        name: 'create_video_job',
        arguments: {
          model: 'seedance-v1',
          prompt: 'Ocean waves at dusk',
          idempotency_key: 'vid-idem-1',
          wait: true,
          interval_ms: 1000,
        },
      }),
    ),
  );
  assert.equal(JSON.parse(created.result.content[0].text).status, 'succeeded');
  assert.equal(jobPolls, 2);

  const bundled = JSON.parse(
    await dispatch(
      client,
      rpc('tools/call', {
        name: 'get_video_job',
        arguments: { id: SAMPLE_UUID, include_billing: true, include_timings: true, include_results: true },
      }),
    ),
  );
  const bundledData = JSON.parse(bundled.result.content[0].text);
  assert.equal(bundledData.billing.charge_nanos, '250000000');
  assert.equal(bundledData.results.video, 'available');

  const videoDownload = JSON.parse(
    await dispatch(
      client,
      rpc('tools/call', {
        name: 'download_video_result',
        arguments: { id: SAMPLE_UUID, kind: 'video', output_path: 'out.mp4' },
      }),
    ),
  );
  const dlSummary = JSON.parse(videoDownload.result.content[0].text);
  assert.equal(dlSummary.saved_to, '/abs/out.mp4');
  assert.equal(dlSummary.bytes, 4);
  assert.equal(savedFiles.get('out.mp4').byteLength, 4);

  const frameDownload = JSON.parse(
    await dispatch(
      client,
      rpc('tools/call', {
        name: 'download_video_result',
        arguments: { id: SAMPLE_UUID, kind: 'last_frame' },
      }),
    ),
  );
  assert.equal(frameDownload.result.content.length, 2);
  assert.equal(frameDownload.result.content[1].type, 'image');
  assert.equal(frameDownload.result.content[1].mimeType, 'image/png');
});

test('media capabilities, asset groups, assets, operations, verification sessions, and image ingestions work', async () => {
  const calls = [];
  const client = {
    baseURL: 'https://niu.io/v1',
    apiKey: 'workspace-key',
    fetch: async (url, init) => {
      calls.push({ url, method: init.method, headers: init.headers });
      return json({ ok: true, url, method: init.method });
    },
  };

  await dispatch(client, rpc('tools/call', { name: 'list_media_capabilities', arguments: { model: 'seedance-v1' } }));
  await dispatch(
    client,
    rpc('tools/call', {
      name: 'media_asset_groups',
      arguments: { action: 'create', model: 'seedance-v1', name: 'Cast', idempotency_key: SAMPLE_UUID },
    }),
  );
  await dispatch(
    client,
    rpc('tools/call', {
      name: 'media_assets',
      arguments: {
        action: 'create',
        model: 'seedance-v1',
        group_id: SAMPLE_UUID,
        url: 'https://example.com/photo.png',
        kind: 'image',
        idempotency_key: SAMPLE_UUID_2,
      },
    }),
  );
  await dispatch(
    client,
    rpc('tools/call', {
      name: 'media_asset_operations',
      arguments: {
        action: 'prepare',
        model: 'seedance-v1',
        idempotency_key: SAMPLE_UUID_3,
        operation: { action: 'create_group', name: 'Prepared' },
      },
    }),
  );
  await dispatch(
    client,
    rpc('tools/call', {
      name: 'media_verification_sessions',
      arguments: { action: 'link', model: 'seedance-v1', id: SAMPLE_UUID },
    }),
  );
  await dispatch(
    client,
    rpc('tools/call', {
      name: 'media_image_ingestions',
      arguments: { action: 'prepare_source', image: 'data:image/png;base64,iVBORw0KGgo=', valid_for_seconds: 300 },
    }),
  );

  assert.equal(calls.length, 6);
  assert.equal(calls[0].url, 'https://niu.io/v1/media/capabilities?model=seedance-v1');
  assert.equal(calls[1].url, 'https://niu.io/v1/media/asset-groups');
  assert.equal(calls[1].headers['idempotency-key'], SAMPLE_UUID);
  assert.equal(calls[2].url, 'https://niu.io/v1/media/assets');
  assert.equal(calls[3].url, 'https://niu.io/v1/media/asset-operations/prepare');
  assert.equal(calls[4].url, `https://niu.io/v1/media/verification-sessions/${SAMPLE_UUID}/link?model=seedance-v1`);
  assert.equal(calls[5].url, 'https://niu.io/v1/media/image-sources');
});

test('resources and prompts are exposed over MCP JSON-RPC', async () => {
  const client = {
    baseURL: 'https://niu.io/v1',
    apiKey: 'workspace-key',
    fetch: async (url) => {
      if (url === 'https://niu.io/v1/key') return json({ data: { label: 'dev-key' } });
      if (url === `https://niu.io/v1/generations/${SAMPLE_UUID}`) return json({ data: { id: SAMPLE_UUID } });
      return json({});
    },
  };

  assert.equal(toolDefinitions.length, 28);
  assert.equal(resourceDefinitions.length, 6);
  assert.equal(resourceTemplates.length, 2);
  assert.equal(promptDefinitions.length, 4);

  const listedResources = JSON.parse(await dispatch(client, rpc('resources/list', {})));
  assert.equal(listedResources.result.resources.length, 6);

  const readKey = JSON.parse(await dispatch(client, rpc('resources/read', { uri: 'niu://key' })));
  assert.equal(JSON.parse(readKey.result.contents[0].text).data.label, 'dev-key');

  const readGen = JSON.parse(
    await dispatch(client, rpc('resources/read', { uri: `niu://generations/${SAMPLE_UUID}` })),
  );
  assert.equal(JSON.parse(readGen.result.contents[0].text).data.id, SAMPLE_UUID);

  const listedPrompts = JSON.parse(await dispatch(client, rpc('prompts/list', {})));
  assert.equal(listedPrompts.result.prompts.length, 4);

  const gotPrompt = JSON.parse(
    await dispatch(
      client,
      rpc('prompts/get', {
        name: 'compare_models',
        arguments: { models: 'fast,reasoner', prompt: 'Check concurrency bug' },
      }),
    ),
  );
  assert.match(gotPrompt.result.messages[0].content.text, /\["fast","reasoner"\]/);
});

test('a gateway error stays a tool error and does not include an unstructured body', async () => {
  const client = {
    baseURL: 'https://niu.io/v1',
    apiKey: 'workspace-key',
    fetch: async () => ({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: { message: 'Invalid API key' }, secret: 'nope' }),
    }),
  };
  const response = JSON.parse(await dispatch(client, rpc('tools/call', { name: 'list_models' })));
  assert.equal(response.result.isError, true);
  assert.equal(response.result.content[0].text, 'Invalid API key');
});

test('stdio serves initialize, resources, and a hosted completion with binary file saving', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'niu-mcp-test-'));
  const targetVideoPath = join(tempDir, 'clip.mp4');
  const gateway = await listen((request, response) => {
    if (request.url === '/v1/chat/completions') {
      response.end(
        JSON.stringify({
          model: 'fast',
          choices: [{ message: { role: 'assistant', content: 'Ready' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
      );
      return;
    }
    if (request.url === `/v1/video/jobs/${SAMPLE_UUID}/results/video`) {
      response.setHeader('content-type', 'video/mp4');
      response.end(Buffer.from([0xde, 0xad, 0xbe, 0xef]));
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  try {
    const child = spawn(process.execPath, [fileURLToPath(new URL('../bin/niu-mcp.mjs', import.meta.url))], {
      env: { ...process.env, NIU_API_KEY: 'secret', NIU_BASE_URL: `${gateway.url}/v1` },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const nextLine = readLines(child.stdout);
    child.stdin.write(`${rpc('initialize', { protocolVersion: '2025-03-26' })}\n`);
    const initialized = JSON.parse(await nextLine());
    assert.equal(initialized.result.serverInfo.name, 'niu');
    assert.equal(initialized.result.protocolVersion, '2025-03-26');
    assert.ok(initialized.result.capabilities.tools);
    assert.ok(initialized.result.capabilities.resources);
    assert.ok(initialized.result.capabilities.prompts);

    child.stdin.write(
      `${rpc('tools/call', {
        name: 'create_chat_completion',
        arguments: { model: 'fast', messages: [{ role: 'user', content: 'Hi' }] },
      })}\n`,
    );
    const completion = JSON.parse(await nextLine());
    assert.equal(JSON.parse(completion.result.content[0].text).choices[0].message.content, 'Ready');

    child.stdin.write(
      `${rpc('tools/call', {
        name: 'download_video_result',
        arguments: { id: SAMPLE_UUID, kind: 'video', output_path: targetVideoPath },
      })}\n`,
    );
    const downloaded = JSON.parse(await nextLine());
    assert.equal(JSON.parse(downloaded.result.content[0].text).bytes, 4);
    assert.deepEqual([...readFileSync(targetVideoPath)], [0xde, 0xad, 0xbe, 0xef]);

    child.stdin.end();
    await new Promise((resolve) => child.once('exit', resolve));
  } finally {
    await gateway.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

function rpc(method, params) {
  return JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
}

function headerMap(entries = {}) {
  const lower = Object.fromEntries(Object.entries(entries).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    get(name) {
      return lower[name.toLowerCase()] ?? null;
    },
  };
}

function json(body, headers = undefined) {
  return {
    ok: true,
    status: 200,
    ...(headers ? { headers: headerMap(headers) } : {}),
    text: async () => JSON.stringify(body),
  };
}

function readLines(stream) {
  let pending = '';
  const buffered = [];
  const waiters = [];
  stream.on('data', (chunk) => {
    pending += chunk.toString();
    let newline = pending.indexOf('\n');
    while (newline !== -1) {
      const line = pending.slice(0, newline);
      pending = pending.slice(newline + 1);
      const waiter = waiters.shift();
      if (waiter) waiter(line);
      else buffered.push(line);
      newline = pending.indexOf('\n');
    }
  });
  return () =>
    new Promise((resolve) => {
      if (buffered.length > 0) resolve(buffered.shift());
      else waiters.push(resolve);
    });
}

function listen(handler) {
  const server = createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}
