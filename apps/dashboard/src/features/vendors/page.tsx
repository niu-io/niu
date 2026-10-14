import ProviderAdministration from '@/features/provider-business/admin';
import { Navigate, useLocation, useParams, useSearchParams } from 'react-router';
import SupplierList from './SupplierList';
import SupplierSettings from '@/features/provider-business/SupplierSettings';
import ConnectGate from '@/app/ConnectGate';
import SuppliersView from './components/SuppliersView';

export default function SuppliersRoute() {
  const { supplierId, section } = useParams();
  const [search] = useSearchParams();
  const location = useLocation();
  if (!supplierId) return <SupplierList />;
  if (search.get("properties") === "supplier") {
    const query = new URLSearchParams(search);
    query.delete('properties');
    return <Navigate replace to={`/admin/suppliers/${encodeURIComponent(supplierId)}/settings${query.size ? '?' + query.toString() : ''}${location.hash}`} />;
  }
  if (section === "settings") return <SupplierSettings key={supplierId} />;
  if (section !== "configuration") return <ProviderAdministration />;
  return <ConnectGate>
    {({ token, session, refreshWorkspace }) => session
      ? <SuppliersView key={token} token={token} session={session} refreshWorkspace={refreshWorkspace} catalogPath="/models" />
      : <section className="panel vendor-loading" role="status">Checking session permissions…</section>}
  </ConnectGate>;
}
