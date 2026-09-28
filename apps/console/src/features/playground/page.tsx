import ConnectGate from '@/app/ConnectGate';
import { useConsoleContext } from '@/app/console-context';
import { useModelPopularity } from '@/app/useModelPopularity';
import PlaygroundView from './components/PlaygroundView';

export default function PlaygroundRoute() {
  const { workspace, models, token } = useConsoleContext();
  const ranked = useModelPopularity(models, token, workspace?.organization_id, workspace?.id);
  const initialScope = workspace ? {
    organizationId: workspace.organization_id,
    workspaceId: workspace.id,
    organizationName: workspace.organization_name,
    workspaceName: workspace.name,
  } : null;

  return <ConnectGate>
    {({ token }) => <PlaygroundView
      key={`${token}:${workspace?.id ?? ''}`}
      token={token}
      models={ranked.models.map(model => model.id)}
      initialScope={initialScope}
    />}
  </ConnectGate>;
}
