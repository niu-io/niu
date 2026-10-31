import { useContext } from 'react';
import {
  UNSAFE_DataRouterDataContext,
  useLoaderData,
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
import { readRouterSessionSnapshot, type RouterSessionSnapshot } from '@/shell/router-context';
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

let activeRouteLoad: ActiveRouteLoad | null = null;

function normalizePath(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

function acquireRouteLoadSignal(
  authorityKey: string,
  endpoint: string,
  pathname: string,
  requestSignal: AbortSignal,
): AbortSignal {
  const cleanPath = normalizePath(pathname);
  if (
    activeRouteLoad &&
    activeRouteLoad.authorityKey === authorityKey &&
    activeRouteLoad.endpoint === endpoint &&
    !activeRouteLoad.controller.signal.aborted
  ) {
    activeRouteLoad.pathname = cleanPath;
  } else {
    activeRouteLoad?.controller.abort();
    activeRouteLoad = {
      authorityKey,
      endpoint,
      pathname: cleanPath,
      controller: new AbortController(),
    };
  }
  const current = activeRouteLoad;
  if (requestSignal.aborted) {
    current.controller.abort();
  } else {
    requestSignal.addEventListener('abort', () => current.controller.abort(), { once: true });
  }
  return current.controller.signal;
}

export function reconcileActiveRouteLoad(pathname: string, authorityKey: string): void {
  if (!activeRouteLoad) return;
  if (
    activeRouteLoad.authorityKey !== authorityKey ||
    activeRouteLoad.pathname !== normalizePath(pathname)
  ) {
    activeRouteLoad.controller.abort();
    activeRouteLoad = null;
  }
}

export function resetActiveRouteLoads(): void {
  activeRouteLoad?.controller.abort();
  activeRouteLoad = null;
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
 *
 * - Authenticated warm-cache hits return `{ status: 'ready' }` synchronously on Frame 0
 *   (and trigger silent background SWR when aged).
 * - Post-mutation revalidations of explicitly invalidated entries (`isQueryInvalidated`) await
 *   `fetchQuery` so `useLoaderData()` receives fresh post-mutation data.
 * - Cold-cache navigations start a deduplicated `fetchQuery` bound to the active route-navigation
 *   `AbortSignal` and return `{ status: 'pending', promise }` immediately so 1:1 route skeletons
 *   render without trapping transitions, while slow superseded navigations abort cleanly.
 */
export function loadCriticalRouteEndpoint<T = unknown>(
  args: LoaderFunctionArgs,
  buildPlan: (ctx: {
    snapshot: RouterSessionSnapshot;
    workspace: Workspace | null;
    url: URL;
    params: Params;
  }) => RouteLoadPlan<T>,
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
  const plan = buildPlan({ snapshot, workspace, url, params: args.params });

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
 */
export function useOptionalRouteLoaderData<T = unknown>(): RouteLoaderSnapshot<T> | undefined {
  const dataRouterContext = useContext(UNSAFE_DataRouterDataContext);
  if (!dataRouterContext) return undefined;
  return useLoaderData() as RouteLoaderSnapshot<T> | undefined;
}
