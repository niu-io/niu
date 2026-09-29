import ConnectGate from '@/app/ConnectGate';
import { useConsoleContext } from '@/app/console-context';
import NewKeyView from './components/NewKeyView';

export default function NewKeyRoute() {
  const { workspace } = useConsoleContext();
  return <ConnectGate>
    {({ token, models, session }) => <NewKeyView
      key={`${token}:${workspace?.id ?? ''}`}
      token={token}
      models={models.map(model => model.id)}
      canWrite={session?.permissions.write === true}
      initialScope={workspace ? { organizationId: workspace.organization_id, projectId: workspace.id } : null}
    />}
  </ConnectGate>;
}
