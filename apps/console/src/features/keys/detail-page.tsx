import ConnectGate from '@/app/ConnectGate';
import { useConsoleContext } from '@/app/console-context';
import KeyDetailView from './components/KeyDetailView';

export default function KeyDetailRoute() {
  const { workspace } = useConsoleContext();
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
