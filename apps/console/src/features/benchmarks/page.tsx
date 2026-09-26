import ConnectGate from '@/app/ConnectGate';
import BenchmarksView from './components/BenchmarksView';

export default function BenchmarksRoute() {
  return <ConnectGate title="Benchmarks" subtitle="Analyze matched task evidence and compare measured outcomes.">
    {({ token }) => <BenchmarksView key={token} token={token} />}
  </ConnectGate>;
}
