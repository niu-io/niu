import { readLocale as readUILocale, translateUI } from '@/shell/ui-locale';
import type {
  KeySpendingAccount,
  KeyRequestRateLimit,
  KeyTokenRateLimit,
  KeyConcurrencyLimit,
  KeyTokenUsageWindow,
  KeyIpPolicy,
  WorkspaceKeyCreateInput,
  WorkspaceKeyUpdateInput,
} from '@niu-io/sdk/admin';

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

export type KeyUnitSpendingAccount = {
  unit: {
    definition_revision: string;
    name: string;
    display_precision: number;
    atoms_per_unit: string;
  } | null;
  limit_atoms: string | null;
  revision: string | null;
  definition_revision: string | null;
  committed_atoms: string;
  remaining_atoms: string | null;
  monetary_limit_preserved?: boolean;
  credits_admission_blocked_by_monetary_limit?: boolean;
};

export type ProjectKey = {
  id: string;
  slug?: string;
  revision?: number;
  name: string;
  token?: string | null;
  token_preview?: string | null;
  allowed_models: string[];
  invocation_allowed?: boolean;
  invocation_protocols?: string[];
  expires_at_ms: number | null;
  last_used_at_ms?: number | null;
  revoked: boolean;
  expired: boolean;
  spending_limits?: KeySpendingAccount[];
  unit_spending_limit?: KeyUnitSpendingAccount | null;
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
  constructor(message: string, public status: number, public errorType?: string, public code?: string) { super(message); }
}

export function workspaceKeyPath(workspaceId: string) {
  return `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/keys`;
}

export type KeyStatusFilter = "all" | "active" | "inactive";

export function workspaceKeyPagePath(workspaceId: string, limit = 50, after?: string, status: KeyStatusFilter = "active") {
  return `${workspaceKeyPath(workspaceId)}?limit=${limit}${status === "all" ? "" : `&status=${status}`}${after ? `&after=${encodeURIComponent(after)}` : ''}`;
}

export function projectKeyPath(organization: string, project: string) {
  return `/api/v1/organizations/${encodeURIComponent(organization)}/projects/${encodeURIComponent(project)}/keys`;
}

import { fetchQuery, invalidateForMutation, peekQuery, type FetchQueryOptions } from '@/lib/query-cache';

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
    const payload = await response.json().catch(() => null) as { error?: { message?: string; type?: string; code?: string } } | null;
    throw new KeyRequestError(payload?.error?.message ?? `Request failed (${response.status}).`, response.status, payload?.error?.type, payload?.error?.code);
  }
  const upper = method.toUpperCase();
  if (upper !== 'GET' && upper !== 'HEAD') {
    invalidateForMutation(token, path, upper);
  }
  return response.status === 204 ? undefined as T : await response.json() as T;
}

export function cachedKeyGet<T>(
  token: string,
  path: string,
  options?: FetchQueryOptions,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const headerSuffix = extraHeaders ? `?__hdr=${JSON.stringify(extraHeaders)}` : '';
  return fetchQuery<T>(
    token || 'public',
    `${path}${headerSuffix}`,
    signal => keyRequest<T>(token, path, 'GET', undefined, signal, extraHeaders),
    { awaitRevalidate: true, ...options },
  );
}

export function peekCachedKeyGet<T>(
  token: string,
  path: string,
  extraHeaders?: Record<string, string>,
): T | undefined {
  const headerSuffix = extraHeaders ? `?__hdr=${JSON.stringify(extraHeaders)}` : '';
  return peekQuery<T>(token || 'public', `${path}${headerSuffix}`);
}

export function workspacePath(pathname: string) {
  return pathname.match(/^\/workspaces\/[^/]+/)?.[0] ?? '/workspaces/default';
}

export function keyStatus(key: ProjectKey) {
  return key.revoked ? 'Revoked' : key.expired ? 'Expired' : 'Active';
}

export function formatMaskedKey(secret?: string | null, preview?: string | null) {
  if (secret && secret.length >= 12) return `${secret.slice(0, 8)}••••••••${secret.slice(-4)}`;
  if (preview) return preview;
  return 'niu_••••••••••••';
}

export function keyLastUsed(key: ProjectKey) {
  if (key.last_used_at_ms === undefined) return translateUI('Unavailable');
  if (key.last_used_at_ms === null) return translateUI('No recorded requests');
  return new Intl.DateTimeFormat(readUILocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(key.last_used_at_ms));
}

