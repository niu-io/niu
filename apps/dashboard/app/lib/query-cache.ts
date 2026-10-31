import { startTransition, useCallback, useEffect, useRef, useState } from 'react';

type CacheEntry<T = unknown> = {
  data: T;
  updatedAt: number;
  stale: boolean;
  generation: number;
  globalGen: number;
};

type InFlightConsumer = {
  reject: (reason: unknown) => void;
  cleanup: () => void;
};

type FetchOutcome<T = unknown> = {
  data: T;
  generation: number;
  globalGen: number;
};

type InFlightEntry<T = unknown> = {
  promise: Promise<FetchOutcome<T>>;
  controller: AbortController;
  consumers: Set<InFlightConsumer>;
  background: boolean;
  generation: number;
  globalGen: number;
};

type CacheSubscriber = () => void;
export type MutationNotification = { token: string; path: string; method: string };
type MutationSubscriber = (event: MutationNotification) => void;

export type FetchQueryOptions = {
  freshMs?: number;
  maxAgeMs?: number;
  force?: boolean;
  awaitRevalidate?: boolean;
  persist?: boolean;
  background?: boolean;
  signal?: AbortSignal;
};

export type UseCachedQueryOptions<T> = {
  enabled?: boolean;
  freshMs?: number;
  maxAgeMs?: number;
  persist?: boolean;
  /** Retain previous data when `key` changes within the exact same `scope` (e.g. filters/tabs). Never retains across `scope` boundaries. */
  keepPreviousData?: boolean;
  initialData?: T;
};

const STORAGE_PREFIX = 'niu.qcache.v1:';
const EPOCH_KEY = 'niu.qcache.epoch';
const AUTHORITY_KEY = 'niu.qcache.authority.v1';
const MAX_PERSIST_CHARS = 180_000;
const DEFAULT_FRESH_MS = 20_000;
const DEFAULT_MAX_AGE_MS = 10 * 60_000;

const memoryCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, InFlightEntry>();
const keyGenerations = new Map<string, number>();
const subscribers = new Map<string, Set<CacheSubscriber>>();
const mutationSubscribers = new Set<MutationSubscriber>();

let globalGeneration = 0;
let activeFetchRef: typeof fetch | undefined = globalThis.fetch;
let activeEpoch: string | null = null;
let activeAuthorityHash: string | null = null;

function currentKeyGeneration(fullKey: string): number {
  return keyGenerations.get(fullKey) ?? 0;
}

function bumpKeyGeneration(fullKey: string): number {
  const next = currentKeyGeneration(fullKey) + 1;
  keyGenerations.set(fullKey, next);
  return next;
}

function isGenerationCurrent(fullKey: string, entryGlobalGen: number, entryGen: number): boolean {
  return entryGlobalGen === globalGeneration && entryGen === currentKeyGeneration(fullKey);
}

function readStorageEpoch(): string | null {
  try {
    if (typeof sessionStorage === 'undefined') return 'no-storage';
    let current = sessionStorage.getItem(EPOCH_KEY);
    if (!current) {
      current = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      sessionStorage.setItem(EPOCH_KEY, current);
      // If activeEpoch already existed, sessionStorage was cleared externally (e.g. test reset or browser clear).
      if (activeEpoch !== null && activeEpoch !== 'no-storage') {
        clearMemoryOnly();
        activeAuthorityHash = null;
      }
    }
    return current;
  } catch {
    return 'no-storage';
  }
}

function clearMemoryOnly() {
  globalGeneration += 1;
  keyGenerations.clear();
  for (const pending of inFlight.values()) {
    pending.controller.abort();
  }
  inFlight.clear();
  memoryCache.clear();
}

function ensureCacheCoherence() {
  if (globalThis.fetch !== activeFetchRef) {
    activeFetchRef = globalThis.fetch;
    clearMemoryOnly();
  }
  const epoch = readStorageEpoch();
  if (activeEpoch !== null && epoch !== activeEpoch) {
    clearMemoryOnly();
    activeAuthorityHash = null;
  }
  activeEpoch = epoch;
}

