import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearMediaCache,
  evictMediaBlob,
  fetchMediaBlob,
  peekMediaBlob,
  primeMediaBlob,
  resolveMediaScope,
} from '../../app/lib/media-cache';
import { clearSessionCache, syncCacheAuthority } from '../../app/lib/query-cache';

type StoredRecord = { key: string; authority: string; type: string; size: number; updatedAt: number; bytes: ArrayBuffer };

function createMockIndexedDB(initial = new Map<string, StoredRecord>(), options?: { hangOpen?: boolean }) {
  const storeMap = initial;
  const factory = {
    open(_name: string) {
      const req: Record<string, unknown> = { result: undefined, onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null };
      if (options?.hangOpen) return req;
      queueMicrotask(() => {
        let hasStore = storeMap.size > 0;
        const db = {
          objectStoreNames: { contains: (n: string) => n === 'blobs' && hasStore },
          createObjectStore: () => { hasStore = true; return {}; },
          onversionchange: null,
          onclose: null,
          close: () => {},
          transaction(_name: string, _mode: string) {
            let pending = 0;
            const tx: Record<string, unknown> = { oncomplete: null, onerror: null, onabort: null };
            const scheduleComplete = () => {
              queueMicrotask(() => {
                if (pending === 0 && typeof tx.oncomplete === 'function') (tx.oncomplete as () => void)();
              });
            };
            const finishOp = (cb?: () => void) => {
              pending += 1;
              queueMicrotask(() => {
                cb?.();
                pending -= 1;
                scheduleComplete();
              });
            };
            const objectStore = {
              get(key: string) {
                const r: Record<string, unknown> = { result: undefined, onsuccess: null, onerror: null };
                finishOp(() => { r.result = storeMap.get(key); (r.onsuccess as (() => void) | null)?.(); });
                return r;
              },
              put(val: StoredRecord) {
                const r: Record<string, unknown> = { onsuccess: null, onerror: null };
                finishOp(() => { storeMap.set(val.key, val); (r.onsuccess as (() => void) | null)?.(); });
                return r;
              },
              delete(key: string) {
                const r: Record<string, unknown> = { onsuccess: null, onerror: null };
                finishOp(() => { storeMap.delete(key); (r.onsuccess as (() => void) | null)?.(); });
                return r;
              },
              clear() {
                const r: Record<string, unknown> = { onsuccess: null, onerror: null };
                finishOp(() => { storeMap.clear(); (r.onsuccess as (() => void) | null)?.(); });
                return r;
              },
              openCursor() {
                const entries = [...storeMap.entries()];
                let idx = 0;
                const r: Record<string, unknown> = { result: null, onsuccess: null, onerror: null };
                const step = () => {
                  finishOp(() => {
                    if (idx >= entries.length) { r.result = null; (r.onsuccess as (() => void) | null)?.(); return; }
                    const [k, v] = entries[idx++];
                    r.result = {
                      primaryKey: k,
                      value: v,
                      delete: () => { storeMap.delete(k); },
                      continue: () => { step(); },
                    };
                    (r.onsuccess as (() => void) | null)?.();
                  });
                };
                step();
                return r;
              },
            };
            tx.objectStore = () => objectStore;
            scheduleComplete();
            return tx;
          },
        };
        req.result = db;
        (req.onupgradeneeded as (() => void) | null)?.();
        (req.onsuccess as (() => void) | null)?.();
      });
      return req;
    },
  };
  return { factory, storeMap };
}

