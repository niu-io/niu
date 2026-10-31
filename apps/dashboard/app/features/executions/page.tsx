import { useSearchParams, type LoaderFunctionArgs } from 'react-router';
import { loadCriticalRouteEndpoint, routeShouldRevalidate, useOptionalRouteLoaderData } from '@/lib/route-data';
import ConnectGate from '@/shell/ConnectGate';
import GatewayActivity from './components/GatewayActivity';
import { useDashboardContext } from '@/shell/dashboard-context';

export function loader(args: LoaderFunctionArgs) {
  return loadCriticalRouteEndpoint(args, ({ workspace }) => ({
    endpoint: workspace
      ? `/api/v1/organizations/${workspace.organization_id}/projects/${workspace.id}/requests?limit=100`
      : null,
  }));
}

export const shouldRevalidate = routeShouldRevalidate;

export default function ExecutionsRoute() {
  useOptionalRouteLoaderData();
  const [params] = useSearchParams();
  const { workspace } = useDashboardContext();
  const scope = workspace ? { organizationId: workspace.organization_id, projectId: workspace.id } : null;
  return <ConnectGate>
    {({ token, models }) => <GatewayActivity
      key={`${token}:${workspace?.id ?? ''}`}
      token={token}
      models={models.map(model => model.id)}
      initialScope={scope}
      preferredModelAlias={params.get('modelAlias') ?? undefined}
    />}
  </ConnectGate>;
}
