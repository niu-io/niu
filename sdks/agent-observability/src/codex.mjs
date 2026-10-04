import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { timingSafeEqual } from 'node:crypto';
import { deliver } from './telemetry.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const events = new Map([
  ['codex.api_request', ['Codex API request', 'model_invocation']],
  ['codex.sse_event', ['Codex response completion', 'model_invocation']],
  ['codex.websocket_event', ['Codex response completion', 'model_invocation']],
  ['codex.tool_result', ['Codex tool', 'tool_invocation']],
]);
function scalar(value) {
  if (!value || typeof value !== 'object') return undefined;
  for (const key of ['stringValue', 'boolValue', 'intValue', 'doubleValue']) if (Object.hasOwn(value, key)) return value[key];
}
function attributes(items) {
  const result = Object.create(null);
  for (const item of items ?? []) if (typeof item.key === 'string') result[item.key] = scalar(item.value);
  return result;
}
function count(value) {
  const text = String(value ?? '');
  return /^\d{1,19}$/.test(text) && BigInt(text) <= 9223372036854775807n ? text : null;
}
function timestamp(value) {
  if (!/^\d{1,20}$/.test(String(value ?? ''))) return null;
  const ms = Number(BigInt(value) / 1_000_000n);
  return Number.isSafeInteger(ms) && ms >= 0 ? ms : null;
}
function model(value) {
  return typeof value === 'string' && /^[A-Za-z0-9._:/-]{1,120}$/.test(value) && !/[a-f0-9]{8}-[a-f0-9]{4}-/i.test(value) ? value : null;
}
/** OTLP JSON input is discarded after extraction. Never serialize raw resource, body or attributes. */
export function codexRecords(config, input) {
  const output = [];
  for (const resource of input.resourceLogs ?? []) {
    for (const scope of resource.scopeLogs ?? []) {
      for (const log of scope.logRecords ?? []) {
        const fields = attributes(log.attributes);
        const event = fields['event.name'] ?? scalar(log.body);
        const definition = events.get(event);
        if (!definition) continue;
        const completion = event === 'codex.sse_event' || event === 'codex.websocket_event';
        if (completion && fields['event.kind'] !== 'response.completed' && fields.kind !== 'response.completed') continue;
        // Codex 0.154 emits both a timing event and a distinct usage event for completion.
        if (completion && fields.input_token_count === undefined && fields.output_token_count === undefined) continue;
        const end = timestamp(log.timeUnixNano);
        if (end === null) continue; // Receipt time cannot replace source time for duplicate delivery.
        const duration = Number(fields.duration_ms);
        const start = !completion && Number.isFinite(duration) && duration >= 0 && duration <= end ? Math.trunc(end - duration) : null;
        const status = (completion && fields.success !== false && fields.success !== 'false') || fields.success === true || fields.success === 'true' ? 'completed' : fields.success === false || fields.success === 'false' ? 'failed' : 'unknown';
        const correlation = [fields['conversation.id'], fields.conversation_id, fields['response.id'], fields.response_id, log.traceId, log.spanId].map(value => typeof value === 'string' ? value : null);
        // Identity includes only permitted metadata; secret/output changes cannot create extra observations.
        const usage = completion ? {
          authority: 'agent_reported_estimate', agent_version: typeof fields['app.version'] === 'string' && /^[0-9A-Za-z.+-]{1,64}$/.test(fields['app.version']) ? fields['app.version'] : null, request_count: 1, retry_count: 0,
          input_tokens: count(fields.input_token_count ?? fields.input_tokens),
          output_tokens: count(fields.output_token_count ?? fields.output_tokens),
          cache_read_tokens: count(fields.cached_token_count ?? fields.cached_input_token_count ?? fields.cached_input_tokens),
          cache_creation_tokens: count(fields.cache_write_token_count), cost_nanos: null, currency: null,
        } : undefined;
        const identity = digest(JSON.stringify([event, log.timeUnixNano, correlation, status, start, model(fields.model), usage]));
        const root = `task-${identity}`, child = `event-${identity}`;
        const base = { started_at_ms: start, ended_at_ms: end, charge_ref: null, requested_model: null, reported_model: null };
        output.push({ name: definition[0], span_names: { [root]: definition[0], [child]: definition[0] }, record: {
          schema_version: 1, source: config.source, record_id: identity, task_id: root, coverage: 'partial',
          spans: [{ ...base, id: root, kind: 'task', status: 'unknown' },
            { ...base, id: child, kind: definition[1], status, requested_model: definition[1] === 'model_invocation' ? model(fields.model) : null }],
          links: [{ from: root, to: child, kind: 'contains' }], outcomes: [], ...(usage ? { external_usage: usage } : {}),
        } });
      }
    }
  }
  if (output.length > 1000) throw new Error('Too many telemetry events.');
  return output;
}

/** Loopback-only authenticated receiver; raw events never enter disk, logs or Niu. */
export async function startCodexReceiver(config, { port = 0, deliverRecord = deliver, secret = randomBytes(32).toString('hex'), onShutdown } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid receiver port.');
  if (!/^[a-f0-9]{64}$/.test(secret)) throw new Error('Invalid receiver credential.');
  let pending = Promise.resolve();
  let active = 0;
  const server = createServer(async (request, response) => {
    const reply = (status, body = {}) => { response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); response.end(JSON.stringify(body)); };
    const auth = request.headers.authorization ?? '';
    const expected = `Bearer ${secret}`;
    if (typeof auth !== 'string' || Buffer.byteLength(auth) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(auth), Buffer.from(expected))) return reply(401);
    if (request.method === 'GET' && request.url === '/health') return reply(200, { collector: 'niu-collector' });
    if (onShutdown && request.method === 'POST' && request.url === '/shutdown') { reply(200); setImmediate(() => { void onShutdown(); }); return; }
    if (request.method !== 'POST' || request.url !== '/v1/logs') return reply(404);
    if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] ?? '') || request.headers['content-encoding']) return reply(415);
    if (active >= 4) return reply(429);
    active++;
    try {
      let size = 0; const chunks = [];
      for await (const chunk of request) { size += chunk.length; if (size > 1_048_576) { reply(413); request.destroy(); return; } chunks.push(chunk); }
      const values = codexRecords(config, JSON.parse(Buffer.concat(chunks).toString('utf8')));
      // Serialize batches and apply backpressure. A successful reply means delivery or durable filtered queue.
      const operation = pending.then(async () => { for (const value of values) await deliverRecord(config, value); });
      pending = operation.catch(() => {});
      await operation; reply(200);
    } catch { reply(503); } finally { active--; }
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  const endpoint = `http://127.0.0.1:${server.address().port}/v1/logs`;
  return { endpoint, secret,
    settings: `[otel]\nlog_user_prompt = false\nexporter = { otlp-http = { endpoint = "${endpoint}", protocol = "json", headers = { Authorization = "Bearer ${secret}" } } }\n`,
    close: async () => { await new Promise(resolve => server.close(resolve)); await pending; },
  };
}
