import { getActiveCacheAuthority, subscribeCacheReset } from './query-cache';
import { downloadMedia } from './media-download';

type MemoryBlobEntry = { blob: Blob; updatedAt: number; size: number; generation: number };
type PersistedBlobRecord = { key: string; authority: string; type: string; size: number; updatedAt: number; bytes: ArrayBuffer };
type InFlightConsumer = { cleanup: () => void };
type InFlightMedia = { promise: Promise<Blob>; controller: AbortController; consumers: Set<InFlightConsumer>; keepAlive: boolean; generation: number; globalGen: number };

const MAX_MEMORY_ENTRIES = 24, MAX_MEMORY_BYTES = 192 * 1024 * 1024;
const IDB_NAME = 'niu.media.cache.v1', IDB_STORE = 'blobs', IDB_TIMEOUT_MS = 500;
const MAX_IDB_ENTRIES = 48, MAX_IDB_BYTES = 512 * 1024 * 1024, DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const memoryCache = new Map<string, MemoryBlobEntry>();
const inFlight = new Map<string, InFlightMedia>();
const keyGenerations = new Map<string, number>();
const clientIds = new WeakMap<object, number>();
let nextClientId = 0, memoryBytes = 0, mediaGeneration = 0;
let dbPromise: Promise<IDBDatabase | null> | null = null;
let activeIdbRef: IDBFactory | undefined;
let prunedAuthority: string | null = null;

function makeAbortError(): Error {
  try { return new DOMException('The operation was aborted.', 'AbortError'); }
  catch { const err = new Error('The operation was aborted.'); err.name = 'AbortError'; return err; }
}
const currentKeyGeneration = (fullKey: string) => keyGenerations.get(fullKey) ?? 0;
const bumpKeyGeneration = (fullKey: string) => { const next = currentKeyGeneration(fullKey) + 1; keyGenerations.set(fullKey, next); return next; };
const isGenerationCurrent = (fullKey: string, globalGen: number, keyGen: number) => globalGen === mediaGeneration && keyGen === currentKeyGeneration(fullKey);
const buildFullKey = (memoryScope: string, key: string) => `${memoryScope}::${key}`;

export function resolveMediaScope(scopeOrClient: string | object | null | undefined): { memoryScope: string; persistAuthority: string | null } {
  const authority = getActiveCacheAuthority();
  if (authority) return { memoryScope: authority, persistAuthority: authority };
  if (typeof scopeOrClient === 'string' && scopeOrClient) return { memoryScope: `tok:${scopeOrClient}`, persistAuthority: null };
  if (scopeOrClient && typeof scopeOrClient === 'object') {
    let id = clientIds.get(scopeOrClient);
    if (!id) { id = ++nextClientId; clientIds.set(scopeOrClient, id); }
    return { memoryScope: `client:${id}`, persistAuthority: null };
  }
  return { memoryScope: 'anon', persistAuthority: null };
}

function writeMemory(fullKey: string, blob: Blob, updatedAt = Date.now(), generation = currentKeyGeneration(fullKey)): void {
  const previous = memoryCache.get(fullKey);
  if (previous) { memoryBytes = Math.max(0, memoryBytes - previous.size); memoryCache.delete(fullKey); }
  if (blob.size > MAX_MEMORY_BYTES) return;
  memoryCache.set(fullKey, { blob, updatedAt, size: blob.size, generation });
  memoryBytes += blob.size;
  while (memoryCache.size > MAX_MEMORY_ENTRIES || memoryBytes > MAX_MEMORY_BYTES) {
    const oldestKey = memoryCache.keys().next().value;
    if (oldestKey === undefined) break;
    const evicted = memoryCache.get(oldestKey);
    memoryCache.delete(oldestKey);
    if (evicted) memoryBytes = Math.max(0, memoryBytes - evicted.size);
  }
}

function readMemory(fullKey: string, maxAgeMs: number): Blob | undefined {
  const entry = memoryCache.get(fullKey);
  if (!entry) return undefined;
  if (Date.now() - entry.updatedAt > maxAgeMs) { memoryCache.delete(fullKey); memoryBytes = Math.max(0, memoryBytes - entry.size); return undefined; }
  memoryCache.delete(fullKey);
  memoryCache.set(fullKey, entry);
  return entry.blob;
}

