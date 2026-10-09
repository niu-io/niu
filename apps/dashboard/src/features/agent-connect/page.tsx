import ConnectGate from '@/app/ConnectGate';
import { useDashboardContext } from '@/app/dashboard-context';
import AgentConnectView from './components/AgentConnectView';

export default function AgentConnectPage() {
  const { workspace, workspaceLoading } = useDashboardContext();
  return <ConnectGate>
    {({ token, models, session }) => workspaceLoading
      ? <p role="status">Loading workspace…</p>
      : workspace
        ? <AgentConnectView
          key={`${token}:${workspace.id}`}
          token={token}
          workspace={workspace}
          models={models.map(model => model.id)}
          canWrite={session?.permissions.write === true}
        />
        : <section className="panel agent-connect-empty" role="status">Choose a workspace to continue.</section>}
  </ConnectGate>;
}
