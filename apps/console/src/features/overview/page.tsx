import { ArrowRight, KeyRound, MessageSquareText, Network, CodeXml } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/PageHeader';
import ConnectPrompt from '@/components/ConnectPrompt';
import GatewayActivity from '@/features/executions/components/GatewayActivity';
import { useConsoleContext } from '@/app/console-context';

const steps = [
  { label: 'Connect a provider', detail: 'Add a provider and model route', to: 'vendors', icon: Network },
  { label: 'Create a workspace API key', detail: 'Grant access to selected model aliases', to: 'keys/new', icon: KeyRound },
  { label: 'Compare model routes', detail: 'Send one prompt to multiple models', to: 'playground', icon: MessageSquareText },
  { label: 'Use the key in your app', detail: 'Copy an SDK request and Niu base URL', to: 'keys', icon: CodeXml },
];

export default function OverviewRoute() {
  const { token, workspace, models } = useConsoleContext();
  const scope = workspace ? { organizationId: workspace.organization_id, projectId: workspace.id } : null;
  return <>
    <PageHeader title="Overview" action={<div className="overview-primary-actions">{models.length
      ? <Button asChild><Link to="playground"><MessageSquareText />Compare models</Link></Button>
      : <Button asChild><Link to="vendors"><Network />Connect provider</Link></Button>}<Button asChild variant="outline"><Link to="keys"><KeyRound />API keys</Link></Button></div>} className="cost-home-heading" />

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
        <ConnectPrompt />
      </div>}
    </section>
  </>;
}
