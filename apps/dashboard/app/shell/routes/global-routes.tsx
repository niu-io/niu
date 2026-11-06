import type { RouteObject } from 'react-router';
import { bindLazy } from '../lazy-route';
import {
  LegacyProviderAccountRedirect,
  LegacyProviderDetailSectionRedirect,
  LegacyProviderOverviewRedirect,
  LegacyProviderPortalRedirect,
  LegacyProviderSectionRedirect,
  legacyProviderAccountLoader,
  legacyProviderDetailSectionLoader,
  legacyProviderOverviewLoader,
  legacyProviderPortalLoader,
  legacyProviderSectionLoader,
} from '../legacy-redirects';
import { routeImporters } from '../prefetch';

/** Signed-in global surfaces plus redirects for retired provider URLs. */
export const globalRoutes: RouteObject[] = [
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
    id: 'invite',
    path: 'invite/:token',
    lazy: bindLazy(routeImporters.invite, {
      destination: 'Global',
      title: { en: 'Accept invitation', zh: '接受邀请' },
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
];
