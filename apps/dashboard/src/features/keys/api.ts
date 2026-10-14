import type {
  KeySpendingAccount,
  KeyRequestRateLimit,
  KeyTokenRateLimit,
  KeyConcurrencyLimit,
  KeyTokenUsageWindow,
  KeyIpPolicy,
  WorkspaceKeyCreateInput,
  WorkspaceKeyUpdateInput,
} from '../../../../../sdks/javascript/src/admin';

export type {
  KeySpendingAccount,
  KeyRequestRateLimit,
  KeyTokenRateLimit,
  KeyConcurrencyLimit,
  KeyTokenUsageWindow,
  KeyIpPolicy,
  WorkspaceKeyCreateInput,
  WorkspaceKeyUpdateInput,
};

export type ProjectKey = {
  id: string;
  revision?: number;
  name: string;
  allowed_models: string[];
  expires_at_ms: number | null;
  last_used_at_ms?: number | null;
  revoked: boolean;
  expired: boolean;
  spending_limits?: KeySpendingAccount[];
  request_rate_limit?: KeyRequestRateLimit;
  token_rate_limit?: KeyTokenRateLimit;
  concurrency_limit?: KeyConcurrencyLimit;
  token_usage_window?: KeyTokenUsageWindow;
  ip_policy?: KeyIpPolicy;
  requests_per_minute?: number | null;
  max_concurrent_requests?: number | null;
  tokens_per_minute?: number | null;
  allowed_cidrs?: string[] | null;
};

export type IssuedProjectKey = { id: string; token: string; allowed_models?: string[]; key?: ProjectKey };

export class KeyRequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function workspaceKeyPath(workspaceId: string) {
  return `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/keys`;
}

export function projectKeyPath(organization: string, project: string) {
  return `/admin/v1/organizations/${encodeURIComponent(organization)}/projects/${encodeURIComponent(project)}/keys`;
}

export async function keyRequest<T>(
  token: string,
  path: string,
  method = 'GET',
  body?: unknown,
  signal?: AbortSignal,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const response = await fetch(path, {
    method,
    signal,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(extraHeaders ?? {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new KeyRequestError(payload?.error?.message ?? `Request failed (${response.status}).`, response.status);
  }
  return response.status === 204 ? undefined as T : await response.json() as T;
}

export function workspacePath(pathname: string) {
  return pathname.match(/^\/workspaces\/[^/]+/)?.[0] ?? '/workspaces/default';
}

export function keyStatus(key: ProjectKey) {
  return key.revoked ? 'Revoked' : key.expired ? 'Expired' : 'Active';
}

export function keyLastUsed(key: ProjectKey) {
  if (key.last_used_at_ms === undefined) return 'Unavailable';
  if (key.last_used_at_ms === null) return 'No recorded requests';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(key.last_used_at_ms));
}

