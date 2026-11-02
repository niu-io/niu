import type { LoaderFunctionArgs } from 'react-router';
import { loadCriticalRouteEndpoint, routeShouldRevalidate, useOptionalRouteLoaderData } from '@/lib/route-data';
import ConnectGate from '@/shell/ConnectGate';
import { useDashboardContext } from '@/shell/dashboard-context';
import type { RouteHandle } from '@/shell/router-context';
import { workspaceKeyPath } from './api';
import KeyDetailView from './components/KeyDetailView';

export const handle: RouteHandle = {
  destination: 'Workspace',
  navTo: 'keys',
  title: { en: 'API key', zh: 'API 密钥' },
};

export function clientLoader(args: LoaderFunctionArgs) {
  return loadCriticalRouteEndpoint(args, ({ workspace }) => ({
    endpoint: workspace ? workspaceKeyPath(workspace.id) : null,
  }));
}

export const shouldRevalidate = routeShouldRevalidate;

export default function KeyDetailRoute() {
  useOptionalRouteLoaderData();
  const { workspace } = useDashboardContext();
  return <ConnectGate>
    {({ token, models, session }) => <KeyDetailView
      key={`${token}:${workspace?.id ?? ''}`}
      token={token}
      models={models.map(model => model.id)}
      canWrite={session?.permissions.write === true}
      canConfigureSpending={session?.kind === 'installation' || session?.operator?.role === 'owner'}
      initialScope={workspace ? { organizationId: workspace.organization_id, projectId: workspace.id } : null}
    />}
  </ConnectGate>;
}
