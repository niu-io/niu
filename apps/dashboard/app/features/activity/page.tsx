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
  const { workspace, session } = useDashboardContext();
  const scope = workspace ? { organizationId: workspace.organization_id, projectId: workspace.id } : null;
  const isInternalMode = session?.operating_mode === 'internal';
  return <ConnectGate>
    {({ token, models }) => <GatewayActivity
      key={`${token}:${workspace?.id ?? ''}`}
      token={token}
      models={models.map(model => model.id)}
      initialScope={scope}
      statisticsOnly
      hideBillingLink={isInternalMode}
      headerAction={!isInternalMode ? <Button variant="outline" size="sm" asChild><Link to="../billing" relative="path">{t('Billing and rates', '账单与费率')}</Link></Button> : undefined}
    />}
  </ConnectGate>;
}
