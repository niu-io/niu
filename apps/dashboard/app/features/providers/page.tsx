import { useEffect } from 'react';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { WorkspaceShellSkeleton } from '@/components/PageSkeletons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { loadCriticalRouteEndpoint, routeShouldRevalidate, useOptionalRouteLoaderData } from '@/lib/route-data';
import { canManagePlatform, useDashboardContext } from '@/shell/dashboard-context';
import { providerPathSegment, resolveProvider } from '@/shell/provider-route';
import ProviderAdministration from '@/features/provider-business/admin';
import ProviderConfigurationPage from '@/features/provider-business/ProviderConfigurationPage';
import { useLocation, useNavigate, useNavigation, useParams, useRevalidator, useSearchParams, type LoaderFunctionArgs } from 'react-router';
import ProviderList from './ProviderList';

const validSections = new Set(["usage"]);

function CanonicalProviderRedirect({ to }: { to: string }) {
  const navigate = useNavigate();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const location = useLocation();
  useEffect(() => {
    if (navigation.state !== 'idle' || revalidator.state !== 'idle') return;
    navigate(to, { replace: true });
  }, [location.pathname, location.search, navigate, navigation.state, revalidator.state, to]);
  return null;
}

export function clientLoader(args: LoaderFunctionArgs) {
  return loadCriticalRouteEndpoint(args, ({ snapshot }) => ({
    authorized: canManagePlatform(snapshot.session),
    endpoint: '/api/v1/admin/providers',
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
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(activeProviderId);
  const resolvedProvider = context.providerDirectory ? resolveProvider(activeProviderId, context.providerDirectory) : undefined;
  if (context.providerDirectory ? !resolvedProvider : (!isUuid && context.providerDirectoryLoading)) {
    if (context.providerDirectoryLoading || (!context.providerDirectory && !isUuid)) {
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
  const canonicalSegment = resolvedProvider ? providerPathSegment(resolvedProvider) : activeProviderId;
  if (search.get("properties") === "supplier" || search.get("properties") === "provider") {
    const query = new URLSearchParams(search);
    query.delete('properties');
    return (
      <>
        <CanonicalProviderRedirect to={`/admin/providers/${encodeURIComponent(canonicalSegment)}${query.size ? '?' + query.toString() : ''}${location.hash}`} />
        <ProviderConfigurationPage key={resolvedProvider?.id ?? activeProviderId} resolvedProviderId={resolvedProvider?.id} />
      </>
    );
  }
  if (section && !validSections.has(section)) {
    if (section === "settlements" && context.session?.operating_mode !== 'internal') {
      return (
        <>
          <CanonicalProviderRedirect to={`/admin/providers/${encodeURIComponent(canonicalSegment)}/usage${location.search}${location.hash}`} />
          <ProviderAdministration />
        </>
      );
    }
    return (
      <>
        <CanonicalProviderRedirect to={`/admin/providers/${encodeURIComponent(canonicalSegment)}${location.search}${location.hash}`} />
        <ProviderConfigurationPage key={resolvedProvider?.id ?? activeProviderId} resolvedProviderId={resolvedProvider?.id} />
      </>
    );
  }
  if (section === "usage") return <ProviderAdministration />;
  return <ProviderConfigurationPage key={resolvedProvider?.id ?? activeProviderId} resolvedProviderId={resolvedProvider?.id} />;
}
