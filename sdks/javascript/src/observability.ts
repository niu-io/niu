/** Personal metadata-only trace ingestion, independent of workspace API credentials. */
import type { ExecutionRecordV1 } from './execution.js';
export type PersonalAgentTrace = { name: string; record: ExecutionRecordV1; session_key?: string; span_names?: Record<string, string> };
export type NiuAgentObservabilityOptions = {
  /** Dedicated personal ingestion key. Cannot read traces or invoke inference. */
  token: string;
  /** Same-domain endpoint, e.g. https://niu.io/admin/v1/agent-observability. */
  baseURL: string;
  fetch?: typeof globalThis.fetch;
};
export class NiuAgentObservabilityClient {
  private readonly token: string;
  private readonly url: string;
  private readonly fetcher: typeof globalThis.fetch;
  constructor(options: NiuAgentObservabilityOptions) {
    if (!options.token?.trim()) throw new Error('A personal ingestion key is required');
    const url = new URL(options.baseURL);
    if (url.username || url.password || url.search || url.hash || !['https:', 'http:'].includes(url.protocol)) throw new Error('Invalid observability endpoint');
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Use HTTPS outside loopback development');
    this.url = url.toString().replace(/\/+$/, '') + '/traces';
    this.token = options.token;
    this.fetcher = options.fetch ?? globalThis.fetch;
  }
  /** Explicit submission; no automatic content interception, inference, or retry. */
  async submit(trace: PersonalAgentTrace, options: { signal?: AbortSignal } = {}): Promise<{ id: string; created: boolean }> {
    if (trace.record.spans.some(span => span.charge_ref !== null)) throw new Error('Personal traces must not contain ledger references');
    const response = await this.fetcher(this.url, {
      method: 'POST', redirect: 'error', signal: options.signal,
      headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(trace),
    });
    if (!response.ok) throw new Error(`Personal trace submission failed (${response.status})`);
    const result = await response.json() as { id: string; created: boolean };
    if (typeof result.id !== 'string' || typeof result.created !== 'boolean') throw new Error('Invalid trace receipt');
    return result;
  }
}