/** Non-reversible fingerprint so bearer credentials never enter storage keys. */
function scopeFingerprint(scope: string): string {
  if (!scope || scope === 'public') return 'public';
  let h1 = 0xdeadbeef ^ scope.length;
  let h2 = 0x41c6ce57 ^ scope.length;
  for (let i = 0; i < scope.length; i += 1) {
    const ch = scope.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `s_${(h2 >>> 0).toString(36)}_${(h1 >>> 0).toString(36)}`;
}

export function buildCacheKey(scope: string, key: string): string {
  return `${scope || 'public'}::${key}`;
}

function buildStorageKey(scope: string, key: string): string {
  return `${STORAGE_PREFIX}${scopeFingerprint(scope)}::${key}`;
}

function buildStorageKeyFromFullKey(fullKey: string): string {
  const separator = fullKey.indexOf('::');
  if (separator < 0) return `${STORAGE_PREFIX}public::${fullKey}`;
  const scope = fullKey.slice(0, separator);
  const key = fullKey.slice(separator + 2);
  return buildStorageKey(scope, key);
}

/**
 * Bind in-memory and sessionStorage caches to the verified authenticated principal and effective authority.
 * Any principal switch, permission reduction, or restored mismatched sessionStorage snapshot immediately purges
 * prior-user memory and persisted entries before protected UI reads from cache.
 */
export function syncCacheAuthority(authorityKey: string | null): void {
  ensureCacheCoherence();
  const nextHash = authorityKey ? scopeFingerprint(authorityKey) : null;
  let storedHash: string | null = null;
  try {
    if (typeof sessionStorage !== 'undefined') {
      storedHash = sessionStorage.getItem(AUTHORITY_KEY);
    }
  } catch {
    storedHash = null;
  }

  const memoryChanged = activeAuthorityHash !== null && activeAuthorityHash !== nextHash;
  const storageMismatch =
    nextHash !== null &&
    ((storedHash !== null && storedHash !== nextHash) || (storedHash === null && hasPersistedCacheEntries()));

  if (memoryChanged || storageMismatch) {
    const notifyKeys = [...subscribers.keys()];
    clearSessionCache();
    for (const fullKey of notifyKeys) {
      notifyKey(fullKey);
    }
  }

  activeAuthorityHash = nextHash;
  try {
    if (typeof sessionStorage !== 'undefined' && nextHash) {
      sessionStorage.setItem(AUTHORITY_KEY, nextHash);
    }
  } catch {
    // Storage access is optional.
  }
}

function hasPersistedCacheEntries(): boolean {
  try {
    if (typeof sessionStorage === 'undefined') return false;
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function structurallyEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function notifyKey(fullKey: string) {
  const set = subscribers.get(fullKey);
  if (!set || set.size === 0) return;
  startTransition(() => {
    for (const listener of [...set]) {
      listener();
    }
  });
}

export function subscribeQuery(scope: string, key: string, listener: CacheSubscriber): () => void {
  const fullKey = buildCacheKey(scope, key);
  let set = subscribers.get(fullKey);
  if (!set) {
    set = new Set();
    subscribers.set(fullKey, set);
  }
  set.add(listener);
  return () => {
    const current = subscribers.get(fullKey);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) subscribers.delete(fullKey);
  };
}

export function subscribeMutations(listener: MutationSubscriber): () => void {
  mutationSubscribers.add(listener);
  return () => {
    mutationSubscribers.delete(listener);
  };
}

function readPersistedSnapshot<T>(scope: string, key: string, maxAgeMs: number): CacheEntry<T> | undefined {
  if (!activeAuthorityHash) return undefined;
  try {
    if (typeof sessionStorage === 'undefined') return undefined;
    const storageKey = buildStorageKey(scope, key);
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { data: T; updatedAt: number; authority?: string | null } | null;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.updatedAt !== 'number') {
      sessionStorage.removeItem(storageKey);
      return undefined;
    }
    if (!parsed.authority || parsed.authority !== activeAuthorityHash) {
      sessionStorage.removeItem(storageKey);
      return undefined;
    }
    if (Date.now() - parsed.updatedAt > maxAgeMs) {
      sessionStorage.removeItem(storageKey);
      return undefined;
    }
    const fullKey = buildCacheKey(scope, key);
    // Hydrated snapshots render immediately on frame 0 and revalidate in background.
    return {
      data: parsed.data,
      updatedAt: parsed.updatedAt,
      stale: true,
      generation: currentKeyGeneration(fullKey),
      globalGen: globalGeneration,
    };
  } catch {
    return undefined;
  }
}

function writePersistedSnapshot<T>(scope: string, key: string, data: T, updatedAt: number) {
  if (!activeAuthorityHash) return;
  try {
    if (typeof sessionStorage === 'undefined') return;
    const serialized = JSON.stringify({ data, updatedAt, authority: activeAuthorityHash });
    if (serialized.length > MAX_PERSIST_CHARS) return;
    sessionStorage.setItem(buildStorageKey(scope, key), serialized);
  } catch {
    // Disposable cache: ignore quota or private-browsing storage restrictions.
  }
}

function removePersistedEntry(fullKey: string) {
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.removeItem(buildStorageKeyFromFullKey(fullKey));
  } catch {
    // Storage access is optional.
  }
}

