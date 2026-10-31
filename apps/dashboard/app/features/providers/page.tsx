import { FormSectionSkeleton, WorkspaceShellSkeleton } from '@/components/PageSkeletons';
import { loadCriticalRouteEndpoint, routeShouldRevalidate, useOptionalRouteLoaderData } from '@/lib/route-data';
import { canManagePlatform, useDashboardContext } from '@/shell/dashboard-context';
import { resolveProvider } from '@/shell/provider-route';
import ProviderAdministration from '@/features/provider-business/admin';
import { Navigate, useLocation, useParams, useSearchParams, type LoaderFunctionArgs } from 'react-router';
import ProviderList from './ProviderList';
import ProviderSettings from '@/features/provider-business/ProviderSettings';
import ConnectGate from '@/shell/ConnectGate';
import ProvidersView from './components/ProvidersView';

const validSections = new Set(["overview", "keys", "models", "usage", "settlements", "members", "settings"]);

export function loader(args: LoaderFunctionArgs) {
  return loadCriticalRouteEndpoint(args, ({ snapshot }) => ({
    authorized: canManagePlatform(snapshot.session),
    endpoint: '/api/v1/providers',
    persist: true,
  }));
}

export const shouldRevalidate = routeShouldRevalidate;

export default function ProvidersRoute() {
  useOptionalRouteLoaderData();
  const { providerId, supplierId, section } = useParams();
  const activeProviderId = providerId ?? supplierId;
  const context = useDashboardContext();
  const [search] = useSearchParams();
  const location = useLocation();
  if (!activeProviderId) return <ProviderList />;
  if (context.providerDirectory && !resolveProvider(activeProviderId, context.providerDirectory)) {
    return context.providerDirectoryLoading
      ? <WorkspaceShellSkeleton label="Loading Provider…" />
      : <p role="status">Provider unavailable.</p>;
  }
  if (search.get("properties") === "supplier" || search.get("properties") === "provider") {
    const query = new URLSearchParams(search);
    query.delete('properties');
    return <Navigate replace to={`/admin/providers/${encodeURIComponent(activeProviderId)}/settings${query.size ? '?' + query.toString() : ''}${location.hash}`} />;
  }
  if (section && !validSections.has(section)) {
    return <Navigate replace to={`/admin/providers/${encodeURIComponent(activeProviderId)}${location.search}${location.hash}`} />;
  }
  if (section === "settings") return <ProviderSettings key={activeProviderId} />;
  if (section !== "keys") return <ProviderAdministration />;
  return <ConnectGate>
    {({ token, session, refreshWorkspace }) => session
      ? <ProvidersView key={`${token}:${activeProviderId}`} token={token} session={session} refreshWorkspace={refreshWorkspace} catalogPath="/models" />
      : <section className="panel vendor-loading"><FormSectionSkeleton fields={2} label="Checking session permissions…" /></section>}
  </ConnectGate>;
}
