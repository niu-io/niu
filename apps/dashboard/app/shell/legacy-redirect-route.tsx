import {
  Navigate,
  redirect,
  useLocation,
  useParams,
  type LoaderFunctionArgs,
  type Params,
} from 'react-router';
import { readRouterSessionSnapshot } from './router-context';
import { workspacePathSegment } from './workspace-route';

export function resolveModelsRedirectTarget(
  modelParam: string | undefined,
  search: string,
  hash: string,
  context?: unknown,
): string {
  const query = new URLSearchParams(search);
  const explicitWorkspace = query.get('workspace')?.trim();
  query.delete('workspace');
  const snapshot = readRouterSessionSnapshot(context);
  const fallbackWs = snapshot.activeWorkspace ?? snapshot.workspaces[0] ?? null;
  const wsSegment =
    explicitWorkspace ||
    (fallbackWs ? workspacePathSegment(fallbackWs, snapshot.workspaces) : 'default');
  const cleanModel = (modelParam ?? '').replace(/^\/+|\/+$/g, '');
  const modelSuffix = cleanModel ? `/${cleanModel}` : '';
  return `/workspaces/${encodeURIComponent(wsSegment)}/models${modelSuffix}${query.size ? `?${query.toString()}` : ''}${hash}`;
}

let activeNavigationHash = '';

export function setActiveNavigationHash(hash: string): void {
  activeNavigationHash = hash;
}

export function getActiveNavigationHash(): string {
  return activeNavigationHash;
}

export function providerSectionPath(section: string): string {
  return section === 'configuration' || section === 'api-keys' || section === 'connections'
    ? 'keys'
    : section === 'consumption'
      ? 'usage'
      : section === 'offers'
        ? 'models'
        : section === 'members'
          ? ''
          : section;
}

const ADMIN_PROVIDER_STATIC_SECTIONS = new Set([
  'overview',
  'models',
  'offers',
  'usage',
  'consumption',
  'settlements',
  'members',
  'keys',
  'connections',
  'api-keys',
  'configuration',
  'settings',
]);

function stripBasePath(pathname: string): string {
  const basePrefix = (import.meta.env?.BASE_URL ?? '/').replace(/\/+$/, '');
  if (!basePrefix) return pathname;
  if (pathname === basePrefix) return '/';
  if (pathname.startsWith(`${basePrefix}/`)) return pathname.slice(basePrefix.length);
  return pathname;
}