describe('media-cache', () => {
  beforeEach(() => {
    clearSessionCache();
    clearMediaCache();
    sessionStorage.clear();
  });

  afterEach(() => {
    clearSessionCache();
    clearMediaCache();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('hits Tier-1 memory LRU synchronously and evicts oldest unused entries by count and byte budget', () => {
    const client = { id: 'c1' };
    const otherClient = { id: 'c2' };
    expect(resolveMediaScope(client).memoryScope).not.toBe(resolveMediaScope(otherClient).memoryScope);

    // Entry-count LRU (24 max): insert 24 items, read item 0 to refresh LRU, insert item 24 -> item 1 evicted, item 0 stays.
    for (let i = 0; i < 24; i += 1) {
      primeMediaBlob(client, `k-${i}`, new Blob([new Uint8Array([i])], { type: 'video/mp4' }), { persist: false });
    }
    expect(peekMediaBlob(client, 'k-0')).toBeDefined();
    primeMediaBlob(client, 'k-24', new Blob([new Uint8Array([24])], { type: 'video/mp4' }), { persist: false });
    expect(peekMediaBlob(client, 'k-0')).toBeDefined();
    expect(peekMediaBlob(client, 'k-1')).toBeUndefined();
    expect(peekMediaBlob(client, 'k-24')).toBeDefined();

    // Byte-budget LRU (192 MiB max): three 80 MiB blobs -> 240 MiB > 192 MiB -> oldest evicted.
    clearMediaCache();
    const big = (tag: number) => {
      const b = new Blob([new Uint8Array([tag])], { type: 'video/mp4' });
      Object.defineProperty(b, 'size', { configurable: true, value: 80 * 1024 * 1024 });
      return b;
    };
    primeMediaBlob(client, 'big-1', big(1), { persist: false });
    primeMediaBlob(client, 'big-2', big(2), { persist: false });
    primeMediaBlob(client, 'big-3', big(3), { persist: false });
    expect(peekMediaBlob(client, 'big-1')).toBeUndefined();
    expect(peekMediaBlob(client, 'big-2')).toBeDefined();
    expect(peekMediaBlob(client, 'big-3')).toBeDefined();
  });

  it('persists blobs to Tier-2 IndexedDB bound to authority, hydrates across reload, and purges on authority change or TTL expiry', async () => {
    const { factory, storeMap } = createMockIndexedDB();
    vi.stubGlobal('indexedDB', factory);

    const aliceAuth = 'operator::alice::org-a::tok::owner::::1000::';
    syncCacheAuthority(aliceAuth);
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const fetcher = vi.fn(async () => new Blob([bytes], { type: 'video/mp4' }));

    const first = await fetchMediaBlob('tok', 'task:org-a:ws-a:t1:video', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(first.type).toBe('video/mp4');
    expect(storeMap.size).toBe(1);

    // Snapshot IDB, clear memory & IDB via clearSessionCache(), verify purge, then restore snapshot to simulate browser reload.
    const saved = new Map(storeMap);
    clearSessionCache();
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(storeMap.size).toBe(0);
    expect(peekMediaBlob('tok', 'task:org-a:ws-a:t1:video')).toBeUndefined();

    for (const [k, v] of saved.entries()) storeMap.set(k, v);
    syncCacheAuthority(aliceAuth);
    expect(peekMediaBlob('tok', 'task:org-a:ws-a:t1:video')).toBeUndefined();

    const hydrated = await fetchMediaBlob('tok', 'task:org-a:ws-a:t1:video', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(new Uint8Array(await hydrated.arrayBuffer())).toEqual(bytes);
    expect(peekMediaBlob('tok', 'task:org-a:ws-a:t1:video')).toBeDefined();

    // Expired entry in IDB (> 7 days) is rejected and deleted.
    clearMediaCache();
    await new Promise(resolve => setTimeout(resolve, 10));
    const [storedKey, storedVal] = [...saved.entries()][0];
    storeMap.set(storedKey, { ...storedVal, updatedAt: Date.now() - 8 * 24 * 60 * 60 * 1000 });
    const missExpired = await fetchMediaBlob('tok', 'task:org-a:ws-a:t1:video', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(missExpired.size).toBe(4);

    // Authority switch to Bob purges Alice's memory AND IDB entries immediately!
    syncCacheAuthority('operator::bob::org-b::tok::viewer::ws-b::1000::');
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(peekMediaBlob('tok', 'task:org-a:ws-a:t1:video')).toBeUndefined();
    expect(storeMap.size).toBe(0);
  });

  it('deduplicates concurrent downloads and only aborts underlying fetch when all consumers abort', async () => {
    let signalRef: AbortSignal | undefined;
    let resolveBlob!: (b: Blob) => void;
    const fetcher = vi.fn(
      (signal: AbortSignal) =>
        new Promise<Blob>((resolve, reject) => {
          signalRef = signal;
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
          resolveBlob = resolve;
        }),
    );

    const c1 = new AbortController();
    const c2 = new AbortController();
    const p1 = fetchMediaBlob('tok', 'task:org:ws:t2:video', fetcher, { signal: c1.signal });
    const p2 = fetchMediaBlob('tok', 'task:org:ws:t2:video', fetcher, { signal: c2.signal });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));

    c1.abort();
    await expect(p1).rejects.toMatchObject({ name: 'AbortError' });
    expect(signalRef?.aborted).toBe(false);

    resolveBlob(new Blob([new Uint8Array([9, 8])], { type: 'video/mp4' }));
    await expect(p2).resolves.toBeInstanceOf(Blob);

    // When the sole consumer aborts, the underlying fetcher signal is aborted.
    const c3 = new AbortController();
    const p3 = fetchMediaBlob('tok', 'task:org:ws:t3:video', fetcher, { signal: c3.signal });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    c3.abort();
    await expect(p3).rejects.toMatchObject({ name: 'AbortError' });
    expect(signalRef?.aborted).toBe(true);
  });

  it('evicts entries by prefix across memory, in-flight downloads, and IndexedDB', async () => {
    const { factory, storeMap } = createMockIndexedDB();
    vi.stubGlobal('indexedDB', factory);
    syncCacheAuthority('operator::alice::org-a::tok::owner::::1000::');

    await fetchMediaBlob('tok', 'task:org:ws:t1:video', async () => new Blob([new Uint8Array([1])], { type: 'video/mp4' }));
    await fetchMediaBlob('tok', 'task:org:ws:t1:last_frame', async () => new Blob([new Uint8Array([2])], { type: 'image/png' }));
    await fetchMediaBlob('tok', 'task:org:ws:other:video', async () => new Blob([new Uint8Array([3])], { type: 'video/mp4' }));

    let pendingSignal: AbortSignal | undefined;
    const pending = fetchMediaBlob('tok', 'task:org:ws:t1:pending', signal => new Promise((_, reject) => {
      pendingSignal = signal;
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    await vi.waitFor(() => expect(pendingSignal).toBeDefined());

    evictMediaBlob('tok', 'task:org:ws:t1:', { prefix: true });
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(pendingSignal?.aborted).toBe(true);
    expect(peekMediaBlob('tok', 'task:org:ws:t1:video')).toBeUndefined();
    expect(peekMediaBlob('tok', 'task:org:ws:t1:last_frame')).toBeUndefined();
    expect(peekMediaBlob('tok', 'task:org:ws:other:video')).toBeDefined();

    await new Promise(resolve => setTimeout(resolve, 10));
    expect([...storeMap.keys()].some(k => k.includes(':t1:'))).toBe(false);
    expect([...storeMap.keys()].some(k => k.includes(':other:'))).toBe(true);
  });

  it('falls back gracefully within 500ms if IndexedDB open hangs', async () => {
    vi.useFakeTimers();
    const { factory } = createMockIndexedDB(new Map(), { hangOpen: true });
    vi.stubGlobal('indexedDB', factory);
    syncCacheAuthority('operator::alice::org-a::tok::owner::::1000::');

    const fetcher = vi.fn(async () => new Blob([new Uint8Array([7, 7])], { type: 'video/mp4' }));
    const promise = fetchMediaBlob('tok', 'task:org:ws:t-hang:video', fetcher);
    await vi.advanceTimersByTimeAsync(1100);
    const blob = await promise;
    expect(blob.size).toBe(2);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(peekMediaBlob('tok', 'task:org:ws:t-hang:video')).toBeDefined();
  });
});
