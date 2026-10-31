import {
  createBrowserRouter,
  createMemoryRouter,
  Navigate,
  Outlet,
  useLocation,
  useParams,
  type InitialEntry,
  type RouteObject,
} from 'react-router';
import Administration from './shell/Administration';
import AppLayout from './shell/AppLayout';
import { routeImporters, type LazyRouteModule } from './shell/prefetch';
import AppError from './shell/route-error';
import RouteFallback from './shell/RouteFallback';
import { createRouterContextProvider, type RouteHandle } from './shell/router-context';
import RouterPending from './shell/RouterPending';

function bindLazy(load: () => Promise<LazyRouteModule>, handle?: RouteHandle) {
  return async () => {
    const mod = await load();
    return {
      Component: mod.default,
      ...(mod.loader ? { loader: mod.loader } : {}),
      ...(mod.clientLoader ? { loader: mod.clientLoader } : {}),
      ...(mod.action ? { action: mod.action } : {}),
      ...(mod.shouldRevalidate ? { shouldRevalidate: mod.shouldRevalidate } : {}),
      ...(mod.handle || handle ? { handle: { ...handle, ...mod.handle } } : {}),
    };
  };
}

function providerSectionPath(section: string) {
  return section === 'configuration' || section === 'api-keys'
    ? 'keys'
    : section === 'consumption'
      ? 'usage'
      : section;
}

