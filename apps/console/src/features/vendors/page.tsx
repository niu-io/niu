import ConnectGate from '@/app/ConnectGate';
import VendorsView from './components/VendorsView';

export default function VendorsRoute() {
  return <ConnectGate>
    {({ token, session, refreshWorkspace }) => session
      ? <VendorsView key={token} token={token} session={session} refreshWorkspace={refreshWorkspace} />
      : <section className="panel vendor-loading" role="status">Checking session permissions…</section>}
  </ConnectGate>;
}
