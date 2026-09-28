import { useNavigate, useSearchParams } from 'react-router';
import ConnectGate from '@/app/ConnectGate';
import { useConsoleContext } from '@/app/console-context';
import type { ScopeFocus } from './types';
import SubscriptionsView from './components/SubscriptionsView';

export default function SubscriptionsRoute() {
  const { workspace } = useConsoleContext();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const organizationId = params.get('organizationId');
  const projectId = params.get('projectId');
  const accountId = params.get('accountId');
  const initialScope: ScopeFocus | null = organizationId && projectId
    ? { organizationId, projectId, accountId: accountId ?? undefined }
    : null;

  return <ConnectGate subtitle="Inspect provider-reported quota windows and resets.">
    {({ token }) => <SubscriptionsView
      key={`${token}:${workspace?.id ?? ''}`}
      token={token}
      initialScope={workspace ? { organizationId: workspace.organization_id, projectId: workspace.id, accountId: initialScope?.accountId } : initialScope}
      onOpenExecution={(organizationId, projectId, executionId) => {
        const query = new URLSearchParams({ organizationId, projectId, executionId });
        void navigate(`/executions?${query.toString()}`);
      }}
    />}
  </ConnectGate>;
}
