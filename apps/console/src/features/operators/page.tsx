import ConnectGate from '@/app/ConnectGate';
import OperatorsView from './components/OperatorsView';

export default function OperatorsRoute() {
  return <ConnectGate>
    {({ token, session, refreshWorkspace, organization }) => session
      ? <OperatorsView key={`${token}:${organization?.id}`} initialOrganization={organization?.id} token={token} session={session} refreshWorkspace={refreshWorkspace} />
      : <section className="panel operator-loading" role="status">Checking session permissions…</section>}
  </ConnectGate>;
}
