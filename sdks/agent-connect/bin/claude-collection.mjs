import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ClaudeCodeOtelCollector } from '../dist/index.js';

const maximumPayloadBytes = 1_048_576;
const maximumQueuedRecords = 10_000;
const maximumRecordBytes = 65_536;

export class ClaudeCollectionReceiver {
  constructor({ gatewayBaseURL, organizationId, projectId, collectorKey, stateDirectory, fetch: fetcher, onStatus }) {
    this.gatewayBaseURL = validateGatewayBaseURL(gatewayBaseURL);
    this.organizationId = validateUuid(organizationId, 'organization');
    this.projectId = validateUuid(projectId, 'project');
    if (typeof collectorKey !== 'string' || !collectorKey.startsWith('niu_collector_')) {
      throw new Error('A project-scoped execution collector key is required');
    }
    this.collectorKey = collectorKey;
    this.localSecret = randomBytes(32).toString('base64url');
    this.fetcher = fetcher ?? globalThis.fetch.bind(globalThis);
    this.onStatus = onStatus ?? (() => {});
    const scopeDigest = createHash('sha256')
      .update(`${this.gatewayBaseURL}\0${this.organizationId}\0${this.projectId}`)
      .digest('hex').slice(0, 24);
    this.queueDirectory = join(stateDirectory, scopeDigest);
    this.collector = new ClaudeCodeOtelCollector();
    this.server = null;
    this.flushTask = null;
    this.lastFailureNotice = 0;
    this.interval = null;
  }

  async listen(port = 0) {
    if (this.server) throw new Error('The Claude collection receiver is already running');
    await mkdir(this.queueDirectory, { recursive: true, mode: 0o700 });
    const server = createServer((request, response) => {
      void this.#handle(request, response);
    });
    this.server = server;
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Could not read the local collector address');
    this.interval = setInterval(() => { void this.flush(); }, 5_000);
    this.interval.unref();
    void this.flush();
    return {
      url: `http://127.0.0.1:${address.port}/v1/logs`,
      authorization: `Bearer ${this.localSecret}`,
    };
  }

  async #handle(request, response) {
    if (request.method !== 'POST' || request.url !== '/v1/logs') {
      writeJson(response, 404, { error: 'not found' });
      return;
    }
    if (!secretMatches(request.headers.authorization, this.localSecret)) {
      writeJson(response, 401, { error: 'unauthorized' });
      return;
    }
    const contentType = request.headers['content-type']?.split(';', 1)[0].trim().toLowerCase();
    if (contentType !== 'application/json') {
      writeJson(response, 415, { error: 'application/json required' });
      return;
    }
    let payload;
    try {
      payload = JSON.parse(await readBoundedBody(request));
    } catch (error) {
      writeJson(response, error instanceof PayloadTooLargeError ? 413 : 400, { error: 'invalid OTLP JSON payload' });
      return;
    }
    try {
      this.collector.ingest(payload);
      for (const record of this.collector.takeRecords()) await this.#persist(record);
    } catch (error) {
      this.#notice(`Could not queue Claude Code metadata: ${safeMessage(error)}`);
      writeJson(response, 503, { error: 'collector queue unavailable' });
      return;
    }
    writeJson(response, 200, { partialSuccess: {} });
    void this.flush();
  }

  async #persist(record) {
    const body = JSON.stringify(record);
    if (Buffer.byteLength(body) > maximumRecordBytes) throw new Error('normalized record exceeds the queue record limit');
    const digest = createHash('sha256').update(record.record_id).digest('hex');
    const destination = join(this.queueDirectory, `${digest}.json`);
    try {
      const existing = await readFile(destination, 'utf8');
      if (existing !== body) throw new Error('an event ID was reused with different metadata');
      return;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    const files = (await readdir(this.queueDirectory)).filter(name => name.endsWith('.json'));
    if (files.length >= maximumQueuedRecords) throw new Error('local metadata queue is full');
    const temporary = join(this.queueDirectory, `.pending-${process.pid}-${randomBytes(6).toString('hex')}`);
    try {
      await writeFile(temporary, body, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await rename(temporary, destination);
    } finally {
      await unlink(temporary).catch(() => {});
    }
  }

  async flush() {
    if (this.flushTask) return this.flushTask;
    this.flushTask = this.#flushQueue().finally(() => { this.flushTask = null; });
    return this.flushTask;
  }

  async #flushQueue() {
    let sent = 0;
    let files;
    try {
      files = (await readdir(this.queueDirectory)).filter(name => name.endsWith('.json')).sort();
    } catch (error) {
      if (error?.code === 'ENOENT') return 0;
      this.#notice(`Could not read the local collection queue: ${safeMessage(error)}`);
      return 0;
    }
    for (const file of files) {
      const path = join(this.queueDirectory, file);
      try {
        const record = JSON.parse(await readFile(path, 'utf8'));
        const endpoint = this.#executionEndpoint();
        const response = await this.fetcher(endpoint, {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(10_000),
          headers: {
            authorization: `Bearer ${this.collectorKey}`,
            accept: 'application/json',
            'content-type': 'application/json',
          },
          body: JSON.stringify(record),
        });
        if (response.status !== 200 && response.status !== 201) {
          this.#notice(`Niu did not accept collected activity (HTTP ${response.status}); it remains queued.`);
          break;
        }
        await unlink(path);
        sent += 1;
      } catch (error) {
        this.#notice(`Could not deliver collected activity: ${safeMessage(error)}; it remains queued.`);
        break;
      }
    }
    if (sent > 0) this.onStatus({ type: 'sent', count: sent });
    return sent;
  }

  #executionEndpoint() {
    const origin = new URL(this.gatewayBaseURL).origin;
    return `${origin}/admin/v1/organizations/${this.organizationId}/projects/${this.projectId}/executions`;
  }

  #notice(message) {
    const now = Date.now();
    if (now - this.lastFailureNotice < 60_000) return;
    this.lastFailureNotice = now;
    this.onStatus({ type: 'warning', message });
  }

  async close() {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    if (this.server) {
      const server = this.server;
      this.server = null;
      await new Promise(resolve => server.close(() => resolve()));
    }
    await this.flush();
    return this.queueLength();
  }

  async queueLength() {
    try {
      return (await readdir(this.queueDirectory)).filter(name => name.endsWith('.json')).length;
    } catch (error) {
      if (error?.code === 'ENOENT') return 0;
      throw error;
    }
  }
}

function validateGatewayBaseURL(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Gateway URL must be an absolute HTTP(S) URL ending in /v1'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!['https:', ...(local ? ['http:'] : [])].includes(url.protocol)
      || url.username || url.password || url.search || url.hash
      || !url.pathname.replace(/\/+$/, '').endsWith('/v1')) {
    throw new Error('Gateway URL must use HTTPS (or loopback HTTP) and end in /v1 without credentials or query');
  }
  return url.toString().replace(/\/+$/, '');
}

function validateUuid(value, name) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`A valid ${name} ID is required`);
  }
  return value.toLowerCase();
}

function secretMatches(value, secret) {
  if (typeof value !== 'string') return false;
  const supplied = Buffer.from(value);
  const expected = Buffer.from(`Bearer ${secret}`);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

async function readBoundedBody(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > maximumPayloadBytes) throw new PayloadTooLargeError();
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

class PayloadTooLargeError extends Error {}

function writeJson(response, status, body) {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(JSON.stringify(body)),
  });
  response.end(JSON.stringify(body));
}

function safeMessage(error) {
  return error instanceof Error ? error.message.slice(0, 160) : 'unknown error';
}
