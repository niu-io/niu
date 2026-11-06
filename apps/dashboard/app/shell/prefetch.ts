import {
  matchRoutes,
  type ActionFunction,
  type LoaderFunction,
  type RouteObject,
  type ShouldRevalidateFunction,
} from 'react-router';
import { canManagePlatform } from './dashboard-context';
import { getActiveSessionSnapshot, type RouteHandle, type RouterSessionSnapshot } from './router-context';
import { resolveWorkspacePathSegment } from './workspace-route';
import { prefetchGet } from '@/lib/api-client';
import { workspaceKeyPath } from '@/features/keys/api';

export type LazyRouteModule = {
  default: React.ComponentType;
  ErrorBoundary?: React.ComponentType;
  HydrateFallback?: React.ComponentType;
  loader?: LoaderFunction;
  clientLoader?: LoaderFunction;
  action?: ActionFunction;
  clientAction?: ActionFunction;
  shouldRevalidate?: ShouldRevalidateFunction;
  handle?: RouteHandle;
};

type ModuleImporter = () => Promise<LazyRouteModule>;

const importerCache = new Map<string, Promise<LazyRouteModule>>();
const lazyImporterMap = new WeakMap<NonNullable<RouteObject['lazy']>, ModuleImporter>();
let registeredRouteTree: RouteObject[] = [];

export function attachRouteImporter<T extends NonNullable<RouteObject['lazy']>>(
  lazyFn: T,
  importer: ModuleImporter,
): T {
  lazyImporterMap.set(lazyFn, importer);
  return lazyFn;
}

export function registerPrefetchRouteTree(routes: RouteObject[]): RouteObject[] {
  registeredRouteTree = routes;
  return routes;
}

function memoImport(key: string, load: ModuleImporter): ModuleImporter {
  return () => {
    let pending = importerCache.get(key);
    if (!pending) {
      pending = load().catch(error => {
        importerCache.delete(key);
        throw error;
      });
      importerCache.set(key, pending);
    }
    return pending;
  };
}

export const routeImporters = {
  connect: memoImport('connect', () => import('@/features/connect/page')),
  login: memoImport('login', () => import('@/features/login/page')),
  installation: memoImport('installation', () => import('@/features/login/installation-page')),
  invite: memoImport('invite', () => import('@/features/invitations/accept-page')),
  commercialPosition: memoImport('commercialPosition', () => import('@/features/commercial-position/page')),
  platformSettings: memoImport('platformSettings', () => import('@/features/platform-settings/page')),
  customers: memoImport('customers', () => import('@/features/customers/page')),
  retailPricing: memoImport('retailPricing', () => import('@/features/retail-pricing/page')),
  auditLogs: memoImport('auditLogs', () => import('@/features/audit-logs/page')),
  branding: memoImport('branding', () => import('@/features/branding/page')),
  payments: memoImport('payments', () => import('@/features/platform/page')),
  providers: memoImport('providers', () => import('@/features/providers/page')),
  routing: memoImport('routing', () => import('@/features/routing/page')),
  evaluations: memoImport('evaluations', () => import('@/features/evaluations/page')),
  eventSubscriptions: memoImport('eventSubscriptions', () => import('@/features/event-subscriptions/page')),
  routePools: memoImport('routePools', () => import('@/features/route-pools/page')),
  help: memoImport('help', () => import('@/features/help/page')),
  models: memoImport('models', () => import('@/features/models/page')),
  accountSettings: memoImport('accountSettings', () => import('@/features/account/settings-page')),
  globalActivity: memoImport('globalActivity', () => import('@/features/activity/global-page')),
  generationsLayout: memoImport('generationsLayout', () => import('@/features/generations/layout')),
  playground: memoImport('playground', () => import('@/features/playground/page')),
  workspaces: memoImport('workspaces', () => import('@/features/workspace/page')),
  overview: memoImport('overview', () => import('@/features/overview/page')),
  providerMediaTools: memoImport('providerMediaTools', () => import('@/features/provider-modules/page')),
  keysNew: memoImport('keysNew', () => import('@/features/keys/new-page')),
  keyDetail: memoImport('keyDetail', () => import('@/features/keys/detail-page')),
  keys: memoImport('keys', () => import('@/features/keys/page')),
  workspaceSettings: memoImport('workspaceSettings', () => import('@/features/workspace/settings-page')),
  guardrails: memoImport('guardrails', () => import('@/features/guardrails/page')),
  billing: memoImport('billing', () => import('@/features/billing/page')),
  workspaceUsage: memoImport('workspaceUsage', () => import('@/features/activity/page')),
  assets: memoImport('assets', () => import('@/features/assets/page')),
  library: memoImport('library', () => import('@/features/library/page')),
  executions: memoImport('executions', () => import('@/features/executions/page')),
  notFound: memoImport('notFound', () => import('@/features/not-found/page')),
} as const;

