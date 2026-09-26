import ConnectGate from '@/app/ConnectGate';
import PageHeader from '@/components/PageHeader';
import OperatorsView from './components/OperatorsView';

export default function OperatorsRoute() {
  return <ConnectGate title="Operators" subtitle="Manage people who can access this Niu installation.">
    {({ token, session, refreshWorkspace }) => session
      ? <OperatorsView key={token} token={token} session={session} refreshWorkspace={refreshWorkspace} />
      : <><PageHeader title="Operators" subtitle="Confirming the current session and its permissions." /><section className="panel operator-loading" role="status">Checking session permissions…</section></>}
  </ConnectGate>;
}