function withIdbTimeout<T>(operation: Promise<T>, fallback: T): Promise<T> {
  return new Promise<T>(resolve => {
    let settled = false;
    const finish = (value: T) => { if (!settled) { settled = true; globalThis.clearTimeout(timer); resolve(value); } };
    const timer = globalThis.setTimeout(() => { if (!settled) { settled = true; resolve(fallback); } }, IDB_TIMEOUT_MS);
    operation.then(finish, () => finish(fallback));
  });
}

const txComplete = (tx: IDBTransaction) => new Promise<void>(resolve => { tx.oncomplete = () => resolve(); tx.onerror = () => resolve(); tx.onabort = () => resolve(); });

function walkStore(store: IDBObjectStore, visit: (cursor: IDBCursorWithValue) => void, onDone?: () => void): Promise<void> {
  if (typeof store.openCursor !== 'function') { onDone?.(); return Promise.resolve(); }
  return new Promise<void>(resolve => {
    try {
      const req = store.openCursor();
      req.onsuccess = () => { const c = req.result; if (!c) { onDone?.(); resolve(); return; } visit(c); c.continue(); };
      req.onerror = () => resolve();
    } catch { resolve(); }
  });
}

function pruneStore(store: IDBObjectStore, authority: string, now: number): Promise<void> {
  const valid: Array<{ key: IDBValidKey; updatedAt: number; size: number }> = [];
  let totalBytes = 0;
  return walkStore(store, cursor => {
    const rec = cursor.value as Partial<PersistedBlobRecord> | undefined;
    if (!rec || typeof rec.updatedAt !== 'number' || now - rec.updatedAt > DEFAULT_MAX_AGE_MS || rec.authority !== authority) { cursor.delete(); return; }
    const size = typeof rec.size === 'number' && Number.isFinite(rec.size) ? rec.size : 0;
    valid.push({ key: cursor.primaryKey, updatedAt: rec.updatedAt, size });
    totalBytes += size;
  }, () => {
    if (valid.length <= MAX_IDB_ENTRIES && totalBytes <= MAX_IDB_BYTES) return;
    valid.sort((a, b) => a.updatedAt - b.updatedAt);
    let count = valid.length, bytes = totalBytes;
    for (const item of valid) {
      if (count <= MAX_IDB_ENTRIES && bytes <= MAX_IDB_BYTES) break;
      store.delete(item.key); count -= 1; bytes -= item.size;
    }
  });
}

async function openMediaDatabase(authority?: string | null): Promise<IDBDatabase | null> {
  const idb = typeof indexedDB === 'undefined' ? undefined : indexedDB;
  if (!idb) { dbPromise = null; activeIdbRef = undefined; return null; }
  if (idb !== activeIdbRef) { activeIdbRef = idb; dbPromise = null; prunedAuthority = null; }
  if (!dbPromise) {
    dbPromise = withIdbTimeout(new Promise<IDBDatabase | null>(resolve => {
      let done = false;
      const finish = (db: IDBDatabase | null) => { if (!done) { done = true; resolve(db); } else if (db) db.close(); };
      try {
        const req = idb.open(IDB_NAME, 1);
        req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE, { keyPath: 'key' }); };
        req.onsuccess = () => {
          const db = req.result;
          db.onversionchange = () => { db.close(); dbPromise = null; prunedAuthority = null; };
          db.onclose = () => { dbPromise = null; prunedAuthority = null; };
          finish(db);
        };
        req.onerror = req.onblocked = () => { dbPromise = null; finish(null); };
      } catch { dbPromise = null; finish(null); }
    }), null);
  }
  const db = await dbPromise;
  if (!db) { dbPromise = null; return null; }
  if (authority && prunedAuthority !== authority) {
    prunedAuthority = authority;
    try { const tx = db.transaction(IDB_STORE, 'readwrite'); await withIdbTimeout(pruneStore(tx.objectStore(IDB_STORE), authority, Date.now()).then(() => txComplete(tx)), undefined); } catch { /* IndexedDB pruning is optional. */ }
  }
  return db;
}

async function mutatePersistedStore(authority: string | null | undefined, run: (store: IDBObjectStore) => unknown): Promise<void> {
  const db = await openMediaDatabase(authority);
  if (!db) return;
  const tx = db.transaction(IDB_STORE, 'readwrite');
  await withIdbTimeout(Promise.resolve(run(tx.objectStore(IDB_STORE))).then(() => txComplete(tx)), undefined);
}