function stripBasePath(pathname: string): string {
  const basePrefix = (import.meta.env?.BASE_URL ?? '/').replace(/\/+$/, '');
  if (!basePrefix) return pathname;
  if (pathname === basePrefix) return '/';
  if (pathname.startsWith(`${basePrefix}/`)) return pathname.slice(basePrefix.length);
  return pathname;
}

export function preloadRouteChunk(pathname: string): void {
  const clean = stripBasePath(pathname.split('?')[0].split('#')[0]).replace(/\/+$/, '') || '/';
  if (registeredRouteTree.length > 0) {
    const matches = matchRoutes(registeredRouteTree, clean);
    if (matches) {
      let invoked = false;
      for (const match of matches) {
        const lazyFn = match.route.lazy;
        const importer = lazyFn ? lazyImporterMap.get(lazyFn) : undefined;
        if (importer) {
          invoked = true;
          void importer();
        }
      }
      if (invoked) return;
    }
  }
  const parts = clean.split('/').filter(Boolean);

  if (parts[0] === 'login') { void routeImporters.login(); return; }
  if (parts[0] === 'installation') { void routeImporters.installation(); return; }
  if (parts[0] === 'invite') { void routeImporters.invite(); return; }
  if (parts[0] === 'connect') { void routeImporters.connect(); return; }
  if (parts[0] === 'help') { void routeImporters.help(); return; }
  if (parts[0] === 'models') { void routeImporters.models(); return; }
  if (parts[0] === 'settings') { void routeImporters.accountSettings(); return; }
  if (parts[0] === 'activity') { void routeImporters.globalActivity(); return; }
  if (parts[0] === 'generations' || parts[0] === 'chat') {
    void routeImporters.generationsLayout();
    void routeImporters.playground();
    return;
  }
  if (parts[0] === 'providers' || parts[0] === 'suppliers') {
    void routeImporters.providers();
    return;
  }
  if (parts[0] === 'admin') {
    const sub = parts[1] ?? 'providers';
    if (sub === 'providers' || sub === 'suppliers') void routeImporters.providers();
    else if (sub === 'routing' || sub === 'pools' || sub === 'route-pools' || sub === 'model-pools') void routeImporters.routePools();
    else if (sub === 'customers' || sub === 'balances' || sub === 'customer-accounts' || sub === 'account-balances') void routeImporters.customers();
    else if (sub === 'reports' || sub === 'commercial' || sub === 'financial-reports') void routeImporters.commercialPosition();
    else if (sub === 'pricing') void routeImporters.retailPricing();
    else if (sub === 'payments' || sub === 'payment-gateways') void routeImporters.payments();
    else if (sub === 'branding') void routeImporters.branding();
    else if (sub === 'audit' || sub === 'audit-logs') void routeImporters.auditLogs();
    else if (sub === 'settings') void routeImporters.platformSettings();
    return;
  }
  if (parts[0] === 'workspaces') {
    if (parts.length === 1) { void routeImporters.workspaces(); return; }
    const section = parts[2] ?? '';
    if (!section) void routeImporters.overview();
    else if (section === 'routing') void routeImporters.routing();
    else if (section === 'events') void routeImporters.eventSubscriptions();
    else if (section === 'evaluations') void routeImporters.evaluations();
    else if (section === 'keys') {
      if (parts[3] === 'new') void routeImporters.keysNew();
      else if (parts[3]) void routeImporters.keyDetail();
      else void routeImporters.keys();
    } else if (section === 'usage' || section === 'activity') void routeImporters.workspaceUsage();
    else if (section === 'executions') void routeImporters.executions();
    else if (section === 'billing' || section === 'costs') void routeImporters.billing();
    else if (section === 'guardrails') void routeImporters.guardrails();
    else if (section === 'users' || section === 'organization') void routeImporters.accountSettings();
    else if (section === 'settings') void routeImporters.workspaceSettings();
    else if (section === 'assets') void routeImporters.assets();
    else if (section === 'library') void routeImporters.library();
    else if (section === 'video') void routeImporters.providerMediaTools();
  }
}

