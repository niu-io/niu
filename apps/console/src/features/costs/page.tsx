import ConnectGate from '@/app/ConnectGate';
import CostsView from './components/CostsView';

export default function CostsRoute() {
  return <ConnectGate title="Usage & cost" subtitle="Inspect project accounting and configured lifetime budgets.">
    {({ token }) => <CostsView key={token} token={token} />}
  </ConnectGate>;
}
