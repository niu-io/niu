import { NiuAPIError, type RequestOptions } from './index.js';

export type TenantScope = { organizationId: string; projectId: string };
export type SupplierAccountInput = {
  provider: string; plan: string;
  authentication_mode: 'api_key' | 'oauth_refresh';
  billing_mode: 'metered_api' | 'subscription';
  credential_reference: string;
  concurrency_limit: number;
};
export type SupplierAccount = Omit<SupplierAccountInput, 'credential_reference'> & {
  id: string; credential_revision: number; health: string; refreshing: boolean;
};
export type QuotaObservation = {
  window_key: string;
  unit: 'tokens' | 'requests' | 'millionths_of_window';
  remaining: string | null;
  maximum: string | null;
  observed_at_ms: number;
  valid_until_ms: number;
  resets_at_ms: number;
  source: string;
};
export type QuotaWindow = QuotaObservation & { fresh: boolean };
export type NiuAdminOptions = {
  adminToken: string;
  /** Administration API base; defaults to http://localhost:2555/admin/v1. */
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
};

/** Server-side bootstrap administration. Never expose the admin token to clients.
 * No implicit retries: a collector explicitly resubmits identical observations.
 */
export class NiuAdminClient {
  private readonly token: string;
  private readonly base: string;
  private readonly requestFetch: typeof globalThis.fetch;

  constructor(options: NiuAdminOptions) {
    if (!options.adminToken.trim()) throw new Error('adminToken is required');
    this.token = options.adminToken;
    this.base = (options.baseURL ?? 'http://localhost:2555/admin/v1').replace(/\/+$/, '');
    const url = new URL(this.base);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error('baseURL must be an HTTP(S) API base without credentials, query or fragment');
    }
    this.requestFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  issueCollectorKey(scope: TenantScope, input: { name: string; ttl_seconds: number; purpose?: 'quota' | 'execution' }, options?: RequestOptions): Promise<{ id: string; token: string }> {
    if (!input.name.trim() || !Number.isSafeInteger(input.ttl_seconds) || input.ttl_seconds < 1 || input.ttl_seconds > 31_536_000) {
      throw new Error('Collector key requires a name and a lifetime of 1 to 31536000 seconds');
    }
    return this.request(`/organizations/${uuid(scope.organizationId)}/projects/${uuid(scope.projectId)}/collector-keys`, input, options);
  }

  revokeCollectorKey(scope: TenantScope, keyId: string, options?: RequestOptions): Promise<void> {
    return this.request(`/organizations/${uuid(scope.organizationId)}/projects/${uuid(scope.projectId)}/collector-keys/${uuid(keyId)}`, undefined, options, 'DELETE');
  }

  listAccounts(scope: TenantScope, options?: RequestOptions): Promise<{ data: SupplierAccount[] }> {
    return this.request(this.accountsPath(scope), undefined, options);
  }

  createAccount(scope: TenantScope, account: SupplierAccountInput, options?: RequestOptions): Promise<{ id: string; health: string }> {
    return this.request(this.accountsPath(scope), account, options);
  }

  quota(scope: TenantScope, accountId: string, options?: RequestOptions): Promise<{ data: QuotaWindow[] }> {
    return this.request(`${this.accountsPath(scope)}/${uuid(accountId)}/quota`, undefined, options);
  }

  observeQuota(scope: TenantScope, accountId: string, observation: QuotaObservation, options?: RequestOptions): Promise<{ id: string }> {
    for (const value of [observation.remaining, observation.maximum]) {
      if (value !== null && (typeof value !== 'string' || !/^\d+$/.test(value) || BigInt(value) > 9223372036854775807n)) {
        throw new Error('Quota quantities must be nonnegative signed-64-bit decimal strings or null');
      }
    }
    for (const value of [observation.observed_at_ms, observation.valid_until_ms, observation.resets_at_ms]) {
      if (!Number.isSafeInteger(value) || value < 0) throw new Error('Quota timestamps must be nonnegative safe-integer milliseconds');
    }
    return this.request(`${this.accountsPath(scope)}/${uuid(accountId)}/quota`, observation, options);
  }

  private accountsPath(scope: TenantScope): string {
    return `/organizations/${uuid(scope.organizationId)}/projects/${uuid(scope.projectId)}/accounts`;
  }

  private async request<T>(path: string, body?: unknown, options: RequestOptions = {}, method?: string): Promise<T> {
    const response = await this.requestFetch(`${this.base}${path}`, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: { authorization: `Bearer ${this.token}`, accept: 'application/json', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: options.signal,
      redirect: 'error',
    });
    const text = await response.text();
    let payload: unknown;
    try { payload = text ? JSON.parse(text) : undefined; } catch { payload = text; }
    if (!response.ok) throw new NiuAPIError(response.status, payload, response.headers.get('x-request-id') ?? undefined);
    return payload as T;
  }
}

function uuid(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error('Scope and account IDs must be UUIDs');
  return value;
}

export type NiuCollectorOptions = {
  collectorToken: string;
  scope: TenantScope;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
};

/** Quota writer bound to one project. Server authorization is authoritative. */
export class NiuCollectorClient {
  readonly #client: NiuAdminClient;
  readonly #scope: TenantScope;

  constructor(options: NiuCollectorOptions) {
    if (!options.collectorToken.trim()) throw new Error('collectorToken is required');
    this.#scope = { organizationId: uuid(options.scope.organizationId), projectId: uuid(options.scope.projectId) };
    this.#client = new NiuAdminClient({ adminToken: options.collectorToken, baseURL: options.baseURL, fetch: options.fetch });
  }

  observeQuota(accountId: string, observation: QuotaObservation, options?: RequestOptions): Promise<{ id: string }> {
    return this.#client.observeQuota(this.#scope, accountId, observation, options);
  }
}
