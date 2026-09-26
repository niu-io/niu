import { createBrowserRouter, type RouteObject } from 'react-router';
import AppLayout from './AppLayout';
import AppError from './route-error';
import RouterPending from './RouterPending';

export const appRoutes: RouteObject[] = [{
  path: 'workspaces/:workspace',
  element: <AppLayout />,
  errorElement: <AppError />,
  hydrateFallbackElement: <RouterPending />,
  children: [
    { index: true, lazy: async () => ({ Component: (await import('@/features/overview/page')).default }) },
    { path: 'models', lazy: async () => ({ Component: (await import('@/features/models/page')).default }) },
    { path: 'keys', lazy: async () => ({ Component: (await import('@/features/keys/page')).default }) },
    { path: 'operators', lazy: async () => ({ Component: (await import('@/features/operators/page')).default }) },
    { path: 'usage', lazy: async () => ({ Component: (await import('@/features/costs/page')).default }) },
    { path: 'executions', lazy: async () => ({ Component: (await import('@/features/executions/page')).default }) },
    { path: 'benchmarks', lazy: async () => ({ Component: (await import('@/features/benchmarks/page')).default }) },
    { path: 'subscriptions', lazy: async () => ({ Component: (await import('@/features/subscriptions/page')).default }) },
    { path: '*', lazy: async () => ({ Component: (await import('@/features/not-found/page')).default }) },
  ],
}];

export function createConsoleRouter() {
  return createBrowserRouter(appRoutes);
}
