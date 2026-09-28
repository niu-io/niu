import ConnectGate from '@/app/ConnectGate';
import { useConsoleContext } from '@/app/console-context';
import PlaygroundView from './components/PlaygroundView';

export default function PlaygroundRoute() {
  const { session, workspace } = useConsoleContext();
  const initialScope = workspace ? {
    organizationId: workspace.organization_id,
    projectId: workspace.id,
    organizationName: workspace.organization_name,
    workspaceName: workspace.name,
  } : null;

  return <ConnectGate subtitle="Compare real model responses through your Niu gateway.">
    {({ token, models }) => <PlaygroundView
      key={`${token}:${workspace?.id ?? ''}`}
      token={token}
      models={models.map(model => model.id)}
      canCreateKeys={session?.permissions.write === true}
      initialScope={initialScope}
    />}
  </ConnectGate>;
}
