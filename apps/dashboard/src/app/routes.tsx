import { createBrowserRouter, Navigate, Outlet, useLocation, useParams, type RouteObject } from 'react-router';
import AppLayout from './AppLayout';
import AppError from './route-error';
import RouterPending from './RouterPending';
import RouteFallback from './RouteFallback';
import Administration from './Administration';

function providerSectionPath(section: string) {
  return (section === 'configuration' || section === 'api-keys') ? 'keys' : section === 'consumption' ? 'usage' : section;
}

function LegacyProviderDetailSectionRedirect() {
  const { provider, supplier } = useParams();
  const location = useLocation();
  return <Navigate replace to={`/providers/${encodeURIComponent(provider ?? supplier ?? '')}/usage${location.search}${location.hash}`} />;
}

function LegacyAdminProviderDetailRedirect({ section }: { section: string }) {
  const { providerId = '' } = useParams();
  const location = useLocation();
  return <Navigate replace to={`/admin/providers/${encodeURIComponent(providerId)}/${section}${location.search}${location.hash}`} />;
}

function LegacyProviderOverviewRedirect() {
  const location = useLocation();
  return <Navigate to={'/admin/providers' + location.search + location.hash} replace />;
}

function LegacyProviderSectionRedirect() {
  const { section } = useParams();
  const location = useLocation();
  return <Navigate to={`/admin/providers/${providerSectionPath(section ?? "")}${location.search}${location.hash}`} replace />;
}

function LegacyAdminProviderSectionRedirect({ section }: { section: string }) {
  const location = useLocation();
  const search = new URLSearchParams(location.search);
  const provider = search.get('provider') ?? search.get('supplier');
  search.delete('provider');
  search.delete('supplier');
  return <Navigate to={`${provider ? `/admin/providers/${encodeURIComponent(provider)}/${providerSectionPath(section)}` : '/admin/providers'}${search.size ? '?' + search.toString() : ''}${location.hash}`} replace />;
}

function LegacyAdminSupplierDetailRedirect() {
  const { supplierId, section } = useParams();
  const location = useLocation();
  const suffix = section ? `/${providerSectionPath(section)}` : '';
  return <Navigate to={`/admin/providers/${encodeURIComponent(supplierId ?? '')}${suffix}${location.search}${location.hash}`} replace />;
}

