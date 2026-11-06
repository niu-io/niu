/**
 * Route-tree parity guard.
 *
 * `app/router-tree.tsx` is assembled from domain route modules. The checked-in
 * snapshot records every route's id, absolute path, loader/element wiring and
 * handle. Any route added, removed or rewired fails this comparison and forces
 * the route change to be reviewed explicitly.
 *
 * Regenerate only for an intentional route change, then review the diff:
 *   UPDATE_ROUTE_SNAPSHOT=1 pnpm vitest run test/app/router-tree.parity.test.ts \
 *     | sed -n 's/^ROUTE_PARITY_SNAPSHOT://p' > test/fixtures/router-tree.parity.json
 */
import { matchRoutes, type RouteObject } from 'react-router';
import { describe, expect, it } from 'vitest';
import { buildAppRoutes } from '../../app/router-tree';

const UPDATE_SNAPSHOT = process.env.UPDATE_ROUTE_SNAPSHOT === '1';
const SNAPSHOT_MARKER = 'ROUTE_PARITY_SNAPSHOT:';

type SnapshotEntry = {
  path: string;
  id: string | null;
  ancestors: string[];
  index: boolean;
  caseSensitive: boolean | null;
  element: string | null;
  errorElement: string | null;
  hydrateFallbackElement: string | null;
  loader: string | null;
  action: string | null;
  hasLazy: boolean;
  handle: unknown;
};

function componentName(node: unknown): string | null {
  if (!node || typeof node !== 'object' || !('type' in node)) return null;
  const type = (node as { type?: unknown }).type;
  if (typeof type === 'string') return type;
  if (typeof type === 'function') return type.name || 'anonymous';
  return type ? String(type) : null;
}

function functionName(value: unknown): string | null {
  if (typeof value !== 'function') return null;
  return value.name || 'anonymous';
}

function joinPath(parentPath: string, path: string | undefined): string {
  const base = parentPath.replace(/\/+$/, '');
  if (!path) return base || '/';
  const segment = path.startsWith('/') ? path : `/${path}`;
  return `${base}${segment}`;
}

/**
 * Flatten the route tree into a stable, order-independent list. Route order is
 * not meaningful in React Router (it ranks), so sorting keeps the snapshot
 * focused on routes rather than on where the domain module happened to be
 * imported in the assembler.
 */
function flattenRoutes(
  routes: RouteObject[],
  parentPath = '',
  ancestors: string[] = [],
): SnapshotEntry[] {
  return routes.flatMap(route => {
    const path = joinPath(parentPath, route.path);
    const entry: SnapshotEntry = {
      path,
      id: route.id ?? null,
      ancestors,
      index: route.index === true,
      caseSensitive: route.caseSensitive ?? null,
      element: componentName(route.element),
      errorElement: componentName(route.errorElement),
      hydrateFallbackElement: componentName(route.hydrateFallbackElement),
      loader: functionName(route.loader),
      action: functionName(route.action),
      hasLazy: typeof route.lazy === 'function',
      handle: route.handle ?? null,
    };
    const childAncestors = [...ancestors, route.id ?? path];
    const children = route.children ? flattenRoutes(route.children, path, childAncestors) : [];
    return [entry, ...children];
  });
}

function sortedEntries(routes: RouteObject[]): SnapshotEntry[] {
  return flattenRoutes(routes).sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );
}

describe('router-tree parity', () => {
  it('keeps every route path, id, loader and element wired as recorded', async () => {
    const entries = sortedEntries(buildAppRoutes());

    if (UPDATE_SNAPSHOT) {
      console.log(`${SNAPSHOT_MARKER}${JSON.stringify(entries)}`);
      return;
    }

    const snapshot = (await import('../fixtures/router-tree.parity.json')).default as SnapshotEntry[];
    expect(entries).toEqual(snapshot);
  });

  it.each([
    ['/', 'root-index'],
    ['/connect', 'connect'],
    ['/login', 'login'],
    ['/invite/token', 'invite'],
    ['/admin/routing', 'admin-routing'],
    ['/admin/providers/openai/keys', 'admin-provider-section'],
    ['/admin/providers/openai', 'admin-provider-detail'],
    ['/admin/customers', 'admin-customers'],
    ['/workspaces/alpha', 'workspace-overview'],
    ['/workspaces/alpha/routing/routing-a', 'workspace-routing'],
    ['/workspaces/alpha/keys/key-1', 'workspace-key-detail'],
    ['/workspaces/alpha/guardrails/rules', 'workspace-guardrails-legacy'],
    ['/workspaces/alpha/evaluations/baseline/runs/run-1', 'workspace-evaluation-run'],
    ['/generations/session-1', 'generations-index'],
    ['/models/gpt-5', 'models'],
    ['/settings/appearance', 'account-settings'],
    ['/workspaces/alpha/unknown/deep', 'workspace-not-found'],
  ])('matches %s to route id %s', (path, expectedId) => {
    const matches = matchRoutes(buildAppRoutes(), path);
    expect(matches?.at(-1)?.route.id).toBe(expectedId);
  });
});
