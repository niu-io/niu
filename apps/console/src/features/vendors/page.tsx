import ConnectGate from '@/app/ConnectGate';
import PageHeader from '@/components/PageHeader';
import VendorsView from './components/VendorsView';

export default function VendorsRoute() {
  return <ConnectGate title="Vendors" subtitle="Manage provider connections, credentials, and model routes.">
    {({ token, session, refreshWorkspace }) => session
      ? <VendorsView key={token} token={token} session={session} refreshWorkspace={refreshWorkspace} />
      : <><PageHeader title="Vendors" subtitle="Confirming the current session and its permissions." /><section className="panel vendor-loading" role="status">Checking session permissions…</section></>}
  </ConnectGate>;
}
