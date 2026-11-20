import type { LoaderFunctionArgs } from 'react-router';
import { loadCriticalRouteEndpoint, routeShouldRevalidate, useOptionalRouteLoaderData } from '@/lib/route-data';
import { useDashboardContext } from '@/shell/dashboard-context';
import WorkspaceDirectory from './WorkspaceDirectory';

export function clientLoader(args: LoaderFunctionArgs) {
  return loadCriticalRouteEndpoint(args, () => ({
    endpoint: '/api/v1/workspaces',
    persist: true,
  }));
}

export const shouldRevalidate = routeShouldRevalidate;

export default function WorkspacesPage() {
  useOptionalRouteLoaderData();
  return <WorkspaceDirectory context={useDashboardContext()} />;
}
