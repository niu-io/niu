import { useLocale as useUILocale } from '@/shell/ui-locale';
import { WorkspaceShellSkeleton } from '@/components/PageSkeletons';
import ConnectGate from '@/shell/ConnectGate';
import OperatorsView from './components/OperatorsView';

export default function OperatorsRoute() {
  const { t: uiT } = useUILocale();
  return <ConnectGate>
    {({ token, session, refreshWorkspace, organization, workspace }) => session
      ? <OperatorsView key={`${token}:${organization?.id}:${workspace?.id}`} initialOrganization={workspace?.organization_id ?? organization?.id} initialWorkspace={workspace?.id} token={token} session={session} refreshWorkspace={refreshWorkspace} />
      : <WorkspaceShellSkeleton label={uiT("Checking session permissions…")} />}
  </ConnectGate>;
}
