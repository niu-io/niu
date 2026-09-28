import { workspacePathSegment } from '@/app/workspace-route';
import ConnectGate from '@/app/ConnectGate';
import VendorsView from './components/VendorsView';

export default function VendorsRoute() {
  return <ConnectGate>
    {({ token, session, refreshWorkspace, workspace, workspaces }) => session
      ? <VendorsView key={token} token={token} session={session} refreshWorkspace={refreshWorkspace} catalogPath={workspace ? `/workspaces/${workspacePathSegment(workspace, workspaces)}/models` : '/workspaces/default/models'} />
      : <section className="panel vendor-loading" role="status">Checking session permissions…</section>}
  </ConnectGate>;
}
