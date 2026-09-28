import { useConsoleContext } from '@/app/console-context';
import ConnectGate from '@/app/ConnectGate';
import GatewayActivity from '@/features/executions/components/GatewayActivity';

export default function ActivityRoute() {
  const { workspace } = useConsoleContext();
  const scope = workspace ? { organizationId: workspace.organization_id, projectId: workspace.id } : null;
  return <ConnectGate>
    {({ token, models }) => <GatewayActivity
      key={`${token}:${workspace?.id ?? ''}`}
      token={token}
      models={models.map(model => model.id)}
      initialScope={scope}
      statisticsOnly
    />}
  </ConnectGate>;
}