function LegacyProviderPortalRedirect() {
  const { provider, supplier, section } = useParams();
  const location = useLocation();
  const suffix = section ? `/${providerSectionPath(section)}` : '';
  return <Navigate replace to={`/admin/providers/${encodeURIComponent(provider ?? supplier ?? '')}${suffix}${location.search}${location.hash}`} />;
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

function LegacyProviderOverviewRedirect() {
  const location = useLocation();
  return <Navigate to={'/admin/providers' + location.search + location.hash} replace />;
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

function GenerationsRedirect() {
  const location = useLocation();
  return <Navigate to={'/generations' + location.search + location.hash} replace />;
}

function WorkspaceChatRedirect() {
  const { workspace } = useParams();
  const location = useLocation();
  const search = new URLSearchParams(location.search);
  if (workspace) search.set('workspace', workspace);
  return <Navigate to={`/generations${search.size ? `?${search.toString()}` : ''}${location.hash}`} replace />;
}

function LegacyPathRedirect({ to }: { to: string }) {
  const location = useLocation();
  return <Navigate to={`${to}${location.search}${location.hash}`} replace />;
}

function WorkspaceSectionRedirect({ section }: { section: string }) {
  const location = useLocation();
  return <Navigate to={`../${section}${location.search}${location.hash}`} replace />;
}

function WorkspaceModelsRedirect() {
  const { workspace, '*': model } = useParams();
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  if (workspace) query.set('workspace', workspace);
  return <Navigate to={`/models${model ? '/' + model : ''}?${query.toString()}${location.hash}`} replace />;
}

export function buildAppRoutes(): RouteObject[] {
  return [
  {
    path: '/',
    element: <Outlet />,
    errorElement: <AppError />,
    children: [
      { index: true, element: <Navigate to="/workspaces/default/" replace /> },
      {
        element: <AppLayout />,
        errorElement: <AppError />,
        hydrateFallbackElement: <RouterPending />,
        children: [
          {
            errorElement: <AppError />,
            children: [
          { path: 'connect', lazy: bindLazy(routeImporters.connect, { destination: 'Global' }) },
          { path: 'login', lazy: bindLazy(routeImporters.login, { destination: 'Global' }) },
          { path: 'installation', lazy: bindLazy(routeImporters.installation, { destination: 'Global' }) },
          { path: 'providers', element: <LegacyProviderOverviewRedirect /> },
          { path: 'providers/configuration', element: <LegacyProviderOverviewRedirect /> },
          { path: 'providers/manage/members', element: <LegacyProviderOverviewRedirect /> },
          { path: 'providers/manage/:section', element: <LegacyProviderSectionRedirect /> },
          { path: 'providers/:provider/consumption', element: <LegacyProviderDetailSectionRedirect /> },
          {
            path: 'providers/:provider/:section?',
            element: <LegacyProviderPortalRedirect />,
          },
          {
            path: 'admin',
            element: <Administration />,
            handle: { destination: 'Administration' } satisfies RouteHandle,
            children: [
              { index: true, element: <Navigate to="providers" replace /> },
              { path: 'commercial', element: <LegacyPathRedirect to="/admin/reports" /> },
              { path: 'customer-accounts', element: <LegacyPathRedirect to="/admin/balances" /> },
              { path: 'route-pools', element: <LegacyPathRedirect to="/admin/pools" /> },
              { path: 'payment-gateways', element: <LegacyPathRedirect to="/admin/payments" /> },
              { path: 'financial-reports', element: <LegacyPathRedirect to="/admin/reports" /> },
              {
                path: 'reports',
                lazy: bindLazy(routeImporters.commercialPosition, { destination: 'Administration' }),
              },
              { path: 'account-balances', element: <LegacyPathRedirect to="/admin/balances" /> },
              {
                path: 'settings',
                lazy: bindLazy(routeImporters.platformSettings, { destination: 'Administration' }),
              },
              {
                path: 'customers',
                lazy: bindLazy(routeImporters.customers, { destination: 'Administration' }),
              },
              {
                path: 'balances',
                lazy: bindLazy(routeImporters.customerAccounts, { destination: 'Administration' }),
              },
              {
                path: 'pricing',
                lazy: bindLazy(routeImporters.retailPricing, { destination: 'Administration' }),
              },
              { path: 'audit-logs', element: <LegacyPathRedirect to="/admin/audit" /> },
              {
                path: 'audit',
                lazy: bindLazy(routeImporters.auditLogs, { destination: 'Administration' }),
              },
              {
                path: 'branding',
                lazy: bindLazy(routeImporters.branding, { destination: 'Administration' }),
              },
              {
                path: 'payments',
                lazy: bindLazy(routeImporters.payments, { destination: 'Administration' }),
              },
              {
                path: 'providers',
                lazy: bindLazy(routeImporters.providers, { destination: 'Administration' }),
              },
              { path: 'model-pools', element: <LegacyPathRedirect to="/admin/pools" /> },
              {
                path: 'pools',
                lazy: bindLazy(routeImporters.routePools, { destination: 'Administration' }),
              },
              ...[
                'overview',
                'models',
                'usage',
                'consumption',
                'settlements',
                'members',
                'keys',
                'api-keys',
                'configuration',
              ].map(section => ({
                path: 'providers/' + section,
                element: <LegacyAdminProviderSectionRedirect section={section} />,
              })),
              {
                path: 'providers/:providerId',
                lazy: bindLazy(routeImporters.providers, { destination: 'Administration' }),
              },
              { path: 'providers/:providerId/members', element: <LegacyAdminProviderDetailRedirect section="settings" /> },
              { path: 'providers/:providerId/api-keys', element: <LegacyAdminProviderDetailRedirect section="keys" /> },
              {
                path: 'providers/:providerId/configuration',
                element: <LegacyAdminProviderDetailRedirect section="keys" />,
              },
              {
                path: 'providers/:providerId/consumption',
                element: <LegacyAdminProviderDetailRedirect section="usage" />,
              },
              {
                path: 'providers/:providerId/:section',
                lazy: bindLazy(routeImporters.providers, { destination: 'Administration' }),
              },
              { path: 'suppliers', element: <LegacyProviderOverviewRedirect /> },
              ...['overview', 'models', 'consumption', 'settlements', 'members', 'configuration'].map(section => ({
                path: 'suppliers/' + section,
                element: <LegacyAdminProviderSectionRedirect section={section} />,
              })),
              { path: 'suppliers/:supplierId', element: <LegacyAdminSupplierDetailRedirect /> },
              { path: 'suppliers/:supplierId/:section', element: <LegacyAdminSupplierDetailRedirect /> },
            ],
          },
          { path: 'suppliers', element: <LegacyProviderOverviewRedirect /> },
          { path: 'suppliers/manage/:section', element: <LegacyProviderSectionRedirect /> },
          { path: 'suppliers/:supplier/consumption', element: <LegacyProviderDetailSectionRedirect /> },
          {
            path: 'suppliers/:supplier/:section?',
            element: <LegacyProviderPortalRedirect />,
          },
          { path: 'supplier-accounts', element: <LegacyProviderOverviewRedirect /> },
          { path: 'supplier-accounts/manage/:section', element: <LegacyProviderSectionRedirect /> },
          { path: 'supplier-accounts/:provider/:section?', element: <LegacyProviderAccountRedirect /> },
          { path: 'help/*', lazy: bindLazy(routeImporters.help, { destination: 'Global' }) },
          { path: 'models/*', lazy: bindLazy(routeImporters.models, { destination: 'Models' }) },
          { path: 'settings/:section?', lazy: bindLazy(routeImporters.accountSettings, { destination: 'Global' }) },
          { path: 'activity/:section?', lazy: bindLazy(routeImporters.globalActivity, { destination: 'Global' }) },
          { path: 'chat', element: <GenerationsRedirect /> },
          {
            path: 'generations',
            lazy: bindLazy(routeImporters.generationsLayout, { destination: 'Global' }),
            children: [{ index: true, lazy: bindLazy(routeImporters.playground, { destination: 'Global' }) }],
          },
          { path: 'workspaces', lazy: bindLazy(routeImporters.workspaces, { destination: 'Global' }) },
          {
            path: 'workspaces/:workspace',
            handle: { destination: 'Workspace' } satisfies RouteHandle,
            children: [
              { index: true, lazy: bindLazy(routeImporters.overview, { destination: 'Workspace' }) },
              { path: 'pools/:slug?', lazy: bindLazy(routeImporters.agentReview, { destination: 'Workspace' }) },
              { path: 'events/:slug?', lazy: bindLazy(routeImporters.agentReview, { destination: 'Workspace' }) },
              { path: 'evaluations/:slug?', lazy: bindLazy(routeImporters.agentReview, { destination: 'Workspace' }) },
              { path: 'evaluations/:slug/runs/:run', lazy: bindLazy(routeImporters.agentReview, { destination: 'Workspace' }) },
              { path: 'models/*', element: <WorkspaceModelsRedirect /> },
              { path: 'providers-admin', element: <LegacyPathRedirect to="/admin/providers" /> },
              { path: 'vendors', element: <LegacyPathRedirect to="/admin/providers" /> },
              { path: 'provider-capabilities/volcengine', element: <LegacyPathRedirect to="../video/volcengine" /> },
              { path: 'video', element: <LegacyPathRedirect to="volcengine" /> },
              {
                path: 'video/volcengine/:section?',
                lazy: bindLazy(routeImporters.volcengine, { destination: 'Workspace' }),
              },
              { path: 'keys/new', lazy: bindLazy(routeImporters.keysNew, { destination: 'Workspace' }) },
              { path: 'keys/:keyId', lazy: bindLazy(routeImporters.keyDetail, { destination: 'Workspace' }) },
              { path: 'keys', lazy: bindLazy(routeImporters.keys, { destination: 'Workspace' }) },
              { path: 'organization', lazy: bindLazy(routeImporters.organization, { destination: 'Organization' }) },
              {
                path: 'settings',
                lazy: bindLazy(routeImporters.workspaceSettings, { destination: 'Workspace' }),
              },
              { path: 'users', lazy: bindLazy(routeImporters.operators, { destination: 'Workspace' }) },
              {
                path: 'guardrails/:section?',
                lazy: bindLazy(routeImporters.guardrails, { destination: 'Workspace' }),
              },
              { path: 'billing', lazy: bindLazy(routeImporters.billing, { destination: 'Workspace' }) },
              { path: 'usage', lazy: bindLazy(routeImporters.workspaceUsage, { destination: 'Workspace' }) },
              { path: 'activity', element: <WorkspaceSectionRedirect section="usage" /> },
              { path: 'library', lazy: bindLazy(routeImporters.library, { destination: 'Workspace' }) },
              { path: 'executions', lazy: bindLazy(routeImporters.executions, { destination: 'Workspace' }) },
              { path: 'costs', element: <WorkspaceSectionRedirect section="billing" /> },
              { path: 'playground', element: <WorkspaceChatRedirect /> },
              { path: 'subscriptions', element: <WorkspaceSectionRedirect section="usage" /> },
              { path: '*', lazy: bindLazy(routeImporters.notFound, { destination: 'Workspace' }) },
            ],
          },
            ],
          },
        ],
      },
      { path: '*', element: <RouteFallback notFound /> },
    ],
  },
];
}

export const appRoutes: RouteObject[] = buildAppRoutes();

export function createDashboardRouter() {
  const basename = import.meta.env.BASE_URL.replace(/\/+$/, '') || '/';
  return createBrowserRouter(buildAppRoutes(), {
    basename,
    getContext: createRouterContextProvider,
  });
}

export function createDashboardMemoryRouter(
  initialEntries?: InitialEntry[],
  routes?: RouteObject[],
) {
  return createMemoryRouter(routes ?? buildAppRoutes(), {
    initialEntries,
    getContext: createRouterContextProvider,
  });
}
