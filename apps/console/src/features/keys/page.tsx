import ConnectGate from '@/app/ConnectGate';
import { useConsoleContext } from '@/app/console-context';
import KeysView from './components/KeysView';

export default function KeysRoute() {
  const { workspace } = useConsoleContext();
  return <ConnectGate subtitle="Issue keys for the selected workspace.">
    {({ token, models, session }) => <KeysView
      key={`${token}:${workspace?.id ?? ''}`}
      token={token}
      models={models.map(model => model.id)}
      initialScope={workspace ? { organizationId: workspace.organization_id, projectId: workspace.id } : null}
      canWrite={session?.permissions.write === true}
    />}
  </ConnectGate>;
}
