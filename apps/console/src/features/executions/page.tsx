import { useSearchParams } from 'react-router';
import ConnectGate from '@/app/ConnectGate';
import type { ScopeFocus } from './api';
import GatewayActivity from './components/GatewayActivity';

function readScope(params: URLSearchParams): ScopeFocus | null {
  const organizationId = params.get('organizationId');
  const projectId = params.get('projectId');
  if (!organizationId || !projectId) return null;
  return { organizationId, projectId };
}

export default function ExecutionsRoute() {
  const [params] = useSearchParams();
  const initialScope = readScope(params);

  return <ConnectGate title="Tasks" subtitle="Niu automatically captures model usage and cost for every request routed through the gateway.">
    {({ token, models }) => <GatewayActivity
      key={token}
      token={token}
      models={models.map(model => model.id)}
      initialScope={initialScope}
    />}
  </ConnectGate>;
}
