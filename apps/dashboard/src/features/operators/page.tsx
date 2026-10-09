import ConnectGate from '@/app/ConnectGate';
import OperatorsView from './components/OperatorsView';

export default function OperatorsRoute() {
  return <ConnectGate>
    {({ token, session, refreshWorkspace, organization, workspace }) => session
      ? <OperatorsView key={`${token}:${organization?.id}:${workspace?.id}`} initialOrganization={workspace?.organization_id ?? organization?.id} initialWorkspace={workspace?.id} token={token} session={session} refreshWorkspace={refreshWorkspace} />
      : <section className="panel operator-loading" role="status">Checking session permissions…</section>}
  </ConnectGate>;
}
