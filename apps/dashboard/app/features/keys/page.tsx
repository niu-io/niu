import type { LoaderFunctionArgs } from 'react-router';
import { loadCriticalRouteEndpoint, routeShouldRevalidate, useOptionalRouteLoaderData } from '@/lib/route-data';
import ConnectGate from '@/shell/ConnectGate';
import { useDashboardContext } from '@/shell/dashboard-context';
import { useModelPopularity } from '@/shell/useModelPopularity';
import type { RouteHandle } from '@/shell/router-context';
import { workspaceKeyPagePath, type ProjectKey } from './api';
import KeysView from './components/KeysView';

export const handle: RouteHandle = {
  destination: 'Workspace',
  navTo: 'keys',
  title: { en: 'API keys', zh: 'API 密钥' },
};

export function clientLoader(args: LoaderFunctionArgs) {
  return loadCriticalRouteEndpoint<{ data: ProjectKey[]; next_cursor?: string | null }>(args, ({ workspace }) => ({
    endpoint: workspace ? workspaceKeyPagePath(workspace.id) : null,
  }));
}

export const shouldRevalidate = routeShouldRevalidate;

export default function KeysRoute() {
  const loaderSnapshot = useOptionalRouteLoaderData<{ data: ProjectKey[]; next_cursor?: string | null }>();
  const { workspace, models: configuredModels, token } = useDashboardContext();
  const ranked = useModelPopularity(configuredModels, token, workspace?.organization_id, workspace?.id);
  const loaderPage =
    loaderSnapshot?.status === 'ready' && loaderSnapshot.workspaceId === (workspace?.id ?? null)
      ? loaderSnapshot.data
      : undefined;
  return <ConnectGate>
    {({ token, session }) => <KeysView
      key={`${token}:${workspace?.id ?? ''}`}
      token={token}
      models={ranked.models}
      initialScope={workspace ? { organizationId: workspace.organization_id, projectId: workspace.id } : null}
      canWrite={session?.permissions.write === true}
      loaderKeys={loaderPage?.data}
      loaderNextCursor={loaderPage?.next_cursor ?? null}
    />}
  </ConnectGate>;
}
