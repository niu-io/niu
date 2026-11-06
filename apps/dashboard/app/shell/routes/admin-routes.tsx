import { Navigate, redirect, type RouteObject } from 'react-router';
import Administration from '../Administration';
import { bindLazy } from '../lazy-route';
import {
  LegacyAdminProviderDetailRedirect,
  LegacyAdminProviderSectionRedirect,
  LegacyAdminSupplierDetailRedirect,
  LegacyPathRedirect,
  LegacyProviderOverviewRedirect,
  legacyAdminProviderDetailLoader,
  legacyAdminProviderSectionLoader,
  legacyAdminSupplierDetailLoader,
  legacyPathRedirectLoader,
  legacyProviderOverviewLoader,
  requestSuffix,
} from '../legacy-redirects';
import { shouldDeferLegacyRedirect } from '../legacy-redirect-route';
import { routeImporters } from '../prefetch';
import type { RouteHandle } from '../router-context';

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

/** Administration route namespace. */
export const adminRoute: RouteObject = {
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
      loader: legacyPathRedirectLoader('/admin/customers'),
      element: <LegacyPathRedirect to="/admin/customers" />,
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
      loader: legacyPathRedirectLoader('/admin/customers'),
      element: <LegacyPathRedirect to="/admin/customers" />,
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
      id: 'legacy-admin-balances',
      path: 'balances',
      loader: legacyPathRedirectLoader('/admin/customers'),
      element: <LegacyPathRedirect to="/admin/customers" />,
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
      id: 'admin-incidents',
      path: 'incidents',
      lazy: bindLazy(routeImporters.incidents, {
        destination: 'Administration',
        navTo: '/admin/incidents',
        title: { en: 'Connection incidents', zh: '连接事故' },
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
};
