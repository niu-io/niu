import type { RouteObject } from 'react-router';
import GuardrailsLegacyRoute, {
  clientLoader as guardrailsLegacyLoader,
} from '../../features/guardrails/legacy-route';
import OrganizationLegacyRoute from '../../features/organization/legacy-route';
import WorkspaceUsersLegacyRoute from '../../features/operators/legacy-route';
import { bindLazy } from '../lazy-route';
import {
  LegacyPathRedirect,
  WorkspaceChatRedirect,
  WorkspaceModelsRedirect,
  WorkspaceSectionRedirect,
  legacyPathRedirectLoader,
  workspaceChatRedirectLoader,
  workspaceModelsRedirectLoader,
  workspaceSectionRedirectLoader,
} from '../legacy-redirects';
import { routeImporters } from '../prefetch';
import type { RouteHandle } from '../router-context';

/** Workspace-scoped route namespace. */
export const workspaceRoute: RouteObject = {
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
      lazy: bindLazy(routeImporters.routing, {
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
      lazy: bindLazy(routeImporters.eventSubscriptions, {
        destination: 'Workspace',
        navTo: 'events',
        title: { en: 'Events', zh: '事件订阅' },
      }),
    },
    {
      id: 'workspace-evaluations',
      path: 'evaluations/:slug?',
      lazy: bindLazy(routeImporters.evaluations, {
        destination: 'Workspace',
        navTo: 'evaluations',
        title: { en: 'Evaluations', zh: '评估' },
      }),
    },
    {
      id: 'workspace-evaluation-run',
      path: 'evaluations/:slug/runs/:run',
      lazy: bindLazy(routeImporters.evaluations, {
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
      loader: legacyPathRedirectLoader('../assets?tab=materials'),
      element: <LegacyPathRedirect to="../assets?tab=materials" />,
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
      element: <OrganizationLegacyRoute />,
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
      element: <WorkspaceUsersLegacyRoute />,
    },
    {
      id: 'workspace-guardrails',
      path: 'guardrails',
      lazy: bindLazy(routeImporters.guardrails, {
        destination: 'Workspace',
        navTo: 'guardrails',
        title: { en: 'Guardrails', zh: '安全护栏' },
      }),
    },
    {
      id: 'workspace-guardrails-legacy',
      path: 'guardrails/*',
      loader: guardrailsLegacyLoader,
      element: <GuardrailsLegacyRoute />,
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
      loader: legacyPathRedirectLoader('../assets'),
      element: <LegacyPathRedirect to="../assets" />,
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
};
