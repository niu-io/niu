import type { RouteObject } from 'react-router';
import { bindLazy } from '../lazy-route';
import {
  GenerationsRedirect,
  LegacyModelsRedirect,
  generationsRedirectLoader,
  legacyModelsRedirectLoader,
} from '../legacy-redirects';
import { routeImporters } from '../prefetch';

/** Account-scoped surfaces: settings, activity and chat (plus legacy /models redirect). */
export const accountRoutes: RouteObject[] = [
  {
    id: 'legacy-models',
    path: 'models/*',
    loader: legacyModelsRedirectLoader,
    element: <LegacyModelsRedirect />,
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
        id: 'generations-run',
        path: 'runs/:run',
        lazy: bindLazy(routeImporters.playground, {
          destination: 'Global',
          navTo: '/generations',
          title: { en: 'Generations', zh: '生成对话' },
        }),
      },
      {
        id: 'generations-session-run',
        path: ':session/runs/:run',
        lazy: bindLazy(routeImporters.playground, {
          destination: 'Global',
          navTo: '/generations',
          title: { en: 'Generations', zh: '生成对话' },
        }),
      },
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
];
