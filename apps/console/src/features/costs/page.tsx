import ConnectGate from '@/app/ConnectGate';
import CostsView from './components/CostsView';
import { useConsoleContext } from '@/app/console-context';

export default function CostsRoute() {
  const { workspace } = useConsoleContext();
  return <ConnectGate>
    {({ token, session }) => session?.kind === 'installation' ? <CostsView canWrite={true} key={`${token}:${workspace?.id ?? ''}`} token={token} initialScope={workspace ? { organizationId: workspace.organization_id, projectId: workspace.id } : null} /> : <section className="panel empty-state"><strong>Platform access required</strong><span>Upstream expenses and cost budgets are restricted to installation administrators.</span></section>}
  </ConnectGate>;
}
