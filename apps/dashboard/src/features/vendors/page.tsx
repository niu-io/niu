import ProviderAdministration from '@/features/provider-business/admin';
import { Navigate, useParams, useSearchParams } from 'react-router';
import SupplierList from './SupplierList';
import SupplierSettings from '@/features/provider-business/SupplierSettings';
import ConnectGate from '@/app/ConnectGate';
import { workspacePathSegment } from '@/app/workspace-route';
import SuppliersView from './components/SuppliersView';

export default function SuppliersRoute() {
  const { supplierId, section } = useParams();
  const [search] = useSearchParams();
  if (!supplierId) return <SupplierList />;
  if (search.get("properties") === "supplier") return <Navigate replace to={`/admin/suppliers/${encodeURIComponent(supplierId)}/settings`} />;
  if (section === "settings") return <SupplierSettings key={supplierId} />;
  if (section !== "configuration") return <ProviderAdministration />;
  return <ConnectGate>
    {({ token, session, refreshWorkspace, workspaces, workspace }) => session
      ? <SuppliersView key={token} token={token} session={session} refreshWorkspace={refreshWorkspace} workspaces={workspaces} catalogPath={`/models?workspace=${encodeURIComponent(workspace ? workspacePathSegment(workspace, workspaces) : 'default')}`} />
      : <section className="panel vendor-loading" role="status">Checking session permissions…</section>}
  </ConnectGate>;
}