export function peekQuery<T>(
  scope: string,
  key: string,
  options?: { persist?: boolean; maxAgeMs?: number },
): T | undefined {
  ensureCacheCoherence();
  const fullKey = buildCacheKey(scope, key);
  const maxAgeMs = options?.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const hit = memoryCache.get(fullKey) as CacheEntry<T> | undefined;
  if (hit) {
    if (Date.now() - hit.updatedAt <= maxAgeMs) {
      return hit.data;
    }
    memoryCache.delete(fullKey);
  }
  if (options?.persist) {
    const hydrated = readPersistedSnapshot<T>(scope, key, maxAgeMs);
    if (hydrated) {
      memoryCache.set(fullKey, hydrated);
      return hydrated.data;
    }
  }
  return undefined;
}

export function isQueryFresh(scope: string, key: string, freshMs = DEFAULT_FRESH_MS): boolean {
  ensureCacheCoherence();
  const hit = memoryCache.get(buildCacheKey(scope, key));
  if (!hit || hit.stale) return false;
  return Date.now() - hit.updatedAt <= freshMs;
}

export function isQueryInvalidated(scope: string, key: string): boolean {
  ensureCacheCoherence();
  const hit = memoryCache.get(buildCacheKey(scope, key));
  return Boolean(hit?.stale);
}

export function primeQuery<T>(
  scope: string,
  key: string,
  data: T,
  options?: { persist?: boolean },
): void {
  ensureCacheCoherence();
  const fullKey = buildCacheKey(scope, key);
  const prev = memoryCache.get(fullKey);
  const generation = bumpKeyGeneration(fullKey);
  inFlight.delete(fullKey);
  const updatedAt = Date.now();
  memoryCache.set(fullKey, {
    data,
    updatedAt,
    stale: false,
    generation,
    globalGen: globalGeneration,
  });
  if (options?.persist) {
    writePersistedSnapshot(scope, key, data, updatedAt);
  }
  if (!prev || prev.stale || !structurallyEqual(prev.data, data)) {
    notifyKey(fullKey);
  }
}

function makeAbortError(): Error {
  try {
    return new DOMException('The operation was aborted.', 'AbortError');
  } catch {
    const err = new Error('The operation was aborted.');
    err.name = 'AbortError';
    return err;
  }
}

export function isAbortError(reason: unknown): boolean {
  return Boolean(
    reason &&
      typeof reason === 'object' &&
      ('name' in reason && (reason as { name?: string }).name === 'AbortError'),
  );
}

