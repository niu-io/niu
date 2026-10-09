import { createBrowserRouter, Navigate, Outlet, useLocation, useParams, type RouteObject } from 'react-router';
import AppLayout from './AppLayout';
import AppError from './route-error';
import RouterPending from './RouterPending';
import RouteFallback from './RouteFallback';
import Administration from './Administration';

function LegacySupplierOverviewRedirect() {
  const location = useLocation();
  return <Navigate to={'/admin/suppliers' + location.search + location.hash} replace />;
}

function LegacySupplierSectionRedirect() {
  const { section } = useParams();
  const location = useLocation();
  return <Navigate to={`/admin/suppliers/${section}${location.search}${location.hash}`} replace />;
}

function LegacyAdminSupplierSectionRedirect({ section }: { section: string }) {
  const location = useLocation();
  const search = new URLSearchParams(location.search);
  const supplier = search.get('supplier');
  search.delete('supplier');
  return <Navigate to={supplier ? `/admin/suppliers/${encodeURIComponent(supplier)}/${section}${search.size ? '?' + search.toString() : ''}` : '/admin/suppliers'} replace />;
}

function LegacySupplierAccountRedirect() {
  const { provider, section } = useParams();
  const location = useLocation();
  const suffix = section ? `/${section}` : '';
  return <Navigate to={`/suppliers/${encodeURIComponent(provider ?? '')}${suffix}${location.search}${location.hash}`} replace />;
}

function LegacyProviderRouteRedirect() {
  const location = useLocation();
  return <Navigate to={'/admin/suppliers' + location.search + location.hash} replace />;
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
  return <Navigate to={`/generations${search.size ? `?${search.toString()}` : ''}`} replace />;
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
        { path: 'providers', element: <LegacyProviderRouteRedirect /> },
        { path: 'providers/configuration', element: <LegacyProviderRouteRedirect /> },
        { path: 'providers/manage/members', element: <LegacySupplierOverviewRedirect /> },
        { path: 'providers/manage/:section', element: <LegacySupplierSectionRedirect /> },
        { path: 'providers/:provider/:section?', element: <LegacySupplierAccountRedirect /> },
        { path: 'admin', element: <Administration />, children: [
          { index: true, element: <Navigate to="suppliers" replace /> },
          { path: 'branding', lazy: async () => ({ Component: (await import('@/features/branding/page')).default }) },
          ...['payments'].map(path => ({ path, lazy: async () => ({ Component: (await import('@/features/platform/page')).default }) })),
          { path: 'suppliers', lazy: async () => ({ Component: (await import('@/features/vendors/page')).default }) },
          ...['overview', 'models', 'consumption', 'settlements', 'members'].map(section => ({ path: 'suppliers/' + section, element: <LegacyAdminSupplierSectionRedirect section={section} /> })),
          { path: 'suppliers/:supplierId', lazy: async () => ({ Component: (await import('@/features/vendors/page')).default }) },
          { path: 'suppliers/:supplierId/:section', lazy: async () => ({ Component: (await import('@/features/vendors/page')).default }) },
        ] },
        { path: 'suppliers', element: <LegacySupplierOverviewRedirect /> },
        { path: 'suppliers/manage/:section', element: <LegacySupplierSectionRedirect /> },
        { path: 'suppliers/:supplier/:section?', lazy: async () => ({ Component: (await import('@/features/provider-business/page')).default }) },
        { path: 'supplier-accounts', element: <LegacySupplierOverviewRedirect /> },
        { path: 'supplier-accounts/manage/:section', element: <LegacySupplierSectionRedirect /> },
        { path: 'supplier-accounts/:provider/:section?', element: <LegacySupplierAccountRedirect /> },
        { path: 'help/*', lazy: async () => ({ Component: (await import('@/features/help/page')).default }) },
        { path: 'models/*', lazy: async () => ({ Component: (await import('@/features/models/page')).default }) },
        { path: 'settings/:section?', lazy: async () => ({ Component: (await import('@/features/account/settings-page')).default }) },
        { path: 'activity/:section?', lazy: async () => ({ Component: (await import('@/features/activity/global-page')).default }) },
        { path: 'chat', element: <GenerationsRedirect /> },
        { path: 'generations', lazy: async () => ({ Component: (await import('@/features/playground/page')).default }) },
        { path: 'workspaces', lazy: async () => ({ Component: (await import('@/features/workspace/page')).default }) },
        { path: 'workspaces/:workspace', children: [
          { index: true, lazy: async () => ({ Component: (await import('@/features/overview/page')).default }) },
          { path: 'models/*', element: <WorkspaceModelsRedirect /> },
          { path: 'providers-admin', element: <Navigate to="/admin/suppliers" replace /> },
          { path: 'vendors', element: <Navigate to="/admin/suppliers" replace /> },
          { path: 'keys/new', lazy: async () => ({ Component: (await import('@/features/keys/new-page')).default }) },
          { path: 'keys/:keyId', lazy: async () => ({ Component: (await import('@/features/keys/detail-page')).default }) },
          { path: 'keys', lazy: async () => ({ Component: (await import('@/features/keys/page')).default }) },
          { path: 'organization', lazy: async () => ({ Component: (await import('@/features/organization/page')).default }) },
          { path: 'settings', lazy: async () => ({ Component: (await import('@/features/workspace/settings-page')).default }) },
          { path: 'users', lazy: async () => ({ Component: (await import('@/features/operators/page')).default }) },
          { path: 'guardrails/:section?', lazy: async () => ({ Component: (await import('@/features/guardrails/page')).default }) },
          { path: 'billing', lazy: async () => ({ Component: (await import('@/features/billing/page')).default }) },
          { path: 'usage', lazy: async () => ({ Component: (await import('@/features/activity/page')).default }) },
          { path: 'activity', element: <Navigate to="../usage" replace /> },
          { path: 'executions', lazy: async () => ({ Component: (await import('@/features/executions/page')).default }) },
          { path: 'benchmarks', lazy: async () => ({ Component: (await import('@/features/benchmarks/page')).default }) },
          { path: 'costs', element: <Navigate to="../billing" replace /> },
          { path: 'playground', element: <WorkspaceChatRedirect /> },
          { path: 'subscriptions', element: <Navigate to="../usage" replace /> },
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
