import ConnectGate from '@/app/ConnectGate';
import KeysView from './components/KeysView';

export default function KeysRoute() {
  return <ConnectGate title="API keys" subtitle="Manage organizations, projects and client keys.">
    {({ token, models, session }) => <KeysView
      key={token}
      token={token}
      models={models.map(model => model.id)}
      canWrite={session?.permissions.write === true}
      canCreateOrganization={session?.kind === 'installation'}
      canCreateProject={session?.permissions.write === true && (session.kind === 'installation' || (session.kind === 'operator' && session.operator?.project_id === null))}
    />}
  </ConnectGate>;
}
