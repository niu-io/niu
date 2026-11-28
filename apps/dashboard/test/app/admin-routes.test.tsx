import { render, waitFor } from '@testing-library/react';
import { createMemoryRouter, matchRoutes, RouterProvider } from 'react-router';
import { expect, it } from 'vitest';
import { resolveLegacyRedirectTarget } from '@/shell/legacy-redirect-route';
import { appRoutes } from '@/routes';

it.each([
  ['/admin/financial-reports', '/admin/reports'],
  ['/admin/account-balances', '/admin/customers'],
  ['/admin/model-pools', '/admin/routing'],
  ['/admin/pools', '/admin/routing'],
  ['/admin/audit-logs', '/admin/audit'],
  ['/admin/providers/example/api-keys', '/admin/providers/example/keys'],
  ['/admin/commercial', '/admin/reports'],
  ['/admin/customer-accounts', '/admin/customers'],
  ['/admin/balances', '/admin/customers'],
  ['/admin/route-pools', '/admin/routing'],
  ['/admin/payment-gateways', '/admin/settings?tab=payments'],
  ['/admin/payments', '/admin/settings?tab=payments'],
  ['/admin/branding', '/admin/settings?tab=branding'],
  ['/admin/providers/example/configuration', '/admin/providers/example/keys'],
  ['/admin/providers/example/consumption', '/admin/providers/example/usage'],
  ['/providers/example/consumption', '/providers/example/usage'],
  ['/admin/suppliers/example/configuration', '/admin/providers/example/keys'],
  ['/admin/suppliers/example/consumption', '/admin/providers/example/usage'],
  ['/supplier-accounts/example/consumption', '/providers/example/usage'],
  ['/suppliers/example/consumption', '/providers/example/usage'],
])('redirects %s to %s without losing filters or anchors', async (oldPath, newPath) => {
  const target = new URL(newPath, "https://example.test");
  const expectedQuery = new URLSearchParams("range=30");
  for (const [key, value] of target.searchParams) expectedQuery.set(key, value);
  const legacyRoute = matchRoutes(appRoutes, oldPath)?.at(-1)?.route;
  expect(legacyRoute?.element).toBeTruthy();
  const prefix = oldPath.startsWith('/admin/') ? '/admin/' : '/';
  const router = createMemoryRouter([
    { path: prefix + legacyRoute!.path, element: legacyRoute!.element },
    { path: target.pathname, element: <p>Canonical page</p> },
  ], { initialEntries: [oldPath + '?range=30#details'] });
  render(<RouterProvider router={router} />);
  await waitFor(() => expect(router.state.location.pathname).toBe(target.pathname));
  expect(router.state.location.search).toBe(`?${expectedQuery.toString()}`);
  expect(router.state.location.hash).toBe('#details');
  expect(router.state.historyAction).toBe('REPLACE');
});

it.each([
  '/admin/customers',
  '/admin/reports',
  '/admin/routing',
  '/admin/settings',
  '/admin/providers/example/keys',
  '/admin/providers/example/usage',
])('registers %s as a page rather than a redirect', path => {
  const route = matchRoutes(appRoutes, path)?.at(-1)?.route;
  expect(route?.lazy).toBeTypeOf('function');
});

it.each([
  ['/admin/settings/registration', '/admin/settings?tab=registration&status=pending#request'],
  ['/admin/registrations', '/admin/customers?tab=registrations&status=pending#request'],
])('preserves registration bookmarks at %s', (path, target) => {
  expect(resolveLegacyRedirectTarget(path, '?tab=old&status=pending', '#request', {})).toBe(target);
});
