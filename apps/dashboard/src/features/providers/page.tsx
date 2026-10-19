import ProviderAdministration from '@/features/provider-business/admin';
import { Navigate, useLocation, useParams, useSearchParams } from 'react-router';
import ProviderList from './ProviderList';
import ProviderSettings from '@/features/provider-business/ProviderSettings';
import ConnectGate from '@/app/ConnectGate';
import ProvidersView from './components/ProvidersView';

const validSections = new Set(["overview", "configuration", "models", "consumption", "settlements", "members", "settings"]);

export default function ProvidersRoute() {
  const { providerId, supplierId, section } = useParams();
  const activeProviderId = providerId ?? supplierId;
  const [search] = useSearchParams();
  const location = useLocation();
  if (!activeProviderId) return <ProviderList />;
  if (search.get("properties") === "supplier" || search.get("properties") === "provider") {
    const query = new URLSearchParams(search);
    query.delete('properties');
    return <Navigate replace to={`/admin/providers/${encodeURIComponent(activeProviderId)}/settings${query.size ? '?' + query.toString() : ''}${location.hash}`} />;
  }
  if (section && !validSections.has(section)) {
    return <Navigate replace to={`/admin/providers/${encodeURIComponent(activeProviderId)}${location.search}${location.hash}`} />;
  }
  if (section === "settings") return <ProviderSettings key={activeProviderId} />;
  if (section !== "configuration") return <ProviderAdministration />;
  return <ConnectGate>
    {({ token, session, refreshWorkspace }) => session
      ? <ProvidersView key={`${token}:${activeProviderId}`} token={token} session={session} refreshWorkspace={refreshWorkspace} catalogPath="/models" />
      : <section className="panel vendor-loading" role="status">Checking session permissions…</section>}
  </ConnectGate>;
}
