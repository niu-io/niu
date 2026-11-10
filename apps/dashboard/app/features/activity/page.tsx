import { Link, type LoaderFunctionArgs } from 'react-router';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/shell/ui-locale';
import { loadCriticalRouteEndpoint, routeShouldRevalidate, useOptionalRouteLoaderData } from '@/lib/route-data';
import { useDashboardContext } from '@/shell/dashboard-context';
import ConnectGate from '@/shell/ConnectGate';
import GatewayActivity from '@/features/executions/components/GatewayActivity';

export function clientLoader(args: LoaderFunctionArgs) {
  return loadCriticalRouteEndpoint(args, ({ workspace }) => ({
    endpoint: workspace
      ? `/api/v1/organizations/${workspace.organization_id}/projects/${workspace.id}/requests?limit=100`
      : null,
  }));
}

export const shouldRevalidate = routeShouldRevalidate;

export default function ActivityRoute() {
  useOptionalRouteLoaderData();
  const { t } = useLocale();
  const { workspace } = useDashboardContext();
  const scope = workspace ? { organizationId: workspace.organization_id, projectId: workspace.id } : null;
  return <ConnectGate>
    {({ token, models }) => <><div className="mb-4 flex justify-end"><Button variant="outline" asChild><Link to="../billing" relative="path">{t('Workspace statements', '工作空间账单')}</Link></Button></div><GatewayActivity
      key={`${token}:${workspace?.id ?? ''}`}
      token={token}
      models={models.map(model => model.id)}
      initialScope={scope}
      statisticsOnly
    /></>}
  </ConnectGate>;
}
