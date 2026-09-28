import { Activity, ArrowRight, KeyRound, MessageSquareText, Network } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import ConnectPrompt from '@/components/ConnectPrompt';
import GatewayActivity from '@/features/executions/components/GatewayActivity';
import { useConsoleContext } from '@/app/console-context';

const steps = [
  { label: 'Providers', detail: 'Add a model route', to: 'vendors', icon: Network },
  { label: 'API keys', detail: 'Scope access', to: 'keys', icon: KeyRound },
  { label: 'Playground', detail: 'Compare models', to: 'playground', icon: MessageSquareText },
  { label: 'Activity', detail: 'Track usage', to: 'executions', icon: Activity },
];

export default function OverviewRoute() {
  const { token, workspace, draftToken, setDraftToken, models, error, connect } = useConsoleContext();
  const scope = workspace ? { organizationId: workspace.organization_id, projectId: workspace.id } : null;
  const primaryPath = models.length > 1 ? 'playground' : 'vendors';
  const primaryLabel = models.length > 1 ? 'Compare models' : models.length === 1 ? 'Add model route' : 'Connect provider';
  return <>
    <div className="page-heading cost-home-heading">
      <div>
        <p className="page-subtitle">Compare models and track every request.</p>
      </div>
      <div className="overview-primary-actions">
        <Button asChild><Link to={primaryPath}><MessageSquareText />{primaryLabel}</Link></Button>
        <Button asChild variant="outline"><Link to="keys"><KeyRound />Create API key</Link></Button>
      </div>
    </div>

    <nav className="cost-workflow" aria-label="Get started">
      {steps.map(({ label, detail, to, icon: Icon }, index) => <Link className="cost-workflow-step" key={to} to={to}>
        <span className="cost-workflow-index">{index + 1}</span>
        <Icon aria-hidden="true" size={17} />
        <span className="cost-workflow-copy"><strong>{label}</strong><small>{detail}</small></span>
        <ArrowRight aria-hidden="true" size={15} />
      </Link>)}
    </nav>

    <section className="cost-workbench" aria-label="Recent gateway activity">
      {token ? <GatewayActivity compact key={`${token}:${workspace?.id ?? ''}`} token={token} models={models.map(model => model.id)} initialScope={scope} /> : <div className="cost-connect panel">
        <div><h2>Connect to your Niu workspace</h2><p>Sign in to manage models, keys, and request activity.</p></div>
        <ConnectPrompt draft={draftToken} error={error} onChange={setDraftToken} onSubmit={connect} />
      </div>}
    </section>
  </>;
}
