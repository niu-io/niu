import type { LoaderFunctionArgs } from 'react-router';
import { loadCriticalRouteEndpoint, routeShouldRevalidate, useOptionalRouteLoaderData } from '@/lib/route-data';
import ConnectGate from '@/shell/ConnectGate';
import { useDashboardContext } from '@/shell/dashboard-context';
import { useModelPopularity } from '@/shell/useModelPopularity';
import { workspaceKeyPath, type ProjectKey } from './api';
import KeysView from './components/KeysView';

export function loader(args: LoaderFunctionArgs) {
  return loadCriticalRouteEndpoint<{ data: ProjectKey[] }>(args, ({ workspace }) => ({
    endpoint: workspace ? workspaceKeyPath(workspace.id) : null,
  }));
}

export const shouldRevalidate = routeShouldRevalidate;

export default function KeysRoute() {
  const loaderSnapshot = useOptionalRouteLoaderData<{ data: ProjectKey[] }>();
  const { workspace, models: configuredModels, token } = useDashboardContext();
  const ranked = useModelPopularity(configuredModels, token, workspace?.organization_id, workspace?.id);
  const loaderKeys =
    loaderSnapshot?.status === 'ready' && loaderSnapshot.workspaceId === (workspace?.id ?? null)
      ? loaderSnapshot.data.data
      : undefined;
  return <ConnectGate>
    {({ token, session }) => <KeysView
      key={`${token}:${workspace?.id ?? ''}`}
      token={token}
      models={ranked.models}
      initialScope={workspace ? { organizationId: workspace.organization_id, projectId: workspace.id } : null}
      canWrite={session?.permissions.write === true}
      loaderKeys={loaderKeys}
    />}
  </ConnectGate>;
}
