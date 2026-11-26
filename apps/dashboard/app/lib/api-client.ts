import { authenticatedFetch as fetch } from '@/lib/authenticated-fetch';
import { readLocale } from '@/shell/locale';
import { fetchQuery, invalidateForMutation, invalidateQueries, peekQuery, prefetchQuery, type FetchQueryOptions } from './query-cache';
import { sanitizeUserFacingErrorText } from './user-facing-error';

export class ApiRequestError extends Error {
  constructor(message: string, readonly status: number, readonly errorType?: string) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export async function request<T>(
  token: string,
  path: string,
  method = 'GET',
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    method,
    signal,
    cache: 'no-store',
    headers: {
      authorization: 'Bearer ' + token,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const errorType = typeof payload?.error?.type === 'string'
      ? payload.error.type
      : response.headers.get('x-niu-error-code') ?? undefined;
    const rawMessage = typeof payload?.error?.message === 'string'
      ? payload.error.message
      : `Request failed (${response.status})`;
    const safeMessage = sanitizeUserFacingErrorText(rawMessage, readLocale(), {
      errorType,
      status: response.status,
    });
    throw new ApiRequestError(safeMessage, response.status, errorType);
  }
  const upper = method.toUpperCase();
  if (upper !== 'GET' && upper !== 'HEAD') {
    invalidateForMutation(token, path, upper);
  }
  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

export function cachedGet<T>(
  token: string,
  path: string,
  options?: FetchQueryOptions,
): Promise<T> {
  return fetchQuery<T>(
    token || 'public',
    path,
    signal => request<T>(token, path, 'GET', undefined, signal),
    { awaitRevalidate: true, ...options },
  );
}

export function markCachedStale(token: string, path: string): void {
  invalidateQueries(key => key.startsWith(`${token || 'public'}::${path}`));
}

export function peekCachedGet<T>(
  token: string,
  path: string,
  options?: { persist?: boolean; maxAgeMs?: number },
): T | undefined {
  return peekQuery<T>(token || 'public', path, options);
}

export function prefetchGet<T>(
  token: string,
  path: string,
  options?: { freshMs?: number; persist?: boolean },
): void {
  prefetchQuery<T>(
    token || 'public',
    path,
    signal => request<T>(token, path, 'GET', undefined, signal),
    options,
  );
}
