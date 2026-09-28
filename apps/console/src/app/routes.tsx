import { createBrowserRouter, Navigate, Outlet, useLocation, useParams, type RouteObject } from 'react-router';
import AppLayout from './AppLayout';
import AppError from './route-error';
import RouterPending from './RouterPending';
import RouteFallback from './RouteFallback';

function WorkspaceChatRedirect() {
  const { workspace } = useParams();
  const location = useLocation();
  const search = new URLSearchParams(location.search);
  if (workspace) search.set('workspace', workspace);
  return <Navigate to={`/chat${search.size ? `?${search.toString()}` : ''}`} replace />;
}

export const appRoutes: RouteObject[] = [{
  path: '/',
  element: <Outlet />,
  errorElement: <AppError />,
  children: [
    { index: true, element: <Navigate to="/workspaces/default/" replace /> },
    { path: 'preview', lazy: async () => ({ Component: (await import('@/features/prototype/page')).default }) },
    {
      element: <AppLayout />,
      errorElement: <AppError />,
      hydrateFallbackElement: <RouterPending />,
      children: [
        { path: 'providers', lazy: async () => ({ Component: (await import('@/features/provider-business/admin')).default }) },
        { path: 'providers/configuration', lazy: async () => ({ Component: (await import('@/features/vendors/page')).default }) },
        { path: 'providers/manage/:section', lazy: async () => ({ Component: (await import('@/features/provider-business/admin')).default }) },
        { path: 'providers/:provider/:section?', lazy: async () => ({ Component: (await import('@/features/provider-business/page')).default }) },
        { path: 'help/*', lazy: async () => ({ Component: (await import('@/features/help/page')).default }) },
        { path: 'chat', lazy: async () => ({ Component: (await import('@/features/playground/page')).default }) },
        { path: 'workspaces/:workspace', children: [
          { index: true, lazy: async () => ({ Component: (await import('@/features/overview/page')).default }) },
          { path: 'models', lazy: async () => ({ Component: (await import('@/features/models/page')).default }) },
          { path: 'providers-admin', element: <Navigate to="/providers" replace /> },
          { path: 'vendors', element: <Navigate to="/providers/configuration" replace /> },
          { path: 'keys', lazy: async () => ({ Component: (await import('@/features/keys/page')).default }) },
          { path: 'organization', lazy: async () => ({ Component: (await import('@/features/organization/page')).default }) },
          { path: 'operators', lazy: async () => ({ Component: (await import('@/features/operators/page')).default }) },
          { path: 'billing', lazy: async () => ({ Component: (await import('@/features/billing/page')).default }) },
          { path: 'usage', lazy: async () => ({ Component: (await import('@/features/activity/page')).default }) },
          { path: 'activity', element: <Navigate to="../usage" replace /> },
          { path: 'executions', lazy: async () => ({ Component: (await import('@/features/executions/page')).default }) },
          { path: 'tasks', element: <Navigate to="../executions" replace /> },
          { path: 'playground', element: <WorkspaceChatRedirect /> },
          { path: 'benchmarks', element: <Navigate to="/chat" replace /> },
          { path: 'subscriptions', element: <Navigate to="../usage" replace /> },
          { path: '*', lazy: async () => ({ Component: (await import('@/features/not-found/page')).default }) },
        ] },
      ],
    },
    { path: '*', element: <RouteFallback notFound /> },
  ],
}];

export function createConsoleRouter() {
  const basename = import.meta.env.BASE_URL.replace(/\/+$/, '') || '/';
  return createBrowserRouter(appRoutes, { basename });
}
