import {
  createBrowserRouter,
  createMemoryRouter,
  Navigate,
  Outlet,
  redirect,
  ScrollRestoration,
  useLocation,
  useParams,
  type InitialEntry,
  type LoaderFunctionArgs,
  type RouteObject,
} from 'react-router';
import Administration from './shell/Administration';
import AppLayout from './shell/AppLayout';
import {
  getActiveNavigationHash,
  providerSectionPath,
  setActiveNavigationHash,
  shouldDeferLegacyRedirect,
} from './shell/legacy-redirect-route';
import {
  attachRouteImporter,
  registerPrefetchRouteTree,
  routeImporters,
  type LazyRouteModule,
} from './shell/prefetch';
import AppError from './shell/route-error';
import { RouteNotFoundFallback } from './shell/RouteFallback';
import {
  createRouterContextProvider,
  DataRouterPresenceContext,
  type RouteHandle,
} from './shell/router-context';
import RouterPending from './shell/RouterPending';

export function bindLazy(load: () => Promise<LazyRouteModule>, handle?: RouteHandle) {
  return attachRouteImporter(async () => {
    const mod = await load();
    if (mod.loader && mod.clientLoader) {
      throw new Error('Route module cannot export both loader and clientLoader.');
    }
    return {
      Component: mod.default,
      ...(mod.ErrorBoundary ? { ErrorBoundary: mod.ErrorBoundary } : {}),
      ...(mod.HydrateFallback ? { HydrateFallback: mod.HydrateFallback } : {}),
      ...(mod.loader ? { loader: mod.loader } : {}),
      ...(mod.clientLoader ? { loader: mod.clientLoader } : {}),
      ...(mod.action ? { action: mod.action } : {}),
      ...(mod.clientAction ? { clientAction: mod.clientAction } : {}),
      ...(mod.shouldRevalidate ? { shouldRevalidate: mod.shouldRevalidate } : {}),
      ...(mod.handle || handle ? { handle: { ...handle, ...mod.handle } } : {}),
    };
  }, load);
}

function parseRequestUrl(request: Request): URL {
  return new URL(request.url, 'http://localhost');
}

function requestSuffix(request: Request): string {
  const url = parseRequestUrl(request);
  const hash =
    url.hash ||
    getActiveNavigationHash() ||
    (typeof window !== 'undefined' ? window.location.hash : '');
  return `${url.search}${hash}`;
}

