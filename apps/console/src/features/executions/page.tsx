import { useNavigate, useSearchParams } from 'react-router';
import ConnectGate from '@/app/ConnectGate';
import type { ScopeFocus } from './api';
import ExecutionWorkspace from './components/ExecutionWorkspace';

function readScope(params: URLSearchParams): ScopeFocus | null {
  const organizationId = params.get('organizationId');
  const projectId = params.get('projectId');
  if (!organizationId || !projectId) return null;
  return { organizationId, projectId, executionId: params.get('executionId') ?? undefined };
}

export default function ExecutionsRoute() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialScope = readScope(params);

  return <ConnectGate title="Executions" subtitle="Connect to import and inspect task execution metadata.">
    {({ token }) => <ExecutionWorkspace
      key={token}
      token={token}
      initialScope={initialScope}
      onOpenSubscription={(organizationId, projectId, accountId) => {
        const query = new URLSearchParams({ organizationId, projectId, accountId });
        void navigate(`/subscriptions?${query.toString()}`);
      }}
    />}
  </ConnectGate>;
}