function runNetworkFetch<T>(
  scope: string,
  key: string,
  fetcher: (signal: AbortSignal) => Promise<T>,
  options?: { persist?: boolean; background?: boolean; signal?: AbortSignal; forceNew?: boolean },
): Promise<FetchOutcome<T>> {
  const fullKey = buildCacheKey(scope, key);
  const callerSignal = options?.signal;
  if (callerSignal?.aborted) {
    return Promise.reject(makeAbortError());
  }

  if (options?.forceNew) {
    bumpKeyGeneration(fullKey);
  }

  let shared = !options?.forceNew ? (inFlight.get(fullKey) as InFlightEntry<T> | undefined) : undefined;
  if (
    shared &&
    (shared.controller.signal.aborted || !isGenerationCurrent(fullKey, shared.globalGen, shared.generation))
  ) {
    inFlight.delete(fullKey);
    shared = undefined;
  }
  if (!shared) {
    const controller = new AbortController();
    const consumers = new Set<InFlightConsumer>();
    const entryGen = currentKeyGeneration(fullKey);
    const entryGlobalGen = globalGeneration;
    const entry: InFlightEntry<T> = {
      promise: Promise.resolve(undefined as unknown as FetchOutcome<T>),
      controller,
      consumers,
      background: Boolean(options?.background),
      generation: entryGen,
      globalGen: entryGlobalGen,
    };
    entry.promise = (async () => {
      try {
        const result = await fetcher(controller.signal);
        const isCurrent =
          !controller.signal.aborted && isGenerationCurrent(fullKey, entryGlobalGen, entryGen);
        if (isCurrent) {
          const prev = memoryCache.get(fullKey);
          const updatedAt = Date.now();
          memoryCache.set(fullKey, {
            data: result,
            updatedAt,
            stale: false,
            generation: entryGen,
            globalGen: entryGlobalGen,
          });
          if (options?.persist) {
            writePersistedSnapshot(scope, key, result, updatedAt);
          }
          if (!prev || prev.stale || !structurallyEqual(prev.data, result)) {
            notifyKey(fullKey);
          }
          return { data: result, generation: entryGen, globalGen: entryGlobalGen };
        }
        const latest = memoryCache.get(fullKey) as CacheEntry<T> | undefined;
        if (latest && !latest.stale && latest.globalGen === entryGlobalGen && latest.generation > entryGen) {
          return { data: latest.data, generation: latest.generation, globalGen: latest.globalGen };
        }
        return { data: result, generation: entryGen, globalGen: entryGlobalGen };
      } finally {
        if (inFlight.get(fullKey) === entry) {
          inFlight.delete(fullKey);
        }
      }
    })();
    inFlight.set(fullKey, entry);
    shared = entry;
  } else if (options?.background) {
    shared.background = true;
  }

  if (!callerSignal) {
    shared.background = true;
    return shared.promise;
  }

  const activeShared = shared;
  return new Promise<FetchOutcome<T>>((resolve, reject) => {
    const onAbort = () => {
      consumer.cleanup();
      activeShared.consumers.delete(consumer);
      if (activeShared.consumers.size === 0 && !activeShared.background) {
        if (inFlight.get(fullKey) === activeShared) {
          inFlight.delete(fullKey);
        }
        activeShared.controller.abort();
      }
      reject(makeAbortError());
    };
    const consumer: InFlightConsumer = {
      reject,
      cleanup: () => callerSignal.removeEventListener('abort', onAbort),
    };
    activeShared.consumers.add(consumer);
    callerSignal.addEventListener('abort', onAbort, { once: true });

    activeShared.promise.then(
      value => {
        consumer.cleanup();
        activeShared.consumers.delete(consumer);
        if (!callerSignal.aborted) resolve(value);
      },
      error => {
        consumer.cleanup();
        activeShared.consumers.delete(consumer);
        if (!callerSignal.aborted) reject(error);
      },
    );
  });
}

function startOrJoinNetworkFetch<T>(
  scope: string,
  key: string,
  fetcher: (signal: AbortSignal) => Promise<T>,
  options?: { persist?: boolean; background?: boolean; signal?: AbortSignal; forceNew?: boolean },
): Promise<T> {
  return runNetworkFetch(scope, key, fetcher, options).then(outcome => outcome.data);
}

export async function fetchQuery<T>(
  scope: string,
  key: string,
  fetcher: (signal: AbortSignal) => Promise<T>,
  options?: FetchQueryOptions,
): Promise<T> {
  ensureCacheCoherence();
  const freshMs = options?.freshMs ?? DEFAULT_FRESH_MS;
  const maxAgeMs = options?.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const fullKey = buildCacheKey(scope, key);

  if (!options?.force) {
    let hit = memoryCache.get(fullKey) as CacheEntry<T> | undefined;
    if (!hit && options?.persist) {
      hit = readPersistedSnapshot<T>(scope, key, maxAgeMs);
      if (hit) memoryCache.set(fullKey, hit);
    }
    if (hit && Date.now() - hit.updatedAt <= maxAgeMs) {
      const age = Date.now() - hit.updatedAt;
      if (!hit.stale && age <= freshMs) {
        return hit.data;
      }
      if (!options?.awaitRevalidate) {
        // Stale-While-Revalidate: return cached data immediately and refresh silently in background.
        void startOrJoinNetworkFetch(scope, key, fetcher, {
          persist: options?.persist,
          background: true,
        }).catch(() => {
          /* Background SWR failures preserve last verified cached view. */
        });
        return hit.data;
      }
    }
  }

  return await startOrJoinNetworkFetch(scope, key, fetcher, {
    persist: options?.persist,
    background: options?.background,
    signal: options?.signal,
    forceNew: Boolean(options?.force),
  });
}

