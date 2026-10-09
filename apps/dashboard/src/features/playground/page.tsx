import { useSearchParams } from 'react-router';
import VideoView from '../video/VideoView';
import ConnectGate from '@/app/ConnectGate';
import { useDashboardContext } from '@/app/dashboard-context';
import { useModelPopularity } from '@/app/useModelPopularity';
import PlaygroundView from './components/PlaygroundView';

export default function PlaygroundRoute() {
  const context = useDashboardContext();
  const [search] = useSearchParams();
  const { workspace, models, modelsLoading, modelsError, refreshModels, token } = context;
  const ranked = useModelPopularity(models, token, workspace?.organization_id, workspace?.id);
  const initialScope = workspace ? {
    organizationId: workspace.organization_id,
    workspaceId: workspace.id,
    organizationName: workspace.organization_name,
    workspaceName: workspace.name,
  } : null;

  if (search.get('mode') === 'video') return <ConnectGate>{context => <VideoView key={`${context.token}:${workspace?.id ?? ''}`} context={context} />}</ConnectGate>;

  return <ConnectGate>
    {({ token }) => <PlaygroundView
      key={`${token}:${workspace?.id ?? ''}`}
      token={token}
      models={ranked.models.map(model => model.id)}
      modelsLoading={modelsLoading}
      modelsError={modelsError}
      onRetryModels={refreshModels}
      initialScope={initialScope}
    />}
  </ConnectGate>;
}
