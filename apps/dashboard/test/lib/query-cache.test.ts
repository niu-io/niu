import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSessionCache,
  fetchQuery,
  invalidateForMutation,
  invalidateQueries,
  peekQuery,
  primeQuery,
  syncCacheAuthority,
  useCachedQuery,
} from '../../app/lib/query-cache';

describe('query-cache', () => {
  beforeEach(() => {
    clearSessionCache();
    sessionStorage.clear();
  });

  it('deduplicates concurrent in-flight requests and keeps shared fetch alive while at least one consumer remains', async () => {
    let resolvePayload: ((value: { items: string[] }) => void) | undefined;
    const fetcher = vi.fn(
      (signal: AbortSignal) =>
        new Promise<{ items: string[] }>((resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
          resolvePayload = resolve;
        }),
    );

    const first = new AbortController();
    const second = new AbortController();

    const p1 = fetchQuery('tok-a', 'GET:/api/v1/workspaces', fetcher, { signal: first.signal });
    const p2 = fetchQuery('tok-a', 'GET:/api/v1/workspaces', fetcher, { signal: second.signal });

    expect(fetcher).toHaveBeenCalledTimes(1);

    // Aborting first consumer rejects p1 without aborting shared network fetch for p2.
    first.abort();
    await expect(p1).rejects.toMatchObject({ name: 'AbortError' });

    resolvePayload?.({ items: ['alpha'] });
    await expect(p2).resolves.toEqual({ items: ['alpha'] });
    expect(peekQuery('tok-a', 'GET:/api/v1/workspaces')).toEqual({ items: ['alpha'] });
  });

  it('retains previous data across same-scope key changes and never leaks across different session scopes', async () => {
    primeQuery('tok-a', 'GET:/api/v1/activity?window=7d', { total: 42 });

    let resolveNext: ((value: { total: number }) => void) | undefined;
    const fetcher = vi.fn(
      () =>
        new Promise<{ total: number }>(resolve => {
          resolveNext = resolve;
        }),
    );

    const { result, rerender } = renderHook(
      ({ scope, key }) => useCachedQuery(scope, key, fetcher, { keepPreviousData: true }),
      { initialProps: { scope: 'tok-a', key: 'GET:/api/v1/activity?window=7d' } },
    );

    // Frame 0 synchronous hit without loading flash!
    expect(result.current.data).toEqual({ total: 42 });
    expect(result.current.loading).toBe(false);

    // Switching filter key within same scope keeps previous data visible while refreshing.
    rerender({ scope: 'tok-a', key: 'GET:/api/v1/activity?window=30d' });
    expect(result.current.data).toEqual({ total: 42 });
    expect(result.current.loading).toBe(false);

    act(() => {
      resolveNext?.({ total: 108 });
    });
    await waitFor(() => expect(result.current.data).toEqual({ total: 108 }));

    // Switching session scope MUST NOT leak tok-a's cached data into tok-b!
    rerender({ scope: 'tok-b', key: 'GET:/api/v1/activity?window=30d' });
    expect(result.current.data).toBeUndefined();
    expect(result.current.loading).toBe(true);
  });

  it('revalidates mounted subscribers automatically when invalidateForMutation fires and clears on sign-out', async () => {
    let calls = 0;
    const fetcher = vi.fn(async () => ({ count: ++calls }));

    const { result } = renderHook(() =>
      useCachedQuery('tok-a', 'GET:/api/v1/workspaces/ws-1/keys', fetcher),
    );

    await waitFor(() => expect(result.current.data).toEqual({ count: 1 }));

    act(() => {
      invalidateForMutation('tok-a', '/api/v1/workspaces/ws-1/keys', 'POST');
    });

    await waitFor(() => expect(result.current.data).toEqual({ count: 2 }));

    clearSessionCache('tok-a');
    expect(peekQuery('tok-a', 'GET:/api/v1/workspaces/ws-1/keys')).toBeUndefined();
  });

  it('starts a fresh request when a previous consumer aborts synchronously before StrictMode remount', async () => {
    let calls = 0;
    const fetcher = vi.fn(
      (signal: AbortSignal) =>
        new Promise<{ call: number }>((resolve, reject) => {
          const call = ++calls;
          if (signal.aborted) {
            reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
            return;
          }
          signal.addEventListener(
            'abort',
            () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
          setTimeout(() => resolve({ call }), 10);
        }),
    );

    const first = new AbortController();
    const p1 = fetchQuery('tok-a', 'GET:/api/v1/commercial-position', fetcher, { signal: first.signal });
    // Synchronously abort consumer #1 and immediately launch consumer #2 on the same tick (StrictMode double-effect)
    first.abort();
    const second = new AbortController();
    const p2 = fetchQuery('tok-a', 'GET:/api/v1/commercial-position', fetcher, { signal: second.signal });

    await expect(p1).rejects.toThrow();
    await expect(p2).resolves.toEqual({ call: 2 });
    expect(calls).toBe(2);
  });

  it('prevents an older superseded read from overwriting a newer force:true response in reverse completion order', async () => {
    let resolveOld!: (value: { version: string }) => void;
    let resolveNew!: (value: { version: string }) => void;

    const oldRead = fetchQuery(
      'review',
      '/api/v1/providers',
      () =>
        new Promise<{ version: string }>(resolve => {
          resolveOld = resolve;
        }),
    );
    const freshRead = fetchQuery(
      'review',
      '/api/v1/providers',
      () =>
        new Promise<{ version: string }>(resolve => {
          resolveNew = resolve;
        }),
      { force: true },
    );

    resolveNew({ version: 'new-after-save' });
    await expect(freshRead).resolves.toEqual({ version: 'new-after-save' });

    resolveOld({ version: 'old-before-save' });
    await expect(oldRead).resolves.toEqual({ version: 'new-after-save' });

    expect(peekQuery('review', '/api/v1/providers')).toEqual({ version: 'new-after-save' });
  });

  it('prevents an invalidated in-flight initial read from populating cache and triggers a fresh read for mounted subscribers', async () => {
    let finishStale!: (value: { revoked: boolean }) => void;
    const pending = fetchQuery(
      'review',
      '/api/v1/keys',
      () =>
        new Promise<{ revoked: boolean }>(resolve => {
          finishStale = resolve;
        }),
    );

    invalidateQueries('/api/v1/keys');
    finishStale({ revoked: false });
    await pending;

    expect(peekQuery('review', '/api/v1/keys')).toBeUndefined();

    let freshCalls = 0;
    const verified = await fetchQuery('review', '/api/v1/keys', async () => {
      freshCalls += 1;
      return { revoked: true };
    });
    expect(verified).toEqual({ revoked: true });
    expect(freshCalls).toBe(1);

    // Also verify mounted useCachedQuery invalidated BEFORE its first response resolves:
    clearSessionCache();
    const resolvers: Array<(value: { revoked: boolean }) => void> = [];
    const hookFetcher = vi.fn(
      () =>
        new Promise<{ revoked: boolean }>(resolve => {
          resolvers.push(resolve);
        }),
    );

    const { result } = renderHook(() => useCachedQuery('tok-a', '/api/v1/keys', hookFetcher));
    expect(hookFetcher).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(true);

    // Mutation invalidates while request #1 is still pending -> triggers request #2 immediately!
    act(() => {
      invalidateForMutation('tok-a', '/api/v1/keys', 'DELETE');
    });
    await waitFor(() => expect(hookFetcher).toHaveBeenCalledTimes(2));

    // Request #2 (post-mutation) finishes first, then obsolete Request #1 finishes late:
    act(() => {
      resolvers[1]?.({ revoked: true });
    });
    await waitFor(() => expect(result.current.data).toEqual({ revoked: true }));

    act(() => {
      resolvers[0]?.({ revoked: false });
    });
    expect(result.current.data).toEqual({ revoked: true });
    expect(peekQuery('tok-a', '/api/v1/keys')).toEqual({ revoked: true });
  });

  it('prevents a pending read from overwriting an optimistic update applied via mutate / primeQuery', async () => {
    let resolvePendingRead!: (value: { name: string }) => void;
    const fetcher = vi.fn(
      () =>
        new Promise<{ name: string }>(resolve => {
          resolvePendingRead = resolve;
        }),
    );

    const { result } = renderHook(() => useCachedQuery('tok-a', '/api/v1/workspaces/ws-1', fetcher));
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Apply optimistic update while initial read is still in flight
    act(() => {
      result.current.mutate({ name: 'Optimistic Renamed Workspace' });
    });
    expect(result.current.data).toEqual({ name: 'Optimistic Renamed Workspace' });
    expect(result.current.loading).toBe(false);

    // Late completion of pre-mutation read must NOT clobber optimistic state or cache
    act(() => {
      resolvePendingRead({ name: 'Stale Old Workspace' });
    });
    await Promise.resolve();

    expect(result.current.data).toEqual({ name: 'Optimistic Renamed Workspace' });
    expect(peekQuery('tok-a', '/api/v1/workspaces/ws-1')).toEqual({ name: 'Optimistic Renamed Workspace' });
  });

  it('binds persisted sessionStorage snapshots to verified authority and purges them on authority change', () => {
    syncCacheAuthority('operator::alice::org-alice::niu-browser-member-session::owner::::1110::');
    primeQuery('niu-browser-member-session', '/api/v1/workspaces', { data: ['Private alice'] }, { persist: true });

    // Simulate page reload under the same Alice authority (clear memory without wiping sessionStorage)
    const savedEntries: Array<[string, string]> = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const k = sessionStorage.key(i)!;
      savedEntries.push([k, sessionStorage.getItem(k)!]);
    }
    clearSessionCache();
    for (const [k, v] of savedEntries) sessionStorage.setItem(k, v);

    // Before authority is verified, persisted snapshot MUST NOT be readable!
    expect(peekQuery('niu-browser-member-session', '/api/v1/workspaces', { persist: true })).toBeUndefined();

    // Same Alice authority re-verified -> hydrates persisted snapshot cleanly
    syncCacheAuthority('operator::alice::org-alice::niu-browser-member-session::owner::::1110::');
    expect(peekQuery('niu-browser-member-session', '/api/v1/workspaces', { persist: true })).toEqual({
      data: ['Private alice'],
    });

    // Authority switches to Bob sharing the exact same cookie scope -> purges memory AND sessionStorage immediately!
    syncCacheAuthority('operator::bob::org-bob::niu-browser-member-session::viewer::ws-bob::1000::');
    expect(peekQuery('niu-browser-member-session', '/api/v1/workspaces', { persist: true })).toBeUndefined();
  });
});
