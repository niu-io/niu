import ConnectGate from '@/app/ConnectGate';
import { useDashboardContext } from '@/app/dashboard-context';
import KeyDetailView from './components/KeyDetailView';

export default function KeyDetailRoute() {
  const { workspace } = useDashboardContext();
  return <ConnectGate>
    {({ token, models, session }) => <KeyDetailView
      key={`${token}:${workspace?.id ?? ''}`}
      token={token}
      models={models.map(model => model.id)}
      canWrite={session?.permissions.write === true}
      initialScope={workspace ? { organizationId: workspace.organization_id, projectId: workspace.id } : null}
    />}
  </ConnectGate>;
}
