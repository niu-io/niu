import ConnectGate from '@/app/ConnectGate';
import BenchmarksView from './components/BenchmarksView';

export default function BenchmarksRoute() {
  return <ConnectGate>
    {({ token }) => <BenchmarksView key={token} token={token} />}
  </ConnectGate>;
}
