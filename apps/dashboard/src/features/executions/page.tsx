import { useSearchParams } from 'react-router';
import ConnectGate from '@/app/ConnectGate';
import GatewayActivity from './components/GatewayActivity';
import { useDashboardContext } from '@/app/dashboard-context';

export default function ExecutionsRoute() {
  const [params] = useSearchParams();
  const { workspace } = useDashboardContext();
  const scope = workspace ? { organizationId: workspace.organization_id, projectId: workspace.id } : null;
  return <ConnectGate>
    {({ token, models }) => <GatewayActivity
      key={`${token}:${workspace?.id ?? ''}`}
      token={token}
      models={models.map(model => model.id)}
      initialScope={scope}
      preferredModelAlias={params.get('modelAlias') ?? undefined}
      preferredKeyId={params.get('keyId') ?? undefined}
    />}
  </ConnectGate>;
}
