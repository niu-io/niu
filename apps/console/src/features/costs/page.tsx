import ConnectGate from '@/app/ConnectGate';
import CostsView from './components/CostsView';
import { useConsoleContext } from '@/app/console-context';

export default function CostsRoute() {
  const { workspace } = useConsoleContext();
  return <ConnectGate subtitle="Inspect project accounting and configured lifetime budgets.">
    {({ token }) => <CostsView key={`${token}:${workspace?.id ?? ''}`} token={token} initialScope={workspace ? { organizationId: workspace.organization_id, projectId: workspace.id } : null} />}
  </ConnectGate>;
}
