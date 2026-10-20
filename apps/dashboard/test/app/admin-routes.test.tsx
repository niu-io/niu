import { render, waitFor } from '@testing-library/react';
import { createMemoryRouter, matchRoutes, RouterProvider } from 'react-router';
import { expect, it } from 'vitest';
import { appRoutes } from '@/app/routes';

it.each([
  ['/admin/financial-reports', '/admin/reports'],
  ['/admin/account-balances', '/admin/balances'],
  ['/admin/model-pools', '/admin/pools'],
  ['/admin/audit-logs', '/admin/audit'],
  ['/admin/providers/example/api-keys', '/admin/providers/example/keys'],
  ['/admin/commercial', '/admin/reports'],
  ['/admin/customer-accounts', '/admin/balances'],
  ['/admin/route-pools', '/admin/pools'],
  ['/admin/payment-gateways', '/admin/payments'],
  ['/admin/providers/example/configuration', '/admin/providers/example/keys'],
  ['/admin/providers/example/consumption', '/admin/providers/example/usage'],
  ['/providers/example/consumption', '/providers/example/usage'],
  ['/admin/suppliers/example/configuration', '/admin/providers/example/keys'],
  ['/admin/suppliers/example/consumption', '/admin/providers/example/usage'],
  ['/supplier-accounts/example/consumption', '/providers/example/usage'],
  ['/suppliers/example/consumption', '/providers/example/usage'],
])('redirects %s to %s without losing filters or anchors', async (oldPath, newPath) => {
  const legacyRoute = matchRoutes(appRoutes, oldPath)?.at(-1)?.route;
  expect(legacyRoute?.element).toBeTruthy();
  const prefix = oldPath.startsWith('/admin/') ? '/admin/' : '/';
  const router = createMemoryRouter([
    { path: prefix + legacyRoute!.path, element: legacyRoute!.element },
    { path: newPath, element: <p>Canonical page</p> },
  ], { initialEntries: [oldPath + '?range=30#details'] });
  render(<RouterProvider router={router} />);
  await waitFor(() => expect(router.state.location.pathname).toBe(newPath));
  expect(router.state.location.search).toBe('?range=30');
  expect(router.state.location.hash).toBe('#details');
  expect(router.state.historyAction).toBe('REPLACE');
});

it.each([
  '/admin/reports',
  '/admin/balances',
  '/admin/pools',
  '/admin/payments',
  '/admin/providers/example/keys',
  '/admin/providers/example/usage',
])('registers %s as a page rather than a redirect', path => {
  const route = matchRoutes(appRoutes, path)?.at(-1)?.route;
  expect(route?.lazy).toBeTypeOf('function');
});