export function prefetchQuery<T>(
  scope: string,
  key: string,
  fetcher: (signal: AbortSignal) => Promise<T>,
  options?: { freshMs?: number; persist?: boolean },
): void {
  ensureCacheCoherence();
  if (isQueryFresh(scope, key, options?.freshMs ?? DEFAULT_FRESH_MS)) return;
  void startOrJoinNetworkFetch(scope, key, fetcher, {
    persist: options?.persist,
    background: true,
  }).catch(() => {
    /* Speculative prefetch errors are ignored; active views surface real errors. */
  });
}

export function invalidateQueries(
  matcher?: string | ((fullKey: string) => boolean),
  options?: { remove?: boolean },
): void {
  ensureCacheCoherence();
  const matches = (fullKey: string) =>
    !matcher ? true : typeof matcher === 'string' ? fullKey.includes(matcher) : matcher(fullKey);

  const candidates = new Set<string>([
    ...memoryCache.keys(),
    ...inFlight.keys(),
    ...subscribers.keys(),
  ]);
  const affected: string[] = [];

  for (const fullKey of candidates) {
    if (!matches(fullKey)) continue;
    bumpKeyGeneration(fullKey);
    inFlight.delete(fullKey);
    removePersistedEntry(fullKey);
    const entry = memoryCache.get(fullKey);
    if (entry) {
      if (options?.remove) {
        memoryCache.delete(fullKey);
      } else {
        entry.stale = true;
      }
    }
    affected.push(fullKey);
  }

  if (!matcher || typeof matcher === 'string') {
    try {
      if (typeof sessionStorage !== 'undefined') {
        const toRemove: string[] = [];
        for (let i = 0; i < sessionStorage.length; i += 1) {
          const storageKey = sessionStorage.key(i);
          if (storageKey && storageKey.startsWith(STORAGE_PREFIX)) {
            if (!matcher || storageKey.includes(matcher)) {
              toRemove.push(storageKey);
            }
          }
        }
        for (const storageKey of toRemove) sessionStorage.removeItem(storageKey);
      }
    } catch {
      // Storage access is optional.
    }
  }

  for (const fullKey of affected) {
    notifyKey(fullKey);
  }
}

export function invalidateForMutation(token: string, path: string, method: string): void {
  const upper = method.toUpperCase();
  if (upper === 'GET' || upper === 'HEAD') return;
  const cleanPath = path.split('?')[0];
  const substrings = new Set<string>();

  if (cleanPath.includes('/branding')) {
    substrings.add('branding');
  }
  if (cleanPath.includes('/currency') || cleanPath.includes('/units')) {
    substrings.add('currency');
    substrings.add('/billing');
    substrings.add('/pricing');
    substrings.add('/payments/readiness');
  }
  if (cleanPath.includes('/payments')) {
    substrings.add('/payments');
    substrings.add('/platform/configuration');
  }
  if (cleanPath.includes('/providers') || cleanPath.includes('/suppliers') || cleanPath.includes('/vendors')) {
    substrings.add('/providers');
    substrings.add('/models');
    substrings.add('/route-pools');
    substrings.add('/pools');
  }
  if (cleanPath.includes('/keys')) {
    substrings.add('/keys');
    substrings.add('workspace-video');
  }
  if (cleanPath.includes('/workspaces') || cleanPath.includes('/projects') || cleanPath.includes('/organizations')) {
    substrings.add('/workspaces');
    substrings.add('/organizations');
  }
  if (cleanPath.includes('/guardrails')) {
    substrings.add('/guardrails');
  }
  if (cleanPath.includes('/operators') || cleanPath.includes('/users') || cleanPath.includes('/members')) {
    substrings.add('/operators');
    substrings.add('/members');
  }
  if (cleanPath.includes('/pricing') || cleanPath.includes('/tariffs') || cleanPath.includes('/promotions')) {
    substrings.add('/pricing');
    substrings.add('/tariffs');
    substrings.add('/billing');
    substrings.add('/models');
  }
  if (cleanPath.includes('/billing') || cleanPath.includes('/grants') || cleanPath.includes('/balances')) {
    substrings.add('/billing');
    substrings.add('/balances');
    substrings.add('/customer-accounts');
    substrings.add('/payments/readiness');
  }
  if (cleanPath.includes('/pools') || cleanPath.includes('/route-pools')) {
    substrings.add('/pools');
    substrings.add('/route-pools');
    substrings.add('/models');
  }

  const segments = cleanPath.split('/').filter(Boolean).slice(0, 4).join('/');
  const tokenPrefix = `${token || 'public'}::`;
  const patterns = [...substrings];

  invalidateQueries(fullKey => {
    if (patterns.some(pattern => fullKey.includes(pattern))) return true;
    return Boolean(segments && fullKey.startsWith(tokenPrefix) && fullKey.includes(segments));
  });

  if (mutationSubscribers.size > 0) {
    const notification: MutationNotification = { token, path: cleanPath, method: upper };
    startTransition(() => {
      for (const listener of [...mutationSubscribers]) {
        listener(notification);
      }
    });
  }
}