function LegacyProviderPortalRedirect() {
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

function legacyProviderPortalLoader({ request, params, context }: LoaderFunctionArgs) {
  if (shouldDeferLegacyRedirect(request, context)) return null;
  const target = params.provider ?? params.supplier ?? '';
  const suffix = params.section ? `/${providerSectionPath(params.section)}` : '';
  return redirect(`/admin/providers/${encodeURIComponent(target)}${suffix}${requestSuffix(request)}`);
}

function LegacyProviderDetailSectionRedirect() {
  const { provider, supplier } = useParams();
  const location = useLocation();
  return (
    <Navigate
      replace
      to={`/providers/${encodeURIComponent(provider ?? supplier ?? '')}/usage${location.search}${location.hash}`}
    />
  );
}

function legacyProviderDetailSectionLoader({ request, params, context }: LoaderFunctionArgs) {
  if (shouldDeferLegacyRedirect(request, context)) return null;
  const target = params.provider ?? params.supplier ?? '';
  return redirect(`/providers/${encodeURIComponent(target)}/usage${requestSuffix(request)}`);
}

function LegacyAdminProviderDetailRedirect({ section }: { section: string }) {
  const { providerId = '' } = useParams();
  const location = useLocation();
  return (
    <Navigate
      replace
      to={`/admin/providers/${encodeURIComponent(providerId)}/${section}${location.search}${location.hash}`}
    />
  );
}

function legacyAdminProviderDetailLoader(section: string) {
  return ({ request, params, context }: LoaderFunctionArgs) => {
    if (shouldDeferLegacyRedirect(request, context)) return null;
    return redirect(`/admin/providers/${encodeURIComponent(params.providerId ?? '')}/${section}${requestSuffix(request)}`);
  };
}

function LegacyProviderOverviewRedirect() {
  const location = useLocation();
  return <Navigate to={'/admin/providers' + location.search + location.hash} replace />;
}

function legacyProviderOverviewLoader({ request, context }: LoaderFunctionArgs) {
  if (shouldDeferLegacyRedirect(request, context)) return null;
  return redirect(`/admin/providers${requestSuffix(request)}`);
}

function LegacyProviderSectionRedirect() {
  const { section } = useParams();
  const location = useLocation();
  return (
    <Navigate
      to={`/admin/providers/${providerSectionPath(section ?? '')}${location.search}${location.hash}`}
      replace
    />
  );
}

function legacyProviderSectionLoader({ request, params, context }: LoaderFunctionArgs) {
  if (shouldDeferLegacyRedirect(request, context)) return null;
  return redirect(`/admin/providers/${providerSectionPath(params.section ?? '')}${requestSuffix(request)}`);
}

function LegacyAdminProviderSectionRedirect({ section }: { section: string }) {
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

function legacyAdminProviderSectionLoader(section: string) {
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

function LegacyAdminSupplierDetailRedirect() {
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

function legacyAdminSupplierDetailLoader({ request, params, context }: LoaderFunctionArgs) {
  if (shouldDeferLegacyRedirect(request, context)) return null;
  const suffix = params.section ? `/${providerSectionPath(params.section)}` : '';
  return redirect(`/admin/providers/${encodeURIComponent(params.supplierId ?? '')}${suffix}${requestSuffix(request)}`);
}

function LegacyProviderAccountRedirect() {
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

function legacyProviderAccountLoader({ request, params, context }: LoaderFunctionArgs) {
  if (shouldDeferLegacyRedirect(request, context)) return null;
  const suffix = params.section ? `/${providerSectionPath(params.section)}` : '';
  return redirect(`/providers/${encodeURIComponent(params.provider ?? '')}${suffix}${requestSuffix(request)}`);
}

function GenerationsRedirect() {
  const location = useLocation();
  return <Navigate to={'/generations' + location.search + location.hash} replace />;
}

function generationsRedirectLoader({ request, context }: LoaderFunctionArgs) {
  if (shouldDeferLegacyRedirect(request, context)) return null;
  return redirect(`/generations${requestSuffix(request)}`);
}

function WorkspaceChatRedirect() {
  const { workspace } = useParams();
  const location = useLocation();
  const search = new URLSearchParams(location.search);
  if (workspace) search.set('workspace', workspace);
  return <Navigate to={`/generations${search.size ? `?${search.toString()}` : ''}${location.hash}`} replace />;
}

function workspaceChatRedirectLoader({ request, params, context }: LoaderFunctionArgs) {
  if (shouldDeferLegacyRedirect(request, context)) return null;
  const url = parseRequestUrl(request);
  const search = new URLSearchParams(url.search);
  if (params.workspace) search.set('workspace', params.workspace);
  return redirect(`/generations${search.size ? `?${search.toString()}` : ''}${url.hash || getActiveNavigationHash()}`);
}

function LegacyPathRedirect({ to }: { to: string }) {
  const location = useLocation();
  return <Navigate to={`${to}${location.search}${location.hash}`} replace />;
}

function legacyPathRedirectLoader(to: string) {
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

function WorkspaceSectionRedirect({ section }: { section: string }) {
  const { slug } = useParams();
  const location = useLocation();
  const suffix = slug ? `/${encodeURIComponent(slug)}` : '';
  return <Navigate to={`../${section}${suffix}${location.search}${location.hash}`} replace />;
}

function workspaceSectionRedirectLoader(section: string) {
  return ({ request, params, context }: LoaderFunctionArgs) => {
    if (shouldDeferLegacyRedirect(request, context)) return null;
    const ws = encodeURIComponent(params.workspace ?? 'default');
    const suffix = params.slug ? `/${encodeURIComponent(params.slug)}` : '';
    return redirect(`/workspaces/${ws}/${section}${suffix}${requestSuffix(request)}`);
  };
}

function WorkspaceModelsRedirect() {
  const { workspace, '*': model } = useParams();
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  if (workspace) query.set('workspace', workspace);
  return <Navigate to={`/models${model ? '/' + model : ''}?${query.toString()}${location.hash}`} replace />;
}

function workspaceModelsRedirectLoader({ request, params, context }: LoaderFunctionArgs) {
  if (shouldDeferLegacyRedirect(request, context)) return null;
  const url = parseRequestUrl(request);
  const query = new URLSearchParams(url.search);
  if (params.workspace) query.set('workspace', params.workspace);
  const model = params['*'];
  return redirect(`/models${model ? '/' + model : ''}?${query.toString()}${url.hash || getActiveNavigationHash()}`);
}

function RootRouterFrame() {
  return (
    <DataRouterPresenceContext.Provider value={true}>
      <Outlet />
      <ScrollRestoration getKey={location => location.pathname} />
    </DataRouterPresenceContext.Provider>
  );
}

export const ADMIN_PROVIDER_SECTIONS = [
  'overview',
  'models',
  'usage',
  'consumption',
  'settlements',
  'members',
  'keys',
  'api-keys',
  'configuration',
] as const;

export const ADMIN_SUPPLIER_SECTIONS = [
  'overview',
  'models',
  'consumption',
  'settlements',
  'members',
  'configuration',
] as const;

export function buildAppRoutes(): RouteObject[] {
  const routes: RouteObject[] = [
    {
      id: 'root',
      path: '/',
      element: <RootRouterFrame />,
      errorElement: <AppError />,
      children: [
        {
          id: 'root-index',
          index: true,
          loader: ({ request }) => redirect(`/workspaces/default/${requestSuffix(request)}`),
          element: <Navigate to="/workspaces/default/" replace />,
        },
        {
          id: 'app-shell',
          element: <AppLayout />,
          errorElement: <AppError />,
          hydrateFallbackElement: <RouterPending />,
          children: [
            {
              id: 'app-content',
              errorElement: <AppError />,
              children: [
                {
                  id: 'connect',
                  path: 'connect',
                  lazy: bindLazy(routeImporters.connect, {
                    destination: 'Global',
                    title: { en: 'Connect your agent', zh: '连接你的 Agent' },
                  }),
                },
                {
                  id: 'login',
                  path: 'login',
                  lazy: bindLazy(routeImporters.login, {
                    destination: 'Global',
                    title: { en: 'Sign in', zh: '登录' },
                  }),
                },
                {
                  id: 'installation',
                  path: 'installation',
                  lazy: bindLazy(routeImporters.installation, {
                    destination: 'Global',
                    title: { en: 'Installation administration', zh: '实例管理' },
                  }),
                },
                {
                  path: 'providers',
                  loader: legacyProviderOverviewLoader,
                  element: <LegacyProviderOverviewRedirect />,
                },
                {
                  path: 'providers/configuration',
                  loader: legacyProviderOverviewLoader,
                  element: <LegacyProviderOverviewRedirect />,
                },
                {
                  path: 'providers/manage/members',
                  loader: legacyProviderOverviewLoader,
                  element: <LegacyProviderOverviewRedirect />,
                },
                {
                  path: 'providers/manage/:section',
                  loader: legacyProviderSectionLoader,
                  element: <LegacyProviderSectionRedirect />,
                },
                {
                  path: 'providers/:provider/consumption',
                  loader: legacyProviderDetailSectionLoader,
                  element: <LegacyProviderDetailSectionRedirect />,
                },
                {
                  path: 'providers/:provider/:section?',
                  loader: legacyProviderPortalLoader,
                  element: <LegacyProviderPortalRedirect />,
                },
                {
                  id: 'admin',
                  path: 'admin',
                  element: <Administration />,
                  handle: { destination: 'Administration' } satisfies RouteHandle,
                  children: [
                    {
                      id: 'admin-index',
                      index: true,
                      loader: ({ request, context }) =>
                        shouldDeferLegacyRedirect(request, context)
                          ? null
                          : redirect(`/admin/providers${requestSuffix(request)}`),
                      element: <Navigate to="providers" replace />,
                    },
                    {
                      path: 'commercial',
                      loader: legacyPathRedirectLoader('/admin/reports'),
                      element: <LegacyPathRedirect to="/admin/reports" />,
                    },
                    {
                      path: 'customer-accounts',
                      loader: legacyPathRedirectLoader('/admin/balances'),
                      element: <LegacyPathRedirect to="/admin/balances" />,
                    },
                    {
                      path: 'route-pools',
                      loader: legacyPathRedirectLoader('/admin/routing'),
                      element: <LegacyPathRedirect to="/admin/routing" />,
                    },
                    {
                      path: 'payment-gateways',
                      loader: legacyPathRedirectLoader('/admin/payments'),
                      element: <LegacyPathRedirect to="/admin/payments" />,
                    },
                    {
                      path: 'financial-reports',
                      loader: legacyPathRedirectLoader('/admin/reports'),
                      element: <LegacyPathRedirect to="/admin/reports" />,
                    },
                    {
                      id: 'admin-reports',
                      path: 'reports',
                      lazy: bindLazy(routeImporters.commercialPosition, {
                        destination: 'Administration',
                        navTo: '/admin/reports',
                        title: { en: 'Financial reports', zh: '财务报表' },
                      }),
                    },
                    {
                      path: 'account-balances',
                      loader: legacyPathRedirectLoader('/admin/balances'),
                      element: <LegacyPathRedirect to="/admin/balances" />,
                    },
                    {
                      id: 'admin-settings',
                      path: 'settings',
                      lazy: bindLazy(routeImporters.platformSettings, {
                        destination: 'Administration',
                        navTo: '/admin/settings',
                        title: { en: 'Settings', zh: '设置' },
                      }),
                    },
                    {
                      id: 'admin-customers',
                      path: 'customers',
                      lazy: bindLazy(routeImporters.customers, {
                        destination: 'Administration',
                        navTo: '/admin/customers',
                        title: { en: 'Customers', zh: '客户管理' },
                      }),
                    },
                    {
                      id: 'admin-balances',
                      path: 'balances',
                      lazy: bindLazy(routeImporters.customerAccounts, {
                        destination: 'Administration',
                        navTo: '/admin/balances',
                        title: { en: 'Account balances', zh: '账户余额' },
                      }),
                    },
                    {
                      id: 'admin-pricing',
                      path: 'pricing',
                      lazy: bindLazy(routeImporters.retailPricing, {
                        destination: 'Administration',
                        navTo: '/admin/pricing',
                        title: { en: 'Pricing', zh: '定价配置' },
                      }),
                    },
                    {
                      path: 'audit-logs',
                      loader: legacyPathRedirectLoader('/admin/audit'),
                      element: <LegacyPathRedirect to="/admin/audit" />,
                    },
                    {
                      id: 'admin-audit',
                      path: 'audit',
                      lazy: bindLazy(routeImporters.auditLogs, {
                        destination: 'Administration',
                        navTo: '/admin/audit',
                        title: { en: 'Audit logs', zh: '审计日志' },
                      }),
                    },
                    {
                      id: 'admin-branding',
                      path: 'branding',
                      lazy: bindLazy(routeImporters.branding, {
                        destination: 'Administration',
                        navTo: '/admin/branding',
                        title: { en: 'Branding', zh: '品牌定制' },
                      }),
                    },
                    {
                      id: 'admin-payments',
                      path: 'payments',
                      lazy: bindLazy(routeImporters.payments, {
                        destination: 'Administration',
                        navTo: '/admin/payments',
                        title: { en: 'Payment gateways', zh: '支付网关' },
                      }),
                    },
                    {
                      id: 'admin-providers',
                      path: 'providers',
                      lazy: bindLazy(routeImporters.providers, {
                        destination: 'Administration',
                        navTo: '/admin/providers',
                        title: { en: 'Providers', zh: '模型供应商' },
                      }),
                    },
                    {
                      path: 'model-pools',
                      loader: legacyPathRedirectLoader('/admin/routing'),
                      element: <LegacyPathRedirect to="/admin/routing" />,
                    },
                    {
                      path: 'pools',
                      loader: legacyPathRedirectLoader('/admin/routing'),
                      element: <LegacyPathRedirect to="/admin/routing" />,
                    },
                    {
                      id: 'admin-routing',
                      path: 'routing',
                      lazy: bindLazy(routeImporters.routePools, {
                        destination: 'Administration',
                        navTo: '/admin/routing',
                        title: { en: 'Routing', zh: '模型路由' },
                      }),
                    },
                    ...ADMIN_PROVIDER_SECTIONS.map(section => ({
                      path: 'providers/' + section,
                      loader: legacyAdminProviderSectionLoader(section),
                      element: <LegacyAdminProviderSectionRedirect section={section} />,
                    })),
                    {
                      id: 'admin-provider-detail',
                      path: 'providers/:providerId',
                      lazy: bindLazy(routeImporters.providers, {
                        destination: 'Administration',
                        navTo: '/admin/providers',
                        title: { en: 'Overview', zh: '概览' },
                      }),
                    },
                    {
                      path: 'providers/:providerId/members',
                      loader: legacyAdminProviderDetailLoader('settings'),
                      element: <LegacyAdminProviderDetailRedirect section="settings" />,
                    },
                    {
                      path: 'providers/:providerId/api-keys',
                      loader: legacyAdminProviderDetailLoader('keys'),
                      element: <LegacyAdminProviderDetailRedirect section="keys" />,
                    },
                    {
                      path: 'providers/:providerId/configuration',
                      loader: legacyAdminProviderDetailLoader('keys'),
                      element: <LegacyAdminProviderDetailRedirect section="keys" />,
                    },
                    {
                      path: 'providers/:providerId/consumption',
                      loader: legacyAdminProviderDetailLoader('usage'),
                      element: <LegacyAdminProviderDetailRedirect section="usage" />,
                    },
                    {
                      id: 'admin-provider-section',
                      path: 'providers/:providerId/:section',
                      lazy: bindLazy(routeImporters.providers, {
                        destination: 'Administration',
                        navTo: '/admin/providers',
                      }),
                    },
                    {
                      path: 'suppliers',
                      loader: legacyProviderOverviewLoader,
                      element: <LegacyProviderOverviewRedirect />,
                    },
                    ...ADMIN_SUPPLIER_SECTIONS.map(section => ({
                      path: 'suppliers/' + section,
                      loader: legacyAdminProviderSectionLoader(section),
                      element: <LegacyAdminProviderSectionRedirect section={section} />,
                    })),
                    {
                      path: 'suppliers/:supplierId',
                      loader: legacyAdminSupplierDetailLoader,
                      element: <LegacyAdminSupplierDetailRedirect />,
                    },
                    {
                      path: 'suppliers/:supplierId/:section',
                      loader: legacyAdminSupplierDetailLoader,
                      element: <LegacyAdminSupplierDetailRedirect />,
                    },
                  ],
                },
                {
                  path: 'suppliers',
                  loader: legacyProviderOverviewLoader,
                  element: <LegacyProviderOverviewRedirect />,
                },
                {
                  path: 'suppliers/manage/:section',
                  loader: legacyProviderSectionLoader,
                  element: <LegacyProviderSectionRedirect />,
                },
                {
                  path: 'suppliers/:supplier/consumption',
                  loader: legacyProviderDetailSectionLoader,
                  element: <LegacyProviderDetailSectionRedirect />,
                },
                {
                  path: 'suppliers/:supplier/:section?',
                  loader: legacyProviderPortalLoader,
                  element: <LegacyProviderPortalRedirect />,
                },
                {
                  path: 'supplier-accounts',
                  loader: legacyProviderOverviewLoader,
                  element: <LegacyProviderOverviewRedirect />,
                },
                {
                  path: 'supplier-accounts/manage/:section',
                  loader: legacyProviderSectionLoader,
                  element: <LegacyProviderSectionRedirect />,
                },
                {
                  path: 'supplier-accounts/:provider/:section?',
                  loader: legacyProviderAccountLoader,
                  element: <LegacyProviderAccountRedirect />,
                },
                {
                  id: 'help',
                  path: 'help/*',
                  lazy: bindLazy(routeImporters.help, {
                    destination: 'Global',
                    title: { en: 'Docs', zh: '文档' },
                  }),
                },
                {
                  id: 'models',
                  path: 'models/*',
                  lazy: bindLazy(routeImporters.models, {
                    destination: 'Models',
                    navTo: '/models/',
                    title: { en: 'Models', zh: '模型' },
                  }),
                },
                {
                  id: 'account-settings',
                  path: 'settings/:section?',
                  lazy: bindLazy(routeImporters.accountSettings, {
                    destination: 'Global',
                  }),
                },
                {
                  id: 'global-activity',
                  path: 'activity/:section?',
                  lazy: bindLazy(routeImporters.globalActivity, {
                    destination: 'Global',
                    navTo: '/activity',
                    title: { en: 'Activity', zh: '活动' },
                  }),
                },
                {
                  path: 'chat',
                  loader: generationsRedirectLoader,
                  element: <GenerationsRedirect />,
                },
                {
                  id: 'generations-layout',
                  path: 'generations',
                  lazy: bindLazy(routeImporters.generationsLayout, {
                    destination: 'Global',
                    navTo: '/generations',
                    title: { en: 'Generations', zh: '生成对话' },
                  }),
                  children: [
                    {
                      id: 'generations-index',
                      path: ':session?',
                      lazy: bindLazy(routeImporters.playground, {
                        destination: 'Global',
                        navTo: '/generations',
                        title: { en: 'Generations', zh: '生成对话' },
                      }),
                    },
                  ],
                },
                {
                  id: 'workspaces-directory',
                  path: 'workspaces',
                  lazy: bindLazy(routeImporters.workspaces, {
                    destination: 'Global',
                    title: { en: 'Workspaces', zh: '工作空间' },
                  }),
                },
                {
                  id: 'workspace-root',
                  path: 'workspaces/:workspace',
                  handle: { destination: 'Workspace' } satisfies RouteHandle,
                  children: [
                    {
                      id: 'workspace-overview',
                      index: true,
                      lazy: bindLazy(routeImporters.overview, {
                        destination: 'Workspace',
                        navTo: '.',
                        title: { en: 'Overview', zh: '概览' },
                      }),
                    },
                    {
                      id: 'workspace-routing',
                      path: 'routing/:slug?',
                      lazy: bindLazy(routeImporters.agentReview, {
                        destination: 'Workspace',
                        navTo: 'routing',
                        title: { en: 'Routing', zh: '模型路由' },
                      }),
                    },
                    {
                      path: 'pools/:slug?',
                      loader: workspaceSectionRedirectLoader('routing'),
                      element: <WorkspaceSectionRedirect section="routing" />,
                    },
                    {
                      id: 'workspace-events',
                      path: 'events/:slug?',
                      lazy: bindLazy(routeImporters.agentReview, {
                        destination: 'Workspace',
                        navTo: 'events',
                        title: { en: 'Events', zh: '事件订阅' },
                      }),
                    },
                    {
                      id: 'workspace-evaluations',
                      path: 'evaluations/:slug?',
                      lazy: bindLazy(routeImporters.agentReview, {
                        destination: 'Workspace',
                        navTo: 'evaluations',
                        title: { en: 'Evaluations', zh: '评估' },
                      }),
                    },
                    {
                      id: 'workspace-evaluation-run',
                      path: 'evaluations/:slug/runs/:run',
                      lazy: bindLazy(routeImporters.agentReview, {
                        destination: 'Workspace',
                        navTo: 'evaluations',
                        title: { en: 'Evaluations', zh: '评估' },
                      }),
                    },
                    {
                      path: 'models/*',
                      loader: workspaceModelsRedirectLoader,
                      element: <WorkspaceModelsRedirect />,
                    },
                    {
                      path: 'providers-admin',
                      loader: legacyPathRedirectLoader('/admin/providers'),
                      element: <LegacyPathRedirect to="/admin/providers" />,
                    },
                    {
                      path: 'vendors',
                      loader: legacyPathRedirectLoader('/admin/providers'),
                      element: <LegacyPathRedirect to="/admin/providers" />,
                    },
                    {
                      path: 'provider-capabilities/:provider',
                      loader: legacyPathRedirectLoader('../assets?tab=materials'),
                      element: <LegacyPathRedirect to="../assets?tab=materials" />,
                    },
                    {
                      path: 'video',
                      loader: legacyPathRedirectLoader('../assets?tab=materials'),
                      element: <LegacyPathRedirect to="../assets?tab=materials" />,
                    },
                    {
                      id: 'workspace-video-provider',
                      path: 'video/:provider/:section?',
                      lazy: bindLazy(routeImporters.providerMediaTools, {
                        destination: 'Workspace',
                        navTo: 'video',
                        title: { en: 'Video settings', zh: '视频设置' },
                      }),
                    },
                    {
                      id: 'workspace-keys-new',
                      path: 'keys/new',
                      lazy: bindLazy(routeImporters.keysNew, {
                        destination: 'Workspace',
                        navTo: 'keys',
                        title: { en: 'New API key', zh: '新建 API 密钥' },
                      }),
                    },
                    {
                      id: 'workspace-key-detail',
                      path: 'keys/:keyId',
                      lazy: bindLazy(routeImporters.keyDetail, {
                        destination: 'Workspace',
                        navTo: 'keys',
                        title: { en: 'API key', zh: 'API 密钥' },
                      }),
                    },
                    {
                      id: 'workspace-keys',
                      path: 'keys',
                      lazy: bindLazy(routeImporters.keys, {
                        destination: 'Workspace',
                        navTo: 'keys',
                        title: { en: 'API keys', zh: 'API 密钥' },
                      }),
                    },
                    {
                      id: 'workspace-organization',
                      path: 'organization',
                      lazy: bindLazy(routeImporters.organization, {
                        destination: 'Organization',
                        navTo: 'organization',
                        title: { en: 'Organization', zh: '组织设置' },
                      }),
                    },
                    {
                      id: 'workspace-settings',
                      path: 'settings',
                      lazy: bindLazy(routeImporters.workspaceSettings, {
                        destination: 'Workspace',
                        navTo: 'settings',
                        title: { en: 'Settings', zh: '设置' },
                      }),
                    },
                    {
                      id: 'workspace-users',
                      path: 'users',
                      lazy: bindLazy(routeImporters.operators, {
                        destination: 'Workspace',
                        navTo: 'users',
                        title: { en: 'Members', zh: '成员' },
                      }),
                    },
                    {
                      id: 'workspace-guardrails',
                      path: 'guardrails/:section?',
                      lazy: bindLazy(routeImporters.guardrails, {
                        destination: 'Workspace',
                        navTo: 'guardrails',
                        title: { en: 'Guardrails', zh: '安全护栏' },
                      }),
                    },
                    {
                      id: 'workspace-billing',
                      path: 'billing',
                      lazy: bindLazy(routeImporters.billing, {
                        destination: 'Workspace',
                        navTo: 'billing',
                        title: { en: 'Billing', zh: '计费' },
                      }),
                    },
                    {
                      id: 'workspace-usage',
                      path: 'usage',
                      lazy: bindLazy(routeImporters.workspaceUsage, {
                        destination: 'Workspace',
                        navTo: 'usage',
                        title: { en: 'Activity', zh: '活动' },
                      }),
                    },
                    {
                      path: 'activity',
                      loader: workspaceSectionRedirectLoader('usage'),
                      element: <WorkspaceSectionRedirect section="usage" />,
                    },
                    {
                      id: 'workspace-assets',
                      path: 'assets/:section?',
                      lazy: bindLazy(routeImporters.assets, {
                        destination: 'Workspace',
                        navTo: 'assets',
                        title: { en: 'Materials & subjects', zh: '素材与主体' },
                      }),
                    },
                    {
                      id: 'workspace-library',
                      path: 'library',
                      lazy: bindLazy(routeImporters.library, {
                        destination: 'Workspace',
                        navTo: 'library',
                        title: { en: 'Library', zh: '素材库' },
                      }),
                    },
                    {
                      id: 'workspace-executions',
                      path: 'executions',
                      lazy: bindLazy(routeImporters.executions, {
                        destination: 'Workspace',
                        navTo: 'executions',
                        title: { en: 'Logs', zh: '请求日志' },
                      }),
                    },
                    {
                      path: 'costs',
                      loader: workspaceSectionRedirectLoader('billing'),
                      element: <WorkspaceSectionRedirect section="billing" />,
                    },
                    {
                      path: 'playground',
                      loader: workspaceChatRedirectLoader,
                      element: <WorkspaceChatRedirect />,
                    },
                    {
                      path: 'subscriptions',
                      loader: workspaceSectionRedirectLoader('usage'),
                      element: <WorkspaceSectionRedirect section="usage" />,
                    },
                    {
                      id: 'workspace-not-found',
                      path: '*',
                      lazy: bindLazy(routeImporters.notFound, {
                        destination: 'Workspace',
                        title: { en: 'Page not found', zh: '页面未找到' },
                      }),
                    },
                  ],
                },
              ],
            },
          ],
        },
        { id: 'root-not-found', path: '*', element: <RouteNotFoundFallback /> },
      ],
    },
  ];
  return registerPrefetchRouteTree(routes);
}

export const appRoutes: RouteObject[] = buildAppRoutes();

export function createDashboardRouter() {
  const basename = import.meta.env.BASE_URL.replace(/\/+$/, '') || '/';
  setActiveNavigationHash(typeof window !== 'undefined' ? window.location.hash : '');
  const router = createBrowserRouter(buildAppRoutes(), {
    basename,
    getContext: createRouterContextProvider,
  });
  router.subscribe(state => { setActiveNavigationHash(state.navigation.location?.hash ?? state.location.hash ?? '');
  });
  return router;
}

export function createDashboardMemoryRouter(
  initialEntries?: InitialEntry[],
  routes?: RouteObject[],
) {
  const lastEntry = initialEntries?.[initialEntries.length - 1];
  if (typeof lastEntry === 'string') {
    const hashIdx = lastEntry.indexOf('#');
    setActiveNavigationHash(hashIdx >= 0 ? lastEntry.slice(hashIdx) : '');
  } else if (lastEntry && typeof lastEntry === 'object' && 'hash' in lastEntry) {
    setActiveNavigationHash(lastEntry.hash ?? '');
  } else {
    setActiveNavigationHash('');
  }
  const router = createMemoryRouter(routes ?? buildAppRoutes(), {
    initialEntries,
    getContext: createRouterContextProvider,
  });
  router.subscribe(state => { setActiveNavigationHash(state.navigation.location?.hash ?? state.location.hash ?? '');
  });
  return router;
}
