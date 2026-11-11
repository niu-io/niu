import { useLocale as useUILocale } from '@/shell/ui-locale';
import { FormSectionSkeleton, WorkspaceShellSkeleton } from '@/components/PageSkeletons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { loadCriticalRouteEndpoint, routeShouldRevalidate, useOptionalRouteLoaderData } from '@/lib/route-data';
import { canManagePlatform, useDashboardContext } from '@/shell/dashboard-context';
import { resolveProvider } from '@/shell/provider-route';
import { workspaceModelsHref } from '@/shell/workspace-route';
import ProviderAdministration from '@/features/provider-business/admin';
import { Navigate, useLocation, useParams, useSearchParams, type LoaderFunctionArgs } from 'react-router';
import ProviderList from './ProviderList';
import ProviderSettings from '@/features/provider-business/ProviderSettings';
import ConnectGate from '@/shell/ConnectGate';
import ProvidersView from './components/ProvidersView';

const validSections = new Set(["overview", "keys", "models", "usage", "settlements", "members", "settings"]);

export function clientLoader(args: LoaderFunctionArgs) {
  return loadCriticalRouteEndpoint(args, ({ snapshot }) => ({
    authorized: canManagePlatform(snapshot.session),
    endpoint: '/api/v1/providers',
    persist: true,
  }));
}

export const shouldRevalidate = routeShouldRevalidate;

export default function ProvidersRoute() {
  const { t: uiT } = useUILocale();
  useOptionalRouteLoaderData();
  const { providerId, supplierId, section } = useParams();
  const activeProviderId = providerId ?? supplierId;
  const context = useDashboardContext();
  const [search] = useSearchParams();
  const location = useLocation();
  if (!activeProviderId) return <ProviderList />;
  if (context.providerDirectory && !resolveProvider(activeProviderId, context.providerDirectory)) {
    if (context.providerDirectoryLoading) {
      return <WorkspaceShellSkeleton label={uiT("Loading Provider…")} />;
    }
    if (context.providerDirectoryError) {
      // An empty directory after a failed request does not prove the Provider is
      // gone. Keep the route recoverable instead of reporting a false 404.
      return <Alert variant="destructive">
        <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
          <span>{uiT("The Provider directory could not be loaded. Retry before opening this Provider.")}</span>
          {context.reloadProviderDirectory && <Button variant="outline" size="sm" onClick={context.reloadProviderDirectory}>{uiT("Retry Provider directory")}</Button>}
        </AlertDescription>
      </Alert>;
    }
    return <p role="status">{uiT("Provider unavailable.")}</p>;
  }
  if (search.get("properties") === "supplier" || search.get("properties") === "provider") {
    const query = new URLSearchParams(search);
    query.delete('properties');
    return <Navigate replace to={`/admin/providers/${encodeURIComponent(activeProviderId)}/settings${query.size ? '?' + query.toString() : ''}${location.hash}`} />;
  }
  if (section && !validSections.has(section)) {
    return <Navigate replace to={`/admin/providers/${encodeURIComponent(activeProviderId)}${location.search}${location.hash}`} />;
  }
  if (context.session?.operating_mode === 'internal' && (section === 'settlements' || section === 'members')) {
    return <Navigate replace to={`/admin/providers/${encodeURIComponent(activeProviderId)}`} />;
  }
  if (section === "settings") return <ProviderSettings key={activeProviderId} />;
  if (section !== "keys") return <ProviderAdministration />;
  return <ConnectGate>
    {({ token, session, refreshWorkspace }) => session
      ? <ProvidersView key={`${token}:${activeProviderId}`} token={token} session={session} refreshWorkspace={refreshWorkspace} catalogPath={workspaceModelsHref(context.workspace, context.workspaces)} providerSlug={activeProviderId} organizationId={context.organization?.id} />
      : <section className="panel vendor-loading"><FormSectionSkeleton fields={2} label={uiT("Checking session permissions…")} /></section>}
  </ConnectGate>;
}
