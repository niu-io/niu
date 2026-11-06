import {
  Navigate,
  redirect,
  useLocation,
  useParams,
  type LoaderFunctionArgs,
} from 'react-router';
import {
  getActiveNavigationHash,
  providerSectionPath,
  shouldDeferLegacyRedirect,
} from './legacy-redirect-route';

/**
 * Components and loaders for retired dashboard paths. Each entry keeps the
 * canonical target, query and anchor behaviour that predates the move to the
 * domain route modules.
 */

function parseRequestUrl(request: Request): URL {
  return new URL(request.url, 'http://localhost');
}

export function requestSuffix(request: Request): string {
  const url = parseRequestUrl(request);
  const hash =
    url.hash ||
    getActiveNavigationHash() ||
    (typeof window !== 'undefined' ? window.location.hash : '');
  return `${url.search}${hash}`;
}

export function LegacyProviderPortalRedirect() {
  const { provider, supplier, section } = useParams();
  const location = useLocation();
  const suffix = section ? `/${providerSectionPath(section)}` : '';
  return (
    <Navigate
      replace
      to={`/admin/providers/${encodeURIComponent(provider ?? supplier ?? '')}${suffix}${location.search}${location.hash}`}
    />
  );
}

export function legacyProviderPortalLoader({ request, params, context }: LoaderFunctionArgs) {
  if (shouldDeferLegacyRedirect(request, context)) return null;
  const target = params.provider ?? params.supplier ?? '';
  const suffix = params.section ? `/${providerSectionPath(params.section)}` : '';
  return redirect(`/admin/providers/${encodeURIComponent(target)}${suffix}${requestSuffix(request)}`);
}

export function LegacyProviderDetailSectionRedirect() {
  const { provider, supplier } = useParams();
  const location = useLocation();
  return (
    <Navigate
      replace
      to={`/providers/${encodeURIComponent(provider ?? supplier ?? '')}/usage${location.search}${location.hash}`}
    />
  );
}

export function legacyProviderDetailSectionLoader({ request, params, context }: LoaderFunctionArgs) {
  if (shouldDeferLegacyRedirect(request, context)) return null;
  const target = params.provider ?? params.supplier ?? '';
  return redirect(`/providers/${encodeURIComponent(target)}/usage${requestSuffix(request)}`);
}

export function LegacyAdminProviderDetailRedirect({ section }: { section: string }) {
  const { providerId = '' } = useParams();
  const location = useLocation();
  return (
    <Navigate
      replace
      to={`/admin/providers/${encodeURIComponent(providerId)}/${section}${location.search}${location.hash}`}
    />
  );
}

export function legacyAdminProviderDetailLoader(section: string) {
  return ({ request, params, context }: LoaderFunctionArgs) => {
    if (shouldDeferLegacyRedirect(request, context)) return null;
    return redirect(`/admin/providers/${encodeURIComponent(params.providerId ?? '')}/${section}${requestSuffix(request)}`);
  };
}

export function LegacyProviderOverviewRedirect() {
  const location = useLocation();
  return <Navigate to={'/admin/providers' + location.search + location.hash} replace />;
}

export function legacyProviderOverviewLoader({ request, context }: LoaderFunctionArgs) {
  if (shouldDeferLegacyRedirect(request, context)) return null;
  return redirect(`/admin/providers${requestSuffix(request)}`);
}

export function LegacyProviderSectionRedirect() {
  const { section } = useParams();
  const location = useLocation();
  return (
    <Navigate
      to={`/admin/providers/${providerSectionPath(section ?? '')}${location.search}${location.hash}`}
      replace
    />
  );
}

export function legacyProviderSectionLoader({ request, params, context }: LoaderFunctionArgs) {
  if (shouldDeferLegacyRedirect(request, context)) return null;
  return redirect(`/admin/providers/${providerSectionPath(params.section ?? '')}${requestSuffix(request)}`);
}

export function LegacyAdminProviderSectionRedirect({ section }: { section: string }) {
  const location = useLocation();
  const search = new URLSearchParams(location.search);
  const provider = search.get('provider') ?? search.get('supplier');
  search.delete('provider');
  search.delete('supplier');
  return (
    <Navigate
      to={`${
        provider
          ? `/admin/providers/${encodeURIComponent(provider)}/${providerSectionPath(section)}`
          : '/admin/providers'
      }${search.size ? '?' + search.toString() : ''}${location.hash}`}
      replace
    />
  );
}

export function legacyAdminProviderSectionLoader(section: string) {
  return ({ request, context }: LoaderFunctionArgs) => {
    if (shouldDeferLegacyRedirect(request, context)) return null;
    const url = parseRequestUrl(request);
    const search = new URLSearchParams(url.search);
    const provider = search.get('provider') ?? search.get('supplier');
    search.delete('provider');
    search.delete('supplier');
    return redirect(
      `${
        provider
          ? `/admin/providers/${encodeURIComponent(provider)}/${providerSectionPath(section)}`
          : '/admin/providers'
      }${search.size ? '?' + search.toString() : ''}${url.hash || getActiveNavigationHash()}`,
    );
  };
}