function LegacyProviderAccountRedirect() {
  const { provider, section } = useParams();
  const location = useLocation();
  const suffix = section ? `/${providerSectionPath(section)}` : '';
  return <Navigate to={`/providers/${encodeURIComponent(provider ?? '')}${suffix}${location.search}${location.hash}`} replace />;
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

export const appRoutes: RouteObject[] = [{
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
        { path: 'login', lazy: async () => ({ Component: (await import('@/features/login/page')).default }) },
        { path: 'installation', lazy: async () => ({ Component: (await import('@/features/login/installation-page')).default }) },
        { path: 'providers', element: <LegacyProviderOverviewRedirect /> },
        { path: 'providers/configuration', element: <LegacyProviderOverviewRedirect /> },
        { path: 'providers/manage/members', element: <LegacyProviderOverviewRedirect /> },
        { path: 'providers/manage/:section', element: <LegacyProviderSectionRedirect /> },
        { path: 'providers/:provider/consumption', element: <LegacyProviderDetailSectionRedirect /> },
        { path: 'providers/:provider/:section?', lazy: async () => ({ Component: (await import('@/features/provider-business/page')).default }) },
        { path: 'admin', element: <Administration />, children: [
          { index: true, element: <Navigate to="providers" replace /> },
          { path: 'commercial', element: <LegacyPathRedirect to="/admin/reports" /> },
          { path: 'customer-accounts', element: <LegacyPathRedirect to="/admin/balances" /> },
          { path: 'route-pools', element: <LegacyPathRedirect to="/admin/pools" /> },
          { path: 'payment-gateways', element: <LegacyPathRedirect to="/admin/payments" /> },
          { path: 'financial-reports', element: <LegacyPathRedirect to="/admin/reports" /> },
          { path: 'reports', lazy: async () => ({ Component: (await import('@/features/commercial-position/page')).default }) },
          { path: 'account-balances', element: <LegacyPathRedirect to="/admin/balances" /> },
          { path: 'settings', lazy: async () => ({ Component: (await import('@/features/platform-settings/page')).default }) },
          { path: 'customers', lazy: async () => ({ Component: (await import('@/features/customers/page')).default }) },
          { path: 'balances', lazy: async () => ({ Component: (await import('@/features/customer-accounts/page')).default }) },
          { path: 'pricing', lazy: async () => ({ Component: (await import('@/features/retail-pricing/page')).default }) },
          { path: 'audit-logs', element: <LegacyPathRedirect to="/admin/audit" /> },
          { path: 'audit', lazy: async () => ({ Component: (await import('@/features/audit-logs/page')).default }) },
          { path: 'branding', lazy: async () => ({ Component: (await import('@/features/branding/page')).default }) },
          { path: 'payments', lazy: async () => ({ Component: (await import('@/features/platform/page')).default }) },
          { path: 'providers', lazy: async () => ({ Component: (await import('@/features/providers/page')).default }) },
          { path: 'model-pools', element: <LegacyPathRedirect to="/admin/pools" /> },
          { path: 'pools', lazy: async () => ({ Component: (await import('@/features/route-pools/page')).default }) },
          ...['overview', 'models', 'usage', 'consumption', 'settlements', 'members', 'keys', 'api-keys', 'configuration'].map(section => ({ path: 'providers/' + section, element: <LegacyAdminProviderSectionRedirect section={section} /> })),
          { path: 'providers/:providerId', lazy: async () => ({ Component: (await import('@/features/providers/page')).default }) },
          { path: 'providers/:providerId/api-keys', element: <LegacyAdminProviderDetailRedirect section="keys" /> },
          { path: 'providers/:providerId/configuration', element: <LegacyAdminProviderDetailRedirect section="keys" /> },
          { path: 'providers/:providerId/consumption', element: <LegacyAdminProviderDetailRedirect section="usage" /> },
          { path: 'providers/:providerId/:section', lazy: async () => ({ Component: (await import('@/features/providers/page')).default }) },
          { path: 'suppliers', element: <LegacyProviderOverviewRedirect /> },
          ...['overview', 'models', 'consumption', 'settlements', 'members', 'configuration'].map(section => ({ path: 'suppliers/' + section, element: <LegacyAdminProviderSectionRedirect section={section} /> })),
          { path: 'suppliers/:supplierId', element: <LegacyAdminSupplierDetailRedirect /> },
          { path: 'suppliers/:supplierId/:section', element: <LegacyAdminSupplierDetailRedirect /> },
        ] },
        { path: 'suppliers', element: <LegacyProviderOverviewRedirect /> },
        { path: 'suppliers/manage/:section', element: <LegacyProviderSectionRedirect /> },
        { path: 'suppliers/:supplier/consumption', element: <LegacyProviderDetailSectionRedirect /> },
        { path: 'suppliers/:supplier/:section?', lazy: async () => ({ Component: (await import('@/features/provider-business/page')).default }) },
        { path: 'supplier-accounts', element: <LegacyProviderOverviewRedirect /> },
        { path: 'supplier-accounts/manage/:section', element: <LegacyProviderSectionRedirect /> },
        { path: 'supplier-accounts/:provider/:section?', element: <LegacyProviderAccountRedirect /> },
        { path: 'help/*', lazy: async () => ({ Component: (await import('@/features/help/page')).default }) },
        { path: 'models/*', lazy: async () => ({ Component: (await import('@/features/models/page')).default }) },
        { path: 'settings/:section?', lazy: async () => ({ Component: (await import('@/features/account/settings-page')).default }) },
        { path: 'activity/:section?', lazy: async () => ({ Component: (await import('@/features/activity/global-page')).default }) },
        { path: 'chat', element: <GenerationsRedirect /> },
        { path: 'generations', lazy: async () => ({ Component: (await import('@/features/generations/layout')).default }), children: [{ index: true, lazy: async () => ({ Component: (await import('@/features/playground/page')).default }) }] },
        { path: 'workspaces', lazy: async () => ({ Component: (await import('@/features/workspace/page')).default }) },
        { path: 'workspaces/:workspace', children: [
          { index: true, lazy: async () => ({ Component: (await import('@/features/overview/page')).default }) },
          { path: 'models/*', element: <WorkspaceModelsRedirect /> },
          { path: 'providers-admin', element: <LegacyPathRedirect to="/admin/providers" /> },
          { path: 'vendors', element: <LegacyPathRedirect to="/admin/providers" /> },
          { path: 'provider-capabilities/volcengine', element: <LegacyPathRedirect to="../video/volcengine" /> },
          { path: 'video', element: <LegacyPathRedirect to="volcengine" /> },
          { path: 'video/volcengine/:section?', lazy: async () => ({ Component: (await import('@/features/provider-modules/volcengine/page')).default }) },
          { path: 'keys/new', lazy: async () => ({ Component: (await import('@/features/keys/new-page')).default }) },
          { path: 'keys/:keyId', lazy: async () => ({ Component: (await import('@/features/keys/detail-page')).default }) },
          { path: 'keys', lazy: async () => ({ Component: (await import('@/features/keys/page')).default }) },
          { path: 'organization', lazy: async () => ({ Component: (await import('@/features/organization/page')).default }) },
          { path: 'settings', lazy: async () => ({ Component: (await import('@/features/workspace/settings-page')).default }) },
          { path: 'users', lazy: async () => ({ Component: (await import('@/features/operators/page')).default }) },
          { path: 'guardrails/:section?', lazy: async () => ({ Component: (await import('@/features/guardrails/page')).default }) },
          { path: 'billing', lazy: async () => ({ Component: (await import('@/features/billing/page')).default }) },
          { path: 'usage', lazy: async () => ({ Component: (await import('@/features/activity/page')).default }) },
          { path: 'activity', element: <WorkspaceSectionRedirect section="usage" /> },
          { path: 'library', lazy: async () => ({ Component: (await import('@/features/library/page')).default }) },
          { path: 'executions', lazy: async () => ({ Component: (await import('@/features/executions/page')).default }) },
          { path: 'costs', element: <WorkspaceSectionRedirect section="billing" /> },
          { path: 'playground', element: <WorkspaceChatRedirect /> },
          { path: 'subscriptions', element: <WorkspaceSectionRedirect section="usage" /> },
          { path: '*', lazy: async () => ({ Component: (await import('@/features/not-found/page')).default }) },
        ] },
      ],
    },
    { path: '*', element: <RouteFallback notFound /> },
  ],
}];

export function createDashboardRouter() {
  const basename = import.meta.env.BASE_URL.replace(/\/+$/, '') || '/';
  return createBrowserRouter(appRoutes, { basename });
}
