import { Link, type LoaderFunctionArgs } from 'react-router';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { CreditCard, MoreHorizontal } from 'lucide-react';
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
      headerAction={!isInternalMode ? <>
        <Button variant="outline" size="sm" className="hidden sm:inline-flex" asChild><Link to="../billing" relative="path">{t('Billing and rates', '账单与费率')}</Link></Button>
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="sm:hidden" aria-label={t('Usage actions', '用量操作')}><MoreHorizontal size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem asChild><Link to="../billing" relative="path"><CreditCard size={16} />{t('Billing and rates', '账单与费率')}</Link></DropdownMenuItem></DropdownMenuContent></DropdownMenu>
      </> : undefined}
    />}
  </ConnectGate>;
}
