import { useContext, useEffect, useState } from 'react';
import {
  useLoaderData,
  useRouteLoaderData,
  type LoaderFunctionArgs,
  type Params,
  type ShouldRevalidateFunction,
} from 'react-router';
import { request } from './api-client';
import {
  fetchQuery,
  isAbortError,
  isQueryFresh,
  isQueryInvalidated,
  peekQuery,
  prefetchQuery,
} from './query-cache';
import type { Workspace } from '@/shell/dashboard-context';
import {
  DataRouterPresenceContext,
  readRouterSessionSnapshot,
  type RouterSessionSnapshot,
} from '@/shell/router-context';
import { resolveWorkspacePathSegment } from '@/shell/workspace-route';

export type RouteLoaderSnapshot<T = unknown> =
  | {
      status: 'ready';
      authorityKey: string;
      workspaceId: string | null;
      endpoint: string;
      data: T;
      source: 'cache' | 'network';
    }
  | {
      status: 'pending';
      authorityKey: string;
      workspaceId: string | null;
      endpoint: string;
      promise: Promise<T>;
    }
  | {
      status: 'deferred';
      reason: 'unauthenticated' | 'workspace-pending' | 'unauthorized' | 'inline-error';
      authorityKey: string;
      workspaceId: string | null;
      endpoint: string | null;
      error?: string;
    };

export type RouteLoadPlan<T> = {
  endpoint: string | null;
  persist?: boolean;
  authorized?: boolean;
  throwOnError?: boolean;
  fetcher?: (signal: AbortSignal, snapshot: RouterSessionSnapshot) => Promise<T>;
};

type ActiveRouteLoad = {
  authorityKey: string;
  endpoint: string;
  pathname: string;
  controller: AbortController;
};

/**
 * Keyed by endpoint so concurrent matched parent/child route loaders on the same navigation
 * never abort each other (niu-wnr.11), while navigating to a new pathname or authority aborts
 * superseded loads cleanly.
 */
const activeRouteLoads = new Map<string, ActiveRouteLoad>();

