import { useSearchParams } from 'react-router';
import ConnectGate from '@/app/ConnectGate';
import type { ScopeFocus } from './api';
import ExecutionWorkspace from './components/ExecutionWorkspace';
import GatewayActivity from './components/GatewayActivity';
import { useConsoleContext } from '@/app/console-context';

function readScope(params: URLSearchParams): ScopeFocus | null {
  const organizationId = params.get('organizationId');
  const projectId = params.get('projectId');
  if (!organizationId || !projectId) return null;
  return { organizationId, projectId, executionId: params.get('executionId') ?? undefined };
}

export default function ExecutionsRoute() {
  const [params] = useSearchParams();
  const { workspace } = useConsoleContext();
  const detailScope = readScope(params);
  const initialScope = workspace
    ? { organizationId: workspace.organization_id, projectId: workspace.id, executionId: detailScope?.executionId }
    : detailScope;

  return <ConnectGate>
    {({ token, models }) => <>
      <GatewayActivity
        key={`${token}:${workspace?.id ?? ''}:${params.get('keyId') ?? ''}`}
        token={token}
        models={models.map(model => model.id)}
        initialScope={initialScope}
        preferredModelAlias={params.get('modelAlias') ?? undefined}
        preferredKeyId={params.get('keyId') ?? undefined}
      />
      {initialScope?.executionId && <ExecutionWorkspace token={token} initialScope={initialScope} embedded />}
    </>}
  </ConnectGate>;
}