async function readPersistedBlob(fullKey: string, authority: string, maxAgeMs: number): Promise<Blob | undefined> {
  const db = await openMediaDatabase(authority);
  if (!db) return undefined;
  try {
    const store = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE);
    const record = await withIdbTimeout(new Promise<PersistedBlobRecord | undefined>(resolve => {
      const req = store.get(fullKey); req.onsuccess = () => resolve(req.result as PersistedBlobRecord | undefined); req.onerror = () => resolve(undefined);
    }), undefined);
    if (!record || typeof record !== 'object') return undefined;
    if (record.authority !== authority || typeof record.updatedAt !== 'number' || Date.now() - record.updatedAt > maxAgeMs) {
      void mutatePersistedStore(null, s => s.delete(fullKey)).catch(() => { /* Expired or mismatched entries are removed opportunistically. */ });
      return undefined;
    }
    const rawBytes: unknown = record.bytes;
    if (!(rawBytes instanceof ArrayBuffer) && !ArrayBuffer.isView(rawBytes)) return undefined;
    const source = rawBytes instanceof ArrayBuffer ? rawBytes : new Uint8Array(rawBytes.buffer as ArrayBuffer, rawBytes.byteOffset, rawBytes.byteLength);
    return new Blob([source], { type: record.type || 'application/octet-stream' });
  } catch { return undefined; }
}

async function writePersistedBlob(fullKey: string, authority: string, blob: Blob, updatedAt: number, entryGlobalGen: number, entryGen: number): Promise<void> {
  if (blob.size > MAX_IDB_BYTES || typeof indexedDB === 'undefined') return;
  try {
    const bytes = typeof blob.arrayBuffer === 'function' ? await blob.arrayBuffer() : await new Response(blob).arrayBuffer();
    if (!isGenerationCurrent(fullKey, entryGlobalGen, entryGen) || getActiveCacheAuthority() !== authority) return;
    await mutatePersistedStore(authority, store => {
      if (!isGenerationCurrent(fullKey, entryGlobalGen, entryGen) || getActiveCacheAuthority() !== authority) return;
      store.put({ key: fullKey, authority, type: blob.type || 'application/octet-stream', size: blob.size, updatedAt, bytes } satisfies PersistedBlobRecord);
      return pruneStore(store, authority, updatedAt);
    });
  } catch { /* Disposable persistent cache ignores unavailable or quota-limited storage. */ }
}

export function peekMediaBlob(scopeOrClient: string | object | null | undefined, key: string, maxAgeMs = DEFAULT_MAX_AGE_MS): Blob | undefined {
  return readMemory(buildFullKey(resolveMediaScope(scopeOrClient).memoryScope, key), maxAgeMs);
}

export function primeMediaBlob(scopeOrClient: string | object | null | undefined, key: string, blob: Blob, options?: { persist?: boolean }): void {
  const { memoryScope, persistAuthority } = resolveMediaScope(scopeOrClient);
  const fullKey = buildFullKey(memoryScope, key), entryGlobalGen = mediaGeneration, entryGen = bumpKeyGeneration(fullKey), updatedAt = Date.now();
  writeMemory(fullKey, blob, updatedAt, entryGen);
  if (options?.persist !== false && persistAuthority) {
    void writePersistedBlob(fullKey, persistAuthority, blob, updatedAt, entryGlobalGen, entryGen).catch(() => { /* Background IndexedDB priming ignores storage failures. */ });
  }
}

