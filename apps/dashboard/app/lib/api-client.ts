import { fetchQuery, invalidateForMutation, invalidateQueries, peekQuery, prefetchQuery, type FetchQueryOptions } from './query-cache';

export class ApiRequestError extends Error {
  constructor(message: string, readonly status: number) {
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
    throw new ApiRequestError(payload?.error?.message ?? 'Request failed (' + response.status + ')', response.status);
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