export function LegacyAdminSupplierDetailRedirect() {
  const { supplierId, section } = useParams();
  const location = useLocation();
  const suffix = section ? `/${providerSectionPath(section)}` : '';
  return (
    <Navigate
      to={`/admin/providers/${encodeURIComponent(supplierId ?? '')}${suffix}${location.search}${location.hash}`}
      replace
    />
  );
}

export function legacyAdminSupplierDetailLoader({ request, params, context }: LoaderFunctionArgs) {
  if (shouldDeferLegacyRedirect(request, context)) return null;
  const suffix = params.section ? `/${providerSectionPath(params.section)}` : '';
  return redirect(`/admin/providers/${encodeURIComponent(params.supplierId ?? '')}${suffix}${requestSuffix(request)}`);
}

export function LegacyProviderAccountRedirect() {
  const { provider, section } = useParams();
  const location = useLocation();
  const suffix = section ? `/${providerSectionPath(section)}` : '';
  return (
    <Navigate
      to={`/providers/${encodeURIComponent(provider ?? '')}${suffix}${location.search}${location.hash}`}
      replace
    />
  );
}

export function legacyProviderAccountLoader({ request, params, context }: LoaderFunctionArgs) {
  if (shouldDeferLegacyRedirect(request, context)) return null;
  const suffix = params.section ? `/${providerSectionPath(params.section)}` : '';
  return redirect(`/providers/${encodeURIComponent(params.provider ?? '')}${suffix}${requestSuffix(request)}`);
}

export function GenerationsRedirect() {
  const location = useLocation();
  return <Navigate to={'/generations' + location.search + location.hash} replace />;
}

export function generationsRedirectLoader({ request, context }: LoaderFunctionArgs) {
  if (shouldDeferLegacyRedirect(request, context)) return null;
  return redirect(`/generations${requestSuffix(request)}`);
}

export function WorkspaceChatRedirect() {
  const { workspace } = useParams();
  const location = useLocation();
  const search = new URLSearchParams(location.search);
  if (workspace) search.set('workspace', workspace);
  return <Navigate to={`/generations${search.size ? `?${search.toString()}` : ''}${location.hash}`} replace />;
}

export function workspaceChatRedirectLoader({ request, params, context }: LoaderFunctionArgs) {
  if (shouldDeferLegacyRedirect(request, context)) return null;
  const url = parseRequestUrl(request);
  const search = new URLSearchParams(url.search);
  if (params.workspace) search.set('workspace', params.workspace);
  return redirect(`/generations${search.size ? `?${search.toString()}` : ''}${url.hash || getActiveNavigationHash()}`);
}

export function LegacyPathRedirect({ to }: { to: string }) {
  const location = useLocation();
  return <Navigate to={`${to}${location.search}${location.hash}`} replace />;
}

export function legacyPathRedirectLoader(to: string) {
  return ({ request, params, context }: LoaderFunctionArgs) => {
    if (shouldDeferLegacyRedirect(request, context)) return null;
    if (to.startsWith('../') && params.workspace) {
      const target = to.slice(3);
      const url = parseRequestUrl(request);
      const [targetPath, presetQuery = ''] = target.split('?');
      const merged = new URLSearchParams(presetQuery);
      const incoming = new URLSearchParams(url.search);
      incoming.forEach((value, key) => merged.set(key, value));
      const queryStr = merged.toString();
      return redirect(
        `/workspaces/${encodeURIComponent(params.workspace)}/${targetPath}${queryStr ? `?${queryStr}` : ''}${url.hash || getActiveNavigationHash()}`,
      );
    }
    return redirect(`${to}${requestSuffix(request)}`);
  };
}

export function WorkspaceSectionRedirect({ section }: { section: string }) {
  const { slug } = useParams();
  const location = useLocation();
  const suffix = slug ? `/${encodeURIComponent(slug)}` : '';
  return <Navigate to={`../${section}${suffix}${location.search}${location.hash}`} replace />;
}

export function workspaceSectionRedirectLoader(section: string) {
  return ({ request, params, context }: LoaderFunctionArgs) => {
    if (shouldDeferLegacyRedirect(request, context)) return null;
    const ws = encodeURIComponent(params.workspace ?? 'default');
    const suffix = params.slug ? `/${encodeURIComponent(params.slug)}` : '';
    return redirect(`/workspaces/${ws}/${section}${suffix}${requestSuffix(request)}`);
  };
}

export function WorkspaceModelsRedirect() {
  const { workspace, '*': model } = useParams();
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  if (workspace) query.set('workspace', workspace);
  return <Navigate to={`/models${model ? '/' + model : ''}?${query.toString()}${location.hash}`} replace />;
}

export function workspaceModelsRedirectLoader({ request, params, context }: LoaderFunctionArgs) {
  if (shouldDeferLegacyRedirect(request, context)) return null;
  const url = parseRequestUrl(request);
  const query = new URLSearchParams(url.search);
  if (params.workspace) query.set('workspace', params.workspace);
  const model = params['*'];
  return redirect(`/models${model ? '/' + model : ''}?${query.toString()}${url.hash || getActiveNavigationHash()}`);
}