function resolveTargetWorkspace(pathname: string, search: string, snapshot: RouterSessionSnapshot) {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] === 'workspaces' && parts[1] && parts[1] !== 'default') {
    return resolveWorkspacePathSegment(decodeURIComponent(parts[1]), snapshot.workspaces) ?? snapshot.activeWorkspace;
  }
  const wsParam = new URLSearchParams(search).get('workspace');
  if (wsParam && wsParam !== 'default') {
    return resolveWorkspacePathSegment(wsParam, snapshot.workspaces) ?? snapshot.activeWorkspace;
  }
  return snapshot.activeWorkspace ?? snapshot.workspaces[0] ?? null;
}

export function prefetchRouteData(
  pathname: string,
  search = '',
  snapshot: RouterSessionSnapshot = getActiveSessionSnapshot(),
): void {
  const { token, session } = snapshot;
  if (!token) return;
  const clean = stripBasePath(pathname.split('?')[0].split('#')[0]).replace(/\/+$/, '') || '/';
  const parts = clean.split('/').filter(Boolean);
  const ws = resolveTargetWorkspace(clean, search, snapshot);

  const settingsModal = new URLSearchParams(search).get('settings');
  if (settingsModal || parts[0] === 'settings') {
    const section = settingsModal || parts[1] || 'account';
    const orgId = ws?.organization_id ?? session?.operator?.organization_id ?? snapshot.organizations[0]?.id;
    if (section === 'account') {
      if (session?.kind !== 'installation') {
        prefetchGet(token, '/api/v1/auth/profile');
      }
      prefetchGet('', '/api/v1/auth/config');
    } else if ((section === 'billing' || section === 'payments') && orgId) {
      prefetchGet(token, `/api/v1/organizations/${orgId}/billing/balance`);
      prefetchGet(token, `/api/v1/organizations/${orgId}/billing/transactions`);
    } else if (section === 'members') {
      prefetchGet(token, '/api/v1/organizations');
      prefetchGet(token, '/api/v1/operators?limit=1000');
      if (orgId) prefetchGet(token, `/api/v1/organizations/${orgId}/projects`);
    } else if (section === 'organization') {
      prefetchGet(token, '/api/v1/organizations');
      prefetchGet(token, '/api/v1/workspaces', { persist: true });
    }
    if (parts[0] === 'settings') return;
  }

  if (parts[0] === 'models') {
    if (ws) {
      const q = `?organization_id=${encodeURIComponent(ws.organization_id)}&project_id=${encodeURIComponent(ws.id)}`;
      prefetchGet(token, `/api/v1/models${q}`, { persist: true });
    }
    return;
  }

  if (parts[0] === 'activity') {
    prefetchGet(token, '/api/v1/workspaces', { persist: true });
    if (ws) {
      prefetchGet(token, `/api/v1/organizations/${ws.organization_id}/projects/${ws.id}/requests?limit=100`);
      prefetchGet(token, workspaceKeyPath(ws.id));
    }
    return;
  }

  if (parts[0] === 'generations') {
    if (ws) {
      prefetchGet(token, workspaceKeyPath(ws.id));
      const q = `?organization_id=${encodeURIComponent(ws.organization_id)}&project_id=${encodeURIComponent(ws.id)}`;
      prefetchGet(token, `/api/v1/models${q}`, { persist: true });
    }
    return;
  }

  if (parts[0] === 'admin' && canManagePlatform(session)) {
    const sub = parts[1] ?? 'providers';
    if (sub === 'providers') {
      prefetchGet(token, '/api/v1/providers', { persist: true });
      prefetchGet(token, '/api/v1/vendors');
    } else if (sub === 'customers' || sub === 'balances') {
      prefetchGet(token, '/api/v1/platform/customer-accounts?limit=50');
    } else if (sub === 'routing') {
      prefetchGet(token, '/api/v1/routing/index?limit=50');
    } else if (sub === 'pricing') {
      prefetchGet(token, '/api/v1/pricing/standard-prices?limit=50');
      prefetchGet(token, '/api/v1/platform/units');
      prefetchGet(token, '/api/v1/platform/units/media/tariffs');
    } else if (sub === 'payments') {
      prefetchGet(token, '/api/v1/platform/configuration');
      prefetchGet(token, '/api/v1/platform/payments/epay');
      prefetchGet(token, '/api/v1/platform/payments/mock');
    } else if (sub === 'branding') {
      prefetchGet(token, '/api/v1/platform/branding');
    } else if (sub === 'settings') {
      prefetchGet(token, '/api/v1/platform/units');
    } else if (sub === 'audit') {
      prefetchGet(token, '/api/v1/platform/audit-events?limit=50');
    }
    return;
  }

  if (parts[0] === 'workspaces') {
    if (parts.length === 1) {
      prefetchGet(token, '/api/v1/workspaces', { persist: true });
      return;
    }
    if (!ws) return;
    const section = parts[2] ?? '';
    if (!section) {
      prefetchGet(token, `/api/v1/organizations/${ws.organization_id}/projects/${ws.id}/requests?limit=10`);
    } else if (section === 'keys') {
      prefetchGet(token, workspaceKeyPath(ws.id));
      if (parts[3] && parts[3] !== 'new') {
        prefetchGet(token, `/api/v1/organizations/${ws.organization_id}/projects/${ws.id}/requests?limit=10`);
        prefetchGet(token, `/api/v1/organizations/${ws.organization_id}/projects/${ws.id}/guardrails`);
      } else {
        prefetchGet(token, `/api/v1/organizations/${ws.organization_id}/projects/${ws.id}/requests?limit=100`);
      }
    } else if (section === 'usage' || section === 'executions') {
      prefetchGet(token, `/api/v1/organizations/${ws.organization_id}/projects/${ws.id}/requests?limit=100`);
      prefetchGet(token, workspaceKeyPath(ws.id));
    } else if (section === 'billing') {
      prefetchGet(token, `/api/v1/organizations/${ws.organization_id}/projects/${ws.id}/billing`);
      prefetchGet(token, `/api/v1/organizations/${ws.organization_id}/projects/${ws.id}/spending-limit`);
    } else if (section === 'guardrails') {
      prefetchGet(token, `/api/v1/organizations/${ws.organization_id}/projects/${ws.id}/guardrails`);
    } else if (section === 'users') {
      prefetchGet(token, '/api/v1/organizations');
      prefetchGet(token, '/api/v1/operators?limit=1000');
    } else if (section === 'routing') {
      prefetchGet(token, `/api/v1/workspaces/${encodeURIComponent(ws.id)}/routing`);
    } else if (section === 'evaluations') {
      prefetchGet(token, `/api/v1/workspaces/${encodeURIComponent(ws.id)}/evaluations`);
    } else if (section === 'events') {
      prefetchGet(token, `/api/v1/workspaces/${encodeURIComponent(ws.id)}/events`);
    }
  }
}

