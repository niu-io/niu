import ConnectGate from '@/app/ConnectGate';
import KeysView from './components/KeysView';

export default function KeysRoute() {
  return <ConnectGate title="API keys" subtitle="Manage organizations, projects and client keys.">
    {({ token, models }) => <KeysView key={token} token={token} models={models.map(model => model.id)} />}
  </ConnectGate>;
}
