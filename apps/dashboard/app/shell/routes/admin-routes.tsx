import type { RouteObject } from 'react-router';
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
} from '../legacy-redirects';
import LegacyRedirectRoute, {
  clientLoader as legacyRedirectLoader,
} from '../legacy-redirect-route';
import { routeImporters } from '../prefetch';
import type { RouteHandle } from '../router-context';

export const ADMIN_PROVIDER_SECTIONS = [
  'overview',
  'models',
  'offers',
  'usage',
  'consumption',
  'settlements',
  'members',
  'keys',
  'connections',
  'api-keys',
  'configuration',
  'settings',
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
      lazy: bindLazy(routeImporters.adminOverview, {
        destination: 'Administration',
        navTo: '/admin',
        title: { en: 'Overview', zh: '总览' },
      }),
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
      loader: legacyRedirectLoader,
      element: <LegacyRedirectRoute />,
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
      id: 'admin-settings-registration',
      path: 'settings/registration',
      loader: legacyRedirectLoader,
      element: <LegacyRedirectRoute />,
    },
    {
      id: 'admin-settings',
      path: 'settings',
      lazy: bindLazy(routeImporters.platformSettings, {
        destination: 'Administration',
        navTo: '/admin/settings',
        title: { en: 'General & billing', zh: '基础与计费' },
      }),
    },
    {
      id: 'admin-registrations',
      path: 'registrations',
      loader: legacyRedirectLoader,
      element: <LegacyRedirectRoute />,
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
      id: 'admin-customer-detail',
      path: 'customers/:customerId',
      lazy: bindLazy(routeImporters.customerDetail, {
        destination: 'Administration',
        navTo: '/admin/customers',
        title: { en: 'Customer', zh: '客户详情' },
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
        title: { en: 'Standard pricing', zh: '标准售价' },
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
      loader: legacyRedirectLoader,
      element: <LegacyRedirectRoute />,
    },
    {
      id: 'admin-payments',
      path: 'payments',
      loader: legacyRedirectLoader,
      element: <LegacyRedirectRoute />,
    },
    {
      path: 'authentication',
      loader: legacyRedirectLoader,
      element: <LegacyRedirectRoute />,
    },
    {
      path: 'oauth',
      loader: legacyRedirectLoader,
      element: <LegacyRedirectRoute />,
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
        title: { en: 'Custom models', zh: '自定义模型' },
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
      path: 'providers/:providerId/connections',
      loader: legacyAdminProviderDetailLoader('keys'),
      element: <LegacyAdminProviderDetailRedirect section="keys" />,
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
      path: 'providers/:providerId/offers',
      loader: legacyRedirectLoader,
      element: <LegacyRedirectRoute />,
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
