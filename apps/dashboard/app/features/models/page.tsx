import { useLocale as useUILocale } from '@/shell/ui-locale';
import type { LoaderFunctionArgs } from 'react-router';
import { IconRefresh as RefreshCw } from "@tabler/icons-react";
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { loadCriticalRouteEndpoint, routeShouldRevalidate, useOptionalRouteLoaderData } from '@/lib/route-data';
import PageHeader from '@/components/PageHeader';
import { TableSkeleton } from '@/components/PageSkeletons';
import ConnectGate from '@/shell/ConnectGate';
import ModelTable from './components/ModelTable';

import type { RouteHandle } from '@/shell/router-context';

export const handle: RouteHandle = {
  destination: 'Workspace',
  navTo: 'models',
  title: { en: 'Models', zh: '模型' },
};

export function clientLoader(args: LoaderFunctionArgs) {
  return loadCriticalRouteEndpoint(args, ({ workspace }) => ({
    endpoint: workspace
      ? `/api/v1/models?organization_id=${encodeURIComponent(workspace.organization_id)}&project_id=${encodeURIComponent(workspace.id)}`
      : null,
    persist: true,
  }));
}

export const shouldRevalidate = routeShouldRevalidate;

export default function ModelsRoute() {
  const { t: uiT } = useUILocale();
  useOptionalRouteLoaderData();
  return <ConnectGate>
    {({ models, modelsLoading, modelsError, refreshModels }) => {
      const header = (
        <PageHeader
          title={uiT("Models")}
          action={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={modelsLoading ? uiT("Refreshing…") : uiT("Refresh")}
              title={modelsLoading ? uiT("Refreshing…") : uiT("Refresh")}
              disabled={modelsLoading}
              onClick={() => void refreshModels()}
              type="button"
            >
              <RefreshCw size={15} className={modelsLoading ? 'animate-spin' : undefined} />
            </Button>
          }
        />
      );
      const failure = modelsError && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>
            {uiT(modelsError)}
            <Button variant="ghost" disabled={modelsLoading} onClick={() => void refreshModels()}>
              {uiT("Retry model catalog")}
            </Button>
          </AlertDescription>
        </Alert>
      );
      return !models.length && (modelsLoading || modelsError)
        ? <>{header}{failure}{modelsLoading && <TableSkeleton columns={5} rows={8} label={uiT("Loading model catalog…")} />}</>
        : <ModelTable models={models} header={<>{header}{failure}</>} />;
    }}
  </ConnectGate>;
}