export function resolveLegacyRedirectTarget(
  pathname: string,
  search: string,
  hash: string,
  params: Params<string>,
  context?: unknown,
): string {
  const clean = stripBasePath(pathname).replace(/\/+$/, '') || '/';
  const suffix = `${search}${hash}`;
  const parts = clean.split('/').filter(Boolean);

  if (clean === '/') {
    return `/workspaces/default/${suffix}`;
  }
  if (clean === '/chat') {
    return `/generations${suffix}`;
  }
  if (parts[0] === 'models') {
    const model = params['*'] ?? parts.slice(1).join('/');
    return resolveModelsRedirectTarget(model, search, hash, context);
  }

  if (
    clean === '/providers' ||
    clean === '/providers/configuration' ||
    clean === '/providers/manage/members' ||
    clean === '/suppliers' ||
    clean === '/admin/suppliers' ||
    clean === '/supplier-accounts'
  ) {
    return `/admin/providers${suffix}`;
  }

  if (
    parts.length === 3 &&
    (parts[0] === 'providers' || parts[0] === 'suppliers' || parts[0] === 'supplier-accounts') &&
    parts[1] === 'manage'
  ) {
    const next = providerSectionPath(decodeURIComponent(parts[2]));
    return `/admin/providers${next ? `/${next}` : ''}${suffix}`;
  }

  if (
    parts.length === 3 &&
    (parts[0] === 'providers' || parts[0] === 'suppliers') &&
    parts[2] === 'consumption'
  ) {
    const target = params.provider ?? params.supplier ?? decodeURIComponent(parts[1]);
    return `/providers/${encodeURIComponent(target)}/usage${suffix}`;
  }

  if (parts[0] === 'supplier-accounts' && parts.length >= 2) {
    const target = params.provider ?? decodeURIComponent(parts[1]);
    const sec = params.section ?? (parts[2] ? decodeURIComponent(parts[2]) : '');
    const mapped = sec ? providerSectionPath(sec) : '';
    const secSuffix = mapped ? `/${mapped}` : '';
    return `/providers/${encodeURIComponent(target)}${secSuffix}${suffix}`;
  }

  if ((parts[0] === 'providers' || parts[0] === 'suppliers') && parts.length >= 2) {
    const target = params.provider ?? params.supplier ?? decodeURIComponent(parts[1]);
    const sec = params.section ?? (parts[2] ? decodeURIComponent(parts[2]) : '');
    const mapped = sec ? providerSectionPath(sec) : '';
    const secSuffix = mapped ? `/${mapped}` : '';
    return `/admin/providers/${encodeURIComponent(target)}${secSuffix}${suffix}`;
  }

  if (parts[0] === 'admin') {
    if (parts.length === 1) return `/admin/providers${suffix}`;
    const sub = parts[1];
    if (sub === 'registrations' || (sub === 'settings' && parts[2] === 'registration')) {
      const queue = sub === 'registrations';
      const query = new URLSearchParams(search);
      query.set('tab', queue ? 'registrations' : 'registration');
      return `/admin/${queue ? 'customers' : 'settings'}?${query.toString()}${hash}`;
    }
    if (sub === 'commercial' || sub === 'financial-reports') return `/admin/reports${suffix}`;
    if (sub === 'balances' || sub === 'customer-accounts' || sub === 'account-balances') return `/admin/customers${suffix}`;
    if (sub === 'route-pools' || sub === 'model-pools' || sub === 'pools') return `/admin/routing${suffix}`;
    if (sub === 'payment-gateways') return `/admin/payments${suffix}`;
    if (sub === 'audit-logs') return `/admin/audit${suffix}`;
    if (sub === 'authentication' || sub === 'oauth') return `/admin/settings${suffix}`;

    if (
      parts.length === 3 &&
      (sub === 'providers' || sub === 'suppliers') &&
      ADMIN_PROVIDER_STATIC_SECTIONS.has(parts[2]) &&
      !params.providerId &&
      !params.supplierId
    ) {
      const section = parts[2];
      const sp = new URLSearchParams(search);
      const provider = sp.get('provider') ?? sp.get('supplier');
      sp.delete('provider');
      sp.delete('supplier');
      if (section === 'offers' && provider && !sp.has('view')) {
        sp.set('view', 'text');
      }
      const nextSection = section === 'offers' ? 'models' : providerSectionPath(section);
      return `${
        provider
          ? `/admin/providers/${encodeURIComponent(provider)}${nextSection ? `/${nextSection}` : ''}`
          : '/admin/providers'
      }${sp.size ? '?' + sp.toString() : ''}${hash}`;
    }

    if (sub === 'providers' && parts.length === 4) {
      const providerId = params.providerId ?? decodeURIComponent(parts[2]);
      const actionSec = parts[3];
      if (actionSec === 'members') {
        return `/admin/providers/${encodeURIComponent(providerId)}${suffix}`;
      }
      if (actionSec === 'offers') {
        const sp = new URLSearchParams(search);
        if (!sp.has('view')) sp.set('view', 'text');
        return `/admin/providers/${encodeURIComponent(providerId)}/models${sp.size ? '?' + sp.toString() : ''}${hash}`;
      }
      if (actionSec === 'api-keys' || actionSec === 'configuration' || actionSec === 'connections') {
        return `/admin/providers/${encodeURIComponent(providerId)}/keys${suffix}`;
      }
      if (actionSec === 'consumption') {
        return `/admin/providers/${encodeURIComponent(providerId)}/usage${suffix}`;
      }
    }

    if (sub === 'suppliers' && parts.length >= 3) {
      const supplierId = params.supplierId ?? decodeURIComponent(parts[2]);
      const sec = params.section ?? (parts[3] ? decodeURIComponent(parts[3]) : '');
      const mapped = sec ? providerSectionPath(sec) : '';
      const secSuffix = mapped ? `/${mapped}` : '';
      return `/admin/providers/${encodeURIComponent(supplierId)}${secSuffix}${suffix}`;
    }
  }

  if (parts[0] === 'workspaces' && parts.length >= 3) {
    const ws = params.workspace ?? decodeURIComponent(parts[1]);
    const section = parts[2];
    if (section === 'providers-admin' || section === 'vendors') {
      return `/admin/providers${suffix}`;
    }
    if (section === 'provider-capabilities' || section === 'video') {
      const merged = new URLSearchParams('tab=materials');
      const incoming = new URLSearchParams(search);
      incoming.forEach((value, key) => merged.set(key, value));
      const queryStr = merged.toString();
      return `/workspaces/${encodeURIComponent(ws)}/assets${queryStr ? `?${queryStr}` : ''}${hash}`;
    }
    if (section === 'library') {
      return `/workspaces/${encodeURIComponent(ws)}/assets${suffix}`;
    }
    if (section === 'playground') {
      const sp = new URLSearchParams(search);
      if (ws) sp.set('workspace', ws);
      return `/generations${sp.size ? `?${sp.toString()}` : ''}${hash}`;
    }
    if (section === 'activity' || section === 'subscriptions') {
      return `/workspaces/${encodeURIComponent(ws)}/usage${suffix}`;
    }
    if (section === 'costs') {
      return `/workspaces/${encodeURIComponent(ws)}/billing${suffix}`;
    }
    if (section === 'pools') {
      const slug = params.slug ?? (parts[3] ? decodeURIComponent(parts[3]) : '');
      const slugSuffix = slug ? `/${encodeURIComponent(slug)}` : '';
      return `/workspaces/${encodeURIComponent(ws)}/routing${slugSuffix}${suffix}`;
    }
    if (section === 'members') {
      const sp = new URLSearchParams(search);
      sp.set('workspace', ws);
      return `/settings/members?${sp.toString()}${hash}`;
    }
  }

  return `/workspaces/default/${suffix}`;
}

export function shouldDeferLegacyRedirect(
  request: Request,
  context?: LoaderFunctionArgs['context'],
): boolean {
  const url = new URL(request.url, 'http://localhost');
  const clean = stripBasePath(url.pathname).replace(/\/+$/, '') || '/';
  if (clean === '/') return false;
  if ((clean === '/models' || clean.startsWith('/models/')) && new URLSearchParams(url.search).get('workspace')?.trim()) {
    return false;
  }
  const snapshot = readRouterSessionSnapshot(context);
  return !snapshot.token || snapshot.workspaces.length === 0;
}

export function clientLoader({ request, params, context }: LoaderFunctionArgs) {
  if (shouldDeferLegacyRedirect(request, context)) {
    return null;
  }
  const url = new URL(request.url, 'http://localhost');
  const hash =
    url.hash ||
    activeNavigationHash ||
    (typeof window !== 'undefined' ? window.location.hash : '');
  return redirect(resolveLegacyRedirectTarget(url.pathname, url.search, hash, params, context));
}

export default function LegacyRedirectRoute() {
  const location = useLocation();
  const params = useParams();
  const target = resolveLegacyRedirectTarget(location.pathname, location.search, location.hash, params);
  return <Navigate to={target} replace />;
}
