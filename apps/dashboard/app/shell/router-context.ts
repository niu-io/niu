import { createContext, RouterContextProvider } from 'react-router';
import type { AdminSession, Organization, Workspace } from './dashboard-context';

export function buildSessionPrincipalKey(
  token: string,
  session: AdminSession | null | undefined,
): string {
  if (!token || !session) return '';
  if (session.kind === 'installation') {
    return `installation::${token}`;
  }
  return `operator::${session.operator?.id ?? 'unknown'}::${session.operator?.organization_id ?? ''}`;
}

export function buildSessionAuthorityKey(
  token: string,
  session: AdminSession | null | undefined,
): string {
  if (!token || !session) return '';
  const principal = buildSessionPrincipalKey(token, session);
  const role = session.operator?.role ?? '';
  const projectId = session.operator?.project_id ?? '';
  const perms = `${session.permissions?.read ? 1 : 0}${session.permissions?.write ? 1 : 0}${
    session.permissions?.manage_operators ? 1 : 0
  }${session.permissions?.platform_admin ? 1 : 0}`;
  const providers = (session.provider_memberships ?? [])
    .map(item => `${item.id}:${item.role}`)
    .sort()
    .join(',');
  return `${principal}::${token}::${role}::${projectId}::${perms}::${providers}`;
}

export type RouterSessionSnapshot = {
  token: string;
  principalKey: string;
  authorityKey: string;
  session: AdminSession | null;
  organizations: Organization[];
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
};

/** React Router v8 Data Mode typed loader/action context populated via `getContext`. */
export const dashboardRouterContext = createContext<RouterSessionSnapshot | null>(null);

export type RouteHandle = {
  destination?: 'Workspace' | 'Global' | 'Models' | 'Administration' | 'Organization';
  title?: { en: string; zh: string };
  section?: string;
};

const emptySnapshot: RouterSessionSnapshot = {
  token: '',
  principalKey: '',
  authorityKey: '',
  session: null,
  organizations: [],
  workspaces: [],
  activeWorkspace: null,
};

let currentSnapshot: RouterSessionSnapshot = emptySnapshot;

export function getActiveSessionSnapshot(): RouterSessionSnapshot {
  return currentSnapshot;
}

export function setActiveSessionSnapshot(next: RouterSessionSnapshot): void {
  currentSnapshot = next;
}

export function resetActiveSessionSnapshot(): void {
  currentSnapshot = emptySnapshot;
}

export function createRouterContextProvider(): RouterContextProvider {
  const provider = new RouterContextProvider();
  provider.set(dashboardRouterContext, currentSnapshot);
  return provider;
}

export function readRouterSessionSnapshot(context: unknown): RouterSessionSnapshot {
  if (context && typeof (context as RouterContextProvider).get === 'function') {
    try {
      const value = (context as RouterContextProvider).get(dashboardRouterContext);
      if (value) return value;
    } catch {
      // Fallback when a test mounts bare createMemoryRouter(appRoutes) without getContext.
    }
  }
  return currentSnapshot;
}
