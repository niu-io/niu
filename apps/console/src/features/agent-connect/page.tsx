import ConnectGate from '@/app/ConnectGate';
import { useConsoleContext } from '@/app/console-context';
import PageHeader from '@/components/PageHeader';
import AgentConnectView from './components/AgentConnectView';

export default function AgentConnectPage() {
  const { workspace, workspaceLoading } = useConsoleContext();
  return <ConnectGate subtitle="Set up a model route or collect agent activity.">
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
        : <><PageHeader subtitle="Choose a workspace before creating project-scoped credentials." /><section className="panel agent-connect-empty" role="status">Use the workspace switcher to choose or create a workspace.</section></>}
  </ConnectGate>;
}