/** Immediately purge all memory and sessionStorage cache entries on sign-out or session revocation. */
export function clearSessionCache(token?: string): void {
  if (!token) {
    activeAuthorityHash = null;
    clearMemoryOnly();
  } else {
    const prefix = `${token}::`;
    for (const [key, pending] of inFlight.entries()) {
      if (key.startsWith(prefix)) {
        bumpKeyGeneration(key);
        pending.controller.abort();
        inFlight.delete(key);
      }
    }
    for (const key of memoryCache.keys()) {
      if (key.startsWith(prefix)) {
        bumpKeyGeneration(key);
        memoryCache.delete(key);
      }
    }
  }
  try {
    if (typeof sessionStorage !== 'undefined') {
      if (!token) {
        sessionStorage.removeItem(AUTHORITY_KEY);
      }
      const storagePrefix = token ? `${STORAGE_PREFIX}${scopeFingerprint(token)}::` : STORAGE_PREFIX;
      const toRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i += 1) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith(storagePrefix)) toRemove.push(k);
      }
      for (const k of toRemove) sessionStorage.removeItem(k);
    }
  } catch {
    // Storage access is optional.
  }
}

export function useCachedQuery<T>(
  scope: string,
  key: string | null,
  fetcher: (signal: AbortSignal) => Promise<T>,
  options?: UseCachedQueryOptions<T>,
) {
  const enabled = options?.enabled !== false && Boolean(key);
  const freshMs = options?.freshMs ?? DEFAULT_FRESH_MS;
  const maxAgeMs = options?.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const persist = options?.persist ?? false;
  const keepPreviousData = options?.keepPreviousData ?? true;

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const currentAuthority = activeAuthorityHash;
  const initialCached = enabled && key ? peekQuery<T>(scope, key, { persist, maxAgeMs }) : undefined;

  const [state, setState] = useState<{
    authority: string | null;
    scope: string;
    key: string | null;
    data: T | undefined;
    error: string;
    loading: boolean;
    refreshing: boolean;
  }>(() => ({
    authority: currentAuthority,
    scope,
    key,
    data: initialCached !== undefined ? initialCached : options?.initialData,
    error: '',
    loading: Boolean(enabled && initialCached === undefined && options?.initialData === undefined),
    refreshing: false,
  }));

  const [manualRevision, setManualRevision] = useState(0);
  const forceNextRef = useRef(false);

  // Synchronously reconcile authority/scope/key transitions during render to eliminate 1-frame stale flashes!
  let effectiveData = state.data;
  let effectiveLoading = state.loading;
  let effectiveError = state.error;

  if (state.authority !== currentAuthority || state.scope !== scope || state.key !== key) {
    const cached = enabled && key ? peekQuery<T>(scope, key, { persist, maxAgeMs }) : undefined;
    if (cached !== undefined) {
      effectiveData = cached;
      effectiveLoading = false;
      effectiveError = '';
    } else if (
      state.authority === currentAuthority &&
      state.scope === scope &&
      keepPreviousData &&
      state.data !== undefined
    ) {
      effectiveData = state.data;
      effectiveLoading = false;
      effectiveError = '';
    } else {
      effectiveData = options?.initialData;
      effectiveLoading = Boolean(enabled && options?.initialData === undefined);
      effectiveError = '';
    }
  }

  useEffect(() => {
    if (!enabled || !key) {
      setState({
        authority: currentAuthority,
        scope,
        key,
        data: options?.initialData,
        error: '',
        loading: false,
        refreshing: false,
      });
      return;
    }

    const fullKey = buildCacheKey(scope, key);
    const controller = new AbortController();
    const force = forceNextRef.current;
    forceNextRef.current = false;

    const cached = peekQuery<T>(scope, key, { persist, maxAgeMs });
    const retainedData =
      cached !== undefined
        ? cached
        : state.authority === currentAuthority && state.scope === scope && keepPreviousData
          ? state.data
          : options?.initialData;

    const fresh = !force && cached !== undefined && isQueryFresh(scope, key, freshMs);
    if (fresh) {
      setState({
        authority: currentAuthority,
        scope,
        key,
        data: cached,
        error: '',
        loading: false,
        refreshing: false,
      });
    } else {
      setState({
        authority: currentAuthority,
        scope,
        key,
        data: retainedData,
        error: '',
        loading: retainedData === undefined,
        refreshing: retainedData !== undefined,
      });

      const expectedGlobalGen = globalGeneration;
      const expectedGen = force ? currentKeyGeneration(fullKey) + 1 : currentKeyGeneration(fullKey);
      void runNetworkFetch<T>(scope, key, signal => fetcherRef.current(signal), {
        persist,
        signal: controller.signal,
        forceNew: force,
      })
        .then(outcome => {
          if (
            !controller.signal.aborted &&
            isGenerationCurrent(fullKey, outcome.globalGen, outcome.generation)
          ) {
            setState({
              authority: activeAuthorityHash,
              scope,
              key,
              data: outcome.data,
              error: '',
              loading: false,
              refreshing: false,
            });
          }
        })
        .catch(reason => {
          if (
            !controller.signal.aborted &&
            !isAbortError(reason) &&
            isGenerationCurrent(fullKey, expectedGlobalGen, expectedGen)
          ) {
            setState(prev => ({
              authority: activeAuthorityHash,
              scope,
              key,
              data: prev.authority === activeAuthorityHash && prev.scope === scope ? prev.data : undefined,
              error: reason instanceof Error ? reason.message : 'Request failed.',
              loading: false,
              refreshing: false,
            }));
          }
        });
    }

    const unsubscribe = subscribeQuery(scope, key, () => {
      if (controller.signal.aborted) return;
      const entry = memoryCache.get(fullKey) as CacheEntry<T> | undefined;
      if (entry && !entry.stale) {
        setState(prev => ({
          ...prev,
          authority: activeAuthorityHash,
          scope,
          key,
          data: entry.data,
          error: '',
          loading: false,
          refreshing: false,
        }));
      } else {
        // Trigger deduplicated refresh when invalidated while mounted (whether already cached or still awaiting first result).
        void runNetworkFetch<T>(scope, key, signal => fetcherRef.current(signal), {
          persist,
          background: true,
        })
          .then(outcome => {
            if (
              !controller.signal.aborted &&
              isGenerationCurrent(fullKey, outcome.globalGen, outcome.generation)
            ) {
              setState({
                authority: activeAuthorityHash,
                scope,
                key,
                data: outcome.data,
                error: '',
                loading: false,
                refreshing: false,
              });
            }
          })
          .catch(reason => {
            if (!controller.signal.aborted && !isAbortError(reason) && !memoryCache.has(fullKey)) {
              setState(prev => ({
                authority: activeAuthorityHash,
                scope,
                key,
                data: prev.authority === activeAuthorityHash && prev.scope === scope ? prev.data : undefined,
                error: reason instanceof Error ? reason.message : 'Request failed.',
                loading: false,
                refreshing: false,
              }));
            }
          });
      }
    });

    return () => {
      unsubscribe();
      controller.abort();
    };
  }, [enabled, currentAuthority, scope, key, freshMs, maxAgeMs, persist, keepPreviousData, manualRevision]);

  const reload = useCallback(() => {
    forceNextRef.current = true;
    setManualRevision(v => v + 1);
  }, []);

  const mutate = useCallback(
    (updater: T | ((current: T | undefined) => T)) => {
      if (!key) return;
      const current = peekQuery<T>(scope, key, { persist, maxAgeMs }) ?? state.data;
      const next = typeof updater === 'function' ? (updater as (c: T | undefined) => T)(current) : updater;
      primeQuery(scope, key, next, { persist });
      setState(prev => ({
        ...prev,
        authority: activeAuthorityHash,
        scope,
        key,
        data: next,
        error: '',
        loading: false,
        refreshing: false,
      }));
    },
    [scope, key, persist, maxAgeMs, state.data],
  );

  return {
    data: effectiveData,
    error: effectiveError,
    loading: effectiveLoading,
    refreshing:
      state.authority === currentAuthority && state.scope === scope && state.key === key ? state.refreshing : false,
    reload,
    mutate,
  };
}
