import { Link } from 'react-router';
import { Activity, ArrowRight, Boxes, ChartNoAxesCombined, FlaskConical, Network } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ConnectPrompt from '@/components/ConnectPrompt';
import WorkflowCard from './components/WorkflowCard';
import GatewayActivity from '@/features/executions/components/GatewayActivity';
import { useConsoleContext } from '@/app/console-context';

export default function OverviewRoute() {
  const { token, session, draftToken, setDraftToken, models, health, error, connect } = useConsoleContext();
  const scope = session?.operator?.project_id ? { organizationId: session.operator.organization_id, projectId: session.operator.project_id } : null;
  return <>
    <div className="page-heading cost-home-heading"><div>
      <h1>Better outcomes.<br/>Less time. Lower cost.</h1>
      <p className="page-subtitle">Understand the cost of completing a task. Compare models against the same quality bar, then decide where to spend and where to save.</p>
    </div></div>
    <div className="cost-workflow" aria-label="Cost optimization workflow">
      <WorkflowCard icon={Activity} title="Understand the work" detail="Inspect a task, its agent attempts, model and tool steps, and the evidence behind its time and cost." action="Inspect tasks" to="executions" />
      <WorkflowCard icon={FlaskConical} title="Compare the outcomes" detail="Compare matched task evidence by quality, latency and cost per accepted result—not just token price." action="Open benchmarks" to="benchmarks" />
      <WorkflowCard icon={ChartNoAxesCombined} title="Control the spend" detail="Review recorded project charges and budgets. Keep actual charges separate from estimates and unknown costs." action="Open usage & cost" to="usage" />
    </div>
    <section className="cost-workbench" aria-label="Task cost investigation">
      {token ? <GatewayActivity key={token} token={token} models={models.map(model => model.id)} initialScope={scope}/> : <div className="cost-connect panel">
        <div><h2>Sign in to see gateway activity.</h2><p>Niu records model usage, latency and cost for requests sent through its gateway. Configure a provider and issue a project key to get started.</p></div>
        <ConnectPrompt draft={draftToken} error={error} onChange={setDraftToken} onSubmit={connect}/>
      </div>}
    </section>
    <section className="cost-foundation" aria-label="Gateway foundation">
      <div className="foundation-heading"><Network size={22}/><div><h2>The gateway behind the work</h2><p>Model access, provider connections and scoped keys support every cost decision.</p></div></div>
      <div className="foundation-actions"><span>{token ? models.length : health?.model_count ?? '—'} configured model routes</span><Button asChild variant="ghost"><Link to="models"><Boxes size={17}/>Models<ArrowRight size={16}/></Link></Button>{session?.kind === 'installation' && <Button asChild variant="ghost"><Link to="vendors">Manage vendors<ArrowRight size={16}/></Link></Button>}<Button asChild variant="ghost"><Link to="keys">API keys<ArrowRight size={16}/></Link></Button></div>
    </section>
      <p className="cost-roadmap">For multi-call coding-agent tasks, the agent connector adds task identity and tool/outcome events. The gateway already captures every model request automatically.</p>
  </>;
}