export function prefetchRouteIntent(to: string | { pathname?: string; search?: string }): void {
  let pathname = '';
  let search = '';
  if (typeof to === 'string') {
    const [rawPath, rawSearch = ''] = to.split('?');
    pathname = rawPath;
    search = rawSearch ? `?${rawSearch.split('#')[0]}` : '';
  } else {
    pathname = to.pathname ?? '';
    search = to.search ?? '';
  }
  if (!pathname) return;
  preloadRouteChunk(pathname);
  if (import.meta.env.MODE === 'test') return;
  prefetchRouteData(pathname, search);
}

let lastWarmupScope = '';

export function scheduleWorkspaceWarmup(snapshot: RouterSessionSnapshot): () => void {
  if (import.meta.env.MODE === 'test') return () => {};
  const ws = snapshot.activeWorkspace;
  if (!snapshot.token || !ws) return () => {};
  const scopeKey = `${snapshot.authorityKey || snapshot.token}:${ws.id}`;
  if (lastWarmupScope === scopeKey) return () => {};
  lastWarmupScope = scopeKey;

  let cancelled = false;
  const run = () => {
    if (cancelled) return;
    // Warm top-frequency sibling route chunks & data in background idle time.
    preloadRouteChunk('/workspaces/default');
    preloadRouteChunk('/workspaces/default/keys');
    preloadRouteChunk('/workspaces/default/usage');
    preloadRouteChunk('/workspaces/default/executions');
    preloadRouteChunk('/workspaces/default/billing');
    preloadRouteChunk('/workspaces/default/guardrails');
    preloadRouteChunk('/workspaces/default/routing');
    preloadRouteChunk('/models');
    preloadRouteChunk('/generations');
    preloadRouteChunk('/activity');

    prefetchGet(snapshot.token, `/api/v1/organizations/${ws.organization_id}/projects/${ws.id}/requests?limit=10`);
    prefetchGet(snapshot.token, `/api/v1/organizations/${ws.organization_id}/projects/${ws.id}/requests?limit=100`);
    prefetchGet(snapshot.token, workspaceKeyPath(ws.id));
    if (canManagePlatform(snapshot.session)) {
      preloadRouteChunk('/admin/providers');
      preloadRouteChunk('/admin/reports');
      prefetchGet(snapshot.token, '/api/v1/providers', { persist: true });
    }
  };

  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    const id = window.requestIdleCallback(run, { timeout: 1200 });
    return () => {
      cancelled = true;
      window.cancelIdleCallback(id);
    };
  }
  const timer = globalThis.setTimeout(run, 180);
  return () => {
    cancelled = true;
    globalThis.clearTimeout(timer);
  };
}