export async function fetchMediaBlob(
  scopeOrClient: string | object | null | undefined, key: string, fetcher: (signal: AbortSignal) => Promise<Blob>,
  options?: { force?: boolean; persist?: boolean; maxAgeMs?: number; signal?: AbortSignal },
): Promise<Blob> {
  const callerSignal = options?.signal;
  if (callerSignal?.aborted) throw makeAbortError();
  const { memoryScope, persistAuthority } = resolveMediaScope(scopeOrClient);
  const fullKey = buildFullKey(memoryScope, key), maxAgeMs = options?.maxAgeMs ?? DEFAULT_MAX_AGE_MS, persist = options?.persist !== false && Boolean(persistAuthority);
  if (!options?.force) { const hit = readMemory(fullKey, maxAgeMs); if (hit) return hit; } else bumpKeyGeneration(fullKey);
  let shared = !options?.force ? inFlight.get(fullKey) : undefined;
  if (shared && (shared.controller.signal.aborted || !isGenerationCurrent(fullKey, shared.globalGen, shared.generation))) { inFlight.delete(fullKey); shared = undefined; }
  if (!shared) {
    const controller = new AbortController(), entryGen = currentKeyGeneration(fullKey), entryGlobalGen = mediaGeneration;
    const entry: InFlightMedia = { promise: Promise.resolve(new Blob()), controller, consumers: new Set(), keepAlive: !callerSignal, generation: entryGen, globalGen: entryGlobalGen };
    entry.promise = (async () => {
      try {
        if (!options?.force && persist && persistAuthority) {
          const persisted = await readPersistedBlob(fullKey, persistAuthority, maxAgeMs);
          if (persisted && !controller.signal.aborted && isGenerationCurrent(fullKey, entryGlobalGen, entryGen)) { writeMemory(fullKey, persisted, Date.now(), entryGen); return persisted; }
        }
        if (controller.signal.aborted) throw makeAbortError();
        const blob = await downloadMedia(controller.signal, () => fetcher(controller.signal));
        if (!controller.signal.aborted && isGenerationCurrent(fullKey, entryGlobalGen, entryGen)) {
          const now = Date.now(); writeMemory(fullKey, blob, now, entryGen);
          if (persist && persistAuthority) await writePersistedBlob(fullKey, persistAuthority, blob, now, entryGlobalGen, entryGen);
        }
        return blob;
      } finally { if (inFlight.get(fullKey) === entry) inFlight.delete(fullKey); }
    })();
    void entry.promise.catch(() => { /* Shared download rejections are observed by active callers; cache eviction or clear must not emit unhandled rejections. */ });
    inFlight.set(fullKey, entry); shared = entry;
  } else if (!callerSignal) shared.keepAlive = true;
  if (!callerSignal) return shared.promise;
  const activeShared = shared;
  return new Promise<Blob>((resolve, reject) => {
    const onAbort = () => {
      consumer.cleanup(); activeShared.consumers.delete(consumer);
      if (activeShared.consumers.size === 0 && !activeShared.keepAlive) { if (inFlight.get(fullKey) === activeShared) inFlight.delete(fullKey); activeShared.controller.abort(); }
      reject(makeAbortError());
    };
    const consumer: InFlightConsumer = { cleanup: () => callerSignal.removeEventListener('abort', onAbort) };
    activeShared.consumers.add(consumer); callerSignal.addEventListener('abort', onAbort, { once: true });
    activeShared.promise.then(
      v => { consumer.cleanup(); activeShared.consumers.delete(consumer); if (!callerSignal.aborted) resolve(v); },
      e => { consumer.cleanup(); activeShared.consumers.delete(consumer); if (!callerSignal.aborted) reject(e); },
    );
  });
}

export function evictMediaBlob(scopeOrClient: string | object | null | undefined, keyOrPrefix: string, options?: { prefix?: boolean }): void {
  const { memoryScope, persistAuthority } = resolveMediaScope(scopeOrClient);
  const target = buildFullKey(memoryScope, keyOrPrefix), prefix = Boolean(options?.prefix);
  const matches = (candidate: string) => (prefix ? candidate.startsWith(target) : candidate === target);
  for (const [k, pending] of inFlight.entries()) if (matches(k)) { bumpKeyGeneration(k); pending.controller.abort(); inFlight.delete(k); }
  for (const [k, entry] of memoryCache.entries()) if (matches(k)) { bumpKeyGeneration(k); memoryBytes = Math.max(0, memoryBytes - entry.size); memoryCache.delete(k); }
  for (const k of keyGenerations.keys()) if (matches(k)) bumpKeyGeneration(k);
  if (persistAuthority) {
    void mutatePersistedStore(null, store => (prefix ? walkStore(store, c => { if (typeof c.primaryKey === 'string' && c.primaryKey.startsWith(target)) c.delete(); }) : store.delete(target)))
      .catch(() => { /* IndexedDB eviction ignores storage failures. */ });
  }
}

export function clearMediaCache(): void {
  mediaGeneration += 1; keyGenerations.clear();
  for (const pending of inFlight.values()) pending.controller.abort();
  inFlight.clear(); memoryCache.clear(); memoryBytes = 0; prunedAuthority = null;
  void mutatePersistedStore(null, store => store.clear()).catch(() => { /* IndexedDB cleanup ignores unavailable or blocked storage. */ });
}

subscribeCacheReset(() => clearMediaCache());
