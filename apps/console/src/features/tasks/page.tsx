import ConnectGate from '@/app/ConnectGate';
import { useConsoleContext } from '@/app/console-context';
import ExecutionWorkspace from '@/features/executions/components/ExecutionWorkspace';

export default function TasksPage() {
  const { workspace } = useConsoleContext();
  const initialScope = workspace
    ? { organizationId: workspace.organization_id, projectId: workspace.id }
    : null;

  return <ConnectGate>
    {({ token }) => <ExecutionWorkspace token={token} initialScope={initialScope} />}
  </ConnectGate>;
}
