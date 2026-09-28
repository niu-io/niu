import { Activity, ArrowRight, KeyRound, MessageSquareText, Boxes } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/PageHeader';
import ConnectPrompt from '@/components/ConnectPrompt';
import GatewayActivity from '@/features/executions/components/GatewayActivity';
import { useConsoleContext } from '@/app/console-context';

const steps = [
  { label: 'Explore models', detail: 'Find a model for your application', to: 'models', icon: Boxes },
  { label: 'Create a workspace API key', detail: 'Limit access to the routes this app needs', to: 'keys', icon: KeyRound },
  { label: 'Test the same prompt', detail: 'Compare responses in Chat', to: 'playground', icon: MessageSquareText },
  { label: 'Review usage', detail: 'Track requests, tokens and performance', to: 'usage', icon: Activity },
];

export default function OverviewRoute() {
  const { token, workspace, draftToken, setDraftToken, models, error, connect } = useConsoleContext();
  const scope = workspace ? { organizationId: workspace.organization_id, projectId: workspace.id } : null;
  return <>
    <PageHeader title="Overview" action={<div className="overview-primary-actions">{models.length
      ? <Button asChild><Link to="playground"><MessageSquareText />Open Chat</Link></Button>
      : <Button asChild><Link to="models"><Boxes />Explore models</Link></Button>}<Button asChild variant="outline"><Link to="keys"><KeyRound />API keys</Link></Button></div>} className="cost-home-heading" />

    <nav className="cost-workflow" aria-label="Gateway workflow">
      {steps.map(({ label, detail, to, icon: Icon }, index) => <Link className="cost-workflow-step" key={to} to={to}>
        <span className="cost-workflow-index">{index + 1}</span>
        <Icon aria-hidden="true" size={17} />
        <span className="cost-workflow-copy"><strong>{label}</strong><small>{detail}</small></span>
        <ArrowRight aria-hidden="true" size={15} />
      </Link>)}
      </nav>

    <section className="cost-workbench" aria-label="Recent gateway requests">
      {token ? <GatewayActivity compact key={`${token}:${workspace?.id ?? ''}`} token={token} models={models.map(model => model.id)} initialScope={scope} /> : <div className="cost-connect panel">
        <ConnectPrompt draft={draftToken} error={error} onChange={setDraftToken} onSubmit={connect} />
      </div>}
    </section>
  </>;
}