function normalizePath(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

function pruneSupersededLoads(cleanPath: string, authorityKey: string): void {
  for (const [key, entry] of activeRouteLoads.entries()) {
    if (entry.authorityKey !== authorityKey || entry.pathname !== cleanPath) {
      entry.controller.abort();
      activeRouteLoads.delete(key);
    } else if (entry.controller.signal.aborted) {
      activeRouteLoads.delete(key);
    }
  }
}

function acquireRouteLoadSignal(
  authorityKey: string,
  endpoint: string,
  pathname: string,
  requestSignal: AbortSignal,
): AbortSignal {
  const cleanPath = normalizePath(pathname);
  pruneSupersededLoads(cleanPath, authorityKey);

  const existing = activeRouteLoads.get(endpoint);
  let current: ActiveRouteLoad;
  if (
    existing &&
    existing.authorityKey === authorityKey &&
    existing.endpoint === endpoint &&
    !existing.controller.signal.aborted
  ) {
    existing.pathname = cleanPath;
    current = existing;
  } else {
    existing?.controller.abort();
    current = {
      authorityKey,
      endpoint,
      pathname: cleanPath,
      controller: new AbortController(),
    };
    activeRouteLoads.set(endpoint, current);
  }

  if (requestSignal.aborted) {
    current.controller.abort();
    activeRouteLoads.delete(endpoint);
  } else {
    requestSignal.addEventListener(
      'abort',
      () => {
        current.controller.abort();
        if (activeRouteLoads.get(endpoint) === current) {
          activeRouteLoads.delete(endpoint);
        }
      },
      { once: true },
    );
  }
  return current.controller.signal;
}

export function reconcileActiveRouteLoad(pathname: string, authorityKey: string): void {
  pruneSupersededLoads(normalizePath(pathname), authorityKey);
}

export function resetActiveRouteLoads(): void {
  for (const entry of activeRouteLoads.values()) {
    entry.controller.abort();
  }
  activeRouteLoads.clear();
}

export function resolveRouteWorkspace(
  req: Request,
  params: Params,
  snapshot: RouterSessionSnapshot,
): Workspace | null {
  if (params.workspace && params.workspace !== 'default') {
    return resolveWorkspacePathSegment(params.workspace, snapshot.workspaces) ?? null;
  }
  const wsParam = new URL(req.url).searchParams.get('workspace');
  if (wsParam && wsParam !== 'default') {
    return resolveWorkspacePathSegment(wsParam, snapshot.workspaces) ?? null;
  }
  return snapshot.activeWorkspace ?? snapshot.workspaces[0] ?? null;
}

/**
 * Execute a critical route read governed by React Router v8 Data Mode's `dashboardRouterContext`
 * and route-navigation cancellation, backed by the authority-isolated, generation-clocked SWR query cache.
 */
export function loadCriticalRouteEndpoint<T = unknown>(
  args: LoaderFunctionArgs,
  buildPlan: (ctx: {
    snapshot: RouterSessionSnapshot;
    workspace: Workspace | null;
    url: URL;
    params: Params;
  }) => RouteLoadPlan<T> | string | null,
): RouteLoaderSnapshot<T> | Promise<RouteLoaderSnapshot<T>> {
  const snapshot = readRouterSessionSnapshot(args.context);
  if (!snapshot.token || !snapshot.authorityKey) {
    resetActiveRouteLoads();
    return {
      status: 'deferred',
      reason: 'unauthenticated',
      authorityKey: '',
      workspaceId: null,
      endpoint: null,
    };
  }

  const url = new URL(args.request.url);
  const workspace = resolveRouteWorkspace(args.request, args.params, snapshot);
  const rawPlan = buildPlan({ snapshot, workspace, url, params: args.params });
  const plan: RouteLoadPlan<T> =
    typeof rawPlan === 'string' || rawPlan === null ? { endpoint: rawPlan } : rawPlan;

  if (plan.authorized === false) {
    return {
      status: 'deferred',
      reason: 'unauthorized',
      authorityKey: snapshot.authorityKey,
      workspaceId: workspace?.id ?? null,
      endpoint: null,
    };
  }

  if (!plan.endpoint) {
    return {
      status: 'deferred',
      reason: 'workspace-pending',
      authorityKey: snapshot.authorityKey,
      workspaceId: workspace?.id ?? null,
      endpoint: null,
    };
  }

  const endpoint = plan.endpoint;
  const fetcher = plan.fetcher
    ? (signal: AbortSignal) => plan.fetcher!(signal, snapshot)
    : (signal: AbortSignal) => request<T>(snapshot.token, endpoint, 'GET', undefined, signal);

  const invalidated = isQueryInvalidated(snapshot.token, endpoint);
  const cached = peekQuery<T>(snapshot.token, endpoint, { persist: plan.persist });
  if (cached !== undefined && !invalidated) {
    reconcileActiveRouteLoad(url.pathname, snapshot.authorityKey);
    if (!isQueryFresh(snapshot.token, endpoint)) {
      prefetchQuery<T>(snapshot.token, endpoint, fetcher, { persist: plan.persist });
    }
    return {
      status: 'ready',
      authorityKey: snapshot.authorityKey,
      workspaceId: workspace?.id ?? null,
      endpoint,
      data: cached,
      source: 'cache',
    };
  }

  const navSignal = acquireRouteLoadSignal(
    snapshot.authorityKey,
    endpoint,
    url.pathname,
    args.request.signal,
  );

  // Cold cache misses return a non-blocking deferred snapshot so target route skeletons render on Frame 0
  // while the deduplicated in-flight request remains strictly bound to route-navigation cancellation.
  if (!invalidated && !plan.throwOnError) {
    const promise = fetchQuery<T>(snapshot.token, endpoint, fetcher, {
      persist: plan.persist,
      awaitRevalidate: true,
      signal: navSignal,
    });
    void promise.catch(() => {
      /* Handled by mounted route consumers or cancelled on navigation supersede. */
    });
    return {
      status: 'pending',
      authorityKey: snapshot.authorityKey,
      workspaceId: workspace?.id ?? null,
      endpoint,
      promise,
    };
  }

  return (async (): Promise<RouteLoaderSnapshot<T>> => {
    try {
      const data = await fetchQuery<T>(snapshot.token, endpoint, fetcher, {
        persist: plan.persist,
        awaitRevalidate: true,
        signal: navSignal,
      });
      return {
        status: 'ready',
        authorityKey: snapshot.authorityKey,
        workspaceId: workspace?.id ?? null,
        endpoint,
        data,
        source: 'network',
      };
    } catch (error) {
      if (isAbortError(error) || navSignal.aborted || args.request.signal.aborted) {
        throw error;
      }
      if (plan.throwOnError) {
        throw error;
      }
      return {
        status: 'deferred',
        reason: 'inline-error',
        authorityKey: snapshot.authorityKey,
        workspaceId: workspace?.id ?? null,
        endpoint,
        error: error instanceof Error ? error.message : 'Request failed.',
      };
    }
  })();
}

function stripTransientParams(url: URL): string {
  const search = new URLSearchParams(url.search);
  search.delete('settings');
  search.sort();
  const query = search.toString();
  return `${url.pathname.replace(/\/+$/, '') || '/'}${query ? `?${query}` : ''}`;
}

export const routeShouldRevalidate: ShouldRevalidateFunction = ({
  currentUrl,
  nextUrl,
  formMethod,
  defaultShouldRevalidate,
}) => {
  if (formMethod && formMethod.toUpperCase() !== 'GET') {
    return defaultShouldRevalidate;
  }
  const curr = stripTransientParams(currentUrl);
  const next = stripTransientParams(nextUrl);
  if (curr === next) {
    if (currentUrl.hash !== nextUrl.hash || currentUrl.search !== nextUrl.search) {
      return false;
    }
    return defaultShouldRevalidate;
  }
  return true;
};

/**
 * Read the route's Data Mode loader snapshot when mounted inside `<RouterProvider>`,
 * returning `undefined` safely when a route component is rendered standalone inside declarative `<MemoryRouter>` unit tests.
 * Also subscribes to `pending` loader promises so resolved loader data triggers a state update (`niu-wnr.4`).
 */
export function useOptionalRouteLoaderData<T = unknown>(routeId?: string): RouteLoaderSnapshot<T> | undefined {
  const inAppDataRouter = useContext(DataRouterPresenceContext);
  let rawSnapshot: RouteLoaderSnapshot<T> | undefined;
  try {
    rawSnapshot = (routeId ? useRouteLoaderData(routeId) : useLoaderData()) as
      | RouteLoaderSnapshot<T>
      | undefined;
  } catch {
    if (inAppDataRouter) {
      rawSnapshot = undefined;
    }
  }

  const [resolvedSnapshot, setResolvedSnapshot] = useState<RouteLoaderSnapshot<T> | undefined>(undefined);

  useEffect(() => {
    if (!rawSnapshot || rawSnapshot.status !== 'pending') {
      setResolvedSnapshot(undefined);
      return;
    }
    let cancelled = false;
    const pendingSnapshot = rawSnapshot;
    void pendingSnapshot.promise
      .then(data => {
        if (cancelled) return;
        setResolvedSnapshot({
          status: 'ready',
          authorityKey: pendingSnapshot.authorityKey,
          workspaceId: pendingSnapshot.workspaceId,
          endpoint: pendingSnapshot.endpoint,
          data,
          source: 'network',
        });
      })
      .catch(() => {
        /* Error state is surfaced by the route query or error boundary. */
      });
    return () => {
      cancelled = true;
    };
  }, [rawSnapshot]);

  if (
    rawSnapshot?.status === 'pending' &&
    resolvedSnapshot?.status === 'ready' &&
    resolvedSnapshot.endpoint === rawSnapshot.endpoint &&
    resolvedSnapshot.authorityKey === rawSnapshot.authorityKey
  ) {
    return resolvedSnapshot;
  }

  return rawSnapshot;
}
