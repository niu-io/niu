import { useNavigate, useSearchParams } from 'react-router';
import ConnectGate from '@/app/ConnectGate';
import type { ScopeFocus } from './types';
import SubscriptionsView from './components/SubscriptionsView';

export default function SubscriptionsRoute() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const organizationId = params.get('organizationId');
  const projectId = params.get('projectId');
  const accountId = params.get('accountId');
  const initialScope: ScopeFocus | null = organizationId && projectId
    ? { organizationId, projectId, accountId: accountId ?? undefined }
    : null;

  return <ConnectGate title="Subscriptions" subtitle="Inspect provider-reported quota windows and resets.">
    {({ token }) => <SubscriptionsView
      key={token}
      token={token}
      initialScope={initialScope}
      onOpenExecution={(organizationId, projectId, executionId) => {
        const query = new URLSearchParams({ organizationId, projectId, executionId });
        void navigate(`/executions?${query.toString()}`);
      }}
    />}
  </ConnectGate>;
}
