import {
  createBrowserRouter,
  createMemoryRouter,
  Navigate,
  Outlet,
  redirect,
  ScrollRestoration,
  type InitialEntry,
  type RouteObject,
} from 'react-router';
import AppLayout from './shell/AppLayout';
import { requestSuffix } from './shell/legacy-redirects';
import { setActiveNavigationHash } from './shell/legacy-redirect-route';
import { registerPrefetchRouteTree } from './shell/prefetch';
import AppError from './shell/route-error';
import { RouteNotFoundFallback } from './shell/RouteFallback';
import { adminRoute } from './shell/routes/admin-routes';
import { accountRoutes } from './shell/routes/account-routes';
import { globalRoutes } from './shell/routes/global-routes';
import { workspaceRoute } from './shell/routes/workspace-routes';
import { createRouterContextProvider, DataRouterPresenceContext } from './shell/router-context';
import RouterPending from './shell/RouterPending';

export { bindLazy } from './shell/lazy-route';
export { ADMIN_PROVIDER_SECTIONS, ADMIN_SUPPLIER_SECTIONS } from './shell/routes/admin-routes';

function RootRouterFrame() {
  return (
    <DataRouterPresenceContext.Provider value={true}>
      <Outlet />
      <ScrollRestoration getKey={location => location.pathname} />
    </DataRouterPresenceContext.Provider>
  );
}

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
                ...globalRoutes,
                adminRoute,
                ...accountRoutes,
                workspaceRoute,
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
