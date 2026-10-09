import ConnectGate from '@/app/ConnectGate';
import { useDashboardContext } from '@/app/dashboard-context';
import KeysView from './components/KeysView';
import { useModelPopularity } from '@/app/useModelPopularity';

export default function KeysRoute() {
  const { workspace, models: configuredModels, token } = useDashboardContext();
  const ranked = useModelPopularity(configuredModels, token, workspace?.organization_id, workspace?.id);
  return <ConnectGate>
    {({ token, session }) => <KeysView
      key={`${token}:${workspace?.id ?? ''}`}
      token={token}
      models={ranked.models.map(model => model.id)}
      initialScope={workspace ? { organizationId: workspace.organization_id, projectId: workspace.id } : null}
      canWrite={session?.permissions.write === true}
    />}
  </ConnectGate>;
}
